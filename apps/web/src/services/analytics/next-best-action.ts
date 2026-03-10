import { db } from "@/db";
import { records, recordValues, objects, attributes, workspaces, notes, tasks, taskRecords } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────

export interface NextBestAction {
  recordId: string;
  stage: string;
  action: string;
  reason: string | null;
  urgency: "high" | "medium" | "low";
  computedAt: Date;
}

interface WorkspaceSettings {
  openrouterApiKey?: string;
  openrouterModel?: string;
}

// ─── Stage Playbook ───────────────────────────────────────────────────

const STAGE_PLAYBOOK: Record<string, string[]> = {
  Discovery: [
    "Schedule a discovery call",
    "Send a discovery questionnaire",
    "Research the prospect company",
  ],
  Qualified: [
    "Confirm budget and timeline",
    "Identify decision-makers",
    "Schedule a demo or walkthrough",
  ],
  Demo: [
    "Follow up with key takeaways from the demo",
    "Address questions raised during the demo",
    "Send a summary of next steps",
  ],
  Proposal: [
    "Send the proposal document",
    "Follow up on the proposal",
    "Schedule a proposal walkthrough call",
  ],
  Negotiation: [
    "Send revised pricing",
    "Loop in a decision-maker",
    "Address the top objection in writing",
  ],
  "Contract Sent": [
    "Follow up on contract review",
    "Offer to answer legal questions",
    "Set a contract signature deadline",
  ],
  "Closed Won": [
    "Trigger customer handoff",
    "Send a welcome email",
    "Schedule onboarding call",
  ],
  "Closed Lost": [
    "Send a loss survey",
    "Add to nurture sequence",
    "Document loss reason",
  ],
};

// ─── In-memory cache (5-minute TTL) ──────────────────────────────────

