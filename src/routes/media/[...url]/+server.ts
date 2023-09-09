import type { RequestHandler } from './$types';
import fs from 'fs';
import mime from 'mime-types';
import { PUBLIC_MEDIA_FOLDER } from '$env/static/public';
import zlib from 'zlib';

const cache = new Map<string, Buffer>();

export const GET: RequestHandler = async ({ params }) => {
	try {
		// Check if data is in cache
		let data = cache.get(params.url);
		if (!data) {
			// Read data from file and store in cache
			data = await fs.promises.readFile(`./${PUBLIC_MEDIA_FOLDER}/${params.url}`);
			cache.set(params.url, data);
		}
		// Compress data using Brotli
		const compressedData = zlib.brotliCompressSync(data);
		return new Response(compressedData, {
			headers: {
				'Content-Type': mime.lookup(params.url) as string,
				'Content-Encoding': 'br'
			}
		});
	} catch (err: any) {
		console.error(err);
		if (err.code === 'ENOENT') {
			return new Response('File not found', { status: 404 });
		} else if (err.code === 'EACCES') {
			return new Response('Access denied', { status: 403 });
		} else if (err.code === 'ERR_FS_FILE_TOO_LARGE') {
			return new Response('File too large', { status: 413 });
		} else if (err.code === 'EMFILE') {
			return new Response('Too many open files', { status: 500 });
		} else if (err.code === 'EBUSY') {
			return new Response('Resource busy or locked', { status: 500 });
		} else {
			return new Response('Internal server error', { status: 500 });
		}
	}
};
