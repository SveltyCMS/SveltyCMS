import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { l as logger } from '../../../../../../chunks/logger.server.js';
const MEDIA_ROOT = path.resolve(process.cwd(), 'mediaFolder');
const GET = async ({ params, url }) => {
	const imagePath = params.path;
	const fullPath = path.join(MEDIA_ROOT, imagePath);
	try {
		if (!path.resolve(fullPath).startsWith(MEDIA_ROOT)) {
			throw error(403, 'Forbidden: Access outside of media folder is not allowed.');
		}
		const imageBuffer = await fs.readFile(fullPath);
		let transformer = sharp(imageBuffer);
		const width = url.searchParams.get('w') ? parseInt(url.searchParams.get('w'), 10) : void 0;
		const height = url.searchParams.get('h') ? parseInt(url.searchParams.get('h'), 10) : void 0;
		const quality = url.searchParams.get('q') ? parseInt(url.searchParams.get('q'), 10) : 80;
		const fit = url.searchParams.get('fit');
		const format = url.searchParams.get('format');
		const focalParam = url.searchParams.get('focal');
		let focalPosition;
		if (focalParam) {
			const [x, y] = focalParam.split(',').map(Number);
			if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
				focalPosition = `${x}% ${y}%`;
			}
		}
		if (width || height || fit) {
			transformer = transformer.resize(width, height, {
				fit: fit || 'cover',
				position: focalPosition || 'centre'
				// Use focal point if provided, else center
			});
		}
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
		const transformedBuffer = await transformer.toBuffer();
		return new Response(transformedBuffer, {
			headers: {
				'Content-Type': mimeType,
				'Content-Length': transformedBuffer.length.toString(),
				'Cache-Control': 'public, max-age=31536000, immutable'
				// Cache for 1 year
			}
		});
	} catch (err) {
		logger.error(`Failed to transform image at path: ${imagePath}`, err);
		if (err instanceof Error && err.code === 'ENOENT') {
			throw error(404, 'Image not found.');
		}
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Error transforming image.');
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
