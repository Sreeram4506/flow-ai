# Flow — Enterprise SaaS Business Management Platform

Flow is a multi-tenant business management platform for freelancers, agencies and small enterprises: CRM, projects and tasks, time tracking, quotations and invoicing, HR, documents, and an AI agent layer. This repository contains the NestJS backend and the Next.js dashboard.

> **Project status:** actively developed, not yet production-hardened. See [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md) for the current gap analysis and [`USABILITY_NOTES.md`](./USABILITY_NOTES.md) for known product gaps. Read both before deploying this anywhere real.

---

## Quick start

**Prerequisites:** Node.js 20+, and either Docker (recommended) or your own MongoDB **replica set** + Redis.

MongoDB must run as a replica set — Prisma requires it for transactions, which the seed script uses. A standalone `mongod` will fail at seeding.

```bash
# 1. Backing services (MongoDB replica set + Redis, correctly configured)
docker compose up -d mongo redis

# 2. Backend
npm install
cp .env.example .env          # then set JWT_SECRET / JWT_REFRESH_SECRET
npx prisma generate
npx prisma db push            # MongoDB uses schema sync, not SQL migrations
npx prisma db seed            # optional demo data
npm run start:dev

# 3. Frontend (separate terminal)
cd frontend
npm install --legacy-peer-deps
cp .env.example .env.local
npm run dev
```

| Service | URL |
|---|---|
| API | http://localhost:3000 |
| API docs (Swagger) | http://localhost:3000/api/docs |
| Health / readiness | http://localhost:3000/health · `/health/ready` |
| WebSocket gateway | ws://localhost:3000/ws |
| Dashboard | http://localhost:3001 |

The frontend port (3001) must appear in the backend's `CORS_ORIGINS`, or every request from the dashboard fails at the browser.

### Running the whole stack in Docker

```bash
docker compose up --build
```

---

## Configuration

All environment variables are validated at boot by a Zod schema in `src/config/configuration.ts` — the app refuses to start on invalid config rather than failing later at runtime. `.env.example` documents every variable.

The essential ones:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | MongoDB connection string. Replica set required. |
| `REDIS_HOST` / `REDIS_PORT` | Used for sessions, caching, rate limiting, and login lockout. |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Minimum 16 characters. Generate real values; never ship the examples. |
| `CORS_ORIGINS` | Comma-separated browser origins. Must include the frontend URL. |
| `FRONTEND_URL` | Used in email links (magic link, password reset, invites). |

Secrets belong in a secret manager in any deployed environment, not in a `.env` file on disk.

---

## Architecture

```
src/
├── common/           Shared building blocks
│   ├── cache/        Redis-backed tenant membership cache
│   ├── decorators/   @CurrentUser, @Roles, @OrgId, @Public
│   ├── filters/      GlobalExceptionFilter
│   ├── guards/       RolesGuard, TenantGuard
│   ├── interceptors/ Logging (JSON in prod), response envelope
│   └── middleware/   Request-ID correlation
├── config/           Zod-validated environment configuration
├── database/         PrismaService, RedisService (global module)
├── gateway/          Socket.IO real-time gateway
├── modules/          Feature modules (auth, projects, tasks, invoices, HR, AI agents, …)
└── main.ts           Bootstrap: helmet, CORS, validation, Swagger, static uploads

frontend/src/
├── app/(auth)/       Login, register, magic link, password reset
├── app/(dashboard)/  Authenticated app shell and feature pages
├── context/          Auth, Socket, Theme providers
├── lib/              Enums mirroring the Prisma schema, toast bus, helpers
└── services/api.ts   Axios instance: auth headers, token refresh, error toasts
```

### Multi-tenancy

Every business record is scoped by `organizationId`. Org-scoped routes are protected by `TenantGuard`, which resolves the caller's membership from the `x-organization-id` header and attaches their role to the request. Memberships are cached in Redis and explicitly invalidated whenever a role changes or a member is removed, so revocation takes effect immediately across all instances.

This is the most security-sensitive part of the codebase. It is covered by unit tests (`src/common/guards/*.spec.ts`) and end-to-end tests (`test/tenant-isolation.e2e-spec.ts`). **Keep both passing.**

### API conventions

- Responses are wrapped: `{ success, data, meta?, timestamp }`.
- Errors carry a `requestId` matching the server log line — quote it in bug reports.
- Auth: `Authorization: Bearer <token>`. Org-scoped routes also need `x-organization-id`.

---

## Testing

```bash
npm run test          # unit tests
npm run test:e2e      # end-to-end (needs MongoDB + Redis running)
npm run test:cov      # coverage
```

CI (`.github/workflows/ci.yml`) runs lint, unit tests, e2e tests against a real MongoDB replica set and Redis, and builds both backend and frontend.

---

## Deployment

```bash
docker build -t flow-backend:latest .
```

The image is a multi-stage build on Alpine Node 20, runs as an unprivileged `nestjs` user, and uses `dumb-init` for correct signal handling so shutdown hooks run.

Before going live, work through [`PRODUCTION_READINESS.md`](./PRODUCTION_READINESS.md). The critical items are: move auth tokens out of `localStorage` into httpOnly cookies, put real secrets in a secret manager, and decide whether the payments module needs a real Stripe integration or should be relabelled as manual payment logging.

Point orchestrator probes at:
- `/health` — liveness. Never touches dependencies, so a database blip won't cause a restart loop.
- `/health/ready` — readiness. Returns 503 when MongoDB or Redis is unreachable.

---

## Contributing

- `npm run lint` and `npm run format` before committing. CI fails on lint errors and warnings.
- New org-scoped endpoints must use `@UseGuards(TenantGuard)` and scope every query by `organizationId`.
- Frontend enums live in `frontend/src/lib/enums.ts` and mirror `prisma/schema.prisma` — update both together.
