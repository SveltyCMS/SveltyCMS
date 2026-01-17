import { r as Kt, n as Zt, i as Qt, b as te, g as ee, c as ne, d as oe } from './C-hhfhAN.js';
import { i as ie } from './zi73tRJP.js';
import { p as re, az as se, z as ce, g as G, u as mt, f as Rt, a as le, aZ as Pt } from './DrlZFkx8.js';
import { m as ae, u as fe, c as Ct, a as Tt } from './CTjXDULS.js';
import { s as ue } from './DhHAlOU0.js';
const de = ['top', 'right', 'bottom', 'left'],
	X = Math.min,
	R = Math.max,
	st = Math.round,
	rt = Math.floor,
	k = (t) => ({ x: t, y: t }),
	me = { left: 'right', right: 'left', bottom: 'top', top: 'bottom' },
	he = { start: 'end', end: 'start' };
function gt(t, e, n) {
	return R(t, X(e, n));
}
function N(t, e) {
	return typeof t == 'function' ? t(e) : t;
}
function _(t) {
	return t.split('-')[0];
}
function Q(t) {
	return t.split('-')[1];
}
function xt(t) {
	return t === 'x' ? 'y' : 'x';
}
function yt(t) {
	return t === 'y' ? 'height' : 'width';
}
const ge = new Set(['top', 'bottom']);
function H(t) {
	return ge.has(_(t)) ? 'y' : 'x';
}
function vt(t) {
	return xt(H(t));
}
function pe(t, e, n) {
	n === void 0 && (n = !1);
	const o = Q(t),
		i = vt(t),
		r = yt(i);
	let s = i === 'x' ? (o === (n ? 'end' : 'start') ? 'right' : 'left') : o === 'start' ? 'bottom' : 'top';
	return (e.reference[r] > e.floating[r] && (s = ct(s)), [s, ct(s)]);
}
function we(t) {
	const e = ct(t);
	return [pt(t), e, pt(e)];
}
function pt(t) {
	return t.replace(/start|end/g, (e) => he[e]);
}
const Et = ['left', 'right'],
	Mt = ['right', 'left'],
	xe = ['top', 'bottom'],
	ye = ['bottom', 'top'];
