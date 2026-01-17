import { i as n } from './zi73tRJP.js';
import { p as g, f as v, a as x, s as b, c as S, r as k, t as y } from './DrlZFkx8.js';
import { c as z, a as r, f as i, s as D } from './CTjXDULS.js';
import { S as j } from './CWif1oam.js';
var q = i('<h2> </h2>'),
	w = i('<!> <!>', 1),
	A = i('<span>–</span>');
function G(m, t) {
	g(t, !0);
	var f = z(),
		c = v(f);
	{
		var _ = (a) => {
				var e = w(),
					l = v(e);
				{
					var u = (s) => {
						var o = q(),
							d = S(o, !0);
						(k(o), y(() => D(d, t.value.title)), r(s, o));
					};
					n(l, (s) => {
						t.value.title && s(u);
					});
				}
				var h = b(l, 2);
				(j(h, {
					get html() {
						return t.value.content;
					},
					profile: 'rich-text',
					class: 'prose'
				}),
					r(a, e));
			},
			p = (a) => {
				var e = A();
				r(a, e);
			};
		n(c, (a) => {
			t.value?.content ? a(_) : a(p, !1);
		});
	}
	(r(m, f), x());
}
export { G as default };
//# sourceMappingURL=ByDJ-MCI.js.map
