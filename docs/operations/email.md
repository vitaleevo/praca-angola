# E-mail transacional — Praça Angola

Este documento cobre a configuração SMTP, os testes de registo e recuperação de palavra-passe, a autenticação de domínio (SPF/DKIM/DMARC) e o procedimento em caso de falha de entrega.

## Variáveis

| Variável | Obrigatória em produção | Descrição |
| --- | --- | --- |
| `SMTP_HOST` | Sim | Hostname do servidor SMTP do provider. |
| `SMTP_PORT` | Não (default `587`) | Porta SMTP. |
| `SMTP_SECURE` | Não (default `false`) | `true` para TLS implícito (normalmente `465`); `false` para STARTTLS (normalmente `587`). |
| `SMTP_USER` | Depende | Utilizador de autenticação. Se definido, `SMTP_PASSWORD` é obrigatório. |
| `SMTP_PASSWORD` | Depende | Password ou app password do provider. |
| `SMTP_FROM` | Sim | Remetente, por exemplo `Praça Angola <no-reply@marketplace.example>`. |
| `PUBLIC_SITE_URL` | Sim | Base dos links de confirmação e reset; tem de ser `https`. |

O `validateEnv` falha no arranque se `SMTP_HOST`, `SMTP_FROM`, `PUBLIC_SITE_URL` ou `WEB_ORIGIN` faltarem/invalidarem em produção. Também exige `SMTP_USER` e `SMTP_PASSWORD` em conjunto e valida `SMTP_PORT`/`SMTP_SECURE`.

### Exemplos

Provider com STARTTLS na 587:

```dotenv
SMTP_HOST=smtp.provider.example
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASSWORD=<segredo-do-provider>
SMTP_FROM=Praça Angola <no-reply@marketplace.example>
```

Provider com TLS implícito na 465:

```dotenv
SMTP_HOST=smtp.provider.example
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=apikey
SMTP_PASSWORD=<segredo-do-provider>
SMTP_FROM=Praça Angola <no-reply@marketplace.example>
```

Não usar `SMTP_SECURE=true` na porta 587 nem `false` na 465 sem confirmar a documentação do provider.

## Como a aplicação envia

- Registo: cria a conta e envia um link de confirmação válido durante 24 horas.
- Reenvio de confirmação: `POST /api/v1/auth/email-verification-requests`.
- Reset: `POST /api/v1/auth/password-reset-requests`; o link é válido durante 30 minutos e, após alteração, revoga as sessões ativas.
- Convites de equipa: link válido durante 7 dias.
- Avisos de serviços: usam `PUBLIC_SITE_URL` para construir o link.

Os endpoints de pedido devolvem `202` mesmo quando o e-mail não existe, para não revelar que contas estão registadas. Se `SMTP_HOST` ou `SMTP_FROM` estiverem ausentes, o serviço responde `503` com o código `EMAIL_DELIVERY_UNAVAILABLE` antes de criar a conta.

Se a conta já foi criada mas a entrega falhar, o registo continua concluído e o erro é registado; o utilizador pode pedir reenvio. Monitorizar os avisos:

```text
New account verification email could not be delivered.
Account verification email could not be delivered.
Password reset email could not be delivered.
```

## Teste em desenvolvimento (Mailpit)

A stack de desenvolvimento usa Mailpit:

```dotenv
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_SECURE=false
SMTP_FROM=Praça Angola <no-reply@praca.local>
```

Interface: `http://localhost:8025`.

Fluxo:

1. Registar uma conta em `http://localhost:3100/registo`.
2. Abrir Mailpit e confirmar a mensagem para o endereço de teste.
3. Abrir o link e confirmar que a conta fica verificada.
4. Pedir reset, abrir o link, definir nova palavra-passe e confirmar que as sessões antigas foram revogadas.

Também é possível enviar uma mensagem direta:

```bash
swaks --server localhost:1025 \
  --from no-reply@praca.local \
  --to teste@praca.local \
  --header "Subject: Teste Praça Angola" \
  --body "Mensagem de teste"
```

## Teste em staging/produção

