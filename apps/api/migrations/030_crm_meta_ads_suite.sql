-- 030_crm_meta_ads_suite.sql
-- Meta Ads creation, analytics and ecosystem-wide attribution for PUVO CRM

CREATE TABLE IF NOT EXISTS crm_meta_ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  objective TEXT NOT NULL CHECK (objective IN ('whatsapp_messages', 'instagram_direct', 'store_traffic', 'lead_generation')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  budget_type TEXT NOT NULL DEFAULT 'daily' CHECK (budget_type IN ('daily', 'lifetime')),
  budget_amount NUMERIC(14,2) NOT NULL DEFAULT 5000.00,
  budget_currency TEXT NOT NULL DEFAULT 'AOA' CHECK (budget_currency IN ('AOA', 'USD', 'EUR')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  target_locations TEXT[] NOT NULL DEFAULT '{"Luanda"}',
  target_interests TEXT[] NOT NULL DEFAULT '{}',
  target_age_min INTEGER NOT NULL DEFAULT 18,
  target_age_max INTEGER NOT NULL DEFAULT 65,
  target_gender TEXT NOT NULL DEFAULT 'all' CHECK (target_gender IN ('all', 'male', 'female')),
  headline TEXT NOT NULL,
  primary_text TEXT NOT NULL,
  call_to_action TEXT NOT NULL DEFAULT 'WHATSAPP_MESSAGE',
  destination_url TEXT,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  meta_ad_account_id TEXT,
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_meta_ads_workspace
  ON crm_meta_ad_campaigns (workspace_id, status, created_at DESC);

-- Analytics & performance snapshots for campaigns
CREATE TABLE IF NOT EXISTS crm_meta_ad_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES crm_meta_ad_campaigns(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  impressions INTEGER NOT NULL DEFAULT 0,
  reach INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend_amount NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  conversations_started INTEGER NOT NULL DEFAULT 0,
  leads_count INTEGER NOT NULL DEFAULT 0,
  deals_won_count INTEGER NOT NULL DEFAULT 0,
  revenue_generated_aoa NUMERIC(18,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_crm_meta_ad_metrics_campaign
  ON crm_meta_ad_metrics (campaign_id, snapshot_date DESC);

-- Attribution columns in contacts and deals
ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS meta_campaign_id UUID REFERENCES crm_meta_ad_campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS meta_ad_ref TEXT;

ALTER TABLE crm_deals
  ADD COLUMN IF NOT EXISTS meta_campaign_id UUID REFERENCES crm_meta_ad_campaigns(id) ON DELETE SET NULL;
