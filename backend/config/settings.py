import os
from pathlib import Path

from corsheaders.defaults import default_headers

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

_hosts = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1")
ALLOWED_HOSTS = [host.strip() for host in _hosts.split(",") if host.strip()]

# Stateless API: no auth database and no migrations.
INSTALLED_APPS = [
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "planner",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATIC_ROOT.mkdir(exist_ok=True)
if FRONTEND_DIST.exists():
    WHITENOISE_ROOT = str(FRONTEND_DIST)

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Public compute API with no cookies or user accounts.
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_HEADERS = (*default_headers, "x-review-key")

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.AllowAny"],
    "UNAUTHENTICATED_USER": None,
}

DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

WHITENOISE_INDEX_FILE = True

def _env_file(name: str) -> str:
    path = BASE_DIR.parent / ".env"
    if not path.exists():
        return ""
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        if key.strip() == name:
            return value.strip().strip('"').strip("'")
    return ""


ORS_API_KEY = os.environ.get("ORS_API_KEY", "").strip()
# Read after process env so a local .env key unlocks review edits without a code change.
REVIEW_ADMIN_KEY = os.environ.get("REVIEW_ADMIN_KEY", "").strip() or _env_file("REVIEW_ADMIN_KEY")
REVIEW_STORE = Path(os.environ.get("REVIEW_STORE", "")).expanduser() if os.environ.get("REVIEW_STORE") else BASE_DIR / "data" / "reviews.json"
FEEDBACK_TO = os.environ.get("FEEDBACK_TO", "colbybean321@gmail.com").strip() or "colbybean321@gmail.com"
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = os.environ.get("EMAIL_HOST", "smtp.gmail.com").strip() or "smtp.gmail.com"
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587") or "587")
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", FEEDBACK_TO).strip() or FEEDBACK_TO
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "").strip() or _env_file("EMAIL_HOST_PASSWORD")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "1") != "0"
NOMINATIM_USER_AGENT = os.environ.get(
    "NOMINATIM_USER_AGENT",
    "WeatherAwareTruckRouting/1.0 (spotter assessment)",
)
