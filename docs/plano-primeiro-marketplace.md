# Plano do primeiro marketplace — PUVO Produtos

**Data:** 22 de outubro de 2026  
**Base:** PRD PUVO 1.0 e estado atual do monorepo

## 1. Decisão de produto

O primeiro vertical a lançar será **PUVO Produtos**, para artigos novos e usados vendidos por particulares e lojas.

É o melhor ponto de partida para estabelecer os elementos comuns da plataforma: conta única, perfil público de vendedor/loja, categorias, anúncios, imagens, pesquisa, localização, favoritos, mensagens, confiança e moderação. Serviços, empresas, imóveis e automóveis podem continuar visíveis na PUVO pública, mas devem indicar claramente quando ainda não estão disponíveis. Não mostrar anúncios ou métricas inventados como conteúdo real.

### O que significa “completo”

A primeira versão completa inclui descoberta, anúncios, lojas, contacto, moderação e encomendas pagas por **transferência manual direta ao vendedor via MULTICAIXA Express**. Não depende de uma integração de gateway, que ainda não foi contratada/configurada.

O modelo inicial assume que cada encomenda pertence a um único vendedor e que o dinheiro vai diretamente para esse vendedor. A PUVO não recebe nem retém os fundos. O vendedor confirma manualmente que recebeu a transferência na própria conta; só então a encomenda avança. Entrega/levantamento é combinado com o vendedor e o estado fica registado na PUVO.

Uma integração automática do MULTICAIXA Express pode vir depois. A Rede MULTICAIXA descreve pagamentos online de comerciantes pelo GPO através de número de telemóvel ou QR e adesão iniciada no banco de apoio, com certificação para integração por API ou iFrame. Isto é uma opção futura, sujeita a adesão, contrato e requisitos do banco; não é o mesmo que uma transferência manual. Não marcar um pagamento como confirmado com base num clique do comprador ou apenas num comprovativo.

## 2. Público e promessa inicial

- **Comprador:** encontra artigos reais por categoria, preço, condição e localização; consulta a loja e contacta o vendedor.
- **Vendedor particular:** cria um perfil público limitado, publica e gere anúncios.
- **Loja/empresa:** mantém uma página pública de loja, catálogo e equipa com permissões.
- **Operações:** revê anúncios, responde a denúncias, suspende conteúdo e consulta o histórico das decisões.
- **Visitante sem conta:** pode abrir páginas públicas, pesquisar, filtrar, partilhar e consultar lojas. Só precisa de conta para ações pessoais ou privadas.

O perfil de vendedor público não deve expor endereço residencial, telefone ou dados da conta por defeito. O vendedor escolhe os contactos que publica e a localização apresentada deve ser aproximada.

## 3. Sitemap do primeiro vertical

### Público, indexável e disponível sem sessão

- `/` — página pública do PUVO: pesquisa global, entrada para os marketplaces, produtos reais em destaque e lojas.
- `/produtos` — catálogo com pesquisa, filtros, ordenação e paginação.
- `/produtos/[slug]` — detalhe do anúncio, imagens, preço em Kz, condição, localização, vendedor e ações disponíveis.
- `/categorias/[slug]` — catálogo da categoria.
- `/lojas/[slug]` — perfil público da loja e respetivos anúncios.
- `/vendedores/[slug]` — perfil público limitado de vendedor particular, quando este o ativar.
- `/pesquisa?q=...` — resultados partilháveis e indexáveis quando aplicável.
- `/marketplaces` — áreas disponíveis e áreas futuras claramente identificadas.

### Ações autenticadas

- `/entrar`, `/registar`, `/recuperar-acesso`.
- `/conta/favoritos`, `/conta/mensagens`, `/conta/definicoes`.
- `/vendedor/anuncios`, `/vendedor/anuncios/novo`, `/vendedor/loja`, `/vendedor/mensagens`.
- Back-office da equipa: `https://gestao.puvo.vitaleevo.ao/` (fora do domínio público do marketplace).

As páginas privadas devem validar sessão, propriedade do recurso e papel do utilizador no servidor, não apenas esconder botões na interface.

## 4. Fluxos principais

### A. Descobrir e contactar

