/**
 * @file src/databases/postgresql/modules/widgets/widgets-module.ts
 * @description Widgets management module for PostgreSQL
 */

import { eq } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult, Widget } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';
import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';

export class WidgetsModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async setupWidgetModels(): Promise<void> {
		// No-op for SQL
	}

	async register(widget: Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<Widget>> {
		return this.core.wrap(async () => {
			const id = utils.generateId();
			const now = isoDateStringToDate(nowISODateString());
			const [result] = await this.db
				.insert(schema.widgets)
				.values({
					...widget,
					_id: id,
					createdAt: now,
					updatedAt: now
				} as typeof schema.widgets.$inferInsert)
				.returning();
			return utils.convertDatesToISO(result) as unknown as Widget;
		}, 'REGISTER_WIDGET_FAILED');
	}

	async findAll(): Promise<DatabaseResult<Widget[]>> {
		return this.core.wrap(async () => {
			const results = await this.db.select().from(schema.widgets);
			return utils.convertArrayDatesToISO(results) as unknown as Widget[];
		}, 'FIND_ALL_WIDGETS_FAILED');
	}

	async getActiveWidgets(): Promise<DatabaseResult<Widget[]>> {
		return this.core.wrap(async () => {
			const results = await this.db.select().from(schema.widgets).where(eq(schema.widgets.isActive, true));
			return utils.convertArrayDatesToISO(results) as unknown as Widget[];
		}, 'GET_ACTIVE_WIDGETS_FAILED');
	}

	async activate(widgetId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.update(schema.widgets).set({ isActive: true, updatedAt: isoDateStringToDate(nowISODateString()) }).where(eq(schema.widgets._id, widgetId as string));
		}, 'ACTIVATE_WIDGET_FAILED');
	}

	async deactivate(widgetId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.update(schema.widgets).set({ isActive: false, updatedAt: isoDateStringToDate(nowISODateString()) }).where(eq(schema.widgets._id, widgetId as string));
		}, 'DEACTIVATE_WIDGET_FAILED');
	}

	async update(widgetId: DatabaseId, widget: Partial<Omit<Widget, '_id' | 'createdAt' | 'updatedAt'>>): Promise<DatabaseResult<Widget>> {
		return this.core.wrap(async () => {
			const [result] = await this.db
				.update(schema.widgets)
				.set({ ...widget, updatedAt: isoDateStringToDate(nowISODateString()) })
				.where(eq(schema.widgets._id, widgetId as string))
				.returning();
			return utils.convertDatesToISO(result) as unknown as Widget;
		}, 'UPDATE_WIDGET_FAILED');
	}

	async delete(widgetId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.widgets).where(eq(schema.widgets._id, widgetId as string));
		}, 'DELETE_WIDGET_FAILED');
	}
}
