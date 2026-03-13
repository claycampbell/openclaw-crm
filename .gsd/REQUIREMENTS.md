# Requirements

## Active

### R001 — Background job execution loop
- Class: core-capability
- Status: active
- Description: processJobs() calls registered handlers with FOR UPDATE SKIP LOCKED, retries with exponential backoff, dead-letter after 3 failures
- Why it matters: Every async feature (AI generation, sync, scoring, webhooks, analytics) depends on jobs actually executing
- Source: execution
- Primary owning slice: M002/S01
- Supporting slices: none
- Validation: validated
- Notes: INFR-01 through INFR-04. Phase 6-01 implemented and E2E tested.

### R002 — Signal-to-automation pipeline
- Class: core-capability
- Status: active
- Description: Signal events auto-enqueue evaluation jobs; matching automation rules dispatch action jobs
- Why it matters: The entire proactive AI promise depends on CRM events triggering automated responses
- Source: execution
- Primary owning slice: M002/S01
- Supporting slices: none
- Validation: validated
- Notes: INFR-02. Wired in Phase 6-01.

### R003 — Toast notifications
- Class: launchability
- Status: active
- Description: Every user-initiated mutation shows toast feedback (success or error); no window.alert() calls remain
- Why it matters: Production UX requires action feedback; browser alerts are unacceptable
- Source: inferred
- Primary owning slice: M002/S02
- Supporting slices: none
- Validation: unmapped
- Notes: UXPL-01. Sonner integration.

### R004 — Error boundaries
- Class: failure-visibility
- Status: active
- Description: Client component failures caught and displayed gracefully with recovery option
- Why it matters: Unhandled React errors crash the entire page; boundaries contain the blast radius
- Source: inferred
- Primary owning slice: M002/S02
- Supporting slices: none
- Validation: unmapped
- Notes: UXPL-02. react-error-boundary.

### R005 — Confirmation dialogs
- Class: launchability
- Status: active
- Description: All destructive actions use shadcn AlertDialog instead of browser confirm()
- Why it matters: Browser confirm() is unstyled and can be suppressed by browsers
- Source: inferred
- Primary owning slice: M002/S02
- Supporting slices: none
- Validation: unmapped
- Notes: UXPL-03.

### R006 — Form validation
- Class: launchability
- Status: active
- Description: Create/edit forms show inline field-level validation errors before submission
- Why it matters: Server-only validation loses user input and provides poor UX
- Source: inferred
- Primary owning slice: M002/S03
- Supporting slices: none
- Validation: unmapped
- Notes: UXPL-04. react-hook-form + Zod + dynamic EAV-to-Zod schema.

### R007 — Cursor pagination
- Class: core-capability
- Status: active
- Description: Record tables use cursor-based pagination instead of hardcoded limit=200
- Why it matters: Current hardcoded limit breaks at scale; 6+ endpoints affected
- Source: execution
- Primary owning slice: M002/S04
- Supporting slices: none
- Validation: unmapped
- Notes: UXPL-05, UXPL-06. Includes virtual scrolling.

### R008 — Gmail delta sync with recovery
- Class: core-capability
- Status: active
- Description: Gmail delta sync processes emails incrementally with bounded partial-sync recovery on historyId invalidation
- Why it matters: Email sync is the primary data feed for AI-driven features
- Source: user
- Primary owning slice: M002/S06
- Supporting slices: none
- Validation: unmapped
- Notes: SYNC-01. Phase 7.

### R009 — Outlook delta sync
- Class: core-capability
- Status: active
- Description: Outlook delta sync with proactive token refresh and webhook subscription renewal
- Why it matters: O365 users need equal sync capability
- Source: user
- Primary owning slice: M002/S06
- Supporting slices: none
- Validation: unmapped
- Notes: SYNC-02, SYNC-05. Phase 7.

