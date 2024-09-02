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

import { privateEnv } from '@root/config/private';
import { publicEnv } from '@root/config/public';
import fs from 'fs';
import Path from 'path';
import { browser } from '$app/environment';
import { sha256, removeExtension, sanitize } from '@src/utils/utils';
import mime from 'mime-types';
import crypto from 'crypto';

import type sharp from 'sharp';

// Auth
import { dbAdapter } from '@src/databases/db';
import type { Role } from '@src/auth/types';

// Redis
import { getCache, setCache, clearCache } from '@src/databases/redis';

// System Logger
import logger from '@src/utils/logger';

// Default max file size (100MB) if not specified in publicEnv
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

// Define media types
interface MediaVersion {
	version: number;
	url: string;
	createdAt: number; // Unix timestamp
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
	path: string;
	url: string;
	type: string;
	size: number;
	user: string;
	createdAt: number; // Unix timestamp
	updatedAt: number; // Unix timestamp
	metadata?: Record<string, any>;
	isDeleted?: boolean;
	deletedAt?: number; // Unix timestamp
	versions: MediaVersion[];
	access: MediaAccess[];
}

interface MediaImage extends MediaBase {
	name: string;
	width: number;
	height: number;
	thumbnails: Record<string, { url: string; width: number; height: number }>;
}

interface MediaDocument extends MediaBase {
	pageCount?: number;
}

interface MediaAudio extends MediaBase {
	duration?: number;
}

interface MediaVideo extends MediaBase {
	duration?: number;
	thumbnailUrl?: string;
}

interface MediaRemoteVideo extends MediaBase {
	provider: string;
	externalId: string;
}

type MediaType = MediaImage | MediaDocument | MediaAudio | MediaVideo | MediaRemoteVideo;

const SIZES = { ...publicEnv.IMAGE_SIZES, original: 0, thumbnail: 200 } as const;

/**
 * Media File Handling Functions
 */

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
		logger.error('AWS SDK is not installed. S3 functionality will not be available.', error as Error);
		return null;
	}
}

// Saves a file to local disk or cloud storage.
async function saveFileToDisk(buffer: Buffer, url: string): Promise<void> {
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
			throw new Error('S3 client is not available. Unable to save file to cloud storage.');
		}
	} else {
		// Save to local storage
		const fullPath = Path.join(publicEnv.MEDIA_FOLDER, url);
		const dir = Path.dirname(fullPath);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		await fs.promises.writeFile(fullPath, buffer);
	}
	logger.info('File saved', { url });
}

// Saves resized versions of an image to disk or cloud storage.
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

