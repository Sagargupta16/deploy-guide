# Turso

> Set up a free SQLite-compatible edge database with Turso Cloud, connect from Node.js and Python, and sync a local replica.

Turso Cloud is a managed SQLite platform (built on libSQL, the company's SQLite fork) that gives you cheap, fast databases you can create by the hundred -- one per user or per tenant is a normal pattern here. No acquisition, no pivot: Turso Cloud is still the product name. The company did rewrite SQLite from scratch in Rust (the engine is also called Turso, still pre-1.0 at v0.7.0-pre.13 as of 2026-06-25), and a next-generation Turso Cloud running that engine has been in private beta since 2026-04-08. Existing SQLite/libSQL databases keep running exactly as they do today and will never be moved to the new engine without user action.

## Prerequisites

- [ ] A [Turso account](https://turso.tech/) (created via CLI in Step 2, GitHub sign-in supported)
- [ ] [Node.js](https://nodejs.org/) (a current LTS release, for Node.js usage)
- [ ] [Python](https://www.python.org/downloads/) (a current release, for Python usage)
- [ ] On Windows: [WSL](https://learn.microsoft.com/en-us/windows/wsl/install) -- the Turso CLI has no native Windows build

---

## Step 1: Install the Turso CLI

Latest CLI release is v1.0.29 (2026-06-18).

**macOS (Homebrew):**

```bash
brew install tursodatabase/tap/turso
```

**macOS / Linux (install script):**

```bash
curl -sSfL https://get.tur.so/install.sh | bash
```

**Windows (WSL required -- the install script fails in PowerShell):**

```bash
wsl --install
# restart, then inside WSL:
curl -sSfL https://get.tur.so/install.sh | bash
```

Verify:

```bash
turso --version
```

---

## Step 2: Sign Up and Log In

```bash
# New account -- opens the browser to complete signup
turso auth signup

# Existing account
turso auth login
```

---

## Step 3: Create a Database

```bash
turso db create my-db
```

Inspect it:

```bash
# Prints name, ID, libSQL server version, group, size, and location
turso db show my-db
```

Open an interactive SQL shell and create a table:

```bash
turso db shell my-db
```

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL
);
.quit
```

### Seeding options

`turso db create` can start from existing data instead of empty:

```bash
# Import a local SQLite file (2 GB max)
turso db create my-db --from-file ./local.db

# Copy another Turso database
turso db create my-db-copy --from-db my-db

# Point-in-time restore (RFC3339 timestamp, requires --from-db)
turso db create my-db-restored --from-db my-db --timestamp 2026-07-01T00:00:00Z

# Import a CSV into a named table
turso db create my-db --from-csv data.csv --csv-table-name users
```

Other useful flags: `--from-dump`, `--from-dump-url`, `--group`, `--size-limit` (bytes, units accepted), `--enable-extensions` (experimental), `-w/--wait`.

---

## Step 4: Get the URL and an Auth Token

Your app needs two values: the database URL and an auth token.

```bash
# libSQL connection URL (libsql://<database>-<org>.turso.io)
turso db show my-db --url

# HTTP URL variant, if you need it
turso db show my-db --http-url

# Full-access token with the default expiration
turso db tokens create my-db

# Read-only token that expires in 7 days
turso db tokens create my-db --read-only --expiration 7d

# Token that never expires (fine for hobby projects, rotate for anything serious)
turso db tokens create my-db --expiration never
```

Put both in a `.env` file (and add `.env` to `.gitignore`):

```bash
# .env
TURSO_DATABASE_URL=libsql://my-db-yourorg.turso.io
TURSO_AUTH_TOKEN=eyJhbGciOiJFZERTQSIs...
```

---

## Use in Node.js

Two official packages. Pick based on where your code runs:

- **`@tursodatabase/serverless`** (1.2.3 as of 2026-07-06) -- the current quickstart recommendation for remote databases. Fetch-based, zero native dependencies, works on Cloudflare Workers, Vercel Edge, and Deno Deploy.
- **`@libsql/client`** (0.17.4) -- the classic client. Production-ready, supports Drizzle and Prisma, and is what you want for ORM integration, embedded replicas, or existing codebases. Ships web/edge builds automatically via conditional exports.

There is also `@tursodatabase/database` (0.6.1) for local/embedded use in Node.js, Electron, mobile, and IoT.

### Option A: @tursodatabase/serverless

```bash
npm install @tursodatabase/serverless
```

```js
import { connect } from "@tursodatabase/serverless";

const conn = connect({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const stmt = await conn.prepare("SELECT * FROM users");
const rows = await stmt.all();
console.log(rows);
```

### Option B: @libsql/client

```bash
npm install @libsql/client
```

```js
import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create
await client.execute({
  sql: "INSERT INTO users (name, email) VALUES (?, ?)",
  args: ["Sagar", "sagar@example.com"],
});

// Read
const result = await client.execute("SELECT * FROM users");
console.log(result.rows);
```

---

## Use in Python

The primary package is now `pyturso` (0.6.1 on PyPI) -- a sqlite3-style API for local and synced databases:

```bash
uv add pyturso
# or: pip install pyturso
```

```python
import turso

db = turso.connect("app.db")
cur = db.cursor()
cur.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT)")
cur.execute("INSERT INTO users (name) VALUES (?)", ("Sagar",))
db.commit()

rows = cur.execute("SELECT * FROM users").fetchall()
print(rows)
```

For a local database that syncs with Turso Cloud, use `turso.sync.connect()` with explicit `push()`/`pull()` -- the docs recommend this for new projects:

```python
import os
import turso

db = turso.sync.connect(
    "local.db",
    url=os.environ["TURSO_DATABASE_URL"],
    auth_token=os.environ["TURSO_AUTH_TOKEN"],
)

db.pull()   # fetch remote changes
# ... local reads and writes ...
db.push()   # send local changes to Turso Cloud
```

For direct remote access over HTTP (no local file) and embedded replicas, the `libsql` package is fully supported in production:

```bash
pip install libsql
```

```python
import os
import libsql

conn = libsql.connect(
    os.environ["TURSO_DATABASE_URL"],
    auth_token=os.environ["TURSO_AUTH_TOKEN"],
)
print(conn.execute("SELECT * FROM users").fetchall())
```

---

## Drizzle ORM Integration

```bash
npm i drizzle-orm @libsql/client dotenv
npm i -D drizzle-kit
```

Define a schema in `src/db/schema.ts` using `sqliteTable`:

```ts
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});
```

Create `drizzle.config.ts` with the `turso` dialect:

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "turso",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
```

Initialize the client in `src/db/index.ts`:

```ts
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
```

Generate and apply migrations:

```bash
npx drizzle-kit generate   # write SQL migrations from the schema
npx drizzle-kit migrate    # apply them to the database
npx drizzle-kit studio     # browse data in a local UI
```

```ts
// Query with Drizzle
import { db } from "./db";
import { users } from "./db/schema";

await db.insert(users).values({ name: "Sagar", email: "sagar@example.com" });
const all = await db.select().from(users);
```

---

## Embedded Replicas

Embedded replicas keep a local SQLite file next to your app: reads are always served locally (microsecond latency), writes are forwarded to the remote primary and then applied locally. The writing replica gets read-your-writes without calling `sync()`. Supported SDKs: TypeScript/JS, Go, Rust, PHP, Laravel.

```js
import { createClient } from "@libsql/client";

const client = createClient({
  url: "file:path/to/db-file.db",                          // local file for reads
  syncUrl: "libsql://[databaseName]-[organizationSlug].turso.io", // remote primary
  authToken: process.env.TURSO_AUTH_TOKEN,
  syncInterval: 60,                                        // auto-sync every 60 s
});

// Or sync manually instead of on an interval
await client.sync();
```

Two constraints to respect:

- Embedded replicas need a persistent disk. They work on Fly, Railway, Render, Koyeb, and Akamai (official guides exist), but NOT in Vercel or Lambda functions -- see Troubleshooting.
- Write transactions that contain reads are routed to the remote primary, not executed locally.

> **Newer alternative:** Turso Sync (announced 2026-04-24) offers local-first writes with explicit `push()`/`pull()` and uses much less bandwidth than embedded replicas. The docs now recommend it over embedded replicas for new projects -- see `/sync/usage` in the Turso docs. The Python example above already uses it.

---

## Local Development

`turso dev` starts a local libSQL server with extension support:

```bash
# Ephemeral -- data is lost when the server stops
turso dev

# Persisted to a file
turso dev --db-file local.db
```

Or skip the server entirely and point your client at a plain file URL:

```js
const client = createClient({ url: "file:local.db" });
```

Seed local from production:

```bash
turso db shell your-database .dump > dump.sql
cat dump.sql | sqlite3 local.db
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TURSO_DATABASE_URL` | libSQL URL from `turso db show my-db --url` | `libsql://my-db-yourorg.turso.io` |
| `TURSO_AUTH_TOKEN` | Token from `turso db tokens create my-db` | `eyJhbGciOiJFZERTQSIs...` |

Set them on your deployment platform:

- **Vercel:** Project Settings > Environment Variables
- **Render:** Service > Environment tab
- **Local:** `.env` file (in `.gitignore`), loaded with `dotenv` or `node --env-file=.env`

```bash
# Regenerate the token anytime -- old tokens keep working until they expire
turso db tokens create my-db --expiration 7d
```

---

## Custom Domain

Turso does not support custom domains for database connections. Connect via the provided `libsql://<database>-<org>.turso.io` URL.

---

## Free Tier Info

| Feature | Free ($0/month) |
|---------|-----------------|
| **Databases** | 100 |
| **Storage** | 5 GB |
| **Rows read** | 500M/month |
| **Rows written** | 10M/month |
| **Syncs** | 3 GB/month |
| **Point-in-time restore** | 1 day |
| **Branching + restores** | No additional charge (true on every plan) |

Paid tiers:

| Plan | Price | Storage | Rows read | Rows written | Syncs | Restore | Extras |
|------|-------|---------|-----------|--------------|-------|---------|--------|
| **Developer** | $4.99/mo | 9 GB | 2.5B | 25M | 10 GB | 10 days | Unlimited databases |
| **Scaler** | $24.92/mo | 24 GB | 100B | 100M | - | 30 days | Teams |
| **Pro** | $416.58/mo | 50 GB | 250B | 250M | 100 GB | 90 days | SSO, BYOK, HIPAA, SOC2 |

Key details:

- Since 2026-05-03, all paid plans include unlimited databases active at any time (billing previously scaled with databases receiving at least one query per cycle).
- Listed overage rates: +$0.75/GB storage, +$1 per billion rows read, +$1 per million rows written, +$0.35/GB syncs. On quota-limited plans, queries that exceed limits fail with a `BLOCKED` error instead of silently billing overage -- see Troubleshooting.
- Database branching and point-in-time restores are free on every plan, so branch-per-PR workflows cost nothing extra.
- Manage your plan from the CLI:

```bash
turso plan show      # current plan and usage
turso plan select    # switch plans
turso plan upgrade   # upgrade
turso org billing    # open billing
```

---

## Troubleshooting

### Problem: Queries fail with a BLOCKED error

**Cause:** You exceeded a plan quota (rows read, rows written, or storage) on a quota-limited plan. Turso rejects the query outright -- there is no silent overage billing.

**Fix:**

```bash
# Check where you stand
turso plan show

# Upgrade, or wait for the billing cycle to reset
turso plan upgrade
```

### Problem: Rows-read usage is way higher than the rows you actually return

**Cause:** "Rows read" counts row SCANS, not returned rows. Aggregates (`COUNT`, `AVG`, `MIN`, `MAX`, `SUM`) scan every considered row, unindexed queries trigger full table scans, and even rolled-back transactions bill their rows written.

**Fix:** Add indexes so queries avoid full scans:

```sql
CREATE INDEX idx_users_email ON users (email);
```

Also note: `VACUUM` is currently disabled in Turso, and storage is measured in 4 KB pages via `dbstat`.

### Problem: HTTP 401, 402, or 409 from the API

**Cause:** 401 means an invalid or expired auth token. 402 Payment Required means no active subscription. 409 Conflict means the resource (e.g., a database name) already exists.

**Fix:**

```bash
# 401: mint a fresh token and update your env var
turso db tokens create my-db

# 409: pick a different database name
turso db create my-db-2
```

### Problem: Embedded replica fails on Vercel or AWS Lambda

**Cause:** Embedded replicas need a persistent filesystem to store the local database file. Serverless function platforms do not provide one.

**Fix:** Use a remote-only connection (`@tursodatabase/serverless` or `@libsql/client` with just `url` + `authToken`) on serverless platforms. Run embedded replicas on hosts with a real disk -- Fly, Railway, Render, Koyeb, and Akamai have official guides. And never open the local replica file with another connection while it is syncing; that risks corruption.

### Problem: Migration tool fails writing PRAGMA user_version

**Cause:** On Turso Cloud, `PRAGMA user_version` and `application_id` are read-only, and `busy_timeout` and `journal_mode` are not supported (concurrency and journaling are managed server-side). Migration tools that track state via `PRAGMA user_version` fail to write it.

**Fix:** Track schema state in a table instead:

```sql
CREATE TABLE IF NOT EXISTS _schema_version (version INTEGER NOT NULL);
```

Or use a migration tool that already does this (drizzle-kit tracks migrations in its own table).

### Problem: CLI install script fails on Windows PowerShell

**Cause:** The turso CLI has no native Windows build -- no Scoop, no winget, no .exe.

**Fix:**

```powershell
wsl --install
```

Then restart, enter `wsl`, and run the install script inside WSL:

```bash
curl -sSfL https://get.tur.so/install.sh | bash
```
