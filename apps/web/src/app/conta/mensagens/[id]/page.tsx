import { MessageThread } from "../../../../components/account-view";
import { SiteFooter, SiteHeader } from "../../../../components/site-header";

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <main><SiteHeader/><div className="page-wrap narrow-page"><div className="breadcrumbs"><a href="/">Início</a><span>/</span><a href="/conta/mensagens">Mensagens</a><span>/</span><span>Conversa</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Mensagens privadas</p><h1>Conversa com a loja</h1></div></div><MessageThread id={id}/></div><SiteFooter/></main>;
}
