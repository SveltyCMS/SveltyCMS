/**
 * @file src/databases/mongodb/models/contentStructure.ts
 * @description MongoDB schema and model for Content Structure.
 *
 * This module defines a schema and model for Content Structure in the MongoDB database.
 * Content Structure represents the hierarchical organization of content in the CMS.
 *
 * Features:
 * - Defines a schema for Content Structure
 * - Defines a model for Content Structure
 * - Defines static methods for Content Structure
 * - Defines indexes for Content Structure
 */

import type { ContentNode, Translation } from "@src/content/types";
import { StatusTypes } from "@src/content/types";
import type { DatabaseError, DatabaseResult } from "@src/databases/db-interface";
import { generateId } from "@src/databases/mongodb/mongodb-utils";
import { logger } from "@utils/logger";
import type { Model, Document as MongooseDocument } from "mongoose";
import mongoose, { Schema } from "mongoose";

// --- Type Definitions for Mongoose Documents content structure---
export interface ContentStructureDocument
  extends Omit<ContentNode, "collectionDef" | "_id" | "children" | "nodeType">, MongooseDocument {
  _id: any;
  collectionDef?: import("@src/content/types").Schema;
  description?: string;
  links?: string[]; // Array of string links for content structure
  livePreview?: boolean | string;
  nodeType: "category" | "collection"; // Explicitly define discriminator key
  permissions?: Record<string, Record<string, boolean>>;
  revision?: boolean;
  slug?: string;
  status?: import("@src/content/types").StatusType;
  strict?: boolean;
}

/** Represents a category-specific document. */
export interface CategoryDocument extends ContentStructureDocument {
  nodeType: "category";
}

/** Represents a collection-specific document. */
export interface CollectionDocument extends ContentStructureDocument {
  nodeType: "collection";
}

// --- Schema Definitions ---

// Translation sub-schema
// Note: _id: false prevents Mongoose from adding unnecessary _id to each translation object
const translationSchema = new Schema<Translation>(
  {
    languageTag: { type: String, required: true },
    translationName: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false },
);

// Base schema for the content structure
export const contentStructureSchema = new Schema<ContentStructureDocument>(
  {
    _id: { type: String, required: true, default: () => generateId() },
    name: { type: String, required: true },
    path: { type: String, index: true }, // Add path field for URL routing
    icon: { type: String, default: "bi:folder" },
    order: { type: Number, default: 999 },
    nodeType: {
      type: String,
      required: true,
      enum: ["category", "collection"],
    },
    translations: [translationSchema],
    parentId: { type: String, default: null, index: true },
    // Properties from ContentNode that are not in the base Mongoose Document
    // label removed if not in ContentNode
    permissions: Schema.Types.Mixed,
    livePreview: { type: Schema.Types.Mixed },
    strict: { type: Boolean },
    revision: { type: Boolean },
    description: { type: String },
    slug: { type: String },
    status: {
      type: String,
      enum: Object.values(StatusTypes),
    },
    links: [{ type: String }],
    collectionDef: { type: Schema.Types.Mixed }, // Use 'collectionDef' instead of 'collection' to avoid Mongoose reserved key warning
    tenantId: { type: String, index: true }, // Add tenantId for multi-tenancy support
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "system_content_structure",
    discriminatorKey: "nodeType", // Use nodeType to differentiate between category and collection
    bufferCommands: false,
  },
);

// --- Indexes ---
contentStructureSchema.index({ updatedAt: -1 });
contentStructureSchema.index({ "translations.languageTag": 1 });

// --- Compound Indexes ---
contentStructureSchema.index({ tenantId: 1, parentId: 1, order: 1 }); // Hierarchical content queries
contentStructureSchema.index({ tenantId: 1, nodeType: 1, status: 1 }); // Content type filtering
contentStructureSchema.index({ tenantId: 1, path: 1 }, { unique: true, sparse: true }); // URL routing (unique per tenant)
contentStructureSchema.index({ tenantId: 1, slug: 1 }, { sparse: true }); // Slug-based lookups
contentStructureSchema.index({
  tenantId: 1,
  "translations.languageTag": 1,
  nodeType: 1,
}); // Multi-language content
contentStructureSchema.index({ parentId: 1, order: 1, nodeType: 1 }); // Child node ordering
contentStructureSchema.index({ nodeType: 1, updatedAt: -1 }); // Recent content by type

// --- DTOs ---
export interface ContentStructureReorderItem {
  id: string;
  order: number;
  parentId: string | null;
  path: string;
}

