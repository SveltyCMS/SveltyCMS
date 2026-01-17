import { i as o, j as u, H as _, k as t, l as g, C as m, m as l, o as a, q as d, v as p } from './DrlZFkx8.js';
function E(n, r) {
	let s = null,
		f = t;
	var i;
	if (t) {
		s = p;
		for (var e = g(document.head); e !== null && (e.nodeType !== m || e.data !== n); ) e = l(e);
		if (e === null) a(!1);
		else {
			var y = l(e);
			(e.remove(), d(y));
		}
	}
	t || (i = document.head.appendChild(o()));
	try {
		u(() => r(i), _);
	} finally {
		f && (a(!0), d(s));
	}
}
export { E as h };
//# sourceMappingURL=DjaHBvI-.js.map
