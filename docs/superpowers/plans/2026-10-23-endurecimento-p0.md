# Endurecimento P0 — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar os oito bloqueadores P0 da auditoria e deixar o Praça Angola pronto para um beta público controlado, sem alterar funcionalidades de produto.

**Architecture:** O trabalho é incremental e em camadas: primeiro cria-se a rede de segurança (Git, builds reproduzíveis, lint, testes, CI); depois resiliência operacional (backups, logs, health, métricas); depois controlos de segurança e abuso (headers, quotas, rate limits); por fim configuração de produção, segredos e verificação de go-live. Cada camada depende da anterior e termina num entregável testável.

**Tech Stack:** Node 24, pnpm 11.25.0, NestJS 12.2.0, Next.js 16.4.2, PostgreSQL 18, Redis 8, Docker Compose, NGINX, Caddy, Playwright, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-23-endurecimento-p0.md`

## Global Constraints

- Manter Node 24, pnpm 11.25.0, PostgreSQL 18, Redis 8, Next.js 16.4.2 e NestJS 12.2.0.
- Todos os endpoints novos usam o prefixo global `/api/v1`.
- Erros novos da API usam o formato `{ code, message }`; respostas 429 incluem `Retry-After`.
- Migrações são idempotentes, numeradas e aplicadas por `apps/api/scripts/migrate.mjs`.
- Nenhum segredo entra no Git; `.env`, `.env.prod`, `.data/` e uploads continuam ignorados.
- Código novo em TypeScript; sem `any` novo sem justificação.
- Mensagens visíveis ao utilizador em português (pt-PT/pt-AO).
- Comandos assumem Git Bash/WSL no Windows; no CI correm em Ubuntu.
- Cada tarefa termina com `pnpm typecheck`, `pnpm lint`, testes relevantes e um commit convencional.
- Sempre que `pnpm-lock.yaml` ou `apps/api/package.json` mudar, reconstruir a stack (`pnpm stack:dev:build`) antes de testes que correm em contentores.
- Não introduzir Meilisearch, object storage, HA ou refactor de UI neste plano.

## Review Focus

Estas são as cinco falhas mais prováveis que a especificação implica e que os testes de cada tarefa devem fixar:

1. **Uploads concorrentes no limite da quota** — dois pedidos simultâneos não podem exceder a quota; teste em Task 9.
2. **Redis indisponível durante rate limiting** — a escrita deve continuar disponível (fail-open) e registar alerta; teste em Task 11.
3. **`X-Forwarded-For` forjado** — limites de IP não podem ser contornados por cabeçalhos do cliente; teste em Task 11.
4. **CSP report-only a quebrar a hidratação do Next.js** — zero violações nas páginas principais; teste em Task 8.
5. **Rotação de chave com ciphertext misto** — valores antigos e novos têm de decifrar durante a rotação; teste em Task 13.

---

### Task 1: Git baseline e builds reproduzíveis

**Files:**
- Modify: `apps/api/Dockerfile:1-6`
- Modify: `apps/web/Dockerfile:1-6`
- Modify: `.dockerignore`
- Create: `.gitattributes`
- Create: `tests/ops/clean-build.sh`

**Interfaces:**
- Consumes: nenhum.
- Produces: repositório Git com commit baseline; imagens Docker construídas sem `.data/corepack-cache`.

- [ ] **Step 1: Inicializar o repositório e confirmar os ignores**

```bash
git init
git add -A
git status --short
git check-ignore -v .env.prod .data node_modules apps/api/uploads
```

Esperado: `.env.prod`, `.data`, `node_modules` e `apps/api/uploads` aparecem como ignorados; só source, docs e lockfiles estão staged.

- [ ] **Step 2: Normalizar line endings**

Criar `.gitattributes`:

```gitattributes
* text=auto
*.sh text eol=lf
```

- [ ] **Step 3: Remover a dependência do cache local de pnpm nos Dockerfiles**

Em `apps/api/Dockerfile` e `apps/web/Dockerfile`, substituir:

```dockerfile
COPY .data/corepack-cache/v1/pnpm/11.25.0 /root/.cache/node/corepack/v1/pnpm/11.25.0
```

por:

```dockerfile
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack prepare pnpm@11.25.0 --activate
```

O `ENV` evita que o Corepack fique à espera de confirmação interativa durante o build.

Em `.dockerignore`, remover as exceções que mantêm `.data/corepack-cache` no contexto; `.data` deve ficar totalmente fora das imagens.

- [ ] **Step 4: Escrever o teste de build limpo**

Criar `tests/ops/clean-build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git archive --format=tar HEAD | tar -x -C "$TMP"
docker build -f "$TMP/apps/api/Dockerfile" -t praca-api:clean "$TMP"
docker build -f "$TMP/apps/web/Dockerfile" -t praca-web:clean "$TMP"
echo "clean builds ok"
```

- [ ] **Step 5: Commit baseline e executar o teste**

```bash
git add -A
git branch -M main
git commit -m "chore: initialize repository and make Docker builds reproducible"
git tag v0.1.0-baseline
bash tests/ops/clean-build.sh
```

Esperado: `clean builds ok`; nenhum aviso sobre `.data/corepack-cache`.

- [ ] **Step 6: Confirmar que nenhum segredo foi versionado**

```bash
git ls-files | grep -E '(^|/)\.env($|\.)' || true
```

Esperado: apenas `.env.example` e `.env.prod.example`.

---

### Task 2: Limpeza do lint do web

**Files:**
- Modify: `apps/web/package.json` (script `lint`)
- Modify: todos os ficheiros reportados por `pnpm --filter @praca/web lint`, incluindo:
  - `apps/web/src/app/conta/mensagens/page.tsx`
  - `apps/web/src/app/conta/mensagens/[id]/page.tsx`
  - `apps/web/src/app/produtos/[slug]/page.tsx`
  - `apps/web/src/app/vendedor/page.tsx`
  - `apps/web/src/app/vendedor/anuncios/[id]/page.tsx`
  - `apps/web/src/app/vendedor/anuncios/novo/page.tsx`
  - `apps/web/src/components/account-view.tsx`
  - `apps/web/src/components/cart-view.tsx`
  - `apps/web/src/components/moderation-dashboard.tsx`
  - `apps/web/src/components/product-actions.tsx`

**Interfaces:**
- Consumes: páginas e componentes atuais.
- Produces: `pnpm --filter @praca/web lint` com 0 erros e 0 avisos.

- [ ] **Step 1: Confirmar o baseline**

```bash
pnpm --filter @praca/web lint
```

Esperado: 18 erros e 7 avisos (25 problemas), exit 1.

- [ ] **Step 2: Substituir âncoras internas por `next/link`**

Em cada `<a href="/...">` interno, importar `Link` de `next/link` e substituir o elemento. Manter `<a>` apenas para links externos.

- [ ] **Step 3: Substituir imagens por `next/image`**

Para imagens com dimensões conhecidas, usar `<Image width={...} height={...} ... />`. Para imagens de utilizador servidas pela API, usar `fill` dentro de um contentor com dimensões e `unoptimized` para evitar dupla otimização. Se uma exceção for inevitável, adicionar um comentário a justificar e a diretiva `eslint-disable-next-line @next/next/no-img-element`.

- [ ] **Step 4: Substituir navegação imperativa**

Em componentes cliente, trocar `window.location.href = "/..."` por `useRouter().push("/...")` (ou `router.refresh()` quando o objetivo é revalidar).

- [ ] **Step 5: Tornar o lint bloqueante**

Em `apps/web/package.json`:

```json
"lint": "eslint . --max-warnings=0"
```

- [ ] **Step 6: Verificar**

```bash
pnpm stack:dev
pnpm --filter @praca/web lint
pnpm --filter @praca/web typecheck
pnpm test:e2e -- tests/e2e/marketplaces.spec.mjs
```

Esperado: lint e typecheck com exit 0; E2E de marketplaces verde.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "fix(web): resolve lint errors and warnings"
```

---

### Task 3: Lint e testes unitários da API

**Files:**
- Create: `apps/api/eslint.config.mjs`
- Create: `apps/api/vitest.config.ts`
- Create: `apps/api/src/auth/auth.crypto.spec.ts`
- Modify: `apps/api/package.json`

**Interfaces:**
- Consumes: `hashPassword(password: string): Promise<string>` e `verifyPassword(password: string, stored: string): Promise<boolean>` de `apps/api/src/auth/auth.crypto.ts`.
- Produces: scripts `lint`, `test`, `test:watch`; runner Vitest; baseline de lint da API.

- [ ] **Step 1: Adicionar dependências e scripts**

```bash
pnpm --filter @praca/api add -D eslint typescript-eslint vitest
```

Em `apps/api/package.json`:

```json
"lint": "eslint . --max-warnings=0",
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Criar configuração do ESLint**

`apps/api/eslint.config.mjs`:

```js
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
```

- [ ] **Step 3: Criar configuração do Vitest**

`apps/api/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.spec.ts"], environment: "node" },
});
```

- [ ] **Step 4: Escrever o teste de caracterização da autenticação**

`apps/api/src/auth/auth.crypto.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./auth.crypto";

