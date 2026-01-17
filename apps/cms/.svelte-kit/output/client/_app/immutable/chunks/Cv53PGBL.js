import { i as c } from './zi73tRJP.js';
import { p as D, f as m, a as E, t as l, g as F, u as j, r as q } from './DrlZFkx8.js';
import { c as v, a as r, f as s } from './CTjXDULS.js';
import { e as z, i as B } from './BXe5mj2j.js';
import { b as _, c as d, a as C } from './MEFvoR_D.js';
var G = s('<iconify-icon></iconify-icon>', 2),
	H = s('<iconify-icon></iconify-icon>', 2),
	I = s('<div class="display-wrapper svelte-7l66vd"></div>'),
	J = s('<span>–</span>');
function Q(u, a) {
	D(a, !0);
	const y = j(() => Array(a.field.max || 5).fill(0));
	var f = v(),
		b = m(f);
	{
		var g = (t) => {
				var e = I();
				(z(
					e,
					21,
					() => F(y),
					B,
					(x, K, h) => {
						var n = v(),
							w = m(n);
						{
							var k = (o) => {
									var i = G();
									(l(() => _(i, 'icon', a.field.iconFull || 'material-symbols:star')), d(i, 1, 'text-warning-500'), r(o, i));
								},
								A = (o) => {
									var i = H();
									(l(() => _(i, 'icon', a.field.iconEmpty || 'material-symbols:star-outline')), d(i, 1, 'text-gray-300'), r(o, i));
								};
							c(w, (o) => {
								h < a.value ? o(k) : o(A, !1);
							});
						}
						r(x, n);
					}
				),
					q(e),
					l(() => C(e, 'title', `${a.value ?? ''} out of ${(a.field.max || 5) ?? ''} stars`)),
					r(t, e));
			},
			p = (t) => {
				var e = J();
				r(t, e);
			};
		c(b, (t) => {
			typeof a.value == 'number' && a.value > 0 ? t(g) : t(p, !1);
		});
	}
	(r(u, f), E());
}
export { Q as default };
//# sourceMappingURL=Cv53PGBL.js.map
