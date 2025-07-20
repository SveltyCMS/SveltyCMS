/**
 * @file utils/media/MediaService.ts
 * @description Provides a service class for media operations.
 */

import mime from 'mime-types';
import { error } from '@sveltejs/kit';
import Path from 'path';

// Database Interface
import type { DatabaseId, dbInterface, ISODateString, MediaItem } from '@src/databases/dbInterface';

// Media
import type { MediaType, MediaBase, MediaAccess } from './mediaModels';
import { MediaTypeEnum } from './mediaModels';
import { saveFileToDisk, saveResizedImages } from './mediaStorage';
import { hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { validateMediaFile } from './mediaUtils';

// Permission Management
import { validateUserPermission as checkMediaAccess } from '@src/auth/permissions';

// System Logger
import { logger } from '@utils/logger.svelte';

// Media Cache
import { mediaCache } from '@src/databases/mediaCache';

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
			let resizedImages: Record<string, ResizedImage> = {};

			if (isImage) {
				logger.debug('Processing image variants', {
					fileName,
					mimeType
				});
				resizedImages = await saveResizedImages(buffer, hash, sanitizedFileName, mimeType, ext, basePath);
			}

			const fileInfo: MediaImage = {
				type: MediaTypeEnum.Image,
				name: sanitizedFileName,
				hash,
				path: Path.join(basePath, originalSubfolder),
				url: originalUrl,
				mimeType,
				size: buffer.length,
				resized: resizedImages,
				access,
				createdAt: new Date(),
				updatedAt: new Date()
			};

			logger.info('File upload completed', {
				fileName,
				url: originalUrl,
				fileSize: buffer.length,
				isImage,
				resizedVariants: Object.keys(resizedImages),
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
		logger.debug('Starting media upload process', {
			fileName: file?.name,
			size: file?.size,
			userId,
			accessLevels: access?.levels?.join(',') || 'none'
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
				path: fileInfo.path,
				url: fileInfo.url,
				mimeType: fileInfo.mimeType,
				size: file.size,
				user: userId,
				createdAt: new Date(),
				updatedAt: new Date(),
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
						createdAt: new Date(),
						createdBy: userId,
						size: file.size,
						hash: fileInfo.hash,
						processingTimeMs: performance.now() - startTime
					}
				],
				access,
				thumbnails: fileInfo.resized || {}
			};

			// Create clean media object for database storage
			const cleanMedia = this.createCleanMediaObject(media);

			logger.debug('Saving media to database', {
				filename: cleanMedia.filename,
				type: cleanMedia.type,
				processingTime: performance.now() - startTime
			});

			const mediaId = await this.db.crud.insert('MediaItem', cleanMedia);
			logger.debug('Media saved to database', {
				mediaId,
				processingTime: performance.now() - startTime
			});

			// Retrieve the saved media with its ID
			const savedMedia = await this.db.crud.findOne('MediaItem', { _id: mediaId });

			// Cache the saved media
			if (savedMedia) {
				await mediaCache.set(mediaId, savedMedia);
			} else {
				logger.warn('Saved media not found in database', { mediaId });
			}

			logger.info('Media processing completed successfully', {
				mediaId,
				originalUrl: savedMedia?.url,
				thumbnails: savedMedia?.thumbnails ? Object.keys(savedMedia.thumbnails) : [],
				totalProcessingTime: performance.now() - startTime
			});

			return savedMedia!;
		} catch (err) {
			const message = `Error saving media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				fileName: file?.name,
				error: err,
				stack: err instanceof Error ? err.stack : undefined,
				processingTime: performance.now() - startTime
			});
			throw error(500, {
				message,
				fileName: file?.name,
				error: err instanceof Error ? err.stack : undefined,
				processingTime: performance.now() - startTime
			});
		}
	}

	private createCleanMediaObject(object: MediaBaseWithThumbnails): Omit<MediaItem, '_id'> {
		const dbObject = {
			...object,
			createdAt: object.createdAt.toISOString() as ISODateString,
			updatedAt: object.updatedAt.toISOString() as ISODateString,
			createdBy: object.user as DatabaseId,
			updatedBy: object.user as DatabaseId
		} as Omit<MediaItem, '_id'>;

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
			await this.db.updateOne('media_collection', { _id: this.db.convertId(id) }, updates);
			// Invalidate cache
			await mediaCache.delete(id);
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
			await this.db.deleteOne('media_collection', { _id: this.db.convertId(id) });
			// Remove from cache
			await mediaCache.delete(id);
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
			await this.db.updateOne('media_collection', { _id: this.db.convertId(id) }, { access });
			// Invalidate cache
			await mediaCache.delete(id);
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
			const cachedMedia = await mediaCache.get(id);
			if (cachedMedia) {
				logger.info('Media retrieved from cache', { id });
				return cachedMedia;
			}

			const media = await this.db.findOne('media_collection', { _id: this.db.convertId(id) });

			if (!media) {
				throw Error('Media not found');
			}

			const hasAccess = checkMediaAccess(userRoles, 'some_permission');

			if (!hasAccess) {
				throw Error('Access denied');
			}

			// Cache the media for future requests
			await mediaCache.set(id, media);

			return media;
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
			const convertedIds = ids.map((id) => {
				if (!id || typeof id !== 'string' || id.trim().length === 0) {
					throw Error('Invalid id in array: Must be a non-empty string');
				}
				return this.db.convertId(id);
			});
			await this.db.deleteMany('media_collection', { _id: { $in: convertedIds } });
			// Remove from cache
			await Promise.all(ids.map((id) => mediaCache.delete(id)));
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

			const [media, total] = await Promise.all([
				this.db.findMany('media_collection', searchCriteria),
				this.db.countDocuments('media_collection', searchCriteria)
			]);

			// Apply pagination in memory since findMany doesn't support it
			const startIndex = (page - 1) * limit;
			const paginatedMedia = media.slice(startIndex, startIndex + limit);

			return { media: paginatedMedia, total };
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
			const [media, total] = await Promise.all([this.db.findMany('media_collection', {}), this.db.countDocuments('media_collection', {})]);

			// Apply pagination in memory since findMany doesn't support it
			const startIndex = (page - 1) * limit;
			const paginatedMedia = media.slice(startIndex, startIndex + limit);

			return { media: paginatedMedia, total };
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