function ve(t, e, n) {
	switch (t) {
		case 'top':
		case 'bottom':
			return n ? (e ? Mt : Et) : e ? Et : Mt;
		case 'left':
		case 'right':
			return e ? xe : ye;
		default:
			return [];
	}
}
function be(t, e, n, o) {
	const i = Q(t);
	let r = ve(_(t), n === 'start', o);
	return (i && ((r = r.map((s) => s + '-' + i)), e && (r = r.concat(r.map(pt)))), r);
}
function ct(t) {
	return t.replace(/left|right|bottom|top/g, (e) => me[e]);
}
function Ae(t) {
	return { top: 0, right: 0, bottom: 0, left: 0, ...t };
}
function Vt(t) {
	return typeof t != 'number' ? Ae(t) : { top: t, right: t, bottom: t, left: t };
}
function lt(t) {
	const { x: e, y: n, width: o, height: i } = t;
	return { width: o, height: i, top: n, left: e, right: e + o, bottom: n + i, x: e, y: n };
}
function Dt(t, e, n) {
	let { reference: o, floating: i } = t;
	const r = H(e),
		s = vt(e),
		c = yt(s),
		l = _(e),
		a = r === 'y',
		u = o.x + o.width / 2 - i.width / 2,
		f = o.y + o.height / 2 - i.height / 2,
		h = o[c] / 2 - i[c] / 2;
	let d;
	switch (l) {
		case 'top':
			d = { x: u, y: o.y - i.height };
			break;
		case 'bottom':
			d = { x: u, y: o.y + o.height };
			break;
		case 'right':
			d = { x: o.x + o.width, y: f };
			break;
		case 'left':
			d = { x: o.x - i.width, y: f };
			break;
		default:
			d = { x: o.x, y: o.y };
	}
	switch (Q(e)) {
		case 'start':
			d[s] -= h * (n && a ? -1 : 1);
			break;
		case 'end':
			d[s] += h * (n && a ? -1 : 1);
			break;
	}
	return d;
}
const Oe = async (t, e, n) => {
	const { placement: o = 'bottom', strategy: i = 'absolute', middleware: r = [], platform: s } = n,
		c = r.filter(Boolean),
		l = await (s.isRTL == null ? void 0 : s.isRTL(e));
	let a = await s.getElementRects({ reference: t, floating: e, strategy: i }),
		{ x: u, y: f } = Dt(a, o, l),
		h = o,
		d = {},
		m = 0;
	for (let g = 0; g < c.length; g++) {
		const { name: p, fn: w } = c[g],
			{
				x,
				y,
				data: v,
				reset: b
			} = await w({
				x: u,
				y: f,
				initialPlacement: o,
				placement: h,
				strategy: i,
				middlewareData: d,
				rects: a,
				platform: s,
				elements: { reference: t, floating: e }
			});
		((u = x ?? u),
			(f = y ?? f),
			(d = { ...d, [p]: { ...d[p], ...v } }),
			b &&
				m <= 50 &&
				(m++,
				typeof b == 'object' &&
					(b.placement && (h = b.placement),
					b.rects && (a = b.rects === !0 ? await s.getElementRects({ reference: t, floating: e, strategy: i }) : b.rects),
					({ x: u, y: f } = Dt(a, h, l))),
				(g = -1)));
	}
	return { x: u, y: f, placement: h, strategy: i, middlewareData: d };
};
async function nt(t, e) {
	var n;
	e === void 0 && (e = {});
	const { x: o, y: i, platform: r, rects: s, elements: c, strategy: l } = t,
		{
			boundary: a = 'clippingAncestors',
			rootBoundary: u = 'viewport',
			elementContext: f = 'floating',
			altBoundary: h = !1,
			padding: d = 0
		} = N(e, t),
		m = Vt(d),
		p = c[h ? (f === 'floating' ? 'reference' : 'floating') : f],
		w = lt(
			await r.getClippingRect({
				element:
					(n = await (r.isElement == null ? void 0 : r.isElement(p))) == null || n
						? p
						: p.contextElement || (await (r.getDocumentElement == null ? void 0 : r.getDocumentElement(c.floating))),
				boundary: a,
				rootBoundary: u,
				strategy: l
			})
		),
		x = f === 'floating' ? { x: o, y: i, width: s.floating.width, height: s.floating.height } : s.reference,
		y = await (r.getOffsetParent == null ? void 0 : r.getOffsetParent(c.floating)),
		v = (await (r.isElement == null ? void 0 : r.isElement(y)))
			? (await (r.getScale == null ? void 0 : r.getScale(y))) || { x: 1, y: 1 }
			: { x: 1, y: 1 },
		b = lt(
			r.convertOffsetParentRelativeRectToViewportRelativeRect
				? await r.convertOffsetParentRelativeRectToViewportRelativeRect({ elements: c, rect: x, offsetParent: y, strategy: l })
				: x
		);
	return {
		top: (w.top - b.top + m.top) / v.y,
		bottom: (b.bottom - w.bottom + m.bottom) / v.y,
		left: (w.left - b.left + m.left) / v.x,
		right: (b.right - w.right + m.right) / v.x
	};
}
const Se = (t) => ({
		name: 'arrow',
		options: t,
		async fn(e) {
			const { x: n, y: o, placement: i, rects: r, platform: s, elements: c, middlewareData: l } = e,
				{ element: a, padding: u = 0 } = N(t, e) || {};
			if (a == null) return {};
			const f = Vt(u),
				h = { x: n, y: o },
				d = vt(i),
				m = yt(d),
				g = await s.getDimensions(a),
				p = d === 'y',
				w = p ? 'top' : 'left',
				x = p ? 'bottom' : 'right',
				y = p ? 'clientHeight' : 'clientWidth',
				v = r.reference[m] + r.reference[d] - h[d] - r.floating[m],
				b = h[d] - r.reference[d],
				O = await (s.getOffsetParent == null ? void 0 : s.getOffsetParent(a));
			let A = O ? O[y] : 0;
			(!A || !(await (s.isElement == null ? void 0 : s.isElement(O)))) && (A = c.floating[y] || r.floating[m]);
			const C = v / 2 - b / 2,
				$ = A / 2 - g[m] / 2 - 1,
				T = X(f[w], $),
				I = X(f[x], $),
				W = T,
				Y = A - g[m] - I,
				S = A / 2 - g[m] / 2 + C,
				q = gt(W, S, Y),
				F = !l.arrow && Q(i) != null && S !== q && r.reference[m] / 2 - (S < W ? T : I) - g[m] / 2 < 0,
				E = F ? (S < W ? S - W : S - Y) : 0;
			return { [d]: h[d] + E, data: { [d]: q, centerOffset: S - q - E, ...(F && { alignmentOffset: E }) }, reset: F };
		}
	}),
	Re = function (t) {
		return (
			t === void 0 && (t = {}),
			{
				name: 'flip',
				options: t,
				async fn(e) {
					var n, o;
					const { placement: i, middlewareData: r, rects: s, initialPlacement: c, platform: l, elements: a } = e,
						{
							mainAxis: u = !0,
							crossAxis: f = !0,
							fallbackPlacements: h,
							fallbackStrategy: d = 'bestFit',
							fallbackAxisSideDirection: m = 'none',
							flipAlignment: g = !0,
							...p
						} = N(t, e);
					if ((n = r.arrow) != null && n.alignmentOffset) return {};
					const w = _(i),
						x = H(c),
						y = _(c) === c,
						v = await (l.isRTL == null ? void 0 : l.isRTL(a.floating)),
						b = h || (y || !g ? [ct(c)] : we(c)),
						O = m !== 'none';
					!h && O && b.push(...be(c, g, m, v));
					const A = [c, ...b],
						C = await nt(e, p),
						$ = [];
					let T = ((o = r.flip) == null ? void 0 : o.overflows) || [];
					if ((u && $.push(C[w]), f)) {
						const S = pe(i, s, v);
						$.push(C[S[0]], C[S[1]]);
					}
					if (((T = [...T, { placement: i, overflows: $ }]), !$.every((S) => S <= 0))) {
						var I, W;
						const S = (((I = r.flip) == null ? void 0 : I.index) || 0) + 1,
							q = A[S];
						if (q && (!(f === 'alignment' ? x !== H(q) : !1) || T.every((M) => (H(M.placement) === x ? M.overflows[0] > 0 : !0))))
							return { data: { index: S, overflows: T }, reset: { placement: q } };
						let F = (W = T.filter((E) => E.overflows[0] <= 0).sort((E, M) => E.overflows[1] - M.overflows[1])[0]) == null ? void 0 : W.placement;
						if (!F)
							switch (d) {
								case 'bestFit': {
									var Y;
									const E =
										(Y = T.filter((M) => {
											if (O) {
												const j = H(M.placement);
												return j === x || j === 'y';
											}
											return !0;
										})
											.map((M) => [M.placement, M.overflows.filter((j) => j > 0).reduce((j, Jt) => j + Jt, 0)])
											.sort((M, j) => M[1] - j[1])[0]) == null
											? void 0
											: Y[0];
									E && (F = E);
									break;
								}
								case 'initialPlacement':
									F = c;
									break;
							}
						if (i !== F) return { reset: { placement: F } };
					}
					return {};
				}
			}
		);
	};
