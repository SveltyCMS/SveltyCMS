import { i as w } from './zi73tRJP.js';
import { p as mt, b as s, d as L, c as a, s as i, r as t, g as e, u as le, t as g, a as bt, f as _t, x as Ze, z as ct, n as q } from './DrlZFkx8.js';
import { f as p, a as u, t as et, c as Lt, s as h, d as Pt } from './CTjXDULS.js';
import { e as Je } from './BXe5mj2j.js';
import { a as se, c as z, s as Nt, b, d as Rt, r as At, g as Tt, e as vt } from './MEFvoR_D.js';
import { d as Ft } from './D4QnGYgQ.js';
import { T as Ue, I as ut } from './-vmR0Fky.js';
import { o as Jt } from './CMZtchEj.js';
import { t as pt, f as ft } from './0XeaN6pZ.js';
import { p as _e } from './DePHBZW_.js';
import { s as Ut } from './BSPmpUse.js';
import { g as Bt } from './DVb8jQhQ.js';
import { l as Oe } from './BvngfGKt.js';
var Vt = p('<span class="text-sm font-medium text-gray-700 dark:text-gray-300 svelte-9zaket" id="progress-label"> </span>'),
	Gt = p('<iconify-icon></iconify-icon>', 2),
	Qt = p('<div class="flex items-center gap-2 svelte-9zaket"><!> <span> </span></div>'),
	qt = p('<div class="mb-2 flex items-center justify-between svelte-9zaket"><!> <!></div>'),
	Ht = p('<div class="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] bg-white/30 svelte-9zaket"></div>'),
	Kt = p('<div><!></div>'),
	Wt = p('<div></div>'),
	Xt = p('<div class="mt-2 text-xs font-medium text-success-600 dark:text-success-400 svelte-9zaket">✓ Complete</div>'),
	Yt = p(
		'<div class="progress-container w-full svelte-9zaket" role="region" aria-label="Progress indicator"><!> <div role="progressbar"><!></div> <!> <div class="sr-only svelte-9zaket" role="status" aria-live="polite" aria-atomic="true"><!></div></div>'
	);
