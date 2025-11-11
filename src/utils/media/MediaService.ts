/**
 * @file utils/media/MediaService.ts
 * @description Provides a service class for media operations.
 */

import { error } from '@sveltejs/kit';
import mime from 'mime-types';
import Path from 'path';
import sharp from 'sharp';

// Database Interface
import type { DatabaseId, dbInterface, ISODateString, MediaItem } from '@src/databases/dbInterface';

// Media
import type { MediaAccess, MediaBase, MediaImage, MediaType, ResizedImage } from './mediaModels';
import { MediaTypeEnum } from './mediaModels';
import { getSanitizedFileName, hashFileContent } from './mediaProcessing';
import { saveFileToDisk, saveResizedImages } from './mediaStorage';
import { validateMediaFile } from './mediaUtils';

// Permission Management
import { validateUserPermission as checkMediaAccess } from '@src/databases/auth/permissions';

// System Logger
import { logger } from '@utils/logger.server';

// Media Cache
import { cacheService } from '@src/databases/CacheService';

// Extended MediaBase interface to include thumbnails
interface MediaBaseWithThumbnails extends MediaBase {
	thumbnails?: {
		thumbnail?: {
			url: string;
			width: number;
			height: number;
		};
		[key: string]:
			| {
					url: string;
					width: number;
					height: number;
			  }
			| undefined;
	};
}

export class MediaService {
	private db: dbInterface;
	private initialized: boolean = false;
	private readonly mimeTypePattern = /^(image|video|audio)\/(jpeg|png|gif|svg\+xml|webp|mp4|webm|ogg|mpeg|pdf)$/;

	constructor(db: dbInterface) {
		this.db = db;
		this.checkDatabaseConnection();
	}

	// Check if database is connected
	private checkDatabaseConnection() {
		if (!this.db) {
			const message = 'Database adapter is not available';
			logger.error(message);
			throw error(500, message);
		}

		this.initialized = true;
	}

	// Ensure service is initialized before operations
	private ensureInitialized() {
		if (!this.initialized) {
			this.checkDatabaseConnection();
		}
	}

