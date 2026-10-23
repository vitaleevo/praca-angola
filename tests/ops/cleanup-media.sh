#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
DC=(docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml)
export DATABASE_URL=${DATABASE_URL:-postgresql://praca:praca_local_dev@localhost:5432/praca_angola}
export MEDIA_DIR="$ROOT/.data/uploads"
mkdir -p "$MEDIA_DIR"

USER_ID=$("${DC[@]}" exec -T postgres psql -U praca -d praca_angola -qAtc \
  "INSERT INTO users (display_name, email, password_hash) VALUES ('Cleanup E2E', 'cleanup-e2e-$$@praca.invalid', 'x') RETURNING id")
ASSET_ID=$("${DC[@]}" exec -T postgres psql -U praca -d praca_angola -qAtc \
  "INSERT INTO media_assets (owner_user_id, storage_key, mime_type, size_bytes, created_at)
   VALUES ('$USER_ID', 'orphan-$USER_ID.webp', 'image/webp', 10, now() - interval '25 hours') RETURNING id")
touch "$MEDIA_DIR/orphan-$USER_ID.webp"

node apps/api/scripts/cleanup-orphan-media.mjs --dry-run --limit=1000 | grep -q "$ASSET_ID"
test -f "$MEDIA_DIR/orphan-$USER_ID.webp"

node apps/api/scripts/cleanup-orphan-media.mjs --apply --limit=1000
test ! -f "$MEDIA_DIR/orphan-$USER_ID.webp"
COUNT=$("${DC[@]}" exec -T postgres psql -U praca -d praca_angola -qAtc \
  "SELECT count(*) FROM media_assets WHERE id = '$ASSET_ID'")
test "$COUNT" = "0"

"${DC[@]}" exec -T postgres psql -U praca -d praca_angola -c \
  "DELETE FROM users WHERE id = '$USER_ID'"
echo "media cleanup ok"
