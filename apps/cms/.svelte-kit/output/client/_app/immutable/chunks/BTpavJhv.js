import { i as h } from './zi73tRJP.js';
import { p as Ca, ah as Ea, f as L, a as Ka, s, c as a, n as P, r as e, t as w, g as i } from './DrlZFkx8.js';
import { c as Oa, e as Sa, a as l, f as d, s as o, d as Fa } from './CTjXDULS.js';
import { e as Ga, i as Ia } from './BXe5mj2j.js';
import { t as sa, f as Ma, a as Na } from './0XeaN6pZ.js';
import { b as x, c as n, s as Ta } from './MEFvoR_D.js';
import { p as ta } from './DePHBZW_.js';
var qa = d('<div class="mt-2 text-xs font-mono bg-surface-100 dark:bg-surface-600/50 p-2 rounded"><strong>Fix:</strong> </div>'),
	Ba = d(
		'<div><div class="flex items-start justify-between"><div><div class="font-bold flex items-center gap-2"><iconify-icon></iconify-icon> </div> <p class="text-sm mt-1 opacity-90"> </p> <!></div> <span> </span></div></div>',
		2
	),
	Da = d('<div class="space-y-3"><h4 class="h4">Room for Improvement</h4> <!></div>'),
	Ha = d('<div class="alert variant-soft-success"><iconify-icon></iconify-icon> <span>Great job! No specific issues found.</span></div>', 2),
	Ja = d(
		'<div class="flex items-center justify-center p-4 bg-surface-200-700-token rounded-container-token mb-6"><div class="text-center"><div> </div> <p class="mt-2 font-bold text-surface-600 dark:text-surface-300">Overall Score</p></div> <div class="ml-8 grid grid-cols-2 gap-4 text-sm"><div class="flex flex-col"><span class="opacity-70">Keywords</span> <span> </span></div> <div class="flex flex-col"><span class="opacity-70">Content</span> <span> </span></div> <div class="flex flex-col"><span class="opacity-70">Technical</span> <span> </span></div> <div class="flex flex-col"><span class="opacity-70">Readability</span> <span> </span></div></div></div> <!>',
		1
	),
	La = d('<div class="p-8 text-center"><div class="placeholder-circle animate-pulse w-16 h-16 mx-auto mb-4"></div> <p>Running Analysis...</p></div>'),
	Pa = d(
		'<div class="fixed inset-0 z-999 bg-surface-backdrop-token backdrop-blur-sm" role="presentation"></div> <div class="fixed left-1/2 top-1/2 z-1000 -translate-x-1/2 -translate-y-1/2 shadow-xl" role="dialog" aria-modal="true"><div class="card w-[90vw] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-surface-100-800-token"><header class="card-header flex items-center justify-between border-b border-surface-500/20 p-4"><h3 class="h3 flex items-center gap-2"><iconify-icon></iconify-icon> SEO Analysis Report</h3> <button type="button" class="btn-icon btn-icon-sm preset-outlined-surface-500" aria-label="Close"><iconify-icon></iconify-icon></button></header> <div class="flex-1 overflow-y-auto p-4 space-y-4"><!></div> <footer class="card-footer p-4 border-t border-surface-500/20 flex justify-end"><button class="btn preset-filled-surface-500">Close</button></footer></div></div>',
		3
	);
