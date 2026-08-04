import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ContentController } from './content.controller';
import { ContentQueueProcessor, CONTENT_QUEUE } from './content.queue';
import { ContentService } from './content.service';
import { ImageService } from './image.service';
import { VideoService } from './video.service';
import { ResearchService } from './research.service';
import { VisionService } from './vision.service';
import { AiCoreModule } from './ai-core.module';
import { BrandModule } from '../brand/brand.module';
import { ChannelsModule } from '../channels/channels.module';
import { AgentSettingsModule } from '../agent-settings/agent-settings.module';
import { GatewayModule } from '../../gateway/gateway.module';

@Module({
  imports: [
    // Provides AI_PROVIDER and ScraperService. Kept in its own module so
    // BrandModule can use them too without a circular import.
    AiCoreModule,
    BrandModule,
    ChannelsModule,
    AgentSettingsModule,
    GatewayModule,
    BullModule.registerQueue({
      name: CONTENT_QUEUE,
      defaultJobOptions: {
        // Media generation is billed, so a blind retry can spend real money on
        // a job that failed deterministically (a moderation block retries
        // identically). One retry covers transient network/5xx only.
        attempts: 2,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    }),
  ],
  controllers: [ContentController],
  providers: [ContentService, ImageService, VideoService, ResearchService, VisionService, ContentQueueProcessor],
  // AiCoreModule is re-exported (not AI_PROVIDER directly) because this module
  // no longer provides that token itself — modules importing ContentModule,
  // such as AgentsModule, still need AI_PROVIDER and ScraperService.
  exports: [ContentService, ImageService, VideoService, ResearchService, VisionService, AiCoreModule],
})
export class ContentModule {}
