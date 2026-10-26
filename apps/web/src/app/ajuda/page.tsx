import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Centro de ajuda",
  description: "Como comprar, vender, enviar imagens e acompanhar pagamentos na PUVO.",
};

export default function HelpPage() {
  return (
    <main>
      <SiteHeader />
      <div className="page-wrap narrow-page info-page">
        <nav className="breadcrumbs" aria-label="Localização"><Link href="/">Início</Link><span>/</span><span>Centro de ajuda</span></nav>
        <header className="page-heading"><div><p className="eyebrow eyebrow-dark">Apoio</p><h1>Centro de ajuda</h1><p>Respostas para as tarefas mais comuns na PUVO.</p></div></header>
        <section className="panel">
          <h2>Comprar produtos</h2>
          <p>Adiciona produtos ao carrinho. No checkout, escolhe um dos métodos de transferência ativados por cada loja. A encomenda mostra o nome e os dados de recebimento da loja. O pagamento é feito diretamente ao vendedor.</p>
          <p>Depois de transferires, indica a referência na encomenda. Esse aviso não confirma o pagamento: o vendedor verifica o crédito no próprio extrato e confirma na PUVO.</p>
          <Link className="button button-secondary" href="/produtos">Explorar produtos</Link>
        </section>
        <section className="panel">
          <h2>Vender e receber</h2>
          <p>Cria a tua loja, configura Multicaixa Express ou transferência bancária e ativa apenas os métodos que consegues receber. Os compradores só veem as opções ativas. Cada anúncio passa por revisão antes de aparecer no catálogo.</p>
          <p>Se precisares de alterar o destino de pagamento, as encomendas já criadas conservam os dados que foram mostrados ao comprador no momento da compra.</p>
          <Link className="button button-secondary" href="/vendedor">Gerir a loja</Link>
        </section>
        <section className="panel">
          <h2>Imagens da loja e dos produtos</h2>
          <p>Envia JPEG, PNG ou WebP até 5 MB por imagem. A PUVO verifica e converte a imagem antes de a guardar. Aguarda até a pré-visualização aparecer antes de guardares a loja ou o anúncio.</p>
          <p>Se o envio falhar, tenta uma imagem válida menor ou volta a tentar. Se o erro persistir, inclui a hora do erro e a mensagem apresentada ao contactar o apoio; não envies palavras-passe nem códigos de confirmação.</p>
        </section>
        <section className="panel">
          <h2>Serviços e dúvidas</h2>
          <p>Nos serviços, o cliente e o profissional combinam condições e pagamento diretamente. Para dúvidas sobre a plataforma, escreve para <a href="mailto:info@vitaleevo.ao">info@vitaleevo.ao</a>.</p>
          <p>Consulta também a página de <Link href="/privacidade">privacidade</Link> para saberes como a PUVO apresenta e protege os dados.</p>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
