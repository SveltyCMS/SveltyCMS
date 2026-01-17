import { i as L } from '../chunks/zi73tRJP.js';
import { p as J, z as K, b as u, g as i, d as w, c as o, s as n, t as x, a as N, r, u as Q } from '../chunks/DrlZFkx8.js';
import { d as R, f as S, s as h, e as U, a as k } from '../chunks/CTjXDULS.js';
import { b as y, c as W, a as T } from '../chunks/MEFvoR_D.js';
import { S as X } from '../chunks/Du7BI3HQ.js';
import { F as Y } from '../chunks/DE21BT69.js';
import { g as D, l as Z } from '../chunks/7IKENDK9.js';
import { o as E, p as $, q as tt, r as et, s as at, t as ot } from '../chunks/N8Jg0v49.js';
var rt = S('<label><h2 class="mb-2 text-center text-xl font-bold text-primary-500"> </h2> <!></label>'),
	it = S('<p id="error-message" class="text-error-500" role="alert"> </p>'),
	nt = S(
		'<div class="grid h-full w-full place-items-center bg-[#242728]"><form class="card m-2 flex flex-col items-center gap-2 rounded border p-2 sm:p-6" method="post" action="?/OAuth"><!> <!> <!> <div class="mt-2 flex w-full justify-between gap-1 sm:gap-2"><button type="button" class="variant-filled btn"> </button> <button type="submit" class="variant-filled btn items-center"><iconify-icon></iconify-icon> <p> </p></button></div></form></div>',
		2
	);
function ht(I, d) {
	J(d, !0);
	let m = w(''),
		s = w(''),
		v = w(!1);
	K(() => {
		u(v, !d.data.requiresToken || (i(m).length >= 16 && i(m).length <= 48), !0);
	});
	async function j(e) {
		if ((e.preventDefault(), d.data.requiresToken && !i(v))) {
			u(s, 'Invalid token length');
			return;
		}
		(u(s, ''),
			await D.withLoading(
				Z.authentication,
				async () => {
					const t = e.target,
						a = new FormData(t);
					if (!(await fetch(t.action, { method: 'POST', body: a })).ok) throw new Error('OAuth authentication failed');
				},
				'OAuth.handleSubmit'
			).catch((t) => {
				u(s, t instanceof Error ? t.message : 'Authentication failed', !0);
			}));
	}
	function z() {
		window.history.back();
	}
	var b = nt(),
		g = o(b),
		C = o(g);
	X(C, {});
	var q = n(C, 2);
	{
		var M = (e) => {
			var t = rt(),
				a = o(t),
				p = o(a, !0);
			r(a);
			var G = n(a, 2);
			{
				let _ = Q(() => at?.() || ot?.());
				Y(G, {
					id: 'token',
					name: 'token',
					type: 'text',
					required: !0,
					get label() {
						return i(_);
					},
					icon: 'mdi:key-chain',
					iconColor: 'white',
					textColor: 'white',
					passwordIconColor: 'white',
					inputClass: 'text-white',
					autocomplete: 'off',
					minlength: 16,
					maxlength: 48,
					get value() {
						return i(m);
					},
					set value(H) {
						u(m, H, !0);
					}
				});
			}
			(r(t), x((_) => h(p, _), [() => et()]), k(e, t));
		};
		L(q, (e) => {
			d.data.requiresToken && e(M);
		});
	}
	var F = n(q, 2);
	{
		var P = (e) => {
			var t = it(),
				a = o(t, !0);
			(r(t), x(() => h(a, i(s))), k(e, t));
		};
		L(F, (e) => {
			i(s) && e(P);
		});
	}
	var O = n(F, 2),
		l = o(O);
	l.__click = z;
	var V = o(l, !0);
	r(l);
	var f = n(l, 2),
		c = o(f);
	(y(c, 'icon', 'flat-color-icons:google'), y(c, 'color', 'white'), y(c, 'width', '20'), W(c, 1, 'mr-1'));
	var A = n(c, 2),
		B = o(A, !0);
	(r(A),
		r(f),
		r(O),
		r(g),
		r(b),
		x(
			(e, t, a, p) => {
				(T(l, 'aria-label', e), h(V, t), (f.disabled = !i(v) || D.isLoading), T(f, 'aria-label', a), h(B, p));
			},
			[() => E(), () => E(), () => $(), () => tt()]
		),
		U('submit', g, j),
		k(I, b),
		N());
}
R(['click']);
export { ht as component };
//# sourceMappingURL=20.B6lMiz5z.js.map
