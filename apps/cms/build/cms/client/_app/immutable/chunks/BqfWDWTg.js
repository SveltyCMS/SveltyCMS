import { i as G } from './zi73tRJP.js';
import { p as k, f as P, g as r, u as l, a as N, c as $, A as L, r as U, bx as w, e as z, z as Se, B as be } from './DrlZFkx8.js';
import { c as T, a as p, f as H, p as ke } from './CTjXDULS.js';
import { s as C } from './DhHAlOU0.js';
import { f as x } from './MEFvoR_D.js';
import { r as A } from './DePHBZW_.js';
import { c as me, m as V, a as ne, u as He, n as xe } from './DtaauZrZ.js';
import {
	q as Ve,
	af as Ne,
	Y as Fe,
	r as ae,
	Q as $e,
	R as Ue,
	ag as We,
	E as de,
	J as Be,
	h as Xe,
	s as Ye,
	Z as Ke,
	ah as qe,
	ai as Le,
	S as je,
	aj as Je,
	g as Qe,
	ak as Ze,
	al as ze,
	p as et,
	A as J,
	am as he,
	an as Ee,
	B as Ie,
	F as ge,
	ao as tt,
	G as Pe,
	ap as nt,
	aq as rt,
	ar as ot,
	a4 as se,
	m as it,
	x as re,
	T as at,
	a6 as st,
	as as Te,
	i as lt
} from './C-hhfhAN.js';
import { b as ct, g as ye, a as dt } from './Kpla-k0W.js';
var ee = (e, t) => ({ x: e, y: t });
function gt(e) {
	const { x: t, y: n, width: o, height: i } = e,
		u = t + o / 2,
		s = n + i / 2;
	return { x: t, y: n, width: o, height: i, minX: t, minY: n, maxX: t + o, maxY: n + i, midX: u, midY: s, center: ee(u, s) };
}
function ut(e) {
	const t = ee(e.minX, e.minY),
		n = ee(e.maxX, e.minY),
		o = ee(e.maxX, e.maxY),
		i = ee(e.minX, e.maxY);
	return { top: t, right: n, bottom: o, left: i };
}
function mt(e, t) {
	const n = gt(e),
		{ top: o, right: i, left: u, bottom: s } = ut(n),
		[c] = t.split('-');
	return { top: [u, o, i, s], right: [o, i, s, u], bottom: [o, u, s, i], left: [i, o, u, s] }[c];
}
function ht(e, t) {
	const { x: n, y: o } = t;
	let i = !1;
	for (let u = 0, s = e.length - 1; u < e.length; s = u++) {
		const c = e[u].x,
			m = e[u].y,
			v = e[s].x,
			I = e[s].y;
		m > o != I > o && n < ((v - c) * (o - m)) / (I - m) + c && (i = !i);
	}
	return i;
}
const b = me();
var pt = H('<div><!></div>');
function vt(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => t.element),
		u = l(() => t.children),
		s = l(() => w(n, ['element', 'children'])),
		c = l(() => V(o().getArrowTipProps(), r(s)));
	var m = T(),
		v = P(m);
	{
		var I = (g) => {
				var d = T(),
					h = P(d);
				(C(
					h,
					() => r(i),
					() => r(c)
				),
					p(g, d));
			},
			f = (g) => {
				var d = pt();
				x(d, () => ({ ...r(c) }));
				var h = $(d);
				(C(h, () => r(u) ?? L), U(d), p(g, d));
			};
		G(v, (g) => {
			r(i) ? g(I) : g(f, !1);
		});
	}
	(p(e, m), N());
}
var ft = H('<div><!></div>');
function Ot(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => t.element),
		u = l(() => t.children),
		s = l(() => w(n, ['element', 'children'])),
		c = l(() => V(o().getArrowProps(), r(s)));
	var m = T(),
		v = P(m);
	{
		var I = (g) => {
				var d = T(),
					h = P(d);
				(C(
					h,
					() => r(i),
					() => r(c)
				),
					p(g, d));
			},
			f = (g) => {
				var d = ft();
				x(d, () => ({ ...r(c) }));
				var h = $(d);
				(C(h, () => r(u) ?? L), U(d), p(g, d));
			};
		G(v, (g) => {
			r(i) ? g(I) : g(f, !1);
		});
	}
	(p(e, m), N());
}
var Et = H('<div><!></div>');
function It(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => t.element),
		u = l(() => t.children),
		s = l(() => w(n, ['element', 'children'])),
		c = l(() => V(o().getContentProps(), r(s)));
	var m = T(),
		v = P(m);
	{
		var I = (g) => {
				var d = T(),
					h = P(d);
				(C(
					h,
					() => r(i),
					() => r(c)
				),
					p(g, d));
			},
			f = (g) => {
				var d = Et();
				x(d, () => ({ ...r(c) }));
				var h = $(d);
				(C(h, () => r(u) ?? L), U(d), p(g, d));
			};
		G(v, (g) => {
			r(i) ? g(I) : g(f, !1);
		});
	}
	(p(e, m), N());
}
var Pt = H('<button><!></button>');
function Tt(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => t.element),
		u = l(() => t.children),
		s = l(() => w(n, ['element', 'children'])),
		c = l(() => V(o().getContextTriggerProps(), r(s)));
	var m = T(),
		v = P(m);
	{
		var I = (g) => {
				var d = T(),
					h = P(d);
				(C(
					h,
					() => r(i),
					() => r(c)
				),
					p(g, d));
			},
			f = (g) => {
				var d = Pt();
				x(d, () => ({ ...r(c) }));
				var h = $(d);
				(C(h, () => r(u) ?? L), U(d), p(g, d));
			};
		G(v, (g) => {
			r(i) ? g(I) : g(f, !1);
		});
	}
	(p(e, m), N());
}
var yt = H('<div><!></div>');
function Ct(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => t.element),
		u = l(() => t.children),
		s = l(() => w(n, ['element', 'children'])),
		c = l(() => V(o().getIndicatorProps(), r(s)));
	var m = T(),
		v = P(m);
	{
		var I = (g) => {
				var d = T(),
					h = P(d);
				(C(
					h,
					() => r(i),
					() => r(c)
				),
					p(g, d));
			},
			f = (g) => {
				var d = yt();
				x(d, () => ({ ...r(c) }));
				var h = $(d);
				(C(h, () => r(u) ?? L), U(d), p(g, d));
			};
		G(v, (g) => {
			r(i) ? g(I) : g(f, !1);
		});
	}
	(p(e, m), N());
}
const Ae = me();
var _t = et('menu').parts(
		'arrow',
		'arrowTip',
		'content',
		'contextTrigger',
		'indicator',
		'item',
		'itemGroup',
		'itemGroupLabel',
		'itemIndicator',
		'itemText',
		'positioner',
		'separator',
		'trigger',
		'triggerItem'
	),
	D = _t.build(),
	ue = (e) => e.ids?.trigger ?? `menu:${e.id}:trigger`,
	Me = (e) => e.ids?.contextTrigger ?? `menu:${e.id}:ctx-trigger`,
	Z = (e) => e.ids?.content ?? `menu:${e.id}:content`,
	Rt = (e) => e.ids?.arrow ?? `menu:${e.id}:arrow`,
	De = (e) => e.ids?.positioner ?? `menu:${e.id}:popper`,
	St = (e, t) => e.ids?.group?.(t) ?? `menu:${e.id}:group:${t}`,
	te = (e, t) => `${e.id}/${t}`,
	j = (e) => e?.dataset.value ?? null,
	Ce = (e, t) => e.ids?.groupLabel?.(t) ?? `menu:${e.id}:group-label:${t}`,
	q = (e) => e.getById(Z(e)),
	_e = (e) => e.getById(De(e)),
	le = (e) => e.getById(ue(e)),
	bt = (e, t) => (t ? e.getById(te(e, t)) : null),
	pe = (e) => e.getById(Me(e)),
	oe = (e) => {
		const n = `[role^="menuitem"][data-ownedby=${CSS.escape(Z(e))}]:not([data-disabled])`;
		return at(q(e), n);
	},
	kt = (e) => Ue(oe(e)),
	Nt = (e) => $e(oe(e)),
	fe = (e, t) => (t ? e.id === t || e.dataset.value === t : !1),
	Lt = (e, t) => {
		const n = oe(e),
			o = n.findIndex((i) => fe(i, t.value));
		return ze(n, o, { loop: t.loop ?? t.loopFocus });
	},
	At = (e, t) => {
		const n = oe(e),
			o = n.findIndex((i) => fe(i, t.value));
		return Ze(n, o, { loop: t.loop ?? t.loopFocus });
	},
	Mt = (e, t) => {
		const n = oe(e),
			o = n.find((i) => fe(i, t.value));
		return Le(n, { state: t.typeaheadState, key: t.key, activeId: o?.id ?? null });
	},
	ce = (e) => lt(e) && (e.dataset.disabled === '' || e.hasAttribute('disabled')),
	Dt = (e) => !!e?.getAttribute('role')?.startsWith('menuitem') && !!e?.hasAttribute('data-controls'),
	ve = 'menu:select';
