import { i as w } from '../chunks/zi73tRJP.js';
import { p as Z, f as $, a as tt, c as a, r as t, t as y, g as A, s as i } from '../chunks/DrlZFkx8.js';
import { c as at, a as m, f as S, s as l, t as rt } from '../chunks/CTjXDULS.js';
import { e as et, i as st } from '../chunks/BXe5mj2j.js';
import { s as E, a as ot } from '../chunks/MEFvoR_D.js';
import { p as v } from '../chunks/CxX94NXM.js';
import { a as it } from '../chunks/C-hhfhAN.js';
import { S as I, a as nt } from '../chunks/B9MNxn3G.js';
import { e as lt, a as vt, b as mt } from '../chunks/N8Jg0v49.js';
var ct = S('<span class="text-primary-500"><!></span>'),
	ft = S('<div class="absolute left-1/2 top-0 h-full w-4 -translate-x-1/2 text-center uppercase"><!></div>'),
	pt = S(
		'<main class="bg-linear-to-t flex h-screen w-full flex-col items-center justify-center from-surface-900 via-surface-700 to-surface-900 text-white"><div class="relative"><div class="relative animate-spin rounded-full"></div> <!></div> <div class="relative"><h1 class="relative text-9xl font-extrabold tracking-widest text-white"> </h1> <div class="absolute left-1/2 top-1/2 mx-auto -translate-x-1/2 -translate-y-1/2 rotate-12 transform rounded-md bg-error-600/80 px-2 text-center text-sm font-bold text-white"><div class=" min-w-[200px]"> </div> <div class="whitespace-nowrap"> </div></div></div> <h1 class="max-w-2xl text-center text-3xl font-extrabold tracking-widest text-surface-400"><!></h1> <p class="mt-2 text-lg text-white"> </p> <a href="/" class="relative mt-5 block rounded-full bg-linear-to-br from-error-700 via-error-600 to-error-700 px-8 py-4 font-bold uppercase text-white! shadow-xl"> </a></main>'
	);
function kt(L, z) {
	Z(z, !0);
	const P = 3,
		T = ' • ',
		X = v.data?.settings?.SITE_NAME || 'SveltyCMS',
		k = Array.from({ length: P }, () => X + T)
			.join('')
			.split('')
			.filter((r) => r !== ' ');
	function q(r) {
		const e = r % 10;
		return e >= 6 && e < 9;
	}
	var C = at(),
		B = $(C);
	{
		var D = (r) => {
			var e = pt(),
				d = a(e),
				c = a(d);
			(E(c, 'width: 140px; height: 140px; font-size: 0.9em; animation-duration: 20000ms;'),
				et(
					c,
					21,
					() => k,
					st,
					(s, o, f) => {
						var p = ft(),
							U = a(p);
						{
							var V = (n) => {
									var b = ct(),
										Y = a(b);
									(I(Y, {
										get char() {
											return A(o);
										}
									}),
										t(b),
										m(n, b));
								},
								W = (n) => {
									I(n, {
										get char() {
											return A(o);
										}
									});
								};
							w(U, (n) => {
								q(f) ? n(V) : n(W, !1);
							});
						}
						(t(p), y(() => E(p, `transform: translateX(-50%) rotate(${(1 / k.length) * f}turn);`)), m(s, p));
					}
				),
				t(c));
			var F = i(c, 2);
			(nt(F, { fill: 'red', className: 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 mb-2' }), t(d));
			var x = i(d, 2),
				u = a(x),
				G = a(u, !0);
			t(u);
			var M = i(u, 2),
				_ = a(M),
				H = a(_, !0);
			t(_);
			var N = i(_, 2),
				J = a(N, !0);
			(t(N), t(M), t(x));
			var h = i(x, 2),
				K = a(h);
			{
				var O = (s) => {
					var o = rt();
					(y(() => l(o, v.error.message)), m(s, o));
				};
				w(K, (s) => {
					v.error && s(O);
				});
			}
			t(h);
			var g = i(h, 2),
				Q = a(g, !0);
			t(g);
			var j = i(g, 2),
				R = a(j, !0);
			(t(j),
				t(e),
				y(
					(s, o, f) => {
						(ot(e, 'lang', it.contentLanguage), l(G, v.status), l(H, v.url), l(J, s), l(Q, o), l(R, f));
					},
					[() => lt(), () => vt(), () => mt()]
				),
				m(r, e));
		};
		w(B, (r) => {
			v && r(D);
		});
	}
	(m(L, C), tt());
}
export { kt as component };
//# sourceMappingURL=1.B26inZ3b.js.map
