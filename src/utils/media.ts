/**
 * @file src/utils/media.ts
 * @description
 * This file contains utility functions for handling media operations in a Content Management System (CMS).
 * It provides comprehensive functionality for managing various types of media files including
 * images, documents, videos, and audio files. Key features include:
 *
 * - File upload and storage management with support for local and cloud storage
 * - Image resizing, format conversion, and WebP support
 * - File metadata extraction, storage, and search capabilities
 * - Remote media handling and URL signing for secure access
 * - Database integration for media tracking with support for soft delete and restore
 * - User association with uploaded media
 * - Bulk operations for efficient media management
 * - File validation, security checks, and cleanup of old trashed files
 * - Comprehensive error handling and logging
 * - Access control for media files
 * - Version control for media files
 * - Caching support using Redis for improved performance
 *
 * @module MediaUtils
 */

import { publicEnv } from '@root/config/public';
import fs from 'fs';
import path from 'path';
import { browser } from '$app/environment';
import { sha256, removeExtension, sanitize } from '@src/utils/utils';
import mime from 'mime-types';

// Auth
import { dbAdapter } from '@src/databases/db';
import type { Role } from '@src/auth/types';

// Redis
import { getCache, setCache, clearCache } from '@src/databases/redis';

// System Logger
import logger from '@src/utils/logger';
import type sharp from 'sharp';

// Default max file size (100MB) if not specified in publicEnv
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

// Optional dynamically imports AWS SDK
async function getS3Client() {
	try {
		const AWS = await import('aws-sdk');
		return new AWS.S3({
			accessKeyId: process.env.AWS_ACCESS_KEY_ID,
			secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
			region: process.env.AWS_REGION
		});
	} catch (error) {
		logger.error('AWS SDK is not installed. S3 functionality will not be available.:', error as Error);
		return null;
	}
}

interface MediaVersion {
	version: number;
	url: string;
	createdAt: Date;
	createdBy: string;
}

interface MediaAccess {
	userId?: string;
	roleId?: string;
	permissions: ('read' | 'write' | 'delete')[];
}

// Define media types
interface MediaBase {
	_id?: string;
	hash: string;
	name: string;
	url: string;
	type: string;
	size: number;
	user: string;
	createdAt: Date;
	updatedAt: Date;
	metadata?: Record<string, any>;
	isDeleted?: boolean;
	deletedAt?: Date;
	versions: MediaVersion[];
	access: MediaAccess[];
}

// Define media types
interface MediaImage extends MediaBase {
	width: number;
	height: number;
	thumbnails: Record<string, { url: string; width: number; height: number }>;
}

// Define MediaDocument
interface MediaDocument extends MediaBase {
	pageCount?: number;
}

// Define MediaAudio
interface MediaAudio extends MediaBase {
	duration?: number;
}

// Define MediaVideo
interface MediaVideo extends MediaBase {
	duration?: number;
	thumbnailUrl?: string;
}

// Define MediaRemoteVideo
interface MediaRemoteVideo extends MediaBase {
	provider: string;
	externalId: string;
}

type MediaType = MediaImage | MediaDocument | MediaAudio | MediaVideo | MediaRemoteVideo;

const SIZES = { ...publicEnv.IMAGE_SIZES, original: 0, thumbnail: 200 } as const;

async function hashFileContent(buffer: Buffer): Promise<string> {
	return (await sha256(buffer)).slice(0, 20);
}

function getSanitizedFileName(fileName: string): { fileNameWithoutExt: string; ext: string } {
	const { name, ext } = removeExtension(fileName);
	return { fileNameWithoutExt: sanitize(name), ext };
}

function constructUrl(path: string, hash: string, fileName: string, ext: string, collectionName: string): string {
	let url: string;
	switch (path) {
		case 'global':
			url = `/original/${hash}-${fileName}.${ext}`;
			break;
		case 'unique':
			url = `/${collectionName}/original/${hash}-${fileName}.${ext}`;
			break;
		default:
			url = `/${path}/original/${hash}-${fileName}.${ext}`;
	}
	return publicEnv.MEDIASERVER_URL ? `${publicEnv.MEDIASERVER_URL}/files/${url}` : url;
}

