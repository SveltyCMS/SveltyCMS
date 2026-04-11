/**
 * @file src/databases/mongodb/methods/collectionMethods.ts
 * @description Dynamic model/schema registration and management for MongoDB collections.
 *
 * Responsibility: ONLY for dynamic model/schema creation, registration, and management.
 *
 * This module handles:
 * - Dynamic creation of Mongoose models from collection schemas
 * - Model registry/map for tracking registered models
 * - Model existence checks and retrieval
 * - Schema validation and field mapping
 *
 * Does NOT handle:
 * - CRUD operations (use crud-methods.ts)
 * - Content structure/drafts/revisions (use contentMethods.ts)
 */

import type { Schema } from "@src/content/types";
import { nowISODateString } from "@utils/date-utils";
import { logger } from "@utils/logger";
import mongoose, { type Model, Schema as MongooseSchema } from "mongoose";
import type { CollectionModel } from "../../db-interface";
import { CacheCategory, invalidateCollectionCache, withCache } from "./mongodb-cache-utils";

// Local alias for Mongoose 9 QueryFilter to avoid collision with CMS QueryFilter from db-interface
type MongoQueryFilter<T> = mongoose.QueryFilter<T>;

/**
 * MongoCollectionMethods manages dynamic model creation and registration.
 *
 * This class is responsible for creating, registering, and managing
 * dynamic Mongoose models based on user-defined collection schemas.
 */
export class MongoCollectionMethods {
  private readonly connection: mongoose.Connection;

  // Internal registry of all dynamically created models
  private readonly models = new Map<
    string,
    { model: Model<Record<string, unknown>>; wrapped: CollectionModel }
  >();

  constructor(connection: mongoose.Connection = mongoose.connection) {
    this.connection = connection;
  }

  /**
   * Gets a registered collection model by ID
   * Cached with 600s TTL since schemas rarely change
   */
  async getModel(id: string): Promise<CollectionModel> {
    return withCache(
      `schema:collection:${id}`,
      async () => {
        const entry = this.models.get(id);
        if (!entry) {
          throw new Error(
            `Collection model with id ${id} not found. Available: ${Array.from(this.models.keys()).join(", ")}`,
          );
        }
        return entry.wrapped;
      },
      { category: CacheCategory.SCHEMA },
    );
  }

  /**
   * Creates or updates a dynamic collection model from a schema
   */
  async createModel(schema: Schema, force = false): Promise<void> {
    const collectionId = schema._id;
    if (!collectionId) {
      throw new Error("Schema must have an _id field");
    }

    const modelName = `collection_${collectionId}`;

    // If model already exists and we are not forcing, skip creation
    // This significantly improves performance during parallel initialization
    if (this.models.has(collectionId) && !force) {
      logger.debug(
        `[MongoCollectionMethods] Model ${collectionId} already registered, skipping recreation.`,
      );
      return;
    }

    logger.debug(`${force ? "Force updating" : "Creating"} collection model for: ${collectionId}`);

    // Force delete existing model and registry entry to ensure clean slate
    // This is crucial for schema updates (e.g., ObjectId → String migration)
    if (this.models.has(collectionId)) {
      logger.debug(`Removing existing model ${collectionId} for refresh...`);
      this.models.delete(collectionId);
    }

    // Remove existing Mongoose model if present (for hot reload)
    if (this.connection.models[modelName]) {
      logger.debug(`Deleting Mongoose model ${modelName} for refresh...`);
      delete (this.connection.models as any)[modelName];
    }

    // Build schema definition from collection fields
    // Note: Using String type for _id to support UUID-based IDs instead of MongoDB ObjectIds
    const schemaDefinition: Record<string, mongoose.SchemaDefinitionProperty> = {
      _id: { type: String, required: true },
      status: { type: String, default: "draft" },
      createdAt: { type: String, default: () => nowISODateString() },
      updatedAt: { type: String, default: () => nowISODateString() },
      createdBy: { type: MongooseSchema.Types.Mixed, ref: "auth_users" },
      updatedBy: { type: MongooseSchema.Types.Mixed, ref: "auth_users" },
    };

    // Map collection fields to Mongoose schema
    if (schema.fields && Array.isArray(schema.fields)) {
      for (const field of schema.fields) {
        if (typeof field === "object" && field !== null) {
          const fieldObj = field as Record<string, unknown>;
          const fieldKey =
            (fieldObj.db_fieldName as string) ||
            (fieldObj.label
              ? String(fieldObj.label)
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "_")
              : null) ||
            (fieldObj.Name as string);

          if (!fieldKey) {
            continue;
          }

          schemaDefinition[fieldKey] = {
            type: mongoose.Schema.Types.Mixed,
            required: fieldObj.required as boolean,
            unique: fieldObj.unique as boolean,
          };
        }
      }
    }

