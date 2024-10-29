// Mock logger implementation that doesn't depend on $app/environment
export const logger = {
	info: (...args: any[]) => console.log('[INFO]', ...args),
	error: (...args: any[]) => console.error('[ERROR]', ...args),
	warn: (...args: any[]) => console.warn('[WARN]', ...args),
	debug: (...args: any[]) => console.debug('[DEBUG]', ...args),
	trace: (...args: any[]) => console.trace('[TRACE]', ...args),
	fatal: (...args: any[]) => console.error('[FATAL]', ...args),
	setCustomLogTarget: () => {},
	enableErrorTracking: () => {},
	setLogDirectory: () => {},
	setLogFileName: () => {},
	setBatchSize: () => {},
	setBatchTimeout: () => {},
	setCompressionEnabled: () => {},
	addLogFilter: () => {},
	clearLogFilters: () => {},
	addSensitiveKeys: () => {},
	addEmailKeys: () => {},
	addCustomMask: () => {},
	clearCustomMasks: () => {}
};

// Mock the entire module
const mockLogger = { logger };
export default mockLogger;
