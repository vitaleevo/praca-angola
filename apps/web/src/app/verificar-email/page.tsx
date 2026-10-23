import Link from "next/link";
import { AuthPageShell } from "../../components/auth-page-shell";
import { VerifyEmailForm } from "../../components/account-access-forms";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthPageShell
      eyebrow="Ativação da conta"
      title={token ? "Confirma o teu e-mail" : "Link de confirmação em falta"}
      description={token ? "Confirma o endereço para ativares a tua conta PUVO." : "Pede um novo link para confirmar o endereço da tua conta."}
    >
      {token ? <VerifyEmailForm token={token} /> : <p className="auth-form-note">Podes pedir outro link na página de <Link href="/confirmar-email">confirmação de e-mail</Link>.</p>}
    </AuthPageShell>
  );
}
