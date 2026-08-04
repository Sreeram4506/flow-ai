import { EventsGateway } from './events.gateway';

/**
 * `handleJoin` used to trust a client-supplied `{ userId, orgId }` with no
 * verification at all — any socket could join `org:<any-id>` and receive
 * that organization's entire real-time stream (tasks, notifications, agent
 * activity, content updates, chat) just by claiming the id, and
 * `handleChatMessage` let a client post as any `userId` the same way. These
 * tests assert the replacement: identity comes only from a verified JWT on
 * the connection itself, and org/channel access is checked server-side
 * before a socket is allowed into a room.
 */
describe('EventsGateway — connection auth and room authorization', () => {
  const USER_ID = 'user-111111111111111111111111';
  const ORG_ID = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';

  let prisma: any;
  let jwtService: { verifyAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let membershipCache: { get: jest.Mock; set: jest.Mock };
  let gateway: EventsGateway;

  /** Minimal Socket.io client double: just what the gateway touches. */
  const socketFor = (opts: { cookie?: string; authToken?: string } = {}) => ({
    id: 'socket-1',
    handshake: { headers: { cookie: opts.cookie }, auth: opts.authToken ? { token: opts.authToken } : {} },
    join: jest.fn(),
    disconnect: jest.fn(),
  });

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ isSuperAdmin: false }) },
      organizationMember: { findUnique: jest.fn().mockResolvedValue(null) },
      chatChannelMember: { findUnique: jest.fn().mockResolvedValue(null) },
      chatMessage: { create: jest.fn() },
    };
    jwtService = { verifyAsync: jest.fn().mockResolvedValue({ sub: USER_ID }) };
    configService = { get: jest.fn().mockReturnValue('test-secret') };
    membershipCache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn() };
    gateway = new EventsGateway(prisma, jwtService as any, configService as any, membershipCache as any);
  });

  describe('handleConnection', () => {
    it('authenticates using the access_token cookie and joins the personal room', async () => {
      const client = socketFor({ cookie: 'access_token=valid.jwt.token; other=1' });
      await gateway.handleConnection(client as any);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid.jwt.token', expect.any(Object));
      expect(client.join).toHaveBeenCalledWith(`user:${USER_ID}`);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('falls back to handshake.auth.token for non-browser clients without cookies', async () => {
      const client = socketFor({ authToken: 'valid.jwt.token' });
      await gateway.handleConnection(client as any);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid.jwt.token', expect.any(Object));
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('rejects a connection with no token anywhere', async () => {
      const client = socketFor({});
      await gateway.handleConnection(client as any);

      expect(jwtService.verifyAsync).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('rejects a connection with an invalid or expired token', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
      const client = socketFor({ cookie: 'access_token=stale.jwt' });
      await gateway.handleConnection(client as any);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleJoin', () => {
    async function connected(client: ReturnType<typeof socketFor>) {
      await gateway.handleConnection(client as any);
      client.disconnect.mockClear();
    }

    it('rejects a join attempt from a socket that never authenticated', async () => {
      const client = socketFor({});
      const result = await gateway.handleJoin(client as any, { orgId: ORG_ID });

      expect(result.data.success).toBe(false);
      expect(client.join).not.toHaveBeenCalledWith(`org:${ORG_ID}`);
    });

    it("denies joining an org the authenticated user does not belong to (the core fix — orgId is no longer a client claim)", async () => {
      const client = socketFor({ cookie: 'access_token=valid.jwt' });
      await connected(client);
      prisma.organizationMember.findUnique.mockResolvedValue(null);

      const result = await gateway.handleJoin(client as any, { orgId: ORG_ID });

      expect(result.data.success).toBe(false);
      expect(client.join).not.toHaveBeenCalledWith(`org:${ORG_ID}`);
    });

    it('allows joining once the authenticated user is confirmed as an active org member', async () => {
      const client = socketFor({ cookie: 'access_token=valid.jwt' });
      await connected(client);
      prisma.organizationMember.findUnique.mockResolvedValue({
        role: 'MEMBER',
        id: 'member-1',
        status: 'ACTIVE',
      });

      const result = await gateway.handleJoin(client as any, { orgId: ORG_ID });

      expect(result.data.success).toBe(true);
      expect(client.join).toHaveBeenCalledWith(`org:${ORG_ID}`);
    });

    it('lets a super-admin join any org without a membership row', async () => {
      const client = socketFor({ cookie: 'access_token=valid.jwt' });
      await connected(client);
      prisma.user.findUnique.mockResolvedValue({ isSuperAdmin: true });

      const result = await gateway.handleJoin(client as any, { orgId: ORG_ID });

      expect(result.data.success).toBe(true);
      expect(prisma.organizationMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('handleChatMessage — authorship cannot be spoofed', () => {
    it('persists the message under the connection\'s authenticated userId, ignoring any userId in the payload', async () => {
      const client = socketFor({ cookie: 'access_token=valid.jwt' });
      await gateway.handleConnection(client as any);
      prisma.chatChannelMember.findUnique.mockResolvedValue({ id: 'membership-1' });
      prisma.chatMessage.create.mockResolvedValue({
        id: 'msg-1',
        channelId: 'chan-1',
        content: 'hi',
        userId: USER_ID,
        user: { id: USER_ID },
        createdAt: new Date(),
      });
      gateway.server = { to: () => ({ emit: jest.fn() }) } as any;

      // The old payload shape included userId; even if a malicious client
      // still sends one claiming to be someone else, it must be ignored.
      await gateway.handleChatMessage(client as any, {
        channelId: 'chan-1',
        content: 'hi',
        userId: 'someone-else',
      } as any);

      expect(prisma.chatMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: USER_ID }) }),
      );
    });

    it('refuses to post into a channel the user is not a member of', async () => {
      const client = socketFor({ cookie: 'access_token=valid.jwt' });
      await gateway.handleConnection(client as any);
      prisma.chatChannelMember.findUnique.mockResolvedValue(null);

      await gateway.handleChatMessage(client as any, { channelId: 'chan-1', content: 'hi' } as any);

      expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    });
  });
});
