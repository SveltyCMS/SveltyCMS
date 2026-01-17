import { i as I } from './zi73tRJP.js';
import {
	p as Z,
	z as ae,
	b as A,
	u as ie,
	f as J,
	c as r,
	r as t,
	s as m,
	g as e,
	d as V,
	t as K,
	a as $,
	x as Q,
	e as me,
	n as se
} from './DrlZFkx8.js';
import { f as Y, s as O, a as F, d as ee, c as pe } from './CTjXDULS.js';
import { e as le, i as ce } from './BXe5mj2j.js';
import { d as ge, c as X, a as re, b as G } from './MEFvoR_D.js';
import { p as P } from './DePHBZW_.js';
import { P as fe } from './C6jjkVLf.js';
import { t as _e } from './COJ8Fh6m.js';
import { a as de } from './vkx2g0aB.js';
import { I as ye } from './DLqDVFzR.js';
import { a as xe } from './BEiD40NV.js';
import { b as he } from './YQp2a1pQ.js';
import { u as oe } from './-PV6rnhC.js';
import { d as ke } from './D3eWcrZU.js';
import { aw as we } from './N8Jg0v49.js';
var Fe = Y(
		'<button class="variant-filled-warning btn relative hover:variant-filled-secondary dark:variant-outline-warning"><span class="text-surface-700 dark:text-white"> </span></button>'
	),
	Ce = Y(
		'<div class="mb-3 border-b text-center text-tertiary-500 dark:text-primary-500">Choose your Widget</div> <div class="flex flex-wrap items-center justify-center gap-2"></div>',
		1
	),
	Se = Y('<div><button aria-label="Toggle Dropdown"> </button></div> <!>', 1);
function Ye(H, n) {
	Z(n, !0);
	const s = P(n, 'label', 3, ''),
		B = P(n, 'modifier', 3, (w) => w),
		k = P(n, 'class', 3, '');
	let p = V(!1),
		l = ie(() => n.selected);
	ae(() => {
		n.selected !== void 0 ? A(l, n.selected) : n.items && n.items.length > 0 ? A(l, n.items[0]) : A(l, void 0);
	});
	const M = ie(() => n.items.filter((w) => w !== e(l)));
	function L() {
		A(p, !e(p));
	}
	function R(w) {
		(A(l, w), A(p, !1));
	}
	ae(() => {
		A(l, n.selected);
	});
	var h = Se(),
		y = J(h),
		f = r(y);
	f.__click = L;
	let u;
	var D = r(f, !0);
	(t(f), t(y));
	var N = m(y, 2);
	{
		var U = (w) => {
			var a = Ce(),
				x = m(J(a), 2);
			(le(
				x,
				21,
				() => e(M),
				ce,
				(g, d) => {
					var v = Fe();
					v.__click = () => R(e(d));
					var b = r(v),
						j = r(b, !0);
					(t(b),
						t(v),
						K(
							(i, C) => {
								(re(v, 'aria-label', i), O(j, C));
							},
							[() => B()(e(d)), () => B()(e(d))]
						),
						F(g, v));
				}
			),
				t(x),
				F(w, a));
		};
		I(N, (w) => {
			e(p) && w(U);
		});
	}
	(K(
		(w) => {
			(X(y, 1, w), (u = X(f, 1, 'preset-filled-tertiary-500 btn dark:preset-outlined-primary-500', null, u, { selected: e(p) })), O(D, e(l) || s()));
		},
		[() => ge(_e('overflow-hidden bg-surface-500', k()))]
	),
		F(H, h),
		$());
}
ee(['click']);
var je = Y(
		'<div class="flex items-center justify-center"><button type="button" aria-label="Cancel" class="mb-[20px] ml-auto mr-[40px]">X</button> <!></div>'
	),
	Be = Y(
		'<div class="flex-col items-center justify-center overflow-auto"><p class="text-wxl mb-3 text-center">Define your <span class="text-tertiary-500 dark:text-primary-500"> </span></p> <div class="w-100 mx-2 mb-2 flex justify-between gap-2"><button class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"> </button> <button class="variant-filled-secondary btn dark:preset-outlined-secondary-500">Cancel</button></div> <!></div>'
	),
	We = Y(
		'<div class="fixed -top-16 left-0 flex h-screen w-full flex-col overflow-auto bg-white dark:bg-surface-900"><div class="mb-3 flex items-center justify-between text-surface-900 dark:text-white"><!> <button type="button" aria-label="Cancel" class="preset-outlined-secondary-500 btn-icon mr-2"><iconify-icon></iconify-icon></button></div> <!></div>',
		2
	);
