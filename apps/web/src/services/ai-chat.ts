import { db } from "@/db";
import {
  conversations,
  messages,
  workspaces,
  objects,
} from "@/db/schema";
import { eq, desc, asc } from "drizzle-orm";
import { globalSearch } from "./search";
import { listObjects, getObjectBySlug, getObjectWithAttributes } from "./objects";
import { listRecords, getRecord, createRecord, updateRecord, deleteRecord } from "./records";
import { listTasks, createTask } from "./tasks";
import { getNotesForRecord, createNote } from "./notes";
import { listLists, listListEntries } from "./lists";
// Phase 1-5 service imports
import {
  listSequences,
  getSequence,
  createSequence,
  addStep,
  enrollContact,
  stopEnrollment,
} from "./sequences";
import { listAssets } from "./documents/asset-registry";
import { listDrafts, approveDraft, rejectDraft, type AssetStatus } from "./generated-assets";
import { getRepDashboard } from "./dashboard";
import { getActivityTimeline } from "./activity-timeline";
import { listContracts, generateContract } from "./contracts";
import { detectCompetitors } from "./competitor-detector";

// ─── Types ───────────────────────────────────────────────────────────

interface AIConfig {
  apiKey: string;
  model: string;
}

interface WorkspaceSettings {
  openrouterApiKey?: string;
  openrouterModel?: string;
}

