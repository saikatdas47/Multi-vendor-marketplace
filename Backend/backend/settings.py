"""
Django settings for CommerceX - multi-vendor e-commerce platform.

Every deployment-specific value lives in `.env`; this file only reads and types
it. Nothing secret, and no environment-dependent constant, is hardcoded here.
Secrets are `env_required` so a missing one is a loud startup crash rather than
a silent fallback to a wrong value.
"""

import os
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from urllib.parse import parse_qsl, unquote, urlparse

import cloudinary
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent


ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    load_dotenv(ENV_FILE)
else:
    # On Render (and other platforms), environment variables are set directly.
    # No .env file needed.
    pass

# ----------------------------------------------------------- env helpers


def env(key, default=None):
    value = os.getenv(key)
    return default if value is None or value == "" else value


def env_required(key):
    """For values that must never be guessed - secrets, database identity."""
    value = os.getenv(key)
    if not value:
        raise ImproperlyConfigured(
            f"{key} is missing or empty in {ENV_FILE}. See .env.example."
        )
    return value


def env_bool(key, default=False):
    return str(env(key, default)).lower() in ("1", "true", "yes", "on")


def env_int(key, default):
    try:
        return int(env(key, default))
    except (TypeError, ValueError):
        raise ImproperlyConfigured(f"{key} in {ENV_FILE} must be an integer.")


def env_decimal(key, default):
    try:
        return Decimal(str(env(key, default)))
    except Exception:
        raise ImproperlyConfigured(f"{key} in {ENV_FILE} must be a decimal.")


def env_list(key, default=""):
    return [v.strip() for v in str(env(key, default)).split(",") if v.strip()]


# ------------------------------------------------------------------ core

SECRET_KEY = env_required("SECRET_KEY")
DEBUG = env_bool("DEBUG", False)
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

LANGUAGE_CODE = env("LANGUAGE_CODE", "en-us")
TIME_ZONE = env("TIME_ZONE", "UTC")
USE_I18N = True
USE_TZ = True

# ------------------------------------------------------------------ apps

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
]

LOCAL_APPS = [
    "core",
    "accounts",
    "shops",
    "products",
    "cart",
    "orders",
    "notices",
    "messaging",
    "billing",
    "assistant",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS + [
    'cloudinary',
    'cloudinary_storage',
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"
WSGI_APPLICATION = "backend.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
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

# -------------------------------------------------------------- database

# ------------------------------------------------------------------ database

def _database_from_url(url):
    """Parse the single connection string every hosting platform hands out."""
    parsed = urlparse(url)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ImproperlyConfigured(
            f"DATABASE_URL must be a postgres:// URL, got {parsed.scheme!r}."
        )
    options = dict(parse_qsl(parsed.query))
    return {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": unquote(parsed.path.lstrip("/")),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or "5432"),
        "CONN_MAX_AGE": env_int("DB_CONN_MAX_AGE", 60),
        "OPTIONS": options,
    }

DATABASE_URL = env("DATABASE_URL", "")

if DATABASE_URL:
    DATABASES = {"default": _database_from_url(DATABASE_URL)}
else:
    # Local development keeps the explicit variables.
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env_required("DB_NAME"),
            "USER": env_required("DB_USER"),
            "PASSWORD": env("DB_PASSWORD", ""),
            "HOST": env("DB_HOST", "localhost"),
            "PORT": env("DB_PORT", "5432"),
            "CONN_MAX_AGE": env_int("DB_CONN_MAX_AGE", 60),
        }
    }

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": env_int("PASSWORD_MIN_LENGTH", 8)},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ------------------------------------------------------------------- drf

PAGE_SIZE = env_int("PAGE_SIZE", 20)
MAX_PAGE_SIZE = env_int("MAX_PAGE_SIZE", 100)

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_PAGINATION_CLASS": "core.pagination.StandardResultsPagination",
    "PAGE_SIZE": PAGE_SIZE,
    "DEFAULT_FILTER_BACKENDS": (
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ),
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ),
    # Sending mail and calling an LLM both cost real money, so they get
    # their own much tighter buckets.
    "DEFAULT_THROTTLE_RATES": {
        "anon": env("THROTTLE_ANON", "100/hour"),
        "user": env("THROTTLE_USER", "1000/hour"),
        "email": env("THROTTLE_EMAIL", "5/hour"),
        "ai": env("THROTTLE_AI", "20/hour"),
    },
    "EXCEPTION_HANDLER": "rest_framework.views.exception_handler",
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=env_int("JWT_ACCESS_MINUTES", 30)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=env_int("JWT_REFRESH_DAYS", 7)),
    "ROTATE_REFRESH_TOKENS": env_bool("JWT_ROTATE_REFRESH", True),
    "BLACKLIST_AFTER_ROTATION": env_bool("JWT_BLACKLIST_AFTER_ROTATION", True),
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
    "SIGNING_KEY": SECRET_KEY,
}

SPECTACULAR_SETTINGS = {
    "TITLE": env("API_TITLE", "CommerceX API"),
    "DESCRIPTION": "Enterprise multi-vendor e-commerce platform - REST API.",
    "VERSION": env("API_VERSION", "1.0.0"),
    "SERVE_INCLUDE_SCHEMA": False,
    "COMPONENT_SPLIT_REQUEST": True,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "TAGS": [
        {"name": "auth", "description": "Registration, login, tokens"},
        {"name": "profile", "description": "User profiles and addresses"},
        {"name": "catalog", "description": "Public catalogue browsing"},
        {"name": "seller", "description": "Seller dashboard operations"},
        {"name": "reviews", "description": "Product reviews and ratings"},
        {"name": "cart", "description": "Shopping cart"},
        {"name": "orders", "description": "Checkout, orders and tracking"},
        {"name": "wishlist", "description": "Saved products"},
        {"name": "admin", "description": "Platform administration"},
        {"name": "ai", "description": "AI-assisted copywriting and summaries"},
    ],
}

