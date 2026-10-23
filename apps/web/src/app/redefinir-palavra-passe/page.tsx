import Link from "next/link";
import { AuthPageShell } from "../../components/auth-page-shell";
import { ResetPasswordForm } from "../../components/account-access-forms";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthPageShell
      eyebrow="Acesso à conta"
      title={token ? "Cria uma nova palavra-passe" : "Link de recuperação em falta"}
      description={token ? "Escolhe uma palavra-passe segura para voltares à tua conta." : "Pede novas instruções para recuperar o acesso."}
    >
      {token ? <ResetPasswordForm token={token} /> : <p className="auth-form-note">Podes pedir um novo link na página de <Link href="/recuperar-palavra-passe">recuperação de palavra-passe</Link>.</p>}
    </AuthPageShell>
  );
}
