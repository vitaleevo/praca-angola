ALTER TABLE seller_profiles
  ADD COLUMN contact_email text,
  ADD COLUMN contact_email_public boolean NOT NULL DEFAULT false,
  ADD COLUMN contact_email_public_at timestamptz,
  ADD COLUMN contact_phone text,
  ADD COLUMN contact_phone_public boolean NOT NULL DEFAULT false,
  ADD COLUMN contact_phone_public_at timestamptz,
  ADD COLUMN delivery_policy text NOT NULL DEFAULT '',
  ADD COLUMN returns_policy text NOT NULL DEFAULT '',
  ADD COLUMN terms_policy text NOT NULL DEFAULT '';

ALTER TABLE seller_profiles
  ADD CONSTRAINT seller_profiles_contact_email_length CHECK (contact_email IS NULL OR length(contact_email) <= 254),
  ADD CONSTRAINT seller_profiles_contact_phone_length CHECK (contact_phone IS NULL OR length(contact_phone) BETWEEN 9 AND 13),
  ADD CONSTRAINT seller_profiles_delivery_policy_length CHECK (length(delivery_policy) <= 2000),
  ADD CONSTRAINT seller_profiles_returns_policy_length CHECK (length(returns_policy) <= 2000),
  ADD CONSTRAINT seller_profiles_terms_policy_length CHECK (length(terms_policy) <= 2000),
  ADD CONSTRAINT seller_profiles_email_consent_consistent CHECK (contact_email_public = (contact_email_public_at IS NOT NULL)),
  ADD CONSTRAINT seller_profiles_phone_consent_consistent CHECK (contact_phone_public = (contact_phone_public_at IS NOT NULL)),
  ADD CONSTRAINT seller_profiles_public_email_present CHECK (NOT contact_email_public OR (contact_email IS NOT NULL AND length(btrim(contact_email)) > 0)),
  ADD CONSTRAINT seller_profiles_public_phone_present CHECK (NOT contact_phone_public OR (contact_phone IS NOT NULL AND length(btrim(contact_phone)) > 0));

INSERT INTO store_memberships (seller_profile_id, user_id, role)
SELECT id, owner_user_id, 'owner' FROM seller_profiles
ON CONFLICT (seller_profile_id, user_id) DO UPDATE SET role = 'owner';

CREATE INDEX store_memberships_store_role_idx ON store_memberships (seller_profile_id, role, created_at);