	/**
	 * Uploads a file to storage (disk) and creates media record
	 */
	private async uploadFile(file: File | Blob, userId: string, access: MediaAccess): Promise<{ url: string; fileInfo: MediaImage }> {
		const startTime = performance.now();

		try {
			logger.debug('Starting file upload', {
				fileName: file instanceof File ? file.name : 'blob',
				fileSize: file.size,
				userId
			});

			const buffer = Buffer.from(await file.arrayBuffer());
			const fileName = file instanceof File ? file.name : 'blob';
			const mimeType = file.type || mime.lookup(fileName) || 'application/octet-stream';

			logger.debug('File processed', {
				fileName,
				mimeType,
				bufferSize: buffer.length,
				processingTime: performance.now() - startTime
			});

			const hash = await hashFileContent(buffer);
			const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
			const sanitizedFileName = fileNameWithoutExt;

			// Define the base path for media gallery images
			const basePath = 'global';

			// Save original image in 'original' subfolder
			const originalSubfolder = 'original';
			const originalFileName = `${sanitizedFileName}-${hash}.${ext}`;
			const originalUrl = Path.posix.join(basePath, originalSubfolder, originalFileName);

			logger.debug('Saving original file', {
				originalUrl,
				basePath,
				subfolder: originalSubfolder
			});

			await saveFileToDisk(buffer, originalUrl);

			// Process image if it's an image type
			const isImage = mimeType.startsWith('image/');
			let thumbnails: Record<string, ResizedImage> = {};
			let width: number | undefined;
			let height: number | undefined;

			if (isImage) {
				logger.debug('Processing image variants', {
					fileName,
					mimeType
				});
				const image = sharp(buffer);
				const metadata = await image.metadata();
				width = metadata.width;
				height = metadata.height;
				thumbnails = await saveResizedImages(buffer, hash, sanitizedFileName, mimeType, ext, basePath);
			}

			const fileInfo: MediaImage = {
				type: MediaTypeEnum.Image as const,
				filename: sanitizedFileName,
				hash,
				path: Path.join(basePath, originalSubfolder),
				url: originalUrl,
				mimeType,
				size: buffer.length,
				thumbnails,
				access,
				width: width ?? 0,
				height: height ?? 0,
				createdAt: new Date().toISOString() as ISODateString,
				updatedAt: new Date().toISOString() as ISODateString,
				user: userId
			};

			logger.info('File upload completed', {
				fileName,
				url: originalUrl,
				fileSize: buffer.length,
				isImage,
				resizedVariants: Object.keys(thumbnails),
				totalProcessingTime: performance.now() - startTime
			});

			return { url: originalUrl, fileInfo };
		} catch (err) {
			const message = `Error uploading file: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				fileName: file instanceof File ? file.name : 'blob',
				error: err,
				stack: new Error().stack,
				processingTime: performance.now() - startTime
			});
			throw new Error(message);
		}
	}

	// Saves a media file and its associated data
	public async saveMedia(file: File, userId: string, access: MediaAccess): Promise<MediaType> {
		const startTime = performance.now();
		this.ensureInitialized();
		logger.trace('Starting media upload process', {
			filename: file.name,
			fileSize: file.size,
			mimeType: file.type
		});
		if (!file) {
			const message = 'File is required';
			logger.error(message, {
				processingTime: performance.now() - startTime
			});
			throw Error(message);
		}

		// Validate the media file before processing
		const validation = validateMediaFile(file, this.mimeTypePattern, 50 * 1024 * 1024); // 50MB limit
		if (!validation.isValid) {
			const message = `File validation failed: ${validation.message}`;
			logger.error(message, {
				fileName: file.name,
				fileSize: file.size,
				processingTime: performance.now() - startTime
			});
			throw Error(message);
		}

		try {
			// First upload the file and get basic file info
			const { fileInfo } = await this.uploadFile(file, userId, access);

			// Create media object with required properties
			const mediaType = this.getMediaType(fileInfo.mimeType);
			if (!mediaType) {
				const message = 'Invalid media type';
				logger.error(message, {
					mimeType: fileInfo.mimeType,
					processingTime: performance.now() - startTime
				});
				throw Error(message);
			}

			const media: MediaBaseWithThumbnails = {
				type: mediaType,
				hash: fileInfo.hash,
				filename: file.name,
				path: fileInfo.path || '',
				url: fileInfo.url,
				mimeType: fileInfo.mimeType,
				size: file.size,
				user: userId,
				createdAt: new Date().toISOString() as ISODateString,
				updatedAt: new Date().toISOString() as ISODateString,
				metadata: {
					originalFilename: file.name,
					uploadedBy: userId,
					uploadTimestamp: new Date().toISOString(),
					processingTimeMs: performance.now() - startTime
				},
				versions: [
					{
						version: 1,
						url: fileInfo.url,
						createdAt: new Date().toISOString() as ISODateString,
						createdBy: userId
					}
				],
				access,
				thumbnails: fileInfo.thumbnails || {}
			};

			// Create clean media object for database storage
			const cleanMedia = this.createCleanMediaObject(media);

			logger.debug('Saving media to database', {
				filename: cleanMedia.filename,
				mimeType: cleanMedia.mimeType,
				processingTime: performance.now() - startTime
			});

			const mediaResult = await this.db.crud.insert('MediaItem', cleanMedia);
			if (!mediaResult.success) {
				throw new Error(`Failed to insert media: ${mediaResult.message}`);
			}
			const mediaId = mediaResult.data;
			logger.debug('Media saved to database', {
				mediaId,
				processingTime: performance.now() - startTime
			});

			const savedMedia = { ...cleanMedia, _id: mediaId };

			// Cache the saved media
			await cacheService.set(`media:${mediaId}`, savedMedia, 3600);

			logger.info('Media processing completed successfully', {
				mediaId,
				originalUrl: savedMedia?.path,
				thumbnails: savedMedia?.thumbnails ? Object.keys(savedMedia.thumbnails) : [],
				totalProcessingTime: performance.now() - startTime
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			return savedMedia as any as MediaType;
		} catch (err) {
			const message = `Error saving media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				fileName: file?.name,
				error: err,
				stack: err instanceof Error ? err.stack : undefined,
				processingTime: performance.now() - startTime
			});
			throw error(500, message);
		}
	}

	private createCleanMediaObject(object: MediaBaseWithThumbnails): Omit<MediaItem, '_id'> {
		const dbObject: Omit<MediaItem, '_id'> = {
			...object,
			path: object.path || '',
			originalFilename: object.filename, // Use filename as originalFilename
			createdAt: object.createdAt,
			updatedAt: object.updatedAt,
			createdBy: object.user as DatabaseId,
			updatedBy: object.user as DatabaseId,
			thumbnails: object.thumbnails || {},
			metadata: object.metadata || {},
			size: object.size || 0
		};

		return dbObject;
	}

	// Updates a media item with new data
	public async updateMedia(id: string, updates: Partial<MediaBase>): Promise<void> {
		this.ensureInitialized();

		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}

		if (!updates || typeof updates !== 'object') {
			throw Error('Invalid updates: Must be a valid MediaBase partial object');
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await this.db.crud.update('MediaItem', id as DatabaseId, updates as any);
			if (!result.success) {
				throw new Error(result.message);
			}
			// Invalidate cache
			await cacheService.delete(`media:${id}`);
			logger.info('Media updated successfully', { id });
		} catch (err) {
			const message = `Error updating media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Deletes a media item
	public async deleteMedia(id: string): Promise<void> {
		this.ensureInitialized();

		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}

		try {
			const result = await this.db.crud.delete('MediaItem', id as DatabaseId);
			if (!result.success) {
				throw new Error(result.message);
			}
			// Remove from cache
			await cacheService.delete(`media:${id}`);
			logger.info('Media deleted successfully', { id });
		} catch (err) {
			const message = `Error deleting media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Sets access permissions for a media item
	public async setMediaAccess(id: string, access: MediaAccess[]): Promise<void> {
		this.ensureInitialized();

		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}

		if (!Array.isArray(access)) {
			throw Error('Invalid access: Must be an array of MediaAccess');
		}

		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const result = await this.db.crud.update('MediaItem', id as DatabaseId, { access } as any);
			if (!result.success) {
				throw new Error(result.message);
			}
			// Invalidate cache
			await cacheService.delete(`media:${id}`);
			logger.info('Media access updated successfully', { id, access });
		} catch (err) {
			const message = `Error setting media access: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Retrieves a media item by its ID, enforcing access control
	public async getMedia(id: string, userId: string, userRoles: string[]): Promise<MediaType> {
		this.ensureInitialized();

		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}

		if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
			throw Error('Invalid userId: Must be a non-empty string');
		}

		if (!Array.isArray(userRoles)) {
			throw Error('Invalid userRoles: Must be an array of strings');
		}

		try {
			// Check cache first
			const cachedMedia = await cacheService.get<MediaType>(`media:${id}`);
			if (cachedMedia) {
				logger.info('Media retrieved from cache', { id });
				return cachedMedia;
			}

			const mediaResult = await this.db.crud.findOne('MediaItem', { _id: id as DatabaseId });
			if (!mediaResult.success) {
				throw Error(mediaResult.message);
			}
			const media = mediaResult.data;

			if (!media) {
				throw Error('Media not found');
			}

			const hasAccess = checkMediaAccess(userRoles, 'some_permission');

			if (!hasAccess) {
				throw Error('Access denied');
			}

			// Cache the media for future requests
			await cacheService.set(`media:${id}`, media, 3600);

			return media as MediaType;
		} catch (err) {
			const message = `Error retrieving media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Bulk delete media items
	public async bulkDeleteMedia(ids: string[]): Promise<void> {
		this.ensureInitialized();

		if (!Array.isArray(ids) || ids.length === 0) {
			throw Error('Invalid ids: Must be a non-empty array of strings');
		}

		try {
			// Use crud.deleteMany with array of IDs
			for (const id of ids) {
				if (!id || typeof id !== 'string' || id.trim().length === 0) {
					throw Error('Invalid id in array: Must be a non-empty string');
				}
				const result = await this.db.crud.delete('MediaItem', id as DatabaseId);
				if (!result.success) {
					logger.error(`Failed to delete media ${id}: ${result.message}`);
				}
			}
			// Remove from cache
			await Promise.all(ids.map((id) => cacheService.delete(`media:${id}`)));
			logger.info('Bulk media deletion successful', { count: ids.length });
		} catch (err) {
			const message = `Error in bulk delete media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Search media items
	public async searchMedia(query: string, page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
		this.ensureInitialized();

		if (!query || typeof query !== 'string' || query.trim().length === 0) {
			throw Error('Invalid query: Must be a non-empty string');
		}

		if (page < 1) {
			throw Error('Invalid page: Must be >= 1');
		}

		if (limit < 1) {
			throw Error('Invalid limit: Must be >= 1');
		}

		try {
			const searchCriteria = {
				$or: [{ name: { $regex: query, $options: 'i' } }, { 'metadata.tags': { $regex: query, $options: 'i' } }]
			};

			const [mediaResult, totalResult] = await Promise.all([
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.db.crud.findMany('MediaItem', searchCriteria as any),
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				this.db.crud.count('MediaItem', searchCriteria as any)
			]);

			if (!mediaResult.success || !totalResult.success) {
				throw new Error('Failed to search media');
			}

			const media = mediaResult.data || [];
			const total = totalResult.data || 0;

			// Apply pagination in memory since findMany doesn't support it
			const startIndex = (page - 1) * limit;
			const paginatedMedia = media.slice(startIndex, startIndex + limit);

			return { media: paginatedMedia as MediaType[], total };
		} catch (err) {
			const message = `Error searching media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// List media items
	public async listMedia(page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
		this.ensureInitialized();

		if (page < 1) {
			throw Error('Invalid page: Must be >= 1');
		}

		if (limit < 1) {
			throw Error('Invalid limit: Must be >= 1');
		}

		try {
			const [mediaResult, totalResult] = await Promise.all([this.db.crud.findMany('MediaItem', {}), this.db.crud.count('MediaItem', {})]);

			if (!mediaResult.success || !totalResult.success) {
				throw new Error('Failed to list media');
			}

			const media = mediaResult.data || [];
			const total = totalResult.data || 0;

			// Apply pagination in memory since findMany doesn't support it
			const startIndex = (page - 1) * limit;
			const paginatedMedia = media.slice(startIndex, startIndex + limit);

			return { media: paginatedMedia as MediaType[], total };
		} catch (err) {
			const message = `Error listing media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Determines the media type based on the MIME type
	private getMediaType(mimeType: string): MediaTypeEnum {
		if (!mimeType) throw Error('Mime type is required');

		if (mimeType.startsWith('image/')) {
			return MediaTypeEnum.Image;
		} else if (mimeType.startsWith('video/')) {
			return MediaTypeEnum.Video;
		} else if (mimeType.startsWith('audio/')) {
			return MediaTypeEnum.Audio;
		} else if (mimeType === 'application/pdf') {
			return MediaTypeEnum.Document;
		} else {
			throw Error(`Unsupported media type: ${mimeType}`);
		}
	}
}