function Zt(Be, F) {
	mt(F, !0);
	const J = _e(F, 'value', 3, 0),
		_ = _e(F, 'label', 3, ''),
		ne = _e(F, 'color', 3, 'blue'),
		de = _e(F, 'size', 3, 'md'),
		ce = _e(F, 'animated', 3, !1),
		f = _e(F, 'showPercentage', 3, !0),
		x = _e(F, 'indeterminate', 3, !1);
	let k = L(!1);
	const M = le(() => Math.max(0, Math.min(100, J()))),
		$ = le(() => ({ sm: 'h-2', md: 'h-3', lg: 'h-4' })[de()]),
		H = le(
			() =>
				({
					blue: 'bg-blue-600 dark:bg-blue-500',
					green: 'bg-green-600 dark:bg-green-500',
					red: 'bg-red-600 dark:bg-red-500',
					yellow: 'bg-yellow-600 dark:bg-yellow-500',
					purple: 'bg-purple-600 dark:bg-purple-500',
					gray: 'bg-gray-600 dark:bg-gray-500',
					primary: 'bg-primary-500',
					success: 'bg-success-500',
					error: 'bg-error-500',
					warning: 'bg-warning-500'
				})[ne()] || 'bg-blue-600'
		),
		j = le(() => () => (x() ? 'loading' : e(M) >= 100 ? 'complete' : e(M) >= 75 ? 'high' : e(M) >= 50 ? 'medium' : e(M) >= 25 ? 'low' : 'minimal')),
		K = le(() => () => {
			switch (e(j)()) {
				case 'complete':
					return 'mdi:check-circle';
				case 'loading':
					return 'mdi:loading';
				default:
					return null;
			}
		});
	Jt(() => {
		const d = window.matchMedia('(prefers-reduced-motion: reduce)');
		s(k, d.matches, !0);
		const n = (N) => {
			s(k, N.matches, !0);
		};
		return (d.addEventListener('change', n), () => d.removeEventListener('change', n));
	});
	var ve = Yt(),
		Le = a(ve);
	{
		var Ve = (d) => {
			var n = qt(),
				N = a(n);
			{
				var U = (S) => {
					var O = Vt(),
						ue = a(O, !0);
					(t(O), g(() => h(ue, _())), u(S, O));
				};
				w(N, (S) => {
					_() && S(U);
				});
			}
			var A = i(N, 2);
			{
				var E = (S) => {
					var O = Qt(),
						ue = a(O);
					{
						var ze = (W) => {
							var T = Gt();
							(g(() => b(T, 'icon', e(K)())), b(T, 'width', '16'));
							let ge;
							(b(T, 'aria-hidden', 'true'),
								g(
									(Te, Fe) => (ge = z(T, 1, Te, 'svelte-9zaket', ge, Fe)),
									[() => Rt(e(j)() === 'complete' ? 'text-success-500' : ''), () => ({ 'animate-spin': e(j)() === 'loading' && !e(k) })]
								),
								u(W, T));
						};
						w(ue, (W) => {
							e(K)() && W(ze);
						});
					}
					var xe = i(ue, 2),
						Ae = a(xe);
					(t(xe),
						t(O),
						g(
							(W, T) => {
								(z(xe, 1, `text-sm font-semibold ${W ?? ''}`, 'svelte-9zaket'), h(Ae, `${T ?? ''}%`));
							},
							[() => (e(j)() === 'complete' ? 'text-success-600 dark:text-success-400' : 'text-gray-500 dark:text-gray-400'), () => Math.round(e(M))]
						),
						u(S, O));
				};
				w(A, (S) => {
					f() && !x() && S(E);
				});
			}
			(t(n), u(d, n));
		};
		w(Le, (d) => {
			(_() || f()) && d(Ve);
		});
	}
	var P = i(Le, 2);
	(se(P, 'aria-valuemin', 0), se(P, 'aria-valuemax', 100));
	var Ge = a(P);
	{
		var D = (d) => {
				var n = Kt(),
					N = a(n);
				{
					var U = (A) => {
						var E = Ht();
						u(A, E);
					};
					w(N, (A) => {
						e(k) || A(U);
					});
				}
				(t(n),
					g(() => z(n, 1, `h-full w-full ${e(H) ?? ''} ${e(k) ? '' : 'animate-pulse'}`, 'svelte-9zaket')),
					pt(
						3,
						n,
						() => ft,
						() => ({ duration: e(k) ? 0 : 200 })
					),
					u(d, n));
			},
			Qe = (d) => {
				var n = Wt();
				(g(() => {
					(z(
						n,
						1,
						`h-full rounded-full transition-all ${e(k) ? 'duration-0' : 'duration-500'} ease-out ${e(H) ?? ''}
				       ${ce() && !e(k) ? 'animate-[stripes_1s_linear_infinite] bg-linear-to-r from-current to-current bg-size-[1rem_1rem]' : ''}`,
						'svelte-9zaket'
					),
						Nt(
							n,
							`width: ${e(M) ?? ''}%; ${ce() && !e(k) ? 'background-image: linear-gradient(45deg, rgba(255,255,255,.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.2) 50%, rgba(255,255,255,.2) 75%, transparent 75%, transparent);' : ''}`
						));
				}),
					u(d, n));
			};
		w(Ge, (d) => {
			x() ? d(D) : d(Qe, !1);
		});
	}
	t(P);
	var Pe = i(P, 2);
	{
		var qe = (d) => {
			var n = Xt();
			(pt(
				3,
				n,
				() => ft,
				() => ({ duration: e(k) ? 0 : 200 })
			),
				u(d, n));
		};
		w(Pe, (d) => {
			e(j)() === 'complete' && d(qe);
		});
	}
	var Ne = i(Pe, 2),
		Re = a(Ne);
	{
		var Ee = (d) => {
				var n = et('Loading...');
				u(d, n);
			},
			Ce = (d) => {
				var n = Lt(),
					N = _t(n);
				{
					var U = (E) => {
							var S = et('Progress complete at 100 percent');
							u(E, S);
						},
						A = (E) => {
							var S = et();
							(g((O) => h(S, `Progress at ${O ?? ''} percent`), [() => Math.round(e(M))]), u(E, S));
						};
					w(
						N,
						(E) => {
							e(j)() === 'complete' ? E(U) : E(A, !1);
						},
						!0
					);
				}
				u(d, n);
			};
		w(Re, (d) => {
			x() ? d(Ee) : d(Ce, !1);
		});
	}
	(t(Ne),
		t(ve),
		g(
			(d, n) => {
				(z(P, 1, `w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${e($) ?? ''}`, 'svelte-9zaket'),
					se(P, 'aria-valuenow', d),
					se(P, 'aria-label', _() || 'Progress'),
					se(P, 'aria-valuetext', n),
					se(P, 'aria-labelledby', _() ? 'progress-label' : void 0));
			},
			[() => (x() ? void 0 : Math.round(e(M))), () => (x() ? 'Loading...' : `${Math.round(e(M))} percent`)]
		),
		u(Be, ve),
		bt());
}
var ea = p(
		'<div class="flex items-center justify-between text-sm"><span class="text-tertiary-500 dark:text-primary-500"> </span> <iconify-icon></iconify-icon></div>',
		2
	),
	ta = p('<p class="text-xs text-surface-300"> </p>'),
	aa = p('<div class="mb-6"><!></div>'),
	ra = p(
		'<div class="mb-6"><div class="alert preset-filled-success-500"><div class="flex items-center justify-between"><span>Export completed successfully!</span> <button><iconify-icon></iconify-icon> Download</button></div></div></div>',
		2
	),
	ia = p('<span class="ml-2 text-sm text-gray-500"> </span>'),
	oa = p(
		'<label class="flex cursor-pointer items-center space-x-3 py-2"><input type="checkbox" class="rounded"/> <div class="font-medium"> <!></div></label>'
	),
	sa = p(
		'<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"><div class="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800"><div class="flex items-center justify-between border-b p-6"><h3 class="text-lg font-semibold">Export Collections</h3> <button class="preset-outlined-surface-500 btn-icon" aria-label="Close export modal"><iconify-icon></iconify-icon></button></div> <div class="max-h-[calc(80vh-140px)] space-y-6 overflow-y-auto p-6"><div><label for="export-format" class="mb-2 block text-sm font-medium">Export Format</label> <select id="export-format" class="select"><option>JSON</option><option>CSV</option></select></div> <div><div class="mb-3 flex items-center justify-between"><p class="block text-sm font-medium">Select Collections</p> <div class="space-x-2"><button class="preset-outlined-secondary-500 btn">Select All</button> <button class="preset-outlined-secondary-500 btn">Clear All</button></div></div> <div class="max-h-48 overflow-y-auto rounded-md border border-gray-200 p-3 dark:border-gray-700"></div></div> <div class="space-y-4"><!> <div><label for="export-limit" class="mb-2 block text-sm font-medium">Limit (optional)</label> <!></div></div></div> <div class="flex justify-end space-x-3 border-t bg-surface-100 p-6 dark:bg-surface-700"><button class="preset-outlined-secondary-500 btn">Cancel</button> <button class="preset-filled-primary-500 btn">Export Selected</button></div></div></div>',
		2
	),
	la = p(
		'<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"><div class="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800"><div class="flex items-center justify-between border-b p-6"><h3 class="text-lg font-semibold">Import Collections</h3> <button class="preset-outlined-surface-500 btn-icon" aria-label="Close import modal"><iconify-icon></iconify-icon></button></div> <div class="max-h-[calc(80vh-140px)] space-y-6 overflow-y-auto p-6"><div><label for="import-file" class="mb-2 block text-sm font-medium">Select File</label> <input id="import-file" type="file" accept=".json,.csv" class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"/> <p class="mt-1 text-xs text-gray-500">Supported formats: JSON, CSV</p></div> <div><label for="import-format" class="mb-2 block text-sm font-medium">Data Format</label> <select id="import-format" class="select"><option>JSON</option><option>CSV</option></select></div> <div class="space-y-4"><!> <!> <!> <div><label for="import-batch-size" class="mb-2 block text-sm font-medium">Batch Size</label> <!></div></div></div> <div class="flex justify-end space-x-3 border-t bg-surface-100 p-6 dark:bg-surface-700"><button class="preset-outlined-secondary-500 btn">Cancel</button> <button class="preset-filled-primary-500 btn">Import Data</button></div></div></div>',
		2
	),
	na = p('<div class="text-xs text-gray-600"> </div>'),
	da = p('<div class="text-xs text-gray-500"> </div>'),
	ca = p(
		'<div class="text-sm"><details><summary class="cursor-pointer text-red-600"> </summary> <div class="mt-2 space-y-1"><!> <!></div></details></div>'
	),
	va = p(
		'<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><div class="mb-2 flex items-center justify-between"><h4 class="font-medium"> </h4> <div class="flex space-x-4 text-sm"><span class="text-primary-500"> </span> <span class="text-waring-500"> </span> <span class="text-error-500"> </span></div></div> <!></div>'
	),
	ua = p(
		'<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"><div class="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800"><div class="flex items-center justify-between border-b p-6"><h3 class="text-lg font-semibold">Import Results</h3> <button class="preset-outlined-surface-500 btn-sm"><iconify-icon></iconify-icon> mdi:close</button></div> <div class="max-h-[calc(80vh-140px)] overflow-y-auto p-6"><div class="space-y-6"><div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800"><h3 class="mb-3 font-semibold">Import Summary</h3> <div class="grid grid-cols-3 gap-4 text-center"><div><div class="text-2xl font-bold text-primary-500"> </div> <div class="text-sm text-gray-600">Imported</div></div> <div><div class="text-waring-500 text-2xl font-bold"> </div> <div class="text-sm text-gray-600">Skipped</div></div> <div><div class="text-2xl font-bold text-error-500"> </div> <div class="text-sm text-gray-600">Errors</div></div></div></div> <div><h3 class="mb-3 font-semibold">Collection Details</h3> <div class="max-h-64 space-y-3 overflow-y-auto"></div></div></div></div> <div class="flex justify-end border-t bg-surface-100 p-6 dark:bg-surface-700"><button class="variant-primary">Close</button></div></div></div>',
		2
	),
	pa = p(
		'<div class="import-export-manager svelte-ojvkgp"><div class="mb-6 flex items-center justify-between"><div><h2 class="text-2xl font-bold text-gray-900 dark:text-white">Data Import & Export</h2> <p class="mt-1 text-gray-600 dark:text-gray-400">Backup and restore your collection data</p></div> <div class="flex gap-3"><button class="preset-outlined-secondary-500 btn"><iconify-icon></iconify-icon> Export Data</button> <button class="preset-outlined-primary-500 btn"><iconify-icon></iconify-icon> Import Data</button></div></div> <div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2"><div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"><div class="mb-4 flex items-center"><div class="preset-filled-tertiary-500 btn-icon mr-3"><iconify-icon></iconify-icon></div> <div><h3 class="font-semibold text-gray-900 dark:text-white">Export All Data</h3> <p class="text-sm text-gray-600 dark:text-gray-400">Export all collections to file</p></div></div> <button class="preset-outline-secondary-500 btn mt-4 w-full">Export Everything</button></div> <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800"><div class="mb-4 flex items-center"><div class="preset-filled-primary-500 btn-icon mr-3"><iconify-icon></iconify-icon></div> <div><h3 class="font-semibold text-gray-900 dark:text-white">Collections</h3> <p class="text-sm text-gray-600 dark:text-gray-400"><span class="font-semibold text-tertiary-500 dark:text-primary-500"> </span> collections available</p></div></div> <div class="space-y-2"><!> <!></div></div></div> <!> <!></div> <!> <!> <!>',
		3
	);
