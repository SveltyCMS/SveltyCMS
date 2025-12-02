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

	const contentType = response.headers.get('Content-Type');
	if (!contentType || !COMPRESSIBLE_TYPES.some((t) => contentType.includes(t))) {
		return response;
	}

	// We need to read the body to compress it.
	// Note: This buffers the response in memory. For very large files, streams are better,
	// but for API JSON responses, this is usually fine.
	const body = await response.arrayBuffer();

	if (body.byteLength < MIN_COMPRESSION_SIZE) {
		return response;
	}

	const acceptEncoding = event.request.headers.get('Accept-Encoding') || '';
	const buffer = Buffer.from(body);

	try {
		if (acceptEncoding.includes('br')) {
			const compressed = await brotli(buffer);
			return new Response(compressed, {
				headers: {
					...Object.fromEntries(response.headers),
					'Content-Encoding': 'br',
					'Content-Length': compressed.byteLength.toString(),
					Vary: 'Accept-Encoding'
				},
				status: response.status,
				statusText: response.statusText
			});
		} else if (acceptEncoding.includes('gzip')) {
			const compressed = await gzip(buffer);
			return new Response(compressed, {
				headers: {
					...Object.fromEntries(response.headers),
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
		// Return original response on failure
		return response;
	}

	return response;
};
