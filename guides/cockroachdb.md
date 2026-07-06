# CockroachDB

> Set up a free CockroachDB Basic cluster (serverless, PostgreSQL-compatible distributed SQL), get a connection string, and use it from Node.js and Python.

CockroachDB Cloud is a managed distributed SQL database that speaks the PostgreSQL wire protocol, so standard `pg`, `psycopg`, Prisma, and SQLAlchemy code works with minimal changes. On 2024-09-25 Cockroach Labs renamed its plans: Serverless became **Basic**, Dedicated became **Advanced**, and a new **Standard** plan entered Preview. The free tier survived the rename: every pay-as-you-go organization gets $15 of resource consumption free each month (equivalent to 50 million Request Units and 10 GiB of storage), shared across all Basic clusters in the org. One catch: a payment method must be on file to receive the recurring monthly benefit -- you are only charged for usage above the free $15. New accounts also get a one-time $400 trial credit with no credit card required.

## Prerequisites

- [ ] A [CockroachDB Cloud account](https://cockroachlabs.cloud/) (sign up with GitHub, Google, or email)
- [ ] [Node.js 22+](https://nodejs.org/) (for Node.js usage)
- [ ] [Python 3.12+](https://www.python.org/downloads/) (for Python usage)
- [ ] (Optional) [ccloud CLI](https://www.cockroachlabs.com/docs/cockroachcloud/ccloud-get-started) v0.6.12 for terminal-based cluster management
- [ ] (Optional) [cockroach client](https://www.cockroachlabs.com/docs/stable/install-cockroachdb-mac) v26.2 for a local SQL shell

---

## Step 1: Create a Basic Cluster

1. Log in to the [Cloud Console](https://cockroachlabs.cloud/)
2. On the **Clusters** page, click **Create Cluster**
3. Select the **Basic** plan
4. Choose a cloud provider: **GCP** or **AWS** (Azure is not supported for Basic)
5. Pick a region close to your app's deployment platform. You can add up to 6 regions total via **Add regions**
6. Set capacity:
   - **Start for free** (if eligible) -- runs within the free monthly allotment
   - **Unlimited** -- scale on demand, pay for overage
   - **Set a monthly limit** -- hard cap on spend
7. Name the cluster: 6-20 characters, lowercase letters, numbers, and dashes only. The name is **not editable later**
8. Click **Create cluster**

The cluster provisions quickly with a default database called `defaultdb`. Basic clusters automatically run the latest stable CockroachDB version (v26.2 as of 2026-07-06), so there is nothing to upgrade or patch yourself.

---

## Step 2: Create a SQL User

1. On your cluster's page, click **Connect** (top right)
2. Create a SQL user when prompted -- the console generates a password for you
3. Store the password immediately. It is shown once

Via the ccloud CLI instead:

```bash
ccloud cluster user create my-app-db appuser
# Prompts for a password, creates an admin SQL user
```

---

## Step 3: Get Your Connection String

In the **Connect** dialog, pick a connection method:

- **Command line** -- ready-made `cockroach sql` command
- **General connection string** -- for drivers and ORMs (use this one)
- **Connection parameters** -- host/port/user broken out
- **CockroachDB Client** -- client install instructions

The general connection string looks like this:

```
postgresql://appuser:password@my-app-db-1234.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full
```

Format breakdown:

| Part | Value |
|------|-------|
| Host | `<cluster-name>.cockroachlabs.cloud` |
| Port | `26257` |
| Database | `defaultdb` (or one you create) |
| SSL | `sslmode=verify-full` (required) |

> **Important:** Special characters in passwords must be URL-encoded. `password!` becomes `password%21`. If your driver rejects the string, encode the password first.

The cluster's CA certificate is signed by Let's Encrypt, which most systems already trust -- connections usually work with no certificate download. If your system does not trust it, the Connect dialog provides an OS-specific download command that places the cert in the default PostgreSQL certificate directory.

For JDBC (Java), the format is:

```
jdbc:postgresql://{host}:{port}/{database}?password={password}&sslmode=verify-full&user={username}
```

---

## Alternative: ccloud CLI

The `ccloud` CLI manages clusters entirely from the terminal.

### Install

```bash
# macOS
brew install cockroachdb/tap/ccloud

# Linux
curl https://binaries.cockroachdb.com/ccloud/ccloud_linux-amd64_0.6.12.tar.gz | tar -xz
cp -i ccloud /usr/local/bin/

# Windows: download and extract, then add to PATH
# https://binaries.cockroachdb.com/ccloud/ccloud_windows-amd64_0.6.12.zip
```

### Authenticate and Create

```bash
# Opens a browser to log in
ccloud auth login

# On a headless server (no browser):
ccloud auth login --no-redirect

# Fastest path: interactive walkthrough of login + cluster creation + connection
ccloud quickstart
```

Or run the steps individually:

```bash
# Create a Basic cluster (defaults: GCP, closest region, auto-generated name)
ccloud cluster create basic

# Create a Standard cluster instead (Preview plan, uses trial credits)
ccloud cluster create standard

# Create an admin SQL user (prompts for password)
ccloud cluster user create my-app-db appuser

# Open a SQL shell to the cluster
ccloud cluster sql my-app-db
```

---

## Step 4: Create Tables

From the SQL shell (`ccloud cluster sql my-app-db` or the console's SQL editor):

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name STRING NOT NULL,
    email STRING UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title STRING NOT NULL,
    body STRING,
    user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);
```

> **Tip:** Use `UUID` primary keys with `gen_random_uuid()`, not `SERIAL`. Sequential IDs concentrate writes on one node in a distributed database; random UUIDs spread the load. `STRING` is CockroachDB's alias for `TEXT` -- both work.

---

## Use in Node.js

CockroachDB has full support for the `pg` driver, plus Prisma, Sequelize, and TypeORM. Cockroach Labs ships a dedicated Sequelize adapter with client-side transaction retry handling built in.

### Install

```bash
npm install pg
```

### Connect with pg

```js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // includes sslmode=verify-full
});

// Create
await pool.query(
  'INSERT INTO users (name, email) VALUES ($1, $2)',
  ['Sagar', 'sagar@example.com']
);

// Read
const { rows } = await pool.query('SELECT * FROM users');
console.log(rows);

// Update
await pool.query(
  'UPDATE users SET name = $1 WHERE email = $2',
  ['Sagar Gupta', 'sagar@example.com']
);

// Delete
await pool.query('DELETE FROM users WHERE email = $1', ['sagar@example.com']);

await pool.end();
```

### With Express.js

```js
import express from 'express';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const app = express();
app.use(express.json());

app.get('/api/users', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
    [name, email]
  );
  res.status(201).json(rows[0]);
});

app.listen(process.env.PORT || 3000);
```

> **Note:** Use a persistent `Pool`, not one-off `Client` connections. Persistent pools also mitigate transient "connection refused" errors on serverless clusters.

---

## Use in Python

CockroachDB has full support for `psycopg3` and `psycopg2`, plus SQLAlchemy and Django. The official SQLAlchemy and Django adapters include client-side transaction retry handling.

### Install

```bash
pip install "psycopg[binary]"
```

### Connect with psycopg 3

```python
import os
import psycopg

DATABASE_URL = os.environ["DATABASE_URL"]

with psycopg.connect(DATABASE_URL) as conn:
    with conn.cursor() as cur:
        # Create
        cur.execute(
            "INSERT INTO users (name, email) VALUES (%s, %s)",
            ("Sagar", "sagar@example.com"),
        )

        # Read
        cur.execute("SELECT id, name, email FROM users")
        for row in cur.fetchall():
            print(row)

        # Update
        cur.execute(
            "UPDATE users SET name = %s WHERE email = %s",
            ("Sagar Gupta", "sagar@example.com"),
        )

        # Delete
        cur.execute("DELETE FROM users WHERE email = %s", ("sagar@example.com",))

    conn.commit()
```

### With SQLAlchemy (official adapter)

The `sqlalchemy-cockroachdb` adapter adds CockroachDB-specific behavior, including automatic retries for transaction contention errors:

```bash
pip install sqlalchemy sqlalchemy-cockroachdb "psycopg[binary]"
```

```python
import os
from sqlalchemy import create_engine, text

# Swap the scheme so SQLAlchemy uses the CockroachDB dialect with psycopg 3
DATABASE_URL = os.environ["DATABASE_URL"].replace(
    "postgresql://", "cockroachdb+psycopg://", 1
)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    result = conn.execute(text("SELECT now()"))
    print(result.fetchone())
```

### ORM Support at a Glance

| Tool | Support | Retry handling included |
|------|---------|-------------------------|
| pg (Node.js) | Full | No (add your own) |
| pgx (Go) | Full | No (add your own) |
| psycopg3 / psycopg2 | Full | No (add your own) |
| JDBC | Full | No (add your own) |
| Prisma | Full | No (add your own) |
| TypeORM | Full | No (add your own) |
| Sequelize | Full | Yes (official adapter) |
| SQLAlchemy | Full | Yes (official adapter) |
| Django | Full | Yes (official adapter) |
| GORM | Full | Yes (official adapter) |

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Full connection string from the Connect dialog | `postgresql://appuser:pass@my-app-db-1234.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full` |

Set it locally:

```bash
export DATABASE_URL="postgresql://appuser:password@my-app-db-1234.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full"
```

Set it on your deployment platform:

- **Render:** Service > Environment tab > Add `DATABASE_URL`
- **Vercel:** Project Settings > Environment Variables > Add `DATABASE_URL`
- **Railway:** Service > Variables tab > New Variable
- **Local:** Create a `.env` file and add `.env` to `.gitignore`

```bash
# .env
DATABASE_URL=postgresql://appuser:password@my-app-db-1234.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full
```

---

## Free Tier Info

Short answer to "is there still a free tier": **yes**. The old Serverless free tier (10 GiB + 50M RUs) survived the 2024 rename as the Basic plan's monthly free benefit.

| Feature | Basic free allotment |
|---------|----------------------|
| **Monthly free credit** | $15 per organization per month |
| **Storage included** | 10 GiB |
| **Request Units included** | 50 million RUs |
| **Overage: RUs** | $0.20 per 1 million RUs |
| **Overage: storage** | $0.50 per GiB per month |
| **Burst capacity** | Up to 30K RU/sec (~60 vCPUs) |
| **SLA** | 99.99% |
| **Cloud providers** | GCP or AWS (no Azure on Basic) |
| **Regions** | Up to 6 per cluster |
| **IP allowlist rules** | Max 50 |
| **Trial credits** | $400 org-wide, no credit card required |

### Current plans (as of 2026-07-06)

| Plan | Pricing | Notes |
|------|---------|-------|
| **Basic** | Starts at $0/month | Bursty workloads, up to 30K RU/sec (~60 vCPUs), 99.99% SLA. Formerly "Serverless" |
| **Standard** | 2 vCPUs start at $0.18/hr | Preview. Provisioned compute, up to 200 vCPUs |
| **Advanced** | 4 vCPUs start at $0.60/hr | Up to 99.999% multi-region SLA. Formerly "Dedicated" |

### Key things to know

- **The $400 trial needs no card. The recurring $15/month free benefit does.** Trial credits apply to the first $400 in costs for all clusters in your org, regardless of plan. After the trial, the monthly $15 benefit (50M RUs + 10 GiB) kicks in only once a payment method is added -- and you are charged only for usage above it.
- **Orgs on annual or multi-year contracts are NOT eligible** for the monthly free benefit. Pay-as-you-go only.
- **Trial expiry is unforgiving.** If the $400 runs out (or expires) with no payment method on file, a 30-day grace period starts with throttled clusters. After that, all clusters are **deleted permanently**. Add a card before the trial ends if you have data you care about.
- **Request Units are an abstracted compute + I/O metric.** Typical SELECTs cost 1-15 RUs; INSERTs and UPDATEs cost 10-25 RUs. 50 million RUs go a long way for a hobby app. Cockroach Labs recommends setting resource limits ~30% above expected usage.
- **Hitting limits has two distinct failure modes.** Storage limit reached: cluster shows **THROTTLED** and refuses writes until you delete data or raise the limit. RU limit reached: cluster shows **DISABLED** until you raise the limit or the next billing cycle begins. Reads keep working while THROTTLED; nothing works while DISABLED.
- **No version management.** Basic clusters always run the latest stable CockroachDB (v26.2, GA 2026-04-27). A new major version ships quarterly.
- **Multi-region on the free plan is real.** A Basic cluster with two regions survives zone failures; three regions survive a full regional outage. Extra regions consume RUs and storage faster, though.
- **Check your network defaults.** Standard clusters are created with a `0.0.0.0/0` allowlist entry (open to all traffic). Replace it with your own IP ranges in the Cloud Console under Networking. Basic and Standard support at most 50 allowlist rules.

---

## Custom Domain

CockroachDB Cloud does not support custom domains for database connections. Use the provided `<cluster-name>.cockroachlabs.cloud` host from the Connect dialog.

---

## Troubleshooting

### Problem: `Error: x509: certificate signed by unknown authority`

**Cause:** The client cannot verify the cluster's CA certificate. Common when a machine's trust store is stripped down, or when mixing Basic/Standard connections with self-hosted certificate setups.

**Fix:**

1. Download the cluster CA certificate -- the Connect dialog gives an OS-specific command that drops it into the default PostgreSQL certificate directory. Copy the exact command from the dialog; it follows this pattern:

```bash
curl --create-dirs -o "$HOME/.postgresql/root.crt" \
  'https://cockroachlabs.cloud/clusters/<cluster-id>/cert'
```

2. Point `sslrootcert` at it in the connection string:

```
postgresql://appuser:password@my-app-db-1234.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full&sslrootcert=$HOME/.postgresql/root.crt
```

3. For workload and benchmarking tools, switching to `sslmode=require` instead of `sslmode=verify-full` also resolves it (weaker verification -- fine for testing, not production).

### Problem: `dial tcp 35.196.33.161:26257: i/o timeout`

**Cause:** Your network is not authorized to reach the cluster -- missing IP allowlist entry, no internet access, or a firewall blocking port 26257.

**Fix:**

1. In the Cloud Console, go to your cluster > **Networking** and add your IP to the allowlist
2. Confirm outbound traffic on port 26257 is allowed by your firewall (corporate networks often block non-standard ports)
3. Increase your application's connection timeout values -- cross-region round trips can exceed aggressive defaults

### Problem: `FATAL: CodeParamsRoutingFailed: rejected by BackendConfigFromParams: Invalid cluster name`

**Cause:** The routing prefix (cluster name) in the connection string is wrong, so the shared serverless gateway cannot route your connection to a cluster.

**Fix:** Verify the cluster name and database name under **Cluster Overview** > **Connect** in the Cloud Console, and paste the connection string fresh from the dialog rather than hand-assembling it.

### Problem: `dial tcp: lookup gcp-us-east4.crdb.io: no such host`

**Cause:** DNS lookup failed because the hostname in the connection string is wrong (typo, stale host from an old cluster, or a copy-paste from a different environment).

**Fix:**

1. Verify the host in the Cloud Console under **Connect** > **Connection parameters**
2. If you see intermittent `connection refused` errors alongside DNS issues, switch to a persistent connection pool instead of opening a new connection per query

### Problem: `restart transaction` errors (SQLSTATE 40001)

**Cause:** Transaction contention. CockroachDB aborts one of two conflicting transactions and asks the client to retry -- this is normal distributed-database behavior under concurrent writes, not a bug.

**Fix:**

1. Implement client-side retry handling. Minimal Node.js pattern:

```js
async function withRetry(fn, maxRetries = 3) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (err.code !== '40001' || i === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 2 ** i * 100)); // backoff
    }
  }
}

await withRetry(() => pool.query('UPDATE users SET name = $1 WHERE id = $2', [name, id]));
```

2. Or use an official adapter that retries for you: the Sequelize, SQLAlchemy, Django, and GORM adapters all ship with built-in retry handling
3. Reduce contention: keep transactions short, avoid hot rows, batch writes where possible

### Problem: `cannot load certificates. Check your certificate settings, set --certs-dir, or use --insecure`

**Cause:** An outdated `cockroach` client binary that cannot connect to Cloud clusters without explicit CA certificate paths.

**Fix:** Upgrade the client to v21.2.5 or later (current is v26.2), which connects to Cloud clusters without specifying certificate paths:

```bash
# macOS
brew update && brew upgrade cockroach

# Verify
cockroach version
```
