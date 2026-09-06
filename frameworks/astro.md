# Deploy Astro

> Deploy an Astro site to GitHub Pages, Netlify, Vercel, Cloudflare Workers, or your own Node server.

This guide covers deploying Astro 7 in both output modes: **static** (prerendered HTML, host anywhere) and **server** (on-demand rendering through an adapter). Pick the platform section that matches your host -- each one works standalone.

## Prerequisites

- [ ] [Node.js 22.12+](https://nodejs.org/) installed (Astro 7 requires Node >=22.12.0)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] (Per platform) A [Netlify](https://app.netlify.com/signup), [Vercel](https://vercel.com/signup), or [Cloudflare](https://dash.cloudflare.com/sign-up) account

---

## Create the App

```bash
npm create astro@latest my-astro-app
cd my-astro-app
npm run dev
```

Open `http://localhost:4321` (Astro's default dev port; override with `--port` or `server.port`).

Already on an older Astro? Upgrade with:

```bash
npx @astrojs/upgrade
```

Astro 7 (current: 7.0.6) ships a stricter Rust-based compiler -- invalid or unclosed HTML that previously slipped through now **fails the build**. It also upgrades to Vite 8, removes `@astrojs/db`, and reserves the filename `src/fetch.ts` for advanced routing. Fix compiler errors locally before pushing, or your first deploy will fail.

---

## Pick an Output Mode

Astro has exactly two output modes. There is no `'hybrid'` mode anymore -- hybrid rendering is done per page.

| Mode | Config | What it means |
|------|--------|---------------|
| Static (default) | `output: 'static'` | Entire site prerendered to HTML at build time |
| Server | `output: 'server'` | All pages rendered on demand per request |

Mix them per page with the `prerender` export:

```js
// In a .astro page's frontmatter (or a .js/.ts endpoint)

// Static site, but THIS page renders on demand:
export const prerender = false;

// Server site, but THIS page is prerendered at build time:
export const prerender = true;
```

### Adapters

Any on-demand rendering (including a single `prerender = false` page) **requires an adapter** matching your host:

```bash
npx astro add netlify      # @astrojs/netlify
npx astro add vercel       # @astrojs/vercel
npx astro add cloudflare   # @astrojs/cloudflare
npx astro add node         # @astrojs/node (self-host)
```

Each command installs the package and updates `astro.config.mjs` for you. Fully static sites need no adapter.

### Server Islands

Server islands let a static page defer one dynamic component to render after page load. Add `server:defer` to any server-rendered component and give it placeholder UI via the `fallback` slot:

```astro
---
import Recommendations from '../components/Recommendations.astro';
---
<Recommendations server:defer>
  <div slot="fallback">Loading recommendations...</div>
</Recommendations>
```

Rules that bite in production:

- Requires an adapter. Does not work on fully static sites (so not on GitHub Pages).
- Props are passed via an encrypted query string capped at **2048 bytes**. Larger props fall back to a POST request and skip the browser cache.
- For rolling or multi-region deploys, all instances must share the encryption key. Generate one and set it as an env var:

```bash
npx astro create-key
# Set the output as ASTRO_KEY on your host
```

### Config Essentials

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.com',  // Final deployed URL. Unset by default; needed for sitemaps and canonical URLs
  base: '/docs',                // Only if deploying under a subpath
  trailingSlash: 'ignore',      // Default. Also: 'always' | 'never'
});
```

---

## Option A: GitHub Pages (Static Only)

GitHub Pages hosts static output for free. No adapter, no server islands.

### Step 1: Set `site` and `base`

Edit `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://<username>.github.io',
  base: '/my-astro-app',  // Must match your repo name
});
```

Skip `base` only if the repo is the special `<username>.github.io` repo. With a `base` set, prefix **all internal links** with it:

```astro
<a href="/my-astro-app/about">About</a>
```

### Step 2: Push to GitHub

```bash
git init -b main
git add astro.config.mjs package.json package-lock.json src public tsconfig.json
git commit -m "Initial commit"
git remote add origin https://github.com/<username>/my-astro-app.git
git push -u origin main
```

### Step 3: Add the Official Deploy Workflow

Astro maintains its own action, [withastro/action](https://github.com/withastro/action) (current release v6.1.1, 2026-04-20). Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: withastro/action@v6

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

The action auto-detects your package manager from the lockfile (npm, yarn, pnpm, bun, or deno) and caches `node_modules/.astro` by default. Optional inputs if the defaults don't fit:

| Input | Default | Purpose |
|-------|---------|---------|
| `path` | repo root | Astro project location in a monorepo |
| `node-version` | `24` | Node version for the build |
| `package-manager` | auto-detected | Force a specific PM |
| `build-cmd` | PM's build script | Custom build command |
| `cache` | `true` | Toggle build caching |
| `cache-dir` | `node_modules/.astro` | Cache location |
| `out-dir` | `dist` | Build output directory |

### Step 4: Enable Pages

1. Repo **Settings** > **Pages**
2. Under **Source**, select **GitHub Actions**
3. Push -- the workflow builds and deploys

Your site is live at `https://<username>.github.io/my-astro-app`.

