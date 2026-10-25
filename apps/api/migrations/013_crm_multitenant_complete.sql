-- 013_crm_multitenant_complete.sql
-- PUVO Multitenant CRM for Sellers, Professionals, and Companies

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
  external_account_id TEXT NOT NULL,
  account_name TEXT NOT NULL,
  credentials_ciphertext TEXT NOT NULL,
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
  external_thread_id TEXT,
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
  metadata JSONB DEFAULT '{}'::jsonb,
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
