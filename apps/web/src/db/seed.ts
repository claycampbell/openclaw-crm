import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { STANDARD_OBJECTS, DEAL_STAGES } from "@openclaw-crm/shared";
import { eq, and } from "drizzle-orm";

async function seed() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  console.log("Seeding database...");

  // Check if a workspace already exists
  const existingWorkspaces = await db.select().from(schema.workspaces).limit(1);
  if (existingWorkspaces.length > 0) {
    console.log("Database already seeded, skipping...");
    await client.end();
    return;
  }

  // Create default workspace
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name: "My Workspace",
      slug: "my-workspace",
      settings: {},
    })
    .returning();

  console.log(`Created workspace: ${workspace.name}`);

  // Create system user
  await db.insert(schema.users).values({
    id: "system",
    name: "System",
    email: "system@openclaw.com",
  });
  console.log("Created system user");

  // Seed standard objects (same logic as seedWorkspaceObjects in services/workspace.ts)
  for (const stdObj of STANDARD_OBJECTS) {
    const [object] = await db
      .insert(schema.objects)
      .values({
        workspaceId: workspace.id,
        slug: stdObj.slug,
        singularName: stdObj.singularName,
        pluralName: stdObj.pluralName,
        icon: stdObj.icon,
        isSystem: true,
      })
      .returning();

    console.log(`Created object: ${object.pluralName}`);

    for (let i = 0; i < stdObj.attributes.length; i++) {
      const attr = stdObj.attributes[i];
      const [attribute] = await db
        .insert(schema.attributes)
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

      console.log(`  Created attribute: ${attribute.title} (${attribute.type})`);

      if (stdObj.slug === "deals" && attr.slug === "stage") {
        for (const stage of DEAL_STAGES) {
          await db.insert(schema.statuses).values({
            attributeId: attribute.id,
            title: stage.title,
            color: stage.color,
            sortOrder: stage.sortOrder,
            isActive: stage.isActive,
            celebrationEnabled: stage.celebrationEnabled,
          });
        }
        console.log(`  Created ${DEAL_STAGES.length} deal stages`);
      }
    }
  }

  // Seed default agent channels
  const defaultChannels = ["general", "deals", "tasks"];
  for (const channelName of defaultChannels) {
    const existing = await db
      .select({ id: schema.conversations.id })
      .from(schema.conversations)
      .where(
        and(
          eq(schema.conversations.workspaceId, workspace.id),
          eq(schema.conversations.channelName, channelName),
          eq(schema.conversations.channelType, "channel")
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(schema.conversations).values({
        workspaceId: workspace.id,
        userId: "system",
        title: channelName,
        channelName,
        channelType: "channel",
      });
      console.log(`Created channel: #${channelName}`);
    }
  }

  console.log("Seeding complete!");
  await client.end();
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
