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
		return (this.core as any).db;
	}

	private get crud() {
		return (this.core as any).crud;
	}

	async setupMediaModels(): Promise<void> {
		// No-op for SQL - tables created by migrations
		logger.debug('Media models setup (no-op for SQL)');
	}

	files = {
		upload: async (file: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>> => {
			return this.crud.insert('media_items', file as any);
		},

		uploadMany: async (files: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaItem[]>> => {
			return this.crud.insertMany('media_items', files as any);
		},

		delete: async (fileId: DatabaseId): Promise<DatabaseResult<void>> => {
			return this.crud.delete('media_items', fileId);
		},

		deleteMany: async (fileIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return this.crud.deleteMany('media_items', fileIds);
		},

		getByFolder: async (
			folderId?: DatabaseId,
			options?: PaginationOptions,
			_recursive?: boolean
		): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
			return (this.core as any).wrap(async () => {
				const conditions = folderId ? [eq(schema.mediaItems.folderId, folderId)] : [isNull(schema.mediaItems.folderId)];

				// Ownership filtering
				if (options?.user) {
					const isAdmin = options.user.role === 'admin' || (options.user as any)?.isAdmin === true;
					if (!isAdmin) {
						// ALLOW GLOBAL: Users see their own files OR anything in the 'global' folder
						conditions.push(or(eq(schema.mediaItems.createdBy, options.user._id), like(schema.mediaItems.path, 'global/%')) as any);
					}
				}

				let q: any = this.db.select().from(schema.mediaItems);
				q = q.where(and(...conditions));

				if (options?.sortField) {
					const order = options.sortDirection === 'desc' ? desc : asc;
					if ((schema.mediaItems as any)[options.sortField]) {
						q = q.orderBy(order((schema.mediaItems as any)[options.sortField]));
					}
				}

				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;

				q = q.limit(limit).offset(offset);

				const results = await q;

				const [countResult] = (await this.db
					.select({ count: count() })
					.from(schema.mediaItems)
					.where(and(...conditions))) as any;

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
			return (this.core as any).wrap(async () => {
				const qry = `%${query}%`;
				const conditions = [or(like(schema.mediaItems.filename, qry), like(schema.mediaItems.originalFilename, qry))];

				// Ownership filtering
				if (options?.user) {
					const isAdmin = options.user.role === 'admin' || (options.user as any)?.isAdmin === true;
					if (!isAdmin) {
						// ALLOW GLOBAL: Users see their own files OR anything in the 'global' folder
						conditions.push(or(eq(schema.mediaItems.createdBy, options.user._id), like(schema.mediaItems.path, 'global/%')) as any);
					}
				}

				let q: any = this.db
					.select()
					.from(schema.mediaItems)
					.where(and(...conditions));

				if (options?.sortField) {
					const order = options.sortDirection === 'desc' ? desc : asc;
					if ((schema.mediaItems as any)[options.sortField]) {
						q = q.orderBy(order((schema.mediaItems as any)[options.sortField]));
					}
				}

				const limit = options?.pageSize || 20;
				const offset = ((options?.page || 1) - 1) * limit;

				q = q.limit(limit).offset(offset);

				const results = await q;

				const [countResult] = (await this.db
					.select({ count: count() })
					.from(schema.mediaItems)
					.where(and(...conditions))) as any;

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
			return (this.core as any).wrap(async () => {
				const results = await this.db
					.select({
						_id: schema.mediaItems._id,
						metadata: schema.mediaItems.metadata
					})
					.from(schema.mediaItems)
					.where(inArray(schema.mediaItems._id, fileIds));

				const metadataMap: Record<string, MediaMetadata> = {};
				results.forEach((r: any) => {
					metadataMap[r._id] = r.metadata as MediaMetadata;
				});
				return metadataMap;
			}, 'GET_FILE_METADATA_FAILED');
		},

		updateMetadata: async (fileId: DatabaseId, metadata: Partial<MediaMetadata>): Promise<DatabaseResult<MediaItem>> => {
			return (this.core as any).wrap(async () => {
				const [existing] = await this.db
					.select({ metadata: schema.mediaItems.metadata })
					.from(schema.mediaItems)
					.where(eq(schema.mediaItems._id, fileId))
					.limit(1);

				const newMetadata = { ...(existing?.metadata || {}), ...metadata };

				await this.db
					.update(schema.mediaItems)
					.set({ metadata: newMetadata as any, updatedAt: new Date() })
					.where(eq(schema.mediaItems._id, fileId));

				const [updated] = await this.db.select().from(schema.mediaItems).where(eq(schema.mediaItems._id, fileId)).limit(1);

				return utils.convertDatesToISO(updated) as unknown as MediaItem;
			}, 'UPDATE_FILE_METADATA_FAILED');
		},

		move: async (fileIds: DatabaseId[], targetFolderId?: DatabaseId): Promise<DatabaseResult<{ movedCount: number }>> => {
			return (this.core as any).wrap(async () => {
				const result = await this.db
					.update(schema.mediaItems)
					.set({ folderId: targetFolderId || null, updatedAt: new Date() })
					.where(inArray(schema.mediaItems._id, fileIds));
				return { movedCount: result[0].affectedRows };
			}, 'MOVE_FILES_FAILED');
		},

		duplicate: async (fileId: DatabaseId, newName?: string): Promise<DatabaseResult<MediaItem>> => {
			return (this.core as any).wrap(async () => {
				const [existing] = await this.db.select().from(schema.mediaItems).where(eq(schema.mediaItems._id, fileId)).limit(1);

				if (!existing) {
					throw new Error('File not found');
				}

				const id = utils.generateId();
				const now = new Date();
				const copy = {
					...existing,
					_id: id,
					filename: newName || `${existing.filename}_copy`,
					createdAt: now,
					updatedAt: now
				};

				await this.db.insert(schema.mediaItems).values(copy as any);

				const [created] = await this.db.select().from(schema.mediaItems).where(eq(schema.mediaItems._id, id)).limit(1);

				return utils.convertDatesToISO(created) as unknown as MediaItem;
			}, 'DUPLICATE_FILE_FAILED');
		}
	};

	folders = {
		create: async (folder: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaFolder>> => {
			return (this.core as any).wrap(async () => {
				const id = utils.generateId();
				const now = new Date();
				const values = {
					...folder,
					_id: id,
					type: 'folder',
					createdAt: now,
					updatedAt: now
				};
				await this.db.insert(schema.systemVirtualFolders).values(values as any);
				const [result] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, id)).limit(1);
				return utils.convertDatesToISO(result) as unknown as MediaFolder;
			}, 'CREATE_MEDIA_FOLDER_FAILED');
		},

		createMany: async (folders: Omit<MediaFolder, '_id' | 'createdAt' | 'updatedAt'>[]): Promise<DatabaseResult<MediaFolder[]>> => {
			return (this.core as any).wrap(async () => {
				const now = new Date();
				const values = folders.map((f) => ({
					...f,
					_id: utils.generateId(),
					type: 'folder',
					createdAt: now,
					updatedAt: now
				}));
				await this.db.insert(schema.systemVirtualFolders).values(values as any);

				const ids = values.map((v) => v._id);
				const results = await this.db.select().from(schema.systemVirtualFolders).where(inArray(schema.systemVirtualFolders._id, ids));

				return utils.convertArrayDatesToISO(results) as unknown as MediaFolder[];
			}, 'CREATE_MANY_MEDIA_FOLDERS_FAILED');
		},

		delete: async (folderId: DatabaseId): Promise<DatabaseResult<void>> => {
			return (this.core as any).wrap(async () => {
				await this.db.delete(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, folderId));
			}, 'DELETE_MEDIA_FOLDER_FAILED');
		},

		deleteMany: async (folderIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> => {
			return (this.core as any).wrap(async () => {
				const result = await this.db.delete(schema.systemVirtualFolders).where(inArray(schema.systemVirtualFolders._id, folderIds));
				return { deletedCount: result[0].affectedRows };
			}, 'DELETE_MANY_MEDIA_FOLDERS_FAILED');
		},

		getTree: async (_maxDepth?: number): Promise<DatabaseResult<MediaFolder[]>> => {
			return (this.core as any).wrap(async () => {
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
			return (this.core as any).wrap(async () => {
				const folderConditions = folderId ? [eq(schema.systemVirtualFolders.parentId, folderId)] : [eq(schema.systemVirtualFolders.parentId, '')];
				const fileConditions = folderId ? [eq(schema.mediaItems.folderId, folderId)] : [];

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
			return (this.core as any).wrap(async () => {
				await this.db
					.update(schema.systemVirtualFolders)
					.set({ parentId: targetParentId || null, updatedAt: new Date() })
					.where(eq(schema.systemVirtualFolders._id, folderId));

				const [updated] = await this.db.select().from(schema.systemVirtualFolders).where(eq(schema.systemVirtualFolders._id, folderId)).limit(1);

				return utils.convertDatesToISO(updated) as unknown as MediaFolder;
			}, 'MOVE_MEDIA_FOLDER_FAILED');
		}
	};
}