function ue(H, n) {
	Z(n, !0);
	let s = P(n, 'fields', 31, () => Q([])),
		B = P(n, 'addField', 15, !1),
		k = P(n, 'editField', 11, !1),
		p = P(n, 'selected_widget', 15, null),
		l = P(n, 'field', 31, () => Q({ label: '', db_fieldName: '', translated: !1, required: !1, widget: { key: null, GuiFields: {} } }));
	const M = ie(() => Object.keys(de.widgetFunctions));
	let L = V(void 0);
	ae(() => {
		if (p()) {
			const g = de.widgetFunctions[p()];
			A(L, g?.GuiSchema, !0);
		}
	});
	function R() {
		p() &&
			(l((l().widget = { key: p(), GuiFields: l().widget.GuiFields }), !0), l((l().label = l().widget.GuiFields.label), !0), s([...s(), l()]), B(!1));
	}
	function h() {
		B(!1);
	}
	function y() {
		p(null);
	}
	var f = We(),
		u = r(f),
		D = r(u);
	fe(D, { name: 'Add a Widget', icon: 'material-symbols:ink-pen', iconColor: 'text-tertiary-500 dark:text-primary-500' });
	var N = m(D, 2);
	N.__click = h;
	var U = r(N);
	(G(U, 'icon', 'material-symbols:close'), G(U, 'width', '24'), t(N), t(u));
	var w = m(u, 2);
	{
		var a = (g) => {
				var d = je(),
					v = r(d);
				v.__click = h;
				var b = m(v, 2);
				(Ye(b, {
					get items() {
						return e(M);
					},
					get selected() {
						return p();
					},
					label: 'Select Widget'
				}),
					t(d),
					F(g, d));
			},
			x = (g) => {
				var d = Be(),
					v = r(d),
					b = m(r(v)),
					j = r(b, !0);
				(t(b), t(v));
				var i = m(v, 2),
					C = r(i);
				C.__click = R;
				var z = r(C);
				t(C);
				var E = m(C, 2);
				((E.__click = y), t(i));
				var _ = m(i, 2);
				{
					var W = (T) => {
						var c = pe(),
							o = J(c);
						(le(
							o,
							17,
							() => Object.entries(e(L)),
							([S, q]) => S,
							(S, q) => {
								var te = ie(() => me(e(q), 2));
								let ne = () => e(te)[0],
									ve = () => e(te)[1];
								ye(S, {
									get value() {
										return l().widget.GuiFields[ne()];
									},
									get widget() {
										return ve().widget;
									},
									get key() {
										return ne();
									},
									onupdate: (be) => l((l().widget.GuiFields[ne()] = be.value), !0)
								});
							}
						),
							F(T, c));
					};
					I(_, (T) => {
						e(L) && T(W);
					});
				}
				(t(d),
					K(() => {
						(O(j, p()), O(z, `Save ${p() ?? ''} Widget`));
					}),
					F(g, d));
			};
		I(w, (g) => {
			!p() && !k() ? g(a) : g(x, !1);
		});
	}
	(t(f), F(H, f), $());
}
ee(['click']);
var De = Y(
		'<div class="field relative" aria-label="Widget" role="button" tabindex="0"><div class="h-full w-full p-[10px]"><p> </p> <p> </p></div> <button aria-label="Delete widget" class="absolute right-[5px] top-[5px]"><iconify-icon></iconify-icon></button></div>',
		2
	),
	Ae = Y(
		'<div><div><!> <div class="flex gap-2"><button class="preset-filled-primary-500 btn" aria-label="Save">Save</button> <button class="preset-outlined-secondary-500 btn-icon mr-2" aria-label="Cancel"><iconify-icon></iconify-icon></button></div></div> <div class="z-100 flex flex-col items-center justify-center gap-1"></div></div>',
		2
	),
	Le = Y('<div class="wrapper"></div> <!> <!>', 1);
