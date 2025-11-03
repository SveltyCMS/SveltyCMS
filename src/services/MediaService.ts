/* Moved from src/utils/media/MediaService.ts */
/**
 * @file src/services/MediaService.ts
 * @description Provides a service class for media operations.
 */

import { error } from '@sveltejs/kit';
import mime from 'mime-types';
import Path from 'path';

// Database Interface
import type { DatabaseId, dbInterface, ISODateString, MediaItem } from '@src/databases/dbInterface';

// Media
import type { MediaAccess, MediaBase, MediaType } from '@src/utils/media/mediaModels';
import { MediaTypeEnum } from '@src/utils/media/mediaModels';
import { getSanitizedFileName, hashFileContent } from '@src/utils/media/mediaProcessing';
import { saveFileToDisk, saveResizedImages } from '@src/utils/media/mediaStorage';
import { validateMediaFile } from '@src/utils/media/mediaUtils';

// Permission Management

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
		logger.trace('Starting media upload process', {
			filename: file.name,
			fileSize: file.size,
			mimeType: file.type,
			tenantId
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
				await cacheService.set(`media:${mediaId}`, savedMedia, 3600);
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
			await cacheService.delete(`media:${id}`);
			logger.info('Media updated successfully', { id });
		} catch (err) {
			const message = `Error updating media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message);
			throw error(500, message);
		}
	}

	// Manipulates an image with operations like focal point and watermarking
	public async manipulateMedia(id: string, manipulations: any, userId: string, tenantId?: string): Promise<MediaType> {
		this.ensureInitialized();
		logger.info('Media manipulation called', { id, manipulations, userId, tenantId });

		// Placeholder implementation
		if (!id) {
			throw error(400, 'Media ID is required for manipulation.');
		}

		// TODO: Full implementation will involve:
		// 1. Fetching the media item from the DB.
		// 2. Reading the image file from storage.
		// 3. Using `sharp` to apply manipulations.
		// 4. Saving the new image as a new version.
		// 5. Updating the media item in the DB with the new version info.
		// 6. Returning the updated media item.

		logger.warn('Media manipulation not yet implemented.', { id, manipulations });

		// Return the original media item for now
		const mediaItem = await this.db.crud.findOne('MediaItem', { _id: this.db.convertId(id), tenantId });
		if (!mediaItem) {
			throw error(404, 'Media item not found');
		}
		return mediaItem;
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
	}
}
