/**
 * @file src/databases/mariadb/collection-module.ts
 * @description Dynamic collection management module for MariaDB
 */

import type { Schema } from "@src/content/types";
import type { CollectionModel, DatabaseResult, ICollectionAdapter } from "../db-interface";
import type { AdapterCore } from "./adapter-core";

export class CollectionModule implements ICollectionAdapter {
  constructor(private readonly core: AdapterCore) {}

  private get crud() {
    return this.core.crud;
  }

  private get collectionRegistry() {
    return this.core.collectionRegistry as Map<string, CollectionModel>;
  }

  async getModel(id: string): Promise<CollectionModel> {
    const model = this.collectionRegistry.get(id);
    if (model) {
      return model;
    }

    return {
      findOne: async <R = unknown>(query: Record<string, unknown>) => {
        const res = await this.crud.findOne<any>(id, query);
        return res.success ? (res.data as R) : null;
      },
      aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
        const res = await this.crud.aggregate<R>(id, pipeline);
        return res.success ? res.data : [];
      },
    };
  }

  async createModel(schemaData: Schema): Promise<void> {
    const id = schemaData._id;
    if (!id) throw new Error("Schema must have an _id");

    // 🚀 USE AGNOSTIC CORE: Standardized table creation with quoted identifiers
    await this.core.createModel(schemaData);

    const wrappedModel: CollectionModel = {
      findOne: async <R = unknown>(query: Record<string, unknown>) => {
        const res = await this.crud.findOne<any>(id, query);
        return res.success ? (res.data as R) : null;
      },
      aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
        const res = await this.crud.aggregate<R>(id, pipeline);
        return res.success ? res.data : [];
      },
    };
    this.collectionRegistry.set(id, wrappedModel);

    // Register collection in core tables
    const tableName = `collection_${id}`;
    const dynamicTable = this.core.createDynamicTableDefinition(tableName);
    this.core.dynamicTables.set(id, dynamicTable);
    this.core.dynamicTables.set(tableName, dynamicTable);
  }

  async updateModel(schemaData: Schema): Promise<void> {
    await this.createModel(schemaData);
  }

  async deleteModel(id: string): Promise<void> {
    this.collectionRegistry.delete(id);
    const tableName = `collection_${id}`;
    if (this.core.pool) {
      await this.core.pool.query(`DROP TABLE IF EXISTS \`${tableName}\``);
    }
  }

  async createIndexes(id: string, schema: Schema): Promise<DatabaseResult<void>> {
    return this.core.wrap(async () => {
      const tableName = `collection_${id}`;
      const fields = (schema.fields || []) as any[];
      if (!this.core.pool) throw new Error("Pool not available");

      for (const field of fields) {
        if (field.unique || field.indexed) {
          const fieldName = field.db_fieldName || field.label;
          const indexName = `idx_${id}_${fieldName}`;
          const unique = field.unique ? "UNIQUE " : "";
          try {
            await this.core.pool.query(
              `CREATE ${unique}INDEX \`${indexName}\` ON \`${tableName}\` (\`${fieldName}\`)`,
            );
          } catch (e: any) {
            if (e.code === "ER_DUP_KEYNAME") continue;
            console.warn(`Failed to create index ${indexName}:`, e);
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
    return { success: true, data: [] };
  }
}
