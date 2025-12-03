/**
 * @file src/utils/logger.server.ts
 * @description Server-only logger for SveltyCMS with automatic formatting, batching, and file rotation.
 *
 * Log levels: none | fatal | error | warn | info | debug | trace
 *
 * What it does:
 * - Automatic token highlighting (paths, IDs, methods, status codes, booleans)
 * - Batched writes with rotation and optional compression
 * - Sensitive data masking and optional source-file tracking
 * - Pluggable log target and runtime filters
 *
 * Configuration:
 * - Set `LOG_LEVELS` at build or runtime (comma-separated):
 *   - Examples: `fatal,error,warn` | `none`
 *   - Resolved from `import.meta.env.VITE_LOG_LEVELS` or `process.env.LOG_LEVELS`,
 *     with runtime fallback to public settings.
 *
 * Usage:
 *   logger.error(`Error processing ${id}`, { cause });
 *
 * Note: This module uses Node APIs and must be imported only in `.server.ts` files.
 * For universal (client/server) logging, use `src/utils/logger.ts`.
 */

import { browser, building } from '$app/environment';
import { publicEnv } from '@stores/globalSettings.svelte';
import type { ISODateString } from '@src/content/types';
import { dateToISODateString, isoDateStringToDate } from '@src/utils/dateUtils';

// This module should never run in browser - fail fast if it does
if (browser) {
	throw new Error('logger.server.ts cannot be imported in browser code. Use src/utils/logger.ts instead.');
}

// Helper to safely access publicEnv properties with a default value
const getEnv = <T>(key: keyof typeof publicEnv, defaultValue: T): T => {
	try {
		const value = publicEnv[key];
		return value !== undefined ? (value as T) : defaultValue;
	} catch {
		return defaultValue;
	}
};

// Compile-time log level controls for better tree-shaking in server bundle
const LOG_LEVELS_DEFINE =
	(import.meta.env?.VITE_LOG_LEVELS as string | undefined) || (typeof process !== 'undefined' ? process.env.LOG_LEVELS : undefined);
const STATIC_ENABLED_LEVELS: LogLevel[] | null = LOG_LEVELS_DEFINE
	? (LOG_LEVELS_DEFINE.split(',').map((l) => l.trim().toLowerCase()) as LogLevel[])
	: null;
const IS_LOGGING_DISABLED: boolean = STATIC_ENABLED_LEVELS?.includes('none') ?? false;

// Type Definitions
type LogLevel = 'none' | 'info' | 'error' | 'warn' | 'fatal' | 'debug' | 'trace';

// Define a type for loggable values
export type LoggableValue = string | number | boolean | null | unknown | undefined | Date | RegExp | object | Error;

// Define a type that can be either an array or an object
type LoggableData = LoggableValue[] | Record<string, LoggableValue>;
type LogEntry = {
	level: LogLevel;
	message: string;
	args: LoggableValue[];
	timestamp: ISODateString;
};

// Masking configuration type
type MaskingConfig = {
	sensitiveKeys: string[];
	emailKeys: string[];
	customMasks: Record<string, (value: string) => string>;
};

// Type for dynamically imported server modules for type safety
type ServerModules = {
	fsPromises: typeof import('node:fs/promises');
	path: typeof import('node:path');
	zlib: typeof import('node:zlib');
	fs: typeof import('node:fs');
	stream: typeof import('node:stream/promises');
};

// Color codes for terminal output
const TERMINAL_COLORS: Record<string, string> = {
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	magenta: '\x1b[35m',
	gray: '\x1b[90m',
	reset: '\x1b[0m'
};

// Map log levels to colors
const LOG_LEVEL_MAP: Record<LogLevel, { priority: number; color: keyof typeof TERMINAL_COLORS }> = {
	none: { priority: 0, color: 'reset' },
	fatal: { priority: 1, color: 'magenta' },
	error: { priority: 2, color: 'red' },
	warn: { priority: 3, color: 'yellow' },
	info: { priority: 4, color: 'green' },
	debug: { priority: 5, color: 'blue' },
	trace: { priority: 6, color: 'cyan' }
};

