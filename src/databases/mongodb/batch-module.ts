/**
 * @file src/databases/mongodb/modules/batch-module.ts
 * @description Batch operations module for MongoDB.
 */

import { DatabaseModule } from "../core/base-adapter";
import { sameBatchPayload } from "../core/relational-utils";
import type {
  DatabaseResult,
  DatabaseId,
  EntityCreate,
  EntityUpdate,
  QueryFilter,
} from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";

export class MongoBatchModule extends DatabaseModule<MongoAdapterCore> {
  async execute(
    ops: Array<{
      operation: "insert" | "update" | "delete" | "upsert";
      collection: string;
      id?: DatabaseId;
      query?: QueryFilter<any>;
      data?: any;
    }>,
  ): Promise<DatabaseResult<any>> {
    const results = await Promise.all(
      ops.map((op) => {
        switch (op.operation) {
          case "insert":
            return (this.adapter as any)["crud"].create(op.collection, op.data);
          case "update":
            return (this.adapter as any)["crud"].update(
              op.collection,
              op.id || (op.query as any)?._id,
              op.data,
            );
          case "delete":
            return (this.adapter as any)["crud"].delete(
              op.collection,
              op.id || (op.query as any)?._id,
            );
          case "upsert":
            return (this.adapter as any)["crud"].upsert(op.collection, op.query, op.data);
        }
      }),
    );
    return {
      success: true as const,
      data: {
        success: results.every((r) => r.success),
        results: results as any,
        errors: results.filter((r) => !r.success).map((r) => (r as any).error),
        totalProcessed: results.length,
      },
    };
  }

  async bulkInsert(collection: string, data: EntityCreate<any>[]): Promise<DatabaseResult<any[]>> {
    return (this.adapter as any)["crud"].insertMany(collection, data as any);
  }

  async bulkUpdate(
    collection: string,
    updates: Array<{ id: DatabaseId; data: EntityUpdate<any> }>,
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    if (!updates.length) {
      return { success: true as const, data: { modifiedCount: 0 } };
    }

    const model = (this.adapter as any).getModel?.(collection);

    // Homogeneous payload (status/archive) → one updateMany, not N updateOne ops.
    if (model && sameBatchPayload(updates)) {
      const ids = updates.map((upd) => upd.id);
      const { _id: _idOut, createdAt: _createdAt, ...set } = { ...updates[0].data };
      const result = await model.updateMany({ _id: { $in: ids } }, { $set: set });
      return {
        success: true as const,
        data: { modifiedCount: result.modifiedCount ?? -1 },
      };
    }

    // Heterogeneous payloads: one bulkWrite round-trip (~10-50x vs Promise.all).
    if (model && updates.length > 1) {
      const bulkOps = updates.map((upd) => {
        // createdAt is insert-only — never rewrite it through $set.
        const { _id: _idOut, createdAt: _createdAt, ...set } = { ...upd.data };
        return {
          updateOne: {
            filter: { _id: upd.id },
            update: { $set: set },
          },
        };
      });
      const result = await model.bulkWrite(bulkOps, { ordered: true });
      return {
        success: true as const,
        data: { modifiedCount: result.modifiedCount },
      };
    }
    const res = await Promise.all(
      updates.map((upd) =>
        (this.adapter as any)["crud"].update(collection, upd.id, upd.data as any),
      ),
    );
    return {
      success: true as const,
      data: { modifiedCount: res.filter((r: { success?: boolean }) => r.success).length },
    };
  }

  async bulkDelete(
    collection: string,
    ids: DatabaseId[],
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return (this.adapter as any)["crud"].deleteMany(collection, {
      _id: { $in: ids },
    } as any);
  }

  async bulkUpsert(
    collection: string,
    items: Array<{ id: DatabaseId; data: any }>,
  ): Promise<DatabaseResult<any>> {
    return (this.adapter as any)["crud"].upsertMany(
      collection,
      items.map((item) => ({
        query: { _id: item.id } as any,
        data: item.data,
      })),
    ) as any;
  }
}
