import { i as me } from '../chunks/zi73tRJP.js';
import { o as Ke } from '../chunks/CMZtchEj.js';
import {
	p as $e,
	d as fe,
	x as Pe,
	z as je,
	b as y,
	g as e,
	B as Ye,
	s as i,
	c as a,
	t as L,
	a as Ne,
	r as t,
	ag as pt,
	u as M,
	A as _t,
	f as re,
	n as Qe,
	y as gt
} from '../chunks/DrlZFkx8.js';
import { d as Ue, f as T, s as v, a as d, e as Je, c as be } from '../chunks/CTjXDULS.js';
import { c as he } from '../chunks/7bh91wXp.js';
import { b as c, c as J, a as Ce, e as bt, r as Re, d as Me } from '../chunks/MEFvoR_D.js';
import { l as qe } from '../chunks/BvngfGKt.js';
import { a as Xe } from '../chunks/B9ygI19o.js';
import { g as Ze } from '../chunks/DHPSYX_z.js';
import { S as yt, a as ze, b as et, o as Ve } from '../chunks/D3eWcrZU.js';
import { p as Fe } from '../chunks/CxX94NXM.js';
import { y as xe, v as tt, t as Be } from '../chunks/C-hhfhAN.js';
import { a as se, h as Oe, c as we, t as xt, b as Le, s as ht, i as wt, f as at } from '../chunks/-PV6rnhC.js';
import {
	aE as it,
	aF as kt,
	aG as Ct,
	aH as St,
	aI as Wt,
	aJ as Pt,
	aK as $t,
	aL as Nt,
	aM as jt,
	o as He,
	aN as Tt,
	aO as Ft,
	aP as Dt,
	aQ as It,
	aR as Ut,
	aA as Lt,
	aS as At,
	aT as Gt,
	aU as Mt,
	R as nt,
	az as Ie,
	aV as qt,
	aW as zt,
	aX as rt,
	aY as ot,
	aZ as st,
	a_ as Ot,
	a$ as Vt,
	b0 as Bt
} from '../chunks/N8Jg0v49.js';
import { e as Te, i as De } from '../chunks/BXe5mj2j.js';
import { b as Ae } from '../chunks/D4QnGYgQ.js';
import { I as Et } from '../chunks/DOA-aSm7.js';
import { g as Ee } from '../chunks/DvgRl2rN.js';
import { s as Kt } from '../chunks/DhHAlOU0.js';
import { a as Qt } from '../chunks/BEiD40NV.js';
import { p as Rt, s as Ht, a as Yt } from '../chunks/DePHBZW_.js';
import { d as Jt } from '../chunks/BH6PMYIi.js';
import { a as We, P as Xt, b as Ge, w as Zt } from '../chunks/vkx2g0aB.js';
import { modalState as ye } from '../chunks/GeUt2_20.js';
import { I as lt } from '../chunks/DLqDVFzR.js';
import { T as pe } from '../chunks/BpC4PXBd.js';
import { P as ea } from '../chunks/C6jjkVLf.js';
import { b as ta } from '../chunks/Cl42wY7v.js';
const aa = ({ data: X }) => X,
	vi = Object.freeze(Object.defineProperty({ __proto__: null, load: aa }, Symbol.toStringTag, { value: 'Module' }));
var ia = T('<p class="mt-1 text-sm text-gray-600 dark:text-gray-400"> <span class="font-bold text-tertiary-500 dark:text-primary-500"> </span></p>'),
	ra = T('<option> </option>'),
	oa = T(
		'<div class="flex w-full flex-col"><div class="flex flex-col gap-2 rounded border p-4"><div class="flex flex-col"><label for="name" class="mb-1 flex items-center font-medium"> <span class="mx-1 text-error-500">*</span> <iconify-icon></iconify-icon></label> <input type="text" required id="name" name="name" data-testid="collection-name-input" class="input w-full text-black dark:text-primary-500"/> <!></div> <hr class="my-2 border-gray-300 dark:border-gray-600"/> <p class="base-font-color mb-0 text-center font-bold"> </p> <div class="flex flex-col"><label for="icon" class="mb-1 flex items-center font-medium"> <iconify-icon></iconify-icon></label> <!></div> <div class="flex flex-col"><label for="slug" class="mb-1 flex items-center font-medium"> <iconify-icon></iconify-icon></label> <input type="text" id="slug" class="input w-full text-black dark:text-primary-500"/></div> <div class="flex flex-col"><label for="description" class="mb-1 flex items-center font-medium"> <iconify-icon></iconify-icon></label> <textarea id="description" rows="2" class="input w-full text-black dark:text-primary-500"></textarea></div> <div class="flex flex-col"><label for="status" class="mb-1 flex items-center font-medium"> <iconify-icon></iconify-icon></label> <select id="status" class="select w-full text-black dark:text-primary-500"></select></div></div> <div class="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between"><a href="/config/collectionbuilder" class="preset-outlined-secondary-500 btn sm:w-auto"> </a> <button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500 sm:w-auto"> </button></div></div>',
		2
	);
