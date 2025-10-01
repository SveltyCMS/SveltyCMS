/**
 * @file src/databases/mongodb/methods/themeMethods.ts
 * @description Theme management for the MongoDB adapter.
 * This class uses Dependency Injection for the Mongoose model to ensure testability.
 */

import { logger } from '@utils/logger.svelte';
import type { Model } from 'mongoose';
import type { DatabaseId, Theme } from '../../dbInterface';
import type { ITheme } from '../models/theme';
import { createDatabaseError } from './mongoDBUtils';

// Define the model type for dependency injection, making the class testable.
type ThemeModelType = Model<ITheme>;

export class MongoThemeMethods {
	private readonly themeModel: ThemeModelType;

	/**
	 * Constructs the MongoThemeMethods instance.
	 * @param {ThemeModelType} themeModel - The Mongoose model for themes.
	 */
	constructor(themeModel: ThemeModelType) {
		this.themeModel = themeModel;
		logger.info('MongoThemeMethods initialized.');
	}

	/**
	 * Retrieves the currently active theme.
	 * @returns {Promise<Theme | null>} The active theme object or null if none is active.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async getActive(): Promise<Theme | null> {
		try {
			return await this.themeModel.findOne({ isActive: true }).lean().exec();
		} catch (error) {
			throw createDatabaseError(error, 'THEME_FETCH_FAILED', 'Failed to get active theme');
		}
	}

	/**
	 * Retrieves the default theme.
	 * @returns {Promise<Theme | null>} The default theme object or null if none is set.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async getDefault(): Promise<Theme | null> {
		try {
			return await this.themeModel.findOne({ isDefault: true }).lean().exec();
		} catch (error) {
			throw createDatabaseError(error, 'THEME_FETCH_FAILED', 'Failed to get default theme');
		}
	}

	/**
	 * Retrieves all themes from the database, sorted by order.
	 * @returns {Promise<Theme[]>} An array of theme objects.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async findAll(): Promise<Theme[]> {
		try {
			return await this.themeModel.find().sort({ order: 1 }).lean().exec();
		} catch (error) {
			throw createDatabaseError(error, 'THEME_FETCH_ALL_FAILED', 'Failed to get all themes');
		}
	}

	/**
	 * Sets a specific theme as the active one. This will deactivate any other active theme.
	 * @param {DatabaseId} themeId The ID of the theme to activate.
	 * @returns {Promise<Theme | null>} The updated theme object or null if not found.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async setActive(themeId: DatabaseId): Promise<Theme | null> {
		return this._setUniqueFlag(themeId, 'isActive');
	}

	/**
	 * Sets a specific theme as the default one. This will unset any other default theme.
	 * @param {DatabaseId} themeId The ID of the theme to set as default.
	 * @returns {Promise<Theme | null>} The updated theme object or null if not found.
	 * @throws {DatabaseError} If the database query fails.
	 */
	async setDefault(themeId: DatabaseId): Promise<Theme | null> {
		return this._setUniqueFlag(themeId, 'isDefault');
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
			return savedTheme.toObject();
		} catch (error) {
			throw createDatabaseError(error, 'THEME_INSTALL_FAILED', 'Failed to install theme');
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
			return await this.themeModel.findByIdAndUpdate(themeId, { $set: themeData }, { new: true }).lean().exec();
		} catch (error) {
			throw createDatabaseError(error, 'THEME_UPDATE_FAILED', 'Failed to update theme');
		}
	}

	/**
	 * A private helper to atomically set a unique boolean flag on a document.
	 * It first unsets the flag for all documents and then sets it for the target document.
	 * @note For guaranteed atomicity across two collections, MongoDB sessions (transactions) would be required.
	 * For a single collection, this two-step update is generally safe and robust.
	 */
	private async _setUniqueFlag(themeId: DatabaseId, flag: 'isActive' | 'isDefault'): Promise<Theme | null> {
		try {
			// Step 1: Unset the flag for all other themes.
			await this.themeModel.updateMany({ _id: { $ne: themeId } }, { $set: { [flag]: false } }).exec();

			// Step 2: Set the flag for the specified theme and return the updated document.
			const updatedTheme = await this.themeModel
				.findByIdAndUpdate(themeId, { $set: { [flag]: true } }, { new: true })
				.lean()
				.exec();

			return updatedTheme;
		} catch (error) {
			throw createDatabaseError(error, 'THEME_FLAG_UPDATE_FAILED', `Failed to set the '${flag}' flag for theme ${themeId}`);
		}
	}
}
