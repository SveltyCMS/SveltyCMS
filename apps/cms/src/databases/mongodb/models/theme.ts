/**
 * @file src/models/theme.ts
 * @description Mongoose schema and model definition for themes in the CMS.
 *
 * This module defines the `themeSchema` and `ThemeModel` for managing themes in the CMS
 *
 * ### Features
 * - Schema definition with fields for theme properties
 * - Indexes for efficient querying
 * - Static methods for common operations:
 *   - getActiveTheme: Retrieve the currently active theme
 *   - getThemeByName: Fetch a theme by its name
 *   - storeThemes: Bulk upsert themes with optimized performance
 *   - getAllThemes: Retrieve all themes from the database
 *
 * The model ensures data integrity and provides utility methods for theme management.
 */

import type { Theme } from '@src/databases/dbInterface';
import type { Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import { nowISODateString, toISOString } from '@utils/dateUtils';

// System Logger
import { logger } from '@utils/logger';

// Theme schema
export const themeSchema = new Schema<Theme>(
	{
		_id: { type: String, required: true }, // UUID
		name: { type: String, required: true },
		path: { type: String, required: true },
		isActive: { type: Boolean, default: false },
		isDefault: { type: Boolean, default: false },
		config: {
			tailwindConfigPath: String,
			assetsPath: String,
			properties: {
				type: Map,
				of: String,
				default: {}
			}
		},
		previewImage: String,
		createdAt: { type: String, default: () => nowISODateString() },
		updatedAt: { type: String, default: () => nowISODateString() }
	},
	{
		timestamps: true,
		collection: 'system_theme',
		strict: true,
		_id: false // Disable Mongoose auto-ObjectId generation
	}
);

// Index
themeSchema.index({ isActive: 1 });
themeSchema.index({ name: 1 }, { unique: true });

// Static methods
themeSchema.statics = {
	// Get active theme
	async getActiveTheme(): Promise<Theme | null> {
		try {
			const theme = await this.findOne({ isActive: true }).lean().exec();
			if (theme) {
				theme.createdAt = toISOString(theme.createdAt);
				theme.updatedAt = toISOString(theme.updatedAt);
			}
			return theme;
		} catch (error) {
			logger.error(`Error retrieving active theme: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	},

	// Get theme by name
	async getThemeByName(name: string): Promise<Theme | null> {
		try {
			const theme = await this.findOne({ name }).lean().exec();
			if (theme) {
				theme.createdAt = toISOString(theme.createdAt);
				theme.updatedAt = toISOString(theme.updatedAt);
			}
			return theme;
		} catch (error) {
			logger.error(`Error retrieving theme by name: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	},

	// Store themes (bulk upsert) - Optimized with bulkWrite for atomic operation
	async storeThemes(themes: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>[], generateId: () => string): Promise<void> {
		if (themes.length === 0) return;

		try {
			// Build bulk operations: upsert each theme by name
			const operations = themes.map((themeData) => ({
				updateOne: {
					filter: { name: themeData.name },
					update: {
						$set: themeData,
						$setOnInsert: { _id: generateId() }
					},
					upsert: true
				}
			}));

			// Execute all upserts in a single atomic database call
			// Performance: 10 themes = 1 DB call instead of 20 (10 findOne + 10 updateOne/create)
			const result = await this.bulkWrite(operations, { ordered: false });

			logger.info(`Stored ${themes.length} themes via bulk operation ` + `(${result.upsertedCount} inserted, ${result.modifiedCount} updated)`);
		} catch (error) {
			logger.error(`Error storing themes: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	},

	// Get all themes
	async getAllThemes(): Promise<Theme[]> {
		try {
			const themes = await this.find().lean().exec();
			return themes.map((theme: Theme) => {
				theme.createdAt = toISOString(theme.createdAt);
				theme.updatedAt = toISOString(theme.updatedAt);
				return theme;
			});
		} catch (error) {
			logger.error(`Error retrieving all themes: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	}
};

// Create and export the Theme model
export const ThemeModel = (mongoose.models?.Theme as Model<Theme> | undefined) || mongoose.model<Theme>('Theme', themeSchema);
