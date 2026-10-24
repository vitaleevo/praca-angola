CREATE TABLE IF NOT EXISTS seller_payment_methods (
  seller_profile_id uuid NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('manual_multicaixa_express_transfer', 'manual_bank_transfer')),
  enabled boolean NOT NULL DEFAULT true,
  recipient_name_ciphertext text NOT NULL,
  recipient_identifier_ciphertext text NOT NULL,
  provider_name_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_profile_id, method),
  CHECK (
    (method = 'manual_multicaixa_express_transfer' AND provider_name_ciphertext IS NULL)
    OR (method = 'manual_bank_transfer' AND provider_name_ciphertext IS NOT NULL)
  )
);

INSERT INTO seller_payment_methods (
  seller_profile_id,
  method,
  enabled,
  recipient_name_ciphertext,
  recipient_identifier_ciphertext
)
SELECT
  id,
  'manual_multicaixa_express_transfer',
  true,
  mcx_recipient_name_ciphertext,
  mcx_phone_ciphertext
FROM seller_profiles
WHERE mcx_recipient_name_ciphertext IS NOT NULL
  AND mcx_phone_ciphertext IS NOT NULL
ON CONFLICT (seller_profile_id, method) DO NOTHING;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'manual_multicaixa_express_transfer',
  ADD COLUMN IF NOT EXISTS payment_destination_ciphertext text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_payment_method_check' AND conrelid = 'orders'::regclass
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IN ('manual_multicaixa_express_transfer', 'manual_bank_transfer'));
  END IF;
END $$;
