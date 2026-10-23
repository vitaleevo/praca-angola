import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { ProfessionalDto, ServiceQuery, ModerateProfessionalDto } from './services.dto';
import { AuthenticatedUser } from '../auth/auth.types';
const projection=`p.id,p.slug,p.display_name,p.headline,p.bio,p.provider_type,p.province,p.municipality,p.work_mode,p.starting_price::text,p.years_experience,p.availability,p.specialties,p.is_verified,p.contact_phone,c.name AS category,c.slug AS category_slug,
 CASE WHEN p.photo_asset_id IS NOT NULL THEN '/api/v1/media/'||p.photo_asset_id END AS photo_url,
 (SELECT round(avg(r.rating),1)::float FROM service_reviews r WHERE r.profile_id=p.id) AS average_rating,
 (SELECT count(*)::int FROM service_reviews r WHERE r.profile_id=p.id) AS review_count`;
@Injectable()
export class ProfessionalsService {
 constructor(private readonly db:DatabaseService){}
 async categories(){return (await this.db.query(`SELECT c.id,c.name,c.slug FROM categories c JOIN marketplaces m ON m.id=c.marketplace_id WHERE m.slug='servicos' AND m.status='active' AND c.is_active ORDER BY c.sort_order`)).rows;}
 async category(slug:string){const r=await this.db.query<{id:string}>(`SELECT c.id FROM categories c JOIN marketplaces m ON m.id=c.marketplace_id WHERE c.slug=$1 AND c.is_active AND m.slug='servicos' AND m.status='active'`,[slug]);if(!r.rowCount)throw new BadRequestException('Escolhe uma categoria de serviços ativa.');return r.rows[0].id;}
 async list(q:ServiceQuery){
  const values:unknown[]=[],where=["p.status='published'","u.status='active'","m.status='active'"];
  const add=(clause:string,value:unknown)=>{values.push(value);where.push(clause.replaceAll('?',`$${values.length}`));};
  if(q.q)add(`(p.display_name ILIKE ? ESCAPE E'\\\\' OR p.headline ILIKE ? ESCAPE E'\\\\' OR p.specialties ILIKE ? ESCAPE E'\\\\')`,'%'+q.q.replace(/[\\%_]/g,'\\$&')+'%');
  if(q.category)add('c.slug=?',q.category);if(q.province)add('p.province=?',q.province);
  if(q.providerType)add('p.provider_type=?',q.providerType);if(q.workMode)add("(p.work_mode=? OR p.work_mode='both')",q.workMode);
  if(q.availability)add('p.availability=?',q.availability);if(q.minPrice!==undefined)add('p.starting_price>=?',q.minPrice);if(q.maxPrice!==undefined)add('p.starting_price<=?',q.maxPrice);
  if(q.minRating)add('(SELECT coalesce(avg(r.rating),0) FROM service_reviews r WHERE r.profile_id=p.id)>=?',q.minRating);
  const from=`FROM professional_profiles p JOIN categories c ON c.id=p.category_id JOIN marketplaces m ON m.id=c.marketplace_id JOIN users u ON u.id=p.user_id WHERE ${where.join(' AND ')}`;
  const count=await this.db.query<{total:number}>(`SELECT count(*)::int AS total ${from}`,values);
  const order=q.sort==='price_asc'?'p.starting_price ASC':q.sort==='price_desc'?'p.starting_price DESC':q.sort==='rating'?'average_rating DESC NULLS LAST,review_count DESC':'p.updated_at DESC';
  const page=q.page??1,limit=12;
  const rows=await this.db.query(`SELECT ${projection} ${from} ORDER BY ${order},p.id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,limit,(page-1)*limit]);
  return {items:rows.rows,total:count.rows[0].total,page,pages:Math.ceil(count.rows[0].total/limit)};
 }
 async detail(slug:string){
  const result=await this.db.query(`SELECT ${projection} FROM professional_profiles p JOIN categories c ON c.id=p.category_id JOIN marketplaces m ON m.id=c.marketplace_id JOIN users u ON u.id=p.user_id WHERE p.slug=$1 AND p.status='published' AND u.status='active' AND m.status='active'`,[slug]);
  const profile=result.rows[0];if(!profile)throw new NotFoundException('Profissional não encontrado.');
  const [portfolio,reviews]=await Promise.all([
   this.db.query(`SELECT '/api/v1/media/'||asset_id AS url,position FROM professional_portfolio WHERE profile_id=$1 ORDER BY position`,[profile.id]),
   this.db.query(`SELECT r.id,r.rating,r.body,r.created_at,u.display_name AS author FROM service_reviews r JOIN users u ON u.id=r.author_id WHERE r.profile_id=$1 ORDER BY r.created_at DESC LIMIT 20`,[profile.id])]);
  return {profile,portfolio:portfolio.rows,reviews:reviews.rows};
 }
 async mine(user:AuthenticatedUser){const r=await this.db.query(`SELECT p.id,p.slug,p.display_name,p.headline,p.bio,p.provider_type,p.province,p.municipality,p.work_mode,p.starting_price::text,p.years_experience,p.availability,p.specialties,p.contact_phone,p.photo_asset_id,p.status,p.moderation_note,c.slug AS category_slug,coalesce((SELECT json_agg(asset_id ORDER BY position) FROM professional_portfolio WHERE profile_id=p.id),'[]'::json) AS portfolio_image_ids FROM professional_profiles p JOIN categories c ON c.id=p.category_id WHERE p.user_id=$1`,[user.id]);return {profile:r.rows[0]??null};}
 async save(user:AuthenticatedUser,b:ProfessionalDto){
  const categoryId=await this.category(b.categorySlug),slug=b.displayName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,65)+'-'+randomBytes(4).toString('hex');
  await this.db.transaction(async client=>{
   await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user.id]);
   const existing=await client.query<{id:string;status:string}>('SELECT id,status FROM professional_profiles WHERE user_id=$1',[user.id]);
   if(existing.rows[0]?.status==='suspended')throw new ForbiddenException('Perfil suspenso. Contacta o suporte.');
   const portfolio=[...new Set(b.portfolioImageIds??[])];
   for(const id of [...portfolio,...(b.photoImageId?[b.photoImageId]:[])]){const asset=await client.query('SELECT 1 FROM media_assets WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL',[id,user.id]);if(!asset.rowCount)throw new BadRequestException('Uma imagem não pertence à tua conta.');}
   const result=await client.query<{id:string}>(`INSERT INTO professional_profiles(user_id,slug,display_name,headline,bio,category_id,provider_type,province,municipality,work_mode,starting_price,years_experience,availability,specialties,contact_phone,photo_asset_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT(user_id) DO UPDATE SET display_name=$3,headline=$4,bio=$5,category_id=$6,provider_type=$7,province=$8,municipality=$9,work_mode=$10,starting_price=$11,years_experience=$12,availability=$13,specialties=$14,contact_phone=$15,photo_asset_id=$16,status='pending_review',moderation_note='',updated_at=now() RETURNING id`,
    [user.id,slug,b.displayName,b.headline,b.bio,categoryId,b.providerType,b.province,b.municipality,b.workMode,b.startingPrice,b.yearsExperience,b.availability,b.specialties??'',b.publicPhone??null,b.photoImageId??null]);
   await client.query('DELETE FROM professional_portfolio WHERE profile_id=$1',[result.rows[0].id]);
   for(let i=0;i<portfolio.length;i++)await client.query('INSERT INTO professional_portfolio(profile_id,asset_id,position) VALUES($1,$2,$3)',[result.rows[0].id,portfolio[i],i]);
   await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,'professional.submitted','professional',$2)`,[user.id,result.rows[0].id]);
  });return this.mine(user);
 }
 async pause(user:AuthenticatedUser){const r=await this.db.query(`UPDATE professional_profiles SET status='paused',updated_at=now() WHERE user_id=$1 AND status='published' RETURNING id`,[user.id]);if(!r.rowCount)throw new BadRequestException('Só podes pausar um perfil publicado.');return {paused:true};}
 async pending(){return {items:(await this.db.query(`SELECT p.id,p.display_name,p.headline,p.bio,p.province,p.municipality,p.specialties,p.contact_phone,p.provider_type,c.name AS category,CASE WHEN p.photo_asset_id IS NOT NULL THEN '/api/v1/media/'||p.photo_asset_id END AS photo_url,coalesce((SELECT json_agg('/api/v1/media/'||asset_id ORDER BY position) FROM professional_portfolio WHERE profile_id=p.id),'[]'::json) AS portfolio FROM professional_profiles p JOIN categories c ON c.id=p.category_id WHERE p.status='pending_review' ORDER BY p.updated_at LIMIT 100`)).rows};}
 async moderate(user:AuthenticatedUser,id:string,b:ModerateProfessionalDto){return this.db.transaction(async client=>{const r=await client.query(`UPDATE professional_profiles SET status=$2,moderation_note=$3,is_verified=coalesce($4,is_verified),updated_at=now() WHERE id=$1 RETURNING id,status`,[id,b.status,b.note??'',b.verified??null]);if(!r.rowCount)throw new NotFoundException('Perfil não encontrado.');await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,$2,'professional',$3)`,[user.id,`professional.${b.status}`,id]);return r.rows[0];});}
}
