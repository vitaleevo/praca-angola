import { BadRequestException,Body,Controller,Get,Param,ParseUUIDPipe,Patch,Post,Query,UseGuards } from '@nestjs/common';
import { IsIn,IsInt,IsISO8601,IsString,IsUUID,Length,Max,Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DatabaseService } from './database/database.service';
import { SessionGuard } from './auth/session.guard';
import { RolesGuard } from './auth/roles.guard';
import { Roles } from './auth/roles.decorator';
import { CurrentUser } from './auth/current-user.decorator';
import { AuthenticatedUser } from './auth/auth.types';
class AdDto {
 @IsIn(['produtos','servicos']) marketplaceSlug!:string;
 @IsIn(['premium','secondary','tertiary']) placement!:string;
 @IsString() @Length(2,100) advertiserName!:string;
 @IsString() @Length(4,120) headline!:string;
 @IsString() @Length(12,2048) targetUrl!:string;
 @IsUUID('4') imageAssetId!:string;
 @IsISO8601() startsAt!:string;
 @IsISO8601() endsAt!:string;
 @Type(()=>Number) @IsInt() @Min(0) @Max(100) priority!:number;
}
class StatusDto {@IsIn(['draft','approved','paused']) status!:string;}
@Controller('ads')
export class AdsController {
 constructor(private readonly db:DatabaseService){}
 @Get('placements')
 async placements(@Query('marketplace') marketplace:string){
  if(!['produtos','servicos'].includes(marketplace))throw new BadRequestException('Mercado inválido.');
  const result=await this.db.query(`SELECT DISTINCT ON (a.placement) a.id,a.placement,a.advertiser_name,a.headline,a.target_url,'/api/v1/media/'||a.image_asset_id AS image_url FROM ad_campaigns a WHERE a.marketplace_slug=$1 AND a.status='approved' AND a.starts_at<=now() AND a.ends_at>now() ORDER BY a.placement,a.priority DESC,a.starts_at DESC,a.id`,[marketplace]);
  return {items:result.rows};
 }
 @Get('manage') @UseGuards(SessionGuard,RolesGuard) @Roles('administrator')
 async manage(){const result=await this.db.query(`SELECT id,marketplace_slug,placement,advertiser_name,headline,target_url,image_asset_id,status,starts_at,ends_at,priority,created_at FROM ad_campaigns ORDER BY created_at DESC LIMIT 100`);return {items:result.rows};}
 @Post('manage') @UseGuards(SessionGuard,RolesGuard) @Roles('administrator')
 async create(@Body() b:AdDto,@CurrentUser() user:AuthenticatedUser){
  let target:URL;try{target=new URL(b.targetUrl);}catch{throw new BadRequestException('URL inválido.');}
  if(target.protocol!=='https:'||target.username||target.password||!target.hostname||target.hostname==='localhost'||/^(127|10|192\.168)\./.test(target.hostname))throw new BadRequestException('Usa uma URL HTTPS pública.');
  if(Date.parse(b.endsAt)<=Date.parse(b.startsAt))throw new BadRequestException('O fim deve ser posterior ao início.');
  return this.db.transaction(async client=>{
   const asset=await client.query(`SELECT 1 FROM media_assets WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL`,[b.imageAssetId,user.id]);if(!asset.rowCount)throw new BadRequestException('Carrega uma imagem tua para a campanha.');
   const result=await client.query(`INSERT INTO ad_campaigns(marketplace_slug,placement,advertiser_name,headline,target_url,image_asset_id,starts_at,ends_at,priority,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,status`,[b.marketplaceSlug,b.placement,b.advertiserName.trim(),b.headline.trim(),target.href,b.imageAssetId,b.startsAt,b.endsAt,b.priority,user.id]);
   await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,'ad.created','ad_campaign',$2)`,[user.id,result.rows[0].id]);return result.rows[0];
  });
 }
 @Patch('manage/:id') @UseGuards(SessionGuard,RolesGuard) @Roles('administrator')
 async status(@Param('id',new ParseUUIDPipe({version:'4'})) id:string,@Body() b:StatusDto,@CurrentUser() user:AuthenticatedUser){return this.db.transaction(async client=>{
  const result=await client.query(`UPDATE ad_campaigns SET status=$2,updated_at=now() WHERE id=$1 RETURNING id,status`,[id,b.status]);if(!result.rowCount)throw new BadRequestException('Campanha inexistente.');
  await client.query(`INSERT INTO audit_events(actor_id,action,entity_type,entity_id) VALUES($1,$2,'ad_campaign',$3)`,[user.id,`ad.${b.status}`,id]);return result.rows[0];
 });}
}
