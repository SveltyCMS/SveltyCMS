import { i as V } from './zi73tRJP.js';
import { A as C, B as re, D as ie, J as se, bt as ae, p as w, f as P, g as s, u as d, a as _, c as A, r as F, bx as K, e as le } from './DrlZFkx8.js';
import { c as h, a as m, f as x, p as ce } from './CTjXDULS.js';
import { s as k } from './DhHAlOU0.js';
import { f as H } from './MEFvoR_D.js';
import { r as D } from './DePHBZW_.js';
import { c as de, m as R, a as ue, u as pe, n as ve } from './DtaauZrZ.js';
import {
	g as I,
	V as J,
	W as ge,
	F as Q,
	X as fe,
	q as me,
	Y as ye,
	Z as W,
	_ as Oe,
	$ as Pe,
	D as he,
	p as ke,
	A as be,
	a0 as Ee,
	x as Ce
} from './C-hhfhAN.js';
import { g as X, a as we } from './Kpla-k0W.js';
function _e() {
	return Symbol(ae);
}
function Me(e, t = C) {
	return (n) => {
		const { update: o, destroy: r } = re(() => e(n, t()) ?? {});
		if (o) {
			var c = !1;
			(ie(() => {
				const l = t();
				c && o(l);
			}),
				(c = !0));
		}
		r && se(r);
	};
}
function Te(e, t = {}) {
	function n(o = {}) {
		const { container: r, disabled: c, getRootNode: l } = o;
		if (c) return;
		const u = l?.().ownerDocument ?? document;
		(r ?? u.body).appendChild(e);
	}
	return (n(t), { destroy: () => e.remove(), update: n });
}
function Le(e) {
	return !(e.metaKey || (!fe() && e.altKey) || e.ctrlKey || e.key === 'Control' || e.key === 'Shift' || e.key === 'Meta');
}
var De = new Set(['checkbox', 'radio', 'range', 'color', 'file', 'image', 'button', 'submit', 'reset']);
function Se(e, t, n) {
	const o = n ? Q(n) : null,
		r = I(o);
	return (
		(e =
			e ||
			(o instanceof r.HTMLInputElement && !De.has(o?.type)) ||
			o instanceof r.HTMLTextAreaElement ||
			(o instanceof r.HTMLElement && o.isContentEditable)),
		!(e && t === 'keyboard' && n instanceof r.KeyboardEvent && !Reflect.has(Ie, n.key))
	);
}
var L = null,
	q = new Set(),
	B = new Map(),
	T = !1,
	Y = !1,
	Ie = { Tab: !0, Escape: !0 };
