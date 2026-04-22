/**
 * @file src/databases/mongodb/adapter/adapter-core.ts
 * @description Core functionality shared across MongoDB adapter modules.
 */

import mongoose from "mongoose";
import { logger } from "@utils/logger";
import { BaseAdapter } from "../../base-adapter";
import type {
  DatabaseCapabilities,
  DatabaseResult,
  ConnectionPoolOptions,
} from "../../db-interface";

export class MongoAdapterCore extends BaseAdapter {
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
          : (connectionStringOrOptions as any).connectionString || "";

      if (!connectionString) {
        const { getDatabaseConnectionString } = await import("../../config-state");
        connectionString = getDatabaseConnectionString();
      }

      if (!connectionString) {
        throw new Error("Missing MongoDB connection string.");
      }

      if (this.isConnected()) {
        return { success: true, data: undefined };
      }

      const poolOptions =
        typeof connectionStringOrOptions === "object" ? connectionStringOrOptions : {};

      const connectOptions: mongoose.ConnectOptions = {
        ...options,
        autoIndex: false,
        bufferCommands: false,
        maxPoolSize: poolOptions.maxConnections || 100,
        minPoolSize: poolOptions.minConnections || 10,
        serverSelectionTimeoutMS: poolOptions.connectionTimeout || 30000,
        socketTimeoutMS: 45000,
        family: 4,
        connectTimeoutMS: 10000,
        waitQueueTimeoutMS: 10000,
      };

      // Global BSON-to-String Normalization
      const globalOptions = {
        flattenUUIDs: true,
        flattenObjectIds: true,
        flattenMaps: true,
        getters: true,
        virtuals: true,
      };
      mongoose.set("toObject", globalOptions);
      mongoose.set("toJSON", globalOptions);

      this._connection = await mongoose
        .createConnection(connectionString, connectOptions)
        .asPromise();
      this.connected = true;

      // Register system models with correct schemas (fixes Cast to ObjectId issues)
      const { registerSystemModels } = await import("../methods/model-registration");
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
    if (!this._connection) throw new Error("Database not connected");

    if (this._connection.models[collection]) {
      return this._connection.models[collection];
    }

    if (schema) {
      return this._connection.model(collection, schema);
    }

    // Fallback to a generic schema if none provided
    const genericSchema = new mongoose.Schema({ any: {} }, { strict: false, timestamps: true });
    return this._connection.model(collection, genericSchema);
  }
}
