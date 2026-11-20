from .local import *  # noqa: F403

DATABASES["default"]["TEST"] = {"NAME": "nexusledger_test"}
DATABASES["default"]["HOST"] = "127.0.0.1"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
MEDIA_ROOT = BASE_DIR / ".test-media"
CELERY_TASK_ALWAYS_EAGER = True
