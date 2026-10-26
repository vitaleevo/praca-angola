-- Couriers must be approved by an administrator before they can receive orders.
ALTER TABLE couriers ADD COLUMN IF NOT EXISTS approved_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS couriers_user_unique_idx ON couriers(user_id) WHERE user_id IS NOT NULL;
