from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication

# Endpoints a user who must change their password can still call.
PASSWORD_CHANGE_ALLOWED_SUFFIXES = ("/auth/me/", "/auth/change-password/")


class PasswordChangeRequired(PermissionDenied):
    default_code = "password_change_required"

    def __init__(self):
        super().__init__({
            "detail": "Choose a new password before continuing.",
            "code": self.default_code,
        })


class APJWTAuthentication(JWTAuthentication):
    """JWT auth that holds accounts with an administrator-set password at the change-password step."""

    def authenticate(self, request):
        result = super().authenticate(request)
        if result is None:
            return None
        user = result[0]
        if user.must_change_password and not request.path.endswith(PASSWORD_CHANGE_ALLOWED_SUFFIXES):
            raise PasswordChangeRequired()
        return result


try:  # Keep the bearer-token "Authorize" button in Swagger (/api/docs/).
    from drf_spectacular.contrib.rest_framework_simplejwt import SimpleJWTScheme

    class APJWTScheme(SimpleJWTScheme):
        target_class = "ap_app.authentication.APJWTAuthentication"
except ImportError:  # pragma: no cover - drf-spectacular is in requirements.txt
    pass
