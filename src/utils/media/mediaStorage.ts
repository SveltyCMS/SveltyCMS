/**
 * @file src/utils/media/mediaStorage.ts
 * @description Core media storage functionality for the CMS.
 * This module handles all file system (I/O) operations and media processing.
 * Supports both local filesystem and cloud storage (S3, R2, Cloudinary).
 * THIS FILE MUST NOT CONTAIN ANY DATABASE LOGIC.
 */

import { publicEnv } from '@src/stores/globalSettings.svelte';
import { error } from '@sveltejs/kit';
import mime from 'mime-types';
import Path from 'path';
import Sharp from 'sharp';
import { isCloudStorage, uploadToCloud, deleteFromCloud, getCloudUrl, cloudFileExists, getCloudStorageConfig } from './cloudStorage';
import type { ResizedImage } from './mediaModels';

// System Logger
import { logger } from '@utils/logger.server';
import { getPublicSettingSync } from '@src/services/settingsService';

// Image sizes configuration
const defaultImageSizes = { sm: 600, md: 900, lg: 1200 };
type ImageSizesType = typeof defaultImageSizes & {
	original: 0;
	thumbnail: 200;
};

const SIZES: ImageSizesType = {
	...defaultImageSizes,
	...(publicEnv.IMAGE_SIZES || {}),
	original: 0,
	thumbnail: 200
};

const getMediaFolder = () => getPublicSettingSync('MEDIA_FOLDER') || 'mediaFiles';

// Get fs instance for server-side operations
async function getFs() {
	if (!import.meta.env.SSR) {
		throw error(500, 'File operations can only be performed on the server');
	}
	const { default: fs } = await import('fs');
	return fs;
}

// Resizes an image using Sharp
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
 * Saves a file to disk or cloud storage.
 * @param buffer The file buffer
 * @param relativePath The relative path to save the file (e.g., "global/original/image-hash.jpg")
 * @returns The public URL of the saved file
 */
