# Requirements: OpenClaw CRM

**Defined:** 2026-03-10
**Core Value:** The CRM does the work. Reps sell, AI handles everything else.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Infrastructure

- [ ] **INFR-01**: System can process background jobs asynchronously with retry, backoff, and dead-letter handling (pg-boss)
- [ ] **INFR-02**: System writes signal events transactionally when CRM state changes (stage advances, record creates, note adds)
- [ ] **INFR-03**: System evaluates workspace-scoped automation rules when signal events arrive and dispatches appropriate jobs
- [ ] **INFR-04**: System stores all AI-generated content in a dedicated generated_assets table with draft/approved/sent/archived lifecycle
- [ ] **INFR-05**: Rep can review AI-generated drafts in an approval inbox and approve, edit, or reject before any customer-facing action
- [ ] **INFR-06**: System deduplicates external webhook signals using a processed_signals table with unique constraint on (provider, signal_id)
- [ ] **INFR-07**: System stores OAuth tokens in a dedicated encrypted integration_tokens table with proactive refresh before expiry

### Email Integration

- [ ] **EMAL-01**: User can connect their Gmail account via OAuth and grant bi-directional sync permission
- [ ] **EMAL-02**: User can connect their Outlook/O365 account via OAuth and grant bi-directional sync permission
- [ ] **EMAL-03**: System automatically syncs inbound and outbound emails and logs them to matching deal/contact records
- [ ] **EMAL-04**: System tracks email opens and link clicks on outbound emails sent through the CRM
- [ ] **EMAL-05**: User can view email thread history on any contact or deal record
- [ ] **EMAL-06**: User can send emails to contacts directly from the CRM via their connected account

### Calendar Integration

- [ ] **CALR-01**: User can connect their Google Calendar via OAuth (shared credential with Gmail)
- [ ] **CALR-02**: User can connect their Outlook Calendar via OAuth (shared credential with O365)
- [ ] **CALR-03**: System automatically logs meetings to associated deal records by matching attendee emails
- [ ] **CALR-04**: System triggers meeting prep brief generation 30 minutes before a deal-linked calendar event
- [ ] **CALR-05**: System triggers post-meeting follow-up draft generation when a deal-linked meeting ends

### LinkedIn Integration

- [ ] **LNKD-01**: System enriches contact records with LinkedIn profile data (title, company, location) via Proxycurl
- [ ] **LNKD-02**: System enriches company records with LinkedIn company data (size, industry, description) via Proxycurl
- [ ] **LNKD-03**: User can trigger manual enrichment on any contact or company record
- [ ] **LNKD-04**: System auto-enriches new contacts on creation when email is provided

### Telephony Integration

- [ ] **TELE-01**: System receives Zoom call recording webhooks and stores recording metadata linked to deal records
- [ ] **TELE-02**: System transcribes call recordings via AssemblyAI with speaker diarization
- [ ] **TELE-03**: System generates AI summaries of call transcripts with key topics, action items, and next steps
- [ ] **TELE-04**: System auto-logs call events to the activity timeline on associated deal records
- [ ] **TELE-05**: System applies PII redaction to transcripts before AI processing
- [ ] **TELE-06**: Workspace admin can enable/disable call recording consent requirements

### AI Asset Generation

- [ ] **AGEN-01**: System auto-generates an opportunity brief when a new deal is created with sufficient context
- [ ] **AGEN-02**: System auto-generates a proposal draft when a deal advances to the proposal stage
- [ ] **AGEN-03**: System auto-generates a presentation deck draft when a deal advances to the presentation stage
- [ ] **AGEN-04**: System generates meeting prep briefs with prospect research, recent touchpoints, talking points, and objection handling
- [ ] **AGEN-05**: System generates post-meeting follow-up email drafts from call notes or transcripts
- [ ] **AGEN-06**: System generates competitive battlecards when a competitor is detected in deal emails, notes, or call transcripts
- [ ] **AGEN-07**: All generated assets land as drafts requiring explicit rep approval before any customer-facing action
- [ ] **AGEN-08**: System uses tiered AI context strategy (rule-based / light model / full model) to manage cost and context limits

