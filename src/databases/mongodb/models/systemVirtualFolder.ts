/**
 * @file src/databases/mongodb/models/systemVirtualFolder.ts
 * @description MongoDB schema and model for System Virtual Folders.
 *
 * This module defines a schema and model for virtual folders in the system.
 * Virtual folders are used to organize content in a hierarchical structure.
 */

import mongoose, { Schema } from 'mongoose';
import type { SystemVirtualFolder } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// System virtual folder schema 
export const systemVirtualFolderSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    path: { type: String, required: true, unique: true },
    parent: { type: String, ref: 'SystemVirtualFolder' },
    icon: { type: String, default: 'bi:folder' },
    order: { type: Number, default: 0 },
    type: { type: String, enum: ['folder', 'collection'], required: true },
    metadata: Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    collection: 'system_virtual_folders',
    strict: false
  }
);

// ndexes
// systemVirtualFolderSchema.index({ path: 1 }, { unique: true }); // Commented out as in original code
systemVirtualFolderSchema.index({ parent: 1 });
systemVirtualFolderSchema.index({ type: 1 });
systemViIrtualFolderSchema.index({ order: 1 });

// Static methods
systemVirtualFolderSchema.statics = {
  // --- CRUD Actions (Delegated to MongoDBAdapter) ---
  // In this simplified model, create, update, and delete are primarily
  // handled by the MongoDBAdapter using core CRUD methods and QueryBuilder.
  // The model focuses on specific queries if needed.

  // --- Specialized Queries ---
  // Get virtual folder by path
  async getVirtualFolderByPath(path: string): Promise<MediaFolder | null> { // Use MediaFolder interface
    try {
      const folder = await this.findOne({ path }).lean().exec() as MediaFolder | null; // Type assertion
      logger.debug(`Retrieved virtual folder by path: ${path}`);
      return folder;
    } catch (error) {
      logger.error(`Error retrieving virtual folder by path: ${error.message}`);
      throw error;
    }
  },

  // Get children of a virtual folder 
  async getVirtualFolderChildren(parentPath: string): Promise<MediaFolder[]> { // Use MediaFolder interface
    try {
      if (!this.dbAdapter) {
        throw new Error('Database adapter is not initialized.');
      }
      const result = await this.dbAdapter.queryBuilder<MediaFolder>('SystemVirtualFolder')  // Use SystemVirtualFolderModel for virtual folders
        .where({
          path: { $regex: `^${parentPath}/[^/]+$` } // Regex condition directly in where clause
        })
        .sort({ order: 1 })
        .execute();

      if (!result.success) {
        logger.error(`Error retrieving virtual folder children for parent path: ${parentPath}: ${result.error?.message}`);
        return [];
      }
      const folders = result.data as MediaFolder[]; // Type assertion
      logger.debug(`Retrieved children for virtual folder path: ${parentPath}`);
      return folders;
    } catch (error) {
      logger.error(`Error retrieving virtual folder children: ${error.message}`);
      return [];
    }
  },

  // --- Utility/Bulk Operations ---
  // Example: Bulk update folder order within a parent - Adjust or remove if not needed
  async bulkUpdateFolderOrder(parentId: string, orderUpdates: Array<{ path: string; order: number }>): Promise<DatabaseResult<number>> { // Using DatabaseResult
    try {
      const bulkOps = orderUpdates.map((update) => ({
        updateOne: {
          filter: { path: update.path, parentId: parentId }, // Filter by path and parentId
          update: { $set: { order: update.order } },
        },
      }));

      const result = await this.bulkWrite(bulkOps);
      logger.info(`Updated order for ${result.modifiedCount} virtual folders under parent: ${parentId}`);
      return { success: true, data: result.modifiedCount }; // Return DatabaseResult
    } catch (error) {
      logger.error(`Error bulk updating virtual folder order: ${error.message}`);
      return { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to bulk update folder order', details: error } as DatabaseError }; // Use DatabaseError
    }
  }
};

// Create and export the SystemVirtualFolderModel
export const SystemVirtualFolderModel =
  (mongoose.models?.MediaFolder as Model<MediaFolder> | undefined) || mongoose.model<MediaFolder>('SystemVirtualFolder', systemVirtualFolderSchema); // Use MediaFolder type and name
