import { i as k } from '../chunks/zi73tRJP.js';
import { o as De } from '../chunks/CMZtchEj.js';
import { p as He, f as L, s as n, c as i, a as Ye, b as T, d as A, r, t as R, g as e, n as E, u as xe, e as Ge } from '../chunks/DrlZFkx8.js';
import { d as Ke, f as u, a as l, c as re, s as S } from '../chunks/CTjXDULS.js';
import { k as Qe } from '../chunks/Bo6_hfUt.js';
import { e as V, i as z } from '../chunks/BXe5mj2j.js';
import { t as B, f as We, s as D } from '../chunks/0XeaN6pZ.js';
import { c as I, b, d as ie } from '../chunks/MEFvoR_D.js';
import { s as O } from '../chunks/BSPmpUse.js';
import { P as Xe } from '../chunks/C6jjkVLf.js';
var Ze = u('<button> </button>'),
	et = u('<li><strong> </strong> </li>'),
	tt = u(
		'<div class="alert preset-filled-error-500 my-4 p-4"><h4 class="font-bold">Sync Blocked: Unmet Requirements</h4> <p class="text-sm">The following requirements must be met before you can import configuration:</p> <ul class="mt-2 list-disc pl-5 text-sm"></ul></div>'
	),
	at = u(
		'<div class="flex animate-pulse flex-col items-center py-12 text-surface-500"><iconify-icon></iconify-icon> Checking synchronization status... <button class="preset-filled-tertiary-500 btn mt-6 flex items-center gap-2 dark:preset-filled-primary-500"><iconify-icon></iconify-icon> </button></div>',
		2
	),
	rt = u(
		'<div class="space-y-3 py-12 text-center"><iconify-icon></iconify-icon> <h2 class="text-xl font-semibold">System is in Sync</h2> <p class="text-surface-500">Your database and filesystem configurations match perfectly.</p></div>',
		2
	),
	it = u('<span class="preset-filled-success-500 badge">New</span>'),
	nt = u('<span class="variant-filled-warning badge">Updated</span>'),
	st = u('<span class="preset-filled-error-500 badge">Deleted</span>'),
	ot = u(
		'<tr class="border-t border-surface-200 hover:bg-surface-50 dark:text-surface-50 dark:hover:bg-surface-800/50"><td> </td><td><span class="preset-tonal badge capitalize"> </span></td><td><!> <!> <!></td></tr>'
	),
	ct = u(
		'<div class="space-y-4"><h3 class="flex items-center gap-2 text-lg font-semibold"><iconify-icon></iconify-icon> Changes Detected</h3> <p class="text-surface-500"> </p> <div class="overflow-hidden border border-surface-200 dark:text-surface-50"><table class="table w-full text-sm"><thead class="bg-surface-100 dark:bg-surface-800"><tr><th>Name</th><th>Type</th><th>Change</th></tr></thead><tbody></tbody></table></div></div>',
		2
	),
	lt = u(
		'<!> <div class="my-4"><button class="preset-filled-tertiary-500 btn w-full dark:preset-filled-primary-500 sm:w-auto"><iconify-icon></iconify-icon> </button></div> <!>',
		3
	),
	dt = u(
		'<div class="rounded border bg-surface-50 p-4 dark:bg-surface-900/40"><h3 class="mb-3 flex items-center gap-2 font-semibold"><iconify-icon></iconify-icon> Import Configuration from File</h3> <p class="mb-4 text-sm text-surface-500">Upload a JSON or CSV file containing configuration changes to apply them to the database.</p> <div class="flex flex-col gap-4"><input type="file" class="input" accept=".json,.csv"/> <button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"><iconify-icon></iconify-icon> </button></div></div>',
		2
	),
	ft = u(
		'<div class="rounded border bg-surface-50 p-4 dark:bg-surface-900/40"><h3 class="mb-3 flex items-center gap-2 font-semibold"><iconify-icon></iconify-icon> Export Configuration</h3> <p class="mb-4 text-sm text-surface-500">Save the detected configuration changes to a file.</p> <div class="flex gap-4"><button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"><iconify-icon></iconify-icon> Export as JSON</button> <button class="variant-filled-secondary btn"><iconify-icon></iconify-icon> Export as CSV</button></div></div>',
		2
	),
	ut = u(
		'<div class="rounded border bg-surface-50 p-4 dark:bg-surface-900/40"><h3 class="mb-3 flex items-center gap-2 font-semibold"><iconify-icon></iconify-icon> Raw API Response</h3> <pre class="whitespace-pre-wrap text-xs"> </pre></div>',
		2
	),
	vt = u(
		`<!> <div class="wrapper"><div class="preset-tonal-surface mb-4 p-4"><p class="text-surface-600 dark:text-surface-300">This tool manages the synchronization between configuration defined in the filesystem (the "source of truth") and the configuration active in
			the database. Use it to deploy structural changes between different environments (e.g., from development to live).</p></div> <div class="flex w-full overflow-x-auto border border-surface-300 bg-surface-100/70 dark:text-surface-50 dark:bg-surface-800/70"></div> <section><!> <!> <!> <!></section></div>`,
		1
	);
