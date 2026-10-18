# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\` (local-only paths, not links -- they live outside this repo):
> - Root `../../CLAUDE.md` -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root `../../MEMORY.md` -- live facts across repos.
> - Root `../../STATUS.md` -- live PR/CI/security dashboard.
> - `../../.claude/resources/` -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project

Community repo of 38 step-by-step deployment guides (13 platforms, 14 frameworks, 6 databases, 5 reference guides) for students and indie devs. MIT, public, accepts external PRs.

## Stack

- **Language**: Markdown guides; Node ESM scripts (`scripts/`) test them
- **Framework**: VitePress 1.x builds the docs site from the same Markdown (`.vitepress/`)
- **Database**: none. Pricing rows live in `data/platforms.yml`
- **Package manager**: pnpm (`packageManager` in package.json); smoke tests also need uv
- **Deploy target**: GitHub Pages via `.github/workflows/docs.yml` (`https://sagargupta.online/deploy-guide/` once Pages is enabled); the guides are also read directly on GitHub

## Run

```
pnpm install
pnpm docs:dev        # http://localhost:5173/deploy-guide/
```

## Test

CI ([guides-ci.yml](.github/workflows/guides-ci.yml), every PR + Monday cron): actionlint on the repo's workflows, `pnpm check:snippets`, `pnpm check:tables`, `pnpm docs:build`, and a smoke matrix (`pnpm smoke <test>` for fastapi, flask, django, react-vite, github-pages). Weekly [freshness.yml](.github/workflows/freshness.yml) files `price-check` / `pin-drift` issues. Link check ([link-check.yml](.github/workflows/link-check.yml)) local equivalent:

```
pnpm check
pnpm smoke django
lychee --no-progress --exclude-all-private --accept 200..=299,403,429 "**/*.md"
```

## Entry points

- `README.md` -- index tables, quick decision tree, cost comparison. The front door.
- `guides/` -- platform, database, and reference guides (24 files)
- `frameworks/` -- framework-specific walkthroughs (14 files)

## Key files

- `CONTRIBUTING.md` -- mandatory guide template (Prerequisites / numbered Steps / Env Vars / Custom Domain / Troubleshooting). Every guide must follow it.
- `README.md` -- tables must stay in sync with files on disk; the docs site sidebar is parsed from its Platforms / Frameworks / Databases / Reference Guides tables. The two Cost Comparison tables are generated between `<!-- generated:... -->` markers.
- `data/platforms.yml` -- pricing source of truth with a `verified_on` per row; `pnpm gen:tables` rewrites the README tables.
- `scripts/smoke/*.mjs` -- one smoke test per guide; guide blocks opt in with `<!-- smoke: <test> <file> -->` above the fence.
- `.lycheeignore` -- regex per line for bot-blocked/flaky URLs (Netlify app, contributor-covenant).
- `CHANGELOG.md` -- versioned; bump on guide batches or refreshes.

## Gotchas

- Adding/renaming a guide requires updating the matching `README.md` table AND the counts line ("38 guides | 13 platforms | ..."), plus the counts in this file. Filenames are lowercase kebab-case matching the table name.
- Platform guides, database guides, and reference guides all live in `guides/`; only framework guides go in `frameworks/`.
- Pricing and free tiers rot fast (full refresh done 2026-07-06, v1.1.0). When touching prices, verify against the live platform page, edit `data/platforms.yml` (bump that row's `verified_on`), then `pnpm gen:tables`. Never hand-edit the generated tables.
- Editing a block that has a `<!-- smoke: ... -->` marker above it: run that smoke test. Moving or removing the marker breaks the test.
- VitePress compiles Markdown as Vue templates: `{{ }}` outside code and bare `<word>` tags in prose break the build. Inline code is already escaped (`v-pre`) by the config.
- lychee fails PRs on dead links; accepts 200-299, 403, 429. If a valid URL blocks bots, add a regex to `.lycheeignore` instead of removing the link.
- `.prettierrc` sets `tabWidth: 3` -- match it, don't normalize.
- CONTRIBUTING rule applies to us too: every command in a guide must be tested on a fresh project before it ships.
