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
    if (model) return model;
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
    const tableName = `collection_${id}`;
    const dynamicTable = this.core.createDynamicTableDefinition(tableName);
    this.core.dynamicTables.set(id, dynamicTable);
    this.core.dynamicTables.set(tableName, dynamicTable);
  }

  async updateModel(s: Schema): Promise<void> {
    await this.createModel(s);
  }

  async deleteModel(id: string): Promise<void> {
    this.collectionRegistry.delete(id);
    if (this.core.pool) await this.core.pool.query(`DROP TABLE IF EXISTS \`collection_${id}\``);
  }

  async getSchema(_c: string): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }
  async getSchemaById(_c: string): Promise<DatabaseResult<Schema | null>> {
    return { success: true, data: null };
  }

  async listSchemas(tenantId?: string | null): Promise<DatabaseResult<Schema[]>> {
    try {
      const filter: Record<string, any> = { nodeType: "collection" };
      if (tenantId) filter.tenantId = tenantId;
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
      if (this.core.pool) {
        const dbName = (this.core as any).config?.name || "";
        const [tables] = await this.core.pool.query(
          "SELECT TABLE_NAME as name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE 'collection_%'",
          [dbName],
        );
        const schemas: Schema[] = [];
        for (const t of tables as any[]) {
          const name = (t.name || "").replace("collection_", "");
          if (!name) continue;
          let fields: any[] = [];
          try {
            const rows = await this.core.pool.query(`SELECT data FROM \`${t.name}\` LIMIT 1`);
            const row = (rows as any[])?.[0];
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
          schemas.push({
            _id: name,
            name,
            fields,
            status: "publish",
          } as Schema);
        }
        return { success: true, data: schemas };
      }
    } catch {
      /* ignore */
    }
    return { success: true, data: [] };
  }
}
