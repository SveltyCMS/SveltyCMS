/**
 * @file src/utils/logger.ts
 * @description Universal logger (client + server) with formatting & tree-shaking
 *
 * Features:
 * - Level-based logging (fatal → trace)
 * - Smart token highlighting
 * - Sensitive data masking
 * - Channel support
 * - Dump helper
 * - Fully stripped when VITE_LOG_LEVELS=none
 *
 * Configure via VITE_LOG_LEVELS (build) or LOG_LEVELS (runtime)
 */
const IS_BROWSER = typeof window !== 'undefined';

export type LoggableValue = string | number | boolean | null | undefined | object | Date | Error;

// Log levels from env
const LOG_LEVELS = (import.meta.env?.VITE_LOG_LEVELS ?? process?.env?.LOG_LEVELS ?? 'info')
	.split(',')
	.map((l) => l.trim().toLowerCase()) as LogLevel[];

const DISABLED = LOG_LEVELS.includes('none');

type LogLevel = 'none' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const PRIORITY: Record<LogLevel, number> = {
	none: 0,
	fatal: 1,
	error: 2,
	warn: 3,
	info: 4,
	debug: 5,
	trace: 6
};

const MAX_PRIO = DISABLED ? 0 : Math.max(...LOG_LEVELS.map((l) => PRIORITY[l] ?? 0));

// Enabled check (inlined)
const enabled = (level: LogLevel) => !DISABLED && PRIORITY[level] <= MAX_PRIO;

// Sensitive keys
const SENSITIVE = [
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
	'auth'
];

// Masking
function mask(v: unknown, depth = 0): unknown {
	if (depth > 10) {
		return '[Depth]';
	}
	if (v === null || typeof v !== 'object') {
		return v;
	}
	if (v instanceof Date || v instanceof RegExp) {
		return v;
	}
	if (Array.isArray(v)) {
		return v.map((i) => mask(i, depth + 1));
	}

	const o: Record<string, unknown> = {};
	for (const [k, val] of Object.entries(v)) {
		if (SENSITIVE.some((s) => k.toLowerCase().includes(s))) {
			o[k] = '[REDACTED]';
		} else {
			o[k] = mask(val, depth + 1);
		}
	}
	return o;
}

// Server formatting (ANSI)
const serverFormat =
	IS_BROWSER || DISABLED
		? (msg: string) => msg
		: (msg: string) => {
				const patterns = [
					{ re: /\b\d+(\.\d+)?(ms|s)\b/g, c: '\x1b[32m' },
					{
						re: /[a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
						c: '\x1b[33m'
					},
					{ re: /\/api\/[^\s]+/g, c: '\x1b[36m' },
					{ re: /\btrue\b/g, c: '\x1b[32m' },
					{ re: /\bfalse\b/g, c: '\x1b[31m' },
					{ re: /\b\d+\b/g, c: '\x1b[34m' }
				];
				let out = msg;
				for (const { re, c } of patterns) {
					out = out.replace(re, `${c}$&${'\x1b[0m'}`);
				}
				return out;
			};

// Client formatting (console %c)
const clientFormat =
	IS_BROWSER && !DISABLED
		? (msg: string) => {
				const styles: string[] = [];
				const formatted = msg.replace(
					/\b\d+(\.\d+)?(ms|s)\b|[a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\/api\/[^\s]+|\btrue\b|\bfalse\b|\b\d+\b/gi,
					(m) => {
						const color = m.match(/ms|s|\d/)
							? '#22c55e'
							: m.match(/[a-f0-9]{24}|[a-f0-9]{32}|uuid/i)
								? '#f59e0b'
								: m === 'true'
									? '#22c55e'
									: m === 'false'
										? '#ef4444'
										: m.startsWith('/api/')
											? '#06b6d4'
											: '#3b82f6';
						styles.push(`color:${color};font-weight:bold`);
						styles.push('color:inherit');
						return `%c${m}%c`;
					}
				);
				return { formatted, styles };
			}
		: () => ({ formatted: '', styles: [] });

// Core log
function log(level: LogLevel, msg: string, args: unknown[]) {
	if (!enabled(level)) {
		return;
	}

	const masked = args.map(mask);
	const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
	const icons: Record<LogLevel, string> = {
		fatal: '💀',
		error: '❌',
		warn: '⚠️',
		info: 'ℹ️',
		debug: '🐛',
		trace: '🔍',
		none: ''
	};
	const method = level === 'fatal' || level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';

	if (IS_BROWSER) {
		const { formatted, styles } = clientFormat(msg);
		console[method](`%c${ts}%c ${icons[level]} [${level.toUpperCase()}] %c${formatted}`, 'color:#9ca3af', '', 'color:inherit', ...styles, ...masked);
	} else {
		const colored = serverFormat(msg);
		console[method](`${'\x1b[2m'}${ts}${'\x1b[0m'} ${icons[level]} [${level.toUpperCase().padEnd(5)}] ${colored}`, ...masked);
	}
}

// Public logger
export const logger = DISABLED
	? {
			fatal: () => {},
			error: () => {},
			warn: () => {},
			info: () => {},
			debug: () => {},
			trace: () => {},
			channel: () => ({
				fatal: () => {},
				error: () => {},
				warn: () => {},
				info: () => {},
				debug: () => {},
				trace: () => {}
			}),
			dump: () => {}
		}
	: {
			fatal: (m: string, ...a: unknown[]) => log('fatal', m, a),
			error: (m: string, ...a: unknown[]) => log('error', m, a),
			warn: (m: string, ...a: unknown[]) => log('warn', m, a),
			info: (m: string, ...a: unknown[]) => log('info', m, a),
			debug: (m: string, ...a: unknown[]) => log('debug', m, a),
			trace: (m: string, ...a: unknown[]) => log('trace', m, a),

			channel: (name: string) => ({
				fatal: (m: string, ...a: unknown[]) => log('fatal', `[${name}] ${m}`, a),
				error: (m: string, ...a: unknown[]) => log('error', `[${name}] ${m}`, a),
				warn: (m: string, ...a: unknown[]) => log('warn', `[${name}] ${m}`, a),
				info: (m: string, ...a: unknown[]) => log('info', `[${name}] ${m}`, a),
				debug: (m: string, ...a: unknown[]) => log('debug', `[${name}] ${m}`, a),
				trace: (m: string, ...a: unknown[]) => log('trace', `[${name}] ${m}`, a)
			}),

			dump: (data: unknown, label?: string) => {
				if (!enabled('trace')) {
					return;
				}
				const prefix = label ? `DUMP[${label}]` : 'DUMP';
				if (IS_BROWSER) {
					console.group(`🔍 ${prefix}`);
					console.dir(mask(data), { depth: null });
					console.groupEnd();
				} else {
					log('trace', prefix, [data]);
				}
			}
		};
