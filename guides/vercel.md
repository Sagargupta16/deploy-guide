# Vercel

> Deploy frontend apps and serverless functions with zero configuration on Vercel.

Vercel is the company behind Next.js and provides a platform optimized for frontend frameworks. It supports automatic deployments from Git, serverless functions (running on Fluid compute by default, billed on active CPU), edge functions, and preview deployments for every pull request. The Hobby (free) plan includes 100 GB/month data transfer, 1M function invocations/month, and 4 hours/month of active CPU.

## Prerequisites

- [ ] A [Vercel account](https://vercel.com/signup) (sign up with GitHub for easiest setup)
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] [Node.js 22+](https://nodejs.org/) (Node 18 and 20 are EOL; 24 is the current Active LTS)
- [ ] (Optional) [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel` or `pnpm add -g vercel`

## Deploy Next.js

### Step 1: Create a Next.js App

```bash
npx create-next-app@latest my-nextjs-app
cd my-nextjs-app
```

### Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-nextjs-app.git
git push -u origin main
```

### Step 3: Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Select **Import Git Repository**
3. Choose your `my-nextjs-app` repository
4. Vercel auto-detects Next.js -- no configuration needed
5. Click **Deploy**

Your app is live in under a minute. Every push to `main` triggers a new production deploy. Every pull request gets a unique preview URL.

> Tip: to stop bot branches (Renovate, Dependabot) and every feature branch from spinning up preview deployments, set the project's **Ignored Build Step** (Settings > Git) to a command that exits non-zero for any ref other than the branches you want built. Skipped refs spend no build minutes and create no preview URL.

### Alternative: Deploy via CLI

```bash
cd my-nextjs-app
vercel          # First time: links to your Vercel project
vercel --prod   # Deploy to production
```

---

## Deploy React (Vite)

### Step 1: Create a Vite React App

```bash
npm create vite@latest my-react-app -- --template react
cd my-react-app
npm install
```

### Step 2: Push to GitHub and Import

Push to GitHub (same steps as above), then import in Vercel. Vercel auto-detects Vite and configures the build.

Or deploy via CLI:

```bash
vercel
```

Vercel will ask:
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

That's it. No `base` path configuration needed (unlike GitHub Pages).

---

## Serverless Functions

Vercel supports serverless functions out of the box. Create files in the `api/` directory at your project root. Available Node.js runtimes are 24.x (default), 22.x, and 20.x -- set in **Settings** > **Build and Deployment** or via `engines.node` in `package.json`.

### Example: Node.js API Route

Create `api/hello.js`:

```js
export default function handler(req, res) {
  const { name } = req.query;
  res.status(200).json({ message: `Hello, ${name || 'World'}!` });
}
```

This is automatically deployed at `https://your-app.vercel.app/api/hello?name=Sagar`.

### Example: Using Environment Variables in Functions

Create `api/data.js`:

```js
export default async function handler(req, res) {
  const response = await fetch('https://api.example.com/data', {
    headers: {
      Authorization: `Bearer ${process.env.API_SECRET_KEY}`,
    },
  });
  const data = await response.json();
  res.status(200).json(data);
}
```

### Next.js API Routes

In Next.js (App Router), create `app/api/hello/route.js`:

```js
import { NextResponse } from 'next/server';

export async function GET(request) {
  return NextResponse.json({ message: 'Hello from Next.js!' });
}
```

These are deployed automatically as serverless functions on Vercel.

### Python Functions (FastAPI)

Vercel also runs Python serverless functions. A FastAPI app deploys with a three-line wrapper in `api/index.py`:

```python
from mangum import Mangum
from myapp.main import app

handler = Mangum(app, lifespan="off")
```

plus a `vercel.json` that routes all paths to it. Pin the Python runtime with a `PYTHON_VERSION` env var in the dashboard. Gotcha: FastAPI `BackgroundTasks` are unreliable on serverless -- run post-request work synchronously or hand it to a queue.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `postgresql://user:pass@host/db` |
| `API_SECRET_KEY` | Secret API key (server only) | `sk_live_abc123` |
| `NEXT_PUBLIC_API_URL` | Public API URL (Next.js) | `https://api.example.com` |
| `VITE_API_URL` | Public API URL (Vite) | `https://api.example.com` |

### Set via Dashboard

1. Go to your project on [vercel.com](https://vercel.com)
2. Navigate to **Settings** > **Environment Variables**
3. Add your variables
4. Choose which environments they apply to: **Production**, **Preview**, **Development**

### Set via CLI

```bash
# Add a secret (prompted for value)
vercel env add DATABASE_URL production

# Pull env vars to local .env file
vercel env pull .env.local

# List all env vars
vercel env ls
```

### Important Notes

- Variables prefixed with `NEXT_PUBLIC_` (Next.js) or `VITE_` (Vite) are exposed to the browser. Never put secrets in these.
- Server-side environment variables (no prefix) are only available in API routes and serverless functions.
- After changing env vars, you must redeploy for changes to take effect.
- If your build reads a database (e.g., Next.js `generateStaticParams` querying it during `next build`), the same variables production needs at runtime must also exist at build time -- in the Vercel project env and in any CI that runs the build. `NEXT_PUBLIC_*` / `VITE_*` values are baked into the bundle at build time, so their build-time value is what ships.

---

## Custom Domain

### Step 1: Add Domain in Vercel

1. Go to your project on Vercel
2. Navigate to **Settings** > **Domains**
3. Enter your domain (e.g., `yourdomain.com`) and click **Add**

### Step 2: Configure DNS

Vercel shows the exact DNS records for your project in **Settings** > **Domains** -- copy those values rather than hardcoding ones from a tutorial. Vercel now issues project-specific values: apex domains get a dashboard-provided A record (new domains are commonly issued `216.198.79.1`) and subdomains get a unique per-project CNAME (e.g., `<hash>.vercel-dns-017.com`). The shape looks like:

**For apex domain (`yourdomain.com`):**

| Type | Name | Value |
|------|------|-------|
| A | @ | (A record shown in your project's Domains settings) |

**For subdomain (`www.yourdomain.com`):**

| Type | Name | Value |
|------|------|-------|
| CNAME | www | (unique CNAME shown in your project's Domains settings) |

The legacy values (`76.76.21.21` / `cname.vercel-dns.com`) continue to work for existing setups, but Vercel recommends the project-specific values for new domains.

### Step 3: Verify and SSL

Vercel automatically provisions an SSL certificate once DNS propagates. No manual configuration needed.

You can also set up a redirect so `www.yourdomain.com` redirects to `yourdomain.com` (or vice versa) in the Domains settings.

---

## Free Tier Info

| Feature | Hobby (free) | Pro ($20/user/mo) |
|---------|--------------|-------------------|
| **Function invocations** | 1M/month | Usage-based |
| **Active CPU** | 4 hrs/month | Usage-based |
| **Projects** | 200 | Unlimited |
| **Deployments** | 100/day, 100 builds/hour | 6,000/day |
| **Concurrent builds** | 1 | Up to 500 |
| **Build machine** | Basic: 2 vCPU, 8 GB RAM, 32 GB disk | Elastic by default: 4-30 vCPU, 8-60 GB RAM, auto-scaled |
| **Build time per deployment** | 45 min | 45 min |
| **Domains per project** | 50 | Unlimited |
| **Function max duration** | 300s (5 min) | 300s, configurable higher |
| **Runtime log retention** | 1 hour | 1 day |
| **Team collaboration** | No | Yes |

Key things to know:

- **Hobby is for non-commercial, personal use only.** That is in Vercel's fair-use guidelines, not a soft suggestion. A revenue-generating site belongs on Pro.
- Exceeding a Hobby usage limit generally pauses the feature until 30 days have passed, rather than billing you for overage. There is no card on file to charge.
- Only 1 concurrent build on Hobby, so pushing to several branches at once queues them.
- Hobby teams cannot deploy from a **private** repository owned by a GitHub organization, GitLab group, or Bitbucket workspace. Public org-owned repos are fine; for a private one you either make it public or move to Pro.
- Functions run on Fluid compute by default and bill on active CPU, so an idle function awaiting I/O costs far less than its wall-clock duration suggests.
- Hobby always gets the Basic build machine. Larger machines, and the Elastic auto-scaling that picks between them, are Pro and Enterprise only.
- The build cache is capped at 1 GB and retained for one month.

---

## Troubleshooting

### Problem: Build fails with "Module not found"

**Cause:** A dependency is missing or not installed.

**Fix:**

```bash
# Make sure all dependencies are in package.json (not just installed globally)
npm install
git add package.json package-lock.json
git commit -m "Fix missing dependencies"
git push
```

### Problem: Environment variable is undefined

**Cause:** The variable is not set for the correct environment, or the app needs a redeploy.

**Fix:**

1. Check **Settings** > **Environment Variables** -- ensure it is set for **Production**
2. Trigger a redeploy: **Deployments** > click the three dots on the latest deploy > **Redeploy**
3. For client-side variables, make sure they have the `NEXT_PUBLIC_` or `VITE_` prefix

### Problem: API route returns 404

**Cause:** The file is not in the correct directory or has a syntax error.

**Fix:**

1. Ensure the file is in `api/` (root-level) for plain Vercel projects, or `app/api/` for Next.js App Router
2. Check the function exports a default handler (for `api/` directory) or named HTTP method exports (for Next.js)
3. Check Vercel deployment logs for errors: **Deployments** > select deploy > **Functions** tab

### Problem: Preview deployment shows old code

**Cause:** Branch is behind `main` or caching issue.

**Fix:**

```bash
git pull origin main
git push origin your-branch
```

Or trigger a manual redeploy from the Vercel dashboard.

### Problem: Custom domain shows "Invalid Configuration"

**Cause:** DNS records are incorrect or haven't propagated yet.

**Fix:**

1. Double-check DNS records match what Vercel shows in **Settings** > **Domains**
2. Use `dig yourdomain.com +short` to verify DNS resolution
3. Wait up to 48 hours for propagation (usually much faster)
4. Try removing and re-adding the domain in Vercel

### Problem: Browser reports a CORS error calling your Vercel API

**Cause:** Often not a CORS misconfiguration at all -- CORS headers are missing on unhandled 500 responses, so a server error surfaces in the browser as "CORS error".

**Fix:**

1. Check the function logs first (**Deployments** > select deploy > **Functions** tab) for an exception
2. Only then verify your CORS config explicitly allows the frontend's origin (exact scheme + host)

### Problem: Uploads fail with 413 (request body too large)

**Cause:** Vercel caps serverless request bodies at ~4.5 MB at the platform level. App-level limits (e.g., Next.js `experimental.serverActions.bodySizeLimit`) apply independently -- raising one does not lift the other.

**Fix:**

1. Upload large batches a few files at a time so each request stays under ~4.5 MB
2. For big files, upload directly from the client to object storage (S3/R2 presigned URLs) instead of through the function

### Problem: Serverless function timeout

**Cause:** Function exceeds the max duration limit. With Fluid compute (enabled by default for new projects), functions default to 300s (5 minutes) on all plans; Hobby maxes out at 300s, Pro/Enterprise can raise `maxDuration` up to 800s (1800s in beta via per-function config).

**Fix:**

1. Optimize the function -- reduce external API calls, use caching
2. For workloads needing unlimited execution time, use Vercel Workflows (code can pause/resume and maintain state without duration limits) or a dedicated backend
3. On Pro, raise `maxDuration` in the function config (up to 800s) if needed
