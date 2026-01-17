import { i as g } from './zi73tRJP.js';
import { p as z, c as m, s as v, r as s, t as h, g as i, u as c, a as A } from './DrlZFkx8.js';
import { f as b, s as q, e as C, a as _, d as G } from './CTjXDULS.js';
import { a as H } from './BEiD40NV.js';
import { r as J, a as l, h as K, c as M } from './MEFvoR_D.js';
import { p as P } from './DePHBZW_.js';
import { g as Q } from './D3eWcrZU.js';
import { v as f } from './C-hhfhAN.js';
import { t as R } from './CE8QOwyb.js';
var U = b('<span>(required)</span>'),
	W = b('<p class="text-xs text-gray-600 dark:text-gray-400"> </p>'),
	X = b('<p class="text-xs text-error-500" role="alert" aria-live="polite"> </p>'),
	Y = b(
		'<div class="relative space-y-1"><label class="sr-only svelte-jb5xv8"> <!></label> <div class="relative w-full"><input type="date" data-testid="date-input"/></div> <!> <!></div>'
	);
function de(w, e) {
	z(e, !0);
	let u = P(e, 'value', 15);
	const n = c(() => Q(e.field)),
		E = c(() => {
			if (!u()) return '';
			try {
				return u().substring(0, 10);
			} catch {
				return '';
			}
		}),
		I = c(() => {
			if (e.field.minDate)
				try {
					return new Date(e.field.minDate).toISOString().substring(0, 10);
				} catch {
					return;
				}
		}),
		T = c(() => {
			if (e.field.maxDate)
				try {
					return new Date(e.field.maxDate).toISOString().substring(0, 10);
				} catch {
					return;
				}
		});
	function k(a) {
		const t = a.currentTarget.value;
		if (t)
			try {
				const d = new Date(t);
				if (e.field.minDate && d < new Date(e.field.minDate)) {
					f.setError(i(n), `Date must be on or after ${new Date(e.field.minDate).toLocaleDateString()}`);
					return;
				}
				if (e.field.maxDate && d > new Date(e.field.maxDate)) {
					f.setError(i(n), `Date must be on or before ${new Date(e.field.maxDate).toLocaleDateString()}`);
					return;
				}
				(u(d.toISOString()), f.clearError(i(n)));
			} catch {
				f.setError(i(n), 'Invalid date format');
			}
		else (u(null), e.field.required ? f.setError(i(n), 'This field is required') : f.clearError(i(n)));
	}
	function O() {
		!u() && e.field.required && f.setError(i(n), 'This field is required');
	}
	var D = Y(),
		o = m(D),
		y = m(o),
		L = v(y);
	{
		var j = (a) => {
			var t = U();
			_(a, t);
		};
		g(L, (a) => {
			e.field.required && a(j);
		});
	}
	s(o);
	var x = v(o, 2),
		r = m(x);
	(J(r), (r.__input = k));
	let N;
	(H(
		r,
		(a, t) => R?.(a, t),
		() => ({ name: e.field.db_fieldName, label: e.field.label, collection: e.field.collection })
	),
		s(x));
	var S = v(x, 2);
	{
		var B = (a) => {
			var t = W(),
				d = m(t, !0);
			(s(t),
				h(() => {
					(l(t, 'id', `${e.field.db_fieldName}-helper`), q(d, e.field.helper));
				}),
				_(a, t));
		};
		g(S, (a) => {
			e.field.helper && !e.error && a(B);
		});
	}
	var F = v(S, 2);
	{
		var V = (a) => {
			var t = X(),
				d = m(t, !0);
			(s(t),
				h(() => {
					(l(t, 'id', `${e.field.db_fieldName}-error`), q(d, e.error));
				}),
				_(a, t));
		};
		g(F, (a) => {
			e.error && a(V);
		});
	}
	(s(D),
		h(() => {
			(l(o, 'for', e.field.db_fieldName),
				q(y, `${e.field.label ?? ''} `),
				l(r, 'id', e.field.db_fieldName),
				l(r, 'name', e.field.db_fieldName),
				(r.required = e.field.required),
				K(r, i(E)),
				l(r, 'min', i(I)),
				l(r, 'max', i(T)),
				(N = M(r, 1, 'input', null, N, { invalid: e.error })),
				l(r, 'aria-invalid', !!e.error),
				l(r, 'aria-describedby', e.error ? `${e.field.db_fieldName}-error` : e.field.helper ? `${e.field.db_fieldName}-helper` : void 0),
				l(r, 'aria-required', e.field.required));
		}),
		C('blur', r, O),
		_(w, D),
		A());
}
G(['input']);
export { de as default };
//# sourceMappingURL=BC9iKKM3.js.map