describe("password hashing", () => {
  it("accepts the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });
});
```

- [ ] **Step 5: Executar lint e testes**

```bash
pnpm --filter @praca/api test
pnpm --filter @praca/api lint
pnpm --filter @praca/api typecheck
```

Esperado: teste passa; lint e typecheck com exit 0. Corrigir imports não usados e variáveis mortas reportadas; não desativar regras sem justificação.

- [ ] **Step 6: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "chore(api): add eslint and vitest baseline"
```

---

### Task 4: Pipeline de CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: scripts `typecheck`, `lint`, `build`, `test` e `test:e2e`; Dockerfiles da Task 1.
- Produces: pipeline com jobs `quality`, `migrations` e `e2e`.

- [ ] **Step 1: Tornar o Playwright compatível com CI**

Em `playwright.config.ts`, usar Chromium empacotado no CI e Chrome local:

```ts
use: {
  baseURL: "http://localhost:3100",
  channel: process.env.CI ? undefined : "chrome",
  headless: true,
  viewport: { width: 1440, height: 1000 },
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
},
```

- [ ] **Step 2: Criar o workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.25.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm --filter @praca/api test
      - run: pnpm build

  migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18-alpine
        env:
          POSTGRES_DB: praca_angola
          POSTGRES_USER: praca
          POSTGRES_PASSWORD: praca
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U praca -d praca_angola"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 10
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.25.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @praca/api db:migrate
        env:
          DATABASE_URL: postgresql://praca:praca@localhost:5432/praca_angola
      - run: pnpm --filter @praca/api db:migrate
        env:
          DATABASE_URL: postgresql://praca:praca@localhost:5432/praca_angola
      - run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - run: psql postgresql://praca:praca@localhost:5432/praca_angola -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.25.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml up -d --build
      - run: |
          ready=0
          for i in $(seq 1 90); do
            if curl -fsS http://localhost:3100/_ingress-health; then ready=1; break; fi
            sleep 2
          done
          test "$ready" = "1"
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      - if: failure()
        run: docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml logs --no-color
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: output/playwright
      - if: always()
        run: docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml down -v
```

- [ ] **Step 3: Criar o repositório remoto e abrir um PR**

Criar um repositório privado no GitHub, adicionar o remoto e fazer push de um branch. O URL é definido pelo responsável:

```bash
git remote add origin <git-remote-url>
git push -u origin main
git checkout -b chore/ci-baseline
git push -u origin chore/ci-baseline
```

- [ ] **Step 4: Verificar o pipeline**

No PR, confirmar que `quality`, `migrations` e `e2e` ficam verdes. Se o E2E falhar, consultar o artefacto `playwright-report` e os logs do Compose.

- [ ] **Step 5: Ativar proteção de branch**

Em `main`, exigir os checks `quality`, `migrations` e `e2e` antes de merge.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml playwright.config.ts
git commit -m "ci: add quality, migration and e2e pipelines"
```

---

### Task 5: Backups e restauro testado

**Files:**
- Create: `infra/backup/backup-postgres.sh`
- Create: `infra/backup/backup-media.sh`
- Create: `infra/backup/restore-postgres.sh`
- Create: `tests/ops/backup-restore.sh`
- Create: `docs/operations/backups.md`

**Interfaces:**
- Consumes: serviços `postgres` e `api` do Compose; volume de media.
- Produces: scripts de backup/restauro; teste automatizado de restauro.

- [ ] **Step 1: Escrever o teste de restauro (deve falhar)**

`tests/ops/backup-restore.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
DC=(docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml)

BACKUP_DIR="$TMP" COMPOSE_PROJECT=praca-angola-dev \
  COMPOSE_FILE="docker-compose.yml:compose.dev.yml" \
  COMPOSE_ENV_FILE=.env.example \
  bash infra/backup/backup-postgres.sh

DUMP=$(find "$TMP" -name 'postgres-*.dump' | head -1)
test -n "$DUMP"
(cd "$TMP" && sha256sum -c "$(basename "$DUMP").sha256")

BACKUP_DIR="$TMP" COMPOSE_PROJECT=praca-angola-dev \
  COMPOSE_FILE="docker-compose.yml:compose.dev.yml" \
  COMPOSE_ENV_FILE=.env.example \
  bash infra/backup/backup-media.sh

MEDIA_TAR=$(find "$TMP" -name 'media-*.tar.gz' | head -1)
test -n "$MEDIA_TAR"
(cd "$TMP" && sha256sum -c "$(basename "$MEDIA_TAR").sha256")

"${DC[@]}" exec -T postgres psql -U praca -d postgres -c 'DROP DATABASE IF EXISTS praca_restore_test;'
"${DC[@]}" exec -T postgres psql -U praca -d postgres -c 'CREATE DATABASE praca_restore_test;'

COMPOSE_PROJECT=praca-angola-dev \
  COMPOSE_FILE="docker-compose.yml:compose.dev.yml" \
  COMPOSE_ENV_FILE=.env.example \
  bash infra/backup/restore-postgres.sh "$DUMP" praca_restore_test

for table in users listings orders service_requests; do
  src=$("${DC[@]}" exec -T postgres psql -U praca -d praca_angola -Atc "SELECT count(*) FROM $table")
  dst=$("${DC[@]}" exec -T postgres psql -U praca -d praca_restore_test -Atc "SELECT count(*) FROM $table")
  test "$src" = "$dst" || { echo "mismatch in $table: $src != $dst"; exit 1; }
done

"${DC[@]}" exec -T postgres psql -U praca -d postgres -c 'DROP DATABASE praca_restore_test;'
echo "backup restore ok"
```

- [ ] **Step 2: Implementar o backup do PostgreSQL**

`infra/backup/backup-postgres.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
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
```

- [ ] **Step 3: Implementar o backup de media**

`infra/backup/backup-media.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
PROJECT=${COMPOSE_PROJECT:-praca-angola-prod}
export COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.prod.yml}
ENV_FILE=${COMPOSE_ENV_FILE:-.env.prod}
DEST=${BACKUP_DIR:-/var/backups/praca}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DC=(docker compose --env-file "$ENV_FILE" -p "$PROJECT")

mkdir -p "$DEST"
"${DC[@]}" exec -T api tar czf - -C /app/apps/api/uploads . \
  > "$DEST/media-$STAMP.tar.gz"
(cd "$DEST" && sha256sum "media-$STAMP.tar.gz" > "media-$STAMP.tar.gz.sha256")
find "$DEST" -name 'media-*.tar.gz*' -mtime +14 -delete
```

- [ ] **Step 4: Implementar o restauro**

`infra/backup/restore-postgres.sh`:

```bash
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
```

- [ ] **Step 5: Executar o teste**

```bash
pnpm stack:dev
bash tests/ops/backup-restore.sh
```

Esperado: `backup restore ok`.

- [ ] **Step 6: Documentar a operação**

`docs/operations/backups.md` deve incluir:

- agenda: PostgreSQL a cada 6 horas; media diariamente;
- retenção: 14 dias;
- cópia off-host com `rclone` ou `rsync` para storage externo;
- RPO 6h (dados) / 24h (media); RTO 2h;
- procedimento de restauro completo e teste mensal;
- exemplo de `systemd` timer ou `cron`;
- responsável e escalonamento.

- [ ] **Step 7: Commit**

```bash
git add infra/backup tests/ops/backup-restore.sh docs/operations/backups.md
git commit -m "feat(ops): add tested postgres and media backups"
```

---

### Task 6: Logs estruturados, request IDs e error tracking

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/src/observability/request-id.ts`
- Create: `apps/api/src/observability/request-id.spec.ts`
- Create: `apps/api/src/observability/logging.ts`
- Create: `apps/api/src/observability/sentry.filter.ts`

**Interfaces:**
- Consumes: `AppModule`, `NestFactory`.
- Produces: `normalizeRequestId(value: string | undefined): string`; logs JSON com `req.id`; filtro Sentry para 5xx.

- [ ] **Step 1: Escrever o teste do request ID (deve falhar)**

`apps/api/src/observability/request-id.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeRequestId } from "./request-id";

describe("normalizeRequestId", () => {
  it("keeps a valid client request id", () => {
    expect(normalizeRequestId("req-12345678")).toBe("req-12345678");
  });

  it("replaces newline injection with a UUID", () => {
    expect(normalizeRequestId("bad\nvalue")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("truncates values longer than 64 characters", () => {
    expect(normalizeRequestId("a".repeat(100))).toHaveLength(64);
  });
});
```

- [ ] **Step 2: Executar e confirmar a falha**

```bash
pnpm --filter @praca/api test -- request-id.spec.ts
```

Esperado: FAIL porque `request-id.ts` não existe.

- [ ] **Step 3: Implementar `normalizeRequestId`**

`apps/api/src/observability/request-id.ts`:

```ts
import { randomUUID } from "node:crypto";

const VALID = /^[A-Za-z0-9._:-]{8,64}$/;

export function normalizeRequestId(value: string | undefined): string {
  if (!value) return randomUUID();
  const candidate = value.slice(0, 64);
  return VALID.test(candidate) ? candidate : randomUUID();
}
```

- [ ] **Step 4: Adicionar dependências e configurar o logger**

```bash
pnpm --filter @praca/api add nestjs-pino pino pino-http @sentry/node
```

`apps/api/src/observability/logging.ts`:

```ts
import type { Options } from "pino-http";
import { normalizeRequestId } from "./request-id";

export const loggerConfig = {
  pinoHttp: {
    genReqId: (req, res) => {
      const header = req.headers["x-request-id"];
      const id = normalizeRequestId(Array.isArray(header) ? header[0] : header);
      res.setHeader("x-request-id", id);
      return id;
    },
    redact: [
      "req.headers.cookie",
      "req.headers.authorization",
      "res.headers['set-cookie']",
    ],
    autoLogging: {
      ignore: (req) =>
        req.url === "/api/v1/health" ||
        req.url === "/api/v1/health/live" ||
        req.url === "/api/v1/health/ready",
    },
  },
} satisfies { pinoHttp: Options };
```

- [ ] **Step 5: Ligar o logger e o Sentry**

Em `apps/api/src/app.module.ts`, importar `LoggerModule.forRoot(loggerConfig)`.

Em `apps/api/src/main.ts`:

```ts
import * as Sentry from "@sentry/node";
import { Logger } from "nestjs-pino";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

const app = await NestFactory.create(AppModule, { bufferLogs: true });
app.useLogger(app.get(Logger));
```

Criar `apps/api/src/observability/sentry.filter.ts`:

```ts
import { ArgumentsHost, Catch, HttpException } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import * as Sentry from "@sentry/node";

@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500 && Sentry.getClient()) Sentry.captureException(exception);
    super.catch(exception, host);
  }
}
```

Registar o filtro em `main.ts` com `app.useGlobalFilters(new SentryExceptionFilter(app.get(HttpAdapterHost).httpAdapter))`.

- [ ] **Step 6: Verificar**

```bash
pnpm stack:dev:build
pnpm --filter @praca/api test
pnpm --filter @praca/api typecheck
curl -si http://localhost:4000/api/v1/health -H 'x-request-id: req-12345678' | grep -i x-request-id
```

Esperado: teste verde; resposta contém `x-request-id: req-12345678`; logs em JSON com `req.id`.

- [ ] **Step 7: Commit**

```bash
git add apps/api pnpm-lock.yaml
git commit -m "feat(api): add structured logs, request ids and error tracking"
```

---

### Task 7: Health/readiness, métricas e alertas

**Files:**
- Modify: `apps/api/src/health.controller.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Modify: `infra/nginx/default.conf.template`
- Modify: `.env.example`
- Modify: `.env.prod.example`
- Modify: `docker-compose.prod.yml`
- Create: `apps/api/src/health.service.ts`
- Create: `apps/api/src/health.service.spec.ts`
- Create: `apps/api/src/observability/metrics.service.ts`
- Create: `apps/api/src/observability/metrics.controller.ts`
- Create: `apps/api/src/observability/metrics.interceptor.ts`
- Create: `infra/monitoring/alerts.yml`
- Create: `docs/operations/monitoring.md`

