# Plano Diretor de Inteligência Artificial e Python — PUVO

**Data:** 25 de Outubro de 2026  
**Projeto:** PUVO — Plataforma Única de Vendas Online (Angola)  
**Objetivo:** Integrar um subsistema modular em Python especializado em Inteligência Artificial para enriquecer a experiência de compra, venda, contratação e segurança da plataforma, mantendo o NestJS e o PostgreSQL como núcleo soberano das regras de negócio.

---

## 1. Princípios Arquiteturais e Diretrizes Fundamentais

1. **Desacoplamento Estrito (Kernel Soberano):**  
   O NestJS (`apps/api`) permanece como a única fonte da verdade para dados transacionais, sessões, pagamentos e autorização (`RolesGuard`). O subsistema Python atua como um motor de inteligência e inferência subordinado.
2. **Degradação Graciosa (Graceful Degradation):**  
   Se o serviço de IA estiver sobrecarregado, em manutenção ou fora do ar, **o marketplace não para**. O sistema recua automaticamente para os fluxos manuais e para a pesquisa SQL tradicional.
3. **Soberania de Custos e Infraestrutura Local:**  
   Arquitetura híbrida: modelos locais open-source leves (inferência rápida em CPU para tarefas de baixa latência e zero custo de API, como embeddings, hashing e OCR) combinados com APIs externas sob demanda (Gemini / Claude / OpenAI) apenas para geração de texto complexo.
4. **Isolamento de Rede:**  
   O novo contentor Python (`apps/ai-worker`) corre na rede Docker interna privada (`172.30.255.0/29` ou rede Docker interna do compose). Nenhuma porta de IA é exposta publicamente à Internet.

---

## 2. Topologia do Sistema

```
                                [ Browser / Cliente ]
                                          │
                            [ Caddy / NGINX Ingress ]
                                          │
                         ┌────────────────┴────────────────┐
                         ▼                                 ▼
                 [ apps/web ]                       [ apps/admin ]
               (Marketplace Web)                   (Consola Gestão)
                         │                                 │
                         └────────────────┬────────────────┘
                                          ▼
                                   [ apps/api ]
                               (NestJS 12 Gateway)
                                    │        │
               ┌────────────────────┘        └────────────────────┐
               ▼ (Síncrono/Assíncrono)                            ▼ (SQL)
    [ apps/ai-worker ]                                  [ PostgreSQL 18 ]
    - Python 3.12 + FastAPI                             - Extensão pgvector
    - Celery / Task Queue                               - Tabelas do Marketplace
    - PyTorch / ONNX Runtime                            - Embeddings vetoriais
               │                                                  │
               └─────────────── [ Redis 8 ] ──────────────────────┘
                              (Filas de IA & Cache)
```

---

## 3. Os 5 Módulos de Inteligência Artificial

### Módulo I — Assistente de Criação de Anúncios e Serviços (Smart Catalog)
* **Objetivo:** Facilitar a entrada de vendedores informais e profissionais com baixo letramento digital em Angola.
* **Componentes:**
  - **Visão Computacional:** Extração de vetor visual e etiquetagem automática a partir das fotos do produto (ex: tipo de produto, cor, estado aparente).
  - **Geração de Conteúdo:** Elaboração de títulos atrativos para SEO, descrição detalhada e seleção automática da categoria correta do PUVO.
  - **Sugestão de Preço Inteligente:** Comparação com a base histórica de anúncios ativos em Kwanzas (Kz) na mesma província/município, sugerindo preço mínimo, médio e competitivo.
* **Fluxo Técnico:**
  1. Frontend envia imagem temporária via `POST /api/v1/media/ai-assist`.
  2. NestJS chama `POST http://ai-worker:8000/v1/catalog/suggest`.
  3. Python descodifica a imagem, extrai características e chama o pipeline LLM com prompt calibrado para a realidade angolana.
  4. Devolve JSON estruturado: `{ title, description, category_slug, condition, suggested_price_aoa }`.
  5. Vendedor revê e aceita com um único clique.

---

### Módulo II — Motor de Moderação Automática e Confiança (Trust & Safety Engine)
* **Objetivo:** Eliminar pornografia, burlas, armas, produtos ilegais e anúncios repetidos antes de chegarem à fila dos moderadores humanos.
* **Componentes:**
  - **Análise Visual de Risco (NSFW & Violência):** Classificador local leve (ONNX / MobileNet) com pontuação de 0 a 100.
  - **Perceptual Hashing (Anti-Spam / Anti-Duplicação):** Cálculo de pHash/dHash para identificar vendedores que sobem repetidamente o mesmo anúncio com contas diferentes.
  - **Classificador de Texto e Burla:** Deteção de palavras-chave de risco, números de WhatsApp ocultos em imagens ou tentativas de desvio de pagamento para fora da plataforma.
