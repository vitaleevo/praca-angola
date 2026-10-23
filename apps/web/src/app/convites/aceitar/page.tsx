import { AcceptTeamInvitation } from '../../../components/accept-team-invitation';
import { SiteHeader,SiteFooter } from '../../../components/site-header';
export const metadata={title:'Aceitar convite — PUVO',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){const {token}=await searchParams;return <main><SiteHeader/><div className="team-invitation-page"><AcceptTeamInvitation token={token??''}/></div><SiteFooter/></main>;}
