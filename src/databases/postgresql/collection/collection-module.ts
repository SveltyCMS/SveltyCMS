/**
 * @file src/databases/postgresql/collection/collection-module.ts
 * @description Collection management module for PostgreSQL
 */

import { logger } from "@utils/logger";
import { sql } from "drizzle-orm";
import type {
  CollectionModel,
  DatabaseResult,
  Schema,
  ICollectionAdapter,
} from "../../db-interface";
import type { AdapterCore } from "../adapter/adapter-core";
import type { DatabaseId } from "@src/content/types";

export class CollectionModule implements ICollectionAdapter {
  private readonly core: AdapterCore;

  constructor(core: AdapterCore) {
    this.core = core;
  }

  private get db() {
    return this.core.db!;
  }

  async getModel(id: string): Promise<CollectionModel> {
    return {
      findOne: async <R = unknown>(query: Record<string, unknown>) => {
        const table = this.core.getTable(id);
        const where = this.core.mapQuery(table, query) as import("drizzle-orm").SQL | undefined;
        const [result] =
          (await this.db
            .select()
            .from(table as unknown as import("drizzle-orm/pg-core").PgTable)
            .where(where)
            .limit(1)) ?? [];
        return result as R | null;
      },
      aggregate: async <R = unknown>(_pipeline: Record<string, unknown>[]): Promise<R[]> => {
        throw new Error("Aggregate not yet implemented for PostgreSQL collection module");
      },
    };
  }

  async createModel(schema: Schema, force?: boolean): Promise<void> {
    const name = schema.name || "unnamed_collection";
    const tableName = name.startsWith("collection_") ? name : `collection_${name}`;

    logger.info(`PostgreSQL createModel: Creating table "${tableName}"...`);

    if (force) {
      await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
    }

    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
        "_id" VARCHAR(36) PRIMARY KEY,
        "tenantId" VARCHAR(36),
        "data" JSONB NOT NULL DEFAULT '{}',
        "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await this.db.execute(
      sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`${tableName}_tenant_idx`)} ON ${sql.identifier(tableName)} ("tenantId")`,
    );
    await this.db.execute(
      sql`CREATE INDEX IF NOT EXISTS ${sql.identifier(`${tableName}_data_gin`)} ON ${sql.identifier(tableName)} USING gin (data)`,
    );

    logger.info(`✅ PostgreSQL table "${tableName}" created successfully.`);
  }

  async updateModel(_schema: Schema): Promise<void> {
    logger.info(`PostgreSQL updateModel: Using existing tables for ${_schema.name}`);
  }

  async deleteModel(id: string): Promise<void> {
    logger.info(`PostgreSQL deleteModel: Removing reference for ${id}`);
  }

  async getSchema(
    collectionName: string,
    _tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<Schema | null>> {
    return this.core.wrap(async () => {
      const [result] = await this.db.execute(
        sql`SELECT "data" FROM "content_nodes" WHERE "name" = ${collectionName} AND "nodeType" = 'collection' LIMIT 1`,
      );
      if (!result) {
        return null;
      }
      return (result as unknown as { data: Schema }).data;
    }, "GET_SCHEMA_FAILED");
  }

  async getSchemaById(
    collectionId: string,
    _tenantId?: DatabaseId | null,
  ): Promise<DatabaseResult<Schema | null>> {
    if (!collectionId || String(collectionId).trim() === "") {
      return { success: true, data: null };
    }
    return this.core.wrap(async () => {
      const idNorm = String(collectionId).trim().replace(/-/g, "");
      const [result] = await this.db.execute(
        sql`SELECT "data" FROM "content_nodes" WHERE ("_id" = ${collectionId} OR "_id" = ${idNorm}) AND "nodeType" = 'collection' LIMIT 1`,
      );
      if (!result) {
        return null;
      }
      return (result as unknown as { data: Schema }).data;
    }, "GET_SCHEMA_BY_ID_FAILED");
  }

  async listSchemas(_tenantId?: DatabaseId | null): Promise<DatabaseResult<Schema[]>> {
    return this.core.wrap(async () => {
      const results = await this.db.execute(
        sql`SELECT "data" FROM "content_nodes" WHERE "nodeType" = 'collection'`,
      );
      return (results as unknown as { data: Schema }[]).map((r) => r.data).filter(Boolean);
    }, "LIST_SCHEMAS_FAILED");
  }
}