* **Fluxo Técnico:**
  1. Na submissão do anúncio (`POST /seller/listings`), a API marca o anúncio com `status = 'pending_review'`.
  2. Um job é enfileirado no Redis: `ai:moderation:listing`.
  3. O worker Python analisa imagens e textos em menos de 1.5s:
     - **Score < 10:** Auto-aprovação imediata (se a política permitir) ou pré-aprovação recomendada.
     - **Score > 80:** Rejeição automática preventiva com gravação do motivo em `moderation_actions`.
     - **Score intermediário:** Encaminhado para a fila prioritária do moderador humano em `https://gestao.puvo.vitaleevo.ao/moderacao` com as tags de alerta já destacadas.

---

### Módulo III — Inspetor Anti-Fraude de Comprovativos MCX e Bancários
* **Objetivo:** Proteger os vendedores contra comprovativos falsos (editados no telemóvel) ou comprovativos reais reutilizados em compras diferentes.
* **Componentes:**
  - **OCR Estruturado (Optical Character Recognition):** PaddleOCR ou EasyOCR otimizado para os recibos do Multicaixa Express (MCX), BAI Directo, BFA Net, Atlântico Directo e outros bancos angolanos.
  - **Extração Forense de Metadados:** Verificação de manipulação em PDFs ou inconsistências de fontes e compressão JPEG nos valores/datas.
  - **Cruzamento Transacional de Base de Dados:**
    - O número de operação/transação já foi submetido em qualquer outra encomenda anterior?
    - O valor extraído do comprovativo coincide com o `total_amount` da encomenda?
    - A data/hora do comprovativo é posterior à criação da encomenda?
* **Fluxo Técnico:**
  1. Comprador anexa o comprovativo no checkout manual.
  2. Worker Python processa o documento e gera um `FraudRiskReport`:
     ```json
     {
       "confidence_score": 96,
       "extracted_amount": 125000.00,
       "transaction_id": "MCX-20261024-98432",
       "bank_detected": "Multicaixa Express",
       "duplicate_detected": false,
       "tampering_signs": false,
       "verdict": "LOW_RISK"
     }
     ```
  3. No painel do vendedor (`/vendedor/encomendas/[id]`), surge um selo:  
     🟢 *Comprovativo consistente (Transação confirmável)* ou 🔴 *Alerta de inconsistência de valor/data*.
  4. O vendedor continua a confirmar no seu extrato, mas agora com triagem de risco prévia.

---

### Módulo IV — Busca Semântica Cultural e Busca por Imagem (pgvector)
* **Objetivo:** Permitir ao utilizador encontrar exatamente o que precisa, mesmo sem saber os termos técnicos, compreendendo expressões locais de Angola.
* **Componentes:**
  - **Embeddings Vetoriais:** Modelo sentence-transformers multilíngue gerando vetores de 384 ou 768 dimensões.
  - **Extensão PostgreSQL `pgvector`:** Armazenamento dos vetores diretamente na base de dados já existente.
  - **Busca Híbrida:** Combinação da busca clássica textual (`tsvector` em português) com busca por proximidade de cosseno (`<=>`).
  - **Busca por Imagem:** Comprador envia uma foto de uma peça de roupa ou eletrónico e o sistema encontra produtos visualmente semelhantes no catálogo.
* **Fluxo Técnico:**
  1. Migração SQL `013_pgvector_search.sql` cria coluna `embedding vector(384)` em `listings` e `professional_profiles`.
  2. Ao publicar anúncio, o worker gera e grava o vetor do anúncio.
  3. Na pesquisa do visitante: a query do utilizador (ex: *"sapato para festa tradicional"*) é convertida num vetor pelo AI Worker e o PostgreSQL executa uma pesquisa vetorial por proximidade em milissegundos.

---

### Módulo V — Smart Matcher de Serviços (Correspondência Inteligente)
* **Objetivo:** Reduzir o tempo que um cliente espera até receber propostas competitivas de profissionais qualificados.
* **Componentes:**
  - **Algoritmo de Correspondência Multivariável:**
    $$\text{Score} = w_1 \cdot \text{Proximidade Geográfica} + w_2 \cdot \text{Afinidade de Categoria} + w_3 \cdot \text{Reputação/Reviews} + w_4 \cdot \text{Tempo Médio de Resposta}$$
  - **Notificações Proativas Personalizadas:** Quando um cliente cria um pedido geral ou dirigido, o sistema identifica os top 5 profissionais ideais e envia um alerta prioritário.

---

## 4. Estrutura de Código no Monorepo

