/**
 * Close flow service.
 *
 * When a deal is marked closed-won:
 * 1. Detect the stage change
 * 2. Generate a customer handoff brief from deal context
 * 3. Store the brief as a generated asset (pending review)
 * 4. Optionally deliver via webhook to external CS tools
 *
 * The handoff brief includes:
 * - Deal summary (value, contacts, timeline, key stakeholders)
 * - Product/service summary
 * - Commercial terms (price, payment terms, start date)
 * - Key context and notes from the deal
 * - Next steps for the CS team
 */

import { db } from "@/db";
import { generatedAssets } from "@/db/schema/generated-assets";
import { records, recordValues, attributes, notes } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { batchGetRecordDisplayNames } from "./display-names";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract plain text from TipTap/ProseMirror JSON content */
function extractTipTapText(node: Record<string, unknown>): string {
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }
  if (Array.isArray(node.content)) {
    return (node.content as Record<string, unknown>[]).map(extractTipTapText).join(" ");
  }
  return "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HandoffBriefContext {
  dealId: string;
  dealName: string;
  companyName: string | null;
  contactNames: string[];
  dealValue: number | null;
  stage: string | null;
  closeDate: string | null;
  startDate: string | null;
  description: string | null;
  notes: string[];
  repName: string | null;
}

export interface CloseFlowResult {
  assetId: string;
  briefContent: string;
  webhookDelivered: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detect if a stage value represents a closed-won deal.
 */
export function isClosedWonStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  const s = stage.toLowerCase().trim();
  return (
    s === "closed-won" ||
    s === "closed won" ||
    s === "won" ||
    s === "closed/won" ||
    s.includes("closed") && s.includes("won")
  );
}

/**
 * Load all relevant context for a deal record for the handoff brief.
 */
