import { j as p, G as c, k as f, w as l, J as m, v as _, l as d } from './DrlZFkx8.js';
import { B as h, g as u, h as g } from './CTjXDULS.js';
function y(r, t, ...n) {
	var a = new h(r);
	p(() => {
		const e = t() ?? null;
		a.ensure(e, e && ((s) => e(s, ...n)));
	}, c);
}
function b(r) {
	return (t, ...n) => {
		var a = r(...n),
			e;
		if (f) ((e = _), l());
		else {
			var s = a.render().trim(),
				i = u(s);
			((e = d(i)), t.before(e));
		}
		const o = a.setup?.(e);
		(g(e, e), typeof o == 'function' && m(o));
	};
}
export { b as c, y as s };
//# sourceMappingURL=DhHAlOU0.js.map
