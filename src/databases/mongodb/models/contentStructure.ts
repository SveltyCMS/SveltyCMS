/**
 * @file src/databases/mongodb/models/contentStructure.ts
 * @description MongoDB schema and model for Content Structure.
 *
 * This module defines a schema and model for Content Structure in the MongoDB database.
 * Content Structure represents the hierarchical organization of content in the CMS.
 */
import mongoose, { Schema, Model } from 'mongoose';
import type { Translation, Category, CollectionData } from '@src/content/types';

interface ContentStructureNode {
	_id: string;
	name: string;
	path: string;
	icon: string;
	order: number;
	nodeType: 'category' | 'collection';
	parentPath: string | null;
}

// Document interfaces
interface CategoryDocument extends ContentStructureNode {
	nodeType: 'category';
}

interface CollectionDocument extends ContentStructureNode {
	nodeType: 'collection';
	label: string;
	permissions: Record<string, unknown>;
	livePreview: boolean;
	strict: boolean;
	revision: boolean;
	description: string;
	slug: string;
	status: 'draft' | 'published' | 'unpublished' | 'scheduled' | 'cloned';
	links: string[];
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
	_id: { type: String, required: true },
	name: { type: String, required: true },
	path: { type: String, required: true },
	icon: { type: String, default: 'bi:folder' },
	order: { type: Number, default: 999 },
	nodeType: { type: String, required: true, enum: ['category', 'collection'] },
	translations: [translationSchema],
	parentPath: { type: String, default: null }
};

// Category-specific schema
const categorySchema = new Schema<CategoryDocument>({
	...baseFields
});

// Collection-specific schema
const collectionSchema = new Schema<CollectionDocument>({
	...baseFields,
	label: String,
	permissions: Schema.Types.Mixed,
	livePreview: Boolean,
	strict: Boolean,
	revision: Boolean,
	description: String,
	slug: String,
	status: {
		type: String,
		enum: ['draft', 'published', 'unpublished', 'scheduled', 'cloned']
	},
	links: [String]
});

// Combined schema using discriminator
const contentStructureSchema = new Schema<ContentStructureDocument>(
	{
		...baseFields,
		nodeType: { type: String, required: true, enum: ['category', 'collection'] },
		parentPath: { type: String, default: null }
	},
	{
		timestamps: true,
		collection: 'system_content_structure',
		discriminatorKey: 'type'
	}
);

// Indexes
contentStructureSchema.index({ path: 1 }, { unique: true });
contentStructureSchema.index({ parentPath: 1 });
contentStructureSchema.index({ type: 1 });

// Static methods for the ContentStructure model
contentStructureSchema.statics = {
	async upsertCategory(category: Category): Promise<CategoryDocument> {
		const { _id, ...updateData } = category; // Separate _id from the rest
		const parentPath = updateData.path.split('/').slice(0, -1).join('/') || null;
		const targetPath = updateData.path;

		// --- CONFLICT CHECK START ---
		const conflictingNode = await this.findOne({ path: targetPath, _id: { $ne: _id } }).lean();
		if (conflictingNode) {
			const errorMsg = `Path conflict: Cannot update node \u001b[34m${_id}\u001b[0m to path '\u001b[34m${targetPath}\u001b[0m' because it is already used by node \u001b[34m${conflictingNode._id}\u001b[0m.`;
			console.error(errorMsg); // Use console.error for visibility during startup
			throw new Error(errorMsg);
		}
		// --- CONFLICT CHECK END ---

		// --- MODIFICATION START ---
		return this.findOneAndUpdate(
			{ _id: _id }, // <-- Query by _id
			{
				$set: {
					// Explicitly set fields to update, excluding _id
					name: updateData.name,
					path: updateData.path,
					icon: updateData.icon || 'bi:folder', // Ensure defaults
					order: updateData.order || 999, // Ensure defaults
					translations: updateData.translations || [], // Ensure defaults
					nodeType: 'category', // Set nodeType
					parentPath // Set calculated parentPath
				}
			},
			{ upsert: true, new: true, setDefaultsOnInsert: true } // Use setDefaultsOnInsert for creation
		).lean();
		// --- MODIFICATION END ---
	},

	async upsertCollection(collection: CollectionData): Promise<CollectionDocument> {
		const { _id, ...updateData } = collection; // Separate _id from the rest
		const parentPath = updateData.path.split('/').slice(0, -1).join('/') || null;
		const targetPath = updateData.path;

		// --- CONFLICT CHECK START ---
		const conflictingNode = await this.findOne({ path: targetPath, _id: { $ne: _id } }).lean();
		if (conflictingNode) {
			const errorMsg = `Path conflict: Cannot update node \u001b[34m${_id}\u001b[0m to path '\u001b[34m${targetPath}\u001b[0m' because it is already used by node \u001b[34m${conflictingNode._id}\u001b[0m.`;
			console.error(errorMsg); // Use console.error for visibility during startup
			throw new Error(errorMsg);
		}
		// --- CONFLICT CHECK END ---

		// --- MODIFICATION START ---
		return this.findOneAndUpdate(
			{ _id: _id }, // <-- Query by _id
			{
				$set: {
					// Explicitly set fields to update, excluding _id
					name: updateData.name,
					path: updateData.path,
					icon: updateData.icon || 'bi:file-earmark-text', // Ensure defaults
					order: updateData.order || 999, // Ensure defaults
					translations: updateData.translations || [], // Ensure defaults
					label: updateData.label,
					permissions: updateData.permissions,
					livePreview: updateData.livePreview,
					strict: updateData.strict,
					revision: updateData.revision,
					description: updateData.description,
					slug: updateData.slug,
					// status: updateData.status, // Status might not be set here? Check if needed.
					// links: updateData.links,   // Links might not be set here? Check if needed.
					nodeType: 'collection', // Set nodeType
					parentPath // Set calculated parentPath
				}
			},
			{ upsert: true, new: true, setDefaultsOnInsert: true } // Use setDefaultsOnInsert for creation
		).lean();
		// --- MODIFICATION END ---
	},

	async getNodeByPath(path: string): Promise<ContentStructureDocument | null> {
		return this.findOne({ path });
	},

	async getChildren(parentPath: string): Promise<ContentStructureDocument[]> {
		return this.find({ parentPath }).sort({ order: 1 });
	}
};

// Create the base model only if it doesn't already exist
const BaseContentStructure =
	mongoose.models.system_content_structure ||
	mongoose.model<ContentStructureDocument, ContentStructureModel>('system_content_structure', contentStructureSchema);

// Create discriminators for categories and collections only if they don't exist on the model
// Check if discriminators already exist before adding them
if (!BaseContentStructure.discriminators?.category) {
	BaseContentStructure.discriminator('category', categorySchema);
}
if (!BaseContentStructure.discriminators?.collection) {
	BaseContentStructure.discriminator('collection', collectionSchema);
}

// Export the model
export const ContentStructureModel = BaseContentStructure as ContentStructureModel; // Cast needed because of the conditional definition
