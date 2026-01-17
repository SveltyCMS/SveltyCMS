import { i as h } from './zi73tRJP.js';
import { p as Ie, c as l, s as m, n as R, r as o, t as D, a as Ce, f as W, g as e, d as X, u as Ee, b as w } from './DrlZFkx8.js';
import { f as b, a as u, c as Y, s as q, e as E, d as Ae } from './CTjXDULS.js';
import { e as Me } from './BXe5mj2j.js';
import { b as s, c as A, a as z } from './MEFvoR_D.js';
import { p as Ue } from './DePHBZW_.js';
import { s as Se } from './Cl42wY7v.js';
import { a as je } from './C-hhfhAN.js';
var Ne = b(
		'<div class="cursor-move p-1 text-surface-400 transition-colors hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300" aria-label="Drag to reorder"><iconify-icon></iconify-icon></div>',
		2
	),
	Oe = b('<button type="button" class="preset-filled-surface-500 btn"><iconify-icon></iconify-icon></button>', 2),
	Te = b('<div class="spacer w-8"></div>'),
	Le = b('<span class=" ml-2 text-xs text-surface-500 dark:text-surface-50"> </span>'),
	Ve = b(
		'<button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" aria-label="Add child item" title="Add child item"><iconify-icon></iconify-icon></button>',
		2
	),
	qe = b('<div class="ml-8 border-l-2 border-surface-200 pl-4 dark:text-surface-50"><!></div>'),
	ze = b(
		'<div role="listitem"><div class="flex items-center gap-3 p-3"><div class=" flex items-center gap-1"><!> <!></div> <div class=" min-w-0 flex-1"><span class=" truncate font-medium text-surface-900 dark:text-surface-100"> </span> <!></div> <div class="flex items-center gap-1"><!> <button type="button" class="abtn preset-filled-surface-500" aria-label="Edit item" title="Edit item"><iconify-icon></iconify-icon></button> <button type="button" class="preset-filled-error-500 btn" aria-label="Delete item" title="Delete item"><iconify-icon></iconify-icon></button></div></div> <!></div>',
		2
	),
	Be = b(
		'<div class="py-8 text-center"><iconify-icon></iconify-icon> <p class="empty-message text-surface-500 dark:text-surface-50">No menu items yet. Click "Add Menu Item" to get started.</p></div>',
		2
	),
	Fe = b(
		'<div class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300" role="alert" aria-live="polite"><iconify-icon></iconify-icon> </div>',
		2
	),
	Ge = b(
		'<div class="space-y-4"><div class="flex items-center justify-between border-b border-surface-200 pb-3 dark:text-surface-50"><h3 class=" text-lg font-semibold text-surface-900 dark:text-surface-100">Menu Structure</h3> <button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"><iconify-icon></iconify-icon> Add Menu Item</button></div> <div><!></div> <!></div>',
		2
	);
