import { SiteHeader,SiteFooter } from '../../../components/site-header';
import { ServicesAccount } from '../../../components/services-account';
import { ServiceJobsList } from '../../../components/service-jobs';
export default async function Page({searchParams}:{searchParams:Promise<{scope?:string;page?:string}>}){const {scope,page}=await searchParams;return <main className="market-shell services-shell"><SiteHeader services/><div className="page-wrap service-workspace"><ServicesAccount><ServiceJobsList scope={scope==='market'?'market':'mine'} page={Math.max(1,Math.min(10000,Number.parseInt(page??'1',10)||1))}/></ServicesAccount></div><SiteFooter/></main>;}
