/**
 * @file src/routes/api/media/bulk-download/+server.ts
 * @description API endpoint for bulk downloading multiple media files as TAR.GZ archive
 *
 * @example POST /api/media/bulk-download
 *
 * Features:
 * - Downloads multiple files as compressed archive
 * - Uses Node.js built-in modules (no external packages)
 * - Streaming for efficient memory usage
 * - Automatic cleanup of temporary files
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createBulkDownloadArchive, streamArchiveToResponse, cleanupArchive } from '@utils/media/bulkDownload';
import { dbAdapter } from '@src/databases/db';
import { logger } from '@utils/logger.server';
import type { MediaItem } from '@src/databases/dbInterface';

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, tenantId } = locals;

	try {
		// Authentication check
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		// Parse request body
		const body = await request.json();
		const { fileIds } = body;

		if (!Array.isArray(fileIds) || fileIds.length === 0) {
			throw error(400, 'Invalid request: fileIds array is required');
		}

		logger.info('Bulk download requested', {
			userId: user._id,
			fileCount: fileIds.length,
			tenantId
		});

		// Fetch files from database
		if (!dbAdapter) {
			throw error(500, 'Database not available');
		}

		const filesPromises = fileIds.map(async (id) => {
			if (!dbAdapter) return null;
			const result = await dbAdapter.crud.findOne<MediaItem>('MediaItem', { _id: id });
			if (result.success && result.data) {
				return result.data;
			}
			return null;
		});

		const files = (await Promise.all(filesPromises)).filter(Boolean) as MediaItem[];
		if (files.length === 0) {
			throw error(404, 'No files found');
		}

		logger.debug('Files fetched for bulk download', {
			requested: fileIds.length,
			found: files.length
		});

		// Create archive
		const outputDir = '/tmp/archives';
		const archive = await createBulkDownloadArchive(files as unknown as import('@utils/media/mediaModels').MediaBase[], outputDir);
		logger.info('Archive created successfully', {
			path: archive.path,
			size: archive.size,
			filename: archive.filename
		});

		// Stream to response
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const setHeader = (_name: string, _value: string) => {
			// Headers will be set in Response constructor
		};
		const stream = await streamArchiveToResponse(archive.path, archive.filename, setHeader); // Schedule cleanup after stream ends
		setTimeout(() => {
			cleanupArchive(archive.path).catch((err) => {
				logger.warn('Failed to cleanup archive', { error: err, path: archive.path });
			});
		}, 5000); // Cleanup after 5 seconds

		return new Response(stream, {
			headers: {
				'Content-Type': 'application/gzip',
				'Content-Disposition': `attachment; filename="${archive.filename}"`,
				'Content-Length': archive.size.toString()
			}
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status: number }).status : 500;

		logger.error('Bulk download failed', {
			error: message,
			userId: user?._id,
			tenantId
		});

		throw error(status, message);
	}
};
