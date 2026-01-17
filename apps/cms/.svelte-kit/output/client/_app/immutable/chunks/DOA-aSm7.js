import { i as O } from './zi73tRJP.js';
import { o as nr, a as or } from './CMZtchEj.js';
import {
	p as ir,
	d as R,
	x as Ne,
	z as sr,
	g as o,
	s as T,
	f as Le,
	c as b,
	t as z,
	a as ar,
	b as d,
	u as te,
	n as gt,
	r as y,
	e as cr,
	ai as lr
} from './DrlZFkx8.js';
import { d as fr, f as A, e as _t, a as k, s as Ie, c as De, t as We } from './CTjXDULS.js';
import { e as xt } from './BXe5mj2j.js';
import { t as re, a as ze, f as Pe, s as ur } from './0XeaN6pZ.js';
import { a as dr } from './BEiD40NV.js';
import { a as ne, r as pr, b as x, c as H, d as vr, e as hr } from './MEFvoR_D.js';
import { b as mr } from './D4QnGYgQ.js';
import { b as It } from './YQp2a1pQ.js';
import { p as Ze } from './DePHBZW_.js';
import { an as br } from './N8Jg0v49.js';
import { l as Qe } from './BvngfGKt.js';
import { q as $e } from './Ccw7PXcW.js';
import { s as Ce } from './BSPmpUse.js';
const St = /^[a-z0-9]+(-[a-z0-9]+)*$/,
	jt = (e, t, r, n = '') => {
		const i = e.split(':');
		if (e.slice(0, 1) === '@') {
			if (i.length < 2 || i.length > 3) return null;
			n = i.shift().slice(1);
		}
		if (i.length > 3 || !i.length) return null;
		if (i.length > 1) {
			const f = i.pop(),
				u = i.pop(),
				p = { provider: i.length > 0 ? i[0] : n, prefix: u, name: f };
			return t && !qe(p) ? null : p;
		}
		const s = i[0],
			a = s.split('-');
		if (a.length > 1) {
			const f = { provider: n, prefix: a.shift(), name: a.join('-') };
			return t && !qe(f) ? null : f;
		}
		if (r && n === '') {
			const f = { provider: n, prefix: '', name: s };
			return t && !qe(f, r) ? null : f;
		}
		return null;
	},
	qe = (e, t) => (e ? !!(((t && e.prefix === '') || e.prefix) && e.name) : !1);
function yr(e, t) {
	const r = e.icons,
		n = e.aliases || Object.create(null),
		i = Object.create(null);
	function s(a) {
		if (r[a]) return (i[a] = []);
		if (!(a in i)) {
			i[a] = null;
			const f = n[a] && n[a].parent,
				u = f && s(f);
			u && (i[a] = [f].concat(u));
		}
		return i[a];
	}
	return (Object.keys(r).concat(Object.keys(n)).forEach(s), i);
}
const Ft = Object.freeze({ left: 0, top: 0, width: 16, height: 16 }),
	Be = Object.freeze({ rotate: 0, vFlip: !1, hFlip: !1 }),
	gr = Object.freeze({ ...Ft, ...Be }),
	rt = Object.freeze({ ...gr, body: '', hidden: !1 });
function _r(e, t) {
	const r = {};
	(!e.hFlip != !t.hFlip && (r.hFlip = !0), !e.vFlip != !t.vFlip && (r.vFlip = !0));
	const n = ((e.rotate || 0) + (t.rotate || 0)) % 4;
	return (n && (r.rotate = n), r);
}
function wt(e, t) {
	const r = _r(e, t);
	for (const n in rt) n in Be ? n in e && !(n in r) && (r[n] = Be[n]) : n in t ? (r[n] = t[n]) : n in e && (r[n] = e[n]);
	return r;
}
function xr(e, t, r) {
	const n = e.icons,
		i = e.aliases || Object.create(null);
	let s = {};
	function a(f) {
		s = wt(n[f] || i[f], s);
	}
	return (a(t), r.forEach(a), wt(e, s));
}
function Ot(e, t) {
	const r = [];
	if (typeof e != 'object' || typeof e.icons != 'object') return r;
	e.not_found instanceof Array &&
		e.not_found.forEach((i) => {
			(t(i, null), r.push(i));
		});
	const n = yr(e);
	for (const i in n) {
		const s = n[i];
		s && (t(i, xr(e, i, s)), r.push(i));
	}
	return r;
}
const Ir = { provider: '', aliases: {}, not_found: {}, ...Ft };
function et(e, t) {
	for (const r in t) if (r in e && typeof e[r] != typeof t[r]) return !1;
	return !0;
}
function Rt(e) {
	if (typeof e != 'object' || e === null) return null;
	const t = e;
	if (typeof t.prefix != 'string' || !e.icons || typeof e.icons != 'object' || !et(e, Ir)) return null;
	const r = t.icons;
	for (const i in r) {
		const s = r[i];
		if (!i || typeof s.body != 'string' || !et(s, rt)) return null;
	}
	const n = t.aliases || Object.create(null);
	for (const i in n) {
		const s = n[i],
			a = s.parent;
		if (!i || typeof a != 'string' || (!r[a] && !n[a]) || !et(s, rt)) return null;
	}
	return t;
}
const kt = Object.create(null);
function wr(e, t) {
	return { provider: e, prefix: t, icons: Object.create(null), missing: new Set() };
}
function je(e, t) {
	const r = kt[e] || (kt[e] = Object.create(null));
	return r[t] || (r[t] = wr(e, t));
}
function Mt(e, t) {
	return Rt(t)
		? Ot(t, (r, n) => {
				n ? (e.icons[r] = n) : e.missing.add(r);
			})
		: [];
}
function kr(e, t, r) {
	try {
		if (typeof r.body == 'string') return ((e.icons[t] = { ...r }), !0);
	} catch {}
	return !1;
}
let Ge = !1;
function Nt(e) {
	return (typeof e == 'boolean' && (Ge = e), Ge);
}
function Er(e, t) {
	const r = jt(e, !0, Ge);
	if (!r) return !1;
	const n = je(r.provider, r.prefix);
	return t ? kr(n, r.name, t) : (n.missing.add(r.name), !0);
}
function Tr(e, t) {
	if (typeof e != 'object') return !1;
	if ((typeof t != 'string' && (t = e.provider || ''), Ge && !t && !e.prefix)) {
		let n = !1;
		return (
			Rt(e) &&
				((e.prefix = ''),
				Ot(e, (i, s) => {
					Er(i, s) && (n = !0);
				})),
			n
		);
	}
	const r = e.prefix;
	return qe({ prefix: r, name: 'a' }) ? !!Mt(je(t, r), e) : !1;
}
const Lr = Object.freeze({ width: null, height: null }),
	Pr = Object.freeze({ ...Lr, ...Be }),
	nt = Object.create(null);
