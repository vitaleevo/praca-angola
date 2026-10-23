# Backups e restauro — Praça Angola

Este documento descreve a operação de backup e restauro do PostgreSQL e dos media da Praça Angola. Os scripts são intencionalmente simples: usam os contentores do Compose, geram checksums e mantêm uma retenção local de 14 dias. A cópia off-host é uma responsabilidade operacional separada.

## Objetivos

| Item | Objetivo |
| --- | --- |
| RPO — dados transacionais | 6 horas |
| RPO — media | 24 horas |
| RTO | 2 horas |
| Retenção local | 14 dias |
| Teste de restauro | Mensal, com evidência registada |

O RPO de 6 horas significa que, em caso de perda total do host, se aceita perder até 6 horas de dados. O RTO de 2 horas é o tempo-alvo para repor o serviço, incluindo a validação mínima.

## O que é salvaguardado

- **PostgreSQL:** dump lógico em formato custom (`pg_dump --format=custom`), sem owners nem privilégios.
- **Media:** arquivo `tar.gz` do volume de uploads montado em `/app/apps/api/uploads`.
- **Integridade:** cada arquivo tem um `.sha256` gerado no mesmo diretório.

Os dumps contêm dados pessoais e de negócio. Devem ser tratados como material confidencial.

## Pré-requisitos

- Repositório no host de operações, com os scripts em `infra/backup/`.
- Docker Engine e Docker Compose disponíveis para o utilizador que executa o backup.
- Stack de produção definida em `docker-compose.prod.yml` e segredos em `.env.prod`.
- Diretório de destino com espaço suficiente e permissões restritas. O valor por omissão é `/var/backups/praca`; pode ser alterado com `BACKUP_DIR`.
- Acesso à cópia off-host (rclone, rsync ou storage equivalente).

Os scripts usam por omissão:

```text
COMPOSE_PROJECT=praca-angola-prod
COMPOSE_FILE=docker-compose.prod.yml
COMPOSE_ENV_FILE=.env.prod
BACKUP_DIR=/var/backups/praca
```

## Scripts

| Script | Efeito |
| --- | --- |
| `infra/backup/backup-postgres.sh` | Cria `postgres-<UTC>.dump` e o respetivo `.sha256`. |
| `infra/backup/backup-media.sh` | Cria `media-<UTC>.tar.gz` e o respetivo `.sha256`. |
| `infra/backup/restore-postgres.sh <dump> <database>` | Apaga e recria a base indicada e restaura o dump. **Operação destrutiva.** |
| `tests/ops/backup-restore.sh` | Teste automatizado contra a stack de desenvolvimento. |

Execução manual em produção:

```bash
cd /opt/praca
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
```

Os scripts aplicam `umask 077`; o diretório e os arquivos devem continuar acessíveis apenas ao utilizador de backup e ao grupo de operações.

## Agenda

| Tarefa | Frequência | Janela sugerida |
| --- | --- | --- |
| PostgreSQL | A cada 6 horas | `00:00`, `06:00`, `12:00`, `18:00` UTC |
| Media | Diária | `02:30` UTC |
| Cópia off-host | Após cada backup | Imediatamente a seguir |
| Teste de restauro | Mensal | Primeira segunda-feira do mês |

A janela UTC evita ambiguidades de fuso horário. Ajustar apenas se a operação tiver uma janela de menor tráfego documentada.

## systemd

Exemplo de serviço e timer para PostgreSQL. Ajustar `WorkingDirectory`, utilizador e grupo ao host.

`/etc/systemd/system/praca-backup-postgres.service`:

```ini
[Unit]
Description=Praça Angola — backup PostgreSQL
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=/opt/praca
Environment=COMPOSE_PROJECT=praca-angola-prod
Environment=COMPOSE_FILE=docker-compose.prod.yml
Environment=COMPOSE_ENV_FILE=.env.prod
Environment=BACKUP_DIR=/var/backups/praca
ExecStart=/usr/bin/bash /opt/praca/infra/backup/backup-postgres.sh
User=praca
Group=docker
```

`/etc/systemd/system/praca-backup-postgres.timer`:

```ini
[Unit]
Description=Executa o backup PostgreSQL a cada 6 horas

[Timer]
OnCalendar=*-*-* 00/6:00:00
Persistent=true
RandomizedDelaySec=300

[Install]
WantedBy=timers.target
```