// --- Message-level smart formatting (colors specific tokens in the message text) ---
type MessagePattern = { regex: RegExp; color: keyof typeof TERMINAL_COLORS; priority: number };
const MESSAGE_PATTERNS: MessagePattern[] = [
	// Highest Priority - Time measurements
	{ regex: /\b\d+(\.\d+)?(ms|s)\b/g, color: 'green', priority: 100 },

	// Very High Priority - Context-aware token detection (values after colons, equals, etc.)
	{ regex: /(?<=:\s)[a-f0-9]{32}(?=\s|$|,|\)|\]|\})/g, color: 'yellow', priority: 95 }, // ID after colon
	{ regex: /(?<=:\s)[a-f0-9]{24}(?=\s|$|,|\)|\]|\})/g, color: 'yellow', priority: 95 }, // ObjectId after colon
	{ regex: /(?<=:\s)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\s|$|,|\)|\]|\})/gi, color: 'yellow', priority: 95 }, // UUID after colon
	{ regex: /(?<==\s?)[a-f0-9]{32}(?=\s|$|,|\)|\]|\})/g, color: 'yellow', priority: 94 }, // ID after equals
	{ regex: /(?<==\s?)[a-f0-9]{24}(?=\s|$|,|\)|\]|\})/g, color: 'yellow', priority: 94 }, // ObjectId after equals

	// High Priority - Specific keywords
	{ regex: /\bsession(s)?\b/gi, color: 'yellow', priority: 92 },
	{ regex: /\btoken(s)?\b/gi, color: 'blue', priority: 92 },
	{ regex: /\b(error|failed|failure|denied|invalid|unauthorized|forbidden)\b/gi, color: 'red', priority: 90 },

	// Medium-High Priority - Paths and APIs
	{ regex: /\/api\/[\S]+/g, color: 'cyan', priority: 85 },
	{ regex: /\/[^\s]*\.(ts|js|svelte|json|css|html)/g, color: 'cyan', priority: 84 },

	// Medium Priority - IDs and UUIDs (standalone)
	{ regex: /\b[a-f0-9]{32}\b/g, color: 'yellow', priority: 75 }, // 32-char hex UUIDs
	{ regex: /\b[a-f0-9]{24}\b/g, color: 'yellow', priority: 74 }, // ObjectId
	{ regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, color: 'yellow', priority: 73 }, // Standard UUID

	// Lower Priority - Numbers and booleans
	{ regex: /\btrue\b/g, color: 'green', priority: 65 },
	{ regex: /\bfalse\b/g, color: 'red', priority: 65 },
	{ regex: /\b-?\d+(?:\.\d+)?\b/g, color: 'blue', priority: 60 }, // plain numbers

	// Lowest Priority - Quoted strings (catch remaining)
	{ regex: /"([^"]+)"/g, color: 'cyan', priority: 50 },
	{ regex: /'([^']+)'/g, color: 'cyan', priority: 50 }
].sort((a, b) => b.priority - a.priority);

const applyMessageFormatting = (message: string): string => {
	let out = message;
	for (const { regex, color } of MESSAGE_PATTERNS) {
		out = out.replace(regex, (m) => `${TERMINAL_COLORS[color]}${m}${TERMINAL_COLORS.reset}`);
	}
	return out;
};

// Configuration object
const config = {
	logRotationInterval: 60 * 60 * 1000, // 1 hour in milliseconds
	logDirectory: 'logs',
	logFileName: 'app.log',
	errorTrackingEnabled: false,
	batchSize: 100,
	batchTimeout: 5000,
	compressionEnabled: true,
	customLogTarget: null as ((level: LogLevel, message: string, args: LoggableValue[]) => void) | null,
	filters: [] as ((entry: LogEntry) => boolean)[],
	sourceFileTracking: ['fatal', 'error'] as LogLevel[],
	masking: {
		sensitiveKeys: [
			'password',
			'passwd',
			'pwd',
			'secret',
			'token',
			'key',
			'authorization',
			'auth',
			'api_key',
			'apikey',
			'access_token',
			'refresh_token',
			'client_secret',
			'private_key',
			'privatekey'
		],
		emailKeys: ['email', 'mail', 'createdby', 'updatedby', 'user'],
		customMasks: {} as Record<string, (value: string) => string>
	} as MaskingConfig
};

