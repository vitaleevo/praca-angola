import { ForbiddenException, Injectable } from '@nestjs/common';
import { DatabaseService } from './database/database.service';
import { AuthenticatedUser } from './auth/auth.types';

@Injectable()
export class StoreContextService {
  constructor(private readonly db: DatabaseService) {}
  async find(user: AuthenticatedUser) {
    const result = await this.db.query<{id:string;role:string;status:string;owner_user_id:string}>(
      `SELECT s.id,sm.role,s.status,s.owner_user_id FROM seller_profiles s JOIN store_memberships sm ON sm.seller_profile_id=s.id
       WHERE sm.user_id=$1 AND ($2::uuid IS NULL OR s.id=$2)
       ORDER BY (sm.role='owner') DESC,sm.created_at,s.id LIMIT 1`, [user.id,user.activeStoreId ?? null]);
    return result.rows[0] ?? null;
  }
  async owner(user: AuthenticatedUser) {
    const store = await this.find(user);
    if (!store || store.owner_user_id !== user.id || store.role !== 'owner' || store.status !== 'active')
      throw new ForbiddenException({code:'STORE_OWNER_REQUIRED',message:'Só o proprietário pode gerir esta loja.'});
    return store.id;
  }
}
