/**
 * @file src/databases/mongodb/methods/crud-methods.ts
 * @description Generic, reusable CRUD operations for any MongoDB collection.
 */

import { safeQuery, isMultiTenantMode } from "@src/utils/security/safe-query";
import { nowISODateString } from "@utils/date";
import mongoose, { type Model } from "mongoose";
import type {
  BaseEntity,
  DatabaseId,
  DatabaseResult,
  QueryFilter,
  BaseQueryOptions,
  CountOptions,
  FindOptions,
  FindPageOptions,
  FindPageResult,
  EntityCreate,
  EntityUpdate,
} from "../db-interface";
import { createDatabaseError, generateId, processDates } from "./mongodb-utils";
import {
  buildFindPageResult,
  DEFAULT_PAGE_SIZE,
  decodePageCursor,
  defaultPageSortOption,
  mergeKeysetFilter,
  resolvePageSort,
  shouldUseEstimateCount,
  withIdTiebreaker,
} from "../core/page-utils";
import { parseIdLookup } from "../core/lookup-query";

export class MongoCrudMethods<T extends BaseEntity> {
  public readonly model: Model<T>;
  protected readonly adapter: any;
  private _skipDateWalk: boolean | null = null;

  constructor(model: Model<T>, adapter: any) {
    this.model = model;
    this.adapter = adapter;
  }

  /**
   * Content collections use generic strict:false schemas and store timestamps
   * as ISO strings (nowISODateString) — processDates' deep walk finds nothing
   * and is pure CPU. Detect once per model and bypass on hot paths.
   */
  protected mapDates<T2>(data: T2): T2 {
    if (this._skipDateWalk === null) {
      try {
        const schema = (this.model as any).schema;
        const paths: Record<string, any> = schema?.paths || {};
        const hasDatePaths = Object.values(paths).some(
          (p: any) => p?.instance === "Date" || p?.options?.type === Date,
        );
        const isGeneric =
          schema?.strict === false || Object.keys(paths).length <= 5 || schema?.$isMongooseArray;
        this._skipDateWalk = !hasDatePaths && isGeneric;
      } catch {
        this._skipDateWalk = false;
      }
    }
    if (this._skipDateWalk) return data;
    return processDates(data);
  }

