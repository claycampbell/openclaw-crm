import { db } from "@/db";
import { records, objects, attributes, workspaces, notes, taskRecords } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────

export interface RepDeviation {
  metric: string;
  repValue: number;
  baselineValue: number;
  delta: number;
  unit: string;
}

export interface RepMetrics {
  userId: string;
  closedWonCount: number;
  closedLostCount: number;
  winRate: number;
  medianDaysToClose: number | null;
  notesPerDeal: number;
  tasksPerDeal: number;
  isTopPerformer: boolean;
  deviations: RepDeviation[];
  coachingTip: string | null;
}

export interface TopPerformerBaseline {
  avgWinRate: number;
  avgNotesPerDeal: number;
  avgTasksPerDeal: number;
  medianDaysToClose: number;
}

export interface RepCoachingReport {
  workspaceRepCount: number;
  topPerformerBaseline: TopPerformerBaseline;
  reps: RepMetrics[];
  computedAt: Date;
}

interface WorkspaceSettings {
  openrouterApiKey?: string;
  openrouterModel?: string;
}

// ─── Data Volume Gate ─────────────────────────────────────────────────

/**
 * Check if workspace has enough reps with closed deals for cohort analysis.
 * Minimum required: 2 reps.
 */
export async function hasCoachingDataVolume(workspaceId: string): Promise<{
  sufficient: boolean;
  repCount: number;
  minimumRequired: number;
}> {
  const MINIMUM_REQUIRED = 2;

  const dealObject = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, "deals")))
    .limit(1);

  if (dealObject.length === 0) {
    return { sufficient: false, repCount: 0, minimumRequired: MINIMUM_REQUIRED };
  }

  const dealObjectId = dealObject[0].id;

  const stageAttr = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(and(eq(attributes.objectId, dealObjectId), eq(attributes.slug, "stage")))
    .limit(1);

  if (stageAttr.length === 0) {
    return { sufficient: false, repCount: 0, minimumRequired: MINIMUM_REQUIRED };
  }

  const stageAttrId = stageAttr[0].id;

  // Count distinct reps (createdBy) who have at least one closed deal
  const result = await db
    .select({ repCount: sql<number>`count(distinct records.created_by)::int` })
    .from(records)
    .where(
      and(
        eq(records.objectId, dealObjectId),
        sql`records.created_by IS NOT NULL`,
        sql`EXISTS (
          SELECT 1 FROM record_values rv
          WHERE rv.record_id = records.id
            AND rv.attribute_id = ${stageAttrId}
            AND rv.text_value IN ('Closed Won', 'Closed Lost')
        )`
      )
    );

  const repCount = result[0]?.repCount ?? 0;

  return {
    sufficient: repCount >= MINIMUM_REQUIRED,
    repCount,
    minimumRequired: MINIMUM_REQUIRED,
  };
}

// ─── Main Analysis ────────────────────────────────────────────────────

/**
 * Compute per-rep coaching recommendations for a workspace.
 * Throws if insufficient data volume.
 */
