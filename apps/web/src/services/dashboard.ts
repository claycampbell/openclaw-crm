/**
 * Dashboard service — aggregates pipeline data for role-appropriate views.
 *
 * Three views:
 *  - rep: personal pipeline deals, open tasks, draft queue
 *  - manager: aggregate team pipeline + per-rep breakdowns
 *  - leadership: stage distribution, weighted pipeline value, forecast
 */

import { db } from "@/db";
import { records, recordValues, objects, attributes, workspaceMembers } from "@/db/schema";
import { approvalRequests } from "@/db/schema/approvals";
import { generatedAssets } from "@/db/schema/generated-assets";
import { eq, and, inArray, sql, desc, count } from "drizzle-orm";
import { batchGetRecordDisplayNames } from "./display-names";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DealSummary {
  id: string;
  displayName: string;
  stage: string | null;
  value: number | null;
  ownerId: string | null;
  ownerName: string | null;
  closeDate: string | null;
  updatedAt: Date;
}

export interface RepDashboard {
  myDeals: DealSummary[];
  openTaskCount: number;
  pendingApprovalCount: number;
  pendingAssetCount: number;
  dealValueTotal: number;
  stageBreakdown: { stage: string; count: number; value: number }[];
}

export interface RepMetrics {
  userId: string;
  name: string;
  email: string;
  dealCount: number;
  dealValue: number;
  closedCount: number;
  closedValue: number;
  openTasks: number;
}

export interface ManagerDashboard {
  teamDeals: DealSummary[];
  teamMetrics: RepMetrics[];
  totalPipelineValue: number;
  totalDeals: number;
  stageBreakdown: { stage: string; count: number; value: number }[];
  pendingApprovals: number;
}

export interface LeadershipDashboard {
  totalPipelineValue: number;
  weightedPipelineValue: number;
  totalDeals: number;
  closedWonValue: number;
  closedWonCount: number;
  stageDistribution: { stage: string; count: number; value: number; weight: number }[];
  topDeals: DealSummary[];
}

// Stage win probability weights (used for weighted pipeline)
const STAGE_WEIGHTS: Record<string, number> = {
  prospecting: 0.1,
  qualification: 0.2,
  discovery: 0.3,
  proposal: 0.5,
  negotiation: 0.7,
  "closing": 0.9,
  "closed-won": 1.0,
  "closed won": 1.0,
  "closed-lost": 0,
  "closed lost": 0,
};