### Email Sequences

- [ ] **SEQN-01**: User can create multi-step email sequence templates with AI-generated personalized content
- [ ] **SEQN-02**: User can enroll contacts into sequences with scheduled step execution
- [ ] **SEQN-03**: System automatically stops a sequence when a recipient replies
- [ ] **SEQN-04**: System supports A/B variant testing across sequence steps
- [ ] **SEQN-05**: User can view sequence performance metrics (open rate, reply rate, conversion)

### Lead Management

- [ ] **LEAD-01**: System scores leads based on attribute fit and engagement signals with a numeric score
- [ ] **LEAD-02**: System provides plain-language AI explanation for each lead score ("Title matches ICP, 3 pricing page visits")
- [ ] **LEAD-03**: User can capture inbound leads via embeddable web forms that create records automatically
- [ ] **LEAD-04**: System can parse inbound emails to create lead records from unknown senders

### Activity Timeline

- [ ] **TMLN-01**: User can view a unified chronological timeline on any record showing all touchpoints (emails, calls, meetings, notes, tasks, stage changes)
- [ ] **TMLN-02**: Timeline entries are auto-logged from connected integrations without manual entry
- [ ] **TMLN-03**: AI can read the activity timeline to assemble context for asset generation

### Dashboards

- [ ] **DASH-01**: Rep can view a personal pipeline dashboard showing their deals, tasks, and AI-generated draft queue
- [ ] **DASH-02**: Manager can view a team pipeline dashboard with aggregate deal metrics and per-rep performance
- [ ] **DASH-03**: Leadership can view a revenue forecast dashboard with stage distribution and weighted pipeline value

### Approval Workflows

- [ ] **APRV-01**: Workspace admin can configure approval rules (e.g., discount > 20% routes to manager, contract > $100k routes to legal)
- [ ] **APRV-02**: System routes deals matching approval rules to the designated approver with notification
- [ ] **APRV-03**: Approver can approve, reject, or request changes on routed items
- [ ] **APRV-04**: System tracks approval history with timestamps and approver identity

### Contract Generation

- [ ] **CNTR-01**: System generates contract/SOW documents from deal data (pricing, terms, stakeholders, company info)
- [ ] **CNTR-02**: Generated contracts are output as PDF via server-side rendering
- [ ] **CNTR-03**: Contracts route through approval workflow before delivery to customer
- [ ] **CNTR-04**: User can customize contract templates per workspace with clause library

### Close Flow

- [ ] **CLOS-01**: When a deal is marked closed-won, system generates a customer handoff brief with stakeholders, agreed terms, success criteria, and deal history
- [ ] **CLOS-02**: Handoff brief can be exported or sent to external CS tools via webhook

### Analytics & Intelligence

- [ ] **INTL-01**: System analyzes closed deals to identify win/loss patterns (e.g., "Deals with 3+ stakeholders and a POC close 2x more")
- [ ] **INTL-02**: System compares rep activity patterns to top performers and generates coaching recommendations
- [ ] **INTL-03**: System generates pipeline forecasts with AI confidence scores based on engagement signals and historical close rates
- [ ] **INTL-04**: AI provides "next best action" suggestions on each deal based on stage, activity, and win pattern data

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Integrations

- **ADV-01**: Native Slack integration for deal notifications and AI draft review
- **ADV-02**: Zapier/webhook integration for connecting to external tools
- **ADV-03**: Native e-signature integration (DocuSign/HelloSign) for contracts

### Mobile

