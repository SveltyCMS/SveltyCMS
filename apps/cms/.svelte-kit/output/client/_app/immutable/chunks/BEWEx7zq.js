import { i as le } from './zi73tRJP.js';
import { a as Fe } from './CMZtchEj.js';
import { p as Be, z as Pe, g as e, d as Q, b as z, a as Se, f as ze, c as t, s as i, r as a, t as H, u as h, n as Ue } from './DrlZFkx8.js';
import { c as Ge, a as U, f as V, s as F } from './CTjXDULS.js';
import { a as $e } from './BEiD40NV.js';
import { c as o, d as J } from './MEFvoR_D.js';
import { b as Re } from './YQp2a1pQ.js';
import { p } from './DePHBZW_.js';
import { C as K, P as Ae, A as Te, p as De } from './C4Hx6_Ca.js';
import { B as We } from './KG4G7ZS9.js';
const Ze = { name: 'Memory Usage', icon: 'mdi:memory', defaultSize: { w: 1, h: 2 } };
var je = V('<div class="flex flex-col space-y-1 text-center"><span>Free</span> <span> </span></div>'),
	Le = V(
		'<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Memory usage statistics"><div class="flex items-center space-x-3"><div class="flex items-center space-x-2"><div class="relative"><div></div> <div></div></div> <div class="flex w-full items-center justify-between"><div class="flex gap-2"><div class="text-sm font-bold" aria-live="polite"> </div> <div>Memory Used</div></div> <div class="flex gap-2"><div class="text-sm font-bold" aria-live="polite"> </div> <div>Memory Free</div></div></div></div></div> <h3>Memory Usage Overview</h3> <div class="relative shrink-0" style="height: 120px; min-height: 80px; max-height: 180px; width: 100%;"><canvas class="h-full w-full" style="display: block; width: 100% !important; height: 100% !important;" aria-label="Memory usage pie chart"></canvas></div> <h3>Memory Statistics</h3> <div class="shrink-0 space-y-3"><div><div class="flex flex-col text-center"><span>Total</span> <span class="text-sm font-semibold"> </span></div> <div class="flex flex-col text-center"><span>Used</span> <span> </span></div> <!></div></div></div>'
	),
	Ne = V(
		'<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite"><div class="relative"><div class="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" aria-hidden="true"></div></div> <div class="text-center"><div>Loading memory data</div> <div class="text-xs">Please wait...</div></div></div>'
	);
