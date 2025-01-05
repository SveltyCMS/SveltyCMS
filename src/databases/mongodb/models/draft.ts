/**
 * @file src/databases/mongodb/models/draft.ts
 * @description MongoDB schema and model for Drafts.
 *
 * This module defines a schema and model for Drafts in the MongoDB database.
 * A Draft is a version of a document that is not yet published.
 *
 */

import mongoose, { Schema } from 'mongoose';
import type { Draft } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Define the Draft schema
export const draftSchema = new Schema(
  {
    originalDocumentId: { type: Schema.Types.Mixed, required: true }, // Or Schema.Types.String
    collectionId: { type: Schema.Types.Mixed, required: true }, // The ID of the collection
    content: { type: Schema.Types.Mixed, required: true }, // The content of the draft
    status: { type: String, enum: ['draft', 'published'], default: 'draft' }, // Status of the draft
    createdBy: { type: Schema.Types.Mixed, ref: 'auth_users', required: true } // The user who created the draft
  },
  { timestamps: false, collection: 'collection_drafts' }
);

// Static methods for the Draft model
draftSchema.statics = {
  // Create a new draft
  async createDraft(content: Record<string, unknown>, collectionId: string, original_document_id: string, user_id: string): Promise<Draft> {
    try {
      const draft = new this({
        originalDocumentId: original_document_id,
        collectionId: collectionId,
        content,
        createdBy: user_id
      });
      await draft.save();
      logger.info(`Draft created successfully for document ID: ${original_document_id}`);
      return draft.toObject() as Draft;
    } catch (error) {
      logger.error(`Error creating draft: ${error.message}`);
      throw Error(`Error creating draft`);
    }
  },

  // Update a draft
  async updateDraft(draft_id: string, content: Record<string, unknown>): Promise<Draft> {
    try {
      const draft = await this.findById(draft_id);
      if (!draft) throw Error('Draft not found');

      // Update the draft content and timestamp
      draft.content = content;
      draft.updatedAt = new Date();
      await draft.save();

      logger.info(`Draft ${draft_id} updated successfully.`);
      return draft.toObject() as Draft;
    } catch (error) {
      logger.error(`Error updating draft: ${error.message}`);
      throw Error(`Error updating draft`);
    }
  },

  // Publish a draft
  async publishDraft(draft_id: string): Promise<Draft> {
    try {
      const draft = await this.findById(draft_id);
      if (!draft) throw Error('Draft not found');
      draft.status = 'published';
      await draft.save();
      logger.info(`Draft ${draft_id} published successfully.`);
      return draft.toObject() as Draft;
    } catch (error) {
      logger.error(`Error publishing draft: ${error.message}`);
      throw Error(`Error publishing draft`);
    }
  },

  // Get drafts by user
  async getDraftsByUser(user_id: string): Promise<Draft[]> {
    try {
      const drafts = await this.find({ createdBy: user_id }).exec();
      logger.info(`Retrieved ${drafts.length} drafts for user ID: ${user_id}`);
      return drafts;
    } catch (error) {
      logger.error(`Error retrieving drafts for user ${user_id}: ${error.message}`);
      throw Error(`Error retrieving drafts for user ${user_id}`);
    }
  }
};

// Create and export the Draft model
export const DraftModel = mongoose.models?.Draft || mongoose.model<Draft>('Draft', draftSchema);
