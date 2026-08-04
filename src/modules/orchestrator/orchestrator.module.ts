import { Module } from '@nestjs/common';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';
import { AgentsModule } from '../agents/agents.module';
import { AgentSettingsModule } from '../agent-settings/agent-settings.module';
import { ChannelsModule } from '../channels/channels.module';
import { GatewayModule } from '../../gateway/gateway.module';

@Module({
  imports: [AgentsModule, AgentSettingsModule, ChannelsModule, GatewayModule],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
