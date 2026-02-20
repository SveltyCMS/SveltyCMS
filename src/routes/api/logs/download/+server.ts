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

// type RequestHandler removed
// error removed
import { createReadStream, existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
/**
 * Download error logs from the server
 * GET /api/logs/download
 */
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';

/**
 * Download error logs from the server
 * GET /api/logs/download
 */
export const GET = apiHandler(async ({ url, locals }) => {
	try {
		// Check authentication and authorization
		if (!locals.user) {
			throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
		}

		if (locals.user.role !== 'admin') {
			throw new AppError('Admin access required to download logs', 403, 'FORBIDDEN');
		}

		// Get query parameters
		const type = url.searchParams.get('type') || 'latest';
		const format = url.searchParams.get('format') || 'text';
		const sinceParam = url.searchParams.get('since');
		const levelFilter = url.searchParams.get('level');

		// Validate parameters
		if (!['latest', 'all', 'archive'].includes(type)) {
			throw new AppError('Invalid type parameter. Must be: latest, all, or archive', 400, 'INVALID_PARAM');
		}

		if (!['text', 'gzip'].includes(format)) {
			throw new AppError('Invalid format parameter. Must be: text or gzip', 400, 'INVALID_PARAM');
		}

		// Parse since date if provided
		let sinceDate: Date | null = null;
		if (sinceParam) {
			sinceDate = new Date(sinceParam);
			if (Number.isNaN(sinceDate.getTime())) {
				throw new AppError('Invalid since date format. Use ISO 8601 format', 400, 'INVALID_PARAM');
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
			throw new AppError('No log files found', 404, 'NOT_FOUND');
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

			return new Response(new Uint8Array(compressed), {
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
		if (err instanceof AppError) {
			throw err;
		}
		logger.error('Error downloading logs', { error: err });
		throw new AppError('Failed to download logs', 500, 'DOWNLOAD_FAILED');
	}
});

// Filter logs by date and/or level
async function filterLogs(logFile: string, since: Date | null, level: string | null): Promise<string> {
	const { readFile } = await import('node:fs/promises');
	const content = await readFile(logFile, 'utf-8');
	const lines = content.split('\n');

	const filtered = lines.filter((line) => {
		if (!line.trim()) {
			return false;
		}

		try {
			// Try to parse as JSON (structured logs)
			const log = JSON.parse(line);

			// Filter by date
			if (since && log.timestamp) {
				const logDate = new Date(log.timestamp);
				if (logDate < since) {
					return false;
				}
			}

			// Filter by level
			if (level && log.level && log.level.toLowerCase() !== level.toLowerCase()) {
				return false;
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
	const { readFile } = await import('node:fs/promises');
	const { createGunzip } = await import('node:zlib');
	const { Readable } = await import('node:stream');

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
					if (!line.trim()) {
						return false;
					}

					try {
						const log = JSON.parse(line);

						if (since && log.timestamp) {
							const logDate = new Date(log.timestamp);
							if (logDate < since) {
								return false;
							}
						}

						if (level && log.level && log.level.toLowerCase() !== level.toLowerCase()) {
							return false;
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
