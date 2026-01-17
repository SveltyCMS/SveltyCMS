const __vite__mapDeps = (
	i,
	m = __vite__mapDeps,
	d = m.f ||
		(m.f = [
			'../chunks/CDoBYYfw.js',
			'../chunks/PPVm8Dsz.js',
			'../chunks/DaWZu8wl.js',
			'../chunks/DrlZFkx8.js',
			'../chunks/rsSWfq8L.js',
			'../chunks/MEFvoR_D.js',
			'../chunks/CTjXDULS.js',
			'../chunks/zi73tRJP.js',
			'../chunks/CMZtchEj.js',
			'../chunks/DhHAlOU0.js',
			'../chunks/BXe5mj2j.js',
			'../chunks/IGLJqrie.js',
			'../chunks/D4QnGYgQ.js',
			'../chunks/C3o2Q3i7.js',
			'../chunks/DHPSYX_z.js',
			'../chunks/B17Q6ahh.js',
			'../chunks/DvgRl2rN.js',
			'../chunks/XmViZn7X.js',
			'../chunks/DePHBZW_.js',
			'../assets/index.CfNQUw-c.css'
		])
) => i.map((i) => d[i]);
import { _ as F } from '../chunks/PPVm8Dsz.js';
import { i as P } from '../chunks/zi73tRJP.js';
import {
	k as y,
	w as H,
	j as O,
	aj as T,
	Y,
	q as Z,
	Z as C,
	o as I,
	I as G,
	L as k,
	R as A,
	ak as M,
	al as U,
	am as V,
	an as z,
	ao as J,
	ap as K,
	p as Q,
	f as b,
	a as W,
	g as m,
	u as D,
	s as X,
	c as R,
	r as j,
	t as $
} from '../chunks/DrlZFkx8.js';
import { B as ee, c as E, a as o, f as N, s as ae } from '../chunks/CTjXDULS.js';
import { c as re } from '../chunks/7bh91wXp.js';
const B = 0,
	L = 1;
function se(u, c, l, i, f) {
	y && H();
	var _ = K,
		n = A(_),
		r = A(_),
		s = new ee(u);
	O(() => {
		var v = c(),
			g = !1;
		let d = y && T(v) === (u.data === Y);
		if ((d && (Z(C()), I(!1)), T(v))) {
			var h = M(),
				x = !1;
			const e = (a) => {
				if (!g) {
					((x = !0), h(!1), U.ensure(), y && I(!1));
					try {
						a();
					} finally {
						(V(), z || J());
					}
				}
			};
			(v.then(
				(a) => {
					e(() => {
						(k(n, a), s.ensure(L, i && ((t) => i(t, n))));
					});
				},
				(a) => {
					e(() => {
						if ((k(r, a), s.ensure(L, f && ((t) => f(t, r))), !f)) throw r.v;
					});
				}
			),
				y
					? s.ensure(B, l)
					: G(() => {
							x ||
								e(() => {
									s.ensure(B, l);
								});
						}));
		} else (k(n, v), s.ensure(L, i && ((e) => i(e, n))));
		return (
			d && I(!0),
			() => {
				g = !0;
			}
		);
	});
}
var te = N(
		'<div class="rounded border border-red-200 bg-red-50 p-4 text-red-500"><p class="font-bold">Failed to load email previewer</p> <pre class="mt-2 text-xs"> </pre></div>'
	),
	ie = N(
		'<div class="flex h-full items-center justify-center p-10"><div class="text-center"><div class="mb-2 text-xl font-semibold">Loading Previewer...</div> <p class="text-sm text-gray-500">Fetching email templates</p></div></div>'
	),
	oe = N(
		'<div class="p-8 text-center text-gray-500"><p>No email templates found in <code class="rounded bg-gray-100 px-1 py-0.5">/src/components/emails</code>.</p></div>'
	);
function ce(u, c) {
	Q(c, !0);
	const l = D(() => ({ ...c.data, path: c.data.path ?? null }));
	var i = E(),
		f = b(i);
	{
		var _ = (r) => {
				var s = E(),
					v = b(s);
				{
					var g = (d) => {
						var h = E(),
							x = b(h);
						(se(
							x,
							() =>
								F(
									() => import('../chunks/CDoBYYfw.js').then((e) => e.i),
									__vite__mapDeps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
									import.meta.url
								),
							(e) => {
								var a = ie();
								o(e, a);
							},
							(e, a) => {
								const t = D(() => m(a).EmailPreview);
								var p = E(),
									w = b(p);
								(re(
									w,
									() => m(t),
									(S, q) => {
										q(S, {
											get emailList() {
												return m(l);
											}
										});
									}
								),
									o(e, p));
							},
							(e, a) => {
								var t = te(),
									p = X(R(t), 2),
									w = R(p, !0);
								(j(p), j(t), $(() => ae(w, m(a).message)), o(e, t));
							}
						),
							o(d, h));
					};
					P(v, (d) => {
						d(g);
					});
				}
				o(r, s);
			},
			n = (r) => {
				var s = oe();
				o(r, s);
			};
		P(f, (r) => {
			m(l).files && m(l).files.length ? r(_) : r(n, !1);
		});
	}
	(o(u, i), W());
}
export { ce as component };
//# sourceMappingURL=17.DIIjyaR7.js.map
