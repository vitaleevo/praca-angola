# Plano — consola de operação da PUVO separada do marketplace

Data: 25/10/2026

Separação em implementação: `apps/admin` está associada ao domínio `gestao.puvo.vitaleevo.ao`. A pedido do proprietário, o corte das páginas antigas foi feito no código: `apps/web` não publica páginas, navegação ou atalhos administrativos; `apps/admin` rejeita hosts de produção diferentes do domínio de gestão. As alterações locais ainda precisam de deploy para vigorarem nos domínios públicos.

Separação: `apps/admin` é um frontend e deployment independentes; reutiliza intencionalmente a API e a base PostgreSQL atuais. Identidades e papéis são partilhados. O registo do proprietário global e o bootstrap foram auditados.

Confirmação de email: o URL `/verificar-email?token=…` no marketplace é o destino correto para validar o token, não o login da consola. O ecrã de sucesso agora inclui a ligação de equipa para `https://gestao.puvo.vitaleevo.ao/entrar?next=%2F`; deploy Web `dpl_DgMxU62RYigGt3r1faJQMXkAsKxf` está READY. Playwright E2E de registo, confirmação, login e saída passou. O teste usa `PLAYWRIGHT_BASE_URL` para evitar o servidor antigo em `:3100`.

## Objetivo

Dar à equipa PUVO uma aplicação própria para administrar os marketplaces, sem misturar o back-office com a experiência pública e as áreas de comprador, vendedor ou profissional. Preservar uma única API e uma única base de dados como fonte das regras de negócio; separar a interface e o domínio de publicação.

## Estado confirmado no código

- Monorepo pnpm/Turbo com `apps/web` (Next.js 16), `apps/api` (NestJS) e PostgreSQL.
- O painel global e as filas vivem em `apps/admin/src/app` e consomem a API partilhada.
- Rotas `/admin/**` não existem em `apps/web`; essas URLs devem responder 404. As rotas administrativas só são servidas pelo host `gestao.puvo.vitaleevo.ao`.
- A autorização está na API (`SessionGuard` e `RolesGuard`), não deve ser substituída por bloqueios de interface.
- `platform_owner` é único na migração `011_platform_owner.sql`; `administrator` e `moderator` já podem ser atribuídos a várias contas. Atualmente não existe ecrã de gestão da equipa.
- Login usa cookie HttpOnly, `SameSite=Lax` e `Path=/`. Ao usar um host próprio, a aplicação de gestão pode criar a sua sessão host-only no seu subdomínio; não é necessário alargar o cookie ao domínio dos marketplaces.
- `WEB_ORIGIN` é uma lista CORS separada por vírgulas; o frontend fala com a API pelo rewrite `/api/v1`.
- O bootstrap de primeiro `platform_owner` foi deixado de lado durante a separação inicial; foi concluído depois para a conta de gestão confirmada. Nenhum painel antigo foi removido.

## Arquitetura recomendada

- Nova aplicação independente `apps/admin` no monorepo, nome de pacote `@puvo/admin`, com pipeline/build próprios.
- Publicar inicialmente em `gestao.puvo.vitaleevo.ao` (nome de domínio recomendado, sujeito à disponibilidade DNS/Vercel). O marketplace mantém `puvo.vitaleevo.ao`.
- A consola usa a mesma API NestJS e PostgreSQL; não duplicar dados nem regras, nem criar endpoints secretos ou acesso SQL a partir do frontend.
- Login na consola emite um cookie HttpOnly host-only para `gestao.puvo.vitaleevo.ao`; sessão é independente da sessão do marketplace, mas a conta PUVO pode ser a mesma. Reutilizar endpoints de autenticação existentes por proxy Next.js.
- A API continua a decidir todas as permissões. Começar com os papéis existentes: `platform_owner` para emergência/configuração global, `administrator` para operação ampla e `moderator` para revisão. Não conceder autoridade por esconder/mostrar links.
- Extrair os componentes que precisam ser comuns para um pacote leve `packages/ui` (tokens, botões, formulários e estrutura/sidebar), sem partilhar navegação ou contexto de utilizador entre aplicações quando não fizer sentido.
- A consola deve permitir gerir Produtos, Profissionais, Denúncias e Publicidade. Acrescentar gestão da equipa com convite, atribuição/remoção de papéis e trilho de auditoria; o modelo deverá permitir múltiplos administradores/moderadores sem depender de uma conta pessoal como operação quotidiana.

## Sequência de execução

### Fase 1 — base independente

