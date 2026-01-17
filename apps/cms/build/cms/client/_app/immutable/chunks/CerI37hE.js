import './zi73tRJP.js';
import { p as o, c as l, r as i, t as n, g as r, u as f, a as m } from './DrlZFkx8.js';
import { f as v, s as d, a as c } from './CTjXDULS.js';
import { a as p } from './MEFvoR_D.js';
var _ = v('<span> </span>');
function j(s, t) {
	o(t, !0);
	const a = f(() =>
		t.value?.street
			? [`${t.value.street} ${t.value.houseNumber}`, `${t.value.postalCode} ${t.value.city}`, t.value.country].filter(Boolean).join(', ')
			: '–'
	);
	var e = _(),
		u = l(e, !0);
	(i(e),
		n(() => {
			(p(e, 'title', r(a)), d(u, r(a)));
		}),
		c(s, e),
		m());
}
export { j as default };
//# sourceMappingURL=CerI37hE.js.map