// Cleans up old files from the trash directory.
async function cleanupTrashedMedia(daysOld: number = 30): Promise<void> {
	const trashFolder = Path.join(publicEnv.MEDIA_FOLDER, 'trash');
	const now = Math.floor(Date.now() / 1000); // Unix timestamp

	try {
		const collections = await fs.promises.readdir(trashFolder);
		for (const collection of collections) {
			const collectionPath = Path.join(trashFolder, collection);
			const files = await fs.promises.readdir(collectionPath);

			for (const file of files) {
				const filePath = Path.join(collectionPath, file);
				const stats = await fs.promises.stat(filePath);

				const daysInTrash = (now - Math.floor(stats.mtime.getTime() / 1000)) / (60 * 60 * 24);

				if (daysInTrash > daysOld) {
					await fs.promises.unlink(filePath);
					logger.info(`Deleted old trashed file: ${filePath}`);
				}
			}
		}

		// Clean up database records
		if (dbAdapter) {
			const cutoffDate = now - daysOld * 24 * 60 * 60; // Unix timestamp
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

// Saves an avatar image to disk and database.
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
			const sharp = (await import('sharp')).default;

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

// Moves media to the trash directory.
export async function moveMediaToTrash(id: string, collection: string): Promise<void> {
	try {
		const mediaItem = await getMediaById(id, collection);
		if (!mediaItem) {
			throw new Error('Media not found');
		}

		const trashFolder = Path.join(publicEnv.MEDIA_FOLDER, 'trash', collection);

		// Create trash folder if it doesn't exist
		await new Promise<void>((resolve, reject) => {
			fs.mkdir(trashFolder, { recursive: true }, (err) => {
				if (err && err.code !== 'EEXIST') reject(err);
				else resolve();
			});
		});

		const filePaths = await getMediaFilePaths(mediaItem);

		for (const filePath of filePaths) {
			const fileName = Path.basename(filePath);
			const trashPath = Path.join(trashFolder, fileName);
			await new Promise<void>((resolve, reject) => {
				fs.rename(filePath, trashPath, (err) => {
					if (err) reject(err);
					else resolve();
				});
			});
		}

		// Update database record to mark as trashed
		if (dbAdapter) {
			await dbAdapter.updateOne(collection, { _id: id }, { $set: { trashed: true, trashedAt: Math.floor(Date.now() / 1000) } });
		} else {
			logger.warn('dbAdapter is not available. Database not updated for trashed media.');
		}

		logger.info(`Moved media to trash: ${id}`, { collection });
	} catch (error) {
		logger.error('Error moving media to trash:', error as Error);
		throw error;
	}
}

/**
 * Media Database Operations
 */

// Saves media information to the database.
async function saveMediaToDb(collection: string, fileInfo: MediaType): Promise<string> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const result = await dbAdapter.insertMany(collection, [fileInfo]);
	return result[0]._id.toString();
}

// Retrieves a media item from the database by its ID.
export async function getMediaById(id: string, collection: string): Promise<MediaType | null> {
	const cachedMedia = await getCache<MediaType>(`media:${id}`);
	if (cachedMedia) {
		return cachedMedia;
	}

	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const media = await dbAdapter.findOne(collection, { _id: id });

	if (media) {
		await setCache(`media:${id}`, media, 3600); // Cache for 1 hour
	}

	return media;
}

// Deletes a media item from the disk and database.
export async function deleteMedia(id: string, collection: string): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	const media = await getMediaById(id, collection);
	if (!media) {
		throw new Error('Media not found');
	}

	const fullPath = `${publicEnv.MEDIA_FOLDER}/${media.url}`;
	await fs.promises.unlink(fullPath);

	if ('thumbnails' in media) {
		for (const thumbnail of Object.values(media.thumbnails)) {
			await fs.promises.unlink(`${publicEnv.MEDIA_FOLDER}/${thumbnail.url}`);
		}
	}

	await dbAdapter.deleteOne(collection, { _id: id });
	logger.info('Media deleted', { id, collection });
}

// Updates a media item by adding a new version to it.
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
		Path.extname(media.name),
		collection
	);

	await saveFileToDisk(newBuffer, newUrl);

	const newVersionInfo: MediaVersion = {
		version: newVersion,
		url: newUrl,
		createdAt: Math.floor(Date.now() / 1000), // Unix timestamp
		createdBy: user_id
	};

	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}

	await dbAdapter.updateOne(collection, { _id: id }, { $push: { versions: newVersionInfo }, $set: { updatedAt: Math.floor(Date.now() / 1000) } });

	await clearCache(`media:${id}`);

	logger.info('Media version updated', { id, collection, version: newVersion });
}

// Soft deletes a media item in the database.
export async function softDeleteMedia(id: string, collection: string): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateOne(collection, { _id: id }, { $set: { isDeleted: true, deletedAt: Math.floor(Date.now() / 1000) } });
	logger.info('Media soft deleted', { id, collection });
}

// Restores a soft-deleted media item in the database.
export async function restoreMedia(id: string, collection: string): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateOne(
		collection,
		{ _id: id },
		{ $unset: { isDeleted: '', deletedAt: '' }, $set: { updatedAt: Math.floor(Date.now() / 1000) } }
	);
	logger.info('Media restored', { id, collection });
}

// Updates metadata of a media item in the database.
export async function updateMediaMetadata(id: string, collection: string, metadata: Record<string, any>): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateOne(collection, { _id: id }, { $set: { metadata, updatedAt: Math.floor(Date.now() / 1000) } });
	logger.info('Media metadata updated', { id, collection, metadata });
}

// Updates basic information of a media item in the database.
export async function updateMediaInfo(id: string, collection: string, updates: Partial<MediaBase>): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateOne(collection, { _id: id }, { $set: { ...updates, updatedAt: Math.floor(Date.now() / 1000) } });
	logger.info('Media info updated', { id, collection, updates });
}

/**
 * Media Access Control Functions
 */

// Sets access permissions for a media item.
export async function setMediaAccess(id: string, collection: string, userId: string, permissions: ('read' | 'write' | 'delete')[]): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}

	await dbAdapter.updateOne(
		collection,
		{ _id: id },
		{ $push: { access: { userId, permissions } }, $set: { updatedAt: Math.floor(Date.now() / 1000) } }
	);

	await clearCache(`media:${id}`);

	logger.info('Media access updated', { id, collection, userId, permissions });
}

// Checks if a user has the required access to a media item.
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

	const userAccess = media.access.find((access) => access.userId === userId);
	if (userAccess && userAccess.permissions.includes(requiredPermission)) {
		return true;
	}

	for (const roleId of userRoles) {
		const roleAccess = media.access.find((access) => access.roleId === roleId);
		if (roleAccess && roleAccess.permissions.includes(requiredPermission)) {
			return true;
		}
	}

	return false;
}

