/**
 * @file src/utils/logger.ts
 * @description Universal logger (client + server) with automatic formatting and tree-shaking.
 *
 * Highlights:
 * - Auto-format tokens (paths, IDs, methods, status codes, booleans)
 * - Sensitive data masking and dump helper
 * - Fully stripped when `VITE_LOG_LEVELS=none` (no-ops)
 *
 * Configure:
 * - `VITE_LOG_LEVELS` (build) or `LOG_LEVELS` (runtime) e.g. `fatal,error,warn` or `none`
 *
 * Usage:
 *   logger.info(`Saved ${id} in ${ms}ms`, meta)
 */

// Detect runtime environment safely
// In SvelteKit: $app/environment is available
// In standalone (Bun/Node/Playwright): it's not, so we detect manually
let browser = false;
let building = false;

try {
	// Try to import from SvelteKit if available
	const env = await import('$app/environment');
	browser = env.browser;
	building = env.building;
} catch {
	// Not in SvelteKit context - detect manually
	browser = typeof window !== 'undefined' && typeof document !== 'undefined';
	building = false; // Standalone scripts are never "building"
}

type LogLevel = 'none' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export type LoggableValue = string | number | boolean | null | unknown | undefined | Date | RegExp | object | Error;

// --- COMPILE-TIME CONSTANTS ---
// Vite will inline these and tree-shake unused code
const IS_BROWSER = browser;
const IS_BUILDING = building;

// Read log level from environment at build time
const LOG_LEVEL_ENV = (import.meta.env?.VITE_LOG_LEVELS as string) || (typeof process !== 'undefined' ? process.env.LOG_LEVELS : undefined) || 'info';

// Parse enabled levels
const ENABLED_LEVELS = LOG_LEVEL_ENV.split(',').map((l) => l.trim().toLowerCase()) as LogLevel[];
const IS_LOGGING_DISABLED = ENABLED_LEVELS.includes('none');

// Level priorities for filtering
const LEVEL_PRIORITY: Record<LogLevel, number> = {
	none: 0,
	fatal: 1,
	error: 2,
	warn: 3,
	info: 4,
	debug: 5,
	trace: 6
};

// Calculate max priority at compile time
// Honor LOG_LEVELS consistently across server and browser
const MAX_PRIORITY = IS_LOGGING_DISABLED ? 0 : Math.max(0, ...ENABLED_LEVELS.map((l) => LEVEL_PRIORITY[l] || 0));

// --- HELPER: Check if level is enabled (inlined by Vite) ---
const isLevelEnabled = (level: LogLevel): boolean => {
	if (IS_BUILDING) return false;
	if (IS_LOGGING_DISABLED) return false;
	return LEVEL_PRIORITY[level] <= MAX_PRIORITY;
};

// --- SENSITIVE DATA MASKING ---
const SENSITIVE_KEYS = [
	'password',
	'passwd',
	'pwd',
	'token',
	'access_token',
	'refresh_token',
	'api_key',
	'apikey',
	'secret',
	'client_secret',
	'authorization',
	'auth',
	'credit_card',
	'creditcard',
	'card_number',
	'cvv',
	'ssn',
	'private_key',
	'privatekey'
] as const;

const MAX_MASK_DEPTH = 10;

const maskSensitive = (data: unknown, seen = new WeakSet(), depth = 0): unknown => {
	if (typeof data !== 'object' || data === null) return data;
	if (depth >= MAX_MASK_DEPTH) return '[Max Depth]';

	if (data instanceof Date) return data.toISOString();
	if (data instanceof RegExp) return data.toString();
	if (data instanceof Error) {
		return {
			name: data.name,
			message: data.message,
			stack: data.stack?.split('\n').slice(0, 3).join('\n')
		};
	}

	if (seen.has(data)) return '[Circular]';
	seen.add(data);

	const masked: Record<string, unknown> | unknown[] = Array.isArray(data) ? [] : {};

	for (const [key, value] of Object.entries(data)) {
		const lower = key.toLowerCase();
		const isSensitive = SENSITIVE_KEYS.some((keyword) => lower.includes(keyword));

		if (isSensitive) {
			(masked as Record<string, unknown>)[key] = '[REDACTED]';
		} else if (typeof value === 'object' && value !== null) {
			(masked as Record<string, unknown>)[key] = maskSensitive(value, seen, depth + 1);
		} else {
			(masked as Record<string, unknown>)[key] = value;
		}
	}

	return masked;
};

