/**
 * @file src/databases/mongodb/methods/media-methods.ts
 * @description Media file management for the MongoDB adapter.
 * This implementation uses flat file storage with hash-based naming.
 * Files are physically organized in year/month folders on disk.
 * The database stores only metadata - no folder hierarchy.
 * Relies on Dependency Injection for testability.
 */

import { safeQuery } from '@src/utils/security/safe-query';
import { logger } from '@utils/logger';
import type Mongoose from 'mongoose';
import type { DatabaseId, DatabaseResult, MediaItem, MediaMetadata, PaginatedResult, PaginationOptions } from '../../db-interface';
import { type IMedia, mediaSchema } from '../models/media';
import { CacheCategory, invalidateCategoryCache, withCache } from './mongodb-cache-utils';
import { createDatabaseError } from './mongodb-utils';

// Define model types for dependency injection
type MediaModelType = Mongoose.Model<IMedia>;

export class MongoMediaMethods {
	private readonly mediaModel: MediaModelType;

	/**
	 * Constructs the MongoMediaMethods instance.
	 * @param {MediaModelType} mediaModel - The Mongoose model for the 'media' collection.
	 */
	constructor(mediaModel: MediaModelType) {
		this.mediaModel = mediaModel;
		logger.debug('MongoMediaMethods initialized with media model.');
	}

	/**
	 * Idempotently registers the required Mongoose models.
	 * This should be called once during application startup.
	 * @param {typeof Mongoose} mongooseInstance - The active Mongoose instance.
	 */
	static registerModels(mongooseInstance: typeof Mongoose): void {
		if (!mongooseInstance.models.media) {
			mongooseInstance.model('media', mediaSchema);
			logger.debug("Model 'media' was registered.");
		}
	}

	// ============================================================
	// File Operations
	// ============================================================

	/// Uploads multiple media files in a single, efficient batch operation
	async uploadMany(files: Omit<MediaItem, '_id'>[]): Promise<DatabaseResult<MediaItem[]>> {
		try {
			const result = await this.mediaModel.insertMany(files);

			// Invalidate media caches
			await invalidateCategoryCache(CacheCategory.MEDIA);

			return {
				success: true,
				data: result.map((doc) => doc.toObject() as unknown as MediaItem)
			};
		} catch (error) {
			return {
				success: false,
				message: 'Failed to upload media files',
				error: createDatabaseError(error, 'MEDIA_UPLOAD_MANY_ERROR', 'Failed to upload media files')
			};
		}
	}

	// Deletes multiple media files in a single batch operation
	async deleteMany(fileIds: DatabaseId[]): Promise<DatabaseResult<{ deletedCount: number }>> {
		try {
			if (fileIds.length === 0) {
				return { success: true, data: { deletedCount: 0 } };
			}
			const result = await this.mediaModel.deleteMany({
				_id: { $in: fileIds }
			});

			// Invalidate media caches
			await invalidateCategoryCache(CacheCategory.MEDIA);

			return { success: true, data: { deletedCount: result.deletedCount } };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to delete media files',
				error: createDatabaseError(error, 'MEDIA_DELETE_MANY_ERROR', 'Failed to delete media files')
			};
		}
	}

	// Updates metadata for a single file
	async updateMetadata(fileId: DatabaseId, metadata: Partial<MediaMetadata>): Promise<DatabaseResult<MediaItem | null>> {
		try {
			const updateData = Object.entries(metadata).reduce(
				(acc, [key, value]) => {
					acc[`metadata.${key}`] = value;
					return acc;
				},
				{} as Record<string, unknown>
			);

			updateData.updatedAt = new Date();

			const result = await this.mediaModel.findByIdAndUpdate(fileId, { $set: updateData }, { returnDocument: 'after' }).lean().exec();

			// Invalidate media caches
			await invalidateCategoryCache(CacheCategory.MEDIA);

			return { success: true, data: result as unknown as MediaItem | null };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to update metadata',
				error: createDatabaseError(error, 'UPDATE_METADATA_ERROR', 'Failed to update metadata')
			};
		}
	}

	// Moves multiple files to a different folder
	async move(fileIds: DatabaseId[], targetFolderId?: DatabaseId): Promise<DatabaseResult<{ movedCount: number }>> {
		try {
			const result = await this.mediaModel.updateMany({ _id: { $in: fileIds } }, { $set: { folderId: targetFolderId, updatedAt: new Date() } });

			// Invalidate media caches
			await invalidateCategoryCache(CacheCategory.MEDIA);

			return { success: true, data: { movedCount: result.modifiedCount } };
		} catch (error) {
			return {
				success: false,
				message: 'Failed to move files',
				error: createDatabaseError(error, 'MEDIA_MOVE_ERROR', 'Failed to move files')
			};
		}
	}

	// Retrieves a paginated list of media files, optionally filtered by folder
	async getFiles(
		folderId?: DatabaseId,
		options: PaginationOptions = {},
		recursive = false,
		tenantId?: string | null
	): Promise<DatabaseResult<PaginatedResult<MediaItem>>> {
		const { page = 1, pageSize = 25, sortField = 'createdAt', sortDirection = 'desc', user } = options;

		// Determine if we should filter by user ownership
		// Admins see all files, others see only their own
		const userId = user?._id?.toString();
		const isAdmin = user?.role === 'admin' || (user as any)?.isAdmin === true;
		const shouldFilterByUser = user && !isAdmin;

		const cacheKey = `media:files:${folderId || 'root'}:${page}:${pageSize}:${sortField}:${sortDirection}:rec:${recursive}:${tenantId || 'no-tenant'}${shouldFilterByUser ? `:user:${userId}` : ''}`;

		const fetchData = async (): Promise<DatabaseResult<PaginatedResult<MediaItem>>> => {
			try {
				let query: Record<string, any> = {};
				if (recursive) {
					// Fetch ALL files, ignoring folderId
					query = {};
				} else {
					query = folderId ? { folderId } : { folderId: { $in: [null, undefined] } }; // Root files
				}

				// Apply user ownership filter if necessary
				if (shouldFilterByUser) {
					// ALLOW GLOBAL: Users see their own files OR anything in the 'global' folder
					query = {
						...query,
						$or: [{ createdBy: userId }, { user: userId }, { path: /^global\// }]
					};
				}

				// Apply tenant isolation and security
				const secureQuery = safeQuery(query, tenantId);

				// Add fallback for legacy/untenanted media if tenantId is provided
				if (tenantId && secureQuery.tenantId === tenantId) {
					// Allow items matching tenantId OR having no tenantId (legacy/system)
					secureQuery.tenantId = { $in: [tenantId, null, undefined] };
				}

				const skip = (page - 1) * pageSize;
				const sort: Record<string, 1 | -1> = {
					[sortField]: sortDirection === 'asc' ? 1 : -1
				};

				const [items, total] = await Promise.all([
					this.mediaModel
						.find(secureQuery as any)
						.sort(sort)
						.skip(skip)
						.limit(pageSize)
						.lean()
						.exec(),
					this.mediaModel.countDocuments(secureQuery as any)
				]);

				return {
					success: true,
					data: {
						items: items as unknown as MediaItem[],
						total,
						page,
						pageSize,
						hasNextPage: page * pageSize < total,
						hasPreviousPage: page > 1
					}
				};
			} catch (error) {
				return {
					success: false,
					message: 'Failed to fetch media files',
					error: createDatabaseError(error, 'GET_FILES_ERROR', 'Failed to fetch media files')
				};
			}
		};

		return withCache(cacheKey, fetchData, { category: CacheCategory.MEDIA });
	}
}
