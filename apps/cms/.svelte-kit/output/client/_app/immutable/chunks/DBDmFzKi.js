import { i as z } from './zi73tRJP.js';
import { a as Oe } from './CMZtchEj.js';
import { p as Te, z as pe, g as e, d as re, b as W, a as qe, f as Ee, c as a, s, r as t, u as G, t as U } from './DrlZFkx8.js';
import { c as Qe, a as m, f as C, s as y } from './CTjXDULS.js';
import { a as He } from './BEiD40NV.js';
import { c as n, s as Je, a as Ke, d as se } from './MEFvoR_D.js';
import { b as Ve } from './YQp2a1pQ.js';
import { p as F } from './DePHBZW_.js';
import { C as ie, B as Xe, a as Ye, b as Ze, L as ea } from './C4Hx6_Ca.js';
import { B as aa } from './KG4G7ZS9.js';
const ya = { name: 'Disk Usage', icon: 'mdi:disk', defaultSize: { w: 1, h: 2 } };
var ta = C(
		'<div class="relative flex-1" style="min-height: 50px; max-height: 65px; width: 100%;"><canvas class="h-full w-full" style="display: block; width: 100% !important; height: 100% !important;" aria-label="Disk usage bar chart"></canvas></div>'
	),
	ra = C(
		'<div class="relative flex flex-1 items-center justify-center rounded-lg bg-gray-100" style="min-height: 50px; max-height: 65px; width: 100%;"><span class="text-xs text-gray-500">No disk data</span></div>'
	),
	sa = C('<div class="flex flex-col space-y-1 text-center"><span>Free</span> <span> </span></div>'),
	ia = C('<span>FS: <span class="font-mono"> </span></span>'),
	da = C('<div><span>Mount: <span class="font-mono"> </span></span> <!></div>'),
	oa = C(
		'<div class="flex h-full flex-col justify-between space-y-3" role="region" aria-label="Disk usage statistics"><div class="flex-1 space-y-2"><div class="flex items-center justify-between px-2"><div class="flex items-center space-x-2"><div class="relative"><div></div> <div></div></div> <span class="text-sm font-bold"> </span> <span>Used</span></div> <div class="flex gap-2 text-right"><div class="text-sm font-semibold"> </div> <div>Free</div></div></div> <h3 class="text-center text-xs font-semibold">Disk Usage Overview:</h3> <!></div> <div class="flex-1 space-y-2"><h3 class="text-center text-xs font-semibold">Storage Details:</h3> <div class="flex flex-1 flex-col space-y-3" style="min-height: 60px; max-height: 80px;"><div aria-label="Disk usage progress bar" style="height: 24px; min-height: 24px;"><div aria-valuemin="0" aria-valuemax="100" role="progressbar"></div> <div class="pointer-events-none absolute inset-0 flex items-center justify-center"><span class="text-xs font-semibold text-white drop-shadow-sm dark:text-black"> </span></div></div> <div><div class="flex flex-col space-y-1 text-center"><span>Total</span> <span class="text-sm font-semibold"> </span></div> <div class="flex flex-col space-y-1 text-center"><span>Used</span> <span> </span></div> <!></div></div></div> <!></div>'
	),
	na = C(
		'<div class="flex h-full flex-col items-center justify-center space-y-3" role="status" aria-live="polite"><div class="relative"><div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" aria-hidden="true"></div></div> <div class="text-center"><div>Loading disk data</div> <div>Please wait...</div></div></div>'
	);
