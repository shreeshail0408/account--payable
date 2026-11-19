import os
from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.conf import settings
from django.utils import timezone
from decimal import Decimal
from ap_app.models import Vendor, PurchaseOrder, Invoice, ApprovalRule

class Command(BaseCommand):
    help = "Create demo users and sample accounts payable records"
    def handle(self, *args, **options):
        if not settings.DEBUG or os.getenv("AP_ALLOW_DEMO_SEED") != "true":
            raise CommandError("Demo seeding is disabled. Use only a local DEBUG database with AP_ALLOW_DEMO_SEED=true.")
        admin_password = os.getenv("DEMO_ADMIN_PASSWORD", "")
        approver_password = os.getenv("DEMO_APPROVER_PASSWORD", "")
        if not admin_password or not approver_password:
            raise CommandError("Set DEMO_ADMIN_PASSWORD and DEMO_APPROVER_PASSWORD in the local environment before seeding.")
        User = get_user_model()
        admin, created = User.objects.get_or_create(username="admin", defaults={"role":"ADMIN","email":"admin@example.com","is_staff":True,"is_superuser":True})
        if created:
            admin.set_password(admin_password)
            admin.save()
        elif admin.role != "ADMIN":
            raise CommandError("Existing 'admin' username is not an administrator; no account was changed.")
        approver, created = User.objects.get_or_create(username="approver", defaults={"role":"APPROVER","email":"approver@example.com"})
        if created:
            approver.set_password(approver_password)
            approver.save()
        elif approver.role != "APPROVER":
            raise CommandError("Existing 'approver' username has a different role; no account was changed.")
        vendor, _ = Vendor.objects.get_or_create(code="VEND-001", defaults={"name":"Acme Supplies","email":"billing@acme.test","gstin":"29ABCDE1234F1Z5","bank_name":"Demo Bank","bank_account":"1234567890","ifsc":"DEMO0001234","status":"ACTIVE"})
        po, _ = PurchaseOrder.objects.get_or_create(number="PO-2026-001", defaults={"vendor":vendor,"order_date":timezone.localdate(),"total_amount":Decimal("50000"),"status":"OPEN"})
        rule, _ = ApprovalRule.objects.get_or_create(name="Standard approval", defaults={"min_amount":Decimal("0"),"max_amount":Decimal("100000"),"role":approver,"sequence":1,"escalation_hours":24})
        self.stdout.write(self.style.SUCCESS("Local demo records are ready. No existing account passwords were changed."))
