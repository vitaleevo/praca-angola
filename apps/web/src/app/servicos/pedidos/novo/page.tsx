import { SiteHeader,SiteFooter } from '../../../../components/site-header';
import { ServicesAccount } from '../../../../components/services-account';
import { ServiceRequestForm } from '../../../../components/service-request-form';
import { publicApi } from '../../../../lib/api';
import { ProfessionalDetail,ServiceCategory } from '../../../../lib/services';
export default async function Page({searchParams}:{searchParams:Promise<{profissional?:string}>}){const {profissional}=await searchParams;const [categories,target]=await Promise.all([publicApi<ServiceCategory[]>('/services/categories',[]),profissional?publicApi<ProfessionalDetail|null>('/services/professionals/'+encodeURIComponent(profissional),null):null]);return <main className="market-shell services-shell"><SiteHeader services/><div className="page-wrap service-workspace"><ServicesAccount>{profissional&&!target?<div className="empty-state"><b>Este profissional não está disponível para novos pedidos.</b></div>:<ServiceRequestForm categories={categories} target={target?.profile}/>}</ServicesAccount></div><SiteFooter/></main>;}