  async findOne(
    query: QueryFilter<T>,
    options: FindOptions<T> = {},
  ): Promise<DatabaseResult<T | null>> {
    const startTime = performance.now();
    try {
      // 🚀 ULTRA FAST PATH: shared isIdLookupQuery (SQL + Mongo parity).
      // Multi-tenant: require tenantId on options or query. Single-tenant: allow bare _id.
      if (
        !options.includeDeleted &&
        !options.bypassSafeQuery &&
        this.model.collection?.name !== "auth_tokens" &&
        this.model.collection?.name !== "sessions"
      ) {
        const lookup = parseIdLookup(query);
        if (lookup) {
          const effectiveTenant = options.tenantId ?? lookup.tenantId;
          if (effectiveTenant || !isMultiTenantMode()) {
            const filter: Record<string, unknown> = { _id: lookup.id };
            if (effectiveTenant) filter.tenantId = effectiveTenant;

            const projection = options.fields?.length ? options.fields.join(" ") : undefined;
            const result = await this.model.findOne(filter, projection).lean().exec();

            const meta = { executionTime: performance.now() - startTime };
            if (!result || (result as any).isDeleted === true) {
              return { success: true, data: null, meta };
            }
            return { success: true, data: this.mapDates(result) as T, meta };
          }
        }
      }

      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
          systemScope: options.systemScope,
        }),
      );

      const queryOptions: any = {};
      if (options.hints?.mongo?.readConcern) {
        queryOptions.readConcern = options.hints.mongo.readConcern;
      }
      if (options.hints?.mongo?.readPreference) {
        queryOptions.readPreference = options.hints.mongo.readPreference;
      }

      const result = await this.model
        .findOne(secureQuery, options.fields?.join(" "), queryOptions)
        .lean()
        .exec();

      const meta = { executionTime: performance.now() - startTime };
      if (!result) {
        return { success: true, data: null, meta };
      }
      return { success: true, data: this.mapDates(result) as T, meta };
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
      // Always route through safeQuery for tenant isolation enforcement.
      // No fast-path bypass — multi-tenant data leakage is non-negotiable.
      const secureQuery = this.adapter.mapQuery(
        safeQuery({ _id: { $in: ids } } as unknown as QueryFilter<T>, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
          systemScope: options.systemScope,
        }),
      );

      const queryOptions: any = {};
      if (options.hints?.mongo?.readConcern) {
        queryOptions.readConcern = options.hints.mongo.readConcern;
      }
      if (options.hints?.mongo?.readPreference) {
        queryOptions.readPreference = options.hints.mongo.readPreference;
      }

      const results = await this.model
        .find(secureQuery, options.fields?.join(" ") || "", queryOptions)
        .lean()
        .exec();
      return {
        success: true,
        data: this.mapDates(results) as T[],
        meta: { executionTime: performance.now() - startTime },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to find documents in ${this.model.modelName}`,
        error: createDatabaseError(
          error,
          "FIND_BY_IDS_ERROR",
          `Failed to find documents in ${this.model.modelName}`,
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
      // 🚀 ULTRA FAST PATH: pure {_id} / {_id,tenantId} → findOne lean (skips
      // safeQuery + mapQuery + cursor chain — same shape as SQL adapters).
      if (
        !options.includeDeleted &&
        !options.bypassSafeQuery &&
        !options.sort &&
        !options.offset &&
        this.model.collection?.name !== "auth_tokens" &&
        this.model.collection?.name !== "sessions"
      ) {
        const lookup = parseIdLookup(query);
        if (lookup) {
          const effectiveTenant = options.tenantId ?? lookup.tenantId;
          if (effectiveTenant || !isMultiTenantMode()) {
            const filter: Record<string, unknown> = { _id: lookup.id };
            if (effectiveTenant) filter.tenantId = effectiveTenant;

            const projection = options.fields?.length ? options.fields.join(" ") : undefined;
            const result = await this.model.findOne(filter, projection).lean().exec();

            const meta = { executionTime: performance.now() - startTime };
            if (!result || (result as any).isDeleted === true) {
              return { success: true, data: [], meta };
            }
            return { success: true, data: [this.mapDates(result) as T], meta };
          }
        }
      }

      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
          systemScope: options.systemScope,
        }),
      );

      // Convert sort options if they exist
      const sort = options.sort as any;

      const queryOptions: any = {};
      if (options.hints?.mongo?.readConcern) {
        queryOptions.readConcern = options.hints.mongo.readConcern;
      }
      if (options.hints?.mongo?.readPreference) {
        queryOptions.readPreference = options.hints.mongo.readPreference;
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
        data: this.mapDates(results) as T[],
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
          systemScope: options.systemScope,
        }),
      );

      const cursor = this.model
        .find(secureQuery, options.fields?.join(" ") || "")
        .sort((options.sort as any) || {})
        .skip(options.offset ?? 0)
        .limit(options.limit || 1000)
        .lean()
        .cursor();

      const mapDates = (doc: any) => this.mapDates(doc) as T;
      const generator = async function* () {
        for await (const doc of cursor) {
          yield mapDates(doc);
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
        systemScope: options.systemScope,
      });

      const now = nowISODateString();
      const doc = {
        ...secureData,
        _id: (secureData._id as string) || generateId(),
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      } as unknown as T;

      const insertOpts: Record<string, unknown> = {};
      if (options.hints?.mongo?.writeConcern) {
        insertOpts.writeConcern = { w: options.hints.mongo.writeConcern };
      }

      // 🚀 insertOne avoids Mongoose Document construction + full validation graph
      // (parity with SQL prepareValues + INSERT — validation stays at LocalCMS layer)
      try {
        await this.model.collection.insertOne(doc as any, insertOpts as any);
      } catch (insertErr: any) {
        // Fallback to document.save() when schema validators / casting are required
        if (
          insertErr?.code !== 11_000 &&
          this.model.schema &&
          Object.keys((this.model.schema as any).paths || {}).length > 2
        ) {
          const mongooseDoc = new this.model(doc);
          const saveOptions: any = {};
          if (options.hints?.mongo?.writeConcern) {
            saveOptions.w = options.hints.mongo.writeConcern;
          }
          const result = await mongooseDoc.save(saveOptions);
          return {
            success: true,
            data: this.mapDates((result as mongoose.HydratedDocument<T>).toObject()) as T,
            meta: { executionTime: performance.now() - startTime },
          };
        }
        throw insertErr;
      }

      return {
        success: true,
        data: this.mapDates(doc) as T,
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
          systemScope: options.systemScope,
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
      if (options.hints?.mongo?.writeConcern) {
        bulkOptions.w = options.hints.mongo.writeConcern;
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
    options: BaseQueryOptions & { filter?: QueryFilter<T> } = {},
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
      // `options.filter` (e.g. `{ status: "pending" }`) makes the update conditional —
      // atomic claim semantics: no row matched ⇒ no-op, callers treat it as "not claimed".
      if (!options.tenantId && !options.bypassTenantCheck) {
        const now = nowISODateString();
        const { _id: _, ...updateData } = { ...data, updatedAt: now } as any;
        const result = await this.model
          .findOneAndUpdate(
            { _id: id, ...options.filter },
            { $set: updateData },
            {
              returnDocument: "after",
              lean: true,
              // 🚀 Validation already ran at the SDK/API layer (Valibot schema
              // pipeline) — Mongoose re-validating every document on the hot
              // update path is pure CPU overhead.
              runValidators: false,
              cloneUpdate: false,
            },
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
          data: this.mapDates(result) as T,
          meta: { executionTime: performance.now() - startTime },
        };
      }

      const query = this.adapter.mapQuery(
        safeQuery({ _id: id, ...options.filter } as QueryFilter<T>, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          bypassSafeQuery: options.bypassSafeQuery,
          systemScope: options.systemScope,
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
            // 🚀 SDK/API layer already validates (Valibot) — skip Mongoose re-validation.
            runValidators: false,
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
        data: this.mapDates(result) as T,
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
          systemScope: options.systemScope,
        }),
      );
      const updateOptions: any = { cloneUpdate: false };
      if (options.hints?.mongo?.writeConcern) {
        updateOptions.w = options.hints.mongo.writeConcern;
      }
      const result = await this.model.updateMany(
        secureQuery,
        {
          $set: (() => {
            const { _id: _, ...d } = {
              ...data,
              updatedAt: nowISODateString(),
            } as any;
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
      const opts = options || {};
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, opts.tenantId as string, {
          bypassTenantCheck: opts.bypassTenantCheck,
          bypassSafeQuery: opts.bypassSafeQuery,
          systemScope: opts.systemScope,
        }),
      );
      const now = nowISODateString();

      // Strip _id and tenantId from the $set payload
      const { _id: _, tenantId: __, ...updateData } = { ...(data as any), updatedAt: now };

      // Step 1: Try atomic update first (no upsert flag, no $setOnInsert)
      // This avoids Mongoose 9's pre-validation that rejects _id in $setOnInsert
      // even on the update path.
      const findOptions: any = {
        returnDocument: "after",
        // 🚀 SDK/API layer already validates (Valibot) — skip Mongoose re-validation.
        runValidators: false,
        cloneUpdate: false,
      };
      if (options.hints?.mongo?.writeConcern) {
        findOptions.w = options.hints.mongo.writeConcern;
      }

      const updated = await this.model
        .findOneAndUpdate(secureQuery, { $set: updateData }, findOptions)
        .lean()
        .exec();

      if (updated) {
        return { success: true, data: processDates(updated) as T };
      }

      // Step 2: No document matched — insert a new one
      const insertData = {
        ...(data as any),
        _id: (data as any)._id || generateId(),
        createdAt: now,
        updatedAt: now,
      };
      try {
        const created = await this.model.create(insertData);
        return { success: true, data: processDates(created.toObject()) as T };
      } catch (insertError: any) {
        // E11000 duplicate key: another request created this document between
        // our findOneAndUpdate and create calls. Retry the update path.
        if (insertError?.code === 11000) {
          const retried = await this.model
            .findOneAndUpdate(secureQuery, { $set: updateData }, findOptions)
            .lean()
            .exec();
          if (retried) {
            return { success: true, data: processDates(retried) as T };
          }
        }
        throw insertError;
      }
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
    options: BaseQueryOptions & {
      permanent?: boolean;
      userId?: DatabaseId;
    } = {},
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
          systemScope: options.systemScope,
        }),
      );

      const deleteOptions: any = {};
      if (options.hints?.mongo?.writeConcern) {
        deleteOptions.w = options.hints.mongo.writeConcern;
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
    options: BaseQueryOptions & {
      permanent?: boolean;
      userId?: DatabaseId;
    } = {},
  ): Promise<DatabaseResult<{ deletedCount: number; matchedCount: number }>> {
    try {
      const { tenantId, bypassTenantCheck, permanent, userId } = options;
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, tenantId as string, {
          bypassTenantCheck,
          includeDeleted: permanent,
          bypassSafeQuery: (options as any).bypassSafeQuery,
          systemScope: options.systemScope,
        }),
      );

      const deleteOptions: any = {};
      if (options.hints?.mongo?.writeConcern) {
        deleteOptions.w = options.hints.mongo.writeConcern;
      }

      if (permanent) {
        const result = await this.model.deleteMany(secureQuery, deleteOptions);
        return {
          success: true,
          data: {
            deletedCount: result.deletedCount || 0,
            matchedCount: result.deletedCount || 0,
          },
        };
      }

      const now = nowISODateString();
      const result = await this.model.updateMany(
        secureQuery,
        {
          $set: {
            isDeleted: true,
            deletedAt: now,
            deletedBy: userId,
            updatedAt: now,
          },
        },
        deleteOptions,
      );
      // Fix: deleteMany soft-delete correctly returns modifiedCount as deletedCount for interface consistency
      return {
        success: true,
        data: {
          deletedCount: result.modifiedCount,
          matchedCount: result.matchedCount,
        },
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
          systemScope: options.systemScope,
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
            // Intentional: runValidators detects de-mangled unique-collisions
            // (restore fails safely when the unmangled slug is taken).
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
    options: CountOptions = {},
  ): Promise<DatabaseResult<number>> {
    try {
      if (
        shouldUseEstimateCount(query, {
          mode: options.mode,
          tenantId: options.tenantId as string | null | undefined,
          includeDeleted: options.includeDeleted,
        }) &&
        typeof (this.model as any).estimatedDocumentCount === "function"
      ) {
        const count = await (this.model as any).estimatedDocumentCount();
        return { success: true, data: count };
      }

      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          bypassTenantCheck: options.bypassTenantCheck,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
          systemScope: options.systemScope,
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

  async findPage(
    query: QueryFilter<T> = {},
    options: FindPageOptions<T> = {},
  ): Promise<DatabaseResult<FindPageResult<T>>> {
    const pageSize = options.limit && options.limit > 0 ? options.limit : DEFAULT_PAGE_SIZE;
    // Keyset-stable ordering: append the _id tiebreaker in the same direction
    // as the primary sort (matches mergeKeysetFilter's compound (field, _id)
    // cursor) — without it, rows sharing the sort value order arbitrarily and
    // page N+1 overlaps page N.
    const sortOpt = withIdTiebreaker(
      options.sort ?? defaultPageSortOption(),
    ) as FindOptions<T>["sort"];
    const resolvedSort = resolvePageSort(sortOpt);
    const cursor = decodePageCursor(options.cursor);
    const pageQuery = cursor
      ? (mergeKeysetFilter(query as Record<string, unknown>, cursor) as QueryFilter<T>)
      : query;

    const fetchOpts: FindOptions<T> = {
      ...options,
      sort: sortOpt,
      limit: pageSize + 1,
      offset: cursor ? 0 : options.offset,
    };

    const totalMode = options.total ?? "none";
    const countPromise =
      totalMode !== "none"
        ? this.count(query, {
            tenantId: options.tenantId,
            systemScope: options.systemScope,
            bypassTenantCheck: options.bypassTenantCheck,
            includeDeleted: options.includeDeleted,
            bypassSafeQuery: options.bypassSafeQuery,
            skipMeta: true,
            mode: totalMode,
          })
        : null;

    const [rowsRes, countRes] = await Promise.all([
      this.findMany(pageQuery, fetchOpts),
      countPromise ?? Promise.resolve(null),
    ]);

    if (!rowsRes.success) {
      return {
        success: false,
        message: rowsRes.message,
        error: rowsRes.error,
      };
    }

    let totalMeta: { total: number; estimated: boolean } | undefined;
    if (countRes && countRes.success && typeof countRes.data === "number") {
      totalMeta = {
        total: countRes.data,
        estimated: shouldUseEstimateCount(query, {
          mode: totalMode === "none" ? "auto" : totalMode,
          tenantId: options.tenantId as string | null | undefined,
          includeDeleted: options.includeDeleted,
        }),
      };
    }

    return {
      success: true,
      data: buildFindPageResult(rowsRes.data ?? [], pageSize, totalMeta, resolvedSort),
    };
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
          systemScope: options.systemScope,
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
          systemScope: options.systemScope,
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

      // 🚀 PERFORMANCE: Use allowDiskUse:false to force in-memory pipeline (faster for small datasets)
      const result = await this.model.aggregate(securePipeline).allowDiskUse(false).exec();
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
              systemScope: options.systemScope,
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
      if (options.hints?.mongo?.writeConcern) {
        bulkOptions.w = options.hints.mongo.writeConcern;
      }
      const res = await this.model.bulkWrite(ops as any[], bulkOptions);
      return {
        success: true,
        data: {
          upsertedCount: res.upsertedCount,
          modifiedCount: res.modifiedCount,
        },
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
              systemScope: options.systemScope,
            }),
          ),
          update: {
            $set: { ...(update.data as any), updatedAt: now },
          },
        },
      }));

      const bulkOptions: any = { ordered: false };
      if (options.hints?.mongo?.writeConcern) {
        bulkOptions.w = options.hints.mongo.writeConcern;
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
          error: {
            code: "RECORD_NOT_FOUND",
            message: `Entry not found: ${String(id)}`,
          },
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
