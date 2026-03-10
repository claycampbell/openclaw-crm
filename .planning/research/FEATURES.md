# Feature Research

**Domain:** AI-driven B2B sales CRM — proactive pipeline automation
**Researched:** 2026-03-10
**Confidence:** MEDIUM (training knowledge through Aug 2025; web search unavailable; competitor landscape stable but rapidly evolving)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features sales teams assume every CRM has. Missing one = immediate credibility loss with buyers.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bi-directional Gmail / O365 sync | Email is where sales happens; reps refuse tools that don't auto-log | HIGH | OAuth scopes + webhook/polling; must handle threading, deduplication, attachment metadata |
| Activity timeline on every record | "What happened with this deal?" is the first question managers ask | MEDIUM | Unified feed: emails, calls, meetings, notes, tasks, stage changes — all auto-logged |
| Email open + click tracking | Table stakes since 2018; reps expect to know when prospects engage | MEDIUM | Pixel tracking + link wrapping; must handle privacy blockers gracefully |
| Pipeline view (Kanban + list) | Already built; any modern CRM has this | LOW | Exists — kanban built, needs deal-stage trigger hooks for AI |
| Role-based dashboards | Managers need aggregate views; reps need personal pipeline | MEDIUM | Three distinct views: rep (my pipeline), manager (team pipeline), leadership (revenue forecast) |
| Lead / deal assignment and ownership | Basic CRM plumbing; without it multi-user orgs break immediately | LOW | Already exists via workspace roles; needs explicit owner attribute on deals |
| Task and reminder management | Reps live in tasks; anything not in a task gets dropped | LOW | Exists — needs AI-generated task suggestions tied to deal context |
| Contact and company enrichment | Reps hate manual data entry; enrichment is expected | MEDIUM | Industry standard: Clearbit, Apollo, or similar for auto-fill on create |
| CSV / bulk import | "We have data in the old CRM" is said in every onboarding call | LOW | Exists — needs validation improvements per CONCERNS.md |
| Calendar integration (Google/O365) | Meetings are sales events; reps expect them auto-logged to deals | MEDIUM | OAuth calendar read; meeting → deal association via attendee matching |
| Notification system for deal signals | Reps need to know when something changes on their deals | LOW | Exists (notifications schema) — needs AI-triggered notification rules |
| Search across all records | "Find the Acme deal" is typed 10x/day | LOW | Exists — global search functional |

### Differentiators (Competitive Advantage)

