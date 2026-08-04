import { Module } from '@nestjs/common';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { WebsiteAdapter } from './adapters/website.adapter';

@Module({
  controllers: [ChannelsController],
  providers: [ChannelsService, InstagramAdapter, LinkedInAdapter, EmailAdapter, WebsiteAdapter],
  exports: [ChannelsService],
})
export class ChannelsModule {}
