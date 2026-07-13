import { Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { ChatController } from './chat.controller';
import { PrismaService } from '../database/prisma.service';

@Module({
  controllers: [ChatController],
  providers: [EventsGateway, PrismaService],
  exports: [EventsGateway],
})
export class GatewayModule {}
