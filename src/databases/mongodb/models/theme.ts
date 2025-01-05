/**
 * @file src/databases/mongodb/models/theme.ts
 * @description MongoDB schema and model for Themes.
 *
 * This module defines a schema and model for themes in the CMS.
 * Themes control the visual appearance and layout of the content.
 */

import mongoose, { Schema } from 'mongoose';
import type { Theme } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Theme schema
export const themeSchema = new Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    description: String,
    version: { type: String, required: true },
    author: String,
    isActive: { type: Boolean, default: false },
    config: {
      colors: {
        primary: String,
        secondary: String,
        accent: String,
        background: String,
        text: String
      },
      typography: {
        headingFont: String,
        bodyFont: String,
        fontSize: String
      },
      layout: {
        containerWidth: String,
        spacing: String
      },
      components: Schema.Types.Mixed
    },
    templates: [
      {
        name: String,
        path: String,
        type: String
      }
    ],
    assets: [
      {
        type: String,
        path: String
      }
    ],
    updatedAt: { type: Date, default: Date.now }
  },
  {
    timestamps: true,
    collection: 'system_themes',
    strict: false
  }
);

// Add indexes
themeSchema.index({ name: 1 }, { unique: true });
themeSchema.index({ isActive: 1 });
themeSchema.index({ version: 1 });

// Static methods
themeSchema.statics = {
  // Create theme
  async createTheme(themeData: {
    name: string;
    description?: string;
    version: string;
    author?: string;
    config?: Schema.Types.Mixed;
    templates?: Array<{ name: string; path: string; type: string }>;
    assets?: Array<{ type: string; path: string }>;
  }): Promise<Theme> {
    try {
      const theme = new this(themeData);
      await theme.save();
      logger.info(`Created theme: ${themeData.name}`);
      return theme;
    } catch (error) {
      logger.error(`Error creating theme: ${error.message}`);
      throw error;
    }
  },

  // Get all themes
  async getAllThemes(): Promise<Theme[]> {
    try {
      const themes = await this.find().exec();
      logger.debug(`Retrieved ${themes.length} themes`);
      return themes;
    } catch (error) {
      logger.error(`Error retrieving themes: ${error.message}`);
      throw error;
    }
  },

  // Get active theme
  async getActiveTheme(): Promise<Theme | null> {
    try {
      const theme = await this.findOne({ isActive: true }).exec();
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
      const theme = await this.findOne({ name }).exec();
      logger.debug(`Retrieved theme: ${name}`);
      return theme;
    } catch (error) {
      logger.error(`Error retrieving theme: ${error.message}`);
      throw error;
    }
  },

  // Update theme
  async updateTheme(name: string, updateData: Partial<Theme>): Promise<Theme | null> {
    try {
      const theme = await this.findOneAndUpdate({ name }, updateData, { new: true }).exec();
      if (theme) {
        logger.info(`Updated theme: ${name}`);
      } else {
        logger.warn(`Theme not found: ${name}`);
      }
      return theme;
    } catch (error) {
      logger.error(`Error updating theme: ${error.message}`);
      throw error;
    }
  },

  // Delete theme
  async deleteTheme(name: string): Promise<boolean> {
    try {
      const result = await this.findOneAndDelete({ name }).exec();
      if (result) {
        logger.info(`Deleted theme: ${name}`);
        return true;
      }
      logger.warn(`Theme not found for deletion: ${name}`);
      return false;
    } catch (error) {
      logger.error(`Error deleting theme: ${error.message}`);
      throw error;
    }
  },

  // Set active theme
  async setActiveTheme(name: string): Promise<boolean> {
    try {
      // First, deactivate all themes
      await this.updateMany({}, { isActive: false });

      // Then activate the specified theme
      const result = await this.findOneAndUpdate({ name }, { isActive: true }, { new: true }).exec();

      if (result) {
        logger.info(`Set active theme to: ${name}`);
        return true;
      }
      logger.warn(`Theme not found for activation: ${name}`);
      return false;
    } catch (error) {
      logger.error(`Error setting active theme: ${error.message}`);
      throw error;
    }
  }
};

// Create and export the Theme model
export const ThemeModel = mongoose.models?.Theme || mongoose.model<Theme>('Theme', themeSchema);
