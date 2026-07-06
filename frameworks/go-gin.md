# Deploy Go (Gin)

> Deploy a Gin API to Fly.io, Railway, or Render with a static binary, release mode, health checks, and graceful shutdown.

This guide covers deploying a production-ready Gin application to three platforms: **Fly.io** (pay-as-you-go, no free tier for new accounts), **Railway** ($1/month free credit), and **Render** (free tier with spin-down). It includes release mode configuration, static binary builds, minimal Docker images, and the health check pattern every platform expects.

## Prerequisites

- [ ] [Go 1.25+](https://go.dev/dl/) installed (latest stable is 1.26.4; Gin's quickstart requires Go 1.25 or above)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup) (for Railway and Render auto-deploys)
- [ ] [Docker](https://docs.docker.com/get-started/get-docker/) installed (optional, for the container image in Step 4)
- [ ] (For Fly.io) [flyctl](https://fly.io/docs/flyctl/install/) installed and a [Fly.io account](https://fly.io/) (credit card required)
- [ ] (For Railway) A [Railway account](https://railway.com/)
- [ ] (For Render) A [Render account](https://render.com/) (sign up with GitHub)

---

## Step 1: Create a Gin App

```bash
mkdir my-gin-api && cd my-gin-api
go mod init github.com/<username>/my-gin-api
go get -u github.com/gin-gonic/gin
# installs Gin v1.12.0 (2026-02-28), which requires Go 1.24+
```

Create `main.go`:

```go
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
)

func main() {
	router := gin.Default()

	// Gin trusts ALL proxies by default -- the docs call this "NOT safe".
	// Pass nil so ClientIP() returns the remote address directly,
	// or list your proxy's IPs/CIDRs if you need the real client IP.
	router.SetTrustedProxies(nil)

	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": "API is running"})
	})

	// Health check -- Fly, Railway, and Render all probe this
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// Every platform below injects PORT; bind 0.0.0.0, never 127.0.0.1
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:    ":" + port, // ":" prefix binds 0.0.0.0
		Handler: router,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %s", err)
		}
	}()

	// Graceful shutdown -- PaaS platforms send SIGTERM on deploy and spin-down
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("server forced to shutdown:", err)
	}
}
```

If you don't need graceful shutdown, `router.Run()` with no arguments binds `0.0.0.0:8080` and respects the `PORT` env var automatically. The explicit `http.Server` version above is what the Gin docs recommend for production.

Test locally:

```bash
go run .
# [GIN-debug] Listening and serving HTTP on :8080
curl http://localhost:8080/health
# {"status":"ok"}
```

---

## Step 2: Switch to Release Mode

In debug mode Gin prints this on every start:

```
[WARNING] Running in "debug" mode. Switch to "release" mode in production.
 - using env:   export GIN_MODE=release
 - using code:  gin.SetMode(gin.ReleaseMode)
```

Set release mode via the environment (preferred -- no code change between dev and prod):

```bash
export GIN_MODE=release   # Windows PowerShell: $env:GIN_MODE="release"
go run .
```

Or programmatically, before creating the router:

```go
gin.SetMode(gin.ReleaseMode)
```

Valid `GIN_MODE` values are `debug`, `release`, and `test`. Production should always run `release`.

---

## Step 3: Build a Static Binary

```bash
CGO_ENABLED=0 go build -ldflags="-s -w" -o app .
./app
```

What the flags do:

- `CGO_ENABLED=0` produces a fully static binary with no libc dependency -- it runs in `scratch` and distroless images.
- `-s` omits the symbol table and debug information (and implies `-w`).
- `-w` omits the DWARF symbol table.

Together they cut binary size significantly with no runtime cost.

---

## Step 4: Containerize (Distroless or Scratch)

Multi-stage build: compile in the official `golang` image, ship only the binary. Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM golang:1.26 AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /go/bin/app .

# distroless/static (~2 MiB) ships ca-certificates, tzdata,
# a root /etc/passwd entry, and /tmp -- everything scratch lacks
FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /go/bin/app /
ENV GIN_MODE=release
EXPOSE 8080
CMD ["/app"]
```

Build and run:

```bash
docker build -t my-gin-api .
docker run -p 8080:8080 my-gin-api
curl http://localhost:8080/health
```

Image choices:

- **`gcr.io/distroless/static-debian13`** -- recommended for static Go binaries. The `:nonroot` tag runs as a non-root user.
- **`FROM scratch`** -- an empty base image; smallest possible, but ships no CA bundle, so any outbound HTTPS call fails with `x509: certificate signed by unknown authority`. Use distroless unless your app makes zero outbound TLS calls.
- **`gcr.io/distroless/base`** -- use only if you need cgo/libc (adds glibc and libssl).
- **`golang:alpine`** as a builder is "highly experimental, and not officially supported by the Go project" due to musl libc. Stick with the default Debian-based tags (`1.26` = 1.26.4, also tagged `bookworm`/`trixie`).

---

## Step 5: Push to GitHub

Railway and Render deploy from GitHub. Fly.io deploys from your local directory, so you can skip this for Fly-only setups (but push anyway).

```bash
git init
git branch -M main
cat > .gitignore <<'EOF'
app
*.exe
.env
EOF
git add .gitignore go.mod go.sum main.go Dockerfile
git commit -m "Initial commit"
git remote add origin https://github.com/<username>/my-gin-api.git
git push -u origin main
```

---

## Option A: Deploy to Fly.io

> **No free tier.** Fly.io no longer offers free plans to new customers. New organizations are pay-as-you-go, require a credit card, and are billed only for resources consumed. The cheapest machine (shared-cpu-1x, 256 MB RAM) costs $0.0028/hour, about $2.02/month running 24/7. A stopped machine's rootfs still costs $0.15 per GB per 30 days.

### Step A1: Launch

```bash
fly launch
# Detected a Go app
```

`fly launch` reads the Go version from `go.mod` and generates a multi-stage Debian bookworm Dockerfile with CGO enabled by default, plus a `fly.toml`. If you prefer the distroless image from Step 4, keep your own Dockerfile instead of the generated one.

### Step A2: Configure fly.toml

The default `internal_port` is 8080, which matches Gin's default. Add a health check:

```toml
[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

  [[http_service.checks]]
    grace_period = "10s"
    interval = "30s"
    method = "GET"
    timeout = "5s"
    path = "/health"
```

`auto_stop_machines = "stop"` plus `min_machines_running = 0` stops machines when idle so you only pay for actual usage (accepted values: `"off"`, `"stop"`, `"suspend"`).

### Step A3: Deploy

```bash
fly deploy
fly status      # machine states and health checks
fly apps open   # opens https://my-gin-api.fly.dev
```

Secrets are runtime-only and never baked into the image:

```bash
fly secrets set DATABASE_URL="postgres://..."
```

If the build hangs, retry with `fly deploy --depot=false` or `fly deploy --local-only`. If you get a registry 401, run `fly auth logout` then `fly auth login`.

---

## Option B: Deploy to Railway

### Step B1: Create the Service

1. Go to [railway.com/new](https://railway.com/new)
2. Choose **Deploy from GitHub repo** and select `my-gin-api`
3. Railway's default builder, Railpack, detects Go from `go.mod` (or `go.work`, or a root `main.go`) and builds a static binary named `out` with `-ldflags="-w -s"` -- no build config needed

Railpack resolves the Go version in this order: `mise.toml`/`.tool-versions`, then `go.mod`, then the `RAILPACK_GO_VERSION` env var, then default 1.23. Keep the `go` directive in `go.mod` current -- the 1.23 fallback is below Gin v1.12.0's minimum of Go 1.24.

### Step B2: Add a Health Check (config-as-code)

Create `railway.json` in the repo root:

```json
{
  "build": {
    "builder": "RAILPACK"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300
  }
}
```

The health check must return HTTP 200 on that path. Railway injects a `PORT` env var and probes the same port your app listens on -- the `os.Getenv("PORT")` in Step 1 handles this. Default timeout is 300 seconds (adjustable via `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`).

### Step B3: Get a Public URL

1. Open the service **Settings** > **Networking** > **Public Networking**
2. Click **Generate Domain** for a `.railway.app` URL

Push to `main` to redeploy:

```bash
git add railway.json
git commit -m "Add Railway health check config"
git push
```

---

## Option C: Deploy to Render

### Step C1: Create the Web Service

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service** and connect your GitHub repository
3. Configure:
   - **Name:** `my-gin-api`
   - **Language:** Go (native runtime)
   - **Build Command:** `go build -tags netgo -ldflags '-s -w' -o app`
   - **Start Command:** `./app`
   - **Instance Type:** Free
4. Under **Advanced**, set **Health Check Path** to `/health`
5. Click **Create Web Service**

Your API is live at the assigned `https://my-gin-api.onrender.com` URL.

### Step C2: Know the Runtime Rules

- Render injects `PORT` (default `10000`) and requires binding to host `0.0.0.0` -- the deploy fails if Render cannot detect a bound port. The code from Step 1 satisfies both.
- Ports 18012, 18013, and 19099 are reserved -- don't bind them.
- The native Go runtime auto-updates to the latest stable Go 1.x (usually within 24 hours of release) and **cannot be pinned**, unlike Node or Python. To lock a Go version, deploy the Docker image from Step 4 instead (select **Docker** as the language).
- Deploy timeouts: build command 120 minutes, pre-deploy 30 minutes, start command 15 minutes. If any command fails or times out, the entire deploy fails.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Port to listen on (Railway injects it; Render defaults to `10000`; Fly routes to `internal_port`) | `8080` |
| `GIN_MODE` | Gin mode: `debug`, `release`, or `test` | `release` |
| `DATABASE_URL` | Database connection string (if you add one) | `postgres://user:pass@host/db` |

### Set on Fly.io

```bash
fly secrets set GIN_MODE=release DATABASE_URL="postgres://..."
```

Secrets are runtime-only. Non-secret values like `GIN_MODE` can also live in the Dockerfile (`ENV GIN_MODE=release`, as in Step 4).

### Set on Railway

1. Open the service and click the **Variables** tab
2. Add each variable and deploy

### Set on Render

1. Go to your service on Render
2. Click the **Environment** tab
3. Add each variable
4. Click **Save Changes** (triggers redeploy)

---

## Custom Domain

### Fly.io

```bash
fly certs add api.example.com
# wildcard needs quotes: fly certs add "*.example.com"
fly certs check api.example.com   # verify issuance
fly certs setup api.example.com   # prints the DNS records to create
```

If the app has no public IPs yet, allocate them with `fly ips allocate`. For an apex domain, create A + AAAA records pointing at those IPs; for a subdomain, a CNAME to `my-gin-api.fly.dev` is enough.

### Railway

1. Service **Settings** > **Networking** > add a custom domain
2. Add **both** the CNAME and TXT records Railway shows you at your DNS host -- the TXT record is required for verification

### Render

1. Service **Settings** > **Custom Domains** > **Add Custom Domain**, then click **Verify**
2. Configure DNS:

| Type | Name | Value |
|------|------|-------|
| A | `@` (apex) | `216.24.57.1` |
| CNAME | `www` | `my-gin-api.onrender.com` |

3. Remove any AAAA records -- Render does not support IPv6 for custom domains
4. TLS certificates are issued and renewed automatically, with HTTP to HTTPS redirect

---

## Free Tier Info

| Platform | Free tier | Exact limits |
|----------|-----------|--------------|
| Fly.io | **None** for new customers | Pay-as-you-go, credit card required. shared-cpu-1x 256 MB: $0.0028/hr (~$2.02/mo); stopped machine rootfs: $0.15/GB per 30 days. Legacy free allowances only apply to pre-2024-10-07 plans. |
| Railway | Free plan: $0/mo with $1 non-rolling credit per month | 1 replica, 0.5 GB RAM, 1 vCPU, 0.5 GB volume. New accounts get a one-time $5 trial credit for up to 30 days (Hobby features, capped at 1 GB RAM, shared vCPU, 5 services/project), then revert to Free. Unverified GitHub accounts get restricted outbound network access. Hobby is $5/mo including $5 usage; overages: $10/GB RAM/mo, $20/vCPU/mo, $0.05/GB egress. |
| Render | Free web services | 750 free instance hours per workspace per calendar month. Spins down after 15 minutes without traffic (~1 minute to restart). No persistent disk, single instance, no SSH, outbound SMTP ports (25/465/587) blocked, and Render may restart Free services at any time. |

---

## Troubleshooting

### Problem: Logs show `[WARNING] Running in "debug" mode` in production

**Cause:** `GIN_MODE` is unset, so Gin defaults to debug mode (verbose logging, slower).

**Fix:** Set the env var on the platform (or `ENV GIN_MODE=release` in the Dockerfile):

```bash
export GIN_MODE=release
```

Or in code, before creating the router: `gin.SetMode(gin.ReleaseMode)`.

### Problem: 502 "Application failed to respond" (Railway) or "no open ports detected" (Render)

**Cause:** The app bound to `127.0.0.1`/`localhost`, or ignored the platform's `PORT` env var. Railway's Edge Proxy and Render both require `0.0.0.0` on the injected port.

**Fix:** Read `PORT` and bind with a bare `:` prefix (which binds `0.0.0.0`):

```go
port := os.Getenv("PORT")
if port == "" {
	port = "8080"
}
srv := &http.Server{Addr: ":" + port, Handler: router}
```

On Railway, also confirm the domain's target port matches the port the app listens on.

### Problem: Fly.io health checks fail and requests return 503

**Cause:** The app bound to localhost instead of `0.0.0.0` on `internal_port` (Fly warns "The app is not listening on the expected address"), the machine is OOM-killed, or the app starts slower than the check's grace period.

**Fix:**

1. Bind `0.0.0.0:8080` to match `internal_port = 8080`
2. Raise `grace_period` to `"15s"`-`"30s"` in `[[http_service.checks]]`
3. If OOM: `fly scale memory 512`
4. Give the check a dedicated `/health` endpoint that returns 200

### Problem: `x509: certificate signed by unknown authority` on outbound HTTPS calls

**Cause:** The final image is `scratch`, which ships no CA certificate bundle, so Go cannot verify TLS peers.

**Fix:** Use `gcr.io/distroless/static-debian13` as the final stage -- it includes ca-certificates, tzdata, a root `/etc/passwd` entry, and `/tmp`:

```dockerfile
FROM gcr.io/distroless/static-debian13:nonroot
COPY --from=build /go/bin/app /
CMD ["/app"]
```

### Problem: `ClientIP()` returns the wrong address behind the platform proxy

**Cause:** Gin trusts all proxies by default, which the Gin docs explicitly call "NOT safe" -- any client can spoof `X-Forwarded-For`.

**Fix:** Restrict trusted proxies to known addresses or CIDRs, or disable proxy trust entirely:

```go
// trust a specific proxy network
router.SetTrustedProxies([]string{"10.0.0.0/8"})

// or, when not behind a proxy, return the remote address directly
router.SetTrustedProxies(nil)
```

### Problem: Render builds with a different Go version than local

**Cause:** Render's native Go runtime always auto-updates to the latest stable Go 1.x and cannot be pinned to a specific version (there is no Go equivalent of `NODE_VERSION`/`PYTHON_VERSION`).

**Fix:** Deploy as a Docker service instead, pinning the builder image:

```dockerfile
FROM golang:1.26.4 AS build
```

Everything else in the Step 4 Dockerfile stays the same.
