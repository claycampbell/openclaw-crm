/**
 * Vivid CRM data import script.
 *
 * Reads 4 Pipedrive export CSVs from DATA_DIR and inserts them into a new
 * "Vivid" workspace, mapping to our standard People / Companies / Deals objects.
 *
 * Usage:
 *   cd apps/web && pnpm db:seed-vivid
 *   DATA_DIR=../../Data/Vivid cd apps/web && pnpm db:seed-vivid  (custom path)
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { STANDARD_OBJECTS, DEAL_STAGES } from "@openclaw-crm/shared";
import { eq } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "../../../../Data/Vivid");

const WORKSPACE_NAME = "Vivid";
const WORKSPACE_SLUG = "vivid";

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  // Parse a single CSV line respecting quoted fields
  function parseLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] ?? "").trim();
    });
    return row;
  });
}

// ---------------------------------------------------------------------------
// Stage mapping  (Pipedrive stage name + status → our deal stage title)
// ---------------------------------------------------------------------------

function mapDealStage(pipedriveStatus: string, pipedriveStage: string): string {
  const s = pipedriveStatus.toLowerCase();
  if (s === "won") return "Won";
  if (s === "lost") return "Lost";

  // Open deal — infer from stage name
  const stage = pipedriveStage.toLowerCase();
  if (
    stage.includes("verbal") ||
    stage.includes("get that paper") ||
    stage.includes("get signature") ||
    stage.includes("gam!")
  ) {
    return "Negotiation";
  }
  if (
    stage.includes("proposal") ||
    stage.includes("m3") ||
    stage.includes("evaluation")
  ) {
    return "Proposal";
  }
  if (
    stage.includes("qualified opportunity") ||
    stage.includes("m2") ||
    stage.includes("bant") ||
    stage.includes("shape opportunity")
  ) {
    return "Qualified";
  }
  // Default for any lead/contact/early stage
  return "Lead";
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = postgres(connectionString);
  const db = drizzle(client, { schema });

  // -------------------------------------------------------------------------
  // 1. Create workspace
  // -------------------------------------------------------------------------

  const existing = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, WORKSPACE_SLUG));

  if (existing.length > 0) {
    console.error(`Workspace "${WORKSPACE_SLUG}" already exists. Aborting.`);
    await client.end();
    process.exit(1);
  }

  const [workspace] = await db
    .insert(schema.workspaces)
    .values({ name: WORKSPACE_NAME, slug: WORKSPACE_SLUG, settings: {} })
    .returning();

  console.log(`✓ Created workspace: ${workspace.name} (${workspace.id})`);

  // -------------------------------------------------------------------------
  // 2. Seed standard objects + attributes
  // -------------------------------------------------------------------------

  // objectSlug → { objectId, attributes: { attrSlug → { id, type } } }
  const objectMap: Record<
    string,
    { id: string; attrs: Record<string, { id: string; type: string }> }
  > = {};

  // stage title → status row id (for deals)
  const dealStageMap: Record<string, string> = {};

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

    console.log(`  ✓ Object: ${object.pluralName}`);

    objectMap[stdObj.slug] = { id: object.id, attrs: {} };

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

      objectMap[stdObj.slug].attrs[attr.slug] = {
        id: attribute.id,
        type: attr.type,
      };

      if (stdObj.slug === "deals" && attr.slug === "stage") {
        for (const stage of DEAL_STAGES) {
          const [status] = await db
            .insert(schema.statuses)
            .values({
              attributeId: attribute.id,
              title: stage.title,
              color: stage.color,
              sortOrder: stage.sortOrder,
              isActive: stage.isActive,
              celebrationEnabled: stage.celebrationEnabled,
            })
            .returning();
          dealStageMap[stage.title] = status.id;
        }
        console.log(`    ✓ Deal stages: ${Object.keys(dealStageMap).join(", ")}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Helper: insert a record_value row
  // -------------------------------------------------------------------------

  async function insertValue(
    recordId: string,
    attributeId: string,
    type: string,
    value: unknown,
    sortOrder = 0
  ) {
    const base = { recordId, attributeId, sortOrder };

    if (type === "text" || type === "email_address" || type === "phone_number" || type === "domain" || type === "select" || type === "actor_reference") {
      if (!value || (value as string).trim() === "") return;
      await db.insert(schema.recordValues).values({ ...base, textValue: (value as string).trim() });
    } else if (type === "status") {
      if (!value) return;
      await db.insert(schema.recordValues).values({ ...base, textValue: value as string });
    } else if (type === "currency") {
      const v = value as { amount: number; currency: string };
      if (!v || isNaN(v.amount)) return;
      await db.insert(schema.recordValues).values({ ...base, jsonValue: v });
    } else if (type === "personal_name") {
      await db.insert(schema.recordValues).values({ ...base, jsonValue: value });
    } else if (type === "date") {
      if (!value || (value as string).trim() === "") return;
      await db.insert(schema.recordValues).values({ ...base, dateValue: (value as string).trim() });
    } else if (type === "record_reference") {
      if (!value) return;
      await db.insert(schema.recordValues).values({ ...base, referencedRecordId: value as string });
    } else if (type === "location") {
      await db.insert(schema.recordValues).values({ ...base, jsonValue: value });
    }
  }

  // -------------------------------------------------------------------------
  // 3. Import Organizations → Companies
  // -------------------------------------------------------------------------

  const orgsFile = path.join(DATA_DIR, "organizations-18538704-15.csv");
  const orgsRows = parseCSV(orgsFile);

  // pipedrive org ID → our record ID
  const orgIdMap: Record<string, string> = {};

  const companiesObj = objectMap["companies"];

  let orgCount = 0;
  for (const row of orgsRows) {
    const name = row["Name"];
    if (!name) continue;

    const [record] = await db
      .insert(schema.records)
      .values({ objectId: companiesObj.id })
      .returning();

    orgIdMap[row["ID"]] = record.id;

    // Name
    await insertValue(record.id, companiesObj.attrs["name"].id, "text", name);

    // Website → domain
    const website = row["Website"] || row["Website "];
    if (website) {
      // strip http(s):// and trailing slash for domain storage
      const domain = website.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
      if (domain) {
        await insertValue(record.id, companiesObj.attrs["domains"].id, "domain", domain);
      }
    }

    orgCount++;
  }

  console.log(`✓ Imported ${orgCount} companies`);

  // -------------------------------------------------------------------------
  // 4. Import People
  // -------------------------------------------------------------------------

  const peopleFile = path.join(DATA_DIR, "people-18538704-16.csv");
  const peopleRows = parseCSV(peopleFile);

  // pipedrive person ID → our record ID
  const personIdMap: Record<string, string> = {};

  const peopleObj = objectMap["people"];

  let personCount = 0;
  for (const row of peopleRows) {
    const firstName = row["First name"];
    const lastName = row["Last name"];
    if (!firstName && !lastName) continue;

    const [record] = await db
      .insert(schema.records)
      .values({ objectId: peopleObj.id })
      .returning();

    personIdMap[row["ID"]] = record.id;

    // Name (personal_name)
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    await insertValue(record.id, peopleObj.attrs["name"].id, "personal_name", {
      first_name: firstName || "",
      last_name: lastName || "",
      full_name: fullName,
    });

    // Job title (Position column)
    if (row["Position"]) {
      await insertValue(record.id, peopleObj.attrs["job_title"].id, "text", row["Position"]);
    }

    // Company reference
    const orgId = row["Organization ID"];
    if (orgId && orgIdMap[orgId]) {
      await insertValue(record.id, peopleObj.attrs["company"].id, "record_reference", orgIdMap[orgId]);
    }

    // Email addresses (Work / Home / Other)
    let emailSort = 0;
    for (const col of ["Email - Work", "Email - Home", "Email - Other"]) {
      const email = row[col];
      if (email) {
        await insertValue(record.id, peopleObj.attrs["email_addresses"].id, "email_address", email, emailSort++);
      }
    }

    // Phone numbers (Work / Home / Mobile / Other)
    let phoneSort = 0;
    for (const col of ["Phone - Work", "Phone - Home", "Phone - Mobile", "Phone - Other"]) {
      const phone = row[col];
      if (phone) {
        await insertValue(record.id, peopleObj.attrs["phone_numbers"].id, "phone_number", phone, phoneSort++);
      }
    }

    personCount++;
  }

  console.log(`✓ Imported ${personCount} people`);

  // -------------------------------------------------------------------------
  // 5. Import Deals
  // -------------------------------------------------------------------------

  const dealsFile = path.join(DATA_DIR, "deals-18538704-14.csv");
  const dealsRows = parseCSV(dealsFile);

  const dealsObj = objectMap["deals"];

  let dealCount = 0;
  for (const row of dealsRows) {
    const title = row["Title"];
    if (!title) continue;

    const [record] = await db
      .insert(schema.records)
      .values({ objectId: dealsObj.id })
      .returning();

    // Name
    await insertValue(record.id, dealsObj.attrs["name"].id, "text", title);

    // Value
    const rawValue = row["Value"];
    const currency = row["Currency of Value"] || "USD";
    if (rawValue && rawValue !== "") {
      const amount = parseFloat(rawValue);
      if (!isNaN(amount)) {
        await insertValue(record.id, dealsObj.attrs["value"].id, "currency", { amount, currency });
      }
    }

    // Stage
    const stageTitle = mapDealStage(row["Status"] || "Open", row["Stage"] || "");
    const stageStatusId = dealStageMap[stageTitle];
    if (stageStatusId) {
      await insertValue(record.id, dealsObj.attrs["stage"].id, "status", stageStatusId);
    }

    // Expected close date
    const closeDate = row["Expected close date"];
    if (closeDate) {
      await insertValue(record.id, dealsObj.attrs["expected_close_date"].id, "date", closeDate);
    }

    // Company reference
    const orgId = row["Organization ID"];
    if (orgId && orgIdMap[orgId]) {
      await insertValue(record.id, dealsObj.attrs["company"].id, "record_reference", orgIdMap[orgId]);
    }

    // Associated people (Contact person ID)
    const personId = row["Contact person ID"];
    if (personId && personIdMap[personId]) {
      await insertValue(record.id, dealsObj.attrs["associated_people"].id, "record_reference", personIdMap[personId]);
    }

    dealCount++;
  }

  console.log(`✓ Imported ${dealCount} deals`);

  // -------------------------------------------------------------------------
  // 6. Import Leads → Deals (non-archived only)
  // -------------------------------------------------------------------------

  const leadsFile = path.join(DATA_DIR, "leads-18538704-13.csv");
  const leadsRows = parseCSV(leadsFile);

  let leadCount = 0;
  for (const row of leadsRows) {
    const title = row["Title"];
    if (!title) continue;

    // Skip archived leads
    if (row["Archive status"]?.toLowerCase() === "archived") continue;

    const [record] = await db
      .insert(schema.records)
      .values({ objectId: dealsObj.id })
      .returning();

    // Name
    await insertValue(record.id, dealsObj.attrs["name"].id, "text", title);

    // Value
    const rawValue = row["Value"];
    const currency = row["Currency"] || "USD";
    if (rawValue && rawValue !== "") {
      const amount = parseFloat(rawValue);
      if (!isNaN(amount)) {
        await insertValue(record.id, dealsObj.attrs["value"].id, "currency", { amount, currency });
      }
    }

    // Stage = Lead (these are top-of-funnel)
    const leadStageId = dealStageMap["Lead"];
    if (leadStageId) {
      await insertValue(record.id, dealsObj.attrs["stage"].id, "status", leadStageId);
    }

    // Expected close date
    const closeDate = row["Expected close date"];
    if (closeDate) {
      await insertValue(record.id, dealsObj.attrs["expected_close_date"].id, "date", closeDate);
    }

    // Company reference
    const orgId = row["Organization ID"];
    if (orgId && orgIdMap[orgId]) {
      await insertValue(record.id, dealsObj.attrs["company"].id, "record_reference", orgIdMap[orgId]);
    }

    // Associated people
    const personId = row["Contact person ID"];
    if (personId && personIdMap[personId]) {
      await insertValue(record.id, dealsObj.attrs["associated_people"].id, "record_reference", personIdMap[personId]);
    }

    leadCount++;
  }

  console.log(`✓ Imported ${leadCount} leads as deals`);

  // -------------------------------------------------------------------------
  // Done
  // -------------------------------------------------------------------------

  console.log("\nImport complete!");
  console.log(`  Workspace: ${workspace.name} (${workspace.id})`);
  console.log(`  Companies: ${orgCount}`);
  console.log(`  People:    ${personCount}`);
  console.log(`  Deals:     ${dealCount + leadCount} (${dealCount} deals + ${leadCount} leads)`);

  await client.end();
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
