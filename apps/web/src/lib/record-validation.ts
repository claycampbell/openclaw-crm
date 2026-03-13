import { z } from "zod";
import type { AttributeType } from "@openclaw-crm/shared";

export interface ValidatableAttribute {
  id: string;
  slug: string;
  title: string;
  type: AttributeType;
  isRequired: boolean;
  isMultiselect: boolean;
  options?: { id: string; title: string; color: string }[];
  statuses?: { id: string; title: string; color: string; isActive: boolean }[];
}

/**
 * Build a Zod schema from EAV attribute definitions.
 * Each attribute becomes a field in the schema with appropriate validation
 * based on its type, required status, and other properties.
 */
export function buildRecordSchema(
  attributes: ValidatableAttribute[]
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const attr of attributes) {
    let field: z.ZodTypeAny;

    switch (attr.type) {
      case "email_address":
        if (attr.isRequired) {
          field = z
            .string()
            .min(1, `${attr.title} is required`)
            .email(`${attr.title} must be a valid email`);
        } else {
          // Optional email: allow empty string or valid email
          field = z
            .string()
            .email(`${attr.title} must be a valid email`)
            .or(z.literal(""))
            .nullable()
            .optional();
        }
        // Multiselect email fields (email_addresses) store arrays
        if (attr.isMultiselect) {
          field = attr.isRequired
            ? z
                .array(z.string().email(`${attr.title} must be a valid email`))
                .min(1, `${attr.title} is required`)
            : z
                .array(z.string().email(`${attr.title} must be a valid email`))
                .optional()
                .nullable();
        }
        break;

      case "domain":
        if (attr.isRequired) {
          field = z.string().min(1, `${attr.title} is required`);
        } else {
          field = z.string().optional().or(z.literal("")).nullable();
        }
        break;

      case "phone_number":
        if (attr.isMultiselect) {
          field = attr.isRequired
            ? z
                .array(z.string().min(1))
                .min(1, `${attr.title} is required`)
            : z.array(z.string()).optional().nullable();
        } else if (attr.isRequired) {
          field = z.string().min(1, `${attr.title} is required`);
        } else {
          field = z.string().optional().or(z.literal("")).nullable();
        }
        break;

      case "number":
        if (attr.isRequired) {
          field = z.coerce
            .number({ invalid_type_error: `${attr.title} must be a number` })
            .refine((v) => !isNaN(v), `${attr.title} is required`);
        } else {
          field = z.coerce
            .number({ invalid_type_error: `${attr.title} must be a number` })
            .optional()
            .nullable();
        }
        break;

      case "currency":
        // Currency stores { amount, currencyCode }
        if (attr.isRequired) {
          field = z
            .object({
              amount: z.coerce.number({
                invalid_type_error: `${attr.title} must be a number`,
              }),
              currencyCode: z.string().default("USD"),
            })
            .refine((v) => v.amount !== undefined, `${attr.title} is required`);
        } else {
          field = z
            .object({
              amount: z.coerce.number().optional(),
              currencyCode: z.string().default("USD"),
            })
            .optional()
            .nullable();
        }
        break;

      case "rating":
        if (attr.isRequired) {
          field = z.coerce
            .number({ invalid_type_error: `${attr.title} must be a number` })
            .min(1, `${attr.title} is required`)
            .max(5, `${attr.title} must be between 1 and 5`);
        } else {
          field = z.coerce
            .number()
            .min(1)
            .max(5)
            .optional()
            .nullable();
        }
        break;

      case "date":
        if (attr.isRequired) {
          field = z.string().min(1, `${attr.title} is required`);
        } else {
          field = z.string().optional().or(z.literal("")).nullable();
        }
        break;

      case "timestamp":
        if (attr.isRequired) {
          field = z.string().min(1, `${attr.title} is required`);
        } else {
          field = z.string().optional().or(z.literal("")).nullable();
        }
        break;

      case "checkbox":
        field = z.boolean().default(false);
        break;

      case "select":
        if (attr.isRequired) {
          field = z.string().min(1, `${attr.title} is required`);
        } else {
          field = z.string().optional().or(z.literal("")).nullable();
        }
        break;

      case "status":
        if (attr.isRequired) {
          field = z.string().min(1, `${attr.title} is required`);
        } else {
          field = z.string().optional().or(z.literal("")).nullable();
        }
        break;

      case "personal_name":
        // personal_name stores { firstName, lastName, fullName }
        if (attr.isRequired) {
          field = z
            .object({
              firstName: z.string().optional(),
              lastName: z.string().optional(),
              fullName: z.string().optional(),
            })
            .refine(
              (v) => !!(v.firstName || v.lastName),
              `${attr.title} is required`
            );
        } else {
          field = z
            .object({
              firstName: z.string().optional(),
              lastName: z.string().optional(),
              fullName: z.string().optional(),
            })
            .optional()
            .nullable();
        }
        break;

      case "location":
        // location stores { line1, line2, city, state, postcode, country }
        field = z.any().optional().nullable();
        break;

      case "record_reference":
        if (attr.isRequired) {
          field = z.string().min(1, `${attr.title} is required`);
        } else {
          field = z.string().optional().or(z.literal("")).nullable();
        }
        break;

      case "actor_reference":
        // Actor references are typically auto-set, so always optional in forms
        field = z.string().optional().or(z.literal("")).nullable();
        break;

      case "interaction":
        // Interaction is a complex JSON type, allow any
        field = z.any().optional().nullable();
        break;

      default: {
        // text and any unknown types
        const _type: string = attr.type;
        if (attr.isRequired) {
          field = z.string().min(1, `${attr.title} is required`);
        } else {
          field = z.string().optional().or(z.literal("")).nullable();
        }
        break;
      }
    }

    shape[attr.slug] = field;
  }

  return z.object(shape);
}

/**
 * Build default values for react-hook-form from attribute definitions.
 * Returns an object with appropriate empty defaults for each field type.
 */
export function buildDefaultValues(
  attributes: ValidatableAttribute[],
  existingValues?: Record<string, unknown>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};

  for (const attr of attributes) {
    if (existingValues && existingValues[attr.slug] !== undefined) {
      defaults[attr.slug] = existingValues[attr.slug];
      continue;
    }

    switch (attr.type) {
      case "number":
      case "rating":
        defaults[attr.slug] = null;
        break;
      case "currency":
        defaults[attr.slug] = null;
        break;
      case "checkbox":
        defaults[attr.slug] = false;
        break;
      case "personal_name":
        defaults[attr.slug] = null;
        break;
      case "location":
      case "interaction":
        defaults[attr.slug] = null;
        break;
      default:
        // text, email_address, phone_number, domain, date, timestamp,
        // select, status, record_reference, actor_reference
        if (attr.isMultiselect) {
          defaults[attr.slug] = [];
        } else {
          defaults[attr.slug] = "";
        }
        break;
    }
  }

  return defaults;
}
