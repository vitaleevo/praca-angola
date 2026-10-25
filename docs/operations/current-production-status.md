# Estado operacional atual — PUVO

**Revisto:** 25/10/2026
**Topologia documentada:** Web Next.js na Vercel; API NestJS, PostgreSQL, Redis e media na Railway. Os procedimentos Compose/Caddy deste repositório são apenas para instalações self-hosted e não descrevem a produção atual.

Este registo separa verificações públicas feitas nesta revisão de configurações que só podem ser provadas nos painéis Vercel/Railway/Resend. Um endpoint saudável não certifica backups, alertas, email ou prontidão para piloto.

## Gates da Fase 3

| Gate | Estado | Evidência / próximo passo |
| --- | --- | --- |
| Disponibilidade e readiness | **Verificado parcialmente** | Em 25/10, `https://puvo.vitaleevo.ao/` e `https://pracaapi-production.up.railway.app/api/v1/health/ready` responderam HTTP 200. Readiness reportou `db:ok`, `media:ok` e atraso zero. É uma amostra pontual, não monitorização contínua. |
| Headers e fronteira de métricas | **Verificado parcialmente** | A Web devolveu HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` e `Permissions-Policy`; CSP está em `Report-Only`. GET público da API em `/api/v1/metrics` devolveu 404 sem token. O domínio da API é público; documentar o bloqueio do endpoint não significa que a API seja privada. |
| Hardening P0 no código | **Integrado em `main`** | A revisão Git confirmou que o tip de `hardening/p0` é ancestral de `main` e não há diff entre os dois. Isto confirma o código, não a configuração efetiva da Railway nem limites de rede aplicados pelo provedor. |
| Atraso da outbox | **Correção local nesta etapa** | Readiness e gauge agora calculam a idade desde `service_notifications.created_at`, não desde `next_attempt_at` (que pode estar no futuro por causa de retentativas). A mudança ainda não foi publicada. |
| SMTP e fluxos de conta | **Bloqueado** | A verificação de leitura da API Resend, usando o segredo em memória na Railway sem o imprimir, respondeu `401` em 25/10; a chave atual continua inválida. Não repetir com a mesma chave. Substituir o segredo em Railway e depois validar confirmação de conta e recuperação de palavra-passe com uma caixa de teste controlada. Não guardar a chave nem endereços pessoais em evidência. |
| Backup, retenção e restauro | **Restauro PostgreSQL validado; cobertura parcial** | Consulta Railway confirmou PITR ativo, bucket ligado e arquivador saudável. Há snapshots automáticos diários (retenção 6 dias) e semanais (27 dias) de PostgreSQL e media. Em 25/10, o restauro PITR para um serviço temporário recuperou o ponto `02:10 UTC`; as contagens de `users`, `listings`, `orders` e `service_requests` coincidiram com produção (`3, 1, 0, 0`). O serviço temporário foi removido após a verificação. Falta ensaio separado de leitura/restauro de ficheiros do volume de media e evidência de cópia independente. |
| Alertas e escalonamento | **Parcial; entrega não testada** | O workspace está no plano Pro. Em 25/10 foi criado o dashboard padrão de produção, com CPU, memória, disco, rede, logs de erro e uso do projeto. O utilizador escolheu email + app Railway para os administradores. A consulta autenticada ainda encontrou zero `notificationRules`; nenhum monitor de limite foi criado. A Railway exige ativar email/app nas preferências de cada conta e criar monitores nos widgets. Falta configurar, testar a entrega e confirmar monitorização de uptime/readiness, 5xx, outbox e SMTP. |
| Desempenho, acessibilidade e eventos | **Parcial** | A API Railway registou, numa amostra de 1 hora com 443 pedidos, p95 de 5 ms e zero 5xx. Volume baixo; isto não mede CWV da Web nem comportamento sob carga. Lighthouse/Core Web Vitals, WCAG e painel de eventos de funil continuam pendentes. Definir eventos mínimos sem dados pessoais e uma linha de base por mercado. |
| Dono operacional | **Pendente** | `docs/operations/runbook.md` ainda tem contactos placeholder. Definir on-call, canal de incidente, escalonamento e quem aprova restauros antes de piloto. |
| Publicação da Web | **Alterações locais não publicadas** | `puvo.vitaleevo.ao` continua no deployment READY do commit `a9df3fca` (PR #9). A API Vercel confirmou que o commit `85697cef` (PR #10) foi cancelado porque não afetava este projeto monorepo; não foi uma falha de build. As alterações Web de navegação/marketplaces e a correção local de outbox continuam por publicar. Typecheck, lint e builds locais passaram; o preview visual foi conferido em desktop e 320/390 px. |

## Sequência de fecho

1. Gerar no Resend uma chave nova de Sending access limitada a `vitaleevo.ao`, substituir `SMTP_PASSWORD` na Railway e executar os dois fluxos de conta com uma caixa de teste autorizada; registar apenas resultado e timestamp. Não reutilizar a chave que respondeu 401.
2. Fazer um ensaio isolado do volume de media e definir cópia independente/fora da Railway.
3. Ativar email e app nas contas Railway dos administradores, criar monitores nos widgets do dashboard Pro e testar uma entrega. O destino escolhido é email + app nativos; não foi fornecido webhook.
4. Medir CWV, p95 sob carga e funil de Produtos/Serviços; rever WCAG e acordar limites de operação.
5. Rever as alterações locais, publicar pelo fluxo de release e confirmar o deployment ativo antes de reavaliar o piloto de Empregos. Até lá, produção continua **não certificada para piloto**.

## Referências dos provedores

- [Railway — conceitos, backups e métricas dos serviços](https://docs.railway.com/overview/the-basics)
- [Railway — healthchecks de deployment](https://docs.railway.com/deployments/healthchecks)
- [Railway — backups de volumes](https://docs.railway.com/volumes/reference)
- [Railway — alertas, notificações e monitores](https://docs.railway.com/guides/alerts-crashes-failed-deploys)
- [Railway — webhooks de alertas](https://docs.railway.com/observability/webhooks)
