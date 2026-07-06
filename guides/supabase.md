# Supabase

> Build backends fast with Supabase -- an open-source Firebase alternative offering Postgres, Auth, Storage, Realtime, and Edge Functions.

Supabase wraps a full PostgreSQL database with a suite of tools: automatic REST and GraphQL APIs, user authentication with OAuth providers, file storage with CDN, realtime subscriptions via WebSockets, and edge functions for serverless logic. Everything is accessible through a clean dashboard and client libraries for JavaScript and Python.

## Prerequisites

- [ ] A [Supabase account](https://supabase.com/dashboard) (sign up with GitHub for easiest setup)
- [ ] [Node.js 22+](https://nodejs.org/) (for JavaScript usage)
- [ ] [Python 3.12+](https://www.python.org/downloads/) (for Python usage)
- [ ] (Optional) [Supabase CLI](https://supabase.com/docs/guides/cli): `npm install supabase --save-dev` (then run with `npx supabase`)

---

## Step 1: Create a Project

1. Log in to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New Project**
3. Configure:
   - **Organization:** Select or create one
   - **Project name:** `my-project`
   - **Database password:** Set a strong password (save it -- you will need it for direct connections)
   - **Region:** Select the one closest to your users or deployment platform
4. Click **Create new project**

The project takes about 2 minutes to provision. Once ready, you have a full Postgres database with APIs enabled.

---

## Step 2: Get Your API Keys

1. Go to your project dashboard
2. Click **Settings** > **API Keys** in the sidebar
3. Copy these values:

| Value | Where to Find | What It Is |
|-------|---------------|------------|
| **Project URL** | Settings > API Keys (or the Connect dialog) | `https://<project-id>.supabase.co` |
| **Publishable key** (`sb_publishable_...`) | Settings > API Keys | Safe to use in browser code. Respects RLS policies. |
| **Secret key** (`sb_secret_...`) | Settings > API Keys | **Server-only.** Bypasses RLS. Never expose to the client. Supabase blocks secret keys used from browsers. |
| **Connection string** | **Connect** button at the top of the dashboard | Direct Postgres connection: `postgresql://postgres:[password]@db.<project-id>.supabase.co:5432/postgres` |

> **Warning:** The secret key bypasses all Row Level Security. Only use it in server-side code, never in a browser or mobile app.

> **Note:** Publishable and secret keys replace the legacy JWT-based `anon` and `service_role` keys. Projects created after November 2025 do not have the legacy keys at all; older projects keep them working alongside the new keys until Supabase removes them in late 2026. Migrate to the new keys.

> **Note:** Direct connections (`db.<project-id>.supabase.co:5432`) are IPv6-only by default. On IPv4-only networks (many CI runners and hosts), use the Supavisor pooler connection string or the paid IPv4 add-on.

---

## Step 3: Create Tables

### Via SQL Editor

1. Go to **SQL Editor** in the left sidebar
2. Run your SQL:

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    body TEXT NOT NULL,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Via Table Editor

1. Go to **Table Editor** in the left sidebar
2. Click **New Table**
3. Add columns using the visual interface
4. Set types, defaults, and foreign keys from the UI

Both methods produce the same result. The SQL Editor is faster for complex schemas; the Table Editor is helpful for quick prototyping.

---

## Row Level Security (RLS)

RLS is enabled by default only on tables created with the **Table Editor**. Tables created in raw SQL or the **SQL Editor** (like the ones in Step 3) have RLS **disabled** until you enable it yourself -- until then, every row is exposed through the API. Once RLS is on, no rows are accessible without policies.

### Enable RLS and Add Policies

```sql
-- Enable RLS (required for tables created via SQL; Table Editor tables have it on already)
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read published posts
CREATE POLICY "Public can read published posts"
ON posts FOR SELECT
USING (published = true);

-- Allow authenticated users to insert their own posts
CREATE POLICY "Users can insert own posts"
ON posts FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = author_id);

-- Allow users to update their own posts
CREATE POLICY "Users can update own posts"
ON posts FOR UPDATE
TO authenticated
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);

-- Allow users to delete their own posts
CREATE POLICY "Users can delete own posts"
ON posts FOR DELETE
TO authenticated
USING (auth.uid() = author_id);
```

Key concepts:
- `USING` controls which existing rows the policy applies to (for SELECT, UPDATE, DELETE)
- `WITH CHECK` controls which new/modified rows are allowed (for INSERT, UPDATE)
- `auth.uid()` returns the currently authenticated user's ID
- `TO authenticated` restricts the policy to logged-in users
- `TO anon` applies to unauthenticated requests

---

## Use in Node.js

### Install Dependencies

```bash
npm install @supabase/supabase-js
```

### Initialize the Client

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_PUBLISHABLE_KEY
);
```

### CRUD Operations

```js
// Create
const { data: newPost, error: insertError } = await supabase
  .from('posts')
  .insert({ title: 'Hello World', content: 'My first post', author_id: userId })
  .select()
  .single();

// Read (with filtering, ordering, pagination)
const { data: posts, error: selectError } = await supabase
  .from('posts')
  .select('id, title, content, created_at, profiles(username, avatar_url)')
  .eq('published', true)
  .order('created_at', { ascending: false })
  .range(0, 9);

// Update
const { data: updated, error: updateError } = await supabase
  .from('posts')
  .update({ title: 'Updated Title', published: true })
  .eq('id', postId)
  .select()
  .single();

// Delete
const { error: deleteError } = await supabase
  .from('posts')
  .delete()
  .eq('id', postId);
```

### Server-Side Client (Bypasses RLS)

For server-side operations that need full access, use the secret key:

```js
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// This bypasses RLS -- use only in trusted server environments
const { data: allUsers } = await supabaseAdmin
  .from('profiles')
  .select('*');
```

---

## Use in Python

### Install Dependencies

```bash
pip install supabase python-dotenv
```

### Initialize the Client

```python
import os
from supabase import create_client, Client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_PUBLISHABLE_KEY"]

supabase: Client = create_client(url, key)
```

### CRUD Operations

```python
# Create
result = supabase.table("posts").insert({
    "title": "Hello from Python",
    "content": "My first post",
    "author_id": user_id
}).execute()
new_post = result.data[0]

# Read (with filtering and ordering)
result = supabase.table("posts") \
    .select("id, title, content, created_at, profiles(username)") \
    .eq("published", True) \
    .order("created_at", desc=True) \
    .limit(10) \
    .execute()
posts = result.data

# Update
result = supabase.table("posts") \
    .update({"title": "Updated Title", "published": True}) \
    .eq("id", post_id) \
    .execute()

# Delete
supabase.table("posts").delete().eq("id", post_id).execute()
```

### With FastAPI

```python
import os
from fastapi import FastAPI, HTTPException
from supabase import create_client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SECRET_KEY"]
supabase = create_client(url, key)

app = FastAPI()

@app.get("/api/posts")
def get_posts():
    result = supabase.table("posts") \
        .select("*") \
        .eq("published", True) \
        .execute()
    return result.data

@app.post("/api/posts")
def create_post(title: str, content: str, author_id: str):
    result = supabase.table("posts").insert({
        "title": title,
        "content": content,
        "author_id": author_id
    }).execute()
    if not result.data:
        raise HTTPException(status_code=400, detail="Failed to create post")
    return result.data[0]
```

---

## Authentication

Supabase Auth supports email/password, magic links, phone OTP, and OAuth providers (Google, GitHub, Discord, and more).

### Email/Password Auth (Node.js)

```js
// Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'securepassword123',
});

// Log in
const { data: session, error: loginError } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'securepassword123',
});

