import { i as b } from './zi73tRJP.js';
import { p as de, z as ue, g as o, d as fe, c as k, s as v, t as l, a as be, u as C, b as ve, r as I } from './DrlZFkx8.js';
import { d as ye, f as u, a as d, s as j } from './CTjXDULS.js';
import { f as pe, C as me, a as D, b as s, c as M, s as S } from './MEFvoR_D.js';
import { b as xe } from './D4QnGYgQ.js';
import { b as _e } from './YQp2a1pQ.js';
import { p as r, r as he } from './DePHBZW_.js';
var ge = u('<iconify-icon></iconify-icon>', 2),
	we = u('<iconify-icon></iconify-icon>', 2),
	ke = u('<span class="text-error-500" aria-hidden="true">*</span>'),
	Ce = u('<label> <!></label>'),
	Ie = u('<p class="mt-1 text-xs text-error-500" role="alert"> </p>'),
	Pe = u('<div class="relative w-full"><div class="group relative flex w-full items-center" role="group"><input/> <!> <!> <!></div> <!></div>');
function Fe(B, a) {
	de(a, !0);
	let T = r(a, 'value', 15, ''),
		c = r(a, 'showPassword', 15, !1),
		G = r(a, 'disabled', 3, !1),
		E = r(a, 'icon', 3, ''),
		y = r(a, 'iconColor', 3, 'gray'),
		J = r(a, 'inputClass', 3, ''),
		p = r(a, 'label', 3, ''),
		N = r(a, 'labelClass', 3, ''),
		O = r(a, 'name', 3, ''),
		F = r(a, 'required', 3, !1),
		L = r(a, 'passwordIconColor', 3, 'gray'),
		i = r(a, 'textColor', 3, 'black'),
		m = r(a, 'type', 3, 'text'),
		Q = r(a, 'tabindex', 3, 0),
		R = r(a, 'id', 3, ''),
		U = r(a, 'autocapitalize', 3, 'none'),
		W = r(a, 'spellcheck', 3, !1),
		X = r(a, 'autofocus', 3, !1),
		f = r(a, 'invalid', 3, !1),
		P = r(a, 'errorMessage', 3, ''),
		Y = he(a, [
			'$$slots',
			'$$events',
			'$$legacy',
			'value',
			'showPassword',
			'disabled',
			'icon',
			'iconColor',
			'inputClass',
			'label',
			'labelClass',
			'minlength',
			'maxlength',
			'name',
			'required',
			'passwordIconColor',
			'textColor',
			'type',
			'tabindex',
			'id',
			'autocomplete',
			'autocapitalize',
			'spellcheck',
			'autofocus',
			'invalid',
			'errorMessage',
			'onClick',
			'onInput',
			'onkeydown',
			'onPaste'
		]),
		x = fe(null);
	const _ = C(() => R() || (p() ? p().toLowerCase().replace(/\s+/g, '-') : 'defaultInputId')),
		A = C(() => (P() ? `error-${o(_)}` : void 0)),
		Z = C(() => (c() && m() === 'password' ? 'text' : m())),
		h = C(() => i().includes('text-') || i().includes(' '));
	ue(() => {
		X() && o(x) && o(x).focus();
	});
	function H(t) {
		(t.preventDefault(), c(!c()));
	}
	function $(t) {
		(t.key === 'Enter' || t.key === ' ') && (t.preventDefault(), H(t));
	}
	var z = Pe(),
		g = k(z),
		w = k(g),
		ee = (t) => a.onInput?.(t.currentTarget.value);
	(pe(
		w,
		() => ({
			name: O(),
			minlength: a.minlength,
			maxlength: a.maxlength,
			disabled: G(),
			tabindex: Q(),
			autocomplete: a.autocomplete ?? void 0,
			autocapitalize: U(),
			spellcheck: W(),
			'aria-required': F(),
			'aria-invalid': f(),
			'aria-describedby': o(A),
			onclick: a.onClick,
			oninput: ee,
			onpaste: a.onPaste,
			onkeydown: a.onkeydown,
			type: o(Z),
			style: !o(h) && i() ? `color: ${i()};` : '',
			class: `peer block h-12 w-full appearance-none border-0 border-b-2 border-surface-300 bg-transparent pl-8 pr-6 pb-1 pt-5 text-base focus:border-tertiary-600 focus:outline-none focus:ring-0 disabled:opacity-50 dark:border-surface-400 dark:focus:border-tertiary-500 ${J() ?? ''} ${(o(h) ? i() : '') ?? ''}`,
			placeholder: ' ',
			id: o(_),
			...Y,
			[me]: { '!border-error-500': f(), 'dark:!border-error-500': f(), 'pr-10': m() === 'password' }
		}),
		void 0,
		void 0,
		void 0,
		void 0,
		!0
	),
		_e(
			w,
			(t) => ve(x, t),
			() => o(x)
		));
	var K = v(w, 2);
	{
		var ae = (t) => {
			var e = ge();
			(l(() => s(e, 'icon', E())), s(e, 'width', '1.125em'));
			let n;
			(s(e, 'aria-hidden', 'true'),
				l(() => {
					((n = M(e, 1, 'absolute left-0 top-3', null, n, { 'text-surface-500': y() === 'gray', 'dark:text-surface-50': y() === 'gray' })),
						S(e, y() !== 'gray' ? `color: ${y()};` : ''));
				}),
				d(t, e));
		};
		b(K, (t) => {
			E() && t(ae);
		});
	}
	var V = v(K, 2);
	{
		var te = (t) => {
			var e = we();
			(s(e, 'tabindex', '0'),
				s(e, 'role', 'button'),
				l(() => s(e, 'icon', c() ? 'bi:eye-fill' : 'bi:eye-slash-fill')),
				l(() => s(e, 'aria-label', c() ? 'Hide password' : 'Show password')),
				l(() => s(e, 'aria-pressed', c())),
				M(e, 1, 'absolute right-2 top-3 cursor-pointer hover:opacity-75 focus:outline-none text-surface-500 dark:text-surface-50'),
				s(e, 'width', '24'),
				(e.__keydown = $),
				(e.__click = H),
				l(() => S(e, L() !== 'gray' ? `color: ${L()};` : '')),
				d(t, e));
		};
		b(V, (t) => {
			m() === 'password' && t(te);
		});
	}
	var re = v(V, 2);
	{
		var oe = (t) => {
			var e = Ce(),
				n = k(e),
				ie = v(n);
			{
				var ne = (q) => {
					var ce = ke();
					d(q, ce);
				};
				b(ie, (q) => {
					F() && q(ne);
				});
			}
			(I(e),
				l(() => {
					(D(e, 'for', o(_)),
						S(e, !o(h) && i() ? `color: ${i()};` : ''),
						M(
							e,
							1,
							`pointer-events-none absolute left-8 top-1.5 origin-left -translate-y-3 scale-75 transform text-base text-surface-500 transition-all duration-200 ease-in-out peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-placeholder-shown:text-base peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-tertiary-500! peer-disabled:text-surface-500 ${T() ? `-translate-y-3 scale-75 ${f() ? 'text-error-500!' : 'text-tertiary-500!'}` : ''} ${(o(h) ? i() : '') ?? ''} ${N() ?? ''}`
						),
						j(n, `${p() ?? ''} `));
				}),
				d(t, e));
		};
		b(re, (t) => {
			p() && t(oe);
		});
	}
	I(g);
	var le = v(g, 2);
	{
		var se = (t) => {
			var e = Ie(),
				n = k(e, !0);
			(I(e),
				l(() => {
					(D(e, 'id', o(A)), j(n, P()));
				}),
				d(t, e));
		};
		b(le, (t) => {
			f() && P() && t(se);
		});
	}
	(I(z), l(() => D(g, 'aria-labelledby', o(_))), xe(w, T), d(B, z), be());
}
ye(['keydown', 'click']);
export { Fe as F };
//# sourceMappingURL=DE21BT69.js.map
