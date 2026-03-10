/**
 * Proposal + deck generators (full tier).
 * Called by the cron worker for ai_generate jobs.
 */
import { assembleContext } from "./context-assembler";
import { createDraftAsset } from "./asset-registry";
import { getAIConfig } from "@/services/ai-chat";

// ─── Proposal ────────────────────────────────────────────────────────────────

export async function generateProposal(
  workspaceId: string,
  dealId: string
): Promise<void> {
  const aiConfig = await getAIConfig(workspaceId);
  if (!aiConfig) {
    console.log(`[proposal] No AI config for workspace ${workspaceId}, skipping`);
    return;
  }

  const context = await assembleContext(workspaceId, dealId, "full");

  const prompt = `You are a proposal writer. Generate a professional sales proposal based on the following deal context.

Return structured JSON with keys: executive_summary, prospect_pain_points (array), our_solution, key_benefits (array of 3-5), proposed_scope (array of deliverables), pricing_summary, next_steps, timeline_estimate.

Do not fabricate specific numbers not present in the context. Use "TBD" for unknown values.

Deal context:
${context}`;

  await callOpenRouterAndSave(
    workspaceId,
    dealId,
    "proposal",
    prompt,
    aiConfig,
    2500
  );
}

// ─── Deck ────────────────────────────────────────────────────────────────────

export async function generateDeck(
  workspaceId: string,
  dealId: string
): Promise<void> {
  const aiConfig = await getAIConfig(workspaceId);
  if (!aiConfig) {
    console.log(`[deck] No AI config for workspace ${workspaceId}, skipping`);
    return;
  }

  const context = await assembleContext(workspaceId, dealId, "full");

  const prompt = `You are a presentation strategist. Generate a sales presentation outline based on the following deal context.

Return structured JSON with keys: title_slide (object with title, subtitle), agenda (array of slide titles), slides (array of objects with title, key_points array, speaker_notes).

Generate 8-12 slides total. Include: Problem/Pain, Solution Overview, Key Benefits, Social Proof/Case Study placeholder, Pricing Options, Next Steps.

Deal context:
${context}`;

  await callOpenRouterAndSave(
    workspaceId,
    dealId,
    "deck",
    prompt,
    aiConfig,
    3000
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function callOpenRouterAndSave(
  workspaceId: string,
  dealId: string,
  assetType: "proposal" | "deck",
  prompt: string,
  aiConfig: { apiKey: string; model: string },
  maxTokens: number
): Promise<void> {
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
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      console.error(`[${assetType}] OpenRouter error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error(`[${assetType}] No content in OpenRouter response`);
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      console.error(`[${assetType}] Failed to parse JSON response`);
      return;
    }

    await createDraftAsset(
      workspaceId,
      dealId,
      assetType,
      parsed,
      aiConfig.model,
      "1.0.0"
    );

    console.log(`[${assetType}] Created ${assetType} draft for deal ${dealId}`);
  } catch (err) {
    console.error(`[${assetType}] Unexpected error:`, err);
  }
}
