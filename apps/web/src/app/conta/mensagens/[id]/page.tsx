import Link from "next/link";
import { MessageThread } from "../../../../components/account-view";
import { WorkspacePage } from "../../../../components/workspace-page";

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WorkspacePage area="account"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href="/conta/mensagens">Mensagens</Link><span>/</span><span>Conversa</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Mensagens privadas</p><h1>Conversa com a loja</h1></div></div><MessageThread id={id}/></WorkspacePage>;
}
