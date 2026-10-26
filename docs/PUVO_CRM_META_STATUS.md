# PUVO CRM / Meta — estado em 26-10-2026

## Confirmado

- App Meta PUVO `2161321067754105` está em modo live; os tópicos webhook Page, Instagram e WhatsApp constam como ativos.
- O App Review da PUVO consta como `UNSUBMITTED`. A consulta de privilégios da app não mostra acesso live às permissões necessárias para listar Páginas, ler e responder mensagens ou gerir comentários. A subscrição do webhook por si só não concede esses acessos.
- O Login for Business usa a configuração `1120855583871113`; o conjunto de permissões desta configuração ainda precisa de ser conferido no painel Meta.
- O CRM recebe novas mensagens de Messenger e Instagram por webhook quando o canal da loja está realmente ligado e autorizado. Não existe importação retroativa de conversas nem gestão de comentários no código atual.
- O acesso às Páginas é obtido por `me/accounts`; se a Meta não devolver Páginas, o CRM não consegue associar uma Página ou o Instagram profissional correspondente.

## Entregue nesta etapa

- Analytics e Automações usam o mesmo layout e menu da conta/loja.
- O frontend de Automações usa a rota API real `/api/v1/crm/automations` e exibe falhas de carga e gravação.
- O estilo destas duas páginas usa o CSS do CRM e os controlos visuais da loja, sem emoji como ícone de ação.
- `last_sync_at` passa a indicar a última mensagem recebida; ligar um canal já não simula uma sincronização.
- O gestor de canais explica a diferença entre autorização, mensagens novas e importação de histórico/comentários.

## Próximo passo para operação real

1. Confirmar no Meta Login for Business da app PUVO uma configuração apropriada para Facebook Pages e Instagram profissional, com os acessos necessários. O ID existente pode pertencer a outro caso de uso.
2. Preparar e submeter App Review para `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `pages_read_user_content`, `pages_manage_engagement` e `instagram_manage_comments`, conforme os fluxos que serão publicados. Verificar as dependências e nomes atuais no painel Meta antes da submissão.
3. Após aprovação, ligar uma Página real com Instagram profissional associado em uma loja de teste e verificar `me/accounts`, `subscribed_apps`, webhooks recebidos e envio de resposta.
4. Implementar importação paginada de histórico e o módulo de comentários com posse por loja, idempotência, limites da Graph API e testes; publicar estes recursos somente depois da validação com permissões reais.

Nenhum token ou segredo deve ser copiado para este ficheiro ou para os logs.
