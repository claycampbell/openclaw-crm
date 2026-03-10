/**
 * Battlecard generator (full tier).
 * Called by the cron worker for ai_generate jobs with documentType: "battlecard".
 */
import { assembleContext } from "./context-assembler";
import { createDraftAsset, listAssets } from "./asset-registry";
import { getAIConfig } from "@/services/ai-chat";

/**
 * Generate a competitive battlecard for the given competitor.
 * Skips if an approved battlecard for this competitor was created in the last 30 days.
 */
export async function generateBattlecard(
  workspaceId: string,
  dealId: string,
  competitorName: string
): Promise<void> {
  const aiConfig = await getAIConfig(workspaceId);
  if (!aiConfig) {
    console.log(`[battlecard] No AI config for workspace ${workspaceId}, skipping`);
    return;
  }

  // Check freshness: if an approved battlecard for this competitor exists in the last 30 days, skip
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const existingApproved = await listAssets(workspaceId, {
    status: "approved",
    assetType: "battlecard",
    limit: 100,
  });

  const recentBattlecard = existingApproved.find((a) => {
    const meta = a.metadata as Record<string, unknown> | null;
    const approvedAt = a.approvedAt ? new Date(a.approvedAt) : null;
    return (
      meta?.competitorName === competitorName &&
      approvedAt &&
      approvedAt > thirtyDaysAgo
    );
  });

  if (recentBattlecard) {
    console.log(
      `[battlecard] Skipping ${competitorName} — approved battlecard exists from ${recentBattlecard.approvedAt?.toLocaleDateString()}`
    );
    return;
  }

  const context = await assembleContext(workspaceId, dealId, "full");

  const prompt = `You are a competitive intelligence analyst. Generate a battlecard for the following competitor.

Return JSON with keys:
- competitor_name (string)
- competitor_overview (2-3 sentence string)
- their_strengths (array of 4-6 items)
- their_weaknesses (array of 4-6 items)
- our_advantages (array of 4-6 items: how OpenClaw is better)
- objection_handling (array of objects with their_claim and our_response)
- discovery_questions (array of 3-5 questions to ask when this competitor is mentioned)

Competitor: ${competitorName}
Deal context (use to tailor the messaging to this specific deal):
${context}

Note: If you do not have reliable knowledge about this competitor, say so in competitor_overview and focus on the discovery questions.`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://openclaw.ai",
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      console.error(`[battlecard] OpenRouter error: ${response.status}`);
      return;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error("[battlecard] No content in response");
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("[battlecard] Failed to parse JSON response");
      return;
    }

    await createDraftAsset(
      workspaceId,
      dealId,
      "battlecard",
      parsed,
      aiConfig.model,
      "1.0.0",
      { competitorName }
    );

    console.log(`[battlecard] Created battlecard draft for competitor ${competitorName}`);
  } catch (err) {
    console.error("[battlecard] Unexpected error:", err);
  }
}