// Get the current user
const { data: { user } } = await supabase.auth.getUser();

// Log out
await supabase.auth.signOut();
```

### OAuth (Google, GitHub)

First, enable the provider in your Supabase dashboard: **Authentication** > **Providers** > enable Google or GitHub and add your OAuth credentials.

```js
// Sign in with GitHub
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'github',
  options: {
    redirectTo: 'https://yourapp.com/auth/callback',
  },
});

// Sign in with Google
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: 'https://yourapp.com/auth/callback',
  },
});
```

### Auth in Python

```python
# Sign up
result = supabase.auth.sign_up({
    "email": "user@example.com",
    "password": "securepassword123"
})

# Log in
result = supabase.auth.sign_in_with_password({
    "email": "user@example.com",
    "password": "securepassword123"
})
access_token = result.session.access_token

# Get user
user = supabase.auth.get_user()
```

### Listen for Auth Changes (Browser)

```js
supabase.auth.onAuthStateChange((event, session) => {
  console.log('Auth event:', event);  // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.
  console.log('Session:', session);
});
```

---

## File Storage

Supabase Storage lets you upload, download, and serve files with access control.

### Create a Bucket

1. Go to **Storage** in the sidebar
2. Click **New Bucket**
3. Name it (e.g., `avatars`) and choose **Public** or **Private**

Or via SQL:

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
```

