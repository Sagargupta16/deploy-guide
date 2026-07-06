# Deploy SvelteKit

> Deploy a SvelteKit 2 app to Vercel, Netlify, Cloudflare, Render, or GitHub Pages by swapping one adapter.

SvelteKit doesn't have one deploy story -- it has adapters. The same app builds into a Vercel function, a Cloudflare Worker, a plain Node server, or a folder of static HTML depending on which adapter you configure in `svelte.config.js`. This guide covers creating a SvelteKit 2 / Svelte 5 app with the current `sv` CLI, then deploying it to five platforms with the right adapter for each, plus environment variables, prerendering, and the base-path dance GitHub Pages requires. Current versions as of 2026-07-06: `@sveltejs/kit` 2.69.1, `svelte` 5.56.4, `sv` CLI 0.16.2. SvelteKit 2 requires Node 18.13+, Vite 5+, and TypeScript 5+.

## Prerequisites

- [ ] [Node.js 20+](https://nodejs.org/) installed (SvelteKit 2 needs 18.13+ minimum; the official GitHub Pages workflow uses Node 20)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] An account on your target platform: [Vercel](https://vercel.com/signup), [Netlify](https://app.netlify.com/signup), [Cloudflare](https://dash.cloudflare.com/sign-up), or [Render](https://render.com/)

---

## Create the App

The old `npm create svelte@latest` is gone. Project creation now goes through the `sv` CLI:

```bash
npx sv create my-app
cd my-app
npm run dev
```

Open `http://localhost:5173` to confirm it works.

`sv create` walks you through template, TypeScript, and add-on prompts. To skip the prompts (useful in CI or scripts):

```bash
npx sv create my-app --template minimal --types ts --no-add-ons --install npm
```

Available flags: `--template minimal|demo|library`, `--types ts|jsdoc` (or `--no-types`), `--add <add-ons>` / `--no-add-ons`, `--install npm|pnpm|yarn|bun|deno` (or `--no-install`), `--from-playground <url>`, `--no-dir-check`.

Push it to GitHub before deploying:

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<username>/my-app.git
git push -u origin main
```

---

## The Adapter Model

Every SvelteKit build runs in two stages: `vite build` produces the optimized server and client output (prerendering happens here), then the **adapter** tunes that output for the target platform. You pick the adapter in `svelte.config.js`.

The five official adapters:

| Adapter | Version | Target |
|---------|---------|--------|
| `@sveltejs/adapter-vercel` | 6.3.4 | Vercel |
| `@sveltejs/adapter-netlify` | 6.0.4 | Netlify |
| `@sveltejs/adapter-cloudflare` | 7.2.9 | Cloudflare Workers Static Assets + Cloudflare Pages |
| `@sveltejs/adapter-node` | 5.5.7 | Any Node host: Render, Railway, a VPS, Docker |
| `@sveltejs/adapter-static` | 3.0.10 | Static hosts: GitHub Pages, or any SSG-style host |

New projects ship with `@sveltejs/adapter-auto` (7.0.1), which detects Cloudflare Pages, Netlify, Vercel, Azure Static Web Apps, AWS via SST, and Google Cloud Run at build time and installs the matching adapter for you. Two catches:

1. `adapter-auto` accepts **no config options**. Need `{ edge: true }` or ISR? Install the specific adapter.
2. The docs recommend installing the specific adapter to `devDependencies` anyway -- it locks the version in your lockfile and speeds up CI.

If you build outside a platform adapter-auto knows (a Render Node service, a bare VPS), the build warns:

```
Could not detect a supported production environment. See
https://svelte.dev/docs/kit/adapters to learn how to configure your app
to run on the platform of your choosing
```

That's your cue to install a concrete adapter. Pick your platform below.

---

## Option A: Vercel (adapter-vercel)

Vercel deploys SvelteKit with zero configuration -- adapter-auto installs adapter-vercel at build time. But Vercel itself recommends installing the adapter explicitly for version stability:

### Step 1: Install the Adapter

```bash
npm i -D @sveltejs/adapter-vercel
```

Edit `svelte.config.js` (note: this file cannot be TypeScript):

```js
import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
	}
};