function na(X, r) {
	$e(r, !0);
	const $ = Fe.params.action;
	let N = fe(''),
		l = fe(!0),
		k = fe(Pe(r.data?.icon || '')),
		w = fe(Pe(r.data?.name ?? '')),
		_ = fe(Pe(r.data?.slug ?? '')),
		p = fe(Pe(r.data?.description ?? '')),
		g = fe(Pe(r.data?.status ?? 'unpublished'));
	je(() => {
		r.data &&
			(y(w, r.data.name ?? '', !0),
			y(_, r.data.slug ?? '', !0),
			y(p, r.data.description ?? '', !0),
			y(g, r.data.status ?? 'unpublished', !0),
			y(k, r.data.icon ?? '', !0));
	});
	const C = M(() => (e(w) ? e(w).toLowerCase().replace(/ /g, '_') : ''));
	(je(() => {
		const u = e(k);
		Ye(() => {
			se.value && u !== se.value.icon && Oe({ ...se.value, icon: u });
		});
	}),
		je(() => {
			const u = e(w),
				j = e(_),
				U = e(p),
				ge = e(g),
				ve = e(k);
			Ye(() => {
				if (se.value?._id) {
					if (se.value.name === u && se.value.slug === j && se.value.description === U && se.value.status === ge && se.value.icon === ve) return;
					Oe({ ...se.value, name: u, slug: j, description: U, status: ge, icon: ve });
				}
			});
		}));
	function f() {
		typeof e(w) == 'string' &&
			e(w) &&
			(window.history.replaceState({}, '', `/config/collectionbuilder/${$}/${e(_)}`),
			r.handlePageTitleUpdate(e(w)),
			y(_, e(w).toLowerCase().replace(/\s+/g, '_'), !0),
			S());
	}
	function S() {
		if (e(w)) return (y(_, e(w).toLowerCase().replace(/\s+/g, '_'), !0), e(_));
		y(l, !1);
	}
	je(() => {
		const u = e(w);
		(e(l) && u && y(_, u.toLowerCase().replace(/ /g, '_'), !0), $ === 'edit' || u ? r.handlePageTitleUpdate(u) : r.handlePageTitleUpdate('new'));
	});
	const h = Object.values(yt);
	function W() {
		xe.set(1);
	}
	var P = oa(),
		B = a(P),
		R = a(B),
		H = a(R),
		oe = a(H),
		ne = i(oe, 3);
	(c(ne, 'icon', 'material-symbols:info'),
		L(() => c(ne, 'title', `${Ft()} ${Dt()}`)),
		c(ne, 'width', '18'),
		J(ne, 1, 'ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500'),
		t(H));
	var Y = i(H, 2);
	(Re(Y), (Y.__input = f));
	var _e = i(Y, 2);
	{
		var ce = (u) => {
			var j = ia(),
				U = a(j),
				ge = i(U),
				ve = a(ge, !0);
			(t(ge),
				t(j),
				L(
					(Se) => {
						(v(U, `${Se ?? ''} `), v(ve, e(C)));
					},
					[() => Gt()]
				),
				d(u, j));
		};
		me(_e, (u) => {
			e(w) && u(ce);
		});
	}
	t(R);
	var A = i(R, 4),
		ee = a(A);
	t(A);
	var n = i(A, 2),
		x = a(n),
		E = a(x),
		q = i(E);
	(c(q, 'icon', 'material-symbols:info'),
		L(() => c(q, 'title', It())),
		c(q, 'width', '18'),
		J(q, 1, 'ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500'),
		t(x));
	var le = i(x, 2);
	(Et(le, {
		get iconselected() {
			return e(k);
		},
		set iconselected(u) {
			y(k, u, !0);
		},
		get searchQuery() {
			return e(N);
		},
		set searchQuery(u) {
			y(N, u, !0);
		}
	}),
		t(n));
	var s = i(n, 2),
		o = a(s),
		m = a(o),
		b = i(m);
	(c(b, 'icon', 'material-symbols:info'),
		L(() => c(b, 'title', Ut())),
		c(b, 'width', '18'),
		J(b, 1, 'ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500'),
		t(o));
	var F = i(o, 2);
	(Re(F), t(s));
	var D = i(s, 2),
		K = a(D),
		de = a(K),
		z = i(de);
	(c(z, 'icon', 'material-symbols:info'),
		L(() => c(z, 'title', Lt())),
		c(z, 'width', '18'),
		J(z, 1, 'ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500'),
		t(K));
	var O = i(K, 2);
	(pt(O), t(D));
	var Q = i(D, 2),
		te = a(Q),
		Z = a(te),
		ae = i(Z);
	(c(ae, 'icon', 'material-symbols:info'),
		L(() => c(ae, 'title', At())),
		c(ae, 'width', '18'),
		J(ae, 1, 'ml-1 cursor-pointer text-tertiary-500 dark:text-primary-500'),
		t(te));
	var ie = i(te, 2);
	(Te(
		ie,
		21,
		() => h,
		De,
		(u, j) => {
			var U = ra(),
				ge = a(U, !0);
			t(U);
			var ve = {};
			(L(() => {
				(v(ge, e(j)), ve !== (ve = e(j)) && (U.value = (U.__value = e(j)) ?? ''));
			}),
				d(u, U));
		}
	),
		t(ie),
		t(Q),
		t(B));
	var ke = i(B, 2),
		V = a(ke),
		I = a(V, !0);
	t(V);
	var G = i(V, 2);
	G.__click = W;
	var ue = a(G, !0);
	(t(G),
		t(ke),
		t(P),
		L(
			(u, j, U, ge, ve, Se, ct, dt, ut, vt, ft, mt) => {
				(v(oe, `${u ?? ''} `),
					Ce(Y, 'placeholder', j),
					Ce(Y, 'aria-label', U),
					v(ee, `${ge ?? ''}:`),
					v(E, `${ve ?? ''} `),
					v(m, `${Se ?? ''} `),
					Ce(F, 'placeholder', ct),
					v(de, `${dt ?? ''} `),
					Ce(O, 'placeholder', ut),
					v(Z, `${vt ?? ''} `),
					v(I, ft),
					v(ue, mt));
			},
			[() => it(), () => kt(), () => it(), () => Ct(), () => St(), () => Wt(), () => Pt(), () => $t(), () => Nt(), () => jt(), () => He(), () => Tt()]
		),
		Ae(
			Y,
			() => e(w),
			(u) => y(w, u)
		),
		Ae(
			F,
			() => e(_),
			(u) => y(_, u)
		),
		Ae(
			O,
			() => e(p),
			(u) => y(p, u)
		),
		bt(
			ie,
			() => e(g),
			(u) => y(g, u)
		),
		d(X, P),
		Ne());
}
Ue(['input', 'click']);
var sa = T('<div class="ml-2 text-left"> </div>'),
	la = T('<div></div>'),
	ca = T('<div class="h-full overflow-y-auto"><!> <section class="my-1 w-full"><!></section></div>');
