# Runbook de operações — Praça Angola

Este runbook cobre os incidentes mais prováveis do beta. Em todos os casos: preservar evidência, não colar segredos em chat e registar a cronologia no ticket de incidente.

## Severidade e escalonamento

| Nível | Exemplos | Resposta |
| --- | --- | --- |
| P1 | Site indisponível, perda/corrupção de dados, fuga de segredos, TLS inválido, todos os logins falham | Acknowledge imediato; mitigar; escalar tech lead/security; comunicar. |
| P2 | SMTP em baixo, outbox atrasado, Redis instável, disco >85%, erros 5xx elevados | Resolver na janela; escalar se durar >30 min. |
| P3 | Alerta isolado, erro recuperável, capacidade a aproximar-se do limite | Ticket e correção planeada. |

### Contactos

Preencher antes do go-live; não inventar contactos pessoais no repositório.

| Papel | Nome/canal | Quando contactar |
| --- | --- | --- |
| On-call de plataforma | `<canal/telefone>` | Primeiro contacto para P1/P2 |
| Tech lead | `<canal>` | Decisões de arquitetura/rollback |
| Segurança | `<canal>` | Suspeita de fuga, sessões, segredos |
| Produto/founder | `<canal>` | Comunicação a utilizadores e âmbito do beta |
| Provider SMTP | `<suporte>` | Bloqueio de entrega/reputação |
| Provider/host | `<suporte>` | Rede, disco, hipervisor |

O canal de incidentes deve ter um responsável nomeado por turno. O escalonamento é on-call → tech lead → founder/CTO; segurança entra em paralelo em incidentes de dados/segredos.

## Deploy e rollback

### Deploy

Seguir `docs/operations/production-checklist.md` e `docs/operations/go-live.md`. Resumo:

```bash
cd /opt/praca
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml config --quiet

# Backup antes de migrações.
sudo -u praca env \
  COMPOSE_PROJECT=praca-angola-prod COMPOSE_FILE=docker-compose.prod.yml \
  COMPOSE_ENV_FILE=.env.prod BACKUP_DIR=/var/backups/praca \
  bash infra/backup/backup-postgres.sh

docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml up -d --build
```

Confirmar `ps`, logs da API e `GET /api/v1/health/ready`.

### Rollback