1. Visitante abre a PUVO ou uma ligação partilhada.
2. Pesquisa por palavras e ajusta categoria, preço, condição e localização.
3. Abre o anúncio e consulta vendedor, estado e opções de contacto.
4. Para guardar ou enviar mensagem, entra ou cria conta.
5. A conversa fica ligada ao anúncio; cada participante só vê as conversas de que faz parte.
6. O utilizador pode denunciar o anúncio ou bloquear a conversa/utilizador.

### B. Vender

1. Utilizador cria conta e perfil de vendedor; pode adicionar uma loja ou organização.
2. Cria rascunho com título, descrição, categoria, preço, condição, disponibilidade e localização.
3. Carrega fotografias através de um fluxo que comprime e valida os ficheiros.
4. Submete o anúncio para revisão.
5. Operações aprova, pede alterações ou rejeita com motivo.
6. Só anúncios aprovados e publicados aparecem na pesquisa pública.
7. Vendedor edita, pausa, marca como vendido ou arquiva; alterações relevantes podem voltar à revisão.

### C. Moderação

1. Um utilizador autenticado denuncia um anúncio, vendedor ou conversa com motivo estruturado.
2. A equipa consulta o contexto permitido, aplica uma decisão e regista autor, motivo e data.
3. Suspensões e remoções deixam de aparecer na página, no catálogo e no índice de pesquisa.
4. O vendedor recebe o estado e pode corrigir ou contestar segundo uma política definida.

### D. Encomenda e transferência manual

1. O comprador cria uma encomenda de um só vendedor e vê o valor, prazo de pagamento, política de cancelamento e instrução para transferir via MULTICAIXA Express.
2. O destino do vendedor (número de telemóvel associado ao MCX Express e nome do destinatário) é privado e só aparece ao comprador desta encomenda. Nunca pedir PIN, código de autorização, dados do cartão ou palavra-passe.
3. O comprador transfere na aplicação MCX Express e regista a referência/data; pode anexar comprovativo apenas se a operação de suporte realmente precisar dele. A interface explica que o comprovativo não confirma o recebimento.
4. O vendedor verifica a entrada na sua própria conta e confirma ou rejeita a transferência. A encomenda só passa a `pagamento_confirmado_pelo_vendedor` após essa ação auditada.
5. O vendedor prepara e combina entrega ou levantamento. O comprador marca receção ou abre um pedido de assistência; cancelamentos e reembolsos manuais têm estados e histórico.

Estados de pagamento mínimos: `aguardando_transferencia`, `comprador_reportou_transferencia`, `confirmado_pelo_vendedor`, `rejeitado`, `expirado`, `reembolso_solicitado`, `reembolsado_confirmado`. O botão “já transferi” nunca confirma pagamento.

Uma futura integração GPO poderá substituir a confirmação manual por confirmação do prestador, com notificações/webhooks autenticados, idempotência e reconciliação.

## 5. Âmbito por entrega

### Entrega 1 — Base persistente

- Migrador de base de dados e schema versionado; PostgreSQL é a fonte de verdade.
- Conta única, sessões, perfis de vendedor, lojas e permissões de equipa.
- Marketplaces e categorias configuráveis; PUVO Produtos é o primeiro vertical ativo.
- Taxonomia e localidades configuráveis, sem fixar a aplicação a uma lista imutável.
- Política inicial de categorias permitidas, conteúdo proibido, imagens, denúncias e decisões de moderação.
- Dados demonstrativos apenas em desenvolvimento; produção só mostra conteúdo real aprovado.

### Entrega 2 — Catálogo público real

- Substituir arrays ilustrativos da homepage e ligações de âncora por páginas e dados reais.
- Catálogo, detalhe, categoria, pesquisa por texto, localização, condição, faixa de preço, ordenação e paginação.
- Perfil público de loja e perfil público opcional de vendedor.
- Renderização no servidor, metadados, URLs canónicas, partilha e sitemap para anúncios publicados.
- Estados de carregamento, sem resultados, erro, indisponibilidade e catálogo vazio.

### Entrega 3 — Publicação e operações

- Rascunho, edição, revisão, publicação, pausa, vendido, expirado e remoção.
- Upload privado até validação, limites de tamanho e número, verificação do tipo real, nomes aleatórios e imagens derivadas.
- Fila de revisão, motivos padronizados, denúncias, suspensão e registo de auditoria.
- Controlo de propriedade: vendedor só altera os seus anúncios; membros de loja dependem das permissões atribuídas.

### Entrega 4 — Relação comprador/vendedor e confiança

