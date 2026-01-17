import { i as L } from './zi73tRJP.js';
import { p as C, f as E, a as P, g as r, u as c, e as q, c as k, A as W, r as M, bx as B } from './DrlZFkx8.js';
import { c as R, a as y, f as w, p as Z } from './CTjXDULS.js';
import { s as V } from './DhHAlOU0.js';
import { f as N } from './MEFvoR_D.js';
import { r as $ } from './DePHBZW_.js';
import { c as ee, a as z, m as S, u as te, n as ae } from './DtaauZrZ.js';
import {
	z as H,
	p as re,
	A as I,
	B as oe,
	C as se,
	D as ne,
	E as ie,
	F as ce,
	G as le,
	x as Y,
	H as ue,
	J as de,
	K as ve,
	L as ge,
	r as O,
	N as fe,
	O as pe,
	P as be,
	Q as me,
	R as ye,
	S as Te,
	h as _e,
	T as he,
	U as Ee
} from './C-hhfhAN.js';
const F = ee();
var Re = re('tabs').parts('root', 'list', 'trigger', 'content', 'indicator'),
	U = Re.build(),
	Ve = (e) => e.ids?.root ?? `tabs:${e.id}`,
	D = (e) => e.ids?.list ?? `tabs:${e.id}:list`,
	j = (e, t) => e.ids?.content?.(t) ?? `tabs:${e.id}:content-${t}`,
	A = (e, t) => e.ids?.trigger?.(t) ?? `tabs:${e.id}:trigger-${t}`,
	J = (e) => e.ids?.indicator ?? `tabs:${e.id}:indicator`,
	Ie = (e) => e.getById(D(e)),
	Ae = (e, t) => e.getById(j(e, t)),
	K = (e, t) => (t != null ? e.getById(A(e, t)) : null),
	G = (e) => e.getById(J(e)),
	x = (e) => {
		const s = `[role=tab][data-ownedby='${CSS.escape(D(e))}']:not([disabled])`;
		return he(Ie(e), s);
	},
	Ce = (e) => ye(x(e)),
	Pe = (e) => me(x(e)),
	Fe = (e, t) => be(x(e), A(e, t.value), t.loopFocus),
	Oe = (e, t) => pe(x(e), A(e, t.value), t.loopFocus),
	Q = (e) => ({ x: e?.offsetLeft ?? 0, y: e?.offsetTop ?? 0, width: e?.offsetWidth ?? 0, height: e?.offsetHeight ?? 0 }),
	Le = (e, t) => {
		const s = Ee(x(e), A(e, t));
		return Q(s);
	};
