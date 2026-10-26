ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'pickup',
  ADD COLUMN IF NOT EXISTS shipping_fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_details_ciphertext TEXT;

ALTER TABLE orders
  ADD CONSTRAINT orders_delivery_mode_check CHECK (delivery_mode IN ('pickup', 'courier')),
  ADD CONSTRAINT orders_shipping_fee_check CHECK (shipping_fee >= 0),
  ADD CONSTRAINT orders_courier_details_check CHECK (delivery_mode <> 'courier' OR delivery_details_ciphertext IS NOT NULL);
