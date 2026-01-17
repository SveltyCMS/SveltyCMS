import { i as w } from './zi73tRJP.js';
import { p as O, c as m, r as d, s as b, g as r, u, t as v, a as P } from './DrlZFkx8.js';
import { f as D, s as x, a as y } from './CTjXDULS.js';
import { a as h, c as U, d as E } from './MEFvoR_D.js';
import { p as L } from './DePHBZW_.js';
import { l as j } from './BvngfGKt.js';
var q = D('<span class="ml-2 text-sm font-normal text-gray-500 dark:text-gray-400"> </span>'),
	z = D('<span> </span>'),
	A = D('<span class="inline-flex items-center font-medium text-gray-900 dark:text-gray-100"><span> </span> <!> <!></span>');
function V(k, a) {
	O(a, !0);
	let S = L(a, 'format', 3, 'medium');
	const T = u(() => (typeof document < 'u' && document.documentElement.lang) || 'en-US'),
		F = u(() => {
			if (!a.value?.start || !a.value?.end) return '–';
			try {
				const t = new Date(a.value.start),
					e = new Date(a.value.end);
				if (isNaN(t.getTime()) || isNaN(e.getTime())) return 'Invalid Range';
				const n = new Intl.DateTimeFormat(r(T), { year: 'numeric', month: S() === 'short' ? 'short' : 'long', day: 'numeric' }),
					s = n.format(t),
					c = n.format(e);
				return t.toDateString() === e.toDateString() ? s : `${s} → ${c}`;
			} catch (t) {
				return (j.warn('Date range formatting error:', t), 'Invalid Range');
			}
		}),
		f = u(() => {
			if (!a.value?.start || !a.value?.end) return null;
			try {
				const t = new Date(a.value.start),
					n = new Date(a.value.end).getTime() - t.getTime(),
					s = Math.ceil(n / (1e3 * 60 * 60 * 24));
				if (s === 1) return '1 day';
				if (s < 7) return `${s} days`;
				if (s < 30) {
					const o = Math.ceil(s / 7);
					return `${o} week${o > 1 ? 's' : ''}`;
				}
				if (s < 365) {
					const o = Math.ceil(s / 30);
					return `${o} month${o > 1 ? 's' : ''}`;
				}
				const c = Math.ceil(s / 365);
				return `${c} year${c > 1 ? 's' : ''}`;
			} catch {
				return null;
			}
		}),
		i = u(() => {
			if (!a.value?.start || !a.value?.end) return null;
			try {
				const t = new Date(),
					e = new Date(a.value.start),
					n = new Date(a.value.end);
				return e <= t && n >= t ? 'Current' : n < t ? 'Past' : e > t ? 'Future' : null;
			} catch {
				return null;
			}
		}),
		I = u(() => {
			const t = 'ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
				e = {
					Current: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
					Past: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
					Future: 'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200'
				};
			return `${t} ${r(i) ? e[r(i)] : ''}`;
		}),
		p = u(() => {
			if (!(!a.value?.start || !a.value?.end))
				try {
					const t = new Date(a.value.start).toISOString(),
						e = new Date(a.value.end).toISOString();
					return `${t} to ${e}`;
				} catch {
					return;
				}
		});
	var l = A(),
		g = m(l),
		C = m(g, !0);
	d(g);
	var _ = b(g, 2);
	{
		var M = (t) => {
			var e = q(),
				n = m(e);
			(d(e),
				v(() => {
					(h(e, 'aria-label', `Duration: ${r(f) ?? ''}`), x(n, `(${r(f) ?? ''})`));
				}),
				y(t, e));
		};
		w(_, (t) => {
			r(f) && t(M);
		});
	}
	var N = b(_, 2);
	{
		var R = (t) => {
			var e = z(),
				n = m(e, !0);
			(d(e),
				v(() => {
					(U(e, 1, E(r(I))), h(e, 'aria-label', `Time context: ${r(i) ?? ''}`), x(n, r(i)));
				}),
				y(t, e));
		};
		w(N, (t) => {
			r(i) && t(R);
		});
	}
	(d(l),
		v(() => {
			(h(l, 'title', r(p)), x(C, r(F)));
		}),
		y(k, l),
		P());
}
export { V as default };
//# sourceMappingURL=Ciw7wQON.js.map
