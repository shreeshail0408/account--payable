from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import *

router = DefaultRouter()
router.register("vendors", VendorViewSet, basename="vendor")
router.register("purchase-orders", POViewSet, basename="purchaseorder")
router.register("grns", GRNViewSet, basename="grn")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("approval-rules", ApprovalRuleViewSet, basename="approvalrule")
router.register("approvals", ApprovalViewSet, basename="approval")
router.register("payments", PaymentViewSet, basename="payment")
router.register("audit-logs", AuditLogViewSet, basename="auditlog")
router.register("vendor-onboardings", VendorOnboardingViewSet, basename="vendoronboarding")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("integration-deliveries", IntegrationDeliveryViewSet, basename="integrationdelivery")
router.register("inbound-emails", InboundEmailViewSet, basename="inboundemail")

urlpatterns = [
    path("auth/register/", register),
    path("employees/", employees),
    path("employees/<int:pk>/activation/", employee_activation),
    path("employees/<int:pk>/reset-password/", employee_reset_password),
    path("auth/login/", APTokenView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("health/", health),
    path("auth/me/", me),
    path("auth/change-password/", ChangePasswordView.as_view()),
    path("dashboard/", dashboard),
    path("integrations/status/", integration_status),
    path("reports/", reports),
    path("", include(router.urls)),
]
