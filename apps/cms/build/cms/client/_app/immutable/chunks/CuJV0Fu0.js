import { i as xe } from './zi73tRJP.js';
import { o as Ze, a as et } from './CMZtchEj.js';
import { p as tt, d as S, x as rt, c as r, t as T, g as a, u as k, s, r as t, n as f, a as at, b as x } from './DrlZFkx8.js';
import { f as F, s as o, a as C } from './CTjXDULS.js';
import { e as st, i as it } from './BXe5mj2j.js';
import { b as ot, c as b } from './MEFvoR_D.js';
import { p as d } from './DePHBZW_.js';
import { l as ct } from './BvngfGKt.js';
import { B as nt } from './KG4G7ZS9.js';
const bt = {
	name: 'Unified Metrics',
	icon: 'mdi:chart-donut',
	description: 'Comprehensive system performance and security metrics',
	defaultSize: { w: 2, h: 3 }
};
var dt = F('<div class="rounded bg-yellow-100 px-1 py-0.5 text-xs dark:bg-yellow-900/20"> </div>'),
	vt = F('<div class="border-t pt-2"><h5 class="mb-1 text-xs font-medium">Performance Bottlenecks</h5> <div class="space-y-1"></div></div>'),
	ut = F(
		'<div class="min-h-0 flex-1 space-y-2"><div class="border-t pt-2"><h5 class="mb-1 text-xs font-medium">Request Statistics</h5> <div class="grid grid-cols-3 gap-1 text-xs"><div class="text-center"><div class="font-mono"> </div> <div class="text-gray-500">Total</div></div> <div class="text-center"><div class="font-mono text-red-600"> </div> <div class="text-gray-500">Errors</div></div> <div class="text-center"><div class="font-mono text-yellow-600"> </div> <div class="text-gray-500">Slow</div></div></div></div> <div class="border-t pt-2"><h5 class="mb-1 text-xs font-medium">Security Events</h5> <div class="grid grid-cols-3 gap-1 text-xs"><div class="text-center"><div class="font-mono text-orange-600"> </div> <div class="text-gray-500">Rate Limits</div></div> <div class="text-center"><div class="font-mono text-purple-600"> </div> <div class="text-gray-500">CSP Violations</div></div> <div class="text-center"><div class="font-mono text-red-600"> </div> <div class="text-gray-500">Auth Fails</div></div></div></div> <!></div>'
	),
	lt = F(
		'<div class="flex h-full flex-col space-y-3 p-2"><div class="flex items-center justify-between"><div class="flex items-center space-x-2"><iconify-icon></iconify-icon> <div><h3 class="font-semibold capitalize"> </h3> <p class="text-xs text-gray-500">System Health</p></div></div> <div class="text-right"><div class="text-xs text-gray-500">Uptime</div> <div class="font-mono text-sm"> </div></div></div> <div class="grid grid-cols-2 gap-2"><div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="text-xs text-gray-600 dark:text-gray-400">Response Time</div> <div> </div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="text-xs text-gray-600 dark:text-gray-400">Error Rate</div> <div> </div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="text-xs text-gray-600 dark:text-gray-400">Auth Success</div> <div> </div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="text-xs text-gray-600 dark:text-gray-400">Cache Hit</div> <div> </div></div></div> <!> <div class="border-t pt-1 text-center text-xs text-gray-500"> </div></div>',
		2
	);
