-- Read-only Meta Ads access granted by the shop owner through Facebook Login.
CREATE TABLE IF NOT EXISTS crm_meta_ad_connections (
  workspace_id UUID PRIMARY KEY REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  authorized_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token_ciphertext TEXT NOT NULL,
  token_expires_at TIMESTAMPTZ,
  selected_ad_account_id TEXT,
  selected_ad_account_name TEXT,
  selected_currency TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT crm_meta_ad_account_id_format CHECK (selected_ad_account_id IS NULL OR selected_ad_account_id ~ '^act_[0-9]{5,30}$')
);