// Batch logging state
const state = {
	queue: [] as LogEntry[],
	batchTimeout: null as NodeJS.Timeout | null
};

// Cache the max enabled log level priority
let maxEnabledPriority: number = 0;

function updateMaxEnabledPriority() {
	if (building) {
		maxEnabledPriority = 0;
		return;
	}
	// Prefer compile-time levels if provided (enables tree-shaking)
	if (STATIC_ENABLED_LEVELS) {
		if (IS_LOGGING_DISABLED) {
			maxEnabledPriority = LOG_LEVEL_MAP.none.priority;
			return;
		}
		maxEnabledPriority = Math.max(0, ...STATIC_ENABLED_LEVELS.map((level) => LOG_LEVEL_MAP[level as LogLevel]?.priority ?? 0));
		return;
	}
	const enabledLevels = getEnv('LOG_LEVELS', ['fatal', 'error', 'warn', 'info', 'debug', 'trace']);
	// Ensure enabledLevels is an array before calling .includes
	if (!Array.isArray(enabledLevels) || (Array.isArray(enabledLevels) && enabledLevels.includes('none'))) {
		maxEnabledPriority = LOG_LEVEL_MAP.none.priority;
		return;
	}
	maxEnabledPriority = Math.max(0, ...enabledLevels.map((level) => LOG_LEVEL_MAP[level as LogLevel]?.priority ?? 0));
}

// Initialize the cache
if (IS_LOGGING_DISABLED) {
	maxEnabledPriority = LOG_LEVEL_MAP.none.priority;
} else {
	updateMaxEnabledPriority();
}

// Safe execution wrapper
function safeExecute(fn: () => Promise<void>) {
	if (!building) {
		fn().catch((err) => {
			if (err instanceof Error && err.message.includes('Vite module runner has been closed')) {
				return;
			}
			console.error('Error in logger function:', err);
		});
	}
}

// Value formatting utilities
const formatters = {
	parseJSON: (value: string): object | string | null => {
		try {
			const parsed = JSON.parse(value);
			return typeof parsed === 'object' && parsed !== null ? parsed : null;
		} catch {
			return value;
		}
	},
	colorizeString: (value: string): string => {
		return value.replace(/\b(\d+(\.\d+)?|true|false)\b/g, (match) => {
			if (match === 'true') return `${TERMINAL_COLORS.green}${match}${TERMINAL_COLORS.reset}`;
			if (match === 'false') return `${TERMINAL_COLORS.red}${match}${TERMINAL_COLORS.reset}`;
			return `${TERMINAL_COLORS.blue}${match}${TERMINAL_COLORS.reset}`;
		});
	},
	formatObject: (obj: object): string => {
		// Key-aware coloring: override default key color for common security/session tokens
		const colorForKey = (key: string): keyof typeof TERMINAL_COLORS => {
			const k = key.toLowerCase();
			if (/^session(id)?s?$/.test(k) || k.includes('session')) return 'yellow';
			if (/^token(s)?$/.test(k) || k.includes('token') || k.includes('access_token') || k.includes('refresh_token')) return 'blue';
			return 'cyan';
		};
		const entries = Object.entries(obj);
		if (entries.length === 0) return `${TERMINAL_COLORS.yellow}{}${TERMINAL_COLORS.reset}`;
		const formatted = entries
			.map(([k, v]) => {
				const keyColor = TERMINAL_COLORS[colorForKey(k)];
				return `${keyColor}${k}${TERMINAL_COLORS.reset}: ${formatValue(v as LoggableValue)}`;
			})
			.join(`${TERMINAL_COLORS.yellow},${TERMINAL_COLORS.reset} `);
		return `${TERMINAL_COLORS.yellow}{${TERMINAL_COLORS.reset}${formatted}${TERMINAL_COLORS.yellow}}${TERMINAL_COLORS.reset}`;
	},
	formatArray: (arr: LoggableValue[]): string => {
		return `${TERMINAL_COLORS.yellow}[${TERMINAL_COLORS.reset}${arr.map(formatValue).join(`${TERMINAL_COLORS.yellow},${TERMINAL_COLORS.reset} `)}${TERMINAL_COLORS.yellow}]${TERMINAL_COLORS.reset}`;
	}
};

