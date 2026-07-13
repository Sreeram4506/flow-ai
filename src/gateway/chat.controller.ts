import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';
import { OrgId, CurrentUser } from '../common/decorators';
import { TenantGuard } from '../common/guards';

@ApiTags('Chat')
@ApiBearerAuth()
@ApiHeader({ name: 'x-organization-id', required: true })
@UseGuards(TenantGuard)
@Controller('api/chat')
export class ChatController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('channels')
  @ApiOperation({ summary: 'List chat channels' })
  async getChannels(@OrgId() orgId: string) {
    let channels = await this.prisma.chatChannel.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'asc' },
    });

    // Auto-create default channels if none exist
    if (channels.length === 0) {
      const defaultNames = ['general', 'engineering', 'finance'];
      for (const name of defaultNames) {
        await this.prisma.chatChannel.create({
          data: {
            name,
            organizationId: orgId,
            isDirectMessage: false,
          },
        });
      }
      channels = await this.prisma.chatChannel.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'asc' },
      });
    }

    return channels;
  }
}
