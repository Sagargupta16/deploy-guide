# Deploy Angular

> Deploy an Angular 22 app to GitHub Pages, Vercel, Netlify, or Cloudflare Pages, with a detour for SSR and hybrid rendering.

Angular has a built-in deploy hook: `ng deploy` runs whatever deployment builder you added via `ng add`, and the CLI docs list official builders for GitHub Pages, Netlify, Firebase, and S3 (Vercel uses its own `vercel init angular` flow instead). This guide covers the four platforms that make sense on a free tier, plus the three things that trip up every first Angular deploy: the `dist/<project>/browser` output folder, the `--base-href` flag, and the SPA fallback for deep links. Current versions as of 2026-07-06: Angular 22 (released 2026-06-03), `@angular/cli` 22.0.5. Angular v22 requires Node.js `^22.22.3 || ^24.15.0 || ^26.0.0` and TypeScript `>=6.0.0 <6.1.0`; v20 and v21 are in LTS (v20 LTS ends 2026-11-28).

## Prerequisites

- [ ] [Node.js 22.22.3+](https://nodejs.org/) installed (Angular v22 also accepts Node 24.15+ or 26)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] An account on your target platform: [Vercel](https://vercel.com/signup), [Netlify](https://app.netlify.com/signup), or [Cloudflare](https://dash.cloudflare.com/sign-up)

---

## Create the App

```bash
npm install -g @angular/cli
ng new my-app
cd my-app
ng serve
```

`ng new` walks you through stylesheet and SSR prompts -- answer No to SSR for the static deploys below (Options A-D), or see [SSR and Hybrid Rendering](#ssr-and-hybrid-rendering). Open `http://localhost:4200` to confirm it works.

Two build facts you need before deploying anywhere:

1. `ng build` applies the **production configuration by default** -- AOT, minification, bundling, dead code elimination. No `--prod` flag, no extra config.
2. With the default application builder, client bundles land in `dist/my-app/browser`, **not** `dist/my-app`. SSR server code (if any) goes to `dist/my-app/server`. Most platform "output directory" fields need the `browser` path.

If a platform can't handle the nested folder, flatten it in `angular.json` with the object form of `outputPath`:

```json
"options": {
  "outputPath": {
    "base": "dist/my-app",
    "browser": ""
  }
}
```

Push to GitHub before deploying:

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<username>/my-app.git
git push -u origin main
```

---

## Option A: GitHub Pages (angular-cli-ghpages)

[angular-cli-ghpages](https://github.com/angular-schule/angular-cli-ghpages) is the official `ng deploy` builder for GitHub Pages. Current version 3.1.0 (released 2026-06-08) supports Angular 18 through 22; older Angular versions need v1/v2 of the tool.

### Step 1: Add the Deploy Builder

```bash
ng add angular-cli-ghpages
```

### Step 2: Deploy with the Correct base-href

Project pages serve from `https://<username>.github.io/<repositoryname>/`, so the app must know its subpath. Pass it at deploy time -- leading and trailing slash both required:

```bash
ng deploy --base-href=/<repositoryname>/
```

This builds the app, injects the `<base href>`, and pushes the output to the `gh-pages` branch. Your app is live at `https://<username>.github.io/<repositoryname>/`.

Skipping `--base-href` is the number one cause of a blank page on GitHub Pages -- see [Troubleshooting](#troubleshooting).

### Step 3: Know What the Tool Did for You

By default, angular-cli-ghpages creates two extra files in the deployed output:

- **`404.html`** -- a copy of `index.html`. GitHub Pages serves this for any unknown path, which is the only known workaround for SPA routing on GitHub Pages. Disable with `--no-notfound` (you must, when targeting Cloudflare Pages -- see Option D).
- **`.nojekyll`** -- disables Jekyll processing so underscore-prefixed asset files are served.

One inherent limitation (angular-cli-ghpages issue #178, wontfix): deep links return an initial 404 network response before `404.html` loads the app. That is GitHub Pages static hosting behavior, not a bug in the tool.

Useful flags: `--dir` (override the dist folder), `--branch` (default `gh-pages`), `--no-build` (deploy an existing build).

### Deploying from CI (GitHub Actions)

For non-interactive deploys, pass the repo and git identity explicitly and supply a token:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - run: npx ng deploy --base-href=/<repositoryname>/ --name="github-actions" --email=actions@users.noreply.github.com
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

The tool reads `GH_TOKEN`, `PERSONAL_TOKEN`, or `GITHUB_TOKEN`. Gotcha: in GitHub Actions, the built-in `GITHUB_TOKEN` only triggers a Pages release on **private** repos. Public repos need a personal access token in `GH_TOKEN` (add it under **Settings** > **Secrets and variables** > **Actions**).

You can also deploy to another repo entirely:

```bash
ng deploy --repo=https://github.com/<username>/<repositoryname>.git --name="Your Git Username" --email=your.mail@example.org
```

---

## Option B: Vercel

Vercel has a first-party Angular preset (detected via `@angular/cli` in your dependencies): build command `ng build`, dev command `ng serve --port $PORT`, output directory `dist`. It auto-descends -- if `dist` contains a single subdirectory it uses it, and if that contains a `browser/` subfolder it serves from there. So the Angular 17+ `dist/my-app/browser` layout works with zero configuration, no `vercel.json` needed.

### Step 1: Import in Vercel

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click **Import Git Repository** and select `my-app`
3. Vercel detects Angular -- leave all build settings as-is
4. Click **Deploy**

Your app is live at `https://my-app.vercel.app`. No `--base-href` needed -- Vercel serves from the domain root.

### Alternative: Deploy via CLI

```bash
npm i -g vercel
cd my-app
vercel          # First deploy: links project
vercel --prod   # Deploy to production
```

Angular's own docs list `vercel init angular` as the Vercel path (it scaffolds a fresh Angular project pre-wired for Vercel), but importing an existing repo is the more common flow.

Vercel serves `index.html` for SPA deep links out of the box with the Angular preset, and you get preview deployments on every PR plus automatic production deploys on push to `main`.

---

## Option C: Netlify

Netlify auto-detects Angular and configures the publish directory from `angular.json`. The only manual step for a client-side-routed (non-SSR) app is the SPA redirect.

### Step 1: Add the SPA Redirect

Without it, deep links like `/about` return Netlify's 404 page on refresh. Two equivalent options -- pick one.

**Option 1: `_redirects` file.** Create `src/_redirects`:

```
/* /index.html 200
```

Then include it in the build assets in `angular.json` (add to the existing `assets` array of the build target):

```json
"assets": [
  "src/_redirects"
]
```

**Option 2: `netlify.toml`** in the repo root:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

### Step 2: Import in Netlify

1. Go to [app.netlify.com](https://app.netlify.com/)
2. **Add new site** > **Import an existing project**
3. Select your GitHub repo -- Netlify fills in the Angular build settings
4. Click **Deploy**

There is also an official `ng deploy` builder if you prefer deploying from the CLI:

```bash
ng add @netlify-builder/deploy
ng deploy
```

**SSR note:** if your app uses `@angular/ssr`, Netlify auto-configures it as an Edge Function -- and SSR pages **ignore** `_redirects`/`netlify.toml` redirects entirely (Edge Functions run first). Use Angular's own routing redirects instead, and test locally with `netlify serve`. Bonus: `NgOptimizedImage` automatically uses the Netlify Image CDN.

---

## Option D: Cloudflare Pages

### New Project: One Command

```bash
npm create cloudflare@latest -- my-angular-app --framework=angular --platform=pages
```

This scaffolds an Angular project pre-configured for Pages. Build command is `npm run build`; the output directory is `dist/cloudflare` or `dist/cloudflare/browser` depending on Angular version.

### Existing Project: Git Integration

1. In the Cloudflare dashboard, go to **Workers & Pages** > **Create** > **Pages** > **Connect to Git**
2. Select your repo
3. Set build command `npm run build` and output directory `dist/my-app/browser` (the application builder's default output path)
4. Deploy

### SPA Fallback on Cloudflare

Cloudflare Pages only activates SPA mode **when no `404.html` exists** in the output. This inverts the GitHub Pages rule:

- Plain `ng build` output: fine as-is -- no `404.html` is emitted, deep links fall back to `index.html`.
- Deploying with angular-cli-ghpages (it supports Cloudflare Pages too): you **must** pass `--no-notfound`, or the tool's default `404.html` copy disables SPA mode and every deep link renders the 404 page.

```bash
ng deploy --no-notfound   # when targeting Cloudflare Pages via angular-cli-ghpages
```

---

## SSR and Hybrid Rendering

Everything above deploys a client-rendered SPA. Angular also does server-side rendering and per-route hybrid rendering via `@angular/ssr`:

```bash
ng new my-app --ssr        # new project
ng add @angular/ssr        # existing project
```

Hybrid rendering lets each route pick its mode -- `RenderMode.Server` (SSR), `RenderMode.Client` (CSR), or `RenderMode.Prerender` (SSG) -- declared in `app.routes.server.ts`:

```ts
// app.routes.server.ts
import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'dashboard', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Server }
];
```

and registered via `provideServerRendering(withRoutes(serverRoutes))` in `app.config.server.ts`.

Where it deploys depends on the output mode:

- **Default SSR build** prerenders the entire application and generates a server file (in `dist/my-app/server`). That server needs a Node host -- see the [Render guide](../guides/render.md) for a free-tier Node deployment. On Netlify, SSR is auto-configured as an Edge Function (Option C notes apply). Vercel's Angular preset handles the build too.
- **`"outputMode": "static"`** in `angular.json` build options emits prerendered HTML only, no Node server required. The result deploys to any static platform in Options A-D.

Skip classic Firebase Hosting for this: its framework-aware Angular support is stuck in early preview and "new participation in the Hosting frameworks experiment has been closed permanently." Google now points Angular SSR users at Firebase App Hosting instead.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `GH_TOKEN` | Personal access token for angular-cli-ghpages CI deploys (required for Pages releases on public repos) | `ghp_xxxx` |
| `PERSONAL_TOKEN` | Alternative token variable angular-cli-ghpages reads | `ghp_xxxx` |
| `GITHUB_TOKEN` | Actions-provided token; only triggers a Pages release on private repos | provided by Actions |

Those are deploy-time variables for CI. Inside the app itself, the story is different: **a static Angular build has no runtime environment variables.** There is no `import.meta.env`, no `process.env` in the browser, and no `NG_APP_` prefix magic in the default builder. Changing a dashboard env var on Vercel or Netlify does nothing to an already-built Angular bundle.

The Angular pattern is build-time file replacement. Values live in environment files:

```ts
// src/environments/environment.ts
export const environment = {
  apiUrl: 'https://api.example.com'
};
```

```ts
import { environment } from '../environments/environment';

fetch(`${environment.apiUrl}/todos`);
```

`ng generate environments` scaffolds the files, and `fileReplacements` in an `angular.json` configuration swaps one file for another per build config:

```json
"fileReplacements": [
  {
    "replace": "src/environments/environment.ts",
    "with": "src/environments/environment.staging.ts"
  }
]
```

Then `ng build --configuration staging` bakes the staging values in. Need a different value? Rebuild. Never put secrets in environment files -- they ship to every browser.

For local development against a backend, skip CORS entirely with the dev-server proxy. Create `src/proxy.conf.json`:

```json
{
  "/api/**": {
    "target": "http://localhost:3000"
  }
}
```

Wire it via the `proxyConfig` option on the `serve` target in `angular.json`, and restart `ng serve` after changes. Note the default `@angular/build:dev-server` uses Vite-style path matching; only the legacy builder uses Webpack-style.

---

## Custom Domain

Domain setup is platform work, not Angular work. Follow the platform guide:

- **GitHub Pages:** [GitHub Pages guide](../guides/github-pages.md#custom-domain). One Angular-specific step: with a custom domain the site serves from the root, so drop `--base-href` (or set it back to `/`) and redeploy.
- **Vercel:** [Vercel guide](../guides/vercel.md) -- add the domain under **Settings** > **Domains**, create the DNS records the dashboard shows, SSL is automatic.
- **Netlify:** [Netlify guide](../guides/netlify.md) -- **Domain settings** > add domain, then DNS.
- **Cloudflare Pages:** [Cloudflare Pages guide](../guides/cloudflare-pages.md) -- custom domains attach in the project's **Custom domains** tab.

---

## Free Tier Info

| Platform | Plan | Exact limits |
|----------|------|--------------|
| GitHub Pages | Free, $0 | Published site max 1 GB, soft bandwidth limit 100 GB/month, soft limit 10 builds/hour (does not apply to custom Actions workflows) |
| Vercel | Hobby, $0 | 1M function invocations/month, 4 CPU-hrs active CPU, 360 GB-hrs provisioned memory, up to 1M edge requests, 200 projects, 100 deployments/day, 50 domains per project, 300s max function duration, non-commercial personal use only. Pro is $20 per user/month |
| Netlify | Free, $0 | 300 credits/month, hard limit, no auto-recharge. 1 GB bandwidth = 20 credits (~15 GB/month), 10,000 web requests = 2 credits, 1 production deploy = 15 credits, 1 GB-hr functions compute = 10 credits. Personal $9/month = 1,000 credits |
| Cloudflare Pages | Free, $0 | See the [Cloudflare Pages guide](../guides/cloudflare-pages.md) for current plan limits |

For a plain client-rendered Angular app, GitHub Pages costs nothing and needs no account beyond GitHub. If you expect real traffic or want preview deploys, Vercel or Cloudflare Pages are the better defaults.

---

## Troubleshooting

### Problem: Blank page after deploying to GitHub Pages

**Cause:** The `<base href>` still points at `/`, so every script and stylesheet resolves to `https://<username>.github.io/main.js` instead of `https://<username>.github.io/<repositoryname>/main.js`.

**Fix:** Deploy with the base href set to your repo name, leading and trailing slash included:

```bash
ng deploy --base-href=/<repositoryname>/
```

Building manually instead? The same flag exists on the build: `ng build --base-href=/<repositoryname>/`. (`ng build` also supports `--deploy-url` for asset URLs, but the docs note `<base href>` is generally preferred.)

### Problem: Deep links 404 on refresh

**Cause:** Angular routing is client-side. For routed SPAs the Angular docs require the server to return `index.html` for unknown paths, and static hosts don't do that by default.

**Fix:** Platform-specific fallback:

- **GitHub Pages:** the `404.html` copy angular-cli-ghpages creates by default is the workaround. Don't pass `--no-notfound` here. Deep links still log an initial 404 network response before the app loads -- inherent to GitHub Pages, not fixable.
- **Netlify:** add the `/* /index.html 200` redirect (Option C, Step 1).
- **Cloudflare Pages:** make sure no `404.html` exists in the output -- SPA mode only activates without one.
- **Vercel:** handled by the Angular preset; no action needed.

### Problem: Build fails with a bundle budget error

**Cause:** The production bundle exceeded `maximumError` in the size budgets under `configurations.production.budgets` in `angular.json`. The default `initial` budget warns at 250kb and errors at 500kb; `anyComponentStyle` warns at 2kb and errors at 4kb. `maximumWarning` only warns; `maximumError` fails the build.

**Fix:** First find out what got heavy:

```bash
ng build --stats-json
```

Analyze the emitted stats file with [esbuild-visualizer](https://www.npmjs.com/package/esbuild-visualizer). Lazy-load heavy routes and trim oversized dependencies. If the size is genuinely justified, raise the budget in `angular.json`:

```json
"budgets": [
  {
    "type": "initial",
    "maximumWarning": "500kb",
    "maximumError": "1mb"
  }
]
```

Budget types available: `initial`, `anyComponentStyle`, `bundle`, `all`, `allScript`, `any`, plus relative budgets via a baseline and percentages.

### Problem: Cloudflare Pages shows the 404 page for every route

**Cause:** A `404.html` file in the deployed output. Cloudflare Pages only activates SPA mode when no `404.html` exists, and angular-cli-ghpages creates one by default.

**Fix:** Redeploy without it:

```bash
ng deploy --no-notfound
```

### Problem: GitHub Actions deploy runs green but the public Pages site never updates

**Cause:** The workflow authenticated with the built-in `GITHUB_TOKEN`, which only triggers a Pages release on private repos.

**Fix:** Create a personal access token, store it as a repo secret, and pass it as `GH_TOKEN`:

```yaml
- run: npx ng deploy --base-href=/<repositoryname>/ --name="github-actions" --email=actions@users.noreply.github.com
  env:
    GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

### Problem: Platform deploys but serves a directory listing or "index.html not found"

**Cause:** The output directory setting points at `dist/my-app`, but the application builder writes client files to `dist/my-app/browser`.

**Fix:** Point the platform at the `browser` subfolder (e.g. output directory `dist/my-app/browser` on Cloudflare Pages), or flatten the output in `angular.json`:

```json
"outputPath": {
  "base": "dist/my-app",
  "browser": ""
}
```

Vercel needs neither -- its Angular preset auto-descends into single subdirectories and `browser/` folders.
