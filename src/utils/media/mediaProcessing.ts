/**
 * @file utils/media/mediaProcessing.ts
 * @description Handles media processing operations such as metadata extraction and thumbnail generation.
 */

import mime from 'mime-types';
import { sha256, removeExtension, sanitize } from '@src/utils/utils';

// System Logger
import { logger } from '@src/utils/logger';

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
	} catch (error) {
		logger.error('Error extracting image metadata:', error as Error);
		throw new Error('Failed to extract image metadata');
	}
}
// Hashes the content of a file using SHA-256
export async function hashFileContent(buffer: ArrayBuffer): Promise<string> {
	return (await sha256(Buffer.from(buffer))).slice(0, 20);
}

// Sanitizes the filename by removing unsafe characters
export function getSanitizedFileName(fileName: string): { fileNameWithoutExt: string; ext: string } {
	const { name, ext } = removeExtension(fileName);
	return { fileNameWithoutExt: sanitize(name), ext };
}

// Example of resizing an image using the Canvas API
export async function resizeImage(file: File, width: number, height: number): Promise<Blob> {
	const img = await fileToImage(file);
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (ctx) {
		ctx.drawImage(img, 0, 0, width, height);
	}
	return new Promise((resolve) => {
		canvas.toBlob((blob) => {
			if (blob) {
				resolve(blob);
			}
		}, file.type);
	});
}
