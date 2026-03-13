-- Migration: Push schema to production
-- Generated: 2026-03-13T00:41:27.367Z

BEGIN;

-- ==========================================
-- NEW ENUMS
-- ==========================================

CREATE TYPE public.approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'expired'
);

CREATE TYPE public.approval_trigger_type AS ENUM (
    'discount_threshold',
    'deal_value_threshold',
    'stage_change',
    'contract_send',
    'manual'
);

CREATE TYPE public.asset_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'rejected',
    'delivered',
    'archived',
    'sent'
);

CREATE TYPE public.asset_type AS ENUM (
    'contract',
    'sow',
    'proposal',
    'opportunity_brief',
    'meeting_prep',
    'follow_up',
    'handoff_brief',
    'battlecard',
    'deck',
    'followup',
    'sequence_step'
);

CREATE TYPE public.automation_action AS ENUM (
    'enqueue_ai_generate',
    'enqueue_email_send',
    'enqueue_email_sync',
    'enqueue_calendar_sync',
    'create_task',
    'create_note'
);

CREATE TYPE public.calendar_provider AS ENUM (
    'google_calendar',
    'outlook_calendar'
);

CREATE TYPE public.call_recording_status AS ENUM (
    'pending',
    'transcribing',
    'transcribed',
    'failed'
);

CREATE TYPE public.contract_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'sent',
    'signed',
    'rejected',
    'expired',
    'cancelled'
);

CREATE TYPE public.contract_type AS ENUM (
    'nda',
    'msa',
    'sow',
    'proposal',
    'order_form',
    'custom'
);

CREATE TYPE public.email_provider AS ENUM (
    'gmail',
    'outlook'
);

CREATE TYPE public.integration_provider AS ENUM (
    'gmail',
    'outlook',
    'google_calendar',
    'outlook_calendar',
    'zoom',
    'linkedin'
);

CREATE TYPE public.integration_status AS ENUM (
    'active',
    'revoked',
    'error',
    'expired'
);

CREATE TYPE public.job_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'cancelled'
);

CREATE TYPE public.workspace_type AS ENUM (
    'agency',
    'company',
    'business_unit'
);

-- ==========================================
-- NEW TABLES
-- ==========================================

