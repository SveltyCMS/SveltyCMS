/**
 * @file src/databases/postgresql/collection/collection-module.ts
 * @description Collection management module for PostgreSQL
 */

import { logger } from "@utils/logger";
import { sql } from "drizzle-orm";
import type { CollectionModel, DatabaseResult, Schema, ICollectionAdapter } from "../db-interface";
import type { AdapterCore } from "./adapter-core";
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
    const id = schema._id || schema.name || "unnamed";
    const tableName = id.startsWith("collection_") ? id : `collection_${id}`;

    logger.info(`PostgreSQL createModel: Creating table "${tableName}"...`);

    if (force) {
      await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
    }

    // Clear any cached prepared statements for this collection to avoid stale plans
    if (typeof (this.core.crud as any).clearPreparedStatements === "function") {
      (this.core.crud as any).clearPreparedStatements(id);
    }

    // Register collection ID so getTable() knows it's a dynamic collection
    this.core.collectionRegistry.set(id, { id, name: id });
    this.core.collectionRegistry.set(tableName, { id, name: id });

    // 🚀 CACHE: Register the dynamic table definition immediately
    const dynamicTable = this.core.createDynamicTableDefinition(tableName);
    this.core.dynamicTables.set(id, dynamicTable);
    this.core.dynamicTables.set(tableName, dynamicTable);

    await this.db.execute(sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(tableName)} (
        "_id" VARCHAR(36) PRIMARY KEY,
        "tenantId" VARCHAR(36),
        "data" JSONB NOT NULL DEFAULT '{}',
        "status" VARCHAR(50) NOT NULL DEFAULT 'draft',
        "isDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
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
    const tableName = id.startsWith("collection_") ? id : `collection_${id}`;
    await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);

    // Invalidate prepared statements
    if (typeof (this.core.crud as any).clearPreparedStatements === "function") {
      (this.core.crud as any).clearPreparedStatements(id);
    }
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
