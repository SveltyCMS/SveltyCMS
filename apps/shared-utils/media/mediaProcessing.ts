/**
 * @file utils/media/mediaProcessing.ts
 * @description Handles media processing operations such as hashing and sanitization.
 * Server-side (Sharp-based) processing is in mediaStorage.ts.
 * Client-side (Canvas-based) processing should be in a separate .client.ts file.
 *
 * Features:
 * - File content hashing using SHA-256
 * - Filename sanitization to remove unsafe characters
 */

import { error } from '@sveltejs/kit';
import { Buffer } from 'buffer';
import { sha256, sanitize } from '@utils/utils';

// System Logger
import { logger } from '@utils/logger.server';

// Hashes the content of a file using SHA-256
export async function hashFileContent(buffer: ArrayBuffer | Buffer): Promise<string> {
	if (!import.meta.env.SSR) {
		const message = 'hashFileContent can only be performed on the server';
		logger.error(message);
		throw error(500, message);
	}

	if (!buffer || buffer.byteLength === 0) {
		const message = 'Cannot hash empty buffer';
		logger.error(message);
		throw error(400, message);
	}

	try {
		logger.trace('Starting file content hashing', {
			fileSize: buffer.byteLength, // <-- FIX: Use byteLength
			algorithm: 'SHA-256'
		});

		// Convert Buffer to ArrayBuffer if needed
		// sha256 expects ArrayBuffer, so we need to extract the underlying ArrayBuffer
		const arrayBuffer = buffer instanceof Buffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;

		// Ensure we have an ArrayBuffer, not SharedArrayBuffer
		const finalBuffer = arrayBuffer instanceof ArrayBuffer ? arrayBuffer : new Uint8Array(arrayBuffer).buffer;

		const hash = (await sha256(finalBuffer)).slice(0, 20);

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

	const lastDotIndex = fileName.lastIndexOf('.');
	const name = lastDotIndex > -1 ? fileName.slice(0, lastDotIndex) : fileName;
	const ext = lastDotIndex > -1 ? fileName.slice(lastDotIndex + 1) : '';

	logger.trace('Sanitizing filename', {
		original: fileName,
		nameWithoutExt: name,
		extension: ext
	});

	const sanitized = {
		fileNameWithoutExt: sanitize(name),
		ext: ext.toLowerCase() // Normalize extension to lowercase
	};

	logger.trace('Filename sanitized', {
		original: fileName,
		sanitizedName: sanitized.fileNameWithoutExt,
		normalizedExt: sanitized.ext
	});
	return sanitized;
}

/**
 * Extracts metadata from an image buffer using Sharp
 * @param buffer - The image buffer to extract metadata from
 * @returns Sharp metadata object containing image information
 */
export async function extractMetadata(buffer: Buffer): Promise<any> {
	if (!import.meta.env.SSR) {
		const message = 'extractMetadata can only be performed on the server';
		logger.error(message);
		throw error(500, message);
	}

	try {
		// Dynamic import of Sharp (server-side only)
		const Sharp = (await import('sharp')).default;
		const sharpInstance = Sharp(buffer);
		const metadata = await sharpInstance.metadata();
		return metadata;
	} catch (err) {
		const message = `Error extracting metadata: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, message);
	}
}
