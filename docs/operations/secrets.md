# Segredos e rotação — Praça Angola

Este documento inventaria os segredos da Praça Angola, define onde são guardados e descreve a rotação da palavra-passe da base de dados, SMTP, sessões, tokens operacionais e da chave de cifra de dados privados.

## Inventário

| Segredo | Onde é usado | Impacto se exposto | Rotação |
| --- | --- | --- | --- |
| `POSTGRES_PASSWORD` / `DATABASE_URL` | PostgreSQL e API | Acesso total aos dados | Trimestral e após incidente |
| `SMTP_PASSWORD` | Envio de e-mail | Envio em nome do domínio; spam/reputação | Trimestral e após incidente |
| `APP_ENCRYPTION_KEY` | Cifra de dados de pagamento em `seller_profiles` | Leitura de telefones/recipientes privados | Trimestral e após incidente |
| `APP_ENCRYPTION_KEY_PREVIOUS` | Só durante a rotação | Fallback temporário de leitura | Remover após `--verify` |
| `METRICS_TOKEN` | Scrape interno de métricas | Exposição de métricas operacionais | Trimestral |
| `SENTRY_DSN` | Envio de erros para Sentry | Ingestão de eventos/ruído | Quando o projeto for recriado ou após incidente |
| Chave/conta ACME do Caddy | Emissão TLS | Emissão de certificados para o domínio | Recuperar/rodar com o Caddy |
| Backups | PostgreSQL/media | Cópia integral dos dados | Cifrar em repouso; acesso restrito |

Os cookies de sessão não são um segredo armazenado: o token é aleatório e a base guarda apenas o hash. Ainda assim, a base de dados e os backups permitem revogar sessões.

## Armazenamento

1. **Preferido:** gestor de segredos (Vault, AWS Secrets Manager, 1Password, etc.) com acesso auditado e least privilege.
2. **Alternativa operacional:** `.env.prod` no host, fora do Git, com permissões `600` e proprietário do utilizador de deploy.
3. **Nunca:** commits, issues, pull requests, chat, capturas de ecrã, logs, comandos com o segredo no histórico ou ficheiros em diretórios partilhados.
4. **CI:** usar secrets do repositório/ambiente, nunca imprimir valores; mascarar variáveis.
5. **Backups:** tratar como confidenciais; cifrar em repouso e restringir o acesso. Um backup contém dados pessoais e ciphertext, não as chaves.

Criar/atualizar o ficheiro:

```bash
cd /opt/praca
umask 077
install -m 600 /dev/null .env.prod
$EDITOR .env.prod
```

Confirmar:

```bash
stat -c '%a %U:%G %n' .env.prod
git check-ignore -v .env.prod
```

## Calendário e responsabilidade

| Item | Frequência | Responsável |
| --- | --- | --- |
| DB e SMTP | Trimestral | Platform/DevOps |
| `APP_ENCRYPTION_KEY` | Trimestral ou após suspeita | Security + Platform |
| `METRICS_TOKEN` | Trimestral | Platform |
| Sessões de utilizadores | Após incidente ou compromisso | Security |
| Revisão de acessos | Trimestral | Owner da plataforma |
| Teste de restauro | Mensal | Platform |

Registar cada rotação com data, responsável, motivo, sistemas atualizados e evidência de verificação. Não registar os valores.

## Rotação da base de dados

1. Fazer backup e confirmar o checksum:

```bash
sudo -u praca env \
  COMPOSE_PROJECT=praca-angola-prod \
  COMPOSE_FILE=docker-compose.prod.yml \
  COMPOSE_ENV_FILE=.env.prod \
  BACKUP_DIR=/var/backups/praca \
  bash infra/backup/backup-postgres.sh
```

2. Gerar um password sem caracteres problemáticos para URL (hex é seguro):

```bash
NEW_DB_PASSWORD="$(openssl rand -hex 32)"
```

3. Alterar a password do role no PostgreSQL:

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T postgres \
  psql -U praca -d postgres \
  -c "ALTER USER praca WITH PASSWORD '${NEW_DB_PASSWORD}';"
```

4. Atualizar `POSTGRES_PASSWORD` e `DATABASE_URL` no `.env.prod`. Se o password não for hex, codificar os caracteres especiais na URL.
5. Recriar/reiniciar a API e confirmar readiness e login:

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml up -d api
curl -fsS "https://${PUBLIC_DOMAIN}/api/v1/health/ready"
```

6. Confirmar que a password antiga já não autentica (teste controlado) e revogar qualquer credencial antiga no gestor.
7. Rollback: repor a password anterior com `ALTER USER`, restaurar `DATABASE_URL`/`POSTGRES_PASSWORD` e reiniciar a API.

Não alterar apenas `POSTGRES_PASSWORD` no `.env.prod` sem `ALTER USER`: a variável só é usada na inicialização do volume; a base existente mantém a password antiga.

## Rotação de SMTP

1. Criar uma nova app password no provider, com o mínimo de permissões.
2. Atualizar `SMTP_PASSWORD` no `.env.prod` (e `SMTP_USER`/`SMTP_HOST` se mudaram).
3. Reiniciar a API e testar com `swaks` e com um registo real de teste; ver `docs/operations/email.md`.
4. Confirmar `Authentication-Results` com SPF/DKIM/DMARC a passar.
5. Revogar a app password antiga no provider.
6. Rollback: manter a app password antiga ativa até o teste passar; se falhar, repor o valor anterior e reiniciar.

