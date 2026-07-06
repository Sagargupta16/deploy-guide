# MongoDB Atlas

> Set up a free cloud MongoDB database with MongoDB Atlas, get a connection string, and use it in Node.js and Python.

MongoDB Atlas is a fully managed cloud database service. The free tier (M0) gives you 512 MB of storage -- enough for hobby projects, prototypes, and learning. No credit card required.

## Prerequisites

- [ ] A [MongoDB Atlas account](https://www.mongodb.com/cloud/atlas/register) (free)
- [ ] [Node.js 20.19+](https://nodejs.org/) (for Node.js usage; 22 or 24 LTS recommended)
- [ ] [Python 3.12+](https://www.python.org/downloads/) (for Python usage)

---

## Step 1: Create a Free Cluster

1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com/)
2. Click **Build a Database** (or **Create** if you already have a project)
3. Select the **Free** tier (M0)
4. Choose a cloud provider and region (pick the one closest to your deployment platform):
   - **AWS** -- `us-east-1` works well with Render and Vercel
   - **GCP** or **Azure** -- also available
5. Name your cluster (e.g., `Cluster0`)
6. Click **Create Deployment**

The cluster takes 1-3 minutes to provision.

---

## Step 2: Create a Database User

1. After cluster creation, you'll be prompted to create a database user
2. Choose **Username and Password** authentication
3. Enter a username and a strong password
4. Click **Create Database User**

> **Save the password.** You will need it for the connection string. Do not use special characters (`@`, `:`, `/`) in the password as they need URL encoding.

You can also manage users later at **Database Access** in the left sidebar.

---

## Step 3: Whitelist IP Addresses

1. Go to **Network Access** in the left sidebar
2. Click **Add IP Address**
3. For development, click **Allow Access from Anywhere** (`0.0.0.0/0`)
4. Click **Confirm**

> **For production:** Instead of allowing all IPs, whitelist only your deployment platform's IP ranges. For Render, use `0.0.0.0/0` since Render uses dynamic IPs on the free tier.

---

## Step 4: Get Your Connection String

1. Go to **Database** in the left sidebar
2. Click **Connect** on your cluster
3. Select **Drivers**
4. Choose your driver (Node.js or Python)
5. Copy the connection string

It looks like this:

```
mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
```

Replace `<username>` and `<password>` with your database user credentials.

---

## Use in Node.js

### Install the Driver

```bash
npm install mongodb
```

### Connect and Use

```js
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

async function main() {
  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');

    const db = client.db('myapp');
    const users = db.collection('users');

    // Insert a document
    await users.insertOne({ name: 'Sagar', email: 'sagar@example.com' });

    // Find documents
    const allUsers = await users.find({}).toArray();
    console.log(allUsers);
  } finally {
    await client.close();
  }
}

main();
```

### With Mongoose (Popular ODM)

```bash
npm install mongoose
```

```js
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI, {
  dbName: 'myapp',
});

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

// Create
const user = await User.create({ name: 'Sagar', email: 'sagar@example.com' });

// Read
const users = await User.find();

// Update
await User.findByIdAndUpdate(user._id, { name: 'Sagar Gupta' });

// Delete
await User.findByIdAndDelete(user._id);
```

### Express.js Integration

```js
import express from 'express';
import mongoose from 'mongoose';

const app = express();
app.use(express.json());

app.get('/api/users', async (req, res) => {
  const users = await User.find();
  res.json(users);
});

// Connect once at startup; only start listening after the DB is reachable.
// Exiting on failure lets the platform restart the process instead of serving 500s.
mongoose
  .connect(process.env.MONGODB_URI, { dbName: 'myapp' })
  .then(() => app.listen(process.env.PORT || 3000))
  .catch((err) => {
    console.error('MongoDB connection failed:', err);
    process.exit(1);
  });
```

---

## Use in Python

### Install the Driver

```bash
pip install pymongo
```

> Older guides say `pip install pymongo[srv]`. The `srv` extra was removed in PyMongo 4.8 -- plain `pymongo` now includes SRV support.

### Connect and Use

```python
import os
from pymongo import MongoClient

uri = os.environ["MONGODB_URI"]
client = MongoClient(uri)

db = client["myapp"]
users = db["users"]

# Insert a document
users.insert_one({"name": "Sagar", "email": "sagar@example.com"})

# Find documents
for user in users.find():
    print(user)

# Update
users.update_one({"name": "Sagar"}, {"$set": {"name": "Sagar Gupta"}})

# Delete
users.delete_one({"name": "Sagar Gupta"})

client.close()
```

### Async Usage (FastAPI)

PyMongo ships a built-in async client (`AsyncMongoClient`) -- no extra package needed. The old async driver, Motor, was deprecated in May 2026 in favor of this API.

```bash
pip install pymongo
```

```python
import os
from pymongo import AsyncMongoClient
from fastapi import FastAPI

app = FastAPI()

client = AsyncMongoClient(os.environ["MONGODB_URI"])
db = client["myapp"]

@app.get("/api/users")
async def get_users():
    users = await db["users"].find().to_list(100)
    # Convert ObjectId to string for JSON serialization
    for user in users:
        user["_id"] = str(user["_id"])
    return users

@app.post("/api/users")
async def create_user(user: dict):
    result = await db["users"].insert_one(user)
    return {"id": str(result.inserted_id)}
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | Full connection string | `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/?retryWrites=true&w=majority` |

Set this on your deployment platform:

- **Render:** Service > Environment tab > Add `MONGODB_URI`
- **Vercel:** Project Settings > Environment Variables > Add `MONGODB_URI`
- **Local:** Create a `.env` file (add `.env` to `.gitignore`)

```bash
# .env
MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

---

## Custom Domain

MongoDB Atlas does not support custom domains for database connections. Use the provided `mongodb+srv://` connection string.

---

## Troubleshooting

### Problem: "MongoServerError: bad auth: Authentication failed"

**Cause:** Wrong username or password in the connection string.

**Fix:**

1. Go to **Database Access** in Atlas
2. Click **Edit** on your user
3. Click **Edit Password** and set a new one
4. Update the password in your connection string
5. Avoid special characters (`@`, `:`, `/`, `%`) in passwords

### Problem: "MongoNetworkError: connection timed out"

**Cause:** Your IP address is not whitelisted.

**Fix:**

1. Go to **Network Access** in Atlas
2. Click **Add IP Address**
3. Add your current IP or `0.0.0.0/0` for allow-all
4. Wait 1-2 minutes for the change to take effect

### Problem: Connection works locally but fails on Render/Vercel

**Cause:** The deployment platform's IP is not whitelisted.

**Fix:**

1. Go to **Network Access** in Atlas
2. Add `0.0.0.0/0` (allow access from anywhere)
3. This is required for platforms with dynamic IPs (Render free tier, Vercel serverless)

### Problem: "MongooseError: Operation timed out" in serverless functions

**Cause:** Creating a new connection on every function invocation.

**Fix:** Cache the connection outside the handler:

```js
// For Vercel serverless functions
let cached = global.mongoose;
if (!cached) cached = global.mongoose = { conn: null, promise: null };

async function connectDB() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGODB_URI, { dbName: 'myapp' });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
```

### Problem: Free cluster paused after a period of inactivity

**Cause:** Atlas auto-pauses free (M0) clusters after 30 days with zero connections.

**Fix:** Open the cluster in the Atlas UI and resume it. Any regular connection (a deployed app, a scheduled ping) prevents the pause.

### Problem: Free tier running out of storage

**Cause:** M0 tier has a 512 MB limit.

**Fix:**

1. Check usage in **Database** > **Metrics** > **Logical Size**
2. Delete old or unnecessary data
3. Add indexes to reduce storage overhead
4. Upgrade to a Flex cluster ($0.011/hour, usage-capped between $8/month and $30/month, 5 GB storage) or a Dedicated M10 cluster (from $0.08/hour, ~$57/month) for more storage

> The old M2/M5 shared tiers no longer exist -- creation ended in February 2025 and all remaining M2/M5 clusters were migrated to Flex on January 22, 2026.
