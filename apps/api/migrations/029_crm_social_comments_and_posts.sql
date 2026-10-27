-- 029_crm_social_comments_and_posts.sql
-- Comments read/reply status tracking and Meta Business style post publishing & scheduling

CREATE TABLE IF NOT EXISTS crm_social_comment_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES crm_channel_connections(id) ON DELETE CASCADE,
  comment_external_id TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_replied BOOLEAN NOT NULL DEFAULT false,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, comment_external_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_social_comment_interactions_lookup
  ON crm_social_comment_interactions (workspace_id, channel_id, is_read, is_replied);

CREATE TABLE IF NOT EXISTS crm_social_scheduled_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES crm_workspaces(id) ON DELETE CASCADE,
  channel_ids UUID[] NOT NULL DEFAULT '{}',
  post_type TEXT NOT NULL DEFAULT 'post' CHECK (post_type IN ('post', 'reel', 'story')),
  content TEXT NOT NULL,
  media_urls TEXT[] NOT NULL DEFAULT '{}',
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  scheduled_for TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  published_at TIMESTAMPTZ,
  meta_post_ids JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_scheduled_posts_queue
  ON crm_social_scheduled_posts (status, scheduled_for ASC)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS idx_crm_scheduled_posts_workspace
  ON crm_social_scheduled_posts (workspace_id, created_at DESC);
