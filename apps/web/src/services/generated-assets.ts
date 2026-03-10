import { db } from "@/db";
import { generatedAssets } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

export type AssetType = typeof generatedAssets.$inferInsert["assetType"];
export type AssetStatus = typeof generatedAssets.$inferInsert["status"];

export interface CreateDraftParams {
  workspaceId: string;
  recordId?: string;
  assetType: AssetType;
  content: string;
  modelUsed?: string;
  promptVersion?: string;
}

export async function createDraft(
  params: CreateDraftParams
): Promise<typeof generatedAssets.$inferSelect> {
  const [asset] = await db
    .insert(generatedAssets)
    .values({ ...params, status: "draft" })
    .returning();
  return asset;
}

export async function listDrafts(
  workspaceId: string,
  options: { status?: AssetStatus; recordId?: string } = {}
): Promise<(typeof generatedAssets.$inferSelect)[]> {
  const conditions = [eq(generatedAssets.workspaceId, workspaceId)];
  if (options.status) conditions.push(eq(generatedAssets.status, options.status));
  if (options.recordId) conditions.push(eq(generatedAssets.recordId, options.recordId));

  return db
    .select()
    .from(generatedAssets)
    .where(and(...conditions))
    .orderBy(desc(generatedAssets.createdAt));
}

export async function getAsset(id: string, workspaceId: string) {
  const [asset] = await db
    .select()
    .from(generatedAssets)
    .where(and(eq(generatedAssets.id, id), eq(generatedAssets.workspaceId, workspaceId)))
    .limit(1);
  return asset ?? null;
}

export async function approveDraft(id: string, userId: string, workspaceId: string) {
  const asset = await getAsset(id, workspaceId);
  if (!asset) return null;

  const [updated] = await db
    .update(generatedAssets)
    .set({
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(generatedAssets.id, id), eq(generatedAssets.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function rejectDraft(
  id: string,
  userId: string,
  workspaceId: string,
  rejectionNote?: string
) {
  const asset = await getAsset(id, workspaceId);
  if (!asset) return null;

  const [updated] = await db
    .update(generatedAssets)
    .set({
      status: "rejected",
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionNote,
      updatedAt: new Date(),
    })
    .where(and(eq(generatedAssets.id, id), eq(generatedAssets.workspaceId, workspaceId)))
    .returning();
  return updated;
}
