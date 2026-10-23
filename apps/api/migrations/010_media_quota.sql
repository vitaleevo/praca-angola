ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS media_assets_owner_active_idx
  ON media_assets(owner_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