// Generates a signed URL for accessing a media item.
export async function generateSignedUrl(id: string, collection: string, expiresIn: number = 3600): Promise<string> {
	const media = await getMediaById(id, collection);
	if (!media) {
		throw new Error('Media not found');
	}

	const timestamp = Math.floor(Date.now() / 1000) + expiresIn;
	const signature = await sha256(Buffer.from(`${id}:${timestamp}:${privateEnv.JWT_SECRET_KEY}`));
	return `${media.url}?signature=${signature}&expires=${timestamp}`;
}

/**
 * Media Processing Functions
 */

// Saves media to disk and database, handles different media types.
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

		const existingFile = await dbAdapter.findOne(mediaCollection, { hash });
		if (existingFile) {
			logger.info('File already exists in the database', { fileId: existingFile._id, mediaCollection });
			return { id: existingFile._id, fileInfo: existingFile as MediaType };
		}

		const fileInfo: MediaBase = {
			hash,
			name: file.name,
			url,
			path: pathValue,
			type: file.type,
			size: file.size,
			user: user_id,
			createdAt: Math.floor(Date.now() / 1000), // Unix timestamp
			updatedAt: Math.floor(Date.now() / 1000), // Unix timestamp
			metadata,
			versions: [
				{
					version: 1,
					url,
					createdAt: Math.floor(Date.now() / 1000), // Unix timestamp
					createdBy: user_id
				}
			],
			access: [
				{ userId: user_id, permissions: ['read', 'write', 'delete'] },
				...access,
				...roles.map((role) => ({ roleId: role._id, permissions: ['read'] as ('read' | 'write' | 'delete')[] }))
			]
		};

		await saveFileToDisk(buffer, url);

		if (handleResizing && !file.type.includes('svg')) {
			const thumbnails = await saveResizedImages(buffer, hash, fileNameWithoutExt, collectionName, ext, pathValue);
			(fileInfo as MediaImage).thumbnails = thumbnails;
			(fileInfo as MediaImage).width = metadata.width || 0;
			(fileInfo as MediaImage).height = metadata.height || 0;
		}

		logger.info(`Saving media to db: ${mediaCollection}`, { fileInfo });
		const id = await saveMediaToDb(mediaCollection, fileInfo as MediaType);

		await setCache(`media:${id}`, fileInfo, 3600); // Cache for 1 hour

		return { id, fileInfo: fileInfo as MediaType };
	} catch (error) {
		logger.error('Error saving media:', error as Error);
		throw error;
	}
}

// Saves an image to disk and database.
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

// Saves a document to disk and database.
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

// Saves a video to disk and database.
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

// Saves an audio file to disk and database.
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

// Saves a remote media file to the database.
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
			path: 'remote_media',
			url,
			type: response.headers.get('content-type') || 'unknown',
			size: parseInt(response.headers.get('content-length') || '0'),
			user: user_id,
			createdAt: Math.floor(Date.now() / 1000), // Unix timestamp
			updatedAt: Math.floor(Date.now() / 1000), // Unix timestamp
			provider: new URL(fileUrl).hostname,
			externalId: fileUrl,
			versions: [
				{
					version: 1,
					url,
					createdAt: Math.floor(Date.now() / 1000), // Unix timestamp
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

		const existingFile = await dbAdapter.findOne('media_remote_videos', { hash });
		if (existingFile) {
			logger.info('Remote file already exists in the database', { fileId: existingFile._id, collection: 'media_remote_videos' });
			return { id: existingFile._id, fileInfo: existingFile as MediaRemoteVideo };
		}

		const id = await saveMediaToDb('media_remote_videos', fileInfo);

		await setCache(`media:${id}`, fileInfo, 3600); // Cache for 1 hour

		logger.info('Remote media saved to database', { collectionName, fileInfo });
		return { id, fileInfo };
	} catch (error) {
		logger.error('Error saving remote media:', error as Error);
		throw error;
	}
}

/**
 * Utility Functions
 */

// Hashes the content of a file.
async function hashFileContent(buffer: Buffer): Promise<string> {
	return (await sha256(buffer)).slice(0, 20);
}

// Sanitizes the filename by removing unsafe characters.
function getSanitizedFileName(fileName: string): { fileNameWithoutExt: string; ext: string } {
	const { name, ext } = removeExtension(fileName);
	return { fileNameWithoutExt: sanitize(name), ext };
}