**Interfaces:**
- Consumes: `DatabaseService`; tabela `service_notification_outbox`; `MEDIA_DIR`.
- Produces: `GET /api/v1/health/live`, `GET /api/v1/health/ready`, `GET /api/v1/metrics`; `HealthReport`.

- [ ] **Step 1: Escrever o teste do health service (deve falhar)**

`apps/api/src/health.service.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("reports ready when database, outbox and media are healthy", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1, lag: 0 }] }) };
    const service = new HealthService(db as never);
    await expect(service.check(() => Promise.resolve())).resolves.toMatchObject({
      status: "ok",
      checks: { db: "ok", outboxLagSeconds: 0, media: "ok" },
    });
  });

  it("reports degraded when the database is down", async () => {
    const db = { query: vi.fn().mockRejectedValue(new Error("down")) };
    const service = new HealthService(db as never);
    await expect(service.check(() => Promise.resolve())).resolves.toMatchObject({
      status: "degraded",
      checks: { db: "down" },
    });
  });

  it("reports degraded when outbox lag exceeds five minutes", async () => {
    const db = { query: vi.fn().mockResolvedValue({ rows: [{ ok: 1, lag: 600 }] }) };
    const service = new HealthService(db as never);
    await expect(service.check(() => Promise.resolve())).resolves.toMatchObject({
      status: "degraded",
      checks: { outboxLagSeconds: 600 },
    });
  });
});
```

- [ ] **Step 2: Executar e confirmar a falha**

```bash
pnpm --filter @praca/api test -- health.service.spec.ts
```

Esperado: FAIL porque `health.service.ts` não existe.

- [ ] **Step 3: Implementar o health service e o controller**

`apps/api/src/health.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { access, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { DatabaseService } from "./database/database.service";

export type HealthReport = {
  status: "ok" | "degraded";
  checks: { db: "ok" | "down"; outboxLagSeconds: number; media: "ok" | "down" };
};

@Injectable()
export class HealthService {
  constructor(private readonly db: DatabaseService) {}

  private async defaultMediaCheck(): Promise<void> {
    const directory = process.env.MEDIA_DIR ?? join(process.cwd(), "apps", "api", "uploads");
    await mkdir(directory, { recursive: true });
    await access(directory, constants.W_OK);
  }

  async check(mediaCheck: () => Promise<void> = () => this.defaultMediaCheck()): Promise<HealthReport> {
    let db: "ok" | "down" = "ok";
    let outboxLagSeconds = 0;
    let media: "ok" | "down" = "ok";

    try {
      const result = await this.db.query<{ lag: number }>(
        `SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(next_attempt_at))), 0)::int AS lag
         FROM service_notification_outbox
         WHERE status IN ('pending', 'processing', 'failed')`,
      );
      outboxLagSeconds = Math.max(0, result.rows[0]?.lag ?? 0);
    } catch {
      db = "down";
    }

    try {
      await mediaCheck();
    } catch {
      media = "down";
    }

    return {
      status: db === "ok" && media === "ok" && outboxLagSeconds <= 300 ? "ok" : "degraded",
      checks: { db, outboxLagSeconds, media },
    };
  }
}
```

`apps/api/src/health.controller.ts`:

```ts
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("live")
  live() {
    return { status: "ok", service: "praca-api" };
  }

  @Get("ready")
  async ready() {
    const report = await this.health.check();
    if (report.status !== "ok") throw new ServiceUnavailableException(report);
    return report;
  }

  @Get()
  readyAlias() {
    return this.ready();
  }
}
```

Registar `HealthService` em `app.module.ts`.

- [ ] **Step 4: Adicionar métricas**

```bash
pnpm --filter @praca/api add prom-client
```

`apps/api/src/observability/metrics.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  private readonly requests: Counter<"method" | "route" | "status">;
  private readonly duration: Histogram<"method" | "route" | "status">;
  private readonly outbox: Gauge;

  constructor(private readonly db: DatabaseService) {
    this.requests = new Counter({
      name: "praca_http_requests_total",
      help: "Total de pedidos HTTP",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });
    this.duration = new Histogram({
      name: "praca_http_request_duration_seconds",
      help: "Duração dos pedidos HTTP",
      labelNames: ["method", "route", "status"],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
    this.outbox = new Gauge({
      name: "praca_outbox_oldest_age_seconds",
      help: "Idade do evento mais antigo no outbox",
      registers: [this.registry],
      collect: async () => {
        const result = await this.db.query<{ lag: number }>(
          `SELECT COALESCE(EXTRACT(EPOCH FROM (now() - min(next_attempt_at))), 0)::int AS lag
           FROM service_notification_outbox
           WHERE status IN ('pending', 'processing', 'failed')`,
        );
        this.outbox.set(Math.max(0, result.rows[0]?.lag ?? 0));
      },
    });
    collectDefaultMetrics({ register: this.registry });
  }

  record(method: string, route: string, status: number, seconds: number): void {
    this.requests.inc({ method, route, status: String(status) });
    this.duration.observe({ method, route, status: String(status) }, seconds);
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }
}
```

Criar `metrics.controller.ts` com guard de token:

```ts
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  async get(
    @Headers("x-metrics-token") token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const expected = process.env.METRICS_TOKEN;
    if (!expected || token !== expected) throw new NotFoundException();
    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    return this.metrics.metrics();
  }
}
```

Criar `metrics.interceptor.ts` com `APP_INTERCEPTOR` para medir `Date.now()` e `request.route?.path ?? "unmatched"` (evita cardinalidade alta em 404). Registar `HealthService`, `MetricsService`, `MetricsController` e o interceptor em `app.module.ts`.

Adicionar a `.env.example` e `.env.prod.example`:

```dotenv
METRICS_TOKEN=replace-with-a-long-random-token
SENTRY_DSN=
```

Em `docker-compose.prod.yml`, passar as variáveis ao serviço `api`:

```yaml
METRICS_TOKEN: ${METRICS_TOKEN:-}
SENTRY_DSN: ${SENTRY_DSN:-}
```

- [ ] **Step 5: Proteger as métricas no ingress**

Em `infra/nginx/default.conf.template`, em ambos os `server` blocks, antes de `location /`:

```nginx
location = /api/v1/metrics {
    return 404;
}
```

- [ ] **Step 6: Adicionar regras de alerta**

`infra/monitoring/alerts.yml`:

```yaml
groups:
  - name: praca-api
    rules:
      - alert: PracaApiDown
        expr: up{job="praca-api"} == 0
        for: 2m
        labels: { severity: critical }
        annotations: { summary: "API Praça Angola em baixo" }
      - alert: PracaHigh5xxRate
        expr: sum(rate(praca_http_requests_total{status=~"5.."}[5m])) / sum(rate(praca_http_requests_total[5m])) > 0.02
        for: 10m
        labels: { severity: critical }
        annotations: { summary: "Taxa de 5xx acima de 2%" }
      - alert: PracaOutboxLag
        expr: praca_outbox_oldest_age_seconds > 300
        for: 10m
        labels: { severity: warning }
        annotations: { summary: "Outbox atrasado há mais de 5 minutos" }
      - alert: PracaDiskLow
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"} < 0.15
        for: 15m
        labels: { severity: warning }
        annotations: { summary: "Menos de 15% de disco livre no host" }
```

`docs/operations/monitoring.md` deve documentar o scrape do endpoint interno com token, o `node_exporter` necessário para o alerta de disco e o procedimento de silenciamento.

- [ ] **Step 7: Verificar**

```bash
pnpm stack:dev:build
pnpm --filter @praca/api test
pnpm --filter @praca/api typecheck
curl -si http://localhost:4000/api/v1/health/ready
curl -si http://localhost:4000/api/v1/metrics
docker run --rm -v "$PWD/infra/monitoring:/etc/prometheus" prom/prometheus promtool check rules /etc/prometheus/alerts.yml
```

Esperado: readiness 200 com `checks.db=ok`; métricas 404 sem token; regras válidas.

- [ ] **Step 8: Commit**

```bash
git add apps/api pnpm-lock.yaml docker-compose.prod.yml infra/nginx/default.conf.template infra/monitoring docs/operations/monitoring.md
git commit -m "feat(api): add readiness checks, metrics and alert rules"
```

---

### Task 8: Cabeçalhos de segurança e CSP report-only

