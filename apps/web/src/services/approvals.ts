/**
 * Approval workflow service.
 *
 * State machine: pending → approved | rejected | expired
 *
 * Supports:
 * - Configurable rules per workspace (discount threshold, deal value, stage change, manual)
 * - Creating approval requests linked to deal records
 * - Approving/rejecting requests with notes
 * - Approval history audit trail
 * - Listing pending approvals for approvers
 */

import { db } from "@/db";
import { approvalRules, approvalRequests, approvalHistory } from "@/db/schema/approvals";
import { eq, and, desc, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateApprovalRuleInput {
  name: string;
  description?: string;
  triggerType: "discount_threshold" | "deal_value_threshold" | "stage_change" | "contract_send" | "manual";
  conditions: Record<string, unknown>;
  approverIds: string[];
  expiresAfterHours?: number;
}

export interface CreateApprovalRequestInput {
  ruleId?: string;
  recordId?: string;
  title: string;
  description?: string;
  context?: Record<string, unknown>;
  requestedBy: string;
  expiresAt?: Date;
}

export interface ApprovalRequestWithRule {
  id: string;
  workspaceId: string;
  ruleId: string | null;
  recordId: string | null;
  title: string;
  description: string | null;
  context: Record<string, unknown>;
  requestedBy: string | null;
  resolvedBy: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  resolverNote: string | null;
  expiresAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  rule: {
    id: string;
    name: string;
    triggerType: string;
    approverIds: string[];
  } | null;
}

// ─── Rules ────────────────────────────────────────────────────────────────────

export async function listApprovalRules(workspaceId: string) {
  return db
    .select()
    .from(approvalRules)
    .where(and(eq(approvalRules.workspaceId, workspaceId), eq(approvalRules.isActive, "true")))
    .orderBy(approvalRules.createdAt);
}

export async function createApprovalRule(
  workspaceId: string,
  input: CreateApprovalRuleInput,
  createdBy: string
) {
  const [rule] = await db
    .insert(approvalRules)
    .values({
      workspaceId,
      name: input.name,
      description: input.description,
      triggerType: input.triggerType,
      conditions: input.conditions,
      approverIds: input.approverIds,
      expiresAfterHours: input.expiresAfterHours,
      createdBy,
    })
    .returning();
  return rule;
}

export async function updateApprovalRule(
  workspaceId: string,
  ruleId: string,
  input: Partial<CreateApprovalRuleInput>
) {
  const [rule] = await db
    .update(approvalRules)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(approvalRules.id, ruleId), eq(approvalRules.workspaceId, workspaceId)))
    .returning();
  return rule ?? null;
}

