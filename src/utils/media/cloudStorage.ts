/**
 * @file src/utils/media/cloudStorage.ts
 * @description Cloud storage abstraction layer for S3, R2, and Cloudinary
 *
 * This module provides a unified interface for storing media files in cloud storage
 * services. It respects the MEDIA_FOLDER setting as a path prefix within the bucket/container.
 *
 * Supported storage types:
 * - local: Files stored on local filesystem
 * - s3: Amazon S3 or S3-compatible services
 * - r2: Cloudflare R2
 * - cloudinary: Cloudinary media platform
 *
 * Architecture:
 * - MEDIA_FOLDER setting is used as path prefix in all storage types
 * - Local: MEDIA_FOLDER is filesystem path (e.g., "./mediaFolder")
 * - Cloud: MEDIA_FOLDER is bucket prefix (e.g., "cms-media")
 *
 * Examples:
 * - Local: "./mediaFolder/avatars/image.avif" → filesystem path
 * - S3: "cms-media/avatars/image.avif" → bucket key
 * - R2: "cms-media/avatars/image.avif" → bucket key
 * - Cloudinary: "cms-media/avatars/image" → public_id
 */

import { getPublicSettingSync } from '@src/services/settingsService';
import { logger } from '@utils/logger.server';
import { error } from '@sveltejs/kit';
import type { StorageType } from './mediaModels';

// Cloud storage configuration interface
export interface CloudStorageConfig {
	storageType: StorageType;
	bucketName?: string; // <-- ADDED: Explicit bucket name
	mediaFolder: string; // Used as path prefix in all storage types
	region?: string;
	endpoint?: string;
	publicUrl?: string; // Public URL for accessing files
	accessKeyId?: string; // Set via environment variables
	secretAccessKey?: string; // Set via environment variables
	cloudinaryCloudName?: string; // For Cloudinary
}

//Get cloud storage configuration from settings
export function getCloudStorageConfig(): CloudStorageConfig {
	const storageType = getPublicSettingSync('MEDIA_STORAGE_TYPE') as StorageType;
	const mediaFolder = getPublicSettingSync('MEDIA_FOLDER') || '';

	// Normalize media folder - remove ./ prefix and any leading/trailing slashes
	const normalizedFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');

	return {
		storageType,
		bucketName: getPublicSettingSync('MEDIA_BUCKET_NAME') as string | undefined, // Explicitly cast to string | undefined
		mediaFolder: normalizedFolder, // This is NOW JUST a prefix
		region: getPublicSettingSync('MEDIA_CLOUD_REGION'),
		endpoint: getPublicSettingSync('MEDIA_CLOUD_ENDPOINT'),
		publicUrl: getPublicSettingSync('MEDIA_CLOUD_PUBLIC_URL') || getPublicSettingSync('MEDIASERVER_URL'),
		accessKeyId: process.env.MEDIA_ACCESS_KEY_ID,
		secretAccessKey: process.env.MEDIA_SECRET_ACCESS_KEY,
		cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME
	};
}

// Check if cloud storage is configured
export function isCloudStorage(): boolean {
	const storageType = getPublicSettingSync('MEDIA_STORAGE_TYPE') as StorageType;
	return storageType !== 'local';
}

/**
 * Construct full cloud path with MEDIA_FOLDER prefix
 * @param relativePath - Path relative to media folder (e.g., "avatars/image.avif")
 * @returns Full path including MEDIA_FOLDER prefix (e.g., "cms-media/avatars/image.avif")
 */
export function getCloudPath(relativePath: string): string {
	const config = getCloudStorageConfig();
	const cleanPath = relativePath.replace(/^\/+/, '');
	if (!config.mediaFolder) {
		return cleanPath;
	}
	return `${config.mediaFolder}/${cleanPath}`;
}

/**
 * Construct public URL for cloud-stored file
 * @param relativePath - Path relative to media folder (e.g., "avatars/image.avif")
 * @returns Full public URL
 */
export function getCloudUrl(relativePath: string): string {
	const config = getCloudStorageConfig();

	if (config.storageType === 'local') {
		// Local files use /files/ route
		return `/files/${relativePath.replace(/^\/+/, '')}`;
	}

	if (!config.publicUrl) {
		logger.error('Cloud storage configured but no public URL available', { storageType: config.storageType });
		throw error(500, 'Cloud storage public URL not configured');
	}

	// Construct full cloud path including MEDIA_FOLDER prefix
	const fullPath = getCloudPath(relativePath);

	// Combine public URL with full path
	const baseUrl = config.publicUrl.replace(/\/+$/, ''); // Remove trailing slash
	return `${baseUrl}/${fullPath}`;
}