async function loadDealContext(
  workspaceId: string,
  dealId: string
): Promise<HandoffBriefContext> {
  // 1. Get the deal record
  const dealRecord = await db
    .select({ id: records.id, objectId: records.objectId, createdBy: records.createdBy })
    .from(records)
    .where(eq(records.id, dealId))
    .limit(1);

  if (dealRecord.length === 0) {
    return {
      dealId,
      dealName: "Unknown Deal",
      companyName: null,
      contactNames: [],
      dealValue: null,
      stage: null,
      closeDate: null,
      startDate: null,
      description: null,
      notes: [],
      repName: null,
    };
  }

  const rec = dealRecord[0];

  // 2. Load attributes for this object
  const attrs = await db
    .select({ id: attributes.id, slug: attributes.slug, type: attributes.type })
    .from(attributes)
    .where(eq(attributes.objectId, rec.objectId));

  const attrBySlug = new Map(attrs.map((a) => [a.slug, a]));

  // 3. Load record values
  const valueRows = await db
    .select({
      attributeId: recordValues.attributeId,
      textValue: recordValues.textValue,
      numberValue: recordValues.numberValue,
      dateValue: recordValues.dateValue,
      referencedRecordId: recordValues.referencedRecordId,
    })
    .from(recordValues)
    .where(eq(recordValues.recordId, dealId));

  const valuesByAttr = new Map<string, typeof valueRows[0]>();
  for (const v of valueRows) {
    valuesByAttr.set(v.attributeId, v);
  }

  function getTextVal(slug: string): string | null {
    const attr = attrBySlug.get(slug);
    if (!attr) return null;
    return valuesByAttr.get(attr.id)?.textValue ?? null;
  }

  function getNumberVal(slug: string): number | null {
    const attr = attrBySlug.get(slug);
    if (!attr) return null;
    const n = valuesByAttr.get(attr.id)?.numberValue;
    return n != null ? Number(n) : null;
  }

  function getDateVal(slug: string): string | null {
    const attr = attrBySlug.get(slug);
    if (!attr) return null;
    return valuesByAttr.get(attr.id)?.dateValue ?? null;
  }

  function getRefId(slug: string): string | null {
    const attr = attrBySlug.get(slug);
    if (!attr) return null;
    return valuesByAttr.get(attr.id)?.referencedRecordId ?? null;
  }

  // 4. Extract deal name and key fields
  const dealName =
    getTextVal("name") ??
    getTextVal("deal-name") ??
    getTextVal("title") ??
    "Unnamed Deal";

  const stage =
    getTextVal("stage") ??
    getTextVal("deal-stage") ??
    getTextVal("status");

  const dealValue =
    getNumberVal("value") ??
    getNumberVal("deal-value") ??
    getNumberVal("amount");

  const closeDate =
    getDateVal("close-date") ??
    getDateVal("close_date") ??
    getDateVal("expected-close");

  const startDate =
    getDateVal("start-date") ??
    getDateVal("start_date") ??
    getDateVal("kickoff-date");

  const description =
    getTextVal("description") ??
    getTextVal("notes") ??
    getTextVal("summary");

  // 5. Resolve company name via reference
  const companyRefId = getRefId("company") ?? getRefId("account") ?? getRefId("company-id");
  let companyName: string | null = null;
  if (companyRefId) {
    const nameMap = await batchGetRecordDisplayNames([companyRefId]);
    companyName = nameMap.get(companyRefId)?.displayName ?? null;
  }

  // 6. Load notes for context (TipTap JSON — extract text content)
  const notesList: string[] = [];
  try {
    const noteRows = await db
      .select({ title: notes.title, content: notes.content })
      .from(notes)
      .where(eq(notes.recordId, dealId))
      .orderBy(desc(notes.updatedAt))
      .limit(5);

    for (const note of noteRows) {
      // Extract plain text from TipTap JSON
      const content = note.content;
      if (typeof content === "string") {
        notesList.push(content.slice(0, 500));
      } else if (content && typeof content === "object") {
        // Recursively extract text nodes from TipTap JSON
        const text = extractTipTapText(content as Record<string, unknown>);
        if (text.trim()) notesList.push(text.slice(0, 500));
      }
    }
  } catch {}

  const notesSummary = notesList.slice(0, 3);

  // 7. Get rep name
  let repName: string | null = null;
  if (rec.createdBy) {
    try {
      const userRows = Array.from(await db.execute(
        sql`SELECT name FROM "user" WHERE id = ${rec.createdBy}`
      )) as { name: string }[];
      repName = userRows[0]?.name ?? null;
    } catch {}
  }

  return {
    dealId,
    dealName,
    companyName,
    contactNames: [], // TODO: load from contact references when available
    dealValue,
    stage,
    closeDate,
    startDate,
    description,
    notes: notesSummary,
    repName,
  };
}

// ─── Brief generation ─────────────────────────────────────────────────────────

/**
 * Generate the handoff brief markdown content.
 */
