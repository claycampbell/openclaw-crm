# Stack Research

**Domain:** AI-driven CRM — proactive asset generation, multi-channel integrations, signal processing, document generation
**Researched:** 2026-03-10
**Confidence:** MEDIUM (training data through August 2025; WebSearch/WebFetch unavailable — versions need npm verification before install)

---

## Context: What Already Exists

The existing stack is committed and not being replaced:

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js 15 (App Router) | ^15.1.0 |
| ORM | Drizzle ORM | ^0.41.0 |
| Database | PostgreSQL 16+ via `postgres` driver | ^3.4.0 |
| Auth | Better Auth | ^1.2.0 |
| AI routing | OpenRouter (multi-model) | API only |
| UI | shadcn/ui + Tailwind v4 + TanStack Table | current |
| Rich text | TipTap | ^3.19.0 |
| Monorepo | Turborepo + pnpm | current |

The research below covers only **net-new** additions needed for the AI-driven pipeline milestone.

---

## Recommended Stack

### Background Job Processing

This is the most critical architectural addition. Proactive AI features (asset generation triggered by deal stage changes, signal processing, sequence scheduling) require durable background execution outside the Next.js request lifecycle.

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **pg-boss** | ^10.x | Durable job queue backed by PostgreSQL | Already have PostgreSQL — zero new infrastructure. pg-boss uses advisory locks and row-level locking to guarantee at-least-once delivery. Survives server restarts. Native cron scheduling. Perfect fit for a monorepo Next.js app where you don't want to manage a Redis instance. |

**Confidence:** MEDIUM. pg-boss v10 is well-established and actively maintained as of August 2025. Version needs npm verification: `npm info pg-boss version`.

**Why not BullMQ:** BullMQ requires Redis. Adding Redis for a PostgreSQL-native app is an infrastructure burden that pg-boss eliminates. BullMQ is the better choice if you already run Redis or need sub-second job latency at extreme scale — neither applies here.

**Why not Trigger.dev:** Trigger.dev is a managed service (or self-hosted with significant operational complexity). Its cloud offering introduces external dependency and pricing risk. pg-boss gives the same durability guarantees with zero external service.

**Why not Inngest:** Same concern as Trigger.dev — cloud-first managed platform. Excellent DX but adds an external vendor dependency inappropriate for a multi-tenant SaaS where job data contains PII (email content, contact details).

**Pattern:** Create a `apps/web/src/jobs/` directory. Each job file exports a handler. A singleton `PgBoss` instance is initialized at app startup (Next.js instrumentation hook). Job workers run in the same Node.js process as the Next.js app in development; in production, consider a separate worker process (`apps/worker/`) for isolation.

---

