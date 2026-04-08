/**
 * @file src/databases/mariadb/collection/collection-module.ts
 * @description Dynamic collection management module for MariaDB
 *
 * Features:
 * - Create collection
 * - Update collection
 * - Delete collection
 */

import type { Schema } from "@src/content/types";
import type { CollectionModel, DatabaseResult } from "../../db-interface";
import type { AdapterCore } from "../adapter/adapter-core";

export class CollectionModule {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get crud() {
    return this.core.crud;
  }

  private get collectionRegistry() {
    return this.core.collectionRegistry;
  }

  async getModel(id: string): Promise<CollectionModel> {
    const model = this.collectionRegistry.get(id);
    if (model) {
      return model;
    }

    // Check if it exists as a physical table or dynamic collection
    // In integration tests, we want to fail if it's not predefined
    throw new Error(`Collection model not found: ${id}`);
  }

  async createModel(schemaData: Schema): Promise<void> {
    const id = schemaData._id;
    if (!id) {
      throw new Error("Schema must have an _id");
    }

    const tableName = `collection_${id}`;

    try {
      // Ensure physical table exists in SQLite
      const sql = `
				CREATE TABLE IF NOT EXISTS "${tableName}" (
					"_id" TEXT PRIMARY KEY,
					"tenantId" TEXT,
					"data" TEXT NOT NULL DEFAULT '{}',
					"status" TEXT NOT NULL DEFAULT 'draft',
					"createdAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
					"updatedAt" INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
				);
			`;
      const client = this.core.getClient();
      if (client) {
        if (typeof client.exec === "function") {
          client.exec(sql);
        } else if (typeof client.query === "function") {
          client.query(sql);
        }
      }
    } catch (error) {
      console.error(`Failed to create physical table ${tableName}:`, error);
      // Continue anyway, it might fail later during CRUD but we don't want to crash the whole adapter init
    }

    const wrappedModel: CollectionModel = {
      findOne: async <R = unknown>(query: Record<string, unknown>) => {
        const res = await this.crud.findOne<any>(
          id,
          query as import("../../db-interface").QueryFilter<Record<string, unknown>>,
        );
        return res.success ? (res.data as R) : null;
      },
      aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
        const res = await this.crud.aggregate<R>(id, pipeline);
        return res.success ? res.data : [];
      },
    };
    this.collectionRegistry.set(id, wrappedModel);
  }

  async updateModel(schemaData: Schema): Promise<void> {
    await this.createModel(schemaData);
  }

  async deleteModel(id: string): Promise<void> {
    this.collectionRegistry.delete(id);
  }

  async createIndexes(id: string, schema: Schema): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const tableName = `collection_${id}`;
      const fields = (schema.fields || []) as any[];
      const client = this.core.getClient();
      if (!client) throw new Error("Client not available");

      for (const field of fields) {
        if (field.unique || field.indexed) {
          const fieldName = field.db_fieldName || field.label;
          const indexName = `idx_${id}_${fieldName}`;
          const unique = field.unique ? "UNIQUE " : "";
          try {
            const sql = `CREATE ${unique}INDEX IF NOT EXISTS "${indexName}" ON "${tableName}" ("${fieldName}")`;
            if (typeof client.exec === "function") {
              client.exec(sql);
            } else if (typeof client.query === "function") {
              client.query(sql);
            }
          } catch (e) {
            console.warn(`Failed to create index ${indexName}:`, e);
          }
        }
      }
    }, "CREATE_INDEXES_FAILED");
  }

  async getSchema(_collectionName: string): Promise<DatabaseResult<Schema | null>> {
    return this.core.notImplemented("getSchema");
  }

  async getSchemaById(_collectionId: string): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }

  async listSchemas(): Promise<DatabaseResult<Schema[]>> {
    return this.core.wrap(async () => {
      const client = this.core.getClient();
      // SQLite-specific minimalist introspection
      const query =
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'collection_%'";
      const tables = (
        client.query ? client.query(query).all() : client.prepare?.(query).all()
      ) as any[];

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
