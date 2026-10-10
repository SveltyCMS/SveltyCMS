/**
 * @file src/databases/mongodb/methods/crud-methods.ts
 * @description Generic, reusable CRUD operations for any MongoDB collection.
 */

import { safeQuery, isMultiTenantMode } from "@src/utils/security/safe-query";
import { hasTenantBypass } from "../system-tenant-scope";
import { nowISODateString, toISOString } from "@utils/date";
import { serializeSuccessEnvelope } from "@utils/fast-json";
import { PROFILE_WRITE_ENABLED, profileMark } from "@utils/write-profiler";
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
import { createDatabaseError, generateId, processDates, validateId } from "./mongodb-utils";
import { isSystemTable } from "../core/drizzle-sql-helpers";
import {
  buildFindPageResult,
  DEFAULT_PAGE_SIZE,
  decodePageCursor,
  defaultPageSortOption,
  mergeKeysetFilter,
  normalizeSortDirection,
  resolvePageSort,
  shouldUseEstimateCount,
  withIdTiebreaker,
} from "../core/page-utils";
import { logger } from "@utils/logger";
import { applyLookupStatus, parseIdLookup } from "../core/query-primitives";
import { PUBLISHED_STATUS_LIST } from "@utils/security/publication-policy";

/**
 * Native `collection.findOne` may return a BSON ObjectId `_id`. Stringify so
 * REST JSON.stringify stays a plain UUID and does not walk a Buffer.
 */
function plainNativeDoc<T>(raw: unknown): T {
  if (!raw || typeof raw !== "object") return raw as T;
  const id = (raw as { _id?: unknown })._id;
  if (id && typeof id === "object" && (id as { _bsontype?: string })._bsontype === "ObjectId") {
    return { ...(raw as Record<string, unknown>), _id: String(id) } as T;
  }
  return raw as T;
}

/**
 * Normalize any accepted sort spec — `"-field"` string, `{ field: -1 }` object,
 * or arrays of strings / `[field, dir]` tuples / `{ field, direction }` objects —
 * into the `{ field: 1 | -1 }` form `$sort` expects, preserving key order.
 * Must consume the spec EXACTLY like mongoose `.sort()` (including the `_id`
 * tiebreaker `withIdTiebreaker` appends), or the facet page orders differently
 * from the two-query path inside tie groups.
 */
function toMongoSortSpec(sort: unknown): Record<string, 1 | -1> {
  const out: Record<string, 1 | -1> = {};
  if (!sort) return out;
  if (typeof sort === "string") {
    const desc = sort.startsWith("-");
    out[desc ? sort.slice(1) : sort] = desc ? -1 : 1;
    return out;
  }
  if (Array.isArray(sort)) {
    for (const entry of sort) {
      if (typeof entry === "string") {
        const desc = entry.startsWith("-");
        out[desc ? entry.slice(1) : entry] = desc ? -1 : 1;
      } else if (Array.isArray(entry) && entry.length >= 1) {
        out[String(entry[0])] = normalizeSortDirection(entry[1]) === "asc" ? 1 : -1;
      } else if (entry && typeof entry === "object") {
        const rec = entry as Record<string, unknown>;
        const field = String(rec.field ?? rec.column ?? "");
        if (!field) continue;
        const dir = rec.direction ?? rec.dir ?? rec.order;
        out[field] = normalizeSortDirection(dir) === "asc" ? 1 : -1;
      }
    }
    return out;
  }
  if (typeof sort === "object") {
    for (const [field, dir] of Object.entries(sort as Record<string, unknown>)) {
      out[field] = normalizeSortDirection(dir) === "asc" ? 1 : -1;
    }
    return out;
  }
  return out;
}

export class MongoCrudMethods<T extends BaseEntity> {
  public readonly model: Model<T>;
  protected readonly adapter: any;
  private _skipDateWalk: boolean | null = null;
  private _uniqueFields: Set<string> | null = null;

