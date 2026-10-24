import { WorkspacePage } from '../../../components/workspace-page';
import { ServicesAccount } from '../../../components/services-account';
import { ServiceJobsList } from '../../../components/service-jobs';
export default async function Page({searchParams}:{searchParams:Promise<{scope?:string;page?:string}>}){const {scope,page}=await searchParams;return <WorkspacePage area="services" services><ServicesAccount><ServiceJobsList scope={scope==='market'?'market':'mine'} page={Math.max(1,Math.min(10000,Number.parseInt(page??'1',10)||1))}/></ServicesAccount></WorkspacePage>;}
