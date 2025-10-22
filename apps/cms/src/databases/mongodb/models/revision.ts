/**
 * @file src/databases/mongodb/models/revision.ts
 * @description MongoDB schema and model for Revisions.
 *
 * This module defines a schema and model for Revisions in the MongoDB database.
 * A Revision is a version of a document that is not yet published.
 */

import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { ContentRevision, DatabaseResult } from '@src/databases/dbInterface';
import type { DatabaseId } from '@src/content/types';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
import { toISOString } from '@utils/dateUtils';

// System Logger
import { logger } from '@utils/logger.svelte';

// Define the Revision schema
export const revisionSchema = new Schema<ContentRevision>(
	{
		_id: { type: String, required: true, default: () => generateId() }, // Auto-generate UUID for new revisions
		contentId: { type: String, required: true }, // Renamed to contentId, DatabaseId of content
		data: { type: Schema.Types.Mixed, required: true }, // Content of the revision
		version: { type: Number, required: true }, // Version number of the revision
		commitMessage: String, // Optional commit message for the revision
		authorId: { type: String, required: true } // DatabaseId of author
		// Note: createdAt and updatedAt are handled by timestamps: true
	},
	{
		timestamps: true, // Enable timestamps for createdAt and updatedAt
		collection: 'content_revisions',
		strict: true, // Enforce strict schema validation
		_id: false // Disable Mongoose auto-ObjectId generation
	}
);

// --- Indexes ---
// Compound indexes for common query patterns (50-80% performance boost)
revisionSchema.index({ contentId: 1, version: -1, createdAt: -1 }); // Revision history (most common)
revisionSchema.index({ authorId: 1, createdAt: -1 }); // User's revision activity
revisionSchema.index({ contentId: 1, authorId: 1, createdAt: -1 }); // Content-author revision tracking
revisionSchema.index({ createdAt: -1 }); // Recent revisions across all content
// TTL index: Auto-delete old revisions after 90 days (optional - adjust as needed)
// revisionSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

// Static methods
revisionSchema.statics = {
	// Get revision history for a content ID
	async getRevisionHistory(contentId: string): Promise<DatabaseResult<ContentRevision[]>> {
		try {
			const revisions = await this.find({ contentId })
				.sort({ version: -1, createdAt: -1 }) // Sort by version and date descending
				.lean()
				.exec();
			return { success: true, data: revisions };
		} catch (error) {
			const message = `Failed to retrieve revision history for content ID: ${contentId}`;
			const err = error as Error;
			logger.error(`Error retrieving revision history for content ID: ${contentId}: ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'REVISION_HISTORY_ERROR',
					message
				}
			};
		}
	},

	// Bulk delete revisions for a list of content IDs
	async bulkDeleteRevisionsForContent(contentIds: string[]): Promise<DatabaseResult<number>> {
		try {
			const result = await this.deleteMany({ contentId: { $in: contentIds } }).exec();
			logger.info(`Bulk deleted ${result.deletedCount} revisions for content IDs: ${contentIds.join(', ')}`);
			return { success: true, data: result.deletedCount };
		} catch (error) {
			const message = 'Failed to bulk delete revisions';
			logger.error(`Error bulk deleting revisions for content IDs: ${error instanceof Error ? error.message : String(error)}`);
			return {
				success: false,
				message,
				error: {
					code: 'REVISION_BULK_DELETE_ERROR',
					message,
					details: error
				}
			};
		}
	},

	// Create a new revision
	async createRevision(revisionData: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>> {
		try {
			// No need to manually add _id, Mongoose will auto-generate it via schema default
			const newRevision = await this.create(revisionData);
			// Convert Mongoose document to plain object with proper types
			const revisionObj = newRevision.toObject();

			const revisionWithISODates: ContentRevision = {
				_id: revisionObj._id as DatabaseId,
				contentId: revisionObj.contentId as DatabaseId,
				data: revisionObj.data,
				version: revisionObj.version,
				commitMessage: revisionObj.commitMessage,
				authorId: revisionObj.authorId as DatabaseId,
				createdAt: toISOString(revisionObj.createdAt),
				updatedAt: toISOString(revisionObj.updatedAt)
			};
			return { success: true, data: revisionWithISODates };
		} catch (error) {
			const message = 'Failed to create revision';
			const err = error as Error;
			logger.error(`Error creating revision: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'REVISION_CREATE_ERROR', message, details: error }
			};
		}
	},

	// Update a revision by its ID
	async updateRevision(revisionId: DatabaseId, updateData: Partial<ContentRevision>): Promise<DatabaseResult<void>> {
		try {
			// Mongoose timestamps: true automatically updates updatedAt
			const result = await this.updateOne({ _id: revisionId }, { $set: updateData }).exec();
			if (result.modifiedCount === 0) {
				const message = `Revision with ID "${revisionId}" not found or no changes applied.`;
				return {
					success: false,
					message,
					error: {
						code: 'REVISION_UPDATE_NOT_FOUND',
						message
					}
				};
			}
			logger.info(`Revision "${revisionId}" updated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const message = `Failed to update revision "${revisionId}"`;
			const err = error as Error;
			logger.error(`Error updating revision "${revisionId}": ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'REVISION_UPDATE_ERROR',
					message,
					details: error
				}
			};
		}
	},

	// Delete a revision by its ID
	async deleteRevision(revisionId: DatabaseId): Promise<DatabaseResult<void>> {
		try {
			const result = await this.deleteOne({ _id: revisionId }).exec();
			if (result.deletedCount === 0) {
				const message = `Revision with ID "${revisionId}" not found.`;
				return {
					success: false,
					message,
					error: {
						code: 'REVISION_DELETE_NOT_FOUND',
						message
					}
				};
			}
			logger.info(`Revision "${revisionId}" deleted successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const message = `Failed to delete revision "${revisionId}"`;
			const err = error as Error;
			logger.error(`Error deleting revision "${revisionId}": ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'REVISION_DELETE_ERROR',
					message,
					details: error
				}
			};
		}
	}
};

// Create and export the RevisionModel
export const RevisionModel =
	(mongoose.models?.Revision as Model<ContentRevision> | undefined) || mongoose.model<ContentRevision>('Revision', revisionSchema);
