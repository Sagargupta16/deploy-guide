# Monitoring & Logging

> Free-tier uptime monitoring, log management, error tracking, and cron alerting for small deployed apps.

A deployed app you cannot observe is a deployed app you find out is broken from a user. This guide covers the current free tiers (verified 2026-07-06) of the most useful monitoring tools for hobby and indie projects: UptimeRobot, Better Stack, Sentry, Axiom, Grafana Cloud, and healthchecks.io, plus what Render, Railway, and Vercel give you natively. Every free tier here works without a credit card.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Picking Your Stack](#picking-your-stack)
- [Uptime Monitoring: UptimeRobot](#uptime-monitoring-uptimerobot)
- [Uptime and Logs: Better Stack](#uptime-and-logs-better-stack)
- [Error Tracking: Sentry](#error-tracking-sentry)
- [Log Management: Axiom](#log-management-axiom)
- [Metrics and Dashboards: Grafana Cloud](#metrics-and-dashboards-grafana-cloud)
- [Cron Monitoring: healthchecks.io](#cron-monitoring-healthchecksio)
- [Platform-Native Logs: Render, Railway, Vercel](#platform-native-logs-render-railway-vercel)
- [Alerting: Email, Slack, Discord Webhooks](#alerting-email-slack-discord-webhooks)
- [Environment Variables](#environment-variables)
- [Free Tier Info](#free-tier-info)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- [ ] A deployed app with a public URL ([Render](https://render.com/), [Railway](https://railway.com/), [Vercel](https://vercel.com/), or similar)
- [ ] A health endpoint (e.g. `GET /health` returning HTTP 200) -- uptime monitors need something cheap to hit
- [ ] [curl](https://curl.se/) installed locally (for testing ingest endpoints and webhooks)
- [ ] Accounts on the tools you pick (each section links to signup; all free tiers below need no credit card)

---

## Picking Your Stack

You do not need all six tools. A typical free setup for a small app:

| Need | Tool | Why |
|------|------|-----|
| "Is my site up?" | UptimeRobot | 50 monitors free, dead simple |
| "Did my nightly cron run?" | healthchecks.io | Purpose-built, 20 jobs free |
| "What exception just hit production?" | Sentry | 5,000 errors/month free, stack traces + source maps |
| "What did the app log yesterday?" | Axiom | 500 GB/month free ingest, 30-day retention |
| Uptime + logs in one dashboard | Better Stack | 10 monitors at 30s checks + 3 GB logs free |
| Metrics, dashboards, the full stack | Grafana Cloud | 10k metric series + 50 GB logs free |

Platform-native logs (Render/Railway/Vercel) are your first stop for live debugging, but their free retention is short (1 hour to 7 days). Ship anything you care about to an external tool.

---

## Uptime Monitoring: UptimeRobot

[UptimeRobot](https://uptimerobot.com/) pings your URL on a schedule and alerts you when it stops responding. The free plan gives 50 monitors at a 5-minute interval.

### Step 1: Create an HTTP monitor

1. Sign up at [uptimerobot.com](https://uptimerobot.com/) (free, no card).
2. Dashboard > **New Monitor** > type **HTTP(s)**.
3. URL: your health endpoint, e.g. `https://my-api.onrender.com/health`.
4. Interval: 5 minutes (the free-plan minimum).
5. Attach an alert contact (email is preconfigured; more integrations below).

### Step 2: Add a heartbeat monitor for cron jobs

Heartbeat monitoring inverts the check: UptimeRobot gives you a unique ping URL, your cron job hits it, and if pings stop arriving the monitor is marked down. Heartbeat monitors count within the 50 free monitors.

```bash
# End of your cron job -- only pings on success
0 3 * * * /usr/local/bin/backup.sh && curl -fsS https://heartbeat.uptimerobot.com/m794yyyyyyyy-xxxxxxxxxxxxxxx
```

`wget -q -O /dev/null <url>` works too if curl is not installed.

### Step 3: Wire up alert channels

Free integrations include Email, Slack, Discord, Telegram, Webhooks, Microsoft Teams, Google Chat, PagerDuty, Zapier, Mattermost, Pushbullet, and Pushover. SMS and voice calls are available via purchasable credits. Configure under **Integrations & API** > add the channel, then attach it to each monitor.

### Free tier and pricing

| Plan | Price | Monitors | Interval | Extras |
|------|-------|----------|----------|--------|
| Free | $0 | 50 | 5 min | 1 basic status page, 3 months data retention |
| Solo | $84/year | -- | 60s | -- |
| Team | $348/year | 100 | 60s | -- |
| Enterprise | $648+/year | more | 30s | -- |

Annual billing saves about 20% versus monthly.

---

## Uptime and Logs: Better Stack

[Better Stack](https://betterstack.com/) combines uptime monitoring, log management, and incident alerting. The free tier is generous on check frequency: 30-second intervals, versus UptimeRobot's 5 minutes.

### Step 1: Create an uptime monitor

1. Sign up at [betterstack.com](https://betterstack.com/) (free).
2. **Uptime** > **Monitors** > **Create monitor** > enter your health URL.
3. Set check frequency (down to 30 seconds on the free tier).

### Step 2: Ship logs to a source

Create a source under **Telemetry** > **Sources** > **Connect source**. Grab the token from **Sources** > your source > **Configure** > **Basic information**, then POST JSON to your source's ingesting host:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SOURCE_TOKEN" \
  -d '{"dt":"2026-07-06 12:00:00 UTC","message":"Hello from Better Stack!"}' \
  "https://$INGESTING_HOST"
```

In production you would use their SDK or a log drain rather than raw curl, but this one-liner proves the pipeline works. Free tier: 3 GB/month of logs, retained 3 days.

### Step 3: Add a heartbeat monitor for cron jobs

**Uptime** > **Heartbeats** > **Create heartbeat**. Your script pings the heartbeat URL; an incident triggers if no heartbeat arrives within the configured frequency plus grace period.

```bash
# Success ping
curl "https://uptime.betterstack.com/api/v1/heartbeat/<HEARTBEAT_TOKEN>"

# Report failure explicitly
curl "https://uptime.betterstack.com/api/v1/heartbeat/<HEARTBEAT_TOKEN>/fail"

# Or report the shell exit code of the previous command
/usr/local/bin/backup.sh
curl "https://uptime.betterstack.com/api/v1/heartbeat/<HEARTBEAT_TOKEN>/$?"
```

A new heartbeat stays **Pending** until the first ping arrives, so trigger your job once manually after creating it.

### Free tier and pricing

| Resource | Free tier |
|----------|-----------|
| Uptime monitors | 10, up to 30-second check frequency |
| Logs | 3 GB/month, 3-day retention |
| Traces | 3 GB, 3-day retention |
| Metrics | 30 GB |
| Exceptions | 100,000/month |
| Session replays | 5,000 |

Paid Responder plan: $34/month ($29/month billed yearly).

---

## Error Tracking: Sentry

[Sentry](https://sentry.io/) captures unhandled exceptions with stack traces, breadcrumbs, and release tracking. The free Developer plan covers 5,000 errors/month, which is plenty for a small app.

### Step 1: Install the SDK (Node.js)

Requires Node >= 18.0.0 (>= 18.19.0 recommended). Current version: @sentry/node 10.63.0.

```bash
npm install @sentry/node
```

### Step 2: Initialize before anything else

Create `instrument.js` and make sure it loads before any other module:

```javascript
// instrument.js
const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://<key>@o<orgId>.ingest.sentry.io/<projectId>",
  tracesSampleRate: 1.0,
});
```

```bash
# Load it first via --require so no app code runs uninstrumented
node --require ./instrument.js app.js
```

The DSN is on your project's **Settings** > **Client Keys (DSN)** page. Test it by throwing an error and checking the Issues feed.

### Step 3: Upload source maps (optional but worth it)

Minified stack traces are useless. The wizard configures source map upload for your bundler:

```bash
npx @sentry/wizard@latest -i sourcemaps
```

### Step 4: Monitor a cron job with Sentry Crons

The free plan includes 1 cron monitor. Create it under **Crons**, then check in over HTTP:

```bash
SENTRY_CRONS="https://o<orgId>.ingest.sentry.io/api/<projectId>/cron/<monitor_slug>/<public-key>/"

curl "${SENTRY_CRONS}?status=in_progress"
if /usr/local/bin/backup.sh; then
  curl "${SENTRY_CRONS}?status=ok"
else
  curl "${SENTRY_CRONS}?status=error"
fi
```

Optional query params: `environment=` and `check_in_id=`.

### Step 5: Stay under quota

Events and attachments that exceed your quota are not accepted -- they are dropped, not billed. Volume-reduction options in order of ease: spike protection, per-project rate limiting, inbound filters, SDK sampling (`tracesSampleRate` below 1.0), and `beforeSend` callback filtering:

```javascript
Sentry.init({
  dsn: "...",
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Drop noisy, known-harmless errors before they count against quota
    if (event.exception?.values?.[0]?.type === "AbortError") return null;
    return event;
  },
});
```

### Free tier and pricing

| Resource | Developer (free) |
|----------|------------------|
| Errors | 5,000/month |
| Spans | 5M |
| Session replays | 50 |
| Cron monitors | 1 |
| Uptime monitors | 1 |
| Users | 1 |
| Retention | 30 days |

Paid: Team $26/month, Business $80/month (billed annually).

---

## Log Management: Axiom

[Axiom](https://axiom.co/) is the volume king of free log tiers: 500 GB/month ingest with 30-day retention on the Personal plan. If your platform's log retention is too short (looking at you, Vercel Hobby), ship logs here.

### Step 1: Create a dataset and API token

1. Sign up at [axiom.co](https://axiom.co/) (Personal plan, free).
2. Create a dataset (Personal plan allows 3).
3. **Settings** > **API tokens** > create a token with ingest permission for that dataset.

### Step 2: Ingest events

```bash
curl -X POST "https://api.axiom.co/v1/datasets/my-app-logs/ingest" \
  -H "Authorization: Bearer $AXIOM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"level":"error","message":"payment failed","user_id":"u_123"}]'
```

For newline-delimited JSON, an alternate documented path form is `/v1/ingest/DATASET_NAME` with `Content-Type: application/x-ndjson`.

### Step 3: Know the limits

- Max 10,000 events per batch
- Max field size 1 MB, max field name 200 bytes
- Personal plan datasets are capped at 256 fields each -- events exceeding the field limit are rejected with an error
- The 500 GB/month ingest cap is a hard ceiling; heavy senders may be temporarily rate-restricted

Flatten your log structure and avoid dynamic field names (e.g. do not use user IDs as JSON keys) or you will burn through the 256-field cap fast.

### Free tier and pricing

| Resource | Personal (free) |
|----------|-----------------|
| Ingest | 500 GB/month (hard cap) |
| Retention | 30 days maximum |
| Datasets | 3 |
| Users | 1 |
| Monitors | 3 |

Paid Axiom Cloud: usage-based with a $25/month platform fee ($0.06-$0.12/GB loading, $0.030/GB compressed storage), plus always-free allowances of 1,000 GB loading and 100 GB storage.

---

## Metrics and Dashboards: Grafana Cloud

[Grafana Cloud](https://grafana.com/) bundles Grafana dashboards, Prometheus-compatible metrics (Mimir), logs (Loki), traces (Tempo), and synthetic monitoring in one free stack. Heaviest to set up, most capable once running.

### Step 1: Create a free stack

Sign up at [grafana.com](https://grafana.com/) -- the Free tier needs no credit card. You get a hosted Grafana instance plus endpoints for metrics, logs, and traces.

### Step 2: Push a log line to Loki

Find your Loki endpoint, User ID, and API token under your stack's Loki data source settings. Loki timestamps are unix epoch in nanoseconds:

```bash
curl -u "$LOKI_USER_ID:$GRAFANA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X POST "https://<loki-host>/loki/api/v1/push" \
  -d '{
    "streams": [{
      "stream": { "app": "my-api", "level": "error" },
      "values": [[ "'"$(date +%s%N)"'", "payment failed for user u_123" ]]
    }]
  }'
```

Query it back in Grafana > Explore with `{app="my-api"}`.

### Step 3: Use synthetic monitoring as your uptime checker

The free tier includes 100k synthetic API test executions and 10k browser test executions per month -- enough to health-check a handful of endpoints every few minutes from multiple regions, replacing a separate uptime tool if you are already invested in Grafana.

### Free tier and pricing

| Resource | Free tier |
|----------|-----------|
| Metrics | 10k active series, 14-day retention |
| Logs | 50 GB/month, 14-day retention |
| Traces | 50 GB/month, 14-day retention |
| Profiles | 50 GB/month, 14-day retention |
| Grafana users | 3 active |
| IRM/OnCall users | 3 |
| Synthetic tests | 100k API + 10k browser executions/month |
| k6 load testing | 500 virtual user hours/month |

Paid Pro: $19/month platform fee plus usage (e.g. logs $0.05/GB process + $0.40/GB write + $0.10/GB retain; metrics $6.50 per 1k series past the allowance).

---

## Cron Monitoring: healthchecks.io

[healthchecks.io](https://healthchecks.io/) does one thing: dead-man's-switch monitoring for scheduled jobs. If your backup script stops pinging, you get an alert. Free Hobbyist plan monitors 20 jobs.

### Step 1: Create a check

1. Sign up at [healthchecks.io](https://healthchecks.io/) (free).
2. **Add Check**, set the schedule (simple period or a cron expression matching your job).
3. Set the **grace time** -- the extra wait after the expected time before alerting. Size it to absorb your job's normal runtime variance.

### Step 2: Ping from your job

Two URL formats: `https://hc-ping.com/<uuid>` or slug-based `https://hc-ping.com/<project-ping-key>/<name-slug>`. Treat UUIDs and ping keys as secrets -- anyone holding them can fake your pings.

```bash
# Minimal: success ping at the end of the job
0 3 * * * /usr/local/bin/backup.sh && curl -fsS -m 10 --retry 3 https://hc-ping.com/<uuid>
```

```bash
# Full pattern: signal start, then report the exit code
#!/bin/sh
curl -fsS -m 10 --retry 3 "https://hc-ping.com/<uuid>/start"
/usr/local/bin/backup.sh
curl -fsS -m 10 --retry 3 "https://hc-ping.com/<uuid>/$?"
```

`/start` enables runtime measurement, `/fail` signals explicit failure, `/<exitcode>` reports the exit status (0 = success, anything else = failure).

### Step 3: Understand the states

Checks move through **New** > **Up** > **Late** > **Down** (plus **Paused**). A check goes Late when overdue and Down -- which is when alerts fire -- only after the grace time is exceeded. Alerting supports email, webhooks, SMS, Slack, PagerDuty, and more.

### Free tier and pricing

| Plan | Price | Jobs | Log entries/job | Extras |
|------|-------|------|-----------------|--------|
| Hobbyist | $0/month | 20 | 100 | -- |
| Supporter | $5/month | 20 | 100 | identical limits to free |
| Business | $20/month | 100 | 1,000 | 50 SMS/WhatsApp + 20 call credits |
| Business Plus | $80/month | 1,000 | -- | -- |

Qualifying open-source projects can request free plan upgrades.

---

## Platform-Native Logs: Render, Railway, Vercel

Your platform's built-in logs are the first thing you check, and the first thing that silently expires. Know the retention windows.

### Render

| Workspace plan | Log retention |
|----------------|---------------|
| Hobby | 7 days |
| Pro | 14 days |
| Scale / Enterprise | 30 days |

Logs older than the current retention period are gone even if you upgrade later. The dashboard Logs page supports text search and filters (level, instance, method, status_code, host, path). HTTP request logs require a Pro workspace or higher.

CLI access:

```bash
brew install render-oss/render/render
# or download a binary from https://github.com/render-oss/cli/releases/

render login    # opens browser, saves a token
render services # pick a service, then view and filter live logs interactively
```

Free-tier gotcha for uptime monitors: free web services spin down after 15 minutes without inbound traffic (HTTP or WebSocket) and take about one minute to spin up. Each workspace gets 750 free instance hours/month; spun-down services do not consume hours. While spun down, Render still answers `robots.txt` without waking the service, which can confuse some monitoring systems. See [Troubleshooting](#troubleshooting).

### Railway

| Plan | Log retention |
|------|---------------|
| Hobby / Trial | 7 days |
| Pro | 30 days |
| Enterprise | up to 90 days |

```bash
railway logs   # view deployment logs
```

Hard limit on all plans: 500 log lines per second per replica. Excess lines are dropped with a warning showing the drop count.

### Vercel

| Plan | Runtime log retention |
|------|-----------------------|
| Hobby | 1 hour |
| Pro | 1 day |
| Pro + Observability Plus | 30 days |
| Enterprise | 3 days |
| Enterprise + Observability Plus | 30 days |

Per-request limits: 256 log lines, 256 KB per line, 1 MB total per request. View logs via the project sidebar **Logs** tab with filters (level, route, host, status code, environment, branch).

**Drains** (forwarding logs/traces to external services like Axiom or Better Stack) are Pro and Enterprise only -- Hobby users must upgrade. Drain volume is billed at $0.50/GB on Pro. Supported data types: logs, traces, speed insights, web analytics, and audit logs (audit logs Enterprise-only). On Hobby, the workaround is shipping logs from inside your function code at write time (see Troubleshooting).

---

## Alerting: Email, Slack, Discord Webhooks

Every tool above supports email out of the box. For team channels, wire up a webhook once and reuse it everywhere.

### Slack incoming webhook

1. Create a Slack app at [api.slack.com/apps](https://api.slack.com/apps).
2. Enable **Incoming Webhooks**, then **Add New Webhook to Workspace** and pick a channel.
3. You get one URL per workspace+channel pair, format `hooks.slack.com/services/<team-id>/<channel-id>/<token>`.

```bash
curl -X POST -H "Content-type: application/json" \
  -d '{"text":"Alert: my-api /health returned 500."}' \
  "$SLACK_WEBHOOK_URL"
```

Success returns HTTP 200 with body `ok`. Webhook URLs are secrets, and they cannot override channel, username, or icon -- one URL, one destination.

### Discord webhook

Channel settings > **Integrations** > **Webhooks** > **New Webhook** > copy URL.

```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"content":"Alert: my-api /health returned 500."}' \
  "https://discord.com/api/webhooks/<webhook.id>/<webhook.token>"
```

- `content` max 2,000 characters, up to 10 embeds per message
- Append `?wait=true` to get the created message back in the response
- **Slack-compat trick:** Discord exposes `/webhooks/<id>/<token>/slack` and `/webhooks/<id>/<token>/github` endpoints. If a monitoring tool only offers a "Slack" integration, paste your Discord webhook URL with `/slack` appended and it just works.

### Which channel from which tool

| Tool | Email | Slack | Discord | Webhook | SMS/Voice |
|------|-------|-------|---------|---------|-----------|
| UptimeRobot | yes | yes | yes | yes | paid credits |
| Better Stack | yes | yes | via generic webhook | yes | on paid plans |
| Sentry | yes | yes | via webhook | yes | no |
| Grafana Cloud | yes | yes | yes | yes | via OnCall |
| healthchecks.io | yes | yes | via Slack-compat URL | yes | Business plan credits |

---

## Environment Variables

Secrets used in this guide. Set them on your platform per the [Environment Variables guide](./environment-variables.md) -- never commit them.

| Variable | Description | Example |
|----------|-------------|---------|
| `SENTRY_DSN` | Sentry project ingest URL | `https://<key>@o<orgId>.ingest.sentry.io/<projectId>` |
| `SENTRY_CRONS` | Sentry cron check-in base URL | `https://o<orgId>.ingest.sentry.io/api/<projectId>/cron/<slug>/<public-key>/` |
| `AXIOM_TOKEN` | Axiom API token with ingest permission | `xaat-xxxxxxxx` |
| `SOURCE_TOKEN` | Better Stack log source token | from Sources > Configure > Basic information |
| `INGESTING_HOST` | Better Stack ingesting host for your source | shown next to the source token |
| `HEARTBEAT_TOKEN` | Better Stack heartbeat token | from the heartbeat's URL |
| `LOKI_USER_ID` | Grafana Cloud Loki user ID | from the stack's Loki data source settings |
| `GRAFANA_API_TOKEN` | Grafana Cloud API token | paired with `LOKI_USER_ID` for basic auth |
| `SLACK_WEBHOOK_URL` | Slack incoming webhook | `https://hooks.slack.com/services/T.../B.../XXX...` |
| `DISCORD_WEBHOOK_URL` | Discord channel webhook | `https://discord.com/api/webhooks/<id>/<token>` |

healthchecks.io ping UUIDs and UptimeRobot heartbeat URLs are secrets too, even though they usually live inside crontabs rather than env vars.

---

## Free Tier Info

All limits verified 2026-07-06 against each vendor's pricing page.

| Tool | Free tier headline | Retention | Cheapest paid |
|------|--------------------|-----------|---------------|
| UptimeRobot | 50 monitors, 5-min interval, 1 basic status page | 3 months data | Solo $84/year (60s interval) |
| Better Stack | 10 uptime monitors (30s checks), 3 GB logs/month, 100k exceptions/month | logs/traces 3 days | Responder $34/month ($29/month yearly) |
| Sentry | 5,000 errors/month, 5M spans, 1 cron + 1 uptime monitor, 1 user | 30 days | Team $26/month (annual) |
| Axiom | 500 GB/month ingest (hard cap), 3 datasets, 3 monitors, 1 user | 30 days max | Cloud $25/month platform fee + usage |
| Grafana Cloud | 10k metric series, 50 GB logs + 50 GB traces + 50 GB profiles/month, 3 users | 14 days | Pro $19/month + usage |
| healthchecks.io | 20 jobs, 100 log entries/job | -- | Business $20/month (100 jobs) |
| Render logs | included with service | Hobby 7 days | Pro workspace: 14 days + HTTP request logs |
| Railway logs | included with service | Hobby 7 days | Pro: 30 days |
| Vercel logs | included with project | Hobby 1 hour | Pro: 1 day; +Observability Plus: 30 days |

---

## Troubleshooting

### Problem: Uptime monitor reports a Render free app as down (or extremely slow) every few hours

**Cause:** Render free services spin down after 15 minutes without inbound traffic and take about one minute to spin up. The first check after a sleep either times out or records a huge response time. Render also answers `robots.txt` without waking the service while spun down, which confuses some monitors.

**Fix:** Point an external uptime check at the service at a 5-minute interval (UptimeRobot free works) -- the checks themselves count as traffic and keep it awake. Or accept the wake latency and raise the monitor's timeout. For anything real, upgrade off the Free instance type; Render explicitly says not to use Free instances for production.

### Problem: Yesterday's error is gone from Vercel logs

**Cause:** Runtime logs on the Hobby plan are only queryable for 1 hour. Debugging anything older than that from the dashboard is impossible, and Drains (log forwarding) require Pro.

**Fix:** Ship logs out at write time from inside the function -- POST errors to Axiom or Better Stack in the same request that logs them:

```javascript
await fetch("https://api.axiom.co/v1/datasets/my-app-logs/ingest", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.AXIOM_TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify([{ level: "error", message: err.message, stack: err.stack }]),
});
```

### Problem: Railway logs are missing lines under load

**Cause:** Railway drops log lines beyond 500 lines per second per replica on all plans. Excess lines are dropped with a warning showing the drop count.

**Fix:** Per Railway's docs: reduce verbosity in production, emit minified JSON instead of pretty-printed output, sample frequent events, and consolidate related entries into single lines.

### Problem: Sentry events stop appearing mid-month

**Cause:** You hit the Developer plan's 5,000 errors/month quota. Events exceeding quota are not accepted -- they vanish, no error on your side.

**Fix:** Lower volume before raising spend: SDK sampling (`tracesSampleRate`), `beforeSend` filtering of known-noisy errors, inbound filters, or per-project rate limits. Check **Stats & Usage** to see what is eating the quota.

### Problem: Axiom rejects ingest requests with a field-limit error

**Cause:** An event that would exceed the dataset's allowed field count (256 fields on the Personal plan) is rejected with an error rather than stored. Dynamic JSON keys (user IDs, request IDs as field names) blow through the cap fast. Batches over 10,000 events or fields over 1 MB also fail.

**Fix:** Flatten and limit log fields; move dynamic values into field *values*, not field *names* (`{"user_id":"u_123"}`, never `{"u_123":{...}}`). Split oversized batches.

### Problem: healthchecks.io alerts on cron jobs that ran fine, just slightly late

**Cause:** A check goes Late when overdue and Down (which alerts) only after grace time is exceeded. For cron-scheduled checks, grace starts counting at the scheduled execution time -- so a job with variable runtime and a tight grace window fires false alarms.

**Fix:** Raise the check's grace time to absorb expected runtime variance (e.g. a backup that takes 5-20 minutes needs at least 25-30 minutes of grace). Use the `/start` ping so healthchecks.io can also measure actual runtime.