### Storage Policies

```sql
-- Allow authenticated users to upload to the avatars bucket
CREATE POLICY "Users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'avatars');

-- Allow public read access
CREATE POLICY "Public can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```

### Upload and Download (Node.js)

```js
// Upload a file
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`public/${userId}.png`, file, {
    contentType: 'image/png',
    upsert: true,
  });

// Get public URL
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl(`public/${userId}.png`);

// Download a file
const { data: fileData, error: dlError } = await supabase.storage
  .from('avatars')
  .download(`public/${userId}.png`);

// Delete a file
const { error: delError } = await supabase.storage
  .from('avatars')
  .remove([`public/${userId}.png`]);
```

### Upload and Download (Python)

```python
# Upload a file
with open("avatar.png", "rb") as f:
    supabase.storage.from_("avatars").upload(
        f"public/{user_id}.png",
        f,
        {"content-type": "image/png"}
    )

# Get public URL
url = supabase.storage.from_("avatars").get_public_url(f"public/{user_id}.png")

# Download a file
data = supabase.storage.from_("avatars").download(f"public/{user_id}.png")
with open("downloaded_avatar.png", "wb") as f:
    f.write(data)
```

---

## Realtime Subscriptions

Supabase Realtime lets you listen for database changes over WebSockets.

### Enable Realtime on a Table

1. Go to **Database** > **Publications**
2. Toggle the tables you want to subscribe to under the `supabase_realtime` publication

Or via SQL:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE posts;
```

> **Tip:** For high-traffic apps, Supabase recommends the Broadcast feature over `postgres_changes`, which does not scale as well.

### Subscribe to Changes (Node.js)

```js
// Listen for new posts
const channel = supabase
  .channel('posts-changes')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'posts' },
    (payload) => {
      console.log('New post:', payload.new);
    }
  )
  .on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'posts' },
    (payload) => {
      console.log('Updated post:', payload.new);
    }
  )
  .on(
    'postgres_changes',
    { event: 'DELETE', schema: 'public', table: 'posts' },
    (payload) => {
      console.log('Deleted post:', payload.old);
    }
  )
  .subscribe();

// Unsubscribe when done
supabase.removeChannel(channel);
```

### Subscribe with a Filter

```js
// Only listen for published posts by a specific user
const channel = supabase
  .channel('my-posts')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'posts',
      filter: `author_id=eq.${userId}`,
    },
    (payload) => {
      console.log('Change on my posts:', payload);
    }
  )
  .subscribe();
```

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `SUPABASE_URL` | Project API URL | `https://abcdefghij.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable API key. Safe for client-side. Respects RLS. | `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | Secret API key. **Server-only.** Bypasses RLS. | `sb_secret_...` |

### Set on Your Deployment Platform

- **Vercel:** Project Settings > Environment Variables > Add all three variables
- **Render:** Service > Environment tab > Add all three variables
- **Netlify:** Site Settings > Environment Variables > Add all three variables
- **Local:** Create a `.env` file (add `.env` to `.gitignore`)

