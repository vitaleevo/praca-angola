# Plano de operação — Produtos e Serviços

Estado inicial: 22/10/2026. Base: `MEMORIA.md` e `docs/marketplaces-v2.md`. Objetivo: tornar os dois mercados operacionais e mensuráveis sem perder isolamento entre contas, qualidade visual nem Fast Refresh.

Progresso: faixa com setas, anúncios próprios nos três níveis, painel da equipa em `https://gestao.puvo.vitaleevo.ao/publicidade` e normalização segura de uploads implementados em desenvolvimento. Migrações `008_ad_campaigns.sql` e `009_service_notifications_reports.sql` aplicadas no banco dev. Notificações/preferências/outbox e denúncias moderadas de Serviços implementadas e testadas; detalhes em `docs/service-notifications-reports.md`. A integração de Google Ads permanece dependente de identificadores e consentimento.

## Ordem de execução e aceitação

1. **Navegação e imagens.** Substituir a barra visível de categorias por setas anterior/seguinte, mantendo scroll por gesto, roda horizontal e teclado; setas só ativas quando há conteúdo. Rever 320/768/1440 px. Validar upload de JPEG/PNG/WebP por conteúdo e dimensões/píxeis, rejeitando ficheiros malformados/bombas de descompressão antes de persistir. Manter URLs e imagens antigas legíveis.
2. **Inventário publicitário transversal.** Reservar posições com nomes estáveis e dimensões responsivas em Produtos e Serviços: premium (topo), secundária (coluna/lateral ou entre secções) e terciária (após resultados). Distinguir anúncio com rótulo visível. Configurar campanha, anunciante, URL, imagem, datas, estado e destino de mercado/posição num painel administrativo; só mostrar campanhas aprovadas e dentro das datas. Sem anúncio, não deixar caixa vazia. Google Ads será um fornecedor configurável por posição quando existir conta/IDs e revisão de política; impedir HTML/JavaScript arbitrário fornecido por anunciantes. Evitar anúncios dentro de formulários, checkout, conversa e estados sensíveis.
3. **Serviços completos.** Notificações persistentes de pedido, proposta, aceitação, mensagem e conclusão, preferências e entrega assíncrona por outbox com idempotência. Denúncia de perfil, pedido e mensagem, fila de moderação, decisão auditada e exposição mínima de conversa ao moderador. Reforçar limites de leitura/proposta, fecho transacional da conversa e estados de erros.
4. **Produtos completos.** Consolidar denúncia/moderação existente, estados de pagamentos manuais, entrega, avaliações e equipa. Validar upload de logos/capas/anúncios com a mesma política. Completar sitemap e fluxos de suporte/recuperação. Não criar prova fictícia de pagamento ou confirmação automática.
5. **Operação pública.** Medir Core Web Vitals e p95 com dados representativos; ensaiar backup/restauro, SMTP de domínio, TLS/DNS, monitorização, retenção de anúncios e dados pessoais, acessibilidade WCAG e dispositivos reais. Sem esses ensaios, “pleno funcionamento” significa desenvolvimento local, não lançamento público.

## Contratos e riscos

- Espaços publicitários são do produto inteiro, com `marketplace_slug` e `placement`. Servidor resolve campanha elegível e devolve só campos públicos. Administração exige papel de administrador, grava auditoria e não aceita markup livre.
- A unidade responsiva AdSense precisa de `data-ad-client` e `data-ad-slot` fornecidos pelo titular da conta; a [documentação oficial do Google](https://support.google.com/adsense/answer/9183363?hl=en) descreve os parâmetros e modificações permitidas. Não inventar IDs nem carregar o script antes da decisão de consentimento.
- Campanhas devem ter estado rascunho/aprovado/pausado, orçamento e faturação tratados fora do inventário técnico enquanto o modelo comercial não estiver aprovado. Cliques/impressões exigem consentimento e política de privacidade adequada; primeira versão pode publicar e medir apenas via ferramentas autorizadas.
- Upload: limite 5 MB atual; acrescentar limite de resolução e descodificação segura. Mudança de dependência de processamento de imagem exigirá reconstrução **única** da imagem API; edições normais depois continuam no watcher.
- E2E deve cobrir posição publicitária elegível/vazia e isolamento administrativo, scroll por setas, upload válido/inválido, notificações sem duplicados, denúncias privadas e percursos já existentes dos dois mercados.

## Critério de conclusão

Produtos: comprador consegue descobrir, encomendar, reportar transferência, receber e avaliar; vendedor consegue gerir loja/equipa/anúncio/encomenda; moderação e denúncia funcionam. Serviços: profissional publica perfil, recebe e gere pedidos, cliente compara/aceita/conclui/avalia; notificações e denúncias funcionam. Ambos: imagens seguras, publicidade rotulada nos três níveis, responsividade e autorização negativa testadas. Para produção, gates operacionais do ponto 5 aprovados.
