import { i as N } from './zi73tRJP.js';
import { p as U, z as j, g as n, u as F, d as A, b as c, c as u, s as h, h as D, r as o, t as s, a as G } from './DrlZFkx8.js';
import { f as v, e as H, a as m, s as p, d as J } from './CTjXDULS.js';
import { a as K } from './BEiD40NV.js';
import { r as M, a as i, c as Q } from './MEFvoR_D.js';
import { b as W } from './D4QnGYgQ.js';
import { p as X } from './DePHBZW_.js';
import { a as Y } from './C-hhfhAN.js';
import { t as Z } from './CE8QOwyb.js';
var $ = v('<button class="px-2!" type="button"> </button>'),
	ee = v('<button class="px-2!" type="button"> </button>'),
	te = v('<p class="absolute bottom-0 left-0 w-full text-center text-xs text-error-500" role="alert" aria-live="polite"> </p>'),
	re = v(
		'<div class="input-container relative mb-4"><div class="preset-filled-surface-500 btn-group flex w-full rounded" role="group"><!> <div class="relative w-full flex-1"><input type="text" data-testid="currency-input"/></div> <!></div> <!></div>'
	);
function se(T, e) {
	U(e, !0);
	let d = X(e, 'value', 7);
	const b = F(() => Y.systemLanguage),
		w = F(() => new Intl.NumberFormat(n(b), { style: 'currency', currency: e.field.currencyCode || 'EUR' }));
	let f = A('');
	j(() => {
		const t = k(n(f), n(b));
		typeof d() == 'number' && d() !== t ? c(f, n(w).format(d()), !0) : (d() === null || d() === void 0) && c(f, '');
	});
	function V(t) {
		const r = t.currentTarget.value,
			l = k(r, n(b));
		d(isNaN(l) ? null : l);
	}
	function z() {
		typeof d() == 'number' && c(f, n(w).format(d()), !0);
	}
	function k(t, r) {
		const l = new Intl.NumberFormat(r).formatToParts(1234.5),
			C = l.find((y) => y.type === 'group')?.value || ',',
			O = l.find((y) => y.type === 'decimal')?.value || '.',
			P = t.replace(new RegExp(`\\${C}`, 'g'), '').replace(O, '.');
		return parseFloat(P.replace(/[^\d.-]/g, ''));
	}
	var _ = re(),
		x = u(_),
		q = u(x);
	{
		var E = (t) => {
			var r = $(),
				l = u(r, !0);
			(o(r),
				s(() => {
					(i(r, 'aria-label', `${e.field.prefix} prefix`), p(l, e.field?.prefix));
				}),
				m(t, r));
		};
		N(q, (t) => {
			e.field?.prefix && t(E);
		});
	}
	var g = h(q, 2),
		a = u(g);
	(M(a), (a.__input = V));
	let I;
	(D(() =>
		W(
			a,
			() => n(f),
			(t) => c(f, t)
		)
	),
		K(
			a,
			(t, r) => Z?.(t, r),
			() => ({ name: e.field.db_fieldName, label: e.field.label, collection: e.field.collection })
		),
		o(g));
	var L = h(g, 2);
	{
		var R = (t) => {
			var r = ee(),
				l = u(r, !0);
			(o(r),
				s(() => {
					(i(r, 'aria-label', `${e.field.suffix} suffix`), p(l, e.field?.suffix));
				}),
				m(t, r));
		};
		N(L, (t) => {
			e.field?.suffix && t(R);
		});
	}
	o(x);
	var S = h(x, 2);
	{
		var B = (t) => {
			var r = te(),
				l = u(r, !0);
			(o(r),
				s(() => {
					(i(r, 'id', `${e.field.db_fieldName}-error`), p(l, e.error));
				}),
				m(t, r));
		};
		N(S, (t) => {
			e.error && t(B);
		});
	}
	(o(_),
		s(
			(t) => {
				(i(a, 'name', e.field?.db_fieldName),
					i(a, 'id', e.field?.db_fieldName),
					i(a, 'placeholder', t),
					(a.required = e.field?.required),
					(a.readOnly = e.field?.readonly),
					(a.disabled = e.field?.disabled),
					(I = Q(a, 1, 'input w-full rounded-none text-black dark:text-primary-500', null, I, {
						'!border-error-500': !!e.error,
						'!ring-1': !!e.error,
						'!ring-error-500': !!e.error
					})),
					i(a, 'aria-invalid', !!e.error),
					i(a, 'aria-describedby', e.error ? `${e.field.db_fieldName}-error` : void 0),
					i(a, 'aria-required', e.field?.required));
			},
			[() => (typeof e.field?.placeholder == 'string' && e.field.placeholder !== '' ? e.field.placeholder : String(e.field?.db_fieldName ?? ''))]
		),
		H('blur', a, z),
		m(T, _),
		G());
}
J(['input']);
export { se as default };
//# sourceMappingURL=DndfrNu8.js.map
