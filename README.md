# Deploy Guide

> Step-by-step deployment guides for every platform and framework. Stop reading docs for hours - deploy in minutes.

Whether you're deploying a React app, a FastAPI backend, or a full-stack MERN project, this repo has a battle-tested guide for it. Every guide includes actual commands, environment variable setup, custom domains, and troubleshooting.

**25+ guides** | **10 platforms** | **8 frameworks** | **4 databases** | **4 reference guides**

---

## Platforms

| Platform | Covers | Free Tier | Best For |
|----------|--------|-----------|----------|
| [GitHub Pages](guides/github-pages.md) | Static sites, SPAs | Unlimited | React, Vue, static HTML |
| [Vercel](guides/vercel.md) | Frontend + serverless | Hobby (free) | Next.js, React, Svelte |
| [Render](guides/render.md) | Full-stack apps | 750 hrs/mo | Node.js, Python, Docker |
| [Railway](guides/railway.md) | Full-stack + databases | $5 credit | Any stack |
| [Fly.io](guides/fly-io.md) | Edge computing, Docker | 3 shared VMs | Docker, Go, multi-region |
| [Netlify](guides/netlify.md) | JAMstack, forms | 100 GB/mo | Static, serverless, forms |
| [Cloudflare Pages](guides/cloudflare-pages.md) | Edge-first, full-stack | Unlimited bandwidth | Static, D1, KV, Workers |
| [AWS ECS](guides/aws-ecs.md) | Production containers | 12-month free tier | Enterprise, Fargate |
| [AWS Amplify](guides/aws-amplify.md) | Full-stack serverless | 1000 build min/mo | CI/CD, preview environments |
| [DigitalOcean](guides/digitalocean.md) | VPS + App Platform | $200 credit | Self-hosted, full control |

## Frameworks

| Framework | Covers | Recommended Platform |
|-----------|--------|---------------------|
| [React (Vite)](frameworks/react-vite.md) | SPA deployment | GitHub Pages / Vercel |
| [Next.js](frameworks/nextjs.md) | SSR / SSG / ISR | Vercel |
| [Express.js](frameworks/express.md) | Node.js backend | Render / Railway |
| [FastAPI](frameworks/fastapi.md) | Python backend | Render / Railway |
| [Flask](frameworks/flask.md) | Python backend | Render / Railway |
| [Django](frameworks/django.md) | Python full-stack | Render / Railway |
| [MERN Stack](frameworks/mern.md) | Full-stack (Mongo + Express + React + Node) | Render + GitHub Pages |
| [FARM Stack](frameworks/farm.md) | Full-stack (FastAPI + React + MongoDB) | Render + GitHub Pages |

## Databases

| Database | Guide | Type | Free Tier |
|----------|-------|------|-----------|
| [MongoDB Atlas](guides/mongodb-atlas.md) | Cloud MongoDB | Document (NoSQL) | 512 MB |
| [Neon](guides/neon.md) | Serverless PostgreSQL | Relational | 0.5 GB + 191 compute hrs |
| [Supabase](guides/supabase.md) | Postgres + Auth + Storage + Realtime | BaaS | 500 MB + 50K MAU |
| [Upstash](guides/upstash.md) | Serverless Redis + QStash | Cache / Queue | 10K commands/day |

## Reference Guides

| Guide | Description |
|-------|-------------|
| [Docker](guides/docker.md) | Dockerfiles, multi-stage builds, Compose, production tips |
| [DNS & Custom Domains](guides/dns-domains.md) | A records, CNAME, SSL/HTTPS for every platform |
| [Environment Variables](guides/environment-variables.md) | Best practices, platform setup, build-time vs runtime |
| [CI/CD Templates](guides/ci-cd-templates.md) | 7 copy-paste GitHub Actions workflows |

---

## Quick Decision Tree

```
What are you deploying?
|
+-- Static site / SPA (React, Vue, Astro)
|   +-- Need custom domain? --------> GitHub Pages (free forever)
|   +-- Need serverless functions? --> Vercel or Netlify
|   +-- Need edge performance? ------> Cloudflare Pages
|   +-- Just want it live fast? -----> Vercel (zero config)
|
+-- Backend API (Express, FastAPI, Flask, Django)
|   +-- Free is priority? -----------> Render (sleeps after 15 min)
|   +-- Need always-on? ------------> Railway ($5/mo) or Fly.io
|   +-- Production scale? -----------> AWS ECS or DigitalOcean
|   +-- Need Docker? ----------------> Fly.io or Railway
|
+-- Full-stack (frontend + backend + database)
|   +-- MERN/FARM? -----------------> Render (backend) + GitHub Pages (frontend)
|   +-- Next.js? -------------------> Vercel (all-in-one)
|   +-- Docker? --------------------> Fly.io or Railway
|   +-- Enterprise? ----------------> AWS ECS + CloudFront
|
+-- Database only
|   +-- PostgreSQL -----------------> Neon (serverless, free)
|   +-- MongoDB --------------------> MongoDB Atlas (free 512 MB)
|   +-- Postgres + Auth + Storage --> Supabase (free BaaS)
|   +-- Redis / Caching ------------> Upstash (serverless, free)
|
+-- Not sure? Check the Cost Comparison below
```

## Cost Comparison

### Hosting Platforms

| Platform | Free Tier | Cheapest Paid | Always-On | Custom Domain | Docker |
|----------|-----------|---------------|-----------|---------------|--------|
| GitHub Pages | Unlimited | N/A | Yes | Yes (free SSL) | No |
| Vercel | Hobby (free) | Pro ($20/mo) | Yes | Yes | No |
| Render | 750 hrs/mo | Starter ($7/mo) | Paid only | Yes | Yes |
| Railway | $5 credit | Usage-based | Yes | Yes | Yes |
| Fly.io | 3 shared VMs | ~$2-5/mo | Yes | Yes | Yes |
| Netlify | 100 GB/mo | Pro ($19/mo) | Yes | Yes | No |
| Cloudflare Pages | Unlimited | $20/mo (Workers Paid) | Yes | Yes | No |
| DigitalOcean | $200 credit | $5/mo | Yes | Yes | Yes |
| AWS ECS | 12-month free | ~$30-50/mo | Yes | Yes | Yes |

### Databases

| Database | Free Tier | Cheapest Paid | Type |
|----------|-----------|---------------|------|
| MongoDB Atlas | 512 MB (M0) | M2 ($9/mo) | Document |
| Neon | 0.5 GB + 191 hrs | Launch ($19/mo) | PostgreSQL |
| Supabase | 500 MB + 50K MAU | Pro ($25/mo) | PostgreSQL + BaaS |
| Upstash | 10K cmd/day | Pay-as-you-go | Redis |

## Guide Structure

Every guide follows a consistent format:

```
# Platform/Framework Name
> One-line description

## Prerequisites        (checklist with links)
## Steps 1-N            (numbered, with actual commands)
## Environment Variables (table + platform-specific setup)
## Custom Domain        (DNS records + SSL)
## Free Tier Info       (limits table)
## Troubleshooting      (5+ common issues with cause/fix)
```

## Contributing

Contributions are welcome! Whether it's a new platform guide, framework walkthrough, or fixing a broken command.

1. Fork this repo
2. Create a guide in `guides/` (platform/database) or `frameworks/` (framework)
3. Follow the [guide template](CONTRIBUTING.md#guide-template)
4. Test every command on a fresh project
5. Submit a PR

See [CONTRIBUTING.md](CONTRIBUTING.md) for full guidelines and the template.

## License

[MIT](LICENSE)
