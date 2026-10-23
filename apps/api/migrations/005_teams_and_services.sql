ALTER TABLE sessions ADD COLUMN active_store_id uuid REFERENCES seller_profiles(id) ON DELETE SET NULL;
CREATE TABLE store_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_profile_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email) AND length(email) <= 254),
  role text NOT NULL CHECK (role IN ('editor','support')),
  token_hash char(64) NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at timestamptz, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX store_invitations_store_idx ON store_invitations(seller_profile_id,created_at DESC);
CREATE UNIQUE INDEX store_invitations_pending_email_idx ON store_invitations(seller_profile_id,email) WHERE accepted_at IS NULL AND revoked_at IS NULL;

INSERT INTO categories (marketplace_id,name,slug,sort_order)
SELECT m.id, c.name, c.slug, c.position FROM marketplaces m CROSS JOIN (VALUES
 ('Design gráfico','design-grafico',1),('Desenvolvimento web','desenvolvimento-web',2),
 ('Electricidade','electricidade',3),('Canalização','canalizacao',4),('Limpeza','limpeza',5),
 ('Fotografia','fotografia',6),('Marketing digital','marketing-digital',7),
 ('Construção','construcao',8),('Consultoria','consultoria',9),('Transporte','transporte',10)
) AS c(name,slug,position) WHERE m.slug = 'servicos' ON CONFLICT DO NOTHING;

CREATE TABLE professional_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL UNIQUE REFERENCES users(id),
 slug text NOT NULL UNIQUE, display_name text NOT NULL CHECK(length(display_name) BETWEEN 2 AND 100),
 headline text NOT NULL CHECK(length(headline) BETWEEN 4 AND 140),
 bio text NOT NULL CHECK(length(bio) BETWEEN 20 AND 5000),
 category_id uuid NOT NULL REFERENCES categories(id),
 provider_type text NOT NULL CHECK(provider_type IN ('individual','company')),
 province text NOT NULL CHECK(length(province) BETWEEN 2 AND 100),
 municipality text NOT NULL CHECK(length(municipality) BETWEEN 2 AND 100),
 work_mode text NOT NULL CHECK(work_mode IN ('online','onsite','both')),
 starting_price numeric(18,2) NOT NULL CHECK(starting_price >= 0),
 years_experience integer NOT NULL CHECK(years_experience BETWEEN 0 AND 80),
 availability text NOT NULL CHECK(availability IN ('available','this_week','unavailable')),
 specialties text NOT NULL DEFAULT '' CHECK(length(specialties) <= 500),
 contact_phone text CHECK(contact_phone ~ '^(\+244)?9[0-9]{8}$'),
 photo_asset_id uuid REFERENCES media_assets(id) ON DELETE SET NULL,
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review','published','rejected','paused','suspended')),
 moderation_note text NOT NULL DEFAULT '' CHECK(length(moderation_note) <= 2000),
 is_verified boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX professional_profiles_catalog_idx ON professional_profiles(category_id,province,starting_price) WHERE status = 'published';
CREATE INDEX professional_profiles_category_idx ON professional_profiles(category_id);
CREATE TABLE professional_portfolio (
 profile_id uuid NOT NULL REFERENCES professional_profiles(id) ON DELETE CASCADE,
 asset_id uuid NOT NULL REFERENCES media_assets(id), position integer NOT NULL CHECK(position BETWEEN 0 AND 7),
 PRIMARY KEY(profile_id,asset_id), UNIQUE(profile_id,position)
);
CREATE INDEX professional_portfolio_asset_idx ON professional_portfolio(asset_id);
CREATE TABLE service_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), buyer_id uuid NOT NULL REFERENCES users(id),
 category_id uuid NOT NULL REFERENCES categories(id), target_profile_id uuid REFERENCES professional_profiles(id),
 title text NOT NULL CHECK(length(title) BETWEEN 5 AND 140), description text NOT NULL CHECK(length(description) BETWEEN 20 AND 5000),
 province text NOT NULL CHECK(length(province) BETWEEN 2 AND 100),
 work_mode text NOT NULL CHECK(work_mode IN ('online','onsite','both')),
 budget numeric(18,2) CHECK(budget > 0),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','awarded','completed','cancelled')),
 accepted_proposal_id uuid, completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(status NOT IN ('awarded','completed') OR accepted_proposal_id IS NOT NULL),
 CHECK((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX service_requests_buyer_idx ON service_requests(buyer_id,created_at DESC);
CREATE INDEX service_requests_open_idx ON service_requests(category_id,created_at DESC) WHERE status = 'open';
CREATE INDEX service_requests_target_idx ON service_requests(target_profile_id,created_at DESC);
CREATE TABLE service_proposals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES professional_profiles(id), amount numeric(18,2) NOT NULL CHECK(amount > 0),
 description text NOT NULL CHECK(length(description) BETWEEN 20 AND 5000),
 delivery_days integer NOT NULL CHECK(delivery_days BETWEEN 1 AND 365),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','withdrawn')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,profile_id), UNIQUE(id,request_id)
);
CREATE INDEX service_proposals_profile_idx ON service_proposals(profile_id,created_at DESC);
ALTER TABLE service_requests ADD CONSTRAINT service_request_award_matches FOREIGN KEY(accepted_proposal_id,id) REFERENCES service_proposals(id,request_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE service_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), proposal_id uuid NOT NULL REFERENCES service_proposals(id) ON DELETE CASCADE,
 sender_id uuid NOT NULL REFERENCES users(id), body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 3000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_messages_thread_idx ON service_messages(proposal_id,created_at DESC,id);
CREATE TABLE service_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE CASCADE,
 profile_id uuid NOT NULL REFERENCES professional_profiles(id), author_id uuid NOT NULL REFERENCES users(id),
 rating integer NOT NULL CHECK(rating BETWEEN 1 AND 5), body text NOT NULL CHECK(length(body) BETWEEN 5 AND 2000),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_reviews_profile_idx ON service_reviews(profile_id,created_at DESC);
UPDATE marketplaces SET status = 'active', updated_at = now() WHERE slug = 'servicos';