function Be(e, t) {
	const { state: s, send: o, context: i, prop: n, scope: v } = e,
		g = n('translations'),
		f = s.matches('focused'),
		T = n('orientation') === 'vertical',
		m = n('orientation') === 'horizontal',
		b = n('composite');
	function l(a) {
		return { selected: i.get('value') === a.value, focused: i.get('focusedValue') === a.value, disabled: !!a.disabled };
	}
	return {
		value: i.get('value'),
		focusedValue: i.get('focusedValue'),
		setValue(a) {
			o({ type: 'SET_VALUE', value: a });
		},
		clearValue() {
			o({ type: 'CLEAR_VALUE' });
		},
		setIndicatorRect(a) {
			const u = A(v, a);
			o({ type: 'SET_INDICATOR_RECT', id: u });
		},
		syncTabIndex() {
			o({ type: 'SYNC_TAB_INDEX' });
		},
		selectNext(a) {
			(o({ type: 'TAB_FOCUS', value: a, src: 'selectNext' }), o({ type: 'ARROW_NEXT', src: 'selectNext' }));
		},
		selectPrev(a) {
			(o({ type: 'TAB_FOCUS', value: a, src: 'selectPrev' }), o({ type: 'ARROW_PREV', src: 'selectPrev' }));
		},
		focus() {
			const a = i.get('value');
			a && K(v, a)?.focus();
		},
		getRootProps() {
			return t.element({ ...U.root.attrs, id: Ve(v), 'data-orientation': n('orientation'), 'data-focus': I(f), dir: n('dir') });
		},
		getListProps() {
			return t.element({
				...U.list.attrs,
				id: D(v),
				role: 'tablist',
				dir: n('dir'),
				'data-focus': I(f),
				'aria-orientation': n('orientation'),
				'data-orientation': n('orientation'),
				'aria-label': g?.listLabel,
				onKeyDown(a) {
					if (a.defaultPrevented || ne(a) || !ie(a.currentTarget, ce(a))) return;
					const u = {
						ArrowDown() {
							m || o({ type: 'ARROW_NEXT', key: 'ArrowDown' });
						},
						ArrowUp() {
							m || o({ type: 'ARROW_PREV', key: 'ArrowUp' });
						},
						ArrowLeft() {
							T || o({ type: 'ARROW_PREV', key: 'ArrowLeft' });
						},
						ArrowRight() {
							T || o({ type: 'ARROW_NEXT', key: 'ArrowRight' });
						},
						Home() {
							o({ type: 'HOME' });
						},
						End() {
							o({ type: 'END' });
						}
					};
					let h = le(a, { dir: n('dir'), orientation: n('orientation') });
					const p = u[h];
					if (p) {
						(a.preventDefault(), p(a));
						return;
					}
				}
			});
		},
		getTriggerState: l,
		getTriggerProps(a) {
			const { value: u, disabled: h } = a,
				p = l(a);
			return t.button({
				...U.trigger.attrs,
				role: 'tab',
				type: 'button',
				disabled: h,
				dir: n('dir'),
				'data-orientation': n('orientation'),
				'data-disabled': I(h),
				'aria-disabled': h,
				'data-value': u,
				'aria-selected': p.selected,
				'data-selected': I(p.selected),
				'data-focus': I(p.focused),
				'aria-controls': p.selected ? j(v, u) : void 0,
				'data-ownedby': D(v),
				'data-ssr': I(i.get('ssr')),
				id: A(v, u),
				tabIndex: p.selected && b ? 0 : -1,
				onFocus() {
					o({ type: 'TAB_FOCUS', value: u });
				},
				onBlur(d) {
					d.relatedTarget?.getAttribute('role') !== 'tab' && o({ type: 'TAB_BLUR' });
				},
				onClick(d) {
					d.defaultPrevented || oe(d) || h || (se() && d.currentTarget.focus(), o({ type: 'TAB_CLICK', value: u }));
				}
			});
		},
		getContentProps(a) {
			const { value: u } = a,
				h = i.get('value') === u;
			return t.element({
				...U.content.attrs,
				dir: n('dir'),
				id: j(v, u),
				tabIndex: b ? 0 : -1,
				'aria-labelledby': A(v, u),
				role: 'tabpanel',
				'data-ownedby': D(v),
				'data-selected': I(h),
				'data-orientation': n('orientation'),
				hidden: !h
			});
		},
		getIndicatorProps() {
			const a = i.get('indicatorRect'),
				u = a == null || (a.width === 0 && a.height === 0 && a.x === 0 && a.y === 0);
			return t.element({
				id: J(v),
				...U.indicator.attrs,
				dir: n('dir'),
				'data-orientation': n('orientation'),
				hidden: u,
				style: {
					'--transition-property': 'left, right, top, bottom, width, height',
					'--left': H(a?.x),
					'--top': H(a?.y),
					'--width': H(a?.width),
					'--height': H(a?.height),
					position: 'absolute',
					willChange: 'var(--transition-property)',
					transitionProperty: 'var(--transition-property)',
					transitionDuration: 'var(--transition-duration, 150ms)',
					transitionTimingFunction: 'var(--transition-timing-function)',
					[m ? 'left' : 'top']: m ? 'var(--left)' : 'var(--top)'
				}
			});
		}
	};
}
var { createMachine: we } = ue(),
	Ne = we({
		props({ props: e }) {
			return {
				dir: 'ltr',
				orientation: 'horizontal',
				activationMode: 'automatic',
				loopFocus: !0,
				composite: !0,
				navigate(t) {
					Te(t.node);
				},
				defaultValue: null,
				...e
			};
		},
		initialState() {
			return 'idle';
		},
		context({ prop: e, bindable: t }) {
			return {
				value: t(() => ({
					defaultValue: e('defaultValue'),
					value: e('value'),
					onChange(s) {
						e('onValueChange')?.({ value: s });
					}
				})),
				focusedValue: t(() => ({
					defaultValue: e('value') || e('defaultValue'),
					sync: !0,
					onChange(s) {
						e('onFocusChange')?.({ focusedValue: s });
					}
				})),
				ssr: t(() => ({ defaultValue: !0 })),
				indicatorRect: t(() => ({ defaultValue: null }))
			};
		},
		watch({ context: e, prop: t, track: s, action: o }) {
			(s([() => e.get('value')], () => {
				o(['syncIndicatorRect', 'syncTabIndex', 'navigateIfNeeded']);
			}),
				s([() => t('dir'), () => t('orientation')], () => {
					o(['syncIndicatorRect']);
				}));
		},
		on: {
			SET_VALUE: { actions: ['setValue'] },
			CLEAR_VALUE: { actions: ['clearValue'] },
			SET_INDICATOR_RECT: { actions: ['setIndicatorRect'] },
			SYNC_TAB_INDEX: { actions: ['syncTabIndex'] }
		},
		entry: ['syncIndicatorRect', 'syncTabIndex', 'syncSsr'],
		exit: ['cleanupObserver'],
		states: {
			idle: {
				on: {
					TAB_FOCUS: { target: 'focused', actions: ['setFocusedValue'] },
					TAB_CLICK: { target: 'focused', actions: ['setFocusedValue', 'setValue'] }
				}
			},
			focused: {
				on: {
					TAB_CLICK: { actions: ['setFocusedValue', 'setValue'] },
					ARROW_PREV: [{ guard: 'selectOnFocus', actions: ['focusPrevTab', 'selectFocusedTab'] }, { actions: ['focusPrevTab'] }],
					ARROW_NEXT: [{ guard: 'selectOnFocus', actions: ['focusNextTab', 'selectFocusedTab'] }, { actions: ['focusNextTab'] }],
					HOME: [{ guard: 'selectOnFocus', actions: ['focusFirstTab', 'selectFocusedTab'] }, { actions: ['focusFirstTab'] }],
					END: [{ guard: 'selectOnFocus', actions: ['focusLastTab', 'selectFocusedTab'] }, { actions: ['focusLastTab'] }],
					TAB_FOCUS: { actions: ['setFocusedValue'] },
					TAB_BLUR: { target: 'idle', actions: ['clearFocusedValue'] }
				}
			}
		},
		implementations: {
			guards: { selectOnFocus: ({ prop: e }) => e('activationMode') === 'automatic' },
			actions: {
				selectFocusedTab({ context: e, prop: t }) {
					O(() => {
						const s = e.get('focusedValue');
						if (!s) return;
						const i = t('deselectable') && e.get('value') === s ? null : s;
						e.set('value', i);
					});
				},
				setFocusedValue({ context: e, event: t, flush: s }) {
					t.value != null &&
						s(() => {
							e.set('focusedValue', t.value);
						});
				},
				clearFocusedValue({ context: e }) {
					e.set('focusedValue', null);
				},
				setValue({ context: e, event: t, prop: s }) {
					const o = s('deselectable') && e.get('value') === e.get('focusedValue');
					e.set('value', o ? null : t.value);
				},
				clearValue({ context: e }) {
					e.set('value', null);
				},
				focusFirstTab({ scope: e }) {
					O(() => {
						Ce(e)?.focus();
					});
				},
				focusLastTab({ scope: e }) {
					O(() => {
						Pe(e)?.focus();
					});
				},
				focusNextTab({ context: e, prop: t, scope: s, event: o }) {
					const i = o.value ?? e.get('focusedValue');
					if (!i) return;
					const n = Fe(s, { value: i, loopFocus: t('loopFocus') });
					O(() => {
						t('composite') ? n?.focus() : n?.dataset.value != null && e.set('focusedValue', n.dataset.value);
					});
				},
				focusPrevTab({ context: e, prop: t, scope: s, event: o }) {
					const i = o.value ?? e.get('focusedValue');
					if (!i) return;
					const n = Oe(s, { value: i, loopFocus: t('loopFocus') });
					O(() => {
						t('composite') ? n?.focus() : n?.dataset.value != null && e.set('focusedValue', n.dataset.value);
					});
				},
				syncTabIndex({ context: e, scope: t }) {
					O(() => {
						const s = e.get('value');
						if (!s) return;
						const o = Ae(t, s);
						if (!o) return;
						fe(o).length > 0 ? o.removeAttribute('tabindex') : o.setAttribute('tabindex', '0');
					});
				},
				cleanupObserver({ refs: e }) {
					const t = e.get('indicatorCleanup');
					t && t();
				},
				setIndicatorRect({ context: e, event: t, scope: s }) {
					const o = t.id ?? e.get('value');
					!G(s) || !o || !K(s, o) || e.set('indicatorRect', Le(s, o));
				},
				syncSsr({ context: e }) {
					e.set('ssr', !1);
				},
				syncIndicatorRect({ context: e, refs: t, scope: s }) {
					const o = t.get('indicatorCleanup');
					if ((o && o(), !G(s))) return;
					const n = () => {
						const f = K(s, e.get('value'));
						if (!f) return;
						const T = Q(f);
						e.set('indicatorRect', (m) => (_e(m, T) ? m : T));
					};
					n();
					const v = x(s),
						g = ve(...v.map((f) => ge.observe(f, n)));
					t.set('indicatorCleanup', g);
				},
				navigateIfNeeded({ context: e, prop: t, scope: s }) {
					const o = e.get('value');
					if (!o) return;
					const i = K(s, o);
					de(i) && t('navigate')?.({ value: o, node: i, href: i.href });
				}
			}
		}
	}),
	$e = z()([
		'activationMode',
		'composite',
		'deselectable',
		'dir',
		'getRootNode',
		'id',
		'ids',
		'loopFocus',
		'navigate',
		'onFocusChange',
		'onValueChange',
		'orientation',
		'translations',
		'value',
		'defaultValue'
	]),
	Se = Y($e),
	xe = z()(['disabled', 'value']),
	Ue = Y(xe),
	De = z()(['value']),
	ke = Y(De),
	We = w('<div><!></div>');
