import { i as A } from '../chunks/zi73tRJP.js';
import {
	p as Ne,
	c as i,
	g as e,
	u as ee,
	s as p,
	t as B,
	r,
	a as Te,
	d as re,
	x as he,
	z as De,
	b as C,
	f as ge,
	n as Se,
	A as Fe
} from '../chunks/DrlZFkx8.js';
import { d as Ie, f as x, s as R, a as w, e as me, c as Je } from '../chunks/CTjXDULS.js';
import { b as f, c as I, d as Re, a as _e, r as Qe, s as $e } from '../chunks/MEFvoR_D.js';
import { g as He } from '../chunks/DHPSYX_z.js';
import { p as et } from '../chunks/CxX94NXM.js';
import { l as ke } from '../chunks/BvngfGKt.js';
import { e as Pe, u as tt, f as Me, d as ot, s as nt, g as rt } from '../chunks/-PV6rnhC.js';
import { s as ze } from '../chunks/BRE7FZu4.js';
import { P as at } from '../chunks/C6jjkVLf.js';
import { e as Ue } from '../chunks/BXe5mj2j.js';
import { b as Be } from '../chunks/0XeaN6pZ.js';
import { a as Ae } from '../chunks/BEiD40NV.js';
import { b as We } from '../chunks/D4QnGYgQ.js';
import { p as Xe } from '../chunks/DePHBZW_.js';
import { d as Oe, T as Le } from '../chunks/BH6PMYIi.js';
import { f as Ge } from '../chunks/TC87idKr.js';
import { I as it } from '../chunks/DOA-aSm7.js';
import { ax as st, ay as ct, o as lt, az as je, R as dt, aA as ut, aB as vt, aC as Ke, aD as Ve } from '../chunks/N8Jg0v49.js';
import { t as Ee } from '../chunks/C-hhfhAN.js';
import { modalState as ft } from '../chunks/GeUt2_20.js';
var pt = x(
		'<button type="button" class="btn-icon preset-tonal hover:preset-filled transition-all duration-200 hover:scale-110 svelte-1cjg9nl"><iconify-icon></iconify-icon></button>',
		2
	),
	mt = x('<div class="w-10 svelte-1cjg9nl"></div>'),
	gt = x('<div class="absolute -top-1 -right-1 w-2 h-2 bg-tertiary-500 rounded-full animate-pulse svelte-1cjg9nl"></div>'),
	yt = x(
		'<span class="badge font-semibold bg-tertiary-500 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm uppercase shadow-sm svelte-1cjg9nl">Category</span>'
	),
	_t = x(
		'<span class="badge font-semibold bg-surface-500 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm uppercase shadow-sm svelte-1cjg9nl">Collection</span>'
	),
	ht = x(
		'<div class="relative group/desc svelte-1cjg9nl"><span class="italic text-sm opacity-70 truncate w-full max-w-[500px] text-left hover:opacity-100 transition-opacity duration-200 svelte-1cjg9nl"> </span></div>'
	),
	bt = x('<div class="flex-1 px-4 min-w-0 flex justify-start svelte-1cjg9nl"><!></div>'),
	wt = x(
		'<span class="badge bg-surface-200 dark:bg-surface-700 text-surface-900 dark:text-surface-100 px-3 py-1 rounded-sm font-mono text-xs shadow-sm svelte-1cjg9nl"> </span>'
	),
	xt = x(
		'<div role="button" tabindex="0"><!> <div class="relative svelte-1cjg9nl"><iconify-icon></iconify-icon> <!></div> <div class="flex flex-col gap-1 min-w-0 shrink svelte-1cjg9nl"><div class="flex items-center gap-1 sm:gap-2 flex-wrap svelte-1cjg9nl"><span class="font-bold text-sm sm:text-base leading-none truncate svelte-1cjg9nl"> </span> <!></div></div> <!> <!> <div class="flex gap-1 sm:gap-2 ml-auto shrink-0 transition-opacity duration-200 svelte-1cjg9nl"><button type="button" class="btn-icon preset-tonal hover:preset-filled rounded transition-all duration-200 hover:scale-110 svelte-1cjg9nl" title="Edit"><iconify-icon></iconify-icon></button> <button type="button" class="btn-icon preset-tonal hover:preset-filled rounded transition-all duration-200 hover:scale-110 svelte-1cjg9nl" title="Duplicate"><iconify-icon></iconify-icon></button> <button type="button" class="btn-icon preset-tonal hover:preset-filled rounded transition-all duration-200 hover:scale-110 svelte-1cjg9nl" title="Delete"><iconify-icon></iconify-icon></button> <div class="btn-icon preset-tonal rounded cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 flex items-center justify-center ml-2 hover:bg-surface-300 dark:hover:bg-surface-600 transition-all duration-200 hover:scale-110 svelte-1cjg9nl" aria-hidden="true" title="Drag to reorder"><iconify-icon></iconify-icon></div></div></div>',
		2
	);
