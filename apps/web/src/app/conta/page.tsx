import type { Metadata } from "next";
import Link from "next/link";
import { AccountHome } from "../../components/account-home";
import { WorkspacePage } from "../../components/workspace-page";

export const metadata: Metadata = { title: "A minha conta" };

export default function AccountPage() {
  return <WorkspacePage area="account"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>A minha conta</span></div><div className="page-heading"><div><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Área pessoal</p><h1>A minha conta</h1><p>Gere as tuas compras, conversas, favoritos e a tua loja.</p></div></div><AccountHome/></WorkspacePage>;
}
