import { error, json } from '@sveltejs/kit';
import fs from 'fs/promises';
import path from 'path';
import { v4 } from 'uuid';
import { l as logger } from '../../../../../chunks/logger.server.js';
import * as v from 'valibot';
const MAX_MESSAGES_LIMIT = 50;
const LOG_FILE_PATH = path.join(process.cwd(), 'logs', 'app.log');
const QuerySchema = v.object({
	limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(MAX_MESSAGES_LIMIT)), 5)
});
const LOG_LINE_REGEX = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z?) \S+ \[(\w+)\]: (.+)$/;
async function readLastLines(filePath, maxLines) {
	try {
		const handle = await fs.open(filePath, 'r');
		const { size } = await handle.stat();
		const bufferSize = Math.min(1024 * 4, size);
		const buffer = Buffer.alloc(bufferSize);
		let position = size;
		let lines = [];
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
const GET = async ({ locals, url }) => {
	if (!locals.user) {
		logger.warn('Unauthorized attempt to access system messages');
		throw error(401, 'Unauthorized');
	}
	try {
		const query = v.parse(QuerySchema, {
			limit: Number(url.searchParams.get('limit')) || void 0
		});
		const logLines = await readLastLines(LOG_FILE_PATH, query.limit);
		const messages = logLines
			.map((line) => {
				const match = line.match(LOG_LINE_REGEX);
				if (!match) return null;
				const [, timestamp, level, message] = match;
				const lowerLevel = level.toLowerCase();
				return {
					id: v4(),
					title: `${level.toUpperCase()} Message`,
					message: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
					level: lowerLevel,
					timestamp,
					type: lowerLevel === 'error' ? 'error' : lowerLevel === 'warn' ? 'warning' : 'info'
				};
			})
			.filter((msg) => msg !== null);
		if (messages.length === 0) {
			messages.push({
				id: v4(),
				title: 'System Status',
				message: 'System is running normally. No recent critical messages.',
				level: 'info',
				timestamp: /* @__PURE__ */ new Date().toISOString(),
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
export { GET };
//# sourceMappingURL=_server.ts.js.map
