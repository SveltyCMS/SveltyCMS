/**
 **
 * @file src/utils/logger.ts
 * @description An enhanced comprehensive logger for SvelteKit applications.
 *
 * New features and enhancements:
 * - Performance optimization for high-volume logging
 * - Support for structured logging
 * - Log rotation for server-side logging
 * - Custom log formatters
 * - Log level override for specific modules or components
 * - Integration with error tracking services
 * - Support for custom log targets (e.g., file, database)
 */

import { browser } from '$app/environment'; // Detects if the code is running in the browser
import { publicEnv } from '@root/config/public'; // Import environment configuration
import fs from 'fs';
import path from 'path';

// Define the possible log levels
type LogLevel = (typeof publicEnv.LOG_LEVELS)[number];

// Define a type for loggable values
type LoggableValue = string | number | boolean | null | undefined | Date | RegExp | object;

// Define a type that can be either an array or an object
type LoggableData = LoggableValue[] | Record<string, LoggableValue>;

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

// CSS styles for browser console output
const BROWSER_STYLES: Record<LogLevel | 'key' | 'value', string> = {
	none: 'color: inherit;',
	fatal: 'color: magenta; font-weight: bold;',
	error: 'color: red; font-weight: bold;',
	warn: 'color: orange;',
	info: 'color: green;',
	debug: 'color: blue;',
	trace: 'color: gray;',
	key: 'color: purple; font-weight: bold;',
	value: 'color: teal;'
};

// Configuration object
const config = {
	logRotationSize: 5 * 1024 * 1024, // 5MB
	logDirectory: 'logs',
	logFileName: 'app.log',
	errorTrackingEnabled: false,
	customLogTarget: null as ((level: LogLevel, message: string, args: LoggableValue[]) => void) | null
};

// Ensure log directory and file exist
const ensureLogFileExists = (): void => {
	if (!browser) {
		try {
			if (!fs.existsSync(config.logDirectory)) {
				fs.mkdirSync(config.logDirectory, { recursive: true });
			}
			const logFilePath = path.join(config.logDirectory, config.logFileName);
			if (!fs.existsSync(logFilePath)) {
				fs.writeFileSync(logFilePath, ''); // Create an empty file
			}
		} catch (error) {
			console.error('Failed to create log directory or file:', error);
		}
	}
};

// Log rotation for server-side
const rotateLogFile = (logFile: string): void => {
	if (!browser) {
		try {
			const stats = fs.statSync(logFile);
			if (stats.size >= config.logRotationSize) {
				const rotatedFile = `${logFile}.${new Date().toISOString()}`;
				fs.renameSync(logFile, rotatedFile);
			}
		} catch (error) {
			console.error('Error during log rotation:', error);
		}
	}
};

// Custom log formatter
type LogFormatter = (level: LogLevel, message: string, args: LoggableValue[]) => string;
let customFormatter: LogFormatter | null = null;

// Log level override for specific modules
const moduleLogLevels: Record<string, LogLevel> = {};

// Buffer to store log messages when high-volume logging occurs
const logBuffer: { level: LogLevel; message: string; args: LoggableValue[] }[] = [];
let isFlushingBuffer = false;

// Flush logs from buffer
const flushLogBuffer = async (): Promise<void> => {
	if (isFlushingBuffer) return;
	isFlushingBuffer = true;

	while (logBuffer.length > 0) {
		const log = logBuffer.shift();
		if (log) await processLog(log.level, log.message, ...log.args);
	}

	isFlushingBuffer = false;
};

// Helper to determine if the log level is enabled
const isLogLevelEnabled = (level: LogLevel): boolean => {
	const currentLogLevel = publicEnv.LOG_LEVELS.includes(import.meta.env.VITE_LOG_LEVEL) ? (import.meta.env.VITE_LOG_LEVEL as LogLevel) : 'error';
	return LOG_LEVEL_MAP[level].priority <= LOG_LEVEL_MAP[currentLogLevel].priority;
};

const applyColor = (level: LogLevel, message: string): string | [string, string] => {
	if (browser) {
		return [`%c${message}`, BROWSER_STYLES[level]];
	} else {
		const color = TERMINAL_COLORS[LOG_LEVEL_MAP[level].color];
		return `${color}${message}${TERMINAL_COLORS.reset}`;
	}
};

// Colorize the formatted value based on type
const applyColorToValue = (value: LoggableValue, color: keyof typeof TERMINAL_COLORS): string => {
	if (browser) return String(value); // No color in browser
	return `${TERMINAL_COLORS[color]}${value}${TERMINAL_COLORS.reset}`;
};

// Format timestamp in gray color
const getTimestamp = (): string => {
	const now = new Date();
	return `${TERMINAL_COLORS.gray}${now.toISOString()}${TERMINAL_COLORS.reset}`;
};

