/**
 * Contract/SOW generation service.
 *
 * Generates contract instances from templates, populates merge fields from deal data,
 * routes through approval workflow, and produces downloadable output.
 *
 * PDF generation requires @react-pdf/renderer (install with: cd apps/web && pnpm add @react-pdf/renderer)
 * Until installed, contracts are generated as HTML/markdown and served as downloadable text.
 */

import { db } from "@/db";
import { contracts, contractTemplates } from "@/db/schema/contracts";
import { approvalRules } from "@/db/schema/approvals";
import { records, recordValues, attributes } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { createApprovalRequest } from "./approvals";
import { getRecord } from "./records";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContractClause {
  id: string;
  title: string;
  content: string;
  isRequired: boolean;
  isEditable: boolean;
}

export interface CreateTemplateInput {
  name: string;
  contractType: "nda" | "msa" | "sow" | "proposal" | "order_form" | "custom";
  description?: string;
  clauses: ContractClause[];
  defaults?: Record<string, unknown>;
}

export interface GenerateContractInput {
  templateId?: string;
  recordId?: string;
  title: string;
  contractType?: "nda" | "msa" | "sow" | "proposal" | "order_form" | "custom";
  mergeFields?: Record<string, string>;
  /** Whether to auto-route to approval after generation */
  routeToApproval?: boolean;
  generatedBy: string;
}

// ─── Default templates ────────────────────────────────────────────────────────

const DEFAULT_SOW_CLAUSES: ContractClause[] = [
  {
    id: "scope",
    title: "Scope of Work",
    content: `This Statement of Work ("SOW") is entered into between {{company_name}} ("Client") and {{vendor_name}} ("Vendor") effective {{effective_date}}.

Vendor agrees to provide the following services:
{{scope_description}}`,
    isRequired: true,
    isEditable: true,
  },
  {
    id: "deliverables",
    title: "Deliverables",
    content: `Vendor shall deliver the following:
{{deliverables_list}}

All deliverables shall be submitted to Client no later than {{delivery_date}}.`,
    isRequired: true,
    isEditable: true,
  },
  {
    id: "payment",
    title: "Payment Terms",
    content: `Client agrees to pay Vendor {{total_value}} USD.

Payment schedule:
- {{payment_schedule}}

Payment terms: Net {{payment_terms_days}} days from invoice date.`,
    isRequired: true,
    isEditable: true,
  },
  {
    id: "confidentiality",
    title: "Confidentiality",
    content: `Both parties agree to maintain the confidentiality of all proprietary information exchanged during the course of this engagement and shall not disclose such information to any third party without prior written consent.`,
    isRequired: false,
    isEditable: true,
  },
  {
    id: "governing_law",
    title: "Governing Law",
    content: `This Agreement shall be governed by and construed in accordance with the laws of {{governing_state}}, without regard to its conflict of law provisions.`,
    isRequired: false,
    isEditable: true,
  },
  {
    id: "signature",
    title: "Signatures",
    content: `IN WITNESS WHEREOF, the parties have executed this Statement of Work as of the date first written above.

{{vendor_name}}                              {{company_name}}

_________________________                    _________________________
Signature                                     Signature

_________________________                    _________________________
Name                                          Name

_________________________                    _________________________
Title                                         Title

_________________________                    _________________________
Date                                          Date`,
    isRequired: true,
    isEditable: false,
  },
];

const DEFAULT_NDA_CLAUSES: ContractClause[] = [
  {
    id: "parties",
    title: "Parties",
    content: `This Non-Disclosure Agreement ("Agreement") is entered into as of {{effective_date}} by and between {{disclosing_party}} ("Disclosing Party") and {{receiving_party}} ("Receiving Party").`,
    isRequired: true,
    isEditable: true,
  },
  {
    id: "confidential_info",
    title: "Confidential Information",
    content: `"Confidential Information" means any information disclosed by the Disclosing Party to the Receiving Party that is designated as confidential or that reasonably should be considered confidential given the nature of the information and circumstances of disclosure.`,
    isRequired: true,
    isEditable: true,
  },
  {
    id: "obligations",
    title: "Obligations",
    content: `The Receiving Party agrees to: (a) hold the Confidential Information in strict confidence; (b) not disclose the Confidential Information to any third party; (c) use the Confidential Information solely for the purpose of evaluating a potential business relationship between the parties.`,
    isRequired: true,
    isEditable: true,
  },
  {
    id: "term",
    title: "Term",
    content: `This Agreement shall be effective for a period of {{term_years}} years from the date first written above, unless earlier terminated by mutual written consent.`,
    isRequired: true,
    isEditable: true,
  },
];

// ─── Template helpers ─────────────────────────────────────────────────────────

