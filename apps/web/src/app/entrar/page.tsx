import { AuthForm } from "../../components/auth-form";
import { SiteFooter, SiteHeader } from "../../components/site-header";
import Link from "next/link";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const createAccountHref = next ? `/registar?next=${encodeURIComponent(next)}` : "/registar";
  return <main><SiteHeader/><div className="auth-page"><div className="auth-layout"><section className="auth-card"><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Bem-vindo de volta</p><h1>Entra na PUVO</h1><p>Acede às tuas mensagens, favoritos, encomendas e à tua loja.</p><AuthForm mode="login" nextPath={next}/><p className="auth-switch">Ainda não tens conta? <Link href={createAccountHref}>Criar conta</Link></p></section><aside className="auth-aside"><span className="auth-aside-mark" aria-hidden="true">p.</span><p className="eyebrow eyebrow-light">A tua conta PUVO</p><h2>Continua de onde paraste.</h2><ul><li>Vê o estado das tuas encomendas.</li><li>Retoma conversas com as lojas.</li><li>Guarda produtos e gere a tua montra.</li></ul><Link href="/produtos">Explorar produtos <span aria-hidden="true">→</span></Link></aside></div></div><SiteFooter/></main>;
}
