/**
 * @file src/routes/api/dashboard/systemMessages/+server.ts
 * @description API endpoint for system messages for dashboard widgets
 *
 * ### Features
 * - **Secure Authorization:** Access is controlled centrally by `src/hooks.server.ts`.
 * - **High-Performance Log Reading:** Efficiently reads only the end of the log file.
 * - **Input Validation:** Safely validates and caps the `limit` query parameter.
 */

import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';

// Auth

// System Logger
import { logger } from '@utils/logger.svelte';

// Validation
import * as v from 'valibot';

// --- Types, Constants & Schemas ---
type SystemMessage = {
	id: string;
	title: string;
	message: string;
	level: string;
	timestamp: string;
	type: 'error' | 'warning' | 'info';
};

const MAX_MESSAGES_LIMIT = 50;
const LOG_FILE_PATH = path.join(process.cwd(), 'logs', 'app.log');

const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(MAX_MESSAGES_LIMIT)), 5)
});

const LOG_LINE_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z?) \S+ \[(\w+)\]: (.+)$/;

// --- Helper Functions ---

async function readLastLines(filePath: string, maxLines: number): Promise<string[]> {
	try {
		const handle = await fs.open(filePath, 'r');
		const { size } = await handle.stat();
		const bufferSize = Math.min(1024 * 4, size);
		const buffer = Buffer.alloc(bufferSize);
		let position = size;
		let lines: string[] = [];
		let collectedData = '';

		while (lines.length < maxLines && position > 0) {
			const readPosition = Math.max(0, position - bufferSize);
			const bytesToRead = position - readPosition;
			await handle.read(buffer, 0, bytesToRead, readPosition);
			collectedData = buffer.toString('utf-8', 0, bytesToRead) + collectedData;
			const currentLines = collectedData.split('\n');
			if (position === size && currentLines[currentLines.length - 1] === '') {
				currentLines.pop();
			}
			lines = currentLines.slice(-maxLines);
			position = readPosition;
		}
		await handle.close();
		return lines;
	} catch (err) {
		logger.warn(`Could not read log file at: ${filePath}`, err);
		return [];
	}
}

// --- API Handler ---

export const GET: RequestHandler = async ({ locals, url }) => {
	// Authentication is handled by hooks.server.ts
	if (!locals.user) {
		logger.warn('Unauthorized attempt to access system messages');
		throw error(401, 'Unauthorized');
	}

	try {
		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || undefined
		});

		const logLines = await readLastLines(LOG_FILE_PATH, query.limit);

		const messages: SystemMessage[] = logLines
			.map((line): SystemMessage | null => {
				const match = line.match(LOG_LINE_REGEX);
				if (!match) return null;
				const [, timestamp, level, message] = match;
				const lowerLevel = level.toLowerCase();
				return {
					id: uuidv4(),
					title: `${level.toUpperCase()} Message`,
					message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
					level: lowerLevel,
					timestamp,
					type: lowerLevel === 'error' ? 'error' : lowerLevel === 'warn' ? 'warning' : 'info'
				};
			})
			.filter((msg): msg is SystemMessage => msg !== null);

		if (messages.length === 0) {
			messages.push({
				id: uuidv4(),
				title: 'System Status',
				message: 'System is running normally. No recent critical messages.',
				level: 'info',
				timestamp: new Date().toISOString(),
				type: 'info'
			});
		}

		logger.info('System messages fetched successfully', {
			count: messages.length,
			requestedBy: locals.user?._id
		});

		return json(messages);
	} catch (err) {
		if (err instanceof v.ValiError) {
			return json({ error: 'Invalid "limit" parameter.', issues: err.issues }, { status: 400 });
		}
		logger.error('An unexpected error occurred while fetching system messages:', err);
		throw error(500, 'An unexpected error occurred.');
	}
};