function getStageWeight(stage: string | null): number {
  if (!stage) return 0.2;
  const key = stage.toLowerCase().trim();
  if (STAGE_WEIGHTS[key] !== undefined) return STAGE_WEIGHTS[key];
  // Partial match
  for (const [k, w] of Object.entries(STAGE_WEIGHTS)) {
    if (key.includes(k) || k.includes(key)) return w;
  }
  return 0.2;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Load deal records for a workspace with key attribute values inlined.
 * Returns lightweight DealSummary objects suitable for dashboard cards.
 */
async function loadDealsForWorkspace(
  workspaceId: string,
  ownerIds?: string[]
): Promise<DealSummary[]> {
  // 1. Find the Deals object for this workspace
  const [dealsObj] = await db
    .select({ id: objects.id })
    .from(objects)
    .where(and(eq(objects.workspaceId, workspaceId), eq(objects.slug, "deals")))
    .limit(1);

  if (!dealsObj) return [];

  // 2. Load attributes we care about: stage, value, owner, close_date
  const attrs = await db
    .select({ id: attributes.id, slug: attributes.slug, type: attributes.type })
    .from(attributes)
    .where(eq(attributes.objectId, dealsObj.id));

  const attrBySlug = new Map(attrs.map((a) => [a.slug, a]));

  // Relevant attribute slugs (common CRM deal field names)
  const stageAttr = attrBySlug.get("stage") ?? attrBySlug.get("deal-stage") ?? attrBySlug.get("status");
  const valueAttr = attrBySlug.get("value") ?? attrBySlug.get("deal-value") ?? attrBySlug.get("amount");
  const ownerAttr = attrBySlug.get("owner") ?? attrBySlug.get("rep") ?? attrBySlug.get("assigned-to");
  const closeDateAttr = attrBySlug.get("close-date") ?? attrBySlug.get("close_date") ?? attrBySlug.get("expected-close");

  // 3. Load deal records
  const dealRecords = await db
    .select({ id: records.id, updatedAt: records.updatedAt, createdBy: records.createdBy })
    .from(records)
    .where(eq(records.objectId, dealsObj.id))
    .orderBy(desc(records.updatedAt))
    .limit(500);

  if (dealRecords.length === 0) return [];

  const dealIds = dealRecords.map((r) => r.id);

  // 4. Load relevant attribute values for all deals in one query
  const relevantAttrIds = [stageAttr?.id, valueAttr?.id, ownerAttr?.id, closeDateAttr?.id].filter(
    Boolean
  ) as string[];

  let valueRows: {
    recordId: string;
    attributeId: string;
    textValue: string | null;
    numberValue: string | null;
    dateValue: string | null;
    referencedRecordId: string | null;
  }[] = [];

  if (relevantAttrIds.length > 0) {
    valueRows = await db
      .select({
        recordId: recordValues.recordId,
        attributeId: recordValues.attributeId,
        textValue: recordValues.textValue,
        numberValue: recordValues.numberValue,
        dateValue: recordValues.dateValue,
        referencedRecordId: recordValues.referencedRecordId,
      })
      .from(recordValues)
      .where(
        and(
          inArray(recordValues.recordId, dealIds),
          inArray(recordValues.attributeId, relevantAttrIds)
        )
      );
  }

  // 5. Group by record
  const valuesByRecord = new Map<
    string,
    Map<
      string,
      { textValue: string | null; numberValue: string | null; dateValue: string | null; referencedRecordId: string | null }
    >
  >();

  for (const v of valueRows) {
    if (!valuesByRecord.has(v.recordId)) valuesByRecord.set(v.recordId, new Map());
    valuesByRecord.get(v.recordId)!.set(v.attributeId, {
      textValue: v.textValue,
      numberValue: v.numberValue,
      dateValue: v.dateValue,
      referencedRecordId: v.referencedRecordId,
    });
  }

  // 6. Resolve display names in batch
  const nameMap = await batchGetRecordDisplayNames(dealIds);

  // 7. Resolve owner record IDs to user names (if owner is a record reference)
  const ownerRecordIds = new Set<string>();
  for (const [, attrMap] of valuesByRecord) {
    if (ownerAttr) {
      const ownerVal = attrMap.get(ownerAttr.id);
      if (ownerVal?.referencedRecordId) ownerRecordIds.add(ownerVal.referencedRecordId);
    }
  }

  const ownerNameMap = ownerRecordIds.size > 0
    ? await batchGetRecordDisplayNames([...ownerRecordIds])
    : new Map<string, { displayName: string }>();

  // 8. Assemble summaries
  const summaries: DealSummary[] = [];

  for (const rec of dealRecords) {
    const attrMap = valuesByRecord.get(rec.id) ?? new Map();
    const nameInfo = nameMap.get(rec.id);

    const stageVal = stageAttr ? attrMap.get(stageAttr.id) : null;
    const valueVal = valueAttr ? attrMap.get(valueAttr.id) : null;
    const ownerVal = ownerAttr ? attrMap.get(ownerAttr.id) : null;
    const closeDateVal = closeDateAttr ? attrMap.get(closeDateAttr.id) : null;

    const stage = stageVal?.textValue ?? null;
    const dealValue = valueVal?.numberValue != null ? Number(valueVal.numberValue) : null;
    const ownerId = ownerVal?.referencedRecordId ?? null;
    const ownerInfo = ownerId ? ownerNameMap.get(ownerId) : null;
    const closeDate = closeDateVal?.dateValue ?? null;

    // Filter by owner if specified
    if (ownerIds && ownerIds.length > 0) {
      const matchesOwner =
        (ownerId && ownerIds.includes(ownerId)) ||
        (rec.createdBy && ownerIds.includes(rec.createdBy));
      if (!matchesOwner) continue;
    }

    summaries.push({
      id: rec.id,
      displayName: nameInfo?.displayName ?? "Unnamed deal",
      stage,
      value: dealValue,
      ownerId,
      ownerName: ownerInfo?.displayName ?? null,
      closeDate,
      updatedAt: rec.updatedAt,
    });
  }

  return summaries;
}

function buildStageBreakdown(deals: DealSummary[]): { stage: string; count: number; value: number }[] {
  const map = new Map<string, { count: number; value: number }>();
  for (const d of deals) {
    const key = d.stage ?? "Unknown";
    const cur = map.get(key) ?? { count: 0, value: 0 };
    cur.count += 1;
    cur.value += d.value ?? 0;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([stage, { count, value }]) => ({ stage, count, value }))
    .sort((a, b) => b.value - a.value);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Rep dashboard: personal pipeline + task + approval counts.
 * Scoped to the calling user's own deals.
 */
export async function getRepDashboard(
  workspaceId: string,
  userId: string
): Promise<RepDashboard> {
  // Load all deals; filter to user's deals via createdBy or owner reference
  const allDeals = await loadDealsForWorkspace(workspaceId);
  const myDeals = allDeals.filter(
    (d) => d.ownerId === userId || (!d.ownerId && !d.ownerName)
  );

  // Task count
  const taskCountRows2 = Array.from(await db.execute(
    sql`SELECT count(*)::int AS cnt FROM tasks WHERE workspace_id = ${workspaceId} AND created_by = ${userId} AND is_completed = false`
  )) as { cnt: number }[];
  const openTaskCount = taskCountRows2[0]?.cnt ?? 0;

  // Pending approvals requested by this user
  const [pendingApprovalResult] = await db
    .select({ cnt: count() })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.requestedBy, userId),
        eq(approvalRequests.status, "pending")
      )
    );
  const pendingApprovalCount = pendingApprovalResult?.cnt ?? 0;

  // Pending assets (draft contracts, proposals) for this user's deals
  const myDealIds = myDeals.map((d) => d.id);
  let pendingAssetCount = 0;
  if (myDealIds.length > 0) {
    const [assetResult] = await db
      .select({ cnt: count() })
      .from(generatedAssets)
      .where(
        and(
          eq(generatedAssets.workspaceId, workspaceId),
          inArray(generatedAssets.recordId, myDealIds),
          sql`${generatedAssets.status} IN ('draft', 'pending_approval')`
        )
      );
    pendingAssetCount = assetResult?.cnt ?? 0;
  }

  const dealValueTotal = myDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);

  return {
    myDeals,
    openTaskCount: Number(openTaskCount),
    pendingApprovalCount: Number(pendingApprovalCount),
    pendingAssetCount: Number(pendingAssetCount),
    dealValueTotal,
    stageBreakdown: buildStageBreakdown(myDeals),
  };
}

