import { i as P } from './zi73tRJP.js';
import { p as T, f as E, a as j, c as i, r as h, t as w, g as s, u as L, s as v } from './DrlZFkx8.js';
import { c as M, a as p, f as C, s as m, b as q } from './CTjXDULS.js';
import { c as k, a as u, d as D } from './MEFvoR_D.js';
import { p as y } from './DePHBZW_.js';
import { p as F } from './C9E6SjbS.js';
var G = C('<span> </span>'),
	H = C('<span> <span class="text-primary-500"> </span> </span>'),
	J = C('<span> </span>');
function Y(S, l) {
	T(l, !0);
	const n = y(l, 'char', 3, null),
		f = y(l, 'textClass', 3, 'text-black dark:text-white'),
		a = L(() => l.siteName || F?.SITE_NAME || 'SveltyCMS'),
		c = L(() => {
			if (!l.highlight || !s(a)) return null;
			const t = s(a).indexOf(l.highlight);
			return t === -1
				? null
				: { before: s(a).substring(0, t), highlight: s(a).substring(t, t + l.highlight.length), after: s(a).substring(t + l.highlight.length) };
		});
	var o = M(),
		d = E(o);
	{
		var N = (t) => {
				var e = G(),
					_ = i(e, !0);
				(h(e),
					w(() => {
						(k(e, 1, `text-left font-bold ${f() ?? ''}`), m(_, n()));
					}),
					p(t, e));
			},
			x = (t) => {
				var e = M(),
					_ = E(e);
				{
					var A = (g) => {
							var r = H(),
								b = i(r, !0),
								z = v(b),
								I = i(z, !0);
							h(z);
							var O = v(z, 1, !0);
							(h(r),
								w(() => {
									(k(r, 1, `text-left font-bold ${f() ?? ''}`), m(b, s(c).before), m(I, s(c).highlight), m(O, s(c).after));
								}),
								p(g, r));
						},
						B = (g) => {
							var r = J(),
								b = i(r, !0);
							(h(r),
								w(() => {
									(k(r, 1, `text-left font-bold ${f() ?? ''}`), m(b, s(a)));
								}),
								p(g, r));
						};
					P(
						_,
						(g) => {
							s(c) ? g(A) : g(B, !1);
						},
						!0
					);
				}
				p(t, e);
			};
		P(d, (t) => {
			n() !== null ? t(N) : t(x, !1);
		});
	}
	(p(S, o), j());
}
var K = q(
	'<svg width="72" height="57" xmlns="http://www.w3.org/2000/svg" xml:space="preserve" viewBox="0 0 72 57"><defs><clipPath id="clippath"><rect id="svg_1" stroke-width="0px" fill="none" height="16.07" width="62.04" x="9.96" class="cls-2"></rect></clipPath><clipPath id="clippath-1"><rect id="svg_2" stroke-width="0px" fill="none" height="15.6" width="63.3" y="41.4" class="cls-2"></rect></clipPath></defs><g data-name="Layer 1" id="Layer_1-2"><g id="svg_3"><g id="svg_4" clip-path="url(#clippath)" class="cls-1"><path id="svg_5" fill-rule="evenodd" stroke-width="0px" d="m21.76,0l50.28,0l-11.73,15.88l-50.28,0l11.73,-15.88z" class="cls-4"></path></g><path id="svg_6" fill-rule="evenodd" style="filter: brightness(0.6);" stroke-width="0px" d="m10.03,15.88l25.14,0l-12.72,17.14l-11.05,-15.24l-1.37,-1.9z" class="cls-3"></path><g id="svg_7" clip-path="url(#clippath-1)" class="cls-5"><path id="svg_8" fill-rule="evenodd" stroke-width="0px" d="m50.31,57.47l-50.28,0l11.76,-15.88l50.28,0l-11.76,15.88z" class="cls-4"></path></g><path id="svg_9" fill-rule="evenodd" style="filter: brightness(0.6);" stroke-width="0px" d="m62.06,41.59l-25.14,0l12.7,-17.14l11.07,15.24l1.37,1.9z" class="cls-3"></path></g></g></svg>'
);
function Z(S, l) {
	const n = y(l, 'fill', 3, 'red'),
		f = y(l, 'className', 3, '');
	var a = K(),
		c = v(i(a)),
		o = i(c),
		d = i(o),
		N = i(d);
	h(d);
	var x = v(d),
		t = v(x),
		e = i(t);
	h(t);
	var _ = v(t);
	(h(o),
		h(c),
		h(a),
		w(() => {
			(u(a, 'fill', n()), k(a, 0, D(f())), u(N, 'fill', n()), u(x, 'fill', n()), u(e, 'fill', n()), u(_, 'fill', n()));
		}),
		p(S, a));
}
export { Y as S, Z as a };
//# sourceMappingURL=B9MNxn3G.js.map
