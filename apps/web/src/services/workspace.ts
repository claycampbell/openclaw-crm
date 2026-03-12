import { db } from "@/db";
import { workspaces, workspaceMembers, users, objects, attributes, statuses } from "@/db/schema";
import { eq, and, sql, isNull, inArray } from "drizzle-orm";
import { STANDARD_OBJECTS, DEAL_STAGES, type WorkspaceType } from "@openclaw-crm/shared";
import { seedDefaultChannels } from "./agent-channels";

// ─── Workspace ───────────────────────────────────────────────────────

export async function getWorkspace(workspaceId: string) {
  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateWorkspace(
  workspaceId: string,
  input: { name?: string; settings?: Record<string, unknown> }
) {
  const [updated] = await db
    .update(workspaces)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.settings !== undefined && { settings: input.settings }),
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspaceId))
    .returning();
  return updated;
}

/** Create a new workspace with the creator as admin, and seed standard objects */
export async function createWorkspace(name: string, userId: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "workspace";

  // Ensure slug uniqueness by appending random suffix
  const existingSlugs = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  const finalSlug = existingSlugs.length > 0
    ? `${slug}-${crypto.randomUUID().slice(0, 8)}`
    : slug;

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name,
      slug: finalSlug,
      settings: {},
    })
    .returning();

  // Add creator as admin
  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "admin",
  });

  // Seed standard objects
  await seedWorkspaceObjects(workspace.id);

  // Seed default agent channels
  await seedDefaultChannels(workspace.id);

  return workspace;
}

/**
 * Create a workspace with explicit type and optional parent.
 * Validates hierarchy rules:
 * - agency: no parent allowed
 * - company: parent must be an agency (or null for standalone)
 * - business_unit: parent must be a company
 */
export async function createWorkspaceWithHierarchy(
  name: string,
  type: WorkspaceType,
  userId: string,
  parentWorkspaceId?: string | null
) {
  // Validate hierarchy constraints
  if (type === "agency" && parentWorkspaceId) {
    throw new Error("Agency workspaces cannot have a parent");
  }

  if (type === "business_unit") {
    if (!parentWorkspaceId) {
      throw new Error("Business unit must have a parent company");
    }
    const parent = await getWorkspace(parentWorkspaceId);
    if (!parent) throw new Error("Parent workspace not found");
    if (parent.type !== "company") {
      throw new Error("Business unit parent must be a company workspace");
    }
  }

  if (type === "company" && parentWorkspaceId) {
    const parent = await getWorkspace(parentWorkspaceId);
    if (!parent) throw new Error("Parent workspace not found");
    if (parent.type !== "agency") {
      throw new Error("Company parent must be an agency workspace");
    }
  }

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "workspace";

  const existingSlugs = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);

  const finalSlug = existingSlugs.length > 0
    ? `${slug}-${crypto.randomUUID().slice(0, 8)}`
    : slug;

  const [workspace] = await db
    .insert(workspaces)
    .values({
      name,
      slug: finalSlug,
      type,
      parentWorkspaceId: parentWorkspaceId ?? null,
      settings: {},
    })
    .returning();

  // Add creator as admin
  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId,
    role: "admin",
  });

  // Seed standard objects for company and BU workspaces (not agency)
  if (type !== "agency") {
    await seedWorkspaceObjects(workspace.id);
    await seedDefaultChannels(workspace.id);
  }

  return workspace;
}

/**
 * Get workspace with its parent and direct children.
 */
export async function getWorkspaceWithHierarchy(workspaceId: string) {
  const workspace = await getWorkspace(workspaceId);
  if (!workspace) return null;

  const parent = workspace.parentWorkspaceId
    ? await getWorkspace(workspace.parentWorkspaceId)
    : null;

  const children = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.parentWorkspaceId, workspaceId))
    .orderBy(workspaces.name);

  return {
    ...workspace,
    parent: parent ? { id: parent.id, name: parent.name, slug: parent.slug, type: parent.type } : null,
    children: children.map(c => ({ id: c.id, name: c.name, slug: c.slug, type: c.type })),
  };
}

/**
 * Get all descendant workspace IDs (children + grandchildren) using recursive CTE.
 * For a company: returns its BU IDs.
 * For an agency: returns company IDs + their BU IDs.
 */
