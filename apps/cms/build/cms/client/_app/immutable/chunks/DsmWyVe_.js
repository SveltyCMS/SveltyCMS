import { i as y } from './zi73tRJP.js';
import { o as we, a as ke } from './CMZtchEj.js';
import { p as ye, z as Ce, g as e, d as _, u as E, f as M, a as Se, b as t, c as T, s as V, r as I, t as C } from './DrlZFkx8.js';
import { c as Z, a as f, f as x, s as R, t as Ve } from './CTjXDULS.js';
import { s as Ee } from './DhHAlOU0.js';
import { a as ee, c as te, d as Me } from './MEFvoR_D.js';
import { p as re } from './DePHBZW_.js';
import { p as Te } from './C9E6SjbS.js';
var Ie = x(
		'<span class="flex h-2 w-2"><span class="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-error-400 opacity-75"></span> <span class="relative inline-flex h-2 w-2 rounded-full bg-error-500"></span></span>'
	),
	Re = x('<span class="text-black">Ver.</span> <span class="text-white"> </span> <!>', 1),
	je = x('<span class="opacity-70"> </span>'),
	Le = x(' <!>', 1),
	Ae = x('<span aria-hidden="true"></span>'),
	Ue = x('<span><!></span> <!>', 1),
	Ne = x('<span class="sr-only"> </span>'),
	Pe = x(
		'<div class="mt-2 rounded border-l-4 border-error-500 bg-error-50 p-2 text-xs text-error-700 dark:bg-error-900/20 dark:text-error-300" role="alert"><strong>Version check failed:</strong> </div>'
	),
	De = x('<a target="_blank" rel="noopener noreferrer" aria-live="polite"><!> <!></a> <!>', 1);
