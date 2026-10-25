# Webhook Meta da PUVO

## Estado em 25/10/2026

- App Meta própria: **PUVO**, ID `2161321067754105`, negócio Agência Holyweb (`111362045204949`), caso de uso WhatsApp. Está em modo de desenvolvimento, sem subscrições de webhook.
- Callback HTTPS: `https://puvo.vitaleevo.ao/api/v1/crm/webhooks/meta` (a API Railway também recebe a mesma rota no domínio `pracaapi-production.up.railway.app`).
- `META_WEBHOOK_VERIFY_TOKEN` foi gerado e guardado como variável do serviço Railway `@praca/api`; o valor não pertence ao repositório.
- **Pendente:** obter o App Secret no painel Meta e guardá-lo como `META_APP_SECRET` no mesmo serviço Railway. Até lá, POST falha fechado com 503. O token de verificação sozinho não autentica eventos.
- A app “Agentes” (`1627041295300870`) permanece ligada ao CRM em `api-crm.vitaleevo.ao`; não alterar as suas subscrições.

## Ativação

1. Na app Meta PUVO, abrir **App settings → Basic → App secret**, revelar o segredo no próprio painel e guardá-lo diretamente na variável Railway `META_APP_SECRET` do serviço `@praca/api`, ambiente `production`. Não o enviar por chat nem gravar em Git.
2. Após o deploy da API com a migração `022_crm_meta_webhook_idempotency.sql`, configurar a subscrição `whatsapp_business_account` para o callback acima, com o token de verificação guardado no Railway e o campo `messages`. A Meta exige que o GET de verificação devolva o `hub.challenge`.
3. Ligar a conta WhatsApp Business à app e subscrevê-la ao webhook. Criar a conexão `whatsapp_cloud` da loja na PUVO com o `phone_number_id` correto; eventos de números sem conexão são ignorados.
4. Enviar um evento de teste, confirmar HTTP 200 e a entrada única no CRM, e repetir o mesmo evento para verificar idempotência. Em produção, não usar números nem dados de clientes para testes sem autorização.

O endpoint verifica `X-Hub-Signature-256` sobre o corpo original. A migração 022 guarda IDs de eventos para impedir duplicados nas reentregas da Meta. Erros de base de dados devolvem erro HTTP e permitem novo envio.
