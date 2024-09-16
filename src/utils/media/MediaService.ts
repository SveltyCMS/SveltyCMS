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
import logger from '@src/utils/logger';

export class MediaService {
	private db: dbInterface;

	constructor(db: dbInterface) {
		this.db = db;
	}

	// Saves a media file and its associated data
	public async saveMedia(file: File, userId: string, access: MediaAccess[] = []): Promise<MediaType> {
		// Validate the file
		const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf'];
		const validation = validateMediaFile(file, allowedTypes);

		if (!validation.isValid) {
			throw new Error(validation.message);
		}

		// Process the file
		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const mimeType = file.type || mime.lookup(file.name) || 'application/octet-stream'; // Using mime.lookup
		const path = 'uploads'; // Define your storage path logic

		// Combine path and file info into one string
		const urlPath = `${path}/${hash}_${fileNameWithoutExt}.${ext}`;
		const url = constructMediaUrl(urlPath); // Pass as a single argument

		// Extract metadata using the File object, not the Buffer
		const metadata = await extractMetadata(file);

		// Create media object
		const media: MediaBase = {
			type: this.getMediaType(mimeType),
			hash,
			name: file.name,
			path,
			url,
			mimeType,
			size: file.size,
			user: userId,
			createdAt: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
			updatedAt: Math.floor(Date.now() / 1000), // Unix timestamp in seconds
			metadata,
			versions: [],
			access
		};

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

		logger.info('Media saved successfully', { mediaId });

		return savedMedia!;
	}

	// Updates a media item with new data
	public async updateMedia(id: string, updates: Partial<MediaBase>): Promise<void> {
		await this.db.updateOne('media_collection', { _id: this.db.convertId(id) }, updates);
		logger.info('Media updated successfully', { id });
	}

	// Deletes a media item
	public async deleteMedia(id: string): Promise<void> {
		await this.db.deleteOne('media_collection', { _id: this.db.convertId(id) });
		logger.info('Media deleted successfully', { id });
	}

	// Sets access permissions for a media item
	public async setMediaAccess(id: string, access: MediaAccess[]): Promise<void> {
		// Assuming you have a method or logic to update media access permissions in your database
		await this.db.updateOne('media_collection', { _id: this.db.convertId(id) }, { access });

		logger.info('Media access updated successfully', { id, access });
	}

	// Retrieves a media item by its ID, enforcing access control
	public async getMedia(id: string, userId: string, userRoles: string[]): Promise<MediaType> {
		const media = await this.db.findOne('media_collection', { _id: this.db.convertId(id) });

		if (!media) {
			throw new Error('Media not found');
		}

		const hasAccess = checkMediaAccess(userRoles, 'some_permission'); // Replace 'some_permission' with the actual permission required

		if (!hasAccess) {
			throw new Error('Access denied');
		}

		return media;
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
			throw new Error(`Unsupported media type: ${mimeType}`);
		}
	}
}
