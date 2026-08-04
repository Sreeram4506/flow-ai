import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentRole, PublishChannel } from '@prisma/client';
import { OrchestratorService } from './orchestrator.service';
import { AgentSettingsService } from '../agent-settings/agent-settings.service';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('Agent Orchestrator')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/orchestrator')
export class OrchestratorController {
  constructor(
    private readonly service: OrchestratorService,
    private readonly settings: AgentSettingsService,
  ) {}

  // ---- Settings & safety rails ----

  @Get('settings') @ApiOperation({ summary: 'Get agent platform settings (caps, pauses, kill-switch)' })
  getSettings(@OrgId() orgId: string) { return this.settings.get(orgId); }

  @Patch('settings') @ApiOperation({ summary: 'Update agent platform settings' })
  updateSettings(
    @OrgId() orgId: string,
    @Body()
    body: Partial<{
      autonomyEnabled: boolean;
      pausedChannels: PublishChannel[];
      maxPostsPerDay: number;
      maxAgentStepsPerRun: number;
      maxTokensPerDay: number;
      emailHoldMinutes: number;
      autoSendEmail: boolean;
      emailAllowlist: string[];
      dailyPlanHour: number;
    }>,
  ) {
    return this.settings.update(orgId, body);
  }

  @Post('kill-switch') @ApiOperation({ summary: 'EMERGENCY: halt or resume all agent activity' })
  killSwitch(@OrgId() orgId: string, @Body() body: { active: boolean }) {
    return this.settings.update(orgId, { killSwitch: !!body.active });
  }

  // ---- Planning ----

  @Post('daily-plan/run') @ApiOperation({ summary: 'Trigger the CEO daily planning run now' })
  runPlan(@OrgId() orgId: string) { return this.service.runDailyPlan(orgId, 'manual'); }

  // ---- Human directives (give agents work) ----

  @Get('directives') @ApiOperation({ summary: 'List all agent tasks (yours + CEO-delegated) with status' })
  directives(@OrgId() orgId: string) { return this.service.listDirectives(orgId); }

  @Post('directives') @ApiOperation({ summary: 'Give an agent a task/instruction directly' })
  createDirective(
    @OrgId() orgId: string,
    @Body() body: { instruction: string; assigneeRole: AgentRole; title?: string; priority?: string; dueDate?: string; runNow?: boolean },
  ) {
    return this.service.createDirective(orgId, body);
  }

  // ---- Email pipeline ----

  @Get('emails') @ApiOperation({ summary: 'List inbound + agent-drafted emails' })
  emails(@OrgId() orgId: string) { return this.service.listEmails(orgId); }

  @Post('emails/inbound') @ApiOperation({ summary: 'Register an inbound email → CEO agent triages and drafts a reply' })
  inbound(@OrgId() orgId: string, @Body() body: { from: string; to?: string; subject?: string; body: string }) {
    return this.service.handleInboundEmail(orgId, body);
  }

  @Post('emails/:id/approve') @ApiOperation({ summary: 'Approve a drafted email (queues with hold-buffer)' })
  approve(@OrgId() orgId: string, @Param('id') id: string) { return this.service.approveEmail(orgId, id); }

  @Post('emails/:id/cancel') @ApiOperation({ summary: 'Cancel a drafted/queued email before it sends' })
  cancel(@OrgId() orgId: string, @Param('id') id: string) { return this.service.cancelEmail(orgId, id); }
}