```
Mercado Angolano/
├── apps/
│   ├── api/                    # NestJS (existente)
│   ├── web/                    # Next.js Marketplace (existente)
│   ├── admin/                  # Next.js Consola Gestão (conforme planeado)
│   └── ai-worker/              # [NOVO] Microserviço Python
│       ├── Dockerfile
│       ├── pyproject.toml / requirements.txt
│       ├── src/
│       │   ├── main.py         # Servidor FastAPI
│       │   ├── config.py       # Variáveis de ambiente
│       │   ├── modules/
│       │   │   ├── catalog/    # Gerador de anúncios e títulos
│       │   │   ├── moderation/ # Visão computacional e anti-spam
│       │   │   ├── fraud/      # OCR de comprovativos bancários
│       │   │   ├── search/     # Embeddings e pesquisa vetorial
│       │   │   └── matching/   # Algoritmo de afinidade de serviços
│       │   └── tasks/          # Workers Celery/ARQ para jobs assíncronos
│       └── tests/              # Testes unitários do worker
├── packages/
│   └── ai-contracts/           # Tipos partilhados e esquemas de dados DTO
```

---

## 5. Roteiro de Execução Faseado (Roadmap)

### Fase 1 — Fundação do Serviço Python e Infraestrutura (Semana 1)
- [ ] Criar a pasta `apps/ai-worker` com ambiente virtual Python 3.12 e FastAPI.
- [ ] Adicionar o contentor `ai-worker` ao [`docker-compose.yml`](file:///c:/Users/alexa/Videos/Mercado%20Angolano/docker-compose.yml) e [`compose.dev.yml`](file:///c:/Users/alexa/Videos/Mercado%20Angolano/compose.dev.yml) na rede interna.
- [ ] Implementar endpoint de healthcheck `GET /health` e autenticação interna por token secreto (`AI_INTERNAL_SECRET`).
- [ ] Criar no NestJS o serviço cliente `AiServiceClient` para disparar chamadas síncronas com timeout seguro.

### Fase 2 — Moderação Automática de Conteúdo (Semana 2)
- [ ] Integrar modelo local leve de classificação de imagens (NSFW / armas / texto ilícito).
- [ ] Conectar o pipeline no endpoint de upload de imagens e na submissão de anúncios da API.
- [ ] Alimentar os scores de risco na fila da equipa em `https://gestao.puvo.vitaleevo.ao/moderacao`.
- [ ] Criar testes automatizados para verificar rejeição de fixtures de teste maliciosas.

### Fase 3 — Assistente de Criação de Anúncios no Frontend (Semana 3)
- [ ] Desenvolver no Python a rota de sugestão automática de anúncio via multimodalidade.
- [ ] Adicionar na tela de criação de anúncios ([`apps/web/src/app/vendedor/anuncios/novo`](file:///c:/Users/alexa/Videos/Mercado%20Angolano/apps/web/src/app/vendedor/anuncios/novo)) o botão:  
  ✨ *«Preencher com IA a partir das fotos»*.
- [ ] Validar tempo de resposta (< 2.5s) e limites de custo/quota por vendedor.

### Fase 4 — Extensão `pgvector` e Busca Semântica (Semana 4)
- [ ] Criar migração SQL `013_pgvector_search.sql` habilitando `CREATE EXTENSION IF NOT EXISTS vector;`.
- [ ] Criar tabela e colunas de embeddings para produtos e serviços.
- [ ] Integrar no catálogo de produtos e serviços a busca híbrida (Texto + Proximidade Vetorial).
- [ ] Ajustar termos culturais e regionais para Angola.

### Fase 5 — OCR e Análise Forense de Comprovativos MCX/Bancários (Semana 5)
- [ ] Implementar o motor de OCR em Python com parsing de comprovativos dos principais bancos angolanos (BAI, BFA, BIC, BCI, MCX).
- [ ] Criar tabela de auditoria de transações financeiras para cruzar códigos de operação e detetar duplicados.
- [ ] Adicionar badges de validação visual de pagamento na visualização de encomendas do vendedor.

### Fase 6 — Smart Matcher de Serviços e Ajuste Operacional (Semana 6)
- [ ] Implementar algoritmo de ranking de serviços no matching de pedidos de orçamento.
- [ ] Otimizar uso de CPU/RAM em produção (quantização de modelos com ONNX Runtime para rodar em VPS padrão de 4 vCPUs e 8GB RAM).
- [ ] Criar métricas de observabilidade de IA em Prometheus/Sentry (latência de inferência, taxa de acerto de OCR, falsos positivos de moderação).

---

## 6. Recursos de Hardware e Viabilidade em VPS

* **Execução em VPS sem GPU dedicada:**  
  Utilizando modelos quantizados em formato **ONNX** e arquiteturas eficientes (como *MobileNetV3*, *MiniLM-L6-v2* e *PaddleOCR Mobile*), o consumo de memória RAM do worker Python mantém-se entre **1.2 GB e 2.0 GB**, operando com tempos de resposta de 100ms a 400ms em CPU moderna (Intel Xeon / AMD EPYC comuns em VPS da Hetzner, Contabo ou DigitalOcean).
* **Consumo de APIs externas:**  
  Apenas a geração de texto criativo/título utiliza chamadas de LLM (ex: Gemini Flash), com custo de frações de centavos por anúncio e fallback offline caso a quota termine.
