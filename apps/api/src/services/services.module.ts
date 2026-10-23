import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ServicesController } from './services.controller';
import { ProfessionalsService } from './professionals.service';
import { ServiceJobsService } from './service-jobs.service';
import { ServiceNotificationsService } from './service-notifications.service';
import { ServiceReportsService } from './service-reports.service';
@Module({imports:[AuthModule],controllers:[ServicesController],providers:[ProfessionalsService,ServiceJobsService,ServiceNotificationsService,ServiceReportsService]})
export class ServicesModule {}