export interface ToolHandler {
  requiresConfirmation: boolean;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

interface ToolContext {
  workspaceId: string;
  userId: string;
}

interface OpenRouterMessage {
  role: "user" | "assistant" | "system" | "tool";
  content?: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

// ─── Config ──────────────────────────────────────────────────────────

export async function getAIConfig(workspaceId: string): Promise<AIConfig | null> {
  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const settings = (workspace?.settings ?? {}) as WorkspaceSettings;

  // Workspace setting > env var
  const apiKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    model: settings.openrouterModel || process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
  };
}

// ─── System Prompt ───────────────────────────────────────────────────

export async function buildSystemPrompt(workspaceId: string): Promise<string> {
  const objs = await listObjects(workspaceId);

  // Build detailed object schema with attributes and status values
  const objectDetails = await Promise.all(
    objs.map(async (o) => {
      const full = await getObjectWithAttributes(workspaceId, o.slug);
      if (!full) return `- ${o.pluralName} (slug: "${o.slug}")`;

      const attrLines = (full.attributes as any[]).map((a) => {
        let desc = `    - "${a.slug}" (${a.type}${a.isMultiselect ? ", array" : ""})`;
        if (a.statuses?.length) {
          desc += ` — values: ${a.statuses.map((s: any) => `"${s.title}"`).join(", ")}`;
        }
        return desc;
      });
      return `- ${o.pluralName} (slug: "${o.slug}")\n${attrLines.join("\n")}`;
    })
  );

  return `You are Aria, the AI assistant for OpenClaw CRM. You help users manage their entire sales pipeline — from prospecting to close. You can search records, manage contacts/companies/deals, create tasks and notes, run email sequences, review AI-generated assets, check competitive intelligence, view dashboards, and manage contracts.

Available object types and their attributes:
${objectDetails.join("\n")}

Guidelines:
- When the user refers to "people", "contacts", "companies", "deals" etc., map to the correct object slug.
- Use search_records to find records by name, email, domain, etc.
- Use list_records to browse records of a specific type.
- Use get_record to get full details of a specific record.
- When creating or updating records, use the exact attribute slugs listed above.
- For People: "name" is type personal_name (value: { fullName, firstName, lastName }), "email_addresses" and "phone_numbers" are multiselect arrays.
- For status attributes (like deal stage), use the exact status title values listed above.
- When creating tasks, always provide a clear content description.
- When creating notes, you need a recordId — search for the record first if needed.

Sequences (outbound email automation):
- Use list_sequences to show all sequences with stats.
- Use create_sequence to set up a new outbound sequence, then add_sequence_step for each email step.
- Use enroll_in_sequence to add a contact to a sequence. Search for the contact first if needed.
- Step templates support {{contactName}} and {{companyName}} placeholders.

Competitive Intelligence:
- Use list_battlecards to show all battlecards with competitor strengths, weaknesses, and objection handling.
- Use detect_competitors to scan text (emails, notes) for competitor mentions.

AI-Generated Assets:
- Use list_generated_assets to see draft proposals, briefs, battlecards, and follow-ups pending review.
- Use approve_asset or reject_asset to process drafts. Always explain the asset content before asking for approval.

Dashboard & Analytics:
- Use get_dashboard for a quick overview of pipeline value, win rate, active deals, tasks, and meetings.
- Use get_activity_timeline to see the full history of a record (emails, calls, notes, stage changes).

Contracts:
- Use list_contracts to see contracts for a deal.
- Use generate_contract to create a contract from a template.

General:
- Be concise and helpful. Confirm actions before executing writes.
- If a tool call fails, explain the error to the user and suggest alternatives.
- Proactively suggest relevant actions (e.g., if a deal is won, suggest generating a contract).`;
}

// ─── Tool Definitions ────────────────────────────────────────────────

export const toolDefinitions = [
  {
    type: "function" as const,
    function: {
      name: "search_records",
      description: "Search across all records and lists by name, email, domain, or any text. Returns matching records with their type and display name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query (name, email, domain, etc.)" },
          limit: { type: "number", description: "Max results (default 20)" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_objects",
      description: "List all object types in the workspace (e.g., People, Companies, Deals, custom objects).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_records",
      description: "List records of a specific object type. Use object_slug like 'people', 'companies', or 'deals'.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug, e.g. 'people', 'companies', 'deals'" },
          limit: { type: "number", description: "Max records to return (default 20)" },
          offset: { type: "number", description: "Pagination offset" },
        },
        required: ["object_slug"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_record",
      description: "Get full details of a specific record by its ID and object slug.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug" },
          record_id: { type: "string", description: "Record UUID" },
        },
        required: ["object_slug", "record_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_tasks",
      description: "List tasks for the current user. Can include completed tasks.",
      parameters: {
        type: "object",
        properties: {
          show_completed: { type: "boolean", description: "Include completed tasks (default false)" },
          limit: { type: "number", description: "Max tasks to return" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_notes_for_record",
      description: "Get all notes attached to a specific record.",
      parameters: {
        type: "object",
        properties: {
          record_id: { type: "string", description: "Record UUID" },
        },
        required: ["record_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_lists",
      description: "List all lists in the workspace.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "list_list_entries",
      description: "Get entries of a specific list.",
      parameters: {
        type: "object",
        properties: {
          list_id: { type: "string", description: "List UUID" },
          limit: { type: "number", description: "Max entries" },
          offset: { type: "number", description: "Pagination offset" },
        },
        required: ["list_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_record",
      description: "Create a new record. For People use name: { fullName, firstName, lastName }, email_addresses (array), phone_numbers (array). For Companies use name, domain. For Deals use name.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug, e.g. 'people', 'companies', 'deals'" },
          values: {
            type: "object",
            description: "Attribute values keyed by attribute slug",
          },
        },
        required: ["object_slug", "values"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_record",
      description: "Update an existing record's attribute values.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug" },
          record_id: { type: "string", description: "Record UUID" },
          values: {
            type: "object",
            description: "Attribute values to update, keyed by attribute slug",
          },
        },
        required: ["object_slug", "record_id", "values"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_record",
      description: "Delete a record permanently.",
      parameters: {
        type: "object",
        properties: {
          object_slug: { type: "string", description: "Object slug" },
          record_id: { type: "string", description: "Record UUID" },
        },
        required: ["object_slug", "record_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_task",
      description: "Create a new task. Can optionally link to records and assign to users.",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "Task description" },
          deadline: { type: "string", description: "ISO date string for the deadline" },
          record_ids: {
            type: "array",
            items: { type: "string" },
            description: "Record UUIDs to link to this task",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_note",
      description: "Create a new note attached to a record.",
      parameters: {
        type: "object",
        properties: {
          record_id: { type: "string", description: "Record UUID to attach the note to" },
          title: { type: "string", description: "Note title" },
          content: { type: "string", description: "Note content as plain text" },
        },
        required: ["record_id", "title"],
      },
    },
  },

  // ─── Sequences Tools ────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "list_sequences",
      description: "List all email sequences in the workspace with step counts, enrollment counts, and reply rates.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_sequence",
      description: "Get full details of a sequence including all steps and enrollments.",
      parameters: {
        type: "object",
        properties: {
          sequence_id: { type: "string", description: "Sequence UUID" },
        },
        required: ["sequence_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "create_sequence",
      description: "Create a new email sequence for outbound outreach.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Sequence name" },
          description: { type: "string", description: "Sequence description" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_sequence_step",
      description: "Add an email step to a sequence. Each step has a subject, body template, and delay.",
      parameters: {
        type: "object",
        properties: {
          sequence_id: { type: "string", description: "Sequence UUID" },
          step_number: { type: "number", description: "Step number (1-based)" },
          delay_days: { type: "number", description: "Days to wait before sending (0 = immediately)" },
          subject: { type: "string", description: "Email subject line (can include {{contactName}}, {{companyName}} placeholders)" },
          body: { type: "string", description: "Email body template (can include {{contactName}}, {{companyName}} placeholders)" },
        },
        required: ["sequence_id", "subject", "body"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "enroll_in_sequence",
      description: "Enroll a contact record into a sequence to start receiving automated emails.",
      parameters: {
        type: "object",
        properties: {
          sequence_id: { type: "string", description: "Sequence UUID" },
          contact_record_id: { type: "string", description: "Contact record UUID to enroll" },
        },
        required: ["sequence_id", "contact_record_id"],
      },
    },
  },

  // ─── Battlecards / Competitive Intelligence Tools ───────────────────
  {
    type: "function" as const,
    function: {
      name: "list_battlecards",
      description: "List all competitive battlecards. Battlecards contain competitor strengths, weaknesses, our advantages, and objection handling.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter by status: 'approved' or 'draft' (default: shows both)" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "detect_competitors",
      description: "Detect competitor mentions in text. Returns list of competitor names found.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Text to scan for competitor mentions" },
        },
        required: ["text"],
      },
    },
  },

  // ─── Generated Assets / AI Drafts Tools ─────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "list_generated_assets",
      description: "List AI-generated assets (proposals, briefs, battlecards, follow-ups, etc.). Defaults to drafts pending review.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "Filter: 'draft', 'approved', 'rejected', 'sent' (default: 'draft')" },
          asset_type: {
            type: "string",
            description: "Filter by type: 'proposal', 'opportunity_brief', 'meeting_prep', 'followup', 'battlecard', 'sequence_step', 'handoff_brief', 'contract', 'sow'",
          },
          record_id: { type: "string", description: "Filter by linked record/deal UUID" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "approve_asset",
      description: "Approve an AI-generated draft asset, moving it from draft to approved.",
      parameters: {
        type: "object",
        properties: {
          asset_id: { type: "string", description: "Asset UUID to approve" },
        },
        required: ["asset_id"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "reject_asset",
      description: "Reject an AI-generated draft asset with an optional note.",
      parameters: {
        type: "object",
        properties: {
          asset_id: { type: "string", description: "Asset UUID to reject" },
          rejection_note: { type: "string", description: "Reason for rejection" },
        },
        required: ["asset_id"],
      },
    },
  },

  // ─── Dashboard / Analytics Tools ────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "get_dashboard",
      description: "Get the user's sales dashboard with pipeline value, win rate, active deals, overdue tasks, upcoming meetings, and recent activity.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_activity_timeline",
      description: "Get the activity timeline for a record (notes, emails, calls, tasks, stage changes).",
      parameters: {
        type: "object",
        properties: {
          record_id: { type: "string", description: "Record UUID" },
          limit: { type: "number", description: "Max events to return (default 20)" },
        },
        required: ["record_id"],
      },
    },
  },

  // ─── Contracts Tools ────────────────────────────────────────────────
  {
    type: "function" as const,
    function: {
      name: "list_contracts",
      description: "List contracts, optionally filtered by deal/record or status.",
      parameters: {
        type: "object",
        properties: {
          record_id: { type: "string", description: "Filter by deal/record UUID" },
          status: { type: "string", description: "Filter: 'draft', 'pending_signature', 'signed', 'expired', 'voided'" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "generate_contract",
      description: "Generate a contract from a template for a deal. Auto-populates merge fields from the deal record.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Contract title" },
          template_id: { type: "string", description: "Contract template UUID (optional — uses default if omitted)" },
          record_id: { type: "string", description: "Deal/record UUID to pull merge fields from" },
          contract_type: { type: "string", description: "Type: 'nda', 'msa', 'sow', 'proposal', 'order_form', 'custom' (default: 'sow')" },
          merge_fields: {
            type: "object",
            description: "Override merge fields (e.g., { company_name, vendor_name, effective_date })",
          },
        },
        required: ["title"],
      },
    },
  },
];

// ─── Tool Handlers ───────────────────────────────────────────────────

async function resolveObjectId(slug: string, workspaceId: string): Promise<string | null> {
  const obj = await getObjectBySlug(workspaceId, slug);
  return obj?.id ?? null;
}

export const toolHandlers: Record<string, ToolHandler> = {
  search_records: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const results = await globalSearch(ctx.workspaceId, args.query as string, {
        limit: (args.limit as number) || 20,
      });
      return { results, count: results.length };
    },
  },

  list_objects: {
    requiresConfirmation: false,
    async execute(_args, ctx) {
      const objs = await listObjects(ctx.workspaceId);
      return objs.map((o) => ({
        slug: o.slug,
        singularName: o.singularName,
        pluralName: o.pluralName,
        icon: o.icon,
        isSystem: o.isSystem,
      }));
    },
  },

  list_records: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const result = await listRecords(objectId, {
        limit: (args.limit as number) || 20,
        offset: (args.offset as number) || 0,
      });
      return { records: result.records, total: result.total };
    },
  },

