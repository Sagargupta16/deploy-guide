# Deploy Flask to Render

> Deploy a Flask web application to Render with a database, environment variables, and auto-deploy from GitHub.

This guide covers deploying a production-ready Flask application to Render's free tier, including database integration with PostgreSQL or MongoDB, database migrations with Flask-Migrate, Gunicorn as the WSGI server, and troubleshooting common issues.

## Prerequisites

- [ ] [Python 3.10+](https://www.python.org/downloads/) installed (3.12 or 3.13 recommended; 3.9 is EOL and gunicorn 26 requires 3.10+)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Render account](https://render.com/) (sign up with GitHub)

---

## Step 1: Create a Flask App

```bash
mkdir my-flask-app && cd my-flask-app
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install flask gunicorn python-dotenv flask-cors
```

Or with [uv](https://docs.astral.sh/uv/), a faster drop-in alternative to venv and pip:

```bash
uv venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install flask gunicorn python-dotenv flask-cors
```

Create `app.py`:

```python
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")

# CORS -- update origins for your frontend
CORS(app, origins=[os.environ.get("CORS_ORIGIN", "http://localhost:5173")])


@app.route("/")
def index():
    return jsonify({"message": "Flask API is running"})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/items", methods=["GET"])
def get_items():
    return jsonify([
        {"id": 1, "name": "Item One"},
        {"id": 2, "name": "Item Two"},
    ])


@app.route("/api/items", methods=["POST"])
def create_item():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Name is required"}), 400
    return jsonify({"id": 3, "name": data["name"]}), 201


if __name__ == "__main__":
    app.run(debug=True)
```

Create `.gitignore`:

```
venv/
__pycache__/
*.pyc
.env
instance/
*.db
```

Do not gitignore `migrations/` -- Flask-Migrate's migration scripts must be committed so `flask db upgrade` can run on Render during the build.

Test locally:

```bash
flask run
# Open http://localhost:5000
# Test: curl http://localhost:5000/api/items
```

---

## Step 2: Add Database Integration

### Option A: PostgreSQL with SQLAlchemy and Flask-Migrate

Install dependencies:

```bash
pip install flask-sqlalchemy flask-migrate "psycopg[binary]"
```

Psycopg 3 is the current driver for new projects (psycopg2 is maintenance-only). Use the `postgresql+psycopg://` URL scheme so SQLAlchemy picks it up. `psycopg2-binary` with a plain `postgresql://` URL still works if you are maintaining an existing project.

Update `app.py` to include SQLAlchemy and migrations:

```python
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")

# Providers hand you a bare postgresql:// (or legacy postgres://) URL, and
# SQLAlchemy maps postgresql:// to the psycopg2 dialect. Only psycopg 3 is
# installed above, so the scheme has to be rewritten or the first query raises
# ModuleNotFoundError: No module named 'psycopg2'.
database_url = os.environ.get("DATABASE_URL", "sqlite:///app.db")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# CORS
CORS(app, origins=[os.environ.get("CORS_ORIGIN", "http://localhost:5173")])

db = SQLAlchemy(app)
migrate = Migrate(app, db)


# Models
class Item(db.Model):
    __tablename__ = "items"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, default="")
    created_at = db.Column(db.DateTime, server_default=db.func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# Routes
@app.route("/")
def index():
    return jsonify({"message": "Flask API is running"})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/items", methods=["GET"])
def get_items():
    items = Item.query.order_by(Item.created_at.desc()).all()
    return jsonify([item.to_dict() for item in items])


@app.route("/api/items", methods=["POST"])
def create_item():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Name is required"}), 400
    item = Item(name=data["name"], description=data.get("description", ""))
    db.session.add(item)
    db.session.commit()
    return jsonify(item.to_dict()), 201


@app.route("/api/items/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    item = Item.query.get_or_404(item_id)
    data = request.get_json()
    if data.get("name"):
        item.name = data["name"]
    if "description" in data:
        item.description = data["description"]
    db.session.commit()
    return jsonify(item.to_dict())


@app.route("/api/items/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    item = Item.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Item deleted"})


if __name__ == "__main__":
    app.run(debug=True)
```

Initialize migrations:

```bash
flask db init
flask db migrate -m "Create items table"
flask db upgrade
```

Set `DATABASE_URL` in Render's Environment tab. See the [Neon guide](../guides/neon.md) for PostgreSQL setup.

### Option B: MongoDB Atlas with PyMongo

Install dependencies:

```bash
pip install pymongo
```

`mongodb+srv://` connection strings work out of the box -- dnspython is now a mandatory pymongo dependency, so the old `pymongo[srv]` extra is gone (installing it triggers a pip warning about an unknown extra).

Create `app.py` with MongoDB:

```python
import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-change-me")

CORS(app, origins=[os.environ.get("CORS_ORIGIN", "http://localhost:5173")])

# MongoDB connection
client = MongoClient(os.environ.get("MONGODB_URI", "mongodb://localhost:27017"))
db = client[os.environ.get("DATABASE_NAME", "flask_app")]
items_collection = db["items"]


def item_to_dict(item):
    return {
        "id": str(item["_id"]),
        "name": item["name"],
        "description": item.get("description", ""),
    }


@app.route("/")
def index():
    return jsonify({"message": "Flask API is running"})


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/items", methods=["GET"])
def get_items():
    items = items_collection.find().sort("_id", -1).limit(100)
    return jsonify([item_to_dict(item) for item in items])


@app.route("/api/items", methods=["POST"])
def create_item():
    data = request.get_json()
    if not data or not data.get("name"):
        return jsonify({"error": "Name is required"}), 400
    doc = {"name": data["name"], "description": data.get("description", "")}
    result = items_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return jsonify(item_to_dict(doc)), 201


@app.route("/api/items/<item_id>", methods=["DELETE"])
def delete_item(item_id):
    result = items_collection.delete_one({"_id": ObjectId(item_id)})
    if result.deleted_count == 0:
        return jsonify({"error": "Item not found"}), 404
    return jsonify({"message": "Item deleted"})


if __name__ == "__main__":
    app.run(debug=True)
```

Set `MONGODB_URI` in Render's Environment tab. See the [MongoDB Atlas guide](../guides/mongodb-atlas.md) for setup.

---

## Step 3: Static Files and Templates

Flask serves static files from the `static/` directory and templates from `templates/`. Create the directories:

```bash
mkdir -p static/css templates
```

Create `templates/index.html` (optional, for server-rendered pages):

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Flask App</title>
    <link rel="stylesheet" href="{{ url_for('static', filename='css/style.css') }}">
</head>
<body>
    <h1>Welcome to My Flask App</h1>
    <p>API is available at <code>/api/items</code></p>
</body>
</html>
```

Create `static/css/style.css`:

```css
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    max-width: 800px;
    margin: 2rem auto;
    padding: 0 1rem;
    line-height: 1.6;
}
```

Add a route to serve the template:

```python
from flask import render_template

@app.route("/web")
def web_index():
    return render_template("index.html")
```

In production on Render, Flask serves static files directly. For high-traffic sites, consider WhiteNoise:

```bash
pip install whitenoise
```

```python
from whitenoise import WhiteNoise
app.wsgi_app = WhiteNoise(app.wsgi_app, root="static/", prefix="/static/")
```

---

## Step 4: Create Deployment Files

Create `requirements.txt`:

```bash
pip freeze > requirements.txt
```

Or manually create a minimal `requirements.txt` (SQLAlchemy version):

```
flask==3.1.3
gunicorn==26.2.0
flask-cors==6.0.5
flask-sqlalchemy==3.1.1
flask-migrate==4.1.0
psycopg[binary]==3.3.5
python-dotenv==1.2.3
```

Use flask-cors 6.x -- 5.0.0 ships known CVEs (CVE-2024-6839, CVE-2024-6844, CVE-2024-6866) that were fixed in 6.0.0. Note gunicorn 26 requires Python 3.10+.

Create `build.sh`:

```bash
#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt

# Run migrations if using Flask-Migrate with PostgreSQL
if [ -d "migrations" ]; then
    flask db upgrade
fi
```

Make it executable:

```bash
chmod +x build.sh
```

Create `.env` (for local development only):

```bash
FLASK_DEBUG=1
SECRET_KEY=local-dev-secret-key
DATABASE_URL=sqlite:///app.db
CORS_ORIGIN=http://localhost:5173
```

`FLASK_ENV` was removed in Flask 2.3 and does nothing on Flask 3.x. Use `FLASK_DEBUG=1` or `flask run --debug` for local debug mode; never set it in production.

Test with Gunicorn locally:

```bash
gunicorn app:app --bind 0.0.0.0:5000
# Open http://localhost:5000
```

---

## Step 5: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-flask-app.git
git push -u origin main
```

---

## Step 6: Deploy to Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `my-flask-app`
   - **Language:** Python 3
   - **Build Command:** `./build.sh`
   - **Start Command:** `gunicorn app:app --bind 0.0.0.0:$PORT`
   - **Instance Type:** Free
5. Add environment variables in the **Environment** tab (see table below)
6. Click **Create Web Service**

Render runs `build.sh`, installs dependencies, and runs migrations. Your app is live at `https://my-flask-app.onrender.com`.

Test it:

```bash
curl https://my-flask-app.onrender.com/health
curl https://my-flask-app.onrender.com/api/items
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_KEY` | Flask secret key | `a3f8b2c1d4e5...` |
| `DATABASE_URL` | PostgreSQL connection string, exactly as the provider gives it | `postgresql://user:pass@host/db` |
| `MONGODB_URI` | MongoDB connection string (PyMongo) | `mongodb+srv://...` |
| `DATABASE_NAME` | MongoDB database name | `flask_app` |
| `CORS_ORIGIN` | Allowed frontend origin | `https://myapp.github.io` |
| `PORT` | Server port (auto-set by Render) | `10000` |
| `PYTHON_VERSION` | Python version for Render (fully qualified) | `3.13.5` |

Store `DATABASE_URL` as the provider hands it to you. Render and Neon give you a `postgresql://` string (older ones say `postgres://`), never a `postgresql+psycopg://` one. Rewrite the scheme to `postgresql+psycopg://` in code so psycopg 3 is used -- see [Database connection fails on Render](#problem-database-connection-fails-on-render) for the three-line version.

### Set on Render

1. Go to your service on Render
2. Click the **Environment** tab
3. Add each variable
4. Click **Save Changes** (triggers redeploy)

---

## Custom Domain

### Step 1: Add Domain in Render

1. Go to your service **Settings** > **Custom Domains**
2. Click **Add Custom Domain**
3. Enter `api.yourdomain.com`

### Step 2: Configure DNS

| Type | Name | Value |
|------|------|-------|
| CNAME | api | `my-flask-app.onrender.com` |

### Step 3: SSL

Render provisions a free SSL certificate automatically once DNS propagates.

---

## Flask-CORS Configuration

For APIs consumed by a frontend on a different domain, Flask-CORS is essential. Here are common configurations:

### Allow a Single Origin

```python
CORS(app, origins=["https://myapp.github.io"])
```

### Allow Multiple Origins

```python
CORS(app, origins=[
    "https://myapp.github.io",
    "http://localhost:5173",
    "http://localhost:3000",
])
```

### Dynamic Origin from Environment Variable

```python
origins = os.environ.get("CORS_ORIGIN", "http://localhost:5173").split(",")
CORS(app, origins=origins, supports_credentials=True)
```

Then set `CORS_ORIGIN` on Render to `https://myapp.github.io,https://www.myapp.com`.

### Per-Route CORS

```python
from flask_cors import cross_origin

@app.route("/api/public")
@cross_origin()
def public_route():
    return jsonify({"data": "accessible from anywhere"})
```

---

## Alternative Platforms

### Railway

1. Install the Railway CLI: `npm install -g @railway/cli` (or `curl -fsSL agents.railway.com | sh`)
2. Login: `railway login`
3. Initialize: `railway init`
4. Add PostgreSQL: `railway add --database postgres`
5. Deploy: `railway up`

Railway auto-detects Flask projects from `requirements.txt`. Set `SECRET_KEY` and other variables in the Railway dashboard. Railway's Railpack builder generates a start command that references `main:app`, so for this guide's `app.py` layout set a custom start command in the service settings: `gunicorn app:app --bind 0.0.0.0:$PORT`.

### Fly.io

1. Install the Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Login: `fly auth login`
3. Launch: `fly launch`

`fly launch` generates a `fly.toml` configuration file and a Dockerfile that runs gunicorn (the old Procfile/buildpack flow is no longer the documented path). Adjust the start command in `fly.toml` if needed:

```toml
[processes]
  app = "gunicorn app:app --bind 0.0.0.0:8080"

[http_service]
  internal_port = 8080
  force_https = true
```

Deploy with:

```bash
fly deploy
```

Fly.io provides persistent volumes and Managed Postgres (the old app-based "Fly Postgres" is unmanaged and unsupported; use Managed Postgres or an external provider like [Neon](../guides/neon.md)). Set environment variables with `fly secrets set SECRET_KEY=your-key`.

---

## Troubleshooting

### Problem: "ImportError: No module named 'flask'"

**Cause:** `requirements.txt` is missing or incomplete, or the build command did not run.

**Fix:**

```bash
pip freeze > requirements.txt
git add requirements.txt
git commit -m "Update requirements"
git push
```

Ensure the build command is `./build.sh` or `pip install -r requirements.txt`.

### Problem: Database connection fails on Render

**Cause:** `DATABASE_URL` environment variable is missing or uses the wrong format.

**Fix:**

1. Verify `DATABASE_URL` is set in Render's Environment tab
2. If using Neon, ensure the connection string starts with `postgresql://` (not `postgres://`). SQLAlchemy requires the full `postgresql://` prefix, and psycopg 3 needs the `+psycopg` driver suffix:

```python
database_url = os.environ.get("DATABASE_URL", "")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql+psycopg://", 1)
elif database_url.startswith("postgresql://"):
    database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
```

3. If using MongoDB Atlas, ensure `0.0.0.0/0` is whitelisted in Network Access

### Problem: Static files return 404 in production

**Cause:** Gunicorn does not serve static files the same way the Flask development server does.

**Fix:**

1. Ensure the `static/` directory exists and contains files
2. Use WhiteNoise to serve static files in production:

```python
from whitenoise import WhiteNoise
app.wsgi_app = WhiteNoise(app.wsgi_app, root="static/", prefix="/static/")
```

3. Or configure your templates to use `url_for('static', filename='...')` for all static file references

### Problem: CORS errors from the frontend

**Cause:** Flask-CORS is not installed, not configured, or the origin does not match.

**Fix:**

1. Install Flask-CORS: `pip install flask-cors`
2. Initialize it with the correct origin:

```python
CORS(app, origins=["https://your-frontend.github.io"])
```

3. Ensure there is no trailing slash in the origin URL
4. Check that `CORS_ORIGIN` is set correctly on Render

### Problem: Gunicorn workers timeout or crash

**Cause:** Long-running requests, too many workers for available memory, or blocking I/O.

**Fix:**

1. For the free tier, use a single worker with increased timeout:

```
gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --timeout 120
```

2. For CPU-bound work, increase workers on a paid plan:

```
gunicorn app:app --bind 0.0.0.0:$PORT --workers 4 --timeout 120
```

3. The general formula for workers is `(2 * CPU cores) + 1`

### Problem: "No open ports detected" on Render

**Cause:** Gunicorn is not binding to `0.0.0.0` or not using `$PORT`.

**Fix:** Ensure the start command is:

```
gunicorn app:app --bind 0.0.0.0:$PORT
```

Do not hardcode the port. Render sets `$PORT` dynamically.

### Problem: Flask-Migrate "Target database is not up to date" error

**Cause:** The migration history is out of sync with the database.

**Fix:**

```bash
# Stamp the current database state
flask db stamp head

# Generate a new migration
flask db migrate -m "Fix migration history"

# Apply it
flask db upgrade
```

If this is a fresh database, run `flask db upgrade` to apply all existing migrations.

### Problem: First request after inactivity is very slow

**Cause:** Render free web services spin down after 15 minutes without inbound traffic; the next request triggers a cold start. Each workspace also gets 750 free instance hours per calendar month (free services are suspended when exhausted).

**Fix:** Expect cold starts on the free tier, or upgrade to a paid instance (Starter, $7/mo) which never spins down.

### Problem: App works locally but crashes on Render

**Cause:** Missing environment variables, different Python version, or a dependency issue.

**Fix:**

1. Check Render logs: go to your service > **Logs** tab
2. Verify all required environment variables are set
3. Add error handling to surface issues:

```python
@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Not found"}), 404
```

4. To pin the Python version, set `PYTHON_VERSION` to a fully qualified version (e.g. `3.13.5`) in Render's environment variables, or add a `.python-version` file at the repo root (may omit the patch, e.g. `3.13`). Render's default is Python 3.14.x for services created on or after 2026-02-11.
