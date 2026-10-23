CREATE TABLE IF NOT EXISTS marketplaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'coming_soon', 'suspended')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO marketplaces (slug, name, status, sort_order) VALUES
  ('produtos', 'Produtos', 'active', 1),
  ('servicos', 'Serviços', 'coming_soon', 2),
  ('empresas', 'Empresas', 'coming_soon', 3),
  ('imoveis', 'Imóveis', 'coming_soon', 4),
  ('automoveis', 'Automóveis', 'coming_soon', 5),
  ('entregas', 'Entregas', 'coming_soon', 6),
  ('frescos', 'Frescos', 'coming_soon', 7),
  ('agricultura', 'Agricultura', 'coming_soon', 8),
  ('construcao', 'Construção', 'coming_soon', 9),
  ('empregos', 'Empregos', 'coming_soon', 10),
  ('educacao', 'Educação', 'coming_soon', 11),
  ('eventos', 'Eventos', 'coming_soon', 12),
  ('turismo', 'Turismo', 'coming_soon', 13),
  ('beleza', 'Beleza', 'coming_soon', 14),
  ('alugueres', 'Alugueres', 'coming_soon', 15),
  ('digital', 'Digital', 'coming_soon', 16),
  ('saude', 'Saúde', 'coming_soon', 17),
  ('cuidados', 'Cuidados', 'coming_soon', 18),
  ('desporto', 'Desporto', 'coming_soon', 19),
  ('animais', 'Animais', 'coming_soon', 20),
  ('recicla', 'Recicla', 'coming_soon', 21),
  ('importacao', 'Importação', 'coming_soon', 22),
  ('social', 'Social', 'coming_soon', 23),
  ('financas', 'Finanças', 'coming_soon', 24)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_id uuid NOT NULL REFERENCES marketplaces(id),
  parent_id uuid REFERENCES categories(id),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (marketplace_id, slug)
);

INSERT INTO categories (marketplace_id, name, slug, sort_order)
SELECT m.id, c.name, c.slug, c.sort_order
FROM marketplaces m
CROSS JOIN (VALUES
  ('Telemóveis e tecnologia', 'telemoveis-tecnologia', 1),
  ('Casa e mobiliário', 'casa-mobiliario', 2),
  ('Moda e acessórios', 'moda-acessorios', 3),
  ('Casa e cozinha', 'casa-cozinha', 4),
  ('Desporto e lazer', 'desporto-lazer', 5),
  ('Beleza e cuidados', 'beleza-cuidados', 6),
  ('Livros e papelaria', 'livros-papelaria', 7),
  ('Bebés e crianças', 'bebes-criancas', 8),
  ('Outros produtos', 'outros', 9)
) AS c(name, slug, sort_order)
WHERE m.slug = 'produtos'
ON CONFLICT (marketplace_id, slug) DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('buyer', 'moderator', 'administrator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_hash char(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_bucket_idx ON login_attempts(bucket_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS seller_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_type text NOT NULL CHECK (profile_type IN ('individual', 'business')),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  province text NOT NULL CHECK (length(province) BETWEEN 2 AND 100),
  municipality text NOT NULL CHECK (length(municipality) BETWEEN 2 AND 100),
  mcx_recipient_name_ciphertext text,
  mcx_phone_ciphertext text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((mcx_recipient_name_ciphertext IS NULL) = (mcx_phone_ciphertext IS NULL))
);
CREATE INDEX IF NOT EXISTS seller_profiles_owner_idx ON seller_profiles(owner_user_id);

CREATE TABLE IF NOT EXISTS store_memberships (
  seller_profile_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'support')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_profile_id, user_id)
);
CREATE INDEX IF NOT EXISTS store_memberships_user_idx ON store_memberships(user_id);

CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_profile_id uuid NOT NULL REFERENCES seller_profiles(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  slug text NOT NULL UNIQUE,
  title text NOT NULL CHECK (length(title) BETWEEN 4 AND 140),
  description text NOT NULL CHECK (length(description) BETWEEN 10 AND 8000),
  price numeric(18,2) NOT NULL CHECK (price > 0),
  currency char(3) NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  condition text NOT NULL CHECK (condition IN ('new', 'used', 'refurbished')),
  price_negotiable boolean NOT NULL DEFAULT false,
  available_quantity integer NOT NULL DEFAULT 1 CHECK (available_quantity >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'published', 'paused', 'sold', 'rejected', 'archived')),
  rejection_reason text,
  province text NOT NULL,
  municipality text NOT NULL,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_public_recent_idx ON listings(category_id, published_at DESC, id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS listings_seller_status_idx ON listings(seller_profile_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS listings_price_idx ON listings(price) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS listings_location_idx ON listings(province, municipality) WHERE status = 'published';

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_assets_owner_idx ON media_assets(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS listing_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  media_asset_id uuid REFERENCES media_assets(id),
  image_url text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, sort_order)
);
CREATE INDEX IF NOT EXISTS listing_images_listing_idx ON listing_images(listing_id, sort_order);

CREATE TABLE IF NOT EXISTS favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
CREATE INDEX IF NOT EXISTS favorites_listing_idx ON favorites(listing_id);

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  seller_profile_id uuid NOT NULL REFERENCES seller_profiles(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS conversations_seller_idx ON conversations(seller_profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS conversations_buyer_idx ON conversations(buyer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 3000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id),
  listing_id uuid NOT NULL REFERENCES listings(id),
  reason text NOT NULL CHECK (reason IN ('prohibited_item', 'misleading', 'duplicate', 'suspected_fraud', 'other')),
  details text NOT NULL DEFAULT '' CHECK (length(details) <= 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports(status, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS reports_one_open_per_listing_idx ON reports(reporter_id, listing_id) WHERE status IN ('open', 'investigating');

CREATE TABLE IF NOT EXISTS moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES listings(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('approved', 'rejected', 'paused', 'restored', 'removed')),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (listing_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS moderation_actions_listing_idx ON moderation_actions(listing_id, created_at DESC);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  buyer_id uuid NOT NULL REFERENCES users(id),
  seller_profile_id uuid NOT NULL REFERENCES seller_profiles(id),
  status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'payment_reported', 'payment_confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'completed', 'cancelled', 'refund_requested', 'refunded')),
  payment_status text NOT NULL DEFAULT 'awaiting_transfer' CHECK (payment_status IN ('awaiting_transfer', 'buyer_reported', 'confirmed_by_seller', 'rejected', 'expired', 'refund_requested', 'refund_confirmed')),
  currency char(3) NOT NULL DEFAULT 'AOA' CHECK (currency = 'AOA'),
  total_amount numeric(18,2) NOT NULL CHECK (total_amount > 0),
  payment_deadline timestamptz NOT NULL,
  buyer_note text NOT NULL DEFAULT '' CHECK (length(buyer_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_buyer_idx ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_seller_idx ON orders(seller_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_payment_expiry_idx ON orders(payment_deadline) WHERE payment_status = 'awaiting_transfer';

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  listing_id uuid NOT NULL REFERENCES listings(id),
  title_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price > 0),
  line_total numeric(18,2) NOT NULL CHECK (line_total > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS manual_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id),
  event_type text NOT NULL CHECK (event_type IN ('buyer_reported_transfer', 'seller_confirmed_transfer', 'seller_rejected_transfer', 'buyer_requested_refund', 'seller_confirmed_refund')),
  transfer_reference text NOT NULL DEFAULT '' CHECK (length(transfer_reference) <= 140),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manual_payment_events_order_idx ON manual_payment_events(order_id, created_at);

CREATE TABLE IF NOT EXISTS order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id),
  event_type text NOT NULL,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events(order_id, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id),
  author_id uuid NOT NULL REFERENCES users(id),
  seller_profile_id uuid NOT NULL REFERENCES seller_profiles(id),
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 1500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_seller_idx ON reviews(seller_profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_id, created_at DESC);