const formatValue = (value: LoggableValue): string => {
	switch (typeof value) {
		case 'boolean':
			return value ? `${TERMINAL_COLORS.green}true${TERMINAL_COLORS.reset}` : `${TERMINAL_COLORS.red}false${TERMINAL_COLORS.reset}`;
		case 'number':
			return `${TERMINAL_COLORS.blue}${value}${TERMINAL_COLORS.reset}`;
		case 'string': {
			const parsedObject = formatters.parseJSON(value);
			return parsedObject && typeof parsedObject === 'object' ? formatters.formatObject(parsedObject) : formatters.colorizeString(value);
		}
		case 'object':
			if (value === null) return `${TERMINAL_COLORS.magenta}null${TERMINAL_COLORS.reset}`;
			if (value instanceof Date) return `${TERMINAL_COLORS.cyan}${value.toISOString()}${TERMINAL_COLORS.reset}`;
			if (value instanceof RegExp) return `${TERMINAL_COLORS.magenta}${value.toString()}${TERMINAL_COLORS.reset}`;
			if (Array.isArray(value)) return formatters.formatArray(value as LoggableValue[]);
			return formatters.formatObject(value);
		case 'undefined':
			return `${TERMINAL_COLORS.gray}undefined${TERMINAL_COLORS.reset}`;
		default:
			return String(value);
	}
};

// Masking utilities
const MAX_MASK_DEPTH = 10;

const maskEmail = (email: string): string => {
	const [localPart, domain] = email.split('@');
	if (!domain) return '*'.repeat(email.length);
	const maskedLocalPart = localPart.length > 2 ? localPart.slice(0, 2) + '*'.repeat(localPart.length - 2) : '**';
	const [domainName, tld] = domain.split('.');
	const maskedDomain = '*'.repeat(domainName.length);
	return `${maskedLocalPart}@${maskedDomain}.${tld || ''}`;
};

/**
 * Recursively masks sensitive data with protection against:
 * - Circular references (prevents infinite loops)
 * - Deep nesting (prevents stack overflow)
 * - Special object types (Date, Error, RegExp)
 */
const maskSensitiveData = (data: LoggableValue, seen = new WeakSet(), depth = 0): LoggableValue => {
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

	const maskedData: LoggableData = Array.isArray(data) ? [] : {};

	for (const [key, value] of Object.entries(data)) {
		let isMasked = false;
		if (typeof value === 'string') {
			const lowerKey = key.toLowerCase();
			const customMaskKey = Object.keys(config.masking.customMasks).find((mask) => lowerKey.includes(mask));
			if (customMaskKey) {
				(maskedData as Record<string, LoggableValue>)[key] = config.masking.customMasks[customMaskKey](value);
				isMasked = true;
			} else if (config.masking.sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
				(maskedData as Record<string, LoggableValue>)[key] = '[REDACTED]';
				isMasked = true;
			} else if (config.masking.emailKeys.some((emailKey) => lowerKey.includes(emailKey))) {
				(maskedData as Record<string, LoggableValue>)[key] = maskEmail(value);
				isMasked = true;
			}
		}
		if (!isMasked) {
			(maskedData as Record<string, LoggableValue>)[key] =
				typeof value === 'object' && value !== null ? maskSensitiveData(value, seen, depth + 1) : value;
		}
	}
	return maskedData;
};

// Batch processing utilities
const processBatch = async (): Promise<void> => {
	if (state.batchTimeout) clearTimeout(state.batchTimeout);
	state.batchTimeout = null;

	if (state.queue.length === 0) return;
	const currentBatch = [...state.queue];
	state.queue = [];

	const filteredBatch = config.filters.length > 0 ? currentBatch.filter((entry) => config.filters.every((filter) => filter(entry))) : currentBatch;

	if (filteredBatch.length === 0) return;

	if (!building) {
		await serverFileOps.writeBatchToFile(filteredBatch);
	}
	if (config.customLogTarget) {
		for (const { level, message, args } of filteredBatch) {
			config.customLogTarget(level, message, args);
		}
	}
};

const scheduleBatchProcessing = (): void => {
	if (building) return;
	if (state.batchTimeout) clearTimeout(state.batchTimeout);
	state.batchTimeout = setTimeout(() => safeExecute(processBatch), config.batchTimeout);
};

