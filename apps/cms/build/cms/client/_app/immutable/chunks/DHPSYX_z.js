import { o as ze, s as Lt } from './CMZtchEj.js';
import { b as Tt, t as Ut } from './B17Q6ahh.js';
import { w as Ne } from './DvgRl2rN.js';
import { v as Pt } from './XmViZn7X.js';
import { d as O, g as C, b as N, B as xt, a9 as ce, aD as Ot } from './DrlZFkx8.js';
class we {
	constructor(t, n) {
		((this.status = t), typeof n == 'string' ? (this.body = { message: n }) : n ? (this.body = n) : (this.body = { message: `Error: ${t}` }));
	}
	toString() {
		return JSON.stringify(this.body);
	}
}
class $e {
	constructor(t, n) {
		((this.status = t), (this.location = n));
	}
}
class je extends Error {
	constructor(t, n, r) {
		(super(r), (this.status = t), (this.text = n));
	}
}
new URL('sveltekit-internal://');
function Ct(e, t) {
	return e === '/' || t === 'ignore' ? e : t === 'never' ? (e.endsWith('/') ? e.slice(0, -1) : e) : t === 'always' && !e.endsWith('/') ? e + '/' : e;
}
function Nt(e) {
	return e.split('%25').map(decodeURI).join('%25');
}
function $t(e) {
	for (const t in e) e[t] = decodeURIComponent(e[t]);
	return e;
}
function Se({ href: e }) {
	return e.split('#')[0];
}
function jt(e, t, n, r = !1) {
	const a = new URL(e);
	Object.defineProperty(a, 'searchParams', {
		value: new Proxy(a.searchParams, {
			get(o, c) {
				if (c === 'get' || c === 'getAll' || c === 'has') return (l, ...d) => (n(l), o[c](l, ...d));
				t();
				const i = Reflect.get(o, c);
				return typeof i == 'function' ? i.bind(o) : i;
			}
		}),
		enumerable: !0,
		configurable: !0
	});
	const s = ['href', 'pathname', 'search', 'toString', 'toJSON'];
	r && s.push('hash');
	for (const o of s)
		Object.defineProperty(a, o, {
			get() {
				return (t(), e[o]);
			},
			enumerable: !0,
			configurable: !0
		});
	return a;
}
function Dt(...e) {
	let t = 5381;
	for (const n of e)
		if (typeof n == 'string') {
			let r = n.length;
			for (; r; ) t = (t * 33) ^ n.charCodeAt(--r);
		} else if (ArrayBuffer.isView(n)) {
			const r = new Uint8Array(n.buffer, n.byteOffset, n.byteLength);
			let a = r.length;
			for (; a; ) t = (t * 33) ^ r[--a];
		} else throw new TypeError('value must be a string or TypedArray');
	return (t >>> 0).toString(36);
}
const Bt = window.fetch;
window.fetch = (e, t) => ((e instanceof Request ? e.method : t?.method || 'GET') !== 'GET' && z.delete(De(e)), Bt(e, t));
const z = new Map();
function Ft(e, t) {
	const n = De(e, t),
		r = document.querySelector(n);
	if (r?.textContent) {
		r.remove();
		let { body: a, ...s } = JSON.parse(r.textContent);
		const o = r.getAttribute('data-ttl');
		return (
			o && z.set(n, { body: a, init: s, ttl: 1e3 * Number(o) }),
			r.getAttribute('data-b64') !== null && (a = Tt(a)),
			Promise.resolve(new Response(a, s))
		);
	}
	return window.fetch(e, t);
}
function Mt(e, t, n) {
	if (z.size > 0) {
		const r = De(e, n),
			a = z.get(r);
		if (a) {
			if (performance.now() < a.ttl && ['default', 'force-cache', 'only-if-cached', void 0].includes(n?.cache)) return new Response(a.body, a.init);
			z.delete(r);
		}
	}
	return window.fetch(t, n);
}
function De(e, t) {
	let r = `script[data-sveltekit-fetched][data-url=${JSON.stringify(e instanceof Request ? e.url : e)}]`;
	if (t?.headers || t?.body) {
		const a = [];
		(t.headers && a.push([...new Headers(t.headers)].join(',')),
			t.body && (typeof t.body == 'string' || ArrayBuffer.isView(t.body)) && a.push(t.body),
			(r += `[data-hash="${Dt(...a)}"]`));
	}
	return r;
}
const Vt = /^(\[)?(\.\.\.)?(\w+)(?:=(\w+))?(\])?$/;
function qt(e) {
	const t = [];
	return {
		pattern:
			e === '/'
				? /^\/$/
				: new RegExp(
						`^${Yt(e)
							.map((r) => {
								const a = /^\[\.\.\.(\w+)(?:=(\w+))?\]$/.exec(r);
								if (a) return (t.push({ name: a[1], matcher: a[2], optional: !1, rest: !0, chained: !0 }), '(?:/([^]*))?');
								const s = /^\[\[(\w+)(?:=(\w+))?\]\]$/.exec(r);
								if (s) return (t.push({ name: s[1], matcher: s[2], optional: !0, rest: !1, chained: !0 }), '(?:/([^/]+))?');
								if (!r) return;
								const o = r.split(/\[(.+?)\](?!\])/);
								return (
									'/' +
									o
										.map((i, l) => {
											if (l % 2) {
												if (i.startsWith('x+')) return Ae(String.fromCharCode(parseInt(i.slice(2), 16)));
												if (i.startsWith('u+'))
													return Ae(
														String.fromCharCode(
															...i
																.slice(2)
																.split('-')
																.map((w) => parseInt(w, 16))
														)
													);
												const d = Vt.exec(i),
													[, p, h, f, u] = d;
												return (
													t.push({ name: f, matcher: u, optional: !!p, rest: !!h, chained: h ? l === 1 && o[0] === '' : !1 }),
													h ? '([^]*?)' : p ? '([^/]*)?' : '([^/]+?)'
												);
											}
											return Ae(i);
										})
										.join('')
								);
							})
							.join('')}/?$`
					),
		params: t
	};
}
function Gt(e) {
	return e !== '' && !/^\([^)]+\)$/.test(e);
}
function Yt(e) {
	return e.slice(1).split('/').filter(Gt);
}
function Ht(e, t, n) {
	const r = {},
		a = e.slice(1),
		s = a.filter((c) => c !== void 0);
	let o = 0;
	for (let c = 0; c < t.length; c += 1) {
		const i = t[c];
		let l = a[c - o];
		if (
			(i.chained &&
				i.rest &&
				o &&
				((l = a
					.slice(c - o, c + 1)
					.filter((d) => d)
					.join('/')),
				(o = 0)),
			l === void 0)
		) {
			i.rest && (r[i.name] = '');
			continue;
		}
		if (!i.matcher || n[i.matcher](l)) {
			r[i.name] = l;
			const d = t[c + 1],
				p = a[c + 1];
			(d && !d.rest && d.optional && p && i.chained && (o = 0), !d && !p && Object.keys(r).length === s.length && (o = 0));
			continue;
		}
		if (i.optional && i.chained) {
			o++;
			continue;
		}
		return;
	}
	if (!o) return r;
}
function Ae(e) {
	return e
		.normalize()
		.replace(/[[\]]/g, '\\$&')
		.replace(/%/g, '%25')
		.replace(/\//g, '%2[Ff]')
		.replace(/\?/g, '%3[Ff]')
		.replace(/#/g, '%23')
		.replace(/[.*+?^${}()|\\]/g, '\\$&');
}
function Kt({ nodes: e, server_loads: t, dictionary: n, matchers: r }) {
	const a = new Set(t);
	return Object.entries(n).map(([c, [i, l, d]]) => {
		const { pattern: p, params: h } = qt(c),
			f = {
				id: c,
				exec: (u) => {
					const w = p.exec(u);
					if (w) return Ht(w, h, r);
				},
				errors: [1, ...(d || [])].map((u) => e[u]),
				layouts: [0, ...(l || [])].map(o),
				leaf: s(i)
			};
		return ((f.errors.length = f.layouts.length = Math.max(f.errors.length, f.layouts.length)), f);
	});
	function s(c) {
		const i = c < 0;
		return (i && (c = ~c), [i, e[c]]);
	}
	function o(c) {
		return c === void 0 ? c : [a.has(c), e[c]];
	}
}
function ot(e, t = JSON.parse) {
	try {
		return t(sessionStorage[e]);
	} catch {}
}
function Xe(e, t, n = JSON.stringify) {
	const r = n(t);
	try {
		sessionStorage[e] = r;
	} catch {}
}
const T = globalThis.__sveltekit_1pg8w0k?.base ?? '',
	Wt = globalThis.__sveltekit_1pg8w0k?.assets ?? T ?? '',
	st = 'sveltekit:snapshot',
	it = 'sveltekit:scroll',
	Be = 'sveltekit:states',
	ct = 'sveltekit:pageurl',
	F = 'sveltekit:history',
	H = 'sveltekit:navigation',
	B = { tap: 1, hover: 2, viewport: 3, eager: 4, off: -1, false: -1 },
	re = location.origin;
function ae(e) {
	if (e instanceof URL) return e;
	let t = document.baseURI;
	if (!t) {
		const n = document.getElementsByTagName('base');
		t = n.length ? n[0].href : document.URL;
	}
	return new URL(e, t);
}
function ye() {
	return { x: pageXOffset, y: pageYOffset };
}
function q(e, t) {
	return e.getAttribute(`data-sveltekit-${t}`);
}
const Ze = { ...B, '': B.hover };
function lt(e) {
	let t = e.assignedSlot ?? e.parentNode;
	return (t?.nodeType === 11 && (t = t.host), t);
}
function ft(e, t) {
	for (; e && e !== t; ) {
		if (e.nodeName.toUpperCase() === 'A' && e.hasAttribute('href')) return e;
		e = lt(e);
	}
}
function Te(e, t, n) {
	let r;
	try {
		if (((r = new URL(e instanceof SVGAElement ? e.href.baseVal : e.href, document.baseURI)), n && r.hash.match(/^#[^/]/))) {
			const c = location.hash.split('#')[1] || '/';
			r.hash = `#${c}${r.hash}`;
		}
	} catch {}
	const a = e instanceof SVGAElement ? e.target.baseVal : e.target,
		s = !r || !!a || ve(r, t, n) || (e.getAttribute('rel') || '').split(/\s+/).includes('external'),
		o = r?.origin === re && e.hasAttribute('download');
	return { url: r, external: s, target: a, download: o };
}
function le(e) {
	let t = null,
		n = null,
		r = null,
		a = null,
		s = null,
		o = null,
		c = e;
	for (; c && c !== document.documentElement; )
		(r === null && (r = q(c, 'preload-code')),
			a === null && (a = q(c, 'preload-data')),
			t === null && (t = q(c, 'keepfocus')),
			n === null && (n = q(c, 'noscroll')),
			s === null && (s = q(c, 'reload')),
			o === null && (o = q(c, 'replacestate')),
			(c = lt(c)));
	function i(l) {
		switch (l) {
			case '':
			case 'true':
				return !0;
			case 'off':
			case 'false':
				return !1;
			default:
				return;
		}
	}
	return { preload_code: Ze[r ?? 'off'], preload_data: Ze[a ?? 'off'], keepfocus: i(t), noscroll: i(n), reload: i(s), replace_state: i(o) };
}
function Qe(e) {
	const t = Ne(e);
	let n = !0;
	function r() {
		((n = !0), t.update((o) => o));
	}
	function a(o) {
		((n = !1), t.set(o));
	}
	function s(o) {
		let c;
		return t.subscribe((i) => {
			(c === void 0 || (n && i !== c)) && o((c = i));
		});
	}
	return { notify: r, set: a, subscribe: s };
}
const ut = { v: () => {} };
function Jt() {
	const { set: e, subscribe: t } = Ne(!1);
	let n;
	async function r() {
		clearTimeout(n);
		try {
			const a = await fetch(`${Wt}/_app/version.json`, { headers: { pragma: 'no-cache', 'cache-control': 'no-cache' } });
			if (!a.ok) return !1;
			const o = (await a.json()).version !== Pt;
			return (o && (e(!0), ut.v(), clearTimeout(n)), o);
		} catch {
			return !1;
		}
	}
	return { subscribe: t, check: r };
}
function ve(e, t, n) {
	return e.origin !== re || !e.pathname.startsWith(t) ? !0 : n ? e.pathname !== location.pathname : !1;
}
function jn(e) {}
function zt(e) {
	const t = Zt(e),
		n = new ArrayBuffer(t.length),
		r = new DataView(n);
	for (let a = 0; a < n.byteLength; a++) r.setUint8(a, t.charCodeAt(a));
	return n;
}
const Xt = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function Zt(e) {
	e.length % 4 === 0 && (e = e.replace(/==?$/, ''));
	let t = '',
		n = 0,
		r = 0;
	for (let a = 0; a < e.length; a++)
		((n <<= 6),
			(n |= Xt.indexOf(e[a])),
			(r += 6),
			r === 24 &&
				((t += String.fromCharCode((n & 16711680) >> 16)),
				(t += String.fromCharCode((n & 65280) >> 8)),
				(t += String.fromCharCode(n & 255)),
				(n = r = 0)));
	return (
		r === 12
			? ((n >>= 4), (t += String.fromCharCode(n)))
			: r === 18 && ((n >>= 2), (t += String.fromCharCode((n & 65280) >> 8)), (t += String.fromCharCode(n & 255))),
		t
	);
}
const Qt = -1,
	en = -2,
	tn = -3,
	nn = -4,
	rn = -5,
	an = -6;
function Dn(e, t) {
	return dt(JSON.parse(e), t);
}
function dt(e, t) {
	if (typeof e == 'number') return s(e, !0);
	if (!Array.isArray(e) || e.length === 0) throw new Error('Invalid input');
	const n = e,
		r = Array(n.length);
	let a = null;
	function s(o, c = !1) {
		if (o === Qt) return;
		if (o === tn) return NaN;
		if (o === nn) return 1 / 0;
		if (o === rn) return -1 / 0;
		if (o === an) return -0;
		if (c || typeof o != 'number') throw new Error('Invalid input');
		if (o in r) return r[o];
		const i = n[o];
		if (!i || typeof i != 'object') r[o] = i;
		else if (Array.isArray(i))
			if (typeof i[0] == 'string') {
				const l = i[0],
					d = t && Object.hasOwn(t, l) ? t[l] : void 0;
				if (d) {
					let p = i[1];
					if ((typeof p != 'number' && (p = n.push(i[1]) - 1), (a ??= new Set()), a.has(p))) throw new Error('Invalid circular reference');
					return (a.add(p), (r[o] = d(s(p))), a.delete(p), r[o]);
				}
				switch (l) {
					case 'Date':
						r[o] = new Date(i[1]);
						break;
					case 'Set':
						const p = new Set();
						r[o] = p;
						for (let u = 1; u < i.length; u += 1) p.add(s(i[u]));
						break;
					case 'Map':
						const h = new Map();
						r[o] = h;
						for (let u = 1; u < i.length; u += 2) h.set(s(i[u]), s(i[u + 1]));
						break;
					case 'RegExp':
						r[o] = new RegExp(i[1], i[2]);
						break;
					case 'Object':
						r[o] = Object(i[1]);
						break;
					case 'BigInt':
						r[o] = BigInt(i[1]);
						break;
					case 'null':
						const f = Object.create(null);
						r[o] = f;
						for (let u = 1; u < i.length; u += 2) f[i[u]] = s(i[u + 1]);
						break;
					case 'Int8Array':
					case 'Uint8Array':
					case 'Uint8ClampedArray':
					case 'Int16Array':
					case 'Uint16Array':
					case 'Int32Array':
					case 'Uint32Array':
					case 'Float32Array':
					case 'Float64Array':
					case 'BigInt64Array':
					case 'BigUint64Array': {
						if (n[i[1]][0] !== 'ArrayBuffer') throw new Error('Invalid data');
						const u = globalThis[l],
							w = s(i[1]),
							k = new u(w);
						r[o] = i[2] !== void 0 ? k.subarray(i[2], i[3]) : k;
						break;
					}
					case 'ArrayBuffer': {
						const u = i[1];
						if (typeof u != 'string') throw new Error('Invalid ArrayBuffer encoding');
						const w = zt(u);
						r[o] = w;
						break;
					}
					case 'Temporal.Duration':
					case 'Temporal.Instant':
					case 'Temporal.PlainDate':
					case 'Temporal.PlainTime':
					case 'Temporal.PlainDateTime':
					case 'Temporal.PlainMonthDay':
					case 'Temporal.PlainYearMonth':
					case 'Temporal.ZonedDateTime': {
						const u = l.slice(9);
						r[o] = Temporal[u].from(i[1]);
						break;
					}
					case 'URL': {
						const u = new URL(i[1]);
						r[o] = u;
						break;
					}
					case 'URLSearchParams': {
						const u = new URLSearchParams(i[1]);
						r[o] = u;
						break;
					}
					default:
						throw new Error(`Unknown type ${l}`);
				}
			} else {
				const l = new Array(i.length);
				r[o] = l;
				for (let d = 0; d < i.length; d += 1) {
					const p = i[d];
					p !== en && (l[d] = s(p));
				}
			}
		else {
			const l = {};
			r[o] = l;
			for (const d in i) {
				if (d === '__proto__') throw new Error('Cannot parse an object with a `__proto__` property');
				const p = i[d];
				l[d] = s(p);
			}
		}
		return r[o];
	}
	return s(0);
}
const ht = new Set(['load', 'prerender', 'csr', 'ssr', 'trailingSlash', 'config']);
[...ht];
const on = new Set([...ht]);
[...on];
function sn(e) {
	return e.filter((t) => t != null);
}
const cn = 'x-sveltekit-invalidated',
	ln = 'x-sveltekit-trailing-slash';
function fe(e) {
	return e instanceof we || e instanceof je ? e.status : 500;
}
function fn(e) {
	return e instanceof je ? e.text : 'Internal Error';
}
let y, Q, Re;
const un = ze.toString().includes('$$') || /function \w+\(\) \{\}/.test(ze.toString());
un
	? ((y = { data: {}, form: null, error: null, params: {}, route: { id: null }, state: {}, status: -1, url: new URL('https://example.com') }),
		(Q = { current: null }),
		(Re = { current: !1 }))
	: ((y = new (class {
			#e = O({});
			get data() {
				return C(this.#e);
			}
			set data(t) {
				N(this.#e, t);
			}
			#t = O(null);
			get form() {
				return C(this.#t);
			}
			set form(t) {
				N(this.#t, t);
			}
			#n = O(null);
			get error() {
				return C(this.#n);
			}
			set error(t) {
				N(this.#n, t);
			}
			#r = O({});
			get params() {
				return C(this.#r);
			}
			set params(t) {
				N(this.#r, t);
			}
			#a = O({ id: null });
			get route() {
				return C(this.#a);
			}
			set route(t) {
				N(this.#a, t);
			}
			#o = O({});
			get state() {
				return C(this.#o);
			}
			set state(t) {
				N(this.#o, t);
			}
			#s = O(-1);
			get status() {
				return C(this.#s);
			}
			set status(t) {
				N(this.#s, t);
			}
			#i = O(new URL('https://example.com'));
			get url() {
				return C(this.#i);
			}
			set url(t) {
				N(this.#i, t);
			}
		})()),
		(Q = new (class {
			#e = O(null);
			get current() {
				return C(this.#e);
			}
			set current(t) {
				N(this.#e, t);
			}
		})()),
		(Re = new (class {
			#e = O(!1);
			get current() {
				return C(this.#e);
			}
			set current(t) {
				N(this.#e, t);
			}
		})()),
		(ut.v = () => (Re.current = !0)));
function Fe(e) {
	Object.assign(y, e);
}
const dn = '/__data.json',
	hn = '.html__data.json';
function pn(e) {
	return e.endsWith('.html') ? e.replace(/\.html$/, hn) : e.replace(/\/$/, '') + dn;
}
const et = {
		spanContext() {
			return gn;
		},
		setAttribute() {
			return this;
		},
		setAttributes() {
			return this;
		},
		addEvent() {
			return this;
		},
		setStatus() {
			return this;
		},
		updateName() {
			return this;
		},
		end() {
			return this;
		},
		isRecording() {
			return !1;
		},
		recordException() {
			return this;
		},
		addLink() {
			return this;
		},
		addLinks() {
			return this;
		}
	},
	gn = { traceId: '', spanId: '', traceFlags: 0 },
	{ onMount: mn, tick: pt } = Lt,
	_n = xt ?? ((e) => e()),
	wn = new Set(['icon', 'shortcut icon', 'apple-touch-icon']),
	M = ot(it) ?? {},
	ee = ot(st) ?? {},
	D = { url: Qe({}), page: Qe({}), navigating: Ne(null), updated: Jt() };
function Me(e) {
	M[e] = ye();
}
function yn(e, t) {
	let n = e + 1;
	for (; M[n]; ) (delete M[n], (n += 1));
	for (n = t + 1; ee[n]; ) (delete ee[n], (n += 1));
}
function K(e, t = !1) {
	return (t ? location.replace(e.href) : (location.href = e.href), new Promise(() => {}));
}
async function gt() {
	if ('serviceWorker' in navigator) {
		const e = await navigator.serviceWorker.getRegistration(T || '/');
		e && (await e.update());
	}
}
function Ue() {}
let Ve, Pe, ue, $, xe, E;
const de = [],
	he = [];
let P = null;
function pe() {
	(P?.fork?.then((e) => e?.discard()), (P = null));
}
const ie = new Map(),
	qe = new Set(),
	vn = new Set(),
	X = new Set();
let g = { branch: [], error: null, url: null },
	Ge = !1,
	ge = !1,
	tt = !0,
	te = !1,
	J = !1,
	mt = !1,
	oe = !1,
	V,
	R,
	I,
	j;
const Z = new Set();
let Ie;
const me = new Map();
async function Vn(e, t, n) {
	(globalThis.__sveltekit_1pg8w0k?.data && globalThis.__sveltekit_1pg8w0k.data,
		document.URL !== location.href && (location.href = location.href),
		(E = e),
		await e.hooks.init?.(),
		(Ve = Kt(e)),
		($ = document.documentElement),
		(xe = t),
		(Pe = e.nodes[0]),
		(ue = e.nodes[1]),
		Pe(),
		ue(),
		(R = history.state?.[F]),
		(I = history.state?.[H]),
		R || ((R = I = Date.now()), history.replaceState({ ...history.state, [F]: R, [H]: I }, '')));
	const r = M[R];
	function a() {
		r && ((history.scrollRestoration = 'manual'), scrollTo(r.x, r.y));
	}
	(n ? (a(), await Un(xe, n)) : (await G({ type: 'enter', url: ae(E.hash ? Pn(new URL(location.href)) : location.href), replace_state: !0 }), a()),
		Tn());
}
async function bn(e = !0, t = !0) {
	if ((await (Ie ||= Promise.resolve()), !Ie)) return;
	Ie = null;
	const n = (j = {}),
		r = await W(g.url, !0);
	if (
		(pe(),
		oe &&
			me.forEach(({ resource: a }) => {
				a.refresh?.();
			}),
		e)
	) {
		const a = y.state,
			s = r && (await Ke(r));
		if (!s || n !== j) return;
		if (s.type === 'redirect') return be(new URL(s.location, g.url).href, { replaceState: !0 }, 1, n);
		(t || (s.props.page.state = a), Fe(s.props.page), (g = s.state), Oe(), V.$set(s.props));
	} else Oe();
	await Promise.all([...me.values()].map(({ resource: a }) => a)).catch(Ue);
}
function Oe() {
	((de.length = 0), (oe = !1));
}
function _t(e) {
	he.some((t) => t?.snapshot) && (ee[e] = he.map((t) => t?.snapshot?.capture()));
}
function wt(e) {
	ee[e]?.forEach((t, n) => {
		he[n]?.snapshot?.restore(t);
	});
}
function nt() {
	(Me(R), Xe(it, M), _t(I), Xe(st, ee));
}
async function be(e, t, n, r) {
	let a;
	(t.invalidateAll && pe(),
		await G({
			type: 'goto',
			url: ae(e),
			keepfocus: t.keepFocus,
			noscroll: t.noScroll,
			replace_state: t.replaceState,
			state: t.state,
			redirect_count: n,
			nav_token: r,
			accept: () => {
				(t.invalidateAll && ((oe = !0), (a = [...me.keys()])), t.invalidate && t.invalidate.forEach(In));
			}
		}),
		t.invalidateAll &&
			ce()
				.then(ce)
				.then(() => {
					me.forEach(({ resource: s }, o) => {
						a?.includes(o) && s.refresh?.();
					});
				}));
}
async function yt(e) {
	if (e.id !== P?.id) {
		pe();
		const t = {};
		(Z.add(t),
			(P = {
				id: e.id,
				token: t,
				promise: Ke({ ...e, preload: t }).then((n) => (Z.delete(t), n.type === 'loaded' && n.state.error && pe(), n)),
				fork: null
			}));
	}
	return P.promise;
}
async function Le(e) {
	const t = (await W(e, !1))?.route;
	t && (await Promise.all([...t.layouts, t.leaf].map((n) => n?.[1]())));
}
async function vt(e, t, n) {
	g = e.state;
	const r = document.querySelector('style[data-sveltekit]');
	if (
		(r && r.remove(),
		Object.assign(y, e.props.page),
		(V = new E.root({ target: t, props: { ...e.props, stores: D, components: he }, hydrate: n, sync: !1 })),
		await Promise.resolve(),
		wt(I),
		n)
	) {
		const a = {
			from: null,
			to: { params: g.params, route: { id: g.route?.id ?? null }, url: new URL(location.href) },
			willUnload: !1,
			type: 'enter',
			complete: Promise.resolve()
		};
		X.forEach((s) => s(a));
	}
	ge = !0;
}
function ne({ url: e, params: t, branch: n, status: r, error: a, route: s, form: o }) {
	let c = 'never';
	if (T && (e.pathname === T || e.pathname === T + '/')) c = 'always';
	else for (const f of n) f?.slash !== void 0 && (c = f.slash);
	((e.pathname = Ct(e.pathname, c)), (e.search = e.search));
	const i = {
		type: 'loaded',
		state: { url: e, params: t, branch: n, error: a, route: s },
		props: { constructors: sn(n).map((f) => f.node.component), page: se(y) }
	};
	o !== void 0 && (i.props.form = o);
	let l = {},
		d = !y,
		p = 0;
	for (let f = 0; f < Math.max(n.length, g.branch.length); f += 1) {
		const u = n[f],
			w = g.branch[f];
		(u?.data !== w?.data && (d = !0), u && ((l = { ...l, ...u.data }), d && (i.props[`data_${p}`] = l), (p += 1)));
	}
	return (
		(!g.url || e.href !== g.url.href || g.error !== a || (o !== void 0 && o !== y.form) || d) &&
			(i.props.page = {
				error: a,
				params: t,
				route: { id: s?.id ?? null },
				state: {},
				status: r,
				url: new URL(e),
				form: o ?? null,
				data: d ? l : y.data
			}),
		i
	);
}
async function Ye({ loader: e, parent: t, url: n, params: r, route: a, server_data_node: s }) {
	let o = null,
		c = !0;
	const i = { dependencies: new Set(), params: new Set(), parent: !1, route: !1, url: !1, search_params: new Set() },
		l = await e();
	if (l.universal?.load) {
		let d = function (...h) {
			for (const f of h) {
				const { href: u } = new URL(f, n);
				i.dependencies.add(u);
			}
		};
		const p = {
			tracing: { enabled: !1, root: et, current: et },
			route: new Proxy(a, { get: (h, f) => (c && (i.route = !0), h[f]) }),
			params: new Proxy(r, { get: (h, f) => (c && i.params.add(f), h[f]) }),
			data: s?.data ?? null,
			url: jt(
				n,
				() => {
					c && (i.url = !0);
				},
				(h) => {
					c && i.search_params.add(h);
				},
				E.hash
			),
			async fetch(h, f) {
				h instanceof Request &&
					(f = {
						body: h.method === 'GET' || h.method === 'HEAD' ? void 0 : await h.blob(),
						cache: h.cache,
						credentials: h.credentials,
						headers: [...h.headers].length > 0 ? h?.headers : void 0,
						integrity: h.integrity,
						keepalive: h.keepalive,
						method: h.method,
						mode: h.mode,
						redirect: h.redirect,
						referrer: h.referrer,
						referrerPolicy: h.referrerPolicy,
						signal: h.signal,
						...f
					});
				const { resolved: u, promise: w } = bt(h, f, n);
				return (c && d(u.href), w);
			},
			setHeaders: () => {},
			depends: d,
			parent() {
				return (c && (i.parent = !0), t());
			},
			untrack(h) {
				c = !1;
				try {
					return h();
				} finally {
					c = !0;
				}
			}
		};
		o = (await l.universal.load.call(null, p)) ?? null;
	}
	return {
		node: l,
		loader: e,
		server: s,
		universal: l.universal?.load ? { type: 'data', data: o, uses: i } : null,
		data: o ?? s?.data ?? null,
		slash: l.universal?.trailingSlash ?? s?.slash
	};
}
function bt(e, t, n) {
	let r = e instanceof Request ? e.url : e;
	const a = new URL(r, n);
	a.origin === n.origin && (r = a.href.slice(n.origin.length));
	const s = ge ? Mt(r, a.href, t) : Ft(r, t);
	return { resolved: a, promise: s };
}
function rt(e, t, n, r, a, s) {
	if (oe) return !0;
	if (!a) return !1;
	if ((a.parent && e) || (a.route && t) || (a.url && n)) return !0;
	for (const o of a.search_params) if (r.has(o)) return !0;
	for (const o of a.params) if (s[o] !== g.params[o]) return !0;
	for (const o of a.dependencies) if (de.some((c) => c(new URL(o)))) return !0;
	return !1;
}
function He(e, t) {
	return e?.type === 'data' ? e : e?.type === 'skip' ? (t ?? null) : null;
}
function kn(e, t) {
	if (!e) return new Set(t.searchParams.keys());
	const n = new Set([...e.searchParams.keys(), ...t.searchParams.keys()]);
	for (const r of n) {
		const a = e.searchParams.getAll(r),
			s = t.searchParams.getAll(r);
		a.every((o) => s.includes(o)) && s.every((o) => a.includes(o)) && n.delete(r);
	}
	return n;
}
function at({ error: e, url: t, route: n, params: r }) {
	return { type: 'loaded', state: { error: e, url: t, route: n, params: r, branch: [] }, props: { page: se(y), constructors: [] } };
}
async function Ke({ id: e, invalidating: t, url: n, params: r, route: a, preload: s }) {
	if (P?.id === e) return (Z.delete(P.token), P.promise);
	const { errors: o, layouts: c, leaf: i } = a,
		l = [...c, i];
	(o.forEach((_) => _?.().catch(() => {})), l.forEach((_) => _?.[1]().catch(() => {})));
	let d = null;
	const p = g.url ? e !== _e(g.url) : !1,
		h = g.route ? a.id !== g.route.id : !1,
		f = kn(g.url, n);
	let u = !1;
	{
		const _ = l.map((v, S) => {
			const A = g.branch[S],
				b = !!v?.[0] && (A?.loader !== v[1] || rt(u, h, p, f, A.server?.uses, r));
			return (b && (u = !0), b);
		});
		if (_.some(Boolean)) {
			try {
				d = await At(n, _);
			} catch (v) {
				const S = await Y(v, { url: n, params: r, route: { id: e } });
				return Z.has(s) ? at({ error: S, url: n, params: r, route: a }) : ke({ status: fe(v), error: S, url: n, route: a });
			}
			if (d.type === 'redirect') return d;
		}
	}
	const w = d?.nodes;
	let k = !1;
	const m = l.map(async (_, v) => {
		if (!_) return;
		const S = g.branch[v],
			A = w?.[v];
		if ((!A || A.type === 'skip') && _[1] === S?.loader && !rt(k, h, p, f, S.universal?.uses, r)) return S;
		if (((k = !0), A?.type === 'error')) throw A;
		return Ye({
			loader: _[1],
			url: n,
			params: r,
			route: a,
			parent: async () => {
				const x = {};
				for (let L = 0; L < v; L += 1) Object.assign(x, (await m[L])?.data);
				return x;
			},
			server_data_node: He(A === void 0 && _[0] ? { type: 'skip' } : (A ?? null), _[0] ? S?.server : void 0)
		});
	});
	for (const _ of m) _.catch(() => {});
	const U = [];
	for (let _ = 0; _ < l.length; _ += 1)
		if (l[_])
			try {
				U.push(await m[_]);
			} catch (v) {
				if (v instanceof $e) return { type: 'redirect', location: v.location };
				if (Z.has(s)) return at({ error: await Y(v, { params: r, url: n, route: { id: a.id } }), url: n, params: r, route: a });
				let S = fe(v),
					A;
				if (w?.includes(v)) ((S = v.status ?? S), (A = v.error));
				else if (v instanceof we) A = v.body;
				else {
					if (await D.updated.check()) return (await gt(), await K(n));
					A = await Y(v, { params: r, url: n, route: { id: a.id } });
				}
				const b = await kt(_, U, o);
				return b
					? ne({ url: n, params: r, branch: U.slice(0, b.idx).concat(b.node), status: S, error: A, route: a })
					: await St(n, { id: a.id }, A, S);
			}
		else U.push(void 0);
	return ne({ url: n, params: r, branch: U, status: 200, error: null, route: a, form: t ? void 0 : null });
}
async function kt(e, t, n) {
	for (; e--; )
		if (n[e]) {
			let r = e;
			for (; !t[r]; ) r -= 1;
			try {
				return { idx: r + 1, node: { node: await n[e](), loader: n[e], data: {}, server: null, universal: null } };
			} catch {
				continue;
			}
		}
}
async function ke({ status: e, error: t, url: n, route: r }) {
	const a = {};
	let s = null;
	if (E.server_loads[0] === 0)
		try {
			const c = await At(n, [!0]);
			if (c.type !== 'data' || (c.nodes[0] && c.nodes[0].type !== 'data')) throw 0;
			s = c.nodes[0] ?? null;
		} catch {
			(n.origin !== re || n.pathname !== location.pathname || Ge) && (await K(n));
		}
	try {
		const o = await Ye({ loader: Pe, url: n, params: a, route: r, parent: () => Promise.resolve({}), server_data_node: He(s) }),
			c = { node: await ue(), loader: ue, universal: null, server: null, data: null };
		return ne({ url: n, params: a, branch: [o, c], status: e, error: t, route: null });
	} catch (o) {
		if (o instanceof $e) return be(new URL(o.location, location.href), {}, 0);
		throw o;
	}
}
async function En(e) {
	const t = e.href;
	if (ie.has(t)) return ie.get(t);
	let n;
	try {
		const r = (async () => {
			let a = (await E.hooks.reroute({ url: new URL(e), fetch: async (s, o) => bt(s, o, e).promise })) ?? e;
			if (typeof a == 'string') {
				const s = new URL(e);
				(E.hash ? (s.hash = a) : (s.pathname = a), (a = s));
			}
			return a;
		})();
		(ie.set(t, r), (n = await r));
	} catch {
		ie.delete(t);
		return;
	}
	return n;
}
async function W(e, t) {
	if (e && !ve(e, T, E.hash)) {
		const n = await En(e);
		if (!n) return;
		const r = Sn(n);
		for (const a of Ve) {
			const s = a.exec(r);
			if (s) return { id: _e(e), invalidating: t, route: a, params: $t(s), url: e };
		}
	}
}
function Sn(e) {
	return Nt(E.hash ? e.hash.replace(/^#/, '').replace(/[?#].+/, '') : e.pathname.slice(T.length)) || '/';
}
function _e(e) {
	return (E.hash ? e.hash.replace(/^#/, '') : e.pathname) + e.search;
}
function Et({ url: e, type: t, intent: n, delta: r, event: a }) {
	let s = !1;
	const o = Je(g, n, e, t);
	(r !== void 0 && (o.navigation.delta = r), a !== void 0 && (o.navigation.event = a));
	const c = {
		...o.navigation,
		cancel: () => {
			((s = !0), o.reject(new Error('navigation cancelled')));
		}
	};
	return (te || qe.forEach((i) => i(c)), s ? null : o);
}
async function G({
	type: e,
	url: t,
	popped: n,
	keepfocus: r,
	noscroll: a,
	replace_state: s,
	state: o = {},
	redirect_count: c = 0,
	nav_token: i = {},
	accept: l = Ue,
	block: d = Ue,
	event: p
}) {
	const h = j;
	j = i;
	const f = await W(t, !1),
		u = e === 'enter' ? Je(g, f, t, e) : Et({ url: t, type: e, delta: n?.delta, intent: f, event: p });
	if (!u) {
		(d(), j === i && (j = h));
		return;
	}
	const w = R,
		k = I;
	(l(), (te = !0), ge && u.navigation.type !== 'enter' && D.navigating.set((Q.current = u.navigation)));
	let m = f && (await Ke(f));
	if (!m) {
		if (ve(t, T, E.hash)) return await K(t, s);
		m = await St(t, { id: null }, await Y(new je(404, 'Not Found', `Not found: ${t.pathname}`), { url: t, params: {}, route: { id: null } }), 404, s);
	}
	if (((t = f?.url || t), j !== i)) return (u.reject(new Error('navigation aborted')), !1);
	if (m.type === 'redirect') {
		if (c < 20) {
			(await G({
				type: e,
				url: new URL(m.location, t),
				popped: n,
				keepfocus: r,
				noscroll: a,
				replace_state: s,
				state: o,
				redirect_count: c + 1,
				nav_token: i
			}),
				u.fulfil(void 0));
			return;
		}
		m = await ke({
			status: 500,
			error: await Y(new Error('Redirect loop'), { url: t, params: {}, route: { id: null } }),
			url: t,
			route: { id: null }
		});
	} else m.props.page.status >= 400 && (await D.updated.check()) && (await gt(), await K(t, s));
	if ((Oe(), Me(w), _t(k), m.props.page.url.pathname !== t.pathname && (t.pathname = m.props.page.url.pathname), (o = n ? n.state : o), !n)) {
		const b = s ? 0 : 1,
			x = { [F]: (R += b), [H]: (I += b), [Be]: o };
		((s ? history.replaceState : history.pushState).call(history, x, '', t), s || yn(R, I));
	}
	const U = f && P?.id === f.id ? P.fork : null;
	((P = null), (m.props.page.state = o));
	let _;
	if (ge) {
		const b = (await Promise.all(Array.from(vn, (L) => L(u.navigation)))).filter((L) => typeof L == 'function');
		if (b.length > 0) {
			let L = function () {
				b.forEach((Ee) => {
					X.delete(Ee);
				});
			};
			(b.push(L),
				b.forEach((Ee) => {
					X.add(Ee);
				}));
		}
		((g = m.state), m.props.page && (m.props.page.url = t));
		const x = U && (await U);
		(x ? (_ = x.commit()) : (V.$set(m.props), Fe(m.props.page), (_ = Ot?.())), (mt = !0));
	} else await vt(m, xe, !1);
	const { activeElement: v } = document;
	(await _, await ce(), await ce());
	let S = n ? n.scroll : a ? ye() : null;
	if (tt) {
		const b = t.hash && document.getElementById(It(t));
		if (S) scrollTo(S.x, S.y);
		else if (b) {
			b.scrollIntoView();
			const { top: x, left: L } = b.getBoundingClientRect();
			S = { x: pageXOffset + L, y: pageYOffset + x };
		} else scrollTo(0, 0);
	}
	const A = document.activeElement !== v && document.activeElement !== document.body;
	(!r && !A && We(t, S),
		(tt = !0),
		m.props.page && Object.assign(y, m.props.page),
		(te = !1),
		e === 'popstate' && wt(I),
		u.fulfil(void 0),
		X.forEach((b) => b(u.navigation)),
		D.navigating.set((Q.current = null)));
}
async function St(e, t, n, r, a) {
	return e.origin === re && e.pathname === location.pathname && !Ge ? await ke({ status: r, error: n, url: e, route: t }) : await K(e, a);
}
function An() {
	let e, t, n;
	$.addEventListener('mousemove', (c) => {
		const i = c.target;
		(clearTimeout(e),
			(e = setTimeout(() => {
				s(i, B.hover);
			}, 20)));
	});
	function r(c) {
		c.defaultPrevented || s(c.composedPath()[0], B.tap);
	}
	($.addEventListener('mousedown', r), $.addEventListener('touchstart', r, { passive: !0 }));
	const a = new IntersectionObserver(
		(c) => {
			for (const i of c) i.isIntersecting && (Le(new URL(i.target.href)), a.unobserve(i.target));
		},
		{ threshold: 0 }
	);
	async function s(c, i) {
		const l = ft(c, $),
			d = l === t && i >= n;
		if (!l || d) return;
		const { url: p, external: h, download: f } = Te(l, T, E.hash);
		if (h || f) return;
		const u = le(l),
			w = p && _e(g.url) === _e(p);
		if (!(u.reload || w))
			if (i <= u.preload_data) {
				((t = l), (n = B.tap));
				const k = await W(p, !1);
				if (!k) return;
				yt(k);
			} else i <= u.preload_code && ((t = l), (n = i), Le(p));
	}
	function o() {
		a.disconnect();
		for (const c of $.querySelectorAll('a')) {
			const { url: i, external: l, download: d } = Te(c, T, E.hash);
			if (l || d) continue;
			const p = le(c);
			p.reload || (p.preload_code === B.viewport && a.observe(c), p.preload_code === B.eager && Le(i));
		}
	}
	(X.add(o), o());
}
function Y(e, t) {
	if (e instanceof we) return e.body;
	const n = fe(e),
		r = fn(e);
	return E.hooks.handleError({ error: e, event: t, status: n, message: r }) ?? { message: r };
}
function Rn(e, t) {
	mn(
		() => (
			e.add(t),
			() => {
				e.delete(t);
			}
		)
	);
}
function qn(e) {
	Rn(qe, e);
}
function Gn(e, t = {}) {
	return ((e = new URL(ae(e))), e.origin !== re ? Promise.reject(new Error('goto: invalid URL')) : be(e, t, 0));
}
function In(e) {
	if (typeof e == 'function') de.push(e);
	else {
		const { href: t } = new URL(e, location.href);
		de.push((n) => n.href === t);
	}
}
function Yn() {
	return ((oe = !0), bn());
}
async function Hn(e) {
	const t = ae(e),
		n = await W(t, !1);
	if (!n) throw new Error(`Attempted to preload a URL that does not belong to this app: ${t}`);
	const r = await yt(n);
	if (r.type === 'redirect') return { type: r.type, location: r.location };
	const { status: a, data: s } = r.props.page ?? y;
	return { type: r.type, status: a, data: s };
}
function Kn(e, t) {
	const n = { [F]: R, [H]: I, [ct]: y.url.href, [Be]: t };
	(history.replaceState(n, '', ae(e)), (y.state = t), V.$set({ page: _n(() => se(y)) }));
}
async function Wn(e) {
	e.type === 'error'
		? await Ln(e.error, e.status)
		: e.type === 'redirect'
			? await be(e.location, { invalidateAll: !0 }, 0)
			: ((y.form = e.data),
				(y.status = e.status),
				V.$set({ form: null, page: se(y) }),
				await pt(),
				V.$set({ form: e.data }),
				e.type === 'success' && We(y.url));
}
async function Ln(e, t = 500) {
	const n = new URL(location.href),
		{ branch: r, route: a } = g;
	if (!a) return;
	const s = await kt(g.branch.length, r, a.errors);
	if (s) {
		const o = ne({ url: n, params: g.params, branch: r.slice(0, s.idx).concat(s.node), status: t, error: e, route: a });
		((g = o.state), V.$set(o.props), Fe(o.props.page), pt().then(() => We(g.url)));
	}
}
function Tn() {
	((history.scrollRestoration = 'manual'),
		addEventListener('beforeunload', (t) => {
			let n = !1;
			if ((nt(), !te)) {
				const r = Je(g, void 0, null, 'leave'),
					a = {
						...r.navigation,
						cancel: () => {
							((n = !0), r.reject(new Error('navigation cancelled')));
						}
					};
				qe.forEach((s) => s(a));
			}
			n ? (t.preventDefault(), (t.returnValue = '')) : (history.scrollRestoration = 'auto');
		}),
		addEventListener('visibilitychange', () => {
			document.visibilityState === 'hidden' && nt();
		}),
		navigator.connection?.saveData || An(),
		$.addEventListener('click', async (t) => {
			if (t.button || t.which !== 1 || t.metaKey || t.ctrlKey || t.shiftKey || t.altKey || t.defaultPrevented) return;
			const n = ft(t.composedPath()[0], $);
			if (!n) return;
			const { url: r, external: a, target: s, download: o } = Te(n, T, E.hash);
			if (!r) return;
			if (s === '_parent' || s === '_top') {
				if (window.parent !== window) return;
			} else if (s && s !== '_self') return;
			const c = le(n);
			if ((!(n instanceof SVGAElement) && r.protocol !== location.protocol && !(r.protocol === 'https:' || r.protocol === 'http:')) || o) return;
			const [l, d] = (E.hash ? r.hash.replace(/^#/, '') : r.href).split('#'),
				p = l === Se(location);
			if (a || (c.reload && (!p || !d))) {
				Et({ url: r, type: 'link', event: t }) ? (te = !0) : t.preventDefault();
				return;
			}
			if (d !== void 0 && p) {
				const [, h] = g.url.href.split('#');
				if (h === d) {
					if ((t.preventDefault(), d === '' || (d === 'top' && n.ownerDocument.getElementById('top') === null))) scrollTo({ top: 0 });
					else {
						const f = n.ownerDocument.getElementById(decodeURIComponent(d));
						f && (f.scrollIntoView(), f.focus());
					}
					return;
				}
				if (((J = !0), Me(R), e(r), !c.replace_state)) return;
				J = !1;
			}
			(t.preventDefault(),
				await new Promise((h) => {
					(requestAnimationFrame(() => {
						setTimeout(h, 0);
					}),
						setTimeout(h, 100));
				}),
				await G({
					type: 'link',
					url: r,
					keepfocus: c.keepfocus,
					noscroll: c.noscroll,
					replace_state: c.replace_state ?? r.href === location.href,
					event: t
				}));
		}),
		$.addEventListener('submit', (t) => {
			if (t.defaultPrevented) return;
			const n = HTMLFormElement.prototype.cloneNode.call(t.target),
				r = t.submitter;
			if ((r?.formTarget || n.target) === '_blank' || (r?.formMethod || n.method) !== 'get') return;
			const o = new URL((r?.hasAttribute('formaction') && r?.formAction) || n.action);
			if (ve(o, T, !1)) return;
			const c = t.target,
				i = le(c);
			if (i.reload) return;
			(t.preventDefault(), t.stopPropagation());
			const l = new FormData(c, r);
			((o.search = new URLSearchParams(l).toString()),
				G({
					type: 'form',
					url: o,
					keepfocus: i.keepfocus,
					noscroll: i.noscroll,
					replace_state: i.replace_state ?? o.href === location.href,
					event: t
				}));
		}),
		addEventListener('popstate', async (t) => {
			if (!Ce) {
				if (t.state?.[F]) {
					const n = t.state[F];
					if (((j = {}), n === R)) return;
					const r = M[n],
						a = t.state[Be] ?? {},
						s = new URL(t.state[ct] ?? location.href),
						o = t.state[H],
						c = g.url ? Se(location) === Se(g.url) : !1;
					if (o === I && (mt || c)) {
						(a !== y.state && (y.state = a), e(s), (M[R] = ye()), r && scrollTo(r.x, r.y), (R = n));
						return;
					}
					const l = n - R;
					await G({
						type: 'popstate',
						url: s,
						popped: { state: a, scroll: r, delta: l },
						accept: () => {
							((R = n), (I = o));
						},
						block: () => {
							history.go(-l);
						},
						nav_token: j,
						event: t
					});
				} else if (!J) {
					const n = new URL(location.href);
					(e(n), E.hash && location.reload());
				}
			}
		}),
		addEventListener('hashchange', () => {
			J && ((J = !1), history.replaceState({ ...history.state, [F]: ++R, [H]: I }, '', location.href));
		}));
	for (const t of document.querySelectorAll('link')) wn.has(t.rel) && (t.href = t.href);
	addEventListener('pageshow', (t) => {
		t.persisted && D.navigating.set((Q.current = null));
	});
	function e(t) {
		((g.url = y.url = t), D.page.set(se(y)), D.page.notify());
	}
}
async function Un(e, { status: t = 200, error: n, node_ids: r, params: a, route: s, server_route: o, data: c, form: i }) {
	Ge = !0;
	const l = new URL(location.href);
	let d;
	(({ params: a = {}, route: s = { id: null } } = (await W(l, !1)) || {}), (d = Ve.find(({ id: f }) => f === s.id)));
	let p,
		h = !0;
	try {
		const f = r.map(async (w, k) => {
				const m = c[k];
				return (
					m?.uses && (m.uses = Rt(m.uses)),
					Ye({
						loader: E.nodes[w],
						url: l,
						params: a,
						route: s,
						parent: async () => {
							const U = {};
							for (let _ = 0; _ < k; _ += 1) Object.assign(U, (await f[_]).data);
							return U;
						},
						server_data_node: He(m)
					})
				);
			}),
			u = await Promise.all(f);
		if (d) {
			const w = d.layouts;
			for (let k = 0; k < w.length; k++) w[k] || u.splice(k, 0, void 0);
		}
		p = ne({ url: l, params: a, branch: u, status: t, error: n, form: i, route: d ?? null });
	} catch (f) {
		if (f instanceof $e) {
			await K(new URL(f.location, location.href));
			return;
		}
		((p = await ke({ status: fe(f), error: await Y(f, { url: l, params: a, route: s }), url: l, route: s })), (e.textContent = ''), (h = !1));
	}
	(p.props.page && (p.props.page.state = {}), await vt(p, e, h));
}
async function At(e, t) {
	const n = new URL(e);
	((n.pathname = pn(e.pathname)),
		e.pathname.endsWith('/') && n.searchParams.append(ln, '1'),
		n.searchParams.append(cn, t.map((s) => (s ? '1' : '0')).join('')));
	const r = window.fetch,
		a = await r(n.href, {});
	if (!a.ok) {
		let s;
		throw (
			a.headers.get('content-type')?.includes('application/json')
				? (s = await a.json())
				: a.status === 404
					? (s = 'Not Found')
					: a.status === 500 && (s = 'Internal Error'),
			new we(a.status, s)
		);
	}
	return new Promise(async (s) => {
		const o = new Map(),
			c = a.body.getReader();
		function i(d) {
			return dt(d, {
				...E.decoders,
				Promise: (p) =>
					new Promise((h, f) => {
						o.set(p, { fulfil: h, reject: f });
					})
			});
		}
		let l = '';
		for (;;) {
			const { done: d, value: p } = await c.read();
			if (d && !l) break;
			for (
				l +=
					!p && l
						? `
`
						: Ut.decode(p, { stream: !0 });
				;
			) {
				const h = l.indexOf(`
`);
				if (h === -1) break;
				const f = JSON.parse(l.slice(0, h));
				if (((l = l.slice(h + 1)), f.type === 'redirect')) return s(f);
				if (f.type === 'data')
					(f.nodes?.forEach((u) => {
						u?.type === 'data' && ((u.uses = Rt(u.uses)), (u.data = i(u.data)));
					}),
						s(f));
				else if (f.type === 'chunk') {
					const { id: u, data: w, error: k } = f,
						m = o.get(u);
					(o.delete(u), k ? m.reject(i(k)) : m.fulfil(i(w)));
				}
			}
		}
	});
}
function Rt(e) {
	return {
		dependencies: new Set(e?.dependencies ?? []),
		params: new Set(e?.params ?? []),
		parent: !!e?.parent,
		route: !!e?.route,
		url: !!e?.url,
		search_params: new Set(e?.search_params ?? [])
	};
}
let Ce = !1;
function We(e, t = null) {
	const n = document.querySelector('[autofocus]');
	if (n) n.focus();
	else {
		const r = It(e);
		if (r && document.getElementById(r)) {
			const { x: s, y: o } = t ?? ye();
			setTimeout(() => {
				const c = history.state;
				((Ce = !0), location.replace(`#${r}`), E.hash && location.replace(e.hash), history.replaceState(c, '', e.hash), scrollTo(s, o), (Ce = !1));
			});
		} else {
			const s = document.body,
				o = s.getAttribute('tabindex');
			((s.tabIndex = -1),
				s.focus({ preventScroll: !0, focusVisible: !1 }),
				o !== null ? s.setAttribute('tabindex', o) : s.removeAttribute('tabindex'));
		}
		const a = getSelection();
		if (a && a.type !== 'None') {
			const s = [];
			for (let o = 0; o < a.rangeCount; o += 1) s.push(a.getRangeAt(o));
			setTimeout(() => {
				if (a.rangeCount === s.length) {
					for (let o = 0; o < a.rangeCount; o += 1) {
						const c = s[o],
							i = a.getRangeAt(o);
						if (
							c.commonAncestorContainer !== i.commonAncestorContainer ||
							c.startContainer !== i.startContainer ||
							c.endContainer !== i.endContainer ||
							c.startOffset !== i.startOffset ||
							c.endOffset !== i.endOffset
						)
							return;
					}
					a.removeAllRanges();
				}
			});
		}
	}
}
function Je(e, t, n, r) {
	let a, s;
	const o = new Promise((i, l) => {
		((a = i), (s = l));
	});
	return (
		o.catch(() => {}),
		{
			navigation: {
				from: { params: e.params, route: { id: e.route?.id ?? null }, url: e.url },
				to: n && { params: t?.params ?? null, route: { id: t?.route?.id ?? null }, url: n },
				willUnload: !t,
				type: r,
				complete: o
			},
			fulfil: a,
			reject: s
		}
	);
}
function se(e) {
	return { data: e.data, error: e.error, form: e.form, params: e.params, route: e.route, state: e.state, status: e.status, url: e.url };
}
function Pn(e) {
	const t = new URL(e);
	return ((t.hash = decodeURIComponent(e.hash)), t);
}
function It(e) {
	let t;
	if (E.hash) {
		const [, , n] = e.hash.split('#', 3);
		t = n ?? '';
	} else t = e.hash.slice(1);
	return decodeURIComponent(t);
}
export { Wn as a, E as b, y as c, Hn as d, qn as e, Vn as f, Gn as g, Yn as i, jn as l, Dn as p, Kn as r, D as s };
//# sourceMappingURL=DHPSYX_z.js.map