function Lt(t, e) {
	return { top: t.top - e.height, right: t.right - e.width, bottom: t.bottom - e.height, left: t.left - e.width };
}
function $t(t) {
	return de.some((e) => t[e] >= 0);
}
const Pe = function (t) {
		return (
			t === void 0 && (t = {}),
			{
				name: 'hide',
				options: t,
				async fn(e) {
					const { rects: n } = e,
						{ strategy: o = 'referenceHidden', ...i } = N(t, e);
					switch (o) {
						case 'referenceHidden': {
							const r = await nt(e, { ...i, elementContext: 'reference' }),
								s = Lt(r, n.reference);
							return { data: { referenceHiddenOffsets: s, referenceHidden: $t(s) } };
						}
						case 'escaped': {
							const r = await nt(e, { ...i, altBoundary: !0 }),
								s = Lt(r, n.floating);
							return { data: { escapedOffsets: s, escaped: $t(s) } };
						}
						default:
							return {};
					}
				}
			}
		);
	},
	Nt = new Set(['left', 'top']);
async function Ce(t, e) {
	const { placement: n, platform: o, elements: i } = t,
		r = await (o.isRTL == null ? void 0 : o.isRTL(i.floating)),
		s = _(n),
		c = Q(n),
		l = H(n) === 'y',
		a = Nt.has(s) ? -1 : 1,
		u = r && l ? -1 : 1,
		f = N(e, t);
	let {
		mainAxis: h,
		crossAxis: d,
		alignmentAxis: m
	} = typeof f == 'number'
		? { mainAxis: f, crossAxis: 0, alignmentAxis: null }
		: { mainAxis: f.mainAxis || 0, crossAxis: f.crossAxis || 0, alignmentAxis: f.alignmentAxis };
	return (c && typeof m == 'number' && (d = c === 'end' ? m * -1 : m), l ? { x: d * u, y: h * a } : { x: h * a, y: d * u });
}
const Te = function (t) {
		return (
			t === void 0 && (t = 0),
			{
				name: 'offset',
				options: t,
				async fn(e) {
					var n, o;
					const { x: i, y: r, placement: s, middlewareData: c } = e,
						l = await Ce(e, t);
					return s === ((n = c.offset) == null ? void 0 : n.placement) && (o = c.arrow) != null && o.alignmentOffset
						? {}
						: { x: i + l.x, y: r + l.y, data: { ...l, placement: s } };
				}
			}
		);
	},
	Ee = function (t) {
		return (
			t === void 0 && (t = {}),
			{
				name: 'shift',
				options: t,
				async fn(e) {
					const { x: n, y: o, placement: i } = e,
						{
							mainAxis: r = !0,
							crossAxis: s = !1,
							limiter: c = {
								fn: (p) => {
									let { x: w, y: x } = p;
									return { x: w, y: x };
								}
							},
							...l
						} = N(t, e),
						a = { x: n, y: o },
						u = await nt(e, l),
						f = H(_(i)),
						h = xt(f);
					let d = a[h],
						m = a[f];
					if (r) {
						const p = h === 'y' ? 'top' : 'left',
							w = h === 'y' ? 'bottom' : 'right',
							x = d + u[p],
							y = d - u[w];
						d = gt(x, d, y);
					}
					if (s) {
						const p = f === 'y' ? 'top' : 'left',
							w = f === 'y' ? 'bottom' : 'right',
							x = m + u[p],
							y = m - u[w];
						m = gt(x, m, y);
					}
					const g = c.fn({ ...e, [h]: d, [f]: m });
					return { ...g, data: { x: g.x - n, y: g.y - o, enabled: { [h]: r, [f]: s } } };
				}
			}
		);
	},
	Me = function (t) {
		return (
			t === void 0 && (t = {}),
			{
				options: t,
				fn(e) {
					const { x: n, y: o, placement: i, rects: r, middlewareData: s } = e,
						{ offset: c = 0, mainAxis: l = !0, crossAxis: a = !0 } = N(t, e),
						u = { x: n, y: o },
						f = H(i),
						h = xt(f);
					let d = u[h],
						m = u[f];
					const g = N(c, e),
						p = typeof g == 'number' ? { mainAxis: g, crossAxis: 0 } : { mainAxis: 0, crossAxis: 0, ...g };
					if (l) {
						const y = h === 'y' ? 'height' : 'width',
							v = r.reference[h] - r.floating[y] + p.mainAxis,
							b = r.reference[h] + r.reference[y] - p.mainAxis;
						d < v ? (d = v) : d > b && (d = b);
					}
					if (a) {
						var w, x;
						const y = h === 'y' ? 'width' : 'height',
							v = Nt.has(_(i)),
							b = r.reference[f] - r.floating[y] + ((v && ((w = s.offset) == null ? void 0 : w[f])) || 0) + (v ? 0 : p.crossAxis),
							O = r.reference[f] + r.reference[y] + (v ? 0 : ((x = s.offset) == null ? void 0 : x[f]) || 0) - (v ? p.crossAxis : 0);
						m < b ? (m = b) : m > O && (m = O);
					}
					return { [h]: d, [f]: m };
				}
			}
		);
	},
	De = function (t) {
		return (
			t === void 0 && (t = {}),
			{
				name: 'size',
				options: t,
				async fn(e) {
					var n, o;
					const { placement: i, rects: r, platform: s, elements: c } = e,
						{ apply: l = () => {}, ...a } = N(t, e),
						u = await nt(e, a),
						f = _(i),
						h = Q(i),
						d = H(i) === 'y',
						{ width: m, height: g } = r.floating;
					let p, w;
					f === 'top' || f === 'bottom'
						? ((p = f), (w = h === ((await (s.isRTL == null ? void 0 : s.isRTL(c.floating))) ? 'start' : 'end') ? 'left' : 'right'))
						: ((w = f), (p = h === 'end' ? 'top' : 'bottom'));
					const x = g - u.top - u.bottom,
						y = m - u.left - u.right,
						v = X(g - u[p], x),
						b = X(m - u[w], y),
						O = !e.middlewareData.shift;
					let A = v,
						C = b;
					if (
						((n = e.middlewareData.shift) != null && n.enabled.x && (C = y), (o = e.middlewareData.shift) != null && o.enabled.y && (A = x), O && !h)
					) {
						const T = R(u.left, 0),
							I = R(u.right, 0),
							W = R(u.top, 0),
							Y = R(u.bottom, 0);
						d ? (C = m - 2 * (T !== 0 || I !== 0 ? T + I : R(u.left, u.right))) : (A = g - 2 * (W !== 0 || Y !== 0 ? W + Y : R(u.top, u.bottom)));
					}
					await l({ ...e, availableWidth: C, availableHeight: A });
					const $ = await s.getDimensions(c.floating);
					return m !== $.width || g !== $.height ? { reset: { rects: !0 } } : {};
				}
			}
		);
	};
