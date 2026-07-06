# Docker

> Build, containerize, and run applications with Docker -- the foundational reference for all container-based platform guides.

Docker packages your application and its dependencies into a portable container that runs identically on any machine. This guide covers Dockerfile best practices, multi-stage builds, Docker Compose for local development, and production-ready container patterns. It serves as the reference guide for platform-specific guides like [AWS ECS](aws-ecs.md), [Fly.io](fly-io.md), and [DigitalOcean](digitalocean.md).

## Prerequisites

- [ ] [Docker Desktop](https://docs.docker.com/get-docker/) installed (includes Docker Engine and Docker Compose)
- [ ] Basic command-line familiarity
- [ ] A project to containerize (Node.js, Python, or Go examples below)

Verify your setup:

```bash
docker --version
docker compose version
```

---

## Dockerfile Best Practices

### Node.js Dockerfile

```dockerfile
# -- Stage 1: Install dependencies --
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# -- Stage 2: Production image --
FROM node:24-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
```

**Why this works well:**
- **Multi-stage build** -- separates dependency installation from the final image, keeping it small
- **`npm ci`** -- installs exact versions from `package-lock.json` (reproducible builds)
- **`--omit=dev`** -- excludes devDependencies from the image (the old `--only=production` flag is deprecated)
- **Alpine base** -- ~50 MB instead of ~350 MB for the full Debian image
- **Non-root user** -- security best practice (never run as root in production)
- **HEALTHCHECK** -- lets Docker, Compose (`depends_on: service_healthy`), and Swarm detect unhealthy containers. Note: ECS and Kubernetes do NOT read the Dockerfile HEALTHCHECK -- ECS needs the check declared in the task definition, Kubernetes uses liveness/readiness probes in the Pod spec

**Using pnpm instead of npm?** Enable it via Corepack and use `pnpm fetch` + `pnpm install --prod` in the deps stage (pnpm 11 requires Node 22.13+, so `node:24-alpine` works). See the [official pnpm Docker guide](https://pnpm.io/docker).

### Python Dockerfile

```dockerfile
# -- Stage 1: Install dependencies --
FROM python:3.13-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# -- Stage 2: Production image --
FROM python:3.13-slim
RUN groupadd -r appgroup && useradd -r -g appgroup appuser
WORKDIR /app

COPY --from=builder /install /usr/local
COPY . .

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Notes:**
- `python:3.13-slim` is a good balance between size and compatibility (smaller than full, larger than alpine but avoids musl issues); `python:3.14-slim` is the newest stable line
- `--prefix=/install` isolates installed packages for clean copy into the final stage
- `--no-cache-dir` prevents pip from caching downloaded packages in the image
- If you use [uv](https://docs.astral.sh/uv/guides/integration/docker/) instead of pip: copy the static binary with `COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/`, then `COPY pyproject.toml uv.lock ./` and `RUN uv sync --locked` -- same layer-caching benefits, much faster installs

### Go Dockerfile

```dockerfile
# -- Stage 1: Build the binary --
FROM golang:1.26-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server .

# -- Stage 2: Minimal production image --
FROM scratch
COPY --from=builder /app/server /server
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

EXPOSE 8080

ENTRYPOINT ["/server"]
```

**Why Go Dockerfiles are special:**
- Go compiles to a static binary -- the final image can use `scratch` (literally empty, ~0 MB base)
- `CGO_ENABLED=0` ensures a statically linked binary
- `-ldflags="-s -w"` strips debug symbols to reduce binary size
- Copy CA certificates for HTTPS outbound requests
- Result: a Docker image under 15 MB

---

## Multi-Stage Builds Explained

Multi-stage builds use multiple `FROM` instructions. Each `FROM` starts a new stage. Only the final stage ends up in your image.

```
Stage 1 (builder): Install deps, compile code   --> DISCARDED
Stage 2 (final):   Copy only what you need       --> YOUR IMAGE
```

**Size comparison for a Node.js app:**

| Approach | Image Size |
|----------|-----------|
| `node:24` (single stage) | ~350 MB |
| `node:24-alpine` (single stage) | ~180 MB |
| `node:24-alpine` (multi-stage) | ~80 MB |

To verify your image size:

```bash
docker images my-app
```

---

## .dockerignore

Always create a `.dockerignore` file to prevent unnecessary files from being copied into the image. This speeds up builds and reduces image size.

```
# Dependencies (installed in container)
node_modules
__pycache__
*.pyc
venv
.venv

# Version control
.git
.gitignore

# Environment and secrets
.env
.env.*
*.pem

# Docker files (prevent recursive copies)
Dockerfile
docker-compose*.yml
.dockerignore

# IDE and OS files
.vscode
.idea
*.swp
.DS_Store
Thumbs.db

# Build output
dist
build
coverage
.next
```

For extra safety, prefer copying only the directories you need (`COPY src/ ./src`) over a blanket `COPY . .` -- belt and suspenders with `.dockerignore` against secrets or `.git` sneaking into image layers.

---

## Building and Running Containers

### Build an Image

```bash
# Basic build
docker build -t my-app .

# Build with a specific tag
docker build -t my-app:1.0.0 .

# Build with build arguments
docker build --build-arg NODE_ENV=production -t my-app .

# Build for a specific platform (useful on Apple Silicon)
docker build --platform linux/amd64 -t my-app .
```

### Run a Container

```bash
# Basic run (foreground)
docker run -p 3000:3000 my-app

# Run in background (detached)
docker run -d -p 3000:3000 --name my-app my-app

# Run with environment variables
docker run -d -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://user:pass@host:5432/db" \
  my-app

# Run with an env file
docker run -d -p 3000:3000 --env-file .env my-app

# Run with a volume (persist data or mount code for development)
docker run -d -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  my-app

# Run with volume for live development (mount source code)
docker run -d -p 3000:3000 \
  -v $(pwd):/app \
  -v /app/node_modules \
  my-app
```

### Manage Containers

```bash
# List running containers
docker ps

# List all containers (including stopped)
docker ps -a

# View logs
docker logs my-app
docker logs -f my-app    # Follow/stream logs

# Execute a command inside a running container
docker exec -it my-app sh

# Stop and remove
docker stop my-app
docker rm my-app

# Remove all stopped containers
docker container prune
```

### Tag and Push to a Registry

```bash
# Tag for Docker Hub
docker tag my-app:latest yourusername/my-app:latest
docker tag my-app:latest yourusername/my-app:1.0.0

# Push to Docker Hub
docker login
docker push yourusername/my-app:latest
docker push yourusername/my-app:1.0.0

# Tag for AWS ECR
docker tag my-app:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/my-app:latest
```

---

## Docker Compose for Local Development

Docker Compose lets you define and run multi-container applications. It is essential for local development when your app depends on databases, caches, or other services.

### Example 1: Express + MongoDB

Create `docker-compose.yml`:

```yaml
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - MONGODB_URI=mongodb://mongo:27017/myapp
    volumes:
      - .:/app
      - /app/node_modules
    depends_on:
      mongo:
        condition: service_healthy
    restart: unless-stopped

  mongo:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mongo_data:
```

### Example 2: FastAPI + PostgreSQL

Create `docker-compose.yml`:

```yaml
services:
  api:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/myapp
      - PYTHON_ENV=development
    volumes:
      - .:/app
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  db:
    image: postgres:18-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=myapp
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pg_data:
```

### Example 3: Full Stack (React + Express + MongoDB + Redis)

```yaml
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://localhost:3000

  api:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - MONGODB_URI=mongodb://mongo:27017/myapp
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./backend:/app
      - /app/node_modules
    depends_on:
      mongo:
        condition: service_healthy
      redis:
        condition: service_healthy

  mongo:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo_data:/data/db
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mongo_data:
  redis_data:
```

### Docker Compose Commands

```bash
# Start all services (foreground)
docker compose up

# Start all services (background)
docker compose up -d

# Start and rebuild images
docker compose up --build

# Stop all services
docker compose down

# Stop and remove volumes (deletes database data)
docker compose down -v

# View logs
docker compose logs
docker compose logs api      # Specific service
docker compose logs -f api   # Follow logs

# Restart a specific service
docker compose restart api

# Run a one-off command
docker compose exec api sh
docker compose exec db psql -U postgres -d myapp
```

### Compose Watch (modern dev loop)

Instead of relying only on bind-mount volumes, [Compose Watch](https://docs.docker.com/compose/how-tos/file-watch/) syncs file changes and rebuilds automatically:

```yaml
services:
  api:
    build: .
    develop:
      watch:
        - action: sync          # Hot-reload: copy changed files into the container
          path: ./src
          target: /app/src
        - action: rebuild       # Rebuild the image when dependencies change
          path: package.json
```

```bash
docker compose up --watch
```

---

## Health Checks

Health checks tell Docker whether your container is working correctly. Docker itself, Docker Compose (`depends_on: condition: service_healthy`), and Docker Swarm honor the Dockerfile `HEALTHCHECK`. ECS and Kubernetes do not: ECS only monitors health checks declared in the task definition, and Kubernetes ignores `HEALTHCHECK` entirely in favor of liveness/readiness/startup probes in the Pod spec.

### In Dockerfile

```dockerfile
# HTTP health check (Node.js)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# HTTP health check (Python)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# TCP health check (generic)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD nc -z localhost 3000 || exit 1
```

### In Docker Compose

```yaml
services:
  api:
    build: .
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
```

### Health Check Parameters

| Parameter | Description | Recommended |
|-----------|-------------|-------------|
| `interval` | Time between checks | 30s |
| `timeout` | Max time for a check to complete | 5s |
| `start_period` | Grace period on startup before failures count | 10-60s |
| `start_interval` | Check interval during the start period (faster "healthy" on boot) | 5s |
| `retries` | Failures needed to mark unhealthy | 3 |

Check container health status:

```bash
docker inspect --format='{{.State.Health.Status}}' my-app
# healthy, unhealthy, or starting
```

---

## Production Docker Tips

### 1. Run as a Non-Root User

Never run containers as root in production. Create a dedicated user:

```dockerfile
# Alpine-based images
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Debian/Ubuntu-based images
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Switch to the non-root user
USER appuser
```

### 2. Handle Signals Properly (Graceful Shutdown)

Docker sends SIGTERM when stopping a container. Your app must handle it:

```js
// Node.js
const server = app.listen(PORT);

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed.');
    process.exit(0);
  });
});
```

```python
# Python (FastAPI with uvicorn handles this automatically)
# uvicorn has built-in graceful shutdown on SIGTERM
```

Use `exec` form for CMD so the process receives signals directly (PID 1):

```dockerfile
# CORRECT: exec form (process is PID 1, receives SIGTERM)
CMD ["node", "server.js"]