// Server-Side File Operations
const serverFileOps = {
	_logStream: null as import('node:fs').WriteStream | null,
	_modules: null as ServerModules | null,

	async _getModules(): Promise<ServerModules> {
		if (this._modules) return this._modules;
		const fsPromises = await import('node:fs/promises');
		const path = await import('node:path');
		const zlib = await import('node:zlib');
		const fs = await import('node:fs');
		const stream = await import('node:stream/promises');
		this._modules = { fsPromises, path, zlib, fs, stream };
		return this._modules;
	},

	async getLogStream(): Promise<import('node:fs').WriteStream> {
		const { path, fs } = await this._getModules();
		if (!this._logStream || this._logStream.writableEnded || this._logStream.destroyed) {
			const logFilePath = path.join(config.logDirectory, config.logFileName);
			this._logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
			this._logStream.on('error', (err: Error) => {
				console.error('Log stream error:', err);
				this._logStream = null;
			});
			this._logStream.on('finish', () => {
				this._logStream = null;
			});
		}
		return this._logStream;
	},

	async initializeLogFile(): Promise<void> {
		const { fsPromises, path } = await this._getModules();
		const maxRetries = 3;
		let retryCount = 0;

		if (this._logStream) {
			this._logStream.end();
			this._logStream = null;
		}

		while (retryCount < maxRetries) {
			try {
				await fsPromises.mkdir(config.logDirectory, {
					recursive: true,
					mode: 0o755
				});
				const stats = await fsPromises.stat(config.logDirectory);
				if (!stats.isDirectory()) throw new Error('Log path is not a directory');

				const logFilePath = path.join(config.logDirectory, config.logFileName);
				try {
					await fsPromises.access(logFilePath);
				} catch {
					await fsPromises.writeFile(logFilePath, '', { mode: 0o644 });
				}
				return;
			} catch (error) {
				retryCount++;
				if (retryCount >= maxRetries) {
					console.error(`Failed to initialize log directory after ${maxRetries} attempts:`, error);
					throw error;
				}
				await new Promise((resolve) => setTimeout(resolve, 500 * retryCount));
			}
		}
	},

	async checkAndRotateLogFile(): Promise<void> {
		const { fsPromises, path, zlib, fs, stream } = await this._getModules();
		const logFilePath = path.join(config.logDirectory, config.logFileName);
		const logRotationSize = getEnv('LOG_ROTATION_SIZE', 5 * 1024 * 1024);

		try {
			const stats = await fsPromises.stat(logFilePath);
			if (stats.size < logRotationSize) return;

			if (this._logStream) {
				this._logStream.end();
				this._logStream = null;
			}

			const timestamp = dateToISODateString(new Date()).replace(/[:.]/g, '-');
			const rotatedFilePath = `${logFilePath}.${timestamp}`;
			await fsPromises.rename(logFilePath, rotatedFilePath);
			await fsPromises.writeFile(logFilePath, '');

			if (config.compressionEnabled) {
				const source = fs.createReadStream(rotatedFilePath);
				const destination = fs.createWriteStream(`${rotatedFilePath}.gz`);
				await stream.pipeline(source, zlib.createGzip(), destination);
				await fsPromises.unlink(rotatedFilePath);
			}
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
				console.error('Error rotating log file:', error);
			}
		}
	},

	async cleanOldLogFiles(): Promise<void> {
		const { fsPromises, path } = await this._getModules();
		const logRetentionDays = getEnv('LOG_RETENTION_DAYS', 2);
		const files = await fsPromises.readdir(config.logDirectory);
		const now = Date.now();
		const cutoff = now - logRetentionDays * 24 * 60 * 60 * 1000;

		for (const file of files) {
			const filePath = path.join(config.logDirectory, file);
			try {
				const stats = await fsPromises.stat(filePath);
				if (stats.isFile() && stats.mtimeMs < cutoff && file !== config.logFileName) {
					const rotatedLogPattern = new RegExp(
						`^${config.logFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z(\\.gz)?$`
					);
					if (rotatedLogPattern.test(file)) {
						await fsPromises.unlink(filePath);
					}
				}
			} catch (error) {
				console.error(`Error cleaning old log file ${filePath}:`, error);
			}
		}
	},

	async writeBatchToFile(batch: LogEntry[]): Promise<void> {
		const logString = batch
			.map(
				(entry) =>
					`${isoDateStringToDate(entry.timestamp).toISOString()} [${entry.level.toUpperCase()}] ${entry.message} ${JSON.stringify(entry.args)}\n`
			)
			.join('');

		if (!logString) return;

		try {
			await this.checkAndRotateLogFile();
			const logStream = await this.getLogStream();
			await new Promise<void>((resolve, reject) => {
				logStream.write(logString, (err) => (err ? reject(err) : resolve()));
			});
		} catch (fileError) {
			console.error('Failed to write to log file, attempting recovery:', fileError);
			if (this._logStream) {
				this._logStream.destroy();
				this._logStream = null;
			}
			try {
				await this.initializeLogFile();
				const logStream = await this.getLogStream();
				await new Promise<void>((resolve, reject) => {
					logStream.write(logString, (err) => (err ? reject(err) : resolve()));
				});
			} catch (recoveryError) {
				console.error('Log file recovery failed, falling back to console:', recoveryError);
				for (const entry of batch) {
					const color = TERMINAL_COLORS[LOG_LEVEL_MAP[entry.level].color];
					const formattedArgs = entry.args.map(formatValue).join(' ');
					const prettyMessage = applyMessageFormatting(entry.message);

					// Professional formatting with icons
					const icons: Record<string, string> = {
						FATAL: '✗',
						ERROR: '✗',
						WARN: '⚠',
						INFO: '●',
						DEBUG: '◆',
						TRACE: '○'
					};
					const icon = icons[entry.level.toUpperCase()] || '●';
					const formattedLevel = entry.level.toUpperCase().padEnd(5);
					const timestamp = entry.timestamp;

					console.log(`\x1b[2m${timestamp}\x1b[0m ${color}${icon} [${formattedLevel}]\x1b[0m ${prettyMessage} ${formattedArgs}`);
				}
			}
		}
	}
};

