#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
DC=(docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml)
if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
  COMPOSE_FILES="docker-compose.yml;compose.dev.yml"
else
  COMPOSE_FILES="docker-compose.yml:compose.dev.yml"
fi

BACKUP_DIR="$TMP" COMPOSE_PROJECT=praca-angola-dev \
  COMPOSE_FILE="$COMPOSE_FILES" \
  COMPOSE_ENV_FILE=.env.example \
  bash infra/backup/backup-postgres.sh

DUMP=$(find "$TMP" -name 'postgres-*.dump' | head -1)
test -n "$DUMP"
(cd "$TMP" && sha256sum -c "$(basename "$DUMP").sha256")

BACKUP_DIR="$TMP" COMPOSE_PROJECT=praca-angola-dev \
  COMPOSE_FILE="$COMPOSE_FILES" \
  COMPOSE_ENV_FILE=.env.example \
  bash infra/backup/backup-media.sh

MEDIA_TAR=$(find "$TMP" -name 'media-*.tar.gz' | head -1)
test -n "$MEDIA_TAR"
(cd "$TMP" && sha256sum -c "$(basename "$MEDIA_TAR").sha256")

"${DC[@]}" exec -T postgres psql -U praca -d postgres -c 'DROP DATABASE IF EXISTS praca_restore_test;'
"${DC[@]}" exec -T postgres psql -U praca -d postgres -c 'CREATE DATABASE praca_restore_test;'

COMPOSE_PROJECT=praca-angola-dev \
  COMPOSE_FILE="$COMPOSE_FILES" \
  COMPOSE_ENV_FILE=.env.example \
  bash infra/backup/restore-postgres.sh "$DUMP" praca_restore_test

for table in users listings orders service_requests; do
  src=$("${DC[@]}" exec -T postgres psql -U praca -d praca_angola -Atc "SELECT count(*) FROM $table")
  dst=$("${DC[@]}" exec -T postgres psql -U praca -d praca_restore_test -Atc "SELECT count(*) FROM $table")
  test "$src" = "$dst" || { echo "mismatch in $table: $src != $dst"; exit 1; }
done

"${DC[@]}" exec -T postgres psql -U praca -d postgres -c 'DROP DATABASE praca_restore_test;'
echo "backup restore ok"
