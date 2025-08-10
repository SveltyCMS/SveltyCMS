/**
 * @file src/routes/(app)/dashboard/widgets/logs/+server.ts
 * @description Server-side endpoint to fetch system logs with filtering and pagination.
 */

import { getPublicSetting } from '@src/stores/globalSettings';

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

// System Logger
import { logger } from '@utils/logger.svelte';

// Import LoggableValue from the logger for more specific typing
import type { LoggableValue } from '@utils/logger.svelte';

// Define the structure of a log entry as it's read from the file
interface RawLogEntry {
	timestamp: string; // ISO string
	level: string;
	message: string;
	args: LoggableValue[]; // Changed from any[] to LoggableValue[]
}

/**
 * Parses a single log line into a structured object.
 * The logger outputs lines in the format:
 * "YYYY-MM-DD HH:MM:SS.sss [OptionalSourceFile] [LEVEL]: Message Content [OptionalJSONArgs]"
 *
 * This function attempts to robustly parse these components.
 */
const parseLogLine = (line: string): RawLogEntry | null => {
	// Regex to capture:
	// 1. Timestamp (YYYY-MM-DD HH:MM:SS.sss)
	// 2. Optional Source File (e.g., [src/file.js]) - captured in group 2
	// 3. Log Level (e.g., FATAL, ERROR) - captured in group 3
	// 4. Remaining Content (message + potential JSON args) - captured in group 4
	const regex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})(?: \[([^\]]+)\])? \[([A-Z]+)\]: (.*)$/;
	const match = line.match(regex);

	if (!match) {
		// Fallback for lines that don't strictly match the expected format.
		// This can happen for non-logger output or malformed lines.
		// Attempt to extract basic info and treat the rest as a message.
		const simpleRegex = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})?.*?\[([A-Z]+)\]: (.*)$/;
		const simpleMatch = line.match(simpleRegex);
		if (simpleMatch) {
			const [, simpleTimestamp, simpleLevel, simpleMessage] = simpleMatch;
			return {
				timestamp: simpleTimestamp ? simpleTimestamp.replace(' ', 'T') + 'Z' : new Date().toISOString(),
				level: simpleLevel || 'INFO', // Default to INFO if level not found
				message: simpleMessage.trim(),
				args: []
			};
		}
		// If even simple regex fails, return the whole line as an INFO message with current timestamp.
		return {
			timestamp: new Date().toISOString(),
			level: 'INFO',
			message: line,
			args: []
		};
	}

	// Use _sourceFilePart to indicate it's intentionally unused
	const [, timestampPart, level, contentPart] = match;

	let message = contentPart.trim();
	let args: LoggableValue[] = []; // Type is now LoggableValue[]

	// Attempt to parse args from the end of the contentPart.
	// The logger typically JSON.stringifies arguments, so we look for a JSON array.
	const lastBracketIndex = message.lastIndexOf('[');
	if (lastBracketIndex > -1) {
		const potentialJsonArgs = message.substring(lastBracketIndex);
		try {
			const parsedArgs = JSON.parse(potentialJsonArgs);
			if (Array.isArray(parsedArgs)) {
				args = parsedArgs as LoggableValue[]; // Cast to LoggableValue[]
				// Remove the JSON args string from the message part
				message = message.substring(0, lastBracketIndex).trim();
			}
		} catch (e) {
			// If parsing fails, it means the last bracketed part was not a valid JSON array.
			// In this case, it's considered part of the message.
			logger.warn('Failed to parse potential log args JSON:', e, { line, potentialJsonArgs });
		}
	}

	// Convert timestamp to ISO 8601 format for consistency (replace space with 'T' and append 'Z')
	const isoTimestamp = timestampPart.replace(' ', 'T') + 'Z';

	return {
		timestamp: isoTimestamp,
		level: level,
		message: message,
		args: args
	};
};

export const GET: RequestHandler = async ({ url }) => {
	// Access log directory and file name from publicEnv for configurability
	// Assuming 'logs' is a default directory and 'app.log' is the default file name
	// These are not directly in publicEnv, but are standard for the logger.
	const LOG_DIRECTORY = 'logs';
	const LOG_FILE_NAME = 'app.log';

	// Get configurable log retention days from publicEnv
	const LOG_RETENTION_DAYS = publicEnv.LOG_RETENTION_DAYS;

	// Query parameters for filtering and pagination
	const filterLevel = url.searchParams.get('level')?.toLowerCase() || 'all';
	const searchText = url.searchParams.get('search')?.toLowerCase() || '';
	const startDateParam = url.searchParams.get('startDate');
	const endDateParam = url.searchParams.get('endDate');
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = parseInt(url.searchParams.get('limit') || '20');

	const startDateTime = startDateParam ? new Date(startDateParam).getTime() : 0;
	// End date should include the whole day, so set time to end of day
	const endDateTime = endDateParam ? new Date(new Date(endDateParam).setHours(23, 59, 59, 999)).getTime() : Infinity;

	const allLogEntries: RawLogEntry[] = []; // Changed from let to const

	try {
		// Read all files in the log directory
		const files = await readdir(LOG_DIRECTORY);

		// Filter for log files (main log and rotated/gzipped logs)
		// Sort in reverse chronological order based on filename (e.g., app.log.2023-10-27 comes before app.log.2023-10-26)
		const logFiles = files
			.filter((file) => file === LOG_FILE_NAME || file.startsWith(`${LOG_FILE_NAME}.`))
			.sort()
			.reverse();

		for (const file of logFiles) {
			const filePath = join(LOG_DIRECTORY, file);
			const stats = await stat(filePath);

			// Apply log retention policy to rotated logs.
			// The current active log file (LOG_FILE_NAME) is always processed.
			const isRotatedLog = file !== LOG_FILE_NAME;
			if (isRotatedLog && stats.mtimeMs < Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000) {
				continue; // Skip old rotated logs based on retention policy
			}

			let fileStream: NodeJS.ReadableStream = createReadStream(filePath);
			if (file.endsWith('.gz')) {
				// If it's a gzipped file, pipe it through gunzip to decompress
				fileStream = fileStream.pipe(createGunzip());
			}

			// Create a readline interface to read the file line by line
			const rl = createInterface({
				input: fileStream,
				crlfDelay: Infinity // Handle all EOL types
			});

			// Process each line from the log file
			for await (const line of rl) {
				const entry = parseLogLine(line);
				if (entry) {
					allLogEntries.push(entry);
				}
			}
		}

		// Apply filters to the collected log entries
		const filteredLogs = allLogEntries.filter((entry) => {
			const entryTimestamp = new Date(entry.timestamp).getTime();

			const levelMatch = filterLevel === 'all' || entry.level.toLowerCase() === filterLevel;
			const textMatch = !searchText || entry.message.toLowerCase().includes(searchText);
			const dateMatch = entryTimestamp >= startDateTime && entryTimestamp <= endDateTime;

			return levelMatch && textMatch && dateMatch;
		});

		// Sort logs by timestamp (newest first)
		filteredLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

		// Apply pagination based on the filtered and sorted logs
		const startIndex = (page - 1) * limit;
		const paginatedLogs = filteredLogs.slice(startIndex, startIndex + limit);

		// Return the paginated logs, total count, and pagination info as JSON
		return json({
			logs: paginatedLogs,
			total: filteredLogs.length,
			page,
			limit,
			totalPages: Math.ceil(filteredLogs.length / limit)
		});
	} catch (e) {
		// Log any errors encountered during file reading or processing
		console.error('Error fetching logs:', e);
		throw error(500, 'Failed to fetch logs');
	}
};
