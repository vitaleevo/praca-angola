import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Pedir eliminação de dados",
  description: "Como pedir a eliminação dos dados da tua conta e dos canais Meta ligados à PUVO.",
};

export default function DeleteDataPage() {
  return (
    <main>
      <SiteHeader />
      <div className="page-wrap narrow-page info-page">
        <nav className="breadcrumbs" aria-label="Localização"><Link href="/">Início</Link><span>/</span><span>Eliminação de dados</span></nav>
        <header className="page-heading"><div><p className="eyebrow eyebrow-dark">Os teus dados</p><h1>Pedir eliminação de dados</h1><p>Instruções para contas PUVO e canais Facebook, Instagram ou WhatsApp ligados à tua loja.</p></div></header>
        <section className="panel">
          <h2>Como fazer o pedido</h2>
          <p>Envia um email para <a href="mailto:info@vitaleevo.ao?subject=Pedido%20de%20elimina%C3%A7%C3%A3o%20de%20dados%20PUVO">info@vitaleevo.ao</a> com o assunto «Pedido de eliminação de dados PUVO». Escreve a partir do endereço associado à tua conta, se ainda tiveres acesso, e indica se pretendes eliminar a conta, os dados de uma loja ou os dados de um canal Meta ligado. Não envies palavras-passe, códigos de acesso nem tokens.</p>
          <p>Se já removeste a app PUVO em «Apps e sites» do Facebook, podes fazer o mesmo pedido por email e identificar o nome da tua loja ou o endereço da conta PUVO. Podemos pedir uma confirmação de identidade antes de alterar ou revelar dados.</p>
        </section>
        <section className="panel">
          <h2>O que acontece depois</h2>
          <p>Confirmaremos a receção do pedido e analisaremos os dados da conta, da loja e dos canais ligados. Eliminaremos ou desassociaremos os dados que possam ser apagados e explicaremos qualquer conservação necessária para encomendas, segurança ou outras obrigações aplicáveis. Comunicaremos o resultado e os passos seguintes pelo endereço usado no pedido.</p>
          <p>Desligar um canal no CRM impede novas sincronizações desse canal, mas não substitui um pedido para apagar dados já guardados. Para saber mais sobre os dados tratados pela PUVO, consulta a <Link href="/privacidade">Política de Privacidade</Link>.</p>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