CREATE TABLE public.workspace_invites (
    id text NOT NULL,
    workspace_id text NOT NULL,
    email text NOT NULL,
    role public.workspace_role DEFAULT 'member'::public.workspace_role NOT NULL,
    token text NOT NULL,
    created_by text,
    accepted_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.approval_rules (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    description text,
    trigger_type public.approval_trigger_type NOT NULL,
    conditions jsonb DEFAULT '{}'::jsonb NOT NULL,
    approver_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    expires_after_hours integer,
    is_active text DEFAULT 'true'::text NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.approval_requests (
    id text NOT NULL,
    workspace_id text NOT NULL,
    rule_id text,
    record_id text,
    title text NOT NULL,
    description text,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    requested_by text,
    resolved_by text,
    status public.approval_status DEFAULT 'pending'::public.approval_status NOT NULL,
    resolver_note text,
    expires_at timestamp without time zone,
    resolved_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.approval_history (
    id text NOT NULL,
    request_id text NOT NULL,
    actor_id text,
    from_status public.approval_status,
    to_status public.approval_status NOT NULL,
    note text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.automation_rules (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    trigger_type text NOT NULL,
    conditions jsonb DEFAULT '[]'::jsonb NOT NULL,
    action_type public.automation_action NOT NULL,
    action_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.background_jobs (
    id text NOT NULL,
    workspace_id text,
    type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    status public.job_status DEFAULT 'pending'::public.job_status NOT NULL,
    run_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    failed_at timestamp without time zone,
    error_message text,
    retries text DEFAULT '0'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.calendar_events (
    id text NOT NULL,
    workspace_id text NOT NULL,
    record_id text,
    provider public.calendar_provider NOT NULL,
    external_id text NOT NULL,
    title text,
    description text,
    start_at timestamp without time zone NOT NULL,
    end_at timestamp without time zone NOT NULL,
    attendee_emails text[] DEFAULT '{}'::text[],
    location text,
    meeting_url text,
    prep_job_enqueued boolean DEFAULT false NOT NULL,
    ended_signal_emitted boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.call_recordings (
    id text NOT NULL,
    workspace_id text NOT NULL,
    record_id text,
    provider text DEFAULT 'zoom'::text NOT NULL,
    external_meeting_id text NOT NULL,
    external_recording_id text NOT NULL,
    recording_url text,
    duration_seconds numeric,
    started_at timestamp without time zone,
    ended_at timestamp without time zone,
    attendee_emails text[] DEFAULT '{}'::text[],
    assemblyai_transcript_id text,
    transcript_raw text,
    transcript_redacted text,
    ai_summary text,
    status public.call_recording_status DEFAULT 'pending'::public.call_recording_status NOT NULL,
    consent_confirmed boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contract_templates (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    contract_type public.contract_type DEFAULT 'custom'::public.contract_type NOT NULL,
    description text,
    clauses jsonb DEFAULT '[]'::jsonb NOT NULL,
    defaults jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active text DEFAULT 'true'::text NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.contracts (
    id text NOT NULL,
    workspace_id text NOT NULL,
    record_id text,
    template_id text,
    contract_type public.contract_type DEFAULT 'custom'::public.contract_type NOT NULL,
    status public.contract_status DEFAULT 'draft'::public.contract_status NOT NULL,
    title text NOT NULL,
    content text,
    structured_content jsonb,
    pdf_url text,
    approval_request_id text,
    merge_fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    generated_by text,
    approved_by text,
    approved_at timestamp without time zone,
    sent_at timestamp without time zone,
    signed_at timestamp without time zone,
    expires_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.deal_participations (
    id text NOT NULL,
    record_id text NOT NULL,
    workspace_id text NOT NULL,
    role text DEFAULT 'participant'::text NOT NULL,
    notes text,
    added_at timestamp without time zone DEFAULT now() NOT NULL,
    added_by text
);

CREATE TABLE public.email_messages (
    id text NOT NULL,
    workspace_id text NOT NULL,
    record_id text,
    provider public.email_provider NOT NULL,
    external_id text NOT NULL,
    thread_id text,
    from_email text NOT NULL,
    from_name text,
    to_emails text[] DEFAULT '{}'::text[] NOT NULL,
    cc_emails text[] DEFAULT '{}'::text[],
    subject text,
    snippet text,
    direction text NOT NULL,
    received_at timestamp without time zone NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    labels text[] DEFAULT '{}'::text[],
    opened_at timestamp without time zone,
    clicked_at timestamp without time zone,
    delivery_status text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.generated_assets (
    id text NOT NULL,
    workspace_id text NOT NULL,
    record_id text,
    asset_type public.asset_type NOT NULL,
    status public.asset_status DEFAULT 'draft'::public.asset_status NOT NULL,
    title text,
    content text,
    structured_content jsonb,
    content_md text,
    file_url text,
    approval_request_id text,
    model_used text,
    prompt_version text,
    context_tier text,
    generated_by text,
    generated_at timestamp without time zone DEFAULT now() NOT NULL,
    resolved_by text,
    resolved_at timestamp without time zone,
    approved_by text,
    approved_at timestamp without time zone,
    rejected_by text,
    rejected_at timestamp without time zone,
    rejection_note text,
    generation_metadata jsonb,
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.integration_tokens (
    id text NOT NULL,
    workspace_id text NOT NULL,
    user_id text NOT NULL,
    provider public.integration_provider NOT NULL,
    access_token_encrypted text NOT NULL,
    refresh_token_encrypted text,
    expires_at timestamp without time zone,
    scopes text[],
    status public.integration_status DEFAULT 'active'::public.integration_status NOT NULL,
    sync_cursor text,
    provider_metadata jsonb DEFAULT '{}'::jsonb,
    connected_at timestamp without time zone DEFAULT now() NOT NULL,
    last_refreshed_at timestamp without time zone,
    last_sync_at timestamp without time zone,
    error_message text
);

CREATE TABLE public.outbound_webhooks (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    events text NOT NULL,
    secret text,
    enabled boolean DEFAULT true NOT NULL,
    failure_count integer DEFAULT 0 NOT NULL,
    last_success_at timestamp without time zone,
    last_error text,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.processed_signals (
    id text NOT NULL,
    workspace_id text,
    provider text NOT NULL,
    signal_id text NOT NULL,
    processed_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sequences (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'active'::text NOT NULL,
    created_by text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sequence_steps (
    id text NOT NULL,
    sequence_id text NOT NULL,
    workspace_id text NOT NULL,
    step_number integer NOT NULL,
    delay_days integer DEFAULT 0 NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    variant text DEFAULT 'a'::text NOT NULL,
    variant_weight integer DEFAULT 100 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.sequence_enrollments (
    id text NOT NULL,
    sequence_id text NOT NULL,
    contact_record_id text NOT NULL,
    workspace_id text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    next_step_at timestamp without time zone,
    stopped_reason text,
    variant text DEFAULT 'a'::text NOT NULL,
    enrolled_at timestamp without time zone DEFAULT now() NOT NULL,
    stopped_at timestamp without time zone,
    completed_at timestamp without time zone
);

CREATE TABLE public.sequence_step_sends (
    id text NOT NULL,
    enrollment_id text NOT NULL,
    step_id text NOT NULL,
    workspace_id text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    email_from text,
    email_to text,
    subject text,
    body text,
    opened boolean DEFAULT false NOT NULL,
    clicked boolean DEFAULT false NOT NULL,
    replied boolean DEFAULT false NOT NULL,
    sent_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.signal_events (
    id text NOT NULL,
    workspace_id text NOT NULL,
    record_id text,
    type text NOT NULL,
    provider text,
    payload jsonb DEFAULT '{}'::jsonb,
    actor_id text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.web_forms (
    id text NOT NULL,
    workspace_id text NOT NULL,
    name text NOT NULL,
    description text,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    target_object_slug text DEFAULT 'people'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

-- ==========================================
-- ALTER EXISTING TABLES
-- ==========================================

-- workspaces: add type and parent_workspace_id
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS type workspace_type NOT NULL DEFAULT 'company';
ALTER TABLE public.workspaces ADD COLUMN IF NOT EXISTS parent_workspace_id text;

-- records: add is_joint
ALTER TABLE public.records ADD COLUMN IF NOT EXISTS is_joint boolean DEFAULT false;

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX approval_history_request_id ON public.approval_history USING btree (request_id);
CREATE INDEX approval_requests_record_id ON public.approval_requests USING btree (record_id);
CREATE INDEX approval_requests_requested_by ON public.approval_requests USING btree (requested_by);
CREATE INDEX approval_requests_resolved_by ON public.approval_requests USING btree (resolved_by);
CREATE INDEX approval_requests_status ON public.approval_requests USING btree (status);
CREATE INDEX approval_requests_workspace_id ON public.approval_requests USING btree (workspace_id);
CREATE INDEX approval_rules_workspace_id ON public.approval_rules USING btree (workspace_id);
CREATE INDEX automation_rules_workspace_enabled ON public.automation_rules USING btree (workspace_id, enabled);
CREATE INDEX automation_rules_workspace_trigger ON public.automation_rules USING btree (workspace_id, trigger_type);
CREATE INDEX background_jobs_status ON public.background_jobs USING btree (status, run_at);
CREATE INDEX background_jobs_type ON public.background_jobs USING btree (type);
CREATE INDEX background_jobs_workspace ON public.background_jobs USING btree (workspace_id);
CREATE UNIQUE INDEX calendar_events_external_unique ON public.calendar_events USING btree (workspace_id, provider, external_id);
CREATE INDEX calendar_events_record_id ON public.calendar_events USING btree (record_id);
CREATE INDEX calendar_events_start_at ON public.calendar_events USING btree (workspace_id, start_at);
CREATE UNIQUE INDEX call_recordings_external_unique ON public.call_recordings USING btree (workspace_id, external_recording_id);
CREATE INDEX call_recordings_record_id ON public.call_recordings USING btree (record_id);
CREATE INDEX call_recordings_workspace_status ON public.call_recordings USING btree (workspace_id, status);
CREATE INDEX contract_templates_workspace_id ON public.contract_templates USING btree (workspace_id);
CREATE INDEX contracts_record_id ON public.contracts USING btree (record_id);
CREATE INDEX contracts_status ON public.contracts USING btree (status);
CREATE INDEX contracts_workspace_id ON public.contracts USING btree (workspace_id);
CREATE INDEX deal_participations_record ON public.deal_participations USING btree (record_id);
CREATE UNIQUE INDEX deal_participations_record_workspace ON public.deal_participations USING btree (record_id, workspace_id);
CREATE INDEX deal_participations_workspace ON public.deal_participations USING btree (workspace_id);
CREATE UNIQUE INDEX email_messages_external_unique ON public.email_messages USING btree (workspace_id, provider, external_id);
CREATE INDEX email_messages_received_at ON public.email_messages USING btree (workspace_id, received_at);
CREATE INDEX email_messages_record_id ON public.email_messages USING btree (record_id);
CREATE INDEX email_messages_thread_id ON public.email_messages USING btree (workspace_id, thread_id);
CREATE INDEX generated_assets_asset_type ON public.generated_assets USING btree (asset_type);
CREATE INDEX generated_assets_record_id ON public.generated_assets USING btree (record_id);
CREATE INDEX generated_assets_record_type ON public.generated_assets USING btree (record_id, asset_type);
CREATE INDEX generated_assets_status ON public.generated_assets USING btree (status);
CREATE INDEX generated_assets_workspace_id ON public.generated_assets USING btree (workspace_id);
CREATE INDEX generated_assets_workspace_status ON public.generated_assets USING btree (workspace_id, status);
CREATE UNIQUE INDEX integration_tokens_unique ON public.integration_tokens USING btree (workspace_id, user_id, provider);
CREATE INDEX outbound_webhooks_workspace ON public.outbound_webhooks USING btree (workspace_id);
CREATE INDEX outbound_webhooks_workspace_enabled ON public.outbound_webhooks USING btree (workspace_id, enabled);
CREATE UNIQUE INDEX processed_signals_unique ON public.processed_signals USING btree (provider, signal_id);
CREATE INDEX processed_signals_workspace ON public.processed_signals USING btree (workspace_id);
CREATE INDEX sequence_enrollments_contact ON public.sequence_enrollments USING btree (contact_record_id);
CREATE INDEX sequence_enrollments_next_step ON public.sequence_enrollments USING btree (status, next_step_at);
CREATE INDEX sequence_enrollments_workspace_status ON public.sequence_enrollments USING btree (workspace_id, status);
CREATE INDEX sequence_step_sends_enrollment ON public.sequence_step_sends USING btree (enrollment_id);
CREATE INDEX sequence_steps_sequence ON public.sequence_steps USING btree (sequence_id, step_number);
CREATE INDEX sequences_workspace_status ON public.sequences USING btree (workspace_id, status);
CREATE INDEX signal_events_created_at ON public.signal_events USING btree (workspace_id, created_at);
CREATE INDEX signal_events_record_id ON public.signal_events USING btree (record_id);
CREATE INDEX signal_events_workspace_type ON public.signal_events USING btree (workspace_id, type);
CREATE INDEX web_forms_workspace ON public.web_forms USING btree (workspace_id, active);
CREATE INDEX workspaces_parent ON public.workspaces USING btree (parent_workspace_id);

-- ==========================================
-- PRIMARY KEYS
-- ==========================================

ALTER TABLE ONLY public.workspace_invites ADD CONSTRAINT workspace_invites_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.workspace_invites ADD CONSTRAINT workspace_invites_token_unique UNIQUE (token);
ALTER TABLE ONLY public.approval_rules ADD CONSTRAINT approval_rules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.approval_requests ADD CONSTRAINT approval_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.approval_history ADD CONSTRAINT approval_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.automation_rules ADD CONSTRAINT automation_rules_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.background_jobs ADD CONSTRAINT background_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.call_recordings ADD CONSTRAINT call_recordings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contract_templates ADD CONSTRAINT contract_templates_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.deal_participations ADD CONSTRAINT deal_participations_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.email_messages ADD CONSTRAINT email_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.generated_assets ADD CONSTRAINT generated_assets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.integration_tokens ADD CONSTRAINT integration_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.outbound_webhooks ADD CONSTRAINT outbound_webhooks_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.processed_signals ADD CONSTRAINT processed_signals_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sequences ADD CONSTRAINT sequences_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sequence_steps ADD CONSTRAINT sequence_steps_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sequence_enrollments ADD CONSTRAINT sequence_enrollments_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.sequence_step_sends ADD CONSTRAINT sequence_step_sends_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.signal_events ADD CONSTRAINT signal_events_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.web_forms ADD CONSTRAINT web_forms_pkey PRIMARY KEY (id);

-- ==========================================
-- FOREIGN KEYS
-- ==========================================

-- workspace_invites
ALTER TABLE ONLY public.workspace_invites ADD CONSTRAINT workspace_invites_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.workspace_invites ADD CONSTRAINT workspace_invites_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- approval_rules
ALTER TABLE ONLY public.approval_rules ADD CONSTRAINT approval_rules_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.approval_rules ADD CONSTRAINT approval_rules_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- approval_requests
ALTER TABLE ONLY public.approval_requests ADD CONSTRAINT approval_requests_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.approval_requests ADD CONSTRAINT approval_requests_rule_id_approval_rules_id_fk FOREIGN KEY (rule_id) REFERENCES public.approval_rules(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.approval_requests ADD CONSTRAINT approval_requests_record_id_records_id_fk FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.approval_requests ADD CONSTRAINT approval_requests_requested_by_users_id_fk FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.approval_requests ADD CONSTRAINT approval_requests_resolved_by_users_id_fk FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- approval_history
ALTER TABLE ONLY public.approval_history ADD CONSTRAINT approval_history_request_id_approval_requests_id_fk FOREIGN KEY (request_id) REFERENCES public.approval_requests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.approval_history ADD CONSTRAINT approval_history_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- background_jobs
ALTER TABLE ONLY public.background_jobs ADD CONSTRAINT background_jobs_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- calendar_events
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.calendar_events ADD CONSTRAINT calendar_events_record_id_records_id_fk FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;

-- call_recordings
ALTER TABLE ONLY public.call_recordings ADD CONSTRAINT call_recordings_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.call_recordings ADD CONSTRAINT call_recordings_record_id_records_id_fk FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;

-- contract_templates
ALTER TABLE ONLY public.contract_templates ADD CONSTRAINT contract_templates_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contract_templates ADD CONSTRAINT contract_templates_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- contracts
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_record_id_records_id_fk FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_template_id_contract_templates_id_fk FOREIGN KEY (template_id) REFERENCES public.contract_templates(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_generated_by_users_id_fk FOREIGN KEY (generated_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.contracts ADD CONSTRAINT contracts_approved_by_users_id_fk FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- deal_participations
ALTER TABLE ONLY public.deal_participations ADD CONSTRAINT deal_participations_record_id_records_id_fk FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.deal_participations ADD CONSTRAINT deal_participations_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.deal_participations ADD CONSTRAINT deal_participations_added_by_users_id_fk FOREIGN KEY (added_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- email_messages
ALTER TABLE ONLY public.email_messages ADD CONSTRAINT email_messages_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.email_messages ADD CONSTRAINT email_messages_record_id_records_id_fk FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;

-- generated_assets
ALTER TABLE ONLY public.generated_assets ADD CONSTRAINT generated_assets_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.generated_assets ADD CONSTRAINT generated_assets_record_id_records_id_fk FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.generated_assets ADD CONSTRAINT generated_assets_generated_by_users_id_fk FOREIGN KEY (generated_by) REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.generated_assets ADD CONSTRAINT generated_assets_resolved_by_users_id_fk FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- integration_tokens
ALTER TABLE ONLY public.integration_tokens ADD CONSTRAINT integration_tokens_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.integration_tokens ADD CONSTRAINT integration_tokens_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- outbound_webhooks
ALTER TABLE ONLY public.outbound_webhooks ADD CONSTRAINT outbound_webhooks_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- processed_signals
ALTER TABLE ONLY public.processed_signals ADD CONSTRAINT processed_signals_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- sequences
ALTER TABLE ONLY public.sequences ADD CONSTRAINT sequences_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- sequence_steps
ALTER TABLE ONLY public.sequence_steps ADD CONSTRAINT sequence_steps_sequence_id_sequences_id_fk FOREIGN KEY (sequence_id) REFERENCES public.sequences(id) ON DELETE CASCADE;

-- sequence_enrollments
ALTER TABLE ONLY public.sequence_enrollments ADD CONSTRAINT sequence_enrollments_sequence_id_sequences_id_fk FOREIGN KEY (sequence_id) REFERENCES public.sequences(id) ON DELETE CASCADE;

-- sequence_step_sends
ALTER TABLE ONLY public.sequence_step_sends ADD CONSTRAINT sequence_step_sends_enrollment_id_sequence_enrollments_id_fk FOREIGN KEY (enrollment_id) REFERENCES public.sequence_enrollments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.sequence_step_sends ADD CONSTRAINT sequence_step_sends_step_id_sequence_steps_id_fk FOREIGN KEY (step_id) REFERENCES public.sequence_steps(id) ON DELETE CASCADE;

-- signal_events
ALTER TABLE ONLY public.signal_events ADD CONSTRAINT signal_events_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.signal_events ADD CONSTRAINT signal_events_record_id_records_id_fk FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.signal_events ADD CONSTRAINT signal_events_actor_id_users_id_fk FOREIGN KEY (actor_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- web_forms
ALTER TABLE ONLY public.web_forms ADD CONSTRAINT web_forms_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- workspaces self-referencing FK for hierarchy
ALTER TABLE ONLY public.workspaces ADD CONSTRAINT workspaces_parent_workspace_id_workspaces_id_fk FOREIGN KEY (parent_workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

COMMIT;