Para media, duplicar o serviço com `backup-media.sh` e usar:

```ini
[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=300
```

Ativar:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now praca-backup-postgres.timer praca-backup-media.timer
systemctl list-timers 'praca-backup-*'
```

O utilizador `praca` tem de pertencer ao grupo com acesso ao socket Docker. Confirmar com `docker compose version` executado pelo mesmo utilizador.

## cron (alternativa)

Se não for usado systemd:

```cron
0 */6 * * * cd /opt/praca && COMPOSE_PROJECT=praca-angola-prod COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILE=.env.prod BACKUP_DIR=/var/backups/praca /usr/bin/bash infra/backup/backup-postgres.sh >> /var/log/praca-backup.log 2>&1
30 2 * * * cd /opt/praca && COMPOSE_PROJECT=praca-angola-prod COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILE=.env.prod BACKUP_DIR=/var/backups/praca /usr/bin/bash infra/backup/backup-media.sh >> /var/log/praca-backup.log 2>&1
15 3 * * * rclone copy --checksum /var/backups/praca remote:praca-backups >> /var/log/praca-backup-offhost.log 2>&1
```

O `cron` deve ter `MAILTO` ou ser monitorizado por um sistema externo, porque um job que falha silenciosamente não protege nada.

## Retenção e cópia off-host

- **Local:** os scripts removem arquivos com mais de 14 dias (`-mtime +14`).
- **Off-host:** manter pelo menos 14 dias; recomenda-se 30 dias para permitir investigação de incidentes.
- **Imutabilidade:** quando o storage suportar, ativar object lock/versioning ou uma conta separada com permissões apenas de escrita.
- **Encriptação:** usar um remote `rclone crypt`, `age` ou equivalente. Não deixar dumps legíveis em storage partilhado.
- **Cópia:** preferir `rclone copy --checksum` ou `rsync -az` sem `--delete`, para não propagar uma remoção local para o off-host.

Exemplo com `rsync` para um host de backup:

```bash
rsync -az --ignore-existing /var/backups/praca/ backup-host:/srv/backups/praca/
```

Exemplo de limpeza off-host com retenção de 30 dias:

```bash
rclone delete remote:praca-backups --min-age 30d
```

A limpeza off-host deve ser uma tarefa separada e auditável; nunca deve correr antes de a cópia do dia estar confirmada.

## Verificação e alertas

Verificar o checksum antes de qualquer restauro:

```bash
cd /var/backups/praca
sha256sum -c postgres-20261023T060000Z.dump.sha256
sha256sum -c media-20261023T023000Z.tar.gz.sha256
```

Alertas mínimos:

- falha de execução do script (código de saída diferente de zero);
- ausência de dump PostgreSQL novo há mais de 7 horas;
- ausência de arquivo de media novo há mais de 26 horas;
- falha de cópia off-host;
- falha do teste mensal de restauro.

Exemplo de verificação da idade do último dump:

```bash
find /var/backups/praca -name 'postgres-*.dump' -mmin -420 | grep -q . \
  || echo 'ALERTA: sem backup PostgreSQL nas últimas 7 horas'
