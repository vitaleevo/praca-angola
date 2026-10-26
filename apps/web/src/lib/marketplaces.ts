import type { Listing } from "./api";

export type VerticalSlug = "empresas" | "imoveis" | "automoveis";

export type VerticalCategory = {
  slug: string;
  name: string;
  icon: string;
};

export type VerticalMarketplace = {
  slug: VerticalSlug;
  name: string;
  singular: string;
  kicker: string;
  headline: string;
  highlight: string;
  description: string;
  searchPlaceholder: string;
  cta: string;
  safetyNote: string;
  categories: VerticalCategory[];
};

export const verticalMarketplaces: Record<VerticalSlug, VerticalMarketplace> = {
  empresas: {
    slug: "empresas",
    name: "Empresas",
    singular: "empresa",
    kicker: "PUVO EMPRESAS · ANGOLA",
    headline: "Empresas que",
    highlight: "fazem acontecer",
    description: "Lojas, fornecedores e serviços empresariais de confiança, em toda Angola.",
    searchPlaceholder: "O que procura para o seu negócio?",
    cta: "Publicar empresa",
    safetyNote: "Confirma o NIF, os contactos e os dados da empresa antes de fechar qualquer negócio. A PUVO não intermedeia esta negociação.",
    categories: [
      { slug: "lojas-fornecedores", name: "Lojas e fornecedores", icon: "bag" },
      { slug: "servicos-empresariais", name: "Serviços empresariais", icon: "people" },
      { slug: "equipamentos-materiais", name: "Equipamentos e materiais", icon: "tool" },
      { slug: "distribuicao-logistica", name: "Distribuição e logística", icon: "truck" },
      { slug: "tecnologia-escritorio", name: "Tecnologia de escritório", icon: "laptop" },
      { slug: "publicidade-marketing", name: "Publicidade e marketing", icon: "chart" },
    ],
  },
  imoveis: {
    slug: "imoveis",
    name: "Imóveis",
    singular: "imóvel",
    kicker: "PUVO IMÓVEIS · ANGOLA",
    headline: "O teu próximo",
    highlight: "espaço",
    description: "Apartamentos, casas, terrenos e escritórios para comprar ou arrendar em Angola.",
    searchPlaceholder: "Apartamento, casa, terreno…",
    cta: "Publicar imóvel",
    safetyNote: "Visita o imóvel e confirma a documentação antes de qualquer pagamento ou sinal. A PUVO não intermedeia esta negociação.",
    categories: [
      { slug: "apartamentos", name: "Apartamentos", icon: "building" },
      { slug: "casas-moradias", name: "Casas e moradias", icon: "home" },
      { slug: "terrenos", name: "Terrenos", icon: "land" },
      { slug: "escritorios-lojas", name: "Escritórios e lojas", icon: "building" },
      { slug: "armazens", name: "Armazéns", icon: "warehouse" },
      { slug: "novos-empreendimentos", name: "Novos empreendimentos", icon: "building" },
    ],
  },
  automoveis: {
    slug: "automoveis",
    name: "Automóveis",
    singular: "automóvel",
    kicker: "PUVO AUTOMÓVEIS · ANGOLA",
    headline: "A estrada",
    highlight: "começa aqui",
    description: "Carros, comerciais, motas e viaturas elétricas, novos e usados.",
    searchPlaceholder: "Toyota Hilux, Suzuki, mota…",
    cta: "Publicar automóvel",
    safetyNote: "Pede o livrete, verifica o histórico e testa a viatura antes de pagar. A PUVO não intermedeia esta negociação.",
    categories: [
      { slug: "carros", name: "Carros", icon: "car" },
      { slug: "suv-4x4", name: "SUV e 4x4", icon: "suv" },
      { slug: "comerciais", name: "Comerciais", icon: "truck" },
      { slug: "motas", name: "Motas", icon: "moto" },
      { slug: "pecas-acessorios", name: "Peças e acessórios", icon: "tool" },
      { slug: "viaturas-eletricas", name: "Viaturas elétricas", icon: "bolt" },
    ],
  },
};

export function isVerticalSlug(value: string): value is VerticalSlug {
  return value === "empresas" || value === "imoveis" || value === "automoveis";
}

export function marketplaceHref(slug: string, enabled: boolean): string {
  if (!enabled) return `/marketplaces?area=${slug}`;
  if (slug === "servicos") return "/servicos";
  if (slug === "produtos") return "/produtos";
  return `/${slug}`;
}

export function listingPath(listing: Pick<Listing, "slug" | "marketplace">): string {
  const marketplace = listing.marketplace ?? "produtos";
  return marketplace === "produtos" || marketplace === "servicos"
    ? `/produtos/${listing.slug}`
    : `/${marketplace}/${listing.slug}`;
}