function St(we, ke) {
	He(ke, !0);
	let c = A(null),
		J = A(!0),
		x = A(!1),
		g = A('sync');
	const H = xe(() => () => ({
		new: e(c)?.changes?.new?.length || 0,
		updated: e(c)?.changes?.updated?.length || 0,
		deleted: e(c)?.changes?.deleted?.length || 0
	}));
	async function Y() {
		T(J, !0);
		try {
			const a = await fetch('/api/config_sync');
			if (!a.ok) throw new Error(`HTTP ${a.status}`);
			(T(c, await a.json(), !0), console.debug('[Config Sync] Received status:', e(c)));
		} catch (a) {
			const t = a instanceof Error ? a.message : String(a);
			(O(`Failed to fetch status: ${t}`, 'error'), T(c, null));
		} finally {
			T(J, !1);
		}
	}
	let q = A(null);
	function Se(a) {
		const t = a.target;
		T(q, t.files ? t.files[0] : null, !0);
	}
	async function ne() {
		if (!e(c) || e(c).unmetRequirements.length > 0) {
			O('Sync blocked due to unmet requirements.', 'warning');
			return;
		}
		T(x, !0);
		try {
			const a = { action: 'import' };
			if (e(q)) {
				const d = await e(q).text();
				((a.payload = JSON.parse(d)), O(`Importing from file: ${e(q).name}`, 'info'));
			} else O('No file selected, performing standard filesystem sync.', 'info');
			const t = await fetch('/api/config_sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(a) }),
				s = await t.json();
			if (!t.ok) throw new Error(s.message || `HTTP ${t.status}`);
			(O(s.message || 'Sync successful!', 'success'), await Y());
		} catch (a) {
			const t = a instanceof Error ? a.message : String(a);
			O(`Sync failed: ${t}`, 'error');
		} finally {
			(T(x, !1), T(q, null));
		}
	}
	function Ce() {
		if (!e(c) || !e(c).changes) {
			O('No changes to export.', 'warning');
			return;
		}
		const a = JSON.stringify(e(c).changes, null, 2),
			t = new Blob([a], { type: 'application/json' }),
			s = URL.createObjectURL(t),
			d = document.createElement('a');
		((d.href = s),
			(d.download = `svelty-config-changes-${new Date().toISOString()}.json`),
			document.body.appendChild(d),
			d.click(),
			document.body.removeChild(d),
			URL.revokeObjectURL(s),
			O('Configuration changes exported to JSON.', 'success'));
	}
	function Te() {
		O('CSV export is not yet implemented.', 'info');
	}
	function Re() {
		ne();
	}
	De(() => {
		Y();
	});
	var se = vt(),
		oe = L(se);
	Xe(oe, { name: 'Configuration Manager', icon: 'mdi:sync-circle', showBackButton: !0, backUrl: '/config' });
	var ce = n(oe, 2),
		G = n(i(ce), 2);
	(V(
		G,
		20,
		() => ['sync', 'import', 'export', 'debug'],
		z,
		(a, t) => {
			var s = re(),
				d = L(s);
			(Qe(
				d,
				() => t,
				(v) => {
					var o = Ze();
					let f;
					o.__click = () => T(g, t, !0);
					var p = i(o, !0);
					(r(o),
						R(
							(U) => {
								((f = I(o, 1, 'flex-1 py-3 text-center text-sm font-medium transition-all duration-200', null, f, {
									'!bg-tertiary-500': e(g) === t,
									'!text-white': e(g) === t,
									'!dark:bg-primary-500': e(g) === t,
									'!dark:text-surface-900': e(g) === t,
									'dark:text-surface-200': e(g) !== t,
									'text-surface-700': e(g) !== t
								})),
									S(p, U));
							},
							[() => t.charAt(0).toUpperCase() + t.slice(1)]
						),
						l(v, o));
				}
			),
				l(a, s));
		}
	),
		r(G));
	var K = n(G, 2),
		le = i(K);
	{
		var Oe = (a) => {
			var t = lt(),
				s = L(t);
			{
				var d = (w) => {
					var _ = tt(),
						N = n(i(_), 4);
					(V(
						N,
						21,
						() => e(c).unmetRequirements,
						z,
						($, C) => {
							var m = et(),
								y = i(m),
								j = i(y, !0);
							r(y);
							var F = n(y);
							(r(m),
								R(() => {
									(S(j, e(C).name), S(F, ` (${e(C).type ?? ''}): ${e(C).requirement ?? ''}`));
								}),
								l($, m));
						}
					),
						r(N),
						r(_),
						B(3, _, () => D),
						l(w, _));
				};
				k(s, (w) => {
					e(c)?.unmetRequirements && e(c).unmetRequirements.length > 0 && w(d);
				});
			}
			var v = n(s, 2),
				o = i(v);
			o.__click = Re;
			var f = i(o);
			b(f, 'icon', 'mdi:sync');
			var p = n(f);
			(r(o), r(v));
			var U = n(v, 2);
			{
				var Ee = (w) => {
						var _ = at(),
							N = i(_);
						(b(N, 'icon', 'mdi:sync'), I(N, 1, 'mb-3 animate-spin text-5xl'));
						var $ = n(N, 2);
						$.__click = Y;
						var C = i($);
						b(C, 'icon', 'mdi:refresh');
						var m = n(C);
						(r($),
							r(_),
							R(() => {
								(($.disabled = e(J)), I(C, 1, ie(e(J) ? 'animate-spin' : '')), S(m, ` ${e(J) ? 'Checking...' : 'Refresh'}`));
							}),
							l(w, _));
					},
					Ie = (w) => {
						var _ = re(),
							N = L(_);
						{
							var $ = (m) => {
									var y = rt(),
										j = i(y);
									(b(j, 'icon', 'mdi:check-circle'), I(j, 1, 'mx-auto text-6xl text-success-500'), E(4), r(y), l(m, y));
								},
								C = (m) => {
									var y = ct(),
										j = i(y),
										F = i(j);
									(b(F, 'icon', 'mdi:alert'), I(F, 1, 'text-warning-500'), E(), r(j));
									var Q = n(j, 2),
										Je = i(Q);
									r(Q);
									var ue = n(Q, 2),
										ve = i(ue),
										pe = n(i(ve));
									(V(
										pe,
										21,
										() => Object.entries(e(c)?.changes || {}),
										z,
										(W, X) => {
											var M = xe(() => Ge(e(X), 2));
											let Z = () => e(M)[0],
												qe = () => e(M)[1];
											var me = re(),
												Pe = L(me);
											(V(Pe, 17, qe, z, (Le, ge) => {
												var ee = ot(),
													te = i(ee),
													Ae = i(te, !0);
												r(te);
												var ae = n(te),
													_e = i(ae),
													Be = i(_e, !0);
												(r(_e), r(ae));
												var ye = n(ae),
													he = i(ye);
												{
													var Fe = (h) => {
														var P = it();
														l(h, P);
													};
													k(he, (h) => {
														Z() === 'new' && h(Fe);
													});
												}
												var be = n(he, 2);
												{
													var Me = (h) => {
														var P = nt();
														l(h, P);
													};
													k(be, (h) => {
														Z() === 'updated' && h(Me);
													});
												}
												var Ve = n(be, 2);
												{
													var ze = (h) => {
														var P = st();
														l(h, P);
													};
													k(Ve, (h) => {
														Z() === 'deleted' && h(ze);
													});
												}
												(r(ye),
													r(ee),
													R(() => {
														(S(Ae, e(ge).name), S(Be, e(ge).type));
													}),
													l(Le, ee));
											}),
												l(W, me));
										}
									),
										r(pe),
										r(ve),
										r(ue),
										r(y),
										R(
											(W, X, M) => S(Je, `${W ?? ''} new, ${X ?? ''} updated, ${M ?? ''} deleted.`),
											[() => e(H)().new, () => e(H)().updated, () => e(H)().deleted]
										),
										l(m, y));
								};
							k(
								N,
								(m) => {
									e(c)?.status === 'in_sync' ? m($) : m(C, !1);
								},
								!0
							);
						}
						l(w, _);
					};
				k(U, (w) => {
					e(J) ? w(Ee) : w(Ie, !1);
				});
			}
			(R(() => {
				((o.disabled = e(x) || !e(c) || e(c).status === 'in_sync' || e(c).unmetRequirements.length > 0),
					I(f, 1, ie(e(x) ? 'animate-spin' : '')),
					S(p, ` ${e(x) ? 'Syncing...' : 'Sync All Changes'}`));
			}),
				l(a, t));
		};
		k(le, (a) => {
			e(g) === 'sync' && a(Oe);
		});
	}
	var de = n(le, 2);
	{
		var Ne = (a) => {
			var t = dt(),
				s = i(t),
				d = i(s);
			(b(d, 'icon', 'mdi:database-import-outline'), E(), r(s));
			var v = n(s, 4),
				o = i(v);
			o.__change = Se;
			var f = n(o, 2);
			f.__click = ne;
			var p = i(f);
			b(p, 'icon', 'mdi:upload');
			var U = n(p);
			(r(f),
				r(v),
				r(t),
				R(() => {
					((f.disabled = !e(q) || e(x)), I(p, 1, ie(e(x) ? 'animate-spin' : '')), S(U, ` ${e(x) ? 'Importing...' : 'Import from File'}`));
				}),
				B(3, t, () => D),
				l(a, t));
		};
		k(de, (a) => {
			e(g) === 'import' && a(Ne);
		});
	}
	var fe = n(de, 2);
	{
		var $e = (a) => {
			var t = ft(),
				s = i(t),
				d = i(s);
			(b(d, 'icon', 'mdi:export'), E(), r(s));
			var v = n(s, 4),
				o = i(v);
			o.__click = Ce;
			var f = i(o);
			(b(f, 'icon', 'mdi:code-json'), E(), r(o));
			var p = n(o, 2);
			p.__click = Te;
			var U = i(p);
			(b(U, 'icon', 'mdi:file-csv-outline'),
				E(),
				r(p),
				r(v),
				r(t),
				R(() => {
					((o.disabled = e(x)), (p.disabled = e(x)));
				}),
				B(3, t, () => D),
				l(a, t));
		};
		k(fe, (a) => {
			e(g) === 'export' && a($e);
		});
	}
	var je = n(fe, 2);
	{
		var Ue = (a) => {
			var t = ut(),
				s = i(t),
				d = i(s);
			(b(d, 'icon', 'mdi:bug-outline'), E(), r(s));
			var v = n(s, 2),
				o = i(v, !0);
			(r(v), r(t), R((f) => S(o, f), [() => JSON.stringify(e(c), null, 2)]), B(3, t, () => D), l(a, t));
		};
		k(je, (a) => {
			e(g) === 'debug' && a(Ue);
		});
	}
	(r(K), r(ce), B(3, K, () => We), l(we, se), Ye());
}
Ke(['click', 'change']);
export { St as component };
//# sourceMappingURL=10.DSq-86IR.js.map
