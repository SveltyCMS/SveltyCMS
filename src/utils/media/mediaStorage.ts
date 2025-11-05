/**
 * @file src/utils/media/mediaStorage.ts
 * @description Core media storage functionality for the CMS.
 * This module handles all file system operations and media processing.
 * Supports both local filesystem and cloud storage (S3, R2, Cloudinary).
 */

import { cacheService } from '@src/databases/CacheService';
import { dbAdapter } from '@src/databases/db';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { error } from '@sveltejs/kit';
import { sanitize } from '@utils/utils';
import crypto from 'crypto';
import mime from 'mime-types';
import Path from 'path';
import Sharp from 'sharp';
import { MediaTypeEnum, Permission } from './mediaModels';
import { getSanitizedFileName, hashFileContent } from './mediaProcessing';
import { isCloudStorage, uploadToCloud, deleteFromCloud, getCloudUrl, cloudFileExists } from './cloudStorage';

import type { MediaAccess, MediaRemoteVideo, ResizedImage } from './mediaModels';

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
	...(publicEnv.IMAGE_SIZES || defaultImageSizes),
	original: 0,
	thumbnail: 200
} as const;

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

// Saves a file to disk or cloud storage
export async function saveFileToDisk(buffer: Buffer, url: string): Promise<string> {
	try {
		// Check if using cloud storage
		if (isCloudStorage()) {
			logger.debug('Uploading file to cloud storage', {
				url,
				bufferSize: buffer.length
			});

			// Upload to cloud and return the public URL
			const publicUrl = await uploadToCloud(buffer, url);

			logger.info('File uploaded to cloud storage', {
				url,
				publicUrl,
				fileSize: buffer.length
			});

			return publicUrl;
		}

		// LOCAL STORAGE: Save to filesystem
		const fs = await getFs();
		const fullPath = Path.join(getMediaFolder(), url);
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

		// Return local URL format
		return `/files/${url}`;
	} catch (err) {
		const message = `Failed to save file: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, {
			url,
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
			const formatQuality = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY;
			if (formatQuality && formatQuality.format !== 'original') {
				resizedBuffer = resizedBuffer.toFormat(formatQuality.format as 'avif' | 'webp', {
					quality: formatQuality.quality,
					lossless: false
				});
			}

			// Use correct extension based on output format
			const outputExt = formatQuality && formatQuality.format === 'original' ? ext : `.${formatQuality?.format ?? ''}`;

			const resizedUrl = Path.posix.join(basePath, size, `${fileName}-${hash}.${outputExt}`);

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
				height: width
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
		failedSizes: Object.keys(SIZES).filter((s) => s !== 'original' && !resizedImages[s])
	});

	return resizedImages;
}

// Deletes a file from storage
export async function deleteFile(url: string): Promise<void> {
	const startTime = performance.now();

	try {
		// Check if using cloud storage
		if (isCloudStorage()) {
			logger.debug('Deleting file from cloud storage', { url });

			// Extract relative path from URL
			let relativePath = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
			if (relativePath.startsWith('files/')) {
				relativePath = relativePath.slice('files/'.length);
			}

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
		const filePath = Path.join(getMediaFolder(), url);

		logger.debug('Deleting file from local storage', {
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

// Retrieves a file from storage
export async function getFile(url: string): Promise<Buffer> {
	// For cloud storage, this would typically not be used since files are accessed via redirect
	// But we provide it for special cases like server-side processing
	if (isCloudStorage()) {
		// Extract relative path
		let relativePath = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
		if (relativePath.startsWith('files/')) {
			relativePath = relativePath.slice('files/'.length);
		}

		// Note: This would require implementing a download method in cloudStorage.ts
		// For now, we'll throw an error as cloud files should be accessed directly via URL
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
	const fs = await getFs();
	const filePath = Path.join(getMediaFolder(), url);
	const buffer = await fs.promises.readFile(filePath);
	logger.info('File retrieved from disk', { url, filePath, size: buffer.length });
	return buffer;
}

/**
 * Checks if a file exists in storage
 */
export async function fileExists(url: string): Promise<boolean> {
	// Check cloud storage
	if (isCloudStorage()) {
		try {
			// Extract relative path
			let relativePath = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
			if (relativePath.startsWith('files/')) {
				relativePath = relativePath.slice('files/'.length);
			}

			const exists = await cloudFileExists(relativePath);
			logger.debug('Cloud file existence check', { url, relativePath, exists });
			return exists;
		} catch (err) {
			logger.error('Error checking cloud file existence', { url, error: err });
			return false;
		}
	}

	// Check local filesystem
	const fs = await getFs();
	const filePath = Path.join(getMediaFolder(), url);
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
	// Check if using cloud storage
	if (isCloudStorage()) {
		logger.info("Deleting file from cloud storage (cloud storage doesn't have trash)", { url });

		// For cloud storage, we directly delete the file
		// Cloud providers typically have their own versioning/backup systems
		try {
			// Extract relative path from URL
			let relativePath = url.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '');
			if (relativePath.startsWith('files/')) {
				relativePath = relativePath.slice('files/'.length);
			}

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

	// Normalize various possible forms:
	// - /files/avatars/...
	// - /mediaFiles/avatars/...
	// - mediaFiles/avatars/...
	// - avatars/...
	let input = (url || '').toString();
	// Strip origin
	input = input.replace(/^https?:\/\/[^/]+/i, '');
	// Remove leading slashes
	input = input.replace(/^\/+/, '');
	// Map files/ to media folder space
	if (input.startsWith('files/')) {
		input = input.slice('files/'.length);
	}
	// Remove media folder prefix if present
	if (input.startsWith(`${mediaFolder}/`)) {
		input = input.slice(mediaFolder.length + 1);
	}

	// Guard: invalid or empty path
	if (!input || input.endsWith('/')) {
		logger.warn('moveMediaToTrash called with invalid path; skipping', { url, normalized: input });
		return;
	}

	const sourceAbs = Path.join(process.cwd(), mediaFolder, input);
	const trashAbs = Path.join(process.cwd(), mediaFolder, '.trash', input); // preserve subdirs

	// Ensure trash dir exists
	await fs.promises.mkdir(Path.dirname(trashAbs), { recursive: true });

	try {
		const stat = await fs.promises.stat(sourceAbs).catch(() => null);
		if (!stat) {
			logger.warn('Source file not found for trash; skipping', { sourceAbs, url, normalized: input });
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

// Saves a remote media file to the database
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
		const url = `remote_media/${hash}-${fileNameWithoutExt}.${ext}`;

		// Create user access entry with all permissions
		const userAccess: MediaAccess = {
			userId: user_id,
			permissions: [Permission.Read, Permission.Write, Permission.Delete]
		};

		// Construct file info object for the remote video
		const fileInfo: MediaRemoteVideo = {
			hash,
			filename: fileName,
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
		const existingFile = await dbAdapter.crud.findOne('media_remote_videos', { hash });
		if (existingFile && existingFile.success && existingFile.data) {
			logger.info('Remote file already exists in the database', {
				fileId: existingFile.data._id,
				collection: 'media_remote_videos'
			});
			return { id: existingFile.data._id || '', fileInfo: existingFile.data as MediaRemoteVideo };
		}

		// Save the file info to the database
		const insertResult = await dbAdapter.crud.create('media_remote_videos', fileInfo);
		if (!insertResult.success) {
			throw new Error(`Failed to save remote media: ${insertResult.error.message}`);
		}

		const id = insertResult.data._id || '';
		await cacheService.set(`media:${id}`, fileInfo, 3600);

		logger.info('Remote media saved to database', { fileInfo });
		return { id, fileInfo };
	} catch (error) {
		logger.error('Error saving remote media:', error instanceof Error ? error : new Error(String(error)));
		throw error;
	}
}

/**
 * Saves an avatar image to storage (local or cloud) and database
 * The avatar URL will also be saved to the user's database record by the calling API
 */
export async function saveAvatarImage(file: File, userId: string = 'system'): Promise<string> {
	try {
		if (!file) throw new Error('No file provided');

		// Check if database adapter is available, but don't fail if it's not fully ready
		const isDatabaseReady = dbAdapter && dbAdapter.utils && typeof dbAdapter.utils.generateId === 'function';
		if (!isDatabaseReady) {
			logger.warn('Database adapter not fully ready - avatar will be saved to storage only');
		}

		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 32);

		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const sanitizedBlobName = sanitize(fileNameWithoutExt);

		// Check for existing avatar by hash only if database is ready
		const existingFile = isDatabaseReady ? await dbAdapter.crud.findOne('media_images', { hash }).catch(() => null) : null;
		if (existingFile && existingFile.success && existingFile.data) {
			const mediaData = existingFile.data as { url?: string };
			let fileUrl = mediaData.url || '';

			// Return cloud URL or local /files/ URL
			if (isCloudStorage()) {
				fileUrl = getCloudUrl(fileUrl);
			} else {
				fileUrl = `/files/${fileUrl}`;
			}

			logger.info('Avatar already exists, returning existing URL', { hash, fileUrl });
			return fileUrl;
		}

		let avatarUrl: string;
		let publicUrl: string;
		let width = 0;
		let height = 0;
		let mimeType = file.type;

		if (ext === 'svg') {
			// Save SVG as-is
			avatarUrl = `avatars/${hash}-${sanitizedBlobName}.${ext}`;
			publicUrl = await saveFileToDisk(buffer, avatarUrl);
			// SVGs don't have width/height here
		} else {
			// Convert to AVIF thumbnail (200px as defined in SIZES.thumbnail)
			// Use faster resize settings for avatars
			const resizedImage = await resizeImage(buffer, SIZES.thumbnail);
			resizedImage.jpeg({ quality: 80, progressive: true }); // Set quality for faster processing
			avatarUrl = `avatars/${hash}-${sanitizedBlobName}-thumbnail.avif`;

			// Process metadata and buffer in parallel
			const [resizedBuffer, meta] = await Promise.all([resizedImage.toBuffer(), resizedImage.metadata()]);

			publicUrl = await saveFileToDisk(resizedBuffer, avatarUrl);
			width = meta.width || 0;
			height = meta.height || 0;
			mimeType = 'image/avif';
		}

		// Create MediaItem-compatible object for database storage
		// Store relative path in DB, not full URL
		const mediaItemForDB = {
			filename: file.name,
			hash,
			path: 'avatars',
			url: avatarUrl, // Store relative path
			size: buffer.length,
			mimeType,
			thumbnails: { avatar: { url: avatarUrl, width, height } },
			metadata: { width, height },
			user: userId, // Required field for the media schema
			createdBy: userId,
			updatedBy: userId,
			status: 'private' // Default status for avatars
		};

		logger.info('Avatar image prepared for database save', {
			filename: file.name,
			hash,
			path: 'avatars',
			avatarUrl,
			publicUrl,
			size: buffer.length,
			mimeType,
			userId: userId?.includes('@') ? userId.replace(/(.{2}).*@(.*)/, '$1****@$2') : userId
		});

		// Try to upload to database only if it's ready - run in background to not block response
		if (isDatabaseReady) {
			// Don't await this - let it run in background
			Promise.resolve()
				.then(async () => {
					try {
						// Check if the media upload method exists
						if (dbAdapter.media && dbAdapter.media.files && typeof dbAdapter.media.files.upload === 'function') {
							const uploadResult = await dbAdapter.media.files.upload(mediaItemForDB);

							if (uploadResult && uploadResult.success) {
								logger.debug('Avatar successfully saved to database');
							} else {
								const errorMsg = uploadResult?.error?.message || uploadResult?.error || 'Unknown error';
								logger.error('Failed to upload avatar to database:', {
									error: errorMsg,
									details: uploadResult?.error?.details || 'No additional details',
									code: uploadResult?.error?.code || 'UNKNOWN_ERROR'
								});
								logger.warn('Avatar file saved to storage but not to database metadata');
							}
						} else {
							// Fallback: Try to use the CRUD interface to create a media record
							try {
								const createResult = await dbAdapter.crud.create('media_images', mediaItemForDB);
								if (createResult && createResult.success) {
									logger.debug('Avatar successfully saved to database via CRUD');
								} else {
									const errorMsg = createResult?.error?.message || createResult?.error || 'Unknown error';
									logger.error('Failed to create avatar record via CRUD:', {
										error: errorMsg,
										details: createResult?.error?.details || 'No additional details',
										code: createResult?.error?.code || 'UNKNOWN_ERROR'
									});
									logger.warn('Avatar file saved to disk but not to database metadata');
								}
							} catch (crudError) {
								logger.error('Media upload method not available and CRUD fallback failed:', {
									error: crudError instanceof Error ? crudError.message : String(crudError),
									stack: crudError instanceof Error ? crudError.stack : undefined,
									type: 'CRUD_FALLBACK_ERROR'
								});
								logger.info('Avatar saved to disk only - database metadata will not be stored');
							}
						}
					} catch (dbError) {
						logger.error('Database upload failed for avatar:', {
							error: dbError instanceof Error ? dbError.message : String(dbError),
							stack: dbError instanceof Error ? dbError.stack : undefined,
							type: 'DATABASE_UPLOAD_ERROR'
						});
						logger.warn('Proceeding with avatar URL despite database upload failure');
					}
				})
				.catch(() => {
					// Silent catch for background operation
				});
		} else {
			logger.info('Database not ready - skipping avatar metadata save');
		}

		// Return the public URL (cloud or local)
		logger.info('Avatar saved successfully', {
			userId: userId?.includes('@') ? userId.replace(/(.{2}).*@(.*)/, '$1****@$2') : userId,
			publicUrl,
			fileSize: buffer.length,
			mimeType,
			storageType: isCloudStorage() ? 'cloud' : 'local',
			note: 'Avatar URL will be saved to user database record by calling API'
		});

		return publicUrl;
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
