import { i as Pe } from './zi73tRJP.js';
import { p as Le, z as Ce, g as e, d as v, b as i, ai as I, u as T, a as ze, f as X, c as o, r as s, t as D, s as f, n as Ie } from './DrlZFkx8.js';
import { f as L, s as F, a as P, d as Te } from './CTjXDULS.js';
import { e as Y, i as Z } from './BXe5mj2j.js';
import { r as q, e as De, b, c as A, a as Fe, s as Re } from './MEFvoR_D.js';
import { b as N } from './D4QnGYgQ.js';
import { p as g } from './DePHBZW_.js';
import { B as Ue } from './KG4G7ZS9.js';
import { T as je } from './_e9Aq20d.js';
const Xe = { name: 'Logs', icon: 'mdi:text-box-outline', defaultSize: { w: 2, h: 2 } };
var Ee = L('<option> </option>'),
	We = L(
		'<div class="flex items-center gap-1 rounded border border-surface-200 bg-surface-50/50 px-1 py-1 text-xs dark:text-surface-50 dark:bg-surface-800/30" role="listitem"><iconify-icon></iconify-icon> <span class="w-8 shrink-0 text-xs text-surface-500 dark:text-surface-50"> </span> <span> </span> <span class="text-text-900 dark:text-text-100 flex-1 select-text truncate text-xs" style="user-select: text;"> </span></div>',
		2
	),
	Be = L(
		'<div class="flex flex-col gap-1 overflow-y-auto" role="list" aria-label="System log entries"></div> <div class="mt-auto flex items-center justify-between pt-2"><!></div>',
		1
	),
	Me = L(
		'<div class="flex flex-1 flex-col items-center justify-center py-6 text-xs text-gray-500 dark:text-gray-400" role="status" aria-live="polite"><iconify-icon></iconify-icon> <span>No logs found</span></div>',
		2
	),
	Oe = L(
		'<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Log controls"><div class="flex flex-1 gap-2"><select class="rounded border border-surface-300 bg-white px-8 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500" aria-label="Filter log level"></select> <input type="text" placeholder="Search logs..." class="rounded border border-surface-300 bg-white px-3 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500" aria-label="Search logs"/></div> <div class="flex items-center gap-2"><input type="date" class="rounded border border-surface-300 bg-white px-2 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500" aria-label="Start date"/> <input type="date" class="rounded border border-surface-300 bg-white px-2 py-1 text-sm text-surface-700 shadow-sm focus:border-primary-400 focus:ring-2 focus:ring-primary-200 dark:border-surface-400 dark:bg-surface-800 dark:text-surface-100 dark:focus:border-primary-500" aria-label="End date"/></div></div> <!>',
		1
	);
