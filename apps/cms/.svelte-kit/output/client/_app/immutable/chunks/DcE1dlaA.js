import { i as w } from './zi73tRJP.js';
import { p as Ue, a as Re, f as k, c as t, r as e, t as L, s as a, g as X } from './DrlZFkx8.js';
import { c as W, a as n, f as m, s as d } from './CTjXDULS.js';
import { e as Ie, i as Me } from './BXe5mj2j.js';
import { c as x, s as Be } from './MEFvoR_D.js';
import { p as o } from './DePHBZW_.js';
import { B as Pe } from './KG4G7ZS9.js';
const Ke = {
	name: 'Database Pool',
	icon: 'mdi:database-cog',
	description: 'Monitor database connection pool health and diagnostics',
	defaultSize: { w: 2, h: 3 },
	category: 'monitoring'
};
var je = m(
		'<div class="flex items-center justify-center py-8"><div class="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600"></div></div>'
	),
	qe = m(
		'<div class="rounded-lg border border-error-200 bg-error-50 p-4 dark:border-error-800 dark:bg-error-900/20"><p class="text-sm text-error-800 dark:text-error-200"> </p></div>'
	),
	De = m(
		'<li class="flex items-start gap-2 text-sm text-surface-600 dark:text-surface-50"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> <span> </span></li>'
	),
	Ae = m(
		'<div class="border-t border-surface-200 pt-4 dark:text-surface-50"><h4 class="mb-2 text-sm font-semibold text-surface-700 dark:text-surface-300">Recommendations</h4> <ul class="space-y-2"></ul></div>'
	),
	Le = m(
		'<div class="mb-4"><span><span class="mr-2 h-2 w-2 rounded-full bg-current"></span> </span></div> <div class="mb-6 grid grid-cols-2 gap-4"><div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50"><div class="mb-1 text-xs text-surface-500 dark:text-surface-50">Total</div> <div class="text-2xl font-bold text-surface-900 dark:text-white"> </div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50"><div class="mb-1 text-xs text-surface-500 dark:text-surface-50">Active</div> <div class="text-2xl font-bold text-surface-900 dark:text-white"> </div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50"><div class="mb-1 text-xs text-surface-500 dark:text-surface-50">Idle</div> <div class="text-2xl font-bold text-surface-900 dark:text-white"> </div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700/50"><div class="mb-1 text-xs text-surface-500 dark:text-surface-50">Waiting</div> <div> </div></div></div> <div class="mb-6"><div class="mb-2 flex items-center justify-between"><span class="text-sm font-medium text-surface-700 dark:text-surface-300">Pool Utilization</span> <span> </span></div> <div class="h-3 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"><div></div></div></div> <!>',
		1
	);
