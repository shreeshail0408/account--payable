"""Startup safety checks used by settings.py (kept import-free of Django so settings can call them)."""

# Placeholder or framework-default keys that must never be used outside local development.
DEV_SECRET_KEYS = frozenset({
    "replace-with-a-random-secret",  # backend/.env.example placeholder
    "change-me",
    "changeme",
    "secret",
    "dev",
    "development",
})


class InsecureSettingsError(RuntimeError):
    pass


def is_dev_secret_key(secret_key):
    key = (secret_key or "").strip()
    return not key or key.lower() in DEV_SECRET_KEYS or key.startswith("django-insecure-")


def check_secret_key(secret_key, debug):
    """Refuse to start with DEBUG off and an empty, placeholder, or Django dev-default secret key."""
    if not debug and is_dev_secret_key(secret_key):
        raise InsecureSettingsError(
            "Refusing to start: DJANGO_DEBUG=false requires a unique DJANGO_SECRET_KEY. "
            "The current value is empty or a development placeholder."
        )