function Ye($, n) {
	Le(n, !0);
	const ee = g(n, 'label', 3, 'System Logs'),
		te = g(n, 'icon', 3, 'mdi:file-document-outline'),
		ae = g(n, 'widgetId', 3, void 0),
		Q = g(n, 'size', 19, () => ({ w: 2, h: 2 })),
		re = g(n, 'onSizeChange', 3, (t) => {}),
		se = g(n, 'onRemove', 3, () => {}),
		le = g(n, 'endpoint', 3, '/api/dashboard/logs'),
		ie = g(n, 'pollInterval', 3, 15e3);
	let m = v(1),
		R = v(20),
		x = v('all'),
		h = v(''),
		_ = v(''),
		y = v(''),
		U = null,
		w = v(0);
	const oe = () => {
		const t = new URLSearchParams();
		return (
			e(x) !== 'all' && t.append('level', e(x)),
			e(h) && t.append('search', e(h)),
			e(_) && t.append('startDate', e(_)),
			e(y) && t.append('endDate', e(y)),
			t.append('page', e(m).toString()),
			t.append('limit', e(R).toString()),
			t.toString()
		);
	};
	Ce(() => {
		(U && clearTimeout(U),
			(U = setTimeout(() => {
				((e(x) !== 'all' || e(h) !== '' || e(_) !== '' || e(y) !== '') && e(m) !== 1 && i(m, 1), I(w));
			}, 300)));
	});
	const ne = (t) => {
			(i(m, t, !0), I(w));
		},
		de = (t) => {
			(i(R, t, !0), i(m, 1), I(w));
		},
		ce = (t) => {
			(i(x, t, !0), i(m, 1), I(w));
		},
		ue = T(() => `${le()}?${oe()}&_t=${e(w)}`),
		fe = [
			{ value: 'all', label: 'All Levels' },
			{ value: 'fatal', label: 'Fatal' },
			{ value: 'error', label: 'Error' },
			{ value: 'warn', label: 'Warn' },
			{ value: 'info', label: 'Info' },
			{ value: 'debug', label: 'Debug' },
			{ value: 'trace', label: 'Trace' }
		],
		G = (t) => {
			switch (t.toLowerCase()) {
				case 'fatal':
					return 'text-purple-500 dark:text-purple-400';
				case 'error':
					return 'text-red-500 dark:text-red-400';
				case 'warn':
					return 'text-yellow-500 dark:text-yellow-400';
				case 'info':
					return 'text-green-500 dark:text-green-400';
				case 'debug':
					return 'text-blue-500 dark:text-blue-400';
				case 'trace':
					return 'text-cyan-500 dark:text-cyan-400';
				default:
					return 'text-gray-700 dark:text-gray-300';
			}
		};
	(Ue($, {
		get label() {
			return ee();
		},
		get endpoint() {
			return e(ue);
		},
		get pollInterval() {
			return ie();
		},
		get icon() {
			return te();
		},
		get widgetId() {
			return ae();
		},
		get size() {
			return Q();
		},
		get onSizeChange() {
			return re();
		},
		get onCloseRequest() {
			return se();
		},
		children: (ge, pe) => {
			let d = () => pe?.().data;
			var H = Oe(),
				j = X(H),
				E = o(j),
				k = o(E);
			((k.__change = (a) => ce(a.target.value)),
				Y(
					k,
					21,
					() => fe,
					Z,
					(a, c, l, B) => {
						let C = () => e(c).value,
							S = () => e(c).label;
						var r = Ee(),
							p = o(r, !0);
						s(r);
						var u = {};
						(D(() => {
							(F(p, S()), u !== (u = C()) && (r.value = (r.__value = C()) ?? ''));
						}),
							P(a, r));
					}
				),
				s(k));
			var J = f(k, 2);
			(q(J), s(E));
			var K = f(E, 2),
				W = o(K);
			q(W);
			var V = f(W, 2);
			(q(V), s(K), s(j));
			var ve = f(j, 2);
			{
				var me = (a) => {
						var c = Be(),
							l = X(c);
						(Y(
							l,
							21,
							() => d().logs,
							Z,
							(S, r) => {
								var p = We(),
									u = o(p);
								(b(u, 'icon', 'mdi:circle'), b(u, 'width', '8'), D(() => b(u, 'aria-label', `${e(r).level ?? ''} log level`)));
								var M = f(u, 2),
									be = o(M, !0);
								s(M);
								var z = f(M, 2),
									he = o(z, !0);
								s(z);
								var O = f(z, 2),
									_e = o(O, !0);
								(s(O),
									s(p),
									D(
										(ye, we, ke, Se) => {
											(A(u, 1, `${ye ?? ''} shrink-0`),
												F(be, we),
												A(z, 1, `w-14 shrink-0 text-xs font-medium ${ke ?? ''}`),
												F(he, Se),
												Fe(O, 'title', e(r).message),
												F(_e, e(r).message));
										},
										[
											() => G(e(r).level),
											() => new Date(e(r).timestamp).toLocaleTimeString('en-US', { hour12: !1, hour: '2-digit', minute: '2-digit' }),
											() => G(e(r).level),
											() => e(r).level.toUpperCase()
										]
									),
									P(S, p));
							}
						),
							s(l));
						var B = f(l, 2),
							C = o(B);
						{
							let S = T(() => d().page || 1),
								r = T(() => d().total || 0),
								p = T(() => (d().hasMore ? (d().page || 1) + 1 : d().page || 1));
							je(C, {
								get currentPage() {
									return e(S);
								},
								get rowsPerPage() {
									return e(R);
								},
								rowsPerPageOptions: [10, 20, 50, 100],
								get totalItems() {
									return e(r);
								},
								get pagesCount() {
									return e(p);
								},
								onUpdatePage: ne,
								onUpdateRowsPerPage: de
							});
						}
						(s(B), D(() => Re(l, `max-height: calc(${Q().h ?? ''} * 120px - 120px);`)), P(a, c));
					},
					xe = (a) => {
						var c = Me(),
							l = o(c);
						(b(l, 'icon', 'mdi:file-remove-outline'),
							b(l, 'width', '32'),
							A(l, 1, 'mb-2 text-surface-400 dark:text-surface-500'),
							b(l, 'aria-hidden', 'true'),
							Ie(2),
							s(c),
							P(a, c));
					};
				Pe(ve, (a) => {
					d() && d().logs && d().logs.length > 0 ? a(me) : a(xe, !1);
				});
			}
			(De(
				k,
				() => e(x),
				(a) => i(x, a)
			),
				N(
					J,
					() => e(h),
					(a) => i(h, a)
				),
				N(
					W,
					() => e(_),
					(a) => i(_, a)
				),
				N(
					V,
					() => e(y),
					(a) => i(y, a)
				),
				P(ge, H));
		},
		$$slots: { default: !0 }
	}),
		ze());
}
Te(['change']);
export { Ye as default, Xe as widgetMeta };
//# sourceMappingURL=DkqpTttL.js.map
