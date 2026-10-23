import { SiteHeader,SiteFooter } from '../../../components/site-header';
import { ServicesAccount } from '../../../components/services-account';
import { ServiceNotifications } from '../../../components/service-notifications';
export default function Page(){return <main className="market-shell services-shell"><SiteHeader services/><div className="page-wrap service-workspace"><ServicesAccount><ServiceNotifications/></ServicesAccount></div><SiteFooter/></main>;}
