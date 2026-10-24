"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type AccountUser = { displayName: string; email: string };

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
      <section className="panel account-overview" aria-labelledby="account-overview-title">
        <h2 id="account-overview-title">Bem-vindo à tua conta</h2>
        <p>Usa a navegação lateral para acompanhar encomendas, responder a mensagens, consultar favoritos e gerir as tuas áreas de venda e serviços.</p>
      </section>
    </div>
  );
}