# WRONG: shell form (node runs as child of /bin/sh, does not get SIGTERM)
CMD node server.js
```

### 3. Optimize Layer Caching

Docker caches each layer. Order your Dockerfile so frequently changing steps come last:

```dockerfile
# GOOD: dependencies change less often than code
COPY package*.json ./          # Layer 1: rarely changes
RUN npm ci --omit=dev          # Layer 2: cached unless package.json changes
COPY . .                       # Layer 3: changes with every code update

# BAD: code change invalidates dependency cache
COPY . .                       # Changes every time -> everything below re-runs
RUN npm ci --omit=dev          # Re-installs every build
```

Go further with BuildKit cache mounts -- they persist the package manager's download cache across builds even when the dependency layer is invalidated:

```dockerfile
# npm
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# pip
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
```

### 4. Use Specific Image Tags

```dockerfile
# BEST: pinned to a digest, fully reproducible (Docker Scout can automate digest bumps)
FROM node:24-alpine@sha256:<digest>

# GOOD: major version of a supported LTS line
FROM node:24-alpine

# BAD: unpredictable, may break
FROM node:latest
```

### 5. Minimize the Number of Layers

Combine related RUN commands:

```dockerfile
# GOOD: single layer
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# BAD: three separate layers, leftover cache
RUN apt-get update
RUN apt-get install -y curl
```

### 6. Use .env Files for Local Development Only

```bash
# .env (never commit this file)
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
SECRET_KEY=dev-secret-key
NODE_ENV=development
```

```bash
# Run with .env file
docker run --env-file .env my-app

