"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AccountUser = { displayName: string; email: string };

const accountLinks = [
  { title: "Perfil profissional", description: "Mostra o teu talento e recebe pedidos.", href: "/profissional", icon: "✦" },
  { title: "Serviços e propostas", description: "Gere pedidos, propostas e trabalhos.", href: "/servicos/pedidos", icon: "↔" },
  { title: "Encomendas", description: "Acompanha compras e vendas.", href: "/conta/encomendas", icon: "↗" },
  { title: "Mensagens", description: "Continua as conversas com as lojas.", href: "/conta/mensagens", icon: "•••" },
  { title: "Favoritos", description: "Encontra os produtos que guardaste.", href: "/conta/favoritos", icon: "♡" },
  { title: "A minha loja", description: "Configura a montra e gere anúncios.", href: "/vendedor", icon: "⌂" },
];

export function AccountHome() {
  const router = useRouter();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const readAccount = useCallback(async () => {
    const response = await fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { user?: AccountUser | null };
    if (response.status === 401 || (response.ok && !data.user)) return null;
    if (!response.ok) throw new Error("ACCOUNT_SESSION_UNAVAILABLE");
    return data.user ?? null;
  }, []);

  useEffect(() => {
    let active = true;
    readAccount()
      .then((account) => {
        if (!active) return;
        if (!account) router.replace("/entrar?next=%2Fconta");
        else setUser(account);
      })
      .catch(() => { if (active) setError("Não foi possível verificar a tua sessão. Confirma a ligação e tenta novamente."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [readAccount, router]);

  async function retry() {
    setLoading(true);
    setError("");
    try {
      const account = await readAccount();
      if (!account) { router.replace("/entrar?next=%2Fconta"); return; }
      setUser(account);
    } catch {
      setError("Não foi possível verificar a tua sessão. Confirma a ligação e tenta novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="loading-state" role="status" aria-live="polite">A carregar a tua conta…</div>;
  if (error) return <div className="empty-state account-load-error"><b>{error}</b><button className="button button-secondary" type="button" onClick={() => void retry()}>Tentar novamente</button></div>;
  if (!user) return null;

  return (
    <div className="account-home">
      <section className="account-profile-card" aria-label="Dados da conta">
        <span className="account-avatar" aria-hidden="true">{user.displayName.trim().slice(0, 1).toLocaleUpperCase("pt-AO")}</span>
        <div><span className="eyebrow eyebrow-dark">A tua conta</span><h2>{user.displayName}</h2><p>{user.email}</p></div>
        <span className="account-status"><i aria-hidden="true"/> Conta ativa</span>
      </section>
      <section className="account-hub-section" aria-labelledby="account-hub-title">
        <div className="section-heading"><div><h2 id="account-hub-title">O que queres fazer?</h2><p>As tuas áreas pessoais estão reunidas aqui.</p></div></div>
        <div className="account-hub-grid">
          {accountLinks.map((link) => (
            <Link className="account-hub-card" href={link.href} key={link.href}>
              <span className="account-hub-icon" aria-hidden="true">{link.icon}</span>
              <span className="account-hub-copy"><b>{link.title}</b><small>{link.description}</small></span>
              <span className="account-hub-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