function Xe(ae, S) {
	ye(S, !0);
	const X = re(S, 'transparent', 3, !1),
		j = re(S, 'compact', 3, !1),
		se = 'https://github.com/SveltyCMS/SveltyCMS/releases',
		ne = 1e3 * 60 * 60,
		oe = 3,
		ie = 2e3,
		c = E(() => Te?.PKG_VERSION || '0.0.0');
	let u = _(''),
		d = _('variant-filled'),
		i = _('bg-primary-500 text-white'),
		v = _('Checking for updates...'),
		w = _('mdi:loading'),
		n = _('unknown'),
		h = _(!0),
		g = _(null),
		$ = _(null),
		L = null;
	const q = E(() => ({
			pkg: e(c),
			githubVersion: e(u),
			badgeVariant: e(d),
			badgeColor: e(i),
			versionStatusMessage: e(v),
			statusIcon: e(w),
			statusSeverity: e(n),
			isLoading: e(h),
			error: e(g),
			lastChecked: e($)
		})),
		le = E(() => window.location.pathname.startsWith('/login')),
		D = E(() => X() || e(le)),
		ce = E(() =>
			e(i).includes('success')
				? 'bg-success-500/20 text-success-700 dark:text-success-300'
				: e(i).includes('warning')
					? 'bg-warning-500/20 text-warning-700 dark:text-warning-300'
					: e(i).includes('error')
						? 'bg-error-500/20 text-black'
						: 'bg-surface-900/10 dark:text-white'
		);
	function F(r) {
		const a = r.split('.').map(Number);
		return [a[0] || 0, a[1] || 0, a[2] || 0];
	}
	function ue(r, a) {
		const [s, m, A] = F(r),
			[U, P, Y] = F(a);
		return U > s ? 'major' : U === s && P > m ? 'minor' : U === s && P === m && Y > A ? 'patch' : 'current';
	}
	function fe(r) {
		if (r.status === 'disabled')
			(t(u, e(c), !0),
				t(d, 'variant-filled'),
				t(i, 'bg-surface-500 text-white'),
				t(v, 'Version check disabled'),
				t(w, 'mdi:shield-off'),
				t(n, 'info'),
				t(g, null));
		else if (r.status === 'error')
			(t(u, e(c), !0),
				t(d, 'variant-filled'),
				t(i, 'bg-warning-500 text-white'),
				t(v, 'Could not check for updates'),
				t(w, 'mdi:wifi-off'),
				t(n, 'warning'),
				t(g, r.error || 'Network error', !0));
		else {
			t(u, r.latest || e(c), !0);
			const a = ue(e(c), e(u));
			(r.security_issue
				? (t(d, 'variant-filled'),
					t(i, 'bg-error-500 text-white'),
					t(v, r.message || `Critical security update to v${e(u)} available!`, !0),
					t(w, 'mdi:shield-alert'),
					t(n, 'critical'))
				: a === 'major'
					? (t(d, 'variant-filled'),
						t(i, 'bg-error-500 text-white'),
						t(v, `Major update to v${e(u)} available`),
						t(w, 'mdi:alert-circle'),
						t(n, 'critical'))
					: a === 'minor' || a === 'patch'
						? (t(d, 'variant-filled'),
							t(i, 'bg-warning-500 text-black'),
							t(v, `Update to v${e(u)} recommended`),
							t(w, 'mdi:information'),
							t(n, 'warning'))
						: (t(d, 'variant-filled'), t(i, 'bg-success-500 text-white'), t(v, 'You are up to date'), t(w, 'mdi:check-circle'), t(n, 'success')),
				t(g, null));
		}
		t($, Date.now(), !0);
	}
	async function H(r = 0) {
		if (!(e(h) && r === 0)) {
			(t(h, !0), t(g, null));
			try {
				const a = new AbortController(),
					s = setTimeout(() => a.abort(), 1e4),
					m = await fetch('/api/system/version', { signal: a.signal, headers: { 'Content-Type': 'application/json' } });
				if ((clearTimeout(s), !m.ok)) throw new Error(`HTTP ${m.status}: ${m.statusText}`);
				const A = await m.json();
				fe(A);
			} catch (a) {
				const s = a instanceof Error ? a.message : 'Unknown error';
				r < oe
					? setTimeout(() => H(r + 1), ie * Math.pow(2, r))
					: (t(u, e(c), !0),
						t(d, 'variant-soft'),
						t(i, 'bg-surface-500 text-white'),
						t(v, 'Update check failed'),
						t(w, 'mdi:alert-octagon'),
						t(n, 'unknown'),
						t(g, s, !0));
			} finally {
				t(h, !1);
			}
		}
	}
	(Ce(() => {
		S.onStatusChange && !e(h) && S.onStatusChange(e(q));
	}),
		we(
			() => (
				H(),
				(L = setInterval(() => {
					H();
				}, ne)),
				() => {
					L && clearInterval(L);
				}
			)
		),
		ke(() => {
			L && clearInterval(L);
		}));
	const pe = E(() => (e(h) ? 'Checking application version' : e(g) ? `Version ${e(c)}. ${e(g)}` : `Application version ${e(c)}. ${e(v)}`));
	var J = Z(),
		de = M(J);
	{
		var ve = (r) => {
				var a = Z(),
					s = M(a);
				(Ee(
					s,
					() => S.children,
					() => e(q)
				),
					f(r, a));
			},
			ge = (r) => {
				var a = De(),
					s = M(a);
				ee(s, 'href', se);
				var m = T(s);
				{
					var A = (o) => {
							var l = Re(),
								p = V(M(l), 2),
								G = T(p, !0);
							I(p);
							var K = V(p, 2);
							{
								var z = (N) => {
									var B = Ie();
									f(N, B);
								};
								y(K, (N) => {
									!e(h) && e(n) === 'critical' && N(z);
								});
							}
							(C(() => R(G, e(c))), f(o, l));
						},
						U = (o) => {
							var l = Ue(),
								p = M(l),
								G = T(p);
							{
								var K = (b) => {
										var k = Ve();
										(C(() => R(k, `v.${e(c) ?? ''}`)), f(b, k));
									},
									z = (b) => {
										var k = Le(),
											Q = M(k),
											he = V(Q);
										{
											var _e = (O) => {
												var W = je(),
													xe = T(W);
												(I(W), C(() => R(xe, `→ ${e(u) ?? ''}`)), f(O, W));
											};
											y(he, (O) => {
												e(u) && e(u) !== e(c) && !e(h) && O(_e);
											});
										}
										(C(() => R(Q, `Ver. ${e(c) ?? ''} `)), f(b, k));
									};
								y(G, (b) => {
									j() ? b(K) : b(z, !1);
								});
							}
							I(p);
							var N = V(p, 2);
							{
								var B = (b) => {
									var k = Ae();
									(C(() =>
										te(
											k,
											1,
											`inline-block h-2 w-2 rounded-full ${e(n) === 'critical' ? 'bg-error-500' : e(n) === 'warning' ? 'bg-warning-500' : e(n) === 'success' ? 'bg-success-500' : 'bg-surface-500'}`
										)
									),
										f(b, k));
								};
								y(N, (b) => {
									!j() && !e(h) && e(n) !== 'unknown' && b(B);
								});
							}
							f(o, l);
						};
					y(m, (o) => {
						e(D) ? o(A) : o(U, !1);
					});
				}
				var P = V(m, 2);
				{
					var Y = (o) => {
						var l = Ne(),
							p = T(l, !0);
						(I(l), C(() => R(p, e(v))), f(o, l));
					};
					y(P, (o) => {
						!j() && !e(D) && o(Y);
					});
				}
				I(s);
				var me = V(s, 2);
				{
					var be = (o) => {
						var l = Pe(),
							p = V(T(l));
						(I(l), C(() => R(p, ` ${e(g) ?? ''}`)), f(o, l));
					};
					y(me, (o) => {
						e(g) && e(n) === 'critical' && !j() && !X() && o(be);
					});
				}
				(C(() => {
					(te(
						s,
						1,
						Me(
							e(D)
								? `absolute bottom-5 left-1/2 flex -translate-x-1/2 transform items-center justify-between w-28 gap-2 rounded-full ${e(ce)} px-4 py-1 text-sm font-bold transition-opacity duration-300 hover:opacity-90  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2`
								: j()
									? `inline-flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80 focus:opacity-80 badge ${e(d)} ${e(i)} rounded-full px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-primary-500`
									: `inline-flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80 focus:opacity-80 badge ${e(d)} ${e(i)} rounded-full focus:outline-none focus:ring-2 focus:ring-primary-500`
						)
					),
						ee(s, 'aria-label', e(pe)));
				}),
					f(r, a));
			};
		y(de, (r) => {
			S.children ? r(ve) : r(ge, !1);
		});
	}
	(f(ae, J), Se());
}
export { Xe as V };
//# sourceMappingURL=DsmWyVe_.js.map
