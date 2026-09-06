# Deploy Django to Render

> Deploy a Django web application to Render with PostgreSQL, static files, environment variables, and auto-deploy from GitHub.

This guide covers deploying a production-ready Django application to Render's free tier, including database configuration with Neon PostgreSQL, static file serving with WhiteNoise, Gunicorn as the WSGI server, and troubleshooting common deployment issues.

## Prerequisites

- [ ] [Python 3.12+](https://www.python.org/downloads/) installed
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Render account](https://render.com/) (sign up with GitHub)

---

## Step 1: Create a Django Project

```bash
mkdir my-django-app && cd my-django-app
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install django gunicorn whitenoise dj-database-url "psycopg[binary]" python-dotenv
```

Or with [uv](https://docs.astral.sh/uv/) (faster drop-in for venv + pip):

```bash
uv venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install django gunicorn whitenoise dj-database-url "psycopg[binary]" python-dotenv
```

Create the Django project:

```bash
django-admin startproject config .
python manage.py startapp core
```

Your project structure should look like:

```
my-django-app/
  config/
    __init__.py
    settings.py
    urls.py
    wsgi.py
  core/
    __init__.py
    admin.py
    models.py
    views.py
  manage.py
```

---

## Step 2: Configure for Production

Replace `config/settings.py` with production-ready settings:

```python
import os
from pathlib import Path
import dj_database_url
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get("SECRET_KEY", "django-insecure-change-me-in-production")

DEBUG = os.environ.get("DEBUG", "False").lower() in ("true", "1", "yes")

ALLOWED_HOSTS = os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "core",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database
# Use DATABASE_URL in production, SQLite locally
if os.environ.get("DATABASE_URL"):
    DATABASES = {
        "default": dj_database_url.config(
            default=os.environ["DATABASE_URL"],
            conn_max_age=600,
            conn_health_checks=True,
            ssl_require=True,
        )
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files
STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Security settings for production
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    CSRF_TRUSTED_ORIGINS = [
        f"https://{host.strip()}" for host in ALLOWED_HOSTS if host.strip()
    ]
```

---

## Step 3: Create Application Code

Create `core/models.py`:

```python
from django.db import models


class Item(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.name
```

Create `core/views.py`:

```python
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json
from .models import Item


def index(request):
    return JsonResponse({"message": "Django API is running"})


def health(request):
    return JsonResponse({"status": "ok"})


@require_http_methods(["GET"])
def item_list(request):
    items = list(Item.objects.values("id", "name", "description", "created_at"))
    return JsonResponse(items, safe=False)


@csrf_exempt
@require_http_methods(["POST"])
def item_create(request):
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    if not data.get("name"):
        return JsonResponse({"error": "Name is required"}, status=400)
    item = Item.objects.create(name=data["name"], description=data.get("description", ""))
    return JsonResponse(
        {"id": item.id, "name": item.name, "description": item.description},
        status=201,
    )
```

Update `config/urls.py`:

```python
from django.contrib import admin
from django.urls import path
from core import views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.index),
    path("health/", views.health),
    path("api/items/", views.item_list),
    path("api/items/create/", views.item_create),
]
```

Create the static directory so WhiteNoise has something to collect:

```bash
mkdir -p static
touch static/.gitkeep
mkdir -p templates
```

---

## Step 4: Create Deployment Files

Create `requirements.txt`:

```bash
pip freeze > requirements.txt
```

Or manually create a minimal `requirements.txt`:

```
django==6.1.1
gunicorn==26.2.0
whitenoise==6.12.0
dj-database-url==3.1.2
psycopg[binary]==3.3.5
python-dotenv==1.2.3
```

Django 6.1 requires Python 3.12+. If you need the LTS line instead, pin `django==5.2.17` (Django 5.2 LTS, supported to April 2028, runs on Python 3.10-3.14). Django recommends psycopg 3 (`psycopg[binary]`); psycopg2 support is likely to be deprecated in a future release.

Create `build.sh` (Render build script):

```bash
#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
```

Make it executable:

```bash
chmod +x build.sh
```

Create `render.yaml` (optional Infrastructure as Code):

```yaml
services:
  - type: web
    name: my-django-app
    runtime: python
    buildCommand: "./build.sh"
    startCommand: "gunicorn config.wsgi:application --bind 0.0.0.0:$PORT"
    envVars:
      - key: SECRET_KEY
        generateValue: true
      - key: DEBUG
        value: "False"
      - key: ALLOWED_HOSTS
        value: "my-django-app.onrender.com"
      - key: DATABASE_URL
        fromDatabase:
          name: django-db
          property: connectionString
      - key: PYTHON_VERSION
        value: "3.14.3"

databases:
  - name: django-db
    plan: free
```

Note: Render's free Postgres databases expire 30 days after creation (1 GB storage). For anything long-lived, use a paid plan (from $6/month) or a free [Neon](../guides/neon.md) database.

Create `.gitignore`:

```
venv/
__pycache__/
*.pyc
.env
db.sqlite3
staticfiles/
```

Test locally:

```bash
python manage.py migrate
python manage.py runserver
# Open http://localhost:8000
# Test API: curl http://localhost:8000/api/items/
```

---

## Step 5: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-django-app.git
git push -u origin main
```

---

## Step 6: Set Up a Database

### Option A: Render Managed PostgreSQL

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **PostgreSQL**
3. Configure:
   - **Name:** `django-db`
   - **Plan:** Free
4. Copy the **Internal Database URL** (starts with `postgresql://`)

Warning: free Render Postgres databases expire 30 days after creation and your app loses its database. Upgrade to a paid plan (Basic-256mb, $6/month) before the expiry, or use Option B for a free database that does not expire.

### Option B: Neon PostgreSQL

Follow the [Neon guide](../guides/neon.md) to create a free PostgreSQL database and copy the connection string.

---

## Step 7: Deploy to Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `my-django-app`
   - **Runtime:** Python
   - **Build Command:** `./build.sh`
   - **Start Command:** `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`
   - **Instance Type:** Free
5. Add environment variables in the **Environment** tab (see table below)
6. Click **Create Web Service**

Render runs `build.sh`, which installs dependencies, collects static files, and runs migrations. Your app is live at `https://my-django-app.onrender.com`.

Test it:

```bash
curl https://my-django-app.onrender.com/health/
curl https://my-django-app.onrender.com/api/items/
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_KEY` | Django secret key (use Render's "Generate" button) | `a3f8b2c1d4e5...` |
| `DEBUG` | Set to `False` in production | `False` |
| `ALLOWED_HOSTS` | Comma-separated allowed hostnames | `my-django-app.onrender.com` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host/db` |
| `PYTHON_VERSION` | Python version for Render (fully qualified) | `3.14.3` |

### Set on Render

1. Go to your service on Render
2. Click the **Environment** tab
3. Add each variable (use the **Generate** button for `SECRET_KEY`)
4. Click **Save Changes** (triggers redeploy)

---

## Custom Domain

### Step 1: Add Domain in Render

1. Go to your service **Settings** > **Custom Domains**
2. Click **Add Custom Domain**
3. Enter `www.yourdomain.com` or `api.yourdomain.com`

### Step 2: Configure DNS

| Type | Name | Value |
|------|------|-------|
| CNAME | www | `my-django-app.onrender.com` |

### Step 3: Update ALLOWED_HOSTS

Add your custom domain to the `ALLOWED_HOSTS` environment variable on Render:

```
my-django-app.onrender.com,www.yourdomain.com
```

### Step 4: SSL

Render provisions a free SSL certificate automatically once DNS propagates.

---

## Alternative Platforms

### Vercel (zero-config)

Vercel has zero-config Django support: it detects `manage.py`, resolves the entrypoint from `WSGI_APPLICATION`/`ASGI_APPLICATION` in your settings, runs `collectstatic` automatically when `STATIC_ROOT` is set (serving static files from the CDN), and deploys the app as a single Vercel Function on Fluid compute. No adapter package and no `builds`/`routes` config are needed -- just import the repo at [vercel.com](https://vercel.com/).

Optional per-function config goes in `vercel.json` under `functions`, keyed by the entrypoint file:

```json
{
  "functions": {
    "config/wsgi.py": { "maxDuration": 60 }
  }
}
```

Note: the whole app runs as one Function, so Function limitations apply (500 MB standard bundle limit, no long-running background tasks). For Django with persistent workers or scheduled jobs, Render or Railway is a better fit.

### Railway

1. Install the Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`
3. Initialize: `railway init`
4. Add PostgreSQL: `railway add --database postgres`
5. Deploy: `railway up`

Railway auto-detects Django projects and configures the build. Set `ALLOWED_HOSTS` and `SECRET_KEY` in the Railway dashboard.

---

## Troubleshooting

### Problem: Static files return 404 in production

**Cause:** `collectstatic` did not run, or WhiteNoise is not configured.

**Fix:**

1. Verify WhiteNoise is in `MIDDLEWARE` directly after `SecurityMiddleware`:

```python
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    # ... rest of middleware
]
```

2. Ensure `STATIC_ROOT` is set and `collectstatic` runs during build:

```bash
python manage.py collectstatic --no-input
```

3. Check that `build.sh` is executable (`chmod +x build.sh`)

### Problem: Database migrations fail on deploy

**Cause:** `DATABASE_URL` is missing, or the database is not accessible.

**Fix:**

1. Verify `DATABASE_URL` is set in Render's Environment tab
2. If using Render PostgreSQL, use the **Internal Database URL** (not the external one)
3. Check Render logs for the specific migration error
4. Test the connection locally:

```bash
DATABASE_URL="postgresql://..." python manage.py migrate
```

### Problem: CSRF verification failed (403 Forbidden)

**Cause:** Django's CSRF protection blocks requests when `CSRF_TRUSTED_ORIGINS` does not include your domain.

**Fix:** Ensure `CSRF_TRUSTED_ORIGINS` is configured in `settings.py`:

```python
CSRF_TRUSTED_ORIGINS = [
    "https://my-django-app.onrender.com",
    "https://www.yourdomain.com",
]
```

Or derive it dynamically from `ALLOWED_HOSTS` (as shown in the settings above).

### Problem: "DisallowedHost" error

**Cause:** The request's `Host` header is not in `ALLOWED_HOSTS`.

**Fix:** Add your Render URL to the `ALLOWED_HOSTS` environment variable:

```
my-django-app.onrender.com
```

Do not include `https://` -- only the hostname. Separate multiple hosts with commas.

### Problem: collectstatic fails during build

**Cause:** `STATIC_ROOT` is not set, or the `static/` directory is missing, or `SECRET_KEY` is not available at build time.

**Fix:**

1. Ensure `STATIC_ROOT` is set in `settings.py`:

```python
STATIC_ROOT = BASE_DIR / "staticfiles"
```

2. Ensure `SECRET_KEY` is available as an environment variable on Render (Django needs it even during collectstatic)
3. Create at least one file in `static/` so the directory exists in Git:

```bash
mkdir -p static
touch static/.gitkeep
```

### Problem: "ModuleNotFoundError: No module named 'config'"

**Cause:** Gunicorn cannot find your Django project module.

**Fix:** Ensure the start command references the correct WSGI path and that you are running from the project root:

```
gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
```

If your Django project is in a subdirectory, adjust the Render **Root Directory** setting, or add `cd` to your start command.

### Problem: Slow cold start on free tier

**Cause:** Render's free tier spins down after 15 minutes of inactivity.

**Fix:**

1. This is expected on the free tier (30-60 second cold start)
2. Add the `/health/` endpoint for external uptime monitoring
3. Upgrade to Starter ($7/month) for always-on

Note: free web services also share 750 instance hours per workspace per month; when exhausted, all free services are suspended until the next month.
