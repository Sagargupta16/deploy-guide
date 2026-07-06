# Deploy FARM Stack (FastAPI + React + MongoDB)

> Deploy a full-stack FARM application with the FastAPI backend on Render, the React frontend on GitHub Pages, and MongoDB Atlas as the database.

This guide covers deploying a complete FARM stack application: a React + Vite frontend on GitHub Pages, a FastAPI backend on Render, and a MongoDB Atlas database. The three services communicate over HTTPS, with the frontend calling the backend REST API and the backend reading and writing to MongoDB.

## Prerequisites

- [ ] [Python 3.12+](https://www.python.org/downloads/) installed
- [ ] [Node.js 22+](https://nodejs.org/) installed
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Render account](https://render.com/) (sign up with GitHub)
- [ ] A [MongoDB Atlas account](https://www.mongodb.com/cloud/atlas/register) (free)

---

## Architecture Overview

```
GitHub Pages (Frontend)          Render (Backend)             MongoDB Atlas (Database)
+------------------+            +------------------+          +------------------+
|  React + Vite    | -- API --> |  FastAPI          | ------> |  MongoDB         |
|  Static SPA      |   calls   |  async + PyMongo  |         |  Cloud database  |
|  Axios HTTP      |            |  Pydantic models  |         |  Free tier (M0)  |
+------------------+            +------------------+          +------------------+
     VITE_API_URL                   MONGODB_URI
```

> **Alternative:** You can collapse frontend and backend into a single service by building the React app into the backend tree and having FastAPI serve it: `app.mount("/", StaticFiles(directory="client_build", html=True), name="frontend")`, with API routes under an `/api` prefix so they do not collide. One URL, no CORS in production, and it fits in a single free-tier Render service.

---

## Step 1: Set Up MongoDB Atlas

Follow the [MongoDB Atlas guide](../guides/mongodb-atlas.md) to:

1. Create a Free cluster (the free tier, formerly M0)
2. Create a database user
3. Whitelist all IPs (`0.0.0.0/0`) for Render access
4. Copy your connection string

Your connection string looks like:

```
mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

---

## Step 2: Build the FastAPI Backend

### Create the Project

```bash
mkdir farm-app && cd farm-app
mkdir server && cd server
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install fastapi uvicorn[standard] pymongo pydantic-settings python-dotenv
```

Or with [uv](https://docs.astral.sh/uv/) (faster, replaces venv + pip):

```bash
uv venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
uv pip install fastapi uvicorn[standard] pymongo pydantic-settings python-dotenv
```

> **Note:** Earlier FARM tutorials used [Motor](https://pypi.org/project/motor/) as the async MongoDB driver. Motor is officially deprecated as of 2026-05-14 (critical fixes only until 2027-05-14); MongoDB recommends the PyMongo Async API (`AsyncMongoClient` in the `pymongo` package), which this guide uses.

### Create server/config.py

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    database_name: str = "farm_app"
    cors_origin: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
```

### Create server/database.py

```python
from pymongo import AsyncMongoClient
from config import settings

client = AsyncMongoClient(settings.mongodb_uri)
db = client[settings.database_name]

# Collections
items_collection = db["items"]
```

### Create server/models.py

```python
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=1000)
    category: str = Field(default="general", max_length=100)


class ItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    category: Optional[str] = Field(None, max_length=100)


class ItemResponse(BaseModel):
    id: str
    name: str
    description: str
    category: str
    created_at: datetime
```

### Create server/main.py

```python
import os
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from bson import ObjectId
from config import settings
from database import items_collection
from models import ItemCreate, ItemUpdate, ItemResponse

app = FastAPI(title="FARM Stack API", version="1.0.0")

# CORS -- allow the React frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def item_to_response(item: dict) -> dict:
    """Convert a MongoDB document to an API response."""
    return {
        "id": str(item["_id"]),
        "name": item["name"],
        "description": item.get("description", ""),
        "category": item.get("category", "general"),
        "created_at": item.get("created_at", datetime.now(timezone.utc)),
    }


@app.get("/")
async def root():
    return {"message": "FARM Stack API is running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/items", response_model=list[ItemResponse])
async def get_items():
    items = await items_collection.find().sort("created_at", -1).to_list(100)
    return [item_to_response(item) for item in items]


@app.get("/api/items/{item_id}", response_model=ItemResponse)
async def get_item(item_id: str):
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=400, detail="Invalid item ID")
    item = await items_collection.find_one({"_id": ObjectId(item_id)})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return item_to_response(item)


@app.post("/api/items", response_model=ItemResponse, status_code=201)
async def create_item(data: ItemCreate):
    doc = {
        "name": data.name,
        "description": data.description,
        "category": data.category,
        "created_at": datetime.now(timezone.utc),
    }
    result = await items_collection.insert_one(doc)
    doc["_id"] = result.inserted_id
    return item_to_response(doc)


@app.put("/api/items/{item_id}", response_model=ItemResponse)
async def update_item(item_id: str, data: ItemUpdate):
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=400, detail="Invalid item ID")
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await items_collection.find_one_and_update(
        {"_id": ObjectId(item_id)},
        {"$set": update_data},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Item not found")
    return item_to_response(result)


@app.delete("/api/items/{item_id}")
async def delete_item(item_id: str):
    if not ObjectId.is_valid(item_id):
        raise HTTPException(status_code=400, detail="Invalid item ID")
    result = await items_collection.delete_one({"_id": ObjectId(item_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"message": "Item deleted"}
```

### Create server/requirements.txt

```
fastapi==0.139.0
uvicorn[standard]==0.50.1
pymongo==4.17.0
pydantic-settings==2.14.2
python-dotenv==1.2.2
```

### Create server/.env (for local development)

```bash
MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=farm_app
CORS_ORIGIN=http://localhost:5173
```

### Create server/.gitignore

```
venv/
__pycache__/
.env
*.pyc
```

### Test Locally

```bash
uvicorn main:app --reload
# Open http://localhost:8000/docs for interactive API docs
# Test: curl http://localhost:8000/api/items
```

---

## Step 3: Deploy the Backend to Render

### Push the Server to GitHub

```bash
cd server
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/farm-server.git
git push -u origin main
```

### Create a Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect the `farm-server` repository
4. Configure:
   - **Name:** `farm-server`
   - **Language:** Python 3
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** Free
5. Add environment variables in the **Environment** tab:
   - `MONGODB_URI` = your Atlas connection string
   - `DATABASE_NAME` = `farm_app`
   - `CORS_ORIGIN` = `https://<username>.github.io` (set after deploying frontend)
6. Click **Create Web Service**

Your backend is live at `https://farm-server.onrender.com`. The interactive API docs are at `https://farm-server.onrender.com/docs`.

Test it:

```bash
curl https://farm-server.onrender.com/api/items
```

---

## Step 4: Build the React Frontend

### Create the Client

```bash
cd ..   # back to farm-app/
npm create vite@latest client -- --template react
cd client
npm install
npm install axios
```

Or with [pnpm](https://pnpm.io/): `pnpm create vite client --template react`, then `pnpm install` and `pnpm add axios`.

### Create client/src/api.js

```js
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

export async function getItems() {
  const { data } = await api.get('/api/items');
  return data;
}

export async function getItem(id) {
  const { data } = await api.get(`/api/items/${id}`);
  return data;
}

export async function createItem(item) {
  const { data } = await api.post('/api/items', item);
  return data;
}

export async function updateItem(id, item) {
  const { data } = await api.put(`/api/items/${id}`, item);
  return data;
}

export async function deleteItem(id) {
  await api.delete(`/api/items/${id}`);
}
```

### Replace client/src/App.jsx

```jsx
import { useState, useEffect } from 'react';
import { getItems, createItem, deleteItem } from './api';

function App() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getItems()
      .then(setItems)
      .catch((err) => console.error('Failed to load items:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const item = await createItem({ name, description });
    setItems([item, ...items]);
    setName('');
    setDescription('');
  };

  const handleDelete = async (id) => {
    await deleteItem(id);
    setItems(items.filter((item) => item.id !== id));
  };

  return (
    <div style={{ maxWidth: 700, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>FARM Stack App</h1>
      <p style={{ color: '#666' }}>FastAPI + React + MongoDB</p>

      <form onSubmit={handleSubmit} style={{ marginBottom: '2rem' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          required
          style={{ padding: '0.5rem', width: '40%', marginRight: '0.5rem' }}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          style={{ padding: '0.5rem', width: '35%', marginRight: '0.5rem' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem' }}>
          Add
        </button>
      </form>

      {loading ? (
        <p>Loading...</p>
      ) : items.length === 0 ? (
        <p>No items yet. Add one above.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                padding: '0.75rem',
                borderBottom: '1px solid #eee',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <strong>{item.name}</strong>
                {item.description && (
                  <span style={{ color: '#666', marginLeft: '0.5rem' }}>
                    -- {item.description}
                  </span>
                )}
              </div>
              <button onClick={() => handleDelete(item.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;
```

### Configure Vite for GitHub Pages

Edit `client/vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/farm-client/',  // Must match your GitHub repo name
})
```

### Test Locally

Run both server and client:

```bash
# Terminal 1: backend
cd server && source venv/bin/activate && uvicorn main:app --reload

# Terminal 2: frontend
cd client && npm run dev
```

Open http://localhost:5173 to verify the frontend talks to the backend.

> **Tip:** For local development you can skip CORS entirely by adding a dev proxy to `vite.config.js` and calling relative `/api` paths: `server: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } }`. Production builds still use `VITE_API_URL`, which Vite bakes in at build time.

---

## Step 5: Deploy the Frontend to GitHub Pages

### Push the Client to GitHub

```bash
cd client
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/farm-client.git
git push -u origin main
```

### Add the Deploy Workflow

Create `client/.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm run build
        env:
          VITE_API_URL: https://farm-server.onrender.com

      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

### Enable GitHub Pages

1. Go to the `farm-client` repo **Settings** > **Pages**
2. Under **Source**, select **GitHub Actions**
3. Push and deploy:

```bash
git add .
git commit -m "Add deploy workflow"
git push origin main
```

Your frontend is live at `https://<username>.github.io/farm-client/`.

---

## Step 6: Connect Frontend to Backend

### Update Backend CORS

Now that the frontend is deployed, update `CORS_ORIGIN` on Render:

1. Go to your `farm-server` service on Render
2. Navigate to the **Environment** tab
3. Set `CORS_ORIGIN` to `https://<username>.github.io`
4. Save (triggers redeploy)

### Verify the Connection

1. Open `https://<username>.github.io/farm-client/`
2. Open the browser console (F12 > Console)
3. You should see no CORS errors and items load from the API

---

## Local Development with Docker Compose

Create `docker-compose.yml` in the project root (`farm-app/`):

```yaml
services:
  mongodb:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: mongosh --eval "db.adminCommand('ping')" --quiet
      interval: 10s
      timeout: 5s
      retries: 3

  server:
    build: ./server
    ports:
      - "8000:8000"
    environment:
      - MONGODB_URI=mongodb://mongodb:27017
      - DATABASE_NAME=farm_app
      - CORS_ORIGIN=http://localhost:5173
    depends_on:
      mongodb:
        condition: service_healthy
    volumes:
      - ./server:/app
    command: uvicorn main:app --host 0.0.0.0 --port 8000 --reload

  client:
    build: ./client
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:8000
    volumes:
      - ./client:/app
      - /app/node_modules
    command: npm run dev -- --host

volumes:
  mongo_data:
```

Create `server/Dockerfile`:

```dockerfile
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Create `client/Dockerfile`:

```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
CMD ["npm", "run", "dev", "--", "--host"]
```

Run everything locally:

```bash
docker compose up
# Frontend: http://localhost:5173
# Backend:  http://localhost:8000/docs
# MongoDB:  mongodb://localhost:27017
```

---

## Environment Variables

### Backend (Render)

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by Render) | `10000` |
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `DATABASE_NAME` | MongoDB database name | `farm_app` |
| `CORS_ORIGIN` | Frontend URL for CORS | `https://user.github.io` |

### Frontend (GitHub Actions)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL (build-time) | `https://farm-server.onrender.com` |

Set `VITE_API_URL` in the GitHub Actions workflow `env` block, or as a repository secret.

---

## Custom Domain

### Frontend (GitHub Pages)

1. Create `client/public/CNAME` with your domain: `www.yourdomain.com`
2. Update `base` in `vite.config.js` to `'/'` when using a custom domain
3. Configure DNS (see [GitHub Pages guide](../guides/github-pages.md#custom-domain))

### Backend (Render)

1. Go to Render service **Settings** > **Custom Domains**
2. Add `api.yourdomain.com`
3. Add a CNAME DNS record: `api` -> `farm-server.onrender.com`

Then update `VITE_API_URL` to `https://api.yourdomain.com` in your workflow, update `CORS_ORIGIN` to `https://www.yourdomain.com` on Render, and redeploy both.

---

## Troubleshooting

### Problem: CORS error in the browser console

**Cause:** Backend `CORS_ORIGIN` does not match the frontend domain, or the frontend is sending requests to the wrong URL.

**Fix:**

1. Ensure `CORS_ORIGIN` on Render is exactly `https://<username>.github.io` (no trailing slash, no path)
2. Ensure `VITE_API_URL` in the GitHub Actions workflow points to the correct Render URL
3. If you need multiple origins, update the FastAPI middleware:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://<username>.github.io",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Problem: MongoDB connection fails on Render

**Cause:** Atlas IP whitelist does not include Render's IPs, or the connection string is wrong.

**Fix:**

1. Go to MongoDB Atlas > **Network Access** > ensure `0.0.0.0/0` (allow from anywhere) is in the list
2. Verify the `MONGODB_URI` environment variable on Render is correct
3. Check Render logs for the specific error message
4. Ensure the database user password does not contain special characters that need URL encoding (use `urllib.parse.quote_plus()` if needed)

### Problem: Blank page on GitHub Pages

**Cause:** `base` in `vite.config.js` does not match the repository name.

**Fix:**

```js
// vite.config.js -- base must match your GitHub repo name
export default defineConfig({
  plugins: [react()],
  base: '/farm-client/',   // Exact repo name, with leading and trailing slashes
})
```

If you are using a custom domain, set `base: '/'`.

### Problem: API URL is undefined in the frontend

**Cause:** `VITE_API_URL` was not passed during the build step in GitHub Actions.

**Fix:** Ensure the environment variable is in the `env` block of the build step:

```yaml
- run: npm run build
  env:
    VITE_API_URL: https://farm-server.onrender.com
```

Remember: Vite embeds environment variables at build time. Changing the variable requires a rebuild.

### Problem: 422 Unprocessable Entity on POST requests

**Cause:** The request body does not match the Pydantic model.

**Fix:**

1. Ensure the frontend sends `Content-Type: application/json`
2. Check the FastAPI docs at `/docs` and test the endpoint directly
3. Verify the request body matches the Pydantic model exactly:

```js
// Correct: matches ItemCreate model
await api.post('/api/items', { name: 'My Item', description: 'A description' });

// Wrong: extra or missing fields will cause 422
await api.post('/api/items', { title: 'My Item' });
```

### Problem: First API call takes 30-60 seconds

**Cause:** Render's free tier spins down after 15 minutes of inactivity.

**Fix:**

1. Show a loading state in the React frontend while the backend wakes up
2. Upgrade to Render Starter ($7/month) for always-on
3. For demos, use [cron-job.org](https://cron-job.org) to ping `/health` every 14 minutes
