/**
 * @file src/routes/api/dashboard/logs/+server.ts
 * @description Optimized API endpoint for system logs with Reverse Reading and ANSI support.
 *
 * @example GET /api/dashboard/logs?limit=20&level=all&search=&page=1
 *
 * Features:
 * - **Secure Authorization:** Access is controlled centrally by `src/hooks.server.ts`.
 * - **Reverse Reading:** Reads plaintext logs from the end of the file (newest first).
 * - **Early Exit:** Stops processing files once the requested page/limit is satisfied.
 * - **Memory Efficient:** No longer loads entire files into RAM.
 */

import { publicEnv } from '@src/stores/globalSettings.svelte';
import { error, json } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createBrotliDecompress, createGunzip } from 'node:zlib';
import type { RequestHandler } from './$types';

// System Logger
import { logger } from '@utils/logger.server';
import type { ISODateString } from '@src/content/types';

// Validation
import * as v from 'valibot';

const QuerySchema = v.object({
	level: v.optional(v.string(), 'all'),
	search: v.optional(v.string(), ''),
	startDate: v.optional(v.string()),
	endDate: v.optional(v.string()),
	page: v.optional(v.pipe(v.number(), v.minValue(1)), 1),
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(100)), 20)
});

const LogEntrySchema = v.object({
	timestamp: v.string() as v.BaseSchema<ISODateString>,
	level: v.string(),
	message: v.string(),
	messageHtml: v.string(),
	args: v.array(v.unknown())
});

// ANSI color code mappings to CSS colors
const ANSI_COLOR_MAP: Record<string, string> = {
	'30': '#000000', // black
	'31': '#dc2626', // red
	'32': '#16a34a', // green
	'33': '#ca8a04', // yellow
	'34': '#2563eb', // blue
	'35': '#9333ea', // magenta
	'36': '#0891b2', // cyan
	'37': '#374151', // white/gray
	'90': '#6b7280', // bright black/gray
	'91': '#ef4444', // bright red
	'92': '#22c55e', // bright green
	'93': '#eab308', // bright yellow
	'94': '#3b82f6', // bright blue
	'95': '#a855f7', // bright magenta
	'96': '#06b6d4', // bright cyan
	'97': '#f9fafb' // bright white
};

interface RawLogEntry {
	timestamp: ISODateString;
	level: string;
	message: string;
	messageHtml: string;
	args: unknown[];
}

