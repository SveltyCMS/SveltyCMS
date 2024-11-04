/**
 * @file utils/media/mediaStorage.ts
 * @description Handles storage operations for media files in the CMS.
 */

import { publicEnv } from '@root/config/public';
import { error } from '@sveltejs/kit';
import fs from 'fs';
import Path from 'path';
import mime from 'mime-types';
import crypto from 'crypto';
import type sharp from 'sharp';

import { setCache } from '@root/src/databases/redis';

// Media type definitions
import type { MediaRemoteVideo, MediaAccess } from './mediaModels';
import { MediaTypeEnum } from './mediaModels';

import { hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { constructUrl } from './mediaUtils';
import { sanitize } from '@utils/utils';

// Database adapter for authentication
import { dbAdapter } from '@src/databases/db';
import type { Role } from '@src/auth/types';

// System logger instance
import { logger } from '@utils/logger';

// Default max file size (100MB) if not specified in publicEnv
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

// Image sizes, including defaults
const SIZES = { ...publicEnv.IMAGE_SIZES, original: 0, thumbnail: 200 } as const;

let s3Client: any = null;

// Dynamically imports AWS SDK and returns an S3 client
async function getS3Client() {
	if (typeof window !== 'undefined') return null; // Prevent execution in the browser

	if (!s3Client) {
		try {
			const AWS = await import('aws-sdk');
			s3Client = new AWS.S3({
				accessKeyId: process.env.AWS_ACCESS_KEY_ID,
				secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
				region: process.env.AWS_REGION
			});
		} catch (error) {
			logger.error('AWS SDK is not installed. S3 functionality will not be available.', error as Error);
			return null;
		}
	}
	return s3Client;
}

// Saves a file to local disk or cloud storage
export async function saveFileToDisk(buffer: Buffer, url: string): Promise<void> {
	if (publicEnv.MEDIASERVER_URL) {
		// Save to cloud storage (e.g., S3)
		const s3 = await getS3Client();
		if (s3) {
			await s3
				.putObject({
					Bucket: process.env.AWS_S3_BUCKET || '',
					Key: url,
					Body: buffer,
					ContentType: mime.lookup(url) || 'application/octet-stream'
				})
				.promise();
		} else {
			throw Error('S3 client is not available. Unable to save file to cloud storage.');
		}
	} else {
		// Save to local storage
		const fullPath = Path.join(publicEnv.MEDIA_FOLDER, url);
		const dir = Path.dirname(fullPath);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true }); // Create directory if it doesn't exist
		}

		await fs.promises.writeFile(fullPath, buffer);
	}
	logger.info('File saved', { url });
}

// Saves a remote media file to the database
export async function saveRemoteMedia(
	fileUrl: string,
	collectionName: string,
	user_id: string,
	access: MediaAccess[] = [],
	roles: Role[] = []
): Promise<{ id: string; fileInfo: MediaRemoteVideo }> {
	try {
		// Fetch the media file from the provided URL
		const response = await fetch(fileUrl);
		if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

		// Get buffer from fetched response
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer); // Convert ArrayBuffer to Buffer
		const hash = await hashFileContent(buffer); // Create hash for the file content

		// Extract and sanitize the file name
		const fileName = decodeURI(fileUrl.split('/').pop() ?? 'defaultName');
		const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
		const url = `remote_media/${hash}-${fileNameWithoutExt}.${ext}`;

		// Construct file info object for the remote video
		const fileInfo: MediaRemoteVideo = {
			hash,
			name: fileName,
			path: 'remote_media',
			url,
			type: MediaTypeEnum.RemoteVideo, // Correct enum assignment
			size: parseInt(response.headers.get('content-length') || '0', 10), // Get size from response
			user: user_id,
			createdAt: new Date(),
			updatedAt: new Date(),
			provider: new URL(fileUrl).hostname,
			externalId: fileUrl,
			versions: [
				{
					version: 1,
					url,
					createdAt: new Date(),
					createdBy: user_id
				}
			],
			access: [
				// User-specific permissions
				{ userId: user_id, permissions: [Permission.Read, Permission.Write, Permission.Delete] },
				// Role-based permissions
				...roles.flatMap((role) =>
					role.permissions.map((permissionId) => ({
						roleId: role._id,
						permissions: [Permission[permissionId as keyof typeof Permission]] // Map to Permission enum
					}))
				),
				// Existing access permissions
				...access.map((item) => ({
					...item,
					permissions: item.permissions || [] // Ensure permissions is present
				}))
			]
		};

		// Ensure the database adapter is initialized
		if (!dbAdapter) {
			const errorMessage = 'Database adapter is not initialized';
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		// Check if the file already exists in the database
		const existingFile = await dbAdapter.findOne('media_remote_videos', { hash });
		if (existingFile) {
			logger.info('Remote file already exists in the database', { fileId: existingFile._id, collection: 'media_remote_videos' });
			return { id: existingFile._id, fileInfo: existingFile as MediaRemoteVideo };
		}

		// Save the file info to the database
		const id = await dbAdapter.insertOne('media_remote_videos', fileInfo);
		await setCache(`media:${id}`, fileInfo, 3600); // Cache for 1 hour

		logger.info('Remote media saved to database', { collectionName, fileInfo });
		return { id, fileInfo };
	} catch (error) {
		logger.error('Error saving remote media:', error instanceof Error ? error : new Error(String(error)));
		throw error; // Re-throw the error
	}
}

