/**
 * Sequences service — CRUD for email sequences, steps, and enrollments.
 */
import { db } from "@/db";
import {
  sequences,
  sequenceSteps,
  sequenceEnrollments,
  sequenceStepSends,
} from "@/db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SequenceSummary {
  id: string;
  name: string;
  description: string | null;
  status: string;
  steps: number;
  enrolled: number;
  replyRate: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSequenceInput {
  name: string;
  description?: string;
}

export interface UpdateSequenceInput {
  name?: string;
  description?: string;
  status?: "active" | "archived";
}

export interface CreateStepInput {
  stepNumber: number;
  delayDays: number;
  subject: string;
  body: string;
  variant?: string;
  variantWeight?: number;
}

// ─── Sequence CRUD ───────────────────────────────────────────────────────────

export async function listSequences(workspaceId: string): Promise<SequenceSummary[]> {
  const rows = await db
    .select({
      id: sequences.id,
      name: sequences.name,
      description: sequences.description,
      status: sequences.status,
      createdAt: sequences.createdAt,
      updatedAt: sequences.updatedAt,
    })
    .from(sequences)
    .where(eq(sequences.workspaceId, workspaceId))
    .orderBy(desc(sequences.createdAt));

  // Enrich with step count, enrollment count, reply rate
  const enriched = await Promise.all(
    rows.map(async (seq) => {
      const [stepCount] = await db
        .select({ count: count() })
        .from(sequenceSteps)
        .where(eq(sequenceSteps.sequenceId, seq.id));

      const [enrollmentCount] = await db
        .select({ count: count() })
        .from(sequenceEnrollments)
        .where(eq(sequenceEnrollments.sequenceId, seq.id));

      // Reply rate: count sends with replied=true / total sends
      const [sendStats] = await db
        .select({
          total: count(),
          replied: count(
            sql`CASE WHEN ${sequenceStepSends.replied} = true THEN 1 END`
          ),
        })
        .from(sequenceStepSends)
        .innerJoin(
          sequenceEnrollments,
          eq(sequenceStepSends.enrollmentId, sequenceEnrollments.id)
        )
        .where(eq(sequenceEnrollments.sequenceId, seq.id));

      const total = sendStats?.total ?? 0;
      const replied = sendStats?.replied ?? 0;
      const replyRate = total > 0 ? Math.round((replied / total) * 100) : 0;

      return {
        ...seq,
        steps: stepCount?.count ?? 0,
        enrolled: enrollmentCount?.count ?? 0,
        replyRate,
      };
    })
  );

  return enriched;
}

export async function getSequence(sequenceId: string, workspaceId: string) {
  const [seq] = await db
    .select()
    .from(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.workspaceId, workspaceId)))
    .limit(1);

  if (!seq) return null;

  const steps = await db
    .select()
    .from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, sequenceId))
    .orderBy(sequenceSteps.stepNumber);

  const enrollments = await db
    .select()
    .from(sequenceEnrollments)
    .where(eq(sequenceEnrollments.sequenceId, sequenceId))
    .orderBy(desc(sequenceEnrollments.enrolledAt));

  return { ...seq, steps, enrollments };
}

export async function createSequence(
  workspaceId: string,
  userId: string,
  input: CreateSequenceInput
) {
  const [seq] = await db
    .insert(sequences)
    .values({
      workspaceId,
      name: input.name,
      description: input.description ?? null,
      createdBy: userId,
    })
    .returning();

  return seq;
}

export async function updateSequence(
  sequenceId: string,
  workspaceId: string,
  input: UpdateSequenceInput
) {
  const [seq] = await db
    .update(sequences)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(and(eq(sequences.id, sequenceId), eq(sequences.workspaceId, workspaceId)))
    .returning();

  return seq ?? null;
}

export async function deleteSequence(sequenceId: string, workspaceId: string) {
  const [seq] = await db
    .delete(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.workspaceId, workspaceId)))
    .returning();

  return seq ?? null;
}

// ─── Steps CRUD ──────────────────────────────────────────────────────────────

export async function addStep(
  sequenceId: string,
  workspaceId: string,
  input: CreateStepInput
) {
  const [step] = await db
    .insert(sequenceSteps)
    .values({
      sequenceId,
      workspaceId,
      stepNumber: input.stepNumber,
      delayDays: input.delayDays,
      subject: input.subject,
      body: input.body,
      variant: input.variant ?? "a",
      variantWeight: input.variantWeight ?? 100,
    })
    .returning();

  return step;
}

export async function updateStep(
  stepId: string,
  input: Partial<CreateStepInput>
) {
  const [step] = await db
    .update(sequenceSteps)
    .set(input)
    .where(eq(sequenceSteps.id, stepId))
    .returning();

  return step ?? null;
}

export async function deleteStep(stepId: string) {
  const [step] = await db
    .delete(sequenceSteps)
    .where(eq(sequenceSteps.id, stepId))
    .returning();

  return step ?? null;
}

// ─── Enrollments ─────────────────────────────────────────────────────────────

export async function enrollContact(
  sequenceId: string,
  workspaceId: string,
  contactRecordId: string
) {
  // Check if already enrolled and active
  const [existing] = await db
    .select()
    .from(sequenceEnrollments)
    .where(
      and(
        eq(sequenceEnrollments.sequenceId, sequenceId),
        eq(sequenceEnrollments.contactRecordId, contactRecordId),
        eq(sequenceEnrollments.status, "active")
      )
    )
    .limit(1);

  if (existing) return existing;

  const [enrollment] = await db
    .insert(sequenceEnrollments)
    .values({
      sequenceId,
      contactRecordId,
      workspaceId,
      status: "active",
      currentStep: 0,
    })
    .returning();

  return enrollment;
}

export async function stopEnrollment(
  enrollmentId: string,
  reason: string
) {
  const [enrollment] = await db
    .update(sequenceEnrollments)
    .set({
      status: "stopped",
      stoppedReason: reason,
      stoppedAt: new Date(),
    })
    .where(eq(sequenceEnrollments.id, enrollmentId))
    .returning();

  return enrollment ?? null;
}
