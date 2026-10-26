# PUVO CRM / Meta — estado em 26-10-2026

## Confirmado

- App Meta PUVO `2161321067754105` está em modo live; os tópicos webhook Page, Instagram e WhatsApp constam como ativos.
- O App Review da PUVO consta como `UNSUBMITTED`. A consulta de privilégios da app não mostra acesso live às permissões necessárias para listar Páginas, ler e responder mensagens ou gerir comentários. A subscrição do webhook por si só não concede esses acessos.
- A configuração de Login for Business `1120855583871113` contém apenas `whatsapp_business_management` e `whatsapp_business_messaging`. Por isso não pode listar Páginas nem associar o Instagram da loja.
- Foi criada a configuração independente **PUVO Redes Sociais** (`1376617274547161`) com token de utilizador e `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages` e `leads_retrieval`. `META_BUSINESS_LOGIN_CONFIG_ID` foi alterada no serviço Railway `@praca/api` para esse ID; confirmar que o redeploy terminou antes de testar um novo OAuth.
- `instagram_manage_messages`, `instagram_manage_comments` e `pages_manage_engagement` foram adicionadas aos casos de uso Meta e estão **Ready for testing**, o que ainda não significa acesso avançado para lojistas externos.
- A empresa Agência Holyweb consta como **Verified**. A verificação de acesso **Tech Provider** já tinha sido submetida em 10-10-2026 e continua **In review**. A Meta indica que só após essa verificação pode pedir acesso avançado no App Review.
- O App Review continua **Not submitted**. O rascunho passou a listar as permissões dos casos de uso da app, inclusive permissões sem implementação atual; deve ser reduzido e preenchido com usos reais antes de submissão.
- O CRM recebe novas mensagens de Messenger e Instagram por webhook quando o canal da loja está realmente ligado e autorizado. Não existe importação retroativa de conversas nem gestão de comentários no código atual.
- O acesso às Páginas é obtido por `me/accounts`; se a Meta não devolver Páginas, o CRM não consegue associar uma Página ou o Instagram profissional correspondente.

## Entregue nesta etapa

- Analytics e Automações usam o mesmo layout e menu da conta/loja.
- O frontend de Automações usa a rota API real `/api/v1/crm/automations` e exibe falhas de carga e gravação.
- O estilo destas duas páginas usa o CSS do CRM e os controlos visuais da loja, sem emoji como ícone de ação.
- `last_sync_at` passa a indicar a última mensagem recebida; ligar um canal já não simula uma sincronização.
- O gestor de canais explica a diferença entre autorização, mensagens novas e importação de histórico/comentários.
- Cada canal Facebook/Instagram pode agora ser verificado no CRM. A API consulta a validade e o âmbito do token na Meta, devolvendo somente o estado e as permissões em falta; a consulta é limitada à loja autenticada e não revela credenciais.
- Em 26-10-2026, a conta de Alexandre Macosso autorizou apenas a Página **Vitaleevo** e o Instagram profissional **@vitaleevo** na loja PUVO. O CRM mostra dois canais autorizados. **Verificar acesso** confirmou tokens válidos para a app PUVO e permissões de mensagens presentes em ambos. Para comentários faltam `pages_read_user_content` e `pages_manage_engagement` no Facebook, e `instagram_manage_comments` no Instagram. Ainda não houve mensagem real recebida nem teste de resposta.
- A lista devolvida pela Meta incluía 22 Páginas. O frontend foi corrigido para iniciar a seleção vazia, exigindo que o lojista escolha explicitamente as Páginas que quer associar à sua loja.

## Próximo passo para operação real

1. `@praca/api` foi republicado do checkout local no deployment `cc523bcc-a821-44c4-8b96-97b775e8553d` (**SUCCESS**). Healthcheck 200; rotas CRM e Meta Connect respondem 401 sem sessão, em vez do 404 causado por um redeploy anterior da fonte GitHub `main`. A configuração OAuth nova está aplicada. A branch `codex/account-sidebars` foi enviada até `01d7f80`; não usar `main` como fonte de redeploy da API antes de integrar o CRM.
2. Ligação e **Verificar acesso** concluídos para a Página Vitaleevo e @vitaleevo. Falta testar a chegada de uma mensagem real em cada canal e uma resposta a partir do CRM, sem usar conversas de terceiros como teste.
3. Aguardar a decisão Meta sobre Tech Provider. Depois, reduzir o rascunho App Review às permissões usadas, completar usos permitidos, tratamento de dados e instruções aos revisores, e submeter com demonstrações reais. O formulário básico tem ícone, política de privacidade e eliminação de dados; a URL dos Termos está vazia e `/termos` devolve 404, pelo que deve ser criada/revista antes de a usar.
4. Implementar e testar importação paginada de histórico e gestão de comentários antes de alegar essas capacidades no App Review. Após aprovação, validar `me/accounts`, `subscribed_apps`, webhooks recebidos e envio de resposta com uma loja real.

Nenhum token ou segredo deve ser copiado para este ficheiro ou para os logs.
