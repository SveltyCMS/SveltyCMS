/**
 * @file src/databases/mongodb/methods/themeMethods.ts
 * @description Theme management for the MongoDB adapter.
 * This class uses Dependency Injection for the Mongoose model to ensure testability.
 */

import { logger } from '@utils/logger';
import type { Model } from 'mongoose';
import type { DatabaseId, Theme } from '../../dbInterface';
import { createDatabaseError } from './mongoDBUtils';
import { v4 as uuidv4 } from 'uuid';
import { withCache, CacheCategory, invalidateCategoryCache } from './mongoDBCacheUtils';

// Define the model type for dependency injection, making the class testable.
type ThemeModelType = Model<Theme>;

export class MongoThemeMethods {
	private readonly themeModel: ThemeModelType;

	/**
	 * Constructs the MongoThemeMethods instance.
	 * @param {ThemeModelType} themeModel - The Mongoose model for themes.
	 */
	constructor(themeModel: ThemeModelType) {
		this.themeModel = themeModel;
		logger.trace('MongoThemeMethods initialized.');
	}

	/**
	 * Retrieves the currently active theme.
	 * Cached with 300s TTL since active theme is accessed on every page load
	 * @returns {Promise<Theme | null>} The active theme object or null if none is active.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async getActive(): Promise<Theme | null> {
		return withCache(
			'theme:active',
			async () => {
				try {
					return await this.themeModel.findOne({ isActive: true }).lean().exec();
				} catch (error) {
					throw createDatabaseError(error, 'THEME_FETCH_FAILED', 'Failed to get active theme');
				}
			},
			{ category: CacheCategory.THEME }
		);
	}

	/**
	 * Retrieves the default theme.
	 * Cached with 300s TTL since default theme is frequently accessed
	 * @returns {Promise<Theme | null>} The default theme object or null if none is set.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async getDefault(): Promise<Theme | null> {
		return withCache(
			'theme:default',
			async () => {
				try {
					return await this.themeModel.findOne({ isDefault: true }).lean().exec();
				} catch (error) {
					throw createDatabaseError(error, 'THEME_FETCH_FAILED', 'Failed to get default theme');
				}
			},
			{ category: CacheCategory.THEME }
		);
	}

	/**
	 * Retrieves all themes from the database, sorted by order.
	 * Cached with 300s TTL since theme list is frequently accessed in admin UI
	 * @returns {Promise<Theme[]>} An array of theme objects.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async findAll(): Promise<Theme[]> {
		return withCache(
			'theme:all',
			async () => {
				try {
					return await this.themeModel.find().sort({ order: 1 }).lean().exec();
				} catch (error) {
					throw createDatabaseError(error, 'THEME_FETCH_ALL_FAILED', 'Failed to get all themes');
				}
			},
			{ category: CacheCategory.THEME }
		);
	}

	/**
	 * Sets a specific theme as the active one. This will deactivate any other active theme.
	 * @param {DatabaseId} themeId The ID of the theme to activate.
	 * @returns {Promise<Theme | null>} The updated theme object or null if not found.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async setActive(themeId: DatabaseId): Promise<Theme | null> {
		const result = await this._setUniqueFlag(themeId, 'isActive');
		// Invalidate all theme caches since active theme changed
		await invalidateCategoryCache(CacheCategory.THEME);
		return result;
	}

	/**
	 * Sets a specific theme as the default one. This will unset any other default theme.
	 * @param {DatabaseId} themeId The ID of the theme to set as default.
	 * @returns {Promise<Theme | null>} The updated theme object or null if not found.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async setDefault(themeId: DatabaseId): Promise<Theme | null> {
		const result = await this._setUniqueFlag(themeId, 'isDefault');
		// Invalidate all theme caches since default theme changed
		await invalidateCategoryCache(CacheCategory.THEME);
		return result;
	}

	/**
	 * Installs (creates) a new theme in the database.
	 * @param {Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>} themeData - The theme data to install.
	 * @returns {Promise<Theme>} The newly created theme object.
	 * @throws {DatabaseError} If the creation fails.
	 */
	async install(themeData: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<Theme> {
		try {
			const newTheme = new this.themeModel(themeData);
			const savedTheme = await newTheme.save();

			// Invalidate theme caches
			await invalidateCategoryCache(CacheCategory.THEME);

			return savedTheme.toObject();
		} catch (error) {
			throw createDatabaseError(error, 'THEME_INSTALL_FAILED', 'Failed to install theme');
		}
	}

	/**
	 * Ensures a theme exists in the database.
	 * Atomic upsert: query by name, only insert if not exists.
	 * @param {Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>} themeData - The theme data.
	 * @returns {Promise<Theme>} The theme object.
	 */
	async ensure(themeData: Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>): Promise<Theme> {
		try {
			// Strip timestamps and ID to let Mongoose handle them or avoid conflicts with $setOnInsert
			const { _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = themeData as any;
			const result = await this.themeModel
				.findOneAndUpdate(
					{ name: themeData.name },
					{ $setOnInsert: { ...rest, _id: _id || uuidv4().replace(/-/g, '') } },
					{ upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
				)
				.lean()
				.exec();

			await invalidateCategoryCache(CacheCategory.THEME);
			return result as Theme;
		} catch (error) {
			throw createDatabaseError(error, 'THEME_ENSURE_FAILED', 'Failed to ensure theme');
		}
	}

	/**
	 * Installs or updates a theme using atomic upsert operation.
	 * If the theme exists (by _id), it updates it. Otherwise, it creates a new one.
	 * This method is safe from duplicate key errors.
	 * @param {Theme} themeData - The complete theme data including _id.
	 * @returns {Promise<Theme>} The created or updated theme object.
	 * @throws {DatabaseError} If the operation fails.
	 */
	async installOrUpdate(themeData: Theme): Promise<Theme> {
		try {
			const result = await this.themeModel
				.findOneAndUpdate({ _id: themeData._id }, themeData, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true })
				.lean()
				.exec();

			// Invalidate theme caches
			await invalidateCategoryCache(CacheCategory.THEME);

			return result as Theme;
		} catch (error) {
			throw createDatabaseError(error, 'THEME_UPSERT_FAILED', 'Failed to install or update theme');
		}
	}

	/**
	 * Uninstalls (deletes) a theme from the database.
	 * @param {DatabaseId} themeId - The ID of the theme to uninstall.
	 * @returns {Promise<boolean>} True if a theme was deleted, false otherwise.
	 * @throws {DatabaseError} If the deletion fails.
	 */
	async uninstall(themeId: DatabaseId): Promise<boolean> {
		try {
			const result = await this.themeModel.findByIdAndDelete(themeId).exec();

			// Invalidate theme caches
			await invalidateCategoryCache(CacheCategory.THEME);

			return !!result;
		} catch (error) {
			throw createDatabaseError(error, 'THEME_UNINSTALL_FAILED', 'Failed to uninstall theme');
		}
	}

	/**
	 * Updates an existing theme's data.
	 * @param {DatabaseId} themeId - The ID of the theme to update.
	 * @param {Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>} themeData - The fields to update.
	 * @returns {Promise<Theme | null>} The updated theme object, or null if not found.
	 * @throws {DatabaseError} If the update fails.
	 */
	async update(themeId: DatabaseId, themeData: Partial<Omit<Theme, '_id' | 'createdAt' | 'updatedAt'>>): Promise<Theme | null> {
		try {
			const result = await this.themeModel.findByIdAndUpdate(themeId, { $set: themeData }, { returnDocument: 'after' }).lean().exec();

			// Invalidate theme caches
			await invalidateCategoryCache(CacheCategory.THEME);

			return result;
		} catch (error) {
			throw createDatabaseError(error, 'THEME_UPDATE_FAILED', 'Failed to update theme');
		}
	}

	/**
	 * A private helper to atomically set a unique boolean flag on a document.
	 * Uses a single bulkWrite operation for atomicity and efficiency.
	 * @param {DatabaseId} themeId - The ID of the theme to set the flag on.
	 * @param {string} flag - The flag name ('isActive' or 'isDefault').
	 * @returns {Promise<Theme | null>} The updated theme object or null if not found.
	 * @throws {DatabaseError} If the operation fails.
	 */
	private async _setUniqueFlag(themeId: DatabaseId, flag: 'isActive' | 'isDefault'): Promise<Theme | null> {
		try {
			// Single atomic bulkWrite operation: unset flag for others, then set for target
			await this.themeModel.bulkWrite([
				{
					// Step 1: Unset the flag for all other themes
					updateMany: {
						filter: { _id: { $ne: themeId } },
						update: { $set: { [flag]: false } }
					}
				},
				{
					// Step 2: Set the flag for the target theme
					updateOne: {
						filter: { _id: themeId },
						update: { $set: { [flag]: true } }
					}
				}
			]);

			// Fetch and return the updated document
			return await this.themeModel.findById(themeId).lean().exec();
		} catch (error) {
			throw createDatabaseError(error, 'THEME_FLAG_UPDATE_FAILED', `Failed to set the '${flag}' flag for theme ${themeId}`);
		}
	}
}
