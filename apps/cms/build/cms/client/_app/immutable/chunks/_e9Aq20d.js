import { i as fa } from './zi73tRJP.js';
import { p as _a, f as X, c as r, r as e, s as i, t as L, g as t, u as h, a as ma } from './DrlZFkx8.js';
import { d as ga, f as B, s as o, a as M, t as xa } from './CTjXDULS.js';
import { e as ya, i as ha } from './BXe5mj2j.js';
import { b as s, a as O, e as ka } from './MEFvoR_D.js';
import { p as k } from './DePHBZW_.js';
import { D as Pa, E as wa, F as A, G as Y, H as Z } from './N8Jg0v49.js';
var Ga = B(
		' <span class="text-tertiary-500 dark:text-primary-500"> </span>–<span class="text-tertiary-500 dark:text-primary-500"> </span> <span class="text-tertiary-500 dark:text-primary-500"> </span> ',
		1
	),
	Ia = B('<option class="bg-surface-300 text-black dark:bg-surface-700 dark:text-white"> </option>'),
	Ca = B(
		'<div class="mb-1 flex items-center justify-between text-xs md:mb-0 md:text-sm" role="status" aria-live="polite"><div><span> </span> <span class="text-tertiary-500 dark:text-primary-500"> </span> <span> </span> <span class="text-tertiary-500 dark:text-primary-500"> </span> <span class="ml-4" aria-label="Current items shown"><!></span></div></div> <nav class="btn-group" aria-label="Table pagination"><button type="button" aria-label="Go to first page" title="First Page" class="btn h-8 w-8 rounded-none border-r border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:hover:bg-surface-800"><iconify-icon></iconify-icon></button> <button type="button" aria-label="Go to previous page" title="Previous Page" class="btn h-8 w-8 rounded-none border-r border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:hover:bg-surface-800"><iconify-icon></iconify-icon></button> <select aria-label="Select number of rows per page" class="appearance-none bg-transparent p-0 px-2 text-center text-sm text-tertiary-500 hover:bg-surface-200 dark:border-surface-50 dark:text-primary-500 dark:hover:bg-surface-800 sm:px-4" title="Rows per page"></select> <button type="button" aria-label="Go to next page" title="Next Page" class="btn h-8 w-8 rounded-none border-l border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:hover:bg-surface-800"><iconify-icon></iconify-icon></button> <button type="button" aria-label="Go to last page" title="Last Page" class="btn h-8 w-8 rounded-none border-l border-surface-300 px-1 hover:bg-surface-200 disabled:text-surface-400 disabled:opacity-50! dark:border-surface-50 dark:hover:bg-surface-800"><iconify-icon></iconify-icon></button></nav>',
		3
	);
function ja(S, d) {
	_a(d, !0);
	let l = k(d, 'currentPage', 15),
		U = k(d, 'pagesCount', 3, 1),
		u = k(d, 'rowsPerPage', 15),
		z = k(d, 'rowsPerPageOptions', 19, () => [5, 10, 25, 50, 100, 500]),
		p = k(d, 'totalItems', 3, 0);
	const P = h(() => (U() && U() > 0 ? U() : u() > 0 ? Math.ceil(p() / u()) : 1)),
		w = h(() => l() === 1),
		G = h(() => l() === t(P)),
		$ = h(() => (p() === 0 ? 0 : (l() - 1) * u() + 1)),
		aa = h(() => (p() === 0 ? 0 : Math.min(l() * u(), p())));
	function I(a) {
		a >= 1 && a <= t(P) && a !== l() && (l(a), d.onUpdatePage?.(a));
	}
	function ea(a) {
		(u(a), d.onUpdateRowsPerPage?.(a));
	}
	var J = Ca(),
		j = X(J),
		K = r(j),
		D = r(K),
		ta = r(D, !0);
	e(D);
	var E = i(D, 2),
		ra = r(E, !0);
	e(E);
	var H = i(E, 2),
		sa = r(H, !0);
	e(H);
	var N = i(H, 2),
		ia = r(N, !0);
	e(N);
	var Q = i(N, 2),
		oa = r(Q);
	{
		var na = (a) => {
				var n = Ga(),
					c = X(n),
					b = i(c),
					m = r(b, !0);
				e(b);
				var y = i(b, 2),
					la = r(y, !0);
				e(y);
				var W = i(y),
					q = i(W),
					da = r(q, !0);
				e(q);
				var ba = i(q);
				(L(
					(ua, pa, va) => {
						(o(c, `${ua ?? ''} `), o(m, t($)), o(la, t(aa)), o(W, ` ${pa ?? ''} `), o(da, p()), o(ba, ` ${va ?? ''}`));
					},
					[() => Y(), () => A(), () => Z()]
				),
					M(a, n));
			},
			ca = (a) => {
				var n = xa();
				(L((c, b, m) => o(n, `${c ?? ''} 0 ${b ?? ''} 0 ${m ?? ''}`), [() => Y(), () => A(), () => Z()]), M(a, n));
			};
		fa(oa, (a) => {
			p() > 0 ? a(na) : a(ca, !1);
		});
	}
	(e(Q), e(K), e(j));
	var V = i(j, 2),
		v = r(V);
	v.__click = () => I(1);
	var C = r(v);
	(s(C, 'icon', 'material-symbols:first-page'), s(C, 'width', '24'), s(C, 'role', 'presentation'), s(C, 'aria-hidden', 'true'), e(v));
	var f = i(v, 2);
	f.__click = () => I(l() - 1);
	var T = r(f);
	(s(T, 'icon', 'material-symbols:chevron-left'), s(T, 'width', '24'), s(T, 'role', 'presentation'), s(T, 'aria-hidden', 'true'), e(f));
	var g = i(f, 2);
	((g.__change = (a) => ea(parseInt(a.target.value))),
		ya(g, 21, z, ha, (a, n) => {
			var c = Ia(),
				b = r(c);
			e(c);
			var m = {};
			(L(
				(y) => {
					(o(
						b,
						`${t(n) ?? ''}
				${y ?? ''}`
					),
						m !== (m = t(n)) && (c.value = (c.__value = t(n)) ?? ''));
				},
				[() => Pa()]
			),
				M(a, c));
		}),
		e(g));
	var _ = i(g, 2);
	_.__click = () => I(l() + 1);
	var F = r(_);
	(s(F, 'icon', 'material-symbols:chevron-right'), s(F, 'width', '24'), s(F, 'role', 'presentation'), s(F, 'aria-hidden', 'true'), e(_));
	var x = i(_, 2);
	x.__click = () => I(t(P));
	var R = r(x);
	(s(R, 'icon', 'material-symbols:last-page'),
		s(R, 'width', '24'),
		s(R, 'role', 'presentation'),
		s(R, 'aria-hidden', 'true'),
		e(x),
		e(V),
		L(
			(a, n) => {
				(o(ta, a),
					o(ra, l()),
					o(sa, n),
					o(ia, t(P)),
					(v.disabled = t(w)),
					O(v, 'aria-disabled', t(w)),
					(f.disabled = t(w)),
					O(f, 'aria-disabled', t(w)),
					(_.disabled = t(G)),
					O(_, 'aria-disabled', t(G)),
					(x.disabled = t(G)),
					O(x, 'aria-disabled', t(G)));
			},
			[() => wa(), () => A()]
		),
		ka(g, u),
		M(S, J),
		ma());
}
ga(['click', 'change']);
export { ja as T };
//# sourceMappingURL=_e9Aq20d.js.map
