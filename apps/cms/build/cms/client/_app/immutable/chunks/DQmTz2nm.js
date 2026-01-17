import { i as g } from './zi73tRJP.js';
import { p as k, f as x, a as b, c as f, s as y, r as c, t as w, g as C, u as D } from './DrlZFkx8.js';
import { c as H, a as t, f as u, s as V } from './CTjXDULS.js';
import { a as j, s as q } from './MEFvoR_D.js';
var z = u(
		'<div class="display-wrapper svelte-3l9hkh"><div class="swatch-preview svelte-3l9hkh"></div> <span class="hex-code svelte-3l9hkh"> </span></div>'
	),
	A = u('<span>–</span>');
function I(d, a) {
	k(a, !0);
	const l = (e) => /^#[0-9a-f]{6}$/i.test(e),
		n = D(() => (a.value && l(a.value) ? a.value : '#000000'));
	var r = H(),
		m = x(r);
	{
		var h = (e) => {
				var s = z(),
					v = f(s);
				let i;
				var o = y(v, 2),
					p = f(o, !0);
				(c(o),
					c(s),
					w(() => {
						(j(s, 'title', a.value), (i = q(v, '', i, { 'background-color': C(n) })), V(p, a.value));
					}),
					t(e, s));
			},
			_ = (e) => {
				var s = A();
				t(e, s);
			};
		g(m, (e) => {
			a.value && l(a.value) ? e(h) : e(_, !1);
		});
	}
	(t(d, r), b());
}
export { I as default };
//# sourceMappingURL=DQmTz2nm.js.map
