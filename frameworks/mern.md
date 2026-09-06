# Deploy Full MERN Stack

> Deploy a MERN (MongoDB, Express, React, Node.js) application with the backend on Render and the frontend on GitHub Pages.

This guide covers deploying a complete full-stack JavaScript application: a React + Vite frontend on GitHub Pages and an Express.js + MongoDB backend on Render. The two communicate via a REST API.

## Prerequisites

- [ ] [Node.js 22+](https://nodejs.org/) installed (24 LTS recommended)
- [ ] [Git](https://git-scm.com/downloads) installed
- [ ] A [GitHub account](https://github.com/signup)
- [ ] A [Render account](https://render.com/) (sign up with GitHub)
- [ ] A [MongoDB Atlas account](https://www.mongodb.com/cloud/atlas/register) (free)

---

## Architecture Overview

```
GitHub Pages (Frontend)          Render (Backend)           MongoDB Atlas (Database)
+------------------+            +------------------+        +------------------+
|  React + Vite    | -- API --> |  Express.js      | -----> |  MongoDB         |
|  Static files    |   calls    |  REST API        |        |  Cloud database  |
|  (SPA)           |            |  Port: $PORT     |        |  Free M0 tier    |
+------------------+            +------------------+        +------------------+
```

---

## Step 1: Set Up MongoDB Atlas

Follow the [MongoDB Atlas guide](../guides/mongodb-atlas.md) to:

1. Create a free M0 cluster
2. Create a database user
3. Whitelist all IPs (`0.0.0.0/0`)
4. Copy your connection string

Your connection string looks like:

```
mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

---

## Step 2: Build the Express Backend

### Create the Project

```bash
mkdir mern-app && cd mern-app
mkdir server && cd server
npm init -y
npm install express cors dotenv mongoose
```

### Create server/server.js

```js
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Database connection
mongoose.connect(process.env.MONGODB_URI, { dbName: 'mern-app' })
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schema & Model
const todoSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const Todo = mongoose.model('Todo', todoSchema);

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'MERN API is running' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/todos', async (req, res) => {
  const todos = await Todo.find().sort({ createdAt: -1 });
  res.json(todos);
});

app.post('/api/todos', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required' });
  const todo = await Todo.create({ text });
  res.status(201).json(todo);
});

app.patch('/api/todos/:id', async (req, res) => {
  const todo = await Todo.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json(todo);
});

app.delete('/api/todos/:id', async (req, res) => {
  const todo = await Todo.findByIdAndDelete(req.params.id);
  if (!todo) return res.status(404).json({ error: 'Todo not found' });
  res.json({ message: 'Deleted' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Update server/package.json

```json
{
  "name": "mern-server",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^17.4.0",
    "express": "^5.2.0",
    "mongoose": "^9.7.0"
  }
}
```

### Create server/.env (for local development)

```bash
MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
CORS_ORIGIN=http://localhost:5173
```

### Create server/.gitignore

```
node_modules/
.env
```

### Test Locally

```bash
npm run dev
# Test: curl http://localhost:5000/api/todos
```

---

## Step 3: Deploy the Backend to Render

### Push the Server to GitHub

Create a separate repository for the backend:

```bash
cd server
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/mern-server.git
git push -u origin main
```

### Create a Web Service on Render

1. Go to [dashboard.render.com](https://dashboard.render.com/)
2. Click **New** > **Web Service**
3. Connect the `mern-server` repository
4. Configure:
   - **Name:** `mern-server`
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Add environment variables under the **Advanced** section of the form:
   - `MONGODB_URI` = your Atlas connection string
   - `CORS_ORIGIN` = `https://<username>.github.io` (you will set this after deploying the frontend)
6. Click **Create Web Service**

Your backend is live at `https://mern-server.onrender.com`.

Test it:

```bash
curl https://mern-server.onrender.com/api/todos
```

---

## Step 4: Build the React Frontend

### Create the Client

```bash
cd ..   # back to mern-app/
npm create vite@latest client -- --template react
cd client
npm install
```

### Create an API Service

Create `client/src/api.js`:

```js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export async function getTodos() {
  const res = await fetch(`${API_URL}/api/todos`);
  return res.json();
}

export async function createTodo(text) {
  const res = await fetch(`${API_URL}/api/todos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.json();
}

export async function toggleTodo(id, completed) {
  const res = await fetch(`${API_URL}/api/todos/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed }),
  });
  return res.json();
}

export async function deleteTodo(id) {
  await fetch(`${API_URL}/api/todos/${id}`, { method: 'DELETE' });
}
```

### Create the App Component

Replace `client/src/App.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { getTodos, createTodo, toggleTodo, deleteTodo } from './api';

function App() {
  const [todos, setTodos] = useState([]);
  const [text, setText] = useState('');

  useEffect(() => {
    getTodos().then(setTodos);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const todo = await createTodo(text);
    setTodos([todo, ...todos]);
    setText('');
  };

  const handleToggle = async (id, completed) => {
    const updated = await toggleTodo(id, !completed);
    setTodos(todos.map(t => t._id === id ? updated : t));
  };

  const handleDelete = async (id) => {
    await deleteTodo(id);
    setTodos(todos.filter(t => t._id !== id));
  };

  return (
    <div style={{ maxWidth: 600, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>MERN Todo App</h1>
      <form onSubmit={handleSubmit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a todo..."
          style={{ padding: '0.5rem', width: '70%' }}
        />
        <button type="submit" style={{ padding: '0.5rem 1rem', marginLeft: '0.5rem' }}>
          Add
        </button>
      </form>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {todos.map(todo => (
          <li key={todo._id} style={{ padding: '0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={todo.completed}
              onChange={() => handleToggle(todo._id, todo.completed)}
            />
            <span style={{ textDecoration: todo.completed ? 'line-through' : 'none', flex: 1 }}>
              {todo.text}
            </span>
            <button onClick={() => handleDelete(todo._id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
```

### Configure Vite for GitHub Pages

Edit `client/vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/mern-client/',  // Must match your GitHub repo name
})
```

Test locally (run both server and client):

```bash
# Terminal 1: server
cd server && npm run dev

# Terminal 2: client
cd client && npm run dev
```

---

## Step 5: Deploy the Frontend to GitHub Pages

### Push the Client to GitHub

Create a separate repository for the frontend:

```bash
cd client
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<username>/mern-client.git
git push -u origin main
```

### Add the Deploy Workflow

Create `client/.github/workflows/deploy.yml`:

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

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - run: npm ci
      - run: npm run build
        env:
          VITE_API_URL: https://mern-server.onrender.com

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

### Enable GitHub Pages

1. Go to the `mern-client` repo **Settings** > **Pages**
2. Under **Source**, select **GitHub Actions**
3. Push and deploy:

```bash
git add .
git commit -m "Add deploy workflow"
git push origin main
```

Your frontend is live at `https://<username>.github.io/mern-client/`.

---

## Step 6: Update Backend CORS

Now that the frontend is deployed, update the `CORS_ORIGIN` on Render:

1. Go to your `mern-server` service on Render
2. Click **Environment** in the left sidebar
3. Set `CORS_ORIGIN` to `https://<username>.github.io`
4. Choose **Save, rebuild, and deploy** (triggers redeploy)

---

## Environment Variables

### Backend (Render)

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (auto-set by Render) | `10000` |
| `MONGODB_URI` | MongoDB Atlas connection string | `mongodb+srv://...` |
| `CORS_ORIGIN` | Frontend URL for CORS | `https://user.github.io` |

### Frontend (GitHub Actions)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://mern-server.onrender.com` |

Set `VITE_API_URL` in the GitHub Actions workflow `env` block, or as a repository secret.

---

## Custom Domain

### Frontend (GitHub Pages)

1. Create `client/public/CNAME` with your domain: `www.yourdomain.com`
2. Configure DNS (see [GitHub Pages guide](../guides/github-pages.md#custom-domain))

### Backend (Render)

1. Go to Render service **Settings** > **Custom Domains**
2. Add `api.yourdomain.com`
3. Add a CNAME DNS record: `api` -> `mern-server.onrender.com`

Then update `VITE_API_URL` to `https://api.yourdomain.com` in your workflow and redeploy.

---

## Troubleshooting

### Problem: Frontend shows "Failed to fetch" or network error

**Cause:** Backend is not running, URL is wrong, or CORS is misconfigured.

**Fix:**

1. Verify the backend is running: `curl https://mern-server.onrender.com/health`
2. Check `VITE_API_URL` is set correctly in the GitHub Actions workflow
3. Verify `CORS_ORIGIN` on Render matches the frontend URL exactly (no trailing slash)

### Problem: CORS error in browser console

**Cause:** Backend `CORS_ORIGIN` doesn't match the frontend domain.

**Fix:**

```
# On Render, set CORS_ORIGIN to exactly:
https://<username>.github.io
# NOT: https://<username>.github.io/ (no trailing slash)
# NOT: https://<username>.github.io/mern-client (no path)
```

### Problem: Backend works but database operations fail

**Cause:** `MONGODB_URI` is missing or incorrect on Render.

**Fix:**

1. Check the **Environment** page on Render (left sidebar) -- verify `MONGODB_URI` is set
2. Go to MongoDB Atlas > **Network Access** > ensure `0.0.0.0/0` is whitelisted
3. Check Render logs for connection error details

### Problem: Data appears on refresh but POST doesn't work

**Cause:** Missing `Content-Type: application/json` header or `express.json()` middleware.

**Fix:**

1. Backend: Ensure `app.use(express.json())` is before your routes
2. Frontend: Ensure fetch calls include `headers: { 'Content-Type': 'application/json' }`

### Problem: Blank page on GitHub Pages

**Cause:** `base` in `vite.config.js` doesn't match the repo name.

**Fix:**

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  base: '/mern-client/',  // Exact repo name with slashes
})
```

### Problem: Deep links 404 on GitHub Pages

**Cause:** GitHub Pages only serves static files. It knows nothing about client-side routes, so refreshing or directly opening a route like `/mern-client/todos` returns the Pages 404.

**Fix:** Copy the built `index.html` to `404.html` so Pages serves the SPA for any path. Add this to the build job right after `npm run build`:

```yaml
- run: cp dist/index.html dist/404.html
```

If you add React Router, pass `basename={import.meta.env.BASE_URL}` to `BrowserRouter` so routes resolve under the `/mern-client/` subpath.

### Problem: First API call takes 30-60 seconds

**Cause:** Render free tier spins down after 15 minutes of inactivity.

**Fix:** This is expected on the free tier. Options:

1. Show a loading spinner in the frontend while the backend wakes up
2. Upgrade to Render Starter ($7/month) for always-on
3. Use a service like [cron-job.org](https://cron-job.org) to ping `/health` every 14 minutes (for demos only)

Note: free web services share 750 instance hours per workspace per month. One always-pinged service fits within the cap, but multiple kept-awake services will exhaust it and Render suspends all free services until the month resets.

### Problem: Environment variable is undefined in the frontend build

**Cause:** `VITE_API_URL` is not passed as an env during the build step.

**Fix:** Ensure the variable is in the `env` block of the build step in your GitHub Actions workflow:

```yaml
- run: npm run build
  env:
    VITE_API_URL: https://mern-server.onrender.com
```

Or use a GitHub secret:

```yaml
- run: npm run build
  env:
    VITE_API_URL: ${{ secrets.VITE_API_URL }}
```
