/**
 * AssemblyAI transcription service.
 * Handles speaker diarization, PII redaction, and AI summary generation.
 *
 * Required env vars:
 *   ASSEMBLYAI_API_KEY
 *   OPENROUTER_API_KEY (for AI summary — reuses workspace setting from AI chat)
 */
import { db } from "@/db";
import { callRecordings, generatedAssets } from "@/db/schema";
import { eq } from "drizzle-orm";

const ASSEMBLYAI_BASE = "https://api.assemblyai.com/v2";

// ─── PII Redaction ────────────────────────────────────────────────────────────

const PII_PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  // SSN
  {
    name: "ssn",
    regex: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    replacement: "[SSN REDACTED]",
  },
  // Credit card
  {
    name: "credit_card",
    regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    replacement: "[CARD REDACTED]",
  },
  // Phone numbers (US)
  {
    name: "phone",
    regex: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    replacement: "[PHONE REDACTED]",
  },
  // Email addresses
  {
    name: "email",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: "[EMAIL REDACTED]",
  },
  // Bank account numbers (8-12 digits)
  {
    name: "account",
    regex: /\b\d{8,12}\b/g,
    replacement: "[ACCOUNT REDACTED]",
  },
];

/**
 * Apply PII redaction to a transcript string using regex patterns.
 * Returns the redacted string suitable for AI processing.
 */
export function redactPII(transcript: string): string {
  let result = transcript;
  for (const { regex, replacement } of PII_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * Transcribe a call recording using AssemblyAI with speaker diarization.
 * Updates the call_recordings row with transcript and AI summary.
 * Creates a generated_asset for human review.
 */
export async function transcribeCall(callRecordingId: string): Promise<void> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error("[assemblyai] ASSEMBLYAI_API_KEY is not configured");
  }

  // Load the call recording
  const rows = await db
    .select()
    .from(callRecordings)
    .where(eq(callRecordings.id, callRecordingId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error(`[assemblyai] Call recording ${callRecordingId} not found`);
  }

  const recording = rows[0];

  if (!recording.recordingUrl) {
    throw new Error(`[assemblyai] No recording URL for call recording ${callRecordingId}`);
  }

  // Update status to transcribing
  await db
    .update(callRecordings)
    .set({ status: "transcribing" })
    .where(eq(callRecordings.id, callRecordingId));

  try {
    // Submit transcription job to AssemblyAI
    const submitRes = await fetch(`${ASSEMBLYAI_BASE}/transcript`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: recording.recordingUrl,
        speaker_labels: true,
        language_code: "en",
      }),
    });

    if (!submitRes.ok) {
      const text = await submitRes.text();
      throw new Error(`[assemblyai] Submission failed ${submitRes.status}: ${text}`);
    }

    const submitData = await submitRes.json() as { id: string; status: string };
    const transcriptId = submitData.id;

    // Store transcript ID
    await db
      .update(callRecordings)
      .set({ assemblyaiTranscriptId: transcriptId })
      .where(eq(callRecordings.id, callRecordingId));

    // Poll for completion (max 10 minutes with 5-second intervals)
    let transcriptData: AssemblyAITranscriptResponse | null = null;
    for (let attempt = 0; attempt < 120; attempt++) {
      await delay(5000);

      const pollRes = await fetch(`${ASSEMBLYAI_BASE}/transcript/${transcriptId}`, {
        headers: { Authorization: apiKey },
      });

      const data = await pollRes.json() as AssemblyAITranscriptResponse;

      if (data.status === "completed") {
        transcriptData = data;
        break;
      }

      if (data.status === "error") {
        throw new Error(`[assemblyai] Transcription failed: ${data.error ?? "Unknown error"}`);
      }
    }

    if (!transcriptData) {
      throw new Error(`[assemblyai] Transcription timed out for ${transcriptId}`);
    }

    // Build speaker-diarized transcript from utterances
    const transcriptRaw = buildDiarizedTranscript(transcriptData);
    const transcriptRedacted = redactPII(transcriptRaw);

    // Generate AI summary using only redacted transcript
    const aiSummary = await generateCallSummary(
      recording.workspaceId,
      transcriptRedacted
    ).catch((err) => {
      console.error("[assemblyai] AI summary generation failed:", err);
      return null;
    });

    // Update call recording with results
    await db
      .update(callRecordings)
      .set({
        transcriptRaw,
        transcriptRedacted,
        aiSummary,
        status: "transcribed",
      })
      .where(eq(callRecordings.id, callRecordingId));

    // Create generated_asset for human review if AI summary was generated
    if (aiSummary && recording.recordId) {
      await db.insert(generatedAssets).values({
        workspaceId: recording.workspaceId,
        recordId: recording.recordId,
        assetType: "handoff_brief",
        status: "pending_approval",
        title: `Call Summary — ${new Date().toLocaleDateString()}`,
        content: aiSummary,
      });
    }
  } catch (err) {
    await db
      .update(callRecordings)
      .set({
        status: "failed",
        // Store error in a field we have
      })
      .where(eq(callRecordings.id, callRecordingId));
    throw err;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface AssemblyAITranscriptResponse {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string;
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  error?: string;
}

/**
 * Build a readable speaker-diarized transcript from AssemblyAI utterances.
 */
function buildDiarizedTranscript(data: AssemblyAITranscriptResponse): string {
  const utterances = data.utterances ?? [];

  if (utterances.length === 0) {
    return data.text ?? "";
  }

  return utterances
    .map((u) => {
      const startMs = u.start;
      const minutes = Math.floor(startMs / 60000);
      const seconds = Math.floor((startMs % 60000) / 1000);
      const timestamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      return `[${timestamp}] Speaker ${u.speaker}: ${u.text}`;
    })
    .join("\n");
}

/**
 * Generate an AI call summary using OpenRouter.
 * Only operates on the PII-redacted transcript.
 */
async function generateCallSummary(
  workspaceId: string,
  transcriptRedacted: string
): Promise<string | null> {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  if (!openrouterKey) {
    console.warn("[assemblyai] OPENROUTER_API_KEY not set — skipping AI summary");
    return null;
  }

  const prompt = `You are analyzing a sales call transcript. The transcript has been PII-redacted for privacy.

Please provide a structured summary with:
1. **Key Topics Discussed** (bullet points)
2. **Action Items** (what each party committed to)
3. **Next Steps** (agreed follow-up actions)
4. **Deal Signals** (buying signals, objections, or concerns raised)

Transcript:
${transcriptRedacted.substring(0, 8000)}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openrouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "anthropic/claude-3-haiku",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    throw new Error(`[assemblyai] OpenRouter failed ${res.status}`);
  }

  const data = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
