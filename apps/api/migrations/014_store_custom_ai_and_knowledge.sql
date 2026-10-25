-- 014_store_custom_ai_and_knowledge.sql
-- PUVO Multi-Provider AI Configuration and Knowledge Base per Store / Workspace

-- 1. Configuração do Provedor de IA da Loja
CREATE TABLE IF NOT EXISTS store_ai_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('gemini', 'openai', 'claude', 'openrouter', 'custom')),
  model_name TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
  api_key_ciphertext TEXT,
  custom_endpoint_url TEXT,
  system_instructions TEXT NOT NULL DEFAULT 'És o assistente virtual de vendas desta loja em Angola. Sê cordial, acolhedor, profissional e ajuda o cliente a tirar dúvidas, conhecer produtos e fechar encomendas com segurança.',
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id)
);

-- 2. Base de Conhecimento para alimentar e treinar a IA da Loja
CREATE TABLE IF NOT EXISTS store_ai_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('about_store', 'delivery_policy', 'payment_policy', 'faq', 'custom_doc')),
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_ai_knowledge_ws ON store_ai_knowledge(workspace_id, updated_at DESC);
