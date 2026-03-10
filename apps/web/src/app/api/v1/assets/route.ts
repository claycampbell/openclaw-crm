import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success } from "@/lib/api-utils";
import { listAssets } from "@/services/documents/asset-registry";
import type { AssetType } from "@/db/schema/documents";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "draft";
  const recordId = searchParams.get("recordId") ?? undefined;
  const assetType = (searchParams.get("assetType") as AssetType) ?? undefined;

  const assets = await listAssets(ctx.workspaceId, { status, recordId, assetType });

  return success(assets);
}
