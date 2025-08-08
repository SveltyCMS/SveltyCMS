/**
 * @file src/utils/logger.svelte.ts
 * @description System Logger for SveltyCMS
 *
 * Features:
 * - Performance optimization with batch logging and optimized file I/O
 * - Support for structured logging
 * - Log rotation and compression
 * - Custom log formatters
 * - Conditional source file tracking
 * - Error tracking service integration
 * - Multiple log targets support
 * - Log filtering and aggregation
 * - Log retention policy to automatically delete old log files
 */

import { browser, building } from '$app/environment';
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

// Configuration with defaults using $state
// Defaults are aligned with publicEnv for consistency, but can be overridden
const config = $state({
	logRotationSize: publicEnv.LOG_ROTATION_SIZE || 5 * 1024 * 1024, // 5MB
	logRetentionDays: publicEnv.LOG_RETENTION_DAYS || 2, // Default to 2 days
	logDirectory: 'logs',
	logFileName: 'app.log',
	errorTrackingEnabled: false,
	batchSize: 100, // Number of logs to batch before writing
	batchTimeout: 5000, // Flush batch after 5 seconds
	compressionEnabled: true,
	customLogTarget: null as ((level: LogLevel, message: string, args: LoggableValue[]) => void) | null,
	filters: [] as ((entry: LogEntry) => boolean)[],
	sourceFileTracking: ['fatal', 'error'] as LogLevel[],
	masking: {
		sensitiveKeys: ['password', 'secret', 'token', 'key'],
		emailKeys: ['email', 'mail', 'createdby', 'updatedby', 'user'],
		customMasks: {} as Record<string, (value: string) => string>
	} as MaskingConfig
});

// Batch logging state
const state = $state({
	queue: [] as LogEntry[],
	batchTimeout: null as NodeJS.Timeout | null,
	abortTimeout: null as NodeJS.Timeout | null
});

// Helper Functions
const isLogLevelEnabled = (level: LogLevel): boolean => {
	// Ensure publicEnv.LOG_LEVELS is properly initialized and includes the level
	if (!publicEnv.LOG_LEVELS || !Array.isArray(publicEnv.LOG_LEVELS)) {
		return false; // Or handle as an error/default to a safe level
	}
	return publicEnv.LOG_LEVELS.includes(level);
};

// Format timestamp in gray color
const getTimestamp = (): string => {
	const now = new Date();
	const timestamp = now.toISOString().slice(0, -1).replace('T', ' ');
	return isServer ? `${TERMINAL_COLORS.gray}${timestamp}${TERMINAL_COLORS.reset}` : timestamp;
};

