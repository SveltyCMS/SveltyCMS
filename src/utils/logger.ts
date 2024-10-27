/**
 * @file src/utils/logger.ts
 * @description An enhanced comprehensive logger for SvelteKit applications.
 *
 * Features:
 * - Performance optimization with batch logging
 * - Support for structured logging
 * - Log rotation and compression
 * - Custom log formatters
 * - Log level override for specific modules
 * - Error tracking service integration
 * - Multiple log targets support
 * - Log filtering and aggregation
 */

import { browser } from '$app/environment';
import { publicEnv } from '@root/config/public';

// Check if running on the server
const isServer = !browser;

// Type Definitions
type LogLevel = (typeof publicEnv.LOG_LEVELS)[number];

// Define a type for loggable values
export type LoggableValue = string | number | boolean | null | undefined | Date | RegExp | object;

// Define a type that can be either an array or an object
type LoggableData = LoggableValue[] | Record<string, LoggableValue>;
type LogEntry = {
	level: LogLevel;
	message: string;
	args: LoggableValue[];
	timestamp: Date;
};

// Masking configuration type
type MaskingConfig = {
	sensitiveKeys: string[];
	emailKeys: string[];
	customMasks: Record<string, (value: string) => string>;
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
	none: { priority: 0, color: 'reset' }, // Most restrictive: no logs
	fatal: { priority: 1, color: 'magenta' }, // Only fatal errors
	error: { priority: 2, color: 'red' }, // Fatal and error
	warn: { priority: 3, color: 'yellow' }, // Fatal, error, and warnings
	info: { priority: 4, color: 'green' }, // Fatal, error, warnings, and info
	debug: { priority: 5, color: 'blue' }, // All except trace
	trace: { priority: 6, color: 'cyan' } // Least restrictive: all log levels
};

// Configuration with defaults
const config = {
	logRotationSize: 5 * 1024 * 1024, // 5MB
	logDirectory: 'logs',
	logFileName: 'app.log',
	errorTrackingEnabled: false,
	batchSize: 100, // Number of logs to batch before writing
	batchTimeout: 5000, // Flush batch after 5 seconds
	compressionEnabled: true,
	customLogTarget: null as ((level: LogLevel, message: string, args: LoggableValue[]) => void) | null,
	filters: [] as ((entry: LogEntry) => boolean)[],
	masking: {
		sensitiveKeys: ['password', 'secret', 'token', 'key'],
		emailKeys: ['email', 'mail'],
		customMasks: {} as Record<string, (value: string) => string>
	} as MaskingConfig
};

// Batch logging queue and timeouts
let logQueue: LogEntry[] = [];
let batchTimeout: NodeJS.Timeout | null = null;
let abortTimeout: NodeJS.Timeout | null = null;

// Helper Functions
const isLogLevelEnabled = (level: LogLevel): boolean => {
	// Retrieve the highest allowed log level from LOG_LEVELS
	const highestAllowedLevel = publicEnv.LOG_LEVELS[0];
	const currentLogLevel = LOG_LEVEL_MAP[highestAllowedLevel].priority;
	return LOG_LEVEL_MAP[level].priority <= currentLogLevel;
};

// Format timestamp in gray color
const getTimestamp = (): string => {
	const now = new Date();
	return isServer ? `${TERMINAL_COLORS.gray}${now.toISOString()}${TERMINAL_COLORS.reset}` : now.toISOString();
};

// Safe execution wrapper
const safeExecute = async (fn: () => Promise<void>): Promise<void> => {
	try {
		await fn();
	} catch (error) {
		if (isServer) console.error('Error in logger function:', error);
	}
};

