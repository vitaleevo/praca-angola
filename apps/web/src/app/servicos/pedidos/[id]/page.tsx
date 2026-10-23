import { SiteHeader,SiteFooter } from '../../../../components/site-header';
import { ServicesAccount } from '../../../../components/services-account';
import { ServiceJobDetail } from '../../../../components/service-jobs';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <main className="market-shell services-shell"><SiteHeader services/><div className="page-wrap service-workspace"><ServicesAccount><ServiceJobDetail id={id}/></ServicesAccount></div><SiteFooter/></main>;}
