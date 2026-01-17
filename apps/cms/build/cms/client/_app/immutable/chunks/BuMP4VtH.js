import { i as B } from './zi73tRJP.js';
import { o as me } from './CMZtchEj.js';
import {
	p as _e,
	z as be,
	b as c,
	d as E,
	g as t,
	c as A,
	s as H,
	r as y,
	t as x,
	u as ke,
	a as ye,
	a9 as xe,
	f as we,
	ai as ge
} from './DrlZFkx8.js';
import { f as h, s as W, a as m, c as he, d as De } from './CTjXDULS.js';
import { e as Ie, i as Ee } from './BXe5mj2j.js';
import { a as Ae } from './BEiD40NV.js';
import { d as X, c as C, a as v, b as w } from './MEFvoR_D.js';
import { b as Y } from './YQp2a1pQ.js';
import { p as g } from './DePHBZW_.js';
import { t as Ce } from './COJ8Fh6m.js';
var Me = h('<iconify-icon></iconify-icon>', 2),
	Re = h('<iconify-icon></iconify-icon>', 2),
	ze = h('<iconify-icon></iconify-icon>', 2),
	Be = h('<button role="menuitem"><!> <span class="whitespace-nowrap text-sm"> </span></button>'),
	Le = h(
		'<div class="absolute z-20 mt-1 w-fit min-w-full overflow-auto rounded-md border border-surface-400/30 bg-surface-50/95 shadow-lg backdrop-blur-sm focus:outline-none dark:border-surface-300/20 dark:bg-surface-800/90" role="menu" tabindex="-1"></div>'
	),
	Pe = h(
		'<div><button class="preset-filled-tertiary-500 btn flex w-fit items-center gap-1 rounded dark:preset-outlined-primary-500" aria-haspopup="true"><!> <span> </span></button> <!></div>'
	);
