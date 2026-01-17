import { i as b } from './zi73tRJP.js';
import { p as Q, z as R, b as K, d as U, c as n, s as S, r as l, t as u, g as i, u as q, a as V, f as N } from './DrlZFkx8.js';
import { f as g, a as o, c as C, s as D, d as W } from './CTjXDULS.js';
import { s as X } from './DhHAlOU0.js';
import { c as y, a as O, b as z } from './MEFvoR_D.js';
import { g as Y } from './D3eWcrZU.js';
var Z = g('<h4 class="m-0 text-base font-semibold text-gray-900 dark:text-gray-100"> </h4>'),
	$ = g('<button type="button"><!> <div><iconify-icon></iconify-icon></div></button>', 2),
	ee = g('<h4 class="m-0 text-base font-semibold text-gray-900 dark:text-gray-100"> </h4>'),
	re = g('<div><!></div>'),
	ae = g(
		'<div class="rounded border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"><pre class="whitespace-pre-wrap font-mono text-sm text-gray-700 dark:text-gray-300"> </pre></div>'
	),
	te = g(
		'<div class="flex items-center justify-center px-4 py-6"><p class="text-center text-sm italic text-gray-500 dark:text-gray-400">No content in this group</p></div>'
	),
	ie = g('<div><!> <div><!></div></div>');
function ce(A, e) {
	Q(e, !0);
	const E = q(() => Y(e.field)),
		F = {
			default: { container: '', header: 'border-b border-gray-200 bg-transparent dark:border-gray-700', content: 'bg-transparent pt-3' },
			card: {
				container: 'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800',
				header: 'rounded-t-lg border-b border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700',
				content: 'p-4'
			},
			bordered: {
				container: 'rounded-lg border border-gray-300 dark:border-gray-600',
				header: 'rounded-t-lg border-b border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-700',
				content: 'rounded-b-lg bg-white p-4 dark:bg-gray-800'
			}
		},
		x = q(() => F[e.field.variant] || F.default);
	let v = U(!1);
	R(() => {
		K(v, e.field.collapsed || !1, !0);
	});
	function I() {
		e.field.collapsible && K(v, !i(v));
	}
	function B(a) {
		(a.key === 'Enter' || a.key === ' ') && (a.preventDefault(), I());
	}
	var k = ie(),
		J = n(k);
	{
		var G = (a) => {
			var s = C(),
				m = N(s);
			{
				var w = (t) => {
						var r = $();
						((r.__click = I), (r.__keydown = B));
						var c = n(r);
						{
							var _ = (h) => {
								var j = Z(),
									P = n(j, !0);
								(l(j), u(() => D(P, e.field.groupTitle)), o(h, j));
							};
							b(c, (h) => {
								e.field.groupTitle && h(_);
							});
						}
						var d = S(c, 2),
							f = n(d);
						(z(f, 'icon', 'mdi:chevron-down'),
							z(f, 'width', '18'),
							z(f, 'height', '18'),
							y(f, 1, 'text-gray-500'),
							l(d),
							l(r),
							u(() => {
								(y(
									r,
									1,
									`flex w-full items-center justify-between p-3 transition-colors duration-200 ${i(x).header ?? ''} ${e.field.collapsible ? 'cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:hover:bg-gray-700' : ''}`
								),
									O(r, 'aria-expanded', !i(v)),
									O(r, 'aria-controls', `${i(E)}-content`),
									y(d, 1, `transition-transform duration-200 ease-in-out ${i(v) ? 'rotate-180' : ''}`));
							}),
							o(t, r));
					},
					T = (t) => {
						var r = re(),
							c = n(r);
						{
							var _ = (d) => {
								var f = ee(),
									h = n(f, !0);
								(l(f), u(() => D(h, e.field.groupTitle)), o(d, f));
							};
							b(c, (d) => {
								e.field.groupTitle && d(_);
							});
						}
						(l(r), u(() => y(r, 1, `flex items-center justify-between p-3 ${i(x).header ?? ''}`)), o(t, r));
					};
				b(m, (t) => {
					e.field.collapsible ? t(w) : t(T, !1);
				});
			}
			o(a, s);
		};
		b(J, (a) => {
			(e.field.groupTitle || e.field.collapsible) && a(G);
		});
	}
	var p = S(J, 2),
		H = n(p);
	{
		var L = (a) => {
				var s = C(),
					m = N(s);
				(X(m, () => e.children), o(a, s));
			},
			M = (a) => {
				var s = C(),
					m = N(s);
				{
					var w = (t) => {
							var r = ae(),
								c = n(r),
								_ = n(c, !0);
							(l(c), l(r), u((d) => D(_, d), [() => JSON.stringify(e.value, null, 2)]), o(t, r));
						},
						T = (t) => {
							var r = te();
							o(t, r);
						};
					b(
						m,
						(t) => {
							e.value && Object.keys(e.value).length > 0 ? t(w) : t(T, !1);
						},
						!0
					);
				}
				o(a, s);
			};
		b(H, (a) => {
			e.children ? a(L) : a(M, !1);
		});
	}
	(l(p),
		l(k),
		u(() => {
			(y(k, 1, `mb-4 w-full ${i(x).container ?? ''}`),
				O(p, 'id', e.field.collapsible ? `${i(E)}-content` : void 0),
				y(
					p,
					1,
					`overflow-hidden transition-all duration-200 ease-in-out ${i(x).content ?? ''} ${i(v) ? 'max-h-0 opacity-0' : 'max-h-screen opacity-100'}`
				));
		}),
		o(A, k),
		V());
}
W(['click', 'keydown']);
export { ce as default };
//# sourceMappingURL=CQoiXT3C.js.map