// Safe execution wrapper
function safeExecute(fn: () => Promise<void>) {
	if (isServer && !building) {
		fn().catch((err) => {
			// Check if this is a Vite module runner error during HMR/restart
			if (err instanceof Error && err.message.includes('Vite module runner has been closed')) {
				// Silently ignore - this happens during HMR or when dev server restarts
				return;
			}
			// Use console.error directly to avoid recursive logging errors
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
		if (!isServer) return value;
		return value.replace(/\b(\d+(\.\d+)?|true|false)\b/g, (match) => {
			if (match === 'true') return `${TERMINAL_COLORS.green}${match}${TERMINAL_COLORS.reset}`;
			if (match === 'false') return `${TERMINAL_COLORS.red}${match}${TERMINAL_COLORS.reset}`;
			return `${TERMINAL_COLORS.blue}${match}${TERMINAL_COLORS.reset}`;
		});
	},
	formatObject: (obj: object): string => {
		if (!isServer) return JSON.stringify(obj);
		const entries = Object.entries(obj);
		if (entries.length === 0) return `${TERMINAL_COLORS.yellow}{}${TERMINAL_COLORS.reset}`;
		const formatted = entries
			.map(([k, v]) => `${TERMINAL_COLORS.cyan}${k}${TERMINAL_COLORS.reset}: ${formatValue(v as LoggableValue)}`)
			.join(`${TERMINAL_COLORS.yellow},${TERMINAL_COLORS.reset} `);
		return `${TERMINAL_COLORS.yellow}{${TERMINAL_COLORS.reset}${formatted}${TERMINAL_COLORS.yellow}}${TERMINAL_COLORS.reset}`;
	},
	formatArray: (arr: LoggableValue[]): string => {
		if (!isServer) return JSON.stringify(arr);
		return `${TERMINAL_COLORS.yellow}[${TERMINAL_COLORS.reset}${arr.map(formatValue).join(`${TERMINAL_COLORS.yellow},${TERMINAL_COLORS.reset} `)}${TERMINAL_COLORS.yellow}]${TERMINAL_COLORS.reset}`;
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
const maskEmail = (email: string): string => {
	const [localPart, domain] = email.split('@');
	if (!domain) return '*'.repeat(email.length);
	const maskedLocalPart = localPart.length > 2 ? localPart.slice(0, 2) + '*'.repeat(localPart.length - 2) : '**';
	const [domainName, tld] = domain.split('.');
	const maskedDomain = '*'.repeat(domainName.length);
	return `${maskedLocalPart}@${maskedDomain}.${tld || ''}`;
};

const maskSensitiveData = (data: LoggableValue): LoggableValue => {
	if (typeof data !== 'object' || data === null) return data;
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
			(maskedData as Record<string, LoggableValue>)[key] = typeof value === 'object' && value !== null ? maskSensitiveData(value) : value;
		}
	}
	return maskedData;
};

// Batch processing utilities
const processBatch = async (): Promise<void> => {
	if (state.queue.length === 0) return;
	const currentBatch = [...state.queue];
	state.queue = [];

	const filteredBatch = config.filters.length > 0 ? currentBatch.filter((entry) => config.filters.every((filter) => filter(entry))) : currentBatch;

	if (filteredBatch.length === 0) return;

	if (isServer && !building) {
		await serverFileOps.writeBatchToFile(filteredBatch);
	}
	if (config.customLogTarget) {
		for (const { level, message, args } of filteredBatch) {
			config.customLogTarget(level, message, args);
		}
	}
};

const scheduleBatchProcessing = (): void => {
	if (!isServer || building) return;
	if (state.batchTimeout) clearTimeout(state.batchTimeout);
	state.batchTimeout = setTimeout(() => safeExecute(processBatch), config.batchTimeout);
};

// Server-Side Operations
const serverFileOps = isServer
	? {
			_logStream: null as unknown, // Store the write stream instance
			async _getModules() {
				const fsPromises = await import('node:fs/promises');
				const path = await import('node:path');
				const zlib = await import('node:zlib');
				const fs = await import('node:fs');
				const stream = await import('node:stream/promises');
				return { fsPromises, path, zlib, fs, stream };
			},
			async getLogStream(): Promise<unknown> {
				const { path, fs } = await this._getModules();
				if (!this._logStream || this._logStream.writableEnded || this._logStream.destroyed) {
					const logFilePath = path.join(config.logDirectory, config.logFileName);
					this._logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
					this._logStream.on('error', (err: Error) => {
						console.error('Log stream error:', err);
						// Invalidate the stream on error to force re-initialization
						this._logStream = null;
					});
					this._logStream.on('finish', () => {
						this._logStream = null; // Clear stream reference after it finishes
					});
				}
				return this._logStream;
			},
			async initializeLogFile(): Promise<void> {
				const { fsPromises, path } = await this._getModules();
				const maxRetries = 3;
				let retryCount = 0;

				// Close existing stream if any before re-initializing
				if (this._logStream) {
					this._logStream.end();
					this._logStream = null;
				}

				while (retryCount < maxRetries) {
					try {
						// Check if directory exists and is accessible
						try {
							await fsPromises.access(config.logDirectory);
						} catch {
							// Directory doesn't exist or isn't accessible - try to create it
							await fsPromises.mkdir(config.logDirectory, {
								recursive: true,
								mode: 0o755 // rwxr-xr-x
							});
						}

						// Verify directory permissions
						const stats = await fsPromises.stat(config.logDirectory);
						if (!stats.isDirectory()) {
							throw new Error('Log path is not a directory');
						}

						// Initialize log file (ensure it exists)
						const logFilePath = path.join(config.logDirectory, config.logFileName);
						try {
							await fsPromises.access(logFilePath);
						} catch {
							await fsPromises.writeFile(logFilePath, '', { mode: 0o644 });
						}
						return; // Success
					} catch (error) {
						retryCount++;
						if (retryCount >= maxRetries) {
							console.error(`Failed to initialize log directory after ${maxRetries} attempts:`, error);
							throw error;
						}
						// Wait before retrying
						await new Promise((resolve) => setTimeout(resolve, 500 * retryCount));
					}
				}
			},
			async checkAndRotateLogFile(): Promise<void> {
				const { fsPromises, path, zlib, fs, stream } = await this._getModules();
				const logFilePath = path.join(config.logDirectory, config.logFileName);
				try {
					const stats = await fsPromises.stat(logFilePath);
					if (stats.size < config.logRotationSize) return;

					// Close the current log stream before rotation
					if (this._logStream) {
						this._logStream.end();
						this._logStream = null;
					}

					const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
					const rotatedFilePath = `${logFilePath}.${timestamp}`;
					await fsPromises.rename(logFilePath, rotatedFilePath);
					await fsPromises.writeFile(logFilePath, ''); // Create a new empty log file

					if (config.compressionEnabled) {
						const source = fs.createReadStream(rotatedFilePath);
						const destination = fs.createWriteStream(`${rotatedFilePath}.gz`);
						await stream.pipeline(source, zlib.createGzip(), destination);
						await fsPromises.unlink(rotatedFilePath);
					}
				} catch (error) {
					// Ignore if file doesn't exist, as it will be created on next write.
					if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
						console.error('Error rotating log file:', error);
					}
				}
			},
			async cleanOldLogFiles(): Promise<void> {
				const { fsPromises, path } = await this._getModules();
				const files = await fsPromises.readdir(config.logDirectory);
				const now = Date.now();
				const cutoff = now - config.logRetentionDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds

				for (const file of files) {
					const filePath = path.join(config.logDirectory, file);
					try {
						const stats = await fsPromises.stat(filePath);
						// Check if it's a file, older than cutoff, and not the current active log file
						// Also ensure it's a rotated log file (ends with .gz or has a timestamp part)
						if (stats.isFile() && stats.mtimeMs < cutoff && file !== config.logFileName) {
							// Basic check to ensure it's a rotated log (e.g., app.log.2023-10-26T...)
							// This regex checks for files named like 'app.log.YYYY-MM-DDTHH-MM-SS-msZ' or 'app.log.YYYY-MM-DDTHH-MM-SS-msZ.gz'
							const rotatedLogPattern = new RegExp(
								`^${config.logFileName.replace(/[.*+?^${}()|[\\\]]/g, '\\$&')}\\.\\d{4}-\\d{2}-\\d{2}T\\d{2}-\\d{2}-\\d{2}-\\d{3}Z(\\.gz)?$`
							);
							if (rotatedLogPattern.test(file)) {
								console.log(`Deleting old log file: ${filePath}`);
								await fsPromises.unlink(filePath);
							}
						}
					} catch (error) {
						// Log the error but don't stop the process
						console.error(`Error cleaning old log file ${filePath}:`, error);
					}
				}
			},
			async writeBatchToFile(batch: LogEntry[]): Promise<void> {
				// Concatenate log entries into a single string
				const logString = batch
					.map((entry) => `${entry.timestamp.toISOString()} [${entry.level.toUpperCase()}] ${entry.message} ${JSON.stringify(entry.args)}\n`)
					.join('');

				if (!logString) return;

				try {
					// Ensure rotation happens before writing
					await this.checkAndRotateLogFile();
					const logStream = await this.getLogStream();
					// Use a promise-based approach for stream writes for better error handling
					await new Promise<void>((resolve, reject) => {
						logStream.write(logString, (err: Error | null | undefined) => {
							if (err) return reject(err);
							resolve();
						});
					});
				} catch (fileError) {
					console.error('Failed to write to log file, attempting recovery:', fileError);
					this._logStream = null; // Invalidate stream on error to force re-initialization

					try {
						// Try recreating directory and file, then re-get stream and write
						await this.initializeLogFile();
						const logStream = await this.getLogStream();
						await new Promise<void>((resolve, reject) => {
							logStream.write(logString, (err: Error | null | undefined) => {
								if (err) return reject(err);
								resolve();
							});
						});
					} catch (recoveryError) {
						// Fallback to console logging if all else fails
						console.error('Log file recovery failed, falling back to console:', recoveryError);
						for (const entry of batch) {
							const color = TERMINAL_COLORS[LOG_LEVEL_MAP[entry.level].color];
							const formattedArgs = entry.args.map(formatValue).join(' ');
							console.log(
								`${entry.timestamp.toISOString()} ${color}[${entry.level.toUpperCase()}]${TERMINAL_COLORS.reset}: ${entry.message} ${formattedArgs}`
							);
						}
					}
				}
			}
		}
	: {
			// Client-side stubs
			_logStream: null,
			async _getModules(): Promise<unknown> {
				return {};
			},
			async getLogStream(): Promise<unknown> {
				return {};
			},
			async initializeLogFile(): Promise<void> {},
			async checkAndRotateLogFile(): Promise<void> {},
			async cleanOldLogFiles(): Promise<void> {},
			async writeBatchToFile(): Promise<void> {}
		};

// Effects and Lifecycle
if (isServer && !building) {
	// Bind serverFileOps methods to ensure `this` context is correct
	const boundInitializeLogFile = serverFileOps.initializeLogFile.bind(serverFileOps);
	const boundCheckAndRotateLogFile = serverFileOps.checkAndRotateLogFile.bind(serverFileOps);
	const boundCleanOldLogFiles = serverFileOps.cleanOldLogFiles.bind(serverFileOps);

	// Initial setup
	safeExecute(boundInitializeLogFile);
	safeExecute(boundCheckAndRotateLogFile);

	// Set up recurring tasks with better error handling
	const rotationInterval = setInterval(() => safeExecute(boundCheckAndRotateLogFile), config.logRotationInterval);
	const dailyCleanupInterval = setInterval(() => safeExecute(boundCleanOldLogFiles), 24 * 60 * 60 * 1000); // Every 24 hours

	// Store intervals globally for cleanup during HMR
	if (typeof globalThis !== 'undefined') {
		// @ts-expect-error - Adding custom property for HMR cleanup
		globalThis.__sveltyCMSLoggerIntervals = [rotationInterval, dailyCleanupInterval];
	}

	// Graceful shutdown
	const cleanup = () => {
		clearInterval(rotationInterval);
		clearInterval(dailyCleanupInterval);
		if (serverFileOps._logStream) {
			// Attempt to flush remaining logs before exiting
			if (state.queue.length > 0) {
				processBatch(); // This is async, might not complete but it's worth a try
			}
			serverFileOps._logStream.end();
		}
	};

	// Enhanced signal handling to prevent TTY/readline issues
	const handleSignal = (signal: string) => {
		try {
			cleanup();
		} catch (error) {
			// Silently ignore TTY-related errors during cleanup
			if (error instanceof Error && error.code !== 'EIO') {
				console.error(`Logger cleanup error on ${signal}:`, error);
			}
		}
	};

	process.on('exit', cleanup);
	process.on('SIGINT', () => handleSignal('SIGINT'));
	process.on('SIGTERM', () => handleSignal('SIGTERM'));

	// Handle uncaught exceptions to prevent TTY errors
	process.on('uncaughtException', (error) => {
		// Ignore TTY/readline EIO errors that commonly occur when stopping dev servers
		if (error.code === 'EIO' && error.syscall === 'read') {
			return;
		}
		// Also ignore Interface/ReadStream errors
		if (error.message && error.message.includes('Interface instance')) {
			return;
		}
		console.error('Uncaught exception in logger:', error);
	});

	// Handle unhandled promise rejections
	process.on('unhandledRejection', (reason) => {
		// Ignore TTY-related promise rejections
		if (reason instanceof Error && reason.code === 'EIO') {
			return;
		}
		console.error('Unhandled promise rejection in logger:', reason);
	});

	// Clean up any existing intervals from previous HMR cycles
	// @ts-expect-error - Checking custom property for HMR cleanup
	if (globalThis.__sveltyCMSLoggerIntervals) {
		// @ts-expect-error - Accessing custom property for HMR cleanup
		globalThis.__sveltyCMSLoggerIntervals.forEach(clearInterval);
	}
}

// Core Logger Function
const log = (level: LogLevel, message: string, ...args: LoggableValue[]): void => {
	if (building) return; // Do not log anything during the build process

	// Only proceed if the log level is enabled
	if (!isLogLevelEnabled(level)) return;

	const timestamp = getTimestamp();
	const maskedArgs = args.map(maskSensitiveData);
	let sourceFile = '';

	// OPTIMIZATION: Only get the stack trace if the level requires it.
	if (isServer && config.sourceFileTracking.includes(level)) {
		try {
			const stack = new Error().stack || '';
			const callerLine = stack.split('\n')[3] || ''; // Adjust index based on environment/stack format
			const match = callerLine.match(/\(([^)]+)\)/) || callerLine.match(/at ([^\s]+)/);
			if (match && match[1]) {
				sourceFile = match[1].split('/').pop()?.replace(/[()]/g, '') || '';
			}
		} catch {
			sourceFile = 'unknown';
		}
	}

	// Server-side console output with colors and source file
	if (isServer) {
		const color = TERMINAL_COLORS[LOG_LEVEL_MAP[level].color];
		const sourceInfo = sourceFile ? `${sourceFile} ` : '';
		const formattedArgs = maskedArgs.map(formatValue).join(' ');
		process.stdout.write(`${timestamp} ${sourceInfo}${color}[${level.toUpperCase()}]${TERMINAL_COLORS.reset}: ${message} ${formattedArgs}\n`);
	}

	state.queue = [...state.queue, { level, message, args: maskedArgs, timestamp: new Date() }];
	scheduleBatchProcessing();
};