Usar uma conta de teste real e um domínio de teste autorizado. Nunca usar a conta de um cliente.

```bash
# Não colocar a password diretamente no histórico do shell.
read -r -s SMTP_PASSWORD
export SMTP_PASSWORD

swaks --server "$SMTP_HOST:$SMTP_PORT" \
  --tls \
  --auth LOGIN \
  --auth-user "$SMTP_USER" \
  --from "$SMTP_FROM" \
  --to ops@marketplace.example \
  --header "Subject: Teste SMTP Praça Angola" \
  --body "Teste de entrega e autenticação."
```

Se o provider usar TLS implícito, ajustar `--tls`/porta conforme a documentação. Confirmar:

- mensagem recebida na caixa de entrada, não apenas em spam;
- cabeçalhos `Authentication-Results` com `spf=pass`, `dkim=pass` e `dmarc=pass`;
- links apontam para `PUBLIC_SITE_URL`, não para `localhost`;
- o remetente visível e o envelope `From` pertencem ao domínio autorizado.

## SPF, DKIM e DMARC

Publicar no DNS do domínio do remetente:

1. **SPF**: TXT no domínio, com os `include` do provider. Exemplo genérico:

```text
v=spf1 include:spf.provider.example ~all
```

Não criar múltiplos registos SPF; juntar os includes num único TXT. Validar com o provider.

2. **DKIM**: criar os registos TXT/CNAME fornecidos pelo provider, normalmente em `<selector>._domainkey.marketplace.example`. O provider assina as mensagens; confirmar o selector ativo.

3. **DMARC**: começar em monitorização e depois endurecer:

```text
v=DMARC1; p=none; rua=mailto:dmarc@marketplace.example; adkim=s; aspf=s
```

Depois de confirmar alinhamento e entregabilidade, passar para `p=quarantine` e, por fim, `p=reject`. Não ativar `reject` antes de SPF/DKIM estarem estáveis.

4. **Domínio de envio**: `SMTP_FROM` deve usar o domínio alinhado com SPF/DKIM/DMARC. Evitar domínios de terceiros no `From`.

5. **PTR/rDNS**: se o provider o exigir, confirmar o registo inverso do IP de saída.

## Falhas e monitorização

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| Registo devolve `503 EMAIL_DELIVERY_UNAVAILABLE` | `SMTP_HOST`/`SMTP_FROM` ausente ou configuração inválida | Corrigir `.env.prod`, reiniciar a API e repetir o teste. |
| Conta criada mas sem e-mail | Provider indisponível, credenciais erradas, bloqueio anti-spam | Ver logs, testar `swaks`, confirmar credenciais e reputação; pedir reenvio. |
| Links abrem `localhost` | `PUBLIC_SITE_URL` errado | Corrigir e reiniciar; repetir o fluxo. |
| E-mail em spam | SPF/DKIM/DMARC ou reputação | Validar DNS, conteúdo e histórico do domínio; não pedir aos utilizadores para marcar como seguro como solução permanente. |
| `535 Authentication failed` | Password/app password errada ou rotação | Atualizar segredo no gestor e no `.env.prod`; reiniciar a API. |
| Atraso no outbox | Worker/Redis/email | Ver `docs/operations/monitoring.md`; confirmar eventos presos e reprocessar. |

Alertas recomendados:

- aumento de `503` em `/api/v1/auth/register`;
- ocorrências de `could not be delivered` em 5 minutos;
- falhas de autenticação SMTP no provider;
- atraso do outbox >300 s;
- relatórios DMARC com falhas de alinhamento.

## Segurança e rotação

- Guardar `SMTP_PASSWORD` no gestor de segredos, nunca no Git.
- Usar uma app password dedicada, com o mínimo de permissões.
- Rodar a password após suspeita de exposição e sempre que o provider o exigir.
- Não registar o corpo do e-mail, tokens ou links completos nos logs.
- Confirmar TLS entre a API e o provider; não desativar a verificação de certificados.
- Manter `SMTP_FROM` e os registos DNS sob controlo da equipa.
