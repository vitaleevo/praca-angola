-- 023: OAuth state, stable external identities and a source connection per external conversation.
CREATE TABLE IF NOT EXISTS crm_meta_oauth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state_hash TEXT NOT NULL UNIQUE,
  access_token_ciphertext TEXT,
  accounts_ciphertext TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  authorized_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_meta_oauth_attempts_active
  ON crm_meta_oauth_attempts (user_id, expires_at DESC) WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS crm_contact_external_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('facebook_messenger', 'instagram_dm')),
  external_user_id TEXT NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, channel, external_user_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_external_identity_contact
  ON crm_contact_external_identities (contact_id);

ALTER TABLE crm_contacts DROP CONSTRAINT IF EXISTS crm_contacts_origin_channel_check;
ALTER TABLE crm_contacts ADD CONSTRAINT crm_contacts_origin_channel_check
  CHECK (origin_channel IN ('facebook_lead', 'facebook', 'instagram', 'whatsapp', 'puvo_storefront', 'service_request', 'manual'));

ALTER TABLE crm_conversations
  ADD COLUMN IF NOT EXISTS channel_connection_id UUID REFERENCES crm_channel_connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_crm_conversations_connection
  ON crm_conversations (workspace_id, channel_connection_id, last_message_at DESC);