function applyMergeFields(content: string, fields: Record<string, string>): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return fields[key] ?? match;
  });
}

function clausesToText(clauses: ContractClause[], mergeFields: Record<string, string>): string {
  return clauses
    .map((clause) => `## ${clause.title}\n\n${applyMergeFields(clause.content, mergeFields)}`)
    .join("\n\n---\n\n");
}

/**
 * Extract deal context for merge fields from record attribute values.
 */
async function extractMergeFields(
  recordId: string,
  _objectSlug: string,
  _workspaceId: string
): Promise<Record<string, string>> {
  const defaults: Record<string, string> = {
    effective_date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
    vendor_name: "{{vendor_name}}",
    governing_state: "Delaware",
    payment_terms_days: "30",
    term_years: "2",
  };

  try {
    // Load record with its attribute values
    const rec = await db
      .select({ id: records.id, objectId: records.objectId })
      .from(records)
      .where(eq(records.id, recordId))
      .limit(1);

    if (!rec[0]) return defaults;

    // Load attributes for this object
    const attrs = await db
      .select({ id: attributes.id, slug: attributes.slug })
      .from(attributes)
      .where(eq(attributes.objectId, rec[0].objectId));

    const attrBySlug = new Map(attrs.map((a) => [a.slug, a.id]));

    // Load relevant text values
    const relevantSlugs = ["name", "company", "company-name", "value", "deal-value", "amount", "close-date", "description"];
    const relevantAttrIds = relevantSlugs
      .map((s) => attrBySlug.get(s))
      .filter(Boolean) as string[];

    if (relevantAttrIds.length === 0) return defaults;

    const values = await db
      .select({
        attributeId: recordValues.attributeId,
        textValue: recordValues.textValue,
        numberValue: recordValues.numberValue,
        dateValue: recordValues.dateValue,
      })
      .from(recordValues)
      .where(
        and(
          eq(recordValues.recordId, recordId),
          inArray(recordValues.attributeId, relevantAttrIds)
        )
      );

    const attrIdToSlug = new Map(attrs.map((a) => [a.id, a.slug]));
    const fields: Record<string, string> = { ...defaults };

    for (const v of values) {
      const slug = attrIdToSlug.get(v.attributeId);
      if (!slug) continue;
      const textVal = v.textValue ?? (v.numberValue ? String(v.numberValue) : null) ?? v.dateValue;
      if (!textVal) continue;
      switch (slug) {
        case "name": fields.deal_name = textVal; break;
        case "company": case "company-name": fields.company_name = textVal; break;
        case "value": case "deal-value": case "amount":
          fields.total_value = `$${Number(textVal).toLocaleString()}`;
          break;
        case "close-date": fields.delivery_date = textVal; break;
        case "description": fields.scope_description = textVal; break;
      }
    }

    return fields;
  } catch {
    return defaults;
  }
}

// ─── Template CRUD ────────────────────────────────────────────────────────────

export async function listContractTemplates(workspaceId: string) {
  return db
    .select()
    .from(contractTemplates)
    .where(and(eq(contractTemplates.workspaceId, workspaceId), eq(contractTemplates.isActive, "true")))
    .orderBy(contractTemplates.createdAt);
}

export async function createContractTemplate(
  workspaceId: string,
  input: CreateTemplateInput,
  createdBy: string
) {
  const [template] = await db
    .insert(contractTemplates)
    .values({
      workspaceId,
      name: input.name,
      contractType: input.contractType,
      description: input.description,
      clauses: input.clauses,
      defaults: input.defaults ?? {},
      createdBy,
    })
    .returning();
  return template;
}

/**
 * Seed default templates for a workspace if none exist.
 */
export async function seedDefaultTemplates(workspaceId: string, createdBy: string) {
  const existing = await listContractTemplates(workspaceId);
  if (existing.length > 0) return;

  await db.insert(contractTemplates).values([
    {
      workspaceId,
      name: "Standard SOW",
      contractType: "sow",
      description: "Standard Statement of Work template",
      clauses: DEFAULT_SOW_CLAUSES,
      defaults: { payment_terms_days: "30", governing_state: "Delaware" },
      createdBy,
    },
    {
      workspaceId,
      name: "Standard NDA",
      contractType: "nda",
      description: "Standard Non-Disclosure Agreement",
      clauses: DEFAULT_NDA_CLAUSES,
      defaults: { term_years: "2", governing_state: "Delaware" },
      createdBy,
    },
  ]);
}

// ─── Contract generation ──────────────────────────────────────────────────────