    // Create Mongoose schema
    // Use _id: false to prevent auto-generation of ObjectId, then explicitly define _id as String
    const mongooseSchema = new mongoose.Schema(schemaDefinition, {
      _id: false, // Disable auto ObjectId generation
      strict: schema.strict !== false,
      timestamps: false, // We handle timestamps explicitly with ISODateString
      collection: modelName.toLowerCase(),
    });

    // Create and register the model
    const model = this.connection.model(modelName, mongooseSchema);

    // Wrap the model for the interface
    const wrappedModel: CollectionModel = {
      findOne: async <R = unknown>(query: Record<string, unknown>) => {
        const result = await (model as any)
          .findOne(query as MongoQueryFilter<Record<string, unknown>>)
          .lean()
          .exec();
        return result as R | null;
      },
      aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
        return (await (model as any)
          .aggregate(pipeline as unknown as mongoose.PipelineStage[])
          .exec()) as R[];
      },
    };

    this.models.set(collectionId, {
      model: model as any,
      wrapped: wrappedModel,
    });
    logger.info(`Collection model created: ${collectionId} (${modelName})`);

    // Create database indexes in background to avoid blocking system initialization
    // Use fire-and-forget but maintain visibility via logs/errors within the method
    this.createIndexes(model as any, schema).catch((error) => {
      logger.warn(`Background index creation failed for ${collectionId}:`, error);
    });

    // Invalidate cache for this collection AFTER successful creation
    await invalidateCollectionCache(`schema:collection:${collectionId}`);
  }

  /**
   * Gets a saved schema definition by collection name (display name in UI).
   */
  async getSchema(collectionName: string, tenantId?: string | null): Promise<Schema | null> {
    try {
      const structureCollection = this.connection.db?.collection("system_content_structure");
      const query: Record<string, unknown> = { name: collectionName };
      if (tenantId) {
        query.tenantId = tenantId;
      }
      const result = await structureCollection?.findOne(query);

      if (result?.collectionDef) {
        return result.collectionDef as Schema;
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get schema for ${collectionName} (tenant: ${tenantId}):`, error);
      return null;
    }
  }

  /**
   * Gets a saved schema definition by collection document _id.
   * Use when comparing during save so renames (General Configuration) do not look up by new name and get null.
   */
  async getSchemaById(collectionId: string, tenantId?: string | null): Promise<Schema | null> {
    try {
      if (!collectionId || String(collectionId).trim() === "") return null;
      const structureCollection = this.connection.db?.collection("system_content_structure");
      const idNorm = String(collectionId).trim().replace(/-/g, "");

      const query: any = {
        $or: [{ _id: collectionId }, { _id: idNorm }],
      };
      if (tenantId) {
        query.tenantId = tenantId;
      }

      const result = await structureCollection?.findOne(
        query as unknown as mongoose.mongo.Filter<mongoose.mongo.Document>,
      );

      if (result?.collectionDef) {
        return result.collectionDef as Schema;
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get schema by id ${collectionId} (tenant: ${tenantId}):`, error);
      return null;
    }
  }

  /**
   * Lists all saved schemas
   */
  async listSchemas(tenantId?: string | null): Promise<Schema[]> {
    try {
      const structureCollection = this.connection.db?.collection("system_content_structure");
      const query: Record<string, unknown> = { nodeType: "collection" };
      if (tenantId) {
        query.tenantId = tenantId;
      }
      const nodes = (await structureCollection?.find(query).toArray()) || [];

      return nodes.filter((node) => node.collectionDef).map((node) => node.collectionDef as Schema);
    } catch (error) {
      logger.error(`Failed to list schemas for tenant ${tenantId}:`, error);
      return [];
    }
  }

  /**
   * Updates an existing collection model
   */
  async updateModel(schema: Schema): Promise<void> {
    // For now, just recreate the model
    await this.createModel(schema);
  }

  /**
   * Deletes a collection model
   */
  async deleteModel(id: string): Promise<void> {
    this.models.delete(id);
    const modelName = `collection_${id}`;
    if (this.connection.models[modelName]) {
      delete (this.connection.models as any)[modelName];
    }
    logger.info(`Collection model deleted: ${id}`);

    // Invalidate cache after successful deletion
    await invalidateCollectionCache(`schema:collection:${id}`);
  }

  /**
   * Checks if a collection exists in the database
   */
  async collectionExists(collectionName: string): Promise<boolean> {
    try {
      const collections =
        (await this.connection.db
          ?.listCollections({
            name: collectionName.toLowerCase(),
          })
          .toArray()) ?? [];
      return collections.length > 0;
    } catch (error) {
      logger.error(`Error checking collection existence: ${error}`);
      return false;
    }
  }

  /**
   * Gets the internal Mongoose model (for CRUD operations)
   */
  getMongooseModel(id: string): Model<Record<string, unknown>> | null {
    const entry = this.models.get(id);
    return entry ? entry.model : null;
  }

  /**
   * Gets all registered model IDs
   */
  getRegisteredModelIds(): string[] {
    return Array.from(this.models.keys());
  }

  /**
   * Creates database indexes for optimal query performance
   *
   * This method creates indexes on:
   * - Common query fields (status, createdAt, updatedAt)
   * - Fields marked as unique or indexed in the schema
   * - Multi-tenant fields (tenantId)
   * - Sortable and filterable fields
   */
  private async createIndexes(
    model: Model<Record<string, unknown>>,
    schema: Schema,
  ): Promise<void> {
    try {
      const collectionId = schema._id;
      logger.debug(`Creating indexes for collection: ${collectionId}`);

      // Essential indexes for all collections
      const indexes: Array<{
        fields: Record<string, 1 | -1 | "text">;
        options?: Record<string, unknown>;
      }> = [
        // Primary sort/filter indexes
        { fields: { status: 1 } },
        { fields: { createdAt: -1 } },
        { fields: { updatedAt: -1 } },
        { fields: { createdBy: 1 } },

        // Compound indexes for common query patterns
        { fields: { status: 1, createdAt: -1 } },
        { fields: { status: 1, updatedAt: -1 } },

        // Multi-tenant support
        { fields: { tenantId: 1 } },
        { fields: { tenantId: 1, status: 1 } },
        { fields: { tenantId: 1, createdAt: -1 } },
      ];

      // Aggregate all text fields into a single text index (MongoDB restriction: only one text index per collection)
      const textFields: Record<string, "text"> = {};

      // Add indexes for fields marked as indexed or unique
      if (schema.fields && Array.isArray(schema.fields)) {
        for (const field of schema.fields) {
          if (typeof field === "object" && field !== null) {
            const fieldObj = field as Record<string, unknown>;
            const fieldKey =
              (fieldObj.db_fieldName as string) ||
              (fieldObj.label
                ? String(fieldObj.label)
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, "_")
                : null) ||
              (fieldObj.Name as string);

            if (!fieldKey) {
              continue;
            }

            // Unique index
            if (fieldObj.unique && !fieldObj.disableUnique) {
              if (fieldObj.tenantScopedUnique || schema.tenantScopedUnique) {
                indexes.push({
                  fields: { tenantId: 1, [fieldKey]: 1 },
                  options: { unique: true, sparse: true },
                });
              } else {
                indexes.push({
                  fields: { [fieldKey]: 1 },
                  options: { unique: true, sparse: true },
                });
              }
            }

            // Regular index for searchable/filterable fields
            if (fieldObj.indexed || fieldObj.searchable || fieldObj.sortable) {
              indexes.push({ fields: { [fieldKey]: 1 } });
            }

            // Text index for searchable text fields
            if (fieldObj.searchable && (fieldObj.type === "text" || fieldObj.type === "textarea")) {
              textFields[fieldKey] = "text";
            }
          }
        }
      }

      // Add the aggregated text index if fields exist
      if (Object.keys(textFields).length > 0) {
        indexes.push({
          fields: textFields,
          options: { name: "text_search_index", default_language: "english" },
        });
      }

      // Create all indexes in parallel for maximum performance
      const collection = model.collection;
      const indexPromises = indexes.map(async (index) => {
        try {
          // 🛡️ Safety Check: Bypass if connection was closed during high-concurrency reloads
          if (this.connection.readyState !== 1) return;

          await collection.createIndex(index.fields as any, index.options || {});
          logger.trace(
            `Created index on ${Object.keys(index.fields).join(", ")} for ${collectionId}`,
          );
        } catch (error: any) {
          // 🤫 SILENCE: If the client was closed or we are disconnecting, suppress the warning noise
          if (
            this.connection.readyState === 0 ||
            error?.name === "MongoClientClosedError" ||
            error?.message?.includes("client was closed") ||
            error?.message?.includes("interrupted because client was closed")
          ) {
            return;
          }

          // Ignore duplicate index errors (Code 85: IndexOptionsConflict)
          if (error?.code === 85 || error?.message?.includes("already exists")) {
            return;
          }
          logger.warn(`Failed to create index for ${collectionId}: ${error}`);
        }
      });

      await Promise.allSettled(indexPromises);
      logger.info(`Indexes created for collection: ${collectionId}`);
    } catch (error) {
      logger.error(`Error creating indexes: ${error}`);
      // Don't throw - index creation failures shouldn't prevent model creation
    }
  }
}
