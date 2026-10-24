import { WorkspacePage } from '../../../../components/workspace-page';
import { ServicesAccount } from '../../../../components/services-account';
import { ServiceJobDetail } from '../../../../components/service-jobs';
export const metadata={robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <WorkspacePage area="services" services><ServicesAccount><ServiceJobDetail id={id}/></ServicesAccount></WorkspacePage>;}
