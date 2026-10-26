# Plano de consolidação — Produtos e Serviços

**Data:** 25/10/2026
**Estado de partida:** Produtos e Serviços são os dois marketplaces ativos. Os outros setores continuam em preparação.
**Objetivo:** concentrar a PUVO nos dois mercados existentes, melhorar a confiança e a conversão, comprovar a operação com dados reais e só então decidir a abertura de Empregos.

Este plano complementa [`plano-marketplaces-operacionais.md`](plano-marketplaces-operacionais.md), que já descreve os fluxos técnicos dos dois mercados. Não cria um calendário de lançamento público: os gates operacionais ainda precisam de evidência atualizada.

**Progresso da Fase 1:** implementada a prioridade visual de Produtos e Serviços na página inicial e no índice de mercados. Setores em preparação agora aparecem numa lista recolhida, sem cartões clicáveis. A revisão manual num preview isolado deste worktree cobriu `/marketplaces` em 1440, 768 e 320 px e a homepage em 320 px; os dois cartões continuam legíveis e sem transbordamento horizontal visível, e a lista de roadmap abre/fecha. Foi corrigida uma chave React que usava um `id` não devolvido pela API, substituindo-a pelo `slug` único. A stack antiga em `localhost:3100` continua ligada a outro checkout e não serve como preview destas alterações. O browser local também registou respostas 429 no endpoint de relatórios CSP report-only; acompanhar com a operação, sem alterar agora a política de segurança. Tipagem e lint direcionados passaram; não houve E2E nem medição Lighthouse.

## Decisão de foco

1. **Agora:** Produtos e Serviços.
2. **Próxima expansão candidata:** Empregos, inicialmente como piloto limitado e sujeito aos gates deste plano.
3. **Em espera:** os restantes setores não devem competir com os dois marketplaces ativos na navegação principal nem receber investimento de expansão antes da decisão sobre Empregos.

Na página de marketplaces, mostrar Produtos e Serviços como opções disponíveis. Setores futuros podem ficar numa área discreta de roadmap, sem parecerem funcionalidades utilizáveis. Não exibir contagens, avaliações, disponibilidade ou atividade que não venham de dados reais.

## Fases e gates

### Fase 1 — Foco e experiência coerente

- Rever homepage, menu, pesquisa e página de marketplaces para deixar claros os dois percursos: comprar/vender produtos e contratar/oferecer serviços.
- Usar navegação e componentes comuns onde os fluxos forem realmente iguais; conservar linguagem visual própria de Produtos e Serviços sem duplicar padrões sem necessidade.
- Garantir estados carregando, erro, vazio e sucesso em catálogo, filtros, perfil, anúncio, pedido e conta.
- Corrigir overflow, imagens quebradas, rótulos ambíguos e chamadas para ação concorrentes em 320, 768, 1440 px e ecrãs maiores.
- Fazer a navegação de categorias e páginas não disponíveis encaminhar para mercados ativos ou para informação explícita de roadmap.

**Gate:** uma pessoa consegue identificar em poucos segundos onde encontrar produtos e serviços; não encontra um setor “A preparar” que pareça funcional.

### Fase 2 — Qualidade dos dois percursos

**Produtos**

- Percorrer descoberta → detalhe → contacto/carrinho → encomenda → confirmação/entrega → avaliação.
- Verificar qualidade e moderação dos anúncios, stock, informação de loja, imagens, métodos manuais de pagamento, comunicação de estado e tratamento de denúncias.
- Rever abandono do carrinho e pesquisas sem resultados; melhorar primeiro os pontos com maior perda observada.

**Serviços**

- Percorrer diretório → perfil profissional → pedido → propostas → escolha → conversa → conclusão → avaliação.
- Verificar revisão de perfis, disponibilidade, notificações, privacidade das conversas, denúncias e tempo de resposta.
- Tornar clara a diferença entre pedido publicado e contratação concluída; pagamentos de serviços continuam combinados diretamente enquanto não houver integração própria.

**Gate:** cada percurso principal funciona ponta a ponta, com autorização correta, feedback visível e sem depender de dados fictícios.

### Fase 3 — Operação e medição

**Estado em 25/10/2026:** gates ainda abertos. Web/readiness foram verificadas; hardening P0 está em `main`; PITR e snapshots diários/semanais de PostgreSQL e media estão ativos, e o restauro PostgreSQL isolado comparou contagens iguais. A idade da outbox foi corrigida localmente e typecheck + suite unitária passaram, mas falta publicar. A chave SMTP atual respondeu 401 à API Resend. Railway não tem regras de notificação nem dashboards; restore de media/cópia independente, canal de alertas, CWV, WCAG e funil permanecem por fechar. O deployment Vercel mais recente do `main` aparece cancelado. Ver [`docs/operations/current-production-status.md`](operations/current-production-status.md). Não iniciar o piloto de Empregos até fechar estes gates.

