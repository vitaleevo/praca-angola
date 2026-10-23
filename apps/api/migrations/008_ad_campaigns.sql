CREATE TABLE ad_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 marketplace_slug text NOT NULL CHECK(marketplace_slug IN ('produtos','servicos')),
 placement text NOT NULL CHECK(placement IN ('premium','secondary','tertiary')),
 advertiser_name text NOT NULL CHECK(length(advertiser_name) BETWEEN 2 AND 100),
 headline text NOT NULL CHECK(length(headline) BETWEEN 4 AND 120),
 target_url text NOT NULL CHECK(length(target_url) BETWEEN 12 AND 2048 AND target_url ~ '^https://'),
 image_asset_id uuid NOT NULL REFERENCES media_assets(id),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','paused')),
 starts_at timestamptz NOT NULL,
 ends_at timestamptz NOT NULL,
 priority integer NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 100),
 created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at)
);
CREATE INDEX ad_campaigns_live_idx ON ad_campaigns(marketplace_slug,placement,priority DESC,starts_at DESC) WHERE status='approved';
CREATE INDEX ad_campaigns_image_idx ON ad_campaigns(image_asset_id);