function kt(L, a) {
	Ne(a, !0);
	const E = ee(() => a.item.name || 'Untitled'),
		d = ee(() => a.item.icon || (a.item.nodeType === 'category' ? 'bi:folder' : 'bi:collection')),
		o = ee(() => a.item.nodeType === 'category'),
		l = ee(() =>
			e(o)
				? 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-tertiary-500/10 to-tertiary-600/5 border-2 border-tertiary-500/30 flex items-center gap-2 sm:gap-3 mb-2 cursor-pointer hover:border-tertiary-500 hover:shadow-lg hover:from-tertiary-500/20 hover:to-tertiary-600/10 transition-all duration-300 ease-out min-w-0 overflow-hidden'
				: 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-surface-100 to-surface-50 dark:from-surface-700 dark:to-surface-800 border-2 border-l-4 border-surface-500/40 border-l-surface-500 flex items-center gap-2 sm:gap-3 mb-2 cursor-pointer hover:border-surface-500 hover:shadow-lg hover:translate-x-1 transition-all duration-300 ease-out min-w-0 overflow-hidden'
		),
		D = ee(() =>
			e(o)
				? 'text-tertiary-500 group-hover:text-tertiary-600 transition-colors duration-200'
				: 'text-error-500 group-hover:text-error-600 transition-colors duration-200'
		);
	function k(n) {
		n.target.closest('button') || a.toggle?.();
	}
	var N = xt();
	((N.__click = k), (N.__keydown = (n) => n.key === 'Enter' && k(n)));
	var Y = i(N);
	{
		var G = (n) => {
				var b = pt();
				b.__click = (Z) => {
					(Z.stopPropagation(), console.log('Toggle clicked', { toggle: a.toggle, isOpen: a.isOpen }), a.toggle?.());
				};
				var T = i(b);
				(B(() => f(T, 'icon', a.isOpen ? 'bi:chevron-down' : 'bi:chevron-right')),
					f(T, 'width', '20'),
					I(T, 1, 'transition-transform duration-200 svelte-1cjg9nl'),
					r(b),
					B(() => _e(b, 'aria-label', a.isOpen ? 'Collapse' : 'Expand')),
					w(n, b));
			},
			K = (n) => {
				var b = mt();
				w(n, b);
			};
		A(Y, (n) => {
			a.item.hasChildren || e(o) ? n(G) : n(K, !1);
		});
	}
	var ae = p(Y, 2),
		Q = i(ae);
	(B(() => f(Q, 'icon', e(d))), f(Q, 'width', '24'));
	var ie = p(Q, 2);
	{
		var se = (n) => {
			var b = gt();
			w(n, b);
		};
		A(ie, (n) => {
			e(o) && n(se);
		});
	}
	r(ae);
	var le = p(ae, 2),
		V = i(le),
		ce = i(V),
		de = i(ce, !0);
	r(ce);
	var te = p(ce, 2);
	{
		var oe = (n) => {
				var b = yt();
				w(n, b);
			},
			ue = (n) => {
				var b = _t();
				w(n, b);
			};
		A(te, (n) => {
			e(o) ? n(oe) : n(ue, !1);
		});
	}
	(r(V), r(le));
	var ve = p(le, 2);
	{
		var m = (n) => {
			var b = bt(),
				T = i(b);
			{
				var Z = (O) => {
					var P = ht(),
						fe = i(P),
						be = i(fe, !0);
					(r(fe),
						r(P),
						B(() => {
							(_e(fe, 'title', a.item.description), R(be, a.item.description));
						}),
						w(O, P));
				};
				A(T, (O) => {
					a.item.description && O(Z);
				});
			}
			(r(b), w(n, b));
		};
		A(ve, (n) => {
			ze.isDesktop && n(m);
		});
	}
	var g = p(ve, 2);
	{
		var y = (n) => {
			var b = wt(),
				T = i(b);
			(r(b), B(() => R(T, `/${a.item.slug ?? ''}`)), w(n, b));
		};
		A(g, (n) => {
			a.item.slug && n(y);
		});
	}
	var z = p(g, 2),
		F = i(z);
	F.__click = (n) => {
		(n.stopPropagation(), e(o) ? a.onEditCategory(a.item) : He(`/config/collectionbuilder/edit/${a.item.id}`));
	};
	var W = i(F);
	(f(W, 'icon', 'mdi:pencil-outline'), f(W, 'width', '18'), I(W, 1, 'text-primary-500 svelte-1cjg9nl'), r(F));
	var j = p(F, 2);
	j.__click = (n) => {
		(n.stopPropagation(), a.onDuplicate?.(a.item));
	};
	var M = i(j);
	(f(M, 'icon', 'mdi:content-copy'), f(M, 'width', '18'), I(M, 1, 'text-tertiary-500 svelte-1cjg9nl'), r(j));
	var U = p(j, 2);
	U.__click = (n) => {
		(n.stopPropagation(), a.onDelete?.(a.item));
	};
	var H = i(U);
	(f(H, 'icon', 'lucide:trash-2'), f(H, 'width', '18'), I(H, 1, 'text-error-500 svelte-1cjg9nl'), r(U));
	var v = p(U, 2),
		u = i(v);
	(f(u, 'icon', 'mdi:drag-vertical'),
		f(u, 'width', '22'),
		I(u, 1, 'svelte-1cjg9nl'),
		r(v),
		r(z),
		r(N),
		B(() => {
			(I(N, 1, Re(e(l)), 'svelte-1cjg9nl'), I(Q, 1, Re(e(D)), 'svelte-1cjg9nl'), R(de, e(E)));
		}),
		w(L, N),
		Te());
}
Ie(['click', 'keydown']);
function Ye(L, a = '') {
	let E = [];
	for (const d of L) {
		const o = d,
			l = String(o.id || o._id || crypto.randomUUID()),
			D = a ? `${a}.${l}` : l,
			{ children: k, ...N } = o,
			Y = {
				...N,
				id: l,
				name: o.name || 'Untitled',
				nodeType: o.type || o.nodeType || 'collection',
				icon: o.icon,
				path: D,
				parent: (a && a.split('.').pop()) || null,
				isDraggable: !0,
				isDropAllowed: !0
			};
		if ((E.push(Y), k && Array.isArray(k) && k.length > 0)) {
			const G = Ye(k, D);
			E = E.concat(G);
		}
	}
	return E;
}
function Ct(L) {
	const a = new Map();
	for (const d of L) {
		const o = d.parent || '__root__';
		(a.has(o) || a.set(o, []), a.get(o).push(d));
	}
	for (const [, d] of a)
		d.sort((o, l) => {
			const D = o.path.split('.'),
				k = l.path.split('.');
			return D[D.length - 1].localeCompare(k[k.length - 1]);
		});
	const E = new Map();
	for (const [, d] of a)
		d.forEach((o, l) => {
			E.set(o.id, l);
		});
	return L.map((d) => {
		let o;
		if (d.path && d.path.includes('.')) {
			const l = d.path.split('.');
			(l.pop(), (o = l.pop()));
		}
		return {
			...d,
			_id: d._id || d.id,
			id: void 0,
			parentId: o,
			name: d.name,
			icon: d.icon,
			nodeType: d.nodeType,
			path: d.path,
			order: E.get(d.id) ?? 0,
			parent: void 0,
			text: void 0
		};
	});
}
function qe(L) {
	const a = new Map();
	for (const o of L) a.set(o.id, { ...o });
	const E = new Map();
	for (const o of L) {
		const l = o.parent || '__root__';
		(E.has(l) || E.set(l, []), E.get(l).push(a.get(o.id)));
	}
	for (const [, o] of E) o.sort((l, D) => (l.order ?? 0) - (D.order ?? 0));
	function d(o, l) {
		const D = o || '__root__',
			k = E.get(D);
		k &&
			k.forEach((N, Y) => {
				const G = l ? `${l}.${N.id}` : N.id,
					K = a.get(N.id);
				(K && ((K.path = G), (K.order = Y), (K.parent = o)), d(N.id, G));
			});
	}
	return (d(null, ''), Array.from(a.values()));
}
var St = x('<div class="tree-node-wrapper svelte-1esk4n5"><!></div>'),
	Et = x('<div class="tree-children svelte-1esk4n5"></div>'),
	Dt = x('<div class="tree-children empty-drop-zone svelte-1esk4n5"><span class="empty-hint svelte-1esk4n5">Drop items here</span></div>'),
	jt = x('<div class="tree-node-container svelte-1esk4n5"><!> <!></div>'),
	Nt = x(
		'<button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 btn-icon preset-tonal hover:preset-filled transition-all svelte-1esk4n5" aria-label="Clear search"><iconify-icon></iconify-icon></button>',
		2
	),
	Tt = x('<iconify-icon></iconify-icon> <p class="svelte-1esk4n5"> </p>', 3),
	It = x('<iconify-icon></iconify-icon> <p class="svelte-1esk4n5">No categories or collections yet</p>', 3),
	At = x('<div class="text-center p-8 text-surface-500 svelte-1esk4n5"><!></div>'),
	Ot = x('<div class="tree-node-wrapper svelte-1esk4n5"><!></div>'),
	Pt = x('<div class="root-dnd-zone svelte-1esk4n5"></div>'),
	zt = x(
		'<div class="drop-to-root-zone svelte-1esk4n5"><iconify-icon></iconify-icon> <span class="svelte-1esk4n5">Drop here to move to root level</span></div>',
		2
	),
	Ft = x(
		'<div class="mb-4 flex flex-wrap items-center gap-2 svelte-1esk4n5"><div class="relative flex-1 min-w-[200px] svelte-1esk4n5"><iconify-icon></iconify-icon> <input type="text" placeholder="Search collections..." class="input w-full h-12 pl-10 pr-8 rounded shadow-sm svelte-1esk4n5"/> <!></div> <div class="flex gap-2 svelte-1esk4n5"><button type="button" class="btn preset-tonal hover:preset-filled transition-all shadow-sm svelte-1esk4n5" title="Expand All"><iconify-icon></iconify-icon> <span class="hidden sm:inline ml-1 svelte-1esk4n5">Expand All</span></button> <button type="button" class="btn preset-tonal hover:preset-filled transition-all shadow-sm svelte-1esk4n5" title="Collapse All"><iconify-icon></iconify-icon> <span class="hidden sm:inline ml-1 svelte-1esk4n5">Collapse All</span></button></div></div> <div class="collection-builder-tree relative w-full h-auto overflow-y-auto rounded p-2 svelte-1esk4n5"><!> <!></div>',
		3
	);
