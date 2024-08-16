/**
 * @file src/utils/logger.ts
 * @description Custom logger with configurable levels, colorized output, and sensitive data masking.
 *
 * Features:
 * - Configurable log levels (fatal, error, warn, info, debug, trace)
 * - Colorized console output for terminal & browser
 * - Timestamp prefix for each log entry
 * - Sensitive data masking (e.g., passwords, emails)
 * - Runtime-configurable log levels development / production
 *
 * Usage:
 * import logger from '@src/utils/logger';
 * logger.info('Server started');
 * logger.error('Database connection failed', { dbName: 'main', password: 'secret123' });
 *
 * To change log levels at runtime:
 * logger.setLevels(['error', 'warn', 'info']);
 */

import { browser } from '$app/environment'; // Detects if the code is running in the browser
import { publicEnv } from '@root/config/public'; // Import environment configuration

// Define the possible log levels
type LogLevel = (typeof publicEnv.LOG_LEVELS)[number];

// ANSI escape codes for terminal colorizing
const COLORS: Record<LogLevel, string> = {
	fatal: '\x1b[35m', // Magenta
	error: '\x1b[31m', // Red
	warn: '\x1b[33m', // Yellow
	info: '\x1b[32m', // Green
	debug: '\x1b[34m', // Blue
	trace: '\x1b[36m', // Cyan
	none: '\x1b[0m' // Reset color
};

// CSS styles for browser console output
const BROWSER_STYLES: Record<LogLevel, string> = {
	fatal: 'color: #800080;', // Magenta
	error: 'color: #FF0000;', // Red
	warn: 'color: #FFA500;', // Orange
	info: 'color: #008000;', // Green
	debug: 'color: #0000FF;', // Blue
	trace: 'color: #00FFFF;', // Cyan
	none: 'color: inherit;' // Reset color
};

// Logger class definition
class Logger {
	private enabledLevels: Set<LogLevel>; // Set to track enabled log levels
	private defaultLogLevels: LogLevel[] = ['error', 'warn', 'info']; // Default log levels

	// Initialize the logger with an array of enabled log levels
	constructor(levels: LogLevel[] = publicEnv.LOG_LEVELS) {
		this.enabledLevels = new Set(levels.length > 0 ? levels : this.defaultLogLevels);
	}

	// Check if a specific log level is enabled
	private isLevelEnabled(level: LogLevel): boolean {
		return this.enabledLevels.has(level);
	}

	// Mask sensitive data in objects
	private maskSensitiveData(data: any): any {
		if (typeof data !== 'object' || data === null) {
			return data;
		}

		const maskedData: any = Array.isArray(data) ? [] : {};

		for (const [key, value] of Object.entries(data)) {
			if (typeof value === 'string') {
				if (key.toLowerCase().includes('password')) {
					maskedData[key] = '[REDACTED]';
				} else if (key.toLowerCase().includes('email')) {
					maskedData[key] = this.maskEmail(value);
				} else {
					maskedData[key] = value;
				}
			} else if (typeof value === 'object' && value !== null) {
				maskedData[key] = this.maskSensitiveData(value);
			} else {
				maskedData[key] = value;
			}
		}

		return maskedData;
	}

	// Mask an email address
	private maskEmail(email: string | undefined): string {
		if (!email) return '[EMAIL UNDEFINED]';

		const [localPart, domain] = email.split('@');
		if (!domain) return '[INVALID EMAIL FORMAT]';

		const maskedLocalPart = localPart.length > 2 ? `${localPart[0]}${'*'.repeat(Math.min(localPart.length - 2, 5))}` : '***';
		const domainParts = domain.split('.');
		if (domainParts.length < 2) return `${maskedLocalPart}@[INVALID DOMAIN]`;

		const tld = domainParts.pop(); // Get the last part as TLD
		const domainName = domainParts.join('.'); // Join the rest as domain name
		const maskedDomain = `${'*'.repeat(Math.min(domainName.length, 5))}`;

		return `${maskedLocalPart}@${maskedDomain}.${tld}`;
	}

	// Format the log message with timestamp, level, and optional object
	private formatLog(level: LogLevel, message: any, obj?: object): string {
		const timestamp = new Date().toISOString();
		const color = COLORS[level];
		const levelString = level === 'none' ? '' : `${color}[${level.toUpperCase()}]\x1b[0m: `;

		let maskedMessage = String(message);
		if (typeof message === 'string') {
			maskedMessage = maskedMessage
				.replace(/(?<=email:?\s*).*?(?=,|\s|$)/gi, (match) => this.maskEmail(match))
				.replace(/(?<=password:?\s*).*?(?=,|\s|$)/gi, '[REDACTED]')
				.replace(/(?<=password['"]?\s*[:=]\s*['"]?).*?(?=['"]?[,}\s])/gi, '[REDACTED]');
		}

		const maskedObj = obj ? this.maskSensitiveData(obj) : undefined;
		return `${timestamp} ${levelString}${maskedMessage}${maskedObj ? ' ' + JSON.stringify(maskedObj) : ''}`;
	}

	// Log the message to the console if the level is enabled
	private log(level: LogLevel, message: any, obj?: object): void {
		if (this.isLevelEnabled(level)) {
			const logMessage = this.formatLog(level, message, obj);
			if (browser) {
				// Browser environment: Use console styles
				console[level === 'debug' ? 'debug' : level === 'info' ? 'log' : 'error'](`%c${logMessage}`, BROWSER_STYLES[level]);
			} else {
				// Server environment: Use ANSI colors
				console[level === 'debug' ? 'debug' : level === 'info' ? 'log' : 'error'](logMessage);
			}
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
		this.enabledLevels = new Set(levels.length > 0 ? levels : this.defaultLogLevels);
	}
}

// Create a logger instance with log levels from environment variables or default
const logger = new Logger(publicEnv.LOG_LEVELS.length ? publicEnv.LOG_LEVELS : ['error', 'warn', 'info']);

// Export the logger instance as the default export
export default logger;
