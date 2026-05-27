/**
 * @file src/databases/postgresql/modules/system/virtual-folders-module.ts
 * @description Virtual folders module for PostgreSQL
 */

import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';
import { eq } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult, SystemVirtualFolder } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';

export class VirtualFoldersModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	async create(folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>> {
		return this.core.wrap(async () => {
			const id = utils.generateId();
			const now = isoDateStringToDate(nowISODateString());
			const [result] = await this.db
				.insert(schema.systemVirtualFolders)
				.values({
					...folder,
					_id: id,
					createdAt: now,
					updatedAt: now
				} as typeof schema.systemVirtualFolders.$inferInsert)
				.returning();
			return utils.convertDatesToISO(result) as unknown as SystemVirtualFolder;
		}, 'CREATE_VIRTUAL_FOLDER_FAILED');
	}

	async getById(folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder | null>> {
		return this.core.wrap(async () => {
			const [result] = await this.db
				.select()
				.from(schema.systemVirtualFolders)
				.where(eq(schema.systemVirtualFolders._id, folderId as string))
				.limit(1);
			return result ? (utils.convertDatesToISO(result) as unknown as SystemVirtualFolder) : null;
		}, 'GET_VIRTUAL_FOLDER_FAILED');
	}

	async getByParentId(parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>> {
		return this.core.wrap(async () => {
			const results = await this.db
				.select()
				.from(schema.systemVirtualFolders)
				.where(eq(schema.systemVirtualFolders.parentId, (parentId as string) || ''));
			return utils.convertArrayDatesToISO(results) as unknown as SystemVirtualFolder[];
		}, 'GET_VIRTUAL_FOLDERS_BY_PARENT_FAILED');
	}

	async getAll(): Promise<DatabaseResult<SystemVirtualFolder[]>> {
		return this.core.wrap(async () => {
			const results = await this.db.select().from(schema.systemVirtualFolders);
			return utils.convertArrayDatesToISO(results) as unknown as SystemVirtualFolder[];
		}, 'GET_ALL_VIRTUAL_FOLDERS_FAILED');
	}

	async update(folderId: DatabaseId, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>> {
		return this.core.wrap(async () => {
			const [result] = await this.db
				.update(schema.systemVirtualFolders)
				.set({ ...updateData, updatedAt: isoDateStringToDate(nowISODateString()) } as typeof schema.systemVirtualFolders.$inferInsert)
				.where(eq(schema.systemVirtualFolders._id, folderId as string))
				.returning();
			return utils.convertDatesToISO(result) as unknown as SystemVirtualFolder;
		}, 'UPDATE_VIRTUAL_FOLDER_FAILED');
	}

	async delete(folderId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, folderId as string));
		}, 'DELETE_VIRTUAL_FOLDER_FAILED');
	}

	async addToFolder(_contentId: DatabaseId, _folderPath: string): Promise<DatabaseResult<void>> {
		return this.core.notImplemented('systemVirtualFolder.addToFolder');
	}

	async getContents(
		folderPath: string
	): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: import('../../../db-interface').MediaItem[] }>> {
		return this.core.wrap(async () => {
			const folders = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.path, folderPath));
			// Files logic would need mediaItems join or similar
			return {
				folders: utils.convertArrayDatesToISO(folders) as unknown as SystemVirtualFolder[],
				files: []
			};
		}, 'GET_VIRTUAL_FOLDER_CONTENTS_FAILED');
	}

	async exists(path: string): Promise<DatabaseResult<boolean>> {
		return this.core.wrap(async () => {
			const [result] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.path, path)).limit(1);
			return !!result;
		}, 'VIRTUAL_FOLDER_EXISTS_FAILED');
	}

	async ensure(folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>> {
		return this.core.wrap(async () => {
			const [existing] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.path, folder.path)).limit(1);
			if (existing) {
				return utils.convertDatesToISO(existing) as unknown as SystemVirtualFolder;
			}
			const res = await this.create(folder);
			if (!res.success) {
				throw res.error;
			}
			return res.data;
		}, 'ENSURE_VIRTUAL_FOLDER_FAILED');
	}
}