export async function getRepCoachingRecommendations(
  workspaceId: string
): Promise<RepCoachingReport> {
  const volumeCheck = await hasCoachingDataVolume(workspaceId);
  if (!volumeCheck.sufficient) {
    throw new Error("Insufficient data: need 2+ reps with closed deals");
  }

  // Get the deals object
  const dealObject = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, "deals")))
    .limit(1);

  const dealObjectId = dealObject[0].id;

  const stageAttr = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(and(eq(attributes.objectId, dealObjectId), eq(attributes.slug, "stage")))
    .limit(1);

  const stageAttrId = stageAttr[0].id;

  // Get all deals with stage info grouped by creator (rep)
  const dealsByRep = await db
    .select({
      repId: records.createdBy,
      dealId: records.id,
      createdAt: records.createdAt,
      updatedAt: records.updatedAt,
      stage: sql<string>`(
        SELECT rv.text_value FROM record_values rv
        WHERE rv.record_id = records.id
          AND rv.attribute_id = ${stageAttrId}
        LIMIT 1
      )`,
    })
    .from(records)
    .where(
      and(
        eq(records.objectId, dealObjectId),
        sql`records.created_by IS NOT NULL`
      )
    );

  // Group deals by rep
  const repDealMap = new Map<
    string,
    Array<{ dealId: string; createdAt: Date; updatedAt: Date; stage: string }>
  >();

  for (const deal of dealsByRep) {
    if (!deal.repId) continue;
    if (!repDealMap.has(deal.repId)) repDealMap.set(deal.repId, []);
    repDealMap.get(deal.repId)!.push({
      dealId: deal.dealId,
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
      stage: deal.stage ?? "",
    });
  }

  // Get all deal IDs to batch-query notes and tasks
  const allDealIds = dealsByRep.map((d) => d.dealId);

  // Note counts per deal
  const noteCountsRaw =
    allDealIds.length > 0
      ? await db
          .select({
            recordId: notes.recordId,
            count: sql<number>`count(*)::int`,
          })
          .from(notes)
          .where(inArray(notes.recordId, allDealIds))
          .groupBy(notes.recordId)
      : [];

  const noteCountMap = new Map(noteCountsRaw.map((r) => [r.recordId, r.count]));

  // Task counts per deal (via taskRecords join)
  const taskCountsRaw =
    allDealIds.length > 0
      ? await db
          .select({
            recordId: taskRecords.recordId,
            count: sql<number>`count(*)::int`,
          })
          .from(taskRecords)
          .where(inArray(taskRecords.recordId, allDealIds))
          .groupBy(taskRecords.recordId)
      : [];

  const taskCountMap = new Map(taskCountsRaw.map((r) => [r.recordId, r.count]));

  // ─── Compute per-rep metrics ─────────────────────────────────────
  interface RawRepMetrics {
    userId: string;
    totalDeals: number;
    closedWonCount: number;
    closedLostCount: number;
    winRate: number;
    daysToCloseWon: number[];
    totalNotes: number;
    totalTasks: number;
    notesPerDeal: number;
    tasksPerDeal: number;
    medianDaysToClose: number | null;
  }

  const rawMetrics: RawRepMetrics[] = [];

  for (const [repId, repDeals] of repDealMap.entries()) {
    const wonDeals = repDeals.filter((d) => d.stage === "Closed Won");
    const lostDeals = repDeals.filter((d) => d.stage === "Closed Lost");

    const totalDeals = repDeals.length;
    const closedWon = wonDeals.length;
    const closedLost = lostDeals.length;
    const closed = closedWon + closedLost;
    const winRate = closed > 0 ? closedWon / closed : 0;

    // Days to close for won deals
    const daysToCloseWon = wonDeals.map((d) => {
      return (d.updatedAt.getTime() - d.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    });

    const medianDays = daysToCloseWon.length > 0 ? median(daysToCloseWon) : null;

    // Notes and tasks
    let totalNotes = 0;
    let totalTasks = 0;
    for (const deal of repDeals) {
      totalNotes += noteCountMap.get(deal.dealId) ?? 0;
      totalTasks += taskCountMap.get(deal.dealId) ?? 0;
    }

    rawMetrics.push({
      userId: repId,
      totalDeals,
      closedWonCount: closedWon,
      closedLostCount: closedLost,
      winRate,
      daysToCloseWon,
      totalNotes,
      totalTasks,
      notesPerDeal: totalDeals > 0 ? totalNotes / totalDeals : 0,
      tasksPerDeal: totalDeals > 0 ? totalTasks / totalDeals : 0,
      medianDaysToClose: medianDays,
    });
  }

  // Sort by win rate descending
  rawMetrics.sort((a, b) => b.winRate - a.winRate);

  // ─── Identify top performers ─────────────────────────────────────
  const repCount = rawMetrics.length;
  // Top quartile, or top 1 if fewer than 4 reps
  const topCount = repCount >= 4 ? Math.ceil(repCount / 4) : 1;
  const topPerformerIds = new Set(
    rawMetrics.slice(0, topCount).map((r) => r.userId)
  );

  // Compute top performer baseline averages
  const topReps = rawMetrics.filter((r) => topPerformerIds.has(r.userId));
  const baseline: TopPerformerBaseline = {
    avgWinRate: avg(topReps.map((r) => r.winRate)),
    avgNotesPerDeal: avg(topReps.map((r) => r.notesPerDeal)),
    avgTasksPerDeal: avg(topReps.map((r) => r.tasksPerDeal)),
    medianDaysToClose:
      median(topReps.flatMap((r) => r.daysToCloseWon).filter((d) => d > 0)),
  };

  // ─── AI coaching tips ─────────────────────────────────────────────
  const aiConfig = await getAIConfig(workspaceId);

  // ─── Assemble final rep metrics ──────────────────────────────────
  const reps: RepMetrics[] = [];

  for (const rm of rawMetrics) {
    const isTop = topPerformerIds.has(rm.userId);

    // Compute deviations for non-top performers
    const deviations: RepDeviation[] = [];

    if (!isTop) {
      const winRateDelta = baseline.avgWinRate - rm.winRate;
      if (Math.abs(winRateDelta) > 0.05) {
        deviations.push({
          metric: "Win rate",
          repValue: rm.winRate,
          baselineValue: baseline.avgWinRate,
          delta: winRateDelta,
          unit: "%",
        });
      }

      const notesDelta = baseline.avgNotesPerDeal - rm.notesPerDeal;
      if (Math.abs(notesDelta) > 0.5) {
        deviations.push({
          metric: "Notes per deal",
          repValue: rm.notesPerDeal,
          baselineValue: baseline.avgNotesPerDeal,
          delta: notesDelta,
          unit: "notes",
        });
      }

      const tasksDelta = baseline.avgTasksPerDeal - rm.tasksPerDeal;
      if (Math.abs(tasksDelta) > 0.5) {
        deviations.push({
          metric: "Tasks per deal",
          repValue: rm.tasksPerDeal,
          baselineValue: baseline.avgTasksPerDeal,
          delta: tasksDelta,
          unit: "tasks",
        });
      }

      if (rm.medianDaysToClose !== null && baseline.medianDaysToClose > 0) {
        const daysDelta = rm.medianDaysToClose - baseline.medianDaysToClose;
        if (Math.abs(daysDelta) > 2) {
          deviations.push({
            metric: "Days to close",
            repValue: rm.medianDaysToClose,
            baselineValue: baseline.medianDaysToClose,
            delta: daysDelta,
            unit: "days",
          });
        }
      }

      // Sort by largest absolute delta first, take top 2
      deviations.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }

    // Generate AI coaching tip (anonymized — no names passed to LLM)
    let coachingTip: string | null = null;
    if (!isTop && deviations.length > 0 && aiConfig) {
      coachingTip = await generateCoachingTip(deviations.slice(0, 2), baseline, aiConfig);
    }

    reps.push({
      userId: rm.userId,
      closedWonCount: rm.closedWonCount,
      closedLostCount: rm.closedLostCount,
      winRate: rm.winRate,
      medianDaysToClose: rm.medianDaysToClose,
      notesPerDeal: rm.notesPerDeal,
      tasksPerDeal: rm.tasksPerDeal,
      isTopPerformer: isTop,
      deviations: deviations.slice(0, 2),
      coachingTip,
    });
  }

  // Sort: top performers first, then by worst win rate
  reps.sort((a, b) => {
    if (a.isTopPerformer && !b.isTopPerformer) return -1;
    if (!a.isTopPerformer && b.isTopPerformer) return 1;
    return b.winRate - a.winRate;
  });

  return {
    workspaceRepCount: repCount,
    topPerformerBaseline: baseline,
    reps,
    computedAt: new Date(),
  };
}

