import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, HttpException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from './database/database.service';
import { StoreContextService } from './store-context.service';
import { AuthenticatedUser } from './auth/auth.types';
import { EmailService } from './auth/email.service';
const hash=(token:string)=>createHash('sha256').update(token).digest('hex');
@Injectable()
export class StoreInvitationsService {
  constructor(private readonly db:DatabaseService,private readonly context:StoreContextService,private readonly mail:EmailService) {}
  async stores(user:AuthenticatedUser) {
    const rows=await this.db.query(`SELECT s.id,s.display_name,s.slug,s.status,sm.role FROM store_memberships sm JOIN seller_profiles s ON s.id=sm.seller_profile_id WHERE sm.user_id=$1 ORDER BY (sm.role='owner') DESC,sm.created_at,s.id LIMIT 100`,[user.id]);
    const current=await this.context.find(user);
    return {items:rows.rows,activeStoreId:current?.id ?? null};
  }
  async select(user:AuthenticatedUser,id:string) {
    const result=await this.db.query(`UPDATE sessions SET active_store_id=$3 WHERE id=$1 AND user_id=$2 AND EXISTS(SELECT 1 FROM store_memberships WHERE seller_profile_id=$3 AND user_id=$2) RETURNING active_store_id`,[user.sessionId,user.id,id]);
    if(!result.rowCount) throw new ForbiddenException('Não tens acesso a esta loja.');
    return {activeStoreId:id};
  }
  async list(user:AuthenticatedUser) {
    const storeId=await this.context.owner(user);
    const result=await this.db.query(`SELECT id,email,role,expires_at,accepted_at,revoked_at,created_at FROM store_invitations WHERE seller_profile_id=$1 ORDER BY created_at DESC LIMIT 100`,[storeId]);
    return {items:result.rows};
  }
  async create(user:AuthenticatedUser,body:{email:string;role:string}) {
    const storeId=await this.context.owner(user),token=randomBytes(32).toString('base64url'),email=body.email.trim().toLowerCase();
    if(email===user.email) throw new BadRequestException('Já és o proprietário da loja.');
    const invitation=await this.db.transaction(async client=>{
      await client.query('SELECT id FROM seller_profiles WHERE id=$1 FOR UPDATE',[storeId]);
      const rate=await client.query<{total:number}>(`SELECT count(*)::int AS total FROM store_invitations WHERE seller_profile_id=$1 AND created_at>now()-interval '1 hour'`,[storeId]);
      if(rate.rows[0].total>=20) throw new HttpException('Limite de convites atingido. Tenta dentro de uma hora.',429);
      await client.query(`UPDATE store_invitations SET revoked_at=now() WHERE seller_profile_id=$1 AND email=$2 AND accepted_at IS NULL AND revoked_at IS NULL`,[storeId,email]);
      const result=await client.query(`INSERT INTO store_invitations(seller_profile_id,email,role,token_hash,invited_by) VALUES($1,$2,$3,$4,$5) RETURNING id,expires_at`,[storeId,email,body.role,hash(token),user.id]);
      await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,'store.invitation.created','store',$2)`,[user.id,storeId]);
      return result.rows[0];
    });
    let delivery='sent';try{await this.mail.sendStoreInvitation(email,token);}catch{delivery='failed';}
    return {...invitation,delivery,invitationUrl:`/convites/aceitar?token=${token}`};
  }
  async inspect(token:string) {
    if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new NotFoundException('Convite inválido ou expirado.');
    const result=await this.db.query(`SELECT s.display_name,i.role,i.expires_at FROM store_invitations i JOIN seller_profiles s ON s.id=i.seller_profile_id WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now() AND s.status='active'`,[hash(token)]);
    if(!result.rowCount)throw new NotFoundException('Convite inválido, utilizado ou expirado.');return result.rows[0];
  }
  async accept(user:AuthenticatedUser,token:string) {
    return this.db.transaction(async client=>{
      const result=await client.query<{id:string;seller_profile_id:string;email:string;role:string}>(`SELECT i.id,i.seller_profile_id,i.email,i.role FROM store_invitations i JOIN seller_profiles s ON s.id=i.seller_profile_id WHERE i.token_hash=$1 AND i.revoked_at IS NULL AND i.accepted_at IS NULL AND i.expires_at>now() AND s.status='active' FOR UPDATE OF i,s`,[hash(token)]);
      const invite=result.rows[0];if(!invite)throw new ConflictException('Convite inválido, utilizado ou expirado.');
      const verified=await client.query('SELECT 1 FROM users WHERE id=$1 AND email=$2 AND email_verified_at IS NOT NULL',[user.id,invite.email]);
      if(!verified.rowCount)throw new ForbiddenException('Entra com o e-mail confirmado que recebeu o convite.');
      const size=await client.query<{total:number}>(`SELECT count(*)::int AS total FROM store_memberships WHERE seller_profile_id=$1 AND user_id<>$2`,[invite.seller_profile_id,user.id]);
      if(size.rows[0].total>=50)throw new BadRequestException('A equipa atingiu o limite de 50 membros.');
      await client.query(`INSERT INTO store_memberships(seller_profile_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT(seller_profile_id,user_id) DO UPDATE SET role=CASE WHEN store_memberships.role='owner' THEN 'owner' ELSE EXCLUDED.role END`,[invite.seller_profile_id,user.id,invite.role]);
      await client.query('UPDATE store_invitations SET accepted_at=now() WHERE id=$1',[invite.id]);
      await client.query('UPDATE sessions SET active_store_id=$1 WHERE id=$2 AND user_id=$3',[invite.seller_profile_id,user.sessionId,user.id]);
      await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,'store.invitation.accepted','store',$2)`,[user.id,invite.seller_profile_id]);
      return {accepted:true,storeId:invite.seller_profile_id};
    });
  }
  async revoke(user:AuthenticatedUser,id:string) {
    const storeId=await this.context.owner(user);
    const result=await this.db.query(`UPDATE store_invitations SET revoked_at=now() WHERE id=$1 AND seller_profile_id=$2 AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,[id,storeId]);
    if(!result.rowCount)throw new NotFoundException('Convite não encontrado ou já utilizado.');return {revoked:true};
  }
}
