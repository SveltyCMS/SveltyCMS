/**
 * @file utils/media/mediaStorage.ts
 * @description Handles storage operations for media files in the CMS.
 */

import { publicEnv } from '@root/config/public';

import fs from 'fs';
import Path from 'path';
import mime from 'mime-types';
import crypto from 'crypto';
import type sharp from 'sharp';

// Media
import type { MediaBase, MediaRemoteVideo, MediaAccess } from './mediaModels';
import { MediaTypeEnum } from './mediaModels';

import { hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { constructUrl } from './mediaUtils';
import { sanitize } from '@src/utils/utils';

// Auth
import { dbAdapter } from '@src/databases/db';
import type { Role } from '@src/auth/types';

// System Logger
import logger from '@src/utils/logger';

// Default max file size (100MB) if not specified in publicEnv
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB in bytes

// Image sizes
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

// Saves a file to local disk or cloud storage.
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
			type: MediaTypeEnum.RemoteVideo, // Correct enum assignment
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
				// Include user-specific permissions
				{ userId: user_id, permissions: ['read', 'write', 'delete'] },

				// Include any existing access permissions passed into the function
				...access,

				// Map role-based permissions
				...roles.flatMap((role) =>
					role.permissions.map((permissionId) => ({
						roleId: role._id,
						permissions: [permissionId] // Mapping each permission ID to the role
					}))
				)
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

		const id = await dbAdapter.insertOne('media_remote_videos', fileInfo);

		await setCache(`media:${id}`, fileInfo, 3600); // Cache for 1 hour

		logger.info('Remote media saved to database', { collectionName, fileInfo });
		return { id, fileInfo };
	} catch (error) {
		logger.error('Error saving remote media:', error as Error);
		throw error;
	}
}

// Saves resized versions of an image to disk or cloud storage.
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

// Cleans up old files from the trash directory.
export async function cleanupTrashedMedia(daysOld: number = 30): Promise<void> {
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

// Gets all file paths for a media item
export function getMediaFilePaths(mediaItem: MediaBase): string[] {
	const paths: string[] = [Path.join(publicEnv.MEDIA_FOLDER, mediaItem.url)];

	if ('thumbnails' in mediaItem && mediaItem.thumbnails) {
		for (const thumbnail of Object.values(mediaItem.thumbnails)) {
			paths.push(Path.join(publicEnv.MEDIA_FOLDER, thumbnail.url));
		}
	}

	return paths;
}
