# Usability Pass — 2026-07-26

Method: the sandbox this was run in only allows outbound network to the npm
registry and github.com (no MongoDB Atlas, no Redis, no GitHub release
assets), so the live stack couldn't actually be booted here. Instead of
running it, I traced each core user journey by reading the frontend page and
its exact backend controller/DTO/response shape side by side, the way you'd
step through a debugger. Everything below is a concrete finding from that
trace, not a general impression.

## Fixed in this pass

**New users had no way into the product.** `auth.service.ts#register()`
creates a user but never an organization, and almost every route requires
one (`TenantGuard` 403s without `x-organization-id`). The dashboard rendered
anyway with an empty sidebar, every widget failed with a silent
`console.error`, and the one link meant to fix it — Sidebar's
"+ Create Organization" (`/organizations/create`) — pointed at a route that
didn't exist (404). Added `frontend/src/app/organizations/create/page.tsx`
(a real form against the already-working `POST /api/organizations`) and a
guard in `(dashboard)/layout.tsx` that routes org-less users there instead of
rendering the broken shell.

**Every mutating action failed or succeeded silently.** Every page's
`catch (e) { console.error(e) }` pattern meant a failed create/update/delete
looked identical to a successful one — the button just stopped spinning.
Added a small dependency-free toast system (`lib/toast.ts`,
`components/Toaster.tsx`) wired into the shared axios instance in
`services/api.ts`: every POST/PUT/PATCH/DELETE now gets a success toast, and
every failed request (outside of `/api/auth/*`, which already has inline
error UI) gets an error toast with the actual backend message instead of
disappearing into the console. Also fixed `AuthContext`'s error messages,
which passed class-validator's `message: string[]` straight into
`new Error()` and rendered as a comma-jammed run-on string with no spaces.

**Dead OAuth buttons on login.** "Google"/"GitHub" buttons had no `href` or
`onClick` — clicking did nothing. Traced why: the backend controller
(`auth.controller.ts`) has `GET /api/auth/google` and `/github` wired to
`AuthGuard('google')`/`AuthGuard('github')`, but no Passport strategy is
registered anywhere in the codebase for either provider (only
`jwt.strategy.ts` exists — `passport-google-oauth20` and `passport-github2`
are installed but never used). Hitting those routes as they stand today
throws a Passport "unknown strategy" 500, so linking the button to them would
have made things worse (navigates away to an error) rather than better.
Disabled the buttons with an honest tooltip instead. Real fix needs:
`GoogleStrategy`/`GithubStrategy` classes registered in `AuthModule`, a
callback handler that actually issues JWTs and redirects to the frontend
(current `googleCallback`/`githubCallback` just `return user` — raw JSON, no
tokens, no redirect), and a frontend route to receive the tokens. That's a
real feature to build, not a wiring fix, and I can't test an OAuth round trip
without live provider credentials — flagging rather than guessing at it.

## Navigation performance — root cause and fix

Reported symptom: the app felt slow moving between sections. It wasn't the
database (82 indexes, and the per-request user lookup was already cached) —
it was a cascade in `AuthContext`.

`refreshUser()` ran inside `useEffect(..., [pathname])`, so **every route
change re-fetched the whole session**. Each navigation therefore cost:

1. `GET /api/auth/me` — a network round-trip plus a DB read joining
   `organizationMembers` → `organization`.
2. New object identities for `user`, `organizations` and `currentOrg`, because
   the response was re-mapped into fresh objects each time.
3. A **full WebSocket teardown and re-handshake** — `SocketContext` keyed its
   effect on `[user, currentOrg]`, both of which were new references.
4. A **duplicate data fetch on the page being opened**. Sixteen pages key their
   fetch on `[currentOrg]`, so each fetched once on mount and again when
   `currentOrg`'s reference changed moments later. On `/dashboard` that meant
   the analytics endpoint — which issues 15 database queries — ran twice per
   visit.

Fixes:

- Session restore now runs **once on mount**. The route guard is a separate,
  purely client-side effect that does no network I/O.
- State setters preserve the previous reference when the underlying values are
  unchanged (`sameUser` / `sameOrg` / `sameOrgList`), so a refresh that returns
  identical data no longer invalidates anything downstream. A genuine change —
  including a role downgrade — still propagates.
- `SocketContext` keys on `user?.id` / `currentOrg?.id` (primitives) instead of
  object references, and holds the socket in a ref so teardown can't read a
  stale closure value.
