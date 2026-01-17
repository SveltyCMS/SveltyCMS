import { g as X } from './DaWZu8wl.js';
import ee from 'node:crypto';
import re from 'node:util';
import ne from 'fs';
import te from 'path';
import ie from 'os';
function oe(s, g) {
	for (var a = 0; a < g.length; a++) {
		const v = g[a];
		if (typeof v != 'string' && !Array.isArray(v)) {
			for (const b in v)
				if (b !== 'default' && !(b in s)) {
					const _ = Object.getOwnPropertyDescriptor(v, b);
					_ && Object.defineProperty(s, b, _.get ? _ : { enumerable: !0, get: () => v[b] });
				}
		}
	}
	return Object.freeze(Object.defineProperty(s, Symbol.toStringTag, { value: 'Module' }));
}
var O = {},
	D,
	F;
function se() {
	if (F) return D;
	F = 1;
	const s = /^[a-z0-9-]{1,32}$/,
		g = /^[a-z0-9-]{1,32}$/,
		a = /^[a-zA-Z0-9/+.-]+$/,
		v = /^([a-zA-Z0-9/+.-]+|)$/,
		b = /^((-)?[1-9]\d*|0)$/,
		_ = /^v=(\d+)$/;
	function S(e) {
		return w(e)
			.map((n) => [n, e[n]].join('='))
			.join(',');
	}
	function C(e) {
		const n = {};
		return (
			e.split(',').forEach((f) => {
				const m = f.split('=');
				if (m.length < 2) throw new TypeError('params must be in the format name=value');
				n[m.shift()] = m.join('=');
			}),
			n
		);
	}
	function w(e) {
		return Object.keys(e);
	}
	function $(e) {
		return typeof Object.values == 'function' ? Object.values(e) : w(e).map((n) => e[n]);
	}
	function j(e) {
		const n = [''];
		if (typeof e != 'object' || e === null) throw new TypeError('opts must be an object');
		if (typeof e.id != 'string') throw new TypeError('id must be a string');
		if (!s.test(e.id)) throw new TypeError(`id must satisfy ${s}`);
		if ((n.push(e.id), typeof e.version < 'u')) {
			if (typeof e.version != 'number' || e.version < 0 || !Number.isInteger(e.version))
				throw new TypeError('version must be a positive integer number');
			n.push(`v=${e.version}`);
		}
		if (typeof e.params < 'u') {
			if (typeof e.params != 'object' || e.params === null) throw new TypeError('params must be an object');
			const m = w(e.params);
			if (!m.every((o) => g.test(o))) throw new TypeError(`params names must satisfy ${g}`);
			m.forEach((o) => {
				typeof e.params[o] == 'number'
					? (e.params[o] = e.params[o].toString())
					: Buffer.isBuffer(e.params[o]) && (e.params[o] = e.params[o].toString('base64').split('=')[0]);
			});
			const E = $(e.params);
			if (!E.every((o) => typeof o == 'string')) throw new TypeError('params values must be strings');
			if (!E.every((o) => a.test(o))) throw new TypeError(`params values must satisfy ${a}`);
			const d = S(e.params);
			n.push(d);
		}
		if (typeof e.salt < 'u') {
			if (!Buffer.isBuffer(e.salt)) throw new TypeError('salt must be a Buffer');
			if ((n.push(e.salt.toString('base64').split('=')[0]), typeof e.hash < 'u')) {
				if (!Buffer.isBuffer(e.hash)) throw new TypeError('hash must be a Buffer');
				n.push(e.hash.toString('base64').split('=')[0]);
			}
		}
		return n.join('$');
	}
	function T(e) {
		if (typeof e != 'string' || e === '') throw new TypeError('pchstr must be a non-empty string');
		if (e[0] !== '$') throw new TypeError('pchstr must contain a $ as first char');
		const n = e.split('$');
		n.shift();
		let f = 5;
		if ((_.test(n[1]) || f--, n.length > f)) throw new TypeError(`pchstr contains too many fileds: ${n.length}/${f}`);
		const m = n.shift();
		if (!s.test(m)) throw new TypeError(`id must satisfy ${s}`);
		let E;
		_.test(n[0]) && (E = parseInt(n.shift().match(_)[1], 10));
		let d, o;
		v.test(n[n.length - 1]) &&
			(n.length > 1 && v.test(n[n.length - 2]) && (d = Buffer.from(n.pop(), 'base64')), (o = Buffer.from(n.pop(), 'base64')));
		let u;
		if (n.length > 0) {
			const y = n.pop();
			if (((u = C(y)), !w(u).every((l) => g.test(l)))) throw new TypeError(`params names must satisfy ${g}`);
			if (!$(u).every((l) => a.test(l))) throw new TypeError(`params values must satisfy ${a}`);
			w(u).forEach((l) => {
				u[l] = b.test(u[l]) ? parseInt(u[l], 10) : u[l];
			});
		}
		if (n.length > 0) throw new TypeError(`pchstr contains unrecognized fileds: ${n}`);
		const c = { id: m };
		return (E && (c.version = E), u && (c.params = u), o && (c.salt = o), d && (c.hash = d), c);
	}
	return ((D = { serialize: j, deserialize: T }), D);
}
function K(s) {
	throw new Error(
		'Could not dynamically require "' +
			s +
			'". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.'
	);
}
var L = { exports: {} },
	P,
	V;
