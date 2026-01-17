import { i as y } from '../chunks/zi73tRJP.js';
import { p as se, c as e, t as A, r as t, s as i, a as le, n as h, g as a, f as j, d as lt, x as he, b as k, u as dt } from '../chunks/DrlZFkx8.js';
import { d as de, f as g, s as C, a as l, c as pt, t as ne } from '../chunks/CTjXDULS.js';
import { P as ke } from '../chunks/C6jjkVLf.js';
import { o as Ce } from '../chunks/CMZtchEj.js';
import { e as Kt, i as ce } from '../chunks/BXe5mj2j.js';
import { b as v, c as d, d as Bt, a as ve, r as Ae } from '../chunks/MEFvoR_D.js';
import { b as Te } from '../chunks/D4QnGYgQ.js';
import { l as Rt } from '../chunks/BvngfGKt.js';
import { w as Ee } from '../chunks/vkx2g0aB.js';
var Ie = g('<span class="badge preset-filled-primary-500">Core</span>'),
	Se = g('<span class="badge preset-filled-tertiary-500">Custom</span>'),
	We = g('<span class="badge preset-filled-success-500">Active</span>'),
	ze = g('<span class="badge preset-filled-surface-500">Inactive</span>'),
	De = g('<p class="text-sm text-surface-600 dark:text-surface-50 line-clamp-2"> </p>'),
	Fe = g(
		'<div class="flex items-center gap-4 pt-1 text-xs text-surface-500"><div class="flex items-center gap-1" title="Input Component"><iconify-icon></iconify-icon> <span>Input</span></div> <div class="flex items-center gap-1" title="Display Component"><iconify-icon></iconify-icon> <span>Display</span></div> <div class="flex items-center gap-1" title="Database/Validation"><iconify-icon></iconify-icon> <span>DB/Valid</span></div></div>',
		2
	),
	Le = g('<span class="badge variant-soft-secondary text-xs"> </span>'),
	Me = g('<div class="flex flex-wrap gap-1.5 pt-1"><span class="text-xs text-surface-500">Depends on:</span> <!></div>'),
	Oe = g('<button type="button"> </button>'),
	Ue = g('<span class="badge preset-tonal-surface">System</span>'),
	je = g('<span class="badge variant-soft-warning" title="Required by other widgets">Required</span>'),
	Pe = g('<button type="button" class="btn-icon btn-icon-sm variant-soft-error" title="Uninstall widget"><iconify-icon></iconify-icon></button>', 2),
	qe = g(
		'<div class="card border border-surface-200 dark:text-surface-50 transition-shadow hover:shadow-lg"><div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between"><div class="flex min-w-0 flex-1 items-start gap-4"><div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-100 text-surface-900 dark:bg-surface-800 dark:text-surface-100"><iconify-icon></iconify-icon></div> <div class="min-w-0 flex-1 space-y-2"><div class="flex flex-wrap items-center gap-2"><h3 class="text-lg font-bold text-surface-900 dark:text-surface-50"> </h3> <!> <!></div> <!> <!> <!></div></div> <div class="flex items-center gap-2 self-end sm:self-auto"><!> <!></div></div></div>',
		2
	);
