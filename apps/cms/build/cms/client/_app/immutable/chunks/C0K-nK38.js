import { i as y } from './zi73tRJP.js';
import { a as Z } from './CMZtchEj.js';
import { p as $, z as ee, g as a, u as s, c as m, s as E, r as c, d as G, t as N, a as ae, b as S } from './DrlZFkx8.js';
import { f as x, e as te, a as b, s as I, d as re } from './CTjXDULS.js';
import { a as ie } from './BEiD40NV.js';
import { r as le, h as ne, a as d, c as de } from './MEFvoR_D.js';
import { p as ue } from './DePHBZW_.js';
import { p as fe } from './C9E6SjbS.js';
import { a as O, v as g } from './C-hhfhAN.js';
import { g as oe } from './D3eWcrZU.js';
import { t as se } from './CE8QOwyb.js';
import { p as me, b as ce, c as ve, a as be, n as U, o as ge } from './Bg__saH3.js';
var xe = x('<button class="px-2!" type="button"> </button>'),
	_e = x('<button class="px-2!" type="button"> </button>'),
	he = x(
		'<div class="flex items-center px-2" aria-label="Validating"><div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div></div>'
	),
	pe = x('<p class="absolute -bottom-4 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite"> </p>'),
	ye = x(
		'<div class="input-container relative mb-4"><div class="preset-filled-surface-500 btn-group flex w-full rounded" role="group"><!> <div class="relative w-full flex-1"><input type="number" data-testid="number-input"/></div> <!> <!></div> <!></div>'
	);
function Ae(z, e) {
	$(e, !0);
	let n = ue(e, 'value', 15);
	const f = s(() => oe(e.field)),
		_ = s(() => (e.field.translated ? O.contentLanguage : (fe.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase())),
		L = s(() => O.contentLanguage);
	ee(() => {
		n() || n({ [a(_)]: null });
	});
	const h = s(() => n()?.[a(_)]),
		u = s(() => g.getError(a(f)));
	let v,
		k = G(!1),
		o = G(!1);
	const B = s(() => {
		const t = [];
		(typeof e.field.min == 'number' && t.push(ce(e.field.min, `Value must be at least ${e.field.min}`)),
			typeof e.field.max == 'number' && t.push(ve(e.field.max, `Value must not exceed ${e.field.max}`)));
		const r = t.length > 0 ? be(U('Value must be a number'), ...t) : U('Value must be a number');
		return e.field.required ? r : ge(r);
	});
	function M(t) {
		return new Intl.NumberFormat(t).format(1.1).substring(1, 2);
	}
	function R(t) {
		const r = t.target,
			i = r.value;
		if (!i || i === '') {
			(n() || n({}), n({ ...n(), [a(_)]: null }), V(!1));
			return;
		}
		const p = M(a(L));
		if (i[i.length - 1] === p) return;
		const D = i.replace(new RegExp(`[^0-9${p}-]`, 'g'), '').replace(p, '.'),
			F = parseFloat(D);
		(isNaN(F) ||
			(n() || n({}),
			n({ ...n(), [a(_)]: F }),
			(r.value = new Intl.NumberFormat(a(L), { maximumFractionDigits: typeof e.field.step == 'number' && e.field.step < 1 ? 2 : 0 }).format(F))),
			V(!1));
	}
	function j() {
		(S(k, !0), V(!0));
	}
	function V(t = !1) {
		v && clearTimeout(v);
		const r = () => {
			try {
				S(o, !0);
				const i = a(h);
				if (e.field?.required && i == null) {
					g.setError(a(f), 'This field is required');
					return;
				}
				if (!e.field?.required && i == null) {
					g.clearError(a(f));
					return;
				}
				(me(a(B), i), g.clearError(a(f)));
			} catch (i) {
				if (i.issues) {
					const D = i.issues[0]?.message || 'Invalid input';
					g.setError(a(f), D);
				}
			} finally {
				S(o, !1);
			}
		};
		t ? r() : (v = window.setTimeout(r, 300));
	}
	Z(() => {
		v && clearTimeout(v);
	});
	var H = { WidgetData: async () => n() },
		w = ye(),
		T = m(w),
		W = m(T);
	{
		var J = (t) => {
			var r = xe(),
				i = m(r, !0);
			(c(r),
				N(() => {
					(d(r, 'aria-label', `${e.field.prefix} prefix`), I(i, e.field?.prefix));
				}),
				b(t, r));
		};
		y(W, (t) => {
			e.field?.prefix && t(J);
		});
	}
	var q = E(W, 2),
		l = m(q);
	(le(l), (l.__input = R));
	let A;
	(ie(
		l,
		(t, r) => se?.(t, r),
		() => ({ name: e.field.db_fieldName, label: e.field.label, collection: e.field.collection })
	),
		c(q));
	var C = E(q, 2);
	{
		var K = (t) => {
			var r = _e(),
				i = m(r, !0);
			(c(r),
				N(() => {
					(d(r, 'aria-label', `${e.field.suffix} suffix`), I(i, e.field?.suffix));
				}),
				b(t, r));
		};
		y(C, (t) => {
			e.field?.suffix && t(K);
		});
	}
	var P = E(C, 2);
	{
		var Q = (t) => {
			var r = he();
			b(t, r);
		};
		y(P, (t) => {
			a(o) && t(Q);
		});
	}
	c(T);
	var X = E(T, 2);
	{
		var Y = (t) => {
			var r = pe(),
				i = m(r, !0);
			(c(r),
				N(() => {
					(d(r, 'id', `${a(f)}-error`), I(i, a(u)));
				}),
				b(t, r));
		};
		y(X, (t) => {
			a(u) && a(k) && t(Y);
		});
	}
	return (
		c(w),
		N(
			(t) => {
				(ne(l, a(h) !== null && a(h) !== void 0 ? a(h) : ''),
					d(l, 'name', e.field?.db_fieldName),
					d(l, 'id', e.field?.db_fieldName),
					d(l, 'placeholder', t),
					(l.required = e.field?.required),
					(l.readOnly = e.field?.readonly),
					(l.disabled = e.field?.disabled),
					d(l, 'min', e.field?.min),
					d(l, 'max', e.field?.max),
					d(l, 'step', e.field?.step || 1),
					(A = de(l, 1, 'input w-full rounded-none text-black dark:text-primary-500', null, A, {
						'!border-error-500': !!a(u),
						'!ring-1': !!a(u) || a(o),
						'!ring-error-500': !!a(u),
						'!border-primary-500': a(o) && !a(u),
						'!ring-primary-500': a(o) && !a(u)
					})),
					d(l, 'aria-invalid', !!a(u)),
					d(l, 'aria-describedby', a(u) ? `${a(f)}-error` : void 0),
					d(l, 'aria-required', e.field?.required));
			},
			[() => (typeof e.field?.placeholder == 'string' && e.field.placeholder !== '' ? e.field.placeholder : String(e.field?.db_fieldName ?? ''))]
		),
		te('blur', l, j),
		b(z, w),
		ae(H)
	);
}
re(['input']);
export { Ae as default };
//# sourceMappingURL=C0K-nK38.js.map
