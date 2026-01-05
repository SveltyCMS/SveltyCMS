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

import type { ContentNode, Translation } from '@src/content/types';
import { StatusTypes } from '@src/content/types';
import type { DatabaseError, DatabaseResult } from '@src/databases/dbInterface';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
import { logger } from '@utils/logger';
import type { Model, Document as MongooseDocument } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// --- Type Definitions for Mongoose Documents content structure---
export interface ContentStructureDocument extends Omit<ContentNode, 'collectionDef' | '_id' | 'children' | 'nodeType'>, MongooseDocument {
	_id: any;
	nodeType: 'category' | 'collection'; // Explicitly define discriminator key
	links?: Array<string>; // Array of string links for content structure
	collectionDef?: import('@src/content/types').Schema;
	permissions?: Record<string, Record<string, boolean>>;
	livePreview?: boolean;
	strict?: boolean;
	revision?: boolean;
	description?: string;
	slug?: string;
	status?: import('@src/content/types').StatusType;
}

/** Represents a category-specific document. */
export interface CategoryDocument extends ContentStructureDocument {
	nodeType: 'category';
}

/** Represents a collection-specific document. */
export interface CollectionDocument extends ContentStructureDocument {
	nodeType: 'collection';
}

// Flag to track if discriminators have been registered
let discriminatorsRegistered = false;

// --- Schema Definitions ---

// Translation sub-schema
// Note: _id: false prevents Mongoose from adding unnecessary _id to each translation object
const translationSchema = new Schema<Translation>(
	{
		languageTag: { type: String, required: true },
		translationName: { type: String, required: true },
		isDefault: { type: Boolean, default: false }
	},
	{ _id: false }
);

// Base schema for the content structure
const contentStructureSchema = new Schema<ContentStructureDocument>(
	{
		_id: { type: String, required: true, default: () => generateId() },
		name: { type: String, required: true },
		path: { type: String, index: true }, // Add path field for URL routing
		icon: { type: String, default: 'bi:folder' },
		order: { type: Number, default: 999 },
		nodeType: { type: String, required: true, enum: ['category', 'collection'] },
		translations: [translationSchema],
		parentId: { type: String, default: null, index: true },
		// Properties from ContentNode that are not in the base Mongoose Document
		// label removed if not in ContentNode
		permissions: Schema.Types.Mixed,
		livePreview: { type: Boolean },
		strict: { type: Boolean },
		revision: { type: Boolean },
		description: { type: String },
		slug: { type: String },
		status: {
			type: String,
			enum: Object.values(StatusTypes)
		},
		links: [{ type: String }],
		collectionDef: { type: Schema.Types.Mixed }, // Use 'collectionDef' instead of 'collection' to avoid Mongoose reserved key warning
		tenantId: { type: String, index: true } // Add tenantId for multi-tenancy support
	},
	{
		timestamps: true,
		collection: 'system_content_structure',
		discriminatorKey: 'nodeType', // Use nodeType to differentiate between category and collection
		_id: false // Disable Mongoose auto-ObjectId generation since we use UUID strings
	}
);

// --- Indexes ---
contentStructureSchema.index({ updatedAt: -1 });
contentStructureSchema.index({ 'translations.languageTag': 1 });

// --- Compound Indexes ---
contentStructureSchema.index({ tenantId: 1, parentId: 1, order: 1 }); // Hierarchical content queries
contentStructureSchema.index({ tenantId: 1, nodeType: 1, status: 1 }); // Content type filtering
contentStructureSchema.index({ tenantId: 1, path: 1 }, { unique: true, sparse: true }); // URL routing (unique per tenant)
contentStructureSchema.index({ tenantId: 1, slug: 1 }, { sparse: true }); // Slug-based lookups
contentStructureSchema.index({ tenantId: 1, 'translations.languageTag': 1, nodeType: 1 }); // Multi-language content
contentStructureSchema.index({ parentId: 1, order: 1, nodeType: 1 }); // Child node ordering
contentStructureSchema.index({ nodeType: 1, updatedAt: -1 }); // Recent content by type

// --- DTOs ---
export interface ContentStructureReorderItem {
	id: string;
	parentId: string | null;
	order: number;
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
		stack: err.stack
	};
};