// Lifecycle management
if (!building && !IS_LOGGING_DISABLED) {
	const boundInitializeLogFile = serverFileOps.initializeLogFile.bind(serverFileOps);
	const boundCheckAndRotateLogFile = serverFileOps.checkAndRotateLogFile.bind(serverFileOps);
	const boundCleanOldLogFiles = serverFileOps.cleanOldLogFiles.bind(serverFileOps);

	safeExecute(boundInitializeLogFile);
	safeExecute(boundCheckAndRotateLogFile);

	const rotationInterval = setInterval(() => safeExecute(boundCheckAndRotateLogFile), config.logRotationInterval);
	const dailyCleanupInterval = setInterval(() => safeExecute(boundCleanOldLogFiles), 24 * 60 * 60 * 1000);

	if (typeof globalThis !== 'undefined') {
		// @ts-expect-error - Adding custom property for HMR cleanup
		globalThis.__sveltyCMSLoggerIntervals = [rotationInterval, dailyCleanupInterval];
	}

	const cleanup = () => {
		clearInterval(rotationInterval);
		clearInterval(dailyCleanupInterval);
		if (serverFileOps._logStream) {
			if (state.queue.length > 0) {
				processBatch();
			}
			serverFileOps._logStream.end();
		}
	};

	const handleSignal = (signal: string) => {
		try {
			cleanup();
		} catch (error) {
			if (error instanceof Error && 'code' in error && error.code !== 'EIO') {
				console.error(`Logger cleanup error on ${signal}:`, error);
			}
		}
	};

	process.on('exit', cleanup);
	process.on('SIGINT', () => handleSignal('SIGINT'));
	process.on('SIGTERM', () => handleSignal('SIGTERM'));

	const isSystemError = (error: unknown): error is NodeJS.ErrnoException => {
		return error instanceof Error && 'code' in error;
	};

	process.on('uncaughtException', (error) => {
		if (isSystemError(error) && error.code === 'EIO' && error.syscall === 'read') return;
		if (error.message?.includes('Interface instance')) return;
		console.error('Uncaught exception in logger:', error);
	});

	process.on('unhandledRejection', (reason) => {
		if (isSystemError(reason) && reason.code === 'EIO') return;
		console.error('Unhandled promise rejection in logger:', reason);
	});

	// @ts-expect-error - Checking custom property for HMR cleanup
	if (globalThis.__sveltyCMSLoggerIntervals) {
		// @ts-expect-error - Accessing custom property for HMR cleanup
		globalThis.__sveltyCMSLoggerIntervals.forEach(clearInterval);
	}
}

