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
	none: '\x1b[0m', // Reset
	reset: '\x1b[0m' // Reset
};

// Helper function to format log messages
function formatMessage(level: LogLevel, message: string): string {
	const timestamp = new Date().toISOString();
	const color = COLORS[level] || COLORS.reset;
	return `${timestamp} [${color}${level.toUpperCase()}${COLORS.reset}]: ${message}`;
}

// Helper function to write log messages to the appropriate file with rotation
async function logToFile(level: LogLevel, message: string) {
	if (level === 'none') return;

	const formattedMessage = formatMessage(level, message);
	const filePath = logFiles[level];

	try {
		const stats = await fs.promises.stat(filePath);
		if (stats.size > MAX_LOG_SIZE) {
			const rotatedFilePath = `${filePath}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
			await fs.promises.rename(filePath, rotatedFilePath);
		}
	} catch (err) {
		if (err.code !== 'ENOENT') {
			console.error(`Failed to check log file: ${err.message}`);
			return;
		}
	}

	try {
		await fs.promises.appendFile(filePath, formattedMessage + '\n', 'utf8');
	} catch (err) {
		console.error(`Failed to write log message: ${err.message}`);
	}
}

// Asynchronous log flushing
let logBuffer: { level: LogLevel; message: string }[] = [];
const FLUSH_INTERVAL = 5000; // 5 seconds

function flushLogs() {
	const logsToFlush = [...logBuffer];
	logBuffer = [];
	logsToFlush.forEach((log) => logToFile(log.level, log.message));
}

setInterval(flushLogs, FLUSH_INTERVAL);

// Logger class with different log levels
class Logger {
	debug(message: string) {
		if (!LOG_LEVELS.has('debug')) return;
		const formattedMessage = formatMessage('debug', message);
		console.debug(formattedMessage);
		logBuffer.push({ level: 'debug', message });
	}

	info(message: string) {
		if (!LOG_LEVELS.has('info')) return;
		const formattedMessage = formatMessage('info', message);
		console.log(formattedMessage);
		logBuffer.push({ level: 'info', message });
	}

	warn(message: string) {
		if (!LOG_LEVELS.has('warn')) return;
		const formattedMessage = formatMessage('warn', message);
		console.warn(formattedMessage);
		logBuffer.push({ level: 'warn', message });
	}

	error(message: string, error?: Error) {
		if (!LOG_LEVELS.has('error')) return;
		const errorMessage = error ? `${message} - ${error.message}\n${error.stack}` : message;
		const formattedMessage = formatMessage('error', errorMessage);
		console.error(formattedMessage);
		logBuffer.push({ level: 'error', message: errorMessage });
	}

	// Method to filter logs by level
	async filterLogs(level: LogLevel): Promise<string[]> {
		if (level === 'none' || !fs.existsSync(logFiles[level])) return [];
		try {
			const data = await fs.promises.readFile(logFiles[level], 'utf8');
			return data.split('\n').filter((line) => line);
		} catch (err) {
			console.error(`Failed to read log file: ${err.message}`);
			return [];
		}
	}

	// Method to filter logs by time range
	async filterLogsByTimeRange(level: LogLevel, startTime: Date, endTime: Date): Promise<string[]> {
		const logs = await this.filterLogs(level);
		return logs.filter((log) => {
			const timestamp = log.split(' ')[0];
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
		} catch (err) {
			console.error(`Failed to delete log file: ${err.message}`);
		}
	}

	// Method to send logs to a remote server
	async sendLogsToRemoteServer(logServerUrl: string, logData: { level: LogLevel; message: string }[]): Promise<void> {
		try {
			await fetch(logServerUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(logData)
			});
		} catch (err) {
			console.error(`Failed to send logs to remote server: ${err.message}`);
		}
	}
}

// Create an instance of the Logger class
const logger = new Logger();

// Export the logger instance for use in other parts of the application
export default logger;
