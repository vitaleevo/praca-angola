# Checklist de produção — Praça Angola

Este documento é a lista de verificação para colocar a Praça Angola em produção com o Compose de `docker-compose.prod.yml`, Caddy no host e segredos fora do Git.

## Regra de ouro

- `.env.prod` existe apenas no host de produção e **nunca** é commitado.
- O ficheiro deve pertencer ao utilizador de deploy e ter permissões `600`.
- Não copiar segredos para issues, logs, CI, capturas de ecrã ou mensagens.
- A API valida o ambiente no arranque (`validateEnv`) e termina com erro se faltar uma variável obrigatória. O Compose também falha na interpolação de `PUBLIC_SITE_URL`, `SMTP_HOST` e `SMTP_FROM`.
- Não contornar a falha adicionando defaults inseguros ao Compose.

## Variáveis obrigatórias

### Base de dados e cache

| Variável | Exemplo | Notas |
| --- | --- | --- |
| `POSTGRES_DB` | `praca_angola` | Nome da base. |
| `POSTGRES_USER` | `praca` | Utilizador da base. |
| `POSTGRES_PASSWORD` | segredo aleatório | Mínimo 32 bytes; não reutilizar. |
| `DATABASE_URL` | `postgresql://praca:<password>@postgres:5432/praca_angola` | Codificar caracteres especiais do password na URL. |
| `REDIS_URL` | `redis://redis:6379` | Usado por rate limits e outros serviços internos. |

### Site e segurança

| Variável | Exemplo | Notas |
| --- | --- | --- |
| `WEB_ORIGIN` | `https://marketplace.example` | Origem CORS; tem de ser `https` em produção. |
| `PUBLIC_SITE_URL` | `https://marketplace.example` | Links absolutos de e-mail e metadados; tem de ser `https`. |
| `APP_ENCRYPTION_KEY` | segredo aleatório | Pelo menos 32 caracteres; ver rotação em `docs/operations/secrets.md`. |
| `PUBLIC_DOMAIN` | `marketplace.example` | Usado pelo Caddy no host, sem `https://`. |
| `ACME_EMAIL` | `ops@marketplace.example` | Contacto ACME/Let's Encrypt. |
| `METRICS_TOKEN` | segredo aleatório | Obrigatório para o scrape interno de métricas; sem ele o endpoint responde `404`. |
| `SENTRY_DSN` | opcional | Só inicializa Sentry quando definido. |

### SMTP

| Variável | Exemplo | Notas |
| --- | --- | --- |
| `SMTP_HOST` | `smtp.provider.example` | Obrigatório em produção. |
| `SMTP_PORT` | `587` | `587` para STARTTLS; `465` para TLS implícito. |
| `SMTP_SECURE` | `false` | `true` apenas para TLS implícito (normalmente `465`). |
| `SMTP_USER` | utilizador do provider | Se definido, `SMTP_PASSWORD` também é obrigatório. |
| `SMTP_PASSWORD` | segredo do provider | Nunca commitado. |
| `SMTP_FROM` | `Praça Angola <no-reply@marketplace.example>` | Remetente autorizado no domínio; alinhado com SPF/DKIM/DMARC. |

Detalhes e testes em `docs/operations/email.md`.

### Media e abuso

| Variável | Exemplo | Notas |
| --- | --- | --- |
| `MEDIA_DIR` | `/app/apps/api/uploads` | Caminho dentro do contentor; o volume é `media_data`. |
| `MEDIA_QUOTA_BYTES_PER_USER` | `52428800` | 50 MiB por conta. |
| `MEDIA_QUOTA_ASSETS_PER_USER` | `100` | 100 imagens ativas por conta. |
| `RATE_LIMIT_ENABLED` | `true` | Manter ativo; fail-open só quando o Redis falha. |

## Preparação do host

1. Instalar Docker Engine, Docker Compose, Git e Caddy.
2. Criar o utilizador de deploy e o diretório da aplicação (por exemplo, `/opt/praca`).
3. Clonar o repositório e fazer checkout da versão a publicar.
4. Criar o ficheiro de ambiente com permissões restritas:

```bash
cd /opt/praca
umask 077
install -m 600 /dev/null .env.prod
$EDITOR .env.prod
```

5. Confirmar que o ficheiro não aparece no Git:

```bash
git status --short
git check-ignore -v .env.prod
```

6. Configurar DNS e Caddy antes de expor o serviço; ver `docs/operations/tls.md`.
7. Garantir que o ingress só escuta em loopback (`127.0.0.1:3200`) e que a porta 80/443 pública é do Caddy.

## Validação antes do deploy

