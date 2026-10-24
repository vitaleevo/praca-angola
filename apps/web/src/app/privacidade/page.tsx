import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "../../components/site-header";

export const metadata: Metadata = {
  title: "Privacidade — PUVO",
  description: "Informação sobre os dados usados para contas, lojas, encomendas e serviços na PUVO.",
};

export default function PrivacyPage() {
  return (
    <main>
      <SiteHeader />
      <div className="page-wrap narrow-page info-page">
        <nav className="breadcrumbs" aria-label="Localização"><Link href="/">Início</Link><span>/</span><span>Privacidade</span></nav>
        <header className="page-heading"><div><p className="eyebrow eyebrow-dark">Os teus dados</p><h1>Privacidade na PUVO</h1><p>Como os dados são usados nas funções atuais da plataforma. Atualizado em 24 de outubro de 2026.</p></div></header>
        <section className="panel">
          <h2>Responsável e contacto</h2>
          <p>O responsável pelo tratamento dos dados na PUVO é Alexandre Macosso. Para pedidos sobre privacidade, escreve para <a href="mailto:alemacosso@gmail.com">alemacosso@gmail.com</a>.</p>
        </section>
        <section className="panel">
          <h2>Conta e segurança</h2>
          <p>Para criares uma conta, tens de fornecer nome, endereço de email e palavra-passe. A PUVO guarda uma representação protegida da palavra-passe, usa um cookie de sessão para manter a autenticação e regista eventos necessários para segurança e operação da conta. Os restantes dados só são pedidos quando usas a função correspondente, como criar uma loja, publicar um anúncio ou fazer uma encomenda.</p>
        </section>
        <section className="panel">
          <h2>O que aparece publicamente</h2>
          <p>Os dados que publicas numa loja, anúncio ou perfil profissional podem aparecer no catálogo. Contactos comerciais da loja só são apresentados quando o proprietário os ativa. Pedidos, conversas e notificações privados são mostrados às contas autorizadas em cada fluxo.</p>
        </section>
        <section className="panel">
          <h2>Encomendas e pagamentos</h2>
          <p>A PUVO guarda os dados da encomenda, do comprador e das ações de confirmação para permitir a compra, a entrega e a resolução de problemas. Os dados de recebimento configurados pelo vendedor são cifrados. Apenas o comprador da respetiva encomenda recebe o destino completo escolhido para fazer uma transferência manual.</p>
          <p>O dinheiro é transferido diretamente para o vendedor. A PUVO não recebe o valor nem confirma automaticamente a entrada de fundos; o vendedor faz a confirmação após consultar o extrato.</p>
        </section>
        <section className="panel">
          <h2>Imagens, mensagens e avisos</h2>
          <p>As imagens enviadas são processadas e guardadas para aparecerem nos anúncios ou perfis autorizados. A plataforma conserva mensagens, avaliações, denúncias e notificações necessárias ao funcionamento desses recursos. Envia emails de confirmação e recuperação da conta; avisos de serviços por email dependem da preferência da conta.</p>
        </section>
        <section className="panel">
          <h2>Com quem partilhamos e durante quanto tempo</h2>
          <p>Compradores, vendedores e profissionais recebem os dados necessários para a encomenda ou pedido em que participam. Prestadores técnicos de alojamento, armazenamento e envio de email tratam os dados necessários para manter a plataforma em funcionamento.</p>
          <p>Os dados da conta, encomendas, mensagens e eventos de segurança são conservados enquanto forem necessários para operar os serviços e cumprir obrigações aplicáveis. Ainda não existe um prazo único de eliminação automática para todos esses registos; podes pedir informação ou eliminação através do contacto acima.</p>
        </section>
        <section className="panel">
          <h2>Pedidos sobre os teus dados</h2>
          <p>Podes pedir informação, acesso, correção, apagamento ou bloqueio dos teus dados e opor-te a determinados tratamentos. Escreve para <a href="mailto:alemacosso@gmail.com">alemacosso@gmail.com</a>, de preferência a partir do email da tua conta; poderemos pedir uma confirmação de identidade antes de entregar ou alterar dados. O pedido será analisado tendo em conta encomendas, segurança e obrigações aplicáveis.</p>
          <p>Também podes consultar os teus direitos e apresentar uma reclamação à <a href="https://apd.ao/ao/direitos-do-cidadao/" rel="noreferrer">Agência de Protecção de Dados</a>.</p>
          <p>Para ajuda com uma compra ou com a tua loja, visita o <Link href="/ajuda">Centro de ajuda</Link>.</p>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}
