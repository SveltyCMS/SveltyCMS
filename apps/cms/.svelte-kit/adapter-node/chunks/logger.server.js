import { publicEnv } from './globalSettings.svelte.js';
const IS_BROWSER = typeof window !== 'undefined';
if (IS_BROWSER) {
	console.warn('[logger.server.ts] Server logger imported in browser - using noop fallback');
}
const getEnv = (key, fallback) => {
	try {
		const v = publicEnv[key];
		return v !== void 0 ? v : fallback;
	} catch {
		return fallback;
	}
};
const LOG_LEVELS = getEnv('LOG_LEVELS', ['fatal', 'error', 'warn', 'info']);
const DISABLED = LOG_LEVELS.includes('none');
const LEVELS = {
	none: { prio: 0, color: '' },
	fatal: { prio: 1, color: '\x1B[35m' },
	// magenta
	error: { prio: 2, color: '\x1B[31m' },
	// red
	warn: { prio: 3, color: '\x1B[33m' },
	// yellow
	info: { prio: 4, color: '\x1B[32m' },
	// green
	debug: { prio: 5, color: '\x1B[34m' },
	// blue
	trace: { prio: 6, color: '\x1B[36m' }
	// cyan
};
const RESET = '\x1B[0m';
const maxPrio = DISABLED ? 0 : Math.max(...LOG_LEVELS.map((l) => LEVELS[l]?.prio ?? 0));
const ICONS = {
	FATAL: '✗',
	ERROR: '✗',
	WARN: '⚠',
	INFO: '●',
	DEBUG: '◆',
	TRACE: '○'
};
const patterns = [
	{ re: /\b\d+(\.\d+)?(ms|s)\b/g, color: '\x1B[32m' },
	// durations
	{
		re: /([a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
		color: '\x1B[33m'
	},
	// IDs/UUIDs
	{ re: /\/api\/[^\s]+/g, color: '\x1B[36m' },
	// API paths
	{ re: /\b(true)\b/g, color: '\x1B[32m' },
	{ re: /\b(false)\b/g, color: '\x1B[31m' },
	{ re: /\b-?\d+\.?\d*\b/g, color: '\x1B[34m' }
];
function colorMessage(msg) {
	let out = msg;
	for (const { re, color } of patterns) {
		out = out.replace(re, `${color}$1${RESET}`);
	}
	return out;
}
function formatValue(v) {
	if (v === null) return '\x1B[35mnull\x1B[0m';
	if (v === void 0) return '\x1B[90mundefined\x1B[0m';
	if (typeof v === 'boolean') return v ? '\x1B[32mtrue\x1B[0m' : '\x1B[31mfalse\x1B[0m';
	if (typeof v === 'number') return `\x1B[34m${v}\x1B[0m`;
	if (typeof v === 'string') return colorMessage(v);
	if (v instanceof Date) return `\x1B[36m${v.toISOString()}\x1B[0m`;
	if (Array.isArray(v)) return `\x1B[33m[${v.map(formatValue).join(', ')}]\x1B[0m`;
	if (typeof v === 'object') {
		const entries = Object.entries(v)
			.map(([k, val]) => `${k}: ${formatValue(val)}`)
			.join(', ');
		return `\x1B[33m{${entries}}\x1B[0m`;
	}
	return String(v);
}
const SENSITIVE = ['password', 'token', 'secret', 'key', 'authorization'];
const EMAILS = ['email', 'mail'];
function mask(v, depth = 0) {
	if (depth > 10) return '[Depth]';
	if (v === null || typeof v !== 'object') return v;
	if (v instanceof Date || v instanceof RegExp) return v;
	if (Array.isArray(v)) return v.map((item) => mask(item, depth + 1));
	const masked = {};
	for (const [k, val] of Object.entries(v)) {
		const low = k.toLowerCase();
		if (SENSITIVE.some((s) => low.includes(s))) masked[k] = '[REDACTED]';
		else if (EMAILS.some((e) => low.includes(e)) && typeof val === 'string') {
			const [local, domain] = val.split('@');
			masked[k] = domain ? `${local.slice(0, 2)}***@${domain}` : '***';
		} else {
			masked[k] = mask(val, depth + 1);
		}
	}
	return masked;
}
let stream = null;
let modules = null;
async function getMods() {
	if (modules) return modules;
	modules = {
		fs: await import('node:fs'),
		path: await import('node:path'),
		zlib: await import('node:zlib'),
		stream: await import('node:stream/promises'),
		promises: await import('node:fs/promises')
	};
	return modules;
}
async function ensureStream() {
	const { path, fs } = await getMods();
	const dir = 'logs';
	const file = path.join(dir, 'app.log');
	if (!stream || stream.destroyed) {
		await (await getMods()).promises.mkdir(dir, { recursive: true });
		stream = fs.createWriteStream(file, { flags: 'a' });
	}
	return stream;
}
async function rotate() {
	const { path, promises, zlib, stream: sp } = await getMods();
	const file = path.join('logs', 'app.log');
	try {
		const stat = await promises.stat(file);
		if (stat.size < 5 * 1024 * 1024) return;
		if (stream) stream.end();
		const ts = /* @__PURE__ */ new Date().toISOString().replace(/[:.]/g, '-');
		const rotated = `${file}.${ts}`;
		await promises.rename(file, rotated);
		await promises.writeFile(file, '');
		if (true) {
			const src = (await getMods()).fs.createReadStream(rotated);
			const dst = (await getMods()).fs.createWriteStream(`${rotated}.gz`);
			await sp.pipeline(src, zlib.createGzip(), dst);
			await promises.unlink(rotated);
		}
	} catch (e) {
		if (e.code !== 'ENOENT') console.error('Rotation failed:', e);
	}
}
const queue = [];
let timeout = null;
function flush() {
	if (!queue.length) return;
	const batch = queue.splice(0, queue.length);
	const lines = batch
		.map((e) => {
			const ts = /* @__PURE__ */ new Date().toISOString().slice(0, 19).replace('T', ' ');
			const icon = ICONS[e.level.toUpperCase()] ?? '●';
			const color = LEVELS[e.level].color;
			const masked = e.args.map((a) => mask(a));
			const args = masked.map(formatValue).join(' ');
			const msg = colorMessage(e.msg);
			return `${ts} ${color}${icon} [${e.level.toUpperCase().padEnd(5)}]${RESET} ${msg} ${args}`;
		})
		.join('\n');
	ensureStream()
		.then((s) => {
			if (s) rotate().finally(() => s.write(lines + '\n'));
		})
		.catch((err) => console.error('Log write failed:', err));
}
function enqueue(level, msg, args) {
	if (DISABLED || LEVELS[level].prio > maxPrio) return;
	const masked = args.map(mask);
	const color = LEVELS[level].color;
	const icon = ICONS[level.toUpperCase()] ?? '●';
	const argsStr = masked.map(formatValue).join(' ');
	const pretty = colorMessage(msg);
	const ts = /* @__PURE__ */ new Date().toISOString().slice(0, 19).replace('T', ' ');
	process.stdout.write(`${ts} ${color}${icon} [${level.toUpperCase().padEnd(5)}]${RESET} ${pretty} ${argsStr}
`);
	queue.push({ level, msg, args: masked });
	if (queue.length >= 100) flush();
	else if (!timeout)
		timeout = setTimeout(() => {
			timeout = null;
			flush();
		}, 5e3);
}
const logger =
	IS_BROWSER || DISABLED
		? {
				fatal: () => {},
				error: () => {},
				warn: () => {},
				info: () => {},
				debug: () => {},
				trace: () => {}
			}
		: {
				fatal: (m, ...a) => enqueue('fatal', m, a),
				error: (m, ...a) => enqueue('error', m, a),
				warn: (m, ...a) => enqueue('warn', m, a),
				info: (m, ...a) => enqueue('info', m, a),
				debug: (m, ...a) => enqueue('debug', m, a),
				trace: (m, ...a) => enqueue('trace', m, a)
			};
export { logger as l };
//# sourceMappingURL=logger.server.js.map
