import Link from "next/link";
import { SiteFooter, SiteHeader } from "./site-header";

export function AuthPageShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main>
      <SiteHeader />
      <div className="auth-page">
        <div className="auth-layout">
          <section className="auth-card" aria-labelledby="auth-page-title">
            <p className="eyebrow eyebrow-dark"><span className="eyebrow-line" /> {eyebrow}</p>
            <h1 id="auth-page-title">{title}</h1>
            <p>{description}</p>
            {children}
          </section>
          <aside className="auth-aside">
            <span className="auth-aside-mark" aria-hidden="true">p.</span>
            <p className="eyebrow eyebrow-light">A tua conta PUVO</p>
            <h2>O que precisas continua perto.</h2>
            <ul>
              <li>Protege o acesso à tua conta.</li>
              <li>Retoma conversas com as lojas.</li>
              <li>Acompanha encomendas e favoritos.</li>
            </ul>
            <Link href="/produtos">Explorar produtos <span aria-hidden="true">→</span></Link>
          </aside>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
