# Manual Diretor de Implementação — CRM Omnichannel e Vendas PUVO

**Data:** 25 de Outubro de 2026  
**Versão:** 1.0 — Especificação Completa para Implementação  
**Ambiente:** PUVO Monorepo (Next.js 16 + NestJS 12 + PostgreSQL 18 + Redis 8)

---

## 1. Visão Geral da Arquitetura do CRM

O CRM da PUVO é uma solução **Multi-Tenant Embutida**:
- **Cada loja (`seller_profile_id`), profissional (`professional_profile_id`) ou empresa** recebe um `crm_workspace` isolado.
- Os vendedores realizam o atendimento completo e fecham negócios por **WhatsApp, Instagram Direct e Chat da PUVO** sem nunca sair da plataforma.
- A ingestão de leads de campanhas do **Facebook Lead Ads** e **Instagram Ads** alimenta automaticamente o funil de vendas em tempo real.
- O sistema comunica bidirecionalmente com os clientes via WebSockets e gateways de API.

```
                    [ Facebook / Instagram / WhatsApp ]
                                     │
                                     ▼ (Webhooks HTTPS)
           ┌─────────────────────────────────────────────────────┐
           │   apps/api — CrmWebhooksController (/webhooks/*)    │
           │   - Validação de assinatura HMAC da Meta            │
           │   - Identificação do Workspace da Loja              │
           └─────────────────────────┬───────────────────────────┘
                                     │
                                     ▼
           ┌─────────────────────────────────────────────────────┐
           │        PostgreSQL 18 — Schema 014 CRM               │
           │   - crm_contacts, crm_deals, crm_messages           │
           └─────────────────────────┬───────────────────────────┘
                                     │
                                     ▼ (WebSockets / Redis PubSub)
           ┌─────────────────────────────────────────────────────┐
           │   apps/web — /vendedor/crm/conversas (Live Inbox)   │
           │   - Chat em tempo real (Texto, Áudio, Fotos, PDFs)  │
           │   - 1-Clique para enviar Produto do Catálogo        │
           │   - 1-Clique para enviar Dados MCX / IBAN           │
           │   - Mudança imediata de fase no Kanban              │
           └─────────────────────────────────────────────────────┘
```

---

## 2. Especificação da Base de Dados (`apps/api/migrations/014_crm_multitenant_complete.sql`)

```sql
-- 1. Espaços de Trabalho de CRM (1 por Loja ou Profissional)
CREATE TABLE IF NOT EXISTS crm_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_profile_id UUID REFERENCES seller_profiles(id) ON DELETE CASCADE,
  professional_profile_id UUID REFERENCES professional_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{"lead_distribution": "manual", "auto_welcome_message": true}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_workspace_owner_check CHECK (
    (seller_profile_id IS NOT NULL AND professional_profile_id IS NULL) OR
    (seller_profile_id IS NULL AND professional_profile_id IS NOT NULL)
  ),
  CONSTRAINT crm_workspace_seller_unique UNIQUE (seller_profile_id),
  CONSTRAINT crm_workspace_pro_unique UNIQUE (professional_profile_id)
);

-- 2. Conexões de Canais (WhatsApp, Facebook, Instagram)
CREATE TABLE IF NOT EXISTS crm_channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('facebook_page', 'instagram_direct', 'whatsapp_cloud', 'whatsapp_instance')),
  external_account_id TEXT NOT NULL, -- page_id, waba_id ou phone_number_id
  account_name TEXT NOT NULL,
  credentials_ciphertext TEXT NOT NULL, -- Tokens e chaves cifradas com APP_ENCRYPTION_KEY
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'expired')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel_type, external_account_id)
);

-- 3. Pipelines (Funis) e Etapas Customizáveis
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#2563eb',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, slug)
);

-- 4. Base de Contactos / Leads Omnichannel
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  origin_channel TEXT NOT NULL CHECK (origin_channel IN ('facebook_lead', 'instagram', 'whatsapp', 'puvo_storefront', 'service_request', 'manual')),
  instagram_username TEXT,
  province TEXT,
  municipality TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Oportunidades de Venda (Cards do Kanban)
CREATE TABLE IF NOT EXISTS crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  value_aoa NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  service_request_id UUID REFERENCES service_requests(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'won', 'lost')),
  lost_reason TEXT,
  expected_close_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Histórico de Conversas e Mensagens Bidirecionais
CREATE TABLE IF NOT EXISTS crm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram_dm', 'facebook_messenger', 'puvo_chat')),
  external_thread_id TEXT, -- WhatsApp chat JID ou Instagram thread_id
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unread_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, contact_id, channel)
);

CREATE TABLE IF NOT EXISTS crm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES crm_conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'document', 'catalog_product', 'payment_request')),
  content TEXT NOT NULL,
  media_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb, -- Dados extras (ex: ID do produto, valor MCX)
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed')),
  sent_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_by_ai BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Automações de Venda e Follow-up
CREATE TABLE IF NOT EXISTS crm_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL CHECK (trigger_event IN ('lead_created', 'stage_changed', 'inactive_24h', 'inactive_48h', 'order_created')),
  action_type TEXT NOT NULL CHECK (action_type IN ('send_whatsapp', 'assign_agent', 'move_stage', 'alert_team')),
  action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices de Alta Performance
CREATE INDEX IF NOT EXISTS idx_crm_contacts_workspace ON crm_contacts(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_deals_workspace_stage ON crm_deals(workspace_id, stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_conversations_workspace ON crm_conversations(workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_messages_convo ON crm_messages(conversation_id, created_at ASC);
```

