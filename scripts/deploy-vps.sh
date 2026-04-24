#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/var/www/almasampler"
WEB_DIST_DIR="$APP_DIR/apps/web/dist"
WEB_ROOT_DIR="/var/www/almasampler-web"

if [[ -z "${SUDO_PASSWORD:-}" ]]; then
  echo "SUDO_PASSWORD is required"
  exit 1
fi

sudo_run() {
  printf '%s\n' "$SUDO_PASSWORD" | sudo -S -p '' "$@"
}

cd "$APP_DIR"

if [[ -f "$APP_DIR/apps/api/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$APP_DIR/apps/api/.env"
  set +a
fi

corepack enable >/dev/null 2>&1 || true

pnpm install --frozen-lockfile
pnpm --filter @almasampler/api prisma:migrate
pnpm build

sudo_run mkdir -p "$WEB_ROOT_DIR"
sudo_run cp -r "$WEB_DIST_DIR"/. "$WEB_ROOT_DIR"/
sudo_run systemctl restart almasampler-api
sudo_run systemctl reload nginx

curl -fsS http://127.0.0.1:3001/health >/dev/null
curl -fsS -H 'Host: almasampler.com' http://127.0.0.1/health >/dev/null

echo "Deploy finished successfully"
