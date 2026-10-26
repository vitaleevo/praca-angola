import Link from "next/link";
import { ListingForm } from "../../../../components/seller-dashboard";
import { WorkspacePage } from "../../../../components/workspace-page";

const headings: Record<string, { title: string; subtitle: string }> = {
  produtos: { title: "Novo produto", subtitle: "Publica um produto para venda na P.U.V.O." },
  empresas: { title: "Nova empresa", subtitle: "Apresenta a tua empresa, loja ou serviço a quem procura em Angola." },
  imoveis: { title: "Novo imóvel", subtitle: "Publica um imóvel para venda ou arrendamento." },
  automoveis: { title: "Novo automóvel", subtitle: "Publica um carro, comercial, mota ou viatura elétrica." },
};

export default async function NewListingPage({ searchParams }: { searchParams: Promise<{ marketplace?: string }> }) {
  const requested = (await searchParams).marketplace;
  const marketplace = requested && Object.hasOwn(headings, requested) ? requested : "produtos";
  const copy = headings[marketplace];
  return <WorkspacePage area="seller"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/vendedor">Área de vendedor</Link><span>/</span><span>Novo anúncio</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Publica na P.U.V.O.</p><h1>{copy.title}</h1><p>{copy.subtitle} O anúncio fica público depois da revisão.</p></div></div><div className="panel"><ListingForm defaultMarketplace={marketplace}/></div></WorkspacePage>;
}
