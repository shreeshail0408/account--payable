/*
 * PDF.js is ~1 MB with its worker, so it loads on the first PDF preview only. A failed load is
 * not cached, so the next attempt retries.
 */
let loader = null;

export function loadPdfjs() {
  if (!loader) {
    loader = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
      .then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((error) => {
        loader = null;
        throw error;
      });
  }
  return loader;
}

/** Open a PDF from a File or a URL; returns the PDFDocumentProxy. */
export async function openPdf(source) {
  const pdfjs = await loadPdfjs();
  let buffer;
  if (source.file) {
    buffer = await source.file.arrayBuffer();
  } else {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error(`The invoice file couldn't be downloaded (HTTP ${response.status}).`);
    }
    buffer = await response.arrayBuffer();
  }
  const data = new Uint8Array(buffer);
  return pdfjs.getDocument({ data, isEvalSupported: false }).promise;
}