// Helper function to get all file paths for a media item
async function getMediaFilePaths(mediaItem: MediaType): Promise<string[]> {
	const paths = [path.join(publicEnv.MEDIA_FOLDER, mediaItem.url)];

	if ('thumbnails' in mediaItem) {
		for (const thumbnail of Object.values(mediaItem.thumbnails)) {
			paths.push(path.join(publicEnv.MEDIA_FOLDER, thumbnail.url));
		}
	}

	return paths;
}

// Move media to trash
export async function moveMediaToTrash(id: string, collection: string): Promise<void> {
	try {
		const mediaItem = await getMediaById(id, collection);
		if (!mediaItem) {
			throw new Error('Media not found');
		}

		const trashFolder = path.join(publicEnv.MEDIA_FOLDER, 'trash', collection);

		// Create trash folder if it doesn't exist
		await new Promise<void>((resolve, reject) => {
			fs.mkdir(trashFolder, { recursive: true }, (err) => {
				if (err && err.code !== 'EEXIST') reject(err);
				else resolve();
			});
		});

		const filePaths = await getMediaFilePaths(mediaItem);

		for (const filePath of filePaths) {
			const fileName = path.basename(filePath);
			const trashPath = path.join(trashFolder, fileName);
			await new Promise<void>((resolve, reject) => {
				fs.rename(filePath, trashPath, (err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		}

		// Update database record to mark as trashed
		if (dbAdapter) {
			await dbAdapter.updateOne(collection, { _id: id }, { $set: { trashed: true, trashedAt: new Date() } });
		} else {
			logger.warn('dbAdapter is not available. Database not updated for trashed media.');
		}

		logger.info(`Moved media to trash: ${id}`, { collection });
	} catch (error) {
		logger.error('Error moving media to trash:', error as Error);
		throw error;
	}
}

// Function to clean up old trashed files
export async function cleanupTrashedMedia(daysOld: number = 30): Promise<void> {
	const trashFolder = path.join(publicEnv.MEDIA_FOLDER, 'trash');
	const now = new Date();

	try {
		const collections = await fs.promises.readdir(trashFolder);
		for (const collection of collections) {
			const collectionPath = path.join(trashFolder, collection);
			const files = await fs.promises.readdir(collectionPath);

			for (const file of files) {
				const filePath = path.join(collectionPath, file);
				const stats = await fs.promises.stat(filePath);

				const daysInTrash = (now.getTime() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);

				if (daysInTrash > daysOld) {
					await fs.promises.unlink(filePath);
					logger.info(`Deleted old trashed file: ${filePath}`);
				}
			}
		}

		// Clean up database records
		if (dbAdapter) {
			const cutoffDate = new Date(now.getTime() - daysOld * 24 * 60 * 60 * 1000);
			const mediaCollections = ['media_images', 'media_documents', 'media_audio', 'media_videos'];

			for (const collection of mediaCollections) {
				await dbAdapter.deleteMany(collection, { trashed: true, trashedAt: { $lt: cutoffDate } });
			}

			logger.info('Cleanup of trashed media completed');
		} else {
			logger.warn('dbAdapter is not available. Database cleanup skipped.');
		}
	} catch (error) {
		logger.error('Error during trash cleanup:', error as Error);
		throw error;
	}
}

// Helper function to save file to disk
async function saveFileToDisk(buffer: Buffer, url: string): Promise<void> {
	if (publicEnv.MEDIASERVER_URL) {
		// Save to cloud storage
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
			throw new Error('S3 client is not available. Unable to save file to cloud storage.');
		}
	} else {
		// Save to local storage
		const fullPath = `${publicEnv.MEDIA_FOLDER}/${url}`;
		if (!fs.existsSync(path.dirname(fullPath))) {
			fs.mkdirSync(path.dirname(fullPath), { recursive: true });
		}
		await fs.promises.writeFile(fullPath, buffer);
	}
	logger.info('File saved', { url });
}

// Helper function to save resized images
async function saveResizedImages(
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
			? (ext.slice(1) as keyof sharp.FormatEnum)
			: (publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format as keyof sharp.FormatEnum);

	const thumbnails: Record<string, { url: string; width: number; height: number }> = {};

	for (const size in SIZES) {
		if (size === 'original') continue;
		const resizedImage = await sharp(buffer)
			.rotate()
			.resize({ width: SIZES[size] })
			.toFormat(format, {
				quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality,
				...(format === 'webp' && { effort: 6 }), // Increased WebP compression effort
				...(format === 'avif' && { effort: 9 }) // High AVIF compression effort
			})
			.toBuffer({ resolveWithObject: true });

		const resizedUrl = constructUrl(path, hash, `${fileName}-${size}`, format, collectionName);
		await saveFileToDisk(resizedImage.data, resizedUrl);

		thumbnails[size] = {
			url: resizedUrl,
			width: resizedImage.info.width,
			height: resizedImage.info.height
		};

		logger.info('Resized image saved', { url: resizedUrl, size });
	}
	return thumbnails;
}

async function extractMetadata(file: File, buffer: Buffer): Promise<Record<string, any>> {
	const metadata: Record<string, any> = {};
	const fileType = mime.lookup(file.name);

	if (fileType && fileType.startsWith('image/')) {
		const sharp = (await import('sharp')).default;
		const imageInfo = await sharp(buffer).metadata();
		metadata.width = imageInfo.width;
		metadata.height = imageInfo.height;
		metadata.format = imageInfo.format;
	} else if (fileType && fileType.startsWith('video/')) {
		// For video metadata, you might want to use a library like fluent-ffmpeg
		// This is a placeholder for video metadata extraction
		metadata.duration = 0; // Replace with actual duration
		// You can add more video-specific metadata here
	} else if (fileType && fileType.startsWith('audio/')) {
		// For audio metadata, you might want to use a library like music-metadata
		// This is a placeholder for audio metadata extraction
		metadata.duration = 0; // Replace with actual duration
		// You can add more audio-specific metadata here
	} else if (fileType && fileType.startsWith('application/')) {
		// For document metadata
		if (fileType === 'application/pdf') {
			// Extract PDF metadata (you might want to use a library like pdf-parse)
			metadata.pageCount = 0; // Replace with actual page count
		} else if (fileType.includes('word')) {
			// Extract Word document metadata
			metadata.pageCount = 0; // Replace with actual page count
		}
		// Add more document types as needed
	}

	// Add common metadata
	metadata.size = buffer.length;
	metadata.mimeType = fileType || 'application/octet-stream';
	metadata.lastModified = new Date().toISOString();

	return metadata;
}
// Helper function to save media to database
async function saveMediaToDb(collection: string, fileInfo: MediaType): Promise<string> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const result = await dbAdapter.insertMany(collection, [fileInfo]);
	return result[0]._id.toString();
}

// Small function to save different types of media
export async function saveMedia(
	file: File,
	collectionName: string,
	user_id: string,
	access: MediaAccess[] = [],
	roles: Role[] = []
): Promise<{ id: string; fileInfo: MediaType }> {
	if (browser) return {} as any;

	if (!dbAdapter) {
		throw new Error('Database adapter is not available');
	}

	const fileType = mime.lookup(file.name);

	if (!fileType) {
		throw new Error('Unable to determine file type');
	}

	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const pathValue = 'global'; // or determine path based on your logic
		const url = constructUrl(pathValue, hash, fileNameWithoutExt, ext, collectionName);
		const metadata = await extractMetadata(file, buffer);

		// Determine the correct media type and collection
		let mediaCollection: string;
		let handleResizing = false;
		if (fileType.startsWith('image/')) {
			mediaCollection = 'media_images';
			handleResizing = true;
		} else if (fileType === 'application/pdf' || fileType.includes('word')) {
			mediaCollection = 'media_documents';
		} else if (fileType.startsWith('video/')) {
			mediaCollection = 'media_videos';
		} else if (fileType.startsWith('audio/')) {
			mediaCollection = 'media_audio';
		} else {
			throw new Error(`Unsupported file type: ${fileType}`);
		}

		// Check if file already exists
		const existingFile = await dbAdapter.findOne(mediaCollection, { hash });
		if (existingFile) {
			logger.info('File already exists in the database', { fileId: existingFile._id, mediaCollection });
			return { id: existingFile._id, fileInfo: existingFile as MediaType };
		}

		// Prepare file info
		const fileInfo: MediaBase = {
			hash,
			name: file.name,
			url,
			type: file.type,
			size: file.size,
			user: user_id,
			createdAt: new Date(),
			updatedAt: new Date(),
			metadata,
			versions: [
				{
					version: 1,
					url,
					createdAt: new Date(),
					createdBy: user_id
				}
			],
			access: [
				{ userId: user_id, permissions: ['read', 'write', 'delete'] },
				...access,
				...roles.map((role) => ({ roleId: role._id, permissions: ['read'] as ('read' | 'write' | 'delete')[] }))
			]
		};

		// Save file to disk
		await saveFileToDisk(buffer, url);

		// Handle image resizing
		if (handleResizing && !file.type.includes('svg')) {
			const thumbnails = await saveResizedImages(buffer, hash, fileNameWithoutExt, collectionName, ext, pathValue);
			(fileInfo as MediaImage).thumbnails = thumbnails;
			(fileInfo as MediaImage).width = metadata.width || 0;
			(fileInfo as MediaImage).height = metadata.height || 0;
		}

		// Save to database
		logger.info(`Saving media to db: ${mediaCollection}`, { fileInfo });
		const id = await saveMediaToDb(mediaCollection, fileInfo as MediaType);

		// Cache the media info
		await setCache(`media:${id}`, fileInfo, 3600); // Cache for 1 hour

		return { id, fileInfo: fileInfo as MediaType };
	} catch (error) {
		logger.error('Error saving media:', error as Error);
		throw error;
	}
}

// TODO: Add support for image thumbnails
export async function saveImage(
	file: File,
	collectionName: string,
	user_id: string,
	access: MediaAccess[] = [],
	roles: Role[] = []
): Promise<{ id: string; fileInfo: MediaImage }> {
	const result = await saveMedia(file, collectionName, user_id, access, roles);
	return {
		id: result.id,
		fileInfo: result.fileInfo as MediaImage
	};
}

// TODO: Add support for document thumbnails
export async function saveDocument(
	file: File,
	collectionName: string,
	user_id: string,
	access: MediaAccess[] = [],
	roles: Role[] = []
): Promise<{ id: string; fileInfo: MediaDocument }> {
	const result = await saveMedia(file, collectionName, user_id, access, roles);
	return {
		id: result.id,
		fileInfo: result.fileInfo as MediaDocument
	};
}

// TODO: Add support for video thumbnails
export async function saveVideo(
	file: File,
	collectionName: string,
	user_id: string,
	access: MediaAccess[] = [],
	roles: Role[] = []
): Promise<{ id: string; fileInfo: MediaVideo }> {
	const result = await saveMedia(file, collectionName, user_id, access, roles);
	return {
		id: result.id,
		fileInfo: result.fileInfo as MediaVideo
	};
}

export async function saveAudio(
	file: File,
	collectionName: string,
	user_id: string,
	access: MediaAccess[] = [],
	roles: Role[] = []
): Promise<{ id: string; fileInfo: MediaAudio }> {
	const result = await saveMedia(file, collectionName, user_id, access, roles);
	return {
		id: result.id,
		fileInfo: result.fileInfo as MediaAudio
	};
}

export async function saveRemoteMedia(
	fileUrl: string,
	collectionName: string,
	user_id: string,
	access: MediaAccess[] = [],
	roles: Role[] = []
): Promise<{ id: string; fileInfo: MediaRemoteVideo }> {
	try {
		const response = await fetch(fileUrl);
		if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

		const buffer = Buffer.from(await response.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const fileName = decodeURI(fileUrl.split('/').pop() ?? 'defaultName');
		const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
		const url = `remote_media/${hash}-${fileNameWithoutExt}.${ext}`;

		const fileInfo: MediaRemoteVideo = {
			hash,
			name: fileName,
			url,
			type: response.headers.get('content-type') || 'unknown',
			size: parseInt(response.headers.get('content-length') || '0'),
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
				{ userId: user_id, permissions: ['read', 'write', 'delete'] },
				...access,
				...roles.map((role) => ({ roleId: role._id, permissions: ['read'] as ('read' | 'write' | 'delete')[] }))
			]
		};

		if (!dbAdapter) {
			const errorMessage = 'Database adapter is not initialized';
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		// Check if file already exists
		const existingFile = await dbAdapter.findOne('media_remote_videos', { hash });
		if (existingFile) {
			logger.info('Remote file already exists in the database', { fileId: existingFile._id, collection: 'media_remote_videos' });
			return { id: existingFile._id, fileInfo: existingFile as MediaRemoteVideo };
		}

		// Save to database
		const id = await saveMediaToDb('media_remote_videos', fileInfo);

		// Cache the media info
		await setCache(`media:${id}`, fileInfo, 3600); // Cache for 1 hour

		logger.info('Remote media saved to database', { collectionName, fileInfo });
		return { id, fileInfo };
	} catch (error) {
		logger.error('Error saving remote media:', error as Error);
		throw error;
	}
}

// Save avatar image function
export async function saveAvatarImage(file: File, path: 'avatars' | string): Promise<string> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);

		const existingFile = dbAdapter ? await dbAdapter.findOne('media_images', { hash }) : null;

		if (existingFile) {
			let fileUrl = `${publicEnv.MEDIA_FOLDER}/${existingFile.thumbnail.url}`;
			if (publicEnv.MEDIASERVER_URL) {
				fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
			}
			return fileUrl;
		}

		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const sanitizedBlobName = sanitize(fileNameWithoutExt);
		const format =
			ext === '.svg' ? 'svg' : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original' ? ext : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format;
		const url = `${path}/${hash}-${sanitizedBlobName}.${format}`;

		let resizedBuffer: Buffer;
		let info: any;

		if (format === 'svg') {
			resizedBuffer = buffer;
			info = { width: null, height: null };
		} else {
			const result = await sharp(buffer)
				.rotate()
				.resize({ width: 300 })
				.toFormat(format as keyof import('sharp').FormatEnum, {
					quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality
				})
				.toBuffer({ resolveWithObject: true });

			resizedBuffer = result.data;
			info = result.info;
		}

		const finalBuffer = buffer.byteLength < resizedBuffer.byteLength ? buffer : resizedBuffer;

		if (!fs.existsSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`))) {
			fs.mkdirSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`), { recursive: true });
		}

		fs.writeFileSync(`${publicEnv.MEDIA_FOLDER}/${url}`, finalBuffer);

		const imageData = {
			hash,
			thumbnail: {
				name: `${hash}-${sanitizedBlobName}.${format}`,
				url,
				type: `image/${format}`,
				size: file.size,
				width: info.width,
				height: info.height
			}
		};

		if (!dbAdapter) {
			const errorMessage = 'Database adapter is not initialized';
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		await dbAdapter.insertMany('media_images', [imageData]);

		let fileUrl = `${publicEnv.MEDIA_FOLDER}/${imageData.thumbnail.url}`;
		if (publicEnv.MEDIASERVER_URL) {
			fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
		}

		return fileUrl;
	} catch (err) {
		logger.error('Error in saveAvatarImage:', err as Error);
		throw new Error('Failed to save avatar image');
	}
}