- **MOB-01**: Progressive web app with offline-capable deal lookup
- **MOB-02**: Push notifications for urgent deal signals on mobile

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full marketing automation (campaigns, nurture flows, newsletters) | Different product, different persona — sales sequences yes, marketing broadcasts no |
| Custom SQL report builder | AI-generated summaries replace 90% of use cases; exponential surface area for 5% of users |
| Native iOS/Android apps | Responsive PWA covers the gap; native mobile is v3 |
| Real-time collaborative proposal editing | Async draft/review workflow is the correct model for sales assets |
| Prospecting database (Apollo-style lead sourcing) | Multi-million dollar data infrastructure problem; integrate with existing providers instead |
| White-label / multi-brand reseller mode | Single-brand product per PROJECT.md |
| Built-in customer support ticketing | Different workflow and persona; CS handoff brief feeds into Zendesk/Intercom via webhook |
| LinkedIn scraping | ToS violation, liability risk; use compliant Proxycurl API instead |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFR-01 | Phase 1 | Pending |
| INFR-02 | Phase 1 | Pending |
| INFR-03 | Phase 1 | Pending |
| INFR-04 | Phase 1 | Pending |
| INFR-05 | Phase 1 | Pending |
| INFR-06 | Phase 1 | Pending |
| INFR-07 | Phase 1 | Pending |
| EMAL-01 | Phase 2 | Pending |
| EMAL-02 | Phase 2 | Pending |
| EMAL-03 | Phase 2 | Pending |
| EMAL-04 | Phase 2 | Pending |
| EMAL-05 | Phase 2 | Pending |
| EMAL-06 | Phase 2 | Pending |
| CALR-01 | Phase 2 | Pending |
| CALR-02 | Phase 2 | Pending |
| CALR-03 | Phase 2 | Pending |
| CALR-04 | Phase 2 | Pending |
| CALR-05 | Phase 2 | Pending |
| LNKD-01 | Phase 2 | Pending |
| LNKD-02 | Phase 2 | Pending |
| LNKD-03 | Phase 2 | Pending |
| LNKD-04 | Phase 2 | Pending |
| TELE-01 | Phase 2 | Pending |
| TELE-02 | Phase 2 | Pending |
| TELE-03 | Phase 2 | Pending |
| TELE-04 | Phase 2 | Pending |
| TELE-05 | Phase 2 | Pending |
| TELE-06 | Phase 2 | Pending |
| AGEN-01 | Phase 3 | Pending |
| AGEN-02 | Phase 3 | Pending |
| AGEN-03 | Phase 3 | Pending |
| AGEN-04 | Phase 3 | Pending |
| AGEN-05 | Phase 3 | Pending |
| AGEN-06 | Phase 3 | Pending |
| AGEN-07 | Phase 3 | Pending |
| AGEN-08 | Phase 3 | Pending |
| SEQN-01 | Phase 3 | Pending |
| SEQN-02 | Phase 3 | Pending |
| SEQN-03 | Phase 3 | Pending |
| SEQN-04 | Phase 3 | Pending |
| SEQN-05 | Phase 3 | Pending |
| LEAD-01 | Phase 3 | Pending |
| LEAD-02 | Phase 3 | Pending |
| LEAD-03 | Phase 3 | Pending |
| LEAD-04 | Phase 3 | Pending |
| TMLN-01 | Phase 3 | Pending |
| TMLN-02 | Phase 3 | Pending |
| TMLN-03 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| APRV-01 | Phase 4 | Pending |
| APRV-02 | Phase 4 | Pending |
| APRV-03 | Phase 4 | Pending |
| APRV-04 | Phase 4 | Pending |
| CNTR-01 | Phase 4 | Pending |
| CNTR-02 | Phase 4 | Pending |
| CNTR-03 | Phase 4 | Pending |
| CNTR-04 | Phase 4 | Pending |
| CLOS-01 | Phase 4 | Pending |
| CLOS-02 | Phase 4 | Pending |
| INTL-01 | Phase 5 | Pending |
| INTL-02 | Phase 5 | Pending |
| INTL-03 | Phase 5 | Pending |
| INTL-04 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 60 total
- Mapped to phases: 60
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after initial definition*