function et(ne, c) {
	(Be(c, !0), K.register(Ae, Te, De));
	const ve = p(c, 'label', 3, 'Memory Usage'),
		r = p(c, 'theme', 3, 'light'),
		me = p(c, 'icon', 3, 'mdi:memory'),
		ce = p(c, 'widgetId', 3, void 0),
		_ = p(c, 'size', 19, () => ({ w: 1, h: 2 })),
		fe = p(c, 'onSizeChange', 3, (B) => {}),
		ge = p(c, 'onRemove', 3, () => {});
	let b = Q(void 0),
		y = Q(void 0),
		M = Q(void 0);
	function xe(B, w) {
		return (
			z(b, w, !0),
			{
				update(n) {
					z(b, n, !0);
				}
			}
		);
	}
	(Pe(() => {
		if (!e(M) || !e(b)?.memoryInfo?.total) return;
		const B = e(b).memoryInfo.total.usedMemMb || 0,
			w = e(b).memoryInfo.total.freeMemMb || 0,
			n = e(b).memoryInfo.total.usedMemPercentage || 0,
			v = Number(B) || 0,
			k = Number(w) || 0;
		if (e(y)) ((e(y).data.datasets[0].data = [v, k]), e(y).update('none'));
		else {
			const P = K.getChart(e(M));
			P && P.destroy();
			const G = {
					id: 'memoryTextCenterPlugin',
					beforeDraw(d) {
						const s = d.ctx,
							{ width: l, height: g } = d;
						(s.save(),
							(s.textAlign = 'center'),
							(s.textBaseline = 'middle'),
							(s.font = `bold ${_().w > 1 ? '20px' : '16px'} system-ui, -apple-system, sans-serif`),
							(s.fillStyle = r() === 'dark' ? '#f9fafb' : '#111827'),
							s.fillText(`${n.toFixed(1)}%`, l / 2, g / 2 - 8),
							(s.font = `${_().w > 1 ? '12px' : '10px'} system-ui, -apple-system, sans-serif`),
							(s.fillStyle = r() === 'dark' ? '#9ca3af' : '#6b7280'),
							s.fillText('Used', l / 2, g / 2 + 12),
							s.restore());
					}
				},
				$ = {
					type: 'pie',
					data: {
						labels: ['Used', 'Free'],
						datasets: [
							{
								data: [v, k],
								backgroundColor: [
									n > 80 ? 'rgba(239, 68, 68, 0.8)' : n > 60 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(34, 197, 94, 0.8)',
									r() === 'dark' ? 'rgba(75, 85, 99, 0.4)' : 'rgba(229, 231, 235, 0.6)'
								],
								borderColor: [
									n > 80 ? 'rgba(239, 68, 68, 1)' : n > 60 ? 'rgba(245, 158, 11, 1)' : 'rgba(34, 197, 94, 1)',
									r() === 'dark' ? 'rgba(75, 85, 99, 0.8)' : 'rgba(229, 231, 235, 1)'
								],
								borderWidth: 2,
								borderRadius: 4
							}
						]
					},
					options: {
						responsive: !0,
						maintainAspectRatio: !1,
						animation: { duration: 1e3, easing: 'easeInOutQuart' },
						plugins: {
							legend: { display: !1 },
							tooltip: {
								enabled: !0,
								backgroundColor: r() === 'dark' ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
								titleColor: r() === 'dark' ? '#f9fafb' : '#111827',
								bodyColor: r() === 'dark' ? '#d1d5db' : '#374151',
								borderColor: r() === 'dark' ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 0.5)',
								borderWidth: 1,
								cornerRadius: 8,
								displayColors: !0,
								callbacks: {
									label(d) {
										const s = d.label || '',
											l = typeof d.raw == 'number' ? d.raw : 0,
											x = d.chart.data.datasets[0].data.reduce((R, C) => (R ?? 0) + (C ?? 0), 0),
											f = x ? (l / x) * 100 : 0;
										return `${s}: ${(l / 1024).toFixed(1)} GB (${f.toFixed(1)}%)`;
									}
								}
							}
						}
					},
					plugins: [G]
				};
			z(y, new K(e(M), $), !0);
		}
	}),
		Fe(() => {
			e(y) && e(y).destroy();
		}),
		We(ne, {
			get label() {
				return ve();
			},
			get theme() {
				return r();
			},
			endpoint: '/api/dashboard/systemInfo?type=memory',
			pollInterval: 1e4,
			get icon() {
				return me();
			},
			get widgetId() {
				return ce();
			},
			get size() {
				return _();
			},
			get onSizeChange() {
				return fe();
			},
			get onCloseRequest() {
				return ge();
			},
			children: (w, n) => {
				let v = () => n?.().data;
				var k = Ge(),
					P = ze(k);
				{
					var G = (d) => {
							const s = h(() => (v().memoryInfo.total.totalMemMb || 0) / 1024),
								l = h(() => (v().memoryInfo.total.usedMemMb || 0) / 1024),
								g = h(() => (v().memoryInfo.total.freeMemMb || 0) / 1024),
								x = h(() => v().memoryInfo.total.usedMemPercentage || 0),
								f = h(() => (e(x) > 80 ? 'high' : e(x) > 60 ? 'medium' : 'low')),
								R = h(() => 100 - e(x));
							var C = Le(),
								A = t(C),
								X = t(A),
								T = t(X),
								Y = t(T),
								ue = i(Y, 2);
							a(T);
							var Z = i(T, 2),
								D = t(Z),
								W = t(D),
								pe = t(W);
							a(W);
							var be = i(W, 2);
							a(D);
							var ee = i(D, 2),
								j = t(ee),
								ye = t(j);
							a(j);
							var he = i(j, 2);
							(a(ee), a(Z), a(X), a(A));
							var te = i(A, 2),
								L = i(te, 2),
								ae = t(L);
							(Re(
								ae,
								(m) => z(M, m),
								() => e(M)
							),
								$e(ae, (m, u) => xe?.(m, u), v),
								a(L));
							var re = i(L, 2),
								se = i(re, 2),
								N = t(se),
								O = t(N),
								ie = t(O),
								de = i(ie, 2),
								_e = t(de);
							(a(de), a(O));
							var q = i(O, 2),
								oe = t(q),
								E = i(oe, 2),
								Me = t(E);
							(a(E), a(q));
							var we = i(q, 2);
							{
								var ke = (m) => {
									var u = je(),
										S = t(u),
										I = i(S, 2),
										Ce = t(I);
									(a(I),
										a(u),
										H(
											(Ie) => {
												(o(S, 1, J(r() === 'dark' ? 'text-gray-400' : 'text-gray-500')),
													o(I, 1, `font-semibold ${r() === 'dark' ? 'text-gray-300' : 'text-gray-700'}`),
													F(Ce, `${Ie ?? ''} GB`));
											},
											[() => e(g).toFixed(1)]
										),
										U(m, u));
								};
								le(we, (m) => {
									_().w !== 1 && m(ke);
								});
							}
							(a(N),
								a(se),
								a(C),
								H(
									(m, u, S, I) => {
										(o(Y, 1, `h-3 w-3 rounded-full ${e(f) === 'high' ? 'bg-red-500' : e(f) === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`),
											o(
												ue,
												1,
												`absolute inset-0 h-3 w-3 rounded-full ${e(f) === 'high' ? 'bg-red-500' : e(f) === 'medium' ? 'bg-yellow-500' : 'bg-green-500'} animate-ping opacity-75`
											),
											F(pe, `${m ?? ''}%`),
											o(be, 1, `text-sm ${r() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`),
											F(ye, `${u ?? ''}%`),
											o(he, 1, `text-sm ${r() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`),
											o(te, 1, `text-xs font-semibold ${r() === 'dark' ? 'text-gray-300' : 'text-gray-700'} text-center`),
											o(re, 1, `text-xs font-semibold ${r() === 'dark' ? 'text-gray-300' : 'text-gray-700'} text-center`),
											o(N, 1, `grid ${_().w === 1 ? 'grid-cols-2' : 'grid-cols-3'} gap-3 text-xs`),
											o(ie, 1, J(r() === 'dark' ? 'text-gray-400' : 'text-gray-500')),
											F(_e, `${S ?? ''} GB`),
											o(oe, 1, J(r() === 'dark' ? 'text-gray-400' : 'text-gray-500')),
											o(
												E,
												1,
												`text-sm font-semibold ${e(f) === 'high' ? 'text-red-600 dark:text-red-400' : e(f) === 'medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}`
											),
											F(Me, `${I ?? ''} GB`));
									},
									[() => e(x).toFixed(1), () => e(R).toFixed(1), () => e(s).toFixed(1), () => e(l).toFixed(1)]
								),
								U(d, C));
						},
						$ = (d) => {
							var s = Ne(),
								l = i(t(s), 2),
								g = t(l);
							(Ue(2), a(l), a(s), H(() => o(g, 1, `text-sm font-medium ${r() === 'dark' ? 'text-gray-300' : 'text-gray-700'}`)), U(d, s));
						};
					le(P, (d) => {
						v()?.memoryInfo?.total ? d(G) : d($, !1);
					});
				}
				U(w, k);
			},
			$$slots: { default: !0 }
		}),
		Se());
}
export { et as default, Ze as widgetMeta };
//# sourceMappingURL=BEWEx7zq.js.map
