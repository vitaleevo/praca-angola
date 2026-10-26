import { Suspense } from "react";
import { BrandLockup } from "@puvo/ui/brand-lockup";
import { AdminLoginForm } from "../../components/admin-login-form";

export default function AdminLoginPage() {
  return <main className="admin-login-page"><section className="admin-login-card"><BrandLockup href="/" className="admin-brand" subtitle="Gestão da plataforma" label="P.U.V.O. Gestão da plataforma — início" /><p className="eyebrow eyebrow-dark"><span className="eyebrow-line"/> Acesso da equipa</p><h1>Entrar na gestão</h1><p>Usa a conta PUVO que recebeu acesso de administrador ou moderador.</p><Suspense fallback={<p role="status">A preparar o formulário…</p>}><AdminLoginForm /></Suspense></section></main>;
}
