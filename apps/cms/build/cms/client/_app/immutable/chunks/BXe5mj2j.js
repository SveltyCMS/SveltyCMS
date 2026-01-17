import {
	j as G,
	g as V,
	K as J,
	L as Y,
	M as $,
	N as z,
	O as y,
	P as q,
	Q as j,
	R as U,
	T as ee,
	U as re,
	V as ne,
	W as fe,
	q as H,
	k as R,
	l as ae,
	i as b,
	w as ie,
	X as le,
	Y as se,
	Z as X,
	o as k,
	v as D,
	C as ue,
	_ as oe,
	a0 as m,
	a1 as K,
	a2 as P,
	a3 as Q,
	a4 as L,
	I as te,
	m as ve,
	a5 as de,
	a6 as ce,
	a7 as pe
} from './DrlZFkx8.js';
function me(r, i) {
	return i;
}
function _e(r, i, l) {
	for (var d = [], g = i.length, u, s = i.length, p = 0; p < g; p++) {
		let h = i[p];
		Q(
			h,
			() => {
				if (u) {
					if ((u.pending.delete(h), u.done.add(h), u.pending.size === 0)) {
						var o = r.outrogroups;
						(F(q(u.done)), o.delete(u), o.size === 0 && (r.outrogroups = null));
					}
				} else s -= 1;
			},
			!1
		);
	}
	if (s === 0) {
		var f = d.length === 0 && l !== null;
		if (f) {
			var t = l,
				n = t.parentNode;
			(ce(n), n.append(t), r.items.clear());
		}
		F(i, !f);
	} else ((u = { pending: new Set(i), done: new Set() }), (r.outrogroups ??= new Set()).add(u));
}
function F(r, i = !0) {
	for (var l = 0; l < r.length; l++) pe(r[l], i);
}
var B;
function Te(r, i, l, d, g, u = null) {
	var s = r,
		p = new Map(),
		f = (i & K) !== 0;
	if (f) {
		var t = r;
		s = R ? H(ae(t)) : t.appendChild(b());
	}
	R && ie();
	var n = null,
		h = J(() => {
			var a = l();
			return j(a) ? a : a == null ? [] : q(a);
		}),
		o,
		c = !0;
	function A() {
		((e.fallback = n),
			ge(e, o, s, i, d),
			n !== null &&
				(o.length === 0
					? (n.f & m) === 0
						? P(n)
						: ((n.f ^= m), O(n, null, s))
					: Q(n, () => {
							n = null;
						})));
	}
	var w = G(() => {
			o = V(h);
			var a = o.length;
			let N = !1;
			if (R) {
				var S = le(s) === se;
				S !== (a === 0) && ((s = X()), H(s), k(!1), (N = !0));
			}
			for (var E = new Set(), C = $, x = y(), _ = 0; _ < a; _ += 1) {
				R && D.nodeType === ue && D.data === oe && ((s = D), (N = !0), k(!1));
				var I = o[_],
					M = d(I, _),
					v = c ? null : p.get(M);
				(v
					? (v.v && Y(v.v, I), v.i && Y(v.i, _), x && C.skipped_effects.delete(v.e))
					: ((v = he(p, c ? s : (B ??= b()), I, M, _, g, i, l)), c || (v.e.f |= m), p.set(M, v)),
					E.add(M));
			}
			if ((a === 0 && u && !n && (c ? (n = z(() => u(s))) : ((n = z(() => u((B ??= b())))), (n.f |= m))), R && a > 0 && H(X()), !c))
				if (x) {
					for (const [W, Z] of p) E.has(W) || C.skipped_effects.add(Z.e);
					(C.oncommit(A), C.ondiscard(() => {}));
				} else A();
			(N && k(!0), V(h));
		}),
		e = { effect: w, items: p, outrogroups: null, fallback: n };
	((c = !1), R && (s = D));
}
function ge(r, i, l, d, g) {
	var u = (d & de) !== 0,
		s = i.length,
		p = r.items,
		f = r.effect.first,
		t,
		n = null,
		h,
		o = [],
		c = [],
		A,
		w,
		e,
		a;
	if (u)
		for (a = 0; a < s; a += 1) ((A = i[a]), (w = g(A, a)), (e = p.get(w).e), (e.f & m) === 0 && (e.nodes?.a?.measure(), (h ??= new Set()).add(e)));
	for (a = 0; a < s; a += 1) {
		if (((A = i[a]), (w = g(A, a)), (e = p.get(w).e), r.outrogroups !== null)) for (const v of r.outrogroups) (v.pending.delete(e), v.done.delete(e));
		if ((e.f & m) !== 0)
			if (((e.f ^= m), e === f)) O(e, null, l);
			else {
				var N = n ? n.next : f;
				(e === r.effect.last && (r.effect.last = e.prev),
					e.prev && (e.prev.next = e.next),
					e.next && (e.next.prev = e.prev),
					T(r, n, e),
					T(r, e, N),
					O(e, N, l),
					(n = e),
					(o = []),
					(c = []),
					(f = n.next));
				continue;
			}
		if (((e.f & L) !== 0 && (P(e), u && (e.nodes?.a?.unfix(), (h ??= new Set()).delete(e))), e !== f)) {
			if (t !== void 0 && t.has(e)) {
				if (o.length < c.length) {
					var S = c[0],
						E;
					n = S.prev;
					var C = o[0],
						x = o[o.length - 1];
					for (E = 0; E < o.length; E += 1) O(o[E], S, l);
					for (E = 0; E < c.length; E += 1) t.delete(c[E]);
					(T(r, C.prev, x.next), T(r, n, C), T(r, x, S), (f = S), (n = x), (a -= 1), (o = []), (c = []));
				} else (t.delete(e), O(e, f, l), T(r, e.prev, e.next), T(r, e, n === null ? r.effect.first : n.next), T(r, n, e), (n = e));
				continue;
			}
			for (o = [], c = []; f !== null && f !== e; ) ((t ??= new Set()).add(f), c.push(f), (f = f.next));
			if (f === null) continue;
		}
		((e.f & m) === 0 && o.push(e), (n = e), (f = e.next));
	}
	if (r.outrogroups !== null) {
		for (const v of r.outrogroups) v.pending.size === 0 && (F(q(v.done)), r.outrogroups?.delete(v));
		r.outrogroups.size === 0 && (r.outrogroups = null);
	}
	if (f !== null || t !== void 0) {
		var _ = [];
		if (t !== void 0) for (e of t) (e.f & L) === 0 && _.push(e);
		for (; f !== null; ) ((f.f & L) === 0 && f !== r.fallback && _.push(f), (f = f.next));
		var I = _.length;
		if (I > 0) {
			var M = (d & K) !== 0 && s === 0 ? l : null;
			if (u) {
				for (a = 0; a < I; a += 1) _[a].nodes?.a?.measure();
				for (a = 0; a < I; a += 1) _[a].nodes?.a?.fix();
			}
			_e(r, _, M);
		}
	}
	u &&
		te(() => {
			if (h !== void 0) for (e of h) e.nodes?.a?.apply();
		});
}
function he(r, i, l, d, g, u, s, p) {
	var f = (s & ne) !== 0 ? ((s & fe) === 0 ? ee(l, !1, !1) : U(l)) : null,
		t = (s & re) !== 0 ? U(g) : null;
	return {
		v: f,
		i: t,
		e: z(
			() => (
				u(i, f ?? l, t ?? g, p),
				() => {
					r.delete(d);
				}
			)
		)
	};
}
function O(r, i, l) {
	if (r.nodes)
		for (var d = r.nodes.start, g = r.nodes.end, u = i && (i.f & m) === 0 ? i.nodes.start : l; d !== null; ) {
			var s = ve(d);
			if ((u.before(d), d === g)) return;
			d = s;
		}
}
function T(r, i, l) {
	(i === null ? (r.effect.first = l) : (i.next = l), l === null ? (r.effect.last = i) : (l.prev = i));
}
export { Te as e, me as i };
//# sourceMappingURL=BXe5mj2j.js.map
