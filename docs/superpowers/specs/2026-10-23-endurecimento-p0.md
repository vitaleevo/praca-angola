# Endurecimento para Beta Público — Especificação

**Data:** 23/10/2026  
**Origem:** auditoria completa do sistema (API, web, base de dados, infraestrutura e testes).  
**Estado atual:** MVP funcional, com boas fundações de autenticação, integridade transacional e modelação de dados, mas **não pronto para produção pública**.

## 1. Contexto

A auditoria atribuiu as seguintes avaliações qualitativas:

| Dimensão | Nota | Comentário |
|---|---:|---|
| Funcionalidades | 8/10 | Cobertura ampla e coerente |
| Segurança de aplicação | 6/10 | Boas fundações; faltam cabeçalhos, quotas e CSRF |
| Fiabilidade | 4/10 | Sem backups, monitorização ou alta disponibilidade |
| Escalabilidade | 4/10 | Pesquisa `ILIKE`, media local, worker no processo |
| Observabilidade | 2/10 | Sem métricas, alertas ou tracing |
| Testes | 3/10 | Apenas E2E; sem unitários/integração |
| Manutenibilidade | 5/10 | SQL inline e ficheiros muito densos |
| **Prontidão para produção** | **3,5/10** | Bloqueadores operacionais |

Os oito bloqueadores P0 identificados são:

1. **P0.1** — Sem repositório Git nem CI/CD.
2. **P0.2** — Sem backups nem plano de recuperação.
3. **P0.3** — Sem monitorização, alertas ou logs agregados.
4. **P0.4** — Cabeçalhos de segurança incompletos.
5. **P0.5** — Uploads sem quota nem limite de abuso.
6. **P0.6** — Escritas da comunidade sem rate limiting.
7. **P0.7** — Configuração de produção incompleta (SMTP, URL pública, TLS).
8. **P0.8** — Segredos e rotação da chave de cifra por documentar/automatizar.

## 2. Objetivo

Fechar os oito bloqueadores P0 e criar a base operacional mínima para um **beta público controlado**, sem alterar funcionalidades de produto nem redesenhar a arquitetura.

O beta é definido como:

- um único host;
- tráfego inicial na ordem das centenas de utilizadores;
- pagamentos manuais por Multicaixa Express;
- tolerância a indisponibilidades curtas, desde que haja deteção, alerta e recuperação documentada;
- RPO máximo de 6 horas para dados transacionais e 24 horas para media;
- RTO máximo de 2 horas.

## 3. Âmbito

### Incluído

- Git, builds reproduzíveis e CI.
- Backups e restauro testado.
- Logs estruturados, IDs de pedido, error tracking, health/readiness, métricas e alertas.
- Cabeçalhos de segurança e CSP em modo report-only.
- Quotas de upload, limpeza de órfãos e rate limits de escrita.
- Validação de configuração de produção, SMTP e TLS.
- Gestão de segredos e rotação da chave de cifra.
- Smoke tests e runbook de go-live.

### Excluído

- Meilisearch, pesquisa avançada e reindexação.
- Migração de media para object storage/CDN.
- Alta disponibilidade, réplicas e load balancer.
- Redesenho de UI, novas funcionalidades de produto e alterações de copy.
- Migração para ORM ou reescrita dos controllers.
- Suite completa de testes unitários/integração para todos os módulos.
- Automação do Multicaixa Express.

## 4. Requisitos e critérios de aceitação

### R1 — Versionamento, builds reproduzíveis e CI

- O repositório tem `.git`, `.gitignore` eficaz e um commit baseline.
- Nenhum segredo (`.env`, `.env.prod`, chaves) é versionado.
- Os Dockerfiles constroem a partir de um checkout limpo, sem depender de `.data/corepack-cache`.
- O CI corre typecheck, lint, testes unitários, build, migrações e E2E.
- O CI falha se o lint, os testes ou as migrações falharem.

**Aceitação:** pipeline verde num PR; `git ls-files` não contém `.env`/`.env.prod`; `docker build` de API e web passa num diretório sem `.data`.

### R2 — Backups e restauro

- Dump do PostgreSQL a cada 6 horas, retenção de 14 dias, cópia off-host.
- Backup diário do volume de media.
- Script de restauro para uma base de dados de scratch.
- Teste de restauro automatizado que compara contagens de tabelas críticas.
- Runbook com RPO/RTO, responsáveis e procedimento de emergência.

**Aceitação:** `tests/ops/backup-restore.sh` passa; o dump restaurado mantém `users`, `listings`, `orders` e `service_requests`; o checksum do dump é verificado.

### R3 — Observabilidade

- Logs JSON com `requestId`, método, rota, estado e duração.
- `x-request-id` devolvido em todas as respostas; IDs recebidos são sanitizados.
- Error tracking para 5xx (Sentry ou equivalente), ativado por `SENTRY_DSN`.
- `GET /api/v1/health/live` e `GET /api/v1/health/ready`.
- Readiness verifica PostgreSQL, lag do outbox e escrita no diretório de media.
- Métricas Prometheus num endpoint interno, não exposto publicamente.
- Alertas para API down, taxa de 5xx, lag do outbox e disco.

**Aceitação:** readiness devolve 503 com DB em baixo ou outbox atrasado > 5 min; logs não contêm cookies/passwords; alertas documentados e validados.

### R4 — Cabeçalhos de segurança