/**
 * Manager dashboard: full team pipeline with per-rep metrics.
 */
export async function getManagerDashboard(workspaceId: string): Promise<ManagerDashboard> {
  // Load all workspace members
  const members = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  const teamDeals = await loadDealsForWorkspace(workspaceId);

  // Build per-rep metrics
  const repMetricsMap = new Map<
    string,
    { dealCount: number; dealValue: number; closedCount: number; closedValue: number }
  >();

  for (const deal of teamDeals) {
    const repId = deal.ownerId ?? "unassigned";
    const cur = repMetricsMap.get(repId) ?? {
      dealCount: 0,
      dealValue: 0,
      closedCount: 0,
      closedValue: 0,
    };
    cur.dealCount += 1;
    cur.dealValue += deal.value ?? 0;
    const stageLower = (deal.stage ?? "").toLowerCase();
    if (stageLower.includes("closed") && stageLower.includes("won")) {
      cur.closedCount += 1;
      cur.closedValue += deal.value ?? 0;
    }
    repMetricsMap.set(repId, cur);
  }

  // Get task counts per user in batch
  const memberIds = members.map((m) => m.userId);
  const taskCountRows: { created_by: string; cnt: number }[] =
    memberIds.length > 0
      ? Array.from(await db.execute(
          sql`SELECT created_by, count(*)::int AS cnt FROM tasks WHERE workspace_id = ${workspaceId} AND created_by = ANY(${memberIds}) AND is_completed = false GROUP BY created_by`
        )) as { created_by: string; cnt: number }[]
      : [];

  const taskCountByUser = new Map<string, number>();
  for (const row of taskCountRows) {
    taskCountByUser.set(row.created_by, row.cnt);
  }

  // Pending approvals for workspace
  const [pendingApprovalResult] = await db
    .select({ cnt: count() })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.status, "pending")
      )
    );

  // Build team metrics — need user names from auth
  const userDataRows: { id: string; name: string; email: string }[] =
    memberIds.length > 0
      ? Array.from(await db.execute(
          sql`SELECT id, name, email FROM "user" WHERE id = ANY(${memberIds})`
        )) as { id: string; name: string; email: string }[]
      : [];

  const userMap = new Map<string, { name: string; email: string }>();
  for (const row of userDataRows) {
    userMap.set(row.id, { name: row.name, email: row.email });
  }

  const teamMetrics: RepMetrics[] = members.map((m) => {
    const metrics = repMetricsMap.get(m.userId) ?? {
      dealCount: 0,
      dealValue: 0,
      closedCount: 0,
      closedValue: 0,
    };
    const user = userMap.get(m.userId);
    return {
      userId: m.userId,
      name: user?.name ?? "Unknown",
      email: user?.email ?? "",
      dealCount: metrics.dealCount,
      dealValue: metrics.dealValue,
      closedCount: metrics.closedCount,
      closedValue: metrics.closedValue,
      openTasks: taskCountByUser.get(m.userId) ?? 0,
    };
  });

  const totalPipelineValue = teamDeals.reduce((sum, d) => sum + (d.value ?? 0), 0);

  return {
    teamDeals,
    teamMetrics,
    totalPipelineValue,
    totalDeals: teamDeals.length,
    stageBreakdown: buildStageBreakdown(teamDeals),
    pendingApprovals: Number(pendingApprovalResult?.cnt ?? 0),
  };
}

