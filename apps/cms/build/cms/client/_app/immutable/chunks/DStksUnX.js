import { i as c } from './zi73tRJP.js';
import { f as u, c as _, r as p, t as d } from './DrlZFkx8.js';
import { c as h, a as r, f as i, s as b } from './CTjXDULS.js';
import { a as l } from './MEFvoR_D.js';
var x = i('<a class="email-link svelte-1yn2yb4"> </a>'),
	y = i('<span>–</span>');
function j(f, e) {
	var s = h(),
		m = u(s);
	{
		var o = (t) => {
				var a = x(),
					n = _(a, !0);
				(p(a),
					d(() => {
						(l(a, 'href', `mailto:${e.value ?? ''}`), l(a, 'title', `Send email to ${e.value ?? ''}`), b(n, e.value));
					}),
					r(t, a));
			},
			v = (t) => {
				var a = y();
				r(t, a);
			};
		c(m, (t) => {
			e.value ? t(o) : t(v, !1);
		});
	}
	r(f, s);
}
export { j as default };
//# sourceMappingURL=DStksUnX.js.map
