import { publicEnv } from '@root/config/public';

// Use the provided log levels from the public environment configuration
type LogLevel = (typeof publicEnv.LOG_LEVELS)[number];

const COLORS: Record<LogLevel, string> = {
	fatal: '\x1b[35m', // Magenta
	error: '\x1b[31m', // Red
	warn: '\x1b[33m', // Yellow
	info: '\x1b[32m', // Green
	debug: '\x1b[34m', // Blue
	trace: '\x1b[36m', // Cyan
	none: '\x1b[0m' // Reset
};

const RESET = '\x1b[0m';

class Logger {
	private enabledLevels: Set<LogLevel>;

	constructor(levels: LogLevel[]) {
		this.enabledLevels = new Set(levels);
	}

	private isLevelEnabled(level: LogLevel): boolean {
		return this.enabledLevels.has(level);
	}

	private formatLog(level: LogLevel, message: string, obj?: object): string {
		const time = new Date().toISOString();
		const color = COLORS[level];
		let logMessage = `${time} ${color}[${level.toUpperCase()}]${RESET}: ${message}`;

		if (obj) {
			logMessage += ' ' + JSON.stringify(obj);
		}

		return logMessage;
	}

	private log(level: LogLevel, message: string, obj?: object): void {
		if (this.isLevelEnabled(level)) {
			const logMessage = this.formatLog(level, message, obj);
			console[level === 'debug' ? 'debug' : level === 'info' ? 'log' : level](logMessage);
		}
	}

	trace(message: string, obj?: object): void {
		this.log('trace', message, obj);
	}

	debug(message: string, obj?: object): void {
		this.log('debug', message, obj);
	}

	info(message: string, obj?: object): void {
		this.log('info', message, obj);
	}

	warn(message: string, obj?: object): void {
		this.log('warn', message, obj);
	}

	error(message: string, obj?: object): void {
		this.log('error', message, obj);
	}

	fatal(message: string, obj?: object): void {
		this.log('fatal', message, obj);
	}

	setLevels(levels: LogLevel[]): void {
		this.enabledLevels = new Set(levels);
	}
}

const logger = new Logger(publicEnv.LOG_LEVELS);
export default logger;