```

O alerta deve chegar ao canal de incidentes da equipa, não apenas ao log local.

## Restauro PostgreSQL

O restauro para a base de produção é destrutivo. Fazer sempre primeiro um backup de segurança do estado atual.

### 1. Preparar e validar

```bash
cd /opt/praca
DUMP=/var/backups/praca/postgres-20261023T060000Z.dump
(cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")
```

Escolher uma janela de manutenção e comunicar a indisponibilidade.

### 2. Parar escritas

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml stop web api ingress
```

O PostgreSQL deve continuar a correr para receber o restauro.

### 3. Criar um dump de segurança

```bash
COMPOSE_PROJECT=praca-angola-prod COMPOSE_FILE=docker-compose.prod.yml \
  COMPOSE_ENV_FILE=.env.prod BACKUP_DIR=/var/backups/praca \
  bash infra/backup/backup-postgres.sh
```

### 4. Restaurar

Para ensaio, usar uma base separada:

```bash
COMPOSE_PROJECT=praca-angola-prod COMPOSE_FILE=docker-compose.prod.yml \
  COMPOSE_ENV_FILE=.env.prod \
  bash infra/backup/restore-postgres.sh "$DUMP" praca_restore_test
```

Para produção, substituir `praca_restore_test` por `praca_angola`. Confirmar duas vezes o nome da base antes de executar.

### 5. Validar

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T postgres \
  psql -U praca -d praca_angola -c 'SELECT count(*) FROM users;'

docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T postgres \
  psql -U praca -d praca_angola -c 'SELECT count(*) FROM listings;'
```

Comparar com os valores esperados do dump e verificar a integridade das tabelas principais (`users`, `listings`, `orders`, `service_requests`).

### 6. Voltar a colocar o serviço

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml up -d api web ingress
```

A API executa as migrações no arranque. Confirmar:

```bash
curl -fsS http://127.0.0.1:3200/_ingress-health
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml ps
```

Smoke tests mínimos: abrir a homepage, entrar com uma conta de teste, listar o catálogo e abrir uma encomenda existente. Só declarar o restauro concluído depois destes testes.

## Restauro de media

O restauro de media deve ser feito na mesma janela de manutenção.

```bash
cd /opt/praca
TAR=/var/backups/praca/media-20261023T023000Z.tar.gz
(cd "$(dirname "$TAR")" && sha256sum -c "$(basename "$TAR").sha256")

docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml stop api

docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml run --rm --no-deps -T api \
  sh -c 'rm -rf /app/apps/api/uploads/* && tar xzf - -C /app/apps/api/uploads' < "$TAR"

docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml up -d api web ingress
```

O `rm -rf` remove os media atuais. É por isso que o dump de segurança e a janela de manutenção são obrigatórios. Validar pelo menos uma imagem existente e o upload de uma imagem nova.

## Teste mensal

O teste automatizado atual usa a stack de desenvolvimento e prova que um dump pode ser restaurado para uma base separada, com contagens iguais nas tabelas principais:

```bash
pnpm stack:dev
bash tests/ops/backup-restore.sh
```

Resultado esperado:

```text
backup restore ok
```

O teste:

1. cria um dump PostgreSQL e verifica o checksum;
2. cria um arquivo de media e verifica o checksum;
3. cria `praca_restore_test`;
4. restaura o dump;
5. compara contagens de `users`, `listings`, `orders` e `service_requests`;
6. remove a base de teste.

No Windows, o teste usa `;` como separador de `COMPOSE_FILE`; no Linux/CI usa `:`. O script deteta o ambiente automaticamente.

Procedimento mensal em produção:

1. executar um backup novo;
2. restaurar o dump mais recente para uma base isolada (`praca_restore_test`) no mesmo host ou em staging;
3. executar as validações de contagens e smoke tests;
4. extrair o arquivo de media para um diretório temporário e confirmar que contém ficheiros legíveis;
5. registar data, dump usado, checksum, operador e resultado;
6. apagar a base/diretório de teste.

Um teste falhado é um incidente: não esperar pelo mês seguinte.

## Segurança e acesso

- Restringir o diretório de backup a `0700` e os arquivos a `0600`.
- Não colocar dumps no repositório Git nem em volumes servidos pela web.
- Usar credenciais de storage separadas das credenciais da aplicação.
- Registar quem executa restauros e quem acede ao storage off-host.
- Rodar credenciais de backup se houver suspeita de acesso não autorizado.
- Apagar backups expirados também no off-host, de forma auditável.

## Responsável e escalonamento

- **Responsável operacional:** Platform/DevOps lead.
- **Execução:** engenheiro de plantão (on-call).
- **Aprovação para restauro em produção:** responsável operacional ou tech lead.
- **Escalonamento:** on-call → tech lead → founder/CTO.

Critérios de severidade:

| Situação | Severidade | Ação |
| --- | --- | --- |
| Backup agendado falhou, mas existe cópia recente válida | P2 | Corrigir na janela seguinte e confirmar cópia off-host. |
| Sem backup dentro do RPO, ou cópia off-host em falta | P1 | Escalar de imediato; executar backup manual e validar. |
| Restauro falhou ou dados restaurados inconsistentes | P1 | Parar alterações, preservar evidência, escalar para tech lead. |
| Perda de dados confirmada | P1 | Ativar plano de incidentes e comunicação. |

O canal de incidentes deve ter um responsável nomeado por turno. O teste mensal e o resultado do último backup devem ser visíveis para toda a equipa de operações.
