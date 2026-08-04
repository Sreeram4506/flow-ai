# Flow AI Agent Platform — What Was Built & How to Use It

The plan in `AGENT_PLATFORM_PLAN.md` is now implemented. Flow ships with an autonomous
AI company: a **CEO agent** that plans and delegates, a **Marketing agent** that creates
and posts content (with generated images), and a **CTO agent** that owns the website,
channel health, and technical content — all visible live in the dashboard.

---

## What's new

### Backend modules (`src/modules/`)

| Module | Purpose |
|---|---|
| `brand/` | Brand profile (company details, tone of voice, guidelines) — injected into every agent prompt |
| `channels/` | Channel adapters: Instagram (Meta Graph API), LinkedIn (Posts API), Email (SMTP), Website (internal blog). Encrypted token storage, health checks |
| `content/` | AI content generation (Gemini captions + Imagen images), content calendar, per-minute publish scheduler with retries + rate caps |
| `agents/` | Agent registry (CEO/CTO/Marketing with editable system prompts) + bounded tool-loop executor with full action logging |
| `agent-settings/` | Safety rails: kill-switch, per-channel pause, daily post caps, token budget, email hold-buffer |
| `orchestrator/` | CEO daily-planning cron, agent task worker (agents execute Flow tasks assigned to them), email triage + queued sending |

### Database (Prisma / MongoDB)
New models: `BrandProfile`, `SocialAccount`, `Agent`, `AgentRun`, `AgentAction`,
`ContentItem`, `EmailMessage`, `AgentSettings`. `Task` gained `assigneeAgentId` +
`origin (HUMAN|AGENT)` so agent work shows up on the normal task board.

Apply with: `npx prisma db push` (MongoDB — no SQL migrations).

### Frontend
`/agents` in the dashboard — five tabs:
**Team & Activity** (live Socket.io feed of agent thoughts/actions + run history),
**Brand Profile** (onboarding form), **Content Calendar** (posts with images, publish-now),
**Email Desk** (approve/cancel drafted emails), **Safety Controls** (kill-switch, caps, pauses).

### Fixed along the way
- CI workflow now runs MongoDB (replica set) + `prisma db push` instead of the broken Postgres/`migrate` setup.

---

## Brand setup from a website

```
POST /api/brand/import  { "websiteUrl": "acme.com", "save": true, "overwrite": false }
```

Reads the company's own site and fills in the brand profile: it scrapes the
homepage, follows up to four pages that actually describe a company (About,
Services, Mission — ranked, so an About page beats a blog post), then extracts
`companyName`, `tagline`, `description`, `mission`, `industry`, `targetAudience`,
`toneOfVoice` and `contentGuidelines`. Logo, brand colours, Instagram and
LinkedIn are lifted straight from the markup rather than inferred.

Two rules govern what gets written, because this profile is injected into
**every** agent prompt and a wrong value silently contaminates all generated
content:

- **Confidence gate.** Each field comes back with `high`/`medium`/`low` plus the
  phrase it was taken from. `low` values are returned for review but never
  saved — an invented mission statement is worse than an empty one. Fields the
  site does not support are omitted entirely.
- **Human edits win.** A field already set is never overwritten unless
  `overwrite: true`, so a re-import fills gaps instead of undoing someone's
  wording. `save: false` previews without writing.

The response reports every field with its confidence, whether it was saved, and
if not, why — plus the exact pages read. The CEO agent has the same capability
as `import_brand_from_website`.

`ScraperService` handles the fetch, so a user-supplied URL gets the same SSRF
treatment as everything else: `http://127.0.0.1:3002/health` is rejected with
*"blocked non-public address"*, not fetched.

## The content pipeline (research → media → caption)

`generate_content` does not write copy from the topic string. It runs six stages,
in this order, because each one depends on the previous:

| # | Stage | What happens | Degrades to |
|---|---|---|---|
| 1 | **Research** | Web search retrieves current information and citations | ungrounded model knowledge, marked `unverified` |
| 1b | **Scrape** | The top source pages are **fetched and read in full**, not just summarised | search summary only |
| 2 | **Parse** | Findings are structured into a brief: summary, facts, angle, audience, key points, sources | brief built from model knowledge |
| 3 | **Prompt** | A media prompt is derived *from the brief*, not the raw topic | generic on-brand prompt |
| 4 | **Media** | Image (`gemini-2.5-flash-image`) or video (Veo 3.1, `generate_video`) | `picsum` placeholder |
| 5 | **Vision** | The generated image is analysed — what is *actually* in it | falls back to the prompt, flagged `analyzed: false` |
| 6 | **Caption** | Copy is written from the brief **and** the vision analysis | topic-only draft |

Stage 6 is the reason for stages 1 and 5. A caption written from the *image
prompt* describes the picture that was requested; generators routinely drop,
add and reinterpret elements, so that caption ends up describing something that
isn't there. Captioning from a vision pass keeps the words and the picture in
agreement, and grounding the brief first keeps the claims in the copy honest.

