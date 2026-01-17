/**
 * @file src/routes/api/media/transform/[...path]/+server.ts
 * @description On-the-fly image transformation API endpoint.
 *
 * @example
 * /api/media/transform/path/to/image.jpg?w=800&h=600&fit=cover&q=80&format=webp
 *
 * @features
 * - Resizing (w, h)
 * - Cropping (fit: cover, contain, fill, inside, outside)
 * - Quality adjustment (q)
 * - Format conversion (format: jpeg, png, webp, avif)
 * - Caching headers for CDN and browser optimization
 */

import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '@shared/utils/logger.server';
import type { RequestHandler } from './$types';

const MEDIA_ROOT = path.resolve(process.cwd(), 'mediaFolder');

export const GET: RequestHandler = async ({ params, url }) => {
	const imagePath = params.path;
	const fullPath = path.join(MEDIA_ROOT, imagePath);

	try {
		// --- Security Check: Ensure path is within the media root ---
		if (!path.resolve(fullPath).startsWith(MEDIA_ROOT)) {
			throw error(403, 'Forbidden: Access outside of media folder is not allowed.');
		}

		// --- Read original image from storage ---
		const imageBuffer = await fs.readFile(fullPath);
		let transformer = sharp(imageBuffer);

		// --- Parse Transformation Parameters ---
		const width = url.searchParams.get('w') ? parseInt(url.searchParams.get('w')!, 10) : undefined;
		const height = url.searchParams.get('h') ? parseInt(url.searchParams.get('h')!, 10) : undefined;
		const quality = url.searchParams.get('q') ? parseInt(url.searchParams.get('q')!, 10) : 80;
		const fit = url.searchParams.get('fit') as keyof sharp.FitEnum | undefined;
		const format = url.searchParams.get('format') as keyof sharp.FormatEnum | undefined;

		// --- Parse Focal Point (e.g., ?focal=60,30 for 60% from left, 30% from top) ---
		const focalParam = url.searchParams.get('focal');
		let focalPosition: string | undefined;
		if (focalParam) {
			const [x, y] = focalParam.split(',').map(Number);
			if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
				// Sharp accepts position as percentage string for attention point
				focalPosition = `${x}% ${y}%`;
			}
		}

		// --- Apply Transformations ---
		if (width || height || fit) {
			transformer = transformer.resize(width, height, {
				fit: fit || 'cover',
				position: focalPosition || 'centre' // Use focal point if provided, else center
			});
		}

		// --- Apply Format Conversion ---
		let mimeType = `image/${format || 'jpeg'}`;
		if (format) {
			transformer = transformer.toFormat(format, { quality });
		} else if (fullPath.endsWith('.png')) {
			transformer = transformer.png({ quality });
			mimeType = 'image/png';
		} else if (fullPath.endsWith('.webp')) {
			transformer = transformer.webp({ quality });
			mimeType = 'image/webp';
		} else {
			transformer = transformer.jpeg({ quality });
			mimeType = 'image/jpeg';
		}

		// --- Generate Transformed Image Buffer ---
		const transformedBuffer = await transformer.toBuffer();

		// --- Return Response with Caching Headers ---
		return new Response(transformedBuffer as any, {
			headers: {
				'Content-Type': mimeType,
				'Content-Length': transformedBuffer.length.toString(),
				'Cache-Control': 'public, max-age=31536000, immutable' // Cache for 1 year
			}
		});
	} catch (err) {
		logger.error(`Failed to transform image at path: ${imagePath}`, err);

		if (err instanceof Error && (err as any).code === 'ENOENT') {
			throw error(404, 'Image not found.');
		}
		// Re-throw other framework errors
		if (err instanceof Error && 'status' in err) {
			throw err;
		}

		throw error(500, 'Error transforming image.');
	}
};
