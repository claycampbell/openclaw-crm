import { NextRequest } from "next/server";
import {
  getAuthContext,
  unauthorized,
  badRequest,
  success,
  notFound,
} from "@/lib/api-utils";
import { db } from "@/db";
import { records, objects, recordValues, attributes } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { enrichPerson, enrichCompany } from "@/services/integrations/linkedin";

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req);
  if (!ctx) return unauthorized();

  if (!process.env.PROXYCURL_API_KEY) {
    return badRequest("Proxycurl API key not configured. Set PROXYCURL_API_KEY in environment.");
  }

  const body = await req.json().catch(() => null);
  if (!body) return badRequest("Request body is required");

  const { recordId, objectType } = body as {
    recordId?: string;
    objectType?: string;
  };

  if (!recordId || typeof recordId !== "string") {
    return badRequest("recordId is required");
  }
  if (objectType !== "people" && objectType !== "company") {
    return badRequest("objectType must be 'people' or 'company'");
  }

  // Verify the record belongs to this workspace
  const recordRows = await db
    .select({
      id: records.id,
      objectId: records.objectId,
      workspaceId: objects.workspaceId,
    })
    .from(records)
    .innerJoin(objects, eq(records.objectId, objects.id))
    .where(
      and(
        eq(records.id, recordId),
        eq(objects.workspaceId, ctx.workspaceId)
      )
    )
    .limit(1);

  if (recordRows.length === 0) {
    return notFound("Record not found");
  }

  const { objectId } = recordRows[0];

  try {
    if (objectType === "people") {
      // Load the email attribute value for this record
      const emailAttrRows = await db
        .select({ textValue: recordValues.textValue })
        .from(recordValues)
        .innerJoin(attributes, eq(recordValues.attributeId, attributes.id))
        .where(
          and(
            eq(recordValues.recordId, recordId),
            eq(attributes.objectId, objectId),
            eq(attributes.slug, "email")
          )
        )
        .limit(1);

      if (emailAttrRows.length === 0 || !emailAttrRows[0].textValue) {
        return badRequest("Record has no email address to enrich from");
      }

      const result = await enrichPerson(
        ctx.workspaceId,
        recordId,
        emailAttrRows[0].textValue
      );

      if (!result) {
        return success({ enriched: false, message: "No LinkedIn profile found for this email" });
      }

      return success({ enriched: true, result });
    } else {
      // Company enrichment — load domain attribute
      const domainAttrRows = await db
        .select({ textValue: recordValues.textValue })
        .from(recordValues)
        .innerJoin(attributes, eq(recordValues.attributeId, attributes.id))
        .where(
          and(
            eq(recordValues.recordId, recordId),
            eq(attributes.objectId, objectId),
            eq(attributes.slug, "domain")
          )
        )
        .limit(1);

      if (domainAttrRows.length === 0 || !domainAttrRows[0].textValue) {
        return badRequest("Record has no domain to enrich from");
      }

      const result = await enrichCompany(
        ctx.workspaceId,
        recordId,
        domainAttrRows[0].textValue
      );

      if (!result) {
        return success({ enriched: false, message: "No LinkedIn company found for this domain" });
      }

      return success({ enriched: true, result });
    }
  } catch (err) {
    const msg = String(err);
    if (msg.includes("RATE_LIMIT")) {
      return badRequest("Enrichment rate limit reached — try again in a minute");
    }
    if (msg.includes("not configured")) {
      return badRequest("Proxycurl API key not configured");
    }
    console.error("[linkedin/enrich]", err);
    return badRequest("Enrichment failed: " + msg);
  }
}