- Favoritos, mensagens ligadas ao anúncio, notificações e bloqueio/denúncia.
- Proteção contra spam, abuso de criação de contas e envio excessivo de mensagens.
- Avaliações só quando houver uma interação elegível e verificável; não exibir estrelas de demonstração.
- Indicadores de verificação com significado explícito, sem prometer garantia financeira ou entrega.

### Entrega 5 — Encomendas com transferência MULTICAIXA Express

- Checkout simples, inicialmente uma encomenda por vendedor; carrinho com vários vendedores gera encomendas separadas ou fica fora do lançamento.
- Destino de transferência mantido privado, instruções e referência da encomenda; confirmação manual pelo vendedor após verificar a conta.
- Painel de vendedor para confirmar/rejeitar pagamento, atualizar preparação/entrega e tratar cancelamentos ou reembolsos manuais.
- Estados do comprador inequívocos: aguarda transferência, transferência reportada, confirmada pelo vendedor, em preparação, pronta/enviada, concluída, cancelada ou em assistência.
- PUVO não retém dinheiro, não garante transferência e não desconta comissão automaticamente. Receita inicial deve usar um mecanismo separado e acordado, como subscrição/anúncio, ou ficar desligada.
- Políticas, prazo de pagamento, expiração/libertação de stock e responsabilidades de entrega definidos antes do lançamento.

### Entrega 6 — Integração automática (opcional, depois)

- Avaliar adesão ao Gateway de Pagamentos Online MULTICAIXA através do banco de apoio do comerciante; o serviço oficial documenta pagamento por número de telemóvel ou QR e integração por API/iFrame, sujeita a requisitos e certificação.
- Só ativar confirmação automática depois de homologação, credenciais seguras, validação de notificações e reconciliação com o portal/extrato do comerciante.
- Nenhuma taxa, limite, prazo ou promessa de devolução deve ser fixada sem confirmação atual do banco/EMIS e das condições contratadas.
- Parceiros e zonas de entrega só entram como serviço integrado quando existirem cobertura, preço, acompanhamento e suporte definidos.

## 6. Arquitetura técnica proposta

Manter a stack que já existe e construir um **monólito modular**, sem microserviços nesta fase:

- **Web:** Next.js no App Router para páginas públicas renderizadas no servidor, SEO e experiência responsiva.
- **API:** NestJS com módulos separados por domínio e contrato `/api/v1`.
- **Persistência:** PostgreSQL como fonte de verdade, migrations versionadas, constraints e índices explícitos.
- **Pesquisa:** Meilisearch, já presente no Compose, como índice reconstruível; o anúncio só é pesquisável quando aprovado. Alterações de base geram trabalho idempotente de indexação e falhas de pesquisa não anulam uma publicação já guardada.
- **Cache/limites:** Redis para cache e controlo de frequência onde se justificar; não é fonte de verdade de anúncios ou encomendas.
- **Imagens:** SeaweedFS S3-compatible em desenvolvimento; storage S3-compatible gerido em produção, com uploads assinados, validação e entrega otimizada.
- **Execução:** Compose local com serviços de web, API, Postgres, Redis, Meilisearch e storage; deploy real só depois de segredos, TLS, backups, monitorização e recuperação definidos.

### Módulos da API

`auth`, `accounts`, `seller-profiles`, `stores`, `marketplaces`, `categories`, `listings`, `media`, `search`, `favorites`, `conversations`, `reports`, `moderation`, `notifications`, `audit`. `orders` e `payments` entram na entrega transacional.

Controllers validam DTOs e autorização; serviços contêm as regras; repositórios tratam persistência. Listas têm paginação e limites. Erros seguem formato comum com código, mensagem segura, timestamp e correlation ID.

### Entidades principais

- `users`, `sessions`, `seller_profiles`, `stores`, `store_memberships`.
- `marketplaces`, `categories`, `listings`, `listing_images`.
- `favorites`, `conversations`, `messages`, `reports`, `moderation_actions`, `audit_events`.
- Para o primeiro marketplace: `orders`, `order_items`, `manual_payment_instructions`, `payment_events`, `deliveries`/opções de levantamento e pedidos de cancelamento/assistência.
- Mais tarde, se aderir ao GPO: referência do prestador, notificações de pagamento, eventos idempotentes e reconciliação; não guardar credenciais bancárias do vendedor como texto simples.

