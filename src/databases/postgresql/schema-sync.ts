/**
 * @file src/databases/postgresql/schema-sync.ts
 * @description PostgreSQL table provisioning, column materialization, GIN indexing, and composite index management.
 *
 * Features:
 * - DDL provisioning with JSONB and millisecond-accurate timestamps
 * - Native GIN index provisioning for jsonb_path_ops containment
 * - Covered composite index provisioning for filter+sort targets with NAMEDATALEN=63 truncation
 * - Elimination of redundant twin indexes and drop of legacy truncated names
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
import { pgSafeIndexName } from "./postgres-utils";

export interface PostgresSchemaSyncContext {
  getTable(collection: string): Table;
  raw: { execute(sqlText: string, params?: unknown[]): Promise<unknown[]> };
  sql?: { unsafe: (q: string) => Promise<unknown> } | null;
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
 * Provisions a PostgreSQL table, materializing scalar fields, creating indexes,
 * and configuring GIN containment indexing.
 */
export async function provisionPostgresTable(
  ctx: PostgresSchemaSyncContext,
  schemaData: SchemaData,
  force = false,
): Promise<DatabaseResult<void> | void> {
  const normalizedName = schemaData._id;
  const tableName = schemaData._id;

  if (hasDeclaredFieldRename(schemaData.fields)) {
    const renameTable = ctx.getTable(normalizedName);
    const renamePhysical = getTableName(renameTable);
    await applyDeclaredFieldRenames({
      dialect: "postgresql",
      tableKey: `postgresql:${normalizedName}`,
      physicalName: renamePhysical,
      fields: schemaData.fields,
      listColumns: async () => {
        const names = new Set<string>();
        try {
          const plainName = String(renamePhysical).split(".").pop() ?? String(renamePhysical);
          const cols = await ctx.raw.execute(
            `SELECT column_name FROM information_schema.columns WHERE table_name = '${plainName}'`,
          );
          const colRows = cols as Array<{ column_name?: string }>;
          if (Array.isArray(colRows)) {
            for (const column of colRows) {
              if (column?.column_name) names.add(String(column.column_name));
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
      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.debug(`[DB Provision] BENCHMARK=${process.env.BENCHMARK || "standalone"}`);
      }

      const ddl = `CREATE TABLE IF NOT EXISTS "${physicalName}" ("_id" VARCHAR(36) PRIMARY KEY, "tenantId" VARCHAR(36), "status" VARCHAR(255) DEFAULT 'draft', "isDeleted" BOOLEAN DEFAULT FALSE, "deletedAt" TIMESTAMP WITH TIME ZONE, "deletedBy" VARCHAR(36), "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, "data" JSONB);`;

      if (process.env.BENCHMARK_DEBUG === "true") {
        logger.debug(`[DB Provision] [POSTGRESQL] Executing DDL for ${physicalName}`);
      }
      await ctx.raw.execute(ddl);

      const columns = [
        { name: "isDeleted", type: "BOOLEAN DEFAULT FALSE" },
        { name: "deletedAt", type: "TIMESTAMP WITH TIME ZONE" },
        { name: "deletedBy", type: "VARCHAR(36)" },
        { name: "status", type: "VARCHAR(255) DEFAULT 'draft'" },
        { name: "tenantId", type: "VARCHAR(36)" },
        {
          name: "createdAt",
          type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
        },
        {
          name: "updatedAt",
          type: "TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
        },
        { name: "collection", type: "VARCHAR(255)" },
        { name: "slug", type: "VARCHAR(255)" },
        { name: "locale", type: "VARCHAR(50)" },
        { name: "publishedAt", type: "TIMESTAMP WITH TIME ZONE" },
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
              const exact = materializedSqlType("postgresql", field.type);
              if (exact) {
                colType = exact;
              } else if (field.type === "boolean") {
                colType = "BOOLEAN";
              } else if (field.type === "number" || field.type === "integer") {
                colType = "INTEGER";
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
                  colType === "INTEGER" ? "integer" : colType === "BOOLEAN" ? "boolean" : "text",
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
          const plainName = String(physicalName).split(".").pop() ?? String(physicalName);
          const query = `SELECT column_name FROM information_schema.columns WHERE table_name = '${plainName}' AND column_name = '${colName}'`;
          const res = await ctx.raw.execute(query);
          const exists = res.length > 0;

          if (!exists) {
            const alterSql = `ALTER TABLE "${physicalName}" ADD COLUMN "${colName}" ${col.type}`;
            await ctx.raw.execute(alterSql);
            if (colName === "deletedAt" || colName === "deletedBy") continue;
            try {
              const safeColName = assertSafeSqlIdentifier(col.name, "column");
              if (col.type === "INTEGER") {
                await ctx.raw.execute(
                  `UPDATE "${physicalName}" SET "${safeColName}" = ("data"->>'${safeColName}')::integer WHERE "${safeColName}" IS NULL AND "data" IS NOT NULL AND "data" ? '${safeColName}'`,
                );
              } else if (col.type === "BOOLEAN") {
                await ctx.raw.execute(
                  `UPDATE "${physicalName}" SET "${safeColName}" = ("data"->>'${safeColName}')::boolean WHERE "${safeColName}" IS NULL AND "data" IS NOT NULL AND "data" ? '${safeColName}'`,
                );
              } else {
                await ctx.raw.execute(
                  `UPDATE "${physicalName}" SET "${safeColName}" = "data"->>'${safeColName}' WHERE "${safeColName}" IS NULL AND "data" IS NOT NULL AND "data" ? '${safeColName}'`,
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
          const indexName = assertSafeSqlIdentifier(
            pgSafeIndexName(`${physicalName}_${colName}_idx`),
            "index",
          );
          await ctx.raw.execute(
            `CREATE INDEX IF NOT EXISTS "${indexName}" ON "${physicalName}" ("${colName}")`,
          );
          if (compositeCols.has(colNameRaw)) {
            const compIndexName = assertSafeSqlIdentifier(
              pgSafeIndexName(`${physicalName}_tenant_status_${colName}_id`),
              "index",
            );
            await ctx.raw.execute(
              `CREATE INDEX IF NOT EXISTS "${compIndexName}" ON "${physicalName}" ("tenantId", "status", "${colName}", "_id")`,
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
          const rawCompName = `${physicalName}_tenant_status_${colName}_id`;
          const compName = assertSafeSqlIdentifier(pgSafeIndexName(rawCompName), "index");
          await ctx.raw.execute(`DROP INDEX IF EXISTS "${compName}"`);
          if (rawCompName.length > 63) {
            const legacyTruncated = assertSafeSqlIdentifier(rawCompName.slice(0, 63), "index");
            await ctx.raw.execute(`DROP INDEX IF EXISTS "${legacyTruncated}"`);
          }
        } catch {
          /* safe */
        }
      }

      try {
        const rawTwin = `${physicalName}_tenant_status_updated`;
        await ctx.raw.execute(
          `DROP INDEX IF EXISTS "${assertSafeSqlIdentifier(pgSafeIndexName(rawTwin), "index")}"`,
        );
        if (rawTwin.length > 63) {
          await ctx.raw.execute(
            `DROP INDEX IF EXISTS "${assertSafeSqlIdentifier(rawTwin.slice(0, 63), "index")}"`,
          );
        }
      } catch {
        /* safe */
      }
      try {
        const keysetIdx = assertSafeSqlIdentifier(
          pgSafeIndexName(`${physicalName}_tenant_status_updated_id`),
          "index",
        );
        await ctx.raw.execute(
          `CREATE INDEX IF NOT EXISTS "${keysetIdx}" ON "${physicalName}" ("tenantId", "status", "updatedAt", "_id")`,
        );
      } catch {
        /* safe */
      }

      try {
        const rawTwin = `${physicalName}_tenant_updated`;
        await ctx.raw.execute(
          `DROP INDEX IF EXISTS "${assertSafeSqlIdentifier(pgSafeIndexName(rawTwin), "index")}"`,
        );
        if (rawTwin.length > 63) {
          await ctx.raw.execute(
            `DROP INDEX IF EXISTS "${assertSafeSqlIdentifier(rawTwin.slice(0, 63), "index")}"`,
          );
        }
      } catch {
        /* safe */
      }
      try {
        const keysetTenantIdx = assertSafeSqlIdentifier(
          pgSafeIndexName(`${physicalName}_tenant_updated_id`),
          "index",
        );
        await ctx.raw.execute(
          `CREATE INDEX IF NOT EXISTS "${keysetTenantIdx}" ON "${physicalName}" ("tenantId", "updatedAt", "_id")`,
        );
      } catch {
        /* safe */
      }

      try {
        const rawPubActive = `${physicalName}_pub_active`;
        const pubActiveIndex = assertSafeSqlIdentifier(pgSafeIndexName(rawPubActive), "index");
        await ctx.raw.execute(`DROP INDEX IF EXISTS "${pubActiveIndex}"`);
        if (rawPubActive.length > 63) {
          await ctx.raw.execute(
            `DROP INDEX IF EXISTS "${assertSafeSqlIdentifier(rawPubActive.slice(0, 63), "index")}"`,
          );
        }
      } catch {
        /* safe */
      }

      // 🔁 DRIFT: the GIN is provisioned once and never revisited, so a collection
      // that later sets `jsonIndex: false` kept a dead index forever — every write
      // still pays its maintenance and the footprint doubles, for a query form
      // nothing emits any more. Converge on the declared schema instead (same
      // pattern as the composite-index drops above). Only an explicit `false`
      // drops, so `undefined` (the default) still provisions.
      try {
        const ginIndex = assertSafeSqlIdentifier(
          pgSafeIndexName(`${physicalName}_data_gin`),
          "index",
        );
        if ((schemaData as { jsonIndex?: boolean } | undefined)?.jsonIndex === false) {
          await ctx.raw.execute(`DROP INDEX IF EXISTS "${ginIndex}"`);
        } else {
          await ctx.raw.execute(
            `CREATE INDEX IF NOT EXISTS "${ginIndex}" ON "${physicalName}" USING gin ("data" jsonb_path_ops)`,
          );
        }
      } catch {
        /* safe */
      }

      if (ctx.sql) {
        await ctx.sql.unsafe("SET statement_timeout = 0").catch(() => {});
        await ctx.sql.unsafe(`ANALYZE "${physicalName}"`).catch(() => {});
      } else {
        await ctx.raw.execute(`ANALYZE "${physicalName}"`).catch(() => {});
      }

      logger.info(`[POSTGRESQL Adapter] Provisioned table: ${physicalName}`);
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
