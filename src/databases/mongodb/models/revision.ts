/**
 * @file src/databases/mongodb/models/revision.ts
 * @description MongoDB schema and model for Revisions.
 *
 * This module defines a schema and model for Revisions in the MongoDB database.
 * A Revision is a version of a document that is not yet published.
 */

import mongoose, { Schema, Model } from 'mongoose';
import type { ContentRevision } from '@src/databases/dbInterface';

// Define the Revision schema 
export const revisionSchema = new Schema<ContentRevision>( // Use ContentRevision interface
  {
    _id: { type: String, required: true }, // String _id as in dbInterface
    contentId: { type: String, required: true }, // Renamed to contentId, DatabaseId of content
    data: { type: Schema.Types.Mixed, required: true }, // Renamed to data, content of the revision
    version: { type: Number, required: true }, // Version number of the revision
    commitMessage: String, // Optional commit message for the revision
    authorId: { type: DatabaseId, required: true }, // Renamed to authorId, DatabaseId of author
  },
  {
    timestamps: true, // Enable timestamps for createdAt and updatedAt
    collection: 'content_revisions',
    strict: false // Allow for potential extra fields
  }
);

// Indexes 
revisionSchema.index({ contentId: 1 }); // Index for finding revisions by contentId
revisionSchema.index({ version: 1 }); // Index on version if you query by version often

// Static methods 
revisionSchema.statics = {
  // --- CRUD Actions (Delegated to MongoDBAdapter) ---
  // In this simplified model, create, get history, restore, and delete are
  // primarily handled by the MongoDBAdapter using core CRUD methods and QueryBuilder.
  // The model focuses on specific queries if needed.

  // --- Specialized Queries ---

  // Get revision history for a content ID 
  async getRevisionHistory(contentId: string): Promise<ContentRevision[]> { // Use ContentRevision interface
    try {
      if (!this.dbAdapter) {
        throw new Error('Database adapter is not initialized.');
      }
      const result = await this.dbAdapter.queryBuilder<ContentRevision>('Revision')
        .where({ contentId })
        .sort({ version: -1, createdAt: -1 }) // Sort by version and date descending
        .execute();

      if (!result.success) {
        logger.error(`Error retrieving revision history for content ID: ${contentId}: ${result.error?.message}`);
        throw new Error(`Failed to retrieve revision history: ${result.error?.message}`);
      }
      const revisions = result.data as ContentRevision[]; // Type assertion
      logger.debug(`Retrieved revision history for content ID: ${contentId}`);
      return revisions;
    } catch (error) {
      logger.error(`Error retrieving revision history: ${error.message}`);
      throw error;
    }
  },

  // --- Utility/Bulk Operations  ---
  // Example: Bulk delete revisions for content IDs - Adjust or remove if not needed
  async bulkDeleteRevisionsForContent(contentIds: string[]): Promise<DatabaseResult<number>> { // Using DatabaseResult
    try {
      const result = await this.deleteMany({ contentId: { $in: contentIds } }).exec();
      logger.info(`Bulk deleted ${result.deletedCount} revisions for content IDs: ${contentIds.join(', ')}`);
      return { success: true, data: result.deletedCount }; // Return DatabaseResult
    } catch (error) {
      logger.error(`Error bulk deleting revisions for content IDs: ${error.message}`);
      return { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to bulk delete revisions', details: error } as DatabaseError }; // Use DatabaseError
    }
  }
};

// Create and export the RevisionModel
export const RevisionModel =
  (mongoose.models?.Revision as Model<ContentRevision> | undefined) || mongoose.model<ContentRevision>('Revision', revisionSchema); // Use ContentRevision type