// --- SMART FORMATTING (only included if logging is enabled) ---
type FormatPattern = {
	regex: RegExp;
	ansi: string;
	css: string;
	priority?: number; // Higher priority patterns are applied first
};

// These patterns are tree-shaken away if logging is disabled
const PATTERNS: FormatPattern[] = IS_LOGGING_DISABLED
	? []
	: [
			// Highest Priority - Time measurements
			{ regex: /\b\d+(\.\d+)?(ms|s)\b/g, ansi: '\x1b[32m', css: '#22c55e', priority: 100 },

			// Very High Priority - Context-aware token detection (values after colons, equals, etc.)
			{ regex: /(?<=:\s)[a-f0-9]{32}(?=\s|$|,|\)|\]|\})/g, ansi: '\x1b[33m', css: '#f59e0b', priority: 95 }, // ID after colon
			{ regex: /(?<=:\s)[a-f0-9]{24}(?=\s|$|,|\)|\]|\})/g, ansi: '\x1b[33m', css: '#f59e0b', priority: 95 }, // ObjectId after colon
			{
				regex: /(?<=:\s)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\s|$|,|\)|\]|\})/gi,
				ansi: '\x1b[33m',
				css: '#f59e0b',
				priority: 95
			}, // UUID after colon
			{ regex: /(?<==\s?)[a-f0-9]{32}(?=\s|$|,|\)|\]|\})/g, ansi: '\x1b[33m', css: '#f59e0b', priority: 94 }, // ID after equals
			{ regex: /(?<==\s?)[a-f0-9]{24}(?=\s|$|,|\)|\]|\})/g, ansi: '\x1b[33m', css: '#f59e0b', priority: 94 }, // ObjectId after equals

			// High Priority - Paths and APIs
			{ regex: /\/api\/[^\s]+/g, ansi: '\x1b[36m', css: '#06b6d4', priority: 90 },
			{ regex: /\/[^\s]*\.(ts|js|svelte|json|css|html)/g, ansi: '\x1b[36m', css: '#06b6d4', priority: 89 },

			// Medium-High Priority - Specific keywords
			{ regex: /\bsession(s)?\b/gi, ansi: '\x1b[33m', css: '#f59e0b', priority: 85 },
			{ regex: /\btoken(s)?\b/gi, ansi: '\x1b[34m', css: '#3b82f6', priority: 85 },
			{ regex: /\b(api|cache|user|tenant):[^\s]+/g, ansi: '\x1b[36m', css: '#06b6d4', priority: 84 },
			{ regex: /\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g, ansi: '\x1b[35m', css: '#a855f7', priority: 80 },
			{ regex: /\b(200|201|204|301|302|304|400|401|403|404|500|502|503)\b/g, ansi: '\x1b[36m', css: '#06b6d4', priority: 75 },
			{ regex: /\b(user|userId|tenant|tenantId):\s*([^\s,)]+)/g, ansi: '\x1b[34m', css: '#3b82f6', priority: 70 },
			{ regex: /\b(role|permission):\s*(admin|user|editor|viewer|guest|superadmin)\b/gi, ansi: '\x1b[35m', css: '#a855f7', priority: 68 },

			// Medium Priority - IDs and UUIDs (standalone)
			{ regex: /\b[a-f0-9]{32}\b/g, ansi: '\x1b[33m', css: '#f59e0b', priority: 65 }, // 32-char hex UUIDs
			{ regex: /\b[a-f0-9]{24}\b/g, ansi: '\x1b[33m', css: '#f59e0b', priority: 64 }, // ObjectId
			{ regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ansi: '\x1b[33m', css: '#f59e0b', priority: 63 }, // Standard UUID

			// Lower Priority - Booleans and numbers
			{ regex: /\btrue\b/g, ansi: '\x1b[32m', css: '#22c55e', priority: 60 },
			{ regex: /\bfalse\b/g, ansi: '\x1b[31m', css: '#ef4444', priority: 60 },
			{ regex: /\b\d+(\.\d+)?(MB|KB|GB|%)\b/g, ansi: '\x1b[36m', css: '#06b6d4', priority: 55 },
			{ regex: /\b-?\d+(?:\.\d+)?\b/g, ansi: '\x1b[34m', css: '#3b82f6', priority: 50 }, // plain numbers
			{ regex: /\b(error|failed|failure|denied|invalid|unauthorized|forbidden)\b/gi, ansi: '\x1b[31m', css: '#ef4444', priority: 45 },
			{ regex: /\b(success|successful|granted|valid|authorized|completed)\b/gi, ansi: '\x1b[32m', css: '#22c55e', priority: 45 },

			// Lowest Priority - Quoted strings (catch remaining)
			{ regex: /"([^"]+)"/g, ansi: '\x1b[33m', css: '#f59e0b', priority: 10 },
			{ regex: /'([^']+)'/g, ansi: '\x1b[33m', css: '#f59e0b', priority: 10 }
		].sort((a, b) => (b.priority || 0) - (a.priority || 0));

