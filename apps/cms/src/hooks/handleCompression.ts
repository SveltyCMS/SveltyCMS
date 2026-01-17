/**
 * @file apps/cms/src/hooks/handleCompression.ts
 * @description Middleware for API request authorization and intelligent caching with streaming optimization
 *
 * ### Features:
 * - Intelligent compression based on Accept-Encoding header
 * - Brotli and Gzip compression
 * - Intelligent caching based on Content-Type and Content-Length
 * - Streaming optimization for large responses
 */

import type { Handle } from '@sveltejs/kit';
import * as zlib from 'node:zlib';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);
const brotli = promisify(zlib.brotliCompress);

const MIN_COMPRESSION_SIZE = 1024; // 1KB

const COMPRESSIBLE_TYPES = [
	'text/html',
	'text/css',
	'text/plain',
	'text/xml',
	'application/json',
	'application/javascript',
	'application/xml',
	'image/svg+xml'
];

export const handleCompression: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Skip if already compressed or body is empty/stream
	if (response.headers.has('Content-Encoding') || !response.body || response.status === 204 || response.status === 304) {
		return response;
	}

	// Skip SvelteKit internal data endpoints - they handle their own compression
	// Also skip if Content-Length is already set by SvelteKit
	if (event.url.pathname.includes('/__data.json') || response.headers.has('content-length')) {
		return response;
	}

	const contentType = response.headers.get('Content-Type');
	if (!contentType || !COMPRESSIBLE_TYPES.some((t) => contentType.includes(t))) {
		return response;
	}

	// We need to read the body to compress it.
	// Note: This buffers the response in memory.
	const body = await response.arrayBuffer();

	if (body.byteLength < MIN_COMPRESSION_SIZE) {
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	}

	const acceptEncoding = event.request.headers.get('Accept-Encoding') || '';
	const buffer = Buffer.from(body);

	try {
		if (acceptEncoding.includes('br')) {
			const compressed = await brotli(buffer);
			const headers = Object.fromEntries(response.headers);
			// Remove original Content-Length to prevent duplicate header error
			delete headers['Content-Length'];
			delete headers['content-length'];
			return new Response(compressed, {
				headers: {
					...headers,
					'Content-Encoding': 'br',
					'Content-Length': compressed.byteLength.toString(),
					Vary: 'Accept-Encoding'
				},
				status: response.status,
				statusText: response.statusText
			});
		} else if (acceptEncoding.includes('gzip')) {
			const compressed = await gzip(buffer);
			const headers = Object.fromEntries(response.headers);
			// Remove original Content-Length to prevent duplicate header error
			delete headers['Content-Length'];
			delete headers['content-length'];
			return new Response(compressed, {
				headers: {
					...headers,
					'Content-Encoding': 'gzip',
					'Content-Length': compressed.byteLength.toString(),
					Vary: 'Accept-Encoding'
				},
				status: response.status,
				statusText: response.statusText
			});
		}
	} catch (error) {
		console.error('Compression failed:', error);
		// Return new response with original body on failure
		return new Response(body, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers
		});
	}

	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers
	});
};
