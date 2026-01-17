import { i as I } from './zi73tRJP.js';
import { p as nt, a as vt, f as fe, g as a, u as Z, c as t, n as F, r as e, s as i, t as h, e as Oe } from './DrlZFkx8.js';
import { c as ue, a as n, f as T, s, t as G } from './CTjXDULS.js';
import { e as xe, i as ge } from './BXe5mj2j.js';
import { b as c, c as p, s as Fe, d as ct, a as lt } from './MEFvoR_D.js';
import { p as B } from './DePHBZW_.js';
import { B as ft } from './KG4G7ZS9.js';
const It = {
	name: 'Cache Monitor',
	icon: 'mdi:database-clock',
	description: 'Monitor cache performance and hit rates',
	defaultSize: { w: 2, h: 3 },
	category: 'monitoring'
};
var ut = T(
		'<div class="flex h-full items-center justify-center text-surface-500"><div class="text-center"><iconify-icon></iconify-icon> <p>Loading cache metrics...</p></div></div>',
		2
	),
	xt = T(
		'<div class="group"><div class="flex items-center justify-between text-xs"><div class="flex items-center gap-2"><iconify-icon></iconify-icon> <span class="font-semibold"> </span></div> <div class="flex items-center gap-3"><span class="tabular-nums text-surface-500"> <span class="text-surface-400">/</span> </span> <span> </span></div></div> <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"><div></div></div></div>',
		2
	),
	gt = T(
		'<div class="rounded-xl bg-surface-50 p-4 dark:bg-surface-800/50"><h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider"><iconify-icon></iconify-icon> By Category</h3> <div class="space-y-3"></div></div>',
		2
	),
	mt = T(
		'<div class="flex items-center justify-between rounded-lg bg-surface-100/50 px-3 py-2 text-xs dark:bg-surface-900/30"><div class="flex items-center gap-2"><div class="flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30"><iconify-icon></iconify-icon></div> <span class="font-semibold text-surface-700 dark:text-surface-300"> </span></div> <div class="flex items-center gap-3"><span class="tabular-nums text-surface-500"> </span> <span> </span></div></div>',
		2
	),
	_t = T(
		'<div class="rounded-xl bg-surface-50 p-4 dark:bg-surface-800/50"><h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-surface-600 dark:text-surface-50"><iconify-icon></iconify-icon> By Tenant</h3> <div class="space-y-2.5"></div></div>',
		2
	),
	ht = T('<div class="mt-0.5 text-[10px] text-surface-400"> </div>'),
	pt = T(
		'<div class="rounded-lg bg-white/50 px-3 py-2 text-xs dark:bg-surface-900/30"><div class="flex items-start justify-between gap-2"><div class="min-w-0 flex-1"><div class="mb-1 flex items-center gap-2"><iconify-icon></iconify-icon> <span class="font-semibold"> </span></div> <div class="truncate font-mono text-[10px] text-surface-600 dark:text-surface-50"> </div></div> <div class="whitespace-nowrap text-right"><div class="text-[10px]"><!></div> <!></div></div></div>',
		2
	),
	bt = T(
		'<div class="rounded-xl bg-error-50 p-4 dark:bg-error-900/10"><h3 class="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-error-700 dark:text-error-400"><iconify-icon></iconify-icon> </h3> <div class="max-h-48 space-y-2 overflow-y-auto"></div></div>',
		2
	),
	yt = T(
		`<div class="flex h-full flex-col space-y-3 overflow-auto p-1 text-sm"><div class="rounded-xl bg-linear-to-br from-surface-50 to-surface-100 p-4 shadow-sm dark:from-surface-800 dark:to-surface-900"><div class="mb-3 flex items-start justify-between"><div><h3 class="text-xs font-semibold uppercase tracking-wider">Overall Performance</h3> <p class="mt-1 text-xs text-surface-600 dark:text-surface-50"> </p></div> <div class="text-right"><div> </div> <p class="mt-1 text-xs">hit rate</p></div></div> <div class="grid grid-cols-4 gap-2 text-xs"><div class="rounded-lg bg-success-50 p-2 text-center dark:bg-success-900/20"><div class="text-lg font-bold"> </div> <div class="mt-0.5 text-success-700 dark:text-success-500">Hits</div></div> <div class="rounded-lg bg-error-50 p-2 text-center dark:bg-error-900/20"><div class="text-lg font-bold"> </div> <div class="mt-0.5 text-error-700 dark:text-error-500">Misses</div></div> <div class="rounded-lg bg-primary-50 p-2 text-center dark:bg-primary-900/20"><div class="0 text-lg font-bold"> </div> <div class="mt-0.5 text-primary-700 dark:text-primary-500">Sets</div></div> <div class="rounded-lg bg-warning-50 p-2 text-center dark:bg-warning-900/20"><div class="text-lg font-bold"> </div> <div class="mt-0.5 text-warning-700 dark:text-warning-500">Deletes</div></div></div> <div class="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"><div class="h-full bg-linear-to-r from-success-500 via-primary-500
							to-primary-600 transition-all duration-500 ease-out"></div></div></div> <!> <!> <!> <div><div class="flex items-center gap-2.5"><div><iconify-icon></iconify-icon></div> <div class="flex-1"><div><!></div> <div class="mt-0.5"> </div></div></div></div></div>`,
		2
	);
