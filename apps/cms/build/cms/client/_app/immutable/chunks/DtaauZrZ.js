import { aC as J, aA as W, d as G, x as K, B as X, g as l, a_ as Z, u as _, ao as B, b as H, z as Q } from './DrlZFkx8.js';
import { m as U, e as Y, f as C, h as tt, j as et, M as k, k as nt, l as rt, o as st, w as q, I as z, d as ot } from './C-hhfhAN.js';
import { a as I, o as ct } from './CMZtchEj.js';
function St(t) {
	const r = Symbol();
	return {
		key: r,
		consume() {
			return W(r) || t;
		},
		provide(e) {
			return J(r, e);
		}
	};
}
function ut(t) {
	return new Proxy(
		{},
		{
			get(r, e) {
				return e === 'style' ? (o) => t({ style: o }).style : t;
			}
		}
	);
}
var vt = () => (t) => Array.from(new Set(t));
const L = {
	className: 'class',
	defaultChecked: 'checked',
	defaultValue: 'value',
	htmlFor: 'for',
	onBlur: 'onfocusout',
	onChange: 'oninput',
	onFocus: 'onfocusin',
	onDoubleClick: 'ondblclick'
};
function O(t) {
	let r = '';
	for (let e in t) {
		const o = t[e];
		o != null && (e.startsWith('--') || (e = e.replace(/[A-Z]/g, (g) => `-${g.toLowerCase()}`)), (r += `${e}:${o};`));
	}
	return r;
}
const at = new Set(
	'viewBox,className,preserveAspectRatio,fillRule,clipPath,clipRule,strokeWidth,strokeLinecap,strokeLinejoin,strokeDasharray,strokeDashoffset,strokeMiterlimit'.split(
		','
	)
);
function it(t) {
	return t in L ? L[t] : at.has(t) ? t : t.toLowerCase();
}
function ft(t, r) {
	return t === 'style' && typeof r == 'object' ? O(r) : r;
}
const bt = ut((t) => {
		const r = {};
		for (const e in t) r[it(e)] = ft(e, t[e]);
		return r;
	}),
	lt = /((?:--)?(?:\w+-?)+)\s*:\s*([^;]*)/g,
	gt = (t) => {
		const r = {};
		let e;
		for (; (e = lt.exec(t)); ) r[e[1]] = e[2];
		return r;
	};
function Ct(...t) {
	const r = [];
	for (const o of t) o && 'class' in o && o.class != null && r.push(o.class);
	const e = U(...t);
	return (
		r.length > 0 && (e.class = r.length === 1 ? r[0] : r),
		'style' in e && (typeof e.style == 'string' && (e.style = gt(e.style)), (e.style = O(e.style))),
		e
	);
}
function $(t) {
	const r = t().defaultValue ?? t().value,
		e = t().isEqual ?? Object.is;
	let o = G(K(r));
	const g = _(() => t().value !== void 0);
	let c = { current: X(() => l(o)) },
		p = { current: void 0 };
	Z(() => {
		const a = l(g) ? t().value : l(o);
		((c = { current: a }), (p = { current: a }));
	});
	const v = (a) => {
		const d = C(a) ? a(c.current) : a,
			y = p.current;
		(t().debug && console.log(`[bindable > ${t().debug}] setValue`, { next: d, prev: y }), l(g) || H(o, d, !0), e(d, y) || t().onChange?.(d, y));
	};
	function m() {
		return l(g) ? t().value : l(o);
	}
	return {
		initial: r,
		ref: c,
		get: m,
		set(a) {
			(t().sync ? B : Y)(() => v(a));
		},
		invoke(a, d) {
			t().onChange?.(a, d);
		},
		hash(a) {
			return t().hash?.(a) ?? String(a);
		}
	};
}
$.cleanup = (t) => {
	I(() => t());
};
$.ref = (t) => {
	let r = t;
	return {
		get: () => r,
		set: (e) => {
			r = e;
		}
	};
};
function dt(t) {
	const r = { current: t };
	return {
		get(e) {
			return r.current[e];
		},
		set(e, o) {
			r.current[e] = o;
		}
	};
}
const M = (t) => (typeof t == 'function' ? t() : t),
	pt = (t, r) => {
		let e = [],
			o = !0;
		Q(() => {
			if (o) {
				((e = t.map((c) => M(c))), (o = !1));
				return;
			}
			let g = !1;
			for (let c = 0; c < t.length; c++)
				if (!tt(e[c], M(t[c]))) {
					g = !0;
					break;
				}
			g && ((e = t.map((c) => M(c))), r());
		});
	};