function G(e, t) {
	for (let n of q) n(e, t);
}
function N(e) {
	((T = !0), Le(e) && ((L = 'keyboard'), G('keyboard', e)));
}
function b(e) {
	((L = 'pointer'), (e.type === 'mousedown' || e.type === 'pointerdown') && ((T = !0), G('pointer', e)));
}
function z(e) {
	ge(e) && ((T = !0), (L = 'virtual'));
}
function ee(e) {
	const t = Q(e);
	t === I(t) || t === J(t) || (!T && !Y && ((L = 'virtual'), G('virtual', e)), (T = !1), (Y = !1));
}
function te() {
	((T = !1), (Y = !0));
}
function Ve(e) {
	if (typeof window > 'u' || B.get(I(e))) return;
	const t = I(e),
		n = J(e);
	let o = t.HTMLElement.prototype.focus;
	function r() {
		((L = 'virtual'), G('virtual', null), (T = !0), o.apply(this, arguments));
	}
	try {
		Object.defineProperty(t.HTMLElement.prototype, 'focus', { configurable: !0, value: r });
	} catch {}
	(n.addEventListener('keydown', N, !0),
		n.addEventListener('keyup', N, !0),
		n.addEventListener('click', z, !0),
		t.addEventListener('focus', ee, !0),
		t.addEventListener('blur', te, !1),
		typeof t.PointerEvent < 'u'
			? (n.addEventListener('pointerdown', b, !0), n.addEventListener('pointermove', b, !0), n.addEventListener('pointerup', b, !0))
			: (n.addEventListener('mousedown', b, !0), n.addEventListener('mousemove', b, !0), n.addEventListener('mouseup', b, !0)),
		t.addEventListener(
			'beforeunload',
			() => {
				Ae(e);
			},
			{ once: !0 }
		),
		B.set(t, { focus: o }));
}
var Ae = (e, t) => {
	const n = I(e),
		o = J(e),
		r = B.get(n);
	if (r) {
		try {
			Object.defineProperty(n.HTMLElement.prototype, 'focus', { configurable: !0, value: r.focus });
		} catch {}
		(o.removeEventListener('keydown', N, !0),
			o.removeEventListener('keyup', N, !0),
			o.removeEventListener('click', z, !0),
			n.removeEventListener('focus', ee, !0),
			n.removeEventListener('blur', te, !1),
			typeof n.PointerEvent < 'u'
				? (o.removeEventListener('pointerdown', b, !0), o.removeEventListener('pointermove', b, !0), o.removeEventListener('pointerup', b, !0))
				: (o.removeEventListener('mousedown', b, !0), o.removeEventListener('mousemove', b, !0), o.removeEventListener('mouseup', b, !0)),
			B.delete(n));
	}
};
function U() {
	return L === 'keyboard';
}
function Fe(e = {}) {
	const { isTextInput: t, autoFocus: n, onChange: o, root: r } = e;
	(Ve(r), o?.({ isFocusVisible: n || U(), modality: L }));
	const c = (l, u) => {
		Se(!!t, l, u) && o?.({ isFocusVisible: U(), modality: l });
	};
	return (
		q.add(c),
		() => {
			q.delete(c);
		}
	);
}
const M = de();
var Ke = x('<div><!></div>');
function xe(e, t) {
	w(t, !0);
	const n = D(t, ['$$slots', '$$events', '$$legacy']),
		o = M.consume(),
		r = d(() => t.element),
		c = d(() => t.children),
		l = d(() => K(n, ['element', 'children'])),
		u = d(() => R(o().getArrowTipProps(), s(l)));
	var v = h(),
		y = P(v);
	{
		var g = (a) => {
				var i = h(),
					p = P(i);
				(k(
					p,
					() => s(r),
					() => s(u)
				),
					m(a, i));
			},
			O = (a) => {
				var i = Ke();
				H(i, () => ({ ...s(u) }));
				var p = A(i);
				(k(p, () => s(c) ?? C), F(i), m(a, i));
			};
		V(y, (a) => {
			s(r) ? a(g) : a(O, !1);
		});
	}
	(m(e, v), _());
}
var He = x('<div><!></div>');
function Re(e, t) {
	w(t, !0);
	const n = D(t, ['$$slots', '$$events', '$$legacy']),
		o = M.consume(),
		r = d(() => t.element),
		c = d(() => t.children),
		l = d(() => K(n, ['element', 'children'])),
		u = d(() => R(o().getArrowProps(), s(l)));
	var v = h(),
		y = P(v);
	{
		var g = (a) => {
				var i = h(),
					p = P(i);
				(k(
					p,
					() => s(r),
					() => s(u)
				),
					m(a, i));
			},
			O = (a) => {
				var i = He();
				H(i, () => ({ ...s(u) }));
				var p = A(i);
				(k(p, () => s(c) ?? C), F(i), m(a, i));
			};
		V(y, (a) => {
			s(r) ? a(g) : a(O, !1);
		});
	}
	(m(e, v), _());
}
var Be = x('<div><!></div>');
function Ne(e, t) {
	w(t, !0);
	const n = D(t, ['$$slots', '$$events', '$$legacy']),
		o = M.consume(),
		r = d(() => t.element),
		c = d(() => t.children),
		l = d(() => K(n, ['element', 'children'])),
		u = d(() => R(o().getContentProps(), s(l)));
	var v = h(),
		y = P(v);
	{
		var g = (a) => {
				var i = h(),
					p = P(i);
				(k(
					p,
					() => s(r),
					() => s(u)
				),
					m(a, i));
			},
			O = (a) => {
				var i = Be();
				H(i, () => ({ ...s(u) }));
				var p = A(i);
				(k(p, () => s(c) ?? C), F(i), m(a, i));
			};
		V(y, (a) => {
			s(r) ? a(g) : a(O, !1);
		});
	}
	(m(e, v), _());
}
var Ge = x('<div><!></div>');
function We(e, t) {
	w(t, !0);
	const n = D(t, ['$$slots', '$$events', '$$legacy']),
		o = M.consume(),
		r = d(() => t.element),
		c = d(() => t.children),
		l = d(() => K(n, ['element', 'children'])),
		u = d(() => R(o().getPositionerProps(), { [_e()]: Me(Te, () => {}) }, s(l)));
	var v = h(),
		y = P(v);
	{
		var g = (a) => {
				var i = h(),
					p = P(i);
				(k(
					p,
					() => s(r),
					() => s(u)
				),
					m(a, i));
			},
			O = (a) => {
				var i = Ge();
				H(i, () => ({ ...s(u) }));
				var p = A(i);
				(k(p, () => s(c) ?? C), F(i), m(a, i));
			};
		V(y, (a) => {
			s(r) ? a(g) : a(O, !1);
		});
	}
	(m(e, v), _());
}
function je(e, t) {
	w(t, !0);
	const n = M.consume(),
		o = d(() => t.children);
	var r = h(),
		c = P(r);
	(k(
		c,
		() => s(o),
		() => n
	),
		m(e, r),
		_());
}
var qe = ke('tooltip').parts('trigger', 'arrow', 'arrowTip', 'positioner', 'content'),
	S = qe.build(),
	ne = (e) => e.ids?.trigger ?? `tooltip:${e.id}:trigger`,
	Ye = (e) => e.ids?.content ?? `tooltip:${e.id}:content`,
	Ue = (e) => e.ids?.arrow ?? `tooltip:${e.id}:arrow`,
	oe = (e) => e.ids?.positioner ?? `tooltip:${e.id}:popper`,
	j = (e) => e.getById(ne(e)),
	Z = (e) => e.getById(oe(e)),
	E = Oe({ id: null });
