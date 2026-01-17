import { t as u, k as n, w as _, ac as g, ad as p, v as h, C as y, m as w, ae as O, af as R, q as b, l as t } from './DrlZFkx8.js';
import { h as m, g as C } from './CTjXDULS.js';
function k(c, v, i = !1, o = !1, E = !1) {
	var l = c,
		s = '';
	u(() => {
		var f = g;
		if (s === (s = v() ?? '')) {
			n && _();
			return;
		}
		if ((f.nodes !== null && (p(f.nodes.start, f.nodes.end), (f.nodes = null)), s !== '')) {
			if (n) {
				h.data;
				for (var a = _(), d = a; a !== null && (a.nodeType !== y || a.data !== ''); ) ((d = a), (a = w(a)));
				if (a === null) throw (O(), R);
				(m(h, d), (l = b(a)));
				return;
			}
			var r = s + '';
			i ? (r = `<svg>${r}</svg>`) : o && (r = `<math>${r}</math>`);
			var e = C(r);
			if (((i || o) && (e = t(e)), m(t(e), e.lastChild), i || o)) for (; t(e); ) l.before(t(e));
			else l.before(e);
		}
	});
}
export { k as h };
//# sourceMappingURL=IGLJqrie.js.map
