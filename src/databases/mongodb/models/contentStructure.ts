/**
 * @file src/databases/mongodb/models/contentStructure.ts
 * @description MongoDB schema and model for Content Structure.
 *
 * This module defines a schema and model for Content Structure in the MongoDB database.
 * Content Structure represents the hierarchical organization of content in the CMS.
 */
import mongoose, { Schema, Model, Document } from 'mongoose';
import type { Translation, Category, CollectionData } from '@src/content/types';
import { v4 as uuidv4 } from 'uuid';

// System Logger
import { logger } from '@utils/logger.svelte';
import { publicEnv } from '@root/config/public';



// Document interfaces
interface CategoryDocument extends Document, Omit<Category, '_id'> {
	type: 'category';
	collections?: CollectionData[];
	subcategories?: Record<string, Category>;
}

interface CollectionDocument extends Document, Omit<CollectionData, '_id'> {
	type: 'collection';
}

type ContentStructureDocument = CategoryDocument | CollectionDocument;

// Model interface
interface ContentStructureModel extends Model<ContentStructureDocument> {
	upsertCategory(category: Category): Promise<CategoryDocument>;
	upsertCollection(collection: CollectionData): Promise<CollectionDocument>;
	getNodeByPath(path: string): Promise<ContentStructureDocument | null>;
	getChildren(parentPath: string): Promise<ContentStructureDocument[]>;
}

// Schema definitions
const translationSchema = new Schema<Translation>({
	languageTag: { type: String, required: true },
	translationName: { type: String, required: true },
	isDefault: { type: Boolean, default: false }
}, { _id: false });

// Schema for nested collections
const collectionItemSchema = new Schema({
	_id: { type: String, required: true }, // UUID from compiled collection
	name: { type: String, required: true },
	label: { type: String }, // Optional display label
	path: { type: String, required: true }, // Always starts with /collections/
	icon: { type: String, default: 'bi:file-text' }, // Default icon for collections
	order: { type: Number, default: 999 },
	translations: [translationSchema],
	fields: [{ type: Schema.Types.Mixed }] // Collection fields
}, { _id: false });

// Schema for nested subcategories
const subcategorySchema = new Schema({
	_id: { type: String, required: true },
	name: { type: String, required: true },
	path: { type: String, required: true },
	icon: { type: String, default: 'bi:folder' },
	order: { type: Number, default: 999 },
	isCategory: { type: Boolean, default: true },
	translations: [translationSchema]
}, { _id: false });

// Base fields shared between categories and collections
const baseFields = {
	_id: { type: String, required: true },
	name: { type: String, required: true },
	path: { type: String, required: true },
	icon: { type: String, default: 'bi:folder' },
	order: { type: Number, default: 999 },
	translations: [translationSchema],
	collections: [collectionItemSchema], // Nested collections
	subcategories: [subcategorySchema] // Nested subcategories
};

// Category-specific schema
const categorySchema = new Schema({
	...baseFields,
	isCategory: { type: Boolean, default: true }
});

// Collection-specific schema
const collectionSchema = new Schema({
	...baseFields,
	label: String,
	permissions: Schema.Types.Mixed,
	livePreview: Boolean,
	strict: Boolean,
	revision: Boolean,
	fields: [Schema.Types.Mixed],
	description: String,
	slug: String,
	status: {
		type: String,
		enum: ['draft', 'published', 'unpublished', 'scheduled', 'cloned']
	},
	links: [String]
});

// Combined schema using discriminator
const contentStructureSchema = new Schema({
	_id: { type: String, required: true },
	...baseFields,
	type: { type: String, required: true, enum: ['category', 'collection'] },
	parentPath: { type: String, default: null }
}, {
	timestamps: true,
	collection: 'system_content_structure',
	discriminatorKey: 'type'
});


// Indexes
contentStructureSchema.index({ path: 1 }, { unique: true });
contentStructureSchema.index({ parentPath: 1 });
contentStructureSchema.index({ type: 1 });

// Static methods for the ContentStructure model
contentStructureSchema.statics = {
	async upsertCategory(category: Category): Promise<CategoryDocument> {
		const parentPath = category.path.split('/').slice(0, -1).join('/') || null;

		return this.findOneAndUpdate(
			{ path: category.path },
			{
				$set: {
					...category,
					type: 'category',
					parentPath
				},
				$setOnInsert: {
					type: 'category'
				}
			},
			{ upsert: true, new: true }
		);
	},

	async upsertCollection(collection: CollectionData): Promise<CollectionDocument> {
		const parentPath = collection.path.split('/').slice(0, -1).join('/') || null;

		return this.findOneAndUpdate(
			{ path: collection.path },
			{
				$set: {
					...collection,
					type: 'collection',
					parentPath
				}
			},
			{ upsert: true, new: true }
		);
	},

	async getNodeByPath(path: string): Promise<ContentStructureDocument | null> {
		return this.findOne({ path });
	},

	async getChildren(parentPath: string): Promise<ContentStructureDocument[]> {
		return this.find({ parentPath }).sort({ order: 1 });
	}
};

// Create the base model
const BaseContentStructure = mongoose.model<ContentStructureDocument, ContentStructureModel>(
	'system_content_structure',
	contentStructureSchema
);

// Create discriminators for categories and collections
BaseContentStructure.discriminator('category', categorySchema);
BaseContentStructure.discriminator('collection', collectionSchema);

// Export the model
export const ContentStructureModel = BaseContentStructure;

// Function to process file structure
export async function processFileStructure(compiledFiles: string[]) {
	try {
		for (const filePath of compiledFiles) {
			const relativePath = filePath.replace('compiledCollections/', '');
			const pathParts = relativePath.split('/');

			// Process directories as categories
			let currentPath = '';
			for (let i = 0; i < pathParts.length - 1; i++) {
				currentPath = currentPath ? `${currentPath}/${pathParts[i]}` : pathParts[i];

				const category: Category = {
					_id: uuidv4(),
					name: pathParts[i],
					path: currentPath,
					icon: 'bi:folder',
					order: 999,
					isCategory: true,
					translations: [{
						languageTag: publicEnv.DEFAULT_LANGUAGE,
						translationName: pathParts[i]
					}]
				};

				await ContentStructureModel.upsertCategory(category);
			}

			// Process the file as a collection
			const fileName = pathParts[pathParts.length - 1].replace('.js', '');
			const collectionPath = relativePath.replace('.js', '');

			// Import and process the collection file
			const collectionData: CollectionData = {
				_id: collection.id,
				name: fileName,
				path: collectionPath,
				icon: collection.icon || 'bi:file-text',
				order: collection.order || 999,
				translations: collection.translations || [{
					languageTag: publicEnv.DEFAULT_LANGUAGE,
					translationName: fileName
				}],
				fields: collection.fields || [],
				permissions: collection.permissions,
				livePreview: collection.livePreview,
				strict: collection.strict,
				revision: collection.revision,
				description: collection.description,
				slug: collection.slug,
				status: collection.status,
				links: collection.links
			};

			await ContentStructureModel.upsertCollection(collectionData);
		}
	} catch (error) {
		logger.error(`Error deleting content structure: ${error.message}`);
		throw error;
	}
}
