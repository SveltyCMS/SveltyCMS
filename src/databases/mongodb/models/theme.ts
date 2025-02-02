/**
 * @file src/databases/mongodb/models/theme.ts
 * @description MongoDB schema and model for Themes.
 *
 * This module defines a schema and model for themes in the CMS.
 * Themes control the visual appearance and layout of the content.
 */

import mongoose, { Schema } from 'mongoose';
import type { Theme } from '@src/databases/dbInterface';
import type { DatabaseId, ISODateString } from '@src/databases/dbInterface';


// System Logger
import { logger } from '@utils/logger.svelte';

// Theme schema
export const themeSchema = new Schema<Theme>(
  {
    _id: { type: DatabaseId, required: true }, // refine to DatabaseId
    name: { type: String, required: true },
    description: String,
    path: { type: String, required: true },
    isActive: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    config: { // ThemeConfig
      primaryColor: String,
      secondaryColor: String,
      font: String,
      tailwindConfigPath: String,
      assetsPath: String,
      properties: { // Updated config to use ThemeConfig with properties
        type: Schema.Types.Map, // Use Map for properties
        of: String, // Values are strings (CSS variables)
        default: {}
      }
    },
    previewImage: String,
  },
  {
    timestamps: true,
    collection: 'system_themes',
    strict: false
  }
);

// Index
themeSchema.index({ isActive: 1 });

// Static methods
themeSchema.statics = {
  // --- CRUD Actions (Delegated to MongoDBAdapter) ---
  // In this simplified model, create, update, delete, and setDefault are
  // primarily handled by the MongoDBAdapter using core CRUD methods.
  // The model focuses on specific queries if needed.

  // --- Specialized Queries ---

  // Get default theme (active theme) - Keep for direct access if needed
  // Get active theme
  async getActiveTheme(): Promise<Theme | null> {
    try {
      const theme = await this.findOne({ isActive: true }).lean().exec();
      logger.debug('Retrieved active theme');
      return theme;
    } catch (error) {
      logger.error(`Error retrieving active theme: ${error.message}`);
      throw error;
    }
  },

  // Get theme by name
  async getThemeByName(name: string): Promise<Theme | null> {
    try {
      if (!this.dbAdapter) {
        throw new Error('Database adapter is not initialized.');
      }
      const result = await this.dbAdapter.queryBuilder<Theme>('Theme')
        .where({ name })
        .findOne();

      if (!result.success) {
        logger.error(`Error retrieving theme by name: ${name}: ${result.error?.message}`);
        return null;
      }
      const theme = result.data;
      logger.debug(`Retrieved theme by name: ${name}`);
      return theme;
    } catch (error) {
      logger.error(`Error retrieving theme by name: ${error.message}`);
      throw error;
    }
  },

  // --- Utility/Bulk Operations ---

  // Store themes (bulk upsert) - Keep for bulk operations if needed
  async storeThemes(themes: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<void> {
    try {
      const operations = themes.map(themeData => ({
        updateOne: {
          filter: { name: themeData.name }, // Assuming name is unique identifier for upsert
          update: { $set: themeData },
          upsert: true,
        },
      }));
      await this.bulkWrite(operations);
      logger.info(`Stored ${themes.length} themes (upserted if existing)`);
    } catch (error) {
      logger.error(`Error storing themes: ${error.message}`);
      throw error;
    }
  },
};
// Create and export the Theme model
export const ThemeModel =
  (mongoose.models?.Theme as Model<Theme> | undefined) || mongoose.model<Theme>('Theme', themeSchema);