# In Docker Compose, .env is loaded automatically
docker compose up
```

For production, use your platform's secrets management (AWS SSM, DigitalOcean encrypted env vars, etc.).

---

## Troubleshooting

### Problem: Build fails with "COPY failed: file not found"

**Cause:** The file does not exist in the build context, or it is excluded by `.dockerignore`.

**Fix:**

1. Check that the file exists in your project directory
2. Check `.dockerignore` -- make sure it does not exclude the file you need
3. Verify the path is relative to the build context (the directory you pass to `docker build`)

```bash
# The build context is the current directory (.)
docker build -t my-app .

# If your Dockerfile is elsewhere, specify it:
docker build -f docker/Dockerfile -t my-app .
```

### Problem: Container exits immediately (exit code 0 or 1)

**Cause:** The application process ends or crashes on startup.

**Fix:**

```bash
# Check logs
docker logs my-app

# Run interactively to debug
docker run -it my-app sh

# Inside the container, try running the app manually
node server.js
```

Common causes:
- Missing environment variables (e.g., `DATABASE_URL` not set)
- Wrong CMD or ENTRYPOINT
- Application error on startup

### Problem: App runs inside the container but is unreachable from the host

**Cause:** The server is bound to `localhost`/`127.0.0.1` inside the container. That interface is not reachable through the published port.

**Fix:** Bind to `0.0.0.0`:

```dockerfile
# Python/uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

