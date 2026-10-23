# TLS e Caddy — Praça Angola

Este documento descreve a terminação TLS no host com Caddy, a ligação ao ingress NGINX em loopback, a emissão/renovação de certificados e a verificação do domínio público.

## Arquitetura

```text
Internet :80/:443
        │
        ▼
   Caddy (host)  ── TLS, HSTS, COOP/CORP
        │
        ▼
127.0.0.1:3200  ── ingress NGINX do Compose
        │
        ├── web (Next.js)
        └── api (NestJS)
```

O Compose de produção publica o ingress apenas em `127.0.0.1:3200:80`. O Caddy é o único processo que deve escutar nas portas públicas `80` e `443`. O `infra/Caddyfile` usa `reverse_proxy 127.0.0.1:3200`; não voltar a usar um IP de contentor, porque esse IP muda quando o ingress é recriado.

## Pré-requisitos

- Domínio com registos DNS `A` (IPv4) e, se aplicável, `AAAA` (IPv6) a apontar para o host.
- Portas `80` e `443` abertas na firewall e livres de outro servidor web.
- Caddy instalado no host (repositório oficial da distribuição ou pacote oficial do Caddy). Confirmar:

```bash
caddy version
```

- Stack de produção a correr e ingress saudável:

```bash
docker compose --env-file .env.prod -p praca-angola-prod \
  -f docker-compose.prod.yml ps ingress
curl -fsS http://127.0.0.1:3200/_ingress-health
```

## Variáveis do Caddy

O Caddy não usa o `.env.prod` da API diretamente; usar um ficheiro próprio, apenas com os valores necessários:

```bash
sudo install -d -m 755 /etc/caddy
sudo install -m 600 /dev/null /etc/caddy/praca.env
sudoedit /etc/caddy/praca.env
```

Conteúdo:

```dotenv
PUBLIC_DOMAIN=marketplace.example
ACME_EMAIL=ops@marketplace.example
```

- `PUBLIC_DOMAIN` é o hostname, sem `https://` e sem barra final.
- `ACME_EMAIL` é o contacto usado pelo Let's Encrypt para avisos.
- O ficheiro deve pertencer a `root` (ou ao utilizador do Caddy) e ter permissões `600`.

Em systemd, carregar o ficheiro com um drop-in:

```bash
sudo systemctl edit caddy
```

```ini
[Service]
EnvironmentFile=/etc/caddy/praca.env
```

## Caddyfile

O ficheiro versionado é `infra/Caddyfile`:

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
	reverse_proxy 127.0.0.1:3200
}
```

Instalar/atualizar a cópia de produção:

```bash
sudo install -m 644 infra/Caddyfile /etc/caddy/Caddyfile
```

O `includeSubDomains` do HSTS só deve ser mantido se todos os subdomínios do domínio tiverem HTTPS válido. Se não for o caso, remover essa diretiva antes de ativar HSTS.

## Validação e reload

```bash
# Formatar (não altera o significado).
sudo caddy fmt --overwrite /etc/caddy/Caddyfile

# Carregar as variáveis e validar a configuração.
set -a
. /etc/caddy/praca.env
set +a
sudo caddy validate --config /etc/caddy/Caddyfile

# Aplicar sem downtime.
sudo systemctl reload caddy

# Confirmar que o processo está ativo e sem erros de emissão.
sudo systemctl status caddy --no-pager
sudo journalctl -u caddy -n 100 --no-pager
```

Não reiniciar o Caddy em paralelo com outro servidor nas portas 80/443. Se a validação falhar, corrigir o Caddyfile ou as variáveis antes do reload.

## Emissão do certificado

Com DNS correto e portas abertas, o Caddy obtém e renova automaticamente o certificado. A primeira emissão pode demorar alguns segundos. Verificar:

```bash
curl -sSI "https://${PUBLIC_DOMAIN}/" | head -20
curl -sSI "http://${PUBLIC_DOMAIN}/" | head -5
```

Esperado:

- `http://` responde com redirecionamento `308` para `https://`;
- `https://` responde `200`/`3xx` da aplicação;
- `Strict-Transport-Security` presente;
- `Server` ausente;
- `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy` presentes.

Inspecionar o certificado:

```bash
openssl s_client -connect "${PUBLIC_DOMAIN}:443" -servername "${PUBLIC_DOMAIN}" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Confirmar que o `subject`/`issuer` correspondem ao domínio e que a validade não está próxima do fim. O Caddy usa TLS 1.2+ por predefinição; não desativar a verificação de certificados no proxy.

## Renovação e alerta de expiração

O Caddy renova os certificados automaticamente. Os certificados e a conta ACME ficam no diretório de dados do Caddy (normalmente `/var/lib/caddy/.local/share/caddy`); não apagar esse diretório.

Além dos logs do Caddy, configurar uma verificação independente de expiração (por exemplo, cron diário) e ligar a falha ao canal de alertas:

```bash
#!/usr/bin/env bash
set -euo pipefail
domain="${PUBLIC_DOMAIN:?}"
if ! openssl s_client -connect "${domain}:443" -servername "${domain}" </dev/null 2>/dev/null \
  | openssl x509 -checkend 1209600 -noout; then
  echo "ALERTA: certificado de ${domain} expira em menos de 14 dias" >&2
  exit 1
fi
```

O alerta deve chegar ao mesmo canal de plantão da aplicação. Verificar também os logs do Caddy após cada renovação e sempre que houver alterações de DNS/firewall.

## Troubleshooting

| Sintoma | Verificação | Ação |
| --- | --- | --- |
| Caddy não emite certificado | DNS ainda não propagou; portas 80/443 fechadas; outro servidor ocupa as portas | `dig +short A "$PUBLIC_DOMAIN"`, `ss -ltnp '( sport = :80 or sport = :443 )'`, logs do Caddy. |
| `502 Bad Gateway` | Ingress parado ou não escuta em `127.0.0.1:3200` | `docker compose ... ps ingress`; `curl -v http://127.0.0.1:3200/_ingress-health`; recriar o ingress. |
| `connection refused` no loopback | Caddy em contentor ou ingress sem publicação loopback | Correr o Caddy no host e confirmar `127.0.0.1:3200:80` no Compose. |
| Loop de redirecionamento | Proxy a reescrever `X-Forwarded-Proto` ou HSTS em HTTP local | Confirmar `proxy-common.conf`; não emitir HSTS em desenvolvimento. |
| Certificado expirado | Renovação falhou ou relógio errado | Ver logs, validar DNS/firewall, confirmar hora do host; renovar manualmente só após diagnóstico. |
| HSTS inesperado em localhost | Caddy a servir um domínio de produção em dev | Nunca usar o Caddyfile de produção em `localhost`; HSTS é só para o domínio público. |

## Segurança operacional

- Manter apenas `80` e `443` expostos; o ingress `3200` é loopback.
- Não colocar chaves privadas, passwords SMTP ou `.env.prod` no repositório.
- Fazer backup do Caddyfile e do diretório de dados do Caddy (ou documentar a conta ACME) para recuperação.
- Revisitar HSTS, COOP/CORP e a política CSP em `docs/operations/security-headers.md`.
- Após alterações ao Caddyfile, validar, recarregar e repetir os smoke tests de `docs/operations/production-checklist.md`.
