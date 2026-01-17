import { i as V } from './zi73tRJP.js';
import { p as Z, a as $, f as ee, c as f, s as b, r as c, t as te, g as u, n as ae } from './DrlZFkx8.js';
import { c as se, a as w, f as R, s as M } from './CTjXDULS.js';
import { e as ne } from './BXe5mj2j.js';
import { c as H, a as S, b as N } from './MEFvoR_D.js';
import { p as x } from './DePHBZW_.js';
import { B as re } from './KG4G7ZS9.js';
import { c as ie, a as oe, n as ce, d as le, g as W, b as fe, e as ue, m as q, f as I, h as de } from './DvaK7ysa.js';
function me(i) {
	return ie(i, Date.now());
}
function ve(i, s, m) {
	const z = fe(),
		e = m?.locale ?? z.locale ?? ue,
		C = 2520,
		g = oe(i, s);
	if (isNaN(g)) throw new RangeError('Invalid time value');
	const t = Object.assign({}, m, { addSuffix: m?.addSuffix, comparison: g }),
		[p, _] = ce(m?.in, ...(g > 0 ? [s, i] : [i, s])),
		o = le(_, p),
		X = (W(_) - W(p)) / 1e3,
		a = Math.round((o - X) / 60);
	let n;
	if (a < 2)
		return m?.includeSeconds
			? o < 5
				? e.formatDistance('lessThanXSeconds', 5, t)
				: o < 10
					? e.formatDistance('lessThanXSeconds', 10, t)
					: o < 20
						? e.formatDistance('lessThanXSeconds', 20, t)
						: o < 40
							? e.formatDistance('halfAMinute', 0, t)
							: o < 60
								? e.formatDistance('lessThanXMinutes', 1, t)
								: e.formatDistance('xMinutes', 1, t)
			: a === 0
				? e.formatDistance('lessThanXMinutes', 1, t)
				: e.formatDistance('xMinutes', a, t);
	if (a < 45) return e.formatDistance('xMinutes', a, t);
	if (a < 90) return e.formatDistance('aboutXHours', 1, t);
	if (a < q) {
		const r = Math.round(a / 60);
		return e.formatDistance('aboutXHours', r, t);
	} else {
		if (a < C) return e.formatDistance('xDays', 1, t);
		if (a < I) {
			const r = Math.round(a / q);
			return e.formatDistance('xDays', r, t);
		} else if (a < I * 2) return ((n = Math.round(a / I)), e.formatDistance('aboutXMonths', n, t));
	}
	if (((n = de(_, p)), n < 12)) {
		const r = Math.round(a / I);
		return e.formatDistance('xMonths', r, t);
	} else {
		const r = n % 12,
			D = Math.trunc(n / 12);
		return r < 3 ? e.formatDistance('aboutXYears', D, t) : r < 9 ? e.formatDistance('overXYears', D, t) : e.formatDistance('almostXYears', D + 1, t);
	}
}
function xe(i, s) {
	return ve(i, me(i), s);
}
const ze = { name: 'Last 5 Content', icon: 'mdi:file-document-multiple-outline', defaultSize: { w: 1, h: 2 } };
var he = R(
		'<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem"><div class="flex min-w-0 items-center gap-2"><div></div> <div class="flex min-w-0 flex-col"><span class="text-text-900 dark:text-text-100 truncate font-medium"> </span> <span class="text-xs text-surface-500 dark:text-surface-50"> </span></div></div> <div class="flex flex-col items-end"><span class="text-xs font-medium uppercase text-surface-600 dark:text-surface-300"> </span> <span class="text-xs text-surface-500 dark:text-surface-50"> </span></div></div>'
	),
	ge = R('<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label="Last 5 content items"></div>'),
	pe = R(
		'<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite"><iconify-icon></iconify-icon> <span>No content found</span></div>',
		2
	);
function Ce(i, s) {
	Z(s, !0);
	const m = x(s, 'label', 3, 'Last 5 Content'),
		z = x(s, 'theme', 3, 'light'),
		e = x(s, 'icon', 3, 'mdi:file-document-multiple-outline'),
		C = x(s, 'widgetId', 3, void 0),
		g = x(s, 'size', 19, () => ({ w: 1, h: 1 })),
		t = x(s, 'onSizeChange', 3, (o) => {}),
		p = x(s, 'onRemove', 3, () => {});
	function _(o) {
		switch (o.toLowerCase()) {
			case 'published':
				return 'bg-green-500';
			case 'draft':
				return 'bg-yellow-500';
			case 'archived':
				return 'bg-gray-500';
			default:
				return 'bg-gray-400';
		}
	}
	(re(i, {
		get label() {
			return m();
		},
		get theme() {
			return z();
		},
		endpoint: '/api/dashboard/last5Content',
		pollInterval: 3e4,
		get icon() {
			return e();
		},
		get widgetId() {
			return C();
		},
		get size() {
			return g();
		},
		get onSizeChange() {
			return t();
		},
		get onCloseRequest() {
			return p();
		},
		children: (X, a) => {
			let n = () => a?.().data;
			var r = se(),
				D = ee(r);
			{
				var E = (h) => {
						var v = ge();
						(ne(
							v,
							21,
							() => n().slice(0, 5),
							(d) => d.id,
							(d, l) => {
								var k = he(),
									T = f(k),
									A = f(T),
									Y = b(A, 2),
									y = f(Y),
									U = f(y, !0);
								c(y);
								var O = b(y, 2),
									G = f(O, !0);
								(c(O), c(Y), c(T));
								var j = b(T, 2),
									B = f(j),
									J = f(B, !0);
								c(B);
								var L = b(B, 2),
									K = f(L, !0);
								(c(L),
									c(j),
									c(k),
									te(
										(P, Q) => {
											(H(A, 1, `h-2 w-2 rounded-full ${P ?? ''}`),
												S(A, 'title', `Status: ${u(l).status ?? ''}`),
												S(y, 'title', u(l).title),
												M(U, u(l).title),
												S(O, 'title', `Collection: ${u(l).collection}`),
												M(G, u(l).collection),
												M(J, Q),
												S(L, 'title', `By: ${u(l).createdBy}`),
												M(K, u(l).createdBy));
										},
										[() => _(u(l).status), () => xe(new Date(u(l).createdAt), { addSuffix: !0 })]
									),
									w(d, k));
							}
						),
							c(v),
							w(h, v));
					},
					F = (h) => {
						var v = pe(),
							d = f(v);
						(N(d, 'icon', 'mdi:file-remove-outline'),
							N(d, 'width', '32'),
							H(d, 1, 'mb-2 text-surface-400 dark:text-surface-500'),
							N(d, 'aria-hidden', 'true'),
							ae(2),
							c(v),
							w(h, v));
					};
				V(D, (h) => {
					n() && Array.isArray(n()) && n().length > 0 ? h(E) : h(F, !1);
				});
			}
			w(X, r);
		},
		$$slots: { default: !0 }
	}),
		$());
}
export { Ce as default, ze as widgetMeta };
//# sourceMappingURL=CuIUSTQY.js.map