// Get media by id
export async function getMediaById(id: string, collection: string): Promise<MediaType | null> {
	// Try to get from cache first
	const cachedMedia = await getCache<MediaType>(`media:${id}`);
	if (cachedMedia) {
		return cachedMedia;
	}

	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const media = await dbAdapter.findOne(collection, { _id: id });

	// Cache the result for future requests
	if (media) {
		await setCache(`media:${id}`, media, 3600); // Cache for 1 hour
	}

	return media;
}

// Delete media
export async function deleteMedia(id: string, collection: string): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const media = await getMediaById(id, collection);
	if (!media) {
		throw new Error('Media not found');
	}

	// Delete file from disk
	const fullPath = `${publicEnv.MEDIA_FOLDER}/${media.url}`;
	await fs.promises.unlink(fullPath);

	// Delete thumbnails if they exist
	if ('thumbnails' in media) {
		for (const thumbnail of Object.values(media.thumbnails)) {
			await fs.promises.unlink(`${publicEnv.MEDIA_FOLDER}/${thumbnail.url}`);
		}
	}

	// Remove from database
	await dbAdapter.deleteOne(collection, { _id: id });
	logger.info('Media deleted', { id, collection });
}

// Update media version
export async function updateMediaVersion(id: string, collection: string, newBuffer: Buffer, user_id: string): Promise<void> {
	const media = await getMediaById(id, collection);
	if (!media) {
		throw new Error('Media not found');
	}

	const newVersion = media.versions.length + 1;
	const newUrl = constructUrl(
		media.url.split('/')[1],
		media.hash,
		`${removeExtension(media.name).name}-v${newVersion}`,
		path.extname(media.name),
		collection
	);

	await saveFileToDisk(newBuffer, newUrl);

	const newVersionInfo: MediaVersion = {
		version: newVersion,
		url: newUrl,
		createdAt: new Date(),
		createdBy: user_id
	};
	await dbAdapter.updateOne(collection, { _id: id }, { $push: { versions: newVersionInfo }, $set: { updatedAt: new Date() } });

	// Clear the cache for this media
	await clearCache(`media:${id}`);

	logger.info('Media version updated', { id, collection, version: newVersion });
}

