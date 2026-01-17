import { i as p } from '../chunks/zi73tRJP.js';
import {
	p as ht,
	b as c,
	d as ve,
	f as K,
	g as e,
	a as bt,
	t as b,
	r as t,
	x as Yt,
	s as r,
	u as g,
	c as a,
	n as Ft,
	z as yt
} from '../chunks/DrlZFkx8.js';
import { c as mt, a as i, f as l, s as m, d as Ot, b as Ea, e as ia } from '../chunks/CTjXDULS.js';
import { e as Nt, i as Fa } from '../chunks/BXe5mj2j.js';
import { c as Tt } from '../chunks/7bh91wXp.js';
import { s as $t, c as _, b as u, a as xe, d as Pt, r as Mt, h as da } from '../chunks/MEFvoR_D.js';
import { b as It } from '../chunks/D4QnGYgQ.js';
import { b as Rt } from '../chunks/YQp2a1pQ.js';
import { p as Dt, g as At } from '../chunks/C9E6SjbS.js';
import {
	b2 as va,
	b3 as Da,
	b4 as Oa,
	b5 as Ta,
	b6 as qt,
	b7 as ja,
	b8 as _a,
	b9 as Kt,
	ba as Ia,
	bb as $a,
	bc as Ra,
	bd as fa,
	be as ua,
	bf as Qt,
	bg as pa,
	bh as Xt,
	bi as ma,
	bj as oa,
	bk as na,
	bl as ea,
	bm as ha,
	bn as ba,
	s as wa,
	bo as Na,
	bp as Ua,
	bq as St,
	br as qa,
	t as Ba,
	bs as za,
	bt as Ga,
	bu as Ha,
	bv as Ya,
	bw as Wa,
	bx as Za,
	by as Va,
	bz as Ja,
	bA as Ka,
	bB as Qa,
	bC as Xa,
	bD as er,
	bE as tr,
	bF as ar,
	bG as rr
} from '../chunks/N8Jg0v49.js';
import { o as sa } from '../chunks/CMZtchEj.js';
import { p as N } from '../chunks/DePHBZW_.js';
import { S as la } from '../chunks/Du7BI3HQ.js';
import { a as Bt } from '../chunks/BEiD40NV.js';
import { d as ca, g as or } from '../chunks/DHPSYX_z.js';
import { d as nr, e as zt } from '../chunks/C3o2Q3i7.js';
import { p as ya } from '../chunks/CxX94NXM.js';
import { F as Gt, l as ir, f as sr, r as lr, s as cr } from '../chunks/n4ph2YWf.js';
import { a as ka, S as Ca } from '../chunks/B9MNxn3G.js';
import { F as _t } from '../chunks/DE21BT69.js';
import { t as Ut, f as ta, s as dr } from '../chunks/0XeaN6pZ.js';
import { t as lt, a7 as jt } from '../chunks/C-hhfhAN.js';
import { s as La } from '../chunks/BRE7FZu4.js';
import { g as aa, l as ra } from '../chunks/7IKENDK9.js';
import { l as vr } from '../chunks/BvngfGKt.js';
import { V as fr } from '../chunks/DsmWyVe_.js';
import { g as Lt } from '../chunks/DvhDKI5Z.js';
import { l as ga } from '../chunks/BKIh0tuc.js';
import { M as Et } from '../chunks/BqfWDWTg.js';
import { P as ur } from '../chunks/Kpla-k0W.js';
var pr = l('<div class="confetti svelte-apss0"></div>'),
	mr = l('<div></div>');
function xa(Je, v) {
	ht(v, !0);
	const k = N(v, 'size', 3, 10),
		x = N(v, 'x', 19, () => [-0.5, 0.5]),
		j = N(v, 'y', 19, () => [0.25, 1]),
		W = N(v, 'duration', 3, 2e3),
		ae = N(v, 'infinite', 3, !1),
		S = N(v, 'delay', 19, () => [0, 50]),
		L = N(v, 'colorRange', 19, () => [0, 360]),
		I = N(v, 'colorArray', 19, () => []),
		s = N(v, 'amount', 3, 50),
		ne = N(v, 'iterationCount', 3, 1),
		Z = N(v, 'fallDistance', 3, '100px'),
		B = N(v, 'rounded', 3, !1),
		je = N(v, 'cone', 3, !1),
		Ie = N(v, 'noGravity', 3, !1),
		We = N(v, 'xSpread', 3, 0.15),
		qe = N(v, 'destroyOnComplete', 3, !0),
		ke = N(v, 'disableForReducedMotion', 3, !1);
	let $e = ve(!1);
	sa(() => {
		!qe() || ae() || typeof ne() == 'string' || setTimeout(() => c($e, !0), (W() + S()[1]) * ne());
	});
	function te(Be, Xe) {
		return Math.random() * (Xe - Be) + Be;
	}
	function Ke() {
		return I().length ? I()[Math.round(Math.random() * (I().length - 1))] : `hsl(${Math.round(te(L()[0], L()[1]))}, 75%, 50%)`;
	}
	var _e = mt(),
		he = K(_e);
	{
		var Ze = (Be) => {
			var Xe = mr();
			let Se;
			(Nt(
				Xe,
				21,
				() => ({ length: s() }),
				Fa,
				(T, ze) => {
					var G = pr();
					(b(
						(A, Ge, Re, O, fe, Ne, He, Pe, nt, ge, at) =>
							$t(
								G,
								`
        --color: ${A ?? ''};
        --skew: ${Ge ?? ''}deg,${Re ?? ''}deg;
        --rotation-xyz: ${O ?? ''}, ${fe ?? ''}, ${Ne ?? ''};
        --rotation-deg: ${He ?? ''}deg;
        --translate-y-multiplier: ${Pe ?? ''};
        --translate-x-multiplier: ${nt ?? ''};
        --scale: ${ge ?? ''};
        --transition-delay: ${at ?? ''}ms;
        --transition-duration: ${ae() ? `calc(${W()}ms * var(--scale))` : `${W()}ms`};`
							),
						[
							Ke,
							() => te(-45, 45),
							() => te(-45, 45),
							() => te(-10, 10),
							() => te(-10, 10),
							() => te(-10, 10),
							() => te(0, 360),
							() => te(j()[0], j()[1]),
							() => te(x()[0], x()[1]),
							() => 0.1 * te(2, 10),
							() => te(S()[0], S()[1])
						]
					),
						i(T, G));
				}
			),
				t(Xe),
				b(() => {
					((Se = _(Xe, 1, 'confetti-holder svelte-apss0', null, Se, { rounded: B(), cone: je(), 'no-gravity': Ie(), 'reduced-motion': ke() })),
						$t(
							Xe,
							`
    --fall-distance: ${Z() ?? ''};
    --size: ${k() ?? ''}px;
    --x-spread: ${1 - We()};
    --transition-iteration-count: ${(ae() ? 'infinite' : ne()) ?? ''};`
						));
				}),
				i(Be, Xe));
		};
		p(he, (Be) => {
			e($e) || Be(Ze);
		});
	}
	(i(Je, _e), bt());
}
var gr = l('<div class="pointer-events-none fixed inset-0 z-50 flex justify-center"><!></div>'),
	xr = l(
		'<div class="pointer-events-none fixed inset-0 z-50 flex justify-center"><!></div> <p class="absolute -top-28 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-error-500"> </p> <p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-5xl font-bold text-error-500"> </p>',
		1
	),
	_r = l(
		`<div class="absolute -top-28 left-1/2 -translate-x-1/2 -translate-y-1/2"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div> <p class="absolute left-1/2 top-28 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-4xl font-bold text-pink-500">Happy Valentine's Day</p>`,
		3
	),
	hr = l(
		'<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon> <iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div>',
		2
	),
	br = l(
		'<div class="absolute -top-24 left-1/2 -translate-x-1/2 -translate-y-1/2"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div>',
		2
	),
	wr = l('<img src="/seasons/Halloween.avif" alt="Spider" class="absolute -bottom-[200px] left-1/2 -translate-x-1/2 -translate-y-1/2"/>'),
	yr = l('<img src="/seasons/SantaHat.avif" alt="Santa hat" class="absolute -right-[105px] -top-14 h-20 w-20 -translate-x-1/2 -translate-y-1/2"/>'),
	kr = l('<!> <!> <!> <!> <!> <!>', 1),
	Cr = l(
		'<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div> <p class="absolute left-[-40px] top-[-50px] justify-center whitespace-nowrap text-2xl font-bold text-red-600"> </p>',
		3
	),
	Lr = l(
		'<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div>',
		2
	),
	Sr = l('<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon></iconify-icon></div>', 2),
	Pr = l(
		'<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div>',
		2
	),
	Mr = l('<!> <!> <!> <!>', 1),
	Ar = l(
		'<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div> <p class="absolute -left-[10px] top-[170px] justify-center whitespace-nowrap text-3xl font-bold italic text-yellow-600"> </p>',
		3
	),
	Er = l(
		'<div class="absolute inset-0 flex"><div class="h-full w-full translate-y-8 bg-linear-to-b from-red-300/80 via-red-400/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-12 bg-linear-to-b from-yellow-200/80 via-yellow-300/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-8 bg-linear-to-b from-green-300/80 via-green-400/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-12 bg-linear-to-b from-cyan-300/80 via-cyan-400/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-8 bg-linear-to-b from-blue-300/80 via-blue-400/80 to-transparent blur-xl"></div> <div class="h-full w-full translate-y-12 bg-linear-to-b from-purple-300/80 via-purple-400/80 to-transparent blur-xl"></div></div> <div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon> <iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div> <p class="absolute -left-[30px] top-[170px] justify-center bg-linear-to-br from-pink-500 to-violet-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"> </p>',
		3
	),
	Fr = l(
		'<div class="absolute left-1/2 top-[-50px] -translate-x-1/2 justify-center"><iconify-icon></iconify-icon> <iconify-icon></iconify-icon> <iconify-icon></iconify-icon></div> <p class="absolute -left-[30px] top-[170px] justify-center text-nowrap bg-linear-to-br from-pink-500 to-warning-500 box-decoration-clone bg-clip-text text-4xl font-bold text-transparent"> </p>',
		3
	),
	Dr = l('<!> <!> <!>', 1),
	Or = l('<!> <!> <!>', 1),
	Tr = l('<!> <!>', 1);
