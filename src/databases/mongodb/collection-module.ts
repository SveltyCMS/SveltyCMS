/**
 * @file src/databases/mongodb/collection-module.ts
 * @description Dynamic model/schema registration and management for MongoDB collections.
 * Consolidates collection registration, schema caching, and lifecycle management.
 */

import type { Schema } from "@src/content/types";
import { nowISODateString } from "@utils/date";
import { logger } from "@utils/logger";
import mongoose, { type Model, Schema as MongooseSchema } from "mongoose";
import { DatabaseModule } from "../core/base-adapter";
import { normalizeCollectionTableName } from "../core/collection-name";
import type {
  BaseQueryOptions,
  CollectionModel,
  DatabaseId,
  ICollectionAdapter,
} from "../db-interface";
import type { MongoAdapterCore } from "./adapter-core";
import { CacheCategory, invalidateCollectionCache, withCache } from "./mongodb-cache-utils";

type MongoQueryFilter<T> = mongoose.QueryFilter<T>;

export class MongoCollectionMethods {
  private readonly connection: mongoose.Connection;
  private readonly models = new Map<
    string,
    { model: Model<Record<string, unknown>>; wrapped: CollectionModel }
  >();

  constructor(connection: mongoose.Connection = mongoose.connection) {
    this.connection = connection;
  }

  async getModel(id: string): Promise<CollectionModel> {
    return withCache(
      `schema:collection:${id}`,
      async () => {
        const entry = this.models.get(id);
        if (entry) return entry.wrapped;

        // 🚀 SELF-HEALING: if the Mongoose model was registered in a prior
        // createModel call this process but is missing from this.models (e.g.
        // hot-reload cleared the map), reconstruct the wrapped model without
        // re-running DDL.
        const modelName = normalizeCollectionTableName(id);
        const existingModel = (this.connection.models as any)[modelName];
        if (existingModel) {
          const wrappedModel: CollectionModel = {
            findOne: async <R = unknown>(query: Record<string, unknown>) => {
              const result = await (existingModel as any)
                .findOne(query as any)
                .lean()
                .exec();
              return result as R | null;
            },
            aggregate: async <R = unknown>(pipeline: Record<string, unknown>[]) => {
              return (await (existingModel as any).aggregate(pipeline as any).exec()) as R[];
            },
          };
          this.models.set(id, { model: existingModel, wrapped: wrappedModel });
          return wrappedModel;
        }

        throw new Error(
          `Collection model with id ${id} not found. Available: ${Array.from(this.models.keys()).join(", ")}`,
        );
      },
      { category: CacheCategory.SCHEMA },
    );
  }

