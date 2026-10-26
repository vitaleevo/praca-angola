# Estado operacional atual — PUVO

**Revisto:** 26/10/2026
**Topologia documentada:** Web Next.js na Vercel; API NestJS, PostgreSQL, Redis e media na Railway. Os procedimentos Compose/Caddy deste repositório são apenas para instalações self-hosted e não descrevem a produção atual.

Este registo separa verificações públicas feitas nesta revisão de configurações que só podem ser provadas nos painéis Vercel/Railway/Resend. Um endpoint saudável não certifica backups, alertas, email ou prontidão para piloto.

## Gates da Fase 3

| Gate | Estado | Evidência / próximo passo |
| --- | --- | --- |
| Disponibilidade e readiness | **Verificado parcialmente** | Em 25/10, `https://puvo.vitaleevo.ao/` e `https://pracaapi-production.up.railway.app/api/v1/health/ready` responderam HTTP 200. Readiness reportou `db:ok`, `media:ok` e atraso zero. É uma amostra pontual, não monitorização contínua. |
| Headers e fronteira de métricas | **Verificado parcialmente** | A Web devolveu HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` e `Permissions-Policy`; CSP está em `Report-Only`. GET público da API em `/api/v1/metrics` devolveu 404 sem token. O domínio da API é público; documentar o bloqueio do endpoint não significa que a API seja privada. |
| Hardening P0 no código | **Integrado em `main`** | A revisão Git confirmou que o tip de `hardening/p0` é ancestral de `main` e não há diff entre os dois. Isto confirma o código, não a configuração efetiva da Railway nem limites de rede aplicados pelo provedor. |
| Atraso da outbox | **Correção publicada; métrica por observar** | A versão publicada calcula a idade desde `service_notifications.created_at`, não desde `next_attempt_at` (que pode estar no futuro por causa de retentativas). Validar a evolução do gauge em produção com tráfego real. |
| SMTP e fluxos de conta | **Bloqueado; credencial a substituir** | A verificação de leitura da API Resend respondeu `401` em 25/10; não repetir com a mesma chave. A credencial SMTP atual deve ser rodada antes de uso. Uma verificação sem autenticação confirmou que `mail.vitaleevo.ao:465` resolve e apresenta certificado válido para o host, negociando TLS 1.3; não houve autenticação nem envio. Configurar o provider escolhido no gestor de segredos e validar confirmação de conta e recuperação de palavra-passe com uma caixa de teste controlada. |
| Backup, retenção e restauro | **Restauro PostgreSQL validado; cobertura parcial** | Consulta Railway confirmou PITR ativo, bucket ligado e arquivador saudável. Há snapshots automáticos diários (retenção 6 dias) e semanais (27 dias) de PostgreSQL e media. Em 25/10, o restauro PITR para um serviço temporário recuperou o ponto `02:10 UTC`; as contagens de `users`, `listings`, `orders` e `service_requests` coincidiram com produção (`3, 1, 0, 0`). O serviço temporário foi removido após a verificação. Falta ensaio separado de leitura/restauro de ficheiros do volume de media e evidência de cópia independente. |
| Alertas e escalonamento | **Parcial; entrega não testada** | O workspace está no plano Pro. Em 25/10 foi criado o dashboard padrão de produção, com CPU, memória, disco, rede, logs de erro e uso do projeto. O utilizador escolheu email + app Railway para os administradores. A consulta autenticada ainda encontrou zero `notificationRules`; nenhum monitor foi criado. Ativar notificações nas contas dos administradores e criar/testar monitores de CPU, RAM, disco e egress nos widgets. Estes monitores Railway cobrem métricas de recursos; uptime/readiness, 5xx, outbox e SMTP precisam de uma verificação de aplicação/canário ou ferramenta de observabilidade adicional, ainda por escolher e configurar. |
| Desempenho, acessibilidade e eventos | **Parcial** | A API Railway registou, numa amostra de 1 hora com 443 pedidos, p95 de 5 ms e zero 5xx. Volume baixo; isto não mede CWV da Web nem comportamento sob carga. Lighthouse/Core Web Vitals, WCAG e painel de eventos de funil continuam pendentes. Definir eventos mínimos sem dados pessoais e uma linha de base por mercado. |
| Dono operacional | **Pendente** | `docs/operations/runbook.md` ainda tem contactos placeholder. Definir on-call, canal de incidente, escalonamento e quem aprova restauros antes de piloto. |
| Publicação da Web e API | **Nova versão publicada; PR #12 pendente de integração** | Em 26/10 a API Railway `e02df63a-c241-4713-a8dd-aae9a11054f6` terminou com SUCCESS, a Web Vercel `dpl_Cf8QuajJrcukVMvaZeqStx1VyX76` e o admin `dpl_AfhCxg3Xu3gKWgWb6c3rNSC5W4Cs` ficaram READY nos domínios públicos. `marketplaces`, Empresas, Imóveis, Automóveis, Conta e CRM responderam HTTP 200; os três mercados estão ativos na API, com seis categorias cada. A PR #12 inclui a PR #11, identidade local e CRM. Quality, migrations e E2E passaram. O check Vercel `api` falha porque esse projeto inativo procura um entrypoint Node na raiz; a API operacional está no Railway. Este check ainda requer correção de configuração para gate totalmente verde. |

## Sequência de fecho

1. Rodar a credencial SMTP antes de voltar a usá-la. Escolher o provider, definir as variáveis correspondentes no secret manager (para TLS implícito na porta 465, `SMTP_SECURE=true`) e executar os fluxos de confirmação e recuperação com uma caixa de teste autorizada. A chave Resend anterior respondeu 401 e não deve ser reutilizada. Registar apenas resultado e timestamp.
2. Fazer um ensaio isolado do volume de media e definir cópia independente/fora da Railway.
3. Ativar email e app nas contas Railway dos administradores, criar monitores nos widgets do dashboard Pro para CPU, RAM, disco e egress, e testar entrega. O destino escolhido é email + app nativos; não foi fornecido webhook. Definir separadamente a monitorização de uptime/readiness, 5xx, outbox e SMTP, que não são cobertos pelos monitores nativos de recursos.
4. Medir CWV, p95 sob carga e funil de Produtos/Serviços; rever WCAG e acordar limites de operação.
5. Após os gates operacionais e a revisão final, integrar o PR #11 pelo fluxo de release e confirmar o deployment ativo antes de reavaliar o piloto de Empregos. Até lá, produção continua **não certificada para piloto**.

## Referências dos provedores

- [Railway — conceitos, backups e métricas dos serviços](https://docs.railway.com/overview/the-basics)
- [Railway — healthchecks de deployment](https://docs.railway.com/deployments/healthchecks)
- [Railway — backups de volumes](https://docs.railway.com/volumes/reference)
- [Railway — alertas, notificações e monitores](https://docs.railway.com/guides/alerts-crashes-failed-deploys)
- [Railway — métricas de recursos e limites dos dados de aplicação](https://docs.railway.com/observability/metrics)
- [Railway — webhooks de alertas](https://docs.railway.com/observability/webhooks)
