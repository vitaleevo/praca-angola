export const LISTING_MARKETPLACES = ["produtos", "servicos", "empresas", "imoveis", "automoveis"] as const;

export type ListingMarketplace = (typeof LISTING_MARKETPLACES)[number];
export type ListingAttributeValue = string | number | boolean;
export type ListingAttributes = Record<string, ListingAttributeValue>;

export type ListingAttributesResult =
  | { ok: true; value: ListingAttributes }
  | { ok: false; code: "INVALID_ATTRIBUTES"; message: string; field?: string };

class AttributeFieldError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
  }
}

const COMPANY_TYPES = ["loja", "fornecedor", "prestador", "distribuidor", "fabricante"] as const;
const TRANSACTIONS = ["venda", "arrendamento"] as const;
const FUEL_TYPES = ["gasolina", "gasoleo", "eletrico", "hibrido", "gpl"] as const;
const TRANSMISSIONS = ["manual", "automatica"] as const;

function invalid(field: string, message: string): never {
  throw new AttributeFieldError(field, message);
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  return input as Record<string, unknown>;
}

function readString(
  record: Record<string, unknown>,
  key: string,
  label: string,
  { min = 1, max = 200, required = false }: { min?: number; max?: number; required?: boolean } = {},
): string | undefined {
  const raw = record[key];
  if (raw === undefined || raw === null) {
    if (required) invalid(key, `Indica ${label}.`);
    return undefined;
  }
  if (typeof raw !== "string" && typeof raw !== "number") invalid(key, `${label} não é válido.`);
  const value = String(raw).trim();
  if (!value) {
    if (required) invalid(key, `Indica ${label}.`);
    return undefined;
  }
  if (value.length < min || value.length > max) {
    invalid(key, `O campo "${label}" deve ter entre ${min} e ${max} caracteres.`);
  }
  return value;
}

function readNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
  { min, max, integer = false, required = false }: { min: number; max: number; integer?: boolean; required?: boolean },
): number | undefined {
  const raw = record[key];
  if (raw === undefined || raw === null || (typeof raw === "string" && !raw.trim())) {
    if (required) invalid(key, `Indica ${label}.`);
    return undefined;
  }
  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value)) invalid(key, `${label} não é válido.`);
  if (integer && !Number.isInteger(value)) invalid(key, `${label} deve ser um número inteiro.`);
  if (value < min || value > max) invalid(key, `${label} deve estar entre ${min} e ${max}.`);
  return value;
}

function readBoolean(record: Record<string, unknown>, key: string, label: string): boolean | undefined {
  const raw = record[key];
  if (raw === undefined || raw === null || raw === "") return undefined;
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  invalid(key, `${label} não é válido.`);
}

function readEnum<T extends string>(
  record: Record<string, unknown>,
  key: string,
  label: string,
  allowed: readonly T[],
  required = false,
): T | undefined {
  const value = readString(record, key, label, { required });
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T)) invalid(key, `${label} não é válido.`);
  return value as T;
}

function readWebsite(record: Record<string, unknown>): string | undefined {
  const raw = readString(record, "website", "o website", { min: 4, max: 200 });
  if (!raw) return undefined;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") invalid("website", "O website deve começar por http:// ou https://.");
    return url.pathname === "/" && !url.search && !url.hash ? url.toString().replace(/\/$/, "") : url.toString();
  } catch {
    invalid("website", "Indica um website válido.");
  }
}

function parseCompany(record: Record<string, unknown>): ListingAttributes {
  const value: ListingAttributes = {};
  const companyType = readEnum(record, "companyType", "o tipo de empresa", COMPANY_TYPES, true);
  const sector = readString(record, "sector", "o setor", { min: 2, max: 80, required: true });
  const coverage = readString(record, "coverage", "a cobertura", { min: 2, max: 120 });
  const delivery = readBoolean(record, "delivery", "A entrega");
  const website = readWebsite(record);
  if (companyType) value.companyType = companyType;
  if (sector) value.sector = sector;
  if (coverage) value.coverage = coverage;
  if (delivery !== undefined) value.delivery = delivery;
  if (website) value.website = website;
  return value;
}

function parseProperty(record: Record<string, unknown>): ListingAttributes {
  const value: ListingAttributes = {};
  const transaction = readEnum(record, "transaction", "o tipo de transação", TRANSACTIONS, true);
  const areaM2 = readNumber(record, "areaM2", "a área", { min: 1, max: 1_000_000, required: true });
  const bedrooms = readNumber(record, "bedrooms", "o número de quartos", { min: 0, max: 50, integer: true });
  const bathrooms = readNumber(record, "bathrooms", "o número de casas de banho", { min: 0, max: 50, integer: true });
  const parking = readNumber(record, "parking", "o número de lugares de estacionamento", { min: 0, max: 100, integer: true });
  const furnished = readBoolean(record, "furnished", "O mobiliário");
  if (transaction) value.transaction = transaction;
  if (areaM2 !== undefined) value.areaM2 = areaM2;
  if (bedrooms !== undefined) value.bedrooms = bedrooms;
  if (bathrooms !== undefined) value.bathrooms = bathrooms;
  if (parking !== undefined) value.parking = parking;
  if (furnished !== undefined) value.furnished = furnished;
  return value;
}

function parseVehicle(record: Record<string, unknown>): ListingAttributes {
  const value: ListingAttributes = {};
  const make = readString(record, "make", "a marca", { min: 2, max: 60, required: true });
  const model = readString(record, "model", "o modelo", { min: 2, max: 80, required: true });
  const year = readNumber(record, "year", "o ano", { min: 1950, max: new Date().getFullYear() + 1, integer: true, required: true });
  const mileageKm = readNumber(record, "mileageKm", "a quilometragem", { min: 0, max: 2_000_000, integer: true });
  const fuel = readEnum(record, "fuel", "o combustível", FUEL_TYPES, true);
  const transmission = readEnum(record, "transmission", "a caixa de velocidades", TRANSMISSIONS);
  const color = readString(record, "color", "a cor", { min: 2, max: 40 });
  if (make) value.make = make;
  if (model) value.model = model;
  if (year !== undefined) value.year = year;
  if (mileageKm !== undefined) value.mileageKm = mileageKm;
  if (fuel) value.fuel = fuel;
  if (transmission) value.transmission = transmission;
  if (color) value.color = color;
  return value;
}

export function parseListingAttributes(marketplace: string, input: unknown): ListingAttributesResult {
  if (marketplace !== "empresas" && marketplace !== "imoveis" && marketplace !== "automoveis") {
    return { ok: true, value: {} };
  }
  const record = asRecord(input);
  if (!record) {
    return { ok: false, code: "INVALID_ATTRIBUTES", message: "Os detalhes do anúncio não são válidos.", field: "attributes" };
  }
  try {
    if (marketplace === "empresas") return { ok: true, value: parseCompany(record) };
    if (marketplace === "imoveis") return { ok: true, value: parseProperty(record) };
    return { ok: true, value: parseVehicle(record) };
  } catch (error) {
    if (error instanceof AttributeFieldError) {
      return { ok: false, code: "INVALID_ATTRIBUTES", message: error.message, field: error.field };
    }
    throw error;
  }
}
