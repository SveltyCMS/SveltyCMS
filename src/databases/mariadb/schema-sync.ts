/**
 * @file src/databases/mariadb/schema-sync.ts
 * @description MariaDB table provisioning, column materialization, and composite index management.
 *
 * Features:
 * - DDL provisioning with InnoDB utf8mb4 tables
 * - Self-healing backfill from JSON data blob with implicit integer/boolean casting
 * - Covering composite index provisioning for filter+sort targets
 * - Elimination of redundant twin indexes
 * - Schema rename tracking and column migration
 */

import { getTableName, type Table } from "drizzle-orm";
import { logger } from "@utils/logger";
import { buildCompositeIndexColumns } from "../core/drizzle-sql-helpers";
import { shouldMaterializeField } from "../core/drizzle-sql-helpers";
import {
  applyDeclaredFieldRenames,
  hasDeclaredFieldRename,
  materializedSqlType,
} from "../core/collection-module";
import { assertSafeSqlIdentifier, registerTableSchema } from "../core/relational-utils";
import { normalizeCollectionTableName } from "../core/collection-name";
import type { DatabaseResult } from "../db-interface";
import type { SchemaData } from "../core/schema-data";

export interface MariadbSchemaSyncContext {
  getTable(collection: string): Table;
  raw: { execute(sqlText: string, params?: unknown[]): Promise<unknown[]> };
  provisionedTables: Set<string>;
  materializedColumns: Map<string, Map<string, string>>;
  tableRegistry: Map<string, Table>;
  wrap<T>(
    op: () => Promise<T>,
    errorCode: string,
    metricName?: string,
    opts?: { isWrite?: boolean; operation?: import("../core/write-coalescer").WriteOperationKind },
  ): Promise<DatabaseResult<T>>;
}

/**
 * Provisions a MariaDB table, materializing scalar fields, creating indexes,
 * and performing self-healing data backfills.
 */
