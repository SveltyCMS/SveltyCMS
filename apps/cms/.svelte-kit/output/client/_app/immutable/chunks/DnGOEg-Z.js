import { i as O } from './zi73tRJP.js';
import { p as me, a as pe, f as he, c as r, t as S, s as l, r as t, g as N, u as ge, n as xe, e as _e } from './DrlZFkx8.js';
import { c as ye, a as x, f as z, s as m, d as we } from './CTjXDULS.js';
import { e as be, i as Se } from './BXe5mj2j.js';
import { b as p, c as I, a as Z, s as Ie } from './MEFvoR_D.js';
import { p as d } from './DePHBZW_.js';
import { B as ze } from './KG4G7ZS9.js';
import { s as T } from './BSPmpUse.js';
const He = { name: 'System Health', icon: 'mdi:heart-pulse', description: 'Monitor system services and overall health', defaultSize: { w: 2, h: 2 } };
var De = z('<p class="truncate text-xs text-error-500"> </p>'),
	Ee = z(
		'<div class="card preset-outlined-surface-500flex flex-col gap-1 p-2"><div class="flex items-center justify-between"><span class="text-xs font-semibold"> </span> <span> </span></div> <p class="truncate text-xs opacity-70"> </p> <!></div>'
	),
	Ae = z(
		'<div class="flex h-full flex-col gap-3"><div class="flex items-center justify-between"><div class="flex items-center gap-2"><iconify-icon></iconify-icon> <div><span> </span> <p class="text-xs opacity-70"> </p></div></div> <button class="preset-outlined-warning-500 btn-sm" title="Reinitialize system"><iconify-icon></iconify-icon></button></div> <div class="grid flex-1 grid-cols-2 gap-2 overflow-y-auto"></div></div>',
		2
	),
	Re = z(
		'<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400"><iconify-icon></iconify-icon> <span>Health data unavailable</span></div>',
		2
	);
