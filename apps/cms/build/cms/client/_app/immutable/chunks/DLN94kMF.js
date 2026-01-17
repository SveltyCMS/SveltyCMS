import { i as n } from './zi73tRJP.js';
import { f as u, c as _, r as p, t as d } from './DrlZFkx8.js';
import { c as h, a as r, f, s as b } from './CTjXDULS.js';
import { a as l } from './MEFvoR_D.js';
var x = f('<a class="tel-link svelte-mbvr15"> </a>'),
	k = f('<span>–</span>');
function j(i, e) {
	var s = h(),
		m = u(s);
	{
		var o = (t) => {
				var a = x(),
					c = _(a, !0);
				(p(a),
					d(() => {
						(l(a, 'href', `tel:${e.value ?? ''}`), l(a, 'title', `Call ${e.value ?? ''}`), b(c, e.value));
					}),
					r(t, a));
			},
			v = (t) => {
				var a = k();
				r(t, a);
			};
		n(m, (t) => {
			e.value ? t(o) : t(v, !1);
		});
	}
	r(i, s);
}
export { j as default };
//# sourceMappingURL=DLN94kMF.js.map