function at() {
	return typeof window < 'u';
}
function tt(t) {
	return _t(t) ? (t.nodeName || '').toLowerCase() : '#document';
}
function P(t) {
	var e;
	return (t == null || (e = t.ownerDocument) == null ? void 0 : e.defaultView) || window;
}
function B(t) {
	var e;
	return (e = (_t(t) ? t.ownerDocument : t.document) || window.document) == null ? void 0 : e.documentElement;
}
function _t(t) {
	return at() ? t instanceof Node || t instanceof P(t).Node : !1;
}
function D(t) {
	return at() ? t instanceof Element || t instanceof P(t).Element : !1;
}
function z(t) {
	return at() ? t instanceof HTMLElement || t instanceof P(t).HTMLElement : !1;
}
function Wt(t) {
	return !at() || typeof ShadowRoot > 'u' ? !1 : t instanceof ShadowRoot || t instanceof P(t).ShadowRoot;
}
const Le = new Set(['inline', 'contents']);
function it(t) {
	const { overflow: e, overflowX: n, overflowY: o, display: i } = L(t);
	return /auto|scroll|overlay|hidden|clip/.test(e + o + n) && !Le.has(i);
}
const $e = new Set(['table', 'td', 'th']);
function We(t) {
	return $e.has(tt(t));
}
const He = [':popover-open', ':modal'];
function ft(t) {
	return He.some((e) => {
		try {
			return t.matches(e);
		} catch {
			return !1;
		}
	});
}
const ke = ['transform', 'translate', 'scale', 'rotate', 'perspective'],
	ze = ['transform', 'translate', 'scale', 'rotate', 'perspective', 'filter'],
	Be = ['paint', 'layout', 'strict', 'content'];
