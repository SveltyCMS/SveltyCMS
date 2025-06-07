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

// System Logger
import { logger } from '@utils/logger.svelte';

// Define the Revision schema
export const revisionSchema = new Schema<ContentRevision>(
	{
		_id: { type: String, required: true }, // UUID as per dbInterface.ts
		contentId: { type: String, required: true }, // Renamed to contentId, DatabaseId of content
		data: { type: Schema.Types.Mixed, required: true }, // Content of the revision
		version: { type: Number, required: true }, // Version number of the revision
		commitMessage: String, // Optional commit message for the revision
		authorId: { type: String, required: true }, // DatabaseId of author
		createdAt: { type: Date, default: Date.now },
		updatedAt: { type: Date, default: Date.now }
	},
	{
		timestamps: true, // Enable timestamps for createdAt and updatedAt
		collection: 'content_revisions',
		strict: true // Enforce strict schema validation
	}
);

// Indexes
revisionSchema.index({ contentId: 1 }); // Index for finding revisions by contentId
revisionSchema.index({ version: -1 }); // Index on version for descending queries

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
			logger.error(`Error retrieving revision history for content ID: ${contentId}: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'REVISION_HISTORY_ERROR',
					message: `Failed to retrieve revision history for content ID: ${contentId}`
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
			logger.error(`Error bulk deleting revisions for content IDs: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'REVISION_BULK_DELETE_ERROR',
					message: 'Failed to bulk delete revisions',
					details: error
				}
			};
		}
	},

	// Create a new revision
	async createRevision(revisionData: Omit<ContentRevision, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentRevision>> {
		try {
			const newRevision = await this.create({ ...revisionData, _id: this.utils.generateId() });
			// ISODateString conversion for revision.create
			const revisionWithISODates = {
				...newRevision.toObject(),
				createdAt: newRevision.createdAt.toISOString() as ISODateString,
				updatedAt: newRevision.updatedAt.toISOString() as ISODateString
			} as ContentRevision;
			return { success: true, data: revisionWithISODates };
		} catch (error) {
			logger.error(`Error creating revision: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'REVISION_CREATE_ERROR',
					message: 'Failed to create revision',
					details: error
				}
			};
		}
	},

	// Update a revision by its ID
	async updateRevision(revisionId: DatabaseId, updateData: Partial<ContentRevision>): Promise<DatabaseResult<void>> {
		try {
			const result = await this.updateOne({ _id: revisionId }, { $set: { ...updateData, updatedAt: new Date() } }).exec();
			if (result.modifiedCount === 0) {
				return {
					success: false,
					error: {
						code: 'REVISION_UPDATE_NOT_FOUND',
						message: `Revision with ID "${revisionId}" not found or no changes applied.`
					}
				};
			}
			logger.info(`Revision "${revisionId}" updated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error updating revision "${revisionId}": ${error.message}`);
			return {
				success: false,
				error: {
					code: 'REVISION_UPDATE_ERROR',
					message: `Failed to update revision "${revisionId}"`,
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
				return {
					success: false,
					error: {
						code: 'REVISION_DELETE_NOT_FOUND',
						message: `Revision with ID "${revisionId}" not found.`
					}
				};
			}
			logger.info(`Revision "${revisionId}" deleted successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error deleting revision "${revisionId}": ${error.message}`);
			return {
				success: false,
				error: {
					code: 'REVISION_DELETE_ERROR',
					message: `Failed to delete revision "${revisionId}"`,
					details: error
				}
			};
		}
	}
};

// Create and export the RevisionModel
export const RevisionModel =
	(mongoose.models?.Revision as Model<ContentRevision> | undefined) || mongoose.model<ContentRevision>('Revision', revisionSchema);