/**
 * Leadership dashboard: stage distribution + weighted pipeline value.
 */
export async function getLeadershipDashboard(workspaceId: string): Promise<LeadershipDashboard> {
  const allDeals = await loadDealsForWorkspace(workspaceId);

  const stageBreakdown = buildStageBreakdown(allDeals);

  let totalPipelineValue = 0;
  let weightedPipelineValue = 0;
  let closedWonValue = 0;
  let closedWonCount = 0;

  for (const deal of allDeals) {
    const v = deal.value ?? 0;
    const stageLower = (deal.stage ?? "").toLowerCase();
    if (stageLower.includes("closed") && stageLower.includes("won")) {
      closedWonValue += v;
      closedWonCount += 1;
    } else if (stageLower.includes("closed") && stageLower.includes("lost")) {
      // Excluded from active pipeline
    } else {
      totalPipelineValue += v;
      weightedPipelineValue += v * getStageWeight(deal.stage);
    }
  }

  const stageDistribution = stageBreakdown.map((s) => ({
    ...s,
    weight: getStageWeight(s.stage),
  }));

  // Top 10 deals by value
  const topDeals = [...allDeals]
    .filter((d) => {
      const sl = (d.stage ?? "").toLowerCase();
      return !sl.includes("lost") && !sl.includes("won");
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 10);

  return {
    totalPipelineValue,
    weightedPipelineValue,
    totalDeals: allDeals.length,
    closedWonValue,
    closedWonCount,
    stageDistribution,
    topDeals,
  };
}

/**
 * Get dashboard view preference for a user.
 * Stored in workspace settings as JSON.
 */
export async function getUserDashboardPreference(
  workspaceId: string,
  userId: string
): Promise<"rep" | "manager" | "leadership"> {
  const settingRows = Array.from(await db.execute(
    sql`SELECT settings FROM workspaces WHERE id = ${workspaceId}`
  )) as { settings: Record<string, unknown> | null }[];
  const settings = settingRows[0]?.settings ?? {};
  const dashPrefs = (settings.dashboardPreferences as Record<string, string> | undefined) ?? {};
  const pref = dashPrefs[userId];
  if (pref === "manager" || pref === "leadership") return pref;
  return "rep";
}

/**
 * Save dashboard view preference for a user.
 */
export async function setUserDashboardPreference(
  workspaceId: string,
  userId: string,
  view: "rep" | "manager" | "leadership"
): Promise<void> {
  // Use jsonb_set with a parameterized path array to avoid injection
  const pathArr = `{dashboardPreferences,${userId.replace(/[^a-z0-9_-]/gi, "")}}`;
  await db.execute(
    sql`UPDATE workspaces
        SET settings = jsonb_set(
          COALESCE(settings, '{}'),
          ${pathArr}::text[],
          ${JSON.stringify(view)}::jsonb
        )
        WHERE id = ${workspaceId}`
  );
}
