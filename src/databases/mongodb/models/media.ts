/**
 * @file src/databases/mongodb/models/media.ts
 * @description MongoDB schema and model for Media.
 *
 * This module defines a schema and model for media files in the CMS.
 * Media files include images, videos, documents, and other file types.
 */

import { Schema } from 'mongoose';
import type { Media } from '@src/databases/dbInterface';

// System Logger
import { logger } from '@utils/logger.svelte';

// Media schema
export const mediaSchema = new Schema(
	{
		_id: { type: String, required: true },
		filename: { type: String, required: true },
		originalFilename: String,
		path: { type: String, required: true },
		type: { type: String, required: true },
		mimeType: String,
		size: { type: Number, required: true },
		dimensions: {
			width: Number,
			height: Number
		},
		metadata: {
			title: String,
			description: String,
			alt: String,
			caption: String,
			tags: [String],
			customFields: Schema.Types.Mixed
		},
		folder: { type: String, default: '/' },
		status: { type: String, enum: ['public', 'private', 'draft'], default: 'private' },
		createdBy: String,
		updatedBy: String,
		updatedAt: { type: Date, default: Date.now }
	},
	{
		timestamps: true,
		collection: 'system_media',
		strict: false
	}
);

// Add indexes
mediaSchema.index({ filename: 1 });
mediaSchema.index({ type: 1 });
mediaSchema.index({ folder: 1 });
mediaSchema.index({ status: 1 });
mediaSchema.index({ 'metadata.tags': 1 });

// Static methods
mediaSchema.statics = {
	// Create media
	async createMedia(mediaData: {
		filename: string;
		originalFilename?: string;
		path: string;
		type: string;
		mimeType?: string;
		size: number;
		dimensions?: {
			width?: number;
			height?: number;
		};
		metadata?: {
			title?: string;
			description?: string;
			alt?: string;
			caption?: string;
			tags?: string[];
			customFields?: Schema.Types.Mixed;
		};
		folder?: string;
		status?: 'public' | 'private' | 'draft';
		createdBy?: string;
	}): Promise<Media> {
		try {
			const media = new this(mediaData);
			await media.save();
			logger.info(`Created media: ${mediaData.filename}`);
			return media;
		} catch (error) {
			logger.error(`Error creating media: ${error.message}`);
			throw error;
		}
	},

	// Get all media
	async getAllMedia(): Promise<Media[]> {
		try {
			const media = await this.find().sort({ createdAt: -1 }).exec();
			logger.debug(`Retrieved ${media.length} media files`);
			return media;
		} catch (error) {
			logger.error(`Error retrieving media: ${error.message}`);
			throw error;
		}
	},

	// Get media by folder
	async getMediaByFolder(folder: string): Promise<Media[]> {
		try {
			const media = await this.find({ folder }).sort({ createdAt: -1 }).exec();
			logger.debug(`Retrieved ${media.length} media files from folder: ${folder}`);
			return media;
		} catch (error) {
			logger.error(`Error retrieving media by folder: ${error.message}`);
			throw error;
		}
	},

	// Get media by type
	async getMediaByType(type: string): Promise<Media[]> {
		try {
			const media = await this.find({ type }).sort({ createdAt: -1 }).exec();
			logger.debug(`Retrieved ${media.length} media files of type: ${type}`);
			return media;
		} catch (error) {
			logger.error(`Error retrieving media by type: ${error.message}`);
			throw error;
		}
	},

	// Get media by filename
	async getMediaByFilename(filename: string): Promise<Media | null> {
		try {
			const media = await this.findOne({ filename }).exec();
			logger.debug(`Retrieved media: ${filename}`);
			return media;
		} catch (error) {
			logger.error(`Error retrieving media by filename: ${error.message}`);
			throw error;
		}
	},

	// Update media
	async updateMedia(filename: string, updateData: Partial<Media>): Promise<Media | null> {
		try {
			const media = await this.findOneAndUpdate({ filename }, { ...updateData, updatedAt: new Date() }, { new: true }).exec();
			if (media) {
				logger.info(`Updated media: ${filename}`);
			} else {
				logger.warn(`Media not found: ${filename}`);
			}
			return media;
		} catch (error) {
			logger.error(`Error updating media: ${error.message}`);
			throw error;
		}
	},

	// Delete media
	async deleteMedia(filename: string): Promise<boolean> {
		try {
			const result = await this.findOneAndDelete({ filename }).exec();
			if (result) {
				logger.info(`Deleted media: ${filename}`);
				return true;
			}
			logger.warn(`Media not found for deletion: ${filename}`);
			return false;
		} catch (error) {
			logger.error(`Error deleting media: ${error.message}`);
			throw error;
		}
	},

	// Move media to folder
	async moveMediaToFolder(filename: string, newFolder: string): Promise<Media | null> {
		try {
			const media = await this.findOneAndUpdate({ filename }, { folder: newFolder, updatedAt: new Date() }, { new: true }).exec();
			if (media) {
				logger.info(`Moved media ${filename} to folder: ${newFolder}`);
			} else {
				logger.warn(`Media not found for moving: ${filename}`);
			}
			return media;
		} catch (error) {
			logger.error(`Error moving media: ${error.message}`);
			throw error;
		}
	},

	// Search media by tags
	async searchMediaByTags(tags: string[]): Promise<Media[]> {
		try {
			const media = await this.find({
				'metadata.tags': { $in: tags }
			})
				.sort({ createdAt: -1 })
				.exec();
			logger.debug(`Found ${media.length} media files with tags: ${tags.join(', ')}`);
			return media;
		} catch (error) {
			logger.error(`Error searching media by tags: ${error.message}`);
			throw error;
		}
	}
};

// Create and export the Media model
export const MediaModel = mongoose.models?.Media || mongoose.model<Media>('Media', mediaSchema);
