import { publicEnv } from '../../../../../chunks/globalSettings.svelte.js';
import { error, json } from '@sveltejs/kit';
import { createReadStream } from 'node:fs';
import { readdir, stat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createBrotliDecompress, createGunzip } from 'node:zlib';
import { l as logger } from '../../../../../chunks/logger.server.js';
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
const ANSI_COLOR_MAP = {
	30: '#000000',
	// black
	31: '#dc2626',
	// red
	32: '#16a34a',
	// green
	33: '#ca8a04',
	// yellow
	34: '#2563eb',
	// blue
	35: '#9333ea',
	// magenta
	36: '#0891b2',
	// cyan
	37: '#374151',
	// white/gray
	90: '#6b7280',
	// bright black/gray
	91: '#ef4444',
	// bright red
	92: '#22c55e',
	// bright green
	93: '#eab308',
	// bright yellow
	94: '#3b82f6',
	// bright blue
	95: '#a855f7',
	// bright magenta
	96: '#06b6d4',
	// bright cyan
	97: '#f9fafb'
	// bright white
};
function convertAnsiToHtml(text) {
	let result = '';
	let currentPos = 0;
	const openTags = [];
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
const parseLogLineWithColors = (line) => {
	const regex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\s+\[([^\]]+)\]\s+(.*)$/;
	const match = line.match(regex);
	if (!match) {
		const simpleRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)?\s*(?:\[([^\]]+)\])?\s*\[([A-Z]+)\](?::\s*)?(.*)$/;
		const simpleMatch = line.match(simpleRegex);
		if (simpleMatch) {
			const [, timestamp2, , level2, message2] = simpleMatch;
			const cleanMessage = message2 || line;
			return {
				timestamp: timestamp2 || /* @__PURE__ */ new Date().toISOString(),
				level: level2 || 'INFO',
				message: cleanMessage.replace(/\[\d+(?:;\d+)*m/g, ''),
				messageHtml: convertAnsiToHtml(cleanMessage),
				args: []
			};
		}
		return {
			timestamp: /* @__PURE__ */ new Date().toISOString(),
			level: 'INFO',
			message: line.replace(/\[\d+(?:;\d+)*m/g, ''),
			messageHtml: convertAnsiToHtml(line),
			args: []
		};
	}
	const [, timestamp, level, contentPart] = match;
	let message = contentPart.trim();
	let args = [];
	const lastBracketIndex = message.lastIndexOf('[');
	if (lastBracketIndex > -1) {
		const potentialJsonArgs = message.substring(lastBracketIndex);
		try {
			const parsedArgs = JSON.parse(potentialJsonArgs);
			if (Array.isArray(parsedArgs)) {
				args = parsedArgs;
				message = message.substring(0, lastBracketIndex).trim();
			}
		} catch {}
	}
	return {
		timestamp,
		level,
		message: message.replace(/\[\d+(?:;\d+)*m/g, ''),
		messageHtml: convertAnsiToHtml(message),
		args
	};
};
async function* readLinesReverse(filePath) {
	const fileHandle = await open(filePath, 'r');
	try {
		const stats = await fileHandle.stat();
		const bufferSize = 64 * 1024;
		const buffer = Buffer.alloc(bufferSize);
		let position = stats.size;
		let leftover = '';
		while (position > 0) {
			const readSize = Math.min(position, bufferSize);
			position -= readSize;
			await fileHandle.read(buffer, 0, readSize, position);
			const chunk = buffer.toString('utf-8', 0, readSize);
			const lines = (chunk + leftover).split('\n');
			leftover = lines.shift() || '';
			for (let i = lines.length - 1; i >= 0; i--) {
				if (lines[i].trim()) yield lines[i];
			}
		}
		if (leftover.trim()) yield leftover;
	} finally {
		await fileHandle.close();
	}
}
async function getCompressedLogLines(filePath, isBrotli) {
	const lines = [];
	let fileStream = createReadStream(filePath);
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
	return lines.reverse();
}
const GET = async ({ locals, url }) => {
	const { user } = locals;
	try {
		if (!user) {
			throw error(401, 'Unauthorized');
		}
		const params = v.parse(QuerySchema, {
			level: url.searchParams.get('level') || void 0,
			search: url.searchParams.get('search') || void 0,
			startDate: url.searchParams.get('startDate') || void 0,
			endDate: url.searchParams.get('endDate') || void 0,
			page: Number(url.searchParams.get('page')) || void 0,
			limit: Number(url.searchParams.get('limit')) || void 0
		});
		const LOG_DIRECTORY = 'logs';
		const LOG_FILE_NAME = 'app.log';
		const LOG_RETENTION_DAYS = publicEnv.LOG_RETENTION_DAYS || 30;
		const startDateTime = params.startDate ? new Date(params.startDate).getTime() : 0;
		const endDateTime = params.endDate ? new Date(new Date(params.endDate).setHours(23, 59, 59, 999)).getTime() : Infinity;
		const neededSkip = (params.page - 1) * params.limit;
		const neededTake = params.limit;
		const totalNeeded = neededSkip + neededTake;
		const collectedLogs = [];
		const files = await readdir(LOG_DIRECTORY);
		const logFiles = files
			.filter((file) => file === LOG_FILE_NAME || file.startsWith(`${LOG_FILE_NAME}.`))
			.sort((a, b) => {
				if (a === LOG_FILE_NAME) return -1;
				if (b === LOG_FILE_NAME) return 1;
				return a.localeCompare(b);
			});
		for (const file of logFiles) {
			if (collectedLogs.length >= totalNeeded) break;
			const filePath = join(LOG_DIRECTORY, file);
			const fileStats = await stat(filePath);
			const isRotatedLog = file !== LOG_FILE_NAME;
			if (isRotatedLog && fileStats.mtimeMs < Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1e3) {
				continue;
			}
			const isCompressed = file.endsWith('.gz') || file.endsWith('.br');
			const isBrotli = file.endsWith('.br');
			let linesGenerator;
			if (isCompressed) {
				linesGenerator = await getCompressedLogLines(filePath, isBrotli);
			} else {
				linesGenerator = readLinesReverse(filePath);
			}
			for await (const line of linesGenerator) {
				if (collectedLogs.length >= totalNeeded) break;
				if (typeof line !== 'string') continue;
				const entry = parseLogLineWithColors(line);
				if (!entry) continue;
				const entryTimestamp = new Date(entry.timestamp).getTime();
				if (entryTimestamp < startDateTime) continue;
				if (entryTimestamp > endDateTime) continue;
				const levelMatch = params.level === 'all' || entry.level.toLowerCase() === params.level.toLowerCase();
				const textMatch = !params.search || entry.message.toLowerCase().includes(params.search.toLowerCase());
				if (levelMatch && textMatch) {
					collectedLogs.push(entry);
				}
			}
		}
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
export { GET };
//# sourceMappingURL=_server.ts.js.map
