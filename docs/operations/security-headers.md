# Cabeçalhos de segurança e relatórios CSP — Praça Angola

Este documento descreve os cabeçalhos de segurança emitidos pelo Next.js, pelo ingress NGINX e pelo Caddy, o endpoint de relatórios CSP e o processo de rollout da política.

## Camadas

| Camada | Responsabilidade |
| --- | --- |
| Next.js (`apps/web/next.config.ts`) | Headers de conteúdo para o web app, incluindo CSP em modo `Report-Only`. |
| NGINX (`infra/nginx/default.conf.template`) | Headers para respostas web e API, ocultação de duplicados do Next e rate limit do relatório CSP. |
| Caddy (`infra/Caddyfile`) | HSTS, COOP/CORP e remoção do header `Server` no domínio público. |

O NGINX é o ingress efetivo do Compose. O Caddy é a camada TLS/host que fica à frente do ingress em produção.

## Headers emitidos

### Next.js

Para todas as rotas:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Content-Security-Policy-Report-Only` com:
  - `default-src 'self'`
  - `img-src 'self' data: blob:`
  - `style-src 'self' 'unsafe-inline'`
  - `script-src 'self' 'unsafe-inline'`
  - `connect-src 'self'`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
  - `object-src 'none'`
  - `report-uri /api/v1/csp-report`

O `unsafe-inline` em `script-src` é temporário para a hidratação do Next.js. A política é `Report-Only`: violações são reportadas, mas não bloqueiam a aplicação. A fase seguinte deve introduzir nonces via `middleware.ts` e remover `unsafe-inline` antes de mudar para `Content-Security-Policy` enforce.

### NGINX

Em ambos os `server` blocks:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`

No `server` web, o NGINX oculta os quatro headers equivalentes vindos do Next para não os duplicar. O `Content-Security-Policy-Report-Only` continua a vir do Next.

No `server` da API, os headers do NGINX coexistem com os headers já emitidos pela API. Não há ocultação nesse listener.

### Caddy

No domínio público:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`
- Remoção do header `Server`

O HSTS só deve ser ativado quando todos os subdomínios servidos pelo domínio tiverem HTTPS válido, porque `includeSubDomains` os abrange.

## Relatórios CSP

O endpoint é:

```text
POST /api/v1/csp-report
```

Resposta esperada: `204 No Content`, mesmo quando o corpo não é necessário para a aplicação. O controlador registra o relatório em log com contexto `CSP violation`.

Os browsers enviam normalmente `Content-Type: application/csp-report`. O body parser da API aceita `application/json` e `application/csp-report`.

O NGINX aplica rate limit por IP:

```nginx
limit_req_zone $binary_remote_addr zone=csp_report:10m rate=120r/m;
limit_req zone=csp_report burst=40 nodelay;
```

O limite admite vários relatórios gerados por uma única navegação e mantém proteção contra abuso. A API também aplica um limite Redis de 240 relatórios por minuto por origem, inclusive quando é acedida diretamente na Railway. O endpoint não requer autenticação, tal como os browsers esperam, e não executa qualquer ação sobre o sistema.

### Privacidade dos relatórios

Os relatórios podem conter URLs, user agent e detalhes da página. O controlador regista apenas a diretiva violada, truncada a 80 caracteres; não regista o corpo completo. Aplicar a retenção normal de logs e restringir o acesso ao canal de observabilidade.

## Verificação

Com a stack de desenvolvimento ativa:

```bash
corepack pnpm stack:dev
corepack pnpm exec playwright test tests/e2e/security-headers.spec.mjs
```

O teste verifica:

1. `X-Frame-Options: DENY` na homepage;
2. `X-Content-Type-Options: nosniff`;
3. `Permissions-Policy` com `camera=()`;
4. CSP report-only com `frame-ancestors 'none'`;
5. `POST /api/v1/csp-report` devolve `204`.

Verificação manual:

```bash
curl -sI http://localhost:3100/ | grep -iE 'x-frame-options|x-content-type-options|permissions-policy|content-security-policy-report-only'
curl -si -X POST http://localhost:3100/api/v1/csp-report \
  -H 'Content-Type: application/csp-report' \
  --data '{"csp-report":{"violated-directive":"script-src"}}'
```

O segundo comando deve terminar com `HTTP/1.1 204 No Content`.

### Caddy

Validar a configuração antes de recarregar:

```bash
docker run --rm \
  -e ACME_EMAIL=admin@example.com \
  -e PUBLIC_DOMAIN=marketplace.example \
  -v "$PWD/infra/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2 caddy validate --config /etc/caddy/Caddyfile
```

Em produção, recarregar sem downtime:

```bash
caddy reload --config /etc/caddy/Caddyfile
```

Confirmar:

```bash
curl -sI https://<domínio> | grep -iE 'strict-transport-security|cross-origin-opener-policy|cross-origin-resource-policy'
```

### NGINX

Depois de alterar o template, o contentor do ingress tem de ser recriado para o `envsubst` voltar a gerar a configuração:

```bash
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml \
  up -d --force-recreate ingress
```

Em produção, usar o comando equivalente com `docker-compose.prod.yml` e o projeto de produção. Validar antes:

```bash
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml \
  exec ingress nginx -t
```

## Rollout da CSP

1. Manter `Content-Security-Policy-Report-Only` em produção durante pelo menos uma semana.
2. Observar os relatórios e corrigir origens necessárias (`img-src`, `connect-src`, etc.).
3. Confirmar que não há violações de `script-src` causadas por hidratação.
4. Introduzir nonces no Next.js e remover `unsafe-inline`.
5. Só depois mudar o header para `Content-Security-Policy` enforce.
6. Manter o endpoint de relatórios e o rate limit ativos.

Não ativar enforce enquanto os relatórios mostrarem violações legítimas por resolver.

## Troubleshooting

- **Headers em falta no web:** confirmar que o Next.js foi reiniciado após alterar `next.config.ts`; em dev, o Next aplica `headers()` no arranque.
- **Headers duplicados:** o NGINX só oculta os quatro headers no `location /` do web. Se forem adicionados novos headers no Next, avaliar se devem ser ocultados no ingress.
- **CSP report 404:** confirmar que existe `location = /api/v1/csp-report` em ambos os `server` blocks e que o ingress foi recriado.
- **CSP report 400:** confirmar o body parser para `application/csp-report` e o `Content-Type` enviado.
- **HSTS inesperado em localhost:** HSTS só deve ser emitido pelo Caddy em produção; não adicionar HSTS ao ingress de desenvolvimento.

## Responsabilidade

- **Dono:** Platform/DevOps lead.
- **Revisão da CSP:** segurança/tech lead antes de enforce.
- **Alertas de violação:** acompanhar no canal de observabilidade; não silenciar sem justificação.
- **Teste:** o E2E de headers faz parte do CI no job `e2e`.