  get_record: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const record = await getRecord(objectId, args.record_id as string);
      if (!record) return { error: "Record not found" };
      return record;
    },
  },

  list_tasks: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const result = await listTasks(ctx.workspaceId, ctx.userId, {
        showCompleted: (args.show_completed as boolean) || false,
        limit: (args.limit as number) || 20,
      });
      return { tasks: result.tasks, total: result.total };
    },
  },

  get_notes_for_record: {
    requiresConfirmation: false,
    async execute(args) {
      const notes = await getNotesForRecord(args.record_id as string);
      return { notes, count: notes.length };
    },
  },

  list_lists: {
    requiresConfirmation: false,
    async execute(_args, ctx) {
      const result = await listLists(ctx.workspaceId);
      return result;
    },
  },

  list_list_entries: {
    requiresConfirmation: false,
    async execute(args) {
      const result = await listListEntries(args.list_id as string, {
        limit: (args.limit as number) || 20,
        offset: (args.offset as number) || 0,
      });
      return { entries: result.entries, total: result.total };
    },
  },

  create_record: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const record = await createRecord(objectId, args.values as Record<string, unknown>, ctx.userId);
      return record;
    },
  },

  update_record: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const record = await updateRecord(
        objectId,
        args.record_id as string,
        args.values as Record<string, unknown>,
        ctx.userId
      );
      if (!record) return { error: "Record not found" };
      return record;
    },
  },

  delete_record: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const objectId = await resolveObjectId(args.object_slug as string, ctx.workspaceId);
      if (!objectId) return { error: `Object "${args.object_slug}" not found` };
      const result = await deleteRecord(objectId, args.record_id as string);
      if (!result) return { error: "Record not found" };
      return { deleted: true, id: args.record_id };
    },
  },

  create_task: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const task = await createTask(args.content as string, ctx.userId, ctx.workspaceId, {
        deadline: args.deadline as string | undefined,
        recordIds: args.record_ids as string[] | undefined,
        assigneeIds: [ctx.userId],
      });
      return task;
    },
  },

  create_note: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const content = args.content
        ? { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: args.content as string }] }] }
        : undefined;
      const note = await createNote(args.record_id as string, args.title as string, content, ctx.userId);
      return note;
    },
  },

  // ─── Sequences ────────────────────────────────────────────────────
  list_sequences: {
    requiresConfirmation: false,
    async execute(_args, ctx) {
      const seqs = await listSequences(ctx.workspaceId);
      return { sequences: seqs, count: seqs.length };
    },
  },

  get_sequence: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const seq = await getSequence(args.sequence_id as string, ctx.workspaceId);
      if (!seq) return { error: "Sequence not found" };
      return seq;
    },
  },

  create_sequence: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const seq = await createSequence(ctx.workspaceId, ctx.userId, {
        name: args.name as string,
        description: args.description as string | undefined,
      });
      return seq;
    },
  },

  add_sequence_step: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const seq = await getSequence(args.sequence_id as string, ctx.workspaceId);
      if (!seq) return { error: "Sequence not found" };

      const step = await addStep(args.sequence_id as string, ctx.workspaceId, {
        stepNumber: (args.step_number as number) ?? (seq.steps.length + 1),
        delayDays: (args.delay_days as number) ?? 0,
        subject: args.subject as string,
        body: args.body as string,
      });
      return step;
    },
  },

  enroll_in_sequence: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const enrollment = await enrollContact(
        args.sequence_id as string,
        ctx.workspaceId,
        args.contact_record_id as string
      );
      return enrollment;
    },
  },

  // ─── Battlecards / Competitive Intelligence ───────────────────────
  list_battlecards: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const approved = await listAssets(ctx.workspaceId, {
        assetType: "battlecard",
        status: (args.status as string) ?? "approved",
        limit: 100,
      });
      const drafts = !args.status
        ? await listAssets(ctx.workspaceId, { assetType: "battlecard", status: "draft", limit: 100 })
        : [];

      const all = [...approved, ...drafts].map((a) => {
        const content = (a.structuredContent ?? {}) as Record<string, unknown>;
        const meta = (a.metadata ?? {}) as Record<string, unknown>;
        return {
          id: a.id,
          competitorName: (meta.competitorName as string) ?? (content.competitor_name as string) ?? "Unknown",
          status: a.status,
          strengths: content.their_strengths ?? [],
          weaknesses: content.their_weaknesses ?? [],
          ourAdvantages: content.our_advantages ?? [],
          overview: content.competitor_overview ?? "",
          objectionHandling: content.objection_handling ?? [],
          discoveryQuestions: content.discovery_questions ?? [],
        };
      });
      return { battlecards: all, count: all.length };
    },
  },

  detect_competitors: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const competitors = await detectCompetitors(args.text as string, ctx.workspaceId);
      return { competitors, count: competitors.length };
    },
  },

  // ─── Generated Assets ─────────────────────────────────────────────
  list_generated_assets: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const assets = await listDrafts(ctx.workspaceId, {
        status: (args.status as AssetStatus) ?? ("draft" as AssetStatus),
        recordId: args.record_id as string | undefined,
      });
      // Filter by asset_type client-side if provided
      const filtered = args.asset_type
        ? assets.filter((a) => a.assetType === args.asset_type)
        : assets;
      return { assets: filtered, count: filtered.length };
    },
  },

  approve_asset: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const result = await approveDraft(args.asset_id as string, ctx.userId, ctx.workspaceId);
      if (!result) return { error: "Asset not found or already processed" };
      return { approved: true, id: result.id, status: result.status };
    },
  },

  reject_asset: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const result = await rejectDraft(
        args.asset_id as string,
        ctx.userId,
        ctx.workspaceId,
        args.rejection_note as string | undefined
      );
      if (!result) return { error: "Asset not found or already processed" };
      return { rejected: true, id: result.id, status: result.status };
    },
  },

  // ─── Dashboard / Analytics ────────────────────────────────────────
  get_dashboard: {
    requiresConfirmation: false,
    async execute(_args, ctx) {
      const dashboard = await getRepDashboard(ctx.workspaceId, ctx.userId);
      return dashboard;
    },
  },

  get_activity_timeline: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const timeline = await getActivityTimeline(
        ctx.workspaceId,
        args.record_id as string,
        null,
        (args.limit as number) ?? 20
      );
      return timeline;
    },
  },

  // ─── Contracts ────────────────────────────────────────────────────
  list_contracts: {
    requiresConfirmation: false,
    async execute(args, ctx) {
      const contracts = await listContracts(ctx.workspaceId, {
        recordId: args.record_id as string | undefined,
        status: args.status as string | undefined,
      });
      return { contracts, count: contracts.length };
    },
  },

  generate_contract: {
    requiresConfirmation: true,
    async execute(args, ctx) {
      const contract = await generateContract(ctx.workspaceId, {
        title: args.title as string,
        templateId: args.template_id as string | undefined,
        recordId: args.record_id as string | undefined,
        contractType: args.contract_type as "nda" | "msa" | "sow" | "proposal" | "order_form" | "custom" | undefined,
        mergeFields: args.merge_fields as Record<string, string> | undefined,
        generatedBy: ctx.userId,
      });
      return contract;
    },
  },
};