1. Parar alterações e preservar logs.
2. Se a migration for incompatível, restaurar o backup PostgreSQL (secção abaixo); não reverter apenas a imagem.
3. Voltar à imagem/tag anterior e arrancar sem build.
4. Confirmar readiness, login, catálogo, upload e uma encomenda.
5. Registar versão reposta, causa e evidência.

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml up -d --no-build
```

## Restauro PostgreSQL

O restauro para produção é **destrutivo**. Fazer sempre um dump de segurança do estado atual e confirmar duas vezes o nome da base.

```bash
cd /opt/praca
DUMP=/var/backups/praca/postgres-<UTC>.dump
(cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")

sudo -u praca env \
  COMPOSE_PROJECT=praca-angola-prod COMPOSE_FILE=docker-compose.prod.yml \
  COMPOSE_ENV_FILE=.env.prod \
  bash infra/backup/restore-postgres.sh "$DUMP" praca_angola
```

Depois: confirmar migrations, contagens de `users`, `listings`, `orders` e `service_requests`, readiness e smoke tests. O detalhe e o ensaio em `praca_restore_test` estão em `docs/operations/backups.md`.

## Restauro de media

1. Validar o checksum do arquivo.
2. Confirmar que existe backup PostgreSQL da mesma janela.
3. Parar a API ou entrar em manutenção.
4. Extrair para o volume `media_data` sem apagar o conteúdo atual antes de ter uma cópia.
5. Confirmar uma imagem existente e um upload novo.
6. Retomar a API e monitorizar erros de media.

Seguir os comandos e avisos de `docs/operations/backups.md`; o `rm -rf` do volume é irreversível.

## Rotação da chave de cifra

Seguir `docs/operations/secrets.md`. Regras rápidas:

- manter `APP_ENCRYPTION_KEY_PREVIOUS` até `--verify` devolver `failed=0`;
- nunca remover a chave antiga antes de backup + verify;
- executar `--dry-run`, depois `--apply`, depois `--verify`;
- se uma linha falhar, não continuar para a remoção da chave anterior;
- confirmar leitura de um perfil/recibo antigo e criação de um novo.

## Outbox atrasado

Sintoma: readiness `degraded` com `outboxLagSeconds > 300`, métrica `praca_outbox_oldest_age_seconds` alta, ou e-mails de serviço atrasados.

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T postgres \
  psql -U praca -d praca_angola -c \
  "SELECT status, count(*), min(created_at) AS oldest FROM service_notification_outbox GROUP BY status;"
```

Verificar logs da API, SMTP e Redis. O worker repete `pending`/`failed` com backoff e recupera `processing` com mais de 5 minutos. Se um evento estiver preso após 5 tentativas, investigar preferência do utilizador e SMTP antes de repor `status='pending', attempts=0`; não apagar eventos sem confirmar que a notificação não é necessária.

## Redis em baixo

Sintoma: logs `rate limit unavailable`, limites por utilizador temporariamente fail-open; o backstop de IP do NGINX continua ativo.

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml ps redis
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T redis redis-cli ping
```

1. Confirmar memória/disco e logs do Redis.
2. Reiniciar o serviço e confirmar `PONG`.
3. Testar um limite por utilizador (mensagem/upload) e confirmar `429` após o limite.
4. Não desativar `RATE_LIMIT_ENABLED` nem remover o backstop NGINX.
5. Se a falha for prolongada, reduzir tráfego de escrita e escalar.

## SMTP em baixo

Sintomas: registo devolve `503 EMAIL_DELIVERY_UNAVAILABLE` quando falta configuração; ou conta criada sem e-mail, com logs `could not be delivered`.

1. Confirmar `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` e `SMTP_FROM` no `.env.prod` (sem imprimir valores).
2. Testar autenticação/entrega com `swaks` ou Mailpit; ver `docs/operations/email.md`.
3. Verificar status/reputação do provider e SPF/DKIM/DMARC.
4. Se a password foi rodada, atualizar o segredo, reiniciar a API e testar registo + reset.
5. Se o provider estiver indisponível, comunicar degradação; os pedidos de reset/verificação podem ser repetidos.

## Disco cheio

```bash
df -h
docker system df
du -sh /var/lib/docker/volumes/* 2>/dev/null | sort -h | tail
```

1. Identificar o volume/diretório que cresceu (media, logs, dumps).
2. Validar backups antes de apagar qualquer coisa.
3. Executar a limpeza de media órfão em dry-run e só depois aplicar:

```bash
corepack pnpm --filter @praca/api media:cleanup -- --dry-run
```

4. Rodar/expirar logs com a política definida; não usar `docker system prune --volumes` sem confirmar que não apaga dados.
5. Expandir o disco ou mover backups off-host; comunicar se houver risco de indisponibilidade.

## Incidente de segurança

1. **Conter:** revogar sessões e, se necessário, bloquear tráfego/IP; preservar logs e evidência.
2. **Avaliar:** que segredo/dados foram expostos, janela temporal, contas afetadas.
3. **Rodar:** DB, SMTP, `APP_ENCRYPTION_KEY` (com o procedimento de rotação), `METRICS_TOKEN`, `SENTRY_DSN` e sessões, conforme o âmbito.
4. **Notificar:** tech lead, segurança, produto/founder e, se aplicável, autoridade/privacidade.
5. **Corrigir:** fechar o vetor, adicionar teste de regressão e rever acessos.
6. **Pós-incidente:** postmortem sem culpa, ações com dono/prazo e evidência.

Revogar sessões:

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T postgres \
  psql -U praca -d praca_angola \
  -c "UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL;"
```

Não copiar `.env.prod`, dumps ou tokens para o ticket. Registar apenas identificadores e horários.

## Verificação pós-incidente

- [ ] Readiness `200` e smoke suite verde.
- [ ] Erros 5xx e latência voltaram ao normal.
- [ ] SMTP/outbox sem atraso.
- [ ] Redis e rate limits operacionais.
- [ ] Sessões/segredos rodados quando aplicável.
- [ ] Backups e TLS confirmados.
- [ ] Comunicação e postmortem agendados.
