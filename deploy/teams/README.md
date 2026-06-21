# Add JAB Jarvis as a Microsoft Teams tab

This pins your existing HTTPS PWA inside Teams. It **displays** the app in a Teams
frame — it does NOT read chat messages or require admin message-access consent.

## One-time prep
1. Host the app over HTTPS (see `../DEPLOY.md`) at a real domain, e.g. `https://jarvis.yourdomain.com`.
2. Edit `manifest.json`:
   - Replace every `jarvis.yourdomain.com` with your domain.
   - Set `id` to a fresh GUID (PowerShell: `[guid]::NewGuid()`).
3. Generate the two icons (run from the app root):
   ```
   node scripts/make-icons.js   # also writes deploy/teams/color.png + outline.png
   ```
4. Zip the three files **at the root of the zip** (not inside a folder):
   ```
   manifest.json  color.png  outline.png   ->  jab-jarvis-teams.zip
   ```

## Install in Teams
- **Personal tab / sideload:** Teams → Apps → *Manage your apps* → *Upload an app* →
  *Upload a custom app* → pick `jab-jarvis-teams.zip`.
- **Pin in a channel:** open the channel → **+** (Add a tab) → choose JAB Jarvis →
  the config page loads → **Save**. The tab now shows the live app to everyone in the channel.

> Note: this is a content tab — it shows the app. It is not triggered from chat messages.
> The "Hey Jarvis" input lives inside the app itself (the Jarvis tab).

## CSP / framing
The server already sends `Content-Security-Policy: frame-ancestors …teams.microsoft.com…`
so Teams is allowed to embed the app. No other change needed.