Every stage degrades independently and records its outcome on the content item's
`pipeline` field (`ok` / `placeholder` / `skipped` / `degraded`, plus a note with
the reason). Agents are instructed to read it and avoid publishing unverified
specifics as fact. A degraded run still produces a draft — it never silently
pretends the content was researched.

The CEO gets `research_topic` directly, so a "look into X" instruction is
researched and parsed *before* it is delegated, and the resulting angle and key
points are written into the delegated task rather than a bare topic.

### Choosing a provider

`AI_PROVIDER` (`openai` | `gemini`) selects who backs all five AI capabilities.
Both implementations live in `src/modules/content/providers/`; the services are
written against the `AiProvider` interface, so switching is an env change. If the
selected provider has no key but the other does, the factory falls back and logs
a warning rather than silently degrading every stage at once.

Measured against this project's own keys:

| Capability | Gemini (free tier) | OpenAI (funded key) |
|---|---|---|
| Text | ✅ but 20 req/day | ✅ |
| Grounded research | ❌ 429 | ✅ `web_search`, returns citations |
| Image | ❌ 429 | ✅ `gpt-image-1-mini` |
| Vision | ❌ 429 | ✅ |
| Video | ❌ 429 | ✅ Sora 2 |

**Latency matters here.** The pipeline makes four to six model calls per post, so
reasoning effort compounds: one stage measured 25.8s on `gpt-5` at default effort
versus 8.1s on `gpt-5-mini` at low effort. Defaults are `OPENAI_MODEL=gpt-5-mini`
and `OPENAI_REASONING_EFFORT=low`, which puts a full image post at roughly 70s and
a video post at roughly 2–3 minutes. Set `OPENAI_REASONING_EFFORT=''` for
non-reasoning models, which reject the parameter.

