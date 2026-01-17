import { i as S } from './zi73tRJP.js';
import { p as P, f, a as E, g as a, u as o, c as M, A as j, r as B, bx as C, e as W } from './DrlZFkx8.js';
import { c as h, a as g, f as A, r as w, p as G } from './CTjXDULS.js';
import { s as _ } from './DhHAlOU0.js';
import { f as O } from './MEFvoR_D.js';
import { r as L } from './DePHBZW_.js';
import { c as J, m as N, a as K, u as Q, n as U } from './DtaauZrZ.js';
import { p as V, q as X, s as Y, u as Z, x as z } from './C-hhfhAN.js';
const R = J();
var ee = A('<span><!></span>');
function ae(e, t) {
	P(t, !0);
	const n = L(t, ['$$slots', '$$events', '$$legacy']),
		i = R.consume(),
		c = o(() => t.element),
		d = o(() => t.children),
		l = o(() => C(n, ['element', 'children'])),
		m = o(() => N(i().getFallbackProps(), a(l)));
	var u = h(),
		b = f(u);
	{
		var k = (r) => {
				var s = h(),
					p = f(s);
				(_(
					p,
					() => a(c),
					() => a(m)
				),
					g(r, s));
			},
			v = (r) => {
				var s = ee();
				O(s, () => ({ ...a(m) }));
				var p = M(s);
				(_(p, () => a(d) ?? j), B(s), g(r, s));
			};
		S(b, (r) => {
			a(c) ? r(k) : r(v, !1);
		});
	}
	(g(e, u), E());
}
var te = A('<img/>');
function re(e, t) {
	P(t, !0);
	const n = L(t, ['$$slots', '$$events', '$$legacy']),
		i = R.consume(),
		c = o(() => t.element),
		d = o(() => C(n, ['element'])),
		l = o(() => N(i().getImageProps(), a(d)));
	var m = h(),
		u = f(m);
	{
		var b = (v) => {
				var r = h(),
					s = f(r);
				(_(
					s,
					() => a(c),
					() => a(l)
				),
					g(v, r));
			},
			k = (v) => {
				var r = te();
				(O(r, () => ({ ...a(l) })), w(r), g(v, r));
			};
		S(u, (v) => {
			a(c) ? v(b) : v(k, !1);
		});
	}
	(g(e, m), E());
}
function oe(e, t) {
	P(t, !0);
	const n = R.consume(),
		i = o(() => t.children);
	var c = h(),
		d = f(c);
	(_(
		d,
		() => a(i),
		() => n
	),
		g(e, c),
		E());
}
var ne = A('<div><!></div>');
function se(e, t) {
	P(t, !0);
	const n = L(t, ['$$slots', '$$events', '$$legacy']),
		i = o(() => t.element),
		c = o(() => t.children),
		d = o(() => t.value),
		l = o(() => C(n, ['element', 'children', 'value'])),
		m = o(() => N(a(d)().getRootProps(), a(l)));
	R.provide(() => a(d)());
	var u = h(),
		b = f(u);
	{
		var k = (r) => {
				var s = h(),
					p = f(s);
				(_(
					p,
					() => a(i),
					() => a(m)
				),
					g(r, s));
			},
			v = (r) => {
				var s = ne();
				O(s, () => ({ ...a(m) }));
				var p = M(s);
				(_(p, () => a(c) ?? j), B(s), g(r, s));
			};
		S(b, (r) => {
			a(i) ? r(k) : r(v, !1);
		});
	}
	(g(e, u), E());
}
var ie = V('avatar').parts('root', 'image', 'fallback'),
	$ = ie.build(),
	T = (e) => e.ids?.root ?? `avatar:${e.id}`,
	q = (e) => e.ids?.image ?? `avatar:${e.id}:image`,
	ce = (e) => e.ids?.fallback ?? `avatar:${e.id}:fallback`,
	de = (e) => e.getById(T(e)),
	x = (e) => e.getById(q(e));
