const g = {};
var m = {};
const i = typeof window < 'u',
	_ = g || {},
	w = typeof process < 'u' ? m : {},
	l = (_.VITE_LOG_LEVELS ?? w.LOG_LEVELS ?? 'info').split(',').map((e) => e.trim().toLowerCase()),
	c = l.includes('none'),
	p = { none: 0, fatal: 1, error: 2, warn: 3, info: 4, debug: 5, trace: 6 },
	E = c ? 0 : Math.max(...l.map((e) => p[e] ?? 0)),
	b = (e) => !c && p[e] <= E,
	h = [
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
function f(e, r = 0) {
	if (r > 10) return '[Depth]';
	if (e === null || typeof e != 'object' || e instanceof Date || e instanceof RegExp) return e;
	if (Array.isArray(e)) return e.map((o) => f(o, r + 1));
	const t = {};
	for (const [o, a] of Object.entries(e)) h.some((s) => o.toLowerCase().includes(s)) ? (t[o] = '[REDACTED]') : (t[o] = f(a, r + 1));
	return t;
}
const x =
		!i && !c
			? (e) => {
					const r = [
						{ re: /\b\d+(\.\d+)?(ms|s)\b/g, c: '\x1B[32m' },
						{ re: /[a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, c: '\x1B[33m' },
						{ re: /\/api\/[^\s]+/g, c: '\x1B[36m' },
						{ re: /\btrue\b/g, c: '\x1B[32m' },
						{ re: /\bfalse\b/g, c: '\x1B[31m' },
						{ re: /\b\d+\b/g, c: '\x1B[34m' }
					];
					let t = e;
					for (const { re: o, c: a } of r) t = t.replace(o, `${a}$&\x1B[0m`);
					return t;
				}
			: (e) => e,
	L =
		i && !c
			? (e) => {
					const r = [];
					return {
						formatted: e.replace(
							/\b\d+(\.\d+)?(ms|s)\b|[a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\/api\/[^\s]+|\btrue\b|\bfalse\b|\b\d+\b/gi,
							(o) => {
								const a = o.match(/ms|s|\d/)
									? '#22c55e'
									: o.match(/[a-f0-9]{24}|[a-f0-9]{32}|uuid/i)
										? '#f59e0b'
										: o === 'true'
											? '#22c55e'
											: o === 'false'
												? '#ef4444'
												: o.startsWith('/api/')
													? '#06b6d4'
													: '#3b82f6';
								return (r.push(`color:${a};font-weight:bold`), r.push('color:inherit'), `%c${o}%c`);
							}
						),
						styles: r
					};
				}
			: () => ({ formatted: '', styles: [] });
function n(e, r, t) {
	if (!b(e)) return;
	const o = t.map(f),
		a = new Date().toISOString().slice(0, 19).replace('T', ' '),
		s = { fatal: '💀', error: '❌', warn: '⚠️', info: 'ℹ️', debug: '🐛', trace: '🔍', none: '' },
		u = e === 'fatal' || e === 'error' ? 'error' : e === 'warn' ? 'warn' : 'log';
	if (i) {
		const { formatted: d, styles: $ } = L(r);
		console[u](`%c${a}%c ${s[e]} [${e.toUpperCase()}] %c${d}`, 'color:#9ca3af', '', 'color:inherit', ...$, ...o);
	} else {
		const d = x(r);
		console[u](`\x1B[2m${a}\x1B[0m ${s[e]} [${e.toUpperCase().padEnd(5)}] ${d}`, ...o);
	}
}
const B = c
	? {
			fatal: () => {},
			error: () => {},
			warn: () => {},
			info: () => {},
			debug: () => {},
			trace: () => {},
			channel: () => ({ fatal: () => {}, error: () => {}, warn: () => {}, info: () => {}, debug: () => {}, trace: () => {} }),
			dump: () => {}
		}
	: {
			fatal: (e, ...r) => n('fatal', e, r),
			error: (e, ...r) => n('error', e, r),
			warn: (e, ...r) => n('warn', e, r),
			info: (e, ...r) => n('info', e, r),
			debug: (e, ...r) => n('debug', e, r),
			trace: (e, ...r) => n('trace', e, r),
			channel: (e) => ({
				fatal: (r, ...t) => n('fatal', `[${e}] ${r}`, t),
				error: (r, ...t) => n('error', `[${e}] ${r}`, t),
				warn: (r, ...t) => n('warn', `[${e}] ${r}`, t),
				info: (r, ...t) => n('info', `[${e}] ${r}`, t),
				debug: (r, ...t) => n('debug', `[${e}] ${r}`, t),
				trace: (r, ...t) => n('trace', `[${e}] ${r}`, t)
			}),
			dump: (e, r) => {
				if (!b('trace')) return;
				const t = r ? `DUMP[${r}]` : 'DUMP';
				i ? (console.group(`🔍 ${t}`), console.dir(f(e), { depth: null }), console.groupEnd()) : n('trace', t, [e]);
			}
		};
export { B as l };
//# sourceMappingURL=BvngfGKt.js.map
