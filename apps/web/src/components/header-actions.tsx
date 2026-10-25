"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MobileMenu } from "./mobile-menu";
import { HeaderIcon } from "./header-icon";

type SessionUser = { id: string; displayName: string; email: string; roles: string[] };
type SessionResponse = { user?: SessionUser | null };

export function HeaderAuth({ workspace = false }: { workspace?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [sessionError,setSessionError]=useState(false);
  const [sessionVersion,setSessionVersion]=useState(0);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error('SESSION_UNAVAILABLE');
        const data = await response.json() as SessionResponse;
        return data.user ?? null;
      })
      .then((sessionUser) => {
        if (!active) return;
        setUser(sessionUser);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setSessionError(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [sessionVersion]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
      if (!response.ok && response.status !== 401) {
        setLogoutError("Não foi possível terminar a sessão. Tenta novamente.");
        return;
      }
      setUser(null);
      router.replace("/");
    } catch {
      setLogoutError("Sem ligação ao servidor. A tua sessão continua ativa; tenta novamente.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="header-auth-area">
      {sessionError ? <button className="text-button" onClick={()=>{setSessionError(false);setLoading(true);setSessionVersion(v=>v+1);}}>Reverificar sessão</button> : loading ? (
        <span className="account-nav-placeholder" aria-label="A verificar sessão" />
      ) : user ? (
        <nav className="account-nav" aria-label={`Sessão de ${user.displayName}`}>
          <Link className={`header-icon-link account-icon-link${pathname === "/conta" ? " active" : ""}`} href="/conta" aria-label="A minha conta" aria-current={pathname === "/conta" ? "page" : undefined} title="A minha conta"><HeaderIcon name="account"/></Link>
          <button type="button" className="header-logout" onClick={() => void logout()} disabled={loggingOut}>
            {loggingOut ? "A sair…" : "Sair"}
          </button>
        </nav>
      ) : (
        <nav className="auth-nav" aria-label="Acesso à conta">
          <Link className="login-link" href="/entrar">Entrar</Link>
          <Link className="account-create-link" href="/registar">Criar conta</Link>
        </nav>
      )}
      <MobileMenu user={user} loading={loading || sessionError} loggingOut={loggingOut} onLogout={logout} workspace={workspace} />
      {logoutError && <p className="logout-error" role="alert">{logoutError}</p>}
    </div>
  );
}
