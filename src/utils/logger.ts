import fs from 'fs';
import path from 'path';

// Define log levels
const LOG_LEVELS = ['info', 'warn', 'error'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

// Define the directory where logs will be stored
const logDirectory = path.resolve('logs');

// Ensure the log directory exists
if (!fs.existsSync(logDirectory)) {
	fs.mkdirSync(logDirectory);
}

// Define log file paths for each log level
const logFiles = LOG_LEVELS.reduce(
	(files, level) => {
		files[level] = path.join(logDirectory, `${level}.log`);
		return files;
	},
	{} as Record<LogLevel, string>
);

// Define log rotation settings
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB

// Helper function to format log messages
function formatMessage(level: LogLevel, message: string): string {
	const timestamp = new Date().toISOString();
	return `${timestamp} [${level.toUpperCase()}]: ${message}`;
}

// Helper function to write log messages to the appropriate file with rotation
function logToFile(level: LogLevel, message: string) {
	const formattedMessage = formatMessage(level, message);
	const filePath = logFiles[level];

	fs.stat(filePath, (err, stats) => {
		if (!err && stats.size > MAX_LOG_SIZE) {
			// Rotate log file
			const rotatedFilePath = `${filePath}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
			fs.rename(filePath, rotatedFilePath, (err) => {
				if (err) console.error(`Failed to rotate log file: ${err.message}`);
				fs.appendFile(filePath, formattedMessage + '\n', 'utf8', (err) => {
					if (err) console.error(`Failed to write log message: ${err.message}`);
				});
			});
		} else {
			fs.appendFile(filePath, formattedMessage + '\n', 'utf8', (err) => {
				if (err) console.error(`Failed to write log message: ${err.message}`);
			});
		}
	});
}

// Logger class with different log levels
class Logger {
	info(message: string) {
		console.log(formatMessage('info', message));
		logToFile('info', message);
	}

	warn(message: string) {
		console.warn(formatMessage('warn', message));
		logToFile('warn', message);
	}

	error(message: string, error?: Error) {
		const errorMessage = error ? `${message} - ${error.message}\n${error.stack}` : message;
		console.error(formatMessage('error', errorMessage));
		logToFile('error', errorMessage);
	}

	// Method to filter logs by level
	filterLogs(level: LogLevel): string[] {
		if (fs.existsSync(logFiles[level])) {
			return fs
				.readFileSync(logFiles[level], 'utf8')
				.split('\n')
				.filter((line) => line);
		}
		return [];
	}

	// Method to delete logs by level
	deleteLogs(level: LogLevel): void {
		if (fs.existsSync(logFiles[level])) {
			fs.unlinkSync(logFiles[level]);
			console.log(`Deleted ${level} logs.`);
		} else {
			console.log(`No ${level} logs to delete.`);
		}
	}
}

// Create an instance of the Logger class
const logger = new Logger();

// Export the logger instance for use in other parts of the application
export default logger;