function j(t) {
	return C(t) ? t() : t;
}
function wt(t, r) {
	const e = _(() => {
			const { id: n, ids: s, getRootNode: i } = j(r);
			return nt({ id: n, ids: s, getRootNode: i });
		}),
		o = (...n) => {
			t.debug && console.log(...n);
		},
		g = _(() => t.props?.({ props: ot(j(r)), scope: l(e) }) ?? j(r)),
		c = mt(() => l(g)),
		p = t.context?.({
			prop: c,
			bindable: $,
			get scope() {
				return l(e);
			},
			flush: T,
			getContext() {
				return v;
			},
			getComputed() {
				return R;
			},
			getRefs() {
				return N;
			},
			getEvent() {
				return E();
			}
		}),
		v = {
			get(n) {
				return p?.[n].get();
			},
			set(n, s) {
				p?.[n].set(s);
			},
			initial(n) {
				return p?.[n].initial;
			},
			hash(n) {
				const s = p?.[n].get();
				return p?.[n].hash(s);
			}
		};
	let m = new Map(),
		a = { current: null },
		d = { current: null },
		y = { current: { type: '' } };
	const E = () => ({
			...y.current,
			current() {
				return y.current;
			},
			previous() {
				return d.current;
			}
		}),
		V = () => ({
			...x,
			hasTag(n) {
				const s = x.get();
				return !!t.states[s]?.tags?.includes(n);
			},
			matches(...n) {
				const s = x.get();
				return n.includes(s);
			}
		}),
		N = dt(t.refs?.({ prop: c, context: v }) ?? {}),
		h = () => ({
			state: V(),
			context: v,
			event: E(),
			prop: c,
			send: F,
			action: b,
			guard: A,
			track: pt,
			refs: N,
			computed: R,
			flush: T,
			scope: l(e),
			choose: D
		}),
		b = (n) => {
			const s = C(n) ? n(h()) : n;
			if (!s) return;
			const i = s.map((u) => {
				const f = t.implementations?.actions?.[u];
				return (f || q(`[zag-js] No implementation found for action "${JSON.stringify(u)}"`), f);
			});
			for (const u of i) u?.(h());
		},
		A = (n) => (C(n) ? n(h()) : t.implementations?.guards?.[n](h())),
		P = (n) => {
			const s = C(n) ? n(h()) : n;
			if (!s) return;
			const i = s.map((f) => {
					const S = t.implementations?.effects?.[f];
					return (S || q(`[zag-js] No implementation found for effect "${JSON.stringify(f)}"`), S);
				}),
				u = [];
			for (const f of i) {
				const S = f?.(h());
				S && u.push(S);
			}
			return () => u.forEach((f) => f?.());
		},
		D = (n) =>
			rt(n).find((s) => {
				let i = !s.guard;
				return (st(s.guard) ? (i = !!A(s.guard)) : C(s.guard) && (i = s.guard(h())), i);
			}),
		R = (n) => {
			et(t.computed, () => '[zag-js] No computed object found on machine');
			const s = t.computed[n];
			return s({ context: v, event: E(), prop: c, refs: N, scope: l(e), computed: R });
		},
		x = $(() => ({
			defaultValue: t.initialState({ prop: c }),
			onChange(n, s) {
				(s && (m.get(s)?.(), m.delete(s)), s && b(t.states[s]?.exit), b(a.current?.actions));
				const i = P(t.states[n]?.effects);
				if ((i && m.set(n, i), s === z)) {
					b(t.entry);
					const u = P(t.effects);
					u && m.set(z, u);
				}
				b(t.states[n]?.entry);
			}
		}));
	let w = k.NotStarted;
	(ct(() => {
		const n = w === k.Started;
		((w = k.Started), o(n ? 'rehydrating...' : 'initializing...'), x.invoke(x.initial, z));
	}),
		I(() => {
			(o('unmounting...'), (w = k.Stopped), m.forEach((n) => n?.()), (m = new Map()), (a.current = null), b(t.exit));
		}));
	const F = (n) => {
		if (w !== k.Started) return;
		((d.current = y.current), (y.current = n));
		let s = x.get();
		const i = t.states[s].on?.[n.type] ?? t.on?.[n.type],
			u = D(i);
		if (!u) return;
		a.current = u;
		const f = u.target ?? s;
		o('transition', n.type, u.target || s, `(${u.actions})`);
		const S = f !== s;
		S ? x.set(f) : u.reenter && !S ? x.invoke(s, s) : b(u.actions);
	};
	return (
		t.watch?.(h()),
		{
			get state() {
				return V();
			},
			send: F,
			context: v,
			prop: c,
			get scope() {
				return l(e);
			},
			refs: N,
			computed: R,
			get event() {
				return E();
			},
			getStatus: () => w
		}
	);
}
function mt(t) {
	return function (e) {
		return t()[e];
	};
}
function T(t) {
	B(() => {
		queueMicrotask(() => t());
	});
}
export { vt as a, St as c, Ct as m, bt as n, wt as u };
//# sourceMappingURL=DtaauZrZ.js.map
