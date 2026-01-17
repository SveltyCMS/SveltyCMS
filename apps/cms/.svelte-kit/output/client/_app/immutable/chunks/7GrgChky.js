import { i as g } from './zi73tRJP.js';
import { p as x, c as l, s as p, r as s, t as d, g as h, u as y, a as O } from './DrlZFkx8.js';
import { f as u, s as v, a as f } from './CTjXDULS.js';
var k = u('<div class="mb-1 text-base font-normal text-surface-700"> </div>'),
	D = u('<div><!> <span> </span></div>');
function q(o, e) {
	x(e, !0);
	const c = y(() => (e.value === null || e.value === void 0 ? '–' : e.field.options?.find((a) => a.value === e.value)?.label || String(e.value)));
	var i = D(),
		r = l(i);
	{
		var m = (t) => {
			var a = k(),
				b = l(a, !0);
			(s(a), d(() => v(b, e.field.ledgent)), f(t, a));
		};
		g(r, (t) => {
			e.field.ledgent && t(m);
		});
	}
	var n = p(r, 2),
		_ = l(n, !0);
	(s(n), s(i), d(() => v(_, h(c))), f(o, i), O());
}
export { q as default };
//# sourceMappingURL=7GrgChky.js.map