function Cr(e, t) {
	nt[e] = t;
}
function ot(e) {
	return nt[e] || nt[''];
}
function it(e) {
	let t;
	if (typeof e.resources == 'string') t = [e.resources];
	else if (((t = e.resources), !(t instanceof Array) || !t.length)) return null;
	return {
		resources: t,
		path: e.path || '/',
		maxURL: e.maxURL || 500,
		rotate: e.rotate || 750,
		timeout: e.timeout || 5e3,
		random: e.random === !0,
		index: e.index || 0,
		dataAfterTimeout: e.dataAfterTimeout !== !1
	};
}
const st = Object.create(null),
	Ae = ['https://api.simplesvg.com', 'https://api.unisvg.com'],
	Ue = [];
for (; Ae.length > 0; ) Ae.length === 1 || Math.random() > 0.5 ? Ue.push(Ae.shift()) : Ue.push(Ae.pop());
st[''] = it({ resources: ['https://api.iconify.design'].concat(Ue) });
function Ar(e, t) {
	const r = it(t);
	return r === null ? !1 : ((st[e] = r), !0);
}
function at(e) {
	return st[e];
}
const Sr = () => {
	let e;
	try {
		if (((e = fetch), typeof e == 'function')) return e;
	} catch {}
};
let Et = Sr();
function jr(e, t) {
	const r = at(e);
	if (!r) return 0;
	let n;
	if (!r.maxURL) n = 0;
	else {
		let i = 0;
		r.resources.forEach((a) => {
			i = Math.max(i, a.length);
		});
		const s = t + '.json?icons=';
		n = r.maxURL - i - r.path.length - s.length;
	}
	return n;
}
function Fr(e) {
	return e === 404;
}
const Or = (e, t, r) => {
	const n = [],
		i = jr(e, t),
		s = 'icons';
	let a = { type: s, provider: e, prefix: t, icons: [] },
		f = 0;
	return (
		r.forEach((u, p) => {
			((f += u.length + 1), f >= i && p > 0 && (n.push(a), (a = { type: s, provider: e, prefix: t, icons: [] }), (f = u.length)), a.icons.push(u));
		}),
		n.push(a),
		n
	);
};
function Rr(e) {
	if (typeof e == 'string') {
		const t = at(e);
		if (t) return t.path;
	}
	return '/';
}
const Mr = (e, t, r) => {
		if (!Et) {
			r('abort', 424);
			return;
		}
		let n = Rr(t.provider);
		switch (t.type) {
			case 'icons': {
				const s = t.prefix,
					a = t.icons.join(','),
					f = new URLSearchParams({ icons: a });
				n += s + '.json?' + f.toString();
				break;
			}
			case 'custom': {
				const s = t.uri;
				n += s.slice(0, 1) === '/' ? s.slice(1) : s;
				break;
			}
			default:
				r('abort', 400);
				return;
		}
		let i = 503;
		Et(e + n)
			.then((s) => {
				const a = s.status;
				if (a !== 200) {
					setTimeout(() => {
						r(Fr(a) ? 'abort' : 'next', a);
					});
					return;
				}
				return ((i = 501), s.json());
			})
			.then((s) => {
				if (typeof s != 'object' || s === null) {
					setTimeout(() => {
						s === 404 ? r('abort', s) : r('next', i);
					});
					return;
				}
				setTimeout(() => {
					r('success', s);
				});
			})
			.catch(() => {
				r('next', i);
			});
	},
	Nr = { prepare: Or, send: Mr };
