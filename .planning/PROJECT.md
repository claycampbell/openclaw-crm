# OpenClaw CRM

## What This Is

An AI-first CRM that runs the entire sales pipeline so reps can focus on selling. The AI watches deal stages, user activity, and external engagement signals to proactively generate assets (proposals, decks, email sequences, meeting prep, follow-ups, competitive intel) and drive deals from top-of-funnel prospecting through close and handoff. Built for full sales orgs — SDRs, AEs, managers, and leadership — each with role-appropriate AI capabilities.

## Core Value

The CRM does the work. Reps sell, AI handles everything else — data entry, asset creation, follow-ups, pipeline management. The CRM runs itself.

## Requirements

### Validated

- ✓ Multi-tenant workspace system with role-based access — existing
- ✓ Typed EAV data model with custom objects/attributes per workspace — existing
- ✓ Records CRUD with dynamic filtering and sorting — existing
- ✓ AI chat with tool calling (8 read + 5 write tools, multi-round) — existing
- ✓ Kanban board views with drag-and-drop — existing
- ✓ Full-text search across records — existing
- ✓ API key authentication for external consumers — existing
- ✓ Rich text notes on records — existing
- ✓ Tasks linked to records — existing
- ✓ OAuth login (GitHub, Google) — existing
- ✓ Invite link system for workspace members — existing
- ✓ Chat channels for team communication — existing

### Active

- [ ] AI-driven outbound email sequence generation and execution
- [ ] Inbound lead capture (web forms, email parsing)
- [ ] Proactive AI asset generation triggered by deal stage changes
- [ ] Signal-driven AI actions (email opens, website visits, engagement scoring)
- [ ] Auto-generated proposals and decks from deal data
- [ ] Opportunity briefs generated on deal creation/advancement
- [ ] Meeting prep briefs with prospect research and talking points
- [ ] Post-meeting follow-up drafts from notes/transcripts
- [ ] Competitive intelligence battlecards
- [ ] Email integration (Gmail/O365) — bi-directional sync, open/click tracking, auto-logging
- [ ] Calendar integration — scheduling, availability, auto-logging meetings to deals
- [ ] LinkedIn integration — prospect enrichment, connection status, activity signals
- [ ] Telephony/Zoom integration — call recording, transcription, auto-summarization
- [ ] Contract/SOW generation from deal data
- [ ] Approval workflows (discount approvals, legal review, stakeholder sign-off)
- [ ] Customer handoff to onboarding/CS after close
- [ ] Win/loss pattern analysis on closed deals
- [ ] Rep performance coaching — compare patterns to top performers
- [ ] Pipeline forecasting from historical patterns
- [ ] Role-based dashboards (rep, manager, leadership views)
- [ ] Activity timeline with auto-logged touchpoints across all channels
- [ ] Lead scoring and qualification AI

### Out of Scope

- Mobile native apps — web-first, responsive design sufficient for now
- Marketing automation (campaigns, nurture flows) — focus is sales pipeline, not marketing
- Customer support/ticketing — post-sale handled by handoff to external CS tools
- Custom report builder — role-based dashboards cover reporting needs initially
- White-labeling/reselling — single-brand product

## Context

OpenClaw CRM is a brownfield project with a solid foundation: Next.js 15, Drizzle ORM, typed EAV pattern, multi-tenant workspaces, and an AI chat system using OpenRouter. The existing AI chat already has tool calling infrastructure — the evolution is from reactive (user asks AI) to proactive (AI anticipates and acts).

The typed EAV model is a significant strength — custom objects and attributes per workspace means the pipeline can adapt to any sales process without schema changes. The existing filtering/sorting query builder already handles complex queries against dynamic attributes.

Key technical context:
- Monorepo: Turborepo + pnpm (apps/web + packages/shared)
- Database: PostgreSQL 16+ with Drizzle ORM
- Auth: Better Auth (sessions) + API keys (external)
- AI: OpenRouter with SSE streaming, 10-round tool calling
- UI: shadcn/ui + Tailwind v4 + TanStack Table + TipTap
- Testing: Playwright E2E only (no unit tests)

The competitive landscape is dominated by Salesforce (complex, expensive), HubSpot (marketing-first), and Close (calling-focused). The opportunity is an AI-native CRM where the intelligence isn't bolted on — it IS the product.

## Constraints

- **Tech stack**: Next.js 15 + Drizzle + PostgreSQL — committed, not changing
- **AI provider**: OpenRouter (multi-model) — workspace-configurable, not locked to one LLM
- **Auth**: Better Auth — committed for sessions and OAuth
- **No unit tests**: Only Playwright E2E — new features need E2E coverage
- **Typed EAV**: Core data model is EAV — all new features must work within this pattern
- **Multi-tenancy**: Every feature must be workspace-scoped

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Typed EAV over traditional schema | Enables custom objects/fields per workspace without migrations | ✓ Good |
| OpenRouter over direct LLM APIs | Multi-model flexibility, workspace-level model selection | ✓ Good |
| Proactive AI over reactive-only | Core differentiator — CRM that runs itself | — Pending |
| Signal-driven architecture | Deal stages + user behavior + external signals trigger AI actions | — Pending |
| Full close flow (contracts + approvals + handoff) | Complete pipeline coverage is the product promise | — Pending |
| All four integration channels for v1 | Email + calendar + LinkedIn + telephony needed for signal collection | — Pending |

---
*Last updated: 2026-03-10 after initialization*
