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

## Próximo passo para operação real

1. Republicar `@praca/api` quando o builder Railway recuperar. Quatro tentativas, incluindo `5520bf61-8138-45f1-a373-cc5d69c7cf49`, falharam no daemon BuildKit antes de executar código. O painel Railway mostra um incidente de snapshots na região EU West (Amsterdam). A versão anterior continua ativa e a variável nova está guardada, mas ainda não foi aplicada a um deployment bem-sucedido. **Não iniciar novo OAuth até confirmar o deploy.**
2. Iniciar uma **nova** ligação no CRM; a autorização iniciada antes da troca da configuração contém o ID antigo e expirará. O titular precisa concluir a reautenticação Facebook na própria janela, sem partilhar a palavra-passe. Selecionar as Páginas devolvidas e então usar **Verificar acesso** por canal.
3. Aguardar a decisão Meta sobre Tech Provider. Depois, reduzir o rascunho App Review às permissões usadas, completar usos permitidos, tratamento de dados e instruções aos revisores, e submeter com demonstrações reais. O formulário básico tem ícone, política de privacidade e eliminação de dados; a URL dos Termos está vazia e `/termos` devolve 404, pelo que deve ser criada/revista antes de a usar.
4. Implementar e testar importação paginada de histórico e gestão de comentários antes de alegar essas capacidades no App Review. Após aprovação, validar `me/accounts`, `subscribed_apps`, webhooks recebidos e envio de resposta com uma loja real.

Nenhum token ou segredo deve ser copiado para este ficheiro ou para os logs.
