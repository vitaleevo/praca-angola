# Produtos, serviços e convites — entrega local de 22/10/2026

## Estado e âmbito

Dois marketplaces ativos: Produtos e Serviços. Serviços recebe profissionais liberais e empresas prestadoras de serviços; isto não implementa ainda um marketplace B2B independente. Os restantes mercados continuam em preparação. Esta entrega é funcional em desenvolvimento, sem certificação de lançamento público.

As referências fornecidas orientaram os catálogos: verde para Produtos, azul para Serviços, fotografia de Luanda, navegação comum, pesquisa, categorias, filtros e cartões. Números, avaliações, disponibilidade e verificação dependem dos dados guardados; não existem contadores fictícios de pessoas online nem destaques pagos simulados.

## Rotas e percursos

| Área | Web | API sob `/api/v1` |
| --- | --- | --- |
| Produtos | `/produtos` | `/catalog/listings` |
| Catálogo de profissionais | `/servicos` | `/services/professionals`, `/services/categories` |
| Perfil público | `/servicos/profissionais/[slug]` | `/services/professionals/:slug` |
| Gestão profissional | `/profissional` | GET/PUT `/services/me`, POST `/services/me/pause` |
| Pedidos próprios/oportunidades | `/servicos/pedidos` | GET `/services/requests?scope=mine` ou `market` |
| Criar pedido | `/servicos/pedidos/novo` | POST `/services/requests` |
| Pedido, propostas e conversa | `/servicos/pedidos/[id]` | `/services/requests/:id`, `/services/proposals/:id/messages` |
| Moderação de profissionais | `/admin/profissionais` | `/services/moderation` |
| Equipa e loja atual | `/vendedor` | `/seller/stores`, `/seller/active-store`, `/seller/invitations` |
| Aceitar convite | `/convites/aceitar?token=…` | `/team-invitations/:token`, `/team-invitations/accept` |

### Convites e seleção de loja

- Proprietário convida editor ou suporte. Token aleatório de 256 bits, apenas SHA-256 no banco, expiração em sete dias, uso único e revogação. Novo convite para o mesmo e-mail revoga o anterior pendente.
- Não há acesso antes da aceitação. É necessário entrar com o e-mail confirmado destinatário. A consulta pública do token não revela esse e-mail. Aceitação concorrente é serializada por locks; proprietário protegido; limite de 50 membros e 20 convites/hora/loja.
- SMTP usa o serviço existente. O proprietário pode copiar o link devolvido na criação; falha de envio é apresentada. A listagem posterior não devolve o token. Tokens não devem ser enviados a analytics ou logs de navegação.
- `sessions.active_store_id` guarda a escolha por sessão. O painel, anúncios, equipa, convites e configurações usam este contexto e voltam a verificar associação/papel na API. Sem escolha válida, usa loja própria ou associação mais antiga. Encomendas da conta continuam autorizadas por recurso; não são implicitamente ocultadas pela seleção do painel.
- POST `/seller/team` deixa de conceder acesso direto e responde 400 `INVITATION_REQUIRED`; PUT/DELETE mantêm gestão dos membros aceites.

### Serviços de ponta a ponta

1. Conta confirmada cria perfil, escolhe categoria, área, atendimento, experiência, preço indicativo, disponibilidade, foto e até oito imagens de portefólio. Contacto telefónico público exige autorização explícita.
2. Perfil segue para revisão. Administrador/moderador publica ou rejeita; marca de verificação exige decisão separada. Alterações voltam à revisão; profissional pode pausar.
3. Cliente publica pedido geral ou dirigido a um profissional. Os pedidos não são indexados publicamente. Profissionais publicados da categoria podem consultar oportunidades elegíveis; pedidos dirigidos ficam restritos ao destinatário e cliente.
4. Profissional apresenta uma proposta por pedido, com preço, prazo e descrição. Cliente compara propostas; cada profissional só consulta a sua. Destinatário pode recusar pedido dirigido, indicando motivo.
5. Cliente e autor da proposta conversam numa thread privada. Cliente pode recusar proposta; autor pode retirá-la. Aceitação bloqueia o pedido em transação e recusa as restantes propostas pendentes, impedindo duas adjudicações concorrentes.
6. Cliente conclui ou cancela. Conversa encerrada conserva histórico. Só cliente de trabalho concluído e adjudicado pode deixar uma avaliação, uma vez.

Pagamento de produtos continua por transferência Multicaixa Express manual, com confirmação pelo vendedor. Nos serviços, pagamento e condições são combinados diretamente; não existe checkout, custódia ou confirmação automática de pagamentos de serviços.

## Dados e implantação

