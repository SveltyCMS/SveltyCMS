import './zi73tRJP.js';
import { p, c as d, r as m, t as g, g as t, u as l, a as v } from './DrlZFkx8.js';
import { f as _, s as h, a as x } from './CTjXDULS.js';
import { c as T, a as u } from './MEFvoR_D.js';
import { a as b } from './C-hhfhAN.js';
import { p as L } from './C9E6SjbS.js';
var y = _('<span> </span>');
function G(i, s) {
	p(s, !0);
	const c = l(() => (s.field?.translated ? b.contentLanguage.toLowerCase() : (L.DEFAULT_CONTENT_LANGUAGE || 'en').toLowerCase())),
		e = l(() => s.value?.[t(c)] ?? s.value?.[Object.keys(s.value || {})[0]] ?? '–'),
		r = l(() => typeof t(e) == 'string' && t(e).length > 50),
		n = l(() => (t(r) ? `${t(e).substring(0, 50)}...` : t(e)));
	var a = y();
	let o;
	var f = d(a, !0);
	(m(a),
		g(() => {
			((o = T(a, 1, 'truncate', null, o, { 'cursor-help': t(r) })),
				u(a, 'title', t(r) ? t(e) : void 0),
				u(a, 'aria-label', t(r) ? `${t(n)} (truncated, full text: ${t(e)})` : void 0),
				h(f, t(n)));
		}),
		x(i, a),
		v());
}
export { G as default };
//# sourceMappingURL=DCKdS55O.js.map
