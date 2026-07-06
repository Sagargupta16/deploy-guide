# GitHub Pages

> Deploy static sites, SPAs, and frontend apps for free with GitHub Pages.

GitHub Pages serves static files directly from a GitHub repository. It supports custom domains, HTTPS, and automated deploys via GitHub Actions. Perfect for portfolios, documentation, and single-page applications. It is free, with soft limits: published sites up to 1 GB, 100 GB bandwidth per month, and 10 builds per hour for branch-based deploys (deploys via a custom GitHub Actions workflow are exempt from the build limit).

## Prerequisites

- [ ] A [GitHub account](https://github.com/signup)
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] [Node.js 22+](https://nodejs.org/) (for React/Vue projects; Vite requires Node 20.19+ or 22.12+, and 24 is the current Active LTS)

## Deploy Static HTML

### Step 1: Create a Repository

Create a new repository on GitHub. You can name it anything (e.g., `my-website`), or use `<username>.github.io` for a user site.

### Step 2: Push Your Static Files

```bash
mkdir my-website && cd my-website
git init
echo '<!DOCTYPE html><html><head><title>My Site</title></head><body><h1>Hello, World!</h1></body></html>' > index.html
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-website.git
git push -u origin main
```

### Step 3: Enable GitHub Pages

1. Go to your repo on GitHub
2. Navigate to **Settings** > **Pages**
3. Under **Source**, select **Deploy from a branch**
4. Select the `main` branch and `/ (root)` folder
5. Click **Save**

Your site will be live at `https://<username>.github.io/my-website/` within a few minutes.

---

## Deploy React (Vite)

### Step 1: Create a Vite React App

```bash
npm create vite@latest my-react-app -- --template react
cd my-react-app
npm install
```

Or with pnpm:

```bash
pnpm create vite my-react-app --template react
cd my-react-app
pnpm install
```

### Step 2: Set the Base Path

Edit `vite.config.js` to set the base path to your repository name:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/my-react-app/',  // Must match your repo name
})
```

### Step 3: Add SPA Redirect for Client-Side Routing

GitHub Pages doesn't natively support client-side routing. Create a `public/404.html` that redirects to `index.html`:

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Redirecting...</title>
    <script>
      // Redirect all 404s to index.html for SPA routing
      var pathSegmentsToKeep = 1; // 1 for project sites, 0 for user sites
      var l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
        l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      );
    </script>
  </head>
  <body></body>
</html>
```

> **Tip:** A simpler alternative is to copy the built `index.html` to `404.html` in your deploy workflow (`cp dist/index.html dist/404.html` after the build step) -- Pages then serves your SPA for any deep link. If you use React Router's `BrowserRouter`, its `basename` must also match the Vite base (`<BrowserRouter basename="/my-react-app">`), or assets load but no routes match.

### Step 4: Deploy with GitHub Actions

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
          node-version: 24
          cache: npm

      - uses: actions/configure-pages@v6

      - run: npm ci
      - run: npm run build

      - uses: actions/upload-pages-artifact@v5
        with:
          path: dist

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

> **Tip:** Using pnpm? Add a `pnpm/action-setup` step before `setup-node`, set `cache: pnpm`, and install with `pnpm install --frozen-lockfile` instead of `npm ci`.

### Step 5: Enable Pages with GitHub Actions Source

1. Go to **Settings** > **Pages**
2. Under **Source**, select **GitHub Actions**
3. Push your code to `main` -- the workflow will build and deploy automatically

```bash
git add .
git commit -m "Add GitHub Actions deploy workflow"
git push origin main
```

Your React app will be live at `https://<username>.github.io/my-react-app/`.

---

## Deploy Vue (Vite)

### Step 1: Create a Vue App

```bash
npm create vite@latest my-vue-app -- --template vue
cd my-vue-app
npm install
```

Or with pnpm: `pnpm create vite my-vue-app --template vue`.

### Step 2: Set the Base Path

Edit `vite.config.js`:

```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/my-vue-app/',  // Must match your repo name
})
```

### Step 3: Deploy with GitHub Actions

Use the same GitHub Actions workflow as the React (Vite) section above. The `dist` output directory is the same.

### Step 4: Configure Vue Router for GitHub Pages

If using Vue Router, set the base in your router config:

```js
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory('/my-vue-app/'),  // Match your repo name
  routes: [
    // your routes
  ],
})
```

Also add the same `public/404.html` SPA redirect from the React section above.

---

## GitHub Actions CI/CD

The workflow above handles automatic deployment on every push to `main`. Here is how to add build checks on pull requests:

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  build-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - run: npm ci
      - run: npm run build
      - run: npm test -- --passWithNoTests
```

This ensures PRs don't break the build before merging.

---

## Environment Variables

GitHub Pages serves static files only -- there is no server-side environment. If you need build-time environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | API base URL (Vite) | `https://api.example.com` |
| `VITE_APP_TITLE` | App title (Vite) | `My App` |

Set them in your GitHub Actions workflow:

```yaml
- run: npm run build
  env:
    VITE_API_URL: ${{ secrets.API_URL }}
```

Or add them in **Settings** > **Secrets and variables** > **Actions**.

> **Warning:** All `VITE_` prefixed variables are embedded in the built JavaScript and visible to anyone. Never put API secrets here.

## Custom Domain

### Step 1: Add a CNAME File

Create a `public/CNAME` file (so it gets copied to `dist` during build):

```
www.yourdomain.com
```

### Step 2: Configure DNS

Add these DNS records with your domain registrar:

**For apex domain (`yourdomain.com`):**

| Type | Name | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

**For subdomain (`www.yourdomain.com`):**

| Type | Name | Value |
|------|------|-------|
| CNAME | www | `<username>.github.io` |

### Step 3: Enable in GitHub

1. Go to **Settings** > **Pages**
2. Enter your custom domain under **Custom domain**
3. Check **Enforce HTTPS** (wait for the DNS check to pass first)

DNS propagation can take up to 24 hours, but usually completes within minutes.

## Troubleshooting

### Problem: Page shows 404 after deploy

**Cause:** The `base` path in `vite.config.js` doesn't match the repository name, or Pages is not enabled.

**Fix:**

1. Verify `base` in `vite.config.js` matches `/<repo-name>/` exactly (with trailing slash)
2. Check **Settings** > **Pages** -- ensure the source is set correctly
3. Wait 2-3 minutes for the deploy to propagate

### Problem: Blank page with no errors

**Cause:** Asset paths are wrong because `base` is not set.

**Fix:**

```js
// vite.config.js
export default defineConfig({
  base: '/your-repo-name/',
})
```

### Problem: Routes return 404 on refresh (React Router / Vue Router)

**Cause:** GitHub Pages doesn't support client-side routing natively. It serves `index.html` only at the root path.

**Fix:** Add the `404.html` redirect from the React section above. This catches 404s and redirects them to your SPA.

### Problem: GitHub Actions workflow fails

**Cause:** Permissions or configuration issue.

**Fix:**

1. Go to **Settings** > **Actions** > **General** and set workflow permissions to **Read and write**
2. Go to **Settings** > **Pages** and set source to **GitHub Actions**
3. Ensure `actions/upload-pages-artifact` points to the correct build directory (`dist` for Vite)

### Problem: Custom domain not working

**Cause:** DNS records not propagated or CNAME file missing.

**Fix:**

1. Verify DNS records with: `dig yourdomain.com +short`
2. Ensure the `CNAME` file is in `public/` (not root) so it gets copied to `dist`
3. Wait up to 24 hours for DNS propagation
4. Re-enter the custom domain in **Settings** > **Pages** and save

### Problem: HTTPS not available for custom domain

**Cause:** DNS hasn't fully propagated yet.

**Fix:** Wait for the DNS check to pass in **Settings** > **Pages**, then check **Enforce HTTPS**. This can take up to 1 hour after DNS propagates.
