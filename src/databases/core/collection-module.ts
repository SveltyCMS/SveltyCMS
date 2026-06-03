/**
 * @file src/databases/core/collection-module.ts
 * @description Dynamic collection management module for SQLite
 */

import type { Schema } from "@src/content/types";
import type { CollectionModel, DatabaseResult, ICollectionAdapter, ISqlAdapter } from "../db-interface";
import { DatabaseModule } from "./base-adapter";
import { logger } from "@src/utils/logger";

export class CollectionModule extends DatabaseModule<ISqlAdapter> implements ICollectionAdapter {
  private get crud() {
    return this.adapter.crud;
  }

  private get modelRegistry() {
    return (this.adapter as any).modelRegistry;
  }

  private get tableRegistry() {
    return (this.adapter as any).tableRegistry;
  }

  async getModel(id: string): Promise<CollectionModel> {
    const model = this.modelRegistry.get(id);
    if (model) {
      return model;
    }

    throw new Error(`Collection model not found: ${id}`);
  }

  async createModel(schemaData: Schema): Promise<void> {
    const id = schemaData._id;
    if (!id) {
      throw new Error("Schema must have an _id");
    }

    // 🚀 USE AGNOSTIC CORE: Standardized table creation with quoted identifiers
    await (this.adapter as any).createModel(schemaData);

    const wrappedModel: CollectionModel = {
      findOne: async <R = unknown>(query: Record<string, unknown>) => {
        const res = await this.crud.findOne<any>(
          id,
          query as import("../db-interface").QueryFilter<Record<string, unknown>>,
        );
        return res.success ? (res.data as R) : null;
      },
      aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
        const res = await this.crud.aggregate<R>(id, pipeline);
        return res.success ? res.data : [];
      },
    };

    const table = (this.adapter as any).getTable(id);

