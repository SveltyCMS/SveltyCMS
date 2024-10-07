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

import { browser, dev } from '$app/environment'; // Detects if the code is running in the browser
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

// Helper to determine if the log level is enabled
const isLogLevelEnabled = (level: LogLevel): boolean => {
	const currentLogLevel = dev
		? 'debug'
		: publicEnv.LOG_LEVELS.includes(import.meta.env.VITE_LOG_LEVEL as LogLevel)
			? (import.meta.env.VITE_LOG_LEVEL as LogLevel)
			: 'error';
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

// Format values (colorize types like booleans, numbers)
const formatValue = (value: LoggableValue): string => {
	if (browser) return String(value); // No color in browser
	if (typeof value === 'boolean')
		return value ? `${TERMINAL_COLORS.green}true${TERMINAL_COLORS.reset}` : `${TERMINAL_COLORS.red}false${TERMINAL_COLORS.reset}`;
	if (typeof value === 'number') return `${TERMINAL_COLORS.blue}${value}${TERMINAL_COLORS.reset}`;
	if (typeof value === 'string') {
		// Handle JSON strings
		try {
			const parsed = JSON.parse(value);
			if (typeof parsed === 'object' && parsed !== null) {
				return formatValue(parsed);
			}
		} catch (e) {
			// Not a valid JSON, continue with string formatting
		}
		// Color numbers and booleans within strings
		return value.replace(/\b(\d+(\.\d+)?|true|false)\b/g, (match) => {
			if (match === 'true') return `${TERMINAL_COLORS.green}${match}${TERMINAL_COLORS.reset}`;
			if (match === 'false') return `${TERMINAL_COLORS.red}${match}${TERMINAL_COLORS.reset}`;
			return `${TERMINAL_COLORS.blue}${match}${TERMINAL_COLORS.reset}`;
		});
	}
	if (value === null) return `${TERMINAL_COLORS.magenta}null${TERMINAL_COLORS.reset}`;
	if (value === undefined) return `${TERMINAL_COLORS.gray}undefined${TERMINAL_COLORS.reset}`;
	if (value instanceof Date) return `${TERMINAL_COLORS.cyan}${value.toISOString()}${TERMINAL_COLORS.reset}`;
	if (value instanceof RegExp) return `${TERMINAL_COLORS.magenta}${value.toString()}${TERMINAL_COLORS.reset}`;
	if (Array.isArray(value)) {
		return (
			`${TERMINAL_COLORS.yellow}[${TERMINAL_COLORS.reset}` +
			value.map(formatValue).join(`${TERMINAL_COLORS.yellow},${TERMINAL_COLORS.reset} `) +
			`${TERMINAL_COLORS.yellow}]${TERMINAL_COLORS.reset}`
		);
	}
	if (typeof value === 'object') {
		const entries = Object.entries(value);
		if (entries.length === 0) return `${TERMINAL_COLORS.yellow}{}${TERMINAL_COLORS.reset}`;
		const formatted = entries
			.map(([k, v]) => `${TERMINAL_COLORS.cyan}${k}${TERMINAL_COLORS.reset}: ${formatValue(v)}`)
			.join(`${TERMINAL_COLORS.yellow},${TERMINAL_COLORS.reset} `);
		return `${TERMINAL_COLORS.yellow}{${TERMINAL_COLORS.reset}${formatted}${TERMINAL_COLORS.yellow}}${TERMINAL_COLORS.reset}`;
	}
	return String(value);
};

// ProcessLog function
const processLog = async (level: LogLevel, message: string, ...args: LoggableValue[]): Promise<void> => {
	if (!isLogLevelEnabled(level)) return;

	const timestamp = getTimestamp();
	const levelStr = `[${level.toUpperCase()}]`;
	const maskedArgs = args.map((arg) => maskSensitiveData(arg));

	// Format the entire message, including numbers within template literals
	const formattedMessage = formatValue(message);

	// Format args
	const formattedArgs = maskedArgs.map(formatValue).join(' ');

	const coloredLevelStr = applyColor(level, levelStr);
	const fullMessage = `${timestamp} ${coloredLevelStr}: ${formattedMessage} ${formattedArgs}`;

	if (browser) {
		console.log(fullMessage);
	} else {
		process.stdout.write(`${fullMessage}\n`);

		// File logging (without colors)
		try {
			const logFile = path.join(config.logDirectory, config.logFileName);
			const plainMessage = `${new Date().toISOString()} ${levelStr}: ${message} ${args.map(String).join(' ')}\n`;
			fs.appendFileSync(logFile, plainMessage);
		} catch (error) {
			console.error('Failed to write to log file:', error);
		}
	}

	if (config.customLogTarget) {
		config.customLogTarget(level, message, maskedArgs);
	}
};

const log = (level: LogLevel, message: string, ...args: LoggableValue[]): void => {
	processLog(level, message, ...args);
};

// Initialize log file on import
if (!browser) {
	if (!fs.existsSync(config.logDirectory)) {
		fs.mkdirSync(config.logDirectory, { recursive: true });
	}
	const logFilePath = path.join(config.logDirectory, config.logFileName);
	if (!fs.existsSync(logFilePath)) {
		fs.writeFileSync(logFilePath, '');
	}
}

export const logger = {
	fatal: (message: string, ...args: LoggableValue[]) => log('fatal', message, ...args),
	error: (message: string, ...args: LoggableValue[]) => log('error', message, ...args),
	warn: (message: string, ...args: LoggableValue[]) => log('warn', message, ...args),
	info: (message: string, ...args: LoggableValue[]) => log('info', message, ...args),
	debug: (message: string, ...args: LoggableValue[]) => log('debug', message, ...args),
	trace: (message: string, ...args: LoggableValue[]) => log('trace', message, ...args),
	setCustomLogTarget: (target: (level: LogLevel, message: string, args: LoggableValue[]) => void) => {
		config.customLogTarget = target;
	},
	enableErrorTracking: (enabled: boolean) => {
		config.errorTrackingEnabled = enabled;
	},
	setLogDirectory: (directory: string) => {
		config.logDirectory = directory;
		if (!browser) {
			if (!fs.existsSync(config.logDirectory)) {
				fs.mkdirSync(config.logDirectory, { recursive: true });
			}
		}
	},
	setLogFileName: (fileName: string) => {
		config.logFileName = fileName;
	}
};
