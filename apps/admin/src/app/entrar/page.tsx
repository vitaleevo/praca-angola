import { Suspense } from "react";
import Link from "next/link";
import { AdminLoginForm } from "../../components/admin-login-form";

export default function AdminLoginPage() {
  return <main className="admin-login-page"><section className="admin-login-card"><Link className="admin-brand" href="/"><span className="brand-mark">P</span><span><strong>PUVO</strong><small>Gestão da plataforma</small></span></Link><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Acesso da equipa</p><h1>Entrar na gestão</h1><p>Usa a conta PUVO que recebeu acesso de administrador ou moderador.</p><Suspense fallback={<p role="status">A preparar o formulário…</p>}><AdminLoginForm /></Suspense></section></main>;
}
