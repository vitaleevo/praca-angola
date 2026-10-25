# Webhook Meta da PUVO

## Estado em 25/10/2026

- App Meta própria: **PUVO**, ID `2161321067754105`, negócio Agência Holyweb (`111362045204949`), caso de uso WhatsApp. Está em modo Live e o utilizador confirmou no painel Meta a subscrição do webhook WhatsApp, incluindo `messages`.
- Callback HTTPS: `https://puvo.vitaleevo.ao/api/v1/crm/webhooks/meta` (a API Railway também recebe a mesma rota no domínio `pracaapi-production.up.railway.app`).
- `META_WEBHOOK_VERIFY_TOKEN` foi gerado e guardado como variável do serviço Railway `@praca/api`; o valor não pertence ao repositório.
- API publicada no Railway no deployment `039edb45-3b13-4bd9-ab3e-101110395b20` (SUCCESS). A migração 022 foi aplicada. Verificação em produção: desafio correto HTTP 200 com resposta exata, POST com assinatura HMAC SHA-256 válida HTTP 200 (`{"status":"ignored"}` para lote vazio) e assinatura inválida HTTP 403.
- Backup PostgreSQL anterior à migração: `pre-meta-webhook-022`, ID `1ae42bcf-7c82-4af6-8b49-2476e045ed2e`, sem expiração.
- `META_APP_SECRET` e `META_WEBHOOK_VERIFY_TOKEN` estão configurados somente no serviço Railway `@praca/api`. O redeploy foi necessário para carregar o segredo novo; não guardar nem partilhar estes valores no repositório ou no chat.
- A app “Agentes” (`1627041295300870`) permanece ligada ao CRM em `api-crm.vitaleevo.ao`; não alterar as suas subscrições.
- A política de privacidade `https://puvo.vitaleevo.ao/privacidade` já foi preenchida no painel. A app está em modo Live; o email de contacto ainda aparece como não verificado.
- O Configuration ID `1120855583871113` é de Facebook Login for Business; não substitui o App Secret nem configura os webhooks WhatsApp.
- Dois Access Tokens foram partilhados numa conversa em 25/10/2026, incluindo um token do Graph API Explorer. Tratá-los como comprometidos e revogá-los. Criar um token permanente de System User para a API apenas quando a conta/número estiverem prontos. Nunca copiar tokens para este ficheiro, Git ou chat.

## Ativação

1. Associar a conta WhatsApp Business à app e criar a conexão CRM `whatsapp_cloud` da loja na PUVO com o `phone_number_id` correto; eventos de números sem conexão são ignorados sem criar dados.
2. Para envio de mensagens (não é necessário para a receção do webhook), guardar em `@praca/api` `WHATSAPP_CLOUD_ACCESS_TOKEN` e `WHATSAPP_CLOUD_PHONE_NUMBER_ID`. Usar um token de System User de longa duração e revogar quaisquer tokens temporários expostos.
4. Enviar um evento de teste, confirmar HTTP 200 e a entrada única no CRM, e repetir o mesmo evento para verificar idempotência. Em produção, não usar números nem dados de clientes para testes sem autorização.

O endpoint verifica `X-Hub-Signature-256` sobre o corpo original. A migração 022 guarda IDs de eventos para impedir duplicados nas reentregas da Meta. Erros de base de dados devolvem erro HTTP e permitem novo envio.