- `005_teams_and_services.sql`: contexto da sessão, convites, categorias, perfis/portefólio, pedidos/propostas/mensagens/avaliações e ativação de Serviços.
- `006_service_access_indexes.sql`: índices de acesso e chaves estrangeiras complementares.
- `007_targeted_service_decline.sql`: recusa de pedido dirigido e motivo limitado.
- `008_ad_campaigns.sql`: campanhas próprias por marketplace e posição, com aprovação, período, prioridade, anunciante, imagem e destino HTTPS. Administração em `/admin/publicidade`. A API pública devolve apenas a campanha elegível de cada posição.
- `009_service_notifications_reports.sql`: notificações privadas, preferência de email, outbox e denúncias de perfil/pedido/mensagem com fila moderada. Contratos e privacidade em `docs/service-notifications-reports.md`.
- Aplicadas apenas ao PostgreSQL de desenvolvimento. Relações, checks e unicidades protegem os dados; FK composta garante que a proposta adjudicada pertence ao pedido.
- Upload agora descodifica a imagem com Sharp, rejeita conteúdo corrompido/animações, limita a 20 milhões de píxeis, orienta/reduz para até 2560 px e grava WebP sem EXIF. O limite de entrada permanece 5 MB; os ficheiros antigos continuam acessíveis no formato original. A nova dependência exigiu uma reconstrução única da imagem API.
- Aplicar as migrações antes de servir o novo código noutro ambiente. Recuperação: preservar tabelas/colunas e dados aditivos; preferir correção por nova migração a remoção destrutiva. Backup/restauro público ainda precisa de ensaio.
- Catálogo de Serviços lê sem cache de dados persistente para refletir revisão e avaliações. Categorias conservam cache curto. Sitemap inclui Serviços/perfis, mas ainda só cobre a primeira página: até 48 produtos, 48 lojas e 12 profissionais. Precisa de paginação/sharding antes de crescer.
- Filtros incluem as 21 províncias atuais; referência primária: [publicação do INE](https://www.ine.gov.ao/Arquivos/arquivosCarregados/Carregados/Publicacao_638996687409619846.pdf).

### Desenvolvimento e limites

Sem build de imagem Docker nesta entrega. Next usa Fast Refresh e Nest usa watcher; API reinicia quando o código do servidor muda. Dados persistem nos volumes. A atualização da configuração NGINX exigiu validação e reload, sem reconstrução de containers.

O E2E encontrou uma falha real: leituras frequentes de `/auth/me` consumiam o orçamento de tentativas de autenticação, causando 429 e aparência de sessão perdida em rede partilhada. Agora há zonas separadas: sessão 600/minuto, burst 200; logout 60/minuto, burst 30. Credenciais/registo/tokens conservam os limites anteriores. Falha ao consultar sessão apresenta erro/repetição em vez de assumir saída.

Serviços limita publicação a 10 pedidos/dia/conta, mensagens a 20/minuto/remetente, propostas a 50/pedido e denúncias a 5/dia/conta. Ainda falta calibrar proteção de leitura e propostas em massa por conta para tráfego público.

## Verificação reproduzível

Com a stack dev ativa, Node/pnpm instalados e Google Chrome disponível:

```powershell
pnpm test:e2e
pnpm --filter @puvo/web typecheck
pnpm --filter @puvo/api typecheck
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml exec -T api node apps/api/scripts/check-store-operations.mjs
```

Resultado nesta entrega:

- Suite completa: **5 E2E aprovados**, 3,1 minutos. Registo/confirmar e-mail/login/logout; convites/contexto/permissões; profissional até avaliação; produto do carrinho à receção com MCX manual; revisão responsiva.
- Depois dos refinamentos finais: **2 E2E selecionados aprovados**, serviços e responsividade. Incluem upload de portefólio, recusa de pedido dirigido e Escape com retorno de foco no menu.
- Iteração seguinte: teste de setas, upload válido/corrompido, rascunho/aprovação/pausa e isolamento dos três níveis de publicidade passou; teste completo de Serviços repetido com imagem PNG realmente descodificável e passou. O PNG mínimo anterior tinha IDAT corrompido; a validação por assinatura aceitava-o e a descodificação passou a rejeitá-lo.
- Negativos: e-mail errado, token repetido/expirado/revogado, isolamento entre lojas, proprietário protegido, terceiros sem acesso, avaliação precoce/duplicada, conversa encerrada e duas aceitações simultâneas (201/409).
- Integração existente adaptada aos convites: **32 verificações HTTP aprovadas**. Typechecks Web/API e ESLint focado nos ficheiros novos/alterados passaram. Não foi declarado lint global limpo nem feito build de produção.
- Capturas e verificação de transbordamento em **320, 768 e 1440 px**, ambos os catálogos. Capturas revistas visualmente. Não substituem estudo com utilizadores, auditoria integral WCAG ou ensaio em dispositivos reais.
- Fixtures usam exclusivamente contas fictícias `e2e-…@puvo.invalid` no banco local. Limpam dados e uploads em `finally`; Mailpit captura mensagens localmente. Não executar contra produção. Banco de teste precisa da mesma versão das migrações.

Código: `tests/e2e/marketplaces.spec.mjs`, `tests/e2e/fixtures.mjs`, `playwright.config.ts`. Relatório: `output/playwright/report/index.html`. Capturas: `output/playwright/`. Esses artefactos são ignorados no controlo de versão. Fotos brancas nas capturas do perfil E2E são fixtures mínimas de upload, não imagens quebradas de produção.

## Avaliação e pendências

Avaliação estimada por inspeção e fluxos testados, não medição de satisfação/conversão: **UX 91 · UI 90 · Acessibilidade 89 · Desempenho 85 · Consistência 92 · Conversão 90 · Escalabilidade 86 — precisa de refinamento.**

- Acessibilidade 89: labels/foco/menu por teclado e fluxos principais revistos; falta auditoria integral de contraste/leitor de ecrã. Menor correção: executar auditoria WCAG nas páginas privadas e corrigir achados.
- Desempenho 85: imagens responsivas e consultas limitadas, mas sem Lighthouse/Core Web Vitals de produção. Menor correção: medir ambiente compilado isolado e corrigir LCP/CLS encontrados; não usar tempos de compilação dev como benchmark.
- Escalabilidade 86: paginação e índices presentes, mas sitemap parcial e pesquisa SQL sem ensaio de carga. Menor correção: completar sitemap e medir planos/p95 com dados representativos.

API CONTROL REPORT: design 85, segurança 86, desempenho 82, consistência 88, observabilidade 68, versionamento 90; **score 84,1**. Módulo de serviços separa controllers/regras; SQL parametrizado, DTOs, autorização por recurso, transações e auditoria de decisões críticas. Dívida: controllers antigos ainda concentram SQL, métricas/p95 e quotas públicas de serviços por reforçar. Production Ready: **NO**.

DATABASE CONTROL REPORT: schema `public`; novas tabelas de convites e serviços relacionadas com utilizadores, sessões, categorias e assets. Design 88, integridade 91, desempenho 84, segurança 87, escalabilidade 82, manutenção 86; **DB Score 86,6**. Índices/constraints aplicados; sem dados órfãos de fixtures. Riscos: pesquisa textual e agregação de avaliações precisam de EXPLAIN/carga representativa; sessão e remetente são pontos de serialização deliberados; ensaio de backup/restauro e conta de execução com privilégios mínimos ainda pendentes. Production Ready: **NO**.

Notificações dos pedidos/propostas/mensagens, preferências de email, outbox e denúncias moderadas de Serviços foram acrescentadas; `tests/e2e/service-notifications-reports.spec.mjs` cobre privacidade, autorização e entrega local pelo Mailpit. Próxima prioridade: quotas de leitura/propostas por conta, métricas/retenção da outbox, sitemap completo e expansão ao próximo mercado. Lançamento público continua a depender de domínio/TLS real, SMTP verificado, storage/backup e monitorização operacional.

## Proveniência das imagens decorativas

Modo: ferramenta nativa de geração de imagens, sem referências de pessoas reais. Imagens decorativas, não perfis ou provas de verificação. Destinos relativos à raiz do projeto:

- `apps/web/public/images/services-hero.png` — 2172×724.
- `apps/web/public/images/products-hero.png` — 2172×724.

Prompt Serviços:

> Create a polished photographic website hero background, ultrawide panoramic composition 3:1. PUVO marketplace, Angola audience. Realistic Luanda waterfront skyline and bay in bright soft morning light, contemporary Angolan urban architecture, elegant blue glass buildings and palm trees on the right. Rightmost quarter: a confident smiling Black Angolan female freelance business consultant in her early 30s with natural curly hair wearing a light blue blazer and white blouse, standing with relaxed arms crossed, waist-up. The left 50 percent must be very pale off-white/sky negative space for readable dark website text, gradually fading into the photograph on the right. Premium commercial editorial photography, natural credible appearance, calm restrained light blue palette. No typography, no logos, no UI, no buttons, no text. Do not reproduce a screenshot; deliver only the decorative background photograph.

Prompt Produtos:

> Photographic ultrawide website hero background 3:1 for PUVO online products marketplace. Panoramic view of Luanda bay Angola, coastal promenade, palms, modern skyline and Agostinho Neto memorial, clear bright morning sky and water. Architecture concentrated on right half. Left half gently fades naturally into very pale warm ivory/off-white empty sky and haze, negative space for dark headline and search UI. Calm premium editorial travel photograph, realistic warm African coastal light, restrained natural blue water and cream palette. No people foreground, no typography, no logos, no text, no UI. Decorative panoramic image only.

