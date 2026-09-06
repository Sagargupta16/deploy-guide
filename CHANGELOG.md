# Changelog

## [1.2.0] - 2026-09-06

- Add `guides/cloudflare-workers.md`: wrangler + static assets, `assets` config, D1/KV bindings, secrets, custom domains vs routes, and a step-by-step Pages-to-Workers migration. Closes the gap where the README decision tree pointed readers at Workers with no guide behind it
- Fix `guides/aws-amplify.md`: the GitHub Actions example ran `ampx pipeline-deploy` before `npm ci`, which cannot work. Rewrote the guide to the CONTRIBUTING template and added Environment Variables, Custom Domain, Free Tier and Troubleshooting sections
- Fix `frameworks/sveltekit.md`: the GitHub Pages workflow built on Node 20, EOL since 2026-04-30. Now Node 24
- Switch `frameworks/flask.md` from `psycopg2-binary` to `psycopg[binary]` 3.x, matching what fastapi.md and django.md already recommend
- Bump GitHub Action majors: `actions/setup-node@v7`, `actions/setup-python@v7`, `astral-sh/setup-uv@v10`, `actions/checkout@v7` in the repo's own workflow. Pin `superfly/flyctl-actions/setup-flyctl` to `@1.6` instead of the mutable `@master`
- Refresh drifted `==` pins: fastapi 0.141.1, uvicorn 0.52.4, django 6.1.1 (LTS 5.2.17), gunicorn 26.2.0, psycopg 3.3.5, pydantic-settings 2.15.0, pymongo 4.18.0, python-dotenv 1.2.3
- Refresh version blocks: SvelteKit 2.70.3 / Svelte 5.57.0 / sv 0.17.0, Angular CLI 22.1.7, Turso clients, hcloud v1.67.0
- Add `## Free Tier Info` to vercel.md and github-pages.md, and to the CONTRIBUTING template
- CI: the scheduled link check now files an issue on failure instead of dying silently in the Actions tab
- Expand SECURITY.md; remove leftover `# v1` scaffolding markers from CODEOWNERS, FUNDING.yml, .gitattributes and .gitignore

## [1.1.0] - 2026-07-06

- Add 11 new guides: SvelteKit, Astro, Angular, NestJS, Go (Gin), Ruby on Rails, Turso, CockroachDB, Hetzner Cloud, Coolify, Monitoring & Logging
- Refresh all 26 existing guides against live platform state (prices, free tiers, CLI commands, dashboard steps, links)
- Free tier corrections: Fly.io (no free tier, pay-as-you-go), AWS (credits-based plan since July 2025), Netlify (credit-based plans), Upstash (500K commands/mo), Neon (100 CU-hrs), Railway (one-time trial), MongoDB Atlas (Flex replaces M2/M5)
- Version bumps everywhere: Node 22/24, Python 3.12+, Express 5, FastAPI 0.139, actions/checkout@v7, node:24-alpine
- README tables, decision tree, and cost comparison rebuilt from refreshed guides
- CI: lychee link checker on every PR + weekly schedule; junk config files removed

## [1.0.0] - 2026-03-16

- Add PR template for deployment guide contributions
- Fix username in issue template, add .gitignore

## [0.1.0] - 2026-03-04

- Initial release: 25+ deployment guides
- Platforms: GitHub Pages, Vercel, Render, AWS ECS, Railway, Fly.io, Netlify, DigitalOcean, Cloudflare Pages, Docker, Supabase, Upstash
- Frameworks: Django, Flask, FARM, DNS, CI/CD templates
