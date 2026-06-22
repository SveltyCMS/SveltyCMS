/**
 * @file src/databases/mongodb/adapter/adapter-core.ts
 * @description Core functionality shared across MongoDB adapter modules.
 */

// CJS interop polyfill — dynamically loaded, completely tree-shaken during client builds
if (import.meta.env.SSR && typeof (globalThis as any).require === "undefined") {
  import("node:module")
    .then(({ createRequire }) => {
      (globalThis as any).require = createRequire(import.meta.url);
    })
    .catch(() => {});
}

import mongoose from "mongoose";
import { sanitizeMongoQuery } from "@src/utils/security/mongo-sanitize";
import { logger } from "@utils/logger";
import { BaseAdapter } from "../core/base-adapter";
import type { DatabaseCapabilities, DatabaseResult, ConnectionPoolOptions } from "../db-interface";

export abstract class MongoAdapterCore extends BaseAdapter {
  protected _connection: mongoose.Connection | null = null;
  protected _models: Map<string, mongoose.Model<any>> = new Map();

  public capabilities: DatabaseCapabilities = {
    maxBatchSize: 1000,
    supportsTransactions: false,
    supportsAggregation: true,
    maxQueryComplexity: 100,
    supportsFullTextSearch: true,
    supportsIndexing: true,
    supportsPartitioning: false,
    supportsStreaming: true,
  };

  public get connection(): mongoose.Connection | null {
    return this._connection;
  }

  public isConnected(): boolean {
    return !!this._connection && this._connection.readyState === 1;
  }

  async connect(
    connectionStringOrOptions: string | ConnectionPoolOptions,
    options?: mongoose.ConnectOptions,
  ): Promise<DatabaseResult<void>> {
    try {
      let connectionString =
        typeof connectionStringOrOptions === "string"
          ? connectionStringOrOptions
          : (connectionStringOrOptions as any)?.connectionString || "";

      if (!connectionString) {
        const { getDatabaseConnectionString } = await import("../config-state");
        connectionString = getDatabaseConnectionString();
      }

      if (!connectionString) {
        throw new Error("Missing MongoDB connection string.");
      }

      if (this.isConnected()) {
        return { success: true, data: undefined };
      }

      const poolOptions =
        typeof connectionStringOrOptions === "object" && connectionStringOrOptions !== null
          ? connectionStringOrOptions
          : {};

      const compressors: string[] = [];
      try {
        // @ts-expect-error - optional peer for zstd wire compression
        await import("@mongodb-js/zstd");
        compressors.push("zstd");
      } catch {}
      try {
        // @ts-expect-error - optional peer for snappy wire compression
        await import("snappy");
        compressors.push("snappy");
      } catch {}

      const connectOptions: mongoose.ConnectOptions = {
        ...options,
        autoIndex: false,
        autoCreate: false,
        bufferCommands: false,
        maxPoolSize: poolOptions.maxConnections || 100,
        minPoolSize: poolOptions.minConnections || 10,
        serverSelectionTimeoutMS: poolOptions.connectionTimeout || 30000,
        socketTimeoutMS: 45000,
        family: 4,
        connectTimeoutMS: 10000,
        waitQueueTimeoutMS: 10000,
        ...(compressors.length > 0 ? { compressors: compressors as any } : {}),
      };

      const globalOptions = {
        flattenUUIDs: true,
        flattenObjectIds: true,
        flattenMaps: true,
        getters: true,
        virtuals: true,
      };

      mongoose.set("toObject", globalOptions);
      mongoose.set("toJSON", globalOptions);
      mongoose.set("bufferCommands", false);
      mongoose.set("autoCreate", false);

      this._connection = await mongoose
        .createConnection(connectionString, connectOptions)
        .asPromise()
        .catch(async (err: any) => {
          if (
            err?.name === "MongoMissingDependencyError" ||
            (err?.message || "").includes("snappy") ||
            (err?.message || "").includes("zstd")
          ) {
            logger.warn(
              "Optional MongoDB wire-compressor module(s) not installed (or probe missed it) — retrying connection with no compression",
            );
            const fallbackOpts = { ...connectOptions };
            delete (fallbackOpts as any).compressors;
            return mongoose.createConnection(connectionString, fallbackOpts).asPromise();
          }
          throw err;
        });

      this.connected = true;

      const { registerSystemModels } = await import("./model-registration");
      await registerSystemModels(this._connection);

      logger.info("Connected to MongoDB");
      return { success: true, data: undefined };
    } catch (err: any) {
      this.connected = false;
      return this.handleError(err, "DB_CONNECTION_FAILED");
    }
  }