// ─── AI Coaching Tip ──────────────────────────────────────────────────

interface AIConfig {
  apiKey: string;
  model: string;
}

async function getAIConfig(workspaceId: string): Promise<AIConfig | null> {
  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const settings = (workspace?.settings ?? {}) as WorkspaceSettings;
  const apiKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    model:
      settings.openrouterModel ||
      process.env.OPENROUTER_MODEL ||
      "anthropic/claude-haiku-3",
  };
}

async function generateCoachingTip(
  deviations: RepDeviation[],
  baseline: TopPerformerBaseline,
  config: AIConfig
): Promise<string | null> {
  // Only pass anonymized metric data — no rep names or workspace names
  const metricsPayload = deviations.map((d) => ({
    metric: d.metric,
    rep_value: roundTo(d.repValue, 2),
    top_performer_value: roundTo(d.baselineValue, 2),
    delta: roundTo(d.delta, 2),
    unit: d.unit,
  }));

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
        "X-Title": "OpenClaw CRM Analytics",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You are a sales performance coach. Given anonymized metric deviations, generate a single-sentence specific coaching tip. Reference the metric name and delta. Be concrete, not generic. Do not mention rep names or company names.",
          },
          {
            role: "user",
            content: `Metrics where this rep deviates from top performers:\n${JSON.stringify(metricsPayload, null, 2)}\n\nGenerate one coaching tip sentence.`,
          },
        ],
        max_tokens: 100,
        stream: false,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data?.choices?.[0]?.message?.content?.trim() ?? null;
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

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function roundTo(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}