export async function deleteApprovalRule(workspaceId: string, ruleId: string) {
  await db
    .update(approvalRules)
    .set({ isActive: "false", updatedAt: new Date() })
    .where(and(eq(approvalRules.id, ruleId), eq(approvalRules.workspaceId, workspaceId)));
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export async function createApprovalRequest(
  workspaceId: string,
  input: CreateApprovalRequestInput
): Promise<typeof approvalRequests.$inferSelect> {
  // Load the rule to determine expiry if not explicitly provided
  let expiresAt = input.expiresAt;
  if (!expiresAt && input.ruleId) {
    const rule = await db
      .select({ expiresAfterHours: approvalRules.expiresAfterHours })
      .from(approvalRules)
      .where(eq(approvalRules.id, input.ruleId))
      .limit(1);
    const hrs = rule[0]?.expiresAfterHours;
    if (hrs != null) {
      expiresAt = new Date(Date.now() + hrs * 3_600_000);
    }
  }

  const [request] = await db
    .insert(approvalRequests)
    .values({
      workspaceId,
      ruleId: input.ruleId ?? null,
      recordId: input.recordId ?? null,
      title: input.title,
      description: input.description ?? null,
      context: input.context ?? {},
      requestedBy: input.requestedBy,
      expiresAt: expiresAt ?? null,
    })
    .returning();

  // Write initial history entry
  await db.insert(approvalHistory).values({
    requestId: request.id,
    actorId: input.requestedBy,
    fromStatus: null,
    toStatus: "pending",
    note: "Request created",
  });

  // Notify approvers
  if (input.ruleId) {
    const rules = await db
      .select({ approverIds: approvalRules.approverIds })
      .from(approvalRules)
      .where(eq(approvalRules.id, input.ruleId))
      .limit(1);
    const approverIds = (rules[0]?.approverIds as string[]) ?? [];
    if (approverIds.length > 0) {
      await notifyApprovers(workspaceId, request.id, input.title, approverIds);
    }
  }

  return request;
}

async function notifyApprovers(
  workspaceId: string,
  requestId: string,
  title: string,
  approverIds: string[]
) {
  if (approverIds.length === 0) return;
  const notifRows = approverIds.map((userId) => ({
    workspaceId,
    userId,
    type: "approval_requested" as const,
    title: "Approval Required",
    body: title,
    data: { approvalRequestId: requestId },
    isRead: false,
  }));

  // Insert notifications (fire-and-forget style — use raw SQL to avoid type issues with metadata jsonb)
  try {
    for (const n of notifRows) {
      await db.execute(
        sql`INSERT INTO notifications (id, workspace_id, user_id, type, title, body, metadata, is_read)
            VALUES (gen_random_uuid(), ${n.workspaceId}, ${n.userId}, ${n.type}, ${n.title}, ${n.body}, ${JSON.stringify(n.data)}::jsonb, false)`
      );
    }
  } catch (err) {
    console.error("[approvals] Failed to insert notifications:", err);
  }
}

export async function getApprovalRequest(
  workspaceId: string,
  requestId: string
): Promise<ApprovalRequestWithRule | null> {
  const rows = await db
    .select({
      request: approvalRequests,
      rule: {
        id: approvalRules.id,
        name: approvalRules.name,
        triggerType: approvalRules.triggerType,
        approverIds: approvalRules.approverIds,
      },
    })
    .from(approvalRequests)
    .leftJoin(approvalRules, eq(approvalRequests.ruleId, approvalRules.id))
    .where(
      and(
        eq(approvalRequests.id, requestId),
        eq(approvalRequests.workspaceId, workspaceId)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  const { request, rule } = rows[0];
  return {
    ...request,
    context: (request.context as Record<string, unknown>) ?? {},
    rule: rule?.id
      ? {
          id: rule.id,
          name: rule.name,
          triggerType: rule.triggerType,
          approverIds: (rule.approverIds as string[]) ?? [],
        }
      : null,
  };
}

export async function listApprovalRequests(
  workspaceId: string,
  options: {
    status?: "pending" | "approved" | "rejected" | "expired";
    approverId?: string;
    requestedBy?: string;
    recordId?: string;
    limit?: number;
    offset?: number;
  } = {}
) {
  const { status, approverId, requestedBy, recordId, limit = 50, offset = 0 } = options;

  // Build conditions
  const conditions = [eq(approvalRequests.workspaceId, workspaceId)];
  if (status) conditions.push(eq(approvalRequests.status, status));
  if (requestedBy) conditions.push(eq(approvalRequests.requestedBy, requestedBy));
  if (recordId) conditions.push(eq(approvalRequests.recordId, recordId));

  let query = db
    .select({
      request: approvalRequests,
      rule: {
        id: approvalRules.id,
        name: approvalRules.name,
        triggerType: approvalRules.triggerType,
        approverIds: approvalRules.approverIds,
      },
    })
    .from(approvalRequests)
    .leftJoin(approvalRules, eq(approvalRequests.ruleId, approvalRules.id))
    .where(and(...conditions))
    .orderBy(desc(approvalRequests.createdAt))
    .limit(limit)
    .offset(offset);

  const rows = await query;

  // If approverId filter, check rule approverIds in memory (JSON array)
  const results: ApprovalRequestWithRule[] = [];
  for (const { request, rule } of rows) {
    if (approverId && rule != null && rule.id) {
      const approverIds = (rule.approverIds as string[]) ?? [];
      if (!approverIds.includes(approverId)) continue;
    }
    results.push({
      ...request,
      context: (request.context as Record<string, unknown>) ?? {},
      rule: rule?.id
        ? {
            id: rule.id,
            name: rule.name,
            triggerType: rule.triggerType,
            approverIds: (rule.approverIds as string[]) ?? [],
          }
        : null,
    });
  }

  return results;
}

// ─── State transitions ────────────────────────────────────────────────────────

export async function approveRequest(
  workspaceId: string,
  requestId: string,
  approverId: string,
  note?: string
): Promise<typeof approvalRequests.$inferSelect | null> {
  const request = await getApprovalRequest(workspaceId, requestId);
  if (!request) return null;
  if (request.status !== "pending") return null; // Already resolved

  const [updated] = await db
    .update(approvalRequests)
    .set({
      status: "approved",
      resolvedBy: approverId,
      resolverNote: note ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(approvalRequests.id, requestId), eq(approvalRequests.workspaceId, workspaceId)))
    .returning();

  await db.insert(approvalHistory).values({
    requestId,
    actorId: approverId,
    fromStatus: "pending",
    toStatus: "approved",
    note: note ?? "Request approved",
  });

  // Notify the requester
  if (request.requestedBy) {
    await notifyRequester(workspaceId, requestId, request.requestedBy, "approved", request.title);
  }

  return updated ?? null;
}

export async function rejectRequest(
  workspaceId: string,
  requestId: string,
  approverId: string,
  note?: string
): Promise<typeof approvalRequests.$inferSelect | null> {
  const request = await getApprovalRequest(workspaceId, requestId);
  if (!request) return null;
  if (request.status !== "pending") return null;

  const [updated] = await db
    .update(approvalRequests)
    .set({
      status: "rejected",
      resolvedBy: approverId,
      resolverNote: note ?? null,
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(approvalRequests.id, requestId), eq(approvalRequests.workspaceId, workspaceId)))
    .returning();

  await db.insert(approvalHistory).values({
    requestId,
    actorId: approverId,
    fromStatus: "pending",
    toStatus: "rejected",
    note: note ?? "Request rejected",
  });

  if (request.requestedBy) {
    await notifyRequester(workspaceId, requestId, request.requestedBy, "rejected", request.title);
  }

  return updated ?? null;
}

async function notifyRequester(
  workspaceId: string,
  requestId: string,
  userId: string,
  outcome: "approved" | "rejected",
  title: string
) {
  try {
    await db.execute(
      sql`INSERT INTO notifications (id, workspace_id, user_id, type, title, body, metadata, is_read)
          VALUES (
            gen_random_uuid(),
            ${workspaceId},
            ${userId},
            ${"approval_resolved"},
            ${outcome === "approved" ? "Approval Granted" : "Approval Rejected"},
            ${title},
            ${JSON.stringify({ approvalRequestId: requestId, outcome })}::jsonb,
            false
          )`
    );
  } catch (err) {
    console.error("[approvals] Failed to notify requester:", err);
  }
}

/**
 * Expire overdue pending requests. Called by cron job.
 */
export async function expireOverdueRequests(workspaceId: string): Promise<number> {
  const now = new Date();
  const expired = await db
    .update(approvalRequests)
    .set({ status: "expired", updatedAt: now })
    .where(
      and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.status, "pending"),
        sql`${approvalRequests.expiresAt} IS NOT NULL AND ${approvalRequests.expiresAt} < ${now}`
      )
    )
    .returning({ id: approvalRequests.id });

  if (expired.length > 0) {
    const historyRows = expired.map((r) => ({
      requestId: r.id,
      actorId: null as string | null,
      fromStatus: "pending" as const,
      toStatus: "expired" as const,
      note: "Request expired",
    }));
    await db.insert(approvalHistory).values(historyRows);
  }

  return expired.length;
}

/**
 * Get approval history for a request.
 */
export async function getApprovalHistory(workspaceId: string, requestId: string) {
  // Verify request belongs to workspace
  const req = await db
    .select({ id: approvalRequests.id })
    .from(approvalRequests)
    .where(and(eq(approvalRequests.id, requestId), eq(approvalRequests.workspaceId, workspaceId)))
    .limit(1);

  if (req.length === 0) return null;

  return db
    .select()
    .from(approvalHistory)
    .where(eq(approvalHistory.requestId, requestId))
    .orderBy(approvalHistory.createdAt);
}

/**
 * Check if a deal needs approval based on workspace rules.
 * Called when a deal is updated (e.g., discount changed, stage changed).
 */
export async function evaluateDealForApproval(
  workspaceId: string,
  dealContext: {
    dealId: string;
    discountPercent?: number;
    dealValue?: number;
    newStage?: string;
    requestedBy: string;
  }
): Promise<typeof approvalRequests.$inferSelect | null> {
  const rules = await listApprovalRules(workspaceId);

  for (const rule of rules) {
    const conditions = rule.conditions as Record<string, unknown>;

    let triggered = false;
    let title = "";

    switch (rule.triggerType) {
      case "discount_threshold": {
        const threshold = Number(conditions.threshold ?? 0);
        if (dealContext.discountPercent != null && dealContext.discountPercent >= threshold) {
          triggered = true;
          title = `Discount approval: ${dealContext.discountPercent}% (rule: ${rule.name})`;
        }
        break;
      }
      case "deal_value_threshold": {
        const threshold = Number(conditions.threshold ?? 0);
        if (dealContext.dealValue != null && dealContext.dealValue >= threshold) {
          triggered = true;
          title = `High-value deal approval: $${dealContext.dealValue.toLocaleString()} (rule: ${rule.name})`;
        }
        break;
      }
      case "stage_change": {
        const targetStage = String(conditions.stage ?? "");
        if (
          dealContext.newStage &&
          targetStage &&
          dealContext.newStage.toLowerCase().includes(targetStage.toLowerCase())
        ) {
          triggered = true;
          title = `Stage change approval: ${dealContext.newStage} (rule: ${rule.name})`;
        }
        break;
      }
      case "manual":
        // Manual rules are only triggered explicitly
        break;
    }

    if (triggered) {
      // Check if there's already a pending request for this deal + rule
      const existing = await db
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.workspaceId, workspaceId),
            eq(approvalRequests.ruleId, rule.id),
            eq(approvalRequests.recordId, dealContext.dealId),
            eq(approvalRequests.status, "pending")
          )
        )
        .limit(1);

      if (existing.length > 0) continue; // Already has pending approval

      return createApprovalRequest(workspaceId, {
        ruleId: rule.id,
        recordId: dealContext.dealId,
        title,
        context: dealContext,
        requestedBy: dealContext.requestedBy,
      });
    }
  }

  return null;
}
