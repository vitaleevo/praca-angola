import Link from "next/link";
import { AuthPageShell } from "../../components/auth-page-shell";
import { RequestAccessEmailForm } from "../../components/account-access-forms";

export default function ConfirmEmailPage() {
  return (
    <AuthPageShell
      eyebrow="Confirmação de conta"
      title="Confirma o teu e-mail"
      description="Se o registo puder avançar, enviaremos um link para esse endereço. Se já tens conta, entra ou recupera a palavra-passe."
    >
      <RequestAccessEmailForm purpose="verification" />
      <p className="auth-switch">
        Já tens conta? <Link href="/entrar">Entrar</Link> · <Link href="/recuperar-palavra-passe">Recuperar palavra-passe</Link>
      </p>
    </AuthPageShell>
  );
}