// Core Logger Function
const log = (level: LogLevel, message: string, args: LoggableValue[]): void => {
	const maskedArgs = args.map((arg) => maskSensitiveData(arg));
	let sourceFile = '';

	if (config.sourceFileTracking.includes(level)) {
		try {
			const stack = new Error().stack || '';
			const callerLine = stack.split('\n')[4] || '';
			const match = callerLine.match(/\(([^)]+)\)/) || callerLine.match(/at ([^\s]+)/);
			if (match && match[1]) {
				sourceFile = match[1].split('/').pop()?.replace(/[()]/g, '') || '';
			}
		} catch {
			sourceFile = 'unknown';
		}
	}

	const color = TERMINAL_COLORS[LOG_LEVEL_MAP[level].color];
	const sourceInfo = sourceFile ? `${sourceFile} ` : '';
	const formattedArgs = maskedArgs.map(formatValue).join(' ');
	const prettyMessage = applyMessageFormatting(message);

	// Professional formatting with icons
	const icons: Record<string, string> = {
		FATAL: '✗',
		ERROR: '✗',
		WARN: '⚠',
		INFO: '●',
		DEBUG: '◆',
		TRACE: '○'
	};
	const icon = icons[level.toUpperCase()] || '●';
	const formattedLevel = level.toUpperCase().padEnd(5);
	const cleanTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

	process.stdout.write(`\x1b[2m${cleanTimestamp}\x1b[0m ${color}${icon} [${formattedLevel}]\x1b[0m ${sourceInfo}${prettyMessage} ${formattedArgs}\n`);

	state.queue.push({ level, message, args: maskedArgs, timestamp: dateToISODateString(new Date()) });
	if (state.queue.length >= config.batchSize) {
		safeExecute(processBatch);
	} else {
		scheduleBatchProcessing();
	}
};