const ANSI_RESET = '\x1b[0m';
const ANSI_DIM = '\x1b[2m';

// Server-side formatting (tree-shaken if in browser or disabled)
const formatServer =
	!IS_BROWSER && !IS_LOGGING_DISABLED
		? (message: string): string => {
				let formatted = message;
				for (const pattern of PATTERNS) {
					formatted = formatted.replace(pattern.regex, (match) => `${pattern.ansi}${match}${ANSI_RESET}`);
				}
				return formatted;
			}
		: (message: string) => message;

// Client-side formatting (tree-shaken if on server or disabled)
const formatClient =
	IS_BROWSER && !IS_LOGGING_DISABLED
		? (message: string): { formatted: string; styles: string[] } => {
				let formatted = message;
				const styles: string[] = [];

				for (const pattern of PATTERNS) {
					formatted = formatted.replace(pattern.regex, (match) => {
						styles.push(`color: ${pattern.css}; font-weight: 600;`);
						styles.push('color: inherit;');
						return `%c${match}%c`;
					});
				}

				return { formatted, styles };
			}
		: (message: string) => ({ formatted: message, styles: [] });

// --- CORE LOGGING FUNCTION ---
const log = (level: LogLevel, message: string, args: LoggableValue[]): void => {
	// Early exit - completely removed by tree-shaking if logging disabled
	if (IS_BUILDING || IS_LOGGING_DISABLED || !isLevelEnabled(level)) return;

	const masked = args.map((arg) => maskSensitive(arg));
	const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

	if (IS_BROWSER) {
		// Browser logging
		const levelStyles: Record<LogLevel, string> = {
			none: '',
			fatal: 'color: #dc2626; font-weight: bold; font-size: 14px;',
			error: 'color: #ef4444; font-weight: bold;',
			warn: 'color: #f59e0b; font-weight: bold;',
			info: 'color: #3b82f6;',
			debug: 'color: #9ca3af;',
			trace: 'color: #6b7280; font-style: italic;'
		};
		const emoji: Record<LogLevel, string> = {
			none: '',
			fatal: '💀',
			error: '❌',
			warn: '⚠️',
			info: 'ℹ️',
			debug: '🐛',
			trace: '🔍'
		};
		const method =
			level === 'fatal' || level === 'error' ? 'error' : level === 'warn' ? 'warn' : level === 'debug' || level === 'trace' ? 'debug' : 'log';

		const { formatted, styles } = formatClient(message);

		console[method](
			`%c[${timestamp}] %c${emoji[level]} [${level.toUpperCase()}] %c${formatted}`,
			'color: #9ca3af;',
			levelStyles[level],
			'color: inherit;',
			...styles,
			...masked
		);
	} else {
		// Server logging
		const levelColors: Record<LogLevel, string> = {
			none: '',
			fatal: '\x1b[35;1m',
			error: '\x1b[31;1m',
			warn: '\x1b[33;1m',
			info: '\x1b[36m',
			debug: '\x1b[90m',
			trace: '\x1b[90;3m'
		};
		const icons: Record<LogLevel, string> = {
			none: '',
			fatal: '✗',
			error: '✗',
			warn: '⚠',
			info: '●',
			debug: '◆',
			trace: '○'
		};

		const formattedMessage = formatServer(message);
		const formattedLevel = level.toUpperCase().padEnd(5);

		console.log(
			`${ANSI_DIM}${timestamp}${ANSI_RESET} ${levelColors[level]}${icons[level]} [${formattedLevel}]${ANSI_RESET} ${formattedMessage}`,
			...masked
		);
	}
};

