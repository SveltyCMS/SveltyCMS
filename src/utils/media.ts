import { publicEnv } from '@root/config/public';
import fs from 'fs';
import axios from 'axios';
import Path from 'path';
import { browser } from '$app/environment';
import { sha256 } from './utils';
import { dbAdapter } from '@src/databases/db';

import crypto from 'crypto';

import { removeExtension, sanitize } from '@src/utils/utils';

// System Logs
import logger from '@src/utils/logger';

// Define media types
type MediaImage = any;
type MediaDocument = any;
type MediaAudio = any;
type MediaVideo = any;
type MediaRemoteVideo = any;

// Get defined sizes from publicEnv
const env_sizes = publicEnv.IMAGE_SIZES;
export const SIZES = { ...env_sizes, original: 0, thumbnail: 200 } as const;

// Generates a SHA-256 hash from a buffer and returns the first 20 characters.
async function hashFileContent(buffer: Buffer): Promise<string> {
	return (await sha256(buffer)).slice(0, 20);
}

// Extracts the filename without extension and the extension from a given filename.
function getSanitizedFileName(fileName: string): { fileNameWithoutExt: string; ext: string } {
	const { name: fileNameWithoutExt, ext } = removeExtension(fileName);
	const sanitizedFileNameWithoutExt = sanitize(fileNameWithoutExt);
	return { fileNameWithoutExt: sanitizedFileNameWithoutExt, ext };
}

// Saves a buffer to disk at the specified URL.
async function saveFileToDisk(buffer: Buffer, url: string) {
	const fullPath = `${publicEnv.MEDIA_FOLDER}/${url}`;
	if (!fs.existsSync(Path.dirname(fullPath))) {
		fs.mkdirSync(Path.dirname(fullPath), { recursive: true });
	}
	fs.writeFileSync(fullPath, buffer);
	logger.info('File saved to disk', { url: fullPath });
}

// Constructs a URL for storing a file based on the provided parameters.
function constructUrl(path: string, hash: string, fileName: string, ext: string, collectionName: string) {
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

// Define a type alias for the sharp module
type SharpModule = typeof import('sharp');

// Saves resized versions of an image to disk.
async function saveResizedImages(buffer: Buffer, hash: string, fileName: string, collectionName: string, ext: string, path: string) {
	const sharpModule = await import('sharp');
	const sharp: SharpModule = sharpModule.default;
	const format: keyof sharp.FormatEnum | sharp.AvailableFormatInfo =
		publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original'
			? (ext.slice(1) as keyof sharp.FormatEnum)
			: (publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format as keyof sharp.FormatEnum);

	for (const size in SIZES) {
		if (size === 'original') continue;

		const resizedImage = await sharp(buffer)
			.rotate()
			.resize({ width: SIZES[size] })
			.toFormat(format, {
				quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality
			})
			.toBuffer({ resolveWithObject: true });

		const resizedUrl = constructUrl(path, hash, fileName, format, collectionName);
		await saveFileToDisk(resizedImage.data, resizedUrl);
		logger.info('Resized image saved', { url: resizedUrl, size });
	}
}

// Saves media information to the database.
async function saveMediaToDb<T>(collection: string, fileInfo: T, user_id: string): Promise<string> {
	if (!dbAdapter) {
		const errorMessage = 'Database adapter is not initialized';
		logger.error(errorMessage);
		throw new Error(errorMessage);
	}
	const res = await dbAdapter.insertMany(collection, [{ ...fileInfo, user: user_id }]);
	logger.info('Media saved to database', { collection, fileInfo });
	return res[0]._id;
}

// Base function for saving media files, handling common operations.
async function saveMedia<T>(
	file: File,
	collection: string,
	collectionName: string,
	handleResizing: boolean,
	user_id: string
): Promise<{ id: string; fileInfo: T }> {
	if (browser) return {} as any;

	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const existingFile = dbAdapter ? await dbAdapter.findOne(collection, { hash }) : null;
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const sanitizedFileName = sanitize(fileNameWithoutExt);
		const path = file.path || 'global';

		// If the file already exists, return the existing file information
		if (existingFile) {
			logger.info('File already exists in the database', { fileId: existingFile._id, collection });
			return { id: existingFile._id, fileInfo: existingFile };
		}

		// Construct the URL for the original file
		const url = constructUrl(path, hash, sanitizedFileName, ext, collectionName);
		const fileInfo: any = {
			hash,
			original: {
				name: `${hash}-${file.name}`,
				url,
				type: file.type,
				size: file.size
			}
		};

		// Save the original file to disk
		await saveFileToDisk(buffer, url);

		// If resizing is needed and the file is not an SVG, resize the image
		if (handleResizing && file.type.split('/')[0] === 'image' && !file.type.includes('svg')) {
			await saveResizedImages(buffer, hash, sanitizedFileName, collectionName, ext, path);
		}

		// Save file information to the database
		logger.info(`Saving media to db: ${collection}`, { fileInfo });
		const id = await saveMediaToDb<T>(collection, fileInfo, user_id);
		return { id, fileInfo: fileInfo as T };
	} catch (error) {
		logger.error('Error saving media:', error as Error);
		throw error;
	}
}

// Specific Media Saving Functions

// Saves an image file.
export async function saveImage(file: File, collectionName: string, user_id: string): Promise<{ id: string; fileInfo: MediaImage }> {
	return await saveMedia<MediaImage>(file, 'media_images', collectionName, true, user_id);
}

// Saves a document file.
export async function saveDocument(file: File, collectionName: string, user_id: string): Promise<{ id: string; fileInfo: MediaDocument }> {
	return await saveMedia<MediaDocument>(file, 'media_documents', collectionName, false, user_id);
}

// Saves a video file.
export async function saveVideo(file: File, collectionName: string, user_id: string): Promise<{ id: string; fileInfo: MediaVideo }> {
	return await saveMedia<MediaVideo>(file, 'media_videos', collectionName, false, user_id);
}

// Saves an audio file.
export async function saveAudio(file: File, collectionName: string, user_id: string): Promise<{ id: string; fileInfo: MediaAudio }> {
	return await saveMedia<MediaAudio>(file, 'media_audio', collectionName, false, user_id);
}

// Saves a remote media file from a URL.
export async function saveRemoteMedia(fileUrl: string, collectionName: string): Promise<{ id: string; fileInfo: MediaRemoteVideo }> {
	try {
		const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
		const buffer = Buffer.from(response.data);
		const hash = await hashFileContent(buffer);
		const fileName = decodeURI(fileUrl.split('/').pop() ?? 'defaultName');
		const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
		const url = `path_or_url_where_files_are_stored/${hash}-${fileNameWithoutExt}.${ext}`;

		const fileInfo: Omit<MediaRemoteVideo, 'id'> = {
			hash,
			used_by: [],
			type: 'RemoteVideo',
			name: `${hash}-${fileNameWithoutExt}.${ext}`,
			url,
			lastModified: new Date()
		};

		if (!dbAdapter) {
			const errorMessage = 'Database adapter is not initialized';
			logger.error(errorMessage);
			throw new Error(errorMessage);
		}

		const res = await dbAdapter.insertMany(collectionName, [fileInfo]);
		const id = res[0]._id;
		logger.info('Remote media saved to database', { collectionName, fileInfo });
		return { id, fileInfo: { ...fileInfo, id } };
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