**Files:**
- Modify: `infra/Caddyfile`
- Modify: `infra/nginx/default.conf.template`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/main.ts`
- Create: `apps/api/src/security.controller.ts`
- Create: `tests/e2e/security-headers.spec.mjs`
- Create: `docs/operations/security-headers.md`

**Interfaces:**
- Consumes: Caddy no host; NGINX ingress; Next.js.
- Produces: headers de segurança; `POST /api/v1/csp-report` com 204.

- [ ] **Step 1: Escrever o teste E2E (deve falhar)**

`tests/e2e/security-headers.spec.mjs`:

```js
import { test, expect } from "@playwright/test";

test("security headers are present on the web app", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
});

test("csp reports are accepted", async ({ request }) => {
  const response = await request.post("/api/v1/csp-report", {
    data: { "csp-report": { "violated-directive": "script-src" } },
  });
  expect(response.status()).toBe(204);
});
```

- [ ] **Step 2: Executar e confirmar a falha**

```bash
pnpm test:e2e -- tests/e2e/security-headers.spec.mjs
```

Esperado: FAIL por headers em falta e endpoint 404.

- [ ] **Step 3: Adicionar headers no Next.js (dev e acesso direto)**

Em `apps/web/next.config.ts`:

```ts
async headers() {
  return [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        {
          key: "Content-Security-Policy-Report-Only",
          value:
            "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; report-uri /api/v1/csp-report",
        },
      ],
    },
  ];
},
```

- [ ] **Step 4: Adicionar headers no Caddy (produção)**

`infra/Caddyfile`:

```caddyfile
{
	email {$ACME_EMAIL}
}

{$PUBLIC_DOMAIN} {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		Cross-Origin-Opener-Policy "same-origin"
		Cross-Origin-Resource-Policy "same-origin"
		-Server
	}
	reverse_proxy 172.30.255.3:80
}
```

Nota: o CSP e os restantes headers de conteúdo são emitidos pelo Next.js; o Caddy acrescenta HSTS, COOP/CORP e remove o header `Server`. `script-src 'unsafe-inline'` é temporário para a hidratação do Next.js. A fase seguinte (fora deste plano) introduz nonces via `middleware.ts` e remove `unsafe-inline`.

- [ ] **Step 5: Adicionar headers no NGINX para a API**

Em `infra/nginx/default.conf.template`, dentro de cada `server`:

```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
```

No `location /` do primeiro `server` (web), esconder os headers estáticos do Next para o NGINX não os duplicar:

```nginx
proxy_hide_header X-Content-Type-Options;
proxy_hide_header X-Frame-Options;
proxy_hide_header Referrer-Policy;
proxy_hide_header Permissions-Policy;
```

O `Content-Security-Policy-Report-Only` continua a vir do Next. No segundo `server` (API), não esconder nada.

Adicionar uma zona para relatórios CSP:

```nginx
limit_req_zone $binary_remote_addr zone=csp_report:10m rate=30r/m;
```

E, em ambos os `server` blocks, antes de `location /`:

```nginx
location = /api/v1/csp-report {
    limit_req zone=csp_report burst=10 nodelay;
    proxy_pass http://api_upstream;
    include /etc/nginx/proxy-common.conf;
}
```

- [ ] **Step 6: Criar o endpoint de relatórios CSP**

`apps/api/src/security.controller.ts`:

```ts
import { Body, Controller, HttpCode, Logger, Post } from "@nestjs/common";

@Controller("csp-report")
export class SecurityController {
  private readonly logger = new Logger(SecurityController.name);

  @Post()
  @HttpCode(204)
  report(@Body() body: unknown): void {
    this.logger.warn({ csp: body }, "CSP violation");
  }
}
```

Registar `SecurityController` em `app.module.ts`.

Nota: os browsers enviam relatórios com `Content-Type: application/csp-report`. Para o body ser registado, adicionar em `main.ts`:

```ts
app.useBodyParser("json", { type: ["application/json", "application/csp-report"] });
```

O endpoint responde sempre `204`, mesmo que o body não seja parseado.

- [ ] **Step 7: Verificar**

```bash
pnpm stack:dev
pnpm test:e2e -- tests/e2e/security-headers.spec.mjs
caddy validate --config infra/Caddyfile
```

Esperado: E2E verde; Caddy válido. Em staging, `curl -sI https://<domínio>` deve mostrar HSTS e CSP report-only.

- [ ] **Step 8: Commit**

```bash
git add infra/Caddyfile infra/nginx/default.conf.template apps/web/next.config.ts apps/api/src/security.controller.ts apps/api/src/app.module.ts apps/api/src/main.ts tests/e2e/security-headers.spec.mjs docs/operations/security-headers.md
git commit -m "feat(security): add security headers and csp reporting"
```

---

### Task 9: Quotas de upload por utilizador

**Files:**
- Create: `apps/api/migrations/010_media_quota.sql`
- Create: `apps/api/src/media/media-quota.service.ts`
- Create: `apps/api/src/media/media-quota.service.spec.ts`
- Create: `tests/e2e/upload-quota.spec.mjs`
- Modify: `apps/api/src/media.controller.ts`
- Modify: `apps/api/src/seller.controller.ts`
- Modify: `apps/api/src/ads.controller.ts`
- Modify: `apps/api/src/services/professionals.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `.env.example`
- Modify: `.env.prod.example`
- Modify: `docker-compose.prod.yml`

**Interfaces:**
- Consumes: `media_assets(owner_user_id, size_bytes, deleted_at)`; `DatabaseService.transaction`.
- Produces: `MediaQuotaService.reserve(userId: string, asset: MediaAssetInput): Promise<void>`; `release(assetId: string): Promise<void>`; `MediaAssetInput = { id: string; storageKey: string; mimeType: "image/webp"; sizeBytes: number }`.

- [ ] **Step 1: Escrever o teste unitário (deve falhar)**

`apps/api/src/media/media-quota.service.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { MediaQuotaService } from "./media-quota.service";