// Constructs a URL for a media item based on its path and type.
function constructUrl(pathType: string, hash: string, fileName: string, ext: string, collectionName: string, size?: keyof typeof SIZES): string {
	let url: string;
	switch (pathType) {
		case 'global':
			url = `/original/${hash}-${fileName}${size ? `-${size}` : ''}.${ext}`;
			break;
		case 'unique':
			url = `/${collectionName}/original/${hash}-${fileName}${size ? `-${size}` : ''}.${ext}`;
			break;
		default:
			url = `/${pathType}/original/${hash}-${fileName}${size ? `-${size}` : ''}.${ext}`;
	}

	if (publicEnv.MEDIASERVER_URL) {
		return `${publicEnv.MEDIASERVER_URL}/files/${url}`;
	} else {
		return Path.join(publicEnv.MEDIA_FOLDER, url);
	}
}

// Export the function so it can be used elsewhere
export { constructUrl };

// Returns the URL for accessing a media item.
export function getMediaUrl(mediaItem: MediaBase, collectionName: string, size?: keyof typeof SIZES): string {
	return constructUrl(mediaItem.path, mediaItem.hash, mediaItem.name, Path.extname(mediaItem.name).slice(1), collectionName, size);
}

// Constructs the full media URL based on the environment.
export function constructMediaUrl(mediaItem: MediaBase, size?: keyof typeof SIZES): string {
	if (publicEnv.MEDIASERVER_URL) {
		return `${publicEnv.MEDIASERVER_URL}/${mediaItem.url}`;
	} else {
		const basePath = Path.join(publicEnv.MEDIA_FOLDER, mediaItem.url);
		if (size && 'thumbnails' in mediaItem && mediaItem.thumbnails && mediaItem.thumbnails[size]) {
			return mediaItem.thumbnails[size].url;
		}
		return basePath;
	}
}

// Extracts metadata from a file, such as size, format, and dimensions.
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
		// Estimate video duration by checking file size and a rough bitrate
		metadata.duration = Math.floor(buffer.length / (1000 * 500)); // Assuming a rough bitrate of 500 kbps
	} else if (fileType && fileType.startsWith('audio/')) {
		// Estimate audio duration by checking file size and a rough bitrate
		metadata.duration = Math.floor(buffer.length / (1000 * 128)); // Assuming a rough bitrate of 128 kbps
	} else if (fileType && fileType.startsWith('application/')) {
		if (fileType === 'application/pdf') {
			// Basic PDF metadata (assume 1 page if unknown)
			metadata.pageCount = 1;
		} else if (fileType.includes('word')) {
			// Basic Word document metadata (assume 1 page if unknown)
			metadata.pageCount = 1;
		}
	}

	// Add common metadata
	metadata.size = buffer.length;
	metadata.mimeType = fileType || 'application/octet-stream';
	metadata.lastModified = Math.floor(Date.now() / 1000); // Unix timestamp

	return metadata;
}

// Gets all file paths for a media item.
async function getMediaFilePaths(mediaItem: MediaType): Promise<string[]> {
	const paths = [Path.join(publicEnv.MEDIA_FOLDER, mediaItem.url)];

	if ('thumbnails' in mediaItem) {
		for (const thumbnail of Object.values(mediaItem.thumbnails)) {
			paths.push(Path.join(publicEnv.MEDIA_FOLDER, thumbnail.url));
		}
	}

	return paths;
}

// Invalidates the cache for a specific media item.
export async function invalidateMediaCache(id: string): Promise<void> {
	await clearCache(`media:${id}`);
	logger.info(`Cache invalidated for media: ${id}`);
}

// Prefetches a media item to cache.
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

/**
 * Search and List Media Functions
 */

// Searches for media items in the database based on a query.
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
	if (metadata) {
		Object.entries(metadata).forEach(([key, value]) => {
			searchCriteria.$and.push({ [`metadata.${key}`]: value });
		});
	}

	return await dbAdapter.findMany(collection, searchCriteria);
}

// Lists media items in the database with pagination.
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

// Bulk deletes media items by soft deleting them in the database.
export async function bulkDeleteMedia(ids: string[], collection: string): Promise<void> {
	if (!dbAdapter) {
		throw new Error('Database adapter is not initialized');
	}
	await dbAdapter.updateMany(collection, { _id: { $in: ids } }, { $set: { isDeleted: true, deletedAt: Math.floor(Date.now() / 1000) } });
	logger.info('Bulk media soft deleted', { ids, collection });
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
	updateMediaVersion,
	updateMediaMetadata,
	updateMediaInfo,

	// Search and retrieve operations
	listMedia,
	searchMedia,
	getMediaById,

	// Access control and security
	generateSignedUrl,
	setMediaAccess,
	checkMediaAccess,

	// Caching operations
	invalidateMediaCache,
	prefetchMediaToCache,

	// Utility functions
	getMediaUrl,
	constructMediaUrl,
	validateMediaFile: (file: File, allowedTypes: string[]): { isValid: boolean; message: string } => {
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
};