function Ne(H, n) {
	Z(n, !0);
	const s = P(n, 'fields', 19, () => []),
		B = P(n, 'onFieldsUpdate', 3, () => {});
	let k = V(null),
		p = V(null),
		l = V(null);
	function M(a) {
		function x(g) {
			let d;
			const v = g.pointerId;
			let b = V(
				Q(
					[...e(k).getElementsByClassName('field')].map((i) => {
						const C = i.getBoundingClientRect();
						return { el: i, center: C.top + C.height / 2 };
					})
				)
			);
			const j = () => {
				clearTimeout(d);
			};
			((a.onpointerup = j),
				(a.onpointerleave = j),
				(d = setTimeout(() => {
					const i = a.cloneNode(!0);
					(e(k).appendChild(i),
						i.setPointerCapture(v),
						(a.style.opacity = '0.5'),
						(i.style.left = a.getBoundingClientRect().left + 'px'),
						(i.style.marginLeft = '0'),
						(i.style.position = 'fixed'),
						(i.style.top = g.clientY + 'px'),
						(i.style.width = a.getBoundingClientRect().width + 'px'));
					const C = i.offsetHeight + 10 + 'px',
						z = ke(50);
					let E;
					((i.onpointermove = (_) => {
						((_.clientY < e(k).offsetTop || _.clientY > e(k).offsetTop + e(k).offsetHeight - 60) &&
							(_.clientY < e(k).offsetTop ? e(k).scrollBy(0, -5) : e(k).scrollBy(0, 5)),
							(i.style.top = _.clientY + 'px'),
							z(() => {
								(A(
									b,
									[...e(k).getElementsByClassName('field')]
										.map((o) => {
											const S = o.getBoundingClientRect();
											return { el: o, center: S.top + S.height / 2 };
										})
										.filter((o) => o.el != i),
									!0
								),
									e(b).sort((o, S) => (Math.abs(S.center - _.clientY) < Math.abs(o.center - _.clientY) ? 1 : -1)));
								const W = e(b)[0];
								if (W.el == a) return;
								const T = parseInt(W.el.getAttribute('data-index')),
									c = parseInt(i.getAttribute('data-index'));
								(E && (E.style.removeProperty('border-color'), (E.style.margin = '10px 0')),
									_.clientY > W.center && c - T != 1
										? (W.el.style.marginBottom = C)
										: _.clientY < W.center && T - c != 1 && (W.el.style.marginTop = C),
									(W.el.style.borderColor = 'red'),
									(E = W.el));
							}));
					}),
						(i.onpointerup = (_) => {
							((a.style.opacity = '1'),
								i.releasePointerCapture(v),
								e(b).sort((q, te) => (Math.abs(te.center - _.clientY) < Math.abs(q.center - _.clientY) ? 1 : -1)));
							const W = e(b)[0];
							let T = parseInt(W.el.getAttribute('data-index'));
							const c = parseInt(i.getAttribute('data-index')),
								o = [...s()],
								S = o.splice(c, 1)[0];
							(c < T && T--,
								_.clientY > W.center && T++,
								o.splice(T, 0, S),
								B()(o),
								i.remove(),
								setTimeout(() => {
									e(b).forEach((q) => {
										(q.el.style.removeProperty('border-color'), (q.el.style.margin = '10px 0'));
									});
								}, 50));
						}));
				}, 200)));
		}
		return (
			(a.onpointerdown = x),
			{
				destroy() {
					a.onpointerdown = null;
				}
			}
		);
	}
	function L(a) {
		(A(p, a.widget.Name, !0), A(l, a, !0));
	}
	function R(a, x) {
		x.stopPropagation();
		const g = s().filter((d) => d !== a);
		B()(g);
	}
	function h() {
		A(l, null);
	}
	function y() {
		A(l, null);
	}
	ae(() => {
		e(p);
	});
	var f = Le(),
		u = J(f);
	(le(
		u,
		23,
		s,
		(a) => a.id,
		(a, x, g) => {
			var d = De();
			((d.__click = () => L(e(x))), (d.__keydown = (_) => _.key === 'Enter' && L(e(x))));
			var v = r(d),
				b = r(v),
				j = r(b);
			t(b);
			var i = m(b, 2),
				C = r(i);
			(t(i), t(v));
			var z = m(v, 2);
			z.__click = (_) => R(e(x), _);
			var E = r(z);
			(G(E, 'icon', 'tdesign:delete-1'),
				G(E, 'width', '24'),
				G(E, 'height', '24'),
				t(z),
				t(d),
				xe(d, (_) => M?.(_)),
				K(() => {
					(re(d, 'data-index', e(g)), O(j, `widget: ${e(x).widget.Name ?? ''}`), O(C, `label: ${e(x).label ?? ''}`));
				}),
				F(a, d));
		}
	),
		t(u),
		he(
			u,
			(a) => A(k, a),
			() => e(k)
		));
	var D = m(u, 2);
	{
		var N = (a) => {
			ue(a, {
				get fields() {
					return s();
				},
				get field() {
					return e(l);
				},
				addField: !1,
				get selected_widget() {
					return e(p);
				},
				editField: !0
			});
		};
		I(D, (a) => {
			e(l) && a(N);
		});
	}
	var U = m(D, 2);
	{
		var w = (a) => {
			var x = Ae(),
				g = r(x),
				d = r(g);
			fe(d, { name: 'Edit Widget', icon: 'material-symbols:ink-pen', iconColor: 'text-primary-500' });
			var v = m(d, 2),
				b = r(v);
			b.__click = h;
			var j = m(b, 2);
			j.__click = y;
			var i = r(j);
			(G(i, 'icon', 'material-symbols:close'),
				G(i, 'width', '24'),
				t(j),
				t(v),
				t(g),
				se(2),
				t(x),
				K(() => {
					(X(
						x,
						1,
						`fixed -top-16 left-0 z-20 flex h-full w-full flex-col items-center justify-center overflow-auto bg-white dark:bg-surface-900 ${oe.state.leftSidebar === 'full' ? 'left-[220px] ' : 'left-0 '}`
					),
						X(g, 1, `fixed top-0 flex items-center justify-between ${oe.state.leftSidebar === 'full' ? 'left-[220px] w-full' : 'left-0 w-screen'}`));
				}),
				F(a, x));
		};
		I(U, (a) => {
			e(l) && a(w);
		});
	}
	(F(H, f), $());
}
ee(['click', 'keydown']);
var Te = Y('<button class="preset-filled-tertiary-500 btn mb-4 mt-1 dark:preset-filled-primary-500"> </button> <!>', 1),
	Ge = Y('<div class="flex flex-col"><!></div>');
