/**
 * @file src/databases/mongodb/models/contentStructure.ts
 * @description MongoDB schema and model for Content Structure.
 *
 * This module defines a schema and model for Content Structure in the MongoDB database.
 * Content Structure represents the hierarchical organization of content in the CMS.
 */
import mongoose, { Schema } from 'mongoose';
import type { Translation, Category, CollectionData } from '@src/content/types';

// System Logger
import { logger } from '@utils/logger.svelte';

// Generic schema definition for Content Structure (database-agnostic)
export const contentStructureSchemaDefinition = {
  _id: { type: 'String', required: true },
  name: { type: 'String', required: true },
  path: { type: 'String', required: true },
  icon: { type: 'String', default: 'bi:folder' },
  order: { type: 'Number', default: 999 },
  nodeType: { type: 'String', required: true, enum: ['category', 'collection'] },
  translations: [
    {
      languageTag: { type: 'String', required: true },
      translationName: { type: 'String', required: true },
      isDefault: { type: 'Boolean', default: false }
    }
  ],
  parentPath: { type: 'String', default: null },
  label: { type: 'String' },
  permissions: { type: 'Mixed' },
  livePreview: { type: 'Boolean' },
  strict: { type: 'Boolean' },
  revision: { type: 'Boolean' },
  description: { type: 'String' },
  slug: { type: 'String' },
  status: {
    type: 'String',
    enum: ['draft', 'published', 'unpublished', 'scheduled', 'cloned']
  },
  links: [{ type: 'String' }],
  createdAt: { type: 'Date', default: 'now' },
  updatedAt: { type: 'Date', default: 'now' }
};


// MongoDB schema for Content Structure (using Mongoose types)
const translationSchema = new Schema<Translation>({
  languageTag: { type: String, required: true },
  translationName: { type: String, required: true },
  isDefault: { type: Boolean, default: false }
}, { _id: false });


// Base fields shared between categories and collections
const baseFields = {
  _id: { type: String, required: true },
  name: { type: String, required: true },
  path: { type: String, required: true },
  icon: { type: String, default: 'bi:folder' },
  order: { type: Number, default: 999 },
  nodeType: { type: String, required: true, enum: ['category', 'collection'] },
  translations: [translationSchema],
  parentPath: { type: String, default: null },
};

// Category-specific schema
const categorySchema = new Schema<CategoryDocument>({
  ...baseFields,
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
const contentStructureSchema = new Schema<ContentStructureDocument>({
  ...baseFields,
  nodeType: { type: String, required: true, enum: ['category', 'collection'] },
  parentPath: { type: String, default: null }
}, {
  timestamps: true,
  collection: 'system_content_structure',
  discriminatorKey: 'type',
});


// Indexes
contentStructureSchema.index({ path: 1 }, { unique: true });
contentStructureSchema.index({ parentPath: 1 });
contentStructureSchema.index({ type: 1 });
contentStructureSchema.index({ updatedAt: -1 });
contentStructureSchema.index({ 'translations.languageTag': 1 });


// Static methods for the ContentStructure model
contentStructureSchema.statics = {
  async upsertCategory(category: Category): Promise<CategoryDocument> {
    const parentPath = category.path.split('/').slice(0, -1).join('/') || null;

    return this.findOneAndUpdate(
      { path: category.path },
      {
        $set: {
          ...category,
          nodeType: 'category',
          parentPath
        },
      },
      { upsert: true, new: true }
    ).lean();
  },

  async upsertCollection(collection: CollectionData): Promise<CollectionDocument> {
    const parentPath = collection.path.split('/').slice(0, -1).join('/') || null;

    return this.findOneAndUpdate(
      { path: collection.path },
      {
        $set: {
          ...collection,
          nodeType: 'collection',
          parentPath
        }
      },
      { upsert: true, new: true }
    ).lean();
  },

  async getNodeByPath(path: string): Promise<ContentStructureDocument | null> {
    try {
      return await this.findOne({ path });
    } catch (error) {
      logger.error(`Error fetching node by path: ${path}`, error);
      return null;
    }
  },

  async getChildren(parentPath: string): Promise<ContentStructureDocument[]> {
    try {
      return await this.find({ parentPath }).sort({ order: 1 });
    } catch (error) {
      logger.error(`Error fetching children for parent path: ${parentPath}`, error);
      return [];
    }
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