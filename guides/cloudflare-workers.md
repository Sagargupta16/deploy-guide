# Cloudflare Workers

> Deploy static sites, SPAs, and full-stack apps on Workers with static assets -- the path Cloudflare recommends for all new projects.

Since April 2025, Cloudflare's guidance is to start new projects on [Workers with static assets](https://developers.cloudflare.com/workers/static-assets/) rather than Pages. Pages still works and is fully supported, but new investment goes into Workers, and some features are Workers-only. The model is one deployment unit: a folder of built files plus an optional Worker script. Static files are served straight from Cloudflare's edge and cost nothing; the Worker only runs when you need dynamic behavior. This guide covers project creation, the `assets` configuration that does most of the work, D1 and KV bindings, secrets, custom domains, and a step-by-step migration from an existing Pages project. Wrangler 4.129.0 is current as of 2026-09-06.

## Prerequisites

- [ ] A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free)
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] [Node.js 22+](https://nodejs.org/)
- [ ] Wrangler, invoked with `npx wrangler` (Cloudflare recommends a local install over a global one)
- [ ] For a custom domain: the domain must already be an active zone on Cloudflare

---

## Step 1: Create a Worker

```bash
npm create cloudflare@latest -- my-worker
cd my-worker
```

The scaffolder asks which language you want. Pick JavaScript and you get `src/index.js`; pick TypeScript and it is `src/index.ts`. This guide uses the JavaScript file, so swap the extension in `main` if you chose TypeScript.

The generated `src/index.js` is the whole contract:

```js
export default {
  async fetch(request, env, ctx) {
    return new Response("Hello World!");
  },
};
```

`env` carries every binding you declare in the config file (vars, secrets, D1, KV). `ctx` gives you `waitUntil` for work that should outlive the response.

Run it locally:

```bash
npx wrangler dev
```

Wrangler serves on `http://localhost:8787`. The first run opens a browser to log in to your Cloudflare account.

## Step 2: Serve Static Assets

Point `assets.directory` at your build output. This is the entire static-hosting setup:

```jsonc
{
  "name": "my-worker",
  "compatibility_date": "2026-09-06",
  "main": "./src/index.js",
  "assets": {
    "directory": "./dist/",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  }
}
```

Set `compatibility_date` to the date you scaffold the project, then leave it alone. Bumping it opts you into later runtime behavior changes.

The four fields that matter:

| Field | What it does |
|-------|--------------|
| `directory` | Folder of built files Wrangler uploads on deploy. Omit it if you use the Cloudflare Vite plugin. |
| `binding` | Exposes the assets to your Worker as `env.ASSETS`, so you can call `env.ASSETS.fetch(request)`. Drop it if you have no `main` script. |
| `not_found_handling` | `"single-page-application"` returns `index.html` with `200 OK` for unmatched paths. `"404-page"` returns the nearest `404.html` with a 404. |
| `run_worker_first` | Runs the Worker before asset serving. `true` for every request, or an array of path patterns. Prefix a pattern with `!` to exclude it. |

Default routing without `run_worker_first`: if a file matches the path, it is served directly and **the Worker never runs**. Otherwise the request goes to the Worker. If there is no Worker script at all, the result is a 404.

That default is the important bit for cost. Cloudflare's wording is that requests to static assets are free and unlimited, and that there is no extra charge for storing them, so a site served entirely out of the asset directory costs nothing to serve.

Use `run_worker_first` when you need code in front of the assets -- an auth check, request logging, or an API path:

```jsonc
"assets": {
  "directory": "./dist/",
  "binding": "ASSETS",
  "not_found_handling": "single-page-application",
  "run_worker_first": ["/api/*", "!/api/docs/*"]
}
```

Anything matched this way is billed as a normal Worker invocation.

Add a `.assetsignore` file in the asset directory to keep `node_modules`, `.git`, `.DS_Store` and similar out of the upload.

## Step 3: Deploy

```bash
npx wrangler deploy
```

The Worker goes live at `<worker-name>.<your-subdomain>.workers.dev`. A brand-new subdomain sometimes throws `523` for about a minute before DNS settles.

For safer rollouts, upload a version without routing traffic to it, then promote it:

```bash
npx wrangler versions upload
npx wrangler versions deploy
```

Tail live logs:

```bash
npx wrangler tail
```

## SSR with a Framework

Server-rendered frameworks need an adapter that emits a Worker entry plus a client asset directory. The pattern is the same everywhere: build produces `dist/client/` (assets) and a server bundle (`main`).

- **Astro, SvelteKit, Nuxt, Remix, Qwik** -- use the framework's official Cloudflare adapter, which writes the `assets` and `main` configuration for you.
- **Next.js** -- use [OpenNext](https://opennext.js.org/cloudflare), which builds Next output into a Worker.
- **Vite-based SPAs** -- no adapter needed. `assets.directory` plus `not_found_handling: "single-page-application"` is the whole config.

If you are moving from a Pages adapter, swap it for the Workers one. Pages adapters and Workers adapters are not interchangeable.

## D1 Database (SQLite at the Edge)

Create the database:

```bash
npx wrangler d1 create my-app-db
```

Wrangler offers to write the binding into your config. Accept, or add it yourself:

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-app-db",
      "database_id": "<unique-ID-for-your-database>"
    }
  ]
}
```

The binding name must be a valid JavaScript identifier, and your database is reachable at `env.DB`.

Apply a schema locally first, then to production:

```bash
# local: writes into .wrangler/state/v3/d1
npx wrangler d1 execute my-app-db --local --file=./schema.sql

