import { i as U } from './zi73tRJP.js';
import { o as et, a as tt } from './CMZtchEj.js';
import { p as it, d as V, x as he, c as t, t as I, g as i, u as re, s as a, r as e, n as E, a as rt, b as S } from './DrlZFkx8.js';
import { f as _, s as o, a as b, d as at } from './CTjXDULS.js';
import { e as ge, i as be } from './BXe5mj2j.js';
import { b as L, c as y } from './MEFvoR_D.js';
import { p as g } from './DePHBZW_.js';
import { l as st } from './BvngfGKt.js';
import { B as ot } from './KG4G7ZS9.js';
import { s as N } from './BSPmpUse.js';
const St = {
	name: 'Security Monitor',
	icon: 'mdi:shield-alert',
	description: 'Advanced security threat monitoring and incident response',
	defaultSize: { w: 3, h: 3 }
};
var nt = _('<span class="mr-1 inline-block rounded bg-gray-300 px-1 py-0.5 text-xs dark:bg-gray-600"> </span>'),
	ct = _('<div class="mt-1"></div>'),
	dt = _('<button class="btn-xs preset-outlined-surface-500btn" title="Unblock IP"><iconify-icon></iconify-icon></button>', 2),
	lt = _(
		'<div><div class="flex items-start justify-between"><div class="flex-1"><div class="font-medium"> <span class="ml-1 rounded bg-gray-200 px-1 text-xs dark:bg-gray-700"> </span></div> <div class="text-gray-600 dark:text-gray-400"> </div> <!></div> <div class="flex space-x-1"><button class="btn-xs preset-outlined-surface-500btn" title="Resolve incident"><iconify-icon></iconify-icon></button> <!></div></div></div>',
		2
	),
	vt = _(
		'<div class="min-h-0 flex-1"><h4 class="mb-2 flex items-center font-medium"><iconify-icon></iconify-icon> </h4> <div class="max-h-32 space-y-1 overflow-y-auto"></div></div>',
		2
	),
	ut = _(
		'<div class="flex flex-1 items-center justify-center text-gray-500"><div class="text-center"><iconify-icon></iconify-icon> <p class="text-sm">No active security incidents</p></div></div>',
		2
	),
	ft = _(
		'<div class="border-t pt-2"><h5 class="mb-1 text-xs font-medium">Threat Distribution</h5> <div class="flex space-x-1 text-xs"><div class="flex-1 text-center"><div class="font-bold text-red-600"> </div> <div class="text-gray-500">Critical</div></div> <div class="flex-1 text-center"><div class="font-bold text-orange-600"> </div> <div class="text-gray-500">High</div></div> <div class="flex-1 text-center"><div class="font-bold text-yellow-600"> </div> <div class="text-gray-500">Medium</div></div> <div class="flex-1 text-center"><div class="font-bold text-blue-600"> </div> <div class="text-gray-500">Low</div></div></div></div>'
	),
	mt = _(
		'<div class="flex h-full flex-col space-y-4 p-2"><div class="flex items-center justify-between"><div class="flex items-center space-x-3"><iconify-icon></iconify-icon> <div><h3 class="text-lg font-semibold capitalize"> </h3> <p class="text-sm text-gray-600 dark:text-gray-400"> </p></div></div> <button class="preset-outlined-surface-500btn btn-sm" aria-label="Refresh security data"><iconify-icon></iconify-icon></button></div> <div class="grid grid-cols-2 gap-2 text-sm"><div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="font-medium text-red-600">Blocked IPs</div> <div class="text-xl font-bold"> </div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="font-medium text-orange-600">Throttled IPs</div> <div class="text-xl font-bold"> </div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="font-medium text-purple-600">CSP Violations</div> <div class="text-xl font-bold"> </div></div> <div class="rounded bg-surface-100 p-2 dark:bg-surface-700"><div class="font-medium text-blue-600">Rate Limits</div> <div class="text-xl font-bold"> </div></div></div> <!> <!></div>',
		2
	);
