import { i as $ } from './zi73tRJP.js';
import { p as ee, a as te, f as ae, c as s, t as k, g as r, s as x, r as e, n as ie } from './DrlZFkx8.js';
import { c as se, a as g, f as B, s as h } from './CTjXDULS.js';
import { e as re } from './BXe5mj2j.js';
import { b as f, c as j, a as M } from './MEFvoR_D.js';
import { p as l } from './DePHBZW_.js';
import { f as F } from './B_fImZOG.js';
import { B as ne } from './KG4G7ZS9.js';
const he = { name: 'Last 5 Media', icon: 'mdi:image-multiple-outline', defaultSize: { w: 1, h: 2 } };
var oe = B(
		'<div class="flex items-center justify-between rounded-lg bg-surface-100/80 px-3 py-2 text-xs dark:bg-surface-700/60" role="listitem"><div class="flex min-w-0 items-center gap-2"><iconify-icon></iconify-icon> <div class="flex min-w-0 flex-col"><span class="text-text-900 dark:text-text-100 truncate font-medium"> </span> <span class="text-xs text-surface-500 dark:text-surface-50"> </span></div></div> <div class="flex flex-col items-end"><span class="text-xs font-medium uppercase text-surface-600 dark:text-surface-300"> </span> <span class="text-xs text-surface-500 dark:text-surface-50"> </span></div></div>',
		2
	),
	de = B('<div class="grid gap-2" style="max-height: 180px; overflow-y: auto;" role="list" aria-label="Last 5 media files"></div>'),
	le = B(
		'<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite"><iconify-icon></iconify-icon> <span>No media files found</span></div>',
		2
	);
function _e(D, n) {
	ee(n, !0);
	const R = l(n, 'label', 3, 'Last 5 Media'),
		A = l(n, 'theme', 3, 'light'),
		T = l(n, 'icon', 3, 'mdi:image-multiple-outline'),
		W = l(n, 'widgetId', 3, void 0),
		q = l(n, 'size', 19, () => ({ w: 1, h: 1 })),
		G = l(n, 'onSizeChange', 3, (t) => {}),
		K = l(n, 'onRemove', 3, () => {});
	function S(t) {
		if (t === 0) return '0 B';
		const c = 1024,
			u = ['B', 'KB', 'MB', 'GB'],
			o = Math.floor(Math.log(t) / Math.log(c));
		return `${parseFloat((t / Math.pow(c, o)).toFixed(1))} ${u[o]}`;
	}
	function N(t) {
		if (!t) return 'mdi:file';
		const c = ['jpg', 'jpeg', 'png', 'gif', 'webp'],
			u = ['mp4', 'mov', 'avi'];
		return c.includes(t.toLowerCase()) ? 'mdi:image' : u.includes(t.toLowerCase()) ? 'mdi:video' : 'mdi:file';
	}
	(ne(D, {
		get label() {
			return R();
		},
		get theme() {
			return A();
		},
		endpoint: '/api/dashboard/last5media',
		pollInterval: 3e4,
		get icon() {
			return T();
		},
		get widgetId() {
			return W();
		},
		get size() {
			return q();
		},
		get onSizeChange() {
			return G();
		},
		get onCloseRequest() {
			return K();
		},
		children: (c, u) => {
			let o = () => u?.().data;
			var C = se(),
				E = ae(C);
			{
				var H = (m) => {
						var d = de();
						(re(
							d,
							21,
							() => o().slice(0, 5),
							(a) => a.id || a.name,
							(a, i) => {
								var _ = oe(),
									y = s(_),
									v = s(y);
								(k(() => f(v, 'icon', N(r(i).type))),
									j(v, 1, 'shrink-0 text-primary-400'),
									f(v, 'width', '18'),
									k(() => f(v, 'aria-label', r(i).type + ' file icon')));
								var L = x(v, 2),
									p = s(L),
									O = s(p, !0);
								e(p);
								var w = x(p, 2),
									P = s(w, !0);
								(e(w), e(L), e(y));
								var I = x(y, 2),
									b = s(I),
									Q = s(b, !0);
								e(b);
								var z = x(b, 2),
									U = s(z, !0);
								(e(z),
									e(I),
									e(_),
									k(
										(V, X, Y, Z) => {
											(M(p, 'title', r(i).name), h(O, r(i).name), M(w, 'title', V), h(P, X), h(Q, r(i).type), M(z, 'title', Y), h(U, Z));
										},
										[() => `Size: ${S(r(i).size)}`, () => S(r(i).size), () => `Modified: ${F(r(i).modified)}`, () => F(r(i).modified)]
									),
									g(a, _));
							}
						),
							e(d),
							g(m, d));
					},
					J = (m) => {
						var d = le(),
							a = s(d);
						(f(a, 'icon', 'mdi:file-remove-outline'),
							f(a, 'width', '32'),
							j(a, 1, 'mb-2 text-surface-400 dark:text-surface-500'),
							f(a, 'aria-hidden', 'true'),
							ie(2),
							e(d),
							g(m, d));
					};
				$(E, (m) => {
					o() && Array.isArray(o()) && o().length > 0 ? m(H) : m(J, !1);
				});
			}
			g(c, C);
		},
		$$slots: { default: !0 }
	}),
		te());
}
export { _e as default, he as widgetMeta };
//# sourceMappingURL=iJudhYDU.js.map
