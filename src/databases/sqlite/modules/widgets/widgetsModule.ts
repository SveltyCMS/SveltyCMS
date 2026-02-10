/**
 * @file src/databases/mariadb/modules/widgets/widgetsModule.ts
 * @description Widgets management module for MariaDB
 *
 * Features:
 * - Register widget
 * - Get all widgets
 * - Get widget by ID
 * - Update widget
 * - Delete widget
 */

import { eq } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult, Widget } from '../../../dbInterface';
import { AdapterCore } from '../../adapter/adapterCore';
import * as schema from '../../schema';
import * as utils from '../../utils';
import { logger } from '@src/utils/logger';

export class WidgetsModule {
	private core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return (this.core as any).db;
	}

	async setupWidgetModels(): Promise<void> {
		// No-op for SQL - tables created by migrations
		logger.debug('Widget models setup (no-op for SQL)');
	}

	async register(widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>> {
		return (this.core as any).wrap(async () => {
			const exists = await this.db.select().from(schema.widgets).where(eq(schema.widgets.name, widget.name)).limit(1);

			if (exists.length > 0) {
				await this.db
					.update(schema.widgets)
					.set({
						isActive: widget.isActive,
						instances: (widget as any).instances as any,
						dependencies: (widget as any).dependencies,
						updatedAt: new Date()
					})
					.where(eq(schema.widgets.name, widget.name));
				const [updated] = await this.db.select().from(schema.widgets).where(eq(schema.widgets.name, widget.name)).limit(1);
				return utils.convertDatesToISO(updated) as unknown as Widget;
			} else {
				const id = utils.generateId();
				await this.db.insert(schema.widgets).values({
					_id: id,
					name: widget.name,
					isActive: widget.isActive,
					instances: (widget as any).instances as any,
					dependencies: (widget as any).dependencies,
					createdAt: new Date(),
					updatedAt: new Date()
				});
				const [created] = await this.db.select().from(schema.widgets).where(eq(schema.widgets._id, id)).limit(1);
				return utils.convertDatesToISO(created) as unknown as Widget;
			}
		}, 'REGISTER_WIDGET_FAILED');
	}

	async findAll(): Promise<DatabaseResult<Widget[]>> {
		return (this.core as any).wrap(async () => {
			const results = await this.db.select().from(schema.widgets);
			return utils.convertArrayDatesToISO(results) as unknown as Widget[];
		}, 'FIND_ALL_WIDGETS_FAILED');
	}

	async getActiveWidgets(): Promise<DatabaseResult<Widget[]>> {
		return (this.core as any).wrap(async () => {
			const results = await this.db.select().from(schema.widgets).where(eq(schema.widgets.isActive, true));
			return utils.convertArrayDatesToISO(results) as unknown as Widget[];
		}, 'GET_ACTIVE_WIDGETS_FAILED');
	}

	async activate(widgetId: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			await this.db.update(schema.widgets).set({ isActive: true, updatedAt: new Date() }).where(eq(schema.widgets._id, widgetId));
		}, 'ACTIVATE_WIDGET_FAILED');
	}

	async deactivate(widgetId: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			await this.db.update(schema.widgets).set({ isActive: false, updatedAt: new Date() }).where(eq(schema.widgets._id, widgetId));
		}, 'DEACTIVATE_WIDGET_FAILED');
	}

	async update(widgetId: DatabaseId, widget: Partial<Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Widget>> {
		return (this.core as any).wrap(async () => {
			await this.db
				.update(schema.widgets)
				.set({ ...widget, updatedAt: new Date() } as any)
				.where(eq(schema.widgets._id, widgetId));
			const [updated] = await this.db.select().from(schema.widgets).where(eq(schema.widgets._id, widgetId)).limit(1);
			return utils.convertDatesToISO(updated) as unknown as Widget;
		}, 'UPDATE_WIDGET_FAILED');
	}

	async delete(widgetId: DatabaseId): Promise<DatabaseResult<void>> {
		return (this.core as any).wrap(async () => {
			await this.db.delete(schema.widgets).where(eq(schema.widgets._id, widgetId));
		}, 'DELETE_WIDGET_FAILED');
	}
}
