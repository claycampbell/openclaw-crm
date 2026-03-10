/**
 * LinkedIn enrichment via Proxycurl HTTP API.
 * No SDK — direct HTTP calls to https://nubela.co/proxycurl/api
 *
 * Required env var: PROXYCURL_API_KEY
 */
import { db } from "@/db";
import { records, attributes, recordValues } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { enqueueJob } from "@/services/job-queue";

const PROXYCURL_BASE = "https://nubela.co/proxycurl/api";

// ─── Result types ─────────────────────────────────────────────────────────────

export interface PersonEnrichmentResult {
  linkedinUrl?: string;
  title?: string;
  headline?: string;
  company?: string;
  location?: string;
  summary?: string;
  profileImageUrl?: string;
  enrichedAt: Date;
}

export interface CompanyEnrichmentResult {
  name?: string;
  description?: string;
  industry?: string;
  employeeCount?: number;
  headquarters?: string;
  websiteUrl?: string;
  enrichedAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getApiKey(): string | null {
  return process.env.PROXYCURL_API_KEY ?? null;
}

/**
 * Upsert a single EAV record_value by attribute slug.
 * Only writes if the attribute slug exists on the record's object.
 */
async function upsertRecordValue(
  recordId: string,
  objectId: string,
  slug: string,
  value: string
): Promise<void> {
  // Find the attribute definition
  const attrs = await db
    .select({ id: attributes.id })
    .from(attributes)
    .where(and(eq(attributes.objectId, objectId), eq(attributes.slug, slug)))
    .limit(1);

  if (attrs.length === 0) return; // Attribute doesn't exist on this object — skip

  const attributeId = attrs[0].id;

  // record_values has no unique constraint on (recordId, attributeId),
  // so we delete the existing value first, then insert fresh.
  await db
    .delete(recordValues)
    .where(
      and(
        eq(recordValues.recordId, recordId),
        eq(recordValues.attributeId, attributeId)
      )
    );

  await db.insert(recordValues).values({
    recordId,
    attributeId,
    textValue: value,
  });
}

// ─── Person enrichment ────────────────────────────────────────────────────────

/**
 * Enrich a People record using their email address via Proxycurl.
 * Writes enrichment results back to EAV record_values (only for attributes
 * that already exist on the workspace's People object).
 */
export async function enrichPerson(
  workspaceId: string,
  recordId: string,
  email: string
): Promise<PersonEnrichmentResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("PROXYCURL_API_KEY is not configured");
  }

  // Load the record to get its objectId
  const recordRows = await db
    .select({ objectId: records.objectId })
    .from(records)
    .where(eq(records.id, recordId))
    .limit(1);

  if (recordRows.length === 0) return null;
  const { objectId } = recordRows[0];

  // Call Proxycurl person resolve API
  const url = new URL(`${PROXYCURL_BASE}/v2/linkedin/person/resolve`);
  url.searchParams.set("email", email);
  url.searchParams.set("enrich_profile", "enrich");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.status === 404) return null;
  if (response.status === 429) {
    throw new Error("RATE_LIMIT: Proxycurl rate limit reached — try again in a minute");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Proxycurl API error ${response.status}: ${text}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const enrichedAt = new Date();

  // Map Proxycurl fields to our result shape
  const result: PersonEnrichmentResult = {
    linkedinUrl: (data.linkedin_profile_url as string) || undefined,
    title: (data.occupation as string) || undefined,
    headline: (data.headline as string) || undefined,
    company: (data.company_name as string) || undefined,
    location: [data.city, data.country].filter(Boolean).join(", ") || undefined,
    summary: (data.summary as string) || undefined,
    profileImageUrl: (data.profile_pic_url as string) || undefined,
    enrichedAt,
  };

  // Write back to EAV record_values for known attribute slugs
  const writes: Array<[string, string | undefined]> = [
    ["linkedin-title", result.title],
    ["linkedin-company", result.company],
    ["linkedin-location", result.location],
    ["linkedin-url", result.linkedinUrl],
    ["linkedin-headline", result.headline],
    ["linkedin-enriched-at", enrichedAt.toISOString()],
  ];

  for (const [slug, value] of writes) {
    if (value) {
      await upsertRecordValue(recordId, objectId, slug, value).catch(() => {});
    }
  }

  return result;
}

// ─── Company enrichment ───────────────────────────────────────────────────────

/**
 * Enrich a Company record using their domain via Proxycurl.
 */
export async function enrichCompany(
  workspaceId: string,
  recordId: string,
  domain: string
): Promise<CompanyEnrichmentResult | null> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("PROXYCURL_API_KEY is not configured");
  }

  // Load the record to get its objectId
  const recordRows = await db
    .select({ objectId: records.objectId })
    .from(records)
    .where(eq(records.id, recordId))
    .limit(1);

  if (recordRows.length === 0) return null;
  const { objectId } = recordRows[0];

  // Call Proxycurl company resolve API
  const url = new URL(`${PROXYCURL_BASE}/v2/linkedin/company/resolve`);
  url.searchParams.set("company_domain", domain);
  url.searchParams.set("enrich_profile", "enrich");

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.status === 404) return null;
  if (response.status === 429) {
    throw new Error("RATE_LIMIT: Proxycurl rate limit reached — try again in a minute");
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Proxycurl API error ${response.status}: ${text}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const enrichedAt = new Date();

  const result: CompanyEnrichmentResult = {
    name: (data.name as string) || undefined,
    description: (data.description as string) || undefined,
    industry: (data.industry as string) || undefined,
    employeeCount: data.company_size_on_linkedin as number | undefined,
    headquarters:
      [data.hq_city, data.hq_country].filter(Boolean).join(", ") || undefined,
    websiteUrl: (data.website as string) || undefined,
    enrichedAt,
  };

  // Write back to EAV record_values for known attribute slugs
  const writes: Array<[string, string | undefined]> = [
    ["company-industry", result.industry],
    ["company-description", result.description],
    ["company-size", result.employeeCount?.toString()],
    ["linkedin-enriched-at", enrichedAt.toISOString()],
  ];

  for (const [slug, value] of writes) {
    if (value) {
      await upsertRecordValue(recordId, objectId, slug, value).catch(() => {});
    }
  }

  return result;
}

// ─── Job scheduling ───────────────────────────────────────────────────────────

/**
 * Schedule a background enrichment job.
 * Safe to call when PROXYCURL_API_KEY is not set — just logs a warning.
 */
export async function scheduleEnrichment(
  workspaceId: string,
  recordId: string,
  objectType: "people" | "company",
  identifier: string
): Promise<void> {
  if (!process.env.PROXYCURL_API_KEY) {
    console.warn(
      "[linkedin] PROXYCURL_API_KEY not set — skipping auto-enrichment for record",
      recordId
    );
    return;
  }

  await enqueueJob(
    "linkedin_enrich",
    { workspaceId, recordId, objectType, identifier },
    { workspaceId }
  );
}