export async function provisionMariadbTable(
  ctx: MariadbSchemaSyncContext,
  schemaData: SchemaData,
  force = false,
): Promise<DatabaseResult<void> | void> {
  const normalizedName = schemaData._id;
  const tableName = schemaData._id;

  if (hasDeclaredFieldRename(schemaData.fields)) {
    const renameTable = ctx.getTable(normalizedName);
    const renamePhysical = getTableName(renameTable);
    await applyDeclaredFieldRenames({
      dialect: "mariadb",
      tableKey: `mariadb:${normalizedName}`,
      physicalName: renamePhysical,
      fields: schemaData.fields,
      listColumns: async () => {
        const names = new Set<string>();
        try {
          const rows = (await ctx.raw.execute(`SHOW COLUMNS FROM \`${renamePhysical}\``)) as Array<{
            Field?: string;
          }>;
          if (Array.isArray(rows)) {
            for (const r of rows) {
              if (r?.Field) names.add(String(r.Field));
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

      // Millisecond precision: `updatedAt` is the optimistic-lock version. With
      // DATETIME(0) an update inside the same second left the version (and the
      // wire ETag) unchanged, so a stale `If-Match` still matched.
      const ddl = `CREATE TABLE IF NOT EXISTS \`${physicalName}\` (\`_id\` VARCHAR(36) PRIMARY KEY, \`tenantId\` VARCHAR(36), \`status\` VARCHAR(255) DEFAULT 'draft', \`isDeleted\` TINYINT(1) DEFAULT 0, \`deletedAt\` DATETIME(3), \`deletedBy\` VARCHAR(36), \`createdAt\` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), \`updatedAt\` DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3), \`data\` LONGTEXT);`;

      if (debugMode) logger.debug(`[DB Provision] [MARIADB] Executing DDL for ${physicalName}`);
      await ctx.raw.execute(ddl);

      const columns = [
        { name: "isDeleted", type: "TINYINT(1) DEFAULT 0" },
        { name: "deletedAt", type: "DATETIME(3)" },
        { name: "deletedBy", type: "VARCHAR(36)" },
        { name: "status", type: "VARCHAR(255) DEFAULT 'draft'" },
        { name: "tenantId", type: "VARCHAR(36)" },
        { name: "createdAt", type: "DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)" },
        { name: "updatedAt", type: "DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)" },
        { name: "collection", type: "VARCHAR(255)" },
        { name: "slug", type: "VARCHAR(255)" },
        { name: "locale", type: "VARCHAR(50)" },
        { name: "publishedAt", type: "DATETIME" },
      ];

      const dynamicCols = ["collection", "slug", "locale", "publishedAt"];
      const compositeCols = buildCompositeIndexColumns(schemaData.fields);

      if (schemaData.fields && Array.isArray(schemaData.fields)) {
        const materialized = new Map<string, string>();
        for (const field of schemaData.fields) {
          if (shouldMaterializeField(field)) {
            const fieldName = field.db_fieldName || field.label;
            if (fieldName) {
              let colType = "VARCHAR(255)";
              const exact = materializedSqlType("mariadb", field.type);
              if (exact) {
                colType = exact;
              } else if (field.type === "boolean") {
                colType = "TINYINT(1)";
              } else if (field.type === "number" || field.type === "integer") {
                colType = "INT";
              }
              const reserved = [
                "_id",
                "id",
                "tenantId",
                "status",
                "isDeleted",
                "deletedAt",
                "deletedBy",
                "createdAt",
                "updatedAt",
                "collection",
                "slug",
                "locale",
                "publishedAt",
                "data",
              ];
              if (!reserved.includes(fieldName)) {
                columns.push({ name: fieldName, type: colType });
                dynamicCols.push(fieldName);
                materialized.set(
                  fieldName,
                  colType === "INT" ? "integer" : colType === "TINYINT(1)" ? "boolean" : "text",
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

      registerTableSchema(normalizedName, ["_id", "data", ...columns.map((c) => c.name)]);

      for (const col of columns) {
        try {
          const colName = assertSafeSqlIdentifier(col.name, "column");
          const query = `SHOW COLUMNS FROM \`${physicalName}\` LIKE '${colName}'`;
          const res = await ctx.raw.execute(query);
          const exists = res.length > 0;

          if (!exists) {
            const alterSql = `ALTER TABLE \`${physicalName}\` ADD COLUMN \`${colName}\` ${col.type}`;
            await ctx.raw.execute(alterSql);
            if (colName === "deletedAt" || colName === "deletedBy") continue;
            try {
              const safeColName = assertSafeSqlIdentifier(col.name, "column");
              if (col.type === "INT" || col.type === "TINYINT(1)") {
                await ctx.raw.execute(
                  `UPDATE \`${physicalName}\` SET \`${safeColName}\` = CAST(JSON_EXTRACT(\`data\`, '$.${safeColName}') AS SIGNED) WHERE \`${safeColName}\` IS NULL AND \`data\` IS NOT NULL`,
                );
              } else {
                await ctx.raw.execute(
                  `UPDATE \`${physicalName}\` SET \`${safeColName}\` = JSON_UNQUOTE(JSON_EXTRACT(\`data\`, '$.${safeColName}')) WHERE \`${safeColName}\` IS NULL AND \`data\` IS NOT NULL`,
                );
              }
            } catch {
              /* backfill is best-effort */
            }
          }
        } catch {
          /* safe */
        }
      }

      for (const colNameRaw of dynamicCols) {
        try {
          const colName = assertSafeSqlIdentifier(colNameRaw, "column");
          const indexName = `${physicalName}_${colName}_idx`;
          await ctx.raw.execute(
            `CREATE INDEX IF NOT EXISTS \`${indexName}\` ON \`${physicalName}\` (\`${colName}\`)`,
          );
          if (compositeCols.has(colNameRaw)) {
            await ctx.raw.execute(
              `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_status_${colName}_id\` ON \`${physicalName}\` (\`tenantId\`, \`status\`, \`${colName}\`, \`_id\`)`,
            );
          }
        } catch {
          /* safe */
        }
      }

      for (const colNameRaw of dynamicCols) {
        if (compositeCols.has(colNameRaw)) continue;
        try {
          const colName = assertSafeSqlIdentifier(colNameRaw, "column");
          await ctx.raw.execute(
            `DROP INDEX IF EXISTS \`${physicalName}_tenant_status_${colName}_id\` ON \`${physicalName}\``,
          );
        } catch {
          /* safe */
        }
      }

      try {
        await ctx.raw.execute(
          `DROP INDEX IF EXISTS \`${physicalName}_tenant_status_updated\` ON \`${physicalName}\``,
        );
      } catch {
        /* safe */
      }
      try {
        await ctx.raw.execute(
          `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_status_updated_id\` ON \`${physicalName}\` (\`tenantId\`, \`status\`, \`updatedAt\`, \`_id\`)`,
        );
      } catch {
        /* safe */
      }

      try {
        await ctx.raw.execute(
          `DROP INDEX IF EXISTS \`${physicalName}_tenant_updated\` ON \`${physicalName}\``,
        );
      } catch {
        /* safe */
      }
      try {
        await ctx.raw.execute(
          `CREATE INDEX IF NOT EXISTS \`${physicalName}_tenant_updated_id\` ON \`${physicalName}\` (\`tenantId\`, \`updatedAt\`, \`_id\`)`,
        );
      } catch {
        /* safe */
      }

      logger.info(`[MARIADB Adapter] Provisioned table: ${physicalName}`);
      ctx.tableRegistry.delete(tableName);
      ctx.tableRegistry.delete(normalizedName);
      ctx.tableRegistry.delete(normalizeCollectionTableName(normalizedName));
      ctx.tableRegistry.delete(`collection_${tableName}`);
      ctx.provisionedTables.add(normalizedName);
      ctx.provisionedTables.add(physicalName);
    },
    "CREATE_MODEL_FAILED",
    undefined,
    { isWrite: true },
  );
}
