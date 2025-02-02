/**
 * @file src/databases/mongodb/models/systemPreferences.ts
 * @description MongoDB schema and model for System Preferences.
 *
 * This module defines a schema and model for system-wide preferences and settings.
 */


import mongoose, { Schema, Model } from 'mongoose';
import type { SystemPreferences } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// System preferences schema 
export const systemPreferencesSchema = new Schema<SystemPreferences>( // Use SystemPreferences interface
  {
    _id: { type: String, required: true }, // String _id as in dbInterface
    key: { type: String, required: true, unique: true }, // Unique key for the preference
    value: { type: Schema.Types.Mixed }, // Value of the preference, can be any type
    scope: { type: String, enum: ['user', 'system', 'widget'], default: 'system' }, // Scope of the preference
    userId: { type: DatabaseId, ref: 'auth_users', required: false }, // Optional userId for user-scoped preferences, refine to DatabaseId
  },
  {
    timestamps: true,
    collection: 'system_preferences',
    strict: false // Allow for potential extra fields
  }
);

// Indexes  
systemPreferencesSchema.index({ key: 1, scope: 1, userId: 1, unique: true }); // Unique index for key, scope, userId
systemPreferencesSchema.index({ scope: 1, userId: 1 }); // Index for scope and userId queries
systemPreferencesSchema.index({ scope: 1 }); // Index for scope-based queries

// Static methods 
systemPreferencesSchema.statics = {
  // --- CRUD Actions (Delegated to MongoDBAdapter) ---
  // In this simplified model, get, set, and delete preferences are
  // primarily handled by the MongoDBAdapter using core CRUD methods and QueryBuilder.
  // The model focuses on specific queries if needed.

  // --- Specialized Queries ---

  // Get preference by key and scope
  async getPreferenceByKeyScope(key: string, scope: string, userId?: DatabaseId): Promise<SystemPreferences | null> { // Use SystemPreferences interface
    try {
      const query: FilterQuery<SystemPreferences> = { key, scope };
      if (scope === 'user' && userId) {
        query.userId = userId;
      }
      const preference = await this.queryBuilder<SystemPreferences>('SystemPreferences')
        .where(query)
        .findOne();

      if (!preference.success) {
        logger.error(`Error retrieving system preference: ${preference.error?.message}`);
        return null;
      }

      logger.debug(`Retrieved system preference by key: ${key}, scope: ${scope}, userId: ${userId || 'system'}`);
      return preference.data;
    } catch (error) {
      logger.error(`Error retrieving system preference: ${error.message}`);
      throw error;
    }
  },

  // --- Utility/Bulk Operations ---
  // Example: Bulk delete preferences by scope - Adjust or remove if not needed
  async bulkDeletePreferencesByScope(scope: string): Promise<DatabaseResult<number>> { // Using DatabaseResult
    try {
      const result = await this.deleteMany({ scope: scope }).exec();
      logger.info(`Bulk deleted ${result.deletedCount} system preferences for scope: ${scope}`);
      return { success: true, data: result.deletedCount }; // Return DatabaseResult
    } catch (error) {
      logger.error(`Error bulk deleting system preferences by scope: ${error.message}`);
      return { success: false, error: { code: 'DATABASE_ERROR', message: 'Failed to bulk delete system preferences', details: error } as DatabaseError }; // Use DatabaseError
    }
  }
};

// Create and export the SystemPreferencesModel
export const SystemPreferencesModel =
  (mongoose.models?.SystemPreferences as Model<SystemPreferences> | undefined) || mongoose.model<SystemPreferences>('SystemPreferences', systemPreferencesSchema); // Use SystemPreferences type