export async function generateContract(
  workspaceId: string,
  input: GenerateContractInput
): Promise<typeof contracts.$inferSelect> {
  // Load template clauses
  let clauses: ContractClause[] = [];

  if (input.templateId) {
    const template = await db
      .select()
      .from(contractTemplates)
      .where(and(eq(contractTemplates.id, input.templateId), eq(contractTemplates.workspaceId, workspaceId)))
      .limit(1);

    if (template[0]) {
      clauses = template[0].clauses as ContractClause[];
    }
  } else {
    // Use default clauses based on contract type
    switch (input.contractType) {
      case "nda": clauses = DEFAULT_NDA_CLAUSES; break;
      case "sow": default: clauses = DEFAULT_SOW_CLAUSES; break;
    }
  }

  // Merge fields: start with deal record context, override with explicit fields
  let mergeFields: Record<string, string> = {};
  if (input.recordId) {
    mergeFields = await extractMergeFields(input.recordId, "deals", workspaceId);
  }
  mergeFields = { ...mergeFields, ...(input.mergeFields ?? {}) };

  // Resolve clause content
  const resolvedClauses = clauses.map((clause) => ({
    ...clause,
    content: applyMergeFields(clause.content, mergeFields),
  }));

  const content = clausesToText(resolvedClauses, mergeFields);

  // Insert contract record
  const [contract] = await db
    .insert(contracts)
    .values({
      workspaceId,
      recordId: input.recordId ?? null,
      templateId: input.templateId ?? null,
      contractType: input.contractType ?? "custom",
      status: input.routeToApproval ? "pending_approval" : "draft",
      title: input.title,
      content,
      structuredContent: { clauses: resolvedClauses },
      mergeFields,
      generatedBy: input.generatedBy,
    })
    .returning();

  // Route to approval if requested
  if (input.routeToApproval && input.recordId) {
    // Find a contract_send approval rule if it exists
    const approvalRule = await db
      .select({ id: approvalRules.id, approverIds: approvalRules.approverIds })
      .from(approvalRules)
      .where(
        and(
          eq(approvalRules.workspaceId, workspaceId),
          eq(approvalRules.triggerType, "contract_send"),
          eq(approvalRules.isActive, "true")
        )
      )
      .limit(1);

    const approvalRequest = await createApprovalRequest(workspaceId, {
      ruleId: approvalRule[0]?.id,
      recordId: input.recordId,
      title: `Contract approval required: ${input.title}`,
      description: `A ${input.contractType ?? "contract"} requires approval before it can be sent to the customer.`,
      context: {
        contractId: contract.id,
        contractTitle: input.title,
        contractType: input.contractType,
      },
      requestedBy: input.generatedBy,
    });

    // Link approval request to contract
    await db
      .update(contracts)
      .set({ approvalRequestId: approvalRequest.id })
      .where(eq(contracts.id, contract.id));
  }

  return contract;
}

export async function getContract(workspaceId: string, contractId: string) {
  const rows = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.workspaceId, workspaceId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listContracts(
  workspaceId: string,
  options: { recordId?: string; status?: string; limit?: number; offset?: number } = {}
) {
  const { recordId, status, limit = 50, offset = 0 } = options;
  const conditions = [eq(contracts.workspaceId, workspaceId)];
  if (recordId) conditions.push(eq(contracts.recordId, recordId));
  if (status) conditions.push(eq(contracts.status, status as typeof contracts.$inferSelect["status"]));

  return db
    .select()
    .from(contracts)
    .where(and(...conditions))
    .orderBy(desc(contracts.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function updateContractStatus(
  workspaceId: string,
  contractId: string,
  status: typeof contracts.$inferSelect["status"],
  userId: string
) {
  const updates: Partial<typeof contracts.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };

  if (status === "approved") {
    updates.approvedBy = userId;
    updates.approvedAt = new Date();
  } else if (status === "sent") {
    updates.sentAt = new Date();
  } else if (status === "signed") {
    updates.signedAt = new Date();
  }

  const [updated] = await db
    .update(contracts)
    .set(updates)
    .where(and(eq(contracts.id, contractId), eq(contracts.workspaceId, workspaceId)))
    .returning();

  return updated ?? null;
}

export async function deleteContractTemplate(workspaceId: string, templateId: string) {
  await db
    .update(contractTemplates)
    .set({ isActive: "false", updatedAt: new Date() })
    .where(and(eq(contractTemplates.id, templateId), eq(contractTemplates.workspaceId, workspaceId)));
}

/**
 * Generate a downloadable text version of the contract.
 * (PDF generation requires @react-pdf/renderer — add via: cd apps/web && pnpm add @react-pdf/renderer)
 */
export function contractToPlainText(contract: typeof contracts.$inferSelect): string {
  const title = contract.title;
  const date = new Date(contract.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `${title}\nGenerated: ${date}\n${"=".repeat(60)}\n\n${contract.content ?? "No content"}`;
}
