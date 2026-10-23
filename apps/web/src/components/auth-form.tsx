"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type AuthResponse = { user?: { id: string }; code?: string; message?: string | string[] };

function internalDestination(nextPath?: string): string {
  if (!nextPath || nextPath.length > 2048 || !nextPath.startsWith("/") || nextPath.startsWith("//") || nextPath.includes("\\")) {
    return "/conta";
  }

  try {
    const destination = new URL(nextPath, window.location.origin);
    if (destination.pathname === "/entrar" || destination.pathname === "/registar") return "/conta";
    return destination.origin === window.location.origin
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : "/conta";
  } catch {
    return "/conta";
  }
}

export function AuthForm({ mode, nextPath }: { mode: "login" | "register"; nextPath?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [emailNeedsVerification, setEmailNeedsVerification] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/v1/auth/me", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          if (active) setCheckingSession(false);
          return;
        }
        const data = await response.json() as AuthResponse;
        if (active && data.user) router.replace(internalDestination(nextPath));
        else if (active) setCheckingSession(false);
      })
      .catch(() => { if (active) setCheckingSession(false); });
    return () => { active = false; };
  }, [mode, nextPath, router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setEmailNeedsVerification(false);
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (mode === "register" && password !== String(form.get("passwordConfirm") ?? "")) {
      setError("As palavras-passe não coincidem.");
      setBusy(false);
      return;
    }

    const payload = mode === "register"
      ? { displayName: String(form.get("displayName") ?? "").trim(), email: String(form.get("email") ?? "").trim().toLowerCase(), password }
      : { email: String(form.get("email") ?? "").trim().toLowerCase(), password };

    try {
      const response = await fetch(`/api/v1/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({})) as AuthResponse;

      if (!response.ok) {
        const serverMessage = Array.isArray(data.message) ? data.message.join(" ") : data.message;
        if (data.code === "EMAIL_NOT_VERIFIED") {
          setError("Confirma o teu e-mail para ativares a conta.");
          setEmailNeedsVerification(true);
        }
        else if (response.status === 401) setError("E-mail ou palavra-passe inválidos. Confirma os dados e tenta novamente.");
        else if (response.status === 429) setError(serverMessage || "Foram feitas muitas tentativas. Aguarda alguns minutos e tenta novamente.");
        else if (data.code === "EMAIL_DELIVERY_UNAVAILABLE") setError("O envio de e-mail está temporariamente indisponível. Tenta novamente mais tarde.");
        else setError(serverMessage || (mode === "register" ? "Não foi possível criar a conta. Confirma os dados e tenta novamente." : "Não foi possível iniciar sessão. Tenta novamente."));
        return;
      }

      if (mode === "register") {
        router.replace("/confirmar-email");
      } else {
        router.replace(internalDestination(nextPath));
      }
    } catch {
      setError("Sem ligação ao servidor. Verifica a ligação e tenta novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (checkingSession) {
    return <div className="auth-loading" role="status" aria-live="polite">A verificar a tua sessão…</div>;
  }

  return (
    <form className="stack-form auth-form" onSubmit={submit}>
      {mode === "register" && (
        <label htmlFor="auth-display-name">
          Nome completo
          <input id="auth-display-name" name="displayName" type="text" autoComplete="name" required minLength={2} maxLength={100} />
        </label>
      )}
      <label htmlFor="auth-email">
        E-mail
        <input id="auth-email" name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} />
      </label>
      <label htmlFor="auth-password">
        Palavra-passe
        <span className="password-field">
          <input
            id="auth-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            minLength={mode === "register" ? 12 : 1}
            maxLength={128}
            pattern={mode === "register" ? "(?=.*[A-Za-z])(?=.*[0-9]).{12,128}" : undefined}
            aria-describedby={mode === "register" ? "password-guidance" : undefined}
          />
          <button className="password-toggle" type="button" aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </span>
        {mode === "register" && <small id="password-guidance">Pelo menos 12 caracteres, incluindo letras e números.</small>}
      </label>
      {mode === "register" && (
        <label htmlFor="auth-password-confirm">
          Confirmar palavra-passe
          <span className="password-field">
            <input id="auth-password-confirm" name="passwordConfirm" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} />
            <button className="password-toggle" type="button" aria-label={showPassword ? "Ocultar palavras-passe" : "Mostrar palavras-passe"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </span>
        </label>
      )}
      {error && <div className="form-error auth-error" role="alert"><p>{error}</p>{emailNeedsVerification && <Link href="/confirmar-email">Reenviar o e-mail de confirmação</Link>}</div>}
      {mode === "login" && <Link className="auth-forgot-link" href="/recuperar-palavra-passe">Esqueci-me da palavra-passe</Link>}
      <button className="button button-primary button-wide auth-submit" type="submit" disabled={busy}>
        {busy ? (mode === "register" ? "A criar a conta…" : "A entrar…") : (mode === "register" ? "Criar conta" : "Entrar na minha conta")}
      </button>
    </form>
  );
}