// Public Logger Interface (active)
const activeLogger = {
	fatal: (message: string, ...args: LoggableValue[]) => {
		if (LOG_LEVEL_MAP.fatal.priority <= maxEnabledPriority) log('fatal', message, args);
	},
	error: (message: string, ...args: LoggableValue[]) => {
		if (LOG_LEVEL_MAP.error.priority <= maxEnabledPriority) log('error', message, args);
	},
	warn: (message: string, ...args: LoggableValue[]) => {
		if (LOG_LEVEL_MAP.warn.priority <= maxEnabledPriority) log('warn', message, args);
	},
	info: (message: string, ...args: LoggableValue[]) => {
		if (LOG_LEVEL_MAP.info.priority <= maxEnabledPriority) log('info', message, args);
	},
	debug: (message: string, ...args: LoggableValue[]) => {
		if (LOG_LEVEL_MAP.debug.priority <= maxEnabledPriority) log('debug', message, args);
	},
	trace: (message: string, ...args: LoggableValue[]) => {
		if (LOG_LEVEL_MAP.trace.priority <= maxEnabledPriority) log('trace', message, args);
	},

	channel: (name: string) => ({
		fatal: (msg: string, ...args: LoggableValue[]) => {
			if (LOG_LEVEL_MAP.fatal.priority <= maxEnabledPriority) log('fatal', `[${name}] ${msg}`, args);
		},
		error: (msg: string, ...args: LoggableValue[]) => {
			if (LOG_LEVEL_MAP.error.priority <= maxEnabledPriority) log('error', `[${name}] ${msg}`, args);
		},
		warn: (msg: string, ...args: LoggableValue[]) => {
			if (LOG_LEVEL_MAP.warn.priority <= maxEnabledPriority) log('warn', `[${name}] ${msg}`, args);
		},
		info: (msg: string, ...args: LoggableValue[]) => {
			if (LOG_LEVEL_MAP.info.priority <= maxEnabledPriority) log('info', `[${name}] ${msg}`, args);
		},
		debug: (msg: string, ...args: LoggableValue[]) => {
			if (LOG_LEVEL_MAP.debug.priority <= maxEnabledPriority) log('debug', `[${name}] ${msg}`, args);
		},
		trace: (msg: string, ...args: LoggableValue[]) => {
			if (LOG_LEVEL_MAP.trace.priority <= maxEnabledPriority) log('trace', `[${name}] ${msg}`, args);
		}
	}),

	dump: (data: LoggableValue, label?: string) => {
		if (LOG_LEVEL_MAP.trace.priority <= maxEnabledPriority) {
			const prefix = label ? `DUMP[${label}]` : 'DUMP';
			log('trace', prefix, [data]);
		}
	},

	// Configuration Methods
	refreshLogLevels: () => {
		updateMaxEnabledPriority();
	},
	setCustomLogTarget: (target: (level: LogLevel, message: string, args: LoggableValue[]) => void) => {
		config.customLogTarget = target;
	},
	enableErrorTracking: (enabled: boolean) => {
		config.errorTrackingEnabled = enabled;
	},
	setLogDirectory: (directory: string) => {
		config.logDirectory = directory;
		if (!building) safeExecute(serverFileOps.initializeLogFile);
	},
	setLogFileName: (fileName: string) => {
		config.logFileName = fileName;
	},
	setBatchSize: (size: number) => {
		config.batchSize = size;
	},
	setBatchTimeout: (timeout: number) => {
		config.batchTimeout = timeout;
	},
	setCompressionEnabled: (enabled: boolean) => {
		config.compressionEnabled = enabled;
	},
	setLogRotationInterval: (ms: number) => {
		config.logRotationInterval = ms;
	},
	addLogFilter: (filter: (entry: LogEntry) => boolean) => {
		config.filters.push(filter);
	},
	clearLogFilters: () => {
		config.filters = [];
	},
	addSensitiveKeys: (keys: string[]) => {
		config.masking.sensitiveKeys.push(...keys);
	},
	addEmailKeys: (keys: string[]) => {
		config.masking.emailKeys.push(...keys);
	},
	addCustomMask: (key: string, maskFn: (value: string) => string) => {
		config.masking.customMasks[key] = maskFn;
	},
	clearCustomMasks: () => {
		config.masking.customMasks = {};
	},
	setSourceFileTracking: (levels: LogLevel[]) => {
		config.sourceFileTracking = levels;
	}
};

// Public Logger Interface (no-op when disabled at build time)
const noop = () => {};
const noopChannel = () => ({ fatal: noop, error: noop, warn: noop, info: noop, debug: noop, trace: noop });

const noopLogger: typeof activeLogger = {
	fatal: () => {},
	error: () => {},
	warn: () => {},
	info: () => {},
	debug: () => {},
	trace: () => {},
	channel: (name: string) => {
		void name;
		return noopChannel();
	},
	dump: (data: LoggableValue, label?: string) => {
		void data;
		void label;
	},
	refreshLogLevels: () => {},
	setCustomLogTarget: (t: (level: LogLevel, message: string, args: LoggableValue[]) => void) => {
		void t;
	},
	enableErrorTracking: (e: boolean) => {
		void e;
	},
	setLogDirectory: (d: string) => {
		void d;
	},
	setLogFileName: (f: string) => {
		void f;
	},
	setBatchSize: (s: number) => {
		void s;
	},
	setBatchTimeout: (t: number) => {
		void t;
	},
	setCompressionEnabled: (e: boolean) => {
		void e;
	},
	setLogRotationInterval: (ms: number) => {
		void ms;
	},
	addLogFilter: (f: (entry: LogEntry) => boolean) => {
		void f;
	},
	clearLogFilters: () => {},
	addSensitiveKeys: (k: string[]) => {
		void k;
	},
	addEmailKeys: (k: string[]) => {
		void k;
	},
	addCustomMask: (k: string, m: (value: string) => string) => {
		void k;
		void m;
	},
	clearCustomMasks: () => {},
	setSourceFileTracking: (l: LogLevel[]) => {
		void l;
	}
};

export const logger = IS_LOGGING_DISABLED ? noopLogger : activeLogger;
