import { i as L } from '../chunks/zi73tRJP.js';
import { p as N, d as b, x as Q, b as n, y as g, g as t, f as A, s as l, c, u as R, a as W, r as m, t as y } from '../chunks/DrlZFkx8.js';
import { d as X, f as v, a as h, s as T, e as D } from '../chunks/CTjXDULS.js';
import { e as M } from '../chunks/BXe5mj2j.js';
import { e as Y, b as O, c as Z, a as ee } from '../chunks/MEFvoR_D.js';
import { u as w, t as j } from '../chunks/BpdyKTB3.js';
import { d as x } from '../chunks/B_fImZOG.js';
import { m as B } from '../chunks/N8Jg0v49.js';
import { P as te } from '../chunks/C6jjkVLf.js';
var ae = v('<option> </option>'),
	se = v('<button class="preset-outline-tertiary-500 btn mt-2"> </button>'),
	re = v(
		'<p class="my-2 text-center text-tertiary-500 dark:text-primary-500 sm:text-left">There are currently no custom themes available. Visit the SveltyCMS marketplace to find new themes.</p> <a href="https://www.sveltyCMS.com" target="_blank" rel="noopener noreferrer" class="preset-outlined-primary-500 btn w-full gap-2 py-6"><iconify-icon></iconify-icon> <p class="uppercase"> </p></a>',
		3
	),
	oe = v(
		'<!> <div class="mb-4"><label for="theme-select" class="mb-2 block font-bold">Current System Theme:</label> <select id="theme-select" class="select"></select></div> <div class="mt-4"><h3 class="font-bold">Available Themes:</h3> <!></div> <!>',
		1
	);
function ve(F, I) {
	N(I, !0);
	let r = b(null),
		u = b(null),
		f = b(Q([]));
	$();
	async function $() {
		n(
			f,
			Object.entries(Object.assign({})).map(([s, e], o) => {
				const i = x(new Date());
				return {
					_id: `custom-theme-${o}`,
					name: s.split('/')[3],
					path: e,
					isDefault: !1,
					isActive: !1,
					config: { tailwindConfigPath: '', assetsPath: '' },
					createdAt: i,
					updatedAt: i
				};
			}),
			!0
		);
	}
	const U = R(() => [
		{
			_id: 'default-theme',
			name: 'SveltyCMSTheme',
			path: '/path/to/default/theme.css',
			isDefault: !0,
			isActive: !0,
			config: { tailwindConfigPath: '', assetsPath: '' },
			createdAt: x(new Date()),
			updatedAt: x(new Date())
		},
		...t(f)
	]);
	(g(() => {
		t(r) && w(t(r).name);
	}),
		g(() => {
			t(u) && w(t(u).name);
		}),
		g(() => {
			j.currentTheme && n(r, j.currentTheme, !0);
		}));
	function V(a) {
		(n(r, a, !0), n(u, null));
	}
	function k(a) {
		n(u, a, !0);
	}
	function C() {
		(n(u, null), t(r) && w(t(r).name));
	}
	function q() {
		t(r) && V(t(r));
	}
	var P = oe(),
		S = A(P);
	te(S, { name: 'Theme Management', icon: 'ph:layout', showBackButton: !0, backUrl: '/config' });
	var d = l(S, 2),
		p = l(c(d), 2);
	((p.__change = q),
		M(
			p,
			21,
			() => t(U),
			(a) => a._id,
			(a, s) => {
				var e = ae(),
					o = c(e, !0);
				m(e);
				var i = {};
				(y(() => {
					(T(o, t(s).name), i !== (i = t(s)) && (e.value = (e.__value = t(s)) ?? ''));
				}),
					h(a, e));
			}
		),
		m(p),
		m(d));
	var _ = l(d, 2),
		z = l(c(_), 2);
	(M(
		z,
		17,
		() => t(f),
		(a) => a._id,
		(a, s) => {
			var e = se();
			((e.__mouseover = () => k(t(s))), (e.__mouseout = C));
			var o = c(e);
			(m(e), y(() => T(o, `Preview ${t(s).name ?? ''}`)), D('focus', e, () => k(t(s))), D('blur', e, C), h(a, e));
		}
	),
		m(_));
	var E = l(_, 2);
	{
		var G = (a) => {
			var s = re(),
				e = l(A(s), 2),
				o = c(e);
			(O(o, 'icon', 'icon-park-outline:shopping-bag'), O(o, 'width', '28'), Z(o, 1, 'text-white'));
			var i = l(o, 2),
				H = c(i, !0);
			(m(i),
				m(e),
				y(
					(J, K) => {
						(ee(e, 'aria-label', J), T(H, K));
					},
					[() => B(), () => B()]
				),
				h(a, s));
		};
		L(E, (a) => {
			t(f).length === 0 && a(G);
		});
	}
	(Y(
		p,
		() => t(r),
		(a) => n(r, a)
	),
		h(F, P),
		W());
}
X(['change', 'mouseover', 'mouseout']);
export { ve as component };
//# sourceMappingURL=14.B64fhkHd.js.map
