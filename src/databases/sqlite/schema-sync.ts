/**
 * @file src/databases/sqlite/schema-sync.ts
 * @description SQLite table provisioning, column materialization, and composite index setup.
 *
 * Features:
 * - DDL provisioning for core and dynamic collection tables
 * - Self-healing backfill from JSON data blob to physical columns
 * - Covered composite index provisioning for filter+sort targets
 * - Elimination of redundant twin indexes
 * - Schema rename tracking and column migration
 */

import { getTableName, type Table } from "drizzle-orm";
import { logger } from "@utils/logger";
import { buildCompositeIndexColumns, shouldMaterializeField } from "../core/drizzle-sql-helpers";
import {
  applyDeclaredFieldRenames,
  hasDeclaredFieldRename,
  materializedSqlType,
} from "../core/collection-module";
import { assertSafeSqlIdentifier, registerTableSchema } from "../core/relational-utils";
import { normalizeCollectionTableName } from "../core/collection-name";
import type { DatabaseResult } from "../db-interface";
import type { SchemaData } from "../core/schema-data";

export interface SqliteSchemaSyncContext {
  getTable(collection: string): Table;
  prepareAndExecute(sqlText: string, method: "run" | "get" | "all", params?: unknown[]): unknown;
  raw: { execute(sqlText: string, params?: unknown[]): Promise<unknown[]> };
  provisionedTables: Set<string>;
  materializedColumns: Map<string, Map<string, string>>;
  tableRegistry: Map<string, Table>;
  clearStatementCaches(): void;
  wrap<T>(
    op: () => Promise<T>,
    errorCode: string,
    metricName?: string,
    opts?: unknown,
  ): Promise<DatabaseResult<T>>;
}

/**
 * Provisions a SQLite table, adding physical columns, backfilling legacy JSON data,
 * and creating indexes according to the composite index policy.
 */
