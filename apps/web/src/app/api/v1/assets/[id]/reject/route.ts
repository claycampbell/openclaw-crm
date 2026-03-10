import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, success } from "@/lib/api-utils";
import { rejectAsset, getAsset } from "@/services/documents/asset-registry";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;

  // Verify asset belongs to this workspace
  const existing = await getAsset(id, ctx.workspaceId);
  if (!existing) return notFound("Asset not found");

  const asset = await rejectAsset(id, ctx.userId);
  return success(asset);
}