function Pe(H, n) {
	Z(n, !0);
	let s = P(n, 'addField', 15, !1),
		B = P(n, 'fields', 31, () => Q([]));
	function k() {
		s(!0);
	}
	function p(h) {
		(B(h), n.onFieldsChange?.(h));
	}
	var l = Ge(),
		M = r(l);
	{
		var L = (h) => {
				ue(h, {
					get fields() {
						return B();
					},
					set fields(y) {
						B(y);
					},
					get addField() {
						return s();
					},
					set addField(y) {
						s(y);
					}
				});
			},
			R = (h) => {
				var y = Te(),
					f = J(y);
				f.__click = k;
				var u = r(f, !0);
				t(f);
				var D = m(f, 2);
				(Ne(D, {
					get fields() {
						return B();
					},
					onFieldsUpdate: p
				}),
					K((N) => O(u, N), [() => we()]),
					F(h, y));
			};
		I(M, (h) => {
			s() ? h(L) : h(R, !1);
		});
	}
	(t(l), F(H, l), $());
}
ee(['click']);
var Ee = Y(
		'<span class="level-badge rounded-full bg-primary-100 px-2 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900 dark:text-primary-200">Root Level</span>'
	),
	Me = Y(
		'<span class="level-badge rounded-full bg-secondary-100 px-2 py-1 text-xs font-medium text-secondary-700 dark:bg-secondary-900 dark:text-secondary-200">Nested Level</span>'
	),
	Re = Y('<button type="button" class="preset-filled-error-500 btn" title="Remove this menu level"><iconify-icon></iconify-icon></button>', 2),
	Ue = Y(
		'<div class="empty-fields-notice flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-surface-300 bg-surface-100/50 p-6 text-center dark:border-surface-600 dark:bg-surface-800/50"><iconify-icon></iconify-icon> <span class="text-sm font-medium text-surface-600 dark:text-surface-300">No fields configured for this level yet.</span> <span class="text-xs text-surface-500 dark:text-surface-50">Use the Widget Builder above to add fields.</span></div>',
		2
	),
	ze = Y(
		'<div><div class="level-header flex items-center justify-between border-b border-surface-200 bg-surface-100/50 p-4 dark:text-surface-50 dark:bg-surface-800"><div class="level-info flex items-center gap-3"><h4 class="level-title text-base font-medium text-surface-800 dark:text-surface-100"></h4> <!></div> <!></div> <div class="space-y-4 p-4"><div class="space-y-3"><label class="block text-sm font-medium text-surface-700 dark:text-surface-200"> <span class="field-count font-normal text-surface-500 dark:text-surface-50"> </span></label> <!></div> <!></div></div>'
	),
	He = Y(
		'<div class="space-y-6"><div class="border-b border-surface-200 pb-4 dark:text-surface-50"><h3 class="mb-2 text-lg font-semibold text-surface-900 dark:text-surface-100">Menu Structure Configuration</h3> <p class="text-sm leading-relaxed text-surface-600 dark:text-surface-300">Define the fields available at each level of your hierarchical menu. Each level can have different widgets and configurations.</p></div> <div class="levels-container space-y-4"></div> <div class=" border-t border-surface-200 pt-4 dark:text-surface-50"><button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"><iconify-icon></iconify-icon> Add Menu Level</button></div></div>',
		2
	);
