import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * End-to-end proof that one organization cannot reach another's data.
 *
 * This is the highest-consequence property in a multi-tenant product: a
 * regression here is a data breach, not an outage. The unit tests in
 * `src/common/guards/tenant.guard.spec.ts` cover the guard in isolation and
 * run anywhere; this suite exercises the whole stack (HTTP → guards →
 * service → database) and needs MongoDB and Redis, which CI provides.
 *
 * Shape of the fixture: two users, each owning their own organization, with
 * one project apiece. Every assertion is some form of "user B, holding a
 * valid session, must not be able to touch org A's data".
 *
 * Session tokens are httpOnly cookies now, not values this file can read —
 * each user gets its own `request.agent(...)`, which keeps its own cookie
 * jar across calls, the same way two separate browsers would.
 */
describe('Tenant isolation (e2e)', () => {
  let app: INestApplication;

  const unique = Date.now();
  const userA = {
    email: `iso-a-${unique}@flow.dev`,
    password: 'TestPass123!',
    firstName: 'Iso',
    lastName: 'UserA',
  };
  const userB = {
    email: `iso-b-${unique}@flow.dev`,
    password: 'TestPass123!',
    firstName: 'Iso',
    lastName: 'UserB',
  };

  let agentA: ReturnType<typeof request.agent>;
  let agentB: ReturnType<typeof request.agent>;
  let csrfA: string;
  let csrfB: string;
  let orgA: string;
  let orgB: string;
  let projectA: string;

  function extractCsrfToken(res: request.Response): string {
    const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    const cookie = raw.find((c) => c.startsWith('csrf_token='));
    if (!cookie) throw new Error('csrf_token cookie was not set on this response');
    return decodeURIComponent(cookie.split(';')[0].split('=')[1]);
  }

  /** x-organization-id plus the CSRF header a mutating request needs. */
  const scoped = (csrfToken: string, org?: string) => {
    const headers: Record<string, string> = { 'x-csrf-token': csrfToken };
    if (org) headers['x-organization-id'] = org;
    return headers;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // See app.e2e-spec.ts: this harness builds its own INestApplication
    // rather than calling main.ts's bootstrap(), so cookie-parser has to be
    // registered here too or req.cookies is undefined for every request.
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const server = app.getHttpServer();
    agentA = request.agent(server);
    agentB = request.agent(server);

    const regA = await agentA.post('/api/auth/register').send(userA).expect(201);
    csrfA = extractCsrfToken(regA);

    const regB = await agentB.post('/api/auth/register').send(userB).expect(201);
    csrfB = extractCsrfToken(regB);

    const createdOrgA = await agentA
      .post('/api/organizations')
      .set(scoped(csrfA))
      .send({ name: `Org A ${unique}` })
      .expect(201);
    orgA = createdOrgA.body.data.id;

    const createdOrgB = await agentB
      .post('/api/organizations')
      .set(scoped(csrfB))
      .send({ name: `Org B ${unique}` })
      .expect(201);
    orgB = createdOrgB.body.data.id;

    const createdProject = await agentA
      .post('/api/projects')
      .set(scoped(csrfA, orgA))
      .send({ name: 'Org A Confidential Project' })
      .expect(201);
    projectA = createdProject.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an org-scoped request with no organization header', async () => {
    await agentA.get('/api/projects').expect(403);
  });

  it("rejects a user presenting another organization's id", async () => {
    // User B is authenticated, but is not a member of org A.
    await agentB.get('/api/projects').set('x-organization-id', orgA).expect(403);
  });

  it("does not leak org A's projects into org B's listing", async () => {
    const res = await agentB.get('/api/projects').set('x-organization-id', orgB).expect(200);

    const ids = (res.body.data ?? []).map((p: any) => p.id);
    expect(ids).not.toContain(projectA);
  });

  it("blocks reading another org's project by direct id", async () => {
    // Even with a correct, existing project id, the tenant scope must win.
    await agentB.get(`/api/projects/${projectA}`).set('x-organization-id', orgA).expect(403);
  });

  it("blocks reading another org's project while scoped to one's own org", async () => {
    // The guard passes here (B really is a member of org B), so this asserts
    // the *service* also scopes its query by organizationId — a 200 would mean
    // the query ignored the tenant and leaked the record.
    await agentB.get(`/api/projects/${projectA}`).set('x-organization-id', orgB).expect(404);
  });

  it("blocks mutating another org's project", async () => {
    await agentB
      .patch(`/api/projects/${projectA}`)
      .set(scoped(csrfB, orgB))
      .send({ name: 'Hijacked' })
      .expect(404);
  });

  it("blocks deleting another org's project", async () => {
    await agentB.delete(`/api/projects/${projectA}`).set(scoped(csrfB, orgB)).expect(404);
  });

  it('still allows the rightful owner through', async () => {
    const res = await agentA.get(`/api/projects/${projectA}`).set('x-organization-id', orgA).expect(200);

    expect(res.body.data.id).toBe(projectA);
  });

  it('rejects a request with no credentials at all', async () => {
    await request(app.getHttpServer())
      .get('/api/projects')
      .set({ 'x-organization-id': orgA })
      .expect(401);
  });

  it('rejects a forged bearer token', async () => {
    await request(app.getHttpServer())
      .get('/api/projects')
      .set({ Authorization: 'Bearer not-a-real-jwt', 'x-organization-id': orgA })
      .expect(401);
  });
});
