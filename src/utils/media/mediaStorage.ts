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
import type { MediaRemoteVideo, MediaAccess, MediaImage, ResizedImage } from './mediaModels';
import { MediaTypeEnum, Permission } from './mediaModels';

import { hashFileContent, getSanitizedFileName } from './mediaProcessing';
import { constructUrl } from './mediaUtils';
import { sanitize } from '@utils/utils';

// Database adapter for authentication
import { dbAdapter } from '@src/databases/db';

// System logger instance
import { logger } from '@utils/logger';

// Image sizes, including defaults
const SIZES = { ...publicEnv.IMAGE_SIZES, original: 0, thumbnail: 200 } as const;

let s3Client: any = null;

// Dynamically imports AWS SDK and returns an S3 client
async function getS3Client() {
	if (typeof window !== 'undefined') return null;

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

// Moves a file to the trash folder
export async function moveMediaToTrash(url: string, collectionName: string): Promise<void> {
	try {
		if (!url) {
			throw new Error('URL is required');
		}

		const trashDir = Path.join(publicEnv.MEDIA_FOLDER, '.trash');

		// Create trash directory if it doesn't exist
		if (!fs.existsSync(trashDir)) {
			fs.mkdirSync(trashDir, { recursive: true });
		}

		if (publicEnv.MEDIASERVER_URL) {
			// Handle S3 storage
			const s3 = await getS3Client();
			if (!s3) {
				throw new Error('S3 client is not available');
			}

			// Copy to trash folder in S3
			const trashKey = `.trash/${Path.basename(url)}`;
			await s3
				.copyObject({
					Bucket: process.env.AWS_S3_BUCKET || '',
					CopySource: `${process.env.AWS_S3_BUCKET}/${url}`,
					Key: trashKey
				})
				.promise();

			// Delete original
			await s3
				.deleteObject({
					Bucket: process.env.AWS_S3_BUCKET || '',
					Key: url
				})
				.promise();

			logger.info('File moved to trash in S3', { originalUrl: url, trashUrl: trashKey });
		} else {
			// Handle local storage
			const sourcePath = Path.join(publicEnv.MEDIA_FOLDER, url);
			const trashPath = Path.join(trashDir, Path.basename(url));

			if (!fs.existsSync(sourcePath)) {
				throw new Error('Source file does not exist');
			}

			// Move file to trash
			fs.renameSync(sourcePath, trashPath);
			logger.info('File moved to trash locally', { originalPath: sourcePath, trashPath });
		}

		// Update database record if available
		if (dbAdapter) {
			const fileRecord = await dbAdapter.findOne(collectionName, { url });
			if (fileRecord) {
				await dbAdapter.updateOne(
					collectionName,
					{ _id: fileRecord._id },
					{
						$set: {
							deletedAt: new Date(),
							status: 'trashed'
						}
					}
				);
				logger.info('Database record updated for trashed file', { fileId: fileRecord._id });
			}
		}
	} catch (err) {
		logger.error('Error moving file to trash:', err instanceof Error ? err : new Error(String(err)));
		throw err;
	}
}

// Saves a file to local disk or cloud storage
export async function saveFileToDisk(buffer: Buffer, url: string): Promise<void> {
	if (publicEnv.MEDIASERVER_URL) {
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
		const fullPath = Path.join(publicEnv.MEDIA_FOLDER, url);
		const dir = Path.dirname(fullPath);

		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		await fs.promises.writeFile(fullPath, buffer);
	}
	logger.info('File saved', { url });
}

// Saves a remote media file to the database
export async function saveRemoteMedia(fileUrl: string, collectionName: string, user_id: string): Promise<{ id: string; fileInfo: MediaRemoteVideo }> {
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

		logger.info('Remote media saved to database', { collectionName, fileInfo });
		return { id, fileInfo };
	} catch (error) {
		logger.error('Error saving remote media:', error instanceof Error ? error : new Error(String(error)));
		throw error;
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
): Promise<Record<string, ResizedImage>> {
	const sharp = (await import('sharp')).default;

	const format =
		publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original'
			? (ext as keyof sharp.FormatEnum)
			: (publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format as keyof sharp.FormatEnum);

	const thumbnails: Record<string, ResizedImage> = {};

	for (const size in SIZES) {
		if (size === 'original') continue;
		const resizedImage = await sharp(buffer)
			.rotate()
			.resize({ width: SIZES[size] })
			.toFormat(format, {
				quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality,
				...(format === 'webp' && { effort: 6 }),
				...(format === 'avif' && { effort: 9 })
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

// Saves an avatar image to disk and database
export async function saveAvatarImage(file: File): Promise<string> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);

		const existingFile = dbAdapter ? await dbAdapter.findOne('media_images', { hash }) : null;

		if (existingFile) {
			let fileUrl = existingFile.thumbnail?.url;
			if (publicEnv.MEDIASERVER_URL) {
				fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
			} else {
				fileUrl =`${publicEnv.MEDIA_FOLDER}/${fileUrl}`;
			}
			return fileUrl;
		}

		const { fileNameWithoutExt } = getSanitizedFileName(file.name);
		const sanitizedBlobName = sanitize(fileNameWithoutExt);

		// For avatars, we only create one AVIF thumbnail
		const sharp = (await import('sharp')).default;

		const resizedImage = await sharp(buffer)
			.rotate()
			.resize({ width: SIZES.thumbnail })
			.toFormat('avif', {
				quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality,
				effort: 9
			})
			.toBuffer({ resolveWithObject: true });

		const thumbnailUrl = `avatars/${hash}-${sanitizedBlobName}thumbnail.avif`;
		await saveFileToDisk(resizedImage.data, thumbnailUrl);

		const thumbnail = {
			url: thumbnailUrl,
			width: resizedImage.info.width,
			height: resizedImage.info.height
		};

		const fileInfo: MediaImage = {
			hash,
			name: file.name,
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
			width: resizedImage.info.width,
			height: resizedImage.info.height,
			user: 'system',
			access: {
				permissions: [Permission.Read, Permission.Write]
			}
		};

		if (!dbAdapter) throw Error('Database adapter not initialized.');

		await dbAdapter.insertOne('media_images', fileInfo);

		// Return the thumbnail URL for avatar usage
		let fileUrl = thumbnailUrl;
		if (publicEnv.MEDIASERVER_URL) {
			fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
		} else {
			fileUrl =`${publicEnv.MEDIA_FOLDER}/${fileUrl}`;
		}

		return fileUrl;
	} catch (err) {
		logger.error('Error saving avatar image:', err as Error);
		throw err;
	}
}

// Deletes a file from storage (disk or cloud)
export async function deleteFile(url: string): Promise<void> {
	if (publicEnv.MEDIASERVER_URL) {
		const s3 = await getS3Client();
		if (!s3) throw Error('S3 client is not available.');

		await s3
			.deleteObject({
				Bucket: process.env.AWS_S3_BUCKET || '',
				Key: url
			})
			.promise();
		logger.info('File deleted from S3', { url });
	} else {
		const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
		fs.unlinkSync(filePath);
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
		return Buffer.from(data.Body as ArrayBuffer);
	} else {
		const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
		if (!fs.existsSync(filePath)) throw error(404, 'File not found');

		const buffer = await fs.promises.readFile(filePath);
		logger.info('File retrieved from local disk', { url });
		return buffer;
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
				.promise();
			logger.info('File exists in S3', { url });
			return true;
		} catch (error) {
			if (error instanceof Error && error.message.includes('NotFound')) return false;
			throw error;
		}
	} else {
		const filePath = Path.join(publicEnv.MEDIA_FOLDER, url);
		const exists = fs.existsSync(filePath);
		logger.info('File exists on local disk', { url, exists });
		return exists;
	}
}

// Cleans up media directory by removing unused files
export async function cleanMediaDirectory(): Promise<void> {
	logger.info('Media directory cleanup triggered.');
}
