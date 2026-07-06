# Deploy Ruby on Rails

> Deploy a Rails 8 app to Render and Railway, with the new Rails 8 defaults (Solid Queue, Propshaft, Thruster) and a self-hosting option via Kamal 2.

This guide covers deploying a production-ready Rails 8 application to Render's and Railway's free tiers, including PostgreSQL, `RAILS_MASTER_KEY` handling, the built-in `/up` health check, Solid Queue background jobs on a single database, and Tailwind via tailwindcss-rails. Current Rails is 8.1.3 (released 2026-03-24); Rails 8.x requires Ruby 3.2.0 or newer.

## Prerequisites

- [ ] [mise](https://mise.jdx.dev/) (or rbenv/asdf) to install Ruby 3.4+ (Ruby 3.4.10 is the latest 3.4 patch; Ruby 4.0.5 is the newest stable line)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Render account](https://render.com/) (sign up with GitHub)
- [ ] (For Railway) A [Railway account](https://railway.com/)

---

## Step 1: Install Ruby and Rails

```bash
mise use -g ruby@3      # installs the latest Ruby 3.x (3.4.10)
gem install rails       # installs Rails 8.1.3
rails -v                # Rails 8.1.3
```

---

## Step 2: Create a Rails App

SQLite is the default database for new Rails apps, and Rails 8 production-hardens it (WAL mode, IMMEDIATE transaction defaults). That is great for a VPS, but Render and Railway free tiers have ephemeral filesystems, so create the app on PostgreSQL from the start:

```bash
rails new store --database=postgresql --css tailwind
cd store
```

Plain `rails new store` works too (SQLite); `--css tailwind` wires up Tailwind via the tailwindcss-rails gem.

Rails 8 replaces most of the old external-service stack out of the box:

| Concern | Rails 8 default | Replaces |
|---------|-----------------|----------|
| Background jobs | Solid Queue (DB-backed Active Job backend; runs 20M jobs/day at 37signals) | Sidekiq, Resque |
| Caching | Solid Cache (disk-backed fragment cache) | Redis, Memcached |
| Action Cable pubsub | Solid Cable (DB polling) | Redis |
| Asset pipeline | Propshaft (digest-stamps assets, no transpiling) | Sprockets |
| Deployment | Kamal 2 (Docker deploys to any server) | Capistrano, PaaS |
| Reverse proxy | Thruster (X-Sendfile, asset caching/compression) | Nginx |

There is also a built-in auth scaffold if you need login:

```bash
bin/rails generate authentication   # sessions, users, password reset
```

Set up the database and run it locally:

```bash
bin/rails db:prepare
bin/dev        # Procfile.dev: Rails server + Tailwind watcher
```

Open `http://localhost:3000`. Rails ships a health endpoint at `GET /up` (`Rails::HealthController`, mapped as `rails/health#show`): it returns 200 if the app boots without exceptions and 500 otherwise. It deliberately does not check dependencies like the database or Redis.

### Tailwind on an existing app

```bash
./bin/bundle add tailwindcss-rails
./bin/rails tailwindcss:install
```

Develop with `bin/dev` (the installer generates `Procfile.dev`) or `bin/rails tailwindcss:watch`. The gem now ships Tailwind CSS v4 -- the input file lives at `app/assets/tailwind/application.css`. To stay on v3, pin `gem "tailwindcss-rails", "~> 3.3.1"`. In production no extra build step is needed: `tailwindcss:build` auto-attaches to `assets:precompile`.

---

## Step 3: Get Production-Ready

Rails 8.1 generates sane production defaults, so there is very little to edit. Know what you are shipping:

**`config/environments/production.rb`** (generated, no changes needed):

- Logs to STDOUT, tagged with request IDs, at level `info`
- `config.silence_healthcheck_path = "/up"` keeps health-check noise out of logs
- `config.assume_ssl = true` and `config.force_ssl = true` (commented out only when you skip Kamal at `rails new` time) -- correct behind Render/Railway's SSL-terminating proxies
- `config.public_file_server.enabled` defaults to `true`, so Rails serves `public/` itself. No `RAILS_SERVE_STATIC_FILES` toggle needed on modern Rails.

**`config/puma.rb`** (generated, no changes needed):

- 3 threads per worker via `ENV.fetch("RAILS_MAX_THREADS", 3)`
- Listens on `ENV.fetch("PORT", 3000)` -- platforms that inject `PORT` just work
- Workers via `WEB_CONCURRENCY` (default 1; `"auto"` matches processor count, but that can be inaccurate on cloud hosts with shared CPUs -- set it explicitly)
- `plugin :tmp_restart`, plus a Solid Queue plugin gated on the `SOLID_QUEUE_IN_PUMA` env var for single-server setups

**Assets:** Propshaft digest-stamps everything into `public/assets` (mapping at `public/assets/.manifest.json`) on `assets:precompile`, and serves assets dynamically in development. It does no transpiling by design -- pair it with jsbundling-rails/cssbundling-rails if you need a bundler.

**Credentials:** `config/credentials.yml.enc` is committed; `config/master.key` decrypts it and must never be committed (`rails new` gitignores it). Edit with:

```bash
bin/rails credentials:edit
```

You will paste the contents of `config/master.key` into a `RAILS_MASTER_KEY` env var on the host. The env var takes precedence over the file.

**Lockfile platform:** if you develop on Windows or macOS, the deploy host is Linux. Add the platform to `Gemfile.lock` (no Linux machine needed -- bundler re-resolves and considers the new platform when picking gems):

```bash
bundle lock --add-platform x86_64-linux
```

Commit the updated `Gemfile.lock`.

---

## Step 4: Push to GitHub

`rails new` already initialized a git repo, so just commit and push:

```bash
git add Gemfile Gemfile.lock app bin config db lib public script storage test vendor
git add .dockerignore .gitattributes .gitignore .kamal .rubocop.yml .ruby-version Dockerfile Rakefile config.ru
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/store.git
git push -u origin main
```

Confirm `config/master.key` did NOT get committed (it is gitignored by default).

---

## Step 5: Deploy to Render

### Create the database

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **PostgreSQL**, pick the **Free** plan, same region as your web service
3. After it provisions, copy the **Internal Database URL**

### Add a build script

Render needs one command that installs gems, builds assets, and (on the free tier) migrates. Create `bin/render-build.sh`:

```bash
#!/usr/bin/env bash
set -o errexit

bundle install
bundle exec rails assets:precompile
bundle exec rails db:migrate   # free tier only -- see pre-deploy note below
```

Make it executable and commit:

```bash
chmod +x bin/render-build.sh
git add bin/render-build.sh
git commit -m "Add Render build script"
git push
```

On paid instances, move `bundle exec rails db:migrate` out of the build script and into the service's **pre-deploy command** (Settings page) instead. It runs after build and before deploy, which is the right place for migrations -- but it is not available on the free tier, and it runs on a separate instance with no access to persistent disks.

### Create the web service

1. Click **New** > **Web Service**
2. Connect your GitHub repository
3. Configure:
   - **Name:** `store`
   - **Language:** Ruby
   - **Build Command:** `./bin/render-build.sh`
   - **Start Command:** `bin/rails server`
   - **Instance Type:** Free
4. Under **Advanced**, add environment variables:
   - `DATABASE_URL` = the Internal Database URL from your Render Postgres
   - `RAILS_MASTER_KEY` = the contents of `config/master.key`
   - `WEB_CONCURRENCY` = `2`
5. Still under **Advanced**, set the **Health Check Path** to `/up`
6. Click **Create Web Service**

Your app is live at `https://store.onrender.com`.

### How Render health checks behave

- Without a path set, Render only does a TCP socket check. With `/up` set, any 2xx/3xx response within 5 seconds counts as healthy.
- During deploys, traffic is held until new instances pass health checks; a deploy is cancelled if they do not pass within 15 minutes.
- At runtime, 15 seconds of consecutive failures pauses traffic to the instance; 60 seconds triggers an automatic restart plus a notification.

---

## Step 6: Deploy to Railway

Either connect your GitHub repo in the dashboard, or use the CLI:

```bash
railway init
railway up
```

Then wire it up in the dashboard:

1. **Create** > **Database** > **PostgreSQL** to add Postgres to the project
2. On your app service, open the **Variables** tab and set:
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (a reference to the Postgres service)
   - `RAILS_MASTER_KEY` = the contents of `config/master.key`
   - `RAILS_ENV` = `production`
3. In **Settings** > **Deploy**, set the custom start command:

```bash
bin/rails db:prepare && bin/rails server -b ::
```

`db:prepare` migrates before boot, and `-b ::` binds IPv6, which Railway's private networking requires.

4. In **Settings** > **Networking** > **Public Networking**, click **Generate Domain** for a free `railway.app` URL
5. Set the **healthcheck path** to `/up` in service settings. Railway polls it until it gets HTTP 200 before switching traffic (default timeout 300 s; override with `RAILWAY_HEALTHCHECK_TIMEOUT_SEC`). Services with volumes still incur brief downtime on redeploy.

---

## Step 7: Run Solid Queue on One Database

New Rails 8 apps configure Solid Queue by default -- workers and dispatchers live in `config/queue.yml`, recurring jobs (cron via Fugit) in `config/recurring.yml`. But Rails 8 puts it on a separate `queue:` database in `config/database.yml`, with its schema in `db/queue_schema.rb`, created by `db:prepare`. Free tiers give you exactly one database, so fold the queue tables into your main one:

1. Create a normal migration and copy the contents of `db/queue_schema.rb` into it:

```bash
bin/rails g migration AddSolidQueueTables
# paste the db/queue_schema.rb contents into the change method
```

2. Delete `db/queue_schema.rb`
3. Remove `config.solid_queue.connects_to` from `config/environments/production.rb`
4. Run `bin/rails db:prepare`

Then pick how workers run:

- **Separate process** (needs a paid worker service): `bin/jobs`
- **Inside Puma** (free-tier friendly, single server): set `SOLID_QUEUE_IN_PUMA=1` in the platform's env vars. The generated `puma.rb` conditionally loads the Solid Queue plugin when that var is present.

---

## Alternative: Self-Host with Kamal 2

If you have any VPS (Hetzner, DigitalOcean, EC2), Rails 8 apps deploy to it with zero PaaS. Every `rails new` app ships `config/deploy.yml` and `.kamal/secrets` pre-generated, with `RAILS_MASTER_KEY` already wired through `.kamal/secrets`.

```bash
gem install kamal    # current version 2.12.0
# edit config/deploy.yml: server IP, image name, registry credentials
kamal setup          # first deploy: installs Docker on the server via SSH,
                     # builds/pushes the image, starts kamal-proxy on ports 80/443
kamal deploy         # every deploy after that
```

(`kamal init` scaffolds `config/deploy.yml` for non-Rails or older apps.)

The generated Dockerfile is production-grade already:

- `ruby:$RUBY_VERSION-slim` base, jemalloc LD_PRELOADed to fight memory fragmentation
- Assets precompiled at build time with `SECRET_KEY_BASE_DUMMY=1 ./bin/rails assets:precompile` -- no real secret needed during build
- Runs as non-root user `rails` (UID 1000)
- CMD is `["./bin/thrust", "./bin/rails", "server"]` with `EXPOSE 80` (port 3000 without Thruster)

Thruster wraps Puma (`thrust bin/rails server`) and gives you HTTP/2, X-Sendfile acceleration, compression, asset caching, and automatic Let's Encrypt TLS via the `TLS_DOMAIN` env var -- no Nginx needed. Defaults: `TARGET_PORT` 3000, `HTTP_PORT`/`HTTPS_PORT` 80/443, `CACHE_SIZE` 64 MB.

With Kamal on a single VPS, the SQLite default is fully viable: WAL mode and IMMEDIATE transactions are on by default, and the disk persists.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `RAILS_MASTER_KEY` | Decrypts `config/credentials.yml.enc`; paste the contents of `config/master.key` | `a1b2c3d4...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host/db` |
| `RAILS_ENV` | Rails environment (Railway needs it set explicitly) | `production` |
| `WEB_CONCURRENCY` | Puma worker processes (default 1; `auto` = CPU count, unreliable on shared CPUs) | `2` |
| `RAILS_MAX_THREADS` | Puma threads per worker | `3` (default) |
| `PORT` | Listen port (auto-set by the platform; Render uses 10000) | `3000` |
| `SOLID_QUEUE_IN_PUMA` | Run Solid Queue workers inside the Puma process | `1` |
| `TLS_DOMAIN` | Thruster auto-TLS domain (Kamal/self-host only) | `store.example.com` |

### Set on Render

1. Go to your service > **Environment** tab
2. Add each variable
3. **Save Changes** (triggers redeploy)

### Set on Railway

1. Go to your service > **Variables** tab
2. Add each variable (use `${{Postgres.DATABASE_URL}}` to reference the database service)
3. Deploy the changes

---

## Custom Domain

### Render

1. Service **Settings** > **Custom Domains** > **+ Add Custom Domain**
2. Point a CNAME at your service's `onrender.com` subdomain:

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `store.onrender.com` |

3. Adding a root domain auto-creates the `www` counterpart with redirects
4. Remove any AAAA records -- Render is IPv4
5. Click **Verify** to trigger automatic TLS certificate issuance

### Railway

1. Service **Settings** > **Networking** > **Public Networking** > add custom domain
2. Add the CNAME and TXT records Railway provides at your DNS host
3. SSL is free and auto-renewed

---

## Free Tier Info

| Platform | Free tier | Exact limits |
|----------|-----------|--------------|
| Render (web) | Free web services | 512 MB RAM / 0.1 CPU. Spins down after 15 minutes without inbound traffic, ~1 minute to spin back up. 750 free instance hours per workspace per calendar month (all free services suspended if exceeded). No shell access, no persistent disks, no scaling, cannot send on SMTP ports. |
| Render (Postgres) | 1 free DB per workspace | 256 MB RAM, 1 GB storage, no backups. Expires 30 days after creation with a 14-day grace period before deletion. |
| Railway | $5 one-time trial credit, then Free plan | Trial: no credit card, 30 days, capped at 1 GB RAM / 2 vCPU / 5 services per project. Free plan: $1 of non-rolling credit per month at 0.5 GB RAM / 1 shared vCPU. Hobby: $5/month including $5 of usage; usage billed per second at $10/GB RAM/month and $20/vCPU/month. |

---

## Troubleshooting

### Problem: App crashes at boot with a credentials decryption error

**Cause:** `RAILS_MASTER_KEY` on the host is missing or does not match the key that encrypted `config/credentials.yml.enc`. The env var takes precedence over `config/master.key`, and Render/Railway have no `master.key` file, so a wrong or absent value fails decryption at boot.

**Fix:** Paste the exact contents of local `config/master.key` into the `RAILS_MASTER_KEY` env var and redeploy. Never commit `master.key`. If the key is truly lost, re-create credentials:

```bash
bin/rails credentials:edit
```

### Problem: Bundler fails on deploy because the lockfile has no Linux platform

**Cause:** `Gemfile.lock` was generated on Windows or macOS, so bundler on the Linux build host refuses to resolve gems for `x86_64-linux`.

**Fix:**

```bash
bundle lock --add-platform x86_64-linux
git add Gemfile.lock
git commit -m "Add Linux platform to lockfile"
git push
```

### Problem: 502 Bad Gateway on Render

**Cause:** The service misconfigured its host and port. The default `config/puma.rb` already honors `PORT` (Render injects 10000) and binds correctly, so this usually means a custom start command overrode the port or bound to localhost.

**Fix:** Use plain `bin/rails server` as the start command and let Puma read `PORT`. If you must pass flags, bind to `0.0.0.0`. On Railway, bind IPv6 instead: `bin/rails server -b ::`.

### Problem: `relation "solid_queue_processes" does not exist`

**Cause:** The Solid Queue schema was never loaded. Rails 8 keeps it in a separate `queue:` database (`db/queue_schema.rb`), and on a single-database host it never got created.

**Fix:** Run `bin/rails db:prepare`. If you are on one database, do the single-database conversion from Step 7: copy `db/queue_schema.rb` into a normal migration, delete the schema file, remove `config.solid_queue.connects_to` from the environment config, then run `db:prepare` again.

### Problem: SQLite data disappears after every deploy

**Cause:** Render services have an ephemeral filesystem by default -- any local file changes are lost on every redeploy or restart, and persistent disks are paid-only. Rails 8's production-ready SQLite cannot survive that.

**Fix:** Use the free Render Postgres (or Railway Postgres) and set `DATABASE_URL`. Keep SQLite for Kamal/VPS deploys where the disk persists.

### Problem: Out-of-memory warnings on the 512 MB free instance

**Cause:** Too many Puma workers for the instance size, or Ruby memory fragmentation. `WEB_CONCURRENCY=auto` matches CPU count but can be inaccurate on cloud hosts with shared CPUs.

**Fix:**

1. Set `WEB_CONCURRENCY=1` (or `2`) explicitly; keep the default 3 threads per worker
2. Set `MALLOC_ARENA_MAX=2` if you are not on the default Rails Dockerfile (which already includes jemalloc)
3. YJIT is already enabled by default on Rails 7.2+ with Ruby 3.3+ -- no action needed, but it does use some extra memory by design