function Gt(e, t) {
	if (!e) return;
	const n = Qe(e),
		o = new n.CustomEvent(ve, { detail: { value: t } });
	e.dispatchEvent(o);
}
function wt(e, t) {
	const { context: n, send: o, state: i, computed: u, prop: s, scope: c } = e,
		m = i.hasTag('open'),
		v = n.get('isSubmenu'),
		I = u('isTypingAhead'),
		f = s('composite'),
		g = n.get('currentPlacement'),
		d = n.get('anchorPoint'),
		h = n.get('highlightedValue'),
		S = dt({ ...s('positioning'), placement: d ? 'bottom' : g });
	function _(a) {
		return { id: te(c, a.value), disabled: !!a.disabled, highlighted: h === a.value };
	}
	function O(a) {
		const E = a.valueText ?? a.value;
		return { ...a, id: a.value, valueText: E };
	}
	function y(a) {
		return { ..._(O(a)), checked: !!a.checked };
	}
	function B(a) {
		const { closeOnSelect: E, valueText: M, value: Y } = a,
			F = _(a),
			X = te(c, Y);
		return t.element({
			...D.item.attrs,
			id: X,
			role: 'menuitem',
			'aria-disabled': st(F.disabled),
			'data-disabled': J(F.disabled),
			'data-ownedby': Z(c),
			'data-highlighted': J(F.highlighted),
			'data-value': Y,
			'data-valuetext': M,
			onDragStart(R) {
				R.currentTarget.matches('a[href]') && R.preventDefault();
			},
			onPointerMove(R) {
				if (F.disabled || R.pointerType !== 'mouse') return;
				const K = R.currentTarget;
				F.highlighted || o({ type: 'ITEM_POINTERMOVE', id: X, target: K, closeOnSelect: E });
			},
			onPointerLeave(R) {
				if (F.disabled || R.pointerType !== 'mouse' || !e.event.previous()?.type.includes('POINTER')) return;
				const we = R.currentTarget;
				o({ type: 'ITEM_POINTERLEAVE', id: X, target: we, closeOnSelect: E });
			},
			onPointerDown(R) {
				if (F.disabled) return;
				const K = R.currentTarget;
				o({ type: 'ITEM_POINTERDOWN', target: K, id: X, closeOnSelect: E });
			},
			onClick(R) {
				if (Ee(R) || Ie(R) || F.disabled) return;
				const K = R.currentTarget;
				o({ type: 'ITEM_CLICK', target: K, id: X, closeOnSelect: E });
			}
		});
	}
	return {
		highlightedValue: h,
		open: m,
		setOpen(a) {
			i.hasTag('open') !== a && o({ type: a ? 'OPEN' : 'CLOSE' });
		},
		setHighlightedValue(a) {
			o({ type: 'HIGHLIGHTED.SET', value: a });
		},
		setParent(a) {
			o({ type: 'PARENT.SET', value: a, id: a.prop('id') });
		},
		setChild(a) {
			o({ type: 'CHILD.SET', value: a, id: a.prop('id') });
		},
		reposition(a = {}) {
			o({ type: 'POSITIONING.SET', options: a });
		},
		addItemListener(a) {
			const E = c.getById(a.id);
			if (!E) return;
			const M = () => a.onSelect?.();
			return (E.addEventListener(ve, M), () => E.removeEventListener(ve, M));
		},
		getContextTriggerProps() {
			return t.element({
				...D.contextTrigger.attrs,
				dir: s('dir'),
				id: Me(c),
				'data-state': m ? 'open' : 'closed',
				onPointerDown(a) {
					if (a.pointerType === 'mouse') return;
					const E = se(a);
					o({ type: 'CONTEXT_MENU_START', point: E });
				},
				onPointerCancel(a) {
					a.pointerType !== 'mouse' && o({ type: 'CONTEXT_MENU_CANCEL' });
				},
				onPointerMove(a) {
					a.pointerType !== 'mouse' && o({ type: 'CONTEXT_MENU_CANCEL' });
				},
				onPointerUp(a) {
					a.pointerType !== 'mouse' && o({ type: 'CONTEXT_MENU_CANCEL' });
				},
				onContextMenu(a) {
					const E = se(a);
					(o({ type: 'CONTEXT_MENU', point: E }), a.preventDefault());
				},
				style: { WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }
			});
		},
		getTriggerItemProps(a) {
			const E = a.getTriggerProps();
			return it(B({ value: E.id }), E);
		},
		getTriggerProps() {
			return t.button({
				...(v ? D.triggerItem.attrs : D.trigger.attrs),
				'data-placement': n.get('currentPlacement'),
				type: 'button',
				dir: s('dir'),
				id: ue(c),
				'data-uid': s('id'),
				'aria-haspopup': f ? 'menu' : 'dialog',
				'aria-controls': Z(c),
				'data-controls': Z(c),
				'aria-expanded': m || void 0,
				'data-state': m ? 'open' : 'closed',
				onPointerMove(a) {
					if (a.pointerType !== 'mouse' || ce(a.currentTarget) || !v) return;
					const M = se(a);
					o({ type: 'TRIGGER_POINTERMOVE', target: a.currentTarget, point: M });
				},
				onPointerLeave(a) {
					if (ce(a.currentTarget) || a.pointerType !== 'mouse' || !v) return;
					const E = se(a);
					o({ type: 'TRIGGER_POINTERLEAVE', target: a.currentTarget, point: E });
				},
				onPointerDown(a) {
					ce(a.currentTarget) || ot(a) || a.preventDefault();
				},
				onClick(a) {
					a.defaultPrevented || ce(a.currentTarget) || o({ type: 'TRIGGER_CLICK', target: a.currentTarget });
				},
				onBlur() {
					o({ type: 'TRIGGER_BLUR' });
				},
				onFocus() {
					o({ type: 'TRIGGER_FOCUS' });
				},
				onKeyDown(a) {
					if (a.defaultPrevented) return;
					const E = {
							ArrowDown() {
								o({ type: 'ARROW_DOWN' });
							},
							ArrowUp() {
								o({ type: 'ARROW_UP' });
							},
							Enter() {
								o({ type: 'ARROW_DOWN', src: 'enter' });
							},
							Space() {
								o({ type: 'ARROW_DOWN', src: 'space' });
							}
						},
						M = Pe(a, { orientation: 'vertical', dir: s('dir') }),
						Y = E[M];
					Y && (a.preventDefault(), Y(a));
				}
			});
		},
		getIndicatorProps() {
			return t.element({ ...D.indicator.attrs, dir: s('dir'), 'data-state': m ? 'open' : 'closed' });
		},
		getPositionerProps() {
			return t.element({ ...D.positioner.attrs, dir: s('dir'), id: De(c), style: S.floating });
		},
		getArrowProps() {
			return t.element({ id: Rt(c), ...D.arrow.attrs, dir: s('dir'), style: S.arrow });
		},
		getArrowTipProps() {
			return t.element({ ...D.arrowTip.attrs, dir: s('dir'), style: S.arrowTip });
		},
		getContentProps() {
			return t.element({
				...D.content.attrs,
				id: Z(c),
				'aria-label': s('aria-label'),
				hidden: !m,
				'data-state': m ? 'open' : 'closed',
				role: f ? 'menu' : 'dialog',
				tabIndex: 0,
				dir: s('dir'),
				'aria-activedescendant': u('highlightedId') || void 0,
				'aria-labelledby': ue(c),
				'data-placement': g,
				onPointerEnter(a) {
					a.pointerType === 'mouse' && o({ type: 'MENU_POINTERENTER' });
				},
				onKeyDown(a) {
					if (a.defaultPrevented || !de(a.currentTarget, ge(a))) return;
					const E = ge(a);
					if (!(E?.closest('[role=menu]') === a.currentTarget || E === a.currentTarget)) return;
					if (a.key === 'Tab' && !tt(a)) {
						a.preventDefault();
						return;
					}
					const Y = {
							ArrowDown() {
								o({ type: 'ARROW_DOWN' });
							},
							ArrowUp() {
								o({ type: 'ARROW_UP' });
							},
							ArrowLeft() {
								o({ type: 'ARROW_LEFT' });
							},
							ArrowRight() {
								o({ type: 'ARROW_RIGHT' });
							},
							Enter() {
								o({ type: 'ENTER' });
							},
							Space(R) {
								I ? o({ type: 'TYPEAHEAD', key: R.key }) : Y.Enter?.(R);
							},
							Home() {
								o({ type: 'HOME' });
							},
							End() {
								o({ type: 'END' });
							}
						},
						F = Pe(a, { dir: s('dir') }),
						X = Y[F];
					if (X) {
						(X(a), a.stopPropagation(), a.preventDefault());
						return;
					}
					s('typeahead') && nt(a) && (rt(a) || Ne(E) || (o({ type: 'TYPEAHEAD', key: a.key }), a.preventDefault()));
				}
			});
		},
		getSeparatorProps() {
			return t.element({ ...D.separator.attrs, role: 'separator', dir: s('dir'), 'aria-orientation': 'horizontal' });
		},
		getItemState: _,
		getItemProps: B,
		getOptionItemState: y,
		getOptionItemProps(a) {
			const { type: E, disabled: M, closeOnSelect: Y } = a,
				F = O(a),
				X = y(a);
			return {
				...B(F),
				...t.element({
					'data-type': E,
					...D.item.attrs,
					dir: s('dir'),
					'data-value': F.value,
					role: `menuitem${E}`,
					'aria-checked': !!X.checked,
					'data-state': X.checked ? 'checked' : 'unchecked',
					onClick(R) {
						if (M || Ee(R) || Ie(R)) return;
						const K = R.currentTarget;
						o({ type: 'ITEM_CLICK', target: K, option: F, closeOnSelect: Y });
					}
				})
			};
		},
		getItemIndicatorProps(a) {
			const E = y(Te(a)),
				M = E.checked ? 'checked' : 'unchecked';
			return t.element({
				...D.itemIndicator.attrs,
				dir: s('dir'),
				'data-disabled': J(E.disabled),
				'data-highlighted': J(E.highlighted),
				'data-state': he(a, 'checked') ? M : void 0,
				hidden: he(a, 'checked') ? !E.checked : void 0
			});
		},
		getItemTextProps(a) {
			const E = y(Te(a)),
				M = E.checked ? 'checked' : 'unchecked';
			return t.element({
				...D.itemText.attrs,
				dir: s('dir'),
				'data-disabled': J(E.disabled),
				'data-highlighted': J(E.highlighted),
				'data-state': he(a, 'checked') ? M : void 0
			});
		},
		getItemGroupLabelProps(a) {
			return t.element({ ...D.itemGroupLabel.attrs, id: Ce(c, a.htmlFor), dir: s('dir') });
		},
		getItemGroupProps(a) {
			return t.element({ id: St(c, a.id), ...D.itemGroup.attrs, dir: s('dir'), 'aria-labelledby': Ce(c, a.id), role: 'group' });
		}
	};
}
var { not: W, and: Q, or: Ht } = Fe(),
	xt = Ve({
		props({ props: e }) {
			return {
				closeOnSelect: !0,
				typeahead: !0,
				composite: !0,
				loopFocus: !1,
				navigate(t) {
					je(t.node);
				},
				...e,
				positioning: { placement: 'bottom-start', gutter: 8, ...e.positioning }
			};
		},
		initialState({ prop: e }) {
			return e('open') || e('defaultOpen') ? 'open' : 'idle';
		},
		context({ bindable: e, prop: t }) {
			return {
				suspendPointer: e(() => ({ defaultValue: !1 })),
				highlightedValue: e(() => ({
					defaultValue: t('defaultHighlightedValue') || null,
					value: t('highlightedValue'),
					onChange(n) {
						t('onHighlightChange')?.({ highlightedValue: n });
					}
				})),
				lastHighlightedValue: e(() => ({ defaultValue: null })),
				currentPlacement: e(() => ({ defaultValue: void 0 })),
				intentPolygon: e(() => ({ defaultValue: null })),
				anchorPoint: e(() => ({
					defaultValue: null,
					hash(n) {
						return `x: ${n?.x}, y: ${n?.y}`;
					}
				})),
				isSubmenu: e(() => ({ defaultValue: !1 }))
			};
		},
		refs() {
			return { parent: null, children: {}, typeaheadState: { ...Le.defaultOptions }, positioningOverride: {} };
		},
		computed: {
			isRtl: ({ prop: e }) => e('dir') === 'rtl',
			isTypingAhead: ({ refs: e }) => e.get('typeaheadState').keysSoFar !== '',
			highlightedId: ({ context: e, scope: t, refs: n }) => Ft(n.get('children'), e.get('highlightedValue'), t)
		},
		watch({ track: e, action: t, context: n, prop: o }) {
			(e([() => n.get('isSubmenu')], () => {
				t(['setSubmenuPlacement']);
			}),
				e([() => n.hash('anchorPoint')], () => {
					n.get('anchorPoint') && t(['reposition']);
				}),
				e([() => o('open')], () => {
					t(['toggleVisibility']);
				}));
		},
		on: {
			'PARENT.SET': { actions: ['setParentMenu'] },
			'CHILD.SET': { actions: ['setChildMenu'] },
			OPEN: [
				{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
				{ target: 'open', actions: ['invokeOnOpen'] }
			],
			OPEN_AUTOFOCUS: [
				{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
				{ target: 'open', actions: ['highlightFirstItem', 'invokeOnOpen'] }
			],
			CLOSE: [
				{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
				{ target: 'closed', actions: ['invokeOnClose'] }
			],
			'HIGHLIGHTED.RESTORE': { actions: ['restoreHighlightedItem'] },
			'HIGHLIGHTED.SET': { actions: ['setHighlightedItem'] }
		},
		states: {
			idle: {
				tags: ['closed'],
				on: {
					'CONTROLLED.OPEN': { target: 'open' },
					'CONTROLLED.CLOSE': { target: 'closed' },
					CONTEXT_MENU_START: { target: 'opening:contextmenu', actions: ['setAnchorPoint'] },
					CONTEXT_MENU: [
						{ guard: 'isOpenControlled', actions: ['setAnchorPoint', 'invokeOnOpen'] },
						{ target: 'open', actions: ['setAnchorPoint', 'invokeOnOpen'] }
					],
					TRIGGER_CLICK: [
						{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
						{ target: 'open', actions: ['invokeOnOpen'] }
					],
					TRIGGER_FOCUS: { guard: W('isSubmenu'), target: 'closed' },
					TRIGGER_POINTERMOVE: { guard: 'isSubmenu', target: 'opening' }
				}
			},
			'opening:contextmenu': {
				tags: ['closed'],
				effects: ['waitForLongPress'],
				on: {
					'CONTROLLED.OPEN': { target: 'open' },
					'CONTROLLED.CLOSE': { target: 'closed' },
					CONTEXT_MENU_CANCEL: [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
						{ target: 'closed', actions: ['invokeOnClose'] }
					],
					'LONG_PRESS.OPEN': [
						{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
						{ target: 'open', actions: ['invokeOnOpen'] }
					]
				}
			},
			opening: {
				tags: ['closed'],
				effects: ['waitForOpenDelay'],
				on: {
					'CONTROLLED.OPEN': { target: 'open' },
					'CONTROLLED.CLOSE': { target: 'closed' },
					BLUR: [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
						{ target: 'closed', actions: ['invokeOnClose'] }
					],
					TRIGGER_POINTERLEAVE: [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
						{ target: 'closed', actions: ['invokeOnClose'] }
					],
					'DELAY.OPEN': [
						{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
						{ target: 'open', actions: ['invokeOnOpen'] }
					]
				}
			},
			closing: {
				tags: ['open'],
				effects: ['trackPointerMove', 'trackInteractOutside', 'waitForCloseDelay'],
				on: {
					'CONTROLLED.OPEN': { target: 'open' },
					'CONTROLLED.CLOSE': { target: 'closed', actions: ['focusParentMenu', 'restoreParentHighlightedItem'] },
					MENU_POINTERENTER: { target: 'open', actions: ['clearIntentPolygon'] },
					POINTER_MOVED_AWAY_FROM_SUBMENU: [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
						{ target: 'closed', actions: ['focusParentMenu', 'restoreParentHighlightedItem'] }
					],
					'DELAY.CLOSE': [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
						{ target: 'closed', actions: ['focusParentMenu', 'restoreParentHighlightedItem', 'invokeOnClose'] }
					]
				}
			},
			closed: {
				tags: ['closed'],
				entry: ['clearHighlightedItem', 'focusTrigger', 'resumePointer', 'clearAnchorPoint'],
				on: {
					'CONTROLLED.OPEN': [
						{ guard: Ht('isOpenAutoFocusEvent', 'isArrowDownEvent'), target: 'open', actions: ['highlightFirstItem'] },
						{ guard: 'isArrowUpEvent', target: 'open', actions: ['highlightLastItem'] },
						{ target: 'open' }
					],
					CONTEXT_MENU_START: { target: 'opening:contextmenu', actions: ['setAnchorPoint'] },
					CONTEXT_MENU: [
						{ guard: 'isOpenControlled', actions: ['setAnchorPoint', 'invokeOnOpen'] },
						{ target: 'open', actions: ['setAnchorPoint', 'invokeOnOpen'] }
					],
					TRIGGER_CLICK: [
						{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
						{ target: 'open', actions: ['invokeOnOpen'] }
					],
					TRIGGER_POINTERMOVE: { guard: 'isTriggerItem', target: 'opening' },
					TRIGGER_BLUR: { target: 'idle' },
					ARROW_DOWN: [
						{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
						{ target: 'open', actions: ['highlightFirstItem', 'invokeOnOpen'] }
					],
					ARROW_UP: [
						{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
						{ target: 'open', actions: ['highlightLastItem', 'invokeOnOpen'] }
					]
				}
			},
			open: {
				tags: ['open'],
				effects: ['trackInteractOutside', 'trackPositioning', 'scrollToHighlightedItem'],
				entry: ['focusMenu', 'resumePointer'],
				on: {
					'CONTROLLED.CLOSE': [{ target: 'closed', guard: 'isArrowLeftEvent', actions: ['focusParentMenu'] }, { target: 'closed' }],
					TRIGGER_CLICK: [
						{ guard: Q(W('isTriggerItem'), 'isOpenControlled'), actions: ['invokeOnClose'] },
						{ guard: W('isTriggerItem'), target: 'closed', actions: ['invokeOnClose'] }
					],
					CONTEXT_MENU: { actions: ['setAnchorPoint', 'focusMenu'] },
					ARROW_UP: { actions: ['highlightPrevItem', 'focusMenu'] },
					ARROW_DOWN: { actions: ['highlightNextItem', 'focusMenu'] },
					ARROW_LEFT: [
						{ guard: Q('isSubmenu', 'isOpenControlled'), actions: ['invokeOnClose'] },
						{ guard: 'isSubmenu', target: 'closed', actions: ['focusParentMenu', 'invokeOnClose'] }
					],
					HOME: { actions: ['highlightFirstItem', 'focusMenu'] },
					END: { actions: ['highlightLastItem', 'focusMenu'] },
					ARROW_RIGHT: { guard: 'isTriggerItemHighlighted', actions: ['openSubmenu'] },
					ENTER: [{ guard: 'isTriggerItemHighlighted', actions: ['openSubmenu'] }, { actions: ['clickHighlightedItem'] }],
					ITEM_POINTERMOVE: [
						{ guard: W('isPointerSuspended'), actions: ['setHighlightedItem', 'focusMenu'] },
						{ actions: ['setLastHighlightedItem'] }
					],
					ITEM_POINTERLEAVE: { guard: Q(W('isPointerSuspended'), W('isTriggerItem')), actions: ['clearHighlightedItem'] },
					ITEM_CLICK: [
						{
							guard: Q(W('isTriggerItemHighlighted'), W('isHighlightedItemEditable'), 'closeOnSelect', 'isOpenControlled'),
							actions: ['invokeOnSelect', 'setOptionState', 'closeRootMenu', 'invokeOnClose']
						},
						{
							guard: Q(W('isTriggerItemHighlighted'), W('isHighlightedItemEditable'), 'closeOnSelect'),
							target: 'closed',
							actions: ['invokeOnSelect', 'setOptionState', 'closeRootMenu', 'invokeOnClose']
						},
						{ guard: Q(W('isTriggerItemHighlighted'), W('isHighlightedItemEditable')), actions: ['invokeOnSelect', 'setOptionState'] },
						{ actions: ['setHighlightedItem'] }
					],
					TRIGGER_POINTERMOVE: { guard: 'isTriggerItem', actions: ['setIntentPolygon'] },
					TRIGGER_POINTERLEAVE: { target: 'closing' },
					ITEM_POINTERDOWN: { actions: ['setHighlightedItem'] },
					TYPEAHEAD: { actions: ['highlightMatchedItem'] },
					FOCUS_MENU: { actions: ['focusMenu'] },
					'POSITIONING.SET': { actions: ['reposition'] }
				}
			}
		},
		implementations: {
			guards: {
				closeOnSelect: ({ prop: e, event: t }) => !!(t?.closeOnSelect ?? e('closeOnSelect')),
				isTriggerItem: ({ event: e }) => Dt(e.target),
				isTriggerItemHighlighted: ({ event: e, scope: t, computed: n }) =>
					!!(e.target ?? t.getById(n('highlightedId')))?.hasAttribute('data-controls'),
				isSubmenu: ({ context: e }) => e.get('isSubmenu'),
				isPointerSuspended: ({ context: e }) => e.get('suspendPointer'),
				isHighlightedItemEditable: ({ scope: e, computed: t }) => Ne(e.getById(t('highlightedId'))),
				isOpenControlled: ({ prop: e }) => e('open') !== void 0,
				isArrowLeftEvent: ({ event: e }) => e.previousEvent?.type === 'ARROW_LEFT',
				isArrowUpEvent: ({ event: e }) => e.previousEvent?.type === 'ARROW_UP',
				isArrowDownEvent: ({ event: e }) => e.previousEvent?.type === 'ARROW_DOWN',
				isOpenAutoFocusEvent: ({ event: e }) => e.previousEvent?.type === 'OPEN_AUTOFOCUS'
			},
			effects: {
				waitForOpenDelay({ send: e }) {
					const t = setTimeout(() => {
						e({ type: 'DELAY.OPEN' });
					}, 100);
					return () => clearTimeout(t);
				},
				waitForCloseDelay({ send: e }) {
					const t = setTimeout(() => {
						e({ type: 'DELAY.CLOSE' });
					}, 300);
					return () => clearTimeout(t);
				},
				waitForLongPress({ send: e }) {
					const t = setTimeout(() => {
						e({ type: 'LONG_PRESS.OPEN' });
					}, 700);
					return () => clearTimeout(t);
				},
				trackPositioning({ context: e, prop: t, scope: n, refs: o }) {
					if (pe(n)) return;
					const i = { ...t('positioning'), ...o.get('positioningOverride') };
					e.set('currentPlacement', i.placement);
					const u = () => _e(n);
					return ye(le(n), u, {
						...i,
						defer: !0,
						onComplete(s) {
							e.set('currentPlacement', s.placement);
						}
					});
				},
				trackInteractOutside({ refs: e, scope: t, prop: n, context: o, send: i }) {
					const u = () => q(t);
					let s = !0;
					return qe(u, {
						type: 'menu',
						defer: !0,
						exclude: [le(t)],
						onInteractOutside: n('onInteractOutside'),
						onRequestDismiss: n('onRequestDismiss'),
						onFocusOutside(c) {
							n('onFocusOutside')?.(c);
							const m = ge(c.detail.originalEvent);
							if (de(pe(t), m)) {
								c.preventDefault();
								return;
							}
						},
						onEscapeKeyDown(c) {
							(n('onEscapeKeyDown')?.(c), o.get('isSubmenu') && c.preventDefault(), Re({ parent: e.get('parent') }));
						},
						onPointerDownOutside(c) {
							n('onPointerDownOutside')?.(c);
							const m = ge(c.detail.originalEvent);
							if (de(pe(t), m) && c.detail.contextmenu) {
								c.preventDefault();
								return;
							}
							s = !c.detail.focusable;
						},
						onDismiss() {
							i({ type: 'CLOSE', src: 'interact-outside', restoreFocus: s });
						}
					});
				},
				trackPointerMove({ context: e, scope: t, send: n, refs: o, flush: i }) {
					const u = o.get('parent');
					i(() => {
						u.context.set('suspendPointer', !0);
					});
					const s = t.getDoc();
					return Ke(s, 'pointermove', (c) => {
						Vt(e.get('intentPolygon'), { x: c.clientX, y: c.clientY }) ||
							(n({ type: 'POINTER_MOVED_AWAY_FROM_SUBMENU' }), u.context.set('suspendPointer', !1));
					});
				},
				scrollToHighlightedItem({ event: e, scope: t, computed: n }) {
					const o = () => {
						if (e.current().type.startsWith('ITEM_POINTER')) return;
						const u = t.getById(n('highlightedId')),
							s = q(t);
						Je(u, { rootEl: s, block: 'nearest' });
					};
					return (ae(() => o()), Ye(() => q(t), { defer: !0, attributes: ['aria-activedescendant'], callback: o }));
				}
			},
			actions: {
				setAnchorPoint({ context: e, event: t }) {
					e.set('anchorPoint', (n) => (Xe(n, t.point) ? n : t.point));
				},
				setSubmenuPlacement({ context: e, computed: t, refs: n }) {
					if (!e.get('isSubmenu')) return;
					const o = t('isRtl') ? 'left-start' : 'right-start';
					n.set('positioningOverride', { placement: o, gutter: 0 });
				},
				reposition({ context: e, scope: t, prop: n, event: o, refs: i }) {
					const u = () => _e(t),
						s = e.get('anchorPoint'),
						c = s ? () => ({ width: 0, height: 0, ...s }) : void 0,
						m = { ...n('positioning'), ...i.get('positioningOverride') };
					ye(le(t), u, {
						...m,
						defer: !0,
						getAnchorRect: c,
						...(o.options ?? {}),
						listeners: !1,
						onComplete(v) {
							e.set('currentPlacement', v.placement);
						}
					});
				},
				setOptionState({ event: e }) {
					if (!e.option) return;
					const { checked: t, onCheckedChange: n, type: o } = e.option;
					o === 'radio' ? n?.(!0) : o === 'checkbox' && n?.(!t);
				},
				clickHighlightedItem({ scope: e, computed: t, prop: n, context: o }) {
					const i = e.getById(t('highlightedId'));
					if (!i || i.dataset.disabled) return;
					const u = o.get('highlightedValue');
					Be(i) ? n('navigate')?.({ value: u, node: i, href: i.href }) : queueMicrotask(() => i.click());
				},
				setIntentPolygon({ context: e, scope: t, event: n }) {
					const o = q(t),
						i = e.get('currentPlacement');
					if (!o || !i) return;
					const u = o.getBoundingClientRect(),
						s = mt(u, i);
					if (!s) return;
					const m = ct(i) === 'right' ? -5 : 5;
					e.set('intentPolygon', [{ ...n.point, x: n.point.x + m }, ...s]);
				},
				clearIntentPolygon({ context: e }) {
					e.set('intentPolygon', null);
				},
				clearAnchorPoint({ context: e }) {
					e.set('anchorPoint', null);
				},
				resumePointer({ refs: e, flush: t }) {
					const n = e.get('parent');
					n &&
						t(() => {
							n.context.set('suspendPointer', !1);
						});
				},
				setHighlightedItem({ context: e, event: t }) {
					const n = t.value || j(t.target);
					e.set('highlightedValue', n);
				},
				clearHighlightedItem({ context: e }) {
					e.set('highlightedValue', null);
				},
				focusMenu({ scope: e }) {
					ae(() => {
						const t = q(e);
						We({
							root: t,
							enabled: !de(t, e.getActiveElement()),
							filter(o) {
								return !o.role?.startsWith('menuitem');
							}
						})?.focus({ preventScroll: !0 });
					});
				},
				highlightFirstItem({ context: e, scope: t }) {
					(q(t) ? queueMicrotask : ae)(() => {
						const o = kt(t);
						o && e.set('highlightedValue', j(o));
					});
				},
				highlightLastItem({ context: e, scope: t }) {
					(q(t) ? queueMicrotask : ae)(() => {
						const o = Nt(t);
						o && e.set('highlightedValue', j(o));
					});
				},
				highlightNextItem({ context: e, scope: t, event: n, prop: o }) {
					const i = Lt(t, { loop: n.loop, value: e.get('highlightedValue'), loopFocus: o('loopFocus') });
					e.set('highlightedValue', j(i));
				},
				highlightPrevItem({ context: e, scope: t, event: n, prop: o }) {
					const i = At(t, { loop: n.loop, value: e.get('highlightedValue'), loopFocus: o('loopFocus') });
					e.set('highlightedValue', j(i));
				},
				invokeOnSelect({ context: e, prop: t, scope: n }) {
					const o = e.get('highlightedValue');
					if (o == null) return;
					const i = bt(n, o);
					(Gt(i, o), t('onSelect')?.({ value: o }));
				},
				focusTrigger({ scope: e, context: t, event: n }) {
					t.get('isSubmenu') || t.get('anchorPoint') || n.restoreFocus === !1 || queueMicrotask(() => le(e)?.focus({ preventScroll: !0 }));
				},
				highlightMatchedItem({ scope: e, context: t, event: n, refs: o }) {
					const i = Mt(e, { key: n.key, value: t.get('highlightedValue'), typeaheadState: o.get('typeaheadState') });
					i && t.set('highlightedValue', j(i));
				},
				setParentMenu({ refs: e, event: t, context: n }) {
					(e.set('parent', t.value), n.set('isSubmenu', !0));
				},
				setChildMenu({ refs: e, event: t }) {
					const n = e.get('children');
					((n[t.id] = t.value), e.set('children', n));
				},
				closeRootMenu({ refs: e }) {
					Re({ parent: e.get('parent') });
				},
				openSubmenu({ refs: e, scope: t, computed: n }) {
					const i = t.getById(n('highlightedId'))?.getAttribute('data-uid'),
						u = e.get('children');
					(i ? u[i] : null)?.send({ type: 'OPEN_AUTOFOCUS' });
				},
				focusParentMenu({ refs: e }) {
					e.get('parent')?.send({ type: 'FOCUS_MENU' });
				},
				setLastHighlightedItem({ context: e, event: t }) {
					e.set('lastHighlightedValue', j(t.target));
				},
				restoreHighlightedItem({ context: e }) {
					e.get('lastHighlightedValue') && (e.set('highlightedValue', e.get('lastHighlightedValue')), e.set('lastHighlightedValue', null));
				},
				restoreParentHighlightedItem({ refs: e }) {
					e.get('parent')?.send({ type: 'HIGHLIGHTED.RESTORE' });
				},
				invokeOnOpen({ prop: e }) {
					e('onOpenChange')?.({ open: !0 });
				},
				invokeOnClose({ prop: e }) {
					e('onOpenChange')?.({ open: !1 });
				},
				toggleVisibility({ prop: e, event: t, send: n }) {
					n({ type: e('open') ? 'CONTROLLED.OPEN' : 'CONTROLLED.CLOSE', previousEvent: t });
				}
			}
		}
	});
function Re(e) {
	let t = e.parent;
	for (; t && t.context.get('isSubmenu'); ) t = t.refs.get('parent');
	t?.send({ type: 'CLOSE' });
}
function Vt(e, t) {
	return e ? ht(e, t) : !1;
}
function Ft(e, t, n) {
	const o = Object.keys(e).length > 0;
	if (!t) return null;
	if (!o) return te(n, t);
	for (const i in e) {
		const u = e[i],
			s = ue(u.scope);
		if (s === t) return s;
	}
	return te(n, t);
}
var $t = ne()([
		'anchorPoint',
		'aria-label',
		'closeOnSelect',
		'composite',
		'defaultHighlightedValue',
		'defaultOpen',
		'dir',
		'getRootNode',
		'highlightedValue',
		'id',
		'ids',
		'loopFocus',
		'navigate',
		'onEscapeKeyDown',
		'onFocusOutside',
		'onHighlightChange',
		'onInteractOutside',
		'onOpenChange',
		'onPointerDownOutside',
		'onRequestDismiss',
		'onSelect',
		'open',
		'positioning',
		'typeahead'
	]),
	Ut = re($t),
	Wt = ne()(['closeOnSelect', 'disabled', 'value', 'valueText']),
	Ge = re(Wt),
	Bt = ne()(['htmlFor']),
	Xt = re(Bt),
	Yt = ne()(['id']),
	Kt = re(Yt),
	qt = ne()(['checked', 'closeOnSelect', 'disabled', 'onCheckedChange', 'type', 'value', 'valueText']),
	jt = re(qt),
	Jt = H('<div><!></div>');
function Qt(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = Ae.consume(),
		u = l(() => Xt({ htmlFor: i().id, ...n })),
		s = l(() => z(r(u), 2)),
		c = l(() => r(s)[0]),
		m = l(() => r(s)[1]),
		v = l(() => r(m).element),
		I = l(() => r(m).children),
		f = l(() => w(r(m), ['element', 'children'])),
		g = l(() => V(o().getItemGroupLabelProps(r(c)), r(f)));
	var d = T(),
		h = P(d);
	{
		var S = (O) => {
				var y = T(),
					B = P(y);
				(C(
					B,
					() => r(v),
					() => r(g)
				),
					p(O, y));
			},
			_ = (O) => {
				var y = Jt();
				x(y, () => ({ ...r(g) }));
				var B = $(y);
				(C(B, () => r(I) ?? L), U(y), p(O, y));
			};
		G(h, (O) => {
			r(v) ? O(S) : O(_, !1);
		});
	}
	(p(e, d), N());
}
var Zt = H('<div><!></div>');
function zt(e, t) {
	const n = ke();
	k(t, !0);
	const o = A(t, ['$$slots', '$$events', '$$legacy']),
		i = b.consume(),
		u = l(() => Kt({ id: n, ...o })),
		s = l(() => z(r(u), 2)),
		c = l(() => r(s)[0]),
		m = l(() => r(s)[1]),
		v = l(() => r(m).element),
		I = l(() => r(m).children),
		f = l(() => w(r(m), ['element', 'children'])),
		g = l(() => V(i().getItemGroupProps(r(c)), r(f)));
	Ae.provide(() => r(c));
	var d = T(),
		h = P(d);
	{
		var S = (O) => {
				var y = T(),
					B = P(y);
				(C(
					B,
					() => r(v),
					() => r(g)
				),
					p(O, y));
			},
			_ = (O) => {
				var y = Zt();
				x(y, () => ({ ...r(g) }));
				var B = $(y);
				(C(B, () => r(I) ?? L), U(y), p(O, y));
			};
		G(h, (O) => {
			r(v) ? O(S) : O(_, !1);
		});
	}
	(p(e, d), N());
}
const ie = me();
var en = H('<div><!></div>');
function tn(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = ie.consume(),
		u = l(() => t.element),
		s = l(() => t.children),
		c = l(() => w(n, ['element', 'children'])),
		m = l(() => V(o().getItemIndicatorProps(i()), r(c)));
	var v = T(),
		I = P(v);
	{
		var f = (d) => {
				var h = T(),
					S = P(h);
				(C(
					S,
					() => r(u),
					() => r(m)
				),
					p(d, h));
			},
			g = (d) => {
				var h = en();
				x(h, () => ({ ...r(m) }));
				var S = $(h);
				(C(S, () => r(s) ?? L), U(h), p(d, h));
			};
		G(I, (d) => {
			r(u) ? d(f) : d(g, !1);
		});
	}
	(p(e, v), N());
}
var nn = H('<div><!></div>');
function rn(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = ie.consume(),
		u = l(() => t.element),
		s = l(() => t.children),
		c = l(() => w(n, ['element', 'children'])),
		m = l(() => V(o().getItemTextProps(i()), r(c)));
	var v = T(),
		I = P(v);
	{
		var f = (d) => {
				var h = T(),
					S = P(h);
				(C(
					S,
					() => r(u),
					() => r(m)
				),
					p(d, h));
			},
			g = (d) => {
				var h = nn();
				x(h, () => ({ ...r(m) }));
				var S = $(h);
				(C(S, () => r(s) ?? L), U(h), p(d, h));
			};
		G(I, (d) => {
			r(u) ? d(f) : d(g, !1);
		});
	}
	(p(e, v), N());
}
var on = H('<div><!></div>');
function an(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => Ge(n)),
		u = l(() => z(r(i), 2)),
		s = l(() => r(u)[0]),
		c = l(() => r(u)[1]),
		m = l(() => r(c).element),
		v = l(() => r(c).children),
		I = l(() => w(r(c), ['element', 'children'])),
		f = l(() => V(o().getItemProps(r(s)), r(I)));
	ie.provide(() => r(s));
	var g = T(),
		d = P(g);
	{
		var h = (_) => {
				var O = T(),
					y = P(O);
				(C(
					y,
					() => r(m),
					() => r(f)
				),
					p(_, O));
			},
			S = (_) => {
				var O = on();
				x(O, () => ({ ...r(f) }));
				var y = $(O);
				(C(y, () => r(v) ?? L), U(O), p(_, O));
			};
		G(d, (_) => {
			r(m) ? _(h) : _(S, !1);
		});
	}
	(p(e, g), N());
}
var sn = H('<div><!></div>');
function ln(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => jt(n)),
		u = l(() => z(r(i), 2)),
		s = l(() => r(u)[0]),
		c = l(() => r(u)[1]),
		m = l(() => r(c).element),
		v = l(() => r(c).children),
		I = l(() => w(r(c), ['element', 'children'])),
		f = l(() => V(o().getOptionItemProps(r(s)), r(I)));
	ie.provide(() => r(s));
	var g = T(),
		d = P(g);
	{
		var h = (_) => {
				var O = T(),
					y = P(O);
				(C(
					y,
					() => r(m),
					() => r(f)
				),
					p(_, O));
			},
			S = (_) => {
				var O = sn();
				x(O, () => ({ ...r(f) }));
				var y = $(O);
				(C(y, () => r(v) ?? L), U(O), p(_, O));
			};
		G(d, (_) => {
			r(m) ? _(h) : _(S, !1);
		});
	}
	(p(e, g), N());
}
var cn = H('<div><!></div>');
function dn(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => t.element),
		u = l(() => t.children),
		s = l(() => w(n, ['element', 'children'])),
		c = l(() => V(o().getPositionerProps(), r(s)));
	var m = T(),
		v = P(m);
	{
		var I = (g) => {
				var d = T(),
					h = P(d);
				(C(
					h,
					() => r(i),
					() => r(c)
				),
					p(g, d));
			},
			f = (g) => {
				var d = cn();
				x(d, () => ({ ...r(c) }));
				var h = $(d);
				(C(h, () => r(u) ?? L), U(d), p(g, d));
			};
		G(v, (g) => {
			r(i) ? g(I) : g(f, !1);
		});
	}
	(p(e, m), N());
}
function gn(e, t) {
	k(t, !0);
	const n = b.consume(),
		o = l(() => t.children);
	var i = T(),
		u = P(i);
	(C(
		u,
		() => r(o),
		() => n
	),
		p(e, i),
		N());
}
const Oe = me();
function un(e, t) {
	k(t, !0);
	const n = b.consume(),
		o = l(() => t.children),
		i = l(() => t.value);
	(Se(() =>
		be(() => {
			n && (r(i)().setParent(n().service), n().setChild(r(i)().service));
		})
	),
		b.provide(() => r(i)()),
		Oe.provide(() => n?.().getTriggerItemProps(r(i)())));
	var u = T(),
		s = P(u);
	(C(s, () => r(o) ?? L), p(e, u), N());
}
function mn(e) {
	const t = He(xt, e),
		n = l(() => wt(t, xe));
	return () => ({
		...r(n),
		get service() {
			return t;
		}
	});
}
function hn(e, t) {
	const n = ke();
	k(t, !0);
	const o = A(t, ['$$slots', '$$events', '$$legacy']),
		i = b.consume(),
		u = l(() => Ut(o)),
		s = l(() => z(r(u), 2)),
		c = l(() => r(s)[0]),
		m = l(() => r(s)[1]),
		v = l(() => r(m).children),
		I = mn(() => ({ ...r(c), id: n }));
	(Se(() =>
		be(() => {
			i && (I().setParent(i().service), i().setChild(I().service));
		})
	),
		b.provide(() => I()),
		Oe.provide(() => i?.().getTriggerItemProps(I())));
	var f = T(),
		g = P(f);
	(C(g, () => r(v) ?? L), p(e, f), N());
}
var pn = H('<hr/>');
function vn(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => t.element),
		u = l(() => w(n, ['element'])),
		s = l(() => V(o().getSeparatorProps(), r(u)));
	var c = T(),
		m = P(c);
	{
		var v = (f) => {
				var g = T(),
					d = P(g);
				(C(
					d,
					() => r(i),
					() => r(s)
				),
					p(f, g));
			},
			I = (f) => {
				var g = pn();
				(x(g, () => ({ ...r(s) })), p(f, g));
			};
		G(m, (f) => {
			r(i) ? f(v) : f(I, !1);
		});
	}
	(p(e, c), N());
}
var fn = H('<div><!></div>');
function On(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = Oe.consume(),
		i = l(() => Ge(n)),
		u = l(() => z(r(i), 2)),
		s = l(() => r(u)[0]),
		c = l(() => r(u)[1]),
		m = l(() => r(c).element),
		v = l(() => r(c).children),
		I = l(() => w(r(c), ['element', 'children'])),
		f = l(() => V(o(), r(I)));
	ie.provide(() => r(s));
	var g = T(),
		d = P(g);
	{
		var h = (_) => {
				var O = T(),
					y = P(O);
				(C(
					y,
					() => r(m),
					() => r(f)
				),
					p(_, O));
			},
			S = (_) => {
				var O = fn();
				x(O, () => ({ ...r(f) }));
				var y = $(O);
				(C(y, () => r(v) ?? L), U(O), p(_, O));
			};
		G(d, (_) => {
			r(m) ? _(h) : _(S, !1);
		});
	}
	(p(e, g), N());
}
var En = H('<button><!></button>');
function In(e, t) {
	k(t, !0);
	const n = A(t, ['$$slots', '$$events', '$$legacy']),
		o = b.consume(),
		i = l(() => t.element),
		u = l(() => t.children),
		s = l(() => w(n, ['element', 'children'])),
		c = l(() => V(o().getTriggerProps(), r(s)));
	var m = T(),
		v = P(m);
	{
		var I = (g) => {
				var d = T(),
					h = P(d);
				(C(
					h,
					() => r(i),
					() => r(c)
				),
					p(g, d));
			},
			f = (g) => {
				var d = En();
				x(d, () => ({ ...r(c) }));
				var h = $(d);
				(C(h, () => r(u) ?? L), U(d), p(g, d));
			};
		G(v, (g) => {
			r(i) ? g(I) : g(f, !1);
		});
	}
	(p(e, m), N());
}
const Nn = Object.assign(hn, {
	Provider: un,
	Context: gn,
	Trigger: In,
	ContextTrigger: Tt,
	Indicator: Ct,
	Positioner: dn,
	Content: It,
	ItemGroup: zt,
	ItemGroupLabel: Qt,
	Item: an,
	OptionItem: ln,
	TriggerItem: On,
	ItemText: rn,
	ItemIndicator: tn,
	Separator: vn,
	Arrow: Ot,
	ArrowTip: vt
});
export { Nn as M };
//# sourceMappingURL=BqfWDWTg.js.map
