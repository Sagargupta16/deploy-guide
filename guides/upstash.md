# Upstash Redis

> Add serverless Redis to your app for caching, rate limiting, and message queues -- scales to zero with a REST API.

Upstash provides serverless Redis with a unique REST API, making it ideal for edge and serverless environments where persistent TCP connections are not available. Unlike traditional Redis, Upstash charges per request and automatically scales to zero when idle, so you never pay for idle resources.

## Prerequisites

- [ ] An [Upstash account](https://console.upstash.com/) (sign up with GitHub, Google, or email)
- [ ] [Node.js 22+](https://nodejs.org/) (for JavaScript usage)
- [ ] [Python 3.12+](https://www.python.org/downloads/) (for Python usage)

---

## Step 1: Create a Redis Database

1. Log in to [console.upstash.com](https://console.upstash.com/)
2. Click **Create Database**
3. Configure:
   - **Name:** `my-cache`
   - **Primary Region:** Select the one closest to your deployment (e.g., `US-East-1` for Vercel/Render)
   - **Read Regions:** Optional -- add read replicas in regions close to your other traffic
   - **Plan:** Free to start
4. Click **Create**

The database is provisioned instantly. TLS is always enabled -- there is no toggle. (The old Regional database type is deprecated; all new databases use the current region-plus-replicas model.)

---

## Step 2: Get Your Credentials

After creating the database, go to the **Details** tab. You need two values:

| Value | Where to Find | What It Is |
|-------|---------------|------------|
| **REST URL** | Details tab > REST API section | `https://<your-db>.upstash.io` |
| **REST Token** | Details tab > REST API section | Bearer token for REST API authentication |

You will also see the traditional Redis connection URL (`redis://...`) for use with standard Redis clients, but the REST API is recommended for serverless environments.

---

## REST API vs Redis Protocol

Upstash supports two connection methods:

| Method | Best For | Connection Type |
|--------|----------|-----------------|
| **REST API** (`@upstash/redis`) | Serverless, edge functions, Cloudflare Workers | HTTP (stateless) |
| **Redis protocol** (`redis://...`) | Long-running servers, traditional backends | TCP (persistent) |

The REST API works everywhere HTTP works -- no TCP connection needed. This is what makes Upstash uniquely suited for serverless and edge environments where connections cannot persist between invocations.

---

## Use in Node.js

### Install Dependencies

```bash
npm install @upstash/redis
```

### Initialize the Client

```js
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
```

Or use the shorthand that reads from environment variables automatically:

```js
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from process.env
```

### Basic Operations

```js
// String: set and get
await redis.set('user:1:name', 'Alice');
const name = await redis.get('user:1:name');  // 'Alice'

// Set with expiration (TTL in seconds)
await redis.set('session:abc', 'user-data', { ex: 3600 });  // expires in 1 hour

// Increment
await redis.set('page:views', 0);
await redis.incr('page:views');      // 1
await redis.incrby('page:views', 5); // 6

// Check existence and delete
const exists = await redis.exists('user:1:name');  // 1
await redis.del('user:1:name');

// Set TTL on an existing key
await redis.expire('page:views', 300);  // expires in 5 minutes

// Get remaining TTL
const ttl = await redis.ttl('page:views');
```

### Lists

```js
// Push items to a list
await redis.lpush('queue:emails', 'email1@example.com');
await redis.lpush('queue:emails', 'email2@example.com');

// Pop from the other end (FIFO queue)
const next = await redis.rpop('queue:emails');  // 'email1@example.com'

// Get list length
const len = await redis.llen('queue:emails');

// Get all items (0 to -1 means full range)
const all = await redis.lrange('queue:emails', 0, -1);
```

### Hashes

```js
// Store a user as a hash
await redis.hset('user:1', {
  name: 'Alice',
  email: 'alice@example.com',
  role: 'admin',
});

// Get a single field
const email = await redis.hget('user:1', 'email');  // 'alice@example.com'

// Get all fields
const user = await redis.hgetall('user:1');
// { name: 'Alice', email: 'alice@example.com', role: 'admin' }

// Increment a numeric hash field
await redis.hset('user:1', { login_count: 0 });
await redis.hincrby('user:1', 'login_count', 1);
```

### Sets

```js
// Add tags to a post
await redis.sadd('post:1:tags', 'javascript', 'redis', 'serverless');

// Check membership
const isMember = await redis.sismember('post:1:tags', 'redis');  // 1 (true)

// Get all members
const tags = await redis.smembers('post:1:tags');
// ['javascript', 'redis', 'serverless']
```

### With Express.js (Caching Example)

```js
import express from 'express';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();
const app = express();

app.get('/api/posts', async (req, res) => {
  // Check cache first
  const cached = await redis.get('cache:posts');
  if (cached) {
    return res.json({ source: 'cache', data: cached });
  }

  // Fetch from database (or external API)
  const posts = await fetchPostsFromDB();

  // Store in cache for 5 minutes
  await redis.set('cache:posts', JSON.stringify(posts), { ex: 300 });

  res.json({ source: 'db', data: posts });
});

app.listen(process.env.PORT || 3000);
```

---

## Use in Python

### Install Dependencies

```bash
pip install upstash-redis python-dotenv
```

### Initialize the Client

```python
import os
from upstash_redis import Redis

redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)
```

### Basic Operations

```python
# String: set and get
redis.set("user:1:name", "Alice")
name = redis.get("user:1:name")  # "Alice"

# Set with expiration
redis.set("session:abc", "user-data", ex=3600)  # expires in 1 hour

# Increment
redis.set("page:views", 0)
redis.incr("page:views")        # 1
redis.incrby("page:views", 5)   # 6

# Delete
redis.delete("user:1:name")
```

### Hashes and Lists

```python
# Hash
redis.hset("user:1", mapping={
    "name": "Alice",
    "email": "alice@example.com",
    "role": "admin"
})
user = redis.hgetall("user:1")
email = redis.hget("user:1", "email")

# List (queue)
redis.lpush("queue:emails", "email1@example.com")
redis.lpush("queue:emails", "email2@example.com")
next_item = redis.rpop("queue:emails")  # "email1@example.com"
```

### With FastAPI

```python
import os
from fastapi import FastAPI
from upstash_redis import Redis

redis = Redis(
    url=os.environ["UPSTASH_REDIS_REST_URL"],
    token=os.environ["UPSTASH_REDIS_REST_TOKEN"]
)

app = FastAPI()

@app.get("/api/stats")
def get_stats():
    views = redis.get("page:views") or 0
    return {"views": int(views)}

@app.post("/api/track")
def track_view():
    views = redis.incr("page:views")
    return {"views": views}
```

---

## Rate Limiting with @upstash/ratelimit

Upstash provides a purpose-built rate limiting library that uses Redis under the hood.

### Install

```bash
npm install @upstash/ratelimit @upstash/redis
```

### Fixed Window Rate Limiter

```js
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.fixedWindow(10, '60 s'),  // 10 requests per 60 seconds
  analytics: true,
});

// In your API handler
async function handler(req) {
  const ip = req.headers.get('x-forwarded-for') || 'anonymous';
  const { success, limit, remaining, reset } = await ratelimit.limit(ip);

  if (!success) {
    return new Response('Rate limit exceeded', {
      status: 429,
      headers: {
        'X-RateLimit-Limit': limit.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': reset.toString(),
      },
    });
  }

  // Process the request normally
  return new Response('OK');
}
```

### Sliding Window Rate Limiter

```js
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '60 s'),  // Smoother distribution
  analytics: true,
});
```

### Token Bucket Rate Limiter

```js
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.tokenBucket(10, '60 s', 10),  // 10 tokens max, refills 10 per 60s
  analytics: true,
});
```

---

## Caching Patterns

### Cache-Aside (Lazy Loading)

The most common pattern. Check cache first, fetch from source on miss, then populate cache.

```js
async function getUser(userId) {
  const cacheKey = `user:${userId}`;

  // 1. Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // 2. Cache miss -- fetch from database
  const user = await db.query('SELECT * FROM users WHERE id = $1', [userId]);

  // 3. Populate cache with TTL
  await redis.set(cacheKey, JSON.stringify(user), { ex: 600 });  // 10 minutes

  return user;
}
```

### Write-Through

Update the cache whenever the source data changes. Ensures cache is always fresh.

```js
async function updateUser(userId, data) {
  // 1. Update database
  const user = await db.query(
    'UPDATE users SET name = $1 WHERE id = $2 RETURNING *',
    [data.name, userId]
  );

  // 2. Update cache immediately
  await redis.set(`user:${userId}`, JSON.stringify(user), { ex: 600 });

  return user;
}
```

### Cache Invalidation

```js
async function deleteUser(userId) {
  // 1. Delete from database
  await db.query('DELETE FROM users WHERE id = $1', [userId]);

  // 2. Remove from cache
  await redis.del(`user:${userId}`);
}

// Invalidate a group of cached items
async function invalidatePostCache() {
  // Delete all post-related cache keys using a pattern
  const keys = await redis.keys('cache:posts:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

---

## QStash: Message Queues and Cron Jobs

QStash is Upstash's serverless messaging and scheduling service. It lets you send messages to any HTTP endpoint with guaranteed delivery, retries, and scheduled execution.

### Install

```bash
npm install @upstash/qstash
```

### Send a Message

```js
import { Client } from '@upstash/qstash';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN,
});

// Send a message to an endpoint
await qstash.publishJSON({
  url: 'https://yourapp.com/api/process-order',
  body: { orderId: '12345', action: 'process' },
});
```

### Delayed Messages

```js
// Send a message with a 30-second delay
await qstash.publishJSON({
  url: 'https://yourapp.com/api/send-reminder',
  body: { userId: '789', type: 'welcome' },
  delay: 30,  // seconds
});
```

### Scheduled (Cron) Messages

Recurring messages use the Schedules API, not `publishJSON`:

```js
// Run every hour
await qstash.schedules.create({
  destination: 'https://yourapp.com/api/cleanup',
  cron: '0 * * * *',  // Standard cron syntax
  body: JSON.stringify({ task: 'cleanup-expired-sessions' }),
});
```

### Receiving QStash Messages

```js
import { Receiver } from '@upstash/qstash';

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
});