// Saves resized versions of an image to disk or cloud storage
export async function saveResizedImages(
	buffer: Buffer,
	hash: string,
	fileName: string,
	collectionName: string,
	ext: string,
	path: string
): Promise<Record<string, { url: string; width: number; height: number }>> {
	const sharp = (await import('sharp')).default;

	const format =
		publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original'
			? (ext as keyof sharp.FormatEnum)
			: (publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format as keyof sharp.FormatEnum);

	const thumbnails: Record<string, { url: string; width: number; height: number }> = {};

	for (const size in SIZES) {
		if (size === 'original') continue; // Skip original size
		const resizedImage = await sharp(buffer)
			.rotate()
			.resize({ width: SIZES[size] }) // Resize image
			.toFormat(format, {
				quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality,
				...(format === 'webp' && { effort: 6 }), // Increased WebP compression effort
				...(format === 'avif' && { effort: 9 }) // High AVIF compression effort
			})
			.toBuffer({ resolveWithObject: true }); // Get resized buffer

		const resizedUrl = constructUrl(path, hash, `${fileName}-${size}`, format, collectionName); // Construct URL
		await saveFileToDisk(resizedImage.data, resizedUrl); // Save resized image

		thumbnails[size] = {
			url: resizedUrl,
			width: resizedImage.info.width,
			height: resizedImage.info.height
		};

		logger.info('Resized image saved', { url: resizedUrl, size });
	}
	return thumbnails;
}

// Saves an avatar image to disk and database
export async function saveAvatarImage(file: File, path: 'avatars' | string): Promise<string> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer); // Convert file to buffer
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20); // Generate hash

		const existingFile = dbAdapter ? await dbAdapter.findOne('media_images', { hash }) : null; // Check if file exists

		if (existingFile) {
			let fileUrl = `${publicEnv.MEDIA_FOLDER}/${existingFile.thumbnail.url}`;
			if (publicEnv.MEDIASERVER_URL) {
				fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`; // Get URL for media server
			}
			return fileUrl; // Return existing file URL
		}

		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name); // Sanitize the file name
		const sanitizedBlobName = sanitize(fileNameWithoutExt); // Sanitize the name for storage
		const format =
			ext === '.svg' ? 'svg' : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original' ? ext : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format;

		const url = `media/images/${hash}-${sanitizedBlobName}${ext}`; // Construct URL
		await saveFileToDisk(buffer, url); // Save the file

		const avatars = await saveResizedImages(buffer, hash, sanitizedBlobName, path, format, 'avatars'); // Save resized versions

		const fileInfo = {
			hash,
			name: file.name,
			path: 'media/images',
			url,
			createdAt: new Date(Date.now()),
			updatedAt: new Date(Date.now()),
			versions: [{ ...avatars }]
		};

		if (!dbAdapter) throw Error('Database adapter not initialized.');

		await dbAdapter.insertOne('media_images', fileInfo); // Save file info to DB
		return `${publicEnv.MEDIA_FOLDER}/${url}`; // Return saved file URL
	} catch (err) {
		logger.error('Error saving avatar image:', err as Error);
		throw err; // Re-throw the error
	}
}

// Deletes a file from storage (disk or cloud)
export async function deleteFile(url: string): Promise<void> {
	if (publicEnv.MEDIASERVER_URL) {
		const s3 = await getS3Client(); // Get S3 client
		if (!s3) throw Error('S3 client is not available.');

		await s3
			.deleteObject({
				Bucket: process.env.AWS_S3_BUCKET || '',
				Key: url
			})
			.promise(); // Delete from S3
		logger.info('File deleted from S3', { url });
	} else {
		const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
		fs.unlinkSync(filePath); // Delete from local disk
		logger.info('File deleted from local disk', { url });
	}
}

// Retrieves a file from storage (disk or cloud)
export async function getFile(url: string): Promise<Buffer> {
	if (publicEnv.MEDIASERVER_URL) {
		const s3 = await getS3Client();
		if (!s3) throw Error('S3 client is not available.');

		const data = await s3
			.getObject({
				Bucket: process.env.AWS_S3_BUCKET || '',
				Key: url
			})
			.promise();

		logger.info('File retrieved from S3', { url });
		return Buffer.from(data.Body as ArrayBuffer); // Return the file buffer
	} else {
		const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
		if (!fs.existsSync(filePath)) throw error(404, 'File not found'); // Check if file exists

		const buffer = await fs.promises.readFile(filePath); // Read the file
		logger.info('File retrieved from local disk', { url });
		return buffer; // Return the file buffer
	}
}

// Checks if a file exists in storage (disk or cloud)
export async function fileExists(url: string): Promise<boolean> {
	if (publicEnv.MEDIASERVER_URL) {
		const s3 = await getS3Client();
		if (!s3) throw Error('S3 client is not available.');

		try {
			await s3
				.headObject({
					Bucket: process.env.AWS_S3_BUCKET || '',
					Key: url
				})
				.promise(); // Check S3 object
			logger.info('File exists in S3', { url });
			return true; // File exists
		} catch (error) {
			if (error instanceof Error && error.message.includes('NotFound')) return false; // File not found
			throw error; // Other errors
		}
	} else {
		const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
		const exists = fs.existsSync(filePath); // Check local file
		logger.info('File exists on local disk', { url, exists });
		return exists; // Return file existence
	}
}

// Cleans up media directory by removing unused files
export async function cleanMediaDirectory(): Promise<void> {
	// Logic to clean up old or unused files can be implemented here
	logger.info('Media directory cleanup triggered.'); // Log cleanup action
}