function Lt(_e, v) {
	it(v, !0);
	const ye = g(v, 'label', 3, 'Security Monitor'),
		pe = g(v, 'theme', 3, 'light'),
		we = g(v, 'icon', 3, 'mdi:shield-alert'),
		ke = g(v, 'widgetId', 3, void 0),
		ae = g(v, 'size', 19, () => ({ w: 3, h: 3 })),
		Ie = g(v, 'autoRefresh', 3, !0),
		Se = g(v, 'refreshInterval', 3, 5e3),
		Le = g(v, 'onSizeChange', 3, (r) => {}),
		Pe = g(v, 'onRemove', 3, () => {});
	let d = V(
			he({
				activeIncidents: 0,
				blockedIPs: 0,
				throttledIPs: 0,
				totalIncidents: 0,
				threatLevelDistribution: { none: 0, low: 0, medium: 0, high: 0, critical: 0 },
				recentEvents: [],
				cspViolations: 0,
				rateLimitHits: 0
			})
		),
		j = V(he([])),
		A = V(!0),
		W = V(null),
		q = null;
	const J = re(() => De(i(d))),
		Te = re(() => Re(i(J))),
		Ce = re(() => ze(i(J)));
	function De(r) {
		const { threatLevelDistribution: s, activeIncidents: c } = r;
		return s.critical > 0 || c > 10
			? 'critical'
			: s.high > 0 || c > 5
				? 'high'
				: s.medium > 0 || c > 2
					? 'medium'
					: s.low > 0 || c > 0
						? 'low'
						: 'safe';
	}
	function Re(r) {
		switch (r) {
			case 'safe':
				return 'text-green-500';
			case 'low':
				return 'text-yellow-500';
			case 'medium':
				return 'text-orange-500';
			case 'high':
				return 'text-red-500';
			case 'critical':
				return 'text-red-700 animate-pulse';
			default:
				return 'text-gray-500';
		}
	}
	function ze(r) {
		switch (r) {
			case 'safe':
				return 'mdi:shield-check';
			case 'low':
				return 'mdi:shield-alert-outline';
			case 'medium':
				return 'mdi:shield-alert';
			case 'high':
				return 'mdi:shield-remove';
			case 'critical':
				return 'mdi:shield-off';
			default:
				return 'mdi:shield-outline';
		}
	}
	async function P() {
		try {
			(S(A, !0), S(W, null));
			const r = await fetch('/api/security/stats');
			if (!r.ok) throw new Error(`Security stats fetch failed: ${r.status}`);
			const s = await r.json(),
				c = await fetch('/api/security/incidents');
			if (!c.ok) throw new Error(`Incidents fetch failed: ${c.status}`);
			const T = await c.json();
			(S(d, s, !0), S(j, T.incidents || [], !0));
		} catch (r) {
			(S(W, r instanceof Error ? r.message : 'Failed to fetch security data', !0), st.error('Security data fetch error:', r));
		} finally {
			S(A, !1);
		}
	}
	async function Ee(r) {
		try {
			if ((await fetch(`/api/security/incidents/${r}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })).ok)
				(N('Incident resolved successfully', 'success'), await P());
			else throw new Error('Failed to resolve incident');
		} catch (s) {
			N(`Failed to resolve incident: ${s instanceof Error ? s.message : 'Unknown error'}`, 'error');
		}
	}
	async function je(r) {
		try {
			if (
				(await fetch('/api/security/unblock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: r }) }))
					.ok
			)
				(N(`IP ${r} unblocked successfully`, 'success'), await P());
			else throw new Error('Failed to unblock IP');
		} catch (s) {
			N(`Failed to unblock IP: ${s instanceof Error ? s.message : 'Unknown error'}`, 'error');
		}
	}
	function Ae(r) {
		return new Date(r).toLocaleString();
	}
	function Fe(r) {
		switch (r) {
			case 'critical':
				return 'border-l-4 border-red-600 bg-red-50 dark:bg-red-900/20';
			case 'high':
				return 'border-l-4 border-orange-500 bg-orange-50 dark:bg-orange-900/20';
			case 'medium':
				return 'border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
			case 'low':
				return 'border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20';
			default:
				return 'border-l-4 border-gray-400 bg-gray-50 dark:bg-gray-800';
		}
	}
	(et(() => {
		(P(), Ie() && (q = setInterval(P, Se())));
	}),
		tt(() => {
			q && clearInterval(q);
		}),
		ot(_e, {
			get label() {
				return ye();
			},
			get theme() {
				return pe();
			},
			get icon() {
				return we();
			},
			get widgetId() {
				return ke();
			},
			get size() {
				return ae();
			},
			get onSizeChange() {
				return Le();
			},
			get onCloseRequest() {
				return Pe();
			},
			get isLoading() {
				return i(A);
			},
			get error() {
				return i(W);
			},
			children: (r, s) => {
				var c = mt(),
					T = t(c),
					G = t(T),
					K = t(G);
				I(() => L(K, 'icon', i(Ce)));
				var se = a(K, 2),
					Q = t(se),
					Me = t(Q);
				e(Q);
				var oe = a(Q, 2),
					Oe = t(oe);
				(e(oe), e(se), e(G));
				var F = a(G, 2);
				F.__click = () => P();
				var ne = t(F);
				(L(ne, 'icon', 'mdi:refresh'), y(ne, 1, 'text-sm'), e(F), e(T));
				var X = a(T, 2),
					Y = t(X),
					ce = a(t(Y), 2),
					Be = t(ce, !0);
				(e(ce), e(Y));
				var Z = a(Y, 2),
					de = a(t(Z), 2),
					He = t(de, !0);
				(e(de), e(Z));
				var $ = a(Z, 2),
					le = a(t($), 2),
					Ue = t(le, !0);
				(e(le), e($));
				var ve = a($, 2),
					ue = a(t(ve), 2),
					Ve = t(ue, !0);
				(e(ue), e(ve), e(X));
				var fe = a(X, 2);
				{
					var Ne = (u) => {
							var l = vt(),
								x = t(l),
								f = t(x);
							(L(f, 'icon', 'mdi:alert-circle'), y(f, 1, 'mr-2 text-orange-500'));
							var M = a(f);
							e(x);
							var O = a(x, 2);
							(ge(
								O,
								21,
								() => i(j),
								be,
								(C, n) => {
									var p = lt(),
										w = t(p),
										k = t(w),
										D = t(k),
										R = t(D),
										z = a(R),
										ee = t(z, !0);
									(e(z), e(D));
									var te = a(D, 2),
										Ge = t(te);
									e(te);
									var Ke = a(te, 2);
									{
										var Qe = (h) => {
											var m = ct();
											(ge(
												m,
												21,
												() => i(n).responseActions,
												be,
												(H, Ze) => {
													var ie = nt(),
														$e = t(ie, !0);
													(e(ie), I(() => o($e, i(Ze))), b(H, ie));
												}
											),
												e(m),
												b(h, m));
										};
										U(Ke, (h) => {
											i(n).responseActions.length > 0 && h(Qe);
										});
									}
									e(k);
									var me = a(k, 2),
										B = t(me);
									B.__click = () => Ee(i(n).id);
									var xe = t(B);
									(L(xe, 'icon', 'mdi:check'), y(xe, 1, 'text-xs'), e(B));
									var Xe = a(B, 2);
									{
										var Ye = (h) => {
											var m = dt();
											m.__click = () => je(i(n).clientIp);
											var H = t(m);
											(L(H, 'icon', 'mdi:lock-open'), y(H, 1, 'text-xs'), e(m), b(h, m));
										};
										U(Xe, (h) => {
											(i(n).responseActions.includes('block') || i(n).responseActions.includes('blacklist')) && h(Ye);
										});
									}
									(e(me),
										e(w),
										e(p),
										I(
											(h, m) => {
												(y(p, 1, `rounded p-2 text-xs ${h ?? ''}`),
													o(R, `${i(n).clientIp ?? ''} `),
													o(ee, i(n).threatLevel),
													o(Ge, `${i(n).indicatorCount ?? ''} indicators • ${m ?? ''}`));
											},
											[() => Fe(i(n).threatLevel), () => Ae(i(n).timestamp)]
										),
										b(C, p));
								}
							),
								e(O),
								e(l),
								I(() => o(M, ` Active Incidents (${i(j).length ?? ''})`)),
								b(u, l));
						},
						We = (u) => {
							var l = ut(),
								x = t(l),
								f = t(x);
							(L(f, 'icon', 'mdi:shield-check'), y(f, 1, 'mb-2 text-4xl text-green-500'), E(2), e(x), e(l), b(u, l));
						};
					U(fe, (u) => {
						i(j).length > 0 ? u(Ne) : u(We, !1);
					});
				}
				var qe = a(fe, 2);
				{
					var Je = (u) => {
						var l = ft(),
							x = a(t(l), 2),
							f = t(x),
							M = t(f),
							O = t(M, !0);
						(e(M), E(2), e(f));
						var C = a(f, 2),
							n = t(C),
							p = t(n, !0);
						(e(n), E(2), e(C));
						var w = a(C, 2),
							k = t(w),
							D = t(k, !0);
						(e(k), E(2), e(w));
						var R = a(w, 2),
							z = t(R),
							ee = t(z, !0);
						(e(z),
							E(2),
							e(R),
							e(x),
							e(l),
							I(() => {
								(o(O, i(d).threatLevelDistribution.critical),
									o(p, i(d).threatLevelDistribution.high),
									o(D, i(d).threatLevelDistribution.medium),
									o(ee, i(d).threatLevelDistribution.low));
							}),
							b(u, l));
					};
					U(qe, (u) => {
						ae().h >= 3 && u(Je);
					});
				}
				(e(c),
					I(() => {
						(y(K, 1, `text-2xl ${i(Te) ?? ''}`),
							o(Me, `${i(J) ?? ''} Status`),
							o(Oe, `${i(d).activeIncidents ?? ''} active incidents`),
							(F.disabled = i(A)),
							o(Be, i(d).blockedIPs),
							o(He, i(d).throttledIPs),
							o(Ue, i(d).cspViolations),
							o(Ve, i(d).rateLimitHits));
					}),
					b(r, c));
			},
			$$slots: { default: !0 }
		}),
		rt());
}
at(['click']);
export { Lt as default, St as widgetMeta };
//# sourceMappingURL=t_Qjp53h.js.map
