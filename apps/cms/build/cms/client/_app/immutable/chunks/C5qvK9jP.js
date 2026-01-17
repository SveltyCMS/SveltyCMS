import { i as _ } from './zi73tRJP.js';
import { p as b, d as y, x, z as j, b as n, c as I, g as s, r as k, a as z, f as A, t as P } from './DrlZFkx8.js';
import { f, a as o, c as U } from './CTjXDULS.js';
import { e as w } from './BXe5mj2j.js';
import { a as p } from './MEFvoR_D.js';
var D = f('<img class="h-8 w-8 rounded border border-surface-200 object-cover dark:text-surface-50"/>'),
	q = f('<span>–</span>'),
	B = f('<div class="flex items-center justify-center gap-1 p-0.5"><!></div>');
function J(u, t) {
	b(t, !0);
	let r = y(x([]));
	j(() => {
		const e = Array.isArray(t.value) ? t.value : t.value ? [t.value] : [];
		e.length > 0
			? Promise.all(
					e.map((a) =>
						Promise.resolve({
							_id: a,
							name: `Image ${a.slice(0, 4)}.jpg`,
							type: 'image/jpeg',
							size: 12345,
							url: `https://picsum.photos/id/${parseInt(a.slice(0, 3), 10)}/1920/1080`,
							thumbnailUrl: `https://picsum.photos/id/${parseInt(a.slice(0, 3), 10)}/50/50`
						})
					)
				).then((a) => {
					n(r, a, !0);
				})
			: n(r, [], !0);
	});
	var l = B(),
		v = I(l);
	{
		var d = (e) => {
				var a = U(),
					g = A(a);
				(w(
					g,
					17,
					() => s(r),
					(m) => m._id,
					(m, c) => {
						var i = D();
						(P(() => {
							(p(i, 'src', s(c).thumbnailUrl), p(i, 'alt', s(c).name), p(i, 'title', s(c).name));
						}),
							o(m, i));
					}
				),
					o(e, a));
			},
			h = (e) => {
				var a = q();
				o(e, a);
			};
		_(v, (e) => {
			s(r).length > 0 ? e(d) : e(h, !1);
		});
	}
	(k(l), o(u, l), z());
}
export { J as default };
//# sourceMappingURL=C5qvK9jP.js.map