describe("MediaQuotaService", () => {
  it("rejects an upload that exceeds the byte quota", async () => {
    const db = {
      transaction: vi.fn(async (work: (client: unknown) => Promise<void>) =>
        work({
          query: vi
            .fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ bytes: String(49 * 1024 * 1024), count: "1" }] })
            .mockResolvedValueOnce({ rows: [] }),
        }),
      ),
    };
    const service = new MediaQuotaService(db as never);
    await expect(
      service.reserve("user-1", {
        id: "asset-1",
        storageKey: "asset-1.webp",
        mimeType: "image/webp",
        sizeBytes: 2 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("accepts an upload within the quota", async () => {
    const db = {
      transaction: vi.fn(async (work: (client: unknown) => Promise<void>) =>
        work({
          query: vi
            .fn()
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ bytes: "0", count: "0" }] })
            .mockResolvedValueOnce({ rows: [] }),
        }),
      ),
    };
    const service = new MediaQuotaService(db as never);
    await expect(
      service.reserve("user-1", {
        id: "asset-1",
        storageKey: "asset-1.webp",
        mimeType: "image/webp",
        sizeBytes: 1024,
      }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Executar e confirmar a falha**

```bash
pnpm --filter @praca/api test -- media-quota.service.spec.ts
```

Esperado: FAIL porque o serviço não existe.

- [ ] **Step 3: Criar a migração**

`apps/api/migrations/010_media_quota.sql`:

```sql
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS media_assets_owner_active_idx
  ON media_assets(owner_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
```

- [ ] **Step 4: Implementar o serviço**

`apps/api/src/media/media-quota.service.ts`:

```ts
import { Injectable, PayloadTooLargeException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";

export type MediaAssetInput = {
  id: string;
  storageKey: string;
  mimeType: "image/webp";
  sizeBytes: number;
};

export type MediaQuotaConfig = { maxBytes: number; maxAssets: number };

const config = (): MediaQuotaConfig => ({
  maxBytes: Number(process.env.MEDIA_QUOTA_BYTES_PER_USER ?? 50 * 1024 * 1024),
  maxAssets: Number(process.env.MEDIA_QUOTA_ASSETS_PER_USER ?? 100),
});

@Injectable()
export class MediaQuotaService {
  constructor(private readonly db: DatabaseService) {}

  private get quota(): MediaQuotaConfig {
    return config();
  }

  async reserve(userId: string, asset: MediaAssetInput): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [userId]);
      const usage = await client.query<{ bytes: string; count: string }>(
        `SELECT COALESCE(SUM(size_bytes), 0)::text AS bytes, count(*)::text AS count
         FROM media_assets
         WHERE owner_user_id = $1 AND deleted_at IS NULL`,
        [userId],
      );
      const bytes = Number(usage.rows[0]?.bytes ?? 0);
      const count = Number(usage.rows[0]?.count ?? 0);
      if (bytes + asset.sizeBytes > this.quota.maxBytes) {
        throw new PayloadTooLargeException({
          code: "MEDIA_QUOTA_EXCEEDED",
          message: "Atingiste o limite de armazenamento de imagens.",
        });
      }
      if (count + 1 > this.quota.maxAssets) {
        throw new PayloadTooLargeException({
          code: "MEDIA_QUOTA_EXCEEDED",
          message: "Atingiste o limite de imagens.",
        });
      }
      await client.query(
        `INSERT INTO media_assets (id, owner_user_id, storage_key, mime_type, size_bytes)
         VALUES ($1, $2, $3, $4, $5)`,
        [asset.id, userId, asset.storageKey, asset.mimeType, asset.sizeBytes],
      );
    });
  }

  async release(assetId: string): Promise<void> {
    await this.db.query("DELETE FROM media_assets WHERE id = $1", [assetId]);
  }
}
```

- [ ] **Step 5: Integrar no controller**

Em `media.controller.ts`:

1. Injetar `MediaQuotaService`.
2. Depois de normalizar, gerar `id` e `storageKey`.
3. Chamar `await this.quota.reserve(user.id, { id, storageKey, mimeType: "image/webp", sizeBytes: normalized.length })`.
4. Fazer `mkdir` e escrever o ficheiro dentro de um `try`; no `catch`, remover um ficheiro parcial com `rm(filePath, { force: true })`, chamar `await this.quota.release(id)` e relançar.
5. Remover o `INSERT` antigo.
6. No `read`, adicionar `AND deleted_at IS NULL` à query.
7. Atualizar as validações de assets por id em `seller.controller.ts` (linhas 122, 287 e 321), `ads.controller.ts` (linha 39) e `services/professionals.service.ts` (linha 46) para incluírem `AND deleted_at IS NULL`.

- [ ] **Step 6: Documentar as variáveis**

Em `.env.example` e `.env.prod.example`:

```dotenv
MEDIA_QUOTA_BYTES_PER_USER=52428800
MEDIA_QUOTA_ASSETS_PER_USER=100
```

Em `docker-compose.prod.yml`, passar ao serviço `api`:

```yaml
MEDIA_QUOTA_BYTES_PER_USER: ${MEDIA_QUOTA_BYTES_PER_USER:-52428800}
MEDIA_QUOTA_ASSETS_PER_USER: ${MEDIA_QUOTA_ASSETS_PER_USER:-100}
```

- [ ] **Step 7: Escrever o teste E2E de quota**

`tests/e2e/upload-quota.spec.mjs`:

```js
import { test, expect } from "@playwright/test";
import { account, context, cleanup, db, validPng } from "./fixtures.mjs";

test("upload quota rejects the request after the asset limit", async ({ browser }) => {
  const user = await account("Quota E2E");
  const ctx = await context(browser, user);
  const request = ctx.request;

  for (let i = 0; i < 99; i++) {
    await db.query(
      `INSERT INTO media_assets (owner_user_id, storage_key, mime_type, size_bytes)
       VALUES ($1, $2, 'image/webp', 1)`,
      [user.id, `quota-${user.id}-${i}.webp`],
    );
  }

  const upload = () =>
    request.post("/api/v1/media", {
      data: validPng,
      headers: { "Content-Type": "image/png" },
    });

  const first = await upload();
  expect(first.status()).toBe(201);

  const second = await upload();
  expect(second.status()).toBe(413);
  await expect(second.json()).resolves.toMatchObject({ code: "MEDIA_QUOTA_EXCEEDED" });

  await ctx.close();
  await cleanup();
});

test("concurrent uploads at the boundary do not exceed the quota", async ({ browser }) => {
  const user = await account("Quota Concurrent E2E");
  const ctx = await context(browser, user);
  const request = ctx.request;

  for (let i = 0; i < 99; i++) {
    await db.query(
      `INSERT INTO media_assets (owner_user_id, storage_key, mime_type, size_bytes)
       VALUES ($1, $2, 'image/webp', 1)`,
      [user.id, `quota-c-${user.id}-${i}.webp`],
    );
  }

  const upload = () =>
    request.post("/api/v1/media", {
      data: validPng,
      headers: { "Content-Type": "image/png" },
    });
  const responses = await Promise.all([upload(), upload()]);
  expect(responses.map((r) => r.status()).sort()).toEqual([201, 413]);

  await ctx.close();
  await cleanup();
});
```

Nota: o controller atual devolve 201 por omissão do Nest para `POST`; confirmar o status no teste e ajustar se necessário.

- [ ] **Step 8: Executar**

```bash
pnpm stack:dev
pnpm --filter @praca/api db:migrate
pnpm --filter @praca/api test
pnpm test:e2e -- tests/e2e/upload-quota.spec.mjs
```

Esperado: unitários verdes; E2E com 201 e 413; concorrência com exatamente um 201 e um 413.

- [ ] **Step 9: Commit**

```bash
git add apps/api/migrations/010_media_quota.sql apps/api/src/media apps/api/src/media.controller.ts apps/api/src/seller.controller.ts apps/api/src/ads.controller.ts apps/api/src/services/professionals.service.ts apps/api/src/app.module.ts .env.example .env.prod.example docker-compose.prod.yml tests/e2e/upload-quota.spec.mjs
git commit -m "feat(media): enforce per-user upload quotas"
```

---

### Task 10: Limpeza de media órfão

**Files:**
- Create: `apps/api/scripts/cleanup-orphan-media.mjs`
- Create: `tests/ops/cleanup-media.sh`
- Create: `docs/operations/media.md`
- Modify: `apps/api/package.json` (script `media:cleanup`)

**Interfaces:**
- Consumes: tabelas `media_assets`, `listing_images`, `seller_profiles`, `professional_profiles`, `professional_portfolio`, `ad_campaigns`; diretório `MEDIA_DIR`.
- Produces: CLI `node apps/api/scripts/cleanup-orphan-media.mjs [--dry-run|--apply] [--limit=100]`.

- [ ] **Step 1: Escrever o teste (deve falhar)**

`tests/ops/cleanup-media.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
DC=(docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml)
export DATABASE_URL=${DATABASE_URL:-postgresql://praca:praca_local_dev@localhost:5432/praca_angola}
export MEDIA_DIR="$ROOT/.data/uploads"
mkdir -p "$MEDIA_DIR"

USER_ID=$("${DC[@]}" exec -T postgres psql -U praca -d praca_angola -Atc \
  "INSERT INTO users (display_name, email, password_hash) VALUES ('Cleanup E2E', 'cleanup-e2e-$$@praca.invalid', 'x') RETURNING id")
ASSET_ID=$("${DC[@]}" exec -T postgres psql -U praca -d praca_angola -Atc \
  "INSERT INTO media_assets (owner_user_id, storage_key, mime_type, size_bytes, created_at)
   VALUES ('$USER_ID', 'orphan-$USER_ID.webp', 'image/webp', 10, now() - interval '25 hours') RETURNING id")
touch "$MEDIA_DIR/orphan-$USER_ID.webp"

node apps/api/scripts/cleanup-orphan-media.mjs --dry-run --limit=1000 | grep -q "$ASSET_ID"
test -f "$MEDIA_DIR/orphan-$USER_ID.webp"

node apps/api/scripts/cleanup-orphan-media.mjs --apply --limit=1000
test ! -f "$MEDIA_DIR/orphan-$USER_ID.webp"
COUNT=$("${DC[@]}" exec -T postgres psql -U praca -d praca_angola -Atc \
  "SELECT count(*) FROM media_assets WHERE id = '$ASSET_ID'")
test "$COUNT" = "0"

"${DC[@]}" exec -T postgres psql -U praca -d praca_angola -c \
  "DELETE FROM users WHERE id = '$USER_ID'"
echo "media cleanup ok"
```

- [ ] **Step 2: Implementar o script**

`apps/api/scripts/cleanup-orphan-media.mjs` deve:

1. Ler `DATABASE_URL` e `MEDIA_DIR` (default: `.data/uploads` no host; o contentor define `MEDIA_DIR`).
2. Importar `pg` com `createRequire(new URL("../package.json", import.meta.url))`, para resolver a dependência a partir de `apps/api`.
3. Aceitar `--dry-run` (default), `--apply`, `--limit=N`.
4. Selecionar assets com `created_at < now() - interval '24 hours'` e sem referências em `listing_images`, `seller_profiles` (logo/cover), `professional_profiles.photo_asset_id`, `professional_portfolio.asset_id` e `ad_campaigns.image_asset_id`.
5. Em `--dry-run`, imprimir `id storage_key` e não alterar nada.
6. Em `--apply`, apagar o ficheiro (ignorar `ENOENT`) e a linha; imprimir um resumo `scanned=... deleted=...`.
7. Usar `basename(storage_key)` ao construir o caminho do ficheiro, para impedir path traversal.
8. Falhar com exit 1 se `DATABASE_URL` estiver em falta.

- [ ] **Step 3: Adicionar script ao package.json**

```json
"media:cleanup": "node scripts/cleanup-orphan-media.mjs"
```

- [ ] **Step 4: Executar o teste**

```bash
pnpm stack:dev
bash tests/ops/cleanup-media.sh
```

Esperado: `media cleanup ok`.

- [ ] **Step 5: Documentar**

`docs/operations/media.md` deve incluir quota, retenção, limpeza, localização do volume, backup e procedimento para restaurar media.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/cleanup-orphan-media.mjs apps/api/package.json tests/ops/cleanup-media.sh docs/operations/media.md
git commit -m "feat(media): add orphan media cleanup"
```

---

### Task 11: Rate limits de escrita por utilizador

**Files:**
- Create: `apps/api/src/rate-limit/rate-limit.decorator.ts`
- Create: `apps/api/src/rate-limit/rate-limit.service.ts`
- Create: `apps/api/src/rate-limit/rate-limit.guard.ts`
- Create: `apps/api/src/rate-limit/rate-limit.module.ts`
- Create: `apps/api/src/rate-limit/rate-limit.guard.spec.ts`
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/community.controller.ts`
- Modify: `apps/api/src/services/services.controller.ts`
- Modify: `apps/api/src/orders.controller.ts`
- Modify: `apps/api/src/media.controller.ts`
- Modify: `infra/nginx/default.conf.template`
- Modify: `.env.example`
- Modify: `.env.prod.example`
- Modify: `docker-compose.prod.yml`
- Modify: `tests/e2e/fixtures.mjs`

**Interfaces:**
- Consumes: `REDIS_URL`; `AuthenticatedRequest.user.id`; `SessionGuard`.
- Produces: `@RateLimit(rule: RateLimitRule)`; `RateLimitGuard`; `RateLimitService.consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>`; `RateLimitRule = { scope: string; limit: number; windowSeconds: number }`; `RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number }`.

- [ ] **Step 1: Escrever o teste do guard (deve falhar)**

`apps/api/src/rate-limit/rate-limit.guard.spec.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { RateLimitGuard } from "./rate-limit.guard";

describe("RateLimitGuard", () => {
  it("throws 429 when the limiter denies the request", async () => {
    const limiter = {
      consume: vi.fn().mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 42 }),
    };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({ scope: "message", limit: 30, windowSeconds: 60 }),
    };
    const guard = new RateLimitGuard(limiter as never, reflector as never);
    const response = { setHeader: vi.fn() };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: "u1" }, ip: "127.0.0.1" }),
        getResponse: () => response,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(context as never)).rejects.toMatchObject({ status: 429 });
    expect(response.setHeader).toHaveBeenCalledWith("Retry-After", "42");
  });

  it("allows the request when no rule is present", async () => {
    const limiter = { consume: vi.fn() };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) };
    const guard = new RateLimitGuard(limiter as never, reflector as never);
    const context = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    };
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Executar e confirmar a falha**

```bash
pnpm --filter @praca/api test -- rate-limit.guard.spec.ts
```

Esperado: FAIL porque o guard não existe.

- [ ] **Step 3: Implementar decorator, serviço e guard**

```bash
pnpm --filter @praca/api add ioredis
```

`rate-limit.decorator.ts`:

```ts
import { SetMetadata } from "@nestjs/common";

export type RateLimitRule = { scope: string; limit: number; windowSeconds: number };
export const RATE_LIMIT_KEY = "rate_limit";
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT_KEY, rule);
```

`rate-limit.service.ts`:

```ts
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfter: number };

const SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {current, redis.call('TTL', KEYS[1])}
`;

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly redis: Redis | null;

  constructor() {
    const url = process.env.REDIS_URL;
    this.redis = url ? new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    if (!this.redis || process.env.RATE_LIMIT_ENABLED === "false") {
      return { allowed: true, remaining: limit, retryAfter: 0 };
    }
    try {
      const [current, ttl] = (await this.redis.eval(
        SCRIPT,
        1,
        `rl:${key}`,
        windowSeconds,
      )) as [number, number];
      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        retryAfter: Math.max(0, ttl > 0 ? ttl : windowSeconds),
      };
    } catch (error) {
      this.logger.warn(`rate limit unavailable: ${(error as Error).message}`);
      return { allowed: true, remaining: limit, retryAfter: 0 };
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis?.status === "ready") await this.redis.quit();
    else this.redis?.disconnect();
  }
}
```

`rate-limit.guard.ts`:

```ts
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RATE_LIMIT_KEY, RateLimitRule } from "./rate-limit.decorator";
import { RateLimitService } from "./rate-limit.service";
import { AuthenticatedRequest } from "../auth/auth.types";

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = this.reflector.getAllAndOverride<RateLimitRule>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const subject = request.user?.id ?? request.ip ?? "anonymous";
    const result = await this.limiter.consume(
      `${rule.scope}:${subject}`,
      rule.limit,
      rule.windowSeconds,
    );
    if (!result.allowed) {
      const response = context
        .switchToHttp()
        .getResponse<{ setHeader(name: string, value: string): void }>();
      response.setHeader("Retry-After", String(result.retryAfter));
      throw new HttpException(
        {
          code: "RATE_LIMITED",
          message: "Muitos pedidos. Aguarda antes de tentar novamente.",
          retryAfter: result.retryAfter,
        },
        429,
      );
    }
    return true;
  }
}
```

`rate-limit.module.ts`:

```ts
import { Global, Module } from "@nestjs/common";
import { RateLimitGuard } from "./rate-limit.guard";
import { RateLimitService } from "./rate-limit.service";

@Global()
@Module({
  providers: [RateLimitService, RateLimitGuard],
  exports: [RateLimitService, RateLimitGuard],
})
export class RateLimitModule {}
```

Importar `RateLimitModule` em `app.module.ts`.

- [ ] **Step 4: Aplicar os limites**

Adicionar `RateLimitGuard` aos `@UseGuards` existentes (sempre depois de `SessionGuard`) e o decorator por método:

| Controller / método | Scope | Limite | Janela |
|---|---|---:|---:|
| `ConversationsController.start` | `conversation-start` | 10 | 60s |
| `ConversationsController.sendMessage` | `message` | 30 | 60s |
| `ReportsController.create` | `report` | 5 | 3600s |
| `ReviewsController.create` | `review` | 10 | 3600s |
| `FavoritesController.add` / `remove` | `favorite` | 60 | 60s |
| `ServicesController.create` | `service-request` | 5 | 3600s |
| `ServicesController.propose` | `proposal` | 10 | 3600s |
| `ServicesController.message` | `service-message` | 60 | 60s |
| `OrdersController.checkout` | `checkout` | 10 | 60s |
| `MediaController.upload` | `media-upload` | 10 | 60s |

Exemplo:

```ts
@Post(":id/messages")
@RateLimit({ scope: "message", limit: 30, windowSeconds: 60 })
async sendMessage(...) { ... }
```

Em `.env.example` e `.env.prod.example`:

```dotenv
RATE_LIMIT_ENABLED=true
```

Em `docker-compose.prod.yml`, passar ao serviço `api`:

```yaml
RATE_LIMIT_ENABLED: ${RATE_LIMIT_ENABLED:-true}
```

- [ ] **Step 5: Adicionar backstop de IP no NGINX**

No topo de `infra/nginx/default.conf.template`:

```nginx
map $request_method $write_limit_key {
    default "";
    POST    $binary_remote_addr;
    PUT     $binary_remote_addr;
    PATCH   $binary_remote_addr;
    DELETE  $binary_remote_addr;
}
limit_req_zone $write_limit_key zone=write_api:10m rate=120r/m;
```

Em ambos os `server` blocks, antes de `location /`:

```nginx
location ~* ^/api/v1/(conversations|reports|reviews|services|orders|media)(/|$) {
    limit_req zone=write_api burst=60 nodelay;
    limit_req_status 429;
    error_page 429 = @write_rate_limited;
    proxy_pass http://api_upstream;
    include /etc/nginx/proxy-common.conf;
}

location @write_rate_limited {
    internal;
    default_type application/json;
    add_header Retry-After 60 always;
    add_header Cache-Control "no-store" always;
    return 429 '{"code":"RATE_LIMITED","message":"Muitos pedidos. Aguarda antes de tentar novamente."}';
}
```

As localizações de `auth` são avaliadas antes desta regex e mantêm os seus limites próprios. O `map` deixa a chave vazia para métodos de leitura, pelo que `GET` não consome o orçamento de escrita.

Teste de regressão de IP: repetir 130 `POST` para `/api/v1/reports` com valores diferentes de `X-Forwarded-For`. Como `trusted-proxies.conf` não confia em fontes diretas e `proxy-common.conf` substitui o header, o NGINX deve usar o IP real e devolver `429` depois do burst.

- [ ] **Step 6: Escrever o teste E2E de mensagens**

`tests/e2e/rate-limits.spec.mjs`:

```js
import { test, expect } from "@playwright/test";
import {
  account,
  context,
  cleanup,
  db,
  json,
  listingSettings,
  storeSettings,
} from "./fixtures.mjs";

test("message rate limit returns 429 after 30 messages", async ({ browser }) => {
  const seller = await account("Rate Seller", "seller");
  const buyer = await account("Rate Buyer");
  const otherBuyer = await account("Rate Other Buyer");
  const sellerCtx = await context(browser, seller);
  const buyerCtx = await context(browser, buyer);
  const otherCtx = await context(browser, otherBuyer);

  await json(
    await sellerCtx.request.put("/api/v1/seller/profile", {
      data: storeSettings("Loja Rate E2E"),
    }),
  );
  const listing = await json(
    await sellerCtx.request.post("/api/v1/seller/listings", {
      data: listingSettings("Produto Rate Limit E2E"),
    }),
  );
  await db.query("UPDATE listings SET status = 'published' WHERE id = $1", [listing.id]);

  const conversation = await json(
    await buyerCtx.request.post("/api/v1/conversations", {
      data: { listingId: listing.id, body: "Olá" },
    }),
  );

  for (let i = 0; i < 30; i++) {
    const response = await buyerCtx.request.post(
      `/api/v1/conversations/${conversation.conversationId}/messages`,
      { data: { body: `Mensagem ${i}` } },
    );
    expect(response.status()).toBe(201);
  }

  const blocked = await buyerCtx.request.post(
    `/api/v1/conversations/${conversation.conversationId}/messages`,
    { data: { body: "Mensagem bloqueada" } },
  );
  expect(blocked.status()).toBe(429);
  expect(blocked.headers()["retry-after"]).toBeDefined();
  await expect(blocked.json()).resolves.toMatchObject({ code: "RATE_LIMITED" });

  const otherConversation = await json(
    await otherCtx.request.post("/api/v1/conversations", {
      data: { listingId: listing.id, body: "Olá" },
    }),
  );
  const otherMessage = await otherCtx.request.post(
    `/api/v1/conversations/${otherConversation.conversationId}/messages`,
    { data: { body: "Mensagem de outro utilizador" } },
  );
  expect(otherMessage.status()).toBe(201);

  await Promise.all([sellerCtx.close(), buyerCtx.close(), otherCtx.close()]);
  await cleanup();
});
```

Nota: o teste usa o DTO real (`storeSettings`/`listingSettings`) e publica o anúncio diretamente na base de dados, porque a criação fica em `pending_review`. A limpeza de fixtures passa a apagar `messages` e `conversations` antes de `listings` (ver Step 6b).

- [ ] **Step 6b: Atualizar a limpeza de fixtures**

Em `tests/e2e/fixtures.mjs`, antes de `DELETE FROM listings`, apagar mensagens e conversas dos utilizadores de teste:

```js
await client.query(
  `DELETE FROM messages WHERE conversation_id IN (
     SELECT id FROM conversations
     WHERE buyer_id=ANY($1::uuid[])
        OR seller_profile_id IN (SELECT id FROM seller_profiles WHERE owner_user_id=ANY($1::uuid[]))
   )`,
  [users],
);
await client.query(
  `DELETE FROM conversations
   WHERE buyer_id=ANY($1::uuid[])
      OR seller_profile_id IN (SELECT id FROM seller_profiles WHERE owner_user_id=ANY($1::uuid[]))`,
  [users],
);
```

- [ ] **Step 7: Verificar falha do Redis**

Com a stack de dev a correr:

```bash
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml stop redis
# enviar uma mensagem; deve devolver 201 e registar "rate limit unavailable"
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml start redis
```

Esperado: escrita continua disponível; log de aviso; após reiniciar, limites voltam.

O log `rate limit unavailable` é o sinal de alerta: no agregador de logs, criar uma regra para notificar quando ocorrer mais de uma vez em 5 minutos. Sem esse alerta, uma falha prolongada do Redis passa silenciosamente em fail-open.

- [ ] **Step 8: Executar**

```bash
pnpm stack:dev:build
pnpm --filter @praca/api test
pnpm test:e2e -- tests/e2e/rate-limits.spec.mjs
```

Esperado: testes verdes.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/rate-limit apps/api/src/app.module.ts apps/api/src/community.controller.ts apps/api/src/services/services.controller.ts apps/api/src/orders.controller.ts apps/api/src/media.controller.ts apps/api/package.json pnpm-lock.yaml docker-compose.prod.yml infra/nginx/default.conf.template .env.example .env.prod.example tests/e2e/rate-limits.spec.mjs tests/e2e/fixtures.mjs
git commit -m "feat(security): add per-user write rate limits"
```

---

### Task 12: Validação de ambiente, SMTP e TLS

**Files:**
- Create: `apps/api/src/config/env.ts`
- Create: `apps/api/src/config/env.spec.ts`
- Modify: `apps/api/src/main.ts`
- Modify: `docker-compose.prod.yml`
- Modify: `.env.prod.example`
- Create: `docs/operations/production-checklist.md`
- Create: `docs/operations/email.md`
- Create: `docs/operations/tls.md`

**Interfaces:**
- Consumes: `process.env`.
- Produces: `validateEnv(env?: NodeJS.ProcessEnv): void`; falha rápida no arranque.

- [ ] **Step 1: Escrever os testes (devem falhar)**

`apps/api/src/config/env.spec.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateEnv } from "./env";