// Mask sensitive data (e.g., passwords, emails)
const maskSensitiveData = (data: LoggableValue): LoggableValue => {
	if (typeof data !== 'object' || data === null) return data;

	const maskedData: LoggableData = Array.isArray(data) ? [] : {};

	for (const [key, value] of Object.entries(data)) {
		if (typeof value === 'string') {
			if (key.toLowerCase().includes('password')) {
				(maskedData as Record<string, LoggableValue>)[key] = '[REDACTED]';
			} else if (key.toLowerCase().includes('email')) {
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

// Mask email addresses
const maskEmail = (email: string): string => {
	const [localPart, domain] = email.split('@');
	const maskedLocalPart = localPart.slice(0, 2) + '*'.repeat(localPart.length - 2);
	const [domainName, tld] = domain.split('.');
	const maskedDomain = '*'.repeat(domainName.length);
	return `${maskedLocalPart}@${maskedDomain}.${tld}`;
};

// Format error messages
const formatErrorMessage = (value: LoggableValue): string => {
	if (typeof value === 'string') {
		return value;
	}
	if (value instanceof Error) {
		return value.message;
	}
	if (typeof value === 'object' && value !== null) {
		if ('message' in value) {
			return String(value.message);
		}
		return JSON.stringify(value);
	}
	if (value === undefined) {
		return 'undefined';
	}
	if (value === null) {
		return 'null';
	}
	return String(value);
};

// Format values (colorize types like booleans, numbers)
const formatValue = (value: LoggableValue): string => {
	if (typeof value === 'boolean') return applyColorToValue(value, value ? 'green' : 'red');
	if (typeof value === 'number') return applyColorToValue(value, 'blue');
	if (typeof value === 'string') return applyColorToValue(value, 'yellow');
	if (value === null) return applyColorToValue('null', 'magenta');
	if (value === undefined) return applyColorToValue('undefined', 'gray');
	if (value instanceof Date) return applyColorToValue(value.toISOString(), 'cyan');
	if (value instanceof RegExp) return applyColorToValue(value.toString(), 'magenta');
	if (typeof value === 'object') {
		return JSON.stringify(
			value,
			(key, val) => {
				if (typeof val === 'object' && val !== null) {
					return val;
				}
				return String(val);
			},
			2
		);
	}
	return String(value);
};

// Enhanced processLog function

const processLog = async (level: LogLevel, message: string, ...args: LoggableValue[]): Promise<void> => {
	if (!isLogLevelEnabled(level)) return;

	const timestamp = getTimestamp();
	const levelStr = `[${level.toUpperCase()}]`;

	let formattedMessage: string;

	if (customFormatter) {
		formattedMessage = customFormatter(level, message, args);
	} else {
		const colonIndex = message.indexOf(':');
		if (level === 'error') {
			if (colonIndex !== -1) {
				const prefix = message.slice(0, colonIndex + 1);
				const errorMessage = message.slice(colonIndex + 1).trim();
				formattedMessage = `${timestamp} ${applyColor(level, levelStr)}: ${prefix}${errorMessage ? ' ' + applyColor('warn', errorMessage) : ''}`;
			} else {
				formattedMessage = `${timestamp} ${applyColor(level, levelStr)}: ${applyColor('warn', message)}`;
			}
		} else {
			formattedMessage = `${timestamp} ${applyColor(level, levelStr)}: ${message}`;
		}
	}

	if (browser) {
		console.log(formattedMessage, BROWSER_STYLES[level]);
		return;
	}

	process.stdout.write(`${formattedMessage}\n`);

	try {
		ensureLogFileExists();
		const logFile = path.join(config.logDirectory, config.logFileName);
		rotateLogFile(logFile);
		fs.appendFileSync(logFile, `${formattedMessage}\n`);
	} catch (error) {
		console.error('Failed to write to log file:', error);
	}

	if (config.customLogTarget) {
		config.customLogTarget(level, message, args);
	}

	if (config.errorTrackingEnabled && (level === 'error' || level === 'fatal')) {
		// Integrate with your error tracking service here
		// e.g., Sentry.captureException(new Error(message), { extra: args });
	}
};

// Structured logging
const structuredLog = (level: LogLevel, obj: Record<string, LoggableValue>): void => {
	const maskedObj = maskSensitiveData(obj) as Record<string, LoggableValue>;
	const message = Object.entries(maskedObj)
		.map(([key, value]) => `${key}: ${formatValue(value)}`)
		.join(', ');
	log(level, `Structured Log: { ${message} }`);
};

// Buffering log method
const log = async (level: LogLevel, message: string, ...args: LoggableValue[]): Promise<void> => {
	const callerModule = new Error().stack?.split('\n')[2].trim().split(' ')[1] || 'unknown';
	const effectiveLevel = moduleLogLevels[callerModule] || level;

	logBuffer.push({ level: effectiveLevel, message, args });
	if (logBuffer.length === 1) {
		await flushLogBuffer();
	}
};

// Initialize log file on import
ensureLogFileExists();

// Exported logger interface
export const logger = {
	fatal: (msg: string, ...args: LoggableValue[]) => log('fatal', msg, ...args),
	error: (msg: string, ...args: LoggableValue[]) => log('error', msg, ...args),
	warn: (msg: string, ...args: LoggableValue[]) => log('warn', msg, ...args),
	info: (msg: string, ...args: LoggableValue[]) => log('info', msg, ...args),
	debug: (msg: string, ...args: LoggableValue[]) => log('debug', msg, ...args),
	trace: (msg: string, ...args: LoggableValue[]) => log('trace', msg, ...args),
	structured: structuredLog,
	setFormatter: (formatter: LogFormatter) => {
		customFormatter = formatter;
	},
	setModuleLogLevel: (module: string, level: LogLevel) => {
		moduleLogLevels[module] = level;
	},
	setCustomLogTarget: (target: (level: LogLevel, message: string, args: LoggableValue[]) => void) => {
		config.customLogTarget = target;
	},
	enableErrorTracking: (enabled: boolean) => {
		config.errorTrackingEnabled = enabled;
	},
	setLogDirectory: (directory: string) => {
		config.logDirectory = directory;
		ensureLogFileExists();
	},
	setLogFileName: (fileName: string) => {
		config.logFileName = fileName;
		ensureLogFileExists();
	}
};