function jr(Je, v) {
	ht(v, !0);
	function k(w, n, H) {
		const se = Math.floor((w - 2e3) * 12.3685 + (n - 1)),
			y = se / 1236.85,
			o = 245155009766e-5 + 29.530588861 * se + 15437e-8 * y * y - 15e-8 * y * y * y + 73e-11 * y * y * y * y,
			F = Math.floor(o + 0.5) + 32044,
			Y = Math.floor((4 * F + 3) / 146097),
			J = F - Math.floor((146097 * Y) / 4),
			re = Math.floor((4 * J + 3) / 1461),
			pe = J - Math.floor((1461 * re) / 4),
			ie = Math.floor((5 * pe + 2) / 153),
			be = pe - Math.floor((153 * ie + 2) / 5) + 1,
			Ce = ie + 3 - 12 * Math.floor(ie / 10),
			et = 100 * Y + re - 4800 + Math.floor(ie / 10);
		return new Date(et, Ce - 1, be);
	}
	function x(w, n, H) {
		const se = k(w, n),
			y = new Date(se);
		return (y.setDate(y.getDate() + 15), y);
	}
	function j(w) {
		const n = k(w, 1);
		return n.getMonth() === 0 && n.getDate() < 21 ? k(w, 2) : n.getMonth() === 1 && n.getDate() > 20 ? k(w, 1) : n;
	}
	function W(w) {
		const n = j(w),
			H = new Date(n);
		return (H.setDate(n.getDate() + 29.53 * 4 + 5), H);
	}
	function ae(w) {
		const n = j(w),
			H = new Date(n);
		return (H.setDate(n.getDate() + 29.53 * 7.5), x(H.getFullYear(), H.getMonth() + 1, H.getDate()));
	}
	function S(w) {
		const n = k(w, 10);
		return n.getMonth() === 9 && n.getDate() < 13 ? k(w, 11) : n.getMonth() === 10 && n.getDate() > 14 ? k(w, 10) : n;
	}
	function L(w) {
		const n = x(w, 3);
		return n.getMonth() === 1 && n.getDate() < 25 ? x(w, 3) : n.getMonth() === 2 && n.getDate() > 25 ? x(w, 2) : n;
	}
	function I(w) {
		const n = S(w),
			H = new Date(n);
		return (H.setDate(n.getDate() - 20), H);
	}
	function s(w) {
		const n = Math.floor,
			H = w % 19,
			se = n(w / 100),
			y = (se - n(se / 4) - n((8 * se + 13) / 25) + 19 * H + 15) % 30,
			o = y - n(y / 28) * (1 - n(29 / (y + 1)) * n((21 - H) / 11)),
			E = (w + n(w / 4) + o + 2 - se + n(se / 4)) % 7,
			F = o - E,
			Y = 3 + n((F + 40) / 44),
			J = F + 28 - 31 * n(Y / 4);
		return new Date(w, Y - 1, J);
	}
	function ne(w) {
		const n = w.getMonth();
		return n === 2 || n === 3;
	}
	function Z(w, n, H) {
		return w >= n && w <= H;
	}
	let B = Yt(new Date()),
		je = g(() => B.getFullYear()),
		Ie = g(() => ({
			chineseNewYear: j(e(je)),
			dragonBoatFestival: W(e(je)),
			midAutumnFestival: ae(e(je)),
			diwali: S(e(je)),
			holi: L(e(je)),
			navratri: I(e(je)),
			easter: s(e(je))
		})),
		We = g(() => e(Ie).chineseNewYear),
		qe = g(() => e(Ie).midAutumnFestival),
		ke = g(() => e(Ie).dragonBoatFestival),
		$e = g(() => e(Ie).diwali),
		te = g(() => e(Ie).holi),
		Ke = g(() => e(Ie).navratri),
		_e = g(() => e(Ie).easter),
		he = g(() => {
			const w = new Date(e(_e));
			return (w.setDate(e(_e).getDate() + 6), w);
		}),
		Ze = g(() => B.getMonth() === 0 && B.getDate() === 1),
		Be = g(() => B.getMonth() === 1 && B.getDate() === 14),
		Xe = g(() => B.getMonth() === 4 && B.getDate() === 1),
		Se = g(() => B.getMonth() === 9 && B.getDate() === 31),
		T = g(() => B.getMonth() === 11 && (B.getDate() === 24 || B.getDate() === 25)),
		ze = g(() => Z(B, e(_e), e(he))),
		G = g(() => Math.abs(B.getTime() - e(We).getTime()) < 4320 * 60 * 1e3),
		A = g(() => B.toDateString() === e(qe).toDateString()),
		Ge = g(() => B.toDateString() === e(ke).toDateString()),
		Re = g(() => ne(B)),
		O = g(() => Math.abs(B.getTime() - e($e).getTime()) < 7200 * 60 * 1e3),
		fe = g(() => Math.abs(B.getTime() - e(te).getTime()) < 2880 * 60 * 1e3),
		Ne = g(() => Math.abs(B.getTime() - e(Ke).getTime()) < 12960 * 60 * 1e3),
		He = g(() => Dt.SEASONS === !0),
		Pe = g(() => Dt.SEASON_REGION);
	var nt = Tr(),
		ge = K(nt);
	{
		var at = (w) => {
			var n = gr(),
				H = a(n);
			(xa(H, { x: [-0.5, 0.5], y: [0.25, 1], delay: [0, 2e3], duration: 3500, amount: 200, fallDistance: '100vh' }), t(n), i(w, n));
		};
		p(ge, (w) => {
			e(Ze) && w(at);
		});
	}
	var ct = r(ge, 2);
	{
		var dt = (w) => {
			var n = Or(),
				H = K(n);
			{
				var se = (Y) => {
					var J = kr(),
						re = K(J);
					{
						var pe = (C) => {
							var U = xr(),
								q = K(U),
								oe = a(q);
							(xa(oe, { x: [-0.5, 0.5], y: [0.25, 1], delay: [0, 2e3], duration: 3500, amount: 200, fallDistance: '100vh' }), t(q));
							var le = r(q, 2),
								Qe = a(le, !0);
							t(le);
							var ut = r(le, 2),
								rt = a(ut, !0);
							(t(ut),
								b(
									(vt, tt) => {
										(m(Qe, vt), m(rt, tt));
									},
									[() => va(), () => B.getFullYear()]
								),
								i(C, U));
						};
						p(re, (C) => {
							e(Ze) && C(pe);
						});
					}
					var ie = r(re, 2);
					{
						var be = (C) => {
							var U = _r(),
								q = K(U),
								oe = a(q);
							(u(oe, 'icon', 'mdi:heart'), u(oe, 'width', '40'), _(oe, 1, 'absolute -left-[60px] -top-[10px] text-red-600'));
							var le = r(oe, 2);
							(u(le, 'icon', 'mdi:cards-heart'),
								u(le, 'width', '40'),
								_(le, 1, 'absolute -right-[60px] -top-[20px] text-pink-500'),
								t(q),
								Ft(2),
								i(C, U));
						};
						p(ie, (C) => {
							e(Be) && C(be);
						});
					}
					var Ce = r(ie, 2);
					{
						var et = (C) => {
							var U = hr(),
								q = a(U);
							(u(q, 'icon', 'mdi:egg-easter'), u(q, 'width', '40'), _(q, 1, 'absolute -top-[18px] right-2 -rotate-25 text-tertiary-500'));
							var oe = r(q, 2);
							(u(oe, 'icon', 'game-icons:easter-egg'), u(oe, 'width', '40'), _(oe, 1, 'absolute -top-[25px] left-0 rotate-12 text-yellow-500'));
							var le = r(oe, 2);
							(u(le, 'icon', 'game-icons:high-grass'), u(le, 'width', '40'), _(le, 1, 'absolute -top-[5px] right-10 -rotate-32 text-green-500'));
							var Qe = r(le, 2);
							(u(Qe, 'icon', 'mdi:easter'), u(Qe, 'width', '70'), _(Qe, 1, 'absolute -top-[31px] left-8 rotate-32 text-red-500'), t(U), i(C, U));
						};
						p(Ce, (C) => {
							e(ze) && C(et);
						});
					}
					var ue = r(Ce, 2);
					{
						var me = (C) => {
							var U = br(),
								q = a(U);
							(u(q, 'icon', 'noto:tulip'), u(q, 'width', '60'), _(q, 1, 'absolute -left-[16px] -top-[45px] rotate-12'));
							var oe = r(q, 2);
							(u(oe, 'icon', 'fluent-emoji:tulip'), u(oe, 'width', '40'), _(oe, 1, 'absolute -top-[14px] right-[20px] -rotate-12'));
							var le = r(oe, 2);
							(u(le, 'icon', 'noto:sunflower'), u(le, 'width', '50'), _(le, 1, 'absolute -top-[16px] left-10 rotate-6'), t(U), i(C, U));
						};
						p(ue, (C) => {
							e(Xe) && C(me);
						});
					}
					var $ = r(ue, 2);
					{
						var R = (C) => {
							var U = wr();
							i(C, U);
						};
						p($, (C) => {
							e(Se) && C(R);
						});
					}
					var P = r($, 2);
					{
						var M = (C) => {
							var U = yr();
							i(C, U);
						};
						p(P, (C) => {
							e(T) && C(M);
						});
					}
					i(Y, J);
				};
				p(H, (Y) => {
					e(Pe) === 'Western_Europe' && Y(se);
				});
			}
			var y = r(H, 2);
			{
				var o = (Y) => {
					var J = Mr(),
						re = K(J);
					{
						var pe = ($) => {
							var R = Cr(),
								P = K(R),
								M = a(P);
							(u(M, 'icon', 'noto:lantern'), u(M, 'width', '40'), _(M, 1, 'absolute -left-[60px] -top-[20px] text-red-600'));
							var C = r(M, 2);
							(u(C, 'icon', 'noto:dragon-face'), u(C, 'width', '40'), _(C, 1, 'absolute -right-[60px] -top-[20px]'), t(P));
							var U = r(P, 2),
								q = a(U, !0);
							(t(U), b((oe) => m(q, oe), [() => va()]), i($, R));
						};
						p(re, ($) => {
							e(G) && $(pe);
						});
					}
					var ie = r(re, 2);
					{
						var be = ($) => {
							var R = Lr(),
								P = a(R);
							(u(P, 'icon', 'noto:cherry-blossom'), u(P, 'width', '40'), _(P, 1, 'absolute -left-[60px] -top-[20px] text-pink-400'));
							var M = r(P, 2);
							(u(M, 'icon', 'noto:cherry-blossom'), u(M, 'width', '60'), _(M, 1, 'absolute -right-[140px] top-[40px] text-pink-300'));
							var C = r(M, 2);
							(u(C, 'icon', 'noto:white-flower'), u(C, 'width', '60'), _(C, 1, 'absolute -left-[140px] top-[40px] text-pink-300'), t(R), i($, R));
						};
						p(ie, ($) => {
							e(Re) && $(be);
						});
					}
					var Ce = r(ie, 2);
					{
						var et = ($) => {
							var R = Sr(),
								P = a(R);
							(u(P, 'icon', 'noto:dragon'), u(P, 'width', '100'), _(P, 1, 'absolute left-0 -top-[35px] rotate-12'), t(R), i($, R));
						};
						p(Ce, ($) => {
							e(Ge) && $(et);
						});
					}
					var ue = r(Ce, 2);
					{
						var me = ($) => {
							var R = Pr(),
								P = a(R);
							(u(P, 'icon', 'noto:full-moon'), u(P, 'width', '80'), _(P, 1, 'absolute -left-[100px] -top-[10px]'));
							var M = r(P, 2);
							(u(M, 'icon', 'noto:moon-cake'), u(M, 'width', '60'), _(M, 1, 'absolute -right-[120px] top-[220px]'), t(R), i($, R));
						};
						p(ue, ($) => {
							e(A) && $(me);
						});
					}
					i(Y, J);
				};
				p(y, (Y) => {
					e(Pe) === 'East_Asia' && Y(o);
				});
			}
			var E = r(y, 2);
			{
				var F = (Y) => {
					var J = Dr(),
						re = K(J);
					{
						var pe = (ue) => {
							var me = Ar(),
								$ = K(me),
								R = a($);
							(u(R, 'icon', 'noto:diya-lamp'), u(R, 'width', '70'), _(R, 1, 'absolute left-[120px] top-[190px]'));
							var P = r(R, 2);
							(u(P, 'icon', 'noto:sparkles'), u(P, 'width', '50'), _(P, 1, 'absolute -right-[160px] top-[120px] text-yellow-500'));
							var M = r(P, 2);
							(u(M, 'icon', 'noto:sparkles'), u(M, 'width', '50'), _(M, 1, 'absolute -right-[200px] top-[100px] rotate-90 text-warning-500'), t($));
							var C = r($, 2),
								U = a(C, !0);
							(t(C), b((q) => m(U, q), [() => Da()]), i(ue, me));
						};
						p(re, (ue) => {
							e(O) && ue(pe);
						});
					}
					var ie = r(re, 2);
					{
						var be = (ue) => {
							var me = Er(),
								$ = r(K(me), 2),
								R = a($);
							(u(R, 'icon', 'noto:balloon'), u(R, 'width', '40'), _(R, 1, 'absolute -left-[60px] -top-[20px] text-purple-500'));
							var P = r(R, 2);
							(u(P, 'icon', 'noto:balloon'), u(P, 'width', '50'), _(P, 1, 'absolute right-[60px] top-[20px] text-green-500'));
							var M = r(P, 2);
							(u(M, 'icon', 'game-icons:powder'), u(M, 'width', '50'), _(M, 1, 'absolute -right-[150px] top-[220px] text-primary-500'));
							var C = r(M, 2);
							(u(C, 'icon', 'game-icons:powder'),
								u(C, 'width', '30'),
								_(C, 1, 'absolute -right-[120px] top-[220px] -rotate-12 text-warning-500'),
								t($));
							var U = r($, 2),
								q = a(U, !0);
							(t(U), b((oe) => m(q, oe), [() => Oa()]), i(ue, me));
						};
						p(ie, (ue) => {
							e(fe) && ue(be);
						});
					}
					var Ce = r(ie, 2);
					{
						var et = (ue) => {
							var me = Fr(),
								$ = K(me),
								R = a($);
							(u(R, 'icon', 'noto:prayer-beads'), u(R, 'width', '40'), _(R, 1, 'absolute -left-[100px] top-[30px]'));
							var P = r(R, 2);
							(u(P, 'icon', 'token-branded:starl'), u(P, 'width', '40'), _(P, 1, 'absolute -right-[60px] -top-[20px]'));
							var M = r(P, 2);
							(u(M, 'icon', 'token-branded:starl'), u(M, 'width', '60'), _(M, 1, 'absolute -right-[160px] top-[50px]'), t($));
							var C = r($, 2),
								U = a(C, !0);
							(t(C), b((q) => m(U, q), [() => Ta()]), i(ue, me));
						};
						p(Ce, (ue) => {
							e(Ne) && ue(et);
						});
					}
					i(Y, J);
				};
				p(E, (Y) => {
					e(Pe) === 'South_Asia' && Y(F);
				});
			}
			i(w, n);
		};
		p(ct, (w) => {
			e(He) && w(dt);
		});
	}
	(i(Je, nt), bt());
}
var Ir = l(
	'<div><div role="button" class="flex cursor-pointer flex-col items-center"><div class="relative w-max rounded-full border-4 border-[#2b2f31] p-3"><svg class="aspect-square h-12 fill-[#2b2f31]" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 50 50"><path d="M25 3C19.464844 3 15 7.464844 15 13L15 19C15 22.238281 16.585938 25.144531 19 26.96875L19 31.5C19 31.605469 18.980469 31.695313 18.71875 31.9375C18.457031 32.179688 17.992188 32.503906 17.375 32.8125C16.144531 33.429688 14.367188 34.0625 12.5625 34.9375C10.757813 35.8125 8.886719 36.925781 7.4375 38.53125C5.988281 40.136719 5 42.289063 5 45L5 46L45 46L45 45C45 42.265625 44.011719 40.105469 42.5625 38.5C41.113281 36.894531 39.242188 35.800781 37.4375 34.9375C35.632813 34.074219 33.851563 33.421875 32.625 32.8125C32.011719 32.507813 31.539063 32.210938 31.28125 31.96875C31.023438 31.726563 31 31.625 31 31.5L31 26.96875C33.414063 25.144531 35 22.238281 35 19L35 13C35 7.464844 30.535156 3 25 3 Z M 25 5C29.464844 5 33 8.535156 33 13L33 19C33 21.757813 31.558594 24.242188 29.4375 25.65625L29 25.96875L29 31.5C29 32.273438 29.398438 32.957031 29.90625 33.4375C30.414063 33.917969 31.050781 34.277344 31.75 34.625C33.148438 35.320313 34.867188 35.9375 36.5625 36.75C38.257813 37.5625 39.886719 38.542969 41.0625 39.84375C42.039063 40.921875 42.605469 42.304688 42.8125 44L7.1875 44C7.394531 42.324219 7.964844 40.957031 8.9375 39.875C10.113281 38.570313 11.742188 37.574219 13.4375 36.75C15.132813 35.925781 16.855469 35.289063 18.25 34.59375C18.945313 34.246094 19.589844 33.878906 20.09375 33.40625C20.597656 32.933594 21 32.269531 21 31.5L21 25.96875L20.5625 25.65625C18.441406 24.242188 17 21.757813 17 19L17 13C17 8.535156 20.535156 5 25 5Z"></path></svg></div> <p class="text-center font-semibold uppercase text-black!"> </p></div></div>'
);
function $r(Je, v) {
	ht(v, !0);
	let k = N(v, 'show', 11, !0),
		x = N(v, 'disabled', 3, !1),
		j = N(v, 'onClick', 3, (Z) => {});
	function W(Z) {
		x() || (Z.stopPropagation(), j()(Z));
	}
	function ae(Z) {
		x() || (Z.key === 'Enter' && (Z.stopPropagation(), j()(Z)));
	}
	var S = Ir();
	let L;
	var I = a(S);
	((I.__click = W), (I.__keydown = ae));
	var s = r(a(I), 2),
		ne = a(s, !0);
	(t(s),
		t(I),
		t(S),
		b(
			(Z) => {
				((L = _(
					S,
					1,
					'icon dark:text-dark absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] transition-all duration-300 svelte-23owe9',
					null,
					L,
					{ hide: !k(), 'pointer-events-none': !k() || x(), 'opacity-50': x() }
				)),
					xe(I, 'tabindex', x() ? -1 : 0),
					m(ne, Z));
			},
			[() => qt()]
		),
		i(Je, S),
		bt());
}
Ot(['click', 'keydown']);
var Rr = l('<span class="absolute inset-0 flex items-center justify-center text-[10px] font-bold sm:text-xs"> </span>'),
	Nr = l(
		'<div class="absolute inset-0 bg-linear-to-r from-transparent via-white/20 to-transparent opacity-60 transition-transform duration-500" aria-hidden="true"></div>'
	),
	Ur = l(
		'<button type="button" class="text-xs text-primary-500 hover:text-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 rounded" aria-controls="password-requirements"> </button>'
	),
	qr = l('<div class="flex items-center gap-2"><span class="text-xs text-gray-500 dark:text-gray-400">Strength</span> <!></div>'),
	Br = l('<span role="status" aria-live="polite"> </span>'),
	zr = l('<div></div>'),
	Gr = l(
		'<div id="password-requirements" class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800"><h4 class="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">Password Requirements</h4> <ul class="space-y-1 text-xs" role="list"><li class="flex items-center gap-2"><span aria-hidden="true"> </span> <span> </span></li> <li class="flex items-center gap-2"><span aria-hidden="true"> </span> <span>One uppercase letter</span></li> <li class="flex items-center gap-2"><span aria-hidden="true"> </span> <span>One lowercase letter</span></li> <li class="flex items-center gap-2"><span aria-hidden="true"> </span> <span>One number</span></li> <li class="flex items-center gap-2"><span aria-hidden="true"> </span> <span>One special character (!@#$%^&*)</span></li></ul></div>'
	),
	Hr = l(
		'<div class="relative -mt-1 w-full space-y-2" role="region" aria-label="Password strength indicator"><div class="relative h-4 w-full overflow-hidden rounded-sm bg-gray-200 dark:bg-gray-700"><div role="progressbar"><!> <span class="sr-only" aria-live="polite" aria-atomic="true"> </span></div> <!></div> <div class="flex min-h-7 w-full items-center justify-between gap-2"><div class="min-w-0 flex-1"><!></div> <div class="flex shrink-0 gap-1" role="presentation" aria-hidden="true"></div></div> <!></div>'
	);
