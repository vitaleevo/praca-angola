export type VehicleType = "motorcycle" | "car" | "van" | "on_foot";
export type CourierStatus = "active" | "busy" | "offline" | "suspended";
export type DeliveryStatus =
  | "pending_courier"
  | "assigned"
  | "picked_up"
  | "in_transit"
  | "arrived"
  | "delivered"
  | "failed"
  | "cancelled";

export interface DeliveryZone {
  id: string;
  name: string;
  province: string;
  municipalities: string[];
  base_rate: string;
  estimated_hours_min: number;
  estimated_hours_max: number;
  active: boolean;
}

export interface StoreShippingSettings {
  id: string;
  seller_profile_id: string;
  free_shipping_threshold: string | null;
  local_pickup_enabled: boolean;
  pickup_address: string | null;
  custom_zone_rates: Record<string, number>;
}

export interface Courier {
  id: string;
  user_id: string | null;
  full_name: string;
  phone: string;
  vehicle_type: VehicleType;
  license_plate: string | null;
  status: CourierStatus;
  approved_at: string | null;
  current_latitude: string | null;
  current_longitude: string | null;
  rating: string;
  total_deliveries: number;
}

export interface DeliveryAssignment {
  id: string;
  order_id: string;
  courier_id: string | null;
  seller_profile_id: string;
  delivery_zone_id: string | null;
  destination_province: string;
  destination_municipality: string;
  destination_address: string;
  destination_landmark: string | null;
  destination_latitude: string | null;
  destination_longitude: string | null;
  recipient_name: string;
  recipient_phone: string;
  shipping_fee: string;
  status: DeliveryStatus;
  delivery_pin_hash: string;
  raw_pin_for_buyer: string | null;
  pin_attempts: number;
  max_pin_attempts: number;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  failure_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalculateFreightParams {
  sellerProfileId: string;
  province: string;
  municipality: string;
  totalCartAmount?: number;
}

export interface FreightCalculationResult {
  zoneId: string;
  zoneName: string;
  province: string;
  baseRate: number;
  finalRate: number;
  isFreeShipping: boolean;
  freeShippingThreshold: number | null;
  estimatedHoursMin: number;
  estimatedHoursMax: number;
  localPickupAvailable: boolean;
  pickupAddress: string | null;
}
