import { i as y } from './zi73tRJP.js';
import { p as ct, d as C, x as lt, z as le, b as o, g as i, c as l, s as x, r as s, t as b, a as dt, f as ee } from './DrlZFkx8.js';
import { f as h, s as Y, a as f, c as te, d as ft } from './CTjXDULS.js';
import { s as ut } from './DhHAlOU0.js';
import { e as Le, i as Me } from './BXe5mj2j.js';
import { b as m, a as N, c as T, d as Ie, s as vt } from './MEFvoR_D.js';
import { b as ht } from './YQp2a1pQ.js';
import { p as v } from './DePHBZW_.js';
import { l as de } from './BvngfGKt.js';
var gt = h('<iconify-icon></iconify-icon>', 2),
	wt = h('<span> </span>'),
	mt = h('<span class="flex items-center gap-1"><iconify-icon></iconify-icon> <!></span>', 2),
	_t = h('<div class="flex items-center gap-2 text-xs text-surface-500"><span> </span> <!></div>'),
	pt = h(
		'<button class="variant-outline-surface btn-icon" aria-label="Refresh widget" title="Refresh data"><iconify-icon></iconify-icon></button>',
		2
	),
	yt = h('<iconify-icon></iconify-icon>', 2),
	xt = h('<button><span> </span> <!></button>'),
	bt = h(
		'<div class="absolute right-0 top-full z-50 mt-2 w-48 rounded-md border border-surface-200 bg-white py-1 shadow-xl dark:text-surface-50 dark:bg-surface-800" style="z-index: 9999; position: absolute;"></div>'
	),
	zt = h('<div class="loading-state text-text-400 absolute inset-0 flex items-center justify-center text-base">Loading...</div>'),
	kt = h(
		'<div class="error-state absolute inset-0 flex flex-col items-center justify-center p-2 text-center text-base text-error-500"><iconify-icon></iconify-icon> <span> </span></div>',
		2
	),
	Ct = h('<pre class="text-text-700 dark:text-text-200 whitespace-pre-wrap break-all text-sm" style="width: 100%; height: 100%;"> </pre>'),
	Dt = h('<div class="text-text-400 absolute inset-0 flex items-center justify-center text-base">No content.</div>'),
	St = h('<div role="button" tabindex="0"><iconify-icon></iconify-icon></div>', 2),
	Rt = h('<div class="resize-handles pointer-events-none absolute inset-0"></div>'),
	Lt = h(
		'<div class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-primary-500/10 backdrop-blur-sm"><div class="rounded-lg bg-primary-500 px-4 py-2 text-white shadow-lg"> </div></div>'
	),
	Mt = h(
		'<article class="widget-base-container text-text-900 dark:text-text-100 group relative flex h-full flex-col rounded-lg border border-surface-200 bg-white shadow-sm transition-all duration-150 focus-within:ring-2 focus-within:ring-primary-200 dark:text-surface-50 dark:bg-surface-800" style="overflow: visible;"><header class="widget-header flex cursor-grab items-center justify-between border-b border-gray-100 bg-white py-2 pl-4 pr-2 dark:text-surface-50 dark:bg-surface-800" style="touch-action: none; overflow: visible; position: relative; z-index: 10;"><div class="flex flex-1 flex-col gap-0.5"><h2 class="font-display text-text-900 dark:text-text-100 flex items-center gap-2 truncate text-base font-semibold tracking-tight"><!> <span class="truncate"> </span></h2> <!></div> <div class="flex items-center gap-1"><!> <div class="relative" style="overflow: visible;"><button class="variant-outline-surface btn-icon" aria-label="Change widget size"><iconify-icon></iconify-icon></button> <!></div> <button class="variant-outline-surface btn-icon"><iconify-icon></iconify-icon></button></div></header> <section class="widget-body relative min-h-[50px] flex-1 bg-white px-3 pb-2 dark:bg-surface-800" style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: stretch; align-items: stretch;"><!></section> <!> <!></article>',
		2
	);
