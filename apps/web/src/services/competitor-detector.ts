/**
 * Competitor detector — Tier 1 (no LLM, pure string matching).
 * Detects competitor names in text using workspace-configured competitor list.
 */
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { eq } from "drizzle-orm";

// Default competitor list for CRM industry
const DEFAULT_COMPETITORS = [
  "Salesforce",
  "HubSpot",
  "Pipedrive",
  "Zoho",
  "Close",
  "Monday Sales CRM",
  "Copper CRM",
  "Freshsales",
  "Insightly",
  "Nutshell",
  "ActiveCampaign",
];

interface WorkspaceSettings {
  competitors?: string[];
  [key: string]: unknown;
}

/**
 * Detect competitor mentions in text using workspace competitor list.
 * Pure string matching — zero LLM cost (Tier 1).
 * Returns deduplicated array of matched competitor names.
 */
export async function detectCompetitors(
  text: string,
  workspaceId: string
): Promise<string[]> {
  if (!text || text.trim().length === 0) return [];

  // Load workspace competitor list
  const [workspace] = await db
    .select({ settings: workspaces.settings })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const settings = (workspace?.settings ?? {}) as WorkspaceSettings;
  const competitorList = settings.competitors ?? DEFAULT_COMPETITORS;

  const textLower = text.toLowerCase();
  const detected: string[] = [];

  for (const competitor of competitorList) {
    if (textLower.includes(competitor.toLowerCase())) {
      if (!detected.includes(competitor)) {
        detected.push(competitor);
      }
    }
  }

  return detected;
}
