# Flow → Autonomous AI Agency: Implementation Plan

**Goal:** Turn Flow into a system where you register your company's social accounts (Instagram, LinkedIn, website) and email, and a team of AI agents — **CEO, CTO, Marketing** — plans work, generates images, posts every day, drafts/sends emails in your voice, and auto-assigns tasks to each other. Runs autonomously on a schedule.

**Decisions locked with you:**
- Build **on top of the existing Flow codebase** (reuse NestJS, auth, multi-tenancy, tasks, Prisma/Mongo, Redis, Bull, the AI/Gemini module, and the Socket.io gateway).
- **Fully autonomous** operation (agents act without a per-item approval gate) — with mandatory safety rails described in §7. **Do not skip the rails**; "autonomous" without a kill-switch and spend/rate caps is how accounts get banned.
- Channels: **Instagram, LinkedIn, Email, Website/Blog.**

---

## 1. The honest constraints (read this first)

These shape everything below. Your existing AI module already calls Google Gemini (`@google/genai`, `gemini-2.5-flash`), so the LLM layer is in place.

| Channel | Can we auto-post? | What it requires | Realistic lead time |
|---|---|---|---|
| **Instagram** | Yes | Instagram **Business/Creator** account + linked Facebook Page + Meta app + **App Review** approval for `instagram_business_content_publish`. Two-step publish (create media container → publish). Images must sit at a **public URL**. ~**25 posts/day** cap. | 2–4 weeks (app review) |
| **LinkedIn** | Yes, but gated | **Marketing Developer Platform / Community Management API**, `w_organization_social` scope, verified app tied to your Company Page, app review. Partner tier ~**$699+/mo**. ~100 calls/day/member. | Weeks + budget |
| **Email** | Yes | Gmail API or Microsoft Graph (Outlook), OAuth2, send scope. Easy. | Days |
| **Website/Blog** | Yes | Publish to your own DB/CMS (you own it). Easiest. | Days |

**Design implication:** build a **channel-adapter layer** so each platform is a swappable module. Ship Website + Email + Instagram first; put LinkedIn behind the same interface and, while its official access is pending/expensive, bridge it with a third-party posting API (e.g. Postproxy / Zernio / Ayrshare-style services) without changing the rest of the system.

---

## 2. Target architecture (on top of Flow)

```
                    ┌──────────────────────────────────────────────┐
                    │  Frontend (Next.js) — Agent Console            │
                    │  brand profile • agent activity feed •         │
                    │  content calendar • kill-switch • logs         │
                    └───────────────┬──────────────────────────────┘
                                    │ REST + Socket.io (live agent feed)
┌───────────────────────────────────┴───────────────────────────────────┐
│  Flow NestJS Backend                                                    │
│                                                                         │
│  NEW: modules/agents/         ← agent registry, roles, system prompts   │
│  NEW: modules/orchestrator/   ← supervisor loop, task delegation        │
│  NEW: modules/content/        ← post/image generation + calendar        │
│  NEW: modules/channels/       ← adapters: instagram, linkedin, email,   │
│                                 website  (one interface, many impls)    │
│  NEW: modules/brand/          ← brand profile, voice, assets, accounts  │
│                                                                         │
│  REUSE: modules/ai (Gemini)   ← text + image generation                 │
│  REUSE: modules/tasks         ← agents create/assign real Flow tasks    │
│  REUSE: gateway (Socket.io)   ← stream agent thoughts/actions live      │
│  REUSE: auth + TenantGuard    ← per-organization isolation              │
│  REUSE: Bull + Redis          ← job queues + daily cron scheduling      │
└───────────────┬─────────────────────────────────────────────────────────┘
                │
     ┌──────────┴───────────┬──────────────┬──────────────┐
   Gemini API         Image gen API     Gmail/Graph     Social APIs
 (text, planning)   (Imagen/gpt-image)   (email)      (IG / LinkedIn)
```

**Why this fits Flow:** you already have `@nestjs/schedule` (cron), `@nestjs/bull` + `ioredis` (queues), the Gemini AI service, a Socket.io gateway, and a tasks module with assignment. The agent system is largely **wiring existing pieces together** plus new channel integrations.

---

## 3. The agent model

Each agent is **not** a separate server — it's a **role definition**: a system prompt + a set of allowed tools + a place in the delegation hierarchy. One orchestration engine runs them all.

### Roles

- **CEO Agent (orchestrator/supervisor).** Owns the daily plan. Reads brand goals and yesterday's results, sets the day's objectives, and **delegates** by creating Flow tasks assigned to the CTO and Marketing agents. Approves/reprioritizes. Handles inbound email triage: decides what needs a reply and who drafts it.
- **Marketing Agent.** Generates the content calendar, writes captions/posts in your brand voice, requests images, schedules posts per channel, drafts marketing emails/newsletters. Produces the daily Instagram/LinkedIn/blog content.
- **CTO Agent.** Owns anything technical/operational: website/blog publishing, analytics summarization, monitoring integration health (token expiry, failed posts), and drafting technical or product-update content. Flags when a channel is broken.

