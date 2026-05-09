/**
 * @file src/databases/sqlite/collection/collection-module.ts
 * @description Dynamic collection management module for SQLite
 */

import type { Schema } from "@src/content/types";
import type { CollectionModel, DatabaseResult } from "../db-interface";
import type { AdapterCore } from "./adapter-core";
import { DatabaseModule } from "../core/base-adapter";

export class CollectionModule extends DatabaseModule<AdapterCore> {
  private get crud() {
    return this.adapter.crud;
  }

  private get collectionRegistry() {
    return this.adapter.collectionRegistry;
  }

  async getModel(id: string): Promise<CollectionModel> {
    const model = this.collectionRegistry.get(id);
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

    const tableName = `collection_${id}`;

    try {
      const sql = `
				CREATE TABLE IF NOT EXISTS "${tableName}" (
					"_id" TEXT PRIMARY KEY,
					"tenantId" TEXT,
					"data" TEXT NOT NULL DEFAULT '{}',
					"status" TEXT NOT NULL DEFAULT 'draft',
					"isDeleted" INTEGER NOT NULL DEFAULT 0,
					"createdAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
					"updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
				);
			`;
      const client = this.adapter.getClient();
      if (client) {
        client.exec(sql);
      }
    } catch (error) {
      console.error(`[SQLite] Failed to create physical table ${tableName}:`, error);
    }

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

    const tableId = id.startsWith("collection_") ? id : `collection_${id}`;
    const dynamicTable = (this.adapter as any).createDynamicTableDefinition(tableId);
    (this.adapter as any).dynamicTables.set(id, dynamicTable);
    (this.adapter as any).dynamicTables.set(tableId, dynamicTable);

    this.collectionRegistry.set(id, wrappedModel);
  }

  async updateModel(schemaData: Schema): Promise<void> {
    await this.createModel(schemaData);
  }

  async deleteModel(id: string): Promise<void> {
    this.collectionRegistry.delete(id);
  }

  async createIndexes(id: string, schema: Schema): Promise<DatabaseResult<void>> {
    return this.adapter.wrap(async () => {
      const tableName = `collection_${id}`;
      const fields = (schema.fields || []) as any[];
      const client = this.adapter.getClient();
      if (!client) throw new Error("Client not available");

      for (const field of fields) {
        if (field.unique || field.indexed) {
          const fieldName = field.db_fieldName || field.label;
          const indexName = `idx_${id}_${fieldName}`;
          const unique = field.unique ? "UNIQUE " : "";
          try {
            const sql = `CREATE ${unique}INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" ("${fieldName}")`;
            client.exec(sql);
          } catch (e) {
            console.warn(`[SQLite] Failed to create index ${indexName}:`, e);
          }
        }
      }
    }, "CREATE_INDEXES_FAILED");
  }

  async getSchema(_collectionName: string): Promise<DatabaseResult<Schema | null>> {
    return this.adapter.notImplemented("getSchema");
  }

  async getSchemaById(_collectionId: string): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }

  async listSchemas(): Promise<DatabaseResult<Schema[]>> {
    return this.adapter.wrap(async () => {
      const client = this.adapter.getClient();
      const query =
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%'";

      let tables: any[];
      if (client.query) {
        tables = client.query(query).all() as any[];
      } else if (client.prepare) {
        tables = client.prepare(query).all() as any[];
      } else {
        throw new Error("SQLite client not available for listing schemas");
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
