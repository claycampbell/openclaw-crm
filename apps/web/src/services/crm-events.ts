import { getOrCreateChannel, postAgentMessage } from "./agent-channels";
import { triggerCloseFlow, isClosedWonStage } from "./close-flow";
import { evaluateDealForApproval } from "./approvals";
import { dispatchWebhookEvent } from "./webhook-delivery";

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

    // Dispatch to outbound webhooks
    dispatchWebhookEvent(workspaceId, "record.created", {
      recordId: params.recordId,
      objectSlug,
      objectSingularName: params.objectSingularName,
      recordSummary,
    }).catch(() => {});
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
  newValues?: Record<string, unknown>; // new field values after update
  userId?: string;
}): Promise<void> {
  try {
    const { objectSlug, workspaceId, recordSummary, changedFields, newValues, userId } = params;

    // Only process deals
    if (objectSlug !== "deals") return;

    const stageChanged = changedFields.some((f) => f === "stage" || f === "deal-stage" || f === "status");

    if (stageChanged) {
      const channelName = "deals";
      const conversationId = await getOrCreateChannel(workspaceId, channelName);

      const newStage = (typeof newValues?.stage === "string" ? newValues.stage : null) ??
        (typeof newValues?.["deal-stage"] === "string" ? newValues["deal-stage"] as string : null);

      // Check if this is a closed-won transition
      if (newStage && isClosedWonStage(newStage)) {
        // Trigger close flow in background
        if (userId) {
          triggerCloseFlow(workspaceId, params.recordId, userId).catch(() => {});
        }

        const message = `🎉 Deal closed-won: **${recordSummary}**! I'm generating a customer handoff brief — you'll find it in the Approvals queue shortly.`;
        await postAgentMessage(conversationId, message, "Aria");
      } else {
        const stageLabel = newStage ? ` → ${newStage}` : "";
        const message = `🔄 Deal stage updated: **${recordSummary}**${stageLabel}. Want me to suggest next steps?`;
        await postAgentMessage(conversationId, message, "Aria");
      }

      // Evaluate approval rules for stage change
      if (userId && newStage) {
        evaluateDealForApproval(workspaceId, {
          dealId: params.recordId,
          newStage,
          requestedBy: userId,
        }).catch(() => {});
      }

      // Dispatch stage-specific webhook
      dispatchWebhookEvent(workspaceId, "deal.stage_changed", {
        recordId: params.recordId,
        objectSlug,
        recordSummary,
        newStage,
      }).catch(() => {});
    }

    // Dispatch generic record.updated webhook
    dispatchWebhookEvent(workspaceId, "record.updated", {
      recordId: params.recordId,
      objectSlug,
      objectSingularName: params.objectSingularName,
      recordSummary,
      changedFields,
    }).catch(() => {});
  } catch {
    // Never throw — this is fire-and-forget
  }
}
