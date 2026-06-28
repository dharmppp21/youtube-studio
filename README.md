# YouTube Creator Studio

A self-hosted YouTube Studio clone for a single creator. Built on Vite + React 19 + Express, backed by Firebase (Auth + Firestore), with Gemini-powered AI tools (idea generator, SEO copywriter, script outliner, comment reply drafter).

Deploys to [Render](https://render.com) free tier in a few clicks. Local dev works on any machine with Node 20+.

---

## Features

- Google sign-in + anonymous Sandbox sign-in (zero-config demo workspace).
- Live YouTube Data API v3 + YouTube Analytics sync (uploads, comments, 30-day analytics).
- Dashboard, Analytics (overview / content / audience / revenue charts), Video Manager (upload / edit / delete), Comment Moderator (heart / pin / reply / AI reply).
- AI Suite: video idea generator, SEO copywriter, full script outliner.
- Channel Settings: profile editor, custom 30-day analytics engine, data purge + restore.

---

## Local development

Prereqs: Node.js 20 LTS, npm, a Gemini API key from https://aistudio.google.com/app/apikey.

```bash
git clone https://github.com/dharmppp21/youtube-studio.git
cd youtube-studio
npm install
cp .env.example .env
# Edit .env and set GEMINI_API_KEY=...
npm run dev        # http://localhost:3000
```

Lint / build:

```bash
npm run lint       # tsc --noEmit
npm run build      # vite build + esbuild server.ts -> dist/server.cjs
npm start          # runs the production build locally
```

---

## Deploy to Render (free tier)

One-time, ~5 minutes. Free subdomain (`*.onrender.com`) included with auto-HTTPS.

### 1. Sign in to Render

1. Go to https://dashboard.render.com/ and sign in with your GitHub account.

### 2. Create a Blueprint instance

1. Click **New +** → **Blueprint**.
2. Connect the `dharmppp21/youtube-studio` repo.
3. Render reads `render.yaml` at the repo root and proposes a single **web service** named `youtube-studio`.
4. Click **Apply**.

### 3. Set the Gemini API key

After Render creates the service:

1. Open the `youtube-studio` service page.
2. **Environment** tab → **Add Environment Variable**:
   - Key: `GEMINI_API_KEY`
   - Value: paste your Gemini key from https://aistudio.google.com/app/apikey
3. Save. Render auto-redeploys with the new env var.

### 4. Wait for the first deploy

First deploy takes 3–5 minutes (`npm ci` + `npm run build`). Watch the **Logs** tab. When it says `YouTube Studio Dev server running on http://localhost:3000`, the build succeeded.

### 5. Open your URL

Click the URL at the top of the service page — `https://youtube-studio.onrender.com`. The app loads. Sign in with Google.

### Cold starts (free tier only)

Free Render web services **spin down after 15 minutes of inactivity**. The first request after idle takes 20–40 seconds (Render wakes the service). Subsequent requests are fast. This goes away on the $7/mo paid tier.

---

## Add a custom domain (optional)

1. In Render → your service → **Settings** → **Custom Domain** → add your domain.
2. Render gives you a CNAME target. Add that as a CNAME record in your DNS provider.
3. Wait for DNS to propagate (~5 min usually). Render auto-provisions a Let's Encrypt cert.

---

## Firebase authorized domain

For the Google sign-in popup to work on the deployed URL, add it to Firebase **once**:

1. Firebase Console → https://console.firebase.google.com/ → your project.
2. **Authentication → Sign-in method → Authorized domains**.
3. Click **Add domain**, paste your Render URL (`youtube-studio.onrender.com` or your custom domain).
4. Save.

Without this, the Google popup fails silently with `auth/unauthorized-domain`.

---

## Redeploy after code changes

Render watches your `main` branch. Push to GitHub and Render auto-rebuilds + redeploys. Takes 1–3 minutes.

```bash
git add -A
git commit -m "Your change"
git push origin main
```

Watch the deploy in Render's **Logs** tab. If something breaks, the previous deploy is still live until the new one succeeds.

To deploy a manual rollback: Render → service → **Manual Deploy** → pick an older commit.

---

## Environment variables

| Variable | Required | Where set | Notes |
|---|---|---|---|
| `GEMINI_API_KEY` | yes | Render dashboard | Server throws on startup if missing. |
| `APP_URL` | recommended | `render.yaml` defaults to your Render URL | Used for self-referential links. |
| `NODE_ENV` | yes | `render.yaml` (`production`) | |
| `PORT` | yes | `render.yaml` (`3000`) | Render also sets `PORT` automatically; the value in `render.yaml` is a hint. |

Local dev uses `.env` (git-ignored). Production uses Render's env vars (set in dashboard or in `render.yaml` with `sync: false` for secrets).

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
├── render.yaml               # Render Blueprint (service definition)
├── vite.config.ts            # Vite + Tailwind v4 + React plugin
├── tsconfig.json             # ES2022, bundler resolution, noEmit
└── README.md                 # This file
```

---

## Troubleshooting

**Render build fails with `Cannot find module 'tsx'` or similar.**
`npm ci` ran but something is missing. Check the build log. If it's a `vite` or `esbuild` issue, try a manual deploy from Render → service → **Manual Deploy** → **Clear build cache & deploy**.

**`Gemini API key not configured` in the logs.**
`GEMINI_API_KEY` isn't set in Render's Environment tab, or the deploy hasn't run after you added it. Trigger a manual deploy.

**YouTube sync returns "No YouTube channel found for this Google Account".**
The signed-in Google account has no YouTube channel. Create one at https://youtube.com/create_channel first.

**Google popup fails silently.**
Most often: missing Firebase Authorized domain (see Firebase section above). Less often: YouTube Data API v3 or YouTube Analytics API not enabled in Google Cloud Console, or OAuth consent screen missing the right scopes.

**Firestore quota errors in the browser console.**
Your named Firestore database might not exist. Verify in Firebase Console → Firestore Database that the DB ID in `firebase-applet-config.json` exists. The default ID is `(default)` if you didn't create a named DB.

**Cold start takes 30+ seconds.**
Free tier behavior. First request after 15 min of no traffic triggers a wake-up. To avoid, upgrade to the $7/mo Starter plan.

---

## License

MIT.