# production
npx wrangler d1 execute my-app-db --remote --file=./schema.sql

# ad-hoc query
npx wrangler d1 execute my-app-db --remote --command="SELECT * FROM customers"
```

Query it from the Worker with prepared statements:

```js
const { results } = await env.DB
  .prepare("SELECT * FROM customers WHERE company = ?")
  .bind("Bs Beverages")
  .run();
return Response.json(results);
```

Always use `.bind()` for values rather than string interpolation. That is what stops a query parameter from becoming arbitrary SQL.

## KV Storage

```bash
npx wrangler kv namespace create SESSIONS
```

```jsonc
{
  "kv_namespaces": [
    {
      "binding": "SESSIONS",
      "id": "<BINDING_ID>"
    }
  ]
}
```

From the CLI (writes go to local storage unless you pass `--remote`):

```bash
npx wrangler kv key put --binding=SESSIONS "user_1" "enabled" --remote
npx wrangler kv key get --binding=SESSIONS "user_1" --text --remote
```

Exactly one of `--binding` or `--namespace-id` is required.

From Worker code:

```js
await env.SESSIONS.put("user_2", "disabled");
const value = await env.SESSIONS.get("user_2");   // null when the key is absent
```

`get()` returns `null` on a miss rather than throwing, but the surrounding call can still throw, so handle exceptions explicitly.

## Environment Variables and Secrets

Non-sensitive values go in `vars` in the config file and land on `env`:

```jsonc
{
  "vars": {
    "API_BASE_URL": "https://api.example.com",
    "ENVIRONMENT": "production"
  }
}
```

Never put sensitive values in `vars` -- the config file is committed to git. Use secrets:

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret delete DATABASE_URL
```

`wrangler secret put` creates a new version of the Worker **and deploys it immediately**. If you are using gradual deployments and do not want that, use `npx wrangler versions secret put` instead, which only creates the version.

At runtime there is no difference between a var and a secret -- both arrive on `env`. The difference is visibility: a secret's value cannot be read back from Wrangler or the dashboard after you set it.

For local development, put values in a `.dev.vars` file (or a `.env` file -- pick one, not both) next to your Wrangler config, in dotenv format:

```
DATABASE_URL=postgresql://localhost:5432/dev
API_KEY=local-dummy-key
```

Add both to `.gitignore`. Per-environment variants like `.dev.vars.staging` are supported.

Note that Workers keeps runtime variables and build-time variables separate. If you use Workers Builds for CI, set build-environment variables there as well.

## Custom Domain

The domain must already be an active zone on your Cloudflare account. You cannot attach a Custom Domain to a hostname that already has a CNAME record, or to a zone you do not own.

**Dashboard:**

1. In the Cloudflare dashboard, go to **Workers & Pages**.
2. In **Overview**, select your Worker.
3. Go to **Settings** > **Domains & Routes** > **Add** > **Custom Domain**.
4. Enter the hostname.
5. Select **Add Custom Domain**.

