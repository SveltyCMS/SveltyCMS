import { i as y } from './zi73tRJP.js';
import { p as C, z as I, c as l, s as v, r as i, t as c, a as N } from './DrlZFkx8.js';
import { f as x, a as m, s as z } from './CTjXDULS.js';
import { r as b, c as H, a as f } from './MEFvoR_D.js';
import { b as _ } from './D4QnGYgQ.js';
import { p as P } from './DePHBZW_.js';
import { I as V } from './N8Jg0v49.js';
var j = x('<p class="absolute bottom-0 left-0 w-full text-center text-xs text-error-500" role="alert"> </p>'),
	q = x(
		'<div><div class="flex items-center rounded gap-0.5 border border-surface-400 pr-1"><input type="color" class="pl-2 h-9 w-9 shrink-0 cursor-pointer border-none bg-transparent p-0" aria-label="Color Picker"/> <div class="relative grow"><input type="text" class="w-full grow border-none bg-transparent font-mono outline-none focus:ring-0" aria-label="Hex Color Value"/></div></div> <!></div>'
	);
function K(g, e) {
	C(e, !0);
	let t = P(e, 'value', 7);
	I(() => {
		t() || t('#000000');
	});
	var o = q();
	let u;
	var s = l(o),
		r = l(s);
	b(r);
	var p = v(r, 2),
		n = l(p);
	(b(n), i(p), i(s));
	var h = v(s, 2);
	{
		var w = (a) => {
			var d = j(),
				k = l(d, !0);
			(i(d), c(() => z(k, e.error)), m(a, d));
		};
		y(h, (a) => {
			e.error && a(w);
		});
	}
	(i(o),
		c(
			(a) => {
				((u = H(o, 1, 'relative rounded p-1', null, u, { invalid: e.error })),
					f(r, 'id', e.field.db_fieldName),
					f(r, 'name', e.field.db_fieldName),
					f(n, 'placeholder', a));
			},
			[() => V()]
		),
		_(r, t),
		_(n, t),
		m(g, o),
		N());
}
export { K as default };
//# sourceMappingURL=GPb_3pP-.js.map
