/**
 * @file src/databases/mariadb/collection/collection-module.ts
 * @description Dynamic collection management module for MariaDB
 *
 * Features:
 * - Create collection
 * - Update collection
 * - Delete collection
 */

import { logger } from "@src/utils/logger";
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

  async createModel(schemaData: Schema, force?: boolean): Promise<void> {
    const id = schemaData._id || schemaData.name;
    if (!id) {
      throw new Error("Schema must have an _id or name");
    }

    const tableName = id.startsWith("collection_") ? id : `collection_${id}`;
    logger.info(`MariaDB createModel: Creating table "${tableName}"...`);

    if (force) {
      if (this.core.pool) {
        await this.core.pool.query(`DROP TABLE IF EXISTS \`${tableName}\``);
      }
    }

    if (this.core.pool) {
      await this.core.pool.query(`
        CREATE TABLE IF NOT EXISTS \`${tableName}\` (
          \`_id\` VARCHAR(36) PRIMARY KEY,
          \`tenantId\` VARCHAR(36),
          \`data\` JSON NOT NULL,
          \`status\` VARCHAR(50) NOT NULL DEFAULT 'draft',
          \`createdAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_tenantid (\`tenantId\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

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
    logger.info(`✅ MariaDB table "${tableName}" created successfully.`);
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
    return this.core.notImplemented("getSchema");
  }

  async getSchemaById(_collectionId: string): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }

  async listSchemas(): Promise<DatabaseResult<Schema[]>> {
    return this.core.notImplemented("listSchemas");
  }
}
