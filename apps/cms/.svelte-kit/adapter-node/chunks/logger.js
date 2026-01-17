const __vite_import_meta_env__ = {};
const IS_BROWSER = typeof window !== 'undefined';
const env = __vite_import_meta_env__ || {};
const proc = typeof process !== 'undefined' ? process.env : {};
const LOG_LEVELS = (env.VITE_LOG_LEVELS ?? proc.LOG_LEVELS ?? 'info').split(',').map((l) => l.trim().toLowerCase());
const DISABLED = LOG_LEVELS.includes('none');
const PRIORITY = {
	none: 0,
	fatal: 1,
	error: 2,
	warn: 3,
	info: 4,
	debug: 5,
	trace: 6
};
const MAX_PRIO = DISABLED ? 0 : Math.max(...LOG_LEVELS.map((l) => PRIORITY[l] ?? 0));
const enabled = (level) => !DISABLED && PRIORITY[level] <= MAX_PRIO;
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
function mask(v, depth = 0) {
	if (depth > 10) return '[Depth]';
	if (v === null || typeof v !== 'object') return v;
	if (v instanceof Date || v instanceof RegExp) return v;
	if (Array.isArray(v)) return v.map((i) => mask(i, depth + 1));
	const o = {};
	for (const [k, val] of Object.entries(v)) {
		if (SENSITIVE.some((s) => k.toLowerCase().includes(s))) {
			o[k] = '[REDACTED]';
		} else {
			o[k] = mask(val, depth + 1);
		}
	}
	return o;
}
const serverFormat =
	!IS_BROWSER && !DISABLED
		? (msg) => {
				const patterns = [
					{ re: /\b\d+(\.\d+)?(ms|s)\b/g, c: '\x1B[32m' },
					{
						re: /[a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
						c: '\x1B[33m'
					},
					{ re: /\/api\/[^\s]+/g, c: '\x1B[36m' },
					{ re: /\btrue\b/g, c: '\x1B[32m' },
					{ re: /\bfalse\b/g, c: '\x1B[31m' },
					{ re: /\b\d+\b/g, c: '\x1B[34m' }
				];
				let out = msg;
				for (const { re, c } of patterns) {
					out = out.replace(re, `${c}$&${'\x1B[0m'}`);
				}
				return out;
			}
		: (msg) => msg;
const clientFormat =
	IS_BROWSER && !DISABLED
		? (msg) => {
				const styles = [];
				let formatted = msg.replace(
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
function log(level, msg, args) {
	if (!enabled(level)) return;
	const masked = args.map(mask);
	const ts = /* @__PURE__ */ new Date().toISOString().slice(0, 19).replace('T', ' ');
	const icons = {
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
		console[method](`${'\x1B[2m'}${ts}${'\x1B[0m'} ${icons[level]} [${level.toUpperCase().padEnd(5)}] ${colored}`, ...masked);
	}
}
const logger = DISABLED
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
			fatal: (m, ...a) => log('fatal', m, a),
			error: (m, ...a) => log('error', m, a),
			warn: (m, ...a) => log('warn', m, a),
			info: (m, ...a) => log('info', m, a),
			debug: (m, ...a) => log('debug', m, a),
			trace: (m, ...a) => log('trace', m, a),
			channel: (name) => ({
				fatal: (m, ...a) => log('fatal', `[${name}] ${m}`, a),
				error: (m, ...a) => log('error', `[${name}] ${m}`, a),
				warn: (m, ...a) => log('warn', `[${name}] ${m}`, a),
				info: (m, ...a) => log('info', `[${name}] ${m}`, a),
				debug: (m, ...a) => log('debug', `[${name}] ${m}`, a),
				trace: (m, ...a) => log('trace', `[${name}] ${m}`, a)
			}),
			dump: (data, label) => {
				if (!enabled('trace')) return;
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
export { logger };
//# sourceMappingURL=logger.js.map
