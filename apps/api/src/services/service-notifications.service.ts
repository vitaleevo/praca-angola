import { Injectable,Logger,OnModuleDestroy,OnModuleInit } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { EmailService } from '../auth/email.service';
import { AuthenticatedUser } from '../auth/auth.types';
export type NoticeKind='request'|'proposal'|'accepted'|'message'|'completed'|'declined';
@Injectable()
export class ServiceNotificationsService implements OnModuleInit,OnModuleDestroy {
 private readonly logger=new Logger(ServiceNotificationsService.name);
 private timer?:ReturnType<typeof setInterval>;private running=false;
 constructor(private readonly db:DatabaseService,private readonly mail:EmailService){}
 onModuleInit(){this.timer=setInterval(()=>void this.dispatch().catch(()=>this.logger.error('Service notification dispatch cycle failed')),30_000);this.timer.unref();}
 onModuleDestroy(){if(this.timer)clearInterval(this.timer);}
 async add(client:PoolClient,userId:string,eventKey:string,kind:NoticeKind,title:string,requestId:string){
  const href=`/servicos/pedidos/${requestId}`;
  const row=await client.query<{id:string}>(`INSERT INTO service_notifications(user_id,event_key,kind,title,href) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,event_key) DO NOTHING RETURNING id`,[userId,eventKey,kind,title,href]);
  if(row.rows[0]){const pref=await client.query<{email_enabled:boolean}>(`SELECT email_enabled FROM service_notification_preferences WHERE user_id=$1 FOR UPDATE`,[userId]);if(pref.rows[0]?.email_enabled)await client.query(`INSERT INTO service_notification_outbox(notification_id) VALUES($1)`,[row.rows[0].id]);}
 }
 async list(user:AuthenticatedUser,page=1){const result=await this.db.query(`SELECT id,kind,title,href,created_at,read_at FROM service_notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 20 OFFSET $2`,[user.id,(page-1)*20]);const unread=await this.db.query<{count:number}>(`SELECT count(*)::int AS count FROM service_notifications WHERE user_id=$1 AND read_at IS NULL`,[user.id]);return {items:result.rows,unread:unread.rows[0].count,page};}
 async read(user:AuthenticatedUser,id:string){const result=await this.db.query(`UPDATE service_notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2 RETURNING id`,[id,user.id]);return {updated:!!result.rowCount};}
 async preferences(user:AuthenticatedUser){const result=await this.db.query<{email_enabled:boolean}>(`SELECT email_enabled FROM service_notification_preferences WHERE user_id=$1`,[user.id]);return {emailEnabled:result.rows[0]?.email_enabled??false};}
 async setPreferences(user:AuthenticatedUser,emailEnabled:boolean){await this.db.transaction(async c=>{await c.query(`INSERT INTO service_notification_preferences(user_id,email_enabled) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET email_enabled=EXCLUDED.email_enabled,updated_at=now()`,[user.id,emailEnabled]);if(!emailEnabled)await c.query(`DELETE FROM service_notification_outbox o USING service_notifications n WHERE n.id=o.notification_id AND n.user_id=$1 AND o.status IN ('pending','failed','processing')`,[user.id]);});return {emailEnabled};}
 private async dispatch(){if(this.running||!this.mail.isConfigured())return;this.running=true;try{
  await this.db.query(`UPDATE service_notification_outbox SET status='failed',updated_at=now() WHERE status='processing' AND attempts>=5 AND updated_at<now()-interval '5 minutes'`);
  for(let n=0;n<10;n++){
   const job=await this.db.transaction(async c=>{const r=await c.query<{notification_id:string;email:string;title:string;href:string}>(`SELECT o.notification_id,u.email,n.title,n.href FROM service_notification_outbox o JOIN service_notifications n ON n.id=o.notification_id JOIN users u ON u.id=n.user_id JOIN service_notification_preferences p ON p.user_id=u.id WHERE ((o.status IN ('pending','failed') AND o.next_attempt_at<=now()) OR (o.status='processing' AND o.updated_at<now()-interval '5 minutes')) AND o.attempts<5 AND p.email_enabled=true FOR UPDATE OF o SKIP LOCKED LIMIT 1`);if(!r.rowCount)return null;await c.query(`UPDATE service_notification_outbox SET status='processing',attempts=attempts+1,updated_at=now() WHERE notification_id=$1`,[r.rows[0].notification_id]);return r.rows[0];});
   if(!job)break;
   const enabled=await this.db.query(`SELECT 1 FROM service_notification_preferences p JOIN service_notifications n ON n.user_id=p.user_id WHERE n.id=$1 AND p.email_enabled=true`,[job.notification_id]);
   if(!enabled.rowCount){await this.db.query(`DELETE FROM service_notification_outbox WHERE notification_id=$1`,[job.notification_id]);continue;}
   try{await this.mail.sendServiceNotice(job.email,job.title,job.href);await this.db.query(`UPDATE service_notification_outbox SET status='sent',updated_at=now() WHERE notification_id=$1`,[job.notification_id]);}
   catch{this.logger.warn(`Service notification delivery failed: ${job.notification_id}`);await this.db.query(`UPDATE service_notification_outbox SET status='failed',next_attempt_at=now()+make_interval(mins=>LEAST(60,power(2,attempts)::int)),updated_at=now() WHERE notification_id=$1`,[job.notification_id]);}
  }
 }finally{this.running=false;}}
}
