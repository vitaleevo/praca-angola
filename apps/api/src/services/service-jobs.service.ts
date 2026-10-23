import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { ProfessionalsService } from './professionals.service';
import { ProposalDto, ServiceQuery, ServiceRequestDto, ServiceReviewDto } from './services.dto';
import { ServiceNotificationsService } from './service-notifications.service';
type RequestRow={id:string;buyer_id:string;category_id:string;target_profile_id:string|null;status:string;accepted_proposal_id:string|null};
type ProfileRow={id:string;category_id:string;status:string};
@Injectable()
export class ServiceJobsService {
 constructor(private readonly db:DatabaseService,private readonly professionals:ProfessionalsService,private readonly notices:ServiceNotificationsService){}
 private async profile(user:AuthenticatedUser){return (await this.db.query<ProfileRow>('SELECT id,category_id,status FROM professional_profiles WHERE user_id=$1',[user.id])).rows[0];}
 async create(user:AuthenticatedUser,b:ServiceRequestDto){
  const categoryId=await this.professionals.category(b.categorySlug);
  return this.db.transaction(async client=>{
   await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
   const rate=await client.query<{total:number}>(`SELECT count(*)::int AS total FROM service_requests WHERE buyer_id=$1 AND created_at>now()-interval '1 day'`,[user.id]);
   if(rate.rows[0].total>=10)throw new HttpException('Podes publicar até 10 pedidos por dia.',429);
   let targetUserId:string|undefined;if(b.targetProfileId){const target=await client.query<{user_id:string}>(`SELECT p.user_id FROM professional_profiles p JOIN users u ON u.id=p.user_id WHERE p.id=$1 AND p.status='published' AND p.category_id=$2 AND p.user_id<>$3 AND p.availability<>'unavailable' AND u.status='active'`,[b.targetProfileId,categoryId,user.id]);if(!target.rowCount)throw new BadRequestException('Este profissional não pode receber este pedido.');targetUserId=target.rows[0].user_id;}
   const r=await client.query(`INSERT INTO service_requests(buyer_id,category_id,target_profile_id,title,description,province,work_mode,budget) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status`,[user.id,categoryId,b.targetProfileId??null,b.title,b.description,b.province,b.workMode,b.budget??null]);
   await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,'service.request.created','service_request',$2)`,[user.id,r.rows[0].id]);if(targetUserId)await this.notices.add(client,targetUserId,`request:${r.rows[0].id}`,'request','Recebeste um pedido de serviço',r.rows[0].id);return r.rows[0];
  });
 }
 async list(user:AuthenticatedUser,q:ServiceQuery){
  const pro=await this.profile(user),page=q.page??1,values:unknown[]=[user.id,pro?.id??null];
  const where=q.scope==='market'?"r.status='open' AND r.buyer_id<>$1 AND (r.target_profile_id IS NULL OR r.target_profile_id=$2) AND r.category_id=$3":"(r.buyer_id=$1 OR r.target_profile_id=$2 OR EXISTS(SELECT 1 FROM service_proposals sp WHERE sp.request_id=r.id AND sp.profile_id=$2))";
  if(q.scope==='market'){if(pro?.status!=='published')throw new ForbiddenException('Publica primeiro o teu perfil profissional.');values.push(pro.category_id);}
  const from=`FROM service_requests r JOIN categories c ON c.id=r.category_id WHERE ${where}`;
  const count=await this.db.query<{total:number}>(`SELECT count(*)::int AS total ${from}`,values);
  const rows=await this.db.query(`SELECT r.id,r.title,r.description,r.province,r.work_mode,r.budget::text,r.status,r.created_at,c.name AS category,(r.buyer_id=$1) AS is_buyer,(SELECT count(*)::int FROM service_proposals sp WHERE sp.request_id=r.id) AS proposal_count ${from} ORDER BY r.updated_at DESC,r.id LIMIT 20 OFFSET $${values.length+1}`,[...values,(page-1)*20]);
  return {items:rows.rows,page,total:count.rows[0].total,pages:Math.ceil(count.rows[0].total/20)};
 }
 async detail(user:AuthenticatedUser,id:string){
  const result=await this.db.query<RequestRow & Record<string,unknown>>(`SELECT r.id,r.buyer_id,r.category_id,r.target_profile_id,r.title,r.description,r.province,r.work_mode,r.budget::text,r.status,r.accepted_proposal_id,r.created_at,c.name AS category,u.display_name AS client_name FROM service_requests r JOIN categories c ON c.id=r.category_id JOIN users u ON u.id=r.buyer_id WHERE r.id=$1`,[id]);
  const r=result.rows[0];if(!r)throw new NotFoundException('Pedido não encontrado.');
  const pro=await this.profile(user),isBuyer=r.buyer_id===user.id;
  const mine=pro?await this.db.query('SELECT 1 FROM service_proposals WHERE request_id=$1 AND profile_id=$2',[id,pro.id]):null;
  const eligible=pro?.status==='published'&&r.category_id===pro.category_id&&r.status==='open'&&(!r.target_profile_id||r.target_profile_id===pro.id)&&!isBuyer;
  if(!isBuyer&&!eligible&&!mine?.rowCount&&r.target_profile_id!==pro?.id)throw new NotFoundException('Pedido não encontrado.');
  const proposals=await this.db.query(`SELECT sp.id,sp.amount::text,sp.description,sp.delivery_days,sp.status,sp.created_at,p.id AS profile_id,p.display_name,p.slug,p.headline FROM service_proposals sp JOIN professional_profiles p ON p.id=sp.profile_id WHERE sp.request_id=$1 AND ($2::boolean OR sp.profile_id=$3) ORDER BY sp.created_at`,[id,isBuyer,pro?.id??null]);
  const review=await this.db.query('SELECT rating,body FROM service_reviews WHERE request_id=$1',[id]);
  const {buyer_id:ignoredBuyer,...safe}=r;void ignoredBuyer;
  const declineReason=await this.db.query<{provider_decline_reason:string}>('SELECT provider_decline_reason FROM service_requests WHERE id=$1',[id]);
  return {request:{...safe,provider_decline_reason:declineReason.rows[0].provider_decline_reason},isBuyer,canDecline:!isBuyer&&r.status==='open'&&r.target_profile_id===pro?.id,canPropose:Boolean(eligible&&!mine?.rowCount),proposals:proposals.rows,review:review.rows[0]??null};
 }
 async propose(user:AuthenticatedUser,id:string,b:ProposalDto){
  const pro=await this.profile(user);if(pro?.status!=='published')throw new ForbiddenException('Precisas de um perfil profissional publicado.');
  try{return await this.db.transaction(async client=>{
   const r=(await client.query<RequestRow>(`SELECT id,buyer_id,category_id,target_profile_id,status,accepted_proposal_id FROM service_requests WHERE id=$1 FOR UPDATE`,[id])).rows[0];
   if(!r||r.status!=='open'||r.buyer_id===user.id||r.category_id!==pro.category_id||(r.target_profile_id&&r.target_profile_id!==pro.id))throw new BadRequestException('Este pedido não está disponível para proposta.');
   const count=await client.query<{total:number}>('SELECT count(*)::int AS total FROM service_proposals WHERE request_id=$1',[id]);if(count.rows[0].total>=50)throw new BadRequestException('O pedido atingiu o limite de propostas.');
   const result=await client.query(`INSERT INTO service_proposals(request_id,profile_id,amount,description,delivery_days) VALUES($1,$2,$3,$4,$5) RETURNING id,status`,[id,pro.id,b.amount,b.description,b.deliveryDays]);await this.notices.add(client,r.buyer_id,`proposal:${result.rows[0].id}`,'proposal','Recebeste uma proposta',id);return result.rows[0];
  });}catch(e){if((e as {code?:string}).code==='23505')throw new ConflictException('Já enviaste uma proposta para este pedido.');throw e;}
 }
 async accept(user:AuthenticatedUser,id:string,proposalId:string){return this.db.transaction(async client=>{
  const request=(await client.query<RequestRow>('SELECT id,buyer_id,status,accepted_proposal_id FROM service_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!request||request.buyer_id!==user.id)throw new NotFoundException('Pedido não encontrado.');if(request.status!=='open')throw new ConflictException('Este pedido já não aceita propostas.');
  const p=await client.query<{id:string;user_id:string}>(`SELECT sp.id,p.user_id FROM service_proposals sp JOIN professional_profiles p ON p.id=sp.profile_id JOIN users u ON u.id=p.user_id WHERE sp.id=$1 AND sp.request_id=$2 AND sp.status='pending' AND p.status='published' AND u.status='active'`,[proposalId,id]);if(!p.rowCount)throw new BadRequestException('Proposta indisponível.');
  await client.query(`UPDATE service_proposals SET status=CASE WHEN id=$2 THEN 'accepted' ELSE 'declined' END WHERE request_id=$1 AND status='pending'`,[id,proposalId]);
  await client.query(`UPDATE service_requests SET status='awarded',accepted_proposal_id=$2,updated_at=now() WHERE id=$1`,[id,proposalId]);
  await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,'service.proposal.accepted','service_request',$2)`,[user.id,id]);await this.notices.add(client,p.rows[0].user_id,`accepted:${id}`,'accepted','A tua proposta foi aceite',id);return {accepted:true};
 });}
 async transition(user:AuthenticatedUser,id:string,action:'complete'|'cancel'){return this.db.transaction(async client=>{
  const r=await client.query(`UPDATE service_requests SET status=$3,completed_at=CASE WHEN $3='completed' THEN now() END,updated_at=now() WHERE id=$1 AND buyer_id=$2 AND ${action==='complete'?"status='awarded'":"status IN ('open','awarded')"} RETURNING id,status`,[id,user.id,action==='complete'?'completed':'cancelled']);
  if(!r.rowCount)throw new ConflictException('O pedido não permite esta alteração.');
  await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,$2,'service_request',$3)`,[user.id,`service.request.${action}`,id]);if(action==='complete'){const provider=await client.query<{user_id:string}>(`SELECT p.user_id FROM service_proposals sp JOIN professional_profiles p ON p.id=sp.profile_id JOIN service_requests sr ON sr.accepted_proposal_id=sp.id WHERE sr.id=$1`,[id]);if(provider.rows[0])await this.notices.add(client,provider.rows[0].user_id,`completed:${id}`,'completed','O cliente concluiu o trabalho',id);}return r.rows[0];
 });}
 async decline(user:AuthenticatedUser,id:string,reason:string){return this.db.transaction(async client=>{
  const r=await client.query<{id:string;buyer_id:string}>(`UPDATE service_requests r SET status='declined',provider_decline_reason=$3,updated_at=now() FROM professional_profiles p WHERE r.id=$1 AND r.target_profile_id=p.id AND p.user_id=$2 AND r.status='open' RETURNING r.id,r.buyer_id`,[id,user.id,reason]);
  if(!r.rowCount)throw new NotFoundException('Pedido indisponível para recusa.');
  await client.query(`UPDATE service_proposals SET status='declined' WHERE request_id=$1 AND status='pending'`,[id]);
  await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,'service.request.declined','service_request',$2)`,[user.id,id]);await this.notices.add(client,r.rows[0].buyer_id,`declined:${id}`,'declined','O profissional recusou o pedido',id);return {declined:true};
 });}
 async proposalAction(user:AuthenticatedUser,id:string,action:string){return this.db.transaction(async client=>{
  const r=await client.query<{buyer_id:string;user_id:string;request_id:string;status:string;request_status:string}>(`SELECT r.buyer_id,p.user_id,sp.request_id,sp.status,r.status AS request_status FROM service_proposals sp JOIN service_requests r ON r.id=sp.request_id JOIN professional_profiles p ON p.id=sp.profile_id WHERE sp.id=$1 FOR UPDATE OF r,sp`,[id]);
  const row=r.rows[0];if(!row||!(action==='decline'?row.buyer_id===user.id:row.user_id===user.id))throw new NotFoundException('Proposta não encontrada.');
  if(row.status!=='pending'||row.request_status!=='open')throw new ConflictException('Esta proposta já não pode ser alterada.');
  await client.query('UPDATE service_proposals SET status=$2 WHERE id=$1',[id,action==='decline'?'declined':'withdrawn']);return {updated:true};
 });}
 private async thread(user:AuthenticatedUser,id:string){const r=await this.db.query<{buyer_id:string;user_id:string;request_id:string;status:string;request_status:string}>(`SELECT r.buyer_id,p.user_id,r.id AS request_id,sp.status,r.status AS request_status FROM service_proposals sp JOIN professional_profiles p ON p.id=sp.profile_id JOIN service_requests r ON r.id=sp.request_id WHERE sp.id=$1 AND (r.buyer_id=$2 OR p.user_id=$2)`,[id,user.id]);if(!r.rowCount)throw new NotFoundException('Conversa não encontrada.');return r.rows[0];}
 async messages(user:AuthenticatedUser,id:string,page=1){await this.thread(user,id);const r=await this.db.query(`SELECT id,body,sender_id,created_at FROM service_messages WHERE proposal_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $2`,[id,(page-1)*50]);return {items:r.rows.reverse(),myId:user.id,page};}
 async message(user:AuthenticatedUser,id:string,body:string){
  return this.db.transaction(async client=>{await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);const thread=await client.query<{buyer_id:string;user_id:string;request_id:string;status:string;request_status:string}>(`SELECT r.buyer_id,p.user_id,r.id AS request_id,sp.status,r.status AS request_status FROM service_proposals sp JOIN professional_profiles p ON p.id=sp.profile_id JOIN service_requests r ON r.id=sp.request_id WHERE sp.id=$1 AND (r.buyer_id=$2 OR p.user_id=$2) FOR UPDATE OF r,sp`,[id,user.id]);if(!thread.rowCount)throw new NotFoundException('Conversa não encontrada.');const current=thread.rows[0];if(!['pending','accepted'].includes(current.status)||!['open','awarded'].includes(current.request_status))throw new ConflictException('Esta conversa está encerrada.');const rate=await client.query<{total:number}>(`SELECT count(*)::int AS total FROM service_messages WHERE sender_id=$1 AND created_at>now()-interval '1 minute'`,[user.id]);if(rate.rows[0].total>=20)throw new HttpException('Aguarda antes de enviar mais mensagens.',429);const r=await client.query<{id:string;body:string;sender_id:string;created_at:string}>('INSERT INTO service_messages(proposal_id,sender_id,body) VALUES($1,$2,$3) RETURNING id,body,sender_id,created_at',[id,user.id,body]);const recipient=current.buyer_id===user.id?current.user_id:current.buyer_id;await this.notices.add(client,recipient,`message:${r.rows[0].id}`,'message','Recebeste uma mensagem sobre um serviço',current.request_id);return r.rows[0];});
 }
 async review(user:AuthenticatedUser,id:string,b:ServiceReviewDto){try{const r=await this.db.query(`INSERT INTO service_reviews(request_id,profile_id,author_id,rating,body) SELECT r.id,sp.profile_id,$2,$3,$4 FROM service_requests r JOIN service_proposals sp ON sp.id=r.accepted_proposal_id WHERE r.id=$1 AND r.buyer_id=$2 AND r.status='completed' RETURNING id`,[id,user.id,b.rating,b.body]);if(!r.rowCount)throw new ForbiddenException('Só podes avaliar um serviço concluído que contrataste.');return r.rows[0];}catch(e){if((e as {code?:string}).code==='23505')throw new ConflictException('Já avaliaste este trabalho.');throw e;}}
}
