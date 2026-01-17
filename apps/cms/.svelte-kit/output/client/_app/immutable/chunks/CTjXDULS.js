import {
	a$ as se,
	g as J,
	R as X,
	D as re,
	B as ie,
	aS as Y,
	I as V,
	v as u,
	k as d,
	ac as g,
	j as ne,
	w as W,
	C as L,
	Y as ae,
	N as v,
	al as M,
	a3 as D,
	i as b,
	b0 as oe,
	b1 as O,
	b2 as E,
	b3 as $,
	b4 as le,
	au as F,
	at as Z,
	b5 as K,
	b6 as q,
	b7 as ue,
	b8 as j,
	b9 as fe,
	L as ce,
	a7 as w,
	q as A,
	n as de,
	Z as he,
	ba as H,
	bb as _e,
	G as pe,
	bc as ve,
	bd as ge,
	be,
	J as me,
	aW as ye,
	aF as Ee,
	l as N,
	bf as we,
	bg as Te,
	bh as ke,
	bi as Ae,
	aU as Ne,
	bj as I,
	bk as Re,
	m as Me,
	af as x,
	o as S,
	bl as Se,
	a6 as De,
	P as Oe,
	bm as Le,
	p as Ce,
	_ as Fe,
	ae as Ie,
	a as xe,
	M as U,
	a2 as Be,
	O as Pe
} from './DrlZFkx8.js';
function Ve(t) {
	let e = 0,
		s = X(0),
		i;
	return () => {
		se() &&
			(J(s),
			re(
				() => (
					e === 0 && (i = ie(() => t(() => Y(s)))),
					(e += 1),
					() => {
						V(() => {
							((e -= 1), e === 0 && (i?.(), (i = void 0), Y(s)));
						});
					}
				)
			));
	};
}
var We = pe | ve | ge;
function Ye(t, e, s) {
	new $e(t, e, s);
}
class $e {
	parent;
	is_pending = !1;
	#e;
	#i = d ? u : null;
	#t;
	#a;
	#n;
	#r = null;
	#s = null;
	#o = null;
	#l = null;
	#f = null;
	#d = 0;
	#u = 0;
	#h = !1;
	#_ = new Set();
	#p = new Set();
	#c = null;
	#y = Ve(
		() => (
			(this.#c = X(this.#d)),
			() => {
				this.#c = null;
			}
		)
	);
	constructor(e, s, i) {
		((this.#e = e),
			(this.#t = s),
			(this.#a = i),
			(this.parent = g.b),
			(this.is_pending = !!this.#t.pending),
			(this.#n = ne(() => {
				if (((g.b = this), d)) {
					const r = this.#i;
					(W(), r.nodeType === L && r.data === ae ? this.#w() : (this.#E(), this.#u === 0 && (this.is_pending = !1)));
				} else {
					var n = this.#b();
					try {
						this.#r = v(() => i(n));
					} catch (r) {
						this.error(r);
					}
					this.#u > 0 ? this.#g() : (this.is_pending = !1);
				}
				return () => {
					this.#f?.remove();
				};
			}, We)),
			d && (this.#e = u));
	}
	#E() {
		try {
			this.#r = v(() => this.#a(this.#e));
		} catch (e) {
			this.error(e);
		}
	}
	#w() {
		const e = this.#t.pending;
		e &&
			((this.#s = v(() => e(this.#e))),
			M.enqueue(() => {
				var s = this.#b();
				((this.#r = this.#v(() => (M.ensure(), v(() => this.#a(s))))),
					this.#u > 0
						? this.#g()
						: (D(this.#s, () => {
								this.#s = null;
							}),
							(this.is_pending = !1)));
			}));
	}
	#b() {
		var e = this.#e;
		return (this.is_pending && ((this.#f = b()), this.#e.before(this.#f), (e = this.#f)), e);
	}
	defer_effect(e) {
		oe(e, this.#_, this.#p);
	}
	is_rendered() {
		return !this.is_pending && (!this.parent || this.parent.is_rendered());
	}
	has_pending_snippet() {
		return !!this.#t.pending;
	}
	#v(e) {
		var s = g,
			i = F,
			n = Z;
		(O(this.#n), E(this.#n), $(this.#n.ctx));
		try {
			return e();
		} catch (r) {
			return (le(r), null);
		} finally {
			(O(s), E(i), $(n));
		}
	}
	#g() {
		const e = this.#t.pending;
		(this.#r !== null && ((this.#l = document.createDocumentFragment()), this.#l.append(this.#f), K(this.#r, this.#l)),
			this.#s === null && (this.#s = v(() => e(this.#e))));
	}
	#m(e) {
		if (!this.has_pending_snippet()) {
			this.parent && this.parent.#m(e);
			return;
		}
		if (((this.#u += e), this.#u === 0)) {
			this.is_pending = !1;
			for (const s of this.#_) (q(s, ue), j(s));
			for (const s of this.#p) (q(s, fe), j(s));
			(this.#_.clear(),
				this.#p.clear(),
				this.#s &&
					D(this.#s, () => {
						this.#s = null;
					}),
				this.#l && (this.#e.before(this.#l), (this.#l = null)));
		}
	}
	update_pending_count(e) {
		(this.#m(e), (this.#d += e), this.#c && ce(this.#c, this.#d));
	}
	get_effect_pending() {
		return (this.#y(), J(this.#c));
	}
	error(e) {
		var s = this.#t.onerror;
		let i = this.#t.failed;
		if (this.#h || (!s && !i)) throw e;
		(this.#r && (w(this.#r), (this.#r = null)),
			this.#s && (w(this.#s), (this.#s = null)),
			this.#o && (w(this.#o), (this.#o = null)),
			d && (A(this.#i), de(), A(he())));
		var n = !1,
			r = !1;
		const a = () => {
			if (n) {
				be();
				return;
			}
			((n = !0),
				r && _e(),
				M.ensure(),
				(this.#d = 0),
				this.#o !== null &&
					D(this.#o, () => {
						this.#o = null;
					}),
				(this.is_pending = this.has_pending_snippet()),
				(this.#r = this.#v(() => ((this.#h = !1), v(() => this.#a(this.#e))))),
				this.#u > 0 ? this.#g() : (this.is_pending = !1));
		};
		var o = F;
		try {
			(E(null), (r = !0), s?.(e, a), (r = !1));
		} catch (l) {
			H(l, this.#n && this.#n.parent);
		} finally {
			E(o);
		}
		i &&
			V(() => {
				this.#o = this.#v(() => {
					(M.ensure(), (this.#h = !0));
					try {
						return v(() => {
							i(
								this.#e,
								() => e,
								() => a
							);
						});
					} catch (l) {
						return (H(l, this.#n.parent), null);
					} finally {
						this.#h = !1;
					}
				});
			});
	}
}
function Ke(t) {
	return t.endsWith('capture') && t !== 'gotpointercapture' && t !== 'lostpointercapture';
}
const qe = [
	'beforeinput',
	'click',
	'change',
	'dblclick',
	'contextmenu',
	'focusin',
	'focusout',
	'input',
	'keydown',
	'keyup',
	'mousedown',
	'mousemove',
	'mouseout',
	'mouseover',
	'mouseup',
	'pointerdown',
	'pointermove',
	'pointerout',
	'pointerover',
	'pointerup',
	'touchend',
	'touchmove',
	'touchstart'
];
function Qe(t) {
	return qe.includes(t);
}
const je = [
	'allowfullscreen',
	'async',
	'autofocus',
	'autoplay',
	'checked',
	'controls',
	'default',
	'disabled',
	'formnovalidate',
	'indeterminate',
	'inert',
	'ismap',
	'loop',
	'multiple',
	'muted',
	'nomodule',
	'novalidate',
	'open',
	'playsinline',
	'readonly',
	'required',
	'reversed',
	'seamless',
	'selected',
	'webkitdirectory',
	'defer',
	'disablepictureinpicture',
	'disableremoteplayback'
];
function et(t) {
	return je.includes(t);
}
const He = {
	formnovalidate: 'formNoValidate',
	ismap: 'isMap',
	nomodule: 'noModule',
	playsinline: 'playsInline',
	readonly: 'readOnly',
	defaultvalue: 'defaultValue',
	defaultchecked: 'defaultChecked',
	srcobject: 'srcObject',
	novalidate: 'noValidate',
	allowfullscreen: 'allowFullscreen',
	disablepictureinpicture: 'disablePictureInPicture',
	disableremoteplayback: 'disableRemotePlayback'
};
function tt(t) {
	return ((t = t.toLowerCase()), He[t] ?? t);
}
const Ue = ['touchstart', 'touchmove'];
function Ge(t) {
	return Ue.includes(t);
}
const Q = new Set(),
	B = new Set();
function st(t) {
	if (!d) return;
	(t.removeAttribute('onload'), t.removeAttribute('onerror'));
	const e = t.__e;
	e !== void 0 &&
		((t.__e = void 0),
		queueMicrotask(() => {
			t.isConnected && t.dispatchEvent(e);
		}));
}
function ze(t, e, s, i = {}) {
	function n(r) {
		if ((i.capture || k.call(e, r), !r.cancelBubble)) return ye(() => s?.call(this, r));
	}
	return (
		t.startsWith('pointer') || t.startsWith('touch') || t === 'wheel'
			? V(() => {
					e.addEventListener(t, n, i);
				})
			: e.addEventListener(t, n, i),
		n
	);
}
function rt(t, e, s, i, n) {
	var r = { capture: i, passive: n },
		a = ze(t, e, s, r);
	(e === document.body || e === window || e === document || e instanceof HTMLMediaElement) &&
		me(() => {
			e.removeEventListener(t, a, r);
		});
}
function it(t) {
	for (var e = 0; e < t.length; e++) Q.add(t[e]);
	for (var s of B) s(t);
}
let G = null;
function k(t) {
	var e = this,
		s = e.ownerDocument,
		i = t.type,
		n = t.composedPath?.() || [],
		r = n[0] || t.target;
	G = t;
	var a = 0,
		o = G === t && t.__root;
	if (o) {
		var l = n.indexOf(o);
		if (l !== -1 && (e === document || e === window)) {
			t.__root = e;
			return;
		}
		var h = n.indexOf(e);
		if (h === -1) return;
		l <= h && (a = l);
	}
	if (((r = n[a] || t.target), r !== e)) {
		Ee(t, 'currentTarget', {
			configurable: !0,
			get() {
				return r || s;
			}
		});
		var C = F,
			p = g;
		(E(null), O(null));
		try {
			for (var f, c = []; r !== null; ) {
				var m = r.assignedSlot || r.parentNode || r.host || null;
				try {
					var T = r['__' + i];
					T != null && (!r.disabled || t.target === r) && T.call(r, t);
				} catch (R) {
					f ? c.push(R) : (f = R);
				}
				if (t.cancelBubble || m === e || m === null) break;
				r = m;
			}
			if (f) {
				for (let R of c)
					queueMicrotask(() => {
						throw R;
					});
				throw f;
			}
		} finally {
			((t.__root = e), delete t.currentTarget, E(C), O(p));
		}
	}
}
function ee(t) {
	var e = document.createElement('template');
	return ((e.innerHTML = t.replaceAll('<!>', '<!---->')), e.content);
}
function _(t, e) {
	var s = g;
	s.nodes === null && (s.nodes = { start: t, end: e, a: null, t: null });
}
function nt(t, e) {
	var s = (e & Te) !== 0,
		i = (e & ke) !== 0,
		n,
		r = !t.startsWith('<!>');
	return () => {
		if (d) return (_(u, null), u);
		n === void 0 && ((n = ee(r ? t : '<!>' + t)), s || (n = N(n)));
		var a = i || we ? document.importNode(n, !0) : n.cloneNode(!0);
		if (s) {
			var o = N(a),
				l = a.lastChild;
			_(o, l);
		} else _(a, a);
		return a;
	};
}
function Je(t, e, s = 'svg') {
	var i = !t.startsWith('<!>'),
		n = `<${s}>${i ? t : '<!>' + t}</${s}>`,
		r;
	return () => {
		if (d) return (_(u, null), u);
		if (!r) {
			var a = ee(n),
				o = N(a);
			r = N(o);
		}
		var l = r.cloneNode(!0);
		return (_(l, l), l);
	};
}
function at(t, e) {
	return Je(t, e, 'svg');
}
function ot(t = '') {
	if (!d) {
		var e = b(t + '');
		return (_(e, e), e);
	}
	var s = u;
	return (s.nodeType !== Ae && (s.before((s = b())), A(s)), _(s, s), s);
}
function lt() {
	if (d) return (_(u, null), u);
	var t = document.createDocumentFragment(),
		e = document.createComment(''),
		s = b();
	return (t.append(e, s), _(e, s), t);
}
function ut(t, e) {
	if (d) {
		var s = g;
		(((s.f & Ne) === 0 || s.nodes.end === null) && (s.nodes.end = u), W());
		return;
	}
	t !== null && t.before(e);
}
function ft() {
	if (d && u && u.nodeType === L && u.textContent?.startsWith('$')) {
		const t = u.textContent.substring(1);
		return (W(), t);
	}
	return (((window.__svelte ??= {}).uid ??= 1), `c${window.__svelte.uid++}`);
}
let z = !0;
function ct(t, e) {
	var s = e == null ? '' : typeof e == 'object' ? e + '' : e;
	s !== (t.__t ??= t.nodeValue) && ((t.__t = s), (t.nodeValue = s + ''));
}
function Xe(t, e) {
	return te(t, e);
}
function dt(t, e) {
	(I(), (e.intro = e.intro ?? !1));
	const s = e.target,
		i = d,
		n = u;
	try {
		for (var r = N(s); r && (r.nodeType !== L || r.data !== Re); ) r = Me(r);
		if (!r) throw x;
		(S(!0), A(r));
		const a = te(t, { ...e, anchor: r });
		return (S(!1), a);
	} catch (a) {
		if (
			a instanceof Error &&
			a.message
				.split(
					`
`
				)
				.some((o) => o.startsWith('https://svelte.dev/e/'))
		)
			throw a;
		return (a !== x && console.warn('Failed to hydrate: ', a), e.recover === !1 && Se(), I(), De(s), S(!1), Xe(t, e));
	} finally {
		(S(i), A(n));
	}
}
const y = new Map();
function te(t, { target: e, anchor: s, props: i = {}, events: n, context: r, intro: a = !0 }) {
	I();
	var o = new Set(),
		l = (p) => {
			for (var f = 0; f < p.length; f++) {
				var c = p[f];
				if (!o.has(c)) {
					o.add(c);
					var m = Ge(c);
					e.addEventListener(c, k, { passive: m });
					var T = y.get(c);
					T === void 0 ? (document.addEventListener(c, k, { passive: m }), y.set(c, 1)) : y.set(c, T + 1);
				}
			}
		};
	(l(Oe(Q)), B.add(l));
	var h = void 0,
		C = Le(() => {
			var p = s ?? e.appendChild(b());
			return (
				Ye(p, { pending: () => {} }, (f) => {
					if (r) {
						Ce({});
						var c = Z;
						c.c = r;
					}
					if (
						(n && (i.$$events = n),
						d && _(f, null),
						(z = a),
						(h = t(f, i) || {}),
						(z = !0),
						d && ((g.nodes.end = u), u === null || u.nodeType !== L || u.data !== Fe))
					)
						throw (Ie(), x);
					r && xe();
				}),
				() => {
					for (var f of o) {
						e.removeEventListener(f, k);
						var c = y.get(f);
						--c === 0 ? (document.removeEventListener(f, k), y.delete(f)) : y.set(f, c);
					}
					(B.delete(l), p !== s && p.parentNode?.removeChild(p));
				}
			);
		});
	return (P.set(h, C), h);
}
let P = new WeakMap();
function ht(t, e) {
	const s = P.get(t);
	return s ? (P.delete(t), s(e)) : Promise.resolve();
}
class _t {
	anchor;
	#e = new Map();
	#i = new Map();
	#t = new Map();
	#a = new Set();
	#n = !0;
	constructor(e, s = !0) {
		((this.anchor = e), (this.#n = s));
	}
	#r = () => {
		var e = U;
		if (this.#e.has(e)) {
			var s = this.#e.get(e),
				i = this.#i.get(s);
			if (i) (Be(i), this.#a.delete(s));
			else {
				var n = this.#t.get(s);
				n && (this.#i.set(s, n.effect), this.#t.delete(s), n.fragment.lastChild.remove(), this.anchor.before(n.fragment), (i = n.effect));
			}
			for (const [r, a] of this.#e) {
				if ((this.#e.delete(r), r === e)) break;
				const o = this.#t.get(a);
				o && (w(o.effect), this.#t.delete(a));
			}
			for (const [r, a] of this.#i) {
				if (r === s || this.#a.has(r)) continue;
				const o = () => {
					if (Array.from(this.#e.values()).includes(r)) {
						var h = document.createDocumentFragment();
						(K(a, h), h.append(b()), this.#t.set(r, { effect: a, fragment: h }));
					} else w(a);
					(this.#a.delete(r), this.#i.delete(r));
				};
				this.#n || !i ? (this.#a.add(r), D(a, o, !1)) : o();
			}
		}
	};
	#s = (e) => {
		this.#e.delete(e);
		const s = Array.from(this.#e.values());
		for (const [i, n] of this.#t) s.includes(i) || (w(n.effect), this.#t.delete(i));
	};
	ensure(e, s) {
		var i = U,
			n = Pe();
		if (s && !this.#i.has(e) && !this.#t.has(e))
			if (n) {
				var r = document.createDocumentFragment(),
					a = b();
				(r.append(a), this.#t.set(e, { effect: v(() => s(a)), fragment: r }));
			} else
				this.#i.set(
					e,
					v(() => s(this.anchor))
				);
		if ((this.#e.set(i, e), n)) {
			for (const [o, l] of this.#i) o === e ? i.skipped_effects.delete(l) : i.skipped_effects.add(l);
			for (const [o, l] of this.#t) o === e ? i.skipped_effects.delete(l.effect) : i.skipped_effects.add(l.effect);
			(i.oncommit(this.#r), i.ondiscard(this.#s));
		} else (d && (this.anchor = u), this.#r());
	}
}
export {
	_t as B,
	ut as a,
	at as b,
	lt as c,
	it as d,
	rt as e,
	nt as f,
	ee as g,
	_ as h,
	dt as i,
	z as j,
	Ke as k,
	ze as l,
	Xe as m,
	tt as n,
	Qe as o,
	ft as p,
	et as q,
	st as r,
	ct as s,
	ot as t,
	ht as u
};
//# sourceMappingURL=CTjXDULS.js.map
