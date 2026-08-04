import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Pulls the csrf_token cookie's value out of a Set-Cookie response so it can
 * be echoed back as the x-csrf-token header on mutating requests — exactly
 * what the frontend axios instance does. Login/register no longer return the
 * session tokens in the JSON body at all (they're httpOnly cookies); the
 * `request.agent(...)` below carries those automatically, the same way a
 * browser would.
 */
function extractCsrfToken(res: request.Response): string {
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const cookie = raw.find((c) => c.startsWith('csrf_token='));
  if (!cookie) throw new Error('csrf_token cookie was not set on this response');
  return decodeURIComponent(cookie.split(';')[0].split('=')[1]);
}

describe('Flow API (e2e)', () => {
  let app: INestApplication;
  let agent: ReturnType<typeof request.agent>;
  let csrfToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mirrors main.ts's bootstrap() — this harness builds its own bare
    // INestApplication rather than calling bootstrap(), so middleware wired
    // there (cookie-parser, in particular) has to be repeated here or
    // req.cookies is simply undefined and every cookie-authenticated request
    // 401s regardless of what the browser client actually sent.
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    agent = request.agent(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  // ---- Health Check ----
  describe('Health', () => {
    it('should return 401 for unauthenticated requests', () => {
      return request(app.getHttpServer())
        .get('/api/users')
        .expect(401);
    });
  });

  // ---- Auth Flow ----
  describe('Authentication', () => {
    // Unique per run: a fixed address left this suite unable to re-run
    // against a database that already had it from a previous pass (register
    // 409s, and every test after it fails as a knock-on effect).
    const testUser = {
      email: `test-e2e-${Date.now()}@flow.dev`,
      password: 'TestPass123!',
      firstName: 'Test',
      lastName: 'User',
    };

    it('POST /api/auth/register - should register a new user and set session cookies', async () => {
      const res = await agent.post('/api/auth/register').send(testUser).expect(201);

      // Session tokens travel as httpOnly Set-Cookie headers, never in the body.
      expect(res.body.data.user.email).toBe(testUser.email);
      expect(res.body.data).not.toHaveProperty('accessToken');
      const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
      expect(cookies.some((c) => c.startsWith('access_token=') && c.includes('HttpOnly'))).toBe(true);
      expect(cookies.some((c) => c.startsWith('refresh_token=') && c.includes('HttpOnly'))).toBe(true);
      csrfToken = extractCsrfToken(res);
    });

    it('GET /api/auth/me - should return authenticated user profile from the session cookie', async () => {
      const res = await agent.get('/api/auth/me').expect(200);
      expect(res.body.data.email).toBe(testUser.email);
    });

    it('POST /api/organizations without x-csrf-token - should be rejected', async () => {
      // Proves the double-submit CSRF check is actually wired in, not just
      // present in source: the session cookie is valid (same agent), but the
      // matching header is missing.
      await agent.post('/api/organizations').send({ name: 'No CSRF Org' }).expect(403);
    });

    it('POST /api/auth/login - should reject invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: testUser.email, password: 'WrongPassword123!' })
        .expect(401);
    });

    it('POST /api/auth/login - should login with credentials', async () => {
      const res = await agent
        .post('/api/auth/login')
        .send({ email: testUser.email, password: testUser.password })
        .expect(200);
      csrfToken = extractCsrfToken(res);
    });
  });

  // ---- Organizations ----
  describe('Organizations', () => {
    it('POST /api/organizations - should create an organization', async () => {
      const res = await agent
        .post('/api/organizations')
        .set('x-csrf-token', csrfToken)
        .send({ name: 'Test Org E2E' })
        .expect(201);

      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe('Test Org E2E');
    });

    it('GET /api/organizations/my - should list user organizations', async () => {
      const res = await agent.get('/api/organizations/my').expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });
});
