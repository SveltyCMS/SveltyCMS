import { i as O } from './zi73tRJP.js';
import { p as R, c as l, g as a, u as i, r as m, t as u, a as U, f as E, s as F } from './DrlZFkx8.js';
import { f as w, a as f, s as d, t as L } from './CTjXDULS.js';
import { a as x } from './MEFvoR_D.js';
import { p as h } from './DePHBZW_.js';
import { l as Y } from './BvngfGKt.js';
var j = w('<span class="mr-1 text-primary-600 dark:text-primary-400"> </span> <span class="text-xs text-gray-500 dark:text-gray-400"> </span>', 1),
	q = w('<time class="inline-flex items-center font-medium text-gray-900 dark:text-gray-100"><!></time>');
function J(D, r) {
	R(r, !0);
	const T = h(r, 'format', 3, 'medium'),
		_ = h(r, 'showRelative', 3, !0),
		S = i(() => (typeof document < 'u' && document.documentElement.lang) || 'en-US'),
		N = i(() => ({ short: { dateStyle: 'short' }, medium: { dateStyle: 'medium' }, long: { dateStyle: 'long' }, full: { dateStyle: 'full' } })[T()]),
		c = i(() => {
			if (!r.value || !_()) return null;
			try {
				const t = new Date(r.value);
				if (isNaN(t.getTime())) return null;
				const o = new Date().getTime() - t.getTime(),
					e = Math.floor(o / (1e3 * 60 * 60 * 24));
				return e === 0
					? 'Today'
					: e === 1
						? 'Yesterday'
						: e === -1
							? 'Tomorrow'
							: e > 1 && e <= 7
								? `${e} days ago`
								: e < -1 && e >= -7
									? `In ${Math.abs(e)} days`
									: null;
			} catch {
				return null;
			}
		}),
		v = i(() => {
			if (!r.value) return '–';
			try {
				const t = new Date(r.value);
				return isNaN(t.getTime()) ? 'Invalid Date' : new Intl.DateTimeFormat(a(S), a(N)).format(t);
			} catch (t) {
				return (Y.warn('Date formatting error:', t), 'Invalid Date');
			}
		}),
		g = i(() => {
			if (r.value)
				try {
					const t = new Date(r.value);
					return isNaN(t.getTime()) ? void 0 : t.toISOString();
				} catch {
					return;
				}
		}),
		y = i(() => a(c) || a(v));
	var s = q(),
		I = l(s);
	{
		var b = (t) => {
				var n = j(),
					o = E(n),
					e = l(o, !0);
				m(o);
				var p = F(o, 2),
					M = l(p);
				(m(p),
					u(() => {
						(d(e, a(y)), d(M, `(${a(v) ?? ''})`));
					}),
					f(t, n));
			},
			k = (t) => {
				var n = L();
				(u(() => d(n, a(y))), f(t, n));
			};
		O(I, (t) => {
			a(c) ? t(b) : t(k, !1);
		});
	}
	(m(s),
		u(() => {
			(x(s, 'title', a(g)), x(s, 'datetime', a(g)));
		}),
		f(D, s),
		U());
}
export { J as default };
//# sourceMappingURL=r2b6zF7G.js.map
