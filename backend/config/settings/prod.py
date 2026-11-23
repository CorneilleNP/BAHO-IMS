from .base import *  # noqa: F403
from .base import env

DEBUG = False
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
# Caddy -> Nginx -> Gunicorn: the client IP is the second-to-last X-Forwarded-For entry.
REST_FRAMEWORK["NUM_PROXIES"] = env.int("DJANGO_NUM_PROXIES", default=2)  # noqa: F405
SPECTACULAR_SETTINGS["SERVE_PERMISSIONS"] = ["rest_framework.permissions.IsAdminUser"]  # noqa: F405
# Never derive these from DEBUG: a stray DJANGO_DEBUG must not weaken production.
REFRESH_COOKIE_SECURE = True
API_DOCS_ENABLED = env.bool("API_DOCS_ENABLED", default=False)
