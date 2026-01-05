/**
 * @file src/databases/mongodb/models/draft.ts
 * @description MongoDB schema and model for Drafts.
 *
 * This module defines a schema and model for Drafts in the MongoDB database.
 * A Draft is a version of a document that is not yet published.
 *
 * Features:
 * - Defines a schema for Drafts
 * - Defines a model for Drafts
 * - Defines static methods for Drafts
 * - Defines indexes for Drafts
 */

import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { ContentDraft, DatabaseResult } from '@src/databases/dbInterface';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
import type { DatabaseId } from '@src/content/types';

// System Logger
import { logger } from '@utils/logger';

// Define the Draft schema
export const draftSchema = new Schema<ContentDraft>(
	{
		_id: { type: String, required: true, default: () => generateId() }, // Auto-generate UUID for new drafts
		contentId: { type: String, required: true }, //ContentId of the draft
		data: { type: Schema.Types.Mixed, required: true }, // Content of the draft
		version: { type: Number, default: 1 }, // Version number for drafts, starting at 1
		status: { type: String, enum: ['draft', 'review', 'archived'], default: 'draft' }, // Status options from ContentDraft
		authorId: { type: String, required: true } // Changed to String type in schema
		// Note: createdAt and updatedAt are handled by timestamps: true
	},
	{
		timestamps: true, // Enable timestamps for createdAt and updatedAt
		collection: 'content_drafts',
		strict: true, // Enforce strict schema validation
		_id: false // Disable Mongoose auto-ObjectId generation
	}
);

// --- Indexes ---
// Compound indexes for common query patterns (50-80% performance boost)
draftSchema.index({ contentId: 1, version: -1 }); // Latest draft version for content
draftSchema.index({ authorId: 1, status: 1, updatedAt: -1 }); // Author's drafts by status
draftSchema.index({ status: 1, updatedAt: -1 }); // Draft management queries
draftSchema.index({ contentId: 1, status: 1, updatedAt: -1 }); // Content draft workflow
draftSchema.index({ authorId: 1, createdAt: -1 }); // Author's recent drafts

// Static methods
draftSchema.statics = {
	//Get drafts for a specific content ID
	async getDraftsForContent(contentId: string): Promise<DatabaseResult<ContentDraft[]>> {
		try {
			const drafts = await this.find({ contentId }).lean().exec();
			return { success: true, data: drafts };
		} catch (error) {
			const message = `Failed to retrieve drafts for content ID: ${contentId}`;
			logger.error(`Error retrieving drafts for content ID: ${contentId}: ${error instanceof Error ? error.message : String(error)}`);
			return {
				success: false,
				message,
				error: {
					code: 'DRAFT_FETCH_ERROR',
					message
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
			const message = 'Failed to bulk delete drafts';
			logger.error(`Error bulk deleting drafts for content IDs: ${error instanceof Error ? error.message : String(error)}`);
			return {
				success: false,
				message,
				error: {
					code: 'DRAFT_BULK_DELETE_ERROR',
					message,
					details: error
				}
			};
		}
	},

	// Create a new draft
	async createDraft(draftData: Omit<ContentDraft, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<ContentDraft>> {
		try {
			// No need to manually add _id, Mongoose will auto-generate it via schema default
			const newDraft = await this.create(draftData);
			return { success: true, data: newDraft.toObject() as unknown as ContentDraft };
		} catch (error) {
			const message = 'Failed to create draft';
			logger.error(`Error creating draft: ${error instanceof Error ? error.message : String(error)}`);
			return {
				success: false,
				message,
				error: { code: 'DRAFT_CREATE_ERROR', message, details: error }
			};
		}
	},

	// Update a draft by its ID
	async updateDraft(draftId: DatabaseId, updateData: Partial<ContentDraft>): Promise<DatabaseResult<void>> {
		try {
			// Mongoose timestamps: true automatically updates updatedAt
			const result = await this.updateOne({ _id: draftId }, { $set: updateData }).exec();
			if (result.modifiedCount === 0) {
				const message = `Draft with ID "${draftId}" not found or no changes applied.`;
				return {
					success: false,
					message,
					error: {
						code: 'DRAFT_UPDATE_NOT_FOUND',
						message
					}
				};
			}
			logger.info(`Draft "${draftId}" updated successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const message = `Failed to update draft "${draftId}"`;
			logger.error(`Error updating draft "${draftId}": ${error instanceof Error ? error.message : String(error)}`);
			return {
				success: false,
				message,
				error: {
					code: 'DRAFT_UPDATE_ERROR',
					message,
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
				const message = `Draft with ID "${draftId}" not found.`;
				return {
					success: false,
					message,
					error: {
						code: 'DRAFT_DELETE_NOT_FOUND',
						message
					}
				};
			}
			logger.info(`Draft "${draftId}" deleted successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const message = `Failed to delete draft "${draftId}"`;
			logger.error(`Error deleting draft "${draftId}": ${error instanceof Error ? error.message : String(error)}`);
			return {
				success: false,
				message,
				error: {
					code: 'DRAFT_DELETE_ERROR',
					message,
					details: error
				}
			};
		}
	}
};

// Create and export the DraftModel
export const DraftModel = (mongoose.models?.Draft as Model<ContentDraft> | undefined) || mongoose.model<ContentDraft>('Draft', draftSchema);