Um anúncio pertence a um perfil de vendedor; a loja/organização é entidade própria com membros e papéis. Preços são guardados em representação decimal exata/inteira e formatados como AOA/Kz; nunca usar ponto flutuante binário para dinheiro. Não usar um campo JSON genérico para substituir os atributos de produto enquanto as categorias não tiverem um modelo explícito.

### Contratos públicos prioritários

- `GET /api/v1/products` com termo, categoria, localização, condição, preço, ordenação e cursor/página limitada.
- `GET /api/v1/products/:slug` e `GET /api/v1/stores/:slug`.
- Recursos autenticados para anúncios do vendedor, favoritos e conversas.
- Denúncias e moderação com autorização por papel; nunca expor endpoints administrativos na navegação pública.

## 7. UX, conteúdo e acessibilidade

- Preservar a identidade existente: verde `#137A4B`, amarelo `#F5B82E`, texto `#17251E`, superfícies `#F5F7F5`.
- Visitantes podem ler e pesquisar sem registo; pedir autenticação apenas quando a ação precisa de identidade.
- Página pública prioriza pesquisa e descoberta; um CTA principal por secção.
- Cartão mostra imagem real, título, preço, condição, localização e acesso à loja. Não usar avaliações ou stock fictícios.
- No telemóvel, filtros abrem num painel acessível; em desktop, filtros laterais. Todos os controlos funcionam por teclado, têm foco visível e alvos de toque confortáveis.
- Imagens responsivas, dimensões reservadas, carregamento progressivo, compressão e alternativa textual.
- Validar 320–767 px, 768–1023 px, 1024–1439 px e 1440 px+.
- Formularios curtos com labels, validação no cliente e servidor, mensagens de erro associadas ao campo e resumo de sucesso.
- Estados explícitos: rascunho, revisão pendente, publicado, pausado, vendido, rejeitado, indisponível, vazio, erro e sucesso.

## 8. Critérios de aceitação da primeira versão pública

1. Pessoa sem conta abre a PUVO, catálogo, categoria, anúncio e loja em desktop e telemóvel.
2. Pesquisa, filtros e ordenação produzem resultados persistidos, paginados e partilháveis; nenhum endpoint devolve listagens ilimitadas.
3. Só anúncios aprovados, publicados e disponíveis entram nas páginas públicas e na pesquisa.
4. Vendedor cria e edita rascunho, carrega imagens permitidas e acompanha a decisão da equipa.
5. Utilizador autenticado guarda anúncio e inicia conversa ligada ao anúncio; outro utilizador não consegue ler ou alterar a conversa por adivinhar um ID.
6. Denúncia gera um caso consultável e cada decisão administrativa fica auditada.
7. Dados privados da conta e contactos não escolhidos pelo vendedor nunca aparecem publicamente.
8. As áreas futuras estão identificadas como indisponíveis/em breve e não apresentam conteúdo fabricado.
9. Pesquisa pública aponta para objetivo de p95 inferior a 800 ms; listagens paginadas e queries críticas têm índices. Medir antes de declarar atingido.
10. Encomenda por transferência manual só é confirmada após o vendedor verificar o crédito na conta; comprovativo e botão do comprador não são confirmação. Cancelamento e reembolso têm estado e histórico.
11. Número de destino e nome do beneficiário não aparecem em páginas públicas; nenhum PIN, OTP, cartão ou segredo é recolhido pela PUVO.
12. Os limites operacionais da Transferência Express são verificados com o banco/EMIS e não ficam codificados como valor permanente. Encomendas multi-vendedor não misturam destinos de pagamento.
13. Com GPO, confirmação automática só passa após homologação e reconciliação de estados do prestador.

## 9. Segurança, operação e métricas

- Autorização por recurso, proprietário, organização/membro e função de operação; verificar no backend.
- Sessões seguras, proteção CSRF conforme o modo de sessão, validação de entrada, rate limits e logs sem palavras-passe, tokens ou dados de contacto desnecessários.
- Upload não confiável: limite de bytes e contagem, validar conteúdo real, nome gerado pelo servidor e storage privado até aprovação.
- Moderação com histórico imutável de decisão e caminho de suporte/revisão.
- Backups restauráveis, retenção documentada, health checks, logs estruturados e alertas de falhas de API, pesquisa, storage e tarefas assíncronas.
- Rever privacidade, termos, bens proibidos, pagamentos e retenção com responsáveis qualificados antes do lançamento; este plano não substitui análise jurídica local.
- Métricas: vendedores aprovados/ativos, anúncios aprovados, pesquisas sem resultado, visitas→contactos, tempo de resposta, denúncias, tempo de moderação, anúncios vendidos declarados e, depois, conversão/reembolsos.