// Add Media Access
export async function setMediaAccess(id: string, collection: string, userId: string, permissions: ('read' | 'write' | 'delete')[]): Promise<void> {
	await dbAdapter.updateOne(collection, { _id: id }, { $push: { access: { userId, permissions } }, $set: { updatedAt: new Date() } });

	// Clear the cache for this media
	await clearCache(`media:${id}`);

	logger.info('Media access updated', { id, collection, userId, permissions });
}

// Check Media Access
export async function checkMediaAccess(
	id: string,
	collection: string,
	userId: string,
	userRoles: string[], // Add this parameter to pass user's roles
	requiredPermission: 'read' | 'write' | 'delete'
): Promise<boolean> {
	const media = await getMediaById(id, collection);
	if (!media) {
		return false;
	}

	// Check user-specific access
	const userAccess = media.access.find((access) => access.userId === userId);
	if (userAccess && userAccess.permissions.includes(requiredPermission)) {
		return true;
	}

	// Check role-based access
	for (const roleId of userRoles) {
		const roleAccess = media.access.find((access) => access.roleId === roleId);
		if (roleAccess && roleAccess.permissions.includes(requiredPermission)) {
			return true;
		}
	}

	return false;
}

// Update Media Metadata
export async function updateMediaMetadata(id: string, collection: string, metadata: Record<string, any>): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateOne(collection, { _id: id }, { $set: { metadata, updatedAt: new Date() } });
	logger.info('Media metadata updated', { id, collection, metadata });
}

