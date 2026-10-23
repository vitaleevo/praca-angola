import { createRequire } from 'node:module';
import { randomUUID,randomBytes,createHash,scryptSync } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
const {Pool}=createRequire(new URL('../../apps/api/package.json',import.meta.url))('pg');
const sharp=createRequire(new URL('../../apps/api/package.json',import.meta.url))('sharp');
export const validPng=await sharp({create:{width:8,height:8,channels:4,background:{r:20,g:125,b:74,alpha:1}}}).png().toBuffer();
const connection=process.env.E2E_DATABASE_URL??'postgresql://praca:praca_local_dev@localhost:5432/praca_angola';
const parsed=new URL(connection);if(!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.pathname!=='/praca_angola')throw new Error('E2E fixtures require the local development database.');
export const db=new Pool({connectionString:connection,max:2});
export const emails=[];
export const password='E2ePracaLocal2026!';
export async function account(name,role='buyer'){
 const id=randomUUID(),email=`e2e-${id}@puvo.invalid`,token=randomBytes(32).toString('hex'),salt=randomBytes(16);
 emails.push(email);
 const hash=`scrypt$${salt.toString('base64url')}$${scryptSync(password,salt,64,{N:16384,r:8,p:1,maxmem:64*1024*1024}).toString('base64url')}`;
 await db.query('INSERT INTO users(id,display_name,email,password_hash,email_verified_at) VALUES($1,$2,$3,$4,now())',[id,name,email,hash]);
 await db.query("INSERT INTO user_roles(user_id,role) VALUES($1,'buyer')",[id]);
 if(role!=='buyer')await db.query('INSERT INTO user_roles(user_id,role) VALUES($1,$2)',[id,role]);
 await db.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",[id,createHash('sha256').update(token).digest('hex')]);
 return {id,name,email,token};
}
export async function context(browser,user){const c=await browser.newContext({viewport:{width:1440,height:1000},baseURL:'http://localhost:3100'});await c.addCookies([{name:'praca_session',value:user.token,url:'http://localhost:3100',httpOnly:true,sameSite:'Lax'}]);return c;}
export async function json(response){const body=await response.json();if(!response.ok())throw new Error(`HTTP ${response.status()}: ${JSON.stringify(body)}`);return body;}
export const storeSettings=(name)=>({profileType:'business',displayName:name,description:'Loja temporária E2E, sem ofertas comerciais reais.',province:'Luanda',municipality:'Luanda',mcxRecipientName:'Destinatário E2E',mcxPhone:'923111111',contactPhonePublic:false,contactEmailPublic:false});
export const professionalSettings=(name)=>({displayName:name,headline:'Design de marcas e comunicação visual',bio:'Perfil temporário de teste E2E para criação de identidades e comunicação visual.',categorySlug:'design-grafico',providerType:'individual',province:'Luanda',municipality:'Maianga',workMode:'both',startingPrice:80000,yearsExperience:4,availability:'available',specialties:'Identidade visual e logótipos',publicPhone:null,photoImageId:null,portfolioImageIds:[]});
export const listingSettings=(title)=>({title,description:'Produto temporário de teste E2E. Sem oferta comercial real.',categorySlug:'casa-mobiliario',price:15000,condition:'new',availableQuantity:5,province:'Luanda',municipality:'Maianga',imageIds:[]});
export async function cleanup(){
 const users=(await db.query('SELECT id FROM users WHERE email=ANY($1::text[])',[emails])).rows.map(r=>r.id);
 if(!users.length){emails.length=0;return;}
 const media=await db.query('SELECT storage_key FROM media_assets WHERE owner_user_id=ANY($1::uuid[])',[users]);
 const client=await db.connect();
 await client.query('BEGIN');
 try{
  await client.query("DELETE FROM audit_events WHERE actor_id=ANY($1::uuid[]) OR (entity_type='user' AND entity_id=ANY($1::uuid[]))",[users]);
  await client.query('DELETE FROM service_reports WHERE reporter_id=ANY($1::uuid[]) OR moderator_id=ANY($1::uuid[]) OR profile_id IN(SELECT id FROM professional_profiles WHERE user_id=ANY($1::uuid[])) OR request_id IN(SELECT id FROM service_requests WHERE buyer_id=ANY($1::uuid[]))',[users]);
  await client.query('DELETE FROM service_requests WHERE buyer_id=ANY($1::uuid[])',[users]);
  await client.query('DELETE FROM professional_profiles WHERE user_id=ANY($1::uuid[])',[users]);
  await client.query('DELETE FROM reviews WHERE author_id=ANY($1::uuid[])',[users]);
  await client.query('DELETE FROM orders WHERE buyer_id=ANY($1::uuid[]) OR seller_profile_id IN(SELECT id FROM seller_profiles WHERE owner_user_id=ANY($1::uuid[]))',[users]);
  await client.query('DELETE FROM moderation_actions WHERE actor_id=ANY($1::uuid[])',[users]);
  await client.query(
   `DELETE FROM messages WHERE conversation_id IN (
      SELECT id FROM conversations
      WHERE buyer_id=ANY($1::uuid[])
         OR seller_profile_id IN (SELECT id FROM seller_profiles WHERE owner_user_id=ANY($1::uuid[]))
    )`,
   [users],
  );
  await client.query(
   `DELETE FROM conversations
    WHERE buyer_id=ANY($1::uuid[])
       OR seller_profile_id IN (SELECT id FROM seller_profiles WHERE owner_user_id=ANY($1::uuid[]))`,
   [users],
  );
  await client.query(
   `DELETE FROM reports WHERE reporter_id=ANY($1::uuid[])
      OR listing_id IN (SELECT id FROM listings WHERE seller_profile_id IN (
        SELECT id FROM seller_profiles WHERE owner_user_id=ANY($1::uuid[])
      ))`,
   [users],
  );
  await client.query('DELETE FROM listings WHERE seller_profile_id IN(SELECT id FROM seller_profiles WHERE owner_user_id=ANY($1::uuid[]))',[users]);
  await client.query('DELETE FROM seller_profiles WHERE owner_user_id=ANY($1::uuid[])',[users]);
  await client.query('DELETE FROM media_assets WHERE owner_user_id=ANY($1::uuid[])',[users]);
  await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]);
  await client.query('COMMIT');
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 for(const asset of media.rows)await unlink(join(process.cwd(),'.data','uploads',asset.storage_key)).catch(()=>undefined);
 emails.length=0;
}
