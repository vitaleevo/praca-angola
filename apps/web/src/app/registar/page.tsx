import { AuthForm } from "../../components/auth-form";
import { SiteFooter, SiteHeader } from "../../components/site-header";
import Link from "next/link";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const loginHref = next ? `/entrar?next=${encodeURIComponent(next)}` : "/entrar";
  return <main><SiteHeader/><div className="auth-page"><div className="auth-layout auth-layout-register"><section className="auth-card"><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Faz parte da comunidade</p><h1>Cria a tua conta</h1><p>Usa o mesmo acesso para comprar, falar com lojas e começar a vender.</p><AuthForm mode="register" nextPath={next}/><p className="auth-switch">Já tens conta? <Link href={loginHref}>Entrar</Link></p><p className="legal-note">Pede apenas nome, e-mail e palavra-passe. Podes criar uma loja depois de abrir a conta.</p></section><aside className="auth-aside"><span className="auth-aside-mark" aria-hidden="true">p.</span><p className="eyebrow eyebrow-light">Uma conta, várias possibilidades</p><h2>Compra ou começa a vender.</h2><ul><li>Explora produtos sem conta.</li><li>Guarda favoritos e acompanha encomendas.</li><li>Abre a tua loja quando estiveres pronto.</li></ul><Link href="/marketplaces">Conhecer a Praça Angola <span aria-hidden="true">→</span></Link></aside></div></div><SiteFooter/></main>;
}