// Soft delete media (used for trashed media)
export async function softDeleteMedia(id: string, collection: string): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateOne(collection, { _id: id }, { $set: { isDeleted: true, deletedAt: new Date() } });
	logger.info('Media soft deleted', { id, collection });
}

// Restore media (used for trashed media)
export async function restoreMedia(id: string, collection: string): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateOne(collection, { _id: id }, { $unset: { isDeleted: '', deletedAt: '' } });
	logger.info('Media restored', { id, collection });
}

// Update Media Info
export async function updateMediaInfo(id: string, collection: string, updates: Partial<MediaBase>): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateOne(collection, { _id: id }, { $set: { ...updates, updatedAt: new Date() } });
	logger.info('Media info updated', { id, collection, updates });
}

// List all Media
export async function listMedia(collection: string, page: number = 1, limit: number = 20): Promise<{ media: MediaType[]; total: number }> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const skip = (page - 1) * limit;
	const [media, total] = await Promise.all([
		dbAdapter.findMany(collection, { isDeleted: { $ne: true } }),
		dbAdapter.countDocuments(collection, { isDeleted: { $ne: true } })
	]);
	return { media: media.slice(skip, skip + limit), total };
}

// Bulk delete media
export async function bulkDeleteMedia(ids: string[], collection: string): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateMany(collection, { _id: { $in: ids } }, { $set: { isDeleted: true, deletedAt: new Date() } });
	logger.info('Bulk media soft deleted', { ids, collection });
}

