/**
 * @file src/databases/mongodb/methods/widgetMethods.ts
 * @description Widget registration and management for the MongoDB adapter.
 * Provides methods to create, read, update, and delete widgets,
 * as well as activate/deactivate them.
 */

import { logger } from '@utils/logger';
import type { Model } from 'mongoose';
import type { DatabaseId, Widget } from '../../dbInterface';
import type { Widget as IWidget } from '../../dbInterface'; // Assuming you have a document interface
import { createDatabaseError, withCache, CacheCategory, invalidateCollectionCache, invalidateCategoryCache, generateId } from './mongoDBUtils';
import { cacheService } from '@src/databases/CacheService';

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
	 * @returns {Promise<Widget>} The created widget object.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async register(widgetData: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<Widget> {
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

			return result;
		} catch (error) {
			logger.error(`[WidgetMethods] Failed to register widget "${widgetData.name}"`, {
				error: error instanceof Error ? error.message : String(error),
				collection: this.widgetModel.collection.name
			});
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

			// Invalidate widget caches - including the active widgets list cache
			logger.debug('[widgetMethods.activate] Invalidating active widgets cache');

			// NOTE: This cache clearing is a best-effort attempt but won't work correctly
			// for multi-tenant setups because widgetMethods doesn't have tenant context.
			// The REAL cache invalidation happens in /api/widgets/status/+server.ts
			// which has access to locals.tenantId. We keep this here as defense-in-depth.
			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'), // No tenant (default)
				cacheService.delete('widget:active:all', 'default'), // Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'), // default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);

			logger.debug('[widgetMethods.activate] Cache invalidated successfully');

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

			// Invalidate widget caches - including the active widgets list cache
			logger.debug('[widgetMethods.deactivate] Invalidating active widgets cache');

			// NOTE: This cache clearing is a best-effort attempt but won't work correctly
			// for multi-tenant setups because widgetMethods doesn't have tenant context.
			// The REAL cache invalidation happens in /api/widgets/status/+server.ts
			// which has access to locals.tenantId. We keep this here as defense-in-depth.
			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'), // No tenant (default)
				cacheService.delete('widget:active:all', 'default'), // Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'), // default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);

			logger.debug('[widgetMethods.deactivate] Cache invalidated successfully');

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
			logger.debug('[widgetMethods.update] Starting update', {
				widgetId,
				widgetData,
				collection: this.widgetModel.collection.name
			});

			// Check if widget exists before update
			const existingWidget = await this.widgetModel.findById(widgetId).lean().exec();
			logger.debug('[widgetMethods.update] Existing widget state', {
				widgetId,
				exists: !!existingWidget,
				currentIsActive: existingWidget?.isActive,
				currentUpdatedAt: existingWidget?.updatedAt
			});

			const result = await this.widgetModel.findByIdAndUpdate(widgetId, { $set: widgetData }, { new: true }).lean().exec();

			logger.debug('[widgetMethods.update] Update completed', {
				widgetId,
				success: !!result,
				resultIsActive: result?.isActive,
				resultUpdatedAt: result?.updatedAt
			});

			// Invalidate widget caches - including the active widgets list cache
			logger.debug('[widgetMethods.update] Invalidating caches', {
				widgetId,
				cacheKeys: ['widget:active:all (all tenants)']
			});

			// Clear cache for all possible tenant contexts since widgets are system-wide
			await Promise.all([
				invalidateCollectionCache(`widget:id:${widgetId}`),
				cacheService.delete('widget:active:all'), // No tenant (default)
				cacheService.delete('widget:active:all', 'default'), // Explicit default tenant
				cacheService.delete('widget:active:all', 'default-tenant'), // default-tenant
				invalidateCategoryCache(CacheCategory.WIDGET)
			]);

			logger.debug('[widgetMethods.update] Caches invalidated successfully', {
				widgetId
			});
			return result;
		} catch (error) {
			logger.error('[widgetMethods.update] Update failed', {
				widgetId,
				error: error instanceof Error ? error.message : String(error)
			});
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
			logger.debug('[widgetMethods.findAll] Querying widgets from database', {
				collection: this.widgetModel.collection.name
			});

			const widgets = await this.widgetModel.find().lean().exec();

			logger.debug('[widgetMethods.findAll] Query completed', {
				count: widgets.length,
				collection: this.widgetModel.collection.name,
				widgets: widgets.map((w) => ({ name: w.name, isActive: w.isActive, _id: w._id }))
			});

			return widgets;
		} catch (error) {
			logger.error('[widgetMethods.findAll] Failed to query widgets', {
				error: error instanceof Error ? error.message : String(error),
				collection: this.widgetModel.collection.name
			});
			throw createDatabaseError(error, 'WIDGET_FETCH_ALL_FAILED', 'Failed to get all widgets');
		}
	}

	/**
	 * Retrieves all active widgets from the database.
	 * Cached with 600s TTL since active widgets are frequently accessed on every page
	 * @returns {Promise<Widget[]>} An array of active widget objects.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async findAllActive(tenantId?: string): Promise<Widget[]> {
		logger.debug('[widgetMethods.findAllActive] Fetching active widgets (may be cached)', { tenantId });

		const result = await withCache(
			'widget:active:all',
			async () => {
				try {
					logger.debug('[widgetMethods.findAllActive] Cache MISS - querying database');
					const widgets = await this.widgetModel.find({ isActive: true }).lean().exec();
					logger.debug('[widgetMethods.findAllActive] Database query completed', {
						count: widgets.length,
						widgets: widgets.map((w) => w.name)
					});
					return widgets;
				} catch (error) {
					throw createDatabaseError(error, 'WIDGET_FETCH_ACTIVE_FAILED', 'Failed to get active widgets');
				}
			},
			{ category: CacheCategory.WIDGET, tenantId }
		);

		logger.debug('[widgetMethods.findAllActive] Returning result', {
			count: result.length,
			widgets: result.map((w) => w.name)
		});

		return result;
	}

	/**
	 * Direct database query for active widgets
	 * This method pushes filtering to the database layer instead of fetching all widgets
	 * and filtering in application code. This is significantly faster for large widget sets.
	 * @returns {Promise<Widget[]>} An array of active widget objects.
	 * @throws {DatabaseError} If the database operation fails.
	 */
	async getActiveWidgets(): Promise<Widget[]> {
		try {
			logger.debug('[widgetMethods.getActiveWidgets] Querying active widgets from database');
			const widgets = await this.widgetModel.find({ isActive: true }).lean().exec();
			logger.debug('[widgetMethods.getActiveWidgets] Query completed', {
				count: widgets.length,
				widgets: widgets.map((w) => ({ name: w.name, _id: w._id }))
			});
			return widgets;
		} catch (error) {
			logger.error('[widgetMethods.getActiveWidgets] Failed to query active widgets', {
				error: error instanceof Error ? error.message : String(error)
			});
			throw createDatabaseError(error, 'WIDGET_FETCH_ACTIVE_FAILED', 'Failed to get active widgets');
		}
	}
}