function Be(ct, s) {
	se(s, !0);
	function m(o) {
		return o ? 'text-green-500' : 'text-gray-300 dark:text-gray-600';
	}
	var D = qe(),
		b = e(D),
		T = e(b),
		P = e(T),
		K = e(P);
	(A(() => v(K, 'icon', s.widget.icon)), d(K, 1, 'text-3xl'), t(P));
	var V = i(P, 2),
		Z = e(V),
		$ = e(Z),
		tt = e($, !0);
	t($);
	var E = i($, 2);
	{
		var yt = (o) => {
				var n = Ie();
				l(o, n);
			},
			et = (o) => {
				var n = Se();
				l(o, n);
			};
		y(E, (o) => {
			s.widget.isCore ? o(yt) : o(et, !1);
		});
	}
	var Ct = i(E, 2);
	{
		var At = (o) => {
				var n = We();
				l(o, n);
			},
			_t = (o) => {
				var n = ze();
				l(o, n);
			};
		y(Ct, (o) => {
			s.widget.isActive ? o(At) : o(_t, !1);
		});
	}
	t(Z);
	var vt = i(Z, 2);
	{
		var Tt = (o) => {
			var n = De(),
				u = e(n, !0);
			(t(n), A(() => C(u, s.widget.description)), l(o, n));
		};
		y(vt, (o) => {
			s.widget.description && o(Tt);
		});
	}
	var wt = i(vt, 2);
	{
		var Et = (o) => {
			var n = Fe(),
				u = e(n),
				W = e(u);
			(v(W, 'icon', 'mdi:form-textbox'), h(2), t(u));
			var I = i(u, 2),
				p = e(I);
			(v(p, 'icon', 'mdi:monitor-dashboard'), h(2), t(I));
			var S = i(I, 2),
				N = e(S);
			(v(N, 'icon', 'mdi:database-check'),
				h(2),
				t(S),
				t(n),
				A(
					(ut, X, ft) => {
						(d(W, 1, ut), d(p, 1, X), d(N, 1, ft));
					},
					[
						() => Bt(m(s.widget.pillar.input?.exists ?? !1)),
						() => Bt(m(s.widget.pillar.display?.exists ?? !1)),
						() => Bt(m(s.widget.hasValidation ?? !1))
					]
				),
				l(o, n));
		};
		y(wt, (o) => {
			s.widget.pillar && o(Et);
		});
	}
	var r = i(wt, 2);
	{
		var c = (o) => {
			var n = Me(),
				u = i(e(n), 2);
			(Kt(
				u,
				17,
				() => s.widget.dependencies,
				ce,
				(W, I) => {
					var p = Le(),
						S = e(p, !0);
					(t(p), A(() => C(S, a(I))), l(W, p));
				}
			),
				t(n),
				l(o, n));
		};
		y(r, (o) => {
			s.widget.dependencies && s.widget.dependencies.length > 0 && o(c);
		});
	}
	(t(V), t(T));
	var f = i(T, 2),
		Y = e(f);
	{
		var gt = (o) => {
				var n = Oe();
				n.__click = () => s.onToggle(s.widget.name);
				var u = e(n, !0);
				(t(n),
					A(() => {
						(ve(n, 'data-testid', `widget-toggle-${s.widget.name ?? ''}`),
							d(n, 1, `btn-sm ${s.widget.isActive ? 'preset-filled-error-500' : 'preset-filled-success-500'}`),
							C(u, s.widget.isActive ? 'Deactivate' : 'Activate'));
					}),
					l(o, n));
			},
			B = (o) => {
				var n = pt(),
					u = j(n);
				{
					var W = (p) => {
							var S = Ue();
							l(p, S);
						},
						I = (p) => {
							var S = pt(),
								N = j(S);
							{
								var ut = (X) => {
									var ft = je();
									l(X, ft);
								};
								y(
									N,
									(X) => {
										s.widget.canDisable || X(ut);
									},
									!0
								);
							}
							l(p, S);
						};
					y(
						u,
						(p) => {
							s.widget.isCore ? p(W) : p(I, !1);
						},
						!0
					);
				}
				l(o, n);
			};
		y(Y, (o) => {
			s.canManage && s.widget.canDisable ? o(gt) : o(B, !1);
		});
	}
	var R = i(Y, 2);
	{
		var J = (o) => {
			var n = Pe();
			n.__click = () => s.onUninstall?.(s.widget.name);
			var u = e(n);
			(v(u, 'icon', 'mdi:delete'), d(u, 1, 'text-lg'), t(n), l(o, n));
		};
		y(R, (o) => {
			s.canManage && !s.widget.isCore && !s.widget.isActive && s.onUninstall && o(J);
		});
	}
	(t(f), t(b), t(D), A(() => C(tt, s.widget.name)), l(ct, D), le());
}
de(['click']);
var Re = g(
		'<div class="flex items-center justify-center p-8"><div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div> <span class="ml-3 text-lg">Loading widgets...</span></div>'
	),
	Ke = g(
		'<div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:bg-red-900/20"><div class="flex items-start gap-3"><iconify-icon></iconify-icon> <div><h3 class="font-semibold text-red-800 dark:text-red-300">Error Loading Widgets</h3> <p class="text-red-700 dark:text-red-400"> </p> <button class="mt-2 rounded-lg bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700">Retry</button></div></div></div>',
		2
	),
	Ve = g(
		'<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:bg-amber-900/20"><div class="flex items-start gap-3"><iconify-icon></iconify-icon> <div><h3 class="font-semibold text-amber-800 dark:text-amber-300">Limited Access</h3> <p class="text-amber-700 dark:text-amber-400">You have read-only access to widget management. Contact your administrator to request widget management permissions.</p></div></div></div>',
		2
	),
	Ye = g(
		'<button class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" aria-label="Clear search" title="Clear search (Esc)"><iconify-icon></iconify-icon></button>',
		2
	),
	Je = g('<button><iconify-icon></iconify-icon> <span> </span> <span> </span></button>', 2),
	Ne = g('No widgets match your search "<strong> </strong>"', 1),
	Xe = g(
		'<button class="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" aria-label="Clear all filters and search"><iconify-icon></iconify-icon> Clear All Filters</button>',
		2
	),
	Qe = g(
		'<div class="col-span-full rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-12 text-center dark:border-gray-600 dark:bg-gray-800"><iconify-icon></iconify-icon> <h3 class="mt-4 text-lg font-semibold text-gray-900 dark:text-white">No Widgets Found</h3> <p class="mt-2 text-gray-600 dark:text-gray-400"><!></p> <!></div>',
		2
	),
	Ge = g(
		'<div class="grid grid-cols-2 gap-4 md:grid-cols-4" data-testid="widget-stats"><div class="relative rounded-lg bg-blue-50 p-4 shadow-sm transition-all hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"><button class="btn-icon btn-icon-sm absolute right-2 top-2 text-blue-600 dark:text-blue-400" aria-label="Information about total widgets" title="All registered widgets in the system (core + custom)"><iconify-icon></iconify-icon></button> <div class="flex items-center gap-3"><iconify-icon></iconify-icon> <div><h3 class="font-semibold text-blue-800 dark:text-blue-300">Total</h3> <p class="text-2xl font-bold text-blue-600 dark:text-blue-400"> </p></div></div></div> <div class="relative rounded-lg bg-green-50 p-4 shadow-sm transition-all hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/30"><button class="btn-icon btn-icon-sm absolute right-2 top-2 text-primary-500" aria-label="Information about active widgets" title="Widgets currently enabled and available for use in collections"><iconify-icon></iconify-icon></button> <div class="flex items-center gap-3"><iconify-icon></iconify-icon> <div><h3 class="font-semibold text-primary-500">Active</h3> <p class="text-2xl font-bold text-primary-500"> </p></div></div></div> <div class="relative rounded-lg bg-blue-50 p-4 shadow-sm transition-all hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/30"><button class="btn-icon btn-icon-sm absolute right-2 top-2 text-blue-600 dark:text-blue-400" aria-label="Information about core widgets" title="Essential system widgets that are always active and cannot be disabled"><iconify-icon></iconify-icon></button> <div class="flex items-center gap-3"><iconify-icon></iconify-icon> <div><h3 class="font-semibold text-blue-800 dark:text-blue-300">Core</h3> <p class="text-2xl font-bold text-blue-600 dark:text-blue-400"> </p></div></div></div> <div class="relative rounded-lg bg-yellow-50 p-4 shadow-sm transition-all hover:bg-yellow-100 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30"><button class="btn-icon btn-icon-sm absolute right-2 top-2 text-yellow-600 dark:text-yellow-400" aria-label="Information about custom widgets" title="Optional widgets that can be toggled on/off as needed"><iconify-icon></iconify-icon></button> <div class="flex items-center gap-3"><iconify-icon></iconify-icon> <div><h3 class="font-semibold text-yellow-800 dark:text-yellow-300">Custom</h3> <p class="text-2xl font-bold text-yellow-600 dark:text-yellow-400"> </p></div></div></div></div> <div class="card preset-filled-surface-500 mt-6 space-y-4 p-4"><div class="flex flex-col gap-3 sm:flex-row sm:items-center"><div class="relative flex-1"><iconify-icon></iconify-icon> <input type="text" placeholder="Search widgets... (Ctrl+F)" class="input py-2 pl-10 pr-10 dark:text-white"/> <!></div></div> <div class="flex flex-wrap gap-2"></div></div> <div class="mb-12 grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="widget-grid"><!></div>',
		3
	),
	He = g(
		`<div class="rounded-lg border border-gray-200 bg-gray-50 p-12 text-center dark:border-gray-700 dark:bg-gray-800"><div class="mx-auto max-w-md"><iconify-icon></iconify-icon> <h3 class="mt-4 text-xl font-semibold text-gray-900 dark:text-white">Marketplace Coming Soon</h3> <p class="mt-2 text-gray-600 dark:text-gray-400">The Widget Marketplace will allow you to discover, install, and manage premium and community widgets to extend your SveltyCMS
						functionality.</p> <div class="mt-6 space-y-2 text-left"><div class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400"><iconify-icon></iconify-icon> <span>Browse hundreds of widgets across multiple categories</span></div> <div class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400"><iconify-icon></iconify-icon> <span>One-click installation and automatic updates</span></div> <div class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400"><iconify-icon></iconify-icon> <span>Community ratings and reviews</span></div> <div class="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400"><iconify-icon></iconify-icon> <span>Support for both free and premium widgets</span></div></div> <button disabled class="mt-6 cursor-not-allowed rounded-lg bg-gray-300 px-6 py-3 font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-500">Coming in Future Update</button></div></div>`,
		2
	),
	Ze = g(
		'<!> <div class="flex gap-2 border-b border-gray-200 dark:border-gray-700"><button><div class="flex items-center gap-2"><iconify-icon></iconify-icon> <span>Installed Widgets</span></div></button> <button><div class="flex items-center gap-2"><iconify-icon></iconify-icon> <span>Marketplace</span> <span class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">Coming Soon</span></div></button></div> <!>',
		3
	),
	$e = g(
		'<div class="wrapper h-full max-h-screen space-y-6 overflow-y-auto p-4 pb-16"><!></div> <div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="totalTooltip"><p class="text-sm">All registered widgets in the system (core + custom)</p> <div class="preset-filled arrow"></div></div> <div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="activeTooltip"><p class="text-sm">Widgets currently enabled and available for use in collections</p> <div class="preset-filled arrow"></div></div> <div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="coreTooltip"><p class="text-sm">Essential system widgets that are always active and cannot be disabled</p> <div class="preset-filled arrow"></div></div> <div class="card preset-filled z-50 max-w-xs p-3 shadow-xl" data-popup="customTooltip"><p class="text-sm">Optional widgets that can be toggled on/off as needed</p> <div class="preset-filled arrow"></div></div>',
		1
	);
