import { i as x } from './zi73tRJP.js';
import { p as da, c as e, n as X, r as t, s as p, t as w, a as fa, f as P, g as l } from './DrlZFkx8.js';
import { f as _, a, s as W, c as q, t as A, d as xa } from './CTjXDULS.js';
import { e as _a, i as ma } from './BXe5mj2j.js';
import { t as ya, s as ua } from './0XeaN6pZ.js';
import { b as B, c as h, d as pa, a as Y } from './MEFvoR_D.js';
import { p as M } from './DePHBZW_.js';
var ba = _(
		'<div class="flex items-center gap-3"><div> </div> <div class="text-xs opacity-70 hidden sm:block"><!></div> <iconify-icon></iconify-icon></div>',
		2
	),
	ha = _('<div class="text-xs opacity-50"><!></div>'),
	ga = _(
		'<div class="flex-1 flex flex-col items-center justify-center text-surface-400 opacity-50 p-4"><div class="placeholder-circle animate-pulse w-8 h-8 mb-2"></div> <span class="text-xs">Analyzing...</span></div>'
	),
	wa = _('<div class="mt-1.5 text-[10px] font-mono bg-surface-100 dark:bg-surface-700 p-1.5 rounded opacity-80"><strong>Fix:</strong> </div>'),
	Ra = _(
		'<div><div class="flex items-start gap-2"><div class="mt-0.5 shrink-0"><iconify-icon></iconify-icon></div> <div class="flex-1 min-w-0"><div class="font-bold text-sm truncate"> </div> <p class="text-xs opacity-80 line-clamp-2"> </p> <!></div></div></div>',
		2
	),
	ka = _('<div class="alert variant-soft-success"><iconify-icon></iconify-icon> <span class="text-sm">No issues found!</span></div>', 2),
	Aa = _('<div class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar border-t border-surface-500/20 svelte-h69ce9"><!></div>'),
	Na = _(
		'<div class="flex-1 flex flex-col items-center justify-center text-surface-400 opacity-50 p-4"><span class="text-xs">Run analysis to see results.</span></div>'
	),
	za = _(
		'<div><button type="button" class="flex items-center gap-4 w-full p-3 bg-surface-100-800-token hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors text-left"><div class="flex items-center gap-2 flex-1"><iconify-icon></iconify-icon> <h3 class="h3 text-lg!">Analysis</h3></div> <!></button> <!></div>',
		2
	);
