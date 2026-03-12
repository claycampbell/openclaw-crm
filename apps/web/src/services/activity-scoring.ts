/**
 * Activity Scoring Service
 * 
 * Computes a composite activity score for each record based on:
 * - Number of notes (weight: 3)
 * - Number of tasks (weight: 2)
 * - Number of completed tasks (weight: 1)
 * - Recency of last activity (exponential decay over 30 days)
 * 
 * Score = (notes * 3 + tasks * 2 + completedTasks * 1) * recencyMultiplier
 */
import { db } from "@/db";
import { records, recordValues, notes, tasks, taskRecords, objects, attributes } from "@/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

interface ScoredRecord {
  id: string;
  objectSlug: string;
  objectName: string;
  name: string;
  noteCount: number;
  taskCount: number;
  completedTaskCount: number;
  lastActivityAt: string | null;
  score: number;
}

/**
 * Get top scored records for a workspace.
 * Returns records sorted by activity score descending.
 */
export async function getHotLeads(
  workspaceId: string,
  limit: number = 20
): Promise<ScoredRecord[]> {
  // Get all records with their object info
  const allRecords = await db
    .select({
      id: records.id,
      objectId: records.objectId,
      createdAt: records.createdAt,
    })
    .from(records)
    .innerJoin(objects, eq(objects.id, records.objectId))
    .where(eq(objects.workspaceId, workspaceId))
    .limit(500); // Cap for performance

  if (allRecords.length === 0) return [];

  // Get object info
  const objectInfos = await db
    .select({
      id: objects.id,
      slug: objects.slug,
      singularName: objects.singularName,
    })
    .from(objects)
    .where(eq(objects.workspaceId, workspaceId));

  const objectMap = new Map(objectInfos.map((o) => [o.id, o]));

  // Get name attribute for each object
  const nameAttrs = await db
    .select({
      id: attributes.id,
      objectId: attributes.objectId,
      slug: attributes.slug,
    })
    .from(attributes)
    .where(
      and(
        sql`${attributes.objectId} IN (${sql.join(objectInfos.map((o) => sql`${o.id}`), sql`,`)})`,
        eq(attributes.slug, "name")
      )
    );

  const nameAttrMap = new Map(nameAttrs.map((a) => [a.objectId, a.id]));

  // Get names for all records
  const recordIds = allRecords.map((r) => r.id);
  const nameValues = nameAttrMap.size > 0
    ? await db
        .select({
          recordId: recordValues.recordId,
          textValue: recordValues.textValue,
          jsonValue: recordValues.jsonValue,
        })
        .from(recordValues)
        .where(
          and(
            sql`${recordValues.recordId} IN (${sql.join(recordIds.map((id) => sql`${id}`), sql`,`)})`,
            sql`${recordValues.attributeId} IN (${sql.join(
              Array.from(nameAttrMap.values()).map((id) => sql`${id}`),
              sql`,`
            )})`
          )
        )
    : [];

  const nameMap = new Map<string, string>();
  for (const nv of nameValues) {
    const name = nv.textValue
      || (nv.jsonValue && typeof nv.jsonValue === "object"
          ? ((nv.jsonValue as any).fullName || `${(nv.jsonValue as any).firstName || ""} ${(nv.jsonValue as any).lastName || ""}`.trim())
          : null)
      || "Unnamed";
    nameMap.set(nv.recordId, name);
  }

  // Count notes per record
  const noteCountsResult = await db
    .select({
      recordId: notes.recordId,
      count: count(),
    })
    .from(notes)
    .where(sql`${notes.recordId} IN (${sql.join(recordIds.map((id) => sql`${id}`), sql`,`)})`)
    .groupBy(notes.recordId);

  const noteCountMap = new Map(noteCountsResult.map((n) => [n.recordId, Number(n.count)]));

  // Count tasks per record (tasks linked via taskRecords join table)
  const taskCountsResult = await db
    .select({
      recordId: taskRecords.recordId,
      total: count(),
      completed: sql<number>`SUM(CASE WHEN ${tasks.isCompleted} = true THEN 1 ELSE 0 END)`,
    })
    .from(taskRecords)
    .innerJoin(tasks, eq(tasks.id, taskRecords.taskId))
    .where(sql`${taskRecords.recordId} IN (${sql.join(recordIds.map((id) => sql`${id}`), sql`,`)})`)
    .groupBy(taskRecords.recordId);

  const taskCountMap = new Map(
    taskCountsResult.map((t) => [t.recordId, { total: Number(t.total), completed: Number(t.completed) }])
  );

  // Get last activity timestamps (most recent of: note created, task created)
  const lastNotes = await db
    .select({
      recordId: notes.recordId,
      lastAt: sql<string>`MAX(${notes.createdAt})`,
    })
    .from(notes)
    .where(sql`${notes.recordId} IN (${sql.join(recordIds.map((id) => sql`${id}`), sql`,`)})`)
    .groupBy(notes.recordId);

  const lastNoteMap = new Map(lastNotes.map((n) => [n.recordId, new Date(n.lastAt)]));

  const lastTasks = await db
    .select({
      recordId: taskRecords.recordId,
      lastAt: sql<string>`MAX(${tasks.createdAt})`,
    })
    .from(taskRecords)
    .innerJoin(tasks, eq(tasks.id, taskRecords.taskId))
    .where(sql`${taskRecords.recordId} IN (${sql.join(recordIds.map((id) => sql`${id}`), sql`,`)})`)
    .groupBy(taskRecords.recordId);

  const lastTaskMap = new Map(lastTasks.map((t) => [t.recordId, new Date(t.lastAt)]));

  // Compute scores
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

  const scored: ScoredRecord[] = allRecords.map((r) => {
    const obj = objectMap.get(r.objectId);
    const noteCount = noteCountMap.get(r.id) ?? 0;
    const taskData = taskCountMap.get(r.id) ?? { total: 0, completed: 0 };

    // Last activity
    const lastNote = lastNoteMap.get(r.id);
    const lastTask = lastTaskMap.get(r.id);
    const lastActivity = lastNote && lastTask
      ? new Date(Math.max(lastNote.getTime(), lastTask.getTime()))
      : lastNote ?? lastTask ?? null;

    // Raw score
    const rawScore = noteCount * 3 + taskData.total * 2 + taskData.completed * 1;

    // Recency multiplier (1.0 for today, decays to ~0.37 after 30 days)
    let recencyMultiplier = 1;
    if (lastActivity) {
      const age = now - lastActivity.getTime();
      recencyMultiplier = Math.exp(-age / THIRTY_DAYS);
    } else if (r.createdAt) {
      const age = now - new Date(r.createdAt).getTime();
      recencyMultiplier = Math.exp(-age / THIRTY_DAYS) * 0.5; // Lower weight for just creation
    }

    const score = Math.round(rawScore * recencyMultiplier * 100) / 100;

    return {
      id: r.id,
      objectSlug: obj?.slug ?? "unknown",
      objectName: obj?.singularName ?? "Record",
      name: nameMap.get(r.id) ?? "Unnamed",
      noteCount,
      taskCount: taskData.total,
      completedTaskCount: taskData.completed,
      lastActivityAt: lastActivity?.toISOString() ?? null,
      score,
    };
  });

  // Sort by score descending and return top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
