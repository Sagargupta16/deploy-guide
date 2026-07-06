# Deploy Next.js to Vercel

> Deploy a Next.js application to Vercel with zero configuration, environment variables, and custom domains.

Vercel is built by the creators of Next.js, making it the most streamlined deployment option. You get automatic SSR, SSG, ISR, API routes, edge functions, and preview deployments out of the box.

## Prerequisites

- [ ] [Node.js 20.9+](https://nodejs.org/) installed (22 or 24 LTS recommended; Next.js 16 no longer supports Node 18)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Vercel account](https://vercel.com/signup) (sign up with GitHub)

---

## Step 1: Create a Next.js App

```bash
npx create-next-app@latest my-nextjs-app
# or with pnpm: pnpm create next-app my-nextjs-app
cd my-nextjs-app
```

The CLI will ask you about TypeScript, ESLint, Tailwind, etc. Choose what you need.

Verify it works locally:

```bash
npm run dev
```

Open `http://localhost:3000` to confirm.

---

## Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-nextjs-app.git
git push -u origin main
```

---

## Step 3: Deploy to Vercel

### Via Dashboard (Recommended for First Deploy)

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository**
3. Select your `my-nextjs-app` repository
4. Vercel auto-detects Next.js -- everything is pre-configured
5. Add environment variables if needed (see below)
6. Click **Deploy**

Your app is live within a minute at `https://my-nextjs-app.vercel.app`.

### Via CLI

```bash
npm i -g vercel
cd my-nextjs-app
vercel          # First time: links to Vercel project
vercel --prod   # Deploy to production
```

---

## Step 4: Set Up Automatic Deployments

This happens automatically when you import from GitHub:

- **Push to `main`** -- triggers a production deployment
- **Open a PR** -- creates a unique preview deployment with its own URL
- **Merge a PR** -- triggers a new production deployment

No GitHub Actions workflow needed. Vercel handles CI/CD natively.

---

## API Routes

Next.js API routes are deployed as Vercel Functions automatically. They run on Fluid compute by default (enabled for all new projects since 2025-04-23), which gives in-function concurrency, bytecode caching, and automatic cold-start optimizations, with a 300s max duration on the Hobby plan.

### App Router (Recommended)

Create `app/api/hello/route.js`:

```js
import { NextResponse } from 'next/server';

export async function GET(request) {
  return NextResponse.json({ message: 'Hello from Next.js!' });
}

export async function POST(request) {
  const body = await request.json();
  return NextResponse.json({ received: body });
}
```

Accessible at `https://your-app.vercel.app/api/hello`.

### Pages Router (Legacy)

Create `pages/api/hello.js`:

```js
export default function handler(req, res) {
  res.status(200).json({ message: 'Hello!' });
}
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection (server only) | `postgresql://user:pass@host/db` |
| `NEXT_PUBLIC_API_URL` | Public API URL (exposed to browser) | `https://api.example.com` |
| `SECRET_KEY` | Auth secret (server only) | `your-secret-key` |
| `NEXT_PUBLIC_GA_ID` | Google Analytics ID (public) | `G-XXXXXXXXXX` |

### Server vs. Client Variables

- **`NEXT_PUBLIC_` prefix** -- available in both server and client code. Bundled into JavaScript sent to the browser. Never use this for secrets.
- **No prefix** -- available only in server-side code (API routes, `getServerSideProps`, Server Components). Safe for secrets.

### Set via Vercel Dashboard

1. Go to your project on [vercel.com](https://vercel.com)
2. Navigate to **Settings** > **Environment Variables**
3. Add variables and select environments: **Production**, **Preview**, **Development**

### Set via CLI

```bash
vercel env add DATABASE_URL production
vercel env add NEXT_PUBLIC_API_URL   # No environment argument targets all environments
vercel env pull .env.local   # Download to local for development
```

The CLI accepts exactly one environment per `vercel env add` (a third argument is parsed as a git branch, not another environment). To target specific environments, run the command once per environment; omitting the environment targets all of them.

### Access in Code

```js
// Server Component or API route (server-only)
const dbUrl = process.env.DATABASE_URL;

// Client Component (must use NEXT_PUBLIC_ prefix)
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

**Tip:** If your pages query a database during the build (e.g. `generateStaticParams` or SSG page bodies), the same server env vars production needs at runtime must also exist at build time -- set them in the Vercel project env for all relevant environments. `NEXT_PUBLIC_*` values are baked into the client bundle at build time, so their build-time value is what ships to visitors.

---

## Custom Domain

### Step 1: Add Domain in Vercel

1. Go to your project on Vercel
2. Navigate to **Settings** > **Domains**
3. Enter your domain and click **Add**

### Step 2: Configure DNS

**For apex domain (`yourdomain.com`):**

| Type | Name | Value |
|------|------|-------|
| A | @ | Copy the IP shown in **Settings** > **Domains** |

Vercel no longer uses a single static IP (the old `76.76.21.21` is legacy). Each project is assigned a recommended Anycast IP -- use the exact A record value shown in your project's Domain Settings.

**For subdomain (`www.yourdomain.com`):**

| Type | Name | Value |
|------|------|-------|
| CNAME | www | Copy the unique CNAME shown in **Settings** > **Domains** |

CNAME targets are project-specific now (e.g. `d1d4fc829fe7bc7c.vercel-dns-017.com.`); the generic `cname.vercel-dns.com` is legacy. Copy the value from your project's Domains settings, including the trailing period.

### Step 3: SSL and Redirects

- SSL is provisioned automatically by Vercel
- Set up redirects (e.g., `www` to apex) in the Domains settings

---

## Troubleshooting

### Problem: Build fails with "Module not found"

**Cause:** Missing dependency or incorrect import path.

**Fix:**

```bash
npm install
# Check for case-sensitivity issues (Linux builds are case-sensitive, Windows/macOS are not)
# Wrong: import Header from './components/header'
# Right: import Header from './components/Header'
```

### Problem: API route returns 404 on Vercel

**Cause:** Wrong file location or export format.

**Fix:**

- App Router: Ensure file is at `app/api/<route>/route.js` and exports named HTTP methods (`GET`, `POST`, etc.)
- Pages Router: Ensure file is at `pages/api/<route>.js` and exports a default function
- Check runtime logs in the dashboard: select your project, then open **Logs** in the sidebar (Hobby retains 1 hour of runtime logs)

### Problem: Large uploads fail even after raising `bodySizeLimit`

**Cause:** Two independent limits apply. Raising Next.js `experimental.serverActions.bodySizeLimit` (e.g. to `"25mb"`) lifts the app-level 1 MB default, but Vercel's platform cap on serverless request bodies (~4.5 MB) still applies.

**Fix:** Keep individual requests under ~4.5 MB -- upload large batches a few files at a time, or upload directly from the client to object storage (S3/R2) and send only the resulting URL to your API route.

### Problem: Environment variable is undefined in client code

**Cause:** Variable does not have the `NEXT_PUBLIC_` prefix.

**Fix:**

1. Rename the variable to `NEXT_PUBLIC_YOUR_VAR`
2. Update all references in code
3. Redeploy (env vars are embedded at build time for client code)

### Problem: ISR pages show stale data

**Cause:** Revalidation period hasn't expired yet, or the revalidation request failed.

**Fix:**

```js
// Reduce revalidation interval
export const revalidate = 60; // Revalidate every 60 seconds

// Or use on-demand revalidation
// Create app/api/revalidate/route.js
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST(request) {
  const { path } = await request.json();
  revalidatePath(path);
  return NextResponse.json({ revalidated: true });
}
```

### Problem: "Edge Runtime is not supported" error

**Cause:** Using Node.js APIs in an Edge Runtime function.

**Fix:**

```js
// Either switch to Node.js runtime
export const runtime = 'nodejs'; // default

// Or remove Node.js-specific APIs (fs, path, etc.) from edge functions
export const runtime = 'edge';
```

### Problem: Large page bundle size warning

**Cause:** Heavy dependencies imported on the client side.

**Fix:**

```js
// Use dynamic imports for heavy components
import dynamic from 'next/dynamic';

const HeavyChart = dynamic(() => import('../components/HeavyChart'), {
  loading: () => <p>Loading chart...</p>,
  ssr: false,
});
```

### Problem: Vercel build takes too long

**Cause:** No build cache or too many pages being regenerated.

**Fix:**

1. Vercel caches `node_modules` and `.next/cache` automatically
2. For large sites, use ISR instead of SSG to avoid building all pages at once
3. Check for unnecessary `console.log` or data fetching during build