```bash
cd /opt/praca

# A interpolação falha se faltar uma variável obrigatória.
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml config --quiet

# Validar o Caddy com as variáveis do host.
caddy validate --config /etc/caddy/Caddyfile

# Confirmar que os segredos não estão em texto nos ficheiros versionados.
git grep -nE 'BEGIN (RSA|OPENSSH) PRIVATE KEY|SMTP_PASSWORD=.+' -- . ':!.env.prod.example' || true
```

O comando `docker compose config` com um `.env.prod` incompleto deve falhar com uma mensagem do tipo `required variable ... is missing a value`. Isso é esperado; completar o ficheiro, não remover a validação.

## Sequência de deploy

```bash
cd /opt/praca

# 1. Backup antes de qualquer migração.
sudo -u praca env \
  COMPOSE_PROJECT=praca-angola-prod \
  COMPOSE_FILE=docker-compose.prod.yml \
  COMPOSE_ENV_FILE=.env.prod \
  BACKUP_DIR=/var/backups/praca \
  bash infra/backup/backup-postgres.sh

sudo -u praca env \
  COMPOSE_PROJECT=praca-angola-prod \
  COMPOSE_FILE=docker-compose.prod.yml \
  COMPOSE_ENV_FILE=.env.prod \
  BACKUP_DIR=/var/backups/praca \
  bash infra/backup/backup-media.sh

# 2. Construir e arrancar. A API aplica as migrations antes de iniciar.
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml up -d --build

# 3. Acompanhar o arranque.
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml ps
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml logs -f api
```

Não continuar se a API sair com erro de ambiente, migration ou readiness.

## Smoke tests obrigatórios

```bash
# Saúde e headers através do domínio público.
curl -fsS "https://${PUBLIC_DOMAIN}/api/v1/health/ready"
curl -sI "https://${PUBLIC_DOMAIN}/" | grep -Ei 'strict-transport-security|x-frame-options|x-content-type-options|content-security-policy'

# Métricas apenas na rede interna.
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T api \
  node -e "fetch('http://127.0.0.1:4000/api/v1/metrics',{headers:{'x-metrics-token':process.env.METRICS_TOKEN}}).then(async r=>{console.log(r.status);console.log((await r.text()).slice(0,200))})"
```

Verificar manualmente:

- [ ] Registo de uma conta nova recebe e-mail de confirmação.
- [ ] O link de confirmação abre `PUBLIC_SITE_URL` e ativa a conta.
- [ ] Pedido de reset recebe e-mail; o link redefine a palavra-passe e revoga sessões.
- [ ] Login, logout e sessão persistente funcionam.
- [ ] Upload de imagem funciona e uma imagem pública abre em `/api/v1/media/<id>`.
- [ ] Quota de upload devolve `413` no limite (testar numa conta de teste).
- [ ] Rate limit de mensagens devolve `429` após 30 mensagens por minuto.
- [ ] `GET /api/v1/metrics` através do domínio público devolve `404`.
- [ ] CSP report-only está presente e `/api/v1/csp-report` devolve `204`.
- [ ] Backups do dia existem, têm checksum e o teste de restauro mensal está agendado.
- [ ] Alerta de expiração TLS e alerta de `rate limit unavailable` estão ativos.

## Observabilidade e operação

- Confirmar `up{job="praca-api"}` no Prometheus.
- Confirmar que os logs JSON incluem `req.id`, sem cookies ou tokens.
- Confirmar que o Sentry recebe um erro de teste, se `SENTRY_DSN` estiver configurado.
- Confirmar que o outbox não tem atraso >300 s.
- Confirmar que o disco tem pelo menos 15% livre.
- Confirmar que `media_data`, `postgres_data` e `redis_data` estão incluídos na política de backup.
- Rever `docs/operations/monitoring.md`, `docs/operations/backups.md` e `docs/operations/media.md`.

## Rollback

1. Não reverter uma migration aplicada sem plano; restaurar o backup PostgreSQL se necessário.
2. Voltar à imagem/tag anterior com `docker compose ... up -d --no-build` e a tag fixada.
3. Confirmar readiness e smoke tests.
4. Registar o incidente, a causa e a versão reposta.

## Aprovação

- [ ] Domínio e DNS confirmados.
- [ ] TLS emitido e renovação automática confirmada.
- [ ] SMTP, SPF, DKIM e DMARC confirmados.
- [ ] `.env.prod` com permissões `600` e fora do Git.
- [ ] Backup e restauro testados.
- [ ] Alertas e runbooks revistos.
- [ ] Responsável de plantão identificado.
- [ ] Janela de lançamento comunicada.
