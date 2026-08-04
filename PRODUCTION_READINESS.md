# Flow — Production Readiness Assessment

Scope: NestJS backend (`src/`) + Next.js frontend (`frontend/`), Prisma/MongoDB, Redis. Based on direct inspection of the codebase on 2026-07-26.

Flow is a genuinely large, well-organized codebase (26 backend modules, 100 Prisma indexes, Zod-validated config, tenant isolation, Swagger docs). It was a **working demo** rather than a production system — the original setup docs (now in `docs/archive/`) confirm it had been brought to "login works, dashboard loads" status, not hardened for real traffic, real money, or real user data. Below is what stands between here and production, ordered by risk.

> **Update — a follow-up pass has since closed a number of these.** Items now
> marked **[DONE]** have been implemented; see the changelog at the bottom of
> this file. Everything unmarked is still outstanding.

---

## 1. Critical — fix before any real users or real money

**No version control.** The project directory isn't a git repository at all (`git status` fails with "not a git repository"), despite having a `.github/workflows/ci.yml`. There's no history, no way to review changes, no branch protection, no CI actually running. This has to exist before anything else matters.

**Auth tokens stored in `localStorage`.** `frontend/src/context/AuthContext.tsx` and `services/api.ts` put the JWT access token and refresh token in `localStorage`. Any XSS on the frontend (and a consumer-facing dashboard with rich text, file names, etc. will have XSS surface eventually) is a full account takeover, and it's persistent — the token doesn't even expire with the tab. The backend already pulls in `cookie-parser`, suggesting cookie-based auth was intended; it should issue the access/refresh tokens as `httpOnly`, `Secure`, `SameSite=strict` cookies instead, with CSRF protection for state-changing requests.

**No brute-force protection on auth. [DONE]** There's a single global rate limit (100 req/60s) applied to every route via `ThrottlerGuard`. Login, register, magic-link, and password-reset endpoints have no per-route throttle and no account lockout after repeated failures (`grep` for `loginAttempts`/`lockout` returns nothing). Credential stuffing and password spraying are wide open.

**Payments module doesn't actually process payments.** `PaymentsService.create()` just writes a `Payment` row and marks the invoice paid — it's a manual bookkeeping form, not a Stripe integration. `stripe` is a dependency and `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are in `.env.example`, but there is no webhook handler, no `constructEvent` signature verification, no charge/PaymentIntent creation anywhere in `src/`. If the product intends to actually take card payments, this is unbuilt, not just unhardened. If it's meant to stay a manual ledger, the README/marketing copy overstates it and should say so.

**Document uploads accept an arbitrary client-supplied URL. [DONE]** `DocumentsService.upload()` takes `fileUrl` straight from the request body (`@IsString()`), with no server-side file handling. There's no `multer`/`FileInterceptor` usage anywhere in `src/modules`, despite an S3 bucket being configured in env. This means "upload a document" is really "tell the server a URL," with no size limit, no MIME/type validation, no malware scanning, and a soft SSRF/content-spoofing angle if anything on the backend ever fetches that URL.

**Real-looking secrets live in a working `.env` file in the repo.** `.env` is gitignored (good), but it currently exists on disk with production-shaped keys filled in (including a live-looking MongoDB Atlas connection string). Before this ever touches git or a shared machine, rotate anything in there that's a real credential and move secret management to a vault (AWS Secrets Manager, Doppler, 1Password, etc.) rather than a flat file.

## 2. High — needed for a stable production deployment

**No Dockerfile despite the README describing one. [DONE]** The README's deployment section says "This Dockerfile leverages a multi-stage build... non-root user... Alpine Node v20," but no `Dockerfile` exists in the repo. There's also no `docker-compose.yml` for local Mongo/Redis, even though `.gitignore` has entries for `postgres_data/`, `redis_data/`, `pgadmin_data/` (leftover from a different stack — possibly copy-pasted boilerplate, worth checking whether Postgres was the original plan).

**No health-check endpoint. [DONE]** No `/health` or `/healthz`, no `@nestjs/terminus`. Load balancers, ECS/Cloud Run, and k8s all need this to know when to route traffic to an instance and when to restart it.

**No structured logging or error tracking. [PARTLY DONE]** Logging is `Logger.log()` string interpolation to stdout — fine for `docker logs`, not fine for aggregating across instances or searching by request ID. No Sentry/Datadog/similar wired in, so unhandled exceptions in production are invisible until a user complains. Add a JSON logger (pino/winston) with request-ID correlation, plus an error-tracking SDK.

**Tenant membership cache won't work once you scale horizontally. [DONE]** `TenantGuard` caches org-membership lookups in an in-process `TtlCache` (30s TTL) to avoid a DB round-trip per request. That's a reasonable optimization on one instance, but on N instances a role change or a member removal can stay effective on stale instances for up to 30s after being revoked elsewhere — a real problem for "user removed from org" or "role downgraded" scenarios. Move this to Redis (already a dependency) so invalidation is instant and shared.

**`Bull` is installed but never used.** `@nestjs/bull`/`bull` are dependencies, `BullModule` is never registered, and there's no `@Processor`/`@Process`. Anything that should be async — sending email, generating PDFs (`pdfkit`), AI agent orchestration, image generation — currently appears to run inline on the request thread. That's a latency and reliability problem (a slow SMTP call or Gemini call blocks the HTTP response, and any failure mid-request loses the job entirely with no retry). Wire up actual queues for anything that talks to a third-party API or generates a file.

**Only one backend test file. [PARTLY DONE]** `src/common/utils/helpers.spec.ts` is the entire unit-test suite for a 26-module backend; the one e2e spec covers register/login/org-create happy paths only. There's no coverage for tenant isolation (can org A read org B's data?), payment/invoice math, RBAC boundaries, or the AI agent/orchestrator modules. CI runs `npm run test` and `npm run test:e2e` but they're testing almost nothing, and `lint` is set to `continue-on-error: true` so lint failures don't fail the build.

**Frontend has zero tests.** No Jest/Playwright/Testing Library setup in `frontend/`.

## 3. Medium — quality, maintainability, cost

**Module files that mix DTO + service + controller in one file.** `payments`, `documents`, `expenses`, `hr`, `analytics`, `notifications`, `search`, `audit-logs`, and `ai` are each a single `.module.ts` file containing everything. It works, but it's inconsistent with the better-organized modules (`auth`, `projects`, `tasks` split into proper files) and will get harder to navigate and test as those modules grow. Worth a pass to split them out to match the rest of the codebase.

**Demo credentials documented in-repo.** The archived docs list working demo passwords (`admin@flow.dev / Admin@123`, etc.). Fine for a local seed script; make sure these never reach a deployed/seeded production database, and rotate them if they were ever reused anywhere real. `docs/archive/README.md` now carries that warning, but the files themselves should be deleted before the repo is shared externally.

**Docs are demo-status, not production docs. [DONE]** Six overlapping local-setup guides have been folded into the root `README.md` and moved to `docs/archive/`, and the AI-agent platform docs moved to `docs/`.

**Port/URL inconsistencies. [DONE]** `.env.example` sets `FRONTEND_URL=http://localhost:4000`, `CORS_ORIGINS=http://localhost:4000,...`, but `frontend/package.json` runs `next dev -p 3001` and the README's "Getting Started" section also says port 3001. Whoever sets this up fresh will hit a CORS wall until they reconcile these. Pick one, and keep every doc/env/script referencing it consistently.

