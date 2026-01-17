import { i as n } from './zi73tRJP.js';
import { c as d, r as g, t as u, g as h, u as w } from './DrlZFkx8.js';
import { f as l, a as r, b as x } from './CTjXDULS.js';
import { c as _ } from './MEFvoR_D.js';
import { p as z } from './DePHBZW_.js';
var b = x(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-label="Checked" role="img"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19L21 7l-1.41-1.41z"></path></svg>'
	),
	k = l('<span class="select-none text-lg text-surface-400 dark:text-surface-500" aria-label="Unchecked" role="img">−</span>'),
	C = l('<div class="flex h-full w-full items-center justify-center"><!></div>');
function M(o, t) {
	const i = z(t, 'size', 3, 'md'),
		c = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' },
		f = w(() => c[i()]);
	var a = C(),
		m = d(a);
	{
		var v = (s) => {
				var e = b();
				(u(() => _(e, 0, `text-success-500 ${h(f) ?? ''}`)), r(s, e));
			},
			p = (s) => {
				var e = k();
				r(s, e);
			};
		n(m, (s) => {
			t.value ? s(v) : s(p, !1);
		});
	}
	(g(a), r(o, a));
}
export { M as default };
//# sourceMappingURL=BzKCYPeF.js.map
