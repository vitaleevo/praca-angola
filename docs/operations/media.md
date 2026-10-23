# Media — armazenamento, quotas e limpeza

Este documento cobre o ciclo de vida dos media da Praça Angola: localização do volume, quota por utilizador, limpeza de órfãos, backup e restauro.

## Localização e formato

- **Produção:** volume Docker `media_data`, montado em `/app/apps/api/uploads`.
- **Desenvolvimento:** `.data/uploads` no repositório, montado no contentor.
- **Configuração:** `MEDIA_DIR` define o diretório dentro do processo.
- **Formato:** todas as imagens aceites são normalizadas para WebP, com o nome `<uuid>.webp`.
- **Acesso:** `GET /api/v1/media/:id` serve o ficheiro; não há listagem pública do diretório.

O volume não deve ser servido diretamente por NGINX nem publicado na internet. O acesso passa pela API, que valida o ID e aplica `Content-Type` e `X-Content-Type-Options`.

## Quotas por utilizador

Variáveis:

```dotenv
MEDIA_QUOTA_BYTES_PER_USER=52428800
MEDIA_QUOTA_ASSETS_PER_USER=100
```

Valores por omissão: 50 MiB e 100 imagens ativas por utilizador. A quota é global à conta, não por loja.

O `MediaQuotaService` reserva a linha em `media_assets` dentro de uma transação e usa `pg_advisory_xact_lock(hashtext(user_id))`. Isto serializa uploads concorrentes do mesmo utilizador e evita que dois pedidos no limite ultrapassem a quota.

Quando o limite é excedido, a API responde `413 Payload Too Large`:

```json
{
  "code": "MEDIA_QUOTA_EXCEEDED",
  "message": "Atingiste o limite de imagens."
}
```

O limite por ficheiro continua a ser 5 MiB, validado antes da normalização. A soma da quota usa o tamanho da imagem WebP já normalizada.

Assets com `deleted_at` preenchido não contam para a quota nem são servidos. A limpeza de órfãos descrita abaixo remove linhas e ficheiros sem referências.

## Retenção

| Item | Retenção |
| --- | --- |
| Media ativo referenciado | Enquanto a referência existir. |
| Media órfão (sem referências) | Pelo menos 24 horas; depois pode ser limpo. |
| Backups locais de media | 14 dias (ver `docs/operations/backups.md`). |
| Backups off-host | Mínimo 14 dias; recomendado 30 dias. |

A janela de 24 horas protege contra uploads que ainda estão a ser associados a um anúncio, perfil ou campanha. Não reduzir sem revisão.

## Limpeza de órfãos

CLI:

```bash
node apps/api/scripts/cleanup-orphan-media.mjs [--dry-run|--apply] [--limit=100]
```

- `--dry-run` é o comportamento por omissão; imprime `id storage_key` e não altera nada.
- `--apply` remove o ficheiro e a linha.
- `--limit=N` limita o número de assets analisados (por omissão 100).

O script seleciona apenas assets com mais de 24 horas e sem referências em:

- `listing_images.media_asset_id`;
- `seller_profiles.logo_media_asset_id` ou `cover_media_asset_id`;
- `professional_profiles.photo_asset_id`;
- `professional_portfolio.asset_id`;
- `ad_campaigns.image_asset_id`.

O caminho é construído com `basename(storage_key)`; chaves com separadores de caminho são ignoradas para impedir path traversal. Um ficheiro já ausente (`ENOENT`) não impede a remoção da linha.

### Execução local

Com a stack de desenvolvimento ativa:

```bash
export DATABASE_URL=postgresql://praca:praca_local_dev@localhost:5432/praca_angola
export MEDIA_DIR="$PWD/.data/uploads"
node apps/api/scripts/cleanup-orphan-media.mjs --dry-run --limit=1000
node apps/api/scripts/cleanup-orphan-media.mjs --apply --limit=1000
```

O teste operacional automatizado é:

```bash
bash tests/ops/cleanup-media.sh
```

Resultado esperado:

```text
media cleanup ok
```

### Execução em produção

Preferir executar dentro do contentor, onde `DATABASE_URL` e `MEDIA_DIR` já estão definidos:

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T api \
  node apps/api/scripts/cleanup-orphan-media.mjs --dry-run --limit=1000