**No database backup/DR story documented.** MongoDB replica set is required for Prisma transactions (correctly called out in CI comments), but there's nothing about backup cadence, point-in-time recovery, or a tested restore process.

**No API versioning strategy.** All routes are flat under `/api/*`. Fine at this stage, but worth deciding now (`/api/v1/*`) before external integrators start depending on the current shape.

## 4. What remains, in priority order

1. **Init git.** Nothing else is safe without it — there's currently no way to review, revert, or bisect any of this.
2. **Move auth tokens to httpOnly cookies + CSRF protection.** The single biggest remaining security gap.
3. **Rotate the credentials in `.env`** (it contains a live-looking Atlas connection string) and move secrets to a manager.
4. **Decide payments' real scope** — build the Stripe PaymentIntent + webhook flow, or relabel the feature as manual payment logging.
5. **Wire up Bull** for email, PDF generation, and AI/image calls so they stop blocking request threads.
6. **Add an error-tracking SDK** (Sentry or similar) — structured logs are in place, but nothing alerts on a 500 yet.
7. **Swap the local storage driver for S3** before running more than one instance (uploads currently land on container-local disk).
8. **Broaden test coverage** to invoice/payment math and the agent modules; add frontend tests.
9. Split the bundled single-file modules; document a backup/restore process; decide on API versioning.

---

## 5. Changelog — implemented 2026-07-26

**Security**
- Per-route rate limits on every credential-accepting endpoint (login/2FA 5·min⁻¹, register 5·hr⁻¹, email-sending routes 3 per 15 min), replacing the blanket 100/min that allowed ~144k password guesses a day per IP.
- Redis-backed per-account lockout (10 failures → 15 min), which catches distributed attempts that per-IP limits miss. Counts failures for non-existent accounts too, so the lockout can't be used as an account-enumeration oracle. Fails open if Redis is down.
- `GlobalExceptionFilter` no longer returns raw internal error messages in production — Prisma errors were leaking query and connection detail to clients. Full detail is logged against a request ID instead.
- Uploads are MIME allow-listed (SVG deliberately excluded — it can carry script), size-capped at 25 MB, stored under generated names (never the client's filename), and served with `nosniff` + a sandbox CSP.

**Correctness / infrastructure**
- **Fixed a broken production start.** `npm run start:prod` ran `node dist/main`, but the build emitted `dist/src/main.js` because `prisma.config.ts` at the project root pulled the output root up a level. `rootDir` is now pinned to `./src`.
- Multi-stage `Dockerfile` (Alpine Node 20, non-root `nestjs` user, `dumb-init` for signal handling), `.dockerignore` that keeps `.env` out of image layers, and a `docker-compose.yml` that stands up MongoDB **as a replica set** — the step that otherwise breaks seeding for every new contributor.
- `/health` (liveness, no dependency checks so a DB blip can't cause a restart loop) and `/health/ready` (readiness, pings Mongo + Redis, returns a real 503).
- Tenant membership cache moved from in-process to Redis, **with explicit invalidation** on member removal, role change, invite acceptance and org deletion. Previously a removed user kept full access on every other instance until its local TTL lapsed.
- Request-ID correlation middleware; JSON access logs in production; failed requests are now logged at all (the old interceptor only had a success handler, so errors produced no access-log line).
- Port/CORS mismatch fixed across `.env.example`, the Zod defaults, and the `main.ts` fallback — a fresh `cp .env.example .env` previously produced an immediate CORS failure.

**Testing**
- 19 guard assertions covering tenant isolation and RBAC boundaries (`src/common/guards/*.spec.ts`), plus a 10-case cross-tenant e2e suite (`test/tenant-isolation.e2e-spec.ts`).
- CI no longer swallows lint failures (`continue-on-error: true` removed, `--max-warnings=0` added) and now builds the frontend, which it never did.

See `USABILITY_NOTES.md` for the product-usability pass — what a real user hits on day one, and what was fixed versus flagged.
