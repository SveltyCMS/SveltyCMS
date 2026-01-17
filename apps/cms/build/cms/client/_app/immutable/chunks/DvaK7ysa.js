const rt = 6048e5,
	it = 864e5,
	st = 6e4,
	ut = 36e5,
	ct = 1e3,
	dt = 43200,
	lt = 1440,
	y = Symbol.for('constructDateFrom');
function b(t, n) {
	return typeof t == 'function' ? t(n) : t && typeof t == 'object' && y in t ? t[y](n) : t instanceof Date ? new t.constructor(n) : new Date(n);
}
function c(t, n) {
	return b(n || t, t);
}
let p = {};
function ht() {
	return p;
}
function mt(t) {
	const n = c(t),
		e = new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds(), n.getMilliseconds()));
	return (e.setUTCFullYear(n.getFullYear()), +t - +e);
}
function M(t, ...n) {
	const e = b.bind(null, t || n.find((a) => typeof a == 'object'));
	return n.map(e);
}
function f(t, n) {
	const e = +c(t) - +c(n);
	return e < 0 ? -1 : e > 0 ? 1 : e;
}
function v(t, n, e) {
	const [a, o] = M(e?.in, t, n),
		i = a.getFullYear() - o.getFullYear(),
		r = a.getMonth() - o.getMonth();
	return i * 12 + r;
}
function P(t) {
	return (n) => {
		const a = (t ? Math[t] : Math.trunc)(n);
		return a === 0 ? 0 : a;
	};
}
function W(t, n) {
	return +c(t) - +c(n);
}
function D(t, n) {
	const e = c(t, n?.in);
	return (e.setHours(23, 59, 59, 999), e);
}
function k(t, n) {
	const e = c(t, n?.in),
		a = e.getMonth();
	return (e.setFullYear(e.getFullYear(), a + 1, 0), e.setHours(23, 59, 59, 999), e);
}
function S(t, n) {
	const e = c(t, n?.in);
	return +D(e, n) == +k(e, n);
}
function ft(t, n, e) {
	const [a, o, i] = M(e?.in, t, t, n),
		r = f(o, i),
		s = Math.abs(v(o, i));
	if (s < 1) return 0;
	(o.getMonth() === 1 && o.getDate() > 27 && o.setDate(30), o.setMonth(o.getMonth() - r * s));
	let d = f(o, i) === -r;
	S(a) && s === 1 && f(a, i) === 1 && (d = !1);
	const u = r * (s - +d);
	return u === 0 ? 0 : u;
}
function gt(t, n, e) {
	const a = W(t, n) / 1e3;
	return P(e?.roundingMethod)(a);
}
const F = {
		lessThanXSeconds: { one: 'less than a second', other: 'less than {{count}} seconds' },
		xSeconds: { one: '1 second', other: '{{count}} seconds' },
		halfAMinute: 'half a minute',
		lessThanXMinutes: { one: 'less than a minute', other: 'less than {{count}} minutes' },
		xMinutes: { one: '1 minute', other: '{{count}} minutes' },
		aboutXHours: { one: 'about 1 hour', other: 'about {{count}} hours' },
		xHours: { one: '1 hour', other: '{{count}} hours' },
		xDays: { one: '1 day', other: '{{count}} days' },
		aboutXWeeks: { one: 'about 1 week', other: 'about {{count}} weeks' },
		xWeeks: { one: '1 week', other: '{{count}} weeks' },
		aboutXMonths: { one: 'about 1 month', other: 'about {{count}} months' },
		xMonths: { one: '1 month', other: '{{count}} months' },
		aboutXYears: { one: 'about 1 year', other: 'about {{count}} years' },
		xYears: { one: '1 year', other: '{{count}} years' },
		overXYears: { one: 'over 1 year', other: 'over {{count}} years' },
		almostXYears: { one: 'almost 1 year', other: 'almost {{count}} years' }
	},
	C = (t, n, e) => {
		let a;
		const o = F[t];
		return (
			typeof o == 'string' ? (a = o) : n === 1 ? (a = o.one) : (a = o.other.replace('{{count}}', n.toString())),
			e?.addSuffix ? (e.comparison && e.comparison > 0 ? 'in ' + a : a + ' ago') : a
		);
	};
