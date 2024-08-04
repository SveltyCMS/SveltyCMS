/**
 * @file src/utils/logger.ts
 * @description Custom logger with configurable levels and colorized output.
 *
 * Features:
 * - Configurable log levels (fatal, error, warn, info, debug, trace)
 * - Colorized console output for better readability
 * - Timestamp prefix for each log entry
 * - Optional object logging for additional context
 * - Runtime-configurable log levels
 *
 * Usage:
 * import logger from '@src/utils/logger';
 * logger.info('Server started');
 * logger.error('Database connection failed', { dbName: 'main' });
 *
 * To change log levels at runtime:
 * logger.setLevels(['error', 'warn', 'info']);
 */

import { publicEnv } from '@root/config/public';

// Define the possible log levels
type LogLevel = (typeof publicEnv.LOG_LEVELS)[number];

// ANSI escape codes for colorizing log output
const COLORS: Record<LogLevel, string> = {
	fatal: '\x1b[35m', // Magenta
	error: '\x1b[31m', // Red
	warn: '\x1b[33m', // Yellow
	info: '\x1b[32m', // Green
	debug: '\x1b[34m', // Blue
	trace: '\x1b[36m', // Cyan
	none: '' // No color reset needed
};

// Logger class for managing and outputting log messages
class Logger {
	private enabledLevels: Set<LogLevel>;

	// Initialize the logger with an array of enabled log levels
	constructor(levels: LogLevel[]) {
		this.enabledLevels = new Set(levels);
	}

	// Check if a specific log level is enabled
	private isLevelEnabled(level: LogLevel): boolean {
		return this.enabledLevels.has(level);
	}

	// Format the log message with timestamp, level, and optional object
	private formatLog(level: LogLevel, message: string, obj?: object): string {
		const timestamp = `\x1b[2m${new Date().toISOString()}\x1b[0m`; // Gray timestamp
		const color = COLORS[level];
		return `${timestamp} ${color}[${level.toUpperCase()}]\x1b[0m: ${message}${obj ? ' ' + JSON.stringify(obj) : ''}`;
	}

	// Log the message to the console if the level is enabled
	private log(level: LogLevel, message: string, obj?: object): void {
		if (this.isLevelEnabled(level)) {
			const logMessage = this.formatLog(level, message, obj);
			console[level === 'debug' ? 'debug' : level === 'info' ? 'log' : 'error'](logMessage);
		}
	}

	// Log a trace message
	trace(message: string, obj?: object): void {
		this.log('trace', message, obj);
	}

	// Log a debug message
	debug(message: string, obj?: object): void {
		this.log('debug', message, obj);
	}

	// Log an info message
	info(message: string, obj?: object): void {
		this.log('info', message, obj);
	}

	// Log a warning message
	warn(message: string, obj?: object): void {
		this.log('warn', message, obj);
	}

	// Log an error message
	error(message: string, obj?: object): void {
		this.log('error', message, obj);
	}

	// Log a fatal error message
	fatal(message: string, obj?: object): void {
		this.log('fatal', message, obj);
	}

	// Update the enabled log levels
	setLevels(levels: LogLevel[]): void {
		this.enabledLevels = new Set(levels);
	}
}

// Create a logger instance with log levels from environment variables
const logger = new Logger(publicEnv.LOG_LEVELS);

// Export the logger instance as the default export
export default logger;