const production = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://praca:secret@postgres:5432/praca_angola",
  WEB_ORIGIN: "https://marketplace.example",
  PUBLIC_SITE_URL: "https://marketplace.example",
  APP_ENCRYPTION_KEY: "a".repeat(32),
  SMTP_HOST: "smtp.example",
  SMTP_PORT: "587",
  SMTP_FROM: "Praça Angola <no-reply@marketplace.example>",
  SMTP_SECURE: "false",
  MEDIA_DIR: "/app/apps/api/uploads",
  REDIS_URL: "redis://redis:6379",
};

describe("validateEnv", () => {
  it("accepts a complete production environment", () => {
    expect(() => validateEnv(production)).not.toThrow();
  });

  it("rejects a missing SMTP host", () => {
    expect(() => validateEnv({ ...production, SMTP_HOST: "" })).toThrow(/SMTP_HOST/);
  });

  it("rejects a localhost public URL in production", () => {
    expect(() => validateEnv({ ...production, PUBLIC_SITE_URL: "http://localhost:3200" }))
      .toThrow(/PUBLIC_SITE_URL/);
  });

  it("rejects a short encryption key in production", () => {
    expect(() => validateEnv({ ...production, APP_ENCRYPTION_KEY: "short" }))
      .toThrow(/32/);
  });

  it("rejects SMTP user without password", () => {
    expect(() => validateEnv({ ...production, SMTP_USER: "user" }))
      .toThrow(/SMTP_PASSWORD/);
  });

  it("rejects an invalid SMTP_SECURE flag", () => {
    expect(() => validateEnv({ ...production, SMTP_SECURE: "yes" }))
      .toThrow(/SMTP_SECURE/);
  });
});
```

- [ ] **Step 2: Executar e confirmar a falha**

```bash
pnpm --filter @praca/api test -- env.spec.ts
```

Esperado: FAIL porque `env.ts` não existe.

- [ ] **Step 3: Implementar `validateEnv`**

`apps/api/src/config/env.ts`:

```ts
const required = ["DATABASE_URL", "WEB_ORIGIN", "APP_ENCRYPTION_KEY"];

