import { i as x } from '../chunks/zi73tRJP.js';
import {
	p as Rt,
	d as u,
	x as Ue,
	z as je,
	b as n,
	g as t,
	ai as Dt,
	s as i,
	c as s,
	t as $,
	u as _,
	a as Lt,
	r,
	n as ve,
	e as zt,
	f as At
} from '../chunks/DrlZFkx8.js';
import { d as Ct, f as d, s as l, a as c, t as Oe } from '../chunks/CTjXDULS.js';
import { o as Tt, a as Ft } from '../chunks/CMZtchEj.js';
import { e as Mt } from '../chunks/BXe5mj2j.js';
import { c as R, a as b, r as Ht, s as Nt } from '../chunks/MEFvoR_D.js';
import { c as Ut } from '../chunks/D4QnGYgQ.js';
import { s as jt } from '../chunks/_c0O0354.js';
import { l as ue } from '../chunks/BvngfGKt.js';
import { s as I } from '../chunks/BSPmpUse.js';
import { f as Ot } from '../chunks/B_fImZOG.js';
import { P as Gt } from '../chunks/C6jjkVLf.js';
var Pt = d(
		'<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" role="status" aria-label="Loading"></span>'
	),
	Zt = d('<span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>'),
	Bt = d('<span class="text-lg" role="img" aria-hidden="true">⚡</span>'),
	Jt = d(
		'<div class="h-2 w-full overflow-hidden rounded-full bg-surface-700" role="progressbar" aria-label="System health percentage"><div></div></div>'
	),
	Vt = d('<span class="badge preset-filled-error-500 text-xs"> </span>'),
	Yt = d('<div class="card preset-outlined-surface-500p-6 text-center"><p class="text-sm opacity-70">No services registered</p></div>'),
	Qt = d('<p class="mt-1 truncate text-xs text-error-500"> </p>'),
	Xt = d('<p class="mt-1 text-xs opacity-50"> </p>'),
	qt = d(
		'<div class="card flex items-start gap-3 p-3 transition-shadow duration-200 hover:shadow-lg" role="article"><div role="img"> </div> <div class="min-w-0 flex-1"><p class="text-sm font-semibold"> </p> <p class="truncate text-xs opacity-70"> </p> <!> <!></div></div>'
	),
	Kt = d('<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"></div>'),
	Wt = d(
		'<div class="card space-y-4 p-4" role="region" aria-label="System health monitoring"><div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div class="flex items-center gap-3"><span role="img"> </span> <div><h3 class="h3 flex items-center gap-2">System Health <!></h3> <p class="text-sm opacity-70">Status: <span> </span></p></div></div> <div class="flex flex-wrap items-center gap-2"><label class="flex items-center gap-2 text-sm"><input type="checkbox" class="checkbox" aria-label="Enable auto-refresh"/> Auto-refresh</label> <button class="preset-outlined-primary-500 btn-sm" title="Refresh now" aria-label="Refresh system health"><span role="img" aria-hidden="true">🔄</span></button> <button class="preset-outlined-warning-500 btn-sm" title="Reinitialize system" aria-label="Reinitialize system"><!> Reinitialize</button></div></div> <div class="grid grid-cols-2 gap-3 sm:grid-cols-4"><div class="card preset-outlined-surface-500p-3"><p class="text-xs opacity-70">Uptime</p> <p class="text-lg font-bold"> </p></div> <div class="card preset-outlined-surface-500p-3"><p class="text-xs opacity-70">Last Checked</p> <p class="text-sm font-bold"> </p></div> <div class="card preset-outlined-surface-500p-3"><p class="text-xs opacity-70">Services</p> <p class="text-lg font-bold"> <span class="text-xs opacity-70"> </span></p></div> <div class="card preset-outlined-surface-500p-3"><p class="text-xs opacity-70">Health</p> <p> </p></div></div> <!> <div class="space-y-2"><div class="flex items-center justify-between"><h4 class="h4 text-sm font-semibold opacity-70">Service Status</h4> <!></div> <!></div> <div class="card preset-outlined-surface-500p-3"><details class="space-y-2"><summary class="cursor-pointer text-sm font-semibold opacity-70 hover:opacity-100">API Health Endpoint</summary> <div class="space-y-2 text-xs opacity-70"><p>For external monitoring, use:</p> <div class="flex items-center gap-2"><code class="code flex-1 p-2"> </code> <button type="button" class="btn-sm preset-outlined-primary-500" title="Copy to clipboard" aria-label="Copy endpoint URL to clipboard"><!></button></div> <div class="mt-2 space-y-1"><p><strong>Returns:</strong> JSON with system status and component health</p> <p><strong>Status codes:</strong></p> <ul class="ml-4 list-disc space-y-0.5"><li>200 = READY/DEGRADED</li> <li>503 = INITIALIZING/FAILED/IDLE</li></ul></div></div></details></div></div>'
	);