function da(X, r) {
	$e(r, !0);
	const $ = Rt(r, 'headers', 19, () => []),
		N = M(
			() =>
				`grid grid-cols-${$().length + 1} preset-outlined-tertiary-500 dark:preset-outlined-primary-500 w-full items-start justify-start p-1 py-2 pl-3 text-center font-semibold`
		);
	var l = ca(),
		k = a(l);
	{
		var w = (g) => {
			var C = la();
			(Te(C, 21, $, De, (f, S) => {
				var h = sa(),
					W = a(h);
				(t(h), L(() => v(W, `${e(S) ?? ''}:`)), d(f, h));
			}),
				t(C),
				L(() => J(C, 1, Me(e(N)))),
				d(g, C));
		};
		me(k, (g) => {
			$().length > 0 && g(w);
		});
	}
	var _ = i(k, 2),
		p = a(_);
	(Kt(p, () => r.children ?? _t),
		t(_),
		Qt(
			_,
			(g, C) => Jt?.(g, C),
			() => ({ items: r.items, flipDurationMs: r.flipDurationMs })
		),
		t(l),
		Je('consider', _, function (...g) {
			r.handleDndConsider?.apply(this, g);
		}),
		Je('finalize', _, function (...g) {
			r.handleDndFinalize?.apply(this, g);
		}),
		d(X, l),
		Ne());
}
var ua = T(
		'<button class="group relative flex flex-col gap-3 rounded-xl border border-surface-200 bg-surface-50 p-5 text-left transition-all hover:-translate-y-1 hover:border-primary-500 hover:shadow-lg dark:text-surface-50 dark:bg-surface-800 dark:hover:border-primary-500"><div class="flex items-start justify-between w-full"><div class="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-200 text-surface-600 transition-colors group-hover:bg-primary-500 group-hover:text-white dark:bg-surface-700 dark:text-surface-300"><iconify-icon></iconify-icon></div></div> <div><h3 class="text-lg font-bold text-surface-900 group-hover:text-primary-500 dark:text-white dark:group-hover:text-primary-400"> </h3> <p class="mt-1 line-clamp-2 text-xs text-surface-500 dark:text-surface-50"> </p></div></button>',
		2
	),
	va = T(
		'<div class="mb-8 last:mb-0"><h3 class="mb-4 text-xl font-bold uppercase tracking-wider text-surface-500 dark:text-surface-50"> </h3> <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"></div></div>'
	),
	fa = T('<div class="flex flex-col items-center justify-center py-20 opacity-50"><iconify-icon></iconify-icon> <p class="text-xl"> </p></div>', 2),
	ma = T(
		'<div><header class="flex items-center justify-between border-b border-surface-200 pb-4 dark:text-surface-50"><h2> </h2> <button class="btn-icon preset-outlined-surface-500" aria-label="Close modal"><iconify-icon></iconify-icon></button></header> <div class="relative my-4"><iconify-icon></iconify-icon> <input type="text" placeholder="Search widgets..." class="input h-12 w-full pl-12 text-lg"/></div> <div class="flex-1 overflow-y-auto p-6"><!> <!></div></div>',
		2
	);
