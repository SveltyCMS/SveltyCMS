/**
 * @file src/databases/mongodb/models/media.ts
 * @description MongoDB schema and model for Media.
 *
 * This module defines a schema and model for media files in the CMS.
 * Media files include images, videos, documents, and other file types.
 */

import mongoose, { Schema, Model } from 'mongoose';

import type { MediaItem } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Media schema
export const mediaSchema = new Schema(
  {
    _id: { type: String, required: true }, // Mongoose String type
    filename: { type: String, required: true }, // Mongoose String type
    originalFilename: String, // Mongoose String type
    path: { type: String, required: true }, // Mongoose String type
    type: { type: String, required: true }, // Mongoose String type
    mimeType: String, // Mongoose String type
    size: { type: Number, required: true }, // Mongoose Number type
    dimensions: {
      width: Number, // Mongoose Number type
      height: Number // Mongoose Number type
    },
    metadata: {
      title: String, // Mongoose String type
      description: String, // Mongoose String type
      alt: String, // Mongoose String type
      caption: String, // Mongoose String type
      tags: [String], // Mongoose String array
      customFields: Schema.Types.Mixed // Mongoose Mixed type
    },
    folder: { type: String, default: '/' }, // Mongoose String type
    status: { type: String, enum: ['public', 'private', 'draft'], default: 'private' }, // Mongoose String type
    createdBy: String, // Mongoose String type
    updatedBy: String, // Mongoose String type
    updatedAt: { type: Date, default: Date.now } // Mongoose Date type
  },
  {
    timestamps: true,
    collection: 'system_media',
    strict: false
  }
);

// Indexes
mediaSchema.index({ filename: 1 });
mediaSchema.index({ type: 1 });
mediaSchema.index({ folder: 1 });
mediaSchema.index({ status: 1 });
mediaSchema.index({ 'metadata.tags': 1 });

// Static methods
mediaSchema.statics = {
  // --- CRUD Actions (Delegated to MongoDBAdapter) ---
  // In this simplified model, create, update, and delete are primarily
  // handled by the MongoDBAdapter using core CRUD methods and QueryBuilder.
  // The model focuses on specific queries if needed.

  // --- Specialized Queries ---

  // Get media by filename 
  async getMediaByFilename(filename: string): Promise<MediaItem | null> { // Use MediaItem interface
    try {
      const mediaItem = await this.findOne({ filename }).lean().exec() as MediaItem | null; // Type assertion
      logger.debug(`Retrieved media item by filename: ${filename}`);
      return mediaItem;
    } catch (error) {
      logger.error(`Error retrieving media item by filename: ${error.message}`);
      throw error;
    }
  },

  // Get media items by folderId 
  async getMediaByFolderId(folderId?: string): Promise<MediaItem[]> { // Use MediaItem interface
    try {
      if (!this.dbAdapter) {
        throw new Error('Database adapter is not initialized.');
      }
      const queryBuilder = this.dbAdapter.queryBuilder<MediaItem>('media_collection'); // Use dynamic media model
      if (folderId) {
        queryBuilder.where({ folderId });
      }
      const result = await queryBuilder.execute();

      if (!result.success) {
        logger.error(`Error retrieving media items for folder ID: ${folderId || 'root'}: ${result.error?.message}`);
        throw new Error(`Failed to retrieve media items: ${result.error?.message}`);
      }

      const mediaItems = result.data as MediaItem[]; // Type assertion
      logger.debug(`Retrieved media items for folder ID: ${folderId || 'root'}`);
      return mediaItems;
    } catch (error) {
      logger.error(`Error retrieving media items by folder ID: ${error.message}`);
      throw error;
    }
  },

  // --- Utility/Bulk Operations ---
  // Example: Bulk delete media items by folderId - Adjust or remove if not needed
  async bulkDeleteMediaByFolderId(folderIds: string[]): Promise<DatabaseResult<number>> { // Using DatabaseResult
    try {
      const result = await this.deleteMany({ folderId: { $in: folderIds } }).exec();
      logger.info(`Bulk deleted ${result.deletedCount} media items for folder IDs: ${folderIds.join(', ')}`);
      return { success: true, data: result.deletedCount }; // Return DatabaseResult
    } catch (error) {
      logger.error(`Error bulk deleting media items by folder IDs: ${error.message}`);
      return { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to bulk delete media items', details: error } as DatabaseError }; // Use DatabaseError
    }
  }
};

// Create and export the MediaModel
export const MediaModel =
  (mongoose.models?.MediaItem as Model<MediaItem> | undefined) || mongoose.model<MediaItem>('MediaItem', mediaSchema); // Use MediaItem type and name
