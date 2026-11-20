"""Non-interactive administrator bootstrap used by hosts without a shell (start.sh on Render)."""
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

ENV = {"AP_ADMIN_USERNAME": "owner", "AP_ADMIN_EMAIL": "owner@example.test", "AP_ADMIN_PASSWORD": "Deploy-Pass-2026!"}


class CreateAdminNoInputTests(TestCase):
    def test_creates_active_admin_from_environment(self):
        with mock.patch.dict("os.environ", ENV):
            call_command("create_ap_admin", "--no-input", stdout=StringIO())
        user = get_user_model().objects.get(username="owner")
        self.assertEqual(user.role, "ADMIN")
        self.assertTrue(user.is_active)
        self.assertTrue(user.check_password(ENV["AP_ADMIN_PASSWORD"]))

    def test_if_missing_is_a_no_op_once_an_admin_exists(self):
        with mock.patch.dict("os.environ", ENV):
            call_command("create_ap_admin", "--no-input", stdout=StringIO())
            out = StringIO()
            call_command("create_ap_admin", "--no-input", "--if-missing", stdout=out)
        self.assertIn("nothing to do", out.getvalue())
        self.assertEqual(get_user_model().objects.filter(role="ADMIN").count(), 1)

    def test_without_if_missing_an_existing_admin_is_still_an_error(self):
        with mock.patch.dict("os.environ", ENV):
            call_command("create_ap_admin", "--no-input", stdout=StringIO())
            with self.assertRaises(CommandError):
                call_command("create_ap_admin", "--no-input", stdout=StringIO())

    def test_requires_password(self):
        with mock.patch.dict("os.environ", {**ENV, "AP_ADMIN_PASSWORD": ""}):
            with self.assertRaises(CommandError):
                call_command("create_ap_admin", "--no-input", stdout=StringIO())

    def test_weak_password_is_rejected_with_a_readable_reason(self):
        with mock.patch.dict("os.environ", {**ENV, "AP_ADMIN_USERNAME": "admin", "AP_ADMIN_PASSWORD": "admin123"}):
            with self.assertRaises(CommandError) as raised:
                call_command("create_ap_admin", "--no-input", stdout=StringIO())
        message = str(raised.exception)
        self.assertIn("AP_ADMIN_PASSWORD was rejected", message)
        self.assertIn("at least 12 characters", message)
        self.assertFalse(get_user_model().objects.filter(username="admin").exists())
