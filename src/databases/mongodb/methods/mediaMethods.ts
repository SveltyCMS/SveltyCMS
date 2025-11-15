/**
 * @file src/databases/mongodb/methods/mediaMethods.ts
 * @description Media file management for the MongoDB adapter.
 * This implementation uses flat file storage with hash-based naming.
 * Files are physically organized in year/month folders on disk.
 * The database stores only metadata - no folder hierarchy.
 * Relies on Dependency Injection for testability.
 */

import { logger } from '@utils/logger';
import type Mongoose from 'mongoose';
import type { DatabaseId, MediaItem, MediaMetadata, PaginatedResult, PaginationOptions } from '../../dbInterface';
import { mediaSchema, type IMedia } from '../models/media';
import { createDatabaseError, withCache, CacheCategory, invalidateCategoryCache } from './mongoDBUtils';

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
		if (!mongooseInstance.models['media']) {
			mongooseInstance.model('media', mediaSchema);
			logger.debug("Model 'media' was registered.");
		}
	}

	// ============================================================
	// File Operations
	// ============================================================

	/// Uploads multiple media files in a single, efficient batch operation
	async uploadMany(files: Omit<MediaItem, '_id'>[]): Promise<MediaItem[]> {
		try {
			const result = await this.mediaModel.insertMany(files);

			// Invalidate media caches
			await invalidateCategoryCache(CacheCategory.MEDIA);

			return result.map((doc) => doc.toObject() as unknown as MediaItem);
		} catch (error) {
			throw createDatabaseError(error, 'MEDIA_UPLOAD_MANY_ERROR', 'Failed to upload media files');
		}
	}

	// Deletes multiple media files in a single batch operation
	async deleteMany(fileIds: DatabaseId[]): Promise<{ deletedCount: number }> {
		try {
			if (fileIds.length === 0) {
				return { deletedCount: 0 };
			}
			const result = await this.mediaModel.deleteMany({ _id: { $in: fileIds } });

			// Invalidate media caches
			await invalidateCategoryCache(CacheCategory.MEDIA);

			return { deletedCount: result.deletedCount };
		} catch (error) {
			throw createDatabaseError(error, 'MEDIA_DELETE_MANY_ERROR', 'Failed to delete media files');
		}
	}

	// Updates metadata for a single file
	async updateMetadata(fileId: DatabaseId, metadata: Partial<MediaMetadata>): Promise<MediaItem | null> {
		try {
			const updateData = Object.entries(metadata).reduce(
				(acc, [key, value]) => {
					acc[`metadata.${key}`] = value;
					return acc;
				},
				{} as Record<string, unknown>
			);

			updateData.updatedAt = new Date();

			const result = await this.mediaModel.findByIdAndUpdate(fileId, { $set: updateData }, { new: true }).lean().exec();

			// Invalidate media caches
			await invalidateCategoryCache(CacheCategory.MEDIA);

			return result as unknown as MediaItem | null;
		} catch (error) {
			throw createDatabaseError(error, 'UPDATE_METADATA_ERROR', 'Failed to update metadata');
		}
	}

	// Moves multiple files to a different folder
	async move(fileIds: DatabaseId[], targetFolderId?: DatabaseId): Promise<{ movedCount: number }> {
		try {
			const result = await this.mediaModel.updateMany({ _id: { $in: fileIds } }, { $set: { folderId: targetFolderId, updatedAt: new Date() } });

			// Invalidate media caches
			await invalidateCategoryCache(CacheCategory.MEDIA);

			return { movedCount: result.modifiedCount };
		} catch (error) {
			throw createDatabaseError(error, 'MEDIA_MOVE_ERROR', 'Failed to move files');
		}
	}

	// Retrieves a paginated list of media files, optionally filtered by folder
	async getFiles(folderId?: DatabaseId, options: PaginationOptions = {}): Promise<PaginatedResult<MediaItem>> {
		const { page = 1, pageSize = 25, sortField = 'createdAt', sortDirection = 'desc' } = options;
		const cacheKey = `media:files:${folderId || 'root'}:${page}:${pageSize}:${sortField}:${sortDirection}`;

		return withCache(
			cacheKey,
			async () => {
				try {
					const query = folderId ? { folderId } : { folderId: { $in: [null, undefined] } }; // Root files
					const skip = (page - 1) * pageSize;
					const sort: Record<string, 1 | -1> = { [sortField]: sortDirection === 'asc' ? 1 : -1 };

					const [items, total] = await Promise.all([
						this.mediaModel.find(query).sort(sort).skip(skip).limit(pageSize).lean().exec(),
						this.mediaModel.countDocuments(query)
					]);

					return {
						items: items as unknown as MediaItem[],
						total,
						page,
						pageSize,
						hasNextPage: page * pageSize < total,
						hasPreviousPage: page > 1
					};
				} catch (error) {
					throw createDatabaseError(error, 'GET_FILES_ERROR', 'Failed to fetch media files');
				}
			},
			{ category: CacheCategory.MEDIA }
		);
	}
}
