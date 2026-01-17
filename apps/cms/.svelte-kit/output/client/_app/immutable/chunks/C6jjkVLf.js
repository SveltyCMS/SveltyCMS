import { i as h } from './zi73tRJP.js';
import { p as X, s as b, c as o, g as j, u as Y, t as m, a as Z, r as n, f as E } from './DrlZFkx8.js';
import { d as $, f as u, a as s, s as O, c as R } from './CTjXDULS.js';
import { s as aa } from './DhHAlOU0.js';
import { e as ea, i as ia } from './BXe5mj2j.js';
import { c as C, d as ta, b as t, a as ra } from './MEFvoR_D.js';
import { p as v } from './DePHBZW_.js';
import { u as q } from './-PV6rnhC.js';
import { s as na } from './BRE7FZu4.js';
var oa = u('<button type="button" aria-label="Open Sidebar" class="preset-outlined-surface-500btn-icon"><iconify-icon></iconify-icon></button>', 2),
	ca = u('<iconify-icon></iconify-icon>', 2),
	sa = u('<span> </span>'),
	la = u(
		'<a aria-label="Go back" class="btn-icon rounded-full border border-surface-500 dark:border-surface-200 hover:bg-surface-500/10 shrink-0" data-cms-action="back" data-sveltekit-preload-data="hover"><iconify-icon></iconify-icon></a>',
		2
	),
	da = u(
		'<button aria-label="Go back" tabindex="0" class="btn-icon rounded-full border border-surface-500 dark:border-surface-200 hover:bg-surface-500/10 shrink-0" data-cms-action="back"><iconify-icon></iconify-icon></button>',
		2
	),
	fa = u(
		'<div class="my-1.5 flex w-full min-w-0 items-center justify-between gap-4"><div class="flex min-w-0 items-center"><!> <h1 class="transition-max-width h1 relative ml-2 flex items-center gap-1 font-bold" style="font-size: clamp(1.5rem, 3vw + 1rem, 2.25rem);" aria-live="polite" data-cms-field="pageTitle" data-cms-type="text"><!> <span></span> <span class="sr-only absolute inset-0 overflow-hidden whitespace-normal"> </span></h1></div> <div class="flex items-center gap-2"><!> <!></div></div>'
	);
function ga(A, i) {
	X(i, !0);
	const y = v(i, 'highlight', 3, ''),
		F = v(i, 'iconColor', 3, 'text-tertiary-500 dark:text-primary-500'),
		H = v(i, 'iconSize', 3, '32'),
		I = v(i, 'showBackButton', 3, !1),
		_ = v(i, 'backUrl', 3, ''),
		k = v(i, 'truncate', 3, !0),
		J = Y(() => () => {
			if (y() && i.name.toLowerCase().includes(y().toLowerCase())) {
				const a = new RegExp(`(${y()})`, 'gi');
				return i.name.split(a);
			}
			return [i.name];
		});
	function S(a) {
		const e = () => {
			_() || (a.preventDefault(), window.history.back());
		};
		i.onBackClick ? (a.preventDefault(), i.onBackClick(e)) : _() || (a.preventDefault(), window.history.back());
	}
	var g = fa(),
		p = o(g),
		D = o(p);
	{
		var K = (a) => {
			var e = oa();
			e.__click = () => q.toggle('leftSidebar', na.isDesktop ? 'full' : 'collapsed');
			var c = o(e);
			(t(c, 'icon', 'mingcute:menu-fill'), t(c, 'width', '24'), n(e), s(a, e));
		};
		h(D, (a) => {
			q.state.leftSidebar === 'hidden' && a(K);
		});
	}
	var z = b(D, 2),
		P = o(z);
	{
		var M = (a) => {
			var e = ca();
			(m(() => t(e, 'icon', i.icon)),
				m(() => t(e, 'width', H())),
				t(e, 'aria-hidden', 'true'),
				m(() => C(e, 1, `mr-1 shrink-0 ${F()} sm:mr-2`)),
				s(a, e));
		};
		h(P, (a) => {
			i.icon && a(M);
		});
	}
	var w = b(P, 2);
	let G;
	(ea(
		w,
		21,
		() => j(J)(),
		ia,
		(a, e, c) => {
			var d = sa();
			C(d, 1, ta(c % 2 === 1 ? 'font-semibold text-tertiary-500 dark:text-primary-500' : ''));
			var x = o(d, !0);
			(n(d), m(() => O(x, j(e))), s(a, d));
		}
	),
		n(w));
	var L = b(w, 2),
		N = o(L, !0);
	(n(L), n(z), n(p));
	var T = b(p, 2),
		U = o(T);
	{
		var Q = (a) => {
			var e = R(),
				c = E(e);
			(aa(c, () => i.children), s(a, e));
		};
		h(U, (a) => {
			i.children && a(Q);
		});
	}
	var V = b(U, 2);
	{
		var W = (a) => {
			var e = R(),
				c = E(e);
			{
				var d = (f) => {
						var r = la();
						r.__click = (B) => S(B);
						var l = o(r);
						(t(l, 'icon', 'ri:arrow-left-line'), t(l, 'width', '24'), t(l, 'aria-hidden', 'true'), n(r), m(() => ra(r, 'href', _())), s(f, r));
					},
					x = (f) => {
						var r = da();
						r.__click = (B) => S(B);
						var l = o(r);
						(t(l, 'icon', 'ri:arrow-left-line'), t(l, 'width', '24'), t(l, 'aria-hidden', 'true'), n(r), s(f, r));
					};
				h(c, (f) => {
					_() ? f(d) : f(x, !1);
				});
			}
			s(a, e);
		};
		h(V, (a) => {
			I() && a(W);
		});
	}
	(n(T),
		n(g),
		m(() => {
			((G = C(w, 1, '', null, G, { block: k(), 'overflow-hidden': k(), 'text-ellipsis': k(), 'whitespace-nowrap': k() })), O(N, i.name));
		}),
		s(A, g),
		Z());
}
$(['click']);
export { ga as P };
//# sourceMappingURL=C6jjkVLf.js.map
