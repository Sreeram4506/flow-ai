import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../database/prisma.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/ws',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private readonly connectedClients = new Map<string, { userId: string; orgId?: string }>();

  constructor(private readonly prisma: PrismaService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; orgId: string },
  ) {
    this.connectedClients.set(client.id, { userId: data.userId, orgId: data.orgId });
    client.join(`org:${data.orgId}`);
    client.join(`user:${data.userId}`);
    this.logger.log(`User ${data.userId} joined org ${data.orgId}`);
    return { event: 'joined', data: { success: true } };
  }

  @SubscribeMessage('join-project')
  handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    client.join(`project:${data.projectId}`);
    return { event: 'joined-project', data: { success: true } };
  }

  @SubscribeMessage('join-channel')
  handleJoinChannel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string },
  ) {
    client.join(`channel:${data.channelId}`);
    return { event: 'joined-channel', data: { success: true } };
  }

  // ---- Emit methods for other services to use ----

  emitToOrg(orgId: string, event: string, data: any) {
    this.server.to(`org:${orgId}`).emit(event, data);
  }

  emitToUser(userId: string, event: string, data: any) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToProject(projectId: string, event: string, data: any) {
    this.server.to(`project:${projectId}`).emit(event, data);
  }

  emitToChannel(channelId: string, event: string, data: any) {
    this.server.to(`channel:${channelId}`).emit(event, data);
  }

  // ---- Chat messages (persisted) ----
  @SubscribeMessage('chat-message')
  async handleChatMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string; content: string; userId: string },
  ) {
    try {
      // Persist message to database
      const message = await this.prisma.chatMessage.create({
        data: {
          channelId: data.channelId,
          userId: data.userId,
          content: data.content,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
      });

      this.server.to(`channel:${data.channelId}`).emit('new-message', {
        id: message.id,
        channelId: message.channelId,
        content: message.content,
        userId: message.userId,
        user: message.user,
        createdAt: message.createdAt.toISOString(),
      });
    } catch (err) {
      this.logger.error('Failed to persist chat message:', err);
      // Fallback: still broadcast even if persistence fails
      this.server.to(`channel:${data.channelId}`).emit('new-message', {
        channelId: data.channelId,
        content: data.content,
        userId: data.userId,
        createdAt: new Date().toISOString(),
      });
    }
  }

  // ---- Load message history for a channel ----
  @SubscribeMessage('load-history')
  async handleLoadHistory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { channelId: string; limit?: number },
  ) {
    try {
      const messages = await this.prisma.chatMessage.findMany({
        where: { channelId: data.channelId },
        take: data.limit || 50,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
      });
      client.emit('channel-history', { channelId: data.channelId, messages: messages.reverse() });
    } catch (err) {
      this.logger.error('Failed to load chat history:', err);
      client.emit('channel-history', { channelId: data.channelId, messages: [] });
    }
  }

  // ---- Notifications ----
  sendNotification(userId: string, notification: any) {
    this.emitToUser(userId, 'notification', notification);
  }

  // ---- Task updates ----
  sendTaskUpdate(orgId: string, projectId: string, update: any) {
    this.emitToProject(projectId, 'task-update', update);
    this.emitToOrg(orgId, 'task-update', update);
  }

  // ---- Dashboard updates ----
  sendDashboardUpdate(orgId: string, data: any) {
    this.emitToOrg(orgId, 'dashboard-update', data);
  }
}