- Context values are memoized, and callbacks wrapped in `useCallback`, so
  consumers stop re-rendering on every provider pass.
- `switchOrganization` no longer calls `window.location.reload()` — a full
  bundle reload used purely to make pages refetch. Setting `currentOrg` now
  achieves that directly.
- Concurrent `refreshUser()` calls de-duplicate onto a single in-flight
  request.

Net effect: navigating between sections now costs the page's own data fetch
and nothing else.

Also fixed while in there: `next.config.js` rewrote `/api/*` to a hardcoded
`http://localhost:3000`, which would have proxied to the frontend container's
own loopback in any deployed environment. It's env-driven now. (Nothing
currently relies on it — all calls go through the axios instance's absolute
base URL — so it was a latent trap rather than a live bug.)

Note: `recharts` and `framer-motion` are declared dependencies but imported
nowhere. Worth dropping, but that needs `package-lock.json` regenerated in the
same commit or `npm ci` will fail on the mismatch.

## Fixed in the follow-up pass

**Document upload is a real file picker now.** It was a form asking the user
to type a *URL* and the file size in KB — `DocumentsService.upload()` took
`fileUrl` as a plain string and trusted it, and the frontend fabricated a
fake `https://flow-documents.example.com/...` URL when the field was left
blank. So "Document Management" stored rows pointing at files that had never
been uploaded anywhere. Replaced with a genuine `multipart/form-data`
endpoint: `FileInterceptor` with a 25 MB cap and a MIME allow-list, a
storage-driver abstraction (working local-disk driver now, S3 driver drops in
without touching the module), size/type/URL all derived server-side from the
actual bytes, orphaned files cleaned up if the DB write fails, and versioning
via `POST /api/documents/:id/versions`. The axios instance also had to stop
forcing `Content-Type: application/json`, which would have stripped the
multipart boundary.

**Projects and clients now have detail views.** The backend had a full detail
surface all along — `GET /api/projects/:id`, `/:id/stats`, `/:id/members`,
`/:id/milestones`, and the equivalent client endpoints — but the frontend had
no dynamic routes at all, so milestones, project members, project stats and
the entire client history (projects, invoices, quotations, contacts) were
built and completely unreachable. Added
`projects/[id]/page.tsx` and `crm/clients/[id]/page.tsx`, and made the cards
link to them. Milestones can now be added, completed and deleted; client
contacts added and removed.

**The Kanban board drags.** Cards move between the four columns with native
HTML5 drag-and-drop (no new dependency), with an optimistic update that rolls
back if the API call fails, and a visible drop target on empty columns.

**Document upload is a real file picker.** Covered in the section above.

**Removed `@prisma/client` from the browser bundle.** Six pages imported
Prisma enums directly. That only resolved because Node's module resolution
walks up out of `frontend/` into the *backend's* `node_modules` — the
frontend never declared the dependency. Prisma enums are runtime objects, so
this pulled the Prisma client into client-side JavaScript, and it would break
the moment the frontend was built in isolation. Replaced with
`frontend/src/lib/enums.ts`, transcribed from and verified against
`prisma/schema.prisma`. (Several values were *not* what you'd guess:
`PROPOSAL_SENT`, `QuotationStatus.APPROVED`, `PaymentMethod.CHECK`.)

## Still outstanding

**Leads have no detail route.** Left deliberately: the leads page is a
pipeline board where inline stage editing suits the workflow better than a
separate page. Worth revisiting if lead notes/meeting logs need surfacing —
the backend supports them.

**Payments module doesn't touch Stripe.** `PaymentsService.create()` just
writes a ledger row; `stripe` is installed and env vars exist but there's no
webhook handler or `PaymentIntent` creation anywhere. This needs a product
decision before it's a coding task: real card processing, or relabel the
feature as manual payment logging?

**Google/GitHub OAuth still unimplemented.** As described above — needs
Passport strategies, a callback that issues JWTs and redirects, and a
frontend route to receive them. Buttons remain honestly disabled.

**No pagination controls.** Every list renders one page and the API's
`meta.totalPages` goes unused. Straightforward, but touches every list page.

**No frontend tests.** No Jest/Testing Library/Playwright setup in
`frontend/`.

See `PRODUCTION_READINESS.md` for the security and infrastructure side —
auth token storage, rate limiting, Docker, health checks, CI. That assessment
and this one are complementary, not overlapping.