const numberFormat = new Intl.NumberFormat("pt-AO");

function asNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function plural(value: unknown, singular: string, pluralForm: string): string | null {
  const parsed = asNumber(value);
  if (parsed === null) return null;
  return `${numberFormat.format(parsed)} ${parsed === 1 ? singular : pluralForm}`;
}

const companyTypeLabels: Record<string, string> = {
  loja: "Loja",
  fornecedor: "Fornecedor",
  prestador: "Prestador de serviços",
  distribuidor: "Distribuidor",
  fabricante: "Fabricante",
};

const transactionLabels: Record<string, string> = {
  venda: "Venda",
  arrendamento: "Arrendamento",
};

const fuelLabels: Record<string, string> = {
  gasolina: "Gasolina",
  gasoleo: "Gasóleo",
  eletrico: "Elétrico",
  hibrido: "Híbrido",
  gpl: "GPL",
};

const transmissionLabels: Record<string, string> = {
  manual: "Manual",
  automatica: "Automática",
};

export type AttributeDefinition = {
  key: string;
  label: string;
  format: (value: unknown) => string | null;
};

export const attributeDefinitions: Record<VerticalSlug, AttributeDefinition[]> = {
  empresas: [
    { key: "companyType", label: "Tipo de empresa", format: (value) => companyTypeLabels[String(value)] ?? null },
    { key: "sector", label: "Setor", format: asText },
    { key: "coverage", label: "Cobertura", format: asText },
    { key: "delivery", label: "Entrega", format: (value) => (value === true ? "Disponível" : value === false ? "Não disponível" : null) },
    { key: "website", label: "Website", format: asText },
  ],
  imoveis: [
    { key: "transaction", label: "Transação", format: (value) => transactionLabels[String(value)] ?? null },
    { key: "areaM2", label: "Área", format: (value) => (asNumber(value) === null ? null : `${numberFormat.format(asNumber(value)!)} m²`) },
    { key: "bedrooms", label: "Quartos", format: (value) => plural(value, "quarto", "quartos") },
    { key: "bathrooms", label: "Casas de banho", format: (value) => plural(value, "casa de banho", "casas de banho") },
    { key: "parking", label: "Estacionamento", format: (value) => plural(value, "lugar", "lugares") },
    { key: "furnished", label: "Mobiliário", format: (value) => (value === true ? "Mobilado" : value === false ? "Não mobilado" : null) },
  ],
  automoveis: [
    { key: "make", label: "Marca", format: asText },
    { key: "model", label: "Modelo", format: asText },
    { key: "year", label: "Ano", format: (value) => (asNumber(value) === null ? null : String(asNumber(value))) },
    { key: "mileageKm", label: "Quilometragem", format: (value) => (asNumber(value) === null ? null : `${numberFormat.format(asNumber(value)!)} km`) },
    { key: "fuel", label: "Combustível", format: (value) => fuelLabels[String(value)] ?? null },
    { key: "transmission", label: "Caixa", format: (value) => transmissionLabels[String(value)] ?? null },
    { key: "color", label: "Cor", format: asText },
  ],
};

export function attributeRows(
  marketplace: VerticalSlug,
  attributes: Record<string, unknown> | undefined,
): { key: string; label: string; value: string }[] {
  if (!attributes) return [];
  return attributeDefinitions[marketplace].flatMap((definition) => {
    const value = definition.format(attributes[definition.key]);
    return value ? [{ key: definition.key, label: definition.label, value }] : [];
  });
}

export function listingSummary(marketplace: VerticalSlug, attributes: Record<string, unknown> | undefined): string[] {
  return attributeRows(marketplace, attributes)
    .filter((row) => !["website", "coverage", "color", "model"].includes(row.key))
    .slice(0, 4)
    .map((row) => row.value);
}

export function listingBadge(marketplace: VerticalSlug, attributes: Record<string, unknown> | undefined): string {
  if (marketplace === "imoveis") return transactionLabels[String(attributes?.transaction)] ?? "Imóvel";
  if (marketplace === "automoveis") {
    const year = asNumber(attributes?.year);
    return year ? String(year) : "Automóvel";
  }
  return companyTypeLabels[String(attributes?.companyType)] ?? "Empresa";
}

export function priceSuffix(marketplace: VerticalSlug, attributes: Record<string, unknown> | undefined): string {
  return marketplace === "imoveis" && attributes?.transaction === "arrendamento" ? "/mês" : "";
}

export function marketplaceName(slug: string | undefined): string {
  if (!slug) return "Produtos";
  return isVerticalSlug(slug) ? verticalMarketplaces[slug].name : slug === "servicos" ? "Serviços" : "Produtos";
}