// --- PUBLIC API ---
// When logging is disabled, these become no-ops that Vite can completely remove

export const logger = {
	fatal: IS_LOGGING_DISABLED ? () => {} : (msg: string, ...args: LoggableValue[]) => log('fatal', msg, args),
	error: IS_LOGGING_DISABLED ? () => {} : (msg: string, ...args: LoggableValue[]) => log('error', msg, args),
	warn: IS_LOGGING_DISABLED ? () => {} : (msg: string, ...args: LoggableValue[]) => log('warn', msg, args),
	info: IS_LOGGING_DISABLED ? () => {} : (msg: string, ...args: LoggableValue[]) => log('info', msg, args),
	debug: IS_LOGGING_DISABLED ? () => {} : (msg: string, ...args: LoggableValue[]) => log('debug', msg, args),
	trace: IS_LOGGING_DISABLED ? () => {} : (msg: string, ...args: LoggableValue[]) => log('trace', msg, args),

	channel: IS_LOGGING_DISABLED
		? () => ({
				fatal: () => {},
				error: () => {},
				warn: () => {},
				info: () => {},
				debug: () => {},
				trace: () => {}
			})
		: (name: string) => ({
				fatal: (msg: string, ...args: LoggableValue[]) => log('fatal', `[${name}] ${msg}`, args),
				error: (msg: string, ...args: LoggableValue[]) => log('error', `[${name}] ${msg}`, args),
				warn: (msg: string, ...args: LoggableValue[]) => log('warn', `[${name}] ${msg}`, args),
				info: (msg: string, ...args: LoggableValue[]) => log('info', `[${name}] ${msg}`, args),
				debug: (msg: string, ...args: LoggableValue[]) => log('debug', `[${name}] ${msg}`, args),
				trace: (msg: string, ...args: LoggableValue[]) => log('trace', `[${name}] ${msg}`, args)
			}),

	dump: IS_LOGGING_DISABLED
		? () => {}
		: (data: LoggableValue, label?: string) => {
				if (!isLevelEnabled('trace')) return;
				const prefix = label ? `DUMP[${label}]` : 'DUMP';
				if (IS_BROWSER) {
					console.group(`🔍 ${prefix}`);
					console.dir(maskSensitive(data), { depth: null });
					console.groupEnd();
				} else {
					log('trace', prefix, [data]);
				}
			}
};

// Type guard to ensure logger calls are properly typed even when disabled
if (IS_LOGGING_DISABLED) {
	// In production with logging disabled, this entire block is removed
	logger satisfies {
		fatal: (msg: string, ...args: LoggableValue[]) => void;
		error: (msg: string, ...args: LoggableValue[]) => void;
		warn: (msg: string, ...args: LoggableValue[]) => void;
		info: (msg: string, ...args: LoggableValue[]) => void;
		debug: (msg: string, ...args: LoggableValue[]) => void;
		trace: (msg: string, ...args: LoggableValue[]) => void;
		channel: (name: string) => {
			fatal: (msg: string, ...args: LoggableValue[]) => void;
			error: (msg: string, ...args: LoggableValue[]) => void;
			warn: (msg: string, ...args: LoggableValue[]) => void;
			info: (msg: string, ...args: LoggableValue[]) => void;
			debug: (msg: string, ...args: LoggableValue[]) => void;
			trace: (msg: string, ...args: LoggableValue[]) => void;
		};
		dump: (data: LoggableValue, label?: string) => void;
	};
}
