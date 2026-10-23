#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
PROJECT=${COMPOSE_PROJECT:-praca-angola-prod}
export COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${COMPOSE_ENV_FILE:-.env.prod}
DEST=${BACKUP_DIR:-/var/backups/praca}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DC=(docker compose --env-file "$ENV_FILE" -p "$PROJECT")

mkdir -p "$DEST"
"${DC[@]}" exec -T postgres sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$DEST/postgres-$STAMP.dump"
(cd "$DEST" && sha256sum "postgres-$STAMP.dump" > "postgres-$STAMP.dump.sha256")
find "$DEST" -name 'postgres-*.dump*' -mtime +14 -delete
