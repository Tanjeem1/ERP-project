import os
from datetime import timedelta
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parents[2]


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


def env_list(name, default=""):
    return [item.strip() for item in os.environ.get(name, default).split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "local-only-secret-key")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,testserver")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "simple_history",
    "extensions.apps.ExtensionsConfig",
    "core.apps.CoreConfig",
    "inventory.apps.InventoryConfig",
    "procurement.apps.ProcurementConfig",
    "orders.apps.OrdersConfig",
    "finance.apps.FinanceConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "core.middleware.ApiTrailingSlashMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",
    "core.middleware.RequestBodySizeLimitMiddleware",
    "core.middleware.IdempotencyMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default="postgresql://nexusledger:nexusledger@localhost:5432/nexusledger",
        conn_max_age=0,
        conn_health_checks=True,
    )
}
DATABASES["default"].update(
    ATOMIC_REQUESTS=False,
    CONN_MAX_AGE=0,
    DISABLE_SERVER_SIDE_CURSORS=True,
    OPTIONS={
        "connect_timeout": 5,
        "keepalives": 1,
        "keepalives_idle": 30,
        "keepalives_interval": 10,
        "keepalives_count": 5,
        "options": "-c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000",
    },
)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": REDIS_URL,
        "KEY_PREFIX": "nexusledger",
        "VERSION": 1,
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
            "SERIALIZER": "django_redis.serializers.json.JSONSerializer",
            "SOCKET_CONNECT_TIMEOUT": 2,
            "SOCKET_TIMEOUT": 2,
            "IGNORE_EXCEPTIONS": False,
            "CONNECTION_POOL_KWARGS": {"max_connections": 200},
        },
    }
}
SESSION_ENGINE = "django.contrib.sessions.backends.cached_db"

AUTH_USER_MODEL = "core.User"
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SECURE_SSL_REDIRECT = env_bool("DJANGO_SSL_REDIRECT", False)
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_SECURE = env_bool("DJANGO_SECURE_COOKIES", True)
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SECURE = env_bool("DJANGO_SECURE_COOKIES", True)
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "http://localhost:8080")
CORS_ALLOWED_ORIGINS = env_list("DJANGO_CORS_ALLOWED_ORIGINS", "http://localhost:8080")
CORS_ALLOW_CREDENTIALS = True
CORS_URLS_REGEX = r"^/api/.*$"
CORS_ALLOW_METHODS = ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"]
CORS_ALLOW_HEADERS = [*default_headers, "idempotency-key", "x-request-id"]
DATA_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["core.authentication.CachedJWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["drf_orjson_renderer.renderers.ORJSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["drf_orjson_renderer.parsers.ORJSONParser"],
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend", "rest_framework.filters.OrderingFilter"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.CursorPagination",
    "PAGE_SIZE": 50,
    "DEFAULT_THROTTLE_CLASSES": ["core.throttling.RedisRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/minute",
        "user": "1200/minute",
        "register": "5/hour",
        "login": "10/minute",
        "sandbox": "20/hour",
        "demo_request": "5/hour",
        "search": "120/minute",
    },
    "NUM_PROXIES": 1,
    "EXCEPTION_HANDLER": "core.exceptions.exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "TEST_REQUEST_DEFAULT_FORMAT": "json",
}
SPECTACULAR_SETTINGS = {
    "TITLE": "NexusLedger ERP API",
    "DESCRIPTION": "Multi-tenant inventory, procurement, order, collection, POS, and double-entry finance APIs.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api/v1/",
    "APPEND_COMPONENTS": {"securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}}},
    "ENUM_NAME_OVERRIDES": {
        "CurrencyEnum": "core.models.Currency.choices",
        "PaymentMethodEnum": "core.models.PaymentMethod.choices",
        "PaymentAccountMethodEnum": "core.api.PAYMENT_ACCOUNT_CHOICES",
    },
}
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "SIGNING_KEY": SECRET_KEY,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_COOKIE": "nexusledger_refresh",
    "AUTH_COOKIE_SECURE": env_bool("DJANGO_SECURE_COOKIES", True),
    "AUTH_COOKIE_HTTP_ONLY": True,
    "AUTH_COOKIE_SAMESITE": "Lax",
    "AUTH_COOKIE_PATH": "/api/v1/auth/",
}

PUBLIC_APP_URL = os.environ.get("NEXT_PUBLIC_SITE_URL", "http://localhost:3000")

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = REDIS_URL
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TIMEZONE = "UTC"
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 60
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_BROKER_CONNECTION_RETRY_ON_STARTUP = True
CELERY_TASK_ROUTES = {
    "core.tasks.cleanup_sandboxes": {"queue": "maintenance"},
    "core.tasks.cleanup_idempotency_records": {"queue": "maintenance"},
    "core.tasks.monitor_operational_alerts": {"queue": "maintenance"},
    "orders.tasks.render_invoice_pdf": {"queue": "documents"},
    "orders.tasks.render_payment_receipt": {"queue": "documents"},
}
CELERY_BEAT_SCHEDULE = {
    "cleanup-expired-sandboxes": {"task": "core.tasks.cleanup_sandboxes", "schedule": 3600},
    "cleanup-expired-idempotency-records": {"task": "core.tasks.cleanup_idempotency_records", "schedule": 3600},
    "monitor-operational-alerts": {"task": "core.tasks.monitor_operational_alerts", "schedule": 300},
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "django.security": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