function Ue(W, s) {
	me(s, !0);
	const Y = d(s, 'label', 3, 'System Health'),
		$ = d(s, 'theme', 3, 'light'),
		q = d(s, 'icon', 3, 'mdi:heart-pulse'),
		J = d(s, 'widgetId', 3, void 0),
		G = d(s, 'size', 19, () => ({ w: 2, h: 2 })),
		P = d(s, 'onSizeChange', 3, (e) => {}),
		K = d(s, 'onRemove', 3, () => {});
	async function Q() {
		try {
			T('Reinitializing system...', 'warning');
			const e = await fetch('/api/system', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'reinitialize', force: !0 })
			});
			if (e.ok) {
				const i = await e.json();
				T(i.message || `System reinitialized: ${i.status}`, 'success');
			} else {
				const i = await e.json();
				throw new Error(i.error || 'Reinitialization failed');
			}
		} catch (e) {
			T(`Failed to reinitialize: ${e instanceof Error ? e.message : 'Unknown error'}`, 'error');
		}
	}
	function H(e) {
		switch (e) {
			case 'READY':
				return 'text-success-500';
			case 'DEGRADED':
				return 'text-warning-500';
			case 'INITIALIZING':
				return 'text-primary-500';
			case 'FAILED':
				return 'text-error-500';
			case 'IDLE':
				return 'text-surface-500';
			default:
				return 'text-surface-500';
		}
	}
	function V(e) {
		switch (e) {
			case 'READY':
				return 'mdi:check-circle';
			case 'DEGRADED':
				return 'mdi:alert';
			case 'INITIALIZING':
				return 'mdi:loading';
			case 'FAILED':
				return 'mdi:close-circle';
			case 'IDLE':
				return 'mdi:pause-circle';
			default:
				return 'mdi:help-circle';
		}
	}
	function X(e) {
		switch (e) {
			case 'healthy':
				return 'preset-filled-primary-500';
			case 'unhealthy':
				return 'preset-filled-error-500';
			case 'initializing':
				return 'variant-filled-warning';
			default:
				return 'preset-filled-surface-500';
		}
	}
	function ee(e) {
		const i = Math.floor(e / 1e3),
			u = Math.floor(i / 60),
			a = Math.floor(u / 60),
			h = Math.floor(a / 24);
		return h > 0 ? `${h}d ${a % 24}h` : a > 0 ? `${a}h ${u % 60}m` : u > 0 ? `${u}m` : `${i}s`;
	}
	function te(e) {
		return e.charAt(0).toUpperCase() + e.slice(1).replace(/([A-Z])/g, ' $1');
	}
	(ze(W, {
		get label() {
			return Y();
		},
		get theme() {
			return $();
		},
		endpoint: '/api/dashboard/health',
		pollInterval: 5e3,
		get icon() {
			return q();
		},
		get widgetId() {
			return J();
		},
		get size() {
			return G();
		},
		get onSizeChange() {
			return P();
		},
		get onCloseRequest() {
			return K();
		},
		children: (i, u) => {
			let a = () => u?.().data;
			var h = ye(),
				re = he(h);
			{
				var ae = (f) => {
						var n = Ae(),
							o = r(n),
							D = r(o),
							_ = r(D);
						(S(() => p(_, 'icon', V(a().overallStatus))), p(_, 'width', '24'));
						var U = l(_, 2),
							y = r(U),
							se = r(y, !0);
						t(y);
						var B = l(y, 2),
							ne = r(B);
						(t(B), t(U), t(D));
						var E = l(D, 2);
						E.__click = Q;
						var F = r(E);
						(p(F, 'icon', 'mdi:refresh'), p(F, 'width', '16'), t(E), t(o));
						var A = l(o, 2);
						(be(
							A,
							21,
							() => Object.entries(a().components),
							Se,
							(R, C) => {
								var w = ge(() => _e(N(C), 2));
								let oe = () => N(w)[0],
									c = () => N(w)[1];
								var j = Ee(),
									k = r(j),
									L = r(k),
									ce = r(L, !0);
								t(L);
								var M = l(L, 2),
									le = r(M, !0);
								(t(M), t(k));
								var b = l(k, 2),
									de = r(b, !0);
								t(b);
								var ue = l(b, 2);
								{
									var fe = (g) => {
										var v = De(),
											ve = r(v, !0);
										(t(v),
											S(() => {
												(Z(v, 'title', c().error), m(ve, c().error));
											}),
											x(g, v));
									};
									O(ue, (g) => {
										c().error && g(fe);
									});
								}
								(t(j),
									S(
										(g, v) => {
											(m(ce, g), I(M, 1, v), m(le, c().status), Z(b, 'title', c().message), m(de, c().message));
										},
										[() => te(oe()), () => `badge ${X(c().status)}`]
									),
									x(R, j));
							}
						),
							t(A),
							t(n),
							S(
								(R, C, w) => {
									(I(_, 1, R),
										I(y, 1, C),
										m(se, a().overallStatus),
										m(ne, `Uptime: ${w ?? ''}`),
										Ie(A, `max-height: calc(${G().h ?? ''} * 120px - 80px);`));
								},
								[() => `text-2xl ${H(a().overallStatus)}`, () => `font-bold ${H(a().overallStatus)}`, () => ee(a().uptime)]
							),
							x(f, n));
					},
					ie = (f) => {
						var n = Re(),
							o = r(n);
						(p(o, 'icon', 'mdi:alert-circle-outline'), p(o, 'width', '32'), I(o, 1, 'mb-2 text-surface-400'), xe(2), t(n), x(f, n));
					};
				O(re, (f) => {
					a() ? f(ae) : f(ie, !1);
				});
			}
			x(i, h);
		},
		$$slots: { default: !0 }
	}),
		pe());
}
we(['click']);
export { Ue as default, He as widgetMeta };
//# sourceMappingURL=DnGOEg-Z.js.map
