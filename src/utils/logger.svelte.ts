/**
 * @file src/utils/logger.svelte.ts
 * @description Logger for SvelteKit applications.
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
export type LoggableValue = string | number | boolean | null | unknown | undefined | Date | RegExp | object | Error;

// Define a type that can be either an array or an object
type LoggableData = LoggableValue[] | Record<string, LoggableValue>;
type LogEntry = {
	level: LogLevel;
	message: string;
	args: LoggableValue[];
	timestamp: Date;
};

// Color Codes for Terminal Output
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

// Map log levels to colors and priorities
const LOG_LEVEL_MAP: Record<LogLevel, { priority: number; color: keyof typeof TERMINAL_COLORS }> = {
	none: { priority: 0, color: 'reset' }, // Most restrictive: no logs
	fatal: { priority: 1, color: 'magenta' }, // Only fatal errors
	error: { priority: 2, color: 'red' }, // Fatal and error
	warn: { priority: 3, color: 'yellow' }, // Fatal, error, and warnings
	info: { priority: 4, color: 'green' }, // Fatal, error, warnings, and info
	debug: { priority: 5, color: 'blue' }, // All except trace
	trace: { priority: 6, color: 'cyan' } // Least restrictive: all log levels
};

// Configuration with Defaults
const config = $state({
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
		sensitiveKeys: new Set(['password', 'secret', 'token', 'key']),
		emailKeys: new Set(['email', 'mail']),
		customMasks: {} as Record<string, (value: string) => string>,
		maxDepth: 5 // Limit recursion depth for masking
	},
	includeSourceFile: true // Option to enable/disable source file extraction
});

// Default Custom Log Target for Browser
if (!isServer && !config.customLogTarget) {
	config.customLogTarget = (level, message, args) => {
		const consoleMethod = {
			fatal: 'error',
			error: 'error',
			warn: 'warn',
			info: 'info',
			debug: 'debug',
			trace: 'log'
		}[level] || 'log';
		console[consoleMethod](`[${level.toUpperCase()}] ${message}`, ...args);
	};
}

// Batch Logging State
const state = $state({
	queue: [] as LogEntry[],
	batchTimeout: null as NodeJS.Timeout | null,
	abortTimeout: null as NodeJS.Timeout | null
});

// Helper Functions
const isLogLevelEnabled = (level: LogLevel): boolean => {
	return publicEnv.LOG_LEVELS.includes(level);
};

// Format timestamp in gray color
const getTimestamp = (): string => {
	const now = new Date();
	const timestamp = now.toISOString().slice(0, -1).replace('T', ' ');
	return isServer ? `${TERMINAL_COLORS.gray}${timestamp}${TERMINAL_COLORS.reset}` : timestamp;
};

// Helper to format a log entry specifically for file output
const formatLogEntryForFile = (entry: LogEntry): string => {
	return `${entry.timestamp.toISOString()} [${entry.level.toUpperCase()}] ${entry.message} ${JSON.stringify(entry.args)}`;
};

// Safe execution wrapper
const safeExecute = async (fn: () => Promise<void>): Promise<void> => {
	try {
		await fn();
	} catch (error) {
		if (isServer) console.error('Error in logger function:', error);
	}
};

// Value Formatting Utilities
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

// Masking Utilities
const maskEmail = (email: string): string => {
	const [localPart, domain] = email.split('@');
	const maskedLocalPart = localPart.slice(0, 2) + '*'.repeat(localPart.length - 2);
	const [domainName, tld] = domain.split('.');
	const maskedDomain = '*'.repeat(domainName.length);
	return `${maskedLocalPart}@${maskedDomain}.${tld}`;
};

const maskSensitiveData = (data: LoggableValue, depth = 0): LoggableValue => {
	if (typeof data !== 'object' || data === null || (config.masking.maxDepth && depth >= config.masking.maxDepth)) {
		return data;
	}

	const maskedData: LoggableData = Array.isArray(data) ? [] : {};

	for (const [key, value] of Object.entries(data)) {
		if (typeof value === 'string') {
			const lowerKey = key.toLowerCase();

			const customMaskKey = Object.keys(config.masking.customMasks).find(mask => lowerKey.includes(mask));
			if (customMaskKey) {
				(maskedData as Record<string, LoggableValue>)[key] = config.masking.customMasks[customMaskKey](value);
			} else if (config.masking.sensitiveKeys.has(lowerKey)) {
				(maskedData as Record<string, LoggableValue>)[key] = '[REDACTED]';
			}
			// Check email keys
			else if (config.masking.emailKeys.has(lowerKey)) {
				(maskedData as Record<string, LoggableValue>)[key] = maskEmail(value);
			} else {
				(maskedData as Record<string, LoggableValue>)[key] = value;
			}
		} else if (typeof value === 'object' && value !== null) {
			(maskedData as Record<string, LoggableValue>)[key] = maskSensitiveData(value, depth + 1);
		} else {
			(maskedData as Record<string, LoggableValue>)[key] = value;
		}
	}
	return maskedData;
};

// Batch processing utilities
function abortBatch(): void {
	if (state.batchTimeout) {
		clearTimeout(state.batchTimeout);
		state.batchTimeout = null;
	}
	if (state.abortTimeout) {
		clearTimeout(state.abortTimeout);
		state.abortTimeout = null;
	}
}

// Effect to process batches when queue changes
$effect.root(() => {
	$effect(() => {
		if (state.queue.length >= config.batchSize) {
			processBatch();
		}
	});

	return () => {
		abortBatch();
	};
});

// Format values (colorize types like booleans, numbers)
const processBatch = async (): Promise<void> => {
	if (!isServer || state.queue.length === 0) return;

	const currentBatch = [...state.queue];
	state.queue = [];

	const filteredEntries = currentBatch.filter(entry => config.filters.every(filter => filter(entry)));
	if (filteredEntries.length === 0) return;

	// Use the helper function for formatting
	const logStrings = filteredEntries.map(formatLogEntryForFile);
	const combinedLog = logStrings.join('\n') + '\n';

	const { appendFile } = await import('node:fs/promises');
	const { join } = await import('node:path');
	const logFilePath = join(config.logDirectory, config.logFileName);

	try {
		await appendFile(logFilePath, combinedLog);
		await serverFileOps.rotateLogFile();
	} catch (error) {
		console.error('Failed to write batch to log file:', error);
	}
};

const scheduleBatchProcessing = (): void => {
	if (!isServer) return;
	if (state.batchTimeout) clearTimeout(state.batchTimeout);
	state.batchTimeout = setTimeout(() => safeExecute(processBatch), config.batchTimeout);
	abortBatch();
};

// Server-Side File Operations
const serverFileOps = isServer
	? {
		async initializeLogFile(): Promise<void> {
			try {
				// Import only what's needed in the try block
				const { mkdir, access, constants } = await import('node:fs/promises');
				const { join } = await import('node:path');

				const logDir = config.logDirectory; // Use const as logDir is not reassigned here
				try {
					await access(logDir, constants.F_OK);
				} catch {
					await mkdir(logDir, { recursive: true });
				}

				const logFilePath = join(logDir, config.logFileName);
				try {
					await access(logFilePath, constants.F_OK);
				} catch {
					const { writeFile } = await import('node:fs/promises');
					await writeFile(logFilePath, '');
				}
			} catch (error) {
				console.error('Error initializing log file, falling back to temp directory:', error);
				// Import tmpdir here where it's needed
				const { tmpdir } = await import('node:path');
				config.logDirectory = tmpdir();
				// Import only what's needed in the catch block (access, writeFile)
				const { access } = await import('node:fs/promises');
				const { join } = await import('node:path'); // Keep join import
				try {
					// Check access to the fallback directory
					await access(config.logDirectory); // constants.F_OK is default for access check
					const logFilePath = join(config.logDirectory, config.logFileName);
					const { writeFile } = await import('node:fs/promises');
					await writeFile(logFilePath, '');
				} catch (fallbackError) {
					console.error('Failed to initialize log file in temp directory, disabling file logging:', fallbackError);
					// Disable file writing if fallback fails
					serverFileOps.writeToFile = async () => { }; // Explicitly disable
				}
			}
		},

		async rotateLogFile(): Promise<void> {
			try {
				const { stat, rename, unlink } = await import('node:fs/promises');
				const { join } = await import('node:path');
				const { createGzip } = await import('node:zlib');
				const { createReadStream, createWriteStream } = await import('node:fs');
				const { promisify } = await import('node:util');
				const { pipeline } = await import('node:stream');
				const pipelineAsync = promisify(pipeline);

				const logFilePath = join(config.logDirectory, config.logFileName);
				const stats = await stat(logFilePath);

				if (stats.size >= config.logRotationSize) {
					const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
					const rotatedFilePath = `${logFilePath}.${timestamp}`;

					await rename(logFilePath, rotatedFilePath);
					const { writeFile } = await import('node:fs/promises');
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
			// This function is kept for potential future use or direct calls,
			// but batch processing uses appendFile directly for performance.
			try {
				const { appendFile } = await import('node:fs/promises');
				const { join } = await import('node:path');

				const logFilePath = join(config.logDirectory, config.logFileName);
				// Use the helper function for formatting and add newline
				const formattedLog = formatLogEntryForFile(entry) + '\n';

				await appendFile(logFilePath, formattedLog);
				// Rotation check is removed here; handled after batch writes in processBatch
			} catch (error) {
				console.error('Failed to write single entry to log file:', error); // Slightly more specific error message
			}
		}
	}
	: {
		async initializeLogFile(): Promise<void> { },
		async rotateLogFile(): Promise<void> { },
		async writeToFile(): Promise<void> { }
	};

// Initialize log file on server startup
$effect.root(() => {
	if (isServer) {
		safeExecute(serverFileOps.initializeLogFile);
	}
});

// Unified Logger Function
const log = (level: LogLevel, message: string, ...args: LoggableValue[]): void => {
	// Only proceed if the log level is enabled
	if (!isLogLevelEnabled(level)) return;

	const timestamp = getTimestamp();
	const maskedArgs = args.map((arg) => maskSensitiveData(arg));

	// Extract the source file using stack trace
	let sourceFile = '';
	if (isServer && config.includeSourceFile) {
		try {
			const error = new Error();
			const stack = error.stack || '';
			const stackLines = stack.split('\n');
			const callerLine = stackLines[3] || '';
			const match = callerLine.match(/\(([^)]+)\)/) || callerLine.match(/at ([^\s]+)/);
			if (match && match[1]) {
				sourceFile = match[1].split('/').pop()?.replace(/[()]/g, '') || 'unknown';
			}
		} catch {
			sourceFile = 'unknown';
		}
	}

	// Server-side console output with colors and source file
	if (isServer) {
		const color = TERMINAL_COLORS[LOG_LEVEL_MAP[level].color];
		process.stdout.write(
			`${timestamp} ${sourceFile} ${color}[${level.toUpperCase()}]${TERMINAL_COLORS.reset}: ${message} ${maskedArgs
				.map((arg) => formatValue(arg))
				.join(' ')}\n`
		);

		const entry: LogEntry = { level, message, args: maskedArgs, timestamp: new Date() };
		state.queue = [...state.queue, entry];
		scheduleBatchProcessing();
	} else if (config.customLogTarget) {
		config.customLogTarget(level, message, maskedArgs);
	}
};

// Logger Interface
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
		keys.forEach(key => config.masking.sensitiveKeys.add(key));
	},
	addEmailKeys: (keys: string[]) => {
		keys.forEach(key => config.masking.emailKeys.add(key));
	},
	addCustomMask: (key: string, maskFn: (value: string) => string) => {
		config.masking.customMasks[key] = maskFn;
	},
	clearCustomMasks: () => {
		config.masking.customMasks = {};
	},
	setIncludeSourceFile: (enabled: boolean) => {
		config.includeSourceFile = enabled;
	}
};
