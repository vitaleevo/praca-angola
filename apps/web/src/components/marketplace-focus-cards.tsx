import Link from "next/link";
import { MarketIcon } from "./market-icons";

export type PublicMarketplace = {
  slug: string;
  name: string;
  enabled: boolean;
};

const destinations = [
  {
    slug: "produtos",
    href: "/produtos",
    title: "Produtos",
    description: "Descobre anúncios de lojas e vendedores em Angola.",
    action: "Explorar produtos",
    icon: "grid",
    tone: "products",
  },
  {
    slug: "servicos",
    href: "/servicos",
    title: "Serviços",
    description: "Encontra profissionais e empresas para o que precisas.",
    action: "Encontrar profissionais",
    icon: "people",
    tone: "services",
  },
] as const;

export function MarketplaceFocusCards({ markets }: { markets: PublicMarketplace[] }) {
  const enabled = new Set(markets.filter((market) => market.enabled).map((market) => market.slug));
  const available = destinations.filter((destination) => enabled.has(destination.slug));

  if (available.length === 0) {
    return <p className="marketplace-focus-unavailable" role="status">Os marketplaces estão temporariamente indisponíveis. Tenta novamente dentro de instantes.</p>;
  }

  return (
    <div className="marketplace-focus-grid">
      {available.map((destination) => (
        <Link className={`marketplace-focus-card ${destination.tone}`} href={destination.href} key={destination.slug}>
          <span className="marketplace-focus-icon"><MarketIcon name={destination.icon}/></span>
          <span className="marketplace-focus-state"><span aria-hidden="true"/> Disponível</span>
          <h3>{destination.title}</h3>
          <p>{destination.description}</p>
          <span className="marketplace-focus-action">{destination.action}<span aria-hidden="true"> →</span></span>
        </Link>
      ))}
    </div>
  );
}
