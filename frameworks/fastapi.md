# Deploy FastAPI to Render

> Deploy a FastAPI backend to Render with a database, environment variables, and auto-deploy from GitHub.

This guide covers deploying a production-ready FastAPI application to Render's free tier, including database integration, CORS configuration, and troubleshooting common issues.

## Prerequisites

- [ ] [Python 3.13+](https://www.python.org/downloads/) installed (FastAPI and uvicorn require 3.10 minimum; 3.9 is EOL)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Render account](https://render.com/) (sign up with GitHub)

---

## Step 1: Create a FastAPI App

```bash
mkdir my-fastapi-app && cd my-fastapi-app
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install "fastapi[standard]" python-dotenv
# fastapi[standard] bundles uvicorn and the fastapi CLI
# or with uv: uv venv && uv pip install "fastapi[standard]" python-dotenv
```

Create `main.py`:

```python
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="My API", version="1.0.0")

# CORS -- update origins for your frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API is running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/items")
def get_items():
    return [
        {"id": 1, "name": "Item One"},
        {"id": 2, "name": "Item Two"},
    ]

@app.post("/api/items")
def create_item(item: dict):
    return {"id": 3, **item}
```

Create `requirements.txt`:

```bash
pip freeze > requirements.txt
```

Or manually create a minimal `requirements.txt`:

```
fastapi==0.139.0
uvicorn[standard]==0.50.1
python-dotenv==1.2.2
```

Both fastapi and uvicorn now require Python 3.10+.

Create `.gitignore`:

```
venv/
__pycache__/
.env
*.pyc
```

Test locally:

```bash
fastapi dev main.py
# or: uvicorn main:app --reload
# Open http://localhost:8000
# API docs at http://localhost:8000/docs
```

---

## Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-fastapi-app.git
git push -u origin main
```

---

## Step 3: Deploy to Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `my-fastapi-app`
   - **Language:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** Free
5. Click **Create Web Service**

To pin the Python version, add a `.python-version` file (e.g. `3.13`) to the repo root -- Render reads it to select the build image instead of using its default.

Your API is live at `https://my-fastapi-app.onrender.com`. The interactive docs are at `/docs`.

---

## Step 4: Add a Database

### Option A: Neon PostgreSQL + SQLAlchemy

```bash
pip install sqlalchemy "psycopg[binary]"
pip freeze > requirements.txt
```

Psycopg 3 is the current driver for new projects (psycopg2 is maintenance-only). Use the `postgresql+psycopg://` URL scheme so SQLAlchemy picks it up.

Create `database.py`:

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.environ["DATABASE_URL"]

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

Create `models.py`:

```python
from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime, timezone
from database import Base

class Item(Base):
    __tablename__ = "items"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
```

`datetime.utcnow()` is deprecated since Python 3.12; use timezone-aware `datetime.now(timezone.utc)` instead.

Update `main.py`:

```python
import os
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import engine, get_db, Base
from models import Item

Base.metadata.create_all(bind=engine)

app = FastAPI(title="My API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("CORS_ORIGIN", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "API is running"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/api/items")
def get_items(db: Session = Depends(get_db)):
    return db.query(Item).all()

@app.post("/api/items", status_code=201)
def create_item(data: dict, db: Session = Depends(get_db)):
    if "name" not in data:
        raise HTTPException(status_code=400, detail="Name is required")
    item = Item(name=data["name"])
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
```

Set `DATABASE_URL` in Render's Environment tab. See the [Neon guide](../guides/neon.md) for setup.

### Option B: MongoDB Atlas + PyMongo Async

```bash
pip install pymongo
pip freeze > requirements.txt
```

Motor is deprecated (2026-05-14); MongoDB recommends the PyMongo Async API, a near drop-in replacement for `AsyncIOMotorClient`.

Update `main.py`:

```python
import os
from fastapi import FastAPI
from pymongo import AsyncMongoClient

app = FastAPI()

client = AsyncMongoClient(os.environ["MONGODB_URI"])
db = client["myapp"]

@app.get("/api/items")
async def get_items():
    items = await db["items"].find().to_list(100)
    for item in items:
        item["_id"] = str(item["_id"])
    return items

@app.post("/api/items", status_code=201)
async def create_item(data: dict):
    result = await db["items"].insert_one(data)
    return {"id": str(result.inserted_id), **data}
```

Set `MONGODB_URI` in Render's Environment tab. See the [MongoDB Atlas guide](../guides/mongodb-atlas.md) for setup.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by Render) | `10000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql+psycopg://user:pass@host/db` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `SECRET_KEY` | App secret key | `your-secret-key-here` |
| `CORS_ORIGIN` | Allowed frontend origin | `https://myapp.github.io` |

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
| CNAME | api | `my-fastapi-app.onrender.com` |

### Step 3: SSL

Render provisions a free SSL certificate automatically once DNS propagates.

---

## Troubleshooting

### Problem: Deploy fails with "No module named 'fastapi'"

**Cause:** `requirements.txt` is missing or incomplete.

**Fix:**

```bash
pip freeze > requirements.txt
git add requirements.txt
git commit -m "Update requirements"
git push
```

### Problem: "No open ports detected"

**Cause:** The start command is wrong or the app is not binding to `0.0.0.0`.

**Fix:** Ensure your start command is exactly:

```
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Problem: CORS errors from the frontend

**Cause:** `allow_origins` doesn't include the frontend URL.

**Fix:**

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://your-frontend.github.io",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Or set `CORS_ORIGIN` as an environment variable on Render.

Note: CORS headers are missing on unhandled 500 responses, so a browser "CORS error" often masks a server error. Check the Render logs before touching CORS config.

### Problem: 422 Unprocessable Entity on POST requests

**Cause:** Request body doesn't match the expected format, or Content-Type header is missing.

**Fix:**

1. Ensure the frontend sends `Content-Type: application/json`
2. Use Pydantic models for request validation:

```python
from pydantic import BaseModel

class ItemCreate(BaseModel):
    name: str

@app.post("/api/items", status_code=201)
def create_item(data: ItemCreate, db: Session = Depends(get_db)):
    item = Item(name=data.name)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
```

### Problem: Slow cold start on free tier

**Cause:** Render's free tier spins down after 15 minutes of inactivity.

**Fix:**

1. This is expected on the free tier (30-60 second cold start)
2. Add a `/health` endpoint and keep the service warm with a scheduled GitHub Actions ping:

```yaml
on:
  schedule:
    - cron: "*/30 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl --silent --max-time 30 https://my-fastapi-app.onrender.com/health || echo "ignoring"
```

3. Upgrade to Starter ($7/month) for always-on

### Problem: "SSL connection is required" with Neon database

**Cause:** Neon requires SSL but SQLAlchemy isn't configured for it.

**Fix:** The `?sslmode=require` parameter in the Neon connection string should be enough. If not:

```python
from sqlalchemy import create_engine

engine = create_engine(
    DATABASE_URL,
    connect_args={"sslmode": "require"},
)
```

If you use Neon's pooled connection string, remove `channel_binding=require` from it -- PgBouncer does not support channel binding, and Neon's console includes that parameter by default.

### Problem: Import error with relative imports

**Cause:** Python module resolution differs between local and Render.

**Fix:** Keep all Python files in the project root (next to `main.py`), or use a proper package structure with `__init__.py` files. Ensure the start command runs from the correct directory.