---

## 3. Endpoints da API REST e WebSockets (`apps/api`)

### A. Gateway de Webhooks da Meta (`CrmWebhooksController`)
- **`GET /api/v1/crm/webhooks/meta`**: Validação de desafio (*hub.challenge*) exigida pela Meta para ativação de Webhooks.
- **`POST /api/v1/crm/webhooks/meta`**: Recebe leads do Facebook Ads e mensagens de Instagram/WhatsApp:
  1. Valida a assinatura `X-Hub-Signature-256` usando a chave secreta da aplicação Meta.
  2. Identifica o `page_id` ou `phone_number_id` no payload.
  3. Consulta `crm_channel_connections` para descobrir o `workspace_id` da loja proprietária.
  4. Insere o lead em `crm_contacts`, abre o negócio em `crm_deals` e emite evento WebSocket.

### B. Gateway de WhatsApp por QR Code (`CrmWhatsAppController`)
- **`POST /api/v1/crm/channels/whatsapp/connect`**: Solicita a criação de uma instância no gateway Docker (`Evolution API`). Devolve o QR Code em base64.
- **`GET /api/v1/crm/channels/whatsapp/status`**: Consulta se o vendedor concluiu a leitura do QR Code no telemóvel.

### C. Live Inbox e Mensagens (`CrmChatController`)
- **`GET /api/v1/crm/conversations`**: Lista todas as conversas da loja ativa, ordenadas pela mais recente, com número de mensagens por ler.
- **`GET /api/v1/crm/conversations/:id/messages`**: Histórico completo da conversa (texto, áudio, fotos, PDFs).
- **`POST /api/v1/crm/conversations/:id/send`**: Vendedor envia resposta de texto ou áudio. A API dispara a mensagem diretamente para o WhatsApp do cliente.
- **`POST /api/v1/crm/conversations/:id/send-product`**: Envia o cartão formatado com foto, título e preço em Kwanzas de um produto do catálogo.
- **`POST /api/v1/crm/conversations/:id/send-payment`**: Envia os dados de pagamento (Multicaixa Express e IBAN) configurados na loja.

### D. Funil de Vendas Kanban (`CrmPipelinesController`)
- **`GET /api/v1/crm/pipelines/default`**: Retorna as colunas do funil e todos os cartões de negócios associados com valor em Kwanzas.
- **`PATCH /api/v1/crm/deals/:id/stage`**: Atualiza a fase do lead quando o vendedor arrasta o cartão no ecrã.

### E. WebSockets em Tempo Real (`CrmEventsGateway`)
- Permite que o ecrã do vendedor toque um aviso sonoro e mostre a mensagem recebida no instante exato em que o cliente escreve no WhatsApp, sem precisar de recarregar a página (*F5*).

---

## 4. Estrutura de Telas e Componentes no Frontend (`apps/web`)

