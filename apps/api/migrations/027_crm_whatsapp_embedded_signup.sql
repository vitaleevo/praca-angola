-- Each WhatsApp Embedded Signup code belongs to one signed-in user and CRM workspace.
CREATE TABLE IF NOT EXISTS crm_whatsapp_signup_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_whatsapp_signup_attempts_active
  ON crm_whatsapp_signup_attempts (user_id, expires_at DESC) WHERE completed_at IS NULL;

ALTER TABLE crm_channel_connections ADD COLUMN IF NOT EXISTS meta_waba_id TEXT;
ALTER TABLE crm_channel_connections ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_crm_channel_meta_waba_id ON crm_channel_connections (meta_waba_id)
  WHERE channel_type = 'whatsapp_cloud' AND status = 'connected';

CREATE TABLE IF NOT EXISTS crm_whatsapp_history_media (
  phone_number_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (phone_number_id, message_id)
);

CREATE TABLE IF NOT EXISTS crm_whatsapp_sync_requests (
  channel_connection_id UUID PRIMARY KEY REFERENCES crm_channel_connections(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacts_requested_at TIMESTAMPTZ,
  history_requested_at TIMESTAMPTZ,
  history_progress SMALLINT CHECK (history_progress BETWEEN 0 AND 100),
  history_declined BOOLEAN NOT NULL DEFAULT false
);