function Dt(e, t) {
	e.forEach((r) => {
		const n = r.loaderCallbacks;
		n && (r.loaderCallbacks = n.filter((i) => i.id !== t));
	});
}
function Dr(e) {
	e.pendingCallbacksFlag ||
		((e.pendingCallbacksFlag = !0),
		setTimeout(() => {
			e.pendingCallbacksFlag = !1;
			const t = e.loaderCallbacks ? e.loaderCallbacks.slice(0) : [];
			if (!t.length) return;
			let r = !1;
			const n = e.provider,
				i = e.prefix;
			t.forEach((s) => {
				const a = s.icons,
					f = a.pending.length;
				((a.pending = a.pending.filter((u) => {
					if (u.prefix !== i) return !0;
					const p = u.name;
					if (e.icons[p]) a.loaded.push({ provider: n, prefix: i, name: p });
					else if (e.missing.has(p)) a.missing.push({ provider: n, prefix: i, name: p });
					else return ((r = !0), !0);
					return !1;
				})),
					a.pending.length !== f && (r || Dt([e], s.id), s.callback(a.loaded.slice(0), a.missing.slice(0), a.pending.slice(0), s.abort)));
			});
		}));
}
let zr = 0;
function Qr(e, t, r) {
	const n = zr++,
		i = Dt.bind(null, r, n);
	if (!t.pending.length) return i;
	const s = { id: n, icons: t, callback: e, abort: i };
	return (
		r.forEach((a) => {
			(a.loaderCallbacks || (a.loaderCallbacks = [])).push(s);
		}),
		i
	);
}
function $r(e) {
	const t = { loaded: [], missing: [], pending: [] },
		r = Object.create(null);
	e.sort((i, s) =>
		i.provider !== s.provider
			? i.provider.localeCompare(s.provider)
			: i.prefix !== s.prefix
				? i.prefix.localeCompare(s.prefix)
				: i.name.localeCompare(s.name)
	);
	let n = { provider: '', prefix: '', name: '' };
	return (
		e.forEach((i) => {
			if (n.name === i.name && n.prefix === i.prefix && n.provider === i.provider) return;
			n = i;
			const s = i.provider,
				a = i.prefix,
				f = i.name,
				u = r[s] || (r[s] = Object.create(null)),
				p = u[a] || (u[a] = je(s, a));
			let h;
			f in p.icons ? (h = t.loaded) : a === '' || p.missing.has(f) ? (h = t.missing) : (h = t.pending);
			const S = { provider: s, prefix: a, name: f };
			h.push(S);
		}),
		t
	);
}
function qr(e, t = !0, r = !1) {
	const n = [];
	return (
		e.forEach((i) => {
			const s = typeof i == 'string' ? jt(i, t, r) : i;
			s && n.push(s);
		}),
		n
	);
}
const Ur = { resources: [], index: 0, timeout: 2e3, rotate: 750, random: !1, dataAfterTimeout: !1 };
function Br(e, t, r, n) {
	const i = e.resources.length,
		s = e.random ? Math.floor(Math.random() * i) : e.index;
	let a;
	if (e.random) {
		let v = e.resources.slice(0);
		for (a = []; v.length > 1; ) {
			const w = Math.floor(Math.random() * v.length);
			(a.push(v[w]), (v = v.slice(0, w).concat(v.slice(w + 1))));
		}
		a = a.concat(v);
	} else a = e.resources.slice(s).concat(e.resources.slice(0, s));
	const f = Date.now();
	let u = 'pending',
		p = 0,
		h,
		S = null,
		I = [],
		oe = [];
	typeof n == 'function' && oe.push(n);
	function ie() {
		S && (clearTimeout(S), (S = null));
	}
	function U() {
		(u === 'pending' && (u = 'aborted'),
			ie(),
			I.forEach((v) => {
				v.status === 'pending' && (v.status = 'aborted');
			}),
			(I = []));
	}
	function he(v, w) {
		(w && (oe = []), typeof v == 'function' && oe.push(v));
	}
	function V() {
		return { startTime: f, payload: t, status: u, queriesSent: p, queriesPending: I.length, subscribe: he, abort: U };
	}
	function K() {
		((u = 'failed'),
			oe.forEach((v) => {
				v(void 0, h);
			}));
	}
	function Q() {
		(I.forEach((v) => {
			v.status === 'pending' && (v.status = 'aborted');
		}),
			(I = []));
	}
	function P(v, w, me) {
		const se = w !== 'success';
		switch (((I = I.filter((G) => G !== v)), u)) {
			case 'pending':
				break;
			case 'failed':
				if (se || !e.dataAfterTimeout) return;
				break;
			default:
				return;
		}
		if (w === 'abort') {
			((h = me), K());
			return;
		}
		if (se) {
			((h = me), I.length || (a.length ? B() : K()));
			return;
		}
		if ((ie(), Q(), !e.random)) {
			const G = e.resources.indexOf(v.resource);
			G !== -1 && G !== e.index && (e.index = G);
		}
		((u = 'completed'),
			oe.forEach((G) => {
				G(me);
			}));
	}
	function B() {
		if (u !== 'pending') return;
		ie();
		const v = a.shift();
		if (v === void 0) {
			if (I.length) {
				S = setTimeout(() => {
					(ie(), u === 'pending' && (Q(), K()));
				}, e.timeout);
				return;
			}
			K();
			return;
		}
		const w = {
			status: 'pending',
			resource: v,
			callback: (me, se) => {
				P(w, me, se);
			}
		};
		(I.push(w), p++, (S = setTimeout(B, e.rotate)), r(v, t, w.callback));
	}
	return (setTimeout(B), V);
}
function zt(e) {
	const t = { ...Ur, ...e };
	let r = [];
	function n() {
		r = r.filter((a) => a().status === 'pending');
	}
	function i(a, f, u) {
		const p = Br(t, a, f, (h, S) => {
			(n(), u && u(h, S));
		});
		return (r.push(p), p);
	}
	function s(a) {
		return r.find((f) => a(f)) || null;
	}
	return {
		query: i,
		find: s,
		setIndex: (a) => {
			t.index = a;
		},
		getIndex: () => t.index,
		cleanup: n
	};
}
function Tt() {}
const tt = Object.create(null);
function Gr(e) {
	if (!tt[e]) {
		const t = at(e);
		if (!t) return;
		tt[e] = { config: t, redundancy: zt(t) };
	}
	return tt[e];
}
function Vr(e, t, r) {
	let n, i;
	if (typeof e == 'string') {
		const s = ot(e);
		if (!s) return (r(void 0, 424), Tt);
		i = s.send;
		const a = Gr(e);
		a && (n = a.redundancy);
	} else {
		const s = it(e);
		if (s) {
			n = zt(s);
			const a = ot(e.resources ? e.resources[0] : '');
			a && (i = a.send);
		}
	}
	return !n || !i ? (r(void 0, 424), Tt) : n.query(t, i, r)().abort;
}
function Yr() {}
function Hr(e) {
	e.iconsLoaderFlag ||
		((e.iconsLoaderFlag = !0),
		setTimeout(() => {
			((e.iconsLoaderFlag = !1), Dr(e));
		}));
}
function Kr(e) {
	const t = [],
		r = [];
	return (
		e.forEach((n) => {
			(n.match(St) ? t : r).push(n);
		}),
		{ valid: t, invalid: r }
	);
}
function Se(e, t, r) {
	function n() {
		const i = e.pendingIcons;
		t.forEach((s) => {
			(i && i.delete(s), e.icons[s] || e.missing.add(s));
		});
	}
	if (r && typeof r == 'object')
		try {
			if (!Mt(e, r).length) {
				n();
				return;
			}
		} catch (i) {
			console.error(i);
		}
	(n(), Hr(e));
}
function Lt(e, t) {
	e instanceof Promise
		? e
				.then((r) => {
					t(r);
				})
				.catch(() => {
					t(null);
				})
		: t(e);
}
function Xr(e, t) {
	(e.iconsToLoad ? (e.iconsToLoad = e.iconsToLoad.concat(t).sort()) : (e.iconsToLoad = t),
		e.iconsQueueFlag ||
			((e.iconsQueueFlag = !0),
			setTimeout(() => {
				e.iconsQueueFlag = !1;
				const { provider: r, prefix: n } = e,
					i = e.iconsToLoad;
				if ((delete e.iconsToLoad, !i || !i.length)) return;
				const s = e.loadIcon;
				if (e.loadIcons && (i.length > 1 || !s)) {
					Lt(e.loadIcons(i, n, r), (p) => {
						Se(e, i, p);
					});
					return;
				}
				if (s) {
					i.forEach((p) => {
						Lt(s(p, n, r), (h) => {
							Se(e, [p], h ? { prefix: n, icons: { [p]: h } } : null);
						});
					});
					return;
				}
				const { valid: a, invalid: f } = Kr(i);
				if ((f.length && Se(e, f, null), !a.length)) return;
				const u = n.match(St) ? ot(r) : null;
				if (!u) {
					Se(e, a, null);
					return;
				}
				u.prepare(r, n, a).forEach((p) => {
					Vr(r, p, (h) => {
						Se(e, p.icons, h);
					});
				});
			})));
}
const Jr = (e, t) => {
	const r = $r(qr(e, !0, Nt()));
	if (!r.pending.length) return () => {};
	const n = Object.create(null),
		i = [];
	let s, a;
	return (
		r.pending.forEach((f) => {
			const { provider: u, prefix: p } = f;
			if (p === a && u === s) return;
			((s = u), (a = p), i.push(je(u, p)));
			const h = n[u] || (n[u] = Object.create(null));
			h[p] || (h[p] = []);
		}),
		r.pending.forEach((f) => {
			const { provider: u, prefix: p, name: h } = f,
				S = je(u, p),
				I = S.pendingIcons || (S.pendingIcons = new Set());
			I.has(h) || (I.add(h), n[u][p].push(h));
		}),
		i.forEach((f) => {
			const u = n[f.provider][f.prefix];
			u.length && Xr(f, u);
		}),
		t ? Qr(t, r, i) : Yr
	);
};
({ ...Pr });
const Pt = { 'background-color': 'currentColor' },
	Wr = { 'background-color': 'transparent' },
	Ct = { image: 'var(--svg)', repeat: 'no-repeat', size: '100% 100%' },
	At = { '-webkit-mask': Pt, mask: Pt, background: Wr };