### Email Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **googleapis** (Google APIs Node.js client) | ^144.x | Gmail API + Google Calendar API | Official Google client library. Handles OAuth token refresh automatically. Used for reading/sending email, watching inboxes via push notifications (Gmail pub/sub), and calendar event sync. |
| **@microsoft/microsoft-graph-client** | ^3.x | Microsoft Graph API (Outlook/O365) | Official Microsoft client. Same pattern as googleapis but for Outlook email and Exchange calendar. Required for O365 users. |
| **Resend** (already configured in project) | API | Outbound transactional email (sequences, notifications) | Already referenced in .env.example. Use for AI-generated outbound sequences (not for bi-directional sync — that's Gmail/Graph). |

**Confidence:** MEDIUM. These are the canonical official clients. The googleapis package is at v144+ as of mid-2025. Verify: `npm info googleapis version`.

**Gmail push notifications:** Use Gmail's `users.watch()` API with a Google Cloud Pub/Sub subscription to receive real-time push when new emails arrive. This avoids polling. Requires a publicly reachable endpoint (webhook) — Next.js route handler at `/api/v1/webhooks/gmail`.

**O365 equivalent:** Microsoft Graph subscriptions (`/subscriptions` endpoint) with webhook delivery to `/api/v1/webhooks/microsoft`.

**Email open/click tracking:** Do NOT implement custom pixel tracking in v1. Complexity is high (requires a redirect proxy service, pixel CDN, GDPR consent mechanics). Instead, use `Resend` webhooks for open/click events on outbound sequences — Resend handles this natively.

**Token storage:** Store OAuth refresh tokens encrypted in a new `integrations` table (workspace-scoped, user-scoped). Use `node:crypto` AES-256-GCM with a `ENCRYPTION_KEY` env var. Never store tokens in the EAV record_values pattern — they need dedicated secure storage.

---

### Calendar Integration

Covered by the same clients as email:

| Technology | Purpose | Notes |
|------------|---------|-------|
| **googleapis** (Calendar API) | Google Calendar event sync, availability queries, meeting creation | Same OAuth token as Gmail — single OAuth flow for both |
| **@microsoft/microsoft-graph-client** | Outlook Calendar, Exchange availability | Same OAuth token as Outlook email |
| **Nylas** (alternative, see below) | Unified email + calendar API | Consider if direct API maintenance becomes painful |

**Meeting scheduling:** For "schedule a meeting" flows, use the native Calendar APIs to check availability and create events. Do NOT build a full Calendly-clone — just create calendar events and log them to deal timelines.

---

### LinkedIn Integration

**This is the hardest integration in the stack.** LinkedIn's official API has severe restrictions.

| Option | Verdict | Notes |
|--------|---------|-------|
| **LinkedIn Official API** | NOT RECOMMENDED for enrichment | The Marketing API and Sign-In with LinkedIn scopes do not provide prospect enrichment data (company, role, connections). The Profile API is rate-limited and only returns data for authenticated users. |
| **Proxycurl** | RECOMMENDED | REST API for LinkedIn profile enrichment, company lookup, people search. Per-credit pricing (~$0.01-0.03/credit). Returns structured JSON. No scraping liability — they operate the scraping infrastructure. |
| **Apollo.io API** | ALTERNATIVE | Broader data coverage (email, phone, LinkedIn, company), competitive pricing. Better for bulk prospecting. More expensive per record but richer data. |
| **Hunter.io** | EMAIL ONLY | Domain-based email finding. Not a full enrichment solution. |

**Confidence:** MEDIUM on Proxycurl recommendation. This is the standard approach for CRMs needing LinkedIn data without violating ToS directly. Apollo.io is a solid alternative if budget permits.

**Recommendation:** Use **Proxycurl** for LinkedIn profile enrichment. Integrate via their REST API — no SDK needed, simple HTTP calls wrapped in a service. Store enrichment results in the EAV `record_values` pattern (they map naturally to People/Company attributes).

**LinkedIn connection status:** Real-time connection tracking is not available via any legal API. Omit from v1.

---

### Telephony / Call Recording Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Twilio** | API | Outbound calling, call recording, phone number provisioning | Industry standard for programmable telephony. Node.js SDK well-maintained. Webhooks for call events. Call recordings accessible via REST API. |
| **Zoom API** | API | Meeting recording access, transcript retrieval | Zoom Server-to-Server OAuth app for accessing cloud recordings via `/meetings/{meetingId}/recordings`. Webhooks notify when recording is ready. |
| **AssemblyAI** | API | Call transcription + speaker diarization + sentiment analysis | Specialized transcription with superior accuracy for sales call audio versus general-purpose models. Async transcription webhooks. Structured output including chapters, action items, sentiment per speaker. |

**Confidence:** MEDIUM. Twilio and AssemblyAI are well-established. Zoom API structure verified against known v2 API patterns.

**Why AssemblyAI over Whisper (OpenAI):** AssemblyAI returns structured data (chapters, sentiment, action items, speaker labels) natively. Whisper returns raw transcript only — you'd need a second AI call to structure it. AssemblyAI is purpose-built for sales call analysis. Use AssemblyAI for call processing; use OpenRouter for everything else.

**Why AssemblyAI over Deepgram:** Both are valid. AssemblyAI has better out-of-box "LeMUR" summarization and action item extraction as of 2025. Deepgram is faster and cheaper for raw transcription. Recommendation: AssemblyAI unless cost is a primary concern.

---

### Document Generation

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **@react-pdf/renderer** | ^4.x | Generate PDF proposals, SOWs, contracts from React components | React-based PDF generation — same component model as the rest of the UI. Supports custom fonts, tables, complex layouts. Runs server-side in Next.js API routes. No external service dependency. |
| **pptxgenjs** | ^3.x | Generate PowerPoint decks | Pure JS PPTX generation. No headless browser needed. Slides defined programmatically. Output is native .pptx (editable by recipients). |

**Confidence:** MEDIUM. @react-pdf/renderer v3/v4 is the dominant React PDF solution as of 2025. pptxgenjs is the standard pure-JS PPTX library.

**Why not Puppeteer/headless Chrome for PDFs:** Puppeteer requires a headless Chrome binary — large Docker image, cold start penalty, memory overhead. @react-pdf/renderer produces PDFs without a browser. Use Puppeteer only if pixel-perfect HTML-to-PDF fidelity is required (it's not for proposals/SOWs).

**Why not docx (Word documents):** DOCX has worse rendering consistency than PDF for documents sent to prospects. PDF is the correct format for proposals and contracts. DOCX acceptable for internal SOW templates where editing is expected — add docx library if that use case arises.

**Template approach:** Define one React component per document type (`ProposalTemplate`, `SOWTemplate`, `BattlecardTemplate`). Pass deal record data as props. Generate PDF server-side, store in object storage, attach URL to deal record via EAV attribute.

---

### File / Asset Storage

| Technology | Purpose | Why Recommended |
|------------|---------|-----------------|
| **AWS S3** (or S3-compatible: Cloudflare R2, MinIO) | Store generated PDFs, PPTX files, call recordings | S3 is the universal standard. Cloudflare R2 is cost-effective (no egress fees) and uses the same S3 SDK. Use `@aws-sdk/client-s3` v3 — modular, tree-shakeable. Pre-signed URLs for direct browser download without proxying through Next.js. |

**Confidence:** HIGH. AWS SDK v3 + S3-compatible storage is the dominant pattern.

**Why not store files in PostgreSQL:** BYTEA column for large files is an antipattern — bloats database backup size, complicates streaming, no CDN integration. PostgreSQL is for structured data; object storage is for blobs.

---

### Signal Processing / Webhooks

No new library needed — use existing Next.js route handlers. The pattern:

1. External service calls `/api/v1/webhooks/{provider}` (Gmail push, Twilio, Zoom, email tracking)
2. Route handler validates signature (each provider has its own HMAC scheme)
3. Route handler enqueues a pg-boss job — does NOT process inline
4. pg-boss worker processes the job asynchronously

This keeps webhook handlers fast (sub-100ms response required by most providers) and decoupled from processing logic.

**Webhook signature libraries (all built-in or trivial):**

| Provider | Verification Method |
|----------|-------------------|
| Gmail Pub/Sub | Google-signed JWT — verify with `google-auth-library` (included with `googleapis`) |
| Twilio | HMAC-SHA1 of request URL + body — use `twilio.validateRequest()` from Twilio SDK |
| Zoom | HMAC-SHA256 of timestamp + body — raw crypto, no library needed |
| AssemblyAI | Bearer token in Authorization header |

---

### AI Asset Generation Pipeline

The existing OpenRouter integration handles LLM calls. The new additions:

| Technology | Purpose | Why |
|------------|---------|-----|
| **Vercel AI SDK** (`ai` package) | Structured output generation, streaming to UI, tool calling utilities | Already aligned with Next.js + OpenRouter. The `generateObject()` function with Zod schemas is the cleanest way to generate structured document data (proposal sections, battlecard fields) from LLMs. Reduces prompt engineering burden versus raw JSON mode. |
| **Zod** (already in stack) | Schema definitions for structured AI output | Already at ^3.24.0 — no new dependency. Define Zod schemas for each document type; pass to `generateObject()`. |

**Confidence:** MEDIUM on Vercel AI SDK. It was at v3.x as of August 2025 with strong OpenRouter compatibility. Verify current version: `npm info ai version`.

**Note:** The existing `ai-chat.ts` uses raw OpenRouter fetch calls. The Vercel AI SDK wraps this more cleanly for structured generation use cases. The two approaches can coexist — use raw OpenRouter for conversational chat (existing), use Vercel AI SDK `generateObject()` for asset generation (new). Don't refactor the existing chat — add alongside.

---

### Engagement Scoring / Lead Scoring

No external ML service needed in v1. Build scoring as a pg-boss job that:

1. Reads recent activity events from a new `engagement_events` table (email opens, link clicks, call duration, meeting attendance, LinkedIn views)
2. Applies a weighted formula (configurable per workspace via EAV attributes on the Lead object)
3. Writes the score back as a `number_value` in `record_values`

PostgreSQL's window functions and CTEs handle this cleanly. Add ML-based scoring (via an external service like Madkudu or custom model) in a later phase.

---

### Approval Workflows

No external workflow engine needed in v1. Implement as:

| Component | Implementation |
|-----------|---------------|
| Approval request state | New `approval_requests` table: `record_id`, `type`, `status`, `requested_by`, `approved_by`, `due_at` |
| Notifications | Existing notifications system + email via Resend |
| Escalation | pg-boss scheduled job that checks overdue approvals |
| UI | New modal/drawer using existing shadcn/ui components |

**Why not a workflow engine (Temporal, Conductor):** These are operational overhead for what is essentially a state machine with 4 states (pending → approved/rejected/expired). Temporal is the right choice when you have dozens of workflow types with complex branching — not for v1 approval flows.

---

## Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `pg-boss` | ^10.x | Job queue backed by PostgreSQL | Every background/async operation: AI asset generation, signal processing, sequence scheduling, enrichment |
| `googleapis` | ^144.x | Gmail + Google Calendar APIs | When building Gmail/GCal OAuth integration |
| `@microsoft/microsoft-graph-client` | ^3.x | Outlook + Exchange calendar | When building O365 integration (can be phase 2) |
| `@aws-sdk/client-s3` | ^3.x | S3-compatible file storage | When storing generated PDFs, decks, call recordings |
| `@react-pdf/renderer` | ^4.x | PDF generation | Proposal, SOW, contract generation |
| `pptxgenjs` | ^3.x | PPTX deck generation | Sales deck generation |
| `twilio` | ^5.x | Telephony API | Call logging, recording access, outbound dialing |
| `assemblyai` | ^4.x | Call transcription | Transcribing and structuring call recordings |
| `ai` (Vercel AI SDK) | ^3.x | Structured LLM output | `generateObject()` for typed AI asset generation |
| `@google-cloud/pubsub` | ^4.x | Gmail push notification subscription management | Only needed if managing Pub/Sub subscriptions programmatically (can use gcloud CLI instead) |

---

## Installation

```bash
# From apps/web/

# Background jobs
pnpm add pg-boss

# Email + Calendar integrations
pnpm add googleapis @microsoft/microsoft-graph-client

# File storage
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner

# Document generation
pnpm add @react-pdf/renderer pptxgenjs

# Telephony + transcription
pnpm add twilio assemblyai

# AI structured output (alongside existing OpenRouter)
pnpm add ai

# Enrichment — HTTP only, no SDK needed (Proxycurl, Apollo)
# No package install required — use native fetch with API key in env
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| pg-boss | BullMQ | When you already run Redis and need sub-second job latency at scale (>10k jobs/sec) |
| pg-boss | Trigger.dev cloud | When you want managed infrastructure and are comfortable with the vendor dependency + pricing |
| @react-pdf/renderer | Puppeteer + HTML template | When pixel-perfect HTML rendering is required (marketing-grade output); not needed for proposals |
| AssemblyAI | OpenAI Whisper | When raw transcription is sufficient and you don't need structured output (chapters, action items, sentiment) |
| AssemblyAI | Deepgram | When cost and latency are the primary driver over structured output features |
| Proxycurl | Apollo.io | When bulk prospecting and richer contact data (direct dials, email) justifies higher cost |
| S3/R2 | Supabase Storage | When already using Supabase as the database (not applicable here) |
| Vercel AI SDK `generateObject()` | Raw OpenRouter JSON mode | Acceptable fallback; more prompt engineering required to get consistent structured output |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Temporal / Conductor** | Extreme operational overhead for workflow orchestration — requires running a separate Temporal server. Overkill for approval flows that are simple 4-state machines. | pg-boss jobs + PostgreSQL state table |
| **Redis (standalone)** | Introduces a new stateful service to operate when PostgreSQL is already available and pg-boss handles queuing. | pg-boss |
| **Inngest / Trigger.dev (cloud)** | Managed platforms introduce external vendor for job processing that touches PII (email content, contact data). Also adds latency and pricing unpredictability. | pg-boss |
| **LinkedIn Official API** for enrichment | The restricted scopes do not provide the profile/company data needed for CRM enrichment. You'll hit rate limits and permission walls. | Proxycurl or Apollo.io |
| **Puppeteer for PDF generation** | Large binary (Chromium), slow cold start (~2-5s), high memory. Wrong tool when @react-pdf/renderer produces PDFs without a browser. | @react-pdf/renderer |
| **Custom pixel tracking** for email opens | Build and maintain redirect proxy + pixel CDN + GDPR consent is a project in itself. | Resend webhooks for outbound sequences; Gmail API for inbound tracking |
| **ProseMirror / Quill** for document editing | TipTap (already in stack) is built on ProseMirror with a cleaner API. Don't add a second rich text library. | Extend TipTap |
| **DocuSign / HelloSign** for contracts in v1 | E-signature platforms are overkill for v1 — adds cost, OAuth complexity, and user friction. Generate PDFs and handle signature collection manually or via simple email attachment. Add e-signature in a later phase. | @react-pdf/renderer PDF generation |

---

## Stack Patterns by Variant

**If the team deploys on Vercel (serverless):**
- pg-boss workers cannot run as persistent long-running processes on Vercel
- Use a separate worker service: add `apps/worker/` to the Turborepo monorepo, deploy as a long-running Node.js process on Railway, Fly.io, or a single EC2/DigitalOcean instance
- The Next.js app enqueues jobs; the worker process consumes them
- Alternatively: Trigger.dev cloud (managed workers) becomes worth the tradeoff when you can't run persistent workers yourself

**If the team deploys on a VPS / Docker (Railway, Fly.io, self-hosted):**
- Run pg-boss workers in the same process as Next.js using Next.js instrumentation (`apps/web/src/instrumentation.ts`)
- Simpler operationally; single deployment unit
- This is the recommended default for early-stage

**If call volume exceeds ~100 calls/day:**
- AssemblyAI async processing queue handles this natively — no architecture change needed
- If cost becomes a concern at scale, evaluate switching to self-hosted Whisper + custom structuring

**If only Google Workspace users (no O365):**
- Skip `@microsoft/microsoft-graph-client` entirely in v1
- Add O365 support as a discrete phase when non-Google users are onboarded

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `pg-boss ^10.x` | `postgres ^3.x` (existing) | pg-boss uses its own internal connection; configure with `DATABASE_URL` env var directly — does not share the Drizzle `postgres` client instance |
| `@react-pdf/renderer ^4.x` | React 19 (existing) | Verify React 19 compatibility before install — earlier v3 versions had React 18 peer dependency; v4 targets React 18/19 |
| `ai ^3.x` (Vercel AI SDK) | Next.js 15 + React 19 | AI SDK v3+ is designed for Next.js App Router; compatible with existing setup |
| `googleapis ^144.x` | Node.js 18+ | Fine with current Node.js versions |
| `twilio ^5.x` | Node.js 18+ | Twilio SDK v5 dropped support for Node 14/16; fine with current |

---

## New Environment Variables Required

| Variable | Purpose | Provider |
|----------|---------|----------|
| `ENCRYPTION_KEY` | AES-256-GCM key for encrypting OAuth refresh tokens | Generate locally: `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Already in .env.example for OAuth login — extend scopes for Gmail + Calendar | Google Cloud Console |
| `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` | Outlook/O365 OAuth | Azure App Registration |
| `PROXYCURL_API_KEY` | LinkedIn enrichment | Proxycurl dashboard |
| `ASSEMBLYAI_API_KEY` | Call transcription | AssemblyAI dashboard |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Telephony | Twilio Console |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` / `S3_BUCKET_NAME` | File storage | AWS Console or Cloudflare R2 |
| `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | Zoom recording access | Zoom Marketplace |

---

## Sources

- Training data (August 2025 cutoff) — pg-boss, googleapis, @react-pdf/renderer, Vercel AI SDK, AssemblyAI, Twilio patterns — **MEDIUM confidence** — verify package versions on npm before installing
- Project context: `/c/Users/ClayCampbell/Documents/GitHub/openclaw-crm/.planning/PROJECT.md` — existing stack constraints confirmed
- Codebase inspection: `apps/web/package.json`, `apps/web/src/services/ai-chat.ts` — existing dependencies and OpenRouter integration confirmed — **HIGH confidence**
- WebSearch, WebFetch, and Brave Search unavailable during this research session — no live verification performed

---

*Stack research for: OpenClaw CRM — AI-driven sales pipeline automation milestone*
*Researched: 2026-03-10*