function Sa(Je, v) {
	ht(v, !0);
	const k = N(v, 'password', 3, ''),
		x = N(v, 'confirmPassword', 3, ''),
		j = N(v, 'showRequirements', 3, !1),
		W = Dt?.PASSWORD_LENGTH ?? 8,
		ae = W + 3,
		S = ae + 4;
	let L = ve(!1),
		I = ve(!1);
	const s = g(() => {
		const G = e(Ie);
		return {
			hasUpper: /[A-Z]/.test(G),
			hasLower: /[a-z]/.test(G),
			hasNumber: /\d/.test(G),
			hasSpecial: /[^A-Za-z0-9]/.test(G),
			hasMinLength: G.length >= W
		};
	});
	function ne(G, A) {
		if (G.length === 0) return 0;
		let Ge = 0;
		G.length >= W && G.length < ae ? (Ge = 1) : G.length >= ae && G.length < S ? (Ge = 2) : G.length >= S && (Ge = 3);
		const Re = Object.entries(A).filter(([O, fe]) => O !== 'hasMinLength' && fe).length;
		return ((Ge += Math.floor(Re / 2)), Math.min(Ge, 5));
	}
	const Z = { 0: 'Too Short', 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong', 5: 'Very Strong' },
		B = {
			0: 'bg-gray-300 text-gray-700 dark:bg-gray-600 dark:text-gray-300',
			1: 'bg-red-500 text-white',
			2: 'bg-orange-500 text-white',
			3: 'bg-yellow-500 text-gray-900',
			4: 'bg-green-600 text-white',
			5: 'bg-green-500 text-white'
		};
	function je(G, A) {
		return A === 0
			? 'bg-gray-200 dark:bg-gray-700'
			: G === 0
				? A >= 1
					? 'bg-red-500'
					: 'bg-gray-200 dark:bg-gray-700'
				: G === 1
					? A >= 2
						? 'bg-yellow-500'
						: 'bg-gray-200 dark:bg-gray-700'
					: A >= 3
						? 'bg-green-500'
						: 'bg-gray-200 dark:bg-gray-700';
	}
	const Ie = g(() => (k().length >= x().length ? k() : x())),
		We = g(() => ne(e(Ie), e(s))),
		qe = g(() => Z[e(We)] || 'Unknown'),
		ke = g(() => B[e(We)] || B[0]),
		$e = g(() => k().length > 0 || x().length > 0),
		te = g(() => Math.min(100, (e(Ie).length / S) * 100)),
		Ke = g(() => k() === x() && x().length > 0 && k().length > 0),
		_e = g(() => x().length > 0),
		he = g(() => Object.values(e(s)).filter(Boolean).length),
		Ze = g(() => Object.keys(e(s)).length),
		Be = g(() => () => {
			const G = [`Password strength: ${e(qe)}`];
			return (e(_e) && G.push(e(Ke) ? 'Passwords match' : 'Passwords do not match'), G.push(`${e(he)} of ${e(Ze)} requirements met`), G.join('. '));
		});
	function Xe() {
		c(I, !e(I));
	}
	sa(() => {
		const G = window.matchMedia('(prefers-reduced-motion: reduce)');
		c(L, G.matches, !0);
		const A = (Ge) => {
			c(L, Ge.matches, !0);
		};
		return (G.addEventListener('change', A), () => G.removeEventListener('change', A));
	});
	var Se = mt(),
		T = K(Se);
	{
		var ze = (G) => {
			var A = Hr(),
				Ge = a(A),
				Re = a(Ge);
			(xe(Re, 'aria-valuemin', 0), xe(Re, 'aria-valuemax', 100));
			var O = a(Re);
			{
				var fe = (y) => {
					var o = Rr(),
						E = a(o, !0);
					(t(o),
						b(() => m(E, e(qe))),
						Ut(
							3,
							o,
							() => ta,
							() => ({ duration: e(L) ? 0 : 200 })
						),
						i(y, o));
				};
				p(O, (y) => {
					e(te) > 25 && y(fe);
				});
			}
			var Ne = r(O, 2),
				He = a(Ne, !0);
			(t(Ne), t(Re));
			var Pe = r(Re, 2);
			{
				var nt = (y) => {
					var o = Nr();
					(b(() => $t(o, `transform: translateX(${e(te) - 20}%);`)), i(y, o));
				};
				p(Pe, (y) => {
					!e(L) && e(te) > 0 && e(te) < 100 && y(nt);
				});
			}
			t(Ge);
			var ge = r(Ge, 2),
				at = a(ge),
				ct = a(at);
			{
				var dt = (y) => {
						var o = qr(),
							E = r(a(o), 2);
						{
							var F = (Y) => {
								var J = Ur();
								J.__click = Xe;
								var re = a(J);
								(t(J),
									b(() => {
										(xe(J, 'aria-expanded', e(I)), m(re, `${e(I) ? 'Hide' : 'Show'} requirements`));
									}),
									i(Y, J));
							};
							p(E, (Y) => {
								j() && Y(F);
							});
						}
						(t(o), i(y, o));
					},
					w = (y) => {
						var o = Br();
						let E;
						var F = a(o, !0);
						(t(o),
							b(() => {
								((E = _(o, 1, `text-xs transition-colors ${e(L) ? 'duration-0' : 'duration-200'}`, null, E, {
									'text-red-500': !e(Ke),
									'text-green-500': e(Ke)
								})),
									m(F, e(Ke) ? '✓ Passwords match' : '✗ Passwords do not match'));
							}),
							Ut(
								3,
								o,
								() => ta,
								() => ({ duration: e(L) ? 0 : 200 })
							),
							i(y, o));
					};
				p(ct, (y) => {
					e(_e) ? y(w, !1) : y(dt);
				});
			}
			t(at);
			var n = r(at, 2);
			(Nt(
				n,
				20,
				() => [0, 1, 2],
				(y) => y,
				(y, o) => {
					var E = zr();
					(b(
						(F) => {
							(_(E, 1, `h-1.5 w-8 rounded-full transition-all ${e(L) ? 'duration-0' : 'duration-400 ease-out'} ${F ?? ''}`),
								$t(E, `transform: scale(${o < e(We) ? 1 : 0.8}); opacity: ${o <= e(We) ? 1 : 0.3};`));
						},
						[() => je(o, e(We))]
					),
						i(y, E));
				}
			),
				t(n),
				t(ge));
			var H = r(ge, 2);
			{
				var se = (y) => {
					var o = Gr(),
						E = r(a(o), 2),
						F = a(E),
						Y = a(F),
						J = a(Y, !0);
					t(Y);
					var re = r(Y, 2),
						pe = a(re);
					(t(re), t(F));
					var ie = r(F, 2),
						be = a(ie),
						Ce = a(be, !0);
					t(be);
					var et = r(be, 2);
					t(ie);
					var ue = r(ie, 2),
						me = a(ue),
						$ = a(me, !0);
					t(me);
					var R = r(me, 2);
					t(ue);
					var P = r(ue, 2),
						M = a(P),
						C = a(M, !0);
					t(M);
					var U = r(M, 2);
					t(P);
					var q = r(P, 2),
						oe = a(q),
						le = a(oe, !0);
					t(oe);
					var Qe = r(oe, 2);
					(t(q),
						t(E),
						t(o),
						b(() => {
							(_(
								Y,
								1,
								`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${e(s).hasMinLength ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}`
							),
								m(J, e(s).hasMinLength ? '✓' : '○'),
								_(re, 1, Pt(e(s).hasMinLength ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400')),
								m(pe, `At least ${W ?? ''} characters`),
								_(
									be,
									1,
									`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${e(s).hasUpper ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}`
								),
								m(Ce, e(s).hasUpper ? '✓' : '○'),
								_(et, 1, Pt(e(s).hasUpper ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400')),
								_(
									me,
									1,
									`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${e(s).hasLower ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}`
								),
								m($, e(s).hasLower ? '✓' : '○'),
								_(R, 1, Pt(e(s).hasLower ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400')),
								_(
									M,
									1,
									`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${e(s).hasNumber ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}`
								),
								m(C, e(s).hasNumber ? '✓' : '○'),
								_(U, 1, Pt(e(s).hasNumber ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400')),
								_(
									oe,
									1,
									`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${e(s).hasSpecial ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600 dark:bg-gray-600 dark:text-gray-400'}`
								),
								m(le, e(s).hasSpecial ? '✓' : '○'),
								_(Qe, 1, Pt(e(s).hasSpecial ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400')));
						}),
						Ut(
							3,
							o,
							() => dr,
							() => ({ duration: e(L) ? 0 : 200 })
						),
						i(y, o));
				};
				p(H, (y) => {
					j() && e(I) && y(se);
				});
			}
			(t(A),
				b(
					(y, o, E) => {
						(xe(Re, 'aria-valuenow', y),
							xe(Re, 'aria-label', o),
							_(Re, 1, `h-full rounded-sm transition-all ${e(L) ? 'duration-0' : 'duration-500 ease-out'} ${e(ke) ?? ''}`),
							$t(Re, `width: ${e(te) ?? ''}%;`),
							m(He, E));
					},
					[() => Math.round(e(te)), () => e(Be)(), () => e(Be)()]
				),
				Ut(
					3,
					A,
					() => ta,
					() => ({ duration: e(L) ? 0 : 200 })
				),
				i(G, A));
		};
		p(T, (G) => {
			e($e) && G(ze);
		});
	}
	(i(Je, Se), bt());
}
Ot(['click']);
var Yr = Ea('<path stroke="currentColor" pathLength="1"></path>'),
	Wr = l('<div class="pointer-events-none absolute inset-0"><svg viewBox="0 0 696 316" stroke-linecap="round" fill="transparent"></svg></div>');
function Ht(Je, v) {
	ht(v, !0);
	const k = N(v, 'background', 3, 'white'),
		x = N(v, 'position', 3, 1),
		j = N(v, 'mirrorAnimation', 3, !1),
		W = Array.from({ length: 36 }, (I, s) => ({
			id: s,
			d: `M-${380 - s * 5 * x()} -${189 + s * 6}C-${380 - s * 5 * x()} -${189 + s * 6} -${312 - s * 5 * x()} ${216 - s * 6} ${152 - s * 5 * x()} ${343 - s * 6}C${616 - s * 5 * x()} ${470 - s * 6} ${684 - s * 5 * x()} ${875 - s * 6} ${684 - s * 5 * x()} ${875 - s * 6}`,
			width: 0.05 + s * 0.01,
			duration: 20 + (s % 15) * 0.7,
			baseOpacity: 0.1 + s * 0.03
		}));
	let ae = ve(Yt(W.map(() => ({ pathLength: 0.3, opacity: 0.3, pathOffset: j() ? 1 : 0 }))));
	sa(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		let s;
		const ne = performance.now(),
			Z = (B) => {
				const je = (B - ne) / 1e3;
				(c(
					ae,
					W.map((Ie) => {
						const We = Ie.duration,
							qe = (je / We) % 1,
							ke = 0.5 * (1 - Math.cos(qe * Math.PI * 2)),
							$e = 0.3 + ke * 0.7,
							te = 0.3 + ke * 0.3,
							Ke = j() ? 1 - qe : qe;
						return { pathLength: $e, opacity: te, pathOffset: Ke };
					}),
					!0
				),
					(s = requestAnimationFrame(Z)));
			};
		return ((s = requestAnimationFrame(Z)), () => cancelAnimationFrame(s));
	});
	var S = Wr(),
		L = a(S);
	(Nt(
		L,
		23,
		() => W,
		(I) => I.id,
		(I, s, ne) => {
			const Z = g(() => e(ae)[e(ne)]);
			var B = Yr();
			(b(() => {
				(xe(B, 'd', e(s).d),
					xe(B, 'stroke-width', e(s).width),
					xe(B, 'stroke-opacity', e(Z).opacity),
					xe(B, 'stroke-dasharray', e(Z).pathLength),
					xe(B, 'stroke-dashoffset', e(Z).pathOffset));
			}),
				i(I, B));
		}
	),
		t(L),
		t(S),
		b(() => _(L, 0, `h-full w-full ${k() === 'white' ? 'text-slate-950' : 'text-white'} ${j() ? '-scale-x-100' : ''}`)),
		i(Je, S),
		bt());
}
var Zr = l(
	'<form id="oauth-login" action="?/signInOAuth" method="post" class="flex flex-col items-center justify-center"><button form="oauth-login" type="submit" aria-label="OAuth" class="preset-filled-surface-500 btn w-full sm:w-auto"><iconify-icon></iconify-icon> <p>OAuth</p></button></form>',
	2
);
function Vr(Je, v) {
	ht(v, !0);
	const k = N(v, 'showOAuth', 3, !0);
	let x = ve(!1);
	async function j() {
		if (!e(x)) {
			c(x, !0);
			try {
				const L = new FormData(),
					I = await fetch('?/prefetch', { method: 'POST', body: L }),
					s = nr(await I.text());
				if (s.type === 'success') {
					const ne = s.data?.collection;
					ne?.path && (await ca(ne.path));
				}
			} catch (L) {
				console.error('Prefetch failed:', L);
			}
		}
	}
	var W = mt(),
		ae = K(W);
	{
		var S = (L) => {
			var I = Zr(),
				s = a(I),
				ne = a(s);
			(u(ne, 'icon', 'flat-color-icons:google'),
				u(ne, 'color', 'white'),
				u(ne, 'width', '20'),
				_(ne, 1, 'mt-1'),
				Ft(2),
				t(s),
				t(I),
				ia('mouseenter', s, j),
				i(L, I));
		};
		p(ae, (L) => {
			Dt?.USE_GOOGLE_OAUTH === !0 && k() && L(S);
		});
	}
	(i(Je, W), bt());
}
var Jr = l('<div class="absolute inset-0 z-0 svelte-6xkclf"><!> <!></div>'),
	Kr = l('<div class="lg:-mt-1 svelte-6xkclf"> </div>'),
	Qr = l('<div class="text-2xl lg:-mt-1 lg:text-4xl svelte-6xkclf"> </div>'),
	Xr = l('<div class="lg:-mt-1 svelte-6xkclf"> </div>'),
	eo = l('<span class="invalid text-xs text-error-500 svelte-6xkclf"> </span>'),
	to = l('<span class="invalid text-xs text-error-500 svelte-6xkclf"> </span>'),
	ao = l('<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 invert filter svelte-6xkclf"/>'),
	ro = l(
		'<form id="signin-form" method="POST" action="?/signIn"><!> <!> <!> <!></form> <div class="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-between svelte-6xkclf"><div class="flex w-full justify-between gap-2 sm:w-auto svelte-6xkclf"><button type="submit" form="signin-form" class="preset-filled-surface-500 btn w-full text-white sm:w-auto svelte-6xkclf" data-testid="signin-submit"> <!></button> <!></div> <div class="mt-4 flex w-full justify-between sm:mt-0 sm:w-auto svelte-6xkclf"><button type="button" class="btn preset-outlined-surface-500 w-full text-black sm:w-auto svelte-6xkclf" data-testid="signin-forgot-password"> </button></div></div>',
		1
	),
	oo = l('<div class="mt-1 text-center text-xs text-surface-500 svelte-6xkclf"> </div>'),
	no = l('<img src="/Spinner.svg" alt="Loading.." class="mr-2 h-5 invert filter svelte-6xkclf"/> ', 1),
	io = l('<iconify-icon></iconify-icon> ', 3),
	so = l('<p class="svelte-6xkclf">Enter the 6-digit code from your authenticator app</p>'),
	lo = l('<p class="svelte-6xkclf">Enter one of your 8-character backup codes</p>'),
	co = l(
		'<div class="flex w-full flex-col gap-4 svelte-6xkclf"><div class="text-center svelte-6xkclf"><div class="mb-3 svelte-6xkclf"><iconify-icon></iconify-icon></div> <h3 class="h3 mb-2 svelte-6xkclf"> </h3> <p class="text-sm text-surface-600 dark:text-surface-300 svelte-6xkclf"> </p></div> <div class="flex flex-col gap-3 svelte-6xkclf"><div class="relative svelte-6xkclf"><input type="text" autocomplete="off"/> <!></div> <div class="text-center svelte-6xkclf"><button type="button" class="text-sm text-primary-500 underline hover:text-primary-600 svelte-6xkclf"> </button></div> <div class="flex gap-3 svelte-6xkclf"><button type="button" class="btn preset-tonal -surface-500 flex-1 svelte-6xkclf"><iconify-icon></iconify-icon> </button> <button type="button" class="btn preset-filled-primary-500 flex-1 svelte-6xkclf"><!></button></div> <div class="mt-2 text-center svelte-6xkclf"><div class="text-xs text-surface-500 svelte-6xkclf"><!></div></div></div></div>',
		2
	),
	vo = l('<span class="invalid text-xs text-error-500 svelte-6xkclf"> </span>'),
	fo = l('<span class="invalid text-xs text-error-500 svelte-6xkclf"> </span>'),
	uo = l('<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 invert filter svelte-6xkclf"/>'),
	po = l(
		'<form method="POST" action="?/forgotPW"><!> <!> <!> <div class="mt-4 flex items-center justify-between svelte-6xkclf"><button type="submit" class="preset-filled-surface-500 text-white btn svelte-6xkclf"> <!></button> <button type="button" class="btn-icon preset-filled-surface-500 rounded-full svelte-6xkclf" aria-label="Back"><iconify-icon></iconify-icon></button></div></form>',
		2
	),
	mo = l('<span class="invalid text-xs text-error-500 svelte-6xkclf"> </span>'),
	go = l('<span class="invalid text-xs text-error-500 svelte-6xkclf"> </span>'),
	xo = l('<span class="invalid text-xs text-error-500 svelte-6xkclf"> </span>'),
	_o = l('<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 svelte-6xkclf"/>'),
	ho = l(
		'<form method="POST" action="?/resetPW"><input type="hidden" name="email" class="svelte-6xkclf"/> <input type="hidden" name="token" class="svelte-6xkclf"/> <!> <!> <!> <!> <!> <!> <!> <input type="email" name="email" hidden="" class="svelte-6xkclf"/> <div class="mt-4 flex items-center justify-between svelte-6xkclf"><button type="submit" class="btn preset-filled-surface-500 ml-2 mt-6 text-white svelte-6xkclf"> <!></button> <button type="button" class="preset-filled-surface-500 btn-icon svelte-6xkclf"><iconify-icon></iconify-icon></button></div></form>',
		2
	),
	bo = l(
		'<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden svelte-6xkclf"><!> <div class="absolute left-1/2 top-[20%] hidden -translate-x-1/2 -translate-y-1/2 transform xl:block svelte-6xkclf"><!></div> <div><div class="mb-1 flex flex-row gap-2 svelte-6xkclf"><!> <h1 class="text-3xl font-bold text-black lg:text-4xl svelte-6xkclf"><div class="text-xs text-surface-300 svelte-6xkclf"><!></div> <!></h1></div> <div class="-mt-2 flex items-center justify-end gap-2 text-right text-xs text-error-500 svelte-6xkclf"> <button aria-label="Back" class="btn-icon preset-outlined-secondary-500 rounded-full svelte-6xkclf"><iconify-icon></iconify-icon></button></div> <!> <!> <!> <!></div></div>',
		2
	),
	wo = l('<section role="button"><!> <!></section>');
function yo(Je, v) {
	ht(v, !0);
	const k = N(v, 'active', 11, void 0),
		x = N(v, 'onClick', 3, () => {}),
		j = N(v, 'onPointerEnter', 3, () => {}),
		W = N(v, 'onBack', 3, () => {}),
		ae = N(v, 'firstCollectionPath', 3, '');
	let S = ve(!1),
		L = ve(!1);
	const I = !1;
	let s = ve(null);
	const ne = 1,
		Z = 1,
		B = 2,
		je = 3,
		Ie = 4,
		We = ya.data,
		qe = Yt(window.location.href);
	let ke = ve(!1),
		$e = ve(!1),
		te = ve(!1),
		Ke = ve(''),
		_e = ve(''),
		he = ve(!1),
		Ze = ve(!1),
		Be = ve(!1);
	async function Xe() {
		if (!(e(Be) || !ae())) {
			c(Be, !0);
			try {
				await ca(ae());
			} catch (o) {
				console.error('Prefetch failed:', o);
			}
		}
	}
	const Se = new Gt({ email: '', password: '', isToken: !1 }, ir),
		T = Se.enhance({
			onSubmit: ({ cancel: o }) => {
				if ((Se.data.email && (Se.data.email = Se.data.email.toLowerCase()), Object.keys(Se.errors).length > 0)) {
					(o(), e(s)?.classList.add('wiggle'), setTimeout(() => e(s)?.classList.remove('wiggle'), 300));
					return;
				}
				(c(ke, !0), c($e, !0), aa.startLoading(ra.authentication));
			},
			onResult: async ({ result: o, update: E }) => {
				if ((c(ke, !1), o.type === 'redirect')) {
					(c($e, !0),
						sessionStorage.setItem(
							'flashMessage',
							JSON.stringify({ type: 'success', title: 'Welcome Back!', description: 'Successfully signed in.', duration: 4e3 })
						));
					const F = o.location || '/';
					window.location.href = F;
					return;
				}
				if (o.type === 'failure' && o.data?.requires2FA) {
					(c(te, !0),
						c(Ke, o.data.userId || '', !0),
						c($e, !1),
						aa.stopLoading(ra.authentication),
						lt.warning({ title: 'Two-Factor Authentication Required', description: 'Please enter your authentication code to continue' }));
					return;
				}
				if ((c($e, !1), aa.stopLoading(ra.authentication), o.type === 'failure' || o.type === 'error')) {
					const F = o.type === 'failure' ? o.data?.message || 'Invalid email or password' : o.error?.message || 'An unexpected error occurred';
					(lt.error({ title: 'Sign In Failed', description: F }),
						e(s)?.classList.add('wiggle'),
						setTimeout(() => {
							e(s)?.classList.remove('wiggle');
						}, 300));
				}
				await E();
			}
		}),
		ze = new Gt({ email: '' }, sr),
		G = ze.enhance({
			onSubmit: ({ cancel: o }) => {
				if ((ze.data.email && (ze.data.email = ze.data.email.toLowerCase()), Object.keys(ze.errors).length > 0)) {
					(o(), e(s)?.classList.add('wiggle'), setTimeout(() => e(s)?.classList.remove('wiggle'), 300));
					return;
				}
				c(ke, !0);
			},
			onResult: async ({ result: o, update: E }) => {
				if ((c(ke, !1), o.type === 'error')) {
					lt.info({ description: o.error?.message || 'An error occurred' });
					return;
				}
				if (o.type === 'success')
					if (o.data && o.data.userExists === !0) {
						(c(L, !0), lt.success({ description: ja() }));
						return;
					} else
						o.data?.status === !1
							? (c(L, !1),
								lt.error({ description: 'No account found with this email address.' }),
								e(s)?.classList.add('wiggle'),
								setTimeout(() => e(s)?.classList.remove('wiggle'), 300))
							: (c(L, !0), lt.success({ title: 'Email Sent', description: 'Password reset instructions have been sent to your email' }));
				else if (o.type === 'failure') {
					const F = o.data?.message || 'Password reset failed';
					(lt.error({ title: 'Reset Failed', description: F }),
						e(s)?.classList.add('wiggle'),
						setTimeout(() => e(s)?.classList.remove('wiggle'), 300));
					return;
				}
				await E();
			}
		}),
		A = new Gt({ password: '', confirm_password: '', token: '', email: '' }, lr),
		Ge = A.enhance({
			onSubmit: ({ cancel: o }) => {
				if (Object.keys(A.errors).length > 0) {
					o();
					return;
				}
				c(ke, !0);
			},
			onResult: async ({ result: o, update: E }) => {
				if (
					(c(ke, !1),
					c(L, !1),
					c(S, !1),
					(o.type === 'success' || o.type === 'redirect') &&
						(lt.success({ title: 'Password Reset Successful', description: 'You can now sign in with your new password' }), o.type === 'redirect'))
				) {
					o.location && or(o.location);
					return;
				}
				(await E(),
					o.type === 'failure' &&
						(e(s)?.classList.add('wiggle'),
						setTimeout(() => {
							e(s)?.classList.remove('wiggle');
						}, 300)));
			}
		});
	async function Re() {
		if (!(!e(_e).trim() || e(Ze))) {
			if (!e(he) && e(_e).length !== 6) {
				lt.error({ description: ea() });
				return;
			}
			if (e(he) && e(_e).length < 8) {
				lt.error({ description: 'Invalid backup code format' });
				return;
			}
			c(Ze, !0);
			try {
				const o = new FormData();
				(o.append('userId', e(Ke)), o.append('code', e(_e).trim()));
				const E = await fetch('?/verify2FA', { method: 'POST', body: o });
				if (E.ok) (lt.success({ title: 'Verification Successful', description: 'Redirecting to your dashboard...' }), window.location.reload());
				else {
					const F = await E.json();
					throw new Error(F.message || ea());
				}
			} catch (o) {
				lt.error({ description: o instanceof Error ? o.message : ea() });
			} finally {
				c(Ze, !1);
			}
		}
	}
	function O(o) {
		let F = o.target.value;
		(e(he)
			? (F = F.replace(/[^a-zA-Z0-9]/g, '')
					.toLowerCase()
					.slice(0, 10))
			: (F = F.replace(/\D/g, '').slice(0, 6)),
			c(_e, F, !0));
	}
	function fe() {
		(c(he, !e(he)), c(_e, ''));
	}
	function Ne() {
		(c(te, !1), c(Ke, ''), c(_e, ''), c(he, !1), c(Ze, !1));
	}
	yt(() => {
		if (qe.includes('/login') && qe.includes('token')) {
			const o = new URL(qe),
				E = o.searchParams.get('token') || '',
				F = o.searchParams.get('email') || '';
			E && F && ((A.data.token = E), (A.data.email = F), c(S, !0), c(L, !0));
		}
	});
	function He(o) {
		(o.stopPropagation(), e(S) || e(L) ? (c(S, !1), c(L, !1)) : W()());
	}
	function Pe(o) {
		(o.stopPropagation(), x()());
	}
	function nt(o) {
		(o.stopPropagation(), c(S, !0), c(L, !1));
	}
	const ge = g(() => k() === 0),
		at = g(() => k() !== void 0 && k() !== 0),
		ct = g(() => k() === void 0 || k() === 1),
		dt = 'hover relative flex items-center';
	yt(() => {
		k() === 0 && Xe();
	});
	var w = wo();
	((w.__click = Pe), (w.__keydown = (o) => o.key === 'Enter' && x()?.()), xe(w, 'tabindex', ne));
	let n;
	var H = a(w);
	{
		var se = (o) => {
			var E = bo(),
				F = a(E);
			{
				var Y = (ee) => {
					var V = Jr(),
						ce = a(V);
					Ht(ce, { position: 1, background: 'white' });
					var Me = r(ce, 2);
					(Ht(Me, { position: -1, background: 'white' }), t(V), i(ee, V));
				};
				p(F, (ee) => {
					La.isDesktop && ee(Y);
				});
			}
			var J = r(F, 2),
				re = a(J);
			(la(re, {}), t(J));
			var pe = r(J, 2);
			let ie;
			var be = a(pe),
				Ce = a(be);
			ka(Ce, { className: 'w-14', fill: 'red' });
			var et = r(Ce, 2),
				ue = a(et),
				me = a(ue);
			(Ca(me, { highlight: 'CMS', textClass: 'text-black' }), t(ue));
			var $ = r(ue, 2);
			{
				var R = (ee) => {
						var V = Kr(),
							ce = a(V, !0);
						(t(V), b((Me) => m(ce, Me), [() => qt()]), i(ee, V));
					},
					P = (ee) => {
						var V = mt(),
							ce = K(V);
						{
							var Me = (Le) => {
									var De = Qr(),
										Oe = a(De, !0);
									(t(De), b((Ve) => m(Oe, Ve), [() => Kt()]), i(Le, De));
								},
								Fe = (Le) => {
									var De = mt(),
										Oe = K(De);
									{
										var Ve = (Te) => {
											var Ue = Xr(),
												Ae = a(Ue, !0);
											(t(Ue), b((ot) => m(Ae, ot), [() => Xt()]), i(Te, Ue));
										};
										p(
											Oe,
											(Te) => {
												e(S) && e(L) && Te(Ve);
											},
											!0
										);
									}
									i(Le, De);
								};
							p(
								ce,
								(Le) => {
									e(S) && !e(L) ? Le(Me) : Le(Fe, !1);
								},
								!0
							);
						}
						i(ee, V);
					};
				p($, (ee) => {
					!e(S) && !e(L) ? ee(R) : ee(P, !1);
				});
			}
			(t(et), t(be));
			var M = r(be, 2),
				C = a(M),
				U = r(C);
			U.__click = He;
			var q = a(U);
			(u(q, 'icon', 'ri:arrow-right-line'), u(q, 'width', '20'), _(q, 1, 'text-black svelte-6xkclf'), t(U), t(M));
			var oe = r(M, 2);
			{
				var le = (ee) => {
					var V = ro(),
						ce = K(V);
					let Me;
					var Fe = a(ce);
					{
						let h = g(() => oa());
						_t(Fe, {
							id: 'emailsignIn',
							name: 'email',
							type: 'email',
							tabindex: Z,
							autocomplete: 'username',
							autocapitalize: 'none',
							spellcheck: !1,
							get label() {
								return e(h);
							},
							required: !0,
							icon: 'mdi:email',
							'data-testid': 'signin-email',
							get value() {
								return Se.data.email;
							},
							set value(z) {
								Se.data.email = z;
							}
						});
					}
					var Le = r(Fe, 2);
					{
						var De = (h) => {
							var z = eo(),
								ye = a(z, !0);
							(t(z), b(() => m(ye, Se.errors.email[0])), i(h, z));
						};
						p(Le, (h) => {
							Se.errors.email && h(De);
						});
					}
					var Oe = r(Le, 2);
					{
						let h = g(() => na());
						_t(Oe, {
							id: 'passwordsignIn',
							name: 'password',
							type: 'password',
							autocomplete: 'current-password',
							tabindex: B,
							required: !0,
							showPassword: I,
							get label() {
								return e(h);
							},
							icon: 'mdi:lock',
							iconColor: 'black',
							textColor: 'black',
							'data-testid': 'signin-password',
							get value() {
								return Se.data.password;
							},
							set value(z) {
								Se.data.password = z;
							}
						});
					}
					var Ve = r(Oe, 2);
					{
						var Te = (h) => {
							var z = to(),
								ye = a(z, !0);
							(t(z), b(() => m(ye, Se.errors.password[0])), i(h, z));
						};
						p(Ve, (h) => {
							Se.errors.password && h(Te);
						});
					}
					(t(ce),
						Bt(
							ce,
							(h, z) => zt?.(h, z),
							() => T
						),
						Rt(
							ce,
							(h) => c(s, h),
							() => e(s)
						));
					var Ue = r(ce, 2),
						Ae = a(Ue),
						ot = a(Ae),
						ft = a(ot),
						xt = r(ft);
					{
						var de = (h) => {
							var z = ao();
							i(h, z);
						};
						p(xt, (h) => {
							(e(ke) || e($e)) && h(de);
						});
					}
					t(ot);
					var we = r(ot, 2);
					(Vr(we, {
						get showOAuth() {
							return We.showOAuth;
						}
					}),
						t(Ae));
					var st = r(Ae, 2),
						d = a(st);
					(xe(d, 'tabindex', Ie), (d.__click = nt));
					var f = a(d, !0);
					(t(d),
						t(st),
						t(Ue),
						b(
							(h, z, ye, D) => {
								((Me = _(ce, 1, 'flex w-full flex-col gap-3 svelte-6xkclf', null, Me, { hide: k() !== 0 })),
									(ce.inert = k() !== 0),
									xe(ot, 'aria-label', h),
									m(ft, `${z ?? ''} `),
									xe(d, 'aria-label', ye),
									m(f, D));
							},
							[() => qt(), () => qt(), () => Kt(), () => Kt()]
						),
						i(ee, V));
				};
				p(oe, (ee) => {
					!e(S) && !e(L) && ee(le);
				});
			}
			var Qe = r(oe, 2);
			{
				var ut = (ee) => {
					var V = co(),
						ce = a(V),
						Me = a(ce),
						Fe = a(Me);
					(u(Fe, 'icon', 'mdi:shield-key'), u(Fe, 'width', '48'), _(Fe, 1, 'mx-auto text-primary-500 svelte-6xkclf'), t(Me));
					var Le = r(Me, 2),
						De = a(Le, !0);
					t(Le);
					var Oe = r(Le, 2),
						Ve = a(Oe, !0);
					(t(Oe), t(ce));
					var Te = r(ce, 2),
						Ue = a(Te),
						Ae = a(Ue);
					(Mt(Ae), (Ae.__input = O), (Ae.__keydown = (X) => X.key === 'Enter' && Re()));
					let ot;
					var ft = r(Ae, 2);
					{
						var xt = (X) => {
							var Ee = oo(),
								pt = a(Ee);
							(t(Ee), b(() => m(pt, `${e(_e).length ?? ''}/10`)), i(X, Ee));
						};
						p(ft, (X) => {
							e(he) && X(xt);
						});
					}
					t(Ue);
					var de = r(Ue, 2),
						we = a(de);
					we.__click = fe;
					var st = a(we, !0);
					(t(we), t(de));
					var d = r(de, 2),
						f = a(d);
					f.__click = Ne;
					var h = a(f);
					(u(h, 'icon', 'mdi:arrow-left'), u(h, 'width', '20'), _(h, 1, 'mr-2 svelte-6xkclf'));
					var z = r(h);
					t(f);
					var ye = r(f, 2);
					ye.__click = Re;
					var D = a(ye);
					{
						var Q = (X) => {
								var Ee = no(),
									pt = r(K(Ee));
								(b((kt) => m(pt, ` ${kt ?? ''}`), [() => Ua()]), i(X, Ee));
							},
							Ye = (X) => {
								var Ee = io(),
									pt = K(Ee);
								(u(pt, 'icon', 'mdi:check'), u(pt, 'width', '20'), _(pt, 1, 'mr-2 svelte-6xkclf'));
								var kt = r(pt);
								(b((Ct) => m(kt, ` ${Ct ?? ''}`), [() => pa()]), i(X, Ee));
							};
						p(D, (X) => {
							e(Ze) ? X(Q) : X(Ye, !1);
						});
					}
					(t(ye), t(d));
					var it = r(d, 2),
						wt = a(it),
						Wt = a(wt);
					{
						var Zt = (X) => {
								var Ee = so();
								i(X, Ee);
							},
							Vt = (X) => {
								var Ee = lo();
								i(X, Ee);
							};
						p(Wt, (X) => {
							e(he) ? X(Vt, !1) : X(Zt);
						});
					}
					(t(wt),
						t(it),
						t(Te),
						t(V),
						b(
							(X, Ee, pt, kt, Ct, Jt, Pa, Ma, Aa) => {
								(m(De, X),
									m(Ve, Ee),
									xe(Ae, 'placeholder', pt),
									(ot = _(Ae, 1, 'input text-center font-mono tracking-wider svelte-6xkclf', null, ot, { 'text-2xl': !e(he), 'text-lg': e(he) })),
									xe(Ae, 'maxlength', e(he) ? 10 : 6),
									xe(we, 'aria-label', kt),
									m(st, Ct),
									xe(f, 'aria-label', Jt),
									m(z, ` ${Pa ?? ''}`),
									(ye.disabled = Ma),
									xe(ye, 'aria-label', Aa));
							},
							[
								() => Ia(),
								() => (e(he) ? 'Enter your backup recovery code:' : $a()),
								() => (e(he) ? 'Enter backup code' : Ra()),
								() => (e(he) ? fa() : ua()),
								() => (e(he) ? fa() : ua()),
								() => Qt(),
								() => Qt(),
								() => !e(_e).trim() || e(Ze) || (!e(he) && e(_e).length !== 6) || (e(he) && e(_e).length < 8),
								() => pa()
							]
						),
						It(
							Ae,
							() => e(_e),
							(X) => c(_e, X)
						),
						i(ee, V));
				};
				p(Qe, (ee) => {
					e(te) && !e(S) && !e(L) && ee(ut);
				});
			}
			var rt = r(Qe, 2);
			{
				var vt = (ee) => {
					var V = po();
					let ce;
					var Me = a(V);
					{
						let de = g(() => oa());
						_t(Me, {
							id: 'emailforgot',
							name: 'email',
							type: 'email',
							tabindex: Z,
							autocomplete: 'email',
							autocapitalize: 'none',
							spellcheck: !1,
							get label() {
								return e(de);
							},
							required: !0,
							icon: 'mdi:email',
							get value() {
								return ze.data.email;
							},
							set value(we) {
								ze.data.email = we;
							}
						});
					}
					var Fe = r(Me, 2);
					{
						var Le = (de) => {
							var we = vo(),
								st = a(we, !0);
							(t(we), b(() => m(st, ze.errors.email[0])), i(de, we));
						};
						p(Fe, (de) => {
							ze.errors.email && de(Le);
						});
					}
					var De = r(Fe, 2);
					{
						var Oe = (de) => {
							var we = fo(),
								st = a(we, !0);
							(t(we), b((d) => m(st, d), [() => Object.values(ze.errors).flat().join(', ')]), i(de, we));
						};
						p(De, (de) => {
							Object.keys(ze.errors).length > 0 && !ze.errors.email && de(Oe);
						});
					}
					var Ve = r(De, 2),
						Te = a(Ve),
						Ue = a(Te),
						Ae = r(Ue);
					{
						var ot = (de) => {
							var we = uo();
							i(de, we);
						};
						p(Ae, (de) => {
							e(ke) && de(ot);
						});
					}
					t(Te);
					var ft = r(Te, 2);
					ft.__click = () => {
						(c(S, !1), c(L, !1));
					};
					var xt = a(ft);
					(u(xt, 'icon', 'mdi:arrow-left-circle'),
						u(xt, 'width', '38'),
						_(xt, 1, 'svelte-6xkclf'),
						t(ft),
						t(Ve),
						t(V),
						Bt(
							V,
							(de, we) => zt?.(de, we),
							() => G
						),
						Rt(
							V,
							(de) => c(s, de),
							() => e(s)
						),
						b(
							(de, we) => {
								((ce = _(V, 1, 'flex w-full flex-col gap-3 svelte-6xkclf', null, ce, { hide: k() !== 0 })),
									(V.inert = k() !== 0),
									xe(Te, 'aria-label', de),
									m(Ue, `${we ?? ''} `));
							},
							[() => Xt(), () => Xt()]
						),
						i(ee, V));
				};
				p(rt, (ee) => {
					e(S) && !e(L) && ee(vt);
				});
			}
			var tt = r(rt, 2);
			{
				var gt = (ee) => {
					var V = ho();
					let ce;
					var Me = a(V);
					Mt(Me);
					var Fe = r(Me, 2);
					Mt(Fe);
					var Le = r(Fe, 2);
					{
						let D = g(() => na());
						_t(Le, {
							id: 'passwordreset',
							name: 'password',
							type: 'password',
							tabindex: B,
							required: !0,
							showPassword: I,
							autocomplete: 'new-password',
							get label() {
								return e(D);
							},
							icon: 'mdi:lock',
							iconColor: 'black',
							textColor: 'black',
							get value() {
								return A.data.password;
							},
							set value(Q) {
								A.data.password = Q;
							}
						});
					}
					var De = r(Le, 2);
					{
						var Oe = (D) => {
							var Q = mo(),
								Ye = a(Q, !0);
							(t(Q), b(() => m(Ye, A.errors.password[0])), i(D, Q));
						};
						p(De, (D) => {
							A.errors.password && D(Oe);
						});
					}
					var Ve = r(De, 2);
					{
						let D = g(() => ha?.() || ba?.());
						_t(Ve, {
							id: 'confirm_passwordreset',
							name: 'confirm_password',
							type: 'password',
							tabindex: je,
							showPassword: I,
							autocomplete: 'new-password',
							get label() {
								return e(D);
							},
							icon: 'mdi:lock',
							iconColor: 'black',
							textColor: 'black',
							get value() {
								return A.data.confirm_password;
							},
							set value(Q) {
								A.data.confirm_password = Q;
							}
						});
					}
					var Te = r(Ve, 2);
					Sa(Te, {
						get password() {
							return A.data.password;
						},
						get confirmPassword() {
							return A.data.confirm_password;
						}
					});
					var Ue = r(Te, 2);
					{
						let D = g(() => wa?.() || Na?.());
						_t(Ue, {
							id: 'tokenresetPW',
							name: 'token',
							type: 'password',
							showPassword: I,
							get label() {
								return e(D);
							},
							icon: 'mdi:lock',
							iconColor: 'black',
							textColor: 'black',
							required: !0,
							get value() {
								return A.data.token;
							},
							set value(Q) {
								A.data.token = Q;
							}
						});
					}
					var Ae = r(Ue, 2);
					{
						var ot = (D) => {
							var Q = go(),
								Ye = a(Q, !0);
							(t(Q), b(() => m(Ye, A.errors.token[0])), i(D, Q));
						};
						p(Ae, (D) => {
							A.errors.token && D(ot);
						});
					}
					var ft = r(Ae, 2);
					{
						var xt = (D) => {
							var Q = xo(),
								Ye = a(Q, !0);
							(t(Q), b((it) => m(Ye, it), [() => Object.values(A.errors).flat().join(', ')]), i(D, Q));
						};
						p(ft, (D) => {
							Object.keys(A.errors).length > 0 && !A.errors.token && D(xt);
						});
					}
					var de = r(ft, 2);
					Mt(de);
					var we = r(de, 2),
						st = a(we),
						d = a(st),
						f = r(d);
					{
						var h = (D) => {
							var Q = _o();
							i(D, Q);
						};
						p(f, (D) => {
							e(ke) && D(h);
						});
					}
					t(st);
					var z = r(st, 2);
					z.__click = () => {
						(c(S, !1), c(L, !1));
					};
					var ye = a(z);
					(u(ye, 'icon', 'mdi:arrow-left-circle'),
						u(ye, 'width', '38'),
						_(ye, 1, 'svelte-6xkclf'),
						t(z),
						t(we),
						t(V),
						Bt(
							V,
							(D, Q) => zt?.(D, Q),
							() => Ge
						),
						Rt(
							V,
							(D) => c(s, D),
							() => e(s)
						),
						b(
							(D, Q, Ye) => {
								((ce = _(V, 1, 'flex w-full flex-col gap-3 svelte-6xkclf', null, ce, { hide: k() !== 0 })),
									(V.inert = k() !== 0),
									xe(st, 'aria-label', D),
									m(d, `${Q ?? ''} `),
									xe(z, 'aria-label', Ye));
							},
							[() => ma(), () => ma(), () => Qt()]
						),
						It(
							Me,
							() => A.data.email,
							(D) => (A.data.email = D)
						),
						It(
							Fe,
							() => A.data.token,
							(D) => (A.data.token = D)
						),
						It(
							de,
							() => A.data.email,
							(D) => (A.data.email = D)
						),
						i(ee, V));
				};
				p(tt, (ee) => {
					e(S) && e(L) && ee(gt);
				});
			}
			(t(pe),
				t(E),
				b(
					(ee) => {
						((ie = _(pe, 1, 'z-0 mx-auto mb-[5%] mt-[15%] w-full overflow-y-auto rounded-md bg-white p-4 lg:w-4/5 svelte-6xkclf', null, ie, {
							hide: k() !== 0
						})),
							m(C, `${ee ?? ''} `));
					},
					[() => _a()]
				),
				i(o, E));
		};
		p(H, (o) => {
			k() === 0 && o(se);
		});
	}
	var y = r(H, 2);
	{
		let o = g(() => k() === 1 || k() === void 0);
		$r(y, {
			get show() {
				return e(o);
			},
			onClick: Pe
		});
	}
	(t(w),
		b(() => (n = _(w, 1, Pt(dt), 'svelte-6xkclf', n, { active: e(ge), inactive: e(at), hover: e(ct) }))),
		ia('pointerenter', w, function (...o) {
			j()?.apply(this, o);
		}),
		i(Je, w),
		bt());
}
Ot(['click', 'keydown', 'input']);
var ko = l(
	'<div><div role="button" class="flex cursor-pointer flex-col items-center"><div class="relative w-max rounded-full border-4 border-white p-3"><svg class="over aspect-square h-12" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 50 50" fill="#FFFFFF"><path d="M19.875 0.40625C15.203125 0.492188 12.21875 2.378906 10.9375 5.3125C9.714844 8.105469 9.988281 11.632813 10.875 15.28125C10.398438 15.839844 10.019531 16.589844 10.15625 17.71875C10.304688 18.949219 10.644531 19.824219 11.125 20.4375C11.390625 20.773438 11.738281 20.804688 12.0625 20.96875C12.238281 22.015625 12.53125 23.0625 12.96875 23.9375C13.21875 24.441406 13.503906 24.90625 13.78125 25.28125C13.90625 25.449219 14.085938 25.546875 14.21875 25.6875C14.226563 26.921875 14.230469 27.949219 14.125 29.25C13.800781 30.035156 13.042969 30.667969 11.8125 31.28125C10.542969 31.914063 8.890625 32.5 7.21875 33.21875C5.546875 33.9375 3.828125 34.8125 2.46875 36.1875C1.109375 37.5625 0.148438 39.449219 0 41.9375L-0.0625 43L25 43L24.34375 41L2.25 41C2.53125 39.585938 3.058594 38.449219 3.90625 37.59375C4.972656 36.515625 6.425781 35.707031 8 35.03125C9.574219 34.355469 11.230469 33.820313 12.6875 33.09375C14.144531 32.367188 15.492188 31.410156 16.0625 29.875L16.125 29.625C16.277344 27.949219 16.21875 26.761719 16.21875 25.3125L16.21875 24.71875L15.6875 24.4375C15.777344 24.484375 15.5625 24.347656 15.375 24.09375C15.1875 23.839844 14.957031 23.476563 14.75 23.0625C14.335938 22.234375 13.996094 21.167969 13.90625 20.3125L13.8125 19.5L12.96875 19.4375C12.960938 19.4375 12.867188 19.449219 12.6875 19.21875C12.507813 18.988281 12.273438 18.480469 12.15625 17.5C12.058594 16.667969 12.480469 16.378906 12.4375 16.40625L13.09375 16L12.90625 15.28125C11.964844 11.65625 11.800781 8.363281 12.78125 6.125C13.757813 3.894531 15.75 2.492188 19.90625 2.40625C19.917969 2.40625 19.925781 2.40625 19.9375 2.40625C21.949219 2.414063 23.253906 3.003906 23.625 3.65625L23.875 4.0625L24.34375 4.125C25.734375 4.320313 26.53125 4.878906 27.09375 5.65625C27.65625 6.433594 27.96875 7.519531 28.0625 8.71875C28.25 11.117188 27.558594 13.910156 27.125 15.21875L26.875 16L27.5625 16.40625C27.519531 16.378906 27.945313 16.667969 27.84375 17.5C27.726563 18.480469 27.492188 18.988281 27.3125 19.21875C27.132813 19.449219 27.039063 19.4375 27.03125 19.4375L26.1875 19.5L26.09375 20.3125C26 21.175781 25.652344 22.234375 25.25 23.0625C25.046875 23.476563 24.839844 23.839844 24.65625 24.09375C24.472656 24.347656 24.28125 24.488281 24.375 24.4375L23.84375 24.71875L23.84375 25.3125C23.84375 26.757813 23.785156 27.949219 23.9375 29.625L23.9375 29.75L24 29.875C24.320313 30.738281 24.882813 31.605469 25.8125 32.15625L26.84375 30.4375C26.421875 30.1875 26.144531 29.757813 25.9375 29.25C25.832031 27.949219 25.835938 26.921875 25.84375 25.6875C25.972656 25.546875 26.160156 25.449219 26.28125 25.28125C26.554688 24.902344 26.816406 24.4375 27.0625 23.9375C27.488281 23.0625 27.796875 22.011719 27.96875 20.96875C28.28125 20.804688 28.617188 20.765625 28.875 20.4375C29.355469 19.824219 29.695313 18.949219 29.84375 17.71875C29.976563 16.625 29.609375 15.902344 29.15625 15.34375C29.644531 13.757813 30.269531 11.195313 30.0625 8.5625C29.949219 7.125 29.582031 5.691406 28.71875 4.5C27.929688 3.40625 26.648438 2.609375 25.03125 2.28125C23.980469 0.917969 22.089844 0.40625 19.90625 0.40625 Z M 38 26C31.382813 26 26 31.382813 26 38C26 44.617188 31.382813 50 38 50C44.617188 50 50 44.617188 50 38C50 31.382813 44.617188 26 38 26 Z M 38 28C43.535156 28 48 32.464844 48 38C48 43.535156 43.535156 48 38 48C32.464844 48 28 43.535156 28 38C28 32.464844 32.464844 28 38 28 Z M 37 32L37 37L32 37L32 39L37 39L37 44L39 44L39 39L44 39L44 37L39 37L39 32Z" fill="#FFFFFF"></path></svg></div> <p class="text-center font-semibold uppercase text-white"> </p></div></div>'
);
function Co(Je, v) {
	ht(v, !0);
	let k = N(v, 'show', 11, !0),
		x = N(v, 'disabled', 3, !1),
		j = N(v, 'onClick', 3, (Z) => {});
	function W(Z) {
		x() || (Z.stopPropagation(), j()(Z));
	}
	function ae(Z) {
		x() || (Z.key === 'Enter' && (Z.stopPropagation(), j()(Z)));
	}
	var S = ko();
	let L;
	var I = a(S);
	((I.__click = W), (I.__keydown = ae));
	var s = r(a(I), 2),
		ne = a(s, !0);
	(t(s),
		t(I),
		t(S),
		b(
			(Z) => {
				((L = _(
					S,
					1,
					'overflow icon dark:text-dark absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] transition-all duration-300 svelte-1oa9vu3',
					null,
					L,
					{ hide: !k(), 'pointer-events-none': !k() || x(), 'opacity-50': x() }
				)),
					xe(I, 'tabindex', x() ? -1 : 0),
					m(ne, Z));
			},
			[() => St()]
		),
		i(Je, S),
		bt());
}
Ot(['click', 'keydown']);
var Lo = l('<div class="absolute inset-0 z-0 svelte-gtc6np"><!> <!></div>'),
	So = l(' <span class="text-2xl text-primary-500 sm:text-3xl svelte-gtc6np">: Complete Invitation</span>', 1),
	Po = l(' <span class="text-2xl capitalize text-primary-500 sm:text-3xl svelte-gtc6np">: New User</span>', 1),
	Mo = l('<span class="text-xs text-error-500 svelte-gtc6np"> </span>'),
	Ao = l('<span class="text-xs text-error-500 svelte-gtc6np"> </span>'),
	Eo = l('<span class="text-xs text-primary-400 svelte-gtc6np">✓ Email pre-filled from invitation</span>'),
	Fo = l('<input type="hidden" name="email" class="svelte-gtc6np"/>'),
	Do = l('<span class="text-xs text-error-500 svelte-gtc6np"> </span>'),
	Oo = l('<span class="text-xs text-error-500 svelte-gtc6np"> </span>'),
	To = l('<span class="text-xs text-error-500 svelte-gtc6np"> </span>'),
	jo = l('<span class="text-xs text-warning-400 svelte-gtc6np">⚠️ Token was pre-filled from URL and will be validated against the server</span>'),
	Io = l('<!> <!> <!>', 1),
	$o = l(
		'<input type="hidden" name="token" class="svelte-gtc6np"/> <span class="text-xs text-primary-400 svelte-gtc6np">✓ Using invitation token</span>',
		1
	),
	Ro = l('<span class="text-xs text-error-500 svelte-gtc6np"> </span>'),
	No = l('<span class="text-xs text-error-500 svelte-gtc6np"> </span>'),
	Uo = l('<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 svelte-gtc6np"/>'),
	qo = l('<button type="submit" class="btn bg-white text-black mt-4 uppercase svelte-gtc6np"> <!></button>'),
	Bo = l('<img src="/Spinner.svg" alt="" aria-hidden="true" decoding="async" class="ml-4 h-6 svelte-gtc6np"/>'),
	zo = l(
		'<p class="mt-2 text-xs text-surface-400 svelte-gtc6np">💡 Note: Both email/password and Google OAuth registration require an invitation token from an administrator.</p>'
	),
	Go = l(
		'<p class="mt-2 text-xs text-surface-400 svelte-gtc6np">💡 Note: New user registration requires an invitation token from an administrator.</p>'
	),
	Ho = l(
		'<div class="btn-group mt-4 border border-secondary-500 text-white [&amp;>*+*]:border-secondary-500 svelte-gtc6np"><button type="submit" class="btn w-3/4 rounded-none bg-surface-200 text-black hover:text-white svelte-gtc6np"><span class="w-full text-black hover:text-white svelte-gtc6np"> </span> <!></button> <button type="button" aria-label="OAuth" class="btn flex w-1/4 items-center justify-center svelte-gtc6np"><iconify-icon></iconify-icon> <span class="svelte-gtc6np">OAuth</span></button></div> <!>',
		3
	),
	Yo = l(
		'<div class="relative flex min-h-screen w-full items-center justify-center overflow-hidden svelte-gtc6np"><!> <div class="absolute left-1/2 top-[20%] hidden -translate-x-1/2 -translate-y-1/2 transform xl:block svelte-gtc6np"><!></div> <div><div class="mb-4 flex flex-row gap-2 svelte-gtc6np"><!> <h1 class="text-3xl font-bold text-white lg:text-4xl svelte-gtc6np"><div class="text-xs text-surface-200 svelte-gtc6np"><!></div> <div class="wrap-break-word lg:-mt-1 svelte-gtc6np"><!></div></h1></div> <div class="-mt-2 flex items-center justify-end gap-2 text-right text-xs text-error-500 svelte-gtc6np"> <button aria-label="Back" class="btn-icon rounded-full preset-outlined-secondary-500 svelte-gtc6np"><iconify-icon></iconify-icon></button></div> <form method="post" action="?/signUp"><!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!> <!></form></div></div>',
		2
	),
	Wo = l('<section role="button"><!> <!></section>');
function Zo(Je, v) {
	ht(v, !0);
	const k = N(v, 'active', 11, void 0),
		x = N(v, 'isInviteFlow', 3, !1),
		j = N(v, 'token', 3, ''),
		W = N(v, 'invitedEmail', 3, ''),
		ae = N(v, 'inviteError', 3, ''),
		S = N(v, 'onClick', 3, () => {}),
		L = N(v, 'onPointerEnter', 3, () => {}),
		I = N(v, 'onBack', 3, () => {}),
		s = N(v, 'firstCollectionPath', 3, ''),
		ne = ya.data,
		Z = ne.firstUserExists,
		B = ne.showOAuth,
		je = ne.hasExistingOAuthUsers,
		Ie = 1;
	let We = ve(void 0),
		qe = ve(null),
		ke = ve(!1),
		$e = ve(!1),
		te = ve(!1),
		Ke = ve(!1);
	async function _e() {
		if (!(e(Ke) || !s())) {
			c(Ke, !0);
			try {
				await ca(s());
			} catch (n) {
				console.error('Prefetch failed:', n);
			}
		}
	}
	const he = 1,
		Ze = 2,
		Be = 3,
		Xe = 4,
		Se = 5,
		T = new Gt({ username: '', email: '', password: '', confirm_password: '', token: '' }, cr),
		ze = T.enhance({
			onSubmit: ({ cancel: n }) => {
				if (Object.keys(T.errors).length > 0) {
					n();
					return;
				}
				c($e, !0);
			},
			onResult: async ({ result: n, update: H }) => {
				if ((c($e, !1), n.type === 'redirect')) {
					(c(te, !0),
						lt.success({ title: 'Account Created!', description: 'Welcome to SveltyCMS. Redirecting to your dashboard...' }),
						setTimeout(() => {
							c(te, !1);
						}, 100));
					return;
				}
				if ((c(te, !1), n.type === 'failure' || n.type === 'error')) {
					const se = n.type === 'failure' ? n.data?.message || 'Failed to create account' : n.error?.message || 'An unexpected error occurred';
					(lt.error({ title: 'Sign Up Failed', description: se }),
						e(qe)?.classList.add('wiggle'),
						setTimeout(() => {
							e(qe)?.classList.remove('wiggle');
						}, 300));
				}
				(n.type === 'success' &&
					(c(We, n.data?.message, !0),
					lt.success({ title: 'Account Created', description: n.data?.message || 'Your account has been successfully created' })),
					await H());
			}
		}),
		G = g(() => T.data.token),
		A = g(() => new URL(window.location.href).searchParams);
	yt(() => {
		if ((x() && W() && T.data.email !== W() && (T.data.email = W()), x() && j() && T.data.token !== j() && (T.data.token = j()), !x())) {
			const n = e(A).get('invite_token') || e(A).get('regToken');
			n && n !== T.data.token && (T.data.token = n);
		}
		T.data.token && !x() && vr.debug('Form token pre-filled by server:', T.data.token);
	});
	function Ge() {
		if (!x() && !je && !e(G)) {
			alert(
				'⚠️ Please enter your invitation token first before using Google OAuth signup. OAuth registration requires an invitation from an administrator.'
			);
			return;
		}
		const n = document.createElement('form');
		((n.method = 'post'),
			x() && j()
				? (n.action = `?/signInOAuth&invite_token=${encodeURIComponent(j())}`)
				: e(G)
					? (n.action = `?/signInOAuth&invite_token=${encodeURIComponent(e(G))}`)
					: (n.action = '?/signInOAuth'),
			document.body.appendChild(n),
			n.submit(),
			document.body.removeChild(n),
			setTimeout(() => {}, 300));
	}
	function Re(n) {
		(n.stopPropagation(), I()());
	}
	function O() {
		L()();
	}
	function fe(n) {
		(n.stopPropagation(), S()());
	}
	const Ne = g(() => k() === 1),
		He = g(() => k() !== void 0 && k() !== 1),
		Pe = g(() => k() === void 0 || k() === 0),
		nt = 'hover relative flex items-center overflow-y-auto';
	yt(() => {
		k() === 1 && _e();
	});
	var ge = Wo();
	((ge.__click = fe), (ge.__keydown = (n) => n.key === 'Enter' && S()?.()), xe(ge, 'tabindex', Ie));
	let at;
	var ct = a(ge);
	{
		var dt = (n) => {
			var H = Yo(),
				se = a(H);
			{
				var y = (d) => {
					var f = Lo(),
						h = a(f);
					Ht(h, { position: 1, background: 'dark', mirrorAnimation: !0 });
					var z = r(h, 2);
					(Ht(z, { position: -1, background: 'dark', mirrorAnimation: !0 }), t(f), i(d, f));
				};
				p(se, (d) => {
					La.isDesktop && d(y);
				});
			}
			var o = r(se, 2),
				E = a(o);
			(la(E, {}), t(o));
			var F = r(o, 2);
			let Y;
			var J = a(F),
				re = a(J);
			ka(re, { className: 'w-14', fill: 'red' });
			var pe = r(re, 2),
				ie = a(pe),
				be = a(ie);
			(Ca(be, { highlight: 'CMS' }), t(ie));
			var Ce = r(ie, 2),
				et = a(Ce);
			{
				var ue = (d) => {
						var f = So(),
							h = K(f);
						(Ft(), b((z) => m(h, `${z ?? ''} `), [() => St()]), i(d, f));
					},
					me = (d) => {
						var f = Po(),
							h = K(f);
						(Ft(), b((z) => m(h, `${z ?? ''} `), [() => St()]), i(d, f));
					};
				p(et, (d) => {
					x() ? d(ue) : d(me, !1);
				});
			}
			(t(Ce), t(pe), t(J));
			var $ = r(J, 2),
				R = a($),
				P = r(R);
			P.__click = Re;
			var M = a(P);
			(u(M, 'icon', 'ri:arrow-left-line'), u(M, 'width', '20'), _(M, 1, 'text-white svelte-gtc6np'), t(P), t($));
			var C = r($, 2);
			let U;
			var q = a(C);
			{
				let d = g(() => qa());
				_t(q, {
					id: 'usernamesignUp',
					name: 'username',
					type: 'text',
					tabindex: he,
					required: !0,
					get label() {
						return e(d);
					},
					minlength: 2,
					maxlength: 24,
					icon: 'mdi:user-circle',
					iconColor: 'white',
					textColor: 'white',
					inputClass: 'text-white',
					autocomplete: 'username',
					get value() {
						return T.data.username;
					},
					set value(f) {
						T.data.username = f;
					}
				});
			}
			var oe = r(q, 2);
			{
				var le = (d) => {
					var f = Mo(),
						h = a(f, !0);
					(t(f), b(() => m(h, T.errors.username[0])), i(d, f));
				};
				p(oe, (d) => {
					T.errors.username && d(le);
				});
			}
			var Qe = r(oe, 2);
			{
				let d = g(() => oa()),
					f = g(() => (x() ? 'opacity-70' : ''));
				_t(Qe, {
					id: 'emailsignUp',
					name: 'email',
					type: 'email',
					tabindex: Ze,
					required: !0,
					autocomplete: 'email',
					autocapitalize: 'none',
					spellcheck: !1,
					get label() {
						return e(d);
					},
					minlength: 5,
					maxlength: 50,
					icon: 'mdi:email',
					iconColor: 'white',
					textColor: 'white',
					get inputClass() {
						return `text-white ${e(f) ?? ''}`;
					},
					get disabled() {
						return x();
					},
					get value() {
						return T.data.email;
					},
					set value(h) {
						T.data.email = h;
					}
				});
			}
			var ut = r(Qe, 2);
			{
				var rt = (d) => {
					var f = Ao(),
						h = a(f, !0);
					(t(f), b(() => m(h, T.errors.email[0])), i(d, f));
				};
				p(ut, (d) => {
					T.errors.email && d(rt);
				});
			}
			var vt = r(ut, 2);
			{
				var tt = (d) => {
					var f = Eo();
					i(d, f);
				};
				p(vt, (d) => {
					x() && d(tt);
				});
			}
			var gt = r(vt, 2);
			{
				var ee = (d) => {
					var f = Fo();
					(Mt(f), b(() => da(f, T.data.email)), i(d, f));
				};
				p(gt, (d) => {
					x() && d(ee);
				});
			}
			var V = r(gt, 2);
			{
				let d = g(() => na());
				_t(V, {
					id: 'passwordsignUp',
					name: 'password',
					type: 'password',
					tabindex: Be,
					required: !0,
					get label() {
						return e(d);
					},
					minlength: 8,
					maxlength: 50,
					icon: 'mdi:password',
					iconColor: 'white',
					textColor: 'white',
					passwordIconColor: 'white',
					inputClass: 'text-white',
					autocomplete: 'new-password',
					get value() {
						return T.data.password;
					},
					set value(f) {
						T.data.password = f;
					},
					get showPassword() {
						return e(ke);
					},
					set showPassword(f) {
						c(ke, f, !0);
					}
				});
			}
			var ce = r(V, 2);
			{
				var Me = (d) => {
					var f = Do(),
						h = a(f, !0);
					(t(f), b(() => m(h, T.errors.password[0])), i(d, f));
				};
				p(ce, (d) => {
					T.errors.password && d(Me);
				});
			}
			var Fe = r(ce, 2);
			{
				let d = g(() => ha?.() || ba?.());
				_t(Fe, {
					id: 'confirm_passwordsignUp',
					name: 'confirm_password',
					type: 'password',
					tabindex: Xe,
					required: !0,
					get label() {
						return e(d);
					},
					minlength: 8,
					maxlength: 50,
					icon: 'mdi:password',
					iconColor: 'white',
					textColor: 'white',
					passwordIconColor: 'white',
					inputClass: 'text-white',
					autocomplete: 'new-password',
					get value() {
						return T.data.confirm_password;
					},
					set value(f) {
						T.data.confirm_password = f;
					},
					get showPassword() {
						return e(ke);
					},
					set showPassword(f) {
						c(ke, f, !0);
					}
				});
			}
			var Le = r(Fe, 2);
			{
				var De = (d) => {
					var f = Oo(),
						h = a(f, !0);
					(t(f), b(() => m(h, T.errors.confirm_password[0])), i(d, f));
				};
				p(Le, (d) => {
					T.errors.confirm_password && d(De);
				});
			}
			var Oe = r(Le, 2);
			Sa(Oe, {
				get password() {
					return T.data.password;
				},
				get confirmPassword() {
					return T.data.confirm_password;
				}
			});
			var Ve = r(Oe, 2);
			{
				var Te = (d) => {
						var f = Io(),
							h = K(f);
						{
							let Ye = g(() => wa?.() || Ba?.());
							_t(h, {
								id: 'tokensignUp',
								name: 'token',
								type: 'password',
								tabindex: Se,
								required: !0,
								get label() {
									return e(Ye);
								},
								minlength: 36,
								maxlength: 36,
								icon: 'mdi:key-chain',
								iconColor: 'white',
								textColor: 'white',
								passwordIconColor: 'white',
								inputClass: 'text-white',
								autocomplete: 'one-time-code',
								get value() {
									return T.data.token;
								},
								set value(it) {
									T.data.token = it;
								}
							});
						}
						var z = r(h, 2);
						{
							var ye = (Ye) => {
								var it = To(),
									wt = a(it, !0);
								(t(it), b(() => m(wt, T.errors.token[0])), i(Ye, it));
							};
							p(z, (Ye) => {
								T.errors.token && Ye(ye);
							});
						}
						var D = r(z, 2);
						{
							var Q = (Ye) => {
								var it = jo();
								i(Ye, it);
							};
							p(D, (Ye) => {
								T.data.token && ae() && Ye(Q);
							});
						}
						i(d, f);
					},
					Ue = (d) => {
						var f = mt(),
							h = K(f);
						{
							var z = (ye) => {
								var D = $o(),
									Q = K(D);
								(Mt(Q), Ft(2), b(() => da(Q, j())), i(ye, D));
							};
							p(
								h,
								(ye) => {
									x() && ye(z);
								},
								!0
							);
						}
						i(d, f);
					};
				p(Ve, (d) => {
					x() ? d(Ue, !1) : d(Te);
				});
			}
			var Ae = r(Ve, 2);
			{
				var ot = (d) => {
					var f = Ro(),
						h = a(f, !0);
					(t(f), b(() => m(h, e(We))), i(d, f));
				};
				p(Ae, (d) => {
					e(We) && d(ot);
				});
			}
			var ft = r(Ae, 2);
			{
				var xt = (d) => {
					var f = No(),
						h = a(f, !0);
					(t(f), b(() => m(h, ae())), i(d, f));
				};
				p(ft, (d) => {
					ae() && !T.data.token && d(xt);
				});
			}
			var de = r(ft, 2);
			{
				var we = (d) => {
						var f = qo(),
							h = a(f),
							z = r(h);
						{
							var ye = (D) => {
								var Q = Uo();
								i(D, Q);
							};
							p(z, (D) => {
								(e($e) || e(te)) && D(ye);
							});
						}
						(t(f),
							b(
								(D, Q) => {
									(xe(f, 'aria-label', D), m(h, `${Q ?? ''} `));
								},
								[() => (x() ? 'Accept Invitation' : St()), () => (x() ? 'Accept Invitation & Create Account' : St())]
							),
							i(d, f));
					},
					st = (d) => {
						var f = Ho(),
							h = K(f),
							z = a(h),
							ye = a(z),
							D = a(ye, !0);
						t(ye);
						var Q = r(ye, 2);
						{
							var Ye = (X) => {
								var Ee = Bo();
								i(X, Ee);
							};
							p(Q, (X) => {
								(e($e) || e(te)) && X(Ye);
							});
						}
						t(z);
						var it = r(z, 2);
						it.__click = Ge;
						var wt = a(it);
						(u(wt, 'icon', 'flat-color-icons:google'),
							u(wt, 'color', 'white'),
							u(wt, 'width', '20'),
							_(wt, 1, 'mr-0.5 sm:mr-2 svelte-gtc6np'),
							Ft(2),
							t(it),
							t(h));
						var Wt = r(h, 2);
						{
							var Zt = (X) => {
									var Ee = zo();
									i(X, Ee);
								},
								Vt = (X) => {
									var Ee = mt(),
										pt = K(Ee);
									{
										var kt = (Ct) => {
											var Jt = Go();
											i(Ct, Jt);
										};
										p(
											pt,
											(Ct) => {
												!x() && je && Ct(kt);
											},
											!0
										);
									}
									i(X, Ee);
								};
							p(Wt, (X) => {
								!x() && Z && !je ? X(Zt) : X(Vt, !1);
							});
						}
						(b(
							(X, Ee) => {
								(xe(z, 'aria-label', X), m(D, Ee));
							},
							[() => (x() ? 'Accept Invitation' : St()), () => (x() ? 'Accept Invitation' : St())]
						),
							i(d, f));
					};
				p(de, (d) => {
					B ? d(st, !1) : d(we);
				});
			}
			(t(C),
				Bt(
					C,
					(d, f) => zt?.(d, f),
					() => ze
				),
				Rt(
					C,
					(d) => c(qe, d),
					() => e(qe)
				),
				t(F),
				t(H),
				b(
					(d) => {
						((Y = _(F, 1, 'relative z-10 mx-auto mb-[5%] mt-[15%] w-full rounded-md bg-[#242728] p-4 lg:w-4/5 svelte-gtc6np', null, Y, {
							hide: k() !== 1
						})),
							m(R, `${d ?? ''} `),
							(U = _(C, 1, 'items flex flex-col gap-3 svelte-gtc6np', null, U, { hide: k() !== 1 })),
							(C.inert = k() !== 1));
					},
					[() => _a()]
				),
				i(n, H));
		};
		p(ct, (n) => {
			k() === 1 && n(dt);
		});
	}
	var w = r(ct, 2);
	{
		let n = g(() => k() === 0 || k() === void 0);
		Co(w, {
			get show() {
				return e(n);
			},
			onClick: fe
		});
	}
	(t(ge),
		b(() => (at = _(ge, 1, Pt(nt), 'svelte-gtc6np', at, { active: e(Ne), inactive: e(He), hover: e(Pe) }))),
		ia('pointerenter', ge, O),
		i(Je, ge),
		bt());
}
Ot(['click', 'keydown']);
var Vo = l(
		'<div class="flex gap-4"><button type="button" class="preset-filled-warning-500 btn"> </button> <button type="button" class="preset-filled-secondary-500 btn"> </button></div>'
	),
	Jo = l(
		'<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div class="max-w-2xl rounded-lg bg-white p-8 shadow-xl"><div class="mb-4 flex items-center gap-3"><svg class="h-8 w-8 text-error-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <h2 class="text-2xl font-bold text-error-500"> </h2></div> <p class="mb-4 text-lg"> </p> <div class="mb-4 rounded-lg bg-surface-200 p-4"><p class="font-semibold"> </p> <p class="text-sm"> </p></div> <div class="mb-6"><h3 class="mb-2 font-semibold"> </h3> <ul class="list-inside list-disc space-y-1 text-sm"><li> </li> <li> </li> <li> </li> <li> </li></ul></div> <!></div></div>'
	),
	Ko = l(
		'<div aria-live="polite" aria-atomic="true" role="status" aria-label="Demo mode active. Timer showing time remaining until next reset."><p class="text-2xl font-bold"> </p> <p> </p> <p class="text-xl font-bold"> <span> </span></p></div>'
	),
	Qo = l('<span> </span> <iconify-icon></iconify-icon>', 3),
	Xo = l(
		'<span class="text-sm font-medium text-surface-900 dark:text-surface-200"> </span> <span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ml-2"> </span>',
		1
	),
	en = l(
		'<div class="px-2 pb-2 mb-1 border-b border-surface-200 dark:border-surface-50"><input type="text" placeholder="Search language..." class="w-full rounded-md bg-surface-200 dark:bg-surface-800 px-3 py-2 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white border-none" aria-label="Search languages"/></div> <div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto svelte-1x05zx6"></div>',
		1
	),
	tn = l('<span class="text-sm font-medium"> </span> <span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ml-2"> </span>', 1),
	an = l(
		'<div class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1"> </div> <!>',
		1
	),
	rn = l('<!> <!>', 1),
	on = l(
		'<!> <div class="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"><!></div> <div><!></div> <div class="absolute bottom-5 left-1/2 -translate-x-1/2"><!></div>',
		1
	),
	nn = l('<div><div><!></div> <!> <!> <!> <!></div>');
function $n(Je, v) {
	ht(v, !0);
	const k = g(() => v.data.firstUserExists);
	let x = ve(!1),
		j = ve(void 0);
	yt(() => {
		if (typeof window < 'u') {
			const O = new URLSearchParams(window.location.search),
				fe = O.get('token'),
				Ne = O.get('email'),
				He = !!(fe && Ne);
			He !== e(x) && (c(x, He), e(x) && c(j, 0));
		}
	});
	let W = ve('#242728');
	(yt(() => {
		e(j) === void 0 && !e(x) && (Dt?.DEMO ? c(W, '#242728') : Dt?.SEASONS ? c(W, 'white') : e(k) ? c(W, 'white') : c(W, '#242728'));
	}),
		yt(() => {
			e(x) && c(W, 'white');
		}));
	let ae = ve(Yt({ minutes: 0, seconds: 0 })),
		S = ve(''),
		L = ve(!1),
		I = ve(null),
		s = ve(!1),
		ne = ve(void 0);
	const Z = g(() => [...ga].sort((O, fe) => Lt(O, 'en').localeCompare(Lt(fe, 'en')))),
		B = g(() =>
			e(Z).filter((O) => Lt(O, jt.value).toLowerCase().includes(e(S).toLowerCase()) || Lt(O, 'en').toLowerCase().includes(e(S).toLowerCase()))
		),
		je = g(() => (jt.value && ga.includes(jt.value) ? jt.value : 'en'));
	function Ie(O) {
		(clearTimeout(e(ne)),
			c(
				ne,
				setTimeout(() => {
					(jt.set(O), c(L, !1), c(S, ''));
				}, 100),
				!0
			));
	}
	function We(O) {
		O.target.closest('.language-selector') || (c(L, !1), c(S, ''));
	}
	yt(() => {
		if (typeof window < 'u' && e(L))
			return (window.addEventListener('click', We), setTimeout(() => e(I)?.focus(), 0), () => window.removeEventListener('click', We));
	});
	function qe() {
		const O = new Date(),
			fe = O.getMinutes(),
			Ne = O.getSeconds(),
			Pe = 600 - ((fe % 10) * 60 + Ne);
		return { minutes: Math.floor(Pe / 60), seconds: Pe % 60 };
	}
	function ke() {
		c(ae, qe(), !0);
	}
	yt(() => {
		let O;
		if (At('DEMO'))
			return (
				ke(),
				(O = setInterval(ke, 1e3)),
				() => {
					O && clearInterval(O);
				}
			);
	});
	function $e() {
		e(s) ||
			(c(s, !0),
			c(j, void 0),
			c(W, v.data.demoMode || At('SEASONS') ? '#242728' : e(k) ? 'white' : '#242728', !0),
			setTimeout(() => {
				c(s, !1);
			}, 300));
	}
	function te(O) {
		(O && O.stopPropagation(),
			!e(s) &&
				(c(s, !0),
				e(k) ? (c(j, 0), c(W, 'white')) : (c(j, 1), c(W, '#242728')),
				setTimeout(() => {
					c(s, !1);
				}, 400)));
	}
	function Ke(O) {
		(O && O.stopPropagation(),
			!e(s) &&
				(c(s, !0),
				c(j, 1),
				c(W, '#242728'),
				setTimeout(() => {
					c(s, !1);
				}, 400)));
	}
	function _e() {
		e(j) === void 0 && !v.data.demoMode && !At('SEASONS') && c(W, 'white');
	}
	function he() {
		e(j) === void 0 && !v.data.demoMode && !At('SEASONS') && c(W, '#242728');
	}
	var Ze = nn(),
		Be = a(Ze);
	let Xe;
	var Se = a(Be);
	(jr(Se, {}), t(Be));
	var T = r(Be, 2);
	{
		var ze = (O) => {
			var fe = Jo(),
				Ne = a(fe),
				He = a(Ne),
				Pe = r(a(He), 2),
				nt = a(Pe, !0);
			(t(Pe), t(He));
			var ge = r(He, 2),
				at = a(ge, !0);
			t(ge);
			var ct = r(ge, 2),
				dt = a(ct),
				w = a(dt, !0);
			t(dt);
			var n = r(dt, 2),
				H = a(n, !0);
			(t(n), t(ct));
			var se = r(ct, 2),
				y = a(se),
				o = a(y, !0);
			t(y);
			var E = r(y, 2),
				F = a(E),
				Y = a(F, !0);
			t(F);
			var J = r(F, 2),
				re = a(J, !0);
			t(J);
			var pe = r(J, 2),
				ie = a(pe, !0);
			t(pe);
			var be = r(pe, 2),
				Ce = a(be, !0);
			(t(be), t(E), t(se));
			var et = r(se, 2);
			{
				var ue = (me) => {
					var $ = Vo(),
						R = a($);
					R.__click = async () => {
						if (confirm(Qa())) {
							const q = await (await fetch('/api/setup/reset', { method: 'POST' })).json();
							q.success ? (window.location.href = '/setup') : alert('Failed to reset setup: ' + q.error);
						}
					};
					var P = a(R, !0);
					t(R);
					var M = r(R, 2);
					M.__click = () => window.location.reload();
					var C = a(M, !0);
					(t(M),
						t($),
						b(
							(U, q) => {
								(m(P, U), m(C, q));
							},
							[() => Xa(), () => er()]
						),
						i(me, $));
				};
				p(et, (me) => {
					v.data.canReset && me(ue);
				});
			}
			(t(Ne),
				t(fe),
				b(
					(me, $, R, P, M, C, U, q) => {
						(m(nt, me), m(at, $), m(w, R), m(H, v.data.errorReason), m(o, P), m(Y, M), m(re, C), m(ie, U), m(Ce, q));
					},
					[() => za(), () => Ga(), () => Ha(), () => Ya(), () => Wa(), () => Za(), () => Va(), () => Ja()]
				),
				i(O, fe));
		};
		p(T, (O) => {
			v.data.showDatabaseError && O(ze);
		});
	}
	var G = r(T, 2);
	{
		let O = g(() => v.data.firstCollectionPath || '');
		yo(G, {
			onClick: te,
			onPointerEnter: _e,
			onBack: $e,
			get firstCollectionPath() {
				return e(O);
			},
			get active() {
				return e(j);
			},
			set active(fe) {
				c(j, fe, !0);
			}
		});
	}
	var A = r(G, 2);
	{
		let O = g(() => v.data.isInviteFlow || !1),
			fe = g(() => v.data.token || ''),
			Ne = g(() => v.data.invitedEmail || ''),
			He = g(() => v.data.inviteError || ''),
			Pe = g(() => v.data.firstCollectionPath || '');
		Zo(A, {
			get isInviteFlow() {
				return e(O);
			},
			get token() {
				return e(fe);
			},
			get invitedEmail() {
				return e(Ne);
			},
			get inviteError() {
				return e(He);
			},
			onClick: Ke,
			onPointerEnter: he,
			onBack: $e,
			get firstCollectionPath() {
				return e(Pe);
			},
			get active() {
				return e(j);
			},
			set active(nt) {
				c(j, nt, !0);
			}
		});
	}
	var Ge = r(A, 2);
	{
		var Re = (O) => {
			var fe = on(),
				Ne = K(fe);
			{
				var He = (n) => {
					var H = Ko();
					let se;
					var y = a(H),
						o = a(y, !0);
					t(y);
					var E = r(y, 2),
						F = a(E, !0);
					t(E);
					var Y = r(E, 2),
						J = a(Y),
						re = r(J),
						pe = a(re);
					(t(re),
						t(Y),
						t(H),
						b(
							(ie, be, Ce) => {
								((se = _(
									H,
									1,
									'absolute bottom-2 left-1/2 flex min-w-[350px] -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center rounded-xl bg-error-500 p-3 text-center text-white transition-opacity duration-300 sm:bottom-12',
									null,
									se,
									{ 'opacity-50': e(s) }
								)),
									m(o, ie),
									m(F, be),
									m(J, `${Ce ?? ''} `),
									xe(re, 'aria-label', `Time remaining: ${e(ae).minutes ?? ''} minutes and ${e(ae).seconds ?? ''} seconds`),
									m(pe, `${e(ae).minutes ?? ''}:${(e(ae).seconds < 10 ? `0${e(ae).seconds}` : e(ae).seconds) ?? ''}`));
							},
							[() => tr(), () => ar(), () => rr()]
						),
						i(n, H));
				};
				p(Ne, (n) => {
					v.data.demoMode && n(He);
				});
			}
			var Pe = r(Ne, 2),
				nt = a(Pe);
			(la(nt, {}), t(Pe));
			var ge = r(Pe, 2);
			let at;
			var ct = a(ge);
			(Et(ct, {
				positioning: { placement: 'top', gutter: 10 },
				children: (n, H) => {
					var se = rn(),
						y = K(se);
					Tt(
						y,
						() => Et.Trigger,
						(E, F) => {
							F(E, {
								class:
									'flex w-30 items-center justify-between gap-2 rounded-full border-2 bg-[#242728] px-4 py-2 text-white transition-colors duration-300 hover:bg-[#363a3b] focus:ring-2',
								'aria-label': 'Select language',
								children: (Y, J) => {
									var re = Qo(),
										pe = K(re),
										ie = a(pe, !0);
									t(pe);
									var be = r(pe, 2);
									(u(be, 'icon', 'mdi:chevron-up'), u(be, 'width', '20'), b((Ce) => m(ie, Ce), [() => Lt(e(je))]), i(Y, re));
								},
								$$slots: { default: !0 }
							});
						}
					);
					var o = r(y, 2);
					(ur(o, {
						children: (E, F) => {
							var Y = mt(),
								J = K(Y);
							(Tt(
								J,
								() => Et.Positioner,
								(re, pe) => {
									pe(re, {
										children: (ie, be) => {
											var Ce = mt(),
												et = K(Ce);
											(Tt(
												et,
												() => Et.Content,
												(ue, me) => {
													me(ue, {
														class: 'card p-2 shadow-xl preset-filled-surface-100-900 z-9999 w-64 border border-surface-200 dark:border-surface-500',
														children: ($, R) => {
															var P = an(),
																M = K(P),
																C = a(M, !0);
															t(M);
															var U = r(M, 2);
															{
																var q = (le) => {
																		var Qe = en(),
																			ut = K(Qe),
																			rt = a(ut);
																		(Mt(rt),
																			(rt.__click = (tt) => tt.stopPropagation()),
																			Rt(
																				rt,
																				(tt) => c(I, tt),
																				() => e(I)
																			),
																			t(ut));
																		var vt = r(ut, 2);
																		(Nt(
																			vt,
																			20,
																			() => e(B),
																			(tt) => tt,
																			(tt, gt) => {
																				var ee = mt(),
																					V = K(ee);
																				(Tt(
																					V,
																					() => Et.Item,
																					(ce, Me) => {
																						Me(ce, {
																							get value() {
																								return gt;
																							},
																							onclick: () => Ie(gt),
																							class: 'flex w-full items-center justify-between px-3 py-2 text-left rounded-sm cursor-pointer',
																							children: (Fe, Le) => {
																								var De = Xo(),
																									Oe = K(De),
																									Ve = a(Oe, !0);
																								t(Oe);
																								var Te = r(Oe, 2),
																									Ue = a(Te, !0);
																								(t(Te),
																									b(
																										(Ae, ot) => {
																											(m(Ve, Ae), m(Ue, ot));
																										},
																										[() => Lt(gt), () => gt.toUpperCase()]
																									),
																									i(Fe, De));
																							},
																							$$slots: { default: !0 }
																						});
																					}
																				),
																					i(tt, ee));
																			}
																		),
																			t(vt),
																			It(
																				rt,
																				() => e(S),
																				(tt) => c(S, tt)
																			),
																			i(le, Qe));
																	},
																	oe = (le) => {
																		var Qe = mt(),
																			ut = K(Qe);
																		(Nt(
																			ut,
																			16,
																			() => e(Z).filter((rt) => rt !== e(je)),
																			(rt) => rt,
																			(rt, vt) => {
																				var tt = mt(),
																					gt = K(tt);
																				(Tt(
																					gt,
																					() => Et.Item,
																					(ee, V) => {
																						V(ee, {
																							get value() {
																								return vt;
																							},
																							onclick: () => Ie(vt),
																							class: 'flex w-full items-center justify-between px-3 py-2 text-left rounded-sm cursor-pointer',
																							children: (ce, Me) => {
																								var Fe = tn(),
																									Le = K(Fe),
																									De = a(Le, !0);
																								t(Le);
																								var Oe = r(Le, 2),
																									Ve = a(Oe, !0);
																								(t(Oe),
																									b(
																										(Te, Ue) => {
																											(m(De, Te), m(Ve, Ue));
																										},
																										[() => Lt(vt), () => vt.toUpperCase()]
																									),
																									i(ce, Fe));
																							},
																							$$slots: { default: !0 }
																						});
																					}
																				),
																					i(rt, tt));
																			}
																		),
																			i(le, Qe));
																	};
																p(U, (le) => {
																	Array.isArray(At('LOCALES')) && At('LOCALES').length > 5 ? le(q) : le(oe, !1);
																});
															}
															(b((le) => m(C, le), [() => Ka()]), i($, P));
														},
														$$slots: { default: !0 }
													});
												}
											),
												i(ie, Ce));
										},
										$$slots: { default: !0 }
									});
								}
							),
								i(E, Y));
						},
						$$slots: { default: !0 }
					}),
						i(n, se));
				},
				$$slots: { default: !0 }
			}),
				t(ge));
			var dt = r(ge, 2),
				w = a(dt);
			(fr(w, { transparent: !0 }),
				t(dt),
				b(
					() =>
						(at = _(ge, 1, 'language-selector absolute bottom-1/4 left-1/2 -translate-x-1/2 transform transition-opacity duration-300', null, at, {
							'opacity-50': e(s)
						}))
				),
				i(O, fe));
		};
		p(Ge, (O) => {
			e(j) == null && O(Re);
		});
	}
	(t(Ze),
		b(() => {
			(_(Ze, 1, `flex min-h-lvh w-full overflow-y-auto bg-${e(W)} transition-colors duration-300`, 'svelte-1x05zx6'),
				(Xe = _(Be, 1, 'pointer-events-none fixed inset-0 z-10 transition-all duration-300', null, Xe, {
					'opacity-0': e(j) === void 0,
					'opacity-100': e(j) !== void 0
				})));
		}),
		i(Je, Ze),
		bt());
}
Ot(['click']);
export { $n as component };
//# sourceMappingURL=19.Cc7voGix.js.map
