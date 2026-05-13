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

  async listSchemas(): Promise<DatabaseResult<Schema[]>> {
    return this.adapter.wrap(async () => {
      const client = (this.adapter as any).sqlite;
      if (!client) return [];

      let tables: any[] = [];
      if (client.query) {
        tables = client
          .query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%'")
          .all() as any[];
      } else if (client.prepare) {
        tables = client
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%'")
          .all() as any[];
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
