import Link from "next/link";
import { AuthPageShell } from "../../components/auth-page-shell";
import { RequestAccessEmailForm } from "../../components/account-access-forms";

export default function RecoverPasswordPage() {
  return (
    <AuthPageShell
      eyebrow="Acesso à conta"
      title="Recupera a tua palavra-passe"
      description="Indica o e-mail da tua conta. Se estiver registado, enviamos um link para criares uma nova palavra-passe."
    >
      <RequestAccessEmailForm purpose="password-reset" />
      <p className="auth-switch"><Link href="/entrar">Voltar a entrar</Link></p>
    </AuthPageShell>
  );
}
