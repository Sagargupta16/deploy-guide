# Neon

> Set up a free serverless PostgreSQL database with Neon, get a connection string, and use it in Python and Node.js.

Neon (acquired by Databricks in 2025, still runs as its own product) is a serverless PostgreSQL provider that separates storage and compute, giving you features like branching, autoscaling, and a generous free tier. The free plan includes 0.5 GB of storage and 100 CU-hours of compute per project per month, across up to 100 projects.

## Prerequisites

- [ ] A [Neon account](https://neon.com/) (sign up with GitHub for easiest setup)
- [ ] [Python 3.12+](https://www.python.org/downloads/) (for Python usage)
- [ ] [Node.js 22+](https://nodejs.org/) (for Node.js usage)

---

## Step 1: Create a Project

1. Log in to [console.neon.tech](https://console.neon.tech/)
2. Click **New Project**
3. Configure:
   - **Project name:** `my-project`
   - **Postgres version:** 18 (default for new projects; 14-18 supported)
   - **Region:** Select the one closest to your deployment platform (e.g., `US East` for Render/Vercel)
4. Click **Create Project**

The project is created instantly with a default database called `neondb` and a root branch called `production` (projects created via the API or CLI get a root branch named `main` instead).

---

## Step 2: Get Your Connection String

After creating the project, Neon immediately shows your connection details. Copy the connection string.

It looks like this:

```
postgresql://username:password@ep-xxxxx-xxxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

You can also find it anytime:

1. Go to your project dashboard
2. Click the **Connect** button
3. In the "Connect to your database" modal, select your branch, database, and role
4. Copy the connection string (pooled by default -- note the `-pooler` in the host; toggle for a direct connection)

> **Important:** Neon requires `sslmode=require`. Always include it in your connection string. The console also appends `channel_binding=require` -- fine for direct connections, but remove it when connecting through the `-pooler` host (PgBouncer does not support channel binding).

---

## Step 3: Create Tables

You can create tables using the **SQL Editor** in the Neon console, or from your application code.

### Via SQL Editor

1. Go to **SQL Editor** in the left sidebar
2. Run your SQL:

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE posts (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    body TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);
```

> **Tip:** In production, run schema migrations (Alembic, Prisma, drizzle-kit) from a CI job on push to `main` -- with the Neon URL in a repo secret -- instead of at app startup. This keeps serverless deploys migration-free and gives you a manual re-run button via `workflow_dispatch`.

---

## Use in Python (SQLAlchemy)

### Install Dependencies

```bash
pip install sqlalchemy "psycopg[binary]" python-dotenv
```

### Connect with SQLAlchemy

```python
import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

# SQLAlchemy defaults postgresql:// to psycopg2 -- point it at psycopg v3
DATABASE_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create tables
Base.metadata.create_all(bind=engine)

# Use it
session = SessionLocal()

# Create
new_user = User(name="Sagar", email="sagar@example.com")
session.add(new_user)
session.commit()

# Read
users = session.query(User).all()
for user in users:
    print(f"{user.id}: {user.name} ({user.email})")

# Update
user = session.query(User).filter_by(name="Sagar").first()
user.name = "Sagar Gupta"
session.commit()

# Delete
session.delete(user)
session.commit()

session.close()
```

### With FastAPI

```python
import os
from fastapi import FastAPI, Depends
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker, Session

DATABASE_URL = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, nullable=False)

Base.metadata.create_all(bind=engine)

app = FastAPI()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/api/users")
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()

@app.post("/api/users")
def create_user(name: str, email: str, db: Session = Depends(get_db)):
    user = User(name=name, email=email)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
```

---

## Use in Node.js

### Install Dependencies

```bash
npm install pg
```

### Connect with pg

```js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
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
  ssl: { rejectUnauthorized: false },
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

### With Prisma ORM

```bash
npm install prisma @prisma/client
npx prisma init
```

Update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  createdAt DateTime @default(now())
}
```

> Prisma 7 deprecated the old `prisma-client-js` provider and requires the `output` field -- the client is generated into your project, not `node_modules`, and you import `PrismaClient` from that generated path.

```bash
npx prisma db push    # Sync schema to database
npx prisma generate   # Generate client
```

```js
import { PrismaClient } from './generated/prisma/client';

const prisma = new PrismaClient();

// Create
await prisma.user.create({ data: { name: 'Sagar', email: 'sagar@example.com' } });

// Read
const users = await prisma.user.findMany();

// Update
await prisma.user.update({
  where: { email: 'sagar@example.com' },
  data: { name: 'Sagar Gupta' },
});

// Delete
await prisma.user.delete({ where: { email: 'sagar@example.com' } });
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Neon connection string | `postgresql://user:pass@ep-xxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require` |

Set this on your deployment platform:

- **Render:** Service > Environment tab > Add `DATABASE_URL`
- **Vercel:** Project Settings > Environment Variables > Add `DATABASE_URL`
- **Local:** Create a `.env` file (add `.env` to `.gitignore`). Note: unlike Next.js, CLI tools like drizzle-kit and standalone scripts do not auto-load `.env.local` -- load it explicitly (`dotenv` in the config, or `tsx --env-file=.env.local`)

```bash
# .env
DATABASE_URL=postgresql://myuser:mypassword@ep-xxxxx-xxxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
```

---

## Free Tier Info

| Feature | Free Tier |
|---------|-----------|
| **Storage** | 0.5 GB per project |
| **Compute** | 100 CU-hours/month per project |
| **Branches** | 10 per project |
| **Projects** | 100 |
| **Autoscaling** | Up to 2 CU |
| **History retention** | 6 hours (capped at 1 GB-month) |

Key details:
- Compute suspends after 5 minutes of inactivity (fixed on the free plan; automatic cold start on next query)
- Cold start takes a few hundred milliseconds
- 100 CU-hours run a 0.25 CU compute for ~400 hours/month -- plenty for hobby projects with intermittent traffic
- Branching is a killer feature -- create instant copies of your database for testing
- Paid plans are pay-as-you-go with no monthly minimum: Launch bills $0.106/CU-hour compute + $0.35/GB-month storage; Scale bills $0.222/CU-hour

---

## Custom Domain

Neon does not support custom domains for database connections. Use the provided `ep-xxxxx.neon.tech` connection string.

---

## Troubleshooting

### Problem: "SSL connection is required"

**Cause:** Neon requires SSL for all connections.

**Fix:**

```python
# Python SQLAlchemy -- append sslmode to URL
DATABASE_URL = "postgresql://...?sslmode=require"
engine = create_engine(DATABASE_URL)
```

```js
// Node.js pg -- add ssl option
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

### Problem: "Connection terminated unexpectedly"

**Cause:** Compute endpoint suspended due to inactivity and reconnection failed.

**Fix:**

1. Retry the connection -- Neon auto-wakes on the next request
2. Add connection retry logic:

```js
// Node.js pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  connectionTimeoutMillis: 10000,
});
```

```python
# Python SQLAlchemy
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using
    pool_recycle=300,     # Recycle connections every 5 min
)
```

### Problem: "Too many connections" error

**Cause:** Exceeded connection limit (typically happening in serverless environments where each invocation opens a new connection).

**Fix:**

1. Use connection pooling. Neon provides a built-in PgBouncer pooler (transaction mode, up to 10,000 concurrent connections) -- append `-pooler` to the endpoint ID in the hostname, port stays 5432:
   - Direct connection: `ep-xxxxx.us-east-2.aws.neon.tech:5432`
   - Pooled connection: `ep-xxxxx-pooler.us-east-2.aws.neon.tech:5432`
2. In the Neon console, click **Connect** on the project dashboard -- the connection string is pooled by default, with a toggle for a direct connection
3. Use the pooled connection string in serverless environments (Vercel, AWS Lambda), and drop `channel_binding=require` from it (PgBouncer does not support channel binding)
4. For read-mostly serverless workloads (single queries, no transactions), skip TCP pooling entirely: the `@neondatabase/serverless` driver's `neon()` HTTP client is the fastest path for one-shot queries and is safe to export as a module-level singleton -- each warm instance reuses one client

### Problem: Slow first query after inactivity

**Cause:** Compute endpoint was suspended. It reactivates automatically within a few hundred milliseconds of the next query. If the branch has been idle for more than 24 hours, Neon may also archive it, and unarchiving adds a 15-25 s cold start on the next real request.

**Fix:** This is expected on the free tier. Options:
1. Accept cold starts for hobby projects
2. Upgrade to a paid plan and disable suspension
3. Use Neon's connection pooler which handles wake-up more gracefully
4. Keep the branch warm with a scheduled GitHub Actions ping against an unauthenticated health endpoint:

```yaml
# .github/workflows/keepalive.yml
on:
  schedule:
    - cron: "*/30 * * * *"
jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - run: curl --silent --max-time 30 https://<your-backend>/health || echo "ignoring"
```

This costs ~0 Actions minutes and under 1% of the free CU-hours, and the `|| echo` keeps the job green even when the endpoint returns a non-200.
