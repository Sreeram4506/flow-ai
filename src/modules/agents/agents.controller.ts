import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { AgentExecutorService } from './agent-executor.service';
import { OrgId } from '../../common/decorators';
import { TenantGuard } from '../../common/guards';

@ApiTags('AI Agents')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/agents')
export class AgentsController {
  constructor(
    private readonly service: AgentsService,
    private readonly executor: AgentExecutorService,
  ) {}

  @Get() @ApiOperation({ summary: 'List agents (auto-creates CEO/CTO/Marketing on first call)' })
  list(@OrgId() orgId: string) { return this.service.ensureDefaultAgents(orgId); }

  @Get('runs') @ApiOperation({ summary: 'Recent agent runs with full action logs' })
  runs(@OrgId() orgId: string) { return this.service.listRuns(orgId); }

  @Patch(':id') @ApiOperation({ summary: 'Update agent (name, system prompt, active)' })
  update(
    @OrgId() orgId: string,
    @Param('id') id: string,
    @Body() body: { name?: string; systemPrompt?: string; isActive?: boolean },
  ) {
    return this.service.update(orgId, id, body);
  }

  @Post(':id/run') @ApiOperation({ summary: 'Manually trigger an agent with an instruction' })
  async run(@OrgId() orgId: string, @Param('id') id: string, @Body() body: { instruction: string }) {
    const agent = await this.service.get(orgId, id);
    return this.executor.runAgent(orgId, agent, 'manual', body.instruction || 'Do your daily work.');
  }
}