function wt(ge, n) {
	tt(n, !0);
	const me = d(n, 'label', 3, 'System Metrics'),
		pe = d(n, 'theme', 3, 'light'),
		_e = d(n, 'icon', 3, 'mdi:chart-donut'),
		ye = d(n, 'widgetId', 3, void 0),
		Y = d(n, 'size', 19, () => ({ w: 2, h: 3 })),
		Re = d(n, 'showDetails', 3, !0),
		be = d(n, 'autoRefresh', 3, !0),
		we = d(n, 'refreshInterval', 3, 3e3),
		He = d(n, 'onSizeChange', 3, (e) => {}),
		qe = d(n, 'onRemove', 3, () => {});
	let c = S(
			rt({
				timestamp: 0,
				uptime: 0,
				requests: { total: 0, errors: 0, errorRate: 0, avgResponseTime: 0 },
				authentication: { validations: 0, failures: 0, successRate: 0, cacheHits: 0, cacheMisses: 0, cacheHitRate: 0 },
				api: { requests: 0, errors: 0, cacheHits: 0, cacheMisses: 0, cacheHitRate: 0 },
				security: { rateLimitViolations: 0, cspViolations: 0, authFailures: 0 },
				performance: { slowRequests: 0, avgHookExecutionTime: 0, bottlenecks: [] }
			})
		),
		V = S(!0),
		z = S(null),
		E = null,
		I = S(0);
	const L = k(() => Te(a(c))),
		Me = k(() => ke(a(L))),
		Se = k(() => Ce(a(L))),
		v = k(() => Fe(a(c)));
	function Te(e) {
		const i = {
			errorRate: e.requests.errorRate,
			responseTime: e.requests.avgResponseTime,
			authSuccessRate: e.authentication.successRate,
			cacheHitRate: (e.authentication.cacheHitRate + e.api.cacheHitRate) / 2,
			securityViolations: e.security.rateLimitViolations + e.security.cspViolations,
			slowRequests: e.performance.slowRequests
		};
		return i.errorRate > 10 || i.responseTime > 5e3 || i.authSuccessRate < 80
			? 'critical'
			: i.errorRate > 5 || i.responseTime > 2e3 || i.authSuccessRate < 90 || i.securityViolations > 50
				? 'poor'
				: i.errorRate > 2 || i.responseTime > 1e3 || i.cacheHitRate < 70 || i.securityViolations > 20
					? 'fair'
					: i.errorRate > 1 || i.responseTime > 500 || i.cacheHitRate < 85
						? 'good'
						: 'excellent';
	}
	function ke(e) {
		switch (e) {
			case 'excellent':
				return 'text-green-600';
			case 'good':
				return 'text-green-500';
			case 'fair':
				return 'text-yellow-500';
			case 'poor':
				return 'text-orange-500';
			case 'critical':
				return 'text-red-600 animate-pulse';
			default:
				return 'text-gray-500';
		}
	}
	function Ce(e) {
		switch (e) {
			case 'excellent':
				return 'mdi:heart-pulse';
			case 'good':
				return 'mdi:heart';
			case 'fair':
				return 'mdi:heart-half';
			case 'poor':
				return 'mdi:heart-broken';
			case 'critical':
				return 'mdi:heart-off';
			default:
				return 'mdi:heart-outline';
		}
	}
	function Fe(e) {
		return {
			responseTime: {
				value: e.requests.avgResponseTime,
				formatted: `${e.requests.avgResponseTime.toFixed(0)}ms`,
				status: e.requests.avgResponseTime < 500 ? 'good' : e.requests.avgResponseTime < 1e3 ? 'fair' : 'poor'
			},
			errorRate: {
				value: e.requests.errorRate,
				formatted: `${e.requests.errorRate.toFixed(2)}%`,
				status: e.requests.errorRate < 1 ? 'good' : e.requests.errorRate < 5 ? 'fair' : 'poor'
			},
			authSuccess: {
				value: e.authentication.successRate,
				formatted: `${e.authentication.successRate.toFixed(1)}%`,
				status: e.authentication.successRate > 95 ? 'good' : e.authentication.successRate > 90 ? 'fair' : 'poor'
			},
			cacheEfficiency: {
				value: (e.authentication.cacheHitRate + e.api.cacheHitRate) / 2,
				formatted: `${((e.authentication.cacheHitRate + e.api.cacheHitRate) / 2).toFixed(1)}%`,
				status: (e.authentication.cacheHitRate + e.api.cacheHitRate) / 2 > 80 ? 'good' : 'fair'
			}
		};
	}
	function w(e) {
		switch (e) {
			case 'good':
				return 'text-green-600';
			case 'fair':
				return 'text-yellow-600';
			case 'poor':
				return 'text-red-600';
			default:
				return 'text-gray-600';
		}
	}
	async function Z() {
		try {
			(x(V, !0), x(z, null));
			const e = await fetch('/api/metrics/unified');
			if (!e.ok) throw new Error(`Metrics fetch failed: ${e.status}`);
			const i = await e.json();
			(x(c, i, !0), x(I, Date.now(), !0));
		} catch (e) {
			(x(z, e instanceof Error ? e.message : 'Failed to fetch metrics', !0), ct.error('Unified metrics fetch error:', e));
		} finally {
			x(V, !1);
		}
	}
	function Ve(e) {
		const i = Math.floor(e / 1e3),
			u = Math.floor(i / 60),
			l = Math.floor(u / 60),
			h = Math.floor(l / 24);
		return h > 0 ? `${h}d ${l % 24}h` : l > 0 ? `${l}h ${u % 60}m` : u > 0 ? `${u}m ${i % 60}s` : `${i}s`;
	}
	function U(e) {
		return e >= 1e6 ? `${(e / 1e6).toFixed(1)}M` : e >= 1e3 ? `${(e / 1e3).toFixed(1)}K` : e.toString();
	}
	function ze() {
		if (!a(I)) return 'Never';
		const e = Math.floor((Date.now() - a(I)) / 1e3);
		return e < 60 ? `${e}s ago` : `${Math.floor(e / 60)}m ago`;
	}
	(Ze(() => {
		(Z(), be() && (E = setInterval(Z, we())));
	}),
		et(() => {
			E && clearInterval(E);
		}),
		nt(ge, {
			get label() {
				return me();
			},
			get theme() {
				return pe();
			},
			get icon() {
				return _e();
			},
			get widgetId() {
				return ye();
			},
			get size() {
				return Y();
			},
			get onSizeChange() {
				return He();
			},
			get onCloseRequest() {
				return qe();
			},
			get isLoading() {
				return a(V);
			},
			get error() {
				return a(z);
			},
			children: (e, i) => {
				var u = lt(),
					l = r(u),
					h = r(l),
					$ = r(h);
				T(() => ot($, 'icon', a(Se)));
				var ee = s($, 2),
					te = r(ee),
					Ee = r(te, !0);
				(t(te), f(2), t(ee), t(h));
				var re = s(h, 2),
					ae = s(r(re), 2),
					Ie = r(ae, !0);
				(t(ae), t(re), t(l));
				var D = s(l, 2),
					P = r(D),
					B = s(r(P), 2),
					Le = r(B, !0);
				(t(B), t(P));
				var j = s(P, 2),
					A = s(r(j), 2),
					Ue = r(A, !0);
				(t(A), t(j));
				var N = s(j, 2),
					W = s(r(N), 2),
					$e = r(W, !0);
				(t(W), t(N));
				var se = s(N, 2),
					K = s(r(se), 2),
					De = r(K, !0);
				(t(K), t(se), t(D));
				var ie = s(D, 2);
				{
					var Pe = (g) => {
						var m = ut(),
							p = r(m),
							H = s(r(p), 2),
							_ = r(H),
							q = r(_),
							je = r(q, !0);
						(t(q), f(2), t(_));
						var O = s(_, 2),
							ce = r(O),
							Ae = r(ce, !0);
						(t(ce), f(2), t(O));
						var ne = s(O, 2),
							de = r(ne),
							Ne = r(de, !0);
						(t(de), f(2), t(ne), t(H), t(p));
						var G = s(p, 2),
							ve = s(r(G), 2),
							J = r(ve),
							ue = r(J),
							We = r(ue, !0);
						(t(ue), f(2), t(J));
						var Q = s(J, 2),
							le = r(Q),
							Ke = r(le, !0);
						(t(le), f(2), t(Q));
						var fe = s(Q, 2),
							he = r(fe),
							Oe = r(he, !0);
						(t(he), f(2), t(fe), t(ve), t(G));
						var Ge = s(G, 2);
						{
							var Je = (y) => {
								var R = vt(),
									M = s(r(R), 2);
								(st(
									M,
									21,
									() => a(c).performance.bottlenecks.slice(0, 3),
									it,
									(Qe, Xe) => {
										var X = dt(),
											Ye = r(X, !0);
										(t(X), T(() => o(Ye, a(Xe))), C(Qe, X));
									}
								),
									t(M),
									t(R),
									C(y, R));
							};
							xe(Ge, (y) => {
								a(c).performance.bottlenecks.length > 0 && y(Je);
							});
						}
						(t(m),
							T(
								(y, R, M) => {
									(o(je, y),
										o(Ae, R),
										o(Ne, M),
										o(We, a(c).security.rateLimitViolations),
										o(Ke, a(c).security.cspViolations),
										o(Oe, a(c).security.authFailures));
								},
								[() => U(a(c).requests.total), () => U(a(c).requests.errors), () => U(a(c).performance.slowRequests)]
							),
							C(g, m));
					};
					xe(ie, (g) => {
						Re() && Y().h >= 3 && g(Pe);
					});
				}
				var oe = s(ie, 2),
					Be = r(oe);
				(t(oe),
					t(u),
					T(
						(g, m, p, H, _, q) => {
							(b($, 1, `text-xl ${a(Me) ?? ''}`),
								o(Ee, a(L)),
								o(Ie, g),
								b(B, 1, `font-bold ${m ?? ''}`),
								o(Le, a(v).responseTime.formatted),
								b(A, 1, `font-bold ${p ?? ''}`),
								o(Ue, a(v).errorRate.formatted),
								b(W, 1, `font-bold ${H ?? ''}`),
								o($e, a(v).authSuccess.formatted),
								b(K, 1, `font-bold ${_ ?? ''}`),
								o(De, a(v).cacheEfficiency.formatted),
								o(Be, `Last updated: ${q ?? ''}`));
						},
						[
							() => Ve(a(c).uptime),
							() => w(a(v).responseTime.status),
							() => w(a(v).errorRate.status),
							() => w(a(v).authSuccess.status),
							() => w(a(v).cacheEfficiency.status),
							ze
						]
					),
					C(e, u));
			},
			$$slots: { default: !0 }
		}),
		at());
}
export { wt as default, bt as widgetMeta };
//# sourceMappingURL=CuJV0Fu0.js.map