## 10. Riscos e decisões pendentes

- **Liquidez:** marketplace sem oferta real parece vazio. Recrutar e apoiar um grupo piloto de lojas/vendedores antes de abrir divulgação ampla; deixar localidades configuráveis.
- **Autenticação/verificação:** escolher canal e prestador de verificação de contacto sem assumir um serviço ainda não contratado.
- **Transferência manual:** é o método inicial informado pelo utilizador; funciona como pagamento direto vendedor-a-comprador e exige confirmação humana. Não oferece confirmação automática nem dedução de comissão.
- **GPO/entregas:** integração automática fica para depois; adesão ao GPO começa no banco de apoio e envolve requisitos/certificação. Entrega permanece combinada entre vendedor e comprador até haver parceiro e cobertura definidos.
- **Limites MCX:** a Rede MULTICAIXA publica limites para Transferências Express, que podem ser revistos e dependem das condições aplicáveis. Confirmar limites atuais no banco antes de fixar valor máximo de encomenda; não os embutir permanentemente no código.
- **Abuso e conteúdo:** definir categorias permitidas, recurso de moderação, limites e procedimento de suporte antes de aceitar anúncios públicos.
- **Pesquisa inconsistente:** PostgreSQL mantém a verdade; indexação tem de ser repetível, monitorizada e recuperável.
- **Privacidade:** separar perfil público de conta privada e permitir contacto sem publicar automaticamente o número pessoal.
- **Escopo excessivo:** não criar 24 experiências nem separar em microserviços antes de provar uso e limites reais.

## 11. Ordem recomendada de implementação

1. Schema, migrations, categorias/localidades configuráveis e autorização base.
2. API e páginas públicas ligadas a dados persistidos; remover mocks de produção e tratar estados vazios/erro.
3. Conta, loja/perfil de vendedor, anúncios e upload.
4. Painel de revisão e denúncias antes de abrir publicação pública.
5. Pesquisa/índice, favoritos e mensagens, incluindo limites e isolamento de dados.
6. Implementar checkout por vendedor e fluxo de transferência manual, com confirmação explícita pelo vendedor e estado de assistência.
7. Piloto com vendedores reais, validar tempos de confirmação/entrega, suporte e política de cancelamento.
8. Só depois, avaliar adesão GPO e integrações logísticas; preservar o modo manual como alternativa caso o prestador esteja indisponível.

Durante o desenvolvimento, editar em `http://localhost:3100`, mantendo o Next.js Fast Refresh e os volumes do Docker. Não reconstruir a stack por cada alteração de código; build fica para mudanças de dependências/Dockerfiles ou preparação de uma versão de produção.

## 12. Estado observado ao preparar este plano

- O monorepo já contém Next.js, NestJS, PostgreSQL, Redis, Meilisearch, SeaweedFS e Docker Compose.
- A homepage é composta por conteúdo estático de demonstração e links de âncora.
- A API contém health check e um array em memória para os marketplaces.
- Ainda não existem migrations, persistência de utilizadores/anúncios, autenticação, pesquisa funcional, mensagens, moderação ou transações.
- Portanto, esta é a fase de arquitetura e planeamento do primeiro vertical; não é evidência de um marketplace funcional ou pronto para produção.

## Referências oficiais de pagamento consultadas

- [MULTICAIXA Express — operações e Transferências Express](https://multicaixa.ao/pt/oferta/canais/utilizadores/multicaixa-express/). Consultado em 22 de outubro de 2026. A transferência express usa o número de telemóvel do destinatário; os limites publicados devem ser confirmados no banco/EMIS antes de definir regras permanentes.
- [Gateway de Pagamentos Online MULTICAIXA — GPO](https://multicaixa.ao/pt/oferta/canais/comerciantes/gateway-de-pagamentos-online/). Consultado em 22 de outubro de 2026. A página oficial descreve adesão através do banco de apoio, opções por número de telemóvel/QR e integração API/iFrame sujeita a requisitos e certificação.
