# Render

> Deploy backend APIs, full-stack apps, and static sites on Render with auto-deploy from GitHub.

Render is a cloud platform that supports web services, static sites, cron jobs, and databases. It connects directly to GitHub and deploys automatically on every push. The free tier is great for hobby projects and prototyping.

## Prerequisites

- [ ] A [Render account](https://render.com/) (sign up with GitHub recommended)
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] [Node.js 22+](https://nodejs.org/) (for Node.js/Express projects)
- [ ] [Python 3.12+](https://www.python.org/downloads/) (for FastAPI projects)

---

## Deploy Node.js / Express

### Step 1: Prepare Your Express App

Make sure your `package.json` has a `start` script and your app listens on the correct port:

```js
// server.js
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Render!' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

```json
{
  "name": "my-express-app",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^5.2.0"
  }
}
```

> **Important:** Always use `process.env.PORT`. Render assigns the port dynamically.

> **Tip:** Pin your Node version with a `.nvmrc` file (e.g. `22`) in the repo root. Render reads it to pick the build image; without it, new services default to Node 24.

### Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-express-app.git
git push -u origin main
```

### Step 3: Create a Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `my-express-app`
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Click **Create Web Service**

Render will build and deploy your app. You will get a URL like `https://my-express-app.onrender.com`.

---

## Deploy Python / FastAPI

### Step 1: Prepare Your FastAPI App

Create `main.py`:

```python
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from Render!"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

Create `requirements.txt`:

```
fastapi==0.139.0
uvicorn[standard]==0.50.1
```

> **Tip:** Pin your Python version with a `.python-version` file (e.g. `3.14`) in the repo root. Render reads it to pick the build image; without it, new services default to Python 3.14. Render also supports [uv](https://docs.astral.sh/uv/) natively -- it detects a `uv.lock` in the repo root (pin the uv version with the `UV_VERSION` env var).

### Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-fastapi-app.git
git push -u origin main
```

### Step 3: Create a Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `my-fastapi-app`
   - **Language:** Python
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type:** Free
5. Click **Create Web Service**

Your API docs are automatically available at `https://my-fastapi-app.onrender.com/docs`.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by Render) | `10000` |
| `DATABASE_URL` | Database connection string | `postgresql://user:pass@host/db` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `NODE_ENV` | Node environment | `production` |
| `SECRET_KEY` | App secret key | `your-secret-key-here` |

### Set via Dashboard

1. Go to your service on Render
2. Click **Environment** in the left pane
3. Click **+ Add Environment Variable** (or **Add from .env** to paste in bulk)
4. Enter key-value pairs
5. Save with **Save, rebuild, and deploy** or **Save and deploy** (choose **Save only** to skip the redeploy)

### Set via render.yaml (Infrastructure as Code)

Create `render.yaml` in your project root for reproducible deployments:

```yaml
services:
  - type: web
    name: my-express-app
    runtime: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false  # Must be set manually in dashboard (secret)
```

---

## Custom Domain

### Step 1: Add Domain in Render

1. Go to your service on Render
2. Navigate to **Settings** > **Custom Domains**
3. Click **Add Custom Domain**
4. Enter your domain (e.g., `api.yourdomain.com`)

### Step 2: Configure DNS

Add the DNS record shown by Render:

**For subdomain (recommended for APIs):**

| Type | Name | Value |
|------|------|-------|
| CNAME | api | `your-service.onrender.com` |

**For apex domain:**

| Type | Name | Value |
|------|------|-------|
| A | @ | `216.24.57.1` |

> Use an ANAME/ALIAS record instead if your DNS provider supports it, and remove any AAAA records -- Render serves over IPv4 only.

### Step 3: Verify and SSL

Render automatically provisions a free SSL certificate via Let's Encrypt once DNS propagates. No manual configuration needed.

---

## Auto-Deploy from GitHub

Auto-deploy is enabled by default when you connect a GitHub repo. Every push to the configured branch triggers a new deploy.

### Disable Auto-Deploy

If you want manual control:

1. Go to your service **Settings**
2. Under **Build & Deploy**, set the **Auto-Deploy** dropdown to **Off** (the other options are **On Commit** and **After CI Checks Pass**)

