import { SiteHeader,SiteFooter } from '../../components/site-header';
import { ServicesAccount } from '../../components/services-account';
import { ProfessionalDashboard } from '../../components/professional-dashboard';
export default function Page(){return <main className="market-shell services-shell"><SiteHeader services/><div className="page-wrap service-workspace"><ServicesAccount><ProfessionalDashboard/></ServicesAccount></div><SiteFooter/></main>;}