## Revogação de sessões

Para forçar novo login de todas as contas (por exemplo, após suspeita de roubo de sessão):

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml exec -T postgres \
  psql -U praca -d praca_angola \
  -c "UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL;"
```

Confirmar que os utilizadores são redirecionados para login e que novos logins funcionam. Comunicar a operação se afetar muitos utilizadores.

## Rotação da chave de cifra

A chave cifra `seller_profiles.mcx_recipient_name_ciphertext` e `mcx_phone_ciphertext` com AES-256-GCM. A chave atual cifra novos valores; a chave anterior só é usada para ler valores antigos durante a transição.

### Preparação

1. Fazer backup da base.
2. Gerar uma chave nova com pelo menos 32 caracteres (por exemplo, 48 bytes em base64):

```bash
openssl rand -base64 48
```

3. Guardar a chave antiga no gestor de segredos e anotar o identificador da versão.
4. No `.env.prod`, colocar a chave nova em `APP_ENCRYPTION_KEY` e a antiga em `APP_ENCRYPTION_KEY_PREVIOUS`.
5. Reconstruir e reiniciar a API com ambas as chaves:

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml up -d --build api
```

6. Confirmar que a aplicação continua a ler um perfil de loja com dados antigos (telefone mascarado/recibo). A API tenta a chave atual e depois a anterior.

### Ensaiar, aplicar e verificar

Executar dentro do contentor da API (o script usa `DATABASE_URL` e as chaves do serviço):

```bash
# 1. Ensaio: lista IDs e não altera nada.
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml run --rm --no-deps api \
  node apps/api/scripts/rotate-encryption-key.mjs --dry-run --batch=100

# 2. Aplicar: decifra com a chave atual/anterior e cifra com a nova.
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml run --rm --no-deps api \
  node apps/api/scripts/rotate-encryption-key.mjs --apply --batch=100

# 3. Verificar: o script remove APP_ENCRYPTION_KEY_PREVIOUS do processo
#    e falha se alguma linha não decifrar só com a chave nova.
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml run --rm --no-deps api \
  node apps/api/scripts/rotate-encryption-key.mjs --verify --batch=100
```

O resultado tem o formato:

```text
scanned=12 updated=12 failed=0
```

- `--dry-run` é o modo por omissão e não altera dados.
- `--apply` exige `APP_ENCRYPTION_KEY_PREVIOUS` e faz atualização por linha; uma falha numa linha não impede as restantes, mas o processo termina com código 1.
- `--verify` exige apenas a chave nova; se falhar, **não** remover a chave anterior.
- `--batch=1` pode ser usado para ensaios pequenos.

Se a API estiver a correr com a chave nova e a anterior, os novos valores já são cifrados com a nova. O script só re-cifra linhas antigas.

### Remover a chave anterior

Depois de `--verify` devolver `failed=0`:

1. remover `APP_ENCRYPTION_KEY_PREVIOUS` do `.env.prod`;
2. redeployar/reiniciar a API;
3. confirmar novamente a leitura de dados privados e a criação de um novo perfil/recibo;
4. manter a chave antiga no gestor de segredos durante o período de retenção/rollback, mas não a disponibilizar à aplicação.

### Rollback

- Se `--apply` falhar, manter a chave anterior e investigar os IDs falhados; a aplicação continua a ler com o key ring.
- Se `--verify` falhar, não remover `APP_ENCRYPTION_KEY_PREVIOUS`; repetir `--apply` ou restaurar o backup.
- Se for necessário voltar à chave antiga, colocar a antiga em `APP_ENCRYPTION_KEY`, manter a nova em `APP_ENCRYPTION_KEY_PREVIOUS`, redeployar e re-cifrar no sentido inverso. Nunca apagar a chave antiga antes de o backup e a verificação estarem confirmados.

## Outros tokens

- `METRICS_TOKEN`: gerar novo valor, atualizar o `.env.prod` e o scrape do Prometheus, reiniciar a API e confirmar `200`; o valor antigo deixa de funcionar.
- `SENTRY_DSN`: criar/rodar a chave do projeto, atualizar o `.env.prod`, reiniciar e confirmar um evento de teste; revogar a chave antiga no Sentry.
- `ACME_EMAIL`: não é segredo, mas deve ser um endereço monitorizado. A conta/chave ACME do Caddy deve ser incluída na recuperação do host.

## Proibições

- Não copiar `.env.prod` para o repositório, chat, issues ou ferramentas de IA.
- Não colocar segredos em `docker-compose*.yml`, Dockerfiles, scripts versionados ou exemplos com valores reais.
- Não usar a mesma password em base de dados, SMTP e gestor.
- Não desativar `validateEnv`, TLS ou rate limits para “resolver” uma falha de configuração.
- Não remover `APP_ENCRYPTION_KEY_PREVIOUS` antes de `--verify` passar.
- Não imprimir texto cifrado, tokens, cookies ou links completos de reset nos logs.
