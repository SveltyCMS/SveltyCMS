/**
 * @file src/databases/core/collection-module.ts
 * @description Dynamic collection management module for SQLite
 */

import type { Schema } from "@src/content/types";
import type { CollectionModel, DatabaseResult, ICollectionAdapter } from "../db-interface";
import { DatabaseModule } from "./base-adapter";
import type { BaseSqlAdapter } from "./base-sql-adapter";
import { logger } from "@src/utils/logger";

export class CollectionModule extends DatabaseModule<BaseSqlAdapter> implements ICollectionAdapter {
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
    await this.adapter.createModel(schemaData);

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
        if (tenantId) filter.tenantId = tenantId;

        const res = await this.crud.findMany("system_content_structure", filter as any);
        if (process.env.BENCHMARK === "true") {
          const count = res.success ? (res.data as any[]).length : 0;
          process.stderr.write(
            `[DEBUG] listSchemas query success: ${res.success}, count: ${count}\n`,
          );
          if (res.success && (res.data as any[]).length > 0) {
            process.stderr.write(
              `[DEBUG] Sample node collectionDef keys: ${Object.keys((res.data as any[])[0].collectionDef || {}).join(", ")}\n`,
            );
          }
        }
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
          if (schemas.length > 0) {
            if (process.env.BENCHMARK_DEBUG === "true" || process.env.BENCHMARK === "true") {
              logger.info(
                `[listSchemas] Found ${schemas.length} collections in DB for tenant ${tid}: ${schemas.map((s) => s._id).join(", ")}`,
              );
            }
            return schemas;
          }
        }
      } catch (err: any) {
        logger.warn(`[listSchemas] Failed to query system_content_structure: ${err.message}`);
      }

      // Fallback to table listing if content nodes table is empty/errors out
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

      return tables.map(
        (t: any) =>
          ({
            _id: t.name.replace("collection_", ""),
            name: t.name.replace("collection_", ""),
            slug: t.name.replace("collection_", ""),
            fields: [],
            status: "publish",
          }) as Schema,
      );
    }, "LIST_SCHEMAS_FAILED");
  }
}
