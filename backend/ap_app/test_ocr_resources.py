import shutil
import tempfile
from pathlib import Path
from unittest import mock

from django.test import SimpleTestCase, TestCase
from PIL import Image
from rest_framework.test import APIClient

from . import services

SAMPLE = Path(__file__).resolve().parents[2] / "docs" / "assets" / "sample-invoice.png"
HAS_TESSERACT = bool(shutil.which("tesseract"))
HAS_POPPLER = bool(shutil.which("pdfinfo"))


class HealthEndpointTests(TestCase):
    def test_health_is_public_and_checks_the_database(self):
        response = APIClient().get("/api/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"status": "ok"})


class OcrResourceTests(SimpleTestCase):
    """OCR must stay within small-host memory: one page at a time, grayscale, bounded size."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def seen_by_tesseract(self, path):
        seen = []

        def fake_image_to_data(image, **kwargs):
            seen.append((image.mode, image.size))
            return {"text": ["Invoice"], "conf": ["90"], "block_num": [1], "par_num": [1], "line_num": [1]}

        with mock.patch.object(services.pytesseract, "image_to_data", side_effect=fake_image_to_data), \
                mock.patch.object(services.shutil, "which", return_value="/usr/bin/tesseract"):
            text, accuracy = services.extract_ocr(str(path))
        return seen, text, accuracy

    def test_jpeg_photos_are_accepted(self):
        photo = self.tmp / "invoice.jpg"
        Image.new("RGB", (1200, 1600), "white").save(photo, quality=85)
        seen, text, _ = self.seen_by_tesseract(photo)
        self.assertEqual(len(seen), 1)
        self.assertIn("Invoice", text)

    def test_large_photos_are_grayscale_and_scaled_down(self):
        photo = self.tmp / "huge.png"
        Image.new("RGB", (6000, 8000), "white").save(photo)
        seen, _, _ = self.seen_by_tesseract(photo)
        mode, size = seen[0]
        self.assertEqual(mode, "L")
        self.assertLessEqual(max(size), services.OCR_MAX_SIDE_PX)

    @mock.patch("pdf2image.pdfinfo_from_path", return_value={"Pages": 3})
    def test_pdf_pages_are_rendered_one_at_a_time(self, _info):
        calls = []

        def fake_convert(path, **kwargs):
            calls.append((kwargs["first_page"], kwargs["last_page"], kwargs.get("grayscale")))
            return [Image.new("L", (1654, 2339), 255)]

        pdf = self.tmp / "three.pdf"
        pdf.write_bytes(b"%PDF-1.4")
        with mock.patch("pdf2image.convert_from_path", side_effect=fake_convert):
            seen, text, _ = self.seen_by_tesseract(pdf)
        self.assertEqual(calls, [(1, 1, True), (2, 2, True), (3, 3, True)])
        self.assertEqual(len(seen), 3)
        self.assertIn("[Page 3]", text)

    def test_too_many_pages_is_refused_before_rendering(self):
        pdf = self.tmp / "long.pdf"
        pdf.write_bytes(b"%PDF-1.4")
        with mock.patch("pdf2image.pdfinfo_from_path", return_value={"Pages": services.OCR_MAX_PAGES + 1}), \
                mock.patch("pdf2image.convert_from_path") as convert, \
                mock.patch.object(services.shutil, "which", return_value="/usr/bin/tesseract"):
            with self.assertRaises(RuntimeError):
                services.extract_ocr(str(pdf))
        convert.assert_not_called()

    def test_real_ocr_of_the_sample_invoice_still_reads_the_invoice_number(self):
        if not HAS_TESSERACT:
            self.skipTest("Tesseract is not installed")
        text, accuracy = services.extract_ocr(str(SAMPLE))
        self.assertIn("SAMPLE-INV-001", text)
        self.assertGreater(accuracy, 50)
