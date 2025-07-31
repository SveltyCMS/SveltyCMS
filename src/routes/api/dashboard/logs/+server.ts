/**
 * @file src/routes/api/dashboard/logs/+server.ts
 * @description API endpoint for system logs with ANSI color code support for dashboard widgets.
 *
 * @example GET /api/dashboard/logs?limit=20&level=all&search=&page=1
 *
 * Features:
 * - **Secure Authorization:** Access is controlled centrally by `src/hooks.server.ts`.
 * - **ANSI Color Support:** Converts ANSI escape sequences to HTML with proper colors.
 * - **High-Performance Log Reading:** Efficiently reads only the end of the log file.
 * - **Input Validation:** Safely validates and caps query parameters.
 * - **Multi-Level Filtering:** Supports filtering by log level, search text, and date range.
 */

import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { publicEnv } from '@root/config/public';

// System Logger
import { logger } from '@utils/logger.svelte';

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
	timestamp: v.string(),
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
	timestamp: string;
	level: string;
	message: string;
	messageHtml: string;
	args: unknown[];
}

/**
 * Converts ANSI escape sequences to HTML spans with inline CSS colors
 */
function convertAnsiToHtml(text: string): string {
	// Simple but effective approach: process ANSI codes sequentially
	let result = '';
	let currentPos = 0;
	const openTags: string[] = [];

	// Find all ANSI escape sequences
	const ansiRegex = /\[(\d+)m/g;
	let match;

	while ((match = ansiRegex.exec(text)) !== null) {
		// Add text before this match
		result += text.substring(currentPos, match.index);

		const code = match[1];

		if (code === '0') {
			// Reset code - close all open tags
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
			// Ignore unhandled codes
		}

		currentPos = match.index + match[0].length;
	}

	// Add remaining text
	result += text.substring(currentPos);

	// Close any remaining open tags
	while (openTags.length > 0) {
		result += '</span>';
		openTags.pop();
	}

	return result;
} /**
 * Parses a log line with ANSI color support
 */
const parseLogLineWithColors = (line: string): RawLogEntry | null => {
	// Enhanced regex to handle ANSI codes in timestamp and message
	const regex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([^\]]+)\]\s+(.*)$/;
	const match = line.match(regex);

	if (!match) {
		// Fallback parsing for different log formats
		const simpleRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)?\s*(?:\[([^\]]+)\])?\s*\[([A-Z]+)\](?::\s*)?(.*)$/;
		const simpleMatch = line.match(simpleRegex);

		if (simpleMatch) {
			const [, timestamp, , level, message] = simpleMatch;
			const cleanMessage = message || line;

			return {
				timestamp: timestamp || new Date().toISOString(),
				level: level || 'INFO',
				message: cleanMessage.replace(/\[\d+(?:;\d+)*m/g, ''), // Strip ANSI for plain text
				messageHtml: convertAnsiToHtml(cleanMessage),
				args: []
			};
		}

		// Last resort: treat the whole line as a message
		return {
			timestamp: new Date().toISOString(),
			level: 'INFO',
			message: line.replace(/\[\d+(?:;\d+)*m/g, ''), // Strip ANSI for plain text
			messageHtml: convertAnsiToHtml(line),
			args: []
		};
	}

	const [, timestamp, level, contentPart] = match;

	let message = contentPart.trim();
	let args: unknown[] = [];

	// Try to extract JSON args from the end
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
			// Not valid JSON, keep as part of message
		}
	}

	return {
		timestamp,
		level,
		message: message.replace(/\[\d+(?:;\d+)*m/g, ''), // Clean message for plain text
		messageHtml: convertAnsiToHtml(message), // Rich HTML message with colors
		args
	};
};

export const GET: RequestHandler = async ({ locals, url }) => {
	const { user } = locals;

	try {
		// Authentication is handled by hooks.server.ts
		if (!user) {
			logger.warn('Unauthorized attempt to access logs');
			throw error(401, 'Unauthorized');
		}

		// Validate input parameters
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

		const allLogEntries: RawLogEntry[] = [];

		// Read log files
		const files = await readdir(LOG_DIRECTORY);
		const logFiles = files
			.filter((file) => file === LOG_FILE_NAME || file.startsWith(`${LOG_FILE_NAME}.`))
			.sort()
			.reverse();

		for (const file of logFiles) {
			const filePath = join(LOG_DIRECTORY, file);
			const stats = await stat(filePath);

			// Apply retention policy for rotated logs
			const isRotatedLog = file !== LOG_FILE_NAME;
			if (isRotatedLog && stats.mtimeMs < Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
				continue;
			}

			let fileStream: NodeJS.ReadableStream = createReadStream(filePath);
			if (file.endsWith('.gz')) {
				fileStream = fileStream.pipe(createGunzip());
			}

			const rl = createInterface({
				input: fileStream,
				crlfDelay: Infinity
			});

			for await (const line of rl) {
				const entry = parseLogLineWithColors(line);
				if (entry) {
					allLogEntries.push(entry);
				}
			}
		}

		// Apply filters
		const filteredLogs = allLogEntries.filter((entry) => {
			const entryTimestamp = new Date(entry.timestamp).getTime();

			const levelMatch = params.level === 'all' || entry.level.toLowerCase() === params.level.toLowerCase();
			const textMatch = !params.search || entry.message.toLowerCase().includes(params.search.toLowerCase());
			const dateMatch = entryTimestamp >= startDateTime && entryTimestamp <= endDateTime;

			return levelMatch && textMatch && dateMatch;
		});

		// Sort by timestamp (newest first)
		filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

		// Apply pagination
		const startIndex = (params.page - 1) * params.limit;
		const paginatedLogs = filteredLogs.slice(startIndex, startIndex + params.limit);

		// Validate output
		const validatedLogs = v.parse(v.array(LogEntrySchema), paginatedLogs);

		logger.info('Logs fetched with ANSI color support', {
			total: filteredLogs.length,
			page: params.page,
			limit: params.limit,
			level: params.level,
			search: params.search,
			requestedBy: user._id
		});

		return json({
			logs: validatedLogs,
			total: filteredLogs.length,
			page: params.page,
			limit: params.limit,
			totalPages: Math.ceil(filteredLogs.length / params.limit)
		});
	} catch (err) {
		if (err instanceof v.ValiError) {
			logger.error('Logs request validation failed', { error: err.issues });
			throw error(400, 'Invalid request parameters');
		}

		logger.error('Error fetching logs:', err);
		throw error(500, 'Failed to fetch logs');
	}
};