Features that justify switching from Salesforce/HubSpot. These are where the "AI does the work" promise lives.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Proactive AI asset generation on stage change | When a deal moves to "Proposal," the AI drafts the proposal — rep didn't ask. This is the core differentiator. | HIGH | Requires: stage-change event hooks, AI prompt templates per stage, workspace-configurable triggers, async job queue for generation |
| AI-generated outbound email sequences | SDRs spend 40% of time writing personalized outreach; AI generates multi-touch sequences from ICP + deal context | HIGH | Sequence engine: step scheduling, send-time optimization, reply detection to stop sequence, A/B variant generation |
| Meeting prep briefs | 30 min before a call the AI delivers: last touchpoints, open items, talking points, competitor mentions, news about the company | HIGH | Requires: calendar integration + deal association + company news search + prior conversation context |
| Post-meeting follow-up drafts | Immediately after a logged meeting, AI drafts the follow-up email and next-step tasks from call notes/transcript | MEDIUM | Trigger: meeting end event; input: transcript or notes; output: draft email + task list |
| Competitive battlecards (auto-generated) | When a competitor is mentioned in a deal, AI generates or updates a battlecard with positioning and objection handling | HIGH | Requires: competitor mention detection in emails/notes + external intel gathering + workspace-scoped battlecard library |
| Win/loss pattern analysis | AI reads all closed deals and tells reps and managers: "Deals with 3+ stakeholders and a POC close 2x more often" | HIGH | Requires: sufficient closed deal history + attribute pattern mining + natural language summary generation |
| Rep performance coaching | AI compares rep activity patterns to top performers: "Your top closers send follow-ups within 4 hours" | HIGH | Requires: aggregated activity data + cohort analysis + per-rep recommendation generation |
| Pipeline forecasting with AI confidence scores | Weighted probability is table stakes; AI-derived confidence ("this deal is slipping based on engagement drop") is the differentiator | MEDIUM | Requires: engagement signals + stage velocity + historical close rates per rep/segment |
| Signal-driven AI nudges | "Acme visited your pricing page twice today — now is the time to reach out" surfaces automatically in the rep's feed | HIGH | Requires: website visitor tracking integration + engagement scoring engine + AI-generated outreach suggestion |
| Contract / SOW generation from deal data | Close a deal, click "Generate Contract" — AI drafts from deal terms, company data, agreed pricing | HIGH | Requires: deal attribute mapping to contract template + clause library + workspace-configurable terms |
| Approval workflow engine | Discount > 20% routes to manager; contract > $100k routes to legal — without this, enterprise deals stall | MEDIUM | State machine: pending → approved/rejected → notified; configurable rules per workspace |
| Customer handoff brief to CS | When deal closes, AI packages everything (stakeholders, agreed terms, success criteria, history) into a CS handoff doc | MEDIUM | Requires: deal close trigger + full deal context assembly + CS-specific output template |
| Lead scoring with AI qualification | Inbound leads ranked by fit + intent signals; AI explains why ("Title matches ICP, 3 pricing page visits") | HIGH | Requires: attribute scoring rules + engagement signal weighting + plain-language explanation generation |
| Call recording + AI summarization | After every sales call, AI logs key topics, action items, and next steps to the deal — Gong-like but native | HIGH | Requires: Zoom/telephony integration + STT transcription + structured extraction |
| AI-suggested next best action | After each touchpoint, AI recommends: "Send pricing deck" or "Schedule technical call with their CTO" | MEDIUM | Requires: deal context + stage playbook knowledge + prior activity analysis |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full marketing automation (nurture campaigns, lead forms, newsletter blasts) | "Just add it" once email is integrated | Fundamentally different product with different data model, compliance requirements, and buyer persona — becomes HubSpot and loses the sales-native focus | Hard boundary: sales sequences (SDR-initiated, 1:1 context) yes; marketing campaigns (1:many broadcast) no |
| Custom report builder / SQL query UI | Managers want ad-hoc reporting | Exponential surface area, usually used by 5% of users, always the last 20% of effort — kills roadmap velocity | Role-based AI-generated summaries ("Give me a pipeline summary for Q2") replace 90% of report builder use cases |
| Native mobile apps (iOS/Android) | Reps want CRM on their phone | 6-12 months of parallel work for minimal differentiation; progressive web app covers 80% of mobile use cases | Responsive PWA with offline-capable views for deal lookup; full mobile native is v3 |
| Predictive lead sourcing / prospecting database | "Find me leads" — Apollo-style built-in database | Requires licensing a data provider (Clearbit, Apollo, ZoomInfo) or maintaining your own index — multi-million dollar data infrastructure problem | Integrate with existing data providers via API enrichment; don't build the database |
| Real-time collaborative editing of proposals | "Google Docs-style" in the CRM | Operational complexity (CRDT or locking), rarely actually needed for proposals — usually one person drafts, others comment | Async draft/review workflow: AI drafts, rep edits, manager approves |
| White-label / multi-brand reseller mode | Agency customers want to rebrand | Massive auth, billing, and UI surface area; distraction from core product | Hard boundary per PROJECT.md — single brand |
| Built-in ticketing / customer support | "We can replace Zendesk too" | Completely different workflow, data model, and persona (CS vs Sales) — always ends badly when combined | CS handoff brief generates a structured output that feeds into Zendesk/Intercom via webhook |
| Infinite AI tool call chains without human in loop | "Let the AI just do everything automatically" | Without confirmation gates, AI makes bad writes at scale — wrong data in 1000 records is a catastrophe | Tiered automation: read-always, write-with-preview, destructive-always-confirm — existing pattern is correct |

---

## Feature Dependencies