- Fechar os itens de prontidão já registados no projeto: validar SMTP com uma conta de teste, rever o hardening P0 e a topologia de produção, ensaiar backup/restauro e configurar alertas operacionais.
- Instrumentar eventos mínimos e sem dados pessoais desnecessários: pesquisa, ausência de resultados, visualização de anúncio/perfil, início e conclusão de publicação, contacto, carrinho/encomenda e etapas do pedido de serviço.
- Criar um painel semanal separado por marketplace, província e dispositivo, com contagens deduplicadas e definições documentadas.
- Acompanhar erros, latência da API, falhas de publicação/upload, entregas da outbox e denúncias; definir responsáveis e procedimento de resposta.
- Medir Core Web Vitals no build de produção e executar auditoria de acessibilidade nos percursos críticos. A medição Lighthouse continua por fazer; não atribuir pontuação estimada como resultado medido.

**Indicadores de Produtos:** anúncios ativos com stock, pesquisas com resultados, visualização→contacto/carrinho, encomenda→conclusão, abandono e tempo até publicação.
**Indicadores de Serviços:** perfis ativos/revistos, pedidos com proposta, tempo até primeira proposta, proposta→aceitação, conclusão e denúncias.
**Indicadores comuns:** utilizadores ativos dos dois lados do mercado, retorno, falhas por etapa, p95 da API, LCP/CLS/INP e incidentes de confiança.

**Gate:** os eventos têm definições testadas, os dados distinguem Produtos de Serviços, os alertas têm responsável e os fluxos essenciais passaram por validação operacional. Primeiro recolher a linha de base; fixar metas de conversão depois de observar essa linha de base, não inventar metas sem dados.

### Fase 4 — Piloto de liquidez e confiança

- Escolher uma área geográfica inicial com base na capacidade real de apoio da equipa; concentrar recrutamento e divulgação nessa área antes de expandir cobertura.
- Em Produtos, recrutar vendedores com catálogo consistente, disponibilidade atualizada e política de entrega/pagamento explícita.
- Em Serviços, recrutar profissionais com perfis completos, categorias e áreas de atendimento corretas e disponibilidade real.
- Fazer revisão semanal de pesquisas sem resultados, anúncios incompletos, contactos sem resposta, pedidos sem propostas e denúncias. Corrigir o maior bloqueio de cada vez.
- Comunicar claramente que a PUVO aproxima as partes; não insinuar garantias de pagamento, verificação ou entrega além dos controlos que existem.

**Gate:** sinais de oferta e procura em ambos os lados melhoram durante o piloto, os principais bloqueios são conhecidos e os casos de fraude/abuso têm tratamento operacional. As metas numéricas devem ser definidas depois da linha de base, considerando o volume e a capacidade da equipa.

### Fase 5 — Decisão sobre Empregos

Só iniciar o piloto de Empregos depois de aprovados os gates das fases 1–4. Antes de construir, validar procura com empresas e candidatos, regras de publicação e capacidade de moderação. O piloto deve incluir verificação do anunciante, denúncia de vaga, expiração automática, prevenção de fraude e métricas de candidatura/contacto. Começar numa categoria e região, não abrir simultaneamente todos os setores.

**Go:** Produtos e Serviços operam com linha de base, suporte e moderação; há empresas dispostas a publicar vagas verificáveis e candidatos interessados; a equipa consegue tratar denúncias dentro do prazo definido.
**No-go:** falhas operacionais críticas persistem, os dois lados dos mercados atuais continuam sem liquidez suficiente, ou não há processo de verificação/moderação para vagas.

## Responsáveis sugeridos

| Frente | Responsável | Resultado |
| --- | --- | --- |
| Priorização e metas | Dono do produto | Definir linha de base, metas e decisão go/no-go |
| Oferta, suporte e moderação | Operações PUVO | Qualidade dos anúncios/perfis, atendimento e resposta a denúncias |
| Jornadas, acessibilidade e interface | Produto + Web | Navegação clara, estados completos e validação responsiva |
| Eventos, API, segurança e confiabilidade | Engenharia | Métricas minimizadas, autorização, performance e alertas |
| Piloto de Empregos | Produto + Operações | Validação de procura e processo antifraude antes do desenvolvimento |

## Riscos a controlar

- **Dispersão:** muitos setores visíveis antes de terem oferta e operação. Mitigação: só dois mercados ativos na navegação principal.
- **Pouca liquidez:** mais funcionalidades sem vendedores, profissionais, compradores ou clientes ativos. Mitigação: recrutamento e piloto concentrados numa área; medir ambos os lados.
- **Fraude e confiança:** transferências manuais em Produtos e vagas/serviços falsos. Mitigação: verificação proporcional, denúncias, moderação, limites e comunicação transparente.
- **Métricas enganosas:** contadores ou taxas sem eventos consistentes. Mitigação: dicionário de métricas e linha de base antes de estabelecer metas.
- **Lançamento prematuro:** SMTP, backups, alertas, acessibilidade e performance sem validação atual. Mitigação: gate operacional separado da conclusão visual/funcional.

## Próxima execução recomendada

Começar pela **Fase 1**: conferir a superfície pública e deixar Produtos e Serviços como as duas escolhas centrais. Em paralelo, fechar uma checklist de estado atual dos gates operacionais descritos na memória do projeto. Não iniciar Empregos até a equipa conseguir avaliar a liquidez e a qualidade dos dois mercados atuais com dados reais.
