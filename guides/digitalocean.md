# DigitalOcean

> Deploy web applications on DigitalOcean App Platform (PaaS) with automatic builds, managed databases, and simple scaling.

DigitalOcean App Platform is a Platform-as-a-Service that builds and deploys your code directly from a Git repository. It handles infrastructure, SSL, scaling, and networking so you can focus on your application. For more control, DigitalOcean also offers Droplets (virtual machines) covered briefly at the end of this guide.

## Prerequisites

- [ ] A [DigitalOcean account](https://cloud.digitalocean.com/registrations/new) (new accounts get $200 free credit for 60 days)
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] [Node.js 22+](https://nodejs.org/) or [Python 3.12+](https://www.python.org/downloads/) depending on your stack
- [ ] (Optional) [doctl CLI](https://docs.digitalocean.com/reference/doctl/how-to/install/) for command-line management
- [ ] (Optional) [Docker](https://docs.docker.com/get-docker/) for container-based deployments

### Install and Configure doctl

```bash
# macOS
brew install doctl

# Ubuntu/Debian
sudo snap install doctl

# Windows: download the release archive from GitHub
# https://github.com/digitalocean/doctl/releases

# Authenticate
doctl auth init
# Paste your API token from https://cloud.digitalocean.com/account/api/tokens
```

Verify your setup:

```bash
doctl account get
```

---

## Deploy Node.js on App Platform

### Step 1: Prepare Your App

Create `server.js`:

```js
import express from 'express';

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/', (req, res) => {
  res.json({ message: 'Hello from DigitalOcean!', env: process.env.NODE_ENV });
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

Create `package.json`:

```json
{
  "name": "my-do-app",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^5.2.0"
  }
}
```

### Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-do-app.git
git push -u origin main
```

### Step 3: Deploy via Dashboard

1. Go to [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps)
2. Click **Create App**
3. Select **GitHub** as the source and authorize DigitalOcean
4. Choose your repository and branch (`main`)
5. App Platform auto-detects Node.js and configures:
   - **Build Command:** `npm install`
   - **Run Command:** `npm start`
6. Pick an instance size in the resource settings (the smallest container is 1 shared vCPU / 512 MiB at $5/mo)
7. Click **Create Resources**

Your app is live in a few minutes at `https://your-app-xxxxx.ondigitalocean.app`.

### Step 4: Deploy via doctl CLI

```bash
# Create the app from the dashboard first, then manage via CLI
# Or create from an app spec file (see next section)
doctl apps create --spec app.yaml

# List your apps
doctl apps list

# Get app details
doctl apps get <app-id>

# Trigger a manual deployment
doctl apps create-deployment <app-id>
```

---

## Deploy Python (FastAPI) on App Platform

### Step 1: Prepare Your App

Create `main.py`:

```python
from fastapi import FastAPI
import os

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from DigitalOcean!", "env": os.getenv("PYTHON_ENV", "development")}

@app.get("/health")
def health_check():
    return {"status": "healthy"}
```

Create `requirements.txt`:

```
fastapi==0.139.0
uvicorn[standard]==0.50.1
```

### Step 2: Push to GitHub and Deploy

Push to GitHub (same steps as above), then create an app on the dashboard.

App Platform will auto-detect Python. Configure:

- **Build Command:** `pip install -r requirements.txt`
- **Run Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

---

## App Spec File (app.yaml)

The app spec file defines your entire application stack as code. This is the recommended approach for reproducible deployments.

### Node.js Example

Create `app.yaml`:

```yaml
name: my-do-app
region: nyc
services:
  - name: api
    github:
      repo: <username>/my-do-app
      branch: main
      deploy_on_push: true
    build_command: npm install
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: apps-s-1vcpu-0.5gb
    http_port: 8080
    health_check:
      http_path: /health
    envs:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        scope: RUN_TIME
        type: SECRET
```

### Python Example

```yaml
name: my-fastapi-app
region: nyc
services:
  - name: api
    github:
      repo: <username>/my-fastapi-app
      branch: main
      deploy_on_push: true
    build_command: pip install -r requirements.txt
    run_command: uvicorn main:app --host 0.0.0.0 --port $PORT
    environment_slug: python
    instance_count: 1
    instance_size_slug: apps-s-1vcpu-0.5gb
    envs:
      - key: PYTHON_ENV
        value: production
```

### Full-Stack Example (API + Static Frontend + Database)

```yaml
name: my-fullstack-app
region: nyc

services:
  - name: api
    github:
      repo: <username>/my-app
      branch: main
      deploy_on_push: true
      source_dir: /backend
    build_command: npm install
    run_command: npm start
    environment_slug: node-js
    instance_count: 1
    instance_size_slug: apps-s-1vcpu-0.5gb
    http_port: 3000
    health_check:
      http_path: /health
    envs:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        scope: RUN_TIME
        value: ${db.DATABASE_URL}

static_sites:
  - name: frontend
    github:
      repo: <username>/my-app
      branch: main
      deploy_on_push: true
      source_dir: /frontend
    build_command: npm run build
    output_dir: dist
    environment_slug: node-js

databases:
  - name: db
    engine: PG
    version: "18"
    production: false
```

Deploy with doctl:

```bash
# Create app from spec
doctl apps create --spec app.yaml

# Update existing app
doctl apps update <app-id> --spec app.yaml

# Validate spec without deploying
doctl apps spec validate app.yaml
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by App Platform) | `8080` |
| `DATABASE_URL` | Database connection string | `postgresql://user:pass@host:25060/db?sslmode=require` |
| `NODE_ENV` | Node environment | `production` |
| `SECRET_KEY` | App secret key | `your-secret-key-here` |

### Set via Dashboard

1. Go to your app on [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps)
2. Click **Settings** > select your component
3. Scroll to **Environment Variables**
4. Add key-value pairs
5. Toggle **Encrypt** for sensitive values
6. Click **Save** (triggers automatic redeploy)

### Set via doctl CLI

```bash
# Environment variables are managed through the app spec
# Update your app.yaml and run:
doctl apps update <app-id> --spec app.yaml
```

### Set in app.yaml

```yaml
envs:
  # Plain-text variable
  - key: NODE_ENV
    value: production

  # Secret (set value in dashboard, not in code)
  - key: DATABASE_URL
    scope: RUN_TIME
    type: SECRET

  # Build-time variable
  - key: NPM_CONFIG_PRODUCTION
    value: "true"
    scope: BUILD_TIME

  # Variable from a managed database component
  - key: DATABASE_URL
    scope: RUN_TIME
    value: ${db.DATABASE_URL}
```

Scopes: `RUN_TIME`, `BUILD_TIME`, `RUN_AND_BUILD_TIME`.

---

## Managed Databases

DigitalOcean offers managed databases that integrate directly with App Platform.

### Add a Database via Dashboard

1. Go to your app **Settings**
2. Click **Add Resource** > **Database**
3. Choose the database type:
   - **Dev Database:** $7/mo (PostgreSQL only, 512 MiB, no standby -- good for development)
   - **Production:** attach an existing managed cluster (PostgreSQL or MySQL from $15.15/mo)

### Add via app.yaml

```yaml
databases:
  - name: db
    engine: PG          # dev databases are PostgreSQL only
    version: "18"
    production: false   # dev database ($7/mo, auto-provisioned)
```

For a production database, set `production: true` and point `cluster_name` at an existing managed cluster.

### Connect from Your App

When you add a database component, App Platform automatically sets the `DATABASE_URL` environment variable. Reference it in your app spec:

```yaml
envs:
  - key: DATABASE_URL
    scope: RUN_TIME
    value: ${db.DATABASE_URL}
```

### Connection Example (Node.js with pg)

```js
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query('SELECT NOW()');
console.log(result.rows[0]);
```

### Connection Example (Python with asyncpg)

```python
import asyncpg
import os

async def connect():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"), ssl="require")
    result = await conn.fetchval("SELECT NOW()")
    print(result)
    await conn.close()
```

---

## Custom Domain

### Step 1: Add Domain in App Platform

1. Go to your app on DigitalOcean
2. Click **Settings** > **Domains**
3. Click **Add Domain**
4. Enter your domain (e.g., `api.yourdomain.com`)

### Step 2: Configure DNS

**Option A: DigitalOcean manages your domain**

If your domain uses DigitalOcean nameservers, the CNAME record is added automatically.

**Option B: External DNS provider**

Add the DNS record shown by DigitalOcean:

| Type | Name | Value |
|------|------|-------|
| CNAME | api | `your-app-xxxxx.ondigitalocean.app.` |

For an apex domain (`yourdomain.com`), you may need an ALIAS or ANAME record (if your DNS provider supports it), or use DigitalOcean's nameservers.

### Step 3: SSL Certificate

App Platform automatically provisions and renews SSL certificates via Let's Encrypt once DNS propagates. No manual configuration needed.

### Manage Domains via doctl

```bash
# Add a domain to DigitalOcean DNS
doctl compute domain create yourdomain.com

# Add a CNAME record
doctl compute domain records create yourdomain.com \
  --record-type CNAME \
  --record-name api \
  --record-data your-app-xxxxx.ondigitalocean.app. \
  --record-ttl 3600
```

---

## Pricing

### App Platform Instance Sizes

App Platform no longer uses Starter/Basic/Professional plan tiers -- you pay per container instance size. All instances are always-on (no sleep on inactivity). Common shared-CPU sizes:

| Instance Slug | vCPU | Memory | Transfer | Price |
|---------------|------|--------|----------|-------|
| `apps-s-1vcpu-0.5gb` | 1 (shared) | 512 MiB | 50 GiB | $5/mo |
| `apps-s-1vcpu-1gb-fixed` | 1 (shared) | 1 GiB | 100 GiB | $10/mo |
| `apps-s-1vcpu-1gb` | 1 (shared) | 1 GiB | 150 GiB | $12/mo |
| `apps-s-1vcpu-2gb` | 1 (shared) | 2 GiB | 200 GiB | $25/mo |
| `apps-s-2vcpu-4gb` | 2 (shared) | 4 GiB | 250 GiB | $50/mo |

Dedicated-CPU instances range from $29/mo to $392/mo.

### Free Credit

New DigitalOcean accounts receive **$200 in free credit** valid for 60 days. This is enough to run multiple apps and databases for testing.

### Static Sites

Static sites on App Platform have a free tier: up to 3 static-site apps free (1 GiB transfer each). Additional static-site apps cost $3/mo.

### Managed Database Pricing

| Engine | Dev (in-app) | Managed cluster (1 node) |
|--------|-------------|--------------------------|
| PostgreSQL | $7/mo (512 MiB) | from $15.15/mo |
| MySQL | Not available as dev database | from $15.15/mo |
| Valkey (Redis-compatible caching) | Not available as dev database | from $15/mo |

DigitalOcean replaced Managed Redis with **Managed Caching for Valkey** (Redis-compatible). Dev databases attached to an app are PostgreSQL only.

---

## Droplet Deployment (Alternative)

For full control over the server environment, deploy on a Droplet (virtual machine).

### Step 1: Create a Droplet

```bash
doctl compute droplet create my-server \
  --image ubuntu-24-04-x64 \
  --size s-1vcpu-1gb \
  --region nyc1 \
  --ssh-keys $(doctl compute ssh-key list --format ID --no-header | head -1)
```

### Step 2: SSH and Set Up

```bash
# Get the Droplet IP
DROPLET_IP=$(doctl compute droplet get my-server --format PublicIPv4 --no-header)

# SSH into the Droplet
ssh root@$DROPLET_IP

# On the Droplet: install Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# Clone your app
git clone https://github.com/<username>/my-do-app.git
cd my-do-app
npm install

# Install PM2 for process management
npm install -g pm2
pm2 start server.js --name my-app
pm2 save
pm2 startup
```

### Step 3: Set Up Nginx Reverse Proxy

```bash
apt install -y nginx

cat > /etc/nginx/sites-available/my-app << 'EOF'
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/my-app /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### Step 4: Enable HTTPS with Certbot

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com --non-interactive --agree-tos -m your@email.com
```

Certbot automatically configures Nginx for HTTPS and sets up auto-renewal.

---

## Troubleshooting

### Problem: Build fails with dependency errors

**Cause:** Missing dependencies, wrong Node.js/Python version, or build command issues.

**Fix:**

```bash
# Node.js: ensure all dependencies are in package.json
npm install
git add package.json package-lock.json
git commit -m "Fix dependencies"
git push

# Specify Node.js version in package.json
# "engines": { "node": ">=22" }

# Python: ensure requirements.txt is accurate
pip freeze > requirements.txt
git add requirements.txt
git commit -m "Update requirements"
git push
```

Check the build logs in the DigitalOcean dashboard: **App** > **Deployments** > click on the failed deployment.

### Problem: App exceeds resource limits (OOM killed)

**Cause:** The application uses more memory than the instance size allows.

**Fix:**

1. Check resource usage in the **Insights** tab of your app
2. Upgrade to a larger instance size:
   - Dashboard: **Settings** > select the component > edit the instance size
   - Or update `instance_size_slug` in `app.yaml`
3. Optimize your application's memory usage (connection pooling, streaming large files, etc.)

```yaml
# Upgrade in app.yaml
instance_size_slug: apps-s-1vcpu-1gb   # 1 GB memory instead of 512 MB
```

### Problem: Database connection refused or timeout

**Cause:** SSL not enabled, wrong connection string, or firewall/trusted sources misconfigured.

**Fix:**

1. Always use SSL when connecting to managed databases:

```js
// Node.js
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
```

```python
# Python
conn = await asyncpg.connect(os.getenv("DATABASE_URL"), ssl="require")
```

2. Ensure the `DATABASE_URL` env var is set correctly. If using a database component in the same app, reference it with `${db.DATABASE_URL}`.
3. For standalone managed databases, add your app to the **Trusted Sources** list in the database settings.

### Problem: SSL certificate not provisioning

**Cause:** DNS records are not correctly pointed to DigitalOcean, or propagation has not completed.

**Fix:**

1. Verify DNS records are correct:

```bash
# Check CNAME resolution
dig api.yourdomain.com CNAME +short
# Should return: your-app-xxxxx.ondigitalocean.app.
```

2. Wait up to 48 hours for DNS propagation (usually much faster)
3. Remove and re-add the domain in **Settings** > **Domains**
4. Ensure there is no CAA record on your domain blocking Let's Encrypt. If there is, add: `0 issue "letsencrypt.org"`

### Problem: Deployment succeeds but app returns 502 or 503

**Cause:** The app is not listening on the correct port or crashes after startup.

**Fix:**

1. App Platform sets the `PORT` environment variable. Your app **must** listen on it:

```js
// Node.js
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0');
```

```python
# Python run command
# uvicorn main:app --host 0.0.0.0 --port $PORT
```

2. Check the **Runtime Logs** tab in your app dashboard for crash messages
3. Ensure the health check path returns HTTP 200:

```yaml
health_check:
  http_path: /health
```

### Problem: Auto-deploy is not triggering on push

**Cause:** DigitalOcean GitHub integration is disconnected, or `deploy_on_push` is disabled.

**Fix:**

1. Go to **Settings** > **Source** and verify the GitHub connection is active
2. Ensure `deploy_on_push: true` is set in your app spec
3. Check that you are pushing to the correct branch (the one configured in the app)
4. Reconnect GitHub if needed: **Settings** > **Source** > **Edit** > re-authorize

```yaml
# Ensure this is in your app.yaml
github:
  repo: <username>/my-do-app
  branch: main
  deploy_on_push: true
```
