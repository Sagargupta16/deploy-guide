# Hetzner Cloud

> Deploy any Dockerized app on a Hetzner Cloud VPS with the hcloud CLI, cloud-init SSH hardening, Docker Compose, and Caddy HTTPS -- from about EUR 6/month.

Hetzner Cloud is a German IaaS provider with unbeatable EU pricing: the cheapest server (CX23: 2 vCPU, 4 GB RAM, 40 GB SSD) costs EUR 5.49/month plus EUR 0.50/month for an IPv4 address -- EUR 5.99 total (~USD 7.09), with 20 TB of outgoing traffic included. There is no free tier, and prices went up for new orders on 2026-06-15, but it is still roughly a quarter of the price of a comparable DigitalOcean Droplet. Unlike Railway or Render, you manage the OS yourself -- this guide takes you from zero to a hardened Ubuntu 24.04 server running Docker Compose behind automatic Let's Encrypt HTTPS.

## Prerequisites

- [ ] A [Hetzner account](https://console.hetzner.com/) with a payment method (no free tier -- billing starts when a server is created)
- [ ] An SSH key pair (`ssh-keygen -t ed25519` if you don't have one)
- [ ] [Git](https://git-scm.com/downloads) installed locally
- [ ] (Optional) A domain name for HTTPS
- [ ] (Optional) [Docker](https://docs.docker.com/get-docker/) locally, to test your image before deploying

---

## Plans and Pricing (verified 2026-07-06)

Hetzner bills in EUR, per hour, capped at the monthly price. All prices below are per month, **excluding VAT and excluding the EUR 0.50 IPv4 surcharge**. The old CX22/CX32/CX42/CX52 and EU CPX11-51 plans were deprecated on 2026-01-01 -- if an older guide tells you to order a `cx22`, use `cx23` instead.

### CX Gen3 -- shared Intel/AMD x86, EU only (cheapest line)

| Plan | vCPU | RAM | SSD | EUR/mo |
|------|------|-----|-----|--------|
| `cx23` | 2 | 4 GB | 40 GB | 5.49 |
| `cx33` | 4 | 8 GB | 80 GB | 8.49 |
| `cx43` | 8 | 16 GB | 160 GB | 15.99 |
| `cx53` | 16 | 32 GB | 320 GB | 29.49 |

### CAX -- shared Ampere ARM64, EU only

| Plan | vCPU | RAM | EUR/mo |
|------|------|-----|--------|
| `cax11` | 2 | 4 GB | 5.99 |
| `cax21` | 4 | 8 GB | 10.49 |
| `cax31` | 8 | 16 GB | 20.99 |
| `cax41` | 16 | 32 GB | 40.99 |

CAX11 includes a 40 GB SSD. ARM is great value if all your Docker images have `arm64` builds -- check before choosing.

### CPX Gen2 -- shared AMD, EU and Singapore

| Plan | vCPU | RAM | SSD | EU EUR/mo | Singapore EUR/mo |
|------|------|-----|-----|-----------|------------------|
| `cpx12` | 1 | 2 GB | 40 GB | n/a | 15.49 |
| `cpx22` | 2 | 4 GB | 80 GB | 19.49 | 26.49 |
| `cpx32` | 4 | 8 GB | 160 GB | 35.49 | 48.99 |
| `cpx42` | 8 | 16 GB | 320 GB | 69.49 | n/a |
| `cpx52` | 12 | 24 GB | 480 GB | 100.49 | n/a |
| `cpx62` | 16 | 32 GB | 640 GB | 129.99 | n/a |

### US locations -- CPX Gen1 only (no CX, no CAX)

| Plan | vCPU | RAM | SSD | EUR/mo |
|------|------|-----|-----|--------|
| `cpx11` | 2 | 2 GB | 40 GB | 17.49 (USD 20.49) |
| `cpx21` | | | | 31.99 |
| `cpx31` | | | | 62.49 |
| `cpx41` | | | | 120.49 |
| `cpx51` | | | | 237.99 |

US pricing is now far above EU pricing after the 2026-06-15 adjustment. If latency allows, deploy in the EU. Dedicated-vCPU CCX plans exist at all locations (CCX13 2 vCPU/8 GB from EUR 42.99/mo in the EU) but are overkill for hobby projects.

### Locations

| ID | City | Network zone | Available shared plans |
|----|------|--------------|------------------------|
| `fsn1` | Falkenstein, Germany | eu-central | CX, CAX, CPX |
| `nbg1` | Nuremberg, Germany | eu-central | CX, CAX, CPX |
| `hel1` | Helsinki, Finland | eu-central | CX, CAX, CPX |
| `ash` | Ashburn, VA, USA | us-east | CPX Gen1 |
| `hil` | Hillsboro, OR, USA | us-west | CPX Gen1 |
| `sin` | Singapore | ap-southeast | CPX |

Prices are identical across all three eu-central locations. This guide uses `fsn1` and `cx23` -- swap in `cpx11` + `ash` for US.

---

## Step 1: Create a Project and API Token

1. Log in to the [Hetzner Console](https://console.hetzner.com/)
2. Create a project (e.g., `my-app`) and open it
3. Go to **Security** in the left menu > **API tokens** tab > **Generate API token**
4. Name it (e.g., `cli`), select **Read & Write**, and generate

> **Important:** The token is shown exactly once and cannot be viewed again. Copy it now. It is used as an `Authorization: Bearer $API_TOKEN` header by the API and CLI.

## Step 2: Install the hcloud CLI

The official CLI is [hcloud](https://github.com/hetznercloud/cli) (v1.66.0 as of 2026-06-24):

```bash
# macOS / Linux (Homebrew)
brew install hcloud

# Windows
winget install HetznerCloud.CLI

# Linux (binary)
curl -sSLO https://github.com/hetznercloud/cli/releases/latest/download/hcloud-linux-amd64.tar.gz
sudo tar -C /usr/local/bin --no-same-owner -xzf hcloud-linux-amd64.tar.gz hcloud
```

Configure it with your API token and verify:

```bash
# Prompts for the API token from Step 1
hcloud context create my-app

# Verify -- lists plans with hourly/monthly prices and availability
hcloud server-type list
```

> **Note:** Older tutorials verify with `hcloud datacenter list`. The `datacenters` commands were deprecated in v1.66.0 and the API endpoints are removed after 2026-10-01 -- use the `server-type` commands for availability instead.

## Step 3: Upload Your SSH Key

```bash
hcloud ssh-key create --name my-key --public-key-from-file ~/.ssh/id_ed25519.pub
```

Always create servers with an SSH key. Without one, Hetzner emails you a root password, and password logins are exactly what the hardening in Step 5 disables.

## Step 4: Create a Firewall

Hetzner Cloud Firewalls are free and stateful. Create `rules.json`:

```json
[
  {
    "direction": "in",
    "protocol": "tcp",
    "port": "22",
    "source_ips": ["0.0.0.0/0", "::/0"]
  },
  {
    "direction": "in",
    "protocol": "tcp",
    "port": "80",
    "source_ips": ["0.0.0.0/0", "::/0"]
  },
  {
    "direction": "in",
    "protocol": "tcp",
    "port": "443",
    "source_ips": ["0.0.0.0/0", "::/0"]
  }
]
```

```bash
hcloud firewall create --name web-firewall --rules-file rules.json
```

> **Warning:** A firewall applied with **no rules blocks ALL inbound traffic** (outbound stays open). Always include the SSH rule before attaching a firewall, or you lock yourself out. Limits: 5 firewalls per server, 500 effective rules per firewall. If you know your home IP is static, replace `0.0.0.0/0` on port 22 with `<your-ip>/32` for a much smaller attack surface.

## Step 5: Create the Server with Cloud-Init Hardening

Cloud-init runs once at first boot -- perfect for creating a non-root user and locking down SSH before the server is ever exposed. Create `cloud-init.yaml` (replace the `ssh-ed25519 ...` line with your actual public key from `~/.ssh/id_ed25519.pub`):

```yaml
#cloud-config
users:
  - name: deploy
    groups: users, sudo
    sudo: ALL=(ALL) NOPASSWD:ALL
    shell: /bin/bash
    ssh_authorized_keys:
      - ssh-ed25519 AAAA...your-public-key... you@example.com

package_update: true
package_upgrade: true
packages:
  - fail2ban

write_files:
  - path: /etc/ssh/sshd_config.d/ssh-hardening.conf
    content: |
      PermitRootLogin no
      PasswordAuthentication no
      MaxAuthTries 2
      AllowUsers deploy

runcmd:
  - printf "[sshd]\nenabled = true\n" > /etc/fail2ban/jail.local
  - systemctl enable fail2ban
  - reboot
```

This follows Hetzner's official [basic-cloud-config tutorial](https://community.hetzner.com/tutorials/basic-cloud-config): root login off, passwords off, fail2ban banning brute-forcers. The official version also moves SSH to port 2222 and enables ufw -- with a Hetzner firewall attached, ufw is redundant, and staying on port 22 keeps the firewall rule from Step 4 correct.

Now create the server:

```bash
hcloud server create \
  --name my-server \
  --type cx23 \
  --image ubuntu-24.04 \
  --location fsn1 \
  --ssh-key my-key \
  --firewall web-firewall \
  --user-data-from-file cloud-init.yaml
```

The command prints the server's IPv4 address when done. Wait a couple of minutes for cloud-init to finish (it upgrades packages and reboots), then connect **as `deploy`, not root**:

```bash
ssh deploy@<server-ip>

# Confirm the hardening took effect (both should fail)
ssh root@<server-ip>                        # Permission denied
ssh -o PubkeyAuthentication=no deploy@<server-ip>  # Permission denied (no password prompt fallback accepted)
```

> **Tip:** IPv6 is free; the primary IPv4 costs EUR 0.50/month. If everything talking to your server supports IPv6, add `--without-ipv4` to skip the surcharge.

## Step 6: Install Docker and Docker Compose

On the server, use Docker's official apt repository (Ubuntu 24.04 is supported; current engine is the 29.x series, and Compose v2 ships as the `docker-compose-plugin`, invoked as `docker compose`):

```bash
# Add Docker's official GPG key and repository
sudo apt update
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update

# Install engine + Compose plugin
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo
sudo usermod -aG docker deploy
newgrp docker

# Verify
docker compose version
```

Quick path if you prefer one command: `curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh`.

## Step 7: Deploy Your App with Docker Compose

Any app with a `Dockerfile` works. Example for a Node.js app listening on port 3000 -- `Dockerfile`:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

`compose.yaml`:

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    env_file: .env
    ports:
      - "127.0.0.1:3000:3000"
```

> **Important:** Bind to `127.0.0.1:3000:3000`, not `3000:3000`. Docker's published ports bypass most host firewalls -- binding to localhost keeps the app reachable only through the reverse proxy you add in Step 8.

On the server:

```bash
git clone https://github.com/<username>/my-app.git
cd my-app

# Create the runtime env file (never commit this)
cat > .env <<'EOF'
NODE_ENV=production
PORT=3000
EOF
chmod 600 .env

docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/
```

To redeploy after pushing changes:

```bash
cd ~/my-app && git pull && docker compose up -d --build
```

## Step 8: HTTPS with Caddy

Caddy gets and renews Let's Encrypt certificates automatically -- zero certbot ceremony. Install on the server (it runs as the systemd service `caddy` automatically):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
  sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
  sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Point your domain's DNS at the server first (see Custom Domain below), then edit `/etc/caddy/Caddyfile`:

```
example.com {
    reverse_proxy :3000
}
```

```bash
sudo systemctl reload caddy
curl -I https://example.com
```

That's the whole HTTPS setup. Caddy fetches a publicly-trusted certificate as long as your DNS record points at the server and ports 80 and 443 are open (they are, from Step 4).

### Alternative: nginx + certbot

If you prefer nginx, use certbot via snap:

```bash
sudo apt install -y nginx
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot

# Configure your nginx server block for example.com first, then:
sudo certbot --nginx

# Auto-renewal ships as a systemd timer -- verify it works
sudo certbot renew --dry-run
```

`certbot --nginx` edits your nginx config and enables HTTPS in one step.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `HCLOUD_TOKEN` | API token for the hcloud CLI in CI (locally, `hcloud context create` stores it for you) | `export HCLOUD_TOKEN=<token>` |
| `NODE_ENV` | App environment | `production` |
| `PORT` | Port your app listens on (must match `compose.yaml` and the Caddyfile) | `3000` |
| `DATABASE_URL` | Connection string if you use an external DB (Neon, Supabase) | `postgresql://user:pass@host/db` |

On a VPS there is no dashboard for app secrets -- they live in a `.env` file next to `compose.yaml`, loaded via `env_file`:

```bash
# On the server
cat > ~/my-app/.env <<'EOF'
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
EOF
chmod 600 ~/my-app/.env

# Apply changes
cd ~/my-app && docker compose up -d
```

Add `.env` to `.gitignore`. For CI deploys (e.g., GitHub Actions running `hcloud` commands), store `HCLOUD_TOKEN` as a repo secret.

---

## Custom Domain

1. Get your server's IPv4/IPv6 from `hcloud server list`
2. At your DNS provider, add records for your domain:

| Type | Name | Value |
|------|------|-------|
| A | @ | `<server-ipv4>` |
| AAAA | @ | `<server-ipv6>` (optional) |
| A | www | `<server-ipv4>` |

3. Hetzner also offers free DNS hosting, now built into the Hetzner Console (moved there from the old dns.hetzner.com panel in late 2025) -- point your registrar's nameservers at Hetzner if you want everything in one place
4. SSL is automatic: once the A record resolves to your server, Caddy obtains and renews the Let's Encrypt certificate on its own. With nginx, `certbot --nginx` handles issuance and the renewal timer

Unlike PaaS platforms there is no CNAME target -- your domain points straight at the server IP, so the IPv4 stays yours until you delete it.

---

## Free Tier Info

**Hetzner Cloud has no free tier.** Billing is hourly, capped at the monthly price, and starts the moment a server finishes creating -- powered-off servers are still billed. What the minimum setup actually costs (all excl. VAT):

| Item | Price |
|------|-------|
| Cheapest x86 server (CX23, 2 vCPU / 4 GB / 40 GB, EU only) | EUR 5.49/mo (EUR 0.0088/hr) |
| Cheapest ARM server (CAX11, 2 vCPU / 4 GB / 40 GB, EU only) | EUR 5.99/mo (EUR 0.0096/hr) |
| Primary IPv4 | EUR 0.50/mo (USD 0.60) |
| Primary IPv6 | Free |
| Cloud Firewalls | Free |
| Included outgoing traffic (EU, CX/CAX/CPX) | 20 TB/mo |
| Traffic overage | EUR 1/TB (USD 1.20), billed in 100 MB blocks |
| **Realistic minimum (CX23 + IPv4, EU)** | **EUR 5.99/mo (~USD 7.09)** |
| Cheapest US option (CPX11, 2 vCPU / 2 GB / 40 GB) | EUR 17.49/mo (USD 20.49) + IPv4 |

Only outgoing traffic counts against the quota; incoming and private-network traffic is free, and Hetzner emails warnings at 75% and 100%. US servers include 1-5 TB and Singapore 0.5-5 TB depending on plan.

### vs DigitalOcean (prices fetched 2026-07-06)

| | Hetzner CX23 (EUR 5.99 ~USD 7.09) | DO Basic $6/mo | DO Basic $24/mo |
|--|-----------------------------------|----------------|-----------------|
| vCPU | 2 | 1 | 2 |
| RAM | 4 GB | 1 GiB | 4 GiB |
| SSD | 40 GB | 25 GB | 80 GB |
| Transfer | 20 TB | 1,000 GiB | 4 TB |

Roughly 4x the RAM and 20x the transfer of DO's $6 Droplet, and about a quarter of the price of DO's comparable $24 Droplet. The catch: CX plans are EU-only, and DO's $4 Droplet (512 MiB) is still cheaper in absolute terms if you need almost nothing.

### Billing gotchas

- **Powered-off servers are billed.** "If you want to stop paying... you need to delete it." Snapshot first if you want the data back later.
- **Every Primary IPv4 is billed, even unassigned ones.** Deleting a server can leave its IP behind -- delete unused IPs in **Console** > project > **Primary IPs**.
- **The 2026-06-15 price increase only hits new orders and rescales.** Existing servers keep their old price as long as you never rescale.

---

## Troubleshooting

### Problem: Outbound email never sends (SMTP connection timeouts)

**Cause:** Hetzner blocks outbound ports 25 and 465 by default on ALL cloud servers to prevent spam abuse. New accounts must build history before an unblock is granted.

**Fix:** Use a transactional relay on port 587 (Amazon SES, Postmark, Resend) instead of talking SMTP directly. If you genuinely need port 25, open a support request from the Console after your account has some history.

### Problem: Locked out of SSH right after attaching a firewall

**Cause:** A Hetzner firewall with zero rules (or without an SSH rule) blocks all inbound traffic, including your session's new connections.

**Fix:** In **Console** > **Firewalls** > your firewall, add an inbound TCP port 22 rule from `0.0.0.0/0` and `::/0` -- takes effect immediately, no reboot. If you also broke sshd itself, use the server's **Console** (VNC) button in the Hetzner Console to get a local terminal. Prevention: always create firewalls from a `rules.json` that includes SSH, as in Step 4.

### Problem: `server type cx22 not found` (or another old plan) when creating a server

**Cause:** Hetzner replaced the old lineup in October 2025 with CX Gen3 (`cx23`-`cx53`) and CPX Gen2 (`cpx12`-`cpx62`). Since 2026-01-01, `cx22`, `cx32`, `cx42`, `cx52`, and EU `cpx11`-`cpx51` cannot be ordered in FSN, NBG, HEL, and SIN.

**Fix:**

```bash
# See what is orderable right now, with prices
hcloud server-type list
```

Use `cx23` instead of `cx22`. Existing servers on old plans keep working and can be moved to a new plan via the rescale option.

### Problem: Still being charged after powering the server off

**Cause:** Hetzner bills all servers that finished creation, including powered-off ones, plus every Primary IPv4 that exists -- "including Primary IPs that are not assigned to any cloud server."

**Fix:** Snapshot the server in the Console if you need the data (server > **Snapshots**), then delete both the server and any orphaned IPs:

```bash
hcloud server delete my-server
# Then check Console > Primary IPs and delete any unassigned IPv4s
```

### Problem: Cannot SSH into a server rebuilt from a snapshot

**Cause:** Access after a rebuild depends on how the server was created. If no SSH key was selected at creation, Hetzner generates a new root password and emails it (set at first boot via cloud-init). If a key was selected, it is re-injected on first boot.

**Fix:** Check the email for the new root password, or rely on the re-injected key. Keys that were already inside the snapshot's `authorized_keys` keep working regardless. Note that if your snapshot contains the hardening config from Step 5, root login and passwords stay disabled -- connect as `deploy` with your key.

### Problem: OS image missing when creating a server (e.g., `fedora-42` not found)

**Cause:** Hetzner keeps deprecated OS images for at least 3 months after the deprecation date, then removes them for new servers at any time (`fedora-42` was removed on 2026-06-30).

**Fix:**

```bash
# List currently available system images
hcloud image list --type system
```

Pin to a current LTS image like `ubuntu-24.04` in scripts and IaC. One related deprecation to watch: the EC2-compatible metadata routes (`/2009-04-04/meta-data` etc.) are deprecated as of 2026-06-30 and removed after 2026-08-01 -- tooling probing EC2-style metadata on Hetzner servers will break; only the documented `/hetzner/v1/*` routes remain.