Cloudflare creates the DNS record and issues an Advanced Certificate for that hostname automatically.

**Wrangler:**

```jsonc
{
  "routes": [
    {
      "pattern": "shop.example.com",
      "custom_domain": true
    }
  ]
}
```

Then `npx wrangler deploy`.

Custom Domains vs Routes:

| | Custom Domain | Route |
|---|---------------|-------|
| **Path coverage** | All paths of the hostname; path and query are ignored when matching | Pattern-based, e.g. `example.com/api/*` |
| **DNS and certificates** | Created and managed for you | You create the DNS record yourself (usually a CNAME to `100::`) |
| **Wildcards** | Not supported, exact hostname only | Patterns can include `/*` |
| **Position in the chain** | The Worker is treated as an origin | The Worker runs in front of the origin |
| **Same-zone `fetch()`** | Works without a service binding | Needs a service binding |

Two gotchas:

- No wildcards means `example.com` does not serve `www.example.com`. Add the second hostname or a redirect rule.
- Deleting a Custom Domain leaves its certificate behind. Remove it under **SSL/TLS** > **Edge Certificates** if you are done with the hostname.

## Migrating from Pages

Cloudflare has an [official migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/). The concrete steps:

1. **Add a Wrangler config file** at the project root if you do not have one. Only `name` and `compatibility_date` are required. Reuse the `compatibility_date` from your Pages Functions config so runtime behavior does not shift under you.
2. **Move the build output setting.** Replace `pages_build_output_dir` with `assets.directory` (for example `./dist/client/`).
3. **Set `not_found_handling` explicitly.** Pages inferred SPA-vs-404 behavior from the presence of `index.html` or `404.html`. Workers does not guess -- pick `"single-page-application"` or `"404-page"` yourself. Skipping this step is the most common reason a migrated SPA starts 404ing on deep links.
4. **Convert `functions/`.** Compile the directory into a single Worker, then point `main` at the result:

   ```bash
   npx wrangler pages functions build --outdir=./dist/worker/
   ```

   If you want to keep file-based routing, a framework like HonoX gives you that on Workers.
5. **Handle `_worker.js` (advanced mode).** Move it out of the asset directory, or list it in `.assetsignore`, so it is not uploaded as a static file. Then set `main` to its path.
6. **Declare the `ASSETS` binding.** It was implicit on Pages; on Workers you add `assets.binding` yourself. Omit it entirely if you have no `main` script.
7. **Re-check middleware order.** Pages ran Functions before static assets. Workers serves assets first. Anything that must run ahead of asset serving (auth, logging) needs `assets.run_worker_first`, and is billed as a Worker invocation.
8. **Update commands.** `wrangler pages dev` becomes `wrangler dev`, `wrangler pages deploy` becomes `wrangler deploy`. The dev port changes from 8788 to 8787; override with `--port`.
9. **Move CI.** Swap Pages CI/CD for Workers Builds: connect the repo, then disable Pages automatic deployments so both do not deploy. Set `"workers_dev": true` for a `workers.dev` subdomain and `"preview_urls": true` plus non-production branch builds to approximate Pages preview environments.
10. **Delete the old project** once traffic has moved: `npx wrangler pages project delete <project-name>`.

`_headers` and `_redirects` are supported natively on Workers as long as the files sit in the asset directory, exactly as on Pages.

What is still missing compared to Pages:

- Custom domains on zones whose nameservers are not on Cloudflare are not supported.
- Custom Branch Aliases are not available yet, and Branch Deploy Controls are only partly configurable.
- Per-environment bindings (different bindings for production and preview) are not native. Use Wrangler Environments as the workaround.
- Early Hints needs a workaround: enable the zone setting and send `Link` headers from your Worker.

## Free Tier Info

