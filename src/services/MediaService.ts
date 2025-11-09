/**
 * @file src/services/MediaService.ts
 * @description Provides a service class for media operations.
 */

import { error } from '@sveltejs/kit';
import mime from 'mime-types';
import Path from 'path';

// Database Interface
import type { DatabaseId, IDBAdapter, MediaItem } from '@src/databases/dbInterface';

// Media
import type { MediaAccess, MediaBase, MediaType, ResizedImage } from '@src/utils/media/mediaModels'; // Added ResizedImage
import { MediaTypeEnum } from '@src/utils/media/mediaModels';
import { getSanitizedFileName, hashFileContent } from '@src/utils/media/mediaProcessing';
import { saveFileToDisk, saveResizedImages } from '@src/utils/media/mediaStorage';
// IMPORT SERVER-SIDE VALIDATION
import { validateMediaFileServer } from '@src/utils/media/mediaUtils';

// Permission Management
import { validateUserPermission as checkMediaAccess } from '@src/databases/auth/permissions';

// System Logger
import { logger } from '@utils/logger.server';

// Media Cache
import { cacheService } from '@src/databases/CacheService';

// Extended MediaBase interface to include thumbnails
interface MediaBaseWithThumbnails extends MediaBase {
	thumbnails?: Record<string, ResizedImage | undefined>;
}

export class MediaService {
	private db: IDBAdapter;
	private initialized: boolean = false;
	// Define your allowed types regex - removed unnecessary escape `\+`
	private readonly mimeTypePattern = /^(image|video|audio)\/(jpeg|png|gif|svg+xml|webp|mp4|webm|ogg|mpeg)|(application\/pdf)$/;

