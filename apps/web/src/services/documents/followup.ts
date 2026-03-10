/**
 * Meeting prep brief + post-meeting follow-up generators (both light tier).
 */
import { assembleContext } from "./context-assembler";
import { createDraftAsset } from "./asset-registry";
import { getAIConfig } from "@/services/ai-chat";
import { db } from "@/db";
import { calendarEvents } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── Meeting Prep Brief ───────────────────────────────────────────────────────

export async function generateMeetingPrepBrief(
  workspaceId: string,
  dealId: string,
  meetingId: string
): Promise<void> {
  const aiConfig = await getAIConfig(workspaceId);
  if (!aiConfig) {
    console.log(`[followup] No AI config for workspace ${workspaceId}, skipping meeting prep`);
    return;
  }

  const context = await assembleContext(workspaceId, dealId, "light");

  // Load the specific meeting details
  const [meeting] = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, meetingId))
    .limit(1);

  const attendeeList = Array.isArray(meeting?.attendees)
    ? (meeting.attendees as Array<{ name?: string; email?: string }>)
        .map((a) => a.name ?? a.email ?? "Unknown")
        .join(", ")
    : "Unknown attendees";

  const meetingTitle = meeting?.title ?? "Upcoming meeting";
  const startTime = meeting?.startTime
    ? new Date(meeting.startTime).toLocaleString()
    : "Unknown time";

  const prompt = `You are a sales coach. Write a meeting prep brief for the following upcoming deal meeting.

Return JSON with keys: meeting_overview (object with title, attendees, time), recent_activity_summary, talking_points (array of 3-5), objection_handling (array of objects with objection and response), key_questions_to_ask (array of 3).

Keep the brief concise — it will be read 30 minutes before the meeting.

Deal context:
${context}

Meeting: ${meetingTitle} with ${attendeeList} at ${startTime}`;

  await callOpenRouterAndSave(
    workspaceId,
    dealId,
    "meeting_prep",
    prompt,
    aiConfig,
    1500,
    { meetingId }
  );
}

// ─── Post-Meeting Follow-Up ───────────────────────────────────────────────────

export async function generatePostMeetingFollowup(
  workspaceId: string,
  dealId: string,
  triggerContext: {
    type: "meeting_ended" | "note_added";
    noteText?: string;
  }
): Promise<void> {
  const aiConfig = await getAIConfig(workspaceId);
  if (!aiConfig) {
    console.log(`[followup] No AI config for workspace ${workspaceId}, skipping follow-up`);
    return;
  }

  const context = await assembleContext(workspaceId, dealId, "light");

  const noteSection = triggerContext.noteText
    ? `\n\nMeeting notes from today's call:\n${triggerContext.noteText}`
    : "";

  const prompt = `You are a sales assistant. Write a post-meeting follow-up email draft.

Return JSON with keys: subject_line, email_body (markdown), internal_next_steps (array of objects with task and suggested_due_date).

The email should: thank the prospect, recap key points discussed, confirm agreed next steps, set a clear call-to-action.

Do not invent specific commitments not mentioned in the context. Use [FILL IN] for gaps.

Deal context:
${context}${noteSection}`;

  await callOpenRouterAndSave(
    workspaceId,
    dealId,
    "followup",
    prompt,
    aiConfig,
    1500,
    { triggerType: triggerContext.type }
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function callOpenRouterAndSave(
  workspaceId: string,
  dealId: string,
  assetType: "meeting_prep" | "followup",
  prompt: string,
  aiConfig: { apiKey: string; model: string },
  maxTokens: number,
  metadata?: Record<string, unknown>
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
      console.error(`[${assetType}] OpenRouter error: ${response.status}`);
      return;
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) {
      console.error(`[${assetType}] No content in response`);
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
      "1.0.0",
      metadata
    );

    console.log(`[${assetType}] Created ${assetType} draft for deal ${dealId}`);
  } catch (err) {
    console.error(`[${assetType}] Unexpected error:`, err);
  }
}
