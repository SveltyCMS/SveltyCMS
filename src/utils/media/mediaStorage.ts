/**
 * @file src/utils/media/mediaStorage.ts
 * @description Core media storage functionality for the CMS.
 * This module handles all file system operations and media processing.
 */

import { publicEnv } from '@root/config/public';
import { error } from '@sveltejs/kit';
import Path from 'path';
import mime from 'mime-types';
import crypto from 'crypto';
import Sharp from 'sharp';
import { setCache } from '@root/src/databases/redis';
import type { MediaRemoteVideo, MediaAccess, MediaImage, ResizedImage } from './mediaModels';
import { MediaTypeEnum, Permission } from './mediaModels';
import { hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { constructUrl } from './mediaUtils';
import { sanitize } from '@utils/utils';
import { dbAdapter } from '@src/databases/db';

// System Logger
import { logger } from '@utils/logger.svelte';

// Image sizes configuration
type ImageSizesType = typeof publicEnv.IMAGE_SIZES & {
	original: 0;
	thumbnail: 200;
};

const SIZES: ImageSizesType = {
	...publicEnv.IMAGE_SIZES,
	original: 0,
	thumbnail: 200
} as const;

// Get fs instance for server-side operations
async function getFs() {
	if (!import.meta.env.SSR) {
		throw error(500, 'File operations can only be performed on the server');
	}
	const { default: fs } = await import('fs');
	return fs;
}

/**
 * Resizes an image using Sharp
 */
export async function resizeImage(buffer: Buffer, width: number, height?: number): Promise<Sharp.Sharp> {
	if (!import.meta.env.SSR) {
		throw error(500, 'File operations can only be performed on the server');
	}
	return Sharp(buffer).resize(width, height, {
		fit: 'cover',
		position: 'center'
	});
}

/**
 * Saves a file to disk
 */
export async function saveFileToDisk(buffer: Buffer, url: string): Promise<void> {
	try {
		const fs = await getFs();
		const fullPath = Path.join(publicEnv.MEDIA_FOLDER, url);
		const dir = Path.dirname(fullPath);

		logger.debug('Creating directory for file', {
			directory: dir,
			url,
			bufferSize: buffer.length
		});

		await fs.promises.mkdir(dir, { recursive: true });

		logger.debug('Writing file to disk', {
			fullPath,
			fileSize: buffer.length,
			url
		});

		await fs.promises.writeFile(fullPath, buffer);

		logger.info('File saved to disk', {
			url,
			fullPath,
			fileSize: buffer.length,
			directoryCreated: dir
		});
	} catch (err) {
		const message = `Failed to save file to disk: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, {
			url,
			error: err,
			bufferSize: buffer?.length
		});
		throw new Error(message);
	}
}

/**
 * Saves resized versions of an image
 */
export async function saveResizedImages(
	buffer: Buffer,
	hash: string,
	fileName: string,
	contentTypes: string,
	ext: string,
	basePath: string
): Promise<Record<string, ResizedImage>> {
	const resizedImages: Record<string, ResizedImage> = {};

	logger.debug('Starting image resizing', {
		fileName,
		hash,
		basePath,
		originalSize: buffer.length,
		sizes: Object.entries(SIZES).map(([name, width]) => `${name}:${width}px`)
	});

	for (const [size, width] of Object.entries(SIZES)) {
		if (width === 0) continue; // Skip original size

		try {
			logger.debug('Resizing image', { size, width });
			let resizedBuffer = await resizeImage(buffer, width);

			// Apply format conversion if configured
			if (publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format !== 'original') {
				resizedBuffer = resizedBuffer.toFormat(
					publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format as 'avif' | 'webp',
					{
						quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality,
						lossless: false
					}
				);
			}

			// Use correct extension based on output format
			const outputExt = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original'
				? ext
				: `.${publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format}`;

			const resizedUrl = Path.posix.join(basePath, size, `${fileName}-${hash}${outputExt}`);

			logger.debug('Saving resized image', {
				size,
				url: resizedUrl,
				width,
				format: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format,
				quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality
			});

			try {
				await saveFileToDisk(await resizedBuffer.toBuffer(), resizedUrl);
			} catch (err) {
				logger.error(`Failed to save ${publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format} image`, {
					error: err instanceof Error ? err.message : String(err),
					size,
					width,
					format: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format
				});
				throw err;
			}

			resizedImages[size] = {
				url: resizedUrl,
				width,
				height: width,
				size: (await resizedBuffer.metadata()).size || 0
			};

			logger.debug('Resized image saved', {
				size,
				url: resizedUrl,
				dimensions: `${width}x${width}`
			});
		} catch (err) {
			logger.error(`Failed to process size ${size}`, {
				error: err instanceof Error ? err.message : String(err),
				fileName,
				size,
				width
			});
			// Continue with other sizes even if one fails
		}
	}

	logger.info('Image resizing completed', {
		fileName,
		successfulSizes: Object.keys(resizedImages),
		failedSizes: Object.keys(SIZES).filter(s => s !== 'original' && !resizedImages[s])
	});

	return resizedImages;
}

/**
 * Deletes a file from storage
 */
export async function deleteFile(url: string): Promise<void> {
	const startTime = performance.now();

	try {
		const fs = await getFs();
		const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);

		logger.debug('Deleting file', {
			url,
			filePath
		});

		await fs.promises.unlink(filePath);

		logger.info('File deleted from disk', {
			url,
			filePath,
			processingTime: performance.now() - startTime
		});
	} catch (err) {
		const message = `Error deleting file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, {
			url,
			error: err,
			stack: new Error().stack,
			processingTime: performance.now() - startTime
		});
		throw new Error(message);
	}
}

