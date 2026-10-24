# PUVO — Plataforma Única de Vendas Online

**PUVO** é a Plataforma Única de Vendas Online de Angola, com **Produtos** e **Serviços** (profissionais liberais e empresas prestadoras). A arquitetura é um monólito modular, preparado para abrir outros marketplaces sem criar um serviço independente para cada área.

## Stack

- **Next.js 16 + React 19**: páginas públicas renderizadas no servidor, metadata e interface responsiva.
- **NestJS 12**: API versionada em `/api/v1`, validação de DTOs e regras de acesso por sessão e papel.
- **PostgreSQL 18**: fonte de verdade, constraints, índices e migrações SQL versionadas.
- **Redis 8**, **Meilisearch 1.30** e **SeaweedFS**: serviços já disponíveis na composição local para evolução. O marketplace atual usa pesquisa SQL e armazenamento de imagens local persistente.
- **NGINX**: entrada HTTP local e de preview; encaminha Fast Refresh, remove headers de IP enviados pelo cliente e aplica limites de autenticação antes do Next/API.
- **Caddy**: entrada pública opcional; termina TLS e renova certificados automaticamente antes de encaminhar para o NGINX.
- **pnpm + Turborepo + Docker Compose**: monorepo e execução isolada em desenvolvimento e no preview local.
- **Nodemailer + Mailpit**: confirmação e recuperação de conta por SMTP; Mailpit captura os e-mails durante o desenvolvimento.

## Iniciar em desenvolvimento

Requisitos: Docker Desktop com motor Linux, Node.js 24 e pnpm 11.

Na primeira execução, ou quando uma dependência/Dockerfile mudar:

```powershell
pnpm install
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml build api
pnpm stack:dev
```

O container da API aplica as migrações automaticamente antes de iniciar. Depois prepara conteúdo local de demonstração:

```powershell
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml exec api pnpm --filter @puvo/api db:seed:dev
```

O seed só funciona com `NODE_ENV=development`. Conta de demonstração local: `demo@puvo.local` / `Puvo2026!`. Configura os dados Multicaixa Express da loja de demonstração antes de fazer uma encomenda; o seed não contém um número de pagamento real.

- **Web com Fast Refresh:** `http://localhost:3100` (atrás do NGINX)
- **API local:** `http://localhost:4000/api/v1` (porta publicada pelo NGINX; a porta do container API não é publicada)
- **Saúde:** `http://localhost:4000/api/v1/health`
- **PostgreSQL:** `localhost:5432`
- **Redis:** `localhost:6379`
- **Meilisearch:** `localhost:7700`
- **SeaweedFS S3:** `localhost:8333`
- **Caixa de e-mail local:** `http://localhost:8025` (SMTP interno da API em `mailpit:1025`)

O Compose de desenvolvimento monta `apps/web/src`, `apps/api/src`, migrations, scripts e uploads diretamente. As alterações normais de código e CSS fazem Fast Refresh/restart do watcher, sem rebuild. O NGINX mantém a entrada nas mesmas portas e encaminha o WebSocket de hot reload. A porta `3200` é um preview compilado e não tem hot reload. A imagem da API só precisa de rebuild quando mudar a dependência ou o Dockerfile; o frontend não precisa de rebuild para as alterações normais.

O NGINX limita por IP: máximo sustentado geral de 30 tentativas de autenticação/minuto (+30 de burst), login a 10/min (+20), registo a 5/min (+10), pedidos de confirmação/recuperação a 5/min (+10) e validação/alteração por token a 12/min (+10). Leituras de sessão (`/auth/me`) têm orçamento separado de 600/min (+200), e logout de 60/min (+30), para navegação normal não consumir tentativas de credenciais. Os bursts foram aumentados após verificação para acomodar grupos que partilham um IP; as ações de e-mail mantêm também o intervalo de um minuto por conta. Esta política é provisória até existir tráfego público para calibrar. As regras incluem caminhos com maiúsculas/minúsculas e barra final para evitar bypass por variação do URI. Bloqueios devolvem 429 em JSON e `Retry-After: 60`. Os contadores usam zonas de memória partilhada pelos workers de uma única entrada NGINX. A API mantém também o limite por conta no login e nas ações de e-mail. A API do container não fica publicada diretamente, evitando contornar a entrada.

Comandos úteis:

```powershell
pnpm stack:dev
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml logs -f web api
docker compose -p praca-angola-dev -f docker-compose.yml -f compose.dev.yml exec api pnpm --filter @puvo/api admin:grant admin@example.ao
```

O comando `admin:grant` promove uma conta existente e ativa. Executa-o apenas para contas de operação autorizadas.

## Percurso do primeiro marketplace