function lt(H, n) {
	Z(n, !0);
	let s = P(n, 'value', 31, () => Q([]));
	(!s() || s().length === 0) && s([[]]);
	function B() {
		s([...s(), []]);
	}
	function k(y) {
		s().length > 1 && s(s().filter((f, u) => u !== y));
	}
	function p(y, f) {
		(s((s()[y] = f), !0), s([...s()]));
	}
	var l = He(),
		M = m(r(l), 2);
	(le(M, 21, s, ce, (y, f, u) => {
		var D = ze();
		X(
			D,
			1,
			`level-card rounded-lg border border-surface-200 bg-surface-50/50 dark:text-surface-50 dark:bg-surface-800/50 ${u === 0 ? 'border-primary-200! bg-primary-50/30! dark:border-primary-700! dark:bg-primary-900/20!' : ''}`
		);
		var N = r(D),
			U = r(N),
			w = r(U);
		w.textContent = `Level ${u + 1}`;
		var a = m(w, 2);
		{
			var x = (c) => {
					var o = Ee();
					F(c, o);
				},
				g = (c) => {
					var o = Me();
					F(c, o);
				};
			I(a, (c) => {
				u === 0 ? c(x) : c(g, !1);
			});
		}
		t(U);
		var d = m(U, 2);
		{
			var v = (c) => {
				var o = Re();
				((o.__click = () => k(u)), re(o, 'aria-label', `Remove level ${u + 1}`));
				var S = r(o);
				(G(S, 'icon', 'mdi:close'), G(S, 'width', '16'), t(o), F(c, o));
			};
			I(d, (c) => {
				s().length > 1 && c(v);
			});
		}
		t(N);
		var b = m(N, 2),
			j = r(b),
			i = r(j);
		re(i, 'for', 'widget-builder-' + u);
		var C = r(i);
		C.nodeValue = `Fields for Level ${u + 1} `;
		var z = m(C),
			E = r(z);
		(t(z), t(i));
		var _ = m(i, 2);
		(Pe(_, {
			get fields() {
				return e(f);
			},
			onFieldsChange: (c) => p(u, c)
		}),
			t(j));
		var W = m(j, 2);
		{
			var T = (c) => {
				var o = Ue(),
					S = r(o);
				(G(S, 'icon', 'mdi:information-outline'), G(S, 'width', '20'), X(S, 1, 'text-surface-400'), se(4), t(o), F(c, o));
			};
			I(W, (c) => {
				e(f).length === 0 && c(T);
			});
		}
		(t(b), t(D), K(() => O(E, `(${e(f).length ?? ''} field${e(f).length !== 1 ? 's' : ''})`)), F(y, D));
	}),
		t(M));
	var L = m(M, 2),
		R = r(L);
	R.__click = B;
	var h = r(R);
	(G(h, 'icon', 'mdi:plus'), G(h, 'width', '20'), se(), t(R), t(L), t(l), F(H, l), $());
}
ee(['click']);
export { lt as default };
//# sourceMappingURL=DZrgs6eH.js.map