### Deploy Hooks

You can trigger deploys from CI/CD pipelines or other services:

1. Go to your service **Settings**
2. Under **Build & Deploy**, find **Deploy Hook**
3. Copy the URL
4. Trigger with: `curl -X POST https://api.render.com/deploy/srv-xxxxx?key=xxxxx`

---

## Free Tier Limitations

Render's free tier has important constraints:

| Feature | Free Tier | Paid (Starter $7/mo) |
|---------|-----------|----------------------|
| **Spin-down** | Sleeps after 15 min of inactivity | Always on |
| **Cold start** | ~1 minute on first request | None |
| **Hours** | 750 hours/month total across all free services | Unlimited |
| **Bandwidth** | 5 GB/month per workspace (then $0.15/GB) | 5 GB/month per workspace (then $0.15/GB) |
| **Build minutes** | 500 min/month | 500 min/month |

### Key things to know:

- **Free services spin down after 15 minutes of no traffic.** The next request takes about a minute (cold start) while Render shows a loading page.
- The 750 free hours are shared across ALL your free services. One service running 24/7 uses ~730 hours.
- Free services are automatically suspended if you exceed limits.
- Free PostgreSQL databases expire 30 days after creation, with a 14-day grace period to upgrade before Render deletes them. Max one free Postgres per workspace, 1 GB storage.

### Workaround for Spin-Down

Use an external cron to ping your service every 14 minutes (not recommended for production, but works for demos):

```bash
# Using cron-job.org or similar service
# Ping every 14 minutes: https://my-express-app.onrender.com/health
```

Or use a scheduled GitHub Actions workflow -- costs ~0 Actions minutes and never fails the job on a non-200:

```yaml
# .github/workflows/keepalive.yml
name: Keep backend awake
on:
  schedule:
    - cron: "*/14 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl --silent --max-time 30 https://my-express-app.onrender.com/health || echo "ignoring"
```

Note that keeping one service awake 24/7 uses ~730 of your 750 monthly free hours. Or upgrade to the Starter plan ($7/month) for always-on services.

---

## Troubleshooting

### Problem: Deploy fails with "Build failed"

**Cause:** Missing dependencies or incorrect build command.

**Fix:**

```bash
# Node.js: Make sure all deps are in package.json
npm install
git add package.json package-lock.json
git commit -m "Fix dependencies"
git push

# Python: Make sure requirements.txt is up to date
pip freeze > requirements.txt
git add requirements.txt
git commit -m "Update requirements"
git push
```

### Problem: App crashes with "Port already in use" or "Address already in use"

**Cause:** Hardcoded port number instead of using `process.env.PORT`.

**Fix:**

```js
// Node.js -- ALWAYS use process.env.PORT
const PORT = process.env.PORT || 3000;
app.listen(PORT);
```

```python
# Python -- use the $PORT variable in start command
# Start command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Problem: First request is very slow (~1 minute)

**Cause:** Free tier spin-down. The service went to sleep after 15 minutes of inactivity.

**Fix:** This is expected behavior on the free tier. Options:
1. Accept the cold start for hobby/demo projects
2. Upgrade to Starter ($7/month) for always-on
3. Use an external pinger (not recommended for real apps)

### Problem: "No open ports detected" error

**Cause:** The app is not listening on `0.0.0.0` or not using the assigned port.

**Fix:**

```js
// Node.js
app.listen(process.env.PORT || 3000, '0.0.0.0');
```

```python
# Python start command must include --host 0.0.0.0
# uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Problem: Environment variables are not available

**Cause:** Variables were added after the last deploy, or you need to redeploy.

**Fix:**

1. Go to your service **Environment** tab
2. Verify the variables are saved
3. Click **Manual Deploy** > **Deploy latest commit** to pick up new env vars

### Problem: CORS errors when calling from a frontend

**Cause:** The backend does not include CORS headers.

**Fix:**

```js
// Node.js (Express)
import cors from 'cors';
app.use(cors({ origin: 'https://your-frontend.github.io' }));
```

```python
# Python (FastAPI)
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-frontend.github.io"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```