### R010 — Calendar sync
- Class: integration
- Status: active
- Description: Calendar meeting_ended events detected and logged to deal activity timeline
- Why it matters: Meetings are high-signal deal engagement events
- Source: user
- Primary owning slice: M002/S07
- Supporting slices: none
- Validation: unmapped
- Notes: SYNC-03. Phase 7.

### R011 — Email-to-record matching
- Class: integration
- Status: active
- Description: Synced emails auto-matched to records by email address
- Why it matters: Without matching, synced emails are orphaned and invisible on records
- Source: inferred
- Primary owning slice: M002/S06
- Supporting slices: M002/S07
- Validation: unmapped
- Notes: SYNC-04. Phase 7.

### R012 — Email compose from records
- Class: primary-user-loop
- Status: active
- Description: User can compose and send email from record detail page via connected OAuth provider
- Why it matters: Second most-used CRM action after viewing records
- Source: user
- Primary owning slice: M002/S09
- Supporting slices: none
- Validation: unmapped
- Notes: ECOM-01 through ECOM-05. Phase 7.

### R013 — AI asset generation pipeline
- Class: differentiator
- Status: active
- Description: Deal events trigger auto-generation of briefs, proposals, meeting prep, follow-ups, battlecards into approval inbox
- Why it matters: Core product differentiator — the AI-first promise
- Source: user
- Primary owning slice: M002/S10
- Supporting slices: M002/S11
- Validation: unmapped
- Notes: AIGN-01 through AIGN-07. Phase 8.

### R014 — Activity scoring
- Class: differentiator
- Status: active
- Description: Composite activity score (fit 40% + engagement 40% + recency 20%) with hot leads dashboard
- Why it matters: AI-driven lead prioritization is a key differentiator
- Source: user
- Primary owning slice: M002/S11
- Supporting slices: none
- Validation: unmapped
- Notes: SCOR-01 through SCOR-04. Phase 8.

### R015 — Workflow automation UI
- Class: differentiator
- Status: active
- Description: Form-based automation builder with trigger-condition-action UI, enable/disable toggles
- Why it matters: Power user retention; self-service automation
- Source: user
- Primary owning slice: M002/S12
- Supporting slices: none
- Validation: unmapped
- Notes: WKFL-01 through WKFL-05. Phase 9.

### R016 — Team collaboration
- Class: primary-user-loop
- Status: active
- Description: @mentions in notes, threaded comments on records, saved filter views
- Why it matters: Team communication inside CRM instead of context-switching to Slack
- Source: user
- Primary owning slice: M002/S12
- Supporting slices: none
- Validation: unmapped
- Notes: COLB-01 through COLB-05. Phase 9.

### R017 — CSV import with field mapping
- Class: launchability
- Status: active
- Description: Multi-step import wizard with auto-mapping, dedup, and background processing for large files
- Why it matters: #1 onboarding barrier when migrating from another CRM
- Source: user
- Primary owning slice: M002/S13
- Supporting slices: none
- Validation: unmapped
- Notes: IMEX-01 through IMEX-05. Phase 10.

### R018 — Outbound webhooks
- Class: integration
- Status: active
- Description: Webhook subscriptions with HMAC signing, retry, circuit breaker, delivery logging
- Why it matters: Developer ecosystem integration for external systems
- Source: user
- Primary owning slice: M002/S13
- Supporting slices: none
- Validation: unmapped
- Notes: HOOK-01 through HOOK-05. Phase 10.

### R019 — Analytics calculations
- Class: differentiator
- Status: active
- Description: Real win/loss patterns, rep coaching, pipeline forecast, next-best-action — all with AI narrative
- Why it matters: Data-driven insights from deal history are high-value for managers and leadership
- Source: user
- Primary owning slice: M002/S14
- Supporting slices: none
- Validation: unmapped
- Notes: ANLT-01 through ANLT-04. Phase 11.

## Validated

