// ================ NOTIFICATIONS MODULE ================
import { Module, Injectable, Controller } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Get, Post, Patch, Delete, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaginationDto } from '../../common/dto';
import { CurrentUser } from '../../common/decorators';
import { paginate } from '../../common/utils';
import { NotificationType } from '@prisma/client';

export class CreateNotificationDto {
  @ApiProperty() @IsString() @IsNotEmpty() userId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiProperty({ enum: NotificationType }) @IsEnum(NotificationType) type: NotificationType;
  @ApiProperty() @IsString() @IsNotEmpty() title: string;
  @ApiProperty() @IsString() @IsNotEmpty() message: string;
  @ApiPropertyOptional() @IsOptional() data?: any;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({ data: dto });
  }

  async findAll(userId: string, query: PaginationDto & { unreadOnly?: boolean }) {
    const where: any = { userId };
    if (query.unreadOnly) where.isRead = false;
    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({ where, skip: query.skip, take: query.take, orderBy: { createdAt: 'desc' } }),
      this.prisma.notification.count({ where }),
    ]);
    return paginate(notifications, total, query.page!, query.limit!);
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { unreadCount: count };
  }

  async markAsRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true, readAt: new Date() } });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true, readAt: new Date() } });
    return { message: 'All notifications marked as read' };
  }

  async delete(userId: string, id: string) {
    await this.prisma.notification.deleteMany({ where: { id, userId } });
    return { message: 'Notification deleted' };
  }
}

@ApiTags('Notifications') @ApiBearerAuth()
@Controller('api/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get() @ApiOperation({ summary: 'List notifications' })
  findAll(@CurrentUser('id') userId: string, @Query() query: PaginationDto) { return this.service.findAll(userId, query); }

  @Get('unread-count') @ApiOperation({ summary: 'Get unread count' })
  getUnreadCount(@CurrentUser('id') userId: string) { return this.service.getUnreadCount(userId); }

  @Patch(':id/read') @ApiOperation({ summary: 'Mark as read' })
  markAsRead(@CurrentUser('id') userId: string, @Param('id') id: string) { return this.service.markAsRead(userId, id); }

  @Post('mark-all-read') @ApiOperation({ summary: 'Mark all as read' })
  markAllAsRead(@CurrentUser('id') userId: string) { return this.service.markAllAsRead(userId); }

  @Delete(':id') @ApiOperation({ summary: 'Delete notification' })
  delete(@CurrentUser('id') userId: string, @Param('id') id: string) { return this.service.delete(userId, id); }
}

@Module({ controllers: [NotificationsController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