### Telas a Criar:
1. **`/vendedor/crm` (Dashboard do Funil Kanban)**:
   - Resumo: Total de Leads, Valor em Negociação (Kz), Vendas Fechadas e Taxa de Conversão.
   - Quadro Kanban responsivo com colunas: *Novo Lead*, *Em Contacto*, *Orçamento*, *Aguarda Pagamento*, *Vendido*, *Perdido*.
2. **`/vendedor/crm/conversas` (Live Inbox Omnichannel)**:
   - Coluna 1: Lista de clientes com fotos de perfil, canal (ícone WhatsApp/Instagram) e badge de mensagens não lidas.
   - Coluna 2: Chat ativo com player de áudios, envio de anexos e botões de atalho rápido.
   - Coluna 3: Painel lateral com dados do cliente, botão de criar encomenda e seletor da fase do funil.
3. **`/vendedor/crm/conexoes` (Gestão de Canais)**:
   - Botão para conectar Página de Facebook / Instagram.
   - Ecrã de QR Code para ligar o WhatsApp da loja.
4. **`/vendedor/crm/automacoes`**:
   - Ativação de mensagens de boas-vindas e lembretes automáticos após 24 horas.

---

## 5. Roteiro de Implementação Passo a Passo (Checklist)

### Etapa 1: Estrutura de Banco e Modelo de Dados
- [ ] Criar o ficheiro `apps/api/migrations/014_crm_multitenant_complete.sql` com o SQL acima.
- [ ] Aplicar no PostgreSQL local: `docker compose exec api pnpm --filter @puvo/api db:migrate`.
- [ ] Garantir que o seed de desenvolvimento cria um workspace padrão para a loja `demo@puvo.local`.

### Etapa 2: Módulo CRM no Backend NestJS
- [ ] Criar o módulo `apps/api/src/crm/crm.module.ts`.
- [ ] Criar os controllers `crm-pipelines.controller.ts`, `crm-chat.controller.ts` e `crm-webhooks.controller.ts`.
- [ ] Implementar a encriptação de credenciais de canais utilizando a `APP_ENCRYPTION_KEY` já configurada na API.
- [ ] Criar o gateway de WebSockets `@WebSocketGateway({ namespace: '/crm' })`.

### Etapa 3: Telas no Frontend (Next.js)
- [ ] Adicionar o link **CRM & Mensagens** na sidebar já existente do vendedor ([`apps/web/src/components/workspace-navigation.tsx`](file:///c:/Users/alexa/Videos/Mercado%20Angolano/apps/web/src/components/workspace-navigation.tsx)).
- [ ] Criar o componente `CrmKanbanBoard` com drag-and-drop.
- [ ] Criar o componente `CrmLiveInbox` com feed de mensagens e atalhos de catálogo/pagamento.

### Etapa 4: Integração de Webhooks da Meta e Gateway WhatsApp
- [ ] Configurar no Docker Compose o serviço de gateway de instâncias WhatsApp (*Evolution API / Baileys*).
- [ ] Registar a rota pública de webhook no Caddy/NGINX: `/api/v1/crm/webhooks/meta`.
- [ ] Testar a entrada de um formulário simulado do Facebook e verificar o cartão a ser criado automaticamente no Kanban.

### Etapa 5: Automações e Lembretes de Venda
- [ ] Implementar cron job interno (ou worker Redis) que executa a cada 10 minutos para verificar leads sem resposta há mais de 24h e disparar o template de follow-up no WhatsApp.
- [ ] Testar envio de comprovativo e link direto de pagamento MCX no chat.

---

## 6. Critérios de Aceite e Testes Automatizados

1. **Isolamento Absoluto:** Um vendedor autenticado na Loja A não consegue ler contactos nem conversas da Loja B (teste com resposta HTTP `403 Forbidden`).
2. **Tempo Real:** Uma mensagem recebida via webhook do WhatsApp reflete-se na Live Inbox da Web em menos de 500 milissegundos.
3. **Persistência Forense:** Todos os envios e receções gravam data/hora, canal de origem e utilizador que realizou o disparo.
4. **Sem Perda de Dados:** Se a ligação do vendedor cair, as mensagens continuam a ser gravadas no banco e o contador de não lidas é atualizado.