  constructor(model: Model<T>, adapter: any) {
    this.model = model;
    this.adapter = adapter;
  }

  private getUniqueFields(): Set<string> {
    if (this._uniqueFields !== null) return this._uniqueFields;
    const set = new Set<string>();
    try {
      const schemaPaths = this.model.schema?.paths;
      if (schemaPaths) {
        for (const [path, definition] of Object.entries(schemaPaths)) {
          if ((definition as any)._userProvidedOptions?.unique) set.add(path);
        }
      }
      if (typeof this.model.schema?.indexes === "function") {
        const indexes = this.model.schema.indexes();
        for (const [indexFields, options] of indexes) {
          if ((options as any)?.unique) {
            Object.keys(indexFields).forEach((field) => set.add(field));
          }
        }
      }
    } catch {
      // safe fallback
    }
    this._uniqueFields = set;
    return set;
  }

  /**
   * Resolve MongoDB writeConcern: explicit per-query hint wins; falls back to
   * MONGO_WRITE_CONCERN / MONGODB_WRITE_CONCERN environment variable (e.g. 1, 0, "majority").
   */
  private resolveWriteConcern(options?: BaseQueryOptions): unknown {
    const explicit = options?.hints?.mongo?.writeConcern;
    if (explicit !== undefined) return explicit;
    const env = process.env.MONGO_WRITE_CONCERN || process.env.MONGODB_WRITE_CONCERN;
    if (!env) return undefined;
    const num = Number(env);
    return Number.isFinite(num) ? num : env;
  }