function bt(t) {
	const e = At(),
		n = D(t) ? L(t) : t;
	return (
		ke.some((o) => (n[o] ? n[o] !== 'none' : !1)) ||
		(n.containerType ? n.containerType !== 'normal' : !1) ||
		(!e && (n.backdropFilter ? n.backdropFilter !== 'none' : !1)) ||
		(!e && (n.filter ? n.filter !== 'none' : !1)) ||
		ze.some((o) => (n.willChange || '').includes(o)) ||
		Be.some((o) => (n.contain || '').includes(o))
	);
}
function Fe(t) {
	let e = U(t);
	for (; z(e) && !Z(e); ) {
		if (bt(e)) return e;
		if (ft(e)) return null;
		e = U(e);
	}
	return null;
}
function At() {
	return typeof CSS > 'u' || !CSS.supports ? !1 : CSS.supports('-webkit-backdrop-filter', 'none');
}
const Ve = new Set(['html', 'body', '#document']);
function Z(t) {
	return Ve.has(tt(t));
}
function L(t) {
	return P(t).getComputedStyle(t);
}
function ut(t) {
	return D(t) ? { scrollLeft: t.scrollLeft, scrollTop: t.scrollTop } : { scrollLeft: t.scrollX, scrollTop: t.scrollY };
}
function U(t) {
	if (tt(t) === 'html') return t;
	const e = t.assignedSlot || t.parentNode || (Wt(t) && t.host) || B(t);
	return Wt(e) ? e.host : e;
}
function It(t) {
	const e = U(t);
	return Z(e) ? (t.ownerDocument ? t.ownerDocument.body : t.body) : z(e) && it(e) ? e : It(e);
}
function ot(t, e, n) {
	var o;
	(e === void 0 && (e = []), n === void 0 && (n = !0));
	const i = It(t),
		r = i === ((o = t.ownerDocument) == null ? void 0 : o.body),
		s = P(i);
	if (r) {
		const c = wt(s);
		return e.concat(s, s.visualViewport || [], it(i) ? i : [], c && n ? ot(c) : []);
	}
	return e.concat(i, ot(i, [], n));
}
function wt(t) {
	return t.parent && Object.getPrototypeOf(t.parent) ? t.frameElement : null;
}
function Yt(t) {
	const e = L(t);
	let n = parseFloat(e.width) || 0,
		o = parseFloat(e.height) || 0;
	const i = z(t),
		r = i ? t.offsetWidth : n,
		s = i ? t.offsetHeight : o,
		c = st(n) !== r || st(o) !== s;
	return (c && ((n = r), (o = s)), { width: n, height: o, $: c });
}
function Ot(t) {
	return D(t) ? t : t.contextElement;
}
function K(t) {
	const e = Ot(t);
	if (!z(e)) return k(1);
	const n = e.getBoundingClientRect(),
		{ width: o, height: i, $: r } = Yt(e);
	let s = (r ? st(n.width) : n.width) / o,
		c = (r ? st(n.height) : n.height) / i;
	return ((!s || !Number.isFinite(s)) && (s = 1), (!c || !Number.isFinite(c)) && (c = 1), { x: s, y: c });
}
const Ne = k(0);
function jt(t) {
	const e = P(t);
	return !At() || !e.visualViewport ? Ne : { x: e.visualViewport.offsetLeft, y: e.visualViewport.offsetTop };
}
function _e(t, e, n) {
	return (e === void 0 && (e = !1), !n || (e && n !== P(t)) ? !1 : e);
}
function J(t, e, n, o) {
	(e === void 0 && (e = !1), n === void 0 && (n = !1));
	const i = t.getBoundingClientRect(),
		r = Ot(t);
	let s = k(1);
	e && (o ? D(o) && (s = K(o)) : (s = K(t)));
	const c = _e(r, n, o) ? jt(r) : k(0);
	let l = (i.left + c.x) / s.x,
		a = (i.top + c.y) / s.y,
		u = i.width / s.x,
		f = i.height / s.y;
	if (r) {
		const h = P(r),
			d = o && D(o) ? P(o) : o;
		let m = h,
			g = wt(m);
		for (; g && o && d !== m; ) {
			const p = K(g),
				w = g.getBoundingClientRect(),
				x = L(g),
				y = w.left + (g.clientLeft + parseFloat(x.paddingLeft)) * p.x,
				v = w.top + (g.clientTop + parseFloat(x.paddingTop)) * p.y;
			((l *= p.x), (a *= p.y), (u *= p.x), (f *= p.y), (l += y), (a += v), (m = P(g)), (g = wt(m)));
		}
	}
	return lt({ width: u, height: f, x: l, y: a });
}
function dt(t, e) {
	const n = ut(t).scrollLeft;
	return e ? e.left + n : J(B(t)).left + n;
}
function Xt(t, e) {
	const n = t.getBoundingClientRect(),
		o = n.left + e.scrollLeft - dt(t, n),
		i = n.top + e.scrollTop;
	return { x: o, y: i };
}
function Ie(t) {
	let { elements: e, rect: n, offsetParent: o, strategy: i } = t;
	const r = i === 'fixed',
		s = B(o),
		c = e ? ft(e.floating) : !1;
	if (o === s || (c && r)) return n;
	let l = { scrollLeft: 0, scrollTop: 0 },
		a = k(1);
	const u = k(0),
		f = z(o);
	if ((f || (!f && !r)) && ((tt(o) !== 'body' || it(s)) && (l = ut(o)), z(o))) {
		const d = J(o);
		((a = K(o)), (u.x = d.x + o.clientLeft), (u.y = d.y + o.clientTop));
	}
	const h = s && !f && !r ? Xt(s, l) : k(0);
	return {
		width: n.width * a.x,
		height: n.height * a.y,
		x: n.x * a.x - l.scrollLeft * a.x + u.x + h.x,
		y: n.y * a.y - l.scrollTop * a.y + u.y + h.y
	};
}
function Ye(t) {
	return Array.from(t.getClientRects());
}
function je(t) {
	const e = B(t),
		n = ut(t),
		o = t.ownerDocument.body,
		i = R(e.scrollWidth, e.clientWidth, o.scrollWidth, o.clientWidth),
		r = R(e.scrollHeight, e.clientHeight, o.scrollHeight, o.clientHeight);
	let s = -n.scrollLeft + dt(t);
	const c = -n.scrollTop;
	return (L(o).direction === 'rtl' && (s += R(e.clientWidth, o.clientWidth) - i), { width: i, height: r, x: s, y: c });
}
const Ht = 25;
function Xe(t, e) {
	const n = P(t),
		o = B(t),
		i = n.visualViewport;
	let r = o.clientWidth,
		s = o.clientHeight,
		c = 0,
		l = 0;
	if (i) {
		((r = i.width), (s = i.height));
		const u = At();
		(!u || (u && e === 'fixed')) && ((c = i.offsetLeft), (l = i.offsetTop));
	}
	const a = dt(o);
	if (a <= 0) {
		const u = o.ownerDocument,
			f = u.body,
			h = getComputedStyle(f),
			d = (u.compatMode === 'CSS1Compat' && parseFloat(h.marginLeft) + parseFloat(h.marginRight)) || 0,
			m = Math.abs(o.clientWidth - f.clientWidth - d);
		m <= Ht && (r -= m);
	} else a <= Ht && (r += a);
	return { width: r, height: s, x: c, y: l };
}
const Ue = new Set(['absolute', 'fixed']);
function qe(t, e) {
	const n = J(t, !0, e === 'fixed'),
		o = n.top + t.clientTop,
		i = n.left + t.clientLeft,
		r = z(t) ? K(t) : k(1),
		s = t.clientWidth * r.x,
		c = t.clientHeight * r.y,
		l = i * r.x,
		a = o * r.y;
	return { width: s, height: c, x: l, y: a };
}
function kt(t, e, n) {
	let o;
	if (e === 'viewport') o = Xe(t, n);
	else if (e === 'document') o = je(B(t));
	else if (D(e)) o = qe(e, n);
	else {
		const i = jt(t);
		o = { x: e.x - i.x, y: e.y - i.y, width: e.width, height: e.height };
	}
	return lt(o);
}
function Ut(t, e) {
	const n = U(t);
	return n === e || !D(n) || Z(n) ? !1 : L(n).position === 'fixed' || Ut(n, e);
}
function Ge(t, e) {
	const n = e.get(t);
	if (n) return n;
	let o = ot(t, [], !1).filter((c) => D(c) && tt(c) !== 'body'),
		i = null;
	const r = L(t).position === 'fixed';
	let s = r ? U(t) : t;
	for (; D(s) && !Z(s); ) {
		const c = L(s),
			l = bt(s);
		(!l && c.position === 'fixed' && (i = null),
			(r ? !l && !i : (!l && c.position === 'static' && !!i && Ue.has(i.position)) || (it(s) && !l && Ut(t, s)))
				? (o = o.filter((u) => u !== s))
				: (i = c),
			(s = U(s)));
	}
	return (e.set(t, o), o);
}
function Je(t) {
	let { element: e, boundary: n, rootBoundary: o, strategy: i } = t;
	const s = [...(n === 'clippingAncestors' ? (ft(e) ? [] : Ge(e, this._c)) : [].concat(n)), o],
		c = s[0],
		l = s.reduce(
			(a, u) => {
				const f = kt(e, u, i);
				return ((a.top = R(f.top, a.top)), (a.right = X(f.right, a.right)), (a.bottom = X(f.bottom, a.bottom)), (a.left = R(f.left, a.left)), a);
			},
			kt(e, c, i)
		);
	return { width: l.right - l.left, height: l.bottom - l.top, x: l.left, y: l.top };
}
function Ke(t) {
	const { width: e, height: n } = Yt(t);
	return { width: e, height: n };
}
function Ze(t, e, n) {
	const o = z(e),
		i = B(e),
		r = n === 'fixed',
		s = J(t, !0, r, e);
	let c = { scrollLeft: 0, scrollTop: 0 };
	const l = k(0);
	function a() {
		l.x = dt(i);
	}
	if (o || (!o && !r))
		if (((tt(e) !== 'body' || it(i)) && (c = ut(e)), o)) {
			const d = J(e, !0, r, e);
			((l.x = d.x + e.clientLeft), (l.y = d.y + e.clientTop));
		} else i && a();
	r && !o && i && a();
	const u = i && !o && !r ? Xt(i, c) : k(0),
		f = s.left + c.scrollLeft - l.x - u.x,
		h = s.top + c.scrollTop - l.y - u.y;
	return { x: f, y: h, width: s.width, height: s.height };
}
function ht(t) {
	return L(t).position === 'static';
}
function zt(t, e) {
	if (!z(t) || L(t).position === 'fixed') return null;
	if (e) return e(t);
	let n = t.offsetParent;
	return (B(t) === n && (n = n.ownerDocument.body), n);
}
function qt(t, e) {
	const n = P(t);
	if (ft(t)) return n;
	if (!z(t)) {
		let i = U(t);
		for (; i && !Z(i); ) {
			if (D(i) && !ht(i)) return i;
			i = U(i);
		}
		return n;
	}
	let o = zt(t, e);
	for (; o && We(o) && ht(o); ) o = zt(o, e);
	return o && Z(o) && ht(o) && !bt(o) ? n : o || Fe(t) || n;
}
const Qe = async function (t) {
	const e = this.getOffsetParent || qt,
		n = this.getDimensions,
		o = await n(t.floating);
	return { reference: Ze(t.reference, await e(t.floating), t.strategy), floating: { x: 0, y: 0, width: o.width, height: o.height } };
};
function tn(t) {
	return L(t).direction === 'rtl';
}
const en = {
	convertOffsetParentRelativeRectToViewportRelativeRect: Ie,
	getDocumentElement: B,
	getClippingRect: Je,
	getOffsetParent: qt,
	getElementRects: Qe,
	getClientRects: Ye,
	getDimensions: Ke,
	getScale: K,
	isElement: D,
	isRTL: tn
};
function Gt(t, e) {
	return t.x === e.x && t.y === e.y && t.width === e.width && t.height === e.height;
}
function nn(t, e) {
	let n = null,
		o;
	const i = B(t);
	function r() {
		var c;
		(clearTimeout(o), (c = n) == null || c.disconnect(), (n = null));
	}
	function s(c, l) {
		(c === void 0 && (c = !1), l === void 0 && (l = 1), r());
		const a = t.getBoundingClientRect(),
			{ left: u, top: f, width: h, height: d } = a;
		if ((c || e(), !h || !d)) return;
		const m = rt(f),
			g = rt(i.clientWidth - (u + h)),
			p = rt(i.clientHeight - (f + d)),
			w = rt(u),
			y = { rootMargin: -m + 'px ' + -g + 'px ' + -p + 'px ' + -w + 'px', threshold: R(0, X(1, l)) || 1 };
		let v = !0;
		function b(O) {
			const A = O[0].intersectionRatio;
			if (A !== l) {
				if (!v) return s();
				A
					? s(!1, A)
					: (o = setTimeout(() => {
							s(!1, 1e-7);
						}, 1e3));
			}
			(A === 1 && !Gt(a, t.getBoundingClientRect()) && s(), (v = !1));
		}
		try {
			n = new IntersectionObserver(b, { ...y, root: i.ownerDocument });
		} catch {
			n = new IntersectionObserver(b, y);
		}
		n.observe(t);
	}
	return (s(!0), r);
}
function on(t, e, n, o) {
	o === void 0 && (o = {});
	const {
			ancestorScroll: i = !0,
			ancestorResize: r = !0,
			elementResize: s = typeof ResizeObserver == 'function',
			layoutShift: c = typeof IntersectionObserver == 'function',
			animationFrame: l = !1
		} = o,
		a = Ot(t),
		u = i || r ? [...(a ? ot(a) : []), ...ot(e)] : [];
	u.forEach((w) => {
		(i && w.addEventListener('scroll', n, { passive: !0 }), r && w.addEventListener('resize', n));
	});
	const f = a && c ? nn(a, n) : null;
	let h = -1,
		d = null;
	s &&
		((d = new ResizeObserver((w) => {
			let [x] = w;
			(x &&
				x.target === a &&
				d &&
				(d.unobserve(e),
				cancelAnimationFrame(h),
				(h = requestAnimationFrame(() => {
					var y;
					(y = d) == null || y.observe(e);
				}))),
				n());
		})),
		a && !l && d.observe(a),
		d.observe(e));
	let m,
		g = l ? J(t) : null;
	l && p();
	function p() {
		const w = J(t);
		(g && !Gt(g, w) && n(), (g = w), (m = requestAnimationFrame(p)));
	}
	return (
		n(),
		() => {
			var w;
			(u.forEach((x) => {
				(i && x.removeEventListener('scroll', n), r && x.removeEventListener('resize', n));
			}),
				f?.(),
				(w = d) == null || w.disconnect(),
				(d = null),
				l && cancelAnimationFrame(m));
		}
	);
}
const rn = Te,
	sn = Ee,
	cn = Re,
	ln = De,
	an = Pe,
	fn = Se,
	un = Me,
	dn = (t, e, n) => {
		const o = new Map(),
			i = { platform: en, ...n },
			r = { ...i.platform, _c: o };
		return Oe(t, e, { ...i, platform: r });
	};
