/**
 * @file src/databases/mariadb/modules/media/media-module.ts
 * @description Media management module for MariaDB
 *
 * Features:
 * - Upload files
 * - Upload multiple files
 * - Delete file
 * - Delete multiple files
 * - Get files by folder
 * - Search files
 * - Get file metadata
 * - Update file metadata
 * - Move files
 * - Get folders
 * - Create folder
 * - Update folder
 * - Delete folder
 */

import { isoDateStringToDate, nowISODateString } from '@src/utils/date-utils';
import { logger } from '@src/utils/logger';
import { and, asc, count, desc, eq, inArray, isNull, like, or } from 'drizzle-orm';
import type { DatabaseId, DatabaseResult, MediaFolder, MediaItem, MediaMetadata, PaginatedResult, PaginationOptions } from '../../../db-interface';
import type { AdapterCore } from '../../adapter/adapter-core';
import * as schema from '../../schema';
import * as utils from '../../utils';

export class MediaModule {
	private readonly core: AdapterCore;

	constructor(core: AdapterCore) {
		this.core = core;
	}

	private get db() {
		return this.core.db!;
	}

	private get crud() {
		return this.core.crud;
	}

	async setupMediaModels(): Promise<void> {
		// No-op for SQL - tables created by migrations
		logger.debug('Media models setup (no-op for SQL)');
	}

