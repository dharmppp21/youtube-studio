#!/usr/bin/env bash
# One-shot deploy script for the YouTube Creator Studio applet.
#
# Run from the repo root on the VPS:
#     bash deploy/deploy.sh
#
# What it does:
#   1. Pulls the latest code (if origin is configured).
#   2. Installs deps with `npm ci` (clean install from lockfile).
#   3. Builds the production bundle via `npm run build`.
#   4. Restarts the pm2-managed node process.
#
# Set DEPLOY_NO_PULL=1 to skip the git pull (useful for offline / scp workflows).

set -euo pipefail

cd "$(dirname "$0")/.."
APP_DIR="$(pwd)"

echo "==> Deploying YouTube Creator Studio from $APP_DIR"

# 1. Pull latest code
if [ "${DEPLOY_NO_PULL:-0}" != "1" ] && [ -d .git ]; then
    echo "==> Pulling latest code"
    git pull --ff-only
elif [ -d .git ]; then
    echo "==> Skipping git pull (DEPLOY_NO_PULL=1)"
else
    echo "==> No git repo detected; skipping pull"
fi

# 2. Install deps (skip if node_modules already fresh — uses lockfile)
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
    echo "==> Installing dependencies"
    npm ci
else
    echo "==> node_modules up to date, skipping install"
fi

# 3. Build
echo "==> Building production bundle"
npm run build

# 4. Restart pm2
if pm2 describe youtube-studio >/dev/null 2>&1; then
    echo "==> Restarting pm2 process: youtube-studio"
    pm2 restart youtube-studio
else
    echo "==> Starting pm2 process: youtube-studio"
    pm2 start dist/server.cjs --name youtube-studio --time
    pm2 save
fi

pm2 status youtube-studio

echo "==> Deploy complete."