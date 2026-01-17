import './zi73tRJP.js';
import { p as B, f as E, c as e, r as a, s, n as F, ag as G, t as H, g as y, u as k, a as J } from './DrlZFkx8.js';
import { f as K, s as i, a as M, d as N } from './CTjXDULS.js';
import { c as P, d as Q, a as R } from './MEFvoR_D.js';
import { b as U } from './D4QnGYgQ.js';
import { p as V } from './DePHBZW_.js';
import { ao as X, ap as Y, aq as Z, ar as $, as as tt } from './N8Jg0v49.js';
var et = K(
	'<label for="description-input"><div class="flex justify-between"><div class="text-black dark:text-white"> </div> <div class="flex flex-col text-xs sm:flex-row sm:text-base"><div> <span class="text-primary-500"> </span></div> <div> <span class="text-primary-500"> </span> <span class="text-primary-500"> </span>/981px</div></div></div> <div class="status-message svelte-l3srj4" aria-live="polite"> </div></label> <textarea id="description-input" name="description-input" rows="2" cols="50" class="input text-black dark:text-primary-500" aria-describedby="description-status"></textarea>',
	1
);
function dt(C, r) {
	B(r, !0);
	let t = V(r, 'description', 15);
	const j = k(() =>
			t().length >= 120 && t().length <= 165
				? 'input-label green'
				: t().length >= 30 && t().length <= 119
					? 'input-label orange'
					: t().length < 30
						? 'input-label'
						: 'input-label red'
		),
		D = k(() =>
			t().length >= 120 && t().length <= 165
				? 'Optimal length'
				: t().length >= 30 && t().length <= 119
					? 'Length is acceptable'
					: t().length < 30
						? 'Too short'
						: 'Too long'
		);
	var g = et(),
		n = E(g),
		o = e(n),
		d = e(o),
		T = e(d, !0);
	a(d);
	var _ = s(d, 2),
		p = e(_),
		u = e(p),
		x = s(u),
		W = e(x, !0);
	(a(x), a(p));
	var h = s(p, 2),
		m = e(h),
		c = s(m),
		q = e(c, !0);
	a(c);
	var f = s(c),
		b = s(f),
		I = e(b, !0);
	(a(b), F(), a(h), a(_), a(o));
	var w = s(o, 2),
		L = e(w, !0);
	(a(w), a(n));
	var l = s(n, 2);
	(G(l),
		(l.__input = function (...v) {
			r.handleDescriptionChange?.apply(this, v);
		}),
		H(
			(v, O, S, z, A) => {
				(P(n, 1, Q(y(j)), 'svelte-l3srj4'),
					i(T, v),
					i(u, `${O ?? ''} `),
					i(W, t().length),
					i(m, `${S ?? ''} `),
					i(q, r.descriptionCharacterWidth),
					i(
						f,
						`/970px
				${z ?? ''} `
					),
					i(I, r.descriptionCharacterWidth),
					i(L, y(D)),
					R(l, 'placeholder', A));
			},
			[() => X(), () => Y(), () => Z(), () => $(), () => tt()]
		),
		U(l, t),
		M(C, g),
		J());
}
N(['input']);
export { dt as default };
//# sourceMappingURL=CZQRWQsb.js.map
