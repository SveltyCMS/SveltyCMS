import { i as p } from './zi73tRJP.js';
import { p as y, f as b, a as g, c as l, s as h, r as n, t as x, g as w, u as K } from './DrlZFkx8.js';
import { c as D, a as i, f as c, s as T } from './CTjXDULS.js';
import { b as k, c as E, a as N } from './MEFvoR_D.js';
var O = c('<div class="seo-display svelte-1m84ivt"><iconify-icon></iconify-icon> <span> </span></div>', 2),
	S = c('<span>–</span>');
function B(v, a) {
	y(a, !0);
	const f = K(() => (a.value?.focusKeyword ? `Keyword: ${a.value.focusKeyword}` : 'No SEO data'));
	var r = D(),
		m = b(r);
	{
		var u = (e) => {
				var t = O(),
					s = l(t);
				(k(s, 'icon', 'tabler:seo'), E(s, 1, 'icon svelte-1m84ivt'));
				var o = h(s, 2),
					_ = l(o, !0);
				(n(o),
					n(t),
					x(() => {
						(N(t, 'title', `Title: ${a.value.title ?? ''} | Description: ${a.value.description ?? ''}`), T(_, w(f)));
					}),
					i(e, t));
			},
			d = (e) => {
				var t = S();
				i(e, t);
			};
		p(m, (e) => {
			a.value ? e(u) : e(d, !1);
		});
	}
	(i(v, r), g());
}
export { B as default };
//# sourceMappingURL=DjjsI40Y.js.map
