# Changelog

## [1.3.0] - 2026-10-18

- Add smoke tests that run five guides the way a reader would (`pnpm smoke <test>`): FastAPI, Flask and Django install their pinned requirements and serve under the platform start command (uvicorn or gunicorn) while the test hits every endpoint; React + Vite builds with the GitHub Pages base path and a deep link survives the 404.html redirect; the GitHub Pages encoder and decoder round-trip a deep link. Guide code blocks opt in with an invisible `<!-- smoke: <test> <file> -->` marker, so the tests read the guide text itself
- Fix `frameworks/django.md`, found by the new smoke test: production settings turned on `SECURE_SSL_REDIRECT` without `SECURE_PROXY_SSL_HEADER`, so behind Render's TLS-terminating proxy every request redirected to HTTPS forever. Added the header setting and a troubleshooting entry
- Fix `frameworks/django.md`: the guide never ran `makemigrations`, so `migrate` in `build.sh` created no `core_item` table and every items request returned 500. Added the step, a troubleshooting entry, and `DEBUG=True` on the local `runserver` command (with `DEBUG` unset the dev server redirected to HTTPS)
- Add `pnpm check:snippets`: parses every YAML, JSON, JSONC and TOML block in the guides (73, 26, 12 and 33 blocks today) and runs actionlint with shellcheck over the 24 complete workflow blocks. Quoted the unquoted shell variables it flagged (SC2086) in workflow snippets in `guides/aws-amplify.md`, `guides/aws-ecs.md` and `guides/ci-cd-templates.md`, and marked the Amplify preview workflow as an outline
- Move the Cost Comparison pricing into `data/platforms.yml` with a `verified_on` date per row. `pnpm gen:tables` renders both README tables from it, now with a Verified column and links to each guide; CI fails if they drift
- Add `pnpm check:pins`: compares every `package==x.y.z` pin and `uses: owner/action@vN` in the guides and in this repo's workflows (127 pins, 33 distinct packages and actions today) against PyPI and GitHub releases; `--write` bumps drifted pins in place. Its first run found fastapi 0.144.0, released the same day: bumped from 0.143.5 in six guides and re-ran the FastAPI smoke test
- Add a weekly freshness workflow that opens or updates a `price-check` issue for pricing rows older than 90 days and a `pin-drift` issue for drifted pins
- Add a VitePress docs site built from the same Markdown: local search, a sidebar parsed from the README tables, dark mode, last-updated dates, edit links, client-rendered mermaid diagrams, and phone layouts where tables and mermaid diagrams scroll sideways instead of shrinking (labels stay at 13px or more on a 390px screen). `.github/workflows/docs.yml` publishes it to GitHub Pages; `pnpm screenshots` captures the README showcase images
- Add `guides-ci.yml`: actionlint on the repo's own workflows, snippet and table checks, the site build, and the smoke matrix on every PR and every Monday; a scheduled failure opens a `guide-smoke` issue
- README: replace the ASCII decision tree with a mermaid flowchart (each leaf links to its guide on the docs site), rewrite "How the Guides Stay Accurate" for the new checks, and add a Docs Site section with desktop and phone screenshots
- CONTRIBUTING: document the local checks, the snippet markers and the pricing data file

## [1.2.1] - 2026-10-18

- Fix the GitHub Pages SPA redirect in `guides/github-pages.md` and `frameworks/react-vite.md`: both shipped the `404.html` half of the spa-github-pages pattern without the `index.html` decoder, so a deep link such as `/my-react-app/about` was rewritten to `/my-react-app/?/about` and rendered the home route. Added the decoder script next to each `404.html` sample
- Fix `frameworks/flask.md`: the Option A sample read a bare provider `DATABASE_URL` while only psycopg 3 is installed. It now rewrites `postgresql://` and `postgres://` to `postgresql+psycopg://` in code, matching the env var table and troubleshooting section (#50)
- Correct the SQLAlchemy driver comments in `frameworks/flask.md` and `guides/neon.md`: SQLAlchemy 2.1 defaults `postgresql://` to psycopg 3, 2.0 still maps it to psycopg2. The explicit `+psycopg` rewrite stays because it works on both. The Neon SSL troubleshooting snippet now names the driver too
- Refresh drifted `==` pins: django 6.1.2 (LTS 5.2.18), fastapi 0.143.5, uvicorn 0.54.0, psycopg 3.3.6, pydantic-settings 2.16.0, pymongo 4.19.0, python-dotenv 1.2.4
- README: add a "How the Guides Stay Accurate" section with a diagram of the link-check, refresh and changelog loop

## [1.2.0] - 2026-09-06

- Add `guides/cloudflare-workers.md`: wrangler + static assets, `assets` config, D1/KV bindings, secrets, custom domains vs routes, and a step-by-step Pages-to-Workers migration. Closes the gap where the README decision tree pointed readers at Workers with no guide behind it
- Fix `guides/aws-amplify.md`: the GitHub Actions example ran `ampx pipeline-deploy` before `npm ci`, which cannot work. Rewrote the guide to the CONTRIBUTING template and added Environment Variables, Custom Domain, Free Tier Info and Troubleshooting sections
- Fix `frameworks/sveltekit.md`: the GitHub Pages workflow built on Node 20, EOL since 2026-04-30. Now Node 24
- Switch `frameworks/flask.md` from `psycopg2-binary` to `psycopg[binary]` 3.x, matching what fastapi.md and django.md already recommend
- Bump GitHub Action majors in the workflow examples readers copy: `actions/setup-node@v7`, `actions/setup-python@v7` and `astral-sh/setup-uv@v10` in `guides/ci-cd-templates.md` and six framework guides, plus `actions/checkout@v7` in `frameworks/astro.md`. Pin `superfly/flyctl-actions/setup-flyctl` to `@1.6` instead of the mutable `@master`
- Bump `actions/checkout` to v7 in the repo's own link-check workflow, the last place contradicting what the guides teach
- Refresh drifted `==` pins: fastapi 0.141.1, uvicorn 0.52.4, django 6.1.1 (LTS 5.2.17), gunicorn 26.2.0, psycopg 3.3.5, pydantic-settings 2.15.0, pymongo 4.18.0, python-dotenv 1.2.3
- Refresh version blocks: SvelteKit 2.70.3 / Svelte 5.57.0 / sv 0.17.0, Angular CLI 22.1.7, Turso clients, hcloud v1.67.0
- Add `## Free Tier Info` to vercel.md and github-pages.md, and to the CONTRIBUTING template. Rename the four drifted variants (`## Free Tier`, `## Free Tier Limitations`, `## Free Tier and Billing`, `## Free Tier and Cost`) so all 22 guides that have the section use one heading
- CI: the scheduled link check now files an issue on failure instead of dying silently in the Actions tab
- Expand SECURITY.md with scope, supported versions and a private-advisory channel; drop its `Version: 1` scaffolding line
- Remove leftover scaffolding comments from public metadata: `# v1` from `.github/CODEOWNERS`, `.github/FUNDING.yml` and `.gitattributes`, and an orphan `# Added for consistency` from `.gitignore`

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