// In your API handler (e.g., Next.js API route)
export async function POST(req) {
  const body = await req.text();
  const signature = req.headers.get('upstash-signature');

  // Verify the message is from QStash
  const isValid = await receiver.verify({ body, signature });
  if (!isValid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const data = JSON.parse(body);
  // Process the message
  console.log('Received:', data);

  return new Response('OK');
}
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `UPSTASH_REDIS_REST_URL` | Redis REST API endpoint | `https://usw1-example-12345.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST API authentication token | `AXXXaaaBBBcccDDDeee...` |
| `QSTASH_TOKEN` | QStash API token (for message queues) | `eyJhbGciOiJIUzI1NiIs...` |
| `QSTASH_CURRENT_SIGNING_KEY` | QStash signature verification key | `sig_abc123...` |
| `QSTASH_NEXT_SIGNING_KEY` | QStash next rotation signing key | `sig_def456...` |

### Set on Your Deployment Platform

- **Vercel:** Project Settings > Environment Variables > Add the Redis variables
- **Render:** Service > Environment tab > Add the Redis variables
- **Cloudflare Workers:** `wrangler secret put UPSTASH_REDIS_REST_URL`
- **Local:** Create a `.env` file (add `.env` to `.gitignore`)

```bash
# .env
UPSTASH_REDIS_REST_URL=https://usw1-example-12345.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXaaaBBBcccDDDeee...
```

### Vercel Integration

Upstash is a native Vercel Marketplace integration that auto-provisions a Redis database and sets environment variables:

1. Go to [vercel.com/integrations/upstash](https://vercel.com/integrations/upstash)
2. Click **Install**, then create a new Upstash account (choose product, database name, region, plan) or link an existing one
3. Connect the database to your Vercel project
4. Upstash sets `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` automatically -- redeploy your project for the new env vars to take effect

---

## Free Tier Info

| Feature | Free Tier |
|---------|-----------|
| **Commands** | 500,000/month |
| **Storage** | 256 MB |
| **Bandwidth** | 10 GB/month |
| **Concurrent connections** | 100 |
| **Databases** | 10 |
| **Max request size** | 10 MB |
| **QStash messages** | 1,000/day |

Key details:
- The command quota is monthly, not daily
- No credit card required
- Scales to zero -- no charges when idle
- Global replication is available on paid plans
- Data persists (not ephemeral like some Redis providers)
- The 500K monthly command limit includes all operations (GET, SET, etc.)
- Beyond 10 free databases, additional ones cost $0.50 per database (up to 100)

---

## Troubleshooting

### Problem: "ERR max requests limit exceeded"

**Cause:** You have exceeded the 500,000 commands/month free tier limit.

**Fix:**

1. Check your usage in the Upstash console > **Usage** tab
2. Optimize your code to reduce Redis calls:
   - Use `MGET`/`MSET` for batch operations instead of individual calls
   - Increase cache TTLs to reduce cache misses
   - Use pipelining for multiple commands:

```js
const pipeline = redis.pipeline();
pipeline.set('key1', 'value1');
pipeline.set('key2', 'value2');
pipeline.get('key1');
const results = await pipeline.exec();
```

3. Upgrade to the Pay-as-you-go plan ($0.20 per 100K commands) if you need more

### Problem: "ERR max concurrent connections exceeded"

**Cause:** More than 100 simultaneous connections on the free tier.

**Fix:**

1. Use the REST API (`@upstash/redis`) instead of the Redis protocol -- REST connections are stateless and do not count toward the concurrent limit
2. If using the Redis protocol, reduce your connection pool size:

```js
// If using ioredis
const redis = new IORedis(process.env.UPSTASH_REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});
```

3. Ensure connections are properly closed after use in serverless functions

### Problem: Data disappears or keys are missing

**Cause:** Keys expired (TTL), or the database was flushed, or you hit the storage limit.

**Fix:**

1. Check if the key has a TTL set: `redis.ttl('your-key')`
   - Returns `-2` if the key does not exist
   - Returns `-1` if no expiration is set
   - Returns the remaining seconds otherwise
2. Check your storage usage in the console -- if you hit 256 MB, new writes may fail
3. Be intentional about TTLs. Set them when caching, omit them for persistent data.

### Problem: Serialization errors -- object stored but retrieved as string

**Cause:** Redis stores everything as strings. The `@upstash/redis` client auto-serializes JSON, but you need to handle it correctly.

**Fix:**

```js
// @upstash/redis handles JSON automatically
await redis.set('user:1', { name: 'Alice', age: 30 });
const user = await redis.get('user:1');
// user is already an object: { name: 'Alice', age: 30 }

