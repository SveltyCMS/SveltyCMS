/**
 * @file src/utils/logger.server.ts
 * @description Server-only logger with formatting, batching, rotation & masking
 *
 * Features:
 * - Level-based logging (fatal → trace)
 * - Smart terminal formatting & token highlighting
 * - Sensitive data masking
 * - Batched file writes with rotation & optional compression
 * - Configurable via env/public settings
 * - Graceful degradation & cleanup
 */

if (typeof window !== 'undefined') {
	throw new Error('logger.server.ts cannot be imported in browser code');
}

// Get LOG_LEVELS from environment variables directly (avoids Svelte store dependency)
const LOG_LEVELS_RAW = process.env.LOG_LEVELS || import.meta.env?.VITE_LOG_LEVELS || 'fatal,error,warn,info';
const LOG_LEVELS = LOG_LEVELS_RAW.split(',').map((l: string) => l.trim().toLowerCase());
const DISABLED = LOG_LEVELS.includes('none');

// Log levels
type LogLevel = 'none' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
const LEVELS: Record<LogLevel, { prio: number; color: string }> = {
	none: { prio: 0, color: '' },
	fatal: { prio: 1, color: '\x1b[35m' }, // magenta
	error: { prio: 2, color: '\x1b[31m' }, // red
	warn: { prio: 3, color: '\x1b[33m' }, // yellow
	info: { prio: 4, color: '\x1b[32m' }, // green
	debug: { prio: 5, color: '\x1b[34m' }, // blue
	trace: { prio: 6, color: '\x1b[36m' } // cyan
};

const RESET = '\x1b[0m';
export type LoggableValue = string | number | boolean | null | undefined | object | Date | Error;

const maxPrio = DISABLED ? 0 : Math.max(...LOG_LEVELS.map((l) => LEVELS[l as LogLevel]?.prio ?? 0));

// Icons
const ICONS: Record<string, string> = {
	FATAL: '✗',
	ERROR: '✗',
	WARN: '⚠',
	INFO: '●',
	DEBUG: '◆',
	TRACE: '○'
};

// Message token highlighting
const patterns = [
	{ re: /\b\d+(\.\d+)?(ms|s)\b/g, color: '\x1b[32m' }, // durations
	{
		re: /([a-f0-9]{24}|[a-f0-9]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi,
		color: '\x1b[33m'
	}, // IDs/UUIDs
	{ re: /\/api\/[^\s]+/g, color: '\x1b[36m' }, // API paths
	{ re: /\b(true)\b/g, color: '\x1b[32m' },
	{ re: /\b(false)\b/g, color: '\x1b[31m' },
	{ re: /\b-?\d+\.?\d*\b/g, color: '\x1b[34m' }
];

function colorMessage(msg: string): string {
	let out = msg;
	for (const { re, color } of patterns) {
		out = out.replace(re, `${color}$&${RESET}`);
	}
	return out;
}

// Value formatting
function formatValue(v: unknown): string {
	if (v === null) return '\x1b[35mnull\x1b[0m';
	if (v === undefined) return '\x1b[90mundefined\x1b[0m';
	if (typeof v === 'boolean') return v ? '\x1b[32mtrue\x1b[0m' : '\x1b[31mfalse\x1b[0m';
	if (typeof v === 'number') return `\x1b[34m${v}\x1b[0m`;
	if (typeof v === 'string') return colorMessage(v);
	if (v instanceof Date) return `\x1b[36m${v.toISOString()}\x1b[0m`;
	if (Array.isArray(v)) return `\x1b[33m[${v.map(formatValue).join(', ')}]\x1b[0m`;
	if (typeof v === 'object') {
		const entries = Object.entries(v)
			.map(([k, val]) => `${k}: ${formatValue(val)}`)
			.join(', ');
		return `\x1b[33m{${entries}}\x1b[0m`;
	}
	return String(v);
}

// Sensitive data masking
const SENSITIVE = ['password', 'token', 'secret', 'key', 'authorization'];
const EMAILS = ['email', 'mail'];

function mask(v: unknown, depth = 0): unknown {
	if (depth > 10) return '[Depth]';
	if (v === null || typeof v !== 'object') return v;
	if (v instanceof Date || v instanceof RegExp) return v;
	if (Array.isArray(v)) return v.map((item) => mask(item, depth + 1));

	const masked: Record<string, unknown> = {};
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

// File ops (lazy loaded)
let stream: import('node:fs').WriteStream | null = null;
let modules: any = null;

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
		if (stat.size < 5 * 1024 * 1024) return; // 5MB

		if (stream) stream.end();
		const ts = new Date().toISOString().replace(/[:.]/g, '-');
		const rotated = `${file}.${ts}`;
		await promises.rename(file, rotated);
		await promises.writeFile(file, '');

		if (true) {
			// compression enabled
			const src = (await getMods()).fs.createReadStream(rotated);
			const dst = (await getMods()).fs.createWriteStream(`${rotated}.gz`);
			await sp.pipeline(src, zlib.createGzip(), dst);
			await promises.unlink(rotated);
		}
	} catch (e: any) {
		if (e.code !== 'ENOENT') console.error('Rotation failed:', e);
	}
}

// Batch queue
const queue: { level: LogLevel; msg: string; args: unknown[] }[] = [];
let timeout: NodeJS.Timeout | null = null;

function flush() {
	if (!queue.length) return;
	const batch = queue.splice(0, queue.length);
	const lines = batch
		.map((e) => {
			const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
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

function enqueue(level: LogLevel, msg: string, args: unknown[]) {
	if (DISABLED || LEVELS[level].prio > maxPrio) return;

	const masked = args.map(mask);
	const color = LEVELS[level].color;
	const icon = ICONS[level.toUpperCase()] ?? '●';
	const argsStr = masked.map(formatValue).join(' ');
	const pretty = colorMessage(msg);

	const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
	process.stdout.write(`${ts} ${color}${icon} [${level.toUpperCase().padEnd(5)}]${RESET} ${pretty} ${argsStr}\n`);

	queue.push({ level, msg, args: masked });
	if (queue.length >= 100) flush();
	else if (!timeout)
		timeout = setTimeout(() => {
			timeout = null;
			flush();
		}, 5000);
}

// Public logger
export const logger = DISABLED
	? {
			fatal: () => {},
			error: () => {},
			warn: () => {},
			info: () => {},
			debug: () => {},
			trace: () => {}
		}
	: {
			fatal: (m: string, ...a: unknown[]) => enqueue('fatal', m, a),
			error: (m: string, ...a: unknown[]) => enqueue('error', m, a),
			warn: (m: string, ...a: unknown[]) => enqueue('warn', m, a),
			info: (m: string, ...a: unknown[]) => enqueue('info', m, a),
			debug: (m: string, ...a: unknown[]) => enqueue('debug', m, a),
			trace: (m: string, ...a: unknown[]) => enqueue('trace', m, a)
		};
