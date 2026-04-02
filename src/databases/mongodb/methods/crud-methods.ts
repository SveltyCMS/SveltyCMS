/**
 * @file src/databases/mongodb/methods/crud-methods.ts
 * @description Generic, reusable CRUD operations for any MongoDB collection.
 */

import { safeQuery } from "@src/utils/security/safe-query";
import { nowISODateString } from "@utils/date-utils";
import mongoose, { type Model } from "mongoose";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  QueryFilter,
  BaseQueryOptions,
  FindOptions,
  EntityCreate,
  EntityUpdate,
} from "../../db-interface";
import { createDatabaseError, generateId, processDates } from "./mongodb-utils";

export class MongoCrudMethods<T extends BaseEntity> {
  public readonly model: Model<T>;

  constructor(model: Model<T>) {
    this.model = model;
  }

  async findOne(
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    try {
      const secureQuery = safeQuery(query, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
        includeDeleted: options.includeDeleted,
      });
      const result = await this.model.findOne(secureQuery, options.fields?.join(" ")).lean().exec();

      const meta = { executionTime: performance.now() - startTime };
      if (!result) {
        return { success: true, data: null, meta };
      }
      return { success: true, data: processDates(result) as T, meta };
    } catch (error) {
      return {
        success: false,
        message: `Failed to find document in ${this.model.modelName}`,
        error: createDatabaseError(
          error,
          "FIND_ONE_ERROR",
          `Failed to find document in ${this.model.modelName}`,
        ),
      };
    }
  }

  async findByIds(ids: DatabaseId[], options: FindOptions<T> = {}): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    try {
      const secureQuery = safeQuery(
        { _id: { $in: ids } } as unknown as QueryFilter<T>,
        options.tenantId as string,
        {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
        },
      );
      const results = await this.model
        .find(secureQuery)
        .select(options.fields?.join(" ") || "")
        .lean()
        .exec();
      return {
        success: true,
        data: processDates(results) as T[],
        meta: { executionTime: performance.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to find documents by IDs in ${this.model.modelName}`,
        error: createDatabaseError(
          error,
          "FIND_BY_IDS_ERROR",
          `Failed to find documents by IDs in ${this.model.modelName}`,
        ),
      };
    }
  }

  async findMany(
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    try {
      const secureQuery = safeQuery(query, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
        includeDeleted: options.includeDeleted,
      });

      // Convert sort options if they exist
      const sort = options.sort as any;

      const results = await this.model
        .find(secureQuery)
        .sort(sort || {})
        .skip(options.offset ?? 0)
        .limit(options.limit ?? 0)
        .select(options.fields?.join(" ") || "")
        .lean()
        .exec();
      return {
        success: true,
        data: processDates(results) as T[],
        meta: { executionTime: performance.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to find documents in ${this.model.modelName}`,
        error: createDatabaseError(
          error,
          "FIND_MANY_ERROR",
          `Failed to find documents in ${this.model.modelName}`,
        ),
      };
    }
  }

  async insert(data: EntityCreate<T>, options: BaseQueryOptions = {}): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    try {
      const secureData = safeQuery(data as Record<string, unknown>, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
        includeDeleted: true,
      });
      const now = nowISODateString();
      const doc = new this.model({
        ...secureData,
        _id: (secureData._id as string) || generateId(),
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
      const result = await doc.save();
      return {
        success: true,
        data: (result as mongoose.HydratedDocument<T>).toObject() as T,
        meta: { executionTime: performance.now() - startTime },
      };
    } catch (error) {
      if (error instanceof mongoose.mongo.MongoServerError && error.code === 11_000) {
        return {
          success: false,
          message: "Duplicate key error",
          error: createDatabaseError(error, "UNIQUE_CONSTRAINT_VIOLATION", "Duplicate key error"),
        };
      }
      return {
        success: false,
        message: "Insert failed",
        error: createDatabaseError(error, "INSERT_ERROR", "Insert failed"),
      };
    }
  }

  async insertMany(
    data: EntityCreate<T>[],
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T[]>> {
    const startTime = performance.now();
    try {
      const now = nowISODateString();
      const docs = data.map((d) => {
        const secureData = safeQuery(d as Record<string, unknown>, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: true,
        });
        return {
          ...secureData,
          _id: (secureData._id as string) || generateId(),
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };
      });
      const result = await this.model.insertMany(docs);
      return {
        success: true,
        data: result.map((doc) => (doc as unknown as mongoose.HydratedDocument<T>).toObject() as T),
        meta: { executionTime: performance.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        message: "Insert many failed",
        error: createDatabaseError(error, "INSERT_MANY_ERROR", "Insert many failed"),
      };
    }
  }

  async update(
    id: DatabaseId,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    try {
      const query = safeQuery({ _id: id } as QueryFilter<T>, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
      });
      const updateData = {
        ...(data as object),
        updatedAt: nowISODateString(),
      };
      const result = await this.model
        .findOneAndUpdate(query, { $set: updateData }, { returnDocument: "after" })
        .lean()
        .exec();

      if (!result) {
        return {
          success: false,
          message: "Not found",
          error: { code: "RECORD_NOT_FOUND", message: "Not found" },
        };
      }
      return {
        success: true,
        data: processDates(result) as T,
        meta: { executionTime: performance.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        message: "Update failed",
        error: createDatabaseError(error, "UPDATE_ERROR", "Update failed"),
      };
    }
  }

  async updateMany(
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    try {
      const secureQuery = safeQuery(query, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
      });
      const updateData = {
        ...(data as object),
        updatedAt: nowISODateString(),
      };
      const result = await this.model.updateMany(secureQuery, { $set: updateData });
      return { success: true, data: { modifiedCount: result.modifiedCount } };
    } catch (error) {
      return {
        success: false,
        message: "Update many failed",
        error: createDatabaseError(error, "UPDATE_MANY_ERROR", "Update many failed"),
      };
    }
  }

  async upsert(
    query: QueryFilter<T>,
    data: EntityCreate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<T>> {
    try {
      const secureQuery = safeQuery(query, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
      });
      const result = await this.model
        .findOneAndUpdate(
          secureQuery,
          {
            $set: { ...(data as Record<string, unknown>), updatedAt: nowISODateString() },
            $setOnInsert: {
              _id: generateId(),
              createdAt: nowISODateString(),
              tenantId: options.tenantId || (data as any).tenantId,
            },
          },
          { returnDocument: "after", upsert: true, runValidators: true },
        )
        .lean()
        .exec();
      return { success: true, data: processDates(result) as T };
    } catch (error) {
      return {
        success: false,
        message: "Upsert failed",
        error: createDatabaseError(error, "UPSERT_ERROR", "Upsert failed"),
      };
    }
  }

  async delete(
    id: DatabaseId,
    options: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId } = {},
  ): Promise<DatabaseResult<void>> {
    try {
      const { tenantId, bypassTenantCheck, permanent, userId } = options;
      const query = safeQuery({ _id: id } as QueryFilter<T>, tenantId as string, {
        bypassTenantCheck,
      });

      if (permanent) {
        const result = await this.model.deleteOne(query);
        if ((result.deletedCount ?? 0) === 0) {
          return {
            success: false,
            message: "Not found",
            error: { code: "RECORD_NOT_FOUND", message: "Not found" },
          };
        }
        return { success: true, data: undefined };
      }

      // Soft Delete with unique field mangling
      const doc = await this.model.findOne(query).lean().exec();
      if (!doc) {
        return {
          success: false,
          message: "Not found",
          error: { code: "RECORD_NOT_FOUND", message: "Not found" },
        };
      }

      const now = nowISODateString();
      const updateData: any = {
        isDeleted: true,
        deletedAt: now,
        deletedBy: userId,
        updatedAt: now,
      };

      // Mangle unique fields to prevent collisions
      const timestamp = Date.now();
      const schemaPaths = this.model.schema.paths;
      for (const [path, definition] of Object.entries(schemaPaths)) {
        if ((definition as any)._userProvidedOptions?.unique && (doc as any)[path]) {
          updateData[path] = `${(doc as any)[path]}_DELETED_${timestamp}`;
        }
      }

      await this.model.updateOne(query, { $set: updateData });
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: "Delete failed",
        error: createDatabaseError(error, "DELETE_ERROR", "Delete failed"),
      };
    }
  }

  async deleteMany(
    query: QueryFilter<T>,
    options: BaseQueryOptions & { permanent?: boolean; userId?: DatabaseId } = {},
  ): Promise<DatabaseResult<{ deletedCount: number }>> {
    try {
      const { tenantId, bypassTenantCheck, permanent, userId } = options;
      const secureQuery = safeQuery(query, tenantId as string, { bypassTenantCheck });

      if (permanent) {
        const result = await this.model.deleteMany(secureQuery);
        return { success: true, data: { deletedCount: result.deletedCount } };
      }

      const now = nowISODateString();
      const result = await this.model.updateMany(secureQuery, {
        $set: { isDeleted: true, deletedAt: now, deletedBy: userId, updatedAt: now },
      });
      return { success: true, data: { deletedCount: result.modifiedCount } };
    } catch (error) {
      return {
        success: false,
        message: "Delete many failed",
        error: createDatabaseError(error, "DELETE_MANY_ERROR", "Delete many failed"),
      };
    }
  }

  async restore(id: DatabaseId, options: BaseQueryOptions = {}): Promise<DatabaseResult<void>> {
    try {
      const query = safeQuery({ _id: id } as QueryFilter<T>, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
        includeDeleted: true,
      });

      const doc = await this.model.findOne(query).lean().exec();
      if (!doc) {
        return {
          success: false,
          message: "Not found",
          error: { code: "RECORD_NOT_FOUND", message: "Not found" },
        };
      }

      const updateData: any = {
        isDeleted: false,
        updatedAt: nowISODateString(),
      };

      // De-mangle unique fields and check for collisions
      const schemaPaths = this.model.schema.paths;
      for (const [path, definition] of Object.entries(schemaPaths)) {
        if ((definition as any)._userProvidedOptions?.unique && (doc as any)[path]) {
          const originalValue = String((doc as any)[path]).replace(/_DELETED_\d+$/, "");

          // Collision check
          const collisionQuery = safeQuery(
            { [path]: originalValue } as any,
            options.tenantId as string,
            {
              bypassTenantCheck: options.bypassTenantCheck,
            },
          );
          const collision = await this.model.findOne(collisionQuery).lean().exec();
          if (collision) {
            return {
              success: false,
              message: `Cannot restore: unique field '${path}' with value '${originalValue}' already exists.`,
              error: { code: "UNIQUE_CONSTRAINT_VIOLATION", message: "Collision detected" },
            };
          }

          updateData[path] = originalValue;
        }
      }

      await this.model.updateOne(query, {
        $set: updateData,
        $unset: { deletedAt: "", deletedBy: "" },
      });
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        message: "Restore failed",
        error: createDatabaseError(error, "RESTORE_ERROR", "Restore failed"),
      };
    }
  }

  async count(
    query: QueryFilter<T> = {},
    options: BaseQueryOptions & { includeDeleted?: boolean } = {},
  ): Promise<DatabaseResult<number>> {
    try {
      const secureQuery = safeQuery(query, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
        includeDeleted: options.includeDeleted,
      });
      const count = await this.model.countDocuments(secureQuery);
      return { success: true, data: count };
    } catch (error) {
      return {
        success: false,
        message: "Count failed",
        error: createDatabaseError(error, "COUNT_ERROR", "Count failed", options.silent),
      };
    }
  }

  async exists(
    query: QueryFilter<T>,
    options: BaseQueryOptions & { includeDeleted?: boolean } = {},
  ): Promise<DatabaseResult<boolean>> {
    try {
      const secureQuery = safeQuery(query, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
        includeDeleted: options.includeDeleted,
      });
      const doc = await this.model.findOne(secureQuery, { _id: 1 }).lean().exec();
      return { success: true, data: !!doc };
    } catch (error) {
      return {
        success: false,
        message: "Exists failed",
        error: createDatabaseError(error, "EXISTS_ERROR", "Exists failed"),
      };
    }
  }

  async aggregate<R>(
    pipeline: unknown[],
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<R[]>> {
    try {
      const securePipeline = [...(pipeline as any[])];
      if (!options.bypassTenantCheck && options.tenantId) {
        securePipeline.unshift({ $match: { tenantId: options.tenantId } });
      }
      const result = await this.model.aggregate(securePipeline).exec();
      return { success: true, data: result as R[] };
    } catch (error) {
      return {
        success: false,
        message: "Aggregation failed",
        error: createDatabaseError(error, "AGGREGATION_ERROR", "Aggregation failed"),
      };
    }
  }

  async upsertMany(
    items: Array<{ query: QueryFilter<T>; data: EntityCreate<T> }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ upsertedCount: number; modifiedCount: number }>> {
    try {
      if (items.length === 0)
        return { success: true, data: { upsertedCount: 0, modifiedCount: 0 } };
      const now = nowISODateString();
      const ops = items.map((item) => ({
        updateOne: {
          filter: safeQuery(item.query, options.tenantId as string, {
            bypassTenantCheck: options.bypassTenantCheck,
          }),
          update: {
            $set: { ...(item.data as any), updatedAt: now },
            $setOnInsert: {
              _id: generateId(),
              createdAt: now,
              tenantId: options.tenantId || (item.data as any).tenantId,
              isDeleted: false,
            },
          },
          upsert: true,
        },
      }));
      const res = await this.model.bulkWrite(ops as any[]);
      return {
        success: true,
        data: { upsertedCount: res.upsertedCount, modifiedCount: res.modifiedCount },
      };
    } catch (error) {
      return {
        success: false,
        message: "Upsert many failed",
        error: createDatabaseError(error, "UPSERT_MANY_ERROR", "Upsert many failed"),
      };
    }
  }
}
