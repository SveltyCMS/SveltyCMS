/**
 * @file src/databases/mongodb/methods/widget-methods.ts
 * @description Widget registration and management for the MongoDB adapter.
 * Provides methods to create, read, update, and delete widgets,
 * as well as activate/deactivate them.
 */

import { cacheService } from '@src/databases/cache-service';
import { logger } from '@utils/logger';
import type { Model } from 'mongoose';
import type { DatabaseId, DatabaseResult, Widget as IWidget, Widget } from '../../db-interface'; // Assuming you have a document interface
import { CacheCategory, invalidateCategoryCache, invalidateCollectionCache, withCache } from './mongodb-cache-utils';
import { createDatabaseError, generateId } from './mongodb-utils';

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
		logger.trace('MongoWidgetMethods initialized.');
	}

	/**
	 * Registers (creates) a new widget in the database.
	 * @param {Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>} widgetData - The data for the new widget.
	 * @returns {Promise<DatabaseResult<Widget>>} The created widget object.
	 */
	async register(widgetData: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>> {
		try {
			// Generate UUID for _id since schema requires it
			const widgetWithId = {
				...widgetData,
				_id: generateId()
			};

			logger.debug(`[WidgetMethods] Registering widget "${widgetData.name}" to database`, {
				widgetId: widgetWithId._id,
				collection: this.widgetModel.collection.name,
				widgetData: widgetWithId
			});

			const newWidget = new this.widgetModel(widgetWithId);
			const savedWidget = await newWidget.save();
			const result = savedWidget.toObject();

			logger.debug(`[WidgetMethods] Widget "${widgetData.name}" saved successfully`, {
				widgetId: result._id,
				isActive: result.isActive,
				collection: this.widgetModel.collection.name
			});

			return { success: true, data: result };
		} catch (error) {
			logger.error(`[WidgetMethods] Failed to register widget "${widgetData.name}"`, {
				error: error instanceof Error ? error.message : String(error),
				collection: this.widgetModel.collection.name
			});
			return {
				success: false,
				message: 'Failed to register widget',
				error: createDatabaseError(error, 'WIDGET_REGISTER_FAILED', 'Failed to register widget')
			};
		}
	}

	/**
	 * Finds a single widget by its ID.
	 * Cached with 600s TTL since widget configs are relatively stable
	 * @param {DatabaseId} widgetId - The ID of the widget to find.
	 * @returns {Promise<DatabaseResult<Widget | null>>} The widget object or null if not found.
	 */
	async findById(widgetId: DatabaseId): Promise<DatabaseResult<Widget | null>> {
		// withCache doesn't natively support DatabaseResult wrapping yet if the underlying returns raw data
		// But if we change the callback to return T, withCache returns T.
		// We want withCache to cache the successful data.
		// So we fetch, if success we return data. Then we wrap the result.

		const cacheKey = `widget:id:${widgetId}`;
		return withCache(
			cacheKey,
			async () => {
				try {
					const result = await this.widgetModel.findById(widgetId).lean().exec();
					return {
						success: true,
						data: result
					} as DatabaseResult<Widget | null>;
				} catch (error) {
					return {
						success: false,
						message: `Failed to find widget with ID ${widgetId}`,
						error: createDatabaseError(error, 'WIDGET_FETCH_FAILED', `Failed to find widget with ID ${widgetId}`)
					};
				}
			},
			{ category: CacheCategory.WIDGET }
		);
	}

	/**
	 * Activates a widget, setting its `isActive` flag to true.
	 * @param {DatabaseId} widgetId - The ID of the widget to activate.
	 * @returns {Promise<DatabaseResult<Widget | null>>} The updated widget object or null if not found.
	 */
	async activate(widgetId: DatabaseId): Promise<DatabaseResult<Widget | null>> {
		try {
			const result = await this.widgetModel
				.findByIdAndUpdate(widgetId, { $set: { isActive: true } }, { returnDocument: 'after' })
				.lean()
				.exec();

			// Invalidate widget caches - including the active widgets list cache
			logger.debug('[widget-methods.activate] Invalidating active widgets cache');

			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'), // No tenant (default)
				cacheService.delete('widget:active:all', 'default'), // Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'), // default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);

			logger.debug('[widget-methods.activate] Cache invalidated successfully');

			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to activate widget',
				error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to activate widget')
			};
		}
	}

	/**
	 * Deactivates a widget, setting its `isActive` flag to false.
	 * @param {DatabaseId} widgetId - The ID of the widget to deactivate.
	 * @returns {Promise<DatabaseResult<Widget | null>>} The updated widget object or null if not found.
	 */
	async deactivate(widgetId: DatabaseId): Promise<DatabaseResult<Widget | null>> {
		try {
			const result = await this.widgetModel
				.findByIdAndUpdate(widgetId, { $set: { isActive: false } }, { returnDocument: 'after' })
				.lean()
				.exec();

			// Invalidate widget caches - including the active widgets list cache
			logger.debug('[widget-methods.deactivate] Invalidating active widgets cache');

			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'), // No tenant (default)
				cacheService.delete('widget:active:all', 'default'), // Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'), // default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);

			logger.debug('[widget-methods.deactivate] Cache invalidated successfully');

			return { success: true, data: result };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to deactivate widget',
				error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to deactivate widget')
			};
		}
	}

	/**
	 * Updates an existing widget with new data.
	 * @param {DatabaseId} widgetId - The ID of the widget to update.
	 * @param {Partial<Omit<Widget, '_id'>>} widgetData - The fields to update.
	 * @returns {Promise<DatabaseResult<Widget | null>>} The updated widget object or null if not found.
	 */
	async update(widgetId: DatabaseId, widgetData: Partial<Omit<Widget, '_id'>>): Promise<DatabaseResult<Widget | null>> {
		try {
			logger.debug('[widget-methods.update] Starting update', {
				widgetId,
				widgetData,
				collection: this.widgetModel.collection.name
			});

			const result = await this.widgetModel.findByIdAndUpdate(widgetId, { $set: widgetData }, { returnDocument: 'after' }).lean().exec();

			logger.debug('[widget-methods.update] Update completed', {
				widgetId,
				success: !!result,
				resultIsActive: result?.isActive,
				resultUpdatedAt: result?.updatedAt
			});

			// Invalidate widget caches - including the active widgets list cache
			logger.debug('[widget-methods.update] Invalidating caches', {
				widgetId,
				cacheKeys: ['widget:active:all (all tenants)']
			});

			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'), // No tenant (default)
				cacheService.delete('widget:active:all', 'default'), // Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'), // default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);

			logger.debug('[widget-methods.update] Caches invalidated successfully', {
				widgetId
			});
			return { success: true, data: result };
		} catch (error) {
			logger.error('[widget-methods.update] Update failed', {
				widgetId,
				error: error instanceof Error ? error.message : String(error)
			});
			return {
				success: false,
				message: 'Failed to update widget',
				error: createDatabaseError(error, 'WIDGET_UPDATE_FAILED', 'Failed to update widget')
			};
		}
	}

	/**
	 * Deletes a widget from the database.
	 * @param {DatabaseId} widgetId - The ID of the widget to delete.
	 * @returns {Promise<DatabaseResult<boolean>>} True if a widget was deleted, false otherwise.
	 */
	async delete(widgetId: DatabaseId): Promise<DatabaseResult<boolean>> {
		try {
			const result = await this.widgetModel.findByIdAndDelete(widgetId).exec();

			// Invalidate widget caches
			await Promise.all([invalidateCollectionCache(`widget:id:${widgetId}`), invalidateCategoryCache(CacheCategory.WIDGET)]);

			return { success: true, data: !!result };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to delete widget',
				error: createDatabaseError(error, 'WIDGET_DELETE_FAILED', 'Failed to delete widget')
			};
		}
	}

	/**
	 * Retrieves all widgets from the database.
	 * @returns {Promise<DatabaseResult<Widget[]>>} An array of all widget objects.
	 */
	async findAll(): Promise<DatabaseResult<Widget[]>> {
		try {
			logger.debug('[widget-methods.findAll] Querying widgets from database', {
				collection: this.widgetModel.collection.name
			});

			const widgets = await this.widgetModel.find().lean().exec();

			logger.debug('[widget-methods.findAll] Query completed', {
				count: widgets.length,
				collection: this.widgetModel.collection.name,
				widgets: widgets.map((w) => ({
					name: w.name,
					isActive: w.isActive,
					_id: w._id
				}))
			});

			return { success: true, data: widgets };
		} catch (error) {
			logger.error('[widget-methods.findAll] Failed to query widgets', {
				error: error instanceof Error ? error.message : String(error),
				collection: this.widgetModel.collection.name
			});
			return {
				success: false,
				message: 'Failed to get all widgets',
				error: createDatabaseError(error, 'WIDGET_FETCH_ALL_FAILED', 'Failed to get all widgets')
			};
		}
	}

	/**
	 * Retrieves all active widgets from the database.
	 * Cached with 600s TTL since active widgets are frequently accessed on every page
	 * @returns {Promise<DatabaseResult<Widget[]>>} An array of active widget objects.
	 */
	async findAllActive(tenantId?: string): Promise<DatabaseResult<Widget[]>> {
		logger.debug('[widget-methods.findAllActive] Fetching active widgets (may be cached)', { tenantId });

		return withCache(
			'widget:active:all',
			async () => {
				try {
					logger.debug('[widget-methods.findAllActive] Cache MISS - querying database');
					const widgets = await this.widgetModel.find({ isActive: true }).lean().exec();
					logger.debug('[widget-methods.findAllActive] Database query completed', {
						count: widgets.length,
						widgets: widgets.map((w) => w.name)
					});
					return { success: true, data: widgets } as DatabaseResult<Widget[]>;
				} catch (error) {
					return {
						success: false,
						message: 'Failed to get active widgets',
						error: createDatabaseError(error, 'WIDGET_FETCH_ACTIVE_FAILED', 'Failed to get active widgets')
					};
				}
			},
			{ category: CacheCategory.WIDGET, tenantId }
		);
	}

	/**
	 * Direct database query for active widgets
	 * This method pushes filtering to the database layer instead of fetching all widgets
	 * and filtering in application code. This is significantly faster for large widget sets.
	 * @returns {Promise<DatabaseResult<Widget[]>>} An array of active widget objects.
	 */
	async getActiveWidgets(): Promise<DatabaseResult<Widget[]>> {
		try {
			logger.debug('[widget-methods.getActiveWidgets] Querying active widgets from database');
			const widgets = await this.widgetModel.find({ isActive: true }).lean().exec();
			logger.debug('[widget-methods.getActiveWidgets] Query completed', {
				count: widgets.length,
				widgets: widgets.map((w) => ({ name: w.name, _id: w._id }))
			});
			return { success: true, data: widgets };
		} catch (error) {
			logger.error('[widget-methods.getActiveWidgets] Failed to query active widgets', {
				error: error instanceof Error ? error.message : String(error)
			});
			return {
				success: false,
				message: 'Failed to get active widgets',
				error: createDatabaseError(error, 'WIDGET_FETCH_ACTIVE_FAILED', 'Failed to get active widgets')
			};
		}
	}
}
