import { db } from "@/db";
import { records, objects, attributes, workspaces } from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────

export interface ForecastStage {
  stageName: string;
  dealCount: number;
  totalValue: number;
  historicalCloseRate: number;
  aiConfidenceScore: number;
  aiConfidenceReasoning: string | null;
  aiWeightedValue: number;
}

export interface PipelineForecast {
  insufficient?: boolean;
  stages?: ForecastStage[];
  totalPipelineValue?: number;
  totalAiWeightedValue?: number;
  computedAt?: Date;
}

interface WorkspaceSettings {
  openrouterApiKey?: string;
  openrouterModel?: string;
}

// ─── Stage position weights (later stages = higher confidence) ────────
// Applied as a multiplier on top of overall win rate when per-stage data is thin
const STAGE_POSITION_MULTIPLIERS: Record<string, number> = {
  Discovery: 0.6,
  Qualified: 0.7,
  Proposal: 0.8,
  Demo: 0.75,
  Negotiation: 0.9,
  "Contract Sent": 0.92,
  // Custom stages fall back to 0.7
};

// ─── Main Service ─────────────────────────────────────────────────────

/**
 * Compute pipeline forecast for a workspace.
 * Returns insufficient=true if no closed deals exist.
 */
export async function getPipelineForecast(workspaceId: string): Promise<PipelineForecast> {
  // Get the deals object
  const dealObject = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, "deals")))
    .limit(1);

  if (dealObject.length === 0) {
    return { insufficient: true };
  }

  const dealObjectId = dealObject[0].id;

  // Get attribute IDs for stage and amount
  const dealAttrs = await db
    .select({ id: attributes.id, slug: attributes.slug })
    .from(attributes)
    .where(
      and(eq(attributes.objectId, dealObjectId), inArray(attributes.slug, ["stage", "amount"]))
    );

  const attrMap = new Map(dealAttrs.map((a) => [a.slug, a.id]));
  const stageAttrId = attrMap.get("stage");
  const amountAttrId = attrMap.get("amount");

  if (!stageAttrId) {
    return { insufficient: true };
  }

  // Check if any closed deals exist (required for historical rates)
  const closedCheck = await db
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

  if ((closedCheck[0]?.count ?? 0) === 0) {
    return { insufficient: true };
  }

  // Load all closed deals with their stage to compute historical win rate
  const closedDeals = await db
    .select({
      id: records.id,
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
        sql`EXISTS (
          SELECT 1 FROM record_values rv
          WHERE rv.record_id = records.id
            AND rv.attribute_id = ${stageAttrId}
            AND rv.text_value IN ('Closed Won', 'Closed Lost')
        )`
      )
    );

  const wonCount = closedDeals.filter((d) => d.stage === "Closed Won").length;
  const lostCount = closedDeals.filter((d) => d.stage === "Closed Lost").length;
  const totalClosed = wonCount + lostCount;
  const overallWinRate = totalClosed > 0 ? wonCount / totalClosed : 0.5;

  // Load all active (non-closed) deals with stage + amount
  const activeDeals = await db
    .select({
      id: records.id,
      createdAt: records.createdAt,
      stage: sql<string | null>`(
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
        sql`NOT EXISTS (
          SELECT 1 FROM record_values rv
          WHERE rv.record_id = records.id
            AND rv.attribute_id = ${stageAttrId}
            AND rv.text_value IN ('Closed Won', 'Closed Lost')
        )`,
        sql`EXISTS (
          SELECT 1 FROM record_values rv
          WHERE rv.record_id = records.id
            AND rv.attribute_id = ${stageAttrId}
            AND rv.text_value IS NOT NULL
        )`
      )
    );

  // Group active deals by stage
  const stageMap = new Map<string, Array<{ id: string; amount: number; daysInPipeline: number }>>();

  for (const deal of activeDeals) {
    const stageName = deal.stage ?? "Unknown";
    if (!stageMap.has(stageName)) stageMap.set(stageName, []);

    const amount = deal.amount ? parseFloat(String(deal.amount)) : 0;
    const daysInPipeline = (Date.now() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24);

    stageMap.get(stageName)!.push({ id: deal.id, amount, daysInPipeline });
  }

  // Get workspace AI config
  const aiConfig = await getAIConfig(workspaceId);

  // ─── Build per-stage forecast ─────────────────────────────────────
  const stages: ForecastStage[] = [];

  for (const [stageName, deals] of stageMap.entries()) {
    const dealCount = deals.length;
    const totalValue = deals.reduce((sum, d) => sum + d.amount, 0);
    const avgDaysInPipeline = avg(deals.map((d) => d.daysInPipeline));

    // Historical close rate for this stage (use overall win rate * position multiplier)
    const positionMultiplier = STAGE_POSITION_MULTIPLIERS[stageName] ?? 0.7;
    const historicalCloseRate = overallWinRate * positionMultiplier;

    // AI confidence score — call LLM if available, else use historical rate
    let aiConfidenceScore = historicalCloseRate;
    let aiConfidenceReasoning: string | null = null;

    if (aiConfig && dealCount > 0) {
      const aiResult = await getAIConfidenceScore(stageName, {
        dealCount,
        avgDaysInPipeline: Math.round(avgDaysInPipeline),
        historicalCloseRate,
        config: aiConfig,
      });

      if (aiResult) {
        aiConfidenceScore = Math.min(1, Math.max(0, aiResult.confidence));
        aiConfidenceReasoning = aiResult.reasoning;
      }
    }

    const aiWeightedValue = totalValue * aiConfidenceScore;

    stages.push({
      stageName,
      dealCount,
      totalValue,
      historicalCloseRate,
      aiConfidenceScore,
      aiConfidenceReasoning,
      aiWeightedValue,
    });
  }

  // Sort stages by confidence descending (most likely to close first)
  stages.sort((a, b) => b.aiConfidenceScore - a.aiConfidenceScore);

  const totalPipelineValue = stages.reduce((sum, s) => sum + s.totalValue, 0);
  const totalAiWeightedValue = stages.reduce((sum, s) => sum + s.aiWeightedValue, 0);

  return {
    stages,
    totalPipelineValue,
    totalAiWeightedValue,
    computedAt: new Date(),
  };
}

// ─── AI Confidence Score ──────────────────────────────────────────────

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
    model: settings.openrouterModel || process.env.OPENROUTER_MODEL || "anthropic/claude-haiku-3",
  };
}

async function getAIConfidenceScore(
  stageName: string,
  params: {
    dealCount: number;
    avgDaysInPipeline: number;
    historicalCloseRate: number;
    config: AIConfig;
  }
): Promise<{ confidence: number; reasoning: string } | null> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
        "X-Title": "OpenClaw CRM Analytics",
      },
      body: JSON.stringify({
        model: params.config.model,
        messages: [
          {
            role: "system",
            content:
              'You are a sales forecasting analyst. Given pipeline stage metrics, provide a confidence score (0.0-1.0) for deals in this stage closing this quarter. Return ONLY valid JSON with this exact format: {"confidence": 0.75, "reasoning": "one sentence explanation"}. No other text.',
          },
          {
            role: "user",
            content: `Stage: ${stageName}
Deal count: ${params.dealCount}
Average days in pipeline: ${params.avgDaysInPipeline}
Historical close rate: ${Math.round(params.historicalCloseRate * 100)}%

Return confidence score as JSON.`,
          },
        ],
        max_tokens: 100,
        stream: false,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (typeof parsed.confidence === "number" && typeof parsed.reasoning === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
