import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, notFound, success } from "@/lib/api-utils";
import { getAsset } from "@/services/documents/asset-registry";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { id } = await params;
  const asset = await getAsset(id, ctx.workspaceId);
  if (!asset) return notFound("Asset not found");

  return success(asset);
}
