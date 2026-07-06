# Cloudflare Pages

> Deploy static sites and full-stack apps to Cloudflare's global edge network with unlimited bandwidth on the free tier.

Cloudflare Pages is a deployment platform for frontend and full-stack applications. It supports static site hosting with automatic builds from Git, server-side rendering with Cloudflare Functions (Workers), and edge-native data stores like D1 (SQLite) and KV (key-value). If you already use Cloudflare for DNS, adding Pages is seamless.

> **Note:** Since April 2025, Cloudflare recommends starting new projects on [Workers with static assets](https://developers.cloudflare.com/workers/static-assets/) instead of Pages. Pages remains fully supported (and static asset requests are free on both), but all new investment goes into Workers, and some features are Workers-only (Durable Objects, Cron Triggers, fuller observability). An official [migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/) covers moving Pages projects to Workers.

## Prerequisites

- [ ] A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] [Node.js 22+](https://nodejs.org/)
- [ ] (Optional) [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`

---

## Step 1: Deploy from GitHub (Dashboard)

The fastest way to get started is connecting a GitHub repository.

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) > **Workers & Pages**
2. Click **Create** > **Pages** > **Connect to Git**
3. Authorize Cloudflare to access your GitHub account
4. Select your repository
5. Configure the build:

| Framework | Build Command | Output Directory |
|-----------|---------------|------------------|
| React (Vite) | `npm run build` | `dist` |
| Next.js (static export) | `npm run build` | `out` |
| Vue (Vite) | `npm run build` | `dist` |
| Astro | `npm run build` | `dist` |
| SvelteKit | `npm run build` | `.svelte-kit/cloudflare` |
| Plain HTML | (none) | `/` or `public` |

6. Click **Save and Deploy**

Every push to `main` triggers a production deploy. Pull requests get unique preview URLs automatically.

---

## Step 2: Deploy via Wrangler CLI

### Install and Authenticate

```bash
npm install -g wrangler
wrangler login
```

This opens a browser window to authenticate with your Cloudflare account.

### Deploy a Static Site

```bash
# Build your project first
npm run build

# Deploy the output directory
wrangler pages deploy dist --project-name my-site
```

On the first deploy, Wrangler creates the Pages project if it does not exist.

### Deploy with a Configuration File

Create `wrangler.toml` in your project root:

```toml
name = "my-site"
pages_build_output_dir = "dist"

# Bind a D1 database (optional)
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# Bind a KV namespace (optional)
[[kv_namespaces]]
binding = "CACHE"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

```bash
wrangler pages deploy
```

---

## Build Configuration by Framework

### React (Vite)

```bash
npm create vite@latest my-react-app -- --template react
cd my-react-app
npm install
```

Build settings:
- **Build command:** `npm run build`
- **Output directory:** `dist`

No special configuration needed. Works out of the box.

### Next.js

The old `@cloudflare/next-on-pages` adapter is deprecated. On Pages, deploy Next.js as a static export. For full SSR, use Workers with the [OpenNext adapter](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`) instead.

```bash
npx create-next-app@latest my-next-app
cd my-next-app
```

Update `next.config.js` for static export:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // Static export -- required for Pages
};

module.exports = nextConfig;
```

Build settings:
- **Build command:** `npm run build`
- **Output directory:** `out`

For full SSR support, deploy to Workers with OpenNext instead of Pages:

```bash
npm install @opennextjs/cloudflare
npx opennextjs-cloudflare build
npx opennextjs-cloudflare deploy
```

### Vue (Vite)

```bash
npm create vite@latest my-vue-app -- --template vue
cd my-vue-app
npm install
```

Build settings:
- **Build command:** `npm run build`
- **Output directory:** `dist`

### Astro

```bash
npm create astro@latest my-astro-site
cd my-astro-site
npx astro add cloudflare
```

This adds the `@astrojs/cloudflare` adapter. Update `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
});
```

Build settings:
- **Build command:** `npm run build`
- **Output directory:** `dist`

---

## Cloudflare Functions (Server-Side)

Cloudflare Pages Functions let you run server-side code at the edge. Create a `functions/` directory at your project root.

### Basic Function

Create `functions/api/hello.js`:

```js
export async function onRequestGet(context) {
  return new Response(JSON.stringify({ message: 'Hello from the edge!' }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

This is available at `https://your-site.pages.dev/api/hello`.

### Handle Different HTTP Methods

Create `functions/api/users.js`:

```js
// GET /api/users
export async function onRequestGet(context) {
  const users = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ];
  return Response.json(users);
}

// POST /api/users
export async function onRequestPost(context) {
  const body = await context.request.json();
  // Process the new user
  return Response.json({ id: 3, ...body }, { status: 201 });
}
```

### Dynamic Routes

Create `functions/api/users/[id].js`:

```js
export async function onRequestGet(context) {
  const { id } = context.params;
  // Fetch user by id
  return Response.json({ id, name: `User ${id}` });
}
```

### Middleware

Create `functions/_middleware.js` to run logic before all functions:

```js
export async function onRequest(context) {
  // Add CORS headers to all responses
  const response = await context.next();
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
```

---

## D1 Database (SQLite at the Edge)

D1 is Cloudflare's serverless SQLite database that runs at the edge.

### Create a D1 Database

```bash
wrangler d1 create my-database
```

This outputs a database ID. Add it to `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Create Tables

Create a migration file `schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT,
    author_id INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);
```

Apply it:

```bash
# Apply locally (for development)
wrangler d1 execute my-database --local --file=schema.sql

# Apply to production
wrangler d1 execute my-database --remote --file=schema.sql
```

### Use D1 in Functions

Create `functions/api/users.js`:

```js
// GET /api/users
export async function onRequestGet(context) {
  const { results } = await context.env.DB.prepare(
    'SELECT * FROM users ORDER BY created_at DESC'
  ).all();

  return Response.json(results);
}

// POST /api/users
export async function onRequestPost(context) {
  const { name, email } = await context.request.json();

  const { results } = await context.env.DB.prepare(
    'INSERT INTO users (name, email) VALUES (?, ?) RETURNING *'
  ).bind(name, email).all();

  return Response.json(results[0], { status: 201 });
}
```

### Use D1 with Parameters

```js
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const search = url.searchParams.get('search');

  let stmt;
  if (search) {
    stmt = context.env.DB.prepare(
      'SELECT * FROM users WHERE name LIKE ? ORDER BY created_at DESC'
    ).bind(`%${search}%`);
  } else {
    stmt = context.env.DB.prepare(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
  }

  const { results } = await stmt.all();
  return Response.json(results);
}
```

---

## KV Storage

KV (Key-Value) is a global, low-latency key-value store. Ideal for configuration, feature flags, and caching content that does not change frequently.

### Create a KV Namespace

```bash
wrangler kv namespace create CACHE
```

This outputs a namespace ID. Add it to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "CACHE"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### Use KV in Functions

```js
// Store a value
export async function onRequestPost(context) {
  const { key, value } = await context.request.json();

  await context.env.CACHE.put(key, JSON.stringify(value), {
    expirationTtl: 3600,  // expires in 1 hour
  });

  return Response.json({ success: true });
}

// Retrieve a value
export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get('key');

  const value = await context.env.CACHE.get(key, 'json');

  if (!value) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json(value);
}
```

### KV Caching Pattern

```js
export async function onRequestGet(context) {
  const cacheKey = 'api:products';

  // Check KV cache first
  const cached = await context.env.CACHE.get(cacheKey, 'json');
  if (cached) {
    return Response.json({ source: 'cache', data: cached });
  }

  // Fetch from origin
  const response = await fetch('https://api.example.com/products');
  const products = await response.json();

  // Store in KV for 5 minutes
  await context.env.CACHE.put(cacheKey, JSON.stringify(products), {
    expirationTtl: 300,
  });

  return Response.json({ source: 'origin', data: products });
}
```

---

## Environment Variables and Secrets

### Set via Dashboard

1. Go to your Pages project in the Cloudflare dashboard
2. **Settings** > **Environment variables**
3. Add variables for **Production** and/or **Preview**
4. Click **Save**

### Set via Wrangler

```bash
# Add a secret (prompted for value)
wrangler pages secret put API_KEY --project-name my-site

# List secrets
wrangler pages secret list --project-name my-site
```

### Access in Functions

```js
export async function onRequestGet(context) {
  const apiKey = context.env.API_KEY;
  const dbUrl = context.env.DATABASE_URL;

  const response = await fetch('https://api.example.com/data', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  return Response.json(await response.json());
}
```

### Common Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `API_KEY` | External API key | `sk_live_abc123` |
| `DATABASE_URL` | Database connection string | `postgresql://user:pass@host/db` |
| `SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anon key | `eyJhbGci...` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token | `AXXXaaa...` |

> **Note:** Variables set in the dashboard are encrypted at rest. Use `wrangler pages secret put` for sensitive values instead of putting them in `wrangler.toml`.

> **Tip:** For OAuth on a static frontend, never ship the client secret to the browser. Put the token exchange (e.g., the `/callback` code-for-token step) in a Pages Function or a small Worker, store the secret with `wrangler pages secret put` (or `wrangler secret put` for a Worker), and keep only non-secret config like `CLIENT_ID` in `wrangler.toml` `[vars]`.

---

## Custom Domain

### If You Already Use Cloudflare DNS

This is the easiest setup since Cloudflare already manages your DNS.

1. Go to your Pages project > **Custom domains**
2. Click **Set up a custom domain**
3. Enter your domain (e.g., `app.yourdomain.com`)
4. Cloudflare automatically adds the required DNS record
5. SSL is provisioned instantly

### If Your DNS Is Elsewhere

1. Go to your Pages project > **Custom domains**
2. Click **Set up a custom domain**
3. Enter your domain
4. Add the CNAME record at your DNS provider:

| Type | Name | Target |
|------|------|--------|
| CNAME | `app` | `my-site.pages.dev` |

For apex domains (`yourdomain.com`), you need to use Cloudflare DNS (transfer your nameservers) since most DNS providers do not support CNAME flattening at the apex.

---

## `_redirects` and `_headers` Files

### Redirects

Create a `_redirects` file in your output directory (e.g., `public/_redirects`):

```
# Redirect old paths
/old-page  /new-page  301
/blog/*    /posts/:splat  301

# Proxy API requests (no redirect, just rewrite)
/api/*  https://api.example.com/:splat  200

# SPA fallback (must be last)
/*  /index.html  200
```

Rules:
- `301` = permanent redirect
- `302` = temporary redirect
- `200` = rewrite (proxy, no URL change in browser)
- `:splat` captures the wildcard match
- Rules are evaluated top to bottom, first match wins

### Headers

Create a `_headers` file in your output directory:

```
# Security headers for all pages
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

# Cache static assets aggressively
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# CORS for API routes
/api/*
  Access-Control-Allow-Origin: *
  Access-Control-Allow-Methods: GET, POST, PUT, DELETE
  Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Free Tier Info

| Feature | Free Tier |
|---------|-----------|
| **Bandwidth** | Unlimited |
| **Builds** | 500/month |
| **Concurrent builds** | 1 |
| **Custom domains** | 100 per project |
| **Pages Functions requests** | 100,000/day |
| **D1 database storage** | 5 GB |
| **D1 reads** | 5 million/day |
| **D1 writes** | 100,000/day |
| **KV reads** | 100,000/day |
| **KV writes** | 1,000/day |
| **KV storage** | 1 GB |

Key details:
- Unlimited bandwidth is the standout feature -- no overage charges for traffic spikes
- Preview deployments are free and unlimited
- The 500 builds/month limit counts both production and preview builds
- Functions run on the Workers runtime (V8 isolates), not Node.js -- most Node.js APIs work but some (like `fs`) do not
- D1 is SQLite-based, so it uses SQLite syntax (not Postgres)
- KV is eventually consistent (reads may take up to 60 seconds to reflect writes globally)

---

## Troubleshooting

### Problem: Build fails with "exit code 1"

**Cause:** The build command failed. Common reasons: missing dependencies, wrong Node.js version, or framework misconfiguration.

**Fix:**

1. Check the build logs in the Cloudflare dashboard > **Deployments** > click the failed deploy
2. Set the correct Node.js version:
   - Add a `NODE_VERSION` environment variable (e.g., `22` or `24`)
   - Or add an `.nvmrc` or `.node-version` file to your repo root: `22`
3. Make sure all dependencies are in `package.json`:

```bash
npm install
git add package.json package-lock.json
git commit -m "Fix missing dependencies"
git push
```

4. Test the build locally before pushing:

```bash
npm run build
```

### Problem: Functions return 404

**Cause:** The `functions/` directory is not in the correct location, or the file naming does not match the expected route.

**Fix:**

1. The `functions/` directory must be at the **project root** (next to `package.json`), not inside the output directory
2. File path maps directly to the URL:
   - `functions/api/hello.js` -> `/api/hello`
   - `functions/api/users/[id].js` -> `/api/users/123`
3. Export the correct handler name:
   - `onRequestGet` for GET
   - `onRequestPost` for POST
   - `onRequest` for all methods
4. Check that `wrangler.toml` does not have a conflicting `routes` configuration

### Problem: Function cold starts are slow

**Cause:** Cloudflare Workers/Functions use V8 isolates which have minimal cold starts (typically under 10ms), but the first request after deployment may take slightly longer.

**Fix:**

1. Cloudflare Pages Functions have near-zero cold starts compared to traditional serverless. If you experience slow responses, the issue is likely in your function logic, not cold starts.
2. Optimize function code:
   - Move heavy initialization outside the handler
   - Use KV or D1 instead of making external API calls when possible
3. If using external APIs, latency depends on the distance between the Cloudflare edge and the external API. Consider using a regional service hint:

```toml
# wrangler.toml
[placement]
mode = "smart"
```

### Problem: KV reads return stale data

**Cause:** KV is eventually consistent. Writes may take up to 60 seconds to propagate globally.

**Fix:**

1. This is expected behavior. KV is optimized for read-heavy workloads where eventual consistency is acceptable.
2. For data that must be immediately consistent, use D1 instead of KV
3. If you must use KV, design your application to tolerate stale reads:
   - Use cache-busting keys (e.g., include a version number)
   - Show optimistic updates on the client while KV propagates
4. For write-then-read patterns, consider reading from the same location that wrote:

```js
// Write and return the value directly, don't re-read from KV
await context.env.CACHE.put('key', JSON.stringify(data));
return Response.json(data);  // Return the data directly
```

### Problem: D1 query fails with "no such table"

**Cause:** The migration was not applied, or it was applied to the local database but not the remote one.

**Fix:**

1. Apply migrations to the remote database:

```bash
wrangler d1 execute my-database --remote --file=schema.sql
```

2. Verify the table exists:

```bash
wrangler d1 execute my-database --remote --command="SELECT name FROM sqlite_master WHERE type='table'"
```

3. Remember that D1 uses SQLite syntax, not Postgres:
   - Use `INTEGER PRIMARY KEY AUTOINCREMENT` instead of `SERIAL`
   - Use `TEXT` instead of `VARCHAR`
   - Use `datetime('now')` instead of `NOW()`

### Problem: "Error: Script startup exceeded CPU time limit"

**Cause:** Top-level code in your function takes too long to execute. Workers have a strict startup time limit.

**Fix:**

1. Move heavy computation into the request handler, not at the top level
2. Avoid importing large libraries at the top level -- use dynamic imports:

```js
export async function onRequestGet(context) {
  // Dynamic import inside the handler
  const { someHeavyLib } = await import('./heavy-lib.js');
  // Use it here
}
```

3. Keep your function bundle small. Cloudflare limits scripts to 3 MB (after gzip) on the free tier (10 MB on paid).

### Problem: Custom domain shows "Error 522" or "Error 524"

**Cause:** DNS is misconfigured, or SSL is not provisioned yet.

**Fix:**

1. Verify DNS records point to your Pages project:
   - CNAME record should point to `your-project.pages.dev`
2. If using Cloudflare DNS, make sure the proxy is enabled (orange cloud icon)
3. Wait a few minutes for SSL to provision after adding the domain
4. If the error persists, remove and re-add the custom domain in the Pages dashboard

### Problem: SPA routes return 404 on refresh

**Cause:** The server does not know about client-side routes and tries to serve a file that does not exist.

**Fix:**

Add a `_redirects` file to your output directory:

```
/*  /index.html  200
```

This tells Cloudflare Pages to serve `index.html` for all routes that do not match a static file, allowing your SPA router to handle the navigation.

For frameworks that handle this automatically (like Next.js with SSR), this is not needed.
