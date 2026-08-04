import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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
 * valid token, must not be able to touch org A's data".
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

  let tokenA: string;
  let tokenB: string;
  let orgA: string;
  let orgB: string;
  let projectA: string;

  const authed = (token: string, org?: string) => {
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (org) headers['x-organization-id'] = org;
    return headers;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const server = app.getHttpServer();

    const regA = await request(server).post('/api/auth/register').send(userA).expect(201);
    tokenA = regA.body.accessToken ?? regA.body.data?.accessToken;

    const regB = await request(server).post('/api/auth/register').send(userB).expect(201);
    tokenB = regB.body.accessToken ?? regB.body.data?.accessToken;

    const createdOrgA = await request(server)
      .post('/api/organizations')
      .set(authed(tokenA))
      .send({ name: `Org A ${unique}` })
      .expect(201);
    orgA = createdOrgA.body.data.id;

    const createdOrgB = await request(server)
      .post('/api/organizations')
      .set(authed(tokenB))
      .send({ name: `Org B ${unique}` })
      .expect(201);
    orgB = createdOrgB.body.data.id;

    const createdProject = await request(server)
      .post('/api/projects')
      .set(authed(tokenA, orgA))
      .send({ name: 'Org A Confidential Project' })
      .expect(201);
    projectA = createdProject.body.data.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an org-scoped request with no organization header', async () => {
    await request(app.getHttpServer())
      .get('/api/projects')
      .set(authed(tokenA))
      .expect(403);
  });

  it("rejects a user presenting another organization's id", async () => {
    // User B is authenticated, but is not a member of org A.
    await request(app.getHttpServer())
      .get('/api/projects')
      .set(authed(tokenB, orgA))
      .expect(403);
  });

  it("does not leak org A's projects into org B's listing", async () => {
    const res = await request(app.getHttpServer())
      .get('/api/projects')
      .set(authed(tokenB, orgB))
      .expect(200);

    const ids = (res.body.data ?? []).map((p: any) => p.id);
    expect(ids).not.toContain(projectA);
  });

  it("blocks reading another org's project by direct id", async () => {
    // Even with a correct, existing project id, the tenant scope must win.
    await request(app.getHttpServer())
      .get(`/api/projects/${projectA}`)
      .set(authed(tokenB, orgA))
      .expect(403);
  });

  it("blocks reading another org's project while scoped to one's own org", async () => {
    // The guard passes here (B really is a member of org B), so this asserts
    // the *service* also scopes its query by organizationId — a 200 would mean
    // the query ignored the tenant and leaked the record.
    await request(app.getHttpServer())
      .get(`/api/projects/${projectA}`)
      .set(authed(tokenB, orgB))
      .expect(404);
  });

  it("blocks mutating another org's project", async () => {
    await request(app.getHttpServer())
      .patch(`/api/projects/${projectA}`)
      .set(authed(tokenB, orgB))
      .send({ name: 'Hijacked' })
      .expect(404);
  });

  it("blocks deleting another org's project", async () => {
    await request(app.getHttpServer())
      .delete(`/api/projects/${projectA}`)
      .set(authed(tokenB, orgB))
      .expect(404);
  });

  it('still allows the rightful owner through', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectA}`)
      .set(authed(tokenA, orgA))
      .expect(200);

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
      .set(authed('not-a-real-jwt', orgA))
      .expect(401);
  });
});
