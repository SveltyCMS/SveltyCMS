/**
 * @file src/utils/media/mediaStorage.ts
 * @description Core media storage functionality for the CMS.
 * This module handles all file system operations and media processing.
 */

import { publicEnv } from '@root/config/public';
import { error } from '@sveltejs/kit';
import Path from 'path';
import mime from 'mime-types';
import Sharp from 'sharp';
import { setCache } from '@root/src/databases/redis';
import type { MediaRemoteVideo, MediaAccess, ResizedImage } from './mediaModels';
import { MediaTypeEnum, Permission } from './mediaModels';
import { hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { sanitize } from '@utils/utils';
import { dbAdapter } from '@src/databases/db';
import crypto from 'crypto';

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

// Saves a file to disk
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
			if (publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format !== 'original') {
				resizedBuffer = resizedBuffer.toFormat(publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format as 'avif' | 'webp', {
					quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality,
					lossless: false
				});
			}

			// Use correct extension based on output format
			const outputExt = publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original' ? ext : `.${publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format}`;

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

// Retrieves a file from storage
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

// Moves a file to trash
export async function moveMediaToTrash(url: string): Promise<void> {
	const fs = await getFs();
	// Remove leading slash and/or MEDIA_FOLDER prefix to get relative path within media folder
	let relativeUrl = url;

	// Remove leading slash if present
	if (relativeUrl.startsWith('/')) {
		relativeUrl = relativeUrl.substring(1);
	}

	// Remove MEDIA_FOLDER prefix if present (after removing leading slash)
	const mediaFolderPrefix = `${publicEnv.MEDIA_FOLDER}/`;
	if (relativeUrl.startsWith(mediaFolderPrefix)) {
		relativeUrl = relativeUrl.substring(mediaFolderPrefix.length);
	}

	const sourcePath = Path.join(publicEnv.MEDIA_FOLDER, relativeUrl);
	const trashPath = Path.join(publicEnv.MEDIA_FOLDER, '.trash', Path.basename(relativeUrl));

	// Create trash directory if it doesn't exist
	await fs.promises.mkdir(Path.dirname(trashPath), { recursive: true });

	// Move file to trash
	await fs.promises.rename(sourcePath, trashPath);
	logger.info('File moved to trash', { originalUrl: url, trashUrl: trashPath });
}

// Cleans up media directory

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
		await setCache(`media:${id}`, fileInfo, 3600); // Cache for 1 hour

		logger.info('Remote media saved to database', { fileInfo });
		return { id, fileInfo };
	} catch (error) {
		logger.error('Error saving remote media:', error instanceof Error ? error : new Error(String(error)));
		throw error;
	}
}

/**
 * Saves an avatar image to disk and database
 * The avatar URL will also be saved to the user's database record by the calling API
 */
export async function saveAvatarImage(file: File, userId: string = 'system'): Promise<string> {
	try {
		if (!file) throw new Error('No file provided');

		// Check if database adapter is available, but don't fail if it's not fully ready
		const isDatabaseReady = dbAdapter && dbAdapter.utils && typeof dbAdapter.utils.generateId === 'function';
		if (!isDatabaseReady) {
			logger.warn('Database adapter not fully ready - avatar will be saved to disk only');
		}

		const fs = await getFs();
		// Create avatars directory under the media folder
		const avatarsPath = Path.join(process.cwd(), publicEnv.MEDIA_FOLDER, 'avatars');
		if (!fs.existsSync(avatarsPath)) {
			await fs.promises.mkdir(avatarsPath, { recursive: true });
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
			if (publicEnv.MEDIASERVER_URL) {
				fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
			} else {
				fileUrl = `${publicEnv.MEDIA_FOLDER}/${fileUrl}`;
			}
			return fileUrl;
		}

		let avatarUrl: string;
		let width = 0;
		let height = 0;
		let mimeType = file.type;

		if (ext === 'svg') {
			// Save SVG as-is
			avatarUrl = `avatars/${hash}-${sanitizedBlobName}.${ext}`;
			await saveFileToDisk(buffer, avatarUrl);
			// SVGs don't have width/height here
		} else {
			// Convert to AVIF thumbnail (200px as defined in SIZES.thumbnail)
			// Use faster resize settings for avatars
			const resizedImage = await resizeImage(buffer, SIZES.thumbnail);
			resizedImage.jpeg({ quality: 80, progressive: true }); // Set quality for faster processing
			avatarUrl = `avatars/${hash}-${sanitizedBlobName}-thumbnail.avif`;

			// Process metadata and buffer in parallel
			const [resizedBuffer, meta] = await Promise.all([resizedImage.toBuffer(), resizedImage.metadata()]);

			await saveFileToDisk(resizedBuffer, avatarUrl);
			width = meta.width || 0;
			height = meta.height || 0;
			mimeType = 'image/avif';
		}

		// Create MediaItem-compatible object for database storage
		const mediaItemForDB = {
			filename: file.name,
			hash,
			path: 'avatars',
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
								logger.warn('Avatar file saved to disk but not to database metadata');
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

		// Return the URL for serving to the client - this will be saved to user.avatar field
		const fileUrl = `/${publicEnv.MEDIA_FOLDER}/${avatarUrl}`;

		logger.info('Avatar saved successfully to disk', {
			userId: userId?.includes('@') ? userId.replace(/(.{2}).*@(.*)/, '$1****@$2') : userId,
			avatarUrl: fileUrl,
			fileSize: buffer.length,
			mimeType,
			note: 'Avatar URL will be saved to user database record by calling API'
		});

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
