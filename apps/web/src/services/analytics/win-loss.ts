import { db } from "@/db";
import { records, objects, attributes, workspaces, notes } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────

export interface WinLossPattern {
  label: string;
  finding: string;
  wonCount: number;
  lostCount: number;
  winRate: number;
}

export interface WinLossAnalysis {
  closedWonCount: number;
  closedLostCount: number;
  overallWinRate: number;
  patterns: WinLossPattern[];
  aiNarrative: string | null;
  computedAt: Date;
  dataRange: { from: Date; to: Date };
}

interface WorkspaceSettings {
  openrouterApiKey?: string;
  openrouterModel?: string;
}

// ─── Data Volume Gate ─────────────────────────────────────────────────

/**
 * Check if workspace has enough closed deals to show meaningful analytics.
 * Minimum required: 30 closed deals.
 */
export async function hasMinimumDataVolume(workspaceId: string): Promise<{
  sufficient: boolean;
  closedCount: number;
  minimumRequired: number;
}> {
  const MINIMUM_REQUIRED = 30;

  // Get the deals object for this workspace
  const dealObject = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, "deals")))
    .limit(1);

  if (dealObject.length === 0) {
    return { sufficient: false, closedCount: 0, minimumRequired: MINIMUM_REQUIRED };
  }

  const dealObjectId = dealObject[0].id;

  // Get stage attribute for deals
  const stageAttr = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(and(eq(attributes.objectId, dealObjectId), eq(attributes.slug, "stage")))
    .limit(1);

  if (stageAttr.length === 0) {
    return { sufficient: false, closedCount: 0, minimumRequired: MINIMUM_REQUIRED };
  }

  const stageAttrId = stageAttr[0].id;

  // Count deals where stage is "Closed Won" or "Closed Lost"
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(records)
    .where(
      and(
        eq(records.objectId, dealObjectId),
        sql`EXISTS (
          SELECT 1 FROM record_values rv
          WHERE rv.record_id = records.id
            AND rv.attribute_id = ${stageAttrId}
            AND rv.text_value IN ('Closed Won', 'Closed Lost')
        )`
      )
    );

  const closedCount = result[0]?.count ?? 0;

  return {
    sufficient: closedCount >= MINIMUM_REQUIRED,
    closedCount,
    minimumRequired: MINIMUM_REQUIRED,
  };
}

// ─── Main Analysis ────────────────────────────────────────────────────

/**
 * Compute win/loss pattern analysis for a workspace.
 * Throws if insufficient data volume.
 */