# ------------------------------------------------------------------ cors

FRONTEND_URL = env("FRONTEND_URL", "http://localhost:5173").rstrip("/")
CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", FRONTEND_URL)
CORS_ALLOW_CREDENTIALS = env_bool("CORS_ALLOW_CREDENTIALS", True)
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# ----------------------------------------------------------------- files


# Configure Cloudinary using the URL from environment
cloudinary.config(url=env('CLOUDINARY_URL'))

STATIC_URL = env("STATIC_URL", "static/")
STATIC_ROOT = BASE_DIR / env("STATIC_DIR", "staticfiles")
# STORAGES, not the STATICFILES_STORAGE string — that form is deprecated since
# Django 4.2 and emits a warning on every start under 5.2.

# STORAGES = {
#     "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
#     "staticfiles": {
#         "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
#     },
# }

# #cloudinary migration
# STORAGES = {
#     "default": {
#         "BACKEND": "django.core.files.storage.FileSystemStorage",
#     },
#     "staticfiles": {
#         "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
#     },
# }

STORAGES = {
    "default": {
        "BACKEND": "cloudinary_storage.storage.MediaCloudinaryStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}


MEDIA_URL = env("MEDIA_URL", "media/")
MEDIA_ROOT = BASE_DIR / env("MEDIA_DIR", "media")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

MAX_UPLOAD_BYTES = env_int("MAX_UPLOAD_MB", 10) * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES
FILE_UPLOAD_MAX_MEMORY_SIZE = MAX_UPLOAD_BYTES

# ----------------------------------------------------------------- email

# With no EMAIL_HOST_USER set, mail is printed to the console - so local
# development works out of the box and nobody has to configure SMTP to sign up.
EMAIL_HOST_USER = env("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_SMTP = bool(EMAIL_HOST_USER and EMAIL_HOST_PASSWORD)

EMAIL_BACKEND = (
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_USE_SMTP
    else "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = env("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = env_int("EMAIL_PORT", 587)
EMAIL_USE_TLS = env_bool("EMAIL_USE_TLS", True)
EMAIL_USE_SSL = env_bool("EMAIL_USE_SSL", False)
EMAIL_TIMEOUT = env_int("EMAIL_TIMEOUT", 10)
DEFAULT_FROM_EMAIL = env(
    "DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "no-reply@commercex.local"
)

# Single-use email token lifetimes.
VERIFY_TOKEN_TTL_HOURS = env_int("VERIFY_TOKEN_TTL_HOURS", 48)
RESET_TOKEN_TTL_HOURS = env_int("RESET_TOKEN_TTL_HOURS", 1)

# -------------------------------------------------------------------- ai

GROQ_API_KEY = env("GROQ_API_KEY", "")
GROQ_MODEL = env("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_TIMEOUT = env_int("GROQ_TIMEOUT", 20)
GROQ_MAX_TOKENS = env_int("GROQ_MAX_TOKENS", 400)
# Only reasoning-capable models accept this; sending it elsewhere is a 400.
# Blank disables it entirely.
GROQ_REASONING_EFFORT = env("GROQ_REASONING_EFFORT", "")
AI_ENABLED = bool(GROQ_API_KEY)

# Per-feature ceilings, all tunable without touching code.
AI_DESCRIPTION_MAX_TOKENS = env_int("AI_DESCRIPTION_MAX_TOKENS", 260)
AI_SUMMARY_MAX_TOKENS = env_int("AI_SUMMARY_MAX_TOKENS", 180)
AI_SUMMARY_MAX_REVIEWS = env_int("AI_SUMMARY_MAX_REVIEWS", 25)
AI_SUMMARY_COMMENT_CHARS = env_int("AI_SUMMARY_COMMENT_CHARS", 180)
AI_DESCRIPTION_CACHE_TTL = env_int("AI_DESCRIPTION_CACHE_TTL", 60 * 60 * 24)
AI_SUMMARY_CACHE_TTL = env_int("AI_SUMMARY_CACHE_TTL", 60 * 60 * 6)

# Shopping assistant. History turns bound how large a long conversation's
# prompt can grow; candidates bounds how much catalogue is sent per question.
ASSISTANT_MAX_TOKENS = env_int("ASSISTANT_MAX_TOKENS", 320)
ASSISTANT_HISTORY_TURNS = env_int("ASSISTANT_HISTORY_TURNS", 4)
ASSISTANT_CANDIDATES = env_int("ASSISTANT_CANDIDATES", 8)

CACHES = {
    "default": {
        "BACKEND": env(
            "CACHE_BACKEND", "django.core.cache.backends.locmem.LocMemCache"
        ),
        "LOCATION": env("CACHE_LOCATION", "commercex-cache"),
        "TIMEOUT": env_int("CACHE_TIMEOUT", 300),
    }
}

# ----------------------------------------------------------- marketplace

DEFAULT_COMMISSION_RATE = env_decimal("DEFAULT_COMMISSION_RATE", "10.00")
# Flat monthly platform fee per approved shop. Snapshotted onto each invoice at
# generation, so changing this never rewrites an issued invoice.
PLATFORM_MONTHLY_FEE = env_decimal("PLATFORM_MONTHLY_FEE", "29.00")
DEFAULT_COUNTRY = env("DEFAULT_COUNTRY", "Bangladesh")
CURRENCY = env("CURRENCY", "USD")

# -------------------------------------------------------------- security

if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = env_int("SECURE_HSTS_SECONDS", 31536000)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    X_FRAME_OPTIONS = "DENY"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "{levelname} {asctime} {name} {message}", "style": "{"}
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"}
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
}