// Converts ANSI escape sequences to HTML spans with inline CSS colors
function convertAnsiToHtml(text: string): string {
	let result = '';
	let currentPos = 0;
	const openTags: string[] = [];
	const ansiRegex = /\[(\d+)m/g;
	let match;

	while ((match = ansiRegex.exec(text)) !== null) {
		result += text.substring(currentPos, match.index);
		const code = match[1];

		if (code === '0') {
			while (openTags.length > 0) {
				result += '</span>';
				openTags.pop();
			}
		} else {
			const color = ANSI_COLOR_MAP[code];
			if (color) {
				const isBold = ['1', '91', '92', '93', '94', '95', '96', '97'].includes(code);
				result += `<span style="color: ${color}; font-weight: ${isBold ? 'bold' : 'normal'};">`;
				openTags.push('color');
			} else if (code === '1') {
				result += '<span style="font-weight: bold;">';
				openTags.push('bold');
			} else if (code === '4') {
				result += '<span style="text-decoration: underline;">';
				openTags.push('underline');
			}
		}
		currentPos = match.index + match[0].length;
	}
	result += text.substring(currentPos);
	while (openTags.length > 0) {
		result += '</span>';
		openTags.pop();
	}
	return result;
}
// Parses a log line with ANSI color support
const parseLogLineWithColors = (line: string): RawLogEntry | null => {
	const regex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([^\]]+)\]\s+(.*)$/;
	const match = line.match(regex);

	if (!match) {
		// Fallback parsing
		const simpleRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)?\s*(?:\[([^\]]+)\])?\s*\[([A-Z]+)\](?::\s*)?(.*)$/;
		const simpleMatch = line.match(simpleRegex);

		if (simpleMatch) {
			const [, timestamp, , level, message] = simpleMatch;
			const cleanMessage = message || line;
			return {
				timestamp: (timestamp || new Date().toISOString()) as ISODateString,
				level: level || 'INFO',
				message: cleanMessage.replace(/\[\d+(?:;\d+)*m/g, ''),
				messageHtml: convertAnsiToHtml(cleanMessage),
				args: []
			};
		}
		return {
			timestamp: new Date().toISOString() as ISODateString,
			level: 'INFO',
			message: line.replace(/\[\d+(?:;\d+)*m/g, ''),
			messageHtml: convertAnsiToHtml(line),
			args: []
		};
	}

	const [, timestamp, level, contentPart] = match;
	let message = contentPart.trim();
	let args: unknown[] = [];

	const lastBracketIndex = message.lastIndexOf('[');
	if (lastBracketIndex > -1) {
		const potentialJsonArgs = message.substring(lastBracketIndex);
		try {
			const parsedArgs = JSON.parse(potentialJsonArgs);
			if (Array.isArray(parsedArgs)) {
				args = parsedArgs;
				message = message.substring(0, lastBracketIndex).trim();
			}
		} catch {
			/* ignore */
		}
	}

	return {
		timestamp: timestamp as ISODateString,
		level,
		message: message.replace(/\[\d+(?:;\d+)*m/g, ''),
		messageHtml: convertAnsiToHtml(message),
		args
	};
};

// --- New Optimized Helper Functions ---

/**
 * Reads a plain text file strictly backwards in chunks.
 * This is crucial for performance on "Page 1" of large log files.
 */
async function* readLinesReverse(filePath: string): AsyncGenerator<string> {
	const fileHandle = await open(filePath, 'r');
	try {
		const stats = await fileHandle.stat();
		const bufferSize = 64 * 1024; // 64KB chunks
		const buffer = Buffer.alloc(bufferSize);
		let position = stats.size;
		let leftover = '';

		while (position > 0) {
			const readSize = Math.min(position, bufferSize);
			position -= readSize;

			await fileHandle.read(buffer, 0, readSize, position);
			const chunk = buffer.toString('utf-8', 0, readSize);
			const lines = (chunk + leftover).split('\n');

			// The first element is the end of the line from the *previous* chunk (logically next line)
			// The last element is the start of the line from the *next* chunk (logically previous line)
			leftover = lines.shift() || '';

			// Iterate lines in reverse (they are currently in file order within the chunk)
			for (let i = lines.length - 1; i >= 0; i--) {
				if (lines[i].trim()) yield lines[i];
			}
		}

		if (leftover.trim()) yield leftover;
	} finally {
		await fileHandle.close();
	}
}

/**
 * Reads a compressed file stream forward.
 * Since we can't easily read compressed files backward, we read forward
 * but collect lines to return them in reverse order for that specific file.
 */
async function getCompressedLogLines(filePath: string, isBrotli: boolean): Promise<string[]> {
	const lines: string[] = [];
	let fileStream: NodeJS.ReadableStream = createReadStream(filePath);

	if (isBrotli) {
		fileStream = fileStream.pipe(createBrotliDecompress());
	} else {
		fileStream = fileStream.pipe(createGunzip());
	}

	const rl = createInterface({
		input: fileStream,
		crlfDelay: Infinity
	});

	for await (const line of rl) {
		if (line.trim()) lines.push(line);
	}

	// Reverse so the newest lines (at the bottom of the file) come first
	return lines.reverse();
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = locals;

	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}

		const params = v.parse(QuerySchema, {
			level: url.searchParams.get('level') || undefined,
			search: url.searchParams.get('search') || undefined,
			startDate: url.searchParams.get('startDate') || undefined,
			endDate: url.searchParams.get('endDate') || undefined,
			page: Number(url.searchParams.get('page')) || undefined,
			limit: Number(url.searchParams.get('limit')) || undefined
		});

		const LOG_DIRECTORY = 'logs';
		const LOG_FILE_NAME = 'app.log';
		const LOG_RETENTION_DAYS = publicEnv.LOG_RETENTION_DAYS || 30;

		const startDateTime = params.startDate ? new Date(params.startDate).getTime() : 0;
		const endDateTime = params.endDate ? new Date(new Date(params.endDate).setHours(23, 59, 59, 999)).getTime() : Infinity;

		// Calculate how many logs we need to skip and take
		const neededSkip = (params.page - 1) * params.limit;
		const neededTake = params.limit;
		const totalNeeded = neededSkip + neededTake;

		const collectedLogs: RawLogEntry[] = [];

		// 1. Get Files and Sort Newest -> Oldest
		const files = await readdir(LOG_DIRECTORY);
		const logFiles = files
			.filter((file) => file === LOG_FILE_NAME || file.startsWith(`${LOG_FILE_NAME}.`))
			.sort((a, b) => {
				// Custom sort: app.log is always newest/first
				if (a === LOG_FILE_NAME) return -1;
				if (b === LOG_FILE_NAME) return 1;
				// Otherwise sort by string (usually app.log.1, app.log.2)
				// Assuming lower number = newer rotated log, or use mtime if needed
				return a.localeCompare(b);
			});

		// 2. Process files until we have enough logs
		// Note: We iterate files Newest -> Oldest
		for (const file of logFiles) {
			// Early exit if we have enough logs
			if (collectedLogs.length >= totalNeeded) break;

			const filePath = join(LOG_DIRECTORY, file);
			const fileStats = await stat(filePath);

			// Retention check
			const isRotatedLog = file !== LOG_FILE_NAME;
			if (isRotatedLog && fileStats.mtimeMs < Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
				continue;
			}

			const isCompressed = file.endsWith('.gz') || file.endsWith('.br');
			const isBrotli = file.endsWith('.br');

			let linesGenerator: AsyncGenerator<string> | string[];

			if (isCompressed) {
				// Compressed files must be read fully to memory (unavoidable for stream), then reversed
				linesGenerator = await getCompressedLogLines(filePath, isBrotli);
			} else {
				// Plain text: Read BACKWARD efficiently
				linesGenerator = readLinesReverse(filePath);
			}

			// Iterate lines (which are now guaranteed to be Newest -> Oldest)
			for await (const line of linesGenerator) {
				// Early exit loop
				if (collectedLogs.length >= totalNeeded) break;

				// Handle AsyncGenerator vs Array
				if (typeof line !== 'string') continue;

				const entry = parseLogLineWithColors(line);
				if (!entry) continue;

				const entryTimestamp = new Date(entry.timestamp).getTime();

				// Date Filter Optimization:
				// If we are reading Newest->Oldest, and we hit a log older than startDate,
				// we can theoretically stop EVERYTHING if we assume strict ordering.
				// However, async logging might not be strictly ordered to the millisecond, so we just filter.
				// But if it's WAY before, we could break. For safety, we just filter.
				if (entryTimestamp < startDateTime) continue; // Too old
				if (entryTimestamp > endDateTime) continue; // Too new (rare if reading reverse, but possible)

				// Level & Search Filter
				const levelMatch = params.level === 'all' || entry.level.toLowerCase() === params.level.toLowerCase();
				const textMatch = !params.search || entry.message.toLowerCase().includes(params.search.toLowerCase());

				if (levelMatch && textMatch) {
					collectedLogs.push(entry);
				}
			}
		}

		// 3. Slice the specific page
		// We might have collected slightly more than needed due to loop logic, so we slice exactly.
		// Since we collected in Newest->Oldest order, index 0 is the newest log.
		const paginatedLogs = collectedLogs.slice(neededSkip, neededSkip + neededTake);

		const validatedLogs = v.parse(v.array(LogEntrySchema), paginatedLogs);

		logger.info('Logs fetched (Optimized)', {
			count: paginatedLogs.length,
			page: params.page,
			requestedBy: user._id
		});

		return json({
			logs: validatedLogs,
			// Note: Total count is now approximate or limited because we didn't read all files.
			// For infinite scrolling/pagination, we usually return "hasMore" or just the length.
			// If specific total is needed, we'd have to scan everything, which defeats optimization.
			// We return collectedLogs.length as a proxy for "logs found so far".
			total: collectedLogs.length,
			page: params.page,
			limit: params.limit,
			// If we filled the buffer, assume there might be more pages.
			hasMore: collectedLogs.length >= totalNeeded
		});
	} catch (err) {
		if (err instanceof v.ValiError) {
			throw error(400, 'Invalid request parameters');
		}
		logger.error('Error fetching logs:', err);
		throw error(500, 'Failed to fetch logs');
	}
};