  async disconnect(): Promise<DatabaseResult<void>> {
    try {
      if (this._connection) {
        await this._connection.close();
        this._connection = null;
      }
      this.connected = false;
      logger.info("Disconnected from MongoDB");
      return { success: true, data: undefined };
    } catch (err: any) {
      return this.handleError(err, "DB_DISCONNECT_FAILED");
    }
  }

  public _getOrCreateModel(collection: string, schema?: mongoose.Schema): mongoose.Model<any> {
    if (!this._connection) {
      throw new Error("Database not connected");
    }
    if (this._connection.models[collection]) {
      return this._connection.models[collection];
    }
    if (schema) {
      return this._connection.model(collection, schema);
    }
    const genericSchema = new mongoose.Schema(
      { _id: { type: String, required: true } },
      { strict: false, timestamps: true, versionKey: false, id: false },
    );
    return this._connection.model(collection, genericSchema, collection);
  }

  /**
   * Translates a raw MongoDB-style query into a structured Mongo filter.
   * 🚀 Ultra Fast-Path: Bypasses translation entirely for simple ID/Token lookups.
   * 🚀 Fused: Direct walk — no intermediate IR objects (symmetry with drizzle-sql-helpers mapQuery).
   */
  private addMongoCondition(out: Record<string, any>, field: string, operator: string, value: any) {
    const opMap: Record<string, string> = {
      $eq: "$eq",
      $ne: "$ne",
      $gt: "$gt",
      $gte: "$gte",
      $lt: "$lt",
      $lte: "$lte",
      $in: "$in",
      $nin: "$nin",
      $exists: "$exists",
      $contains: "$regex",
      $like: "$regex",
    };
    const mongoOp = opMap[operator] || operator;
    let v = value;
    if (operator === "$contains") v = new RegExp(String(value), "i");
    else if (operator === "$like")
      v = new RegExp("^" + String(value).replace(/%/g, ".*") + "$", "i");

    if (mongoOp === "$eq") {
      out[field] = v;
    } else {
      const existing = out[field];
      if (existing && typeof existing === "object" && !Array.isArray(existing)) {
        existing[mongoOp] = v;
      } else {
        out[field] = { [mongoOp]: v };
      }
    }
  }

  private addMongoConds(out: Record<string, any>, q: any) {
    if (!q || typeof q !== "object") return;
    for (const key in q) {
      if (!Object.prototype.hasOwnProperty.call(q, key)) continue;
      const value = q[key];

      if (key === "$or" && Array.isArray(value)) {
        const subs: Record<string, any>[] = [];
        for (const sub of value) {
          const sc: Record<string, any> = {};
          this.addMongoConds(sc, sub);
          if (Object.keys(sc).length > 0) subs.push(sc);
        }
        if (subs.length > 0) out["$or"] = subs;
      } else if (key === "$and" && Array.isArray(value)) {
        const subs: Record<string, any>[] = [];
        for (const sub of value) {
          const sc: Record<string, any> = {};
          this.addMongoConds(sc, sub);
          if (Object.keys(sc).length > 0) subs.push(sc);
        }
        if (subs.length > 0) out["$and"] = subs;
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        let handled = false;
        for (const subKey in value) {
          if (!Object.prototype.hasOwnProperty.call(value, subKey)) continue;
          if (subKey.startsWith("$")) {
            this.addMongoCondition(out, key, subKey, (value as any)[subKey]);
            handled = true;
          } else {
            this.addMongoCondition(out, key, "$eq", value);
            handled = true;
            break;
          }
        }
        if (!handled) this.addMongoCondition(out, key, "$eq", value);
      } else {
        this.addMongoCondition(out, key, "$eq", value);
      }
    }
  }

  public mapQuery(query: Record<string, unknown>): Record<string, any> {
    if (!query) return {};

    let count = 0;
    let isSimple = true;

    for (const key in query) {
      count++;
      if (count > 2) {
        isSimple = false;
        break;
      }
      if (key !== "_id" && key !== "token" && key !== "tenantId") {
        isSimple = false;
        break;
      }
    }

    if (isSimple && count > 0) {
      return query as Record<string, any>;
    }

    if (count === 0) return {};

    const result: Record<string, any> = {};
    this.addMongoConds(result, query);
    return sanitizeMongoQuery(result);
  }
}
