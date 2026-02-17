/**
 * @file src/databases/mongodb/models/media.ts
 * @description MongoDB schema and model for Media.
 *
 * This module defines a schema and model for media files in the CMS.
 * Media files include images, videos, documents, and other file types.
 *
 * Features:
 * - UUID as per dbInterface.ts
 * - Hash for media
 * - Filename for media
 * - Original filename for media
 * - Path to the media file
 * - Size of the media file
 * - Mime type of the media file
 * - Folder paths/ids as strings
 * - Thumbnails for images
 * - Metadata for media files
 * - Created by user ID
 * - Updated by user ID
 * - CreatedAt ISODate type
 * - UpdatedAt ISODate type
 */

import type { DatabaseId } from '@src/content/types';
import type { DatabaseResult, IDBAdapter, MediaItem } from '@src/databases/dbInterface';
import { generateId } from '@src/databases/mongodb/methods/mongoDBUtils';
import { nowISODateString, toISOString } from '@utils/dateUtils';
// System Logger
import { logger } from '@utils/logger';
import type { Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// Define interface for MongoDB document
export interface IMedia extends Document, Omit<MediaItem, '_id'> {
	_id: string;
}

// Media schema
export const mediaSchema = new Schema<MediaItem>(
	{
		_id: {
			type: String,
			required: true,
			default: () => generateId() // Use UUID instead of ObjectId
		},
		// UUID as per dbInterface.ts
		hash: { type: String, required: true }, // Hash for media
		filename: { type: String, required: true }, // Filename for media
		originalFilename: String, // Original filename for media
		path: { type: String, required: true }, // Path to the media file
		size: { type: Number, required: true }, // Size of the media file
		mimeType: { type: String, required: true }, // Mime type of the media file
		tenantId: { type: String, index: true }, // Multi-tenant isolation ID
		folderId: { type: String, default: null }, // Folder paths/ids as strings
		thumbnails: { type: Schema.Types.Mixed, default: {} }, // Thumbnails for images
		metadata: {
			width: Number,
			height: Number,
			duration: Number, // Duration for videos/audio
			codec: String, // Codec used for media file
			format: String, // Format of the media file
			type: mongoose.Schema.Types.Mixed // Allow additional metadata fields via [key: string]: unknown
		},
		createdBy: { type: String, required: true }, // Created by user ID
		updatedBy: { type: String, required: true }, // Updated by user ID
		createdAt: { type: String, default: () => nowISODateString() }, // CreatedAt ISODate type
		updatedAt: { type: String, default: () => nowISODateString() } // UpdatedAt ISODate type
	},
	{
		timestamps: true,
		collection: 'system_media',
		strict: true, // Enforce strict schema validation
		_id: false // Disable Mongoose auto-ObjectId generation
	}
);

// --- Indexes ---
// Single field indexes
mediaSchema.index({ filename: 1 });
mediaSchema.index({ hash: 1 }, { unique: true }); // Unique hash for deduplication

// Compound indexes for common query patterns (50-80% performance boost)
mediaSchema.index({ tenantId: 1, folderId: 1, createdAt: -1 }); // Folder browsing
mediaSchema.index({ tenantId: 1, createdBy: 1, createdAt: -1 }); // User's media library
mediaSchema.index({ tenantId: 1, mimeType: 1, createdAt: -1 }); // Filter by file type
mediaSchema.index({ tenantId: 1, updatedAt: -1 }); // Recent media
mediaSchema.index({ tenantId: 1, folderId: 1, mimeType: 1 }); // Folder + type filtering
mediaSchema.index({ tenantId: 1, filename: 'text', originalFilename: 'text' }); // Full-text search on filenames

// Fetch all media files using DatabaseAdapter's crud.findMany
export async function fetchAllMedia(databaseAdapter: IDBAdapter): Promise<DatabaseResult<MediaItem[]>> {
	try {
		const result = await databaseAdapter.crud.findMany<MediaItem>('media', {});
		if (result.success) {
			return { success: true, data: result.data };
		}
		return result;
	} catch (error) {
		const message = 'Failed to fetch all media files';
		const err = error as Error;
		logger.error(`Error fetching all media files: ${err.message}`);
		return {
			success: false,
			message,
			error: {
				code: 'MEDIA_FETCH_ALL_ERROR',
				message: 'Failed to fetch all media files',
				details: error
			}
		};
	}
}

// Static methods
mediaSchema.statics = {
	// Get media by filename
	async getMediaByFilename(filename: string): Promise<DatabaseResult<MediaItem | null>> {
		try {
			const mediaItem = (await this.findOne({ filename }).lean().exec()) as MediaItem | null;
			return { success: true, data: mediaItem };
		} catch (error) {
			const message = `Failed to retrieve media item by filename: ${filename}`;
			const err = error as Error;
			logger.error(`Error retrieving media item by filename: ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'MEDIA_GET_BY_FILENAME_ERROR',
					message: `Failed to retrieve media item by filename: ${filename}`
				}
			};
		}
	},

	// Get media items by folder ID
	async getMediaByFolderId(folderId?: string): Promise<DatabaseResult<MediaItem[]>> {
		try {
			const query: Record<string, unknown> = folderId ? { folderId } : {};
			const mediaItems = (await this.find(query).lean().exec()) as MediaItem[];
			return { success: true, data: mediaItems };
		} catch (error) {
			const message = `Failed to retrieve media items for folder ID: ${folderId || 'root'}`;
			const err = error as Error;
			logger.error(`Error retrieving media items by folder ID: ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'MEDIA_GET_BY_FOLDER_ERROR',
					message: `Failed to retrieve media items for folder ID: ${folderId || 'root'}`
				}
			};
		}
	},

	// Bulk delete media items by folder ID
	async bulkDeleteMediaByFolderId(folderIds: string[]): Promise<DatabaseResult<number>> {
		try {
			const result = await this.deleteMany({ folderId: { $in: folderIds } }).exec();
			logger.info(`Bulk deleted ${result.deletedCount} media items for folder IDs: ${folderIds.join(', ')}`);
			return { success: true, data: result.deletedCount };
		} catch (error) {
			const message = 'Failed to bulk delete media items';
			const err = error as Error;
			logger.error(`Error bulk deleting media items by folder IDs: ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'MEDIA_BULK_DELETE_ERROR',
					message: 'Failed to bulk delete media items',
					details: error
				}
			};
		}
	},

	// Upload a new media file
	async uploadMedia(mediaData: Omit<MediaItem, '_id' | 'createdAt' | 'updatedAt'>): Promise<DatabaseResult<MediaItem>> {
		try {
			const newMedia = await this.create({ ...mediaData, _id: generateId() });
			// Convert Mongoose document to MediaItem with proper types
			const mediaObj = newMedia.toObject();
			const mediaWithISODates: MediaItem = {
				_id: mediaObj._id,
				filename: mediaObj.filename,
				originalFilename: mediaObj.originalFilename,
				hash: mediaObj.hash,
				path: mediaObj.path,
				size: mediaObj.size,
				mimeType: mediaObj.mimeType,
				folderId: mediaObj.folderId,
				thumbnails: mediaObj.thumbnails,
				metadata: mediaObj.metadata,
				createdBy: mediaObj.createdBy,
				updatedBy: mediaObj.updatedBy,
				createdAt: toISOString(mediaObj.createdAt),
				updatedAt: toISOString(mediaObj.updatedAt)
			};
			return { success: true, data: mediaWithISODates };
		} catch (error) {
			const message = 'Failed to upload media';
			const err = error as Error;
			logger.error(`Error uploading media: ${err.message}`);
			return {
				success: false,
				message,
				error: { code: 'MEDIA_UPLOAD_ERROR', message, details: error }
			};
		}
	},

	// Delete a media item by its ID
	async deleteMedia(mediaId: DatabaseId): Promise<DatabaseResult<void>> {
		try {
			const result = await this.deleteOne({ _id: mediaId }).exec();
			if (result.deletedCount === 0) {
				const message = `Media item with ID "${mediaId}" not found.`;
				return {
					success: false,
					message,
					error: {
						code: 'MEDIA_DELETE_NOT_FOUND',
						message: `Media item with ID "${mediaId}" not found.`
					}
				};
			}
			logger.info(`Media item "${mediaId}" deleted successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			const message = `Failed to delete media item "${mediaId}"`;
			const err = error as Error;
			logger.error(`Error deleting media item "${mediaId}": ${err.message}`);
			return {
				success: false,
				message,
				error: {
					code: 'MEDIA_DELETE_ERROR',
					message: `Failed to delete media item "${mediaId}"`,
					details: error
				}
			};
		}
	}
};

// Create and export the MediaModel
export const MediaModel = (mongoose.models?.media as Model<MediaItem> | undefined) || mongoose.model<MediaItem>('media', mediaSchema);
