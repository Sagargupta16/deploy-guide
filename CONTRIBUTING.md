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

## Pull Request Process

1. Ensure your guide follows the template above
2. Add your guide to the appropriate table in `README.md`
3. Test all commands on a fresh project
4. Fill out the PR template completely
5. A maintainer will review your PR within a few days

## Code of Conduct

This project follows the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md). By participating, you agree to uphold this code. Report unacceptable behavior to the maintainers.

## Questions?

Open an issue with the **question** label if something is unclear. We're happy to help.
