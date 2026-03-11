import { NextRequest } from "next/server";
import { getAuthContext, unauthorized, success } from "@/lib/api-utils";
import { listAssets } from "@/services/documents/asset-registry";

export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;

  // Fetch all battlecard assets across all statuses (or filtered)
  const assets = await listAssets(ctx.workspaceId, {
    assetType: "battlecard",
    status: status ?? "approved",
    limit: 100,
  });

  // Also fetch drafts if no specific status requested
  const drafts = !status
    ? await listAssets(ctx.workspaceId, {
        assetType: "battlecard",
        status: "draft",
        limit: 100,
      })
    : [];

  const allCards = [...assets, ...drafts];

  // Transform into the shape the frontend expects
  const battlecards = allCards.map((asset) => {
    const content = (asset.structuredContent ?? {}) as Record<string, unknown>;
    const meta = (asset.metadata ?? {}) as Record<string, unknown>;

    return {
      id: asset.id,
      competitorName: (meta.competitorName as string) ?? (content.competitor_name as string) ?? "Unknown",
      lastUpdated: asset.updatedAt.toISOString(),
      status: asset.status,
      dealMentions: 0, // TODO: count from signal_events once wired
      strengths: Array.isArray(content.their_strengths) ? content.their_strengths : [],
      weaknesses: Array.isArray(content.their_weaknesses) ? content.their_weaknesses : [],
      ourAdvantages: Array.isArray(content.our_advantages) ? content.our_advantages : [],
      competitorOverview: (content.competitor_overview as string) ?? "",
      objectionHandling: Array.isArray(content.objection_handling) ? content.objection_handling : [],
      discoveryQuestions: Array.isArray(content.discovery_questions) ? content.discovery_questions : [],
    };
  });

  return success(battlecards);
}
