import { i as F } from './zi73tRJP.js';
import { p as G, a as H, f as J, c as l, r as a, s as b, t as w, g as f, n as K } from './DrlZFkx8.js';
import { c as O, a as n, f as x, s as u } from './CTjXDULS.js';
import { e as P, i as Q } from './BXe5mj2j.js';
import { s as U, b as v, c as V } from './MEFvoR_D.js';
import { p as s } from './DePHBZW_.js';
import { B as X } from './KG4G7ZS9.js';
const oe = { name: 'System Messages', icon: 'mdi:message-alert-outline', defaultSize: { w: 1, h: 2 } };
var Y = x(
		'<div class="rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem"><div class="flex items-start justify-between"><strong class="text-text-900 dark:text-text-100 text-sm" aria-label="Message title"> </strong> <small class="shrink-0 pl-2 text-surface-500 dark:text-surface-50" aria-label="Timestamp"> </small></div> <p class="mt-1 text-surface-700 dark:text-surface-300" aria-label="Message body"> </p></div>'
	),
	Z = x('<div class="grid gap-2" role="list" aria-label="System messages"></div>'),
	$ = x(
		'<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite"><iconify-icon></iconify-icon> <span>No system messages</span></div>',
		2
	);
function ne(S, e) {
	G(e, !0);
	const k = s(e, 'label', 3, 'System Messages'),
		z = s(e, 'theme', 3, 'light'),
		M = s(e, 'icon', 3, 'mdi:message-alert-outline'),
		C = s(e, 'widgetId', 3, void 0),
		h = s(e, 'size', 19, () => ({ w: 1, h: 2 })),
		I = s(e, 'onSizeChange', 3, (j) => {}),
		R = s(e, 'onRemove', 3, () => {});
	(X(S, {
		get label() {
			return k();
		},
		get theme() {
			return z();
		},
		endpoint: '/api/dashboard/systemMessages',
		pollInterval: 3e4,
		get icon() {
			return M();
		},
		get widgetId() {
			return C();
		},
		get size() {
			return h();
		},
		get onSizeChange() {
			return I();
		},
		get onCloseRequest() {
			return R();
		},
		children: (A, B) => {
			let o = () => B?.().data;
			var p = O(),
				D = J(p);
			{
				var W = (r) => {
						var t = Z();
						(P(
							t,
							21,
							() => o().slice(0, 5),
							Q,
							(i, d) => {
								var c = Y(),
									m = l(c),
									g = l(m),
									L = l(g, !0);
								a(g);
								var y = b(g, 2),
									N = l(y, !0);
								(a(y), a(m));
								var _ = b(m, 2),
									T = l(_, !0);
								(a(_),
									a(c),
									w(
										(E) => {
											(u(L, f(d).title), u(N, E), u(T, f(d).body));
										},
										[() => new Date(f(d).timestamp).toLocaleString()]
									),
									n(i, c));
							}
						),
							a(t),
							w(() => U(t, `max-height: calc(${h().h ?? ''} * 120px - 40px); overflow-y: auto;`)),
							n(r, t));
					},
					q = (r) => {
						var t = $(),
							i = l(t);
						(v(i, 'icon', 'mdi:alert-circle-outline'),
							v(i, 'width', '32'),
							V(i, 1, 'mb-2 text-surface-400 dark:text-surface-500'),
							v(i, 'aria-hidden', 'true'),
							K(2),
							a(t),
							n(r, t));
					};
				F(D, (r) => {
					o() && Array.isArray(o()) && o().length > 0 ? r(W) : r(q, !1);
				});
			}
			n(A, p);
		},
		$$slots: { default: !0 }
	}),
		H());
}
export { ne as default, oe as widgetMeta };
//# sourceMappingURL=D7ZqxZyq.js.map
