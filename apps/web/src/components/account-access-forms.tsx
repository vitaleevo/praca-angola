"use client";

import { useState } from "react";
import Link from "next/link";

type RequestPurpose = "verification" | "password-reset";

function responseMessage(data: { message?: string | string[] }): string {
  return Array.isArray(data.message) ? data.message.join(" ") : data.message ?? "Não foi possível concluir o pedido. Tenta novamente.";
}

export function RequestAccessEmailForm({ purpose }: { purpose: RequestPurpose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requested, setRequested] = useState(false);
  const isVerification = purpose === "verification";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    try {
      const response = await fetch(`/api/v1/auth/${isVerification ? "email-verification-requests" : "password-reset-requests"}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) {
        setError(response.status === 503 ? "O envio de e-mail está temporariamente indisponível. Tenta novamente mais tarde." : responseMessage(data));
        return;
      }
      setRequested(true);
    } catch {
      setError("Sem ligação ao servidor. Verifica a ligação e tenta novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (requested) {
    return (
      <div className="auth-confirmation" role="status" aria-live="polite">
        <span className="auth-confirmation-icon" aria-hidden="true">✓</span>
        <h2>Verifica a tua caixa de entrada</h2>
        <p>Se o endereço estiver associado a uma conta, enviaremos as instruções. Confirma também a pasta de spam.</p>
        <button type="button" className="auth-inline-button" onClick={() => setRequested(false)}>Tentar com outro e-mail</button>
      </div>
    );
  }

  return (
    <form className="stack-form auth-form" onSubmit={submit}>
      <label htmlFor={`${purpose}-email`}>
        E-mail da conta
        <input id={`${purpose}-email`} name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} />
      </label>
      {error && <p className="form-error auth-error" role="alert">{error}</p>}
      <button className="button button-primary button-wide auth-submit" type="submit" disabled={busy}>
        {busy ? "A enviar…" : isVerification ? "Enviar e-mail de confirmação" : "Enviar instruções"}
      </button>
    </form>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/auth/email-verifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) {
        setError(response.status === 400 ? "Este link é inválido ou expirou. Pede um novo e-mail de confirmação." : responseMessage(data));
        return;
      }
      setVerified(true);
    } catch {
      setError("Sem ligação ao servidor. Verifica a ligação e tenta novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <div className="auth-confirmation" role="status" aria-live="polite">
        <span className="auth-confirmation-icon" aria-hidden="true">✓</span>
        <h2>E-mail confirmado</h2>
        <p>O e-mail está confirmado. Já podes entrar na tua conta PUVO.</p>
        <Link className="button button-primary button-wide auth-submit" href="/entrar">Entrar na minha conta</Link>
        <Link className="auth-inline-link" href="https://gestao.puvo.vitaleevo.ao/entrar?next=%2F">Sou da equipa PUVO — entrar na gestão</Link>
      </div>
    );
  }

  return (
    <form className="stack-form auth-form" onSubmit={submit}>
      <p className="auth-form-note">Ao confirmar, ativamos o acesso à tua conta.</p>
      {error && <p className="form-error auth-error" role="alert">{error}</p>}
      <button className="button button-primary button-wide auth-submit" type="submit" disabled={busy}>
        {busy ? "A confirmar…" : "Confirmar e-mail"}
      </button>
      {error && <Link className="auth-inline-link" href="/confirmar-email">Pedir outro link</Link>}
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reset, setReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("passwordConfirm") ?? "")) {
      setError("As palavras-passe não coincidem.");
      setBusy(false);
      return;
    }

    try {
      const response = await fetch("/api/v1/auth/password-resets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) {
        setError(response.status === 400 ? "Este link é inválido ou expirou. Pede novas instruções." : responseMessage(data));
        return;
      }
      setReset(true);
    } catch {
      setError("Sem ligação ao servidor. Verifica a ligação e tenta novamente.");
    } finally {
      setBusy(false);
    }
  }

  if (reset) {
    return (
      <div className="auth-confirmation" role="status" aria-live="polite">
        <span className="auth-confirmation-icon" aria-hidden="true">✓</span>
        <h2>Palavra-passe atualizada</h2>
        <p>As sessões anteriores foram terminadas. Entra com a tua nova palavra-passe.</p>
        <Link className="button button-primary button-wide auth-submit" href="/entrar">Entrar na minha conta</Link>
      </div>
    );
  }

  return (
    <form className="stack-form auth-form" onSubmit={submit}>
      <label htmlFor="reset-password">
        Nova palavra-passe
        <span className="password-field">
          <input id="reset-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{12,128}" aria-describedby="reset-password-guidance" />
          <button className="password-toggle" type="button" aria-label={showPassword ? "Ocultar palavra-passe" : "Mostrar palavra-passe"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Ocultar" : "Mostrar"}</button>
        </span>
        <small id="reset-password-guidance">Pelo menos 12 caracteres, incluindo letras e números.</small>
      </label>
      <label htmlFor="reset-password-confirm">
        Confirmar palavra-passe
        <input id="reset-password-confirm" name="passwordConfirm" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} maxLength={128} />
      </label>
      {error && <p className="form-error auth-error" role="alert">{error}</p>}
      <button className="button button-primary button-wide auth-submit" type="submit" disabled={busy}>{busy ? "A guardar…" : "Guardar nova palavra-passe"}</button>
    </form>
  );
}
