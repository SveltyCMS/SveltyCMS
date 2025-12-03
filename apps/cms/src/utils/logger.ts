/**
 * @file src/utils/logger.ts
 * @description Universal Logger for SveltyCMS (Client/Server Safe)
 *
 * This logger is safe to import in:
 * - .svelte components
 * - .svelte.ts stores
 * - shared utils.ts files
 * - any code that runs on both client and server
 *
 * Behavior:
 * - Server (dev): Colorized console output
 * - Server (prod): Respects LOG_LEVELS from env
 * - Client (dev): Console output with emoji
 * - Client (prod): Error/fatal only
 *
 * For full-featured server logging (file I/O, batching, rotation),
 * use src/utils/logger.server.ts in .server.ts files only.
 */

import { browser, dev } from '$app/environment';

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type LoggableValue = string | number | boolean | null | unknown | undefined | Date | RegExp | object | Error;

const MAX_MASK_DEPTH = 10;
const SENSITIVE_KEYS = [
	'password',
	'passwd',
	'pwd',
	'token',
	'access_token',
	'refresh_token',
	'api_key',
	'apikey',
	'secret',
	'client_secret',
	'authorization',
	'auth',
	'credit_card',
	'creditcard',
	'card_number',
	'cvv',
	'ssn',
	'private_key',
	'privatekey'
];

// Determine enabled priority based on environment
const getMaxPriority = (): number => {
	if (browser) {
		// Client: debug in dev, error in prod
		return dev ? 5 : 2;
	}

	// Server: check env
	try {
		const levels = process.env.LOG_LEVELS?.split(',').map((l) => l.trim()) || ['info'];
		if (levels.includes('none')) return 0;
		const priorities: Record<LogLevel, number> = {
			fatal: 1,
			error: 2,
			warn: 3,
			info: 4,
			debug: 5,
			trace: 6
		};
		return Math.max(...levels.map((l) => priorities[l as LogLevel] || 0));
	} catch {
		return 4; // Default to info
	}
};

const maxPriority = getMaxPriority();
const priorities: Record<LogLevel, number> = {
	fatal: 1,
	error: 2,
	warn: 3,
	info: 4,
	debug: 5,
	trace: 6
};

/**
 * Recursively masks sensitive data with protection against:
 * - Circular references (prevents infinite loops)
 * - Deep nesting (prevents stack overflow)
 * - Special object types (Date, Error, RegExp)
 */
const maskSensitive = (data: unknown, seen = new WeakSet(), depth = 0): unknown => {
	// Primitives and null
	if (typeof data !== 'object' || data === null) return data;

	// Depth limit reached
	if (depth >= MAX_MASK_DEPTH) return '[Max Depth Reached]';

	// Handle special types before circular check
	if (data instanceof Date) return data.toISOString();
	if (data instanceof RegExp) return data.toString();
	if (data instanceof Error) {
		return {
			name: data.name,
			message: data.message,
			stack: data.stack?.split('\n').slice(0, 3).join('\n')
		};
	}

	// Circular reference check
	if (seen.has(data)) return '[Circular Reference]';
	seen.add(data);

	const masked: Record<string, unknown> | unknown[] = Array.isArray(data) ? [] : {};

	for (const [key, value] of Object.entries(data)) {
		const lower = key.toLowerCase();
		const isSensitive = SENSITIVE_KEYS.some((keyword) => lower.includes(keyword));

		if (isSensitive) {
			(masked as Record<string, unknown>)[key] = '[REDACTED]';
		} else if (typeof value === 'object' && value !== null) {
			(masked as Record<string, unknown>)[key] = maskSensitive(value, seen, depth + 1);
		} else {
			(masked as Record<string, unknown>)[key] = value;
		}
	}

	return masked;
};