- O visitante pode explorar a página pública, pesquisar, filtrar por categoria, província, condição e preço, consultar produtos e lojas sem criar conta.
- Conta única com sessões `HttpOnly`; palavras-passe são derivadas com scrypt e tokens de sessão são guardados como hash. O registo confirma a palavra-passe, explica os requisitos e valida nomes/e-mails; a entrada e a criação de conta preservam o destino interno original. O cabeçalho e o menu móvel mudam conforme o estado de sessão, e terminar sessão revoga o token atual e limpa o cookie.
- O novo registo exige confirmação de e-mail antes da primeira sessão. A recuperação de palavra-passe usa link de uso único, expira em 30 minutos e revoga as sessões existentes; links de confirmação expiram em 24 horas. Os tokens são guardados apenas como hash, os reenvios têm intervalo mínimo de um minuto e os pedidos de recuperação não revelam se o e-mail está registado.
- API de acesso: `POST /auth/email-verification-requests`, `POST /auth/email-verifications`, `POST /auth/password-reset-requests` e `POST /auth/password-resets` (sob `/api/v1`).
- `/conta` é a entrada da área pessoal, com atalhos para encomendas, mensagens, favoritos e gestão da loja. `/api/v1/auth/me` devolve `user: null` quando não existe sessão.
- A montra pública da loja tem identidade própria (logótipo e capa), partilha, catálogo pesquisável, filtros por categoria, ordenação por preço/data, paginação e sinalização de avaliações verificadas; o diretório permite pesquisa, província e ordenação. O vendedor configura a montra, publica imagens JPEG/PNG/WebP (máximo 5 MB por imagem), gere anúncios e acompanha as vendas. A página pública nunca expõe os dados privados de pagamento.
- Anúncios passam por revisão antes de aparecer no catálogo. Denúncias e decisões de moderação têm registo.
- Favoritos, mensagens por produto, encomendas, estados de preparação/entrega, avaliações de encomendas concluídas e histórico estão disponíveis.
- O carrinho cria uma encomenda por cada loja e reserva stock por 30 minutos. A loja define levantamento ou envio e o comprador confirma a receção.
- Cada loja pode ativar **Multicaixa Express e/ou transferência bancária manual**. O comprador escolhe um dos métodos disponíveis no checkout e transfere diretamente para o vendedor. O destino fica cifrado e só é mostrado ao comprador daquela encomenda. O comprador reporta a transferência; o vendedor confirma depois de verificar o seu próprio extrato. A PUVO não recebe nem guarda fundos, não usa o comprovativo como confirmação e não aceita PIN, OTP ou dados de cartão. PayPal não está integrado.
- Cancelamentos antes do pagamento e reembolsos manuais têm estados e histórico. O vendedor faz a devolução fora da PUVO e só depois confirma o reembolso no pedido.

## Rotas principais

- Públicas: `/`, `/produtos`, `/produtos/[slug]`, `/categorias/[slug]`, `/lojas`, `/lojas/[slug]`, `/marketplaces`.
- Conta: `/entrar`, `/registar`, `/confirmar-email`, `/verificar-email`, `/recuperar-palavra-passe`, `/redefinir-palavra-passe`, `/conta`, `/conta/favoritos`, `/conta/mensagens`, `/conta/encomendas`.
- Vendedor: `/vendedor`, `/vendedor/anuncios/novo`, `/vendedor/anuncios/[id]`.
- Operações: `/admin/moderacao`.

- Serviços públicos: `/servicos`, `/servicos/profissionais/[slug]`.
- Profissional e contratação: `/profissional`, `/servicos/pedidos`, `/servicos/pedidos/novo`, `/servicos/pedidos/[id]`, `/servicos/notificacoes`.
- Convites: `/convites/aceitar`; seleção de loja e gestão de convites em `/vendedor`.
- Moderação de profissionais e denúncias de serviços: `/admin/profissionais`, `/admin/denuncias-servicos`.

O catálogo de produtos mostra apenas anúncios publicados, com stock, pertencentes a uma loja ativa. Serviços permite perfil moderado, portefólio, disponibilidade, pedidos gerais/dirigidos, propostas comparáveis, conversa privada, aceitação/recusa, conclusão, avaliação elegível, notificações privadas com preferência de email e denúncias moderadas. Pagamento dos serviços é combinado diretamente. Empresas como marketplace independente, imóveis, automóveis e os restantes mercados continuam em preparação.

## Testes E2E

Com desenvolvimento ativo em `localhost:3100`, migrações aplicadas, dependências locais instaladas e Google Chrome disponível:

```powershell
pnpm test:e2e
```

Os testes criam contas fictícias no PostgreSQL local e removem dados/uploads no fim. Não executar contra produção. A suite cobre conta, convites e lojas, contratação de serviços, compra por transferência manual, publicidade/uploads, notificações/denúncias e responsividade. Relatório em `output/playwright/report/index.html`. Contratos e pendências: [entrega de marketplaces e convites](docs/marketplaces-v2.md) e [notificações/denúncias de Serviços](docs/service-notifications-reports.md).

