# PUVO — preparação do App Review da Meta

Estado verificado em 27/10/2026 para a app `2161321067754105`. Este documento é um roteiro interno; não contém credenciais nem substitui as respostas no formulário da Meta.

## Estado do pedido

- O painel mostra **Not submitted**. O conector indica `UNSUBMITTED` e histórico vazio, mas também devolve «Cannot submit ... while a previous submission is in review». Esta contradição deve ser esclarecida no painel ou com o suporte Meta antes da submissão.
- Foram retirados do rascunho os pedidos sem uso atual: `Meta oEmbed Read`, `Threads oEmbed Read`, `instagram_branded_content_ads_brand`, `facebook_branded_content_ads_brand`, `ads_mcp_management`, `catalog_management`, `pages_manage_ads`, `read_insights`, `ads_management` e `business_management`. A remoção foi feita apenas do rascunho App Review.
- Permanecem pedidos de Páginas, Messenger, Instagram, WhatsApp, leads, `ads_read`, `Marketing API Access Tier` e `public_profile`. `ads_read` cobre apenas leitura de contas e relatórios; o CRM ainda não cria campanhas Meta.
- O conector confirma agora os casos de uso e declarações de `pages_read_user_content`, `pages_show_list`, `pages_manage_metadata`, `pages_manage_engagement`, `pages_messaging`, `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `whatsapp_business_management`, `whatsapp_business_messaging`, `ads_read`, `pages_read_engagement` e `leads_retrieval`. A Página Bajaj Angola foi selecionada como Página de teste de `pages_messaging`. As descrições de WhatsApp declaram expressamente que falta ligar e demonstrar um número real.
- A URL de eliminação configurada na Meta (`https://puvo.vitaleevo.ao/eliminar-dados`) foi publicada pela PR [#22](https://github.com/vitaleevo/praca-angola/pull/22), commit `72a39b4`, deployment Vercel `dpl_6ZGTgJU6rYHb9iWawjuBwe45EECG`. Em 27/10/2026 respondeu **200** com o conteúdo esperado; `/privacidade`, `/sitemap.xml` e o readiness da API também responderam 200. O CI da PR passou qualidade, migrações e E2E antes da publicação.
- O Compliance Center devolveu estado `compliant` e zero violações abertas; isto não equivale à aprovação das permissões nem à conclusão do App Review.

## Caminhos reais para demonstração

### Ensaio de prova em produção — 27/10/2026

- Entrei na conta PUVO do titular no browser de teste. O Live Inbox mostrou quatro canais autorizados: Facebook e Instagram de Bajaj Angola e Vitaleevo. A conversa Messenger de Bajaj Angola incluía uma resposta de teste real; o Instagram de Bajaj Angola e de Vitaleevo mostrava mensagens recebidas. A Página Facebook Vitaleevo ainda não tinha mensagem recebida no CRM.
- Executei **Verificar acesso** nos quatro canais. Todos indicaram permissões de mensagens e comentários presentes no token. As duas Páginas Facebook indicaram a app inscrita no webhook de mensagens. Esta verificação do token não substitui o teste de envio nem a aprovação para lojas fora da equipa de testes.
- Em **Redes sociais**, o Instagram de Bajaj Angola e as Páginas Facebook Bajaj Angola e Vitaleevo carregaram 20 publicações cada, com elementos de imagem. Na primeira publicação carregada da Página Vitaleevo, **Ver comentários** apresentou dois comentários reais e os campos para resposta. Guardei uma captura do painel de comentários em `output/meta-review-evidence/vitaleevo-facebook-comments-2026-10-27.png`.
- Este ensaio não inclui novo Login for Business, concessão de permissões, resposta a comentários nem ligação WhatsApp. É material de preparação; **não é ainda uma gravação completa para submeter à Meta**. A gravação definitiva deve usar uma conta e publicações de teste e incluir o login/concessão e a resposta confirmada, conforme o guia oficial abaixo.

Usar uma conta de loja de teste com permissões válidas e uma Página/Instagram profissional de teste. Fornecer o acesso de teste aos revisores pelo mecanismo seguro do formulário Meta; nunca inserir a palavra-passe neste repositório ou numa gravação.

