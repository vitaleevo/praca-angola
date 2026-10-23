import Link from "next/link";
import { AccountList } from "../../../components/account-view";
import { SiteFooter, SiteHeader } from "../../../components/site-header";

export default function FavoritesPage() {
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Favoritos</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Produtos guardados</p><h1>Os teus favoritos</h1><p>Produtos disponíveis que guardaste para voltar a ver.</p></div></div><AccountList kind="favorites"/></div><SiteFooter/></main>;
}