// --- Static Methods ---

/**
 * Utility function to create a standardized DatabaseError object.
 * @param error - The original error object.
 * @param code - A custom error code.
 * @param message - A descriptive error message.
 * @returns A DatabaseError object.
 */
const createDatabaseError = (error: unknown, code: string, message: string): DatabaseError => {
  const err = error instanceof Error ? error : new Error(String(error));
  logger.error(`${code}: ${message}`, err);
  return {
    code,
    message,
    details: err.message,
  };
};

contentStructureSchema.statics = {
  async getContentStructure(tenantId: string): Promise<DatabaseResult<ContentStructureDocument[]>> {
    try {
      const contentStructure = await this.find({ tenantId } as any)
        .sort({ order: 1 })
        .lean();
      return { success: true, data: contentStructure };
    } catch (error) {
      const message = "Error fetching content structure";
      return {
        success: false,
        message,
        error: createDatabaseError(error, "CONTENT_GET_CONTENT_STRUCTURE_ERROR", message),
      };
    }
  },

  async upsertCategory(category: ContentNode): Promise<DatabaseResult<CategoryDocument>> {
    try {
      const result = await this.findOneAndUpdate(
        { _id: category._id } as any,
        { $set: { ...category, nodeType: "category" } } as any,
        { upsert: true, returnDocument: "after" },
      ).lean();
      if (!result) {
        const message = `Failed to upsert category: ${category.path}`;
        return {
          success: false,
          message,
          error: createDatabaseError(new Error(message), "CONTENT_UPSERT_CATEGORY_ERROR", message),
        };
      }
      return { success: true, data: result as CategoryDocument };
    } catch (error) {
      const message = `Error upserting category: ${category.path}`;
      return {
        success: false,
        message,
        error: createDatabaseError(error, "CONTENT_UPSERT_CATEGORY_ERROR", message),
      };
    }
  },
  async upsertCollection(collection: ContentNode): Promise<DatabaseResult<CollectionDocument>> {
    try {
      const result = await this.findOneAndUpdate(
        { _id: collection._id } as any,
        { $set: { ...collection, nodeType: "collection" } } as any,
        { upsert: true, returnDocument: "after" },
      ).lean();
      if (!result) {
        const message = `Failed to upsert collection: ${collection.path || collection._id}`;
        return {
          success: false,
          message,
          error: createDatabaseError(
            new Error(message),
            "CONTENT_UPSERT_COLLECTION_ERROR",
            message,
          ),
        };
      }
      return { success: true, data: result as CollectionDocument };
    } catch (error) {
      const message = `Error upserting collection: ${collection.path || collection._id}`;
      return {
        success: false,
        message,
        error: createDatabaseError(error, "CONTENT_UPSERT_COLLECTION_ERROR", message),
      };
    }
  },

  async getNodeById(id: string): Promise<DatabaseResult<ContentStructureDocument | null>> {
    try {
      const node = await this.findOne({ _id: id } as any).lean();
      return { success: true, data: node };
    } catch (error) {
      const message = `Error fetching node by id: ${id}`;
      return {
        success: false,
        message,
        error: createDatabaseError(error, "CONTENT_GET_NODE_BY_ID_ERROR", message),
      };
    }
  },

  async getChildren(
    tenantId: string,
    parentId: string,
  ): Promise<DatabaseResult<ContentStructureDocument[]>> {
    try {
      const children = await this.find({ tenantId, parentId } as any)
        .sort({ order: 1 })
        .lean();
      return { success: true, data: children };
    } catch (error) {
      const message = `Error fetching children for parent id: ${parentId}`;
      return {
        success: false,
        message,
        error: createDatabaseError(error, "CONTENT_GET_CHILDREN_ERROR", message),
      };
    }
  },

  /**
   * Validates a parent-child relationship before persisting changes.
   */
  async validateMove(
    nodeId: string,
    newParentId: string | null,
    tenantId?: string,
  ): Promise<DatabaseResult<void>> {
    try {
      const node = await this.findOne({
        _id: nodeId,
        ...(tenantId ? { tenantId } : {}),
      } as any).lean();
      const parent = newParentId
        ? await this.findOne({
            _id: newParentId,
            ...(tenantId ? { tenantId } : {}),
          } as any).lean()
        : null;

      if (!node) {
        return {
          success: false,
          message: "Node not found",
          error: createDatabaseError(
            new Error("Node not found"),
            "CONTENT_NODE_NOT_FOUND",
            "Node not found",
          ),
        };
      }

      if (parent && parent.nodeType === "collection" && node.nodeType === "category") {
        return {
          success: false,
          message: "Categories cannot be nested under collections",
          error: createDatabaseError(
            new Error("Invalid nesting"),
            "CONTENT_INVALID_NESTING",
            "Categories cannot be nested under collections",
          ),
        };
      }

      // Circular move detection: Ensure newParentId isn't nodeId itself, nor a descendant.
      if (newParentId) {
        if (newParentId === nodeId) {
          return {
            success: false,
            message: "A node cannot be its own parent",
            error: createDatabaseError(
              new Error("Circular move"),
              "CONTENT_CIRCULAR_MOVE",
              "Circular move detect",
            ),
          };
        }

        let currentParent = parent;
        while (currentParent && currentParent.parentId) {
          if (currentParent.parentId === nodeId) {
            return {
              success: false,
              message: "A node cannot be moved into one of its descendants",
              error: createDatabaseError(
                new Error("Circular move"),
                "CONTENT_CIRCULAR_MOVE",
                "Circular move detected",
              ),
            };
          }
          currentParent = await this.findOne({
            _id: currentParent.parentId,
            ...(tenantId ? { tenantId } : {}),
          } as any).lean();
        }
      }

      return { success: true, data: undefined };
    } catch (error) {
      const message = `Error validating move for node ${nodeId}`;
      return {
        success: false,
        message,
        error: createDatabaseError(error, "CONTENT_VALIDATE_MOVE_ERROR", message),
      };
    }
  },

  /**
   * Persists a full or partial content structure reorder.
   * This method updates parentId, order, and path atomically.
   */
  async reorderStructure(
    items: ContentStructureReorderItem[],
    tenantId?: string | null,
  ): Promise<DatabaseResult<void>> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const bulkOps: mongoose.AnyBulkWriteOperation<ContentStructureDocument>[] = items.map(
        (item) => ({
          updateOne: {
            filter: {
              _id: item.id,
              ...(tenantId ? { tenantId } : {}),
            } as mongoose.QueryFilter<ContentStructureDocument>,
            update: {
              $set: {
                parentId: item.parentId,
                order: item.order,
                path: item.path,
              },
            },
          },
        }),
      ) as any[];

      if (bulkOps.length > 0) {
        await this.bulkWrite(bulkOps, { session });
      }

      await session.commitTransaction();
      return { success: true, data: undefined };
    } catch (error) {
      await session.abortTransaction();
      const message = "Error reordering content structure";
      return {
        success: false,
        message,
        error: createDatabaseError(error, "CONTENT_REORDER_ERROR", message),
      };
    } finally {
      session.endSession();
    }
  },
};

