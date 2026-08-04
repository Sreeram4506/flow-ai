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
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../database/prisma.service';
import { TenantMembershipCache } from '../common/cache/tenant-membership.cache';
import { JwtPayload } from '../common/types';

/** Pulls one cookie's value out of a raw `Cookie` header without adding a dependency for it. */
function extractCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

@WebSocketGateway({
  // Credentialed (the handshake carries the httpOnly access_token cookie), so
  // this cannot be '*' — browsers refuse to send credentials to a wildcard
  // origin. Same allow-list the REST API uses.
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()) || ['http://localhost:3001'],
    credentials: true,
  },
  namespace: '/ws',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  // Authenticated identity per connected socket, keyed by socket id — the only
  // source of truth for "who is this connection", never anything the client
  // claims in a message payload.
  private readonly connectedClients = new Map<string, { userId: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly membershipCache: TenantMembershipCache,
  ) {}

  /**
   * Authenticates the connection itself, rather than trusting whatever
   * identity a later 'join' message claims. Previously `handleJoin` took
   * `userId`/`orgId` straight from the client with no verification at all —
   * any socket could join `org:<any-id>` and receive that organization's
   * entire real-time stream (tasks, notifications, agent activity, content
   * updates, chat) just by asking. The token travels the same way the REST
   * API now reads it: the httpOnly `access_token` cookie set at login (a
   * bare `auth.token` handshake field is accepted as a fallback for
   * non-browser clients that can't hold cookies).
   */
  async handleConnection(client: Socket) {
    const token =
      extractCookie(client.handshake.headers.cookie, 'access_token') ||
      (client.handshake.auth?.token as string | undefined);

    if (!token) {
      this.logger.warn(`Connection ${client.id} rejected: no auth token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get('jwt.secret'),
      });
      this.connectedClients.set(client.id, { userId: payload.sub });
      client.join(`user:${payload.sub}`);
      this.logger.log(`Client connected: ${client.id} (user ${payload.sub})`);
    } catch {
      this.logger.warn(`Connection ${client.id} rejected: invalid or expired token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Joins the org room for the *authenticated* socket, after confirming that
   * user is actually an active member of the requested org — the same check
   * TenantGuard applies to REST requests, reusing the same Redis-backed
   * cache. `data.userId` no longer means anything; only `orgId` is read from
   * the payload now.
   */
  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() data: { orgId: string }) {
    const identity = this.connectedClients.get(client.id);
    if (!identity) {
      client.disconnect(true);
      return { event: 'joined', data: { success: false, error: 'Not authenticated' } };
    }
    if (!data?.orgId) {
      return { event: 'joined', data: { success: false, error: 'orgId is required' } };
    }

    const isMember = await this.isOrgMember(identity.userId, data.orgId);
    if (!isMember) {
      this.logger.warn(`User ${identity.userId} denied join to org ${data.orgId}: not a member`);
      return { event: 'joined', data: { success: false, error: 'Not a member of this organization' } };
    }

    client.join(`org:${data.orgId}`);
    this.logger.log(`User ${identity.userId} joined org ${data.orgId}`);
    return { event: 'joined', data: { success: true } };
  }

  private async isOrgMember(userId: string, orgId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
    if (user?.isSuperAdmin) return true;

    let membership = await this.membershipCache.get(orgId, userId);
    if (membership === undefined) {
      const row = await this.prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
      });
      membership = row ? { role: row.role, membershipId: row.id, status: row.status } : null;
      await this.membershipCache.set(orgId, userId, membership);
    }
    return !!membership && membership.status === 'ACTIVE';
  }

  private async isChannelMember(userId: string, channelId: string): Promise<boolean> {
    const membership = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    return !!membership;
  }

  @SubscribeMessage('join-project')
  async handleJoinProject(@ConnectedSocket() client: Socket, @MessageBody() data: { projectId: string }) {
    const identity = this.connectedClients.get(client.id);
    if (!identity) {
      client.disconnect(true);
      return { event: 'joined-project', data: { success: false, error: 'Not authenticated' } };
    }

    const project = await this.prisma.project.findUnique({
      where: { id: data.projectId },
      select: { organizationId: true },
    });
    if (!project || !(await this.isOrgMember(identity.userId, project.organizationId))) {
      return { event: 'joined-project', data: { success: false, error: 'Not authorized for this project' } };
    }

    client.join(`project:${data.projectId}`);
    return { event: 'joined-project', data: { success: true } };
  }

  @SubscribeMessage('join-channel')
  async handleJoinChannel(@ConnectedSocket() client: Socket, @MessageBody() data: { channelId: string }) {
    const identity = this.connectedClients.get(client.id);
    if (!identity) {
      client.disconnect(true);
      return { event: 'joined-channel', data: { success: false, error: 'Not authenticated' } };
    }

    const membership = await this.prisma.chatChannelMember.findUnique({
      where: { channelId_userId: { channelId: data.channelId, userId: identity.userId } },
    });
    if (!membership) {
      return { event: 'joined-channel', data: { success: false, error: 'Not a member of this channel' } };
    }

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
    @MessageBody() data: { channelId: string; content: string },
  ) {
    // Authorship comes from the authenticated connection, never the payload —
    // otherwise any client could post a message as any other user just by
    // naming their id. Channel access is checked per-message, not only at
    // 'join-channel' time, since a client can emit 'chat-message' for any
    // channelId without ever having joined that room.
    const identity = this.connectedClients.get(client.id);
    if (!identity) {
      client.disconnect(true);
      return;
    }
    if (!(await this.isChannelMember(identity.userId, data.channelId))) {
      return;
    }
    try {
      // Persist message to database
      const message = await this.prisma.chatMessage.create({
        data: {
          channelId: data.channelId,
          userId: identity.userId,
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
        userId: identity.userId,
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
    const identity = this.connectedClients.get(client.id);
    if (!identity) {
      client.disconnect(true);
      return;
    }
    if (!(await this.isChannelMember(identity.userId, data.channelId))) {
      client.emit('channel-history', { channelId: data.channelId, messages: [] });
      return;
    }
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