for (const e in At) {
	const t = At[e];
	for (const r in Ct) t[e + '-' + r] = Ct[r];
}
Nt(!0);
Cr('', Nr);
if (typeof document < 'u' && typeof window < 'u') {
	const e = window;
	if (e.IconifyPreload !== void 0) {
		const t = e.IconifyPreload,
			r = 'Invalid IconifyPreload syntax.';
		typeof t == 'object' &&
			t !== null &&
			(t instanceof Array ? t : [t]).forEach((n) => {
				try {
					(typeof n != 'object' || n === null || n instanceof Array || typeof n.icons != 'object' || typeof n.prefix != 'string' || !Tr(n)) &&
						console.error(r);
				} catch {
					console.error(r);
				}
			});
	}
	if (e.IconifyProviders !== void 0) {
		const t = e.IconifyProviders;
		if (typeof t == 'object' && t !== null)
			for (let r in t) {
				const n = 'IconifyProviders[' + r + '] is invalid.';
				try {
					const i = t[r];
					if (typeof i != 'object' || !i || i.resources === void 0) continue;
					Ar(r, i) || console.error(n);
				} catch {
					console.error(n);
				}
			}
	}
}
var Zr = A(
		'<div class="mb-2 flex items-center justify-between gap-2"><div class="flex flex-1 items-center gap-3 rounded-lg bg-surface-100 p-2 dark:bg-surface-800"><iconify-icon></iconify-icon> <div class="flex-1 overflow-hidden"><p class="text-xs text-surface-600 dark:text-surface-50">Selected Icon</p> <p class="truncate text-sm font-medium text-tertiary-500 dark:text-primary-500"> </p></div></div> <div class="flex gap-1"><button type="button" class="btn-icon preset-outlined-surface-500 transition-all duration-200 hover:scale-110"><iconify-icon></iconify-icon></button> <button type="button" class="btn-icon preset-outlined-surface-500 transition-all duration-200 hover:scale-110" aria-label="Copy icon name" title="Copy icon name"><iconify-icon></iconify-icon></button> <button type="button" class="btn-icon preset-outlined-error-500 transition-all duration-200 hover:scale-110" aria-label="Remove selected icon" title="Remove icon"><iconify-icon></iconify-icon></button></div></div>',
		2
	),
	en = A(
		'<button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200" aria-label="Clear search"><iconify-icon></iconify-icon></button>',
		2
	),
	tn = A(
		'<div id="search-error" class="mt-2 rounded-lg border-l-4 border-error-500 bg-error-50 p-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300" role="alert"><div class="flex items-start gap-2"><iconify-icon></iconify-icon> <span> </span></div></div>',
		2
	),
	rn = A('<button role="tab"> </button>'),
	nn = A('<button role="tab"> </button>'),
	on = A('<option>Loading libraries...</option>'),
	sn = A('<option> </option>'),
	an = A(
		'<div class="border-b border-surface-200 p-4 dark:text-surface-50"><label for="library-select" class="mb-2 block text-sm font-medium">Icon Library</label> <div class="relative"><select id="library-select" class="input w-full" aria-label="Select icon library"><option>All Libraries (Global Search)</option><!></select></div></div>'
	),
	cn = A(
		'<div class="flex justify-center py-12"><div class="flex flex-col items-center gap-3"><div class="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div> <p class="text-sm text-surface-600 dark:text-surface-50">Loading icons...</p></div></div>'
	),
	ln = A(
		'<button class="absolute right-0 top-0 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Remove from favorites"><iconify-icon></iconify-icon></button>',
		2
	),
	fn = A('<div role="option" tabindex="0"><iconify-icon></iconify-icon> <!></div>', 2),
	un = A('<div class="col-span-full py-4 text-center"><iconify-icon></iconify-icon></div>', 2),
	dn = A('<div class="col-span-full h-4"></div>'),
	pn = A('<div class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10" role="listbox" aria-label="Available icons"><!> <!> <!></div>'),
	vn = A(
		'<div class="flex flex-col items-center gap-3 py-12 text-center"><iconify-icon></iconify-icon> <p class="text-surface-600 dark:text-surface-50">No icons found for "<span class="font-medium"> </span>"</p></div>',
		2
	),
	hn = A(
		'<div class="flex flex-col items-center gap-3 py-12 text-center"><iconify-icon></iconify-icon> <p class="text-surface-600 dark:text-surface-50"><!></p></div>',
		2
	),
	mn = A(
		'<div id="icon-dropdown" class="mt-2 overflow-hidden rounded-lg border border-surface-200 bg-surface-50 shadow-2xl dark:text-surface-50 dark:bg-surface-800" role="region" aria-label="Icon picker dropdown"><div class="flex border-b border-surface-200 dark:text-surface-50" role="tablist"><button role="tab">Search</button> <!> <!></div> <!> <div class="h-80 overflow-y-auto p-4"><!></div></div>'
	),
	bn = A(
		'``` <div class="icon-picker-container flex w-full flex-col"><!> <div class="relative"><input type="text" role="combobox" class="input w-full pr-10 transition-all duration-200 focus:scale-[1.01] focus:shadow-lg" aria-label="Search icons" aria-controls="icon-dropdown" aria-haspopup="listbox"/> <!></div> <!> <!></div>',
		1
	);