export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing environment variables: ${missing.join(", ")}`);

  const production = env.NODE_ENV === "production";
  if (!production) return;

  const prodRequired = ["PUBLIC_SITE_URL", "SMTP_HOST", "SMTP_FROM", "MEDIA_DIR", "REDIS_URL"];
  const prodMissing = prodRequired.filter((key) => !env[key]?.trim());
  if (prodMissing.length) {
    throw new Error(`Missing production environment variables: ${prodMissing.join(", ")}`);
  }

  if (env.APP_ENCRYPTION_KEY!.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY must contain at least 32 characters");
  }

  for (const key of ["PUBLIC_SITE_URL", "WEB_ORIGIN"]) {
    let url: URL;
    try {
      url = new URL(env[key]!);
    } catch {
      throw new Error(`${key} must be a valid URL`);
    }
    if (url.protocol !== "https:") throw new Error(`${key} must use https in production`);
    if (["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error(`${key} cannot point to localhost in production`);
    }
  }

  const port = Number(env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid port");
  }
  if (env.SMTP_SECURE && !["true", "false"].includes(env.SMTP_SECURE)) {
    throw new Error("SMTP_SECURE must be true or false");
  }
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) {
    throw new Error("SMTP_USER and SMTP_PASSWORD must be provided together");
  }
}
```

- [ ] **Step 4: Chamar no arranque**

No topo de `apps/api/src/main.ts`:

```ts
import { validateEnv } from "./config/env";

validateEnv();
```

- [ ] **Step 5: Tornar o Compose de produção fail-fast**

Em `docker-compose.prod.yml`, substituir os defaults por obrigatórios:

```yaml
PUBLIC_SITE_URL: ${PUBLIC_SITE_URL:?Define PUBLIC_SITE_URL}
SMTP_HOST: ${SMTP_HOST:?Define SMTP_HOST}
SMTP_FROM: ${SMTP_FROM:?Define SMTP_FROM}
```

- [ ] **Step 6: Documentar SMTP e TLS**

`docs/operations/production-checklist.md` deve listar as variáveis obrigatórias (`PUBLIC_SITE_URL`, `SMTP_*`, `DATABASE_URL`, `REDIS_URL`, `APP_ENCRYPTION_KEY`, `METRICS_TOKEN`, quotas e rate limits) e indicar que `.env.prod` é atualizado fora do Git, com permissões `600`.

`docs/operations/email.md` deve cobrir:

- variáveis `SMTP_*`;
- verificação de registo e reset em staging;
- SPF, DKIM e DMARC no DNS;
- teste com `swaks` ou Mailpit;
- procedimento se o SMTP falhar (registo devolve 503; monitorizar).

`docs/operations/tls.md` deve cobrir:

- instalação do Caddy no host;
- `PUBLIC_DOMAIN` e `ACME_EMAIL`;
- `caddy validate` e `caddy reload`;
- verificação com `curl -I https://<domínio>` e `openssl s_client`;
- renovação automática e alerta de expiração.

- [ ] **Step 7: Verificar**

```bash
pnpm --filter @praca/api test
docker compose --env-file .env.prod.example -p praca-angola-prod -f docker-compose.prod.yml config >/dev/null
```

Esperado: testes verdes; `docker compose config` aceita o exemplo. Com um `.env.prod` incompleto, o comando deve falhar a indicar a variável em falta.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/config apps/api/src/main.ts docker-compose.prod.yml .env.prod.example docs/operations/production-checklist.md docs/operations/email.md docs/operations/tls.md
git commit -m "feat(config): validate production environment and document email/tls"
```

---

### Task 13: Segredos e rotação da chave de cifra

**Files:**
- Modify: `apps/api/src/auth/auth.crypto.ts`
- Create: `apps/api/src/auth/auth.crypto.rotation.spec.ts`
- Create: `apps/api/scripts/rotate-encryption-key.mjs`
- Modify: `.env.prod.example`
- Modify: `docker-compose.prod.yml`
- Create: `docs/operations/secrets.md`

**Interfaces:**
- Consumes: `APP_ENCRYPTION_KEY`, `APP_ENCRYPTION_KEY_PREVIOUS`; colunas `seller_profiles.mcx_recipient_name_ciphertext` e `mcx_phone_ciphertext`.
- Produces: `decryptPrivateValue` com fallback para a chave anterior; CLI de rotação com `--dry-run`, `--apply`, `--verify`.

- [ ] **Step 1: Escrever o teste de rotação (deve falhar)**

`apps/api/src/auth/auth.crypto.rotation.spec.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { decryptPrivateValue, encryptPrivateValue } from "./auth.crypto";