function Me(e, t) {
	C(t, !0);
	const s = $(t, ['$$slots', '$$events', '$$legacy']),
		o = F.consume(),
		i = c(() => ke(s)),
		n = c(() => q(r(i), 2)),
		v = c(() => r(n)[0]),
		g = c(() => r(n)[1]),
		f = c(() => r(g).element),
		T = c(() => r(g).children),
		m = c(() => B(r(g), ['element', 'children'])),
		b = c(() => S(o().getContentProps(r(v)), r(m)));
	var l = R(),
		a = E(l);
	{
		var u = (p) => {
				var d = R(),
					_ = E(d);
				(V(
					_,
					() => r(f),
					() => r(b)
				),
					y(p, d));
			},
			h = (p) => {
				var d = We();
				N(d, () => ({ ...r(b) }));
				var _ = k(d);
				(V(_, () => r(T) ?? W), M(d), y(p, d));
			};
		L(a, (p) => {
			r(f) ? p(u) : p(h, !1);
		});
	}
	(y(e, l), P());
}
var He = w('<div></div>');
function Ke(e, t) {
	C(t, !0);
	const s = $(t, ['$$slots', '$$events', '$$legacy']),
		o = F.consume(),
		i = c(() => t.element),
		n = c(() => B(s, ['element'])),
		v = c(() => S(o().getIndicatorProps(), r(n)));
	var g = R(),
		f = E(g);
	{
		var T = (b) => {
				var l = R(),
					a = E(l);
				(V(
					a,
					() => r(i),
					() => r(v)
				),
					y(b, l));
			},
			m = (b) => {
				var l = He();
				(N(l, () => ({ ...r(v) })), y(b, l));
			};
		L(f, (b) => {
			r(i) ? b(T) : b(m, !1);
		});
	}
	(y(e, g), P());
}
var Xe = w('<div><!></div>');
function je(e, t) {
	C(t, !0);
	const s = $(t, ['$$slots', '$$events', '$$legacy']),
		o = F.consume(),
		i = c(() => t.element),
		n = c(() => t.children),
		v = c(() => B(s, ['element', 'children'])),
		g = c(() => S(o().getListProps(), r(v)));
	var f = R(),
		T = E(f);
	{
		var m = (l) => {
				var a = R(),
					u = E(a);
				(V(
					u,
					() => r(i),
					() => r(g)
				),
					y(l, a));
			},
			b = (l) => {
				var a = Xe();
				N(a, () => ({ ...r(g) }));
				var u = k(a);
				(V(u, () => r(n) ?? W), M(a), y(l, a));
			};
		L(T, (l) => {
			r(i) ? l(m) : l(b, !1);
		});
	}
	(y(e, f), P());
}
function qe(e, t) {
	C(t, !0);
	const s = F.consume(),
		o = c(() => t.children);
	var i = R(),
		n = E(i);
	(V(
		n,
		() => r(o),
		() => s
	),
		y(e, i),
		P());
}
var ze = w('<div><!></div>');
function Ye(e, t) {
	C(t, !0);
	const s = $(t, ['$$slots', '$$events', '$$legacy']),
		o = c(() => t.element),
		i = c(() => t.children),
		n = c(() => t.value),
		v = c(() => B(s, ['element', 'children', 'value'])),
		g = c(() => S(r(n)().getRootProps(), r(v)));
	F.provide(() => r(n)());
	var f = R(),
		T = E(f);
	{
		var m = (l) => {
				var a = R(),
					u = E(a);
				(V(
					u,
					() => r(o),
					() => r(g)
				),
					y(l, a));
			},
			b = (l) => {
				var a = ze();
				N(a, () => ({ ...r(g) }));
				var u = k(a);
				(V(u, () => r(i) ?? W), M(a), y(l, a));
			};
		L(T, (l) => {
			r(o) ? l(m) : l(b, !1);
		});
	}
	(y(e, f), P());
}
function Ge(e) {
	const t = te(Ne, e),
		s = c(() => Be(t, ae));
	return () => r(s);
}
var Je = w('<div><!></div>');
function Qe(e, t) {
	const s = Z();
	C(t, !0);
	const o = $(t, ['$$slots', '$$events', '$$legacy']),
		i = c(() => Se(o)),
		n = c(() => q(r(i), 2)),
		v = c(() => r(n)[0]),
		g = c(() => r(n)[1]),
		f = c(() => r(g).element),
		T = c(() => r(g).children),
		m = c(() => B(r(g), ['element', 'children'])),
		b = Ge(() => ({ ...r(v), id: s })),
		l = c(() => S(b().getRootProps(), r(m)));
	F.provide(() => b());
	var a = R(),
		u = E(a);
	{
		var h = (d) => {
				var _ = R(),
					X = E(_);
				(V(
					X,
					() => r(f),
					() => r(l)
				),
					y(d, _));
			},
			p = (d) => {
				var _ = Je();
				N(_, () => ({ ...r(l) }));
				var X = k(_);
				(V(X, () => r(T) ?? W), M(_), y(d, _));
			};
		L(u, (d) => {
			r(f) ? d(h) : d(p, !1);
		});
	}
	(y(e, a), P());
}
var Ze = w('<button><!></button>');
function et(e, t) {
	C(t, !0);
	const s = $(t, ['$$slots', '$$events', '$$legacy']),
		o = F.consume(),
		i = c(() => Ue(s)),
		n = c(() => q(r(i), 2)),
		v = c(() => r(n)[0]),
		g = c(() => r(n)[1]),
		f = c(() => r(g).element),
		T = c(() => r(g).children),
		m = c(() => B(r(g), ['element', 'children'])),
		b = c(() => S(o().getTriggerProps(r(v)), r(m)));
	var l = R(),
		a = E(l);
	{
		var u = (p) => {
				var d = R(),
					_ = E(d);
				(V(
					_,
					() => r(f),
					() => r(b)
				),
					y(p, d));
			},
			h = (p) => {
				var d = Ze();
				N(d, () => ({ ...r(b) }));
				var _ = k(d);
				(V(_, () => r(T) ?? W), M(d), y(p, d));
			};
		L(a, (p) => {
			r(f) ? p(u) : p(h, !1);
		});
	}
	(y(e, l), P());
}
const lt = Object.assign(Qe, { Provider: Ye, Context: qe, List: je, Trigger: et, Indicator: Ke, Content: Me });
export { lt as T };
//# sourceMappingURL=BpC4PXBd.js.map
