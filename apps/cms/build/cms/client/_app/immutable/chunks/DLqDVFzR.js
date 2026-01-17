import { i as I } from './zi73tRJP.js';
import { p as P, d as c, x as d, z as k, g as t, b as a, f as h, a as E } from './DrlZFkx8.js';
import { c as _, a as j } from './CTjXDULS.js';
import { c as S } from './7bh91wXp.js';
function D(O, e) {
	P(e, !0);
	function w(s) {
		const r = Object.entries(s).reduce((f, [l, m]) => {
			const i = Object.entries(m).reduce((y, [z, b]) => (b !== !1 && (y[z] = b), y), {});
			return (Object.keys(i).length > 0 && (f[l] = i), f);
		}, {});
		return Object.keys(r).length === 0 ? void 0 : r;
	}
	let n = c(d(e.value ?? null)),
		g = c(d(e.icon ?? null)),
		u = c(d(e.permissions ?? null));
	(k(() => {
		(e.key === 'display' && t(n)?.default === !0 && a(n, ''), t(n) !== e.value && o());
	}),
		k(() => {
			e.key === 'permissions' && t(n) && (a(u, w(t(n)), !0), t(u) !== e.permissions && o());
		}));
	function o() {
		e.onupdate && e.onupdate({ value: t(n) });
	}
	var v = _(),
		x = h(v);
	{
		var p = (s) => {
			var r = _(),
				f = h(r);
			(S(
				f,
				() => e.widget,
				(l, m) => {
					m(l, {
						get label() {
							return e.key;
						},
						theme: 'dark',
						get value() {
							return t(n);
						},
						set value(i) {
							a(n, i, !0);
						},
						get icon() {
							return t(g);
						},
						set icon(i) {
							a(g, i, !0);
						},
						get permissions() {
							return t(u);
						},
						set permissions(i) {
							a(u, i, !0);
						},
						$$events: { update: o }
					});
				}
			),
				j(s, r));
		};
		I(x, (s) => {
			e.widget && s(p);
		});
	}
	(j(O, v), E());
}
export { D as I };
//# sourceMappingURL=DLqDVFzR.js.map
