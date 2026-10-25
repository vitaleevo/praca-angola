# Auditoria de publicação — 25/10/2026

## Atualização para a revisão de publicação

- Checkout com estafeta: cotação no servidor por loja, total e frete persistidos, destino cifrado, despacho limitado ao modo e valor comprados. Migração 021 aplicada localmente.
- API: 55/55 testes; worker: 7/7 testes; API, site e gestão: builds e verificações TypeScript concluídas. Teste financeiro no browser passou com duas lojas, destino inválido e divergência de total.
- E2E: 21/22 passaram juntos; o cenário restante de serviços passou isoladamente. A suite extensa no servidor Next em modo de desenvolvimento apresentou esperas intermitentes; isso deve continuar sob acompanhamento após o deploy.
- Produção verificada: Railway tem Postgres, Redis, API e um serviço Web antigo; o worker de IA ainda precisa ser criado. Vercel tem projetos separados para site e gestão. PITR e backups agendados estão ativos; criar backup pontual antes das migrações.
- Os parágrafos abaixo registam a decisão da auditoria **antes** destas correções. Atualizar o estado final com os IDs de deploy e smoke pós-publicação.

## Decisão

**A revisão local ainda não foi publicada.** O checkout com estafeta apresenta um total que a API não grava, a última suite E2E não ficou integralmente verde e o ambiente remoto não dispõe do serviço `ai-worker`. A revisão continua numa árvore de trabalho com dezenas de alterações não versionadas. A versão pública anterior permanece ativa.

## Evidência local da revisão atual

- `pnpm typecheck`: 3 tarefas passaram.
- `pnpm lint`: 3 tarefas passaram.
- `pnpm --filter @puvo/api test`: 55 testes passaram em 13 ficheiros.
- `python -m pytest apps/ai-worker/tests -q`: 7 testes passaram.
- `pnpm test:e2e`: 20/20 passaram numa execução anterior às últimas alterações. Na execução posterior, 17/20 passaram; os três casos falhados passaram isoladamente após ajustes no checkout e reinício do Docker. Falta uma única execução integral verde na revisão final.
- `pnpm exec turbo build --force`: Web, Admin e API reportaram 3 tarefas bem-sucedidas sem cache. O processo do Turbo ficou aberto após o resumo; foi interrompido manualmente. O Web voltou a passar `pnpm --filter @puvo/web build` com exit code 0 após os ajustes finais de interface.
- `git diff --check`: passou; só emitiu avisos de normalização LF/CRLF.
- Migrações 001–020 aplicadas, por ordem, num PostgreSQL descartável e base removida após o ensaio. A 020 também foi aplicada no banco local.
- HTTP local: readiness 200; ausência de autenticação na logística 401; stream de chat sem token 403; mensagem de chat sem token 400 por validação; webhook Meta sem segredo 503.
- `docker compose -f docker-compose.yml -f compose.dev.yml config --quiet`: passou. O overlay `compose.dev.yml` depende do ficheiro base `docker-compose.yml`.

## Correções feitas nesta auditoria

1. A consulta de analytics do CRM deixou de referir colunas inexistentes; o estado de lead continua vazio até existir contrato de dados próprio.
2. O teste assíncrono do worker funciona com o runner instalado e a confirmação de email mostra a ligação para a equipa PUVO.
3. O webhook Meta exige segredo e assinatura HMAC SHA-256 do corpo original; sem configuração, falha fechado.
4. Logística: só owner/editor da loja despacha uma encomenda em preparação com pagamento confirmado; é obrigatório atribuir estafeta ativo ligado a utilizador. Recolha e PIN exigem o estafeta atribuído. O PIN usa gerador criptográfico, fica cifrado no banco, aparece só no tracking do comprador e não sai na resposta do vendedor nem nos metadados da notificação. Tentativas erradas são confirmadas na transação antes de devolver erro; o tracking verifica comprador, equipa da loja ou estafeta atribuído. O papel administrativo usa `administrator`.
   A migração 020 exige aprovação administrativa para o estafeta receber pedidos; o autorregisto fica pendente. O comprador não pode concluir manualmente uma entrega ativa com PIN.
5. Chat da loja: removeu-se `visitorUserId` fornecido pelo cliente; o identificador anónimo é UUID aleatório. Mensagem e SSE exigem token HMAC de 24 horas associado à sessão; há limites de pedidos e validação do vínculo sessão/loja antes de gravar.
6. IA personalizada: destinos arbitrários foram bloqueados; apenas hosts HTTPS explicitamente configurados em `CUSTOM_AI_ALLOWED_HOSTS` são aceites. O worker recusa pedidos quando não tem segredo interno; a configuração Compose de produção exige o mesmo segredo na API e no worker.
7. O painel de entrega passou a caber a 320 px (`scrollWidth = 320` medido no browser); os testes de pagamento anteriores escolhem levantamento explicitamente.