const log = (level: LogLevel, message: string, args: LoggableValue[]): void => {
	if (priorities[level] > maxPriority) return;

	const masked = args.map((arg) => maskSensitive(arg));
	const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

	if (browser) {
		// Client: CSS styled console output with colors
		const styles: Record<LogLevel, string> = {
			fatal: 'color: #ff0000; font-weight: bold; font-size: 14px;',
			error: 'color: #ff4444; font-weight: bold;',
			warn: 'color: #ffaa00; font-weight: bold;',
			info: 'color: #4444ff;',
			debug: 'color: #888888;',
			trace: 'color: #666666; font-style: italic;'
		};
		const emoji: Record<LogLevel, string> = {
			fatal: '💀',
			error: '❌',
			warn: '⚠️',
			info: 'ℹ️',
			debug: '🐛',
			trace: '🔍'
		};
		const method =
			level === 'fatal' || level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' || level === 'trace' ? 'debug' : 'log';

		console[method](
			`%c[${timestamp}] %c${emoji[level]} [${level.toUpperCase()}] %c${message}`,
			'color: #999999;',
			styles[level],
			'color: inherit;',
			...masked
		);
	} else {
		// Server: Professional ANSI formatted output
		const colors: Record<LogLevel, string> = {
			fatal: '\x1b[35;1m', // Bright magenta + bold
			error: '\x1b[31;1m', // Bright red + bold
			warn: '\x1b[33;1m', // Bright yellow + bold
			info: '\x1b[36m', // Cyan
			debug: '\x1b[90m', // Gray
			trace: '\x1b[90;3m' // Gray + italic
		};

		const icons: Record<LogLevel, string> = {
			fatal: '✗',
			error: '✗',
			warn: '⚠',
			info: '●',
			debug: '◆',
			trace: '○'
		};

		// Format: [timestamp] icon [LEVEL] message
		const formattedLevel = level.toUpperCase().padEnd(5);
		console.log(`\x1b[2m${timestamp}\x1b[0m ${colors[level]}${icons[level]} [${formattedLevel}]\x1b[0m ${message}`, ...masked);
	}
};

export const logger = {
	fatal: (msg: string, ...args: LoggableValue[]) => log('fatal', msg, args),
	error: (msg: string, ...args: LoggableValue[]) => log('error', msg, args),
	warn: (msg: string, ...args: LoggableValue[]) => log('warn', msg, args),
	info: (msg: string, ...args: LoggableValue[]) => log('info', msg, args),
	debug: (msg: string, ...args: LoggableValue[]) => log('debug', msg, args),
	trace: (msg: string, ...args: LoggableValue[]) => log('trace', msg, args),

	/**
	 * Creates a namespaced logger channel.
	 * @param name - The name for the channel (e.g., 'Auth', 'DB')
	 */
	channel: (name: string) => ({
		fatal: (msg: string, ...args: LoggableValue[]) => log('fatal', `[${name}] ${msg}`, args),
		error: (msg: string, ...args: LoggableValue[]) => log('error', `[${name}] ${msg}`, args),
		warn: (msg: string, ...args: LoggableValue[]) => log('warn', `[${name}] ${msg}`, args),
		info: (msg: string, ...args: LoggableValue[]) => log('info', `[${name}] ${msg}`, args),
		debug: (msg: string, ...args: LoggableValue[]) => log('debug', `[${name}] ${msg}`, args),
		trace: (msg: string, ...args: LoggableValue[]) => log('trace', `[${name}] ${msg}`, args)
	}),

	/**
	 * Helper to quickly dump data at the 'trace' level.
	 * @param data - The data to dump.
	 * @param label - An optional label for the dump.
	 */
	dump: (data: LoggableValue, label?: string) => {
		if (priorities.trace <= maxPriority) {
			const prefix = label ? `DUMP[${label}]` : 'DUMP';
			if (browser) {
				console.group(`🔍 ${prefix}`);
				console.dir(maskSensitive(data), { depth: null });
				console.groupEnd();
			} else {
				log('trace', prefix, [data]);
			}
		}
	}
};
