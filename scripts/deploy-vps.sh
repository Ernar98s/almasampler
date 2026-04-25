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

wait_for_http() {
  local url="$1"
  local max_attempts="${2:-20}"
  local delay_seconds="${3:-1}"
  local host_header="${4:-}"
  local attempt=1
  local curl_args=(-fsS)

  if [[ -n "$host_header" ]]; then
    curl_args+=(-H "$host_header")
  fi

  until curl "${curl_args[@]}" "$url" >/dev/null; do
    if (( attempt >= max_attempts )); then
      echo "Health check failed for $url after $attempt attempts"
      return 1
    fi

    sleep "$delay_seconds"
    attempt=$((attempt + 1))
  done
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

wait_for_http http://127.0.0.1:3001/health 30 1
wait_for_http http://127.0.0.1/health 30 1 'Host: almasampler.com'

echo "Deploy finished successfully"
