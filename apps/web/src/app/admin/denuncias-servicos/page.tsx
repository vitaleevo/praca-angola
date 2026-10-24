import { WorkspacePage } from '../../../components/workspace-page';
import { ServicesAccount } from '../../../components/services-account';
import { ServiceReportModeration } from '../../../components/service-report-moderation';
export default function Page(){return <WorkspacePage area="admin" services><ServicesAccount><ServiceReportModeration/></ServicesAccount></WorkspacePage>;}
