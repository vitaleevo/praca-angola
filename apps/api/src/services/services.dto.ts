import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
const trim=({value}:{value:unknown})=>typeof value==='string'?value.trim():value;
export class ProfessionalDto {
 @Transform(trim) @IsString() @Length(2,100) displayName!:string;
 @Transform(trim) @IsString() @Length(4,140) headline!:string;
 @Transform(trim) @IsString() @Length(20,5000) bio!:string;
 @IsString() @Length(2,80) categorySlug!:string;
 @IsIn(['individual','company']) providerType!:string;
 @Transform(trim) @IsString() @Length(2,100) province!:string;
 @Transform(trim) @IsString() @Length(2,100) municipality!:string;
 @IsIn(['online','onsite','both']) workMode!:string;
 @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(1000000000000) startingPrice!:number;
 @Type(()=>Number) @IsInt() @Min(0) @Max(80) yearsExperience!:number;
 @IsIn(['available','this_week','unavailable']) availability!:string;
 @IsOptional() @Transform(trim) @IsString() @MaxLength(500) specialties?:string;
 @IsOptional() @Matches(/^(\+244)?9[0-9]{8}$/) publicPhone?:string|null;
 @IsOptional() @IsUUID('4') photoImageId?:string|null;
 @IsOptional() @IsArray() @ArrayMaxSize(8) @IsUUID('4',{each:true}) portfolioImageIds?:string[];
}
export class ServiceQuery {
 @IsOptional() @Transform(trim) @IsString() @MaxLength(140) q?:string;
 @IsOptional() @IsString() @MaxLength(80) category?:string;
 @IsOptional() @IsString() @MaxLength(100) province?:string;
 @IsOptional() @IsIn(['individual','company']) providerType?:string;
 @IsOptional() @IsIn(['online','onsite','both']) workMode?:string;
 @IsOptional() @IsIn(['available','this_week','unavailable']) availability?:string;
 @IsOptional() @Type(()=>Number) @IsNumber() @Min(0) minPrice?:number;
 @IsOptional() @Type(()=>Number) @IsNumber() @Min(0) maxPrice?:number;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(0) @Max(5) minRating?:number;
 @IsOptional() @IsIn(['recent','rating','price_asc','price_desc']) sort?:string;
 @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(10000) page?:number;
 @IsOptional() @IsIn(['mine','market']) scope?:string;
}
export class ServiceRequestDto {
 @Transform(trim) @IsString() @Length(5,140) title!:string;
 @Transform(trim) @IsString() @Length(20,5000) description!:string;
 @IsString() @Length(2,80) categorySlug!:string;
 @Transform(trim) @IsString() @Length(2,100) province!:string;
 @IsIn(['online','onsite','both']) workMode!:string;
 @IsOptional() @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(1) @Max(1000000000000) budget?:number|null;
 @IsOptional() @IsUUID('4') targetProfileId?:string|null;
}
export class ProposalDto {
 @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(1) @Max(1000000000000) amount!:number;
 @Transform(trim) @IsString() @Length(20,5000) description!:string;
 @Type(()=>Number) @IsInt() @Min(1) @Max(365) deliveryDays!:number;
}
export class AwardDto { @IsUUID('4') proposalId!:string; }
export class ServiceMessageDto { @Transform(trim) @IsString() @Length(1,3000) body!:string; }
export class ServiceReviewDto { @Type(()=>Number) @IsInt() @Min(1) @Max(5) rating!:number; @Transform(trim) @IsString() @Length(5,2000) body!:string; }
export class ProposalActionDto { @IsIn(['decline','withdraw']) action!:string; }
export class DeclineRequestDto { @Transform(trim) @IsString() @Length(5,1000) reason!:string; }
export class ModerateProfessionalDto { @IsIn(['published','rejected','suspended']) status!:string; @IsOptional() @Transform(trim) @IsString() @MaxLength(2000) note?:string; @IsOptional() @IsBoolean() verified?:boolean; }
export class ServiceReportDto { @IsIn(['profile','request','message']) targetType!:'profile'|'request'|'message'; @IsUUID('4') targetId!:string; @IsIn(['fraud','abuse','spam','other']) reason!:string; @Transform(trim) @IsString() @Length(20,2000) details!:string; }
export class ResolveServiceReportDto { @IsIn(['investigating','resolved','dismissed']) status!:string; @Transform(trim) @IsString() @Length(5,2000) note!:string; }
export class NotificationPreferencesDto { @IsBoolean() emailEnabled!:boolean; }
