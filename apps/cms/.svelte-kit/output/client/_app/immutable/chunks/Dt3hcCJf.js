import { i as q } from './zi73tRJP.js';
import { p as z, c as d, r as s, s as m, t as b, g as t, u as A, a as B } from './DrlZFkx8.js';
import { f as g, s as x, a as _ } from './CTjXDULS.js';
import { e as C } from './BXe5mj2j.js';
import { r as D, a as i, c as E, d as F, s as G } from './MEFvoR_D.js';
import { a as H } from './D4QnGYgQ.js';
import { p as J } from './DePHBZW_.js';
var K = g(
		'<label class="flex cursor-pointer items-center gap-2 text-base text-surface-800 dark:text-surface-200"><input type="radio"/> <span> </span></label>'
	),
	L = g('<p class="mt-2 text-center text-xs text-error-500" role="alert"> </p>'),
	M = g(
		'<div class="mb-4"><fieldset class="rounded border border-surface-500 px-2 py-1 dark:border-surface-400"><legend class="mx-auto block w-fit px-2 text-center text-sm font-normal text-surface-700 dark:text-surface-300" style="background:none;border:none;"> </legend> <div class="flex flex-col gap-y-2"></div></fieldset> <!></div>'
	);
function W(h, e) {
	z(e, !0);
	const I = [];
	let f = J(e, 'value', 15);
	const u = A(() => e.field.db_fieldName);
	var n = M(),
		o = d(n),
		v = d(o),
		N = d(v, !0);
	s(v);
	var p = m(v, 2);
	(C(
		p,
		21,
		() => e.field.options || [],
		(l) => l.value,
		(l, a) => {
			var c = K(),
				r = d(c);
			D(r);
			var k,
				y = m(r, 2),
				j = d(y, !0);
			(s(y),
				s(c),
				b(() => {
					(i(r, 'name', e.field.db_fieldName),
						i(r, 'aria-checked', f() === t(a).value),
						i(r, 'aria-label', t(a).label),
						E(r, 1, F(e.field.color ? `accent-${e.field.color}` : '')),
						G(r, e.field.color ? `accent-color: ${e.field.color}` : ''),
						k !== (k = t(a).value) && (r.value = (r.__value = t(a).value) ?? ''),
						x(j, t(a).label));
				}),
				H(I, [], r, () => (t(a).value, f()), f),
				_(l, c));
		}
	),
		s(p),
		s(o));
	var w = m(o, 2);
	{
		var S = (l) => {
			var a = L(),
				c = d(a, !0);
			(s(a),
				b(() => {
					(i(a, 'id', `${t(u)}-error`), x(c, e.error));
				}),
				_(l, a));
		};
		q(w, (l) => {
			e.error && l(S);
		});
	}
	(s(n),
		b(() => {
			(i(o, 'id', t(u)), i(o, 'aria-describedby', e.error ? `${t(u)}-error` : void 0), x(N, e.field.legend || 'Select one option'));
		}),
		_(h, n),
		B());
}
export { W as default };
//# sourceMappingURL=Dt3hcCJf.js.map
