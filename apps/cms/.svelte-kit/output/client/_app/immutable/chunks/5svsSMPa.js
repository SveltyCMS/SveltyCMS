import { i as Ue } from './zi73tRJP.js';
import { o as Ot, a as _t } from './CMZtchEj.js';
import { p as Yt, z as Pt, g as c, d as ve, b as K, a as Ct, f as Nt, c as T, s as O, r as M, n as Et, t as Te, u as ne } from './DrlZFkx8.js';
import { c as It, a as se, f as Ce, s as ae } from './CTjXDULS.js';
import { a as Ht } from './BEiD40NV.js';
import { c as I, s as ze } from './MEFvoR_D.js';
import { b as qt } from './YQp2a1pQ.js';
import { p as A } from './DePHBZW_.js';
import { c as Wt, C as Me, d as Lt, b as Ft, L as Qt, e as Rt, f as Bt, p as Gt, i as Ut } from './C4Hx6_Ca.js';
import {
	t as d,
	c as D,
	i as S,
	b as $,
	n as ee,
	g as oe,
	j as zt,
	k as te,
	l as ue,
	o as Ke,
	h as Je,
	a as Ae,
	p as Se,
	e as et,
	q as At,
	r as Xt,
	s as $t,
	d as Zt
} from './DvaK7ysa.js';
import { B as jt } from './KG4G7ZS9.js';
function de(n, e, t) {
	const r = d(n, t?.in);
	return isNaN(e) ? D(t?.in || n, NaN) : (e && r.setDate(r.getDate() + e), r);
}
function Ne(n, e, t) {
	const r = d(n, t?.in);
	if (isNaN(e)) return D(n, NaN);
	if (!e) return r;
	const s = r.getDate(),
		a = D(n, r.getTime());
	a.setMonth(r.getMonth() + e + 1, 0);
	const i = a.getDate();
	return s >= i ? a : (r.setFullYear(a.getFullYear(), a.getMonth(), s), r);
}
function Ee(n, e, t) {
	return D(n, +d(n) + e);
}
function Vt(n, e, t) {
	return Ee(n, e * S);
}
function F(n, e) {
	const t = $(),
		r = e?.weekStartsOn ?? e?.locale?.options?.weekStartsOn ?? t.weekStartsOn ?? t.locale?.options?.weekStartsOn ?? 0,
		s = d(n, e?.in),
		a = s.getDay(),
		i = (a < r ? 7 : 0) + a - r;
	return (s.setDate(s.getDate() - i), s.setHours(0, 0, 0, 0), s);
}
function j(n, e) {
	return F(n, { ...e, weekStartsOn: 1 });
}
function tt(n, e) {
	const t = d(n, e?.in),
		r = t.getFullYear(),
		s = D(t, 0);
	(s.setFullYear(r + 1, 0, 4), s.setHours(0, 0, 0, 0));
	const a = j(s),
		i = D(t, 0);
	(i.setFullYear(r, 0, 4), i.setHours(0, 0, 0, 0));
	const l = j(i);
	return t.getTime() >= a.getTime() ? r + 1 : t.getTime() >= l.getTime() ? r : r - 1;
}
function _e(n, e) {
	const t = d(n, e?.in);
	return (t.setHours(0, 0, 0, 0), t);
}
function rt(n, e, t) {
	const [r, s] = ee(t?.in, n, e),
		a = _e(r),
		i = _e(s),
		l = +a - oe(a),
		m = +i - oe(i);
	return Math.round((l - m) / zt);
}
function Kt(n, e) {
	const t = tt(n, e),
		r = D(n, 0);
	return (r.setFullYear(t, 0, 4), r.setHours(0, 0, 0, 0), j(r));
}
function Jt(n, e, t) {
	const r = d(n, t?.in);
	return (r.setTime(r.getTime() + e * te), r);
}
function St(n, e, t) {
	return Ne(n, e * 3, t);
}
function er(n, e, t) {
	return Ee(n, e * 1e3);
}
function tr(n, e, t) {
	return de(n, e * 7, t);
}
function rr(n, e, t) {
	return Ne(n, e * 12, t);
}
function nr(n) {
	return n instanceof Date || (typeof n == 'object' && Object.prototype.toString.call(n) === '[object Date]');
}
function nt(n) {
	return !((!nr(n) && typeof n != 'number') || isNaN(+d(n)));
}
function sr(n, e, t) {
	const [r, s] = ee(t?.in, n, e);
	return r.getFullYear() - s.getFullYear();
}
function st(n, e, t) {
	const [r, s] = ee(t?.in, n, e),
		a = Xe(r, s),
		i = Math.abs(rt(r, s));
	r.setDate(r.getDate() - a * i);
	const l = +(Xe(r, s) === -a),
		m = a * (i - l);
	return m === 0 ? 0 : m;
}
function Xe(n, e) {
	const t =
		n.getFullYear() - e.getFullYear() ||
		n.getMonth() - e.getMonth() ||
		n.getDate() - e.getDate() ||
		n.getHours() - e.getHours() ||
		n.getMinutes() - e.getMinutes() ||
		n.getSeconds() - e.getSeconds() ||
		n.getMilliseconds() - e.getMilliseconds();
	return t < 0 ? -1 : t > 0 ? 1 : t;
}
function ar(n, e, t) {
	const [r, s] = ee(t?.in, n, e),
		a = (+r - +s) / S;
	return ue(t?.roundingMethod)(a);
}
function ir(n, e, t) {
	const r = Ke(n, e) / te;
	return ue(t?.roundingMethod)(r);
}
function or(n, e, t) {
	const r = Je(n, e, t) / 3;
	return ue(t?.roundingMethod)(r);
}
function cr(n, e, t) {
	const r = st(n, e, t) / 7;
	return ue(t?.roundingMethod)(r);
}
function ur(n, e, t) {
	const [r, s] = ee(t?.in, n, e),
		a = Ae(r, s),
		i = Math.abs(sr(r, s));
	(r.setFullYear(1584), s.setFullYear(1584));
	const l = Ae(r, s) === -a,
		m = a * (i - +l);
	return m === 0 ? 0 : m;
}
function dr(n, e) {
	const t = d(n, e?.in),
		r = t.getMonth(),
		s = r - (r % 3);
	return (t.setMonth(s, 1), t.setHours(0, 0, 0, 0), t);
}
function lr(n, e) {
	const t = d(n, e?.in);
	return (t.setDate(1), t.setHours(0, 0, 0, 0), t);
}
function fr(n, e) {
	const t = d(n, e?.in),
		r = t.getFullYear();
	return (t.setFullYear(r + 1, 0, 0), t.setHours(23, 59, 59, 999), t);
}
function at(n, e) {
	const t = d(n, e?.in);
	return (t.setFullYear(t.getFullYear(), 0, 1), t.setHours(0, 0, 0, 0), t);
}
function hr(n, e) {
	const t = d(n, e?.in);
	return (t.setMinutes(59, 59, 999), t);
}
function wr(n, e) {
	const t = $(),
		r = t.weekStartsOn ?? t.locale?.options?.weekStartsOn ?? 0,
		s = d(n, e?.in),
		a = s.getDay(),
		i = (a < r ? -7 : 0) + 6 - (a - r);
	return (s.setDate(s.getDate() + i), s.setHours(23, 59, 59, 999), s);
}
function gr(n, e) {
	const t = d(n, e?.in);
	return (t.setSeconds(59, 999), t);
}
function mr(n, e) {
	const t = d(n, e?.in),
		r = t.getMonth(),
		s = r - (r % 3) + 3;
	return (t.setMonth(s, 0), t.setHours(23, 59, 59, 999), t);
}
function pr(n, e) {
	const t = d(n, e?.in);
	return (t.setMilliseconds(999), t);
}
function yr(n, e) {
	const t = d(n, e?.in);
	return rt(t, at(t)) + 1;
}
function it(n, e) {
	const t = d(n, e?.in),
		r = +j(t) - +Kt(t);
	return Math.round(r / Se) + 1;
}
function Ie(n, e) {
	const t = d(n, e?.in),
		r = t.getFullYear(),
		s = $(),
		a =
			e?.firstWeekContainsDate ??
			e?.locale?.options?.firstWeekContainsDate ??
			s.firstWeekContainsDate ??
			s.locale?.options?.firstWeekContainsDate ??
			1,
		i = D(e?.in || n, 0);
	(i.setFullYear(r + 1, 0, a), i.setHours(0, 0, 0, 0));
	const l = F(i, e),
		m = D(e?.in || n, 0);
	(m.setFullYear(r, 0, a), m.setHours(0, 0, 0, 0));
	const w = F(m, e);
	return +t >= +l ? r + 1 : +t >= +w ? r : r - 1;
}
function br(n, e) {
	const t = $(),
		r =
			e?.firstWeekContainsDate ??
			e?.locale?.options?.firstWeekContainsDate ??
			t.firstWeekContainsDate ??
			t.locale?.options?.firstWeekContainsDate ??
			1,
		s = Ie(n, e),
		a = D(e?.in || n, 0);
	return (a.setFullYear(s, 0, r), a.setHours(0, 0, 0, 0), F(a, e));
}
function ot(n, e) {
	const t = d(n, e?.in),
		r = +F(t, e) - +br(t, e);
	return Math.round(r / Se) + 1;
}
function g(n, e) {
	const t = n < 0 ? '-' : '',
		r = Math.abs(n).toString().padStart(e, '0');
	return t + r;
}
const G = {
		y(n, e) {
			const t = n.getFullYear(),
				r = t > 0 ? t : 1 - t;
			return g(e === 'yy' ? r % 100 : r, e.length);
		},
		M(n, e) {
			const t = n.getMonth();
			return e === 'M' ? String(t + 1) : g(t + 1, 2);
		},
		d(n, e) {
			return g(n.getDate(), e.length);
		},
		a(n, e) {
			const t = n.getHours() / 12 >= 1 ? 'pm' : 'am';
			switch (e) {
				case 'a':
				case 'aa':
					return t.toUpperCase();
				case 'aaa':
					return t;
				case 'aaaaa':
					return t[0];
				case 'aaaa':
				default:
					return t === 'am' ? 'a.m.' : 'p.m.';
			}
		},
		h(n, e) {
			return g(n.getHours() % 12 || 12, e.length);
		},
		H(n, e) {
			return g(n.getHours(), e.length);
		},
		m(n, e) {
			return g(n.getMinutes(), e.length);
		},
		s(n, e) {
			return g(n.getSeconds(), e.length);
		},
		S(n, e) {
			const t = e.length,
				r = n.getMilliseconds(),
				s = Math.trunc(r * Math.pow(10, t - 3));
			return g(s, e.length);
		}
	},
	Z = { midnight: 'midnight', noon: 'noon', morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' },
	$e = {
		G: function (n, e, t) {
			const r = n.getFullYear() > 0 ? 1 : 0;
			switch (e) {
				case 'G':
				case 'GG':
				case 'GGG':
					return t.era(r, { width: 'abbreviated' });
				case 'GGGGG':
					return t.era(r, { width: 'narrow' });
				case 'GGGG':
				default:
					return t.era(r, { width: 'wide' });
			}
		},
		y: function (n, e, t) {
			if (e === 'yo') {
				const r = n.getFullYear(),
					s = r > 0 ? r : 1 - r;
				return t.ordinalNumber(s, { unit: 'year' });
			}
			return G.y(n, e);
		},
		Y: function (n, e, t, r) {
			const s = Ie(n, r),
				a = s > 0 ? s : 1 - s;
			if (e === 'YY') {
				const i = a % 100;
				return g(i, 2);
			}
			return e === 'Yo' ? t.ordinalNumber(a, { unit: 'year' }) : g(a, e.length);
		},
		R: function (n, e) {
			const t = tt(n);
			return g(t, e.length);
		},
		u: function (n, e) {
			const t = n.getFullYear();
			return g(t, e.length);
		},
		Q: function (n, e, t) {
			const r = Math.ceil((n.getMonth() + 1) / 3);
			switch (e) {
				case 'Q':
					return String(r);
				case 'QQ':
					return g(r, 2);
				case 'Qo':
					return t.ordinalNumber(r, { unit: 'quarter' });
				case 'QQQ':
					return t.quarter(r, { width: 'abbreviated', context: 'formatting' });
				case 'QQQQQ':
					return t.quarter(r, { width: 'narrow', context: 'formatting' });
				case 'QQQQ':
				default:
					return t.quarter(r, { width: 'wide', context: 'formatting' });
			}
		},
		q: function (n, e, t) {
			const r = Math.ceil((n.getMonth() + 1) / 3);
			switch (e) {
				case 'q':
					return String(r);
				case 'qq':
					return g(r, 2);
				case 'qo':
					return t.ordinalNumber(r, { unit: 'quarter' });
				case 'qqq':
					return t.quarter(r, { width: 'abbreviated', context: 'standalone' });
				case 'qqqqq':
					return t.quarter(r, { width: 'narrow', context: 'standalone' });
				case 'qqqq':
				default:
					return t.quarter(r, { width: 'wide', context: 'standalone' });
			}
		},
		M: function (n, e, t) {
			const r = n.getMonth();
			switch (e) {
				case 'M':
				case 'MM':
					return G.M(n, e);
				case 'Mo':
					return t.ordinalNumber(r + 1, { unit: 'month' });
				case 'MMM':
					return t.month(r, { width: 'abbreviated', context: 'formatting' });
				case 'MMMMM':
					return t.month(r, { width: 'narrow', context: 'formatting' });
				case 'MMMM':
				default:
					return t.month(r, { width: 'wide', context: 'formatting' });
			}
		},
		L: function (n, e, t) {
			const r = n.getMonth();
			switch (e) {
				case 'L':
					return String(r + 1);
				case 'LL':
					return g(r + 1, 2);
				case 'Lo':
					return t.ordinalNumber(r + 1, { unit: 'month' });
				case 'LLL':
					return t.month(r, { width: 'abbreviated', context: 'standalone' });
				case 'LLLLL':
					return t.month(r, { width: 'narrow', context: 'standalone' });
				case 'LLLL':
				default:
					return t.month(r, { width: 'wide', context: 'standalone' });
			}
		},
		w: function (n, e, t, r) {
			const s = ot(n, r);
			return e === 'wo' ? t.ordinalNumber(s, { unit: 'week' }) : g(s, e.length);
		},
		I: function (n, e, t) {
			const r = it(n);
			return e === 'Io' ? t.ordinalNumber(r, { unit: 'week' }) : g(r, e.length);
		},
		d: function (n, e, t) {
			return e === 'do' ? t.ordinalNumber(n.getDate(), { unit: 'date' }) : G.d(n, e);
		},
		D: function (n, e, t) {
			const r = yr(n);
			return e === 'Do' ? t.ordinalNumber(r, { unit: 'dayOfYear' }) : g(r, e.length);
		},
		E: function (n, e, t) {
			const r = n.getDay();
			switch (e) {
				case 'E':
				case 'EE':
				case 'EEE':
					return t.day(r, { width: 'abbreviated', context: 'formatting' });
				case 'EEEEE':
					return t.day(r, { width: 'narrow', context: 'formatting' });
				case 'EEEEEE':
					return t.day(r, { width: 'short', context: 'formatting' });
				case 'EEEE':
				default:
					return t.day(r, { width: 'wide', context: 'formatting' });
			}
		},
		e: function (n, e, t, r) {
			const s = n.getDay(),
				a = (s - r.weekStartsOn + 8) % 7 || 7;
			switch (e) {
				case 'e':
					return String(a);
				case 'ee':
					return g(a, 2);
				case 'eo':
					return t.ordinalNumber(a, { unit: 'day' });
				case 'eee':
					return t.day(s, { width: 'abbreviated', context: 'formatting' });
				case 'eeeee':
					return t.day(s, { width: 'narrow', context: 'formatting' });
				case 'eeeeee':
					return t.day(s, { width: 'short', context: 'formatting' });
				case 'eeee':
				default:
					return t.day(s, { width: 'wide', context: 'formatting' });
			}
		},
		c: function (n, e, t, r) {
			const s = n.getDay(),
				a = (s - r.weekStartsOn + 8) % 7 || 7;
			switch (e) {
				case 'c':
					return String(a);
				case 'cc':
					return g(a, e.length);
				case 'co':
					return t.ordinalNumber(a, { unit: 'day' });
				case 'ccc':
					return t.day(s, { width: 'abbreviated', context: 'standalone' });
				case 'ccccc':
					return t.day(s, { width: 'narrow', context: 'standalone' });
				case 'cccccc':
					return t.day(s, { width: 'short', context: 'standalone' });
				case 'cccc':
				default:
					return t.day(s, { width: 'wide', context: 'standalone' });
			}
		},
		i: function (n, e, t) {
			const r = n.getDay(),
				s = r === 0 ? 7 : r;
			switch (e) {
				case 'i':
					return String(s);
				case 'ii':
					return g(s, e.length);
				case 'io':
					return t.ordinalNumber(s, { unit: 'day' });
				case 'iii':
					return t.day(r, { width: 'abbreviated', context: 'formatting' });
				case 'iiiii':
					return t.day(r, { width: 'narrow', context: 'formatting' });
				case 'iiiiii':
					return t.day(r, { width: 'short', context: 'formatting' });
				case 'iiii':
				default:
					return t.day(r, { width: 'wide', context: 'formatting' });
			}
		},
		a: function (n, e, t) {
			const s = n.getHours() / 12 >= 1 ? 'pm' : 'am';
			switch (e) {
				case 'a':
				case 'aa':
					return t.dayPeriod(s, { width: 'abbreviated', context: 'formatting' });
				case 'aaa':
					return t.dayPeriod(s, { width: 'abbreviated', context: 'formatting' }).toLowerCase();
				case 'aaaaa':
					return t.dayPeriod(s, { width: 'narrow', context: 'formatting' });
				case 'aaaa':
				default:
					return t.dayPeriod(s, { width: 'wide', context: 'formatting' });
			}
		},
		b: function (n, e, t) {
			const r = n.getHours();
			let s;
			switch ((r === 12 ? (s = Z.noon) : r === 0 ? (s = Z.midnight) : (s = r / 12 >= 1 ? 'pm' : 'am'), e)) {
				case 'b':
				case 'bb':
					return t.dayPeriod(s, { width: 'abbreviated', context: 'formatting' });
				case 'bbb':
					return t.dayPeriod(s, { width: 'abbreviated', context: 'formatting' }).toLowerCase();
				case 'bbbbb':
					return t.dayPeriod(s, { width: 'narrow', context: 'formatting' });
				case 'bbbb':
				default:
					return t.dayPeriod(s, { width: 'wide', context: 'formatting' });
			}
		},
		B: function (n, e, t) {
			const r = n.getHours();
			let s;
			switch ((r >= 17 ? (s = Z.evening) : r >= 12 ? (s = Z.afternoon) : r >= 4 ? (s = Z.morning) : (s = Z.night), e)) {
				case 'B':
				case 'BB':
				case 'BBB':
					return t.dayPeriod(s, { width: 'abbreviated', context: 'formatting' });
				case 'BBBBB':
					return t.dayPeriod(s, { width: 'narrow', context: 'formatting' });
				case 'BBBB':
				default:
					return t.dayPeriod(s, { width: 'wide', context: 'formatting' });
			}
		},
		h: function (n, e, t) {
			if (e === 'ho') {
				let r = n.getHours() % 12;
				return (r === 0 && (r = 12), t.ordinalNumber(r, { unit: 'hour' }));
			}
			return G.h(n, e);
		},
		H: function (n, e, t) {
			return e === 'Ho' ? t.ordinalNumber(n.getHours(), { unit: 'hour' }) : G.H(n, e);
		},
		K: function (n, e, t) {
			const r = n.getHours() % 12;
			return e === 'Ko' ? t.ordinalNumber(r, { unit: 'hour' }) : g(r, e.length);
		},
		k: function (n, e, t) {
			let r = n.getHours();
			return (r === 0 && (r = 24), e === 'ko' ? t.ordinalNumber(r, { unit: 'hour' }) : g(r, e.length));
		},
		m: function (n, e, t) {
			return e === 'mo' ? t.ordinalNumber(n.getMinutes(), { unit: 'minute' }) : G.m(n, e);
		},
		s: function (n, e, t) {
			return e === 'so' ? t.ordinalNumber(n.getSeconds(), { unit: 'second' }) : G.s(n, e);
		},
		S: function (n, e) {
			return G.S(n, e);
		},
		X: function (n, e, t) {
			const r = n.getTimezoneOffset();
			if (r === 0) return 'Z';
			switch (e) {
				case 'X':
					return je(r);
				case 'XXXX':
				case 'XX':
					return X(r);
				case 'XXXXX':
				case 'XXX':
				default:
					return X(r, ':');
			}
		},
		x: function (n, e, t) {
			const r = n.getTimezoneOffset();
			switch (e) {
				case 'x':
					return je(r);
				case 'xxxx':
				case 'xx':
					return X(r);
				case 'xxxxx':
				case 'xxx':
				default:
					return X(r, ':');
			}
		},
		O: function (n, e, t) {
			const r = n.getTimezoneOffset();
			switch (e) {
				case 'O':
				case 'OO':
				case 'OOO':
					return 'GMT' + Ze(r, ':');
				case 'OOOO':
				default:
					return 'GMT' + X(r, ':');
			}
		},
		z: function (n, e, t) {
			const r = n.getTimezoneOffset();
			switch (e) {
				case 'z':
				case 'zz':
				case 'zzz':
					return 'GMT' + Ze(r, ':');
				case 'zzzz':
				default:
					return 'GMT' + X(r, ':');
			}
		},
		t: function (n, e, t) {
			const r = Math.trunc(+n / 1e3);
			return g(r, e.length);
		},
		T: function (n, e, t) {
			return g(+n, e.length);
		}
	};
function Ze(n, e = '') {
	const t = n > 0 ? '-' : '+',
		r = Math.abs(n),
		s = Math.trunc(r / 60),
		a = r % 60;
	return a === 0 ? t + String(s) : t + String(s) + e + g(a, 2);
}
function je(n, e) {
	return n % 60 === 0 ? (n > 0 ? '-' : '+') + g(Math.abs(n) / 60, 2) : X(n, e);
}
function X(n, e = '') {
	const t = n > 0 ? '-' : '+',
		r = Math.abs(n),
		s = g(Math.trunc(r / 60), 2),
		a = g(r % 60, 2);
	return t + s + e + a;
}
const Ve = (n, e) => {
		switch (n) {
			case 'P':
				return e.date({ width: 'short' });
			case 'PP':
				return e.date({ width: 'medium' });
			case 'PPP':
				return e.date({ width: 'long' });
			case 'PPPP':
			default:
				return e.date({ width: 'full' });
		}
	},
	ct = (n, e) => {
		switch (n) {
			case 'p':
				return e.time({ width: 'short' });
			case 'pp':
				return e.time({ width: 'medium' });
			case 'ppp':
				return e.time({ width: 'long' });
			case 'pppp':
			default:
				return e.time({ width: 'full' });
		}
	},
	xr = (n, e) => {
		const t = n.match(/(P+)(p+)?/) || [],
			r = t[1],
			s = t[2];
		if (!s) return Ve(n, e);
		let a;
		switch (r) {
			case 'P':
				a = e.dateTime({ width: 'short' });
				break;
			case 'PP':
				a = e.dateTime({ width: 'medium' });
				break;
			case 'PPP':
				a = e.dateTime({ width: 'long' });
				break;
			case 'PPPP':
			default:
				a = e.dateTime({ width: 'full' });
				break;
		}
		return a.replace('{{date}}', Ve(r, e)).replace('{{time}}', ct(s, e));
	},
	Ye = { p: ct, P: xr },
	kr = /^D+$/,
	Dr = /^Y+$/,
	vr = ['D', 'DD', 'YY', 'YYYY'];
function ut(n) {
	return kr.test(n);
}
function dt(n) {
	return Dr.test(n);
}
function Pe(n, e, t) {
	const r = Tr(n, e, t);
	if ((console.warn(r), vr.includes(n))) throw new RangeError(r);
}
function Tr(n, e, t) {
	const r = n[0] === 'Y' ? 'years' : 'days of the month';
	return `Use \`${n.toLowerCase()}\` instead of \`${n}\` (in \`${e}\`) for formatting ${r} to the input \`${t}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
}
const Mr = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g,
	Or = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g,
	_r = /^'([^]*?)'?$/,
	Yr = /''/g,
	Pr = /[a-zA-Z]/;
function Cr(n, e, t) {
	const r = $(),
		s = t?.locale ?? r.locale ?? et,
		a =
			t?.firstWeekContainsDate ??
			t?.locale?.options?.firstWeekContainsDate ??
			r.firstWeekContainsDate ??
			r.locale?.options?.firstWeekContainsDate ??
			1,
		i = t?.weekStartsOn ?? t?.locale?.options?.weekStartsOn ?? r.weekStartsOn ?? r.locale?.options?.weekStartsOn ?? 0,
		l = d(n, t?.in);
	if (!nt(l)) throw new RangeError('Invalid time value');
	let m = e
		.match(Or)
		.map((o) => {
			const p = o[0];
			if (p === 'p' || p === 'P') {
				const Q = Ye[p];
				return Q(o, s.formatLong);
			}
			return o;
		})
		.join('')
		.match(Mr)
		.map((o) => {
			if (o === "''") return { isToken: !1, value: "'" };
			const p = o[0];
			if (p === "'") return { isToken: !1, value: Nr(o) };
			if ($e[p]) return { isToken: !0, value: o };
			if (p.match(Pr)) throw new RangeError('Format string contains an unescaped latin alphabet character `' + p + '`');
			return { isToken: !1, value: o };
		});
	s.localize.preprocessor && (m = s.localize.preprocessor(l, m));
	const w = { firstWeekContainsDate: a, weekStartsOn: i, locale: s };
	return m
		.map((o) => {
			if (!o.isToken) return o.value;
			const p = o.value;
			((!t?.useAdditionalWeekYearTokens && dt(p)) || (!t?.useAdditionalDayOfYearTokens && ut(p))) && Pe(p, e, String(n));
			const Q = $e[p[0]];
			return Q(l, p, s.localize, w);
		})
		.join('');
}
function Nr(n) {
	const e = n.match(_r);
	return e ? e[1].replace(Yr, "'") : n;
}
function Er() {
	return Object.assign({}, $());
}
function Ir(n, e) {
	const t = d(n, e?.in).getDay();
	return t === 0 ? 7 : t;
}
function Hr(n, e) {
	const t = qr(e) ? new e(0) : D(e, 0);
	return (
		t.setFullYear(n.getFullYear(), n.getMonth(), n.getDate()),
		t.setHours(n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds()),
		t
	);
}
function qr(n) {
	return typeof n == 'function' && n.prototype?.constructor === n;
}
const Wr = 10;
class lt {
	subPriority = 0;
	validate(e, t) {
		return !0;
	}
}
class Lr extends lt {
	constructor(e, t, r, s, a) {
		(super(), (this.value = e), (this.validateValue = t), (this.setValue = r), (this.priority = s), a && (this.subPriority = a));
	}
	validate(e, t) {
		return this.validateValue(e, this.value, t);
	}
	set(e, t, r) {
		return this.setValue(e, t, this.value, r);
	}
}
class Fr extends lt {
	priority = Wr;
	subPriority = -1;
	constructor(e, t) {
		(super(), (this.context = e || ((r) => D(t, r))));
	}
	set(e, t) {
		return t.timestampIsSet ? e : D(e, Hr(e, this.context));
	}
}
class h {
	run(e, t, r, s) {
		const a = this.parse(e, t, r, s);
		return a ? { setter: new Lr(a.value, this.validate, this.set, this.priority, this.subPriority), rest: a.rest } : null;
	}
	validate(e, t, r) {
		return !0;
	}
}
class Qr extends h {
	priority = 140;
	parse(e, t, r) {
		switch (t) {
			case 'G':
			case 'GG':
			case 'GGG':
				return r.era(e, { width: 'abbreviated' }) || r.era(e, { width: 'narrow' });
			case 'GGGGG':
				return r.era(e, { width: 'narrow' });
			case 'GGGG':
			default:
				return r.era(e, { width: 'wide' }) || r.era(e, { width: 'abbreviated' }) || r.era(e, { width: 'narrow' });
		}
	}
	set(e, t, r) {
		return ((t.era = r), e.setFullYear(r, 0, 1), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['R', 'u', 't', 'T'];
}
const x = {
		month: /^(1[0-2]|0?\d)/,
		date: /^(3[0-1]|[0-2]?\d)/,
		dayOfYear: /^(36[0-6]|3[0-5]\d|[0-2]?\d?\d)/,
		week: /^(5[0-3]|[0-4]?\d)/,
		hour23h: /^(2[0-3]|[0-1]?\d)/,
		hour24h: /^(2[0-4]|[0-1]?\d)/,
		hour11h: /^(1[0-1]|0?\d)/,
		hour12h: /^(1[0-2]|0?\d)/,
		minute: /^[0-5]?\d/,
		second: /^[0-5]?\d/,
		singleDigit: /^\d/,
		twoDigits: /^\d{1,2}/,
		threeDigits: /^\d{1,3}/,
		fourDigits: /^\d{1,4}/,
		anyDigitsSigned: /^-?\d+/,
		singleDigitSigned: /^-?\d/,
		twoDigitsSigned: /^-?\d{1,2}/,
		threeDigitsSigned: /^-?\d{1,3}/,
		fourDigitsSigned: /^-?\d{1,4}/
	},
	W = {
		basicOptionalMinutes: /^([+-])(\d{2})(\d{2})?|Z/,
		basic: /^([+-])(\d{2})(\d{2})|Z/,
		basicOptionalSeconds: /^([+-])(\d{2})(\d{2})((\d{2}))?|Z/,
		extended: /^([+-])(\d{2}):(\d{2})|Z/,
		extendedOptionalSeconds: /^([+-])(\d{2}):(\d{2})(:(\d{2}))?|Z/
	};
function k(n, e) {
	return n && { value: e(n.value), rest: n.rest };
}
function y(n, e) {
	const t = e.match(n);
	return t ? { value: parseInt(t[0], 10), rest: e.slice(t[0].length) } : null;
}
function L(n, e) {
	const t = e.match(n);
	if (!t) return null;
	if (t[0] === 'Z') return { value: 0, rest: e.slice(1) };
	const r = t[1] === '+' ? 1 : -1,
		s = t[2] ? parseInt(t[2], 10) : 0,
		a = t[3] ? parseInt(t[3], 10) : 0,
		i = t[5] ? parseInt(t[5], 10) : 0;
	return { value: r * (s * S + a * te + i * At), rest: e.slice(t[0].length) };
}
function ft(n) {
	return y(x.anyDigitsSigned, n);
}
function b(n, e) {
	switch (n) {
		case 1:
			return y(x.singleDigit, e);
		case 2:
			return y(x.twoDigits, e);
		case 3:
			return y(x.threeDigits, e);
		case 4:
			return y(x.fourDigits, e);
		default:
			return y(new RegExp('^\\d{1,' + n + '}'), e);
	}
}
function ce(n, e) {
	switch (n) {
		case 1:
			return y(x.singleDigitSigned, e);
		case 2:
			return y(x.twoDigitsSigned, e);
		case 3:
			return y(x.threeDigitsSigned, e);
		case 4:
			return y(x.fourDigitsSigned, e);
		default:
			return y(new RegExp('^-?\\d{1,' + n + '}'), e);
	}
}
function He(n) {
	switch (n) {
		case 'morning':
			return 4;
		case 'evening':
			return 17;
		case 'pm':
		case 'noon':
		case 'afternoon':
			return 12;
		case 'am':
		case 'midnight':
		case 'night':
		default:
			return 0;
	}
}
function ht(n, e) {
	const t = e > 0,
		r = t ? e : 1 - e;
	let s;
	if (r <= 50) s = n || 100;
	else {
		const a = r + 50,
			i = Math.trunc(a / 100) * 100,
			l = n >= a % 100;
		s = n + i - (l ? 100 : 0);
	}
	return t ? s : 1 - s;
}
function wt(n) {
	return n % 400 === 0 || (n % 4 === 0 && n % 100 !== 0);
}
class Rr extends h {
	priority = 130;
	incompatibleTokens = ['Y', 'R', 'u', 'w', 'I', 'i', 'e', 'c', 't', 'T'];
	parse(e, t, r) {
		const s = (a) => ({ year: a, isTwoDigitYear: t === 'yy' });
		switch (t) {
			case 'y':
				return k(b(4, e), s);
			case 'yo':
				return k(r.ordinalNumber(e, { unit: 'year' }), s);
			default:
				return k(b(t.length, e), s);
		}
	}
	validate(e, t) {
		return t.isTwoDigitYear || t.year > 0;
	}
	set(e, t, r) {
		const s = e.getFullYear();
		if (r.isTwoDigitYear) {
			const i = ht(r.year, s);
			return (e.setFullYear(i, 0, 1), e.setHours(0, 0, 0, 0), e);
		}
		const a = !('era' in t) || t.era === 1 ? r.year : 1 - r.year;
		return (e.setFullYear(a, 0, 1), e.setHours(0, 0, 0, 0), e);
	}
}
class Br extends h {
	priority = 130;
	parse(e, t, r) {
		const s = (a) => ({ year: a, isTwoDigitYear: t === 'YY' });
		switch (t) {
			case 'Y':
				return k(b(4, e), s);
			case 'Yo':
				return k(r.ordinalNumber(e, { unit: 'year' }), s);
			default:
				return k(b(t.length, e), s);
		}
	}
	validate(e, t) {
		return t.isTwoDigitYear || t.year > 0;
	}
	set(e, t, r, s) {
		const a = Ie(e, s);
		if (r.isTwoDigitYear) {
			const l = ht(r.year, a);
			return (e.setFullYear(l, 0, s.firstWeekContainsDate), e.setHours(0, 0, 0, 0), F(e, s));
		}
		const i = !('era' in t) || t.era === 1 ? r.year : 1 - r.year;
		return (e.setFullYear(i, 0, s.firstWeekContainsDate), e.setHours(0, 0, 0, 0), F(e, s));
	}
	incompatibleTokens = ['y', 'R', 'u', 'Q', 'q', 'M', 'L', 'I', 'd', 'D', 'i', 't', 'T'];
}
class Gr extends h {
	priority = 130;
	parse(e, t) {
		return ce(t === 'R' ? 4 : t.length, e);
	}
	set(e, t, r) {
		const s = D(e, 0);
		return (s.setFullYear(r, 0, 4), s.setHours(0, 0, 0, 0), j(s));
	}
	incompatibleTokens = ['G', 'y', 'Y', 'u', 'Q', 'q', 'M', 'L', 'w', 'd', 'D', 'e', 'c', 't', 'T'];
}
class Ur extends h {
	priority = 130;
	parse(e, t) {
		return ce(t === 'u' ? 4 : t.length, e);
	}
	set(e, t, r) {
		return (e.setFullYear(r, 0, 1), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['G', 'y', 'Y', 'R', 'w', 'I', 'i', 'e', 'c', 't', 'T'];
}
class zr extends h {
	priority = 120;
	parse(e, t, r) {
		switch (t) {
			case 'Q':
			case 'QQ':
				return b(t.length, e);
			case 'Qo':
				return r.ordinalNumber(e, { unit: 'quarter' });
			case 'QQQ':
				return r.quarter(e, { width: 'abbreviated', context: 'formatting' }) || r.quarter(e, { width: 'narrow', context: 'formatting' });
			case 'QQQQQ':
				return r.quarter(e, { width: 'narrow', context: 'formatting' });
			case 'QQQQ':
			default:
				return (
					r.quarter(e, { width: 'wide', context: 'formatting' }) ||
					r.quarter(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.quarter(e, { width: 'narrow', context: 'formatting' })
				);
		}
	}
	validate(e, t) {
		return t >= 1 && t <= 4;
	}
	set(e, t, r) {
		return (e.setMonth((r - 1) * 3, 1), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['Y', 'R', 'q', 'M', 'L', 'w', 'I', 'd', 'D', 'i', 'e', 'c', 't', 'T'];
}
class Ar extends h {
	priority = 120;
	parse(e, t, r) {
		switch (t) {
			case 'q':
			case 'qq':
				return b(t.length, e);
			case 'qo':
				return r.ordinalNumber(e, { unit: 'quarter' });
			case 'qqq':
				return r.quarter(e, { width: 'abbreviated', context: 'standalone' }) || r.quarter(e, { width: 'narrow', context: 'standalone' });
			case 'qqqqq':
				return r.quarter(e, { width: 'narrow', context: 'standalone' });
			case 'qqqq':
			default:
				return (
					r.quarter(e, { width: 'wide', context: 'standalone' }) ||
					r.quarter(e, { width: 'abbreviated', context: 'standalone' }) ||
					r.quarter(e, { width: 'narrow', context: 'standalone' })
				);
		}
	}
	validate(e, t) {
		return t >= 1 && t <= 4;
	}
	set(e, t, r) {
		return (e.setMonth((r - 1) * 3, 1), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['Y', 'R', 'Q', 'M', 'L', 'w', 'I', 'd', 'D', 'i', 'e', 'c', 't', 'T'];
}
class Xr extends h {
	incompatibleTokens = ['Y', 'R', 'q', 'Q', 'L', 'w', 'I', 'D', 'i', 'e', 'c', 't', 'T'];
	priority = 110;
	parse(e, t, r) {
		const s = (a) => a - 1;
		switch (t) {
			case 'M':
				return k(y(x.month, e), s);
			case 'MM':
				return k(b(2, e), s);
			case 'Mo':
				return k(r.ordinalNumber(e, { unit: 'month' }), s);
			case 'MMM':
				return r.month(e, { width: 'abbreviated', context: 'formatting' }) || r.month(e, { width: 'narrow', context: 'formatting' });
			case 'MMMMM':
				return r.month(e, { width: 'narrow', context: 'formatting' });
			case 'MMMM':
			default:
				return (
					r.month(e, { width: 'wide', context: 'formatting' }) ||
					r.month(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.month(e, { width: 'narrow', context: 'formatting' })
				);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 11;
	}
	set(e, t, r) {
		return (e.setMonth(r, 1), e.setHours(0, 0, 0, 0), e);
	}
}
class $r extends h {
	priority = 110;
	parse(e, t, r) {
		const s = (a) => a - 1;
		switch (t) {
			case 'L':
				return k(y(x.month, e), s);
			case 'LL':
				return k(b(2, e), s);
			case 'Lo':
				return k(r.ordinalNumber(e, { unit: 'month' }), s);
			case 'LLL':
				return r.month(e, { width: 'abbreviated', context: 'standalone' }) || r.month(e, { width: 'narrow', context: 'standalone' });
			case 'LLLLL':
				return r.month(e, { width: 'narrow', context: 'standalone' });
			case 'LLLL':
			default:
				return (
					r.month(e, { width: 'wide', context: 'standalone' }) ||
					r.month(e, { width: 'abbreviated', context: 'standalone' }) ||
					r.month(e, { width: 'narrow', context: 'standalone' })
				);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 11;
	}
	set(e, t, r) {
		return (e.setMonth(r, 1), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['Y', 'R', 'q', 'Q', 'M', 'w', 'I', 'D', 'i', 'e', 'c', 't', 'T'];
}
function Zr(n, e, t) {
	const r = d(n, t?.in),
		s = ot(r, t) - e;
	return (r.setDate(r.getDate() - s * 7), d(r, t?.in));
}
class jr extends h {
	priority = 100;
	parse(e, t, r) {
		switch (t) {
			case 'w':
				return y(x.week, e);
			case 'wo':
				return r.ordinalNumber(e, { unit: 'week' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		return t >= 1 && t <= 53;
	}
	set(e, t, r, s) {
		return F(Zr(e, r, s), s);
	}
	incompatibleTokens = ['y', 'R', 'u', 'q', 'Q', 'M', 'L', 'I', 'd', 'D', 'i', 't', 'T'];
}
function Vr(n, e, t) {
	const r = d(n, t?.in),
		s = it(r, t) - e;
	return (r.setDate(r.getDate() - s * 7), r);
}
class Kr extends h {
	priority = 100;
	parse(e, t, r) {
		switch (t) {
			case 'I':
				return y(x.week, e);
			case 'Io':
				return r.ordinalNumber(e, { unit: 'week' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		return t >= 1 && t <= 53;
	}
	set(e, t, r) {
		return j(Vr(e, r));
	}
	incompatibleTokens = ['y', 'Y', 'u', 'q', 'Q', 'M', 'L', 'w', 'd', 'D', 'e', 'c', 't', 'T'];
}
const Jr = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31],
	Sr = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
class en extends h {
	priority = 90;
	subPriority = 1;
	parse(e, t, r) {
		switch (t) {
			case 'd':
				return y(x.date, e);
			case 'do':
				return r.ordinalNumber(e, { unit: 'date' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		const r = e.getFullYear(),
			s = wt(r),
			a = e.getMonth();
		return s ? t >= 1 && t <= Sr[a] : t >= 1 && t <= Jr[a];
	}
	set(e, t, r) {
		return (e.setDate(r), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['Y', 'R', 'q', 'Q', 'w', 'I', 'D', 'i', 'e', 'c', 't', 'T'];
}
class tn extends h {
	priority = 90;
	subpriority = 1;
	parse(e, t, r) {
		switch (t) {
			case 'D':
			case 'DD':
				return y(x.dayOfYear, e);
			case 'Do':
				return r.ordinalNumber(e, { unit: 'date' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		const r = e.getFullYear();
		return wt(r) ? t >= 1 && t <= 366 : t >= 1 && t <= 365;
	}
	set(e, t, r) {
		return (e.setMonth(0, r), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['Y', 'R', 'q', 'Q', 'M', 'L', 'w', 'I', 'd', 'E', 'i', 'e', 'c', 't', 'T'];
}
function qe(n, e, t) {
	const r = $(),
		s = t?.weekStartsOn ?? t?.locale?.options?.weekStartsOn ?? r.weekStartsOn ?? r.locale?.options?.weekStartsOn ?? 0,
		a = d(n, t?.in),
		i = a.getDay(),
		m = ((e % 7) + 7) % 7,
		w = 7 - s,
		o = e < 0 || e > 6 ? e - ((i + w) % 7) : ((m + w) % 7) - ((i + w) % 7);
	return de(a, o, t);
}
class rn extends h {
	priority = 90;
	parse(e, t, r) {
		switch (t) {
			case 'E':
			case 'EE':
			case 'EEE':
				return (
					r.day(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.day(e, { width: 'short', context: 'formatting' }) ||
					r.day(e, { width: 'narrow', context: 'formatting' })
				);
			case 'EEEEE':
				return r.day(e, { width: 'narrow', context: 'formatting' });
			case 'EEEEEE':
				return r.day(e, { width: 'short', context: 'formatting' }) || r.day(e, { width: 'narrow', context: 'formatting' });
			case 'EEEE':
			default:
				return (
					r.day(e, { width: 'wide', context: 'formatting' }) ||
					r.day(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.day(e, { width: 'short', context: 'formatting' }) ||
					r.day(e, { width: 'narrow', context: 'formatting' })
				);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 6;
	}
	set(e, t, r, s) {
		return ((e = qe(e, r, s)), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['D', 'i', 'e', 'c', 't', 'T'];
}
class nn extends h {
	priority = 90;
	parse(e, t, r, s) {
		const a = (i) => {
			const l = Math.floor((i - 1) / 7) * 7;
			return ((i + s.weekStartsOn + 6) % 7) + l;
		};
		switch (t) {
			case 'e':
			case 'ee':
				return k(b(t.length, e), a);
			case 'eo':
				return k(r.ordinalNumber(e, { unit: 'day' }), a);
			case 'eee':
				return (
					r.day(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.day(e, { width: 'short', context: 'formatting' }) ||
					r.day(e, { width: 'narrow', context: 'formatting' })
				);
			case 'eeeee':
				return r.day(e, { width: 'narrow', context: 'formatting' });
			case 'eeeeee':
				return r.day(e, { width: 'short', context: 'formatting' }) || r.day(e, { width: 'narrow', context: 'formatting' });
			case 'eeee':
			default:
				return (
					r.day(e, { width: 'wide', context: 'formatting' }) ||
					r.day(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.day(e, { width: 'short', context: 'formatting' }) ||
					r.day(e, { width: 'narrow', context: 'formatting' })
				);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 6;
	}
	set(e, t, r, s) {
		return ((e = qe(e, r, s)), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['y', 'R', 'u', 'q', 'Q', 'M', 'L', 'I', 'd', 'D', 'E', 'i', 'c', 't', 'T'];
}
class sn extends h {
	priority = 90;
	parse(e, t, r, s) {
		const a = (i) => {
			const l = Math.floor((i - 1) / 7) * 7;
			return ((i + s.weekStartsOn + 6) % 7) + l;
		};
		switch (t) {
			case 'c':
			case 'cc':
				return k(b(t.length, e), a);
			case 'co':
				return k(r.ordinalNumber(e, { unit: 'day' }), a);
			case 'ccc':
				return (
					r.day(e, { width: 'abbreviated', context: 'standalone' }) ||
					r.day(e, { width: 'short', context: 'standalone' }) ||
					r.day(e, { width: 'narrow', context: 'standalone' })
				);
			case 'ccccc':
				return r.day(e, { width: 'narrow', context: 'standalone' });
			case 'cccccc':
				return r.day(e, { width: 'short', context: 'standalone' }) || r.day(e, { width: 'narrow', context: 'standalone' });
			case 'cccc':
			default:
				return (
					r.day(e, { width: 'wide', context: 'standalone' }) ||
					r.day(e, { width: 'abbreviated', context: 'standalone' }) ||
					r.day(e, { width: 'short', context: 'standalone' }) ||
					r.day(e, { width: 'narrow', context: 'standalone' })
				);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 6;
	}
	set(e, t, r, s) {
		return ((e = qe(e, r, s)), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['y', 'R', 'u', 'q', 'Q', 'M', 'L', 'I', 'd', 'D', 'E', 'i', 'e', 't', 'T'];
}
function an(n, e, t) {
	const r = d(n, t?.in),
		s = Ir(r, t),
		a = e - s;
	return de(r, a, t);
}
class on extends h {
	priority = 90;
	parse(e, t, r) {
		const s = (a) => (a === 0 ? 7 : a);
		switch (t) {
			case 'i':
			case 'ii':
				return b(t.length, e);
			case 'io':
				return r.ordinalNumber(e, { unit: 'day' });
			case 'iii':
				return k(
					r.day(e, { width: 'abbreviated', context: 'formatting' }) ||
						r.day(e, { width: 'short', context: 'formatting' }) ||
						r.day(e, { width: 'narrow', context: 'formatting' }),
					s
				);
			case 'iiiii':
				return k(r.day(e, { width: 'narrow', context: 'formatting' }), s);
			case 'iiiiii':
				return k(r.day(e, { width: 'short', context: 'formatting' }) || r.day(e, { width: 'narrow', context: 'formatting' }), s);
			case 'iiii':
			default:
				return k(
					r.day(e, { width: 'wide', context: 'formatting' }) ||
						r.day(e, { width: 'abbreviated', context: 'formatting' }) ||
						r.day(e, { width: 'short', context: 'formatting' }) ||
						r.day(e, { width: 'narrow', context: 'formatting' }),
					s
				);
		}
	}
	validate(e, t) {
		return t >= 1 && t <= 7;
	}
	set(e, t, r) {
		return ((e = an(e, r)), e.setHours(0, 0, 0, 0), e);
	}
	incompatibleTokens = ['y', 'Y', 'u', 'q', 'Q', 'M', 'L', 'w', 'd', 'D', 'E', 'e', 'c', 't', 'T'];
}
class cn extends h {
	priority = 80;
	parse(e, t, r) {
		switch (t) {
			case 'a':
			case 'aa':
			case 'aaa':
				return r.dayPeriod(e, { width: 'abbreviated', context: 'formatting' }) || r.dayPeriod(e, { width: 'narrow', context: 'formatting' });
			case 'aaaaa':
				return r.dayPeriod(e, { width: 'narrow', context: 'formatting' });
			case 'aaaa':
			default:
				return (
					r.dayPeriod(e, { width: 'wide', context: 'formatting' }) ||
					r.dayPeriod(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.dayPeriod(e, { width: 'narrow', context: 'formatting' })
				);
		}
	}
	set(e, t, r) {
		return (e.setHours(He(r), 0, 0, 0), e);
	}
	incompatibleTokens = ['b', 'B', 'H', 'k', 't', 'T'];
}
class un extends h {
	priority = 80;
	parse(e, t, r) {
		switch (t) {
			case 'b':
			case 'bb':
			case 'bbb':
				return r.dayPeriod(e, { width: 'abbreviated', context: 'formatting' }) || r.dayPeriod(e, { width: 'narrow', context: 'formatting' });
			case 'bbbbb':
				return r.dayPeriod(e, { width: 'narrow', context: 'formatting' });
			case 'bbbb':
			default:
				return (
					r.dayPeriod(e, { width: 'wide', context: 'formatting' }) ||
					r.dayPeriod(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.dayPeriod(e, { width: 'narrow', context: 'formatting' })
				);
		}
	}
	set(e, t, r) {
		return (e.setHours(He(r), 0, 0, 0), e);
	}
	incompatibleTokens = ['a', 'B', 'H', 'k', 't', 'T'];
}
class dn extends h {
	priority = 80;
	parse(e, t, r) {
		switch (t) {
			case 'B':
			case 'BB':
			case 'BBB':
				return r.dayPeriod(e, { width: 'abbreviated', context: 'formatting' }) || r.dayPeriod(e, { width: 'narrow', context: 'formatting' });
			case 'BBBBB':
				return r.dayPeriod(e, { width: 'narrow', context: 'formatting' });
			case 'BBBB':
			default:
				return (
					r.dayPeriod(e, { width: 'wide', context: 'formatting' }) ||
					r.dayPeriod(e, { width: 'abbreviated', context: 'formatting' }) ||
					r.dayPeriod(e, { width: 'narrow', context: 'formatting' })
				);
		}
	}
	set(e, t, r) {
		return (e.setHours(He(r), 0, 0, 0), e);
	}
	incompatibleTokens = ['a', 'b', 't', 'T'];
}
class ln extends h {
	priority = 70;
	parse(e, t, r) {
		switch (t) {
			case 'h':
				return y(x.hour12h, e);
			case 'ho':
				return r.ordinalNumber(e, { unit: 'hour' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		return t >= 1 && t <= 12;
	}
	set(e, t, r) {
		const s = e.getHours() >= 12;
		return (s && r < 12 ? e.setHours(r + 12, 0, 0, 0) : !s && r === 12 ? e.setHours(0, 0, 0, 0) : e.setHours(r, 0, 0, 0), e);
	}
	incompatibleTokens = ['H', 'K', 'k', 't', 'T'];
}
class fn extends h {
	priority = 70;
	parse(e, t, r) {
		switch (t) {
			case 'H':
				return y(x.hour23h, e);
			case 'Ho':
				return r.ordinalNumber(e, { unit: 'hour' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 23;
	}
	set(e, t, r) {
		return (e.setHours(r, 0, 0, 0), e);
	}
	incompatibleTokens = ['a', 'b', 'h', 'K', 'k', 't', 'T'];
}
class hn extends h {
	priority = 70;
	parse(e, t, r) {
		switch (t) {
			case 'K':
				return y(x.hour11h, e);
			case 'Ko':
				return r.ordinalNumber(e, { unit: 'hour' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 11;
	}
	set(e, t, r) {
		return (e.getHours() >= 12 && r < 12 ? e.setHours(r + 12, 0, 0, 0) : e.setHours(r, 0, 0, 0), e);
	}
	incompatibleTokens = ['h', 'H', 'k', 't', 'T'];
}
class wn extends h {
	priority = 70;
	parse(e, t, r) {
		switch (t) {
			case 'k':
				return y(x.hour24h, e);
			case 'ko':
				return r.ordinalNumber(e, { unit: 'hour' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		return t >= 1 && t <= 24;
	}
	set(e, t, r) {
		const s = r <= 24 ? r % 24 : r;
		return (e.setHours(s, 0, 0, 0), e);
	}
	incompatibleTokens = ['a', 'b', 'h', 'H', 'K', 't', 'T'];
}
class gn extends h {
	priority = 60;
	parse(e, t, r) {
		switch (t) {
			case 'm':
				return y(x.minute, e);
			case 'mo':
				return r.ordinalNumber(e, { unit: 'minute' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 59;
	}
	set(e, t, r) {
		return (e.setMinutes(r, 0, 0), e);
	}
	incompatibleTokens = ['t', 'T'];
}
class mn extends h {
	priority = 50;
	parse(e, t, r) {
		switch (t) {
			case 's':
				return y(x.second, e);
			case 'so':
				return r.ordinalNumber(e, { unit: 'second' });
			default:
				return b(t.length, e);
		}
	}
	validate(e, t) {
		return t >= 0 && t <= 59;
	}
	set(e, t, r) {
		return (e.setSeconds(r, 0), e);
	}
	incompatibleTokens = ['t', 'T'];
}
class pn extends h {
	priority = 30;
	parse(e, t) {
		const r = (s) => Math.trunc(s * Math.pow(10, -t.length + 3));
		return k(b(t.length, e), r);
	}
	set(e, t, r) {
		return (e.setMilliseconds(r), e);
	}
	incompatibleTokens = ['t', 'T'];
}
class yn extends h {
	priority = 10;
	parse(e, t) {
		switch (t) {
			case 'X':
				return L(W.basicOptionalMinutes, e);
			case 'XX':
				return L(W.basic, e);
			case 'XXXX':
				return L(W.basicOptionalSeconds, e);
			case 'XXXXX':
				return L(W.extendedOptionalSeconds, e);
			case 'XXX':
			default:
				return L(W.extended, e);
		}
	}
	set(e, t, r) {
		return t.timestampIsSet ? e : D(e, e.getTime() - oe(e) - r);
	}
	incompatibleTokens = ['t', 'T', 'x'];
}
class bn extends h {
	priority = 10;
	parse(e, t) {
		switch (t) {
			case 'x':
				return L(W.basicOptionalMinutes, e);
			case 'xx':
				return L(W.basic, e);
			case 'xxxx':
				return L(W.basicOptionalSeconds, e);
			case 'xxxxx':
				return L(W.extendedOptionalSeconds, e);
			case 'xxx':
			default:
				return L(W.extended, e);
		}
	}
	set(e, t, r) {
		return t.timestampIsSet ? e : D(e, e.getTime() - oe(e) - r);
	}
	incompatibleTokens = ['t', 'T', 'X'];
}
class xn extends h {
	priority = 40;
	parse(e) {
		return ft(e);
	}
	set(e, t, r) {
		return [D(e, r * 1e3), { timestampIsSet: !0 }];
	}
	incompatibleTokens = '*';
}
class kn extends h {
	priority = 20;
	parse(e) {
		return ft(e);
	}
	set(e, t, r) {
		return [D(e, r), { timestampIsSet: !0 }];
	}
	incompatibleTokens = '*';
}
const Dn = {
		G: new Qr(),
		y: new Rr(),
		Y: new Br(),
		R: new Gr(),
		u: new Ur(),
		Q: new zr(),
		q: new Ar(),
		M: new Xr(),
		L: new $r(),
		w: new jr(),
		I: new Kr(),
		d: new en(),
		D: new tn(),
		E: new rn(),
		e: new nn(),
		c: new sn(),
		i: new on(),
		a: new cn(),
		b: new un(),
		B: new dn(),
		h: new ln(),
		H: new fn(),
		K: new hn(),
		k: new wn(),
		m: new gn(),
		s: new mn(),
		S: new pn(),
		X: new yn(),
		x: new bn(),
		t: new xn(),
		T: new kn()
	},
	vn = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g,
	Tn = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g,
	Mn = /^'([^]*?)'?$/,
	On = /''/g,
	_n = /\S/,
	Yn = /[a-zA-Z]/;
function Pn(n, e, t, r) {
	const s = () => D(r?.in || t, NaN),
		a = Er(),
		i = r?.locale ?? a.locale ?? et,
		l =
			r?.firstWeekContainsDate ??
			r?.locale?.options?.firstWeekContainsDate ??
			a.firstWeekContainsDate ??
			a.locale?.options?.firstWeekContainsDate ??
			1,
		m = r?.weekStartsOn ?? r?.locale?.options?.weekStartsOn ?? a.weekStartsOn ?? a.locale?.options?.weekStartsOn ?? 0;
	if (!e) return n ? s() : d(t, r?.in);
	const w = { firstWeekContainsDate: l, weekStartsOn: m, locale: i },
		o = [new Fr(r?.in, t)],
		p = e
			.match(Tn)
			.map((u) => {
				const f = u[0];
				if (f in Ye) {
					const v = Ye[f];
					return v(u, i.formatLong);
				}
				return u;
			})
			.join('')
			.match(vn),
		Q = [];
	for (let u of p) {
		(!r?.useAdditionalWeekYearTokens && dt(u) && Pe(u, e, n), !r?.useAdditionalDayOfYearTokens && ut(u) && Pe(u, e, n));
		const f = u[0],
			v = Dn[f];
		if (v) {
			const { incompatibleTokens: U } = v;
			if (Array.isArray(U)) {
				const V = Q.find((z) => U.includes(z.token) || z.token === f);
				if (V) throw new RangeError(`The format string mustn't contain \`${V.fullToken}\` and \`${u}\` at the same time`);
			} else if (v.incompatibleTokens === '*' && Q.length > 0)
				throw new RangeError(`The format string mustn't contain \`${u}\` and any other token at the same time`);
			Q.push({ token: f, fullToken: u });
			const R = v.run(n, u, i.match, w);
			if (!R) return s();
			(o.push(R.setter), (n = R.rest));
		} else {
			if (f.match(Yn)) throw new RangeError('Format string contains an unescaped latin alphabet character `' + f + '`');
			if ((u === "''" ? (u = "'") : f === "'" && (u = Cn(u)), n.indexOf(u) === 0)) n = n.slice(u.length);
			else return s();
		}
	}
	if (n.length > 0 && _n.test(n)) return s();
	const le = o
		.map((u) => u.priority)
		.sort((u, f) => f - u)
		.filter((u, f, v) => v.indexOf(u) === f)
		.map((u) => o.filter((f) => f.priority === u).sort((f, v) => v.subPriority - f.subPriority))
		.map((u) => u[0]);
	let _ = d(t, r?.in);
	if (isNaN(+_)) return s();
	const Y = {};
	for (const u of le) {
		if (!u.validate(_, w)) return s();
		const f = u.set(_, Y, w);
		Array.isArray(f) ? ((_ = f[0]), Object.assign(Y, f[1])) : (_ = f);
	}
	return _;
}
function Cn(n) {
	return n.match(Mn)[1].replace(On, "'");
}
function Nn(n, e) {
	const t = d(n, e?.in);
	return (t.setMinutes(0, 0, 0), t);
}
function En(n, e) {
	const t = d(n, e?.in);
	return (t.setSeconds(0, 0), t);
}
function In(n, e) {
	const t = d(n, e?.in);
	return (t.setMilliseconds(0), t);
}
function Hn(n, e) {
	const t = () => D(e?.in, NaN),
		r = e?.additionalDigits ?? 2,
		s = Fn(n);
	let a;
	if (s.date) {
		const w = Qn(s.date, r);
		a = Rn(w.restDateString, w.year);
	}
	if (!a || isNaN(+a)) return t();
	const i = +a;
	let l = 0,
		m;
	if (s.time && ((l = Bn(s.time)), isNaN(l))) return t();
	if (s.timezone) {
		if (((m = Gn(s.timezone)), isNaN(m))) return t();
	} else {
		const w = new Date(i + l),
			o = d(0, e?.in);
		return (
			o.setFullYear(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()),
			o.setHours(w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds()),
			o
		);
	}
	return d(i + l + m, e?.in);
}
const ie = { dateTimeDelimiter: /[T ]/, timeZoneDelimiter: /[Z ]/i, timezone: /([Z+-].*)$/ },
	qn = /^-?(?:(\d{3})|(\d{2})(?:-?(\d{2}))?|W(\d{2})(?:-?(\d{1}))?|)$/,
	Wn = /^(\d{2}(?:[.,]\d*)?)(?::?(\d{2}(?:[.,]\d*)?))?(?::?(\d{2}(?:[.,]\d*)?))?$/,
	Ln = /^([+-])(\d{2})(?::?(\d{2}))?$/;