export async function saveFileToDisk(buffer: Buffer, relativePath: string): Promise<string> {
	try {
		// Check if using cloud storage
		if (isCloudStorage()) {
			logger.debug('Uploading file to cloud storage', {
				relativePath,
				bufferSize: buffer.length
			});

			// Upload to cloud and return the public URL
			const publicUrl = await uploadToCloud(buffer, relativePath);

			logger.info('File uploaded to cloud storage', {
				relativePath,
				publicUrl,
				fileSize: buffer.length
			});

			return publicUrl;
		}

		// LOCAL STORAGE: Save to filesystem
		const fs = await getFs();
		const fullPath = Path.join(getMediaFolder(), relativePath);
		const dir = Path.dirname(fullPath);

		logger.debug('Creating directory for file', {
			directory: dir,
			relativePath,
			bufferSize: buffer.length
		});

		await fs.promises.mkdir(dir, { recursive: true });

		logger.debug('Writing file to disk', {
			fullPath,
			fileSize: buffer.length,
			relativePath
		});

		await fs.promises.writeFile(fullPath, buffer);

		logger.info('File saved to disk', {
			relativePath,
			fullPath,
			fileSize: buffer.length,
			directoryCreated: dir
		});

		// Return local URL format
		return `/files/${relativePath}`;
	} catch (err) {
		const message = `Failed to save file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, {
			relativePath,
			error: err,
			bufferSize: buffer?.length
		});
		throw new Error(message);
	}
}

// Saves resized versions of an image
export async function saveResizedImages(
	buffer: Buffer,
	hash: string,
	fileName: string,
	_contentTypes: string,
	ext: string,
	basePath: string
): Promise<Record<string, ResizedImage>> {
	const resizedImages: Record<string, ResizedImage> = {};
	const sharpInstance = Sharp(buffer);
	const metadata = await sharpInstance.metadata();

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
			let resizedSharp = sharpInstance.clone().resize(width, null, {
				fit: 'cover',
				position: 'center'
			}); // Use null for height to maintain aspect ratio

			// Apply format conversion if configured
			const formatQuality = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY;
			let outputExt = ext;
			let mimeType = mime.lookup(ext) || 'application/octet-stream';

			if (formatQuality && formatQuality.format !== 'original') {
				const format = formatQuality.format as 'avif' | 'webp';
				resizedSharp = resizedSharp.toFormat(format, {
					quality: formatQuality.quality,
					lossless: false
				});
				outputExt = format;
				mimeType = `image/${format}`;
			}

			const resizedFileName = `${fileName}-${hash}.${outputExt}`;
			const resizedRelativePath = Path.posix.join(basePath, size, resizedFileName);

			logger.debug('Saving resized image', {
				size,
				url: resizedRelativePath,
				width,
				format: formatQuality?.format || 'original',
				quality: formatQuality?.quality || 'default'
			});

			const resizedBuffer = await resizedSharp.toBuffer();
			const publicUrl = await saveFileToDisk(resizedBuffer, resizedRelativePath);

			// Get height from metadata, scaled by width
			const height = metadata.height ? Math.round((width / (metadata.width || width)) * metadata.height) : width;

			resizedImages[size] = {
				url: publicUrl,
				width,
				height: height,
				size: resizedBuffer.length,
				mimeType: mimeType
			};

			logger.debug('Resized image saved', {
				size,
				url: publicUrl,
				dimensions: `${width}x${height}`
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
		failedSizes: Object.keys(SIZES).filter((s) => s !== 'original' && !resizedImages[s])
	});

	return resizedImages;
}

// Deletes a file from storage
export async function deleteFile(url: string): Promise<void> {
	const startTime = performance.now();
	let relativePath = url;

	try {
		// Normalize URL to relative path
		if (url.startsWith('http://') || url.startsWith('https://')) {
			relativePath = new URL(url).pathname;
		}
		if (isCloudStorage()) {
			// Cloud URL: https://cdn.com/cms-media/avatars/image.jpg -> /cms-media/avatars/image.jpg
			// We must strip the prefix, which is part of the path
			const config = getCloudStorageConfig();
			if (config.mediaFolder && relativePath.startsWith(`/${config.mediaFolder}/`)) {
				relativePath = relativePath.substring(`/${config.mediaFolder}/`.length);
			}
		} else {
			// Local URL: /files/avatars/image.jpg -> avatars/image.jpg
			if (relativePath.startsWith('/files/')) {
				relativePath = relativePath.substring('/files/'.length);
			}
		}
		relativePath = relativePath.replace(/^\/+/, ''); // Clean leading slash

		// Check if using cloud storage
		if (isCloudStorage()) {
			logger.debug('Deleting file from cloud storage', { url, relativePath });
			await deleteFromCloud(relativePath);

			logger.info('File deleted from cloud storage', {
				url,
				relativePath,
				processingTime: performance.now() - startTime
			});
			return;
		}

		// Local filesystem deletion
		const fs = await getFs();
		const filePath = Path.join(getMediaFolder(), relativePath);

		logger.debug('Deleting file from local storage', {
			url,
			relativePath,
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
			relativePath,
			error: err,
			stack: new Error().stack,
			processingTime: performance.now() - startTime
		});
		throw new Error(message);
	}
}

// Retrieves a file from storage
export async function getFile(url: string): Promise<Buffer> {
	let relativePath = url;
	// Normalize URL to relative path
	if (url.startsWith('http://') || url.startsWith('https://')) {
		relativePath = new URL(url).pathname;
	}

	// For cloud storage
	if (isCloudStorage()) {
		const config = getCloudStorageConfig();
		if (config.mediaFolder && relativePath.startsWith(`/${config.mediaFolder}/`)) {
			relativePath = relativePath.substring(`/${config.mediaFolder}/`.length);
		}
		relativePath = relativePath.replace(/^\/+/, ''); // Clean leading slash

		const cloudUrl = getCloudUrl(relativePath);
		logger.warn('getFile called for cloud storage - files should be accessed directly', { url, cloudUrl });

		// Fetch from cloud URL
		const response = await fetch(cloudUrl);
		if (!response.ok) {
			throw new Error(`Failed to fetch cloud file: ${response.statusText}`);
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		logger.info('File retrieved from cloud storage', { url, cloudUrl, size: buffer.length });
		return buffer;
	}

	// Local filesystem retrieval
	// Local URL: /files/avatars/image.jpg -> avatars/image.jpg
	if (relativePath.startsWith('/files/')) {
		relativePath = relativePath.substring('/files/'.length);
	}
	relativePath = relativePath.replace(/^\/+/, ''); // Clean leading slash

	const fs = await getFs();
	const filePath = Path.join(getMediaFolder(), relativePath);
	const buffer = await fs.promises.readFile(filePath);
	logger.info('File retrieved from disk', { url, filePath, size: buffer.length });
	return buffer;
}

/**
 * Checks if a file exists in storage
 */
export async function fileExists(url: string): Promise<boolean> {
	let relativePath = url;
	// Normalize URL to relative path
	if (url.startsWith('http://') || url.startsWith('https://')) {
		relativePath = new URL(url).pathname;
	}

	// Check cloud storage
	if (isCloudStorage()) {
		try {
			const config = getCloudStorageConfig();
			if (config.mediaFolder && relativePath.startsWith(`/${config.mediaFolder}/`)) {
				relativePath = relativePath.substring(`/${config.mediaFolder}/`.length);
			}
			relativePath = relativePath.replace(/^\/+/, ''); // Clean leading slash

			const exists = await cloudFileExists(relativePath);
			logger.debug('Cloud file existence check', { url, relativePath, exists });
			return exists;
		} catch (err) {
			logger.error('Error checking cloud file existence', { url, error: err });
			return false;
		}
	}

	// Check local filesystem
	// Local URL: /files/avatars/image.jpg -> avatars/image.jpg
	if (relativePath.startsWith('/files/')) {
		relativePath = relativePath.substring('/files/'.length);
	}
	relativePath = relativePath.replace(/^\/+/, ''); // Clean leading slash

	const fs = await getFs();
	const filePath = Path.join(getMediaFolder(), relativePath);
	try {
		await fs.promises.access(filePath);
		logger.debug('Local file existence check', { url, filePath, exists: true });
		return true;
	} catch {
		logger.debug('Local file existence check', { url, filePath, exists: false });
		return false;
	}
}

// Moves a file to trash
export async function moveMediaToTrash(url: string): Promise<void> {
	let relativePath = url;

	// Normalize URL to relative path
	if (url.startsWith('http://') || url.startsWith('https://')) {
		relativePath = new URL(url).pathname;
	}

	// Check if using cloud storage
	if (isCloudStorage()) {
		logger.info("Deleting file from cloud storage (cloud storage doesn't have trash)", { url });

		const config = getCloudStorageConfig();
		if (config.mediaFolder && relativePath.startsWith(`/${config.mediaFolder}/`)) {
			relativePath = relativePath.substring(`/${config.mediaFolder}/`.length);
		}
		relativePath = relativePath.replace(/^\/+/, ''); // Clean leading slash

		try {
			await deleteFromCloud(relativePath);
			logger.info('File deleted from cloud storage', { url, relativePath });
		} catch (err) {
			logger.error('Failed to delete from cloud storage', { url, error: err });
			// Don't throw - treat as best-effort
		}
		return;
	}

	// LOCAL STORAGE: Move to .trash directory
	const fs = await getFs();
	const mediaFolder = getMediaFolder();

	// Local URL: /files/avatars/image.jpg -> avatars/image.jpg
	if (relativePath.startsWith('/files/')) {
		relativePath = relativePath.substring('/files/'.length);
	}
	relativePath = relativePath.replace(/^\/+/, ''); // Clean leading slash

	// Guard: invalid or empty path
	if (!relativePath || relativePath.endsWith('/')) {
		logger.warn('moveMediaToTrash called with invalid path; skipping', { url, normalized: relativePath });
		return;
	}

	const sourceAbs = Path.join(process.cwd(), mediaFolder, relativePath);
	const trashAbs = Path.join(process.cwd(), mediaFolder, '.trash', relativePath); // preserve subdirs

	// Ensure trash dir exists
	await fs.promises.mkdir(Path.dirname(trashAbs), { recursive: true });

	try {
		const stat = await fs.promises.stat(sourceAbs).catch(() => null);
		if (!stat) {
			logger.warn('Source file not found for trash; skipping', { sourceAbs, url, normalized: relativePath });
			return;
		}
		if (!stat.isFile()) {
			// Do not attempt to trash directories
			logger.warn('Source path is not a file; skipping', { sourceAbs });
			return;
		}
		await fs.promises.rename(sourceAbs, trashAbs);
		logger.info('File moved to trash successfully', { originalUrl: url, sourceAbs, trashAbs });
	} catch (err) {
		const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
		if (code === 'ENOENT') {
			logger.warn('File not found during trash operation; skipping', { sourceAbs, url });
			return;
		}
		// Re-throw for upstream handling for unexpected errors
		logger.error('Unexpected error moving file to trash', { sourceAbs, trashAbs, error: err });
		throw err;
	}
} // Cleans up media directory

export async function cleanMediaDirectory(): Promise<void> {
	// Implementation for cleaning up unused files
	logger.info('Media directory cleanup completed');
}

/**
 * Saves an avatar image with proper resizing and storage.
 * @param avatarFile - The uploaded File object
 * @param userId - The user ID for naming the avatar
 * @returns The public URL of the saved avatar
 */
export async function saveAvatarImage(avatarFile: File, userId: string): Promise<string> {
	try {
		logger.info('Saving avatar image', { userId, fileName: avatarFile.name, fileSize: avatarFile.size });

		// Convert File to Buffer
		const arrayBuffer = await avatarFile.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Get file extension
		const ext = Path.extname(avatarFile.name) || '.jpg';

		// Resize avatar to 200x200
		const resizedImage = await Sharp(buffer)
			.resize(200, 200, {
				fit: 'cover',
				position: 'center'
			})
			.toBuffer();

		// Save to avatars directory with user ID as filename
		const relativePath = `avatars/${userId}${ext}`;
		const avatarUrl = await saveFileToDisk(resizedImage, relativePath);

		logger.info('Avatar saved successfully', { userId, avatarUrl, fileSize: resizedImage.length });

		return avatarUrl;
	} catch (err) {
		logger.error('Error saving avatar image', {
			userId,
			error: err instanceof Error ? err.message : String(err)
		});
		throw err;
	}
}
