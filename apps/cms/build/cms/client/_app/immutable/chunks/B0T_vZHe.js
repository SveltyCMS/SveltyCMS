import { i as tt } from './zi73tRJP.js';
import { p as et, x as at, z as I, g as O, d as it, f as J, a as rt, c as b, b as ot, s as x, r as m, t as T } from './DrlZFkx8.js';
import { d as nt, c as st, a as D, f as j } from './CTjXDULS.js';
import { r as lt, b as r, a as i, c as E, d as N } from './MEFvoR_D.js';
import { b as ct } from './D4QnGYgQ.js';
import { b as ut } from './YQp2a1pQ.js';
import { p as d } from './DePHBZW_.js';
import { a as ft } from './C-hhfhAN.js';
import { l as A } from './BvngfGKt.js';
import { v as dt, w as bt, x as mt, y as C, z as U, A as V, B as _t, C as yt } from './N8Jg0v49.js';
var pt = j(
		'<div class="input-group input-group-divider grid grid-cols-[1fr_auto] h-10 w-full max-w-xs sm:max-w-sm transition-all duration-300 z-50"><input type="text" class="input w-full h-full outline-none border-none bg-transparent px-4 transition-all duration-500 ease-in-out focus:border-tertiary-500 dark:text-surface-50 dark:bg-surface-800 dark:focus:border-primary-500"/> <button class="preset-filled-surface-500 w-10 flex items-center justify-center"><iconify-icon></iconify-icon></button></div>',
		2
	),
	gt = j(
		'<button type="button" class="btn preset-outlined-surface-500 rounded-full"><iconify-icon></iconify-icon></button> <button type="button" class="btn preset-outlined-surface-500 rounded-full"><iconify-icon></iconify-icon></button> <button type="button" class="btn preset-outlined-surface-500 rounded-full"><iconify-icon></iconify-icon></button> <button type="button" class="btn preset-outlined-surface-500 rounded-full"><iconify-icon></iconify-icon></button>',
		3
	);
function Et(B, l) {
	et(l, !0);
	let S = d(l, 'globalSearchValue', 15, ''),
		o = d(l, 'searchShow', 15, !1),
		_ = d(l, 'filterShow', 15, !1),
		y = d(l, 'columnShow', 15, !1),
		c = d(l, 'density', 15, 'normal'),
		v = d(l, 'densityOptions', 27, () => at(['compact', 'normal', 'comfortable']));
	d(l, 'showDeleted', 11, !1);
	let w = it(void 0);
	I(() => {
		o() && O(w) && O(w).focus();
	});
	const k = 'userTableSettings';
	(I(() => {
		try {
			const t = JSON.parse(localStorage.getItem(k) || '{}');
			t.density && v().includes(t.density) && c(t.density);
		} catch (t) {
			A.error('Failed to load user table settings', t);
		}
	}),
		I(() => {
			if (c())
				try {
					const t = JSON.parse(localStorage.getItem(k) || '{}');
					((t.density = c()), localStorage.setItem(k, JSON.stringify(t)));
				} catch (t) {
					A.error('Failed to save user table settings', t);
				}
		}));
	function p(t) {
		(t !== 'search' && o(!1), t !== 'filter' && _(!1), t !== 'column' && y(!1), ft.setTranslationStatusOpen(!1));
	}
	function G() {
		const u = (v().indexOf(c()) + 1) % v().length;
		c(v()[u]);
	}
	function K() {
		return c().charAt(0).toUpperCase() + c().slice(1);
	}
	function R() {
		switch (c()) {
			case 'compact':
				return 'material-symbols:align-space-even-rounded';
			case 'normal':
				return 'material-symbols:align-space-around-rounded';
			case 'comfortable':
				return 'material-symbols:align-space-between-rounded';
			default:
				return 'material-symbols:align-space-around-rounded';
		}
	}
	var z = st(),
		Y = J(z);
	{
		var q = (t) => {
				var u = pt(),
					e = b(u);
				(lt(e),
					(e.__keydown = (a) => a.key === 'Enter' && p()),
					ut(
						e,
						(a) => ot(w, a),
						() => O(w)
					));
				var n = x(e, 2);
				((n.__click = () => {
					(S(''), o(!1));
				}),
					(n.__keydown = (a) => {
						(a.key === 'Enter' || a.key === ' ') && (S(''), o(!1));
					}));
				var s = b(n);
				(r(s, 'icon', 'ic:outline-search-off'),
					r(s, 'width', '20'),
					m(n),
					m(u),
					T(
						(a, f, g) => {
							(i(e, 'placeholder', a), i(e, 'aria-label', f), i(n, 'aria-label', g));
						},
						[() => dt(), () => bt(), () => mt()]
					),
					ct(e, S),
					D(t, u));
			},
			H = (t) => {
				var u = gt(),
					e = J(u);
				e.__click = () => {
					(o(!o()), o() && p('search'));
				};
				var n = b(e);
				(r(n, 'icon', 'material-symbols:search-rounded'), r(n, 'width', '24'), m(e));
				var s = x(e, 2);
				s.__click = () => {
					(_(!_()), _() && p('filter'));
				};
				var a = b(s);
				(r(a, 'icon', 'carbon:filter-edit'), r(a, 'width', '24'), m(s));
				var f = x(s, 2);
				f.__click = () => {
					(y(!y()), y() && p('column'));
				};
				var g = b(f);
				(r(g, 'icon', 'fluent:column-triple-edit-24-regular'), r(g, 'width', '24'), m(f));
				var h = x(f, 2);
				h.__click = () => {
					(G(), p('density'));
				};
				var F = b(h);
				(T(() => r(F, 'icon', R())),
					r(F, 'width', '24'),
					m(h),
					T(
						(L, M, P, Q, W, X, Z, $) => {
							(i(e, 'aria-label', L),
								i(e, 'title', M),
								E(n, 1, N(o() ? 'text-tertiary-500 dark:text-primary-500' : '')),
								i(s, 'aria-label', P),
								i(s, 'title', Q),
								E(a, 1, N(_() ? 'text-tertiary-500 dark:text-primary-500' : '')),
								i(f, 'aria-label', W),
								i(f, 'title', X),
								E(g, 1, N(y() ? 'text-tertiary-500 dark:text-primary-500' : '')),
								i(h, 'aria-label', Z),
								i(h, 'title', $));
						},
						[() => C(), () => C(), () => U(), () => U(), () => V(), () => V(), () => _t(), () => yt({ density: K() })]
					),
					D(t, u));
			};
		tt(Y, (t) => {
			o() ? t(q) : t(H, !1);
		});
	}
	(D(B, z), rt());
}
nt(['keydown', 'click']);
export { Et as T };
//# sourceMappingURL=B0T_vZHe.js.map
