"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type LoginResponse = { user?: { roles?: string[] }; code?: string; message?: string | string[] };

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "").trim().toLowerCase(), password: String(form.get("password") ?? "") }),
      });
      const data = await response.json().catch(() => ({})) as LoginResponse;
      if (!response.ok) throw new Error(data.code === "EMAIL_NOT_VERIFIED" ? "Confirma o teu email antes de entrar." : Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Credenciais inválidas.");
      const roles = data.user?.roles ?? [];
      if (!roles.some((role) => ["platform_owner", "administrator", "moderator"].includes(role))) {
        await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
        throw new Error("Esta conta não tem acesso à gestão da PUVO.");
      }
      const next = searchParams.get("next");
      const safeNext = next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/entrar") ? next : "/";
      router.replace(safeNext);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível entrar. Tenta novamente.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="admin-login-form" onSubmit={(event) => void submit(event)}>
    <label htmlFor="admin-email">Email de trabalho<input id="admin-email" name="email" type="email" autoComplete="username" required maxLength={254} /></label>
    <label htmlFor="admin-password">Palavra-passe<input id="admin-password" name="password" type="password" autoComplete="current-password" required maxLength={128} /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button button-primary" type="submit" disabled={busy}>{busy ? "A verificar…" : "Entrar na gestão"}</button>
    <a href="https://puvo.vitaleevo.ao/recuperar-palavra-passe">Esqueci-me da palavra-passe</a>
  </form>;
}