function generateHandoffBriefContent(ctx: HandoffBriefContext): string {
  const lines: string[] = [];
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  lines.push(`# Customer Handoff Brief`);
  lines.push(`**Deal:** ${ctx.dealName}`);
  lines.push(`**Date:** ${date}`);
  lines.push(`**Generated by:** OpenClaw CRM`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // Deal Summary
  lines.push("## Deal Summary");
  lines.push("");
  if (ctx.companyName) lines.push(`**Company:** ${ctx.companyName}`);
  if (ctx.dealValue) {
    lines.push(`**Deal Value:** $${ctx.dealValue.toLocaleString()}`);
  }
  if (ctx.closeDate) lines.push(`**Close Date:** ${ctx.closeDate}`);
  if (ctx.startDate) lines.push(`**Start Date:** ${ctx.startDate}`);
  if (ctx.repName) lines.push(`**Account Executive:** ${ctx.repName}`);
  lines.push("");

  // Description
  if (ctx.description) {
    lines.push("## Project Overview");
    lines.push("");
    lines.push(ctx.description);
    lines.push("");
  }

  // Key context from notes
  if (ctx.notes.length > 0) {
    lines.push("## Key Deal Context");
    lines.push("");
    lines.push("The following notes from the sales process capture important context for onboarding:");
    lines.push("");
    for (const note of ctx.notes) {
      lines.push(`> ${note.slice(0, 500)}`);
      lines.push("");
    }
  }

  // Next steps
  lines.push("## Recommended Next Steps for CS Team");
  lines.push("");
  lines.push("1. **Schedule kickoff call** — Reach out to the customer within 24 hours to schedule an onboarding kickoff");
  if (ctx.startDate) {
    lines.push(`2. **Confirm start date** — Align on the agreed start date of ${ctx.startDate}`);
  } else {
    lines.push("2. **Confirm start date** — Work with customer to lock in a project start date");
  }
  lines.push("3. **Review commercial terms** — Ensure all contractual obligations are understood");
  lines.push("4. **Introduce CS team** — Make warm introduction to the customer success manager");
  lines.push("5. **Set up workspace** — Provision the customer environment and share access credentials");
  lines.push("");

  // Commercial terms
  lines.push("## Commercial Terms");
  lines.push("");
  if (ctx.dealValue) {
    lines.push(`- **Contract Value:** $${ctx.dealValue.toLocaleString()}`);
  }
  lines.push("- **Payment Terms:** As per executed contract");
  lines.push("- **Support Level:** Standard");
  lines.push("");

  lines.push("---");
  lines.push("*This brief was auto-generated from CRM data at close. Please verify all details with the account executive before the kickoff call.*");

  return lines.join("\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Trigger the close flow for a deal that has just been marked closed-won.
 *
 * Called from the record update API when a stage attribute changes to a closed-won value.
 */
export async function triggerCloseFlow(
  workspaceId: string,
  dealId: string,
  triggeredBy: string
): Promise<CloseFlowResult | null> {
  try {
    // Load deal context
    const ctx = await loadDealContext(workspaceId, dealId);

    // Generate brief content
    const briefContent = generateHandoffBriefContent(ctx);

    // Store as generated asset (pending review)
    const [asset] = await db
      .insert(generatedAssets)
      .values({
        workspaceId,
        recordId: dealId,
        assetType: "handoff_brief",
        status: "draft",
        title: `Handoff Brief: ${ctx.dealName}`,
        content: briefContent,
        structuredContent: {
          dealName: ctx.dealName,
          companyName: ctx.companyName,
          dealValue: ctx.dealValue,
          stage: ctx.stage,
          closeDate: ctx.closeDate,
          repName: ctx.repName,
        },
        generatedBy: triggeredBy,
        generationMetadata: {
          trigger: "closed_won",
          triggeredAt: new Date().toISOString(),
          triggeredBy,
        },
      })
      .returning();

    return {
      assetId: asset.id,
      briefContent,
      webhookDelivered: false,
    };
  } catch (err) {
    console.error("[close-flow] Failed to trigger close flow:", err);
    return null;
  }
}

/**
 * Deliver a handoff brief via webhook to an external CS tool.
 * Called when the asset is approved.
 */
export async function deliverHandoffBriefViaWebhook(
  workspaceId: string,
  assetId: string,
  webhookUrl: string
): Promise<boolean> {
  const asset = await db
    .select()
    .from(generatedAssets)
    .where(and(eq(generatedAssets.id, assetId), eq(generatedAssets.workspaceId, workspaceId)))
    .limit(1);

  if (!asset[0]) return false;

  try {
    const payload = {
      event: "deal.closed_won.handoff_brief",
      asset: {
        id: assetId,
        title: asset[0].title,
        content: asset[0].content,
        structuredData: asset[0].structuredContent,
        generatedAt: asset[0].createdAt,
      },
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "OpenClaw-CRM/1.0",
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      // Update asset status to delivered
      await db
        .update(generatedAssets)
        .set({ status: "delivered", updatedAt: new Date() })
        .where(eq(generatedAssets.id, assetId));
      return true;
    }
  } catch (err) {
    console.error("[close-flow] Webhook delivery failed:", err);
  }

  return false;
}

/**
 * List handoff briefs (generated assets of type handoff_brief) for a workspace.
 */
export async function listHandoffBriefs(workspaceId: string, dealId?: string) {
  const conditions = [
    eq(generatedAssets.workspaceId, workspaceId),
    eq(generatedAssets.assetType, "handoff_brief"),
  ];

  if (dealId) {
    conditions.push(eq(generatedAssets.recordId, dealId));
  }

  return db
    .select()
    .from(generatedAssets)
    .where(and(...conditions))
    .orderBy(generatedAssets.createdAt);
}
