# Deploy NestJS

> Deploy a NestJS API to Render and Railway with the correct PORT binding, @nestjs/config, a production Swagger toggle, and an optional multi-stage Dockerfile.

This guide covers deploying a production-ready NestJS v11 application to two platforms: **Render** (free tier with spin-down) and **Railway** (one-time $5 trial credit, then $1/month free credit). It includes the build output layout (`dist/main.js`), environment configuration with `@nestjs/config`, turning Swagger off in production, and the `0.0.0.0` binding gotcha that causes most first-deploy 502s.

## Prerequisites

- [ ] [Node.js 22+](https://nodejs.org/) installed (NestJS v11 requires Node 20+; the Nest CLI requires 20.11+; 22 matches Railway's default)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Render account](https://render.com/) (sign up with GitHub)
- [ ] A [Railway account](https://railway.com/)
- [ ] [Docker](https://docs.docker.com/get-started/get-docker/) installed (optional, for the container image step)

---

## Step 1: Create a NestJS App

```bash
npm i -g @nestjs/cli
# installs @nestjs/cli 11.0.23
nest new my-nest-api
# choose npm when prompted (or pnpm)
cd my-nest-api
```

This scaffolds the official TypeScript starter on NestJS v11 (latest release is 11.1.27, 2026-06-15). Version notes that matter for deployment:

- v11 requires **Node.js 20 or higher** (v16 and v18 support was dropped).
- **Express v5** is the default HTTP adapter. Wildcards must be named: route `*splat`, not a bare `*`.
- **Fastify v5** is available via `@nestjs/platform-fastify` -- see the Fastify gotcha in Step 2 if you use it.

The starter's `package.json` already has the three scripts deployment depends on:

```json
{
  "scripts": {
    "build": "nest build",
    "start": "nest start",
    "start:prod": "node dist/main"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  }
}
```

`npm run build` compiles TypeScript into `dist/`, with `dist/main.js` as the entry point. Production runs plain `node` -- the Nest CLI is not needed at runtime.

Add a health endpoint to `src/app.controller.ts` -- both platforms (and uptime pingers) will probe it:

```ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return { status: 'ok' };
  }
}
```

For real readiness checks (database ping, memory, disk), the official docs recommend [`@nestjs/terminus`](https://docs.nestjs.com/recipes/terminus). The plain route above is enough for a free-tier deploy.

Test locally:

```bash
npm run start:dev
# Open http://localhost:3000 -> "Hello World!"
curl http://localhost:3000/health
# {"status":"ok"}
```

---

## Step 2: Bind to PORT and 0.0.0.0

Edit `src/main.ts`:

```ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
```

Why both arguments matter:

- **`process.env.PORT`** -- Render injects `PORT` (default `10000`) and Railway injects `PORT` automatically. Hardcoding 3000 gets you a 502.
- **`'0.0.0.0'`** -- the Express adapter binds all interfaces by default, but the official docs warn that **Fastify listens only on `127.0.0.1` by default**, which is unreachable from the platform's proxy. Passing `'0.0.0.0'` explicitly makes the same `main.ts` correct on both adapters and both platforms.

---

## Step 3: Environment Config with @nestjs/config

```bash
npm i --save @nestjs/config
# installs @nestjs/config 4.0.4
```

Register it once in `src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,  // available in every module without re-importing
      cache: true,     // faster repeated reads of process.env
      envFilePath: ['.env.local', '.env'],  // first match wins
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

Read values through `ConfigService` instead of touching `process.env` all over the codebase:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  getHello(): string {
    const name = this.configService.get<string>('APP_NAME') ?? 'World';
    return `Hello ${name}!`;
  }
}
```

Two options worth knowing before production:

- **`validate`** -- pass a synchronous validation function to `forRoot`; it runs at startup and blocks bootstrap when a required variable is missing or malformed. Fail at boot, not on the first request.
- **`expandVariables: true`** -- enables `${OTHER_VAR}` references inside `.env` files.

**v11 breaking change:** `@nestjs/config` precedence was reordered -- internal configuration (custom config files) now takes priority over environment variables, and `ignoreEnvVars` is deprecated in favor of `validatePredefined`. If you migrated from v10 and a config file value silently "wins" over a platform env var, this is why.

Create a local `.env` for development and confirm it is ignored by git (the platform dashboards hold the real values):

```bash
echo "APP_NAME=Local" > .env
grep -q "^\.env$" .gitignore || echo ".env" >> .gitignore
```

---

## Step 4: Disable Swagger in Production

```bash
npm i --save @nestjs/swagger
# installs @nestjs/swagger 11.4.5
```

Wrap the Swagger setup in a `NODE_ENV` check in `src/main.ts` -- the long-standing community pattern (tracked since nestjs/swagger issue #184) so neither the UI nor the JSON/YAML spec is served in production:

```ts
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('My API')
      .setVersion('1.0')
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
```

In development the UI is at `http://localhost:3000/api`. If you want the machine-readable spec in production (for client generation) but no UI, keep the setup unconditional and pass `SwaggerCustomOptions` instead:

```ts
SwaggerModule.setup('api', app, documentFactory, {
  ui: false,        // disable the UI, keep the JSON definitions
  raw: ['json'],    // serve only the JSON spec, not YAML
});
```

Remember to set `NODE_ENV=production` on the platform (both platforms' env var sections below) -- neither Render nor Railway sets it for you at runtime.

---

## Step 5: Build and Run the Production Bundle Locally

```bash
npm run build
# compiled output lands in dist/, entry point dist/main.js

NODE_ENV=production node dist/main.js
# Windows PowerShell: $env:NODE_ENV="production"; node dist/main.js
curl http://localhost:3000/health
# {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api
# 404 -- Swagger is off in production
```

This is exactly what the platforms will run. If it fails locally, it fails there.

---

## Step 6: Push to GitHub

```bash
git init -b main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<username>/my-nest-api.git
git push -u origin main
```

---

## Option A: Deploy to Render

### Step A1: Create the Web Service

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `my-nest-api`
   - **Language:** Node
   - **Build Command:** `npm ci && npm run build`
   - **Start Command:** `node dist/main.js`
   - **Instance Type:** Free
5. Under **Advanced**, set **Health Check Path** to `/health`
6. Click **Create Web Service**

Do **not** use `npm start` as the start command -- the starter's `start` script runs `nest start`, which is the dev-mode CLI path. Production runs the compiled output directly.

Every push to the linked branch auto-builds and deploys. Failed builds keep the previous version live.

### Step A2: Pin the Node Version

Render's default Node is 24.14.1 (for services created on or after 2026-04-21). The starter's `engines` range `>=20.0.0` is unbounded, and Render resolves unbounded ranges to the latest Node -- which can change under you. Override precedence: `NODE_VERSION` env var > `.node-version` file > `.nvmrc` > `package.json` engines. Simplest fix is a bounded engines range:

```json
{
  "engines": {
    "node": "22.x"
  }
}
```

### Step A3: Runtime Rules

- Render injects `PORT` (default `10000`) and requires binding to `0.0.0.0` -- the `main.ts` from Step 2 satisfies both.
- Ports 18012, 18013, and 19099 are reserved -- don't bind them.
- The free instance has 512 MB RAM and 0.1 CPU; see Free Tier Info below for spin-down behavior.

Your API is live at `https://my-nest-api.onrender.com`.

---

## Option B: Deploy to Railway

### Step B1: Deploy from GitHub (dashboard)

1. Go to [railway.com/new](https://railway.com/new)
2. Choose **Deploy from GitHub repo** and select `my-nest-api`
3. Railway's default builder, Railpack, detects Node with zero config. Default Node is 22 if unspecified; resolution order is `RAILPACK_NODE_VERSION` env var > `engines.node` > `.nvmrc` > `.node-version` > `mise.toml`/`.tool-versions`. The package manager is detected from the `packageManager` field or lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock`).

**Fix the start command.** Railpack picks the `package.json` `start` script first, and the NestJS starter's `start` runs `nest start` -- a dev-mode trap. Either override the start command in the service **Settings** to `node dist/main.js`, or change the script so detection picks the right thing:

```json
{
  "scripts": {
    "start": "node dist/main"
  }
}
```

### Step B2: Get a Public URL

1. Open the service **Settings** > **Networking** > **Public Networking**
2. Click **Generate Domain** for a free `*.railway.app` domain
3. Confirm the target port shown next to the domain matches the port the app listens on

### Step B3: Or Deploy via the CLI

```bash
npm i -g @railway/cli
railway init
railway add -d postgres   # optional: provision a Postgres database
railway up                # deploys and streams build logs
```

With a database added, inject credentials using reference variables in the service's Variables tab, e.g. `DATABASE_URL=postgresql://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}` -- Railway resolves `${{Postgres.PGDATABASE}}`-style references at deploy time.

---

## Optional: Multi-Stage Dockerfile

Both platforms build from a repo-root `Dockerfile` automatically (Render: select **Docker** as the language; Railway logs `Using detected Dockerfile!` when the file is named exactly `Dockerfile` -- custom paths go in a `RAILWAY_DOCKERFILE_PATH` env var). The current community-consensus pattern for NestJS:

```dockerfile
# syntax=docker/dockerfile:1

# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
# reinstall production deps only for the runtime stage
RUN npm ci --omit=dev

# --- runtime stage ---
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
USER appuser
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

Create `.dockerignore` so local artifacts never leak into the build context:

```
node_modules
dist
.env
```

Build and test:

```bash
docker build -t my-nest-api .
docker run -p 3000:3000 my-nest-api
curl http://localhost:3000/health
```

Notes:

- Use `node:22-slim` instead of `alpine` when you have native dependencies like `bcrypt` or `sharp` -- musl-based alpine breaks some prebuilt binaries.
- Railway's official NestJS guide ships a single-stage `node:lts` Dockerfile ending in `CMD ["npm", "run", "start:prod"]`; the multi-stage version above produces a much smaller image, drops devDependencies, and runs as non-root.
- On Railway, build-time env vars need `ARG` declarations per stage.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (Render injects it, default `10000`; Railway injects it) | `10000` |
| `NODE_ENV` | Environment mode; the Step 4 Swagger toggle keys off it | `production` |
| `APP_NAME` | Example app config read via `ConfigService` | `My API` |
| `DATABASE_URL` | Database connection string (if you add one) | `postgresql://user:pass@host/db` |
| `JWT_SECRET` | Secret for signing tokens (if you add auth) | `long-random-string` |

### Set on Render

1. Go to your service on Render
2. Click the **Environment** tab
3. Add each variable
4. Click **Save Changes** (triggers redeploy)

### Set on Railway

In the dashboard: open the service's **Variables** tab, then **New Variable** (or use the **RAW Editor**, which accepts `.env` or JSON paste). Via CLI:

```bash
railway variable set NODE_ENV=production
railway variable list
```

---

## Custom Domain

### Render

1. Go to your service **Settings** > **Custom Domains** > **+ Add Custom Domain**, enter the domain, **Save**
2. Configure DNS:

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `my-nest-api.onrender.com` |
| A | `@` (apex) | `216.24.57.1` (Render load balancer; or use an ANAME/ALIAS record) |

3. Remove any AAAA records -- Render is IPv4-only for custom domains
4. Click **Verify** after DNS propagates. TLS certificates are auto-created and auto-renewed, with HTTP to HTTPS redirect.

### Railway

1. Service **Settings** > **Networking** > add a custom domain
2. Add **both** the CNAME and TXT records Railway provides at your DNS host -- the TXT record is required for verification

---

## Free Tier Info

| Platform | Free tier | Exact limits |
|----------|-----------|--------------|
| Render | Free web service: $0/mo, 512 MB RAM, 0.1 CPU | 750 free instance hours per workspace per calendar month. Spins down after 15 minutes without inbound traffic; spin-up takes about one minute. Single instance, no persistent disk (ephemeral filesystem), SMTP ports 25/465/587 blocked. The Hobby workspace plan ($0/mo) includes 5 GB outbound bandwidth/month (then $0.15/GB), 500 build pipeline minutes/month (then $5 per 1K mins), up to 25 services, 2 custom domains, and automatic TLS. Paid instances: Starter $7/mo (512 MB, 0.5 CPU), Standard $25/mo (2 GB, 1 CPU), Pro $85/mo (4 GB, 2 CPU). |
| Railway | Free Trial: one-time $5 credit, no credit card | Trial expires after 30 days or when the $5 is spent; the account then reverts to the Free plan with $1 of free credit per month (non-accumulating). Trial limits: 1 GB RAM, shared vCPU, max 5 services per project. GitHub-verified trials get unrestricted outbound network; unverified ones are port-restricted. Paid: Hobby $5/mo with included usage, Pro $20/mo per seat. |

---

## Troubleshooting

### Problem: 502 Bad Gateway (Render) or "Application failed to respond" (Railway)

**Cause:** The app bound to `127.0.0.1`/`localhost`, or ignored the platform's `PORT` env var. Render documents this as "a web service has misconfigured its host and port"; Railway's docs say your server "should bind to the host 0.0.0.0 and listen on the port specified by the PORT environment variable".

**Fix:**

```ts
const port = process.env.PORT ?? 3000;
await app.listen(port, '0.0.0.0');
```

On Railway, also check **Settings** > **Networking**: the target port shown next to the generated domain must match the port the app listens on -- a mismatched target port is one of Railway's three documented causes of this error, alongside wrong host binding and heavy load.

### Problem: Build fails with "sh: 1: nest: not found"

**Cause:** The environment pruned devDependencies before the build script ran `nest build` -- `@nestjs/cli` lives in devDependencies (tracked as nestjs/nest issue #15544).

**Fix:** Any one of:

1. Run the build before pruning (e.g. the Dockerfile above runs `npm ci`, then `npm run build`, then `npm ci --omit=dev`)
2. Move `@nestjs/cli` to `dependencies`
3. Set `NPM_CONFIG_PRODUCTION=false` as a build env var so `npm ci`/`npm install` keeps devDependencies

### Problem: "Cannot find module '/opt/render/project/src/dist/main'"

**Cause:** `tsc` emitted to `dist/src/main.js` instead of `dist/main.js`. This happens when `tsconfig.json` includes files outside `src/` (a stray root-level `.ts` file, seed scripts, etc.), which shifts the inferred `rootDir`.

**Fix:** Correct the tsconfig so only `src/` is compiled (restore `rootDir`/`include`), or point the start command at the actual output:

```bash
node dist/src/main
```

### Problem: "JavaScript heap out of memory" while building on Render's free instance

**Cause:** The TypeScript build exceeds the Free instance's 512 MB RAM.

**Fix:** Prefix the build with a Node heap flag -- but note it only helps within the instance's actual RAM:

```
NODE_OPTIONS=--max-old-space-size=460 npm ci && npm run build
```

`--max-old-space-size=4096` only works on instances that actually have that much memory. On the Free tier, trim the build (remove unused deps, skip source maps) or build in Docker/CI instead; if it still will not fit, a paid instance (Starter $7/mo) is the reliable fix.

### Problem: Fastify app works locally but is unreachable after deploy

**Cause:** By default, Fastify listens only on the localhost `127.0.0.1` interface, so the platform's proxy cannot reach it. The Express adapter binds all interfaces by default, which is why this bites Fastify users specifically.

**Fix:** Pass the host explicitly:

```ts
const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter(),
);
await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
```

### Problem: "The engine node is incompatible with this module" or "SyntaxError: Unexpected token '??='"

**Cause:** The platform's Node version differs from local -- either older than a dependency requires or newer than your code was tested on. NestJS v11 itself requires Node 20+.

**Fix:** Pin the runtime version on the platform:

- **Render:** set a `NODE_VERSION` env var, add a `.node-version` or `.nvmrc` file, or use a bounded `engines` range like `"node": "22.x"` (precedence: `NODE_VERSION` > `.node-version` > `.nvmrc` > engines)
- **Railway:** set `RAILPACK_NODE_VERSION`, or use `engines.node` / `.nvmrc` / `.node-version` (Railpack defaults to Node 22 when nothing is specified)
