import { i as C } from './zi73tRJP.js';
import { p as E, z as F, c as t, r as l, s as u, t as _, a as I, g as T, u as j } from './DrlZFkx8.js';
import { f as h, s as m, a as g, d as A } from './CTjXDULS.js';
import { r as B, a as d, g as D, c as G, s as H } from './MEFvoR_D.js';
import { p as J } from './DePHBZW_.js';
import { v as K } from './C-hhfhAN.js';
import { g as L } from './D3eWcrZU.js';
var M = h('<div class="mt-2 text-xs text-gray-500"> </div>'),
	O = h(
		'<div class="mb-4"><fieldset class="rounded border border-surface-500 p-2 dark:border-surface-400"><legend class="mx-auto block w-fit px-2 text-center text-sm font-normal text-surface-700 dark:text-surface-300" style="background:none;border:none;"> </legend> <div class="flex flex-col gap-y-2"><label class="flex cursor-pointer items-center gap-2 text-base text-surface-800 dark:text-surface-200"><input type="checkbox"/> <span> </span></label></div> <!></fieldset></div>'
	);
function Y(x, e) {
	E(e, !0);
	let i = J(e, 'value', 15);
	F(() => {
		(i() === void 0 || i() === null) && i(!1);
	});
	const k = j(() => L(e.field));
	function y(f) {
		const r = f.currentTarget.checked;
		(i(r), K.clearError(T(k)));
	}
	var c = O(),
		s = t(c),
		n = t(s),
		N = t(n, !0);
	l(n);
	var o = u(n, 2),
		v = t(o),
		a = t(v);
	(B(a), (a.__change = y));
	var b = u(a, 2),
		w = t(b, !0);
	(l(b), l(v), l(o));
	var z = u(o, 2);
	{
		var q = (f) => {
			var r = M(),
				S = t(r, !0);
			(l(r),
				_(() => {
					(d(r, 'id', `${e.field.db_fieldName}-helper`), m(S, e.field.helper));
				}),
				g(f, r));
		};
		C(z, (f) => {
			e.field.helper && f(q);
		});
	}
	(l(s),
		l(c),
		_(() => {
			(d(s, 'id', e.field.db_fieldName),
				d(s, 'aria-describedby', e.field.helper ? `${e.field.db_fieldName}-helper` : void 0),
				m(N, e.field.legend || 'Select one option'),
				d(a, 'name', e.field.db_fieldName),
				(a.required = e.field.required),
				D(a, !!i()),
				G(
					a,
					1,
					`h-5 w-5 cursor-pointer rounded border-gray-300 transition-colors duration-200 focus:ring-2 focus:ring-offset-2 ${e.field.color ? `accent-${e.field.color}` : ''} ${e.field.size === 'sm' ? 'h-4 w-4' : e.field.size === 'lg' ? 'h-6 w-6' : ''}`
				),
				d(a, 'aria-label', e.field.label),
				d(a, 'aria-describedby', e.field.helper ? `${e.field.db_fieldName}-helper` : void 0),
				H(a, e.field.color ? `accent-color: ${e.field.color}` : ''),
				m(w, e.field.label));
		}),
		g(x, c),
		I());
}
A(['change']);
export { Y as default };
//# sourceMappingURL=CvJFNe6g.js.map
