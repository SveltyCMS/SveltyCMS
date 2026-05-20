/**
 * @file src/databases/mongodb/adapter/adapter-core.ts
 * @description Core functionality shared across MongoDB adapter modules.
 */

import { createRequire } from "node:module";
if (typeof (globalThis as any).require === "undefined") {
  (globalThis as any).require = createRequire(import.meta.url);
}

import mongoose from "mongoose";
import { queryTranslator } from "../core/query-ir";
import { logger } from "@utils/logger";
import { BaseAdapter } from "../core/base-adapter";
import type { DatabaseCapabilities, DatabaseResult, ConnectionPoolOptions } from "../db-interface";

export abstract class MongoAdapterCore extends BaseAdapter {
  protected _connection: mongoose.Connection | null = null;
  protected _models: Map<string, mongoose.Model<any>> = new Map();

  public capabilities: DatabaseCapabilities = {
    maxBatchSize: 1000,
    supportsTransactions: true,
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
        .asPromise();

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
      return this._connection.model(collection, schema, collection);
    }

    /*
     * SveltyCMS uses string IDs across the database adapter contract.
     * Without defining _id as String here, Mongoose uses ObjectId by default.
     * That breaks generic CRUD collections because MongoCrudMethods inserts
     * generated string IDs.
     */
    const genericSchema = new mongoose.Schema(
      {
        _id: {
          type: String,
          required: true,
        },
      },
      {
        strict: false,
        timestamps: true,
        versionKey: false,
        id: false,
      },
    );

    return this._connection.model(collection, genericSchema, collection);
  }

  /**
   * Translates a raw MongoDB-style query into a structured Mongo filter via Query IR.
   * 🚀 Ultra Fast-Path: Bypasses IR translation for simple ID/Token lookups.
   */
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
      return query;
    }

    if (count === 0) return {};

    // 1. Translate to IR (Uses IR translator)
    const ir = queryTranslator.translate("temp", query);

    // 2. Map IR back to Mongo Filter (Ensures operator consistency)
    return this.mapIRToMongo(ir.filter);
  }

  /**
   * Recursively maps the Unified Query IR LogicalGroup back to a MongoDB filter.
   */
  private mapIRToMongo(group: any): Record<string, any> {
    const filter: Record<string, any> = {};
    const conditions: Record<string, any>[] = [];

    for (const item of group.conditions) {
      if ("operator" in item && "conditions" in item) {
        // Nested logical group
        const sub = this.mapIRToMongo(item);
        if (Object.keys(sub).length > 0) {
          const mongoOp =
            item.operator === "$or" ? "$or" : item.operator === "$and" ? "$and" : "$nor";
          conditions.push({ [mongoOp]: [sub] });
        }
      } else {
        // Query condition
        const cond = item;
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

        const mongoOp = opMap[cond.operator] || cond.operator;
        let value = cond.value;

        if (cond.operator === "$contains") {
          value = new RegExp(String(value), "i");
        } else if (cond.operator === "$like") {
          value = new RegExp("^" + String(value).replace(/%/g, ".*") + "$", "i");
        }

        if (mongoOp === "$eq") {
          filter[cond.field] = value;
        } else {
          filter[cond.field] = filter[cond.field] || {};
          filter[cond.field][mongoOp] = value;
        }
      }
    }

    if (conditions.length > 0) {
      const groupOp =
        group.operator === "$or" ? "$or" : group.operator === "$and" ? "$and" : "$nor";
      if (Object.keys(filter).length > 0) {
        return { [groupOp]: [...conditions, filter] };
      }
      return conditions.length === 1 ? conditions[0] : { [groupOp]: conditions };
    }

    return filter;
  }
}
