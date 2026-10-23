import Link from 'next/link';
import { SiteHeader,SiteFooter } from '../../../components/site-header';
import { ServicesAccount } from '../../../components/services-account';
import { AdManager } from '../../../components/ad-manager';
export default function Page(){return <main className="market-shell"><SiteHeader/><div className="page-wrap service-workspace"><ServicesAccount><Link href="/admin/moderacao">← Moderação</Link><AdManager/></ServicesAccount></div><SiteFooter/></main>;}
