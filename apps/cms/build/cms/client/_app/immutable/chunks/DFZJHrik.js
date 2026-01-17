import './zi73tRJP.js';
import { p as D, f as E, c as e, r as a, s, n as F, t as G, g as y, u as k, a as H } from './DrlZFkx8.js';
import { f as J, s as i, a as K, d as M } from './CTjXDULS.js';
import { r as N, c as P, d as Q, a as R } from './MEFvoR_D.js';
import { b as U } from './D4QnGYgQ.js';
import { p as V } from './DePHBZW_.js';
import { at as X, ap as Y, aq as Z, ar as $, au as tt } from './N8Jg0v49.js';
var et = J(
	'<label for="title-input"><div class="flex items-center justify-between"><div class="text-black dark:text-white"> </div> <div class="flex flex-col text-xs sm:flex-row sm:text-base"><div> <span class="text-primary-500"> </span></div> <div> <span class="text-primary-500"> </span> <span class="text-primary-500"> </span>/654px</div></div></div> <div id="title-status" class="status-message svelte-czzw1g" aria-live="polite"> </div></label> <input id="title-input" type="text" class="input text-black dark:text-primary-500" required aria-describedby="title-status"/>',
	1
);
function pt(z, l) {
	D(l, !0);
	let t = V(l, 'title', 15);
	const C = k(() =>
			t().length >= 50 && t().length <= 60
				? 'input-label green'
				: t().length >= 30 && t().length <= 49
					? 'input-label orange'
					: t().length < 30
						? 'input-label'
						: 'input-label red'
		),
		T = k(() =>
			t().length >= 50 && t().length <= 60
				? 'Optimal length'
				: t().length >= 30 && t().length <= 49
					? 'Length is acceptable'
					: t().length < 30
						? 'Too short'
						: 'Too long'
		);
	var g = et(),
		r = E(g),
		d = e(r),
		p = e(d),
		q = e(p, !0);
	a(p);
	var _ = s(p, 2),
		o = e(_),
		c = e(o),
		h = s(c),
		W = e(h, !0);
	(a(h), a(o));
	var m = s(o, 2),
		x = e(m),
		v = s(x),
		j = e(v, !0);
	a(v);
	var f = s(v),
		b = s(f),
		I = e(b, !0);
	(a(b), F(), a(m), a(_), a(d));
	var w = s(d, 2),
		L = e(w, !0);
	(a(w), a(r));
	var n = s(r, 2);
	(N(n),
		(n.__input = function (...u) {
			l.handleTitleChange?.apply(this, u);
		}),
		G(
			(u, O, S, A, B) => {
				(P(r, 1, Q(y(C)), 'svelte-czzw1g'),
					i(q, u),
					i(c, `${O ?? ''} `),
					i(W, t().length),
					i(x, `${S ?? ''} `),
					i(j, l.titleCharacterWidth),
					i(
						f,
						`/600px
				${A ?? ''} `
					),
					i(I, l.titleCharacterWidth),
					i(L, y(T)),
					R(n, 'placeholder', B));
			},
			[() => X(), () => Y(), () => Z(), () => $(), () => tt()]
		),
		U(n, t),
		K(z, g),
		H());
}
M(['input']);
export { pt as default };
//# sourceMappingURL=DFZJHrik.js.map