// Public Logger Interface
export const logger = {
	fatal: (message: string, ...args: LoggableValue[]) => log('fatal', message, ...args),
	error: (message: string, ...args: LoggableValue[]) => log('error', message, ...args),
	warn: (message: string, ...args: LoggableValue[]) => log('warn', message, ...args),
	info: (message: string, ...args: LoggableValue[]) => log('info', message, ...args),
	debug: (message: string, ...args: LoggableValue[]) => log('debug', message, ...args),
	trace: (message: string, ...args: LoggableValue[]) => log('trace', message, ...args),

	// Configuration Methods
	setCustomLogTarget: (target: (level: LogLevel, message: string, args: LoggableValue[]) => void) => {
		config.customLogTarget = target;
	},
	enableErrorTracking: (enabled: boolean) => {
		config.errorTrackingEnabled = enabled;
	},
	setLogDirectory: (directory: string) => {
		config.logDirectory = directory;
		if (isServer && !building) safeExecute(serverFileOps.initializeLogFile);
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
	},
	setSourceFileTracking: (levels: LogLevel[]) => {
		config.sourceFileTracking = levels;
	},
	// New: Set log rotation size
	setLogRotationSize: (size: number) => {
		config.logRotationSize = size;
	},
	// New: Set log retention days
	setLogRetentionDays: (days: number) => {
		config.logRetentionDays = days;
	}
};
