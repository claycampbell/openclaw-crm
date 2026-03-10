/**
 * Tiered context assembler for background AI generation.
 *
 * IMPORTANT: This is NOT buildSystemPrompt. It does not include workspace object schema.
 * It assembles deal/contact/company context only — lean and focused for generation quality.
 *
 * Tier "light": <2000 tokens — deal summary + company + contacts + 2 recent notes
 * Tier "full":  <8000 tokens — everything in light + all attributes + 5 notes + signals + emails
 */
import { db } from "@/db";
import {
  records,
  recordValues,
  attributes,
  objects,
  notes,
  signalEvents,
  emailMessages,
} from "@/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecordValueRow {
  slug: string;
  textValue: string | null;
  numberValue: string | null;
  dateValue: string | null;
  booleanValue: boolean | null;
  referencedRecordId: string | null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Assemble context for a given record (deal ID) at the specified tier.
 * Returns a markdown string ready to paste into an LLM prompt.
 *
 * Does NOT call buildSystemPrompt — workspace schema is not included.
 */
export async function assembleContext(
  workspaceId: string,
  recordId: string,
  tier: "light" | "full"
): Promise<string> {
  const sections: string[] = [];

  // 1. Load the primary record values
  const primaryValues = await loadRecordValues(recordId);
  if (primaryValues.length > 0) {
    sections.push(formatRecordValues("Deal / Record", primaryValues));
  }

  // 2. Load linked company (referenced records from this record's attributes)
  const companyRef = primaryValues.find(
    (v) =>
      v.referencedRecordId &&
      (v.slug.includes("company") || v.slug.includes("account"))
  );
  if (companyRef?.referencedRecordId) {
    const companyValues = await loadRecordValues(companyRef.referencedRecordId);
    if (companyValues.length > 0) {
      sections.push(formatRecordValues("Company", companyValues));
    }
  }

  // 3. Load linked contacts (limit 3 for light, 5 for full)
  const contactLimit = tier === "light" ? 3 : 5;
  const contactRefs = primaryValues
    .filter(
      (v) =>
        v.referencedRecordId &&
        (v.slug.includes("contact") || v.slug.includes("people") || v.slug.includes("person"))
    )
    .slice(0, contactLimit);

  for (const ref of contactRefs) {
    if (ref.referencedRecordId) {
      const contactValues = await loadRecordValues(ref.referencedRecordId);
      if (contactValues.length > 0) {
        sections.push(formatRecordValues("Contact", contactValues));
      }
    }
  }

  // 4. Load recent notes
  const noteLimit = tier === "light" ? 2 : 5;
  const recentNotes = await db
    .select({ content: notes.content, createdAt: notes.createdAt })
    .from(notes)
    .where(eq(notes.recordId, recordId))
    .orderBy(desc(notes.createdAt))
    .limit(noteLimit);

  if (recentNotes.length > 0) {
    const noteLines = recentNotes.map(
      (n, i) =>
        `Note ${i + 1} (${n.createdAt.toLocaleDateString()}):\n${stripHtml(n.content ?? "")}`
    );
    sections.push(`## Notes\n\n${noteLines.join("\n\n")}`);
  }

  // 5. Full tier extras
  if (tier === "full") {
    // Load last 10 signal events
    const signals = await db
      .select({
        type: signalEvents.type,
        source: signalEvents.source,
        payload: signalEvents.payload,
        occurredAt: signalEvents.occurredAt,
      })
      .from(signalEvents)
      .where(
        and(
          eq(signalEvents.workspaceId, workspaceId),
          eq(signalEvents.recordId, recordId)
        )
      )
      .orderBy(desc(signalEvents.occurredAt))
      .limit(10);

    if (signals.length > 0) {
      const signalLines = signals.map(
        (s) =>
          `- [${s.occurredAt.toLocaleDateString()}] ${s.type} (${s.source})`
      );
      sections.push(`## Recent Activity Signals\n\n${signalLines.join("\n")}`);
    }

    // Load last 5 email subjects
    const emails = await db
      .select({
        subject: emailMessages.subject,
        direction: emailMessages.direction,
        sentAt: emailMessages.sentAt,
      })
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.workspaceId, workspaceId),
          eq(emailMessages.recordId, recordId)
        )
      )
      .orderBy(desc(emailMessages.sentAt))
      .limit(5);

    if (emails.length > 0) {
      const emailLines = emails.map(
        (e) =>
          `- [${e.sentAt?.toLocaleDateString() ?? "unknown"}] ${e.direction === "inbound" ? "Received" : "Sent"}: "${e.subject ?? "(no subject)"}"`
      );
      sections.push(`## Email History (Recent)\n\n${emailLines.join("\n")}`);
    }
  }

  if (sections.length === 0) {
    return "(No context available for this record)";
  }

  return sections.join("\n\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function loadRecordValues(recordId: string): Promise<RecordValueRow[]> {
  const rows = await db
    .select({
      slug: attributes.slug,
      textValue: recordValues.textValue,
      numberValue: recordValues.numberValue,
      dateValue: recordValues.dateValue,
      booleanValue: recordValues.booleanValue,
      referencedRecordId: recordValues.referencedRecordId,
    })
    .from(recordValues)
    .innerJoin(attributes, eq(recordValues.attributeId, attributes.id))
    .where(eq(recordValues.recordId, recordId));

  return rows;
}

function formatRecordValues(label: string, values: RecordValueRow[]): string {
  const lines: string[] = [`## ${label}`];

  for (const v of values) {
    const rawValue = v.textValue ?? v.numberValue ?? v.dateValue;
    if (rawValue !== null && rawValue !== undefined && rawValue !== "") {
      const displayValue =
        typeof rawValue === "string" && rawValue.length > 200
          ? rawValue.substring(0, 200) + "..."
          : rawValue;
      lines.push(`- **${slugToLabel(v.slug)}**: ${displayValue}`);
    } else if (v.booleanValue !== null && v.booleanValue !== undefined) {
      lines.push(`- **${slugToLabel(v.slug)}**: ${v.booleanValue ? "Yes" : "No"}`);
    }
  }

  return lines.join("\n");
}

function slugToLabel(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