// Generate Signed URL for Media
export async function generateSignedUrl(id: string, collection: string, expiresIn: number = 3600): Promise<string> {
	const media = await getMediaById(id, collection);
	if (!media) {
		throw new Error('Media not found');
	}

	// This is a simplified example. In a real-world scenario, you'd use a more secure method
	// of generating and verifying signed URLs.
	const timestamp = Date.now() + expiresIn * 1000;
	const signature = await sha256(Buffer.from(`${id}:${timestamp}:${publicEnv.SECRET_KEY}`));
	return `${media.url}?signature=${signature}&expires=${timestamp}`;
}

//	Search Media Items
export async function searchMedia(collection: string, query: string, metadata?: Record<string, any>): Promise<MediaType[]> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}

	const searchCriteria: any = {
		$and: [
			{ isDeleted: { $ne: true } },
			{
				$or: [{ name: { $regex: query, $options: 'i' } }, { 'metadata.tags': { $regex: query, $options: 'i' } }]
			}
		]
	};
	// Add metadata search criteria
	if (metadata) {
		Object.entries(metadata).forEach(([key, value]) => {
			searchCriteria.$and.push({ [`metadata.${key}`]: value });
		});
	}

	return await dbAdapter.findMany(collection, searchCriteria);
}

// Invalidates the cache for a specific media item
export async function invalidateMediaCache(id: string): Promise<void> {
	await clearCache(`media:${id}`);
	logger.info(`Cache invalidated for media: ${id}`);
}

