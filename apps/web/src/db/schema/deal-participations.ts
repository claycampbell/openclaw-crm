import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { records } from "./records";
import { workspaces } from "./workspace";
import { users } from "./auth";

export const dealParticipations = pgTable(
  "deal_participations",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    recordId: text("record_id")
      .notNull()
      .references(() => records.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("participant"), // 'lead', 'participant', 'support', 'referral'
    notes: text("notes"),
    addedAt: timestamp("added_at").notNull().defaultNow(),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("deal_participations_record_workspace").on(table.recordId, table.workspaceId),
    index("deal_participations_record").on(table.recordId),
    index("deal_participations_workspace").on(table.workspaceId),
  ]
);