---

## Option B: Netlify

Netlify handles both static and SSR Astro. Requires Node v22.12.0+ at build time -- pin it:

```bash
echo "22.12.0" > .nvmrc
```

### Step 1: Add Config (and Adapter for SSR)

Create `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"
```

Static sites stop here. For SSR:

```bash
npx astro add netlify
```

This installs `@astrojs/netlify` (current: 8.1.1) and wires the adapter into `astro.config.mjs`. Astro middleware runs on Netlify Edge Functions.

### Step 2: Deploy

**Dashboard:** push to GitHub, then in Netlify click **Add a new site** > **Import an existing project** and select the repo.

**CLI:**

```bash
npm install --global netlify-cli
netlify login
netlify init
```

`netlify init` links the repo and sets up continuous deployment -- every push to `main` builds and deploys.

---

## Option C: Vercel

### Step 1: Adapter (SSR Only)

Static sites deploy with zero config -- Vercel auto-detects the Astro preset. For SSR:

```bash
npx astro add vercel
```

This installs `@astrojs/vercel` (current: 11.0.2). Useful adapter options:

```js
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel({
    webAnalytics: { enabled: true },
    maxDuration: 60,  // seconds, per function
    isr: {
      expiration: 60 * 60 * 24,          // revalidate cached pages daily
      bypassToken: process.env.ISR_TOKEN, // on-demand revalidation
      exclude: ['/preview', /^\/api\/.+/],
    },
  }),
});
```

The adapter can also route images through Vercel's Image Optimization API via `imageService`.

### Step 2: Deploy

