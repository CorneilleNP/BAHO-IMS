from .base import *  # noqa: F403

DEBUG = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # fast tests only
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
SMS_BACKEND = "console"
API_DOCS_ENABLED = True