function ea(P, H) {
	Rt(H, !0);
	const w = {
			READY: { color: 'text-success-500', icon: '✅', label: 'Ready' },
			DEGRADED: { color: 'text-warning-500', icon: '⚠️', label: 'Degraded' },
			INITIALIZING: { color: 'text-primary-500', icon: '🔄', label: 'Initializing' },
			FAILED: { color: 'text-error-500', icon: '❌', label: 'Failed' },
			IDLE: { color: 'text-surface-500', icon: '⏸️', label: 'Idle' }
		},
		g = {
			healthy: { color: 'preset-filled-success-500', icon: '✓', label: 'Healthy' },
			unhealthy: { color: 'preset-filled-error-500', icon: '✗', label: 'Unhealthy' },
			initializing: { color: 'preset-filled-primary-500', icon: '⟳', label: 'Initializing' },
			unknown: { color: 'preset-filled-surface-500', icon: '?', label: 'Unknown' }
		},
		Z = 5e3,
		fe = 3;
	let D = u('IDLE'),
		me = u(Ue({})),
		B = u(null),
		he = u(Ue(new Date().toISOString())),
		J = u(!0),
		y = u(!1),
		L = u(!1),
		E = u(0),
		N = u(!1),
		V = u(!1),
		f = null,
		Y = null;
	const Ge = _(() => (t(B) ? Date.now() - t(B) : 0)),
		U = _(() => Object.entries(t(me))),
		k = _(() => t(U).length),
		_e = _(() => t(U).filter(([e, a]) => a.status === 'healthy').length),
		ge = _(() => t(U).filter(([e, a]) => a.status === 'unhealthy').length),
		Pe = _(() => Ot(t(he), 'en', { hour: '2-digit', minute: '2-digit', second: '2-digit' })),
		ye = _(() => (typeof window < 'u' ? `${window.location.origin}/api/system?action=health` : '/api/system?action=health')),
		S = _(() => (t(k) > 0 ? Math.round((t(_e) / t(k)) * 100) : 0));
	(je(
		() => (
			(Y = jt.subscribe((e) => {
				(n(D, e.overallState, !0), n(me, e.services, !0), n(B, e.initializationStartedAt || null, !0), n(he, new Date().toISOString(), !0));
			})),
			() => {
				Y?.();
			}
		)
	),
		je(
			() => (
				t(J) && !t(y)
					? (f = setInterval(() => {
							z();
						}, Z))
					: f && (clearInterval(f), (f = null)),
				() => {
					f && (clearInterval(f), (f = null));
				}
			)
		));
	async function z() {
		if (!t(y)) {
			n(y, !0);
			try {
				const e = await fetch('/api/system?action=health', { method: 'GET', headers: { 'Content-Type': 'application/json' } });
				if (!e.ok) throw new Error(`Health check failed: ${e.status}`);
				n(E, 0);
			} catch (e) {
				(ue.error('Failed to fetch health:', e),
					t(E) < fe
						? (Dt(E), I(`Health check failed. Retrying... (${t(E)}/${fe})`, 'warning', 2e3), setTimeout(() => z(), 1e3 * Math.pow(2, t(E))))
						: (I('Failed to fetch system health after multiple retries', 'error', 5e3), n(E, 0)));
			} finally {
				n(y, !1);
			}
		}
	}
	async function Ze() {
		if (!(t(L) || !confirm('Are you sure you want to reinitialize the system? This may cause temporary downtime.'))) {
			n(L, !0);
			try {
				I('Reinitializing system...', 'warning');
				const a = await fetch('/api/system', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'reinitialize', force: !0 })
				});
				if (a.ok) {
					const o = await a.json();
					(I(o.message || `System reinitialized: ${o.status}`, 'success', 5e3), setTimeout(() => z(), 1e3));
				} else {
					const o = await a.json();
					throw new Error(o.error || 'Reinitialization failed');
				}
			} catch (a) {
				const o = a instanceof Error ? a.message : 'Unknown error';
				(ue.error('Reinitialization failed:', a), I(`Failed to reinitialize: ${o}`, 'error', 5e3));
			} finally {
				n(L, !1);
			}
		}
	}
	async function Be() {
		try {
			(await navigator.clipboard.writeText(t(ye)),
				n(V, !0),
				I('Endpoint copied to clipboard', 'success', 2e3),
				setTimeout(() => {
					n(V, !1);
				}, 2e3));
		} catch (e) {
			(ue.error('Failed to copy:', e), I('Failed to copy endpoint', 'error', 2e3));
		}
	}
	function Je(e) {
		return w[e]?.color || w.IDLE.color;
	}
	function Ve(e) {
		return w[e]?.icon || '❓';
	}
	function Ye(e) {
		return w[e]?.label || 'Unknown';
	}
	function Qe(e) {
		return g[e]?.color || g.unknown.color;
	}
	function Xe(e) {
		return g[e]?.icon || g.unknown.icon;
	}
	function qe(e) {
		return g[e]?.label || 'Unknown';
	}
	function Ke(e) {
		if (e <= 0) return '0s';
		const a = Math.floor(e / 1e3),
			o = Math.floor(a / 60),
			m = Math.floor(o / 60),
			T = Math.floor(m / 24);
		return T > 0 ? `${T}d ${m % 24}h` : m > 0 ? `${m}h ${o % 60}m` : o > 0 ? `${o}m ${a % 60}s` : `${a}s`;
	}
	function xe(e) {
		return (
			e.charAt(0).toUpperCase() +
			e
				.slice(1)
				.replace(/([A-Z])/g, ' $1')
				.trim()
		);
	}
	(Tt(() => {
		const e = window.matchMedia('(prefers-reduced-motion: reduce)');
		n(N, e.matches, !0);
		const a = (o) => {
			n(N, o.matches, !0);
		};
		return (
			e.addEventListener('change', a),
			z(),
			() => {
				e.removeEventListener('change', a);
			}
		);
	}),
		Ft(() => {
			(f && clearInterval(f), Y?.());
		}));
	var Q = Wt(),
		X = s(Q),
		q = s(X),
		A = s(q),
		We = s(A, !0);
	r(A);
	var be = i(A, 2),
		K = s(be),
		et = i(s(K));
	{
		var tt = (e) => {
			var a = Pt();
			c(e, a);
		};
		x(et, (e) => {
			t(y) && e(tt);
		});
	}
	r(K);
	var we = i(K, 2),
		W = i(s(we)),
		at = s(W, !0);
	(r(W), r(we), r(be), r(q));
	var Se = i(q, 2),
		ee = s(Se),
		Ie = s(ee);
	(Ht(Ie), ve(), r(ee));
	var C = i(ee, 2);
	C.__click = z;
	var rt = s(C);
	r(C);
	var j = i(C, 2);
	j.__click = Ze;
	var st = s(j);
	{
		var it = (e) => {
				var a = Zt();
				c(e, a);
			},
			ot = (e) => {
				var a = Bt();
				c(e, a);
			};
		x(st, (e) => {
			t(L) ? e(it) : e(ot, !1);
		});
	}
	(ve(), r(j), r(Se), r(X));
	var te = i(X, 2),
		ae = s(te),
		Ee = i(s(ae), 2),
		nt = s(Ee, !0);
	(r(Ee), r(ae));
	var re = i(ae, 2),
		ke = i(s(re), 2),
		lt = s(ke, !0);
	(r(ke), r(re));
	var se = i(re, 2),
		$e = i(s(se), 2),
		Re = s($e),
		De = i(Re),
		ct = s(De);
	(r(De), r($e), r(se));
	var Le = i(se, 2),
		ie = i(s(Le), 2),
		dt = s(ie);
	(r(ie), r(Le), r(te));
	var ze = i(te, 2);
	{
		var pt = (e) => {
			var a = Jt();
			(b(a, 'aria-valuemin', 0), b(a, 'aria-valuemax', 100));
			var o = s(a);
			(r(a),
				$(() => {
					(b(a, 'aria-valuenow', t(S)),
						R(o, 1, `h-full ${t(S) >= 80 ? 'bg-success-500' : t(S) >= 50 ? 'bg-warning-500' : 'bg-error-500'} transition-all duration-500`),
						Nt(o, `width: ${t(S) ?? ''}%`));
				}),
				c(e, a));
		};
		x(ze, (e) => {
			t(k) > 0 && e(pt);
		});
	}
	var oe = i(ze, 2),
		ne = s(oe),
		vt = i(s(ne), 2);
	{
		var ut = (e) => {
			var a = Vt(),
				o = s(a);
			(r(a), $(() => l(o, `${t(ge) ?? ''} unhealthy`)), c(e, a));
		};
		x(vt, (e) => {
			t(ge) > 0 && e(ut);
		});
	}
	r(ne);
	var ft = i(ne, 2);
	{
		var mt = (e) => {
				var a = Yt();
				c(e, a);
			},
			ht = (e) => {
				var a = Kt();
				(Mt(
					a,
					21,
					() => t(U),
					([o, m]) => o,
					(o, m) => {
						var T = _(() => zt(t(m), 2));
						let Me = () => t(T)[0],
							p = () => t(T)[1];
						var O = qt(),
							F = s(O),
							bt = s(F, !0);
						r(F);
						var He = i(F, 2),
							de = s(He),
							wt = s(de, !0);
						r(de);
						var G = i(de, 2),
							St = s(G, !0);
						r(G);
						var Ne = i(G, 2);
						{
							var It = (h) => {
								var v = Qt(),
									M = s(v);
								(r(v),
									$(() => {
										(b(v, 'title', p().error), l(M, `Error: ${p().error ?? ''}`));
									}),
									c(h, v));
							};
							x(Ne, (h) => {
								p().error && h(It);
							});
						}
						var Et = i(Ne, 2);
						{
							var kt = (h) => {
								var v = Xt(),
									M = s(v, !0);
								(r(v), $((pe) => l(M, pe), [() => new Date(p().lastChecked).toLocaleTimeString()]), c(h, v));
							};
							x(Et, (h) => {
								p().lastChecked && h(kt);
							});
						}
						(r(He),
							r(O),
							$(
								(h, v, M, pe, $t) => {
									(b(O, 'aria-label', h), R(F, 1, v), b(F, 'aria-label', M), l(bt, pe), l(wt, $t), b(G, 'title', p().message), l(St, p().message));
								},
								[
									() => `${xe(Me())} service status`,
									() => `badge ${Qe(p().status)} flex h-8 w-8 shrink-0 items-center justify-center text-lg`,
									() => qe(p().status),
									() => Xe(p().status),
									() => xe(Me())
								]
							),
							c(o, O));
					}
				),
					r(a),
					c(e, a));
			};
		x(ft, (e) => {
			t(k) === 0 ? e(mt) : e(ht, !1);
		});
	}
	r(oe);
	var Ae = i(oe, 2),
		Ce = s(Ae),
		Te = i(s(Ce), 2),
		Fe = i(s(Te), 2),
		le = s(Fe),
		_t = s(le, !0);
	r(le);
	var ce = i(le, 2);
	ce.__click = Be;
	var gt = s(ce);
	{
		var yt = (e) => {
				var a = Oe('✓');
				c(e, a);
			},
			xt = (e) => {
				var a = Oe('📋');
				c(e, a);
			};
		x(gt, (e) => {
			t(V) ? e(yt) : e(xt, !1);
		});
	}
	(r(ce),
		r(Fe),
		ve(2),
		r(Te),
		r(Ce),
		r(Ae),
		r(Q),
		$(
			(e, a, o, m) => {
				(R(A, 1, `text-3xl ${t(N) ? '' : 'transition-transform duration-300'}`),
					b(A, 'aria-label', e),
					l(We, a),
					R(W, 1, o),
					l(at, t(D)),
					(C.disabled = t(y)),
					R(rt, 1, `text-lg ${t(y) && !t(N) ? 'animate-spin' : ''}`),
					(j.disabled = t(L) || t(y)),
					l(nt, m),
					l(lt, t(Pe)),
					l(Re, `${t(k) ?? ''} `),
					l(ct, `(${t(_e) ?? ''}/${t(k) ?? ''})`),
					R(ie, 1, `text-lg font-bold ${t(S) >= 80 ? 'text-success-500' : t(S) >= 50 ? 'text-warning-500' : 'text-error-500'}`),
					l(dt, `${t(S) ?? ''}%`),
					l(_t, t(ye)));
			},
			[() => `System status: ${Ye(t(D))}`, () => Ve(t(D)), () => `font-bold ${Je(t(D))}`, () => Ke(t(Ge))]
		),
		Ut(
			Ie,
			() => t(J),
			(e) => n(J, e)
		),
		c(P, Q),
		Lt());
}
Ct(['click']);
var ta = d('<!> <div class="wrapper p-4"><!></div>', 1);
function fa(P) {
	var H = ta(),
		w = At(H);
	Gt(w, { name: 'System Health', showBackButton: !0, backUrl: '/config', icon: 'mdi:heart-pulse' });
	var g = i(w, 2),
		Z = s(g);
	(ea(Z, {}), r(g), c(P, H));
}
export { fa as component };
//# sourceMappingURL=12.BzqBkOZE.js.map