function qa(Z, i) {
	da(i, !0);
	let $ = M(i, 'class', 3, ''),
		R = M(i, 'expanded', 15, !1),
		O = M(i, 'isAnalyzing', 3, !1);
	var N = za(),
		z = e(N);
	z.__click = () => R(!R());
	var C = e(z),
		Q = e(C);
	(B(Q, 'icon', 'mdi:google-analytics'), h(Q, 1, 'text-tertiary-500 text-xl'), X(2), t(C));
	var aa = p(C, 2);
	{
		var ea = (v) => {
				var c = ba(),
					m = e(c),
					k = e(m);
				t(m);
				var b = p(m, 2),
					r = e(b);
				{
					var n = (d) => {
							var o = A('Excellent');
							a(d, o);
						},
						D = (d) => {
							var o = q(),
								y = P(o);
							{
								var H = (u) => {
										var f = A('Good Start');
										a(u, f);
									},
									I = (u) => {
										var f = A('Needs Work');
										a(u, f);
									};
								x(
									y,
									(u) => {
										i.analysisResult.score.overall >= 50 ? u(H) : u(I, !1);
									},
									!0
								);
							}
							a(d, o);
						};
					x(r, (d) => {
						i.analysisResult.score.overall >= 80 ? d(n) : d(D, !1);
					});
				}
				t(b);
				var j = p(b, 2);
				(w(() => B(j, 'icon', R() ? 'mdi:chevron-up' : 'mdi:chevron-down')),
					h(j, 1, 'text-surface-400'),
					t(c),
					w(
						(d) => {
							(h(
								m,
								1,
								`font-bold text-lg ${i.analysisResult.score.overall >= 80 ? 'text-success-500' : i.analysisResult.score.overall >= 50 ? 'text-warning-500' : 'text-error-500'}`
							),
								W(k, `${d ?? ''}%`));
						},
						[() => (isNaN(i.analysisResult.score.overall) ? '0' : i.analysisResult.score.overall)]
					),
					a(v, c));
			},
			ta = (v) => {
				var c = ha(),
					m = e(c);
				{
					var k = (r) => {
							var n = A('Analyzing...');
							a(r, n);
						},
						b = (r) => {
							var n = A('No data');
							a(r, n);
						};
					x(m, (r) => {
						O() ? r(k) : r(b, !1);
					});
				}
				(t(c), a(v, c));
			};
		x(aa, (v) => {
			i.analysisResult ? v(ea) : v(ta, !1);
		});
	}
	t(z);
	var ra = p(z, 2);
	{
		var ia = (v) => {
			var c = q(),
				m = P(c);
			{
				var k = (r) => {
						var n = ga();
						a(r, n);
					},
					b = (r) => {
						var n = q(),
							D = P(n);
						{
							var j = (o) => {
									var y = Aa(),
										H = e(y);
									{
										var I = (f) => {
												var g = q(),
													S = P(g);
												(_a(
													S,
													17,
													() => i.analysisResult.suggestions,
													ma,
													(sa, s) => {
														var E = Ra(),
															T = e(E),
															J = e(T),
															U = e(J);
														(w(() =>
															B(U, 'icon', l(s).type === 'error' ? 'mdi:alert-circle' : l(s).type === 'warning' ? 'mdi:alert' : 'mdi:information')
														),
															t(J));
														var V = p(J, 2),
															F = e(V),
															la = e(F, !0);
														t(F);
														var G = p(F, 2),
															oa = e(G, !0);
														t(G);
														var va = p(G, 2);
														{
															var ca = (K) => {
																var L = wa(),
																	na = p(e(L));
																(t(L), w(() => W(na, ` ${l(s).fix ?? ''}`)), a(K, L));
															};
															x(va, (K) => {
																l(s).fix && K(ca);
															});
														}
														(t(V),
															t(T),
															t(E),
															w(() => {
																(h(
																	E,
																	1,
																	`card p-3 border-l-4 ${l(s).type === 'error' ? 'border-error-500 bg-error-500/10' : l(s).type === 'warning' ? 'border-warning-500 bg-warning-500/10' : 'border-primary-500 bg-primary-500/10'}`
																),
																	h(
																		U,
																		1,
																		pa(l(s).type === 'error' ? 'text-error-500' : l(s).type === 'warning' ? 'text-warning-500' : 'text-primary-500')
																	),
																	Y(F, 'title', l(s).title),
																	W(la, l(s).title),
																	Y(G, 'title', l(s).description),
																	W(oa, l(s).description));
															}),
															a(sa, E));
													}
												),
													a(f, g));
											},
											u = (f) => {
												var g = ka(),
													S = e(g);
												(B(S, 'icon', 'mdi:check-circle'), h(S, 1, 'text-xl'), X(2), t(g), a(f, g));
											};
										x(H, (f) => {
											i.analysisResult.suggestions.length > 0 ? f(I) : f(u, !1);
										});
									}
									(t(y), ya(3, y, () => ua), a(o, y));
								},
								d = (o) => {
									var y = Na();
									a(o, y);
								};
							x(
								D,
								(o) => {
									i.analysisResult ? o(j) : o(d, !1);
								},
								!0
							);
						}
						a(r, n);
					};
				x(m, (r) => {
					O() ? r(k) : r(b, !1);
				});
			}
			a(v, c);
		};
		x(ra, (v) => {
			R() && v(ia);
		});
	}
	(t(N),
		w(() =>
			h(
				N,
				1,
				`card preset-tonal-surface flex flex-col overflow-hidden ${$() ?? ''} transition-all duration-300 ${R() ? 'h-[500px]' : 'h-16'}`,
				'svelte-h69ce9'
			)
		),
		a(Z, N),
		fa());
}
xa(['click']);
export { qa as default };
//# sourceMappingURL=C1XjBKGT.js.map