export default config;
```

### Step 2: Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select `my-app`
3. Vercel auto-detects SvelteKit -- no build settings needed
4. Click **Deploy**

Your app is live at `https://my-app.vercel.app`.

### Step 3 (Optional): Tune Per-Route Config

Export `config` from any route to control the deployment:

```js
// src/routes/blog/+page.server.js
export const config = {
	isr: {
		expiration: 60 // seconds; required for ISR
	}
};
```

Adapter options include `regions` (default `["iad1"]`), `split`, `memory` (128-3008 MB, default 1024), and `maxDuration`. ISR also accepts `bypassToken` (must be at least 32 characters) and `allowQuery`. The `runtime` option (`'edge' | 'nodejs20.x' | 'nodejs22.x'`) is deprecated -- it now defaults to the Node version set in your Vercel dashboard.

> **Heads up:** Vercel's Routing Middleware and `vercel.json` rewrites are NOT supported with SvelteKit. Use [server hooks](https://svelte.dev/docs/kit/hooks) (`src/hooks.server.js`) instead.

---

## Option B: Netlify (adapter-netlify)

### Step 1: Install the Adapter

```bash
npm i -D @sveltejs/adapter-netlify
```

Edit `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-netlify';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			edge: false, // true = Deno edge functions; false = Node serverless
			split: false // unavailable when edge: true
		})
	}
};

export default config;
```

### Step 2: Add netlify.toml

The project root **must** contain a `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "build"
```

### Step 3: Import in Netlify

