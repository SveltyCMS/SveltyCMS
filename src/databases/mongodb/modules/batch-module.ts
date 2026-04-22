/**
 * @file src/databases/mongodb/modules/batch-module.ts
 * @description Batch operations module for MongoDB.
 */

import { DatabaseModule } from "../../base-adapter";
import type {
  DatabaseResult,
  DatabaseId,
  EntityCreate,
  EntityUpdate,
  QueryFilter,
} from "../../db-interface";
import type { MongoAdapterCore } from "../adapter/adapter-core";

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
        if (op.operation === "insert")
          return (this.adapter as any)["crud"].insert(op.collection, op.data as any);
        if (op.operation === "update")
          return (this.adapter as any)["crud"].update(op.collection, op.id!, op.data as any);
        if (op.operation === "delete")
          return (this.adapter as any)["crud"].delete(op.collection, op.id!);
        return (this.adapter as any)["crud"].upsert(op.collection, op.query!, op.data as any);
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
    const res = await Promise.all(
      updates.map((upd) =>
        (this.adapter as any)["crud"].update(collection, upd.id, upd.data as any),
      ),
    );
    return { success: true as const, data: { modifiedCount: res.filter((r) => r.success).length } };
  }

  async bulkDelete(
    collection: string,
    ids: DatabaseId[],
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    return (this.adapter as any)["crud"].deleteMany(collection, { _id: { $in: ids } } as any);
  }

  async bulkUpsert(
    collection: string,
    items: Array<{ id: DatabaseId; data: any }>,
  ): Promise<DatabaseResult<any>> {
    return (this.adapter as any)["crud"].upsertMany(
      collection,
      items.map((item) => ({ query: { _id: item.id } as any, data: item.data })),
    ) as any;
  }
}
