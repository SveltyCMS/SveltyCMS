/**
 * @file src/databases/mongodb/methods/widgetMethods.ts
 * @description Widget registration and management for the MongoDB adapter.
 * Implements Dependency Injection for the Mongoose model to ensure testability and remove code duplication.
 */

import { logger } from '@utils/logger.svelte';
import type { Model } from 'mongoose';
import type { DatabaseId, Widget } from '../../dbInterface';
import type { Widget as IWidget } from '../../dbInterface'; // Assuming you have a document interface
import { createDatabaseError, withCache, CacheCategory, invalidateCollectionCache, invalidateCategoryCache } from './mongoDBUtils';

// Define the model type for dependency injection.
type WidgetModelType = Model<IWidget>;

export class MongoWidgetMethods {
	private readonly widgetModel: WidgetModelType;

	/**
	 * Constructs the MongoWidgetMethods instance with an injected model.
	 * @param {WidgetModelType} widgetModel - The Mongoose model for widgets.
	 */
	constructor(widgetModel: WidgetModelType) {
		this.widgetModel = widgetModel;
		logger.trace('\x1b[34mMongoWidgetMethods\x1b[0m initialized.');
	}

	/**
	 * Registers (creates) a new widget in the database.
	 * @param {Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>} widgetData - The data for the new widget.
	 * @returns {Promise<Widget>} The created widget object.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async register(widgetData: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<Widget> {
		try {
			const newWidget = new this.widgetModel(widgetData);
			const savedWidget = await newWidget.save();
			return savedWidget.toObject();
		} catch (error) {
			throw createDatabaseError(error, 'WIDGET_REGISTER_FAILED', 'Failed to register widget');
		}
	}

	/**
	 * Finds a single widget by its ID.
	 * Cached with 600s TTL since widget configs are relatively stable
	 * @param {DatabaseId} widgetId - The ID of the widget to find.
	 * @returns {Promise<Widget | null>} The widget object or null if not found.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async findById(widgetId: DatabaseId): Promise<Widget | null> {
		return withCache(
			`widget:id:${widgetId}`,
			async () => {
				try {
					return await this.widgetModel.findById(widgetId).lean().exec();
				} catch (error) {
					throw createDatabaseError(error, 'WIDGET_FETCH_FAILED', `Failed to find widget with ID ${widgetId}`);
				}
			},
			{ category: CacheCategory.WIDGET }
		);
	}

	/**
	 * Activates a widget, setting its `isActive` flag to true.
	 * @param {DatabaseId} widgetId - The ID of the widget to activate.
	 * @returns {Promise<Widget | null>} The updated widget object or null if not found.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async activate(widgetId: DatabaseId): Promise<Widget | null> {
		try {
			const result = await this.widgetModel
				.findByIdAndUpdate(widgetId, { $set: { isActive: true } }, { new: true })
				.lean()
				.exec();

			// Invalidate widget caches
			await Promise.all([invalidateCollectionCache(`widget:id:${widgetId}`), invalidateCategoryCache(CacheCategory.WIDGET)]);

			return result;
		} catch (error) {
			throw createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to activate widget');
		}
	}

	/**
	 * Deactivates a widget, setting its `isActive` flag to false.
	 * @param {DatabaseId} widgetId - The ID of the widget to deactivate.
	 * @returns {Promise<Widget | null>} The updated widget object or null if not found.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async deactivate(widgetId: DatabaseId): Promise<Widget | null> {
		try {
			const result = await this.widgetModel
				.findByIdAndUpdate(widgetId, { $set: { isActive: false } }, { new: true })
				.lean()
				.exec();

			// Invalidate widget caches
			await Promise.all([invalidateCollectionCache(`widget:id:${widgetId}`), invalidateCategoryCache(CacheCategory.WIDGET)]);

			return result;
		} catch (error) {
			throw createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to deactivate widget');
		}
	}

	/**
	 * Updates an existing widget with new data.
	 * @param {DatabaseId} widgetId - The ID of the widget to update.
	 * @param {Partial<Omit<Widget, '_id'>>} widgetData - The fields to update.
	 * @returns {Promise<Widget | null>} The updated widget object or null if not found.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async update(widgetId: DatabaseId, widgetData: Partial<Omit<Widget, '_id'>>): Promise<Widget | null> {
		try {
			const result = await this.widgetModel.findByIdAndUpdate(widgetId, { $set: widgetData }, { new: true }).lean().exec();

			// Invalidate widget caches
			await Promise.all([invalidateCollectionCache(`widget:id:${widgetId}`), invalidateCategoryCache(CacheCategory.WIDGET)]);

			return result;
		} catch (error) {
			throw createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to update widget');
		}
	}

	/**
	 * Deletes a widget from the database.
	 * @param {DatabaseId} widgetId - The ID of the widget to delete.
	 * @returns {Promise<boolean>} True if a widget was deleted, false otherwise.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async delete(widgetId: DatabaseId): Promise<boolean> {
		try {
			const result = await this.widgetModel.findByIdAndDelete(widgetId).exec();

			// Invalidate widget caches
			await Promise.all([invalidateCollectionCache(`widget:id:${widgetId}`), invalidateCategoryCache(CacheCategory.WIDGET)]);

			return !!result;
		} catch (error) {
			throw createDatabaseError(error, 'WIDGET_DELETE_FAILED', 'Failed to delete widget');
		}
	}

	/**
	 * Retrieves all widgets from the database.
	 * @returns {Promise<Widget[]>} An array of all widget objects.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async findAll(): Promise<Widget[]> {
		try {
			return await this.widgetModel.find().lean().exec();
		} catch (error) {
			throw createDatabaseError(error, 'WIDGET_FETCH_ALL_FAILED', 'Failed to get all widgets');
		}
	}

	/**
	 * Retrieves all active widgets from the database.
	 * Cached with 600s TTL since active widgets are frequently accessed on every page
	 * @returns {Promise<Widget[]>} An array of active widget objects.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async findAllActive(): Promise<Widget[]> {
		return withCache(
			'widget:active:all',
			async () => {
				try {
					return await this.widgetModel.find({ isActive: true }).lean().exec();
				} catch (error) {
					throw createDatabaseError(error, 'WIDGET_FETCH_ACTIVE_FAILED', 'Failed to get active widgets');
				}
			},
			{ category: CacheCategory.WIDGET }
		);
	}
}
