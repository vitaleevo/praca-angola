import Link from "next/link";
import { AccountList } from "../../../components/account-view";
import { WorkspacePage } from "../../../components/workspace-page";

export default function MessagesPage() {
  return <WorkspacePage area="account"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Mensagens</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Conversas com as lojas</p><h1>Mensagens</h1><p>Faz perguntas e combina detalhes diretamente com o vendedor.</p></div></div><AccountList kind="messages"/></WorkspacePage>;
}
