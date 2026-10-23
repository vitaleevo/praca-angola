ALTER TABLE seller_profiles
  ADD COLUMN IF NOT EXISTS logo_media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_media_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL;