/**
 * Retrieves a file from storage
 */
export async function getFile(url: string): Promise<Buffer> {
	const fs = await getFs();
	const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
	const buffer = await fs.promises.readFile(filePath);
	logger.info('File retrieved from disk', { url });
	return buffer;
}

/**
 * Checks if a file exists in storage
 */
export async function fileExists(url: string): Promise<boolean> {
	const fs = await getFs();
	const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
	try {
		await fs.promises.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Moves a file to trash
 */
export async function moveMediaToTrash(url: string): Promise<void> {
	const fs = await getFs();
	const sourcePath = Path.join(publicEnv.MEDIA_FOLDER, url);
	const trashPath = Path.join(publicEnv.MEDIA_FOLDER, '.trash', Path.basename(url));

	// Create trash directory if it doesn't exist
	await fs.promises.mkdir(Path.dirname(trashPath), { recursive: true });

	// Move file to trash
	await fs.promises.rename(sourcePath, trashPath);
	logger.info('File moved to trash', { originalUrl: url, trashUrl: trashPath });
}

/**
 * Cleans up media directory
 */
export async function cleanMediaDirectory(): Promise<void> {
	// Implementation for cleaning up unused files
	logger.info('Media directory cleanup completed');
}

/**
 * Saves a remote media file to the database
 */
export async function saveRemoteMedia(fileUrl: string, contentTypes: string, user_id: string): Promise<{ id: string; fileInfo: MediaRemoteVideo }> {
	try {
		// Fetch the media file from the provided URL
		const response = await fetch(fileUrl);
		if (!response.ok) throw new Error(`Failed to fetch file: ${response.statusText}`);

		// Get buffer from fetched response
		const arrayBuffer = await response.arrayBuffer();
		const hash = await hashFileContent(arrayBuffer); // Use arrayBuffer directly for hashing

		// Extract and sanitize the file name
		const fileName = decodeURI(fileUrl.split('/').pop() ?? 'defaultName');
		const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
		const url = constructUrl('remote_media', `${hash}-${fileNameWithoutExt}.${ext}`);

		// Create user access entry with all permissions
		const userAccess: MediaAccess = {
			userId: user_id,
			permissions: [Permission.Read, Permission.Write, Permission.Delete]
		};

		// Construct file info object for the remote video
		const fileInfo: MediaRemoteVideo = {
			hash,
			name: fileName,
			path: 'remote_media',
			url,
			type: MediaTypeEnum.RemoteVideo,
			size: parseInt(response.headers.get('content-length') || '0', 10),
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
			access: userAccess,
			mimeType: mime.lookup(url) || 'application/octet-stream'
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

		logger.info('Remote media saved to database', { contentTypes, fileInfo });
		return { id, fileInfo };
	} catch (error) {
		logger.error('Error saving remote media:', error instanceof Error ? error : new Error(String(error)));
		throw error;
	}
}

/**
 * Saves an avatar image to disk and database
 */
export async function saveAvatarImage(file: File): Promise<string> {
	try {
		// Validate file
		if (!file) {
			throw new Error('No file provided');
		}

		// Ensure database is initialized
		if (!dbAdapter) {
			throw new Error('Database adapter not initialized');
		}

		// Create avatars directory if it doesn't exist
		const fs = await getFs();
		const avatarsPath = Path.join(process.cwd(), 'static', 'avatars');
		if (!fs.existsSync(avatarsPath)) {
			await fs.promises.mkdir(avatarsPath, { recursive: true });
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);

		const existingFile = dbAdapter ? await dbAdapter.crud.findOne('media_images', { hash }) : null;

		if (existingFile) {
			let fileUrl = existingFile.thumbnail?.url;
			if (publicEnv.MEDIASERVER_URL) {
				fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
			} else {
				fileUrl = `${publicEnv.MEDIA_FOLDER}/${fileUrl}`;
			}
			return fileUrl;
		}

		const { fileNameWithoutExt } = getSanitizedFileName(file.name);
		const sanitizedBlobName = sanitize(fileNameWithoutExt);

		// For avatars, we only create one AVIF thumbnail
		const resizedImage = await resizeImage(buffer, SIZES.thumbnail);

		const thumbnailUrl = constructUrl('avatars', `${hash}-${sanitizedBlobName}thumbnail.avif`);
		await saveFileToDisk(await resizedImage.toBuffer(), thumbnailUrl);

		const thumbnail = {
			url: thumbnailUrl,
			width: (await resizedImage.metadata()).width,
			height: (await resizedImage.metadata()).height
		};

		const fileInfo: MediaImage = {
			hash,
			filename: file.name,
			path: 'avatars/original',
			url: thumbnailUrl,
			type: MediaTypeEnum.Image,
			size: buffer.length,
			mimeType: 'image/avif',
			createdAt: new Date(Date.now()),
			updatedAt: new Date(Date.now()),
			versions: [
				{
					version: 1,
					url: thumbnailUrl,
					createdAt: new Date(Date.now()),
					createdBy: 'system'
				}
			],
			thumbnail,
			thumbnails: {
				sm: thumbnail,
				md: thumbnail,
				lg: thumbnail
			},
			width: resizedImage.width,
			height: resizedImage.height,
			user: 'system',
			access: {
				permissions: [Permission.Read, Permission.Write]
			}
		};

		logger.info('Image saved to database', { fileInfo });

		if (!dbAdapter) throw Error('Database adapter not initialized.');

		await dbAdapter.media.files.upload({ _id: dbAdapter.utils.generateId(), ...fileInfo });

		// Return the thumbnail URL for avatar usage
		let fileUrl = thumbnailUrl;
		if (publicEnv.MEDIASERVER_URL) {
			fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
		} else {
			fileUrl = `${publicEnv.MEDIA_FOLDER}/${fileUrl}`;
		}

		return fileUrl;
	} catch (err) {
		const error = err instanceof Error ? err : new Error('Unknown error occurred');
		logger.error('Error saving avatar image:', {
			error: error.message,
			stack: error.stack,
			fileName: file?.name,
			fileSize: file?.size
		});
		throw error;
	}
}
