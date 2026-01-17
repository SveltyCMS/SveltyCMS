import { i as J } from './zi73tRJP.js';
import { p as we, a as ke, f as je, g as s, u as _, c as e, n as Me, r as t, s as r, t as K } from './DrlZFkx8.js';
import { c as Se, a as g, f as S, s as c } from './CTjXDULS.js';
import { b as N, c as Q } from './MEFvoR_D.js';
import { p as d } from './DePHBZW_.js';
import { B as ze } from './KG4G7ZS9.js';
const Ue = { name: 'Performance Monitor', icon: 'mdi:chart-line', description: 'Track system performance metrics', defaultSize: { w: 1, h: 2 } };
var qe = S(
		'<div class="flex h-full items-center justify-center text-surface-500"><div class="text-center"><iconify-icon></iconify-icon> <p>Loading metrics...</p></div></div>',
		2
	),
	Re = S(
		'<div class="space-y-2"><h3 class="text-center text-xs font-semibold">System:</h3> <div class="grid grid-cols-2 gap-2 text-xs"><div class="flex justify-between"><span class="text-surface-600 dark:text-surface-50">Memory:</span> <span class="font-mono"> </span></div> <div class="flex justify-between"><span class="text-surface-600 dark:text-surface-50">Uptime:</span> <span class="font-mono"> </span></div></div></div>'
	),
	Ce = S(
		'<div class="flex h-full flex-col space-y-3 text-sm"><h3 class="text-center text-xs font-semibold">Performance Overview:</h3> <div class="grid grid-cols-2 gap-3"><div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700"><div class="flex items-center justify-between"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Error Rate</span> <span> </span></div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700"><div class="flex items-center justify-between"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Cache Hit</span> <span class="text-lg font-bold text-primary-500"> </span></div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700"><div class="flex items-center justify-between"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Auth Success</span> <span class="text-lg font-bold text-success-500"> </span></div></div> <div class="rounded-lg bg-surface-100 p-3 dark:bg-surface-700"><div class="flex items-center justify-between"><span class="text-xs font-medium text-surface-600 dark:text-surface-300">Sessions</span> <span class="text-lg font-bold text-tertiary-500"> </span></div></div></div> <!> <div class="space-y-2"><h3 class="text-center text-xs font-semibold">Requests:</h3> <div class="grid grid-cols-2 gap-2 text-xs"><div class="flex justify-between"><span class="text-surface-600 dark:text-surface-50">Total:</span> <span class="font-mono"> </span></div> <div class="flex justify-between"><span class="text-surface-600 dark:text-surface-50">Errors:</span> <span class="font-mono text-error-500"> </span></div></div></div></div>'
	);
function We(V, n) {
	we(n, !0);
	const X = d(n, 'label', 3, 'Performance Monitor'),
		Y = d(n, 'theme', 3, 'light'),
		Z = d(n, 'icon', 3, 'mdi:chart-line'),
		$ = d(n, 'widgetId', 3, void 0),
		ee = d(n, 'size', 19, () => ({ w: 1, h: 1 })),
		te = d(n, 'onSizeChange', 3, (i) => {}),
		se = d(n, 'onRemove', 3, () => {});
	function ae(i) {
		return i > 5 ? 'text-error-500' : i > 2 ? 'text-warning-500' : 'text-success-500';
	}
	function re(i) {
		return i < 60 ? `${i}s` : i < 3600 ? `${Math.floor(i / 60)}m` : i < 86400 ? `${Math.floor(i / 3600)}h` : `${Math.floor(i / 86400)}d`;
	}
	function ie(i) {
		return i < 1024 ? `${i}MB` : `${(i / 1024).toFixed(1)}GB`;
	}
	(ze(V, {
		get label() {
			return X();
		},
		get theme() {
			return Y();
		},
		endpoint: '/api/dashboard/metrics?detailed=true',
		pollInterval: 1e4,
		get icon() {
			return Z();
		},
		get widgetId() {
			return $();
		},
		get size() {
			return ee();
		},
		get onSizeChange() {
			return te();
		},
		get onCloseRequest() {
			return se();
		},
		children: (ne, ce) => {
			const a = _(() => ce?.().data);
			var z = Se(),
				de = je(z);
			{
				var oe = (o) => {
						var l = qe(),
							x = e(l),
							v = e(x);
						(N(v, 'icon', 'mdi:chart-line'), N(v, 'width', '48'), Q(v, 1, 'mb-2 opacity-50'), Me(2), t(x), t(l), g(o, l));
					},
					le = (o) => {
						const l = _(() => (s(a).requests.total > 0 ? (s(a).requests.errors / s(a).requests.total) * 100 : 0)),
							x = _(() => (s(a).auth.validations > 0 ? ((s(a).auth.validations - s(a).auth.failures) / s(a).auth.validations) * 100 : 100)),
							v = _(() => (s(a).cache.hits + s(a).cache.misses > 0 ? (s(a).cache.hits / (s(a).cache.hits + s(a).cache.misses)) * 100 : 0));
						var h = Ce(),
							b = r(e(h), 2),
							y = e(b),
							q = e(y),
							w = r(e(q), 2),
							ve = e(w);
						(t(w), t(q), t(y));
						var k = r(y, 2),
							R = e(k),
							C = r(e(R), 2),
							fe = e(C);
						(t(C), t(R), t(k));
						var j = r(k, 2),
							P = e(j),
							B = r(e(P), 2),
							ue = e(B);
						(t(B), t(P), t(j));
						var F = r(j, 2),
							I = e(F),
							E = r(e(I), 2),
							me = e(E, !0);
						(t(E), t(I), t(F), t(b));
						var H = r(b, 2);
						{
							var xe = (f) => {
								var u = Re(),
									p = r(e(u), 2),
									m = e(p),
									L = r(e(m), 2),
									ge = e(L, !0);
								(t(L), t(m));
								var O = r(m, 2),
									D = r(e(O), 2),
									he = e(D, !0);
								(t(D),
									t(O),
									t(p),
									t(u),
									K(
										(be, ye) => {
											(c(ge, be), c(he, ye));
										},
										[() => ie(s(a).system.memory.used), () => re(s(a).system.uptime)]
									),
									g(f, u));
							};
							J(H, (f) => {
								s(a).system && f(xe);
							});
						}
						var T = r(H, 2),
							U = r(e(T), 2),
							M = e(U),
							W = r(e(M), 2),
							pe = e(W, !0);
						(t(W), t(M));
						var A = r(M, 2),
							G = r(e(A), 2),
							_e = e(G, !0);
						(t(G),
							t(A),
							t(U),
							t(T),
							t(h),
							K(
								(f, u, p, m) => {
									(Q(w, 1, `text-lg font-bold ${f ?? ''}`),
										c(ve, `${u ?? ''}%`),
										c(fe, `${p ?? ''}%`),
										c(ue, `${m ?? ''}%`),
										c(me, s(a).sessions.active),
										c(pe, s(a).requests.total),
										c(_e, s(a).requests.errors));
								},
								[() => ae(s(l)), () => s(l).toFixed(2), () => s(v).toFixed(1), () => s(x).toFixed(1)]
							),
							g(o, h));
					};
				J(de, (o) => {
					s(a) ? o(le, !1) : o(oe);
				});
			}
			g(ne, z);
		},
		$$slots: { default: !0 }
	}),
		ke());
}
export { We as default, Ue as widgetMeta };
//# sourceMappingURL=DD-T1xtZ.js.map