**Dashboard:** push to GitHub, import at [vercel.com/new](https://vercel.com/new). Vercel detects Astro automatically -- click **Deploy**.

**CLI:**

```bash
npm install -g vercel
vercel
# Answer N when asked to override settings -- the Astro preset is correct
```

---

## Option D: Cloudflare Workers

Since v13, `@astrojs/cloudflare` deploys to **Cloudflare Workers only** -- it no longer supports Cloudflare Pages. Current adapter version: 14.1.1.

### Step 1: Add the Adapter and Wrangler

```bash
npx astro add cloudflare
npm install wrangler@latest --save-dev
```

A `wrangler.jsonc` is optional for basic projects -- Astro generates sane defaults, including `"main": "@astrojs/cloudflare/entrypoints/server"`. If you do write one:

```jsonc
// wrangler.jsonc -- SSR site
{
  "name": "my-astro-app",
  "main": "dist/_worker.js/index.js",
  "compatibility_date": "2026-07-06",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "./dist" }
}
```

Static-only sites drop `main` and `compatibility_flags` and keep just `"assets": { "directory": "./dist" }`.

With the adapter installed, `astro dev` runs in workerd -- Cloudflare's actual production runtime -- so dev matches production. Sessions auto-provision a Workers KV binding named `SESSION`, and `imageService` defaults to `'cloudflare-binding'`.

### Step 2: Preview and Deploy

```bash
# Local preview on workerd
npx astro build && npx wrangler dev

# Deploy
npx astro build && npx wrangler deploy
```

Per-environment builds: `CLOUDFLARE_ENV=staging astro build`.

**Git integration (Workers Builds):** in the dashboard go to **Compute** > **Workers & Pages** > **Create application** > **Import a repository**, set build command `npx astro build` and deploy command `npx wrangler deploy`, then **Save and Deploy**.

---

## Option E: Node Server (Self-Host)

Run Astro SSR on any box with Node 22 -- a VPS, a container, or a PaaS.

### Step 1: Add the Node Adapter

```bash
npx astro add node
```

This installs `@astrojs/node` (current: 11.0.2):

```js
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
});
```

Use `mode: 'middleware'` instead to mount the built handler inside an existing Express or Fastify app.

### Step 2: Build and Run

```bash
npm run build
node ./dist/server/entry.mjs
```

Override the bind address and port with env vars:

```bash
HOST=0.0.0.0 PORT=4321 node ./dist/server/entry.mjs
```

The default request body size limit is 1 GB. Point your process manager (systemd, pm2, Docker CMD) at `dist/server/entry.mjs` and you're done.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PUBLIC_API_URL` | Exposed to the client (any `PUBLIC_`-prefixed var) | `https://api.example.com` |
| `API_SECRET` | Server-only (no prefix = never shipped to the browser) | `sk-...` |
| `ASTRO_KEY` | Stable server-island encryption key for rolling/multi-region deploys | output of `npx astro create-key` |

Access rules:

- In Astro code, use `import.meta.env.PUBLIC_API_URL` -- **not** `process.env`.
- In `astro.config.mjs`, use `process.env`.
- On Cloudflare (and Deno), the adapter provides its own runtime env access instead of `process.env`.

For type-safe env vars, declare a schema with `astro:env`:

```js
// astro.config.mjs
import { defineConfig, envField } from 'astro/config';

export default defineConfig({
  env: {
    schema: {
      PUBLIC_API_URL: envField.string({ context: 'client', access: 'public' }),
      API_SECRET: envField.string({ context: 'server', access: 'secret' }),
    },
  },
});
```

Undeclared runtime secrets can be read server-side with `getSecret()` from `astro:env/server`.

Where to set them per platform:

- **GitHub Pages:** repo **Settings** > **Secrets and variables** > **Actions**, then pass into the build step's `env:` block. Static builds bake values in at build time.
- **Netlify:** **Site configuration** > **Environment variables**.
- **Vercel:** project **Settings** > **Environment Variables**.
- **Cloudflare:** **Settings** > **Variables and Secrets** on the Worker, or `[vars]` in `wrangler.jsonc`.
- **Node:** export in the shell, systemd unit, or Docker env.

---

## Custom Domain

### GitHub Pages

1. Create `public/CNAME` containing exactly your domain:

```
www.example.com
```

2. Update `astro.config.mjs`: set `site` to the custom domain and **remove `base`** (then strip the base prefix from internal links):

```js
export default defineConfig({
  site: 'https://www.example.com',
});
```

3. Configure DNS:

| Type | Name | Value |
|------|------|-------|
| A | @ | `185.199.108.153` |
| A | @ | `185.199.109.153` |
| A | @ | `185.199.110.153` |
| A | @ | `185.199.111.153` |
| AAAA | @ | `2606:50c0:8000::153` (through `:8003::153`) |
| CNAME | www | `<username>.github.io` |

4. Repo **Settings** > **Pages** > **Custom domain**, enter the domain, **Save**, then tick **Enforce HTTPS** (can take up to 24h to become available).

### Netlify / Vercel / Cloudflare

Add the domain in the project dashboard (Domain settings), point DNS at the exact values the dashboard shows for your project, and SSL is provisioned automatically.

---

## Free Tier Info

| Platform | Price | What you get | Watch out for |
|----------|-------|--------------|---------------|
| GitHub Pages | Free | 1 GB published site, 100 GB/month bandwidth (soft), 10 builds/hour (soft) | Static only; the builds/hour limit does not apply to custom Actions workflows like withastro/action |
| Cloudflare Workers | Free | 100,000 requests/day, 10 ms CPU per invocation; static asset requests free and unlimited | Paid plan starts at $5 USD/month minimum per account |
| Netlify | Free (credit-based) | 300 credits/month hard cap. Costs: 20 credits/GB bandwidth, 15 credits per production deploy, 10 credits per GB-hour compute, 2 credits per 10,000 requests. Deploy previews, branch deploys, and form submissions cost 0 credits | Sites pause when credits run out and Free accounts cannot buy more; next tier is Personal at $9/month (1,000 credits) |
| Vercel Hobby | Free | 1M edge requests, 1M function invocations, 4 active-CPU hours, 360 GB-hrs provisioned memory, 5,000 image transformations, 100 deployments/day per month; function max duration 300s | Non-commercial personal use only; exceeding a limit pauses that feature for up to 30 days; Pro is $20 per user/month |

For a mostly-static Astro site, GitHub Pages or Cloudflare (static assets free and unlimited) are the safest free homes. For SSR, Cloudflare's 100k requests/day is the most generous hard number.

---

## Troubleshooting

### Problem: Build fails with "Cannot use server-rendered pages without an adapter"

**Cause:** A page opted into on-demand rendering (`output: 'server'` or `export const prerender = false`) but no adapter is installed. The full error: "Cannot use server-rendered pages without an adapter. Please install and configure the appropriate server adapter for your final deployment."

**Fix:** Install the adapter matching your host:

```bash
npx astro add netlify   # or vercel / cloudflare / node
```

### Problem: "getStaticPaths() function is required for dynamic routes"

**Cause:** A dynamic route like `src/pages/blog/[slug].astro` is being built in static mode without telling Astro which paths exist.

**Fix:** Export `getStaticPaths()` returning all paths:

```astro
---
export async function getStaticPaths() {
  return [
    { params: { slug: 'first-post' } },
    { params: { slug: 'second-post' } },
  ];
}
---
```

Or switch that page to on-demand rendering (`export const prerender = false` plus an adapter).

### Problem: React/Vue/Svelte component renders but is not interactive

**Cause:** Astro ships zero JavaScript by default -- framework components are rendered to static HTML unless you hydrate them.

**Fix:** Add a `client:*` directive:

```astro
<Counter client:load />
```

### Problem: "window is not defined" or "document is not defined"

**Cause:** Browser-only APIs running during the server render.

**Fix:** Move the code into a `<script>` tag or a framework lifecycle hook (`useEffect`, `onMounted`, `onMount`) and hydrate the component with a `client:*` directive.

### Problem: Cloudflare build fails resolving `node:` imports

**Cause:** Node built-ins on Workers require the compatibility flag, and full built-in Node.js API support also requires a recent compatibility date.

**Fix:** In `wrangler.jsonc` set both:

```jsonc
{
  "compatibility_flags": ["nodejs_compat"],
  "compatibility_date": "2024-09-23"  // or later
}
```

### Problem: "Cannot find package X" after adding an integration

**Cause:** Missing peer dependencies -- `astro add` installs the integration but some package managers skip peers.

**Fix:** Install them manually:

```bash
npm install @astrojs/react react react-dom
```

Yarn 2+ (Berry) additionally needs `nodeLinker: "node-modules"` in `.yarnrc.yml`. In monorepos, you may need to add Astro packages to `vite.ssr.noExternal`.
