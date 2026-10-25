# Notificações e denúncias de Serviços

Estado: implementado e exercitado no ambiente local de desenvolvimento em 22/10/2026. Migração `009_service_notifications_reports.sql` aplicada no PostgreSQL dev. Não houve build de Docker; Next Fast Refresh e Nest watcher continuam ativos.

## Notificações

- Eventos transacionais: pedido dirigido, proposta, proposta aceite, mensagem, trabalho concluído e pedido dirigido recusado. A notificação só contém título genérico e caminho interno do pedido, sem corpo da conversa ou descrição do pedido.
- `service_notifications` é privado por `user_id`. `UNIQUE(user_id,event_key)` torna a gravação idempotente. A notificação e a entrada opcional da outbox são gravadas na mesma transação do evento de negócio.
- A preferência `email_enabled` começa desligada. A página `/servicos/notificacoes` mostra avisos, leitura, preferência de email e o estado das denúncias da própria conta. Desligar email elimina entregas pendentes/falhadas/em processamento e novos eventos não criam entregas de email. Um SMTP que já tenha iniciado exatamente no momento do opt-out pode ainda concluir o envio. Avisos dentro da PUVO continuam disponíveis.
- O worker da API verifica a outbox a cada 30 segundos, reclama até dez entregas com `FOR UPDATE SKIP LOCKED`, usa SMTP configurado e aplica retentativas até cinco tentativas. Reclama novamente itens `processing` com lease expirado após cinco minutos. Entrega SMTP é **pelo menos uma vez**: uma queda entre envio e confirmação no banco pode repetir um email. A interface e a API nunca aguardam SMTP para concluir uma ação do utilizador.
- Em dev, Mailpit recebe os emails fictícios. No ambiente público, configurar SMTP de domínio, `PUBLIC_SITE_URL`, monitorização de falhas e política de retenção antes de ativar o canal de email.

## Denúncias e privacidade

- Perfil publicado, pedido visível ao profissional e mensagem recebida numa conversa própria podem ser denunciados por contas autenticadas. O autor não pode denunciar o seu próprio perfil, pedido ou mensagem. Há limite de cinco denúncias por conta em 24 horas e unicidade de denúncia aberta por pessoa/conteúdo.
- `POST /services/reports` grava o relato e auditoria. `GET /services/reports/mine` devolve apenas id, motivo, estado e data ao autor. A fila `GET /services/reports/moderation` e decisão `PATCH /services/reports/moderation/:id` exigem papel `administrator` ou `moderator`.
- A fila `https://gestao.puvo.vitaleevo.ao/denuncias-servicos` mostra o relato e, para mensagem denunciada, até 1000 caracteres **da mensagem específica**. Não fornece histórico completo da conversa nem abre pedido privado a um moderador sem participação. Uma decisão regista nota e autor na auditoria; não suspende conteúdo automaticamente. Ação sobre perfil ou conta exige revisão específica.
- O texto de denúncias só aparece ao autor no resultado inicial e à equipa de moderação; a consulta do autor mostra apenas o estado. Retenção/eliminação de relatos e critérios de ação exigem política operacional antes do lançamento público.

## Contratos e verificação

API em `/api/v1/services`: `GET/PATCH notifications`, `GET/PUT notification-preferences`, `POST reports`, `GET reports/mine`, `GET/PATCH reports/moderation`. Sessão e papéis são verificados no servidor; DTOs validam UUID, enums, tamanho e booleanos.

`tests/e2e/service-notifications-reports.spec.mjs` verifica destinatário isolado, leitura por dono, preferência ligada/desligada, outbox, entrega Mailpit sem descrição privada, aceitação sem aviso duplicado, denúncia de perfil/pedido/mensagem, negação a terceiros/autores, fila moderada, decisão auditada, telas e largura 320 px. Typecheck Web/API e ESLint focado passaram. Não foram executados benchmark, auditoria WCAG integral nem ensaio de falha SMTP em produção.

Próxima etapa técnica de Serviços: calibrar quotas de leitura e propostas por conta, métricas da outbox e retenção, instrumentar p95, aperfeiçoar operações da fila e rever WCAG em dispositivos reais. O plano geral continua em `docs/plano-marketplaces-operacionais.md`.