1. Go to [app.netlify.com](https://app.netlify.com/)
2. **Add new site** > **Import an existing project**
3. Select your GitHub repo -- the `netlify.toml` supplies the build settings
4. Click **Deploy**

Netlify-specific gotchas: pages using [Netlify Forms](https://docs.netlify.com/forms/setup/) must be prerendered, or Netlify's build-time form detection won't see them. And filesystem access (`fs.readFile` etc.) does not work inside Netlify functions -- use `read()` from `$app/server` to load bundled assets instead.

---

## Option C: Cloudflare (adapter-cloudflare)

One adapter covers both Cloudflare Workers Static Assets and Cloudflare Pages. (`adapter-cloudflare-workers`, the old Workers Sites adapter, is deprecated -- do not use it.)

### New Project: One Command

```bash
npm create cloudflare@latest -- my-svelte-app --framework=svelte
cd my-svelte-app
npm run deploy
```

### Existing Project: Add the Adapter

```bash
npm i -D @sveltejs/adapter-cloudflare
```

Edit `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-cloudflare';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
	}
};

export default config;
```

Then deploy -- Wrangler auto-generates config on first run:

```bash
npx wrangler deploy
```

For a hand-written Workers config, `wrangler.jsonc` needs:

```jsonc
{
	"name": "my-svelte-app",
	"main": ".svelte-kit/cloudflare/_worker.js",
	"compatibility_date": "2026-07-06",
	"compatibility_flags": ["nodejs_als"],
	"assets": {
		"binding": "ASSETS",
		"directory": ".svelte-kit/cloudflare"
	}
}
```

Deploying to **Cloudflare Pages** via git instead? Use the SvelteKit preset: build command `npm run build`, output directory `.svelte-kit/cloudflare`.

Bindings (KV, D1, R2, etc.) surface as `platform.env` in server code:

```js
// src/routes/+page.server.js
export async function load({ platform }) {
	const value = await platform.env.MY_KV.get('key');
	return { value };
}
```

> **Note:** `npm run preview` runs the build in Node, so `platform.env` and other Cloudflare-specific features do not apply there. Test bindings with `wrangler dev` or a preview deploy.

---

## Option D: Render or Railway (adapter-node)

Any host that runs a Node process works with adapter-node. Render is the walkthrough here; Railway is the same adapter and the same env vars.

### Step 1: Install the Adapter

```bash
npm i -D @sveltejs/adapter-node
```

Edit `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
	}
};

export default config;
```

### Step 2: Test the Production Build Locally

```bash
npm run build
node build
```

The server listens on port 3000 by default. `.env` files are NOT auto-loaded in production -- Vite only reads them at build time. To load one at runtime:

```bash
node --env-file=.env build    # Node 20.6+
# or: node -r dotenv/config build
```

### Step 3: Deploy to Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. **New** > **Web Service**, connect your GitHub repo
3. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node build/index.js`
   - **Instance Type:** Free
4. Add an environment variable: `ORIGIN` = `https://my-app.onrender.com` (your service URL)
5. Click **Create Web Service**

`ORIGIN` is not optional decoration -- SvelteKit needs it to construct correct URLs and to accept form submissions in production (see Troubleshooting).

The deployed bundle needs `package.json` and your lockfile alongside the `build/` output; production dependencies install with `npm ci --omit dev`. Render's `npm install && npm run build` flow handles this for you.

**Render static alternative:** if your app is fully prerenderable, skip the Node service. Use adapter-static (see Option E config, minus the base path) and create a Render **Static Site** with publish directory `build`.

**Railway:** create a new project from your GitHub repo, keep the same build (`npm run build`) and start (`node build`) commands, and set `ORIGIN` to your Railway domain.

---

## Option E: GitHub Pages (adapter-static)

GitHub Pages is static files only, so this route requires a fully prerendered app (no server-side form actions, no dynamic SSR). Three things make or break it: the base path, the `404.html` fallback, and a `.nojekyll` file.

### Step 1: Install the Adapter

```bash
npm i -D @sveltejs/adapter-static
```

Edit `svelte.config.js`:

```js
import adapter from '@sveltejs/adapter-static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter({
			// defaults: pages: 'build', assets: 'build',
			// precompress: false, strict: true
			fallback: '404.html' // GitHub Pages serves this for deep links
		}),
		paths: {
			// '/my-app' when served from username.github.io/my-app;
			// leave empty for a username.github.io root site
			base: process.env.BASE_PATH || ''
		}
	}
};

export default config;
```

`paths.base` must start, but not end, with `/` (e.g. `/my-app`), unless it is the empty string.

### Step 2: Enable Prerendering

adapter-static requires every page to be prerendered. Add to `src/routes/+layout.js`:

```js
export const prerender = true;
```

### Step 3: Add .nojekyll

GitHub Pages runs Jekyll by default, which ignores the `_app` directory SvelteKit emits. Kill it with an empty file:

```bash
touch static/.nojekyll
```

### Step 4: Prefix Internal Links with base

Every root-relative link must carry the base path, or it will 404 on `username.github.io/my-app`:

```svelte
<script>
	import { base } from '$app/paths';
</script>

<a href="{base}/about">About</a>
```

### Step 5: Add the Deploy Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v6
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm run build
        env:
          BASE_PATH: /${{ github.event.repository.name }}

      - uses: actions/upload-pages-artifact@v5
        with:
          path: build

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

### Step 6: Enable GitHub Pages

1. Go to **Settings** > **Pages** in your repo
2. Under **Source**, select **GitHub Actions**
3. Push:

```bash
git add .
git commit -m "Add GitHub Pages deploy"
git push origin main
```

Your app is live at `https://<username>.github.io/my-app/`.

---

## Prerendering

Prerendering is controlled per route with a page option, exported from `+page.js`, `+page.server.js`, `+layout.js`, `+layout.server.js`, or `+server.js` (children override parents):

```js
export const prerender = true; // or false, or 'auto'
```

Dynamic routes like `/blog/[slug]` can't be discovered unless something links to them. Either let the crawler find them via `<a>` links, or export an `entries()` function (it can be async -- fetch your slugs from a CMS):

```js
// src/routes/blog/[slug]/+page.server.js
export const prerender = true;

export function entries() {
	return [{ slug: 'hello-world' }, { slug: 'second-post' }];
}
```

Two hard limits: pages with form actions cannot be prerendered, and reading `url.searchParams` during prerendering is forbidden (the params don't exist at build time).

**SPA mode.** For a static host when you can't prerender everything, disable SSR in the root layout and give adapter-static a fallback page:

```js
// src/routes/+layout.js
export const ssr = false;
```

The fallback filename is platform-specific: `200.html`, `index.html`, or `404.html` -- GitHub Pages uses `404.html` to serve deep-link refreshes. The docs warn that SPA mode has a large negative performance impact; prerender as many pages as possible and only fall back for the rest.

**Build-time side effects.** `+page(.server).js` and `+layout(.server).js` files are imported and analyzed during the build. Guard anything with side effects:

```js
import { building } from '$app/environment';

if (!building) {
	connectToDatabase();
}
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `ORIGIN` | Public URL of the app (adapter-node; required for correct URL and form handling) | `https://my-app.onrender.com` |
| `PORT` | Port adapter-node listens on (default 3000) | `3000` |
| `HOST` | Address adapter-node binds to (default 0.0.0.0) | `0.0.0.0` |
| `BODY_SIZE_LIMIT` | Max request body size for adapter-node (default 512kb) | `512kb` |
| `BASE_PATH` | Feeds `paths.base` in the GitHub Pages setup above | `/my-app` |
| `PUBLIC_*` | Any variable exposed to client code (default public prefix is `PUBLIC_`) | `PUBLIC_API_URL` |

### $env/static vs $env/dynamic

SvelteKit gives you two ways to read private env vars, and the difference matters on every platform:

```js
// src/routes/+page.server.js
import { API_KEY } from '$env/static/private'; // baked in at BUILD time
import { env } from '$env/dynamic/private'; // read at RUNTIME

export function load() {
	return { fromBuild: !!API_KEY, fromRuntime: !!env.DATABASE_URL };
}
```

- `$env/static/private` values come from `.env` files and `process.env` at build time and are **statically replaced in your code with their build-time values** -- even if the runtime value differs. Changing a dashboard env var does nothing until you rebuild. Variables here cannot begin with the public prefix (`PUBLIC_` by default).
- `$env/dynamic/private` is read at runtime from the platform. With adapter-node it is equivalent to `process.env`. It cannot be imported into client-side code. In dev it includes `.env`; in prod, behavior depends on the adapter. Use it for secrets that rotate (database URLs, API keys on a Node host).

### Setting Variables Per Platform

- **Vercel:** project **Settings** > **Environment Variables**. Static values need a redeploy to take effect.
- **Netlify:** **Site configuration** > **Environment variables**, then redeploy.
- **Cloudflare:** plain vars in `wrangler.jsonc` / dashboard; secrets via `npx wrangler secret put NAME`. Both arrive as `platform.env`, not `process.env`.
- **Render:** the **Environment** tab; saving triggers a redeploy. Remember `ORIGIN`.
- **GitHub Pages:** there is no runtime -- everything is build-time. Pass values in the workflow:

```yaml
- run: npm run build
  env:
    BASE_PATH: /${{ github.event.repository.name }}
    PUBLIC_API_URL: ${{ vars.PUBLIC_API_URL }}
```

---

## Custom Domain

### GitHub Pages

1. Repo **Settings** > **Pages** > **Custom domain**, enter the domain, **Save**
2. Configure DNS:

| Type | Name | Value |
|------|------|-------|
| A | @ | `185.199.108.153` |
| A | @ | `185.199.109.153` |
| A | @ | `185.199.110.153` |
| A | @ | `185.199.111.153` |
| CNAME | www | `<username>.github.io` |

3. Check **Enforce HTTPS** -- the checkbox can take up to 24 hours to become available while the certificate provisions
4. With a custom domain the site serves from the root, so drop `paths.base` (set `BASE_PATH` to empty)

### Vercel / Netlify / Cloudflare / Render

All four follow the same pattern: add the domain in the project's domain settings, then create the exact DNS records the dashboard shows you (values are per-project -- don't copy generic IPs from old tutorials). SSL certificates are provisioned automatically on all four once DNS propagates.

---

## Free Tier Info

| Platform | Plan | Exact limits |
|----------|------|--------------|
| Vercel | Hobby, $0 ("Free forever") | 100 GB/month fast data transfer, 1M function invocations/month, 4 hours/month active CPU for functions |
| Netlify | Free, $0 | 300 credits/month. Production deploys 15 credits each, bandwidth 20 credits/GB, compute 10 credits/GB-hour, web requests 2 credits per 10k. Sites automatically pause if they exceed monthly limits |
| Cloudflare Workers | Free, $0 | 100,000 requests/day, 10 ms CPU time per invocation. Requests to static assets are free and unlimited |
| Render | Free, $0 | 750 instance hours per workspace per month. Free services spin down after 15 min without traffic and take about a minute to spin back up. No persistent disks |
| Railway | Trial, then Free | One-time $5 trial credit valid up to 30 days (1 GB RAM, shared vCPU, max 5 services/project). Afterward $1 of credit per month, does not roll over |
| GitHub Pages | Free, $0 | Published site max 1 GB, soft bandwidth limit 100 GB/month, soft limit 10 builds/hour (does not apply when deploying via a custom Actions workflow) |

For a mostly-static SvelteKit site, Cloudflare's unlimited static asset requests are hard to beat.

---

## Troubleshooting

### Problem: Build warns "Could not detect a supported production environment"

**Cause:** You're building with the default adapter-auto on a platform it doesn't recognize (Render, Railway, a VPS, plain CI). adapter-auto only detects Cloudflare Pages, Netlify, Vercel, Azure Static Web Apps, AWS via SST, and Google Cloud Run.

**Fix:** Install and configure a concrete adapter:

```bash
npm i -D @sveltejs/adapter-node
```

```js
// svelte.config.js
import adapter from '@sveltejs/adapter-node';
```

### Problem: "Cross-site POST form submissions are forbidden" in production

**Cause:** SvelteKit's CSRF protection. Form actions work in dev but fail in production with adapter-node because the app doesn't know its own public URL, so every POST looks cross-site.

**Fix:** Set the `ORIGIN` environment variable on the host to the exact public URL:

```
ORIGIN=https://my-app.onrender.com
```

(You can also configure `csrf.checkOrigin` in `svelte.config.js`, but setting `ORIGIN` is the intended fix -- don't disable CSRF protection to make an error go away.)

### Problem: "The following routes were marked as prerenderable, but were not prerendered"

**Cause:** The prerender crawler starts from `kit.prerender.entries` (default `['*']`, all non-dynamic routes) and follows `<a>` links. A route marked `prerender = true` that nothing links to is never reached -- typical for dynamic routes like `/blog/[slug]`.

**Fix:** Export an `entries()` function from the route (see Prerendering above), add the paths to `kit.prerender.entries` in `svelte.config.js`, or use `export const prerender = 'auto'` if the route may also be server-rendered.

### Problem: Prerender build fails on a linked 404

**Cause:** `kit.prerender.handleHttpError` defaults to `'fail'` -- any crawled link that returns an error status breaks the build.

**Fix:** Fix the dead link, or tell SvelteKit which errors to tolerate:

```js
// svelte.config.js
const config = {
	kit: {
		prerender: {
			handleHttpError: ({ path, referrer, message }) => {
				if (path === '/not-found' && referrer === '/blog/how-we-built-our-404-page') {
					return; // expected; ignore
				}
				throw new Error(message);
			}
		}
	}
};
```

`'warn'` or `'ignore'` also work as blanket values, but the handler keeps you honest about which 404s are intentional.

### Problem: Blank page or broken assets on GitHub Pages

**Cause:** One of the three GitHub Pages requirements is missing: `paths.base` isn't set (assets resolve to `username.github.io/_app/...` instead of `username.github.io/my-app/_app/...`), internal links aren't prefixed with `{base}`, or Jekyll is eating the `_app` directory.

**Fix:** Set `paths.base` to `/<repo-name>` (via `BASE_PATH` in the workflow), prefix links with `base` from `$app/paths`, and make sure `static/.nojekyll` exists:

```bash
touch static/.nojekyll
git add static/.nojekyll
git commit -m "Add .nojekyll"
git push
```

### Problem: Changed an env var in the dashboard but the app still uses the old value

**Cause:** The value is imported from `$env/static/private` (or `$env/static/public`), which is statically injected into the bundle at build time. The running code literally contains the old string.

**Fix:** Either trigger a rebuild/redeploy after every env change, or switch runtime-configurable values to the dynamic module:

```js
import { env } from '$env/dynamic/private';

const dbUrl = env.DATABASE_URL; // read when the request runs, not when the build ran
```
