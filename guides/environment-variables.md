# Environment Variables

A cross-cutting reference for managing configuration and secrets across all deployment platforms.

---

## Table of Contents

- [What Are Environment Variables](#what-are-environment-variables)
- [.env Files and dotenv Libraries](#env-files-and-dotenv-libraries)
- [Never Commit Secrets to Git](#never-commit-secrets-to-git)
- [Naming Conventions](#naming-conventions)
- [Build-Time vs Runtime Variables](#build-time-vs-runtime-variables)
- [Framework-Specific Prefixes](#framework-specific-prefixes)
- [Setting Variables by Platform](#setting-variables-by-platform)
- [Common Variables Reference](#common-variables-reference)
- [Secret Rotation Practices](#secret-rotation-practices)
- [Troubleshooting](#troubleshooting)

---

## What Are Environment Variables

Environment variables are key-value pairs set outside your application code that configure its behavior at runtime. They are the standard way to handle:

- **Secrets:** API keys, database passwords, JWT signing keys
- **Configuration:** Database URLs, third-party service endpoints, feature flags
- **Environment differences:** Different values for development, staging, and production

**Why use them instead of hardcoding?**

1. **Security:** Secrets stay out of your source code and version control.
2. **Portability:** The same codebase runs in different environments with different configurations.
3. **Compliance:** Separation of code and config is a best practice (12-Factor App methodology).
4. **Team safety:** Developers can work with local test keys without affecting production.

---

## .env Files and dotenv Libraries

The `.env` file is a simple text file that stores environment variables locally during development.

**Example `.env` file:**

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/myapp

# API Keys
STRIPE_SECRET_KEY=sk_test_abc123
SENDGRID_API_KEY=SG.xxxxxxxxxxxx

# App Config
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

### Node.js (dotenv)

```bash
npm install dotenv
```

```javascript
// Load at the very top of your entry file
require('dotenv').config();
// or with ES modules
import 'dotenv/config';

// Access variables
const dbUrl = process.env.DATABASE_URL;
const port = process.env.PORT || 3000;
```

**Native alternative:** Node.js can load `.env` files without any package: `node --env-file=.env app.js` (stable on Node 22/24). Use `--env-file-if-exists=.env` to skip the error when the file is missing. The `dotenv` package is still useful when the loading must happen inside code (e.g. library-level loading) rather than on the command line.

**Note:** Vite, Next.js, and Create React App have built-in `.env` support. You do NOT need the `dotenv` package with these frameworks.

### Python (python-dotenv)

```bash
pip install python-dotenv
```

```python
from dotenv import load_dotenv
import os

load_dotenv()  # Loads from .env file in the current directory

database_url = os.getenv("DATABASE_URL")
secret_key = os.getenv("SECRET_KEY", "fallback-dev-key")
debug = os.getenv("DEBUG", "False").lower() == "true"
```

**FastAPI example:**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    secret_key: str
    debug: bool = False

settings = Settings()
```

---

## Never Commit Secrets to Git

**This is the most important rule.** Leaked secrets in git history are a leading cause of security breaches.

### .gitignore Setup

Add these lines to your `.gitignore` before your first commit:

```gitignore
# Environment variables
.env
.env.local
.env.production
.env.*.local

# Exception: .env.example is safe to commit
!.env.example
```

### Create a .env.example

Maintain a `.env.example` file that documents required variables without actual values:

```env
# Copy this to .env and fill in your values
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
STRIPE_SECRET_KEY=sk_test_your_key_here
SENDGRID_API_KEY=your_sendgrid_key
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
```

Commit `.env.example` to git so teammates know which variables are needed. Treat it as the canonical variable list: if a secret exists in multiple places (local `.env`, platform dashboard, CI secrets), `.env.example` is the checked-in contract, and a rotated secret must be updated in every place or environments diverge silently.

### If You Accidentally Committed Secrets

1. **Rotate the secret immediately.** Generate a new API key / password. The old one is compromised.
2. Remove the file from tracking: `git rm --cached .env`
3. Add to `.gitignore` and commit.
4. Consider using [git-filter-repo](https://github.com/newren/git-filter-repo) (GitHub's recommended tool, use version 2.47+ with `--sensitive-data-removal`) or [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) to scrub history, but remember: **rotating the secret is the priority.**

---

## Naming Conventions

Use **SCREAMING_SNAKE_CASE** for all environment variable names. This is the universal convention across languages and platforms.

```env
# Good
DATABASE_URL=...
API_SECRET_KEY=...
SMTP_HOST=...
MAX_UPLOAD_SIZE=10485760

# Bad
databaseUrl=...          # camelCase
api-secret-key=...       # kebab-case
smtp host=...            # spaces not allowed
```

**Prefix patterns by context:**

| Prefix | Purpose | Example |
|--------|---------|---------|
| `DB_` | Database configuration | `DB_HOST`, `DB_PORT`, `DB_NAME` |
| `SMTP_` / `MAIL_` | Email configuration | `SMTP_HOST`, `MAIL_FROM` |
| `AWS_` | AWS services | `AWS_ACCESS_KEY_ID`, `AWS_REGION` |
| `REDIS_` | Redis configuration | `REDIS_URL`, `REDIS_PASSWORD` |
| `APP_` | Application-specific | `APP_NAME`, `APP_ENV`, `APP_DEBUG` |

**Tip:** Prefix your own backend variables with an app-specific prefix (e.g., `MYAPP_DATABASE_URL` via pydantic-settings' `env_prefix`). Platforms inject their own variables (`VERCEL_*`, `NEON_*`, `RENDER_*`), and a unique prefix guarantees no collisions.

---

## Build-Time vs Runtime Variables

This distinction is critical and is the source of many deployment bugs.

| Type | When Available | Can Change After Build | Example |
|------|---------------|----------------------|---------|
| **Build-time** | During `npm run build` / `docker build` | No (baked into the output) | `VITE_API_URL`, `NEXT_PUBLIC_ANALYTICS_ID` |
| **Runtime** | When the server process starts | Yes (restart required) | `DATABASE_URL`, `PORT`, `SECRET_KEY` |

**Static sites and SPAs** (React, Vue, Svelte) only have build-time variables. The HTML/JS bundle is static after build, so variables are embedded at build time.

**Server-rendered apps** (Next.js SSR, Express, FastAPI) have both. Server-side code reads variables at runtime; client-side code still needs build-time embedding.

**Docker containers** read runtime variables from the container environment, but `ARG` values in a Dockerfile are build-time only.

**Gotcha:** If the build itself reads external services (e.g., Next.js SSG pages querying a database in `generateStaticParams`), the same variables production needs at runtime must ALSO exist at build time -- in the platform's env settings and in any CI job that runs the build.

---

## Framework-Specific Prefixes

**Warning:** Prefixed variables (`VITE_`, `NEXT_PUBLIC_`, `REACT_APP_`) are baked into the public JavaScript bundle at build time. Anyone can read them in the browser. Never put secrets in them -- only URLs, feature flags, and other public config.

### Vite (React, Vue, Svelte)

Variables must start with `VITE_` to be exposed to client-side code.

```env
# Exposed to the browser (public)
VITE_API_URL=https://api.example.com
VITE_APP_TITLE=My App

# NOT exposed (server/build only)
SECRET_KEY=my-secret
```

Access in code:

```javascript
const apiUrl = import.meta.env.VITE_API_URL;
const mode = import.meta.env.MODE; // 'development' or 'production'
```

Vite loads `.env`, `.env.local`, `.env.development`, `.env.production` automatically based on the mode.

**Tip:** In development, skip `VITE_API_URL` entirely by proxying API calls in `vite.config.ts` (`server: { proxy: { '/api': { target: 'http://localhost:8000', changeOrigin: true } } }`). The app calls relative `/api` paths locally with no CORS setup; only production builds need the baked-in API URL.

### Next.js

Variables starting with `NEXT_PUBLIC_` are exposed to the browser. All others are server-only.

```env
# Exposed to browser AND server
NEXT_PUBLIC_API_URL=https://api.example.com
NEXT_PUBLIC_ANALYTICS_ID=G-XXXXXXXXXX

# Server-only (API routes, getServerSideProps, Server Components)
DATABASE_URL=postgresql://...
JWT_SECRET=my-secret
```

Access in code:

```javascript
// Client or server
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

// Server only (API routes, server components)
const dbUrl = process.env.DATABASE_URL;
```

### Create React App (CRA)

Variables must start with `REACT_APP_` to be embedded at build time.

```env
REACT_APP_API_URL=https://api.example.com
REACT_APP_VERSION=1.2.0
```

Access in code:

```javascript
const apiUrl = process.env.REACT_APP_API_URL;
```

**Note:** Create React App was officially deprecated by the React team on 2025-02-14 and has no active maintainers. This section applies to legacy CRA projects only. New projects should use Vite (or a framework like Next.js) instead.

---

## Setting Variables by Platform

### GitHub Actions

Use **Secrets** for sensitive values and **Variables** for non-sensitive configuration.

**Setting secrets (via dashboard):**
Repository > Settings > Secrets and variables > Actions > New repository secret

**Setting variables (via dashboard):**
Repository > Settings > Secrets and variables > Actions > Variables tab > New repository variable

**Using in workflows:**

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      NODE_ENV: production
    steps:
      - name: Deploy
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          API_KEY: ${{ secrets.API_KEY }}
          APP_VERSION: ${{ vars.APP_VERSION }}
        run: |
          echo "Deploying with version $APP_VERSION"
```

Public build-time values (e.g., a frontend's `VITE_API_BASE_URL`) belong in Variables, not Secrets -- they are baked into the public bundle anyway, and Variables stay visible for debugging.

**Environment-specific secrets:** Create environments (e.g., `staging`, `production`) under Settings > Environments to scope secrets per deployment target.

**AWS deploys:** Prefer OIDC over storing long-lived `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` secrets. Declare `permissions: id-token: write` and use `aws-actions/configure-aws-credentials@v4` with `role-to-assume` pointing at an IAM role that trusts GitHub's OIDC provider. Scope the role's trust policy `sub` claim per environment (e.g., `repo:OWNER/REPO:ref:refs/heads/main` for production, `repo:OWNER/REPO:pull_request` for previews) so PR workflows cannot assume the production role.

---

### Vercel

**Dashboard:** Project > Settings > Environment Variables

You can scope variables to Production, Preview, and Development environments independently.

**CLI:**

```bash
# Add a variable interactively
vercel env add DATABASE_URL

# Add for specific environment
vercel env add DATABASE_URL production

# Pull variables to local .env
vercel env pull .env.local

# List variables
vercel env ls
```

Variables are available at build time and runtime (for serverless functions). `NEXT_PUBLIC_` prefixed variables are embedded in the client bundle at build time.

---

### Render

**Dashboard:** Service > Environment > Environment Variables

**render.yaml (Infrastructure as Code):**

```yaml
services:
  - type: web
    name: my-api
    runtime: node
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        fromDatabase:
          name: my-db
          property: connectionString
      - key: SECRET_KEY
        sync: false  # Must be set manually in dashboard
```

The `sync: false` flag is important for secrets. It tells Render the value must be set manually in the dashboard rather than defined in the YAML file.

---

### Railway

**Dashboard:** Service > Variables tab

**CLI:**

```bash
# Set a variable
railway variable set DATABASE_URL="postgresql://..."

# Set multiple
railway variable set NODE_ENV=production PORT=3000

# List variables
railway variable list

# Delete a variable
railway variable delete OLD_API_KEY
```

Railway supports **shared variables** across services in a project and **reference variables** that pull from other services (e.g., a database's connection string).

---

### Netlify

**Dashboard:** Project > Project configuration > Environment variables

**netlify.toml:**

```toml
[build.environment]
  NODE_VERSION = "22"
  NPM_FLAGS = "--prefix=/dev/null"

# Environment-specific
[context.production.environment]
  API_URL = "https://api.example.com"

[context.deploy-preview.environment]
  API_URL = "https://staging-api.example.com"
```

**CLI:**

```bash
netlify env:set API_KEY "your-key"
netlify env:list
```

**Note:** Only non-sensitive values should go in `netlify.toml` since it is committed to git. Use the dashboard for secrets.

---

### Fly.io

Fly.io uses **secrets** (encrypted, not visible after setting) and **environment variables** (in `fly.toml`, visible).

**Secrets (for sensitive values):**

```bash
# Set secrets
fly secrets set DATABASE_URL="postgresql://..." SECRET_KEY="my-secret"

# List secrets (values are hidden)
fly secrets list

# Remove a secret
fly secrets unset OLD_API_KEY
```

**Environment variables (in fly.toml, for non-sensitive config):**

```toml
[env]
  NODE_ENV = "production"
  PORT = "8080"
  LOG_LEVEL = "info"
```

Setting or changing secrets triggers an automatic redeployment.

---

### AWS (SSM Parameter Store & Secrets Manager)

**SSM Parameter Store** (free, for config and secrets):

```bash
# Store a parameter
aws ssm put-parameter \
  --name "/myapp/production/DATABASE_URL" \
  --type "SecureString" \
  --value "postgresql://..."

# Retrieve
aws ssm get-parameter \
  --name "/myapp/production/DATABASE_URL" \
  --with-decryption
```

**Secrets Manager** (paid, with rotation support):

```bash
# Store a secret
aws secretsmanager create-secret \
  --name "myapp/production/db-credentials" \
  --secret-string '{"username":"admin","password":"secret123"}'

# Retrieve
aws secretsmanager get-secret-value \
  --secret-id "myapp/production/db-credentials"
```

Use SSM Parameter Store for most variables. Use Secrets Manager when you need automatic rotation (e.g., RDS database credentials).

---

## Common Variables Reference

| Variable | Purpose | Example Value |
|----------|---------|---------------|
| `DATABASE_URL` | Database connection string | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://default:pass@host:6379` |
| `API_KEY` | Third-party API key | `sk_live_abc123...` |
| `SECRET_KEY` | App signing/encryption key | `a1b2c3d4e5f6...` (random 64+ chars) |
| `JWT_SECRET` | JSON Web Token signing key | `random-256-bit-string` |
| `NODE_ENV` | Node.js environment | `production`, `development`, `test` |
| `PORT` | Server listening port | `3000`, `8080` |
| `HOST` | Server bind address | `0.0.0.0` |
| `CORS_ORIGIN` | Allowed CORS origin(s) | `https://app.example.com` |
| `SMTP_HOST` | Email server | `smtp.sendgrid.net` |
| `SMTP_PORT` | Email server port | `587` |
| `SMTP_USER` | Email username | `apikey` |
| `SMTP_PASS` | Email password | `SG.xxxxxxx` |
| `AWS_ACCESS_KEY_ID` | AWS credentials | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | `wJalr...` |
| `AWS_REGION` | AWS region | `us-east-1` |
| `SENTRY_DSN` | Error tracking | `https://key@sentry.io/123` |
| `LOG_LEVEL` | Logging verbosity | `info`, `debug`, `warn`, `error` |

### Generating Secure Secret Keys

```bash
# Node.js
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Python
python -c "import secrets; print(secrets.token_hex(64))"

# OpenSSL
openssl rand -hex 64
```

**Fail fast on weak secrets:** Have the app refuse to start in production if `JWT_SECRET` (or equivalent) is unset or shorter than 32 characters. A crash at boot is far better than silently signing tokens with an empty string.

---

## Secret Rotation Practices

Secrets should be rotated regularly and immediately if a breach is suspected.

### Rotation Schedule

| Secret Type | Rotation Frequency | Notes |
|-------------|-------------------|-------|
| API keys | Every 90 days | Or immediately if exposed |
| Database passwords | Every 90 days | Coordinate with connection pool restart |
| JWT signing keys | Every 90-180 days | Old tokens become invalid |
| SSL certificates | Before expiry | Usually auto-renewed |
| OAuth client secrets | Annually | Unless compromised |

### Zero-Downtime Rotation Process

1. **Generate the new secret** on the third-party service (most allow two active keys).
2. **Update the environment variable** on your deployment platform with the new value.
3. **Verify** the application works with the new secret.
4. **Revoke the old secret** on the third-party service.
5. **Document** the rotation date and who performed it.

For database passwords, use a rolling approach:
1. Create a new database user or change the password.
2. Update `DATABASE_URL` on the platform.
3. Trigger a redeployment.
4. Verify connections work.
5. Remove the old user or confirm the old password no longer works.

---

## Troubleshooting

### Variable Not Available in Code

**Symptoms:** `process.env.MY_VAR` is `undefined`, `os.getenv("MY_VAR")` returns `None`.

**Fixes:**
1. **Check the name exactly.** Variable names are case-sensitive. `database_url` is not `DATABASE_URL`.
2. **Check the prefix.** Vite requires `VITE_`, Next.js client requires `NEXT_PUBLIC_`, CRA requires `REACT_APP_`.
3. **Rebuild after adding.** Build-time variables require a new build. If you added a variable on Vercel/Netlify, trigger a redeployment.
4. **Check the environment scope.** On Vercel, variables can be scoped to Production only. Preview deploys will not see them.
5. **Check .env file location.** The `.env` file must be in the project root (next to `package.json`), not in `src/`.

### Variable Works in the App but Not in CLI Tools

**Symptoms:** The framework sees `DATABASE_URL` but a CLI tool run from the same directory (ORM migrations, seed scripts) reports it missing.

**Explanation:** Framework env loading is a framework feature. Next.js auto-loads `.env.local`, but tools like `drizzle-kit` do not, so `db:push` / `db:migrate` fail unless the config file loads it explicitly:

```typescript
// drizzle.config.ts
import { config } from "dotenv";
config({ path: ".env.local" });
```

For standalone scripts, pass the file on the command line: `tsx --env-file=.env.local seed.ts` or `node --env-file=.env app.js`.

### Build-Time vs Runtime Confusion

**Symptoms:** Variable works locally but is `undefined` in production. Variable shows old value after changing on the platform.

**Fixes:**
1. **Static sites (Vite, CRA):** All variables are build-time. Changing them on the platform requires a **new build and deploy**.
2. **Next.js `NEXT_PUBLIC_`:** These are embedded at build time. Changes need a rebuild.
3. **Server-side variables (no prefix in Next.js, Express, FastAPI):** These are runtime. A restart or redeployment picks them up.
4. **Docker:** Variables passed via `-e` or `docker-compose.yml` `environment:` are runtime. Variables set with `ARG`/`ENV` in Dockerfile are build-time.

### Special Characters in Values

**Symptoms:** Variable value is truncated or garbled. Passwords with `$`, `#`, `!`, spaces cause issues.

**Fixes:**
1. **In .env files:** Wrap values with special characters in double quotes:
   ```env
   DATABASE_URL="postgresql://user:p@ss$word@host:5432/db"
   MY_VAR="value with spaces"
   ```
2. **In shell commands:** Use single quotes to prevent shell interpretation:
   ```bash
   fly secrets set DATABASE_URL='postgresql://user:p@ss$word@host/db'
   ```
3. **In YAML (GitHub Actions):** Wrap in quotes and escape as needed:
   ```yaml
   env:
     PASSWORD: "my$ecret"
   ```
4. **Base64 encoding:** For highly complex values, base64 encode them:
   ```bash
   echo -n 'complex!@#value' | base64
   # Store the base64 string, decode in your app
   ```

### Connection String Query Parameters

**Symptoms:** Database connects locally but fails on the deployment platform, often with an SSL or channel binding error.

**Fixes:**
1. **Neon pooled connections:** Neon's console appends `channel_binding=require` by default, but PgBouncer (the pooler) does not support channel binding. Use the pooler connection string with `?sslmode=require` and remove `channel_binding=require`.
2. **Driver scheme mismatches:** SQLAlchemy with psycopg v3 needs `postgresql+psycopg://`, not the bare `postgresql://` most consoles hand out. Normalize the scheme in code or in the stored `DATABASE_URL`.

### Variables Not Available in CI/CD Forks

**Symptoms:** CI pipeline works on main branch but secrets are empty in pull requests from forks.

**Explanation:** This is a security feature. GitHub Actions does not expose secrets to workflows triggered by pull requests from forks (to prevent malicious PRs from exfiltrating secrets).

**Workaround:** Use the `pull_request_target` event instead of `pull_request`, but be extremely careful as this runs with write permissions. Only use it for trusted operations, never to run arbitrary code from the fork.
