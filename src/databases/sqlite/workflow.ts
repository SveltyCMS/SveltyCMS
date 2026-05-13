import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Workflow Definitions Collection Schema
 */
export const workflowDefinitions = sqliteTable(
  "workflow_definitions",
  {
    _id: text("_id", { length: 36 }).primaryKey(),
    tenantId: text("tenantId", { length: 36 }),
    collectionId: text("collectionId", { length: 255 }).notNull(),
    name: text("name", { length: 255 }).notNull(),
    description: text("description"),
    states: text("states")
      .notNull()
      .default("[]" as any),
    transitions: text("transitions")
      .notNull()
      .default("[]" as any),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
  },
  (table) => ({
    tenantIdx: index("workflow_def_tenant_idx").on(table.tenantId),
    collectionIdx: index("workflow_def_collection_idx").on(table.collectionId),
  }),
);

/**
 * Workflow Instances Collection Schema
 */
export const workflowInstances = sqliteTable(
  "workflow_instances",
  {
    _id: text("_id", { length: 36 }).primaryKey(),
    tenantId: text("tenantId", { length: 36 }),
    entryId: text("entryId", { length: 36 }).notNull(),
    collectionId: text("collectionId", { length: 255 }).notNull(),
    currentState: text("currentState", { length: 255 }).notNull(),
    history: text("history")
      .notNull()
      .default("[]" as any),
    createdAt: integer("createdAt", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(strftime('%s','now')*1000)`),
  },
  (table) => ({
    tenantIdx: index("workflow_inst_tenant_idx").on(table.tenantId),
    entryIdx: index("workflow_inst_entry_idx").on(table.entryId),
  }),
);