function g(t) {
	return (n = {}) => {
		const e = n.width ? String(n.width) : t.defaultWidth;
		return t.formats[e] || t.formats[t.defaultWidth];
	};
}
const A = { full: 'EEEE, MMMM do, y', long: 'MMMM do, y', medium: 'MMM d, y', short: 'MM/dd/yyyy' },
	j = { full: 'h:mm:ss a zzzz', long: 'h:mm:ss a z', medium: 'h:mm:ss a', short: 'h:mm a' },
	x = { full: "{{date}} 'at' {{time}}", long: "{{date}} 'at' {{time}}", medium: '{{date}}, {{time}}', short: '{{date}}, {{time}}' },
	T = {
		date: g({ formats: A, defaultWidth: 'full' }),
		time: g({ formats: j, defaultWidth: 'full' }),
		dateTime: g({ formats: x, defaultWidth: 'full' })
	},
	I = {
		lastWeek: "'last' eeee 'at' p",
		yesterday: "'yesterday at' p",
		today: "'today at' p",
		tomorrow: "'tomorrow at' p",
		nextWeek: "eeee 'at' p",
		other: 'P'
	},
	O = (t, n, e, a) => I[t];
function l(t) {
	return (n, e) => {
		const a = e?.context ? String(e.context) : 'standalone';
		let o;
		if (a === 'formatting' && t.formattingValues) {
			const r = t.defaultFormattingWidth || t.defaultWidth,
				s = e?.width ? String(e.width) : r;
			o = t.formattingValues[s] || t.formattingValues[r];
		} else {
			const r = t.defaultWidth,
				s = e?.width ? String(e.width) : t.defaultWidth;
			o = t.values[s] || t.values[r];
		}
		const i = t.argumentCallback ? t.argumentCallback(n) : n;
		return o[i];
	};
}
const _ = { narrow: ['B', 'A'], abbreviated: ['BC', 'AD'], wide: ['Before Christ', 'Anno Domini'] },
	z = { narrow: ['1', '2', '3', '4'], abbreviated: ['Q1', 'Q2', 'Q3', 'Q4'], wide: ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter'] },
	V = {
		narrow: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'],
		abbreviated: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
		wide: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
	},
	Y = {
		narrow: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
		short: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
		abbreviated: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
		wide: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
	},
	q = {
		narrow: { am: 'a', pm: 'p', midnight: 'mi', noon: 'n', morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' },
		abbreviated: {
			am: 'AM',
			pm: 'PM',
			midnight: 'midnight',
			noon: 'noon',
			morning: 'morning',
			afternoon: 'afternoon',
			evening: 'evening',
			night: 'night'
		},
		wide: {
			am: 'a.m.',
			pm: 'p.m.',
			midnight: 'midnight',
			noon: 'noon',
			morning: 'morning',
			afternoon: 'afternoon',
			evening: 'evening',
			night: 'night'
		}
	},
	J = {
		narrow: {
			am: 'a',
			pm: 'p',
			midnight: 'mi',
			noon: 'n',
			morning: 'in the morning',
			afternoon: 'in the afternoon',
			evening: 'in the evening',
			night: 'at night'
		},
		abbreviated: {
			am: 'AM',
			pm: 'PM',
			midnight: 'midnight',
			noon: 'noon',
			morning: 'in the morning',
			afternoon: 'in the afternoon',
			evening: 'in the evening',
			night: 'at night'
		},
		wide: {
			am: 'a.m.',
			pm: 'p.m.',
			midnight: 'midnight',
			noon: 'noon',
			morning: 'in the morning',
			afternoon: 'in the afternoon',
			evening: 'in the evening',
			night: 'at night'
		}
	},
	L = (t, n) => {
		const e = Number(t),
			a = e % 100;
		if (a > 20 || a < 10)
			switch (a % 10) {
				case 1:
					return e + 'st';
				case 2:
					return e + 'nd';
				case 3:
					return e + 'rd';
			}
		return e + 'th';
	},
	N = {
		ordinalNumber: L,
		era: l({ values: _, defaultWidth: 'wide' }),
		quarter: l({ values: z, defaultWidth: 'wide', argumentCallback: (t) => t - 1 }),
		month: l({ values: V, defaultWidth: 'wide' }),
		day: l({ values: Y, defaultWidth: 'wide' }),
		dayPeriod: l({ values: q, defaultWidth: 'wide', formattingValues: J, defaultFormattingWidth: 'wide' })
	};
function h(t) {
	return (n, e = {}) => {
		const a = e.width,
			o = (a && t.matchPatterns[a]) || t.matchPatterns[t.defaultMatchWidth],
			i = n.match(o);
		if (!i) return null;
		const r = i[0],
			s = (a && t.parsePatterns[a]) || t.parsePatterns[t.defaultParseWidth],
			d = Array.isArray(s) ? R(s, (m) => m.test(r)) : X(s, (m) => m.test(r));
		let u;
		((u = t.valueCallback ? t.valueCallback(d) : d), (u = e.valueCallback ? e.valueCallback(u) : u));
		const w = n.slice(r.length);
		return { value: u, rest: w };
	};
}
function X(t, n) {
	for (const e in t) if (Object.prototype.hasOwnProperty.call(t, e) && n(t[e])) return e;
}
function R(t, n) {
	for (let e = 0; e < t.length; e++) if (n(t[e])) return e;
}
function E(t) {
	return (n, e = {}) => {
		const a = n.match(t.matchPattern);
		if (!a) return null;
		const o = a[0],
			i = n.match(t.parsePattern);
		if (!i) return null;
		let r = t.valueCallback ? t.valueCallback(i[0]) : i[0];
		r = e.valueCallback ? e.valueCallback(r) : r;
		const s = n.slice(o.length);
		return { value: r, rest: s };
	};
}
const H = /^(\d+)(th|st|nd|rd)?/i,
	Q = /\d+/i,
	U = {
		narrow: /^(b|a)/i,
		abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
		wide: /^(before christ|before common era|anno domini|common era)/i
	},
	B = { any: [/^b/i, /^(a|c)/i] },
	K = { narrow: /^[1234]/i, abbreviated: /^q[1234]/i, wide: /^[1234](th|st|nd|rd)? quarter/i },
	G = { any: [/1/i, /2/i, /3/i, /4/i] },
	Z = {
		narrow: /^[jfmasond]/i,
		abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
		wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
	},
	$ = {
		narrow: [/^j/i, /^f/i, /^m/i, /^a/i, /^m/i, /^j/i, /^j/i, /^a/i, /^s/i, /^o/i, /^n/i, /^d/i],
		any: [/^ja/i, /^f/i, /^mar/i, /^ap/i, /^may/i, /^jun/i, /^jul/i, /^au/i, /^s/i, /^o/i, /^n/i, /^d/i]
	},
	tt = {
		narrow: /^[smtwf]/i,
		short: /^(su|mo|tu|we|th|fr|sa)/i,
		abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
		wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
	},
	et = { narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i], any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i] },
	nt = {
		narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
		any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
	},
	at = {
		any: { am: /^a/i, pm: /^p/i, midnight: /^mi/i, noon: /^no/i, morning: /morning/i, afternoon: /afternoon/i, evening: /evening/i, night: /night/i }
	},
	ot = {
		ordinalNumber: E({ matchPattern: H, parsePattern: Q, valueCallback: (t) => parseInt(t, 10) }),
		era: h({ matchPatterns: U, defaultMatchWidth: 'wide', parsePatterns: B, defaultParseWidth: 'any' }),
		quarter: h({ matchPatterns: K, defaultMatchWidth: 'wide', parsePatterns: G, defaultParseWidth: 'any', valueCallback: (t) => t + 1 }),
		month: h({ matchPatterns: Z, defaultMatchWidth: 'wide', parsePatterns: $, defaultParseWidth: 'any' }),
		day: h({ matchPatterns: tt, defaultMatchWidth: 'wide', parsePatterns: et, defaultParseWidth: 'any' }),
		dayPeriod: h({ matchPatterns: nt, defaultMatchWidth: 'any', parsePatterns: at, defaultParseWidth: 'any' })
	},
	yt = {
		code: 'en-US',
		formatDistance: C,
		formatLong: T,
		formatRelative: O,
		localize: N,
		match: ot,
		options: { weekStartsOn: 0, firstWeekContainsDate: 1 }
	};
export {
	f as a,
	ht as b,
	b as c,
	gt as d,
	yt as e,
	dt as f,
	mt as g,
	ft as h,
	ut as i,
	it as j,
	st as k,
	P as l,
	lt as m,
	M as n,
	W as o,
	rt as p,
	ct as q,
	k as r,
	D as s,
	c as t
};
//# sourceMappingURL=DvaK7ysa.js.map
