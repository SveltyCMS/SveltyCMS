/**
 * @file src/models/theme.ts
 * @description Mongoose schema and model definition for themes in the CMS.
 *
 * This module defines the `themeSchema` and `ThemeModel` for managing themes in the CMS
 */

import type { ISODateString, Theme } from '@src/databases/dbInterface';
import type { Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// System Logger
import { logger } from '@utils/logger.svelte';

// Theme schema
export const themeSchema = new Schema<Theme>(
	{
		_id: { type: String, required: true }, // UUID
		name: { type: String, required: true },
		description: String,
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
		createdAt: { type: String, default: () => new Date().toISOString() },
		updatedAt: { type: String, default: () => new Date().toISOString() },
		translations: [
			{
				languageTag: { type: String, required: true },
				translationName: { type: String, required: true },
				isDefault: { type: Boolean, default: false }
			}
		],
		order: { type: Number, default: 999 },
		parentPath: { type: String, default: null }
	},
	{
		timestamps: true,
		collection: 'system_theme',
		strict: true
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
				theme.createdAt = theme.createdAt.toISOString() as ISODateString;
				theme.updatedAt = theme.updatedAt.toISOString() as ISODateString;
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
				theme.createdAt = theme.createdAt.toISOString() as ISODateString;
				theme.updatedAt = theme.updatedAt.toISOString() as ISODateString;
			}
			return theme;
		} catch (error) {
			logger.error(`Error retrieving theme by name: ${error instanceof Error ? error.message : String(error)}`);
			throw error;
		}
	},

	// Store themes (bulk upsert) -
	async storeThemes(themes: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>[], generateId: () => string): Promise<void> {
		try {
			for (const themeData of themes) {
				try {
					const existingTheme = await this.findOne({ name: themeData.name }).exec();
					if (existingTheme) {
						// Update existing theme with new data (excluding system fields)
						await this.updateOne({ name: themeData.name }, { $set: themeData }).exec();
					} else {
						// Use the passed generateId function - V4 UUID - and pass it as argument - remove comment
						await this.create({ ...themeData, _id: generateId() });
					}
				} catch (error: unknown) {
					// Handle duplicate key error gracefully - theme might have been created by another process
					if (error instanceof Error && 'code' in error && error.code === 11000 && error.message.includes('duplicate key')) {
						logger.debug(`Theme '${themeData.name}' already exists, skipping creation`);
						continue;
					}
					throw error;
				}
			}
			logger.info(`Stored \x1b[34m${themes.length}\x1b[0m themes`);
		} catch (error) {
			logger.error(`Error storing themes: \x1b[31m${error instanceof Error ? error.message : String(error)}\x1b[0m`);
			throw error;
		}
	},

	// Get all themes
	async getAllThemes(): Promise<Theme[]> {
		try {
			const themes = await this.find().lean().exec();
			return themes.map((theme) => {
				theme.createdAt = theme.createdAt.toISOString() as ISODateString;
				theme.updatedAt = theme.updatedAt.toISOString() as ISODateString;
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
