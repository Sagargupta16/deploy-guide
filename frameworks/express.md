# Deploy Express.js to Render

> Deploy an Express.js backend API to Render with environment variables, a database, and auto-deploy from GitHub.

This guide walks through deploying a production-ready Express.js application to Render's free tier, including connecting to a database, setting up environment variables, and configuring a custom domain.

## Prerequisites

- [ ] [Node.js 22+](https://nodejs.org/) installed (24 LTS recommended; 18 and 20 are end-of-life)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Render account](https://render.com/) (sign up with GitHub)

---

## Step 1: Create an Express App

```bash
mkdir my-express-api && cd my-express-api
npm init -y
npm install express cors dotenv
# or with pnpm (v11, needs Node 22.13+): pnpm init && pnpm add express cors dotenv
```

Create `server.js`:

```js
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/items', (req, res) => {
  res.json([
    { id: 1, name: 'Item One' },
    { id: 2, name: 'Item Two' },
  ]);
});

app.post('/api/items', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  res.status(201).json({ id: Date.now(), name });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

Update `package.json`:

```json
{
  "name": "my-express-api",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^17.4.2",
    "express": "^5.2.1"
  }
}
```

Create `.gitignore`:

```
node_modules/
.env
```

Test locally:

```bash
npm run dev
# Open http://localhost:3000
```

---

## Step 2: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/my-express-api.git
git push -u origin main
```

---

## Step 3: Deploy to Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `my-express-api`
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Click **Create Web Service**

Render builds and deploys your app. You get a URL like `https://my-express-api.onrender.com`.

---

## Step 4: Add a Database

### Option A: MongoDB Atlas

```bash
npm install mongoose
```

Add to `server.js`:

```js
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'myapp' })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // exit so the platform restarts the service instead of serving 500s
  });

const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Item = mongoose.model('Item', itemSchema);

// Update routes to use the database
app.get('/api/items', async (req, res) => {
  const items = await Item.find().sort({ createdAt: -1 });
  res.json(items);
});

app.post('/api/items', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const item = await Item.create({ name });
  res.status(201).json(item);
});
```

Set `MONGODB_URI` in Render's Environment tab. See the [MongoDB Atlas guide](../guides/mongodb-atlas.md) for setup.

### Option B: Neon PostgreSQL

```bash
npm install pg
```

Add to `server.js`:

```js
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { require: true },
});

app.get('/api/items', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM items ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/items', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const { rows } = await pool.query(
    'INSERT INTO items (name) VALUES ($1) RETURNING *', [name]
  );
  res.status(201).json(rows[0]);
});
```

Set `DATABASE_URL` in Render's Environment tab. See the [Neon guide](../guides/neon.md) for setup.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by Render) | `10000` |
| `NODE_ENV` | Environment mode | `production` |
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://...` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `JWT_SECRET` | Secret for JWT tokens | `your-jwt-secret` |
| `CORS_ORIGIN` | Allowed CORS origin | `https://myapp.github.io` |

### Set on Render

1. Go to your service on Render
2. Click the **Environment** tab
3. Click **+ Add Environment Variable** and add each variable
4. Save with **Save, rebuild, and deploy** or **Save and deploy** (choose **Save only** to skip the redeploy)

### Use CORS_ORIGIN for Dynamic CORS

```js
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
```

---

## Custom Domain

### Step 1: Add Domain in Render

1. Go to your service **Settings** > **Custom Domains**
2. Click **Add Custom Domain**
3. Enter `api.yourdomain.com`

### Step 2: Configure DNS

| Type | Name | Value |
|------|------|-------|
| CNAME | api | `my-express-api.onrender.com` |

### Step 3: SSL

Render provisions a free SSL certificate automatically once DNS propagates.

---

## Troubleshooting

### Problem: Deploy fails with "Build failed"

**Cause:** Missing dependencies or wrong Node.js version.

**Fix:**

```bash
# Ensure all dependencies are in package.json
npm install
git add package.json package-lock.json
git push
```

To pin the Node.js version, set a `NODE_VERSION` env var on Render, add a `.node-version` or `.nvmrc` file, or add a bounded range to `package.json`:

```json
{
  "engines": {
    "node": "22.x"
  }
}
```

Always include an upper bound -- an unbounded range like `>=22` resolves to the latest Node release (Render's default is currently 24.x), which can change under you.

### Problem: "No open ports detected"

**Cause:** App not listening on `0.0.0.0` or not using `process.env.PORT`.

**Fix:**

```js
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Problem: CORS errors from the frontend

**Cause:** Missing or misconfigured CORS middleware.

**Fix:**

```js
import cors from 'cors';
app.use(cors({
  origin: ['https://your-frontend.github.io', 'http://localhost:5173'],
  credentials: true,
}));
```

Tip: for local development with a Vite frontend, you can skip CORS entirely by proxying in `vite.config.ts` (`server: { proxy: { '/api': 'http://localhost:3000' } }`) and calling relative `/api/*` paths.

### Problem: Request body is undefined

**Cause:** Missing `express.json()` middleware.

**Fix:**

```js
app.use(express.json());         // For JSON bodies
app.use(express.urlencoded({ extended: true }));  // For form data
```

### Problem: Free tier cold start is too slow

**Cause:** Render's free tier spins down after 15 minutes without inbound traffic. Note the free tier also caps each workspace at 750 instance hours per month, so keeping one service pinged awake full-time uses nearly all of it.

**Fix:**

1. Add a `/health` endpoint and ping it on a schedule for demos (an external pinger or a GitHub Actions cron workflow that curls it)
2. Or upgrade to Starter ($7/month) for always-on
3. Optimize startup time: defer database connections, reduce dependency count

### Problem: App crashes in production but works locally

**Cause:** Missing environment variables or different Node.js version.

**Fix:**

1. Check Render logs: go to your service > **Logs** tab
2. Verify all required env vars are set in the **Environment** tab
3. Add error handling middleware:

```js
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});
```
