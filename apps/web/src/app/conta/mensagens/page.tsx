import Link from "next/link";
import { AccountList } from "../../../components/account-view";
import { SiteFooter, SiteHeader } from "../../../components/site-header";

export default function MessagesPage() {
  return <main><SiteHeader/><div className="page-wrap"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Mensagens</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Conversas com as lojas</p><h1>Mensagens</h1><p>Faz perguntas e combina detalhes diretamente com o vendedor.</p></div></div><AccountList kind="messages"/></div><SiteFooter/></main>;
}