```

Depois de rever a lista:

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T api \
  node apps/api/scripts/cleanup-orphan-media.mjs --apply --limit=1000
```

Também é possível executar no host, desde que `DATABASE_URL` e `MEDIA_DIR` apontem para os valores corretos. O caminho do host para o volume pode ser obtido com:

```bash
docker volume inspect praca-angola-prod_media_data
```

### Agendamento

Exemplo de cron diário, depois do backup de media:

```cron
30 3 * * * cd /opt/praca && COMPOSE_PROJECT=praca-angola-prod COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILE=.env.prod /usr/bin/docker compose exec -T api node apps/api/scripts/cleanup-orphan-media.mjs --apply --limit=1000 >> /var/log/praca-media-cleanup.log 2>&1
```

O job deve falhar de forma visível. Monitorizar o código de saída e a linha `scanned=... deleted=...`; um erro repetido pode indicar migração em falta, permissões do volume ou indisponibilidade da base.

Nunca executar `--apply` sem uma revisão prévia em `--dry-run`, exceto se a limpeza estiver a ser repetida após uma falha já investigada.

## Backup e restauro

O backup de media está integrado no runbook geral:

- script: `infra/backup/backup-media.sh`;
- teste: `tests/ops/backup-restore.sh`;
- documentação: `docs/operations/backups.md`.

Criação manual:

```bash
COMPOSE_PROJECT=praca-angola-prod COMPOSE_FILE=docker-compose.prod.yml \
  COMPOSE_ENV_FILE=.env.prod BACKUP_DIR=/var/backups/praca \
  bash infra/backup/backup-media.sh
```

O resultado é `media-<UTC>.tar.gz` e o respetivo `.sha256`. Validar sempre antes de restaurar:

```bash
cd /var/backups/praca
sha256sum -c media-20261023T023000Z.tar.gz.sha256
```

Restauro (destrutivo para os media atuais):

```bash
cd /opt/praca
TAR=/var/backups/praca/media-20261023T023000Z.tar.gz

docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml stop api

docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml run --rm --no-deps -T api \
  sh -c 'rm -rf /app/apps/api/uploads/* && tar xzf - -C /app/apps/api/uploads' < "$TAR"

docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml up -d api web ingress
```

Restaurar a base de dados e os media do mesmo conjunto de backup. Se forem de momentos diferentes, algumas referências podem apontar para ficheiros inexistentes; a API responde `404` nesses casos.

Validar depois do restauro:

1. abrir uma imagem existente em `/api/v1/media/<id>`;
2. fazer um upload novo e confirmar que aparece no anúncio/perfil;
3. confirmar que a quota continua a contar os assets restaurados;
4. executar `--dry-run` da limpeza e confirmar que não lista assets referenciados.

## Troubleshooting

- **`413 MEDIA_QUOTA_EXCEEDED`:** confirmar a quota da conta, o número de assets ativos e o tamanho total. Não aumentar a quota sem revisão de capacidade.
- **Upload falha depois de reservar a quota:** o controlador remove o ficheiro parcial e chama `release`; confirmar nos logs se houve erro de permissões ou de disco.
- **Imagem 404:** verificar se a linha existe, se `deleted_at` está nulo e se o ficheiro existe no volume. O restauro de DB e media tem de ser consistente.
- **Limpeza não remove nada:** confirmar que o asset tem mais de 24 horas e que não está referenciado; usar `--dry-run` para ver a lista.
- **Erro de path traversal:** chaves com `/` ou `..` são ignoradas; investigar a origem do `storage_key`.
- **Disco cheio:** verificar `media_data`, backups locais e logs; não apagar o volume sem backup validado.

## Segurança

- O volume deve ter permissões restritas ao utilizador da API e ao grupo de operações.
- Backups de media contêm dados pessoais; aplicar encriptação off-host e retenção definida.
- Não aceitar nomes de ficheiro fornecidos pelo cliente; o servidor gera UUIDs.
- Não expor o diretório de uploads diretamente.
- Rever periodicamente a quota e o número de assets por conta para detetar abuso.
