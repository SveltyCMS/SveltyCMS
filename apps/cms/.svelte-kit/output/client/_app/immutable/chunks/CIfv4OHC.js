import { i as W } from './zi73tRJP.js';
import { p as ve, c as r, s as o, r as t, b as fe, g as l, d as ue, n as pe, t as x, a as ge } from './DrlZFkx8.js';
import { f as v, s as g, a as c, d as me } from './CTjXDULS.js';
import { e as A, i as B } from './BXe5mj2j.js';
import { t as _e, f as be } from './0XeaN6pZ.js';
import { b as d, c as u, s as F } from './MEFvoR_D.js';
import { p as I } from './DePHBZW_.js';
import { J as Q } from './N8Jg0v49.js';
import { p as xe } from './C9E6SjbS.js';
var we = v(
		'<span class="relative inline-block mr-1"><span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"></span> <span class="relative z-10"> </span></span>'
	),
	he = v('<h3 class="relative text-lg font-medium leading-tight text-tertiary-500 dark:text-primary-500"></h3>'),
	ye = v('<h3 class="text-lg font-medium leading-tight text-primary-500 hover:underline dark:text-primary-400"> </h3>'),
	ke = v(
		'<span class="relative inline-block mr-1"><span class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md"></span> <span class="relative z-10"> </span></span>'
	),
	Pe = v('<p class="text-sm leading-normal text-surface-600 dark:text-surface-300"></p>'),
	Se = v('<p class="text-sm leading-normal text-surface-600 dark:text-surface-300"> </p>'),
	Te = v(
		'<div class="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px]"><div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800"><div class="w-2 h-2 rounded-full bg-red-500"></div> <span>Keyword</span></div> <div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800"><div class="w-2 h-2 rounded-full bg-yellow-500"></div> <span>Power Word</span></div> <div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800"><div class="w-2 h-2 rounded-full bg-orange-400"></div> <span>Prominent</span></div> <div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800"><div class="w-2 h-2 rounded-full bg-green-500"></div> <span>Good Length</span></div> <div class="flex items-center gap-1.5 p-1 rounded bg-surface-100 dark:bg-surface-800"><div class="w-2 h-2 rounded-full bg-blue-500"></div> <span>Neutral</span></div></div>'
	),
	ze = v(
		'<div class="mt-4 border-t border-surface-500 pt-4 dark:text-surface-50"><div class="mb-4 flex flex-wrap items-center justify-between gap-4"><h3 class="h3">SEO Preview</h3> <div class="flex items-center gap-2"><div class="preset-filled-surface-500 btn-group [&amp;>*+*]:border-surface-500"><button type="button" title="Desktop View"><iconify-icon></iconify-icon></button> <button type="button" title="Mobile View"><iconify-icon></iconify-icon></button></div> <button type="button" title="Toggle Heatmap Visualization"><iconify-icon></iconify-icon> Heatmap</button></div></div> <div><div class="mb-1 flex items-center gap-2 text-xs text-surface-500 dark:text-surface-50"><div class="flex h-6 w-6 items-center justify-center rounded-full bg-surface-200 dark:bg-surface-700"><iconify-icon></iconify-icon></div> <div class="flex flex-col leading-none"><span class="font-bold text-surface-700 dark:text-surface-300"> </span> <span class="truncate text-[10px]"> </span></div> <iconify-icon></iconify-icon></div> <div class="mb-1"><!></div> <div><!></div></div> <!></div>',
		2
	);