contentStructureSchema.statics = {
	async getContentStructure(): Promise<DatabaseResult<ContentStructureDocument[]>> {
		try {
			const contentStructure = await this.find({}).lean();
			return { success: true, data: contentStructure };
		} catch (error) {
			const message = 'Error fetching content structure';
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_GET_CONTENT_STRUCTURE_ERROR', message)
			};
		}
	},

	async upsertCategory(category: ContentNode): Promise<DatabaseResult<CategoryDocument>> {
		try {
			const result = await this.findOneAndUpdate(
				{ _id: category._id },
				{ $set: { ...category, nodeType: 'category' } },
				{ upsert: true, new: true }
			).lean();
			if (!result) {
				const message = `Failed to upsert category: ${category.path}`;
				return {
					success: false,
					message,
					error: createDatabaseError(new Error(message), 'CONTENT_UPSERT_CATEGORY_ERROR', message)
				};
			}
			return { success: true, data: result as CategoryDocument };
		} catch (error) {
			const message = `Error upserting category: ${category.path}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_UPSERT_CATEGORY_ERROR', message)
			};
		}
	},
	async upsertCollection(collection: ContentNode): Promise<DatabaseResult<CollectionDocument>> {
		try {
			const result = await this.findOneAndUpdate(
				{ _id: collection._id },
				{ $set: { ...collection, nodeType: 'collection' } },
				{ upsert: true, new: true }
			).lean();
			if (!result) {
				const message = `Failed to upsert collection: ${collection.path || collection._id}`;
				return {
					success: false,
					message,
					error: createDatabaseError(new Error(message), 'CONTENT_UPSERT_COLLECTION_ERROR', message)
				};
			}
			return { success: true, data: result as CollectionDocument };
		} catch (error) {
			const message = `Error upserting collection: ${collection.path || collection._id}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_UPSERT_COLLECTION_ERROR', message)
			};
		}
	},

	async getNodeById(id: string): Promise<DatabaseResult<ContentStructureDocument | null>> {
		try {
			const node = await this.findOne({ _id: id }).lean();
			return { success: true, data: node };
		} catch (error) {
			const message = `Error fetching node by id: ${id}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_GET_NODE_BY_ID_ERROR', message)
			};
		}
	},

	async getChildren(parentId: string): Promise<DatabaseResult<ContentStructureDocument[]>> {
		try {
			const children = await this.find({ parentId }).sort({ order: 1 }).lean();
			return { success: true, data: children };
		} catch (error) {
			const message = `Error fetching children for parent id: ${parentId}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_GET_CHILDREN_ERROR', message)
			};
		}
	},

	/**
	 * Validates a parent-child relationship before persisting changes.
	 */
	async validateMove(nodeId: string, newParentId: string | null): Promise<DatabaseResult<void>> {
		try {
			const node = await this.findOne({ _id: nodeId }).lean();
			const parent = newParentId ? await this.findOne({ _id: newParentId }).lean() : null;

			if (!node) {
				return {
					success: false,
					message: 'Node not found',
					error: createDatabaseError(new Error('Node not found'), 'CONTENT_NODE_NOT_FOUND', 'Node not found')
				};
			}

			if (parent && parent.nodeType === 'collection' && node.nodeType === 'category') {
				return {
					success: false,
					message: 'Categories cannot be nested under collections',
					error: createDatabaseError(new Error('Invalid nesting'), 'CONTENT_INVALID_NESTING', 'Categories cannot be nested under collections')
				};
			}

			return { success: true, data: undefined };
		} catch (error) {
			const message = `Error validating move for node ${nodeId}`;
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_VALIDATE_MOVE_ERROR', message)
			};
		}
	},

	/**
	 * Persists a full or partial content structure reorder.
	 * This method updates parentId, order, and path atomically.
	 */
	async reorderStructure(items: ContentStructureReorderItem[], tenantId?: string): Promise<DatabaseResult<void>> {
		const session = await mongoose.startSession();
		session.startTransaction();

		try {
			const bulkOps = items.map((item) => ({
				updateOne: {
					filter: {
						_id: item.id,
						...(tenantId ? { tenantId } : {})
					} as any,
					update: {
						$set: {
							parentId: item.parentId as any,
							order: item.order,
							path: item.path
						}
					}
				}
			}));

			if (bulkOps.length > 0) {
				await this.bulkWrite(bulkOps, { session });
			}

			await session.commitTransaction();
			return { success: true, data: undefined };
		} catch (error) {
			await session.abortTransaction();
			const message = 'Error reordering content structure';
			return {
				success: false,
				message,
				error: createDatabaseError(error, 'CONTENT_REORDER_ERROR', message)
			};
		} finally {
			session.endSession();
		}
	}
};

/**
 * Register discriminators for the content structure model.
 * This allows us to have different schemas for 'category' and 'collection' if needed in the future while storing them in the same collection.
 */
export function registerContentStructureDiscriminators() {
	if (discriminatorsRegistered) {
		return;
	}

	try {
		const baseModel = mongoose.models.system_content_structure as Model<ContentStructureDocument>;
		if (!baseModel) {
			throw new Error('Base model system_content_structure not found. It must be created before registering discriminators.');
		}

		if (!baseModel.discriminators) {
			baseModel.discriminators = {};
		}

		if (!baseModel.discriminators['category']) {
			baseModel.discriminator('category', new Schema<CategoryDocument>({}, { _id: false }));
			logger.debug('CONTENT_STRUCTURE_CATEGORY_DISCRIMINATOR_REGISTERED');
		}

		if (!baseModel.discriminators['collection']) {
			baseModel.discriminator('collection', new Schema<CollectionDocument>({}, { _id: false }));
			logger.debug('CONTENT_STRUCTURE_COLLECTION_DISCRIMINATOR_REGISTERED');
		}

		discriminatorsRegistered = true;
	} catch (error) {
		logger.error('CONTENT_STRUCTURE_DISCRIMINATOR_REGISTRATION_ERROR', error);
		// Don't re-throw during initialization, as it can crash the server start-up.
	}
}

// --- Model Export ---

// Force model recreation to ensure schema changes take effect (especially _id: false)
if (mongoose.models.system_content_structure) {
	delete mongoose.models.system_content_structure;
}

// Create the model
export const ContentStructureModel = mongoose.model<
	ContentStructureDocument,
	Model<ContentStructureDocument, object, object, object, object, object> & typeof contentStructureSchema.statics
>('system_content_structure', contentStructureSchema);
