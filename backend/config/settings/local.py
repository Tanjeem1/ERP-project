from .base import *  # noqa: F403

DEBUG = True
SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "local-only-secret-key")
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "testserver"]
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SIMPLE_JWT["AUTH_COOKIE_SECURE"] = False
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
