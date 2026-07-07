# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project

Community repo of 37 step-by-step deployment guides (12 platforms, 14 frameworks, 6 databases, 5 reference guides) for students and indie devs. MIT, public, accepts external PRs.

## Stack

- **Language**: Markdown only -- no application code
- **Framework**: none
- **Database**: none
- **Package manager**: none
- **Deploy target**: none -- content consumed directly on GitHub from `main`

## Run

```
No build, no dev server. Edit .md files directly.
```

## Test

No test suite. CI is a lychee link check ([.github/workflows/link-check.yml](.github/workflows/link-check.yml)) on every PR plus a weekly Monday cron. Local equivalent:

```
lychee --no-progress --exclude-all-private --accept 200..=299,403,429 "**/*.md"
```

## Entry points

- `README.md` -- index tables, quick decision tree, cost comparison. The front door.
- `guides/` -- platform, database, and reference guides (23 files)
- `frameworks/` -- framework-specific walkthroughs (14 files)

## Key files

- `CONTRIBUTING.md` -- mandatory guide template (Prerequisites / numbered Steps / Env Vars / Custom Domain / Troubleshooting). Every guide must follow it.
- `README.md` -- tables must stay in sync with files on disk; carries the "Prices last verified: YYYY-MM-DD" line.
- `.lycheeignore` -- regex per line for bot-blocked/flaky URLs (Netlify app, contributor-covenant).
- `CHANGELOG.md` -- versioned; bump on guide batches or refreshes.

## Gotchas

- Adding/renaming a guide requires updating the matching `README.md` table AND the counts line ("37 guides | 12 platforms | ..."). Filenames are lowercase kebab-case matching the table name.
- Platform guides, database guides, and reference guides all live in `guides/`; only framework guides go in `frameworks/`.
- Pricing and free tiers rot fast (full refresh done 2026-07-06, v1.1.0). When touching prices, verify against the live platform page and update the "Prices last verified" date in `README.md`.
- lychee fails PRs on dead links; accepts 200-299, 403, 429. If a valid URL blocks bots, add a regex to `.lycheeignore` instead of removing the link.
- `.prettierrc` sets `tabWidth: 3` -- match it, don't normalize.
- CONTRIBUTING rule applies to us too: every command in a guide must be tested on a fresh project before it ships.
