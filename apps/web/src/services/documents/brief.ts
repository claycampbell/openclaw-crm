/**
 * Opportunity brief generator (light tier).
 * Called by the cron worker for ai_generate jobs with documentType: "opportunity_brief".
 */
import { assembleContext } from "./context-assembler";
import { createDraftAsset } from "./asset-registry";
import { getAIConfig } from "@/services/ai-chat";

export async function generateOpportunityBrief(
  workspaceId: string,
  dealId: string
): Promise<void> {
  const aiConfig = await getAIConfig(workspaceId);
  if (!aiConfig) {
    console.log(`[brief] No AI config for workspace ${workspaceId}, skipping opportunity brief`);
    return;
  }

  const context = await assembleContext(workspaceId, dealId, "light");

  const prompt = `You are a sales assistant. Based on the following deal context, write a concise opportunity brief for the sales rep.

The brief must include:
- Prospect summary (company, contact, title)
- Deal overview (what they want, deal size if known)
- Key reasons this could be a strong fit
- Recommended next steps (2-3 specific actions)
- Key risks or unknowns

Format as structured JSON with these exact keys: prospect_summary, deal_overview, fit_reasons (array), next_steps (array), risks (array).

Deal context:
${context}`;

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
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      console.error(`[brief] OpenRouter error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error("[brief] No content in OpenRouter response");
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error("[brief] Failed to parse JSON response:", rawContent.substring(0, 200));
      return;
    }

    await createDraftAsset(
      workspaceId,
      dealId,
      "opportunity_brief",
      parsed,
      aiConfig.model,
      "1.0.0"
    );

    console.log(`[brief] Created opportunity_brief draft for deal ${dealId}`);
  } catch (err) {
    // Background jobs must not crash the cron worker
    console.error("[brief] Unexpected error generating opportunity brief:", err);
  }
}