function Je(Z, p) {
	_e(p, !0);
	let D = g(p, 'items', 19, () => []),
		N = g(p, 'label', 3, ''),
		$ = g(p, 'icon', 3, void 0),
		ee = g(p, 'class', 3, ''),
		te = g(p, 'show', 3, !0),
		_ = g(p, 'active', 15, ''),
		u = E(!1),
		M = E(void 0),
		L = E(void 0);
	const b = `dropdown-${Math.random().toString(36).substring(2, 9)}`,
		O = ke(() => `${b}-menu`);
	let i = E(-1);
	const d = [];
	let ae = E(0);
	function re(e, a) {
		return (
			(d[a] = e),
			{
				destroy() {
					d[a] === e && (d[a] = null);
				}
			}
		);
	}
	function k() {
		return D().find((e) => e.active && e.active());
	}
	function R(e = null) {
		if (t(u)) return;
		(_() !== b && _() !== '' && _(''), c(u, !0), _(b));
		const a = k();
		let r = e ?? (a ? D().findIndex((n) => n === a) : 0);
		(r < 0 && (r = 0), c(i, r, !0), xe().then(() => d[t(i)]?.focus()));
	}
	function z(e = !0) {
		t(u) && (c(u, !1), _(''), c(i, -1), e && t(L)?.focus());
	}
	function ne(e) {
		(e.stopPropagation(), t(u) ? z(!0) : R());
	}
	function S(e, a) {
		(a.stopPropagation(), e.onClick && e.onClick(), ge(ae), z(!0));
	}
	(be(() => {
		_() !== b && c(u, !1);
	}),
		me(() => {
			const e = (a) => {
				t(M) && !t(M).contains(a.target) && t(u) && z(!1);
			};
			return (
				document.addEventListener('click', e),
				() => {
					document.removeEventListener('click', e);
				}
			);
		}));
	function oe() {
		const e = k();
		return (e && (e.name || e.title)) || N();
	}
	function T() {
		return k()?.icon || $();
	}
	var I = Pe();
	let q;
	var f = A(I);
	((f.__click = ne),
		(f.__keydown = (e) => {
			e.key === 'ArrowDown'
				? (R(0), e.preventDefault())
				: e.key === 'ArrowUp'
					? (R(D().length - 1), e.preventDefault())
					: (e.key === 'Enter' || e.key === ' ') && (R(), e.preventDefault());
		}));
	var F = A(f);
	{
		var ie = (e) => {
			var a = Me();
			(x(() => w(a, 'icon', T())),
				w(a, 'width', '18'),
				x((r) => C(a, 1, r), [() => X(k() ? 'text-tertiary-50 dark:text-tertiary-300' : 'text-surface-800 dark:text-surface-200')]),
				m(e, a));
		};
		B(F, (e) => {
			T() && e(ie);
		});
	}
	var P = H(F, 2);
	let G;
	var se = A(P, !0);
	(y(P),
		y(f),
		Y(
			f,
			(e) => c(L, e),
			() => t(L)
		));
	var ce = H(f, 2);
	{
		var fe = (e) => {
			var a = Le();
			((a.__keydown = (r) => {
				if (r.key === 'Escape') {
					z(!0);
					return;
				}
				const n = D().length - 1;
				r.key === 'ArrowDown'
					? (c(i, t(i) < n ? t(i) + 1 : 0, !0), d[t(i)]?.focus(), r.preventDefault())
					: r.key === 'ArrowUp'
						? (c(i, t(i) > 0 ? t(i) - 1 : n, !0), d[t(i)]?.focus(), r.preventDefault())
						: r.key === 'Home'
							? (c(i, 0), d[t(i)]?.focus(), r.preventDefault())
							: r.key === 'End' && (c(i, n), d[t(i)]?.focus(), r.preventDefault());
			}),
				Ie(a, 21, D, Ee, (r, n, J) => {
					var l = Be();
					((l.__click = (o) => S(t(n), o)),
						(l.__keydown = (o) => {
							(o.key === 'Enter' || o.key === ' ') && (S(t(n), o), o.preventDefault());
						}));
					let K;
					var Q = A(l);
					{
						var ue = (o) => {
								var s = Re();
								(w(s, 'icon', 'mdi:check'), w(s, 'width', '16'), C(s, 1, 'text-tertiary-600 dark:text-tertiary-400'), m(o, s));
							},
							le = (o) => {
								var s = he(),
									ve = we(s);
								{
									var pe = (U) => {
										var j = ze();
										(x(() => w(j, 'icon', t(n).icon)), w(j, 'width', '18'), m(U, j));
									};
									B(
										ve,
										(U) => {
											t(n).icon && U(pe);
										},
										!0
									);
								}
								m(o, s);
							};
						B(Q, (o) => {
							t(n).active && t(n).active() ? o(ue) : o(le, !1);
						});
					}
					var V = H(Q, 2),
						de = A(V, !0);
					(y(V),
						y(l),
						Ae(
							l,
							(o, s) => re?.(o, s),
							() => J
						),
						x(
							(o, s) => {
								((K = C(
									l,
									1,
									'flex w-full items-center gap-2 px-3 py-2 text-left text-surface-700 hover:bg-surface-200/70 focus:bg-tertiary-500/20 focus:outline-none dark:text-white dark:hover:bg-surface-600/60 dark:focus:bg-tertiary-400/25 svelte-1dk88fj',
									null,
									K,
									o
								)),
									v(l, 'tabindex', J === t(i) ? 0 : -1),
									v(l, 'aria-current', s),
									W(de, t(n).name || t(n).title || ''));
							},
							[() => ({ active: t(n).active && t(n).active() }), () => (t(n).active && t(n).active() ? 'true' : void 0)]
						),
						m(r, l));
				}),
				y(a),
				x(() => {
					(v(a, 'id', t(O)), v(a, 'aria-labelledby', `${b}-button`));
				}),
				m(e, a));
		};
		B(ce, (e) => {
			t(u) && e(fe);
		});
	}
	(y(I),
		Y(
			I,
			(e) => c(M, e),
			() => t(M)
		),
		x(
			(e, a, r) => {
				((q = C(I, 1, e, null, q, { hidden: !te() })),
					v(f, 'aria-expanded', t(u)),
					v(f, 'aria-controls', t(O)),
					v(f, 'id', `${b}-button`),
					v(f, 'aria-label', N() || void 0),
					(G = C(P, 1, 'hidden text-sm sm:inline', null, G, a)),
					W(se, r));
			},
			[() => X(Ce('relative', ee())), () => ({ 'text-tertiary-50': !!k(), 'text-surface-800': !k() }), oe]
		),
		m(Z, I),
		ye());
}
De(['click', 'keydown']);
export { Je as default };
//# sourceMappingURL=BuMP4VtH.js.map