function Bt(t = 0, e = 0, n = 0, o = 0) {
	if (typeof DOMRect == 'function') return new DOMRect(t, e, n, o);
	const i = { x: t, y: e, width: n, height: o, top: e, right: t + n, bottom: e + o, left: t };
	return { ...i, toJSON: () => i };
}
function mn(t) {
	if (!t) return Bt();
	const { x: e, y: n, width: o, height: i } = t;
	return Bt(e, n, o, i);
}
function hn(t, e) {
	return {
		contextElement: Qt(t) ? t : t?.contextElement,
		getBoundingClientRect: () => {
			const n = t,
				o = e?.(n);
			return o || !n ? mn(o) : n.getBoundingClientRect();
		}
	};
}
var et = (t) => ({ variable: t, reference: `var(${t})` }),
	V = {
		arrowSize: et('--arrow-size'),
		arrowSizeHalf: et('--arrow-size-half'),
		arrowBg: et('--arrow-background'),
		transformOrigin: et('--transform-origin'),
		arrowOffset: et('--arrow-offset')
	},
	gn = (t) => (t === 'top' || t === 'bottom' ? 'y' : 'x');
function pn(t, e) {
	return {
		name: 'transformOrigin',
		fn(n) {
			const { elements: o, middlewareData: i, placement: r, rects: s, y: c } = n,
				l = r.split('-')[0],
				a = gn(l),
				u = i.arrow?.x || 0,
				f = i.arrow?.y || 0,
				h = e?.clientWidth || 0,
				d = e?.clientHeight || 0,
				m = u + h / 2,
				g = f + d / 2,
				p = Math.abs(i.shift?.y || 0),
				w = s.reference.height / 2,
				x = d / 2,
				y = t.offset?.mainAxis ?? t.gutter,
				v = typeof y == 'number' ? y + x : (y ?? x),
				b = p > v,
				O = { top: `${m}px calc(100% + ${v}px)`, bottom: `${m}px ${-v}px`, left: `calc(100% + ${v}px) ${g}px`, right: `${-v}px ${g}px` }[l],
				A = `${m}px ${s.reference.y + w - c}px`,
				C = !!t.overlap && a === 'y' && b;
			return (o.floating.style.setProperty(V.transformOrigin.variable, C ? A : O), { data: { transformOrigin: C ? A : O } });
		}
	};
}
var wn = {
		name: 'rects',
		fn({ rects: t }) {
			return { data: t };
		}
	},
	xn = (t) => {
		if (t)
			return {
				name: 'shiftArrow',
				fn({ placement: e, middlewareData: n }) {
					if (!n.arrow) return {};
					const { x: o, y: i } = n.arrow,
						r = e.split('-')[0];
					return (
						Object.assign(t.style, {
							left: o != null ? `${o}px` : '',
							top: i != null ? `${i}px` : '',
							[r]: `calc(100% + ${V.arrowOffset.reference})`
						}),
						{}
					);
				}
			};
	};