function Fn(n) {
	const e = {},
		t = n.split(ie.dateTimeDelimiter);
	let r;
	if (t.length > 2) return e;
	if (
		(/:/.test(t[0])
			? (r = t[0])
			: ((e.date = t[0]),
				(r = t[1]),
				ie.timeZoneDelimiter.test(e.date) && ((e.date = n.split(ie.timeZoneDelimiter)[0]), (r = n.substr(e.date.length, n.length)))),
		r)
	) {
		const s = ie.timezone.exec(r);
		s ? ((e.time = r.replace(s[1], '')), (e.timezone = s[1])) : (e.time = r);
	}
	return e;
}
function Qn(n, e) {
	const t = new RegExp('^(?:(\\d{4}|[+-]\\d{' + (4 + e) + '})|(\\d{2}|[+-]\\d{' + (2 + e) + '})$)'),
		r = n.match(t);
	if (!r) return { year: NaN, restDateString: '' };
	const s = r[1] ? parseInt(r[1]) : null,
		a = r[2] ? parseInt(r[2]) : null;
	return { year: a === null ? s : a * 100, restDateString: n.slice((r[1] || r[2]).length) };
}
function Rn(n, e) {
	if (e === null) return new Date(NaN);
	const t = n.match(qn);
	if (!t) return new Date(NaN);
	const r = !!t[4],
		s = J(t[1]),
		a = J(t[2]) - 1,
		i = J(t[3]),
		l = J(t[4]),
		m = J(t[5]) - 1;
	if (r) return $n(e, l, m) ? Un(e, l, m) : new Date(NaN);
	{
		const w = new Date(0);
		return !An(e, a, i) || !Xn(e, s) ? new Date(NaN) : (w.setUTCFullYear(e, a, Math.max(s, i)), w);
	}
}
function J(n) {
	return n ? parseInt(n) : 1;
}
function Bn(n) {
	const e = n.match(Wn);
	if (!e) return NaN;
	const t = Oe(e[1]),
		r = Oe(e[2]),
		s = Oe(e[3]);
	return Zn(t, r, s) ? t * S + r * te + s * 1e3 : NaN;
}
function Oe(n) {
	return (n && parseFloat(n.replace(',', '.'))) || 0;
}
function Gn(n) {
	if (n === 'Z') return 0;
	const e = n.match(Ln);
	if (!e) return 0;
	const t = e[1] === '+' ? -1 : 1,
		r = parseInt(e[2]),
		s = (e[3] && parseInt(e[3])) || 0;
	return jn(r, s) ? t * (r * S + s * te) : NaN;
}
function Un(n, e, t) {
	const r = new Date(0);
	r.setUTCFullYear(n, 0, 4);
	const s = r.getUTCDay() || 7,
		a = (e - 1) * 7 + t + 1 - s;
	return (r.setUTCDate(r.getUTCDate() + a), r);
}
const zn = [31, null, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function gt(n) {
	return n % 400 === 0 || (n % 4 === 0 && n % 100 !== 0);
}
function An(n, e, t) {
	return e >= 0 && e <= 11 && t >= 1 && t <= (zn[e] || (gt(n) ? 29 : 28));
}
function Xn(n, e) {
	return e >= 1 && e <= (gt(n) ? 366 : 365);
}
function $n(n, e, t) {
	return e >= 1 && e <= 53 && t >= 0 && t <= 6;
}
function Zn(n, e, t) {
	return n === 24 ? e === 0 && t === 0 : t >= 0 && t < 60 && e >= 0 && e < 60 && n >= 0 && n < 25;
}
function jn(n, e) {
	return e >= 0 && e <= 59;
}
const Vn = {
	datetime: 'MMM d, yyyy, h:mm:ss aaaa',
	millisecond: 'h:mm:ss.SSS aaaa',
	second: 'h:mm:ss aaaa',
	minute: 'h:mm aaaa',
	hour: 'ha',
	day: 'MMM d',
	week: 'PP',
	month: 'MMM yyyy',
	quarter: 'qqq - yyyy',
	year: 'yyyy'
};
Wt._date.override({
	_id: 'date-fns',
	formats: function () {
		return Vn;
	},
	parse: function (n, e) {
		if (n === null || typeof n > 'u') return null;
		const t = typeof n;
		return (
			t === 'number' || n instanceof Date
				? (n = d(n))
				: t === 'string' && (typeof e == 'string' ? (n = Pn(n, e, new Date(), this.options)) : (n = Hn(n, this.options))),
			nt(n) ? n.getTime() : null
		);
	},
	format: function (n, e) {
		return Cr(n, e, this.options);
	},
	add: function (n, e, t) {
		switch (t) {
			case 'millisecond':
				return Ee(n, e);
			case 'second':
				return er(n, e);
			case 'minute':
				return Jt(n, e);
			case 'hour':
				return Vt(n, e);
			case 'day':
				return de(n, e);
			case 'week':
				return tr(n, e);
			case 'month':
				return Ne(n, e);
			case 'quarter':
				return St(n, e);
			case 'year':
				return rr(n, e);
			default:
				return n;
		}
	},
	diff: function (n, e, t) {
		switch (t) {
			case 'millisecond':
				return Ke(n, e);
			case 'second':
				return Zt(n, e);
			case 'minute':
				return ir(n, e);
			case 'hour':
				return ar(n, e);
			case 'day':
				return st(n, e);
			case 'week':
				return cr(n, e);
			case 'month':
				return Je(n, e);
			case 'quarter':
				return or(n, e);
			case 'year':
				return ur(n, e);
			default:
				return 0;
		}
	},
	startOf: function (n, e, t) {
		switch (e) {
			case 'second':
				return In(n);
			case 'minute':
				return En(n);
			case 'hour':
				return Nn(n);
			case 'day':
				return _e(n);
			case 'week':
				return F(n);
			case 'isoWeek':
				return F(n, { weekStartsOn: +t });
			case 'month':
				return lr(n);
			case 'quarter':
				return dr(n);
			case 'year':
				return at(n);
			default:
				return n;
		}
	},
	endOf: function (n, e) {
		switch (e) {
			case 'second':
				return pr(n);
			case 'minute':
				return gr(n);
			case 'hour':
				return hr(n);
			case 'day':
				return $t(n);
			case 'week':
				return wr(n);
			case 'month':
				return Xt(n);
			case 'quarter':
				return mr(n);
			case 'year':
				return fr(n);
			default:
				return n;
		}
	}
});
const ls = { name: 'CPU Usage', icon: 'mdi:cpu-64-bit', defaultSize: { w: 1, h: 2 } };
var Kn = Ce('<div><span>Cores: <span> </span></span> <span>Model: <span> </span></span></div>'),
	Jn = Ce(
		'<div class="flex h-full flex-col space-y-3"><div class="flex items-center justify-between"><div class="flex flex-col space-y-1"><div class="flex items-center space-x-2"><div class="relative"><div></div> <div></div></div> <span class="text-sm font-bold"> </span> <span>Current Usage</span></div></div> <div class="flex items-center gap-2 text-right"><div class="text-sm font-semibold"> </div> <div>Average</div></div></div> <div class="space-y-2"><div><div></div> <div class="absolute inset-0 h-full w-full animate-pulse bg-linear-to-r from-transparent via-white to-transparent opacity-20"></div></div></div> <div class="relative grow rounded-lg"><div class="relative h-full w-full"><canvas aria-label="CPU Usage Chart" class="h-full w-full" style="display: block; width: 100% !important; height: 100% !important;"></canvas></div></div> <!></div>'
	),
	Sn = Ce(
		'<div class="flex h-full flex-col items-center justify-center space-y-3"><div class="relative"><div class="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div></div> <div class="text-center"><div>Loading CPU data</div> <div>Please wait...</div></div></div>'
	);
function fs(n, e) {
	(Yt(e, !0), Me.register(Lt, Ft, Qt, Rt, Bt, Gt, Ut));
	const t = A(e, 'label', 3, 'CPU Usage'),
		r = A(e, 'theme', 3, 'light'),
		s = A(e, 'icon', 3, 'mdi:cpu-64-bit'),
		a = A(e, 'widgetId', 3, void 0),
		i = A(e, 'size', 19, () => ({ w: 1, h: 1 })),
		l = A(e, 'onSizeChange', 3, (Y) => {}),
		m = A(e, 'onRemove', 3, () => {});
	let w = ve(void 0),
		o = ve(void 0),
		p = ve(void 0);
	function Q(Y) {
		if (!c(p)) return;
		const f = Y?.cpuInfo?.historicalLoad;
		if (!f || !Array.isArray(f.usage) || !Array.isArray(f.timestamps)) {
			c(o) && ((c(o).data.labels = []), (c(o).data.datasets[0].data = []), c(o).update('none'));
			return;
		}
		const { usage: v = [], timestamps: U = [] } = f,
			R = [...v],
			z = [...U].map((N) => {
				try {
					return new Date(N).toLocaleTimeString();
				} catch {
					return 'Invalid Time';
				}
			}),
			P = i().w >= 3 || i().h >= 2 ? 12 : 10,
			C = i().w >= 3 ? 8 : 6;
		if (c(o))
			((c(o).data.labels = z),
				(c(o).data.datasets[0].data = R),
				(c(o).data.datasets[0].borderColor = r() === 'dark' ? 'rgba(99, 102, 241, 1)' : 'rgba(59, 130, 246, 1)'),
				(c(o).data.datasets[0].backgroundColor = r() === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(59, 130, 246, 0.1)'),
				c(o).options.scales?.x?.ticks &&
					((c(o).options.scales.x.ticks.color = r() === 'dark' ? '#9ca3af' : '#6b7280'),
					(c(o).options.scales.x.ticks.font = { size: P }),
					(c(o).options.scales.x.ticks.maxTicksLimit = C)),
				c(o).options.scales?.y?.ticks &&
					((c(o).options.scales.y.ticks.color = r() === 'dark' ? '#9ca3af' : '#6b7280'), (c(o).options.scales.y.ticks.font = { size: P })),
				c(o).options.scales?.x?.grid && (c(o).options.scales.x.grid.color = r() === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)'),
				c(o).options.scales?.y?.grid && (c(o).options.scales.y.grid.color = r() === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)'),
				c(o).update('none'));
		else {
			const N = Me.getChart(c(p));
			(N && N.destroy(),
				K(
					o,
					new Me(c(p), {
						type: 'line',
						data: {
							labels: z,
							datasets: [
								{
									label: 'CPU Usage (%)',
									data: R,
									borderColor: r() === 'dark' ? 'rgba(99, 102, 241, 1)' : 'rgba(59, 130, 246, 1)',
									backgroundColor: r() === 'dark' ? 'rgba(99, 102, 241, 0.1)' : 'rgba(59, 130, 246, 0.1)',
									fill: !0,
									tension: 0.4,
									borderWidth: 2,
									pointRadius: 0,
									pointHoverRadius: 5,
									pointBackgroundColor: r() === 'dark' ? 'rgba(99, 102, 241, 1)' : 'rgba(59, 130, 246, 1)',
									pointBorderColor: r() === 'dark' ? '#1f2937' : '#ffffff',
									pointBorderWidth: 2
								}
							]
						},
						options: {
							responsive: !0,
							maintainAspectRatio: !1,
							layout: { padding: { top: 10, right: 10, bottom: 10, left: 10 } },
							scales: {
								x: {
									display: !0,
									ticks: { color: r() === 'dark' ? '#9ca3af' : '#6b7280', maxTicksLimit: C, autoSkip: !0, font: { size: P } },
									grid: { display: !0, color: r() === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)', lineWidth: 1 },
									border: { display: !1 }
								},
								y: {
									display: !0,
									beginAtZero: !0,
									max: 100,
									ticks: { color: r() === 'dark' ? '#9ca3af' : '#6b7280', stepSize: 25, callback: (H) => H + '%', font: { size: P } },
									grid: { display: !0, color: r() === 'dark' ? 'rgba(156, 163, 175, 0.1)' : 'rgba(107, 114, 128, 0.1)', lineWidth: 1 },
									border: { display: !1 }
								}
							},
							plugins: {
								legend: { display: !1 },
								tooltip: {
									enabled: !0,
									backgroundColor: r() === 'dark' ? 'rgba(17, 24, 39, 0.9)' : 'rgba(255, 255, 255, 0.9)',
									titleColor: r() === 'dark' ? '#f9fafb' : '#111827',
									bodyColor: r() === 'dark' ? '#d1d5db' : '#374151',
									borderColor: r() === 'dark' ? 'rgba(99, 102, 241, 0.5)' : 'rgba(59, 130, 246, 0.5)',
									borderWidth: 1,
									cornerRadius: 8,
									displayColors: !1,
									callbacks: { title: (H) => H[0].label, label: (H) => `CPU: ${parseFloat(H.raw).toFixed(1)}%` }
								}
							},
							interaction: { mode: 'nearest', axis: 'x', intersect: !1 },
							animation: { duration: 750, easing: 'easeInOutQuart' }
						}
					}),
					!0
				));
		}
	}
	function le(Y, u) {
		return (
			K(w, u, !0),
			{
				update(f) {
					K(w, f, !0);
				}
			}
		);
	}
	Pt(() => {
		c(p) && c(w)?.cpuInfo && Q(c(w));
	});
	let _;
	(Ot(() => {
		c(p) && c(o) && c(o).resize();
		const Y = c(p)?.parentElement?.parentElement;
		return (
			Y &&
				typeof ResizeObserver < 'u' &&
				((_ = new ResizeObserver(() => {
					c(o) && c(o).resize();
				})),
				_.observe(Y)),
			() => {
				_ && Y && _.disconnect();
			}
		);
	}),
		_t(() => {
			c(o) && (c(o).destroy(), K(o, void 0));
		}),
		jt(n, {
			get label() {
				return t();
			},
			get theme() {
				return r();
			},
			endpoint: '/api/dashboard/systemInfo?type=cpu',
			pollInterval: 5e3,
			get icon() {
				return s();
			},
			get widgetId() {
				return a();
			},
			get size() {
				return i();
			},
			get onSizeChange() {
				return l();
			},
			get onCloseRequest() {
				return m();
			},
			children: (u, f) => {
				let v = () => f?.().data;
				var U = It(),
					R = Nt(U);
				{
					var V = (P) => {
							const C = ne(() => Number(v()?.cpuInfo?.historicalLoad?.usage?.slice(-1)[0] || 0)),
								N = ne(() => v()?.cpuInfo?.historicalLoad?.usage || []),
								H = ne(() => (c(N).length > 0 ? Number(c(N).reduce((E, q) => E + q, 0) / c(N).length) : 0)),
								B = ne(() => (c(C) > 80 ? 'high' : c(C) > 50 ? 'medium' : 'low'));
							var fe = Jn(),
								he = T(fe),
								we = T(he),
								We = T(we),
								ge = T(We),
								Le = T(ge),
								mt = O(Le, 2);
							M(ge);
							var me = O(ge, 2),
								pt = T(me);
							M(me);
							var yt = O(me, 2);
							(M(We), M(we));
							var Fe = O(we, 2),
								pe = T(Fe),
								bt = T(pe);
							M(pe);
							var xt = O(pe, 2);
							(M(Fe), M(he));
							var ye = O(he, 2),
								be = T(ye),
								Qe = T(be);
							(Et(2), M(be), M(ye));
							var re = O(ye, 2),
								Re = T(re),
								Be = T(Re);
							(qt(
								Be,
								(E) => K(p, E),
								() => c(p)
							),
								Ht(Be, (E, q) => le?.(E, q), v),
								M(Re),
								M(re));
							var kt = O(re, 2);
							{
								var Dt = (E) => {
									var q = Kn(),
										xe = T(q),
										ke = O(T(xe)),
										vt = T(ke, !0);
									(M(ke), M(xe));
									var Ge = O(xe, 2),
										De = O(T(Ge)),
										Tt = T(De, !0);
									(M(De),
										M(Ge),
										M(q),
										Te(
											(Mt) => {
												(I(q, 1, `flex justify-between px-2 text-xs ${r() === 'dark' ? 'text-gray-300' : 'text-gray-700'}`),
													I(ke, 1, `font-bold ${r() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`),
													ae(vt, v()?.cpuInfo?.cores?.count || 'N/A'),
													I(De, 1, `font-bold ${r() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`),
													ae(Tt, Mt));
											},
											[() => v()?.cpuInfo?.cores?.perCore?.[0]?.model?.split(' ').slice(0, 2).join(' ') || 'Unknown']
										),
										se(E, q));
								};
								Ue(kt, (E) => {
									(i().w >= 2 || i().h >= 2) && E(Dt);
								});
							}
							(M(fe),
								Te(
									(E, q) => {
										(I(Le, 1, `h-3 w-3 rounded-full ${c(B) === 'high' ? 'bg-red-500' : c(B) === 'medium' ? 'bg-yellow-500' : 'bg-green-500'}`),
											I(
												mt,
												1,
												`absolute inset-0 h-3 w-3 rounded-full ${c(B) === 'high' ? 'bg-red-500' : c(B) === 'medium' ? 'bg-yellow-500' : 'bg-green-500'} animate-ping opacity-75`
											),
											ae(pt, `${E ?? ''}%`),
											I(yt, 1, `text-sm ${r() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`),
											ae(bt, `${q ?? ''}%`),
											I(xt, 1, `text-sm ${r() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`),
											I(be, 1, `relative h-2 overflow-hidden rounded-full ${r() === 'dark' ? 'bg-gray-700' : 'bg-gray-200'}`),
											I(
												Qe,
												1,
												`h-full rounded-full transition-all duration-700 ease-out ${c(B) === 'high' ? 'bg-linear-to-r from-red-500 to-red-600' : c(B) === 'medium' ? 'bg-linear-to-r from-yellow-500 to-orange-500' : 'bg-linear-to-r from-blue-500 to-blue-600'}`
											),
											ze(Qe, `width: ${c(C) ?? ''}%`),
											ze(re, `min-height: ${i().h >= 2 ? '150px' : '120px'}; height: 100%;`));
									},
									[() => c(C).toFixed(1), () => c(H).toFixed(1)]
								),
								se(P, fe));
						},
						z = (P) => {
							var C = Sn(),
								N = O(T(C), 2),
								H = T(N),
								B = O(H, 2);
							(M(N),
								M(C),
								Te(() => {
									(I(H, 1, `text-sm font-medium ${r() === 'dark' ? 'text-gray-300' : 'text-gray-700'}`),
										I(B, 1, `text-xs ${r() === 'dark' ? 'text-gray-400' : 'text-gray-500'}`));
								}),
								se(P, C));
						};
					Ue(R, (P) => {
						v()?.cpuInfo ? P(V) : P(z, !1);
					});
				}
				se(u, U);
			},
			$$slots: { default: !0 }
		}),
		Ct());
}
export { fs as default, ls as widgetMeta };
//# sourceMappingURL=5svsSMPa.js.map
