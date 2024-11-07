/**
 * @file utils/media/mediaProcessing.ts
 * @description Handles media processing operations such as metadata extraction and thumbnail generation.
 */

import { publicEnv } from '@root/config/public';
import * as fs from 'fs';
import mime from 'mime-types';
import { Buffer } from 'buffer';
import { sha256, removeExtension, sanitize } from '@utils/utils';
import { error } from '@sveltejs/kit';

// System Logger
import { logger } from '@utils/logger';

// Convert File to Image Element
async function fileToImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const reader = new FileReader();

		reader.onload = (event) => {
			img.src = event.target?.result as string;
		};

		reader.onerror = reject;

		reader.readAsDataURL(file);

		img.onload = () => resolve(img);
		img.onerror = reject;
	});
}

// Extracts metadata from an image file
export async function extractMetadata(file: File): Promise<Record<string, any>> {
	try {
		const img = await fileToImage(file);
		const metadata = {
			width: img.width,
			height: img.height,
			format: mime.lookup(file.name) || file.type,
			size: file.size,
			mimeType: file.type
		};

		return metadata;
	} catch (err) {
		const message = `Error extracting image metadata: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Hashes the content of a file using SHA-256
export async function hashFileContent(buffer: ArrayBuffer): Promise<string> {
	try {
		return (await sha256(Buffer.from(buffer))).slice(0, 20);
	} catch (err) {
		const message = `Error hashing file content: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Sanitizes the filename by removing unsafe characters
export function getSanitizedFileName(fileName: string): { fileNameWithoutExt: string; ext: string } {
	const { name, ext } = removeExtension(fileName);
	return { fileNameWithoutExt: sanitize(name), ext };
}

// Example of resizing an image using the Canvas API
export async function resizeImage(file: File, width: number, height: number): Promise<Blob> {
	try {
		const img = await fileToImage(file);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');

		if (ctx) {
			ctx.drawImage(img, 0, 0, width, height);
			return new Promise((resolve, reject) => {
				canvas.toBlob((blob) => {
					if (blob) {
						resolve(blob);
					} else {
						reject(new Error('Failed to create blob from canvas'));
					}
				}, file.type);
			});
		} else {
			throw new Error('Failed to get canvas context');
		}
	} catch (err) {
		const message = `Error resizing image: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Save images dynamically based on publicEnv.IMAGE_SIZES
export async function saveImage(file: File, destination: string): Promise<string> {
	try {
		const metadata = await extractMetadata(file);
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const hash = await hashFileContent(await file.arrayBuffer());
		const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;

		// Path for the original image
		const originalPath = `${destination}/images/Original/${newFileName}`;
		logger.info(`Saving original image to ${originalPath}`);

		// Path for the thumbnail image
		const thumbnailPath = `${destination}/images/Thumbnails/${newFileName}`;
		logger.info(`Saving thumbnail image to ${thumbnailPath}`);

		// Create directories if they don't exist
		await fs.promises.mkdir(`${destination}/images/Original`, { recursive: true });
		await fs.promises.mkdir(`${destination}/images/Thumbnails`, { recursive: true });

		// Save the original image
		await fs.promises.writeFile(originalPath, Buffer.from(await file.arrayBuffer()));

		// Immediately generate and save the thumbnail
		const thumbnailBlob = await resizeImage(file, 150, 150); // Example thumbnail size
		await fs.promises.writeFile(thumbnailPath, Buffer.from(await thumbnailBlob.arrayBuffer()));

		// Now process other sizes in the background
		const imageSizes = Object.keys(publicEnv.IMAGE_SIZES).map((key) => ({
			name: key,
			width: publicEnv.IMAGE_SIZES[key],
			height: publicEnv.IMAGE_SIZES[key]
		}));

		// Check for valid size configurations
		if (!Array.isArray(imageSizes) || imageSizes.length === 0) {
			throw error(500, 'No valid image sizes specified in IMAGE_SIZES configuration.');
		}

		// Process each size asynchronously
		imageSizes.forEach(async (sizeConfig) => {
			const { name, width, height } = sizeConfig;
			if (!name || !width || !height) {
				throw error(500, 'Each size configuration must include name, width, and height.');
			}

			const resizedBlob = await resizeImage(file, width, height);
			const path = `${destination}/Images/${name}/${newFileName}`;

			// Log each resizing operation
			logger.info(`Saving ${name} image to ${path}`);

			// Save the resized file to the local filesystem
			await fs.promises.mkdir(`${destination}/Images/${name}`, { recursive: true });
			await fs.promises.writeFile(path, Buffer.from(await resizedBlob.arrayBuffer()));
		});

		return originalPath; // Return only the original path
	} catch (err) {
		const message = `Error saving image: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Save a document file
export async function saveDocument(file: File, destination: string): Promise<string> {
	try {
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const hash = await hashFileContent(await file.arrayBuffer());
		const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
		const fullPath = `${destination}/${newFileName}`;

		logger.info(`Saving document to ${fullPath}`);

		// Here you would typically use a file system API or cloud storage service to save the file

		return fullPath;
	} catch (err) {
		const message = `Error saving document: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Save an audio file
export async function saveAudio(file: File, destination: string): Promise<string> {
	try {
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const hash = await hashFileContent(await file.arrayBuffer());
		const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
		const fullPath = `${destination}/${newFileName}`;

		logger.info(`Saving audio to ${fullPath}`);

		return fullPath;
	} catch (err) {
		const message = `Error saving audio: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Save a video file
export async function saveVideo(file: File, destination: string): Promise<string> {
	try {
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const hash = await hashFileContent(await file.arrayBuffer());
		const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
		const fullPath = `${destination}/${newFileName}`;

		logger.info(`Saving video to ${fullPath}`);

		return fullPath;
	} catch (err) {
		const message = `Error saving video: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}