	constructor(db: IDBAdapter) {
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
	 * Uploads a file to storage (disk or cloud)
	 */
	private async uploadFile(
		buffer: Buffer,
		fileName: string,
		mimeType: string,
		userId: string,
		basePath: string
	): Promise<{ url: string; path: string; hash: string; resized: Record<string, ResizedImage> }> {
		const startTime = performance.now();

		try {
			logger.debug('Starting file upload', { fileName, fileSize: buffer.length, userId });

			const hash = await hashFileContent(buffer);
			const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
			const sanitizedFileName = fileNameWithoutExt;

			// Save original image in 'original' subfolder
			const originalSubfolder = 'original';
			const originalFileName = `${sanitizedFileName}-${hash}.${ext}`;
			// This is the RELATIVE path, e.g., "avatars/original/image-hash.jpg"
			const relativePath = Path.posix.join(basePath, originalSubfolder, originalFileName);

			logger.debug('Saving original file', { relativePath, basePath, subfolder: originalSubfolder });

			// saveFileToDisk handles both local and cloud saving
			const publicUrl = await saveFileToDisk(buffer, relativePath);

			// Process image if it's an image type
			const isImage = mimeType.startsWith('image/');
			let resizedImages: Record<string, ResizedImage> = {};

			if (isImage && ext !== 'svg') {
				// Don't resize SVGs
				logger.debug('Processing image variants', { fileName, mimeType });
				resizedImages = await saveResizedImages(buffer, hash, sanitizedFileName, mimeType, ext, basePath);
			}

			logger.info('File upload completed', {
				fileName,
				url: publicUrl,
				relativePath,
				fileSize: buffer.length,
				isImage,
				resizedVariants: Object.keys(resizedImages),
				totalProcessingTime: performance.now() - startTime
			});

			return { url: publicUrl, path: relativePath, hash, resized: resizedImages };
		} catch (err) {
			const message = `Error uploading file: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, {
				fileName,
				error: err,
				stack: err instanceof Error ? err.stack : undefined,
				processingTime: performance.now() - startTime
			});
			throw new Error(message);
		}
	}

	// Saves a media file and its associated data
	public async saveMedia(file: File, userId: string, access: MediaAccess, basePath: string = 'global'): Promise<MediaType> {
		const startTime = performance.now();
		this.ensureInitialized();
		logger.trace('Starting media upload process', {
			filename: file.name,
			fileSize: file.size,
			mimeType: file.type
		});
		if (!file) {
			const message = 'File is required';
			logger.error(message, { processingTime: performance.now() - startTime });
			throw Error(message);
		}

		// Convert File to Buffer
		const buffer = Buffer.from(await file.arrayBuffer());
		const mimeType = file.type || mime.lookup(file.name) || 'application/octet-stream';

		// USE SERVER-SIDE VALIDATION
		const validation = validateMediaFileServer(buffer, file.name, this.mimeTypePattern, 50 * 1024 * 1024); // 50MB limit
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
			const { url, path, hash, resized } = await this.uploadFile(buffer, file.name, mimeType, userId, basePath);

			// Create media object with required properties
			const mediaType = this.getMediaType(mimeType);
			if (!mediaType) {
				const message = 'Invalid media type';
				logger.error(message, { mimeType, processingTime: performance.now() - startTime });
				throw Error(message);
			}

			const media: MediaBaseWithThumbnails = {
				type: mediaType,
				hash: hash,
				filename: file.name,
				path: path, // Store the relative path
				url: url, // Store the public URL
				mimeType: mimeType,
				size: file.size,
				user: userId,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				metadata: {
					originalFilename: file.name,
					uploadedBy: userId,
					uploadTimestamp: new Date().toISOString(),
					processingTimeMs: performance.now() - startTime
				},
				versions: [
					{
						version: 1,
						url: url,
						createdAt: new Date().toISOString(),
						createdBy: userId
					}
				],
				access,
				thumbnails: resized || {}
			};

			// Create clean media object for database storage
			const cleanMedia = this.createCleanMediaObject(media);

			logger.debug('Saving media to database', {
				filename: cleanMedia.filename,
				mimeType: cleanMedia.mimeType,
				collection: 'MediaItem' // <-- Log the correct collection
			});

			//  Save to 'MediaItem'
			const result = await this.db.crud.insert<MediaItem>('MediaItem', cleanMedia);

			if (!result.success) {
				throw result.error;
			}
			const mediaId = result.data._id;

			logger.debug('Media saved to database', {
				mediaId,
				processingTime: performance.now() - startTime
			});

			// Retrieve the saved media with its ID
			const findResult = await this.db.crud.findOne<MediaItem>('MediaItem', { _id: mediaId });

			if (!findResult.success) {
				throw findResult.error;
			}
			const savedMedia = findResult.data;

			// Cache the saved media
			if (savedMedia) {
				await cacheService.set(`media:${mediaId}`, savedMedia, 3600);
			} else {
				logger.warn('Saved media not found in database', { mediaId });
			}

			logger.info('Media processing completed successfully', {
				mediaId,
				originalUrl: (savedMedia as MediaItem).url,
				thumbnails: (savedMedia as MediaItem).thumbnails ? Object.keys((savedMedia as MediaItem).thumbnails) : [],
				totalProcessingTime: performance.now() - startTime
			});

			return savedMedia as MediaType;
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

	private createCleanMediaObject(object: MediaBaseWithThumbnails): Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'> {
		// Type-safe mapping from MediaBaseWithThumbnails to a database-ready object
		return {
			filename: object.filename,
			originalFilename: object.filename,
			hash: object.hash,
			path: object.path,
			size: object.size,
			mimeType: object.mimeType,
			thumbnails: object.thumbnails || {},
			metadata: object.metadata || {},
			createdBy: object.user as DatabaseId,
			updatedBy: object.user as DatabaseId
		};
	}

	// Updates a media item with new data
	public async updateMedia(id: string, updates: Partial<MediaItem>): Promise<void> {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}

		if (!updates || typeof updates !== 'object') {
			throw Error('Invalid updates: Must be a valid MediaItem partial object');
		}
		try {
			const result = await this.db.crud.update('MediaItem', id as DatabaseId, updates);
			if (!result.success) {
				throw result.error;
			}
			// Invalidate cache
			await cacheService.delete(`media:${id}`);
			logger.info('Media updated successfully', { id });
		} catch (err) {
			const message = `Error updating media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
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
				throw result.error;
			}
			// Remove from cache
			await cacheService.delete(`media:${id}`);
			logger.info('Media deleted successfully', { id });
		} catch (err) {
			const message = `Error deleting media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
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
			const result = await this.db.crud.update('MediaItem', id as DatabaseId, { access } as unknown as Partial<MediaItem>);
			if (!result.success) {
				throw result.error;
			}
			// Invalidate cache
			await cacheService.delete(`media:${id}`);
			logger.info('Media access updated successfully', { id, access });
		} catch (err) {
			const message = `Error setting media access: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}

	// Retrieves a media item by its ID, enforcing access control
	public async getMedia(id: string, userRoles: string[]): Promise<MediaType> {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}
		try {
			// Check cache first
			const cachedMedia = await cacheService.get<MediaType>(`media:${id}`);
			if (cachedMedia) {
				logger.info('Media retrieved from cache', { id });
				return cachedMedia;
			}

			const result = await this.db.crud.findOne<MediaItem>('MediaItem', { _id: id as DatabaseId });

			if (!result.success) {
				throw result.error;
			}
			const media = result.data;

			if (!media) {
				throw error(404, 'Media not found');
			}

			const hasAccess = checkMediaAccess(userRoles, 'some_permission'); // TODO: Fix permission check logic

			if (!hasAccess) {
				throw error(403, 'Access denied');
			}

			// Cache the media for future requests
			await cacheService.set(`media:${id}`, media, 3600);

			return media as MediaType;
		} catch (err) {
			const message = `Error getting media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			if (typeof err === 'object' && err !== null && 'status' in err) {
				const status = (err as { status?: number }).status;
				if (status === 403 || status === 404) throw err;
			}
			throw error(500, message);
		}
	}

	// Bulk delete media items
	public async bulkDeleteMedia(ids: string[]): Promise<void> {
		this.ensureInitialized();
		if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.trim().length === 0)) {
			throw Error('Invalid ids: Must be an array of non-empty strings');
		}
		try {
			const convertedIds = ids.map((id) => id as DatabaseId);
			// Use `as unknown` to allow for complex query operators like $in
			const result = await this.db.crud.deleteMany('MediaItem', { _id: { $in: convertedIds } } as unknown as Partial<BaseEntity>);
			if (!result.success) {
				throw result.error;
			}
			// Remove from cache
			await Promise.all(ids.map((id) => cacheService.delete(`media:${id}`)));
			logger.info('Bulk media deletion successful', { count: ids.length });
		} catch (err) {
			const message = `Error bulk deleting media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}

	// Search media items
	public async searchMedia(query: string, page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
		this.ensureInitialized();
		try {
			const searchCriteria = {
				$or: [{ filename: { $regex: query, $options: 'i' } }, { 'metadata.tags': { $regex: query, $options: 'i' } }]
			};

			const options = { offset: (page - 1) * limit, limit: limit };

			const [mediaResult, totalResult] = await Promise.all([
				this.db.crud.findMany<MediaItem>('MediaItem', searchCriteria as unknown as Partial<MediaItem>, options),
				this.db.crud.count('MediaItem', searchCriteria as unknown as Partial<BaseEntity>)
			]);

			if (!mediaResult.success) {
				throw mediaResult.error;
			}
			if (!totalResult.success) {
				throw totalResult.error;
			}

			return { media: mediaResult.data as MediaType[], total: totalResult.data };
		} catch (err) {
			const message = `Error searching media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}

	// List media items
	public async listMedia(page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
		this.ensureInitialized();
		try {
			const options = { offset: (page - 1) * limit, limit: limit };

			const [mediaResult, totalResult] = await Promise.all([
				this.db.crud.findMany<MediaItem>('MediaItem', {}, options),
				this.db.crud.count('MediaItem', {})
			]);

			if (!mediaResult.success) {
				throw mediaResult.error;
			}
			if (!totalResult.success) {
				throw totalResult.error;
			}

			return { media: mediaResult.data as MediaType[], total: totalResult.data };
		} catch (err) {
			const message = `Error listing media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
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
			// Fallback for other document types
			if (mimeType.startsWith('application/') || mimeType.startsWith('text/')) {
				return MediaTypeEnum.Document;
			}
			throw Error(`Unsupported media type: ${mimeType}`);
		}
	}

	public async saveRemoteMedia(url: string, userId: string, access: MediaAccess, basePath: string = 'global'): Promise<MediaType> {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch remote file: ${response.statusText}`);
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		const fileName = Path.basename(new URL(url).pathname);
		const mimeType = response.headers.get('content-type') || mime.lookup(fileName) || 'application/octet-stream';
		const file = new File([buffer], fileName, { type: mimeType });

		return this.saveMedia(file, userId, access, basePath);
	}
}