/**
 * Upload file to cloud storage
 * @param buffer - File buffer to upload
 * @param relativePath - Path relative to media folder (e.g., "avatars/image.avif")
 * @returns Public URL of uploaded file
 */
export async function uploadToCloud(buffer: Buffer, relativePath: string): Promise<string> {
	const config = getCloudStorageConfig();

	if (config.storageType === 'local') {
		throw error(500, 'uploadToCloud called with local storage type');
	}

	// S3/R2 use the full path (prefix + relative) as the Key
	const fullPath = getCloudPath(relativePath);

	logger.debug('Uploading to cloud storage', {
		storageType: config.storageType,
		relativePath,
		fullPath,
		size: buffer.length
	});

	switch (config.storageType) {
		case 's3':
		case 'r2':
			// Pass the FULL path (e.g., "cms-media/avatars/image.avif")
			await uploadToS3Compatible(buffer, fullPath, config);
			return getCloudUrl(relativePath); // Return public URL

		case 'cloudinary':
			// Pass the RELATIVE path (e.g., "avatars/image.avif")
			// Cloudinary combines `folder` and `public_id` itself
			return await uploadToCloudinary(buffer, relativePath, config);

		default:
			throw error(500, `Unsupported storage type: ${config.storageType}`);
	}
}

/**
 * Delete file from cloud storage
 * @param relativePath - Path relative to media folder (e.g., "avatars/image.avif")
 */
export async function deleteFromCloud(relativePath: string): Promise<void> {
	const config = getCloudStorageConfig();

	if (config.storageType === 'local') {
		throw error(500, 'deleteFromCloud called with local storage type');
	}

	const fullPath = getCloudPath(relativePath);

	logger.debug('Deleting from cloud storage', {
		storageType: config.storageType,
		relativePath,
		fullPath
	});

	switch (config.storageType) {
		case 's3':
		case 'r2':
			await deleteFromS3Compatible(fullPath, config);
			break;

		case 'cloudinary':
			// Pass relative path
			await deleteFromCloudinary(relativePath, config);
			break;

		default:
			throw error(500, `Unsupported storage type: ${config.storageType}`);
	}
}

/**
 * Check if file exists in cloud storage
 * @param relativePath - Path relative to media folder
 */
export async function cloudFileExists(relativePath: string): Promise<boolean> {
	const config = getCloudStorageConfig();

	if (config.storageType === 'local') {
		throw error(500, 'cloudFileExists called with local storage type');
	}

	const fullPath = getCloudPath(relativePath);

	switch (config.storageType) {
		case 's3':
		case 'r2':
			return await s3FileExists(fullPath, config);

		case 'cloudinary':
			return await cloudinaryFileExists(relativePath, config);

		default:
			return false;
	}
}

// ==================== S3/R2 Implementation ====================

async function uploadToS3Compatible(buffer: Buffer, key: string, config: CloudStorageConfig): Promise<void> {
	const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

	if (!config.accessKeyId || !config.secretAccessKey) {
		throw error(500, 'S3 credentials not configured. Set MEDIA_ACCESS_KEY_ID and MEDIA_SECRET_ACCESS_KEY environment variables.');
	}
	if (!config.bucketName) {
		// <-- CHECK for bucket name
		throw error(500, 'S3 storage configured but MEDIA_BUCKET_NAME is not set.');
	}

	const client = new S3Client({
		region: config.region || 'auto',
		endpoint: config.endpoint,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey
		}
	});

	try {
		const command = new PutObjectCommand({
			Bucket: config.bucketName, // <-- Use config.bucketName
			Key: key, // <-- Use the full path as the key
			Body: buffer,
			ContentType: getMimeType(key)
		});

		await client.send(command);
		logger.info('File uploaded to S3/R2', { key, size: buffer.length });
	} catch (err) {
		logger.error('Failed to upload to S3/R2', { key, error: err });
		const message = err instanceof Error ? err.message : String(err);
		throw error(500, `Failed to upload to cloud storage: ${message}`);
	}
}

