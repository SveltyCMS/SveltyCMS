import { i as g } from './zi73tRJP.js';
import { o as $, a as ee } from './CMZtchEj.js';
import { p as ae, z as te, g as a, u as v, c as f, s as p, r as u, d as k, t as x, a as re, b as q } from './DrlZFkx8.js';
import { f as _, e as A, a as b, s as w, d as ie } from './CTjXDULS.js';
import { r as le, h as de, a as n, c as ne } from './MEFvoR_D.js';
import { p as se } from './DePHBZW_.js';
import { p as oe } from './C9E6SjbS.js';
import { a as fe, v as h } from './C-hhfhAN.js';
import { a as ue } from './-PV6rnhC.js';
import { a as C } from './CY0QKx3Q.js';
import { g as ce } from './D3eWcrZU.js';
import { p as me, a as S, o as ve, e as B, m as be, s as G } from './Bg__saH3.js';
var _e = _('<button class="px-2!" type="button"> </button>'),
	ge = _('<button class="px-2!" type="button"> </button>'),
	pe = _(
		'<div class="absolute right-2 top-1/2 -translate-y-1/2" aria-label="Validating"><div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div></div>'
	),
	xe = _('<p class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite"> </p>'),
	he = _(
		'<div class="input-container relative mb-4"><div class="preset-filled-surface-500 btn-group flex w-full rounded" role="group"><!> <div class="relative w-full flex-1"><input type="email" data-testid="email-input"/></div> <!> <!> <!></div></div>'
	);
function Ce(M, e) {
	ae(e, !0);
	let s = se(e, 'value', 15);
	const c = v(() => ce(e.field)),
		y = v(() => (e.field.translated ? fe.contentLanguage : (oe.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase()));
	te(() => {
		s() || s({ [a(y)]: '' });
	});
	const E = v(() => s()?.[a(y)] ?? ''),
		d = v(() => h.getError(a(c)));
	let m,
		F = k(!1),
		o = k(!1);
	const O = v(() =>
		e.field?.required
			? S(G(), be(1, 'This field is required'), B('Please enter a valid email address'))
			: ve(S(G(), B('Please enter a valid email address')), '')
	);
	function P(t = !1) {
		m && clearTimeout(m);
		const r = () => {
			try {
				q(o, !0);
				const i = a(E);
				if (e.field?.required && (!i || i.trim() === '')) {
					h.setError(a(c), 'This field is required');
					return;
				}
				(i && i.trim() !== '' && me(a(O), i), h.clearError(a(c)));
			} catch (i) {
				if (i.issues) {
					const Z = i.issues[0]?.message || 'Invalid input';
					h.setError(a(c), Z);
				}
			} finally {
				q(o, !1);
			}
		};
		t ? r() : (m = window.setTimeout(r, 300));
	}
	function U(t) {
		return t.replace(/[\u200B-\u200D\uFEFF]/g, '').normalize('NFKC');
	}
	function W(t) {
		const r = t.currentTarget;
		s() || s({});
		const i = U(r.value);
		s({ ...s(), [a(y)]: i });
	}
	function K() {
		(q(F, !0), P(!0));
	}
	function j(t) {
		C.current && C.set({ element: t.currentTarget, field: { name: e.field.db_fieldName, label: e.field.label, collection: ue.value?.name } });
	}
	($(() => {
		e.field?.required && a(E);
	}),
		ee(() => {
			m && clearTimeout(m);
		}));
	var H = { WidgetData: async () => s() },
		T = he(),
		z = f(T),
		I = f(z);
	{
		var J = (t) => {
			var r = _e(),
				i = f(r, !0);
			(u(r),
				x(() => {
					(n(r, 'aria-label', `${e.field.prefix} prefix`), w(i, e.field?.prefix));
				}),
				b(t, r));
		};
		g(I, (t) => {
			e.field?.prefix && t(J);
		});
	}
	var N = p(I, 2),
		l = f(N);
	(le(l), (l.__input = W));
	let D;
	u(N);
	var L = p(N, 2);
	{
		var Q = (t) => {
			var r = ge(),
				i = f(r, !0);
			(u(r),
				x(() => {
					(n(r, 'aria-label', `${e.field.suffix} suffix`), w(i, e.field?.suffix));
				}),
				b(t, r));
		};
		g(L, (t) => {
			e.field?.suffix && t(Q);
		});
	}
	var V = p(L, 2);
	{
		var R = (t) => {
			var r = pe();
			b(t, r);
		};
		g(V, (t) => {
			a(o) && t(R);
		});
	}
	var X = p(V, 2);
	{
		var Y = (t) => {
			var r = xe(),
				i = f(r, !0);
			(u(r),
				x(() => {
					(n(r, 'id', `${e.field.db_fieldName}-error`), w(i, a(d)));
				}),
				b(t, r));
		};
		g(X, (t) => {
			a(d) && a(F) && t(Y);
		});
	}
	return (
		u(z),
		u(T),
		x(
			(t) => {
				(de(l, a(E) || ''),
					n(l, 'name', e.field?.db_fieldName),
					n(l, 'id', e.field?.db_fieldName),
					n(l, 'placeholder', t),
					(l.required = e.field?.required),
					(l.readOnly = e.field?.readonly),
					(l.disabled = e.field?.disabled),
					(D = ne(l, 1, 'input w-full rounded-none text-black dark:text-primary-500', null, D, {
						'!border-error-500': !!a(d),
						'!ring-1': !!a(d) || a(o),
						'!ring-error-500': !!a(d),
						'!border-primary-500': a(o) && !a(d),
						'!ring-primary-500': a(o) && !a(d)
					})),
					n(l, 'aria-invalid', !!a(d)),
					n(l, 'aria-describedby', a(d) ? `${a(c)}-error` : void 0),
					n(l, 'aria-required', e.field?.required));
			},
			[() => (typeof e.field?.placeholder == 'string' && e.field.placeholder !== '' ? e.field.placeholder : String(e.field?.db_fieldName ?? ''))]
		),
		A('blur', l, K),
		A('focus', l, j),
		b(M, T),
		re(H)
	);
}
ie(['input']);
export { Ce as default };
//# sourceMappingURL=gS2IAbZg.js.map
