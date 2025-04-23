/**
 * @file src/databases/mongodb/models/contentStructure.ts
 * @description MongoDB schema and model for Content Structure.
 *
 * This module defines a schema and model for Content Structure in the MongoDB database.
 * Content Structure represents the hierarchical organization of content in the CMS.
 */
import mongoose, { Schema } from 'mongoose';
import type { Translation, ContentNode, DatabaseResult, DatabaseError } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';
import type { CollectionData } from '@root/src/content/types';

// Generic schema definition for Content Structure
export const contentStructureSchemaDefinition = {
	_id: { type: String, required: true, unique: true }, // UUID as per dbInterface.ts
	name: { type: String, required: true }, // Name of the content
	icon: { type: String, default: 'bi:folder' }, // Icon for the content
	order: { type: Number, default: 999 }, // Order of the content
	nodeType: { type: String, required: true, enum: ['category', 'collection'] }, // Type of the node
	translations: [
		{
			languageTag: { type: String, required: true },
			translationName: { type: String, required: true },
			isDefault: { type: Boolean, default: false }
		}
	],
	parentId: { type: String, default: null },
	label: { type: String }, // Label for the content
	permissions: Schema.Types.Mixed, // Permissions for the content
	livePreview: { type: Boolean }, // Live preview enabled
	strict: { type: Boolean }, // Strict mode
	revision: { type: Boolean }, // Revision mode
	description: { type: String }, // Description of the content
	slug: { type: String }, // Slug for the content
	status: {
		type: String,
		enum: ['draft', 'published', 'unpublished', 'scheduled', 'cloned']
	},
	links: [{ type: String }],
	createdAt: { type: Date, default: Date.now }, // Default createdAt timestamp
	updatedAt: { type: Date, default: Date.now } // Default updatedAt timestamp
};

// Translation schema
const translationSchema = new Schema<Translation>(
	{
		languageTag: { type: String, required: true },
		translationName: { type: String, required: true },
		isDefault: { type: Boolean, default: false }
	},
	{ _id: false }
);

// Base fields shared between categories and collections
const baseFields = {
	_id: { type: String, required: true, unique: true }, // UUID as per dbInterface.ts
	name: { type: String, required: true },
	icon: { type: String, default: 'bi:folder' },
	order: { type: Number, default: 999 },
	nodeType: { type: String, required: true, enum: ['category', 'collection'] },
	translations: [translationSchema],
	parentId: { type: String, default: null },
	createdAt: { type: Date, default: Date.now },
	updatedAt: { type: Date, default: Date.now }
};

// Combined schema using discriminator
const contentStructureSchema = new Schema<ContentStructureDocument>(
	{
		...baseFields,
		nodeType: { type: String, required: true, enum: ['category', 'collection'] },
		parentId: { type: String, default: null }
	},
	{
		timestamps: true,
		collection: 'system_content_structure',
		discriminatorKey: 'type'
	}
);

// Indexes
contentStructureSchema.index({ nodeType: 1 });
contentStructureSchema.index({ updatedAt: -1 });
contentStructureSchema.index({ 'translations.languageTag': 1 });

// aggregate
//

// Static methods for the ContentStructure model
contentStructureSchema.statics = {
	async getContentStructure(): Promise<DatabaseResult<ContentStructureDocument[]>> {
		try {
			const contentStructure = await this.find({}).lean();
			return { success: true, data: contentStructure };
		} catch (error) {
			logger.error('CONTENT_GET_CONTENT_STRUCTURE_ERROR', error);
			return { success: false, error: createDatabaseError(error, 'CONTENT_GET_CONTENT_STRUCTURE_ERROR', 'Error fetching content structure') };
		}
	},
	// Upsert a category
	async upsertCategory(category: ContentNode): Promise<DatabaseResult<CategoryDocument>> {
		try {
			const result = await this.findOneAndUpdate(
				{ _id: category._id },
				{
					$set: {
						...category,
						nodeType: 'category',
						parentId: category.parentId
					}
				},
				{ upsert: true, new: true }
			).lean();
			if (!result) {
				return {
					success: false,
					error: createDatabaseError(undefined, 'CONTENT_UPSERT_CATEGORY_ERROR', `Failed to upsert category: ${category.path}`)
				};
			}
			return { success: true, data: { ...result, _id: result._id.toString() } };
		} catch (error) {
			return { success: false, error: createDatabaseError(error, 'CONTENT_UPSERT_CATEGORY_ERROR', `Error upserting category: ${category.path}`) };
		}
	},

	// Upsert a collection
	async upsertCollection(collection: ContentNode): Promise<DatabaseResult<CollectionDocument>> {
		try {
			const result = await this.findOneAndUpdate(
				{ _id: collection._id },
				{
					$set: {
						...collection,
						nodeType: 'collection',
						parentId: collection.parentId
					}
				},
				{ upsert: true, new: true }
			).lean();
			if (!result) {
				return {
					success: false,
					error: createDatabaseError(undefined, 'CONTENT_UPSERT_COLLECTION_ERROR', `Failed to upsert collection: ${collection.path}`)
				};
			}
			return { success: true, data: { ...result, _id: result._id.toString() } };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'CONTENT_UPSERT_COLLECTION_ERROR', `Error upserting collection: ${collection.path}`)
			};
		}
	},

	// Get a node by its path
	async getNodeById(id: string): Promise<DatabaseResult<ContentStructureDocument | null>> {
		try {
			const node = await this.findOne({ _id: id }).lean();
			return { success: true, data: node };
		} catch (error) {
			return { success: false, error: createDatabaseError(error, 'CONTENT_GET_NODE_BY_PATH_ERROR', `Error fetching node by path: ${id}`) };
		}
	},

	// Get children of a node
	async getChildren(parentId: string): Promise<DatabaseResult<ContentStructureDocument[]>> {
		try {
			const children = await this.find({ parentId }).sort({ order: 1 }).lean();
			return { success: true, data: children };
		} catch (error) {
			return {
				success: false,
				error: createDatabaseError(error, 'CONTENT_GET_CHILDREN_ERROR', `Error fetching children for parent path: ${parentPath}`)
			};
		}
	}
};

// Utility function to handle DatabaseErrors consistently
const createDatabaseError = (error: unknown, code: string, message: string): DatabaseError => {
	logger.error(`${code}: ${message}`, error);
	return {
		code,
		message,
		details: error instanceof Error ? error.message : String(error),
		stack: error instanceof Error ? error.stack : undefined
	};
};

// Create the base model
const BaseContentStructure = mongoose.model<ContentStructureDocument, ContentStructureModel>('system_content_structure', contentStructureSchema);

// Create discriminators for categories and collections
BaseContentStructure.discriminator('category', new Schema<CategoryDocument>({}, { discriminatorKey: 'type' }));
BaseContentStructure.discriminator('collection', new Schema<CollectionDocument>({}, { discriminatorKey: 'type' }));

// Export the model
export const ContentStructureModel = BaseContentStructure;
