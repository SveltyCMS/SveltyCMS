function se(i) {
	return (i + 0.5) | 0;
}
const lt = (i, t, e) => Math.max(Math.min(i, e), t);
function Wt(i) {
	return lt(se(i * 2.55), 0, 255);
}
function dt(i) {
	return lt(se(i * 255), 0, 255);
}
function rt(i) {
	return lt(se(i / 2.55) / 100, 0, 1);
}
function xi(i) {
	return lt(se(i * 100), 0, 100);
}
const q = {
		0: 0,
		1: 1,
		2: 2,
		3: 3,
		4: 4,
		5: 5,
		6: 6,
		7: 7,
		8: 8,
		9: 9,
		A: 10,
		B: 11,
		C: 12,
		D: 13,
		E: 14,
		F: 15,
		a: 10,
		b: 11,
		c: 12,
		d: 13,
		e: 14,
		f: 15
	},
	Ue = [...'0123456789ABCDEF'],
	wn = (i) => Ue[i & 15],
	Pn = (i) => Ue[(i & 240) >> 4] + Ue[i & 15],
	oe = (i) => (i & 240) >> 4 === (i & 15),
	Dn = (i) => oe(i.r) && oe(i.g) && oe(i.b) && oe(i.a);
function On(i) {
	var t = i.length,
		e;
	return (
		i[0] === '#' &&
			(t === 4 || t === 5
				? (e = { r: 255 & (q[i[1]] * 17), g: 255 & (q[i[2]] * 17), b: 255 & (q[i[3]] * 17), a: t === 5 ? q[i[4]] * 17 : 255 })
				: (t === 7 || t === 9) &&
					(e = {
						r: (q[i[1]] << 4) | q[i[2]],
						g: (q[i[3]] << 4) | q[i[4]],
						b: (q[i[5]] << 4) | q[i[6]],
						a: t === 9 ? (q[i[7]] << 4) | q[i[8]] : 255
					})),
		e
	);
}
const Cn = (i, t) => (i < 255 ? t(i) : '');
function An(i) {
	var t = Dn(i) ? wn : Pn;
	return i ? '#' + t(i.r) + t(i.g) + t(i.b) + Cn(i.a, t) : void 0;
}
const Tn = /^(hsla?|hwb|hsv)\(\s*([-+.e\d]+)(?:deg)?[\s,]+([-+.e\d]+)%[\s,]+([-+.e\d]+)%(?:[\s,]+([-+.e\d]+)(%)?)?\s*\)$/;
function Bs(i, t, e) {
	const s = t * Math.min(e, 1 - e),
		n = (o, r = (o + i / 30) % 12) => e - s * Math.max(Math.min(r - 3, 9 - r, 1), -1);
	return [n(0), n(8), n(4)];
}
function Rn(i, t, e) {
	const s = (n, o = (n + i / 60) % 6) => e - e * t * Math.max(Math.min(o, 4 - o, 1), 0);
	return [s(5), s(3), s(1)];
}
function Ln(i, t, e) {
	const s = Bs(i, 1, 0.5);
	let n;
	for (t + e > 1 && ((n = 1 / (t + e)), (t *= n), (e *= n)), n = 0; n < 3; n++) ((s[n] *= 1 - t - e), (s[n] += t));
	return s;
}
function In(i, t, e, s, n) {
	return i === n ? (t - e) / s + (t < e ? 6 : 0) : t === n ? (e - i) / s + 2 : (i - t) / s + 4;
}
function ii(i) {
	const e = i.r / 255,
		s = i.g / 255,
		n = i.b / 255,
		o = Math.max(e, s, n),
		r = Math.min(e, s, n),
		a = (o + r) / 2;
	let l, c, h;
	return (o !== r && ((h = o - r), (c = a > 0.5 ? h / (2 - o - r) : h / (o + r)), (l = In(e, s, n, h, o)), (l = l * 60 + 0.5)), [l | 0, c || 0, a]);
}
function si(i, t, e, s) {
	return (Array.isArray(t) ? i(t[0], t[1], t[2]) : i(t, e, s)).map(dt);
}
function ni(i, t, e) {
	return si(Bs, i, t, e);
}
function Fn(i, t, e) {
	return si(Ln, i, t, e);
}
function En(i, t, e) {
	return si(Rn, i, t, e);
}
function Vs(i) {
	return ((i % 360) + 360) % 360;
}
function zn(i) {
	const t = Tn.exec(i);
	let e = 255,
		s;
	if (!t) return;
	t[5] !== s && (e = t[6] ? Wt(+t[5]) : dt(+t[5]));
	const n = Vs(+t[2]),
		o = +t[3] / 100,
		r = +t[4] / 100;
	return (t[1] === 'hwb' ? (s = Fn(n, o, r)) : t[1] === 'hsv' ? (s = En(n, o, r)) : (s = ni(n, o, r)), { r: s[0], g: s[1], b: s[2], a: e });
}
function Bn(i, t) {
	var e = ii(i);
	((e[0] = Vs(e[0] + t)), (e = ni(e)), (i.r = e[0]), (i.g = e[1]), (i.b = e[2]));
}
function Vn(i) {
	if (!i) return;
	const t = ii(i),
		e = t[0],
		s = xi(t[1]),
		n = xi(t[2]);
	return i.a < 255 ? `hsla(${e}, ${s}%, ${n}%, ${rt(i.a)})` : `hsl(${e}, ${s}%, ${n}%)`;
}
const yi = {
		x: 'dark',
		Z: 'light',
		Y: 're',
		X: 'blu',
		W: 'gr',
		V: 'medium',
		U: 'slate',
		A: 'ee',
		T: 'ol',
		S: 'or',
		B: 'ra',
		C: 'lateg',
		D: 'ights',
		R: 'in',
		Q: 'turquois',
		E: 'hi',
		P: 'ro',
		O: 'al',
		N: 'le',
		M: 'de',
		L: 'yello',
		F: 'en',
		K: 'ch',
		G: 'arks',
		H: 'ea',
		I: 'ightg',
		J: 'wh'
	},
	vi = {
		OiceXe: 'f0f8ff',
		antiquewEte: 'faebd7',
		aqua: 'ffff',
		aquamarRe: '7fffd4',
		azuY: 'f0ffff',
		beige: 'f5f5dc',
		bisque: 'ffe4c4',
		black: '0',
		blanKedOmond: 'ffebcd',
		Xe: 'ff',
		XeviTet: '8a2be2',
		bPwn: 'a52a2a',
		burlywood: 'deb887',
		caMtXe: '5f9ea0',
		KartYuse: '7fff00',
		KocTate: 'd2691e',
		cSO: 'ff7f50',
		cSnflowerXe: '6495ed',
		cSnsilk: 'fff8dc',
		crimson: 'dc143c',
		cyan: 'ffff',
		xXe: '8b',
		xcyan: '8b8b',
		xgTMnPd: 'b8860b',
		xWay: 'a9a9a9',
		xgYF: '6400',
		xgYy: 'a9a9a9',
		xkhaki: 'bdb76b',
		xmagFta: '8b008b',
		xTivegYF: '556b2f',
		xSange: 'ff8c00',
		xScEd: '9932cc',
		xYd: '8b0000',
		xsOmon: 'e9967a',
		xsHgYF: '8fbc8f',
		xUXe: '483d8b',
		xUWay: '2f4f4f',
		xUgYy: '2f4f4f',
		xQe: 'ced1',
		xviTet: '9400d3',
		dAppRk: 'ff1493',
		dApskyXe: 'bfff',
		dimWay: '696969',
		dimgYy: '696969',
		dodgerXe: '1e90ff',
		fiYbrick: 'b22222',
		flSOwEte: 'fffaf0',
		foYstWAn: '228b22',
		fuKsia: 'ff00ff',
		gaRsbSo: 'dcdcdc',
		ghostwEte: 'f8f8ff',
		gTd: 'ffd700',
		gTMnPd: 'daa520',
		Way: '808080',
		gYF: '8000',
		gYFLw: 'adff2f',
		gYy: '808080',
		honeyMw: 'f0fff0',
		hotpRk: 'ff69b4',
		RdianYd: 'cd5c5c',
		Rdigo: '4b0082',
		ivSy: 'fffff0',
		khaki: 'f0e68c',
		lavFMr: 'e6e6fa',
		lavFMrXsh: 'fff0f5',
		lawngYF: '7cfc00',
		NmoncEffon: 'fffacd',
		ZXe: 'add8e6',
		ZcSO: 'f08080',
		Zcyan: 'e0ffff',
		ZgTMnPdLw: 'fafad2',
		ZWay: 'd3d3d3',
		ZgYF: '90ee90',
		ZgYy: 'd3d3d3',
		ZpRk: 'ffb6c1',
		ZsOmon: 'ffa07a',
		ZsHgYF: '20b2aa',
		ZskyXe: '87cefa',
		ZUWay: '778899',
		ZUgYy: '778899',
		ZstAlXe: 'b0c4de',
		ZLw: 'ffffe0',
		lime: 'ff00',
		limegYF: '32cd32',
		lRF: 'faf0e6',
		magFta: 'ff00ff',
		maPon: '800000',
		VaquamarRe: '66cdaa',
		VXe: 'cd',
		VScEd: 'ba55d3',
		VpurpN: '9370db',
		VsHgYF: '3cb371',
		VUXe: '7b68ee',
		VsprRggYF: 'fa9a',
		VQe: '48d1cc',
		VviTetYd: 'c71585',
		midnightXe: '191970',
		mRtcYam: 'f5fffa',
		mistyPse: 'ffe4e1',
		moccasR: 'ffe4b5',
		navajowEte: 'ffdead',
		navy: '80',
		Tdlace: 'fdf5e6',
		Tive: '808000',
		TivedBb: '6b8e23',
		Sange: 'ffa500',
		SangeYd: 'ff4500',
		ScEd: 'da70d6',
		pOegTMnPd: 'eee8aa',
		pOegYF: '98fb98',
		pOeQe: 'afeeee',
		pOeviTetYd: 'db7093',
		papayawEp: 'ffefd5',
		pHKpuff: 'ffdab9',
		peru: 'cd853f',
		pRk: 'ffc0cb',
		plum: 'dda0dd',
		powMrXe: 'b0e0e6',
		purpN: '800080',
		YbeccapurpN: '663399',
		Yd: 'ff0000',
		Psybrown: 'bc8f8f',
		PyOXe: '4169e1',
		saddNbPwn: '8b4513',
		sOmon: 'fa8072',
		sandybPwn: 'f4a460',
		sHgYF: '2e8b57',
		sHshell: 'fff5ee',
		siFna: 'a0522d',
		silver: 'c0c0c0',
		skyXe: '87ceeb',
		UXe: '6a5acd',
		UWay: '708090',
		UgYy: '708090',
		snow: 'fffafa',
		sprRggYF: 'ff7f',
		stAlXe: '4682b4',
		tan: 'd2b48c',
		teO: '8080',
		tEstN: 'd8bfd8',
		tomato: 'ff6347',
		Qe: '40e0d0',
		viTet: 'ee82ee',
		JHt: 'f5deb3',
		wEte: 'ffffff',
		wEtesmoke: 'f5f5f5',
		Lw: 'ffff00',
		LwgYF: '9acd32'
	};
function Nn() {
	const i = {},
		t = Object.keys(vi),
		e = Object.keys(yi);
	let s, n, o, r, a;
	for (s = 0; s < t.length; s++) {
		for (r = a = t[s], n = 0; n < e.length; n++) ((o = e[n]), (a = a.replace(o, yi[o])));
		((o = parseInt(vi[r], 16)), (i[a] = [(o >> 16) & 255, (o >> 8) & 255, o & 255]));
	}
	return i;
}
let re;
function Wn(i) {
	re || ((re = Nn()), (re.transparent = [0, 0, 0, 0]));
	const t = re[i.toLowerCase()];
	return t && { r: t[0], g: t[1], b: t[2], a: t.length === 4 ? t[3] : 255 };
}
const jn = /^rgba?\(\s*([-+.\d]+)(%)?[\s,]+([-+.e\d]+)(%)?[\s,]+([-+.e\d]+)(%)?(?:[\s,/]+([-+.e\d]+)(%)?)?\s*\)$/;
function Hn(i) {
	const t = jn.exec(i);
	let e = 255,
		s,
		n,
		o;
	if (t) {
		if (t[7] !== s) {
			const r = +t[7];
			e = t[8] ? Wt(r) : lt(r * 255, 0, 255);
		}
		return (
			(s = +t[1]),
			(n = +t[3]),
			(o = +t[5]),
			(s = 255 & (t[2] ? Wt(s) : lt(s, 0, 255))),
			(n = 255 & (t[4] ? Wt(n) : lt(n, 0, 255))),
			(o = 255 & (t[6] ? Wt(o) : lt(o, 0, 255))),
			{ r: s, g: n, b: o, a: e }
		);
	}
}
function $n(i) {
	return i && (i.a < 255 ? `rgba(${i.r}, ${i.g}, ${i.b}, ${rt(i.a)})` : `rgb(${i.r}, ${i.g}, ${i.b})`);
}
const Re = (i) => (i <= 0.0031308 ? i * 12.92 : Math.pow(i, 1 / 2.4) * 1.055 - 0.055),
	Ct = (i) => (i <= 0.04045 ? i / 12.92 : Math.pow((i + 0.055) / 1.055, 2.4));
function Yn(i, t, e) {
	const s = Ct(rt(i.r)),
		n = Ct(rt(i.g)),
		o = Ct(rt(i.b));
	return {
		r: dt(Re(s + e * (Ct(rt(t.r)) - s))),
		g: dt(Re(n + e * (Ct(rt(t.g)) - n))),
		b: dt(Re(o + e * (Ct(rt(t.b)) - o))),
		a: i.a + e * (t.a - i.a)
	};
}
function ae(i, t, e) {
	if (i) {
		let s = ii(i);
		((s[t] = Math.max(0, Math.min(s[t] + s[t] * e, t === 0 ? 360 : 1))), (s = ni(s)), (i.r = s[0]), (i.g = s[1]), (i.b = s[2]));
	}
}
function Ns(i, t) {
	return i && Object.assign(t || {}, i);
}
function Mi(i) {
	var t = { r: 0, g: 0, b: 0, a: 255 };
	return (
		Array.isArray(i)
			? i.length >= 3 && ((t = { r: i[0], g: i[1], b: i[2], a: 255 }), i.length > 3 && (t.a = dt(i[3])))
			: ((t = Ns(i, { r: 0, g: 0, b: 0, a: 1 })), (t.a = dt(t.a))),
		t
	);
}
function Xn(i) {
	return i.charAt(0) === 'r' ? Hn(i) : zn(i);
}
class qt {
	constructor(t) {
		if (t instanceof qt) return t;
		const e = typeof t;
		let s;
		(e === 'object' ? (s = Mi(t)) : e === 'string' && (s = On(t) || Wn(t) || Xn(t)), (this._rgb = s), (this._valid = !!s));
	}
	get valid() {
		return this._valid;
	}
	get rgb() {
		var t = Ns(this._rgb);
		return (t && (t.a = rt(t.a)), t);
	}
	set rgb(t) {
		this._rgb = Mi(t);
	}
	rgbString() {
		return this._valid ? $n(this._rgb) : void 0;
	}
	hexString() {
		return this._valid ? An(this._rgb) : void 0;
	}
	hslString() {
		return this._valid ? Vn(this._rgb) : void 0;
	}
	mix(t, e) {
		if (t) {
			const s = this.rgb,
				n = t.rgb;
			let o;
			const r = e === o ? 0.5 : e,
				a = 2 * r - 1,
				l = s.a - n.a,
				c = ((a * l === -1 ? a : (a + l) / (1 + a * l)) + 1) / 2;
			((o = 1 - c),
				(s.r = 255 & (c * s.r + o * n.r + 0.5)),
				(s.g = 255 & (c * s.g + o * n.g + 0.5)),
				(s.b = 255 & (c * s.b + o * n.b + 0.5)),
				(s.a = r * s.a + (1 - r) * n.a),
				(this.rgb = s));
		}
		return this;
	}
	interpolate(t, e) {
		return (t && (this._rgb = Yn(this._rgb, t._rgb, e)), this);
	}
	clone() {
		return new qt(this.rgb);
	}
	alpha(t) {
		return ((this._rgb.a = dt(t)), this);
	}
	clearer(t) {
		const e = this._rgb;
		return ((e.a *= 1 - t), this);
	}
	greyscale() {
		const t = this._rgb,
			e = se(t.r * 0.3 + t.g * 0.59 + t.b * 0.11);
		return ((t.r = t.g = t.b = e), this);
	}
	opaquer(t) {
		const e = this._rgb;
		return ((e.a *= 1 + t), this);
	}
	negate() {
		const t = this._rgb;
		return ((t.r = 255 - t.r), (t.g = 255 - t.g), (t.b = 255 - t.b), this);
	}
	lighten(t) {
		return (ae(this._rgb, 2, t), this);
	}
	darken(t) {
		return (ae(this._rgb, 2, -t), this);
	}
	saturate(t) {
		return (ae(this._rgb, 1, t), this);
	}
	desaturate(t) {
		return (ae(this._rgb, 1, -t), this);
	}
	rotate(t) {
		return (Bn(this._rgb, t), this);
	}
}
function st() {}
const Un = (() => {
	let i = 0;
	return () => i++;
})();
function O(i) {
	return i == null;
}
function N(i) {
	if (Array.isArray && Array.isArray(i)) return !0;
	const t = Object.prototype.toString.call(i);
	return t.slice(0, 7) === '[object' && t.slice(-6) === 'Array]';
}
function P(i) {
	return i !== null && Object.prototype.toString.call(i) === '[object Object]';
}
function $(i) {
	return (typeof i == 'number' || i instanceof Number) && isFinite(+i);
}
function J(i, t) {
	return $(i) ? i : t;
}
function D(i, t) {
	return typeof i > 'u' ? t : i;
}
const Kn = (i, t) => (typeof i == 'string' && i.endsWith('%') ? parseFloat(i) / 100 : +i / t),
	Ws = (i, t) => (typeof i == 'string' && i.endsWith('%') ? (parseFloat(i) / 100) * t : +i);
function B(i, t, e) {
	if (i && typeof i.call == 'function') return i.apply(e, t);
}
function C(i, t, e, s) {
	let n, o, r;
	if (N(i)) for (o = i.length, n = 0; n < o; n++) t.call(e, i[n], n);
	else if (P(i)) for (r = Object.keys(i), o = r.length, n = 0; n < o; n++) t.call(e, i[r[n]], r[n]);
}
function ve(i, t) {
	let e, s, n, o;
	if (!i || !t || i.length !== t.length) return !1;
	for (e = 0, s = i.length; e < s; ++e) if (((n = i[e]), (o = t[e]), n.datasetIndex !== o.datasetIndex || n.index !== o.index)) return !1;
	return !0;
}
function Me(i) {
	if (N(i)) return i.map(Me);
	if (P(i)) {
		const t = Object.create(null),
			e = Object.keys(i),
			s = e.length;
		let n = 0;
		for (; n < s; ++n) t[e[n]] = Me(i[e[n]]);
		return t;
	}
	return i;
}
function js(i) {
	return ['__proto__', 'prototype', 'constructor'].indexOf(i) === -1;
}
function qn(i, t, e, s) {
	if (!js(i)) return;
	const n = t[i],
		o = e[i];
	P(n) && P(o) ? Gt(n, o, s) : (t[i] = Me(o));
}
function Gt(i, t, e) {
	const s = N(t) ? t : [t],
		n = s.length;
	if (!P(i)) return i;
	e = e || {};
	const o = e.merger || qn;
	let r;
	for (let a = 0; a < n; ++a) {
		if (((r = s[a]), !P(r))) continue;
		const l = Object.keys(r);
		for (let c = 0, h = l.length; c < h; ++c) o(l[c], i, r, e);
	}
	return i;
}
function $t(i, t) {
	return Gt(i, t, { merger: Gn });
}
function Gn(i, t, e) {
	if (!js(i)) return;
	const s = t[i],
		n = e[i];
	P(s) && P(n) ? $t(s, n) : Object.prototype.hasOwnProperty.call(t, i) || (t[i] = Me(n));
}
const ki = { '': (i) => i, x: (i) => i.x, y: (i) => i.y };
function Zn(i) {
	const t = i.split('.'),
		e = [];
	let s = '';
	for (const n of t) ((s += n), s.endsWith('\\') ? (s = s.slice(0, -1) + '.') : (e.push(s), (s = '')));
	return e;
}
function Jn(i) {
	const t = Zn(i);
	return (e) => {
		for (const s of t) {
			if (s === '') break;
			e = e && e[s];
		}
		return e;
	};
}
function kt(i, t) {
	return (ki[t] || (ki[t] = Jn(t)))(i);
}
function oi(i) {
	return i.charAt(0).toUpperCase() + i.slice(1);
}
const Zt = (i) => typeof i < 'u',
	ft = (i) => typeof i == 'function',
	Si = (i, t) => {
		if (i.size !== t.size) return !1;
		for (const e of i) if (!t.has(e)) return !1;
		return !0;
	};
function Qn(i) {
	return i.type === 'mouseup' || i.type === 'click' || i.type === 'contextmenu';
}
const R = Math.PI,
	E = 2 * R,
	to = E + R,
	ke = Number.POSITIVE_INFINITY,
	eo = R / 180,
	W = R / 2,
	mt = R / 4,
	wi = (R * 2) / 3,
	Hs = Math.log10,
	it = Math.sign;
function Yt(i, t, e) {
	return Math.abs(i - t) < e;
}
function Pi(i) {
	const t = Math.round(i);
	i = Yt(i, t, i / 1e3) ? t : i;
	const e = Math.pow(10, Math.floor(Hs(i))),
		s = i / e;
	return (s <= 1 ? 1 : s <= 2 ? 2 : s <= 5 ? 5 : 10) * e;
}
function io(i) {
	const t = [],
		e = Math.sqrt(i);
	let s;
	for (s = 1; s < e; s++) i % s === 0 && (t.push(s), t.push(i / s));
	return (e === (e | 0) && t.push(e), t.sort((n, o) => n - o).pop(), t);
}
function so(i) {
	return typeof i == 'symbol' || (typeof i == 'object' && i !== null && !(Symbol.toPrimitive in i || 'toString' in i || 'valueOf' in i));
}
function Jt(i) {
	return !so(i) && !isNaN(parseFloat(i)) && isFinite(i);
}
function no(i, t) {
	const e = Math.round(i);
	return e - t <= i && e + t >= i;
}
function oo(i, t, e) {
	let s, n, o;
	for (s = 0, n = i.length; s < n; s++) ((o = i[s][e]), isNaN(o) || ((t.min = Math.min(t.min, o)), (t.max = Math.max(t.max, o))));
}
function at(i) {
	return i * (R / 180);
}
function ro(i) {
	return i * (180 / R);
}
function Di(i) {
	if (!$(i)) return;
	let t = 1,
		e = 0;
	for (; Math.round(i * t) / t !== i; ) ((t *= 10), e++);
	return e;
}
function $s(i, t) {
	const e = t.x - i.x,
		s = t.y - i.y,
		n = Math.sqrt(e * e + s * s);
	let o = Math.atan2(s, e);
	return (o < -0.5 * R && (o += E), { angle: o, distance: n });
}
function Ke(i, t) {
	return Math.sqrt(Math.pow(t.x - i.x, 2) + Math.pow(t.y - i.y, 2));
}
function ao(i, t) {
	return ((i - t + to) % E) - R;
}
function K(i) {
	return ((i % E) + E) % E;
}
function Qt(i, t, e, s) {
	const n = K(i),
		o = K(t),
		r = K(e),
		a = K(o - n),
		l = K(r - n),
		c = K(n - o),
		h = K(n - r);
	return n === o || n === r || (s && o === r) || (a > l && c < h);
}
function H(i, t, e) {
	return Math.max(t, Math.min(e, i));
}
function lo(i) {
	return H(i, -32768, 32767);
}
function te(i, t, e, s = 1e-6) {
	return i >= Math.min(t, e) - s && i <= Math.max(t, e) + s;
}
function ri(i, t, e) {
	e = e || ((r) => i[r] < t);
	let s = i.length - 1,
		n = 0,
		o;
	for (; s - n > 1; ) ((o = (n + s) >> 1), e(o) ? (n = o) : (s = o));
	return { lo: n, hi: s };
}
const vt = (i, t, e, s) =>
		ri(
			i,
			e,
			s
				? (n) => {
						const o = i[n][t];
						return o < e || (o === e && i[n + 1][t] === e);
					}
				: (n) => i[n][t] < e
		),
	co = (i, t, e) => ri(i, e, (s) => i[s][t] >= e);
function ho(i, t, e) {
	let s = 0,
		n = i.length;
	for (; s < n && i[s] < t; ) s++;
	for (; n > s && i[n - 1] > e; ) n--;
	return s > 0 || n < i.length ? i.slice(s, n) : i;
}
const Ys = ['push', 'pop', 'shift', 'splice', 'unshift'];
function fo(i, t) {
	if (i._chartjs) {
		i._chartjs.listeners.push(t);
		return;
	}
	(Object.defineProperty(i, '_chartjs', { configurable: !0, enumerable: !1, value: { listeners: [t] } }),
		Ys.forEach((e) => {
			const s = '_onData' + oi(e),
				n = i[e];
			Object.defineProperty(i, e, {
				configurable: !0,
				enumerable: !1,
				value(...o) {
					const r = n.apply(this, o);
					return (
						i._chartjs.listeners.forEach((a) => {
							typeof a[s] == 'function' && a[s](...o);
						}),
						r
					);
				}
			});
		}));
}
function Oi(i, t) {
	const e = i._chartjs;
	if (!e) return;
	const s = e.listeners,
		n = s.indexOf(t);
	(n !== -1 && s.splice(n, 1),
		!(s.length > 0) &&
			(Ys.forEach((o) => {
				delete i[o];
			}),
			delete i._chartjs));
}
function Xs(i) {
	const t = new Set(i);
	return t.size === i.length ? i : Array.from(t);
}
const Us = (function () {
	return typeof window > 'u'
		? function (i) {
				return i();
			}
		: window.requestAnimationFrame;
})();
function Ks(i, t) {
	let e = [],
		s = !1;
	return function (...n) {
		((e = n),
			s ||
				((s = !0),
				Us.call(window, () => {
					((s = !1), i.apply(t, e));
				})));
	};
}
function uo(i, t) {
	let e;
	return function (...s) {
		return (t ? (clearTimeout(e), (e = setTimeout(i, t, s))) : i.apply(this, s), t);
	};
}
const go = (i) => (i === 'start' ? 'left' : i === 'end' ? 'right' : 'center'),
	Ci = (i, t, e) => (i === 'start' ? t : i === 'end' ? e : (t + e) / 2);
function po(i, t, e) {
	const s = t.length;
	let n = 0,
		o = s;
	if (i._sorted) {
		const { iScale: r, vScale: a, _parsed: l } = i,
			c = i.dataset && i.dataset.options ? i.dataset.options.spanGaps : null,
			h = r.axis,
			{ min: d, max: f, minDefined: u, maxDefined: p } = r.getUserBounds();
		if (u) {
			if (((n = Math.min(vt(l, h, d).lo, e ? s : vt(t, h, r.getPixelForValue(d)).lo)), c)) {
				const g = l
					.slice(0, n + 1)
					.reverse()
					.findIndex((m) => !O(m[a.axis]));
				n -= Math.max(0, g);
			}
			n = H(n, 0, s - 1);
		}
		if (p) {
			let g = Math.max(vt(l, r.axis, f, !0).hi + 1, e ? 0 : vt(t, h, r.getPixelForValue(f), !0).hi + 1);
			if (c) {
				const m = l.slice(g - 1).findIndex((b) => !O(b[a.axis]));
				g += Math.max(0, m);
			}
			o = H(g, n, s) - n;
		} else o = s - n;
	}
	return { start: n, count: o };
}
function mo(i) {
	const { xScale: t, yScale: e, _scaleRanges: s } = i,
		n = { xmin: t.min, xmax: t.max, ymin: e.min, ymax: e.max };
	if (!s) return ((i._scaleRanges = n), !0);
	const o = s.xmin !== t.min || s.xmax !== t.max || s.ymin !== e.min || s.ymax !== e.max;
	return (Object.assign(s, n), o);
}
const le = (i) => i === 0 || i === 1,
	Ai = (i, t, e) => -(Math.pow(2, 10 * (i -= 1)) * Math.sin(((i - t) * E) / e)),
	Ti = (i, t, e) => Math.pow(2, -10 * i) * Math.sin(((i - t) * E) / e) + 1,
	Xt = {
		linear: (i) => i,
		easeInQuad: (i) => i * i,
		easeOutQuad: (i) => -i * (i - 2),
		easeInOutQuad: (i) => ((i /= 0.5) < 1 ? 0.5 * i * i : -0.5 * (--i * (i - 2) - 1)),
		easeInCubic: (i) => i * i * i,
		easeOutCubic: (i) => (i -= 1) * i * i + 1,
		easeInOutCubic: (i) => ((i /= 0.5) < 1 ? 0.5 * i * i * i : 0.5 * ((i -= 2) * i * i + 2)),
		easeInQuart: (i) => i * i * i * i,
		easeOutQuart: (i) => -((i -= 1) * i * i * i - 1),
		easeInOutQuart: (i) => ((i /= 0.5) < 1 ? 0.5 * i * i * i * i : -0.5 * ((i -= 2) * i * i * i - 2)),
		easeInQuint: (i) => i * i * i * i * i,
		easeOutQuint: (i) => (i -= 1) * i * i * i * i + 1,
		easeInOutQuint: (i) => ((i /= 0.5) < 1 ? 0.5 * i * i * i * i * i : 0.5 * ((i -= 2) * i * i * i * i + 2)),
		easeInSine: (i) => -Math.cos(i * W) + 1,
		easeOutSine: (i) => Math.sin(i * W),
		easeInOutSine: (i) => -0.5 * (Math.cos(R * i) - 1),
		easeInExpo: (i) => (i === 0 ? 0 : Math.pow(2, 10 * (i - 1))),
		easeOutExpo: (i) => (i === 1 ? 1 : -Math.pow(2, -10 * i) + 1),
		easeInOutExpo: (i) => (le(i) ? i : i < 0.5 ? 0.5 * Math.pow(2, 10 * (i * 2 - 1)) : 0.5 * (-Math.pow(2, -10 * (i * 2 - 1)) + 2)),
		easeInCirc: (i) => (i >= 1 ? i : -(Math.sqrt(1 - i * i) - 1)),
		easeOutCirc: (i) => Math.sqrt(1 - (i -= 1) * i),
		easeInOutCirc: (i) => ((i /= 0.5) < 1 ? -0.5 * (Math.sqrt(1 - i * i) - 1) : 0.5 * (Math.sqrt(1 - (i -= 2) * i) + 1)),
		easeInElastic: (i) => (le(i) ? i : Ai(i, 0.075, 0.3)),
		easeOutElastic: (i) => (le(i) ? i : Ti(i, 0.075, 0.3)),
		easeInOutElastic(i) {
			return le(i) ? i : i < 0.5 ? 0.5 * Ai(i * 2, 0.1125, 0.45) : 0.5 + 0.5 * Ti(i * 2 - 1, 0.1125, 0.45);
		},
		easeInBack(i) {
			return i * i * ((1.70158 + 1) * i - 1.70158);
		},
		easeOutBack(i) {
			return (i -= 1) * i * ((1.70158 + 1) * i + 1.70158) + 1;
		},
		easeInOutBack(i) {
			let t = 1.70158;
			return (i /= 0.5) < 1 ? 0.5 * (i * i * (((t *= 1.525) + 1) * i - t)) : 0.5 * ((i -= 2) * i * (((t *= 1.525) + 1) * i + t) + 2);
		},
		easeInBounce: (i) => 1 - Xt.easeOutBounce(1 - i),
		easeOutBounce(i) {
			return i < 1 / 2.75
				? 7.5625 * i * i
				: i < 2 / 2.75
					? 7.5625 * (i -= 1.5 / 2.75) * i + 0.75
					: i < 2.5 / 2.75
						? 7.5625 * (i -= 2.25 / 2.75) * i + 0.9375
						: 7.5625 * (i -= 2.625 / 2.75) * i + 0.984375;
		},
		easeInOutBounce: (i) => (i < 0.5 ? Xt.easeInBounce(i * 2) * 0.5 : Xt.easeOutBounce(i * 2 - 1) * 0.5 + 0.5)
	};
function ai(i) {
	if (i && typeof i == 'object') {
		const t = i.toString();
		return t === '[object CanvasPattern]' || t === '[object CanvasGradient]';
	}
	return !1;
}
function Ri(i) {
	return ai(i) ? i : new qt(i);
}
function Le(i) {
	return ai(i) ? i : new qt(i).saturate(0.5).darken(0.1).hexString();
}
const bo = ['x', 'y', 'borderWidth', 'radius', 'tension'],
	_o = ['color', 'borderColor', 'backgroundColor'];
function xo(i) {
	(i.set('animation', { delay: void 0, duration: 1e3, easing: 'easeOutQuart', fn: void 0, from: void 0, loop: void 0, to: void 0, type: void 0 }),
		i.describe('animation', { _fallback: !1, _indexable: !1, _scriptable: (t) => t !== 'onProgress' && t !== 'onComplete' && t !== 'fn' }),
		i.set('animations', { colors: { type: 'color', properties: _o }, numbers: { type: 'number', properties: bo } }),
		i.describe('animations', { _fallback: 'animation' }),
		i.set('transitions', {
			active: { animation: { duration: 400 } },
			resize: { animation: { duration: 0 } },
			show: { animations: { colors: { from: 'transparent' }, visible: { type: 'boolean', duration: 0 } } },
			hide: { animations: { colors: { to: 'transparent' }, visible: { type: 'boolean', easing: 'linear', fn: (t) => t | 0 } } }
		}));
}
function yo(i) {
	i.set('layout', { autoPadding: !0, padding: { top: 0, right: 0, bottom: 0, left: 0 } });
}
const Li = new Map();
function vo(i, t) {
	t = t || {};
	const e = i + JSON.stringify(t);
	let s = Li.get(e);
	return (s || ((s = new Intl.NumberFormat(i, t)), Li.set(e, s)), s);
}
function li(i, t, e) {
	return vo(t, e).format(i);
}
const Mo = {
	values(i) {
		return N(i) ? i : '' + i;
	},
	numeric(i, t, e) {
		if (i === 0) return '0';
		const s = this.chart.options.locale;
		let n,
			o = i;
		if (e.length > 1) {
			const c = Math.max(Math.abs(e[0].value), Math.abs(e[e.length - 1].value));
			((c < 1e-4 || c > 1e15) && (n = 'scientific'), (o = ko(i, e)));
		}
		const r = Hs(Math.abs(o)),
			a = isNaN(r) ? 1 : Math.max(Math.min(-1 * Math.floor(r), 20), 0),
			l = { notation: n, minimumFractionDigits: a, maximumFractionDigits: a };
		return (Object.assign(l, this.options.ticks.format), li(i, s, l));
	}
};
function ko(i, t) {
	let e = t.length > 3 ? t[2].value - t[1].value : t[1].value - t[0].value;
	return (Math.abs(e) >= 1 && i !== Math.floor(i) && (e = i - Math.floor(i)), e);
}
var qs = { formatters: Mo };
function So(i) {
	(i.set('scale', {
		display: !0,
		offset: !1,
		reverse: !1,
		beginAtZero: !1,
		bounds: 'ticks',
		clip: !0,
		grace: 0,
		grid: {
			display: !0,
			lineWidth: 1,
			drawOnChartArea: !0,
			drawTicks: !0,
			tickLength: 8,
			tickWidth: (t, e) => e.lineWidth,
			tickColor: (t, e) => e.color,
			offset: !1
		},
		border: { display: !0, dash: [], dashOffset: 0, width: 1 },
		title: { display: !1, text: '', padding: { top: 4, bottom: 4 } },
		ticks: {
			minRotation: 0,
			maxRotation: 50,
			mirror: !1,
			textStrokeWidth: 0,
			textStrokeColor: '',
			padding: 3,
			display: !0,
			autoSkip: !0,
			autoSkipPadding: 3,
			labelOffset: 0,
			callback: qs.formatters.values,
			minor: {},
			major: {},
			align: 'center',
			crossAlign: 'near',
			showLabelBackdrop: !1,
			backdropColor: 'rgba(255, 255, 255, 0.75)',
			backdropPadding: 2
		}
	}),
		i.route('scale.ticks', 'color', '', 'color'),
		i.route('scale.grid', 'color', '', 'borderColor'),
		i.route('scale.border', 'color', '', 'borderColor'),
		i.route('scale.title', 'color', '', 'color'),
		i.describe('scale', {
			_fallback: !1,
			_scriptable: (t) => !t.startsWith('before') && !t.startsWith('after') && t !== 'callback' && t !== 'parser',
			_indexable: (t) => t !== 'borderDash' && t !== 'tickBorderDash' && t !== 'dash'
		}),
		i.describe('scales', { _fallback: 'scale' }),
		i.describe('scale.ticks', { _scriptable: (t) => t !== 'backdropPadding' && t !== 'callback', _indexable: (t) => t !== 'backdropPadding' }));
}
const St = Object.create(null),
	qe = Object.create(null);
