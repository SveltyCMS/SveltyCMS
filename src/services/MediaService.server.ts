/**
 * @file src/services/MediaService.server.ts
 * @description Provides a service class for media operations.
 *
 * ### Features
 * - File Upload
 * - File Storage
 * - File Resizing
 * - File Access Control
 *
 * ### Security
 * - MIME Type Validation
 * - File Size Limiting
 * - File Type Filtering
 * - File Deduplication
 *
 * ### Performance
 * - File Caching
 * - File Deduplication
 * - File Resizing
 *
 * ### Storage
 * - File Storage
 * - File Deduplication
 * - File Resizing
 *
 */

import { error } from '@sveltejs/kit';
import mime from 'mime-types';
import Path from 'path';
import { writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';
import { exec } from 'node:child_process';

const execAsync = promisify(exec);

// Database Interface
import type { DatabaseId, IDBAdapter } from '@src/databases/dbInterface';
import type { User, Role } from '@src/databases/auth/types';

import sharp from 'sharp';
import type { MediaTypeEnum, MediaAccess, ResizedImage, WatermarkOptions, MediaItem, MediaBase } from '@utils/media/mediaModels';
import { MediaType as MediaTypeEnumValue } from '@utils/media/mediaModels';
import { getSanitizedFileName } from '@src/utils/media/mediaProcessing';
import { hashFileContent } from '@src/utils/media/mediaProcessing.server';
import { saveFileToDisk, saveResizedImages } from '@src/utils/media/mediaStorage.server';
import { isCloud } from '@src/utils/media/cloudStorage';
import { getPublicSettingSync } from '@src/services/settingsService';
// IMPORT SERVER-SIDE VALIDATION
import { validateMediaFileServer } from '@src/utils/media/mediaUtils';

// System Logger
import { logger } from '@utils/logger.server';

// Media Cache
import { cacheService } from '@src/databases/CacheService';

// Types
import type { BaseEntity, ISODateString } from '@src/content/types';

// Extended MediaBase interface to include thumbnails
interface MediaBaseWithThumbnails extends MediaBase {
	thumbnails?: Record<string, ResizedImage>;
	originalId?: DatabaseId | null;
	width?: number;
	height?: number;
}

export class MediaService {
	private db: IDBAdapter;
	private initialized: boolean = false;
	// Define your allowed types regex
	private readonly mimeTypePattern = /^(image|video|audio)\/(jpeg|png|gif|svg\+xml|webp|mp4|webm|ogg|mpeg)|(application\/pdf)$/;

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
		basePath: string,
		watermarkOptions?: WatermarkOptions
	): Promise<{ url: string; path: string; hash: string; resized: Record<string, ResizedImage> }> {
		const startTime = performance.now();

		try {
			logger.debug('Starting file upload', { fileName, fileSize: buffer.length, userId });

			let imageBuffer = buffer;

			// Apply watermark if options are provided and it's an image
			if (watermarkOptions && mimeType.startsWith('image/')) {
				try {
					const watermarkImagePath = Path.join(process.cwd(), 'static', watermarkOptions.url);
					const watermarkBuffer = await sharp(watermarkImagePath)
						.resize({
							width: Math.floor((await sharp(imageBuffer).metadata()).width! * (watermarkOptions.scale / 100))
						})
						.png()
						.toBuffer();

					imageBuffer = await sharp(imageBuffer)
						.composite([
							{
								input: watermarkBuffer,
								gravity: watermarkOptions.position,
								blend: 'over'
							}
						])
						.toBuffer();
					logger.info('Watermark applied successfully', { fileName });
				} catch (wmError) {
					logger.error('Could not apply watermark', { fileName, error: wmError });
					// Fail gracefully, proceed with original image
				}
			}

			const hash = await hashFileContent(imageBuffer);
			const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
			const sanitizedFileName = fileNameWithoutExt;

			// Save original image in 'original' subfolder
			const originalSubfolder = 'original';
			const originalFileName = `${sanitizedFileName}-${hash}.${ext}`;
			// This is the RELATIVE path, e.g., "avatars/original/image-hash.jpg"
			const relativePath = Path.posix.join(basePath, originalSubfolder, originalFileName);

			logger.debug('Saving original file', { relativePath, basePath, subfolder: originalSubfolder });

			// saveFileToDisk handles both local and cloud saving
			const publicUrl = await saveFileToDisk(imageBuffer, relativePath);

			// Process image if it's an image type
			const isImage = mimeType.startsWith('image/');
			let resizedImages: Record<string, ResizedImage> = {};

			if (isImage && ext !== 'svg') {
				// Don't resize SVGs
				logger.debug('Processing image variants', { fileName, mimeType });
				// saveResizedImages signature: (buffer, hash, baseName, ext, baseDir)
				resizedImages = await saveResizedImages(imageBuffer, hash, sanitizedFileName, ext, basePath);
			}

			logger.info('File upload completed', {
				fileName,
				url: publicUrl,
				relativePath,
				fileSize: imageBuffer.length,
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

	/**
	 * Saves a file to storage and creates a database record.
	 */

	private async getMediaProcessingService() {
		const { mediaProcessingService } = await import('./MediaProcessingService.server');
		return mediaProcessingService;
	}

	// Saves a media file and its associated data
	public async saveMedia(
		file: File,
		userId: string,
		access: MediaAccess,
		basePath: string = 'global',
		watermarkOptions?: WatermarkOptions,
		originalId?: DatabaseId | null
	): Promise<MediaItem> {
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
		let mimeType = file.type || mime.lookup(file.name) || 'application/octet-stream';
		let extension = mime.extension(mimeType) || getSanitizedFileName(file.name).ext;

		// --- ENHANCED MIME TYPE & EXTENSION DETECTION ---
		try {
			const { fileTypeFromBuffer } = await import('file-type');
			const detectedType = await fileTypeFromBuffer(buffer);
			if (detectedType) {
				logger.debug('Detected file type from buffer:', detectedType);
				// Override if it was generic or unknown, or if we trust binary inspection more
				if (mimeType === 'application/octet-stream' || !mimeType) {
					mimeType = detectedType.mime;
					extension = detectedType.ext;
				} else if (mimeType !== detectedType.mime) {
					// Log mismatch but maybe trust detected type for consistency
					logger.warn(`MIME type mismatch: provided=${mimeType}, detected=${detectedType.mime}. Using detected.`);
					mimeType = detectedType.mime;
					extension = detectedType.ext;
				}
			} else {
				logger.warn('Could not detect file type from buffer.');
			}
		} catch (err) {
			logger.warn('Error during file-type detection:', err);
		}

		// Fix keys in file object if possible, effectively wrapped in new File below or just used directly
		// But we already have buffer. We should ensure fileName matches extension if it was corrupted.
		if (extension && !file.name.endsWith('.' + extension)) {
			// Append extension if missing or wrong
			// Actually, let's just make sure we pass the correct info to uploadFile
		}

		// USE SERVER-SIDE VALIDATION
		const validation = validateMediaFileServer(buffer, file.name, this.mimeTypePattern, 50 * 1024 * 1024); // 50MB limit
		// We override the validation to check the DETECTED mime type, not just the name-based one validation usually checks.
		// validation.valid is based on name in validateMediaFileServer. Let's re-check against pattern manually if needed.
		if (!this.mimeTypePattern.test(mimeType)) {
			// Skip error for specific cases or throw?
			// If detected type is valid image, we proceed.
		}

		if (!validation.valid && !this.mimeTypePattern.test(mimeType)) {
			// Only throw if BOTH name-based and content-based validation fail to match allow-list
			const message = `File validation failed: ${validation.message} (Detected: ${mimeType})`;
			logger.error(message, {
				fileName: file.name,
				fileSize: file.size,
				processingTime: performance.now() - startTime
			});
			throw Error(message);
		}

		try {
			// Ensure filename has correct extension
			let safeFileName = file.name;
			if (extension && !safeFileName.toLowerCase().endsWith(`.${extension}`)) {
				// Remove trailing dot if present
				if (safeFileName.endsWith('.')) {
					safeFileName = safeFileName.slice(0, -1);
				}
				safeFileName = `${safeFileName}.${extension}`;
			}

			// First upload the file and get basic file info
			const { url, path, hash, resized } = await this.uploadFile(buffer, safeFileName, mimeType, userId, basePath, watermarkOptions);

			const isImage = mimeType.startsWith('image/');
			const isVideo = mimeType.startsWith('video/');
			let advancedMetadata = {};
			let width: number | undefined = undefined;
			let height: number | undefined = undefined;
			let thumbnailBuffer: Buffer | null = null;

			if (isImage && !mimeType.includes('svg')) {
				try {
					const processingService = await this.getMediaProcessingService();
					advancedMetadata = await processingService.getMetadata(buffer);
					width = (advancedMetadata as any).width;
					height = (advancedMetadata as any).height;
				} catch (sharpError) {
					logger.error('Failed to extract deep metadata', { fileName: file.name, error: sharpError });
				}
			} else if (isVideo) {

				try {
					const dimensions = await this.getVideoDimensions(buffer);
					width = dimensions.width;
					height = dimensions.height;
					advancedMetadata = { width, height };

					// Generate a real thumbnail image from the video
					thumbnailBuffer = await this.captureVideoThumbnail(buffer);
				} catch (vError) {
					logger.error('Video processing failed', { fileName: file.name, error: vError });
				}
			}

			// Create media object with required properties
			const mediaType = this.getMediaType(mimeType);
			if (!mediaType) {
				const message = 'Invalid media type';
				logger.error(message, { mimeType, processingTime: performance.now() - startTime });
				throw Error(message);
			}

			const media: Omit<MediaBaseWithThumbnails, '_id'> = {
				type: mediaType,
				hash: hash,
				filename: safeFileName, // Use the sanitized filename with extension
				path: path, // Store the relative path
				url: url, // Store the public URL
				mimeType: mimeType,
				size: file.size,
				user: userId as DatabaseId,
				createdAt: new Date().toISOString() as ISODateString,
				updatedAt: new Date().toISOString() as ISODateString,
				metadata: {
					originalFilename: file.name,
					uploadedBy: userId,
					uploadTimestamp: new Date().toISOString(),
					processingTimeMs: performance.now() - startTime,
					advancedMetadata: advancedMetadata
				},
				originalId: originalId,
				versions: [
					{
						version: 1,
						url: url,
						createdAt: new Date().toISOString() as ISODateString,
						createdBy: userId as DatabaseId
					}
				],
				width,
				height,
				access,
				thumbnails: resized || {}
			};

			// If we have a video thumbnail, process it into resizing variants
			if (isVideo && thumbnailBuffer) {
				try {
					const { fileNameWithoutExt } = getSanitizedFileName(file.name);
					const videoResized = await saveResizedImages(thumbnailBuffer, hash, fileNameWithoutExt, 'jpg', basePath);
					media.thumbnails = { ...media.thumbnails, ...videoResized };
				} catch (rError) {
					logger.error('Failed to process video thumbnail variants', { fileName: file.name, error: rError });
				}
			}

			// Create clean media object for database storage
			const cleanMedia = this.createCleanMediaObject(media);

			logger.debug('Saving media to database', {
				filename: cleanMedia.filename,
				mimeType: cleanMedia.mimeType
			});

			// Use db-agnostic media adapter
			const result = await this.db.media.files.upload(cleanMedia as any);

			if (!result.success) {
				throw result.error;
			}
			const savedMedia = result.data;
			const mediaId = savedMedia._id;

			logger.debug('Media saved to database', {
				mediaId,
				processingTime: performance.now() - startTime
			});

			// Cache the saved media
			if (savedMedia) {
				await cacheService.set(`media:${mediaId}`, savedMedia, 3600);
			} else {
				logger.warn('Saved media not found in database', { mediaId });
			}

			logger.info('Media processing completed successfully', {
				mediaId,
				originalUrl: (savedMedia as unknown as MediaItem).path,
				thumbnails: Object.keys((savedMedia as unknown as MediaItem).thumbnails ?? {}),
				totalProcessingTime: performance.now() - startTime
			});

			return savedMedia as unknown as MediaItem;
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

	private createCleanMediaObject(object: Omit<MediaBaseWithThumbnails, '_id'>): Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'> {
		// Type-safe mapping from MediaBaseWithThumbnails to a database-ready object
		return {
			filename: object.filename,
			originalFilename: object.metadata?.originalFilename || object.filename,
			hash: object.hash,
			path: object.path,
			size: object.size,
			mimeType: object.mimeType,
			thumbnails: object.thumbnails || {},
			metadata: object.metadata || {},
			access: object.access,
			user: object.user as DatabaseId,
			type: object.type as any,
			width: (object as any).width,
			height: (object as any).height,
			createdBy: object.user as DatabaseId,
			updatedBy: object.user as DatabaseId,
			folderId: null
		} as any;
	}

	private async getDb(): Promise<IDBAdapter> {
		const { dbAdapter } = await import('@src/databases/db');
		if (!dbAdapter) {
			throw new Error('Database adapter is not initialized');
		}
		return dbAdapter;
	}

	/**
	 * Manipulates an existing media item using Sharp.js
	 */
	public async manipulateMedia(id: string, manipulations: any, userId: string): Promise<MediaItem> {
		this.ensureInitialized();
		const db = await this.getDb();

		const mediaResult = await db.crud.findOne<MediaItem>('media', { _id: id as DatabaseId });


		if (!mediaResult.success || !mediaResult.data) {
			throw error(404, 'Media item not found');
		}
		const mediaItem = mediaResult.data;

		if (mediaItem.type !== MediaTypeEnumValue.Image) {
			throw error(400, 'Only images can be manipulated');
		}

		// Load original file
		let originalBuffer: Buffer;
		if (isCloud()) {
			const response = await fetch(this.enrichMediaWithUrl(mediaItem).url);
			originalBuffer = Buffer.from(await response.arrayBuffer());
		} else {
			const fs = await import('fs/promises');
			const MEDIA_ROOT = getPublicSettingSync('MEDIA_FOLDER') ?? 'mediaFolder';
			const fullPath = Path.join(process.cwd(), MEDIA_ROOT, mediaItem.path);
			originalBuffer = await fs.readFile(fullPath);
		}

		let instance = sharp(originalBuffer);

		// Apply transformations
		if (manipulations.rotation) {
			instance = instance.rotate(manipulations.rotation);
		}

		if (manipulations.flipH) {
			instance = instance.flop();
		}

		if (manipulations.flipV) {
			instance = instance.flip();
		}

		if (manipulations.crop) {
			instance = instance.extract({
				left: Math.round(manipulations.crop.x),
				top: Math.round(manipulations.crop.y),
				width: Math.round(manipulations.crop.width),
				height: Math.round(manipulations.crop.height)
			});
		}

		// Apply filters (simplified mapping)
		if (manipulations.filters) {
			const { brightness, contrast, saturation } = manipulations.filters;
			if (brightness !== undefined || contrast !== undefined || saturation !== undefined) {
				instance = instance.modulate({
					brightness: brightness !== undefined ? 1 + brightness / 100 : 1,
					saturation: saturation !== undefined ? 1 + saturation / 100 : 1
				});
				// Sharp doesn't have a direct contrast modulation like this,
				// usually handled via linear or pipeline.
			}
		}

		const manipulatedBuffer = await instance.toBuffer();
		const meta = await instance.metadata();

		// Save as a new version
		const hash = await hashFileContent(manipulatedBuffer);
		const { fileNameWithoutExt, ext } = getSanitizedFileName(mediaItem.filename);
		const timestamp = Date.now();
		const newFileName = `${fileNameWithoutExt}-edited-${timestamp}.${ext}`;

		const basePath = mediaItem.path.split('/')[0] || 'global';
		const relativePath = Path.posix.join(basePath, 'edited', newFileName);

		const publicUrl = await saveFileToDisk(manipulatedBuffer, relativePath);
		const resized = await saveResizedImages(manipulatedBuffer, hash, `${fileNameWithoutExt}-edited-${timestamp}`, ext, basePath);

		const newVersionNumber = (mediaItem.versions?.length || 0) + 1;
		const newVersion = {
			version: newVersionNumber,
			url: publicUrl,
			path: relativePath,
			hash,
			size: manipulatedBuffer.length,
			createdAt: new Date().toISOString() as ISODateString,
			createdBy: userId as DatabaseId,
			action: 'manipulate'
		};

		const updates: Partial<MediaItem> = {
			url: publicUrl,
			path: relativePath,
			hash,
			size: manipulatedBuffer.length,
			width: meta.width,
			height: meta.height,
			thumbnails: resized,
			versions: [...(mediaItem.versions || []), newVersion],
			metadata: {
				...mediaItem.metadata,
				focalPoint: manipulations.focalPoint || mediaItem.metadata?.focalPoint,
				lastManipulation: manipulations
			}
		};

		await this.updateMedia(id, updates);
		return { ...mediaItem, ...updates } as MediaItem;
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
			const db = await this.getDb();
			const result = await db.crud.update('media', id as DatabaseId, updates);

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

	/**
	 * Add a new version to an existing media item
	 */
	public async addVersion(id: string, file: File, userId: string, action: string = 'update'): Promise<MediaItem> {
		this.ensureInitialized();
		const db = await this.getDb();
		const mediaResult = await db.crud.findOne<MediaItem>('media', { _id: id as DatabaseId });


		if (!mediaResult.success || !mediaResult.data) {
			throw error(404, 'Media item not found');
		}
		const mediaItem = mediaResult.data;

		// Save the new file content
		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = await hashFileContent(buffer);

		// Use original basePath if possible
		const basePath = mediaItem.path.split('/')[0] || 'global';
		const { url, path, resized } = await this.uploadFile(buffer, file.name, file.type, userId, basePath);

		const newVersionNumber = (mediaItem.versions?.length || 0) + 1;
		const newVersion = {
			version: newVersionNumber,
			url,
			path,
			hash,
			size: file.size,
			createdAt: new Date().toISOString() as ISODateString,
			createdBy: userId as DatabaseId,
			action
		};

		const updates: Partial<MediaItem> = {
			url,
			path,
			hash,
			size: file.size,
			thumbnails: resized,
			versions: [...(mediaItem.versions || []), newVersion]
		};

		await this.updateMedia(id, updates);
		return { ...mediaItem, ...updates } as MediaItem;
	}

	// Deletes a media item
	public async deleteMedia(id: string): Promise<void> {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}
		try {
			const result = await this.db.media.files.delete(id as DatabaseId);
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
	public async setMediaAccess(id: string, access: MediaAccess): Promise<void> {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}

		// Access is now a string union, not array
		try {
			const db = await this.getDb();
			const result = await db.crud.update('media', id as DatabaseId, { access } as unknown as Partial<MediaItem>);
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
	public async getMedia(id: string, user: User, roles: Role[]): Promise<MediaItem> {
		this.ensureInitialized();
		if (!id || typeof id !== 'string' || id.trim().length === 0) {
			throw Error('Invalid id: Must be a non-empty string');
		}
		try {
			// Check cache first
			const cachedMedia = await cacheService.get<MediaItem>(`media:${id}`);
			if (cachedMedia) {
				// Basic access check for cached items
				const isAdmin = roles.some((r) => r.isAdmin);
				if (isAdmin || cachedMedia.user === user._id || cachedMedia.access === 'public') {
					logger.info('Media retrieved from cache', { id });
					// Ensure cached media has URL (in case it was cached without it)
					return this.enrichMediaWithUrl(cachedMedia);
				}
				// If cached but no access, fall through to DB fetch for fresh check (or just deny)
			}

			const db = await this.getDb();
			const result = await db.crud.findOne<MediaItem>('media', { _id: id as DatabaseId });


			if (!result.success) {
				throw result.error;
			}
			const media = result.data;

			if (!media) {
				throw error(404, 'Media not found');
			}

			// Access Control Logic
			// Access Control Logic
			const isAdmin = roles.some((r) => r.isAdmin);
			const isOwner = media.user === user._id; // Updated to match MediaBase
			const isPublic = media.access === 'public';

			if (!isAdmin && !isOwner && !isPublic) {
				// TODO: Add fine-grained permission check (e.g. 'media.read') if needed
				logger.warn('Access denied to media item', { mediaId: id, userId: user._id, roles: roles.map((r) => r.name) });
				throw error(403, 'Access denied');
			}

			// Cache the media for future requests
			await cacheService.set(`media:${id}`, media, 3600);

			return this.enrichMediaWithUrl(media);
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

	// Helper to add URL to media object
	private enrichMediaWithUrl(media: MediaItem): MediaItem {
		let url = media.path;
		// If path is already a URL, use it
		if (url.startsWith('http://') || url.startsWith('https://')) {
			// do nothing
		} else if (!url.startsWith('/')) {
			// Assume local file path, prepend /files/
			url = `/files/${url}`;
		}

		return {
			...media,
			url
		} as MediaItem;
	}

	// Bulk delete media items
	public async bulkDeleteMedia(ids: string[]): Promise<void> {
		this.ensureInitialized();
		if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || id.trim().length === 0)) {
			throw Error('Invalid ids: Must be an array of non-empty strings');
		}
		try {
			const convertedIds = ids.map((id) => id as DatabaseId);
			const result = await this.db.media.files.deleteMany(convertedIds);
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
	public async searchMedia(query: string, page: number = 1, limit: number = 20): Promise<{ media: MediaItem[]; total: number }> {
		this.ensureInitialized();
		try {
			const db = await this.getDb();
			const searchCriteria = {
				$or: [{ filename: { $regex: query, $options: 'i' } }, { 'metadata.tags': { $regex: query, $options: 'i' } }]
			};

			const options = { offset: (page - 1) * limit, limit: limit };

			const [mediaResult, totalResult] = await Promise.all([
				db.crud.findMany<MediaItem>('media', searchCriteria as unknown as Partial<MediaItem>, options),
				db.crud.count('media', searchCriteria as unknown as Partial<BaseEntity>)
			]);

			if (!mediaResult.success) {
				throw mediaResult.error;
			}
			if (!totalResult.success) {
				throw totalResult.error;
			}

			return { media: mediaResult.data as unknown as MediaItem[], total: totalResult.data };
		} catch (err) {
			const message = `Error searching media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}

	// List media items
	public async listMedia(page: number = 1, limit: number = 20): Promise<{ media: MediaItem[]; total: number }> {
		this.ensureInitialized();
		try {
			const db = await this.getDb();
			const options = { offset: (page - 1) * limit, limit: limit };

			const [mediaResult, totalResult] = await Promise.all([
				db.crud.findMany<MediaItem>('media', {}, options),
				db.crud.count('media', {})
			]);

			if (!mediaResult.success) {
				throw mediaResult.error;
			}
			if (!totalResult.success) {
				throw totalResult.error;
			}

			return { media: mediaResult.data as unknown as MediaItem[], total: totalResult.data };
		} catch (err) {
			const message = `Error listing media: ${err instanceof Error ? err.message : String(err)}`;
			logger.error(message, { error: err });
			throw error(500, message);
		}
	}

	/**
	 * Extracts width and height from a video using ffprobe
	 */
	private async getVideoDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
		const tempFile = Path.join(os.tmpdir(), `ffprobe-input-${Date.now()}.mp4`);
		try {
			writeFileSync(tempFile, buffer);
			const { stdout } = await execAsync(`ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${tempFile}"`);
			const [width, height] = stdout.trim().split('x').map(Number);
			return { width: width || 0, height: height || 0 };
		} catch (err) {
			logger.error('Error extracting video dimensions', { error: err });
			return { width: 0, height: 0 };
		} finally {
			try {
				unlinkSync(tempFile);
			} catch {
				/* ignore */
			}
		}
	}

	/**
	 * Captures a thumbnail from a video at the 1s mark using ffmpeg
	 */
	private async captureVideoThumbnail(buffer: Buffer): Promise<Buffer | null> {
		const tempInput = Path.join(os.tmpdir(), `ffmpeg-input-${Date.now()}.mp4`);
		const tempOutput = Path.join(os.tmpdir(), `ffmpeg-output-${Date.now()}.jpg`);
		try {
			writeFileSync(tempInput, buffer);
			// Capture frame at 1s mark
			await execAsync(`ffmpeg -ss 00:00:01 -i "${tempInput}" -frames:v 1 -q:v 2 "${tempOutput}" -y`);
			return readFileSync(tempOutput);
		} catch (err) {
			logger.error('Error capturing video thumbnail', { error: err });
			return null;
		} finally {
			try {
				if (os.platform() !== 'win32') {
					unlinkSync(tempInput);
					unlinkSync(tempOutput);
				}
			} catch {
				/* ignore */
			}
		}
	}

	// Determines the media type based on the MIME type
	private getMediaType(mimeType: string): MediaTypeEnum {
		if (!mimeType) throw Error('Mime type is required');

		if (mimeType.startsWith('image/')) {
			return MediaTypeEnumValue.Image;
		} else if (mimeType.startsWith('video/')) {
			return MediaTypeEnumValue.Video;
		} else if (mimeType.startsWith('audio/')) {
			return MediaTypeEnumValue.Audio;
		} else if (mimeType === 'application/pdf') {
			return MediaTypeEnumValue.Document;
		} else {
			// Fallback for other document types
			if (mimeType.startsWith('application/') || mimeType.startsWith('text/')) {
				return MediaTypeEnumValue.Document;
			}
			throw Error(`Unsupported media type: ${mimeType}`);
		}
	}

	public async saveRemoteMedia(url: string, userId: string, access: MediaAccess, basePath: string = 'global'): Promise<MediaItem> {
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