interface CacheEntry {
  data: NextBestAction;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(workspaceId: string, recordId: string): NextBestAction | null {
  const key = `${workspaceId}:${recordId}`;
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(workspaceId: string, recordId: string, data: NextBestAction): void {
  const key = `${workspaceId}:${recordId}`;
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Main Service ─────────────────────────────────────────────────────

/**
 * Get next-best-action suggestion for a deal record.
 * Stage-aware, activity-aware, workspace-scoped.
 */
export async function getNextBestAction(
  workspaceId: string,
  recordId: string
): Promise<NextBestAction> {
  // Check cache first
  const cached = getCached(workspaceId, recordId);
  if (cached) return cached;

  // Validate record belongs to workspace
  const recordWithObject = await db
    .select({
      id: records.id,
      objectId: records.objectId,
      workspaceId: objects.workspaceId,
      createdAt: records.createdAt,
      updatedAt: records.updatedAt,
    })
    .from(records)
    .innerJoin(objects, eq(objects.id, records.objectId))
    .where(and(eq(records.id, recordId), eq(objects.workspaceId, workspaceId)))
    .limit(1);

  if (recordWithObject.length === 0) {
    throw new Error("Record not found or access denied");
  }

  const record = recordWithObject[0];

  // Get stage attribute for this record's object
  const stageAttr = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(and(eq(attributes.objectId, record.objectId), eq(attributes.slug, "stage")))
    .limit(1);

  // Get current stage value
  let currentStage = "Unknown";
  if (stageAttr.length > 0) {
    const stageValue = await db
      .select({ textValue: recordValues.textValue })
      .from(recordValues)
      .where(
        and(
          eq(recordValues.recordId, recordId),
          eq(recordValues.attributeId, stageAttr[0].id)
        )
      )
      .limit(1);

    currentStage = stageValue[0]?.textValue ?? "Unknown";
  }

  // Load last 5 notes for this record
  const recentNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .where(eq(notes.recordId, recordId))
    .orderBy(desc(notes.createdAt))
    .limit(5);

  // Load last 5 tasks for this record (via taskRecords join)
  const recentTasks = await db
    .select({
      id: tasks.id,
      content: tasks.content,
      isCompleted: tasks.isCompleted,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .innerJoin(taskRecords, eq(taskRecords.taskId, tasks.id))
    .where(eq(taskRecords.recordId, recordId))
    .orderBy(desc(tasks.createdAt))
    .limit(5);

  // Compute days since last activity
  const lastNoteDate = recentNotes[0]?.createdAt;
  const lastTaskDate = recentTasks[0]?.createdAt;

  let daysSinceActivity: number | null = null;
  if (lastNoteDate || lastTaskDate) {
    const lastActivity = lastNoteDate && lastTaskDate
      ? new Date(Math.max(lastNoteDate.getTime(), lastTaskDate.getTime()))
      : lastNoteDate || lastTaskDate!;
    daysSinceActivity = Math.floor(
      (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Get AI config
  const aiConfig = await getAIConfig(workspaceId);

  // Look up playbook candidates
  const playbookCandidates = STAGE_PLAYBOOK[currentStage] ?? [];

  // Generate action suggestion
  let action: string;
  let reason: string | null = null;
  let urgency: "high" | "medium" | "low" = "medium";

  if (aiConfig && (recentNotes.length > 0 || recentTasks.length > 0 || playbookCandidates.length > 0)) {
    const aiResult = await generateNBAFromAI(
      currentStage,
      recentNotes.map((n) => n.title || "Note"),
      recentTasks.map((t) => ({ title: t.content, completed: t.isCompleted })),
      daysSinceActivity,
      playbookCandidates,
      aiConfig
    );

    if (aiResult) {
      action = aiResult.action;
      reason = aiResult.reason;
      urgency = aiResult.urgency;
    } else {
      // AI call failed — fall back to playbook
      action = playbookCandidates[0] ?? "Review deal status and plan next steps";
      reason = null;
    }
  } else if (playbookCandidates.length > 0) {
    // No AI key — use playbook default
    action = playbookCandidates[0];
    reason = null;
    urgency = daysSinceActivity !== null && daysSinceActivity > 7 ? "high" : "medium";
  } else {
    // Unknown stage — generic fallback
    action = "Review deal status and plan next steps";
    reason = null;
    urgency = "low";
  }

  const result: NextBestAction = {
    recordId,
    stage: currentStage,
    action,
    reason,
    urgency,
    computedAt: new Date(),
  };

  // Cache and return
  setCache(workspaceId, recordId, result);
  return result;
}

// ─── AI NBA Generation ─────────────────────────────────────────────

interface AIConfig {
  apiKey: string;
  model: string;
}

async function getAIConfig(workspaceId: string): Promise<AIConfig | null> {
  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const settings = (workspace?.settings ?? {}) as WorkspaceSettings;
  const apiKey = settings.openrouterApiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  return {
    apiKey,
    model:
      settings.openrouterModel ||
      process.env.OPENROUTER_MODEL ||
      "anthropic/claude-haiku-3",
  };
}

async function generateNBAFromAI(
  stage: string,
  noteTitles: string[],
  taskList: Array<{ title: string; completed: boolean }>,
  daysSinceActivity: number | null,
  playbookCandidates: string[],
  config: AIConfig
): Promise<{ action: string; reason: string; urgency: "high" | "medium" | "low" } | null> {
  const activitySummary =
    noteTitles.length === 0 && taskList.length === 0
      ? "No recent activity"
      : [
          noteTitles.length > 0 ? `Notes: ${noteTitles.join(", ")}` : "",
          taskList.length > 0
            ? `Tasks: ${taskList
                .map((t) => `${t.title} (${t.completed ? "done" : "pending"})`)
                .join(", ")}`
            : "",
          daysSinceActivity !== null ? `Last activity: ${daysSinceActivity} days ago` : "",
        ]
          .filter(Boolean)
          .join(". ");

  const candidateList =
    playbookCandidates.length > 0
      ? `Suggested candidates: ${playbookCandidates.join(", ")}`
      : "";

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001",
        "X-Title": "OpenClaw CRM Analytics",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              'You are a sales advisor. Given a deal\'s stage and recent activities, suggest the single most important next action. Return ONLY valid JSON: {"action": "string", "reason": "string", "urgency": "high"|"medium"|"low"}. No other text.',
          },
          {
            role: "user",
            content: `Stage: ${stage}
Recent activity: ${activitySummary}
${candidateList}

Return the next best action as JSON.`,
          },
        ],
        max_tokens: 150,
        stream: false,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content);
    if (
      typeof parsed.action === "string" &&
      typeof parsed.reason === "string" &&
      ["high", "medium", "low"].includes(parsed.urgency)
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