    // 🚀 Store in the correct registries
    (this.adapter as any).tableRegistry.set(id, table);
    if (!(this.adapter as any).isSystemTable(id)) {
      (this.adapter as any).dynamicTables.set(id, table);
    }
    this.modelRegistry.set(id, wrappedModel);
  }

  async updateModel(schemaData: Schema): Promise<void> {
    await this.createModel(schemaData);
  }

  async deleteModel(id: string): Promise<void> {
    this.modelRegistry.delete(id);
    this.tableRegistry.delete(id);
  }

  async createIndexes(id: string, schema: Schema): Promise<DatabaseResult<void>> {
    return this.adapter.wrap(async () => {
      const tableName = `collection_${id}`;
      const fields = (schema.fields || []) as any[];

      // SQLite-specific indexing (Hardened)
      const client = (this.adapter as any).sqlite;
      if (!client) {
        logger.warn("[CollectionModule] Native SQL client not available for index creation");
        return;
      }

      for (const field of fields) {
        if (field.unique || field.indexed) {
          const fieldName = field.db_fieldName || field.label;
          const indexName = `idx_${id}_${fieldName}`;
          const unique = field.unique ? "UNIQUE " : "";
          try {
            const sql = `CREATE ${unique}INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" ("${fieldName}")`;
            if (typeof client.exec === "function") client.exec(sql);
            else if (typeof client.run === "function") client.run(sql);
          } catch (e) {
            console.warn(`[SQLite] Failed to create index ${indexName}:`, e);
          }
        }
      }
    }, "CREATE_INDEXES_FAILED");
  }

  async getSchema(_collectionName: string): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }

  async getSchemaById(_collectionId: string): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }

  async listSchemas(tenantId?: string | null): Promise<DatabaseResult<Schema[]>> {
    const tid = tenantId || "global";
    if (process.env.BENCHMARK_DEBUG === "true" || process.env.BENCHMARK === "true") {
      logger.info(`[CollectionModule] listSchemas called for tenant: ${tid}`);
    }

    return this.adapter.wrap(async () => {
      // 🚀 Query system_content_structure first to get full schemas with fields
      try {
        const filter: Record<string, any> = { nodeType: "collection" };
        let isMultiTenant = false;
        try {
          const { getPrivateSettingSync } = await import("@src/services/core/settings-service");
          isMultiTenant = getPrivateSettingSync("MULTI_TENANT") === true;
        } catch {
          isMultiTenant = process.env.MULTI_TENANT === "true";
        }

        if (isMultiTenant && tenantId) {
          filter.tenantId = tenantId;
        }

        const res = await this.crud.findMany("content_nodes", filter as any);
        if (res.success && Array.isArray(res.data)) {
          const schemas: Schema[] = [];
          for (const node of res.data) {
            let def = (node as any).collectionDef;
            if (def) {
              if (typeof def === "string") {
                try {
                  def = JSON.parse(def);
                } catch {
                  /* ignore */
                }
              }
              if (def && typeof def === "object") {
                schemas.push(def as Schema);
              }
            }
          }
          if (process.env.BENCHMARK_DEBUG === "true" || process.env.BENCHMARK === "true") {
            logger.info(
              `[listSchemas] Found ${schemas.length} collections in DB for tenant ${tid}: ${schemas.map((s) => s._id).join(", ")}`,
            );
          }
          // Return schemas if we found any with collectionDef from content_nodes.
          // If empty, fall through to table-listing fallback (which returns fieldless
          // schemas as a last resort). The refreshCollectionsCache merge ensures
          // fieldless schemas never overwrite richer ones from files or API.
          if (schemas.length > 0) {
            return schemas;
          }
        }
      } catch (err: any) {
        logger.warn(`[listSchemas] Failed to query system_content_structure: ${err.message}`);
      }

      // Fallback to table listing if content nodes table is empty/errors out
      // 🛡️ FILTER: Exclude plugin/materialized-view tables that may be
      // Drizzle-registered but not physically created. These would cause
      // "no such table" errors when downstream code queries them.
      const EXCLUDED_TABLE_PATTERNS = [
        /^collection_plugin_/,
        /^collection_workflow_/,
        /^collection_redirects_mv$/i,
      ];
      if (process.env.BENCHMARK_DEBUG === "true" || process.env.BENCHMARK === "true") {
        logger.info(`[listSchemas] Falling back to table listing for tenant: ${tid}`);
      }
      let tables: any[] = [];

      if (this.adapter.type === "sqlite") {
        const client = (this.adapter as any).sqlite;
        if (!client) return [];
        if (client.query) {
          tables = client
            .query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%'")
            .all() as any[];
        } else if (client.prepare) {
          tables = client
            .prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%'",
            )
            .all() as any[];
        }
      } else if (this.adapter.type === "mariadb" || this.adapter.type === "mysql") {
        const dbName = (this.adapter as any).config.name;
        const res = await (this.adapter as any).db.execute(
          `SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${dbName}' AND TABLE_NAME LIKE 'collection_%'`,
        );
        tables = res[0] || [];
      } else if (this.adapter.type === "postgresql") {
        const res = await (this.adapter as any).db.execute(
          "SELECT tablename as name FROM pg_catalog.pg_tables WHERE tablename LIKE 'collection_%'",
        );
        tables = res.rows || [];
      }

      // 🛡️ Apply exclusion patterns to filter plugin/materialized-view stubs
      tables = tables.filter((t) => !EXCLUDED_TABLE_PATTERNS.some((p) => p.test(t.name)));

      return await Promise.all(
        tables.map(async (t: any) => {
          const collectionName = t.name.replace("collection_", "");
          // 🛡️ FIELD DISCOVERY: Try to extract field names from a sample row's JSON data.
          // This ensures benchmark collections created purely via API (no files, no content_nodes)
          // still get proper GraphQL type fields instead of empty ones.
          let fields: any[] = [];
          try {
            if (this.adapter.type === "sqlite") {
              const client = (this.adapter as any).sqlite;
              if (client) {
                const row = client.query
                  ? client.query(`SELECT data FROM "${t.name}" LIMIT 1`).get()
                  : client.prepare?.(`SELECT data FROM "${t.name}" LIMIT 1`).get();
                if (row?.data) {
                  const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
                  fields = Object.keys(parsed)
                    .filter((k) => !k.startsWith("_") && k !== "tenantId")
                    .map((k) => ({
                      db_fieldName: k,
                      label: k,
                      widget: { Name: "Input" },
                      type: "string",
                    }));
                }
              }
            } else if (this.adapter.type === "postgresql") {
              const res = await (this.adapter as any).db.execute(
                `SELECT data FROM "${t.name}" LIMIT 1`,
              );
              const row = res?.rows?.[0];
              if (row?.data) {
                const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
                fields = Object.keys(parsed)
                  .filter((k) => !k.startsWith("_") && k !== "tenantId")
                  .map((k) => ({
                    db_fieldName: k,
                    label: k,
                    widget: { Name: "Input" },
                    type: "string",
                  }));
              }
            } else if (this.adapter.type === "mariadb" || this.adapter.type === "mysql") {
              const [rows] = await (this.adapter as any).db.execute(
                `SELECT data FROM \`${t.name}\` LIMIT 1`,
              );
              const row = rows?.[0];
              if (row?.data) {
                const parsed = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
                fields = Object.keys(parsed)
                  .filter((k) => !k.startsWith("_") && k !== "tenantId")
                  .map((k) => ({
                    db_fieldName: k,
                    label: k,
                    widget: { Name: "Input" },
                    type: "string",
                  }));
              }
            }
          } catch {
            // Field discovery is best-effort; fall through with empty fields
          }
          return {
            _id: collectionName,
            name: collectionName,
            slug: collectionName,
            fields,
            status: "publish",
          } as Schema;
        }),
      );
    }, "LIST_SCHEMAS_FAILED");
  }
}
