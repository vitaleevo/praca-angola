# Integração local e publicação PUVO — 26/10/2026

- Branch `codex/integrate-local-online`, PR #12: reúne o CRM Meta, a administração separada, a navegação operacional, a identidade PUVO e os mercados locais de Empresas, Imóveis e Automóveis. A branch está publicada no GitHub; integrar em `main` após os últimos gates. PR #11 ficou incluída no conteúdo desta integração.
- API Railway `e02df63a-c241-4713-a8dd-aae9a11054f6` **SUCCESS**; web Vercel `dpl_Cf8QuajJrcukVMvaZeqStx1VyX76` **READY** em `puvo.vitaleevo.ao`; admin Vercel `dpl_AfhCxg3Xu3gKWgWb6c3rNSC5W4Cs` **READY** em `gestao.puvo.vitaleevo.ao`. Migração 024 aplicada: os três novos mercados estão ativos, cada um com seis categorias. Smoke público: raiz, marketplaces, os três mercados, conta e CRM responderam 200. A CI da PR passou em quality, migrations e E2E.
- Validação local antes da publicação: 76 testes de API, typecheck, lint e build de API, web e admin; migrações 001–024 numa base PostgreSQL isolada; filtros e páginas de detalhe dos novos mercados; navegação desktop e móvel no Playwright. Fixtures locais não foram para produção.
- A PR #12 tem um check vermelho no projeto Vercel `api`, que está inativo (`live: false`) e procura uma entrada de aplicação Node na raiz. A API real é servida pelo Railway e foi publicada com sucesso. Resolver/desligar esse check antes de exigir gates verdes em GitHub. Os pontos Meta e operacionais ainda pendentes encontram-se abaixo; a publicação dos mercados não os conclui.

---

# Integração Meta PUVO — 26/10/2026

## Última etapa: comentários Facebook/Instagram em produção

- A branch `codex/account-sidebars` contém o CRM Meta atual; `main` continua atrás e não deve ser usado para republicar a API. API Railway `2d722960-f254-4cc9-83b0-bae37102c8bc` **SUCCESS** e web Vercel `dpl_FqdrmhW38w1S5XH4n3P3VMeiyq8s` **READY**, no domínio `puvo.vitaleevo.ao`.
- Quatro canais ligados à loja de Alexandre: Facebook Vitaleevo e Bajaj Angola, Instagram @vitaleevo e @bajajangola. Login for Business `1376617274547161` foi atualizado para dez permissões; após reautorização, **Verificar acesso** confirmou os âmbitos de comentários.
- `/vendedor/crm/redes-sociais` lê perfil, publicações e comentários paginados e responde a comentários da Página. A resposta real Instagram ao comentário “muito bom” e a resposta real Facebook ao comentário “goog” foram aceites pela Meta e confirmadas no CRM. A paginação de publicações Facebook foi corrigida e validada em produção. Foram aprovados 67 testes da API, typecheck, lint e builds locais.
- Continuam pendentes: importação retroativa de mensagens, moderação/publicação/agendamento/insights, número WhatsApp Cloud ligado à loja e App Review para lojistas externos. Tech Provider permanece em análise. O campo Terms of Service URL ainda está vazio e `/termos` devolve 404. A chave TypeSafe Jev devolveu HTTP 401; não reutilizar até substituição.
- Detalhes e sequência histórica em `docs/PUVO_CRM_META_STATUS.md`. Os parágrafos abaixo descrevem etapas anteriores e não substituem este estado.

### Histórico anterior à entrega de comentários

- Causa inicial confirmada no painel Meta: a configuração OAuth antiga `1120855583871113` pede apenas permissões WhatsApp. A nova configuração social foi aplicada e a loja já tem os canais Vitaleevo associados.
- Criada a configuração **PUVO Redes Sociais** `1376617274547161` com token de utilizador e sete permissões para listar Páginas, Messenger, Instagram Direct e leads. A variável `META_BUSINESS_LOGIN_CONFIG_ID` no Railway `@praca/api` foi alterada e o valor confirmado. Não alterar a configuração WhatsApp antiga.
- Adicionadas aos casos de uso da app `instagram_manage_messages`, `instagram_manage_comments` e `pages_manage_engagement`; aparecem como **Ready for testing**, sem acesso avançado para lojistas externos.
- Agência Holyweb: business verification **Verified**; access verification como **Tech Provider** submetida em 10/10/2026 e ainda **In review**. O App Review da PUVO está **Not submitted** e Meta bloqueia a submissão até completar verificação, usos permitidos, tratamento de dados e instruções de teste. O rascunho inclui também permissões sem uso no CRM e precisa de revisão.
- O titular concluiu nova autenticação Facebook e autorizou apenas a Página **Vitaleevo** e o Instagram profissional **@vitaleevo**. O CRM mostra dois canais autorizados. **Verificar acesso** confirmou tokens válidos para a app PUVO e permissões de mensagens presentes em ambos. Para comentários faltam `pages_read_user_content` e `pages_manage_engagement` no Facebook, e `instagram_manage_comments` no Instagram. Nunca pedir ou partilhar senha/tokens.
- Railway: os primeiros builds falharam no BuildKit. Um redeploy da fonte GitHub `main` (`d786f4f0-db42-47d6-a182-a5646c88461c`) terminou com sucesso, mas publicou código antigo sem rotas CRM, causando 404. A publicação do checkout local (`cc523bcc-a821-44c4-8b96-97b775e8553d`) terminou com **SUCCESS** em 26/10/2026, restaurou as rotas CRM e aplicou `META_BUSINESS_LOGIN_CONFIG_ID`. `GET /api/v1/health/ready` responde 200; `/api/v1/crm/workspace` e `/api/v1/crm/meta/connect` respondem 401 sem sessão, confirmando que existem e exigem autenticação. A branch `codex/account-sidebars` foi atualizada no GitHub até `01d7f80`; `main` continua atrás e não deve ser usado como fonte de redeploy da API até integrar estas alterações.
- O CRM ainda não importa histórico nem gere comentários. Não apresentar essas funções como prontas à Meta. O campo Terms of Service URL está vazio no painel Meta e `/termos` devolve 404.

Estado do projeto: API CRM e configuração OAuth social publicadas em produção; Vitaleevo/@vitaleevo e Bajaj Angola/@bajajangola associados à loja (quatro canais). Entrada e resposta Instagram confirmadas; entrada Messenger na Página Bajaj Angola, webhook HTTP 200, resposta enviada pelo CRM e receção na conta remetente também confirmadas. Ainda faltam WhatsApp Cloud API, permissões e implementação de comentários, acesso avançado e App Review. A ligação foi concluída numa sessão Playwright visível, com credenciais introduzidas pelo titular. A seleção de Páginas inicia vazia para evitar ligações acidentais. Detalhes em `docs/PUVO_CRM_META_STATUS.md`.

AVISO: O teste Messenger de Bajaj Angola foi concluído nos dois sentidos após a ligação da Página; o teste Vitaleevo ainda não recebeu uma mensagem de origem verificável. Comentários novos chegaram ao Meta Business Suite, mas ainda não há gestão de comentários no CRM nem permissões no token. O WhatsApp ainda não está ligado à loja. O próximo passo é ligar WhatsApp Cloud API real, implementar comentários e concluir o App Review quando a Meta permitir. Antes de iniciar, leia `MEMORIA.md` e `docs/PUVO_CRM_META_STATUS.md` para continuar exatamente de onde o projeto parou, entender o que já foi feito e integrar a solução com o sistema atual sem reler todo o repositório.

---

# Integração Meta PUVO — 25/10/2026

App Meta própria PUVO (`2161321067754105`) criada na Agência Holyweb e em modo Live. A revisão `6538580` foi enviada para `codex/puvo-release-2026-10-25`; a API Railway `e053900e-2ed6-4b20-b480-7ada40112f66` aplicou a migração 023 e o site publicou o gestor no Vercel `dpl_FuFSFhzSGJFkXG6jN9CkiG22aQVu`. O CRM agora liga Página Facebook e Instagram profissional por OAuth, cifra os tokens no servidor, ingere Messenger/Instagram Direct/WhatsApp de forma idempotente e envia respostas de texto pelo mesmo inbox. `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_APP_ID` e `META_OAUTH_REDIRECT_URI` estão em `@praca/api`; a app Meta está subscrita nos objetos `page`, `instagram` e `whatsapp_business_account` para o callback PUVO. Verificação produção: inbox HTTP 200, readiness HTTP 200, POST HMAC válido HTTP 200 e assinatura inválida HTTP 403. Falta operacional: adicionar `https://puvo.vitaleevo.ao/api/v1/crm/webhooks/meta/callback` nas URLs OAuth válidas Meta e ligar as contas reais no CRM. Para WhatsApp, o formulário seguro pede `phone_number_id` e token de System User. Não mexer na app “Agentes” ligada ao CRM existente. Ver `docs/meta-webhook-puvo.md`.

---

# Publicação concluída — 25/10/2026