### How agents "talk to each other"

Delegation happens through **real Flow tasks**, not a hidden channel — so you can see everything:

1. CEO agent runs (daily cron) → produces a plan → creates Tasks (`assigneeAgentId = marketing/cto`).
2. A worker picks up each agent-assigned task from the Bull queue.
3. The assigned agent runs with its role prompt + the task context + its tools, produces an output (a drafted post, an image, an email), and either publishes (autonomous) or writes back a result.
4. Every step is streamed to the frontend via Socket.io and written to `AgentRun` / `AgentAction` logs and the existing `AuditLog`.

This reuses your tasks module directly — agent work is visible in the same task board as human work.

### Agent loop (per run)

```
build context (brand profile + role prompt + task + recent memory)
   → call Gemini (with tool schema)
   → agent chooses a tool: generate_image | draft_post | schedule_post
      | send_email | create_task | assign_task | publish_website | analyze
   → execute tool (via channel adapters / content service)
   → record AgentAction + stream to UI
   → repeat until task done or step budget hit
```

Keep it a **bounded loop** (max N steps, max token/$ per run) — this is both a cost control and a safety rail.

---

## 4. Data model additions (Prisma / MongoDB)

Add to `prisma/schema.prisma`, all scoped by `organizationId` to match Flow's multi-tenancy. (MongoDB → use `prisma db push`, not `migrate` — see §9.)

- `BrandProfile` — company name, description, mission, tone/voice guidelines, target audience, color palette, logo/asset URLs, posting cadence, do/don't rules. **This is what makes emails and posts sound like you.**
- `SocialAccount` — `{ platform, accountName, externalId, accessToken (encrypted), refreshToken (encrypted), tokenExpiresAt, status }`. One row per connected channel.
- `Agent` — `{ role (CEO|CTO|MARKETING), name, systemPrompt, model, tools[], isActive }`.
- `AgentRun` — one execution: `{ agentId, trigger (cron|task|email), status, startedAt, finishedAt, costTokens }`.
- `AgentAction` — every tool call within a run: `{ runId, tool, input, output, status }`. Your audit trail.
- `ContentItem` — `{ channel, type (image_post|text|reel|blog|email), caption, imageUrl, status (draft|scheduled|published|failed), scheduledFor, publishedAt, externalPostId, agentId }`.
- `EmailThread` / `EmailMessage` — inbound + agent-drafted/sent mail with context linkage.
- Extend existing `Task` with optional `assigneeAgentId` and `origin (human|agent)` so agents and humans share one board.

Enums: `AgentRole`, `Channel`, `ContentStatus`.

---

## 5. New backend modules (mirror Flow's module conventions)

Follow the multi-file pattern of your mature modules (controller / service / dto / module), not the single-file style:

1. **`modules/brand`** — CRUD for BrandProfile + asset uploads. The onboarding surface where you "give all the details."
2. **`modules/channels`** — an `IChannelAdapter` interface (`authorize()`, `publish(content)`, `verify()`) with implementations: `InstagramAdapter`, `LinkedInAdapter`, `EmailAdapter` (Gmail/Graph), `WebsiteAdapter`. OAuth callback routes live here. Encrypt tokens at rest.
3. **`modules/content`** — content generation (caption via Gemini, image via image API), the calendar, scheduling, and the publish pipeline (calls the right adapter).
4. **`modules/agents`** — agent registry, role system prompts, and the per-agent run executor with the bounded tool loop.
5. **`modules/orchestrator`** — the CEO/supervisor daily loop, delegation logic (task creation/assignment), email-triage entrypoint, and the Bull processors that run agent-assigned tasks.

**Image generation:** add an `IMAGE_PROVIDER` to the AI service. Options: Google **Imagen** (stays in your existing Gemini/Google stack), or OpenAI `gpt-image-1`. Generated images must be uploaded to public storage (your `.env` already scaffolds **AWS S3**) so Instagram can fetch them by URL.

**Scheduling:** `@nestjs/schedule` cron fires the CEO daily plan (e.g. 07:00). Publishing uses **Bull delayed jobs** so each `ContentItem.scheduledFor` posts at its own time, with retry/backoff on failure and IG rate-limit pacing.

---

## 6. Frontend additions (Next.js Agent Console)

New route group `(agents)` reusing your existing dashboard shell and axios client:

- **Onboarding / Brand** — forms to enter company details, connect accounts (OAuth buttons), upload logo/brand assets, set voice and cadence.
- **Agent Activity Feed** — live Socket.io stream of what each agent is thinking/doing right now.
- **Content Calendar** — see/queue upcoming posts per channel; edit a draft before it goes (even in autonomous mode, editing beats regret).
- **Inbox** — inbound emails + agent-drafted replies.
- **Control Panel** — the **global kill-switch**, per-channel pause, spend caps, and run logs.

