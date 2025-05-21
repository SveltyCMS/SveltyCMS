/**
 * @file utils/media/mediaProcessing.ts
 * @description Handles media processing operations such as metadata extraction and thumbnail generation.
 */

import { publicEnv } from '@root/config/public';
import { error } from '@sveltejs/kit';
import mime from 'mime-types';
import { Buffer } from 'buffer';
import { sha256, sanitize } from '@utils/utils';
import { MediaTypeEnum } from './mediaModels';
import type { ImageMetadata, MediaImage, MediaAccess, Thumbnail } from './mediaModels';

// System Logger
import { logger } from '@utils/logger.svelte';

// Get fs instance for server-side operations
async function getFs() {
	if (!import.meta.env.SSR) {
		throw error(500, 'File operations can only be performed on the server');
	}
	const { default: fs } = await import('fs');
	return fs;
}

// Convert File to Image Element
async function fileToImage(file: File): Promise<HTMLImageElement> {
	if (!import.meta.env.SSR) {
		throw error(500, 'File operations can only be performed on the server');
	}

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
export async function extractMetadata(file: File): Promise<ImageMetadata> {
	if (!import.meta.env.SSR) {
		throw error(500, 'File operations can only be performed on the server');
	}

	try {
		const img = await fileToImage(file);
		const metadata: ImageMetadata = {
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
	if (!import.meta.env.SSR) {
		const message = 'File operations can only be performed on the server';
		logger.error(message);
		throw error(500, message);
	}

	if (!buffer || buffer.byteLength === 0) {
		const message = 'Cannot hash empty buffer';
		logger.error(message);
		throw error(400, message);
	}

	try {
		logger.debug('Starting file content hashing', {
			bufferSize: buffer.byteLength,
			firstBytes: new Uint8Array(buffer).slice(0, 4).join(',')
		});

		const hash = (await sha256(Buffer.from(buffer))).slice(0, 20);

		logger.debug('File content hashed successfully', {
			hash,
			hashLength: hash.length,
			bufferSize: buffer.byteLength
		});

		return hash;
	} catch (err) {
		const message = `Error hashing file content: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, {
			bufferSize: buffer?.byteLength,
			error: err
		});
		throw error(500, message);
	}
}

// Sanitizes the filename by removing unsafe characters
export function getSanitizedFileName(fileName: string): {
	fileNameWithoutExt: string;
	ext: string;
} {
	if (!fileName || typeof fileName !== 'string') {
		const message = 'Invalid filename provided';
		logger.error(message, { fileName });
		throw new Error(message);
	}

	logger.debug('Sanitizing filename', {
		originalName: fileName,
		length: fileName.length
	});

	const lastDotIndex = fileName.lastIndexOf('.');
	const name = lastDotIndex > -1 ? fileName.slice(0, lastDotIndex) : fileName;
	const ext = lastDotIndex > -1 ? fileName.slice(lastDotIndex + 1) : '';

	const sanitized = {
		fileNameWithoutExt: sanitize(name),
		ext: ext.toLowerCase() // Normalize extension to lowercase
	};

	logger.debug('Filename sanitized', {
		original: fileName,
		sanitizedName: sanitized.fileNameWithoutExt,
		extension: sanitized.ext,
		wasChanged: name !== sanitized.fileNameWithoutExt
	});

	return sanitized;
}

// Example of resizing an image using the Canvas API
export async function resizeImage(file: File, width: number, height: number): Promise<Blob> {
	if (!import.meta.env.SSR) {
		throw error(500, 'File operations can only be performed on the server');
	}

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
export async function saveImage(file: File, destination: string, userId: string, access: MediaAccess): Promise<MediaImage> {
	const startTime = performance.now();
	const fs = await getFs();

	logger.debug('Starting image save process', {
		fileName: file.name,
		fileSize: file.size,
		destination,
		userId,
		startTime
	});

	try {
		logger.debug('Extracting image metadata');
		const metadata = await extractMetadata(file);
		logger.debug('Image metadata extracted', {
			width: metadata.width,
			height: metadata.height,
			mimeType: metadata.mimeType,
			processingTime: performance.now() - startTime
		});

		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const hash = await hashFileContent(await file.arrayBuffer());
		const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
		logger.debug('Generated new filename', {
			newFileName,
			originalName: file.name,
			hashLength: hash.length
		});

		// Path for the original image
		const originalPath = Path.join(destination, 'images', 'Original', newFileName);
		logger.info('Saving original image', {
			path: originalPath,
			fileSize: file.size
		});

		// Path for the thumbnail image
		const thumbnailPath = Path.join(destination, 'images', 'Thumbnails', newFileName);
		logger.info('Saving thumbnail image', {
			path: thumbnailPath,
			thumbnailSize: '150x150'
		});

		// Create directories if they don't exist
		logger.debug('Creating directories for image storage');
		await fs.promises.mkdir(Path.dirname(originalPath), { recursive: true });
		await fs.promises.mkdir(Path.dirname(thumbnailPath), { recursive: true });
		logger.debug('Directories created successfully', {
			directoriesCreated: [Path.dirname(originalPath), Path.dirname(thumbnailPath)]
		});

		// Save the original image
		logger.debug('Saving original image file');
		const originalBuffer = Buffer.from(await file.arrayBuffer());
		await fs.promises.writeFile(originalPath, originalBuffer);
		logger.debug('Original image saved successfully', {
			path: originalPath,
			bytesWritten: originalBuffer.length
		});

		// Immediately generate and save the thumbnail
		logger.debug('Generating thumbnail image');
		const thumbnailBlob = await resizeImage(file, 150, 150);
		const thumbnailBuffer = Buffer.from(await thumbnailBlob.arrayBuffer());
		logger.debug('Saving thumbnail image file');
		await fs.promises.writeFile(thumbnailPath, thumbnailBuffer);
		logger.debug('Thumbnail image saved successfully', {
			path: thumbnailPath,
			bytesWritten: thumbnailBuffer.length
		});

		const thumbnailData: Thumbnail = {
			url: thumbnailPath,
			width: 150,
			height: 150,
			size: thumbnailBuffer.length
		};

		// Now process other sizes in the background
		const imageSizes = (Object.keys(publicEnv.IMAGE_SIZES) as Array<keyof typeof publicEnv.IMAGE_SIZES>).map((key) => ({
			name: key,
			width: publicEnv.IMAGE_SIZES[key],
			height: publicEnv.IMAGE_SIZES[key]
		}));

		const thumbnails: Record<string, Thumbnail> = {};

		// Process each size
		for (const { name, width, height } of imageSizes) {
			try {
				if (!width || !height) {
					const errorMessage = `Invalid size configuration for ${name}: width=${width}, height=${height}`;
					logger.error(errorMessage);
					throw error(500, errorMessage);
				}

				logger.debug(`Processing image size: ${name} (${width}x${height})`);
				const resizedBlob = await resizeImage(file, width, height);
				const path = Path.join(destination, 'images', name, newFileName);
				await fs.promises.mkdir(Path.dirname(path), { recursive: true });
				const resizedBuffer = Buffer.from(await resizedBlob.arrayBuffer());
				await fs.promises.writeFile(path, resizedBuffer);

				thumbnails[name] = {
					url: path,
					width,
					height,
					size: resizedBuffer.length
				};

				logger.info(`Processed image size: ${name}`, {
					path,
					dimensions: `${width}x${height}`,
					size: resizedBuffer.length
				});
			} catch (err) {
				const errorMessage = `Error processing size ${name}: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(errorMessage, {
					size: name,
					error: err,
					stack: new Error().stack
				});
				// Continue with other sizes even if one fails
			}
		}

		const fileInfo: MediaImage = {
			url: originalPath,
			type: MediaTypeEnum.IMAGE,
			name: file.name,
			size: file.size,
			mimeType: file.type,
			width: metadata.width,
			height: metadata.height,
			thumbnails: {
				...thumbnails,
				thumbnail: thumbnailData
			},
			createdAt: new Date(),
			updatedAt: new Date(),
			userId,
			access,
			hash,
			processingTime: performance.now() - startTime
		};

		logger.info('Image saved successfully', {
			fileName: file.name,
			url: originalPath,
			thumbnailUrl: thumbnailPath,
			totalProcessingTime: performance.now() - startTime,
			processedSizes: Object.keys(thumbnails)
		});

		return fileInfo;
	} catch (err) {
		const message = `Error saving image: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, {
			fileName: file.name,
			error: err,
			stack: new Error().stack,
			processingTime: performance.now() - startTime
		});
		throw error(500, message);
	}
}

// Save a document file
export async function saveDocument(file: File, destination: string): Promise<string> {
	const fs = await getFs();

	try {
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const hash = await hashFileContent(await file.arrayBuffer());
		const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
		const fullPath = `${destination}/${newFileName}`;

		logger.info(`Saving document to ${fullPath}`);

		// Here you would typically use a file system API or cloud storage service to save the file
		await fs.promises.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

		return fullPath;
	} catch (err) {
		const message = `Error saving document: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Save an audio file
export async function saveAudio(file: File, destination: string): Promise<string> {
	const fs = await getFs();

	try {
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const hash = await hashFileContent(await file.arrayBuffer());
		const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
		const fullPath = `${destination}/${newFileName}`;

		logger.info(`Saving audio to ${fullPath}`);

		await fs.promises.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

		return fullPath;
	} catch (err) {
		const message = `Error saving audio: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}

// Save a video file
export async function saveVideo(file: File, destination: string): Promise<string> {
	const fs = await getFs();

	try {
		const { fileNameWithoutExt, ext } = getSanitizedFileName(file.name);
		const hash = await hashFileContent(await file.arrayBuffer());
		const newFileName = `${fileNameWithoutExt}-${hash}${ext}`;
		const fullPath = `${destination}/${newFileName}`;

		logger.info(`Saving video to ${fullPath}`);

		await fs.promises.writeFile(fullPath, Buffer.from(await file.arrayBuffer()));

		return fullPath;
	} catch (err) {
		const message = `Error saving video: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}
