import { error } from '@sveltejs/kit';
import { existsSync, readdirSync, statSync, createReadStream } from 'fs';
import { join, basename } from 'path';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { l as logger } from '../../../../../chunks/logger.server.js';
const GET = async ({ url, locals }) => {
	try {
		if (!locals.user) {
			throw error(401, 'Authentication required');
		}
		if (locals.user.role !== 'admin') {
			throw error(403, 'Admin access required to download logs');
		}
		const type = url.searchParams.get('type') || 'latest';
		const format = url.searchParams.get('format') || 'text';
		const sinceParam = url.searchParams.get('since');
		const levelFilter = url.searchParams.get('level');
		if (!['latest', 'all', 'archive'].includes(type)) {
			throw error(400, 'Invalid type parameter. Must be: latest, all, or archive');
		}
		if (!['text', 'gzip'].includes(format)) {
			throw error(400, 'Invalid format parameter. Must be: text or gzip');
		}
		let sinceDate = null;
		if (sinceParam) {
			sinceDate = new Date(sinceParam);
			if (isNaN(sinceDate.getTime())) {
				throw error(400, 'Invalid since date format. Use ISO 8601 format');
			}
		}
		const logsDir = join(process.cwd(), 'logs');
		const logFiles = [];
		if (type === 'latest') {
			const latestLog = join(logsDir, 'app.log');
			if (existsSync(latestLog)) {
				logFiles.push(latestLog);
			}
		} else if (type === 'all') {
			if (existsSync(logsDir)) {
				const files = readdirSync(logsDir)
					.filter((f) => f.startsWith('app.log'))
					.map((f) => join(logsDir, f))
					.sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
				logFiles.push(...files);
			}
		} else if (type === 'archive') {
			if (existsSync(logsDir)) {
				const files = readdirSync(logsDir)
					.filter((f) => f.startsWith('app.log.') && f.endsWith('.gz'))
					.map((f) => join(logsDir, f))
					.sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
				logFiles.push(...files);
			}
		}
		if (logFiles.length === 0) {
			throw error(404, 'No log files found');
		}
		if (logFiles.length === 1 && format === 'text' && !logFiles[0].endsWith('.gz')) {
			const logFile = logFiles[0];
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
						'Content-Disposition': `attachment; filename="app-logs-${/* @__PURE__ */ new Date().toISOString().split('T')[0]}.txt"`,
						'Cache-Control': 'no-cache'
					}
				});
			}
			const stat = statSync(logFile);
			const stream = createReadStream(logFile);
			logger.info('Log download requested', {
				user: locals.user.email,
				type,
				format,
				fileSize: stat.size
			});
			return new Response(stream, {
				status: 200,
				headers: {
					'Content-Type': 'text/plain',
					'Content-Disposition': `attachment; filename="${basename(logFile)}"`,
					'Content-Length': stat.size.toString(),
					'Cache-Control': 'no-cache'
				}
			});
		}
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
			const buffer = Buffer.from(combinedLogs, 'utf-8');
			const compressed = await compressBuffer(buffer);
			return new Response(new Uint8Array(compressed), {
				status: 200,
				headers: {
					'Content-Type': 'application/gzip',
					'Content-Disposition': `attachment; filename="app-logs-${/* @__PURE__ */ new Date().toISOString().split('T')[0]}.log.gz"`,
					'Content-Encoding': 'gzip',
					'Cache-Control': 'no-cache'
				}
			});
		}
		return new Response(combinedLogs, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain',
				'Content-Disposition': `attachment; filename="app-logs-${/* @__PURE__ */ new Date().toISOString().split('T')[0]}.txt"`,
				'Cache-Control': 'no-cache'
			}
		});
	} catch (err) {
		if (err && typeof err === 'object' && 'status' in err) {
			throw err;
		}
		logger.error('Error downloading logs', { error: err });
		throw error(500, 'Failed to download logs');
	}
};
async function filterLogs(logFile, since, level) {
	const { readFile } = await import('fs/promises');
	const content = await readFile(logFile, 'utf-8');
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
	return filtered.join('\n');
}
async function combineLogs(logFiles, since, level) {
	const { readFile } = await import('fs/promises');
	const { createGunzip } = await import('zlib');
	const { Readable: Readable2 } = await import('stream');
	const allLogs = [];
	for (const file of logFiles) {
		try {
			let content;
			if (file.endsWith('.gz')) {
				const compressed = await readFile(file);
				const gunzip = createGunzip();
				const chunks = [];
				await pipeline(Readable2.from(compressed), gunzip, async function* (source) {
					for await (const chunk of source) {
						chunks.push(chunk);
						yield;
					}
				});
				content = Buffer.concat(chunks).toString('utf-8');
			} else {
				content = await readFile(file, 'utf-8');
			}
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
async function compressBuffer(buffer) {
	const gzip = createGzip();
	const chunks = [];
	await pipeline(Readable.from(buffer), gzip, async function* (source) {
		for await (const chunk of source) {
			chunks.push(chunk);
			yield;
		}
	});
	return Buffer.concat(chunks);
}
export { GET };
//# sourceMappingURL=_server.ts.js.map