	files = {
		upload: async (file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>> => {
			return this.crud.insert<MediaItem>('media_items', file);
		},

		uploadMany: async (files: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaItem[]>> => {
			return this.crud.insertMany<MediaItem>('media_items', files);
		},

		delete: async (fileId: DatabaseId): Promise<DatabaseResult<void>> => {
			return this.crud.delete('media_items', fileId);
		},

		deleteMany: async (fileIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			// Using simplified query filter for MariaDB
			return this.core.wrap(async () => {
				const result = await this.db.delete(schema.mediaItems).where(inArray(schema.mediaItems._id, fileIds as string[]));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_FILES_FAILED');
		},

		getByFolder: async (
			folderId?: DatabaseId,
			options?: PaginationOptions,
			_recursive?: boolean
		): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
			return this.core.wrap(async () => {
				const conditions = folderId ? [eq(schema.mediaItems.folderId, folderId as string)] : [isNull(schema.mediaItems.folderId)];

				// Ownership filtering
				if (options?.user) {
					const isAdmin = options.user.role === 'admin' || options.user.isAdmin === true;
					if (!isAdmin) {
						// ALLOW GLOBAL: Users see their own files OR anything in the 'global' folder
						const userConditions = or(eq(schema.mediaItems.createdBy, options.user._id as string), like(schema.mediaItems.path, 'global/%'));
						if (userConditions) {
							conditions.push(userConditions);
						}
					}
				}

				let q = this.db.select().from(schema.mediaItems).$dynamic();
				if (conditions.length > 0) {
					q = q.where(and(...conditions));
				}

				if (options?.sortField) {
					const order = options.sortDirection === 'desc' ? desc : asc;
					const column = (schema.mediaItems as unknown as Record<string, unknown>)[options.sortField];
					if (column && typeof column === 'object') {
						q = q.orderBy(order(column as import('drizzle-orm').Column));
					}
				}

				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;

				q = q.limit(limit).offset(offset);

				const results = await q;

				const [countResult] = await this.db
					.select({ count: count() })
					.from(schema.mediaItems)
					.where(and(...conditions));

				const total = Number(countResult?.count || 0);

				return {
					items: utils.convertArrayDatesToISO(results) as unknown as MediaItem[],
					total,
					page: options?.page || 1,
					pageSize: limit,
					hasNextPage: offset + limit < total,
					hasPreviousPage: (options?.page || 1) > 1
				};
			}, 'GET_FILES_BY_FOLDER_FAILED');
		},

		search: async (query: string, options?: PaginationOptions): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
			return this.core.wrap(async () => {
				const qry = `%${query}%`;
				const conditions = [or(like(schema.mediaItems.filename, qry), like(schema.mediaItems.originalFilename, qry))];

				// Ownership filtering
				if (options?.user) {
					const isAdmin = options.user.role === 'admin' || options.user.isAdmin === true;
					if (!isAdmin) {
						// ALLOW GLOBAL: Users see their own files OR anything in the 'global' folder
						const userConditions = or(eq(schema.mediaItems.createdBy, options.user._id as string), like(schema.mediaItems.path, 'global/%'));
						if (userConditions) {
							conditions.push(userConditions);
						}
					}
				}

				let q = this.db.select().from(schema.mediaItems).$dynamic();
				q = q.where(and(...conditions));

				if (options?.sortField) {
					const order = options.sortDirection === 'desc' ? desc : asc;
					const column = (schema.mediaItems as unknown as Record<string, unknown>)[options.sortField];
					if (column && typeof column === 'object') {
						q = q.orderBy(order(column as import('drizzle-orm').Column));
					}
				}

				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;

				q = q.limit(limit).offset(offset);

				const results = await q;

				const [countResult] = await this.db
					.select({ count: count() })
					.from(schema.mediaItems)
					.where(and(...conditions));

				const total = Number(countResult?.count || 0);

				return {
					items: utils.convertArrayDatesToISO(results) as unknown as MediaItem[],
					total,
					page: options?.page || 1,
					pageSize: limit,
					hasNextPage: offset + limit < total,
					hasPreviousPage: (options?.page || 1) > 1
				};
			}, 'SEARCH_FILES_FAILED');
		},

		getMetadata: async (fileIds: DatabaseId[]): Promise<DatabaseResult<Record<string, MediaMetadata>>> => {
			return this.core.wrap(async () => {
				const results = await this.db
					.select({
						_id: schema.mediaItems._id,
						metadata: schema.mediaItems.metadata
					})
					.from(schema.mediaItems)
					.where(inArray(schema.mediaItems._id, fileIds as string[]));

				const metadataMap: Record<string, MediaMetadata> = {};
				results.forEach((r) => {
					metadataMap[r._id] = r.metadata as MediaMetadata;
				});
				return metadataMap;
			}, 'GET_FILE_METADATA_FAILED');
		},

		updateMetadata: async (fileId: DatabaseId, metadata: Partial<MediaMetadata>): Promise<DatabaseResult<MediaItem>> => {
			return this.core.wrap(async () => {
				const [existing] = await this.db
					.select({ metadata: schema.mediaItems.metadata })
					.from(schema.mediaItems)
					.where(eq(schema.mediaItems._id, fileId as string))
					.limit(1);

				const newMetadata = { ...((existing?.metadata as Record<string, unknown>) || {}), ...metadata };

				await this.db
					.update(schema.mediaItems)
					.set({ metadata: newMetadata, updatedAt: isoDateStringToDate(nowISODateString()) })
					.where(eq(schema.mediaItems._id, fileId as string));

				const [updated] = await this.db
					.select()
					.from(schema.mediaItems)
					.where(eq(schema.mediaItems._id, fileId as string))
					.limit(1);

				return utils.convertDatesToISO(updated) as unknown as MediaItem;
			}, 'UPDATE_FILE_METADATA_FAILED');
		},

		move: async (fileIds: DatabaseId[], targetFolderId?: DatabaseId): Promise<DatabaseResult<{ movedCount: number }>> => {
			return this.core.wrap(async () => {
				const result = await this.db
					.update(schema.mediaItems)
					.set({ folderId: (targetFolderId || null) as string | null, updatedAt: isoDateStringToDate(nowISODateString()) })
					.where(inArray(schema.mediaItems._id, fileIds as string[]));
				return { movedCount: result[0].affectedRows };
			}, 'MOVE_FILES_FAILED');
		},

		duplicate: async (fileId: DatabaseId, newName?: string): Promise<DatabaseResult<MediaItem>> => {
			return this.core.wrap(async () => {
				const [existing] = await this.db
					.select()
					.from(schema.mediaItems)
					.where(eq(schema.mediaItems._id, fileId as string))
					.limit(1);

				if (!existing) {
					throw new Error('File not found');
				}

				const id = utils.generateId() as string;
				const now = nowISODateString();
				const copy = {
					...existing,
					_id: id,
					filename: newName || `${existing.filename}_copy`,
					createdAt: isoDateStringToDate(now),
					updatedAt: isoDateStringToDate(now)
				};

				await this.db.insert(schema.mediaItems).values(copy as typeof schema.mediaItems.$inferInsert);

				const [created] = await this.db.select().from(schema.mediaItems).where(eq(schema.mediaItems._id, id)).limit(1);

				return utils.convertDatesToISO(created) as unknown as MediaItem;
			}, 'DUPLICATE_FILE_FAILED');
		}
	};

	folders = {
		create: async (folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>> => {
			return this.core.wrap(async () => {
				const id = utils.generateId() as string;
				const now = nowISODateString();
				const values = {
					...folder,
					_id: id,
					type: 'folder',
					createdAt: isoDateStringToDate(now),
					updatedAt: isoDateStringToDate(now)
				};
				await this.db.insert(schema.systemVirtualFolders).values(values as typeof schema.systemVirtualFolders.$inferInsert);
				const [result] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as MediaFolder;
			}, 'CREATE_MEDIA_FOLDER_FAILED');
		},

		createMany: async (folders: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaFolder[]>> => {
			return this.core.wrap(async () => {
				const now = nowISODateString();
				const values = folders.map((f) => ({
					...f,
					_id: utils.generateId() as string,
					type: 'folder',
					createdAt: isoDateStringToDate(now),
					updatedAt: isoDateStringToDate(now)
				}));
				await this.db.insert(schema.systemVirtualFolders).values(values as (typeof schema.systemVirtualFolders.$inferInsert)[]);

				const ids = values.map((v) => v._id);
				const results = await this.db.select().from(schema.systemVirtualFolders).where(inArray(schema.systemVirtualFolders._id, ids));

				return utils.convertArrayDatesToISO(results) as unknown as MediaFolder[];
			}, 'CREATE_MANY_MEDIA_FOLDERS_FAILED');
		},

		delete: async (folderId: DatabaseId): Promise<DatabaseResult<void>> => {
			return this.core.wrap(async () => {
				await this.db.delete(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, folderId as string));
			}, 'DELETE_MEDIA_FOLDER_FAILED');
		},

		deleteMany: async (folderIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return this.core.wrap(async () => {
				const result = await this.db.delete(schema.systemVirtualFolders).where(inArray(schema.systemVirtualFolders._id, folderIds as string[]));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_MEDIA_FOLDERS_FAILED');
		},

		getTree: async (_maxDepth?: number): Promise<DatabaseResult<MediaFolder[]>> => {
			return this.core.wrap(async () => {
				const results = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders.type, 'folder'));
				return utils.convertArrayDatesToISO(results) as unknown as MediaFolder[];
			}, 'GET_MEDIA_FOLDER_TREE_FAILED');
		},

		getFolderContents: async (
			folderId?: DatabaseId,
			_options?: PaginationOptions
		): Promise<
			DatabaseResult<{
				folders: MediaFolder[];
				files: MediaItem[];
				totalCount: number;
			}>
		> => {
			return this.core.wrap(async () => {
				const folderConditions = folderId
					? [eq(schema.systemVirtualFolders.parentId, folderId as string)]
					: [eq(schema.systemVirtualFolders.parentId, '')];
				const fileConditions = folderId ? [eq(schema.mediaItems.folderId, folderId as string)] : [];

				const folders = await this.db
					.select()
					.from(schema.systemVirtualFolders)
					.where(and(eq(schema.systemVirtualFolders.type, 'folder'), ...folderConditions));

				const files = await this.db
					.select()
					.from(schema.mediaItems)
					.where(fileConditions.length > 0 ? and(...fileConditions) : undefined);

				return {
					folders: utils.convertArrayDatesToISO(folders) as unknown as MediaFolder[],
					files: utils.convertArrayDatesToISO(files) as unknown as MediaItem[],
					totalCount: folders.length + files.length
				};
			}, 'GET_FOLDER_CONTENTS_FAILED');
		},

		move: async (folderId: DatabaseId, targetParentId?: DatabaseId): Promise<DatabaseResult<MediaFolder>> => {
			return this.core.wrap(async () => {
				await this.db
					.update(schema.systemVirtualFolders)
					.set({ parentId: (targetParentId || null) as string | null, updatedAt: isoDateStringToDate(nowISODateString()) })
					.where(eq(schema.systemVirtualFolders._id, folderId as string));

				const [updated] = await this.db
					.select()
					.from(schema.systemVirtualFolders)
					.where(eq(schema.systemVirtualFolders._id, folderId as string))
					.limit(1);

				return utils.convertDatesToISO(updated) as unknown as MediaFolder;
			}, 'MOVE_MEDIA_FOLDER_FAILED');
		}
	};
}
