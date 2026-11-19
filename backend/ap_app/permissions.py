from rest_framework.permissions import BasePermission, SAFE_METHODS

class APRolePermission(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        if request.user.role == "ADMIN":
            return True
        role = request.user.role
        action = getattr(view, "action", "")
        resource = getattr(view, "basename", "")

        read_roles = {
            "vendor": {"AP_CLERK", "ACCOUNTANT", "AUDITOR"},
            "purchaseorder": {"AP_CLERK", "AUDITOR"},
            "grn": {"AP_CLERK", "AUDITOR"},
            "invoice": {"AP_CLERK", "APPROVER", "ACCOUNTANT", "AUDITOR"},
            "approvalrule": {"ADMIN"},
            "approval": {"APPROVER", "AUDITOR"},
            "payment": {"ACCOUNTANT", "AUDITOR"},
            "auditlog": {"AUDITOR"},
            "vendoronboarding": {"AP_CLERK", "AUDITOR"},
            "integrationdelivery": set(),
            "inboundemail": {"AUDITOR"},
        }

        if request.method in SAFE_METHODS:
            return role in read_roles.get(resource, set())

        if role == "APPROVER":
            return resource == "approval" and action in ("approve", "reject")

        if role == "AP_CLERK":
            allowed_actions = {
                "vendor": {"create", "update", "partial_update"},
                "purchaseorder": {"create", "update", "partial_update", "destroy"},
                "grn": {"create"},
                "invoice": {
                    "create", "update", "partial_update",
                    "ocr_preview", "bulk", "email", "validate", "submit_approval", "review_extraction",
                },
            }
            return action in allowed_actions.get(resource, set())

        if role == "ACCOUNTANT":
            return (
                (resource == "payment" and action in {"generate", "mark_paid", "mark_failed", "submit_bank"})
                or (resource == "vendor" and action == "verify_gstin")
            )

        return False
