# Fly.io

> Deploy containerized apps globally on Fly.io with multi-region support and built-in databases.

Fly.io runs your applications in lightweight VMs (Firecracker micro-VMs) close to your users around the world. It uses Docker containers, supports multi-region deployments out of the box, and provides Managed Postgres and Upstash Redis. Pricing is pure pay-as-you-go -- all new organizations require a credit card on file. Fly.io is ideal for backend APIs, full-stack apps, and any workload that benefits from edge deployment.

## Prerequisites

- [ ] A [Fly.io account](https://fly.io/app/sign-up) (sign up with GitHub recommended)
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] [Node.js 22+](https://nodejs.org/) (for Node.js projects)
- [ ] [Python 3.12+](https://www.python.org/downloads/) (for Python projects)
- [ ] [Docker](https://docs.docker.com/get-docker/) installed locally (for building images)
- [ ] [Fly CLI (flyctl)](https://fly.io/docs/flyctl/install/): `curl -L https://fly.io/install.sh | sh`

---

## Install Fly CLI

```bash
# macOS / Linux
curl -L https://fly.io/install.sh | sh

# Windows (PowerShell)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Homebrew
brew install flyctl

# Authenticate
fly auth login
```

---

## Deploy Node.js / Express

### Step 1: Prepare Your Express App

Create `server.js`:

```js
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Fly.io!' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

Create `package.json`:

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

### Step 2: Create a Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:24-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
```

Create `.dockerignore`:

```
node_modules
npm-debug.log
.git
.env
```

### Step 3: Launch on Fly

```bash
# Initialize the Fly app (generates fly.toml)
fly launch

# Fly prints a default configuration summary:
# - Organization, app name (derived from the directory), fastest region
# - App Machines: shared-cpu-1x, 1GB RAM (the default VM)
# - Postgres: <none>, Redis: <none>
# Then asks a single question:
# "Do you want to tweak these settings before proceeding?"
# Answer Yes to adjust settings in the Fly Launch web page, or No to deploy as-is.

# Non-interactive alternative:
fly launch --name my-express-app --region iad --no-db --no-redis --now --yes
```

`fly launch` creates a `fly.toml` configuration file and deploys your app. You get a URL like `https://my-express-app.fly.dev`.

### Step 4: Subsequent Deploys

```bash
# Deploy changes
fly deploy

# Deploy with a specific Dockerfile
fly deploy --dockerfile Dockerfile.prod

# Deploy a specific image
fly deploy --image my-registry/my-app:latest
```

---

## Deploy Python / FastAPI

### Step 1: Prepare Your FastAPI App

Create `main.py`:

```python
import os
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello from Fly.io!"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
```

Create `requirements.txt`:

```
fastapi==0.141.1
uvicorn[standard]==0.52.4
```

### Step 2: Create a Dockerfile

Create `Dockerfile`:

```dockerfile
FROM python:3.14-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Create `.dockerignore`:

```
__pycache__
*.pyc
.git
.env
venv
```

### Step 3: Launch on Fly

```bash
fly launch
```

> **Important:** If Fly detects a Python project, it may set the internal port to 8000 automatically. If not, make sure the port in `fly.toml` matches the port in your Dockerfile CMD.

---

## fly.toml Configuration

The `fly.toml` file is the primary configuration for your Fly app. `fly launch` generates it, but you can customize it:

```toml
# fly.toml -- Full example

app = "my-express-app"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [http_service.concurrency]
    type = "connections"
    hard_limit = 250
    soft_limit = 200

[[vm]]
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1

[checks]
  [checks.health]
    port = 3000
    type = "http"
    interval = "15s"
    timeout = "2s"
    grace_period = "10s"
    method = "GET"
    path = "/health"
```

### Key Configuration Options

| Section | Option | Description |
|---------|--------|-------------|
| `app` | -- | Your Fly app name |
| `primary_region` | -- | Primary deployment region (e.g., `iad`, `lhr`, `nrt`) |
| `[build]` | `dockerfile` | Path to Dockerfile |
| `[env]` | -- | Non-secret environment variables |
| `[http_service]` | `internal_port` | Port your app listens on inside the container |
| `[http_service]` | `auto_stop_machines` | Stop machines when idle (`stop`, `suspend`, or `off`) |
| `[http_service]` | `min_machines_running` | Minimum machines to keep running |
| `[[vm]]` | `memory` | Memory per VM (e.g., `256mb`, `512mb`, `1gb`) |
| `[[vm]]` | `cpu_kind` | CPU type: `shared` or `performance` |

---

## PostgreSQL on Fly

The current product is **Fly.io Managed Postgres (MPG)**, managed via the `fly mpg` commands. The old unmanaged Fly Postgres (`fly postgres create`) is legacy and unsupported -- Fly's docs state they cannot provide support or guidance for it. `fly launch --db mpg` provisions Managed Postgres during launch (`--db upg` or `--db legacy` keeps the old unmanaged path).

Managed Postgres starts at the Basic plan: $38/mo (shared 2x CPU, 1GB RAM) plus $0.28 per provisioned GB of storage per 30-day month, available in 12 regions.

### Create a Managed Postgres Cluster

```bash
# Create a Managed Postgres cluster (interactive: name, region, plan)
fly mpg create

# Attach it to your app (sets DATABASE_URL automatically)
fly mpg attach --app my-express-app
```

This provisions a Managed Postgres cluster and automatically sets the `DATABASE_URL` secret in your app.

### Connect Locally

```bash
# Proxy the database to localhost for local development
fly mpg proxy

# Connect with psql using the connection string shown by the proxy
psql "postgres://postgres:password@localhost:5432/my_app_db"
```

### Manage the Database

```bash
# Open a psql console on the cluster
fly mpg connect

# Check cluster status
fly mpg status
```

---

## Redis on Fly

### Create a Redis Instance

```bash
# Create an Upstash Redis instance (managed by Fly)
fly redis create

# Follow the prompts:
# - Name: my-app-redis
# - Region: same as your app
# - Eviction: enabled or disabled
# - Plan: pay-as-you-go ($0.20 per 100K requests, 10GB storage cap)
#   or a fixed plan ($10/mo for 250MB up to $400/mo for 50GB)
```

The command prints a private connection URL (e.g. `redis://password@fly-my-app-redis.upstash.io`). Set it as a secret yourself:

```bash
fly secrets set REDIS_URL="redis://password@fly-my-app-redis.upstash.io"
```

### Use in Your App

```js
// Node.js with ioredis
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

await redis.set('key', 'value');
const value = await redis.get('key');
```

```python
# Python with redis-py
import os
import redis

r = redis.from_url(os.environ["REDIS_URL"])
r.set("key", "value")
value = r.get("key")
```

---

## Multi-Region Deployment

Fly.io's primary advantage is running your app in multiple regions close to your users.

### Add Regions

```bash
# List available regions
fly platform regions

# Scale your app to multiple regions
fly scale count 2 --region iad,lhr

# Or add machines in specific regions
fly machine clone --region nrt
fly machine clone --region sin
```

### Primary Region and Databases

Keep your database in (or close to) your app's primary region for write latency. Managed Postgres is available in 12 regions -- pick the region when running `fly mpg create`:

```bash
fly mpg create
# Choose the same region as your app's primary_region (e.g., iad)
```

### fly.toml Multi-Region Example

```toml
app = "my-express-app"
primary_region = "iad"

# Machines automatically start in the primary region
# Use fly scale count to add machines in other regions
```

---

## Environment Variables (Secrets)

Fly.io uses `fly secrets` for sensitive environment variables and the `[env]` section in `fly.toml` for non-sensitive values.

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (set via `internal_port`) | `3000` |
| `DATABASE_URL` | PostgreSQL connection string (auto-set) | `postgres://user:pass@host/db` |
| `REDIS_URL` | Redis connection string (set manually from `fly redis create` output) | `redis://default:pass@host:6379` |
| `SECRET_KEY` | App secret key | `your-secret-key-here` |
| `NODE_ENV` | Node environment | `production` |
| `FLY_REGION` | Current region (auto-set by Fly) | `iad` |
| `FLY_APP_NAME` | App name (auto-set by Fly) | `my-express-app` |
| `FLY_MACHINE_ID` | Machine ID (auto-set by Fly) | `e784079b449483` |

### Set Secrets via CLI

```bash
# Set a secret (triggers redeploy)
fly secrets set SECRET_KEY=my-super-secret

# Set multiple secrets
fly secrets set SECRET_KEY=my-super-secret API_KEY=abc123

# Set secrets from a file
fly secrets import < .env.production

# List all secrets (values are hidden)
fly secrets list

# Remove a secret
fly secrets unset SECRET_KEY
```

### Non-Secret Environment Variables

Set non-sensitive values in `fly.toml`:

```toml
[env]
  NODE_ENV = "production"
  LOG_LEVEL = "info"
  APP_URL = "https://my-express-app.fly.dev"
```

---

## Custom Domain

### Step 1: Add a Certificate

```bash
# Add a custom domain certificate
fly certs add yourdomain.com

# Add a wildcard certificate
fly certs add "*.yourdomain.com"

# Check certificate status
fly certs show yourdomain.com

# List all certificates
fly certs list
```

### Step 2: Configure DNS

Fly provides specific DNS instructions when you add a certificate. Typically:

**For apex domain (`yourdomain.com`):**

| Type | Name | Value |
|------|------|-------|
| A | @ | `137.66.XXX.XXX` (shown by `fly certs show`) |
| AAAA | @ | `2a09:8280:1::XXXX` (shown by `fly certs show`) |

**For subdomain (`api.yourdomain.com`):**

| Type | Name | Value |
|------|------|-------|
| CNAME | api | `my-express-app.fly.dev` |

### Step 3: Verify

```bash
# Check certificate status
fly certs check yourdomain.com

# Verify DNS propagation
dig yourdomain.com +short
dig api.yourdomain.com +short
```

Fly automatically provisions and renews SSL certificates via Let's Encrypt once DNS propagates.

---

## Pricing

Fly.io no longer offers free allowances or plans to new customers -- new organizations are pure pay-as-you-go, and all organizations require a credit card on file. (The old free allowances, like 3 shared-cpu-1x 256MB VMs, apply only to grandfathered legacy accounts.)

| Feature | Price | Notes |
|---------|-------|-------|
| **Shared CPU VMs** | shared-cpu-1x 256MB from ~$2.02/mo | Billed per second while running |
| **Outbound Bandwidth** | $0.02-$0.12/GB by region | Inbound is free |
| **Anycast IPs** | Shared IPv4 free; dedicated IPv4 $2/mo | IPv6 is free |
| **Certificates** | First 10 single-hostname SSL certs free, then $0.10/mo each | Auto-provisioned |
| **Managed Postgres** | Basic plan from $38/mo + $0.28/GB storage per 30-day month | Shared 2x CPU, 1GB RAM |
| **Upstash Redis** | Pay-as-you-go $0.20 per 100K requests; fixed plans $10-$400/mo | Via Fly partnership |

### Key things to know:

- **Machines auto-stop by default.** When `auto_stop_machines = "stop"` is set, idle machines stop and restart on incoming requests (cold start of ~1-3 seconds).
- **Stopped machines cost almost nothing.** You pay only for rootfs storage while a machine is stopped, so auto-stop keeps low-traffic apps cheap.
- **A credit card is required** for all new organizations before you can deploy.
- **The Managed Postgres Basic plan is a starting point** -- scale the plan up for production HA workloads.

---

## Fly CLI Quick Reference

```bash
# App management
fly apps list                    # List all apps
fly apps destroy my-app          # Delete an app
fly status                       # Show app status and machines
fly info                         # Show app info

# Deployment
fly deploy                       # Deploy the app
fly deploy --strategy rolling    # Rolling deployment
fly deploy --strategy canary     # Canary deployment
fly releases                     # List recent releases

# Scaling
fly scale show                   # Show current scale
fly scale count 3                # Scale to 3 machines
fly scale count 2 --region iad   # Scale in specific region
fly scale memory 512             # Set memory to 512MB
fly scale vm shared-cpu-1x       # Set VM size

# Logs and debugging
fly logs                         # Stream live logs
fly ssh console                  # SSH into a running machine
fly machine list                 # List all machines
fly doctor                       # Diagnose common issues

# Networking
fly ips list                     # List allocated IPs
fly ips allocate-v4              # Allocate a dedicated IPv4
fly proxy 3000                   # Proxy local port to app
```

---

## Troubleshooting

### Problem: Health check failures causing deployment rollback

**Cause:** The app does not respond on the configured health check path within the timeout, or the internal port is incorrect.

**Fix:**

1. Verify the `internal_port` in `fly.toml` matches the port your app listens on:

```toml
[http_service]
  internal_port = 3000
```

2. Ensure your health check endpoint returns a 200 response:

```js
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
```

3. Increase the health check grace period for slow-starting apps:

```toml
[checks]
  [checks.health]
    port = 3000
    type = "http"
    interval = "15s"
    timeout = "5s"
    grace_period = "30s"
    method = "GET"
    path = "/health"
```

4. Check deployment logs:

```bash
fly logs
fly releases
```

### Problem: OOM (Out of Memory) kills

**Cause:** The app exceeds the allocated memory for the VM. `fly launch` defaults to shared-cpu-1x with 1GB RAM, but smaller configs (e.g., 256MB) hit this quickly.

**Fix:**

1. Scale up memory:

```bash
fly scale memory 512
```

2. For Node.js, limit the V8 heap size to stay within bounds:

```toml
[env]
  NODE_OPTIONS = "--max-old-space-size=200"
```

3. For Python, monitor memory usage and optimize:

```python
# Add memory profiling
import tracemalloc
tracemalloc.start()
```

4. Check memory usage:

```bash
fly machine status <machine-id>
fly ssh console -C "free -m"
```

5. If the app genuinely needs more memory, upgrade the VM:

```bash
fly scale vm shared-cpu-2x   # 512MB RAM
fly scale vm performance-1x  # 2GB RAM
```

### Problem: Volume mounting issues

**Cause:** Volumes are region-specific and can only be attached to one machine at a time.

**Fix:**

1. Create a volume in the correct region:

```bash
# List existing volumes
fly volumes list

# Create a volume in your app's region
fly volumes create my_data --region iad --size 1
```

2. Mount the volume in `fly.toml`:

```toml
[mounts]
  source = "my_data"
  destination = "/data"
```

3. Ensure your app writes to the mount path (`/data`), not to the container filesystem (which is ephemeral)

4. If you need the same data in multiple regions, use a database instead of volumes, or implement replication

5. Extend an existing volume:

```bash
fly volumes extend <volume-id> --size 5
```

### Problem: DNS not resolving or custom domain not working

**Cause:** DNS records are incorrect, not propagated, or the certificate is not yet issued.

**Fix:**

1. Check certificate status:

```bash
fly certs show yourdomain.com
```

2. Verify DNS records are correct:

```bash
dig yourdomain.com A +short
dig yourdomain.com AAAA +short
dig api.yourdomain.com CNAME +short
```

3. If using Cloudflare, disable the proxy (orange cloud) temporarily until the Fly certificate is issued, then re-enable it

4. Wait up to 48 hours for DNS propagation (usually much faster)

5. Remove and re-add the certificate if stuck:

```bash
fly certs remove yourdomain.com
fly certs add yourdomain.com
```

### Problem: Need to rollback a failed deployment

**Cause:** A new deployment introduced a bug or broke the app.

**Fix:**

1. List recent releases to find a working version:

```bash
fly releases
```

Output:

```
VERSION STABLE  TYPE     STATUS    DESCRIPTION            USER            DATE
v5      true    release  succeeded Deploy image ...       user@email.com  2024-01-15
v4      true    release  succeeded Deploy image ...       user@email.com  2024-01-14
```

2. Rollback to a previous release:

```bash
# Redeploy a specific image version
fly deploy --image registry.fly.io/my-express-app:deployment-<id>
```

3. Or use machine-level rollback:

```bash
# List machines
fly machine list

# Update a machine to a previous image
fly machine update <machine-id> --image registry.fly.io/my-express-app:deployment-<id>
```

4. For immediate mitigation, scale to zero and back:

```bash
fly scale count 0
fly scale count 1
```

### Problem: App works locally but fails on Fly

**Cause:** Docker build differences, missing environment variables, or architecture mismatch.

**Fix:**

1. Test the Docker build locally:

```bash
docker build -t my-app .
docker run -p 3000:3000 -e PORT=3000 my-app
```

2. Check that all required secrets are set:

```bash
fly secrets list
```

3. SSH into the running machine to debug:

```bash
fly ssh console
# Inside the machine:
env | sort        # Check environment variables
ls /app           # Verify files are present
curl localhost:3000/health  # Test the app internally
```

4. Run the Fly doctor to check for common issues:

```bash
fly doctor
```