export async function getWinLossPatterns(
  workspaceId: string,
  options?: { since?: Date }
): Promise<WinLossAnalysis> {
  const volumeCheck = await hasMinimumDataVolume(workspaceId);
  if (!volumeCheck.sufficient) {
    throw new Error("Insufficient data: need 30+ closed deals");
  }

  // Get deal object
  const dealObject = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, "deals")))
    .limit(1);

  const dealObjectId = dealObject[0].id;

  // Get relevant attribute IDs
  const dealAttrs = await db
    .select({ id: attributes.id, slug: attributes.slug })
    .from(attributes)
    .where(
      and(
        eq(attributes.objectId, dealObjectId),
        inArray(attributes.slug, ["stage", "amount", "close_date", "closed_at"])
      )
    );

  const attrMap = new Map(dealAttrs.map((a) => [a.slug, a.id]));
  const stageAttrId = attrMap.get("stage")!;
  const amountAttrId = attrMap.get("amount");

  // Load all closed deals with stage value
  const closedDeals = await db
    .select({
      id: records.id,
      createdAt: records.createdAt,
      updatedAt: records.updatedAt,
      stage: sql<string>`(
        SELECT rv.text_value FROM record_values rv
        WHERE rv.record_id = records.id
          AND rv.attribute_id = ${stageAttrId}
        LIMIT 1
      )`,
      amount: amountAttrId
        ? sql<string | null>`(
          SELECT rv.number_value FROM record_values rv
          WHERE rv.record_id = records.id
            AND rv.attribute_id = ${amountAttrId}
          LIMIT 1
        )`
        : sql<null>`NULL`,
    })
    .from(records)
    .where(
      and(
        eq(records.objectId, dealObjectId),
        sql`EXISTS (
          SELECT 1 FROM record_values rv
          WHERE rv.record_id = records.id
            AND rv.attribute_id = ${stageAttrId}
            AND rv.text_value IN ('Closed Won', 'Closed Lost')
        )`,
        options?.since ? sql`records.created_at >= ${options.since}` : sql`1=1`
      )
    );

  const wonDeals = closedDeals.filter((d) => d.stage === "Closed Won");
  const lostDeals = closedDeals.filter((d) => d.stage === "Closed Lost");
  const wonCount = wonDeals.length;
  const lostCount = lostDeals.length;
  const totalCount = wonCount + lostCount;
  const overallWinRate = totalCount > 0 ? wonCount / totalCount : 0;

  // Compute data range
  const allDates = closedDeals.map((d) => d.createdAt);
  const dataRange = {
    from: new Date(Math.min(...allDates.map((d) => d.getTime()))),
    to: new Date(Math.max(...allDates.map((d) => d.getTime()))),
  };

  // ─── Pattern 1: Deal size buckets ────────────────────────────────
  const patterns: WinLossPattern[] = [];

  if (amountAttrId) {
    const buckets = [
      { label: "Under $10k", min: 0, max: 10000 },
      { label: "$10k–$50k", min: 10000, max: 50000 },
      { label: "Over $50k", min: 50000, max: Infinity },
    ];

    for (const bucket of buckets) {
      const bucketDeals = closedDeals.filter((d) => {
        const amt = d.amount ? parseFloat(String(d.amount)) : null;
        if (amt === null) return false;
        return amt >= bucket.min && (bucket.max === Infinity || amt < bucket.max);
      });

      if (bucketDeals.length < 3) continue;

      const bucketWon = bucketDeals.filter((d) => d.stage === "Closed Won").length;
      const bucketLost = bucketDeals.filter((d) => d.stage === "Closed Lost").length;
      const bucketTotal = bucketWon + bucketLost;
      const bucketWinRate = bucketTotal > 0 ? bucketWon / bucketTotal : 0;

      const ratio = overallWinRate > 0 ? (bucketWinRate / overallWinRate).toFixed(1) : "N/A";

      patterns.push({
        label: "Deal size",
        finding: `${bucket.label} deals close at ${Math.round(bucketWinRate * 100)}% win rate (${ratio}x overall)`,
        wonCount: bucketWon,
        lostCount: bucketLost,
        winRate: bucketWinRate,
      });
    }
  }

  // ─── Pattern 2: Days-to-close (won vs lost) ────────────────────
  const wonDays = wonDeals.map((d) => {
    const ms = d.updatedAt.getTime() - d.createdAt.getTime();
    return ms / (1000 * 60 * 60 * 24);
  });
  const lostDays = lostDeals.map((d) => {
    const ms = d.updatedAt.getTime() - d.createdAt.getTime();
    return ms / (1000 * 60 * 60 * 24);
  });

  if (wonDays.length > 0 && lostDays.length > 0) {
    const medianWon = median(wonDays);
    const medianLost = median(lostDays);

    patterns.push({
      label: "Deal velocity",
      finding: `Won deals close in ${Math.round(medianWon)} days on average; lost deals drag to ${Math.round(medianLost)} days`,
      wonCount,
      lostCount,
      winRate: overallWinRate,
    });
  }

  // ─── Pattern 3: Engagement by notes count ─────────────────────
  const dealIds = closedDeals.map((d) => d.id);

  if (dealIds.length > 0) {
    const noteCounts = await db
      .select({
        recordId: notes.recordId,
        noteCount: sql<number>`count(*)::int`,
      })
      .from(notes)
      .where(inArray(notes.recordId, dealIds))
      .groupBy(notes.recordId);

    const noteCountMap = new Map(noteCounts.map((r) => [r.recordId, r.noteCount]));

    const engagementBuckets = [
      { label: "No notes (0)", min: 0, max: 0 },
      { label: "Low engagement (1–3 notes)", min: 1, max: 3 },
      { label: "High engagement (4+ notes)", min: 4, max: Infinity },
    ];

    for (const bucket of engagementBuckets) {
      const bucketDeals = closedDeals.filter((d) => {
        const count = noteCountMap.get(d.id) ?? 0;
        return count >= bucket.min && (bucket.max === Infinity || count <= bucket.max);
      });

      if (bucketDeals.length < 3) continue;

      const bucketWon = bucketDeals.filter((d) => d.stage === "Closed Won").length;
      const bucketLost = bucketDeals.filter((d) => d.stage === "Closed Lost").length;
      const bucketTotal = bucketWon + bucketLost;
      const bucketWinRate = bucketTotal > 0 ? bucketWon / bucketTotal : 0;

      patterns.push({
        label: "Engagement depth",
        finding: `Deals with ${bucket.label} close at ${Math.round(bucketWinRate * 100)}% vs ${Math.round(overallWinRate * 100)}% overall`,
        wonCount: bucketWon,
        lostCount: bucketLost,
        winRate: bucketWinRate,
      });
    }
  }

  // ─── AI Narrative ─────────────────────────────────────────────────
  const aiNarrative = await generateWinLossNarrative(workspaceId, {
    wonCount,
    lostCount,
    overallWinRate,
    patterns,
  });

  return {
    closedWonCount: wonCount,
    closedLostCount: lostCount,
    overallWinRate,
    patterns: patterns.slice(0, 5),
    aiNarrative,
    computedAt: new Date(),
    dataRange,
  };
}

// ─── AI Narrative Generation ──────────────────────────────────────────

async function generateWinLossNarrative(
  workspaceId: string,
  stats: {
    wonCount: number;
    lostCount: number;
    overallWinRate: number;
    patterns: WinLossPattern[];
  }
): Promise<string | null> {
  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const settings = (workspace?.settings ?? {}) as WorkspaceSettings;
  const apiKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY;

  if (!apiKey) return null;

  const model =
    settings.openrouterModel ||
    process.env.OPENROUTER_MODEL ||
    "anthropic/claude-haiku-3";

  const topPatterns = stats.patterns.slice(0, 2);
  const statsPayload = {
    overall_win_rate: `${Math.round(stats.overallWinRate * 100)}%`,
    won_count: stats.wonCount,
    lost_count: stats.lostCount,
    patterns: topPatterns.map((p) => ({
      category: p.label,
      finding: p.finding,
      win_rate: `${Math.round(p.winRate * 100)}%`,
    })),
  };

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
        "X-Title": "OpenClaw CRM Analytics",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a sales analytics assistant. Generate a 2-3 sentence plain-English narrative identifying the top 2 patterns from the provided win/loss statistics. Be specific and actionable. Do not use the company or workspace name. Reference specific percentages and numbers from the data.",
          },
          {
            role: "user",
            content: `Here are the win/loss statistics:\n${JSON.stringify(statsPayload, null, 2)}\n\nGenerate a 2-3 sentence narrative identifying the key patterns.`,
          },
        ],
        max_tokens: 200,
        stream: false,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
