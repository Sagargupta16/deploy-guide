# Security Policy

## Scope

This repository ships documentation only -- Markdown guides, no application code, no dependencies, no published package. The realistic risk here is a guide that tells you to do something insecure: a command that leaks a credential, an example that commits a secret, a workflow that grants more permission than it needs, or an action pinned to a mutable ref. Those are in scope and we want to hear about them.

## Supported Versions

Only the current `main` branch is maintained. Tagged releases are changelog markers, not supported branches -- fixes land on `main` and nothing is backported.

## Reporting

Two options:

- Open a [private security advisory](https://github.com/Sagargupta16/deploy-guide/security/advisories/new) on this repository (preferred).
- Email sg85207@gmail.com.

Please include the file and line, what the guide currently tells a reader to do, and what it should say instead.

Expect an acknowledgement within 7 days. Since a fix here is a documentation edit rather than a release, accepted reports are usually corrected on `main` within a few days of triage.

Do not include real credentials in a report. If a guide made you leak one, rotate it first.
