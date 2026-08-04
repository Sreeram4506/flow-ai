import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';
import { ChatController } from './chat.controller';
import { PrismaService } from '../database/prisma.service';

@Module({
  imports: [
    // Verifies the same access_token the REST API issues — no separate
    // socket-specific secret or token type.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('jwt.secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ChatController],
  providers: [EventsGateway, PrismaService],
  exports: [EventsGateway],
})
export class GatewayModule {}
