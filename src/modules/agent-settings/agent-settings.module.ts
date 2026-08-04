import { Module } from '@nestjs/common';
import { AgentSettingsService } from './agent-settings.service';

@Module({ providers: [AgentSettingsService], exports: [AgentSettingsService] })
export class AgentSettingsModule {}