async function deleteFromS3Compatible(key: string, config: CloudStorageConfig): Promise<void> {
	const { S3Client, DeleteObjectCommand } = await import('@aws-sdk/client-s3');

	if (!config.accessKeyId || !config.secretAccessKey) {
		throw error(500, 'S3 credentials not configured');
	}
	if (!config.bucketName) {
		throw error(500, 'S3 storage configured but MEDIA_BUCKET_NAME is not set.');
	}

	const client = new S3Client({
		region: config.region || 'auto',
		endpoint: config.endpoint,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey
		}
	});

	try {
		const command = new DeleteObjectCommand({
			Bucket: config.bucketName, // <-- Use config.bucketName
			Key: key // <-- Use the full path as the key
		});

		await client.send(command);
		logger.info('File deleted from S3/R2', { key });
	} catch (err) {
		logger.error('Failed to delete from S3/R2', { key, error: err });
		const message = err instanceof Error ? err.message : String(err);
		throw error(500, `Failed to delete from cloud storage: ${message}`);
	}
}

async function s3FileExists(key: string, config: CloudStorageConfig): Promise<boolean> {
	const { S3Client, HeadObjectCommand } = await import('@aws-sdk/client-s3');

	if (!config.accessKeyId || !config.secretAccessKey) {
		return false;
	}
	if (!config.bucketName) {
		return false;
	}

	const client = new S3Client({
		region: config.region || 'auto',
		endpoint: config.endpoint,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey
		}
	});

	try {
		const command = new HeadObjectCommand({
			Bucket: config.bucketName, // <-- Use config.bucketName
			Key: key // <-- Use the full path as the key
		});

		await client.send(command);
		return true;
	} catch {
		return false;
	}
}

// ==================== Cloudinary Implementation ====================

// Pass RELATIVE path here (e.g., "avatars/image.avif")
async function uploadToCloudinary(buffer: Buffer, relativePath: string, config: CloudStorageConfig): Promise<string> {
	const cloudinary = await import('cloudinary').then((m) => m.v2);

	if (!config.cloudinaryCloudName) {
		throw error(500, 'Cloudinary cloud name not configured. Set CLOUDINARY_CLOUD_NAME environment variable.');
	}

	cloudinary.config({
		cloud_name: config.cloudinaryCloudName,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET
	});

	// Remove extension from relative path for public_id
	const publicId = relativePath.replace(/\.[^.]+$/, '');

	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				public_id: publicId, // e.g., "avatars/image"
				folder: config.mediaFolder, // e.g., "cms-media"
				resource_type: 'auto'
			},
			(error, result) => {
				if (error) {
					logger.error('Failed to upload to Cloudinary', { publicId, error });
					reject(new Error(`Failed to upload to Cloudinary: ${error.message}`));
				} else if (!result) {
					logger.error('Failed to upload to Cloudinary: No result returned', { publicId });
					reject(new Error('Failed to upload to Cloudinary: No result returned'));
				} else {
					logger.info('File uploaded to Cloudinary', { publicId: result.public_id, url: result.secure_url });
					resolve(result.secure_url);
				}
			}
		);

		uploadStream.end(buffer);
	});
}

// Pass RELATIVE path here
async function deleteFromCloudinary(relativePath: string, config: CloudStorageConfig): Promise<void> {
	const cloudinary = await import('cloudinary').then((m) => m.v2);

	if (!config.cloudinaryCloudName) {
		throw error(500, 'Cloudinary cloud name not configured');
	}

	cloudinary.config({
		cloud_name: config.cloudinaryCloudName,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET
	});

	// Construct the full public_id (folder + relative path without extension)
	const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, '')}`;

	try {
		await cloudinary.uploader.destroy(publicId);
		logger.info('File deleted from Cloudinary', { publicId });
	} catch (err) {
		logger.error('Failed to delete from Cloudinary', { publicId, error: err });
		throw error(500, `Failed to delete from Cloudinary: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// Pass RELATIVE path here
async function cloudinaryFileExists(relativePath: string, config: CloudStorageConfig): Promise<boolean> {
	const cloudinary = await import('cloudinary').then((m) => m.v2);

	if (!config.cloudinaryCloudName) {
		return false;
	}

	cloudinary.config({
		cloud_name: config.cloudinaryCloudName,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET
	});

	const publicId = `${config.mediaFolder}/${relativePath.replace(/\.[^.]+$/, '')}`;

	try {
		await cloudinary.api.resource(publicId);
		return true;
	} catch {
		return false;
	}
}

// ==================== Utilities ====================

function getMimeType(filename: string): string {
	const ext = filename.split('.').pop()?.toLowerCase();
	const mimeTypes: Record<string, string> = {
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp',
		avif: 'image/avif',
		svg: 'image/svg+xml',
		mp4: 'video/mp4',
		webm: 'video/webm',
		pdf: 'application/pdf'
	};
	return mimeTypes[ext || ''] || 'application/octet-stream';
}
