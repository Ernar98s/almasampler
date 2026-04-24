#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV_FILE="${API_ENV_FILE:-$ROOT_DIR/apps/api/.env}"

if [[ -f "$API_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$API_ENV_FILE"
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <db_dump_path> [storage_archive_path]"
  exit 1
fi

DB_DUMP_PATH="$1"
STORAGE_ARCHIVE_PATH="${2:-}"

if [[ ! -f "$DB_DUMP_PATH" ]]; then
  echo "Database dump not found: $DB_DUMP_PATH"
  exit 1
fi

echo "This will overwrite the current database and optionally replace STORAGE_ROOT."
read -r -p "Type RESTORE to continue: " CONFIRMATION

if [[ "$CONFIRMATION" != "RESTORE" ]]; then
  echo "Restore cancelled"
  exit 1
fi

echo "Restoring Postgres from: $DB_DUMP_PATH"
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$DATABASE_URL" \
  "$DB_DUMP_PATH"

if [[ -n "$STORAGE_ARCHIVE_PATH" ]]; then
  if [[ -z "${STORAGE_ROOT:-}" ]]; then
    echo "STORAGE_ROOT is required to restore storage archive"
    exit 1
  fi

  if [[ ! -f "$STORAGE_ARCHIVE_PATH" ]]; then
    echo "Storage archive not found: $STORAGE_ARCHIVE_PATH"
    exit 1
  fi

  echo "Restoring storage from: $STORAGE_ARCHIVE_PATH"
  mkdir -p "$STORAGE_ROOT"
  find "$STORAGE_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
  tar -xzf "$STORAGE_ARCHIVE_PATH" -C "$STORAGE_ROOT"
fi

echo "Restore finished"
