import { z } from "zod";
import type { AttributeType } from "@openclaw-crm/shared";

interface AttributeDef {
  slug: string;
  title: string;
  type: AttributeType;
  isRequired: boolean;
  isMultiselect: boolean;
  options?: { id: string }[];
  statuses?: { id: string }[];
}

/**
 * Build a Zod schema from an array of EAV attribute definitions.
 * Returns a z.object schema where each key is the attribute slug.
 */
export function buildAttributeSchema(attributes: AttributeDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const attr of attributes) {
    let field: z.ZodTypeAny;

    switch (attr.type) {
      case "text":
      case "domain":
      case "location":
        field = attr.isRequired
          ? z.string().min(1, `${attr.title} is required`)
          : z.string().nullable().optional();
        break;

      case "email_address":
        if (attr.isMultiselect) {
          // Array of emails
          const emailItem = z.string().email("Invalid email address");
          field = attr.isRequired
            ? z.array(emailItem).min(1, `${attr.title} is required`)
            : z.array(emailItem).optional();
        } else {
          field = attr.isRequired
            ? z.string().email("Invalid email address").min(1, `${attr.title} is required`)
            : z.string().email("Invalid email address").or(z.literal("")).nullable().optional();
        }
        break;

      case "phone_number":
        if (attr.isMultiselect) {
          field = attr.isRequired
            ? z.array(z.string().min(1)).min(1, `${attr.title} is required`)
            : z.array(z.string()).optional();
        } else {
          field = attr.isRequired
            ? z.string().min(1, `${attr.title} is required`)
            : z.string().nullable().optional();
        }
        break;

      case "number":
      case "rating":
        field = attr.isRequired
          ? z.number({ invalid_type_error: `${attr.title} must be a number` })
          : z.number().nullable().optional();
        break;

      case "currency":
        field = attr.isRequired
          ? z.object({
              amount: z.number({ invalid_type_error: "Amount must be a number" }),
              currencyCode: z.string().default("USD"),
            })
          : z.object({
              amount: z.number(),
              currencyCode: z.string().default("USD"),
            }).nullable().optional();
        break;

      case "date":
        field = attr.isRequired
          ? z.string().min(1, `${attr.title} is required`)
          : z.string().nullable().optional();
        break;

      case "checkbox":
        field = z.boolean().optional();
        break;

      case "select":
        field = attr.isRequired
          ? z.string().min(1, `${attr.title} is required`)
          : z.string().nullable().optional();
        break;

      case "status":
        field = attr.isRequired
          ? z.string().min(1, `${attr.title} is required`)
          : z.string().nullable().optional();
        break;

      case "personal_name":
        field = attr.isRequired
          ? z.object({
              firstName: z.string().min(1, "First name is required"),
              lastName: z.string().optional(),
              fullName: z.string().optional(),
            }, { required_error: `${attr.title} is required` })
          : z.object({
              firstName: z.string().optional(),
              lastName: z.string().optional(),
              fullName: z.string().optional(),
            }).nullable().optional();
        break;

      case "record_reference":
        field = attr.isRequired
          ? z.string().min(1, `${attr.title} is required`)
          : z.string().nullable().optional();
        break;

      default:
        field = z.unknown().optional();
    }

    shape[attr.slug] = field;
  }

  return z.object(shape);
}

/**
 * Validate form values against attribute definitions.
 * Returns a map of { slug: errorMessage } for fields with errors, or null if valid.
 */
export function validateRecordValues(
  attributes: AttributeDef[],
  values: Record<string, unknown>
): Record<string, string> | null {
  const schema = buildAttributeSchema(attributes);
  const result = schema.safeParse(values);

  if (result.success) return null;

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && !errors[path]) {
      errors[path] = issue.message;
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}