describe("encryption key rotation", () => {
  afterEach(() => {
    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
  });

  it("decrypts with the previous key during rotation", () => {
    process.env.APP_ENCRYPTION_KEY = "old-key-old-key-old-key-old-key";
    const ciphertext = encryptPrivateValue("923111111");

    process.env.APP_ENCRYPTION_KEY = "new-key-new-key-new-key-new-key";
    process.env.APP_ENCRYPTION_KEY_PREVIOUS = "old-key-old-key-old-key-old-key";
    expect(decryptPrivateValue(ciphertext)).toBe("923111111");

    delete process.env.APP_ENCRYPTION_KEY_PREVIOUS;
    expect(() => decryptPrivateValue(ciphertext)).toThrow();
  });
});
```

- [ ] **Step 2: Executar e confirmar a falha**

```bash
pnpm --filter @praca/api test -- auth.crypto.rotation.spec.ts
```

Esperado: FAIL porque `APP_ENCRYPTION_KEY_PREVIOUS` ainda não é considerado.

- [ ] **Step 3: Implementar o key ring**

Em `auth.crypto.ts`, substituir `encryptionKey()` por:

```ts
function encryptionKeys(): Buffer[] {
  const secrets = [process.env.APP_ENCRYPTION_KEY, process.env.APP_ENCRYPTION_KEY_PREVIOUS]
    .filter((value): value is string => Boolean(value?.trim()));
  if (!secrets.length) throw new Error("APP_ENCRYPTION_KEY is required");
  if (process.env.NODE_ENV === "production" && secrets[0].length < 32) {
    throw new Error("APP_ENCRYPTION_KEY must contain at least 32 characters");
  }
  return secrets.map((secret) => createHash("sha256").update(secret).digest());
}
```

`encryptPrivateValue` usa `encryptionKeys()[0]`. `decryptPrivateValue` tenta cada chave e devolve o primeiro resultado válido; se nenhuma funcionar, lança `Unsupported encrypted value`.

- [ ] **Step 4: Criar o script de rotação**

`apps/api/scripts/rotate-encryption-key.mjs` deve:

1. Exigir `DATABASE_URL` e `APP_ENCRYPTION_KEY` (nova); em `--apply`, exigir também `APP_ENCRYPTION_KEY_PREVIOUS` (antiga).
2. Resolver o módulo compilado em `dist/auth/auth.crypto.js`, tentando `process.cwd()/apps/api/dist/...` (execução a partir da raiz, em desenvolvimento) e `process.cwd()/dist/...` (contentor, a partir de `/app`); usar `pathToFileURL` para o `import()` dinâmico.
3. Aceitar `--dry-run` (default), `--apply`, `--verify`, `--batch=100`.
4. Selecionar em lotes `seller_profiles` com `mcx_phone_ciphertext IS NOT NULL`.
5. Em `--dry-run`, contar e listar IDs.
6. Em `--apply`, decifrar com a chave antiga/atual e cifrar com a nova; atualizar `mcx_recipient_name_ciphertext`, `mcx_phone_ciphertext` e `updated_at`.
7. Em `--verify`, remover `APP_ENCRYPTION_KEY_PREVIOUS` do processo antes de decifrar e tentar todas as linhas apenas com a chave nova; falhar se alguma não decifrar.
8. Imprimir `scanned`, `updated`, `failed`.

Antes de executar:

```bash
pnpm --filter @praca/api build
```

- [ ] **Step 5: Testar em ambiente de desenvolvimento**

```bash
export DATABASE_URL=postgresql://praca:praca_local_dev@localhost:5432/praca_angola
export APP_ENCRYPTION_KEY="new-key-new-key-new-key-new-key"
# A chave anterior tem de ser a que a API usou para cifrar os dados de dev.
export APP_ENCRYPTION_KEY_PREVIOUS="${APP_ENCRYPTION_KEY_PREVIOUS:-local-development-only-key-change-before-production}"
node apps/api/scripts/rotate-encryption-key.mjs --dry-run
node apps/api/scripts/rotate-encryption-key.mjs --apply
# --verify remove APP_ENCRYPTION_KEY_PREVIOUS do processo antes de decifrar.
node apps/api/scripts/rotate-encryption-key.mjs --verify
```

Esperado: `dry-run` conta as linhas; `apply` re-cifra; `verify` passa com a chave nova.

Depois do ensaio, reiniciar a API com a chave nova ou recriar a base de dev; a API em execução ainda tem a chave antiga.

- [ ] **Step 5b: Disponibilizar a chave anterior no deploy**

Em `docker-compose.prod.yml`, adicionar ao serviço `api`:

```yaml
APP_ENCRYPTION_KEY_PREVIOUS: ${APP_ENCRYPTION_KEY_PREVIOUS:-}
```

Em `.env.prod.example`, documentar (comentado, só durante a rotação):

```dotenv
# APP_ENCRYPTION_KEY_PREVIOUS=chave-antiga-com-pelo-menos-32-caracteres
```

Remover a variável e redeployar depois de `--verify` passar.

- [ ] **Step 6: Documentar segredos**

`docs/operations/secrets.md` deve cobrir:

- inventário de segredos: DB, SMTP, `APP_ENCRYPTION_KEY`, `SENTRY_DSN`, `METRICS_TOKEN`;
- armazenamento em gestor de segredos ou ficheiro com permissões `600`;
- rotação trimestral e em caso de incidente;
- rotação de DB (`ALTER USER`), SMTP, sessões (revogar `sessions`) e chave de cifra;
- rollback: manter `APP_ENCRYPTION_KEY_PREVIOUS` até `--verify` passar e removê-la do deploy depois;
- proibição de copiar `.env.prod` para o repositório ou para chat.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/auth.crypto.ts apps/api/src/auth/auth.crypto.rotation.spec.ts apps/api/scripts/rotate-encryption-key.mjs .env.prod.example docker-compose.prod.yml docs/operations/secrets.md
git commit -m "feat(security): support encryption key rotation"
```

---

### Task 14: Smoke suite e runbook de go-live

**Files:**
- Create: `tests/e2e/hardening.spec.mjs`
- Create: `tests/ops/smoke.sh`
- Create: `docs/operations/go-live.md`
- Create: `docs/operations/runbook.md`

**Interfaces:**
- Consumes: todas as tarefas anteriores.
- Produces: verificação repetível de staging e documentação operacional.

- [ ] **Step 1: Criar a smoke suite E2E**

`tests/e2e/hardening.spec.mjs`:

```js
import { test, expect } from "@playwright/test";

test("readiness is healthy", async ({ request }) => {
  const response = await request.get("/api/v1/health/ready");
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    status: "ok",
    checks: { db: "ok", media: "ok" },
  });
});

test("security headers are present", async ({ request }) => {
  const response = await request.get("/");
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["content-security-policy-report-only"]).toContain("frame-ancestors 'none'");
});

test("csp report endpoint accepts reports", async ({ request }) => {
  const response = await request.post("/api/v1/csp-report", {
    data: { "csp-report": { "violated-directive": "script-src" } },
  });
  expect(response.status()).toBe(204);
});
```

- [ ] **Step 2: Criar o smoke script de staging**

`tests/ops/smoke.sh`:

```bash
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
```

- [ ] **Step 3: Executar a smoke suite**

```bash
pnpm stack:dev:build
pnpm test:e2e -- tests/e2e/hardening.spec.mjs
BASE_URL=http://localhost:3100 bash tests/ops/smoke.sh
```

Esperado: E2E verde; `smoke ok`.

A smoke suite completa de staging é a soma de `tests/ops/smoke.sh`, `upload-quota.spec.mjs`, `rate-limits.spec.mjs`, `backup-restore.sh` e `rotate-encryption-key.mjs --dry-run`; executar todos antes do go-live.

- [ ] **Step 4: Escrever o checklist de go-live**

`docs/operations/go-live.md` deve ter checkboxes para:

- CI verde e branch protegida;
- backups automáticos e restauro testado;
- readiness e alertas ativos;
- headers e CSP report-only;
- quotas e rate limits testados;
- SMTP validado (registo + reset);
- TLS válido e HTTP→HTTPS;
- rotação de chave ensaiada;
- smoke suite verde;
- responsáveis de plantão definidos;
- rollback testado.

- [ ] **Step 5: Escrever o runbook**

`docs/operations/runbook.md` deve cobrir:

- deploy e rollback;
- restauro de PostgreSQL e media;
- rotação de chave;
- outbox atrasado;
- Redis em baixo;
- SMTP em baixo;
- disco cheio;
- incidente de segurança e revogação de sessões;
- contactos e escalonamento.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/hardening.spec.mjs tests/ops/smoke.sh docs/operations/go-live.md docs/operations/runbook.md
git commit -m "test(ops): add hardening smoke suite and go-live runbook"
```

---

## Verificação final

Antes de declarar o plano concluído:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm --filter @praca/api test
pnpm build
pnpm stack:dev:build
pnpm test:e2e
bash tests/ops/backup-restore.sh
bash tests/ops/cleanup-media.sh
DATABASE_URL=postgresql://praca:praca_local_dev@localhost:5432/praca_angola \
  APP_ENCRYPTION_KEY=local-development-only-key-change-before-production \
  node apps/api/scripts/rotate-encryption-key.mjs --dry-run
BASE_URL=http://localhost:3100 bash tests/ops/smoke.sh
```

Esperado: todos os comandos com exit 0. Em staging, executar também:

```bash
BASE_URL=https://<domínio> bash tests/ops/smoke.sh
curl -sI https://<domínio> | grep -i strict-transport-security
openssl s_client -connect <domínio>:443 -servername <domínio> </dev/null 2>/dev/null | openssl x509 -noout -dates
```

## Self-review

- **Cobertura da spec:** P0.1 → Tasks 1–4; P0.2 → Task 5; P0.3 → Tasks 6–7; P0.4 → Task 8; P0.5 → Tasks 9–10; P0.6 → Task 11; P0.7 → Task 12; P0.8 → Task 13; verificação → Task 14.
- **Review Focus:** concorrência de quota (Task 9), Redis em baixo (Task 11), XFF forjado (Task 11, backstop NGINX), CSP/hidratação (Task 8), rotação mista (Task 13).
- **Consistência de tipos:** `MediaQuotaService.reserve/release`, `RateLimitService.consume`, `RateLimitRule`, `HealthReport` e `validateEnv` são usados com as mesmas assinaturas nas tarefas seguintes.
- **Proporção:** o plano descreve interfaces e testes; os corpos de código limitam-se às funções cuja assinatura não determina a implementação.

## Execution Handoff

O plano está guardado em `docs/superpowers/plans/2026-10-23-endurecimento-p0.md`.

Antes de implementar, o responsável deve rever o plano e escolher o método de execução. Recomendo **subagent-driven** para as tarefas 1–5 e 9–13, porque têm interfaces partilhadas e um erro numa migração ou num header pode bloquear as seguintes; para tarefas de configuração simples (2, 4, 14), a execução nativa é suficiente. O plano foi desenhado para execução tarefa-a-tarefa, com commits frequentes e verificação independente.
