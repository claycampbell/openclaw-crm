import { getOrCreateChannel, postAgentMessage } from "./agent-channels";

// Handle a record being created — Aria posts to the relevant channel
export async function handleRecordCreated(params: {
  objectSlug: string;     // "people" | "companies" | "deals"
  objectSingularName: string; // "Person" | "Company" | "Deal"
  recordId: string;
  workspaceId: string;
  recordSummary: string;  // human-readable summary of what was created
}): Promise<void> {
  try {
    const { objectSlug, workspaceId, recordSummary } = params;

    // Determine target channel
    let channelName: string;
    switch (objectSlug) {
      case "deals":
        channelName = "deals";
        break;
      case "people":
      case "companies":
      default:
        channelName = "general";
        break;
    }

    const conversationId = await getOrCreateChannel(workspaceId, channelName);

    // Build template message
    let message: string;
    switch (objectSlug) {
      case "deals":
        message = `📋 New deal added: **${recordSummary}**. I'll keep an eye on this one. Let me know if you'd like me to draft a follow-up or create a task.`;
        break;
      case "people":
        message = `👤 New contact added: **${recordSummary}**. Want me to look up any additional information or create an outreach task?`;
        break;
      case "companies":
        message = `🏢 New company added: **${recordSummary}**. I can research this company or find related contacts if you'd like.`;
        break;
      default:
        message = `✅ New ${params.objectSingularName} added: **${recordSummary}**. Let me know if you need anything.`;
        break;
    }

    await postAgentMessage(conversationId, message, "Aria");
  } catch {
    // Never throw — this is fire-and-forget
  }
}

// Handle a record being updated — Aria posts if it's a notable change
export async function handleRecordUpdated(params: {
  objectSlug: string;
  objectSingularName: string;
  recordId: string;
  workspaceId: string;
  recordSummary: string;
  changedFields: string[]; // e.g. ["stage", "amount"]
}): Promise<void> {
  try {
    const { objectSlug, workspaceId, recordSummary, changedFields } = params;

    // Only post for deals when "stage" field changed
    if (objectSlug !== "deals" || !changedFields.includes("stage")) {
      return;
    }

    const channelName = objectSlug === "deals" ? "deals" : "general";
    const conversationId = await getOrCreateChannel(workspaceId, channelName);

    const message = `🔄 Deal updated: **${recordSummary}** — stage changed. Want me to suggest next steps?`;

    await postAgentMessage(conversationId, message, "Aria");
  } catch {
    // Never throw — this is fire-and-forget
  }
}
