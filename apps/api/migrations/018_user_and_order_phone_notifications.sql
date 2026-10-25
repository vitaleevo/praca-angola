-- Migration 018: Add phone number to users and orders for SMS/WhatsApp notifications
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
