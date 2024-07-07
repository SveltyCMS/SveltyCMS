import fs from 'fs';
import path from 'path';
import { publicEnv } from '@root/config/public';

// Use the provided log levels from the public environment configuration
const LOG_LEVELS = new Set(publicEnv.LOG_LEVELS);
type LogLevel = (typeof publicEnv.LOG_LEVELS)[number];

// Define the directory where logs will be stored
const logDirectory = path.resolve('logs');

// Ensure the log directory exists
if (!fs.existsSync(logDirectory)) {
	fs.mkdirSync(logDirectory);
}

// Define log file paths for each log level
const logFiles: Record<LogLevel, string> = {
	debug: path.join(logDirectory, 'debug.log'),
	info: path.join(logDirectory, 'info.log'),
	warn: path.join(logDirectory, 'warn.log'),
	error: path.join(logDirectory, 'error.log'),
	none: '' // No file for 'none' level
};

// Define log rotation settings
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

// Color codes for different log levels
const COLORS: Record<LogLevel, string> = {
	debug: '\x1b[34m', // Blue
	info: '\x1b[32m', // Green
	warn: '\x1b[33m', // Yellow
	error: '\x1b[31m', // Red
	none: '\x1b[0m' // No color for 'none' level
};

// Helper function to format log messages for console output
function formatConsoleMessage(level: LogLevel, message: string, context?: Record<string, any>): string {
	const timestamp = new Date().toISOString();
	const color = COLORS[level];
	const contextString = context ? ` ${JSON.stringify(context)}` : '';
	return `${timestamp} [${color}${level.toUpperCase()}\x1b[0m]: ${message}${contextString}`;
}

// Helper function to format log messages for file output
function formatFileMessage(level: LogLevel, message: string, context?: Record<string, any>): string {
	const timestamp = new Date().toISOString();
	const logEntry = {
		timestamp,
		level,
		message,
		...(context && { context })
	};
	return JSON.stringify(logEntry);
}

// Helper function to write log messages to the appropriate file with rotation
async function logToFile(level: LogLevel, message: string, context?: Record<string, any>) {
	if (level === 'none') return;

	const formattedMessage = formatFileMessage(level, message, context);
	const filePath = logFiles[level];

	try {
		const stats = await fs.promises.stat(filePath);
		if (stats.size > MAX_LOG_SIZE) {
			const rotatedFilePath = `${filePath}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
			await fs.promises.rename(filePath, rotatedFilePath);
		}
	} catch (err: unknown) {
		if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
			console.error(`Failed to check log file: ${err.message}`);
			return;
		}
	}

	try {
		await fs.promises.appendFile(filePath, formattedMessage + '\n', 'utf8');
	} catch (err: unknown) {
		if (err instanceof Error) {
			console.error(`Failed to write log message: ${err.message}`);
		}
	}
}

// Asynchronous log flushing
let logBuffer: { level: LogLevel; message: string; context?: Record<string, any> }[] = [];
const FLUSH_INTERVAL = 5000; // 5 seconds

function flushLogs() {
	const logsToFlush = [...logBuffer];
	logBuffer = [];
	logsToFlush.forEach((log) => logToFile(log.level, log.message, log.context));
}

setInterval(flushLogs, FLUSH_INTERVAL);

// Logger class with different log levels
class Logger {
	private logLevelEnabled(level: LogLevel): boolean {
		return LOG_LEVELS.has(level);
	}

	debug(message: string, context?: Record<string, any>) {
		this.log('debug', message, context);
	}

	info(message: string, context?: Record<string, any>) {
		this.log('info', message, context);
	}

	warn(message: string, context?: Record<string, any>) {
		this.log('warn', message, context);
	}

	error(message: string, error?: Error, context?: Record<string, any>) {
		const errorMessage = error ? `${message} - ${error.message}\n${error.stack}` : message;
		this.log('error', errorMessage, context);
	}

	private log(level: LogLevel, message: string, context?: Record<string, any>) {
		if (!this.logLevelEnabled(level)) return;
		const formattedConsoleMessage = formatConsoleMessage(level, message, context);
		this.outputToConsole(level, formattedConsoleMessage);
		logBuffer.push({ level, message, context });
	}

	private outputToConsole(level: LogLevel, message: string) {
		switch (level) {
			case 'debug':
				console.debug(message);
				break;
			case 'info':
				console.log(message);
				break;
			case 'warn':
				console.warn(message);
				break;
			case 'error':
				console.error(message);
				break;
		}
	}

	// Method to filter logs by level
	async filterLogs(level: LogLevel): Promise<string[]> {
		if (level === 'none' || !fs.existsSync(logFiles[level])) return [];
		try {
			const data = await fs.promises.readFile(logFiles[level], 'utf8');
			return data.split('\n').filter((line) => line);
		} catch (err: unknown) {
			if (err instanceof Error) {
				console.error(`Failed to read log file: ${err.message}`);
			}
			return [];
		}
	}

	// Method to filter logs by time range
	async filterLogsByTimeRange(level: LogLevel, startTime: Date, endTime: Date): Promise<string[]> {
		const logs = await this.filterLogs(level);
		return logs.filter((log) => {
			const { timestamp } = JSON.parse(log);
			const logDate = new Date(timestamp);
			return logDate >= startTime && logDate <= endTime;
		});
	}

	// Method to delete logs by level
	async deleteLogs(level: LogLevel): Promise<void> {
		if (level === 'none' || !fs.existsSync(logFiles[level])) {
			console.log(`No ${level} logs to delete.`);
			return;
		}
		try {
			await fs.promises.unlink(logFiles[level]);
			console.log(`Deleted ${level} logs.`);
		} catch (err: unknown) {
			if (err instanceof Error) {
				console.error(`Failed to delete log file: ${err.message}`);
			}
		}
	}

	// Method to send logs to a remote server
	async sendLogsToRemoteServer(logServerUrl: string, logData: { level: LogLevel; message: string; context?: Record<string, any> }[]): Promise<void> {
		try {
			await fetch(logServerUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(logData)
			});
		} catch (err: unknown) {
			if (err instanceof Error) {
				console.error(`Failed to send logs to remote server: ${err.message}`);
			}
		}
	}

	// Method to set log levels dynamically
	setLogLevels(levels: LogLevel[]) {
		LOG_LEVELS.clear();
		levels.forEach((level) => LOG_LEVELS.add(level));
	}
}

// Create an instance of the Logger class
const logger = new Logger();

// Export the logger instance for use in other parts of the application
export default logger;
