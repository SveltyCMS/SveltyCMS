import { d as T, x as ut, g as w, b as x } from './DrlZFkx8.js';
import { a as he, p as J, S as Ot } from './C9E6SjbS.js';
var ge = Object.defineProperty,
	Xt = (t) => {
		throw TypeError(t);
	},
	pe = (t, e, n) => (e in t ? ge(t, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (t[e] = n)),
	B = (t, e, n) => pe(t, typeof e != 'symbol' ? e + '' : e, n),
	me = (t, e, n) => e.has(t) || Xt('Cannot ' + n),
	Lt = (t, e, n) => (me(t, e, 'read from private field'), e.get(t)),
	ye = (t, e, n) => (e.has(t) ? Xt('Cannot add the same private member more than once') : e instanceof WeakSet ? e.add(t) : e.set(t, n));
function Gr(t) {
	return t == null ? [] : Array.isArray(t) ? t : [t];
}
var zr = (t) => t[0],
	Xr = (t) => t[t.length - 1];
function Yt(t, e, n = {}) {
	const { step: r = 1, loop: s = !0 } = n,
		i = e + r,
		a = t.length,
		o = a - 1;
	return e === -1 ? (r > 0 ? 0 : o) : i < 0 ? (s ? o : 0) : i >= a ? (s ? 0 : e > a ? a : e) : i;
}
function Yr(t, e, n = {}) {
	return t[Yt(t, e, n)];
}
function ve(t, e, n = {}) {
	const { step: r = 1, loop: s = !0 } = n;
	return Yt(t, e, { step: -r, loop: s });
}
function Zr(t, e, n = {}) {
	return t[ve(t, e, n)];
}
function Ee(t) {
	return t.reduce((e, n) => (Array.isArray(n) ? e.concat(Ee(n)) : e.concat(n)), []);
}
var It = (t) => t?.constructor.name === 'Array',
	be = (t, e) => {
		if (t.length !== e.length) return !1;
		for (let n = 0; n < t.length; n++) if (!yt(t[n], e[n])) return !1;
		return !0;
	},
	yt = (t, e) => {
		if (Object.is(t, e)) return !0;
		if ((t == null && e != null) || (t != null && e == null)) return !1;
		if (typeof t?.isEqual == 'function' && typeof e?.isEqual == 'function') return t.isEqual(e);
		if (typeof t == 'function' && typeof e == 'function') return t.toString() === e.toString();
		if (It(t) && It(e)) return be(Array.from(t), Array.from(e));
		if (typeof t != 'object' || typeof e != 'object') return !1;
		const n = Object.keys(e ?? Object.create(null)),
			r = n.length;
		for (let s = 0; s < r; s++) if (!Reflect.has(t, n[s])) return !1;
		for (let s = 0; s < r; s++) {
			const i = n[s];
			if (!yt(t[i], e[i])) return !1;
		}
		return !0;
	},
	Se = (t) => t != null && typeof t == 'object',
	Qr = (t) => typeof t == 'number' && !Number.isNaN(t),
	ct = (t) => typeof t == 'string',
	Zt = (t) => typeof t == 'function',
	Jr = (t) => t == null,
	Te = (t, e) => Object.prototype.hasOwnProperty.call(t, e),
	we = (t) => Object.prototype.toString.call(t),
	Qt = Function.prototype.toString,
	xe = Qt.call(Object),
	Ae = (t) => {
		if (!Se(t) || we(t) != '[object Object]' || Ie(t)) return !1;
		const e = Object.getPrototypeOf(t);
		if (e === null) return !0;
		const n = Te(e, 'constructor') && e.constructor;
		return typeof n == 'function' && n instanceof n && Qt.call(n) == xe;
	},
	Oe = (t) => typeof t == 'object' && t !== null && '$$typeof' in t && 'props' in t,
	Le = (t) => typeof t == 'object' && t !== null && '__v_isVNode' in t,
	Ie = (t) => Oe(t) || Le(t),
	Z = (t, ...e) => (typeof t == 'function' ? t(...e) : t) ?? void 0,
	ts = (t) => t,
	es = (t) => t(),
	ns = () => {},
	pt =
		(...t) =>
		(...e) => {
			t.forEach(function (n) {
				n?.(...e);
			});
		},
	Jt = (() => {
		let t = 0;
		return () => (t++, t.toString(36));
	})(),
	Pt = (t) => String.fromCharCode(t + (t > 25 ? 39 : 97));
function Pe(t) {
	let e = '',
		n;
	for (n = Math.abs(t); n > 52; n = (n / 52) | 0) e = Pt(n % 52) + e;
	return Pt(n % 52) + e;
}
function De(t, e) {
	let n = e.length;
	for (; n; ) t = (t * 33) ^ e.charCodeAt(--n);
	return t;
}
var rs = (t) => Pe(De(5381, t) >>> 0),
	ke = (t) => Number.isNaN(t),
	Me = (t) => (ke(t) ? 0 : t),
	ss = (t, e, n) => (Me(t) - e) / (n - e),
	is = (t) => (typeof t == 'number' ? `${t}px` : t);
function te(t) {
	if (!Ae(t) || t === void 0) return t;
	const e = Reflect.ownKeys(t).filter((r) => typeof r == 'string'),
		n = {};
	for (const r of e) {
		const s = t[r];
		s !== void 0 && (n[r] = te(s));
	}
	return n;
}
function Ce(t, e) {
	const n = {},
		r = {},
		s = new Set(e),
		i = Reflect.ownKeys(t);
	for (const a of i) s.has(a) ? (r[a] = t[a]) : (n[a] = t[a]);
	return [r, n];
}
var os = (t) =>
	function (n) {
		return Ce(n, t);
	};
function as(t, e = Object.is) {
	let n = { ...t };
	const r = new Set(),
		s = (u) => (r.add(u), () => r.delete(u)),
		i = () => {
			r.forEach((u) => u());
		};
	return {
		subscribe: s,
		get: (u) => n[u],
		set: (u, h) => {
			e(n[u], h) || ((n[u] = h), i());
		},
		update: (u) => {
			let h = !1;
			for (const m in u) {
				const g = u[m];
				g !== void 0 && !e(n[m], g) && ((n[m] = g), (h = !0));
			}
			h && i();
		},
		snapshot: () => ({ ...n })
	};
}
var Q = () => performance.now(),
	tt,
	Ne = class {
		constructor(t) {
			((this.onTick = t),
				B(this, 'frameId', null),
				B(this, 'pausedAtMs', null),
				B(this, 'context'),
				B(this, 'cancelFrame', () => {
					this.frameId !== null && (cancelAnimationFrame(this.frameId), (this.frameId = null));
				}),
				B(this, 'setStartMs', (e) => {
					this.context.startMs = e;
				}),
				B(this, 'start', () => {
					if (this.frameId !== null) return;
					const e = Q();
					(this.pausedAtMs !== null ? ((this.context.startMs += e - this.pausedAtMs), (this.pausedAtMs = null)) : (this.context.startMs = e),
						(this.frameId = requestAnimationFrame(Lt(this, tt))));
				}),
				B(this, 'pause', () => {
					this.frameId !== null && (this.cancelFrame(), (this.pausedAtMs = Q()));
				}),
				B(this, 'stop', () => {
					this.frameId !== null && (this.cancelFrame(), (this.pausedAtMs = null));
				}),
				ye(this, tt, (e) => {
					if (((this.context.now = e), (this.context.deltaMs = e - this.context.startMs), this.onTick(this.context) === !1)) {
						this.stop();
						return;
					}
					this.frameId = requestAnimationFrame(Lt(this, tt));
				}),
				(this.context = { now: 0, startMs: Q(), deltaMs: 0 }));
		}
		get elapsedMs() {
			return this.pausedAtMs !== null ? this.pausedAtMs - this.context.startMs : Q() - this.context.startMs;
		}
	};
tt = new WeakMap();
function lt(t, e) {
	const n = new Ne(({ deltaMs: r }) => {
		if (r >= e) return (t(), !1);
	});
	return (n.start(), () => n.stop());
}
function vt(...t) {
	(t.length === 1 ? t[0] : t[1], t.length === 2 && t[0]);
}
function us(t, e) {
	if (t == null) throw new Error(e());
}
function Re(t, e, n) {
	let r = [];
	for (const s of e) t[s] == null && r.push(s);
	if (r.length > 0) throw new Error(`[zag-js${` > ${n}`}] missing required props: ${r.join(', ')}`);
}
var _e = Object.defineProperty,
	Fe = (t, e, n) => (e in t ? _e(t, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : (t[e] = n)),
	ft = (t, e, n) => Fe(t, typeof e != 'symbol' ? e + '' : e, n),
	Dt = (t) => Math.max(0, Math.min(1, t)),
	Be = (t, e) => t.map((n, r) => t[(Math.max(e, 0) + r) % t.length]),
	$e = () => {},
	rt = (t) => typeof t == 'object' && t !== null,
	Ve = 2147483647,
	V = (t) => (t ? '' : void 0),
	cs = (t) => (t ? 'true' : void 0),
	We = 1,
	Ke = 9,
	je = 11,
	A = (t) => rt(t) && t.nodeType === We && typeof t.nodeName == 'string',
	Et = (t) => rt(t) && t.nodeType === Ke,
	Ue = (t) => rt(t) && t === t.window,
	ee = (t) => (A(t) ? t.localName || '' : '#document');
function He(t) {
	return ['html', 'body', '#document'].includes(ee(t));
}
var qe = (t) => rt(t) && t.nodeType !== void 0,
	H = (t) => qe(t) && t.nodeType === je && 'host' in t,
	Ge = (t) => A(t) && t.localName === 'input',
	ls = (t) => !!t?.matches('a[href]'),
	ze = (t) => (A(t) ? t.offsetWidth > 0 || t.offsetHeight > 0 || t.getClientRects().length > 0 : !1);
function mt(t) {
	if (!t) return !1;
	const e = t.getRootNode();
	return ne(e) === t;
}
var Xe = /(textarea|select)/;
function fs(t) {
	if (t == null || !A(t)) return !1;
	try {
		return (
			(Ge(t) && t.selectionStart != null) ||
			Xe.test(t.localName) ||
			t.isContentEditable ||
			t.getAttribute('contenteditable') === 'true' ||
			t.getAttribute('contenteditable') === ''
		);
	} catch {
		return !1;
	}
}
function X(t, e) {
	if (!t || !e || !A(t) || !A(e)) return !1;
	const n = e.getRootNode?.();
	if (t === e || t.contains(e)) return !0;
	if (n && H(n)) {
		let r = e;
		for (; r; ) {
			if (t === r) return !0;
			r = r.parentNode || r.host;
		}
	}
	return !1;
}
function $(t) {
	return Et(t) ? t : Ue(t) ? t.document : (t?.ownerDocument ?? document);
}
function Ye(t) {
	return $(t).documentElement;
}
function D(t) {
	return H(t) ? D(t.host) : Et(t) ? (t.defaultView ?? window) : A(t) ? (t.ownerDocument?.defaultView ?? window) : window;
}
function ne(t) {
	let e = t.activeElement;
	for (; e?.shadowRoot; ) {
		const n = e.shadowRoot.activeElement;
		if (!n || n === e) break;
		e = n;
	}
	return e;
}
function Ze(t) {
	if (ee(t) === 'html') return t;
	const e = t.assignedSlot || t.parentNode || (H(t) && t.host) || Ye(t);
	return H(e) ? e.host : e;
}
function Qe(t) {
	let e;
	try {
		if (((e = t.getRootNode({ composed: !0 })), Et(e) || H(e))) return e;
	} catch {}
	return t.ownerDocument ?? document;
}
var dt = new WeakMap();
function ds(t) {
	return (dt.has(t) || dt.set(t, D(t).getComputedStyle(t)), dt.get(t));
}
var Je = new Set(['menu', 'listbox', 'dialog', 'grid', 'tree', 'region']),
	tn = (t) => Je.has(t),
	en = (t) => t.getAttribute('aria-controls')?.split(' ') || [];
function nn(t, e) {
	const n = new Set(),
		r = Qe(t),
		s = (i) => {
			const a = i.querySelectorAll('[aria-controls]');
			for (const o of a) {
				if (o.getAttribute('aria-expanded') !== 'true') continue;
				const c = en(o);
				for (const f of c) {
					if (!f || n.has(f)) continue;
					n.add(f);
					const u = r.getElementById(f);
					if (u) {
						const h = u.getAttribute('role'),
							m = u.getAttribute('aria-modal') === 'true';
						if (h && tn(h) && !m && (u === e || u.contains(e) || s(u))) return !0;
					}
				}
			}
			return !1;
		};
	return s(t);
}
var st = () => typeof document < 'u';
function rn() {
	return navigator.userAgentData?.platform ?? navigator.platform;
}
function sn() {
	const t = navigator.userAgentData;
	return t && Array.isArray(t.brands) ? t.brands.map(({ brand: e, version: n }) => `${e}/${n}`).join(' ') : navigator.userAgent;
}
var bt = (t) => st() && t.test(rn()),
	re = (t) => st() && t.test(sn()),
	on = (t) => st() && t.test(navigator.vendor),
	kt = () => st() && !!navigator.maxTouchPoints,
	an = () => bt(/^iPhone/i),
	un = () => bt(/^iPad/i) || (it() && navigator.maxTouchPoints > 1),
	cn = () => an() || un(),
	ln = () => it() || cn(),
	it = () => bt(/^Mac/i),
	hs = () => ln() && on(/apple/i),
	fn = () => re(/Firefox/i),
	dn = () => re(/Android/i);
function hn(t) {
	return t.composedPath?.() ?? t.nativeEvent?.composedPath?.();
}
function et(t) {
	return hn(t)?.[0] ?? t.target;
}
function gs(t) {
	const e = t.currentTarget;
	if (!e || !e.matches("a[href], button[type='submit'], input[type='submit']")) return !1;
	const r = t.button === 1,
		s = gn(t);
	return r || s;
}
function ps(t) {
	const e = t.currentTarget;
	if (!e) return !1;
	const n = e.localName;
	return t.altKey ? n === 'a' || (n === 'button' && e.type === 'submit') || (n === 'input' && e.type === 'submit') : !1;
}
function ms(t) {
	return vn(t).isComposing || t.keyCode === 229;
}
function gn(t) {
	return it() ? t.metaKey : t.ctrlKey;
}
function ys(t) {
	return t.key.length === 1 && !t.ctrlKey && !t.metaKey;
}
function vs(t) {
	return t.pointerType === '' && t.isTrusted ? !0 : dn() && t.pointerType ? t.type === 'click' && t.buttons === 1 : t.detail === 0 && !t.pointerType;
}
var Es = (t) => t.button === 0,
	pn = (t) => t.button === 2 || (it() && t.ctrlKey && t.button === 0),
	bs = (t) => t.ctrlKey || t.altKey || t.metaKey,
	mn = (t) => 'touches' in t && t.touches.length > 0,
	yn = { Up: 'ArrowUp', Down: 'ArrowDown', Esc: 'Escape', ' ': 'Space', ',': 'Comma', Left: 'ArrowLeft', Right: 'ArrowRight' },
	Mt = { ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft' };
function Ss(t, e = {}) {
	const { dir: n = 'ltr', orientation: r = 'horizontal' } = e;
	let s = t.key;
	return ((s = yn[s] ?? s), n === 'rtl' && r === 'horizontal' && s in Mt && (s = Mt[s]), s);
}
function vn(t) {
	return t.nativeEvent ?? t;
}
function Ts(t, e = 'client') {
	const n = mn(t) ? t.touches[0] || t.changedTouches[0] : t;
	return { x: n[`${e}X`], y: n[`${e}Y`] };
}
var j = (t, e, n, r) => {
	const s = typeof t == 'function' ? t() : t;
	return (
		s?.addEventListener(e, n, r),
		() => {
			s?.removeEventListener(e, n, r);
		}
	);
};
function En(t, e) {
	const { type: n = 'HTMLInputElement', property: r = 'value' } = e,
		s = D(t)[n].prototype;
	return Object.getOwnPropertyDescriptor(s, r) ?? {};
}
function bn(t) {
	if (t.localName === 'input') return 'HTMLInputElement';
	if (t.localName === 'textarea') return 'HTMLTextAreaElement';
	if (t.localName === 'select') return 'HTMLSelectElement';
}
function Sn(t, e, n = 'value') {
	if (!t) return;
	const r = bn(t);
	(r && En(t, { type: r, property: n }).set?.call(t, e), t.setAttribute(n, e));
}
function ws(t, e) {
	const { value: n, bubbles: r = !0 } = e;
	if (!t) return;
	const s = D(t);
	t instanceof s.HTMLInputElement && (Sn(t, `${n}`), t.dispatchEvent(new s.Event('input', { bubbles: r })));
}
function Tn(t) {
	return wn(t) ? t.form : t.closest('form');
}
function wn(t) {
	return t.matches('textarea, input, select, button');
}
function xn(t, e) {
	if (!t) return;
	const n = Tn(t),
		r = (s) => {
			s.defaultPrevented || e();
		};
	return (n?.addEventListener('reset', r, { passive: !0 }), () => n?.removeEventListener('reset', r));
}
function An(t, e) {
	const n = t?.closest('fieldset');
	if (!n) return;
	e(n.disabled);
	const r = D(n),
		s = new r.MutationObserver(() => e(n.disabled));
	return (s.observe(n, { attributes: !0, attributeFilter: ['disabled'] }), () => s.disconnect());
}
function xs(t, e) {
	if (!t) return;
	const { onFieldsetDisabledChange: n, onFormReset: r } = e,
		s = [xn(t, r), An(t, n)];
	return () => s.forEach((i) => i?.());
}
var se = (t) => A(t) && t.tagName === 'IFRAME';
function On(t) {
	const e = t.getAttribute('tabindex');
	return e ? parseInt(e, 10) : NaN;
}
var Ln = (t) => On(t) < 0;
function In(t, e) {
	if (!e) return null;
	if (e === !0) return t.shadowRoot || null;
	const n = e(t);
	return (n === !0 ? t.shadowRoot : n) || null;
}
function ie(t, e, n) {
	const r = [...t],
		s = [...t],
		i = new Set(),
		a = new Map();
	t.forEach((c, f) => a.set(c, f));
	let o = 0;
	for (; o < s.length; ) {
		const c = s[o++];
		if (!c || i.has(c)) continue;
		i.add(c);
		const f = In(c, e);
		if (f) {
			const u = Array.from(f.querySelectorAll(ot)).filter(n),
				h = a.get(c);
			if (h !== void 0) {
				const m = h + 1;
				(r.splice(m, 0, ...u),
					u.forEach((g, v) => {
						a.set(g, m + v);
					}));
				for (let g = m + u.length; g < r.length; g++) a.set(r[g], g);
			} else {
				const m = r.length;
				(r.push(...u),
					u.forEach((g, v) => {
						a.set(g, m + v);
					}));
			}
			s.push(...u);
		}
	}
	return r;
}
var ot =
		"input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], button:not([disabled]), [tabindex], iframe, object, embed, area[href], audio[controls], video[controls], [contenteditable]:not([contenteditable='false']), details > summary:first-of-type",
	Pn = (t, e = {}) => {
		if (!t) return [];
		const { includeContainer: n = !1, getShadowRoot: r } = e,
			s = Array.from(t.querySelectorAll(ot));
		(n == !0 || (n == 'if-empty' && s.length === 0)) && A(t) && U(t) && s.unshift(t);
		const a = [];
		for (const o of s)
			if (U(o)) {
				if (se(o) && o.contentDocument) {
					const c = o.contentDocument.body;
					a.push(...Pn(c, { getShadowRoot: r }));
					continue;
				}
				a.push(o);
			}
		return r ? ie(a, r, U) : a;
	};
function U(t) {
	return !A(t) || t.closest('[inert]') ? !1 : t.matches(ot) && ze(t);
}
function St(t, e = {}) {
	if (!t) return [];
	const { includeContainer: n, getShadowRoot: r } = e,
		s = Array.from(t.querySelectorAll(ot));
	n && ht(t) && s.unshift(t);
	const i = [];
	for (const a of s)
		if (ht(a)) {
			if (se(a) && a.contentDocument) {
				const o = a.contentDocument.body;
				i.push(...St(o, { getShadowRoot: r }));
				continue;
			}
			i.push(a);
		}
	if (r) {
		const a = ie(i, r, ht);
		return !a.length && n ? s : a;
	}
	return !i.length && n ? s : i;
}
function ht(t) {
	return A(t) && t.tabIndex > 0 ? !0 : U(t) && !Ln(t);
}
function Dn(t, e = {}) {
	const n = St(t, e),
		r = n[0] || null,
		s = n[n.length - 1] || null;
	return [r, s];
}
function As(t) {
	const { root: e, getInitialEl: n, filter: r, enabled: s = !0 } = t;
	if (!s) return;
	let i = null;
	if ((i || (i = typeof n == 'function' ? n() : n), i || (i = e?.querySelector('[data-autofocus],[autofocus]')), !i)) {
		const a = St(e);
		i = r ? a.filter(r)[0] : a[0];
	}
	return i || e || void 0;
}
function Os(t) {
	const e = t.currentTarget;
	if (!e) return !1;
	const [n, r] = Dn(e);
	return !((mt(n) && t.shiftKey) || (mt(r) && !t.shiftKey) || (!n && !r));
}
var oe = class ae {
	constructor() {
		(ft(this, 'id', null),
			ft(this, 'fn_cleanup'),
			ft(this, 'cleanup', () => {
				this.cancel();
			}));
	}
	static create() {
		return new ae();
	}
	request(e) {
		(this.cancel(),
			(this.id = globalThis.requestAnimationFrame(() => {
				((this.id = null), (this.fn_cleanup = e?.()));
			})));
	}
	cancel() {
		(this.id !== null && (globalThis.cancelAnimationFrame(this.id), (this.id = null)), this.fn_cleanup?.(), (this.fn_cleanup = void 0));
	}
	isActive() {
		return this.id !== null;
	}
};
function M(t) {
	const e = oe.create();
	return (e.request(t), e.cleanup);
}
function kn(t, e, n) {
	const r = M(() => {
			(t.removeEventListener(e, s, !0), n());
		}),
		s = () => {
			(r(), n());
		};
	return (t.addEventListener(e, s, { once: !0, capture: !0 }), r);
}
function Mn(t, e) {
	if (!t) return;
	const { attributes: n, callback: r } = e,
		s = t.ownerDocument.defaultView || window,
		i = new s.MutationObserver((a) => {
			for (const o of a) o.type === 'attributes' && o.attributeName && n.includes(o.attributeName) && r(o);
		});
	return (i.observe(t, { attributes: !0, attributeFilter: n }), () => i.disconnect());
}
function Ls(t, e) {
	const { defer: n } = e,
		r = n ? M : (i) => i(),
		s = [];
	return (
		s.push(
			r(() => {
				const i = typeof t == 'function' ? t() : t;
				s.push(Mn(i, e));
			})
		),
		() => {
			s.forEach((i) => i?.());
		}
	);
}
function Cn(t, e) {
	const { callback: n } = e;
	if (!t) return;
	const r = t.ownerDocument.defaultView || window,
		s = new r.MutationObserver(n);
	return (s.observe(t, { childList: !0, subtree: !0 }), () => s.disconnect());
}
function Is(t, e) {
	const { defer: n } = e,
		r = n ? M : (i) => i(),
		s = [];
	return (
		s.push(
			r(() => {
				const i = typeof t == 'function' ? t() : t;
				s.push(Cn(i, e));
			})
		),
		() => {
			s.forEach((i) => i?.());
		}
	);
}
function Ps(t) {
	const e = () => {
		const n = D(t);
		t.dispatchEvent(new n.MouseEvent('click'));
	};
	fn() ? kn(t, 'keyup', e) : queueMicrotask(e);
}
function nt(t) {
	const e = Ze(t);
	return He(e) ? $(e).body : A(e) && Tt(e) ? e : nt(e);
}
function Nn(t, e = []) {
	const n = nt(t),
		r = n === t.ownerDocument.body,
		s = D(n);
	return r ? e.concat(s, s.visualViewport || [], Tt(n) ? n : []) : e.concat(n, Nn(n, []));
}
var Rn = /auto|scroll|overlay|hidden|clip/,
	_n = new Set(['inline', 'contents']);
function Tt(t) {
	const e = D(t),
		{ overflow: n, overflowX: r, overflowY: s, display: i } = e.getComputedStyle(t);
	return Rn.test(n + s + r) && !_n.has(i);
}
function Fn(t) {
	return t.scrollHeight > t.clientHeight || t.scrollWidth > t.clientWidth;
}
function Ds(t, e) {
	const { rootEl: n, ...r } = e || {};
	!t || !n || !Tt(n) || !Fn(n) || t.scrollIntoView(r);
}
function ks(t, e) {
	const { left: n, top: r, width: s, height: i } = e.getBoundingClientRect(),
		a = { x: t.x - n, y: t.y - r },
		o = { x: Dt(a.x / s), y: Dt(a.y / i) };
	function c(f = {}) {
		const { dir: u = 'ltr', orientation: h = 'horizontal', inverted: m } = f,
			g = typeof m == 'object' ? m.x : m,
			v = typeof m == 'object' ? m.y : m;
		return h === 'horizontal' ? (u === 'rtl' || g ? 1 - o.x : o.x) : v ? 1 - o.y : o.y;
	}
	return { offset: a, percent: o, getPercentValue: c };
}
function Ms(t, e) {
	return Array.from(t?.querySelectorAll(e) ?? []);
}
function Cs(t, e) {
	return t?.querySelector(e) ?? null;
}
var wt = (t) => t.id;
function Bn(t, e, n = wt) {
	return t.find((r) => n(r) === e);
}
function xt(t, e, n = wt) {
	const r = Bn(t, e, n);
	return r ? t.indexOf(r) : -1;
}
function Ns(t, e, n = !0) {
	let r = xt(t, e);
	return ((r = n ? (r + 1) % t.length : Math.min(r + 1, t.length - 1)), t[r]);
}
function Rs(t, e, n = !0) {
	let r = xt(t, e);
	return r === -1 ? (n ? t[t.length - 1] : null) : ((r = n ? (r - 1 + t.length) % t.length : Math.max(0, r - 1)), t[r]);
}
function $n(t) {
	const e = new WeakMap();
	let n;
	const r = new WeakMap(),
		s = (o) =>
			n ||
			((n = new o.ResizeObserver((c) => {
				for (const f of c) {
					r.set(f.target, f);
					const u = e.get(f.target);
					if (u) for (const h of u) h(f);
				}
			})),
			n);
	return {
		observe: (o, c) => {
			let f = e.get(o) || new Set();
			(f.add(c), e.set(o, f));
			const u = D(o);
			return (
				s(u).observe(o, t),
				() => {
					const h = e.get(o);
					h && (h.delete(c), h.size === 0 && (e.delete(o), s(u).unobserve(o)));
				}
			);
		},
		unobserve: (o) => {
			(e.delete(o), n?.unobserve(o));
		}
	};
}
var _s = $n({ box: 'border-box' }),
	Vn = (t) =>
		t
			.split('')
			.map((e) => {
				const n = e.charCodeAt(0);
				return n > 0 && n < 128 ? e : n >= 128 && n <= 255 ? `/x${n.toString(16)}`.replace('/', '\\') : '';
			})
			.join('')
			.trim(),
	Wn = (t) => Vn(t.dataset?.valuetext ?? t.textContent ?? ''),
	Kn = (t, e) => t.trim().toLowerCase().startsWith(e.toLowerCase());
function jn(t, e, n, r = wt) {
	const s = n ? xt(t, n, r) : -1;
	let i = n ? Be(t, s) : t;
	return (e.length === 1 && (i = i.filter((o) => r(o) !== n)), i.find((o) => Kn(Wn(o), e)));
}
function Un(t, e) {
	if (!t) return $e;
	const n = Object.keys(e).reduce((r, s) => ((r[s] = t.style.getPropertyValue(s)), r), {});
	return (
		Object.assign(t.style, e),
		() => {
			(Object.assign(t.style, n), t.style.length === 0 && t.removeAttribute('style'));
		}
	);
}
function Hn(t, e) {
	const { state: n, activeId: r, key: s, timeout: i = 350, itemToId: a } = e,
		o = n.keysSoFar + s,
		f = o.length > 1 && Array.from(o).every((v) => v === o[0]) ? o[0] : o;
	let u = t.slice();
	const h = jn(u, f, r, a);
	function m() {
		(clearTimeout(n.timer), (n.timer = -1));
	}
	function g(v) {
		((n.keysSoFar = v),
			m(),
			v !== '' &&
				(n.timer = +setTimeout(() => {
					(g(''), m());
				}, i)));
	}
	return (g(o), h);
}
var Fs = Object.assign(Hn, { defaultOptions: { keysSoFar: '', timer: -1 }, isValidEvent: qn });
function qn(t) {
	return t.key.length === 1 && !t.ctrlKey && !t.metaKey;
}
var Bs = {
	border: '0',
	clip: 'rect(0 0 0 0)',
	height: '1px',
	margin: '-1px',
	overflow: 'hidden',
	padding: '0',
	position: 'absolute',
	width: '1px',
	whiteSpace: 'nowrap',
	wordWrap: 'normal'
};
function Gn(t, e, n) {
	const { signal: r } = e;
	return [
		new Promise((a, o) => {
			const c = setTimeout(() => {
				o(new Error(`Timeout of ${n}ms exceeded`));
			}, n);
			(r.addEventListener('abort', () => {
				(clearTimeout(c), o(new Error('Promise aborted')));
			}),
				t
					.then((f) => {
						r.aborted || (clearTimeout(c), a(f));
					})
					.catch((f) => {
						r.aborted || (clearTimeout(c), o(f));
					}));
		}),
		() => e.abort()
	];
}
function zn(t, e) {
	const { timeout: n, rootNode: r } = e,
		s = D(r),
		i = $(r),
		a = new s.AbortController();
	return Gn(
		new Promise((o) => {
			const c = t();
			if (c) {
				o(c);
				return;
			}
			const f = new s.MutationObserver(() => {
				const u = t();
				u && u.isConnected && (f.disconnect(), o(u));
			});
			f.observe(i.body, { childList: !0, subtree: !0 });
		}),
		a,
		n
	);
}
var Xn = (...t) =>
		t
			.map((e) => e?.trim?.())
			.filter(Boolean)
			.join(' '),
	Yn = /((?:--)?(?:\w+-?)+)\s*:\s*([^;]*)/g,
	Ct = (t) => {
		const e = {};
		let n;
		for (; (n = Yn.exec(t)); ) e[n[1]] = n[2];
		return e;
	},
	Zn = (t, e) => {
		if (ct(t)) {
			if (ct(e)) return `${t};${e}`;
			t = Ct(t);
		} else ct(e) && (e = Ct(e));
		return Object.assign({}, t ?? {}, e ?? {});
	};
function $s(...t) {
	let e = {};
	for (let n of t) {
		if (!n) continue;
		for (let s in e) {
			if (s.startsWith('on') && typeof e[s] == 'function' && typeof n[s] == 'function') {
				e[s] = pt(n[s], e[s]);
				continue;
			}
			if (s === 'className' || s === 'class') {
				e[s] = Xn(e[s], n[s]);
				continue;
			}
			if (s === 'style') {
				e[s] = Zn(e[s], n[s]);
				continue;
			}
			e[s] = n[s] !== void 0 ? n[s] : e[s];
		}
		for (let s in n) e[s] === void 0 && (e[s] = n[s]);
		const r = Object.getOwnPropertySymbols(n);
		for (let s of r) e[s] = n[s];
	}
	return e;
}
function Vs(t, e, n) {
	let r = [],
		s;
	return (i) => {
		const a = t(i);
		return ((a.length !== r.length || a.some((c, f) => !yt(r[f], c))) && ((r = a), (s = e(a, i))), s);
	};
}
function ue() {
	return {
		and: (...t) =>
			function (n) {
				return t.every((r) => n.guard(r));
			},
		or: (...t) =>
			function (n) {
				return t.some((r) => n.guard(r));
			},
		not: (t) =>
			function (n) {
				return !n.guard(t);
			}
	};
}
function Ws(t) {
	return t;
}
function Qn() {
	return {
		guards: ue(),
		createMachine: (t) => t,
		choose: (t) =>
			function ({ choose: n }) {
				return n(t)?.actions;
			}
	};
}
var Jn = ((t) => ((t.NotStarted = 'Not Started'), (t.Started = 'Started'), (t.Stopped = 'Stopped'), t))(Jn || {}),
	Ks = '__init__';
function js(t) {
	const e = () => t.getRootNode?.() ?? document,
		n = () => $(e());
	return {
		...t,
		getRootNode: e,
		getDoc: n,
		getWin: () => n().defaultView ?? window,
		getActiveElement: () => ne(e()),
		isActiveElement: mt,
		getById: (a) => e().getElementById(a)
	};
}
var z = (t, e = []) => ({
		parts: (...n) => {
			if (tr(e)) return z(t, n);
			throw new Error('createAnatomy().parts(...) should only be called once. Did you mean to use .extendWith(...) ?');
		},
		extendWith: (...n) => z(t, [...e, ...n]),
		omit: (...n) =>
			z(
				t,
				e.filter((r) => !n.includes(r))
			),
		rename: (n) => z(n, e),
		keys: () => e,
		build: () =>
			[...new Set(e)].reduce(
				(n, r) =>
					Object.assign(n, {
						[r]: {
							selector: [`&[data-scope="${W(t)}"][data-part="${W(r)}"]`, `& [data-scope="${W(t)}"][data-part="${W(r)}"]`].join(', '),
							attrs: { 'data-scope': W(t), 'data-part': W(r) }
						}
					}),
				{}
			)
	}),
	W = (t) =>
		t
			.replace(/([A-Z])([A-Z])/g, '$1-$2')
			.replace(/([a-z])([A-Z])/g, '$1-$2')
			.replace(/[\s_]+/g, '-')
			.toLowerCase(),
	tr = (t) => t.length === 0;
function er(t) {
	const e = {
		each(n) {
			for (let r = 0; r < t.frames?.length; r += 1) {
				const s = t.frames[r];
				s && n(s);
			}
		},
		addEventListener(n, r, s) {
			return (
				e.each((i) => {
					try {
						i.document.addEventListener(n, r, s);
					} catch {}
				}),
				() => {
					try {
						e.removeEventListener(n, r, s);
					} catch {}
				}
			);
		},
		removeEventListener(n, r, s) {
			e.each((i) => {
				try {
					i.document.removeEventListener(n, r, s);
				} catch {}
			});
		}
	};
	return e;
}
function nr(t) {
	const e = t.frameElement != null ? t.parent : null;
	return {
		addEventListener: (n, r, s) => {
			try {
				e?.addEventListener(n, r, s);
			} catch {}
			return () => {
				try {
					e?.removeEventListener(n, r, s);
				} catch {}
			};
		},
		removeEventListener: (n, r, s) => {
			try {
				e?.removeEventListener(n, r, s);
			} catch {}
		}
	};
}
var Nt = 'pointerdown.outside',
	Rt = 'focus.outside';
function rr(t) {
	for (const e of t) if (A(e) && U(e)) return !0;
	return !1;
}
var ce = (t) => 'clientY' in t;
function sr(t, e) {
	if (!ce(e) || !t) return !1;
	const n = t.getBoundingClientRect();
	return n.width === 0 || n.height === 0
		? !1
		: n.top <= e.clientY && e.clientY <= n.top + n.height && n.left <= e.clientX && e.clientX <= n.left + n.width;
}
function ir(t, e) {
	return t.y <= e.y && e.y <= t.y + t.height && t.x <= e.x && e.x <= t.x + t.width;
}
function _t(t, e) {
	if (!e || !ce(t)) return !1;
	const n = e.scrollHeight > e.clientHeight,
		r = n && t.clientX > e.offsetLeft + e.clientWidth,
		s = e.scrollWidth > e.clientWidth,
		i = s && t.clientY > e.offsetTop + e.clientHeight,
		a = { x: e.offsetLeft, y: e.offsetTop, width: e.clientWidth + (n ? 16 : 0), height: e.clientHeight + (s ? 16 : 0) },
		o = { x: t.clientX, y: t.clientY };
	return ir(a, o) ? r || i : !1;
}
function or(t, e) {
	const { exclude: n, onFocusOutside: r, onPointerDownOutside: s, onInteractOutside: i, defer: a, followControlledElements: o = !0 } = e;
	if (!t) return;
	const c = $(t),
		f = D(t),
		u = er(f),
		h = nr(f);
	function m(b, E) {
		if (!A(E) || !E.isConnected || X(t, E) || sr(t, b) || (o && nn(t, E))) return !1;
		const L = c.querySelector(`[aria-controls="${t.id}"]`);
		if (L) {
			const N = nt(L);
			if (_t(b, N)) return !1;
		}
		const R = nt(t);
		return _t(b, R) ? !1 : !n?.(E);
	}
	const g = new Set(),
		v = H(t?.getRootNode());
	function p(b) {
		function E(L) {
			const R = a && !kt() ? M : (q) => q(),
				N = L ?? b,
				at = N?.composedPath?.() ?? [N?.target];
			R(() => {
				const q = v ? at[0] : et(b);
				if (!(!t || !m(b, q))) {
					if (s || i) {
						const At = pt(s, i);
						t.addEventListener(Nt, At, { once: !0 });
					}
					Ft(t, Nt, { bubbles: !1, cancelable: !0, detail: { originalEvent: N, contextmenu: pn(N), focusable: rr(at), target: q } });
				}
			});
		}
		b.pointerType === 'touch'
			? (g.forEach((L) => L()),
				g.add(j(c, 'click', E, { once: !0 })),
				g.add(h.addEventListener('click', E, { once: !0 })),
				g.add(u.addEventListener('click', E, { once: !0 })))
			: E();
	}
	const S = new Set(),
		C = setTimeout(() => {
			(S.add(j(c, 'pointerdown', p, !0)), S.add(h.addEventListener('pointerdown', p, !0)), S.add(u.addEventListener('pointerdown', p, !0)));
		}, 0);
	function I(b) {
		(a ? M : (L) => L())(() => {
			const L = b?.composedPath?.() ?? [b?.target],
				R = v ? L[0] : et(b);
			if (!(!t || !m(b, R))) {
				if (r || i) {
					const N = pt(r, i);
					t.addEventListener(Rt, N, { once: !0 });
				}
				Ft(t, Rt, { bubbles: !1, cancelable: !0, detail: { originalEvent: b, contextmenu: !1, focusable: U(R), target: R } });
			}
		});
	}
	return (
		kt() || (S.add(j(c, 'focusin', I, !0)), S.add(h.addEventListener('focusin', I, !0)), S.add(u.addEventListener('focusin', I, !0))),
		() => {
			(clearTimeout(C), g.forEach((b) => b()), S.forEach((b) => b()));
		}
	);
}
function ar(t, e) {
	const { defer: n } = e,
		r = n ? M : (i) => i(),
		s = [];
	return (
		s.push(
			r(() => {
				const i = typeof t == 'function' ? t() : t;
				s.push(or(i, e));
			})
		),
		() => {
			s.forEach((i) => i?.());
		}
	);
}
function Ft(t, e, n) {
	const r = t.ownerDocument.defaultView || window,
		s = new r.CustomEvent(e, n);
	return t.dispatchEvent(s);
}
function ur(t, e) {
	const n = (r) => {
		r.key === 'Escape' && (r.isComposing || e?.(r));
	};
	return j($(t), 'keydown', n, { capture: !0 });
}
var Bt = 'layer:request-dismiss',
	O = {
		layers: [],
		branches: [],
		count() {
			return this.layers.length;
		},
		pointerBlockingLayers() {
			return this.layers.filter((t) => t.pointerBlocking);
		},
		topMostPointerBlockingLayer() {
			return [...this.pointerBlockingLayers()].slice(-1)[0];
		},
		hasPointerBlockingLayer() {
			return this.pointerBlockingLayers().length > 0;
		},
		isBelowPointerBlockingLayer(t) {
			const e = this.indexOf(t),
				n = this.topMostPointerBlockingLayer() ? this.indexOf(this.topMostPointerBlockingLayer()?.node) : -1;
			return e < n;
		},
		isTopMost(t) {
			return this.layers[this.count() - 1]?.node === t;
		},
		getNestedLayers(t) {
			return Array.from(this.layers).slice(this.indexOf(t) + 1);
		},
		getLayersByType(t) {
			return this.layers.filter((e) => e.type === t);
		},
		getNestedLayersByType(t, e) {
			const n = this.indexOf(t);
			return n === -1 ? [] : this.layers.slice(n + 1).filter((r) => r.type === e);
		},
		getParentLayerOfType(t, e) {
			const n = this.indexOf(t);
			if (!(n <= 0))
				return this.layers
					.slice(0, n)
					.reverse()
					.find((r) => r.type === e);
		},
		countNestedLayersOfType(t, e) {
			return this.getNestedLayersByType(t, e).length;
		},
		isInNestedLayer(t, e) {
			return this.getNestedLayers(t).some((n) => X(n.node, e));
		},
		isInBranch(t) {
			return Array.from(this.branches).some((e) => X(e, t));
		},
		add(t) {
			(this.layers.push(t), this.syncLayers());
		},
		addBranch(t) {
			this.branches.push(t);
		},
		remove(t) {
			const e = this.indexOf(t);
			e < 0 || (e < this.count() - 1 && this.getNestedLayers(t).forEach((r) => O.dismiss(r.node, t)), this.layers.splice(e, 1), this.syncLayers());
		},
		removeBranch(t) {
			const e = this.branches.indexOf(t);
			e >= 0 && this.branches.splice(e, 1);
		},
		syncLayers() {
			this.layers.forEach((t, e) => {
				(t.node.style.setProperty('--layer-index', `${e}`),
					t.node.removeAttribute('data-nested'),
					t.node.removeAttribute('data-has-nested'),
					this.getParentLayerOfType(t.node, t.type) && t.node.setAttribute('data-nested', t.type));
				const r = this.countNestedLayersOfType(t.node, t.type);
				(r > 0 && t.node.setAttribute('data-has-nested', t.type), t.node.style.setProperty('--nested-layer-count', `${r}`));
			});
		},
		indexOf(t) {
			return this.layers.findIndex((e) => e.node === t);
		},
		dismiss(t, e) {
			const n = this.indexOf(t);
			if (n === -1) return;
			const r = this.layers[n];
			(lr(t, Bt, (s) => {
				(r.requestDismiss?.(s), s.defaultPrevented || r?.dismiss());
			}),
				cr(t, Bt, { originalLayer: t, targetLayer: e, originalIndex: n, targetIndex: e ? this.indexOf(e) : -1 }),
				this.syncLayers());
		},
		clear() {
			this.remove(this.layers[0].node);
		}
	};
function cr(t, e, n) {
	const r = t.ownerDocument.defaultView || window,
		s = new r.CustomEvent(e, { cancelable: !0, bubbles: !0, detail: n });
	return t.dispatchEvent(s);
}
function lr(t, e, n) {
	t.addEventListener(e, n, { once: !0 });
}
var $t;
function Vt() {
	O.layers.forEach(({ node: t }) => {
		t.style.pointerEvents = O.isBelowPointerBlockingLayer(t) ? 'none' : 'auto';
	});
}
function fr(t) {
	t.style.pointerEvents = '';
}
function dr(t, e) {
	const n = $(t),
		r = [];
	return (
		O.hasPointerBlockingLayer() &&
			!n.body.hasAttribute('data-inert') &&
			(($t = document.body.style.pointerEvents),
			queueMicrotask(() => {
				((n.body.style.pointerEvents = 'none'), n.body.setAttribute('data-inert', ''));
			})),
		e?.forEach((s) => {
			const [i, a] = zn(
				() => {
					const o = s();
					return A(o) ? o : null;
				},
				{ timeout: 1e3 }
			);
			(i.then((o) => r.push(Un(o, { pointerEvents: 'auto' }))), r.push(a));
		}),
		() => {
			O.hasPointerBlockingLayer() ||
				(queueMicrotask(() => {
					((n.body.style.pointerEvents = $t), n.body.removeAttribute('data-inert'), n.body.style.length === 0 && n.body.removeAttribute('style'));
				}),
				r.forEach((s) => s()));
		}
	);
}
function hr(t, e) {
	const { warnOnMissingNode: n = !0 } = e;
	if (n && !t) {
		vt('[@zag-js/dismissable] node is `null` or `undefined`');
		return;
	}
	if (!t) return;
	const { onDismiss: r, onRequestDismiss: s, pointerBlocking: i, exclude: a, debug: o, type: c = 'dialog' } = e,
		f = { dismiss: r, node: t, type: c, pointerBlocking: i, requestDismiss: s };
	(O.add(f), Vt());
	function u(p) {
		const S = et(p.detail.originalEvent);
		O.isBelowPointerBlockingLayer(t) ||
			O.isInBranch(S) ||
			(e.onPointerDownOutside?.(p),
			e.onInteractOutside?.(p),
			!p.defaultPrevented && (o && console.log('onPointerDownOutside:', p.detail.originalEvent), r?.()));
	}
	function h(p) {
		const S = et(p.detail.originalEvent);
		O.isInBranch(S) ||
			(e.onFocusOutside?.(p), e.onInteractOutside?.(p), !p.defaultPrevented && (o && console.log('onFocusOutside:', p.detail.originalEvent), r?.()));
	}
	function m(p) {
		O.isTopMost(t) && (e.onEscapeKeyDown?.(p), !p.defaultPrevented && r && (p.preventDefault(), r()));
	}
	function g(p) {
		if (!t) return !1;
		const S = typeof a == 'function' ? a() : a,
			C = Array.isArray(S) ? S : [S],
			I = e.persistentElements?.map((b) => b()).filter(A);
		return (I && C.push(...I), C.some((b) => X(b, p)) || O.isInNestedLayer(t, p));
	}
	const v = [i ? dr(t, e.persistentElements) : void 0, ur(t, m), ar(t, { exclude: g, onFocusOutside: h, onPointerDownOutside: u, defer: e.defer })];
	return () => {
		(O.remove(t), Vt(), fr(t), v.forEach((p) => p?.()));
	};
}
function Us(t, e) {
	const { defer: n } = e,
		r = n ? M : (i) => i(),
		s = [];
	return (
		s.push(
			r(() => {
				const i = Zt(t) ? t() : t;
				s.push(hr(i, e));
			})
		),
		() => {
			s.forEach((i) => i?.());
		}
	);
}
function gr(t, e = {}) {
	const { defer: n } = e,
		r = n ? M : (i) => i(),
		s = [];
	return (
		s.push(
			r(() => {
				const i = Zt(t) ? t() : t;
				if (!i) {
					vt('[@zag-js/dismissable] branch node is `null` or `undefined`');
					return;
				}
				(O.addBranch(i),
					s.push(() => {
						O.removeBranch(i);
					}));
			})
		),
		() => {
			s.forEach((i) => i?.());
		}
	);
}
var pr = z('toast').parts('group', 'root', 'title', 'description', 'actionTrigger', 'closeTrigger'),
	K = pr.build(),
	mr = (t) => `toast-group:${t}`,
	Wt = (t, e) => t.getById(`toast-group:${e}`),
	le = (t) => `toast:${t.id}`,
	Kt = (t) => t.getById(le(t)),
	jt = (t) => `toast:${t.id}:title`,
	Ut = (t) => `toast:${t.id}:description`,
	yr = (t) => `toast${t.id}:close`,
	Ht = { info: 5e3, error: 5e3, success: 2e3, loading: 1 / 0, DEFAULT: 5e3 };
function gt(t, e) {
	return t ?? Ht[e] ?? Ht.DEFAULT;
}
var vr = (t) => (typeof t == 'string' ? { left: t, right: t, bottom: t, top: t } : t);
function Er(t, e) {
	const { prop: n, computed: r, context: s } = t,
		{ offsets: i, gap: a } = n('store').attrs,
		o = s.get('heights'),
		c = vr(i),
		f = n('dir') === 'rtl',
		u = e.replace('-start', f ? '-right' : '-left').replace('-end', f ? '-left' : '-right'),
		h = u.includes('right'),
		m = u.includes('left'),
		g = {
			position: 'fixed',
			pointerEvents: r('count') > 0 ? void 0 : 'none',
			display: 'flex',
			flexDirection: 'column',
			'--gap': `${a}px`,
			'--first-height': `${o[0]?.height || 0}px`,
			'--viewport-offset-left': c.left,
			'--viewport-offset-right': c.right,
			'--viewport-offset-top': c.top,
			'--viewport-offset-bottom': c.bottom,
			zIndex: Ve
		};
	let v = 'center';
	if ((h && (v = 'flex-end'), m && (v = 'flex-start'), (g.alignItems = v), u.includes('top'))) {
		const p = c.top;
		g.top = `max(env(safe-area-inset-top, 0px), ${p})`;
	}
	if (u.includes('bottom')) {
		const p = c.bottom;
		g.bottom = `max(env(safe-area-inset-bottom, 0px), ${p})`;
	}
	if (!u.includes('left')) {
		const p = c.right;
		g.insetInlineEnd = `calc(env(safe-area-inset-right, 0px) + ${p})`;
	}
	if (!u.includes('right')) {
		const p = c.left;
		g.insetInlineStart = `calc(env(safe-area-inset-left, 0px) + ${p})`;
	}
	return g;
}
function br(t, e) {
	const { prop: n, context: r, computed: s } = t,
		i = n('parent'),
		a = i.computed('placement'),
		{ gap: o } = i.prop('store').attrs,
		[c] = a.split('-'),
		f = r.get('mounted'),
		u = r.get('remainingTime'),
		h = s('height'),
		m = s('frontmost'),
		g = !m,
		v = !n('stacked'),
		p = n('stacked'),
		C = n('type') === 'loading' ? Number.MAX_SAFE_INTEGER : u,
		I = s('heightIndex') * o + s('heightBefore'),
		b = {
			position: 'absolute',
			pointerEvents: 'auto',
			'--opacity': '0',
			'--remove-delay': `${n('removeDelay')}ms`,
			'--duration': `${C}ms`,
			'--initial-height': `${h}px`,
			'--offset': `${I}px`,
			'--index': n('index'),
			'--z-index': s('zIndex'),
			'--lift-amount': 'calc(var(--lift) * var(--gap))',
			'--y': '100%',
			'--x': '0'
		},
		E = (L) => Object.assign(b, L);
	return (
		c === 'top'
			? E({ top: '0', '--sign': '-1', '--y': '-100%', '--lift': '1' })
			: c === 'bottom' && E({ bottom: '0', '--sign': '1', '--y': '100%', '--lift': '-1' }),
		f && (E({ '--y': '0', '--opacity': '1' }), p && E({ '--y': 'calc(var(--lift) * var(--offset))', '--height': 'var(--initial-height)' })),
		e || E({ '--opacity': '0', pointerEvents: 'none' }),
		g &&
			v &&
			(E({
				'--base-scale': 'var(--index) * 0.05 + 1',
				'--y': 'calc(var(--lift-amount) * var(--index))',
				'--scale': 'calc(-1 * var(--base-scale))',
				'--height': 'var(--first-height)'
			}),
			e || E({ '--y': 'calc(var(--sign) * 40%)' })),
		g && p && !e && E({ '--y': 'calc(var(--lift) * var(--offset) + var(--lift) * -100%)' }),
		m && !e && E({ '--y': 'calc(var(--lift) * -100%)' }),
		b
	);
}
function Sr(t, e) {
	const { computed: n } = t,
		r = { position: 'absolute', inset: '0', scale: '1 2', pointerEvents: e ? 'none' : 'auto' },
		s = (i) => Object.assign(r, i);
	return (n('frontmost') && !e && s({ height: 'calc(var(--initial-height) + 80%)' }), r);
}
function Tr() {
	return { position: 'absolute', left: '0', height: 'calc(var(--gap) + 2px)', bottom: '100%', width: '100%' };
}
function wr(t, e) {
	const { context: n, prop: r, send: s, refs: i, computed: a } = t;
	return {
		getCount() {
			return n.get('toasts').length;
		},
		getToasts() {
			return n.get('toasts');
		},
		getGroupProps(o = {}) {
			const { label: c = 'Notifications' } = o,
				{ hotkey: f } = r('store').attrs,
				u = f.join('+').replace(/Key/g, '').replace(/Digit/g, ''),
				h = a('placement'),
				[m, g = 'center'] = h.split('-');
			return e.element({
				...K.group.attrs,
				dir: r('dir'),
				tabIndex: -1,
				'aria-label': `${h} ${c} ${u}`,
				id: mr(h),
				'data-placement': h,
				'data-side': m,
				'data-align': g,
				'aria-live': 'polite',
				role: 'region',
				style: Er(t, h),
				onMouseEnter() {
					i.get('ignoreMouseTimer').isActive() || s({ type: 'REGION.POINTER_ENTER', placement: h });
				},
				onMouseMove() {
					i.get('ignoreMouseTimer').isActive() || s({ type: 'REGION.POINTER_ENTER', placement: h });
				},
				onMouseLeave() {
					i.get('ignoreMouseTimer').isActive() || s({ type: 'REGION.POINTER_LEAVE', placement: h });
				},
				onFocus(v) {
					s({ type: 'REGION.FOCUS', target: v.relatedTarget });
				},
				onBlur(v) {
					i.get('isFocusWithin') && !X(v.currentTarget, v.relatedTarget) && queueMicrotask(() => s({ type: 'REGION.BLUR' }));
				}
			});
		},
		subscribe(o) {
			return r('store').subscribe(() => o(n.get('toasts')));
		}
	};
}
var { guards: xr, createMachine: Ar } = Qn(),
	{ and: Or } = xr,
	Lr = Ar({
		props({ props: t }) {
			return { dir: 'ltr', id: Jt(), ...t, store: t.store };
		},
		initialState({ prop: t }) {
			return t('store').attrs.overlap ? 'overlap' : 'stack';
		},
		refs() {
			return { lastFocusedEl: null, isFocusWithin: !1, isPointerWithin: !1, ignoreMouseTimer: oe.create(), dismissableCleanup: void 0 };
		},
		context({ bindable: t }) {
			return {
				toasts: t(() => ({ defaultValue: [], sync: !0, hash: (e) => e.map((n) => n.id).join(',') })),
				heights: t(() => ({ defaultValue: [], sync: !0 }))
			};
		},
		computed: {
			count: ({ context: t }) => t.get('toasts').length,
			overlap: ({ prop: t }) => t('store').attrs.overlap,
			placement: ({ prop: t }) => t('store').attrs.placement
		},
		effects: ['subscribeToStore', 'trackDocumentVisibility', 'trackHotKeyPress'],
		watch({ track: t, context: e, action: n }) {
			t([() => e.hash('toasts')], () => {
				queueMicrotask(() => {
					n(['collapsedIfEmpty', 'setDismissableBranch']);
				});
			});
		},
		exit: ['clearDismissableBranch', 'clearLastFocusedEl', 'clearMouseEventTimer'],
		on: {
			'DOC.HOTKEY': { actions: ['focusRegionEl'] },
			'REGION.BLUR': [
				{ guard: Or('isOverlapping', 'isPointerOut'), target: 'overlap', actions: ['collapseToasts', 'resumeToasts', 'restoreFocusIfPointerOut'] },
				{ guard: 'isPointerOut', target: 'stack', actions: ['resumeToasts', 'restoreFocusIfPointerOut'] },
				{ actions: ['clearFocusWithin'] }
			],
			'TOAST.REMOVE': { actions: ['removeToast', 'removeHeight', 'ignoreMouseEventsTemporarily'] },
			'TOAST.PAUSE': { actions: ['pauseToasts'] }
		},
		states: {
			stack: {
				on: {
					'REGION.POINTER_LEAVE': [
						{ guard: 'isOverlapping', target: 'overlap', actions: ['clearPointerWithin', 'resumeToasts', 'collapseToasts'] },
						{ actions: ['clearPointerWithin', 'resumeToasts'] }
					],
					'REGION.OVERLAP': { target: 'overlap', actions: ['collapseToasts'] },
					'REGION.FOCUS': { actions: ['setLastFocusedEl', 'pauseToasts'] },
					'REGION.POINTER_ENTER': { actions: ['setPointerWithin', 'pauseToasts'] }
				}
			},
			overlap: {
				on: {
					'REGION.STACK': { target: 'stack', actions: ['expandToasts'] },
					'REGION.POINTER_ENTER': { target: 'stack', actions: ['setPointerWithin', 'pauseToasts', 'expandToasts'] },
					'REGION.FOCUS': { target: 'stack', actions: ['setLastFocusedEl', 'pauseToasts', 'expandToasts'] }
				}
			}
		},
		implementations: {
			guards: { isOverlapping: ({ computed: t }) => t('overlap'), isPointerOut: ({ refs: t }) => !t.get('isPointerWithin') },
			effects: {
				subscribeToStore({ context: t, prop: e }) {
					return e('store').subscribe((n) => {
						if (n.dismiss) {
							t.set('toasts', (r) => r.filter((s) => s.id !== n.id));
							return;
						}
						t.set('toasts', (r) => {
							const s = r.findIndex((i) => i.id === n.id);
							return s !== -1 ? [...r.slice(0, s), { ...r[s], ...n }, ...r.slice(s + 1)] : [n, ...r];
						});
					});
				},
				trackHotKeyPress({ prop: t, send: e }) {
					return j(
						document,
						'keydown',
						(r) => {
							const { hotkey: s } = t('store').attrs;
							s.every((a) => r[a] || r.code === a) && e({ type: 'DOC.HOTKEY' });
						},
						{ capture: !0 }
					);
				},
				trackDocumentVisibility({ prop: t, send: e, scope: n }) {
					const { pauseOnPageIdle: r } = t('store').attrs;
					if (!r) return;
					const s = n.getDoc();
					return j(s, 'visibilitychange', () => {
						const i = s.visibilityState === 'hidden';
						e({ type: i ? 'PAUSE_ALL' : 'RESUME_ALL' });
					});
				}
			},
			actions: {
				setDismissableBranch({ refs: t, context: e, computed: n, scope: r }) {
					const s = e.get('toasts'),
						i = n('placement'),
						a = s.length > 0;
					if (!a) {
						t.get('dismissableCleanup')?.();
						return;
					}
					if (a && t.get('dismissableCleanup')) return;
					const c = gr(() => Wt(r, i), { defer: !0 });
					t.set('dismissableCleanup', c);
				},
				clearDismissableBranch({ refs: t }) {
					t.get('dismissableCleanup')?.();
				},
				focusRegionEl({ scope: t, computed: e }) {
					queueMicrotask(() => {
						Wt(t, e('placement'))?.focus();
					});
				},
				pauseToasts({ prop: t }) {
					t('store').pause();
				},
				resumeToasts({ prop: t }) {
					t('store').resume();
				},
				expandToasts({ prop: t }) {
					t('store').expand();
				},
				collapseToasts({ prop: t }) {
					t('store').collapse();
				},
				removeToast({ prop: t, event: e }) {
					t('store').remove(e.id);
				},
				removeHeight({ event: t, context: e }) {
					t?.id != null &&
						queueMicrotask(() => {
							e.set('heights', (n) => n.filter((r) => r.id !== t.id));
						});
				},
				collapsedIfEmpty({ send: t, computed: e }) {
					!e('overlap') || e('count') > 1 || t({ type: 'REGION.OVERLAP' });
				},
				setLastFocusedEl({ refs: t, event: e }) {
					t.get('isFocusWithin') || !e.target || (t.set('isFocusWithin', !0), t.set('lastFocusedEl', e.target));
				},
				restoreFocusIfPointerOut({ refs: t }) {
					!t.get('lastFocusedEl') ||
						t.get('isPointerWithin') ||
						(t.get('lastFocusedEl')?.focus({ preventScroll: !0 }), t.set('lastFocusedEl', null), t.set('isFocusWithin', !1));
				},
				setPointerWithin({ refs: t }) {
					t.set('isPointerWithin', !0);
				},
				clearPointerWithin({ refs: t }) {
					(t.set('isPointerWithin', !1),
						t.get('lastFocusedEl') &&
							!t.get('isFocusWithin') &&
							(t.get('lastFocusedEl')?.focus({ preventScroll: !0 }), t.set('lastFocusedEl', null)));
				},
				clearFocusWithin({ refs: t }) {
					t.set('isFocusWithin', !1);
				},
				clearLastFocusedEl({ refs: t }) {
					t.get('lastFocusedEl') && (t.get('lastFocusedEl')?.focus({ preventScroll: !0 }), t.set('lastFocusedEl', null), t.set('isFocusWithin', !1));
				},
				ignoreMouseEventsTemporarily({ refs: t }) {
					t.get('ignoreMouseTimer').request();
				},
				clearMouseEventTimer({ refs: t }) {
					t.get('ignoreMouseTimer').cancel();
				}
			}
		}
	});
function Hs(t, e) {
	const { state: n, send: r, prop: s, scope: i, context: a, computed: o } = t,
		c = n.hasTag('visible'),
		f = n.hasTag('paused'),
		u = a.get('mounted'),
		h = o('frontmost'),
		m = s('parent').computed('placement'),
		g = s('type'),
		v = s('stacked'),
		p = s('title'),
		S = s('description'),
		C = s('action'),
		[I, b = 'center'] = m.split('-');
	return {
		type: g,
		title: p,
		description: S,
		placement: m,
		visible: c,
		paused: f,
		closable: !!s('closable'),
		pause() {
			r({ type: 'PAUSE' });
		},
		resume() {
			r({ type: 'RESUME' });
		},
		dismiss() {
			r({ type: 'DISMISS', src: 'programmatic' });
		},
		getRootProps() {
			return e.element({
				...K.root.attrs,
				dir: s('dir'),
				id: le(i),
				'data-state': c ? 'open' : 'closed',
				'data-type': g,
				'data-placement': m,
				'data-align': b,
				'data-side': I,
				'data-mounted': V(u),
				'data-paused': V(f),
				'data-first': V(h),
				'data-sibling': V(!h),
				'data-stack': V(v),
				'data-overlap': V(!v),
				role: 'status',
				'aria-atomic': 'true',
				'aria-describedby': S ? Ut(i) : void 0,
				'aria-labelledby': p ? jt(i) : void 0,
				tabIndex: 0,
				style: br(t, c),
				onKeyDown(E) {
					E.defaultPrevented || (E.key == 'Escape' && (r({ type: 'DISMISS', src: 'keyboard' }), E.preventDefault()));
				}
			});
		},
		getGhostBeforeProps() {
			return e.element({ 'data-ghost': 'before', style: Sr(t, c) });
		},
		getGhostAfterProps() {
			return e.element({ 'data-ghost': 'after', style: Tr() });
		},
		getTitleProps() {
			return e.element({ ...K.title.attrs, id: jt(i) });
		},
		getDescriptionProps() {
			return e.element({ ...K.description.attrs, id: Ut(i) });
		},
		getActionTriggerProps() {
			return e.button({
				...K.actionTrigger.attrs,
				type: 'button',
				onClick(E) {
					E.defaultPrevented || (C?.onClick?.(), r({ type: 'DISMISS', src: 'user' }));
				}
			});
		},
		getCloseTriggerProps() {
			return e.button({
				id: yr(i),
				...K.closeTrigger.attrs,
				type: 'button',
				'aria-label': 'Dismiss notification',
				onClick(E) {
					E.defaultPrevented || r({ type: 'DISMISS', src: 'user' });
				}
			});
		}
	};
}
var { not: Ir } = ue(),
	qs = {
		props({ props: t }) {
			return (Re(t, ['id', 'type', 'parent', 'removeDelay'], 'toast'), { closable: !0, ...t, duration: gt(t.duration, t.type) });
		},
		initialState({ prop: t }) {
			return t('type') === 'loading' || t('duration') === 1 / 0 ? 'visible:persist' : 'visible';
		},
		context({ prop: t, bindable: e }) {
			return {
				remainingTime: e(() => ({ defaultValue: gt(t('duration'), t('type')) })),
				createdAt: e(() => ({ defaultValue: Date.now() })),
				mounted: e(() => ({ defaultValue: !1 })),
				initialHeight: e(() => ({ defaultValue: 0 }))
			};
		},
		refs() {
			return { closeTimerStartTime: Date.now(), lastCloseStartTimerStartTime: 0 };
		},
		computed: {
			zIndex: ({ prop: t }) => {
				const e = t('parent').context.get('toasts'),
					n = e.findIndex((r) => r.id === t('id'));
				return e.length - n;
			},
			height: ({ prop: t }) =>
				t('parent')
					.context.get('heights')
					.find((r) => r.id === t('id'))?.height ?? 0,
			heightIndex: ({ prop: t }) =>
				t('parent')
					.context.get('heights')
					.findIndex((n) => n.id === t('id')),
			frontmost: ({ prop: t }) => t('index') === 0,
			heightBefore: ({ prop: t }) => {
				const e = t('parent').context.get('heights'),
					n = e.findIndex((r) => r.id === t('id'));
				return e.reduce((r, s, i) => (i >= n ? r : r + s.height), 0);
			},
			shouldPersist: ({ prop: t }) => t('type') === 'loading' || t('duration') === 1 / 0
		},
		watch({ track: t, prop: e, send: n }) {
			(t([() => e('message')], () => {
				const r = e('message');
				r && n({ type: r, src: 'programmatic' });
			}),
				t([() => e('type'), () => e('duration')], () => {
					n({ type: 'UPDATE' });
				}));
		},
		on: {
			UPDATE: [
				{ guard: 'shouldPersist', target: 'visible:persist', actions: ['resetCloseTimer'] },
				{ target: 'visible:updating', actions: ['resetCloseTimer'] }
			],
			MEASURE: { actions: ['measureHeight'] }
		},
		entry: ['setMounted', 'measureHeight', 'invokeOnVisible'],
		effects: ['trackHeight'],
		states: {
			'visible:updating': { tags: ['visible', 'updating'], effects: ['waitForNextTick'], on: { SHOW: { target: 'visible' } } },
			'visible:persist': {
				tags: ['visible', 'paused'],
				on: { RESUME: { guard: Ir('isLoadingType'), target: 'visible', actions: ['setCloseTimer'] }, DISMISS: { target: 'dismissing' } }
			},
			visible: {
				tags: ['visible'],
				effects: ['waitForDuration'],
				on: { DISMISS: { target: 'dismissing' }, PAUSE: { target: 'visible:persist', actions: ['syncRemainingTime'] } }
			},
			dismissing: {
				entry: ['invokeOnDismiss'],
				effects: ['waitForRemoveDelay'],
				on: { REMOVE: { target: 'unmounted', actions: ['notifyParentToRemove'] } }
			},
			unmounted: { entry: ['invokeOnUnmount'] }
		},
		implementations: {
			effects: {
				waitForRemoveDelay({ prop: t, send: e }) {
					return lt(() => {
						e({ type: 'REMOVE', src: 'timer' });
					}, t('removeDelay'));
				},
				waitForDuration({ send: t, context: e, computed: n }) {
					if (!n('shouldPersist'))
						return lt(() => {
							t({ type: 'DISMISS', src: 'timer' });
						}, e.get('remainingTime'));
				},
				waitForNextTick({ send: t }) {
					return lt(() => {
						t({ type: 'SHOW', src: 'timer' });
					}, 0);
				},
				trackHeight({ scope: t, prop: e }) {
					let n;
					return (
						M(() => {
							const r = Kt(t);
							if (!r) return;
							const s = () => {
									const o = r.style.height;
									r.style.height = 'auto';
									const c = r.getBoundingClientRect().height;
									r.style.height = o;
									const f = { id: e('id'), height: c };
									qt(e('parent'), f);
								},
								i = t.getWin(),
								a = new i.MutationObserver(s);
							(a.observe(r, { childList: !0, subtree: !0, characterData: !0 }), (n = () => a.disconnect()));
						}),
						() => n?.()
					);
				}
			},
			guards: { isLoadingType: ({ prop: t }) => t('type') === 'loading', shouldPersist: ({ computed: t }) => t('shouldPersist') },
			actions: {
				setMounted({ context: t }) {
					M(() => {
						t.set('mounted', !0);
					});
				},
				measureHeight({ scope: t, prop: e, context: n }) {
					queueMicrotask(() => {
						const r = Kt(t);
						if (!r) return;
						const s = r.style.height;
						r.style.height = 'auto';
						const i = r.getBoundingClientRect().height;
						((r.style.height = s), n.set('initialHeight', i));
						const a = { id: e('id'), height: i };
						qt(e('parent'), a);
					});
				},
				setCloseTimer({ refs: t }) {
					t.set('closeTimerStartTime', Date.now());
				},
				resetCloseTimer({ context: t, refs: e, prop: n }) {
					(e.set('closeTimerStartTime', Date.now()), t.set('remainingTime', gt(n('duration'), n('type'))));
				},
				syncRemainingTime({ context: t, refs: e }) {
					t.set('remainingTime', (n) => {
						const r = e.get('closeTimerStartTime'),
							s = Date.now() - r;
						return (e.set('lastCloseStartTimerStartTime', Date.now()), n - s);
					});
				},
				notifyParentToRemove({ prop: t }) {
					t('parent').send({ type: 'TOAST.REMOVE', id: t('id') });
				},
				invokeOnDismiss({ prop: t, event: e }) {
					t('onStatusChange')?.({ status: 'dismissing', src: e.src });
				},
				invokeOnUnmount({ prop: t }) {
					t('onStatusChange')?.({ status: 'unmounted' });
				},
				invokeOnVisible({ prop: t }) {
					t('onStatusChange')?.({ status: 'visible' });
				}
			}
		}
	};
function qt(t, e) {
	const { id: n, height: r } = e;
	t.context.set('heights', (s) => (s.find((a) => a.id === n) ? s.map((a) => (a.id === n ? { ...a, height: r } : a)) : [{ id: n, height: r }, ...s]));
}
var Pr = (t, e) => ({ ...e, ...te(t) });
function Dr(t = {}) {
	const e = Pr(t, {
		placement: 'bottom',
		overlap: !1,
		max: 24,
		gap: 16,
		offsets: '1rem',
		hotkey: ['altKey', 'KeyT'],
		removeDelay: 200,
		pauseOnPageIdle: !0
	});
	let n = [],
		r = [],
		s = new Set(),
		i = [];
	const a = (l) => (
			n.push(l),
			() => {
				const d = n.indexOf(l);
				n.splice(d, 1);
			}
		),
		o = (l) => (n.forEach((d) => d(l)), l),
		c = (l) => {
			if (r.length >= e.max) {
				i.push(l);
				return;
			}
			(o(l), r.unshift(l));
		},
		f = () => {
			for (; i.length > 0 && r.length < e.max; ) {
				const l = i.shift();
				l && (o(l), r.unshift(l));
			}
		},
		u = (l) => {
			const d = l.id ?? `toast:${Jt()}`,
				_ = r.find((P) => P.id === d);
			return (
				s.has(d) && s.delete(d),
				_
					? (r = r.map((P) => (P.id === d ? o({ ...P, ...l, id: d }) : P)))
					: c({ id: d, duration: e.duration, removeDelay: e.removeDelay, type: 'info', ...l, stacked: !e.overlap, gap: e.gap }),
				d
			);
		},
		h = (l) => (
			s.add(l),
			l
				? (n.forEach((d) => d({ id: l, dismiss: !0 })), (r = r.filter((d) => d.id !== l)), f())
				: (r.forEach((d) => {
						n.forEach((_) => _({ id: d.id, dismiss: !0 }));
					}),
					(r = []),
					(i = [])),
			l
		);
	return {
		attrs: e,
		subscribe: a,
		create: u,
		update: (l, d) => u({ id: l, ...d }),
		remove: h,
		dismiss: (l) => {
			l != null ? (r = r.map((d) => (d.id === l ? o({ ...d, message: 'DISMISS' }) : d))) : (r = r.map((d) => o({ ...d, message: 'DISMISS' })));
		},
		error: (l) => u({ ...l, type: 'error' }),
		success: (l) => u({ ...l, type: 'success' }),
		info: (l) => u({ ...l, type: 'info' }),
		warning: (l) => u({ ...l, type: 'warning' }),
		loading: (l) => u({ ...l, type: 'loading' }),
		getVisibleToasts: () => r.filter((l) => !s.has(l.id)),
		getCount: () => r.length,
		promise: (l, d, _ = {}) => {
			if (!d || !d.loading) {
				vt("[zag-js > toast] toaster.promise() requires at least a 'loading' option to be specified");
				return;
			}
			const P = u({ ..._, ...d.loading, promise: l, type: 'loading' });
			let Y = !0,
				G;
			const de = Z(l)
				.then(async (k) => {
					if (((G = ['resolve', k]), kr(k) && !k.ok)) {
						Y = !1;
						const F = Z(d.error, `HTTP Error! status: ${k.status}`);
						u({ ..._, ...F, id: P, type: 'error' });
					} else if (d.success !== void 0) {
						Y = !1;
						const F = Z(d.success, k);
						u({ ..._, ...F, id: P, type: 'success' });
					}
				})
				.catch(async (k) => {
					if (((G = ['reject', k]), d.error !== void 0)) {
						Y = !1;
						const F = Z(d.error, k);
						u({ ..._, ...F, id: P, type: 'error' });
					}
				})
				.finally(() => {
					(Y && h(P), d.finally?.());
				});
			return { id: P, unwrap: () => new Promise((k, F) => de.then(() => (G[0] === 'reject' ? F(G[1]) : k(G[1]))).catch(F)) };
		},
		pause: (l) => {
			l != null ? (r = r.map((d) => (d.id === l ? o({ ...d, message: 'PAUSE' }) : d))) : (r = r.map((d) => o({ ...d, message: 'PAUSE' })));
		},
		resume: (l) => {
			l != null ? (r = r.map((d) => (d.id === l ? o({ ...d, message: 'RESUME' }) : d))) : (r = r.map((d) => o({ ...d, message: 'RESUME' })));
		},
		isVisible: (l) => !s.has(l) && !!r.find((d) => d.id === l),
		isDismissed: (l) => s.has(l),
		expand: () => {
			r = r.map((l) => o({ ...l, stacked: !0 }));
		},
		collapse: () => {
			r = r.map((l) => o({ ...l, stacked: !1 }));
		}
	};
}
var kr = (t) => t && typeof t == 'object' && 'ok' in t && typeof t.ok == 'boolean' && 'status' in t && typeof t.status == 'number',
	Gs = { connect: wr, machine: Lr };
function Mr(t) {
	const e = '/Default_User.svg';
	if (!t) return e;
	if (t.startsWith('data:') || /^https?:\/\//i.test(t)) return t;
	if (/^\/?Default_User\.svg$/i.test(t)) return e;
	let n = t.replace(/^https?:\/\/[^/]+/i, '').replace(/^\/+/, '/');
	if (n === '/files' || n === '/files/') return e;
	if (n.startsWith('/files/')) return n;
	const r = n.startsWith('/') ? n.slice(1) : n;
	if (r === 'files') return e;
	if (r.startsWith('static/')) return `/${r}`;
	const s = J.MEDIA_FOLDER;
	return r.startsWith(`${s}/`)
		? `/files/${r.slice(s.length + 1)}`
		: r.startsWith('avatars/')
			? `/files/${r}`
			: r
				? r.endsWith('.svg')
					? `/${r}`
					: `/files/${r}`
				: e;
}
function Gt(t) {
	if (typeof document > 'u') return null;
	const n = `; ${document.cookie}`.split(`; ${t}=`);
	return (n.length === 2 && n.pop()?.split(';').shift()) || null;
}
function zt(t, e) {
	typeof document > 'u' || !e || (document.cookie = `${t}=${e}; path=/; max-age=${3600 * 24 * 365}; SameSite=Lax; Secure`);
}
class fe {
	#t = T(ut({ show: !1 }));
	get translationProgress() {
		return w(this.#t);
	}
	set translationProgress(e) {
		x(this.#t, e, !0);
	}
	validationErrorsMap = new he();
	#e = T(0);
	get tabSetState() {
		return w(this.#e);
	}
	set tabSetState(e) {
		x(this.#e, e, !0);
	}
	#n = T(!0);
	get drawerExpandedState() {
		return w(this.#n);
	}
	set drawerExpandedState(e) {
		x(this.#n, e, !0);
	}
	#r = T('create');
	get listboxValueState() {
		return w(this.#r);
	}
	set listboxValueState(e) {
		x(this.#r, e, !0);
	}
	#s = T('/Default_User.svg');
	get avatarSrc() {
		return w(this.#s);
	}
	set avatarSrc(e) {
		x(this.#s, e, !0);
	}
	#i = T(ut({}));
	get translationStatus() {
		return w(this.#i);
	}
	set translationStatus(e) {
		x(this.#i, e, !0);
	}
	#o = T(0);
	get completionStatus() {
		return w(this.#o);
	}
	set completionStatus(e) {
		x(this.#o, e, !0);
	}
	#a = T(!1);
	get translationStatusOpen() {
		return w(this.#a);
	}
	set translationStatusOpen(e) {
		x(this.#a, e, !0);
	}
	#u = T('en');
	get _systemLanguage() {
		return w(this.#u);
	}
	set _systemLanguage(e) {
		x(this.#u, e, !0);
	}
	#c = T('en');
	get _contentLanguage() {
		return w(this.#c);
	}
	set _contentLanguage(e) {
		x(this.#c, e, !0);
	}
	#l = T(void 0);
	get headerActionButton() {
		return w(this.#l);
	}
	set headerActionButton(e) {
		x(this.#l, e, !0);
	}
	#f = T(void 0);
	get headerActionButton2() {
		return w(this.#f);
	}
	set headerActionButton2(e) {
		x(this.#f, e, !0);
	}
	#d = T('preset-filled-primary-500');
	get pkgBgColor() {
		return w(this.#d);
	}
	set pkgBgColor(e) {
		x(this.#d, e, !0);
	}
	#h = T(null);
	get file() {
		return w(this.#h);
	}
	set file(e) {
		x(this.#h, e, !0);
	}
	#g = T(!1);
	get saveEditedImage() {
		return w(this.#g);
	}
	set saveEditedImage(e) {
		x(this.#g, e, !0);
	}
	#p = T(ut({ fn: () => {}, reset: () => {} }));
	get saveFunction() {
		return w(this.#p);
	}
	set saveFunction(e) {
		x(this.#p, e, !0);
	}
	#m = T(async () => {});
	get saveLayerStore() {
		return w(this.#m);
	}
	set saveLayerStore(e) {
		x(this.#m, e, !0);
	}
	#y = T(!1);
	get shouldShowNextButton() {
		return w(this.#y);
	}
	set shouldShowNextButton(e) {
		x(this.#y, e, !0);
	}
	constructor() {
		this.init();
	}
	init() {
		try {
			((this._systemLanguage = Gt('systemLanguage') ?? J.BASE_LOCALE ?? 'en'),
				(this._contentLanguage = Gt('contentLanguage') ?? J.DEFAULT_CONTENT_LANGUAGE ?? 'en'));
		} catch {
			((this._systemLanguage = 'en'), (this._contentLanguage = 'en'));
		}
		const e = J.AVAILABLE_CONTENT_LANGUAGES || [];
		for (const n of e) this.translationProgress[n] = { total: new Ot(), translated: new Ot() };
	}
	get systemLanguage() {
		return this._systemLanguage;
	}
	set systemLanguage(e) {
		((this._systemLanguage = e), zt('systemLanguage', e));
	}
	get contentLanguage() {
		return this._contentLanguage;
	}
	set contentLanguage(e) {
		((this._contentLanguage = e), zt('contentLanguage', e));
	}
	setAvatarSrc(e) {
		this.avatarSrc = Mr(e);
	}
	updateTranslationStatus(e) {
		Object.assign(this.translationStatus, e);
	}
	setTranslationStatusOpen(e) {
		this.translationStatusOpen = e;
	}
	setCompletionStatus(e) {
		this.completionStatus = e;
	}
}
const y = new fe(),
	Cr = {
		get errors() {
			return Object.fromEntries(y.validationErrorsMap);
		},
		get isValid() {
			for (const t of y.validationErrorsMap.values()) if (t) return !1;
			return !0;
		},
		setError: (t, e) => {
			y.validationErrorsMap.get(t) !== e && y.validationErrorsMap.set(t, e);
		},
		clearError: (t) => {
			y.validationErrorsMap.has(t) && y.validationErrorsMap.delete(t);
		},
		clearAllErrors: () => y.validationErrorsMap.clear(),
		getError: (t) => y.validationErrorsMap.get(t) || null,
		hasError: (t) => !!y.validationErrorsMap.get(t)
	};
class Nr {
	#t = T(!1);
	get hasChanges() {
		return w(this.#t);
	}
	set hasChanges(e) {
		x(this.#t, e, !0);
	}
	#e = T('');
	get initialDataSnapshot() {
		return w(this.#e);
	}
	set initialDataSnapshot(e) {
		x(this.#e, e, !0);
	}
	setHasChanges(e) {
		this.hasChanges = e;
	}
	setInitialSnapshot(e) {
		((this.initialDataSnapshot = JSON.stringify(e)), (this.hasChanges = !1));
	}
	compareWithCurrent(e) {
		if (!this.initialDataSnapshot) return !1;
		const r = JSON.stringify(e) !== this.initialDataSnapshot;
		return (this.hasChanges !== r && (this.hasChanges = r), r);
	}
	reset() {
		((this.hasChanges = !1), (this.initialDataSnapshot = ''));
	}
}
const Rr = new Nr(),
	_r = Dr(),
	Fr = {
		get value() {
			return y.systemLanguage;
		},
		set value(t) {
			y.systemLanguage = t;
		},
		set(t) {
			y.systemLanguage = t;
		},
		update(t) {
			y.systemLanguage = t(y.systemLanguage);
		}
	},
	Br = {
		get value() {
			return y.contentLanguage;
		},
		set value(t) {
			y.contentLanguage = t;
		},
		set(t) {
			y.contentLanguage = t;
		},
		update(t) {
			y.contentLanguage = t(y.contentLanguage);
		}
	},
	$r = {
		get value() {
			return y.translationProgress;
		},
		set value(t) {
			Object.assign(y.translationProgress, t);
		}
	},
	Vr = {
		get value() {
			return y.avatarSrc;
		},
		set value(t) {
			y.avatarSrc = t;
		},
		set(t) {
			y.avatarSrc = t;
		}
	},
	Wr = {
		get value() {
			return y.listboxValueState;
		},
		set value(t) {
			y.listboxValueState = t;
		},
		set(t) {
			y.listboxValueState = t;
		},
		subscribe(t) {
			return (t(y.listboxValueState), () => {});
		}
	},
	Kr = {
		get value() {
			return y.tabSetState;
		},
		set value(t) {
			y.tabSetState = t;
		},
		set(t) {
			y.tabSetState = t;
		},
		subscribe(t) {
			return (t(y.tabSetState), () => {});
		},
		update(t) {
			y.tabSetState = t(y.tabSetState);
		}
	},
	zs = Object.freeze(
		Object.defineProperty(
			{
				__proto__: null,
				AppStore: fe,
				app: y,
				avatarSrc: Vr,
				contentLanguage: Br,
				dataChangeStore: Rr,
				storeListboxValue: Wr,
				systemLanguage: Fr,
				tabSet: Kr,
				toaster: _r,
				translationProgress: $r,
				validationStore: Cr
			},
			Symbol.toStringTag,
			{ value: 'Module' }
		)
	);
export {
	Nn as $,
	V as A,
	gs as B,
	hs as C,
	ms as D,
	X as E,
	et as F,
	Ss as G,
	Qn as H,
	Ks as I,
	ls as J,
	pt as K,
	_s as L,
	Jn as M,
	Pn as N,
	Rs as O,
	Ns as P,
	Xr as Q,
	zr as R,
	Ps as S,
	Ms as T,
	Bn as U,
	$ as V,
	vs as W,
	it as X,
	ue as Y,
	j as Z,
	as as _,
	y as a,
	Es as a0,
	xs as a1,
	ws as a2,
	Cs as a3,
	Ts as a4,
	ks as a5,
	cs as a6,
	Fr as a7,
	Vs as a8,
	Qr as a9,
	zs as aA,
	ss as aa,
	Wr as ab,
	$r as ac,
	Br as ad,
	Rr as ae,
	fs as af,
	As as ag,
	Us as ah,
	Fs as ai,
	Ds as aj,
	Zr as ak,
	Yr as al,
	Te as am,
	ps as an,
	Os as ao,
	ys as ap,
	bs as aq,
	pn as ar,
	ts as as,
	rs as at,
	Bs as au,
	Ee as av,
	Vr as aw,
	Gs as ax,
	qs as ay,
	Hs as az,
	Jr as b,
	ds as c,
	te as d,
	es as e,
	Zt as f,
	D as g,
	yt as h,
	A as i,
	us as j,
	js as k,
	Gr as l,
	$s as m,
	ns as n,
	ct as o,
	z as p,
	Ws as q,
	M as r,
	Ls as s,
	_r as t,
	Is as u,
	Cr as v,
	vt as w,
	os as x,
	Kr as y,
	is as z
};
//# sourceMappingURL=C-hhfhAN.js.map