function Je(e, t) {
	const { state: n, context: o, send: r, scope: c, prop: l, event: u } = e,
		v = l('id'),
		y = !!l('aria-label'),
		g = n.matches('open', 'closing'),
		O = ne(c),
		a = Ye(c),
		i = l('disabled'),
		p = we({ ...l('positioning'), placement: o.get('currentPlacement') });
	return {
		open: g,
		setOpen(f) {
			n.matches('open', 'closing') !== f && r({ type: f ? 'open' : 'close' });
		},
		reposition(f = {}) {
			r({ type: 'positioning.set', options: f });
		},
		getTriggerProps() {
			return t.button({
				...S.trigger.attrs,
				id: O,
				dir: l('dir'),
				'data-expanded': be(g),
				'data-state': g ? 'open' : 'closed',
				'aria-describedby': g ? a : void 0,
				onClick(f) {
					f.defaultPrevented || i || (l('closeOnClick') && r({ type: 'close', src: 'trigger.click' }));
				},
				onFocus(f) {
					queueMicrotask(() => {
						f.defaultPrevented || i || (u.src !== 'trigger.pointerdown' && U() && r({ type: 'open', src: 'trigger.focus' }));
					});
				},
				onBlur(f) {
					f.defaultPrevented || i || (v === E.get('id') && r({ type: 'close', src: 'trigger.blur' }));
				},
				onPointerDown(f) {
					f.defaultPrevented || i || (Ee(f) && l('closeOnPointerDown') && v === E.get('id') && r({ type: 'close', src: 'trigger.pointerdown' }));
				},
				onPointerMove(f) {
					f.defaultPrevented || i || (f.pointerType !== 'touch' && r({ type: 'pointer.move' }));
				},
				onPointerOver(f) {
					f.defaultPrevented || i || (f.pointerType !== 'touch' && r({ type: 'pointer.move' }));
				},
				onPointerLeave() {
					i || r({ type: 'pointer.leave' });
				},
				onPointerCancel() {
					i || r({ type: 'pointer.leave' });
				}
			});
		},
		getArrowProps() {
			return t.element({ id: Ue(c), ...S.arrow.attrs, dir: l('dir'), style: p.arrow });
		},
		getArrowTipProps() {
			return t.element({ ...S.arrowTip.attrs, dir: l('dir'), style: p.arrowTip });
		},
		getPositionerProps() {
			return t.element({ id: oe(c), ...S.positioner.attrs, dir: l('dir'), style: p.floating });
		},
		getContentProps() {
			return t.element({
				...S.content.attrs,
				dir: l('dir'),
				hidden: !g,
				'data-state': g ? 'open' : 'closed',
				role: y ? void 0 : 'tooltip',
				id: y ? void 0 : a,
				'data-placement': o.get('currentPlacement'),
				onPointerEnter() {
					r({ type: 'content.pointer.move' });
				},
				onPointerLeave() {
					r({ type: 'content.pointer.leave' });
				},
				style: { pointerEvents: l('interactive') ? 'auto' : 'none' }
			});
		}
	};
}
var { and: Xe, not: $ } = ye(),
	Ze = me({
		initialState: ({ prop: e }) => (e('open') || e('defaultOpen') ? 'open' : 'closed'),
		props({ props: e }) {
			const t = e.closeOnClick ?? !0,
				n = e.closeOnPointerDown ?? t;
			return {
				id: 'x',
				openDelay: 400,
				closeDelay: 150,
				closeOnEscape: !0,
				interactive: !1,
				closeOnScroll: !0,
				disabled: !1,
				...e,
				closeOnPointerDown: n,
				closeOnClick: t,
				positioning: { placement: 'bottom', ...e.positioning }
			};
		},
		effects: ['trackFocusVisible', 'trackStore'],
		context: ({ bindable: e }) => ({ currentPlacement: e(() => ({ defaultValue: void 0 })), hasPointerMoveOpened: e(() => ({ defaultValue: !1 })) }),
		watch({ track: e, action: t, prop: n }) {
			(e([() => n('disabled')], () => {
				t(['closeIfDisabled']);
			}),
				e([() => n('open')], () => {
					t(['toggleVisibility']);
				}));
		},
		states: {
			closed: {
				entry: ['clearGlobalId'],
				on: {
					'controlled.open': { target: 'open' },
					open: [
						{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
						{ target: 'open', actions: ['invokeOnOpen'] }
					],
					'pointer.leave': { actions: ['clearPointerMoveOpened'] },
					'pointer.move': [
						{ guard: Xe('noVisibleTooltip', $('hasPointerMoveOpened')), target: 'opening' },
						{ guard: $('hasPointerMoveOpened'), target: 'open', actions: ['setPointerMoveOpened', 'invokeOnOpen'] }
					]
				}
			},
			opening: {
				effects: ['trackScroll', 'trackPointerlockChange', 'waitForOpenDelay'],
				on: {
					'after.openDelay': [
						{ guard: 'isOpenControlled', actions: ['setPointerMoveOpened', 'invokeOnOpen'] },
						{ target: 'open', actions: ['setPointerMoveOpened', 'invokeOnOpen'] }
					],
					'controlled.open': { target: 'open' },
					'controlled.close': { target: 'closed' },
					open: [
						{ guard: 'isOpenControlled', actions: ['invokeOnOpen'] },
						{ target: 'open', actions: ['invokeOnOpen'] }
					],
					'pointer.leave': [
						{ guard: 'isOpenControlled', actions: ['clearPointerMoveOpened', 'invokeOnClose', 'toggleVisibility'] },
						{ target: 'closed', actions: ['clearPointerMoveOpened', 'invokeOnClose'] }
					],
					close: [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose', 'toggleVisibility'] },
						{ target: 'closed', actions: ['invokeOnClose'] }
					]
				}
			},
			open: {
				effects: ['trackEscapeKey', 'trackScroll', 'trackPointerlockChange', 'trackPositioning'],
				entry: ['setGlobalId'],
				on: {
					'controlled.close': { target: 'closed' },
					close: [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
						{ target: 'closed', actions: ['invokeOnClose'] }
					],
					'pointer.leave': [
						{ guard: 'isVisible', target: 'closing', actions: ['clearPointerMoveOpened'] },
						{ guard: 'isOpenControlled', actions: ['clearPointerMoveOpened', 'invokeOnClose'] },
						{ target: 'closed', actions: ['clearPointerMoveOpened', 'invokeOnClose'] }
					],
					'content.pointer.leave': { guard: 'isInteractive', target: 'closing' },
					'positioning.set': { actions: ['reposition'] }
				}
			},
			closing: {
				effects: ['trackPositioning', 'waitForCloseDelay'],
				on: {
					'after.closeDelay': [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
						{ target: 'closed', actions: ['invokeOnClose'] }
					],
					'controlled.close': { target: 'closed' },
					'controlled.open': { target: 'open' },
					close: [
						{ guard: 'isOpenControlled', actions: ['invokeOnClose'] },
						{ target: 'closed', actions: ['invokeOnClose'] }
					],
					'pointer.move': [
						{ guard: 'isOpenControlled', actions: ['setPointerMoveOpened', 'invokeOnOpen', 'toggleVisibility'] },
						{ target: 'open', actions: ['setPointerMoveOpened', 'invokeOnOpen'] }
					],
					'content.pointer.move': { guard: 'isInteractive', target: 'open' },
					'positioning.set': { actions: ['reposition'] }
				}
			}
		},
		implementations: {
			guards: {
				noVisibleTooltip: () => E.get('id') === null,
				isVisible: ({ prop: e }) => e('id') === E.get('id'),
				isInteractive: ({ prop: e }) => !!e('interactive'),
				hasPointerMoveOpened: ({ context: e }) => e.get('hasPointerMoveOpened'),
				isOpenControlled: ({ prop: e }) => e('open') !== void 0
			},
			actions: {
				setGlobalId: ({ prop: e }) => {
					E.set('id', e('id'));
				},
				clearGlobalId: ({ prop: e }) => {
					e('id') === E.get('id') && E.set('id', null);
				},
				invokeOnOpen: ({ prop: e }) => {
					e('onOpenChange')?.({ open: !0 });
				},
				invokeOnClose: ({ prop: e }) => {
					e('onOpenChange')?.({ open: !1 });
				},
				closeIfDisabled: ({ prop: e, send: t }) => {
					e('disabled') && t({ type: 'close', src: 'disabled.change' });
				},
				reposition: ({ context: e, event: t, prop: n, scope: o }) => {
					if (t.type !== 'positioning.set') return;
					const r = () => Z(o);
					return X(j(o), r, {
						...n('positioning'),
						...t.options,
						defer: !0,
						listeners: !1,
						onComplete(c) {
							e.set('currentPlacement', c.placement);
						}
					});
				},
				toggleVisibility: ({ prop: e, event: t, send: n }) => {
					queueMicrotask(() => {
						n({ type: e('open') ? 'controlled.open' : 'controlled.close', previousEvent: t });
					});
				},
				setPointerMoveOpened: ({ context: e }) => {
					e.set('hasPointerMoveOpened', !0);
				},
				clearPointerMoveOpened: ({ context: e }) => {
					e.set('hasPointerMoveOpened', !1);
				}
			},
			effects: {
				trackFocusVisible: ({ scope: e }) => Fe({ root: e.getRootNode?.() }),
				trackPositioning: ({ context: e, prop: t, scope: n }) => {
					e.get('currentPlacement') || e.set('currentPlacement', t('positioning').placement);
					const o = () => Z(n);
					return X(j(n), o, {
						...t('positioning'),
						defer: !0,
						onComplete(r) {
							e.set('currentPlacement', r.placement);
						}
					});
				},
				trackPointerlockChange: ({ send: e, scope: t }) => {
					const n = t.getDoc();
					return W(n, 'pointerlockchange', () => e({ type: 'close', src: 'pointerlock:change' }), !1);
				},
				trackScroll: ({ send: e, prop: t, scope: n }) => {
					if (!t('closeOnScroll')) return;
					const o = j(n);
					if (!o) return;
					const c = Pe(o).map((l) =>
						W(
							l,
							'scroll',
							() => {
								e({ type: 'close', src: 'scroll' });
							},
							{ passive: !0, capture: !0 }
						)
					);
					return () => {
						c.forEach((l) => l?.());
					};
				},
				trackStore: ({ prop: e, send: t }) => {
					let n;
					return (
						queueMicrotask(() => {
							n = E.subscribe(() => {
								E.get('id') !== e('id') && t({ type: 'close', src: 'id.change' });
							});
						}),
						() => n?.()
					);
				},
				trackEscapeKey: ({ send: e, prop: t }) =>
					t('closeOnEscape')
						? W(
								document,
								'keydown',
								(o) => {
									he(o) || (o.key === 'Escape' && (o.stopPropagation(), e({ type: 'close', src: 'keydown.escape' })));
								},
								!0
							)
						: void 0,
				waitForOpenDelay: ({ send: e, prop: t }) => {
					const n = setTimeout(() => {
						e({ type: 'after.openDelay' });
					}, t('openDelay'));
					return () => clearTimeout(n);
				},
				waitForCloseDelay: ({ send: e, prop: t }) => {
					const n = setTimeout(() => {
						e({ type: 'after.closeDelay' });
					}, t('closeDelay'));
					return () => clearTimeout(n);
				}
			}
		}
	}),
	$e = ue()([
		'aria-label',
		'closeDelay',
		'closeOnEscape',
		'closeOnPointerDown',
		'closeOnScroll',
		'closeOnClick',
		'dir',
		'disabled',
		'getRootNode',
		'id',
		'ids',
		'interactive',
		'onOpenChange',
		'defaultOpen',
		'open',
		'openDelay',
		'positioning'
	]),
	Qe = Ce($e);
function ze(e) {
	const t = pe(Ze, e),
		n = d(() => Je(t, ve));
	return () => s(n);
}
function et(e, t) {
	w(t, !0);
	const n = d(() => t.children),
		o = d(() => t.value);
	M.provide(() => s(o)());
	var r = h(),
		c = P(r);
	(k(c, () => s(n) ?? C), m(e, r), _());
}
function tt(e, t) {
	const n = ce();
	w(t, !0);
	const o = D(t, ['$$slots', '$$events', '$$legacy']),
		r = d(() => Qe(o)),
		c = d(() => le(s(r), 2)),
		l = d(() => s(c)[0]),
		u = d(() => s(c)[1]),
		v = d(() => s(u).children),
		y = ze(() => ({ ...s(l), id: n }));
	M.provide(() => y());
	var g = h(),
		O = P(g);
	(k(O, () => s(v) ?? C), m(e, g), _());
}
var nt = x('<button><!></button>');
function ot(e, t) {
	w(t, !0);
	const n = D(t, ['$$slots', '$$events', '$$legacy']),
		o = M.consume(),
		r = d(() => t.element),
		c = d(() => t.children),
		l = d(() => K(n, ['element', 'children'])),
		u = d(() => R(o().getTriggerProps(), s(l)));
	var v = h(),
		y = P(v);
	{
		var g = (a) => {
				var i = h(),
					p = P(i);
				(k(
					p,
					() => s(r),
					() => s(u)
				),
					m(a, i));
			},
			O = (a) => {
				var i = nt();
				H(i, () => ({ ...s(u) }));
				var p = A(i);
				(k(p, () => s(c) ?? C), F(i), m(a, i));
			};
		V(y, (a) => {
			s(r) ? a(g) : a(O, !1);
		});
	}
	(m(e, v), _());
}
const gt = Object.assign(tt, { Provider: et, Context: je, Trigger: ot, Positioner: We, Content: Ne, Arrow: Re, ArrowTip: xe });
export { gt as T };
//# sourceMappingURL=CPMcYF9a.js.map