function le(e, t) {
	const { state: n, send: i, prop: c, scope: d } = e,
		l = n.matches('loaded');
	return {
		loaded: l,
		setSrc(m) {
			x(d)?.setAttribute('src', m);
		},
		setLoaded() {
			i({ type: 'img.loaded', src: 'api' });
		},
		setError() {
			i({ type: 'img.error', src: 'api' });
		},
		getRootProps() {
			return t.element({ ...$.root.attrs, dir: c('dir'), id: T(d) });
		},
		getImageProps() {
			return t.img({
				...$.image.attrs,
				hidden: !l,
				dir: c('dir'),
				id: q(d),
				'data-state': l ? 'visible' : 'hidden',
				onLoad() {
					i({ type: 'img.loaded', src: 'element' });
				},
				onError() {
					i({ type: 'img.error', src: 'element' });
				}
			});
		},
		getFallbackProps() {
			return t.element({ ...$.fallback.attrs, dir: c('dir'), id: ce(d), hidden: l, 'data-state': l ? 'hidden' : 'visible' });
		}
	};
}
var me = X({
	initialState() {
		return 'loading';
	},
	effects: ['trackImageRemoval', 'trackSrcChange'],
	on: { 'src.change': { target: 'loading' }, 'img.unmount': { target: 'error' } },
	states: {
		loading: {
			entry: ['checkImageStatus'],
			on: { 'img.loaded': { target: 'loaded', actions: ['invokeOnLoad'] }, 'img.error': { target: 'error', actions: ['invokeOnError'] } }
		},
		error: { on: { 'img.loaded': { target: 'loaded', actions: ['invokeOnLoad'] } } },
		loaded: { on: { 'img.error': { target: 'error', actions: ['invokeOnError'] } } }
	},
	implementations: {
		actions: {
			invokeOnLoad({ prop: e }) {
				e('onStatusChange')?.({ status: 'loaded' });
			},
			invokeOnError({ prop: e }) {
				e('onStatusChange')?.({ status: 'error' });
			},
			checkImageStatus({ send: e, scope: t }) {
				const n = x(t);
				if (!n?.complete) return;
				const i = ve(n) ? 'img.loaded' : 'img.error';
				e({ type: i, src: 'ssr' });
			}
		},
		effects: {
			trackImageRemoval({ send: e, scope: t }) {
				const n = de(t);
				return Z(n, {
					callback(i) {
						Array.from(i[0].removedNodes).find((l) => l.nodeType === Node.ELEMENT_NODE && l.matches('[data-scope=avatar][data-part=image]')) &&
							e({ type: 'img.unmount' });
					}
				});
			},
			trackSrcChange({ send: e, scope: t }) {
				const n = x(t);
				return Y(n, {
					attributes: ['src', 'srcset'],
					callback() {
						e({ type: 'src.change' });
					}
				});
			}
		}
	}
});
function ve(e) {
	return e.complete && e.naturalWidth !== 0 && e.naturalHeight !== 0;
}
var ge = K()(['dir', 'id', 'ids', 'onStatusChange', 'getRootNode']),
	ue = z(ge);
function pe(e) {
	const t = Q(me, e),
		n = o(() => le(t, U));
	return () => a(n);
}
var fe = A('<div><!></div>');
function he(e, t) {
	const n = G();
	P(t, !0);
	const i = L(t, ['$$slots', '$$events', '$$legacy']),
		c = o(() => ue(i)),
		d = o(() => W(a(c), 2)),
		l = o(() => a(d)[0]),
		m = o(() => a(d)[1]),
		u = o(() => a(m).element),
		b = o(() => a(m).children),
		k = o(() => C(a(m), ['element', 'children'])),
		v = pe(() => ({ ...a(l), id: n })),
		r = o(() => N(v().getRootProps(), a(k)));
	R.provide(() => v());
	var s = h(),
		p = f(s);
	{
		var D = (I) => {
				var y = h(),
					F = f(y);
				(_(
					F,
					() => a(u),
					() => a(r)
				),
					g(I, y));
			},
			H = (I) => {
				var y = fe();
				O(y, () => ({ ...a(r) }));
				var F = M(y);
				(_(F, () => a(b) ?? j), B(y), g(I, y));
			};
		S(p, (I) => {
			a(u) ? I(D) : I(H, !1);
		});
	}
	(g(e, s), E());
}
const Se = Object.assign(he, { Provider: se, Context: oe, Image: re, Fallback: ae });
export { Se as A };
//# sourceMappingURL=C1IuIusZ.js.map