```
Email Integration (Gmail/O365 OAuth sync)
    └──enables──> Activity Timeline auto-logging
    └──enables──> Email Open/Click Tracking
    └──enables──> AI Outbound Sequence execution
    └──enables──> Post-Meeting Follow-up Drafts (email delivery)

Calendar Integration (Google/O365)
    └──enables──> Meeting auto-logging to deals
    └──enables──> Meeting Prep Briefs (trigger = meeting T-30min)
    └──enables──> Post-Meeting Follow-up Drafts (trigger = meeting end)

Deal Stage Change Event Hooks
    └──enables──> Proactive AI Asset Generation (core differentiator)
    └──enables──> Approval Workflow routing (stage = closed_won triggers contract)
    └──enables──> Customer Handoff Brief generation

Activity Timeline (unified)
    └──enables──> Signal-driven AI nudges (input data)
    └──enables──> Win/Loss Pattern Analysis (historical data)
    └──enables──> Rep Performance Coaching (activity data)
    └──enables──> Pipeline Forecasting (engagement signals)

Lead Scoring
    └──requires──> Attribute scoring rules (basic)
    └──enhanced_by──> Engagement signals (email opens, web visits)
    └──enhanced_by──> Enrichment data (company size, ICP fit)

Pipeline Forecasting
    └──requires──> Deal Stage Change history
    └──requires──> Closed deal history (win/loss labels)
    └──enhanced_by──> Activity Timeline engagement signals
    └──enhanced_by──> Rep performance baselines

Contract/SOW Generation
    └──requires──> Deal attribute schema (pricing, terms, stakeholders)
    └──requires──> Approval Workflow (contract must route to legal)
    └──enhanced_by──> Company enrichment data (legal entity name, address)

Approval Workflow
    └──requires──> Role-based permissions (admin/member — already exists)
    └──enables──> Contract/SOW Generation (approval gate)
    └──enables──> Discount approval gates

Telephony Integration (Zoom/dialers)
    └──enables──> Call Recording
    └──enables──> AI Call Summarization → auto-logs to Activity Timeline

Competitive Battlecards
    └──requires──> Competitor mention detection (in emails, notes, calls)
    └──enhanced_by──> Telephony integration (competitor mentions in transcripts)
    └──enhanced_by──> Post-meeting follow-up flow (battlecard surfaced in prep)

Rep Performance Coaching
    └──requires──> Activity Timeline (sufficient history, 30+ days)
    └──requires──> Win/Loss Pattern Analysis (what patterns correlate with wins)
    └──requires──> Multiple reps in workspace (needs cohort to compare)

AI-suggested Next Best Action
    └──requires──> Activity Timeline (recent context)
    └──requires──> Deal Stage Change hooks (stage-specific recommendations)
    └──enhanced_by──> Win/Loss Pattern Analysis (what actions top closers take)
```

### Dependency Notes

- **Email integration is the keystone:** Without it, the activity timeline is sparse, AI sequences can't send, and post-meeting flows break. It must be Phase 1 of the AI pipeline build.
- **Stage change hooks unlock most AI proactive features:** The event bus pattern (stage changes → triggers → AI jobs) is the infrastructure most differentiators sit on top of.
- **Forecasting and coaching require data accumulation:** These features need 30-90 days of deal history to be meaningful. Build the infrastructure early; surface the insights later.
- **Approval workflow is a prerequisite for contract generation:** Don't build contract gen without an approval gate — enterprise deals will stall without routing.
- **Telephony is the highest complexity / highest value integration:** Worth building, but should be Phase 3+ — email and calendar cover the majority of signal collection.

---

## MVP Definition

### Launch With (v1 — "AI Does the Work" promise validated)

- [ ] Email integration (Gmail + O365 bi-directional sync, open/click tracking, auto-log to deals) — without this, the activity timeline is empty and every AI feature is blind
- [ ] Calendar integration (meeting auto-log to deals, meeting prep brief trigger) — meetings are the most important sales events; logging them unlocks prep briefs
- [ ] Deal stage change event hooks + async job queue — the infrastructure that all proactive AI features run on
- [ ] Proactive AI asset generation on stage advance (opportunity brief, proposal draft) — this IS the product promise; must ship to validate
- [ ] Meeting prep briefs (T-30min before calendar event linked to a deal) — immediate rep delight, low controversy
- [ ] Post-meeting follow-up drafts (from call notes or transcript) — closes the loop after every meeting automatically
- [ ] Activity timeline (unified: emails, meetings, notes, tasks, stage changes) — reps need the full context in one scroll
- [ ] Role-based dashboards (rep + manager views) — managers won't adopt without pipeline visibility

### Add After Validation (v1.x — "AI Fills the Pipeline")

- [ ] AI outbound email sequence generation and execution — after email integration is proven stable, extend to sequence orchestration
- [ ] Lead scoring + AI qualification explanation — once inbound signals are flowing, scoring becomes the obvious next layer
- [ ] Competitive battlecard auto-generation — add after email/call parsing is in place for competitor mention detection
- [ ] Approval workflow engine — add when enterprise deals surface the need for discount/contract routing
- [ ] Contract / SOW generation — build on top of approval workflow; requires deal attribute schema maturity
- [ ] Signal-driven AI nudges (web visit / engagement scoring) — needs external signal integration; add once email signals are proven

### Future Consideration (v2+ — "AI Runs the Team")

