/**
 * Asset registry — defines asset types, tier assignments, and CRUD for generated_assets.
 */
import { db } from "@/db";
import { generatedAssets } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import type { AssetType, AssetStatus, ContextTier, GeneratedAsset } from "@/db/schema/documents";

// ─── Asset Type Constants ─────────────────────────────────────────────────────

export const ASSET_TYPES = [
  "opportunity_brief",
  "proposal",
  "deck",
  "meeting_prep",
  "followup",
  "battlecard",
  "sequence_step",
] as const;

/**
 * Maps asset type to the context tier used for generation.
 * light = compact context, haiku-class model, low cost
 * full  = rich context, full model, rate-limited
 */
export const ASSET_TIER_MAP: Record<AssetType, ContextTier> = {
  opportunity_brief: "light",
  followup: "light",
  meeting_prep: "light",
  sequence_step: "light",
  proposal: "full",
  deck: "full",
  battlecard: "full",
  // Legacy Phase 1/4 types
  handoff_brief: "full",
  contract: "full",
  sow: "full",
  follow_up: "light",
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  opportunity_brief: "Opportunity Brief",
  proposal: "Proposal",
  deck: "Presentation Deck",
  meeting_prep: "Meeting Prep Brief",
  followup: "Follow-Up Draft",
  battlecard: "Battlecard",
  sequence_step: "Sequence Step",
  // Legacy Phase 1/4 types
  handoff_brief: "Handoff Brief",
  contract: "Contract",
  sow: "Statement of Work",
  follow_up: "Follow-Up",
};

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Insert a new generated_assets row with status: "draft".
 * All AI generation must call this — never write assets directly.
 */
export async function createDraftAsset(
  workspaceId: string,
  recordId: string,
  assetType: AssetType,
  content: Record<string, unknown>,
  modelUsed: string | null,
  promptVersion: string,
  metadata?: Record<string, unknown>
): Promise<GeneratedAsset> {
  // Build a markdown preview from the content for display
  const contentMd = buildMarkdownPreview(assetType, content);

  const [asset] = await db
    .insert(generatedAssets)
    .values({
      workspaceId,
      recordId,
      assetType,
      status: "draft",
      structuredContent: content,
      contentMd,
      modelUsed,
      promptVersion,
      contextTier: ASSET_TIER_MAP[assetType],
      metadata,
    })
    .returning();

  return asset;
}

/**
 * Approve a draft asset. Sets status: "approved", records who approved and when.
 */
export async function approveAsset(
  assetId: string,
  userId: string
): Promise<GeneratedAsset | null> {
  const [asset] = await db
    .update(generatedAssets)
    .set({
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date(),
    })
    .where(eq(generatedAssets.id, assetId))
    .returning();

  return asset ?? null;
}

/**
 * Reject (archive) a draft asset.
 */
export async function rejectAsset(
  assetId: string,
  userId: string
): Promise<GeneratedAsset | null> {
  const [asset] = await db
    .update(generatedAssets)
    .set({
      status: "rejected",
      rejectedBy: userId,
      rejectedAt: new Date(),
    })
    .where(eq(generatedAssets.id, assetId))
    .returning();

  return asset ?? null;
}

/**
 * List assets for the workspace. Defaults to draft status.
 * Supports optional status and recordId filters.
 */
export async function listAssets(
  workspaceId: string,
  options: {
    status?: string;
    recordId?: string;
    assetType?: AssetType;
    limit?: number;
  } = {}
): Promise<GeneratedAsset[]> {
  const { status = "draft", recordId, assetType, limit = 50 } = options;

  const conditions = [
    eq(generatedAssets.workspaceId, workspaceId),
    eq(generatedAssets.status, status as AssetStatus),
  ];

  if (recordId) {
    conditions.push(eq(generatedAssets.recordId, recordId));
  }
  if (assetType) {
    conditions.push(eq(generatedAssets.assetType, assetType));
  }

  return db
    .select()
    .from(generatedAssets)
    .where(and(...conditions))
    .orderBy(desc(generatedAssets.generatedAt))
    .limit(limit);
}

/**
 * Get a single asset, enforcing workspace scope.
 */
