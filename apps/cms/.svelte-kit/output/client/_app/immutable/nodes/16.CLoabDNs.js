const __vite__mapDeps = (
	i,
	m = __vite__mapDeps,
	d = m.f ||
		(m.f = [
			'../chunks/5svsSMPa.js',
			'../chunks/zi73tRJP.js',
			'../chunks/DrlZFkx8.js',
			'../chunks/rsSWfq8L.js',
			'../chunks/CTjXDULS.js',
			'../chunks/CMZtchEj.js',
			'../chunks/DhHAlOU0.js',
			'../chunks/BEiD40NV.js',
			'../chunks/MEFvoR_D.js',
			'../chunks/YQp2a1pQ.js',
			'../chunks/DePHBZW_.js',
			'../chunks/DvgRl2rN.js',
			'../chunks/C4Hx6_Ca.js',
			'../chunks/DvaK7ysa.js',
			'../chunks/KG4G7ZS9.js',
			'../chunks/BXe5mj2j.js',
			'../chunks/BvngfGKt.js',
			'../chunks/CJRzwHNa.js',
			'../chunks/DcE1dlaA.js',
			'../chunks/DBDmFzKi.js',
			'../chunks/CuIUSTQY.js',
			'../chunks/iJudhYDU.js',
			'../chunks/B_fImZOG.js',
			'../chunks/DkqpTttL.js',
			'../chunks/D4QnGYgQ.js',
			'../chunks/_e9Aq20d.js',
			'../chunks/N8Jg0v49.js',
			'../chunks/BKIh0tuc.js',
			'../chunks/BEWEx7zq.js',
			'../chunks/DD-T1xtZ.js',
			'../chunks/t_Qjp53h.js',
			'../chunks/BSPmpUse.js',
			'../chunks/C-hhfhAN.js',
			'../chunks/C9E6SjbS.js',
			'../chunks/DnGOEg-Z.js',
			'../chunks/D7ZqxZyq.js',
			'../chunks/CuJV0Fu0.js',
			'../chunks/1boCOyKu.js'
		])
) => i.map((i) => d[i]);
import { _ as l } from '../chunks/PPVm8Dsz.js';
import { i as R } from '../chunks/zi73tRJP.js';
import { o as Qe } from '../chunks/CMZtchEj.js';
import { d as D, x as te, g as e, b as f, p as Ze, f as Z, c as u, s as y, a as et, u as O, r as c, n as ce, t as H } from '../chunks/DrlZFkx8.js';
import { d as tt, f as I, a as b, s as De, c as le } from '../chunks/CTjXDULS.js';
import { e as Pe } from '../chunks/BXe5mj2j.js';
import { c as rt } from '../chunks/7bh91wXp.js';
import { b as it } from '../chunks/0XeaN6pZ.js';
import { a as st } from '../chunks/BEiD40NV.js';
import { b as A, c as X, a as ue, r as at, s as fe } from '../chunks/MEFvoR_D.js';
import { b as ot } from '../chunks/D4QnGYgQ.js';
import { b as nt } from '../chunks/YQp2a1pQ.js';
import { I as dt } from '../chunks/D-YTu8w6.js';
import { P as ct } from '../chunks/C6jjkVLf.js';
import { t as lt } from '../chunks/BpdyKTB3.js';
import { l as N } from '../chunks/BvngfGKt.js';
import { f as ut } from '../chunks/TC87idKr.js';
const ft = (E, n, p) => {
		const W = E[n];
		return W
			? typeof W == 'function'
				? W()
				: Promise.resolve(W)
			: new Promise(($, B) => {
					(typeof queueMicrotask == 'function' ? queueMicrotask : setTimeout)(
						B.bind(
							null,
							new Error(
								'Unknown variable dynamic import: ' +
									n +
									(n.split('/').length !== p ? '. Note that variables only represent file names one level deep.' : '')
							)
						)
					);
				});
	},
	ke = 'dashboard.layout.default';