**Video prompts must avoid real brands.** Research briefs routinely name real
products, and Sora rejects such prompts with `moderation_blocked`. The media-prompt
stage is instructed to describe things generically ("a design application on
screen", never a named product); if a job is still blocked, the reason is written
to the content item's `pipeline.videoNote` rather than only to the logs.

### Reading the sources, not just the summary

Grounded search returns the model's *summary* of the results plus citation URLs.
Summaries flatten exactly what makes content concrete — figures, named examples,
quotes. So after search, `ScraperService` fetches the top source pages (4 by
default) and the brief is parsed from their **full text**, with the parser told
to prefer specifics from the pages over the paraphrase.

The difference is visible in the output: a snippet-only brief produced *"studios
are charging more for retainers"*, while the same topic with scraping produced
*"marketing production retainer $1,000–$3,500/month"* and *"'Graphic Design
Essentials' from $2,450/month"*, each traceable to a page in `readPages`.

**This is an SSRF sink and is treated as one.** It is the only place the app
makes outbound HTTP to addresses the operator did not choose, and a research
topic influences which URLs search returns. Every URL is validated *after DNS
resolution* — so a public hostname resolving to `127.0.0.1` is rejected — and
re-validated on every redirect hop. Loopback, RFC1918, link-local (including
`169.254.169.254`), CGNAT and IPv4-mapped IPv6 forms are all blocked, along with
non-http schemes and credentialed URLs. Covered by 26 unit tests in
`scraper.service.spec.ts`; keep them passing. The scraper also identifies itself
by User-Agent, honours `robots.txt`, and caps size, time, redirects and
concurrency.

### Generation is queued, not synchronous

`POST /api/content/generate` enqueues a Bull job and returns in ~100ms with a
`jobId`. Progress streams over the Socket.io connection the dashboard already
holds, as `content-update` events: `content-job-started`, `-progress` (one per
pipeline stage), `-finished`, `-failed`. Pass `?sync=true` to run inline
instead, which is convenient from Swagger or a script.

This replaced a synchronous implementation where the request blocked for the
whole pipeline — minutes for a video post, past most proxy timeouts. Retries are
deliberately capped at 2 with backoff: media generation is billed, and a
deterministic failure such as a moderation block would otherwise burn money
retrying identically.

### API quota — read this before wondering why output is thin

On a **free-tier** Gemini key only plain text generation works. Grounded search,
image generation, vision input and Veo all return `429 RESOURCE_EXHAUSTED`;
they are billed features. Enable billing on the key to get stages 1, 4 and 5.

Free-tier daily caps also differ enormously *by model*: `gemini-flash-latest`
currently resolves to `gemini-3.6-flash`, capped at **20 requests per day** — and
the pipeline spends ~4 per post, so roughly 5 posts a day. `TEXT_MODEL` in `.env`
exists to control this; it defaults to `gemini-2.0-flash`, which has a larger
allowance. Model ids also get retired for newly created keys without notice
(`imagen-3.0-*` and `imagen-4.0-*` now 404), which is why every model id is
configurable rather than hardcoded.

## How the autonomous day works

1. **07:00** (configurable) — hourly cron sees the org's plan hour has arrived → CEO agent runs:
   reads a briefing (last 24h content, open tasks, channel health) → creates up to 5 Flow tasks
   assigned to Marketing/CTO agents.
2. **Every 2 min** — the task worker picks up agent-assigned TODO tasks → runs the assigned
   agent with the task as its instruction. Marketing generates a post + image and schedules it;
   CTO publishes blog posts and verifies channels. Agents mark tasks DONE via `complete_task`.
3. **Every minute** — the publish scheduler pushes due `SCHEDULED` content through the right
   channel adapter (retries 3× with 15-min backoff), and the email sender releases queued
   emails whose hold-buffer expired.
4. Everything streams to the dashboard over Socket.io (`agent-activity`, `content-update`)
   and is persisted in `AgentRun`/`AgentAction`.

## Agents operate the whole platform

Beyond content and email, agents have tools over every Flow module (see
`src/modules/agents/business-tools.service.ts`), granted per role:

| Area | Tools | Who |
|---|---|---|
| Overview | `business_snapshot` — clients, pipeline, projects, revenue, expenses | all |
| CRM | `list/create/update_client` | CEO (Marketing: read) |
| Leads | `list/create/update_lead` — stage moves, WON/LOST, notes | CEO, Marketing |
| Projects | `list/create/update_project` — status, progress, deadlines | CEO, CTO |
| Tasks | `list/create_project_task`, `update_task_status` — any project, for the human team | CEO, CTO |
| Finance | `finance_summary` — **read-only by design**; agents can never create invoices/payments | CEO |
| Alerts | `notify_owner` — in-app notification to you (overdue invoices, stuck leads, failures) | all |

So the CEO can turn an email inquiry into a lead, move it to WON, spin up a project
with tasks for your team, and notify you — all in one run. Give it a directive like
*"Review the pipeline and chase anything stuck in NEGOTIATION"* from the Assign Work box.

## Safety rails (on by default)

- **Kill-switch** — `POST /api/orchestrator/kill-switch {active:true}` halts everything instantly.
- **Email approval** — `autoSendEmail` defaults to **false**: every agent-drafted email waits
  for your approval, then still sits in a 10-min cancellable hold-buffer.
- **Caps** — max 3 posts/day/channel, max 8 steps/run, 500k tokens/day (all editable in Safety Controls).
- **Audit** — every tool call is an `AgentAction` row; nothing publishes without a trace.

## Setup

1. `npx prisma db push && npx prisma generate`
2. Set in `.env`: `GEMINI_API_KEY` (text + images), `AGENT_ENCRYPTION_KEY` (32+ chars).
   Optionally `TEXT_MODEL`, `IMAGE_MODEL`, `VIDEO_MODEL` — see the quota note above.
   **Billing must be enabled on the Gemini key** for research grounding, image
   generation, vision analysis and video; without it those stages skip and the
   pipeline produces text-only drafts.
3. Log into the dashboard → **AI Agents** → fill the **Brand Profile** tab.
4. Connect channels via `POST /api/channels/accounts` (platform, accountName, externalId, accessToken):
   - **Instagram**: IG Business account user-id + a Meta app token with `instagram_business_content_publish` (requires Meta App Review, 2–4 wks). Images must be publicly reachable — set `PUBLIC_ASSETS_BASE_URL` in production.
   - **LinkedIn**: company-page URN (`urn:li:organization:…`) + Marketing Developer Platform token (`w_organization_social`).
   - **Email**: works out of the box via your SMTP config.
   - **Website**: works out of the box — published posts serve from `GET /api/content/public/blog/:orgSlug`.
5. Click **Run Daily Plan** and watch the activity feed. Without a Gemini key the pipeline
   still runs end-to-end using drafts and placeholder images.

## Key endpoints

```
GET/PUT/PATCH  /api/brand                      Brand profile
GET/POST/DEL   /api/channels/accounts          Connect social/email accounts
GET            /api/channels/health            Channel health
POST           /api/content/generate           Run the full pipeline for a channel
                                              body: { channel, topic, withImage?, withVideo?, scheduledFor? }
GET            /api/content                    Calendar
POST           /api/content/:id/publish        Publish now
GET            /api/agents                     List agents (auto-creates on first call)
POST           /api/agents/:id/run             Manually run an agent
GET            /api/agents/runs                Run history + action logs
POST           /api/orchestrator/daily-plan/run   Trigger CEO planning
GET/PATCH      /api/orchestrator/settings      Safety rails
POST           /api/orchestrator/kill-switch   Emergency halt
POST           /api/orchestrator/emails/inbound   Feed an inbound email → CEO triage
POST           /api/orchestrator/emails/:id/approve|cancel
```
