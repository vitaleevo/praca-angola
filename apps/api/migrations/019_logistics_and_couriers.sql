-- Migration 019: Logistics, Courier Management, Freight Engine and Delivery Handshake
CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  province TEXT NOT NULL,
  municipalities TEXT[] NOT NULL DEFAULT '{}',
  base_rate NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  estimated_hours_min INT NOT NULL DEFAULT 2,
  estimated_hours_max INT NOT NULL DEFAULT 24,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed Standard Angolan Delivery Zones
INSERT INTO delivery_zones (name, province, municipalities, base_rate, estimated_hours_min, estimated_hours_max)
VALUES
  (
    'Luanda Urbana & Sul (Expansão)',
    'Luanda',
    ARRAY['Luanda', 'Ingombota', 'Maianga', 'Rangel', 'Sambizanga', 'Talatona', 'Belas', 'Kilamba Kiaxi'],
    2000.00,
    2,
    6
  ),
  (
    'Luanda Periferias',
    'Luanda',
    ARRAY['Viana', 'Cazenga', 'Cacuaco'],
    3500.00,
    4,
    12
  ),
  (
    'Luanda Satélite & Extensões',
    'Luanda',
    ARRAY['Zango', 'Sequele', 'Icolo e Bengo', 'Quiçama'],
    5500.00,
    12,
    24
  ),
  (
    'Província de Benguela',
    'Benguela',
    ARRAY['Benguela', 'Lobito', 'Catumbela', 'Baía Farta'],
    4500.00,
    24,
    48
  ),
  (
    'Província do Huambo',
    'Huambo',
    ARRAY['Huambo', 'Caála', 'Bailundo'],
    5000.00,
    24,
    48
  ),
  (
    'Província da Huíla',
    'Huíla',
    ARRAY['Lubango', 'Humpata', 'Chibia'],
    5500.00,
    24,
    48
  ),
  (
    'Inter-provincial Geral',
    'Outras',
    ARRAY['Cabinda', 'Uíge', 'Malanje', 'Kwanza Sul', 'Namibe', 'Zaire', 'Lunda Norte', 'Lunda Sul', 'Moxico', 'Kuando Kubango', 'Bié', 'Kwanza Norte', 'Bengo'],
    7000.00,
    48,
    72
  )
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS store_shipping_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_profile_id UUID NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE UNIQUE,
  free_shipping_threshold NUMERIC(12,2),
  local_pickup_enabled BOOLEAN NOT NULL DEFAULT true,
  pickup_address TEXT,
  custom_zone_rates JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS couriers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('motorcycle', 'car', 'van', 'on_foot')),
  license_plate TEXT,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('active', 'busy', 'offline', 'suspended')),
  current_latitude NUMERIC(10,7),
  current_longitude NUMERIC(10,7),
  rating NUMERIC(3,2) NOT NULL DEFAULT 5.00,
  total_deliveries INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_couriers_status ON couriers(status);
CREATE INDEX IF NOT EXISTS idx_couriers_phone ON couriers(phone);

CREATE TABLE IF NOT EXISTS delivery_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE UNIQUE,
  courier_id UUID REFERENCES couriers(id) ON DELETE SET NULL,
  seller_profile_id UUID NOT NULL REFERENCES seller_profiles(id),
  delivery_zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
  destination_province TEXT NOT NULL,
  destination_municipality TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  destination_landmark TEXT,
  destination_latitude NUMERIC(10,7),
  destination_longitude NUMERIC(10,7),
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  shipping_fee NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  status TEXT NOT NULL DEFAULT 'pending_courier' CHECK (status IN ('pending_courier', 'assigned', 'picked_up', 'in_transit', 'arrived', 'delivered', 'failed', 'cancelled')),
  delivery_pin_hash TEXT NOT NULL,
  raw_pin_for_buyer TEXT,
  pin_attempts INT NOT NULL DEFAULT 0,
  max_pin_attempts INT NOT NULL DEFAULT 3,
  assigned_at TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_assignments_courier ON delivery_assignments(courier_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_status ON delivery_assignments(status);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order ON delivery_assignments(order_id);

CREATE TABLE IF NOT EXISTS delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES delivery_assignments(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery ON delivery_events(delivery_id);