/**
 * Register discriminators for the content structure model.
 * This allows us to have different schemas for 'category' and 'collection' if needed in the future while storing them in the same collection.
 */
export function registerContentStructureDiscriminators(conn: any) {
  const connection = conn || mongoose;

  if ((connection as any)._contentDiscriminatorsRegistered) {
    return;
  }

  try {
    const baseModel = connection.models.system_content_structure;
    if (!baseModel) {
      throw new Error(
        "Base model system_content_structure not found. It must be created before registering discriminators.",
      );
    }

    if (!baseModel.discriminators) {
      baseModel.discriminators = {};
    }

    if (!baseModel.discriminators.category) {
      baseModel.discriminator("category", new Schema<CategoryDocument>({}));
      logger.debug("CONTENT_STRUCTURE_CATEGORY_DISCRIMINATOR_REGISTERED");
    }

    if (!baseModel.discriminators.collection) {
      baseModel.discriminator("collection", new Schema<CollectionDocument>({}));
      logger.debug("CONTENT_STRUCTURE_COLLECTION_DISCRIMINATOR_REGISTERED");
    }

    (connection as any)._contentDiscriminatorsRegistered = true;
  } catch (error) {
    logger.error("CONTENT_STRUCTURE_DISCRIMINATOR_REGISTRATION_ERROR", error);
    // Explicitly re-throw if it wasn't a deliberate skip to ensure callers know registration failed
    throw error;
  }
}

// --- Model Export ---

// Create the model using the standard utility
import { getOrCreateModel } from "./mongodb-utils";

export const ContentStructureModel = getOrCreateModel<ContentStructureDocument>(
  mongoose,
  "system_content_structure",
  contentStructureSchema,
) as Model<ContentStructureDocument> & typeof contentStructureSchema.statics;
