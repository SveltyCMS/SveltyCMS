/**
 * @file src/databases/mariadb/modules/system/virtual-folders-module.ts
 * @description System virtual folders module for MariaDB
 *
 * Features:
 * - Get all virtual folders
 * - Get virtual folder by ID
 * - Get virtual folders by parent ID
 * - Create virtual folder
 * - Update virtual folder
 * - Delete virtual folder
 * - Check if virtual folder exists
 * - Get virtual folder contents
 * - Add to virtual folder
 */

import { eq, sql } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult, MediaItem, SystemVirtualFolder } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';
import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';

export class VirtualFoldersModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db;
	}

	async getAll(): Promise<DatabaseResult<SystemVirtualFolder[]>> {
		return this.core.wrap(async () => {
			const folders = await this.db.select().from(schema.systemVirtualFolders);
			return utils.convertArrayDatesToISO(folders) as unknown as SystemVirtualFolder[];
		}, 'GET_VIRTUAL_FOLDERS_FAILED');
	}

	async getById(folderId: DatabaseId): Promise<DatabaseResult<SystemVirtualFolder | null>> {
		return this.core.wrap(async () => {
			const [folder] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, folderId)).limit(1);
			return folder ? (utils.convertDatesToISO(folder) as unknown as SystemVirtualFolder) : null;
		}, 'GET_VIRTUAL_FOLDER_FAILED');
	}

	async getByParentId(parentId: DatabaseId | null): Promise<DatabaseResult<SystemVirtualFolder[]>> {
		return this.core.wrap(async () => {
			const folders = parentId
				? await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.parentId, parentId))
				: await this.db
						.select()
						.from(schema.systemVirtualFolders)
						.where(sql`${schema.systemVirtualFolders.parentId} IS NULL`);

			return utils.convertArrayDatesToISO(folders) as unknown as SystemVirtualFolder[];
		}, 'GET_VIRTUAL_FOLDERS_BY_PARENT_FAILED');
	}

	async create(folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>> {
		return this.core.wrap(async () => {
			const id = utils.generateId();
			await this.db.insert(schema.systemVirtualFolders).values({
				_id: id,
				name: folder.name,
				path: folder.path,
				parentId: folder.parentId || null,
				icon: folder.icon || null,
				order: folder.order,
				type: folder.type,
				metadata: folder.metadata as Record<string, unknown>,
				tenantId: folder.tenantId || null,
				createdAt: isoDateStringToDate(nowISODateString()),
				updatedAt: isoDateStringToDate(nowISODateString())
			});

			const [created] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, id));
			return utils.convertDatesToISO(created) as unknown as SystemVirtualFolder;
		}, 'CREATE_VIRTUAL_FOLDER_FAILED');
	}

	async update(folderId: DatabaseId, updateData: Partial<SystemVirtualFolder>): Promise<DatabaseResult<SystemVirtualFolder>> {
		return this.core.wrap(async () => {
			const { createdAt, ...rest } = updateData;
			const values: any = { ...rest };
			if (createdAt) {
				values.createdAt = isoDateStringToDate(createdAt);
			}
			values.updatedAt = isoDateStringToDate(nowISODateString());
			if (updateData.metadata) {
				values.metadata = updateData.metadata;
			}

			await this.db
				.update(schema.systemVirtualFolders)
				.set(values)
				.where(eq(schema.systemVirtualFolders._id, folderId as string));

			const [updated] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, folderId as string));
			return utils.convertDatesToISO(updated) as unknown as SystemVirtualFolder;
		}, 'UPDATE_VIRTUAL_FOLDER_FAILED');
	}

	async delete(folderId: DatabaseId): Promise<DatabaseResult<void>> {
		return this.core.wrap(async () => {
			await this.db.delete(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, folderId));
		}, 'DELETE_VIRTUAL_FOLDER_FAILED');
	}

	async exists(path: string): Promise<DatabaseResult<boolean>> {
		return this.core.wrap(async () => {
			const [folder] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.path, path)).limit(1);
			return !!folder;
		}, 'CHECK_VIRTUAL_FOLDER_EXISTS_FAILED');
	}

	async getContents(folderPath: string): Promise<DatabaseResult<{ folders: SystemVirtualFolder[]; files: MediaItem[] }>> {
		return this.core.wrap(async () => {
			const [folder] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.path, folderPath)).limit(1);
			if (!folder) {
				throw new Error('Folder not found');
			}

			const subfolders = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.parentId, folder._id));
			const files = await this.db.select().from(schema.mediaItems).where(eq(schema.mediaItems.folderId, folder._id));

			return {
				folders: utils.convertArrayDatesToISO(subfolders) as unknown as SystemVirtualFolder[],
				files: utils.convertArrayDatesToISO(files) as unknown as MediaItem[]
			};
		}, 'GET_VIRTUAL_FOLDER_CONTENTS_FAILED');
	}

	async addToFolder(_contentId: DatabaseId, _folderPath: string): Promise<DatabaseResult<void>> {
		return this.core.notImplemented('systemVirtualFolder.addToFolder');
	}

	async ensure(folder: Omit<SystemVirtualFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<SystemVirtualFolder>> {
		return this.core.wrap(async () => {
			const [existing] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.path, folder.path)).limit(1);

			if (existing) {
				return utils.convertDatesToISO(existing) as unknown as SystemVirtualFolder;
			}

			const res = await this.create(folder);
			if (!res.success) {
				throw new Error(res.message);
			}
			return res.data;
		}, 'ENSURE_VIRTUAL_FOLDER_FAILED');
	}
}
