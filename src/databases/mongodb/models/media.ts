/**
 * @file src/databases/mongodb/models/media.ts
 * @description MongoDB schema and model for Media.
 *
 * This module defines a schema and model for media files in the CMS.
 * Media files include images, videos, documents, and other file types.
 */

import mongoose, { Schema } from 'mongoose';
import type { Model } from 'mongoose';
import type { MediaItem, DatabaseResult } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Media schema
export const mediaSchema = new Schema<MediaItem>(
	{
		_id: {
			type: String,
			required: true,
			default: () => {
				return new mongoose.Types.ObjectId().toString();
			}
		}, // UUID as per dbInterface.ts
		hash: { type: String, required: true }, // Hash for media
		filename: { type: String, required: true }, // Filename for media
		originalFilename: String, // Original filename for media
		path: { type: String, required: true }, // Path to the media file
		size: { type: Number, required: true }, // Size of the media file
		mimeType: { type: String, required: true }, // Mime type of the media file
		folderId: { type: String, default: null }, // Folder paths/ids as strings
		thumbnail: {
			url: String,
			width: Number,
			height: Number
		},
		thumbnails: { type: Schema.Types.Mixed, default: {} }, // Thumbnails for images
		width: Number, // Width of the media file
		height: Number, // Height of the media file
		user: { type: String, required: true }, // Created by user ID
		access: { type: Schema.Types.Mixed, default: {} },
		category: { type: String, default: null },
		metadata: {
			duration: Number, // Duration for videos/audio
			codec: String, // Codec used for media file
			format: String, // Format of the media file
			type: mongoose.Schema.Types.Mixed // Allow additional metadata fields
		},
		status: { type: String, enum: ['public', 'private', 'draft'], default: 'private' }, // Status options from MediaItem
		createdBy: { type: String, required: true }, // Created by user ID
		updatedBy: { type: String, required: true }, // Updated by user ID
		createdAt: { type: Date, default: Date.now }, // CreatedAt Date type
		updatedAt: { type: Date, default: Date.now }, // UpdatedAt Date type
		versions: { type: [Schema.Types.Mixed], default: [] } // Versions for media file
	},
	{
		timestamps: true,
		collection: 'system_media',
		strict: true // Enforce strict schema validation
	}
);

// Indexes
mediaSchema.index({ filename: 1 });
mediaSchema.index({ folderId: 1 });
mediaSchema.index({ status: 1 });
mediaSchema.index({ 'metadata.tags': 1 });

// Fetch all media files using DatabaseAdapter's crud.findMany
export async function fetchAllMedia(databaseAdapter: DatabaseAdapter): Promise<DatabaseResult<MediaItem[]>> {
	try {
		const result = await databaseAdapter.crud.findMany<MediaItem>('media', {});
		if (result.success) {
			return { success: true, data: result.data };
		} else {
			return { success: false, error: result.error };
		}
	} catch (error) {
		logger.error(`Error fetching all media files: ${error.message}`);
		return {
			success: false,
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
			logger.error(`Error retrieving media item by filename: ${error.message}`);
			return {
				success: false,
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
			logger.error(`Error retrieving media items by folder ID: ${error.message}`);
			return {
				success: false,
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
			logger.error(`Error bulk deleting media items by folder IDs: ${error.message}`);
			return {
				success: false,
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
			const newMedia = await this.create({ ...mediaData, _id: this.utils.generateId() });
			// ISODateString conversion for media.upload
			const mediaWithISODates = {
				...newMedia.toObject(),
				createdAt: newMedia.createdAt.toISOString() as ISODateString,
				updatedAt: newMedia.updatedAt.toISOString() as ISODateString
			} as unknown as MediaItem;
			return { success: true, data: mediaWithISODates };
		} catch (error) {
			logger.error(`Error uploading media: ${error.message}`);
			return {
				success: false,
				error: { code: 'MEDIA_UPLOAD_ERROR', message: 'Failed to upload media', details: error }
			};
		}
	},

	// Delete a media item by its ID
	async deleteMedia(mediaId: DatabaseId): Promise<DatabaseResult<void>> {
		try {
			const result = await this.deleteOne({ _id: mediaId }).exec();
			if (result.deletedCount === 0) {
				return {
					success: false,
					error: {
						code: 'MEDIA_DELETE_NOT_FOUND',
						message: `Media item with ID "${mediaId}" not found.`
					}
				};
			}
			logger.info(`Media item "${mediaId}" deleted successfully.`);
			return { success: true, data: undefined };
		} catch (error) {
			logger.error(`Error deleting media item "${mediaId}": ${error.message}`);
			return {
				success: false,
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
export const MediaModel = (mongoose.models?.MediaItem as Model<MediaItem> | undefined) || mongoose.model<MediaItem>('MediaItem', mediaSchema);