// ─── Message Helpers ─────────────────────────────────────────────────

export async function buildConversationMessages(conversationId: string): Promise<OpenRouterMessage[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  return rows.map((msg) => {
    const base: OpenRouterMessage = {
      role: msg.role as OpenRouterMessage["role"],
    };

    if (msg.content) base.content = msg.content;
    if (msg.toolCalls) base.tool_calls = msg.toolCalls as ToolCall[];
    if (msg.toolCallId) base.tool_call_id = msg.toolCallId;
    if (msg.toolName) base.name = msg.toolName;

    return base;
  });
}

export async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system" | "tool",
  opts: {
    content?: string | null;
    toolCalls?: unknown;
    toolCallId?: string;
    toolName?: string;
    metadata?: unknown;
  } = {}
) {
  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      role,
      content: opts.content ?? null,
      toolCalls: opts.toolCalls ?? null,
      toolCallId: opts.toolCallId ?? null,
      toolName: opts.toolName ?? null,
      metadata: opts.metadata ?? null,
    })
    .returning();

  return msg;
}

export async function generateTitle(apiKey: string, model: string, userMessage: string): Promise<string> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.BETTER_AUTH_URL || "http://localhost:3001",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: `Generate a very short title (max 6 words) for a CRM conversation that starts with this message. Return only the title, no quotes or punctuation:\n\n${userMessage}`,
          },
        ],
        max_tokens: 20,
      }),
    });

    if (!res.ok) return "New conversation";

    const data = await res.json();
    const title = data.choices?.[0]?.message?.content?.trim();
    return title || "New conversation";
  } catch {
    return "New conversation";
  }
}

