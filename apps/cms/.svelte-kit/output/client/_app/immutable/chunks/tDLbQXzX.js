import { i as _ } from './zi73tRJP.js';
import { o as Y, a as Z } from './CMZtchEj.js';
import { p as $, z as ee, g as a, u as f, c as u, s as x, r as v, d as z, t as p, a as ae, b as w } from './DrlZFkx8.js';
import { f as g, e as te, a as b, s as I, d as re } from './CTjXDULS.js';
import { a as ie } from './BEiD40NV.js';
import { r as le, h as de, a as n, c as ne } from './MEFvoR_D.js';
import { p as oe } from './DePHBZW_.js';
import { p as se } from './C9E6SjbS.js';
import { a as fe, v as h } from './C-hhfhAN.js';
import { g as ue } from './D3eWcrZU.js';
import { t as ve } from './CE8QOwyb.js';
import { p as me, a as A, o as ce, r as S, m as be, s as C } from './Bg__saH3.js';
var ge = g('<button class="px-2!" type="button"> </button>'),
	_e = g('<button class="px-2!" type="button"> </button>'),
	xe = g(
		'<div class="flex items-center px-2" aria-label="Validating"><div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent svelte-189v5sz"></div></div>'
	),
	pe = g('<p class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite"> </p>'),
	he = g(
		'<div class="input-container relative mb-4 svelte-189v5sz"><div class="preset-filled-surface-500 btn-group flex w-full rounded" role="group"><!> <div class="relative w-full flex-1"><input type="tel" data-testid="phone-input"/></div> <!> <!></div> <!></div>'
	);
function Se(F, e) {
	$(e, !0);
	let o = oe(e, 'value', 15);
	const m = f(() => ue(e.field)),
		y = f(() => (e.field.translated ? fe.contentLanguage : (se.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase()));
	ee(() => {
		o() || o({ [a(y)]: '' });
	});
	const E = f(() => o()?.[a(y)] ?? ''),
		d = f(() => h.getError(a(m)));
	let c,
		L = z(!1),
		s = z(!1);
	const G = /^\+?[1-9]\d{1,14}$/,
		V = f(() => (typeof e.field.pattern == 'string' && e.field.pattern.trim() !== '' ? new RegExp(e.field.pattern) : G)),
		M = f(() =>
			e.field?.required
				? A(C(), be(1, 'This field is required'), S(a(V), 'Invalid phone number format. Please use international format (e.g., +1234567890)'))
				: ce(A(C(), S(a(V), 'Invalid phone number format. Please use international format (e.g., +1234567890)')), '')
		);
	function O(t = !1) {
		c && clearTimeout(c);
		const r = () => {
			try {
				w(s, !0);
				const l = a(E);
				if (e.field?.required && (!l || l.trim() === '')) {
					h.setError(a(m), 'This field is required');
					return;
				}
				(l && l.trim() !== '' && me(a(M), l), h.clearError(a(m)));
			} catch (l) {
				if (l.issues) {
					const X = l.issues[0]?.message || 'Invalid input';
					h.setError(a(m), X);
				}
			} finally {
				w(s, !1);
			}
		};
		t ? r() : (c = window.setTimeout(r, 300));
	}
	function U(t) {
		const r = t.currentTarget;
		(o() || o({}), o({ ...o(), [a(y)]: r.value }));
	}
	function W() {
		(w(L, !0), O(!0));
	}
	(Y(() => {
		e.field?.required && a(E);
	}),
		Z(() => {
			c && clearTimeout(c);
		}));
	var B = { WidgetData: async () => o() },
		T = he(),
		N = u(T),
		k = u(N);
	{
		var R = (t) => {
			var r = ge(),
				l = u(r, !0);
			(v(r),
				p(() => {
					(n(r, 'aria-label', `${e.field.prefix} prefix`), I(l, e.field?.prefix));
				}),
				b(t, r));
		};
		_(k, (t) => {
			e.field?.prefix && t(R);
		});
	}
	var q = x(k, 2),
		i = u(q);
	(le(i), (i.__input = U));
	let D;
	(ie(
		i,
		(t, r) => ve?.(t, r),
		() => ({ name: e.field.db_fieldName, label: e.field.label, collection: e.field.collection })
	),
		v(q));
	var P = x(q, 2);
	{
		var j = (t) => {
			var r = _e(),
				l = u(r, !0);
			(v(r),
				p(() => {
					(n(r, 'aria-label', `${e.field.suffix} suffix`), I(l, e.field?.suffix));
				}),
				b(t, r));
		};
		_(P, (t) => {
			e.field?.suffix && t(j);
		});
	}
	var H = x(P, 2);
	{
		var J = (t) => {
			var r = xe();
			b(t, r);
		};
		_(H, (t) => {
			a(s) && t(J);
		});
	}
	v(N);
	var K = x(N, 2);
	{
		var Q = (t) => {
			var r = pe(),
				l = u(r, !0);
			(v(r),
				p(() => {
					(n(r, 'id', `${e.field.db_fieldName}-error`), I(l, a(d)));
				}),
				b(t, r));
		};
		_(K, (t) => {
			a(d) && a(L) && t(Q);
		});
	}
	return (
		v(T),
		p(
			(t) => {
				(de(i, a(E) || ''),
					n(i, 'name', e.field?.db_fieldName),
					n(i, 'id', e.field?.db_fieldName),
					n(i, 'placeholder', t),
					(i.required = e.field?.required),
					(i.readOnly = e.field?.readonly),
					(i.disabled = e.field?.disabled),
					(D = ne(i, 1, 'input w-full rounded-none text-black dark:text-primary-500', null, D, {
						'!border-error-500': !!a(d),
						'!ring-1': !!a(d) || a(s),
						'!ring-error-500': !!a(d),
						'!border-primary-500': a(s) && !a(d),
						'!ring-primary-500': a(s) && !a(d)
					})),
					n(i, 'aria-invalid', !!a(d)),
					n(i, 'aria-describedby', a(d) ? `${a(m)}-error` : void 0),
					n(i, 'aria-required', e.field?.required));
			},
			[() => (typeof e.field?.placeholder == 'string' && e.field.placeholder !== '' ? e.field.placeholder : String(e.field?.db_fieldName ?? ''))]
		),
		te('blur', i, W),
		b(F, T),
		ae(B)
	);
}
re(['input']);
export { Se as default };
//# sourceMappingURL=tDLbQXzX.js.map