| Feature | Free | Workers Paid ($5/mo) |
|---------|------|----------------------|
| **Static asset requests** | Free and unlimited | Free and unlimited |
| **Asset storage** | No charge | No charge |
| **Worker requests** | 100,000/day | No limit |
| **CPU time per invocation** | 10 ms | Up to 5 min (default 30s) |
| **Memory per isolate** | 128 MB | 128 MB |
| **Subrequests per request** | 50 | 10,000 |
| **Workers per account** | 100 | 500 |
| **Variables per Worker** (vars + secrets) | 64, 5 KB each | 128 |
| **Static files per version** | 20,000 | 100,000 |
| **Individual file size** | 25 MiB | 25 MiB |
| **Worker bundle size** | 64 MiB uncompressed | 64 MiB uncompressed |

Key things to know:

- The 100,000/day figure counts **Worker invocations, not page views**. Requests that are served straight from the asset directory are free and unlimited, so a static site is not billed per request.
- The daily request counter resets at midnight UTC. Exceeding it returns Cloudflare `Error 1027`.
- 10 ms of CPU time on the free tier is generous in practice, because it measures CPU, not wall clock. Time spent awaiting a `fetch()` or a D1 query does not count.
- There is no compressed-size limit. Only the uncompressed 64 MiB bundle size is checked.
- Raised file counts need Wrangler 4.34.0 or later.
- If you use `run_worker_first` on the free tier and blow through the daily request limit, matching requests return `429` instead of falling back to serving the static asset.

## Troubleshooting

### Problem: Deep links 404 after deploying an SPA

**Cause:** `not_found_handling` is unset, so an unmatched path falls through to the Worker (or to a bare 404 when there is no Worker). Unlike Pages, Workers does not infer SPA behavior from the presence of `index.html`.

**Fix:** Set it explicitly.

```jsonc
"assets": {
  "directory": "./dist/",
  "not_found_handling": "single-page-application"
}
```

### Problem: `assets.bucket is a required field`

**Cause:** An old Wrangler. `bucket` is not actually a required field, but versions before 3.78.10 insist on it.

**Fix:**

```bash
npm install --save-dev wrangler@latest
npx wrangler --version
```

### Problem: The Worker code never runs

**Cause:** A static file matches the request path, and matching assets are served without invoking the Worker. That is the default and it is usually what you want.

**Fix:** If the Worker genuinely needs to see those requests, list the paths under `run_worker_first`. Remember each matched request is billed as an invocation, so scope the patterns rather than setting `true`.

```jsonc
"run_worker_first": ["/api/*"]
```

### Problem: `Error 1027` in production

**Cause:** The free plan's 100,000 Worker requests per day has been exhausted.

**Fix:** The counter resets at midnight UTC. To fix it properly, either move work out of the Worker so the request is served as a static asset, or upgrade to Workers Paid. Check which paths are actually invoking the Worker:

```bash
npx wrangler tail
```

### Problem: A secret works locally but is undefined once deployed

**Cause:** `.dev.vars` is local-only. It is never uploaded, by design.

**Fix:** Set the secret on the deployed Worker too.

```bash
npx wrangler secret put MY_SECRET
```

If you are on gradual deployments and do not want the immediate redeploy that `secret put` triggers, use `npx wrangler versions secret put MY_SECRET`.

### Problem: `wrangler d1 execute` succeeds but the deployed Worker sees an empty database

**Cause:** The command defaulted to local state (`.wrangler/state/v3/d1`) instead of the real database.

**Fix:** Pass `--remote`.

```bash
npx wrangler d1 execute my-app-db --remote --file=./schema.sql
```

The same applies to `wrangler kv key put`, which also writes locally unless you pass `--remote`.

### Problem: Adding a Custom Domain fails

**Cause:** One of three things: the zone is not on Cloudflare, you do not own the zone, or the hostname already has a CNAME record.

**Fix:** Move the domain to Cloudflare first, then delete any conflicting CNAME for that exact hostname before adding the Custom Domain. Remember that Custom Domains do not support wildcards, so `example.com` and `www.example.com` are two separate entries.

### Problem: A Node built-in fails at runtime

**Cause:** Workers runs V8 isolates, not Node. Node built-ins are available only behind a compatibility flag, and some are not available at all.

**Fix:** Add the flag and re-deploy.

```jsonc
{
  "compatibility_date": "2026-09-06",
  "compatibility_flags": ["nodejs_compat"]
}
```

If the module still fails, it is one of the unsupported ones -- swap it for a Web-standard API (`fetch`, `crypto.subtle`, `URL`) or an edge-compatible package.
