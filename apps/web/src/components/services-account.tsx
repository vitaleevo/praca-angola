"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function ServicesAccount({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("SESSION_UNAVAILABLE");
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        if (!data.user) router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        else setReady(true);
      })
      .catch(() => {
        if (active) setError("Não foi possível verificar a sessão. Atualiza a página para tentar novamente.");
      });
    return () => { active = false; };
  }, [router]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!ready) return <p className="loading-state" role="status">A verificar a conta…</p>;
  return <>{children}</>;
}
