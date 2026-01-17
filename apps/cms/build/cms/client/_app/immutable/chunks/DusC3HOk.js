import { i as b } from './zi73tRJP.js';
import { p as L, z as R, b as y, d as T, c as l, r as o, s as d, t as g, g as v, u as h, a as j } from './DrlZFkx8.js';
import { f, s as x, a as u, d as q } from './CTjXDULS.js';
import { c as B } from './MEFvoR_D.js';
import { p as G } from './DePHBZW_.js';
import { s as H } from './Cl42wY7v.js';
import { a as J } from './C-hhfhAN.js';
var K = f('<button aria-label="Clear Selection">&times;</button>'),
	N = f('<p class="error-message" role="alert"> </p>'),
	O = f(
		'<div><div class="selection-box"><span> </span> <div class="actions"><button aria-label="Select Entry">Select</button> <!></div></div> <!></div>'
	);
function Z(k, e) {
	L(e, !0);
	let r = G(e, 'value', 7),
		s = T(null);
	const E = h(() => J.contentLanguage);
	async function S(a) {
		return null;
	}
	R(() => {
		(Array.isArray(r()) ? r()[0] : r()) ? S().then((t) => y(s, t, !0)) : y(s, null);
	});
	const M = h(() => v(s)?.[e.field.displayField]?.[v(E)] || 'Select an Entry');
	function A() {
		H({
			component: 'relationModal',
			meta: {
				collectionId: e.field.collection,
				callback: (a) => {
					a && r(a);
				}
			}
		});
	}
	var i = O();
	let m;
	var n = l(i),
		c = l(n),
		w = l(c, !0);
	o(c);
	var p = d(c, 2),
		_ = l(p);
	_.__click = A;
	var z = d(_, 2);
	{
		var C = (a) => {
			var t = K();
			((t.__click = () => r(null)), u(a, t));
		};
		b(z, (a) => {
			r() && a(C);
		});
	}
	(o(p), o(n));
	var D = d(n, 2);
	{
		var F = (a) => {
			var t = N(),
				I = l(t, !0);
			(o(t), g(() => x(I, e.error)), u(a, t));
		};
		b(D, (a) => {
			e.error && a(F);
		});
	}
	(o(i),
		g(() => {
			((m = B(i, 1, 'relation-container', null, m, { invalid: e.error })), x(w, v(M)));
		}),
		u(k, i),
		j());
}
q(['click']);
export { Z as default };
//# sourceMappingURL=DusC3HOk.js.map