1. **Feito:** criar `apps/admin` com Next.js, login da equipa, layout de back-office, sidebar reutilizável via `packages/ui` e rewrite para a API. O dashboard agora agrupa indicadores por operação e revisão e liga cada fila à respetiva área; o shell da equipa foi polido; a moderação usa cartões responsivos, com quebra de descrições sem espaços.
2. **Feito localmente:** adicionar pacote/script de workspace, Dockerfile e instruções independentes de deploy.
3. **Parcial:** Preview `dpl_4ugnczWDfyCJrYe89ogae9YkD13u` READY; `/entrar` responde 200, páginas operacionais redirecionam utilizador anónimo para o login e API retorna `user:null`/401 `AUTH_REQUIRED`. Falta login/logout autorizado, isolamento de sessão entre hosts e respostas por papel com conta staff real.

### Fase 2 — migrar operações

1. **Feito localmente:** levar para a consola overview, moderação de produtos, profissionais, denúncias de serviços e publicidade.
2. **Feito localmente:** reutilizar os endpoints existentes sem alterar contratos da API.
3. Implementar ecrã de equipa e operação de convites/papéis na API, com validação, transação, auditoria, limites de privilégio e testes negativos. Nunca permitir autoelevação pública.
4. Definir matriz clara de permissões por módulo e auditar que cada endpoint corresponde à matriz.

### Fase 3 — lançamento e corte

1. **Feito:** projeto Vercel `praca-angola-admin` com raiz `apps/admin`, framework Next.js; domínio `gestao.puvo.vitaleevo.ao` verificado e apontado manualmente ao Preview atual `dpl_HX5NDKb26a6VvDFwEAxF6aGUD7uC`. API continua same-origin via rewrite; CORS não foi alargado.
2. **Parcial:** smoke anónimo confirma redirecionamento das páginas operacionais e 401 nas APIs de overview, moderação e publicidade. GET das rotas e CSS publicados respondeu 200; CSS tem breakpoints de 480 px e 420 px. A verificação visual pela interface está bloqueada porque o Work desativou uso local do navegador. Executar E2E de login/logout por papel, anúncios, gestão de equipa, sessões e resoluções móveis; validar conta comum e isolamento entre hosts com sessão staff controlada.
3. **Parcial:** conta verificada e bootstrap único auditado concluído. Falta o utilizador definir a senha pelo fluxo de recuperação, entrar na consola e completar o smoke autorizado com validação de logs/auditoria.
4. **Feito localmente por decisão do proprietário:** remover do marketplace as páginas `/admin/**`, os componentes antigos, atalhos globais e navegação de administração. As URLs antigas não redirecionam; devolvem 404.
5. **Feito localmente:** remover os componentes da interface antiga e atualizar documentação. `/admin/` permanece bloqueado no robots. A API protegida permanece partilhada porque `apps/admin` a utiliza.
6. **Pendente:** publicar os dois apps e confirmar que o host de gestão abre a consola, que o domínio público devolve 404 nas rotas antigas e que URLs `*.vercel.app` não servem a interface administrativa.

## Impacto e controlos

| Área | Impacto | Controlo necessário |
|---|---|---|
| Frontend/deploy | Alto | nova aplicação, projeto de deploy, domínio, variáveis e pipeline independentes |
| API/auth | Alto | mesma API; sessão host-only, validação de origem/CSRF e autorização por endpoint |
| Banco | Médio/alto | novos papéis e/ou convites apenas após matriz definida; migração compatível e auditada |
| Segurança | Alto | MFA recomendado para staff, menor privilégio, convite expirável, auditoria e teste 401/403 |
| Marketplaces existentes | Médio | frontend público sem páginas administrativas; manter os endpoints de staff protegidos por papel |
| UI partilhada | Médio | extrair só componentes transversais sem duplicar app shell nem acoplar domínios |

## Critérios de aceite

- A consola tem deploy e domínio independentes do marketplace.
- Compradores, vendedores e profissionais não conseguem abrir a consola nem chamar APIs de staff.
- A autorização funciona na API mesmo com requests manuais; `platform_owner` não é concedido pelo frontend.
- Cada área da equipa vê apenas ações compatíveis com o seu papel e cada alteração administrativa é auditada.
- As páginas administrativas só respondem no host de gestão, com papel validado na API; páginas `/admin/**` do marketplace público retornam 404.
- `apps/web` continua a passar typecheck, lint, build e seus fluxos de marketplace após o corte; `apps/admin` tem o mesmo conjunto de gates.

## Pendências de produto antes da gestão de equipa

A proposta assume domínio `gestao.puvo.vitaleevo.ao` e os papéis existentes como transição. Antes de construir o ecrã de equipa, fechar a matriz de funções (quem pode gerir utilizadores, aprovar conteúdo, gerir publicidade, consultar encomendas e promover/revogar outros gestores) e quem terá autoridade de recuperação do papel `platform_owner`.

## Próximo passo

Próximo passo: publicar as alterações de `apps/web` e `apps/admin`; depois confirmar 404 para `/admin/**` no marketplace, bloqueio do host de preview da consola, e acesso autenticado no domínio de gestão. Completar o smoke por papel e isolamento de sessão.