1. Entrar em `/entrar`, abrir **A minha loja → CRM e vendas → Live Inbox** (`/vendedor/crm/conversas`).
2. Selecionar **Ligar Facebook e Instagram**, concluir o Login for Business da Meta, escolher explicitamente uma Página de teste e confirmar em **Confirmar ligações**. Mostrar que outras Páginas devolvidas pelo Login permanecem desmarcadas.
3. Usar **Verificar acesso** no canal ligado e mostrar o estado real das permissões e dos webhooks. Usar **Importar histórico** para mostrar conversas disponíveis, respeitando os limites da Meta.
4. Enviar uma nova mensagem de outra conta à Página de teste e à conta Instagram profissional ligada; abrir cada conversa no Live Inbox e responder. Gravar a chegada e a resposta na origem. Isto fundamenta `pages_messaging` e `instagram_manage_messages`.
5. Abrir **Redes sociais** (`/vendedor/crm/redes-sociais`), escolher o canal, mostrar perfil, publicações, imagens e comentários. Responder a um comentário de teste apenas se a Meta conceder a permissão e a API confirmar o envio. Isto fundamenta `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement`, `instagram_basic` e `instagram_manage_comments`.
6. Para `leads_retrieval`, submeter um formulário Lead Ads de teste associado à Página e mostrar o contacto criado no funil da mesma loja. Guardar prova do webhook e da leitura de `field_data` sem expor dados de terceiros.
7. Para WhatsApp, demonstrar o Embedded Signup com um número Business elegível e sob controlo do titular, receção de mensagem e resposta na PUVO. Não apresentar como concluído enquanto o número não estiver ligado e verificado.
8. Para `ads_read`, autorizar uma conta de anúncios de teste após a permissão estar disponível, selecionar essa conta em **Anúncios Meta** (`/vendedor/crm/anuncios-meta`) e mostrar investimento, alcance, impressões e cliques dos últimos 30 dias com a moeda original. O botão de guardar rascunho não cria anúncio na Meta.

Cada gravação deve mostrar o domínio PUVO, a ação do utilizador, a chamada/resultado relevante e o efeito visível. Ocultar tokens, códigos, palavras-passe, IDs pessoais e conversas de clientes reais. Não usar respostas de API simuladas como prova de integração real.

Segundo o [guia oficial de gravações da Meta](https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/), cada permissão pedida precisa de uma gravação que mostre o login completo, a concessão da permissão e o uso dos dados no produto. Gravar em 1080p ou superior, com a janela até 1440 px de largura, usar legendas em inglês para explicar a interface portuguesa e dispensar áudio. Uma gravação pode seguir vários passos, mas a evidência de cada permissão deve ser identificável ao carregar o ficheiro no respetivo campo do formulário. O [tutorial App Review](https://developers.facebook.com/documentation/resp-plat-initiatives/appreview/tutorial) exige pelo menos uma chamada de API bem-sucedida por permissão nos 30 dias anteriores à submissão.

## Requisitos ainda por cumprir

- Gravações reais por permissão. O conector Meta ainda marca `screencast` incompleto nos pedidos relevantes.
- Chamadas de teste exigidas por cada permissão. A Meta avisa que a atualização do indicador pode levar até 24 horas. Não gerar chamadas repetidas sem necessidade nem usar tokens já expostos em conversas.
- `Marketing API Access Tier` exige pelo menos **500 chamadas Marketing API** com taxa de erro inferior a 15%, segundo o formulário Meta aberto em 27/10/2026. Não há tráfego real suficiente para satisfazer esse requisito; o caso de uso e a declaração desta funcionalidade permanecem em aberto. Avaliar retirar este pedido do rascunho atual e solicitá-lo mais tarde, quando houver uso real.
- A declaração de `public_profile` continua em aberto; a autorização do titular nesta conversa citou Páginas, Instagram, WhatsApp e leitura de anúncios, sem mencionar especificamente essa permissão.
- Questionário **Data handling** e instruções finais aos revisores, com respostas confirmadas sobre tratamento de dados, pessoas responsáveis e conta de teste. Não inventar práticas ou compromissos de segurança.
- Verificar o estado da identificação **Tech Provider** e do App Review diretamente no painel. O histórico retornado pelo conector não mostra uma submissão anterior, apesar do erro de bloqueio.
- `pages_manage_posts` e `instagram_content_publish` não constam do rascunho atual. A publicação/agendamento do estúdio local depende dessas permissões e deve ter testes reais e pedido próprio antes de ser apresentada aos revisores ou a outros lojistas.
- `ads_management` foi retirado porque a implementação atual só lê métricas e guarda rascunhos locais. Requer implementação e revisão separadas antes de criar, pausar ou cobrar campanhas.

## Gate antes de repetir OAuth e publicar

Confirmar deploy web/API/migrações bem-sucedido e URLs públicas funcionais. Depois de a Meta disponibilizar as permissões pedidas, iniciar uma **nova** autorização no CRM: as autorizações antigas não ganham permissões automaticamente. Verificar os canais no CRM e executar o ensaio ponta a ponta com ativos de teste antes de abrir a função a outros lojistas.
