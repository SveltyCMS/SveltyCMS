import { i as d } from './zi73tRJP.js';
import { p as z, f as D, a as V, c as s, s as x, r, t as _ } from './DrlZFkx8.js';
import { c as q, a as i, f as u, s as p } from './CTjXDULS.js';
import { a as o } from './MEFvoR_D.js';
var A = u('<span class="shrink-0 text-xs text-gray-500"> </span>'),
	B = u(
		'<div class="flex w-full max-w-full items-center gap-2.5"><img class="h-auto w-[60px] shrink-0 rounded-md object-cover" loading="lazy" decoding="async"/> <div class="flex min-w-0 flex-wrap items-center gap-x-2"><span class="max-w-48 truncate text-sm font-medium"> </span> <!></div></div>'
	),
	C = u('<span class="text-gray-400">–</span>');
function I(g, a) {
	z(a, !0);
	var f = q(),
		h = D(f);
	{
		var b = (t) => {
				var e = B(),
					l = s(e),
					c = x(l, 2),
					n = s(c),
					y = s(n, !0);
				r(n);
				var k = x(n, 2);
				{
					var U = (v) => {
						var m = A(),
							j = s(m, !0);
						(r(m), _(() => p(j, a.value.duration)), i(v, m));
					};
					d(k, (v) => {
						a.value.duration && v(U);
					});
				}
				(r(c),
					r(e),
					_(() => {
						(o(e, 'title', a.value.title ?? ''),
							o(l, 'src', a.value.thumbnailUrl),
							o(l, 'alt', a.value.title || 'Video thumbnail'),
							p(y, a.value.title));
					}),
					i(t, e));
			},
			w = (t) => {
				var e = C();
				i(t, e);
			};
		d(h, (t) => {
			a.value?.thumbnailUrl ? t(b) : t(w, !1);
		});
	}
	(i(g, f), V());
}
export { I as default };
//# sourceMappingURL=z43FlM0G.js.map
