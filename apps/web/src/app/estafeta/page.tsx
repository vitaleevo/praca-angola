import Link from "next/link";
import { CourierDashboard } from "../../components/courier-dashboard";
import { WorkspacePage } from "../../components/workspace-page";

export default function CourierPage() {
  return (
    <WorkspacePage area="account">
      <div className="breadcrumbs">
        <Link href="/">Início</Link>
        <span>/</span>
        <span>Estafeta</span>
      </div>
      <div className="page-heading">
        <div>
          <p className="eyebrow eyebrow-dark">
            <span className="eyebrow-line" /> Logística & Entregas
          </p>
          <h1>Painel do Estafeta</h1>
          <p>Gere as tuas corridas, confirma recolhas em lojas e valida entregas com PIN de segurança.</p>
        </div>
      </div>
      <CourierDashboard />
    </WorkspacePage>
  );
}
