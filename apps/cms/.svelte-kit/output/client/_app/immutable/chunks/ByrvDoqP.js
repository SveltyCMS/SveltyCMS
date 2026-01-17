import { i as y } from './zi73tRJP.js';
import { p as st, c as n, r, s as c, A as lt, g as j, d as ot, t as m, a as ct, f as dt, ag as vt, b as D, h as E } from './DrlZFkx8.js';
import { f as x, s as g, a as f, c as ft, d as mt } from './CTjXDULS.js';
import { s as _t } from './DhHAlOU0.js';
import { a as G } from './BEiD40NV.js';
import { b as _, c as z, a as u, r as ut, d as H } from './MEFvoR_D.js';
import { b as J } from './D4QnGYgQ.js';
import { b as K } from './YQp2a1pQ.js';
import { p as d } from './DePHBZW_.js';
import { t as O } from './CE8QOwyb.js';
var xt = x('<span> </span>'),
	bt = x('<span> </span>'),
	ht = x(
		'<div class="flex items-center gap-1 text-xs"><iconify-icon></iconify-icon> <span class="font-medium text-tertiary-500 dark:text-primary-500"> </span> <span class="font-medium text-surface-400"> </span></div>',
		2
	),
	gt = x('<textarea class="textarea pr-12 resize-y"></textarea>'),
	pt = x('<input type="text" class="input pr-12"/>'),
	yt = x(
		'<div class="space-y-2"><div class="flex items-center justify-between mb-1"><div class="flex items-center gap-2"><span class="font-bold text-sm"> </span> <!> <span class="text-surface-400 cursor-help"><iconify-icon></iconify-icon></span></div> <div class="flex items-center gap-3 text-xs"><button type="button" title="Insert Token"><iconify-icon></iconify-icon></button> <!> <!></div></div> <div class="relative"><!></div></div>',
		2
	);
function zt(Q, t) {
	st(t, !0);
	let v = d(t, 'value', 15),
		k = d(t, 'placeholder', 3, ''),
		A = d(t, 'type', 3, 'input'),
		V = d(t, 'rows', 3, 3),
		W = d(t, 'optimalMin', 3, 0),
		X = d(t, 'optimalMax', 3, 999),
		Y = d(t, 'translated', 3, !1),
		Z = d(t, 'translationPct', 3, 0),
		b = ot(void 0);
	const F = () =>
		t.maxLength && v().length > t.maxLength ? 'text-error-500' : v().length >= W() && v().length <= X() ? 'text-success-500' : 'text-surface-400';
	var w = yt(),
		L = n(w),
		M = n(L),
		T = n(M),
		$ = n(T, !0);
	r(T);
	var I = c(T, 2);
	_t(I, () => t.icon ?? lt);
	var U = c(I, 2),
		R = n(U);
	(_(R, 'icon', 'mdi:information-outline'), _(R, 'width', '16'), r(U), r(M));
	var S = c(M, 2),
		p = n(S);
	p.__click = () => {
		j(b)?.focus();
	};
	var C = n(p);
	(_(C, 'icon', 'mdi:code-braces'), _(C, 'width', '16'), z(C, 1, 'font-bold text-tertiary-500 dark:text-primary-500'), r(p));
	var q = c(p, 2);
	{
		var tt = (i) => {
			var a = ft(),
				e = dt(a);
			{
				var l = (o) => {
						var s = xt(),
							h = n(s);
						(r(s),
							m(
								(P) => {
									(z(s, 1, P), g(h, `(${v().length ?? ''}/${t.maxLength ?? ''})`));
								},
								[() => H(F())]
							),
							f(o, s));
					},
					N = (o) => {
						var s = bt(),
							h = n(s);
						(r(s),
							m(
								(P) => {
									(z(s, 1, P), g(h, `(${v().length ?? ''}/${t.maxLength ?? ''})`));
								},
								[() => H(F())]
							),
							f(o, s));
					};
				y(e, (o) => {
					A() === 'input' ? o(l) : o(N, !1);
				});
			}
			f(i, a);
		};
		y(q, (i) => {
			t.maxLength && i(tt);
		});
	}
	var at = c(q, 2);
	{
		var et = (i) => {
			var a = ht(),
				e = n(a);
			(_(e, 'icon', 'bi:translate'), _(e, 'width', '16'));
			var l = c(e, 2),
				N = n(l, !0);
			r(l);
			var o = c(l, 2),
				s = n(o);
			(r(o),
				r(a),
				m(
					(h) => {
						(g(N, h), g(s, `(${Z() ?? ''}%)`));
					},
					[() => t.lang.toUpperCase()]
				),
				f(i, a));
		};
		y(at, (i) => {
			Y() && i(et);
		});
	}
	(r(S), r(L));
	var B = c(L, 2),
		it = n(B);
	{
		var nt = (i) => {
				var a = gt();
				(vt(a),
					(a.__input = (e) => t.onUpdate(e.currentTarget.value)),
					K(
						a,
						(e) => D(b, e),
						() => j(b)
					),
					E(() => J(a, v)),
					G(
						a,
						(e, l) => O?.(e, l),
						() => ({ name: t.field.db_fieldName, label: t.field.label, collection: t.field.collection })
					),
					m(() => {
						(u(a, 'id', t.id), u(a, 'rows', V()), u(a, 'placeholder', k()));
					}),
					f(i, a));
			},
			rt = (i) => {
				var a = pt();
				(ut(a),
					(a.__input = (e) => t.onUpdate(e.currentTarget.value)),
					K(
						a,
						(e) => D(b, e),
						() => j(b)
					),
					E(() => J(a, v)),
					G(
						a,
						(e, l) => O?.(e, l),
						() => ({ name: t.field.db_fieldName, label: t.field.label, collection: t.field.collection })
					),
					m(() => {
						(u(a, 'id', t.id), u(a, 'placeholder', k()));
					}),
					f(i, a));
			};
		y(it, (i) => {
			A() === 'textarea' ? i(nt) : i(rt, !1);
		});
	}
	(r(B),
		r(w),
		m(() => {
			(g($, t.label), u(U, 'title', k()));
		}),
		f(Q, w),
		ct());
}
mt(['click', 'input']);
export { zt as default };
//# sourceMappingURL=ByrvDoqP.js.map
