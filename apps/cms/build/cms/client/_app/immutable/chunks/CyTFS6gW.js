import { i as j } from './zi73tRJP.js';
import {
	p as Y,
	d as z,
	x as F,
	b as w,
	g as t,
	a9 as Z,
	z as $,
	f as G,
	c as h,
	r as m,
	s as k,
	a as ee,
	t as N,
	u as ae,
	e as te
} from './DrlZFkx8.js';
import { f as u, a as c, c as re, s as L } from './CTjXDULS.js';
import { e as O, i as A } from './BXe5mj2j.js';
import { t as oe, f as se } from './0XeaN6pZ.js';
import { c as ne, a as ie } from './MEFvoR_D.js';
import { p as b } from './DePHBZW_.js';
import { d as le } from './D3eWcrZU.js';
var de = u(
		'<span> <span class="absolute bottom-full left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 p-1 text-xs text-white group-hover:block"> </span></span>'
	),
	ce = u('<p>No content available for heatmap.</p>'),
	pe = u('<li> </li>'),
	ve = u('<ul></ul>'),
	me = u('<p>No keywords provided or no matching keywords found in content.</p>'),
	ue = u(
		'<div class="wrap-break-word leading-6 max-sm:text-sm max-sm:leading-tight"><!></div> <div class="mt-5 text-sm max-sm:text-xs"><h4>Keyword Density</h4> <!></div>',
		1
	);
function ke(R, f) {
	Y(f, !0);
	const _ = b(f, 'content', 3, ''),
		D = b(f, 'language', 3, 'en'),
		g = b(f, 'keywords', 19, () => []),
		H = b(f, 'on:heatmapGenerated', 3, () => {});
	let p = z(F([])),
		v = z(F({}));
	const W = le.create(() => {
		q();
	}, 300);
	async function q() {
		if (!_()) {
			(w(p, [], !0), w(v, {}, !0), H()({ heatmapData: t(p), keywordDensity: t(v) }));
			return;
		}
		const e = _().split(/\s+/);
		(w(
			p,
			e.map((a, o) => ({ word: a, heatLevel: B(a, o, e.length, D()), isKeyword: g().includes(a.toLowerCase()) })),
			!0
		),
			E(e),
			H()({ heatmapData: t(p), keywordDensity: t(v) }),
			await Z());
	}
	function B(e, a, o, s) {
		let r = 0;
		const n = 1 - a / o;
		r += n * 2;
		const l = s === 'en' ? 5 : 6;
		return ((r += Math.max(0, 3 - Math.abs(e.length - l))), g().includes(e.toLowerCase()) && (r += 2), Math.max(1, Math.min(5, Math.round(r))));
	}
	function E(e) {
		const a = e.length,
			o = {};
		for (const s of g()) {
			const r = e.filter((n) => n.toLowerCase() === s.toLowerCase()).length;
			o[s] = (r / a) * 100;
		}
		w(v, o, !0);
	}
	function I(e) {
		return { 1: 'bg-green-500/20', 2: 'bg-yellow-500/20', 3: 'bg-orange-500/20', 4: 'bg-red-500/20', 5: 'bg-purple-500/20' }[e] || '';
	}
	$(() => {
		(_(), D(), g(), W());
	});
	var M = ue(),
		x = G(M),
		J = h(x);
	{
		var P = (e) => {
				var a = re(),
					o = G(a);
				(O(
					o,
					17,
					() => t(p),
					A,
					(s, r) => {
						let n = () => t(r).word,
							l = () => t(r).heatLevel,
							d = () => t(r).isKeyword;
						var i = de(),
							y = h(i),
							C = k(y),
							V = h(C);
						(m(C),
							m(i),
							N(
								(X) => {
									(ne(i, 1, `relative cursor-help ${X ?? ''} ${d() ? 'border-b-2 border-blue-500' : ''} group`),
										ie(i, 'aria-label', `Heat level ${l() ?? ''}: ${n() ?? ''}${d() ? ', keyword' : ''}`),
										L(y, `${n() ?? ''} `),
										L(V, `Heat: ${l() ?? ''}, ${d() ? 'Keyword' : 'Regular word'}`));
								},
								[() => I(l())]
							),
							oe(
								3,
								i,
								() => se,
								() => ({ duration: 200 })
							),
							c(s, i));
					}
				),
					c(e, a));
			},
			Q = (e) => {
				var a = ce();
				c(e, a);
			};
		j(J, (e) => {
			t(p).length > 0 ? e(P) : e(Q, !1);
		});
	}
	m(x);
	var K = k(x, 2),
		S = k(h(K), 2);
	{
		var T = (e) => {
				var a = ve();
				(O(
					a,
					21,
					() => Object.entries(t(v)),
					A,
					(o, s) => {
						var r = ae(() => te(t(s), 2));
						let n = () => t(r)[0],
							l = () => t(r)[1];
						var d = pe(),
							i = h(d);
						(m(d), N((y) => L(i, `${n() ?? ''}: ${y ?? ''}%`), [() => l().toFixed(2)]), c(o, d));
					}
				),
					m(a),
					c(e, a));
			},
			U = (e) => {
				var a = me();
				c(e, a);
			};
		j(S, (e) => {
			Object.keys(t(v)).length > 0 ? e(T) : e(U, !1);
		});
	}
	(m(K), c(R, M), ee());
}
export { ke as default };
//# sourceMappingURL=CyTFS6gW.js.map