function Ut(i, t) {
	if (!t) return i;
	const e = t.split('.');
	for (let s = 0, n = e.length; s < n; ++s) {
		const o = e[s];
		i = i[o] || (i[o] = Object.create(null));
	}
	return i;
}
function Ie(i, t, e) {
	return typeof t == 'string' ? Gt(Ut(i, t), e) : Gt(Ut(i, ''), t);
}
class wo {
	constructor(t, e) {
		((this.animation = void 0),
			(this.backgroundColor = 'rgba(0,0,0,0.1)'),
			(this.borderColor = 'rgba(0,0,0,0.1)'),
			(this.color = '#666'),
			(this.datasets = {}),
			(this.devicePixelRatio = (s) => s.chart.platform.getDevicePixelRatio()),
			(this.elements = {}),
			(this.events = ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove']),
			(this.font = { family: "'Helvetica Neue', 'Helvetica', 'Arial', sans-serif", size: 12, style: 'normal', lineHeight: 1.2, weight: null }),
			(this.hover = {}),
			(this.hoverBackgroundColor = (s, n) => Le(n.backgroundColor)),
			(this.hoverBorderColor = (s, n) => Le(n.borderColor)),
			(this.hoverColor = (s, n) => Le(n.color)),
			(this.indexAxis = 'x'),
			(this.interaction = { mode: 'nearest', intersect: !0, includeInvisible: !1 }),
			(this.maintainAspectRatio = !0),
			(this.onHover = null),
			(this.onClick = null),
			(this.parsing = !0),
			(this.plugins = {}),
			(this.responsive = !0),
			(this.scale = void 0),
			(this.scales = {}),
			(this.showLine = !0),
			(this.drawActiveElementsOnTop = !0),
			this.describe(t),
			this.apply(e));
	}
	set(t, e) {
		return Ie(this, t, e);
	}
	get(t) {
		return Ut(this, t);
	}
	describe(t, e) {
		return Ie(qe, t, e);
	}
	override(t, e) {
		return Ie(St, t, e);
	}
	route(t, e, s, n) {
		const o = Ut(this, t),
			r = Ut(this, s),
			a = '_' + e;
		Object.defineProperties(o, {
			[a]: { value: o[e], writable: !0 },
			[e]: {
				enumerable: !0,
				get() {
					const l = this[a],
						c = r[n];
					return P(l) ? Object.assign({}, c, l) : D(l, c);
				},
				set(l) {
					this[a] = l;
				}
			}
		});
	}
	apply(t) {
		t.forEach((e) => e(this));
	}
}
var V = new wo(
	{
		_scriptable: (i) => !i.startsWith('on'),
		_indexable: (i) => i !== 'events',
		hover: { _fallback: 'interaction' },
		interaction: { _scriptable: !1, _indexable: !1 }
	},
	[xo, yo, So]
);
function Po(i) {
	return !i || O(i.size) || O(i.family) ? null : (i.style ? i.style + ' ' : '') + (i.weight ? i.weight + ' ' : '') + i.size + 'px ' + i.family;
}
function Ii(i, t, e, s, n) {
	let o = t[n];
	return (o || ((o = t[n] = i.measureText(n).width), e.push(n)), o > s && (s = o), s);
}
function bt(i, t, e) {
	const s = i.currentDevicePixelRatio,
		n = e !== 0 ? Math.max(e / 2, 0.5) : 0;
	return Math.round((t - n) * s) / s + n;
}
function Fi(i, t) {
	(!t && !i) || ((t = t || i.getContext('2d')), t.save(), t.resetTransform(), t.clearRect(0, 0, i.width, i.height), t.restore());
}
function Ge(i, t, e, s) {
	Do(i, t, e, s);
}
function Do(i, t, e, s, n) {
	let o, r, a, l, c, h, d, f;
	const u = t.pointStyle,
		p = t.rotation,
		g = t.radius;
	let m = (p || 0) * eo;
	if (u && typeof u == 'object' && ((o = u.toString()), o === '[object HTMLImageElement]' || o === '[object HTMLCanvasElement]')) {
		(i.save(), i.translate(e, s), i.rotate(m), i.drawImage(u, -u.width / 2, -u.height / 2, u.width, u.height), i.restore());
		return;
	}
	if (!(isNaN(g) || g <= 0)) {
		switch ((i.beginPath(), u)) {
			default:
				(i.arc(e, s, g, 0, E), i.closePath());
				break;
			case 'triangle':
				((h = g),
					i.moveTo(e + Math.sin(m) * h, s - Math.cos(m) * g),
					(m += wi),
					i.lineTo(e + Math.sin(m) * h, s - Math.cos(m) * g),
					(m += wi),
					i.lineTo(e + Math.sin(m) * h, s - Math.cos(m) * g),
					i.closePath());
				break;
			case 'rectRounded':
				((c = g * 0.516),
					(l = g - c),
					(r = Math.cos(m + mt) * l),
					(d = Math.cos(m + mt) * l),
					(a = Math.sin(m + mt) * l),
					(f = Math.sin(m + mt) * l),
					i.arc(e - d, s - a, c, m - R, m - W),
					i.arc(e + f, s - r, c, m - W, m),
					i.arc(e + d, s + a, c, m, m + W),
					i.arc(e - f, s + r, c, m + W, m + R),
					i.closePath());
				break;
			case 'rect':
				if (!p) {
					((l = Math.SQRT1_2 * g), (h = l), i.rect(e - h, s - l, 2 * h, 2 * l));
					break;
				}
				m += mt;
			case 'rectRot':
				((d = Math.cos(m) * g),
					(r = Math.cos(m) * g),
					(a = Math.sin(m) * g),
					(f = Math.sin(m) * g),
					i.moveTo(e - d, s - a),
					i.lineTo(e + f, s - r),
					i.lineTo(e + d, s + a),
					i.lineTo(e - f, s + r),
					i.closePath());
				break;
			case 'crossRot':
				m += mt;
			case 'cross':
				((d = Math.cos(m) * g),
					(r = Math.cos(m) * g),
					(a = Math.sin(m) * g),
					(f = Math.sin(m) * g),
					i.moveTo(e - d, s - a),
					i.lineTo(e + d, s + a),
					i.moveTo(e + f, s - r),
					i.lineTo(e - f, s + r));
				break;
			case 'star':
				((d = Math.cos(m) * g),
					(r = Math.cos(m) * g),
					(a = Math.sin(m) * g),
					(f = Math.sin(m) * g),
					i.moveTo(e - d, s - a),
					i.lineTo(e + d, s + a),
					i.moveTo(e + f, s - r),
					i.lineTo(e - f, s + r),
					(m += mt),
					(d = Math.cos(m) * g),
					(r = Math.cos(m) * g),
					(a = Math.sin(m) * g),
					(f = Math.sin(m) * g),
					i.moveTo(e - d, s - a),
					i.lineTo(e + d, s + a),
					i.moveTo(e + f, s - r),
					i.lineTo(e - f, s + r));
				break;
			case 'line':
				((r = Math.cos(m) * g), (a = Math.sin(m) * g), i.moveTo(e - r, s - a), i.lineTo(e + r, s + a));
				break;
			case 'dash':
				(i.moveTo(e, s), i.lineTo(e + Math.cos(m) * g, s + Math.sin(m) * g));
				break;
			case !1:
				i.closePath();
				break;
		}
		(i.fill(), t.borderWidth > 0 && i.stroke());
	}
}
function ee(i, t, e) {
	return ((e = e || 0.5), !t || (i && i.x > t.left - e && i.x < t.right + e && i.y > t.top - e && i.y < t.bottom + e));
}
function ci(i, t) {
	(i.save(), i.beginPath(), i.rect(t.left, t.top, t.right - t.left, t.bottom - t.top), i.clip());
}
function hi(i) {
	i.restore();
}
function Oo(i, t, e, s, n) {
	if (!t) return i.lineTo(e.x, e.y);
	if (n === 'middle') {
		const o = (t.x + e.x) / 2;
		(i.lineTo(o, t.y), i.lineTo(o, e.y));
	} else (n === 'after') != !!s ? i.lineTo(t.x, e.y) : i.lineTo(e.x, t.y);
	i.lineTo(e.x, e.y);
}
function Co(i, t, e, s) {
	if (!t) return i.lineTo(e.x, e.y);
	i.bezierCurveTo(s ? t.cp1x : t.cp2x, s ? t.cp1y : t.cp2y, s ? e.cp2x : e.cp1x, s ? e.cp2y : e.cp1y, e.x, e.y);
}
function Ao(i, t) {
	(t.translation && i.translate(t.translation[0], t.translation[1]),
		O(t.rotation) || i.rotate(t.rotation),
		t.color && (i.fillStyle = t.color),
		t.textAlign && (i.textAlign = t.textAlign),
		t.textBaseline && (i.textBaseline = t.textBaseline));
}
function To(i, t, e, s, n) {
	if (n.strikethrough || n.underline) {
		const o = i.measureText(s),
			r = t - o.actualBoundingBoxLeft,
			a = t + o.actualBoundingBoxRight,
			l = e - o.actualBoundingBoxAscent,
			c = e + o.actualBoundingBoxDescent,
			h = n.strikethrough ? (l + c) / 2 : c;
		((i.strokeStyle = i.fillStyle), i.beginPath(), (i.lineWidth = n.decorationWidth || 2), i.moveTo(r, h), i.lineTo(a, h), i.stroke());
	}
}
function Ro(i, t) {
	const e = i.fillStyle;
	((i.fillStyle = t.color), i.fillRect(t.left, t.top, t.width, t.height), (i.fillStyle = e));
}
function Ei(i, t, e, s, n, o = {}) {
	const r = N(t) ? t : [t],
		a = o.strokeWidth > 0 && o.strokeColor !== '';
	let l, c;
	for (i.save(), i.font = n.string, Ao(i, o), l = 0; l < r.length; ++l)
		((c = r[l]),
			o.backdrop && Ro(i, o.backdrop),
			a && (o.strokeColor && (i.strokeStyle = o.strokeColor), O(o.strokeWidth) || (i.lineWidth = o.strokeWidth), i.strokeText(c, e, s, o.maxWidth)),
			i.fillText(c, e, s, o.maxWidth),
			To(i, e, s, c, o),
			(s += Number(n.lineHeight)));
	i.restore();
}
function Ze(i, t) {
	const { x: e, y: s, w: n, h: o, radius: r } = t;
	(i.arc(e + r.topLeft, s + r.topLeft, r.topLeft, 1.5 * R, R, !0),
		i.lineTo(e, s + o - r.bottomLeft),
		i.arc(e + r.bottomLeft, s + o - r.bottomLeft, r.bottomLeft, R, W, !0),
		i.lineTo(e + n - r.bottomRight, s + o),
		i.arc(e + n - r.bottomRight, s + o - r.bottomRight, r.bottomRight, W, 0, !0),
		i.lineTo(e + n, s + r.topRight),
		i.arc(e + n - r.topRight, s + r.topRight, r.topRight, 0, -W, !0),
		i.lineTo(e + r.topLeft, s));
}
const Lo = /^(normal|(\d+(?:\.\d+)?)(px|em|%)?)$/,
	Io = /^(normal|italic|initial|inherit|unset|(oblique( -?[0-9]?[0-9]deg)?))$/;
function Fo(i, t) {
	const e = ('' + i).match(Lo);
	if (!e || e[1] === 'normal') return t * 1.2;
	switch (((i = +e[2]), e[3])) {
		case 'px':
			return i;
		case '%':
			i /= 100;
			break;
	}
	return t * i;
}
const Eo = (i) => +i || 0;
function di(i, t) {
	const e = {},
		s = P(t),
		n = s ? Object.keys(t) : t,
		o = P(i) ? (s ? (r) => D(i[r], i[t[r]]) : (r) => i[r]) : () => i;
	for (const r of n) e[r] = Eo(o(r));
	return e;
}
function Gs(i) {
	return di(i, { top: 'y', right: 'x', bottom: 'y', left: 'x' });
}
function Kt(i) {
	return di(i, ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']);
}
function ut(i) {
	const t = Gs(i);
	return ((t.width = t.left + t.right), (t.height = t.top + t.bottom), t);
}
function et(i, t) {
	((i = i || {}), (t = t || V.font));
	let e = D(i.size, t.size);
	typeof e == 'string' && (e = parseInt(e, 10));
	let s = D(i.style, t.style);
	s && !('' + s).match(Io) && (console.warn('Invalid font style specified: "' + s + '"'), (s = void 0));
	const n = {
		family: D(i.family, t.family),
		lineHeight: Fo(D(i.lineHeight, t.lineHeight), e),
		size: e,
		style: s,
		weight: D(i.weight, t.weight),
		string: ''
	};
	return ((n.string = Po(n)), n);
}
function ce(i, t, e, s) {
	let n, o, r;
	for (n = 0, o = i.length; n < o; ++n) if (((r = i[n]), r !== void 0 && r !== void 0)) return r;
}
function zo(i, t, e) {
	const { min: s, max: n } = i,
		o = Ws(t, (n - s) / 2),
		r = (a, l) => (e && a === 0 ? 0 : a + l);
	return { min: r(s, -Math.abs(o)), max: r(n, o) };
}
function wt(i, t) {
	return Object.assign(Object.create(i), t);
}
function fi(i, t = [''], e, s, n = () => i[0]) {
	const o = e || i;
	typeof s > 'u' && (s = tn('_fallback', i));
	const r = {
		[Symbol.toStringTag]: 'Object',
		_cacheable: !0,
		_scopes: i,
		_rootScopes: o,
		_fallback: s,
		_getTarget: n,
		override: (a) => fi([a, ...i], t, o, s)
	};
	return new Proxy(r, {
		deleteProperty(a, l) {
			return (delete a[l], delete a._keys, delete i[0][l], !0);
		},
		get(a, l) {
			return Js(a, l, () => Yo(l, t, i, a));
		},
		getOwnPropertyDescriptor(a, l) {
			return Reflect.getOwnPropertyDescriptor(a._scopes[0], l);
		},
		getPrototypeOf() {
			return Reflect.getPrototypeOf(i[0]);
		},
		has(a, l) {
			return Bi(a).includes(l);
		},
		ownKeys(a) {
			return Bi(a);
		},
		set(a, l, c) {
			const h = a._storage || (a._storage = n());
			return ((a[l] = h[l] = c), delete a._keys, !0);
		}
	});
}
function Tt(i, t, e, s) {
	const n = {
		_cacheable: !1,
		_proxy: i,
		_context: t,
		_subProxy: e,
		_stack: new Set(),
		_descriptors: Zs(i, s),
		setContext: (o) => Tt(i, o, e, s),
		override: (o) => Tt(i.override(o), t, e, s)
	};
	return new Proxy(n, {
		deleteProperty(o, r) {
			return (delete o[r], delete i[r], !0);
		},
		get(o, r, a) {
			return Js(o, r, () => Vo(o, r, a));
		},
		getOwnPropertyDescriptor(o, r) {
			return o._descriptors.allKeys ? (Reflect.has(i, r) ? { enumerable: !0, configurable: !0 } : void 0) : Reflect.getOwnPropertyDescriptor(i, r);
		},
		getPrototypeOf() {
			return Reflect.getPrototypeOf(i);
		},
		has(o, r) {
			return Reflect.has(i, r);
		},
		ownKeys() {
			return Reflect.ownKeys(i);
		},
		set(o, r, a) {
			return ((i[r] = a), delete o[r], !0);
		}
	});
}
function Zs(i, t = { scriptable: !0, indexable: !0 }) {
	const { _scriptable: e = t.scriptable, _indexable: s = t.indexable, _allKeys: n = t.allKeys } = i;
	return { allKeys: n, scriptable: e, indexable: s, isScriptable: ft(e) ? e : () => e, isIndexable: ft(s) ? s : () => s };
}
const Bo = (i, t) => (i ? i + oi(t) : t),
	ui = (i, t) => P(t) && i !== 'adapters' && (Object.getPrototypeOf(t) === null || t.constructor === Object);
function Js(i, t, e) {
	if (Object.prototype.hasOwnProperty.call(i, t) || t === 'constructor') return i[t];
	const s = e();
	return ((i[t] = s), s);
}
function Vo(i, t, e) {
	const { _proxy: s, _context: n, _subProxy: o, _descriptors: r } = i;
	let a = s[t];
	return (
		ft(a) && r.isScriptable(t) && (a = No(t, a, i, e)),
		N(a) && a.length && (a = Wo(t, a, i, r.isIndexable)),
		ui(t, a) && (a = Tt(a, n, o && o[t], r)),
		a
	);
}
function No(i, t, e, s) {
	const { _proxy: n, _context: o, _subProxy: r, _stack: a } = e;
	if (a.has(i)) throw new Error('Recursion detected: ' + Array.from(a).join('->') + '->' + i);
	a.add(i);
	let l = t(o, r || s);
	return (a.delete(i), ui(i, l) && (l = gi(n._scopes, n, i, l)), l);
}
function Wo(i, t, e, s) {
	const { _proxy: n, _context: o, _subProxy: r, _descriptors: a } = e;
	if (typeof o.index < 'u' && s(i)) return t[o.index % t.length];
	if (P(t[0])) {
		const l = t,
			c = n._scopes.filter((h) => h !== l);
		t = [];
		for (const h of l) {
			const d = gi(c, n, i, h);
			t.push(Tt(d, o, r && r[i], a));
		}
	}
	return t;
}
function Qs(i, t, e) {
	return ft(i) ? i(t, e) : i;
}
const jo = (i, t) => (i === !0 ? t : typeof i == 'string' ? kt(t, i) : void 0);
function Ho(i, t, e, s, n) {
	for (const o of t) {
		const r = jo(e, o);
		if (r) {
			i.add(r);
			const a = Qs(r._fallback, e, n);
			if (typeof a < 'u' && a !== e && a !== s) return a;
		} else if (r === !1 && typeof s < 'u' && e !== s) return null;
	}
	return !1;
}
function gi(i, t, e, s) {
	const n = t._rootScopes,
		o = Qs(t._fallback, e, s),
		r = [...i, ...n],
		a = new Set();
	a.add(s);
	let l = zi(a, r, e, o || e, s);
	return l === null || (typeof o < 'u' && o !== e && ((l = zi(a, r, o, l, s)), l === null)) ? !1 : fi(Array.from(a), [''], n, o, () => $o(t, e, s));
}
function zi(i, t, e, s, n) {
	for (; e; ) e = Ho(i, t, e, s, n);
	return e;
}
function $o(i, t, e) {
	const s = i._getTarget();
	t in s || (s[t] = {});
	const n = s[t];
	return N(n) && P(e) ? e : n || {};
}
function Yo(i, t, e, s) {
	let n;
	for (const o of t) if (((n = tn(Bo(o, i), e)), typeof n < 'u')) return ui(i, n) ? gi(e, s, i, n) : n;
}
function tn(i, t) {
	for (const e of t) {
		if (!e) continue;
		const s = e[i];
		if (typeof s < 'u') return s;
	}
}
function Bi(i) {
	let t = i._keys;
	return (t || (t = i._keys = Xo(i._scopes)), t);
}
function Xo(i) {
	const t = new Set();
	for (const e of i) for (const s of Object.keys(e).filter((n) => !n.startsWith('_'))) t.add(s);
	return Array.from(t);
}
const Uo = Number.EPSILON || 1e-14,
	Rt = (i, t) => t < i.length && !i[t].skip && i[t],
	en = (i) => (i === 'x' ? 'y' : 'x');
function Ko(i, t, e, s) {
	const n = i.skip ? t : i,
		o = t,
		r = e.skip ? t : e,
		a = Ke(o, n),
		l = Ke(r, o);
	let c = a / (a + l),
		h = l / (a + l);
	((c = isNaN(c) ? 0 : c), (h = isNaN(h) ? 0 : h));
	const d = s * c,
		f = s * h;
	return { previous: { x: o.x - d * (r.x - n.x), y: o.y - d * (r.y - n.y) }, next: { x: o.x + f * (r.x - n.x), y: o.y + f * (r.y - n.y) } };
}
function qo(i, t, e) {
	const s = i.length;
	let n,
		o,
		r,
		a,
		l,
		c = Rt(i, 0);
	for (let h = 0; h < s - 1; ++h)
		if (((l = c), (c = Rt(i, h + 1)), !(!l || !c))) {
			if (Yt(t[h], 0, Uo)) {
				e[h] = e[h + 1] = 0;
				continue;
			}
			((n = e[h] / t[h]),
				(o = e[h + 1] / t[h]),
				(a = Math.pow(n, 2) + Math.pow(o, 2)),
				!(a <= 9) && ((r = 3 / Math.sqrt(a)), (e[h] = n * r * t[h]), (e[h + 1] = o * r * t[h])));
		}
}
function Go(i, t, e = 'x') {
	const s = en(e),
		n = i.length;
	let o,
		r,
		a,
		l = Rt(i, 0);
	for (let c = 0; c < n; ++c) {
		if (((r = a), (a = l), (l = Rt(i, c + 1)), !a)) continue;
		const h = a[e],
			d = a[s];
		(r && ((o = (h - r[e]) / 3), (a[`cp1${e}`] = h - o), (a[`cp1${s}`] = d - o * t[c])),
			l && ((o = (l[e] - h) / 3), (a[`cp2${e}`] = h + o), (a[`cp2${s}`] = d + o * t[c])));
	}
}
function Zo(i, t = 'x') {
	const e = en(t),
		s = i.length,
		n = Array(s).fill(0),
		o = Array(s);
	let r,
		a,
		l,
		c = Rt(i, 0);
	for (r = 0; r < s; ++r)
		if (((a = l), (l = c), (c = Rt(i, r + 1)), !!l)) {
			if (c) {
				const h = c[t] - l[t];
				n[r] = h !== 0 ? (c[e] - l[e]) / h : 0;
			}
			o[r] = a ? (c ? (it(n[r - 1]) !== it(n[r]) ? 0 : (n[r - 1] + n[r]) / 2) : n[r - 1]) : n[r];
		}
	(qo(i, n, o), Go(i, o, t));
}
function he(i, t, e) {
	return Math.max(Math.min(i, e), t);
}
function Jo(i, t) {
	let e,
		s,
		n,
		o,
		r,
		a = ee(i[0], t);
	for (e = 0, s = i.length; e < s; ++e)
		((r = o),
			(o = a),
			(a = e < s - 1 && ee(i[e + 1], t)),
			o &&
				((n = i[e]),
				r && ((n.cp1x = he(n.cp1x, t.left, t.right)), (n.cp1y = he(n.cp1y, t.top, t.bottom))),
				a && ((n.cp2x = he(n.cp2x, t.left, t.right)), (n.cp2y = he(n.cp2y, t.top, t.bottom)))));
}
function Qo(i, t, e, s, n) {
	let o, r, a, l;
	if ((t.spanGaps && (i = i.filter((c) => !c.skip)), t.cubicInterpolationMode === 'monotone')) Zo(i, n);
	else {
		let c = s ? i[i.length - 1] : i[0];
		for (o = 0, r = i.length; o < r; ++o)
			((a = i[o]),
				(l = Ko(c, a, i[Math.min(o + 1, r - (s ? 0 : 1)) % r], t.tension)),
				(a.cp1x = l.previous.x),
				(a.cp1y = l.previous.y),
				(a.cp2x = l.next.x),
				(a.cp2y = l.next.y),
				(c = a));
	}
	t.capBezierPoints && Jo(i, e);
}
function pi() {
	return typeof window < 'u' && typeof document < 'u';
}
function mi(i) {
	let t = i.parentNode;
	return (t && t.toString() === '[object ShadowRoot]' && (t = t.host), t);
}
function Se(i, t, e) {
	let s;
	return (typeof i == 'string' ? ((s = parseInt(i, 10)), i.indexOf('%') !== -1 && (s = (s / 100) * t.parentNode[e])) : (s = i), s);
}
const De = (i) => i.ownerDocument.defaultView.getComputedStyle(i, null);
function tr(i, t) {
	return De(i).getPropertyValue(t);
}
const er = ['top', 'right', 'bottom', 'left'];
function Mt(i, t, e) {
	const s = {};
	e = e ? '-' + e : '';
	for (let n = 0; n < 4; n++) {
		const o = er[n];
		s[o] = parseFloat(i[t + '-' + o + e]) || 0;
	}
	return ((s.width = s.left + s.right), (s.height = s.top + s.bottom), s);
}
const ir = (i, t, e) => (i > 0 || t > 0) && (!e || !e.shadowRoot);
function sr(i, t) {
	const e = i.touches,
		s = e && e.length ? e[0] : i,
		{ offsetX: n, offsetY: o } = s;
	let r = !1,
		a,
		l;
	if (ir(n, o, i.target)) ((a = n), (l = o));
	else {
		const c = t.getBoundingClientRect();
		((a = s.clientX - c.left), (l = s.clientY - c.top), (r = !0));
	}
	return { x: a, y: l, box: r };
}
function xt(i, t) {
	if ('native' in i) return i;
	const { canvas: e, currentDevicePixelRatio: s } = t,
		n = De(e),
		o = n.boxSizing === 'border-box',
		r = Mt(n, 'padding'),
		a = Mt(n, 'border', 'width'),
		{ x: l, y: c, box: h } = sr(i, e),
		d = r.left + (h && a.left),
		f = r.top + (h && a.top);
	let { width: u, height: p } = t;
	return (
		o && ((u -= r.width + a.width), (p -= r.height + a.height)),
		{ x: Math.round((((l - d) / u) * e.width) / s), y: Math.round((((c - f) / p) * e.height) / s) }
	);
}
function nr(i, t, e) {
	let s, n;
	if (t === void 0 || e === void 0) {
		const o = i && mi(i);
		if (!o) ((t = i.clientWidth), (e = i.clientHeight));
		else {
			const r = o.getBoundingClientRect(),
				a = De(o),
				l = Mt(a, 'border', 'width'),
				c = Mt(a, 'padding');
			((t = r.width - c.width - l.width),
				(e = r.height - c.height - l.height),
				(s = Se(a.maxWidth, o, 'clientWidth')),
				(n = Se(a.maxHeight, o, 'clientHeight')));
		}
	}
	return { width: t, height: e, maxWidth: s || ke, maxHeight: n || ke };
}
const ct = (i) => Math.round(i * 10) / 10;
function or(i, t, e, s) {
	const n = De(i),
		o = Mt(n, 'margin'),
		r = Se(n.maxWidth, i, 'clientWidth') || ke,
		a = Se(n.maxHeight, i, 'clientHeight') || ke,
		l = nr(i, t, e);
	let { width: c, height: h } = l;
	if (n.boxSizing === 'content-box') {
		const f = Mt(n, 'border', 'width'),
			u = Mt(n, 'padding');
		((c -= u.width + f.width), (h -= u.height + f.height));
	}
	return (
		(c = Math.max(0, c - o.width)),
		(h = Math.max(0, s ? c / s : h - o.height)),
		(c = ct(Math.min(c, r, l.maxWidth))),
		(h = ct(Math.min(h, a, l.maxHeight))),
		c && !h && (h = ct(c / 2)),
		(t !== void 0 || e !== void 0) && s && l.height && h > l.height && ((h = l.height), (c = ct(Math.floor(h * s)))),
		{ width: c, height: h }
	);
}
function Vi(i, t, e) {
	const s = t || 1,
		n = ct(i.height * s),
		o = ct(i.width * s);
	((i.height = ct(i.height)), (i.width = ct(i.width)));
	const r = i.canvas;
	return (
		r.style && (e || (!r.style.height && !r.style.width)) && ((r.style.height = `${i.height}px`), (r.style.width = `${i.width}px`)),
		i.currentDevicePixelRatio !== s || r.height !== n || r.width !== o
			? ((i.currentDevicePixelRatio = s), (r.height = n), (r.width = o), i.ctx.setTransform(s, 0, 0, s, 0, 0), !0)
			: !1
	);
}
const rr = (function () {
	let i = !1;
	try {
		const t = {
			get passive() {
				return ((i = !0), !1);
			}
		};
		pi() && (window.addEventListener('test', null, t), window.removeEventListener('test', null, t));
	} catch {}
	return i;
})();
function Ni(i, t) {
	const e = tr(i, t),
		s = e && e.match(/^(\d+)(\.\d+)?px$/);
	return s ? +s[1] : void 0;
}
function yt(i, t, e, s) {
	return { x: i.x + e * (t.x - i.x), y: i.y + e * (t.y - i.y) };
}
function ar(i, t, e, s) {
	return { x: i.x + e * (t.x - i.x), y: s === 'middle' ? (e < 0.5 ? i.y : t.y) : s === 'after' ? (e < 1 ? i.y : t.y) : e > 0 ? t.y : i.y };
}
function lr(i, t, e, s) {
	const n = { x: i.cp2x, y: i.cp2y },
		o = { x: t.cp1x, y: t.cp1y },
		r = yt(i, n, e),
		a = yt(n, o, e),
		l = yt(o, t, e),
		c = yt(r, a, e),
		h = yt(a, l, e);
	return yt(c, h, e);
}
const cr = function (i, t) {
		return {
			x(e) {
				return i + i + t - e;
			},
			setWidth(e) {
				t = e;
			},
			textAlign(e) {
				return e === 'center' ? e : e === 'right' ? 'left' : 'right';
			},
			xPlus(e, s) {
				return e - s;
			},
			leftForLtr(e, s) {
				return e - s;
			}
		};
	},
	hr = function () {
		return {
			x(i) {
				return i;
			},
			setWidth(i) {},
			textAlign(i) {
				return i;
			},
			xPlus(i, t) {
				return i + t;
			},
			leftForLtr(i, t) {
				return i;
			}
		};
	};
function Fe(i, t, e) {
	return i ? cr(t, e) : hr();
}
function dr(i, t) {
	let e, s;
	(t === 'ltr' || t === 'rtl') &&
		((e = i.canvas.style),
		(s = [e.getPropertyValue('direction'), e.getPropertyPriority('direction')]),
		e.setProperty('direction', t, 'important'),
		(i.prevTextDirection = s));
}
function fr(i, t) {
	t !== void 0 && (delete i.prevTextDirection, i.canvas.style.setProperty('direction', t[0], t[1]));
}
function sn(i) {
	return i === 'angle' ? { between: Qt, compare: ao, normalize: K } : { between: te, compare: (t, e) => t - e, normalize: (t) => t };
}
function Wi({ start: i, end: t, count: e, loop: s, style: n }) {
	return { start: i % e, end: t % e, loop: s && (t - i + 1) % e === 0, style: n };
}
function ur(i, t, e) {
	const { property: s, start: n, end: o } = e,
		{ between: r, normalize: a } = sn(s),
		l = t.length;
	let { start: c, end: h, loop: d } = i,
		f,
		u;
	if (d) {
		for (c += l, h += l, f = 0, u = l; f < u && r(a(t[c % l][s]), n, o); ++f) (c--, h--);
		((c %= l), (h %= l));
	}
	return (h < c && (h += l), { start: c, end: h, loop: d, style: i.style });
}
function nn(i, t, e) {
	if (!e) return [i];
	const { property: s, start: n, end: o } = e,
		r = t.length,
		{ compare: a, between: l, normalize: c } = sn(s),
		{ start: h, end: d, loop: f, style: u } = ur(i, t, e),
		p = [];
	let g = !1,
		m = null,
		b,
		_,
		y;
	const v = () => l(n, y, b) && a(n, y) !== 0,
		x = () => a(o, b) === 0 || l(o, y, b),
		k = () => g || v(),
		M = () => !g || x();
	for (let S = h, w = h; S <= d; ++S)
		((_ = t[S % r]),
			!_.skip &&
				((b = c(_[s])),
				b !== y &&
					((g = l(b, n, o)),
					m === null && k() && (m = a(b, n) === 0 ? S : w),
					m !== null && M() && (p.push(Wi({ start: m, end: S, loop: f, count: r, style: u })), (m = null)),
					(w = S),
					(y = b))));
	return (m !== null && p.push(Wi({ start: m, end: d, loop: f, count: r, style: u })), p);
}
function on(i, t) {
	const e = [],
		s = i.segments;
	for (let n = 0; n < s.length; n++) {
		const o = nn(s[n], i.points, t);
		o.length && e.push(...o);
	}
	return e;
}
function gr(i, t, e, s) {
	let n = 0,
		o = t - 1;
	if (e && !s) for (; n < t && !i[n].skip; ) n++;
	for (; n < t && i[n].skip; ) n++;
	for (n %= t, e && (o += n); o > n && i[o % t].skip; ) o--;
	return ((o %= t), { start: n, end: o });
}
function pr(i, t, e, s) {
	const n = i.length,
		o = [];
	let r = t,
		a = i[t],
		l;
	for (l = t + 1; l <= e; ++l) {
		const c = i[l % n];
		(c.skip || c.stop
			? a.skip || ((s = !1), o.push({ start: t % n, end: (l - 1) % n, loop: s }), (t = r = c.stop ? l : null))
			: ((r = l), a.skip && (t = l)),
			(a = c));
	}
	return (r !== null && o.push({ start: t % n, end: r % n, loop: s }), o);
}
function mr(i, t) {
	const e = i.points,
		s = i.options.spanGaps,
		n = e.length;
	if (!n) return [];
	const o = !!i._loop,
		{ start: r, end: a } = gr(e, n, o, s);
	if (s === !0) return ji(i, [{ start: r, end: a, loop: o }], e, t);
	const l = a < r ? a + n : a,
		c = !!i._fullLoop && r === 0 && a === n - 1;
	return ji(i, pr(e, r, l, c), e, t);
}
function ji(i, t, e, s) {
	return !s || !s.setContext || !e ? t : br(i, t, e, s);
}
function br(i, t, e, s) {
	const n = i._chart.getContext(),
		o = Hi(i.options),
		{
			_datasetIndex: r,
			options: { spanGaps: a }
		} = i,
		l = e.length,
		c = [];
	let h = o,
		d = t[0].start,
		f = d;
	function u(p, g, m, b) {
		const _ = a ? -1 : 1;
		if (p !== g) {
			for (p += l; e[p % l].skip; ) p -= _;
			for (; e[g % l].skip; ) g += _;
			p % l !== g % l && (c.push({ start: p % l, end: g % l, loop: m, style: b }), (h = b), (d = g % l));
		}
	}
	for (const p of t) {
		d = a ? d : p.start;
		let g = e[d % l],
			m;
		for (f = d + 1; f <= p.end; f++) {
			const b = e[f % l];
			((m = Hi(s.setContext(wt(n, { type: 'segment', p0: g, p1: b, p0DataIndex: (f - 1) % l, p1DataIndex: f % l, datasetIndex: r })))),
				_r(m, h) && u(d, f - 1, p.loop, h),
				(g = b),
				(h = m));
		}
		d < f - 1 && u(d, f - 1, p.loop, h);
	}
	return c;
}
function Hi(i) {
	return {
		backgroundColor: i.backgroundColor,
		borderCapStyle: i.borderCapStyle,
		borderDash: i.borderDash,
		borderDashOffset: i.borderDashOffset,
		borderJoinStyle: i.borderJoinStyle,
		borderWidth: i.borderWidth,
		borderColor: i.borderColor
	};
}
function _r(i, t) {
	if (!t) return !1;
	const e = [],
		s = function (n, o) {
			return ai(o) ? (e.includes(o) || e.push(o), e.indexOf(o)) : o;
		};
	return JSON.stringify(i, s) !== JSON.stringify(t, s);
}
function de(i, t, e) {
	return i.options.clip ? i[e] : t[e];
}
function xr(i, t) {
	const { xScale: e, yScale: s } = i;
	return e && s ? { left: de(e, t, 'left'), right: de(e, t, 'right'), top: de(s, t, 'top'), bottom: de(s, t, 'bottom') } : t;
}
function rn(i, t) {
	const e = t._clip;
	if (e.disabled) return !1;
	const s = xr(t, i.chartArea);
	return {
		left: e.left === !1 ? 0 : s.left - (e.left === !0 ? 0 : e.left),
		right: e.right === !1 ? i.width : s.right + (e.right === !0 ? 0 : e.right),
		top: e.top === !1 ? 0 : s.top - (e.top === !0 ? 0 : e.top),
		bottom: e.bottom === !1 ? i.height : s.bottom + (e.bottom === !0 ? 0 : e.bottom)
	};
}
class yr {
	constructor() {
		((this._request = null), (this._charts = new Map()), (this._running = !1), (this._lastDate = void 0));
	}
	_notify(t, e, s, n) {
		const o = e.listeners[n],
			r = e.duration;
		o.forEach((a) => a({ chart: t, initial: e.initial, numSteps: r, currentStep: Math.min(s - e.start, r) }));
	}
	_refresh() {
		this._request ||
			((this._running = !0),
			(this._request = Us.call(window, () => {
				(this._update(), (this._request = null), this._running && this._refresh());
			})));
	}
	_update(t = Date.now()) {
		let e = 0;
		(this._charts.forEach((s, n) => {
			if (!s.running || !s.items.length) return;
			const o = s.items;
			let r = o.length - 1,
				a = !1,
				l;
			for (; r >= 0; --r)
				((l = o[r]), l._active ? (l._total > s.duration && (s.duration = l._total), l.tick(t), (a = !0)) : ((o[r] = o[o.length - 1]), o.pop()));
			(a && (n.draw(), this._notify(n, s, t, 'progress')),
				o.length || ((s.running = !1), this._notify(n, s, t, 'complete'), (s.initial = !1)),
				(e += o.length));
		}),
			(this._lastDate = t),
			e === 0 && (this._running = !1));
	}
	_getAnims(t) {
		const e = this._charts;
		let s = e.get(t);
		return (s || ((s = { running: !1, initial: !0, items: [], listeners: { complete: [], progress: [] } }), e.set(t, s)), s);
	}
	listen(t, e, s) {
		this._getAnims(t).listeners[e].push(s);
	}
	add(t, e) {
		!e || !e.length || this._getAnims(t).items.push(...e);
	}
	has(t) {
		return this._getAnims(t).items.length > 0;
	}
	start(t) {
		const e = this._charts.get(t);
		e && ((e.running = !0), (e.start = Date.now()), (e.duration = e.items.reduce((s, n) => Math.max(s, n._duration), 0)), this._refresh());
	}
	running(t) {
		if (!this._running) return !1;
		const e = this._charts.get(t);
		return !(!e || !e.running || !e.items.length);
	}
	stop(t) {
		const e = this._charts.get(t);
		if (!e || !e.items.length) return;
		const s = e.items;
		let n = s.length - 1;
		for (; n >= 0; --n) s[n].cancel();
		((e.items = []), this._notify(t, e, Date.now(), 'complete'));
	}
	remove(t) {
		return this._charts.delete(t);
	}
}
var nt = new yr();
const $i = 'transparent',
	vr = {
		boolean(i, t, e) {
			return e > 0.5 ? t : i;
		},
		color(i, t, e) {
			const s = Ri(i || $i),
				n = s.valid && Ri(t || $i);
			return n && n.valid ? n.mix(s, e).hexString() : t;
		},
		number(i, t, e) {
			return i + (t - i) * e;
		}
	};
class Mr {
	constructor(t, e, s, n) {
		const o = e[s];
		n = ce([t.to, n, o, t.from]);
		const r = ce([t.from, o, n]);
		((this._active = !0),
			(this._fn = t.fn || vr[t.type || typeof r]),
			(this._easing = Xt[t.easing] || Xt.linear),
			(this._start = Math.floor(Date.now() + (t.delay || 0))),
			(this._duration = this._total = Math.floor(t.duration)),
			(this._loop = !!t.loop),
			(this._target = e),
			(this._prop = s),
			(this._from = r),
			(this._to = n),
			(this._promises = void 0));
	}
	active() {
		return this._active;
	}
	update(t, e, s) {
		if (this._active) {
			this._notify(!1);
			const n = this._target[this._prop],
				o = s - this._start,
				r = this._duration - o;
			((this._start = s),
				(this._duration = Math.floor(Math.max(r, t.duration))),
				(this._total += o),
				(this._loop = !!t.loop),
				(this._to = ce([t.to, e, n, t.from])),
				(this._from = ce([t.from, n, e])));
		}
	}
	cancel() {
		this._active && (this.tick(Date.now()), (this._active = !1), this._notify(!1));
	}
	tick(t) {
		const e = t - this._start,
			s = this._duration,
			n = this._prop,
			o = this._from,
			r = this._loop,
			a = this._to;
		let l;
		if (((this._active = o !== a && (r || e < s)), !this._active)) {
			((this._target[n] = a), this._notify(!0));
			return;
		}
		if (e < 0) {
			this._target[n] = o;
			return;
		}
		((l = (e / s) % 2), (l = r && l > 1 ? 2 - l : l), (l = this._easing(Math.min(1, Math.max(0, l)))), (this._target[n] = this._fn(o, a, l)));
	}
	wait() {
		const t = this._promises || (this._promises = []);
		return new Promise((e, s) => {
			t.push({ res: e, rej: s });
		});
	}
	_notify(t) {
		const e = t ? 'res' : 'rej',
			s = this._promises || [];
		for (let n = 0; n < s.length; n++) s[n][e]();
	}
}
class an {
	constructor(t, e) {
		((this._chart = t), (this._properties = new Map()), this.configure(e));
	}
	configure(t) {
		if (!P(t)) return;
		const e = Object.keys(V.animation),
			s = this._properties;
		Object.getOwnPropertyNames(t).forEach((n) => {
			const o = t[n];
			if (!P(o)) return;
			const r = {};
			for (const a of e) r[a] = o[a];
			((N(o.properties) && o.properties) || [n]).forEach((a) => {
				(a === n || !s.has(a)) && s.set(a, r);
			});
		});
	}
	_animateOptions(t, e) {
		const s = e.options,
			n = Sr(t, s);
		if (!n) return [];
		const o = this._createAnimations(n, s);
		return (
			s.$shared &&
				kr(t.options.$animations, s).then(
					() => {
						t.options = s;
					},
					() => {}
				),
			o
		);
	}
	_createAnimations(t, e) {
		const s = this._properties,
			n = [],
			o = t.$animations || (t.$animations = {}),
			r = Object.keys(e),
			a = Date.now();
		let l;
		for (l = r.length - 1; l >= 0; --l) {
			const c = r[l];
			if (c.charAt(0) === '$') continue;
			if (c === 'options') {
				n.push(...this._animateOptions(t, e));
				continue;
			}
			const h = e[c];
			let d = o[c];
			const f = s.get(c);
			if (d)
				if (f && d.active()) {
					d.update(f, h, a);
					continue;
				} else d.cancel();
			if (!f || !f.duration) {
				t[c] = h;
				continue;
			}
			((o[c] = d = new Mr(f, t, c, h)), n.push(d));
		}
		return n;
	}
	update(t, e) {
		if (this._properties.size === 0) {
			Object.assign(t, e);
			return;
		}
		const s = this._createAnimations(t, e);
		if (s.length) return (nt.add(this._chart, s), !0);
	}
}
function kr(i, t) {
	const e = [],
		s = Object.keys(t);
	for (let n = 0; n < s.length; n++) {
		const o = i[s[n]];
		o && o.active() && e.push(o.wait());
	}
	return Promise.all(e);
}
function Sr(i, t) {
	if (!t) return;
	let e = i.options;
	if (!e) {
		i.options = t;
		return;
	}
	return (e.$shared && (i.options = e = Object.assign({}, e, { $shared: !1, $animations: {} })), e);
}
function Yi(i, t) {
	const e = (i && i.options) || {},
		s = e.reverse,
		n = e.min === void 0 ? t : 0,
		o = e.max === void 0 ? t : 0;
	return { start: s ? o : n, end: s ? n : o };
}
function wr(i, t, e) {
	if (e === !1) return !1;
	const s = Yi(i, e),
		n = Yi(t, e);
	return { top: n.end, right: s.end, bottom: n.start, left: s.start };
}
function Pr(i) {
	let t, e, s, n;
	return (
		P(i) ? ((t = i.top), (e = i.right), (s = i.bottom), (n = i.left)) : (t = e = s = n = i),
		{ top: t, right: e, bottom: s, left: n, disabled: i === !1 }
	);
}
function ln(i, t) {
	const e = [],
		s = i._getSortedDatasetMetas(t);
	let n, o;
	for (n = 0, o = s.length; n < o; ++n) e.push(s[n].index);
	return e;
}
function Xi(i, t, e, s = {}) {
	const n = i.keys,
		o = s.mode === 'single';
	let r, a, l, c;
	if (t === null) return;
	let h = !1;
	for (r = 0, a = n.length; r < a; ++r) {
		if (((l = +n[r]), l === e)) {
			if (((h = !0), s.all)) continue;
			break;
		}
		((c = i.values[l]), $(c) && (o || t === 0 || it(t) === it(c)) && (t += c));
	}
	return !h && !s.all ? 0 : t;
}
function Dr(i, t) {
	const { iScale: e, vScale: s } = t,
		n = e.axis === 'x' ? 'x' : 'y',
		o = s.axis === 'x' ? 'x' : 'y',
		r = Object.keys(i),
		a = new Array(r.length);
	let l, c, h;
	for (l = 0, c = r.length; l < c; ++l) ((h = r[l]), (a[l] = { [n]: h, [o]: i[h] }));
	return a;
}
function Ee(i, t) {
	const e = i && i.options.stacked;
	return e || (e === void 0 && t.stack !== void 0);
}
function Or(i, t, e) {
	return `${i.id}.${t.id}.${e.stack || e.type}`;
}
function Cr(i) {
	const { min: t, max: e, minDefined: s, maxDefined: n } = i.getUserBounds();
	return { min: s ? t : Number.NEGATIVE_INFINITY, max: n ? e : Number.POSITIVE_INFINITY };
}
function Ar(i, t, e) {
	const s = i[t] || (i[t] = {});
	return s[e] || (s[e] = {});
}
function Ui(i, t, e, s) {
	for (const n of t.getMatchingVisibleMetas(s).reverse()) {
		const o = i[n.index];
		if ((e && o > 0) || (!e && o < 0)) return n.index;
	}
	return null;
}
function Ki(i, t) {
	const { chart: e, _cachedMeta: s } = i,
		n = e._stacks || (e._stacks = {}),
		{ iScale: o, vScale: r, index: a } = s,
		l = o.axis,
		c = r.axis,
		h = Or(o, r, s),
		d = t.length;
	let f;
	for (let u = 0; u < d; ++u) {
		const p = t[u],
			{ [l]: g, [c]: m } = p,
			b = p._stacks || (p._stacks = {});
		((f = b[c] = Ar(n, h, g)), (f[a] = m), (f._top = Ui(f, r, !0, s.type)), (f._bottom = Ui(f, r, !1, s.type)));
		const _ = f._visualValues || (f._visualValues = {});
		_[a] = m;
	}
}
function ze(i, t) {
	const e = i.scales;
	return Object.keys(e)
		.filter((s) => e[s].axis === t)
		.shift();
}
function Tr(i, t) {
	return wt(i, { active: !1, dataset: void 0, datasetIndex: t, index: t, mode: 'default', type: 'dataset' });
}
function Rr(i, t, e) {
	return wt(i, { active: !1, dataIndex: t, parsed: void 0, raw: void 0, element: e, index: t, mode: 'default', type: 'data' });
}
function Et(i, t) {
	const e = i.controller.index,
		s = i.vScale && i.vScale.axis;
	if (s) {
		t = t || i._parsed;
		for (const n of t) {
			const o = n._stacks;
			if (!o || o[s] === void 0 || o[s][e] === void 0) return;
			(delete o[s][e], o[s]._visualValues !== void 0 && o[s]._visualValues[e] !== void 0 && delete o[s]._visualValues[e]);
		}
	}
}
const Be = (i) => i === 'reset' || i === 'none',
	qi = (i, t) => (t ? i : Object.assign({}, i)),
	Lr = (i, t, e) => i && !t.hidden && t._stacked && { keys: ln(e, !0), values: null };
class Oe {
	static defaults = {};
	static datasetElementType = null;
	static dataElementType = null;
	constructor(t, e) {
		((this.chart = t),
			(this._ctx = t.ctx),
			(this.index = e),
			(this._cachedDataOpts = {}),
			(this._cachedMeta = this.getMeta()),
			(this._type = this._cachedMeta.type),
			(this.options = void 0),
			(this._parsing = !1),
			(this._data = void 0),
			(this._objectData = void 0),
			(this._sharedOptions = void 0),
			(this._drawStart = void 0),
			(this._drawCount = void 0),
			(this.enableOptionSharing = !1),
			(this.supportsDecimation = !1),
			(this.$context = void 0),
			(this._syncList = []),
			(this.datasetElementType = new.target.datasetElementType),
			(this.dataElementType = new.target.dataElementType),
			this.initialize());
	}
	initialize() {
		const t = this._cachedMeta;
		(this.configure(),
			this.linkScales(),
			(t._stacked = Ee(t.vScale, t)),
			this.addElements(),
			this.options.fill &&
				!this.chart.isPluginEnabled('filler') &&
				console.warn(
					"Tried to use the 'fill' option without the 'Filler' plugin enabled. Please import and register the 'Filler' plugin and make sure it is not disabled in the options"
				));
	}
	updateIndex(t) {
		(this.index !== t && Et(this._cachedMeta), (this.index = t));
	}
	linkScales() {
		const t = this.chart,
			e = this._cachedMeta,
			s = this.getDataset(),
			n = (d, f, u, p) => (d === 'x' ? f : d === 'r' ? p : u),
			o = (e.xAxisID = D(s.xAxisID, ze(t, 'x'))),
			r = (e.yAxisID = D(s.yAxisID, ze(t, 'y'))),
			a = (e.rAxisID = D(s.rAxisID, ze(t, 'r'))),
			l = e.indexAxis,
			c = (e.iAxisID = n(l, o, r, a)),
			h = (e.vAxisID = n(l, r, o, a));
		((e.xScale = this.getScaleForId(o)),
			(e.yScale = this.getScaleForId(r)),
			(e.rScale = this.getScaleForId(a)),
			(e.iScale = this.getScaleForId(c)),
			(e.vScale = this.getScaleForId(h)));
	}
	getDataset() {
		return this.chart.data.datasets[this.index];
	}
	getMeta() {
		return this.chart.getDatasetMeta(this.index);
	}
	getScaleForId(t) {
		return this.chart.scales[t];
	}
	_getOtherScale(t) {
		const e = this._cachedMeta;
		return t === e.iScale ? e.vScale : e.iScale;
	}
	reset() {
		this._update('reset');
	}
	_destroy() {
		const t = this._cachedMeta;
		(this._data && Oi(this._data, this), t._stacked && Et(t));
	}
	_dataCheck() {
		const t = this.getDataset(),
			e = t.data || (t.data = []),
			s = this._data;
		if (P(e)) {
			const n = this._cachedMeta;
			this._data = Dr(e, n);
		} else if (s !== e) {
			if (s) {
				Oi(s, this);
				const n = this._cachedMeta;
				(Et(n), (n._parsed = []));
			}
			(e && Object.isExtensible(e) && fo(e, this), (this._syncList = []), (this._data = e));
		}
	}
	addElements() {
		const t = this._cachedMeta;
		(this._dataCheck(), this.datasetElementType && (t.dataset = new this.datasetElementType()));
	}
	buildOrUpdateElements(t) {
		const e = this._cachedMeta,
			s = this.getDataset();
		let n = !1;
		this._dataCheck();
		const o = e._stacked;
		((e._stacked = Ee(e.vScale, e)),
			e.stack !== s.stack && ((n = !0), Et(e), (e.stack = s.stack)),
			this._resyncElements(t),
			(n || o !== e._stacked) && (Ki(this, e._parsed), (e._stacked = Ee(e.vScale, e))));
	}
	configure() {
		const t = this.chart.config,
			e = t.datasetScopeKeys(this._type),
			s = t.getOptionScopes(this.getDataset(), e, !0);
		((this.options = t.createResolver(s, this.getContext())), (this._parsing = this.options.parsing), (this._cachedDataOpts = {}));
	}
	parse(t, e) {
		const { _cachedMeta: s, _data: n } = this,
			{ iScale: o, _stacked: r } = s,
			a = o.axis;
		let l = t === 0 && e === n.length ? !0 : s._sorted,
			c = t > 0 && s._parsed[t - 1],
			h,
			d,
			f;
		if (this._parsing === !1) ((s._parsed = n), (s._sorted = !0), (f = n));
		else {
			N(n[t]) ? (f = this.parseArrayData(s, n, t, e)) : P(n[t]) ? (f = this.parseObjectData(s, n, t, e)) : (f = this.parsePrimitiveData(s, n, t, e));
			const u = () => d[a] === null || (c && d[a] < c[a]);
			for (h = 0; h < e; ++h) ((s._parsed[h + t] = d = f[h]), l && (u() && (l = !1), (c = d)));
			s._sorted = l;
		}
		r && Ki(this, f);
	}
	parsePrimitiveData(t, e, s, n) {
		const { iScale: o, vScale: r } = t,
			a = o.axis,
			l = r.axis,
			c = o.getLabels(),
			h = o === r,
			d = new Array(n);
		let f, u, p;
		for (f = 0, u = n; f < u; ++f) ((p = f + s), (d[f] = { [a]: h || o.parse(c[p], p), [l]: r.parse(e[p], p) }));
		return d;
	}
	parseArrayData(t, e, s, n) {
		const { xScale: o, yScale: r } = t,
			a = new Array(n);
		let l, c, h, d;
		for (l = 0, c = n; l < c; ++l) ((h = l + s), (d = e[h]), (a[l] = { x: o.parse(d[0], h), y: r.parse(d[1], h) }));
		return a;
	}
	parseObjectData(t, e, s, n) {
		const { xScale: o, yScale: r } = t,
			{ xAxisKey: a = 'x', yAxisKey: l = 'y' } = this._parsing,
			c = new Array(n);
		let h, d, f, u;
		for (h = 0, d = n; h < d; ++h) ((f = h + s), (u = e[f]), (c[h] = { x: o.parse(kt(u, a), f), y: r.parse(kt(u, l), f) }));
		return c;
	}
	getParsed(t) {
		return this._cachedMeta._parsed[t];
	}
	getDataElement(t) {
		return this._cachedMeta.data[t];
	}
	applyStack(t, e, s) {
		const n = this.chart,
			o = this._cachedMeta,
			r = e[t.axis],
			a = { keys: ln(n, !0), values: e._stacks[t.axis]._visualValues };
		return Xi(a, r, o.index, { mode: s });
	}
	updateRangeFromParsed(t, e, s, n) {
		const o = s[e.axis];
		let r = o === null ? NaN : o;
		const a = n && s._stacks[e.axis];
		(n && a && ((n.values = a), (r = Xi(n, o, this._cachedMeta.index))), (t.min = Math.min(t.min, r)), (t.max = Math.max(t.max, r)));
	}
	getMinMax(t, e) {
		const s = this._cachedMeta,
			n = s._parsed,
			o = s._sorted && t === s.iScale,
			r = n.length,
			a = this._getOtherScale(t),
			l = Lr(e, s, this.chart),
			c = { min: Number.POSITIVE_INFINITY, max: Number.NEGATIVE_INFINITY },
			{ min: h, max: d } = Cr(a);
		let f, u;
		function p() {
			u = n[f];
			const g = u[a.axis];
			return !$(u[t.axis]) || h > g || d < g;
		}
		for (f = 0; f < r && !(!p() && (this.updateRangeFromParsed(c, t, u, l), o)); ++f);
		if (o) {
			for (f = r - 1; f >= 0; --f)
				if (!p()) {
					this.updateRangeFromParsed(c, t, u, l);
					break;
				}
		}
		return c;
	}
	getAllParsedValues(t) {
		const e = this._cachedMeta._parsed,
			s = [];
		let n, o, r;
		for (n = 0, o = e.length; n < o; ++n) ((r = e[n][t.axis]), $(r) && s.push(r));
		return s;
	}
	getMaxOverflow() {
		return !1;
	}
	getLabelAndValue(t) {
		const e = this._cachedMeta,
			s = e.iScale,
			n = e.vScale,
			o = this.getParsed(t);
		return { label: s ? '' + s.getLabelForValue(o[s.axis]) : '', value: n ? '' + n.getLabelForValue(o[n.axis]) : '' };
	}
	_update(t) {
		const e = this._cachedMeta;
		(this.update(t || 'default'), (e._clip = Pr(D(this.options.clip, wr(e.xScale, e.yScale, this.getMaxOverflow())))));
	}
	update(t) {}
	draw() {
		const t = this._ctx,
			e = this.chart,
			s = this._cachedMeta,
			n = s.data || [],
			o = e.chartArea,
			r = [],
			a = this._drawStart || 0,
			l = this._drawCount || n.length - a,
			c = this.options.drawActiveElementsOnTop;
		let h;
		for (s.dataset && s.dataset.draw(t, o, a, l), h = a; h < a + l; ++h) {
			const d = n[h];
			d.hidden || (d.active && c ? r.push(d) : d.draw(t, o));
		}
		for (h = 0; h < r.length; ++h) r[h].draw(t, o);
	}
	getStyle(t, e) {
		const s = e ? 'active' : 'default';
		return t === void 0 && this._cachedMeta.dataset ? this.resolveDatasetElementOptions(s) : this.resolveDataElementOptions(t || 0, s);
	}
	getContext(t, e, s) {
		const n = this.getDataset();
		let o;
		if (t >= 0 && t < this._cachedMeta.data.length) {
			const r = this._cachedMeta.data[t];
			((o = r.$context || (r.$context = Rr(this.getContext(), t, r))),
				(o.parsed = this.getParsed(t)),
				(o.raw = n.data[t]),
				(o.index = o.dataIndex = t));
		} else
			((o = this.$context || (this.$context = Tr(this.chart.getContext(), this.index))), (o.dataset = n), (o.index = o.datasetIndex = this.index));
		return ((o.active = !!e), (o.mode = s), o);
	}
	resolveDatasetElementOptions(t) {
		return this._resolveElementOptions(this.datasetElementType.id, t);
	}
	resolveDataElementOptions(t, e) {
		return this._resolveElementOptions(this.dataElementType.id, e, t);
	}
	_resolveElementOptions(t, e = 'default', s) {
		const n = e === 'active',
			o = this._cachedDataOpts,
			r = t + '-' + e,
			a = o[r],
			l = this.enableOptionSharing && Zt(s);
		if (a) return qi(a, l);
		const c = this.chart.config,
			h = c.datasetElementScopeKeys(this._type, t),
			d = n ? [`${t}Hover`, 'hover', t, ''] : [t, ''],
			f = c.getOptionScopes(this.getDataset(), h),
			u = Object.keys(V.elements[t]),
			p = () => this.getContext(s, n, e),
			g = c.resolveNamedOptions(f, u, p, d);
		return (g.$shared && ((g.$shared = l), (o[r] = Object.freeze(qi(g, l)))), g);
	}
	_resolveAnimations(t, e, s) {
		const n = this.chart,
			o = this._cachedDataOpts,
			r = `animation-${e}`,
			a = o[r];
		if (a) return a;
		let l;
		if (n.options.animation !== !1) {
			const h = this.chart.config,
				d = h.datasetAnimationScopeKeys(this._type, e),
				f = h.getOptionScopes(this.getDataset(), d);
			l = h.createResolver(f, this.getContext(t, s, e));
		}
		const c = new an(n, l && l.animations);
		return (l && l._cacheable && (o[r] = Object.freeze(c)), c);
	}
	getSharedOptions(t) {
		if (t.$shared) return this._sharedOptions || (this._sharedOptions = Object.assign({}, t));
	}
	includeOptions(t, e) {
		return !e || Be(t) || this.chart._animationsDisabled;
	}
	_getSharedOptions(t, e) {
		const s = this.resolveDataElementOptions(t, e),
			n = this._sharedOptions,
			o = this.getSharedOptions(s),
			r = this.includeOptions(e, o) || o !== n;
		return (this.updateSharedOptions(o, e, s), { sharedOptions: o, includeOptions: r });
	}
	updateElement(t, e, s, n) {
		Be(n) ? Object.assign(t, s) : this._resolveAnimations(e, n).update(t, s);
	}
	updateSharedOptions(t, e, s) {
		t && !Be(e) && this._resolveAnimations(void 0, e).update(t, s);
	}
	_setStyle(t, e, s, n) {
		t.active = n;
		const o = this.getStyle(e, n);
		this._resolveAnimations(e, s, n).update(t, { options: (!n && this.getSharedOptions(o)) || o });
	}
	removeHoverStyle(t, e, s) {
		this._setStyle(t, s, 'active', !1);
	}
	setHoverStyle(t, e, s) {
		this._setStyle(t, s, 'active', !0);
	}
	_removeDatasetHoverStyle() {
		const t = this._cachedMeta.dataset;
		t && this._setStyle(t, void 0, 'active', !1);
	}
	_setDatasetHoverStyle() {
		const t = this._cachedMeta.dataset;
		t && this._setStyle(t, void 0, 'active', !0);
	}
	_resyncElements(t) {
		const e = this._data,
			s = this._cachedMeta.data;
		for (const [a, l, c] of this._syncList) this[a](l, c);
		this._syncList = [];
		const n = s.length,
			o = e.length,
			r = Math.min(o, n);
		(r && this.parse(0, r), o > n ? this._insertElements(n, o - n, t) : o < n && this._removeElements(o, n - o));
	}
	_insertElements(t, e, s = !0) {
		const n = this._cachedMeta,
			o = n.data,
			r = t + e;
		let a;
		const l = (c) => {
			for (c.length += e, a = c.length - 1; a >= r; a--) c[a] = c[a - e];
		};
		for (l(o), a = t; a < r; ++a) o[a] = new this.dataElementType();
		(this._parsing && l(n._parsed), this.parse(t, e), s && this.updateElements(o, t, e, 'reset'));
	}
	updateElements(t, e, s, n) {}
	_removeElements(t, e) {
		const s = this._cachedMeta;
		if (this._parsing) {
			const n = s._parsed.splice(t, e);
			s._stacked && Et(s, n);
		}
		s.data.splice(t, e);
	}
	_sync(t) {
		if (this._parsing) this._syncList.push(t);
		else {
			const [e, s, n] = t;
			this[e](s, n);
		}
		this.chart._dataChanges.push([this.index, ...t]);
	}
	_onDataPush() {
		const t = arguments.length;
		this._sync(['_insertElements', this.getDataset().data.length - t, t]);
	}
	_onDataPop() {
		this._sync(['_removeElements', this._cachedMeta.data.length - 1, 1]);
	}
	_onDataShift() {
		this._sync(['_removeElements', 0, 1]);
	}
	_onDataSplice(t, e) {
		e && this._sync(['_removeElements', t, e]);
		const s = arguments.length - 2;
		s && this._sync(['_insertElements', t, s]);
	}
	_onDataUnshift() {
		this._sync(['_insertElements', 0, arguments.length]);
	}
}
function Ir(i, t) {
	if (!i._cache.$bar) {
		const e = i.getMatchingVisibleMetas(t);
		let s = [];
		for (let n = 0, o = e.length; n < o; n++) s = s.concat(e[n].controller.getAllParsedValues(i));
		i._cache.$bar = Xs(s.sort((n, o) => n - o));
	}
	return i._cache.$bar;
}
function Fr(i) {
	const t = i.iScale,
		e = Ir(t, i.type);
	let s = t._length,
		n,
		o,
		r,
		a;
	const l = () => {
		r === 32767 || r === -32768 || (Zt(a) && (s = Math.min(s, Math.abs(r - a) || s)), (a = r));
	};
	for (n = 0, o = e.length; n < o; ++n) ((r = t.getPixelForValue(e[n])), l());
	for (a = void 0, n = 0, o = t.ticks.length; n < o; ++n) ((r = t.getPixelForTick(n)), l());
	return s;
}
function Er(i, t, e, s) {
	const n = e.barThickness;
	let o, r;
	return (
		O(n) ? ((o = t.min * e.categoryPercentage), (r = e.barPercentage)) : ((o = n * s), (r = 1)),
		{ chunk: o / s, ratio: r, start: t.pixels[i] - o / 2 }
	);
}
function zr(i, t, e, s) {
	const n = t.pixels,
		o = n[i];
	let r = i > 0 ? n[i - 1] : null,
		a = i < n.length - 1 ? n[i + 1] : null;
	const l = e.categoryPercentage;
	(r === null && (r = o - (a === null ? t.end - t.start : a - o)), a === null && (a = o + o - r));
	const c = o - ((o - Math.min(r, a)) / 2) * l;
	return { chunk: ((Math.abs(a - r) / 2) * l) / s, ratio: e.barPercentage, start: c };
}
function Br(i, t, e, s) {
	const n = e.parse(i[0], s),
		o = e.parse(i[1], s),
		r = Math.min(n, o),
		a = Math.max(n, o);
	let l = r,
		c = a;
	(Math.abs(r) > Math.abs(a) && ((l = a), (c = r)), (t[e.axis] = c), (t._custom = { barStart: l, barEnd: c, start: n, end: o, min: r, max: a }));
}
function cn(i, t, e, s) {
	return (N(i) ? Br(i, t, e, s) : (t[e.axis] = e.parse(i, s)), t);
}
function Gi(i, t, e, s) {
	const n = i.iScale,
		o = i.vScale,
		r = n.getLabels(),
		a = n === o,
		l = [];
	let c, h, d, f;
	for (c = e, h = e + s; c < h; ++c) ((f = t[c]), (d = {}), (d[n.axis] = a || n.parse(r[c], c)), l.push(cn(f, d, o, c)));
	return l;
}
function Ve(i) {
	return i && i.barStart !== void 0 && i.barEnd !== void 0;
}
function Vr(i, t, e) {
	return i !== 0 ? it(i) : (t.isHorizontal() ? 1 : -1) * (t.min >= e ? 1 : -1);
}
function Nr(i) {
	let t, e, s, n, o;
	return (
		i.horizontal ? ((t = i.base > i.x), (e = 'left'), (s = 'right')) : ((t = i.base < i.y), (e = 'bottom'), (s = 'top')),
		t ? ((n = 'end'), (o = 'start')) : ((n = 'start'), (o = 'end')),
		{ start: e, end: s, reverse: t, top: n, bottom: o }
	);
}
function Wr(i, t, e, s) {
	let n = t.borderSkipped;
	const o = {};
	if (!n) {
		i.borderSkipped = o;
		return;
	}
	if (n === !0) {
		i.borderSkipped = { top: !0, right: !0, bottom: !0, left: !0 };
		return;
	}
	const { start: r, end: a, reverse: l, top: c, bottom: h } = Nr(i);
	(n === 'middle' &&
		e &&
		((i.enableBorderRadius = !0), (e._top || 0) === s ? (n = c) : (e._bottom || 0) === s ? (n = h) : ((o[Zi(h, r, a, l)] = !0), (n = c))),
		(o[Zi(n, r, a, l)] = !0),
		(i.borderSkipped = o));
}
function Zi(i, t, e, s) {
	return (s ? ((i = jr(i, t, e)), (i = Ji(i, e, t))) : (i = Ji(i, t, e)), i);
}
function jr(i, t, e) {
	return i === t ? e : i === e ? t : i;
}
function Ji(i, t, e) {
	return i === 'start' ? t : i === 'end' ? e : i;
}
function Hr(i, { inflateAmount: t }, e) {
	i.inflateAmount = t === 'auto' ? (e === 1 ? 0.33 : 0) : t;
}
class ic extends Oe {
	static id = 'bar';
	static defaults = {
		datasetElementType: !1,
		dataElementType: 'bar',
		categoryPercentage: 0.8,
		barPercentage: 0.9,
		grouped: !0,
		animations: { numbers: { type: 'number', properties: ['x', 'y', 'base', 'width', 'height'] } }
	};
	static overrides = { scales: { _index_: { type: 'category', offset: !0, grid: { offset: !0 } }, _value_: { type: 'linear', beginAtZero: !0 } } };
	parsePrimitiveData(t, e, s, n) {
		return Gi(t, e, s, n);
	}
	parseArrayData(t, e, s, n) {
		return Gi(t, e, s, n);
	}
	parseObjectData(t, e, s, n) {
		const { iScale: o, vScale: r } = t,
			{ xAxisKey: a = 'x', yAxisKey: l = 'y' } = this._parsing,
			c = o.axis === 'x' ? a : l,
			h = r.axis === 'x' ? a : l,
			d = [];
		let f, u, p, g;
		for (f = s, u = s + n; f < u; ++f) ((g = e[f]), (p = {}), (p[o.axis] = o.parse(kt(g, c), f)), d.push(cn(kt(g, h), p, r, f)));
		return d;
	}
	updateRangeFromParsed(t, e, s, n) {
		super.updateRangeFromParsed(t, e, s, n);
		const o = s._custom;
		o && e === this._cachedMeta.vScale && ((t.min = Math.min(t.min, o.min)), (t.max = Math.max(t.max, o.max)));
	}
	getMaxOverflow() {
		return 0;
	}
	getLabelAndValue(t) {
		const e = this._cachedMeta,
			{ iScale: s, vScale: n } = e,
			o = this.getParsed(t),
			r = o._custom,
			a = Ve(r) ? '[' + r.start + ', ' + r.end + ']' : '' + n.getLabelForValue(o[n.axis]);
		return { label: '' + s.getLabelForValue(o[s.axis]), value: a };
	}
	initialize() {
		((this.enableOptionSharing = !0), super.initialize());
		const t = this._cachedMeta;
		t.stack = this.getDataset().stack;
	}
	update(t) {
		const e = this._cachedMeta;
		this.updateElements(e.data, 0, e.data.length, t);
	}
	updateElements(t, e, s, n) {
		const o = n === 'reset',
			{
				index: r,
				_cachedMeta: { vScale: a }
			} = this,
			l = a.getBasePixel(),
			c = a.isHorizontal(),
			h = this._getRuler(),
			{ sharedOptions: d, includeOptions: f } = this._getSharedOptions(e, n);
		for (let u = e; u < e + s; u++) {
			const p = this.getParsed(u),
				g = o || O(p[a.axis]) ? { base: l, head: l } : this._calculateBarValuePixels(u),
				m = this._calculateBarIndexPixels(u, h),
				b = (p._stacks || {})[a.axis],
				_ = {
					horizontal: c,
					base: g.base,
					enableBorderRadius: !b || Ve(p._custom) || r === b._top || r === b._bottom,
					x: c ? g.head : m.center,
					y: c ? m.center : g.head,
					height: c ? m.size : Math.abs(g.size),
					width: c ? Math.abs(g.size) : m.size
				};
			f && (_.options = d || this.resolveDataElementOptions(u, t[u].active ? 'active' : n));
			const y = _.options || t[u].options;
			(Wr(_, y, b, r), Hr(_, y, h.ratio), this.updateElement(t[u], u, _, n));
		}
	}
	_getStacks(t, e) {
		const { iScale: s } = this._cachedMeta,
			n = s.getMatchingVisibleMetas(this._type).filter((h) => h.controller.options.grouped),
			o = s.options.stacked,
			r = [],
			a = this._cachedMeta.controller.getParsed(e),
			l = a && a[s.axis],
			c = (h) => {
				const d = h._parsed.find((u) => u[s.axis] === l),
					f = d && d[h.vScale.axis];
				if (O(f) || isNaN(f)) return !0;
			};
		for (const h of n)
			if (
				!(e !== void 0 && c(h)) &&
				((o === !1 || r.indexOf(h.stack) === -1 || (o === void 0 && h.stack === void 0)) && r.push(h.stack), h.index === t)
			)
				break;
		return (r.length || r.push(void 0), r);
	}
	_getStackCount(t) {
		return this._getStacks(void 0, t).length;
	}
	_getAxisCount() {
		return this._getAxis().length;
	}
	getFirstScaleIdForIndexAxis() {
		const t = this.chart.scales,
			e = this.chart.options.indexAxis;
		return Object.keys(t)
			.filter((s) => t[s].axis === e)
			.shift();
	}
	_getAxis() {
		const t = {},
			e = this.getFirstScaleIdForIndexAxis();
		for (const s of this.chart.data.datasets) t[D(this.chart.options.indexAxis === 'x' ? s.xAxisID : s.yAxisID, e)] = !0;
		return Object.keys(t);
	}
	_getStackIndex(t, e, s) {
		const n = this._getStacks(t, s),
			o = e !== void 0 ? n.indexOf(e) : -1;
		return o === -1 ? n.length - 1 : o;
	}
	_getRuler() {
		const t = this.options,
			e = this._cachedMeta,
			s = e.iScale,
			n = [];
		let o, r;
		for (o = 0, r = e.data.length; o < r; ++o) n.push(s.getPixelForValue(this.getParsed(o)[s.axis], o));
		const a = t.barThickness;
		return {
			min: a || Fr(e),
			pixels: n,
			start: s._startPixel,
			end: s._endPixel,
			stackCount: this._getStackCount(),
			scale: s,
			grouped: t.grouped,
			ratio: a ? 1 : t.categoryPercentage * t.barPercentage
		};
	}
	_calculateBarValuePixels(t) {
		const {
				_cachedMeta: { vScale: e, _stacked: s, index: n },
				options: { base: o, minBarLength: r }
			} = this,
			a = o || 0,
			l = this.getParsed(t),
			c = l._custom,
			h = Ve(c);
		let d = l[e.axis],
			f = 0,
			u = s ? this.applyStack(e, l, s) : d,
			p,
			g;
		(u !== d && ((f = u - d), (u = d)), h && ((d = c.barStart), (u = c.barEnd - c.barStart), d !== 0 && it(d) !== it(c.barEnd) && (f = 0), (f += d)));
		const m = !O(o) && !h ? o : f;
		let b = e.getPixelForValue(m);
		if ((this.chart.getDataVisibility(t) ? (p = e.getPixelForValue(f + u)) : (p = b), (g = p - b), Math.abs(g) < r)) {
			((g = Vr(g, e, a) * r), d === a && (b -= g / 2));
			const _ = e.getPixelForDecimal(0),
				y = e.getPixelForDecimal(1),
				v = Math.min(_, y),
				x = Math.max(_, y);
			((b = Math.max(Math.min(b, x), v)),
				(p = b + g),
				s && !h && (l._stacks[e.axis]._visualValues[n] = e.getValueForPixel(p) - e.getValueForPixel(b)));
		}
		if (b === e.getPixelForValue(a)) {
			const _ = (it(g) * e.getLineWidthForValue(a)) / 2;
			((b += _), (g -= _));
		}
		return { size: g, base: b, head: p, center: p + g / 2 };
	}
	_calculateBarIndexPixels(t, e) {
		const s = e.scale,
			n = this.options,
			o = n.skipNull,
			r = D(n.maxBarThickness, 1 / 0);
		let a, l;
		const c = this._getAxisCount();
		if (e.grouped) {
			const h = o ? this._getStackCount(t) : e.stackCount,
				d = n.barThickness === 'flex' ? zr(t, e, n, h * c) : Er(t, e, n, h * c),
				f = this.chart.options.indexAxis === 'x' ? this.getDataset().xAxisID : this.getDataset().yAxisID,
				u = this._getAxis().indexOf(D(f, this.getFirstScaleIdForIndexAxis())),
				p = this._getStackIndex(this.index, this._cachedMeta.stack, o ? t : void 0) + u;
			((a = d.start + d.chunk * p + d.chunk / 2), (l = Math.min(r, d.chunk * d.ratio)));
		} else ((a = s.getPixelForValue(this.getParsed(t)[s.axis], t)), (l = Math.min(r, e.min * e.ratio)));
		return { base: a - l / 2, head: a + l / 2, center: a, size: l };
	}
	draw() {
		const t = this._cachedMeta,
			e = t.vScale,
			s = t.data,
			n = s.length;
		let o = 0;
		for (; o < n; ++o) this.getParsed(o)[e.axis] !== null && !s[o].hidden && s[o].draw(this._ctx);
	}
}
function $r(i, t, e) {
	let s = 1,
		n = 1,
		o = 0,
		r = 0;
	if (t < E) {
		const a = i,
			l = a + t,
			c = Math.cos(a),
			h = Math.sin(a),
			d = Math.cos(l),
			f = Math.sin(l),
			u = (y, v, x) => (Qt(y, a, l, !0) ? 1 : Math.max(v, v * e, x, x * e)),
			p = (y, v, x) => (Qt(y, a, l, !0) ? -1 : Math.min(v, v * e, x, x * e)),
			g = u(0, c, d),
			m = u(W, h, f),
			b = p(R, c, d),
			_ = p(R + W, h, f);
		((s = (g - b) / 2), (n = (m - _) / 2), (o = -(g + b) / 2), (r = -(m + _) / 2));
	}
	return { ratioX: s, ratioY: n, offsetX: o, offsetY: r };
}
class Yr extends Oe {
	static id = 'doughnut';
	static defaults = {
		datasetElementType: !1,
		dataElementType: 'arc',
		animation: { animateRotate: !0, animateScale: !1 },
		animations: {
			numbers: {
				type: 'number',
				properties: ['circumference', 'endAngle', 'innerRadius', 'outerRadius', 'startAngle', 'x', 'y', 'offset', 'borderWidth', 'spacing']
			}
		},
		cutout: '50%',
		rotation: 0,
		circumference: 360,
		radius: '100%',
		spacing: 0,
		indexAxis: 'r'
	};
	static descriptors = {
		_scriptable: (t) => t !== 'spacing',
		_indexable: (t) => t !== 'spacing' && !t.startsWith('borderDash') && !t.startsWith('hoverBorderDash')
	};
	static overrides = {
		aspectRatio: 1,
		plugins: {
			legend: {
				labels: {
					generateLabels(t) {
						const e = t.data,
							{
								labels: { pointStyle: s, textAlign: n, color: o, useBorderRadius: r, borderRadius: a }
							} = t.legend.options;
						return e.labels.length && e.datasets.length
							? e.labels.map((l, c) => {
									const d = t.getDatasetMeta(0).controller.getStyle(c);
									return {
										text: l,
										fillStyle: d.backgroundColor,
										fontColor: o,
										hidden: !t.getDataVisibility(c),
										lineDash: d.borderDash,
										lineDashOffset: d.borderDashOffset,
										lineJoin: d.borderJoinStyle,
										lineWidth: d.borderWidth,
										strokeStyle: d.borderColor,
										textAlign: n,
										pointStyle: s,
										borderRadius: r && (a || d.borderRadius),
										index: c
									};
								})
							: [];
					}
				},
				onClick(t, e, s) {
					(s.chart.toggleDataVisibility(e.index), s.chart.update());
				}
			}
		}
	};
	constructor(t, e) {
		(super(t, e),
			(this.enableOptionSharing = !0),
			(this.innerRadius = void 0),
			(this.outerRadius = void 0),
			(this.offsetX = void 0),
			(this.offsetY = void 0));
	}
	linkScales() {}
	parse(t, e) {
		const s = this.getDataset().data,
			n = this._cachedMeta;
		if (this._parsing === !1) n._parsed = s;
		else {
			let o = (l) => +s[l];
			if (P(s[t])) {
				const { key: l = 'value' } = this._parsing;
				o = (c) => +kt(s[c], l);
			}
			let r, a;
			for (r = t, a = t + e; r < a; ++r) n._parsed[r] = o(r);
		}
	}
	_getRotation() {
		return at(this.options.rotation - 90);
	}
	_getCircumference() {
		return at(this.options.circumference);
	}
	_getRotationExtents() {
		let t = E,
			e = -E;
		for (let s = 0; s < this.chart.data.datasets.length; ++s)
			if (this.chart.isDatasetVisible(s) && this.chart.getDatasetMeta(s).type === this._type) {
				const n = this.chart.getDatasetMeta(s).controller,
					o = n._getRotation(),
					r = n._getCircumference();
				((t = Math.min(t, o)), (e = Math.max(e, o + r)));
			}
		return { rotation: t, circumference: e - t };
	}
	update(t) {
		const e = this.chart,
			{ chartArea: s } = e,
			n = this._cachedMeta,
			o = n.data,
			r = this.getMaxBorderWidth() + this.getMaxOffset(o) + this.options.spacing,
			a = Math.max((Math.min(s.width, s.height) - r) / 2, 0),
			l = Math.min(Kn(this.options.cutout, a), 1),
			c = this._getRingWeight(this.index),
			{ circumference: h, rotation: d } = this._getRotationExtents(),
			{ ratioX: f, ratioY: u, offsetX: p, offsetY: g } = $r(d, h, l),
			m = (s.width - r) / f,
			b = (s.height - r) / u,
			_ = Math.max(Math.min(m, b) / 2, 0),
			y = Ws(this.options.radius, _),
			v = Math.max(y * l, 0),
			x = (y - v) / this._getVisibleDatasetWeightTotal();
		((this.offsetX = p * y),
			(this.offsetY = g * y),
			(n.total = this.calculateTotal()),
			(this.outerRadius = y - x * this._getRingWeightOffset(this.index)),
			(this.innerRadius = Math.max(this.outerRadius - x * c, 0)),
			this.updateElements(o, 0, o.length, t));
	}
	_circumference(t, e) {
		const s = this.options,
			n = this._cachedMeta,
			o = this._getCircumference();
		return (e && s.animation.animateRotate) || !this.chart.getDataVisibility(t) || n._parsed[t] === null || n.data[t].hidden
			? 0
			: this.calculateCircumference((n._parsed[t] * o) / E);
	}
	updateElements(t, e, s, n) {
		const o = n === 'reset',
			r = this.chart,
			a = r.chartArea,
			c = r.options.animation,
			h = (a.left + a.right) / 2,
			d = (a.top + a.bottom) / 2,
			f = o && c.animateScale,
			u = f ? 0 : this.innerRadius,
			p = f ? 0 : this.outerRadius,
			{ sharedOptions: g, includeOptions: m } = this._getSharedOptions(e, n);
		let b = this._getRotation(),
			_;
		for (_ = 0; _ < e; ++_) b += this._circumference(_, o);
		for (_ = e; _ < e + s; ++_) {
			const y = this._circumference(_, o),
				v = t[_],
				x = { x: h + this.offsetX, y: d + this.offsetY, startAngle: b, endAngle: b + y, circumference: y, outerRadius: p, innerRadius: u };
			(m && (x.options = g || this.resolveDataElementOptions(_, v.active ? 'active' : n)), (b += y), this.updateElement(v, _, x, n));
		}
	}
	calculateTotal() {
		const t = this._cachedMeta,
			e = t.data;
		let s = 0,
			n;
		for (n = 0; n < e.length; n++) {
			const o = t._parsed[n];
			o !== null && !isNaN(o) && this.chart.getDataVisibility(n) && !e[n].hidden && (s += Math.abs(o));
		}
		return s;
	}
	calculateCircumference(t) {
		const e = this._cachedMeta.total;
		return e > 0 && !isNaN(t) ? E * (Math.abs(t) / e) : 0;
	}
	getLabelAndValue(t) {
		const e = this._cachedMeta,
			s = this.chart,
			n = s.data.labels || [],
			o = li(e._parsed[t], s.options.locale);
		return { label: n[t] || '', value: o };
	}
	getMaxBorderWidth(t) {
		let e = 0;
		const s = this.chart;
		let n, o, r, a, l;
		if (!t) {
			for (n = 0, o = s.data.datasets.length; n < o; ++n)
				if (s.isDatasetVisible(n)) {
					((r = s.getDatasetMeta(n)), (t = r.data), (a = r.controller));
					break;
				}
		}
		if (!t) return 0;
		for (n = 0, o = t.length; n < o; ++n)
			((l = a.resolveDataElementOptions(n)), l.borderAlign !== 'inner' && (e = Math.max(e, l.borderWidth || 0, l.hoverBorderWidth || 0)));
		return e;
	}
	getMaxOffset(t) {
		let e = 0;
		for (let s = 0, n = t.length; s < n; ++s) {
			const o = this.resolveDataElementOptions(s);
			e = Math.max(e, o.offset || 0, o.hoverOffset || 0);
		}
		return e;
	}
	_getRingWeightOffset(t) {
		let e = 0;
		for (let s = 0; s < t; ++s) this.chart.isDatasetVisible(s) && (e += this._getRingWeight(s));
		return e;
	}
	_getRingWeight(t) {
		return Math.max(D(this.chart.data.datasets[t].weight, 1), 0);
	}
	_getVisibleDatasetWeightTotal() {
		return this._getRingWeightOffset(this.chart.data.datasets.length) || 1;
	}
}
class sc extends Oe {
	static id = 'line';
	static defaults = { datasetElementType: 'line', dataElementType: 'point', showLine: !0, spanGaps: !1 };
	static overrides = { scales: { _index_: { type: 'category' }, _value_: { type: 'linear' } } };
	initialize() {
		((this.enableOptionSharing = !0), (this.supportsDecimation = !0), super.initialize());
	}
	update(t) {
		const e = this._cachedMeta,
			{ dataset: s, data: n = [], _dataset: o } = e,
			r = this.chart._animationsDisabled;
		let { start: a, count: l } = po(e, n, r);
		((this._drawStart = a),
			(this._drawCount = l),
			mo(e) && ((a = 0), (l = n.length)),
			(s._chart = this.chart),
			(s._datasetIndex = this.index),
			(s._decimated = !!o._decimated),
			(s.points = n));
		const c = this.resolveDatasetElementOptions(t);
		(this.options.showLine || (c.borderWidth = 0),
			(c.segment = this.options.segment),
			this.updateElement(s, void 0, { animated: !r, options: c }, t),
			this.updateElements(n, a, l, t));
	}
	updateElements(t, e, s, n) {
		const o = n === 'reset',
			{ iScale: r, vScale: a, _stacked: l, _dataset: c } = this._cachedMeta,
			{ sharedOptions: h, includeOptions: d } = this._getSharedOptions(e, n),
			f = r.axis,
			u = a.axis,
			{ spanGaps: p, segment: g } = this.options,
			m = Jt(p) ? p : Number.POSITIVE_INFINITY,
			b = this.chart._animationsDisabled || o || n === 'none',
			_ = e + s,
			y = t.length;
		let v = e > 0 && this.getParsed(e - 1);
		for (let x = 0; x < y; ++x) {
			const k = t[x],
				M = b ? k : {};
			if (x < e || x >= _) {
				M.skip = !0;
				continue;
			}
			const S = this.getParsed(x),
				w = O(S[u]),
				A = (M[f] = r.getPixelForValue(S[f], x)),
				L = (M[u] = o || w ? a.getBasePixel() : a.getPixelForValue(l ? this.applyStack(a, S, l) : S[u], x));
			((M.skip = isNaN(A) || isNaN(L) || w),
				(M.stop = x > 0 && Math.abs(S[f] - v[f]) > m),
				g && ((M.parsed = S), (M.raw = c.data[x])),
				d && (M.options = h || this.resolveDataElementOptions(x, k.active ? 'active' : n)),
				b || this.updateElement(k, x, M, n),
				(v = S));
		}
	}
	getMaxOverflow() {
		const t = this._cachedMeta,
			e = t.dataset,
			s = (e.options && e.options.borderWidth) || 0,
			n = t.data || [];
		if (!n.length) return s;
		const o = n[0].size(this.resolveDataElementOptions(0)),
			r = n[n.length - 1].size(this.resolveDataElementOptions(n.length - 1));
		return Math.max(s, o, r) / 2;
	}
	draw() {
		const t = this._cachedMeta;
		(t.dataset.updateControlPoints(this.chart.chartArea, t.iScale.axis), super.draw());
	}
}
class nc extends Yr {
	static id = 'pie';
	static defaults = { cutout: 0, rotation: 0, circumference: 360, radius: '100%' };
}
function _t() {
	throw new Error('This method is not implemented: Check that a complete date adapter is provided.');
}
class bi {
	static override(t) {
		Object.assign(bi.prototype, t);
	}
	options;
	constructor(t) {
		this.options = t || {};
	}
	init() {}
	formats() {
		return _t();
	}
	parse() {
		return _t();
	}
	format() {
		return _t();
	}
	add() {
		return _t();
	}
	diff() {
		return _t();
	}
	startOf() {
		return _t();
	}
	endOf() {
		return _t();
	}
}
var Xr = { _date: bi };
function Ur(i, t, e, s) {
	const { controller: n, data: o, _sorted: r } = i,
		a = n._cachedMeta.iScale,
		l = i.dataset && i.dataset.options ? i.dataset.options.spanGaps : null;
	if (a && t === a.axis && t !== 'r' && r && o.length) {
		const c = a._reversePixels ? co : vt;
		if (s) {
			if (n._sharedOptions) {
				const h = o[0],
					d = typeof h.getRange == 'function' && h.getRange(t);
				if (d) {
					const f = c(o, t, e - d),
						u = c(o, t, e + d);
					return { lo: f.lo, hi: u.hi };
				}
			}
		} else {
			const h = c(o, t, e);
			if (l) {
				const { vScale: d } = n._cachedMeta,
					{ _parsed: f } = i,
					u = f
						.slice(0, h.lo + 1)
						.reverse()
						.findIndex((g) => !O(g[d.axis]));
				h.lo -= Math.max(0, u);
				const p = f.slice(h.hi).findIndex((g) => !O(g[d.axis]));
				h.hi += Math.max(0, p);
			}
			return h;
		}
	}
	return { lo: 0, hi: o.length - 1 };
}
function Ce(i, t, e, s, n) {
	const o = i.getSortedVisibleDatasetMetas(),
		r = e[t];
	for (let a = 0, l = o.length; a < l; ++a) {
		const { index: c, data: h } = o[a],
			{ lo: d, hi: f } = Ur(o[a], t, r, n);
		for (let u = d; u <= f; ++u) {
			const p = h[u];
			p.skip || s(p, c, u);
		}
	}
}
function Kr(i) {
	const t = i.indexOf('x') !== -1,
		e = i.indexOf('y') !== -1;
	return function (s, n) {
		const o = t ? Math.abs(s.x - n.x) : 0,
			r = e ? Math.abs(s.y - n.y) : 0;
		return Math.sqrt(Math.pow(o, 2) + Math.pow(r, 2));
	};
}
function Ne(i, t, e, s, n) {
	const o = [];
	return (
		(!n && !i.isPointInArea(t)) ||
			Ce(
				i,
				e,
				t,
				function (a, l, c) {
					(!n && !ee(a, i.chartArea, 0)) || (a.inRange(t.x, t.y, s) && o.push({ element: a, datasetIndex: l, index: c }));
				},
				!0
			),
		o
	);
}
function qr(i, t, e, s) {
	let n = [];
	function o(r, a, l) {
		const { startAngle: c, endAngle: h } = r.getProps(['startAngle', 'endAngle'], s),
			{ angle: d } = $s(r, { x: t.x, y: t.y });
		Qt(d, c, h) && n.push({ element: r, datasetIndex: a, index: l });
	}
	return (Ce(i, e, t, o), n);
}
function Gr(i, t, e, s, n, o) {
	let r = [];
	const a = Kr(e);
	let l = Number.POSITIVE_INFINITY;
	function c(h, d, f) {
		const u = h.inRange(t.x, t.y, n);
		if (s && !u) return;
		const p = h.getCenterPoint(n);
		if (!(!!o || i.isPointInArea(p)) && !u) return;
		const m = a(t, p);
		m < l ? ((r = [{ element: h, datasetIndex: d, index: f }]), (l = m)) : m === l && r.push({ element: h, datasetIndex: d, index: f });
	}
	return (Ce(i, e, t, c), r);
}
function We(i, t, e, s, n, o) {
	return !o && !i.isPointInArea(t) ? [] : e === 'r' && !s ? qr(i, t, e, n) : Gr(i, t, e, s, n, o);
}
function Qi(i, t, e, s, n) {
	const o = [],
		r = e === 'x' ? 'inXRange' : 'inYRange';
	let a = !1;
	return (
		Ce(i, e, t, (l, c, h) => {
			l[r] && l[r](t[e], n) && (o.push({ element: l, datasetIndex: c, index: h }), (a = a || l.inRange(t.x, t.y, n)));
		}),
		s && !a ? [] : o
	);
}
var Zr = {
	modes: {
		index(i, t, e, s) {
			const n = xt(t, i),
				o = e.axis || 'x',
				r = e.includeInvisible || !1,
				a = e.intersect ? Ne(i, n, o, s, r) : We(i, n, o, !1, s, r),
				l = [];
			return a.length
				? (i.getSortedVisibleDatasetMetas().forEach((c) => {
						const h = a[0].index,
							d = c.data[h];
						d && !d.skip && l.push({ element: d, datasetIndex: c.index, index: h });
					}),
					l)
				: [];
		},
		dataset(i, t, e, s) {
			const n = xt(t, i),
				o = e.axis || 'xy',
				r = e.includeInvisible || !1;
			let a = e.intersect ? Ne(i, n, o, s, r) : We(i, n, o, !1, s, r);
			if (a.length > 0) {
				const l = a[0].datasetIndex,
					c = i.getDatasetMeta(l).data;
				a = [];
				for (let h = 0; h < c.length; ++h) a.push({ element: c[h], datasetIndex: l, index: h });
			}
			return a;
		},
		point(i, t, e, s) {
			const n = xt(t, i),
				o = e.axis || 'xy',
				r = e.includeInvisible || !1;
			return Ne(i, n, o, s, r);
		},
		nearest(i, t, e, s) {
			const n = xt(t, i),
				o = e.axis || 'xy',
				r = e.includeInvisible || !1;
			return We(i, n, o, e.intersect, s, r);
		},
		x(i, t, e, s) {
			const n = xt(t, i);
			return Qi(i, n, 'x', e.intersect, s);
		},
		y(i, t, e, s) {
			const n = xt(t, i);
			return Qi(i, n, 'y', e.intersect, s);
		}
	}
};
const hn = ['left', 'top', 'right', 'bottom'];
function zt(i, t) {
	return i.filter((e) => e.pos === t);
}
function ts(i, t) {
	return i.filter((e) => hn.indexOf(e.pos) === -1 && e.box.axis === t);
}
function Bt(i, t) {
	return i.sort((e, s) => {
		const n = t ? s : e,
			o = t ? e : s;
		return n.weight === o.weight ? n.index - o.index : n.weight - o.weight;
	});
}
function Jr(i) {
	const t = [];
	let e, s, n, o, r, a;
	for (e = 0, s = (i || []).length; e < s; ++e)
		((n = i[e]),
			({
				position: o,
				options: { stack: r, stackWeight: a = 1 }
			} = n),
			t.push({ index: e, box: n, pos: o, horizontal: n.isHorizontal(), weight: n.weight, stack: r && o + r, stackWeight: a }));
	return t;
}
function Qr(i) {
	const t = {};
	for (const e of i) {
		const { stack: s, pos: n, stackWeight: o } = e;
		if (!s || !hn.includes(n)) continue;
		const r = t[s] || (t[s] = { count: 0, placed: 0, weight: 0, size: 0 });
		(r.count++, (r.weight += o));
	}
	return t;
}
function ta(i, t) {
	const e = Qr(i),
		{ vBoxMaxWidth: s, hBoxMaxHeight: n } = t;
	let o, r, a;
	for (o = 0, r = i.length; o < r; ++o) {
		a = i[o];
		const { fullSize: l } = a.box,
			c = e[a.stack],
			h = c && a.stackWeight / c.weight;
		a.horizontal ? ((a.width = h ? h * s : l && t.availableWidth), (a.height = n)) : ((a.width = s), (a.height = h ? h * n : l && t.availableHeight));
	}
	return e;
}
function ea(i) {
	const t = Jr(i),
		e = Bt(
			t.filter((c) => c.box.fullSize),
			!0
		),
		s = Bt(zt(t, 'left'), !0),
		n = Bt(zt(t, 'right')),
		o = Bt(zt(t, 'top'), !0),
		r = Bt(zt(t, 'bottom')),
		a = ts(t, 'x'),
		l = ts(t, 'y');
	return {
		fullSize: e,
		leftAndTop: s.concat(o),
		rightAndBottom: n.concat(l).concat(r).concat(a),
		chartArea: zt(t, 'chartArea'),
		vertical: s.concat(n).concat(l),
		horizontal: o.concat(r).concat(a)
	};
}
function es(i, t, e, s) {
	return Math.max(i[e], t[e]) + Math.max(i[s], t[s]);
}
function dn(i, t) {
	((i.top = Math.max(i.top, t.top)),
		(i.left = Math.max(i.left, t.left)),
		(i.bottom = Math.max(i.bottom, t.bottom)),
		(i.right = Math.max(i.right, t.right)));
}
function ia(i, t, e, s) {
	const { pos: n, box: o } = e,
		r = i.maxPadding;
	if (!P(n)) {
		e.size && (i[n] -= e.size);
		const d = s[e.stack] || { size: 0, count: 1 };
		((d.size = Math.max(d.size, e.horizontal ? o.height : o.width)), (e.size = d.size / d.count), (i[n] += e.size));
	}
	o.getPadding && dn(r, o.getPadding());
	const a = Math.max(0, t.outerWidth - es(r, i, 'left', 'right')),
		l = Math.max(0, t.outerHeight - es(r, i, 'top', 'bottom')),
		c = a !== i.w,
		h = l !== i.h;
	return ((i.w = a), (i.h = l), e.horizontal ? { same: c, other: h } : { same: h, other: c });
}
function sa(i) {
	const t = i.maxPadding;
	function e(s) {
		const n = Math.max(t[s] - i[s], 0);
		return ((i[s] += n), n);
	}
	((i.y += e('top')), (i.x += e('left')), e('right'), e('bottom'));
}
function na(i, t) {
	const e = t.maxPadding;
	function s(n) {
		const o = { left: 0, top: 0, right: 0, bottom: 0 };
		return (
			n.forEach((r) => {
				o[r] = Math.max(t[r], e[r]);
			}),
			o
		);
	}
	return s(i ? ['left', 'right'] : ['top', 'bottom']);
}
function jt(i, t, e, s) {
	const n = [];
	let o, r, a, l, c, h;
	for (o = 0, r = i.length, c = 0; o < r; ++o) {
		((a = i[o]), (l = a.box), l.update(a.width || t.w, a.height || t.h, na(a.horizontal, t)));
		const { same: d, other: f } = ia(t, e, a, s);
		((c |= d && n.length), (h = h || f), l.fullSize || n.push(a));
	}
	return (c && jt(n, t, e, s)) || h;
}
function fe(i, t, e, s, n) {
	((i.top = e), (i.left = t), (i.right = t + s), (i.bottom = e + n), (i.width = s), (i.height = n));
}
function is(i, t, e, s) {
	const n = e.padding;
	let { x: o, y: r } = t;
	for (const a of i) {
		const l = a.box,
			c = s[a.stack] || { placed: 0, weight: 1 },
			h = a.stackWeight / c.weight || 1;
		if (a.horizontal) {
			const d = t.w * h,
				f = c.size || l.height;
			(Zt(c.start) && (r = c.start),
				l.fullSize ? fe(l, n.left, r, e.outerWidth - n.right - n.left, f) : fe(l, t.left + c.placed, r, d, f),
				(c.start = r),
				(c.placed += d),
				(r = l.bottom));
		} else {
			const d = t.h * h,
				f = c.size || l.width;
			(Zt(c.start) && (o = c.start),
				l.fullSize ? fe(l, o, n.top, f, e.outerHeight - n.bottom - n.top) : fe(l, o, t.top + c.placed, f, d),
				(c.start = o),
				(c.placed += d),
				(o = l.right));
		}
	}
	((t.x = o), (t.y = r));
}
var ue = {
	addBox(i, t) {
		(i.boxes || (i.boxes = []),
			(t.fullSize = t.fullSize || !1),
			(t.position = t.position || 'top'),
			(t.weight = t.weight || 0),
			(t._layers =
				t._layers ||
				function () {
					return [
						{
							z: 0,
							draw(e) {
								t.draw(e);
							}
						}
					];
				}),
			i.boxes.push(t));
	},
	removeBox(i, t) {
		const e = i.boxes ? i.boxes.indexOf(t) : -1;
		e !== -1 && i.boxes.splice(e, 1);
	},
	configure(i, t, e) {
		((t.fullSize = e.fullSize), (t.position = e.position), (t.weight = e.weight));
	},
	update(i, t, e, s) {
		if (!i) return;
		const n = ut(i.options.layout.padding),
			o = Math.max(t - n.width, 0),
			r = Math.max(e - n.height, 0),
			a = ea(i.boxes),
			l = a.vertical,
			c = a.horizontal;
		C(i.boxes, (g) => {
			typeof g.beforeLayout == 'function' && g.beforeLayout();
		});
		const h = l.reduce((g, m) => (m.box.options && m.box.options.display === !1 ? g : g + 1), 0) || 1,
			d = Object.freeze({
				outerWidth: t,
				outerHeight: e,
				padding: n,
				availableWidth: o,
				availableHeight: r,
				vBoxMaxWidth: o / 2 / h,
				hBoxMaxHeight: r / 2
			}),
			f = Object.assign({}, n);
		dn(f, ut(s));
		const u = Object.assign({ maxPadding: f, w: o, h: r, x: n.left, y: n.top }, n),
			p = ta(l.concat(c), d);
		(jt(a.fullSize, u, d, p),
			jt(l, u, d, p),
			jt(c, u, d, p) && jt(l, u, d, p),
			sa(u),
			is(a.leftAndTop, u, d, p),
			(u.x += u.w),
			(u.y += u.h),
			is(a.rightAndBottom, u, d, p),
			(i.chartArea = { left: u.left, top: u.top, right: u.left + u.w, bottom: u.top + u.h, height: u.h, width: u.w }),
			C(a.chartArea, (g) => {
				const m = g.box;
				(Object.assign(m, i.chartArea), m.update(u.w, u.h, { left: 0, top: 0, right: 0, bottom: 0 }));
			}));
	}
};
class fn {
	acquireContext(t, e) {}
	releaseContext(t) {
		return !1;
	}
	addEventListener(t, e, s) {}
	removeEventListener(t, e, s) {}
	getDevicePixelRatio() {
		return 1;
	}
	getMaximumSize(t, e, s, n) {
		return ((e = Math.max(0, e || t.width)), (s = s || t.height), { width: e, height: Math.max(0, n ? Math.floor(e / n) : s) });
	}
	isAttached(t) {
		return !0;
	}
	updateConfig(t) {}
}
class oa extends fn {
	acquireContext(t) {
		return (t && t.getContext && t.getContext('2d')) || null;
	}
	updateConfig(t) {
		t.options.animation = !1;
	}
}
const xe = '$chartjs',
	ra = {
		touchstart: 'mousedown',
		touchmove: 'mousemove',
		touchend: 'mouseup',
		pointerenter: 'mouseenter',
		pointerdown: 'mousedown',
		pointermove: 'mousemove',
		pointerup: 'mouseup',
		pointerleave: 'mouseout',
		pointerout: 'mouseout'
	},
	ss = (i) => i === null || i === '';
function aa(i, t) {
	const e = i.style,
		s = i.getAttribute('height'),
		n = i.getAttribute('width');
	if (
		((i[xe] = { initial: { height: s, width: n, style: { display: e.display, height: e.height, width: e.width } } }),
		(e.display = e.display || 'block'),
		(e.boxSizing = e.boxSizing || 'border-box'),
		ss(n))
	) {
		const o = Ni(i, 'width');
		o !== void 0 && (i.width = o);
	}
	if (ss(s))
		if (i.style.height === '') i.height = i.width / (t || 2);
		else {
			const o = Ni(i, 'height');
			o !== void 0 && (i.height = o);
		}
	return i;
}
const un = rr ? { passive: !0 } : !1;
function la(i, t, e) {
	i && i.addEventListener(t, e, un);
}
function ca(i, t, e) {
	i && i.canvas && i.canvas.removeEventListener(t, e, un);
}
function ha(i, t) {
	const e = ra[i.type] || i.type,
		{ x: s, y: n } = xt(i, t);
	return { type: e, chart: t, native: i, x: s !== void 0 ? s : null, y: n !== void 0 ? n : null };
}
function we(i, t) {
	for (const e of i) if (e === t || e.contains(t)) return !0;
}
function da(i, t, e) {
	const s = i.canvas,
		n = new MutationObserver((o) => {
			let r = !1;
			for (const a of o) ((r = r || we(a.addedNodes, s)), (r = r && !we(a.removedNodes, s)));
			r && e();
		});
	return (n.observe(document, { childList: !0, subtree: !0 }), n);
}
function fa(i, t, e) {
	const s = i.canvas,
		n = new MutationObserver((o) => {
			let r = !1;
			for (const a of o) ((r = r || we(a.removedNodes, s)), (r = r && !we(a.addedNodes, s)));
			r && e();
		});
	return (n.observe(document, { childList: !0, subtree: !0 }), n);
}
const ie = new Map();
let ns = 0;
function gn() {
	const i = window.devicePixelRatio;
	i !== ns &&
		((ns = i),
		ie.forEach((t, e) => {
			e.currentDevicePixelRatio !== i && t();
		}));
}
function ua(i, t) {
	(ie.size || window.addEventListener('resize', gn), ie.set(i, t));
}
function ga(i) {
	(ie.delete(i), ie.size || window.removeEventListener('resize', gn));
}
function pa(i, t, e) {
	const s = i.canvas,
		n = s && mi(s);
	if (!n) return;
	const o = Ks((a, l) => {
			const c = n.clientWidth;
			(e(a, l), c < n.clientWidth && e());
		}, window),
		r = new ResizeObserver((a) => {
			const l = a[0],
				c = l.contentRect.width,
				h = l.contentRect.height;
			(c === 0 && h === 0) || o(c, h);
		});
	return (r.observe(n), ua(i, o), r);
}
function je(i, t, e) {
	(e && e.disconnect(), t === 'resize' && ga(i));
}
function ma(i, t, e) {
	const s = i.canvas,
		n = Ks((o) => {
			i.ctx !== null && e(ha(o, i));
		}, i);
	return (la(s, t, n), n);
}
class ba extends fn {
	acquireContext(t, e) {
		const s = t && t.getContext && t.getContext('2d');
		return s && s.canvas === t ? (aa(t, e), s) : null;
	}
	releaseContext(t) {
		const e = t.canvas;
		if (!e[xe]) return !1;
		const s = e[xe].initial;
		['height', 'width'].forEach((o) => {
			const r = s[o];
			O(r) ? e.removeAttribute(o) : e.setAttribute(o, r);
		});
		const n = s.style || {};
		return (
			Object.keys(n).forEach((o) => {
				e.style[o] = n[o];
			}),
			(e.width = e.width),
			delete e[xe],
			!0
		);
	}
	addEventListener(t, e, s) {
		this.removeEventListener(t, e);
		const n = t.$proxies || (t.$proxies = {}),
			r = { attach: da, detach: fa, resize: pa }[e] || ma;
		n[e] = r(t, e, s);
	}
	removeEventListener(t, e) {
		const s = t.$proxies || (t.$proxies = {}),
			n = s[e];
		if (!n) return;
		((({ attach: je, detach: je, resize: je })[e] || ca)(t, e, n), (s[e] = void 0));
	}
	getDevicePixelRatio() {
		return window.devicePixelRatio;
	}
	getMaximumSize(t, e, s, n) {
		return or(t, e, s, n);
	}
	isAttached(t) {
		const e = t && mi(t);
		return !!(e && e.isConnected);
	}
}
function _a(i) {
	return !pi() || (typeof OffscreenCanvas < 'u' && i instanceof OffscreenCanvas) ? oa : ba;
}
class Pt {
	static defaults = {};
	static defaultRoutes = void 0;
	x;
	y;
	active = !1;
	options;
	$animations;
	tooltipPosition(t) {
		const { x: e, y: s } = this.getProps(['x', 'y'], t);
		return { x: e, y: s };
	}
	hasValue() {
		return Jt(this.x) && Jt(this.y);
	}
	getProps(t, e) {
		const s = this.$animations;
		if (!e || !s) return this;
		const n = {};
		return (
			t.forEach((o) => {
				n[o] = s[o] && s[o].active() ? s[o]._to : this[o];
			}),
			n
		);
	}
}
function xa(i, t) {
	const e = i.options.ticks,
		s = ya(i),
		n = Math.min(e.maxTicksLimit || s, s),
		o = e.major.enabled ? Ma(t) : [],
		r = o.length,
		a = o[0],
		l = o[r - 1],
		c = [];
	if (r > n) return (ka(t, c, o, r / n), c);
	const h = va(o, t, n);
	if (r > 0) {
		let d, f;
		const u = r > 1 ? Math.round((l - a) / (r - 1)) : null;
		for (ge(t, c, h, O(u) ? 0 : a - u, a), d = 0, f = r - 1; d < f; d++) ge(t, c, h, o[d], o[d + 1]);
		return (ge(t, c, h, l, O(u) ? t.length : l + u), c);
	}
	return (ge(t, c, h), c);
}
function ya(i) {
	const t = i.options.offset,
		e = i._tickSize(),
		s = i._length / e + (t ? 0 : 1),
		n = i._maxLength / e;
	return Math.floor(Math.min(s, n));
}
function va(i, t, e) {
	const s = Sa(i),
		n = t.length / e;
	if (!s) return Math.max(n, 1);
	const o = io(s);
	for (let r = 0, a = o.length - 1; r < a; r++) {
		const l = o[r];
		if (l > n) return l;
	}
	return Math.max(n, 1);
}
function Ma(i) {
	const t = [];
	let e, s;
	for (e = 0, s = i.length; e < s; e++) i[e].major && t.push(e);
	return t;
}
function ka(i, t, e, s) {
	let n = 0,
		o = e[0],
		r;
	for (s = Math.ceil(s), r = 0; r < i.length; r++) r === o && (t.push(i[r]), n++, (o = e[n * s]));
}
function ge(i, t, e, s, n) {
	const o = D(s, 0),
		r = Math.min(D(n, i.length), i.length);
	let a = 0,
		l,
		c,
		h;
	for (e = Math.ceil(e), n && ((l = n - s), (e = l / Math.floor(l / e))), h = o; h < 0; ) (a++, (h = Math.round(o + a * e)));
	for (c = Math.max(o, 0); c < r; c++) c === h && (t.push(i[c]), a++, (h = Math.round(o + a * e)));
}
function Sa(i) {
	const t = i.length;
	let e, s;
	if (t < 2) return !1;
	for (s = i[0], e = 1; e < t; ++e) if (i[e] - i[e - 1] !== s) return !1;
	return s;
}
const wa = (i) => (i === 'left' ? 'right' : i === 'right' ? 'left' : i),
	os = (i, t, e) => (t === 'top' || t === 'left' ? i[t] + e : i[t] - e),
	rs = (i, t) => Math.min(t || i, i);
function as(i, t) {
	const e = [],
		s = i.length / t,
		n = i.length;
	let o = 0;
	for (; o < n; o += s) e.push(i[Math.floor(o)]);
	return e;
}
function Pa(i, t, e) {
	const s = i.ticks.length,
		n = Math.min(t, s - 1),
		o = i._startPixel,
		r = i._endPixel,
		a = 1e-6;
	let l = i.getPixelForTick(n),
		c;
	if (
		!(
			e &&
			(s === 1 ? (c = Math.max(l - o, r - l)) : t === 0 ? (c = (i.getPixelForTick(1) - l) / 2) : (c = (l - i.getPixelForTick(n - 1)) / 2),
			(l += n < t ? c : -c),
			l < o - a || l > r + a)
		)
	)
		return l;
}
function Da(i, t) {
	C(i, (e) => {
		const s = e.gc,
			n = s.length / 2;
		let o;
		if (n > t) {
			for (o = 0; o < n; ++o) delete e.data[s[o]];
			s.splice(0, n);
		}
	});
}
function Vt(i) {
	return i.drawTicks ? i.tickLength : 0;
}
function ls(i, t) {
	if (!i.display) return 0;
	const e = et(i.font, t),
		s = ut(i.padding);
	return (N(i.text) ? i.text.length : 1) * e.lineHeight + s.height;
}
function Oa(i, t) {
	return wt(i, { scale: t, type: 'scale' });
}
function Ca(i, t, e) {
	return wt(i, { tick: e, index: t, type: 'tick' });
}
function Aa(i, t, e) {
	let s = go(i);
	return (((e && t !== 'right') || (!e && t === 'right')) && (s = wa(s)), s);
}
function Ta(i, t, e, s) {
	const { top: n, left: o, bottom: r, right: a, chart: l } = i,
		{ chartArea: c, scales: h } = l;
	let d = 0,
		f,
		u,
		p;
	const g = r - n,
		m = a - o;
	if (i.isHorizontal()) {
		if (((u = Ci(s, o, a)), P(e))) {
			const b = Object.keys(e)[0],
				_ = e[b];
			p = h[b].getPixelForValue(_) + g - t;
		} else e === 'center' ? (p = (c.bottom + c.top) / 2 + g - t) : (p = os(i, e, t));
		f = a - o;
	} else {
		if (P(e)) {
			const b = Object.keys(e)[0],
				_ = e[b];
			u = h[b].getPixelForValue(_) - m + t;
		} else e === 'center' ? (u = (c.left + c.right) / 2 - m + t) : (u = os(i, e, t));
		((p = Ci(s, r, n)), (d = e === 'left' ? -W : W));
	}
	return { titleX: u, titleY: p, maxWidth: f, rotation: d };
}
class Lt extends Pt {
	constructor(t) {
		(super(),
			(this.id = t.id),
			(this.type = t.type),
			(this.options = void 0),
			(this.ctx = t.ctx),
			(this.chart = t.chart),
			(this.top = void 0),
			(this.bottom = void 0),
			(this.left = void 0),
			(this.right = void 0),
			(this.width = void 0),
			(this.height = void 0),
			(this._margins = { left: 0, right: 0, top: 0, bottom: 0 }),
			(this.maxWidth = void 0),
			(this.maxHeight = void 0),
			(this.paddingTop = void 0),
			(this.paddingBottom = void 0),
			(this.paddingLeft = void 0),
			(this.paddingRight = void 0),
			(this.axis = void 0),
			(this.labelRotation = void 0),
			(this.min = void 0),
			(this.max = void 0),
			(this._range = void 0),
			(this.ticks = []),
			(this._gridLineItems = null),
			(this._labelItems = null),
			(this._labelSizes = null),
			(this._length = 0),
			(this._maxLength = 0),
			(this._longestTextCache = {}),
			(this._startPixel = void 0),
			(this._endPixel = void 0),
			(this._reversePixels = !1),
			(this._userMax = void 0),
			(this._userMin = void 0),
			(this._suggestedMax = void 0),
			(this._suggestedMin = void 0),
			(this._ticksLength = 0),
			(this._borderValue = 0),
			(this._cache = {}),
			(this._dataLimitsCached = !1),
			(this.$context = void 0));
	}
	init(t) {
		((this.options = t.setContext(this.getContext())),
			(this.axis = t.axis),
			(this._userMin = this.parse(t.min)),
			(this._userMax = this.parse(t.max)),
			(this._suggestedMin = this.parse(t.suggestedMin)),
			(this._suggestedMax = this.parse(t.suggestedMax)));
	}
	parse(t, e) {
		return t;
	}
	getUserBounds() {
		let { _userMin: t, _userMax: e, _suggestedMin: s, _suggestedMax: n } = this;
		return (
			(t = J(t, Number.POSITIVE_INFINITY)),
			(e = J(e, Number.NEGATIVE_INFINITY)),
			(s = J(s, Number.POSITIVE_INFINITY)),
			(n = J(n, Number.NEGATIVE_INFINITY)),
			{ min: J(t, s), max: J(e, n), minDefined: $(t), maxDefined: $(e) }
		);
	}
	getMinMax(t) {
		let { min: e, max: s, minDefined: n, maxDefined: o } = this.getUserBounds(),
			r;
		if (n && o) return { min: e, max: s };
		const a = this.getMatchingVisibleMetas();
		for (let l = 0, c = a.length; l < c; ++l)
			((r = a[l].controller.getMinMax(this, t)), n || (e = Math.min(e, r.min)), o || (s = Math.max(s, r.max)));
		return ((e = o && e > s ? s : e), (s = n && e > s ? e : s), { min: J(e, J(s, e)), max: J(s, J(e, s)) });
	}
	getPadding() {
		return { left: this.paddingLeft || 0, top: this.paddingTop || 0, right: this.paddingRight || 0, bottom: this.paddingBottom || 0 };
	}
	getTicks() {
		return this.ticks;
	}
	getLabels() {
		const t = this.chart.data;
		return this.options.labels || (this.isHorizontal() ? t.xLabels : t.yLabels) || t.labels || [];
	}
	getLabelItems(t = this.chart.chartArea) {
		return this._labelItems || (this._labelItems = this._computeLabelItems(t));
	}
	beforeLayout() {
		((this._cache = {}), (this._dataLimitsCached = !1));
	}
	beforeUpdate() {
		B(this.options.beforeUpdate, [this]);
	}
	update(t, e, s) {
		const { beginAtZero: n, grace: o, ticks: r } = this.options,
			a = r.sampleSize;
		(this.beforeUpdate(),
			(this.maxWidth = t),
			(this.maxHeight = e),
			(this._margins = s = Object.assign({ left: 0, right: 0, top: 0, bottom: 0 }, s)),
			(this.ticks = null),
			(this._labelSizes = null),
			(this._gridLineItems = null),
			(this._labelItems = null),
			this.beforeSetDimensions(),
			this.setDimensions(),
			this.afterSetDimensions(),
			(this._maxLength = this.isHorizontal() ? this.width + s.left + s.right : this.height + s.top + s.bottom),
			this._dataLimitsCached ||
				(this.beforeDataLimits(), this.determineDataLimits(), this.afterDataLimits(), (this._range = zo(this, o, n)), (this._dataLimitsCached = !0)),
			this.beforeBuildTicks(),
			(this.ticks = this.buildTicks() || []),
			this.afterBuildTicks());
		const l = a < this.ticks.length;
		(this._convertTicksToLabels(l ? as(this.ticks, a) : this.ticks),
			this.configure(),
			this.beforeCalculateLabelRotation(),
			this.calculateLabelRotation(),
			this.afterCalculateLabelRotation(),
			r.display && (r.autoSkip || r.source === 'auto') && ((this.ticks = xa(this, this.ticks)), (this._labelSizes = null), this.afterAutoSkip()),
			l && this._convertTicksToLabels(this.ticks),
			this.beforeFit(),
			this.fit(),
			this.afterFit(),
			this.afterUpdate());
	}
	configure() {
		let t = this.options.reverse,
			e,
			s;
		(this.isHorizontal() ? ((e = this.left), (s = this.right)) : ((e = this.top), (s = this.bottom), (t = !t)),
			(this._startPixel = e),
			(this._endPixel = s),
			(this._reversePixels = t),
			(this._length = s - e),
			(this._alignToPixels = this.options.alignToPixels));
	}
	afterUpdate() {
		B(this.options.afterUpdate, [this]);
	}
	beforeSetDimensions() {
		B(this.options.beforeSetDimensions, [this]);
	}
	setDimensions() {
		(this.isHorizontal()
			? ((this.width = this.maxWidth), (this.left = 0), (this.right = this.width))
			: ((this.height = this.maxHeight), (this.top = 0), (this.bottom = this.height)),
			(this.paddingLeft = 0),
			(this.paddingTop = 0),
			(this.paddingRight = 0),
			(this.paddingBottom = 0));
	}
	afterSetDimensions() {
		B(this.options.afterSetDimensions, [this]);
	}
	_callHooks(t) {
		(this.chart.notifyPlugins(t, this.getContext()), B(this.options[t], [this]));
	}
	beforeDataLimits() {
		this._callHooks('beforeDataLimits');
	}
	determineDataLimits() {}
	afterDataLimits() {
		this._callHooks('afterDataLimits');
	}
	beforeBuildTicks() {
		this._callHooks('beforeBuildTicks');
	}
	buildTicks() {
		return [];
	}
	afterBuildTicks() {
		this._callHooks('afterBuildTicks');
	}
	beforeTickToLabelConversion() {
		B(this.options.beforeTickToLabelConversion, [this]);
	}
	generateTickLabels(t) {
		const e = this.options.ticks;
		let s, n, o;
		for (s = 0, n = t.length; s < n; s++) ((o = t[s]), (o.label = B(e.callback, [o.value, s, t], this)));
	}
	afterTickToLabelConversion() {
		B(this.options.afterTickToLabelConversion, [this]);
	}
	beforeCalculateLabelRotation() {
		B(this.options.beforeCalculateLabelRotation, [this]);
	}
	calculateLabelRotation() {
		const t = this.options,
			e = t.ticks,
			s = rs(this.ticks.length, t.ticks.maxTicksLimit),
			n = e.minRotation || 0,
			o = e.maxRotation;
		let r = n,
			a,
			l,
			c;
		if (!this._isVisible() || !e.display || n >= o || s <= 1 || !this.isHorizontal()) {
			this.labelRotation = n;
			return;
		}
		const h = this._getLabelSizes(),
			d = h.widest.width,
			f = h.highest.height,
			u = H(this.chart.width - d, 0, this.maxWidth);
		((a = t.offset ? this.maxWidth / s : u / (s - 1)),
			d + 6 > a &&
				((a = u / (s - (t.offset ? 0.5 : 1))),
				(l = this.maxHeight - Vt(t.grid) - e.padding - ls(t.title, this.chart.options.font)),
				(c = Math.sqrt(d * d + f * f)),
				(r = ro(Math.min(Math.asin(H((h.highest.height + 6) / a, -1, 1)), Math.asin(H(l / c, -1, 1)) - Math.asin(H(f / c, -1, 1))))),
				(r = Math.max(n, Math.min(o, r)))),
			(this.labelRotation = r));
	}
	afterCalculateLabelRotation() {
		B(this.options.afterCalculateLabelRotation, [this]);
	}
	afterAutoSkip() {}
	beforeFit() {
		B(this.options.beforeFit, [this]);
	}
	fit() {
		const t = { width: 0, height: 0 },
			{
				chart: e,
				options: { ticks: s, title: n, grid: o }
			} = this,
			r = this._isVisible(),
			a = this.isHorizontal();
		if (r) {
			const l = ls(n, e.options.font);
			if (
				(a ? ((t.width = this.maxWidth), (t.height = Vt(o) + l)) : ((t.height = this.maxHeight), (t.width = Vt(o) + l)),
				s.display && this.ticks.length)
			) {
				const { first: c, last: h, widest: d, highest: f } = this._getLabelSizes(),
					u = s.padding * 2,
					p = at(this.labelRotation),
					g = Math.cos(p),
					m = Math.sin(p);
				if (a) {
					const b = s.mirror ? 0 : m * d.width + g * f.height;
					t.height = Math.min(this.maxHeight, t.height + b + u);
				} else {
					const b = s.mirror ? 0 : g * d.width + m * f.height;
					t.width = Math.min(this.maxWidth, t.width + b + u);
				}
				this._calculatePadding(c, h, m, g);
			}
		}
		(this._handleMargins(),
			a
				? ((this.width = this._length = e.width - this._margins.left - this._margins.right), (this.height = t.height))
				: ((this.width = t.width), (this.height = this._length = e.height - this._margins.top - this._margins.bottom)));
	}
	_calculatePadding(t, e, s, n) {
		const {
				ticks: { align: o, padding: r },
				position: a
			} = this.options,
			l = this.labelRotation !== 0,
			c = a !== 'top' && this.axis === 'x';
		if (this.isHorizontal()) {
			const h = this.getPixelForTick(0) - this.left,
				d = this.right - this.getPixelForTick(this.ticks.length - 1);
			let f = 0,
				u = 0;
			(l
				? c
					? ((f = n * t.width), (u = s * e.height))
					: ((f = s * t.height), (u = n * e.width))
				: o === 'start'
					? (u = e.width)
					: o === 'end'
						? (f = t.width)
						: o !== 'inner' && ((f = t.width / 2), (u = e.width / 2)),
				(this.paddingLeft = Math.max(((f - h + r) * this.width) / (this.width - h), 0)),
				(this.paddingRight = Math.max(((u - d + r) * this.width) / (this.width - d), 0)));
		} else {
			let h = e.height / 2,
				d = t.height / 2;
			(o === 'start' ? ((h = 0), (d = t.height)) : o === 'end' && ((h = e.height), (d = 0)), (this.paddingTop = h + r), (this.paddingBottom = d + r));
		}
	}
	_handleMargins() {
		this._margins &&
			((this._margins.left = Math.max(this.paddingLeft, this._margins.left)),
			(this._margins.top = Math.max(this.paddingTop, this._margins.top)),
			(this._margins.right = Math.max(this.paddingRight, this._margins.right)),
			(this._margins.bottom = Math.max(this.paddingBottom, this._margins.bottom)));
	}
	afterFit() {
		B(this.options.afterFit, [this]);
	}
	isHorizontal() {
		const { axis: t, position: e } = this.options;
		return e === 'top' || e === 'bottom' || t === 'x';
	}
	isFullSize() {
		return this.options.fullSize;
	}
	_convertTicksToLabels(t) {
		(this.beforeTickToLabelConversion(), this.generateTickLabels(t));
		let e, s;
		for (e = 0, s = t.length; e < s; e++) O(t[e].label) && (t.splice(e, 1), s--, e--);
		this.afterTickToLabelConversion();
	}
	_getLabelSizes() {
		let t = this._labelSizes;
		if (!t) {
			const e = this.options.ticks.sampleSize;
			let s = this.ticks;
			(e < s.length && (s = as(s, e)), (this._labelSizes = t = this._computeLabelSizes(s, s.length, this.options.ticks.maxTicksLimit)));
		}
		return t;
	}
	_computeLabelSizes(t, e, s) {
		const { ctx: n, _longestTextCache: o } = this,
			r = [],
			a = [],
			l = Math.floor(e / rs(e, s));
		let c = 0,
			h = 0,
			d,
			f,
			u,
			p,
			g,
			m,
			b,
			_,
			y,
			v,
			x;
		for (d = 0; d < e; d += l) {
			if (
				((p = t[d].label),
				(g = this._resolveTickFontOptions(d)),
				(n.font = m = g.string),
				(b = o[m] = o[m] || { data: {}, gc: [] }),
				(_ = g.lineHeight),
				(y = v = 0),
				!O(p) && !N(p))
			)
				((y = Ii(n, b.data, b.gc, y, p)), (v = _));
			else if (N(p)) for (f = 0, u = p.length; f < u; ++f) ((x = p[f]), !O(x) && !N(x) && ((y = Ii(n, b.data, b.gc, y, x)), (v += _)));
			(r.push(y), a.push(v), (c = Math.max(y, c)), (h = Math.max(v, h)));
		}
		Da(o, e);
		const k = r.indexOf(c),
			M = a.indexOf(h),
			S = (w) => ({ width: r[w] || 0, height: a[w] || 0 });
		return { first: S(0), last: S(e - 1), widest: S(k), highest: S(M), widths: r, heights: a };
	}
	getLabelForValue(t) {
		return t;
	}
	getPixelForValue(t, e) {
		return NaN;
	}
	getValueForPixel(t) {}
	getPixelForTick(t) {
		const e = this.ticks;
		return t < 0 || t > e.length - 1 ? null : this.getPixelForValue(e[t].value);
	}
	getPixelForDecimal(t) {
		this._reversePixels && (t = 1 - t);
		const e = this._startPixel + t * this._length;
		return lo(this._alignToPixels ? bt(this.chart, e, 0) : e);
	}
	getDecimalForPixel(t) {
		const e = (t - this._startPixel) / this._length;
		return this._reversePixels ? 1 - e : e;
	}
	getBasePixel() {
		return this.getPixelForValue(this.getBaseValue());
	}
	getBaseValue() {
		const { min: t, max: e } = this;
		return t < 0 && e < 0 ? e : t > 0 && e > 0 ? t : 0;
	}
	getContext(t) {
		const e = this.ticks || [];
		if (t >= 0 && t < e.length) {
			const s = e[t];
			return s.$context || (s.$context = Ca(this.getContext(), t, s));
		}
		return this.$context || (this.$context = Oa(this.chart.getContext(), this));
	}
	_tickSize() {
		const t = this.options.ticks,
			e = at(this.labelRotation),
			s = Math.abs(Math.cos(e)),
			n = Math.abs(Math.sin(e)),
			o = this._getLabelSizes(),
			r = t.autoSkipPadding || 0,
			a = o ? o.widest.width + r : 0,
			l = o ? o.highest.height + r : 0;
		return this.isHorizontal() ? (l * s > a * n ? a / s : l / n) : l * n < a * s ? l / s : a / n;
	}
	_isVisible() {
		const t = this.options.display;
		return t !== 'auto' ? !!t : this.getMatchingVisibleMetas().length > 0;
	}
	_computeGridLineItems(t) {
		const e = this.axis,
			s = this.chart,
			n = this.options,
			{ grid: o, position: r, border: a } = n,
			l = o.offset,
			c = this.isHorizontal(),
			d = this.ticks.length + (l ? 1 : 0),
			f = Vt(o),
			u = [],
			p = a.setContext(this.getContext()),
			g = p.display ? p.width : 0,
			m = g / 2,
			b = function (I) {
				return bt(s, I, g);
			};
		let _, y, v, x, k, M, S, w, A, L, F, U;
		if (r === 'top') ((_ = b(this.bottom)), (M = this.bottom - f), (w = _ - m), (L = b(t.top) + m), (U = t.bottom));
		else if (r === 'bottom') ((_ = b(this.top)), (L = t.top), (U = b(t.bottom) - m), (M = _ + m), (w = this.top + f));
		else if (r === 'left') ((_ = b(this.right)), (k = this.right - f), (S = _ - m), (A = b(t.left) + m), (F = t.right));
		else if (r === 'right') ((_ = b(this.left)), (A = t.left), (F = b(t.right) - m), (k = _ + m), (S = this.left + f));
		else if (e === 'x') {
			if (r === 'center') _ = b((t.top + t.bottom) / 2 + 0.5);
			else if (P(r)) {
				const I = Object.keys(r)[0],
					z = r[I];
				_ = b(this.chart.scales[I].getPixelForValue(z));
			}
			((L = t.top), (U = t.bottom), (M = _ + m), (w = M + f));
		} else if (e === 'y') {
			if (r === 'center') _ = b((t.left + t.right) / 2);
			else if (P(r)) {
				const I = Object.keys(r)[0],
					z = r[I];
				_ = b(this.chart.scales[I].getPixelForValue(z));
			}
			((k = _ - m), (S = k - f), (A = t.left), (F = t.right));
		}
		const G = D(n.ticks.maxTicksLimit, d),
			T = Math.max(1, Math.ceil(d / G));
		for (y = 0; y < d; y += T) {
			const I = this.getContext(y),
				z = o.setContext(I),
				Z = a.setContext(I),
				j = z.lineWidth,
				Dt = z.color,
				ne = Z.dash || [],
				Ot = Z.dashOffset,
				It = z.tickWidth,
				gt = z.tickColor,
				Ft = z.tickBorderDash || [],
				pt = z.tickBorderDashOffset;
			((v = Pa(this, y, l)),
				v !== void 0 &&
					((x = bt(s, v, j)),
					c ? (k = S = A = F = x) : (M = w = L = U = x),
					u.push({
						tx1: k,
						ty1: M,
						tx2: S,
						ty2: w,
						x1: A,
						y1: L,
						x2: F,
						y2: U,
						width: j,
						color: Dt,
						borderDash: ne,
						borderDashOffset: Ot,
						tickWidth: It,
						tickColor: gt,
						tickBorderDash: Ft,
						tickBorderDashOffset: pt
					})));
		}
		return ((this._ticksLength = d), (this._borderValue = _), u);
	}
	_computeLabelItems(t) {
		const e = this.axis,
			s = this.options,
			{ position: n, ticks: o } = s,
			r = this.isHorizontal(),
			a = this.ticks,
			{ align: l, crossAlign: c, padding: h, mirror: d } = o,
			f = Vt(s.grid),
			u = f + h,
			p = d ? -h : u,
			g = -at(this.labelRotation),
			m = [];
		let b,
			_,
			y,
			v,
			x,
			k,
			M,
			S,
			w,
			A,
			L,
			F,
			U = 'middle';
		if (n === 'top') ((k = this.bottom - p), (M = this._getXAxisLabelAlignment()));
		else if (n === 'bottom') ((k = this.top + p), (M = this._getXAxisLabelAlignment()));
		else if (n === 'left') {
			const T = this._getYAxisLabelAlignment(f);
			((M = T.textAlign), (x = T.x));
		} else if (n === 'right') {
			const T = this._getYAxisLabelAlignment(f);
			((M = T.textAlign), (x = T.x));
		} else if (e === 'x') {
			if (n === 'center') k = (t.top + t.bottom) / 2 + u;
			else if (P(n)) {
				const T = Object.keys(n)[0],
					I = n[T];
				k = this.chart.scales[T].getPixelForValue(I) + u;
			}
			M = this._getXAxisLabelAlignment();
		} else if (e === 'y') {
			if (n === 'center') x = (t.left + t.right) / 2 - u;
			else if (P(n)) {
				const T = Object.keys(n)[0],
					I = n[T];
				x = this.chart.scales[T].getPixelForValue(I);
			}
			M = this._getYAxisLabelAlignment(f).textAlign;
		}
		e === 'y' && (l === 'start' ? (U = 'top') : l === 'end' && (U = 'bottom'));
		const G = this._getLabelSizes();
		for (b = 0, _ = a.length; b < _; ++b) {
			((y = a[b]), (v = y.label));
			const T = o.setContext(this.getContext(b));
			((S = this.getPixelForTick(b) + o.labelOffset), (w = this._resolveTickFontOptions(b)), (A = w.lineHeight), (L = N(v) ? v.length : 1));
			const I = L / 2,
				z = T.color,
				Z = T.textStrokeColor,
				j = T.textStrokeWidth;
			let Dt = M;
			r
				? ((x = S),
					M === 'inner' &&
						(b === _ - 1
							? (Dt = this.options.reverse ? 'left' : 'right')
							: b === 0
								? (Dt = this.options.reverse ? 'right' : 'left')
								: (Dt = 'center')),
					n === 'top'
						? c === 'near' || g !== 0
							? (F = -L * A + A / 2)
							: c === 'center'
								? (F = -G.highest.height / 2 - I * A + A)
								: (F = -G.highest.height + A / 2)
						: c === 'near' || g !== 0
							? (F = A / 2)
							: c === 'center'
								? (F = G.highest.height / 2 - I * A)
								: (F = G.highest.height - L * A),
					d && (F *= -1),
					g !== 0 && !T.showLabelBackdrop && (x += (A / 2) * Math.sin(g)))
				: ((k = S), (F = ((1 - L) * A) / 2));
			let ne;
			if (T.showLabelBackdrop) {
				const Ot = ut(T.backdropPadding),
					It = G.heights[b],
					gt = G.widths[b];
				let Ft = F - Ot.top,
					pt = 0 - Ot.left;
				switch (U) {
					case 'middle':
						Ft -= It / 2;
						break;
					case 'bottom':
						Ft -= It;
						break;
				}
				switch (M) {
					case 'center':
						pt -= gt / 2;
						break;
					case 'right':
						pt -= gt;
						break;
					case 'inner':
						b === _ - 1 ? (pt -= gt) : b > 0 && (pt -= gt / 2);
						break;
				}
				ne = { left: pt, top: Ft, width: gt + Ot.width, height: It + Ot.height, color: T.backdropColor };
			}
			m.push({
				label: v,
				font: w,
				textOffset: F,
				options: { rotation: g, color: z, strokeColor: Z, strokeWidth: j, textAlign: Dt, textBaseline: U, translation: [x, k], backdrop: ne }
			});
		}
		return m;
	}
	_getXAxisLabelAlignment() {
		const { position: t, ticks: e } = this.options;
		if (-at(this.labelRotation)) return t === 'top' ? 'left' : 'right';
		let n = 'center';
		return (e.align === 'start' ? (n = 'left') : e.align === 'end' ? (n = 'right') : e.align === 'inner' && (n = 'inner'), n);
	}
	_getYAxisLabelAlignment(t) {
		const {
				position: e,
				ticks: { crossAlign: s, mirror: n, padding: o }
			} = this.options,
			r = this._getLabelSizes(),
			a = t + o,
			l = r.widest.width;
		let c, h;
		return (
			e === 'left'
				? n
					? ((h = this.right + o), s === 'near' ? (c = 'left') : s === 'center' ? ((c = 'center'), (h += l / 2)) : ((c = 'right'), (h += l)))
					: ((h = this.right - a), s === 'near' ? (c = 'right') : s === 'center' ? ((c = 'center'), (h -= l / 2)) : ((c = 'left'), (h = this.left)))
				: e === 'right'
					? n
						? ((h = this.left + o), s === 'near' ? (c = 'right') : s === 'center' ? ((c = 'center'), (h -= l / 2)) : ((c = 'left'), (h -= l)))
						: ((h = this.left + a), s === 'near' ? (c = 'left') : s === 'center' ? ((c = 'center'), (h += l / 2)) : ((c = 'right'), (h = this.right)))
					: (c = 'right'),
			{ textAlign: c, x: h }
		);
	}
	_computeLabelArea() {
		if (this.options.ticks.mirror) return;
		const t = this.chart,
			e = this.options.position;
		if (e === 'left' || e === 'right') return { top: 0, left: this.left, bottom: t.height, right: this.right };
		if (e === 'top' || e === 'bottom') return { top: this.top, left: 0, bottom: this.bottom, right: t.width };
	}
	drawBackground() {
		const {
			ctx: t,
			options: { backgroundColor: e },
			left: s,
			top: n,
			width: o,
			height: r
		} = this;
		e && (t.save(), (t.fillStyle = e), t.fillRect(s, n, o, r), t.restore());
	}
	getLineWidthForValue(t) {
		const e = this.options.grid;
		if (!this._isVisible() || !e.display) return 0;
		const n = this.ticks.findIndex((o) => o.value === t);
		return n >= 0 ? e.setContext(this.getContext(n)).lineWidth : 0;
	}
	drawGrid(t) {
		const e = this.options.grid,
			s = this.ctx,
			n = this._gridLineItems || (this._gridLineItems = this._computeGridLineItems(t));
		let o, r;
		const a = (l, c, h) => {
			!h.width ||
				!h.color ||
				(s.save(),
				(s.lineWidth = h.width),
				(s.strokeStyle = h.color),
				s.setLineDash(h.borderDash || []),
				(s.lineDashOffset = h.borderDashOffset),
				s.beginPath(),
				s.moveTo(l.x, l.y),
				s.lineTo(c.x, c.y),
				s.stroke(),
				s.restore());
		};
		if (e.display)
			for (o = 0, r = n.length; o < r; ++o) {
				const l = n[o];
				(e.drawOnChartArea && a({ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }, l),
					e.drawTicks &&
						a(
							{ x: l.tx1, y: l.ty1 },
							{ x: l.tx2, y: l.ty2 },
							{ color: l.tickColor, width: l.tickWidth, borderDash: l.tickBorderDash, borderDashOffset: l.tickBorderDashOffset }
						));
			}
	}
	drawBorder() {
		const {
				chart: t,
				ctx: e,
				options: { border: s, grid: n }
			} = this,
			o = s.setContext(this.getContext()),
			r = s.display ? o.width : 0;
		if (!r) return;
		const a = n.setContext(this.getContext(0)).lineWidth,
			l = this._borderValue;
		let c, h, d, f;
		(this.isHorizontal()
			? ((c = bt(t, this.left, r) - r / 2), (h = bt(t, this.right, a) + a / 2), (d = f = l))
			: ((d = bt(t, this.top, r) - r / 2), (f = bt(t, this.bottom, a) + a / 2), (c = h = l)),
			e.save(),
			(e.lineWidth = o.width),
			(e.strokeStyle = o.color),
			e.beginPath(),
			e.moveTo(c, d),
			e.lineTo(h, f),
			e.stroke(),
			e.restore());
	}
	drawLabels(t) {
		if (!this.options.ticks.display) return;
		const s = this.ctx,
			n = this._computeLabelArea();
		n && ci(s, n);
		const o = this.getLabelItems(t);
		for (const r of o) {
			const a = r.options,
				l = r.font,
				c = r.label,
				h = r.textOffset;
			Ei(s, c, 0, h, l, a);
		}
		n && hi(s);
	}
	drawTitle() {
		const {
			ctx: t,
			options: { position: e, title: s, reverse: n }
		} = this;
		if (!s.display) return;
		const o = et(s.font),
			r = ut(s.padding),
			a = s.align;
		let l = o.lineHeight / 2;
		e === 'bottom' || e === 'center' || P(e) ? ((l += r.bottom), N(s.text) && (l += o.lineHeight * (s.text.length - 1))) : (l += r.top);
		const { titleX: c, titleY: h, maxWidth: d, rotation: f } = Ta(this, l, e, a);
		Ei(t, s.text, 0, 0, o, { color: s.color, maxWidth: d, rotation: f, textAlign: Aa(a, e, n), textBaseline: 'middle', translation: [c, h] });
	}
	draw(t) {
		this._isVisible() && (this.drawBackground(), this.drawGrid(t), this.drawBorder(), this.drawTitle(), this.drawLabels(t));
	}
	_layers() {
		const t = this.options,
			e = (t.ticks && t.ticks.z) || 0,
			s = D(t.grid && t.grid.z, -1),
			n = D(t.border && t.border.z, 0);
		return !this._isVisible() || this.draw !== Lt.prototype.draw
			? [
					{
						z: e,
						draw: (o) => {
							this.draw(o);
						}
					}
				]
			: [
					{
						z: s,
						draw: (o) => {
							(this.drawBackground(), this.drawGrid(o), this.drawTitle());
						}
					},
					{
						z: n,
						draw: () => {
							this.drawBorder();
						}
					},
					{
						z: e,
						draw: (o) => {
							this.drawLabels(o);
						}
					}
				];
	}
	getMatchingVisibleMetas(t) {
		const e = this.chart.getSortedVisibleDatasetMetas(),
			s = this.axis + 'AxisID',
			n = [];
		let o, r;
		for (o = 0, r = e.length; o < r; ++o) {
			const a = e[o];
			a[s] === this.id && (!t || a.type === t) && n.push(a);
		}
		return n;
	}
	_resolveTickFontOptions(t) {
		const e = this.options.ticks.setContext(this.getContext(t));
		return et(e.font);
	}
	_maxDigits() {
		const t = this._resolveTickFontOptions(0).lineHeight;
		return (this.isHorizontal() ? this.width : this.height) / t;
	}
}
class pe {
	constructor(t, e, s) {
		((this.type = t), (this.scope = e), (this.override = s), (this.items = Object.create(null)));
	}
	isForType(t) {
		return Object.prototype.isPrototypeOf.call(this.type.prototype, t.prototype);
	}
	register(t) {
		const e = Object.getPrototypeOf(t);
		let s;
		Ia(e) && (s = this.register(e));
		const n = this.items,
			o = t.id,
			r = this.scope + '.' + o;
		if (!o) throw new Error('class does not have id: ' + t);
		return (o in n || ((n[o] = t), Ra(t, r, s), this.override && V.override(t.id, t.overrides)), r);
	}
	get(t) {
		return this.items[t];
	}
	unregister(t) {
		const e = this.items,
			s = t.id,
			n = this.scope;
		(s in e && delete e[s], n && s in V[n] && (delete V[n][s], this.override && delete St[s]));
	}
}
function Ra(i, t, e) {
	const s = Gt(Object.create(null), [e ? V.get(e) : {}, V.get(t), i.defaults]);
	(V.set(t, s), i.defaultRoutes && La(t, i.defaultRoutes), i.descriptors && V.describe(t, i.descriptors));
}
function La(i, t) {
	Object.keys(t).forEach((e) => {
		const s = e.split('.'),
			n = s.pop(),
			o = [i].concat(s).join('.'),
			r = t[e].split('.'),
			a = r.pop(),
			l = r.join('.');
		V.route(o, n, l, a);
	});
}
function Ia(i) {
	return 'id' in i && 'defaults' in i;
}
class Fa {
	constructor() {
		((this.controllers = new pe(Oe, 'datasets', !0)),
			(this.elements = new pe(Pt, 'elements')),
			(this.plugins = new pe(Object, 'plugins')),
			(this.scales = new pe(Lt, 'scales')),
			(this._typedRegistries = [this.controllers, this.scales, this.elements]));
	}
	add(...t) {
		this._each('register', t);
	}
	remove(...t) {
		this._each('unregister', t);
	}
	addControllers(...t) {
		this._each('register', t, this.controllers);
	}
	addElements(...t) {
		this._each('register', t, this.elements);
	}
	addPlugins(...t) {
		this._each('register', t, this.plugins);
	}
	addScales(...t) {
		this._each('register', t, this.scales);
	}
	getController(t) {
		return this._get(t, this.controllers, 'controller');
	}
	getElement(t) {
		return this._get(t, this.elements, 'element');
	}
	getPlugin(t) {
		return this._get(t, this.plugins, 'plugin');
	}
	getScale(t) {
		return this._get(t, this.scales, 'scale');
	}
	removeControllers(...t) {
		this._each('unregister', t, this.controllers);
	}
	removeElements(...t) {
		this._each('unregister', t, this.elements);
	}
	removePlugins(...t) {
		this._each('unregister', t, this.plugins);
	}
	removeScales(...t) {
		this._each('unregister', t, this.scales);
	}
	_each(t, e, s) {
		[...e].forEach((n) => {
			const o = s || this._getRegistryForType(n);
			s || o.isForType(n) || (o === this.plugins && n.id)
				? this._exec(t, o, n)
				: C(n, (r) => {
						const a = s || this._getRegistryForType(r);
						this._exec(t, a, r);
					});
		});
	}
	_exec(t, e, s) {
		const n = oi(t);
		(B(s['before' + n], [], s), e[t](s), B(s['after' + n], [], s));
	}
	_getRegistryForType(t) {
		for (let e = 0; e < this._typedRegistries.length; e++) {
			const s = this._typedRegistries[e];
			if (s.isForType(t)) return s;
		}
		return this.plugins;
	}
	_get(t, e, s) {
		const n = e.get(t);
		if (n === void 0) throw new Error('"' + t + '" is not a registered ' + s + '.');
		return n;
	}
}
var tt = new Fa();
class Ea {
	constructor() {
		this._init = void 0;
	}
	notify(t, e, s, n) {
		if ((e === 'beforeInit' && ((this._init = this._createDescriptors(t, !0)), this._notify(this._init, t, 'install')), this._init === void 0))
			return;
		const o = n ? this._descriptors(t).filter(n) : this._descriptors(t),
			r = this._notify(o, t, e, s);
		return (e === 'afterDestroy' && (this._notify(o, t, 'stop'), this._notify(this._init, t, 'uninstall'), (this._init = void 0)), r);
	}
	_notify(t, e, s, n) {
		n = n || {};
		for (const o of t) {
			const r = o.plugin,
				a = r[s],
				l = [e, n, o.options];
			if (B(a, l, r) === !1 && n.cancelable) return !1;
		}
		return !0;
	}
	invalidate() {
		O(this._cache) || ((this._oldCache = this._cache), (this._cache = void 0));
	}
	_descriptors(t) {
		if (this._cache) return this._cache;
		const e = (this._cache = this._createDescriptors(t));
		return (this._notifyStateChanges(t), e);
	}
	_createDescriptors(t, e) {
		const s = t && t.config,
			n = D(s.options && s.options.plugins, {}),
			o = za(s);
		return n === !1 && !e ? [] : Va(t, o, n, e);
	}
	_notifyStateChanges(t) {
		const e = this._oldCache || [],
			s = this._cache,
			n = (o, r) => o.filter((a) => !r.some((l) => a.plugin.id === l.plugin.id));
		(this._notify(n(e, s), t, 'stop'), this._notify(n(s, e), t, 'start'));
	}
}
function za(i) {
	const t = {},
		e = [],
		s = Object.keys(tt.plugins.items);
	for (let o = 0; o < s.length; o++) e.push(tt.getPlugin(s[o]));
	const n = i.plugins || [];
	for (let o = 0; o < n.length; o++) {
		const r = n[o];
		e.indexOf(r) === -1 && (e.push(r), (t[r.id] = !0));
	}
	return { plugins: e, localIds: t };
}
function Ba(i, t) {
	return !t && i === !1 ? null : i === !0 ? {} : i;
}
function Va(i, { plugins: t, localIds: e }, s, n) {
	const o = [],
		r = i.getContext();
	for (const a of t) {
		const l = a.id,
			c = Ba(s[l], n);
		c !== null && o.push({ plugin: a, options: Na(i.config, { plugin: a, local: e[l] }, c, r) });
	}
	return o;
}
function Na(i, { plugin: t, local: e }, s, n) {
	const o = i.pluginScopeKeys(t),
		r = i.getOptionScopes(s, o);
	return (e && t.defaults && r.push(t.defaults), i.createResolver(r, n, [''], { scriptable: !1, indexable: !1, allKeys: !0 }));
}
function Je(i, t) {
	const e = V.datasets[i] || {};
	return ((t.datasets || {})[i] || {}).indexAxis || t.indexAxis || e.indexAxis || 'x';
}
function Wa(i, t) {
	let e = i;
	return (i === '_index_' ? (e = t) : i === '_value_' && (e = t === 'x' ? 'y' : 'x'), e);
}
function ja(i, t) {
	return i === t ? '_index_' : '_value_';
}
function cs(i) {
	if (i === 'x' || i === 'y' || i === 'r') return i;
}
function Ha(i) {
	if (i === 'top' || i === 'bottom') return 'x';
	if (i === 'left' || i === 'right') return 'y';
}
function Qe(i, ...t) {
	if (cs(i)) return i;
	for (const e of t) {
		const s = e.axis || Ha(e.position) || (i.length > 1 && cs(i[0].toLowerCase()));
		if (s) return s;
	}
	throw new Error(`Cannot determine type of '${i}' axis. Please provide 'axis' or 'position' option.`);
}
function hs(i, t, e) {
	if (e[t + 'AxisID'] === i) return { axis: t };
}
function $a(i, t) {
	if (t.data && t.data.datasets) {
		const e = t.data.datasets.filter((s) => s.xAxisID === i || s.yAxisID === i);
		if (e.length) return hs(i, 'x', e[0]) || hs(i, 'y', e[0]);
	}
	return {};
}
function Ya(i, t) {
	const e = St[i.type] || { scales: {} },
		s = t.scales || {},
		n = Je(i.type, t),
		o = Object.create(null);
	return (
		Object.keys(s).forEach((r) => {
			const a = s[r];
			if (!P(a)) return console.error(`Invalid scale configuration for scale: ${r}`);
			if (a._proxy) return console.warn(`Ignoring resolver passed as options for scale: ${r}`);
			const l = Qe(r, a, $a(r, i), V.scales[a.type]),
				c = ja(l, n),
				h = e.scales || {};
			o[r] = $t(Object.create(null), [{ axis: l }, a, h[l], h[c]]);
		}),
		i.data.datasets.forEach((r) => {
			const a = r.type || i.type,
				l = r.indexAxis || Je(a, t),
				h = (St[a] || {}).scales || {};
			Object.keys(h).forEach((d) => {
				const f = Wa(d, l),
					u = r[f + 'AxisID'] || f;
				((o[u] = o[u] || Object.create(null)), $t(o[u], [{ axis: f }, s[u], h[d]]));
			});
		}),
		Object.keys(o).forEach((r) => {
			const a = o[r];
			$t(a, [V.scales[a.type], V.scale]);
		}),
		o
	);
}
function pn(i) {
	const t = i.options || (i.options = {});
	((t.plugins = D(t.plugins, {})), (t.scales = Ya(i, t)));
}
function mn(i) {
	return ((i = i || {}), (i.datasets = i.datasets || []), (i.labels = i.labels || []), i);
}
function Xa(i) {
	return ((i = i || {}), (i.data = mn(i.data)), pn(i), i);
}
const ds = new Map(),
	bn = new Set();
function me(i, t) {
	let e = ds.get(i);
	return (e || ((e = t()), ds.set(i, e), bn.add(e)), e);
}
const Nt = (i, t, e) => {
	const s = kt(t, e);
	s !== void 0 && i.add(s);
};
class Ua {
	constructor(t) {
		((this._config = Xa(t)), (this._scopeCache = new Map()), (this._resolverCache = new Map()));
	}
	get platform() {
		return this._config.platform;
	}
	get type() {
		return this._config.type;
	}
	set type(t) {
		this._config.type = t;
	}
	get data() {
		return this._config.data;
	}
	set data(t) {
		this._config.data = mn(t);
	}
	get options() {
		return this._config.options;
	}
	set options(t) {
		this._config.options = t;
	}
	get plugins() {
		return this._config.plugins;
	}
	update() {
		const t = this._config;
		(this.clearCache(), pn(t));
	}
	clearCache() {
		(this._scopeCache.clear(), this._resolverCache.clear());
	}
	datasetScopeKeys(t) {
		return me(t, () => [[`datasets.${t}`, '']]);
	}
	datasetAnimationScopeKeys(t, e) {
		return me(`${t}.transition.${e}`, () => [
			[`datasets.${t}.transitions.${e}`, `transitions.${e}`],
			[`datasets.${t}`, '']
		]);
	}
	datasetElementScopeKeys(t, e) {
		return me(`${t}-${e}`, () => [[`datasets.${t}.elements.${e}`, `datasets.${t}`, `elements.${e}`, '']]);
	}
	pluginScopeKeys(t) {
		const e = t.id,
			s = this.type;
		return me(`${s}-plugin-${e}`, () => [[`plugins.${e}`, ...(t.additionalOptionScopes || [])]]);
	}
	_cachedScopes(t, e) {
		const s = this._scopeCache;
		let n = s.get(t);
		return ((!n || e) && ((n = new Map()), s.set(t, n)), n);
	}
	getOptionScopes(t, e, s) {
		const { options: n, type: o } = this,
			r = this._cachedScopes(t, s),
			a = r.get(e);
		if (a) return a;
		const l = new Set();
		e.forEach((h) => {
			(t && (l.add(t), h.forEach((d) => Nt(l, t, d))),
				h.forEach((d) => Nt(l, n, d)),
				h.forEach((d) => Nt(l, St[o] || {}, d)),
				h.forEach((d) => Nt(l, V, d)),
				h.forEach((d) => Nt(l, qe, d)));
		});
		const c = Array.from(l);
		return (c.length === 0 && c.push(Object.create(null)), bn.has(e) && r.set(e, c), c);
	}
	chartOptionScopes() {
		const { options: t, type: e } = this;
		return [t, St[e] || {}, V.datasets[e] || {}, { type: e }, V, qe];
	}
	resolveNamedOptions(t, e, s, n = ['']) {
		const o = { $shared: !0 },
			{ resolver: r, subPrefixes: a } = fs(this._resolverCache, t, n);
		let l = r;
		if (qa(r, e)) {
			((o.$shared = !1), (s = ft(s) ? s() : s));
			const c = this.createResolver(t, s, a);
			l = Tt(r, s, c);
		}
		for (const c of e) o[c] = l[c];
		return o;
	}
	createResolver(t, e, s = [''], n) {
		const { resolver: o } = fs(this._resolverCache, t, s);
		return P(e) ? Tt(o, e, void 0, n) : o;
	}
}
function fs(i, t, e) {
	let s = i.get(t);
	s || ((s = new Map()), i.set(t, s));
	const n = e.join();
	let o = s.get(n);
	return (o || ((o = { resolver: fi(t, e), subPrefixes: e.filter((a) => !a.toLowerCase().includes('hover')) }), s.set(n, o)), o);
}
const Ka = (i) => P(i) && Object.getOwnPropertyNames(i).some((t) => ft(i[t]));
function qa(i, t) {
	const { isScriptable: e, isIndexable: s } = Zs(i);
	for (const n of t) {
		const o = e(n),
			r = s(n),
			a = (r || o) && i[n];
		if ((o && (ft(a) || Ka(a))) || (r && N(a))) return !0;
	}
	return !1;
}
var Ga = '4.5.1';
const Za = ['top', 'bottom', 'left', 'right', 'chartArea'];
function us(i, t) {
	return i === 'top' || i === 'bottom' || (Za.indexOf(i) === -1 && t === 'x');
}
function gs(i, t) {
	return function (e, s) {
		return e[i] === s[i] ? e[t] - s[t] : e[i] - s[i];
	};
}
function ps(i) {
	const t = i.chart,
		e = t.options.animation;
	(t.notifyPlugins('afterRender'), B(e && e.onComplete, [i], t));
}
function Ja(i) {
	const t = i.chart,
		e = t.options.animation;
	B(e && e.onProgress, [i], t);
}
function _n(i) {
	return (pi() && typeof i == 'string' ? (i = document.getElementById(i)) : i && i.length && (i = i[0]), i && i.canvas && (i = i.canvas), i);
}
const ye = {},
	ms = (i) => {
		const t = _n(i);
		return Object.values(ye)
			.filter((e) => e.canvas === t)
			.pop();
	};
function Qa(i, t, e) {
	const s = Object.keys(i);
	for (const n of s) {
		const o = +n;
		if (o >= t) {
			const r = i[n];
			(delete i[n], (e > 0 || o > t) && (i[o + e] = r));
		}
	}
}
function tl(i, t, e, s) {
	return !e || i.type === 'mouseout' ? null : s ? t : i;
}
class el {
	static defaults = V;
	static instances = ye;
	static overrides = St;
	static registry = tt;
	static version = Ga;
	static getChart = ms;
	static register(...t) {
		(tt.add(...t), bs());
	}
	static unregister(...t) {
		(tt.remove(...t), bs());
	}
	constructor(t, e) {
		const s = (this.config = new Ua(e)),
			n = _n(t),
			o = ms(n);
		if (o)
			throw new Error(
				"Canvas is already in use. Chart with ID '" + o.id + "' must be destroyed before the canvas with ID '" + o.canvas.id + "' can be reused."
			);
		const r = s.createResolver(s.chartOptionScopes(), this.getContext());
		((this.platform = new (s.platform || _a(n))()), this.platform.updateConfig(s));
		const a = this.platform.acquireContext(n, r.aspectRatio),
			l = a && a.canvas,
			c = l && l.height,
			h = l && l.width;
		if (
			((this.id = Un()),
			(this.ctx = a),
			(this.canvas = l),
			(this.width = h),
			(this.height = c),
			(this._options = r),
			(this._aspectRatio = this.aspectRatio),
			(this._layers = []),
			(this._metasets = []),
			(this._stacks = void 0),
			(this.boxes = []),
			(this.currentDevicePixelRatio = void 0),
			(this.chartArea = void 0),
			(this._active = []),
			(this._lastEvent = void 0),
			(this._listeners = {}),
			(this._responsiveListeners = void 0),
			(this._sortedMetasets = []),
			(this.scales = {}),
			(this._plugins = new Ea()),
			(this.$proxies = {}),
			(this._hiddenIndices = {}),
			(this.attached = !1),
			(this._animationsDisabled = void 0),
			(this.$context = void 0),
			(this._doResize = uo((d) => this.update(d), r.resizeDelay || 0)),
			(this._dataChanges = []),
			(ye[this.id] = this),
			!a || !l)
		) {
			console.error("Failed to create chart: can't acquire context from the given item");
			return;
		}
		(nt.listen(this, 'complete', ps), nt.listen(this, 'progress', Ja), this._initialize(), this.attached && this.update());
	}
	get aspectRatio() {
		const {
			options: { aspectRatio: t, maintainAspectRatio: e },
			width: s,
			height: n,
			_aspectRatio: o
		} = this;
		return O(t) ? (e && o ? o : n ? s / n : null) : t;
	}
	get data() {
		return this.config.data;
	}
	set data(t) {
		this.config.data = t;
	}
	get options() {
		return this._options;
	}
	set options(t) {
		this.config.options = t;
	}
	get registry() {
		return tt;
	}
	_initialize() {
		return (
			this.notifyPlugins('beforeInit'),
			this.options.responsive ? this.resize() : Vi(this, this.options.devicePixelRatio),
			this.bindEvents(),
			this.notifyPlugins('afterInit'),
			this
		);
	}
	clear() {
		return (Fi(this.canvas, this.ctx), this);
	}
	stop() {
		return (nt.stop(this), this);
	}
	resize(t, e) {
		nt.running(this) ? (this._resizeBeforeDraw = { width: t, height: e }) : this._resize(t, e);
	}
	_resize(t, e) {
		const s = this.options,
			n = this.canvas,
			o = s.maintainAspectRatio && this.aspectRatio,
			r = this.platform.getMaximumSize(n, t, e, o),
			a = s.devicePixelRatio || this.platform.getDevicePixelRatio(),
			l = this.width ? 'resize' : 'attach';
		((this.width = r.width),
			(this.height = r.height),
			(this._aspectRatio = this.aspectRatio),
			Vi(this, a, !0) &&
				(this.notifyPlugins('resize', { size: r }), B(s.onResize, [this, r], this), this.attached && this._doResize(l) && this.render()));
	}
	ensureScalesHaveIDs() {
		const e = this.options.scales || {};
		C(e, (s, n) => {
			s.id = n;
		});
	}
	buildOrUpdateScales() {
		const t = this.options,
			e = t.scales,
			s = this.scales,
			n = Object.keys(s).reduce((r, a) => ((r[a] = !1), r), {});
		let o = [];
		(e &&
			(o = o.concat(
				Object.keys(e).map((r) => {
					const a = e[r],
						l = Qe(r, a),
						c = l === 'r',
						h = l === 'x';
					return { options: a, dposition: c ? 'chartArea' : h ? 'bottom' : 'left', dtype: c ? 'radialLinear' : h ? 'category' : 'linear' };
				})
			)),
			C(o, (r) => {
				const a = r.options,
					l = a.id,
					c = Qe(l, a),
					h = D(a.type, r.dtype);
				((a.position === void 0 || us(a.position, c) !== us(r.dposition)) && (a.position = r.dposition), (n[l] = !0));
				let d = null;
				if (l in s && s[l].type === h) d = s[l];
				else {
					const f = tt.getScale(h);
					((d = new f({ id: l, type: h, ctx: this.ctx, chart: this })), (s[d.id] = d));
				}
				d.init(a, t);
			}),
			C(n, (r, a) => {
				r || delete s[a];
			}),
			C(s, (r) => {
				(ue.configure(this, r, r.options), ue.addBox(this, r));
			}));
	}
	_updateMetasets() {
		const t = this._metasets,
			e = this.data.datasets.length,
			s = t.length;
		if ((t.sort((n, o) => n.index - o.index), s > e)) {
			for (let n = e; n < s; ++n) this._destroyDatasetMeta(n);
			t.splice(e, s - e);
		}
		this._sortedMetasets = t.slice(0).sort(gs('order', 'index'));
	}
	_removeUnreferencedMetasets() {
		const {
			_metasets: t,
			data: { datasets: e }
		} = this;
		(t.length > e.length && delete this._stacks,
			t.forEach((s, n) => {
				e.filter((o) => o === s._dataset).length === 0 && this._destroyDatasetMeta(n);
			}));
	}
	buildOrUpdateControllers() {
		const t = [],
			e = this.data.datasets;
		let s, n;
		for (this._removeUnreferencedMetasets(), s = 0, n = e.length; s < n; s++) {
			const o = e[s];
			let r = this.getDatasetMeta(s);
			const a = o.type || this.config.type;
			if (
				(r.type && r.type !== a && (this._destroyDatasetMeta(s), (r = this.getDatasetMeta(s))),
				(r.type = a),
				(r.indexAxis = o.indexAxis || Je(a, this.options)),
				(r.order = o.order || 0),
				(r.index = s),
				(r.label = '' + o.label),
				(r.visible = this.isDatasetVisible(s)),
				r.controller)
			)
				(r.controller.updateIndex(s), r.controller.linkScales());
			else {
				const l = tt.getController(a),
					{ datasetElementType: c, dataElementType: h } = V.datasets[a];
				(Object.assign(l, { dataElementType: tt.getElement(h), datasetElementType: c && tt.getElement(c) }),
					(r.controller = new l(this, s)),
					t.push(r.controller));
			}
		}
		return (this._updateMetasets(), t);
	}
	_resetElements() {
		C(
			this.data.datasets,
			(t, e) => {
				this.getDatasetMeta(e).controller.reset();
			},
			this
		);
	}
	reset() {
		(this._resetElements(), this.notifyPlugins('reset'));
	}
	update(t) {
		const e = this.config;
		e.update();
		const s = (this._options = e.createResolver(e.chartOptionScopes(), this.getContext())),
			n = (this._animationsDisabled = !s.animation);
		if (
			(this._updateScales(),
			this._checkEventBindings(),
			this._updateHiddenIndices(),
			this._plugins.invalidate(),
			this.notifyPlugins('beforeUpdate', { mode: t, cancelable: !0 }) === !1)
		)
			return;
		const o = this.buildOrUpdateControllers();
		this.notifyPlugins('beforeElementsUpdate');
		let r = 0;
		for (let c = 0, h = this.data.datasets.length; c < h; c++) {
			const { controller: d } = this.getDatasetMeta(c),
				f = !n && o.indexOf(d) === -1;
			(d.buildOrUpdateElements(f), (r = Math.max(+d.getMaxOverflow(), r)));
		}
		((r = this._minPadding = s.layout.autoPadding ? r : 0),
			this._updateLayout(r),
			n ||
				C(o, (c) => {
					c.reset();
				}),
			this._updateDatasets(t),
			this.notifyPlugins('afterUpdate', { mode: t }),
			this._layers.sort(gs('z', '_idx')));
		const { _active: a, _lastEvent: l } = this;
		(l ? this._eventHandler(l, !0) : a.length && this._updateHoverStyles(a, a, !0), this.render());
	}
	_updateScales() {
		(C(this.scales, (t) => {
			ue.removeBox(this, t);
		}),
			this.ensureScalesHaveIDs(),
			this.buildOrUpdateScales());
	}
	_checkEventBindings() {
		const t = this.options,
			e = new Set(Object.keys(this._listeners)),
			s = new Set(t.events);
		(!Si(e, s) || !!this._responsiveListeners !== t.responsive) && (this.unbindEvents(), this.bindEvents());
	}
	_updateHiddenIndices() {
		const { _hiddenIndices: t } = this,
			e = this._getUniformDataChanges() || [];
		for (const { method: s, start: n, count: o } of e) {
			const r = s === '_removeElements' ? -o : o;
			Qa(t, n, r);
		}
	}
	_getUniformDataChanges() {
		const t = this._dataChanges;
		if (!t || !t.length) return;
		this._dataChanges = [];
		const e = this.data.datasets.length,
			s = (o) => new Set(t.filter((r) => r[0] === o).map((r, a) => a + ',' + r.splice(1).join(','))),
			n = s(0);
		for (let o = 1; o < e; o++) if (!Si(n, s(o))) return;
		return Array.from(n)
			.map((o) => o.split(','))
			.map((o) => ({ method: o[1], start: +o[2], count: +o[3] }));
	}
	_updateLayout(t) {
		if (this.notifyPlugins('beforeLayout', { cancelable: !0 }) === !1) return;
		ue.update(this, this.width, this.height, t);
		const e = this.chartArea,
			s = e.width <= 0 || e.height <= 0;
		((this._layers = []),
			C(
				this.boxes,
				(n) => {
					(s && n.position === 'chartArea') || (n.configure && n.configure(), this._layers.push(...n._layers()));
				},
				this
			),
			this._layers.forEach((n, o) => {
				n._idx = o;
			}),
			this.notifyPlugins('afterLayout'));
	}
	_updateDatasets(t) {
		if (this.notifyPlugins('beforeDatasetsUpdate', { mode: t, cancelable: !0 }) !== !1) {
			for (let e = 0, s = this.data.datasets.length; e < s; ++e) this.getDatasetMeta(e).controller.configure();
			for (let e = 0, s = this.data.datasets.length; e < s; ++e) this._updateDataset(e, ft(t) ? t({ datasetIndex: e }) : t);
			this.notifyPlugins('afterDatasetsUpdate', { mode: t });
		}
	}
	_updateDataset(t, e) {
		const s = this.getDatasetMeta(t),
			n = { meta: s, index: t, mode: e, cancelable: !0 };
		this.notifyPlugins('beforeDatasetUpdate', n) !== !1 &&
			(s.controller._update(e), (n.cancelable = !1), this.notifyPlugins('afterDatasetUpdate', n));
	}
	render() {
		this.notifyPlugins('beforeRender', { cancelable: !0 }) !== !1 &&
			(nt.has(this) ? this.attached && !nt.running(this) && nt.start(this) : (this.draw(), ps({ chart: this })));
	}
	draw() {
		let t;
		if (this._resizeBeforeDraw) {
			const { width: s, height: n } = this._resizeBeforeDraw;
			((this._resizeBeforeDraw = null), this._resize(s, n));
		}
		if ((this.clear(), this.width <= 0 || this.height <= 0 || this.notifyPlugins('beforeDraw', { cancelable: !0 }) === !1)) return;
		const e = this._layers;
		for (t = 0; t < e.length && e[t].z <= 0; ++t) e[t].draw(this.chartArea);
		for (this._drawDatasets(); t < e.length; ++t) e[t].draw(this.chartArea);
		this.notifyPlugins('afterDraw');
	}
	_getSortedDatasetMetas(t) {
		const e = this._sortedMetasets,
			s = [];
		let n, o;
		for (n = 0, o = e.length; n < o; ++n) {
			const r = e[n];
			(!t || r.visible) && s.push(r);
		}
		return s;
	}
	getSortedVisibleDatasetMetas() {
		return this._getSortedDatasetMetas(!0);
	}
	_drawDatasets() {
		if (this.notifyPlugins('beforeDatasetsDraw', { cancelable: !0 }) === !1) return;
		const t = this.getSortedVisibleDatasetMetas();
		for (let e = t.length - 1; e >= 0; --e) this._drawDataset(t[e]);
		this.notifyPlugins('afterDatasetsDraw');
	}
	_drawDataset(t) {
		const e = this.ctx,
			s = { meta: t, index: t.index, cancelable: !0 },
			n = rn(this, t);
		this.notifyPlugins('beforeDatasetDraw', s) !== !1 &&
			(n && ci(e, n), t.controller.draw(), n && hi(e), (s.cancelable = !1), this.notifyPlugins('afterDatasetDraw', s));
	}
	isPointInArea(t) {
		return ee(t, this.chartArea, this._minPadding);
	}
	getElementsAtEventForMode(t, e, s, n) {
		const o = Zr.modes[e];
		return typeof o == 'function' ? o(this, t, s, n) : [];
	}
	getDatasetMeta(t) {
		const e = this.data.datasets[t],
			s = this._metasets;
		let n = s.filter((o) => o && o._dataset === e).pop();
		return (
			n ||
				((n = {
					type: null,
					data: [],
					dataset: null,
					controller: null,
					hidden: null,
					xAxisID: null,
					yAxisID: null,
					order: (e && e.order) || 0,
					index: t,
					_dataset: e,
					_parsed: [],
					_sorted: !1
				}),
				s.push(n)),
			n
		);
	}
	getContext() {
		return this.$context || (this.$context = wt(null, { chart: this, type: 'chart' }));
	}
	getVisibleDatasetCount() {
		return this.getSortedVisibleDatasetMetas().length;
	}
	isDatasetVisible(t) {
		const e = this.data.datasets[t];
		if (!e) return !1;
		const s = this.getDatasetMeta(t);
		return typeof s.hidden == 'boolean' ? !s.hidden : !e.hidden;
	}
	setDatasetVisibility(t, e) {
		const s = this.getDatasetMeta(t);
		s.hidden = !e;
	}
	toggleDataVisibility(t) {
		this._hiddenIndices[t] = !this._hiddenIndices[t];
	}
	getDataVisibility(t) {
		return !this._hiddenIndices[t];
	}
	_updateVisibility(t, e, s) {
		const n = s ? 'show' : 'hide',
			o = this.getDatasetMeta(t),
			r = o.controller._resolveAnimations(void 0, n);
		Zt(e)
			? ((o.data[e].hidden = !s), this.update())
			: (this.setDatasetVisibility(t, s), r.update(o, { visible: s }), this.update((a) => (a.datasetIndex === t ? n : void 0)));
	}
	hide(t, e) {
		this._updateVisibility(t, e, !1);
	}
	show(t, e) {
		this._updateVisibility(t, e, !0);
	}
	_destroyDatasetMeta(t) {
		const e = this._metasets[t];
		(e && e.controller && e.controller._destroy(), delete this._metasets[t]);
	}
	_stop() {
		let t, e;
		for (this.stop(), nt.remove(this), t = 0, e = this.data.datasets.length; t < e; ++t) this._destroyDatasetMeta(t);
	}
	destroy() {
		this.notifyPlugins('beforeDestroy');
		const { canvas: t, ctx: e } = this;
		(this._stop(),
			this.config.clearCache(),
			t && (this.unbindEvents(), Fi(t, e), this.platform.releaseContext(e), (this.canvas = null), (this.ctx = null)),
			delete ye[this.id],
			this.notifyPlugins('afterDestroy'));
	}
	toBase64Image(...t) {
		return this.canvas.toDataURL(...t);
	}
	bindEvents() {
		(this.bindUserEvents(), this.options.responsive ? this.bindResponsiveEvents() : (this.attached = !0));
	}
	bindUserEvents() {
		const t = this._listeners,
			e = this.platform,
			s = (o, r) => {
				(e.addEventListener(this, o, r), (t[o] = r));
			},
			n = (o, r, a) => {
				((o.offsetX = r), (o.offsetY = a), this._eventHandler(o));
			};
		C(this.options.events, (o) => s(o, n));
	}
	bindResponsiveEvents() {
		this._responsiveListeners || (this._responsiveListeners = {});
		const t = this._responsiveListeners,
			e = this.platform,
			s = (l, c) => {
				(e.addEventListener(this, l, c), (t[l] = c));
			},
			n = (l, c) => {
				t[l] && (e.removeEventListener(this, l, c), delete t[l]);
			},
			o = (l, c) => {
				this.canvas && this.resize(l, c);
			};
		let r;
		const a = () => {
			(n('attach', a), (this.attached = !0), this.resize(), s('resize', o), s('detach', r));
		};
		((r = () => {
			((this.attached = !1), n('resize', o), this._stop(), this._resize(0, 0), s('attach', a));
		}),
			e.isAttached(this.canvas) ? a() : r());
	}
	unbindEvents() {
		(C(this._listeners, (t, e) => {
			this.platform.removeEventListener(this, e, t);
		}),
			(this._listeners = {}),
			C(this._responsiveListeners, (t, e) => {
				this.platform.removeEventListener(this, e, t);
			}),
			(this._responsiveListeners = void 0));
	}
	updateHoverStyle(t, e, s) {
		const n = s ? 'set' : 'remove';
		let o, r, a, l;
		for (
			e === 'dataset' && ((o = this.getDatasetMeta(t[0].datasetIndex)), o.controller['_' + n + 'DatasetHoverStyle']()), a = 0, l = t.length;
			a < l;
			++a
		) {
			r = t[a];
			const c = r && this.getDatasetMeta(r.datasetIndex).controller;
			c && c[n + 'HoverStyle'](r.element, r.datasetIndex, r.index);
		}
	}
	getActiveElements() {
		return this._active || [];
	}
	setActiveElements(t) {
		const e = this._active || [],
			s = t.map(({ datasetIndex: o, index: r }) => {
				const a = this.getDatasetMeta(o);
				if (!a) throw new Error('No dataset found at index ' + o);
				return { datasetIndex: o, element: a.data[r], index: r };
			});
		!ve(s, e) && ((this._active = s), (this._lastEvent = null), this._updateHoverStyles(s, e));
	}
	notifyPlugins(t, e, s) {
		return this._plugins.notify(this, t, e, s);
	}
	isPluginEnabled(t) {
		return this._plugins._cache.filter((e) => e.plugin.id === t).length === 1;
	}
	_updateHoverStyles(t, e, s) {
		const n = this.options.hover,
			o = (l, c) => l.filter((h) => !c.some((d) => h.datasetIndex === d.datasetIndex && h.index === d.index)),
			r = o(e, t),
			a = s ? t : o(t, e);
		(r.length && this.updateHoverStyle(r, n.mode, !1), a.length && n.mode && this.updateHoverStyle(a, n.mode, !0));
	}
	_eventHandler(t, e) {
		const s = { event: t, replay: e, cancelable: !0, inChartArea: this.isPointInArea(t) },
			n = (r) => (r.options.events || this.options.events).includes(t.native.type);
		if (this.notifyPlugins('beforeEvent', s, n) === !1) return;
		const o = this._handleEvent(t, e, s.inChartArea);
		return ((s.cancelable = !1), this.notifyPlugins('afterEvent', s, n), (o || s.changed) && this.render(), this);
	}
	_handleEvent(t, e, s) {
		const { _active: n = [], options: o } = this,
			r = e,
			a = this._getActiveElements(t, n, s, r),
			l = Qn(t),
			c = tl(t, this._lastEvent, s, l);
		s && ((this._lastEvent = null), B(o.onHover, [t, a, this], this), l && B(o.onClick, [t, a, this], this));
		const h = !ve(a, n);
		return ((h || e) && ((this._active = a), this._updateHoverStyles(a, n, e)), (this._lastEvent = c), h);
	}
	_getActiveElements(t, e, s, n) {
		if (t.type === 'mouseout') return [];
		if (!s) return e;
		const o = this.options.hover;
		return this.getElementsAtEventForMode(t, o.mode, o, n);
	}
}
function bs() {
	return C(el.instances, (i) => i._plugins.invalidate());
}
function il(i, t, e) {
	const { startAngle: s, x: n, y: o, outerRadius: r, innerRadius: a, options: l } = t,
		{ borderWidth: c, borderJoinStyle: h } = l,
		d = Math.min(c / r, K(s - e));
	if ((i.beginPath(), i.arc(n, o, r - c / 2, s + d / 2, e - d / 2), a > 0)) {
		const f = Math.min(c / a, K(s - e));
		i.arc(n, o, a + c / 2, e - f / 2, s + f / 2, !0);
	} else {
		const f = Math.min(c / 2, r * K(s - e));
		if (h === 'round') i.arc(n, o, f, e - R / 2, s + R / 2, !0);
		else if (h === 'bevel') {
			const u = 2 * f * f,
				p = -u * Math.cos(e + R / 2) + n,
				g = -u * Math.sin(e + R / 2) + o,
				m = u * Math.cos(s + R / 2) + n,
				b = u * Math.sin(s + R / 2) + o;
			(i.lineTo(p, g), i.lineTo(m, b));
		}
	}
	(i.closePath(), i.moveTo(0, 0), i.rect(0, 0, i.canvas.width, i.canvas.height), i.clip('evenodd'));
}
function sl(i, t, e) {
	const { startAngle: s, pixelMargin: n, x: o, y: r, outerRadius: a, innerRadius: l } = t;
	let c = n / a;
	(i.beginPath(),
		i.arc(o, r, a, s - c, e + c),
		l > n ? ((c = n / l), i.arc(o, r, l, e + c, s - c, !0)) : i.arc(o, r, n, e + W, s - W),
		i.closePath(),
		i.clip());
}
function nl(i) {
	return di(i, ['outerStart', 'outerEnd', 'innerStart', 'innerEnd']);
}
function ol(i, t, e, s) {
	const n = nl(i.options.borderRadius),
		o = (e - t) / 2,
		r = Math.min(o, (s * t) / 2),
		a = (l) => {
			const c = ((e - Math.min(o, l)) * s) / 2;
			return H(l, 0, Math.min(o, c));
		};
	return { outerStart: a(n.outerStart), outerEnd: a(n.outerEnd), innerStart: H(n.innerStart, 0, r), innerEnd: H(n.innerEnd, 0, r) };
}
function At(i, t, e, s) {
	return { x: e + i * Math.cos(t), y: s + i * Math.sin(t) };
}
function Pe(i, t, e, s, n, o) {
	const { x: r, y: a, startAngle: l, pixelMargin: c, innerRadius: h } = t,
		d = Math.max(t.outerRadius + s + e - c, 0),
		f = h > 0 ? h + s + e + c : 0;
	let u = 0;
	const p = n - l;
	if (s) {
		const T = h > 0 ? h - s : 0,
			I = d > 0 ? d - s : 0,
			z = (T + I) / 2,
			Z = z !== 0 ? (p * z) / (z + s) : p;
		u = (p - Z) / 2;
	}
	const g = Math.max(0.001, p * d - e / R) / d,
		m = (p - g) / 2,
		b = l + m + u,
		_ = n - m - u,
		{ outerStart: y, outerEnd: v, innerStart: x, innerEnd: k } = ol(t, f, d, _ - b),
		M = d - y,
		S = d - v,
		w = b + y / M,
		A = _ - v / S,
		L = f + x,
		F = f + k,
		U = b + x / L,
		G = _ - k / F;
	if ((i.beginPath(), o)) {
		const T = (w + A) / 2;
		if ((i.arc(r, a, d, w, T), i.arc(r, a, d, T, A), v > 0)) {
			const j = At(S, A, r, a);
			i.arc(j.x, j.y, v, A, _ + W);
		}
		const I = At(F, _, r, a);
		if ((i.lineTo(I.x, I.y), k > 0)) {
			const j = At(F, G, r, a);
			i.arc(j.x, j.y, k, _ + W, G + Math.PI);
		}
		const z = (_ - k / f + (b + x / f)) / 2;
		if ((i.arc(r, a, f, _ - k / f, z, !0), i.arc(r, a, f, z, b + x / f, !0), x > 0)) {
			const j = At(L, U, r, a);
			i.arc(j.x, j.y, x, U + Math.PI, b - W);
		}
		const Z = At(M, b, r, a);
		if ((i.lineTo(Z.x, Z.y), y > 0)) {
			const j = At(M, w, r, a);
			i.arc(j.x, j.y, y, b - W, w);
		}
	} else {
		i.moveTo(r, a);
		const T = Math.cos(w) * d + r,
			I = Math.sin(w) * d + a;
		i.lineTo(T, I);
		const z = Math.cos(A) * d + r,
			Z = Math.sin(A) * d + a;
		i.lineTo(z, Z);
	}
	i.closePath();
}
function rl(i, t, e, s, n) {
	const { fullCircles: o, startAngle: r, circumference: a } = t;
	let l = t.endAngle;
	if (o) {
		Pe(i, t, e, s, l, n);
		for (let c = 0; c < o; ++c) i.fill();
		isNaN(a) || (l = r + (a % E || E));
	}
	return (Pe(i, t, e, s, l, n), i.fill(), l);
}
function al(i, t, e, s, n) {
	const { fullCircles: o, startAngle: r, circumference: a, options: l } = t,
		{ borderWidth: c, borderJoinStyle: h, borderDash: d, borderDashOffset: f, borderRadius: u } = l,
		p = l.borderAlign === 'inner';
	if (!c) return;
	(i.setLineDash(d || []),
		(i.lineDashOffset = f),
		p ? ((i.lineWidth = c * 2), (i.lineJoin = h || 'round')) : ((i.lineWidth = c), (i.lineJoin = h || 'bevel')));
	let g = t.endAngle;
	if (o) {
		Pe(i, t, e, s, g, n);
		for (let m = 0; m < o; ++m) i.stroke();
		isNaN(a) || (g = r + (a % E || E));
	}
	(p && sl(i, t, g), l.selfJoin && g - r >= R && u === 0 && h !== 'miter' && il(i, t, g), o || (Pe(i, t, e, s, g, n), i.stroke()));
}
class oc extends Pt {
	static id = 'arc';
	static defaults = {
		borderAlign: 'center',
		borderColor: '#fff',
		borderDash: [],
		borderDashOffset: 0,
		borderJoinStyle: void 0,
		borderRadius: 0,
		borderWidth: 2,
		offset: 0,
		spacing: 0,
		angle: void 0,
		circular: !0,
		selfJoin: !1
	};
	static defaultRoutes = { backgroundColor: 'backgroundColor' };
	static descriptors = { _scriptable: !0, _indexable: (t) => t !== 'borderDash' };
	circumference;
	endAngle;
	fullCircles;
	innerRadius;
	outerRadius;
	pixelMargin;
	startAngle;
	constructor(t) {
		(super(),
			(this.options = void 0),
			(this.circumference = void 0),
			(this.startAngle = void 0),
			(this.endAngle = void 0),
			(this.innerRadius = void 0),
			(this.outerRadius = void 0),
			(this.pixelMargin = 0),
			(this.fullCircles = 0),
			t && Object.assign(this, t));
	}
	inRange(t, e, s) {
		const n = this.getProps(['x', 'y'], s),
			{ angle: o, distance: r } = $s(n, { x: t, y: e }),
			{
				startAngle: a,
				endAngle: l,
				innerRadius: c,
				outerRadius: h,
				circumference: d
			} = this.getProps(['startAngle', 'endAngle', 'innerRadius', 'outerRadius', 'circumference'], s),
			f = (this.options.spacing + this.options.borderWidth) / 2,
			u = D(d, l - a),
			p = Qt(o, a, l) && a !== l,
			g = u >= E || p,
			m = te(r, c + f, h + f);
		return g && m;
	}
	getCenterPoint(t) {
		const {
				x: e,
				y: s,
				startAngle: n,
				endAngle: o,
				innerRadius: r,
				outerRadius: a
			} = this.getProps(['x', 'y', 'startAngle', 'endAngle', 'innerRadius', 'outerRadius'], t),
			{ offset: l, spacing: c } = this.options,
			h = (n + o) / 2,
			d = (r + a + c + l) / 2;
		return { x: e + Math.cos(h) * d, y: s + Math.sin(h) * d };
	}
	tooltipPosition(t) {
		return this.getCenterPoint(t);
	}
	draw(t) {
		const { options: e, circumference: s } = this,
			n = (e.offset || 0) / 4,
			o = (e.spacing || 0) / 2,
			r = e.circular;
		if (
			((this.pixelMargin = e.borderAlign === 'inner' ? 0.33 : 0),
			(this.fullCircles = s > E ? Math.floor(s / E) : 0),
			s === 0 || this.innerRadius < 0 || this.outerRadius < 0)
		)
			return;
		t.save();
		const a = (this.startAngle + this.endAngle) / 2;
		t.translate(Math.cos(a) * n, Math.sin(a) * n);
		const l = 1 - Math.sin(Math.min(R, s || 0)),
			c = n * l;
		((t.fillStyle = e.backgroundColor), (t.strokeStyle = e.borderColor), rl(t, this, c, o, r), al(t, this, c, o, r), t.restore());
	}
}
function xn(i, t, e = t) {
	((i.lineCap = D(e.borderCapStyle, t.borderCapStyle)),
		i.setLineDash(D(e.borderDash, t.borderDash)),
		(i.lineDashOffset = D(e.borderDashOffset, t.borderDashOffset)),
		(i.lineJoin = D(e.borderJoinStyle, t.borderJoinStyle)),
		(i.lineWidth = D(e.borderWidth, t.borderWidth)),
		(i.strokeStyle = D(e.borderColor, t.borderColor)));
}
function ll(i, t, e) {
	i.lineTo(e.x, e.y);
}
function cl(i) {
	return i.stepped ? Oo : i.tension || i.cubicInterpolationMode === 'monotone' ? Co : ll;
}
function yn(i, t, e = {}) {
	const s = i.length,
		{ start: n = 0, end: o = s - 1 } = e,
		{ start: r, end: a } = t,
		l = Math.max(n, r),
		c = Math.min(o, a),
		h = (n < r && o < r) || (n > a && o > a);
	return { count: s, start: l, loop: t.loop, ilen: c < l && !h ? s + c - l : c - l };
}
function hl(i, t, e, s) {
	const { points: n, options: o } = t,
		{ count: r, start: a, loop: l, ilen: c } = yn(n, e, s),
		h = cl(o);
	let { move: d = !0, reverse: f } = s || {},
		u,
		p,
		g;
	for (u = 0; u <= c; ++u) ((p = n[(a + (f ? c - u : u)) % r]), !p.skip && (d ? (i.moveTo(p.x, p.y), (d = !1)) : h(i, g, p, f, o.stepped), (g = p)));
	return (l && ((p = n[(a + (f ? c : 0)) % r]), h(i, g, p, f, o.stepped)), !!l);
}
function dl(i, t, e, s) {
	const n = t.points,
		{ count: o, start: r, ilen: a } = yn(n, e, s),
		{ move: l = !0, reverse: c } = s || {};
	let h = 0,
		d = 0,
		f,
		u,
		p,
		g,
		m,
		b;
	const _ = (v) => (r + (c ? a - v : v)) % o,
		y = () => {
			g !== m && (i.lineTo(h, m), i.lineTo(h, g), i.lineTo(h, b));
		};
	for (l && ((u = n[_(0)]), i.moveTo(u.x, u.y)), f = 0; f <= a; ++f) {
		if (((u = n[_(f)]), u.skip)) continue;
		const v = u.x,
			x = u.y,
			k = v | 0;
		(k === p ? (x < g ? (g = x) : x > m && (m = x), (h = (d * h + v) / ++d)) : (y(), i.lineTo(v, x), (p = k), (d = 0), (g = m = x)), (b = x));
	}
	y();
}
function ti(i) {
	const t = i.options,
		e = t.borderDash && t.borderDash.length;
	return !i._decimated && !i._loop && !t.tension && t.cubicInterpolationMode !== 'monotone' && !t.stepped && !e ? dl : hl;
}
function fl(i) {
	return i.stepped ? ar : i.tension || i.cubicInterpolationMode === 'monotone' ? lr : yt;
}
function ul(i, t, e, s) {
	let n = t._path;
	(n || ((n = t._path = new Path2D()), t.path(n, e, s) && n.closePath()), xn(i, t.options), i.stroke(n));
}
function gl(i, t, e, s) {
	const { segments: n, options: o } = t,
		r = ti(t);
	for (const a of n) (xn(i, o, a.style), i.beginPath(), r(i, t, a, { start: e, end: e + s - 1 }) && i.closePath(), i.stroke());
}
const pl = typeof Path2D == 'function';
function ml(i, t, e, s) {
	pl && !t.options.segment ? ul(i, t, e, s) : gl(i, t, e, s);
}
class _i extends Pt {
	static id = 'line';
	static defaults = {
		borderCapStyle: 'butt',
		borderDash: [],
		borderDashOffset: 0,
		borderJoinStyle: 'miter',
		borderWidth: 3,
		capBezierPoints: !0,
		cubicInterpolationMode: 'default',
		fill: !1,
		spanGaps: !1,
		stepped: !1,
		tension: 0
	};
	static defaultRoutes = { backgroundColor: 'backgroundColor', borderColor: 'borderColor' };
	static descriptors = { _scriptable: !0, _indexable: (t) => t !== 'borderDash' && t !== 'fill' };
	constructor(t) {
		(super(),
			(this.animated = !0),
			(this.options = void 0),
			(this._chart = void 0),
			(this._loop = void 0),
			(this._fullLoop = void 0),
			(this._path = void 0),
			(this._points = void 0),
			(this._segments = void 0),
			(this._decimated = !1),
			(this._pointsUpdated = !1),
			(this._datasetIndex = void 0),
			t && Object.assign(this, t));
	}
	updateControlPoints(t, e) {
		const s = this.options;
		if ((s.tension || s.cubicInterpolationMode === 'monotone') && !s.stepped && !this._pointsUpdated) {
			const n = s.spanGaps ? this._loop : this._fullLoop;
			(Qo(this._points, s, t, n, e), (this._pointsUpdated = !0));
		}
	}
	set points(t) {
		((this._points = t), delete this._segments, delete this._path, (this._pointsUpdated = !1));
	}
	get points() {
		return this._points;
	}
	get segments() {
		return this._segments || (this._segments = mr(this, this.options.segment));
	}
	first() {
		const t = this.segments,
			e = this.points;
		return t.length && e[t[0].start];
	}
	last() {
		const t = this.segments,
			e = this.points,
			s = t.length;
		return s && e[t[s - 1].end];
	}
	interpolate(t, e) {
		const s = this.options,
			n = t[e],
			o = this.points,
			r = on(this, { property: e, start: n, end: n });
		if (!r.length) return;
		const a = [],
			l = fl(s);
		let c, h;
		for (c = 0, h = r.length; c < h; ++c) {
			const { start: d, end: f } = r[c],
				u = o[d],
				p = o[f];
			if (u === p) {
				a.push(u);
				continue;
			}
			const g = Math.abs((n - u[e]) / (p[e] - u[e])),
				m = l(u, p, g, s.stepped);
			((m[e] = t[e]), a.push(m));
		}
		return a.length === 1 ? a[0] : a;
	}
	pathSegment(t, e, s) {
		return ti(this)(t, this, e, s);
	}
	path(t, e, s) {
		const n = this.segments,
			o = ti(this);
		let r = this._loop;
		((e = e || 0), (s = s || this.points.length - e));
		for (const a of n) r &= o(t, this, a, { start: e, end: e + s - 1 });
		return !!r;
	}
	draw(t, e, s, n) {
		const o = this.options || {};
		((this.points || []).length && o.borderWidth && (t.save(), ml(t, this, s, n), t.restore()),
			this.animated && ((this._pointsUpdated = !1), (this._path = void 0)));
	}
}
function _s(i, t, e, s) {
	const n = i.options,
		{ [e]: o } = i.getProps([e], s);
	return Math.abs(t - o) < n.radius + n.hitRadius;
}
class rc extends Pt {
	static id = 'point';
	parsed;
	skip;
	stop;
	static defaults = { borderWidth: 1, hitRadius: 1, hoverBorderWidth: 1, hoverRadius: 4, pointStyle: 'circle', radius: 3, rotation: 0 };
	static defaultRoutes = { backgroundColor: 'backgroundColor', borderColor: 'borderColor' };
	constructor(t) {
		(super(), (this.options = void 0), (this.parsed = void 0), (this.skip = void 0), (this.stop = void 0), t && Object.assign(this, t));
	}
	inRange(t, e, s) {
		const n = this.options,
			{ x: o, y: r } = this.getProps(['x', 'y'], s);
		return Math.pow(t - o, 2) + Math.pow(e - r, 2) < Math.pow(n.hitRadius + n.radius, 2);
	}
	inXRange(t, e) {
		return _s(this, t, 'x', e);
	}
	inYRange(t, e) {
		return _s(this, t, 'y', e);
	}
	getCenterPoint(t) {
		const { x: e, y: s } = this.getProps(['x', 'y'], t);
		return { x: e, y: s };
	}
	size(t) {
		t = t || this.options || {};
		let e = t.radius || 0;
		e = Math.max(e, (e && t.hoverRadius) || 0);
		const s = (e && t.borderWidth) || 0;
		return (e + s) * 2;
	}
	draw(t, e) {
		const s = this.options;
		this.skip ||
			s.radius < 0.1 ||
			!ee(this, e, this.size(s) / 2) ||
			((t.strokeStyle = s.borderColor), (t.lineWidth = s.borderWidth), (t.fillStyle = s.backgroundColor), Ge(t, s, this.x, this.y));
	}
	getRange() {
		const t = this.options || {};
		return t.radius + t.hitRadius;
	}
}
function vn(i, t) {
	const { x: e, y: s, base: n, width: o, height: r } = i.getProps(['x', 'y', 'base', 'width', 'height'], t);
	let a, l, c, h, d;
	return (
		i.horizontal
			? ((d = r / 2), (a = Math.min(e, n)), (l = Math.max(e, n)), (c = s - d), (h = s + d))
			: ((d = o / 2), (a = e - d), (l = e + d), (c = Math.min(s, n)), (h = Math.max(s, n))),
		{ left: a, top: c, right: l, bottom: h }
	);
}
function ht(i, t, e, s) {
	return i ? 0 : H(t, e, s);
}
function bl(i, t, e) {
	const s = i.options.borderWidth,
		n = i.borderSkipped,
		o = Gs(s);
	return { t: ht(n.top, o.top, 0, e), r: ht(n.right, o.right, 0, t), b: ht(n.bottom, o.bottom, 0, e), l: ht(n.left, o.left, 0, t) };
}
function _l(i, t, e) {
	const { enableBorderRadius: s } = i.getProps(['enableBorderRadius']),
		n = i.options.borderRadius,
		o = Kt(n),
		r = Math.min(t, e),
		a = i.borderSkipped,
		l = s || P(n);
	return {
		topLeft: ht(!l || a.top || a.left, o.topLeft, 0, r),
		topRight: ht(!l || a.top || a.right, o.topRight, 0, r),
		bottomLeft: ht(!l || a.bottom || a.left, o.bottomLeft, 0, r),
		bottomRight: ht(!l || a.bottom || a.right, o.bottomRight, 0, r)
	};
}
function xl(i) {
	const t = vn(i),
		e = t.right - t.left,
		s = t.bottom - t.top,
		n = bl(i, e / 2, s / 2),
		o = _l(i, e / 2, s / 2);
	return {
		outer: { x: t.left, y: t.top, w: e, h: s, radius: o },
		inner: {
			x: t.left + n.l,
			y: t.top + n.t,
			w: e - n.l - n.r,
			h: s - n.t - n.b,
			radius: {
				topLeft: Math.max(0, o.topLeft - Math.max(n.t, n.l)),
				topRight: Math.max(0, o.topRight - Math.max(n.t, n.r)),
				bottomLeft: Math.max(0, o.bottomLeft - Math.max(n.b, n.l)),
				bottomRight: Math.max(0, o.bottomRight - Math.max(n.b, n.r))
			}
		}
	};
}
function He(i, t, e, s) {
	const n = t === null,
		o = e === null,
		a = i && !(n && o) && vn(i, s);
	return a && (n || te(t, a.left, a.right)) && (o || te(e, a.top, a.bottom));
}
function yl(i) {
	return i.topLeft || i.topRight || i.bottomLeft || i.bottomRight;
}
function vl(i, t) {
	i.rect(t.x, t.y, t.w, t.h);
}
function $e(i, t, e = {}) {
	const s = i.x !== e.x ? -t : 0,
		n = i.y !== e.y ? -t : 0,
		o = (i.x + i.w !== e.x + e.w ? t : 0) - s,
		r = (i.y + i.h !== e.y + e.h ? t : 0) - n;
	return { x: i.x + s, y: i.y + n, w: i.w + o, h: i.h + r, radius: i.radius };
}
class ac extends Pt {
	static id = 'bar';
	static defaults = { borderSkipped: 'start', borderWidth: 0, borderRadius: 0, inflateAmount: 'auto', pointStyle: void 0 };
	static defaultRoutes = { backgroundColor: 'backgroundColor', borderColor: 'borderColor' };
	constructor(t) {
		(super(),
			(this.options = void 0),
			(this.horizontal = void 0),
			(this.base = void 0),
			(this.width = void 0),
			(this.height = void 0),
			(this.inflateAmount = void 0),
			t && Object.assign(this, t));
	}
	draw(t) {
		const {
				inflateAmount: e,
				options: { borderColor: s, backgroundColor: n }
			} = this,
			{ inner: o, outer: r } = xl(this),
			a = yl(r.radius) ? Ze : vl;
		(t.save(),
			(r.w !== o.w || r.h !== o.h) && (t.beginPath(), a(t, $e(r, e, o)), t.clip(), a(t, $e(o, -e, r)), (t.fillStyle = s), t.fill('evenodd')),
			t.beginPath(),
			a(t, $e(o, e)),
			(t.fillStyle = n),
			t.fill(),
			t.restore());
	}
	inRange(t, e, s) {
		return He(this, t, e, s);
	}
	inXRange(t, e) {
		return He(this, t, null, e);
	}
	inYRange(t, e) {
		return He(this, null, t, e);
	}
	getCenterPoint(t) {
		const { x: e, y: s, base: n, horizontal: o } = this.getProps(['x', 'y', 'base', 'horizontal'], t);
		return { x: o ? (e + n) / 2 : e, y: o ? s : (s + n) / 2 };
	}
	getRange(t) {
		return t === 'x' ? this.width / 2 : this.height / 2;
	}
}
function Ml(i, t, e) {
	const s = i.segments,
		n = i.points,
		o = t.points,
		r = [];
	for (const a of s) {
		let { start: l, end: c } = a;
		c = Ae(l, c, n);
		const h = ei(e, n[l], n[c], a.loop);
		if (!t.segments) {
			r.push({ source: a, target: h, start: n[l], end: n[c] });
			continue;
		}
		const d = on(t, h);
		for (const f of d) {
			const u = ei(e, o[f.start], o[f.end], f.loop),
				p = nn(a, n, u);
			for (const g of p) r.push({ source: g, target: f, start: { [e]: xs(h, u, 'start', Math.max) }, end: { [e]: xs(h, u, 'end', Math.min) } });
		}
	}
	return r;
}
function ei(i, t, e, s) {
	if (s) return;
	let n = t[i],
		o = e[i];
	return (i === 'angle' && ((n = K(n)), (o = K(o))), { property: i, start: n, end: o });
}
function kl(i, t) {
	const { x: e = null, y: s = null } = i || {},
		n = t.points,
		o = [];
	return (
		t.segments.forEach(({ start: r, end: a }) => {
			a = Ae(r, a, n);
			const l = n[r],
				c = n[a];
			s !== null ? (o.push({ x: l.x, y: s }), o.push({ x: c.x, y: s })) : e !== null && (o.push({ x: e, y: l.y }), o.push({ x: e, y: c.y }));
		}),
		o
	);
}
function Ae(i, t, e) {
	for (; t > i; t--) {
		const s = e[t];
		if (!isNaN(s.x) && !isNaN(s.y)) break;
	}
	return t;
}
function xs(i, t, e, s) {
	return i && t ? s(i[e], t[e]) : i ? i[e] : t ? t[e] : 0;
}
function Mn(i, t) {
	let e = [],
		s = !1;
	return (N(i) ? ((s = !0), (e = i)) : (e = kl(i, t)), e.length ? new _i({ points: e, options: { tension: 0 }, _loop: s, _fullLoop: s }) : null);
}
function ys(i) {
	return i && i.fill !== !1;
}
function Sl(i, t, e) {
	let n = i[t].fill;
	const o = [t];
	let r;
	if (!e) return n;
	for (; n !== !1 && o.indexOf(n) === -1; ) {
		if (!$(n)) return n;
		if (((r = i[n]), !r)) return !1;
		if (r.visible) return n;
		(o.push(n), (n = r.fill));
	}
	return !1;
}
function wl(i, t, e) {
	const s = Cl(i);
	if (P(s)) return isNaN(s.value) ? !1 : s;
	let n = parseFloat(s);
	return $(n) && Math.floor(n) === n ? Pl(s[0], t, n, e) : ['origin', 'start', 'end', 'stack', 'shape'].indexOf(s) >= 0 && s;
}
function Pl(i, t, e, s) {
	return ((i === '-' || i === '+') && (e = t + e), e === t || e < 0 || e >= s ? !1 : e);
}
function Dl(i, t) {
	let e = null;
	return (
		i === 'start' ? (e = t.bottom) : i === 'end' ? (e = t.top) : P(i) ? (e = t.getPixelForValue(i.value)) : t.getBasePixel && (e = t.getBasePixel()),
		e
	);
}
function Ol(i, t, e) {
	let s;
	return (i === 'start' ? (s = e) : i === 'end' ? (s = t.options.reverse ? t.min : t.max) : P(i) ? (s = i.value) : (s = t.getBaseValue()), s);
}
function Cl(i) {
	const t = i.options,
		e = t.fill;
	let s = D(e && e.target, e);
	return (s === void 0 && (s = !!t.backgroundColor), s === !1 || s === null ? !1 : s === !0 ? 'origin' : s);
}
function Al(i) {
	const { scale: t, index: e, line: s } = i,
		n = [],
		o = s.segments,
		r = s.points,
		a = Tl(t, e);
	a.push(Mn({ x: null, y: t.bottom }, s));
	for (let l = 0; l < o.length; l++) {
		const c = o[l];
		for (let h = c.start; h <= c.end; h++) Rl(n, r[h], a);
	}
	return new _i({ points: n, options: {} });
}
function Tl(i, t) {
	const e = [],
		s = i.getMatchingVisibleMetas('line');
	for (let n = 0; n < s.length; n++) {
		const o = s[n];
		if (o.index === t) break;
		o.hidden || e.unshift(o.dataset);
	}
	return e;
}
function Rl(i, t, e) {
	const s = [];
	for (let n = 0; n < e.length; n++) {
		const o = e[n],
			{ first: r, last: a, point: l } = Ll(o, t, 'x');
		if (!(!l || (r && a))) {
			if (r) s.unshift(l);
			else if ((i.push(l), !a)) break;
		}
	}
	i.push(...s);
}
function Ll(i, t, e) {
	const s = i.interpolate(t, e);
	if (!s) return {};
	const n = s[e],
		o = i.segments,
		r = i.points;
	let a = !1,
		l = !1;
	for (let c = 0; c < o.length; c++) {
		const h = o[c],
			d = r[h.start][e],
			f = r[h.end][e];
		if (te(n, d, f)) {
			((a = n === d), (l = n === f));
			break;
		}
	}
	return { first: a, last: l, point: s };
}
class kn {
	constructor(t) {
		((this.x = t.x), (this.y = t.y), (this.radius = t.radius));
	}
	pathSegment(t, e, s) {
		const { x: n, y: o, radius: r } = this;
		return ((e = e || { start: 0, end: E }), t.arc(n, o, r, e.end, e.start, !0), !s.bounds);
	}
	interpolate(t) {
		const { x: e, y: s, radius: n } = this,
			o = t.angle;
		return { x: e + Math.cos(o) * n, y: s + Math.sin(o) * n, angle: o };
	}
}
function Il(i) {
	const { chart: t, fill: e, line: s } = i;
	if ($(e)) return Fl(t, e);
	if (e === 'stack') return Al(i);
	if (e === 'shape') return !0;
	const n = El(i);
	return n instanceof kn ? n : Mn(n, s);
}
function Fl(i, t) {
	const e = i.getDatasetMeta(t);
	return e && i.isDatasetVisible(t) ? e.dataset : null;
}
function El(i) {
	return (i.scale || {}).getPointPositionForValue ? Bl(i) : zl(i);
}
function zl(i) {
	const { scale: t = {}, fill: e } = i,
		s = Dl(e, t);
	if ($(s)) {
		const n = t.isHorizontal();
		return { x: n ? s : null, y: n ? null : s };
	}
	return null;
}
function Bl(i) {
	const { scale: t, fill: e } = i,
		s = t.options,
		n = t.getLabels().length,
		o = s.reverse ? t.max : t.min,
		r = Ol(e, t, o),
		a = [];
	if (s.grid.circular) {
		const l = t.getPointPositionForValue(0, o);
		return new kn({ x: l.x, y: l.y, radius: t.getDistanceFromCenterForValue(r) });
	}
	for (let l = 0; l < n; ++l) a.push(t.getPointPositionForValue(l, r));
	return a;
}
function Ye(i, t, e) {
	const s = Il(t),
		{ chart: n, index: o, line: r, scale: a, axis: l } = t,
		c = r.options,
		h = c.fill,
		d = c.backgroundColor,
		{ above: f = d, below: u = d } = h || {},
		p = n.getDatasetMeta(o),
		g = rn(n, p);
	s && r.points.length && (ci(i, e), Vl(i, { line: r, target: s, above: f, below: u, area: e, scale: a, axis: l, clip: g }), hi(i));
}
function Vl(i, t) {
	const { line: e, target: s, above: n, below: o, area: r, scale: a, clip: l } = t,
		c = e._loop ? 'angle' : t.axis;
	i.save();
	let h = o;
	(o !== n &&
		(c === 'x'
			? (vs(i, s, r.top), Xe(i, { line: e, target: s, color: n, scale: a, property: c, clip: l }), i.restore(), i.save(), vs(i, s, r.bottom))
			: c === 'y' &&
				(Ms(i, s, r.left),
				Xe(i, { line: e, target: s, color: o, scale: a, property: c, clip: l }),
				i.restore(),
				i.save(),
				Ms(i, s, r.right),
				(h = n))),
		Xe(i, { line: e, target: s, color: h, scale: a, property: c, clip: l }),
		i.restore());
}
function vs(i, t, e) {
	const { segments: s, points: n } = t;
	let o = !0,
		r = !1;
	i.beginPath();
	for (const a of s) {
		const { start: l, end: c } = a,
			h = n[l],
			d = n[Ae(l, c, n)];
		(o ? (i.moveTo(h.x, h.y), (o = !1)) : (i.lineTo(h.x, e), i.lineTo(h.x, h.y)),
			(r = !!t.pathSegment(i, a, { move: r })),
			r ? i.closePath() : i.lineTo(d.x, e));
	}
	(i.lineTo(t.first().x, e), i.closePath(), i.clip());
}
function Ms(i, t, e) {
	const { segments: s, points: n } = t;
	let o = !0,
		r = !1;
	i.beginPath();
	for (const a of s) {
		const { start: l, end: c } = a,
			h = n[l],
			d = n[Ae(l, c, n)];
		(o ? (i.moveTo(h.x, h.y), (o = !1)) : (i.lineTo(e, h.y), i.lineTo(h.x, h.y)),
			(r = !!t.pathSegment(i, a, { move: r })),
			r ? i.closePath() : i.lineTo(e, d.y));
	}
	(i.lineTo(e, t.first().y), i.closePath(), i.clip());
}
function Xe(i, t) {
	const { line: e, target: s, property: n, color: o, scale: r, clip: a } = t,
		l = Ml(e, s, n);
	for (const { source: c, target: h, start: d, end: f } of l) {
		const { style: { backgroundColor: u = o } = {} } = c,
			p = s !== !0;
		(i.save(), (i.fillStyle = u), Nl(i, r, a, p && ei(n, d, f)), i.beginPath());
		const g = !!e.pathSegment(i, c);
		let m;
		if (p) {
			g ? i.closePath() : ks(i, s, f, n);
			const b = !!s.pathSegment(i, h, { move: g, reverse: !0 });
			((m = g && b), m || ks(i, s, d, n));
		}
		(i.closePath(), i.fill(m ? 'evenodd' : 'nonzero'), i.restore());
	}
}
function Nl(i, t, e, s) {
	const n = t.chart.chartArea,
		{ property: o, start: r, end: a } = s || {};
	if (o === 'x' || o === 'y') {
		let l, c, h, d;
		(o === 'x' ? ((l = r), (c = n.top), (h = a), (d = n.bottom)) : ((l = n.left), (c = r), (h = n.right), (d = a)),
			i.beginPath(),
			e && ((l = Math.max(l, e.left)), (h = Math.min(h, e.right)), (c = Math.max(c, e.top)), (d = Math.min(d, e.bottom))),
			i.rect(l, c, h - l, d - c),
			i.clip());
	}
}
function ks(i, t, e, s) {
	const n = t.interpolate(e, s);
	n && i.lineTo(n.x, n.y);
}
var lc = {
	id: 'filler',
	afterDatasetsUpdate(i, t, e) {
		const s = (i.data.datasets || []).length,
			n = [];
		let o, r, a, l;
		for (r = 0; r < s; ++r)
			((o = i.getDatasetMeta(r)),
				(a = o.dataset),
				(l = null),
				a &&
					a.options &&
					a instanceof _i &&
					(l = {
						visible: i.isDatasetVisible(r),
						index: r,
						fill: wl(a, r, s),
						chart: i,
						axis: o.controller.options.indexAxis,
						scale: o.vScale,
						line: a
					}),
				(o.$filler = l),
				n.push(l));
		for (r = 0; r < s; ++r) ((l = n[r]), !(!l || l.fill === !1) && (l.fill = Sl(n, r, e.propagate)));
	},
	beforeDraw(i, t, e) {
		const s = e.drawTime === 'beforeDraw',
			n = i.getSortedVisibleDatasetMetas(),
			o = i.chartArea;
		for (let r = n.length - 1; r >= 0; --r) {
			const a = n[r].$filler;
			a && (a.line.updateControlPoints(o, a.axis), s && a.fill && Ye(i.ctx, a, o));
		}
	},
	beforeDatasetsDraw(i, t, e) {
		if (e.drawTime !== 'beforeDatasetsDraw') return;
		const s = i.getSortedVisibleDatasetMetas();
		for (let n = s.length - 1; n >= 0; --n) {
			const o = s[n].$filler;
			ys(o) && Ye(i.ctx, o, i.chartArea);
		}
	},
	beforeDatasetDraw(i, t, e) {
		const s = t.meta.$filler;
		!ys(s) || e.drawTime !== 'beforeDatasetDraw' || Ye(i.ctx, s, i.chartArea);
	},
	defaults: { propagate: !0, drawTime: 'beforeDatasetDraw' }
};
const Ht = {
	average(i) {
		if (!i.length) return !1;
		let t,
			e,
			s = new Set(),
			n = 0,
			o = 0;
		for (t = 0, e = i.length; t < e; ++t) {
			const a = i[t].element;
			if (a && a.hasValue()) {
				const l = a.tooltipPosition();
				(s.add(l.x), (n += l.y), ++o);
			}
		}
		return o === 0 || s.size === 0 ? !1 : { x: [...s].reduce((a, l) => a + l) / s.size, y: n / o };
	},
	nearest(i, t) {
		if (!i.length) return !1;
		let e = t.x,
			s = t.y,
			n = Number.POSITIVE_INFINITY,
			o,
			r,
			a;
		for (o = 0, r = i.length; o < r; ++o) {
			const l = i[o].element;
			if (l && l.hasValue()) {
				const c = l.getCenterPoint(),
					h = Ke(t, c);
				h < n && ((n = h), (a = l));
			}
		}
		if (a) {
			const l = a.tooltipPosition();
			((e = l.x), (s = l.y));
		}
		return { x: e, y: s };
	}
};
function Q(i, t) {
	return (t && (N(t) ? Array.prototype.push.apply(i, t) : i.push(t)), i);
}
function ot(i) {
	return (typeof i == 'string' || i instanceof String) &&
		i.indexOf(`
`) > -1
		? i.split(`
`)
		: i;
}
function Wl(i, t) {
	const { element: e, datasetIndex: s, index: n } = t,
		o = i.getDatasetMeta(s).controller,
		{ label: r, value: a } = o.getLabelAndValue(n);
	return {
		chart: i,
		label: r,
		parsed: o.getParsed(n),
		raw: i.data.datasets[s].data[n],
		formattedValue: a,
		dataset: o.getDataset(),
		dataIndex: n,
		datasetIndex: s,
		element: e
	};
}
function Ss(i, t) {
	const e = i.chart.ctx,
		{ body: s, footer: n, title: o } = i,
		{ boxWidth: r, boxHeight: a } = t,
		l = et(t.bodyFont),
		c = et(t.titleFont),
		h = et(t.footerFont),
		d = o.length,
		f = n.length,
		u = s.length,
		p = ut(t.padding);
	let g = p.height,
		m = 0,
		b = s.reduce((v, x) => v + x.before.length + x.lines.length + x.after.length, 0);
	if (((b += i.beforeBody.length + i.afterBody.length), d && (g += d * c.lineHeight + (d - 1) * t.titleSpacing + t.titleMarginBottom), b)) {
		const v = t.displayColors ? Math.max(a, l.lineHeight) : l.lineHeight;
		g += u * v + (b - u) * l.lineHeight + (b - 1) * t.bodySpacing;
	}
	f && (g += t.footerMarginTop + f * h.lineHeight + (f - 1) * t.footerSpacing);
	let _ = 0;
	const y = function (v) {
		m = Math.max(m, e.measureText(v).width + _);
	};
	return (
		e.save(),
		(e.font = c.string),
		C(i.title, y),
		(e.font = l.string),
		C(i.beforeBody.concat(i.afterBody), y),
		(_ = t.displayColors ? r + 2 + t.boxPadding : 0),
		C(s, (v) => {
			(C(v.before, y), C(v.lines, y), C(v.after, y));
		}),
		(_ = 0),
		(e.font = h.string),
		C(i.footer, y),
		e.restore(),
		(m += p.width),
		{ width: m, height: g }
	);
}
function jl(i, t) {
	const { y: e, height: s } = t;
	return e < s / 2 ? 'top' : e > i.height - s / 2 ? 'bottom' : 'center';
}
function Hl(i, t, e, s) {
	const { x: n, width: o } = s,
		r = e.caretSize + e.caretPadding;
	if ((i === 'left' && n + o + r > t.width) || (i === 'right' && n - o - r < 0)) return !0;
}
function $l(i, t, e, s) {
	const { x: n, width: o } = e,
		{
			width: r,
			chartArea: { left: a, right: l }
		} = i;
	let c = 'center';
	return (
		s === 'center' ? (c = n <= (a + l) / 2 ? 'left' : 'right') : n <= o / 2 ? (c = 'left') : n >= r - o / 2 && (c = 'right'),
		Hl(c, i, t, e) && (c = 'center'),
		c
	);
}
function ws(i, t, e) {
	const s = e.yAlign || t.yAlign || jl(i, e);
	return { xAlign: e.xAlign || t.xAlign || $l(i, t, e, s), yAlign: s };
}
function Yl(i, t) {
	let { x: e, width: s } = i;
	return (t === 'right' ? (e -= s) : t === 'center' && (e -= s / 2), e);
}
function Xl(i, t, e) {
	let { y: s, height: n } = i;
	return (t === 'top' ? (s += e) : t === 'bottom' ? (s -= n + e) : (s -= n / 2), s);
}
function Ps(i, t, e, s) {
	const { caretSize: n, caretPadding: o, cornerRadius: r } = i,
		{ xAlign: a, yAlign: l } = e,
		c = n + o,
		{ topLeft: h, topRight: d, bottomLeft: f, bottomRight: u } = Kt(r);
	let p = Yl(t, a);
	const g = Xl(t, l, c);
	return (
		l === 'center'
			? a === 'left'
				? (p += c)
				: a === 'right' && (p -= c)
			: a === 'left'
				? (p -= Math.max(h, f) + n)
				: a === 'right' && (p += Math.max(d, u) + n),
		{ x: H(p, 0, s.width - t.width), y: H(g, 0, s.height - t.height) }
	);
}
function be(i, t, e) {
	const s = ut(e.padding);
	return t === 'center' ? i.x + i.width / 2 : t === 'right' ? i.x + i.width - s.right : i.x + s.left;
}
function Ds(i) {
	return Q([], ot(i));
}
function Ul(i, t, e) {
	return wt(i, { tooltip: t, tooltipItems: e, type: 'tooltip' });
}
function Os(i, t) {
	const e = t && t.dataset && t.dataset.tooltip && t.dataset.tooltip.callbacks;
	return e ? i.override(e) : i;
}
const Sn = {
	beforeTitle: st,
	title(i) {
		if (i.length > 0) {
			const t = i[0],
				e = t.chart.data.labels,
				s = e ? e.length : 0;
			if (this && this.options && this.options.mode === 'dataset') return t.dataset.label || '';
			if (t.label) return t.label;
			if (s > 0 && t.dataIndex < s) return e[t.dataIndex];
		}
		return '';
	},
	afterTitle: st,
	beforeBody: st,
	beforeLabel: st,
	label(i) {
		if (this && this.options && this.options.mode === 'dataset') return i.label + ': ' + i.formattedValue || i.formattedValue;
		let t = i.dataset.label || '';
		t && (t += ': ');
		const e = i.formattedValue;
		return (O(e) || (t += e), t);
	},
	labelColor(i) {
		const e = i.chart.getDatasetMeta(i.datasetIndex).controller.getStyle(i.dataIndex);
		return {
			borderColor: e.borderColor,
			backgroundColor: e.backgroundColor,
			borderWidth: e.borderWidth,
			borderDash: e.borderDash,
			borderDashOffset: e.borderDashOffset,
			borderRadius: 0
		};
	},
	labelTextColor() {
		return this.options.bodyColor;
	},
	labelPointStyle(i) {
		const e = i.chart.getDatasetMeta(i.datasetIndex).controller.getStyle(i.dataIndex);
		return { pointStyle: e.pointStyle, rotation: e.rotation };
	},
	afterLabel: st,
	afterBody: st,
	beforeFooter: st,
	footer: st,
	afterFooter: st
};
function Y(i, t, e, s) {
	const n = i[t].call(e, s);
	return typeof n > 'u' ? Sn[t].call(e, s) : n;
}
class Cs extends Pt {
	static positioners = Ht;
	constructor(t) {
		(super(),
			(this.opacity = 0),
			(this._active = []),
			(this._eventPosition = void 0),
			(this._size = void 0),
			(this._cachedAnimations = void 0),
			(this._tooltipItems = []),
			(this.$animations = void 0),
			(this.$context = void 0),
			(this.chart = t.chart),
			(this.options = t.options),
			(this.dataPoints = void 0),
			(this.title = void 0),
			(this.beforeBody = void 0),
			(this.body = void 0),
			(this.afterBody = void 0),
			(this.footer = void 0),
			(this.xAlign = void 0),
			(this.yAlign = void 0),
			(this.x = void 0),
			(this.y = void 0),
			(this.height = void 0),
			(this.width = void 0),
			(this.caretX = void 0),
			(this.caretY = void 0),
			(this.labelColors = void 0),
			(this.labelPointStyles = void 0),
			(this.labelTextColors = void 0));
	}
	initialize(t) {
		((this.options = t), (this._cachedAnimations = void 0), (this.$context = void 0));
	}
	_resolveAnimations() {
		const t = this._cachedAnimations;
		if (t) return t;
		const e = this.chart,
			s = this.options.setContext(this.getContext()),
			n = s.enabled && e.options.animation && s.animations,
			o = new an(this.chart, n);
		return (n._cacheable && (this._cachedAnimations = Object.freeze(o)), o);
	}
	getContext() {
		return this.$context || (this.$context = Ul(this.chart.getContext(), this, this._tooltipItems));
	}
	getTitle(t, e) {
		const { callbacks: s } = e,
			n = Y(s, 'beforeTitle', this, t),
			o = Y(s, 'title', this, t),
			r = Y(s, 'afterTitle', this, t);
		let a = [];
		return ((a = Q(a, ot(n))), (a = Q(a, ot(o))), (a = Q(a, ot(r))), a);
	}
	getBeforeBody(t, e) {
		return Ds(Y(e.callbacks, 'beforeBody', this, t));
	}
	getBody(t, e) {
		const { callbacks: s } = e,
			n = [];
		return (
			C(t, (o) => {
				const r = { before: [], lines: [], after: [] },
					a = Os(s, o);
				(Q(r.before, ot(Y(a, 'beforeLabel', this, o))), Q(r.lines, Y(a, 'label', this, o)), Q(r.after, ot(Y(a, 'afterLabel', this, o))), n.push(r));
			}),
			n
		);
	}
	getAfterBody(t, e) {
		return Ds(Y(e.callbacks, 'afterBody', this, t));
	}
	getFooter(t, e) {
		const { callbacks: s } = e,
			n = Y(s, 'beforeFooter', this, t),
			o = Y(s, 'footer', this, t),
			r = Y(s, 'afterFooter', this, t);
		let a = [];
		return ((a = Q(a, ot(n))), (a = Q(a, ot(o))), (a = Q(a, ot(r))), a);
	}
	_createItems(t) {
		const e = this._active,
			s = this.chart.data,
			n = [],
			o = [],
			r = [];
		let a = [],
			l,
			c;
		for (l = 0, c = e.length; l < c; ++l) a.push(Wl(this.chart, e[l]));
		return (
			t.filter && (a = a.filter((h, d, f) => t.filter(h, d, f, s))),
			t.itemSort && (a = a.sort((h, d) => t.itemSort(h, d, s))),
			C(a, (h) => {
				const d = Os(t.callbacks, h);
				(n.push(Y(d, 'labelColor', this, h)), o.push(Y(d, 'labelPointStyle', this, h)), r.push(Y(d, 'labelTextColor', this, h)));
			}),
			(this.labelColors = n),
			(this.labelPointStyles = o),
			(this.labelTextColors = r),
			(this.dataPoints = a),
			a
		);
	}
	update(t, e) {
		const s = this.options.setContext(this.getContext()),
			n = this._active;
		let o,
			r = [];
		if (!n.length) this.opacity !== 0 && (o = { opacity: 0 });
		else {
			const a = Ht[s.position].call(this, n, this._eventPosition);
			((r = this._createItems(s)),
				(this.title = this.getTitle(r, s)),
				(this.beforeBody = this.getBeforeBody(r, s)),
				(this.body = this.getBody(r, s)),
				(this.afterBody = this.getAfterBody(r, s)),
				(this.footer = this.getFooter(r, s)));
			const l = (this._size = Ss(this, s)),
				c = Object.assign({}, a, l),
				h = ws(this.chart, s, c),
				d = Ps(s, c, h, this.chart);
			((this.xAlign = h.xAlign),
				(this.yAlign = h.yAlign),
				(o = { opacity: 1, x: d.x, y: d.y, width: l.width, height: l.height, caretX: a.x, caretY: a.y }));
		}
		((this._tooltipItems = r),
			(this.$context = void 0),
			o && this._resolveAnimations().update(this, o),
			t && s.external && s.external.call(this, { chart: this.chart, tooltip: this, replay: e }));
	}
	drawCaret(t, e, s, n) {
		const o = this.getCaretPosition(t, s, n);
		(e.lineTo(o.x1, o.y1), e.lineTo(o.x2, o.y2), e.lineTo(o.x3, o.y3));
	}
	getCaretPosition(t, e, s) {
		const { xAlign: n, yAlign: o } = this,
			{ caretSize: r, cornerRadius: a } = s,
			{ topLeft: l, topRight: c, bottomLeft: h, bottomRight: d } = Kt(a),
			{ x: f, y: u } = t,
			{ width: p, height: g } = e;
		let m, b, _, y, v, x;
		return (
			o === 'center'
				? ((v = u + g / 2),
					n === 'left' ? ((m = f), (b = m - r), (y = v + r), (x = v - r)) : ((m = f + p), (b = m + r), (y = v - r), (x = v + r)),
					(_ = m))
				: (n === 'left' ? (b = f + Math.max(l, h) + r) : n === 'right' ? (b = f + p - Math.max(c, d) - r) : (b = this.caretX),
					o === 'top' ? ((y = u), (v = y - r), (m = b - r), (_ = b + r)) : ((y = u + g), (v = y + r), (m = b + r), (_ = b - r)),
					(x = y)),
			{ x1: m, x2: b, x3: _, y1: y, y2: v, y3: x }
		);
	}
	drawTitle(t, e, s) {
		const n = this.title,
			o = n.length;
		let r, a, l;
		if (o) {
			const c = Fe(s.rtl, this.x, this.width);
			for (
				t.x = be(this, s.titleAlign, s),
					e.textAlign = c.textAlign(s.titleAlign),
					e.textBaseline = 'middle',
					r = et(s.titleFont),
					a = s.titleSpacing,
					e.fillStyle = s.titleColor,
					e.font = r.string,
					l = 0;
				l < o;
				++l
			)
				(e.fillText(n[l], c.x(t.x), t.y + r.lineHeight / 2), (t.y += r.lineHeight + a), l + 1 === o && (t.y += s.titleMarginBottom - a));
		}
	}
	_drawColorBox(t, e, s, n, o) {
		const r = this.labelColors[s],
			a = this.labelPointStyles[s],
			{ boxHeight: l, boxWidth: c } = o,
			h = et(o.bodyFont),
			d = be(this, 'left', o),
			f = n.x(d),
			u = l < h.lineHeight ? (h.lineHeight - l) / 2 : 0,
			p = e.y + u;
		if (o.usePointStyle) {
			const g = { radius: Math.min(c, l) / 2, pointStyle: a.pointStyle, rotation: a.rotation, borderWidth: 1 },
				m = n.leftForLtr(f, c) + c / 2,
				b = p + l / 2;
			((t.strokeStyle = o.multiKeyBackground),
				(t.fillStyle = o.multiKeyBackground),
				Ge(t, g, m, b),
				(t.strokeStyle = r.borderColor),
				(t.fillStyle = r.backgroundColor),
				Ge(t, g, m, b));
		} else {
			((t.lineWidth = P(r.borderWidth) ? Math.max(...Object.values(r.borderWidth)) : r.borderWidth || 1),
				(t.strokeStyle = r.borderColor),
				t.setLineDash(r.borderDash || []),
				(t.lineDashOffset = r.borderDashOffset || 0));
			const g = n.leftForLtr(f, c),
				m = n.leftForLtr(n.xPlus(f, 1), c - 2),
				b = Kt(r.borderRadius);
			Object.values(b).some((_) => _ !== 0)
				? (t.beginPath(),
					(t.fillStyle = o.multiKeyBackground),
					Ze(t, { x: g, y: p, w: c, h: l, radius: b }),
					t.fill(),
					t.stroke(),
					(t.fillStyle = r.backgroundColor),
					t.beginPath(),
					Ze(t, { x: m, y: p + 1, w: c - 2, h: l - 2, radius: b }),
					t.fill())
				: ((t.fillStyle = o.multiKeyBackground),
					t.fillRect(g, p, c, l),
					t.strokeRect(g, p, c, l),
					(t.fillStyle = r.backgroundColor),
					t.fillRect(m, p + 1, c - 2, l - 2));
		}
		t.fillStyle = this.labelTextColors[s];
	}
	drawBody(t, e, s) {
		const { body: n } = this,
			{ bodySpacing: o, bodyAlign: r, displayColors: a, boxHeight: l, boxWidth: c, boxPadding: h } = s,
			d = et(s.bodyFont);
		let f = d.lineHeight,
			u = 0;
		const p = Fe(s.rtl, this.x, this.width),
			g = function (S) {
				(e.fillText(S, p.x(t.x + u), t.y + f / 2), (t.y += f + o));
			},
			m = p.textAlign(r);
		let b, _, y, v, x, k, M;
		for (
			e.textAlign = r,
				e.textBaseline = 'middle',
				e.font = d.string,
				t.x = be(this, m, s),
				e.fillStyle = s.bodyColor,
				C(this.beforeBody, g),
				u = a && m !== 'right' ? (r === 'center' ? c / 2 + h : c + 2 + h) : 0,
				v = 0,
				k = n.length;
			v < k;
			++v
		) {
			for (
				b = n[v],
					_ = this.labelTextColors[v],
					e.fillStyle = _,
					C(b.before, g),
					y = b.lines,
					a && y.length && (this._drawColorBox(e, t, v, p, s), (f = Math.max(d.lineHeight, l))),
					x = 0,
					M = y.length;
				x < M;
				++x
			)
				(g(y[x]), (f = d.lineHeight));
			C(b.after, g);
		}
		((u = 0), (f = d.lineHeight), C(this.afterBody, g), (t.y -= o));
	}
	drawFooter(t, e, s) {
		const n = this.footer,
			o = n.length;
		let r, a;
		if (o) {
			const l = Fe(s.rtl, this.x, this.width);
			for (
				t.x = be(this, s.footerAlign, s),
					t.y += s.footerMarginTop,
					e.textAlign = l.textAlign(s.footerAlign),
					e.textBaseline = 'middle',
					r = et(s.footerFont),
					e.fillStyle = s.footerColor,
					e.font = r.string,
					a = 0;
				a < o;
				++a
			)
				(e.fillText(n[a], l.x(t.x), t.y + r.lineHeight / 2), (t.y += r.lineHeight + s.footerSpacing));
		}
	}
	drawBackground(t, e, s, n) {
		const { xAlign: o, yAlign: r } = this,
			{ x: a, y: l } = t,
			{ width: c, height: h } = s,
			{ topLeft: d, topRight: f, bottomLeft: u, bottomRight: p } = Kt(n.cornerRadius);
		((e.fillStyle = n.backgroundColor),
			(e.strokeStyle = n.borderColor),
			(e.lineWidth = n.borderWidth),
			e.beginPath(),
			e.moveTo(a + d, l),
			r === 'top' && this.drawCaret(t, e, s, n),
			e.lineTo(a + c - f, l),
			e.quadraticCurveTo(a + c, l, a + c, l + f),
			r === 'center' && o === 'right' && this.drawCaret(t, e, s, n),
			e.lineTo(a + c, l + h - p),
			e.quadraticCurveTo(a + c, l + h, a + c - p, l + h),
			r === 'bottom' && this.drawCaret(t, e, s, n),
			e.lineTo(a + u, l + h),
			e.quadraticCurveTo(a, l + h, a, l + h - u),
			r === 'center' && o === 'left' && this.drawCaret(t, e, s, n),
			e.lineTo(a, l + d),
			e.quadraticCurveTo(a, l, a + d, l),
			e.closePath(),
			e.fill(),
			n.borderWidth > 0 && e.stroke());
	}
	_updateAnimationTarget(t) {
		const e = this.chart,
			s = this.$animations,
			n = s && s.x,
			o = s && s.y;
		if (n || o) {
			const r = Ht[t.position].call(this, this._active, this._eventPosition);
			if (!r) return;
			const a = (this._size = Ss(this, t)),
				l = Object.assign({}, r, this._size),
				c = ws(e, t, l),
				h = Ps(t, l, c, e);
			(n._to !== h.x || o._to !== h.y) &&
				((this.xAlign = c.xAlign),
				(this.yAlign = c.yAlign),
				(this.width = a.width),
				(this.height = a.height),
				(this.caretX = r.x),
				(this.caretY = r.y),
				this._resolveAnimations().update(this, h));
		}
	}
	_willRender() {
		return !!this.opacity;
	}
	draw(t) {
		const e = this.options.setContext(this.getContext());
		let s = this.opacity;
		if (!s) return;
		this._updateAnimationTarget(e);
		const n = { width: this.width, height: this.height },
			o = { x: this.x, y: this.y };
		s = Math.abs(s) < 0.001 ? 0 : s;
		const r = ut(e.padding),
			a = this.title.length || this.beforeBody.length || this.body.length || this.afterBody.length || this.footer.length;
		e.enabled &&
			a &&
			(t.save(),
			(t.globalAlpha = s),
			this.drawBackground(o, t, n, e),
			dr(t, e.textDirection),
			(o.y += r.top),
			this.drawTitle(o, t, e),
			this.drawBody(o, t, e),
			this.drawFooter(o, t, e),
			fr(t, e.textDirection),
			t.restore());
	}
	getActiveElements() {
		return this._active || [];
	}
	setActiveElements(t, e) {
		const s = this._active,
			n = t.map(({ datasetIndex: a, index: l }) => {
				const c = this.chart.getDatasetMeta(a);
				if (!c) throw new Error('Cannot find a dataset at index ' + a);
				return { datasetIndex: a, element: c.data[l], index: l };
			}),
			o = !ve(s, n),
			r = this._positionChanged(n, e);
		(o || r) && ((this._active = n), (this._eventPosition = e), (this._ignoreReplayEvents = !0), this.update(!0));
	}
	handleEvent(t, e, s = !0) {
		if (e && this._ignoreReplayEvents) return !1;
		this._ignoreReplayEvents = !1;
		const n = this.options,
			o = this._active || [],
			r = this._getActiveElements(t, o, e, s),
			a = this._positionChanged(r, t),
			l = e || !ve(r, o) || a;
		return (l && ((this._active = r), (n.enabled || n.external) && ((this._eventPosition = { x: t.x, y: t.y }), this.update(!0, e))), l);
	}
	_getActiveElements(t, e, s, n) {
		const o = this.options;
		if (t.type === 'mouseout') return [];
		if (!n)
			return e.filter(
				(a) => this.chart.data.datasets[a.datasetIndex] && this.chart.getDatasetMeta(a.datasetIndex).controller.getParsed(a.index) !== void 0
			);
		const r = this.chart.getElementsAtEventForMode(t, o.mode, o, s);
		return (o.reverse && r.reverse(), r);
	}
	_positionChanged(t, e) {
		const { caretX: s, caretY: n, options: o } = this,
			r = Ht[o.position].call(this, t, e);
		return r !== !1 && (s !== r.x || n !== r.y);
	}
}
var cc = {
	id: 'tooltip',
	_element: Cs,
	positioners: Ht,
	afterInit(i, t, e) {
		e && (i.tooltip = new Cs({ chart: i, options: e }));
	},
	beforeUpdate(i, t, e) {
		i.tooltip && i.tooltip.initialize(e);
	},
	reset(i, t, e) {
		i.tooltip && i.tooltip.initialize(e);
	},
	afterDraw(i) {
		const t = i.tooltip;
		if (t && t._willRender()) {
			const e = { tooltip: t };
			if (i.notifyPlugins('beforeTooltipDraw', { ...e, cancelable: !0 }) === !1) return;
			(t.draw(i.ctx), i.notifyPlugins('afterTooltipDraw', e));
		}
	},
	afterEvent(i, t) {
		if (i.tooltip) {
			const e = t.replay;
			i.tooltip.handleEvent(t.event, e, t.inChartArea) && (t.changed = !0);
		}
	},
	defaults: {
		enabled: !0,
		external: null,
		position: 'average',
		backgroundColor: 'rgba(0,0,0,0.8)',
		titleColor: '#fff',
		titleFont: { weight: 'bold' },
		titleSpacing: 2,
		titleMarginBottom: 6,
		titleAlign: 'left',
		bodyColor: '#fff',
		bodySpacing: 2,
		bodyFont: {},
		bodyAlign: 'left',
		footerColor: '#fff',
		footerSpacing: 2,
		footerMarginTop: 6,
		footerFont: { weight: 'bold' },
		footerAlign: 'left',
		padding: 6,
		caretPadding: 2,
		caretSize: 5,
		cornerRadius: 6,
		boxHeight: (i, t) => t.bodyFont.size,
		boxWidth: (i, t) => t.bodyFont.size,
		multiKeyBackground: '#fff',
		displayColors: !0,
		boxPadding: 0,
		borderColor: 'rgba(0,0,0,0)',
		borderWidth: 0,
		animation: { duration: 400, easing: 'easeOutQuart' },
		animations: {
			numbers: { type: 'number', properties: ['x', 'y', 'width', 'height', 'caretX', 'caretY'] },
			opacity: { easing: 'linear', duration: 200 }
		},
		callbacks: Sn
	},
	defaultRoutes: { bodyFont: 'font', footerFont: 'font', titleFont: 'font' },
	descriptors: {
		_scriptable: (i) => i !== 'filter' && i !== 'itemSort' && i !== 'external',
		_indexable: !1,
		callbacks: { _scriptable: !1, _indexable: !1 },
		animation: { _fallback: !1 },
		animations: { _fallback: 'animation' }
	},
	additionalOptionScopes: ['interaction']
};
const Kl = (i, t, e, s) => (typeof t == 'string' ? ((e = i.push(t) - 1), s.unshift({ index: e, label: t })) : isNaN(t) && (e = null), e);
function ql(i, t, e, s) {
	const n = i.indexOf(t);
	if (n === -1) return Kl(i, t, e, s);
	const o = i.lastIndexOf(t);
	return n !== o ? e : n;
}
const Gl = (i, t) => (i === null ? null : H(Math.round(i), 0, t));
function As(i) {
	const t = this.getLabels();
	return i >= 0 && i < t.length ? t[i] : i;
}
class hc extends Lt {
	static id = 'category';
	static defaults = { ticks: { callback: As } };
	constructor(t) {
		(super(t), (this._startValue = void 0), (this._valueRange = 0), (this._addedLabels = []));
	}
	init(t) {
		const e = this._addedLabels;
		if (e.length) {
			const s = this.getLabels();
			for (const { index: n, label: o } of e) s[n] === o && s.splice(n, 1);
			this._addedLabels = [];
		}
		super.init(t);
	}
	parse(t, e) {
		if (O(t)) return null;
		const s = this.getLabels();
		return ((e = isFinite(e) && s[e] === t ? e : ql(s, t, D(e, t), this._addedLabels)), Gl(e, s.length - 1));
	}
	determineDataLimits() {
		const { minDefined: t, maxDefined: e } = this.getUserBounds();
		let { min: s, max: n } = this.getMinMax(!0);
		(this.options.bounds === 'ticks' && (t || (s = 0), e || (n = this.getLabels().length - 1)), (this.min = s), (this.max = n));
	}
	buildTicks() {
		const t = this.min,
			e = this.max,
			s = this.options.offset,
			n = [];
		let o = this.getLabels();
		((o = t === 0 && e === o.length - 1 ? o : o.slice(t, e + 1)),
			(this._valueRange = Math.max(o.length - (s ? 0 : 1), 1)),
			(this._startValue = this.min - (s ? 0.5 : 0)));
		for (let r = t; r <= e; r++) n.push({ value: r });
		return n;
	}
	getLabelForValue(t) {
		return As.call(this, t);
	}
	configure() {
		(super.configure(), this.isHorizontal() || (this._reversePixels = !this._reversePixels));
	}
	getPixelForValue(t) {
		return (typeof t != 'number' && (t = this.parse(t)), t === null ? NaN : this.getPixelForDecimal((t - this._startValue) / this._valueRange));
	}
	getPixelForTick(t) {
		const e = this.ticks;
		return t < 0 || t > e.length - 1 ? null : this.getPixelForValue(e[t].value);
	}
	getValueForPixel(t) {
		return Math.round(this._startValue + this.getDecimalForPixel(t) * this._valueRange);
	}
	getBasePixel() {
		return this.bottom;
	}
}
function Zl(i, t) {
	const e = [],
		{ bounds: n, step: o, min: r, max: a, precision: l, count: c, maxTicks: h, maxDigits: d, includeBounds: f } = i,
		u = o || 1,
		p = h - 1,
		{ min: g, max: m } = t,
		b = !O(r),
		_ = !O(a),
		y = !O(c),
		v = (m - g) / (d + 1);
	let x = Pi((m - g) / p / u) * u,
		k,
		M,
		S,
		w;
	if (x < 1e-14 && !b && !_) return [{ value: g }, { value: m }];
	((w = Math.ceil(m / x) - Math.floor(g / x)),
		w > p && (x = Pi((w * x) / p / u) * u),
		O(l) || ((k = Math.pow(10, l)), (x = Math.ceil(x * k) / k)),
		n === 'ticks' ? ((M = Math.floor(g / x) * x), (S = Math.ceil(m / x) * x)) : ((M = g), (S = m)),
		b && _ && o && no((a - r) / o, x / 1e3)
			? ((w = Math.round(Math.min((a - r) / x, h))), (x = (a - r) / w), (M = r), (S = a))
			: y
				? ((M = b ? r : M), (S = _ ? a : S), (w = c - 1), (x = (S - M) / w))
				: ((w = (S - M) / x), Yt(w, Math.round(w), x / 1e3) ? (w = Math.round(w)) : (w = Math.ceil(w))));
	const A = Math.max(Di(x), Di(M));
	((k = Math.pow(10, O(l) ? A : l)), (M = Math.round(M * k) / k), (S = Math.round(S * k) / k));
	let L = 0;
	for (
		b && (f && M !== r ? (e.push({ value: r }), M < r && L++, Yt(Math.round((M + L * x) * k) / k, r, Ts(r, v, i)) && L++) : M < r && L++);
		L < w;
		++L
	) {
		const F = Math.round((M + L * x) * k) / k;
		if (_ && F > a) break;
		e.push({ value: F });
	}
	return (
		_ && f && S !== a
			? e.length && Yt(e[e.length - 1].value, a, Ts(a, v, i))
				? (e[e.length - 1].value = a)
				: e.push({ value: a })
			: (!_ || S === a) && e.push({ value: S }),
		e
	);
}
function Ts(i, t, { horizontal: e, minRotation: s }) {
	const n = at(s),
		o = (e ? Math.sin(n) : Math.cos(n)) || 0.001,
		r = 0.75 * t * ('' + i).length;
	return Math.min(t / o, r);
}
class Jl extends Lt {
	constructor(t) {
		(super(t), (this.start = void 0), (this.end = void 0), (this._startValue = void 0), (this._endValue = void 0), (this._valueRange = 0));
	}
	parse(t, e) {
		return O(t) || ((typeof t == 'number' || t instanceof Number) && !isFinite(+t)) ? null : +t;
	}
	handleTickRangeOptions() {
		const { beginAtZero: t } = this.options,
			{ minDefined: e, maxDefined: s } = this.getUserBounds();
		let { min: n, max: o } = this;
		const r = (l) => (n = e ? n : l),
			a = (l) => (o = s ? o : l);
		if (t) {
			const l = it(n),
				c = it(o);
			l < 0 && c < 0 ? a(0) : l > 0 && c > 0 && r(0);
		}
		if (n === o) {
			let l = o === 0 ? 1 : Math.abs(o * 0.05);
			(a(o + l), t || r(n - l));
		}
		((this.min = n), (this.max = o));
	}
	getTickLimit() {
		const t = this.options.ticks;
		let { maxTicksLimit: e, stepSize: s } = t,
			n;
		return (
			s
				? ((n = Math.ceil(this.max / s) - Math.floor(this.min / s) + 1),
					n > 1e3 && (console.warn(`scales.${this.id}.ticks.stepSize: ${s} would result generating up to ${n} ticks. Limiting to 1000.`), (n = 1e3)))
				: ((n = this.computeTickLimit()), (e = e || 11)),
			e && (n = Math.min(e, n)),
			n
		);
	}
	computeTickLimit() {
		return Number.POSITIVE_INFINITY;
	}
	buildTicks() {
		const t = this.options,
			e = t.ticks;
		let s = this.getTickLimit();
		s = Math.max(2, s);
		const n = {
				maxTicks: s,
				bounds: t.bounds,
				min: t.min,
				max: t.max,
				precision: e.precision,
				step: e.stepSize,
				count: e.count,
				maxDigits: this._maxDigits(),
				horizontal: this.isHorizontal(),
				minRotation: e.minRotation || 0,
				includeBounds: e.includeBounds !== !1
			},
			o = this._range || this,
			r = Zl(n, o);
		return (
			t.bounds === 'ticks' && oo(r, this, 'value'),
			t.reverse ? (r.reverse(), (this.start = this.max), (this.end = this.min)) : ((this.start = this.min), (this.end = this.max)),
			r
		);
	}
	configure() {
		const t = this.ticks;
		let e = this.min,
			s = this.max;
		if ((super.configure(), this.options.offset && t.length)) {
			const n = (s - e) / Math.max(t.length - 1, 1) / 2;
			((e -= n), (s += n));
		}
		((this._startValue = e), (this._endValue = s), (this._valueRange = s - e));
	}
	getLabelForValue(t) {
		return li(t, this.chart.options.locale, this.options.ticks.format);
	}
}
class dc extends Jl {
	static id = 'linear';
	static defaults = { ticks: { callback: qs.formatters.numeric } };
	determineDataLimits() {
		const { min: t, max: e } = this.getMinMax(!0);
		((this.min = $(t) ? t : 0), (this.max = $(e) ? e : 1), this.handleTickRangeOptions());
	}
	computeTickLimit() {
		const t = this.isHorizontal(),
			e = t ? this.width : this.height,
			s = at(this.options.ticks.minRotation),
			n = (t ? Math.sin(s) : Math.cos(s)) || 0.001,
			o = this._resolveTickFontOptions(0);
		return Math.ceil(e / Math.min(40, o.lineHeight / n));
	}
	getPixelForValue(t) {
		return t === null ? NaN : this.getPixelForDecimal((t - this._startValue) / this._valueRange);
	}
	getValueForPixel(t) {
		return this._startValue + this.getDecimalForPixel(t) * this._valueRange;
	}
}
const Te = {
		millisecond: { common: !0, size: 1, steps: 1e3 },
		second: { common: !0, size: 1e3, steps: 60 },
		minute: { common: !0, size: 6e4, steps: 60 },
		hour: { common: !0, size: 36e5, steps: 24 },
		day: { common: !0, size: 864e5, steps: 30 },
		week: { common: !1, size: 6048e5, steps: 4 },
		month: { common: !0, size: 2628e6, steps: 12 },
		quarter: { common: !1, size: 7884e6, steps: 4 },
		year: { common: !0, size: 3154e7 }
	},
	X = Object.keys(Te);
function Rs(i, t) {
	return i - t;
}
function Ls(i, t) {
	if (O(t)) return null;
	const e = i._adapter,
		{ parser: s, round: n, isoWeekday: o } = i._parseOpts;
	let r = t;
	return (
		typeof s == 'function' && (r = s(r)),
		$(r) || (r = typeof s == 'string' ? e.parse(r, s) : e.parse(r)),
		r === null ? null : (n && (r = n === 'week' && (Jt(o) || o === !0) ? e.startOf(r, 'isoWeek', o) : e.startOf(r, n)), +r)
	);
}
function Is(i, t, e, s) {
	const n = X.length;
	for (let o = X.indexOf(i); o < n - 1; ++o) {
		const r = Te[X[o]],
			a = r.steps ? r.steps : Number.MAX_SAFE_INTEGER;
		if (r.common && Math.ceil((e - t) / (a * r.size)) <= s) return X[o];
	}
	return X[n - 1];
}
function Ql(i, t, e, s, n) {
	for (let o = X.length - 1; o >= X.indexOf(e); o--) {
		const r = X[o];
		if (Te[r].common && i._adapter.diff(n, s, r) >= t - 1) return r;
	}
	return X[e ? X.indexOf(e) : 0];
}
function tc(i) {
	for (let t = X.indexOf(i) + 1, e = X.length; t < e; ++t) if (Te[X[t]].common) return X[t];
}
function Fs(i, t, e) {
	if (!e) i[t] = !0;
	else if (e.length) {
		const { lo: s, hi: n } = ri(e, t),
			o = e[s] >= t ? e[s] : e[n];
		i[o] = !0;
	}
}
function ec(i, t, e, s) {
	const n = i._adapter,
		o = +n.startOf(t[0].value, s),
		r = t[t.length - 1].value;
	let a, l;
	for (a = o; a <= r; a = +n.add(a, 1, s)) ((l = e[a]), l >= 0 && (t[l].major = !0));
	return t;
}
function Es(i, t, e) {
	const s = [],
		n = {},
		o = t.length;
	let r, a;
	for (r = 0; r < o; ++r) ((a = t[r]), (n[a] = r), s.push({ value: a, major: !1 }));
	return o === 0 || !e ? s : ec(i, s, n, e);
}
class zs extends Lt {
	static id = 'time';
	static defaults = {
		bounds: 'data',
		adapters: {},
		time: { parser: !1, unit: !1, round: !1, isoWeekday: !1, minUnit: 'millisecond', displayFormats: {} },
		ticks: { source: 'auto', callback: !1, major: { enabled: !1 } }
	};
	constructor(t) {
		(super(t),
			(this._cache = { data: [], labels: [], all: [] }),
			(this._unit = 'day'),
			(this._majorUnit = void 0),
			(this._offsets = {}),
			(this._normalized = !1),
			(this._parseOpts = void 0));
	}
	init(t, e = {}) {
		const s = t.time || (t.time = {}),
			n = (this._adapter = new Xr._date(t.adapters.date));
		(n.init(e),
			$t(s.displayFormats, n.formats()),
			(this._parseOpts = { parser: s.parser, round: s.round, isoWeekday: s.isoWeekday }),
			super.init(t),
			(this._normalized = e.normalized));
	}
	parse(t, e) {
		return t === void 0 ? null : Ls(this, t);
	}
	beforeLayout() {
		(super.beforeLayout(), (this._cache = { data: [], labels: [], all: [] }));
	}
	determineDataLimits() {
		const t = this.options,
			e = this._adapter,
			s = t.time.unit || 'day';
		let { min: n, max: o, minDefined: r, maxDefined: a } = this.getUserBounds();
		function l(c) {
			(!r && !isNaN(c.min) && (n = Math.min(n, c.min)), !a && !isNaN(c.max) && (o = Math.max(o, c.max)));
		}
		((!r || !a) && (l(this._getLabelBounds()), (t.bounds !== 'ticks' || t.ticks.source !== 'labels') && l(this.getMinMax(!1))),
			(n = $(n) && !isNaN(n) ? n : +e.startOf(Date.now(), s)),
			(o = $(o) && !isNaN(o) ? o : +e.endOf(Date.now(), s) + 1),
			(this.min = Math.min(n, o - 1)),
			(this.max = Math.max(n + 1, o)));
	}
	_getLabelBounds() {
		const t = this.getLabelTimestamps();
		let e = Number.POSITIVE_INFINITY,
			s = Number.NEGATIVE_INFINITY;
		return (t.length && ((e = t[0]), (s = t[t.length - 1])), { min: e, max: s });
	}
	buildTicks() {
		const t = this.options,
			e = t.time,
			s = t.ticks,
			n = s.source === 'labels' ? this.getLabelTimestamps() : this._generate();
		t.bounds === 'ticks' && n.length && ((this.min = this._userMin || n[0]), (this.max = this._userMax || n[n.length - 1]));
		const o = this.min,
			r = this.max,
			a = ho(n, o, r);
		return (
			(this._unit =
				e.unit || (s.autoSkip ? Is(e.minUnit, this.min, this.max, this._getLabelCapacity(o)) : Ql(this, a.length, e.minUnit, this.min, this.max))),
			(this._majorUnit = !s.major.enabled || this._unit === 'year' ? void 0 : tc(this._unit)),
			this.initOffsets(n),
			t.reverse && a.reverse(),
			Es(this, a, this._majorUnit)
		);
	}
	afterAutoSkip() {
		this.options.offsetAfterAutoskip && this.initOffsets(this.ticks.map((t) => +t.value));
	}
	initOffsets(t = []) {
		let e = 0,
			s = 0,
			n,
			o;
		this.options.offset &&
			t.length &&
			((n = this.getDecimalForValue(t[0])),
			t.length === 1 ? (e = 1 - n) : (e = (this.getDecimalForValue(t[1]) - n) / 2),
			(o = this.getDecimalForValue(t[t.length - 1])),
			t.length === 1 ? (s = o) : (s = (o - this.getDecimalForValue(t[t.length - 2])) / 2));
		const r = t.length < 3 ? 0.5 : 0.25;
		((e = H(e, 0, r)), (s = H(s, 0, r)), (this._offsets = { start: e, end: s, factor: 1 / (e + 1 + s) }));
	}
	_generate() {
		const t = this._adapter,
			e = this.min,
			s = this.max,
			n = this.options,
			o = n.time,
			r = o.unit || Is(o.minUnit, e, s, this._getLabelCapacity(e)),
			a = D(n.ticks.stepSize, 1),
			l = r === 'week' ? o.isoWeekday : !1,
			c = Jt(l) || l === !0,
			h = {};
		let d = e,
			f,
			u;
		if ((c && (d = +t.startOf(d, 'isoWeek', l)), (d = +t.startOf(d, c ? 'day' : r)), t.diff(s, e, r) > 1e5 * a))
			throw new Error(e + ' and ' + s + ' are too far apart with stepSize of ' + a + ' ' + r);
		const p = n.ticks.source === 'data' && this.getDataTimestamps();
		for (f = d, u = 0; f < s; f = +t.add(f, a, r), u++) Fs(h, f, p);
		return (
			(f === s || n.bounds === 'ticks' || u === 1) && Fs(h, f, p),
			Object.keys(h)
				.sort(Rs)
				.map((g) => +g)
		);
	}
	getLabelForValue(t) {
		const e = this._adapter,
			s = this.options.time;
		return s.tooltipFormat ? e.format(t, s.tooltipFormat) : e.format(t, s.displayFormats.datetime);
	}
	format(t, e) {
		const n = this.options.time.displayFormats,
			o = this._unit,
			r = e || n[o];
		return this._adapter.format(t, r);
	}
	_tickFormatFunction(t, e, s, n) {
		const o = this.options,
			r = o.ticks.callback;
		if (r) return B(r, [t, e, s], this);
		const a = o.time.displayFormats,
			l = this._unit,
			c = this._majorUnit,
			h = l && a[l],
			d = c && a[c],
			f = s[e],
			u = c && d && f && f.major;
		return this._adapter.format(t, n || (u ? d : h));
	}
	generateTickLabels(t) {
		let e, s, n;
		for (e = 0, s = t.length; e < s; ++e) ((n = t[e]), (n.label = this._tickFormatFunction(n.value, e, t)));
	}
	getDecimalForValue(t) {
		return t === null ? NaN : (t - this.min) / (this.max - this.min);
	}
	getPixelForValue(t) {
		const e = this._offsets,
			s = this.getDecimalForValue(t);
		return this.getPixelForDecimal((e.start + s) * e.factor);
	}
	getValueForPixel(t) {
		const e = this._offsets,
			s = this.getDecimalForPixel(t) / e.factor - e.end;
		return this.min + s * (this.max - this.min);
	}
	_getLabelSize(t) {
		const e = this.options.ticks,
			s = this.ctx.measureText(t).width,
			n = at(this.isHorizontal() ? e.maxRotation : e.minRotation),
			o = Math.cos(n),
			r = Math.sin(n),
			a = this._resolveTickFontOptions(0).size;
		return { w: s * o + a * r, h: s * r + a * o };
	}
	_getLabelCapacity(t) {
		const e = this.options.time,
			s = e.displayFormats,
			n = s[e.unit] || s.millisecond,
			o = this._tickFormatFunction(t, 0, Es(this, [t], this._majorUnit), n),
			r = this._getLabelSize(o),
			a = Math.floor(this.isHorizontal() ? this.width / r.w : this.height / r.h) - 1;
		return a > 0 ? a : 1;
	}
	getDataTimestamps() {
		let t = this._cache.data || [],
			e,
			s;
		if (t.length) return t;
		const n = this.getMatchingVisibleMetas();
		if (this._normalized && n.length) return (this._cache.data = n[0].controller.getAllParsedValues(this));
		for (e = 0, s = n.length; e < s; ++e) t = t.concat(n[e].controller.getAllParsedValues(this));
		return (this._cache.data = this.normalize(t));
	}
	getLabelTimestamps() {
		const t = this._cache.labels || [];
		let e, s;
		if (t.length) return t;
		const n = this.getLabels();
		for (e = 0, s = n.length; e < s; ++e) t.push(Ls(this, n[e]));
		return (this._cache.labels = this._normalized ? t : this.normalize(t));
	}
	normalize(t) {
		return Xs(t.sort(Rs));
	}
}
function _e(i, t, e) {
	let s = 0,
		n = i.length - 1,
		o,
		r,
		a,
		l;
	e
		? (t >= i[s].pos && t <= i[n].pos && ({ lo: s, hi: n } = vt(i, 'pos', t)), ({ pos: o, time: a } = i[s]), ({ pos: r, time: l } = i[n]))
		: (t >= i[s].time && t <= i[n].time && ({ lo: s, hi: n } = vt(i, 'time', t)), ({ time: o, pos: a } = i[s]), ({ time: r, pos: l } = i[n]));
	const c = r - o;
	return c ? a + ((l - a) * (t - o)) / c : a;
}
class fc extends zs {
	static id = 'timeseries';
	static defaults = zs.defaults;
	constructor(t) {
		(super(t), (this._table = []), (this._minPos = void 0), (this._tableRange = void 0));
	}
	initOffsets() {
		const t = this._getTimestampsForTable(),
			e = (this._table = this.buildLookupTable(t));
		((this._minPos = _e(e, this.min)), (this._tableRange = _e(e, this.max) - this._minPos), super.initOffsets(t));
	}
	buildLookupTable(t) {
		const { min: e, max: s } = this,
			n = [],
			o = [];
		let r, a, l, c, h;
		for (r = 0, a = t.length; r < a; ++r) ((c = t[r]), c >= e && c <= s && n.push(c));
		if (n.length < 2)
			return [
				{ time: e, pos: 0 },
				{ time: s, pos: 1 }
			];
		for (r = 0, a = n.length; r < a; ++r)
			((h = n[r + 1]), (l = n[r - 1]), (c = n[r]), Math.round((h + l) / 2) !== c && o.push({ time: c, pos: r / (a - 1) }));
		return o;
	}
	_generate() {
		const t = this.min,
			e = this.max;
		let s = super.getDataTimestamps();
		return ((!s.includes(t) || !s.length) && s.splice(0, 0, t), (!s.includes(e) || s.length === 1) && s.push(e), s.sort((n, o) => n - o));
	}
	_getTimestampsForTable() {
		let t = this._cache.all || [];
		if (t.length) return t;
		const e = this.getDataTimestamps(),
			s = this.getLabelTimestamps();
		return (e.length && s.length ? (t = this.normalize(e.concat(s))) : (t = e.length ? e : s), (t = this._cache.all = t), t);
	}
	getDecimalForValue(t) {
		return (_e(this._table, t) - this._minPos) / this._tableRange;
	}
	getValueForPixel(t) {
		const e = this._offsets,
			s = this.getDecimalForPixel(t) / e.factor - e.end;
		return _e(this._table, s * this._tableRange + this._minPos, !0);
	}
}
export { oc as A, ic as B, el as C, dc as L, nc as P, ac as a, hc as b, Xr as c, sc as d, rc as e, _i as f, lc as i, cc as p };
//# sourceMappingURL=C4Hx6_Ca.js.map
