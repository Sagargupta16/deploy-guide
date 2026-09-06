# Deploy Guide

[![Link Check](https://github.com/Sagargupta16/deploy-guide/actions/workflows/link-check.yml/badge.svg)](https://github.com/Sagargupta16/deploy-guide/actions/workflows/link-check.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Step-by-step deployment guides for every platform and framework. Stop reading docs for hours - deploy in minutes.

Whether you're deploying a React app, a FastAPI backend, or a full-stack MERN project, this repo has a battle-tested guide for it. Every guide includes actual commands, environment variable setup, custom domains, and troubleshooting.

**38 guides** | **13 platforms** | **14 frameworks** | **6 databases** | **5 reference guides**

---

## Platforms

| Platform | Covers | Free Tier | Best For |
|----------|--------|-----------|----------|
| [GitHub Pages](guides/github-pages.md) | Static sites, SPAs | 1 GB site, 100 GB/mo (soft limits) | React, Vue, static HTML |
| [Vercel](guides/vercel.md) | Frontend + serverless | Hobby (free) | Next.js, React, Svelte |
| [Render](guides/render.md) | Full-stack apps | 750 hrs/mo | Node.js, Python, Docker |
| [Railway](guides/railway.md) | Full-stack + databases | One-time $5 trial | Any stack |
| [Fly.io](guides/fly-io.md) | Edge computing, Docker | None (pay-as-you-go) | Docker, Go, multi-region |
| [Netlify](guides/netlify.md) | JAMstack, forms | 300 credits/mo | Static, serverless, forms |
| [Cloudflare Workers](guides/cloudflare-workers.md) | Edge-first, static assets + SSR | 100K Worker req/day (assets free) | New edge projects, D1, KV |
| [Cloudflare Pages](guides/cloudflare-pages.md) | Edge-first, full-stack | Unlimited bandwidth | Static, D1, KV, Workers |
| [AWS ECS](guides/aws-ecs.md) | Production containers | $100-$200 credits (6 months) | Enterprise, Fargate |
| [AWS Amplify](guides/aws-amplify.md) | Full-stack serverless | 1000 build min/mo | CI/CD, preview environments |
| [DigitalOcean](guides/digitalocean.md) | VPS + App Platform | $200 credit (60 days) | Self-hosted, full control |
| [Coolify](guides/coolify.md) | Self-hosted PaaS | Free (bring your own server) | Push-to-deploy on any VPS |
| [Hetzner](guides/hetzner.md) | VPS (EU pricing) | None (from ~EUR 6/mo) | Docker Compose, full control |

## Frameworks

| Framework | Covers | Recommended Platform |
|-----------|--------|---------------------|
| [React (Vite)](frameworks/react-vite.md) | SPA deployment | GitHub Pages / Vercel |
| [Next.js](frameworks/nextjs.md) | SSR / SSG / ISR | Vercel |
| [Astro](frameworks/astro.md) | Static + server output | GitHub Pages / Netlify / Vercel |
| [SvelteKit](frameworks/sveltekit.md) | Adapter-based SSR / static | Vercel / Cloudflare |
| [Angular](frameworks/angular.md) | SPA + SSR deployment | GitHub Pages / Vercel |
| [Express.js](frameworks/express.md) | Node.js backend | Render / Railway |
| [FastAPI](frameworks/fastapi.md) | Python backend | Render / Railway |
| [Flask](frameworks/flask.md) | Python backend | Render / Railway |
| [Django](frameworks/django.md) | Python full-stack | Render / Railway |
| [NestJS](frameworks/nestjs.md) | Node.js backend (TypeScript) | Render / Railway |
| [Ruby on Rails](frameworks/rails.md) | Ruby full-stack | Render / Railway |
| [Go (Gin)](frameworks/go-gin.md) | Go backend | Railway / Render |
| [MERN Stack](frameworks/mern.md) | Full-stack (Mongo + Express + React + Node) | Render + GitHub Pages |
| [FARM Stack](frameworks/farm.md) | Full-stack (FastAPI + React + MongoDB) | Render + GitHub Pages |

## Databases

| Database | Guide | Type | Free Tier |
|----------|-------|------|-----------|
| [MongoDB Atlas](guides/mongodb-atlas.md) | Cloud MongoDB | Document (NoSQL) | 512 MB |
| [Neon](guides/neon.md) | Serverless PostgreSQL | Relational | 0.5 GB + 100 CU-hrs per project |
| [Supabase](guides/supabase.md) | Postgres + Auth + Storage + Realtime | BaaS | 500 MB + 50K MAU |
| [Upstash](guides/upstash.md) | Serverless Redis + QStash | Cache / Queue | 500K commands/mo |
| [Turso](guides/turso.md) | Edge SQLite (libSQL) | Relational (SQLite) | 100 DBs + 5 GB |
| [CockroachDB](guides/cockroachdb.md) | Distributed SQL (Postgres-compatible) | Relational | $15/mo credit (10 GiB + 50M RUs) |

## Reference Guides

| Guide | Description |
|-------|-------------|
| [Docker](guides/docker.md) | Dockerfiles, multi-stage builds, Compose, production tips |
| [DNS & Custom Domains](guides/dns-domains.md) | A records, CNAME, SSL/HTTPS for every platform |
| [Environment Variables](guides/environment-variables.md) | Best practices, platform setup, build-time vs runtime |
| [CI/CD Templates](guides/ci-cd-templates.md) | 7 copy-paste GitHub Actions workflows |
| [Monitoring & Logging](guides/monitoring.md) | Free-tier uptime, logs, error tracking, cron alerting |

---

## Quick Decision Tree

```
What are you deploying?
|
+-- Static site / SPA (React, Vue, Astro)
|   +-- Need custom domain? --------> GitHub Pages (free forever)
|   +-- Need serverless functions? --> Vercel or Netlify
|   +-- Need edge performance? ------> Cloudflare Workers (Pages still works)
|                                      guides/cloudflare-workers.md
|   +-- Just want it live fast? -----> Vercel (zero config)
|
+-- Backend API (Express, FastAPI, Flask, Django)
|   +-- Free is priority? -----------> Render (sleeps after 15 min)
|   +-- Need always-on? ------------> Railway ($5/mo) or Fly.io (pay-as-you-go)
|   +-- Production scale? -----------> AWS ECS or DigitalOcean
|   +-- Need Docker? ----------------> Fly.io or Railway
|   +-- Own server / no fees? -------> Coolify on Hetzner
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
|   +-- SQLite at the edge ---------> Turso (free 100 DBs)
|
+-- Not sure? Check the Cost Comparison below
```

## Cost Comparison

*Prices last verified: 2026-09-06.* GitHub Pages, Vercel, Render, Railway, Netlify, AWS Amplify, Neon, Supabase, Upstash and Turso were re-checked against vendor pages on that date. Fly.io, Cloudflare, DigitalOcean, AWS ECS, Coolify, Hetzner, MongoDB Atlas and CockroachDB were last fully swept 2026-07-06.

### Hosting Platforms

| Platform | Free Tier | Cheapest Paid | Always-On | Custom Domain | Docker |
|----------|-----------|---------------|-----------|---------------|--------|
| GitHub Pages | 1 GB site, 100 GB/mo (soft) | N/A | Yes | Yes (free SSL) | No |
| Vercel | Hobby: 100 GB transfer, 1M invocations, 4 active-CPU hrs/mo | Pro ($20/user/mo) | Yes | Yes | No |
| Render | 750 hrs/mo | Starter ($7/mo) | Paid only | Yes | Yes |
| Railway | One-time $5 trial, then $1/mo credit | Hobby ($5/mo) | Yes (while credits last) | Yes | Yes |
| Fly.io | None (pay-as-you-go, card required) | ~$2/mo (shared-cpu-1x 256MB) | Yes | Yes | Yes |
| Netlify | 300 credits/mo (~15 GB bandwidth) | Personal ($9/mo) | Yes (until credits run out) | Yes | No |
| Cloudflare Workers | 100K Worker req/day; static asset requests free and unlimited | $5/mo (Workers Paid) | Yes | Yes | No |
| Cloudflare Pages | Unlimited bandwidth, 500 builds/mo | $5/mo (Workers Paid) | Yes | Yes | No |
| DigitalOcean | 3 static-site apps + $200/60-day credit | $4/mo (droplet), $5/mo (container) | Yes | Yes | Yes |
| AWS ECS | $100-$200 credits, 6-month Free plan | ~$48/mo (2 Fargate tasks + ALB) | Yes | Yes | Yes |
| Coolify | Free self-hosted (bring a VPS) | Coolify Cloud ($5/mo) | Yes | Yes | Yes |
| Hetzner | None | ~EUR 6/mo (CX23 + IPv4) | Yes | Yes | Yes |

### Databases

| Database | Free Tier | Cheapest Paid | Type |
|----------|-----------|---------------|------|
| MongoDB Atlas | 512 MB (Free cluster, M0) | Flex ($8-$30/mo, usage-capped) | Document |
| Neon | 0.5 GB + 100 CU-hrs per project | Launch (pay-as-you-go, $0.106/CU-hr) | PostgreSQL |
| Supabase | 500 MB + 50K MAU | Pro ($25/mo) | PostgreSQL + BaaS |
| Upstash | 500K cmd/mo | Pay-as-you-go ($0.20/100K cmds) | Redis |
| Turso | 100 DBs + 5 GB | Developer ($4.99/mo) | SQLite (libSQL) |
| CockroachDB | $15/mo credit (10 GiB + 50M RUs) | Usage beyond free credit | Distributed SQL |

## Guide Structure

Platform, database, and framework guides follow a consistent format:

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

The five reference guides (Docker, DNS & Custom Domains, Environment Variables, CI/CD Templates, Monitoring & Logging) are intentional exceptions -- they document a technique that spans hosts rather than a single platform, so sections like Custom Domain and Free Tier Info do not apply to them.

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
