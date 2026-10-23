#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive --format=tar HEAD | tar -x -C "$TMP"
docker build -f "$TMP/apps/api/Dockerfile" -t praca-api:clean "$TMP"
docker build -f "$TMP/apps/web/Dockerfile" -t praca-web:clean "$TMP"
echo "clean builds ok"