// ─── Conversation CRUD ───────────────────────────────────────────────

export async function listConversations(userId: string, workspaceId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt));
}

export async function createConversation(
  userId: string,
  workspaceId: string,
  opts: { title?: string; model?: string } = {}
) {
  const [conv] = await db
    .insert(conversations)
    .values({
      userId,
      workspaceId,
      title: opts.title || "New conversation",
      model: opts.model || "anthropic/claude-sonnet-4",
    })
    .returning();

  return conv;
}

export async function getConversation(conversationId: string, userId: string) {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conv || conv.userId !== userId) return null;
  return conv;
}

export async function updateConversation(
  conversationId: string,
  userId: string,
  updates: { title?: string; model?: string }
) {
  const conv = await getConversation(conversationId, userId);
  if (!conv) return null;

  const [updated] = await db
    .update(conversations)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(conversations.id, conversationId))
    .returning();

  return updated;
}

export async function deleteConversation(conversationId: string, userId: string) {
  const conv = await getConversation(conversationId, userId);
  if (!conv) return null;

  const [deleted] = await db
    .delete(conversations)
    .where(eq(conversations.id, conversationId))
    .returning();

  return deleted;
}

export async function getConversationMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));
}

// ─── OpenRouter Streaming ────────────────────────────────────────────

export async function callOpenRouter(
  config: AIConfig,
  messages: OpenRouterMessage[],
  stream = true
) {
  return fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.BETTER_AUTH_URL || "http://localhost:3001",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: toolDefinitions,
      stream,
    }),
  });
}