```js
// Node.js
app.listen(3000, '0.0.0.0');
```

### Problem: "port is already allocated" error

**Cause:** Another container or process is using the same host port.

**Fix:**

```bash
# Find what is using the port
docker ps | grep 3000
lsof -i :3000

# Stop the conflicting container
docker stop <container-id>

# Or use a different host port
docker run -p 3001:3000 my-app   # Host port 3001 -> container port 3000
```

### Problem: Changes to code are not reflected in the container

**Cause:** Docker cached the build layers, or you are not using volumes for development.

**Fix:**

```bash
# Rebuild without cache
docker build --no-cache -t my-app .

# Or use Docker Compose with --build
docker compose up --build

# For development, use volumes to mount your code:
docker run -v $(pwd):/app my-app
```

### Problem: Image is too large

**Cause:** Using a large base image, not using multi-stage builds, or including unnecessary files.

**Fix:**

1. Use multi-stage builds (see examples above)
2. Use Alpine or slim base images
3. Create a thorough `.dockerignore`
4. Combine RUN commands to reduce layers
5. Clean up package manager caches:

```dockerfile
# Alpine
RUN apk add --no-cache curl

# Debian
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*
```

Check what is taking space with:

```bash
docker history my-app
# or use dive for a detailed breakdown:
# brew install dive && dive my-app
```

### Problem: "exec format error" when running the image

**Cause:** The image was built for a different CPU architecture (e.g., ARM image on x86 or vice versa).

**Fix:**

```bash
# Build for a specific platform
docker build --platform linux/amd64 -t my-app .

# Build for multiple platforms
docker buildx build --platform linux/amd64,linux/arm64 -t my-app .
```

This commonly happens when building on Apple Silicon (ARM) and deploying to x86 cloud servers.

### Problem: npm install hangs or takes too long inside Docker

**Cause:** Network issues inside Docker, or Docker's DNS resolution is slow.

**Fix:**

```bash
# Use a custom DNS server
docker build --network host -t my-app .

# Or set DNS in Docker daemon config (/etc/docker/daemon.json):
# { "dns": ["8.8.8.8", "8.8.4.4"] }

# Ensure you have a .dockerignore to avoid copying local node_modules
# (which makes the build context huge and slow)
```