// If using raw Redis client (ioredis), you must serialize manually
await rawRedis.set('user:1', JSON.stringify({ name: 'Alice', age: 30 }));
const raw = await rawRedis.get('user:1');
const parsed = JSON.parse(raw);
```

### Problem: High latency on Redis commands

**Cause:** The Redis database region is far from your server, or you are making too many sequential calls.

**Fix:**

1. Choose a Redis region close to your deployment:
   - Vercel serverless (default): `US-East-1`
   - Cloudflare Workers: consider Global replication
2. Batch operations with pipelines:

```js
// Instead of 3 round trips:
await redis.set('a', 1);
await redis.set('b', 2);
await redis.set('c', 3);

// Use 1 round trip:
const pipe = redis.pipeline();
pipe.set('a', 1);
pipe.set('b', 2);
pipe.set('c', 3);
await pipe.exec();
```

3. For Vercel, use the Upstash Vercel integration to auto-select the closest region

### Problem: Rate limiter not working as expected

**Cause:** The identifier used for rate limiting is not unique per user, or the window configuration is wrong.

**Fix:**

1. Use a unique identifier per user (IP address, user ID, API key):

```js
// Use user ID if authenticated, IP if not
const identifier = session?.userId || req.headers.get('x-forwarded-for') || 'anonymous';
const { success } = await ratelimit.limit(identifier);
```

2. In development, `x-forwarded-for` may not be set. Use a fallback.
3. Test with the Upstash console > **Data Browser** to inspect rate limit keys