## Bloqueios para produção

1. **Total de frete incorreto:** o checkout com estafeta soma o frete ao “total a pagar”, mas `POST /orders` recebe apenas `buyerNote` e grava `orders.total_amount` como soma dos artigos. Em carrinho com várias lojas, a interface calcula o frete apenas para a primeira. É preciso um contrato de entrega por loja, cálculo de frete no servidor, persistência e teste do total antes de vender entregas.
2. **Topologia remota:** `railway status --json` mostra Postgres, Redis, Web e API na produção, sem serviço `ai-worker`. A API local aponta para `ai-worker:8000`; sem um worker remoto configurado, chat/IA e inspeções falham ou caem em fallback.
3. **Configuração remota ainda não validada:** `AI_INTERNAL_SECRET`, `APP_ENCRYPTION_KEY`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, URL do worker, hosts aprovados e variáveis de email têm de ser conferidos por nome/presença no serviço certo. O `.env.prod` local é um preview incompleto; `docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet` falha em `PUBLIC_SITE_URL`, `SMTP_HOST`, `SMTP_FROM` e agora também exige `AI_INTERNAL_SECRET`.
4. **Revisão de release:** a árvore tem aproximadamente 82 entradas modificadas/não versionadas, inclusive mudanças anteriores a esta auditoria, e o branch atual já não tem upstream. Falta uma revisão Git estável, CI para essa revisão e artefacto de deploy rastreável.
5. **Validação remota:** o HMAC do webhook foi testado unitariamente e a ausência de configuração por HTTP; falta ensaio HTTP positivo com segredo em ambiente isolado. Também faltam smoke autenticado do chat/logística no deployment remoto e plano confirmado de rollback/backup antes de migrações de produção.
6. **Estabilidade de teste:** o Docker Desktop parou durante uma execução E2E e o servidor Next reiniciou ao atingir o limite de memória. Depois do reinício os cenários afetados passaram isoladamente; ainda falta provar uma execução integral verde da revisão final.

## Próxima sequência

1. Corrigir o contrato de entrega e frete entre checkout e API, incluindo carrinhos com várias lojas e testes de valor final.
2. Consolidar a árvore de trabalho numa revisão Git identificável, estabilizar a stack local e executar CI/E2E integral dessa revisão.
3. Provisionar o worker no Railway, definir os segredos compartilhados e as variáveis por serviço; verificar a configuração sem imprimir valores sensíveis.
4. Fazer preview/staging dessa revisão, testar webhook assinado, chat e logística com utilizadores de papéis diferentes; conferir backup e rollback.
5. Publicar API/worker e frontends da mesma revisão, acompanhar migrações e executar smoke pós-deploy. Só declarar a produção concluída quando esses passos estiverem verdes.

## PROJECT CONTROL REPORT (estimativa baseada na evidência disponível)

- Fase: auditoria e endurecimento local; progresso de release: 70%.
- Arquitetura: 74/100; segurança: 76/100; qualidade de código: 70/100; testes: 72/100; infraestrutura: 45/100; observabilidade: 55/100.
- Maturidade ponderada GECS: **68,5/100**. Production Ready: **NO**.
- A infraestrutura pesa pela ausência do worker remoto e instabilidade local; testes pesam pela falta de E2E integral verde na revisão final; o contrato de frete reduz arquitetura e integridade funcional.
- Dívida introduzida nesta auditoria: migração 020 e token HMAC de chat exigem configuração operacional e documentação de rotação. A revisão ainda não está congelada.

### API, banco e interface

- API (design 68, segurança 75, performance 55, consistência 65, observabilidade 55, versionamento 60): **65/100; Production Ready: NO**. Corrigir o contrato de frete e validar p95, limites e traces em staging.
- Banco (design 73, integridade 72, performance 60, escalabilidade 55, segurança 73, manutenção 60): **66/100; Production Ready: NO**. Persistir frete/entrega por encomenda, testar concorrência/índices e preparar recuperação das migrações.
- Interface (UX 78, UI 82, acessibilidade 70, performance 60, consistência 75, conversão 72, escalabilidade 65): **precisa de refinamento**. A correção de 320 px foi medida, mas faltam auditoria de teclado/leitor de ecrã, métricas de produção e confirmação de totais do checkout. O passo mínimo é corrigir o total e repetir os fluxos de pagamento e entrega em dispositivos móveis.

O TypeSafe Jev devolveu HTTP 401 nesta auditoria. Não foi repetido; a chave da integração precisa de substituição.
