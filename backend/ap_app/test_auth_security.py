from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import AuditLog

User = get_user_model()
PASSWORD = "Correct-Horse-2026!"


@override_settings(LOGIN_LOCKOUT_ATTEMPTS=3, LOGIN_LOCKOUT_MINUTES=15)
class AuthSecurityTests(TestCase):
    def setUp(self):
        cache.clear()  # per-IP throttle counters
        self.client = APIClient()
        self.admin = User.objects.create_user("boss", email="boss@x.test", password=PASSWORD, role="ADMIN")

    def login(self, username, password):
        return self.client.post("/api/auth/login/", {"username": username, "password": password}, format="json")

    def bearer(self, access):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        return client

    def create_employee(self, username="newclerk", password="Temp-Admin-Chosen-91"):
        admin = self.bearer(self.login("boss", PASSWORD).data["access"])
        created = admin.post("/api/employees/", {
            "username": username, "email": f"{username}@x.test", "password": password, "role": "AP_CLERK",
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        admin.patch(f"/api/employees/{created.data['id']}/activation/", {"is_active": True}, format="json")
        return admin, created.data

    def test_new_employee_must_change_password_before_using_the_api(self):
        _, created = self.create_employee()
        self.assertTrue(created["must_change_password"])
        session = self.login("newclerk", "Temp-Admin-Chosen-91")
        self.assertEqual(session.status_code, 200)
        self.assertTrue(session.data["user"]["must_change_password"])
        client = self.bearer(session.data["access"])
        blocked = client.get("/api/invoices/")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.data["code"], "password_change_required")
        self.assertEqual(client.get("/api/auth/me/").status_code, 200)

        changed = client.post("/api/auth/change-password/", {
            "current_password": "Temp-Admin-Chosen-91", "new_password": "My-Own-Secret-7731",
        }, format="json")
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertFalse(changed.data["user"]["must_change_password"])
        self.assertEqual(self.bearer(changed.data["access"]).get("/api/invoices/").status_code, 200)
        # The old refresh token was revoked.
        refreshed = self.client.post("/api/auth/refresh/", {"refresh": session.data["refresh"]}, format="json")
        self.assertEqual(refreshed.status_code, 401)
        self.assertTrue(AuditLog.objects.filter(action="password.changed", details__was_required=True).exists())

    def test_change_password_validates_current_and_new(self):
        client = self.bearer(self.login("boss", PASSWORD).data["access"])
        wrong = client.post("/api/auth/change-password/", {"current_password": "nope", "new_password": "Another-Strong-4821"}, format="json")
        self.assertEqual(wrong.status_code, 400)
        self.assertIn("current_password", wrong.data)
        weak = client.post("/api/auth/change-password/", {"current_password": PASSWORD, "new_password": "short"}, format="json")
        self.assertEqual(weak.status_code, 400)
        self.assertIn("new_password", weak.data)
        same = client.post("/api/auth/change-password/", {"current_password": PASSWORD, "new_password": PASSWORD}, format="json")
        self.assertEqual(same.status_code, 400)
        self.assertTrue(User.objects.get(username="boss").check_password(PASSWORD))

    def test_account_locks_after_repeated_failures_and_unlocks_after_the_window(self):
        self.assertEqual(self.login("boss", "wrong-1").status_code, 401)
        self.assertEqual(self.login("boss", "wrong-2").status_code, 401)
        third = self.login("boss", "wrong-3")
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["code"], "account_locked")
        # Even the right password is refused while locked.
        self.assertEqual(self.login("boss", PASSWORD).status_code, 429)
        User.objects.filter(username="boss").update(locked_until=timezone.now() - timedelta(seconds=1))
        ok = self.login("boss", PASSWORD)
        self.assertEqual(ok.status_code, 200)
        boss = User.objects.get(username="boss")
        self.assertEqual(boss.failed_login_attempts, 0)
        self.assertIsNone(boss.locked_until)
        self.assertIsNotNone(boss.last_login)

    def test_sign_ins_are_audited_including_unknown_usernames(self):
        self.login("boss", PASSWORD)
        self.login("boss", "wrong")
        self.login("ghost", "whatever")
        self.assertTrue(AuditLog.objects.filter(action="login.succeeded", entity_id=self.admin.id).exists())
        self.assertTrue(AuditLog.objects.filter(action="login.failed", entity_id=self.admin.id, details__attempts=1).exists())
        unknown = AuditLog.objects.get(action="login.failed", entity_id=0)
        self.assertEqual(unknown.details["username"], "ghost")
        self.assertFalse(AuditLog.objects.filter(details__icontains="wrong").exists())

    def test_admin_reset_issues_temporary_password_and_unlocks(self):
        admin, created = self.create_employee()
        User.objects.filter(pk=created["id"]).update(
            locked_until=timezone.now() + timedelta(minutes=10), failed_login_attempts=3, must_change_password=False,
        )
        reset = admin.post(f"/api/employees/{created['id']}/reset-password/")
        self.assertEqual(reset.status_code, 200, reset.data)
        self.assertEqual(reset["Cache-Control"], "no-store")
        temporary = reset.data["temporary_password"]
        self.assertGreaterEqual(len(temporary), 12)
        self.assertTrue(reset.data["employee"]["must_change_password"])
        self.assertFalse(reset.data["employee"]["is_locked"])
        session = self.login("newclerk", temporary)
        self.assertEqual(session.status_code, 200)
        self.assertTrue(session.data["user"]["must_change_password"])
        log = AuditLog.objects.get(action="employee.password_reset")
        self.assertNotIn(temporary, str(log.details))

    def test_only_admins_reset_and_not_their_own_account(self):
        admin, created = self.create_employee()
        self.assertEqual(admin.post(f"/api/employees/{self.admin.id}/reset-password/").status_code, 400)
        clerk = User.objects.create_user("clerk2", password=PASSWORD, role="AP_CLERK")
        clerk_client = self.bearer(self.login("clerk2", PASSWORD).data["access"])
        self.assertEqual(clerk_client.post(f"/api/employees/{created['id']}/reset-password/").status_code, 403)
        self.assertEqual(admin.post("/api/employees/999999/reset-password/").status_code, 404)
        self.assertTrue(clerk.check_password(PASSWORD))

    def test_employee_list_shows_last_sign_in(self):
        admin = self.bearer(self.login("boss", PASSWORD).data["access"])
        rows = admin.get("/api/employees/").data
        boss = next(row for row in (rows.get("results", rows) if isinstance(rows, dict) else rows) if row["username"] == "boss")
        self.assertIsNotNone(boss["last_login"])
        self.assertFalse(boss["is_locked"])
