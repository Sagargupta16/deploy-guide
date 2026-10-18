# Contributing to Deploy Guide

Thanks for your interest in contributing! This project thrives on community-submitted deployment guides. Whether you're fixing a typo or adding an entirely new platform, your help is appreciated.

## How to Contribute

1. **Fork** this repository
2. **Create a branch** for your contribution: `git checkout -b add-platform-name`
3. **Write your guide** following the template below
4. **Test every command** in your guide on a fresh project before submitting
5. **Submit a Pull Request** using the PR template

## What We're Looking For

- **New platform guides** (`guides/`) -- deployment platforms not yet covered
- **New framework guides** (`frameworks/`) -- framework-specific deployment walkthroughs
- **Improvements** to existing guides -- updated commands, better explanations, new troubleshooting tips
- **Bug fixes** -- broken links, outdated URLs, incorrect commands

## Writing Guidelines

- **Be practical.** Show actual commands, not vague descriptions.
- **Be concise.** Developers want to deploy fast, not read a novel.
- **Test everything.** Every command in your guide should work when run in order.
- **Use consistent formatting.** Follow the template below exactly.
- **Include free tier info.** Most readers are students or indie developers.
- **Add troubleshooting.** Think about what went wrong for *you* the first time.

## Guide Template

Every guide (platform or framework) must follow this structure. Copy this template and fill it in.

```markdown
# Platform/Framework Name

> One-line description of what this guide covers.

## Prerequisites

- [ ] Prerequisite 1 (with link to install/signup)
- [ ] Prerequisite 2
- [ ] Prerequisite 3

## Step 1: Title

Description of what this step does.

\```bash
actual-command --with-flags
\```

## Step 2: Title

Continue with numbered steps...

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `VAR_NAME` | What it does | `example-value` |

How to set environment variables on this platform:

\```bash
command to set env vars
\```

## Custom Domain

1. Step-by-step instructions for custom domain setup
2. Include DNS configuration
3. Include SSL/HTTPS info

## Free Tier Info

| Feature | Free Tier | Cheapest Paid |
|---------|-----------|---------------|
| **Limit name** | Free value | Paid value |

Key things to know:

- The one constraint that actually bites on the free tier
- What happens when you exceed it (throttle, sleep, suspend, bill)

## Troubleshooting

### Problem: Description of common problem

**Cause:** Why it happens.

**Fix:**

\```bash
command to fix it
\```

### Problem: Another common issue

**Cause:** Explanation.

**Fix:** Solution.
```

## File Placement

- Platform guides go in `guides/` (e.g., `guides/railway.md`)
- Framework guides go in `frameworks/` (e.g., `frameworks/django.md`)
- Database guides go in `guides/` (e.g., `guides/supabase.md`)

## Naming Conventions

- Use lowercase kebab-case for filenames: `github-pages.md`, `react-vite.md`
- Match the name used in `README.md` tables

## Checks

The guides are Markdown, but CI tests them like code. Install the tooling once with [pnpm](https://pnpm.io/) (Node 22.12+), then run the same checks locally:

```bash
pnpm install
pnpm check              # parse YAML/JSON/TOML blocks, lint workflow blocks, README tables vs data
pnpm smoke --list       # smoke tests: fastapi, flask, django, react-vite, github-pages
pnpm smoke django       # run one (Python tests need uv: https://docs.astral.sh/uv/)
pnpm docs:dev           # preview the docs site at http://localhost:5173/deploy-guide/
```

`pnpm check:snippets` runs actionlint on workflow blocks when `actionlint` is on your PATH; CI always does.

### Snippet markers

Two invisible HTML comments on the line above a code fence tell the checks how to treat it:

- `<!-- smoke: <test> <file> -->` -- the smoke test `<test>` writes this block to `<file>` (or runs it with bash, if the test calls `runBlock`). If you edit a marked block, run that smoke test. The steps between the blocks live in [scripts/smoke/](scripts/smoke/).
- `<!-- snippet: outline -->` -- a workflow that is deliberately a sketch (comments where the steps go). It must still parse as YAML, but actionlint skips it.

### Prices

Pricing in the README Cost Comparison tables comes from [data/platforms.yml](data/platforms.yml). Edit the row, set `verified_on` to the day you checked the vendor's pricing page, and run `pnpm gen:tables`. Do not edit the generated tables by hand: CI fails if they differ from the data file.

## Pull Request Process

1. Ensure your guide follows the template above
2. Add your guide to the appropriate table in `README.md` (the docs site sidebar is built from those tables)
3. Test all commands on a fresh project
4. Run `pnpm check`, plus `pnpm smoke <test>` if you changed a smoke-tested guide
5. Fill out the PR template completely
6. A maintainer will review your PR within a few days

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Report unacceptable behavior to the maintainers.

## Questions?

Open an issue with the **question** label if something is unclear. We're happy to help.
