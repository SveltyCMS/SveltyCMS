import { i as K } from './zi73tRJP.js';
import { p as S, z as f, b as a, d as y, c as m, n as V, r as v, s as j, g as l, t as A, a as B } from './DrlZFkx8.js';
import { f as g, a as k, d as F } from './CTjXDULS.js';
import { b as w, c as G, r as H } from './MEFvoR_D.js';
import { b as J } from './D4QnGYgQ.js';
import { p as r } from './DePHBZW_.js';
var L = g(
		'<div class="description absolute top-full mt-2 svelte-1qdmvov"><input type="text" class="input svelte-1qdmvov" placeholder="Enter description"/></div>'
	),
	M = g(
		'<div><button aria-label="Description" class="btn-sm flex items-center"><iconify-icon></iconify-icon> <span class="hidden sm:inline">Description</span></button> <!></div>',
		2
	);
function U(x, e) {
	S(e, !0);
	let p = r(e, 'show', 3, !1),
		D = r(e, 'value', 3, ''),
		u = r(e, 'key', 3, ''),
		_ = r(e, 'active', 15, ''),
		s = y('');
	f(() => {
		a(s, D());
	});
	let t = y(!1);
	(f(() => {
		u() !== _() && a(t, !1);
	}),
		f(() => {
			p() || a(t, !1);
		}));
	function q(i) {
		i.key === 'Enter' && (a(t, !1), e.onSubmit?.(l(s)));
	}
	function E() {
		(a(t, !l(t)), _(u()));
	}
	var o = M();
	let b;
	var n = m(o);
	n.__click = E;
	var h = m(n);
	(w(h, 'icon', 'material-symbols:description'), w(h, 'width', '20'), V(2), v(n));
	var z = j(n, 2);
	{
		var C = (i) => {
			var c = L(),
				d = m(c);
			(H(d),
				(d.__keydown = q),
				v(c),
				J(
					d,
					() => l(s),
					(I) => a(s, I)
				),
				k(i, c));
		};
		K(z, (i) => {
			l(t) && i(C);
		});
	}
	(v(o), A(() => (b = G(o, 1, 'relative', null, b, { hidden: !p() }))), k(x, o), B());
}
F(['click', 'keydown']);
export { U as default };
//# sourceMappingURL=ByscxnxP.js.map
