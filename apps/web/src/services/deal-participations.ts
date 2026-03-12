import { db } from "@/db";
import { dealParticipations } from "@/db/schema/deal-participations";
import { workspaces, records } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { DealParticipationRole } from "@openclaw-crm/shared";

/**
 * Add a workspace as a participant on a deal record.
 */
export async function addParticipation(
  recordId: string,
  workspaceId: string,
  role: DealParticipationRole,
  addedBy: string | null
) {
  // Validate record exists
  const [record] = await db
    .select({ id: records.id })
    .from(records)
    .where(eq(records.id, recordId))
    .limit(1);
  if (!record) throw new Error("Record not found");

  // Validate workspace exists
  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) throw new Error("Workspace not found");

  const [participation] = await db
    .insert(dealParticipations)
    .values({ recordId, workspaceId, role, addedBy })
    .onConflictDoUpdate({
      target: [dealParticipations.recordId, dealParticipations.workspaceId],
      set: { role, addedBy, addedAt: new Date() },
    })
    .returning();

  return participation;
}

/**
 * Remove a workspace's participation on a deal.
 */
export async function removeParticipation(recordId: string, workspaceId: string) {
  const deleted = await db
    .delete(dealParticipations)
    .where(
      and(
        eq(dealParticipations.recordId, recordId),
        eq(dealParticipations.workspaceId, workspaceId)
      )
    )
    .returning();
  return deleted[0] ?? null;
}

/**
 * Remove a participation by its ID.
 */
export async function removeParticipationById(participationId: string) {
  const deleted = await db
    .delete(dealParticipations)
    .where(eq(dealParticipations.id, participationId))
    .returning();
  return deleted[0] ?? null;
}

/**
 * Get all participations for a deal record, with workspace info.
 */
export async function getParticipationsForRecord(recordId: string) {
  return db
    .select({
      id: dealParticipations.id,
      recordId: dealParticipations.recordId,
      workspaceId: dealParticipations.workspaceId,
      workspaceName: workspaces.name,
      workspaceType: workspaces.type,
      role: dealParticipations.role,
      notes: dealParticipations.notes,
      addedAt: dealParticipations.addedAt,
      addedBy: dealParticipations.addedBy,
    })
    .from(dealParticipations)
    .innerJoin(workspaces, eq(workspaces.id, dealParticipations.workspaceId))
    .where(eq(dealParticipations.recordId, recordId))
    .orderBy(dealParticipations.addedAt);
}

/**
 * Get all record IDs that a workspace participates in.
 */
export async function getParticipatedRecordIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ recordId: dealParticipations.recordId })
    .from(dealParticipations)
    .where(eq(dealParticipations.workspaceId, workspaceId));
  return rows.map(r => r.recordId);
}