function Ne(Y, i) {
	Ue(i, !0);
	const Z = o(i, 'label', 3, 'Connection Pool'),
		$ = o(i, 'theme', 3, 'light'),
		ee = o(i, 'icon', 3, 'mdi:database-cog'),
		te = o(i, 'widgetId', 3, void 0),
		re = o(i, 'size', 19, () => ({ w: 2, h: 3 })),
		ae = o(i, 'onSizeChange', 3, (s) => {}),
		se = o(i, 'onRemove', 3, () => {});
	function ie(s) {
		switch (s) {
			case 'healthy':
				return 'text-success-600 bg-success-50';
			case 'degraded':
				return 'text-warning-600 bg-warning-50';
			case 'critical':
				return 'text-error-600 bg-error-50';
			default:
				return 'text-gray-600 bg-gray-50';
		}
	}
	function ne(s) {
		return s >= 90 ? 'text-error-600' : s >= 75 ? 'text-warning-600' : 'text-success-600';
	}
	function de(s) {
		return s >= 90 ? 'bg-error-600' : s >= 75 ? 'bg-warning-500' : 'bg-success-500';
	}
	function oe(s) {
		return s.includes('healthy')
			? 'text-success-600'
			: s.includes('Consider') || s.includes('increase') || s.includes('reduce')
				? 'text-warning-600'
				: 'text-info-600';
	}
	(Pe(Y, {
		get label() {
			return Z();
		},
		get theme() {
			return $();
		},
		get icon() {
			return ee();
		},
		get size() {
			return re();
		},
		get onSizeChange() {
			return ae();
		},
		endpoint: '/api/database/pool-diagnostics',
		pollInterval: 3e4,
		get widgetId() {
			return te();
		},
		get onCloseRequest() {
			return se();
		},
		children: (le, C) => {
			let r = () => C?.().data,
				ce = () => C?.().isLoading,
				F = () => C?.().error;
			var H = W(),
				ve = k(H);
			{
				var ue = (l) => {
						var b = je();
						n(l, b);
					},
					fe = (l) => {
						var b = W(),
							ge = k(b);
						{
							var xe = (c) => {
									var v = qe(),
										h = t(v),
										z = t(h, !0);
									(e(h), e(v), L(() => d(z, F())), n(c, v));
								},
								me = (c) => {
									var v = W(),
										h = k(v);
									{
										var z = (y) => {
											var T = Le(),
												S = k(T),
												U = t(S),
												be = a(t(U));
											(e(U), e(S));
											var R = a(S, 2),
												I = t(R),
												E = a(t(I), 2),
												he = t(E, !0);
											(e(E), e(I));
											var M = a(I, 2),
												G = a(t(M), 2),
												pe = t(G, !0);
											(e(G), e(M));
											var B = a(M, 2),
												J = a(t(B), 2),
												_e = t(J, !0);
											(e(J), e(B));
											var K = a(B, 2),
												P = a(t(K), 2),
												we = t(P, !0);
											(e(P), e(K), e(R));
											var j = a(R, 2),
												q = t(j),
												D = a(t(q), 2),
												ke = t(D);
											(e(D), e(q));
											var N = a(q, 2),
												O = t(N);
											(e(N), e(j));
											var Ce = a(j, 2);
											{
												var ze = (u) => {
													var f = Ae(),
														p = a(t(f), 2);
													(Ie(
														p,
														21,
														() => r().recommendations,
														Me,
														(A, _) => {
															var g = De(),
																Q = t(g),
																V = a(Q, 2),
																ye = t(V, !0);
															(e(V),
																e(g),
																L(
																	(Se) => {
																		(x(Q, 0, `mt-0.5 h-4 w-4 shrink-0 ${Se ?? ''}`), d(ye, X(_)));
																	},
																	[() => oe(X(_))]
																),
																n(A, g));
														}
													),
														e(p),
														e(f),
														n(u, f));
												};
												w(Ce, (u) => {
													r().recommendations && r().recommendations.length > 0 && u(ze);
												});
											}
											(L(
												(u, f, p, A, _, g) => {
													(x(U, 1, `inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${u ?? ''}`),
														d(be, ` ${f ?? ''}`),
														d(he, r().totalConnections),
														d(pe, r().activeConnections),
														d(_e, r().idleConnections),
														x(P, 1, `text-2xl font-bold ${r().waitingRequests > 0 ? 'text-warning-600' : 'text-surface-900 dark:text-white'}`),
														d(we, r().waitingRequests),
														x(D, 1, `text-sm font-semibold ${p ?? ''}`),
														d(ke, `${A ?? ''}%`),
														x(O, 1, `h-full rounded-full transition-all duration-500 ${_ ?? ''}`),
														Be(O, `width: ${g ?? ''}%`));
												},
												[
													() => ie(r().healthStatus),
													() => r().healthStatus.charAt(0).toUpperCase() + r().healthStatus.slice(1),
													() => ne(r().poolUtilization),
													() => r().poolUtilization.toFixed(1),
													() => de(r().poolUtilization),
													() => Math.min(r().poolUtilization, 100)
												]
											),
												n(y, T));
										};
										w(
											h,
											(y) => {
												r() && y(z);
											},
											!0
										);
									}
									n(c, v);
								};
							w(
								ge,
								(c) => {
									F() ? c(xe) : c(me, !1);
								},
								!0
							);
						}
						n(l, b);
					};
				w(ve, (l) => {
					ce() && !r() ? l(ue) : l(fe, !1);
				});
			}
			n(le, H);
		},
		$$slots: { default: !0 }
	}),
		Re());
}
export { Ne as default, Ke as widgetMeta };
//# sourceMappingURL=DcE1dlaA.js.map