function ae() {
	if (V) return P;
	V = 1;
	var s = {},
		g = ne,
		a = te,
		v = ie,
		b = typeof __webpack_require__ == 'function' ? __non_webpack_require__ : K,
		_ = (process.config && process.config.variables) || {},
		S = !!s.PREBUILDS_ONLY,
		C = process.versions.modules,
		w = x() ? 'electron' : q() ? 'node-webkit' : 'node',
		$ = s.npm_config_arch || v.arch(),
		j = s.npm_config_platform || v.platform(),
		T = s.LIBC || (N(j) ? 'musl' : 'glibc'),
		e = s.ARM_VERSION || ($ === 'arm64' ? '8' : _.arm_version) || '',
		n = (process.versions.uv || '').split('.')[0];
	P = f;
	function f(r) {
		return b(f.resolve(r));
	}
	f.resolve = f.path = function (r) {
		r = a.resolve(r || '.');
		try {
			var i = b(a.join(r, 'package.json')).name.toUpperCase().replace(/-/g, '_');
			s[i + '_PREBUILD'] && (r = s[i + '_PREBUILD']);
		} catch {}
		if (!S) {
			var t = E(a.join(r, 'build/Release'), d);
			if (t) return t;
			var h = E(a.join(r, 'build/Debug'), d);
			if (h) return h;
		}
		var z = I(r);
		if (z) return z;
		var p = I(a.dirname(process.execPath));
		if (p) return p;
		var Y = [
			'platform=' + j,
			'arch=' + $,
			'runtime=' + w,
			'abi=' + C,
			'uv=' + n,
			e ? 'armv=' + e : '',
			'libc=' + T,
			'node=' + process.versions.node,
			process.versions.electron ? 'electron=' + process.versions.electron : '',
			typeof __webpack_require__ == 'function' ? 'webpack=true' : ''
		]
			.filter(Boolean)
			.join(' ');
		throw new Error(
			'No native build was found for ' +
				Y +
				`
    loaded from: ` +
				r +
				`
`
		);
		function I(A) {
			var J = m(a.join(A, 'prebuilds')).map(o),
				k = J.filter(u(j, $)).sort(c)[0];
			if (k) {
				var G = a.join(A, 'prebuilds', k.name),
					Q = m(G).map(y),
					W = Q.filter(B(w, C)),
					U = W.sort(l(w))[0];
				if (U) return a.join(G, U.file);
			}
		}
	};
	function m(r) {
		try {
			return g.readdirSync(r);
		} catch {
			return [];
		}
	}
	function E(r, i) {
		var t = m(r).filter(i);
		return t[0] && a.join(r, t[0]);
	}
	function d(r) {
		return /\.node$/.test(r);
	}
	function o(r) {
		var i = r.split('-');
		if (i.length === 2) {
			var t = i[0],
				h = i[1].split('+');
			if (t && h.length && h.every(Boolean)) return { name: r, platform: t, architectures: h };
		}
	}
	function u(r, i) {
		return function (t) {
			return t == null || t.platform !== r ? !1 : t.architectures.includes(i);
		};
	}
	function c(r, i) {
		return r.architectures.length - i.architectures.length;
	}
	function y(r) {
		var i = r.split('.'),
			t = i.pop(),
			h = { file: r, specificity: 0 };
		if (t === 'node') {
			for (var z = 0; z < i.length; z++) {
				var p = i[z];
				if (p === 'node' || p === 'electron' || p === 'node-webkit') h.runtime = p;
				else if (p === 'napi') h.napi = !0;
				else if (p.slice(0, 3) === 'abi') h.abi = p.slice(3);
				else if (p.slice(0, 2) === 'uv') h.uv = p.slice(2);
				else if (p.slice(0, 4) === 'armv') h.armv = p.slice(4);
				else if (p === 'glibc' || p === 'musl') h.libc = p;
				else continue;
				h.specificity++;
			}
			return h;
		}
	}
	function B(r, i) {
		return function (t) {
			return !(
				t == null ||
				(t.runtime && t.runtime !== r && !R(t)) ||
				(t.abi && t.abi !== i && !t.napi) ||
				(t.uv && t.uv !== n) ||
				(t.armv && t.armv !== e) ||
				(t.libc && t.libc !== T)
			);
		};
	}
	function R(r) {
		return r.runtime === 'node' && r.napi;
	}
	function l(r) {
		return function (i, t) {
			return i.runtime !== t.runtime
				? i.runtime === r
					? -1
					: 1
				: i.abi !== t.abi
					? i.abi
						? -1
						: 1
					: i.specificity !== t.specificity
						? i.specificity > t.specificity
							? -1
							: 1
						: 0;
		};
	}
	function q() {
		return !!(process.versions && process.versions.nw);
	}
	function x() {
		return (process.versions && process.versions.electron) || s.ELECTRON_RUN_AS_NODE
			? !0
			: typeof window < 'u' && window.process && window.process.type === 'renderer';
	}
	function N(r) {
		return r === 'linux' && g.existsSync('/etc/alpine-release');
	}
	return ((f.parseTags = y), (f.matchTags = B), (f.compareTags = l), (f.parseTuple = o), (f.matchTuple = u), (f.compareTuples = c), P);
}
var M;
function fe() {
	if (M) return L.exports;
	M = 1;
	const s = typeof __webpack_require__ == 'function' ? __non_webpack_require__ : K;
	return (typeof s.addon == 'function' ? (L.exports = s.addon.bind(s)) : (L.exports = ae()), L.exports);
}
var H;
function ue() {
	if (H) return O;
	H = 1;
	const { randomBytes: s, timingSafeEqual: g } = ee,
		{ promisify: a } = re,
		{ deserialize: v, serialize: b } = se(),
		_ = fe(),
		{ hash: S } = _(__dirname),
		C = a(s),
		w = 0,
		$ = 1,
		j = 2;
	((O.argon2d = w), (O.argon2i = $), (O.argon2id = j));
	const T = Object.freeze({ argon2d: w, argon2i: $, argon2id: j }),
		e = Object.freeze({ [T.argon2d]: 'argon2d', [T.argon2i]: 'argon2i', [T.argon2id]: 'argon2id' }),
		n = { hashLength: 32, timeCost: 3, memoryCost: 65536, parallelism: 4, type: j, version: 19 };
	async function f(d, o) {
		let { raw: u, salt: c, ...y } = { ...n, ...o };
		if (y.hashLength > 2 ** 32 - 1) throw new RangeError('Hash length is too large');
		if (y.memoryCost > 2 ** 32 - 1) throw new RangeError('Memory cost is too large');
		if (y.timeCost > 2 ** 32 - 1) throw new RangeError('Time cost is too large');
		if (y.parallelism > 2 ** 24 - 1) throw new RangeError('Parallelism is too large');
		c = c ?? (await C(16));
		const {
				hashLength: B,
				secret: R = Buffer.alloc(0),
				type: l,
				version: q,
				memoryCost: x,
				timeCost: N,
				parallelism: r,
				associatedData: i = Buffer.alloc(0)
			} = y,
			t = await S({ password: Buffer.from(d), salt: c, secret: R, data: i, hashLength: B, m: x, t: N, p: r, version: q, type: l });
		return u ? t : b({ id: e[l], version: q, params: { m: x, t: N, p: r, ...(i.byteLength > 0 ? { data: i } : {}) }, salt: c, hash: t });
	}
	O.hash = f;
	function m(d, o = {}) {
		const { memoryCost: u, timeCost: c, parallelism: y, version: B } = { ...n, ...o },
			{
				version: R,
				params: { m: l, t: q, p: x }
			} = v(d);
		return +R != +B || +l != +u || +q != +c || +x != +y;
	}
	O.needsRehash = m;
	async function E(d, o, u = {}) {
		const { id: c, ...y } = v(d);
		if (!(c in T)) return !1;
		const {
				version: B = 16,
				params: { m: R, t: l, p: q, data: x = '' },
				salt: N,
				hash: r
			} = y,
			{ secret: i = Buffer.alloc(0) } = u;
		return g(
			await S({
				password: Buffer.from(o),
				salt: N,
				secret: i,
				data: Buffer.from(x, 'base64'),
				hashLength: r.byteLength,
				m: +R,
				t: +l,
				p: +q,
				version: +B,
				type: T[c]
			}),
			r
		);
	}
	return ((O.verify = E), O);
}
var Z = ue();
const ce = X(Z),
	ye = oe({ __proto__: null, default: ce }, [Z]);
export { ye as a };
//# sourceMappingURL=1W7nyCeE.js.map