export async function getDescendantWorkspaceIds(workspaceId: string): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE descendants AS (
      SELECT id FROM workspaces WHERE parent_workspace_id = ${workspaceId}
      UNION ALL
      SELECT w.id FROM workspaces w
      INNER JOIN descendants d ON w.parent_workspace_id = d.id
    )
    SELECT id FROM descendants
  `);
  return Array.from(result).map(r => r.id);
}

/**
 * Get the full three-tier tree starting from an agency workspace.
 * Returns agency → companies → business units structure.
 */
export async function getWorkspaceTree(agencyId: string) {
  const agency = await getWorkspace(agencyId);
  if (!agency || agency.type !== "agency") return null;

  const companies = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.parentWorkspaceId, agencyId), eq(workspaces.type, "company")))
    .orderBy(workspaces.name);

  const companyIds = companies.map(c => c.id);
  const allBUs = companyIds.length > 0
    ? await db
        .select()
        .from(workspaces)
        .where(and(inArray(workspaces.parentWorkspaceId, companyIds), eq(workspaces.type, "business_unit")))
        .orderBy(workspaces.name)
    : [];

  // Group BUs by parent company
  const busByCompany = new Map<string, typeof allBUs>();
  for (const bu of allBUs) {
    const arr = busByCompany.get(bu.parentWorkspaceId!) ?? [];
    arr.push(bu);
    busByCompany.set(bu.parentWorkspaceId!, arr);
  }

  return {
    agency: { id: agency.id, name: agency.name, slug: agency.slug, type: agency.type as "agency" },
    companies: companies.map(c => ({
      company: { id: c.id, name: c.name, slug: c.slug, type: c.type as "company" },
      businessUnits: (busByCompany.get(c.id) ?? []).map(bu => ({
        id: bu.id, name: bu.name, slug: bu.slug, type: bu.type as "business_unit",
      })),
    })),
  };
}

/** List all workspaces a user is a member of (includes type + parent info) */
export async function listUserWorkspaces(userId: string) {
  return db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      type: workspaces.type,
      parentWorkspaceId: workspaces.parentWorkspaceId,
      role: workspaceMembers.role,
      createdAt: workspaces.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaces.createdAt);
}

/** Seed standard objects (People, Companies, Deals) + attributes + deal stages for a workspace */
export async function seedWorkspaceObjects(workspaceId: string) {
  for (const stdObj of STANDARD_OBJECTS) {
    const [object] = await db
      .insert(objects)
      .values({
        workspaceId,
        slug: stdObj.slug,
        singularName: stdObj.singularName,
        pluralName: stdObj.pluralName,
        icon: stdObj.icon,
        isSystem: true,
      })
      .returning();

    for (let i = 0; i < stdObj.attributes.length; i++) {
      const attr = stdObj.attributes[i];
      const [attribute] = await db
        .insert(attributes)
        .values({
          objectId: object.id,
          slug: attr.slug,
          title: attr.title,
          type: attr.type,
          config: attr.config || {},
          isSystem: attr.isSystem,
          isRequired: attr.isRequired,
          isUnique: attr.isUnique,
          isMultiselect: attr.isMultiselect,
          sortOrder: i,
        })
        .returning();

      // Create deal stages for the "stage" status attribute
      if (stdObj.slug === "deals" && attr.slug === "stage") {
        for (const stage of DEAL_STAGES) {
          await db.insert(statuses).values({
            attributeId: attribute.id,
            title: stage.title,
            color: stage.color,
            sortOrder: stage.sortOrder,
            isActive: stage.isActive,
            celebrationEnabled: stage.celebrationEnabled,
          });
        }
      }
    }
  }
}

// ─── Members ─────────────────────────────────────────────────────────

export async function listMembers(workspaceId: string) {
  return db
    .select({
      id: workspaceMembers.id,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      createdAt: workspaceMembers.createdAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(workspaceMembers.createdAt);
}

export async function addMemberByEmail(
  workspaceId: string,
  email: string,
  role: "admin" | "member" = "member"
) {
  // Find user by email
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);

  if (userRows.length === 0) {
    throw new Error("No user found with that email address");
  }

  const user = userRows[0];

  // Check if already a member
  const existing = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, user.id)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("User is already a member of this workspace");
  }

  const [member] = await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId: user.id, role })
    .returning();

  return {
    ...member,
    userName: user.name,
    userEmail: user.email,
    userImage: user.image,
  };
}

export async function updateMemberRole(
  workspaceId: string,
  memberId: string,
  role: "admin" | "member"
) {
  const [updated] = await db
    .update(workspaceMembers)
    .set({ role })
    .where(
      and(
        eq(workspaceMembers.id, memberId),
        eq(workspaceMembers.workspaceId, workspaceId)
      )
    )
    .returning();
  return updated ?? null;
}

export async function removeMember(workspaceId: string, memberId: string) {
  const rows = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, memberId),
        eq(workspaceMembers.workspaceId, workspaceId)
      )
    )
    .limit(1);

  if (rows.length === 0) return null;

  // Don't allow removing the last admin
  if (rows[0].role === "admin") {
    const adminCount = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.role, "admin")
        )
      );
    if (adminCount.length <= 1) {
      throw new Error("Cannot remove the last admin");
    }
  }

  await db
    .delete(workspaceMembers)
    .where(eq(workspaceMembers.id, memberId));

  return rows[0];
}
