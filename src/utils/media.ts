import { publicEnv } from '@root/config/public';

import fs from 'fs';
import axios from 'axios';
import Path from 'path';
import mongoose from 'mongoose';
import { browser } from '$app/environment';

import type { MediaImage, MediaDocument, MediaAudio, MediaVideo, MediaRemoteVideo } from './types';
import { sha256 } from './utils';

// Get defined sizes from publicEnv
const env_sizes = publicEnv.IMAGE_SIZES;
export const SIZES = { ...env_sizes, original: 0, thumbnail: 200 } as const;

// Sanitizes a string by replacing spaces with underscores and removing non-alphanumeric characters.
function sanitize(str: string): string {
	return str.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}

// Generates a SHA-256 hash from a buffer and returns the first 20 characters.
async function hashFileContent(buffer: Buffer): Promise<string> {
	return (await sha256(buffer)).slice(0, 20);
}

// Extracts the filename without extension and the extension from a given filename.
function getSanitizedFileName(fileName: string): { fileNameWithoutExt: string; ext: string } {
	const ext = Path.extname(fileName).toLowerCase();
	const fileNameWithoutExt = sanitize(Path.basename(fileName, ext));
	return { fileNameWithoutExt, ext };
}

// Saves a buffer to disk at the specified URL.
async function saveFileToDisk(buffer: Buffer, url: string) {
	const fullPath = `${publicEnv.MEDIA_FOLDER}/${url}`;
	if (!fs.existsSync(Path.dirname(fullPath))) {
		fs.mkdirSync(Path.dirname(fullPath), { recursive: true });
	}
	fs.writeFileSync(fullPath, buffer);
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

// Saves resized versions of an image to disk.
async function saveResizedImages(buffer: Buffer, hash: string, fileName: string, collectionName: string, ext: string, path: string) {
	const sharpModule = await import('sharp');
	const sharp = sharpModule.default;
	const format = (publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original' ? ext : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format) as keyof sharpModule.FormatEnum;
	for (const size in SIZES) {
		if (size === 'original') continue;

		console.log(ext);
		const resizedImage = await sharp(buffer)
			.rotate()
			.resize({ width: SIZES[size] })
			.toFormat(format, {
				quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality
			})
			.toBuffer({ resolveWithObject: true });

		const resizedUrl = constructUrl(path, hash, fileName, format, collectionName);
		await saveFileToDisk(resizedImage.data, resizedUrl);
	}
}

// Saves media information to the database.
async function saveMediaToDb<T>(collection: string, fileInfo: T, userId: string): Promise<mongoose.Types.ObjectId> {
	// if (!fileInfo.original) throw new Error('File information is missing.');
	const res = await mongoose.models[collection].insertMany([{ ...fileInfo, user: userId }]);
	return new mongoose.Types.ObjectId(res[0]._id);
}

// Base function for saving media files, handling common operations.
async function saveMedia<T>(
	file: File,
	collection: string,
	collectionName: string,
	handleResizing: boolean,
	userId: string
): Promise<{ id: mongoose.Types.ObjectId; fileInfo: T }> {
	if (browser) return {} as any;

	try {
		const buffer = Buffer.from(await file.arrayBuffer());
		const hash = await hashFileContent(buffer);
		const existingFile = await mongoose.models[collection].findOne({ hash });
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const sanitizedFileName = sanitize(fileNameWithoutExt);
		const path = file.path || 'global';

		// If the file already exists, return the existing file information
		if (existingFile) {
			return { id: new mongoose.Types.ObjectId(existingFile._id), fileInfo: existingFile };
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
		if (handleResizing && file.type.split('/')[0] === 'image' && file.type.includes('svg') === false) {
			await saveResizedImages(buffer, hash, sanitizedFileName, collectionName, ext, path);
		}

		// Save file information to the database
		console.log(`Saving media to db: ${collection} - ${fileInfo}`)
		const id = await saveMediaToDb<T>(collection, fileInfo, userId);
		return { id, fileInfo: fileInfo as T };
	} catch (error) {
		console.error('Error saving media:', error);
		throw error;
	}
}

// Specific Media Saving Functions

//Saves an image file.
export async function saveImage(file: File, collectionName: string, userId: string): Promise<{ id: mongoose.Types.ObjectId; fileInfo: MediaImage }> {
	return await saveMedia<MediaImage>(file, 'media_images', collectionName, true, userId);
}

// Saves a document file.
export async function saveDocument(file: File, collectionName: string, userId: string): Promise<{ id: mongoose.Types.ObjectId; fileInfo: MediaDocument }> {
	return await saveMedia<MediaDocument>(file, 'media_documents', collectionName, false, userId);
}

// Saves a video file.
export async function saveVideo(file: File, collectionName: string, userId: string): Promise<{ id: mongoose.Types.ObjectId; fileInfo: MediaVideo }> {
	return await saveMedia<MediaVideo>(file, 'media_videos', collectionName, false, userId);
}

// Saves an audio file.
export async function saveAudio(file: File, collectionName: string, userId: string): Promise<{ id: mongoose.Types.ObjectId; fileInfo: MediaAudio }> {
	return await saveMedia<MediaAudio>(file, 'media_audio', collectionName, false, userId);
}

// Saves a remote media file from a URL.
export async function saveRemoteMedia(fileUrl: string, collectionName: string): Promise<{ id: mongoose.Types.ObjectId; fileInfo: MediaRemoteVideo }> {
	try {
		const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
		const buffer = Buffer.from(response.data);
		const hash = await hashFileContent(buffer);
		const fileName = decodeURI(fileUrl.split('/').pop() ?? 'defaultName');
		const { fileNameWithoutExt, ext } = getSanitizedFileName(fileName);
		const url = `path_or_url_where_files_are_stored/${hash}-${fileNameWithoutExt}.${ext}`;

		const fileInfo: MediaRemoteVideo = {
			hash,
			_id: new mongoose.Types.ObjectId(),
			used_by: [],
			type: 'RemoteVideo',
			name: `${hash}-${fileNameWithoutExt}.${ext}`,
			url,
			lastModified: new Date()
		};

		const MediaModel = mongoose.model<MediaRemoteVideo>(
			collectionName,
			new mongoose.Schema({
				name: String,
				url: String,
				hash: String,
				createdAt: Date,
				lastModified: Date,
				type: String,
				used_by: [mongoose.Schema.Types.ObjectId]
			})
		);

		const res = await MediaModel.create(fileInfo);
		return { id: new mongoose.Types.ObjectId(res._id), fileInfo: fileInfo };
	} catch (error) {
		console.error('Error saving remote media:', error);
		throw error;
	}
}
