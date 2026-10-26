-- =====================================================
-- 015: CRM Automations, Recommendations & Public Chatbot
-- =====================================================

-- ──────────────── CRM Automation Rules ────────────────
CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  trigger_event   VARCHAR(80) NOT NULL, -- 'new_lead', 'new_message_inbound', 'deal_stage_changed', 'contact_idle_days', 'new_deal'
  trigger_config  JSONB NOT NULL DEFAULT '{}',
  -- Conditions (AND logic)
  conditions      JSONB NOT NULL DEFAULT '[]',
  -- Actions to execute
  actions         JSONB NOT NULL DEFAULT '[]',
  -- e.g. [{type: 'auto_reply_ai', config: {}}, {type: 'move_deal_stage', config: {stage_id: '...'}}, {type: 'assign_to_user', config: {user_id: '...'}}]
  is_active       BOOLEAN NOT NULL DEFAULT true,
  priority        INT NOT NULL DEFAULT 100,
  execution_count INT NOT NULL DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_auto_rules_ws ON crm_automation_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crm_auto_rules_trigger ON crm_automation_rules(workspace_id, trigger_event, is_active);

-- ──────────────── Automation Execution Log ────────────────
CREATE TABLE IF NOT EXISTS crm_automation_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id    UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  rule_id         UUID NOT NULL REFERENCES crm_automation_rules(id) ON DELETE CASCADE,
  trigger_event   VARCHAR(80) NOT NULL,
  trigger_payload JSONB NOT NULL DEFAULT '{}',
  actions_executed JSONB NOT NULL DEFAULT '[]',
  status          VARCHAR(30) NOT NULL DEFAULT 'success', -- 'success', 'partial_failure', 'error'
  error_message   TEXT,
  duration_ms     INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_auto_logs_ws ON crm_automation_logs(workspace_id, created_at DESC);

-- ──────────────── Product Recommendations ────────────────
CREATE TABLE IF NOT EXISTS product_recommendations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id      VARCHAR(100), -- anonymous visitors
  listing_id      UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  score           FLOAT NOT NULL DEFAULT 0.0,
  algorithm       VARCHAR(50) NOT NULL DEFAULT 'collaborative', -- 'collaborative', 'content_based', 'trending', 'ai_personalized'
  reason          TEXT,
  was_clicked     BOOLEAN NOT NULL DEFAULT false,
  was_purchased   BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prod_rec_user ON product_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prod_rec_session ON product_recommendations(session_id, created_at DESC);

-- ──────────────── User Browsing History (for recommendation engine) ────────────────
CREATE TABLE IF NOT EXISTS user_browsing_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id      VARCHAR(100),
  listing_id      UUID REFERENCES listings(id) ON DELETE CASCADE,
  event_type      VARCHAR(30) NOT NULL, -- 'view', 'add_to_cart', 'purchase', 'wishlist', 'search'
  search_query    TEXT,
  category_slug   VARCHAR(120),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_browse_user ON user_browsing_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browse_session ON user_browsing_events(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_browse_listing ON user_browsing_events(listing_id);

-- ──────────────── Public Storefront Chatbot Sessions ────────────────
CREATE TABLE IF NOT EXISTS storefront_chat_sessions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_profile_id UUID NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  visitor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  visitor_session_id VARCHAR(100),
  visitor_name    VARCHAR(100),
  status          VARCHAR(30) NOT NULL DEFAULT 'active', -- 'active', 'closed', 'converted_to_lead'
  converted_contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  messages_count  INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_session_seller ON storefront_chat_sessions(seller_profile_id, status);

-- ──────────────── Public Chatbot Messages ────────────────
CREATE TABLE IF NOT EXISTS storefront_chat_messages (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES storefront_chat_sessions(id) ON DELETE CASCADE,
  role            VARCHAR(15) NOT NULL, -- 'visitor', 'ai', 'seller'
  content         TEXT NOT NULL,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_session ON storefront_chat_messages(session_id, created_at ASC);