// Value formatting utilities
const formatters = {
	parseJSON(value: string): object | null {
		try {
			const parsed = JSON.parse(value);
			return typeof parsed === 'object' && parsed !== null ? parsed : null;
		} catch {
			return null;
		}
	},

	colorizeString(value: string): string {
		if (!isServer) return value;
		return value.replace(/\b(\d+(\.\d+)?|true|false)\b/g, (match) => {
			if (match === 'true') return `${TERMINAL_COLORS.green}${match}${TERMINAL_COLORS.reset}`;
			if (match === 'false') return `${TERMINAL_COLORS.red}${match}${TERMINAL_COLORS.reset}`;
			return `${TERMINAL_COLORS.blue}${match}${TERMINAL_COLORS.reset}`;
		});
	},

	formatObject(obj: object): string {
		if (!isServer) return JSON.stringify(obj);
		const entries = Object.entries(obj);
		if (entries.length === 0) return `${TERMINAL_COLORS.yellow}{}${TERMINAL_COLORS.reset}`;
		const formatted = entries
			.map(([k, v]) => `${TERMINAL_COLORS.cyan}${k}${TERMINAL_COLORS.reset}: ${formatValue(v as LoggableValue)}`)
			.join(`${TERMINAL_COLORS.yellow},${TERMINAL_COLORS.reset} `);
		return `${TERMINAL_COLORS.yellow}{${TERMINAL_COLORS.reset}${formatted}${TERMINAL_COLORS.yellow}}${TERMINAL_COLORS.reset}`;
	},

	formatArray(arr: LoggableValue[]): string {
		if (!isServer) return JSON.stringify(arr);
		return (
			`${TERMINAL_COLORS.yellow}[${TERMINAL_COLORS.reset}` +
			arr.map((value: LoggableValue) => formatValue(value)).join(`${TERMINAL_COLORS.yellow},${TERMINAL_COLORS.reset} `) +
			`${TERMINAL_COLORS.yellow}]${TERMINAL_COLORS.reset}`
		);
	}
};

