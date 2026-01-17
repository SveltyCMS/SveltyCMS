import { i as F } from './zi73tRJP.js';
import { p as q, h as W, t as o, a as B, c, s as I, r as d, g as T, u as j } from './DrlZFkx8.js';
import { f as p, a as g, s as S, d as X } from './CTjXDULS.js';
import { a as Y } from './BEiD40NV.js';
import { r as G, c as f, a as y, b as N, d as Z } from './MEFvoR_D.js';
import { b as $, c as ee } from './D4QnGYgQ.js';
import { p as l } from './DePHBZW_.js';
import { l as te } from './BvngfGKt.js';
var ae = p('<label for="input"> </label>'),
	re = p('<div class="m-1 flex max-w-full items-center justify-between gap-2"><!> <input id="input"/></div>');
function ge(k, e) {
	q(e, !0);
	let i = l(e, 'type', 3, 'text'),
		_ = l(e, 'value', 15, '');
	function C(s) {
		s.type = i();
	}
	var v = re(),
		h = c(v);
	{
		var x = (s) => {
			var m = ae(),
				w = c(m, !0);
			(d(m),
				o(() => {
					(f(m, 1, `w-32 flex-none ${e.labelClass ?? ''}`), S(w, e.label));
				}),
				g(s, m));
		};
		F(h, (s) => {
			e.label && s(x);
		});
	}
	var a = I(h, 2);
	(G(a),
		Y(a, (s) => C?.(s)),
		W(() => $(a, _)),
		d(v),
		o(() => {
			(f(a, 1, `input grow text-black dark:text-primary-500 ${e.inputClass ?? ''}`), y(a, 'placeholder', e.placeholder));
		}),
		g(k, v),
		B());
}
var le = p('<span> </span>'),
	ie = p('<iconify-icon></iconify-icon>', 2),
	se = p('<span> </span>'),
	ne = p('<label><!> <div class="relative"><input type="checkbox" class="peer sr-only svelte-wbhl62"/> <div><div><!></div></div></div></label>');
function pe(k, e) {
	q(e, !0);
	let i = l(e, 'value', 15, !1),
		_ = l(e, 'label', 3, ''),
		C = l(e, 'labelColor', 3, 'text-primary-500'),
		v = l(e, 'iconOn', 3, ''),
		h = l(e, 'iconOff', 3, ''),
		x = l(e, 'size', 3, 'md'),
		a = l(e, 'disabled', 3, !1),
		s = l(e, 'title', 3, ''),
		m = l(e, 'onChange', 3, void 0);
	const w = `toggle-${Math.random().toString(36).substring(2, 9)}`;
	function H(r) {
		if (a()) {
			r.preventDefault();
			return;
		}
		const t = r.target.checked;
		i(t);
		try {
			m()?.(t);
		} catch (n) {
			te.error('[Toggles] Error in onChange callback:', n);
		}
	}
	const J = j(() => ({ sm: 'h-6 w-10 min-w-[40px]', md: 'h-8 w-14 min-w-[48px]', lg: 'h-10 w-20 min-w-[56px]' })[x()]),
		K = j(
			() => ({ sm: 'h-4 w-4 peer-checked:translate-x-5', md: 'h-6 w-6 peer-checked:translate-x-7', lg: 'h-8 w-8 peer-checked:translate-x-11' })[x()]
		),
		L = j(() => ({ sm: '16', md: '24', lg: '32' })[x()]);
	var b = ne();
	let A;
	var D = c(b);
	{
		var P = (r) => {
			var t = le(),
				n = c(t, !0);
			(d(t),
				o(() => {
					(f(t, 1, `capitalize ${(i() ? 'text-primary-500' : C()) ?? ''}`), S(n, _()));
				}),
				g(r, t));
		};
		F(D, (r) => {
			_() && r(P);
		});
	}
	var E = I(D, 2),
		u = c(E);
	(G(u), (u.__change = H));
	var O = I(u, 2),
		z = c(O);
	let M;
	var Q = c(z);
	{
		var R = (r) => {
				var t = ie();
				(o(() => N(t, 'icon', i() ? v() : h())), o(() => N(t, 'width', T(L))));
				let n;
				(o(() => (n = f(t, 1, Z(i() ? 'text-primary-500' : 'text-error-500'), null, n, { 'text-surface-600': a() }))), g(r, t));
			},
			U = (r) => {
				var t = se();
				let n;
				var V = c(t, !0);
				(d(t),
					o(() => {
						((n = f(t, 1, `text-[10px] font-bold ${i() ? 'text-primary-500' : 'text-error-500'}`, null, n, { 'text-surface-600': a() })),
							S(V, i() ? 'ON' : 'OFF'));
					}),
					g(r, t));
			};
		F(Q, (r) => {
			v() && h() ? r(R) : r(U, !1);
		});
	}
	(d(z),
		d(O),
		d(E),
		d(b),
		o(() => {
			(y(b, 'for', w),
				(A = f(b, 1, 'flex cursor-pointer select-none items-center gap-2', null, A, { 'opacity-50': a(), 'cursor-not-allowed': a() })),
				y(b, 'title', s()),
				y(u, 'name', _() || 'toggle'),
				y(u, 'id', w),
				(u.disabled = a()),
				f(O, 1, `${T(J) ?? ''} rounded-full bg-error-500 transition-colors peer-checked:bg-primary-500`),
				(M = f(z, 1, `${T(K) ?? ''} absolute left-1 top-1 flex items-center justify-center rounded-full bg-white transition-transform`, null, M, {
					'bg-surface-400': a()
				})));
		}),
		ee(u, i),
		g(k, b),
		B());
}
X(['change']);
export { ge as I, pe as T };
//# sourceMappingURL=-vmR0Fky.js.map
