import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { AgentExecutorService } from './agent-executor.service';
import { BusinessToolsService } from './business-tools.service';
import { BrandModule } from '../brand/brand.module';
import { ContentModule } from '../content/content.module';
import { ChannelsModule } from '../channels/channels.module';
import { AgentSettingsModule } from '../agent-settings/agent-settings.module';
import { GatewayModule } from '../../gateway/gateway.module';

@Module({
  imports: [BrandModule, ContentModule, ChannelsModule, AgentSettingsModule, GatewayModule],
  controllers: [AgentsController],
  providers: [AgentsService, AgentExecutorService, BusinessToolsService],
  exports: [AgentsService, AgentExecutorService, BusinessToolsService],
})
export class AgentsModule {}