export async function provisionSqliteTable(
  ctx: SqliteSchemaSyncContext,
  schemaData: SchemaData,
  force = false,
): Promise<DatabaseResult<void> | void> {
  const normalizedName = schemaData._id;
  const tableName = schemaData._id;

  if (hasDeclaredFieldRename(schemaData.fields)) {
    const renameTable = ctx.getTable(normalizedName);
    const renamePhysical = getTableName(renameTable);
    await applyDeclaredFieldRenames({
      dialect: "sqlite",
      tableKey: `sqlite:${normalizedName}`,
      physicalName: renamePhysical,
      fields: schemaData.fields,
      listColumns: async () => {
        const names = new Set<string>();
        try {
          const tableInfo = ctx.prepareAndExecute(
            `PRAGMA table_info("${renamePhysical}")`,
            "all",
          ) as Array<{ name?: string }>;
          if (Array.isArray(tableInfo)) {
            for (const column of tableInfo) {
              if (column?.name) names.add(String(column.name));
            }
          }
        } catch {
          /* table may not exist yet */
        }
        return names;
      },
      execute: (sqlText: string, params?: unknown[]) => ctx.raw.execute(sqlText, params),
    });
  }

  if (!force && ctx.provisionedTables.has(normalizedName)) return;

  const table = ctx.getTable(normalizedName);
  const physicalName = getTableName(table);

  return ctx.wrap(
    async () => {
      const debugMode = process.env.BENCHMARK_DEBUG === "true";

      const ddl = `CREATE TABLE IF NOT EXISTS "${physicalName}" ("_id" TEXT PRIMARY KEY, "tenantId" TEXT, "collection" TEXT, "slug" TEXT, "locale" TEXT, "status" TEXT DEFAULT 'draft', "publishedAt" INTEGER, "isDeleted" INTEGER DEFAULT 0, "deletedAt" INTEGER, "deletedBy" TEXT, "createdAt" INTEGER, "updatedAt" INTEGER, "data" TEXT);`;
      if (debugMode) logger.debug(`[DB Provision] [SQLITE] Executing DDL for ${physicalName}`);
      await ctx.raw.execute(ddl);

      const columns = [
        { name: "isDeleted", type: "INTEGER DEFAULT 0" },
        { name: "deletedAt", type: "INTEGER" },
        { name: "deletedBy", type: "TEXT" },
        { name: "status", type: "TEXT DEFAULT 'draft'" },
        { name: "tenantId", type: "TEXT" },
        { name: "createdAt", type: "INTEGER" },
        { name: "updatedAt", type: "INTEGER" },
      ];

      const dynamicCols = [
        { name: "collection", type: "TEXT" },
        { name: "slug", type: "TEXT" },
        { name: "locale", type: "TEXT" },
        { name: "publishedAt", type: "INTEGER" },
      ];
      const compositeCols = buildCompositeIndexColumns(schemaData.fields);

      if (schemaData.fields && Array.isArray(schemaData.fields)) {
        const materialized = new Map<string, string>();
        for (const field of schemaData.fields) {
          if (shouldMaterializeField(field)) {
            const fieldName = field.db_fieldName || field.label;
            if (fieldName) {
              let colType = "TEXT";
              const exact = materializedSqlType("sqlite", field.type);
              if (exact) {
                colType = exact;
              } else if (
                field.type === "number" ||
                field.type === "integer" ||
                field.type === "boolean"
              ) {
                colType = "INTEGER";
              }
              if (
                !dynamicCols.some((c) => c.name === fieldName) &&
                !columns.some((c) => c.name === fieldName) &&
                fieldName !== "_id" &&
                fieldName !== "id" &&
                fieldName !== "data"
              ) {
                dynamicCols.push({ name: fieldName, type: colType });
                materialized.set(
                  fieldName,
                  colType === "INTEGER"
                    ? field.type === "boolean"
                      ? "boolean"
                      : "integer"
                    : "text",
                );
              }
            }
          }
        }
        if (materialized.size > 0) {
          ctx.materializedColumns.set(tableName, materialized);
          ctx.materializedColumns.set(normalizedName, materialized);
        }
      }

      const allColumnsToEnsure = [...columns, ...dynamicCols];
      registerTableSchema(normalizedName, [
        "_id",
        "data",
        ...allColumnsToEnsure.map((c) => c.name),
      ]);

      const addedColumns = new Set<string>();
      let existingCols = new Set<string>();
      try {
        const tableInfo = ctx.prepareAndExecute(
          `PRAGMA table_info("${physicalName}")`,
          "all",
        ) as Array<{ name?: string }>;
        if (Array.isArray(tableInfo)) {
          existingCols = new Set(tableInfo.map((c) => String(c.name)));
        }
      } catch {
        /* table may not exist yet */
      }
      for (const col of allColumnsToEnsure) {
        try {
          const safeColName = assertSafeSqlIdentifier(col.name, "column");
          const exists = existingCols.has(safeColName);
          if (!exists) {
            await ctx.raw.execute(
              `ALTER TABLE "${physicalName}" ADD COLUMN "${safeColName}" ${col.type}`,
            );
            if (safeColName === "deletedAt" || safeColName === "deletedBy") {
              existingCols.add(safeColName);
              addedColumns.add(safeColName);
              continue;
            }
            try {
              await ctx.raw.execute(
                `UPDATE "${physicalName}" SET "${safeColName}" = json_extract("data", '$.${safeColName}') WHERE "${safeColName}" IS NULL AND "data" IS NOT NULL`,
              );
            } catch {
              /* backfill is best-effort */
            }
            existingCols.add(safeColName);
          }
          addedColumns.add(safeColName);
        } catch {
          /* safe */
        }
      }

      for (const col of dynamicCols) {
        if (!addedColumns.has(col.name)) continue;
        try {
          const indexName = `${physicalName}_${col.name}_idx`;
          await ctx.raw.execute(
            `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${physicalName}" ("${col.name}")`,
          );
          if (compositeCols.has(col.name)) {
            await ctx.raw.execute(
              `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_status_${col.name}_id" ON "${physicalName}" ("tenantId", "status", "${col.name}", "_id")`,
            );
          }
        } catch {
          /* safe */
        }
      }

      for (const col of dynamicCols) {
        if (compositeCols.has(col.name)) continue;
        try {
          await ctx.raw.execute(
            `DROP INDEX IF EXISTS "${physicalName}_tenant_status_${col.name}_id"`,
          );
        } catch {
          /* safe */
        }
      }

      try {
        await ctx.raw.execute(`DROP INDEX IF EXISTS "${physicalName}_tenant_status_updated"`);
      } catch {
        /* safe */
      }
      try {
        await ctx.raw.execute(
          `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_status_updated_id" ON "${physicalName}" ("tenantId", "status", "updatedAt", "_id")`,
        );
      } catch {
        /* safe */
      }

      try {
        await ctx.raw.execute(`DROP INDEX IF EXISTS "${physicalName}_tenant_updated"`);
      } catch {
        /* safe */
      }
      try {
        await ctx.raw.execute(
          `CREATE INDEX IF NOT EXISTS "${physicalName}_tenant_updated_id" ON "${physicalName}" ("tenantId", "updatedAt", "_id")`,
        );
      } catch {
        /* safe */
      }

      logger.info(`[SQLITE Adapter] Provisioned table: ${physicalName}`);
      ctx.provisionedTables.add(normalizedName);
      ctx.clearStatementCaches();
      ctx.tableRegistry.delete(tableName);
      ctx.tableRegistry.delete(normalizedName);
      ctx.tableRegistry.delete(normalizeCollectionTableName(normalizedName));
    },
    "CREATE_MODEL_FAILED",
    undefined,
    { isWrite: true },
  );
}