const formatValue = (value: LoggableValue): string => {
	if (!isServer) return String(value);

	switch (typeof value) {
		case 'boolean':
			return value ? `${TERMINAL_COLORS.green}true${TERMINAL_COLORS.reset}` : `${TERMINAL_COLORS.red}false${TERMINAL_COLORS.reset}`;
		case 'number':
			return `${TERMINAL_COLORS.blue}${value}${TERMINAL_COLORS.reset}`;
		case 'string': {
			const parsedObject = formatters.parseJSON(value);
			return parsedObject ? formatters.formatObject(parsedObject) : formatters.colorizeString(value);
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
const maskEmail = (email: string): string => {
	const [localPart, domain] = email.split('@');
	const maskedLocalPart = localPart.slice(0, 2) + '*'.repeat(localPart.length - 2);
	const [domainName, tld] = domain.split('.');
	const maskedDomain = '*'.repeat(domainName.length);
	return `${maskedLocalPart}@${maskedDomain}.${tld}`;
};

const maskSensitiveData = (data: LoggableValue): LoggableValue => {
	if (typeof data !== 'object' || data === null) return data;

	const maskedData: LoggableData = Array.isArray(data) ? [] : {};

	for (const [key, value] of Object.entries(data)) {
		if (typeof value === 'string') {
			const lowerKey = key.toLowerCase();

			// Check custom masks first
			if (Object.keys(config.masking.customMasks).some((mask) => lowerKey.includes(mask))) {
				const maskFn = Object.entries(config.masking.customMasks).find(([mask]) => lowerKey.includes(mask))?.[1];
				if (maskFn) {
					(maskedData as Record<string, LoggableValue>)[key] = maskFn(value);
					continue;
				}
			}

			// Check sensitive keys
			if (config.masking.sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
				(maskedData as Record<string, LoggableValue>)[key] = '[REDACTED]';
			}
			// Check email keys
			else if (config.masking.emailKeys.some((emailKey) => lowerKey.includes(emailKey))) {
				(maskedData as Record<string, LoggableValue>)[key] = maskEmail(value);
			} else {
				(maskedData as Record<string, LoggableValue>)[key] = value;
			}
		} else if (typeof value === 'object' && value !== null) {
			(maskedData as Record<string, LoggableValue>)[key] = maskSensitiveData(value);
		} else {
			(maskedData as Record<string, LoggableValue>)[key] = value;
		}
	}
	return maskedData;
};

// Batch processing utilities
const abortBatch = (): void => {
	if (!isServer) return;
	if (abortTimeout) clearTimeout(abortTimeout);
	abortTimeout = setTimeout(() => {
		if (logQueue.length === 0 && batchTimeout) {
			clearTimeout(batchTimeout);
			batchTimeout = null;
		}
	}, config.batchTimeout);
};

// Format values (colorize types like booleans, numbers)
const processBatch = async (): Promise<void> => {
	if (!isServer || logQueue.length === 0) return;

	const currentBatch = [...logQueue];
	logQueue = [];

	for (const entry of currentBatch) {
		if (config.filters.every((filter) => filter(entry))) {
			await serverFileOps.writeToFile(entry);
		}
	}
};

const scheduleBatchProcessing = (): void => {
	if (!isServer) return;
	if (batchTimeout) clearTimeout(batchTimeout);
	batchTimeout = setTimeout(() => safeExecute(processBatch), config.batchTimeout);
	abortBatch();
};

// Server-side file operations
const serverFileOps = {
	async initializeLogFile(): Promise<void> {
		if (!isServer) return;

		const { mkdir, access, constants } = await import('fs/promises');
		const { join } = await import('path');

		try {
			await access(config.logDirectory, constants.F_OK);
		} catch {
			await mkdir(config.logDirectory, { recursive: true });
		}

		const logFilePath = join(config.logDirectory, config.logFileName);
		try {
			await access(logFilePath, constants.F_OK);
		} catch {
			const { writeFile } = await import('fs/promises');
			await writeFile(logFilePath, '');
		}
	},

	async rotateLogFile(): Promise<void> {
		if (!isServer) return;

		const { stat, rename, unlink } = await import('fs/promises');
		const { join } = await import('path');
		const { createGzip } = await import('zlib');
		const { createReadStream, createWriteStream } = await import('fs');
		const { promisify } = await import('util');
		const { pipeline } = await import('stream');
		const pipelineAsync = promisify(pipeline);

		const logFilePath = join(config.logDirectory, config.logFileName);
		try {
			const stats = await stat(logFilePath);
			if (stats.size >= config.logRotationSize) {
				const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
				const rotatedFilePath = `${logFilePath}.${timestamp}`;

				await rename(logFilePath, rotatedFilePath);
				const { writeFile } = await import('fs/promises');
				await writeFile(logFilePath, '');

				if (config.compressionEnabled) {
					const gzip = createGzip();
					const source = createReadStream(rotatedFilePath);
					const destination = createWriteStream(`${rotatedFilePath}.gz`);
					await pipelineAsync(source, gzip, destination);
					await unlink(rotatedFilePath);
				}
			}
		} catch (error) {
			console.error('Error rotating log file:', error);
		}
	},

	async writeToFile(entry: LogEntry): Promise<void> {
		if (!isServer) return;

		const { appendFile } = await import('fs/promises');
		const { join } = await import('path');

		try {
			const logFilePath = join(config.logDirectory, config.logFileName);
			const formattedLog = `${entry.timestamp.toISOString()} [${entry.level.toUpperCase()}] ${entry.message} ${JSON.stringify(entry.args)}\n`;

			await appendFile(logFilePath, formattedLog);
			await this.rotateLogFile();
		} catch (error) {
			console.error('Failed to write to log file:', error);
		}
	}
};

// Unified logger function
const log = (level: LogLevel, message: string, ...args: LoggableValue[]): void => {
	// Only proceed if the log level is enabled
	if (!isLogLevelEnabled(level)) return;

	const timestamp = getTimestamp();
	const maskedArgs = args.map((arg) => maskSensitiveData(arg));
	const entry: LogEntry = { level, message, args: maskedArgs, timestamp: new Date() };

	if (!isServer) {
		console.log(
			`${timestamp} [${level.toUpperCase()}] ${message}`,
			...maskedArgs.map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : arg))
		);
		return;
	}

	const color = TERMINAL_COLORS[LOG_LEVEL_MAP[level].color];
	process.stdout.write(
		`${timestamp} ${color}[${level.toUpperCase()}]${TERMINAL_COLORS.reset}: ${message} ${maskedArgs.map((arg) => formatValue(arg)).join(' ')}\n`
	);

	logQueue.push(entry);
	scheduleBatchProcessing();

	if (config.customLogTarget) {
		config.customLogTarget(level, message, maskedArgs);
	}
};

// Initialize log file
if (isServer) {
	safeExecute(serverFileOps.initializeLogFile);
}

// Logger interface
export const logger = {
	fatal: (message: string, ...args: LoggableValue[]) => log('fatal', message, ...args),
	error: (message: string, ...args: LoggableValue[]) => log('error', message, ...args),
	warn: (message: string, ...args: LoggableValue[]) => log('warn', message, ...args),
	info: (message: string, ...args: LoggableValue[]) => log('info', message, ...args),
	debug: (message: string, ...args: LoggableValue[]) => log('debug', message, ...args),
	trace: (message: string, ...args: LoggableValue[]) => log('trace', message, ...args),

	// Configuration methods
	setCustomLogTarget: (target: (level: LogLevel, message: string, args: LoggableValue[]) => void) => {
		config.customLogTarget = target;
	},
	enableErrorTracking: (enabled: boolean) => {
		config.errorTrackingEnabled = enabled;
	},
	setLogDirectory: (directory: string) => {
		config.logDirectory = directory;
		if (isServer) {
			safeExecute(serverFileOps.initializeLogFile);
		}
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
	}
};
