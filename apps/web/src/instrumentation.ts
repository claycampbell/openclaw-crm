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

    // ai_generate: placeholder until Phase 3 document generators are built
    // Creates a placeholder draft in non-production for inbox testing
    registerJobHandler("ai_generate", async (payload) => {
      const { workspaceId, recordId, documentType } = payload as {
        workspaceId: string;
        recordId?: string;
        documentType?: string;
      };
      if (process.env.NODE_ENV !== "production") {
        const generatedAssetsService = await import("@/services/generated-assets");
        await generatedAssetsService.createDraft({
          workspaceId,
          recordId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          assetType: ((documentType ?? "opportunity_brief") as any),
          content: `[Placeholder draft — ai_generate job received for ${documentType ?? "unknown"} on record ${recordId ?? "none"}]`,
          modelUsed: "placeholder",
          promptVersion: "v0",
        });
      } else {
        console.log("[job:ai_generate] Pending full implementation in Phase 3:", payload);
      }
    });
  }
}
