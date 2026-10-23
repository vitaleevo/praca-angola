import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ProfessionalsService } from './professionals.service';
import { ServiceJobsService } from './service-jobs.service';
import { ServiceNotificationsService } from './service-notifications.service';
import { ServiceReportsService } from './service-reports.service';
import { SessionGuard } from '../auth/session.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { AwardDto, DeclineRequestDto, ModerateProfessionalDto, NotificationPreferencesDto, ProfessionalDto, ProposalActionDto, ProposalDto, ResolveServiceReportDto, ServiceMessageDto, ServiceQuery, ServiceReportDto, ServiceRequestDto, ServiceReviewDto } from './services.dto';
const uuid=new ParseUUIDPipe({version:'4'});
@Controller('services')
export class ServicesController {
 constructor(private readonly pros:ProfessionalsService,private readonly jobs:ServiceJobsService,private readonly notices:ServiceNotificationsService,private readonly reports:ServiceReportsService){}
 @Get('notifications') @UseGuards(SessionGuard) notifications(@CurrentUser() u:AuthenticatedUser,@Query() q:ServiceQuery){return this.notices.list(u,q.page);}
 @Patch('notifications/:id/read') @UseGuards(SessionGuard) readNotification(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string){return this.notices.read(u,id);}
 @Get('notification-preferences') @UseGuards(SessionGuard) preferences(@CurrentUser() u:AuthenticatedUser){return this.notices.preferences(u);}
 @Put('notification-preferences') @UseGuards(SessionGuard) setPreferences(@CurrentUser() u:AuthenticatedUser,@Body() b:NotificationPreferencesDto){return this.notices.setPreferences(u,b.emailEnabled);}
 @Post('reports') @UseGuards(SessionGuard) report(@CurrentUser() u:AuthenticatedUser,@Body() b:ServiceReportDto){return this.reports.create(u,b);}
 @Get('reports/mine') @UseGuards(SessionGuard) myReports(@CurrentUser() u:AuthenticatedUser){return this.reports.mine(u);}
 @Get('reports/moderation') @UseGuards(SessionGuard,RolesGuard) @Roles('administrator','moderator') reportQueue(){return this.reports.queue();}
 @Patch('reports/moderation/:id') @UseGuards(SessionGuard,RolesGuard) @Roles('administrator','moderator') decideReport(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Body() b:ResolveServiceReportDto){return this.reports.decide(u,id,b);}
 @Get('categories') categories(){return this.pros.categories();}
 @Get('professionals') professionals(@Query() q:ServiceQuery){return this.pros.list(q);}
 @Get('professionals/:slug') professional(@Param('slug') slug:string){return this.pros.detail(slug);}
 @Get('me') @UseGuards(SessionGuard) me(@CurrentUser() u:AuthenticatedUser){return this.pros.mine(u);}
 @Put('me') @UseGuards(SessionGuard) save(@CurrentUser() u:AuthenticatedUser,@Body() b:ProfessionalDto){return this.pros.save(u,b);}
 @Post('me/pause') @UseGuards(SessionGuard) pause(@CurrentUser() u:AuthenticatedUser){return this.pros.pause(u);}
 @Get('requests') @UseGuards(SessionGuard) requests(@CurrentUser() u:AuthenticatedUser,@Query() q:ServiceQuery){return this.jobs.list(u,q);}
 @Post('requests') @RateLimit({scope:'service-request',limit:5,windowSeconds:3600}) @UseGuards(SessionGuard,RateLimitGuard) create(@CurrentUser() u:AuthenticatedUser,@Body() b:ServiceRequestDto){return this.jobs.create(u,b);}
 @Get('requests/:id') @UseGuards(SessionGuard) request(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string){return this.jobs.detail(u,id);}
 @Post('requests/:id/proposals') @RateLimit({scope:'proposal',limit:10,windowSeconds:3600}) @UseGuards(SessionGuard,RateLimitGuard) propose(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Body() b:ProposalDto){return this.jobs.propose(u,id,b);}
 @Post('requests/:id/accept') @UseGuards(SessionGuard) accept(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Body() b:AwardDto){return this.jobs.accept(u,id,b.proposalId);}
 @Post('requests/:id/complete') @UseGuards(SessionGuard) complete(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string){return this.jobs.transition(u,id,'complete');}
 @Post('requests/:id/cancel') @UseGuards(SessionGuard) cancel(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string){return this.jobs.transition(u,id,'cancel');}
 @Post('requests/:id/decline') @UseGuards(SessionGuard) decline(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Body() b:DeclineRequestDto){return this.jobs.decline(u,id,b.reason);}
 @Post('requests/:id/reviews') @UseGuards(SessionGuard) review(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Body() b:ServiceReviewDto){return this.jobs.review(u,id,b);}
 @Patch('proposals/:id') @UseGuards(SessionGuard) proposalAction(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Body() b:ProposalActionDto){return this.jobs.proposalAction(u,id,b.action);}
 @Get('proposals/:id/messages') @UseGuards(SessionGuard) messages(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Query() q:ServiceQuery){return this.jobs.messages(u,id,q.page);}
 @Post('proposals/:id/messages') @RateLimit({scope:'service-message',limit:60,windowSeconds:60}) @UseGuards(SessionGuard,RateLimitGuard) message(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Body() b:ServiceMessageDto){return this.jobs.message(u,id,b.body);}
 @Get('moderation') @UseGuards(SessionGuard,RolesGuard) @Roles('administrator','moderator') pending(){return this.pros.pending();}
 @Patch('moderation/:id') @UseGuards(SessionGuard,RolesGuard) @Roles('administrator','moderator') moderate(@CurrentUser() u:AuthenticatedUser,@Param('id',uuid) id:string,@Body() b:ModerateProfessionalDto){return this.pros.moderate(u,id,b);}
}
