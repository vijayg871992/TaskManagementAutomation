# JAB Jarvis — task agent

Turn a natural-language instruction ("Hey Jarvis, assign Eric for Cold Calling to pull 400
leads by Monday 4pm") into a tracked task, surface it on an installable mobile/desktop PWA,
and email a 5 AM ET daily digest. Built for a Hostinger VPS demo (SQLite + Caddy), designed
to lift-and-shift to Azure (Postgres) with config-only changes.

## Quick start (local)

```bash
npm install
npm run setup            # create + seed the SQLite DB
node scripts/make-icons.js
npm test                 # the test harness (offline, mock NLP) — build target #1
npm start                # http://localhost:3000
```

No `.env` needed locally — defaults are SQLite + mock NLP + console SMS + file email.

## The test harness (built first)

Simulate **any** sender without the team or any logins — same code path as the live app:

```bash
npm run simulate -- --list
npm run simulate -- --from Donald "Hey Jarvis, assign Eric for Cold Calling to pull 400 leads by Monday 4pm"
npm run simulate -- --from Jeremy --pick "General" "Hey Jarvis, assign Vijay to prep the deck by Friday"
node scripts/e2e-smoke.js   # full HTTP: OTP login -> command -> thread -> status
npm test                    # node:test rule coverage (wake word, 5pm default, missing-field, TZ)
```

## Parsing rules (all enforced in `src/services/commandService.js`)

- Must start with **Hey Jarvis / Hi Jarvis / Jarvis** (case-insensitive) — else rejected.
- Extracts assignee, project, description, deadline date/time. Assigner = the signed-in sender.
- **Project missing/unknown** → returns the project list to pick (no task created).
- **Date present, time absent** → deadline defaults to **5:00 PM** America/New_York.
- **Assignee / description / deadline date missing** → format error, **no task created**.
- All deadlines interpreted in **America/New_York**, stored as UTC.

## Configuration (swap providers via `.env`, no code changes)

| Concern | Demo default | Production |
|---|---|---|
| DB | `DB_CLIENT=better-sqlite3` | `pg` + `DATABASE_URL` (Azure) |
| NLP | `NLP_PROVIDER=mock` | `gemini` + `GEMINI_API_KEY` (AI Studio free tier, `gemini-2.5-flash`) |
| SMS OTP | `SMS_PROVIDER=console` | `aloware` + `ALOWARE_API_KEY` |
| Email | `EMAIL_PROVIDER=file` | `smtp` + `SMTP_*` (Outlook / O365) |

See [`deploy/DEPLOY.md`](deploy/DEPLOY.md) for VPS + Caddy + cron + Azure migration steps.

## Features
- **Jarvis chat** — persistent command log; task assignments & clarifications only (not a chatbot).
- **Private tasks** — say "private" / "privately" in the command, or toggle on a task. Visible
  only to assigner + assignee; hidden from the All-Tasks dashboard for everyone else.
- **All-Tasks dashboard** — Board / Grid / List views, grouped by project, all team members shown.
- **Projects** — create projects with descriptions in the Projects tab.
- **Reference docs** — attach files, images, or links to any task.
- **Push notifications + sound** — alert on task assignment and on replies (Web Push / VAPID).
- **Teams tab** — embed the app in a Teams channel (see `deploy/teams/`).

### Test login (no SMS)
User **Tony** — phone `(212) 555-0123`, fixed code **`123456`**. Lets you test without
sending real texts or disturbing the team.

## What's parked for v1
In-app audio transcription (phone dictation covers it), approval gates, dependency
chains/auto-progression, Microsoft Planner write. The dashboard **is** the task board.
