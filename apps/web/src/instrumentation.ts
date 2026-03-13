export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerJobHandler } = await import("@/services/job-queue");
    const { evaluateSignalById } = await import("@/services/automation-engine");

    // signal_evaluate: evaluates automation rules for a signal event
    registerJobHandler("signal_evaluate", async (payload) => {
      const { signalEventId } = payload as { signalEventId: string };
      if (!signalEventId) throw new Error("signal_evaluate job missing signalEventId");
      await evaluateSignalById(signalEventId);
    });

    // ai_generate: dispatches to the appropriate document generator
    registerJobHandler("ai_generate", async (payload) => {
      const { workspaceId, recordId, documentType, contextTier, competitorName } = payload as {
        workspaceId: string;
        recordId?: string;
        documentType?: string;
        contextTier?: string;
        competitorName?: string;
      };

      if (!workspaceId || !recordId) {
        console.warn("[job:ai_generate] Missing workspaceId or recordId, skipping");
        return;
      }

      try {
        switch (documentType) {
          case "opportunity_brief": {
            const { generateOpportunityBrief } = await import("@/services/documents/brief");
            await generateOpportunityBrief(workspaceId, recordId);
            break;
          }
          case "proposal": {
            const { generateProposal } = await import("@/services/documents/proposal");
            await generateProposal(workspaceId, recordId);
            break;
          }
          case "followup": {
            const { generatePostMeetingFollowup } = await import("@/services/documents/followup");
            const triggerType = (payload as Record<string, unknown>).triggerType as string | undefined;
            const noteText = (payload as Record<string, unknown>).noteText as string | undefined;
            await generatePostMeetingFollowup(workspaceId, recordId, {
              type: (triggerType ?? "meeting_ended") as "meeting_ended" | "note_added",
              noteText,
            });
            break;
          }
          case "meeting_prep": {
            const { generateMeetingPrepBrief } = await import("@/services/documents/followup");
            const meetingId = (payload as Record<string, unknown>).meetingId as string ?? "";
            await generateMeetingPrepBrief(workspaceId, recordId, meetingId);
            break;
          }
          case "battlecard": {
            const { generateBattlecard } = await import("@/services/documents/battlecard");
            await generateBattlecard(workspaceId, recordId, competitorName ?? "Unknown");
            break;
          }
          case "deck": {
            // Deck generation reuses proposal with different framing
            const { generateProposal } = await import("@/services/documents/proposal");
            await generateProposal(workspaceId, recordId);
            break;
          }
          default: {
            console.warn(`[job:ai_generate] Unknown document type: ${documentType}`);
            // Create a placeholder draft for unknown types
            const generatedAssetsService = await import("@/services/generated-assets");
            await generatedAssetsService.createDraft({
              workspaceId,
              recordId,
              assetType: ((documentType ?? "opportunity_brief") as any),
              content: `[Placeholder — no generator for type "${documentType}"]`,
              modelUsed: "placeholder",
              promptVersion: "v0",
            });
          }
        }
        console.log(`[job:ai_generate] Completed ${documentType} for record ${recordId}`);
      } catch (err) {
        console.error(`[job:ai_generate] Failed ${documentType} for record ${recordId}:`, err);
        throw err; // Re-throw for retry
      }
    });
  }
}
