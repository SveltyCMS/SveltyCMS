/**
 * @file src/databases/mongodb/models/draft.ts
 * @description MongoDB schema and model for Drafts.
 *
 * This module defines a schema and model for Drafts in the MongoDB database.
 * A Draft is a version of a document that is not yet published.
 */

import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { ContentDraft, DatabaseResult } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Define the Draft schema
export const draftSchema = new Schema<ContentDraft>(
	{
		_id: { type: String, required: true }, // UUID as per dbInterface.ts
		contentId: { type: String, required: true }, //ContentId of the draft
		data: { type: Schema.Types.Mixed, required: true }, // Content of the draft
		version: { type: Number, default: 1 }, // Version number for drafts, starting at 1
		status: { type: String, enum: ['draft', 'review', 'archived'], default: 'draft' }, // Status options from ContentDraft
		authorId: { type: String, required: true }, // Changed to String type in schema
		createdAt: { type: Date, default: Date.now }, // Default createdAt timestamp
		updatedAt: { type: Date, default: Date.now } // Default updatedAt timestamp
	},
	{
		timestamps: true, // Enable timestamps for createdAt and updatedAt
		collection: 'content_drafts',
		strict: true // Enforce strict schema validation
	}
);

// Indexes for Drafts
draftSchema.index({ contentId: 1 }); // Index for finding drafts by contentId
draftSchema.index({ authorId: 1, status: 1 }); // Index for drafts by author and status
draftSchema.index({ status: 1, updatedAt: -1 }); // Index for draft status and recency

// Static methods
draftSchema.statics = {
	//Get drafts for a specific content ID
	async getDraftsForContent(contentId: string): Promise<DatabaseResult<ContentDraft[]>> {
		try {
			const drafts = await this.find({ contentId }).lean().exec();
			return { success: true, data: drafts };
		} catch (error) {
			logger.error(`Error retrieving drafts for content ID: ${contentId}: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'DRAFT_FETCH_ERROR',
					message: `Failed to retrieve drafts for content ID: ${contentId}`
				}
			};
		}
	},

	//Bulk delete drafts for a list of content IDs
	async bulkDeleteDraftsForContent(contentIds: string[]): Promise<DatabaseResult<number>> {
		try {
			const result = await this.deleteMany({ contentId: { $in: contentIds } }).exec();
			logger.info(`Bulk deleted ${result.deletedCount} drafts for content IDs: ${contentIds.join(', ')}`);
			return { success: true, data: result.deletedCount };
		} catch (error) {
			logger.error(`Error bulk deleting drafts for content IDs: ${error.message}`);
			return {
				success: false,
				error: {
					code: 'DRAFT_BULK_DELETE_ERROR',
					message: 'Failed to bulk delete drafts',
					details: error
				}
			};
		}
	},

	// Create a new draft
	async createDraft(draftData: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>> {
		try {
			const newDraft = await this.create({ ...draftData, _id: this.utils.generateId() });
			return { success: true, data: newDraft.toObject() };
		} catch (error) {
			logger.error(`Error creating draft: ${error.message}`);
			return {
				success: false,
				error: { code: 'DRAFT_CREATE_ERROR', message: 'Failed to create draft', details: error }
			};
		}
	},

	// Update a draft by its ID
	async updateDraft(draftId: DatabaseId, updateData: Partial<ContentDraft>): Promise<DatabaseResult<void>> {
		try {
			const result = await this.updateOne({ _id: draftId }, { $set: { ...updateData, updatedAt: new Date() } }).exec();
			if (result.modifiedCount === 0) {
				return {
					success: false,
					error: {
						code: 'DRAFT_UPDATE_NOT_FOUND',
						message: `Draft with ID "${draftId}" not found or no changes applied.`
					}
				};
			}
			logger.info(`Draft "${draftId}" updated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error updating draft "${draftId}": ${error.message}`);
			return {
				success: false,
				error: {
					code: 'DRAFT_UPDATE_ERROR',
					message: `Failed to update draft "${draftId}"`,
					details: error
				}
			};
		}
	},

	// Delete a draft by its ID
	async deleteDraft(draftId: DatabaseId): Promise<DatabaseResult<void>> {
		try {
			const result = await this.deleteOne({ _id: draftId }).exec();
			if (result.deletedCount === 0) {
				return {
					success: false,
					error: {
						code: 'DRAFT_DELETE_NOT_FOUND',
						message: `Draft with ID "${draftId}" not found.`
					}
				};
			}
			logger.info(`Draft "${draftId}" deleted successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error deleting draft "${draftId}": ${error.message}`);
			return {
				success: false,
				error: {
					code: 'DRAFT_DELETE_ERROR',
					message: `Failed to delete draft "${draftId}"`,
					details: error
				}
			};
		}
	}
};

// Create and export the DraftModel
export const DraftModel = (mongoose.models?.Draft as Model<ContentDraft> | undefined) || mongoose.model<ContentDraft>('Draft', draftSchema);
