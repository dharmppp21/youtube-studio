# YouTube Creator Studio

A self-hosted YouTube Studio clone for a single creator. Built on Vite + React 19 + Express, backed by Firebase (Auth + Firestore), with Gemini-powered AI tools (idea generator, SEO copywriter, script outliner, comment reply drafter).

This repo is configured for a self-hosted Ubuntu VPS deployment (no AI Studio runtime required). Local dev still works the same way.

---

## Features

- Google sign-in + anonymous Sandbox sign-in (zero-config demo workspace).
- Live YouTube Data API v3 + YouTube Analytics sync (uploads, comments, 30-day analytics).
- Dashboard, Analytics (overview / content / audience / revenue charts), Video Manager (upload / edit / delete), Comment Moderator (heart / pin / reply / AI reply).
- AI Suite: video idea generator, SEO copywriter, full script outliner.
- Channel Settings: profile editor, custom 30-day analytics engine, data purge + restore.

---

## Local development

Prereqs: Node.js 20 LTS, npm, a Firebase project.

```bash
git clone https://github.com/dharmppp21/youtube-studio.git
cd youtube-studio
npm install
cp deploy/env.production.example .env
# Edit .env and set GEMINI_API_KEY
npm run dev        # http://localhost:3000
```

Lint / build:

```bash
npm run lint       # tsc --noEmit
npm run build      # vite build && esbuild server.ts -> dist/server.cjs
```

---

## Deploy to a self-hosted Ubuntu VPS

### One-time VPS provisioning (~20 minutes)

You need a fresh Ubuntu 22.04 or 24.04 VPS with a public IP. As root (or via `sudo -i`):

```bash
apt update && apt -y upgrade
apt -y install nginx nodejs npm certbot python3-certbot-nginx ufw

# Node 20 LTS (Ubuntu's apt nodejs is older).
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt -y install nodejs

# Process manager — keeps the app alive across reboots and crashes.
npm install -g pm2

# Firewall: only SSH and HTTPS in.
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
```

Create a non-root deploy user:

```bash
useradd -m -s /bin/bash deploy
passwd deploy          # set a password or add your SSH key to ~deploy/.ssh/authorized_keys
```

### Clone and configure the app

```bash
sudo -iu deploy
git clone https://github.com/dharmppp21/youtube-studio.git ~/app
cd ~/app
cp deploy/env.production.example .env
nano .env              # paste your real GEMINI_API_KEY, set APP_URL
npm ci
npm run build
```

`APP_URL` should be `http://YOUR_VPS_IP` for the IP-only setup. Once you add a domain later, change it to `https://YOUR.DOMAIN.COM`.

### Configure the Gemini key

1. Visit https://aistudio.google.com/app/apikey
2. Click **Create API key**.
3. Copy into `.env` as `GEMINI_API_KEY=...`.
4. Restart the app: `pm2 restart youtube-studio`.

### Start the app with pm2

```bash
pm2 start dist/server.cjs --name youtube-studio --time
pm2 save
pm2 startup           # prints a `sudo env PATH=...` line — run that as root
```

Verify it's listening:

```bash
curl http://localhost:3000   # expect HTML with <div id="root">
```

### Wire up nginx (IP-only mode, no domain yet)

The provided nginx config has a plain-HTTP fallback commented at the bottom for IP-only mode (no TLS needed if you accept the browser warning on first visit).

```bash
# Generate a self-signed cert so HTTPS-only browsers (and the Google OAuth
# popup) work without an "insecure context" error.
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/selfsigned.key \
    -out /etc/nginx/ssl/selfsigned.crt \
    -subj "/CN=YOUR_VPS_IP"

sudo cp deploy/nginx.conf /etc/nginx/sites-available/youtube-studio
sudo ln -s /etc/nginx/sites-available/youtube-studio /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Visit `https://YOUR_VPS_IP` in your browser. Expect a "self-signed cert" warning — click through. The app should load.

> **Why HTTPS even for IP-only?** Firebase Auth and the Google OAuth popup require a secure context. Without HTTPS the popup fails with `auth/operation-not-supported-in-this-environment`. The self-signed cert + browser-click-through is enough.

### Add a domain later (optional)

When you're ready for a real URL:

```bash
# 1. Point your domain's DNS A record at the VPS IP.
# 2. Open port 80 in your firewall (already done by `ufw allow 'Nginx Full'`).
# 3. Get a free Let's Encrypt cert:
sudo certbot --nginx -d YOUR.DOMAIN.COM
#    Pick option 2 (redirect HTTP to HTTPS) when prompted.
# 4. Update .env: APP_URL=https://YOUR.DOMAIN.COM
# 5. Restart: pm2 restart youtube-studio
```

After `certbot --nginx` succeeds, the auto-renewing cert replaces the self-signed one at `/etc/nginx/ssl/selfsigned.crt` — but certbot also edits `/etc/nginx/sites-enabled/youtube-studio` to point at `/etc/live/YOUR.DOMAIN.COM/fullchain.pem`. Your config will Just Work after that.

### Firebase authorized domain

For the Google sign-in popup to work on the deployed URL, add it to Firebase:

1. Firebase Console → **Authentication → Sign-in method → Authorized domains**.
2. Add `YOUR_VPS_IP` (and later `YOUR.DOMAIN.COM`).
3. `localhost` should already be there from the default setup.

Without this step, the popup fails with `auth/unauthorized-domain`.

### Redeploying after changes

From your laptop, push to GitHub:

```bash
git push origin main
```

Then on the VPS:

```bash
sudo -iu deploy
cd ~/app
bash deploy/deploy.sh
```

This pulls the latest, reinstalls deps, rebuilds, and pm2-restarts. Takes 30–60 seconds.

If you're not using git and SCP'ing tarballs instead:

```bash
# On the VPS
cd ~/app
tar -xzf ~/youtube-studio.tar.gz --strip-components=1
DEPLOY_NO_PULL=1 bash deploy/deploy.sh
```

---

## Project structure

```
.
├── server.ts                 # Express server (port 3000) + Gemini endpoints
├── src/
│   ├── App.tsx               # Root: auth, layout, tab router, real-time Firestore
│   ├── firebase.ts           # Firebase init + structured error handler
│   ├── youtubeApi.ts         # YouTube Data + Analytics sync
│   ├── seedData.ts           # Sandbox demo data writer
│   ├── types.ts              # Channel / Video / Comment / AnalyticsSnapshot
│   ├── main.tsx              # React entry
│   ├── index.css             # Tailwind v4 + dark scrollbar
│   └── components/
│       ├── DashboardView.tsx
│       ├── AnalyticsView.tsx
│       ├── VideoManagerView.tsx
│       ├── CommentModeratorView.tsx
│       ├── AIStudioAssistantView.tsx
│       └── ChannelSettingsView.tsx
├── firestore.rules           # Owner-scoped CRUD + entity shape validation
├── firebase.json             # Firestore deploy config
├── firebase-applet-config.json  # Firebase web app config (public-safe)
├── vite.config.ts            # Vite + Tailwind v4 + React plugin
├── tsconfig.json             # ES2022, bundler resolution, noEmit
├── deploy/
│   ├── nginx.conf            # Reverse proxy + HTTPS (self-signed or certbot)
│   ├── deploy.sh             # One-shot redeploy script (git pull + npm ci + build + pm2)
│   └── env.production.example  # Template for .env on the VPS
└── README.md                 # This file
```

---

## Troubleshooting

**Google popup fails with `auth/unauthorized-domain`.**
Add the VPS IP / domain to Firebase Console → Authentication → Authorized domains.

**`Gemini API key not configured` in the pm2 logs.**
The `.env` file isn't being read. Ensure it's at `~/app/.env` and `pm2 restart youtube-studio` has been run after creating it.

**YouTube sync returns "No YouTube channel found for this Google Account".**
The signed-in Google account has no YouTube channel. Create one at https://youtube.com/create_channel first.

**Firebase quota errors in the browser console.**
Your named Firestore database might not exist. Verify in Firebase Console → Firestore Database that the DB ID in `firebase-applet-config.json` exists.

**`pm2 startup` prints a `sudo env PATH=...` line you forgot to run.**
Run that exact line as root, then `pm2 save` again. Without it, pm2 won't restart the app after a reboot.

**nginx returns 502.**
The Node server isn't listening on port 3000. Check `pm2 status youtube-studio` and `pm2 logs youtube-studio`.

---

## License

MIT.