function Bt(Ee, u) {
	ct(u, !0);
	const j = v(u, 'label', 3, 'Widget'),
		Te = v(u, 'theme', 3, 'light'),
		fe = v(u, 'icon', 3, void 0),
		R = v(u, 'endpoint', 3, void 0),
		ue = v(u, 'pollInterval', 3, 0),
		ve = v(u, 'widgetId', 3, void 0),
		he = v(u, 'children', 3, void 0),
		L = v(u, 'size', 19, () => ({ w: 1, h: 1 })),
		ge = v(u, 'onSizeChange', 3, (e) => {}),
		we = v(u, 'resizable', 3, !0),
		je = v(u, 'onCloseRequest', 3, () => {}),
		me = v(u, 'initialData', 3, void 0),
		_e = v(u, 'onDataLoaded', 3, (e) => {}),
		pe = v(u, 'showRefreshButton', 3, !1),
		W = v(u, 'cacheKey', 3, void 0),
		We = v(u, 'cacheTTL', 3, 3e5),
		G = v(u, 'retryCount', 3, 3),
		Pe = v(u, 'retryDelay', 3, 1e3);
	let ie = C(lt({})),
		k = C(!1),
		P = C(null),
		M = C(void 0),
		H = C(0),
		O = C(0);
	le(() => {
		me() !== void 0 && o(M, me());
	});
	function Xe() {
		if (!W() || typeof window > 'u') return null;
		try {
			const e = localStorage.getItem(`widget_cache_${W()}`);
			if (!e) return null;
			const { data: t, timestamp: a } = JSON.parse(e);
			return Date.now() - a > We() ? (localStorage.removeItem(`widget_cache_${W()}`), null) : t;
		} catch {
			return null;
		}
	}
	function Ye(e) {
		if (!(!W() || typeof window > 'u'))
			try {
				localStorage.setItem(`widget_cache_${W()}`, JSON.stringify({ data: e, timestamp: Date.now() }));
			} catch (t) {
				de.warn(`Failed to cache widget data for ${j()}:`, t);
			}
	}
	async function K(e = 0) {
		if (!R()) {
			o(k, !1);
			return;
		}
		if (e === 0) {
			const t = Xe();
			if (t) {
				(o(M, t, !0), _e()(t), o(k, !1));
				return;
			}
		}
		(o(k, !0), o(P, null), o(O, e, !0));
		try {
			const t = R().includes('?') ? '&' : '?',
				a = await fetch(`${R()}${t}_=${Date.now()}`);
			if (!a.ok) throw new Error(`HTTP ${a.status}: ${a.statusText}`);
			const r = await a.json();
			(o(M, r, !0), o(H, Date.now(), !0), _e()(r), Ye(r), o(O, 0), o(P, null));
		} catch (t) {
			const a = t instanceof Error ? t.message : 'Failed to fetch data';
			if (e < G()) {
				de.warn(`[${j()}] Retry ${e + 1}/${G()}:`, a);
				const r = Pe() * Math.pow(2, e);
				return (await new Promise((n) => setTimeout(n, r)), K(e + 1));
			}
			(o(P, a, !0), de.error(`[${j()}] Failed after ${G()} attempts:`, i(P)));
		} finally {
			o(k, !1);
		}
	}
	async function ye() {
		(W() && typeof window < 'u' && localStorage.removeItem(`widget_cache_${W()}`), o(O, 0), await K());
	}
	le(() => {
		if (!R()) {
			o(k, !1);
			return;
		}
		let e = !0,
			t;
		return (
			(async () => e && (await K()))(),
			ue() > 0 &&
				(t = setInterval(() => {
					e && K();
				}, ue())),
			() => {
				((e = !1), clearInterval(t));
			}
		);
	});
	function Fe(e, t) {
		o(ie, { ...i(ie), [e]: t }, !0);
	}
	function Be(e) {
		return i(ie)[e];
	}
	function xe(e) {
		return `${e.w}×${e.h}`;
	}
	function Ne() {
		if (!i(H)) return '';
		const e = Math.floor((Date.now() - i(H)) / 1e3);
		if (e < 60) return `${e}s ago`;
		const t = Math.floor(e / 60);
		return t < 60 ? `${t}m ago` : `${Math.floor(t / 60)}h ago`;
	}
	let F = C(void 0),
		X = C(!1),
		U = C(!1),
		I = C(null);
	const Oe = [
		{ w: 1, h: 1 },
		{ w: 2, h: 1 },
		{ w: 3, h: 1 },
		{ w: 4, h: 1 },
		{ w: 1, h: 2 },
		{ w: 2, h: 2 },
		{ w: 3, h: 2 },
		{ w: 4, h: 2 },
		{ w: 1, h: 3 },
		{ w: 2, h: 3 },
		{ w: 3, h: 3 },
		{ w: 4, h: 3 },
		{ w: 1, h: 4 },
		{ w: 2, h: 4 },
		{ w: 3, h: 4 },
		{ w: 4, h: 4 }
	];
	function Je(e) {
		if (!we() || !i(F)) return;
		(e.preventDefault(), e.stopPropagation());
		const t = e.target,
			a = t.dataset.direction || t.closest('[data-direction]')?.getAttribute('data-direction');
		o(U, !0);
		const r = e.clientX,
			n = e.clientY,
			d = i(F).closest('.responsive-dashboard-grid');
		if (!d) {
			o(U, !1);
			return;
		}
		const c = parseFloat(getComputedStyle(d).gap) || 16,
			g = 4,
			p = c * (g - 1),
			_ = (d.offsetWidth - p) / g,
			w = 180,
			z = L().w,
			D = L().h,
			B = (S) => {
				const E = S.clientX - r,
					$ = S.clientY - n;
				let q = 0;
				a?.includes('e') ? (q = E / (_ + c)) : a?.includes('w') && (q = -E / (_ + c));
				let ce = 0;
				a?.includes('s') ? (ce = $ / (w + c)) : a?.includes('n') && (ce = -$ / (w + c));
				const rt = Math.round(z + q),
					nt = Math.round(D + ce),
					ot = Math.max(1, Math.min(4, rt)),
					st = Math.max(1, Math.min(4, nt));
				o(I, { w: ot, h: st }, !0);
			},
			A = () => {
				(window.removeEventListener('pointermove', B),
					window.removeEventListener('pointerup', A),
					o(U, !1),
					i(I) && (i(I).w !== L().w || i(I).h !== L().h) && ge()(i(I)),
					o(I, null));
			};
		(window.addEventListener('pointermove', B), window.addEventListener('pointerup', A, { once: !0 }));
	}
	function qe(e) {
		(ge()(e), o(X, !1));
	}
	function ae(e) {
		i(X) && i(F) && !i(F).contains(e.target) && o(X, !1);
	}
	le(
		() => (i(X) ? document.addEventListener('click', ae) : document.removeEventListener('click', ae), () => document.removeEventListener('click', ae))
	);
	var J = Mt(),
		re = l(J),
		ne = l(re),
		Q = l(ne),
		be = l(Q);
	{
		var Ge = (e) => {
			var t = gt();
			(b(() => m(t, 'icon', fe())), m(t, 'width', '24'), b(() => T(t, 1, Ie(Te() === 'light' ? 'text-tertiary-600' : 'text-primary-400'))), f(e, t));
		};
		y(be, (e) => {
			fe() && e(Ge);
		});
	}
	var ze = x(be, 2),
		He = l(ze, !0);
	(s(ze), s(Q));
	var Ke = x(Q, 2);
	{
		var Ue = (e) => {
			var t = _t(),
				a = l(t),
				r = l(a, !0);
			s(a);
			var n = x(a, 2);
			{
				var d = (c) => {
					var g = mt(),
						p = l(g);
					(m(p, 'icon', 'mdi:loading'), T(p, 1, 'animate-spin'), m(p, 'width', '10'));
					var _ = x(p, 2);
					{
						var w = (z) => {
							var D = wt(),
								B = l(D);
							(s(D), b(() => Y(B, `Retry ${i(O) ?? ''}/${G() ?? ''}`)), f(z, D));
						};
						y(_, (z) => {
							i(O) > 0 && z(w);
						});
					}
					(s(g), f(c, g));
				};
				y(n, (c) => {
					i(k) && c(d);
				});
			}
			(s(t), b((c) => Y(r, c), [Ne]), f(e, t));
		};
		y(Ke, (e) => {
			R() && i(H) && pe() && e(Ue);
		});
	}
	s(ne);
	var ke = x(ne, 2),
		Ce = l(ke);
	{
		var Qe = (e) => {
			var t = pt();
			t.__click = () => ye();
			var a = l(t);
			(m(a, 'icon', 'mdi:refresh'),
				m(a, 'width', '16'),
				s(t),
				b(() => {
					((t.disabled = i(k)), T(a, 1, Ie(i(k) ? 'animate-spin' : '')));
				}),
				f(e, t));
		};
		y(Ce, (e) => {
			R() && pe() && e(Qe);
		});
	}
	var oe = x(Ce, 2),
		V = l(oe);
	V.__click = () => o(X, !i(X));
	var De = l(V);
	(m(De, 'icon', 'mdi:dots-vertical'), m(De, 'width', '18'), s(V));
	var Ve = x(V, 2);
	{
		var Ze = (e) => {
			var t = bt();
			(Le(
				t,
				21,
				() => Oe,
				Me,
				(a, r) => {
					var n = xt();
					n.__click = () => qe(i(r));
					var d = l(n),
						c = l(d, !0);
					s(d);
					var g = x(d, 2);
					{
						var p = (_) => {
							var w = yt();
							(m(w, 'icon', 'mdi:check'), T(w, 1, 'text-primary-500'), f(_, w));
						};
						y(g, (_) => {
							L().w === i(r).w && L().h === i(r).h && _(p);
						});
					}
					(s(n),
						b(
							(_) => {
								(T(
									n,
									1,
									`flex w-full items-center justify-between px-4 py-2 text-sm transition-colors hover:bg-surface-100 dark:hover:bg-surface-700 ${L().w === i(r).w && L().h === i(r).h ? 'font-bold text-primary-500' : ''}`
								),
									Y(c, _));
							},
							[() => xe(i(r))]
						),
						f(a, n));
				}
			),
				s(t),
				f(e, t));
		};
		y(Ve, (e) => {
			i(X) && e(Ze);
		});
	}
	s(oe);
	var Z = x(oe, 2);
	Z.__click = function (...e) {
		je()?.apply(this, e);
	};
	var Se = l(Z);
	(m(Se, 'icon', 'mdi:close'), m(Se, 'width', '18'), s(Z), s(ke), s(re));
	var se = x(re, 2),
		Ae = l(se);
	{
		var $e = (e) => {
				var t = zt();
				f(e, t);
			},
			et = (e) => {
				var t = te(),
					a = ee(t);
				{
					var r = (d) => {
							var c = kt(),
								g = l(c);
							(m(g, 'icon', 'mdi:alert-circle-outline'), m(g, 'width', '24'), T(g, 1, 'mb-1'));
							var p = x(g, 2),
								_ = l(p, !0);
							(s(p), s(c), b(() => Y(_, i(P))), f(d, c));
						},
						n = (d) => {
							var c = te(),
								g = ee(c);
							{
								var p = (w) => {
										var z = te(),
											D = ee(z);
										(ut(D, he, () => ({ data: i(M), updateWidgetState: Fe, getWidgetState: Be, refresh: ye, isLoading: i(k), error: i(P) })),
											f(w, z));
									},
									_ = (w) => {
										var z = te(),
											D = ee(z);
										{
											var B = (S) => {
													var E = Ct(),
														$ = l(E, !0);
													(s(E), b((q) => Y($, q), [() => JSON.stringify(i(M), null, 2)]), f(S, E));
												},
												A = (S) => {
													var E = Dt();
													f(S, E);
												};
											y(
												D,
												(S) => {
													i(M) ? S(B) : S(A, !1);
												},
												!0
											);
										}
										f(w, z);
									};
								y(
									g,
									(w) => {
										he() ? w(p) : w(_, !1);
									},
									!0
								);
							}
							f(d, c);
						};
					y(
						a,
						(d) => {
							R() && i(P) && !i(M) ? d(r) : d(n, !1);
						},
						!0
					);
				}
				f(e, t);
			};
		y(Ae, (e) => {
			R() && i(k) && !i(M) ? e($e) : e(et, !1);
		});
	}
	s(se);
	var Re = x(se, 2);
	{
		var tt = (e) => {
			var t = Rt();
			(Le(
				t,
				20,
				() => [
					{ dir: 'nw', classes: 'top-0 left-0 cursor-nw-resize', icon: 'clarity:drag-handle-corner-line', size: '12px', rotation: 'rotate-180' },
					{
						dir: 'n',
						classes: 'top-0 left-1/2 cursor-n-resize',
						icon: 'mdi:drag-vertical',
						size: '12px',
						style: 'transform: translateX(-50%) rotate(90deg);',
						rotation: ''
					},
					{ dir: 'ne', classes: 'top-0 right-0 cursor-ne-resize', icon: 'clarity:drag-handle-corner-line', size: '12px', rotation: '-rotate-90' },
					{
						dir: 'e',
						classes: 'top-1/2 right-0 cursor-e-resize',
						icon: 'mdi:drag-vertical',
						size: '12px',
						style: 'transform: translateY(-50%) rotate(180deg);',
						rotation: ''
					},
					{ dir: 'se', classes: 'bottom-0 right-0 cursor-se-resize', icon: 'clarity:drag-handle-corner-line', size: '12px', rotation: '' },
					{
						dir: 's',
						classes: 'bottom-0 left-1/2 cursor-s-resize',
						icon: 'mdi:drag-vertical',
						size: '12px',
						style: 'transform: translateX(-50%) rotate(90deg);',
						rotation: ''
					},
					{ dir: 'sw', classes: 'bottom-0 left-0 cursor-sw-resize', icon: 'clarity:drag-handle-corner-line', size: '12px', rotation: 'rotate-90' },
					{
						dir: 'w',
						classes: 'top-1/2 left-0 cursor-w-resize',
						icon: 'mdi:drag-vertical',
						size: '12px',
						style: 'transform: translateY(-50%) rotate(180deg);',
						rotation: ''
					}
				],
				Me,
				(a, r) => {
					var n = St();
					((n.__pointerdown = Je),
						(n.__keydown = (c) => {
							(c.key === 'Enter' || c.key === ' ') && c.preventDefault();
						}));
					var d = l(n);
					(b(() => m(d, 'icon', r.icon)),
						b(() => m(d, 'width', r.size)),
						T(d, 1, 'text-gray-900 drop-shadow-sm dark:text-surface-300'),
						s(n),
						b(() => {
							(T(
								n,
								1,
								`pointer-events-auto absolute z-20 flex items-center justify-center opacity-0 transition-all duration-200 hover:scale-125 hover:opacity-100 group-hover:opacity-60 ${r.classes ?? ''} ${r.rotation ?? ''}`
							),
								vt(n, `width: 16px; height: 16px; ${(r.style || '') ?? ''}`),
								N(n, 'data-direction', r.dir),
								N(n, 'title', `Resize widget by dragging ${r.dir ?? ''}`),
								N(n, 'aria-label', `Resize widget ${r.dir ?? ''}`));
						}),
						f(a, n));
				}
			),
				s(t),
				f(e, t));
		};
		y(Re, (e) => {
			we() && e(tt);
		});
	}
	var it = x(Re, 2);
	{
		var at = (e) => {
			var t = Lt(),
				a = l(t),
				r = l(a);
			(s(a), s(t), b((n) => Y(r, `Snap to: ${n ?? ''}`), [() => xe(i(I))]), f(e, t));
		};
		y(it, (e) => {
			i(U) && i(I) && e(at);
		});
	}
	(s(J),
		ht(
			J,
			(e) => o(F, e),
			() => i(F)
		),
		b(() => {
			(N(J, 'aria-labelledby', `widget-title-${(ve() || j()) ?? ''}`),
				N(Q, 'id', `widget-title-${(ve() || j()) ?? ''}`),
				Y(He, j()),
				N(Z, 'aria-label', `Remove ${j() ?? ''} widget`));
		}),
		f(Ee, J),
		dt());
}
ft(['click', 'pointerdown', 'keydown']);
export { Bt as B };
//# sourceMappingURL=KG4G7ZS9.js.map
