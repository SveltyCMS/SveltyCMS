import {
	J as T,
	aF as L,
	A as m,
	T as R,
	b as y,
	g as b,
	aG as P,
	aH as B,
	aI as K,
	aJ as M,
	K as N,
	x as U,
	aK as Y,
	ac as j,
	aL as $,
	aM as G,
	B as J,
	aN as q,
	aO as z,
	S as I,
	aP as x,
	aQ as c
} from './DrlZFkx8.js';
import { s as C, g as F } from './DvgRl2rN.js';
let _ = !1,
	S = Symbol();
function X(e, r, s) {
	const n = (s[r] ??= { store: null, source: R(void 0), unsubscribe: m });
	if (n.store !== e && !(S in s))
		if ((n.unsubscribe(), (n.store = e ?? null), e == null)) ((n.source.v = void 0), (n.unsubscribe = m));
		else {
			var t = !0;
			((n.unsubscribe = C(e, (u) => {
				t ? (n.source.v = u) : y(n.source, u);
			})),
				(t = !1));
		}
	return e && S in s ? F(e) : b(n.source);
}
function k() {
	const e = {};
	function r() {
		T(() => {
			for (var s in e) e[s].unsubscribe();
			L(e, S, { enumerable: !1, value: !0 });
		});
	}
	return [e, r];
}
function H(e) {
	var r = _;
	try {
		return ((_ = !1), [e(), _]);
	} finally {
		_ = r;
	}
}
const Q = {
	get(e, r) {
		if (!e.exclude.includes(r)) return e.props[r];
	},
	set(e, r) {
		return !1;
	},
	getOwnPropertyDescriptor(e, r) {
		if (!e.exclude.includes(r) && r in e.props) return { enumerable: !0, configurable: !0, value: e.props[r] };
	},
	has(e, r) {
		return e.exclude.includes(r) ? !1 : r in e.props;
	},
	ownKeys(e) {
		return Reflect.ownKeys(e.props).filter((r) => !e.exclude.includes(r));
	}
};
function ee(e, r, s) {
	return new Proxy({ props: e, exclude: r }, Q);
}
const Z = {
	get(e, r) {
		let s = e.props.length;
		for (; s--; ) {
			let n = e.props[s];
			if ((c(n) && (n = n()), typeof n == 'object' && n !== null && r in n)) return n[r];
		}
	},
	set(e, r, s) {
		let n = e.props.length;
		for (; n--; ) {
			let t = e.props[n];
			c(t) && (t = t());
			const u = P(t, r);
			if (u && u.set) return (u.set(s), !0);
		}
		return !1;
	},
	getOwnPropertyDescriptor(e, r) {
		let s = e.props.length;
		for (; s--; ) {
			let n = e.props[s];
			if ((c(n) && (n = n()), typeof n == 'object' && n !== null && r in n)) {
				const t = P(n, r);
				return (t && !t.configurable && (t.configurable = !0), t);
			}
		}
	},
	has(e, r) {
		if (r === I || r === x) return !1;
		for (let s of e.props) if ((c(s) && (s = s()), s != null && r in s)) return !0;
		return !1;
	},
	ownKeys(e) {
		const r = [];
		for (let s of e.props)
			if ((c(s) && (s = s()), !!s)) {
				for (const n in s) r.includes(n) || r.push(n);
				for (const n of Object.getOwnPropertySymbols(s)) r.includes(n) || r.push(n);
			}
		return r;
	}
};
function re(...e) {
	return new Proxy({ props: e }, Z);
}
function ne(e, r, s, n) {
	var t = (s & G) !== 0,
		u = (s & z) !== 0,
		p = n,
		v = !0,
		h = () => (v && ((v = !1), (p = u ? J(n) : n)), p),
		a;
	if (t) {
		var A = I in e || x in e;
		a = P(e, r)?.set ?? (A && r in e ? (i) => (e[r] = i) : void 0);
	}
	var f,
		w = !1;
	(t ? ([f, w] = H(() => e[r])) : (f = e[r]), f === void 0 && n !== void 0 && ((f = h()), a && (B(), a(f))));
	var o;
	if (
		((o = () => {
			var i = e[r];
			return i === void 0 ? h() : ((v = !0), i);
		}),
		(s & K) === 0)
	)
		return o;
	if (a) {
		var D = e.$$legacy;
		return function (i, d) {
			return arguments.length > 0 ? ((!d || D || w) && a(d ? o() : i), i) : o();
		};
	}
	var g = !1,
		l = ((s & q) !== 0 ? M : N)(() => ((g = !1), o()));
	t && b(l);
	var E = j;
	return function (i, d) {
		if (arguments.length > 0) {
			const O = d ? b(l) : t ? U(i) : i;
			return (y(l, O), (g = !0), p !== void 0 && (p = O), i);
		}
		return (Y && g) || (E.f & $) !== 0 ? l.v : b(l);
	};
}
export { X as a, re as b, ne as p, ee as r, k as s };
//# sourceMappingURL=DePHBZW_.js.map
