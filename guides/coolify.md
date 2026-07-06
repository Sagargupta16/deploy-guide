# Coolify

> Self-host an open-source Heroku/Vercel alternative on your own server: push-to-deploy from GitHub, one-click databases, and automatic HTTPS with zero platform fees.

Coolify is an open-source, self-hostable PaaS that turns any VPS into a push-to-deploy platform. The current stable release is v4.1.2 (published 2026-06-04); v4.0.0 (2026-04-27) ended the long v4.0.0-beta series, and v4.1.0 (2026-05-18) added a Railpack build pack in beta. You bring the server (Hetzner, DigitalOcean, EC2, even a Raspberry Pi), and Coolify handles builds, deployments, reverse proxying via Traefik or Caddy, and Let's Encrypt certificates. Self-hosted Coolify is free forever with full access to all features.

## Prerequisites

- [ ] A Linux server or VPS with root SSH access ([Hetzner](https://www.hetzner.com/cloud), [DigitalOcean](https://www.digitalocean.com/), [AWS EC2](https://aws.amazon.com/ec2/), or a Raspberry Pi with a 64-bit OS)
- [ ] Minimum 2 CPU cores, 2 GB RAM, 30 GB free storage
- [ ] A supported OS: Ubuntu LTS (20.04/22.04/24.04) is the easiest path; Debian-based, Red Hat-based (CentOS/Fedora/AlmaLinux/Rocky), SUSE-based, Arch, Alpine, and Raspberry Pi OS 64-bit also work (AMD64 or ARM64)
- [ ] A [GitHub account](https://github.com/) for repo-based deployments
- [ ] (Optional) A domain you control, for custom domains and wildcard subdomains

> **Note:** Coolify requires Docker Engine 24+ on the server. Snap-installed Docker is not supported -- remove it first if present. Non-LTS Ubuntu versions require [manual installation](https://coolify.io/docs/get-started/installation).

---

## Step 1: Install Coolify

SSH into your server and run the official install script as root:

```bash
ssh root@YOUR_SERVER_IP

curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash
```

The script sets up Coolify and stores all its data under `/data/coolify`.

To pre-create the admin account non-interactively (useful for scripted provisioning), pass env vars to the installer:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo env \
  ROOT_USERNAME=admin \
  ROOT_USER_EMAIL=you@example.com \
  ROOT_USER_PASSWORD='use-a-long-random-password' \
  bash
```

To pin a specific version instead of the latest:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash -s 4.1.2
```

## Step 2: Create the Admin Account

Open the dashboard in your browser:

```
http://YOUR_SERVER_IP:8000
```

**Create the admin account immediately.** Registration stays open until the first account exists -- anyone who reaches port 8000 before you register can take over the instance. If you passed `ROOT_USERNAME` / `ROOT_USER_EMAIL` / `ROOT_USER_PASSWORD` to the installer, the account already exists and you can just log in.

## Step 3: Open Firewall Ports

A self-hosted Coolify instance needs these inbound ports:

| Port | Purpose |
|------|---------|
| 22 | SSH (or your custom SSH port) |
| 80 | HTTP + Let's Encrypt HTTP-01 validation |
| 443 | HTTPS |
| 8000 | Coolify dashboard (HTTP) |
| 6001 | Realtime / websockets |
| 6002 | Web terminal (since v4.0.0-beta.336) |

Example with UFW:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8000/tcp
sudo ufw allow 6001/tcp
sudo ufw allow 6002/tcp
sudo ufw enable
```

> **Gotcha:** Docker inserts NAT-based iptables rules that bypass UFW entirely, so UFW rules alone will not block ports published by containers. Prefer your cloud provider's firewall dashboard (Hetzner Cloud Firewall, AWS security groups, DO Cloud Firewalls), or use the community [ufw-docker](https://github.com/chaifeng/ufw-docker) tool if you must stay on UFW.

Once you put the dashboard behind a custom domain (see [Custom Domain](#custom-domain)), you can safely close 8000, 6001, and 6002. Servers managed by Coolify Cloud only need 22, 80, and 443.

## Step 4: Deploy a Public GitHub Repo

1. In the dashboard, open (or create) a **Project**
2. Click **+ New** to add a resource
3. Choose **Public Repository**
4. Select the server to deploy on (**localhost** is auto-selected if you have no remote servers)
5. Paste the repository URL, e.g. `https://github.com/<username>/my-app`
   - Paste a `/tree/branch-name` URL to auto-detect a specific branch
6. Click **Check Repository**
7. Configure the **Build Pack** (Nixpacks, Static, Dockerfile, Docker Compose) and the **Port** your app listens on
8. Deploy

Until you configure a custom or wildcard domain, Coolify generates a default URL for the app via [sslip.io](https://sslip.io/) based on the server IP, e.g. `http://<random-subdomain>.203.0.113.1.sslip.io` (IPv6 colons become dashes).

## Step 5: Deploy a Private Repo (GitHub App)

The GitHub App integration is the recommended way to deploy private repos -- it also enables push-to-deploy webhooks and pull-request preview deployments automatically.

### Create the GitHub App source

1. In the sidebar, go to **Sources** and click **+ Add**
2. Enter a name for the app and your GitHub organization (leave blank for a personal account)
3. Click **Continue**
4. Pick the webhook endpoint -- this should be your Coolify dashboard URL, so it must be reachable from the internet
5. Click **Register now**
6. On GitHub: name the app, click **Create app**
7. Back in Coolify, click **Install repositories on Github** and select which repositories the app can access

### Deploy from the private repo

1. In your project, click **+ New**
2. Choose **Private Repository (with Github App)**
3. Pick the GitHub App you just created
4. Choose the repository and click **Load Repository**
5. Configure the Build Pack and Port
6. Deploy

> **Note:** There is also a manual GitHub App setup if the guided flow does not fit -- it requires the App ID, Client Secret, Private Key, and Installation ID from GitHub. Deploy keys are a simpler read-only alternative for private repos, but they do not give you webhooks or PR previews.

## Step 6: Enable Auto-Deploy on Push

**With a GitHub App source:** auto-deploy is enabled automatically. Push to the configured branch and Coolify redeploys. PR preview deployments are also on by default (you can disable them when registering the app).

**For public repos without the App**, wire up a manual webhook:

1. In the application's **Advanced** settings, enable the **Auto Deploy** toggle
2. Generate a webhook secret in Coolify and copy the webhook URL
3. On GitHub: repository **Settings** > **Webhooks** > **Add webhook**
4. Paste the Coolify webhook URL, set the secret, and trigger on **push** events

GitHub Actions is the third supported CI/CD method if you want to build externally and tell Coolify when to deploy.

> **Important:** TCP 80/443 must be open on the Coolify server, otherwise GitHub's webhooks can never reach the instance and pushes will silently not deploy.

---

## Built-in Databases

Coolify ships 8 one-click databases: **PostgreSQL, MySQL, MariaDB, MongoDB, Redis, DragonFly, KeyDB, and ClickHouse**. Add one from a project with **+ New**, same as an application.

Databases are private to the server's Docker network by default. Two ways to expose one publicly:

1. **Port mapping** -- classic Docker host-port mapping. Simple, but changing it requires a database restart.
2. **Public Port** -- routes through an Nginx TCP proxy. No restart needed to change; the proxy has a default timeout of 3600 seconds, adjustable in the database settings.

> **Note:** For databases moving large files (big dumps, media blobs), disable "Make it publicly available?" (the Nginx TCP proxy) and use a direct port mapping instead -- long transfers can hit the proxy timeout.

---

## Upgrading Coolify

Three options, from most to least hands-off:

1. **Automatic** -- Coolify checks for and installs updates by itself. On by default; disable it in **Settings** if you want control.
2. **Semi-automatic** -- when an update is available, an **Upgrade** button appears in the sidebar. Click it when convenient.
3. **Manual** -- re-run the install script:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash

# Or pin a target version
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash -s 4.1.2
```

---

## Environment Variables

The install script accepts these optional variables (pass them with `sudo env` as shown in Step 1):

| Variable | Description | Example |
|----------|-------------|---------|
| `ROOT_USERNAME` | Pre-create the admin account: username | `admin` |
| `ROOT_USER_EMAIL` | Pre-create the admin account: email | `you@example.com` |
| `ROOT_USER_PASSWORD` | Pre-create the admin account: password | `use-a-long-random-password` |
| `DOCKER_ADDRESS_POOL_BASE` | Docker address pool base (default `10.0.0.0/8`) | `172.16.0.0/12` |
| `DOCKER_ADDRESS_POOL_SIZE` | Docker address pool subnet size (default `24`) | `24` |

Coolify's own instance configuration lives on the server at:

```bash
/data/coolify/source/.env
```

Everything else Coolify manages (proxy config, certificates, application data) lives under `/data/coolify`. Back that directory up.

---

## Custom Domain

### App domain with automatic HTTPS

1. Point an **A record** for your domain at the server IP:

   | Type | Name | Value |
   |------|------|-------|
   | A | `app` (or `@`) | `YOUR_SERVER_IP` |

2. In the application's settings, enter the domain **with the `https://` scheme** in the **Domains** (FQDN) field:

   ```
   https://app.example.com
   ```

3. Redeploy. Coolify configures the proxy (Traefik or Caddy), issues a Let's Encrypt certificate, and renews it automatically before the 90-day expiry. No manual certbot, no cron jobs.

Multiple domains are comma-separated, and custom ports are allowed:

```
https://example.com:8080,http://api.example.com:3000
```

If certificate issuance fails, the proxy serves a self-signed certificate as a fallback -- see [Troubleshooting](#troubleshooting) for the usual causes.

### Wildcard subdomains

1. Add an A record for `*.example.com` pointing at the server IP
2. In **Server** settings, set the **Wildcard Domain** field to your domain

Coolify then autogenerates subdomains like `random.example.com` for every new resource instead of the default sslip.io URLs. Note that wildcard **SSL** certificates additionally need a DNS-01 challenge (see Troubleshooting).

### Dashboard domain

Give the Coolify instance itself a domain on the `/settings` page of your dashboard. Once that works over HTTPS, close ports 8000, 6001, and 6002 in your firewall.

> **Gotcha:** Domains with special characters (e.g. German umlaut domains) must be entered in punycode form (`xn--mnchen-3ya.example.com`). Coolify does not auto-convert.

---

## Free Tier Info

Self-hosted Coolify is the whole product, free: "Full access to all features. No limitation or restrictions." Coolify Cloud is the same open-source codebase with a managed control plane -- no locked-behind-paywall features.

| Feature | Self-Hosted | Coolify Cloud |
|---------|-------------|---------------|
| **Price** | Free forever | $5/month base |
| **Connected servers** | Unlimited (your hardware) | 2 included, $3/month per additional server |
| **Deployments** | Unlimited | Unlimited per server |
| **Feature set** | Everything | Everything (same codebase) |
| **Coolify upgrades** | You run them | Zero-maintenance, staged updates |
| **Control plane backups** | Your responsibility | Daily database backups |
| **Email notifications** | Bring your own SMTP | Preconfigured |
| **Annual billing** | n/a | 20% savings |

Key details:

- **Coolify Cloud does not host your apps.** You still bring your own servers (Hetzner, DigitalOcean, EC2, Raspberry Pi, etc.); the Cloud plan only hosts and maintains the Coolify control plane for you.
- The realistic total cost of self-hosting is just your VPS. A 2-core/2 GB box from a budget provider comfortably runs Coolify plus a few small apps.
- Cloud-managed servers only need ports 22, 80, and 443 open -- the dashboard ports stay closed because the dashboard is hosted for you.

---

## Troubleshooting

### Problem: 502 Bad Gateway when opening the app

**Cause:** The proxy cannot reach your app. Usually the **Port Exposes** value is wrong, a leftover host port mapping is blocking proxy routing, or the app listens on `localhost` instead of `0.0.0.0`.

**Fix:**

1. Set the correct port in **Port Exposes** (the port your app actually listens on) and restart the app
2. Delete any host port mappings you added -- the proxy talks to the container directly
3. Make the app bind `0.0.0.0`:

```js
// Node.js
app.listen(process.env.PORT || 3000, '0.0.0.0');
```

```python
# FastAPI / uvicorn
# uvicorn main:app --host 0.0.0.0 --port 3000
```

### Problem: Let's Encrypt not working, browser shows a self-signed certificate

**Cause:** Certificate issuance failed, so the proxy fell back to its self-signed cert. Common causes: port 80 not reachable from the internet (HTTP-01 validation needs it), Cloudflare's orange-cloud proxy intercepting validation, an IPv4/IPv6 mismatch (a closed port on either protocol breaks validation), Let's Encrypt rate limiting (429), or WAF blocks (403).

**Fix:**

1. Open port 80 and confirm it is reachable from outside
2. If the domain is behind Cloudflare, grey-cloud it (DNS only) until the cert is issued
3. If IPv6 is unused on the server, remove the domain's AAAA records
4. Force regeneration:

```bash
sudo rm /data/coolify/proxy/acme.json
# then restart the Coolify proxy from the dashboard
```

### Problem: Proxy log says "Cert resolver doesn't exist letsencrypt"

**Cause:** On non-root installs, `/data/coolify/proxy/acme.json` ends up with wrong permissions, and Traefik refuses to use overly permissive files.

**Fix:**

```bash
sudo chmod 600 /data/coolify/proxy/acme.json
```

### Problem: Wildcard SSL certificate is not issued

**Cause:** HTTP-01 challenges cannot validate wildcard certificates. Wildcards require a DNS-01 challenge, which needs API access to your DNS provider.

**Fix:**

1. Configure the DNS provider and its API keys for the DNS challenge in the proxy settings
2. If you are using custom certificates instead: files must use `.cert`/`.key` extensions (rename `.pem`) and live in `/data/coolify/proxy/certs`
3. After any certificate change, delete `acme.json` and restart the proxy:

```bash
sudo rm /data/coolify/proxy/acme.json
# then restart the Coolify proxy from the dashboard
```

### Problem: 504 Gateway Timeout on large uploads or slow endpoints

**Cause:** Either a custom Docker network is isolating the app from the proxy, or the default 60-second read timeout in Traefik/Nginx kills long requests.

**Fix:**

1. Drop custom Docker networks -- use Coolify **Destinations** instead so the proxy and app share a network
2. For Traefik, raise the timeouts in the server proxy settings:

```
--entrypoints.https.transport.respondingTimeouts.readTimeout=5m
--entrypoints.https.transport.respondingTimeouts.writeTimeout=5m
--entrypoints.https.transport.respondingTimeouts.idleTimeout=5m
```

3. For Caddy, add a container label:

```
caddy.servers.timeouts.read_body=300s
```

### Problem: Server crashes or becomes unresponsive during builds

**Cause:** Docker image builds are resource-hungry and overload small servers (remember the 2-core/2 GB minimum is a minimum).

**Fix:**

1. SSH in and check what is eating the box:

```bash
htop
```

2. Kill the heavy build process, then pick a longer-term fix:
   - Upgrade the server
   - Build images externally in GitHub Actions and deploy the pre-built image
   - Use Coolify's dedicated **Build Server** feature to move builds off the app server