export async function getAsset(
  assetId: string,
  workspaceId: string
): Promise<GeneratedAsset | null> {
  const [asset] = await db
    .select()
    .from(generatedAssets)
    .where(
      and(
        eq(generatedAssets.id, assetId),
        eq(generatedAssets.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return asset ?? null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a simple markdown preview from structured content.
 * Used for display in the approval inbox.
 */
function buildMarkdownPreview(
  assetType: AssetType,
  content: Record<string, unknown>
): string {
  try {
    switch (assetType) {
      case "opportunity_brief": {
        const c = content as {
          prospect_summary?: string;
          deal_overview?: string;
          fit_reasons?: string[];
          next_steps?: string[];
          risks?: string[];
        };
        const parts: string[] = [];
        if (c.prospect_summary) parts.push(`**Prospect:** ${c.prospect_summary}`);
        if (c.deal_overview) parts.push(`**Deal:** ${c.deal_overview}`);
        if (c.fit_reasons?.length) {
          parts.push(`**Fit Reasons:**\n${c.fit_reasons.map((r) => `- ${r}`).join("\n")}`);
        }
        if (c.next_steps?.length) {
          parts.push(`**Next Steps:**\n${c.next_steps.map((s) => `- ${s}`).join("\n")}`);
        }
        if (c.risks?.length) {
          parts.push(`**Risks:**\n${c.risks.map((r) => `- ${r}`).join("\n")}`);
        }
        return parts.join("\n\n");
      }

      case "proposal": {
        const c = content as {
          executive_summary?: string;
          key_benefits?: string[];
          next_steps?: string;
        };
        const parts: string[] = [];
        if (c.executive_summary) parts.push(`**Executive Summary**\n\n${c.executive_summary}`);
        if (c.key_benefits?.length) {
          parts.push(`**Key Benefits:**\n${c.key_benefits.map((b) => `- ${b}`).join("\n")}`);
        }
        if (c.next_steps) parts.push(`**Next Steps:** ${c.next_steps}`);
        return parts.join("\n\n");
      }

      case "deck": {
        const c = content as {
          title_slide?: { title?: string; subtitle?: string };
          slides?: Array<{ title?: string }>;
        };
        const parts: string[] = [];
        if (c.title_slide?.title) parts.push(`**${c.title_slide.title}**`);
        if (c.title_slide?.subtitle) parts.push(c.title_slide.subtitle);
        if (c.slides?.length) {
          parts.push(`**Slides (${c.slides.length}):**\n${c.slides.map((s, i) => `${i + 1}. ${s.title}`).join("\n")}`);
        }
        return parts.join("\n\n");
      }

      case "meeting_prep": {
        const c = content as {
          meeting_overview?: { title?: string; time?: string };
          talking_points?: string[];
          key_questions_to_ask?: string[];
        };
        const parts: string[] = [];
        if (c.meeting_overview?.title) parts.push(`**Meeting:** ${c.meeting_overview.title}`);
        if (c.talking_points?.length) {
          parts.push(`**Talking Points:**\n${c.talking_points.map((p) => `- ${p}`).join("\n")}`);
        }
        if (c.key_questions_to_ask?.length) {
          parts.push(`**Questions to Ask:**\n${c.key_questions_to_ask.map((q) => `- ${q}`).join("\n")}`);
        }
        return parts.join("\n\n");
      }

      case "followup":
      case "sequence_step": {
        const c = content as {
          subject_line?: string;
          email_body?: string;
        };
        const parts: string[] = [];
        if (c.subject_line) parts.push(`**Subject:** ${c.subject_line}`);
        if (c.email_body) parts.push(c.email_body);
        return parts.join("\n\n");
      }

      case "battlecard": {
        const c = content as {
          competitor_name?: string;
          competitor_overview?: string;
          our_advantages?: string[];
        };
        const parts: string[] = [];
        if (c.competitor_name) parts.push(`# Battlecard: ${c.competitor_name}`);
        if (c.competitor_overview) parts.push(c.competitor_overview);
        if (c.our_advantages?.length) {
          parts.push(`**Our Advantages:**\n${c.our_advantages.map((a) => `- ${a}`).join("\n")}`);
        }
        return parts.join("\n\n");
      }

      default:
        return JSON.stringify(content, null, 2);
    }
  } catch {
    return "";
  }
}
