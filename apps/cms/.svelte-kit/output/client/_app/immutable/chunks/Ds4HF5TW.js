import { i as _ } from './zi73tRJP.js';
import { p as ge, z as ce, g as e, u as a, f as g, a as ue, s as P, c as n, r as o, t as Y, A as ve } from './DrlZFkx8.js';
import { c, a as t, f as J, s as L } from './CTjXDULS.js';
import { s as q } from './DhHAlOU0.js';
import { t as B, f as F } from './0XeaN6pZ.js';
import { c as S, a as H } from './MEFvoR_D.js';
import { p as y } from './DePHBZW_.js';
import { p as C } from './CxX94NXM.js';
var _e = J(
		'<div class="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800" role="status" aria-live="polite"><div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" aria-hidden="true"></div> <span class="text-sm text-gray-600 dark:text-gray-400"> </span></div>'
	),
	xe = J('<div aria-live="polite"><span class="text-2xl" role="img"> </span> <div class="flex-1"><h3> </h3> <p> </p> <!></div></div>');
function Ae(K, r) {
	ge(r, !0);
	const N = y(r, 'messages', 19, () => ({})),
		Q = y(r, 'silent', 3, !1),
		T = y(r, 'showLoadingState', 3, !0),
		U = y(r, 'logDenials', 3, !0),
		V = {
			rateLimited: 'Rate limit reached. Please try again later.',
			missingConfig: 'Permission configuration is missing.',
			insufficientPermissions: 'You do not have permission to access this content.',
			loadingPermissions: 'Loading permissions...'
		},
		x = a(() => ({ ...V, ...N() })),
		W = a(() => C.data?.permissions || {}),
		X = a(() => C.data?.isAdmin || !1),
		M = a(() => C.data?.isLoadingPermissions || !1),
		G = a(() =>
			r.config?.contextId ? (e(W)[r.config.contextId] ?? { hasPermission: !1, isRateLimited: !1 }) : { hasPermission: !1, isRateLimited: !1 }
		),
		b = a(() => e(X) || e(G).hasPermission),
		i = a(() => e(G).isRateLimited),
		Z = a(() => !!r.config && e(b) && !e(i) && !e(M)),
		j = a(() => (r.config ? (e(i) ? 'rate_limited' : e(b) ? null : 'insufficient_permissions') : 'missing_config'));
	ce(() => {
		U() &&
			e(j) &&
			r.config &&
			console.warn('[PermissionGuard] Access denied:', {
				contextId: r.config.contextId,
				reason: e(j),
				timestamp: new Date().toISOString(),
				userAgent: typeof navigator < 'u' ? navigator.userAgent : 'unknown'
			});
	});
	const z = a(() => (r.config ? (e(i) ? e(x).rateLimited : e(b) ? null : e(x).insufficientPermissions) : e(x).missingConfig)),
		$ = a(() => (r.config ? (e(i) ? '⏱️' : e(b) ? '❌' : '🔒') : '⚙️')),
		ee = a(() => (e(i) ? 'status' : 'alert'));
	var E = c(),
		re = g(E);
	{
		var ae = (d) => {
				var s = _e(),
					h = P(n(s), 2),
					R = n(h, !0);
				(o(h),
					o(s),
					Y(() => L(R, e(x).loadingPermissions)),
					B(
						3,
						s,
						() => F,
						() => ({ duration: 200 })
					),
					t(d, s));
			},
			ie = (d) => {
				var s = c(),
					h = g(s);
				{
					var R = (f) => {
							var u = c(),
								A = g(u);
							(q(A, () => r.children ?? ve), t(f, u));
						},
						te = (f) => {
							var u = c(),
								A = g(u);
							{
								var se = (m) => {
										var v = c(),
											I = g(v);
										(q(I, () => r.fallback), t(m, v));
									},
									ne = (m) => {
										var v = c(),
											I = g(v);
										{
											var oe = (D) => {
												var l = xe(),
													p = n(l),
													de = n(p, !0);
												o(p);
												var O = P(p, 2),
													k = n(O),
													fe = n(k, !0);
												o(k);
												var w = P(k, 2),
													me = n(w, !0);
												o(w);
												var le = P(w, 2);
												(_(le, (be) => {
													r.config;
												}),
													o(O),
													o(l),
													Y(() => {
														(S(
															l,
															1,
															`flex items-start gap-3 rounded-lg border p-4 ${e(i) ? 'border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-900/20' : 'border-error-200 bg-error-50 dark:border-error-800 dark:bg-error-900/20'}`
														),
															H(l, 'role', e(ee)),
															H(p, 'aria-label', e(i) ? 'Rate limited' : 'Access denied'),
															L(de, e($)),
															S(k, 1, `font-semibold ${e(i) ? 'text-warning-800 dark:text-warning-200' : 'text-error-800 dark:text-error-200'}`),
															L(fe, e(i) ? 'Rate Limit Exceeded' : 'Access Denied'),
															S(w, 1, `mt-1 text-sm ${e(i) ? 'text-warning-700 dark:text-warning-300' : 'text-error-700 dark:text-error-300'}`),
															L(me, e(z)));
													}),
													B(
														3,
														l,
														() => F,
														() => ({ duration: 200 })
													),
													t(D, l));
											};
											_(
												I,
												(D) => {
													!Q() && e(z) && D(oe);
												},
												!0
											);
										}
										t(m, v);
									};
								_(
									A,
									(m) => {
										r.fallback ? m(se) : m(ne, !1);
									},
									!0
								);
							}
							t(f, u);
						};
					_(
						h,
						(f) => {
							e(Z) ? f(R) : f(te, !1);
						},
						!0
					);
				}
				t(d, s);
			};
		_(re, (d) => {
			e(M) && T() ? d(ae) : d(ie, !1);
		});
	}
	(t(K, E), ue());
}
export { Ae as P };
//# sourceMappingURL=Ds4HF5TW.js.map