O [plano de operação dos dois mercados](docs/plano-marketplaces-operacionais.md) define as etapas para lançamento. A faixa de categorias usa setas e gesto/teclado, com a barra de scroll oculta. Os catálogos reservam posições de publicidade premium, secundária e terciária, geridas em `/admin/publicidade`; só campanhas aprovadas e dentro da validade aparecem. Publicidade Google exige conta, identificadores de unidades e consentimento antes de carregar scripts externos. Uploads de imagem são descodificados, limitados a 20 milhões de píxeis e normalizados para WebP sem metadados.

## Preview local de produção

`.env.prod.example` documenta as variáveis da composição isolada. Copia para `.env.prod`, define uma `POSTGRES_PASSWORD` forte, um `APP_ENCRYPTION_KEY` aleatório com pelo menos 32 caracteres, `DATABASE_URL`, `REDIS_URL`, um domínio público em `WEB_ORIGIN`/`PUBLIC_SITE_URL` e credenciais SMTP válidas (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`). Não reutilizes segredos locais em produção.

```powershell
pnpm stack:prod:build
```

Na primeira inicialização, a API de produção aplica as migrações pendentes antes de aceitar pedidos.

Este preview publica a entrada NGINX apenas em `127.0.0.1:3200`; Web e API ficam internas. `pnpm stack:prod` apenas inicia as imagens que já existem; `pnpm stack:prod:build` recompila as imagens quando necessário. As alterações diárias devem ser feitas em `localhost:3100`.

## Topologia pública recomendada

O modo público usa **Internet → Caddy → NGINX → Web/API** num único servidor. O DNS A do domínio deve apontar para o IP público desse servidor; publica apenas TCP `80` e `443`, que pertencem ao Caddy. Caddy obtém e renova certificados, redireciona HTTP para HTTPS e ignora os headers `X-Forwarded-*` enviados diretamente por visitantes. Mantém os dados de Caddy no volume `caddy_data`.

O NGINX fica numa rede Docker privada `172.30.255.0/29`, com Caddy em `172.30.255.2` e NGINX em `172.30.255.3`. A configuração pública confia exclusivamente no CIDR `172.30.255.2/32`; a API recebe o IP real do visitante e `X-Forwarded-Proto: https`. Web, API, PostgreSQL e Redis não publicam portas. O preview `127.0.0.1:3200` fica acessível apenas no próprio servidor.

Antes de ativar: escolhe um domínio real, define `PUBLIC_DOMAIN`, `ACME_EMAIL`, `WEB_ORIGIN=https://<domínio>` e `PUBLIC_SITE_URL=https://<domínio>` em `.env.prod`, cria o registo DNS A e abre TCP `80/443` no firewall do servidor/provedor. Não publiques um registo AAAA sem IPv6 funcional. Confirma que a rede `172.30.255.0/29` não colide com uma rede já existente; se for necessário mudá-la, atualiza em conjunto `docker-compose.public.yml`, `infra/nginx/trusted-proxies.public.conf` e `infra/Caddyfile`.

Valida e ativa o modo público só depois de DNS e valores reais estarem prontos:

```powershell
docker compose --env-file .env.prod -p praca-angola-prod -f docker-compose.prod.yml -f docker-compose.public.yml config --quiet
docker compose --env-file .env.prod -p praca-angola-prod -f docker-compose.prod.yml -f docker-compose.public.yml up -d --no-build --pull never
```

Esta topologia não inclui CDN/load balancer externo. Se acrescentares um, configura nele a normalização de IP, adiciona em Caddy apenas os CIDRs publicados por esse proxy e bloqueia o acesso direto à origem. A configuração oficial do [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https) descreve os requisitos de DNS e portas; o [reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) substitui por padrão headers de encaminhamento recebidos do cliente. Um único NGINX partilha os limites entre os seus workers; várias entradas precisam de rate limiter/WAF com estado partilhado.

## Limites atuais e trabalho de lançamento

A gestão de lojas inclui contactos públicos com autorização explícita, condições de entrega/troca/venda, convites com aceitação e seleção explícita de loja por sessão. Os papéis são proprietário, editor e suporte. As montras usam imagens responsivas pelo Next. Consulta [operação das lojas](docs/store-operations.md) e [marketplaces e convites](docs/marketplaces-v2.md) para contratos, permissões, verificação e limitações.

Esta é uma implementação funcional de dois marketplaces locais, ainda não uma operação pública de produção. Antes de receber tráfego real, é necessário validar a política e os termos de compra/devolução, configurar e verificar o domínio de envio SMTP, calibrar limites de abuso e proteção operacional, testar em dispositivos reais, confirmar backups/restauro, monitorização, TLS/domínio, disponibilidade do storage, cópias de segurança dos segredos e resposta a incidentes. A integração automática de pagamentos depende de adesão do comerciante ao gateway, homologação e credenciais; não está incluída. Redis, Meilisearch e SeaweedFS estão instalados localmente, mas ainda não fazem parte dos caminhos de leitura e escrita destes marketplaces.
