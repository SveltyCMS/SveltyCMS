import { j as l, k as i, w as h, G as c, X as w, Y as p, Z as v, q as y, o as _ } from './DrlZFkx8.js';
import { B as E } from './CTjXDULS.js';
function S(n, f, o = !1) {
	i && h();
	var r = new E(n),
		d = o ? c : 0;
	function t(a, e) {
		if (i) {
			const u = w(n) === p;
			if (a === u) {
				var s = v();
				(y(s), (r.anchor = s), _(!1), r.ensure(a, e), _(!0));
				return;
			}
		}
		r.ensure(a, e);
	}
	l(() => {
		var a = !1;
		(f((e, s = !0) => {
			((a = !0), t(s, e));
		}),
			a || t(!1, null));
	}, d);
}
const T = '5';
typeof window < 'u' && ((window.__svelte ??= {}).v ??= new Set()).add(T);
export { S as i };
//# sourceMappingURL=zi73tRJP.js.map