function ta(ct, s) {
	se(s, !0);
	let m = lt(he([])),
		D = lt(!0),
		b = lt(''),
		T = lt('all'),
		P = lt('installed'),
		K = lt(null);
	const V = dt(() => s.data?.user?.tenantId || s.data?.tenantId || 'default-tenant'),
		Z = dt(() => s.data?.user?.role || 'user'),
		$ = dt(() => s.data?.user?.permissions || []),
		tt = dt(() => a(Z) === 'admin' || a(Z) === 'super-admin' || a($).includes('manage_widgets') || a($).includes('widget_management')),
		E = dt(() => ({
			total: a(m).length,
			core: a(m).filter((r) => r.isCore).length,
			custom: a(m).filter((r) => !r.isCore).length,
			active: a(m).filter((r) => r.isActive).length,
			inactive: a(m).filter((r) => !r.isActive).length,
			withInput: a(m).filter((r) => r.pillar?.input?.exists).length,
			withDisplay: a(m).filter((r) => r.pillar?.display?.exists).length
		})),
		yt = dt(() =>
			a(m).filter((r) => {
				const c = a(b) === '' || r.name.toLowerCase().includes(a(b).toLowerCase()) || r.description?.toLowerCase().includes(a(b).toLowerCase());
				let f = !1;
				switch (a(T)) {
					case 'all':
						f = !0;
						break;
					case 'core':
						f = r.isCore;
						break;
					case 'custom':
						f = !r.isCore;
						break;
					case 'active':
						f = r.isActive;
						break;
					case 'inactive':
						f = !r.isActive;
						break;
				}
				return c && f;
			})
		);
	Ce(() => {
		et();
		const r = (c) => {
			((c.ctrlKey || c.metaKey) && c.key === 'f' && (c.preventDefault(), document.querySelector('input[type="text"]')?.focus()),
				c.key === 'Escape' && a(b) && k(b, ''));
		};
		return (
			window.addEventListener('keydown', r),
			() => {
				window.removeEventListener('keydown', r);
			}
		);
	});
	async function et() {
		(k(D, !0), k(K, null));
		try {
			const r = await fetch(`/api/widgets/list?tenantId=${a(V)}`);
			if (!r.ok) throw new Error(`Failed to load widgets: ${r.statusText}`);
			const c = await r.json();
			(k(m, c.widgets || [], !0),
				console.info('Loaded widgets:', {
					total: a(m).length,
					core: a(m).filter((f) => f.isCore).length,
					custom: a(m).filter((f) => !f.isCore).length
				}));
		} catch (r) {
			(k(K, r instanceof Error ? r.message : 'Failed to load widgets', !0), Rt.error('Error loading widgets:', r));
		} finally {
			k(D, !1);
		}
	}
	async function Ct(r) {
		if (!a(tt)) {
			alert('You do not have permission to manage widgets. Contact your administrator.');
			return;
		}
		try {
			const c = a(m).find((gt) => gt.name === r);
			if (!c) return;
			const f = !c.isActive,
				Y = await fetch('/api/widgets/status', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': a(V) },
					body: JSON.stringify({ widgetName: r, isActive: f })
				});
			if (!Y.ok) throw new Error(`Failed to update widget status: ${Y.statusText}`);
			(await Ee.initializeWidgets(a(V)), await et(), console.info(`Widget ${r} ${f ? 'activated' : 'deactivated'} - Store and UI refreshed`));
		} catch (c) {
			const f = c instanceof Error ? c.message : 'Failed to update widget status';
			(Rt.error('Error toggling widget:', c), alert(`Error: ${f}`));
		}
	}
	async function At(r) {
		if (!a(tt)) {
			alert('You do not have permission to uninstall widgets. Contact your administrator.');
			return;
		}
		if (confirm(`Are you sure you want to uninstall the widget "${r}"?`))
			try {
				const c = await fetch('/api/widgets/uninstall', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', 'X-Tenant-ID': a(V) },
					body: JSON.stringify({ widgetName: r })
				});
				if (!c.ok) throw new Error(`Failed to uninstall widget: ${c.statusText}`);
				(await et(), console.info(`Widget ${r} uninstalled`));
			} catch (c) {
				const f = c instanceof Error ? c.message : 'Failed to uninstall widget';
				(Rt.error('Error uninstalling widget:', c), alert(`Error: ${f}`));
			}
	}
	var _t = $e(),
		vt = j(_t),
		Tt = e(vt);
	{
		var wt = (r) => {
				var c = Re();
				l(r, c);
			},
			Et = (r) => {
				var c = pt(),
					f = j(c);
				{
					var Y = (B) => {
							var R = Ke(),
								J = e(R),
								o = e(J);
							(v(o, 'icon', 'mdi:alert-circle'), d(o, 1, 'mt-1 text-xl text-red-600'));
							var n = i(o, 2),
								u = i(e(n), 2),
								W = e(u, !0);
							t(u);
							var I = i(u, 2);
							((I.__click = () => et()), t(n), t(J), t(R), A(() => C(W, a(K))), l(B, R));
						},
						gt = (B) => {
							var R = Ze(),
								J = j(R);
							{
								var o = (F) => {
									var L = Ve(),
										q = e(L),
										M = e(q);
									(v(M, 'icon', 'mdi:shield-alert'), d(M, 1, 'mt-1 text-xl text-amber-600'), h(2), t(q), t(L), l(F, L));
								};
								y(J, (F) => {
									a(tt) || F(o);
								});
							}
							var n = i(J, 2),
								u = e(n);
							u.__click = () => k(P, 'installed');
							var W = e(u),
								I = e(W);
							(v(I, 'icon', 'mdi:puzzle'), d(I, 1, 'text-xl'), h(2), t(W), t(u));
							var p = i(u, 2);
							p.__click = () => k(P, 'marketplace');
							var S = e(p),
								N = e(S);
							(v(N, 'icon', 'mdi:store'), d(N, 1, 'text-xl'), h(4), t(S), t(p), t(n));
							var ut = i(n, 2);
							{
								var X = (F) => {
										var L = Ge(),
											q = j(L),
											M = e(q),
											at = e(M),
											it = e(at);
										(v(it, 'icon', 'mdi:information-outline'), d(it, 1, 'text-lg'), t(at));
										var mt = i(at, 2),
											Q = e(mt);
										(v(Q, 'icon', 'mdi:widgets'), d(Q, 1, 'text-2xl text-blue-600 dark:text-blue-400'));
										var xt = i(Q, 2),
											rt = i(e(xt), 2),
											ht = e(rt, !0);
										(t(rt), t(xt), t(mt), t(M));
										var ot = i(M, 2),
											nt = e(ot),
											Vt = e(nt);
										(v(Vt, 'icon', 'mdi:information-outline'), d(Vt, 1, 'text-lg'), t(nt));
										var Yt = i(nt, 2),
											It = e(Yt);
										(v(It, 'icon', 'mdi:check-circle'), d(It, 1, 'text-2xl text-primary-500'));
										var Jt = i(It, 2),
											Nt = i(e(Jt), 2),
											ge = e(Nt, !0);
										(t(Nt), t(Jt), t(Yt), t(ot));
										var St = i(ot, 2),
											Wt = e(St),
											Xt = e(Wt);
										(v(Xt, 'icon', 'mdi:information-outline'), d(Xt, 1, 'text-lg'), t(Wt));
										var Qt = i(Wt, 2),
											zt = e(Qt);
										(v(zt, 'icon', 'mdi:puzzle'), d(zt, 1, 'text-2xl text-blue-600 dark:text-blue-400'));
										var Gt = i(zt, 2),
											Ht = i(e(Gt), 2),
											ue = e(Ht, !0);
										(t(Ht), t(Gt), t(Qt), t(St));
										var Zt = i(St, 2),
											Dt = e(Zt),
											$t = e(Dt);
										(v($t, 'icon', 'mdi:information-outline'), d($t, 1, 'text-lg'), t(Dt));
										var te = i(Dt, 2),
											Ft = e(te);
										(v(Ft, 'icon', 'mdi:puzzle-plus'), d(Ft, 1, 'text-2xl text-yellow-600 dark:text-yellow-400'));
										var ee = i(Ft, 2),
											ae = i(e(ee), 2),
											fe = e(ae, !0);
										(t(ae), t(ee), t(te), t(Zt), t(q));
										var Lt = i(q, 2),
											Mt = e(Lt),
											ie = e(Mt),
											Ot = e(ie);
										(v(Ot, 'icon', 'mdi:magnify'), d(Ot, 1, 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400'));
										var Ut = i(Ot, 2);
										Ae(Ut);
										var me = i(Ut, 2);
										{
											var xe = (w) => {
												var x = Ye();
												x.__click = () => k(b, '');
												var _ = e(x);
												(v(_, 'icon', 'mdi:close-circle'), d(_, 1, 'text-lg'), t(x), l(w, x));
											};
											y(me, (w) => {
												a(b) && w(xe);
											});
										}
										(t(ie), t(Mt));
										var re = i(Mt, 2);
										(Kt(
											re,
											21,
											() => [
												{ value: 'all', label: 'All', count: a(E).total, icon: 'mdi:widgets' },
												{ value: 'active', label: 'Active', count: a(E).active, icon: 'mdi:check-circle' },
												{ value: 'inactive', label: 'Inactive', count: a(E).inactive, icon: 'mdi:pause-circle' },
												{ value: 'core', label: 'Core', count: a(E).core, icon: 'mdi:puzzle' },
												{ value: 'custom', label: 'Custom', count: a(E).custom, icon: 'mdi:puzzle-plus' }
											],
											ce,
											(w, x) => {
												var _ = Je();
												_.__click = () => k(T, a(x).value, !0);
												var z = e(_);
												(A(() => v(z, 'icon', a(x).icon)), d(z, 1, 'text-lg'));
												var G = i(z, 2),
													jt = e(G, !0);
												t(G);
												var bt = i(G, 2),
													Pt = e(bt, !0);
												(t(bt),
													t(_),
													A(() => {
														(d(_, 1, `btn ${a(T) === a(x).value ? 'preset-filled-tertiary-500 text-white' : 'preset-ghost-secondary-500 '}`),
															ve(_, 'aria-label', `${a(x).label ?? ''} widgets (${a(x).count ?? ''})`),
															C(jt, a(x).label),
															d(
																bt,
																1,
																`rounded-full px-2 py-0.5 text-xs font-semibold ${a(T) === a(x).value ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-300'}`
															),
															C(Pt, a(x).count));
													}),
													l(w, _));
											}
										),
											t(re),
											t(Lt));
										var oe = i(Lt, 2),
											be = e(oe);
										{
											var pe = (w) => {
													var x = Qe(),
														_ = e(x);
													(v(_, 'icon', 'mdi:package-preset-closed'), d(_, 1, 'mx-auto text-6xl text-gray-400'));
													var z = i(_, 4),
														G = e(z);
													{
														var jt = (O) => {
																var U = Ne(),
																	H = i(j(U)),
																	qt = e(H, !0);
																(t(H), h(), A(() => C(qt, a(b))), l(O, U));
															},
															bt = (O) => {
																var U = pt(),
																	H = j(U);
																{
																	var qt = (st) => {
																			var kt = ne();
																			(A(() => C(kt, `No ${a(T) ?? ''} widgets available`)), l(st, kt));
																		},
																		we = (st) => {
																			var kt = ne('No widgets match your criteria');
																			l(st, kt);
																		};
																	y(
																		H,
																		(st) => {
																			a(T) !== 'all' ? st(qt) : st(we, !1);
																		},
																		!0
																	);
																}
																l(O, U);
															};
														y(G, (O) => {
															a(b) ? O(jt) : O(bt, !1);
														});
													}
													t(z);
													var Pt = i(z, 2);
													{
														var _e = (O) => {
															var U = Xe();
															U.__click = () => {
																(k(b, ''), k(T, 'all'));
															};
															var H = e(U);
															(v(H, 'icon', 'mdi:filter-remove'), d(H, 1, 'text-lg'), h(), t(U), l(O, U));
														};
														y(Pt, (O) => {
															(a(b) || a(T) !== 'all') && O(_e);
														});
													}
													(t(x), l(w, x));
												},
												ye = (w) => {
													var x = pt(),
														_ = j(x);
													(Kt(
														_,
														17,
														() => a(yt),
														(z) => z.name,
														(z, G) => {
															Be(z, {
																get widget() {
																	return a(G);
																},
																onToggle: Ct,
																onUninstall: At,
																get canManage() {
																	return a(tt);
																}
															});
														}
													),
														l(w, x));
												};
											y(be, (w) => {
												a(yt).length === 0 ? w(pe) : w(ye, !1);
											});
										}
										(t(oe),
											A(() => {
												(C(ht, a(E).total), C(ge, a(E).active), C(ue, a(E).core), C(fe, a(E).custom));
											}),
											Te(
												Ut,
												() => a(b),
												(w) => k(b, w)
											),
											l(F, L));
									},
									ft = (F) => {
										var L = He(),
											q = e(L),
											M = e(q);
										(v(M, 'icon', 'mdi:store'), d(M, 1, 'mx-auto text-6xl text-tertiary-500 dark:text-primary-500'));
										var at = i(M, 6),
											it = e(at),
											mt = e(it);
										(v(mt, 'icon', 'mdi:check-circle'), d(mt, 1, 'mt-0.5 text-tertiary-500 dark:text-primary-500'), h(2), t(it));
										var Q = i(it, 2),
											xt = e(Q);
										(v(xt, 'icon', 'mdi:check-circle'), d(xt, 1, 'mt-0.5 text-tertiary-500 dark:text-primary-500'), h(2), t(Q));
										var rt = i(Q, 2),
											ht = e(rt);
										(v(ht, 'icon', 'mdi:check-circle'), d(ht, 1, 'mt-0.5 text-tertiary-500 dark:text-primary-500'), h(2), t(rt));
										var ot = i(rt, 2),
											nt = e(ot);
										(v(nt, 'icon', 'mdi:check-circle'),
											d(nt, 1, 'mt-0.5 text-tertiary-500 dark:text-primary-500'),
											h(2),
											t(ot),
											t(at),
											h(2),
											t(q),
											t(L),
											l(F, L));
									};
								y(ut, (F) => {
									a(P) === 'installed' ? F(X) : F(ft, !1);
								});
							}
							(A(() => {
								(d(
									u,
									1,
									`border-b-2 px-6 py-3 font-medium transition-colors ${a(P) === 'installed' ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'}`
								),
									d(
										p,
										1,
										`border-b-2 px-6 py-3 font-medium transition-colors ${a(P) === 'marketplace' ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'}`
									));
							}),
								l(B, R));
						};
					y(
						f,
						(B) => {
							a(K) ? B(Y) : B(gt, !1);
						},
						!0
					);
				}
				l(r, c);
			};
		y(Tt, (r) => {
			a(D) ? r(wt) : r(Et, !1);
		});
	}
	(t(vt), h(8), l(ct, _t), le());
}
de(['click']);
var ea = g('<!> <!>', 1);
function ga(ct, s) {
	var m = ea(),
		D = j(m);
	ke(D, { name: 'Widget Management', icon: 'mdi:widgets', showBackButton: !0, backUrl: '/config' });
	var b = i(D, 2);
	(ta(b, {
		get data() {
			return s.data;
		}
	}),
		l(ct, m));
}
export { ga as component };
//# sourceMappingURL=15.BkKp4AUv.js.map