---

## 7. Safety rails (non-negotiable, even in "fully autonomous" mode)

Autonomy without these gets accounts banned and money burned:

- **Global kill-switch** + per-channel pause that halts all queues instantly.
- **Rate caps** below platform limits (e.g. ≤ a few IG posts/day, well under the ~25/day and 100 LinkedIn calls/day ceilings).
- **Spend cap** per day on LLM + image generation; loop stops when hit.
- **Email send guardrails:** allowlist/blocklist of recipients, a mandatory short **hold-buffer** (e.g. queue sends for a few minutes so you can cancel), and hard blocks on anything that reads as financial/legal/contractual.
- **Brand-safety filter:** every generated post/image passes a policy check (no prohibited content, on-brand, no fabricated claims about real people) before publish.
- **Full audit trail:** every `AgentAction` logged + mirrored to Flow's `AuditLog`; nothing publishes without a traceable record.
- **Token health monitor** (CTO agent): detect expired/near-expiry OAuth tokens and pause that channel gracefully instead of failing loudly in public.

I'd still strongly recommend keeping **email** on approve-before-send even while social is autonomous — a wrong public post is embarrassing; a wrong email is often irreversible.

---

## 8. Phased build order

**Phase 0 — Foundation (fix + scaffold).** Repair the CI/DB mismatch (see §9). Add the new Prisma models via `db push`. Scaffold the five modules empty. *(~week 1)*

**Phase 1 — Brand + one channel end to end (Website).** Brand profile onboarding. Marketing agent generates a blog post + image, publishes to your own site/DB. Proves the generate→image→publish→log pipeline with zero external-API gatekeeping. *(~week 1–2)*

**Phase 2 — Agent orchestration.** CEO daily cron → plan → delegate as Flow tasks → Marketing/CTO workers execute → live feed via Socket.io. Bounded loops, cost caps, kill-switch. *(~week 2–3)*

**Phase 3 — Email.** Gmail/Graph OAuth. Inbound triage by CEO agent → drafted replies in your voice → hold-buffer send. *(~week 3–4)*

**Phase 4 — Instagram.** Start Meta app review early (it's the long pole). Business account + FB Page + S3-hosted images + two-step publish + rate pacing. *(app review 2–4 wks, parallel)*

**Phase 5 — LinkedIn.** Ship the adapter behind the interface; bridge via a third-party posting API while official MDP access/budget is sorted. *(as access allows)*

**Phase 6 — Hardening.** Analytics loop (agents learn from post performance), retries, monitoring, spend dashboards. *(ongoing)*

---

## 9. Prerequisite cleanup in the current repo

Two issues in the existing codebase will bite this project and should be fixed in Phase 0:

- **DB mismatch.** `schema.prisma` is `provider = "mongodb"`, but `.github/workflows/ci.yml` boots **Postgres** and runs `prisma migrate deploy`, and there's a leftover SQL migration folder (`prisma/migrations/..._init/migration.sql`). Mongo uses `prisma db push`, not `migrate`. **CI is almost certainly broken.** Fix the workflow to use Mongo (or a Mongo replica-set service) and switch to `db push`, or fully commit to Postgres — but pick one before adding models.
- **Secrets hygiene.** Demo credentials and JWT placeholders are committed in docs/`.env.example`. Before adding OAuth tokens and API keys for real social/email accounts, ensure token **encryption at rest** and confirm `.env` (and any token store) is gitignored. Rotate anything already exposed.

---

## 10. External accounts & keys you'll need to gather

- **Google/Gemini** API key (already scaffolded) — text + optionally Imagen for images. *(or OpenAI key for `gpt-image-1`.)*
- **Meta/Facebook** developer app + Instagram Business account + linked FB Page.
- **LinkedIn** developer app tied to your Company Page (+ MDP application) — or a third-party posting-API key as the bridge.
- **Gmail API** (Google Cloud OAuth client) **or** Microsoft Graph app registration for Outlook.
- **AWS S3** bucket (already in `.env.example`) for public image hosting.
- Your **brand inputs**: company description, mission, tone/voice, audience, logo + brand assets, posting cadence, and do/don't rules.

---

## Sources

- [Meta — Publish Content using the Instagram Platform](https://developers.facebook.com/docs/instagram-platform/content-publishing/)
- [Instagram Graph API Guide 2026 (netrows)](https://www.netrows.com/blog/instagram-graph-api-guide-2026)
- [Instagram API 2026 changes (Storrito)](https://storrito.com/resources/instagram-api-2026/)
- [Posts API — LinkedIn (Microsoft Learn)](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-05)
- [LinkedIn API Access in 2026: Tiers & Approval (Phyllo)](https://www.getphyllo.com/post/linkedin-api-access-in-2026-partner-program-approval-timeline-alternatives)
