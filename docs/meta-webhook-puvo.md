# Webhook Meta da PUVO

## Estado em 26/10/2026

- App Meta própria: **PUVO**, ID `2161321067754105`, negócio Agência Holyweb (`111362045204949`), caso de uso WhatsApp. Está em modo Live e o utilizador confirmou no painel Meta a subscrição do webhook WhatsApp, incluindo `messages`.
- Callback HTTPS: `https://puvo.vitaleevo.ao/api/v1/crm/webhooks/meta` (a API Railway também recebe a mesma rota no domínio `pracaapi-production.up.railway.app`).
- `META_WEBHOOK_VERIFY_TOKEN` foi gerado e guardado como variável do serviço Railway `@praca/api`; o valor não pertence ao repositório.
- API publicada no Railway no deployment `e053900e-2ed6-4b20-b480-7ada40112f66` (SUCCESS). As migrações 022 e 023 foram aplicadas. Verificação em produção: desafio correto HTTP 200 com resposta exata, POST com assinatura HMAC SHA-256 válida HTTP 200 (`{"status":"ignored"}` para lote vazio) e assinatura inválida HTTP 403.
- Backup PostgreSQL anterior à migração: `pre-meta-webhook-022`, ID `1ae42bcf-7c82-4af6-8b49-2476e045ed2e`, sem expiração.
- `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_ID` e `META_OAUTH_REDIRECT_URI` estão configurados somente no serviço Railway `@praca/api`. O código cifra os tokens de Página, Instagram e WhatsApp com `APP_ENCRYPTION_KEY`; não guardar nem partilhar estes valores no repositório ou no chat.
- A app “Agentes” (`1627041295300870`) permanece ligada ao CRM em `api-crm.vitaleevo.ao`; não alterar as suas subscrições.
- A política de privacidade `https://puvo.vitaleevo.ao/privacidade` já foi preenchida no painel. A app está em modo Live; o email de contacto ainda aparece como não verificado.
- O Configuration ID `1120855583871113` é de Facebook Login for Business; não substitui o App Secret nem configura os webhooks WhatsApp.
- Dois Access Tokens foram partilhados numa conversa em 25/10/2026, incluindo um token do Graph API Explorer. Tratá-los como comprometidos e revogá-los. Criar um token permanente de System User para a API apenas quando a conta/número estiverem prontos. Nunca copiar tokens para este ficheiro, Git ou chat.

## Gestão unificada no CRM

- Em **Vendedor → CRM → Live Inbox**, o utilizador autenticado pode ligar Páginas Facebook e contas Instagram profissionais através do OAuth Meta, selecionar as Páginas devolvidas e desligar canais. A UI nunca recebe o App Secret e não volta a revelar tokens guardados.
- O CRM subscreve a Página aos eventos `messages`, `messaging_postbacks` e `leadgen`, e a conta Instagram aos eventos `messages`. Eventos Messenger, Instagram Direct e WhatsApp são idempotentes e entram no mesmo inbox; respostas de texto são enviadas pela Graph API com o token cifrado do canal.
- A Meta exige que a conta Instagram seja profissional e esteja associada à Página Facebook. A funcionalidade só funciona para permissões aprovadas/permitidas no modo atual da app.

## Ativação restante

1. No painel Meta da app PUVO, adicionar **exactamente** `https://puvo.vitaleevo.ao/api/v1/crm/webhooks/meta/callback` em **Facebook Login → Settings → Valid OAuth Redirect URIs**. Sem este passo, a Meta recusa o fluxo “Ligar Facebook e Instagram”.
2. No painel Webhooks, subscrever os objetos **Page** (campos `messages`, `messaging_postbacks`, `leadgen`) e **Instagram** (`messages`) ao mesmo callback HTTPS. A subscrição ao nível da Página/Instagram também é efetuada quando a ligação é confirmada no CRM.
3. Em **Vendedor → CRM → Live Inbox**, usar “Ligar Facebook e Instagram”, autorizar apenas as Páginas da loja e confirmar a seleção devolvida pela Meta.
4. Para WhatsApp, usar “Ligar WhatsApp” e introduzir o `phone_number_id` e um token de System User de longa duração. O token é cifrado no servidor. Revogar os tokens temporários que foram expostos.
5. Enviar uma mensagem de teste autorizada por cada canal, confirmar uma única entrada no inbox e uma resposta de texto. Não usar dados de clientes reais sem consentimento.

O endpoint verifica `X-Hub-Signature-256` sobre o corpo original. A migração 022 guarda IDs de eventos para impedir duplicados nas reentregas da Meta. Erros de base de dados devolvem erro HTTP e permitem novo envio.