function Fn(e, t) {
	ir(t, !0);
	const r = 300,
		n = 50,
		i = 'ic',
		s = 'https://api.iconify.design',
		a = 10;
	let f = Ze(t, 'iconselected', 15),
		u = Ze(t, 'searchQuery', 15, ''),
		p = Ze(t, 'showFavorites', 3, !0),
		h = R(Ne([])),
		S = R(0),
		I = R(i),
		oe = R(Ne({})),
		ie = R(!1),
		U = R(null),
		he = null,
		V = R(Ne([])),
		K = R(Ne([])),
		Q = R(!1),
		P = R('search'),
		B = R(!1),
		v = R(-1),
		w = R(!1),
		me = 24,
		se = R(null),
		G = R(null);
	const Qt = te(() => o(S) * n),
		ct = te(() => Object.keys(o(oe)).length > 0),
		Ve = te(() => u().trim().length > 0),
		Fe = te(() => o(V).includes(f())),
		$t = te(() => o(K).length > 0),
		qt = te(() => o(V).length > 0),
		Ut = te(() => Object.entries(o(oe)).sort(([, l], [, c]) => l.name.localeCompare(c.name)));
	let ce = R(50);
	const Ye = te(() => (o(P) === 'favorites' ? o(V) : o(P) === 'recent' ? o(K) : o(h).slice(0, o(ce))));
	function Bt(l) {
		const c = new IntersectionObserver((m) => {
			m[0].isIntersecting && Gt();
		});
		return (
			c.observe(l),
			{
				destroy() {
					c.disconnect();
				}
			}
		);
	}
	function Gt() {
		o(h).length > o(ce) ? d(ce, o(ce) + 50) : (o(Ve) || o(I) === '') && (o(Q) || (lr(S), Oe(u(), o(I), !0)));
	}
	function Vt() {}
	function lt(l, c) {
		if ((he && clearTimeout(he), !l.trim())) {
			(d(h, [], !0), d(Q, !1));
			return;
		}
		(d(Q, !0),
			(he = setTimeout(() => {
				Oe(l, c);
			}, r)));
	}
	async function Oe(l, c, m = !1) {
		if (!l.trim()) {
			c && !m && (await ft(c));
			return;
		}
		(d(Q, !0), d(U, null));
		try {
			const g = new URL(`${s}/search`);
			(g.searchParams.set('query', l),
				c && g.searchParams.set('prefix', c),
				g.searchParams.set('start', o(Qt).toString()),
				g.searchParams.set('limit', n.toString()));
			const $ = new AbortController(),
				fe = setTimeout(() => $.abort(), 1e4),
				be = await fetch(g.toString(), { signal: $.signal });
			if ((clearTimeout(fe), !be.ok)) throw new Error(`API error: ${be.status}`);
			const ue = await be.json();
			if (ue?.icons && Array.isArray(ue.icons)) {
				const N = ue.icons;
				m ? (d(h, [...o(h), ...N], !0), d(ce, o(ce) + N.length)) : (d(h, N, !0), d(ce, 50), d(S, 0));
				const ye = N.map((Y) => (c ? `${c}:${Y}` : Y));
				(await Jr(ye), d(P, 'search'));
			} else m || d(h, [], !0);
		} catch (g) {
			(g instanceof Error && g.name === 'AbortError'
				? d(U, 'Search timeout - please try again')
				: (Qe.error('Error fetching icons:', g), d(U, 'Failed to fetch icons')),
				d(h, [], !0));
		} finally {
			d(Q, !1);
		}
	}
	async function ft(l) {
		(d(Q, !0), d(U, null), d(h, [], !0));
		try {
			const c = await fetch(`${s}/collection?prefix=${l}`);
			if (!c.ok) throw new Error(`Failed to load collection: ${c.status}`);
			const m = await c.json();
			let g = [];
			(m.uncategorized && g.push(...m.uncategorized),
				m.categories &&
					Object.values(m.categories).forEach(($) => {
						g.push(...$);
					}),
				d(h, g, !0),
				d(ce, 50));
		} catch (c) {
			(Qe.error('Error fetching collection icons:', c), d(U, 'Failed to load library icons'));
		} finally {
			d(Q, !1);
		}
	}
	async function ut() {
		if (!(o(ct) || o(ie))) {
			(d(ie, !0), d(U, null));
			try {
				const l = new AbortController(),
					c = setTimeout(() => l.abort(), 1e4),
					m = await fetch(`${s}/collections`, { signal: l.signal });
				if ((clearTimeout(c), !m.ok)) throw new Error(`Failed to fetch libraries: ${m.status}`);
				const g = await m.json();
				d(oe, g, !0);
			} catch (l) {
				(Qe.error('Error fetching icon libraries:', l), d(U, 'Failed to load libraries'));
			} finally {
				d(ie, !1);
			}
		}
	}
	function He(l) {
		const c = l.includes(':') ? l : `${o(I)}:${l}`;
		(f(c), d(K, [c, ...o(K).filter((m) => m !== c)].slice(0, a), !0), d(B, !1), Ce(`Icon selected: ${c}`, 'success'));
	}
	function dt(l) {
		const c = l || f();
		c &&
			(o(V).includes(c)
				? (d(
						V,
						o(V).filter((m) => m !== c),
						!0
					),
					Ce('Removed from favorites', 'info'))
				: (d(V, [...o(V), c], !0), Ce('Added to favorites', 'success')));
	}
	async function Yt() {
		if (f())
			try {
				(await navigator.clipboard.writeText(f()), Ce('Icon name copied to clipboard', 'success'));
			} catch (l) {
				(Qe.error('Copy failed:', l), Ce('Failed to copy icon name', 'error'));
			}
	}
	function Ht() {
		(f(''), u(''), d(h, [], !0));
	}
	function Kt() {
		(d(S, 0), o(Ve) && Oe(u(), o(I)));
	}
	function Xt() {
		(d(B, !0), ut(), o(h).length === 0 && (u() ? Oe(u(), o(I)) : o(I) && ft(o(I))));
	}
	function pt(l) {
		const c = l.target;
		o(se) && !o(se).contains(c) && d(B, !1);
	}
	function vt(l) {
		if (!o(B)) return;
		const c = o(Ye);
		switch (l.key) {
			case 'Escape':
				(l.preventDefault(), d(B, !1));
				break;
			case 'ArrowDown':
				(l.preventDefault(), d(v, Math.min(o(v) + 1, c.length - 1), !0), ht());
				break;
			case 'ArrowUp':
				(l.preventDefault(), d(v, Math.max(o(v) - 1, -1), !0), ht());
				break;
			case 'Enter':
				(l.preventDefault(), o(v) >= 0 && c[o(v)] && He(c[o(v)]));
				break;
		}
	}
	function ht() {
		if (!o(G) || o(v) < 0) return;
		const l = o(G).children[o(v)];
		l && l.scrollIntoView({ block: 'nearest', behavior: o(w) ? 'auto' : 'smooth' });
	}
	function Ke(l) {
		(d(P, l, !0), d(v, -1));
	}
	(sr(() => {
		if (o(B))
			return (
				document.addEventListener('click', pt),
				document.addEventListener('keydown', vt),
				() => {
					(document.removeEventListener('click', pt), document.removeEventListener('keydown', vt));
				}
			);
	}),
		nr(() => {
			const l = window.matchMedia('(prefers-reduced-motion: reduce)');
			d(w, l.matches, !0);
			const c = (m) => {
				d(w, m.matches, !0);
			};
			return (l.addEventListener('change', c), () => l.removeEventListener('change', c));
		}),
		or(() => {
			he && clearTimeout(he);
		}),
		gt());
	var mt = bn(),
		Xe = T(Le(mt)),
		bt = b(Xe);
	{
		var Jt = (l) => {
			var c = Zr(),
				m = b(c),
				g = b(m);
			(z(() => x(g, 'icon', f())),
				x(g, 'width', me),
				H(g, 1, 'text-tertiary-500 transition-transform duration-200 hover:scale-110 dark:text-primary-500'),
				x(g, 'aria-hidden', 'true'));
			var $ = T(g, 2),
				fe = T(b($), 2),
				be = b(fe, !0);
			(y(fe), y($), y(m));
			var ue = T(m, 2),
				N = b(ue);
			N.__click = () => dt(f());
			var ye = b(N);
			(z(() => x(ye, 'icon', o(Fe) ? 'mdi:heart' : 'mdi:heart-outline')), x(ye, 'width', '22'), y(N));
			var Y = T(N, 2);
			Y.__click = Yt;
			var Re = b(Y);
			(x(Re, 'icon', 'mdi:content-copy'), x(Re, 'width', '22'), y(Y));
			var we = T(Y, 2);
			we.__click = Ht;
			var Me = b(we);
			(x(Me, 'icon', 'mdi:close'),
				x(Me, 'width', '22'),
				y(we),
				y(ue),
				y(c),
				z(() => {
					(Ie(be, f()),
						ne(N, 'aria-label', o(Fe) ? 'Remove from favorites' : 'Add to favorites'),
						ne(N, 'title', o(Fe) ? 'Remove from favorites' : 'Add to favorites'),
						H(ye, 1, vr(o(Fe) ? 'text-error-500' : '')));
				}),
				re(
					1,
					c,
					() => ze,
					() => ({ duration: o(w) ? 0 : 200, easing: $e, start: 0.9 })
				),
				re(
					2,
					c,
					() => ze,
					() => ({ duration: o(w) ? 0 : 150, easing: $e, start: 0.9 })
				),
				k(l, c));
		};
		O(bt, (l) => {
			f() && l(Jt);
		});
	}
	var Je = T(bt, 2),
		le = b(Je);
	(pr(le), (le.__input = () => lt(u(), o(I))));
	var Wt = T(le, 2);
	{
		var Zt = (l) => {
			var c = en();
			c.__click = () => {
				(u(''), lt('', o(I)));
			};
			var m = b(c);
			(x(m, 'icon', 'mdi:close'), x(m, 'width', '20'), y(c), k(l, c));
		};
		O(Wt, (l) => {
			u() && l(Zt);
		});
	}
	y(Je);
	var yt = T(Je, 2);
	{
		var er = (l) => {
			var c = tn(),
				m = b(c),
				g = b(m);
			(x(g, 'icon', 'mdi:alert-circle'), x(g, 'width', '18'), x(g, 'aria-hidden', 'true'));
			var $ = T(g, 2),
				fe = b($, !0);
			(y($),
				y(m),
				y(c),
				z(() => Ie(fe, o(U))),
				re(
					1,
					c,
					() => Pe,
					() => ({ duration: o(w) ? 0 : 200 })
				),
				k(l, c));
		};
		O(yt, (l) => {
			o(U) && l(er);
		});
	}
	var tr = T(yt, 2);
	{
		var rr = (l) => {
			var c = mn(),
				m = b(c),
				g = b(m);
			g.__click = () => Ke('search');
			var $ = T(g, 2);
			{
				var fe = (C) => {
					var E = rn();
					E.__click = () => Ke('favorites');
					var de = b(E);
					(y(E),
						z(() => {
							(ne(E, 'aria-selected', o(P) === 'favorites'),
								H(
									E,
									1,
									`flex-1 px-4 py-3 text-sm font-medium transition-colors ${o(P) === 'favorites' ? 'border-b-2 border-primary-500 text-primary-500' : 'text-surface-600 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-100'}`
								),
								Ie(de, `Favorites (${o(V).length ?? ''})`));
						}),
						k(C, E));
				};
				O($, (C) => {
					p() && o(qt) && C(fe);
				});
			}
			var be = T($, 2);
			{
				var ue = (C) => {
					var E = nn();
					E.__click = () => Ke('recent');
					var de = b(E);
					(y(E),
						z(() => {
							(ne(E, 'aria-selected', o(P) === 'recent'),
								H(
									E,
									1,
									`flex-1 px-4 py-3 text-sm font-medium transition-colors ${o(P) === 'recent' ? 'border-b-2 border-primary-500 text-primary-500' : 'text-surface-600 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-100'}`
								),
								Ie(de, `Recent (${o(K).length ?? ''})`));
						}),
						k(C, E));
				};
				O(be, (C) => {
					o($t) && C(ue);
				});
			}
			y(m);
			var N = T(m, 2);
			{
				var ye = (C) => {
					var E = an(),
						de = T(b(E), 2),
						pe = b(de);
					((pe.__change = Kt), (pe.__click = ut));
					var ke = b(pe);
					ke.value = ke.__value = '';
					var ve = T(ke);
					{
						var X = (q) => {
								var J = on();
								((J.value = J.__value = i), k(q, J));
							},
							_e = (q) => {
								var J = De(),
									W = Le(J);
								(xt(
									W,
									17,
									() => o(Ut),
									([M, _]) => M,
									(M, _) => {
										var L = te(() => cr(o(_), 2));
										let j = () => o(L)[0],
											Z = () => o(L)[1];
										var F = sn(),
											D = b(F);
										y(F);
										var ae = {};
										(z(
											(Ee) => {
												(Ie(D, `${Z().name ?? ''} (${j() ?? ''}) — ${Ee ?? ''} icons`), ae !== (ae = j()) && (F.value = (F.__value = j()) ?? ''));
											},
											[() => Z().total.toLocaleString()]
										),
											k(M, F));
									}
								),
									k(q, J));
							};
						O(ve, (q) => {
							o(ct) ? q(_e, !1) : q(X);
						});
					}
					(y(pe),
						y(de),
						y(E),
						z(() => (pe.disabled = o(ie))),
						hr(
							pe,
							() => o(I),
							(q) => d(I, q)
						),
						re(
							3,
							E,
							() => ur,
							() => ({ duration: o(w) ? 0 : 200 })
						),
						k(C, E));
				};
				O(N, (C) => {
					o(P) === 'search' && C(ye);
				});
			}
			var Y = T(N, 2),
				Re = b(Y);
			{
				var we = (C) => {
						var E = cn();
						(re(
							1,
							E,
							() => Pe,
							() => ({ duration: o(w) ? 0 : 200 })
						),
							k(C, E));
					},
					Me = (C) => {
						var E = De(),
							de = Le(E);
						{
							var pe = (ve) => {
									var X = pn(),
										_e = b(X);
									xt(
										_e,
										18,
										() => o(Ye),
										(_) => _,
										(_, L, j) => {
											const Z = te(() => (L.includes(':') ? L : `${o(I)}:${L}`));
											var F = fn();
											((F.__click = () => He(L)), (F.__keydown = (ge) => ge.key === 'Enter' && He(L)));
											var D = b(F);
											(z(() => x(D, 'icon', o(Z))),
												x(D, 'width', '24'),
												x(D, 'aria-hidden', 'true'),
												H(D, 1, 'transition-colors duration-200 group-hover:text-primary-500'));
											var ae = T(D, 2);
											{
												var Ee = (ge) => {
													var xe = ln();
													xe.__click = (Te) => {
														(Te.stopPropagation(), dt(L));
													};
													var ee = b(xe);
													(x(ee, 'icon', 'mdi:close-circle'), x(ee, 'width', '16'), H(ee, 1, 'text-error-500'), y(xe), k(ge, xe));
												};
												O(ae, (ge) => {
													o(P) === 'favorites' && ge(Ee);
												});
											}
											(y(F),
												z(() => {
													(ne(F, 'aria-selected', f() === o(Z) || o(j) === o(v)),
														H(
															F,
															1,
															`group relative flex cursor-pointer items-center justify-center rounded-lg p-3 transition-all duration-200 hover:scale-110 hover:bg-primary-500/10 focus:outline-none focus:ring-2 focus:ring-primary-500 active:scale-95 ${o(j) === o(v) ? 'ring-2 ring-primary-500' : ''}`
														),
														ne(F, 'aria-label', `Select icon ${o(Z)}`));
												}),
												k(_, F));
										}
									);
									var q = T(_e, 2);
									{
										var J = (_) => {
											var L = un(),
												j = b(L);
											(x(j, 'icon', 'eos-icons:loading'), H(j, 1, 'animate-spin text-surface-400'), x(j, 'width', '24'), y(L), k(_, L));
										};
										O(q, (_) => {
											o(Q) && _(J);
										});
									}
									var W = T(q, 2);
									{
										var M = (_) => {
											var L = dn();
											(dr(L, (j) => Bt?.(j)), k(_, L));
										};
										O(W, (_) => {
											o(P) === 'search' && !o(Q) && _(M);
										});
									}
									(y(X),
										It(
											X,
											(_) => d(G, _),
											() => o(G)
										),
										re(
											1,
											X,
											() => Pe,
											() => ({ duration: o(w) ? 0 : 300 })
										),
										k(ve, X));
								},
								ke = (ve) => {
									var X = De(),
										_e = Le(X);
									{
										var q = (W) => {
												var M = vn(),
													_ = b(M);
												(x(_, 'icon', 'mdi:magnify-close'), x(_, 'width', '48'), H(_, 1, 'text-surface-400'), x(_, 'aria-hidden', 'true'));
												var L = T(_, 2),
													j = T(b(L)),
													Z = b(j, !0);
												(y(j),
													gt(),
													y(L),
													y(M),
													z(() => Ie(Z, u())),
													re(
														1,
														M,
														() => Pe,
														() => ({ duration: o(w) ? 0 : 200 })
													),
													k(W, M));
											},
											J = (W) => {
												var M = hn(),
													_ = b(M);
												(z(() => x(_, 'icon', o(P) === 'favorites' ? 'mdi:heart-outline' : o(P) === 'recent' ? 'mdi:history' : 'mdi:magnify')),
													x(_, 'width', '48'),
													H(_, 1, 'text-surface-400'),
													x(_, 'aria-hidden', 'true'));
												var L = T(_, 2),
													j = b(L);
												{
													var Z = (D) => {
															var ae = We('No favorite icons yet');
															k(D, ae);
														},
														F = (D) => {
															var ae = De(),
																Ee = Le(ae);
															{
																var ge = (ee) => {
																		var Te = We('No recent selections');
																		k(ee, Te);
																	},
																	xe = (ee) => {
																		var Te = We('Start typing to search icons');
																		k(ee, Te);
																	};
																O(
																	Ee,
																	(ee) => {
																		o(P) === 'recent' ? ee(ge) : ee(xe, !1);
																	},
																	!0
																);
															}
															k(D, ae);
														};
													O(j, (D) => {
														o(P) === 'favorites' ? D(Z) : D(F, !1);
													});
												}
												(y(L),
													y(M),
													re(
														1,
														M,
														() => Pe,
														() => ({ duration: o(w) ? 0 : 200 })
													),
													k(W, M));
											};
										O(
											_e,
											(W) => {
												o(Ve) && o(P) === 'search' ? W(q) : W(J, !1);
											},
											!0
										);
									}
									k(ve, X);
								};
							O(
								de,
								(ve) => {
									o(Ye).length > 0 ? ve(pe) : ve(ke, !1);
								},
								!0
							);
						}
						k(C, E);
					};
				O(Re, (C) => {
					o(Q) && o(h).length === 0 ? C(we) : C(Me, !1);
				});
			}
			(y(Y),
				y(c),
				z(() => {
					(ne(g, 'aria-selected', o(P) === 'search'),
						H(
							g,
							1,
							`flex-1 px-4 py-3 text-sm font-medium transition-colors ${o(P) === 'search' ? 'border-b-2 border-primary-500 text-primary-500' : 'text-surface-600 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-100'}`
						));
				}),
				_t('scroll', Y, Vt),
				re(
					1,
					c,
					() => ze,
					() => ({ duration: o(w) ? 0 : 200, easing: $e, start: 0.95, opacity: 0 })
				),
				re(
					2,
					c,
					() => ze,
					() => ({ duration: o(w) ? 0 : 150, easing: $e, start: 0.95, opacity: 0 })
				),
				k(l, c));
		};
		O(tr, (l) => {
			o(B) && l(rr);
		});
	}
	(y(Xe),
		It(
			Xe,
			(l) => d(se, l),
			() => o(se)
		),
		z(
			(l) => {
				(ne(le, 'placeholder', l), ne(le, 'aria-expanded', o(B)), ne(le, 'aria-describedby', o(U) ? 'search-error' : void 0));
			},
			[() => (f() ? `Replace: ${f()}` : br())]
		),
		_t('focus', le, Xt),
		mr(le, u),
		k(e, mt),
		ar());
}
fr(['click', 'input', 'change', 'keydown']);
export { Fn as I };
//# sourceMappingURL=DOA-aSm7.js.map
