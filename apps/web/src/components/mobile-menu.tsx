"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type SessionUser = { displayName: string };

export function MobileMenu({
  user,
  loading,
  loggingOut,
  onLogout,
}: {
  user: SessionUser | null;
  loading: boolean;
  loggingOut: boolean;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);triggerRef.current?.focus();}};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[open]);
  const links: [string, string][] = [
    ["Explorar", "/"],
    ["Produtos", "/produtos"],
    ["Lojas", "/lojas"],
    ["Serviços e profissionais", "/servicos"],
    ["Perfil profissional", "/profissional"],
    ["Pedidos de serviços", "/servicos/pedidos"],
    ["Todos os marketplaces", "/marketplaces"],
  ];

  return (
    <div className="mobile-menu">
      <button
        className="mobile-menu-trigger"
        ref={triggerRef}
        type="button"
        aria-label={open ? "Fechar menu" : "Abrir menu"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen(!open)}
      >
        <span /><span />
      </button>
      {open && (
        <nav id="mobile-navigation" className="mobile-navigation" aria-label="Navegação móvel">
          {loading ? <p className="mobile-session-loading" role="status">A verificar a tua sessão…</p> : user ? (
            <>
              {links.map(([label, href]) => <Link href={href} key={href} onClick={() => setOpen(false)}>{label}</Link>)}
              <span className="mobile-menu-divider" />
              <p className="mobile-account-greeting">Olá, {user.displayName}</p>
              <Link href="/conta" onClick={() => setOpen(false)}>A minha conta</Link>
              <Link href="/conta/encomendas" onClick={() => setOpen(false)}>Encomendas</Link>
              <Link href="/conta/mensagens" onClick={() => setOpen(false)}>Mensagens</Link>
              <Link href="/conta/favoritos" onClick={() => setOpen(false)}>Favoritos</Link>
              <Link href="/vendedor" onClick={() => setOpen(false)}>Vender na PUVO</Link>
              <button type="button" className="mobile-logout" disabled={loggingOut} onClick={() => void onLogout()}>
                {loggingOut ? "A terminar sessão…" : "Terminar sessão"}
              </button>
            </>
          ) : (
            <>
              {links.map(([label, href]) => <Link href={href} key={href} onClick={() => setOpen(false)}>{label}</Link>)}
              <span className="mobile-menu-divider" />
              <Link href="/entrar" onClick={() => setOpen(false)}>Entrar</Link>
              <Link className="mobile-create-account" href="/registar" onClick={() => setOpen(false)}>Criar conta</Link>
              <Link href="/vendedor" onClick={() => setOpen(false)}>Vender na PUVO</Link>
            </>
          )}
        </nav>
      )}
    </div>
  );
}
