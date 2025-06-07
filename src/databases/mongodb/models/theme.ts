/**
 * @file src/models/theme.ts
 * @description Mongoose schema and model definition for themes in the CMS.
 *
 * This module defines the `themeSchema` and `ThemeModel` for managing themes in the CMS
 */
import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { Theme, ISODateString } from '@src/databases/dbInterface';

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
		createdAt: { type: Date, default: Date.now },
		updatedAt: { type: Date, default: Date.now },
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
		collection: 'system_themes',
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
			logger.error(`Error retrieving active theme: ${error.message}`);
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
			logger.error(`Error retrieving theme by name: ${error.message}`);
			throw error;
		}
	},

	// Store themes (bulk upsert) -
	async storeThemes(themes: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>[], generateId: () => string): Promise<void> {
		try {
			for (const themeData of themes) {
				const existingTheme = await this.findOne({ name: themeData.name }).exec();
				if (existingTheme) {
					await this.updateOne({ name: themeData.name }, { $set: themeData }).exec();
				} else {
					// Use the passed generateId function - V4 UUID - and pass it as argument - remove comment
					await this.create({ ...themeData, _id: generateId() });
				}
			}
			logger.info(`Stored /x1b[34m${themes.length}/x1b[0m themes`);
		} catch (error) {
			logger.error(`Error storing themes: /x1b[31m${error.message}/x1b[0m`);
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
			logger.error(`Error retrieving all themes: ${error.message}`);
			throw error;
		}
	}
};

// Create and export the Theme model
export const ThemeModel = (mongoose.models?.Theme as Model<Theme> | undefined) || mongoose.model<Theme>('Theme', themeSchema);
