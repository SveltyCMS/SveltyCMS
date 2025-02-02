/**
 * @file src/databases/mongodb/models/draft.ts
 * @description MongoDB schema and model for Drafts.
 *
 * This module defines a schema and model for Drafts in the MongoDB database.
 * A Draft is a version of a document that is not yet published.
 *
 */

import mongoose, { Schema, Model } from 'mongoose';
import type { ContentDraft, DatabaseId } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Define the Draft schema 
export const draftSchema = new Schema<ContentDraft>(
  {
    _id: { type: DatabaseId, required: true }, // Using DatabaseId as UUID type
    contentId: { type: DatabaseId, required: true }, // Renamed and typed to contentId, DatabaseId
    data: { type: Schema.Types.Mixed, required: true },
    version: { type: Number, default: 1 }, // Version number for drafts, starting at 1
    status: { type: String, enum: ['draft', 'review', 'archived'], default: 'draft' }, // Status options from ContentDraft
    authorId: { type: DatabaseId, required: true }, // DatabaseId of author
  },
  {
    timestamps: true, // Enable timestamps for createdAt and updatedAt
    collection: 'content_drafts',
    strict: false // Allow for potential extra fields
  }
);

// Indexes for Drafts
draftSchema.index({ contentId: 1 }); // Index for finding drafts by contentId
draftSchema.index({ authorId: 1, status: 1 }); // Index for drafts by author and status
draftSchema.index({ status: 1, updatedAt: -1 }); // Index for draft status and recency

// Static methods (Simplified - focused on specialized queries if needed)
draftSchema.statics = {
  // --- CRUD Actions (Delegated to MongoDBAdapter) ---
  // In this simplified model, create, update, publish, and delete are
  // primarily handled by the MongoDBAdapter using core CRUD methods and QueryBuilder.
  // The model focuses on specific queries if needed.

  // --- Specialized Queries ---

  // Get drafts for a specific content ID - Keep for direct access if needed
  async getDraftsForContent(contentId: string): Promise<ContentDraft[]> { // Use ContentDraft interface
    try {
      if (!this.dbAdapter) {
        throw new Error('Database adapter is not initialized.');
      }
      const result = await this.dbAdapter.queryBuilder<ContentDraft>('Draft')
        .where({ contentId })
        .execute();

      if (!result.success) {
        logger.error(`Error retrieving drafts for content ID: ${contentId}: ${result.error?.message}`);
        throw new Error(`Failed to retrieve drafts: ${result.error?.message}`);
      }

      logger.debug(`Retrieved drafts for content ID: ${contentId}`);
      return result.data as ContentDraft[]; // Type assertion
    } catch (error) {
      logger.error(`Error retrieving drafts for content ID: ${error.message}`);
      throw error;
    }
  },

  // --- Utility/Bulk Operations (Example - adjust if needed) ---
  // Example: Bulk delete drafts for a content ID - Adjust or remove if not needed
  async bulkDeleteDraftsForContent(contentIds: string[]): Promise<DatabaseResult<number>> { // Using DatabaseResult
    try {
      const result = await this.deleteMany({ contentId: { $in: contentIds } }).exec();
      logger.info(`Bulk deleted ${result.deletedCount} drafts for content IDs: ${contentIds.join(', ')}`);
      return { success: true, data: result.deletedCount }; // Return DatabaseResult
    } catch (error) {
      logger.error(`Error bulk deleting drafts for content IDs: ${error.message}`);
      return { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to bulk delete drafts', details: error } as DatabaseError }; // Use DatabaseError
    }
  }
};

// Create and export the DraftModel
export const DraftModel =
  (mongoose.models?.Draft as Model<ContentDraft> | undefined) || mongoose.model<ContentDraft>('Draft', draftSchema); // Use ContentDraft type
