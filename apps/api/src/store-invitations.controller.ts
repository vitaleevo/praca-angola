import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { IsEmail, IsIn, IsUUID, Matches, MaxLength } from 'class-validator';
import { StoreInvitationsService } from './store-invitations.service';
import { CurrentUser } from './auth/current-user.decorator';
import { AuthenticatedUser } from './auth/auth.types';
import { SessionGuard } from './auth/session.guard';

class InvitationDto { @IsEmail() @MaxLength(254) email!:string; @IsIn(['editor','support']) role!:'editor'|'support'; }
class AcceptDto { @Matches(/^[A-Za-z0-9_-]{43}$/) token!:string; }
class ActiveStoreDto { @IsUUID('4') storeId!:string; }
@Controller()
export class StoreInvitationsController {
  constructor(private readonly service:StoreInvitationsService) {}
  @Get('seller/stores') @UseGuards(SessionGuard)
  stores(@CurrentUser() user:AuthenticatedUser) {return this.service.stores(user);}
  @Put('seller/active-store') @UseGuards(SessionGuard)
  select(@Body() body:ActiveStoreDto,@CurrentUser() user:AuthenticatedUser) {return this.service.select(user,body.storeId);}
  @Get('seller/invitations') @UseGuards(SessionGuard)
  list(@CurrentUser() user:AuthenticatedUser) {return this.service.list(user);}
  @Post('seller/invitations') @UseGuards(SessionGuard)
  create(@Body() body:InvitationDto,@CurrentUser() user:AuthenticatedUser) {return this.service.create(user,body);}
  @Delete('seller/invitations/:id') @UseGuards(SessionGuard)
  revoke(@Param('id',new ParseUUIDPipe({version:'4'})) id:string,@CurrentUser() user:AuthenticatedUser) {return this.service.revoke(user,id);}
  @Post('team-invitations/accept') @UseGuards(SessionGuard)
  accept(@Body() body:AcceptDto,@CurrentUser() user:AuthenticatedUser) {return this.service.accept(user,body.token);}
  @Get('team-invitations/:token')
  inspect(@Param('token') token:string) {return this.service.inspect(token);}
}
