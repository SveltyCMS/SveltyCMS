/**
 * @file utils/media/MediaService.ts
 * @description Provides a service class for media operations.
 */

import mime from 'mime-types';

// Database Interface
import type { dbInterface } from '@src/databases/dbInterface';

// Media
import type { MediaType, MediaBase, MediaAccess } from './mediaModels';
import { MediaTypeEnum } from './mediaModels';
import { saveFileToDisk, saveResizedImages } from './mediaStorage';
import { extractMetadata, hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { validateMediaFile, constructMediaUrl } from './mediaUtils';

// Permission Management
import { validateUserPermission as checkMediaAccess } from '@src/auth/permissionManager';

// System Logger
import { logger } from '@utils/logger';

// Media Cache
import { mediaCache } from '@src/databases/mediaCache';

export class MediaService {
	private db: dbInterface;

	constructor(db: dbInterface) {
		this.db = db;
	}

	// Saves a media file and its associated data
	public async saveMedia(file: File, userId: string, access: MediaAccess): Promise<MediaType> {
		// Validate the file
		const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'];
		const validation = validateMediaFile(file, allowedTypes);

		if (!validation.isValid) {
			throw Error(validation.message);
		}

		// Process the file
		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const mimeType = file.type || mime.lookup(file.name) || 'application/octet-stream'; // Using mime.lookup
		const path = 'global'; // Define your storage path logic

		// Extract metadata using the File object, not the Buffer
		// const metadata = await extractMetadata(file);
		
		
		// Combine path and file info into one string
		const urlPath = `${hash}_${fileNameWithoutExt}.${ext}`;
		// Create media object
		const media: MediaBase = {
			type: this.getMediaType(mimeType),
			hash,
			name: file.name,
			path,
			url: urlPath,
			mimeType,
			size: file.size,
			user: userId,
			createdAt: new Date(Date.now()), // ISO 8601 date string
			updatedAt: new Date(Date.now()), // Unix timestamp in seconds
			metadata: {},
			versions: [],
			access
		};
		// const url = constructMediaUrl(media); // Pass as a single argument
		const url = urlPath;
		// Save the file
		await saveFileToDisk(buffer, url);

		// Save resized images if applicable
		if (media.type === MediaTypeEnum.Image) {
			const thumbnails = await saveResizedImages(buffer, hash, fileNameWithoutExt, 'media_collection', ext, path);
			(media as any).thumbnails = thumbnails;
		}

		// Save media to the database
		const mediaId = await this.db.insertOne('media_collection', media);

		// Retrieve the saved media with its ID
		const savedMedia = await this.db.findOne('media_collection', { _id: mediaId });

		// Cache the saved media
		if (savedMedia) {
			await mediaCache.set(mediaId, savedMedia);
		}

		logger.info('Media saved successfully', { mediaId });

		return savedMedia!;
	}

	// Updates a media item with new data
	public async updateMedia(id: string, updates: Partial<MediaBase>): Promise<void> {
		await this.db.updateOne('media_collection', { _id: this.db.convertId(id) }, updates);
		// Invalidate cache
		await mediaCache.delete(id);
		logger.info('Media updated successfully', { id });
	}

	// Deletes a media item
	public async deleteMedia(id: string): Promise<void> {
		await this.db.deleteOne('media_collection', { _id: this.db.convertId(id) });
		// Remove from cache
		await mediaCache.delete(id);
		logger.info('Media deleted successfully', { id });
	}

	// Sets access permissions for a media item
	public async setMediaAccess(id: string, access: MediaAccess[]): Promise<void> {
		await this.db.updateOne('media_collection', { _id: this.db.convertId(id) }, { access });
		// Invalidate cache
		await mediaCache.delete(id);
		logger.info('Media access updated successfully', { id, access });
	}

	// Retrieves a media item by its ID, enforcing access control
	public async getMedia(id: string, userId: string, userRoles: string[]): Promise<MediaType> {
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

		const hasAccess = checkMediaAccess(userRoles, 'some_permission'); // Replace 'some_permission' with the actual permission required

		if (!hasAccess) {
			throw Error('Access denied');
		}

		// Cache the media for future requests
		await mediaCache.set(id, media);

		return media;
	}

	// Bulk delete media items
	public async bulkDeleteMedia(ids: string[]): Promise<void> {
		const convertedIds = ids.map((id) => this.db.convertId(id));
		await this.db.deleteMany('media_collection', { _id: { $in: convertedIds } });
		// Remove from cache
		await Promise.all(ids.map((id) => mediaCache.delete(id)));
		logger.info('Bulk media deletion successful', { count: ids.length });
	}

	// Search media items
	public async searchMedia(query: string, page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
		const skip = (page - 1) * limit;
		const searchCriteria = {
			$or: [{ name: { $regex: query, $options: 'i' } }, { 'metadata.tags': { $regex: query, $options: 'i' } }]
		};

		const [media, total] = await Promise.all([
			this.db.findMany('media_collection', searchCriteria, { skip, limit }),
			this.db.countDocuments('media_collection', searchCriteria)
		]);

		return { media, total };
	}

	// List media items
	public async listMedia(page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
		const skip = (page - 1) * limit;

		const [media, total] = await Promise.all([
			this.db.findMany('media_collection', {}, { skip, limit }),
			this.db.countDocuments('media_collection', {})
		]);

		return { media, total };
	}

	// Determines the media type based on the MIME type
	private getMediaType(mimeType: string): MediaTypeEnum {
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