- [ ] Win/loss pattern analysis — requires 90+ days of closed deal history; premature without data volume
- [ ] Rep performance coaching — requires multi-rep workspaces with sufficient history; build after v1 adoption
- [ ] Pipeline forecasting with AI confidence scores — requires historical close rate data + engagement signals; defer until data matures
- [ ] Telephony / Zoom integration + call AI summarization — highest complexity; add when email+calendar prove signal value
- [ ] LinkedIn integration + prospect enrichment — valuable but requires careful OAuth + compliance handling; v2
- [ ] Customer handoff brief to CS — builds on contract gen + approval flow; natural v2 addition

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Email integration (Gmail/O365) | HIGH | HIGH | P1 |
| Activity timeline (unified) | HIGH | MEDIUM | P1 |
| Deal stage change event hooks | HIGH | MEDIUM | P1 |
| Meeting prep briefs | HIGH | MEDIUM | P1 |
| Post-meeting follow-up drafts | HIGH | LOW | P1 |
| Proactive AI asset gen on stage change | HIGH | HIGH | P1 |
| Role-based dashboards | MEDIUM | MEDIUM | P1 |
| Calendar integration | HIGH | MEDIUM | P1 |
| AI outbound email sequences | HIGH | HIGH | P2 |
| Lead scoring + AI qualification | MEDIUM | MEDIUM | P2 |
| Approval workflow engine | HIGH | MEDIUM | P2 |
| Competitive battlecards | MEDIUM | HIGH | P2 |
| Contract / SOW generation | HIGH | HIGH | P2 |
| Signal-driven AI nudges | MEDIUM | HIGH | P2 |
| Win/loss pattern analysis | MEDIUM | HIGH | P3 |
| Rep performance coaching | MEDIUM | HIGH | P3 |
| Pipeline forecasting (AI confidence) | MEDIUM | HIGH | P3 |
| Telephony + call AI summarization | HIGH | HIGH | P3 |
| Customer handoff brief to CS | MEDIUM | LOW | P3 |
| LinkedIn integration | MEDIUM | HIGH | P3 |

---

## Competitor Feature Analysis

| Feature | Salesforce (Einstein) | HubSpot AI | Close CRM | Our Approach |
|---------|----------------------|------------|-----------|--------------|
| AI email generation | Copilot drafts, rep triggers | Breeze generates, marketing-first framing | Per-email AI assist, not proactive | Proactive: AI drafts when deal stage changes, not when rep asks |
| Activity auto-logging | Email/calendar sync via connectors (complex setup) | Native Gmail/Outlook sync (easy) | Native email + calling sync (strong) | Native OAuth sync matching HubSpot simplicity |
| Meeting prep | Einstein Conversation Insights (expensive add-on) | Not native | Not native | First-class feature, automatic not on-demand |
| Pipeline forecasting | Einstein Forecasting (enterprise-tier, separate SKU) | AI forecasting in Sales Hub Pro | Basic probability weighting | AI confidence scores in base product, not paywall |
| Proactive asset generation | Not proactive — all rep-triggered | Not proactive | Not proactive | The differentiator: AI acts on stage change without rep prompt |
| Approval workflows | Complex Process Builder / Flow (admin required) | Basic approval routing | Not native | Lightweight configurable rules, no admin required |
| Contract generation | Requires CPQ add-on ($$$) | DocuSign integration (not native gen) | Not native | Native AI generation from deal data, part of close flow |
| Win/loss analysis | Einstein Analytics (enterprise add-on) | Reports-based, not AI | Not native | AI narrative summaries from closed deal patterns |
| Rep coaching | Einstein Sales Coach (separate product) | Not native | Not native | Native to the product, not an upsell |
| Competitive battlecards | Requires third-party (Klue, Crayon) | Not native | Not native | Auto-generated from deal signals, workspace-scoped |

**Key insight from competitor analysis:** Every incumbent monetizes AI features as add-ons or higher-tier SKUs. The differentiation opportunity is building all of this into the base product at a price point that makes the add-on business model obsolete.

---

## Sources

- PROJECT.md — feature requirements from product owner (HIGH confidence)
- INTEGRATIONS.md — current system capabilities and gaps (HIGH confidence)
- CONCERNS.md — existing technical constraints that affect feature complexity (HIGH confidence)
- Salesforce Einstein / HubSpot Breeze / Close CRM / Outreach / Gong / Apollo / Salesloft product knowledge through August 2025 training data (MEDIUM confidence — products evolve rapidly)
- Competitor analysis table based on training knowledge; specific feature availability and pricing should be verified against current product pages before roadmap finalization (LOW-MEDIUM confidence for specifics)

**Confidence caveat:** Web search and WebFetch were unavailable during this research session. Competitor feature claims are based on training data through August 2025. The AI-CRM landscape is moving fast (Salesforce Agentforce, HubSpot Breeze launched late 2024/early 2025) — specific competitor feature parity claims should be spot-checked before using for competitive positioning.

---

*Feature research for: AI-driven B2B sales CRM (OpenClaw)*
*Researched: 2026-03-10*