### R050 — Multi-tenant workspace system
- Class: core-capability
- Status: validated
- Description: Workspace system with role-based access, invite links, member management
- Source: execution
- Primary owning slice: M001
- Validation: validated
- Notes: Shipped in v1.0

### R051 — Typed EAV data model
- Class: core-capability
- Status: validated
- Description: Custom objects/attributes per workspace with 17 attribute types
- Source: execution
- Primary owning slice: M001
- Validation: validated
- Notes: Shipped in v1.0

### R052 — AI chat with tool calling
- Class: differentiator
- Status: validated
- Description: 25 tools, multi-round (10 rounds), SSE streaming, read tools auto-execute, write tools require confirmation
- Source: execution
- Primary owning slice: M001
- Validation: validated
- Notes: Shipped in v1.0

### R053 — Records CRUD with filtering/sorting
- Class: primary-user-loop
- Status: validated
- Description: Dynamic filtering and sorting via EAV correlated EXISTS subqueries
- Source: execution
- Primary owning slice: M001
- Validation: validated
- Notes: Shipped in v1.0

### R054 — Pipeline features
- Class: primary-user-loop
- Status: validated
- Description: Kanban board, sequences, approvals, contracts, handoff, battlecards, dashboards
- Source: execution
- Primary owning slice: M001
- Validation: validated
- Notes: Shipped in v1.0 (Phases 4-5)

## Deferred

### R080 — Node-graph workflow editor
- Class: differentiator
- Status: deferred
- Description: n8n/Zapier-style visual graph editor for complex automation flows
- Source: research
- Validation: unmapped
- Notes: Form-based builder covers 90% of CRM automations; 10x effort for marginal gain. Defer to v3.

### R081 — Real-time WebSocket notifications
- Class: quality-attribute
- Status: deferred
- Description: Push notifications via WebSocket instead of polling
- Source: research
- Validation: unmapped
- Notes: Polling adequate for CRM; adds infrastructure complexity. Defer to v3.

### R082 — Inline spreadsheet editing
- Class: quality-attribute
- Status: deferred
- Description: Edit record values directly in table cells
- Source: research
- Validation: unmapped
- Notes: High bug surface with 17 attribute types; record detail editing sufficient. Defer to v3.

## Out of Scope

### R090 — Mobile native apps
- Class: constraint
- Status: out-of-scope
- Description: iOS/Android native apps
- Notes: Web-first, responsive design sufficient

### R091 — Marketing automation
- Class: anti-feature
- Status: out-of-scope
- Description: Email marketing campaigns, nurture flows, A/B testing
- Notes: Different product/data model; sales sequences cover 1:1 outreach

### R092 — Customer support/ticketing
- Class: anti-feature
- Status: out-of-scope
- Description: Post-sale support ticketing system
- Notes: Handled by handoff to external CS tools

## Traceability

| ID | Class | Status | Primary owner | Proof |
|---|---|---|---|---|
| R001 | core-capability | active | M002/S01 | validated |
| R002 | core-capability | active | M002/S01 | validated |
| R003 | launchability | active | M002/S02 | unmapped |
| R004 | failure-visibility | active | M002/S02 | unmapped |
| R005 | launchability | active | M002/S02 | unmapped |
| R006 | launchability | active | M002/S03 | unmapped |
| R007 | core-capability | active | M002/S04 | unmapped |
| R008-R012 | core-capability/integration | active | M002/S06-S09 | unmapped |
| R013-R014 | differentiator | active | M002/S10-S11 | unmapped |
| R015-R016 | differentiator/primary | active | M002/S12 | unmapped |
| R017-R018 | launchability/integration | active | M002/S13 | unmapped |
| R019 | differentiator | active | M002/S14 | unmapped |
| R050-R054 | various | validated | M001 | validated |

## Coverage Summary

- Active requirements: 19
- Mapped to slices: 19
- Validated: 5 (v1.0 foundations) + 2 (M002/S01 job system)
- Unmapped active requirements: 0
