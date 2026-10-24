import { WorkspacePage } from '../../../../components/workspace-page';
import { ServicesAccount } from '../../../../components/services-account';
import { ServiceRequestForm } from '../../../../components/service-request-form';
import { publicApi } from '../../../../lib/api';
import { ProfessionalDetail,ServiceCategory } from '../../../../lib/services';
export default async function Page({searchParams}:{searchParams:Promise<{profissional?:string}>}){const {profissional}=await searchParams;const [categories,target]=await Promise.all([publicApi<ServiceCategory[]>('/services/categories',[]),profissional?publicApi<ProfessionalDetail|null>('/services/professionals/'+encodeURIComponent(profissional),null):null]);return <WorkspacePage area="services" services><ServicesAccount>{profissional&&!target?<div className="empty-state"><b>Este profissional não está disponível para novos pedidos.</b></div>:<ServiceRequestForm categories={categories} target={target?.profile}/>}</ServicesAccount></WorkspacePage>;}