function Rt(L, a) {
	Ne(a, !0);
	const E = (s, t = Fe, c = Fe) => {
		var _ = jt(),
			h = i(_);
		{
			let J = ee(() => ({ ...t(), hasChildren: t().children && t().children.length > 0 })),
				X = ee(() => e(k).has(t().id));
			kt(h, {
				get item() {
					return e(J);
				},
				get isOpen() {
					return e(X);
				},
				toggle: () => se(t().id),
				onEditCategory: () => a.onEditCategory(g(t())),
				onDelete: () => a.onDeleteNode?.(g(t())),
				onDuplicate: () => a.onDuplicateNode?.(g(t()))
			});
		}
		var S = p(h, 2);
		{
			var $ = (J) => {
					var X = Et();
					(Ue(
						X,
						29,
						() => t().children,
						(ne) => ne.id,
						(ne, we) => {
							var pe = St(),
								ye = i(pe);
							(E(
								ye,
								() => e(we),
								() => c() + 1
							),
								r(pe),
								Be(
									pe,
									() => Ge,
									() => ({ duration: y })
								),
								w(ne, pe));
						}
					),
						r(X),
						Ae(
							X,
							(ne, we) => Oe?.(ne, we),
							() => ({ items: t().children, flipDurationMs: y, type: 'tree-items', dropFromOthersDisabled: !1, dropTargetStyle: {} })
						),
						me('consider', X, (ne) => de(ne, t().id)),
						me('finalize', X, (ne) => te(ne, t().id)),
						w(J, X));
				},
				q = (J) => {
					var X = Je(),
						ne = ge(X);
					{
						var we = (pe) => {
							var ye = Dt();
							(Ae(
								ye,
								(xe, Ze) => Oe?.(xe, Ze),
								() => ({ items: [], flipDurationMs: y, type: 'tree-items', dropFromOthersDisabled: !1, dropTargetStyle: {} })
							),
								me('consider', ye, (xe) => de(xe, t().id)),
								me('finalize', ye, (xe) => te(xe, t().id)),
								w(pe, ye));
						};
						A(
							ne,
							(pe) => {
								e(k).has(t().id) && t().nodeType === 'category' && pe(we);
							},
							!0
						);
					}
					w(J, X);
				};
			A(S, (J) => {
				e(k).has(t().id) && t().children && t().children.length > 0 ? J($) : J(q, !1);
			});
		}
		(r(_), B(() => $e(_, `margin-left: ${c() * 0.75}rem`)), w(s, _));
	};
	let d = Xe(a, 'contentNodes', 19, () => []),
		o = re(''),
		l = re(he([])),
		D = !1,
		k = re(he(new Set())),
		N = re(!1);
	De(() => {
		d().length > 0 &&
			(!D || e(l).length === 0) &&
			(C(l, Ye(d()), !0),
			(D = !0),
			e(l).forEach((s) => {
				s.parent || e(k).add(s.id);
			}),
			C(k, new Set(e(k)), !0));
	});
	const Y = ee(() => {
			if (!e(o).trim()) return e(l);
			const s = e(o).toLowerCase();
			return e(l).filter((t) => t.name.toLowerCase().includes(s));
		}),
		G = ee(() => {
			const s = e(Y),
				t = new Map();
			s.forEach((_) => {
				t.set(_.id, { ..._, children: [], level: 0 });
			});
			const c = [];
			return (
				s.forEach((_) => {
					const h = t.get(_.id);
					if (h)
						if (_.parent && t.has(_.parent)) {
							const S = t.get(_.parent);
							S && (S.children.push(h), (h.level = S.level + 1));
						} else c.push(h);
				}),
				c
			);
		}),
		K = ee(() => e(G));
	function ae() {
		C(k, new Set(e(l).map((s) => s.id)), !0);
	}
	function Q() {
		C(k, new Set(), !0);
	}
	function ie() {
		C(o, '');
	}
	function se(s) {
		(e(k).has(s) ? e(k).delete(s) : e(k).add(s), C(k, new Set(e(k)), !0));
	}
	function le(s) {
		const { items: t, info: c } = s.detail;
		(c.trigger === Le.DRAG_STARTED && C(N, !0), ce(t));
	}
	function V(s) {
		const { items: t } = s.detail;
		C(N, !1);
		const c = t.map((_) => ({ ..._, parent: null }));
		(ce(c), m());
	}
	function ce(s) {
		const t = new Set(s.map((h) => h.id)),
			c = [],
			_ = new Set();
		(s.forEach((h, S) => {
			(c.push({ ...ve(h), parent: null, order: S }),
				_.add(h.id),
				ue(h.id, e(l)).forEach((q) => {
					_.has(q.id) || (c.push(q), _.add(q.id));
				}));
		}),
			e(l).forEach((h) => {
				!_.has(h.id) && !t.has(h.id) && (c.some(($) => $.id === h.parent) || h.parent === null) && (c.push(h), _.add(h.id));
			}),
			C(l, qe(c), !0));
	}
	function de(s, t) {
		const { items: c, info: _ } = s.detail;
		(_.trigger === Le.DRAG_STARTED && C(N, !0), oe(c, t));
	}
	function te(s, t) {
		const { items: c } = s.detail;
		(C(N, !1), oe(c, t), m());
	}
	function oe(s, t) {
		const c = new Set(s.map((S) => S.id)),
			_ = [],
			h = new Set();
		(s.forEach((S, $) => {
			(_.push({ ...ve(S), parent: t, order: $ }),
				h.add(S.id),
				ue(S.id, e(l)).forEach((J) => {
					h.has(J.id) || (_.push(J), h.add(J.id));
				}));
		}),
			e(l).forEach((S) => {
				!h.has(S.id) && !c.has(S.id) && S.parent !== t && (_.push(S), h.add(S.id));
			}),
			C(l, qe(_), !0));
	}
	function ue(s, t) {
		const c = [];
		return (
			t
				.filter((h) => h.parent === s)
				.forEach((h) => {
					(c.push(h), c.push(...ue(h.id, t)));
				}),
			c
		);
	}
	function ve(s) {
		const { children: t, level: c, ..._ } = s;
		return _;
	}
	function m() {
		const s = Ct(e(l));
		setTimeout(() => {
			a.onNodeUpdate(s);
		}, 50);
	}
	function g(s) {
		const { children: t, level: c, parent: _, path: h, ...S } = s;
		return { ...S, _id: s._id || s.id, parentId: _ };
	}
	const y = 300;
	var z = Ft(),
		F = ge(z),
		W = i(F),
		j = i(W);
	(f(j, 'icon', 'mdi:magnify'), f(j, 'width', '18'), I(j, 1, 'absolute left-3 top-1/2 -translate-y-1/2 opacity-50 svelte-1esk4n5'));
	var M = p(j, 2);
	Qe(M);
	var U = p(M, 2);
	{
		var H = (s) => {
			var t = Nt();
			t.__click = ie;
			var c = i(t);
			(f(c, 'icon', 'mdi:close'), f(c, 'width', '16'), I(c, 1, 'svelte-1esk4n5'), r(t), w(s, t));
		};
		A(U, (s) => {
			e(o) && s(H);
		});
	}
	r(W);
	var v = p(W, 2),
		u = i(v);
	u.__click = ae;
	var n = i(u);
	(f(n, 'icon', 'mdi:unfold-more-horizontal'), f(n, 'width', '18'), I(n, 1, 'svelte-1esk4n5'), Se(2), r(u));
	var b = p(u, 2);
	b.__click = Q;
	var T = i(b);
	(f(T, 'icon', 'mdi:unfold-less-horizontal'), f(T, 'width', '18'), I(T, 1, 'svelte-1esk4n5'), Se(2), r(b), r(v), r(F));
	var Z = p(F, 2),
		O = i(Z);
	{
		var P = (s) => {
				var t = At(),
					c = i(t);
				{
					var _ = (S) => {
							var $ = Tt(),
								q = ge($);
							(f(q, 'icon', 'mdi:magnify-close'), f(q, 'width', '48'), I(q, 1, 'opacity-50 mb-2 svelte-1esk4n5'));
							var J = p(q, 2),
								X = i(J);
							(r(J), B(() => R(X, `No results found for "${e(o) ?? ''}"`)), w(S, $));
						},
						h = (S) => {
							var $ = It(),
								q = ge($);
							(f(q, 'icon', 'mdi:folder-open-outline'), f(q, 'width', '48'), I(q, 1, 'opacity-50 mb-2 svelte-1esk4n5'), Se(2), w(S, $));
						};
					A(c, (S) => {
						e(o) ? S(_) : S(h, !1);
					});
				}
				(r(t), w(s, t));
			},
			fe = (s) => {
				var t = Pt();
				(Ue(
					t,
					29,
					() => e(K),
					(c) => c.id,
					(c, _) => {
						var h = Ot(),
							S = i(h);
						(E(
							S,
							() => e(_),
							() => 0
						),
							r(h),
							Be(
								h,
								() => Ge,
								() => ({ duration: y })
							),
							w(c, h));
					}
				),
					r(t),
					Ae(
						t,
						(c, _) => Oe?.(c, _),
						() => ({ items: e(K), flipDurationMs: y, type: 'tree-items', dropFromOthersDisabled: !1, dropTargetStyle: {} })
					),
					me('consider', t, le),
					me('finalize', t, V),
					w(s, t));
			};
		A(O, (s) => {
			e(G).length === 0 ? s(P) : s(fe, !1);
		});
	}
	var be = p(O, 2);
	{
		var Ce = (s) => {
			var t = zt(),
				c = i(t);
			(f(c, 'icon', 'mdi:arrow-up'), f(c, 'width', '20'), I(c, 1, 'svelte-1esk4n5'), Se(2), r(t), w(s, t));
		};
		A(be, (s) => {
			e(N) && s(Ce);
		});
	}
	(r(Z),
		We(
			M,
			() => e(o),
			(s) => C(o, s)
		),
		w(L, z),
		Te());
}
Ie(['click']);
var Mt = x('<div class="rounded bg-error-500/10 p-2 text-error-500" role="alert"> </div>'),
	Ut = x('<span id="name-error" class="text-sm text-error-500"> </span>'),
	Bt = x('<span id="icon-error" class="text-sm text-error-500"> </span>'),
	Lt = x(
		'<button type="button" class="preset-filled-error-500 btn" aria-label="Delete category"><iconify-icon></iconify-icon> <span class="hidden md:inline"> </span></button>',
		2
	),
	Gt = x('<iconify-icon></iconify-icon>', 2),
	Kt = x(
		'<div class="modal-example-form space-y-4"><!> <form><label class="label" for="category_name"><span> </span> <input class="input" type="text" id="category_name"/> <!></label> <label class="label" for="icon-picker"><span>Icon</span> <!> <!></label> <footer><!> <div class="flex gap-2"><button type="button" class="preset-outlined-secondary-500 btn"> </button> <button type="submit" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"><!> </button></div></footer></form></div>'
	);
