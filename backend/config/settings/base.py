"""Settings shared by every environment. Environment-specific files import * from here."""

from datetime import timedelta
from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "django_filters",
    "drf_spectacular",
    "corsheaders",
    "simple_history",
]

# Domain apps, ordered by dependency (each may only depend on apps above it).
LOCAL_APPS = [
    "baho.core",
    "baho.organization",
    "baho.accounts",
    "baho.farmers",
    "baho.inventory",
    "baho.reception",
    "baho.finance",
    "baho.labor",
    "baho.processing",
    "baho.drymill",
    "baho.sales",
    "baho.transfers",
    "baho.reporting",
    "baho.imports",
    "baho.notifications",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "simple_history.middleware.HistoryRequestMiddleware",
    # Last, so a replayed write returns before any view work (see baho.core.idempotency).
    "baho.core.idempotency.IdempotencyMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

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

DATABASES = {"default": env.db("DATABASE_URL")}
DATABASES["default"]["ATOMIC_REQUESTS"] = False  # services use explicit transaction.atomic
DATABASES["default"]["CONN_MAX_AGE"] = 60

AUTH_USER_MODEL = "accounts.User"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Africa/Kigali"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"

# --- API ---------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",  # browsable API / admin
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "baho.core.pagination.StandardPagination",
    "PAGE_SIZE": 50,
    # Login is throttled per client IP and per email (see baho.accounts.throttles).
    "DEFAULT_THROTTLE_RATES": {
        "login_ip": env("THROTTLE_LOGIN_IP", default="30/min"),
        "login_email": env("THROTTLE_LOGIN_EMAIL", default="10/hour"),
        "password_change": env("THROTTLE_PASSWORD_CHANGE", default="10/hour"),
    },
    # How many reverse proxies sit in front of Django (Caddy -> Nginx in production).
    # Used to read the real client IP from X-Forwarded-For for throttling.
    "NUM_PROXIES": env.int("DJANGO_NUM_PROXIES", default=None),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Baho Coffee IMS API",
    "DESCRIPTION": "Cherry reception, CWS processing, HQ dry mill, export and finance.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
}

CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=[])
# The Android app (Capacitor) runs on https://localhost and calls the API cross-origin.
CORS_ALLOWED_ORIGINS += [
    o
    for o in env.list("MOBILE_APP_ORIGINS", default=["https://localhost", "capacitor://localhost"])
    if o not in CORS_ALLOWED_ORIGINS
]
CORS_URLS_REGEX = r"^/api/.*$"
CORS_ALLOW_HEADERS = (
    "accept",
    "authorization",
    "content-type",
    "idempotency-key",
    "x-baho-client",
    "x-requested-with",
)
CORS_EXPOSE_HEADERS = ["Idempotent-Replayed"]
# Writes replayed by the offline queue are recognised for this long.
IDEMPOTENCY_TTL_DAYS = 30

# --- Refresh-token cookie ------------------------------------------------------
# The refresh token never reaches JavaScript: it lives in an httpOnly cookie that
# is only sent to the auth endpoints. The short-lived access token is kept in memory.
REFRESH_COOKIE_NAME = "baho_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth/"
REFRESH_COOKIE_SECURE = env.bool("REFRESH_COOKIE_SECURE", default=not DEBUG)
REFRESH_COOKIE_SAMESITE = "Strict"

# --- API docs ---------------------------------------------------------------------
# Swagger/OpenAPI are only served when enabled (on by default in development) and
# then only to staff users outside DEBUG.
API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=DEBUG)

# --- Cache (login throttling) --------------------------------------------------------
# Shared across Gunicorn workers via the database; created by `createcachetable`.
CACHES = {
    "default": {
        "BACKEND": env("CACHE_BACKEND", default="django.core.cache.backends.db.DatabaseCache"),
        "LOCATION": env("CACHE_LOCATION", default="baho_cache"),
    }
}

# --- Logging ------------------------------------------------------------------------
# Everything goes to stdout/stderr so `docker compose logs` shows it.
LOG_LEVEL = env("DJANGO_LOG_LEVEL", default="INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
    "loggers": {
        "django": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "baho": {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False},
    },
}

# --- Error monitoring (optional) ------------------------------------------------------
SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
        traces_sample_rate=env.float("SENTRY_TRACES_SAMPLE_RATE", default=0.0),
        send_default_pii=False,
    )

# --- SMS (notifications app) ---------------------------------------------------------
# "console" logs messages instead of sending; "africastalking" sends through
# Africa's Talking. Messages are always stored in the outbox first.
SMS_BACKEND = env("SMS_BACKEND", default="console")
SMS_SENDER_ID = env("SMS_SENDER_ID", default="")
AFRICASTALKING_USERNAME = env("AFRICASTALKING_USERNAME", default="")
AFRICASTALKING_API_KEY = env("AFRICASTALKING_API_KEY", default="")
AFRICASTALKING_API_URL = env(
    "AFRICASTALKING_API_URL", default="https://api.africastalking.com/version1/messaging"
)
