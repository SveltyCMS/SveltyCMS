import { i as u } from './zi73tRJP.js';
import { p as k, f as x, a as z, c as D, g as t, u as p, s as L, r as c } from './DrlZFkx8.js';
import { c as U, a as s, f } from './CTjXDULS.js';
import { e as j } from './BXe5mj2j.js';
import { a as q } from './C-hhfhAN.js';
import { S as w } from './CWif1oam.js';
var A = f('<li><!> <!></li>'),
	B = f('<ul class="menu-display-list list-none pl-4"></ul>'),
	C = f('<span>–</span>');
function E(d, l) {
	k(l, !0);
	const _ = p(() => q.contentLanguage);
	var v = U(),
		g = x(v);
	{
		var h = (a) => {
				var r = B();
				(j(
					r,
					21,
					() => l.value,
					(i) => i._id,
					(i, o) => {
						var n = A(),
							m = D(n);
						{
							let e = p(() => t(o)._fields?.title?.[t(_)] || 'Untitled');
							w(m, {
								get html() {
									return t(e);
								},
								profile: 'strict'
							});
						}
						var y = L(m, 2);
						{
							var S = (e) => {
								E(e, {
									get value() {
										return t(o).children;
									}
								});
							};
							u(y, (e) => {
								t(o).children.length > 0 && e(S);
							});
						}
						(c(n), s(i, n));
					}
				),
					c(r),
					s(a, r));
			},
			b = (a) => {
				var r = C();
				s(a, r);
			};
		u(g, (a) => {
			l.value && l.value.length > 0 ? a(h) : a(b, !1);
		});
	}
	(s(d, v), z());
}
export { E as default };
//# sourceMappingURL=QsBkbV6A.js.map