function Vt(L, a) {
	Ne(a, !0);
	const E = Xe(a, 'existingCategory', 19, () => ({ name: '', icon: '' })),
		d = he({ newCategoryName: '', newCategoryIcon: '' });
	let o = re(!1),
		l = re(null),
		D = re(he({}));
	De(() => {
		((d.newCategoryName = E().name ?? ''), (d.newCategoryIcon = E().icon ?? ''));
	});
	function k() {
		const v = {};
		return (
			d.newCategoryName.trim()
				? d.newCategoryName.length < 2 && (v.name = 'Category name must be at least 2 characters')
				: (v.name = 'Category name is required'),
			d.newCategoryIcon.trim() || (v.icon = 'Icon is required'),
			C(D, v, !0),
			Object.keys(v).length === 0
		);
	}
	async function N(v) {
		if ((v.preventDefault(), !k())) {
			ke.error('Form validation failed.');
			return;
		}
		(C(o, !0), C(l, null));
		try {
			a.close && (E()._id, a.close(d));
		} catch (u) {
			(ke.error('Error submitting category form:', u), C(l, u instanceof Error ? u.message : 'Error submitting form', !0));
		} finally {
			C(o, !1);
		}
	}
	async function Y() {
		if (E().nodeType === 'category' && Pe.value.some((u) => u.parentId === E()._id)) {
			C(l, 'Cannot delete category with nested items (collections or subcategories). Please move or delete them first.');
			return;
		}
		if (confirm(`Are you sure you wish to delete the category "${E().name}"? This action cannot be undone.`)) {
			(C(o, !0), C(l, null));
			try {
				const u = await fetch('/api/content-structure', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'updateContentStructure', items: [{ type: 'delete', node: E() }] })
				});
				if (!u.ok) {
					const T = await u.json();
					throw new Error(T.error || 'Failed to delete category');
				}
				const { success: n, contentStructure: b } = await u.json();
				if (!n) throw new Error('API reported failure to delete category.');
				((Pe.value = b), a.close?.(null));
			} catch (u) {
				(ke.error('Error deleting category:', u), C(l, u instanceof Error ? u.message : 'Failed to delete category', !0));
			} finally {
				C(o, !1);
			}
		}
	}
	var G = Kt(),
		K = i(G);
	{
		var ae = (v) => {
			var u = Mt(),
				n = i(u, !0);
			(r(u), B(() => R(n, e(l))), w(v, u));
		};
		A(K, (v) => {
			e(l) && v(ae);
		});
	}
	var Q = p(K, 2);
	I(Q, 1, 'modal-form border border-surface-500 p-4 space-y-4 rounded-xl');
	var ie = i(Q),
		se = i(ie),
		le = i(se, !0);
	r(se);
	var V = p(se, 2);
	Qe(V);
	var ce = p(V, 2);
	{
		var de = (v) => {
			var u = Ut(),
				n = i(u, !0);
			(r(u), B(() => R(n, e(D).name)), w(v, u));
		};
		A(ce, (v) => {
			e(D).name && v(de);
		});
	}
	r(ie);
	var te = p(ie, 2),
		oe = p(i(te), 2);
	it(oe, {
		get searchQuery() {
			return d.newCategoryIcon;
		},
		get iconselected() {
			return d.newCategoryIcon;
		},
		set iconselected(v) {
			d.newCategoryIcon = v;
		}
	});
	var ue = p(oe, 2);
	{
		var ve = (v) => {
			var u = Bt(),
				n = i(u, !0);
			(r(u), B(() => R(n, e(D).icon)), w(v, u));
		};
		A(ue, (v) => {
			e(D).icon && v(ve);
		});
	}
	r(te);
	var m = p(te, 2),
		g = i(m);
	{
		var y = (v) => {
			var u = Lt();
			u.__click = Y;
			var n = i(u);
			(f(n, 'icon', 'icomoon-free:bin'), f(n, 'width', '24'));
			var b = p(n, 2),
				T = i(b, !0);
			(r(b),
				r(u),
				B(
					(Z) => {
						((u.disabled = e(o)), R(T, Z));
					},
					[() => dt()]
				),
				w(v, u));
		};
		A(g, (v) => {
			E().name && v(y);
		});
	}
	var z = p(g, 2),
		F = i(z);
	F.__click = () => a.close?.(null);
	var W = i(F, !0);
	r(F);
	var j = p(F, 2),
		M = i(j);
	{
		var U = (v) => {
			var u = Gt();
			(f(u, 'icon', 'eos-icons:loading'), I(u, 1, 'animate-spin'), f(u, 'width', '24'), w(v, u));
		};
		A(M, (v) => {
			e(o) && v(U);
		});
	}
	var H = p(M);
	(r(j),
		r(z),
		r(m),
		r(Q),
		r(G),
		B(
			(v, u, n, b, T) => {
				(R(le, v),
					_e(V, 'placeholder', u),
					_e(V, 'aria-invalid', !!e(D).name),
					_e(V, 'aria-describedby', e(D).name ? 'name-error' : void 0),
					(V.disabled = e(o)),
					I(m, 1, `modal-footer flex ${E().name ? 'justify-between' : 'justify-end'} pt-4 border-t border-surface-500/20`),
					(F.disabled = e(o)),
					R(W, n),
					_e(j, 'aria-label', b),
					(j.disabled = e(o)),
					R(H, ` ${T ?? ''}`));
			},
			[() => st(), () => ct(), () => lt(), () => je(), () => je()]
		),
		me('submit', Q, N),
		We(
			V,
			() => d.newCategoryName,
			(v) => (d.newCategoryName = v)
		),
		w(L, G),
		Te());
}
Ie(['click']);
var qt = x('<iconify-icon></iconify-icon>', 2),
	Jt = x('<iconify-icon></iconify-icon>', 2),
	Qt = x(
		'<button type="button" aria-label="Add New Category" class="preset-filled-tertiary-500 btn flex w-auto min-w-[140px] items-center justify-center gap-1"><iconify-icon></iconify-icon> <span> </span></button> <button type="button" aria-label="Add New Collection" class="preset-filled-surface-500 btn flex w-auto min-w-[140px] items-center justify-center gap-1 rounded font-bold"><iconify-icon></iconify-icon> <span> </span></button> <button type="button" aria-label="Save" class="preset-filled-primary-500 btn flex w-auto min-w-[140px] items-center justify-center gap-1"><!> <span> </span></button>',
		3
	),
	Ht = x('<iconify-icon></iconify-icon>', 2),
	Wt = x('<iconify-icon></iconify-icon>', 2),
	Xt = x(
		'<div class="flex gap-2 mb-2 px-2"><button type="button" aria-label="Add New Category" class="preset-filled-tertiary-500 btn flex flex-1 items-center justify-center gap-1"><iconify-icon></iconify-icon> <span> </span></button> <button type="button" aria-label="Add New Collection" class="preset-filled-surface-500 btn flex flex-1 items-center justify-center gap-1 rounded font-bold"><iconify-icon></iconify-icon> <span> </span></button> <button type="button" aria-label="Save" class="preset-filled-primary-500 btn flex flex-1 items-center justify-center gap-1"><!> <span> </span></button></div>',
		2
	),
	Yt = x('<div class="mb-4 rounded bg-error-500/10 p-4 text-error-500" role="alert"> </div>'),
	Zt = x(
		'<!> <!> <!> <div class="max-h-[calc(100vh-65px)] overflow-auto"><div class="wrapper mb-2"><p class="mb-4 text-center dark:text-primary-500"> </p> <!></div></div>',
		1
	);
