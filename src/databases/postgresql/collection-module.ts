/**
 * @file src/databases/postgresql/collection-module.ts
 * @description Collection management module for PostgreSQL
 */

import { sql } from "drizzle-orm";
import type { CollectionModel, DatabaseResult, Schema, ICollectionAdapter } from "../db-interface";
import type { PostgresAdapterCore } from "./adapter-core";
import type { DatabaseId } from "@src/content/types";

export class CollectionModule implements ICollectionAdapter {
  constructor(private readonly core: PostgresAdapterCore) {}

  private get db() {
    return this.core.db!;
  }

  async getModel(id: string): Promise<CollectionModel> {
    const wrappedModel: CollectionModel = {
      findOne: async <R = unknown>(query: Record<string, unknown>) => {
        const res = await this.core.crud.findOne<any>(id, query as any);
        return res.success ? (res.data as R) : null;
      },
      aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
        const res = await this.core.crud.aggregate<R>(id, pipeline);
        return res.success ? res.data : [];
      },
    };
    return wrappedModel;
  }

  async createModel(schema: Schema, _force?: boolean): Promise<void> {
    const id = schema._id;
    if (!id) throw new Error("Schema must have an _id");
    await this.core.createModel(schema);
    const tableName = `collection_${id}`;
    const dynamicTable = this.core.createDynamicTableDefinition(tableName);
    this.core.dynamicTables.set(id, dynamicTable);
    this.core.dynamicTables.set(tableName, dynamicTable);
  }

  async updateModel(schema: Schema): Promise<void> {
    await this.createModel(schema);
  }

  async deleteModel(id: string): Promise<void> {
    const tableName = `collection_${id}`;
    await this.db.execute(sql`DROP TABLE IF EXISTS ${sql.identifier(tableName)} CASCADE`);
  }

  async getSchema(_c: string, _t?: DatabaseId | null): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }

  async getSchemaById(_c: string, _t?: DatabaseId | null): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }

  async listSchemas(tenantId?: DatabaseId | null): Promise<DatabaseResult<Schema[]>> {
    try {
      const filter: Record<string, any> = { nodeType: "collection" };
      if (tenantId) filter.tenantId = tenantId;
      const res = await this.core.crud.findMany("content_nodes", filter as any);
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
            if (def && typeof def === "object") schemas.push(def as Schema);
          }
        }
        if (schemas.length > 0) return { success: true, data: schemas };
      }
    } catch {
      /* ignore */
    }

    // Fallback: table listing with field discovery from data rows
    try {
      const tables = await this.db.execute(
        sql.raw("SELECT tablename FROM pg_catalog.pg_tables WHERE tablename LIKE 'collection_%'"),
      );
      const rows = (tables as any).rows || [];
      const schemas: Schema[] = [];
      for (const t of rows) {
        const name = (t.tablename || "").replace("collection_", "");
        if (!name) continue;
        let fields: any[] = [];
        try {
          const samp = await this.db.execute(sql.raw(`SELECT data FROM "${t.tablename}" LIMIT 1`));
          const row = (samp as any).rows?.[0];
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
        } catch {
          /* best effort */
        }
        schemas.push({ _id: name, name, fields, status: "publish" } as Schema);
      }
      return { success: true, data: schemas };
    } catch {
      /* ignore */
    }
    return { success: true, data: [] };
  }
}