function yn(t) {
	const [e, n] = t.split('-');
	return { side: e, align: n, hasAlign: n != null };
}
function kn(t) {
	return t.split('-')[0];
}
var vn = {
	strategy: 'absolute',
	placement: 'bottom',
	listeners: !0,
	gutter: 8,
	flip: !0,
	slide: !0,
	overlap: !1,
	sameWidth: !1,
	fitViewport: !1,
	overflowPadding: 8,
	arrowPadding: 4
};
function Ft(t, e) {
	const n = t.devicePixelRatio || 1;
	return Math.round(e * n) / n;
}
function St(t) {
	return typeof t == 'function' ? t() : t === 'clipping-ancestors' ? 'clippingAncestors' : t;
}
function bn(t, e, n) {
	const o = t || e.createElement('div');
	return fn({ element: o, padding: n.arrowPadding });
}
function An(t, e) {
	if (!te(e.offset ?? e.gutter))
		return rn(({ placement: n }) => {
			const o = (t?.clientHeight || 0) / 2,
				i = e.offset?.mainAxis ?? e.gutter,
				r = typeof i == 'number' ? i + o : (i ?? o),
				{ hasAlign: s } = yn(n),
				c = s ? void 0 : e.shift,
				l = e.offset?.crossAxis ?? c;
			return oe({ crossAxis: l, mainAxis: r, alignmentAxis: e.shift });
		});
}
function On(t) {
	if (!t.flip) return;
	const e = St(t.boundary);
	return cn({ ...(e ? { boundary: e } : void 0), padding: t.overflowPadding, fallbackPlacements: t.flip === !0 ? void 0 : t.flip });
}
function Sn(t) {
	if (!t.slide && !t.overlap) return;
	const e = St(t.boundary);
	return sn({ ...(e ? { boundary: e } : void 0), mainAxis: t.slide, crossAxis: t.overlap, padding: t.overflowPadding, limiter: un() });
}
function Rn(t) {
	return ln({
		padding: t.overflowPadding,
		apply({ elements: e, rects: n, availableHeight: o, availableWidth: i }) {
			const r = e.floating,
				s = Math.round(n.reference.width),
				c = Math.round(n.reference.height);
			((i = Math.floor(i)),
				(o = Math.floor(o)),
				r.style.setProperty('--reference-width', `${s}px`),
				r.style.setProperty('--reference-height', `${c}px`),
				r.style.setProperty('--available-width', `${i}px`),
				r.style.setProperty('--available-height', `${o}px`));
		}
	});
}
function Pn(t) {
	if (t.hideWhenDetached) return an({ strategy: 'referenceHidden', boundary: St(t.boundary) ?? 'clippingAncestors' });
}
function Cn(t) {
	return t ? (t === !0 ? { ancestorResize: !0, ancestorScroll: !0, elementResize: !0, layoutShift: !0 } : t) : {};
}
function Tn(t, e, n = {}) {
	const o = n.getAnchorElement?.() ?? t,
		i = hn(o, n.getAnchorRect);
	if (!e || !i) return;
	const r = Object.assign({}, vn, n),
		s = e.querySelector('[data-part=arrow]'),
		c = [
			An(s, r),
			On(r),
			Sn(r),
			bn(s, e.ownerDocument, r),
			xn(s),
			pn({ gutter: r.gutter, offset: r.offset, overlap: r.overlap }, s),
			Rn(r),
			Pn(r),
			wn
		],
		{ placement: l, strategy: a, onComplete: u, onPositioned: f } = r,
		h = async () => {
			if (!i || !e) return;
			const p = await dn(i, e, { placement: l, middleware: c, strategy: a });
			(u?.(p), f?.({ placed: !0 }));
			const w = ee(e),
				x = Ft(w, p.x),
				y = Ft(w, p.y);
			(e.style.setProperty('--x', `${x}px`),
				e.style.setProperty('--y', `${y}px`),
				r.hideWhenDetached &&
					(p.middlewareData.hide?.referenceHidden
						? (e.style.setProperty('visibility', 'hidden'), e.style.setProperty('pointer-events', 'none'))
						: (e.style.removeProperty('visibility'), e.style.removeProperty('pointer-events'))));
			const v = e.firstElementChild;
			if (v) {
				const b = ne(v);
				e.style.setProperty('--z-index', b.zIndex);
			}
		},
		d = async () => {
			n.updatePosition ? (await n.updatePosition({ updatePosition: h, floatingElement: e }), f?.({ placed: !0 })) : await h();
		},
		m = Cn(r.listeners),
		g = r.listeners ? on(i, e, d, m) : Zt;
	return (
		d(),
		() => {
			(g?.(), f?.({ placed: !1 }));
		}
	);
}
function zn(t, e, n = {}) {
	const { defer: o, ...i } = n,
		r = o ? Kt : (c) => c(),
		s = [];
	return (
		s.push(
			r(() => {
				const c = typeof t == 'function' ? t() : t,
					l = typeof e == 'function' ? e() : e;
				s.push(Tn(c, l, i));
			})
		),
		() => {
			s.forEach((c) => c?.());
		}
	);
}
var En = { bottom: 'rotate(45deg)', left: 'rotate(135deg)', top: 'rotate(225deg)', right: 'rotate(315deg)' };
function Bn(t = {}) {
	const { placement: e, sameWidth: n, fitViewport: o, strategy: i = 'absolute' } = t;
	return {
		arrow: {
			position: 'absolute',
			width: V.arrowSize.reference,
			height: V.arrowSize.reference,
			[V.arrowSizeHalf.variable]: `calc(${V.arrowSize.reference} / 2)`,
			[V.arrowOffset.variable]: `calc(${V.arrowSizeHalf.reference} * -1)`
		},
		arrowTip: {
			transform: e ? En[e.split('-')[0]] : void 0,
			background: V.arrowBg.reference,
			top: '0',
			left: '0',
			width: '100%',
			height: '100%',
			position: 'absolute',
			zIndex: 'inherit'
		},
		floating: {
			position: i,
			isolation: 'isolate',
			minWidth: n ? void 0 : 'max-content',
			width: n ? 'var(--reference-width)' : void 0,
			maxWidth: o ? 'var(--available-width)' : void 0,
			maxHeight: o ? 'var(--available-height)' : void 0,
			pointerEvents: e ? void 0 : 'none',
			top: '0px',
			left: '0px',
			transform: e ? 'translate3d(var(--x), var(--y), 0)' : 'translate3d(0, -100vh, 0)',
			zIndex: 'var(--z-index)'
		}
	};
}
function Mn(t, e) {
	re(e, !0);
	const n = se(),
		o = mt(() => e.children),
		i = mt(() => Pt(e.disabled, !1)),
		r = mt(() => Pt(e.target, () => (typeof window > 'u' ? void 0 : document.body), !0));
	ce(() => {
		if (G(i) || !G(r)) return;
		const a = ae(G(o), { target: G(r), context: n });
		return () => fe(a);
	});
	var s = Ct(),
		c = Rt(s);
	{
		var l = (a) => {
			var u = Ct(),
				f = Rt(u);
			(ue(f, () => G(o)), Tt(a, u));
		};
		ie(c, (a) => {
			(G(i) || !G(r)) && a(l);
		});
	}
	(Tt(t, s), le());
}
const Fn = Mn;
export { Fn as P, Bn as a, kn as b, zn as g };
//# sourceMappingURL=Kpla-k0W.js.map