Revisão de aplicação `ddb1d84` publicada em produção: [site](https://puvo.vitaleevo.ao), [gestão](https://gestao.puvo.vitaleevo.ao), API Railway e worker de IA privado. Domínios e DNS respondem; site, gestão, API readiness e `ai/status` passaram smoke HTTP. Migrações 020–021 aplicadas, com backup prévio `ba337715-0f37-4bed-8afa-5d07b384ece6`. Testes locais: API 55/55, worker 7/7, builds/typecheck/lint; E2E 21/22 na suite e o último isoladamente. O webhook Meta requer credenciais ainda ausentes, e o fluxo de pagamento real não foi executado em produção. Estado detalhado e IDs em `docs/release-audit-2026-10-25.md`. Os parágrafos históricos abaixo descrevem etapas anteriores e não o estado atual.

---

# Auditoria de publicação — 25/10/2026 (histórico anterior ao deploy)

A revisão local passou typecheck, lint, 55 testes API, 7 testes Python e build Web/Admin/API. A primeira suite E2E passou 20/20 antes dos últimos ajustes; a segunda teve 17/20, e os três casos afetados passaram isoladamente após corrigir o checkout e reiniciar o Docker. As migrações 001–020 passaram numa base descartável. As falhas de autorização/PIN na logística, o acesso ao chat público, o destino de IA personalizado e o webhook Meta foram endurecidos localmente. **Produção continua na versão anterior:** o checkout com estafeta mostra um total com frete que a API não grava, o Railway ainda não tem `ai-worker`, e faltam uma suite E2E integral verde na revisão final, configuração remota e Git/CI estáveis. Ver `docs/release-audit-2026-10-25.md` para evidência e sequência de release. Jev devolveu HTTP 401; substituir a chave antes de novo uso.

---

# Consola independente; dashboard do proprietário renovado (25/10/2026)

Objetivo: evoluir a aplicação separada da equipa PUVO sem alterar a API, a base de dados ou o domínio público do marketplace.

## Última etapa concluída: renovação visual da consola

Foi feito:

- Corrigido o transbordo de descrições sem espaços na fila de anúncios; o conteúdo completo fica acessível em “Ver descrição completa” e quebra linhas ao expandir.
- Reorganizados os anúncios em cartões responsivos com imagem/estado vazio, preço e localização em destaque, ações agrupadas e hierarquia visual mais clara. As denúncias também quebram texto longo sem alargar a página.
- Ajustado o cabeçalho para mostrar o papel administrativo em português (“Proprietário da plataforma”, “Administrador” ou “Moderador”) em vez de expor os nomes técnicos dos papéis.
- Reforçada a especificidade dos estilos para prevalecer sobre as regras herdadas da UI do marketplace.
- Renovado o dashboard inicial do proprietário: hero de operação, ação rápida, indicadores agrupados por atividade e revisão, valores prioritários destacados e cartões que abrem diretamente cada fila.
- Atualizado o shell partilhado da consola com fundo, sidebar, navegação, cartões, títulos, focos visíveis e breakpoints mais consistentes.
- Nesta etapa, cada anúncio ganhou cartão e hierarquia de leitura próprios; descrição longa fica recolhida, quebra mesmo quando não contém espaços, e os controlos reorganizam-se em ecrãs pequenos.
- A fila agora mostra skeletons durante a carga, diferencia dados indisponíveis de listas vazias, permite atualizar, bloqueia ações repetidas enquanto uma decisão é guardada e confirma o resultado de cada ação.
- Reforçados contraste dos textos auxiliares, foco de teclado e quebra de texto em metadados flexíveis.
- Por instrução do proprietário, a separação foi concluída localmente: as páginas `/admin/**`, a navegação e os componentes administrativos antigos foram removidos de `apps/web`; `apps/admin` só serve hosts de produção `gestao.puvo.vitaleevo.ao` e as URLs de retorno de login usam `/moderacao`.
- Rotas operacionais e documentação foram atualizadas para o domínio de gestão. A API continua partilhada e valida os papéis; os endpoints `/api/v1/admin/**` não são páginas do marketplace.
- Publicado Preview `dpl_HX5NDKb26a6VvDFwEAxF6aGUD7uC`, `READY`, em `https://praca-angola-admin-ki12q4373-vitaleevos-projects.vercel.app`; alias `gestao.puvo.vitaleevo.ao` aponta para esse deployment. Domínio e aplicação pública do marketplace não foram alterados.

Arquivos principais: `apps/admin/src/components/platform-overview.tsx`, `apps/admin/src/components/admin-workspace.tsx`, `apps/admin/src/components/moderation-dashboard.tsx`, `apps/admin/src/app/owner-console.css`, `apps/admin/src/app/moderation-console.css`, `apps/admin/src/app/layout.tsx`.

Verificação executada:

- `pnpm --filter @puvo/admin typecheck` — passou.
- `pnpm --filter @puvo/admin lint` — passou.
- `pnpm --filter @puvo/admin build` — passou localmente e no build Vercel do Preview.
- Após o polimento local desta etapa, `pnpm --filter @puvo/admin typecheck`, `pnpm --filter @puvo/admin lint` e `pnpm --filter @puvo/admin build` passaram novamente. Estas alterações ainda não foram publicadas.
- Após o corte, `pnpm --filter @puvo/web typecheck`, `pnpm --filter @puvo/web lint` e `pnpm --filter @puvo/web build` passaram; o manifesto final não contém nenhuma rota `/admin`. `apps/admin` também passou typecheck, lint e build após a restrição de host. Nenhum teste E2E foi executado nesta etapa.
- O primeiro typecheck Web encontrou referências obsoletas em `.next/dev/types`; removi apenas os tipos de rotas gerados pelo Next e a verificação passou. Não alterar manualmente os tipos gerados.
- `git diff --check` — passou; Git indicou apenas normalização LF/CRLF em ficheiros já modificados.
- `vercel inspect` — deployment `dpl_HX5NDKb26a6VvDFwEAxF6aGUD7uC` classificado como `preview`, estado `READY`.
- `GET https://gestao.puvo.vitaleevo.ao/` e o CSS publicado — HTTP 200; CSS contém o hero, cartões de indicadores e breakpoint móvel a 480 px.
- `GET https://gestao.puvo.vitaleevo.ao/moderacao` e o CSS publicado — HTTP 200; CSS inclui quebra de texto e breakpoint móvel a 420 px.
- A conferência visual autenticada das alterações desta etapa ainda está pendente. O histórico registou que `cua.getState()` devolveu “Local browser use is disabled in Work settings”; não contornar essa definição.

Estado atual:

- Os dois apps compilam; o manifesto Web não inclui páginas administrativas. O Preview anterior continua publicado; o polimento e o corte de host/páginas desta etapa estão apenas no checkout local.
- A conta `gestao@vitaleevo.ao` tem `platform_owner`, verificação de email e bootstrap auditado. O utilizador precisa definir a senha pelo fluxo de recuperação para smoke autenticado.
- `apps/web` já não contém páginas nem links de administração; o app `apps/admin` é a única interface staff. As alterações ainda não foram publicadas. Nenhuma ação de moderação foi executada.

## Estado do projeto

- Fase/trilha atual: corte local da interface administrativa antiga e restrição da consola ao domínio `gestao.puvo.vitaleevo.ao`.
- Sólido agora: build, TypeScript e lint da consola passam; domínio de gestão entrega a versão Preview nova por HTTPS.
- Falta imediato: publicar `apps/web` e `apps/admin`, confirmar 404 nas rotas antigas no domínio público, bloqueio de outros hosts e acesso staff no domínio de gestão; concluir smoke autenticado e isolamento da sessão.
- Distância do fim: a separação está implementada no checkout mas ainda não está ativa nos domínios públicos; deploy e validação operacional continuam pendentes.

## Próximo passo recomendado

Publicar as alterações de `apps/web` e `apps/admin`; confirmar que o domínio público devolve 404 para `/admin/**` e que só `gestao.puvo.vitaleevo.ao` serve a consola. Depois, com a sessão staff, validar overview, moderação, profissionais, denúncias, publicidade e negação para conta comum.

AVISO: O próximo passo é confirmar visualmente o dashboard e concluir o smoke autenticado da consola da equipa. Antes de iniciar, leia `MEMORIA.md` e `docs/platform-operations-console-plan.md` para continuar exatamente de onde o projeto parou, entender o que já foi feito e integrar a solução com o sistema atual sem reler todo o repositório.
---

# Ultima etapa concluida — sidebar reutilizavel publicada (24/10/2026)

Objetivo: substituir a navegação atual das contas por uma sidebar consistente e preparar o sistema para reaproveitar os componentes.

Foi feito:

- Criados `WorkspacePage` e `WorkspaceNavigation` em `apps/web/src/components`, configuráveis por área (`account`, `seller`, `services`, `admin`), com links partilhados, estado ativo, foco visível e menu móvel acessível.
- Migradas as páginas de conta, vendedor, profissional/serviços e administração para o layout partilhado. Ações e links redundantes saíram dos cabeçalhos dos workspaces; as verificações de sessão/permissão permanecem nas páginas/API.
- CSS responsivo em `apps/web/src/app/workspace.css`; guia para acrescentar páginas em `docs/account-workspace-navigation.md`.
- PR #8 integrado em `main`, commit `119bdb177c0446e3b1aefa683d63d898adad232c`. Uma falha E2E por link duplicado do cabeçalho foi corrigida e a CI do PR passou: typecheck, lint, build, testes API, migrações e suite E2E completa. Preview Vercel Web e API em estado Ready.
- Produção verificada em `https://puvo.vitaleevo.ao/conta` e `/admin/moderacao`: HTTP 200 com a sidebar e o controlo de navegação móvel no HTML. Inspeção local também confirmou responsividade a 320, 768 e 1024 px sem overflow.

Arquivos principais: `apps/web/src/components/workspace-navigation.tsx`, `apps/web/src/components/workspace-page.tsx`, `apps/web/src/components/site-header.tsx`, `apps/web/src/app/workspace.css`, páginas de `conta`, `vendedor`, `profissional`, `servicos` e `admin`, `tests/e2e/platform-owner.spec.mjs` e `docs/account-workspace-navigation.md`.

Verificação executada: `pnpm --filter @puvo/web typecheck`; `pnpm --filter @puvo/web lint`; `pnpm --filter @puvo/web build`; `git diff --check`; CI do PR #8; inspeção das rotas públicas de produção.

Resultado: todos os checks do PR passaram e a nova navegação está publicada em produção. A CI adicional disparada após o merge também passou (quality, E2E e migrations).

## Estado do projeto

- Fase/trilha atual: shell partilhado das áreas autenticadas implementado e publicado.
- Sólido agora: comprador, vendedor, profissional/serviços e administração usam a mesma base visual e componentes reaproveitáveis; páginas de produção respondem 200.
- Falta imediato: executar smoke autenticado dos métodos de pagamento em produção e reproduzir o 502 com o ficheiro de imagem original. Falta também revisão jurídica local final da página de privacidade.
- Distância do fim: esta etapa da sidebar está concluída; o produto PUVO ainda tem trabalho operacional de lançamento e validação.

## Próximo passo recomendado

Executar o smoke autenticado dos métodos de pagamento em produção e reproduzir o erro 502 quando estiver disponível a imagem original, correlacionando o pedido com os logs. Fechar a revisão jurídica local da política de privacidade.

AVISO: O proximo passo e executar o smoke autenticado dos métodos de pagamento em produção e reproduzir o erro 502 com a imagem original. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

---

# Última etapa concluída — métodos de pagamento manuais por vendedor publicados (24/10/2026)

Objetivo: permitir que cada loja ative os recebimentos que consegue aceitar, entre Multicaixa Express e transferência bancária, e que o comprador escolha o método disponível no checkout.

Foi feito:

- Migração `012_seller_payment_methods.sql`: configuração cifrada por loja, migração dos dados MCX existentes, método da encomenda e cópia cifrada do destino escolhido. A migração foi aplicada duas vezes no PostgreSQL local sem duplicar alterações.
- Proprietário gere os métodos em `/vendedor`, incluindo ativar, desativar, atualizar parcialmente e apagar os dados. A API devolve identificadores mascarados ao proprietário e dados completos apenas ao comprador da encomenda. Encomendas MCX antigas pendentes bloqueiam alteração/remoção dos seus dados legados.
- Checkout lista só métodos ativos por loja, valida a escolha novamente na compra e mostra os dados corretos na encomenda. O vendedor continua a confirmar manualmente o crédito no extrato. PayPal não está integrado nesta etapa; depende de elegibilidade e fluxo próprio.
- Criadas as páginas `/ajuda` e `/privacidade`, anteriormente ligadas no rodapé mas ausentes, com conteúdo baseado nos fluxos atuais. A página de privacidade identifica o responsável e o contacto indicados pelo utilizador, explica dados obrigatórios/facultativos, destinatários, conservação e direitos segundo a informação da Agência de Protecção de Dados. Esta revisão técnica/editorial não substitui parecer jurídico local.
- O formulário da loja agora valida tipo e tamanho da imagem antes do envio e apresenta uma mensagem própria se o serviço devolver erro 5xx. Isso melhora o erro visível, mas não resolve nem identifica sozinho o 502 original.
- Documentação atualizada em `docs/marketplaces-v2.md` e `docs/store-operations.md`.

Arquivos principais: `apps/api/migrations/012_seller_payment_methods.sql`, `apps/api/src/seller.controller.ts`, `apps/api/src/orders.controller.ts`, `apps/api/src/payments/payment-methods.ts`, `apps/web/src/components/seller-payment-settings-fields.tsx`, `apps/web/src/components/cart-view.tsx`, `apps/web/src/components/order-detail.tsx`, `apps/web/src/app/ajuda/page.tsx`, `apps/web/src/app/privacidade/page.tsx`, `tests/e2e/marketplaces.spec.mjs` e `tests/e2e/seller-profile.spec.mjs`.

Verificação: API e Web typecheck; Web lint; builds de produção API e Web; 24 testes de API; E2E do perfil sem MCX, envio de logótipo e gravação da loja, regressão MCX e novo fluxo bancário com 320 px, isolamento de terceiros, escolha entre dois métodos, confirmação do vendedor e preservação do IBAN original após alteração; `git diff --check`. Todos passaram após corrigir um timeout da navegação do servidor Next em desenvolvimento. Web typecheck e lint repetidos após a validação de imagem. A CI do PR #7 passou em qualidade, migrações executadas duas vezes e E2E completo. A limpeza das fixtures locais terminou com zero contas e zero encomendas E2E. Migração 012 presente uma vez na base local.

Estado do projeto:

- Fase/trilha atual: métodos manuais por loja integrados em `main` pelo PR #7, commit `c83bfdbe939306658a16c6e3d2791423af785cd4`. Vercel Web `dpl_4KTEYgAscJgSeNC6MqQMcYByHkXa` e Railway API `48248527-bb68-498a-b5b5-7e91561cc9cf` ficaram `READY`/`SUCCESS`.
- Sólido agora: MCX legado, conta bancária cifrada, escolha por loja, autorização por encomenda e confirmação manual. A API aplicou `012_seller_payment_methods.sql` no arranque. `GET /api/v1/health/ready` pelo domínio PUVO respondeu 200 com `db:ok`, `media:ok` e outbox sem atraso; `/ajuda` e `/privacidade` responderam 200; `POST /api/v1/orders/payment-options` e `GET /api/v1/seller/profile` responderam 401 sem sessão, como esperado. Sem 5xx da API Railway nos 30 minutos consultados após o deploy.
- Falta imediato: smoke autenticado em produção numa conta de teste controlada, revisão jurídica local da página de privacidade e reprodução do 502 com a imagem original. O utilizador forneceu apenas a captura de ecrã e o URL do projeto Railway, não o ficheiro que falha. Nos logs HTTP Railway consultados para `POST /api/v1/media` havia 201, 400 e 401, sem 502; a Vercel não apresentou 502 no período consultável. A origem exata permanece desconhecida. A integração Railway do Codex continua a pedir autenticação, embora a CLI local esteja autenticada.
- Distância do fim: esta fatia está publicada e o smoke público passou; o produto completo continua com outras etapas de operação e observabilidade.

## Próximo passo recomendado

Confirmar os métodos de uma loja real e verificar uma compra de teste sem transferência de dinheiro, com uma conta de teste controlada. Reproduzir o erro de upload com o ficheiro original e correlacionar o pedido com os logs.

AVISO: O proximo passo e executar o smoke autenticado dos métodos de pagamento em produção e reproduzir o 502 com a imagem original. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

---

# Atualização de produção — bootstrap do proprietário global (24/10/2026)

A consulta read-only na Railway não encontrou a conta indicada: account_count=0, active_count=0, eligible_count=0. O bootstrap não foi executado e nenhum papel foi concedido. O formulário público em https://puvo.vitaleevo.ao/registar foi aberto e está pronto para o utilizador preencher. Por segurança, o utilizador deve inserir e submeter as próprias credenciais e confirmar o email; depois, repetir a verificação e executar o bootstrap único, validando o papel e o evento de auditoria. Nenhuma senha ou código foi solicitado ou consultado.

---

# Estado mais recente — proprietário global da PUVO (24/10/2026)

Objetivo: estabelecer o primeiro acesso global seguro ao sistema e publicar o painel do proprietário.

## Foi feito

- Papel único `platform_owner`, protegido por constraint e índice parcial no PostgreSQL.
- Comando operacional de bootstrap, fora da API pública, que exige conta ativa com email confirmado, confirmação explícita, lock transacional e evento de auditoria.
- `RolesGuard` permite ao proprietário usar rotas existentes de moderação e anúncios; não transforma esse papel em acesso de comprador nem contorna autorização por loja.
- Painel `/admin` com indicadores agregados sem dados pessoais, links para moderação de produtos, profissionais, denúncias de serviços e publicidade, estados de carregamento/erro e layout responsivo.
- Documentação operacional em `docs/platform-owner-operations.md`.
- PR #6 integrado em `main`, commit `8bf3159e3f0a098788dff9a0f856b047593be0cf`.

## Verificação

- `pnpm --filter @puvo/api typecheck` e `pnpm --filter @puvo/web typecheck`: passaram.
- `pnpm lint`: passou.
- `pnpm --filter @puvo/api test`: 24 testes passaram.
- `pnpm test:e2e`: 17 testes passaram; inclui email confirmado, bootstrap de uso único, bloqueio a comprador, acesso às rotas administrativas e responsividade 320 px.
- Migração 011 executada duas vezes na base dev; execução idempotente. Health local: `db:ok`, outbox e media OK. Nenhuma conta E2E ou role owner ficou na base dev.
- CI da GitHub para PR/main: quality, migrations e E2E passaram; build de CI passou. Deploys Vercel e Railway do commit `8bf3159` terminaram com sucesso.
- Produção: `/admin` HTTP 200; `GET /api/v1/health/ready` retorna `status: ok`, `db:ok`, `media:ok`; `GET /api/v1/platform-owner/overview` e o proxy público retornam 401 sem sessão, confirmando que a rota exige autenticação.
- Consulta agregada/read-only após migração: migration `011_platform_owner.sql` presente; `users=0`, `platform_owners=0`. Nenhuma conta ou privilégio foi criado em produção.

## Limites e estado atual

O painel dá visão agregada e abre as operações administrativas que já existem. Ainda não há gestão global de utilizadores, permissões, configurações de plataforma ou transferência do proprietário. A produção está publicada, mas ainda não tem utilizador nem proprietário global. A concessão depende de o utilizador criar e confirmar a conta escolhida.

## Próximo passo recomendado

O utilizador deve registar uma conta com o email escolhido e concluir a confirmação. Com esse endereço confirmado, executar o bootstrap de produção pelo terminal operacional da API e validar `/admin` autenticado e os quatro módulos administrativos. Depois, decidir e implementar gestão global de utilizadores/permissões e transferência auditada do papel.

AVISO: O proximo passo e ativar o proprietario global numa conta confirmada e implementar a gestao global de utilizadores e permissões. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

# Estado mais recente — PUVO público (23/10/2026)

O endereço canónico confirmado pelo utilizador é **https://puvo.vitaleevo.ao**. O DNS de `vitaleevo.ao` está delegado à Vercel; o subdomínio PUVO foi associado ao projeto `praca-angola-web` e responde por HTTPS. `https://praca.vitaleevo.ao` redireciona para o novo domínio com 308. Na API Railway, `WEB_ORIGIN` e `PUBLIC_SITE_URL` foram atualizados para o domínio PUVO; `API_PORT=4000` e `PORT=4000` alinham o servidor ao healthcheck. Na Vercel, `PUBLIC_SITE_URL` de produção também foi atualizado. O gerador de sitemap/robots foi corrigido e implantado em `main` (`47fe1bd`); sitemap, robots, páginas e API confirmados em HTTPS com resposta 200 e URLs canónicas PUVO.

O rebranding e o hardening foram integrados em `main` no commit `8f59e84` via PR #3; CI de qualidade, migrations e E2E passou. Web pública e API Railway responderam 200, incluindo `GET /api/v1/health/ready` com `db:ok`, outbox sem atraso e media disponível. O primeiro deployment novo da API falhou por desalinhamento da porta Railway; foi revertido, corrigido com `PORT=4000` e o deployment do commit novo terminou com sucesso. A alteração de origens criou um deployment subsequente saudável.

PostgreSQL tem snapshots diários e semanais, PITR com backup base concluído; volume de media tem snapshots diários e semanais. Um dump lógico restaurou 36 tabelas numa base isolada, com contagens iguais às de produção (ainda vazia). Monitorização e alertas não estão certificados. A chave SMTP antiga foi rejeitada pelo Resend; criou-se uma chave nova, restrita a envio e ao domínio `vitaleevo.ao`, guardada em `SMTP_PASSWORD` na Railway. `nodemailer.verify()` autenticou com sucesso no container depois do deployment `8b4549bd-b50c-41cd-b468-ae508160f404` (commit de app `47fe1bd`). Falta validar uma entrega real de confirmação/recuperação com destinatário de teste autorizado. O painel Railway apresentou cobrança vencida, que pode causar interrupção; o utilizador deve regularizar a conta. O ficheiro de ensaio `C:\Users\alexa\AppData\Local\Temp\praca-restore-drill-20261023.dump` ficou pendente de limpeza após rejeição automática da remoção. Não guardar segredos nesta memória.

Próximo passo: autorizar/realizar uma entrega SMTP de teste para uma caixa controlada, regularizar a conta Railway, configurar destinatários e testar alertas, povoar anúncios reais e completar smoke de produção dos dois marketplaces antes de abertura ampla.

---
# Estado anterior — notificações e denúncias moderadas de Serviços (22/10/2026)

Pedido: continuar de `MEMORIA.md` e implementar notificações de Serviços, preferências, outbox e denúncias com moderação e testes de privacidade. O utilizador forneceu links de cPanel, GitHub, Vercel, Resend e Railway como contexto; esta etapa trabalhou no ambiente local e não configurou contas/domínio/produção. Não guardar nem reutilizar URL de sessão cPanel em documentação.

## Concluído nesta etapa

- Migração `009_service_notifications_reports.sql` aplicada no PostgreSQL dev. Notificações privadas/idempotentes, preferência de email desligada por defeito, outbox transacional e denúncias de perfil/pedido/mensagem com unicidade de caso aberto, limite cinco por dia, índices e FKs.
- Eventos emitidos na transação de pedido dirigido, proposta, proposta aceite, mensagem, conclusão e recusa dirigida. Avisos genéricos sem descrição de pedido ou corpo de conversa. Worker SMTP assíncrono a cada 30 s com `SKIP LOCKED`, lease de cinco minutos e retentativas até cinco tentativas. Entrega pelo menos uma vez; envio pode repetir após crash entre SMTP e confirmação no banco.
- API de notificações, leitura e preferência por conta; denúncias apenas por quem pode ver o recurso, sem autodenúncia. Fila/decisão só para administrator/moderator, auditoria da criação e decisão, exposição da mensagem denunciada limitada a 1000 caracteres sem histórico completo. Conversa agora verifica estado e autorização sob lock transacional antes de inserir mensagem, evitando envio após fecho concorrente.
- Web: `/servicos/notificacoes` com avisos, preferência e estados das próprias denúncias; formulário de denúncia em perfil, pedido elegível e mensagens recebidas; `/admin/denuncias-servicos` com revisão e decisão. Navegação de Serviços e Moderação ligada. Estilos responsivos e mensagem em 320 px sem overflow no E2E.
- `docs/service-notifications-reports.md` é o handoff técnico. README, plano operacional e docs dos marketplaces atualizados.

## Verificação

- API/Web `typecheck` e ESLint focado passaram.
- `pnpm test:e2e tests/e2e/service-notifications-reports.spec.mjs`: **2 passed** (25,5 s) após ajuste final de concorrência. Cobertura: destinatário e leitura isolados, opt-in/out, outbox e Mailpit sem descrição privada, replay de aceitação sem aviso duplicado, autorização negativa de denúncia, fila moderada, estado próprio, rotas e 320 px. Capturas desktop e mobile em `output/playwright/service-notifications-*.png` e moderação desktop, revistas visualmente. Primeira execução de desenvolvimento falhou quando Next reiniciou automaticamente por limiar de memória e a página ficou sem hidratação; repetição passou, sem reconstruir imagens Docker.
- `pnpm test:e2e --grep 'serviços:'`: **3 passed (1,8 min)** após retirar `db.end()` antigo em `tests/e2e/marketplaces.spec.mjs`, que fechava o pool partilhado antes do teste seguinte. O percurso anterior de perfil→avaliação continua a passar. A primeira tentativa desta regressão falhou apenas pelo pool partilhado e foi corrigida.
- Zero contas `e2e-%@puvo.invalid` no banco após limpeza; migração 009 aparece em `schema_migrations`. Revalidar depois da regressão selecionada, se executada.
- Nenhum build de produção, lançamento externo, ensaio de falha SMTP pública, medição Lighthouse/p95 ou auditoria WCAG integral.

## Estado e próximo passo

Esta fatia de notificações e denúncias está funcional no desenvolvimento local. Os dois marketplaces continuam sem certificação de lançamento público. Próximos trabalhos: quotas de leitura e propostas por conta em Serviços, métricas/retenção e observabilidade da outbox, operações de moderação, sitemap completo, Google Ads com identificadores/consentimento, domínio/TLS/SMTP público, backup/restauro e medições. Consultar primeiro `docs/service-notifications-reports.md` e `docs/plano-marketplaces-operacionais.md`.

Avaliação provisória da nova fatia: UX 91 · UI 90 · Acessibilidade 88 · Desempenho 84 · Consistência 92 · Conversão 90 · Escalabilidade 85 — precisa de refinamento. Motivos: sem auditoria de leitor de ecrã/contraste em todas as rotas, métricas de produção e carga da outbox/filas.

AVISO: O proximo passo e calibrar quotas de leitura e propostas dos Servicos e adicionar metricas, retencao e observabilidade da outbox, mantendo testes de privacidade e hot reload. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

---

# Histórico — plano operacional, anúncios, setas e uploads (22/10/2026)

Pedido: antes de avançar para notificações/denúncias, planear o funcionamento pleno de Produtos e Serviços; retirar a barra horizontal de categorias, usar setas, reservar publicidade própria/Google nos três níveis e verificar uploads. A imagem anexa assinala a faixa de categorias de Serviços.

Plano durável: `docs/plano-marketplaces-operacionais.md` estabelece cinco etapas, contratos e critérios de conclusão. Ainda NÃO se afirma que os dois marketplaces estão prontos para produção.

## Implementação desta etapa

- `CategoryCarousel` partilhado por Produtos e Serviços: barra visual oculta, setas anterior/seguinte com estados desativados, scroll suave, gesto horizontal e navegação por teclado preservada. `MarketIcon` extraído para módulo comum para evitar importação cíclica entre cliente/servidor.
- Migração `008_ad_campaigns.sql` aplicada em dev. Campanhas próprias por mercado/posição premium, secundária e terciária, com anunciante, título, imagem, URL HTTPS, início/fim, prioridade e estado rascunho/aprovado/pausado. API pública só expõe campanha elegível; sem campanha, não aparece bloco vazio. Administração exclusiva do papel administrator em `/admin/publicidade`, com upload, aprovação/pausa e auditoria.
- `MarketAdSlot` rotulado Publicidade e link externo `rel=sponsored noopener noreferrer`; três posições nos catálogos Produtos e Serviços. Google Ads ainda não é carregado: requer conta, `data-ad-client`, IDs `data-ad-slot` e consentimento, conforme documentação oficial incluída no plano. Não inserir scripts arbitrários de anunciantes.
- Upload `POST /media`: Sharp descodifica JPEG/PNG/WebP, rejeita ficheiros internos corrompidos e animações, limita entrada a 5 MB e 20 milhões de píxeis, orienta e redimensiona até 2560 px, remove metadados e guarda WebP. Imagens antigas ficam acessíveis. Dependência `sharp` adicionada ao pacote API.
- API Docker reconstruída UMA VEZ para a dependência nativa. Primeiro build falhou no acesso DNS ao frontend Dockerfile; retirado o marcador sintático não necessário do Dockerfile e rebuild com imagem base/cache locais concluiu. API recriada; Web/NGINX continuaram sem rebuild. Edições regulares continuam no watcher/Fast Refresh.
- E2E: novo `ads-and-uploads.spec.mjs` verifica upload válido/corrompido, isolamento admin, campanha em rascunho/aprovada/pausada, três posições e setas. Fixture PNG antiga passou a ser rejeitada porque o IDAT era corrompido; gerada fixture realmente válida com Sharp. Teste de Serviços usa sessão fixture porque login UI já tem E2E próprio e clique em build dev frio podia ocorrer antes da hidratação. Fecho de pool partilhado entre ficheiros removido.

## Verificação

- `pnpm test:e2e --grep 'serviços:|categorias por setas'` — **2 passed (46,9 s)** após correções. Teste de Produtos e revisão responsiva já passaram após esta implementação (rodada selecionada inicial: 2 passed, 1 falhou por hidratação durante compilação dev; serviço repetido e passou).
- Web/API typecheck e ESLint focado — passaram.
- `GET /api/v1/health` 200; `GET /api/v1/ads/placements?marketplace=servicos` devolve `items:[]` sem campanhas.
- Banco final: zero users `e2e-%@puvo.invalid`, zero campanhas de teste e migração 008 aplicada. Captura `output/playwright/servicos-1440.png` revista: setas visíveis, barra horizontal ausente; sem overflow horizontal nos layouts E2E.
- Não houve build de produção, Lighthouse ou ensaio público de Google Ads.

## Estado do projeto

- Fase/trilha atual: operação de dois marketplaces locais, com inventário de anúncios próprios e uploads endurecidos.
- Sólido agora: Produtos e Serviços anteriores; convites; três posições publicitárias com campanha própria; setas responsivas; descodificação de uploads; verificações acima.
- Falta imediato: notificações/preferências e denúncias/moderação de Serviços; consentimento/IDs para Google Ads; gestão mais completa de campanhas (edição, financeiro, métricas, retenção); sitemap completo; auditoria WCAG/Lighthouse e operação pública.
- Distância do fim: esta fatia visual/publicitária/upload ficou funcional em dev. Plano de funcionamento pleno ainda está no meio, e produto multi-marketplace ainda não terminou. Produção pública depende de domínio/TLS, SMTP, backups/restauro e monitorização reais.

Avaliação provisória visual: UX 91 · UI 91 · Acessibilidade 89 · Desempenho 84 · Consistência 92 · Conversão 90 · Escalabilidade 85 — precisa de refinamento. Acessibilidade: auditoria WCAG integral. Desempenho: medir Lighthouse, especialmente imagens de anúncios. Escalabilidade: sitemap/pesquisa/campanhas com carga representativa. Sem alegar certificação.

## Próximo passo recomendado

AVISO: O proximo passo e criar/implementar notificacoes e denuncias moderadas dos servicos, com preferencias, outbox e testes de privacidade. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

Abrir primeiro: `docs/plano-marketplaces-operacionais.md`, `docs/marketplaces-v2.md`, `apps/api/src/services/service-jobs.service.ts`, `apps/api/src/services/services.controller.ts`, `apps/api/src/auth/email.service.ts`, `apps/api/migrations/008_ad_campaigns.sql`, `tests/e2e/marketplaces.spec.mjs` e `tests/e2e/ads-and-uploads.spec.mjs`. Depois consultar `apps/api/src/community.controller.ts` para reutilizar política de denúncias existente de Produtos. Implementar notificações persistentes/outbox sem SMTP síncrono nas transações; denúncias privadas de perfil/pedido/mensagem com fila de moderação e limites; adicionar E2E negativo. Google Ads só após identificadores e consentimento.

---

# Histórico anterior

# Estado mais recente — convites, Produtos e Serviços (22/10/2026)

Objetivo: implementar convites com aceitação, escolha explícita de loja, os novos visuais e o marketplace de profissionais liberais/empresas de serviços, com E2E e hot reload.

Skills aplicadas: continuity-memory, professional-delivery-flow, global-engineering-control, api-engineering-control, database-engineering-control, elite-web-experience, playwright e imagegen. Instruções TypeSafe lidas; não foi necessário usar decisão semântica externa para estes fluxos determinísticos.

## Foi feito

- Migrações 005_teams_and_services.sql, 006_service_access_indexes.sql e 007_targeted_service_decline.sql aplicadas ao banco dev. Sessão seleciona loja; convites têm token apenas em hash, expiração sete dias, uso único, revogação, destinatário confirmado e envio SMTP/cópia de link. Associação só após aceitação. Antigo POST seller/team bloqueia concessão direta.
- StoreContextService aplica loja escolhida e papel às operações de perfil/anúncios/equipa/convites. Contexto por sessão, seleção verificada contra memberships; proteção de proprietário mantida. Encomendas continuam autorizadas por recurso.
- Produtos redesenhado em verde e Serviços em azul segundo as duas referências: fotografia decorativa de Luanda, categorias, pesquisa, filtros, grelha/lista, paginação, cartões, CTAs e footer comum. Há dados reais/estados vazios, sem simular pessoas online ou reputação.
- Serviços tem 10 categorias, perfis individual/company, experiência/especialidades, preço, atendimento/área/disponibilidade, foto e oito imagens de portefólio, consentimento de telefone público, revisão administrativa e verificação separada. Perfil pode ser pausado.
- Contratação: pedido geral/dirigido, oportunidades da categoria, propostas comparáveis, conversa privada paginada, recusa de pedido dirigido com motivo, recusa/retirada de proposta, aceitação transacional única, conclusão/cancelamento, histórico e avaliação de trabalho concluído pelo cliente. Pagamento/condições de serviços são combinados diretamente; produtos conservam MCX manual existente.
- Dois marketplaces ativos (produtos, servicos), confirmado por SQL. Restantes mercados não foram implementados. Empresas de serviços não equivalem ao marketplace B2B independente.
- Moderação em /admin/profissionais; atalhos em conta, homepage e índice de mercados. Metadata de perfil e sitemap de serviços adicionados, ainda com limite da primeira página.
- Bug encontrado pelo E2E: auth/me consumia quotas de tentativas de credenciais e aparentava logout. Separadas zonas NGINX sessão600/min+burst200 e logout60/min+burst30; limites sensíveis mantidos. NGINX validado/recarregado. Falha de leitura de sessão apresenta erro/repetição.
- Menu móvel fecha com Escape e devolve foco; filtros recolhidos em mobile; revisão em 320/768/1440 px. Imagens geradas salvas em apps/web/public/images/{products,services}-hero.png; prompts/proveniência no handoff.
- README, docs/store-operations.md e docs/marketplaces-v2.md atualizados.

## Verificação executada

- pnpm test:e2e: 5 passed (3.1m). Conta com confirmação/login/logout; convites/contexto/permissões; serviços até avaliação; compra por transferência manual até receção; responsividade.
- Após refinamentos de portefólio/recusa dirigida/Escape: pnpm test:e2e --grep 'serviços:|novos visuais' — passou (2 testes). output/playwright/test-results/.last-run.json status passed.
- pnpm --filter @puvo/web typecheck e pnpm --filter @puvo/api typecheck — passaram na revisão final.
- ESLint focado nos novos componentes/rotas e alterações de catálogo/convites/serviços — passou, sem erros/avisos. Corrigidos dois anchors do índice para next/Link. Não declarar lint global limpo.
- Script API check-store-operations.mjs adaptado aos convites — PASS:32 verificações HTTP, fixtures removidas.
- Negativos E2E incluem destinatário errado, replay/expiração/revogação, isolamento entre lojas, proprietário protegido, outsider, avaliação precoce/duplicada, conversa encerrada e concorrência de aceitação 201/409.
- Capturas de produtos/serviços em 320,768,1440 e perfil profissional revistas; sem overflow horizontal nos catálogos testados. Fotos brancas do profissional E2E são upload-fixture de um pixel, não erro de carregamento.
- Consulta final confirmou zero users e2e-%@puvo.invalid e migrações005/006/007 aplicadas. Fixtures do script também limpas. Mailpit conserva e-mails fictícios locais.
- Desenvolvimento manteve Next Fast Refresh e Nest watcher, dados em volumes. Nenhuma imagem Docker reconstruída; migrações aplicadas e NGINX reload necessários. Sem build/benchmark de produção ou Lighthouse.

## Estado do projeto

- Fase/trilha atual: segundo marketplace funcional e operação de equipas integrada.
- Sólido agora: fluxos principais de produtos, convites, seleção de loja e contratação de serviços, verificados no browser e por API.
- Falta imediato: notificações/preferências e denúncias/moderação de serviços; validação integral de pixels de upload; sitemap completo; medição de desempenho e auditoria WCAG integral.
- Distância do fim: esta fatia funcional local foi concluída. Produto multimercado continua a meio do desenvolvimento; não são 24 marketplaces completos nem uma operação pública pronta.
- Produção pública: topologia Caddy→NGINX já documentada na fase anterior; domínio real/TLS, SMTP verificado, backups/restauro, storage e monitorização ainda dependem de execução operacional real.

Avaliação estimada: UX91 · UI90 · Acessibilidade89 · Desempenho85 · Consistência92 · Conversão90 · Escalabilidade86 — precisa de refinamento. Lighthouse/conversão não medidos. Relatórios API84,1 e DB86,6 em docs/marketplaces-v2.md; Production Ready:NO.

## Próximo passo recomendado

AVISO: O proximo passo e criar/implementar notificacoes e denuncias moderadas dos servicos. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

Plano inicial da próxima etapa:

- Ler este estado e docs/marketplaces-v2.md; consultar apenas módulos de serviços e e-mail/auditoria relevantes.
- Modelar notificações transacionais de pedido/proposta/aceitação, preferências e idempotência; usar fila/outbox para não depender do SMTP no pedido HTTP.
- Acrescentar denúncia privada de perfil/pedido/mensagem e fila de revisão com permissões, limites e auditoria. Não expor conversa a terceiros sem fluxo autorizado de revisão.
- Reforçar quotas de proposta/leitura por conta e ensaiar concorrência/isolamento. Corrigir janela de corrida entre verificação de estado da conversa e inserção caso se exija fecho estritamente serializado.
- Expandir E2E com entrega/repetição de eventos, privacidade, denúncias e decisões; repetir verificação responsiva das novas telas.

## Arquivos para abrir primeiro

- docs/marketplaces-v2.md — contratos, esquema, riscos, comandos e proveniência visual.
- apps/api/src/services/{professionals.service,service-jobs.service,services.controller,services.dto}.ts
- apps/api/src/store-{context.service,invitations.service,invitations.controller}.ts
- apps/api/src/auth/email.service.ts
- apps/api/migrations/005_teams_and_services.sql,006_service_access_indexes.sql,007_targeted_service_decline.sql
- apps/web/src/components/{service-jobs,professional-dashboard,store-team-manager,store-switcher}.tsx
- apps/web/src/app/servicos/page.tsx e apps/web/src/app/produtos/page.tsx
- tests/e2e/marketplaces.spec.mjs e tests/e2e/fixtures.mjs
- infra/nginx/auth-routes.conf e default.conf.template

Ambiente: C:\Users\alexa\Videos\Mercado Angolano; Docker praca-angola-dev; Web http://localhost:3100; API http://localhost:4000/api/v1; Mailpit http://localhost:8025. `pnpm test:e2e` usa Chrome instalado, fixtures locais e limpeza em finally. Root devDependency @playwright/test adicionado; sem mudança de dependência runtime dos containers. Não inicializado Git nesta sessão.

---

# Histórico da fase anterior (substituído pelo estado acima)

# Estado mais recente — operação comercial das lojas (22/10/2026)

Objetivo: continuar as lojas completas e bonitas da PUVO, integrando equipa, contactos públicos consentidos e condições comerciais na base existente, com desenvolvimento local em hot reload.

Foi feito:

- Migração 004_store_operations.sql aplicada apenas ao banco de desenvolvimento: contactos com opt-in e timestamps, políticas com limites de tamanho, constraints de consentimento, índice por loja/papel e reposição das associações dos proprietários.
- Perfil comercial permite entrega, trocas/devoluções e condições de venda. Contactos só entram no catálogo quando explicitamente autorizados; desativação apaga o valor. Número MCX privado continua separado.
- Gestão de equipa por conta ativa com e-mail confirmado, até 50 membros. Proprietário gere equipa/perfil/recebimentos; editor gere anúncios/encomendas; suporte responde a conversas e consulta encomendas. Sem envio de convites ou e-mails nesta fase.
- Proteção contra remoção/despromoção do proprietário; alterações de membros auditadas em transação; anúncios suspensos/em revisão não podem ser publicados pela rota de estado. Lojas suspensas não podem editar/alterar estado de anúncios.
- Correção do perfil após guardar: resposta conserva role, profile_type e máscara MCX. Editor preserva assets já anexados pelo proprietário, sem poder anexar assets alheios arbitrários.
- Encomendas expõem canManage; UI esconde ações de pagamento/entrega/reembolso para suporte. API mantém verificação de papel.
- next/image em logótipos, capas e pré-visualizações, com tamanhos responsivos e AVIF/WebP. Configuração causou reinício automático do Next; nenhuma imagem Docker foi reconstruída e os containers mantiveram-se ativos.
- Ordenação/paginação de URL normalizadas para evitar falsa loja inexistente por parâmetro inválido.
- README e docs/store-operations.md documentam contratos, papéis, verificação e riscos.

Verificação executada:

- pnpm --filter @puvo/web typecheck — passou.
- pnpm --filter @puvo/api typecheck — passou.
- ESLint focado em lojas, homepage, sitemap, seller-dashboard, share-store-button, store-team-manager e order-detail — passou sem erros nem avisos.
- docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml exec -T api node apps/api/scripts/migrate.mjs — Applied 004_store_operations.sql.
- docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml exec -T api node apps/api/scripts/check-store-operations.mjs — PASS: 28 HTTP checks.
- Integração verifica consentimento, privacidade MCX, proprietário protegido, papéis, terceiros sem acesso, assets existentes, moderação, revogação, canManage de encomenda e otimização real PNG 512x256 → WebP. Fixtures e ficheiro temporários eliminados em finally. Primeiro ensaio com PNG de um pixel conservou PNG por ser pequeno; ensaio final usa imagem maior.
- GET /lojas, /lojas/loja-kwanza-home?sort=invalid, /vendedor e /api/v1/health via entrada local — HTTP 200.
- O lint global anterior tinha erros noutros ficheiros; não foi declarado limpo. Não foi feito build de produção.

Estado do projeto:

- Fase/trilha atual: operação comercial e equipa das lojas.
- Sólido agora: gestão local integrada, autorização por papel, contactos opt-in, políticas públicas e imagens responsivas, com 28 verificações HTTP e tipagem/lint focados aprovados.
- Falta imediato: convites com aceitação, seletor explícito de loja para contas de várias equipas e revisão visual responsiva/teclado em browser.
- Distância do fim: esta fatia funcional terminou localmente. A experiência de lojas completa ainda está no meio do caminho: horários, avaliações com comentários/respostas, sitemap completo e validação de pixels de upload ainda faltam. Produção pública também depende de domínio/TLS real, SMTP, backups e monitorização.

Limitações importantes:

- A associação é concedida diretamente a uma conta existente confirmada; não há convite pendente/aceitação. Só adicionar pessoas de confiança pelo painel proprietário.
- Perfil atual prioriza loja própria e depois associação mais antiga; ainda não há alternância entre várias equipas. Permissões por recurso são verificadas na API.
- Otimização ocorre no Next; upload só valida assinatura/tamanho até 5 MB. Falta descodificação integral e limite de pixels na entrada.
- Catálogo pode conservar cache até 30 segundos após guardar; revisão visual em browser não foi possível nesta sessão. Desempenho Lighthouse não foi medido.
- API conserva SQL/regras em controllers conforme base existente; falta separar serviços/repositórios e reforçar observabilidade/limites de abuso na procura de membros antes de publicação.
- Migração aplicada apenas à stack dev. Reverter código deve conservar colunas e dados aditivos; próximos ambientes precisam aplicar migrações antes de servir este código.

Avaliação provisória por código: UX 89 · UI 88 · Acessibilidade 87 · Desempenho 85 · Consistência 90 · Conversão 88 · Escalabilidade 83 — precisa de refinamento. Detalhes e relatórios API/banco em docs/store-operations.md. Não é certificação de produção.

## Próximo passo recomendado

AVISO: O proximo passo e criar/implementar convites de equipa com aceitacao, selecao explicita de loja e revisao visual responsiva. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

Plano inicial:

- Modelar convite com token hash, expiração, aceitação autenticada e revogação, sem revelar existência de conta.
- Introduzir contexto explícito de loja nas rotas de gestão e UI, preservando autorização por associação em cada recurso.
- Rever montra e painel em 320/768/1440 px, teclado, feedback e formulários; medir desempenho real.

Arquivos para abrir primeiro:

- MEMORIA.md
- docs/store-operations.md
- apps/api/src/seller.controller.ts
- apps/api/src/orders.controller.ts
- apps/api/migrations/004_store_operations.sql
- apps/api/scripts/check-store-operations.mjs
- apps/web/src/components/seller-dashboard.tsx
- apps/web/src/components/store-team-manager.tsx
- apps/web/src/components/order-detail.tsx
- apps/web/src/app/lojas/[slug]/page.tsx
- apps/web/src/app/storefront.css

---

# Histórico das etapas anteriores

# Continuidade — PUVO

## Estado atual — Primeiro marketplace implementado

**Última atualização:** 22 de outubro de 2026  
**Objetivo:** continuar a implementação de PUVO Produtos sem reconstruir as imagens a cada alteração de interface.

### Decisões confirmadas

- O primeiro vertical completo é **PUVO Produtos**, com catálogo público acessível sem conta.
- As outras áreas (serviços, empresas, imóveis e automóveis) aparecem no índice, claramente marcadas como “A preparar”.
- O pagamento inicial é **transferência MULTICAIXA Express manual, diretamente do comprador para o vendedor**. A PUVO não recebe nem retém fundos e não confirma pagamentos automaticamente.
- O fluxo usa referência comunicada pelo comprador e confirmação manual do vendedor depois de verificar a própria conta. Nunca pedir PIN, OTP ou dados de cartão.
- Para desenvolvimento diário, usar o serviço Webpack/Fast Refresh em http://localhost:3100. Alterações normais de código não requerem build nem reinício da stack. Build só quando mudarem dependências/Dockerfiles ou quando for preciso atualizar imagens compiladas de produção.

### Implementado

- Sitemap e páginas públicas: homepage, pesquisa e filtros, categorias, produtos, lojas e índice de marketplaces.
- Contas: registo, entrada/saída e sessão protegida; verificação obrigatória de novos e-mails, reenvio limitado, recuperação de palavra-passe com token de uso único e invalidação de sessões anteriores. Mailpit captura e-mails de desenvolvimento em http://localhost:8025; produção precisa de SMTP configurado.
- Experiência de conta: cabeçalho e menu móvel reconhecem sessão/visitante; cadastro confirma palavra-passe e mostra requisitos; formulários mapeiam erros comuns e preservam o destino interno entre entrar e registar; `/conta` reúne encomendas, mensagens, favoritos e loja. A rota `/auth/me` mantém `user: null` quando não há sessão, e os consumidores verificam esse campo.
- Operação de vendedores: criar e gerir anúncios, carregar imagens validadas, editar e pausar anúncios; novos anúncios passam por revisão.
- Compras: favoritos, conversas, carrinho dividido por loja, encomendas, reserva temporária de stock, instrução privada de transferência, reporte de transferência, confirmação/rejeição pelo vendedor, preparação/entrega, conclusão, cancelamento, pedido de reembolso e histórico.
- Confiança e operações: denúncias, moderação de anúncios/denúncias, avaliações ligadas a encomendas concluídas, registos de auditoria.
- UX: identidade verde/amarelo/neutros do PRD, layouts responsivos, estados vazios/erro/carregamento/sucesso e navegação móvel.
- Infraestrutura: monorepo pnpm/Turborepo, Next.js, NestJS, PostgreSQL, NGINX ingress e Compose; Redis, Meilisearch e SeaweedFS estão instalados mas ainda não participam dos caminhos principais do catálogo.
- Migrações e seed local preparados. Conteúdo disponível na conta de demonstração é apenas demonstrativo.

### Execução local

- Dev Compose: praca-angola-dev; web http://localhost:3100 e API http://localhost:4000/api/v1, ambas através do NGINX; PostgreSQL, Redis, Meilisearch, SeaweedFS e Mailpit em http://localhost:8025.
- Preview compilado isolado: praca-angola-prod, entrada NGINX em http://localhost:3200, Web e API internas, PostgreSQL e Redis.
- O compose de dev usa WATCHPACK_POLLING=true e Next next dev --webpack; o código é montado no container. Alterações de UI aparecem via Fast Refresh.
- API aplica migrações automaticamente ao arrancar em desenvolvimento.
- Comandos e credenciais de demonstração local estão documentados em README.md; não copiar essas credenciais para produção.
- O projeto ainda não tem repositório Git inicializado.

### Verificação desta etapa

- tsc --noEmit passou em apps/api e apps/web.
- Dev: homepage HTTP 200; /api/v1/health HTTP 200; /api/v1/catalog/listings HTTP 200 com quatro anúncios; /api/v1/catalog/stores HTTP 200 com a loja de demonstração.
- A homepage e o catálogo foram abertos no browser; produtos, filtros e menu móvel foram visíveis.
- Entrada e cadastro foram conferidos no navegador de desenvolvimento em desktop e menu móvel. Typecheck da Web e API passou; ESLint dos ficheiros TSX alterados passou sem erros (três avisos existentes de `<img>`). O código atualizou via Fast Refresh/watchers sem build de imagem.
- Preview compilado de produção atualizado em http://localhost:3200. A API aplica migrações antes de arrancar; o proxy Web usa o destino de API interno do Compose. O banco de produção local tem schema novo e permanece sem conteúdo de demonstração.
- Verificação HTTP final: homepage, /produtos, health, catálogo e marketplaces responderam 200 em dev e em produção. Stack de dev continua com quatro anúncios e uma loja de demonstração.
- Docker guarda a cache partilhada de dependências pnpm para reduzir downloads. A cópia local do pnpm fica em .data/corepack-cache (ignorada pelo Git) e é incluída no contexto Docker; uploads continuam excluídos.
- Não executar suites de testes sem solicitação. Esta etapa foi verificada por typecheck, HTTP e inspeção visual.

### Atualização — confirmação e recuperação de conta

- Adicionadas páginas e fluxos para confirmação/reenvio de e-mail e recuperação/alteração da palavra-passe. Após o registo, a pessoa confirma o endereço antes da primeira sessão; a recuperação termina as sessões atuais.
- Nodemailer envia por SMTP. Em desenvolvimento, Mailpit guarda as mensagens em http://localhost:8025 e recebe SMTP em `mailpit:1025`. O exemplo de produção documenta as variáveis SMTP; é preciso configurar credenciais e domínio reais antes do lançamento.
- Migration `002_account_email_tokens.sql` aplicada no banco de desenvolvimento. Tokens são aleatórios, armazenados apenas como hash, de uso único e expiram em 24 h (confirmação) ou 30 min (recuperação). Há espera mínima de um minuto por conta e a resposta da recuperação é igual para e-mails existentes e desconhecidos. Contas anteriores foram marcadas verificadas para preservar o acesso.
- Percurso manual feito com conta temporária: cadastro → mensagem Mailpit → confirmação → pedido de recuperação → nova palavra-passe → entrada em `/conta` → logout. A conta e as duas mensagens temporárias foram removidas depois.
- Web e API passaram `tsc --noEmit`; os Compose de desenvolvimento e preview validam; `/api/v1/health` devolve 200. Browser conferido a 320, 390, 768 e 1280 px; o console ficou sem erros nem avisos depois de definir `data-scroll-behavior` no layout.
- Para alterações futuras de código, manter Fast Refresh/watchers em `localhost:3100`. A única reconstrução desta etapa foi a imagem de dependências da API para incluir Nodemailer; não foi reconstruída a Web nem o preview compilado.

### Lacunas para um lançamento público

Ainda requer preparação operacional: termos e políticas validados, SMTP real, calibragem dos limites de abuso, CIDRs exatos caso exista load balancer antes do NGINX, suporte e disputa entre comprador/vendedor, monitorização, backups/restauro, domínio/TLS, configuração real da conta MCX de cada vendedor e revisão jurídica/regulatória local. Não existe GPO, liquidação automática, parceiro de entrega, nem operação pública pronta. Não apresentar os produtos semeados como inventário real.

### Arquivos de referência

- docs/plano-primeiro-marketplace.md — escopo funcional, fluxos, entidades e critérios.
- README.md — execução e rotas do MVP.
- compose.dev.yml e docker-compose.prod.yml — ambientes locais.
- apps/api/migrations/001_marketplace.sql — schema inicial.

## Ultima etapa concluída: Resposta uniforme no registo

Objetivo: uniformizar o status, o corpo da resposta e a interface para reduzir a enumeração explícita de e-mails registados.

Foi feito:

- O registo responde `202 { accepted: true }` tanto quando cria a conta como quando o e-mail já existe; a colisão de unicidade deixou de devolver `409 EMAIL_ALREADY_REGISTERED`.
- O envio do e-mail de confirmação inicia em segundo plano depois de persistir a conta e o token, para que o tempo de resposta não dependa da latência SMTP; falhas ficam registadas e a pessoa pode pedir outro link.
- A página de confirmação usa uma mensagem neutra e inclui caminhos claros para entrar ou recuperar a palavra-passe.
- A página já não indica se o primeiro e-mail foi entregue; a opção de pedir novo link continua disponível.
- Não houve alteração de banco, dependências ou imagens Docker.

Arquivos principais:

- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/auth.service.ts`
- `apps/web/src/components/auth-form.tsx`
- `apps/web/src/app/confirmar-email/page.tsx`

Verificação executada:

```text
API: pnpm --filter @puvo/api typecheck
Web: pnpm --filter @puvo/web typecheck
GET http://localhost:3100/confirmar-email
GET http://localhost:3100/api/v1/health
```

Resultado: os dois typechecks passaram; as rotas responderam 200; o texto e os links foram conferidos na árvore acessível do browser. A Web manteve Fast Refresh e a API usou o watcher existente. Nenhuma imagem foi reconstruída.

Limitações de segurança: a resposta de registo já não revela a colisão por status, corpo ou texto, mas não há garantia de tempo constante para o trabalho SQL. Ainda não existe limite por IP nos endpoints públicos. A API recebe pedidos através do rewrite do Next; a versão instalada não fornece aí um IP de cliente confiável e um `X-Forwarded-For` recebido do próprio pedido pode ser falsificado. Não ativar confiança nesse header sem uma camada de entrada que o substitua por um valor confiável. O limite atual por conta para reenvio/recuperação mantém-se.

Estado do projeto:

- Fase/trilha atual: acabamento dos fluxos de autenticação e preparação operacional.
- Sólido agora: registo, confirmação obrigatória, reenvio, login, logout e recuperação foram implementados; o contrato e a interface de registo, bem como as respostas de recuperação, não confirmam explicitamente a existência da conta.
- Falta imediato: configurar SMTP real para produção; escolher e configurar uma entrada confiável que normalize o IP; aplicar limite distribuído para registo, login e pedidos de e-mail.
- Distância do fim: os fluxos locais estão quase completos; a preparação para lançamento público ainda está no meio do caminho por depender de SMTP, proteção de abuso confiável e operação.

## Próximo passo recomendado

Configurar um proxy de entrada confiável e implementar rate limits por IP para os endpoints públicos de autenticação, preservando Fast Refresh no ambiente local e sem confiar em headers que o cliente possa forjar.

AVISO: O proximo passo e criar/implementar rate limits de autenticação através de uma entrada confiável. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

Plano inicial da próxima etapa:

- Investigar como o ambiente público irá receber tráfego e que componente consegue determinar/sanitizar o IP do cliente.
- Escolher limites distintos para login, registo, confirmação e recuperação; manter os limites por conta atuais como segunda camada.
- Persistir o contador em armazenamento partilhado para funcionar em múltiplas réplicas; não usar um mapa local em memória como controle de produção.
- Validar limites e configuração sem reconstruir a Web para alterações de interface; atualizar imagens apenas se a configuração de infraestrutura realmente exigir isso.

Arquivos para investigar/abrir primeiro na próxima etapa:

- `MEMORIA.md`
- `compose.dev.yml`
- `docker-compose.prod.yml`
- `apps/web/next.config.ts`
- `apps/api/src/main.ts`
- `apps/api/src/auth/auth.controller.ts`

## Ultima etapa concluída: NGINX ingress com limites por IP

Objetivo: aplicar limites aos endpoints públicos de autenticação numa camada que observa o IP da ligação antes de chegar ao Next/API.

Foi feito:

- Adicionado NGINX `1.31.7-alpine3.24`, fixado pelo digest da imagem, para encaminhar o tráfego de desenvolvimento e do preview de produção.
- Os limites usam `$binary_remote_addr` e zonas de memória partilhada pelo processo NGINX: geral de autenticação 30 pedidos/minuto (+10 burst), login 10/minuto (+5), registo 5/minuto (+2), pedidos de confirmação/recuperação 5/minuto (+2), validação/alteração por token 12/minuto (+4).
- As regras específicas aceitam variações de caixa e barra final; há uma regra geral para `/api/v1/auth/` que cobre caminhos não reconhecidos e impede que cheguem ao API sem o limite geral.
- Bloqueios retornam HTTP 429 em JSON, `Retry-After: 60` e `Cache-Control: no-store`.
- O NGINX substitui `X-Forwarded-For` por `$remote_addr` ao encaminhar. `trusted-proxies.conf` começa sem proxies confiáveis; para colocar um load balancer antes dele, adicionar apenas CIDRs exatos do balanceador.
- Desenvolvimento preserva `localhost:3100` (Web) e `localhost:4000` (API via NGINX). O container API deixou de publicar a própria porta. O preview publica só a entrada em `localhost:3200`; Web e API ficam internas.
- O NGINX encaminha WebSocket do Next, preservando HMR/Fast Refresh. Upstreams atualizam endereços DNS do Compose depois de recriações.
- README atualizado com políticas, portas e configuração atrás de load balancer. Sem mudanças de banco ou dependências da aplicação.
- Nenhuma imagem da Web/API foi reconstruída. A imagem do NGINX foi descarregada e fixada por digest; `compose up --no-build --pull never` recriou os containers Web/API e adicionou o ingress. Volumes de dados ficaram intactos.

Arquivos principais:

- `infra/nginx/default.conf.template`
- `infra/nginx/auth-routes.conf`
- `infra/nginx/proxy-common.conf`
- `infra/nginx/trusted-proxies.conf`
- `compose.dev.yml`
- `docker-compose.prod.yml`
- `README.md`

## Ultima etapa concluida: topologia pública Caddy → NGINX

Objetivo: definir uma entrada pública para TLS automático e encaminhamento seguro do IP do cliente, sem expor diretamente a aplicação nem contornar os rate limits.

Decisão de arquitetura:

- Topologia padrão: Internet → Caddy → NGINX → Web/API, num único servidor público. Caddy é a única entrada pública, nas portas TCP 80/443; obtém/renova certificados ACME e redireciona HTTP para HTTPS. NGINX conserva os limites de autenticação.
- Caddy é o primeiro proxy e não confia em `X-Forwarded-*` dos visitantes. NGINX confia apenas em `172.30.255.2/32`, IP fixo do Caddy numa rede Docker dedicada `172.30.255.0/29`; o NGINX usa `.3`. A configuração pública encaminha `X-Forwarded-Proto: https` depois do redirecionamento TLS.
- Web, API, PostgreSQL e Redis continuam sem portas públicas. O preview compilado local continua em `127.0.0.1:3200`; não oferece acesso HTTP direto a partir da Internet.
- Não há CDN/load balancer externo na configuração inicial. Se for introduzido, Caddy deverá confiar apenas nos CIDRs publicados por esse serviço e a origem deverá bloquear tráfego externo direto.

Foi feito:

- Adicionado `docker-compose.public.yml` como overlay opcional, sem alterar a entrada Fast Refresh de desenvolvimento.
- Adicionado `infra/Caddyfile`, com domínio e e-mail ACME obrigatórios por ambiente, proxy para o IP interno estático do NGINX e compressão.
- Adicionados `infra/nginx/trusted-proxies.public.conf` e `infra/nginx/proxy-common.public.conf` para a configuração de produção atrás do Caddy. A configuração vazia de dev/preview local continua sem proxies confiáveis.
- Fixado Caddy `2.11.7-alpine` pelo digest `sha256:24ec7b05bc532c7bb57f727030c5056e257ff7138b4b50460306819ff79362bd`.
- Alterada a publicação do NGINX no Compose de preview para `127.0.0.1:3200`; o container ingress foi recriado sem rebuild das imagens Web/API, sem alterações a bancos ou volumes.
- Atualizados `.env.prod.example` e README com `PUBLIC_DOMAIN`, `ACME_EMAIL`, valores HTTPS de `WEB_ORIGIN`/`PUBLIC_SITE_URL`, DNS A, firewall, persistência de certificados e instruções para ativar o overlay.

Arquivos principais:

- `docker-compose.public.yml`
- `docker-compose.prod.yml`
- `infra/Caddyfile`
- `infra/nginx/trusted-proxies.public.conf`
- `infra/nginx/proxy-common.public.conf`
- `.env.prod.example`
- `README.md`

Verificação executada:

```text
Caddy 2.11.7: caddy validate com domínio de exemplo reservado
NGINX: nginx -t com os includes públicos de proxy confiável e protocolo HTTPS
docker compose ... config --quiet (preview e overlay público)
GET /entrar, /api/v1/health, / e /_ingress-health nas portas locais
```

Resultado: Caddyfile e NGINX passaram validação; Compose resolveu o overlay para publicar apenas Caddy em 80/443 e manter NGINX em loopback 3200; as rotas locais devolveram 200. O Caddy não foi iniciado e nenhum certificado ACME foi emitido, porque ainda não há domínio público, DNS nem servidor configurados. O domínio `marketplace.example` no exemplo é reservado e deve ser substituído.

Limitações e próximos dados necessários:

- A rede Docker `172.30.255.0/29` não colide com as redes nem rotas locais observadas nesta máquina. Antes da publicação, confirmar que não colide com a rede do servidor; se alterar, atualizar conjuntamente `docker-compose.public.yml`, `infra/nginx/trusted-proxies.public.conf` e `infra/Caddyfile`.
- A emissão real de TLS requer o hostname escolhido, DNS A apontado ao IP público do servidor e TCP 80/443 encaminhado ao Caddy. Não criar AAAA sem conectividade IPv6 funcional.
- SMTP real continua por configurar e `SMTP_FROM` deverá usar domínio autorizado.
- Os limites NGINX partilham estado apenas numa instância; para várias instâncias públicas, adicionar rate limiter/WAF distribuído.

Estado do projeto:

- Fase/trilha atual: preparação da entrada pública e hardening da autenticação.
- Sólido agora: topologia de referência está definida; proxy trust, TLS automático e encaminhamento HTTPS têm configuração pronta e validada; preview continua local em `127.0.0.1:3200`.
- Falta imediato: receber domínio e IP do servidor, configurar DNS/firewall, preencher `.env.prod` com domínio e e-mail ACME/SMTP e ativar o overlay público; depois confirmar certificado e fluxo HTTPS real.
- Distância do fim: a arquitetura de borda de uma instância está pronta como template; publicação pública ainda não está ativada porque depende de domínio, servidor, DNS, firewall e SMTP.

## Próximo passo recomendado

Obter o domínio público e o IP do servidor para preencher `.env.prod`, validar DNS/portas e ativar Caddy com emissão real de certificados.

AVISO: O proximo passo e configurar o dominio publico e os dados do servidor para ativar Caddy com certificados TLS reais. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

Plano inicial da próxima etapa:

- Substituir o domínio reservado no `.env.prod.example` por um domínio controlado pelo utilizador e definir `ACME_EMAIL`.
- Apontar DNS A ao IP público do servidor; só publicar AAAA se IPv6 estiver operacional.
- Confirmar que as redes `172.30.255.0/29` não colidem no servidor e permitir TCP 80/443 no firewall para Caddy.
- Definir `WEB_ORIGIN`, `PUBLIC_SITE_URL` e `SMTP_FROM` com o domínio real; configurar SMTP.
- Executar `docker compose --env-file .env.prod -p praca-angola-prod -f docker-compose.prod.yml -f docker-compose.public.yml config --quiet`, ativar o overlay e verificar redirecionamento HTTPS, certificado, IP cliente e rate limits.

Arquivos para investigar/abrir primeiro na próxima etapa:

- `MEMORIA.md`
- `.env.prod.example`
- `docker-compose.prod.yml`
- `docker-compose.public.yml`
- `infra/Caddyfile`
- `infra/nginx/trusted-proxies.public.conf`
- `infra/nginx/proxy-common.public.conf`

Verificação executada:

```text
nginx -t no container de configuração
docker compose ... config --quiet (desenvolvimento e preview)
docker compose ... up -d --no-build --pull never (desenvolvimento e preview)
GET /_ingress-health, /, /entrar e /api/v1/health nas entradas aplicáveis
```

Resultado: sintaxe NGINX e Compose passaram; os dois ingress estão saudáveis; homepage e health checks devolveram 200 em `:3100`, `:4000` e `:3200`; logs mostram upgrade HMR WebSocket 101. Não foi enviado um lote de pedidos para provocar 429.

Limitações:

- Os limites são partilhados pelos workers de cada ingress NGINX, não entre várias instâncias ingress. Uma única entrada pode encaminhar para várias réplicas Web/API; para várias entradas, usar rate limiter/WAF distribuído.
- Sem load balancer, o NGINX usa o endereço da ligação. Atrás de load balancer, é necessário definir os CIDRs exatos em `infra/nginx/trusted-proxies.conf`; sem essa configuração os clientes podem partilhar o IP do balanceador e ser limitados juntos.
- A porta `3200` continua a ser preview local; TLS, domínio público, SMTP e a política final de limites ainda requerem preparação antes do lançamento.

Estado do projeto:

- Fase/trilha atual: endurecimento de autenticação e operação local do primeiro marketplace.
- Sólido agora: os endpoints externos de registo, login, confirmação e recuperação passam pelo NGINX e têm limites por IP; Fast Refresh continua operacional; as stacks dev e preview estão no ar.
- Falta imediato: exercitar os limites 429 com verificação controlada; definir a lista real de proxies confiáveis se houver balanceador; preparar TLS/domínio e SMTP de produção.
- Distância do fim: o controle de abuso local está implementado; a preparação para lançamento público continua no meio do caminho por depender de configuração de borda, e-mail, operação e revisão jurídica.

## Próximo passo recomendado

Fazer uma verificação controlada dos limites 429, ajustar os limiares para uso real e configurar CIDRs confiáveis/TLS quando a topologia pública estiver definida.

AVISO: O proximo passo e verificar e calibrar os limites 429 e a configuração de proxies confiáveis para produção. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

Plano inicial da próxima etapa:

- Confirmar o IP cliente que o NGINX observa na infraestrutura em que será publicado.
- Exercitar login, registo, pedidos de e-mail e ações por token até atingir os limites, conferindo resposta JSON 429 e `Retry-After` sem bloquear utilizadores legítimos.
- Rever os limiares para redes móveis, cafés e escritórios onde várias pessoas partilham o mesmo IP.
- Se existir mais de um ingress, selecionar WAF/rate limiter com contadores distribuídos antes de escalar gateways.

Arquivos para investigar/abrir primeiro na próxima etapa:

- `MEMORIA.md`
- `infra/nginx/auth-routes.conf`
- `infra/nginx/trusted-proxies.conf`
- `infra/nginx/default.conf.template`
- `compose.dev.yml`
- `docker-compose.prod.yml`

## Ultima etapa concluida: verificação 429 e calibração para IPs partilhados

Objetivo: confirmar o comportamento real dos limites no ingress e reduzir bloqueios acidentais quando várias pessoas usam a mesma rede móvel, café ou escritório.

Foi feito:

- Antes do ajuste, sete pedidos GET sem corpo à rota de login, alternando maiúsculas e barra final, produziram seis respostas 404 e um 429 no sétimo pedido. O teste enviou valores diferentes e falsos em `X-Forwarded-For`; eles não contornaram a mesma zona por IP.
- A proteção existente no serviço de autenticação limita cada conta a 10 falhas de login por 15 minutos e mantém um intervalo de um minuto por conta para ações de e-mail.
- Para dar espaço a grupos na mesma ligação, mantiveram-se as taxas sustentadas e aumentaram-se apenas os bursts: geral 30/min +30, login 10/min +20, registo 5/min +10, pedidos de e-mail 5/min +10, ações com token 12/min +10.
- Depois do ajuste, sequências GET sem efeitos de escrita confirmaram o 429 no limiar de cada grupo: login (22.º pedido), registo (12.º), pedido de recuperação de e-mail (12.º), ação por token (12.º) e rota desconhecida de autenticação (32.º). Nos pedidos anteriores, a API devolveu 404; os pedidos não enviaram credenciais, dados de registo, e-mails nem tokens.
- Todas as respostas 429 verificadas tinham `Retry-After: 60`, `Cache-Control: no-store`, tipo JSON e código `AUTH_RATE_LIMITED`. Os valores forjados em `X-Forwarded-For` continuaram sem alterar o IP de origem usado pelo ingress.
- A sintaxe do NGINX e os dois Compose passaram. As rotas de saúde, a entrada de login local e a homepage do preview responderam 200. Só os containers `ingress` foram recriados com `--no-build --pull never`; Web, API, bancos, volumes e imagens da aplicação não foram reconstruídos nem alterados.
- README atualizado com os limites e a política provisória de burst. Documentação oficial do NGINX confirma o algoritmo leaky bucket, o comportamento de `burst`/`nodelay` e o uso de origens explícitas de confiança para substituir o IP com `X-Forwarded-For`.

Arquivos principais:

- `infra/nginx/auth-routes.conf`
- `infra/nginx/trusted-proxies.conf`
- `infra/nginx/proxy-common.conf`
- `README.md`
- `MEMORIA.md`

Verificação executada:

```text
GETs internos sem corpo para os caminhos de autenticação em dev e preview
nginx -t nos dois containers ingress
docker compose ... config --quiet (dev e preview)
GET /_ingress-health, /entrar, / e /api/v1/health nas portas locais
```

Resultado: os limites e os cabeçalhos 429 foram exercitados com sucesso em desenvolvimento e preview. Os pedidos de teste foram GETs que não ativam as rotas POST de login, registo, e-mail ou token. Saúde NGINX, página de entrada e health checks devolveram 200 depois da recriação.

Limitações:

- As novas rajadas reduzem o risco de falso bloqueio numa rede partilhada, mas são uma política provisória; ainda não há métricas de utilização pública para calibrar taxas e bursts com dados reais.
- O `trusted-proxies.conf` continua vazio porque não foi definida uma topologia pública, load balancer, CDN, DNS ou origem dos certificados. Mantê-lo assim evita confiar em `X-Forwarded-For` fornecido por clientes. TLS público também não pode ser ativado sem hostname e escolha do terminador TLS.
- Os contadores continuam distribuídos apenas entre workers da mesma instância NGINX. Se a publicação tiver várias instâncias, será necessário um limitador/WAF com estado partilhado.
- O preview em `localhost:3200` não representa uma publicação HTTPS pública.

Estado do projeto:

- Fase/trilha atual: endurecimento da autenticação e definição da entrada de produção.
- Sólido agora: todas as zonas por IP foram exercitadas; 429, JSON, `Retry-After`, variantes de caminho e resistência a `X-Forwarded-For` falsificado foram confirmados; Fast Refresh e as stacks locais mantêm-se.
- Falta imediato: escolher o domínio e a topologia pública; definir CIDRs reais do proxy, se existir; configurar TLS, encaminhamento seguro de protocolo e renovação; observar tráfego real antes de voltar a calibrar os limites.
- Distância do fim: a verificação local desta trilha está concluída; a prontidão para lançamento público continua no meio do caminho e depende da topologia, TLS, SMTP, operação e revisão jurídica.

## Próximo passo recomendado

Definir a topologia pública de entrada (domínio/DNS, terminação TLS e proxies) para configurar CIDRs confiáveis e TLS sem aceitar headers falsificados.

AVISO: O proximo passo e definir a topologia publica de entrada para configurar CIDRs confiaveis, TLS e dominio. Antes de iniciar, leia `MEMORIA.md` para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

Plano inicial da próxima etapa:

- Escolher domínio, DNS e se TLS termina diretamente no NGINX ou num load balancer/CDN.
- Se houver proxy, obter os CIDRs exatos e confirmar que substitui/normaliza `X-Forwarded-For` e encaminha corretamente o protocolo original.
- Configurar certificados, renovação e as portas públicas estritamente necessárias.
- Se a topologia incluir várias entradas, escolher uma camada de rate limit/WAF com contadores distribuídos.

Arquivos para investigar/abrir primeiro na próxima etapa:

- `MEMORIA.md`
- `infra/nginx/trusted-proxies.conf`
- `infra/nginx/proxy-common.conf`
- `infra/nginx/default.conf.template`
- `docker-compose.prod.yml`
- `README.md`
## Ultima etapa concluida: evolução das lojas e montras públicas

Objetivo: tornar a descoberta e a apresentação das lojas mais completas e profissionais, mantendo os dados públicos ligados à API e sem expor dados de pagamento privados.

Foi feito:

- Diretório /lojas com pesquisa por nome/descrição, filtro por província, ordenação por recomendação, quantidade de produtos, avaliação e nome, paginação e estados vazios úteis.
- API de lojas com DTOs validados, parâmetros de pesquisa seguros/parametrizados, paginação limitada e ordenação por lista permitida.
- Página pública de loja com capa e logótipo opcionais, identidade visual, localização, estado de verificação, resumo de produtos/avaliações, categorias, pesquisa, ordenação por preço/data, paginação e partilha pelo navegador/ligação.
- Gestão da loja com resumo de anúncios publicados/em revisão, ligação para pré-visualizar a loja e campos para enviar logótipo/capa. As imagens reutilizam upload e validação existentes; a API só associa assets pertencentes ao utilizador autenticado.
- Migração 003_store_branding.sql para guardar os assets de marca na loja. Aplicada à base de desenvolvimento, sem rebuild de imagem.
- Homepage, sitemap e cartões de lojas alinhados com o novo contrato paginado da API.
- README atualizado com a experiência e as capacidades públicas da loja.

Arquivos principais:

- apps/api/src/catalog.controller.ts
- apps/api/src/seller.controller.ts
- apps/api/migrations/003_store_branding.sql
- apps/web/src/app/lojas/page.tsx
- apps/web/src/app/lojas/[slug]/page.tsx
- apps/web/src/app/storefront.css
- apps/web/src/components/seller-dashboard.tsx
- apps/web/src/components/share-store-button.tsx
- apps/web/src/lib/api.ts
- apps/web/src/app/page.tsx
- apps/web/src/app/sitemap.ts
- README.md

Verificação executada:

- pnpm --filter @puvo/web typecheck
- pnpm --filter @puvo/api typecheck
- Migração executada pelo migrador no container API da stack de desenvolvimento.
- GET ao diretório de lojas, diretório com filtros, montra pública, montra com pesquisa e API de lojas.

Resultado: ambos os typechecks passaram; a migração 003 foi aplicada; rotas Web e API consultadas devolveram HTTP 200. O desenvolvimento local permaneceu ativo com Compose/watchers; nenhuma imagem de aplicação foi reconstruída. O visual foi revisto a partir do código e estados entregues pelo servidor, mas não foi possível inspecionar screenshot no navegador neste turno porque a ferramenta informou que o uso do browser está desativado nas definições de Work.

Limitações e riscos remanescentes:

- As imagens são servidas no formato e tamanho carregados, até 5 MB; falta gerar variantes responsivas/compressão e definir limites de dimensão.
- Diretório está paginado, mas o sitemap atual continua a incluir no máximo 48 lojas; requer paginação para catálogo maior.
- Avaliações são apenas agregadas e ligadas a encomendas elegíveis; ainda não há secção de comentários/respostas públicas na loja.
- A loja não publica telefone, endereço residencial, horário ou canais sociais. Contacto permanece nos fluxos existentes por produto/mensagem; políticas de entrega e troca continuam a precisar de gestão estruturada.
- A gestão ainda é centrada no proprietário; falta UI completa de equipa/membros e permissões por loja.
- Não houve teste de usabilidade visual em browser neste turno.

Estado do projeto:

- Fase/trilha atual: evolução da experiência de loja e montra pública da PUVO Produtos.
- Sólido agora: descoberta de lojas, filtros URL, montra pública com identidade visual opcional, catálogo interno filtrável/paginado e upload de marca protegido por propriedade do asset.
- Falta imediato: verificar visualmente em browser quando estiver disponível, otimizar variantes de imagem, completar sitemap para todas as lojas e evoluir operações/identidade comercial (contactos públicos consentidos, políticas e equipa).
- Distância do fim: esta primeira fatia de UI e catálogo está funcional localmente; lojas plenamente completas para operação comercial continuam no meio do caminho, pois contactos/políticas/equipa e imagens otimizadas ainda não estão implementados. O produto público em geral continua dependente do domínio, TLS real, SMTP, operações e preparação do lançamento.

## Proximo passo recomendado

Completar a gestão de loja para operação comercial: equipa e permissões, políticas/condições visíveis ao comprador, canais de contacto públicos com consentimento explícito e otimização de imagens.

AVISO: O proximo passo e completar a gestao de loja com equipa, permissoes, politicas comerciais, contactos publicos consentidos e imagens otimizadas. Antes de iniciar, leia MEMORIA.md para continuar exatamente de onde o projeto parou, entender o que ja foi feito e integrar a solucao com o sistema atual sem reler todo o repositorio.

Plano inicial da próxima etapa:

- Revalidar o schema seller_profiles, store_memberships, media e autorização por proprietário.
- Definir dados comerciais públicos opcionais sem reutilizar o número privado de pagamento como contacto.
- Integrar gestão de equipa usando os papéis existentes e autorizar cada ação na API.
- Persistir políticas/condições claras da loja e exibi-las no catálogo público.
- Criar variantes responsivas e validar tamanho/dimensões antes de ligar imagens à loja.
- Validar filtros, upload, permissões e regressões de encomendas no ambiente local com hot reload.

Arquivos para investigar/abrir primeiro na próxima etapa:

- MEMORIA.md
- apps/api/migrations/001_marketplace.sql
- apps/api/migrations/003_store_branding.sql
- apps/api/src/seller.controller.ts
- apps/api/src/catalog.controller.ts
- apps/api/src/media.controller.ts
- apps/web/src/components/seller-dashboard.tsx
- apps/web/src/app/lojas/[slug]/page.tsx
- compose.dev.yml