function je(X, s) {
	ve(s, !0);
	const Z = new Set(
		Q
			? Q()
					.split(',')
					.map((e) => e.trim().toLowerCase())
			: []
	);
	function $(e, a) {
		const i = e.toLowerCase().replace(/[^a-z0-9]/g, '');
		return i
			? M() && M().some((n) => i.includes(n.toLowerCase()) || n.toLowerCase().includes(i))
				? 'rgba(239, 68, 68, 0.8)'
				: Z.has(i)
					? 'rgba(234, 179, 8, 0.8)'
					: a < 3
						? 'rgba(249, 115, 22, 0.6)'
						: i.length > 4
							? 'rgba(34, 197, 94, 0.5)'
							: 'rgba(59, 130, 246, 0.3)'
			: 'transparent';
	}
	function j(e) {
		return e.split(' ').map((a, i) => {
			const n = $(a, i);
			return { word: a, color: n };
		});
	}
	const M = I(s, 'keywords', 19, () => []),
		ee = I(s, 'ontogglePreview', 3, () => {});
	let p = ue(!1);
	function G() {
		ee()();
	}
	var k = ze(),
		P = r(k),
		J = o(r(P), 2),
		S = r(J),
		m = r(S);
	m.__click = () => !s.SeoPreviewToggle && G();
	var K = r(m);
	(d(K, 'icon', 'mdi:monitor'), d(K, 'width', '18'), t(m));
	var w = o(m, 2);
	w.__click = () => s.SeoPreviewToggle && G();
	var N = r(w);
	(d(N, 'icon', 'mdi:cellphone'), d(N, 'width', '18'), t(w), t(S));
	var h = o(S, 2);
	h.__click = () => fe(p, !l(p));
	var T = r(h);
	(d(T, 'icon', 'mdi:fire'), d(T, 'width', '18'), u(T, 1, 'mr-1'), pe(), t(h), t(J), t(P));
	var y = o(P, 2),
		z = r(y),
		C = r(z),
		H = r(C);
	(d(H, 'icon', 'mdi:earth'), d(H, 'width', '14'), u(H, 1, 'text-surface-700 dark:text-surface-300'), t(C));
	var L = o(C, 2),
		O = r(L),
		ae = r(O, !0);
	t(O);
	var U = o(O, 2),
		te = r(U, !0);
	(t(U), t(L));
	var Y = o(L, 2);
	(d(Y, 'icon', 'mdi:dots-vertical'), u(Y, 1, 'ml-auto'), t(z));
	var D = o(z, 2),
		re = r(D);
	{
		var ie = (e) => {
				var a = he();
				(A(
					a,
					21,
					() => j(s.title || 'Page Title'),
					B,
					(i, n) => {
						let E = () => l(n).word,
							R = () => l(n).color;
						var f = we(),
							_ = r(f),
							b = o(_, 2),
							V = r(b, !0);
						(t(b),
							t(f),
							x(() => {
								(F(_, `background-color: ${R() ?? ''}; width: 120%; height: 120%; z-index: 0;`), g(V, E()));
							}),
							c(i, f));
					}
				),
					t(a),
					c(e, a));
			},
			se = (e) => {
				var a = ye(),
					i = r(a, !0);
				(t(a), x(() => g(i, s.title || 'Page Title')), c(e, a));
			};
		W(re, (e) => {
			l(p) ? e(ie) : e(se, !1);
		});
	}
	t(D);
	var q = o(D, 2),
		oe = r(q);
	{
		var ne = (e) => {
				var a = Pe();
				(A(
					a,
					21,
					() => j(s.description || 'Page description goes here...'),
					B,
					(i, n) => {
						let E = () => l(n).word,
							R = () => l(n).color;
						var f = ke(),
							_ = r(f),
							b = o(_, 2),
							V = r(b, !0);
						(t(b),
							t(f),
							x(() => {
								(F(_, `background-color: ${R() ?? ''}; width: 140%; height: 140%; z-index: 0;`), g(V, E()));
							}),
							c(i, f));
					}
				),
					t(a),
					c(e, a));
			},
			le = (e) => {
				var a = Se(),
					i = r(a, !0);
				(t(a), x(() => g(i, s.description || 'Page description goes here...')), c(e, a));
			};
		W(oe, (e) => {
			l(p) ? e(ne) : e(le, !1);
		});
	}
	(t(q), t(y));
	var de = o(y, 2);
	{
		var ce = (e) => {
			var a = Te();
			(_e(3, a, () => be), c(e, a));
		};
		W(de, (e) => {
			l(p) && e(ce);
		});
	}
	(t(k),
		x(() => {
			(u(m, 1, `${s.SeoPreviewToggle ? '' : 'preset-filled-primary-500'} btn-sm`),
				u(w, 1, `${s.SeoPreviewToggle ? 'preset-filled-primary-500' : ''} btn-sm`),
				u(h, 1, `btn-sm ${l(p) ? 'variant-filled-warning' : 'preset-filled-surface-500'}`),
				u(y, 1, `card variant-glass-surface p-4 transition-all duration-200 ${s.SeoPreviewToggle ? 'max-w-[375px] mx-auto' : 'w-full'}`),
				g(ae, xe.HOST_PROD || 'Your Site'),
				g(te, s.hostUrl));
		}),
		c(X, k),
		ge());
}
me(['click']);
export { je as default };
//# sourceMappingURL=CIfv4OHC.js.map