function pa(X, r) {
	$e(r, !0);
	let $ = fe('');
	const N = M(() => We.widgetFunctions || {});
	Ke(async () => {
		await We.initialize();
	});
	function l(C) {
		C !== null ? ye.close({ selectedWidget: C }) : qe.error('No widget selected');
	}
	const k = 'card p-6 w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl bg-white dark:bg-surface-800',
		w = 'text-3xl font-bold text-center mb-6 text-surface-900 dark:text-white';
	var _ = be(),
		p = re(_);
	{
		var g = (C) => {
			var f = ma();
			J(f, 1, Me(k));
			var S = a(f),
				h = a(S);
			J(h, 1, Me(w));
			var W = a(h, !0);
			t(h);
			var P = i(h, 2);
			P.__click = function (...A) {
				r.parent.onClose?.apply(this, A);
			};
			var B = a(P);
			(c(B, 'icon', 'mdi:close'), c(B, 'width', '24'), t(P), t(S));
			var R = i(S, 2),
				H = a(R);
			(c(H, 'icon', 'mdi:magnify'), c(H, 'width', '24'), J(H, 1, 'absolute left-4 top-1/2 -translate-y-1/2 text-surface-400'));
			var oe = i(H, 2);
			(Re(oe), t(R));
			var ne = i(R, 2),
				Y = a(ne);
			Te(
				Y,
				16,
				() => ['Core', 'Custom', 'Marketplace'],
				De,
				(A, ee) => {
					const n = M(() =>
							ee === 'Core' ? We.coreWidgets : ee === 'Custom' ? We.customWidgets : ee === 'Marketplace' ? We.marketplaceWidgets : []
						),
						x = M(() => e(n).filter((s) => !e($) || s.toLowerCase().includes(e($).toLowerCase())));
					var E = be(),
						q = re(E);
					{
						var le = (s) => {
							var o = va(),
								m = a(o),
								b = a(m);
							t(m);
							var F = i(m, 2);
							(Te(
								F,
								21,
								() => e(x),
								De,
								(D, K) => {
									var de = be(),
										z = re(de);
									{
										var O = (Q) => {
											var te = ua();
											te.__click = () => l(e(K));
											var Z = a(te),
												ae = a(Z),
												ie = a(ae);
											(L(() => c(ie, 'icon', e(N)[e(K)]?.Icon)), c(ie, 'width', '28'), t(ae), t(Z));
											var ke = i(Z, 2),
												V = a(ke),
												I = a(V, !0);
											t(V);
											var G = i(V, 2),
												ue = a(G, !0);
											(t(G),
												t(ke),
												t(te),
												L(() => {
													(Ce(te, 'aria-label', e(K)), v(I, e(K)), v(ue, e(N)[e(K)]?.Description || 'No description available'));
												}),
												d(Q, te));
										};
										me(z, (Q) => {
											e(K) && e(N)[e(K)]?.GuiSchema && Q(O);
										});
									}
									d(D, de);
								}
							),
								t(F),
								t(o),
								L(() => v(b, `${ee ?? ''} Widgets`)),
								d(s, o));
						};
						me(q, (s) => {
							e(x).length > 0 && s(le);
						});
					}
					d(A, E);
				}
			);
			var _e = i(Y, 2);
			{
				var ce = (A) => {
					var ee = fa(),
						n = a(ee);
					(c(n, 'icon', 'mdi:package-variant-closed'), c(n, 'width', '64'), J(n, 1, 'mb-4'));
					var x = i(n, 2),
						E = a(x);
					(t(x), t(ee), L(() => v(E, `No widgets found for "${e($) ?? ''}"`)), d(A, ee));
				};
				me(_e, (A) => {
					[...We.coreWidgets, ...We.customWidgets, ...We.marketplaceWidgets].filter((ee) => ee.toLowerCase().includes(e($).toLowerCase())).length ===
						0 && A(ce);
				});
			}
			(t(ne),
				t(f),
				L(() => v(W, ye.active?.props?.title || 'Select Widget')),
				Ae(
					oe,
					() => e($),
					(A) => y($, A)
				),
				d(C, f));
		};
		me(p, (C) => {
			ye.active && C(g);
		});
	}
	(d(X, _), Ne());
}
Ue(['click']);
var _a = T('<div class="flex flex-col gap-4"></div>');
function ga(X, r) {
	$e(r, !0);
	const $ = M(() => Object.keys(r.guiSchema || {})),
		N = ['label', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width'],
		l = M(() => e($).filter((f) => !N.includes(f) && f !== 'permissions')),
		k = M(() => [...N, ...e(l)]);
	function w(f) {
		return f === 'required' || f === 'translated' ? !1 : we.targetWidget.widget?.Name;
	}
	function _(f, S) {
		const h = we.targetWidget;
		((h[S] = f.value), we.setTargetWidget(h));
	}
	var p = be(),
		g = re(p);
	{
		var C = (f) => {
			var S = _a();
			(Te(
				S,
				21,
				() => e(k),
				De,
				(h, W) => {
					var P = be(),
						B = re(P);
					{
						var R = (H) => {
							{
								let oe = M(() => we.targetWidget[e(W)] ?? w(e(W))),
									ne = M(() => ze(r.guiSchema[e(W)]?.widget));
								lt(H, {
									get value() {
										return e(oe);
									},
									get icon() {
										return we.targetWidget[e(W)];
									},
									get widget() {
										return e(ne);
									},
									get key() {
										return e(W);
									},
									onupdate: (Y) => _(Y, e(W))
								});
							}
						};
						me(B, (H) => {
							r.guiSchema[e(W)] && H(R);
						});
					}
					d(h, P);
				}
			),
				t(S),
				d(f, S));
		};
		me(g, (f) => {
			ye.active && f(C);
		});
	}
	(d(X, p), Ne());
}
var ba = T('<div class="mb-4"><!></div>');
function ya(X, r) {
	$e(r, !0);
	function $(_) {
		const p = we.targetWidget;
		p && ((p.permissions = _), we.setTargetWidget(p));
	}
	const N = M(() => ye.active?.props?.value?.roles || []);
	var l = be(),
		k = re(l);
	{
		var w = (_) => {
			var p = ba(),
				g = a(p);
			{
				let C = M(() => we.targetWidget.permissions || {});
				Xt(g, {
					get roles() {
						return e(N);
					},
					get permissions() {
						return e(C);
					},
					onUpdate: $
				});
			}
			(t(p), d(_, p));
		};
		me(k, (_) => {
			ye.active && _(w);
		});
	}
	(d(X, l), Ne());
}
var xa = T('<div class="text-center text-sm text-gray-500">No specific options for this widget type</div>');
function ha(X, r) {
	$e(r, !0);
	const $ = ['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'],
		N = M(() => we.targetWidget?.widget?.Name),
		l = M(() => (e(N) && We.widgetFunctions[e(N)]?.GuiSchema) || null),
		k = M(() => (e(l) ? Object.keys(e(l)).filter((f) => !$.includes(f)) : []));
	function w(f, S) {
		const h = we.targetWidget;
		((h[S] = f.value), we.setTargetWidget(h));
	}
	var _ = be(),
		p = re(_);
	{
		var g = (f) => {
				var S = be(),
					h = re(S);
				(Te(
					h,
					17,
					() => e(k),
					De,
					(W, P) => {
						{
							let B = M(() => ze(e(l)[e(P)]?.widget));
							lt(W, {
								get value() {
									return we.targetWidget[e(P)];
								},
								onupdate: (R) => w(R, e(P)),
								get widget() {
									return e(B);
								},
								get key() {
									return e(P);
								}
							});
						}
					}
				),
					d(f, S));
			},
			C = (f) => {
				var S = be(),
					h = re(S);
				{
					var W = (P) => {
						var B = xa();
						d(P, B);
					};
					me(
						h,
						(P) => {
							ye.active && e(N) && P(W);
						},
						!0
					);
				}
				d(f, S);
			};
		me(p, (f) => {
			ye.active && e(l) && e(k).length > 0 ? f(g) : f(C, !1);
		});
	}
	(d(X, _), Ne());
}
var wa = T('<div class="flex items-center gap-1 py-2 px-4"><iconify-icon></iconify-icon> <span>Default</span></div>', 2),
	ka = T('<div class="flex items-center gap-1 py-2 px-4"><iconify-icon></iconify-icon> <span> </span></div>', 2),
	Ca = T('<div class="flex items-center gap-1 py-2 px-4"><iconify-icon></iconify-icon> <span>Specific</span></div>', 2),
	Sa = T('<!> <!> <!>', 1),
	Wa = T('<!> <!> <!> <!>', 1),
	Pa = T(
		'<div class="space-y-4"><header class="text-2xl font-bold text-center"> </header> <article class="text-center"> </article> <form><!></form> <div class="hidden"></div> <footer class="flex justify-between pt-4 border-t border-surface-500/20"><button type="button" aria-label="Delete" class="preset-filled-error-500 btn"><iconify-icon></iconify-icon> <span class="hidden sm:block"> </span></button> <div class="flex justify-between gap-4"><button type="button" class="btn preset-outlined-secondary-500"> </button> <button type="button" class="btn preset-filled-primary-500"> </button></div></footer></div>',
		2
	);
function $a(X, r) {
	$e(r, !0);
	const $ = () => Yt(Ge, '$widgetFunctions', N),
		[N, l] = Ht();
	let k = fe('0');
	const w = M(() => r.value?.widget?.key || r.value?.widget?.Name?.toLowerCase()),
		_ = M(() => $() || {}),
		p = M(() => e(_)[e(w)]?.GuiSchema || {}),
		g = M(() => (e(p) ? Object.keys(e(p)) : [])),
		C = M(() =>
			e(g).filter((s) => !['label', 'display', 'db_fieldName', 'required', 'translated', 'icon', 'helper', 'width', 'permissions'].includes(s))
		);
	async function f() {
		(r.response && r.response(xt), ye.close());
	}
	function S() {
		if (confirm('Are you sure you want to delete this widget?')) {
			if (Le && Array.isArray(Le.value.fields)) {
				const o = Le.value.fields.filter((m) => m.id !== r.value.id);
				ht({ ...Le.value, fields: o });
			}
			ye.close();
		}
	}
	const h = 'border border-surface-500 p-4 space-y-4 rounded-xl';
	var W = Pa(),
		P = a(W),
		B = a(P, !0);
	t(P);
	var R = i(P, 2),
		H = a(R, !0);
	t(R);
	var oe = i(R, 2);
	J(oe, 1, Me(h));
	var ne = a(oe);
	(pe(ne, {
		get value() {
			return e(k);
		},
		onValueChange: (s) => y(k, s.value, !0),
		children: (s, o) => {
			var m = Wa(),
				b = re(m);
			he(
				b,
				() => pe.List,
				(z, O) => {
					O(z, {
						class: 'flex justify-between lg:justify-start border-b border-surface-200-800',
						children: (Q, te) => {
							var Z = Sa(),
								ae = re(Z);
							he(
								ae,
								() => pe.Trigger,
								(I, G) => {
									G(I, {
										value: '0',
										children: (ue, u) => {
											var j = wa(),
												U = a(j);
											(c(U, 'icon', 'mdi:required'), c(U, 'width', '24'), J(U, 1, 'text-tertiary-500 dark:text-primary-500'), Qe(2), t(j), d(ue, j));
										},
										$$slots: { default: !0 }
									});
								}
							);
							var ie = i(ae, 2);
							he(
								ie,
								() => pe.Trigger,
								(I, G) => {
									G(I, {
										value: '1',
										children: (ue, u) => {
											var j = ka(),
												U = a(j);
											(c(U, 'icon', 'mdi:security-lock'), c(U, 'width', '24'), J(U, 1, 'text-tertiary-500 dark:text-primary-500'));
											var ge = i(U, 2),
												ve = a(ge, !0);
											(t(ge), t(j), L((Se) => v(ve, Se), [() => Mt()]), d(ue, j));
										},
										$$slots: { default: !0 }
									});
								}
							);
							var ke = i(ie, 2);
							{
								var V = (I) => {
									var G = be(),
										ue = re(G);
									(he(
										ue,
										() => pe.Trigger,
										(u, j) => {
											j(u, {
												value: '2',
												children: (U, ge) => {
													var ve = Ca(),
														Se = a(ve);
													(c(Se, 'icon', 'ph:star-fill'),
														c(Se, 'width', '24'),
														J(Se, 1, 'text-tertiary-500 dark:text-primary-500'),
														Qe(2),
														t(ve),
														d(U, ve));
												},
												$$slots: { default: !0 }
											});
										}
									),
										d(I, G));
								};
								me(ke, (I) => {
									e(C).length > 0 && I(V);
								});
							}
							d(Q, Z);
						},
						$$slots: { default: !0 }
					});
				}
			);
			var F = i(b, 2);
			he(
				F,
				() => pe.Content,
				(z, O) => {
					O(z, {
						value: '0',
						children: (Q, te) => {
							ga(Q, {
								get guiSchema() {
									return e(p);
								}
							});
						},
						$$slots: { default: !0 }
					});
				}
			);
			var D = i(F, 2);
			he(
				D,
				() => pe.Content,
				(z, O) => {
					O(z, {
						value: '1',
						children: (Q, te) => {
							ya(Q, {});
						},
						$$slots: { default: !0 }
					});
				}
			);
			var K = i(D, 2);
			{
				var de = (z) => {
					var O = be(),
						Q = re(O);
					(he(
						Q,
						() => pe.Content,
						(te, Z) => {
							Z(te, {
								value: '2',
								children: (ae, ie) => {
									ha(ae, {});
								},
								$$slots: { default: !0 }
							});
						}
					),
						d(z, O));
				};
				me(K, (z) => {
					e(C).length > 0 && z(de);
				});
			}
			d(s, m);
		},
		$$slots: { default: !0 }
	}),
		t(oe));
	var Y = i(oe, 4),
		_e = a(Y);
	_e.__click = S;
	var ce = a(_e);
	(c(ce, 'icon', 'icomoon-free:bin'), c(ce, 'width', '24'));
	var A = i(ce, 2),
		ee = a(A, !0);
	(t(A), t(_e));
	var n = i(_e, 2),
		x = a(n);
	x.__click = () => ye.close();
	var E = a(x, !0);
	t(x);
	var q = i(x, 2);
	q.__click = f;
	var le = a(q, !0);
	(t(q),
		t(n),
		t(Y),
		t(W),
		L(
			(s, o, m, b, F) => {
				(v(B, r.title ?? '(title missing)'),
					v(H, r.body ?? '(body missing)'),
					v(ee, s),
					Ce(x, 'aria-label', o),
					v(E, m),
					Ce(q, 'aria-label', b),
					v(le, F));
			},
			[() => nt(), () => He(), () => He(), () => Ie(), () => Ie()]
		),
		d(X, W),
		Ne(),
		l());
}
Ue(['click']);
var Na = T(
		'<div class="border-blue preset-outlined-surface-500 my-2 grid w-full grid-cols-6 items-center rounded-md border p-1 text-left hover:preset-filled-surface-500 dark:text-white"><div class="preset-ghost-tertiary-500 badge h-10 w-10 rounded-full dark:preset-ghost-primary-500"> </div> <iconify-icon></iconify-icon> <div class="font-bold dark:text-primary-500"> </div> <div class=" "> </div> <div class=" "> </div> <button type="button" class="preset-ghost-primary-500 btn-icon ml-auto"><iconify-icon></iconify-icon></button></div>',
		2
	),
	ja = T(
		'<div class="flex w-full flex-col"><div class="preset-outlined-tertiary-500 rounded-t-md p-2 text-center dark:preset-outlined-primary-500"><p> <span class="text-tertiary-500 dark:text-primary-500"> </span> Collection inputs.</p> <p class="mb-2"> </p></div> <div style="max-height: 55vh !important;"><!></div> <div><div class="mt-2 flex items-center justify-center gap-3"><button class="preset-filled-tertiary-500 btn" data-testid="add-field-button"> </button></div> <div class=" flex items-center justify-between"><button type="button" class="preset-filled-secondary-500 btn mt-2 justify-end"> </button> <button type="button" class="preset-filled-tertiary-500 btn mt-2 justify-end dark:preset-filled-primary-500 dark:text-black"> </button></div></div></div>'
	);
function Ta(X, r) {
	$e(r, !0);
	const $ = Fe.params.contentPath;
	function N(s) {
		return s
			? s.map((o, m) => {
					const b = o.widget?.key || o.widget?.Name || o.__type || o.type || Object.keys(Ee(Ge)).find((F) => o[F]) || 'Unknown Widget';
					return { id: m + 1, ...o, widget: { key: b, Name: b, ...o.widget } };
				})
			: [];
	}
	let l = fe(Pe(N(r.fields ?? [])));
	je(() => {
		r.fields && y(l, N(r.fields), !0);
	});
	const k = ['Id', 'Icon', 'Name', 'DBName', 'Widget'],
		w = 300,
		_ = (s) => {
			y(l, s.detail.items, !0);
		},
		p = (s) => {
			y(l, s.detail.items, !0);
		};
	function g() {
		ye.trigger(pa, { title: 'Select a Widget', body: 'Select your widget and then press submit.' }, (s) => {
			if (!s) return;
			const { selectedWidget: o } = s,
				m = Ee(Ge)[o];
			if (o && m) {
				const b = { widget: { key: o, Name: o }, GuiFields: et({ key: o }, ze(m.GuiSchema)), permissions: {} };
				C(b);
			}
		});
	}
	function C(s) {
		(s.permissions || (s.permissions = {}),
			wt(s),
			ye.trigger($a, { title: 'Define your Widget', body: 'Setup your widget and then press Save.', value: s }, (o) => {
				if (!o) return;
				const m = e(l).findIndex((b) => b.id === o.id);
				if (m !== -1) {
					const b = [...e(l).slice(0, m), { ...o }, ...e(l).slice(m + 1)];
					y(l, b, !0);
				} else {
					const b = { id: e(l).length + 1, ...o };
					y(l, [...e(l), b], !0);
				}
				se?.value && (se.value.fields = e(l));
			}));
	}
	async function f() {
		try {
			const s = e(l).map((o) => {
				const m = o.widget?.Name ? Ee(Ge)[o.widget.Name] : void 0;
				if (o.widget?.Name && m) {
					const b = et({ key: o.widget.Name }, ze(m.GuiSchema));
					for (const [F, D] of Object.entries(o)) typeof D != 'object' && F !== 'id' && (b[F] = o[F]);
					o.widget.GuiFields = b;
				}
				return o;
			});
			(se?.value && (se.value.fields = s), await r.handleCollectionSave());
		} catch (s) {
			qe.error('Error saving collection:', s);
		}
	}
	var S = ja(),
		h = a(S),
		W = a(h),
		P = a(W),
		B = i(P),
		R = a(B, !0);
	(t(B), Qe(), t(W));
	var H = i(W, 2),
		oe = a(H, !0);
	(t(H), t(h));
	var ne = i(h, 2),
		Y = a(ne);
	(da(Y, {
		get items() {
			return e(l);
		},
		get headers() {
			return k;
		},
		flipDurationMs: w,
		handleDndConsider: _,
		handleDndFinalize: p,
		children: (s, o) => {
			var m = be(),
				b = re(m);
			(Te(
				b,
				17,
				() => e(l),
				(F) => F.id,
				(F, D) => {
					var K = Na(),
						de = a(K),
						z = a(de, !0);
					t(de);
					var O = i(de, 2);
					(L(() => c(O, 'icon', e(D).icon)), c(O, 'width', '24'), J(O, 1, 'text-tertiary-500'));
					var Q = i(O, 2),
						te = a(Q, !0);
					t(Q);
					var Z = i(Q, 2),
						ae = a(Z, !0);
					t(Z);
					var ie = i(Z, 2),
						ke = a(ie, !0);
					t(ie);
					var V = i(ie, 2);
					V.__click = () => C(e(D));
					var I = a(V);
					(c(I, 'icon', 'ic:baseline-edit'),
						c(I, 'width', '24'),
						J(I, 1, 'dark:text-white'),
						t(V),
						t(K),
						L(
							(G) => {
								(v(z, e(D).id),
									v(te, e(D).label),
									v(ae, e(D)?.db_fieldName ? e(D).db_fieldName : '-'),
									v(ke, e(D).widget?.key || e(D).__type || 'Unknown Widget'),
									Ce(V, 'aria-label', G));
							},
							[() => st()]
						),
						d(F, K));
				}
			),
				d(s, m));
		},
		$$slots: { default: !0 }
	}),
		t(ne));
	var _e = i(ne, 2),
		ce = a(_e),
		A = a(ce);
	A.__click = () => g();
	var ee = a(A, !0);
	(t(A), t(ce));
	var n = i(ce, 2),
		x = a(n);
	x.__click = () => xe.set(0);
	var E = a(x, !0);
	t(x);
	var q = i(x, 2);
	q.__click = f;
	var le = a(q, !0);
	(t(q),
		t(n),
		t(_e),
		t(S),
		L(
			(s, o, m, b, F, D, K, de) => {
				(v(P, `${s ?? ''} `),
					v(R, $),
					v(oe, o),
					Ce(A, 'aria-label', m),
					v(ee, b),
					Ce(x, 'aria-label', F),
					v(E, D),
					Ce(q, 'aria-label', K),
					v(le, de));
			},
			[() => qt(), () => zt(), () => rt(), () => rt(), () => ot(), () => ot(), () => Ie(), () => Ie()]
		),
		d(X, S),
		Ne());
}
Ue(['click']);
var Fa = T(
		'<div class="flex justify-center gap-3"><button type="button" class=" preset-filled-error-500 btn mb-3 mr-1 mt-1 justify-end dark:preset-filled-error-500 dark:text-black"> </button> <button type="button" class="preset-filled-tertiary-500 btn mb-3 mr-1 mt-1 justify-end dark:preset-filled-tertiary-500 dark:text-black"> </button></div>'
	),
	Da = T('<div class="flex items-center gap-1 py-2 px-4"><iconify-icon></iconify-icon> <span> </span></div>', 2),
	Ia = T('<div class="flex items-center gap-1 py-2 px-4"><iconify-icon></iconify-icon> <span> </span></div>', 2),
	Ua = T('<!> <!>', 1),
	La = T('<!> <!> <!>', 1),
	Aa = T(
		'<div class="my-2 flex items-center justify-between gap-2"><!> <button type="button" aria-label="Back" class="preset-outlined-primary-500 btn-icon"><iconify-icon></iconify-icon></button></div> <div class="wrapper"><!> <p class="mb-2 hidden text-center text-tertiary-500 dark:text-primary-500 sm:block"> </p> <div class="mb-2 text-center text-xs text-error-500" data-testid="required-indicator"> </div> <!></div>',
		3
	);
function fi(X, r) {
	$e(r, !0);
	let $ = fe(Pe(String(xe.value)));
	(je(() => {
		xe.set(Number(e($)));
	}),
		je(() => {
			y($, String(xe.value), !0);
		}));
	let N = fe(Pe(Fe.params.contentPath));
	const l = Pe(Fe.params.action);
	let k = fe('');
	Ke(() => {
		l === 'edit' ? w() : (Oe(null), y(k, ''));
	});
	function w() {
		r.data.collection ? (Oe(r.data.collection), y(k, String(r.data.collection.name || ''), !0)) : qe.error('Collection data not found for editing.');
	}
	const _ = M(() => se.value);
	let p = fe(''),
		g = fe('');
	gt(() => {
		(l === 'edit' ? y(p, `Edit ${e(N)} Collection`) : e(N) ? y(p, `Create ${e(N)} Collection`) : y(p, 'Create new Collection'),
			y(g, e(N) || 'new', !0),
			e(p).includes(e(g)) && y(p, e(p).replace(new RegExp(`\\b${e(g)}\\b`, 'g'), e(g)), !0));
	});
	function C(n) {
		(y(g, n, !0), y(N, n, !0), l === 'edit' ? y(p, `Edit ${e(g)} Collection`) : y(p, `Create ${e(g)} Collection`));
	}
	async function f() {
		const n = se.value,
			x = String(n?.name || '');
		if (tt.errors && Object.keys(tt.errors).length > 0) {
			Be.error({ description: 'Please fix validation errors before saving' });
			return;
		}
		const E =
			l == 'edit'
				? Ve({
						originalName: e(k),
						name: x,
						icon: n?.icon,
						status: n?.status,
						slug: n?.slug,
						description: n?.description,
						permissions: n?.permissions,
						fields: n?.fields
					})
				: Ve({
						name: x,
						icon: n?.icon,
						status: n?.status,
						slug: n?.slug,
						description: n?.description,
						permissions: n?.permissions,
						fields: n?.fields
					});
		if (
			(await Xe.post('?/saveCollection', E, { headers: { 'Content-Type': 'multipart/form-data' } })).data.status === 200 &&
			(Be.success({ description: "Collection Saved. You're all set to build your content." }), e(k) && e(k) !== x && x)
		) {
			const le = Fe.url.pathname.replace(e(k), x);
			Ze(le);
		}
	}
	function S() {
		const n = se.value;
		ta({
			title: 'Please Confirm',
			body: 'Are you sure you wish to delete this collection?',
			onConfirm: async () => {
				(await Xe.post('?/deleteCollections', Ve({ contentTypes: String(n?.name || '') }), { headers: { 'Content-Type': 'multipart/form-data' } }),
					Be.error({ description: 'Collection Deleted.' }),
					Ze('/collection'));
			},
			onCancel: () => {
				qe.debug('User cancelled deletion.');
			}
		});
	}
	(Ke(() => {
		(Zt.initializeWidgets(), xe.set(0));
	}),
		je(() => (at({ isCollectionBuilder: !0 }), () => at({ isCollectionBuilder: !1 }))));
	var h = Aa(),
		W = re(h),
		P = a(W);
	ea(P, {
		get name() {
			return e(p);
		},
		get highlight() {
			return e(g);
		},
		icon: 'ic:baseline-build'
	});
	var B = i(P, 2);
	B.__click = () => history.back();
	var R = a(B);
	(c(R, 'icon', 'ri:arrow-left-line'), c(R, 'width', '20'), t(B), t(W));
	var H = i(W, 2),
		oe = a(H);
	{
		var ne = (n) => {
			var x = Fa(),
				E = a(x);
			E.__click = S;
			var q = a(E, !0);
			t(E);
			var le = i(E, 2);
			le.__click = f;
			var s = a(le, !0);
			(t(le),
				t(x),
				L(
					(o, m) => {
						(v(q, o), v(s, m));
					},
					[() => nt(), () => Ie()]
				),
				d(n, x));
		};
		me(oe, (n) => {
			l == 'edit' && n(ne);
		});
	}
	var Y = i(oe, 2),
		_e = a(Y, !0);
	t(Y);
	var ce = i(Y, 2),
		A = a(ce);
	t(ce);
	var ee = i(ce, 2);
	(pe(ee, {
		get value() {
			return e($);
		},
		onValueChange: (n) => y($, n.value, !0),
		children: (n, x) => {
			var E = La(),
				q = re(E);
			he(
				q,
				() => pe.List,
				(o, m) => {
					m(o, {
						class: 'flex border-b border-surface-200-800 mb-4',
						children: (b, F) => {
							var D = be(),
								K = re(D);
							{
								var de = (z) => {
									var O = Ua(),
										Q = re(O);
									he(
										Q,
										() => pe.Trigger,
										(Z, ae) => {
											ae(Z, {
												value: '0',
												children: (ie, ke) => {
													var V = Da(),
														I = a(V);
													(c(I, 'icon', 'ic:baseline-edit'), c(I, 'width', '24'), J(I, 1, 'text-tertiary-500 dark:text-primary-500'));
													var G = i(I, 2);
													let ue;
													var u = a(G, !0);
													(t(G),
														t(V),
														L(
															(j) => {
																((ue = J(G, 1, '', null, ue, {
																	active: xe.value === 0,
																	'text-tertiary-500': xe.value === 0,
																	'text-primary-500': xe.value === 0
																})),
																	v(u, j));
															},
															[() => st()]
														),
														d(ie, V));
												},
												$$slots: { default: !0 }
											});
										}
									);
									var te = i(Q, 2);
									(he(
										te,
										() => pe.Trigger,
										(Z, ae) => {
											ae(Z, {
												value: '1',
												'data-testid': 'widget-fields-tab',
												children: (ie, ke) => {
													var V = Ia(),
														I = a(V);
													(c(I, 'icon', 'mdi:widgets-outline'), c(I, 'width', '24'), J(I, 1, 'text-tertiary-500 dark:text-primary-500'));
													var G = i(I, 2);
													let ue;
													var u = a(G, !0);
													(t(G),
														t(V),
														L(
															(j) => {
																((ue = J(G, 1, '', null, ue, {
																	active: xe.value === 1,
																	'text-tertiary-500': xe.value === 2,
																	'text-primary-500': xe.value === 2
																})),
																	v(u, j));
															},
															[() => Bt()]
														),
														d(ie, V));
												},
												$$slots: { default: !0 }
											});
										}
									),
										d(z, O));
								};
								me(K, (z) => {
									Fe.data.isAdmin && z(de);
								});
							}
							d(b, D);
						},
						$$slots: { default: !0 }
					});
				}
			);
			var le = i(q, 2);
			he(
				le,
				() => pe.Content,
				(o, m) => {
					m(o, {
						value: '0',
						children: (b, F) => {
							na(b, {
								get data() {
									return e(_);
								},
								handlePageTitleUpdate: C
							});
						},
						$$slots: { default: !0 }
					});
				}
			);
			var s = i(le, 2);
			(he(
				s,
				() => pe.Content,
				(o, m) => {
					m(o, {
						value: '1',
						children: (b, F) => {
							{
								let D = M(() => e(_)?.fields);
								Ta(b, {
									get fields() {
										return e(D);
									},
									handleCollectionSave: f
								});
							}
						},
						$$slots: { default: !0 }
					});
				}
			),
				d(n, E));
		},
		$$slots: { default: !0 }
	}),
		t(H),
		L(
			(n, x) => {
				(v(_e, n), v(A, `* ${x ?? ''}`));
			},
			[() => Ot(), () => Vt()]
		),
		d(X, h),
		Ne());
}
Ue(['click']);
export { fi as component, vi as universal };
//# sourceMappingURL=9.CRH6SDAb.js.map