// Prefetches a media item to cache
export async function prefetchMediaToCache(id: string, collection: string): Promise<void> {
	if (!dbAdapter) {
		logger.warn('Database adapter is not initialized');
		return;
	}
	const media = await dbAdapter.findOne(collection, { _id: id });
	if (media) {
		await setCache(`media:${id}`, media, 3600); // Cache for 1 hour
		logger.info(`Media prefetched to cache: ${id}`);
	} else {
		logger.warn(`Failed to prefetch media to cache: ${id} - not found`);
	}
}

// Constructs a URL for a media item
export function constructMediaUrl(mediaItem: MediaBase, size?: keyof typeof SIZES): string {
	if (publicEnv.MEDIASERVER_URL) {
		return `${publicEnv.MEDIASERVER_URL}/${mediaItem.url}`;
	} else {
		const basePath = path.join(publicEnv.MEDIA_FOLDER, mediaItem.url);
		if (size && 'thumbnails' in mediaItem && mediaItem.thumbnails && mediaItem.thumbnails[size]) {
			return mediaItem.thumbnails[size].url;
		}
		return basePath;
	}
}

// Validates a media file
export function validateMediaFile(file: File, allowedTypes: string[]): { isValid: boolean; message: string } {
	const fileType = mime.lookup(file.name);
	if (!fileType || !allowedTypes.includes(fileType)) {
		return {
			isValid: false,
			message: `Invalid file type. Allowed types are: ${allowedTypes.join(', ')}`
		};
	}

	const maxFileSize = publicEnv.MAX_FILE_SIZE !== undefined ? publicEnv.MAX_FILE_SIZE : DEFAULT_MAX_FILE_SIZE;

	if (file.size > maxFileSize) {
		return {
			isValid: false,
			message: `File size exceeds the limit of ${publicEnv.MAX_FILE_SIZE} bytes`
		};
	}
	return { isValid: true, message: 'File is valid' };
}

export default {
	// Save operations
	saveMedia,
	saveImage,
	saveDocument,
	saveVideo,
	saveAudio,
	saveRemoteMedia,
	saveAvatarImage,

	// Delete and restore operations
	deleteMedia,
	bulkDeleteMedia,
	moveMediaToTrash,
	cleanupTrashedMedia,
	softDeleteMedia,
	restoreMedia,

	// Update operations
	updateMediaMetadata,
	updateMediaInfo,
	updateMediaVersion,

	// Search and retrieve operations
	listMedia,
	searchMedia,
	getMediaById,

	// Access control and security
	generateSignedUrl,
	setMediaAccess,
	checkMediaAccess,

	// Caching operations (if you want to expose these)
	invalidateMediaCache,
	prefetchMediaToCache,

	// Utility functions
	constructMediaUrl,
	validateMediaFile
};