function Ea(Be, F) {
	mt(F, !0);
	let J = L(Ze([])),
		_ = L(!1),
		ne = L(!1),
		de = L(!1),
		ce = L(!1);
	const f = Ze({ format: 'json', collections: [], includeMetadata: !0, limit: void 0 });
	let x = L(0),
		k = L(''),
		M = L('');
	const $ = Ze({ format: 'json', overwrite: !1, validate: !0, skipInvalid: !0, batchSize: 100 });
	let H = L(null),
		j = L(0),
		K = L(null),
		ve = L('100');
	(ct(() => {
		const r = parseInt(e(M), 10);
		f.limit = isNaN(r) ? void 0 : r;
	}),
		ct(() => {
			const r = parseInt(e(ve), 10);
			$.batchSize = isNaN(r) ? 100 : r;
		}),
		Le());
	async function Le() {
		try {
			s(_, !0);
			const r = await Bt({ includeFields: !1 });
			if (r.success && r.data) {
				let o = [];
				(Array.isArray(r.data) ? (o = r.data) : r.data && typeof r.data == 'object' && 'collections' in r.data && (o = r.data.collections || []),
					s(
						J,
						o.map((l) => ({ id: l.id || l.name, name: l.name, label: l.label || l.name, description: l.description })),
						!0
					),
					(f.collections = e(J).map((l) => String(l.id))));
			} else D('Failed to load collections', 'error');
		} catch (r) {
			(Oe.error('Error loading collections:', r), D('Error loading collections', 'error'));
		} finally {
			s(_, !1);
		}
	}
	async function Ve() {
		try {
			(s(_, !0), s(x, 0));
			const r = setInterval(() => {
					s(x, Math.min(e(x) + 10, 90), !0);
				}, 200),
				o = await fetch('/api/exportData', { method: 'GET' });
			if ((clearInterval(r), s(x, 100), o.ok)) D('Data export completed successfully', 'success');
			else {
				const l = await o.text();
				D(`Export failed: ${l}`, 'error');
			}
		} catch (r) {
			(Oe.error('Export error:', r), D('Export failed', 'error'));
		} finally {
			(s(_, !1), s(x, 0));
		}
	}
	async function P() {
		if (f.collections.length === 0) {
			D('Please select at least one collection to export', 'warning');
			return;
		}
		try {
			(s(_, !0), s(x, 0));
			const r = setInterval(() => {
					s(x, Math.min(e(x) + 10, 90), !0);
				}, 100),
				o = {};
			for (let c = 0; c < f.collections.length; c++) {
				const v = f.collections[c],
					m = new URLSearchParams({ format: 'json', ...(f.limit && { limit: f.limit.toString() }) }),
					C = await fetch(`/api/collections/${v}/export?${m}`);
				if (C.ok) {
					const R = await C.json();
					o[v] = R.data;
				} else Oe.error(`Failed to export collection ${v}`);
			}
			(clearInterval(r), s(x, 100));
			const l = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' });
			(s(k, URL.createObjectURL(l), !0), D(`Successfully exported ${f.collections.length} collections`, 'success'));
		} catch (r) {
			(Oe.error('Export error:', r), D('Export failed', 'error'));
		} finally {
			(s(_, !1), s(x, 0), s(ne, !1));
		}
	}
	async function Ge() {
		if (!e(H) || e(H).length === 0) {
			D('Please select a file to import', 'warning');
			return;
		}
		try {
			(s(_, !0), s(j, 0));
			const r = e(H)[0];
			let o;
			if ($.format === 'json') {
				const v = await r.text();
				o = JSON.parse(v);
			} else o = await r.text();
			const l = setInterval(() => {
					s(j, Math.min(e(j) + 5, 90), !0);
				}, 200),
				c = await fetch('/api/importData', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ collections: o, options: $ })
				});
			if ((clearInterval(l), s(j, 100), c.ok)) (s(K, await c.json(), !0), s(ce, !0), s(de, !1));
			else {
				const v = await c.text();
				D(`Import failed: ${v}`, 'error');
			}
		} catch (r) {
			(Oe.error('Import error:', r), D('Import failed', 'error'));
		} finally {
			(s(_, !1), s(j, 0));
		}
	}
	function D(r, o) {
		Ut(r, o, 5e3);
	}
	function Qe() {
		if (e(k)) {
			const r = document.createElement('a');
			((r.href = e(k)),
				(r.download = `collections-export-${new Date().toISOString().split('T')[0]}.json`),
				document.body.appendChild(r),
				r.click(),
				document.body.removeChild(r),
				URL.revokeObjectURL(e(k)),
				s(k, ''));
		}
	}
	function Pe(r) {
		const o = f.collections.indexOf(r);
		o > -1 ? f.collections.splice(o, 1) : f.collections.push(r);
	}
	function qe() {
		f.collections = e(J).map((r) => String(r.id));
	}
	function Ne() {
		f.collections = [];
	}
	var Re = pa(),
		Ee = _t(Re),
		Ce = a(Ee),
		d = i(a(Ce), 2),
		n = a(d);
	n.__click = () => s(ne, !0);
	var N = a(n);
	(b(N, 'icon', 'mdi:export'), b(N, 'width', '24'), z(N, 1, ''), q(), t(n));
	var U = i(n, 2);
	U.__click = () => s(de, !0);
	var A = a(U);
	(b(A, 'icon', 'mdi:import'), b(A, 'width', '24'), z(A, 1, ''), q(), t(U), t(d), t(Ce));
	var E = i(Ce, 2),
		S = a(E),
		O = a(S),
		ue = a(O),
		ze = a(ue);
	(b(ze, 'icon', 'mdi:database-export'), b(ze, 'width', '24'), z(ze, 1, ''), t(ue), q(2), t(O));
	var xe = i(O, 2);
	((xe.__click = Ve), t(S));
	var Ae = i(S, 2),
		W = a(Ae),
		T = a(W),
		ge = a(T);
	(b(ge, 'icon', 'mdi:folder-multiple'), b(ge, 'width', '24'), z(ge, 1, ''), t(T));
	var Te = i(T, 2),
		Fe = i(a(Te), 2),
		tt = a(Fe),
		xt = a(tt, !0);
	(t(tt), q(), t(Fe), t(Te), t(W));
	var at = i(W, 2),
		rt = a(at);
	Je(
		rt,
		17,
		() => e(J).slice(0, 3),
		(r) => r.id,
		(r, o) => {
			var l = ea(),
				c = a(l),
				v = a(c, !0);
			t(c);
			var m = i(c, 2);
			(b(m, 'icon', 'mdi:chevron-right'), b(m, 'width', '24'), z(m, 1, ''), t(l), g(() => h(v, e(o).label)), u(r, l));
		}
	);
	var gt = i(rt, 2);
	{
		var yt = (r) => {
			var o = ta(),
				l = a(o);
			(t(o), g(() => h(l, `...and ${e(J).length - 3} more`)), u(r, o));
		};
		w(gt, (r) => {
			e(J).length > 3 && r(yt);
		});
	}
	(t(at), t(Ae), t(E));
	var it = i(E, 2);
	{
		var ht = (r) => {
			var o = aa(),
				l = a(o);
			{
				let c = le(() => e(x) || e(j)),
					v = le(() => (e(x) > 0 ? 'Exporting...' : 'Importing...'));
				Zt(l, {
					get value() {
						return e(c);
					},
					get label() {
						return e(v);
					}
				});
			}
			(t(o), u(r, o));
		};
		w(it, (r) => {
			e(_) && (e(x) > 0 || e(j) > 0) && r(ht);
		});
	}
	var wt = i(it, 2);
	{
		var kt = (r) => {
			var o = ra(),
				l = a(o),
				c = a(l),
				v = i(a(c), 2);
			v.__click = Qe;
			var m = a(v);
			(b(m, 'icon', 'mdi:download'), b(m, 'width', '24'), z(m, 1, ''), q(), t(v), t(c), t(l), t(o), u(r, o));
		};
		w(wt, (r) => {
			e(k) && r(kt);
		});
	}
	t(Ee);
	var ot = i(Ee, 2);
	{
		var St = (r) => {
			var o = sa(),
				l = a(o),
				c = a(l),
				v = i(a(c), 2);
			v.__click = () => s(ne, !1);
			var m = a(v);
			(b(m, 'icon', 'mdi:close'), b(m, 'width', '24'), z(m, 1, ''), t(v), t(c));
			var C = i(c, 2),
				R = a(C),
				X = i(a(R), 2),
				B = a(X);
			B.value = B.__value = 'json';
			var V = i(B);
			((V.value = V.__value = 'csv'), t(X), t(R));
			var G = i(R, 2),
				Z = a(G),
				Y = i(a(Z), 2),
				ee = a(Y);
			ee.__click = qe;
			var ye = i(ee, 2);
			((ye.__click = Ne), t(Y), t(Z));
			var te = i(Z, 2);
			(Je(
				te,
				21,
				() => e(J),
				(y) => y.id,
				(y, Q) => {
					const ke = le(() => `export-collection-${e(Q).id}`);
					var oe = oa(),
						fe = a(oe);
					(At(fe), (fe.__change = () => Pe(String(e(Q).id))));
					var Me = i(fe, 2),
						Se = a(Me),
						He = i(Se);
					{
						var $e = (me) => {
							var Ie = ia(),
								Ke = a(Ie, !0);
							(t(Ie), g(() => h(Ke, e(Q).description)), u(me, Ie));
						};
						w(He, (me) => {
							e(Q).description && me($e);
						});
					}
					(t(Me),
						t(oe),
						g(
							(me) => {
								(se(oe, 'for', e(ke)), se(fe, 'id', e(ke)), Tt(fe, me), h(Se, `${e(Q).label ?? ''} `));
							},
							[() => f.collections.includes(String(e(Q).id))]
						),
						u(y, oe));
				}
			),
				t(te),
				t(G));
			var ae = i(G, 2),
				he = a(ae);
			Ue(he, {
				label: 'Include Metadata',
				get value() {
					return f.includeMetadata;
				},
				set value(y) {
					f.includeMetadata = y;
				}
			});
			var re = i(he, 2),
				pe = i(a(re), 2);
			(ut(pe, {
				type: 'text',
				placeholder: 'Leave empty for all records',
				get value() {
					return e(M);
				},
				set value(y) {
					s(M, y, !0);
				}
			}),
				t(re),
				t(ae),
				t(C));
			var ie = i(C, 2),
				I = a(ie);
			I.__click = () => s(ne, !1);
			var we = i(I, 2);
			((we.__click = P),
				t(ie),
				t(l),
				t(o),
				g(() => (we.disabled = e(_) || f.collections.length === 0)),
				vt(
					X,
					() => f.format,
					(y) => (f.format = y)
				),
				u(r, o));
		};
		w(ot, (r) => {
			e(ne) && r(St);
		});
	}
	var st = i(ot, 2);
	{
		var It = (r) => {
			var o = la(),
				l = a(o),
				c = a(l),
				v = i(a(c), 2);
			v.__click = () => s(de, !1);
			var m = a(v);
			(b(m, 'icon', 'mdi:close'), b(m, 'width', '24'), z(m, 1, ''), t(v), t(c));
			var C = i(c, 2),
				R = a(C),
				X = i(a(R), 2);
			(q(2), t(R));
			var B = i(R, 2),
				V = i(a(B), 2),
				G = a(V);
			G.value = G.__value = 'json';
			var Z = i(G);
			((Z.value = Z.__value = 'csv'), t(V), t(B));
			var Y = i(B, 2),
				ee = a(Y);
			Ue(ee, {
				label: 'Overwrite Existing',
				get value() {
					return $.overwrite;
				},
				set value(I) {
					$.overwrite = I;
				}
			});
			var ye = i(ee, 2);
			Ue(ye, {
				label: 'Validate Data',
				get value() {
					return $.validate;
				},
				set value(I) {
					$.validate = I;
				}
			});
			var te = i(ye, 2);
			Ue(te, {
				label: 'Skip Invalid Entries',
				get value() {
					return $.skipInvalid;
				},
				set value(I) {
					$.skipInvalid = I;
				}
			});
			var ae = i(te, 2),
				he = i(a(ae), 2);
			(ut(he, {
				type: 'text',
				placeholder: '100',
				get value() {
					return e(ve);
				},
				set value(I) {
					s(ve, I, !0);
				}
			}),
				t(ae),
				t(Y),
				t(C));
			var re = i(C, 2),
				pe = a(re);
			pe.__click = () => s(de, !1);
			var ie = i(pe, 2);
			((ie.__click = Ge),
				t(re),
				t(l),
				t(o),
				g(() => (ie.disabled = e(_) || !e(H))),
				Ft(
					X,
					() => e(H),
					(I) => s(H, I)
				),
				vt(
					V,
					() => $.format,
					(I) => ($.format = I)
				),
				u(r, o));
		};
		w(st, (r) => {
			e(de) && r(It);
		});
	}
	var jt = i(st, 2);
	{
		var Et = (r) => {
			var o = ua(),
				l = a(o),
				c = a(l),
				v = i(a(c), 2);
			v.__click = () => s(ce, !1);
			var m = a(v);
			(b(m, 'icon', 'mdi:close'), b(m, 'width', '24'), z(m, 1, ''), q(), t(v), t(c));
			var C = i(c, 2),
				R = a(C),
				X = a(R),
				B = i(a(X), 2),
				V = a(B),
				G = a(V),
				Z = a(G, !0);
			(t(G), q(2), t(V));
			var Y = i(V, 2),
				ee = a(Y),
				ye = a(ee, !0);
			(t(ee), q(2), t(Y));
			var te = i(Y, 2),
				ae = a(te),
				he = a(ae, !0);
			(t(ae), q(2), t(te), t(B), t(X));
			var re = i(X, 2),
				pe = i(a(re), 2);
			(Je(
				pe,
				21,
				() => e(K).results,
				(we) => we.collection,
				(we, y) => {
					var Q = va(),
						ke = a(Q),
						oe = a(ke),
						fe = a(oe, !0);
					t(oe);
					var Me = i(oe, 2),
						Se = a(Me),
						He = a(Se);
					t(Se);
					var $e = i(Se, 2),
						me = a($e);
					t($e);
					var Ie = i($e, 2),
						Ke = a(Ie);
					(t(Ie), t(Me), t(ke));
					var Ct = i(ke, 2);
					{
						var zt = (We) => {
							var Xe = ca(),
								lt = a(Xe),
								Ye = a(lt),
								Mt = a(Ye);
							t(Ye);
							var nt = i(Ye, 2),
								dt = a(nt);
							Je(
								dt,
								17,
								() => e(y).errors.slice(0, 5),
								(be) => be.index,
								(be, je) => {
									var De = na(),
										Ot = a(De);
									(t(De), g(() => h(Ot, `Line ${e(je).index + 1}: ${e(je).error ?? ''}`)), u(be, De));
								}
							);
							var $t = i(dt, 2);
							{
								var Dt = (be) => {
									var je = da(),
										De = a(je);
									(t(je), g(() => h(De, `...and ${e(y).errors.length - 5} more errors`)), u(be, je));
								};
								w($t, (be) => {
									e(y).errors.length > 5 && be(Dt);
								});
							}
							(t(nt), t(lt), t(Xe), g(() => h(Mt, `${e(y).errors.length ?? ''} errors`)), u(We, Xe));
						};
						w(Ct, (We) => {
							e(y).errors.length > 0 && We(zt);
						});
					}
					(t(Q),
						g(() => {
							(h(fe, e(y).collection), h(He, `+${e(y).imported ?? ''}`), h(me, `~${e(y).skipped ?? ''}`), h(Ke, `!${e(y).errors.length ?? ''}`));
						}),
						u(we, Q));
				}
			),
				t(pe),
				t(re),
				t(R),
				t(C));
			var ie = i(C, 2),
				I = a(ie);
			((I.__click = () => s(ce, !1)),
				t(ie),
				t(l),
				t(o),
				g(() => {
					(h(Z, e(K).totalImported), h(ye, e(K).totalSkipped), h(he, e(K).totalErrors));
				}),
				u(r, o));
		};
		w(jt, (r) => {
			e(ce) && e(K) && r(Et);
		});
	}
	(g(() => {
		((n.disabled = e(_)), (U.disabled = e(_)), (xe.disabled = e(_)), h(xt, e(J).length));
	}),
		u(Be, Re),
		bt());
}
Pt(['click', 'change']);
export { Ea as I };
//# sourceMappingURL=D-YTu8w6.js.map
