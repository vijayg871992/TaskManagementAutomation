# Deploying JAB Jarvis

## A. Hostinger VPS (Ubuntu) — the demo

```bash
# 1. Node 18+ (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs build-essential   # build-essential for better-sqlite3

# 2. App
sudo useradd -r -m -d /opt/jarvis-agent jarvis    # service user (optional)
sudo git clone <your repo> /opt/jarvis-agent       # or scp the folder
cd /opt/jarvis-agent
npm ci --omit=dev
cp .env.example .env        # then edit (see below)
npm run setup               # migrate + seed
node scripts/make-icons.js  # generate PWA icons (one-time)

# 3. Run under systemd
sudo cp deploy/jarvis.service /etc/systemd/system/jarvis.service
sudo systemctl daemon-reload && sudo systemctl enable --now jarvis

# 4. HTTPS via Caddy
sudo apt install -y caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile   # edit the domain first
sudo systemctl restart caddy

# 5. Daily 5 AM ET digest
crontab -e   # paste deploy/crontab.txt
```

### `.env` for the demo
```
DB_CLIENT=better-sqlite3
NLP_PROVIDER=gemini          # or mock to run with no key
GEMINI_API_KEY=<AI Studio free-tier key>
SMS_PROVIDER=console         # switch to aloware once creds are ready
EMAIL_PROVIDER=file          # switch to smtp to actually send
APP_BASE_URL=https://jarvis.yourdomain.com
SESSION_SECRET=<long random>
```

Point a DNS A-record (e.g. `jarvis.yourdomain.com`) at the VPS IP before starting Caddy.

## B. Turning on the real integrations

- **Gemini** (free tier): create a key at Google AI Studio (no credit card). Set
  `NLP_PROVIDER=gemini`, `GEMINI_API_KEY`. Model stays `gemini-2.5-flash`. No Vertex/billing.
- **SMS OTP via Aloware**: set `SMS_PROVIDER=aloware`, `ALOWARE_API_KEY`, `ALOWARE_FROM`.
  Confirm the send endpoint/body in `src/auth/sms/aloware.js` against your Aloware API docs.
- **Email via Outlook SMTP**: set `EMAIL_PROVIDER=smtp` and the `SMTP_*` vars to your
  Office 365 mailbox (host `smtp.office365.com`, port `587`). One email per person.
- **Push notifications** (free, no service): generate VAPID keys with
  `npx web-push generate-vapid-keys`, set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` /
  `VAPID_SUBJECT`. Requires HTTPS (Caddy). iOS only delivers push to an **installed** PWA
  (Add to Home Screen, iOS 16.4+). Users get an in-app sound + a system notification when a
  task is assigned to them or someone replies.
- **Microsoft Teams tab**: package the app as a Teams tab — see `deploy/teams/README.md`.
  This embeds the HTTPS app in a Teams frame (no message-access consent needed).

## C. Migrating to Azure + Postgres (after the demo)

No code changes — config only:
1. Provision Azure Database for PostgreSQL.
2. Set `DB_CLIENT=pg` and `DATABASE_URL=postgres://…`.
3. `npm run migrate && npm run seed` against Postgres (same migrations/seeds).
4. Keep `EMAIL_PROVIDER=smtp` (or swap to Microsoft Graph later) and `SMS_PROVIDER=aloware`.
5. Deploy the same Node app (App Service / container). Caddy step is optional if Azure
   terminates TLS for you.

## Parked for v1 (interfaces left clean)
In-app audio transcription, approval gates, dependency chains/auto-progression, Microsoft
Planner write via Graph. Until JAB adopts Planner, **this dashboard is the task board.**
