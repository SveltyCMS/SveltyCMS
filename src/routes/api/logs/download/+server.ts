/**
 * @file src/routes/api/logs/download/+server.ts
 * @description API endpoint to download error logs from the server
 *
 * This endpoint allows administrators to download server error logs for troubleshooting.
 * Supports filtering by date range and log level, and can return logs in plain text or compressed format.
 *
 * Query Parameters:
 * - type: 'latest' | 'all' | 'archive' (default: 'latest')
 * - format: 'text' | 'gzip' (default: 'text')
 * - since: ISO date string (optional, filter logs after this date)
 * - level: 'error' | 'warn' | 'fatal' (optional, filter by log level)
 *
 * Authorization: Requires admin role
 */

import { error as svelteError } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream, existsSync, statSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import logger from '@utils/logger.server';

/**
 * Download error logs from the server
 * GET /api/logs/download
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		// Check authentication and authorization
		if (!locals.user) {
			throw svelteError(401, 'Authentication required');
		}

		if (locals.user.role !== 'admin') {
			throw svelteError(403, 'Admin access required to download logs');
		}

		// Get query parameters
		const type = url.searchParams.get('type') || 'latest';
		const format = url.searchParams.get('format') || 'text';
		const sinceParam = url.searchParams.get('since');
		const levelFilter = url.searchParams.get('level');

		// Validate parameters
		if (!['latest', 'all', 'archive'].includes(type)) {
			throw svelteError(400, 'Invalid type parameter. Must be: latest, all, or archive');
		}

		if (!['text', 'gzip'].includes(format)) {
			throw svelteError(400, 'Invalid format parameter. Must be: text or gzip');
		}

		// Parse since date if provided
		let sinceDate: Date | null = null;
		if (sinceParam) {
			sinceDate = new Date(sinceParam);
			if (isNaN(sinceDate.getTime())) {
				throw svelteError(400, 'Invalid since date format. Use ISO 8601 format');
			}
		}

		// Determine log file path
		const logsDir = join(process.cwd(), 'logs');
		const logFiles: string[] = [];

		if (type === 'latest') {
			const latestLog = join(logsDir, 'app.log');
			if (existsSync(latestLog)) {
				logFiles.push(latestLog);
			}
		} else if (type === 'all') {
			// Get all log files (current + rotated)
			if (existsSync(logsDir)) {
				const files = readdirSync(logsDir)
					.filter((f) => f.startsWith('app.log'))
					.map((f) => join(logsDir, f))
					.sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime()); // Most recent first
				logFiles.push(...files);
			}
		} else if (type === 'archive') {
			// Get only rotated/archived logs (compressed)
			if (existsSync(logsDir)) {
				const files = readdirSync(logsDir)
					.filter((f) => f.startsWith('app.log.') && f.endsWith('.gz'))
					.map((f) => join(logsDir, f))
					.sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
				logFiles.push(...files);
			}
		}

		if (logFiles.length === 0) {
			throw svelteError(404, 'No log files found');
		}

		// If single file and format is text, stream it directly
		if (logFiles.length === 1 && format === 'text' && !logFiles[0].endsWith('.gz')) {
			const logFile = logFiles[0];

			// Apply filters if needed
			if (sinceDate || levelFilter) {
				const filteredLogs = await filterLogs(logFile, sinceDate, levelFilter);

				logger.info('Log download requested', {
					user: locals.user.email,
					type,
					format,
					filters: { since: sinceParam, level: levelFilter },
					linesReturned: filteredLogs.split('\n').length
				});

				return new Response(filteredLogs, {
					status: 200,
					headers: {
						'Content-Type': 'text/plain',
						'Content-Disposition': `attachment; filename="app-logs-${new Date().toISOString().split('T')[0]}.txt"`,
						'Cache-Control': 'no-cache'
					}
				});
			}

			// No filters - stream entire file
			const stat = statSync(logFile);
			const stream = createReadStream(logFile);

			logger.info('Log download requested', {
				user: locals.user.email,
				type,
				format,
				fileSize: stat.size
			});

			return new Response(stream as unknown as BodyInit, {
				status: 200,
				headers: {
					'Content-Type': 'text/plain',
					'Content-Disposition': `attachment; filename="${basename(logFile)}"`,
					'Content-Length': stat.size.toString(),
					'Cache-Control': 'no-cache'
				}
			});
		}

		// Multiple files or gzip format requested - combine and compress
		const combinedLogs = await combineLogs(logFiles, sinceDate, levelFilter);

		logger.info('Log download requested', {
			user: locals.user.email,
			type,
			format,
			files: logFiles.length,
			filters: { since: sinceParam, level: levelFilter },
			linesReturned: combinedLogs.split('\n').length
		});

		if (format === 'gzip') {
			// Compress logs
			const buffer = Buffer.from(combinedLogs, 'utf-8');
			const compressed = await compressBuffer(buffer);

			return new Response(compressed, {
				status: 200,
				headers: {
					'Content-Type': 'application/gzip',
					'Content-Disposition': `attachment; filename="app-logs-${new Date().toISOString().split('T')[0]}.log.gz"`,
					'Content-Encoding': 'gzip',
					'Cache-Control': 'no-cache'
				}
			});
		}

		// Return as text
		return new Response(combinedLogs, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain',
				'Content-Disposition': `attachment; filename="app-logs-${new Date().toISOString().split('T')[0]}.txt"`,
				'Cache-Control': 'no-cache'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err; // Re-throw SvelteKit errors
		}

		logger.error('Error downloading logs', { error: err });
		throw svelteError(500, 'Failed to download logs');
	}
};

// Filter logs by date and/or level
async function filterLogs(logFile: string, since: Date | null, level: string | null): Promise<string> {
	const { readFile } = await import('fs/promises');
	const content = await readFile(logFile, 'utf-8');
	const lines = content.split('\n');

	const filtered = lines.filter((line) => {
		if (!line.trim()) return false;

		try {
			// Try to parse as JSON (structured logs)
			const log = JSON.parse(line);

			// Filter by date
			if (since && log.timestamp) {
				const logDate = new Date(log.timestamp);
				if (logDate < since) return false;
			}

			// Filter by level
			if (level && log.level) {
				if (log.level.toLowerCase() !== level.toLowerCase()) return false;
			}

			return true;
		} catch {
			// Not JSON - include line if it contains error-related keywords when level filter is set
			if (level) {
				const lowerLine = line.toLowerCase();
				return lowerLine.includes(level.toLowerCase());
			}
			return true;
		}
	});

	return filtered.join('\n');
}

// Combine multiple log files
async function combineLogs(logFiles: string[], since: Date | null, level: string | null): Promise<string> {
	const { readFile } = await import('fs/promises');
	const { createGunzip } = await import('zlib');
	const { Readable } = await import('stream');

	const allLogs: string[] = [];

	for (const file of logFiles) {
		try {
			let content: string;

			if (file.endsWith('.gz')) {
				// Decompress gzipped logs
				const compressed = await readFile(file);
				const gunzip = createGunzip();
				const chunks: Buffer[] = [];

				await pipeline(Readable.from(compressed), gunzip, async function* (source) {
					for await (const chunk of source) {
						chunks.push(chunk);
						yield; // Satisfy generator requirement
					}
				});

				content = Buffer.concat(chunks).toString('utf-8');
			} else {
				content = await readFile(file, 'utf-8');
			}

			// Apply filters if needed
			if (since || level) {
				const lines = content.split('\n');
				const filtered = lines.filter((line) => {
					if (!line.trim()) return false;

					try {
						const log = JSON.parse(line);

						if (since && log.timestamp) {
							const logDate = new Date(log.timestamp);
							if (logDate < since) return false;
						}

						if (level && log.level) {
							if (log.level.toLowerCase() !== level.toLowerCase()) return false;
						}

						return true;
					} catch {
						if (level) {
							const lowerLine = line.toLowerCase();
							return lowerLine.includes(level.toLowerCase());
						}
						return true;
					}
				});

				allLogs.push(...filtered);
			} else {
				allLogs.push(content);
			}
		} catch (err) {
			logger.warn(`Failed to read log file: ${file}`, { error: err });
		}
	}

	return allLogs.join('\n');
}

// Compress buffer to gzip
async function compressBuffer(buffer: Buffer): Promise<Buffer> {
	const gzip = createGzip();
	const chunks: Buffer[] = [];

	await pipeline(Readable.from(buffer), gzip, async function* (source) {
		for await (const chunk of source) {
			chunks.push(chunk);
			yield; // Satisfy generator requirement
		}
	});

	return Buffer.concat(chunks);
}