function Tt(Ne, z) {
	nt(z, !0);
	const $e = B(z, 'label', 3, 'Cache Monitor'),
		De = B(z, 'theme', 3, 'light'),
		He = B(z, 'icon', 3, 'mdi:database-clock'),
		Ae = B(z, 'widgetId', 3, void 0),
		Be = B(z, 'size', 19, () => ({ w: 2, h: 3 })),
		Pe = B(z, 'onSizeChange', 3, (m) => {}),
		Le = B(z, 'onRemove', 3, () => {});
	function ee(m) {
		return m >= 90 ? 'text-success-500' : m >= 70 ? 'text-warning-500' : 'text-error-500';
	}
	function N(m) {
		return m >= 1e6 ? `${(m / 1e6).toFixed(1)}M` : m >= 1e3 ? `${(m / 1e3).toFixed(1)}K` : m.toString();
	}
	function me(m) {
		return (
			{
				SCHEMA: 'mdi:database-outline',
				WIDGET: 'mdi:widgets-outline',
				THEME: 'mdi:palette-outline',
				CONTENT: 'mdi:file-document-outline',
				MEDIA: 'mdi:image-outline',
				QUERY: 'mdi:magnify',
				SESSION: 'mdi:account-clock-outline',
				AUTH: 'mdi:shield-account-outline',
				PREFERENCE: 'mdi:cog-outline'
			}[m] || 'mdi:folder-outline'
		);
	}
	(ft(Ne, {
		get label() {
			return $e();
		},
		get theme() {
			return De();
		},
		endpoint: '/api/dashboard/cache-metrics',
		pollInterval: 5e3,
		get icon() {
			return He();
		},
		get widgetId() {
			return Ae();
		},
		get size() {
			return Be();
		},
		get onSizeChange() {
			return Pe();
		},
		get onCloseRequest() {
			return Le();
		},
		children: (_e, We) => {
			const r = Z(() => We?.().data);
			var he = ue(),
				qe = fe(he);
			{
				var Ue = (P) => {
						var $ = ut(),
							L = t($),
							D = t(L);
						(c(D, 'icon', 'mdi:database-clock'), c(D, 'width', '48'), p(D, 1, 'mb-2 opacity-50'), F(2), e(L), e($), n(P, $));
					},
					Ge = (P) => {
						var $ = yt(),
							L = t($),
							D = t(L),
							te = t(D),
							pe = i(t(te), 2),
							Ke = t(pe);
						(e(pe), e(te));
						var be = i(te, 2),
							ae = t(be),
							Qe = t(ae);
						(e(ae), F(2), e(be), e(D));
						var re = i(D, 2),
							ie = t(re),
							ye = t(ie),
							Ye = t(ye, !0);
						(e(ye), F(2), e(ie));
						var se = i(ie, 2),
							we = t(se),
							Je = t(we, !0);
						(e(we), F(2), e(se));
						var oe = i(se, 2),
							ke = t(oe),
							Ve = t(ke, !0);
						(e(ke), F(2), e(oe));
						var Re = i(oe, 2),
							Me = t(Re),
							Xe = t(Me, !0);
						(e(Me), F(2), e(Re), e(re));
						var Ce = i(re, 2),
							Ze = t(Ce);
						(e(Ce), e(L));
						var Ee = i(L, 2);
						{
							var et = (o) => {
								var d = gt(),
									l = t(d),
									u = t(l);
								(c(u, 'icon', 'mdi:view-grid'), c(u, 'width', '14'), F(), e(l));
								var b = i(l, 2);
								(xe(
									b,
									21,
									() => Object.entries(a(r).byCategory).slice(0, 6),
									ge,
									(f, y) => {
										var x = Z(() => Oe(a(y), 2));
										let M = () => a(x)[0],
											v = () => a(x)[1];
										var C = xt(),
											w = t(C),
											k = t(w),
											g = t(k);
										(h(() => c(g, 'icon', me(M()))),
											c(g, 'width', '18'),
											p(g, 1, 'text-surface-600 transition-colors group-hover:text-primary-500 dark:text-surface-50'));
										var O = i(g, 2),
											K = t(O, !0);
										(e(O), e(k));
										var E = i(k, 2),
											S = t(E),
											H = t(S, !0),
											j = i(H, 2, !0);
										e(S);
										var A = i(S, 2),
											Q = t(A);
										(e(A), e(E), e(w));
										var W = i(w, 2),
											q = t(W);
										(e(W),
											e(C),
											h(
												(ve, _, R, Y, ce) => {
													(s(K, ve),
														s(H, _),
														s(j, R),
														p(A, 1, Y),
														s(Q, `${ce ?? ''}%`),
														p(
															q,
															1,
															`h-full transition-all duration-300 ${v().hitRate >= 80 ? 'bg-linear-to-r from-success-400 to-success-600' : v().hitRate >= 60 ? 'bg-linear-to-r from-warning-400 to-warning-600' : 'bg-linear-to-r from-error-400 to-error-600'}`
														),
														Fe(q, `width: ${v().hitRate ?? ''}%`));
												},
												[
													() => M().toLowerCase(),
													() => N(v().hits),
													() => N(v().hits + v().misses),
													() => `min-w-12 text-right text-sm font-bold tabular-nums ${ee(v().hitRate)}`,
													() => v().hitRate.toFixed(0)
												]
											),
											n(f, C));
									}
								),
									e(b),
									e(d),
									n(o, d));
							};
							I(Ee, (o) => {
								Object.keys(a(r).byCategory).length > 0 && o(et);
							});
						}
						var Se = i(Ee, 2);
						{
							var tt = (o) => {
								var d = _t(),
									l = t(d),
									u = t(l);
								(c(u, 'icon', 'mdi:domain'), c(u, 'width', '14'), F(), e(l));
								var b = i(l, 2);
								(xe(
									b,
									21,
									() => Object.entries(a(r).byTenant).slice(0, 4),
									ge,
									(f, y) => {
										var x = Z(() => Oe(a(y), 2));
										let M = () => a(x)[0],
											v = () => a(x)[1];
										var C = mt(),
											w = t(C),
											k = t(w),
											g = t(k);
										(c(g, 'icon', 'mdi:domain'), c(g, 'width', '14'), p(g, 1, 'text-primary-600 dark:text-primary-400'), e(k));
										var O = i(k, 2),
											K = t(O, !0);
										(e(O), e(w));
										var E = i(w, 2),
											S = t(E),
											H = t(S);
										e(S);
										var j = i(S, 2),
											A = t(j);
										(e(j),
											e(E),
											e(C),
											h(
												(Q, W, q) => {
													(s(K, M()), s(H, `${Q ?? ''} ops`), p(j, 1, W), s(A, `${q ?? ''}%`));
												},
												[
													() => N(v().hits + v().misses),
													() => `min-w-12 text-right font-bold tabular-nums ${ee(v().hitRate)}`,
													() => v().hitRate.toFixed(0)
												]
											),
											n(f, C));
									}
								),
									e(b),
									e(d),
									n(o, d));
							};
							I(Se, (o) => {
								a(r).byTenant && Object.keys(a(r).byTenant).length > 0 && o(tt);
							});
						}
						var je = i(Se, 2);
						{
							var at = (o) => {
								var d = bt(),
									l = t(d),
									u = t(l);
								(c(u, 'icon', 'mdi:alert-circle'), c(u, 'width', '14'));
								var b = i(u);
								e(l);
								var f = i(l, 2);
								(xe(
									f,
									21,
									() => a(r).recentMisses.slice().reverse(),
									ge,
									(y, x) => {
										const M = Z(() => Math.floor((Date.now() - new Date(a(x).timestamp).getTime()) / 1e3));
										var v = pt(),
											C = t(v),
											w = t(C),
											k = t(w),
											g = t(k);
										(h(() => c(g, 'icon', me(a(x).category))), c(g, 'width', '14'), p(g, 1, 'text-error-600 dark:text-error-400'));
										var O = i(g, 2),
											K = t(O, !0);
										(e(O), e(k));
										var E = i(k, 2),
											S = t(E, !0);
										(e(E), e(w));
										var H = i(w, 2),
											j = t(H),
											A = t(j);
										{
											var Q = (_) => {
													var R = G();
													(h(() => s(R, `${a(M) ?? ''}s ago`)), n(_, R));
												},
												W = (_) => {
													var R = ue(),
														Y = fe(R);
													{
														var ce = (U) => {
																var J = G();
																(h((le) => s(J, `${le ?? ''}m ago`), [() => Math.floor(a(M) / 60)]), n(U, J));
															},
															dt = (U) => {
																var J = G();
																(h((le) => s(J, `${le ?? ''}h ago`), [() => Math.floor(a(M) / 3600)]), n(U, J));
															};
														I(
															Y,
															(U) => {
																a(M) < 3600 ? U(ce) : U(dt, !1);
															},
															!0
														);
													}
													n(_, R);
												};
											I(A, (_) => {
												a(M) < 60 ? _(Q) : _(W, !1);
											});
										}
										e(j);
										var q = i(j, 2);
										{
											var ve = (_) => {
												var R = ht(),
													Y = t(R, !0);
												(e(R), h(() => s(Y, a(x).tenantId)), n(_, R));
											};
											I(q, (_) => {
												a(x).tenantId && _(ve);
											});
										}
										(e(H),
											e(C),
											e(v),
											h(() => {
												(s(K, a(x).category), lt(E, 'title', a(x).key), s(S, a(x).key));
											}),
											n(y, v));
									}
								),
									e(f),
									e(d),
									h(() => s(b, ` Recent Cache Misses (${a(r).recentMisses.length ?? ''})`)),
									n(o, d));
							};
							I(je, (o) => {
								a(r).recentMisses && a(r).recentMisses.length > 0 && o(at);
							});
						}
						var de = i(je, 2),
							Ie = t(de),
							V = t(Ie),
							ne = t(V);
						(h(() => c(ne, 'icon', a(r).overall.hitRate >= 80 ? 'mdi:check-circle' : a(r).overall.hitRate >= 60 ? 'mdi:alert' : 'mdi:alert-circle')),
							c(ne, 'width', '18'),
							e(V));
						var Te = i(V, 2),
							X = t(Te),
							rt = t(X);
						{
							var it = (o) => {
									var d = G('Excellent Performance');
									n(o, d);
								},
								st = (o) => {
									var d = ue(),
										l = fe(d);
									{
										var u = (f) => {
												var y = G('Moderate Performance');
												n(f, y);
											},
											b = (f) => {
												var y = G('Needs Attention');
												n(f, y);
											};
										I(
											l,
											(f) => {
												a(r).overall.hitRate >= 60 ? f(u) : f(b, !1);
											},
											!0
										);
									}
									n(o, d);
								};
							I(rt, (o) => {
								a(r).overall.hitRate >= 80 ? o(it) : o(st, !1);
							});
						}
						e(X);
						var ze = i(X, 2),
							ot = t(ze);
						(e(ze),
							e(Te),
							e(Ie),
							e(de),
							e($),
							h(
								(o, d, l, u, b, f, y) => {
									(s(Ke, `${o ?? ''} operations`),
										p(ae, 1, d),
										s(Qe, `${l ?? ''}%`),
										s(Ye, u),
										s(Je, b),
										s(Ve, f),
										s(Xe, y),
										Fe(Ze, `width: ${a(r).overall.hitRate ?? ''}%`),
										p(
											de,
											1,
											`mt-auto rounded-xl border-l-4 p-3 text-xs shadow-sm transition-all
					${a(r).overall.hitRate >= 80 ? 'border-success-500 bg-success-50 dark:bg-success-900/10' : ''}
					${a(r).overall.hitRate >= 60 && a(r).overall.hitRate < 80 ? 'border-warning-500 bg-warning-50 dark:bg-warning-900/10' : ''}
					${a(r).overall.hitRate < 60 ? 'border-error-500 bg-error-50 dark:bg-error-900/10' : ''}
				`
										),
										p(
											V,
											1,
											`flex h-8 w-8 items-center justify-center rounded-full ${a(r).overall.hitRate >= 80 ? 'bg-success-100 dark:bg-success-900/30' : a(r).overall.hitRate >= 60 ? 'bg-warning-100 dark:bg-warning-900/30' : 'bg-error-100 dark:bg-error-900/30'}`
										),
										p(
											ne,
											1,
											ct(
												a(r).overall.hitRate >= 80
													? 'text-success-600 dark:text-success-400'
													: a(r).overall.hitRate >= 60
														? 'text-warning-600 dark:text-warning-400'
														: 'text-error-600 dark:text-error-400'
											)
										),
										p(
											X,
											1,
											`font-semibold ${a(r).overall.hitRate >= 80 ? 'text-success-700 dark:text-success-300' : a(r).overall.hitRate >= 60 ? 'text-warning-700 dark:text-warning-300' : 'text-error-700 dark:text-error-300'}`
										),
										s(
											ot,
											`Cache is ${a(r).overall.hitRate >= 80 ? 'working optimally' : a(r).overall.hitRate >= 60 ? 'performing adequately' : 'underperforming'}`
										));
								},
								[
									() => a(r).overall.totalOperations.toLocaleString(),
									() => `text-3xl font-bold leading-none ${ee(a(r).overall.hitRate)}`,
									() => a(r).overall.hitRate.toFixed(1),
									() => N(a(r).overall.hits),
									() => N(a(r).overall.misses),
									() => N(a(r).overall.sets),
									() => N(a(r).overall.deletes)
								]
							),
							n(P, $));
					};
				I(qe, (P) => {
					a(r) ? P(Ge, !1) : P(Ue);
				});
			}
			n(_e, he);
		},
		$$slots: { default: !0 }
	}),
		vt());
}
export { Tt as default, It as widgetMeta };
//# sourceMappingURL=CJRzwHNa.js.map