function wo(L, a) {
	Ne(a, !0);
	function E() {
		return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
	}
	let d = re(he([])),
		o = re(he({}));
	De(() => {
		a.data.contentStructure && C(d, a.data.contentStructure, !0);
	});
	let l = re(!1),
		D = re(null);
	function k(m) {
		ft.trigger(
			Vt,
			{
				existingCategory: m,
				title: m ? 'Edit Category' : 'Add New Category',
				body: m ? 'Modify Category Details' : 'Enter Unique Name and an Icon for your new category column'
			},
			async (g) => {
				if (!(!g || typeof g == 'boolean'))
					try {
						m && m._id ? N(m, g) : Y(g);
					} catch (y) {
						(ke.error('Error handling category modal response:', y), Ee.error({ description: 'Error updating categories' }));
					}
			}
		);
	}
	function N(m, g) {
		const y = { ...m, name: g.newCategoryName, icon: g.newCategoryIcon, updatedAt: new Date().toISOString() };
		(C(
			d,
			e(d).map((z) => (z._id === y._id ? y : z)),
			!0
		),
			m.name !== y.name ? (e(o)[y._id] = { type: 'rename', node: y }) : (e(o)[y._id] = { type: 'update', node: y }));
	}
	function Y(m) {
		const y = {
			_id: E(),
			name: m.newCategoryName,
			icon: m.newCategoryIcon,
			order: e(d).length,
			translations: [],
			updatedAt: new Date().toISOString(),
			createdAt: new Date().toISOString(),
			parentId: void 0,
			nodeType: 'category'
		};
		(C(d, [...e(d), y], !0), (e(o)[y._id] = { type: 'create', node: y }));
	}
	function G(m) {
		(console.debug('Page: handleNodeUpdate received', m),
			C(d, m, !0),
			m.forEach((g) => {
				e(o)[g._id] = { type: 'move', node: g };
			}),
			console.debug('Nodes to save (after move):', e(o)));
	}
	async function K() {
		const m = Object.values(e(o));
		if (m.length === 0) {
			Ee.info({ description: 'No changes to save.' });
			return;
		}
		try {
			C(l, !0);
			const g = await fetch('/api/content-structure', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ action: 'updateContentStructure', items: m })
				}),
				y = await g.json();
			if (g.ok && y.success)
				(Ee.success({ description: 'Categories and Collections updated successfully' }),
					C(o, {}, !0),
					y.contentStructure && (rt(y.contentStructure), C(d, y.contentStructure, !0)),
					console.debug('API save successful. New contentStructure:', y.contentStructure));
			else throw (C(d, Pe.value, !0), new Error(y.error || 'Failed to update categories'));
		} catch (g) {
			(ke.error('Error saving categories:', g),
				Ee.error({ description: g instanceof Error ? g.message : 'Failed to save categories' }),
				C(D, g instanceof Error ? g.message : 'Unknown error occurred', !0));
		} finally {
			C(l, !1);
		}
	}
	function ae() {
		(ot('create'), nt({ name: 'new', icon: '', description: '', status: 'unpublished', slug: '', fields: [] }), He('/config/collectionbuilder/new'));
	}
	De(
		() => (
			tt.routeContext.isCollectionBuilder || Me({ isCollectionBuilder: !0 }),
			() => {
				et.url.pathname.includes('/config/collectionbuilder') || Me({ isCollectionBuilder: !1 });
			}
		)
	);
	var Q = Zt(),
		ie = ge(Q);
	{
		const m = (y) => {
			var z = Je(),
				F = ge(z);
			{
				var W = (j) => {
					var M = Qt(),
						U = ge(M);
					U.__click = () => k();
					var H = i(U);
					(f(H, 'icon', 'bi:collection'), f(H, 'width', '18'), I(H, 1, 'text-white'));
					var v = p(H, 2),
						u = i(v, !0);
					(r(v), r(U));
					var n = p(U, 2);
					n.__click = ae;
					var b = i(n);
					(f(b, 'icon', 'material-symbols:category'), f(b, 'width', '18'));
					var T = p(b, 2),
						Z = i(T, !0);
					(r(T), r(n));
					var O = p(n, 2);
					O.__click = K;
					var P = i(O);
					{
						var fe = (t) => {
								var c = qt();
								(f(c, 'icon', 'eos-icons:loading'), f(c, 'width', '24'), I(c, 1, 'animate-spin text-white'), w(t, c));
							},
							be = (t) => {
								var c = Jt();
								(f(c, 'icon', 'material-symbols:save'), f(c, 'width', '24'), I(c, 1, 'text-white'), w(t, c));
							};
						A(P, (t) => {
							e(l) ? t(fe) : t(be, !1);
						});
					}
					var Ce = p(P, 2),
						s = i(Ce, !0);
					(r(Ce),
						r(O),
						B(
							(t, c, _) => {
								((U.disabled = e(l)), R(u, t), (n.disabled = e(l)), R(Z, c), (O.disabled = e(l)), R(s, _));
							},
							[() => Ke(), () => Ve(), () => je()]
						),
						w(j, M));
				};
				A(F, (j) => {
					ze.isDesktop && j(W);
				});
			}
			w(y, z);
		};
		let g = ee(() => vt());
		at(ie, {
			get name() {
				return e(g);
			},
			icon: 'fluent-mdl2:build-definition',
			showBackButton: !0,
			backUrl: '/config',
			children: m,
			$$slots: { default: !0 }
		});
	}
	var se = p(ie, 2);
	{
		var le = (m) => {
			var g = Xt(),
				y = i(g);
			y.__click = () => k();
			var z = i(y);
			(f(z, 'icon', 'bi:collection'), f(z, 'width', '18'), I(z, 1, 'text-white'));
			var F = p(z, 2),
				W = i(F, !0);
			(r(F), r(y));
			var j = p(y, 2);
			j.__click = ae;
			var M = i(j);
			(f(M, 'icon', 'material-symbols:category'), f(M, 'width', '18'));
			var U = p(M, 2),
				H = i(U, !0);
			(r(U), r(j));
			var v = p(j, 2);
			v.__click = K;
			var u = i(v);
			{
				var n = (O) => {
						var P = Ht();
						(f(P, 'icon', 'eos-icons:loading'), f(P, 'width', '24'), I(P, 1, 'animate-spin text-white'), w(O, P));
					},
					b = (O) => {
						var P = Wt();
						(f(P, 'icon', 'material-symbols:save'), f(P, 'width', '24'), I(P, 1, 'text-white'), w(O, P));
					};
				A(u, (O) => {
					e(l) ? O(n) : O(b, !1);
				});
			}
			var T = p(u, 2),
				Z = i(T, !0);
			(r(T),
				r(v),
				r(g),
				B(
					(O, P, fe) => {
						((y.disabled = e(l)), R(W, O), (j.disabled = e(l)), R(H, P), (v.disabled = e(l)), R(Z, fe));
					},
					[() => Ke(), () => Ve(), () => je()]
				),
				w(m, g));
		};
		A(se, (m) => {
			ze.isDesktop || m(le);
		});
	}
	var V = p(se, 2);
	{
		var ce = (m) => {
			var g = Yt(),
				y = i(g, !0);
			(r(g), B(() => R(y, e(D))), w(m, g));
		};
		A(V, (m) => {
			e(D) && m(ce);
		});
	}
	var de = p(V, 2),
		te = i(de),
		oe = i(te),
		ue = i(oe, !0);
	r(oe);
	var ve = p(oe, 2);
	{
		let m = ee(() => e(d) ?? []);
		Rt(ve, {
			get contentNodes() {
				return e(m);
			},
			onNodeUpdate: G,
			onEditCategory: k
		});
	}
	(r(te), r(de), B((m) => R(ue, m), [() => ut()]), w(L, Q), Te());
}
Ie(['click']);
export { wo as component };
//# sourceMappingURL=8.BfHHIp9R.js.map