function ha(be, x) {
	(Te(x, !0), ie.register(Xe, Ye, Ze, ea));
	const me = F(x, 'label', 3, 'Disk Usage'),
		i = F(x, 'theme', 3, 'light'),
		ye = F(x, 'icon', 3, 'mdi:harddisk'),
		he = F(x, 'widgetId', 3, void 0),
		R = F(x, 'size', 19, () => ({ w: 1, h: 2 })),
		_e = F(x, 'onSizeChange', 3, (B) => {}),
		ke = F(x, 'onRemove', 3, () => {});
	let $ = re(void 0),
		I = re(void 0),
		h = re(void 0);
	function we(B, _) {
		return (
			W($, _, !0),
			{
				update(k) {
					W($, k, !0);
				}
			}
		);
	}
	let l,
		de = 0;
	(pe(() => {
		e($)?.diskInfo?.root && ((l = e($).diskInfo.root), (de = typeof l.totalGb == 'string' ? parseFloat(l.totalGb) : l.totalGb || 0));
	}),
		pe(() => {
			if (!e(I) || !l) return;
			const B = typeof l.usedGb == 'string' ? parseFloat(l.usedGb) : Number(l.usedGb) || 0,
				_ = typeof l.freeGb == 'string' ? parseFloat(l.freeGb) : Number(l.freeGb) || 0,
				k = typeof l.usedPercentage == 'string' ? parseFloat(l.usedPercentage) : Number(l.usedPercentage) || 0;
			if (e(h)) ((e(h).data.datasets[0].data = [B]), (e(h).data.datasets[1].data = [_]), e(h).update('none'));
			else {
				const P = ie.getChart(e(I));
				P && P.destroy();
				const j = {
					id: 'diskBarLabelPlugin',
					afterDatasetsDraw(p) {
						const c = p.ctx,
							{ chartArea: f } = p;
						(c.save(),
							(c.font = 'bold 18px system-ui, -apple-system, sans-serif'),
							(c.textAlign = 'center'),
							(c.textBaseline = 'middle'),
							(c.fillStyle = i() === 'dark' ? '#f9fafb' : '#111827'),
							c.fillText(`${k.toFixed(1)}% Used`, (f.left + f.right) / 2, (f.top + f.bottom) / 2),
							c.restore());
					}
				};
				W(
					h,
					new ie(e(I), {
						type: 'bar',
						data: {
							labels: ['Disk'],
							datasets: [
								{
									label: 'Used',
									data: [B],
									backgroundColor: k > 85 ? 'rgba(239, 68, 68, 0.8)' : k > 70 ? 'rgba(245, 158, 11, 0.8)' : 'rgba(59, 130, 246, 0.8)',
									borderRadius: 8,
									barPercentage: 1,
									categoryPercentage: 1,
									stack: 'disk'
								},
								{
									label: 'Free',
									data: [_],
									backgroundColor: i() === 'dark' ? 'rgba(75, 85, 99, 0.4)' : 'rgba(229, 231, 235, 0.6)',
									borderRadius: 8,
									barPercentage: 1,
									categoryPercentage: 1,
									stack: 'disk'
								}
							]
						},
						options: {
							indexAxis: 'y',
							responsive: !0,
							maintainAspectRatio: !1,
							animation: { duration: 1e3, easing: 'easeInOutQuart' },
							plugins: {
								legend: { display: !1 },
								tooltip: {
									enabled: !0,
									backgroundColor: i() === 'dark' ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
									titleColor: i() === 'dark' ? '#f9fafb' : '#111827',
									bodyColor: i() === 'dark' ? '#d1d5db' : '#374151',
									borderColor: i() === 'dark' ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 0.5)',
									borderWidth: 1,
									cornerRadius: 8,
									displayColors: !0,
									callbacks: {
										label(p) {
											const c = p.dataset.label || '',
												f = typeof p.raw == 'number' ? p.raw : 0,
												u = B + _,
												r = u ? (f / u) * 100 : 0;
											return `${c}: ${f.toFixed(1)} GB (${r.toFixed(1)}%)`;
										}
									}
								}
							},
							scales: { x: { stacked: !0, display: !1, min: 0, max: de }, y: { display: !1, stacked: !0 } }
						},
						plugins: [j]
					}),
					!0
				);
			}
		}),
		Oe(() => {
			e(h) && e(h).destroy();
		}),
		aa(be, {
			get label() {
				return me();
			},
			get theme() {
				return i();
			},
			endpoint: '/api/dashboard/systemInfo?type=disk',
			pollInterval: 1e4,
			get icon() {
				return ye();
			},
			get widgetId() {
				return he();
			},
			get size() {
				return R();
			},
			get onSizeChange() {
				return _e();
			},
			get onCloseRequest() {
				return ke();
			},
			children: (_, k) => {
				let P = () => k?.().data;
				var j = Qe(),
					p = Ee(j);
				{
					var c = (u) => {
							const r = G(() => P().diskInfo.root),
								L = G(() => (typeof e(r).totalGb == 'string' ? parseFloat(e(r).totalGb) : e(r).totalGb || 0)),
								S = G(() => (typeof e(r).usedGb == 'string' ? parseFloat(e(r).usedGb) : e(r).usedGb || 0)),
								M = G(() => (typeof e(r).freeGb == 'string' ? parseFloat(e(r).freeGb) : e(r).freeGb || 0)),
								D = G(() => (typeof e(r).usedPercentage == 'string' ? parseFloat(e(r).usedPercentage) : e(r).usedPercentage || 0)),
								Ge = G(() => 100 - e(D)),
								b = G(() => (e(D) > 85 ? 'high' : e(D) > 70 ? 'medium' : 'low'));
							var O = oa(),
								T = a(O),
								q = a(T),
								E = a(q),
								Q = a(E),
								oe = a(Q),
								Fe = s(oe, 2);
							t(Q);
							var H = s(Q, 2),
								Ce = a(H);
							t(H);
							var Be = s(H, 2);
							t(E);
							var ne = s(E, 2),
								J = a(ne),
								Pe = a(J);
							t(J);
							var De = s(J, 2);
							(t(ne), t(q));
							var Ie = s(q, 4);
							{
								var Se = (d) => {
										var o = ta(),
											g = a(o);
										(Ve(
											g,
											(v) => W(I, v),
											() => e(I)
										),
											He(g, (v, w) => we?.(v, w), P),
											t(o),
											m(d, o));
									},
									ze = (d) => {
										var o = ra();
										m(d, o);
									};
								z(Ie, (d) => {
									e(r) ? d(Se) : d(ze, !1);
								});
							}
							t(T);
							var K = s(T, 2),
								le = s(a(K), 2),
								A = a(le),
								N = a(A),
								ve = s(N, 2),
								ce = a(ve),
								Ue = a(ce);
							(t(ce), t(ve), t(A));
							var V = s(A, 2),
								X = a(V),
								ge = a(X),
								fe = s(ge, 2),
								Re = a(fe);
							(t(fe), t(X));
							var Y = s(X, 2),
								ue = a(Y),
								Z = s(ue, 2),
								$e = a(Z);
							(t(Z), t(Y));
							var je = s(Y, 2);
							{
								var Le = (d) => {
									var o = sa(),
										g = a(o),
										v = s(g, 2),
										w = a(v);
									(t(v),
										t(o),
										U(
											(ee) => {
												(n(g, 1, se(i() === 'dark' ? 'text-gray-400' : 'text-gray-500')),
													n(v, 1, `font-semibold ${i() === 'dark' ? 'text-gray-300' : 'text-gray-700'}`),
													y(w, `${ee ?? ''} GB`));
											},
											[() => e(M).toFixed(1)]
										),
										m(d, o));
								};
								z(je, (d) => {
									R().w > 1 && d(Le);
								});
							}
							(t(V), t(le), t(K));
							var Ae = s(K, 2);
							{
								var Ne = (d) => {
									var o = da(),
										g = a(o),
										v = s(a(g)),
										w = a(v, !0);
									(t(v), t(g));
									var ee = s(g, 2);
									{
										var We = (ae) => {
											var te = ia(),
												xe = s(a(te)),
												Me = a(xe, !0);
											(t(xe), t(te), U(() => y(Me, e(r).filesystem)), m(ae, te));
										};
										z(ee, (ae) => {
											e(r).filesystem && ae(We);
										});
									}
									(t(o),
										U(() => {
											(n(
												o,
												1,
												`flex justify-between text-xs ${i() === 'dark' ? 'text-gray-400' : 'text-gray-500'} border-t border-gray-200 pt-2 dark:border-gray-700`
											),
												y(w, e(r).mountPoint || '/'));
										}),
										m(d, o));
								};
								z(Ae, (d) => {
									R().w >= 2 && d(Ne);
								});
							}
							(t(O),
								U(
									(d, o, g, v, w) => {
										(n(oe, 1, `h-3 w-3 rounded-full ${e(b) === 'high' ? 'bg-red-500' : e(b) === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`),
											n(
												Fe,
												1,
												`absolute inset-0 h-3 w-3 rounded-full text-white dark:text-black ${e(b) === 'high' ? 'bg-red-500' : e(b) === 'medium' ? 'bg-yellow-500' : 'bg-green-500'} animate-ping opacity-75`
											),
											y(Ce, `${d ?? ''}%`),
											n(Be, 1, `text-sm ${i() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`),
											y(Pe, `${o ?? ''}%`),
											n(De, 1, `text-sm ${i() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`),
											n(A, 1, `relative flex items-center overflow-hidden rounded-full ${i() === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`),
											n(
												N,
												1,
												`h-full rounded-full transition-all duration-700 ease-out ${e(b) === 'high' ? 'bg-linear-to-r from-red-500 to-red-600' : e(b) === 'medium' ? 'bg-linear-to-r from-orange-500 to-red-500' : 'bg-linear-to-r from-blue-500 to-blue-600'}`
											),
											Je(N, `width: ${e(D) ?? ''}%`),
											Ke(N, 'aria-valuenow', e(D)),
											y(Ue, `${g ?? ''} GB Used`),
											n(V, 1, `grid ${R().w === 1 ? 'grid-cols-2' : 'grid-cols-3'} flex-1 gap-2 text-xs`),
											n(ge, 1, se(i() === 'dark' ? 'text-gray-400' : 'text-gray-500')),
											y(Re, `${v ?? ''} GB`),
											n(ue, 1, se(i() === 'dark' ? 'text-gray-400' : 'text-gray-500')),
											n(
												Z,
												1,
												`text-sm font-semibold ${e(b) === 'high' ? 'text-red-600 dark:text-red-400' : e(b) === 'medium' ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`
											),
											y($e, `${w ?? ''} GB`));
									},
									[() => e(D).toFixed(1), () => e(Ge).toFixed(1), () => e(S).toFixed(1), () => e(L).toFixed(1), () => e(S).toFixed(1)]
								),
								m(u, O));
						},
						f = (u) => {
							var r = na(),
								L = s(a(r), 2),
								S = a(L),
								M = s(S, 2);
							(t(L),
								t(r),
								U(() => {
									(n(S, 1, `text-sm font-medium ${i() === 'dark' ? 'text-gray-300' : 'text-gray-700'}`),
										n(M, 1, `text-xs ${i() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`));
								}),
								m(u, r));
						};
					z(p, (u) => {
						P()?.diskInfo?.root ? u(c) : u(f, !1);
					});
				}
				m(_, j);
			},
			$$slots: { default: !0 }
		}),
		qe());
}
export { ha as default, ya as widgetMeta };
//# sourceMappingURL=DBDmFzKi.js.map
