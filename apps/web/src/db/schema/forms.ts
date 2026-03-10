/**
 * Web forms — embeddable inbound lead capture forms.
 */
import { pgTable, text, timestamp, jsonb, boolean, index } from "drizzle-orm/pg-core";
import { workspaces } from "./workspace";

export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "company" | "textarea";
  required: boolean;
}

export const webForms = pgTable(
  "web_forms",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Array of FormField objects
    fields: jsonb("fields").notNull().default([]).$type<FormField[]>(),
    // Object slug to create on submit (default: "people")
    targetObjectSlug: text("target_object_slug").notNull().default("people"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("web_forms_workspace").on(table.workspaceId, table.active),
  ]
);

export type WebForm = typeof webForms.$inferSelect;
export type NewWebForm = typeof webForms.$inferInsert;
