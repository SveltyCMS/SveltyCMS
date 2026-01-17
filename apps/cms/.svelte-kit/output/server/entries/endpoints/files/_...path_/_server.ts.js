import { error, redirect } from '@sveltejs/kit';
import { getPublicSettingSync } from '../../../../chunks/settingsService.js';
import { l as logger } from '../../../../chunks/logger.server.js';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { lookup } from 'mime-types';
const GET = async ({ params, request }) => {
	try {
		const filePath = params.path;
		if (!filePath) {
			logger.warn('File request missing path');
			throw error(400, 'File path is required');
		}
		const storageType = getPublicSettingSync('MEDIA_STORAGE_TYPE');
		if (storageType !== 'local') {
			const cloudUrl = getPublicSettingSync('MEDIA_CLOUD_PUBLIC_URL') || getPublicSettingSync('MEDIASERVER_URL');
			if (cloudUrl) {
				const mediaFolder2 = getPublicSettingSync('MEDIA_FOLDER') || '';
				const normalizedFolder = mediaFolder2.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\/+$/, '');
				const baseUrl = cloudUrl.replace(/\/+$/, '');
				const fullUrl = normalizedFolder ? `${baseUrl}/${normalizedFolder}/${filePath}` : `${baseUrl}/${filePath}`;
				logger.debug('Redirecting to cloud storage', { filePath, cloudUrl: fullUrl });
				throw redirect(307, fullUrl);
			} else {
				logger.error('Cloud storage configured but no public URL available', { storageType });
				throw error(500, 'Cloud storage URL not configured');
			}
		}
		const mediaFolder = getPublicSettingSync('MEDIA_FOLDER');
		console.log('Files Route Debug:', { mediaFolder, filePath, storageType });
		if (!mediaFolder) {
			logger.error('MEDIA_FOLDER not configured');
			throw error(500, 'Media storage not configured');
		}
		const normalizedMediaFolder = mediaFolder.replace(/^\.\//, '').replace(/^\/+/, '');
		const fullPath = path.join(process.cwd(), normalizedMediaFolder, filePath);
		console.log('Files Route resolving:', fullPath);
		const resolvedPath = path.resolve(fullPath);
		const allowedBasePath = path.resolve(process.cwd(), normalizedMediaFolder);
		if (!resolvedPath.startsWith(allowedBasePath)) {
			logger.warn('Directory traversal attempt detected', { requestedPath: filePath, resolvedPath });
			throw error(403, 'Access denied');
		}
		const stats = await stat(resolvedPath);
		if (!stats.isFile()) {
			throw error(400, 'Invalid file request');
		}
		const lastModified = stats.mtime.toUTCString();
		if (request.headers.get('if-modified-since') === lastModified) {
			return new Response(null, { status: 304 });
		}
		const mimeType = lookup(resolvedPath) || 'application/octet-stream';
		const nodeStream = createReadStream(resolvedPath);
		const stream = Readable.toWeb(nodeStream);
		return new Response(stream, {
			status: 200,
			headers: {
				'Content-Type': mimeType,
				'Content-Length': stats.size.toString(),
				'Cache-Control': 'public, max-age=31536000, immutable',
				'Last-Modified': lastModified
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		if (err.code === 'ENOENT') {
			logger.debug('File not found', { path: params.path });
			throw error(404, 'File not found');
		}
		logger.error('Error serving file', { error: err, path: params.path });
		throw error(500, 'Failed to serve file');
	}
};
export { GET };
//# sourceMappingURL=_server.ts.js.map