function He(Z, v) {
	Ie(v, !0);
	let a = Ue(v, 'value', 15);
	a() || a([]);
	let y = X(null),
		x = X(null);
	function $() {
		a([...(a() || []), { _id: crypto.randomUUID(), _fields: {}, children: [] }]);
	}
	function ee(t, n) {
		(w(y, n, !0), (t.dataTransfer.effectAllowed = 'move'), t.dataTransfer.setData('text/plain', n._id));
	}
	function te(t, n) {
		(t.preventDefault(), w(x, n, !0));
	}
	function re(t, n) {
		if ((t.preventDefault(), !e(y) || !a())) return;
		const c = a().findIndex((p) => p._id === e(y)._id);
		if (c === -1) return;
		const _ = [...a()],
			[d] = _.splice(c, 1);
		let g = n;
		(c < n && g--, _.splice(g, 0, d), a(_), w(y, null), w(x, null));
	}
	function ae() {
		(w(y, null), w(x, null));
	}
	function ie(t, n) {
		const c = {
			item: t,
			level: n,
			fields: v.field.fields?.[n] || [],
			isNew: !1,
			parent: void 0,
			onSave: (_) => {
				((t._fields = _), a([...(a() || [])]));
			},
			onCancel: () => {}
		};
		Se({ component: 'menuItemEditorModal', meta: c });
	}
	function ne(t) {
		!a() || !confirm('Are you sure you want to delete this menu item and all its children?') || a(a().filter((c) => c._id !== t._id));
	}
	function de(t) {
		const n = { _id: crypto.randomUUID(), _fields: {}, children: [] };
		((t.children = [...(t.children || []), n]), a([...(a() || [])]));
	}
	function le(t) {
		((t._expanded = t._expanded === !1), a([...(a() || [])]));
	}
	const oe = Ee(() => je.contentLanguage);
	var M = Ge(),
		U = l(M),
		S = m(l(U), 2);
	S.__click = $;
	var B = l(S);
	(s(B, 'icon', 'mdi:plus'), s(B, 'width', '16'), R(), o(S), o(U));
	var I = m(U, 2);
	let F;
	var ce = l(I);
	{
		var se = (t) => {
				var n = Y(),
					c = W(n);
				(Me(
					c,
					19,
					a,
					(_) => _._id,
					(_, d, g) => {
						var p = ze();
						let G;
						var j = l(p),
							N = l(j),
							H = l(N);
						{
							var _e = (r) => {
								var i = Ne(),
									f = l(i);
								(s(f, 'icon', 'mdi:drag'), s(f, 'width', '16'), o(i), u(r, i));
							};
							h(H, (r) => {
								v.field.defaults?.enableDragDrop !== !1 && r(_e);
							});
						}
						var pe = m(H, 2);
						{
							var me = (r) => {
									var i = Oe();
									i.__click = () => le(e(d));
									var f = l(i);
									(s(f, 'icon', 'mdi:chevron-down'), s(f, 'width', '16'));
									let k;
									(o(i),
										D(() => {
											(z(i, 'aria-expanded', e(d)._expanded !== !1),
												z(i, 'aria-label', e(d)._expanded !== !1 ? 'Collapse children' : 'Expand children'),
												(k = A(f, 1, 'chevron transition-transform duration-200', null, k, { '-rotate-90': e(d)._expanded === !1 })));
										}),
										u(r, i));
								},
								be = (r) => {
									var i = Y(),
										f = W(i);
									{
										var k = (V) => {
											var De = Te();
											u(V, De);
										};
										h(
											f,
											(V) => {
												e(d).children.length === 0 && V(k);
											},
											!0
										);
									}
									u(r, i);
								};
							h(pe, (r) => {
								e(d).children.length > 0 && v.field.defaults?.enableExpandCollapse !== !1 ? r(me) : r(be, !1);
							});
						}
						o(N);
						var O = m(N, 2),
							T = l(O),
							ge = l(T, !0);
						o(T);
						var he = m(T, 2);
						{
							var ye = (r) => {
								var i = Le(),
									f = l(i);
								(o(i), D(() => q(f, `(${e(d).children.length ?? ''} children)`)), u(r, i));
							};
							h(he, (r) => {
								e(d).children.length > 0 && r(ye);
							});
						}
						o(O);
						var J = m(O, 2),
							K = l(J);
						{
							var xe = (r) => {
								var i = Ve();
								i.__click = () => de(e(d));
								var f = l(i);
								(s(f, 'icon', 'mdi:plus'), s(f, 'width', '14'), o(i), u(r, i));
							};
							h(K, (r) => {
								v.field.fields && v.field.fields.length > 1 && r(xe);
							});
						}
						var C = m(K, 2);
						C.__click = () => ie(e(d), 0);
						var P = l(C);
						(s(P, 'icon', 'mdi:pencil'), s(P, 'width', '14'), o(C));
						var L = m(C, 2);
						L.__click = () => ne(e(d));
						var Q = l(L);
						(s(Q, 'icon', 'mdi:delete'), s(Q, 'width', '14'), o(L), o(J), o(j));
						var ke = m(j, 2);
						{
							var we = (r) => {
								var i = qe(),
									f = l(i);
								(He(f, {
									get field() {
										return v.field;
									},
									get error() {
										return v.error;
									},
									get value() {
										return e(d).children;
									},
									set value(k) {
										e(d).children = k;
									}
								}),
									o(i),
									u(r, i));
							};
							h(ke, (r) => {
								e(d).children.length > 0 && e(d)._expanded !== !1 && r(we);
							});
						}
						(o(p),
							D(() => {
								((G = A(
									p,
									1,
									'rounded-lg border border-surface-200 bg-surface-50/50 transition-all duration-200 dark:text-surface-50 dark:bg-surface-800/50',
									null,
									G,
									{
										'scale-95': e(y)?._id === e(d)._id,
										'opacity-50': e(y)?._id === e(d)._id,
										'!border-primary-400': e(x) === e(g),
										'!bg-primary-500': e(x) === e(g),
										'dark:!border-primary-600': e(x) === e(g),
										'dark:!bg-primary-900': e(x) === e(g)
									}
								)),
									z(p, 'draggable', v.field.defaults?.enableDragDrop !== !1),
									q(ge, e(d)._fields?.title?.[e(oe)] || e(d)._fields?.title?.en || 'Untitled Item'));
							}),
							E('dragstart', p, (r) => ee(r, e(d))),
							E('dragover', p, (r) => te(r, e(g))),
							E('drop', p, (r) => re(r, e(g))),
							E('dragend', p, ae),
							u(_, p));
					}
				),
					u(t, n));
			},
			fe = (t) => {
				var n = Be(),
					c = l(n);
				(s(c, 'icon', 'mdi:menu'), s(c, 'width', '48'), A(c, 1, 'empty-icon mb-4 text-surface-300 dark:text-surface-600'), R(2), o(n), u(t, n));
			};
		h(ce, (t) => {
			a() && a().length > 0 ? t(se) : t(fe, !1);
		});
	}
	o(I);
	var ve = m(I, 2);
	{
		var ue = (t) => {
			var n = Fe(),
				c = l(n);
			(s(c, 'icon', 'mdi:alert-circle'), s(c, 'width', '16'));
			var _ = m(c);
			(o(n), D(() => q(_, ` ${v.error ?? ''}`)), u(t, n));
		};
		h(ve, (t) => {
			v.error && t(ue);
		});
	}
	(o(M),
		D(
			() =>
				(F = A(I, 1, 'mmin-h-[200px] space-y-2', null, F, {
					flex: !a() || a().length === 0,
					'items-center': !a() || a().length === 0,
					'justify-center': !a() || a().length === 0
				}))
		),
		u(Z, M),
		Ce());
}
Ae(['click']);
export { He as default };
//# sourceMappingURL=CJHFtqzV.js.map
