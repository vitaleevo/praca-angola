#!/usr/bin/env bash
set -euo pipefail
BASE_URL=${BASE_URL:?Define BASE_URL}
echo "checking $BASE_URL"
curl -fsS "$BASE_URL/api/v1/health/ready" | grep -q '"status":"ok"'
curl -fsSI "$BASE_URL/" | grep -qi 'x-frame-options: DENY'
curl -fsSI "$BASE_URL/" | grep -qi 'content-security-policy-report-only'
# 404 é o comportamento esperado sem token; não usar -f, que falharia no 404.
curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/api/v1/metrics" | grep -q '404'
echo "smoke ok"