function $a(ra, t) {
	Ca(t, !0);
	let g = ta(t, 'show', 15),
		ia = ta(t, 'onclose', 3, () => {});
	function y() {
		(g(!1), ia()());
	}
	function oa(_) {
		g() && _.key === 'Escape' && y();
	}
	var Q = Oa();
	Sa('keydown', Ea, oa);
	var na = L(Q);
	{
		var la = (_) => {
			var U = Pa(),
				R = L(U);
			R.__click = y;
			var k = s(R, 2),
				V = a(k),
				j = a(V),
				z = a(j),
				W = a(z);
			(x(W, 'icon', 'mdi:google-analytics'), n(W, 1, 'text-primary-500'), P(), e(z));
			var A = s(z, 2);
			A.__click = y;
			var X = a(A);
			(x(X, 'icon', 'mdi:close'), x(X, 'width', '24'), e(A), e(j));
			var C = s(j, 2),
				ca = a(C);
			{
				var da = (v) => {
						var p = Ja(),
							E = L(p),
							K = a(E),
							m = a(K),
							_a = a(m);
						(e(m), P(2), e(K));
						var Z = s(K, 2),
							O = a(Z),
							S = s(a(O), 2),
							xa = a(S);
						(e(S), e(O));
						var F = s(O, 2),
							G = s(a(F), 2),
							ya = a(G);
						(e(G), e(F));
						var I = s(F, 2),
							M = s(a(I), 2),
							pa = a(M);
						(e(M), e(I));
						var $ = s(I, 2),
							N = s(a($), 2),
							ma = a(N);
						(e(N), e($), e(Z), e(E));
						var ua = s(E, 2);
						{
							var ba = (f) => {
									var c = Da(),
										u = s(a(c), 2);
									(Ga(
										u,
										17,
										() => t.analysisResult.suggestions,
										Ia,
										(wa, r) => {
											var b = Ba(),
												aa = a(b),
												T = a(aa),
												q = a(T),
												ea = a(q);
											w(() => x(ea, 'icon', i(r).type === 'error' ? 'mdi:alert-circle' : i(r).type === 'warning' ? 'mdi:alert' : 'mdi:information'));
											var ga = s(ea);
											e(q);
											var B = s(q, 2),
												Ra = a(B, !0);
											e(B);
											var ka = s(B, 2);
											{
												var ja = (H) => {
													var J = qa(),
														Aa = s(a(J));
													(e(J), w(() => o(Aa, ` ${i(r).fix ?? ''}`)), l(H, J));
												};
												h(ka, (H) => {
													i(r).fix && H(ja);
												});
											}
											e(T);
											var D = s(T, 2),
												za = a(D, !0);
											(e(D),
												e(aa),
												e(b),
												w(() => {
													(n(
														b,
														1,
														`card p-4 border-l-4 ${i(r).type === 'error' ? 'border-error-500 bg-error-500/10' : i(r).type === 'warning' ? 'border-warning-500 bg-warning-500/10' : 'border-primary-500 bg-primary-500/10'}`
													),
														o(ga, ` ${i(r).title ?? ''}`),
														o(Ra, i(r).description),
														n(
															D,
															1,
															`badge ${i(r).type === 'error' ? 'preset-filled-error-500' : i(r).type === 'warning' ? 'variant-filled-warning' : 'preset-filled-primary-500'} uppercase text-[10px]`
														),
														o(za, i(r).type));
												}),
												l(wa, b));
										}
									),
										e(c),
										l(f, c));
								},
								ha = (f) => {
									var c = Ha(),
										u = a(c);
									(x(u, 'icon', 'mdi:check-circle'), n(u, 1, 'text-2xl mr-2'), P(2), e(c), l(f, c));
								};
							h(ua, (f) => {
								t.analysisResult.suggestions.length > 0 ? f(ba) : f(ha, !1);
							});
						}
						(w(() => {
							(n(
								m,
								1,
								`radial-progress text-4xl font-bold ${t.analysisResult.score.overall >= 80 ? 'text-success-500' : t.analysisResult.score.overall >= 50 ? 'text-warning-500' : 'text-error-500'}`
							),
								Ta(m, `--value:${t.analysisResult.score.overall ?? ''}; --size:6rem;`),
								o(_a, `${t.analysisResult.score.overall ?? ''}%`),
								n(S, 1, `font-bold ${t.analysisResult.score.keywords >= 80 ? 'text-success-500' : 'text-warning-500'}`),
								o(xa, `${t.analysisResult.score.keywords ?? ''}%`),
								n(G, 1, `font-bold ${t.analysisResult.score.content >= 80 ? 'text-success-500' : 'text-warning-500'}`),
								o(ya, `${t.analysisResult.score.content ?? ''}%`),
								n(M, 1, `font-bold ${t.analysisResult.score.technical >= 80 ? 'text-success-500' : 'text-warning-500'}`),
								o(pa, `${t.analysisResult.score.technical ?? ''}%`),
								n(N, 1, `font-bold ${t.analysisResult.score.readability >= 80 ? 'text-success-500' : 'text-warning-500'}`),
								o(ma, `${t.analysisResult.score.readability ?? ''}%`));
						}),
							l(v, p));
					},
					va = (v) => {
						var p = La();
						l(v, p);
					};
				h(ca, (v) => {
					t.analysisResult ? v(da) : v(va, !1);
				});
			}
			e(C);
			var Y = s(C, 2),
				fa = a(Y);
			((fa.__click = y),
				e(Y),
				e(V),
				e(k),
				sa(
					3,
					R,
					() => Ma,
					() => ({ duration: 150 })
				),
				sa(
					3,
					k,
					() => Na,
					() => ({ duration: 200, start: 0.95 })
				),
				l(_, U));
		};
		h(na, (_) => {
			g() && _(la);
		});
	}
	(l(ra, Q), Ka());
}
Fa(['click']);
export { $a as default };
//# sourceMappingURL=BTpavJhv.js.map
