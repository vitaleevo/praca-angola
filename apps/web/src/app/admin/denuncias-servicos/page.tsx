import Link from 'next/link';
import { SiteHeader,SiteFooter } from '../../../components/site-header';
import { ServicesAccount } from '../../../components/services-account';
import { ServiceReportModeration } from '../../../components/service-report-moderation';
export default function Page(){return <main className="market-shell services-shell"><SiteHeader services/><div className="page-wrap service-workspace"><ServicesAccount><Link className="text-link" href="/admin/moderacao">← Moderação</Link><ServiceReportModeration/></ServicesAccount></div><SiteFooter/></main>;}
