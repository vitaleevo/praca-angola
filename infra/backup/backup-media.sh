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
MSYS_NO_PATHCONV=1 "${DC[@]}" exec -T api tar czf - -C /app/apps/api/uploads . \
  > "$DEST/media-$STAMP.tar.gz"
(cd "$DEST" && sha256sum "media-$STAMP.tar.gz" > "media-$STAMP.tar.gz.sha256")
find "$DEST" -name 'media-*.tar.gz*' -mtime +14 -delete
