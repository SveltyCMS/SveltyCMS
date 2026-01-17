import './zi73tRJP.js';
import { p as m, c, r as f, t as p, g as a, u as r, a as l } from './DrlZFkx8.js';
import { f as i, s as d, a as y } from './CTjXDULS.js';
import { a as v } from './C-hhfhAN.js';
var g = i('<span> </span>');
function I(s, e) {
	m(e, !0);
	const n = r(() => v.systemLanguage),
		u = r(() => {
			if (typeof e.value != 'number') return '–';
			try {
				return new Intl.NumberFormat(a(n), { style: 'currency', currency: e.field.currencyCode || 'EUR' }).format(e.value);
			} catch {
				return 'Invalid amount';
			}
		});
	var t = g(),
		o = c(t, !0);
	(f(t), p(() => d(o, a(u))), y(s, t), l());
}
export { I as default };
//# sourceMappingURL=Bsbm59uJ.js.map
