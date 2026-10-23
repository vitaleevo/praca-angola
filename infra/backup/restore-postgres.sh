#!/usr/bin/env bash
set -euo pipefail
DUMP=${1:?Usage: restore-postgres.sh <dump> <database>}
DB=${2:?Usage: restore-postgres.sh <dump> <database>}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
PROJECT=${COMPOSE_PROJECT:-praca-angola-prod}
export COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${COMPOSE_ENV_FILE:-.env.prod}
DC=(docker compose --env-file "$ENV_FILE" -p "$PROJECT")

"${DC[@]}" exec -T postgres sh -c \
  "dropdb -U \"\$POSTGRES_USER\" --if-exists \"$DB\" && createdb -U \"\$POSTGRES_USER\" \"$DB\""
"${DC[@]}" exec -T postgres sh -c \
  "pg_restore -U \"\$POSTGRES_USER\" -d \"$DB\" --no-owner --no-privileges" < "$DUMP"
