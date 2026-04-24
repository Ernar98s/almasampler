#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_ENV_FILE="${API_ENV_FILE:-$ROOT_DIR/apps/api/.env}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
INCLUDE_STORAGE_BACKUP="${INCLUDE_STORAGE_BACKUP:-1}"

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

TIMESTAMP="$(date '+%Y-%m-%d_%H-%M-%S')"
DB_BACKUP_DIR="$BACKUP_DIR/postgres"
STORAGE_BACKUP_DIR="$BACKUP_DIR/storage"

mkdir -p "$DB_BACKUP_DIR"

DB_BACKUP_FILE="$DB_BACKUP_DIR/almasampler-db-$TIMESTAMP.dump"

echo "Creating Postgres backup: $DB_BACKUP_FILE"
pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$DB_BACKUP_FILE" \
  "$DATABASE_URL"

if [[ "$INCLUDE_STORAGE_BACKUP" == "1" ]] && [[ -n "${STORAGE_ROOT:-}" ]] && [[ -d "$STORAGE_ROOT" ]]; then
  mkdir -p "$STORAGE_BACKUP_DIR"
  STORAGE_BACKUP_FILE="$STORAGE_BACKUP_DIR/almasampler-storage-$TIMESTAMP.tar.gz"
  echo "Creating storage backup: $STORAGE_BACKUP_FILE"
  tar -czf "$STORAGE_BACKUP_FILE" -C "$STORAGE_ROOT" .
fi

echo "Cleaning backups older than $BACKUP_RETENTION_DAYS days"
find "$DB_BACKUP_DIR" -type f -name '*.dump' -mtime +"$BACKUP_RETENTION_DAYS" -delete

if [[ -d "$STORAGE_BACKUP_DIR" ]]; then
  find "$STORAGE_BACKUP_DIR" -type f -name '*.tar.gz' -mtime +"$BACKUP_RETENTION_DAYS" -delete
fi

echo "Backup finished"