  /**
   * 🛡️ ENTERPRISE `_id` CONTRACT — O(1) gate on every entry write (parity
   * with the SQL adapters): dynamic collection tables accept only UUIDv4 ids
   * (32-hex dash-less or 36-dashed); system tables (content_nodes, auth_*, …)
   * keep slug-friendly ids. Pre-compiled regex + cached system set.
   */
  private invalidEntryId(id: unknown): DatabaseResult<never> | null {
    if (id === undefined || id === null) return null;
    const name = this.model.modelName;
    if (isSystemTable(name) || (typeof name === "string" && name.startsWith("plugin_")))
      return null;
    if (typeof id !== "string" || !validateId(id)) {
      return {
        success: false,
        message: `Invalid _id format for "${this.model.modelName}": expected UUIDv4 (32 hex or 36 dashed chars)`,
        error: {
          code: "INVALID_ID_FORMAT",
          message: "_id must be a UUIDv4 string (32 hex or 36 dashed chars)",
        },
      };
    }
    return null;
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

            const projection = options.fields?.length
              ? Object.fromEntries(options.fields.map((f) => [f, 1]))
              : undefined;
            const result = await this.model.collection.findOne(filter, { projection });
            const data =
              !result || (result as { isDeleted?: boolean }).isDeleted === true
                ? null
                : applyLookupStatus(this.mapDates(plainNativeDoc<T>(result)), lookup);
            if (options.skipMeta) return { success: true, data };
            return {
              success: true,
              data,
              meta: { executionTime: performance.now() - startTime },
            };
          }
        }
      }

      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          systemScope: options.systemScope,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
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

  /**
   * Direct-to-Wire point stream for MongoDB: builds the `{ success, data }` JSON
   * envelope in JS around a driver-level `collection.findOne` with a system-column
   * exclusion projection. MongoDB has no engine-side JSON to stream, so the gain
   * over `findOne` is avoiding Mongoose hydration — not `JSON.stringify`.
   */
  async findPointWireStream(
    _collection: string,
    id: DatabaseId,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ wireBody: string; etag: string } | null>> {
    try {
      // Fail closed on a missing tenant, exactly like `findOne`.
      const filter = this.adapter.mapQuery(
        safeQuery({ _id: id } as unknown as QueryFilter<T>, options.tenantId as string, {
          systemScope: options.systemScope,
          includeDeleted: options.includeDeleted,
        }),
      );
      // Wire Plane publication guarantee: express it in the query (see `requirePublished`).
      if (options.requirePublished === true) filter.status = { $in: PUBLISHED_STATUS_LIST };

      const rawDoc = await this.model.collection.findOne(filter, {
        projection: { _collection: 0, tenantId: 0, createdAt: 0, isDeleted: 0 },
      });
      if (!rawDoc) {
        // Definitive not-found — same signal as the SQL adapters' wire stream so
        // the read lane can skip its Domain-Plane re-query (see
        // handle-collection-read-lane.ts).
        return {
          success: false,
          message: "Entry not found",
          error: { code: "RECORD_NOT_FOUND", message: "Entry not found" },
        };
      }

      const doc = plainNativeDoc<Record<string, unknown>>(rawDoc);
      const updatedAt = doc.updatedAt ? toISOString(doc.updatedAt) : "";
      delete doc.updatedAt;
      const wireBody = serializeSuccessEnvelope(JSON.stringify(doc));
      const etag = `"${String(id)}-${updatedAt}"`;
      return { success: true, data: { wireBody, etag } };
    } catch (err: any) {
      const message =
        err?.message || `Failed to stream point wire payload from ${this.model.modelName}`;
      return {
        success: false,
        message,
        error: createDatabaseError(err, "FIND_POINT_WIRE_STREAM_FAILED", message),
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
          systemScope: options.systemScope,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      // 🚀 DRIVER FAST PATH: Batch lookup by _id directly via collection.find()
      if (
        !options.includeDeleted &&
        !options.bypassSafeQuery &&
        !options.hints?.mongo?.readConcern &&
        !options.hints?.mongo?.readPreference &&
        this.model.collection
      ) {
        const effectiveTenant = options.tenantId;
        if (effectiveTenant || !isMultiTenantMode()) {
          const filter: Record<string, unknown> = { _id: { $in: ids }, isDeleted: { $ne: true } };
          if (effectiveTenant) filter.tenantId = effectiveTenant;

          const projection = options.fields?.length
            ? Object.fromEntries(options.fields.map((f) => [f, 1]))
            : undefined;

          const cursor = this.model.collection.find(filter, { projection });
          const rawDocs = await cursor.toArray();
          const data = this.mapDates(rawDocs.map((doc) => plainNativeDoc<T>(doc))) as T[];
          return {
            success: true,
            data,
            meta: { executionTime: performance.now() - startTime },
          };
        }
      }

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

            const projection = options.fields?.length
              ? Object.fromEntries(options.fields.map((f) => [f, 1]))
              : undefined;
            const result = await this.model.collection.findOne(filter, { projection });
            const mapped =
              !result || (result as { isDeleted?: boolean }).isDeleted === true
                ? null
                : applyLookupStatus(this.mapDates(plainNativeDoc<T>(result)), lookup);
            const data = mapped ? [mapped] : [];
            if (options.skipMeta) return { success: true, data };
            return {
              success: true,
              data,
              meta: { executionTime: performance.now() - startTime },
            };
          }
        }
      }

      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          systemScope: options.systemScope,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
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

      // 🚀 Driver Fast-Path: bypass Mongoose Query instantiation when native collection is available
      if (
        this.model.collection &&
        typeof (this.model.collection as any).find === "function" &&
        this.model.collection?.name !== "auth_tokens" &&
        this.model.collection?.name !== "sessions"
      ) {
        try {
          const projection = options.fields?.length
            ? Object.fromEntries(options.fields.map((f) => [f, 1]))
            : undefined;
          let cursor = (this.model.collection as any).find(secureQuery, {
            ...queryOptions,
            ...(projection ? { projection } : {}),
          });
          if (sort && Object.keys(sort).length > 0) {
            cursor = cursor.sort(sort);
          }
          if (options.offset && options.offset > 0) {
            cursor = cursor.skip(options.offset);
          }
          cursor = cursor.limit(options.limit || 1000);
          const rawDocs = await cursor.toArray();
          return {
            success: true,
            data: this.mapDates(rawDocs) as T[],
            meta: { executionTime: performance.now() - startTime },
          };
        } catch {
          // Fall back to Mongoose query execution below
        }
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
          systemScope: options.systemScope,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      let streamQuery = this.model
        .find(secureQuery, options.fields?.join(" ") || "")
        .sort((options.sort as any) || {})
        .skip(options.offset ?? 0)
        .lean();
      // No silent 1000-row cap — exports and scans must stream until exhausted
      // unless the caller passed an explicit limit.
      if (typeof options.limit === "number" && options.limit > 0) {
        streamQuery = streamQuery.limit(options.limit);
      }
      const cursor = streamQuery.cursor();

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
        systemScope: options.systemScope,
        bypassSafeQuery: options.bypassSafeQuery,
      });

      const invalid = this.invalidEntryId(secureData._id);
      if (invalid) return invalid;

      const now = nowISODateString();
      const doc = {
        ...secureData,
        _id: (secureData._id as string) || generateId(),
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      } as unknown as T;

      const insertOpts: Record<string, unknown> = {};
      const writeConcern = this.resolveWriteConcern(options);
      if (writeConcern !== undefined) {
        insertOpts.writeConcern = { w: writeConcern };
      }

      // 🚀 insertOne avoids Mongoose Document construction + full validation graph
      // (parity with SQL prepareValues + INSERT — validation stays at LocalCMS layer)
      try {
        // 🔬 Parity with the SQL engines' `db:ins:stmt` (see the PostgreSQL adapter): one
        // mark per driver statement, so N = Σ db:*:stmt ÷ ns:persist and per-statement
        // latency compare across all four adapters.
        const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:ins:stmt") : null;
        await this.model.collection.insertOne(doc as any, insertOpts as any);
        mStmt?.();
      } catch (insertErr: any) {
        // Fallback to document.save() when schema validators / casting are required
        if (
          insertErr?.code !== 11_000 &&
          this.model.schema &&
          Object.keys((this.model.schema as any).paths || {}).length > 2
        ) {
          const mongooseDoc = new this.model(doc);
          const saveOptions: any = {};
          if (writeConcern !== undefined) {
            saveOptions.w = writeConcern;
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

      if (options.skipReturning === true) {
        return {
          success: true,
          data: doc as T,
          meta: { executionTime: performance.now() - startTime },
        };
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

      for (const item of data) {
        const invalid = this.invalidEntryId((item as any)?._id);
        if (invalid) return invalid;
      }

      const now = nowISODateString();
      const ops = data.map((d) => {
        const secureData = safeQuery(d as Record<string, unknown>, options.tenantId as string, {
          systemScope: options.systemScope,
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

      const bulkOptions: any = {
        ordered: options.ordered ?? options.hints?.mongo?.ordered ?? false,
      };
      const writeConcern = this.resolveWriteConcern(options);
      if (writeConcern !== undefined) {
        bulkOptions.w = writeConcern;
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

    const invalid = this.invalidEntryId(id);
    if (invalid) return invalid;

    const startTime = performance.now();
    try {
      // 🚀 Fast-Path: Direct ID update
      // `options.filter` (e.g. `{ status: "pending" }`) makes the update conditional —
      // atomic claim semantics: no row matched ⇒ no-op, callers treat it as "not claimed".
      if (!options.tenantId && !hasTenantBypass(options)) {
        const now = nowISODateString();
        const { _id: _, createdAt: __, ...updateData } = { ...data, updatedAt: now } as any;
        if ((options as { skipReturning?: boolean }).skipReturning === true) {
          return this.updateWithoutReadBack(
            { _id: id, ...options.filter },
            updateData,
            String(id),
            startTime,
          );
        }
        let result: any = null;
        if (
          this.model.collection &&
          typeof (this.model.collection as any).findOneAndUpdate === "function"
        ) {
          try {
            result = await (this.model.collection as any).findOneAndUpdate(
              { _id: id, ...options.filter },
              { $set: updateData },
              { returnDocument: "after" },
            );
          } catch {
            result = await this.model
              .findOneAndUpdate(
                { _id: id, ...options.filter },
                { $set: updateData },
                {
                  returnDocument: "after",
                  lean: true,
                  runValidators: false,
                  cloneUpdate: false,
                  strict: false,
                },
              )
              .exec();
          }
        } else {
          result = await this.model
            .findOneAndUpdate(
              { _id: id, ...options.filter },
              { $set: updateData },
              {
                returnDocument: "after",
                lean: true,
                runValidators: false,
                cloneUpdate: false,
                strict: false,
              },
            )
            .exec();
        }
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
          systemScope: options.systemScope,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );

      const now = nowISODateString();
      const {
        _id: _,
        createdAt: __,
        ...updateData
      } = {
        ...data,
        updatedAt: now,
      } as any;

      if ((options as { skipReturning?: boolean }).skipReturning === true) {
        return this.updateWithoutReadBack(query, updateData, String(id), startTime, options);
      }

      let result: any = null;
      if (
        this.model.collection &&
        typeof (this.model.collection as any).findOneAndUpdate === "function"
      ) {
        try {
          result = await (this.model.collection as any).findOneAndUpdate(
            query,
            { $set: updateData },
            { returnDocument: "after" },
          );
        } catch {
          result = await this.model
            .findOneAndUpdate(
              query,
              { $set: updateData },
              {
                returnDocument: "after",
                lean: true,
                runValidators: false,
                cloneUpdate: false,
                strict: false,
              },
            )
            .exec();
        }
      } else {
        result = await this.model
          .findOneAndUpdate(
            query,
            { $set: updateData },
            {
              returnDocument: "after",
              lean: true,
              runValidators: false,
              cloneUpdate: false,
              strict: false,
            },
          )
          .exec();
      }

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

  /**
   * `skipReturning` update — the ADAPTER-PARITY twin of the SQL engines' no-read-back path.
   *
   * SQL (`SqlAdapterCore.executeUpdate`) runs the UPDATE without `RETURNING` and reconstructs
   * the row from the prepared values; MongoDB did a `findOneAndUpdate` and always read the
   * document back, so a caller that only wants a write ack (`Prefer: return=minimal`) paid a
   * full document read plus its serialization on this engine only.
   *
   * The synthesized row is the payload + `_id` (+ stamped `updatedAt`), i.e. exactly what
   * SQL returns — deliberately NOT the untouched stored fields (the caller asked not to read
   * them back). No affected-rows check, for the same reason as SQL: an unchanged `$set`
   * reports zero modified documents, which would false-positive "not found".
   */
  private async updateWithoutReadBack(
    query: Record<string, unknown>,
    updateData: Record<string, unknown>,
    id: string,
    startTime: number,
    options?: BaseQueryOptions,
  ): Promise<DatabaseResult<T>> {
    const mStmt = PROFILE_WRITE_ENABLED ? profileMark("db:upd:stmt") : null;
    const writeConcern = this.resolveWriteConcern(options);
    const updateOpts: Record<string, unknown> = {};
    if (writeConcern !== undefined) {
      updateOpts.writeConcern = { w: writeConcern };
    }
    if (this.model.collection && typeof (this.model.collection as any).updateOne === "function") {
      try {
        await (this.model.collection as any).updateOne(query, { $set: updateData }, updateOpts);
        mStmt?.();
        return {
          success: true,
          data: this.mapDates({ _id: id, ...updateData }) as T,
          meta: { executionTime: performance.now() - startTime },
        };
      } catch {
        // Fall back to Mongoose updateOne
      }
    }
    await this.model
      .updateOne(
        query,
        { $set: updateData },
        { runValidators: false, cloneUpdate: false, strict: false, ...updateOpts },
      )
      .exec();
    mStmt?.();
    return {
      success: true,
      data: this.mapDates({ _id: id, ...updateData }) as T,
      meta: { executionTime: performance.now() - startTime },
    };
  }

  async updateMany(
    query: QueryFilter<T>,
    data: EntityUpdate<T>,
    options: BaseQueryOptions = {},
  ): Promise<DatabaseResult<{ modifiedCount: number }>> {
    try {
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, options.tenantId as string, {
          systemScope: options.systemScope,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );
      const updateOptions: any = { cloneUpdate: false };
      // 🐛 PARITY: without this, Mongoose `strict` drops every $set path that is not
      // in the model schema — dynamic fields were silently not written. SQL adapters
      // store them in the JSON `data` blob instead of discarding them.
      updateOptions.strict = false;
      const writeConcern = this.resolveWriteConcern(options);
      if (writeConcern !== undefined) {
        updateOptions.w = writeConcern;
      }
      const {
        _id,
        createdAt: __,
        ...d
      } = {
        ...data,
        updatedAt: nowISODateString(),
      } as any;
      const result = await this.model.updateMany(secureQuery, { $set: d }, updateOptions);
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
          systemScope: opts.systemScope,
          bypassSafeQuery: opts.bypassSafeQuery,
        }),
      ) as Record<string, unknown>;
      const now = nowISODateString();

      // Strip _id, tenantId, and createdAt from the $set payload (createdAt is insert-only)
      const {
        _id: dataId,
        tenantId: dataTenant,
        createdAt: _createdAt,
        ...updateData
      } = {
        ...(data as any),
        updatedAt: now,
      };

      const invalid = this.invalidEntryId((secureQuery as any)._id ?? dataId);
      if (invalid) return invalid;

      // One round-trip: put _id on the filter (Mongo copies filter keys into
      // the inserted doc) so $setOnInsert never carries `_id` — Mongoose 9
      // pre-validation rejects `_id` in $setOnInsert even on the insert path.
      const filter: Record<string, unknown> = { ...secureQuery };
      if (filter._id == null) filter._id = dataId || generateId();

      const setOnInsert: Record<string, unknown> = {
        createdAt: now,
      };
      // Path conflict if the same key is in $set and $setOnInsert.
      if (updateData.isDeleted === undefined) setOnInsert.isDeleted = false;
      const tenantId = opts.tenantId || dataTenant;
      if (tenantId && filter.tenantId == null) setOnInsert.tenantId = tenantId;

      const findOptions: Record<string, unknown> = {
        upsert: true,
        returnDocument: "after",
        runValidators: false,
        cloneUpdate: false,
      };
      const writeConcern = this.resolveWriteConcern(options);
      if (writeConcern !== undefined) {
        findOptions.w = writeConcern;
      }

      let updated: any = null;
      if (
        this.model.collection &&
        typeof (this.model.collection as any).findOneAndUpdate === "function"
      ) {
        try {
          updated = await (this.model.collection as any).findOneAndUpdate(
            filter,
            { $set: updateData, $setOnInsert: setOnInsert },
            findOptions,
          );
        } catch {
          updated = await this.model
            .findOneAndUpdate(filter, { $set: updateData, $setOnInsert: setOnInsert }, findOptions)
            .lean()
            .exec();
        }
      } else {
        updated = await this.model
          .findOneAndUpdate(filter, { $set: updateData, $setOnInsert: setOnInsert }, findOptions)
          .lean()
          .exec();
      }

      if (!updated) {
        return {
          success: false,
          message: "Upsert failed",
          error: { code: "UPSERT_ERROR", message: "Upsert returned no document" },
        };
      }
      return { success: true, data: this.mapDates(updated) as T };
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
      const { tenantId, permanent, userId } = options;
      const query = this.adapter.mapQuery(
        safeQuery({ _id: id } as QueryFilter<T>, tenantId as string, {
          includeDeleted: permanent,
          bypassSafeQuery: (options as any).bypassSafeQuery,
          systemScope: options.systemScope,
        }),
      );

      const deleteOptions: any = {};
      const writeConcern = this.resolveWriteConcern(options);
      if (writeConcern !== undefined) {
        deleteOptions.w = writeConcern;
      }

      if (permanent) {
        let deletedCount = 0;
        if (
          this.model.collection &&
          typeof (this.model.collection as any).deleteOne === "function"
        ) {
          try {
            const delRes = await (this.model.collection as any).deleteOne(query, deleteOptions);
            deletedCount = delRes.deletedCount ?? 0;
          } catch {
            const result = await this.model.deleteOne(query, deleteOptions);
            deletedCount = result.deletedCount ?? 0;
          }
        } else {
          const result = await this.model.deleteOne(query, deleteOptions);
          deletedCount = result.deletedCount ?? 0;
        }
        if (deletedCount === 0) {
          return {
            success: false,
            message: "Not found",
            error: { code: "RECORD_NOT_FOUND", message: "Not found" },
          };
        }
        return { success: true, data: undefined };
      }

      // Soft Delete with unique field mangling
      let doc: any = null;
      if (this.model.collection && typeof (this.model.collection as any).findOne === "function") {
        try {
          doc = await (this.model.collection as any).findOne(query);
        } catch {
          doc = await this.model.findOne(query).lean().exec();
        }
      } else {
        doc = await this.model.findOne(query).lean().exec();
      }
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
      const uniqueFields = this.getUniqueFields();

      for (const path of uniqueFields) {
        if ((doc as any)[path]) {
          updateData[path] = `${(doc as any)[path]}_DELETED_${timestamp}`;
        }
      }

      if (this.model.collection && typeof (this.model.collection as any).updateOne === "function") {
        try {
          await (this.model.collection as any).updateOne(
            query,
            { $set: updateData },
            deleteOptions,
          );
        } catch {
          await this.model.updateOne(query, { $set: updateData }, deleteOptions);
        }
      } else {
        await this.model.updateOne(query, { $set: updateData }, deleteOptions);
      }
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
      const { tenantId, permanent, userId } = options;
      const secureQuery = this.adapter.mapQuery(
        safeQuery(query, tenantId as string, {
          includeDeleted: permanent,
          bypassSafeQuery: (options as any).bypassSafeQuery,
          systemScope: options.systemScope,
        }),
      );

      const deleteOptions: any = {};
      const writeConcern = this.resolveWriteConcern(options);
      if (writeConcern !== undefined) {
        deleteOptions.w = writeConcern;
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
      const { tenantId } = options;
      const query = this.adapter.mapQuery(
        safeQuery({ _id: id, isDeleted: true } as QueryFilter<T>, tenantId as string, {
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
          systemScope: options.systemScope,
          includeDeleted: options.includeDeleted,
          bypassSafeQuery: options.bypassSafeQuery,
        }),
      );
      if (
        this.model.collection &&
        typeof (this.model.collection as any).countDocuments === "function"
      ) {
        try {
          const count = await (this.model.collection as any).countDocuments(secureQuery);
          return { success: true, data: count };
        } catch {
          // Fall back to Mongoose countDocuments
        }
      }
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
    const canEstimate = shouldUseEstimateCount(query, {
      mode: totalMode === "none" ? "auto" : totalMode,
      tenantId: options.tenantId as string | null | undefined,
      includeDeleted: options.includeDeleted,
    });

    // 🚀 SINGLE-ROUNDTRIP $facet: when a count is requested and cannot come from
    // metadata stats, run the data slice + total in ONE aggregation pipeline
    // instead of two network round trips (find + countDocuments). `$facet`
    // evaluates the count over the same `$match`-filtered set the two-query
    // path counts (tenant/isDeleted/status conditions included) and applies
    // skip/limit inside the facet. Every other case keeps the proven two-query
    // path — keyset cursors (total must count the UNaugmented filter), metadata
    // estimates, projections/hints (findMany honors them, aggregate does not),
    // missing $facet support, or any pipeline error.
    if (
      totalMode !== "none" &&
      !canEstimate &&
      !cursor &&
      !options.fields?.length &&
      !options.hints &&
      typeof (this.model as any).aggregate === "function"
    ) {
      try {
        const secureQuery = this.adapter.mapQuery(
          safeQuery(pageQuery, options.tenantId as string, {
            systemScope: options.systemScope,
            includeDeleted: options.includeDeleted,
            bypassSafeQuery: options.bypassSafeQuery,
          }),
        );

        // Full multi-key sort — `_id` tiebreaker included — so tie groups order
        // exactly like the two-query path (mongoose consumes the same spec).
        const mongoSort = toMongoSortSpec(sortOpt);

        const skipCount = options.offset && options.offset > 0 ? options.offset : 0;
        const pipeline: Record<string, unknown>[] = [{ $match: secureQuery }];
        if (Object.keys(mongoSort).length > 0) {
          pipeline.push({ $sort: mongoSort });
        }
        pipeline.push({
          $facet: {
            data: [{ $skip: skipCount }, { $limit: pageSize + 1 }],
            total: [{ $count: "count" }],
          },
        });

        const facetRes = await (this.model as any).aggregate(pipeline).exec();
        if (Array.isArray(facetRes) && facetRes.length > 0) {
          const rawDocs = facetRes[0].data || [];
          const totalDocs = facetRes[0].total?.[0]?.count ?? 0;
          const mappedDocs = rawDocs.map((doc: any) => this.mapDates(doc) as T);
          return {
            success: true,
            data: buildFindPageResult(
              mappedDocs,
              pageSize,
              { total: totalDocs, estimated: false },
              resolvedSort,
            ),
          };
        }
      } catch (err) {
        logger.debug("[MongoDB] $facet pipeline fallback to 2-step", err);
      }
    }

    const countPromise =
      totalMode !== "none"
        ? this.count(query, {
            tenantId: options.tenantId,
            systemScope: options.systemScope,
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
          systemScope: options.systemScope,
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
          systemScope: options.systemScope,
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

      for (const item of items) {
        const invalid = this.invalidEntryId((item.query as any)?._id ?? (item.data as any)?._id);
        if (invalid) return invalid;
      }
      const now = nowISODateString();
      const ops = items.map((item) => ({
        updateOne: {
          filter: this.adapter.mapQuery(
            safeQuery(item.query, options.tenantId as string, {
              systemScope: options.systemScope,
              bypassSafeQuery: options.bypassSafeQuery,
            }),
          ),

          update: {
            $set: (() => {
              // createdAt is insert-only — $setOnInsert below still stamps it.
              const {
                _id: _,
                tenantId: __,
                createdAt: ___,
                ...d
              } = {
                ...(item.data as any),
                updatedAt: now,
              };
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
      const bulkOptions: any = {
        ordered: options.ordered ?? options.hints?.mongo?.ordered ?? false,
      };
      const writeConcern = this.resolveWriteConcern(options);
      if (writeConcern !== undefined) {
        bulkOptions.w = writeConcern;
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
              systemScope: options.systemScope,
              bypassSafeQuery: options.bypassSafeQuery,
            }),
          ),
          update: {
            $set: (() => {
              // Never write _id / createdAt back through $set on a bulk update.
              const {
                _id: _,
                createdAt: __,
                ...d
              } = {
                ...(update.data as any),
                updatedAt: now,
              };
              return d;
            })(),
          },
        },
      }));

      const bulkOptions: any = {
        ordered: options.ordered ?? options.hints?.mongo?.ordered ?? false,
      };
      const writeConcern = this.resolveWriteConcern(options);
      if (writeConcern !== undefined) {
        bulkOptions.w = writeConcern;
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

      if (options.skipReturning === true) {
        const written = await this.model
          .updateOne(
            filter,
            {
              $inc: { [field]: amount } as any,
              $set: { updatedAt: nowISODateString() },
            } as any,
            { strict: false },
          )
          .exec();
        if (!written?.matchedCount) {
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
          data: { _id: id },
          meta: { executionTime: performance.now() - startTime },
        };
      }

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
