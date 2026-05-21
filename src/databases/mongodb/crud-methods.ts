/**
 * @file src/databases/mongodb/methods/crud-methods.ts
 * @description Generic, reusable CRUD operations for any MongoDB collection.
 */

import { safeQuery } from "@src/utils/security/safe-query";
import { nowISODateString } from "@utils/date";
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
} from "../db-interface";
import { createDatabaseError, generateId, processDates } from "./mongodb-utils";

export class MongoCrudMethods<T extends BaseEntity> {
  public readonly model: Model<T>;
  protected readonly adapter: any;

  constructor(model: Model<T>, adapter: any) {
    this.model = model;
    this.adapter = adapter;
  }

  /**
   * 🚀 FAST PATH: Identifies simple ID lookups.
   * Optimized to avoid Object.keys() allocation.
   */
  private isLookupQuery(query: any): boolean {
    if (!query || typeof query !== "object") return false;
    let count = 0;
    let hasId = false;

    for (const key in query) {
      count++;
      if (count > 2) return false; // Too many fields for a simple lookup
      if (key === "_id") hasId = true;
      else if (key !== "tenantId") return false; // Non-lookup field
    }

    return hasId && count > 0;
  }

  async findOne(
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    try {
      // 🚀 ULTRA FAST PATH: Direct ID lookup bypasses safeQuery and mapQuery overhead
      if (
        this.isLookupQuery(query) &&
        !options.includeDeleted &&
        this.model.collection.name !== "auth_tokens" &&
        this.model.collection.name !== "sessions"
      ) {
        const id = (query as any)._id;
        const filter: any = { _id: id };
        if (options.tenantId) filter.tenantId = options.tenantId;

        const result = await this.model.findOne(filter, options.fields?.join(" ")).lean().exec();

        const meta = { executionTime: performance.now() - startTime };
        if (!result) return { success: true, data: null, meta };
        return { success: true, data: processDates(result) as T, meta };
      }

      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      const queryOptions: any = {};
      if (options.hints?.readConcern) {
        queryOptions.readConcern = options.hints.readConcern;
      }
      if (options.hints?.readPreference) {
        queryOptions.readPreference = options.hints.readPreference;
      }

      const result = await this.model
        .findOne(secureQuery, options.fields?.join(" "), queryOptions)
        .lean()
        .exec();

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
      // 🚀 Fast-Path: Direct ID list lookup
      if (!options.tenantId && !options.includeDeleted && !options.bypassTenantCheck) {
        const results = await this.model
          .find({ _id: { $in: ids } } as any, options.fields?.join(" ") || "")
          .lean()
          .exec();
        return {
          success: true,
          data: processDates(results) as T[],
          meta: { executionTime: performance.now() - startTime },
        };
      }

      const secureQuery = this.adapter.mapQuery(
        safeQuery({ _id: { $in: ids } } as unknown as QueryFilter<T>, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      const queryOptions: any = {};
      if (options.hints?.readConcern) {
        queryOptions.readConcern = options.hints.readConcern;
      }
      if (options.hints?.readPreference) {
        queryOptions.readPreference = options.hints.readPreference;
      }

      const results = await this.model
        .find(secureQuery, options.fields?.join(" ") || "", queryOptions)
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
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      // Convert sort options if they exist
      const sort = options.sort as any;

      const queryOptions: any = {};
      if (options.hints?.readConcern) {
        queryOptions.readConcern = options.hints.readConcern;
      }
      if (options.hints?.readPreference) {
        queryOptions.readPreference = options.hints.readPreference;
      }

      const results = await this.model
        .find(secureQuery, options.fields?.join(" ") || "", queryOptions)
        .sort(sort || {})
        .skip(options.offset ?? 0)
        .limit(options.limit || 1000)
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

  async streamMany(
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<AsyncIterable<T>>> {
    try {
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      const cursor = this.model
        .find(secureQuery, options.fields?.join(" ") || "")
        .sort((options.sort as any) || {})
        .skip(options.offset ?? 0)
        .limit(options.limit || 1000)
        .lean()
        .cursor();

      const generator = async function* () {
        for await (const doc of cursor) {
          yield processDates(doc) as T;
        }
      };

      return { success: true, data: generator() as AsyncIterable<T> };
    } catch (error) {
      return {
        success: false,
        message: "Streaming failed",
        error: createDatabaseError(error, "STREAM_MANY_ERROR", "Streaming failed"),
      };
    }
  }

  async insert(data: EntityCreate<T>, options: BaseQueryOptions = {}): Promise<DatabaseResult<T>> {
    const startTime = performance.now();
    try {
      // Fix: removed includeDeleted: true from insert safeQuery (copy-paste error)
      const secureData = safeQuery(data as Record<string, unknown>, options.tenantId as string, {
        bypassTenantCheck: options.bypassTenantCheck,
        bypassSafeQuery: options.bypassSafeQuery,
      });

      const now = nowISODateString();
      const doc = new this.model({
        ...secureData,
        _id: (secureData._id as string) || generateId(),
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
      const saveOptions: any = {};
      if (options.hints?.writeConcern) {
        saveOptions.w = options.hints.writeConcern;
      }
      const result = await doc.save(saveOptions);
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
      if (data.length === 0) return { success: true, data: [] };

      const now = nowISODateString();
      const ops = data.map((d) => {
        const secureData = safeQuery(d as Record<string, unknown>, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          bypassSafeQuery: options.bypassSafeQuery,
        });

        const doc = {
          ...secureData,
          _id: (secureData._id as string) || generateId(),
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        };
        return { insertOne: { document: doc } };
      });

      const bulkOptions: any = { ordered: false };
      if (options.hints?.writeConcern) {
        bulkOptions.w = options.hints.writeConcern;
      }

      const result = await this.model.bulkWrite(ops as any[], bulkOptions);

      // Extract the inserted documents from the ops for the result
      const insertedDocs = ops.map((op) => op.insertOne.document) as unknown as T[];

      return {
        success: true,
        data: insertedDocs,
        meta: {
          executionTime: performance.now() - startTime,
          recordsExamined: result.insertedCount,
        },
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
    // 🛡️ HARDENING: Prevent driver-level crashes if ID is accidentally undefined/null
    if (id === undefined || id === null) {
      return {
        success: false,
        message: `Update failed: ID is ${id}`,
        error: {
          code: "INVALID_ID",
          message: `Cannot update ${this.model.modelName} with ${id} ID`,
        },
      };
    }

    const startTime = performance.now();
    try {
      // 🚀 Fast-Path: Direct ID update
      if (!options.tenantId && !options.bypassTenantCheck) {
        const now = nowISODateString();
        const { _id: _, ...updateData } = { ...data, updatedAt: now } as any;
        const result = await this.model
          .findOneAndUpdate(
            { _id: id },
            { $set: updateData },
            { returnDocument: "after", lean: true, runValidators: true, cloneUpdate: false },
          )
          .exec();
        if (!result)
          return {
            success: false,
            message: "Not found",
            error: { code: "RECORD_NOT_FOUND", message: "Not found" },
          };
        return {
          success: true,
          data: processDates(result) as T,
          meta: { executionTime: performance.now() - startTime },
        };
      }

      const query = this.adapter.mapQuery(
        safeQuery({ _id: id } as QueryFilter<T>, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      const now = nowISODateString();
      const { _id: _, ...updateData } = {
        ...data,
        updatedAt: now,
      } as any;

      const result = await this.model
        .findOneAndUpdate(
          query,
          { $set: updateData },
          {
            returnDocument: "after",
            lean: true,
            runValidators: true,
            // 🚀 Mongoose Performance: Skip redundant update object cloning
            cloneUpdate: false,
          },
        )
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
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );
      const updateOptions: any = { cloneUpdate: false };
      if (options.hints?.writeConcern) {
        updateOptions.w = options.hints.writeConcern;
      }
      const result = await this.model.updateMany(
        secureQuery,
        {
          $set: (() => {
            const { _id: _, ...d } = { ...data, updatedAt: nowISODateString() } as any;
            return d;
          })(),
        },
        updateOptions,
      );
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
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );
      const now = nowISODateString();
      const upsertOptions: any = {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        cloneUpdate: false,
      };
      if (options.hints?.writeConcern) {
        upsertOptions.w = options.hints.writeConcern;
      }

      const result = await this.model
        .findOneAndUpdate(
          secureQuery,
          {
            $set: (() => {
              const { _id: _, tenantId: __, ...d } = { ...(data as any), updatedAt: now };
              return d;
            })(),
            $setOnInsert: {
              _id: (data as any)._id || generateId(),
              createdAt: now,
              tenantId: options.tenantId || (data as any).tenantId,
            },
          },
          upsertOptions,
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
    // 🛡️ HARDENING: Prevent driver-level crashes if ID is accidentally undefined/null
    if (id === undefined || id === null) {
      return {
        success: false,
        message: `Delete failed: ID is ${id}`,
        error: {
          code: "INVALID_ID",
          message: `Cannot delete ${this.model.modelName} with ${id} ID`,
        },
      };
    }

    try {
      const { tenantId, bypassTenantCheck, permanent, userId } = options;
      const query = this.adapter.mapQuery(
        safeQuery({ _id: id } as QueryFilter<T>, tenantId as string, {
          bypassTenantCheck,
          includeDeleted: permanent,
          bypassSafeQuery: (options as any).bypassSafeQuery,
        }),
      );

      const deleteOptions: any = {};
      if (options.hints?.writeConcern) {
        deleteOptions.w = options.hints.writeConcern;
      }

      if (permanent) {
        const result = await this.model.deleteOne(query, deleteOptions);
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

      // Fix: Soft-delete field mangling now handles both user-provided unique and index-defined unique fields
      const uniqueFields = new Set<string>();
      const schemaPaths = this.model.schema.paths;
      for (const [path, definition] of Object.entries(schemaPaths)) {
        if ((definition as any)._userProvidedOptions?.unique) uniqueFields.add(path);
      }

      // Check indexes for unique constraints
      const indexes = this.model.schema.indexes();
      for (const [indexFields, options] of indexes) {
        if (options.unique) {
          Object.keys(indexFields).forEach((field) => uniqueFields.add(field));
        }
      }

      for (const path of uniqueFields) {
        if ((doc as any)[path]) {
          updateData[path] = `${(doc as any)[path]}_DELETED_${timestamp}`;
        }
      }

      await this.model.updateOne(query, { $set: updateData }, deleteOptions);
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
  ): Promise<DatabaseResult<{ deletedCount: number; matchedCount: number }>> {
    try {
      const { tenantId, bypassTenantCheck, permanent, userId } = options;
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, tenantId as string, {
          bypassTenantCheck,
          includeDeleted: permanent,
          bypassSafeQuery: (options as any).bypassSafeQuery,
        }),
      );

      const deleteOptions: any = {};
      if (options.hints?.writeConcern) {
        deleteOptions.w = options.hints.writeConcern;
      }

      if (permanent) {
        const result = await this.model.deleteMany(secureQuery, deleteOptions);
        return {
          success: true,
          data: { deletedCount: result.deletedCount || 0, matchedCount: result.deletedCount || 0 },
        };
      }

      const now = nowISODateString();
      const result = await this.model.updateMany(
        secureQuery,
        {
          $set: { isDeleted: true, deletedAt: now, deletedBy: userId, updatedAt: now },
        },
        deleteOptions,
      );
      // Fix: deleteMany soft-delete correctly returns modifiedCount as deletedCount for interface consistency
      return {
        success: true,
        data: { deletedCount: result.modifiedCount, matchedCount: result.matchedCount },
      };
    } catch (error) {
      return {
        success: false,
        message: "Delete many failed",
        error: createDatabaseError(error, "DELETE_MANY_ERROR", "Delete many failed"),
      };
    }
  }

  async restore(id: DatabaseId, options: BaseQueryOptions = {}): Promise<DatabaseResult<T>> {
    // 🛡️ HARDENING: Prevent driver-level crashes if ID is accidentally undefined/null
    if (id === undefined || id === null) {
      return {
        success: false,
        message: `Restore failed: ID is ${id}`,
        error: {
          code: "INVALID_ID",
          message: `Cannot restore ${this.model.modelName} with ${id} ID`,
        },
      };
    }

    try {
      const { tenantId, bypassTenantCheck } = options;
      const query = this.adapter.mapQuery(
        safeQuery({ _id: id, isDeleted: true } as QueryFilter<T>, tenantId as string, {
          bypassTenantCheck,
          includeDeleted: true,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      // Fetch document to identify mangled unique fields
      const doc = await this.model.findOne(query).lean().exec();
      if (!doc) {
        return {
          success: false,
          message: "Document not found or not deleted",
          error: { code: "RECORD_NOT_FOUND", message: "Document not found" },
        };
      }

      const now = nowISODateString();
      const updateData: any = {
        isDeleted: false,
        updatedAt: now,
      };

      // De-mangle unique fields
      const schemaPaths = this.model.schema.paths;
      const unsetFields: any = { deletedAt: "", deletedBy: "" };

      // Fix: restore de-mangling now uses a precise regex to avoid corrupting legitimate values
      const deMangleRegex = /_DELETED_\d+$/;

      for (const [path, definition] of Object.entries(schemaPaths)) {
        const isUnique =
          (definition as any)._userProvidedOptions?.unique ||
          this.model.schema
            .indexes()
            .some(([fields, opts]: [any, any]) => opts.unique && fields[path]);

        if (isUnique && (doc as any)[path]) {
          const value = (doc as any)[path];
          if (typeof value === "string" && deMangleRegex.test(value)) {
            updateData[path] = value.replace(deMangleRegex, "");
          }
        }
      }

      const result = await this.model
        .findOneAndUpdate(
          query,
          { $set: updateData, $unset: unsetFields },
          {
            returnDocument: "after",
            lean: true,
            runValidators: true,
            cloneUpdate: false,
          },
        )
        .exec();

      if (!result) {
        return {
          success: false,
          message: "Failed to restore document (it may have been modified or deleted concurrently)",
          error: { code: "RESTORE_FAILED", message: "Atomic update failed" },
        };
      }

      return { success: true, data: processDates(result) as T };
    } catch (error) {
      const err = error as any;
      if (
        err?.code === 11000 ||
        err?.code === 11001 ||
        (err?.message && (err.message.includes("E11000") || err.message.includes("duplicate key")))
      ) {
        return {
          success: false,
          message: "Cannot restore: another document already has the same unique values",
          error: { code: "COLLISION", message: "Duplicate value detected" },
        };
      }
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
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );
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
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );
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

  async aggregate(pipeline: any[], options: BaseQueryOptions = {}): Promise<DatabaseResult<any[]>> {
    try {
      const filter = this.adapter.mapQuery(
        safeQuery({}, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      const securePipeline = [...pipeline];

      // Inject mandatory filter (e.g. tenantId) at the start of the pipeline
      securePipeline.unshift({ $match: filter });

      // Scan for $lookup or $unionWith stages and inject the same filter to prevent cross-tenant bypass
      for (const stage of securePipeline) {
        if (stage.$lookup) {
          if (stage.$lookup.pipeline) {
            stage.$lookup.pipeline.unshift({ $match: filter });
          }
        }
        if (stage.$unionWith) {
          if (typeof stage.$unionWith === "object") {
            if (stage.$unionWith.pipeline) {
              stage.$unionWith.pipeline.unshift({ $match: filter });
            } else {
              // Convert simple union to pipeline with match
              const coll = stage.$unionWith.coll;
              stage.$unionWith = {
                coll,
                pipeline: [{ $match: filter }],
              };
            }
          }
        }
      }

      const result = await this.model.aggregate(securePipeline).exec();
      return { success: true, data: result };
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
          filter: this.adapter.mapQuery(
            safeQuery(item.query, options.tenantId as string, {
              bypassTenantCheck: options.bypassTenantCheck,
              bypassSafeQuery: options.bypassSafeQuery,
            }),
          ),

          update: {
            $set: (() => {
              const { _id: _, tenantId: __, ...d } = { ...(item.data as any), updatedAt: now };
              return d;
            })(),
            $setOnInsert: {
              _id: (item.data as any)._id || generateId(),
              createdAt: now,
              tenantId: options.tenantId || (item.data as any).tenantId,
              isDeleted: false,
            },
          },
          upsert: true,
        },
      }));
      const bulkOptions: any = { ordered: false };
      if (options.hints?.writeConcern) {
        bulkOptions.w = options.hints.writeConcern;
      }
      const res = await this.model.bulkWrite(ops as any[], bulkOptions);
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

  /**
   * Performs multiple different update operations in a single bulk request.
   */
  async bulkUpdate(
    updates: Array<{ query: QueryFilter<T>; data: EntityUpdate<T> }>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    const startTime = performance.now();
    try {
      if (updates.length === 0) return { success: true, data: { modifiedCount: 0 } };

      const now = nowISODateString();
      const ops = updates.map((update) => ({
        updateOne: {
          filter: this.adapter.mapQuery(
            safeQuery(update.query, options.tenantId as string, {
              bypassTenantCheck: options.bypassTenantCheck,
              bypassSafeQuery: options.bypassSafeQuery,
            }),
          ),
          update: {
            $set: { ...(update.data as any), updatedAt: now },
          },
        },
      }));

      const bulkOptions: any = { ordered: false };
      if (options.hints?.writeConcern) {
        bulkOptions.w = options.hints.writeConcern;
      }

      const result = await this.model.bulkWrite(ops as any[], bulkOptions);

      return {
        success: true,
        data: { modifiedCount: result.modifiedCount },
        meta: { executionTime: performance.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        message: "Bulk update failed",
        error: createDatabaseError(error, "BULK_UPDATE_ERROR", "Bulk update failed"),
      };
    }
  }

  /**
   * 🚀 ATOMIC INCREMENT: Uses MongoDB's native `$inc` operator for true concurrency safety.
   * Unlike read-modify-write, this single `findOneAndUpdate` call is guaranteed to be atomic
   * at the DB level, preventing lost-update races under 100+ concurrent requests.
   */
  async atomicIncrement(
    id: DatabaseId,
    field: string,
    amount: number,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<Record<string, unknown>>> {
    const startTime = performance.now();
    try {
      const filter: any = { _id: id };
      if (options.tenantId) filter.tenantId = options.tenantId;

      const result = await this.model
        .findOneAndUpdate(
          filter,
          {
            $inc: { [field]: amount } as any,
            $set: { updatedAt: nowISODateString() },
          } as any,
          { returnDocument: "after", lean: true, cloneUpdate: false },
        )
        .exec();

      if (!result) {
        return {
          success: false,
          message: `Entry not found: ${String(id)}`,
          error: { code: "RECORD_NOT_FOUND", message: `Entry not found: ${String(id)}` },
        };
      }
      return {
        success: true,
        data: processDates(result) as unknown as Record<string, unknown>,
        meta: { executionTime: performance.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        message: "Atomic increment failed",
        error: createDatabaseError(error, "ATOMIC_INCREMENT_ERROR", "Atomic increment failed"),
      };
    }
  }
}