- HSTS, CSP report-only, `X-Frame-Options`, `Permissions-Policy`, COOP/CORP, `X-Content-Type-Options` e `Referrer-Policy`.
- CSP report-only sem violações nas páginas principais.
- Endpoint `POST /api/v1/csp-report` para recolher violações.

**Aceitação:** headers presentes em HTML e API; E2E não registra violações CSP; HSTS presente apenas sobre HTTPS.

### R5 — Quotas de upload

- Quota por utilizador em bytes e número de assets.
- Limite configurável por `MEDIA_QUOTA_BYTES_PER_USER` e `MEDIA_QUOTA_ASSETS_PER_USER`.
- Rejeição com HTTP 413 e código `MEDIA_QUOTA_EXCEEDED`.
- Limpeza de assets órfãos com `--dry-run` e `--apply`.
- Rate limit de upload por utilizador.

**Aceitação:** dois uploads concorrentes no limite não ultrapassam a quota; ficheiro não fica órfão após rejeição; limpeza remove apenas assets não referenciados com mais de 24 horas.

### R6 — Rate limits de escrita

- Limites por utilizador e por escopo para mensagens, conversas, denúncias, avaliações, favoritos, pedidos, propostas, checkout e upload.
- Resposta 429 com `Retry-After` e código `RATE_LIMITED`.
- Redis usado para contadores distribuídos; falha do Redis não derruba a API (fail-open com alerta).
- Backstop de IP no NGINX para rotas de escrita.

**Aceitação:** 31.ª mensagem no mesmo minuto devolve 429; outro utilizador não é afetado; leituras não são limitadas; Redis em baixo mantém escrita disponível e registra erro.

### R7 — Configuração de produção, SMTP e TLS

- Validação de ambiente no arranque; a API recusa arrancar com variáveis obrigatórias em falta ou inválidas.
- `PUBLIC_SITE_URL` obrigatório em produção, HTTPS e sem localhost.
- SMTP obrigatório em produção; registo envia email e o link usa `PUBLIC_SITE_URL`.
- Caddy termina TLS; HTTP redireciona para HTTPS; certificado válido.
- Documentação de SPF/DKIM/DMARC.

**Aceitação:** API falha com mensagem clara se `SMTP_HOST` ou `PUBLIC_SITE_URL` faltarem; registo em staging recebe email com o host correto; `curl -I https://<domínio>` devolve 200 e HSTS.

### R8 — Segredos e rotação de chave

- Segredos fora do Git, com permissões restritas e inventário.
- Suporte a `APP_ENCRYPTION_KEY` atual + `APP_ENCRYPTION_KEY_PREVIOUS`.
- Script de rotação com `--dry-run`, `--apply` e `--verify`.
- Procedimento de rotação de DB, SMTP, sessões e chave de cifra.

**Aceitação:** valores cifrados com a chave antiga continuam a ser decifrados durante a rotação; após `--apply`, todos os campos MCX são re-cifrados e verificados com a chave nova; rollback documentado.

### R9 — Verificação e go-live

- Smoke suite cobre headers, readiness, quota, rate limit, email, backup e rotação (dry-run).
- Runbook cobre deploy, rollback, restauro, rotação, outbox, Redis, SMTP e disco.
- Checklist de go-live assinado.

**Aceitação:** smoke suite passa em staging; runbook testado; checklist completo.

## 5. Restrições

- Node 24, pnpm 11.25.0, PostgreSQL 18, Redis 8, Next.js 16.4.2, NestJS 12.2.0.
- Manter os contratos atuais da API; novos erros usam `{ code, message }`.
- Migrações idempotentes, aplicadas por `apps/api/scripts/migrate.mjs`.
- Sem segredos no repositório.
- Mensagens visíveis ao utilizador em português (pt-PT/pt-AO).
- Compatibilidade com o host único e o Compose atual.

## 6. Pressupostos

- GitHub Actions disponível e repositório privado criado pelo responsável.
- Domínio público e acesso ao host para configurar Caddy.
- Fornecedor SMTP com SPF/DKIM/DMARC configuráveis.
- Redis já provisionado no Compose de produção.
- O beta não exige HA nem múltiplos hosts.
- A equipa aceita uma janela de manutenção curta para aplicar migrações e reiniciar serviços.

## 7. Riscos principais

| Risco | Mitigação |
|---|---|
| CI não consegue construir imagens por dependência de `.data` | Task 1 substitui o cache local por `corepack prepare` |
| CSP report-only quebra hidratação do Next.js | Começar em report-only, validar E2E e só depois impor |
| Rate limit falha aberto durante indisponibilidade do Redis | Backstop NGINX + alerta + teste de caos |
| Uploads concorrentes ultrapassam quota | Advisory lock por utilizador + teste concorrente |
| Rotação de chave deixa linhas ilegíveis | Chave anterior de fallback + `--verify` + rollback |
| Backups sem restauro testado | Teste automatizado de restauro para scratch DB |
| `X-Forwarded-For` forjado contorna limites de IP | `trusted-proxies.conf` + teste de spoofing |

## 8. Critérios de saída

O plano está concluído quando:

1. CI verde em `main`.
2. Backups automáticos e restauro testado.
3. Readiness, logs e alertas ativos.
4. Headers e CSP report-only em produção.
5. Quotas e rate limits ativos e testados.
6. SMTP e TLS validados em staging.
7. Rotação de chave ensaiada.
8. Smoke suite e runbook aprovados.
