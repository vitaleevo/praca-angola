# Go-live e beta controlado — Praça Angola

> **Atenção à topologia:** a checklist abaixo foi escrita para Compose/Caddy self-hosted. A produção PUVO documentada está em Vercel + Railway; não executar os comandos Compose contra essa produção. O estado atual dos gates está em [`current-production-status.md`](current-production-status.md), e o piloto não deve avançar enquanto os itens bloqueados/pendentes não tiverem evidência.

Este documento é a lista de decisão para abrir o beta controlado. Nenhum item pode ser assumido como concluído sem evidência: comando, captura de ecrã, link de CI ou registo de ensaio.

## Critérios de entrada

- [ ] CI verde no commit a publicar: qualidade, migrations e E2E.
- [ ] Branch `main` protegida e PR revisto; merge feito por pessoa autorizada.
- [ ] Imagem/tag do deploy identificada e reproduzível.
- [ ] `.env.prod` completo, fora do Git e com permissões `600`.
- [ ] `docker compose --env-file .env.prod ... config --quiet` termina com sucesso.
- [ ] Backup PostgreSQL e media recente, com checksum validado.
- [ ] Teste de restauro documentado e dentro do RTO/RPO de `docs/operations/backups.md`.
- [ ] Readiness `200` e alertas de disponibilidade, 5xx, outbox e disco ativos.
- [ ] Headers de segurança e CSP report-only verificados.
- [ ] Quotas de upload e rate limits testados, incluindo fail-open do Redis.
- [ ] SMTP validado com registo e reset reais em staging.
- [ ] SPF, DKIM e DMARC configurados e alinhados.
- [ ] TLS válido, HTTP→HTTPS e renovação automática confirmados.
- [ ] Rotação da chave de cifra ensaiada e `--verify` verde.
- [ ] Smoke suite completa verde.
- [ ] Responsáveis de plantão e escalonamento definidos.
- [ ] Rollback ensaiado numa janela controlada.

## Smoke suite completa

Executar a partir do repositório, com a stack de staging/produção acessível:

```bash
BASE_URL=https://<domínio> bash tests/ops/smoke.sh

corepack pnpm exec playwright test \
  tests/e2e/hardening.spec.mjs \
  tests/e2e/upload-quota.spec.mjs \
  tests/e2e/rate-limits.spec.mjs

bash tests/ops/backup-restore.sh
bash tests/ops/cleanup-media.sh

# Ensaio da rotação; não altera dados.
DATABASE_URL="postgresql://.../praca_angola" \
APP_ENCRYPTION_KEY="<chave-atual-com-32+-caracteres>" \
node apps/api/scripts/rotate-encryption-key.mjs --dry-run
```

Em produção, o ensaio da rotação deve ser feito com as chaves reais no contentor, sem imprimir os valores:

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml run --rm --no-deps api \
  node apps/api/scripts/rotate-encryption-key.mjs --dry-run
```

Registar a saída de cada comando. `smoke ok`, `0 failed` e exit code `0` são os critérios mínimos.

## Sequência de abertura

1. **Congelar alterações** no branch de release e confirmar o commit/tag.
2. **Backup de segurança** imediatamente antes do deploy.
3. **Validar ambiente** e Caddy; não continuar com falhas de configuração.
4. **Deploy** com `docker compose ... up -d --build` e acompanhar os logs.
5. **Confirmar readiness** e executar a smoke suite completa.
6. **Abrir tráfego** de forma controlada (canário, lista de convidados ou percentagem reduzida).
7. **Monitorizar 60–120 minutos**: 5xx, latência, outbox, Redis, SMTP, disco e erros Sentry.
8. **Comunicar** o início do beta, canais de suporte e horário de plantão.
9. **Registar evidência** no ticket de release.

## Critérios de abortar/rollback

- readiness `503` ou erros 5xx acima do limiar definido;
- falha de migrations ou dados inconsistentes;
- SMTP sem entrega de registos/resets;
- TLS inválido ou domínio inacessível;
- quota/rate limit a bloquear utilizadores legítimos de forma generalizada;
- incidente de segurança ou exposição de segredos.

Em qualquer destes casos, parar a abertura, preservar logs/evidência e seguir o `docs/operations/runbook.md`.

## Evidência de release

| Item | Evidência | Responsável | Data |
| --- | --- | --- | --- |
| Commit/tag |  |  |  |
| CI |  |  |  |
| Backup + checksum |  |  |  |
| Restauro testado |  |  |  |
| Smoke suite |  |  |  |
| SMTP registo/reset |  |  |  |
| TLS/renovação |  |  |  |
| Rotação ensaiada |  |  |  |
| Alertas/plantão |  |  |  |
| Rollback |  |  |  |

## Assinaturas

- [ ] Tech lead aprovou o release.
- [ ] Operações confirmaram backup, TLS e plantão.
- [ ] Segurança confirmou segredos, headers e rotação.
- [ ] Produto confirmou o âmbito do beta e a comunicação.

**Não abrir o beta enquanto os valores reais de domínio, SMTP, TLS e segredos não estiverem preenchidos e validados.**