  async createModel(schema: Schema, force = false): Promise<void> {
    const collectionId = schema._id;
    if (!collectionId) {
      throw new Error("Schema must have an _id field");
    }

    const modelName = normalizeCollectionTableName(collectionId);

    if (this.models.has(collectionId) && !force) {
      logger.debug(
        `[MongoCollectionMethods] Model ${collectionId} already registered, skipping recreation.`,
      );
      return;
    }

    logger.debug(`${force ? "Force updating" : "Creating"} collection model for: ${collectionId}`);

    if (this.models.has(collectionId)) {
      logger.debug(`Removing existing model ${collectionId} for refresh...`);
      this.models.delete(collectionId);
    }

    if (this.connection.models[modelName]) {
      logger.debug(`Deleting Mongoose model ${modelName} for refresh...`);
      delete (this.connection.models as any)[modelName];
    }

    const schemaDefinition: Record<string, mongoose.SchemaDefinitionProperty> = {
      _id: { type: String, required: true },
      tenantId: { type: String, default: "global", index: true },
      status: { type: String, default: "draft" },
      isDeleted: { type: Boolean, default: false, index: true },
      createdAt: { type: String, default: () => nowISODateString() },
      updatedAt: { type: String, default: () => nowISODateString() },
      createdBy: { type: MongooseSchema.Types.Mixed, ref: "auth_users" },
      updatedBy: { type: MongooseSchema.Types.Mixed, ref: "auth_users" },
    };

    if (schema.fields && Array.isArray(schema.fields)) {
      for (const field of schema.fields) {
        if (typeof field === "object" && field !== null) {
          const fieldObj = field as Record<string, unknown>;
          const fieldKey =
            (fieldObj.db_fieldName as string) ||
            (fieldObj.name as string) ||
            (fieldObj.label
              ? String(fieldObj.label)
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, "_")
              : null) ||
            (fieldObj.Name as string);

          if (!fieldKey || fieldKey in schemaDefinition) {
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

    const mongooseSchema = new mongoose.Schema(schemaDefinition, {
      _id: false,
      strict: schema.strict !== false,
      timestamps: false,
      collection: modelName.toLowerCase(),
    });

    const model = this.connection.model(modelName, mongooseSchema);

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

    this.createIndexes(model as any, schema).catch((error) => {
      logger.warn(`Background index creation failed for ${collectionId}:`, error);
    });

    await invalidateCollectionCache(`schema:collection:${collectionId}`);
  }

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

  async listSchemas(tenantId?: string | null): Promise<Schema[]> {
    try {
      const structureCollection = this.connection.db?.collection("system_content_structure");
      const query: Record<string, unknown> = { nodeType: "collection" };
      if (tenantId && tenantId !== "global") {
        query.tenantId = tenantId;
      }
      const nodes = (await structureCollection?.find(query).toArray()) || [];

      const schemas = nodes
        .filter((node) => node.collectionDef)
        .map((node) => node.collectionDef as Schema);

      if (schemas.length === 0 && this.models.size > 0) {
        const result: Schema[] = [];
        for (const [id, entry] of this.models) {
          try {
            const doc = await entry.model.findOne({}).lean();
            const fieldNames = doc
              ? Object.keys(doc).filter(
                  (k) => !k.startsWith("_") && k !== "tenantId" && k !== "__v",
                )
              : [];
            result.push({
              _id: id,
              name: id,
              fields: fieldNames.map((k) => ({
                db_fieldName: k,
                label: k,
                widget: { Name: "Input" },
                type: "string",
              })),
              status: "publish",
            } as Schema);
          } catch {
            result.push({
              _id: id,
              name: id,
              fields: [],
              status: "publish",
            } as Schema);
          }
        }
        return result;
      }
      return schemas;
    } catch (error) {
      logger.error(`Failed to list schemas for tenant ${tenantId}:`, error);
      return [];
    }
  }

  async updateModel(schema: Schema): Promise<void> {
    await this.createModel(schema);
  }

  async deleteModel(id: string): Promise<void> {
    this.models.delete(id);
    const modelName = normalizeCollectionTableName(id);
    if (this.connection.models[modelName]) {
      delete (this.connection.models as any)[modelName];
    }
    logger.info(`Collection model deleted: ${id}`);
    await invalidateCollectionCache(`schema:collection:${id}`);
  }

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

  getMongooseModel(id: string): Model<Record<string, unknown>> | null {
    const entry = this.models.get(id);
    return entry ? entry.model : null;
  }

  getRegisteredModelIds(): string[] {
    return Array.from(this.models.keys());
  }

  private async createIndexes(
    model: Model<Record<string, unknown>>,
    schema: Schema,
  ): Promise<void> {
    try {
      const collectionId = schema._id;
      logger.debug(`Creating indexes for collection: ${collectionId}`);

      const indexes: Array<{
        fields: Record<string, 1 | -1 | "text">;
        options?: Record<string, unknown>;
      }> = [
        { fields: { status: 1 } },
        { fields: { createdAt: -1 } },
        { fields: { updatedAt: -1 } },
        { fields: { createdBy: 1 } },
        { fields: { status: 1, createdAt: -1 } },
        { fields: { status: 1, updatedAt: -1 } },
        { fields: { tenantId: 1 } },
        { fields: { tenantId: 1, status: 1 } },
        { fields: { tenantId: 1, createdAt: -1 } },
        { fields: { tenantId: 1, status: 1, updatedAt: -1 } },
        { fields: { tenantId: 1, updatedAt: -1, _id: -1 } },
        { fields: { tenantId: 1, status: 1, updatedAt: -1, _id: -1 } },
      ];

      const textFields: Record<string, "text"> = {};

      if (schema.fields && Array.isArray(schema.fields)) {
        for (const field of schema.fields) {
          if (typeof field === "object" && field !== null) {
            const fieldObj = field as Record<string, unknown>;
            const fieldKey =
              (fieldObj.db_fieldName as string) ||
              (fieldObj.name as string) ||
              (fieldObj.label
                ? String(fieldObj.label)
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, "_")
                : null) ||
              (fieldObj.Name as string);

            if (!fieldKey) {
              continue;
            }

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

            if (fieldObj.indexed || fieldObj.searchable || fieldObj.sortable) {
              indexes.push({ fields: { [fieldKey]: 1 } });
            }

            if (fieldObj.searchable && (fieldObj.type === "text" || fieldObj.type === "textarea")) {
              textFields[fieldKey] = "text";
            }
          }
        }
      }

      if (Object.keys(textFields).length > 0) {
        indexes.push({
          fields: textFields,
          options: { name: "text_search_index", default_language: "english" },
        });
      }

      const collection = model.collection;
      const indexPromises = indexes.map(async (index) => {
        try {
          if (this.connection.readyState !== 1) return;
          await collection.createIndex(index.fields as any, index.options || {});
        } catch (error: any) {
          if (
            this.connection.readyState === 0 ||
            error?.name === "MongoClientClosedError" ||
            error?.message?.includes("client was closed") ||
            error?.message?.includes("interrupted because client was closed")
          ) {
            return;
          }
          if (error?.code === 85 || error?.message?.includes("already exists")) {
            return;
          }
          logger.warn(`Failed to create index for ${collectionId}: ${error}`);
        }
      });

      await Promise.allSettled(indexPromises);
    } catch (error) {
      logger.error(`Error creating indexes: ${error}`);
    }
  }
}

export class MongoCollectionModule
  extends DatabaseModule<MongoAdapterCore>
  implements ICollectionAdapter
{
  private _methods: MongoCollectionMethods | null = null;

  private async _getMethods(): Promise<MongoCollectionMethods> {
    if (this._methods) return this._methods;

    if (!this.adapter.connection || this.adapter.connection.readyState !== 1) {
      let attempts = 0;
      while (
        (!this.adapter.connection || this.adapter.connection.readyState !== 1) &&
        attempts < 50
      ) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
    }

    if (!this.adapter.connection) {
      throw new Error(
        `[MongoCollectionModule] Database connection not found on adapter ${this.adapter.constructor.name}. Ensure connect() has completed.`,
      );
    }

    this._methods = new MongoCollectionMethods(this.adapter.connection);
    return this._methods;
  }

  async getModel(id: string) {
    return (await this._getMethods()).getModel(id);
  }

  async createModel(schema: Schema, force?: boolean) {
    return (await this._getMethods()).createModel(schema, force);
  }

  async updateModel(schema: Schema) {
    return (await this._getMethods()).updateModel(schema);
  }

  async deleteModel(id: string) {
    return (await this._getMethods()).deleteModel(id);
  }

  async getSchema(name: string, tenantId?: DatabaseId | null) {
    const schema = await (
      await this._getMethods()
    ).getSchema(name, tenantId ? String(tenantId) : null);
    return { success: true as const, data: schema };
  }

  async getSchemaById(id: string, tenantId?: DatabaseId | null) {
    const schema = await (
      await this._getMethods()
    ).getSchemaById(id, tenantId ? String(tenantId) : null);
    return { success: true as const, data: schema };
  }

  async listSchemas(tenantId?: DatabaseId | null, _options?: BaseQueryOptions) {
    const schemas = await (
      await this._getMethods()
    ).listSchemas(tenantId ? String(tenantId) : null);
    return { success: true as const, data: schemas };
  }

  async collectionExists(name: string) {
    return (await this._getMethods()).collectionExists(name);
  }

  async getMongooseModel(id: string) {
    return (await this._getMethods()).getMongooseModel(id);
  }

  async getRegisteredModelIds() {
    return (await this._getMethods()).getRegisteredModelIds();
  }

  async getFields(collectionName: string, options?: BaseQueryOptions) {
    const res = await this.getSchema(collectionName, options?.tenantId);
    const schema = res.data;
    return {
      success: true as const,
      data: schema ? schema.fields || [] : [],
    };
  }
}