```bash
# .env
SUPABASE_URL=https://abcdefghij.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

> **Important:** Only use `SUPABASE_PUBLISHABLE_KEY` in client-side code. The `SUPABASE_SECRET_KEY` must only be used in server-side environments.

---

## Free Tier Info

| Feature | Free Tier |
|---------|-----------|
| **Database** | 500 MB |
| **File Storage** | 1 GB |
| **Monthly Active Users** | 50,000 |
| **Edge Function Invocations** | 500,000/month |
| **Realtime Messages** | 2 million/month |
| **Bandwidth** | 5 GB |
| **Projects** | 2 active projects |

Key details:
- The database is a full Postgres instance with extensions (pgvector, PostGIS, etc.)
- The free tier pauses projects after 1 week of inactivity. Restore from the dashboard.
- Auth supports unlimited users on all plans, but MAU is capped on the free tier
- Edge Functions run on Deno and are deployed globally
- Storage includes a built-in CDN for public buckets

---

## Troubleshooting

### Problem: Query returns empty array but data exists

**Cause:** Row Level Security is blocking the query. Once RLS is enabled on a table, no rows are returned without a matching policy.

**Fix:**

1. Check if RLS is enabled: go to **Table Editor** > select table > **RLS Enabled** badge
2. Add a SELECT policy:

```sql
CREATE POLICY "Allow public read"
ON your_table FOR SELECT
USING (true);  -- Allows everyone to read (adjust as needed)
```

3. For debugging, temporarily disable RLS (do not leave this in production):

```sql
ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;
```

### Problem: "Invalid API key" or 401 Unauthorized

**Cause:** Wrong API key or the key does not match the project URL.

**Fix:**

1. Verify `SUPABASE_URL` matches the project in your dashboard
2. Verify `SUPABASE_PUBLISHABLE_KEY` is the **publishable** key (`sb_publishable_...`, not the secret key) for client-side use
3. Rotate keys if compromised: **Settings** > **API Keys** > create a new key and delete the old one
4. If you have an older project still on legacy `anon`/`service_role` JWT keys, migrate to publishable/secret keys -- legacy keys are being removed in late 2026

### Problem: CORS errors in the browser

**Cause:** The request origin is not allowed, or you are calling the REST API directly instead of using the client library.

**Fix:**

1. Use the `@supabase/supabase-js` client library -- it handles CORS automatically
2. If calling the REST API directly, Supabase allows all origins by default. Check that you are including the `apikey` header:

```js
fetch(`${SUPABASE_URL}/rest/v1/posts`, {
  headers: {
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
  },
});
```

### Problem: Storage upload returns 403 or "new row violates row-level security policy"

**Cause:** No storage policy allows the upload.

**Fix:**

1. Create a storage policy:

```sql
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'your-bucket');
```

2. For public buckets, make sure the bucket is marked as public in the dashboard
3. Check that the file path in the policy matches what your code uploads

### Problem: Connection pooling errors or "too many connections"

**Cause:** Each client opens a direct connection. Serverless environments can exhaust the connection limit.

**Fix:**

1. Use the **Supavisor pooler** connection string instead of the direct connection:
   - Click the **Connect** button at the top of the dashboard
   - Select **Mode: Transaction** for serverless environments
   - The pooler URL uses port `6543` instead of `5432` (session mode stays on `5432`)

2. Connection string format:
```
postgresql://postgres.[project-id]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

3. In your ORM, limit the pool size:

```python
# Python SQLAlchemy
engine = create_engine(DATABASE_URL, pool_size=5, max_overflow=2)
```

```js
// Node.js pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});
```

### Problem: Realtime subscription not receiving events

**Cause:** The table is not in the realtime publication, or RLS is blocking the subscription.

**Fix:**

1. Enable realtime: **Database** > **Publications** > toggle on your table under `supabase_realtime`
2. Or via SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE your_table;`
3. Make sure your RLS policies allow SELECT for the subscribing user
4. Check that you are calling `.subscribe()` on the channel