async function vt() {
	try {
		const E = await fetch(`/api/systemPreferences?key=${ke}`);
		if (E.status === 404) return (N.info('No saved dashboard layout, using default'), null);
		if (!E.ok) throw new Error(`Fetch failed: ${E.statusText}`);
		return await E.json();
	} catch (E) {
		throw (N.error('Failed to fetch preferences:', E), E);
	}
}
async function ee(E) {
	try {
		const n = await fetch('/api/systemPreferences', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ key: ke, value: E })
		});
		if (!n.ok) throw new Error(`Save failed: ${n.statusText}`);
	} catch (n) {
		throw (N.error('Failed to save preferences:', n), n);
	}
}
class pt {
	#e = D(te([]));
	get preferences() {
		return e(this.#e);
	}
	set preferences(n) {
		f(this.#e, n, !0);
	}
	#t = D(!0);
	get loading() {
		return e(this.#t);
	}
	set loading(n) {
		f(this.#t, n, !0);
	}
	#r = D(null);
	get error() {
		return e(this.#r);
	}
	set error(n) {
		f(this.#r, n, !0);
	}
	async load() {
		((this.loading = !0), (this.error = null));
		try {
			const n = await vt();
			this.preferences = (n?.preferences || []).map((p) => ({ ...p, size: p.size?.w && p.size?.h ? p.size : { w: 1, h: 1 } }));
		} catch (n) {
			((this.error = n instanceof Error ? n.message : 'Unknown error'), (this.preferences = []));
		} finally {
			this.loading = !1;
		}
	}
	async set(n) {
		((this.preferences = n), await ee({ id: 'default', name: 'Default', preferences: n }));
	}
	async updateWidget(n) {
		const p = [...this.preferences],
			W = p.findIndex(($) => $.id === n.id);
		(W > -1 ? (p[W] = n) : p.push(n), (this.preferences = p), await ee({ id: 'default', name: 'Default', preferences: p }));
	}
	async updateWidgets(n) {
		const p = n.map((W, $) => ({ ...W, order: $ }));
		((this.preferences = p), await ee({ id: 'default', name: 'Default', preferences: p }));
	}
	async removeWidget(n) {
		const p = this.preferences.filter((W) => W.id !== n);
		((this.preferences = p), await ee({ id: 'default', name: 'Default', preferences: p }));
	}
	async loadPreferences() {
		return this.load();
	}
	async setPreferences(n) {
		return this.set(n);
	}
}
const mt = new pt(),
	Y = mt;
var gt = I(
		'<button class="preset-outlined-surface-500 btn-icon" aria-label="Reset all widgets" title="Reset all widgets"><iconify-icon></iconify-icon></button>',
		2
	),
	_t = I(
		'<button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" aria-haspopup="true" aria-label="Add Widget"><iconify-icon></iconify-icon> Add Widget</button>',
		2
	),
	ht = I(
		'<button class="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-primary-100 dark:hover:bg-primary-900/30" role="menuitem"><iconify-icon></iconify-icon> <div class="flex flex-col"><span> </span></div></button>',
		2
	),
	bt = I('<div class="px-4 py-2 text-sm text-gray-500">No widgets found.</div>'),
	yt = I(
		'<div class="widget-dropdown absolute right-0 z-30 mt-2 w-72 rounded border bg-white shadow-2xl dark:border-gray-700 dark:bg-surface-900" role="menu"><div class="p-2"><input type="text" class="input w-full" placeholder="Search widgets..."/></div> <div class="max-h-64 overflow-y-auto py-1"></div></div>'
	),
	wt = I('<div class="pointer-events-none absolute z-30 rounded-lg border-2 border-dashed border-primary-500 bg-primary-500/20"></div>'),
	xt = I(
		'<div class="widget-skeleton h-full animate-pulse"><div class="mb-2 h-12 rounded-t bg-surface-300 dark:bg-surface-700"></div> <div class="h-full rounded-b bg-surface-200 p-4 dark:bg-surface-800"><div class="mb-3 h-8 rounded bg-surface-300 dark:bg-surface-700"></div> <div class="mb-2 h-6 w-3/4 rounded bg-surface-300 dark:bg-surface-700"></div> <div class="mb-2 h-6 w-1/2 rounded bg-surface-300 dark:bg-surface-700"></div></div></div>'
	),
	Et = I(
		'<div class="card preset-ghost-error-500 flex h-full flex-col items-center justify-center p-4"><iconify-icon></iconify-icon> <h3 class="h4 mb-2">Widget Load Error</h3> <p class="text-sm"> </p> <button class="preset-filled-error-500 btn-sm mt-4">Remove Widget</button></div>',
		2
	),
	It = I('<div class="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 bg-primary-500"></div>'),
	Wt = I(
		'<div role="button" tabindex="0" class="widget-container group relative select-none overflow-hidden rounded-lg border border-surface-200/80 bg-surface-50 shadow-sm transition-all duration-300 dark:text-surface-50 dark:bg-surface-800"><!> <!></div>'
	),
	Dt = I('<div class="responsive-dashboard-grid svelte-x1i5gj" role="grid"><!> <!></div>'),
	Pt = I(
		'<div class="mx-auto flex h-[60vh] w-full flex-col items-center justify-center text-center"><div class="flex flex-col items-center px-10 py-12"><iconify-icon></iconify-icon> <p class="mb-2 text-2xl font-bold text-tertiary-500 dark:text-primary-500">Your Dashboard is Empty</p> <p class="mb-6 text-base text-surface-600 dark:text-surface-300">Click below to add your first widget and get started.</p> <button class="btn rounded-full bg-tertiary-500 px-6 py-3 text-lg font-semibold text-white shadow-lg dark:bg-primary-500" aria-label="Add first widget"><iconify-icon></iconify-icon> Add Widget</button></div></div>',
		2
	),
	kt = I(
		'<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"><div class="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800"><div class="flex items-center justify-between border-b p-6"><h3 class="text-xl font-semibold">Data Import & Export</h3> <button class="preset-ghost btn-sm" aria-label="Close import/export modal"><iconify-icon></iconify-icon></button></div> <div class="max-h-[calc(90vh-140px)] overflow-y-auto p-6"><!></div> <div class="flex items-center justify-between border-t bg-surface-100 p-6 dark:bg-surface-700"><div class="text-sm text-gray-600 dark:text-gray-400"><iconify-icon></iconify-icon> Your data is securely managed and never leaves your server</div> <div class="flex space-x-2"><button class="preset-filled-primary-500 btn">Done</button></div></div></div></div>',
		2
	),
	Lt = I(
		'<main class="relative overflow-y-auto overflow-x-hidden" style="touch-action: pan-y;"><header class="mb-2 flex items-center justify-between gap-2 border-b border-surface-200 p-2 dark:text-surface-50"><!> <div class="flex items-center gap-2"><!> <div class="relative"><!> <!></div></div></header> <div class="relative m-0 w-full p-0"><section class="w-full px-1 py-4"><!></section></div></main> <!>',
		1
	);
function Ft(E, n) {
	Ze(n, !0);
	const p = 4,
		W = 4,
		$ = 48;
	let B = D(null),
		q = D(!1),
		G = D(''),
		ve = D(!1),
		pe = D(te({})),
		L = D(te(new Map()));
	const T = new Map();
	let re = D(!1),
		_ = D(te({ item: null, element: null, offset: { x: 0, y: 0 }, isActive: !1 })),
		V = D(null),
		U = D(null);
	async function Le() {
		const t = Object.assign({
				'../../shared/features/src/dashboard/widgets/CPUWidget.svelte': () =>
					l(() => import('../chunks/5svsSMPa.js'), __vite__mapDeps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/CacheMonitorWidget.svelte': () =>
					l(() => import('../chunks/CJRzwHNa.js'), __vite__mapDeps([17, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/DatabasePoolDiagnostics.svelte': () =>
					l(() => import('../chunks/DcE1dlaA.js'), __vite__mapDeps([18, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/DiskWidget.svelte': () =>
					l(() => import('../chunks/DBDmFzKi.js'), __vite__mapDeps([19, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/Last5ContentWidget.svelte': () =>
					l(() => import('../chunks/CuIUSTQY.js'), __vite__mapDeps([20, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16, 13]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/Last5MediaWidget.svelte': () =>
					l(() => import('../chunks/iJudhYDU.js'), __vite__mapDeps([21, 1, 2, 3, 4, 15, 8, 10, 11, 22, 16, 14, 6, 9]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/LogsWidget.svelte': () =>
					l(() => import('../chunks/DkqpTttL.js'), __vite__mapDeps([23, 1, 2, 3, 4, 15, 8, 24, 10, 11, 14, 6, 9, 16, 25, 26, 27]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/MemoryWidget.svelte': () =>
					l(() => import('../chunks/BEWEx7zq.js'), __vite__mapDeps([28, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/PerformanceWidget.svelte': () =>
					l(() => import('../chunks/DD-T1xtZ.js'), __vite__mapDeps([29, 1, 2, 3, 4, 8, 10, 11, 14, 6, 15, 9, 16]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/SecurityWidget.svelte': () =>
					l(() => import('../chunks/t_Qjp53h.js'), __vite__mapDeps([30, 1, 2, 3, 4, 5, 6, 15, 8, 10, 11, 16, 14, 9, 31, 32, 33]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/SystemHealthWidget.svelte': () =>
					l(() => import('../chunks/DnGOEg-Z.js'), __vite__mapDeps([34, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16, 31, 32, 33]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/SystemMessagesWidget.svelte': () =>
					l(() => import('../chunks/D7ZqxZyq.js'), __vite__mapDeps([35, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/UnifiedMetricsWidget.svelte': () =>
					l(() => import('../chunks/CuJV0Fu0.js'), __vite__mapDeps([36, 1, 2, 3, 4, 5, 6, 15, 8, 10, 11, 16, 14, 9]), import.meta.url),
				'../../shared/features/src/dashboard/widgets/UserOnlineWidget.svelte': () =>
					l(() => import('../chunks/1boCOyKu.js'), __vite__mapDeps([37, 1, 2, 3, 4, 15, 8, 24, 10, 11, 14, 6, 9, 16]), import.meta.url)
			}),
			i = {};
		for (const r in t) {
			const s = r.split('/').pop()?.replace('.svelte', '');
			if (s) {
				const a = await t[r]();
				i[s] = {
					component: a.default,
					name: a.widgetMeta?.name || s,
					description: a.widgetMeta?.description || '',
					icon: a.widgetMeta?.icon || 'mdi:widgets',
					widgetMeta: a.widgetMeta
				};
			}
		}
		(f(pe, i, !0), f(ve, !0));
	}
	async function Ae(t, i) {
		if (!e(L).has(t))
			try {
				const r = await ft(
					Object.assign({
						'../../../../../shared/features/src/dashboard/widgets/CPUWidget.svelte': () =>
							l(() => import('../chunks/5svsSMPa.js'), __vite__mapDeps([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/CacheMonitorWidget.svelte': () =>
							l(() => import('../chunks/CJRzwHNa.js'), __vite__mapDeps([17, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/DatabasePoolDiagnostics.svelte': () =>
							l(() => import('../chunks/DcE1dlaA.js'), __vite__mapDeps([18, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/DiskWidget.svelte': () =>
							l(() => import('../chunks/DBDmFzKi.js'), __vite__mapDeps([19, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/Last5ContentWidget.svelte': () =>
							l(() => import('../chunks/CuIUSTQY.js'), __vite__mapDeps([20, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16, 13]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/Last5MediaWidget.svelte': () =>
							l(() => import('../chunks/iJudhYDU.js'), __vite__mapDeps([21, 1, 2, 3, 4, 15, 8, 10, 11, 22, 16, 14, 6, 9]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/LogsWidget.svelte': () =>
							l(
								() => import('../chunks/DkqpTttL.js'),
								__vite__mapDeps([23, 1, 2, 3, 4, 15, 8, 24, 10, 11, 14, 6, 9, 16, 25, 26, 27]),
								import.meta.url
							),
						'../../../../../shared/features/src/dashboard/widgets/MemoryWidget.svelte': () =>
							l(() => import('../chunks/BEWEx7zq.js'), __vite__mapDeps([28, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/PerformanceWidget.svelte': () =>
							l(() => import('../chunks/DD-T1xtZ.js'), __vite__mapDeps([29, 1, 2, 3, 4, 8, 10, 11, 14, 6, 15, 9, 16]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/SecurityWidget.svelte': () =>
							l(
								() => import('../chunks/t_Qjp53h.js'),
								__vite__mapDeps([30, 1, 2, 3, 4, 5, 6, 15, 8, 10, 11, 16, 14, 9, 31, 32, 33]),
								import.meta.url
							),
						'../../../../../shared/features/src/dashboard/widgets/SystemHealthWidget.svelte': () =>
							l(() => import('../chunks/DnGOEg-Z.js'), __vite__mapDeps([34, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16, 31, 32, 33]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/SystemMessagesWidget.svelte': () =>
							l(() => import('../chunks/D7ZqxZyq.js'), __vite__mapDeps([35, 1, 2, 3, 4, 15, 8, 10, 11, 14, 6, 9, 16]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/UnifiedMetricsWidget.svelte': () =>
							l(() => import('../chunks/CuJV0Fu0.js'), __vite__mapDeps([36, 1, 2, 3, 4, 5, 6, 15, 8, 10, 11, 16, 14, 9]), import.meta.url),
						'../../../../../shared/features/src/dashboard/widgets/UserOnlineWidget.svelte': () =>
							l(() => import('../chunks/1boCOyKu.js'), __vite__mapDeps([37, 1, 2, 3, 4, 15, 8, 24, 10, 11, 14, 6, 9, 16]), import.meta.url)
					}),
					`../../../../../shared/features/src/dashboard/widgets/${i}.svelte`,
					11
				);
				(e(L).set(t, r.default), f(L, new Map(e(L)), !0));
			} catch (r) {
				(N.error(`Failed to load widget: ${i}`, r), e(L).set(t, null), f(L, new Map(e(L)), !0));
			}
	}
	function Re(t, i) {
		const [r, s] = i,
			a = new IntersectionObserver(
				(d) => {
					d.forEach((o) => {
						o.isIntersecting && !e(L).has(r) && (Ae(r, s), a.disconnect(), T.delete(r));
					});
				},
				{ rootMargin: '100px' }
			);
		return (
			a.observe(t),
			T.set(r, a),
			{
				destroy() {
					(a.disconnect(), T.delete(r));
				}
			}
		);
	}
	const ie = O(() => e(pe)),
		P = O(() => Y.preferences || []),
		me = O(() => (e(ve) && e(P) ? Object.keys(e(ie)).filter((t) => !e(P).some((i) => i.component === t)) : [])),
		Oe = O(() => e(me).filter((t) => t.toLowerCase().includes(e(G).toLowerCase()))),
		Te = O(() => (lt.isDarkMode ? 'dark' : 'light'));
	function Me(t, i) {
		const r = e(B)?.querySelector('.responsive-dashboard-grid');
		if (!r) return e(P).length;
		const a = Array.from(r.querySelectorAll('.widget-container')).map((v) => {
				const g = v.getBoundingClientRect(),
					w = r.getBoundingClientRect();
				return { id: v.dataset.widgetId, centerX: g.left + g.width / 2 - w.left, centerY: g.top + g.height / 2 - w.top, rect: g };
			}),
			d = t - r.getBoundingClientRect().left,
			o = i - r.getBoundingClientRect().top;
		let h = 0,
			m = 1 / 0;
		for (let v = 0; v <= a.length; v++) {
			let g, w;
			if (v === 0) ((g = a[0]?.centerY || 0), (w = a[0]?.centerX || 0));
			else if (v === a.length) {
				const j = a[a.length - 1];
				((g = j?.centerY || o), (w = j?.centerX || d));
			} else {
				const j = a[v - 1],
					K = a[v];
				((g = (j.centerY + K.centerY) / 2), (w = (j.centerX + K.centerX) / 2));
			}
			const C = Math.sqrt(Math.pow(d - w, 2) + Math.pow(o - g, 2));
			C < m && ((m = C), (h = v));
		}
		return h;
	}
	function Ve() {
		const t = [...e(P)];
		let i = !1;
		(t.forEach((r, s) => {
			typeof r.order != 'number' && ((r.order = s), (i = !0));
		}),
			t.sort((r, s) => (r.order || 0) - (s.order || 0)),
			t.forEach((r, s) => {
				r.order !== s && ((r.order = s), (i = !0));
			}),
			i && Y.updateWidgets(t));
	}
	function Ce(t) {
		const i = e(ie)[t];
		if (!i) {
			N.error(`SveltyCMS: Widget component info for "${t}" not found in registry.`);
			return;
		}
		const r = i.widgetMeta?.defaultSize || { w: 1, h: 1 },
			s = {
				id: `widget-${Math.random().toString(36).substring(2, 15)}-${Date.now().toString(36)}`,
				component: t,
				label: i.name,
				icon: i.icon,
				size: r,
				settings: i.widgetMeta?.settings || {},
				order: e(P).length
			};
		(Y.updateWidget(s), f(q, !1), f(G, ''));
	}
	function ge(t) {
		(Y.removeWidget(t), e(L).delete(t));
		const i = T.get(t);
		i && (i.disconnect(), T.delete(t));
	}
	function Se() {
		(Y.setPreferences([]), e(L).clear(), T.forEach((t) => t.disconnect()), T.clear());
	}
	function ze(t, i) {
		const r = e(P).find((s) => s.id === t);
		if (r) {
			const s = { w: Math.max(1, Math.min(p, i.w)), h: Math.max(1, Math.min(W, i.h)) };
			Y.updateWidget({ ...r, size: s });
		}
	}
	function Ye(t, i) {
		const r = [...e(P)],
			s = r.findIndex((o) => o.id === t.id);
		if (s === -1) return;
		const [a] = r.splice(s, 1);
		r.splice(i.targetIndex, 0, a);
		const d = r.map((o, h) => ({ ...o, order: h }));
		Y.updateWidgets(d);
	}
	function Ue(t, i, r) {
		if (t.target.closest('button, a, input, select, [role=button], .resize-handles, [data-direction]')) return;
		const s = 'touches' in t ? t.touches[0] : t,
			a = r.getBoundingClientRect();
		if (s.clientY - a.top > $) return;
		(t.preventDefault(),
			f(_, { item: i, element: r, offset: { x: s.clientX - a.left, y: s.clientY - a.top }, isActive: !0 }, !0),
			(r.style.opacity = '0.5'),
			(r.style.zIndex = '1000'));
		const d = r.cloneNode(!0);
		((d.style.cssText = `position: fixed; left: ${a.left}px; top: ${a.top}px; width: ${a.width}px; height: ${a.height}px; pointer-events: none; transform: scale(1.02); box-shadow: 0 20px 40px rgba(0,0,0,0.15); margin: 0;`),
			document.body.appendChild(d),
			(e(_).element = d),
			document.addEventListener('pointermove', _e, { passive: !0 }),
			document.addEventListener('pointerup', je, { once: !0 }));
	}
	function _e(t) {
		if (!e(_).isActive || !e(_).element) return;
		const i = 'touches' in t ? t.touches[0] : t;
		((e(_).element.style.left = `${i.clientX - e(_).offset.x}px`), (e(_).element.style.top = `${i.clientY - e(_).offset.y}px`));
		const r = Me(i.clientX, i.clientY);
		if (e(_).item) {
			const s = e(P).findIndex((a) => a.id === e(_).item?.id);
			s !== -1 && r !== s && r !== s + 1 ? f(V, { show: !0, position: r, targetIndex: r > s ? r - 1 : r }, !0) : f(V, null);
		}
		f(U, null);
	}
	function je() {
		if (!e(_).isActive) return;
		const t = e(B)?.querySelector(`[data-widget-id="${e(_).item?.id}"]`);
		(t && ((t.style.opacity = ''), (t.style.zIndex = '')),
			e(_).element && document.body.removeChild(e(_).element),
			e(V) && e(_).item && e(V).targetIndex !== void 0 && Ye(e(_).item, { targetIndex: e(V).targetIndex }),
			f(_, { item: null, element: null, offset: { x: 0, y: 0 }, isActive: !1 }, !0),
			f(V, null),
			f(U, null),
			document.removeEventListener('pointermove', _e));
	}
	Qe(
		() => (
			Le(),
			Y.loadPreferences(),
			setTimeout(Ve, 100),
			() => {
				(T.forEach((t) => t.disconnect()), T.clear());
			}
		)
	);
	var he = Lt(),
		J = Z(he),
		se = u(J),
		be = u(se);
	ct(be, { name: 'Dashboard', icon: 'bi:bar-chart-line', showBackButton: !0, backUrl: '/config' });
	var ye = y(be, 2),
		we = u(ye);
	{
		var Xe = (t) => {
			var i = gt();
			i.__click = Se;
			var r = u(i);
			(A(r, 'icon', 'mdi:refresh'), c(i), b(t, i));
		};
		R(we, (t) => {
			e(P).length > 0 && t(Xe);
		});
	}
	var xe = y(we, 2),
		Ee = u(xe);
	{
		var $e = (t) => {
			var i = _t();
			i.__click = () => f(q, !e(q));
			var r = u(i);
			(A(r, 'icon', 'mdi:plus'), X(r, 1, 'mr-2'), ce(), c(i), H(() => ue(i, 'aria-expanded', e(q))), b(t, i));
		};
		R(Ee, (t) => {
			e(me).length > 0 && t($e);
		});
	}
	var Be = y(Ee, 2);
	{
		var qe = (t) => {
			var i = yt(),
				r = u(i),
				s = u(r);
			(at(s), c(r));
			var a = y(r, 2);
			(Pe(
				a,
				20,
				() => e(Oe),
				(d) => d,
				(d, o) => {
					const h = O(() => e(ie)[o]);
					var m = ht();
					m.__click = () => Ce(o);
					var v = u(m);
					(H(() => A(v, 'icon', e(h)?.icon || 'mdi:widgets')), X(v, 1, 'text-primary-500'));
					var g = y(v, 2),
						w = u(g),
						C = u(w, !0);
					(c(w),
						c(g),
						c(m),
						H(() => {
							(ue(m, 'title', e(h)?.description), De(C, e(h)?.name || o));
						}),
						b(d, m));
				},
				(d) => {
					var o = bt();
					b(d, o);
				}
			),
				c(a),
				c(i),
				ot(
					s,
					() => e(G),
					(d) => f(G, d)
				),
				b(t, i));
		};
		R(Be, (t) => {
			e(q) && t(qe);
		});
	}
	(c(xe), c(ye), c(se));
	var Ie = y(se, 2),
		We = u(Ie),
		He = u(We);
	{
		var Fe = (t) => {
				var i = Dt(),
					r = u(i);
				{
					var s = (d) => {
						var o = wt();
						let h;
						(H(
							() =>
								(h = fe(o, '', h, {
									'grid-column': `span ${e(U).width ?? ''}`,
									'grid-row': `span ${e(U).height ?? ''}`,
									'grid-column-start': e(U).col + 1,
									'grid-row-start': e(U).row + 1
								}))
						),
							b(d, o));
					};
					R(r, (d) => {
						e(U) && d(s);
					});
				}
				var a = y(r, 2);
				(Pe(
					a,
					25,
					() => e(P).sort((d, o) => (d.order || 0) - (o.order || 0)),
					(d) => d.id,
					(d, o) => {
						const h = O(() => e(L).get(e(o).id));
						var m = Wt();
						m.__pointerdown = (x) => Ue(x, e(o), x.currentTarget);
						let v;
						var g = u(m);
						{
							var w = (x) => {
									var S = xt();
									b(x, S);
								},
								C = (x) => {
									var S = le(),
										ae = Z(S);
									{
										var Q = (z) => {
												var k = Et(),
													M = u(k);
												(A(M, 'icon', 'mdi:alert-circle-outline'), A(M, 'width', '48'), X(M, 1, 'mb-2 text-error-500'));
												var F = y(M, 4),
													ne = u(F);
												c(F);
												var de = y(F, 2);
												((de.__click = () => ge(e(o).id)), c(k), H(() => De(ne, `Failed to load: ${e(o).component ?? ''}`)), b(z, k));
											},
											oe = (z) => {
												var k = le(),
													M = Z(k);
												{
													let F = O(() => n.data.pageData?.user);
													rt(
														M,
														() => e(h),
														(ne, de) => {
															de(ne, {
																get config() {
																	return e(o);
																},
																onRemove: () => ge(e(o).id),
																onSizeChange: (Ke) => ze(e(o).id, Ke),
																get theme() {
																	return e(Te);
																},
																get currentUser() {
																	return e(F);
																}
															});
														}
													);
												}
												b(z, k);
											};
										R(
											ae,
											(z) => {
												e(h) === null ? z(Q) : z(oe, !1);
											},
											!0
										);
									}
									b(x, S);
								};
							R(g, (x) => {
								e(h) ? x(C, !1) : x(w);
							});
						}
						var j = y(g, 2);
						{
							var K = (x) => {
								const S = O(() => e(P).findIndex((k) => k.id === e(o).id)),
									ae = O(() => e(V).targetIndex === e(S));
								var Q = le(),
									oe = Z(Q);
								{
									var z = (k) => {
										var M = It();
										(fe(M, '', {}, { transform: 'translateY(-50%)' }), b(k, M));
									};
									R(oe, (k) => {
										e(ae) && k(z);
									});
								}
								b(x, Q);
							};
							R(j, (x) => {
								e(V) && x(K);
							});
						}
						(c(m),
							st(
								m,
								(x, S) => Re?.(x, S),
								() => [e(o).id, e(o).component]
							),
							H(() => {
								(ue(m, 'data-widget-id', e(o).id),
									(v = fe(m, '', v, {
										'grid-column': `span ${e(o).size.w ?? ''}`,
										'grid-row': `span ${e(o).size.h ?? ''}`,
										'touch-action': 'manipulation',
										'min-height': `${e(o).size.h * 180}px`
									})));
							}),
							it(
								m,
								() => ut,
								() => ({ duration: 300 })
							),
							b(d, m));
					}
				),
					c(i),
					b(t, i));
			},
			Ne = (t) => {
				var i = Pt(),
					r = u(i),
					s = u(r);
				(A(s, 'icon', 'mdi:view-dashboard-outline'), A(s, 'width', '80'), X(s, 1, 'mb-6 text-tertiary-500 drop-shadow-lg dark:text-primary-500'));
				var a = y(s, 6);
				a.__click = () => f(q, !0);
				var d = u(a);
				(A(d, 'icon', 'mdi:plus'), A(d, 'width', '22'), X(d, 1, 'mr-2'), ce(), c(a), c(r), c(i), b(t, i));
			};
		R(He, (t) => {
			e(P).length > 0 ? t(Fe) : t(Ne, !1);
		});
	}
	(c(We),
		c(Ie),
		c(J),
		nt(
			J,
			(t) => f(B, t),
			() => e(B)
		));
	var Ge = y(J, 2);
	{
		var Je = (t) => {
			var i = kt(),
				r = u(i),
				s = u(r),
				a = y(u(s), 2);
			a.__click = () => f(re, !1);
			var d = u(a);
			(A(d, 'icon', 'mdi:close'), X(d, 1, 'h-5 w-5'), c(a), c(s));
			var o = y(s, 2),
				h = u(o);
			(dt(h, {}), c(o));
			var m = y(o, 2),
				v = u(m),
				g = u(v);
			(A(g, 'icon', 'mdi:shield-check'), X(g, 1, 'mr-1 inline h-4 w-4'), ce(), c(v));
			var w = y(v, 2),
				C = u(w);
			((C.__click = () => f(re, !1)), c(w), c(m), c(r), c(i), b(t, i));
		};
		R(Ge, (t) => {
			e(re) && t(Je);
		});
	}
	(b(E, he), et());
}
tt(['click', 'pointerdown']);
export { Ft as component };
//# sourceMappingURL=16.CLoabDNs.js.map
