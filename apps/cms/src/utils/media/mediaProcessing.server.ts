/**
 * @file utils/media/mediaProcessing.server.ts
 * @description Server-side media processing operations using Sharp and Node.js crypto.
 *
 * Features:
 * - File content hashing using SHA-256
 * - Image metadata extraction using Sharp
 */

import { error } from '@sveltejs/kit';

import { Buffer } from 'buffer';

import { sha256 } from '@utils/utils';

import type { Metadata } from 'sharp';

// System Logger

import { logger } from '@utils/logger.server';

// Hashes the content of a file using SHA-256

export async function hashFileContent(buffer: ArrayBuffer | Buffer): Promise<string> {
	if (!buffer || buffer.byteLength === 0) {
		const message = 'Cannot hash empty buffer';

		logger.error(message);

		throw error(400, message);
	}

	try {
		logger.trace('Starting file content hashing', {
			fileSize: buffer.byteLength,

			algorithm: 'SHA-256'
		});

		// Convert Buffer to ArrayBuffer if needed

		// sha256 expects ArrayBuffer, so we need to extract the underlying ArrayBuffer

		const arrayBuffer = buffer instanceof Buffer ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) : buffer;

		// Ensure we have an ArrayBuffer, not SharedArrayBuffer

		let finalBuffer: ArrayBuffer;

		if (arrayBuffer instanceof ArrayBuffer) {
			finalBuffer = arrayBuffer as ArrayBuffer;
		} else if (arrayBuffer instanceof SharedArrayBuffer) {
			// Convert SharedArrayBuffer to ArrayBuffer

			finalBuffer = new ArrayBuffer(arrayBuffer.byteLength);

			new Uint8Array(finalBuffer).set(new Uint8Array(arrayBuffer));
		} else {
			// Fallback for other ArrayLike types

			finalBuffer = new Uint8Array(arrayBuffer as ArrayLike<number>).buffer;
		}

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

export async function extractMetadata(buffer: Buffer): Promise<Metadata> {
	try {
		const { default: Sharp } = await import('sharp');

		const sharpInstance = Sharp(buffer);

		const metadata = await sharpInstance.metadata();

		return metadata;
	} catch (err) {
		const message = `Error extracting metadata: ${err instanceof Error ? err.message : String(err)}`;

		logger.error(message, {
			bufferSize: buffer?.length,

			error: err
		});

		throw error(500, message);
	}
}
