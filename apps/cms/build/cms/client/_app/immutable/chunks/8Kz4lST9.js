import { i as He } from './zi73tRJP.js';
import { o as Xu, a as Qu } from './CMZtchEj.js';
import {
	p as Zu,
	z as Zo,
	g as b,
	u as ef,
	b as se,
	d as Bt,
	c as oe,
	f as hn,
	n as Zi,
	r as Q,
	s as Ee,
	t as $e,
	a as tf,
	ag as nf
} from './DrlZFkx8.js';
import { f as ve, c as Pn, a as Z, s as kr, e as el, d as rf } from './CTjXDULS.js';
import { e as zn, i as Bn } from './BXe5mj2j.js';
import { t as sf, s as of } from './0XeaN6pZ.js';
import { a as lf } from './BEiD40NV.js';
import { c as Ke, a as Hn, b as et, d as af, h as cf } from './MEFvoR_D.js';
import { b as tl } from './YQp2a1pQ.js';
import { p as df } from './DePHBZW_.js';
import { q as uf } from './Ccw7PXcW.js';
import { c as ff } from './D3eWcrZU.js';
import { a as hf } from './C-hhfhAN.js';
import { s as pf } from './Cl42wY7v.js';
import { t as mf } from './CE8QOwyb.js';
function le(n) {
	this.content = n;
}
le.prototype = {
	constructor: le,
	find: function (n) {
		for (var e = 0; e < this.content.length; e += 2) if (this.content[e] === n) return e;
		return -1;
	},
	get: function (n) {
		var e = this.find(n);
		return e == -1 ? void 0 : this.content[e + 1];
	},
	update: function (n, e, t) {
		var r = t && t != n ? this.remove(t) : this,
			i = r.find(n),
			s = r.content.slice();
		return (i == -1 ? s.push(t || n, e) : ((s[i + 1] = e), t && (s[i] = t)), new le(s));
	},
	remove: function (n) {
		var e = this.find(n);
		if (e == -1) return this;
		var t = this.content.slice();
		return (t.splice(e, 2), new le(t));
	},
	addToStart: function (n, e) {
		return new le([n, e].concat(this.remove(n).content));
	},
	addToEnd: function (n, e) {
		var t = this.remove(n).content.slice();
		return (t.push(n, e), new le(t));
	},
	addBefore: function (n, e, t) {
		var r = this.remove(e),
			i = r.content.slice(),
			s = r.find(n);
		return (i.splice(s == -1 ? i.length : s, 0, e, t), new le(i));
	},
	forEach: function (n) {
		for (var e = 0; e < this.content.length; e += 2) n(this.content[e], this.content[e + 1]);
	},
	prepend: function (n) {
		return ((n = le.from(n)), n.size ? new le(n.content.concat(this.subtract(n).content)) : this);
	},
	append: function (n) {
		return ((n = le.from(n)), n.size ? new le(this.subtract(n).content.concat(n.content)) : this);
	},
	subtract: function (n) {
		var e = this;
		n = le.from(n);
		for (var t = 0; t < n.content.length; t += 2) e = e.remove(n.content[t]);
		return e;
	},
	toObject: function () {
		var n = {};
		return (
			this.forEach(function (e, t) {
				n[e] = t;
			}),
			n
		);
	},
	get size() {
		return this.content.length >> 1;
	}
};
le.from = function (n) {
	if (n instanceof le) return n;
	var e = [];
	if (n) for (var t in n) e.push(t, n[t]);
	return new le(e);
};
function Va(n, e, t) {
	for (let r = 0; ; r++) {
		if (r == n.childCount || r == e.childCount) return n.childCount == e.childCount ? null : t;
		let i = n.child(r),
			s = e.child(r);
		if (i == s) {
			t += i.nodeSize;
			continue;
		}
		if (!i.sameMarkup(s)) return t;
		if (i.isText && i.text != s.text) {
			for (let o = 0; i.text[o] == s.text[o]; o++) t++;
			return t;
		}
		if (i.content.size || s.content.size) {
			let o = Va(i.content, s.content, t + 1);
			if (o != null) return o;
		}
		t += i.nodeSize;
	}
}
function Wa(n, e, t, r) {
	for (let i = n.childCount, s = e.childCount; ; ) {
		if (i == 0 || s == 0) return i == s ? null : { a: t, b: r };
		let o = n.child(--i),
			l = e.child(--s),
			a = o.nodeSize;
		if (o == l) {
			((t -= a), (r -= a));
			continue;
		}
		if (!o.sameMarkup(l)) return { a: t, b: r };
		if (o.isText && o.text != l.text) {
			let c = 0,
				d = Math.min(o.text.length, l.text.length);
			for (; c < d && o.text[o.text.length - c - 1] == l.text[l.text.length - c - 1]; ) (c++, t--, r--);
			return { a: t, b: r };
		}
		if (o.content.size || l.content.size) {
			let c = Wa(o.content, l.content, t - 1, r - 1);
			if (c) return c;
		}
		((t -= a), (r -= a));
	}
}
class k {
	constructor(e, t) {
		if (((this.content = e), (this.size = t || 0), t == null)) for (let r = 0; r < e.length; r++) this.size += e[r].nodeSize;
	}
	nodesBetween(e, t, r, i = 0, s) {
		for (let o = 0, l = 0; l < t; o++) {
			let a = this.content[o],
				c = l + a.nodeSize;
			if (c > e && r(a, i + l, s || null, o) !== !1 && a.content.size) {
				let d = l + 1;
				a.nodesBetween(Math.max(0, e - d), Math.min(a.content.size, t - d), r, i + d);
			}
			l = c;
		}
	}
	descendants(e) {
		this.nodesBetween(0, this.size, e);
	}
	textBetween(e, t, r, i) {
		let s = '',
			o = !0;
		return (
			this.nodesBetween(
				e,
				t,
				(l, a) => {
					let c = l.isText
						? l.text.slice(Math.max(e, a) - a, t - a)
						: l.isLeaf
							? i
								? typeof i == 'function'
									? i(l)
									: i
								: l.type.spec.leafText
									? l.type.spec.leafText(l)
									: ''
							: '';
					(l.isBlock && ((l.isLeaf && c) || l.isTextblock) && r && (o ? (o = !1) : (s += r)), (s += c));
				},
				0
			),
			s
		);
	}
	append(e) {
		if (!e.size) return this;
		if (!this.size) return e;
		let t = this.lastChild,
			r = e.firstChild,
			i = this.content.slice(),
			s = 0;
		for (t.isText && t.sameMarkup(r) && ((i[i.length - 1] = t.withText(t.text + r.text)), (s = 1)); s < e.content.length; s++) i.push(e.content[s]);
		return new k(i, this.size + e.size);
	}
	cut(e, t = this.size) {
		if (e == 0 && t == this.size) return this;
		let r = [],
			i = 0;
		if (t > e)
			for (let s = 0, o = 0; o < t; s++) {
				let l = this.content[s],
					a = o + l.nodeSize;
				(a > e &&
					((o < e || a > t) &&
						(l.isText
							? (l = l.cut(Math.max(0, e - o), Math.min(l.text.length, t - o)))
							: (l = l.cut(Math.max(0, e - o - 1), Math.min(l.content.size, t - o - 1)))),
					r.push(l),
					(i += l.nodeSize)),
					(o = a));
			}
		return new k(r, i);
	}
	cutByIndex(e, t) {
		return e == t ? k.empty : e == 0 && t == this.content.length ? this : new k(this.content.slice(e, t));
	}
	replaceChild(e, t) {
		let r = this.content[e];
		if (r == t) return this;
		let i = this.content.slice(),
			s = this.size + t.nodeSize - r.nodeSize;
		return ((i[e] = t), new k(i, s));
	}
	addToStart(e) {
		return new k([e].concat(this.content), this.size + e.nodeSize);
	}
	addToEnd(e) {
		return new k(this.content.concat(e), this.size + e.nodeSize);
	}
	eq(e) {
		if (this.content.length != e.content.length) return !1;
		for (let t = 0; t < this.content.length; t++) if (!this.content[t].eq(e.content[t])) return !1;
		return !0;
	}
	get firstChild() {
		return this.content.length ? this.content[0] : null;
	}
	get lastChild() {
		return this.content.length ? this.content[this.content.length - 1] : null;
	}
	get childCount() {
		return this.content.length;
	}
	child(e) {
		let t = this.content[e];
		if (!t) throw new RangeError('Index ' + e + ' out of range for ' + this);
		return t;
	}
	maybeChild(e) {
		return this.content[e] || null;
	}
	forEach(e) {
		for (let t = 0, r = 0; t < this.content.length; t++) {
			let i = this.content[t];
			(e(i, r, t), (r += i.nodeSize));
		}
	}
	findDiffStart(e, t = 0) {
		return Va(this, e, t);
	}
	findDiffEnd(e, t = this.size, r = e.size) {
		return Wa(this, e, t, r);
	}
	findIndex(e) {
		if (e == 0) return xr(0, e);
		if (e == this.size) return xr(this.content.length, e);
		if (e > this.size || e < 0) throw new RangeError(`Position ${e} outside of fragment (${this})`);
		for (let t = 0, r = 0; ; t++) {
			let i = this.child(t),
				s = r + i.nodeSize;
			if (s >= e) return s == e ? xr(t + 1, s) : xr(t, r);
			r = s;
		}
	}
	toString() {
		return '<' + this.toStringInner() + '>';
	}
	toStringInner() {
		return this.content.join(', ');
	}
	toJSON() {
		return this.content.length ? this.content.map((e) => e.toJSON()) : null;
	}
	static fromJSON(e, t) {
		if (!t) return k.empty;
		if (!Array.isArray(t)) throw new RangeError('Invalid input for Fragment.fromJSON');
		return new k(t.map(e.nodeFromJSON));
	}
	static fromArray(e) {
		if (!e.length) return k.empty;
		let t,
			r = 0;
		for (let i = 0; i < e.length; i++) {
			let s = e[i];
			((r += s.nodeSize),
				i && s.isText && e[i - 1].sameMarkup(s)
					? (t || (t = e.slice(0, i)), (t[t.length - 1] = s.withText(t[t.length - 1].text + s.text)))
					: t && t.push(s));
		}
		return new k(t || e, r);
	}
	static from(e) {
		if (!e) return k.empty;
		if (e instanceof k) return e;
		if (Array.isArray(e)) return this.fromArray(e);
		if (e.attrs) return new k([e], e.nodeSize);
		throw new RangeError(
			'Can not convert ' + e + ' to a Fragment' + (e.nodesBetween ? ' (looks like multiple versions of prosemirror-model were loaded)' : '')
		);
	}
}
k.empty = new k([], 0);
const es = { index: 0, offset: 0 };
function xr(n, e) {
	return ((es.index = n), (es.offset = e), es);
}
function Wr(n, e) {
	if (n === e) return !0;
	if (!(n && typeof n == 'object') || !(e && typeof e == 'object')) return !1;
	let t = Array.isArray(n);
	if (Array.isArray(e) != t) return !1;
	if (t) {
		if (n.length != e.length) return !1;
		for (let r = 0; r < n.length; r++) if (!Wr(n[r], e[r])) return !1;
	} else {
		for (let r in n) if (!(r in e) || !Wr(n[r], e[r])) return !1;
		for (let r in e) if (!(r in n)) return !1;
	}
	return !0;
}
let F = class Es {
	constructor(e, t) {
		((this.type = e), (this.attrs = t));
	}
	addToSet(e) {
		let t,
			r = !1;
		for (let i = 0; i < e.length; i++) {
			let s = e[i];
			if (this.eq(s)) return e;
			if (this.type.excludes(s.type)) t || (t = e.slice(0, i));
			else {
				if (s.type.excludes(this.type)) return e;
				(!r && s.type.rank > this.type.rank && (t || (t = e.slice(0, i)), t.push(this), (r = !0)), t && t.push(s));
			}
		}
		return (t || (t = e.slice()), r || t.push(this), t);
	}
	removeFromSet(e) {
		for (let t = 0; t < e.length; t++) if (this.eq(e[t])) return e.slice(0, t).concat(e.slice(t + 1));
		return e;
	}
	isInSet(e) {
		for (let t = 0; t < e.length; t++) if (this.eq(e[t])) return !0;
		return !1;
	}
	eq(e) {
		return this == e || (this.type == e.type && Wr(this.attrs, e.attrs));
	}
	toJSON() {
		let e = { type: this.type.name };
		for (let t in this.attrs) {
			e.attrs = this.attrs;
			break;
		}
		return e;
	}
	static fromJSON(e, t) {
		if (!t) throw new RangeError('Invalid input for Mark.fromJSON');
		let r = e.marks[t.type];
		if (!r) throw new RangeError(`There is no mark type ${t.type} in this schema`);
		let i = r.create(t.attrs);
		return (r.checkAttrs(i.attrs), i);
	}
	static sameSet(e, t) {
		if (e == t) return !0;
		if (e.length != t.length) return !1;
		for (let r = 0; r < e.length; r++) if (!e[r].eq(t[r])) return !1;
		return !0;
	}
	static setFrom(e) {
		if (!e || (Array.isArray(e) && e.length == 0)) return Es.none;
		if (e instanceof Es) return [e];
		let t = e.slice();
		return (t.sort((r, i) => r.type.rank - i.type.rank), t);
	}
};
F.none = [];
class jr extends Error {}
class C {
	constructor(e, t, r) {
		((this.content = e), (this.openStart = t), (this.openEnd = r));
	}
	get size() {
		return this.content.size - this.openStart - this.openEnd;
	}
	insertAt(e, t) {
		let r = Ka(this.content, e + this.openStart, t);
		return r && new C(r, this.openStart, this.openEnd);
	}
	removeBetween(e, t) {
		return new C(ja(this.content, e + this.openStart, t + this.openStart), this.openStart, this.openEnd);
	}
	eq(e) {
		return this.content.eq(e.content) && this.openStart == e.openStart && this.openEnd == e.openEnd;
	}
	toString() {
		return this.content + '(' + this.openStart + ',' + this.openEnd + ')';
	}
	toJSON() {
		if (!this.content.size) return null;
		let e = { content: this.content.toJSON() };
		return (this.openStart > 0 && (e.openStart = this.openStart), this.openEnd > 0 && (e.openEnd = this.openEnd), e);
	}
	static fromJSON(e, t) {
		if (!t) return C.empty;
		let r = t.openStart || 0,
			i = t.openEnd || 0;
		if (typeof r != 'number' || typeof i != 'number') throw new RangeError('Invalid input for Slice.fromJSON');
		return new C(k.fromJSON(e, t.content), r, i);
	}
	static maxOpen(e, t = !0) {
		let r = 0,
			i = 0;
		for (let s = e.firstChild; s && !s.isLeaf && (t || !s.type.spec.isolating); s = s.firstChild) r++;
		for (let s = e.lastChild; s && !s.isLeaf && (t || !s.type.spec.isolating); s = s.lastChild) i++;
		return new C(e, r, i);
	}
}
C.empty = new C(k.empty, 0, 0);
function ja(n, e, t) {
	let { index: r, offset: i } = n.findIndex(e),
		s = n.maybeChild(r),
		{ index: o, offset: l } = n.findIndex(t);
	if (i == e || s.isText) {
		if (l != t && !n.child(o).isText) throw new RangeError('Removing non-flat range');
		return n.cut(0, e).append(n.cut(t));
	}
	if (r != o) throw new RangeError('Removing non-flat range');
	return n.replaceChild(r, s.copy(ja(s.content, e - i - 1, t - i - 1)));
}
function Ka(n, e, t, r) {
	let { index: i, offset: s } = n.findIndex(e),
		o = n.maybeChild(i);
	if (s == e || o.isText) return r && !r.canReplace(i, i, t) ? null : n.cut(0, e).append(t).append(n.cut(e));
	let l = Ka(o.content, e - s - 1, t, o);
	return l && n.replaceChild(i, o.copy(l));
}
function gf(n, e, t) {
	if (t.openStart > n.depth) throw new jr('Inserted content deeper than insertion position');
	if (n.depth - t.openStart != e.depth - t.openEnd) throw new jr('Inconsistent open depths');
	return Ua(n, e, t, 0);
}
function Ua(n, e, t, r) {
	let i = n.index(r),
		s = n.node(r);
	if (i == e.index(r) && r < n.depth - t.openStart) {
		let o = Ua(n, e, t, r + 1);
		return s.copy(s.content.replaceChild(i, o));
	} else if (t.content.size)
		if (!t.openStart && !t.openEnd && n.depth == r && e.depth == r) {
			let o = n.parent,
				l = o.content;
			return Kt(o, l.cut(0, n.parentOffset).append(t.content).append(l.cut(e.parentOffset)));
		} else {
			let { start: o, end: l } = yf(t, n);
			return Kt(s, Ja(n, o, l, e, r));
		}
	else return Kt(s, Kr(n, e, r));
}
function qa(n, e) {
	if (!e.type.compatibleContent(n.type)) throw new jr('Cannot join ' + e.type.name + ' onto ' + n.type.name);
}
function Ns(n, e, t) {
	let r = n.node(t);
	return (qa(r, e.node(t)), r);
}
function jt(n, e) {
	let t = e.length - 1;
	t >= 0 && n.isText && n.sameMarkup(e[t]) ? (e[t] = n.withText(e[t].text + n.text)) : e.push(n);
}
function Kn(n, e, t, r) {
	let i = (e || n).node(t),
		s = 0,
		o = e ? e.index(t) : i.childCount;
	n && ((s = n.index(t)), n.depth > t ? s++ : n.textOffset && (jt(n.nodeAfter, r), s++));
	for (let l = s; l < o; l++) jt(i.child(l), r);
	e && e.depth == t && e.textOffset && jt(e.nodeBefore, r);
}
function Kt(n, e) {
	return (n.type.checkContent(e), n.copy(e));
}
function Ja(n, e, t, r, i) {
	let s = n.depth > i && Ns(n, e, i + 1),
		o = r.depth > i && Ns(t, r, i + 1),
		l = [];
	return (
		Kn(null, n, i, l),
		s && o && e.index(i) == t.index(i)
			? (qa(s, o), jt(Kt(s, Ja(n, e, t, r, i + 1)), l))
			: (s && jt(Kt(s, Kr(n, e, i + 1)), l), Kn(e, t, i, l), o && jt(Kt(o, Kr(t, r, i + 1)), l)),
		Kn(r, null, i, l),
		new k(l)
	);
}
function Kr(n, e, t) {
	let r = [];
	if ((Kn(null, n, t, r), n.depth > t)) {
		let i = Ns(n, e, t + 1);
		jt(Kt(i, Kr(n, e, t + 1)), r);
	}
	return (Kn(e, null, t, r), new k(r));
}
function yf(n, e) {
	let t = e.depth - n.openStart,
		i = e.node(t).copy(n.content);
	for (let s = t - 1; s >= 0; s--) i = e.node(s).copy(k.from(i));
	return { start: i.resolveNoCache(n.openStart + t), end: i.resolveNoCache(i.content.size - n.openEnd - t) };
}
class tr {
	constructor(e, t, r) {
		((this.pos = e), (this.path = t), (this.parentOffset = r), (this.depth = t.length / 3 - 1));
	}
	resolveDepth(e) {
		return e == null ? this.depth : e < 0 ? this.depth + e : e;
	}
	get parent() {
		return this.node(this.depth);
	}
	get doc() {
		return this.node(0);
	}
	node(e) {
		return this.path[this.resolveDepth(e) * 3];
	}
	index(e) {
		return this.path[this.resolveDepth(e) * 3 + 1];
	}
	indexAfter(e) {
		return ((e = this.resolveDepth(e)), this.index(e) + (e == this.depth && !this.textOffset ? 0 : 1));
	}
	start(e) {
		return ((e = this.resolveDepth(e)), e == 0 ? 0 : this.path[e * 3 - 1] + 1);
	}
	end(e) {
		return ((e = this.resolveDepth(e)), this.start(e) + this.node(e).content.size);
	}
	before(e) {
		if (((e = this.resolveDepth(e)), !e)) throw new RangeError('There is no position before the top-level node');
		return e == this.depth + 1 ? this.pos : this.path[e * 3 - 1];
	}
	after(e) {
		if (((e = this.resolveDepth(e)), !e)) throw new RangeError('There is no position after the top-level node');
		return e == this.depth + 1 ? this.pos : this.path[e * 3 - 1] + this.path[e * 3].nodeSize;
	}
	get textOffset() {
		return this.pos - this.path[this.path.length - 1];
	}
	get nodeAfter() {
		let e = this.parent,
			t = this.index(this.depth);
		if (t == e.childCount) return null;
		let r = this.pos - this.path[this.path.length - 1],
			i = e.child(t);
		return r ? e.child(t).cut(r) : i;
	}
	get nodeBefore() {
		let e = this.index(this.depth),
			t = this.pos - this.path[this.path.length - 1];
		return t ? this.parent.child(e).cut(0, t) : e == 0 ? null : this.parent.child(e - 1);
	}
	posAtIndex(e, t) {
		t = this.resolveDepth(t);
		let r = this.path[t * 3],
			i = t == 0 ? 0 : this.path[t * 3 - 1] + 1;
		for (let s = 0; s < e; s++) i += r.child(s).nodeSize;
		return i;
	}
	marks() {
		let e = this.parent,
			t = this.index();
		if (e.content.size == 0) return F.none;
		if (this.textOffset) return e.child(t).marks;
		let r = e.maybeChild(t - 1),
			i = e.maybeChild(t);
		if (!r) {
			let l = r;
			((r = i), (i = l));
		}
		let s = r.marks;
		for (var o = 0; o < s.length; o++) s[o].type.spec.inclusive === !1 && (!i || !s[o].isInSet(i.marks)) && (s = s[o--].removeFromSet(s));
		return s;
	}
	marksAcross(e) {
		let t = this.parent.maybeChild(this.index());
		if (!t || !t.isInline) return null;
		let r = t.marks,
			i = e.parent.maybeChild(e.index());
		for (var s = 0; s < r.length; s++) r[s].type.spec.inclusive === !1 && (!i || !r[s].isInSet(i.marks)) && (r = r[s--].removeFromSet(r));
		return r;
	}
	sharedDepth(e) {
		for (let t = this.depth; t > 0; t--) if (this.start(t) <= e && this.end(t) >= e) return t;
		return 0;
	}
	blockRange(e = this, t) {
		if (e.pos < this.pos) return e.blockRange(this);
		for (let r = this.depth - (this.parent.inlineContent || this.pos == e.pos ? 1 : 0); r >= 0; r--)
			if (e.pos <= this.end(r) && (!t || t(this.node(r)))) return new Ur(this, e, r);
		return null;
	}
	sameParent(e) {
		return this.pos - this.parentOffset == e.pos - e.parentOffset;
	}
	max(e) {
		return e.pos > this.pos ? e : this;
	}
	min(e) {
		return e.pos < this.pos ? e : this;
	}
	toString() {
		let e = '';
		for (let t = 1; t <= this.depth; t++) e += (e ? '/' : '') + this.node(t).type.name + '_' + this.index(t - 1);
		return e + ':' + this.parentOffset;
	}
	static resolve(e, t) {
		if (!(t >= 0 && t <= e.content.size)) throw new RangeError('Position ' + t + ' out of range');
		let r = [],
			i = 0,
			s = t;
		for (let o = e; ; ) {
			let { index: l, offset: a } = o.content.findIndex(s),
				c = s - a;
			if ((r.push(o, l, i + a), !c || ((o = o.child(l)), o.isText))) break;
			((s = c - 1), (i += a + 1));
		}
		return new tr(t, r, s);
	}
	static resolveCached(e, t) {
		let r = nl.get(e);
		if (r)
			for (let s = 0; s < r.elts.length; s++) {
				let o = r.elts[s];
				if (o.pos == t) return o;
			}
		else nl.set(e, (r = new bf()));
		let i = (r.elts[r.i] = tr.resolve(e, t));
		return ((r.i = (r.i + 1) % kf), i);
	}
}
class bf {
	constructor() {
		((this.elts = []), (this.i = 0));
	}
}
const kf = 12,
	nl = new WeakMap();
class Ur {
	constructor(e, t, r) {
		((this.$from = e), (this.$to = t), (this.depth = r));
	}
	get start() {
		return this.$from.before(this.depth + 1);
	}
	get end() {
		return this.$to.after(this.depth + 1);
	}
	get parent() {
		return this.$from.node(this.depth);
	}
	get startIndex() {
		return this.$from.index(this.depth);
	}
	get endIndex() {
		return this.$to.indexAfter(this.depth);
	}
}
const xf = Object.create(null);
class Ve {
	constructor(e, t, r, i = F.none) {
		((this.type = e), (this.attrs = t), (this.marks = i), (this.content = r || k.empty));
	}
	get children() {
		return this.content.content;
	}
	get nodeSize() {
		return this.isLeaf ? 1 : 2 + this.content.size;
	}
	get childCount() {
		return this.content.childCount;
	}
	child(e) {
		return this.content.child(e);
	}
	maybeChild(e) {
		return this.content.maybeChild(e);
	}
	forEach(e) {
		this.content.forEach(e);
	}
	nodesBetween(e, t, r, i = 0) {
		this.content.nodesBetween(e, t, r, i, this);
	}
	descendants(e) {
		this.nodesBetween(0, this.content.size, e);
	}
	get textContent() {
		return this.isLeaf && this.type.spec.leafText ? this.type.spec.leafText(this) : this.textBetween(0, this.content.size, '');
	}
	textBetween(e, t, r, i) {
		return this.content.textBetween(e, t, r, i);
	}
	get firstChild() {
		return this.content.firstChild;
	}
	get lastChild() {
		return this.content.lastChild;
	}
	eq(e) {
		return this == e || (this.sameMarkup(e) && this.content.eq(e.content));
	}
	sameMarkup(e) {
		return this.hasMarkup(e.type, e.attrs, e.marks);
	}
	hasMarkup(e, t, r) {
		return this.type == e && Wr(this.attrs, t || e.defaultAttrs || xf) && F.sameSet(this.marks, r || F.none);
	}
	copy(e = null) {
		return e == this.content ? this : new Ve(this.type, this.attrs, e, this.marks);
	}
	mark(e) {
		return e == this.marks ? this : new Ve(this.type, this.attrs, this.content, e);
	}
	cut(e, t = this.content.size) {
		return e == 0 && t == this.content.size ? this : this.copy(this.content.cut(e, t));
	}
	slice(e, t = this.content.size, r = !1) {
		if (e == t) return C.empty;
		let i = this.resolve(e),
			s = this.resolve(t),
			o = r ? 0 : i.sharedDepth(t),
			l = i.start(o),
			c = i.node(o).content.cut(i.pos - l, s.pos - l);
		return new C(c, i.depth - o, s.depth - o);
	}
	replace(e, t, r) {
		return gf(this.resolve(e), this.resolve(t), r);
	}
	nodeAt(e) {
		for (let t = this; ; ) {
			let { index: r, offset: i } = t.content.findIndex(e);
			if (((t = t.maybeChild(r)), !t)) return null;
			if (i == e || t.isText) return t;
			e -= i + 1;
		}
	}
	childAfter(e) {
		let { index: t, offset: r } = this.content.findIndex(e);
		return { node: this.content.maybeChild(t), index: t, offset: r };
	}
	childBefore(e) {
		if (e == 0) return { node: null, index: 0, offset: 0 };
		let { index: t, offset: r } = this.content.findIndex(e);
		if (r < e) return { node: this.content.child(t), index: t, offset: r };
		let i = this.content.child(t - 1);
		return { node: i, index: t - 1, offset: r - i.nodeSize };
	}
	resolve(e) {
		return tr.resolveCached(this, e);
	}
	resolveNoCache(e) {
		return tr.resolve(this, e);
	}
	rangeHasMark(e, t, r) {
		let i = !1;
		return (t > e && this.nodesBetween(e, t, (s) => (r.isInSet(s.marks) && (i = !0), !i)), i);
	}
	get isBlock() {
		return this.type.isBlock;
	}
	get isTextblock() {
		return this.type.isTextblock;
	}
	get inlineContent() {
		return this.type.inlineContent;
	}
	get isInline() {
		return this.type.isInline;
	}
	get isText() {
		return this.type.isText;
	}
	get isLeaf() {
		return this.type.isLeaf;
	}
	get isAtom() {
		return this.type.isAtom;
	}
	toString() {
		if (this.type.spec.toDebugString) return this.type.spec.toDebugString(this);
		let e = this.type.name;
		return (this.content.size && (e += '(' + this.content.toStringInner() + ')'), Ga(this.marks, e));
	}
	contentMatchAt(e) {
		let t = this.type.contentMatch.matchFragment(this.content, 0, e);
		if (!t) throw new Error('Called contentMatchAt on a node with invalid content');
		return t;
	}
	canReplace(e, t, r = k.empty, i = 0, s = r.childCount) {
		let o = this.contentMatchAt(e).matchFragment(r, i, s),
			l = o && o.matchFragment(this.content, t);
		if (!l || !l.validEnd) return !1;
		for (let a = i; a < s; a++) if (!this.type.allowsMarks(r.child(a).marks)) return !1;
		return !0;
	}
	canReplaceWith(e, t, r, i) {
		if (i && !this.type.allowsMarks(i)) return !1;
		let s = this.contentMatchAt(e).matchType(r),
			o = s && s.matchFragment(this.content, t);
		return o ? o.validEnd : !1;
	}
	canAppend(e) {
		return e.content.size ? this.canReplace(this.childCount, this.childCount, e.content) : this.type.compatibleContent(e.type);
	}
	check() {
		(this.type.checkContent(this.content), this.type.checkAttrs(this.attrs));
		let e = F.none;
		for (let t = 0; t < this.marks.length; t++) {
			let r = this.marks[t];
			(r.type.checkAttrs(r.attrs), (e = r.addToSet(e)));
		}
		if (!F.sameSet(e, this.marks))
			throw new RangeError(`Invalid collection of marks for node ${this.type.name}: ${this.marks.map((t) => t.type.name)}`);
		this.content.forEach((t) => t.check());
	}
	toJSON() {
		let e = { type: this.type.name };
		for (let t in this.attrs) {
			e.attrs = this.attrs;
			break;
		}
		return (this.content.size && (e.content = this.content.toJSON()), this.marks.length && (e.marks = this.marks.map((t) => t.toJSON())), e);
	}
	static fromJSON(e, t) {
		if (!t) throw new RangeError('Invalid input for Node.fromJSON');
		let r;
		if (t.marks) {
			if (!Array.isArray(t.marks)) throw new RangeError('Invalid mark data for Node.fromJSON');
			r = t.marks.map(e.markFromJSON);
		}
		if (t.type == 'text') {
			if (typeof t.text != 'string') throw new RangeError('Invalid text node in JSON');
			return e.text(t.text, r);
		}
		let i = k.fromJSON(e, t.content),
			s = e.nodeType(t.type).create(t.attrs, i, r);
		return (s.type.checkAttrs(s.attrs), s);
	}
}
Ve.prototype.text = void 0;
class qr extends Ve {
	constructor(e, t, r, i) {
		if ((super(e, t, null, i), !r)) throw new RangeError('Empty text nodes are not allowed');
		this.text = r;
	}
	toString() {
		return this.type.spec.toDebugString ? this.type.spec.toDebugString(this) : Ga(this.marks, JSON.stringify(this.text));
	}
	get textContent() {
		return this.text;
	}
	textBetween(e, t) {
		return this.text.slice(e, t);
	}
	get nodeSize() {
		return this.text.length;
	}
	mark(e) {
		return e == this.marks ? this : new qr(this.type, this.attrs, this.text, e);
	}
	withText(e) {
		return e == this.text ? this : new qr(this.type, this.attrs, e, this.marks);
	}
	cut(e = 0, t = this.text.length) {
		return e == 0 && t == this.text.length ? this : this.withText(this.text.slice(e, t));
	}
	eq(e) {
		return this.sameMarkup(e) && this.text == e.text;
	}
	toJSON() {
		let e = super.toJSON();
		return ((e.text = this.text), e);
	}
}
function Ga(n, e) {
	for (let t = n.length - 1; t >= 0; t--) e = n[t].type.name + '(' + e + ')';
	return e;
}
class Gt {
	constructor(e) {
		((this.validEnd = e), (this.next = []), (this.wrapCache = []));
	}
	static parse(e, t) {
		let r = new wf(e, t);
		if (r.next == null) return Gt.empty;
		let i = Ya(r);
		r.next && r.err('Unexpected trailing text');
		let s = Ef(Af(i));
		return (Nf(s, r), s);
	}
	matchType(e) {
		for (let t = 0; t < this.next.length; t++) if (this.next[t].type == e) return this.next[t].next;
		return null;
	}
	matchFragment(e, t = 0, r = e.childCount) {
		let i = this;
		for (let s = t; i && s < r; s++) i = i.matchType(e.child(s).type);
		return i;
	}
	get inlineContent() {
		return this.next.length != 0 && this.next[0].type.isInline;
	}
	get defaultType() {
		for (let e = 0; e < this.next.length; e++) {
			let { type: t } = this.next[e];
			if (!(t.isText || t.hasRequiredAttrs())) return t;
		}
		return null;
	}
	compatible(e) {
		for (let t = 0; t < this.next.length; t++) for (let r = 0; r < e.next.length; r++) if (this.next[t].type == e.next[r].type) return !0;
		return !1;
	}
	fillBefore(e, t = !1, r = 0) {
		let i = [this];
		function s(o, l) {
			let a = o.matchFragment(e, r);
			if (a && (!t || a.validEnd)) return k.from(l.map((c) => c.createAndFill()));
			for (let c = 0; c < o.next.length; c++) {
				let { type: d, next: u } = o.next[c];
				if (!(d.isText || d.hasRequiredAttrs()) && i.indexOf(u) == -1) {
					i.push(u);
					let f = s(u, l.concat(d));
					if (f) return f;
				}
			}
			return null;
		}
		return s(this, []);
	}
	findWrapping(e) {
		for (let r = 0; r < this.wrapCache.length; r += 2) if (this.wrapCache[r] == e) return this.wrapCache[r + 1];
		let t = this.computeWrapping(e);
		return (this.wrapCache.push(e, t), t);
	}
	computeWrapping(e) {
		let t = Object.create(null),
			r = [{ match: this, type: null, via: null }];
		for (; r.length; ) {
			let i = r.shift(),
				s = i.match;
			if (s.matchType(e)) {
				let o = [];
				for (let l = i; l.type; l = l.via) o.push(l.type);
				return o.reverse();
			}
			for (let o = 0; o < s.next.length; o++) {
				let { type: l, next: a } = s.next[o];
				!l.isLeaf &&
					!l.hasRequiredAttrs() &&
					!(l.name in t) &&
					(!i.type || a.validEnd) &&
					(r.push({ match: l.contentMatch, type: l, via: i }), (t[l.name] = !0));
			}
		}
		return null;
	}
	get edgeCount() {
		return this.next.length;
	}
	edge(e) {
		if (e >= this.next.length) throw new RangeError(`There's no ${e}th edge in this content match`);
		return this.next[e];
	}
	toString() {
		let e = [];
		function t(r) {
			e.push(r);
			for (let i = 0; i < r.next.length; i++) e.indexOf(r.next[i].next) == -1 && t(r.next[i].next);
		}
		return (
			t(this),
			e.map((r, i) => {
				let s = i + (r.validEnd ? '*' : ' ') + ' ';
				for (let o = 0; o < r.next.length; o++) s += (o ? ', ' : '') + r.next[o].type.name + '->' + e.indexOf(r.next[o].next);
				return s;
			}).join(`
`)
		);
	}
}
Gt.empty = new Gt(!0);
class wf {
	constructor(e, t) {
		((this.string = e),
			(this.nodeTypes = t),
			(this.inline = null),
			(this.pos = 0),
			(this.tokens = e.split(/\s*(?=\b|\W|$)/)),
			this.tokens[this.tokens.length - 1] == '' && this.tokens.pop(),
			this.tokens[0] == '' && this.tokens.shift());
	}
	get next() {
		return this.tokens[this.pos];
	}
	eat(e) {
		return this.next == e && (this.pos++ || !0);
	}
	err(e) {
		throw new SyntaxError(e + " (in content expression '" + this.string + "')");
	}
}
function Ya(n) {
	let e = [];
	do e.push(Sf(n));
	while (n.eat('|'));
	return e.length == 1 ? e[0] : { type: 'choice', exprs: e };
}
function Sf(n) {
	let e = [];
	do e.push(vf(n));
	while (n.next && n.next != ')' && n.next != '|');
	return e.length == 1 ? e[0] : { type: 'seq', exprs: e };
}
function vf(n) {
	let e = Tf(n);
	for (;;)
		if (n.eat('+')) e = { type: 'plus', expr: e };
		else if (n.eat('*')) e = { type: 'star', expr: e };
		else if (n.eat('?')) e = { type: 'opt', expr: e };
		else if (n.eat('{')) e = Cf(n, e);
		else break;
	return e;
}
function rl(n) {
	/\D/.test(n.next) && n.err("Expected number, got '" + n.next + "'");
	let e = Number(n.next);
	return (n.pos++, e);
}
function Cf(n, e) {
	let t = rl(n),
		r = t;
	return (
		n.eat(',') && (n.next != '}' ? (r = rl(n)) : (r = -1)),
		n.eat('}') || n.err('Unclosed braced range'),
		{ type: 'range', min: t, max: r, expr: e }
	);
}
function Mf(n, e) {
	let t = n.nodeTypes,
		r = t[e];
	if (r) return [r];
	let i = [];
	for (let s in t) {
		let o = t[s];
		o.isInGroup(e) && i.push(o);
	}
	return (i.length == 0 && n.err("No node type or group '" + e + "' found"), i);
}
function Tf(n) {
	if (n.eat('(')) {
		let e = Ya(n);
		return (n.eat(')') || n.err('Missing closing paren'), e);
	} else if (/\W/.test(n.next)) n.err("Unexpected token '" + n.next + "'");
	else {
		let e = Mf(n, n.next).map(
			(t) => (
				n.inline == null ? (n.inline = t.isInline) : n.inline != t.isInline && n.err('Mixing inline and block content'),
				{ type: 'name', value: t }
			)
		);
		return (n.pos++, e.length == 1 ? e[0] : { type: 'choice', exprs: e });
	}
}
function Af(n) {
	let e = [[]];
	return (i(s(n, 0), t()), e);
	function t() {
		return e.push([]) - 1;
	}
	function r(o, l, a) {
		let c = { term: a, to: l };
		return (e[o].push(c), c);
	}
	function i(o, l) {
		o.forEach((a) => (a.to = l));
	}
	function s(o, l) {
		if (o.type == 'choice') return o.exprs.reduce((a, c) => a.concat(s(c, l)), []);
		if (o.type == 'seq')
			for (let a = 0; ; a++) {
				let c = s(o.exprs[a], l);
				if (a == o.exprs.length - 1) return c;
				i(c, (l = t()));
			}
		else if (o.type == 'star') {
			let a = t();
			return (r(l, a), i(s(o.expr, a), a), [r(a)]);
		} else if (o.type == 'plus') {
			let a = t();
			return (i(s(o.expr, l), a), i(s(o.expr, a), a), [r(a)]);
		} else {
			if (o.type == 'opt') return [r(l)].concat(s(o.expr, l));
			if (o.type == 'range') {
				let a = l;
				for (let c = 0; c < o.min; c++) {
					let d = t();
					(i(s(o.expr, a), d), (a = d));
				}
				if (o.max == -1) i(s(o.expr, a), a);
				else
					for (let c = o.min; c < o.max; c++) {
						let d = t();
						(r(a, d), i(s(o.expr, a), d), (a = d));
					}
				return [r(a)];
			} else {
				if (o.type == 'name') return [r(l, void 0, o.value)];
				throw new Error('Unknown expr type');
			}
		}
	}
}
function Xa(n, e) {
	return e - n;
}
function il(n, e) {
	let t = [];
	return (r(e), t.sort(Xa));
	function r(i) {
		let s = n[i];
		if (s.length == 1 && !s[0].term) return r(s[0].to);
		t.push(i);
		for (let o = 0; o < s.length; o++) {
			let { term: l, to: a } = s[o];
			!l && t.indexOf(a) == -1 && r(a);
		}
	}
}
function Ef(n) {
	let e = Object.create(null);
	return t(il(n, 0));
	function t(r) {
		let i = [];
		r.forEach((o) => {
			n[o].forEach(({ term: l, to: a }) => {
				if (!l) return;
				let c;
				for (let d = 0; d < i.length; d++) i[d][0] == l && (c = i[d][1]);
				il(n, a).forEach((d) => {
					(c || i.push([l, (c = [])]), c.indexOf(d) == -1 && c.push(d));
				});
			});
		});
		let s = (e[r.join(',')] = new Gt(r.indexOf(n.length - 1) > -1));
		for (let o = 0; o < i.length; o++) {
			let l = i[o][1].sort(Xa);
			s.next.push({ type: i[o][0], next: e[l.join(',')] || t(l) });
		}
		return s;
	}
}
function Nf(n, e) {
	for (let t = 0, r = [n]; t < r.length; t++) {
		let i = r[t],
			s = !i.validEnd,
			o = [];
		for (let l = 0; l < i.next.length; l++) {
			let { type: a, next: c } = i.next[l];
			(o.push(a.name), s && !(a.isText || a.hasRequiredAttrs()) && (s = !1), r.indexOf(c) == -1 && r.push(c));
		}
		s && e.err('Only non-generatable nodes (' + o.join(', ') + ') in a required position (see https://prosemirror.net/docs/guide/#generatable)');
	}
}
function Qa(n) {
	let e = Object.create(null);
	for (let t in n) {
		let r = n[t];
		if (!r.hasDefault) return null;
		e[t] = r.default;
	}
	return e;
}
function Za(n, e) {
	let t = Object.create(null);
	for (let r in n) {
		let i = e && e[r];
		if (i === void 0) {
			let s = n[r];
			if (s.hasDefault) i = s.default;
			else throw new RangeError('No value supplied for attribute ' + r);
		}
		t[r] = i;
	}
	return t;
}
function ec(n, e, t, r) {
	for (let i in e) if (!(i in n)) throw new RangeError(`Unsupported attribute ${i} for ${t} of type ${i}`);
	for (let i in n) {
		let s = n[i];
		s.validate && s.validate(e[i]);
	}
}
function tc(n, e) {
	let t = Object.create(null);
	if (e) for (let r in e) t[r] = new Rf(n, r, e[r]);
	return t;
}
let sl = class nc {
	constructor(e, t, r) {
		((this.name = e),
			(this.schema = t),
			(this.spec = r),
			(this.markSet = null),
			(this.groups = r.group ? r.group.split(' ') : []),
			(this.attrs = tc(e, r.attrs)),
			(this.defaultAttrs = Qa(this.attrs)),
			(this.contentMatch = null),
			(this.inlineContent = null),
			(this.isBlock = !(r.inline || e == 'text')),
			(this.isText = e == 'text'));
	}
	get isInline() {
		return !this.isBlock;
	}
	get isTextblock() {
		return this.isBlock && this.inlineContent;
	}
	get isLeaf() {
		return this.contentMatch == Gt.empty;
	}
	get isAtom() {
		return this.isLeaf || !!this.spec.atom;
	}
	isInGroup(e) {
		return this.groups.indexOf(e) > -1;
	}
	get whitespace() {
		return this.spec.whitespace || (this.spec.code ? 'pre' : 'normal');
	}
	hasRequiredAttrs() {
		for (let e in this.attrs) if (this.attrs[e].isRequired) return !0;
		return !1;
	}
	compatibleContent(e) {
		return this == e || this.contentMatch.compatible(e.contentMatch);
	}
	computeAttrs(e) {
		return !e && this.defaultAttrs ? this.defaultAttrs : Za(this.attrs, e);
	}
	create(e = null, t, r) {
		if (this.isText) throw new Error("NodeType.create can't construct text nodes");
		return new Ve(this, this.computeAttrs(e), k.from(t), F.setFrom(r));
	}
	createChecked(e = null, t, r) {
		return ((t = k.from(t)), this.checkContent(t), new Ve(this, this.computeAttrs(e), t, F.setFrom(r)));
	}
	createAndFill(e = null, t, r) {
		if (((e = this.computeAttrs(e)), (t = k.from(t)), t.size)) {
			let o = this.contentMatch.fillBefore(t);
			if (!o) return null;
			t = o.append(t);
		}
		let i = this.contentMatch.matchFragment(t),
			s = i && i.fillBefore(k.empty, !0);
		return s ? new Ve(this, e, t.append(s), F.setFrom(r)) : null;
	}
	validContent(e) {
		let t = this.contentMatch.matchFragment(e);
		if (!t || !t.validEnd) return !1;
		for (let r = 0; r < e.childCount; r++) if (!this.allowsMarks(e.child(r).marks)) return !1;
		return !0;
	}
	checkContent(e) {
		if (!this.validContent(e)) throw new RangeError(`Invalid content for node ${this.name}: ${e.toString().slice(0, 50)}`);
	}
	checkAttrs(e) {
		ec(this.attrs, e, 'node', this.name);
	}
	allowsMarkType(e) {
		return this.markSet == null || this.markSet.indexOf(e) > -1;
	}
	allowsMarks(e) {
		if (this.markSet == null) return !0;
		for (let t = 0; t < e.length; t++) if (!this.allowsMarkType(e[t].type)) return !1;
		return !0;
	}
	allowedMarks(e) {
		if (this.markSet == null) return e;
		let t;
		for (let r = 0; r < e.length; r++) this.allowsMarkType(e[r].type) ? t && t.push(e[r]) : t || (t = e.slice(0, r));
		return t ? (t.length ? t : F.none) : e;
	}
	static compile(e, t) {
		let r = Object.create(null);
		e.forEach((s, o) => (r[s] = new nc(s, t, o)));
		let i = t.spec.topNode || 'doc';
		if (!r[i]) throw new RangeError("Schema is missing its top node type ('" + i + "')");
		if (!r.text) throw new RangeError("Every schema needs a 'text' type");
		for (let s in r.text.attrs) throw new RangeError('The text node type should not have attributes');
		return r;
	}
};
function Of(n, e, t) {
	let r = t.split('|');
	return (i) => {
		let s = i === null ? 'null' : typeof i;
		if (r.indexOf(s) < 0) throw new RangeError(`Expected value of type ${r} for attribute ${e} on type ${n}, got ${s}`);
	};
}
class Rf {
	constructor(e, t, r) {
		((this.hasDefault = Object.prototype.hasOwnProperty.call(r, 'default')),
			(this.default = r.default),
			(this.validate = typeof r.validate == 'string' ? Of(e, t, r.validate) : r.validate));
	}
	get isRequired() {
		return !this.hasDefault;
	}
}
class Ii {
	constructor(e, t, r, i) {
		((this.name = e), (this.rank = t), (this.schema = r), (this.spec = i), (this.attrs = tc(e, i.attrs)), (this.excluded = null));
		let s = Qa(this.attrs);
		this.instance = s ? new F(this, s) : null;
	}
	create(e = null) {
		return !e && this.instance ? this.instance : new F(this, Za(this.attrs, e));
	}
	static compile(e, t) {
		let r = Object.create(null),
			i = 0;
		return (e.forEach((s, o) => (r[s] = new Ii(s, i++, t, o))), r);
	}
	removeFromSet(e) {
		for (var t = 0; t < e.length; t++) e[t].type == this && ((e = e.slice(0, t).concat(e.slice(t + 1))), t--);
		return e;
	}
	isInSet(e) {
		for (let t = 0; t < e.length; t++) if (e[t].type == this) return e[t];
	}
	checkAttrs(e) {
		ec(this.attrs, e, 'mark', this.name);
	}
	excludes(e) {
		return this.excluded.indexOf(e) > -1;
	}
}
class rc {
	constructor(e) {
		((this.linebreakReplacement = null), (this.cached = Object.create(null)));
		let t = (this.spec = {});
		for (let i in e) t[i] = e[i];
		((t.nodes = le.from(e.nodes)),
			(t.marks = le.from(e.marks || {})),
			(this.nodes = sl.compile(this.spec.nodes, this)),
			(this.marks = Ii.compile(this.spec.marks, this)));
		let r = Object.create(null);
		for (let i in this.nodes) {
			if (i in this.marks) throw new RangeError(i + ' can not be both a node and a mark');
			let s = this.nodes[i],
				o = s.spec.content || '',
				l = s.spec.marks;
			if (
				((s.contentMatch = r[o] || (r[o] = Gt.parse(o, this.nodes))), (s.inlineContent = s.contentMatch.inlineContent), s.spec.linebreakReplacement)
			) {
				if (this.linebreakReplacement) throw new RangeError('Multiple linebreak nodes defined');
				if (!s.isInline || !s.isLeaf) throw new RangeError('Linebreak replacement nodes must be inline leaf nodes');
				this.linebreakReplacement = s;
			}
			s.markSet = l == '_' ? null : l ? ol(this, l.split(' ')) : l == '' || !s.inlineContent ? [] : null;
		}
		for (let i in this.marks) {
			let s = this.marks[i],
				o = s.spec.excludes;
			s.excluded = o == null ? [s] : o == '' ? [] : ol(this, o.split(' '));
		}
		((this.nodeFromJSON = (i) => Ve.fromJSON(this, i)),
			(this.markFromJSON = (i) => F.fromJSON(this, i)),
			(this.topNodeType = this.nodes[this.spec.topNode || 'doc']),
			(this.cached.wrappings = Object.create(null)));
	}
	node(e, t = null, r, i) {
		if (typeof e == 'string') e = this.nodeType(e);
		else if (e instanceof sl) {
			if (e.schema != this) throw new RangeError('Node type from different schema used (' + e.name + ')');
		} else throw new RangeError('Invalid node type: ' + e);
		return e.createChecked(t, r, i);
	}
	text(e, t) {
		let r = this.nodes.text;
		return new qr(r, r.defaultAttrs, e, F.setFrom(t));
	}
	mark(e, t) {
		return (typeof e == 'string' && (e = this.marks[e]), e.create(t));
	}
	nodeType(e) {
		let t = this.nodes[e];
		if (!t) throw new RangeError('Unknown node type: ' + e);
		return t;
	}
}
function ol(n, e) {
	let t = [];
	for (let r = 0; r < e.length; r++) {
		let i = e[r],
			s = n.marks[i],
			o = s;
		if (s) t.push(s);
		else
			for (let l in n.marks) {
				let a = n.marks[l];
				(i == '_' || (a.spec.group && a.spec.group.split(' ').indexOf(i) > -1)) && t.push((o = a));
			}
		if (!o) throw new SyntaxError("Unknown mark type: '" + e[r] + "'");
	}
	return t;
}
function If(n) {
	return n.tag != null;
}
function Df(n) {
	return n.style != null;
}
class Ct {
	constructor(e, t) {
		((this.schema = e), (this.rules = t), (this.tags = []), (this.styles = []));
		let r = (this.matchedStyles = []);
		(t.forEach((i) => {
			if (If(i)) this.tags.push(i);
			else if (Df(i)) {
				let s = /[^=]*/.exec(i.style)[0];
				(r.indexOf(s) < 0 && r.push(s), this.styles.push(i));
			}
		}),
			(this.normalizeLists = !this.tags.some((i) => {
				if (!/^(ul|ol)\b/.test(i.tag) || !i.node) return !1;
				let s = e.nodes[i.node];
				return s.contentMatch.matchType(s);
			})));
	}
	parse(e, t = {}) {
		let r = new al(this, t, !1);
		return (r.addAll(e, F.none, t.from, t.to), r.finish());
	}
	parseSlice(e, t = {}) {
		let r = new al(this, t, !0);
		return (r.addAll(e, F.none, t.from, t.to), C.maxOpen(r.finish()));
	}
	matchTag(e, t, r) {
		for (let i = r ? this.tags.indexOf(r) + 1 : 0; i < this.tags.length; i++) {
			let s = this.tags[i];
			if (zf(e, s.tag) && (s.namespace === void 0 || e.namespaceURI == s.namespace) && (!s.context || t.matchesContext(s.context))) {
				if (s.getAttrs) {
					let o = s.getAttrs(e);
					if (o === !1) continue;
					s.attrs = o || void 0;
				}
				return s;
			}
		}
	}
	matchStyle(e, t, r, i) {
		for (let s = i ? this.styles.indexOf(i) + 1 : 0; s < this.styles.length; s++) {
			let o = this.styles[s],
				l = o.style;
			if (
				!(
					l.indexOf(e) != 0 ||
					(o.context && !r.matchesContext(o.context)) ||
					(l.length > e.length && (l.charCodeAt(e.length) != 61 || l.slice(e.length + 1) != t))
				)
			) {
				if (o.getAttrs) {
					let a = o.getAttrs(t);
					if (a === !1) continue;
					o.attrs = a || void 0;
				}
				return o;
			}
		}
	}
	static schemaRules(e) {
		let t = [];
		function r(i) {
			let s = i.priority == null ? 50 : i.priority,
				o = 0;
			for (; o < t.length; o++) {
				let l = t[o];
				if ((l.priority == null ? 50 : l.priority) < s) break;
			}
			t.splice(o, 0, i);
		}
		for (let i in e.marks) {
			let s = e.marks[i].spec.parseDOM;
			s &&
				s.forEach((o) => {
					(r((o = cl(o))), o.mark || o.ignore || o.clearMark || (o.mark = i));
				});
		}
		for (let i in e.nodes) {
			let s = e.nodes[i].spec.parseDOM;
			s &&
				s.forEach((o) => {
					(r((o = cl(o))), o.node || o.ignore || o.mark || (o.node = i));
				});
		}
		return t;
	}
	static fromSchema(e) {
		return e.cached.domParser || (e.cached.domParser = new Ct(e, Ct.schemaRules(e)));
	}
}
const ic = {
		address: !0,
		article: !0,
		aside: !0,
		blockquote: !0,
		canvas: !0,
		dd: !0,
		div: !0,
		dl: !0,
		fieldset: !0,
		figcaption: !0,
		figure: !0,
		footer: !0,
		form: !0,
		h1: !0,
		h2: !0,
		h3: !0,
		h4: !0,
		h5: !0,
		h6: !0,
		header: !0,
		hgroup: !0,
		hr: !0,
		li: !0,
		noscript: !0,
		ol: !0,
		output: !0,
		p: !0,
		pre: !0,
		section: !0,
		table: !0,
		tfoot: !0,
		ul: !0
	},
	Lf = { head: !0, noscript: !0, object: !0, script: !0, style: !0, title: !0 },
	sc = { ol: !0, ul: !0 },
	nr = 1,
	Os = 2,
	Un = 4;
function ll(n, e, t) {
	return e != null ? (e ? nr : 0) | (e === 'full' ? Os : 0) : n && n.whitespace == 'pre' ? nr | Os : t & ~Un;
}
class wr {
	constructor(e, t, r, i, s, o) {
		((this.type = e),
			(this.attrs = t),
			(this.marks = r),
			(this.solid = i),
			(this.options = o),
			(this.content = []),
			(this.activeMarks = F.none),
			(this.match = s || (o & Un ? null : e.contentMatch)));
	}
	findWrapping(e) {
		if (!this.match) {
			if (!this.type) return [];
			let t = this.type.contentMatch.fillBefore(k.from(e));
			if (t) this.match = this.type.contentMatch.matchFragment(t);
			else {
				let r = this.type.contentMatch,
					i;
				return (i = r.findWrapping(e.type)) ? ((this.match = r), i) : null;
			}
		}
		return this.match.findWrapping(e.type);
	}
	finish(e) {
		if (!(this.options & nr)) {
			let r = this.content[this.content.length - 1],
				i;
			if (r && r.isText && (i = /[ \t\r\n\u000c]+$/.exec(r.text))) {
				let s = r;
				r.text.length == i[0].length
					? this.content.pop()
					: (this.content[this.content.length - 1] = s.withText(s.text.slice(0, s.text.length - i[0].length)));
			}
		}
		let t = k.from(this.content);
		return (!e && this.match && (t = t.append(this.match.fillBefore(k.empty, !0))), this.type ? this.type.create(this.attrs, t, this.marks) : t);
	}
	inlineContext(e) {
		return this.type
			? this.type.inlineContent
			: this.content.length
				? this.content[0].isInline
				: e.parentNode && !ic.hasOwnProperty(e.parentNode.nodeName.toLowerCase());
	}
}
class al {
	constructor(e, t, r) {
		((this.parser = e), (this.options = t), (this.isOpen = r), (this.open = 0), (this.localPreserveWS = !1));
		let i = t.topNode,
			s,
			o = ll(null, t.preserveWhitespace, 0) | (r ? Un : 0);
		(i
			? (s = new wr(i.type, i.attrs, F.none, !0, t.topMatch || i.type.contentMatch, o))
			: r
				? (s = new wr(null, null, F.none, !0, null, o))
				: (s = new wr(e.schema.topNodeType, null, F.none, !0, null, o)),
			(this.nodes = [s]),
			(this.find = t.findPositions),
			(this.needsBlock = !1));
	}
	get top() {
		return this.nodes[this.open];
	}
	addDOM(e, t) {
		e.nodeType == 3 ? this.addTextNode(e, t) : e.nodeType == 1 && this.addElement(e, t);
	}
	addTextNode(e, t) {
		let r = e.nodeValue,
			i = this.top,
			s = i.options & Os ? 'full' : this.localPreserveWS || (i.options & nr) > 0,
			{ schema: o } = this.parser;
		if (s === 'full' || i.inlineContext(e) || /[^ \t\r\n\u000c]/.test(r)) {
			if (s)
				if (s === 'full')
					r = r.replace(
						/\r\n?/g,
						`
`
					);
				else if (o.linebreakReplacement && /[\r\n]/.test(r) && this.top.findWrapping(o.linebreakReplacement.create())) {
					let l = r.split(/\r?\n|\r/);
					for (let a = 0; a < l.length; a++)
						(a && this.insertNode(o.linebreakReplacement.create(), t, !0), l[a] && this.insertNode(o.text(l[a]), t, !/\S/.test(l[a])));
					r = '';
				} else r = r.replace(/\r?\n|\r/g, ' ');
			else if (((r = r.replace(/[ \t\r\n\u000c]+/g, ' ')), /^[ \t\r\n\u000c]/.test(r) && this.open == this.nodes.length - 1)) {
				let l = i.content[i.content.length - 1],
					a = e.previousSibling;
				(!l || (a && a.nodeName == 'BR') || (l.isText && /[ \t\r\n\u000c]$/.test(l.text))) && (r = r.slice(1));
			}
			(r && this.insertNode(o.text(r), t, !/\S/.test(r)), this.findInText(e));
		} else this.findInside(e);
	}
	addElement(e, t, r) {
		let i = this.localPreserveWS,
			s = this.top;
		(e.tagName == 'PRE' || /pre/.test(e.style && e.style.whiteSpace)) && (this.localPreserveWS = !0);
		let o = e.nodeName.toLowerCase(),
			l;
		sc.hasOwnProperty(o) && this.parser.normalizeLists && Pf(e);
		let a = (this.options.ruleFromNode && this.options.ruleFromNode(e)) || (l = this.parser.matchTag(e, this, r));
		e: if (a ? a.ignore : Lf.hasOwnProperty(o)) (this.findInside(e), this.ignoreFallback(e, t));
		else if (!a || a.skip || a.closeParent) {
			a && a.closeParent ? (this.open = Math.max(0, this.open - 1)) : a && a.skip.nodeType && (e = a.skip);
			let c,
				d = this.needsBlock;
			if (ic.hasOwnProperty(o))
				(s.content.length && s.content[0].isInline && this.open && (this.open--, (s = this.top)), (c = !0), s.type || (this.needsBlock = !0));
			else if (!e.firstChild) {
				this.leafFallback(e, t);
				break e;
			}
			let u = a && a.skip ? t : this.readStyles(e, t);
			(u && this.addAll(e, u), c && this.sync(s), (this.needsBlock = d));
		} else {
			let c = this.readStyles(e, t);
			c && this.addElementByRule(e, a, c, a.consuming === !1 ? l : void 0);
		}
		this.localPreserveWS = i;
	}
	leafFallback(e, t) {
		e.nodeName == 'BR' &&
			this.top.type &&
			this.top.type.inlineContent &&
			this.addTextNode(
				e.ownerDocument.createTextNode(`
`),
				t
			);
	}
	ignoreFallback(e, t) {
		e.nodeName == 'BR' && (!this.top.type || !this.top.type.inlineContent) && this.findPlace(this.parser.schema.text('-'), t, !0);
	}
	readStyles(e, t) {
		let r = e.style;
		if (r && r.length)
			for (let i = 0; i < this.parser.matchedStyles.length; i++) {
				let s = this.parser.matchedStyles[i],
					o = r.getPropertyValue(s);
				if (o)
					for (let l = void 0; ; ) {
						let a = this.parser.matchStyle(s, o, this, l);
						if (!a) break;
						if (a.ignore) return null;
						if (
							(a.clearMark ? (t = t.filter((c) => !a.clearMark(c))) : (t = t.concat(this.parser.schema.marks[a.mark].create(a.attrs))),
							a.consuming === !1)
						)
							l = a;
						else break;
					}
			}
		return t;
	}
	addElementByRule(e, t, r, i) {
		let s, o;
		if (t.node)
			if (((o = this.parser.schema.nodes[t.node]), o.isLeaf)) this.insertNode(o.create(t.attrs), r, e.nodeName == 'BR') || this.leafFallback(e, r);
			else {
				let a = this.enter(o, t.attrs || null, r, t.preserveWhitespace);
				a && ((s = !0), (r = a));
			}
		else {
			let a = this.parser.schema.marks[t.mark];
			r = r.concat(a.create(t.attrs));
		}
		let l = this.top;
		if (o && o.isLeaf) this.findInside(e);
		else if (i) this.addElement(e, r, i);
		else if (t.getContent) (this.findInside(e), t.getContent(e, this.parser.schema).forEach((a) => this.insertNode(a, r, !1)));
		else {
			let a = e;
			(typeof t.contentElement == 'string'
				? (a = e.querySelector(t.contentElement))
				: typeof t.contentElement == 'function'
					? (a = t.contentElement(e))
					: t.contentElement && (a = t.contentElement),
				this.findAround(e, a, !0),
				this.addAll(a, r),
				this.findAround(e, a, !1));
		}
		s && this.sync(l) && this.open--;
	}
	addAll(e, t, r, i) {
		let s = r || 0;
		for (let o = r ? e.childNodes[r] : e.firstChild, l = i == null ? null : e.childNodes[i]; o != l; o = o.nextSibling, ++s)
			(this.findAtPoint(e, s), this.addDOM(o, t));
		this.findAtPoint(e, s);
	}
	findPlace(e, t, r) {
		let i, s;
		for (let o = this.open, l = 0; o >= 0; o--) {
			let a = this.nodes[o],
				c = a.findWrapping(e);
			if (c && (!i || i.length > c.length + l) && ((i = c), (s = a), !c.length)) break;
			if (a.solid) {
				if (r) break;
				l += 2;
			}
		}
		if (!i) return null;
		this.sync(s);
		for (let o = 0; o < i.length; o++) t = this.enterInner(i[o], null, t, !1);
		return t;
	}
	insertNode(e, t, r) {
		if (e.isInline && this.needsBlock && !this.top.type) {
			let s = this.textblockFromContext();
			s && (t = this.enterInner(s, null, t));
		}
		let i = this.findPlace(e, t, r);
		if (i) {
			this.closeExtra();
			let s = this.top;
			s.match && (s.match = s.match.matchType(e.type));
			let o = F.none;
			for (let l of i.concat(e.marks)) (s.type ? s.type.allowsMarkType(l.type) : dl(l.type, e.type)) && (o = l.addToSet(o));
			return (s.content.push(e.mark(o)), !0);
		}
		return !1;
	}
	enter(e, t, r, i) {
		let s = this.findPlace(e.create(t), r, !1);
		return (s && (s = this.enterInner(e, t, r, !0, i)), s);
	}
	enterInner(e, t, r, i = !1, s) {
		this.closeExtra();
		let o = this.top;
		o.match = o.match && o.match.matchType(e);
		let l = ll(e, s, o.options);
		o.options & Un && o.content.length == 0 && (l |= Un);
		let a = F.none;
		return (
			(r = r.filter((c) => ((o.type ? o.type.allowsMarkType(c.type) : dl(c.type, e)) ? ((a = c.addToSet(a)), !1) : !0))),
			this.nodes.push(new wr(e, t, a, i, null, l)),
			this.open++,
			r
		);
	}
	closeExtra(e = !1) {
		let t = this.nodes.length - 1;
		if (t > this.open) {
			for (; t > this.open; t--) this.nodes[t - 1].content.push(this.nodes[t].finish(e));
			this.nodes.length = this.open + 1;
		}
	}
	finish() {
		return ((this.open = 0), this.closeExtra(this.isOpen), this.nodes[0].finish(!!(this.isOpen || this.options.topOpen)));
	}
	sync(e) {
		for (let t = this.open; t >= 0; t--) {
			if (this.nodes[t] == e) return ((this.open = t), !0);
			this.localPreserveWS && (this.nodes[t].options |= nr);
		}
		return !1;
	}
	get currentPos() {
		this.closeExtra();
		let e = 0;
		for (let t = this.open; t >= 0; t--) {
			let r = this.nodes[t].content;
			for (let i = r.length - 1; i >= 0; i--) e += r[i].nodeSize;
			t && e++;
		}
		return e;
	}
	findAtPoint(e, t) {
		if (this.find)
			for (let r = 0; r < this.find.length; r++) this.find[r].node == e && this.find[r].offset == t && (this.find[r].pos = this.currentPos);
	}
	findInside(e) {
		if (this.find)
			for (let t = 0; t < this.find.length; t++)
				this.find[t].pos == null && e.nodeType == 1 && e.contains(this.find[t].node) && (this.find[t].pos = this.currentPos);
	}
	findAround(e, t, r) {
		if (e != t && this.find)
			for (let i = 0; i < this.find.length; i++)
				this.find[i].pos == null &&
					e.nodeType == 1 &&
					e.contains(this.find[i].node) &&
					t.compareDocumentPosition(this.find[i].node) & (r ? 2 : 4) &&
					(this.find[i].pos = this.currentPos);
	}
	findInText(e) {
		if (this.find)
			for (let t = 0; t < this.find.length; t++)
				this.find[t].node == e && (this.find[t].pos = this.currentPos - (e.nodeValue.length - this.find[t].offset));
	}
	matchesContext(e) {
		if (e.indexOf('|') > -1) return e.split(/\s*\|\s*/).some(this.matchesContext, this);
		let t = e.split('/'),
			r = this.options.context,
			i = !this.isOpen && (!r || r.parent.type == this.nodes[0].type),
			s = -(r ? r.depth + 1 : 0) + (i ? 0 : 1),
			o = (l, a) => {
				for (; l >= 0; l--) {
					let c = t[l];
					if (c == '') {
						if (l == t.length - 1 || l == 0) continue;
						for (; a >= s; a--) if (o(l - 1, a)) return !0;
						return !1;
					} else {
						let d = a > 0 || (a == 0 && i) ? this.nodes[a].type : r && a >= s ? r.node(a - s).type : null;
						if (!d || (d.name != c && !d.isInGroup(c))) return !1;
						a--;
					}
				}
				return !0;
			};
		return o(t.length - 1, this.open);
	}
	textblockFromContext() {
		let e = this.options.context;
		if (e)
			for (let t = e.depth; t >= 0; t--) {
				let r = e.node(t).contentMatchAt(e.indexAfter(t)).defaultType;
				if (r && r.isTextblock && r.defaultAttrs) return r;
			}
		for (let t in this.parser.schema.nodes) {
			let r = this.parser.schema.nodes[t];
			if (r.isTextblock && r.defaultAttrs) return r;
		}
	}
}
function Pf(n) {
	for (let e = n.firstChild, t = null; e; e = e.nextSibling) {
		let r = e.nodeType == 1 ? e.nodeName.toLowerCase() : null;
		r && sc.hasOwnProperty(r) && t ? (t.appendChild(e), (e = t)) : r == 'li' ? (t = e) : r && (t = null);
	}
}
function zf(n, e) {
	return (n.matches || n.msMatchesSelector || n.webkitMatchesSelector || n.mozMatchesSelector).call(n, e);
}
function cl(n) {
	let e = {};
	for (let t in n) e[t] = n[t];
	return e;
}
function dl(n, e) {
	let t = e.schema.nodes;
	for (let r in t) {
		let i = t[r];
		if (!i.allowsMarkType(n)) continue;
		let s = [],
			o = (l) => {
				s.push(l);
				for (let a = 0; a < l.edgeCount; a++) {
					let { type: c, next: d } = l.edge(a);
					if (c == e || (s.indexOf(d) < 0 && o(d))) return !0;
				}
			};
		if (o(i.contentMatch)) return !0;
	}
}
class tn {
	constructor(e, t) {
		((this.nodes = e), (this.marks = t));
	}
	serializeFragment(e, t = {}, r) {
		r || (r = ts(t).createDocumentFragment());
		let i = r,
			s = [];
		return (
			e.forEach((o) => {
				if (s.length || o.marks.length) {
					let l = 0,
						a = 0;
					for (; l < s.length && a < o.marks.length; ) {
						let c = o.marks[a];
						if (!this.marks[c.type.name]) {
							a++;
							continue;
						}
						if (!c.eq(s[l][0]) || c.type.spec.spanning === !1) break;
						(l++, a++);
					}
					for (; l < s.length; ) i = s.pop()[1];
					for (; a < o.marks.length; ) {
						let c = o.marks[a++],
							d = this.serializeMark(c, o.isInline, t);
						d && (s.push([c, i]), i.appendChild(d.dom), (i = d.contentDOM || d.dom));
					}
				}
				i.appendChild(this.serializeNodeInner(o, t));
			}),
			r
		);
	}
	serializeNodeInner(e, t) {
		let { dom: r, contentDOM: i } = zr(ts(t), this.nodes[e.type.name](e), null, e.attrs);
		if (i) {
			if (e.isLeaf) throw new RangeError('Content hole not allowed in a leaf node spec');
			this.serializeFragment(e.content, t, i);
		}
		return r;
	}
	serializeNode(e, t = {}) {
		let r = this.serializeNodeInner(e, t);
		for (let i = e.marks.length - 1; i >= 0; i--) {
			let s = this.serializeMark(e.marks[i], e.isInline, t);
			s && ((s.contentDOM || s.dom).appendChild(r), (r = s.dom));
		}
		return r;
	}
	serializeMark(e, t, r = {}) {
		let i = this.marks[e.type.name];
		return i && zr(ts(r), i(e, t), null, e.attrs);
	}
	static renderSpec(e, t, r = null, i) {
		return zr(e, t, r, i);
	}
	static fromSchema(e) {
		return e.cached.domSerializer || (e.cached.domSerializer = new tn(this.nodesFromSchema(e), this.marksFromSchema(e)));
	}
	static nodesFromSchema(e) {
		let t = ul(e.nodes);
		return (t.text || (t.text = (r) => r.text), t);
	}
	static marksFromSchema(e) {
		return ul(e.marks);
	}
}
function ul(n) {
	let e = {};
	for (let t in n) {
		let r = n[t].spec.toDOM;
		r && (e[t] = r);
	}
	return e;
}
function ts(n) {
	return n.document || window.document;
}
const fl = new WeakMap();
function Bf(n) {
	let e = fl.get(n);
	return (e === void 0 && fl.set(n, (e = Hf(n))), e);
}
function Hf(n) {
	let e = null;
	function t(r) {
		if (r && typeof r == 'object')
			if (Array.isArray(r))
				if (typeof r[0] == 'string') (e || (e = []), e.push(r));
				else for (let i = 0; i < r.length; i++) t(r[i]);
			else for (let i in r) t(r[i]);
	}
	return (t(n), e);
}
function zr(n, e, t, r) {
	if (typeof e == 'string') return { dom: n.createTextNode(e) };
	if (e.nodeType != null) return { dom: e };
	if (e.dom && e.dom.nodeType != null) return e;
	let i = e[0],
		s;
	if (typeof i != 'string') throw new RangeError('Invalid array passed to renderSpec');
	if (r && (s = Bf(r)) && s.indexOf(e) > -1)
		throw new RangeError('Using an array from an attribute object as a DOM spec. This may be an attempted cross site scripting attack.');
	let o = i.indexOf(' ');
	o > 0 && ((t = i.slice(0, o)), (i = i.slice(o + 1)));
	let l,
		a = t ? n.createElementNS(t, i) : n.createElement(i),
		c = e[1],
		d = 1;
	if (c && typeof c == 'object' && c.nodeType == null && !Array.isArray(c)) {
		d = 2;
		for (let u in c)
			if (c[u] != null) {
				let f = u.indexOf(' ');
				f > 0 ? a.setAttributeNS(u.slice(0, f), u.slice(f + 1), c[u]) : u == 'style' && a.style ? (a.style.cssText = c[u]) : a.setAttribute(u, c[u]);
			}
	}
	for (let u = d; u < e.length; u++) {
		let f = e[u];
		if (f === 0) {
			if (u < e.length - 1 || u > d) throw new RangeError('Content hole must be the only child of its parent node');
			return { dom: a, contentDOM: a };
		} else {
			let { dom: h, contentDOM: p } = zr(n, f, t, r);
			if ((a.appendChild(h), p)) {
				if (l) throw new RangeError('Multiple content holes');
				l = p;
			}
		}
	}
	return { dom: a, contentDOM: l };
}
const oc = 65535,
	lc = Math.pow(2, 16);
function $f(n, e) {
	return n + e * lc;
}
function hl(n) {
	return n & oc;
}
function Ff(n) {
	return (n - (n & oc)) / lc;
}
const ac = 1,
	cc = 2,
	Br = 4,
	dc = 8;
class Rs {
	constructor(e, t, r) {
		((this.pos = e), (this.delInfo = t), (this.recover = r));
	}
	get deleted() {
		return (this.delInfo & dc) > 0;
	}
	get deletedBefore() {
		return (this.delInfo & (ac | Br)) > 0;
	}
	get deletedAfter() {
		return (this.delInfo & (cc | Br)) > 0;
	}
	get deletedAcross() {
		return (this.delInfo & Br) > 0;
	}
}
class Me {
	constructor(e, t = !1) {
		if (((this.ranges = e), (this.inverted = t), !e.length && Me.empty)) return Me.empty;
	}
	recover(e) {
		let t = 0,
			r = hl(e);
		if (!this.inverted) for (let i = 0; i < r; i++) t += this.ranges[i * 3 + 2] - this.ranges[i * 3 + 1];
		return this.ranges[r * 3] + t + Ff(e);
	}
	mapResult(e, t = 1) {
		return this._map(e, t, !1);
	}
	map(e, t = 1) {
		return this._map(e, t, !0);
	}
	_map(e, t, r) {
		let i = 0,
			s = this.inverted ? 2 : 1,
			o = this.inverted ? 1 : 2;
		for (let l = 0; l < this.ranges.length; l += 3) {
			let a = this.ranges[l] - (this.inverted ? i : 0);
			if (a > e) break;
			let c = this.ranges[l + s],
				d = this.ranges[l + o],
				u = a + c;
			if (e <= u) {
				let f = c ? (e == a ? -1 : e == u ? 1 : t) : t,
					h = a + i + (f < 0 ? 0 : d);
				if (r) return h;
				let p = e == (t < 0 ? a : u) ? null : $f(l / 3, e - a),
					m = e == a ? cc : e == u ? ac : Br;
				return ((t < 0 ? e != a : e != u) && (m |= dc), new Rs(h, m, p));
			}
			i += d - c;
		}
		return r ? e + i : new Rs(e + i, 0, null);
	}
	touches(e, t) {
		let r = 0,
			i = hl(t),
			s = this.inverted ? 2 : 1,
			o = this.inverted ? 1 : 2;
		for (let l = 0; l < this.ranges.length; l += 3) {
			let a = this.ranges[l] - (this.inverted ? r : 0);
			if (a > e) break;
			let c = this.ranges[l + s],
				d = a + c;
			if (e <= d && l == i * 3) return !0;
			r += this.ranges[l + o] - c;
		}
		return !1;
	}
	forEach(e) {
		let t = this.inverted ? 2 : 1,
			r = this.inverted ? 1 : 2;
		for (let i = 0, s = 0; i < this.ranges.length; i += 3) {
			let o = this.ranges[i],
				l = o - (this.inverted ? s : 0),
				a = o + (this.inverted ? 0 : s),
				c = this.ranges[i + t],
				d = this.ranges[i + r];
			(e(l, l + c, a, a + d), (s += d - c));
		}
	}
	invert() {
		return new Me(this.ranges, !this.inverted);
	}
	toString() {
		return (this.inverted ? '-' : '') + JSON.stringify(this.ranges);
	}
	static offset(e) {
		return e == 0 ? Me.empty : new Me(e < 0 ? [0, -e, 0] : [0, 0, e]);
	}
}
Me.empty = new Me([]);
class rr {
	constructor(e, t, r = 0, i = e ? e.length : 0) {
		((this.mirror = t), (this.from = r), (this.to = i), (this._maps = e || []), (this.ownData = !(e || t)));
	}
	get maps() {
		return this._maps;
	}
	slice(e = 0, t = this.maps.length) {
		return new rr(this._maps, this.mirror, e, t);
	}
	appendMap(e, t) {
		(this.ownData || ((this._maps = this._maps.slice()), (this.mirror = this.mirror && this.mirror.slice()), (this.ownData = !0)),
			(this.to = this._maps.push(e)),
			t != null && this.setMirror(this._maps.length - 1, t));
	}
	appendMapping(e) {
		for (let t = 0, r = this._maps.length; t < e._maps.length; t++) {
			let i = e.getMirror(t);
			this.appendMap(e._maps[t], i != null && i < t ? r + i : void 0);
		}
	}
	getMirror(e) {
		if (this.mirror) {
			for (let t = 0; t < this.mirror.length; t++) if (this.mirror[t] == e) return this.mirror[t + (t % 2 ? -1 : 1)];
		}
	}
	setMirror(e, t) {
		(this.mirror || (this.mirror = []), this.mirror.push(e, t));
	}
	appendMappingInverted(e) {
		for (let t = e.maps.length - 1, r = this._maps.length + e._maps.length; t >= 0; t--) {
			let i = e.getMirror(t);
			this.appendMap(e._maps[t].invert(), i != null && i > t ? r - i - 1 : void 0);
		}
	}
	invert() {
		let e = new rr();
		return (e.appendMappingInverted(this), e);
	}
	map(e, t = 1) {
		if (this.mirror) return this._map(e, t, !0);
		for (let r = this.from; r < this.to; r++) e = this._maps[r].map(e, t);
		return e;
	}
	mapResult(e, t = 1) {
		return this._map(e, t, !1);
	}
	_map(e, t, r) {
		let i = 0;
		for (let s = this.from; s < this.to; s++) {
			let o = this._maps[s],
				l = o.mapResult(e, t);
			if (l.recover != null) {
				let a = this.getMirror(s);
				if (a != null && a > s && a < this.to) {
					((s = a), (e = this._maps[a].recover(l.recover)));
					continue;
				}
			}
			((i |= l.delInfo), (e = l.pos));
		}
		return r ? e : new Rs(e, i, null);
	}
}
const ns = Object.create(null);
class me {
	getMap() {
		return Me.empty;
	}
	merge(e) {
		return null;
	}
	static fromJSON(e, t) {
		if (!t || !t.stepType) throw new RangeError('Invalid input for Step.fromJSON');
		let r = ns[t.stepType];
		if (!r) throw new RangeError(`No step type ${t.stepType} defined`);
		return r.fromJSON(e, t);
	}
	static jsonID(e, t) {
		if (e in ns) throw new RangeError('Duplicate use of step JSON ID ' + e);
		return ((ns[e] = t), (t.prototype.jsonID = e), t);
	}
}
class Y {
	constructor(e, t) {
		((this.doc = e), (this.failed = t));
	}
	static ok(e) {
		return new Y(e, null);
	}
	static fail(e) {
		return new Y(null, e);
	}
	static fromReplace(e, t, r, i) {
		try {
			return Y.ok(e.replace(t, r, i));
		} catch (s) {
			if (s instanceof jr) return Y.fail(s.message);
			throw s;
		}
	}
}
function co(n, e, t) {
	let r = [];
	for (let i = 0; i < n.childCount; i++) {
		let s = n.child(i);
		(s.content.size && (s = s.copy(co(s.content, e, s))), s.isInline && (s = e(s, t, i)), r.push(s));
	}
	return k.fromArray(r);
}
class wt extends me {
	constructor(e, t, r) {
		(super(), (this.from = e), (this.to = t), (this.mark = r));
	}
	apply(e) {
		let t = e.slice(this.from, this.to),
			r = e.resolve(this.from),
			i = r.node(r.sharedDepth(this.to)),
			s = new C(
				co(t.content, (o, l) => (!o.isAtom || !l.type.allowsMarkType(this.mark.type) ? o : o.mark(this.mark.addToSet(o.marks))), i),
				t.openStart,
				t.openEnd
			);
		return Y.fromReplace(e, this.from, this.to, s);
	}
	invert() {
		return new _e(this.from, this.to, this.mark);
	}
	map(e) {
		let t = e.mapResult(this.from, 1),
			r = e.mapResult(this.to, -1);
		return (t.deleted && r.deleted) || t.pos >= r.pos ? null : new wt(t.pos, r.pos, this.mark);
	}
	merge(e) {
		return e instanceof wt && e.mark.eq(this.mark) && this.from <= e.to && this.to >= e.from
			? new wt(Math.min(this.from, e.from), Math.max(this.to, e.to), this.mark)
			: null;
	}
	toJSON() {
		return { stepType: 'addMark', mark: this.mark.toJSON(), from: this.from, to: this.to };
	}
	static fromJSON(e, t) {
		if (typeof t.from != 'number' || typeof t.to != 'number') throw new RangeError('Invalid input for AddMarkStep.fromJSON');
		return new wt(t.from, t.to, e.markFromJSON(t.mark));
	}
}
me.jsonID('addMark', wt);
class _e extends me {
	constructor(e, t, r) {
		(super(), (this.from = e), (this.to = t), (this.mark = r));
	}
	apply(e) {
		let t = e.slice(this.from, this.to),
			r = new C(
				co(t.content, (i) => i.mark(this.mark.removeFromSet(i.marks)), e),
				t.openStart,
				t.openEnd
			);
		return Y.fromReplace(e, this.from, this.to, r);
	}
	invert() {
		return new wt(this.from, this.to, this.mark);
	}
	map(e) {
		let t = e.mapResult(this.from, 1),
			r = e.mapResult(this.to, -1);
		return (t.deleted && r.deleted) || t.pos >= r.pos ? null : new _e(t.pos, r.pos, this.mark);
	}
	merge(e) {
		return e instanceof _e && e.mark.eq(this.mark) && this.from <= e.to && this.to >= e.from
			? new _e(Math.min(this.from, e.from), Math.max(this.to, e.to), this.mark)
			: null;
	}
	toJSON() {
		return { stepType: 'removeMark', mark: this.mark.toJSON(), from: this.from, to: this.to };
	}
	static fromJSON(e, t) {
		if (typeof t.from != 'number' || typeof t.to != 'number') throw new RangeError('Invalid input for RemoveMarkStep.fromJSON');
		return new _e(t.from, t.to, e.markFromJSON(t.mark));
	}
}
me.jsonID('removeMark', _e);
class St extends me {
	constructor(e, t) {
		(super(), (this.pos = e), (this.mark = t));
	}
	apply(e) {
		let t = e.nodeAt(this.pos);
		if (!t) return Y.fail("No node at mark step's position");
		let r = t.type.create(t.attrs, null, this.mark.addToSet(t.marks));
		return Y.fromReplace(e, this.pos, this.pos + 1, new C(k.from(r), 0, t.isLeaf ? 0 : 1));
	}
	invert(e) {
		let t = e.nodeAt(this.pos);
		if (t) {
			let r = this.mark.addToSet(t.marks);
			if (r.length == t.marks.length) {
				for (let i = 0; i < t.marks.length; i++) if (!t.marks[i].isInSet(r)) return new St(this.pos, t.marks[i]);
				return new St(this.pos, this.mark);
			}
		}
		return new Yt(this.pos, this.mark);
	}
	map(e) {
		let t = e.mapResult(this.pos, 1);
		return t.deletedAfter ? null : new St(t.pos, this.mark);
	}
	toJSON() {
		return { stepType: 'addNodeMark', pos: this.pos, mark: this.mark.toJSON() };
	}
	static fromJSON(e, t) {
		if (typeof t.pos != 'number') throw new RangeError('Invalid input for AddNodeMarkStep.fromJSON');
		return new St(t.pos, e.markFromJSON(t.mark));
	}
}
me.jsonID('addNodeMark', St);
class Yt extends me {
	constructor(e, t) {
		(super(), (this.pos = e), (this.mark = t));
	}
	apply(e) {
		let t = e.nodeAt(this.pos);
		if (!t) return Y.fail("No node at mark step's position");
		let r = t.type.create(t.attrs, null, this.mark.removeFromSet(t.marks));
		return Y.fromReplace(e, this.pos, this.pos + 1, new C(k.from(r), 0, t.isLeaf ? 0 : 1));
	}
	invert(e) {
		let t = e.nodeAt(this.pos);
		return !t || !this.mark.isInSet(t.marks) ? this : new St(this.pos, this.mark);
	}
	map(e) {
		let t = e.mapResult(this.pos, 1);
		return t.deletedAfter ? null : new Yt(t.pos, this.mark);
	}
	toJSON() {
		return { stepType: 'removeNodeMark', pos: this.pos, mark: this.mark.toJSON() };
	}
	static fromJSON(e, t) {
		if (typeof t.pos != 'number') throw new RangeError('Invalid input for RemoveNodeMarkStep.fromJSON');
		return new Yt(t.pos, e.markFromJSON(t.mark));
	}
}
me.jsonID('removeNodeMark', Yt);
class te extends me {
	constructor(e, t, r, i = !1) {
		(super(), (this.from = e), (this.to = t), (this.slice = r), (this.structure = i));
	}
	apply(e) {
		return this.structure && Is(e, this.from, this.to)
			? Y.fail('Structure replace would overwrite content')
			: Y.fromReplace(e, this.from, this.to, this.slice);
	}
	getMap() {
		return new Me([this.from, this.to - this.from, this.slice.size]);
	}
	invert(e) {
		return new te(this.from, this.from + this.slice.size, e.slice(this.from, this.to));
	}
	map(e) {
		let t = e.mapResult(this.from, 1),
			r = e.mapResult(this.to, -1);
		return t.deletedAcross && r.deletedAcross ? null : new te(t.pos, Math.max(t.pos, r.pos), this.slice, this.structure);
	}
	merge(e) {
		if (!(e instanceof te) || e.structure || this.structure) return null;
		if (this.from + this.slice.size == e.from && !this.slice.openEnd && !e.slice.openStart) {
			let t =
				this.slice.size + e.slice.size == 0 ? C.empty : new C(this.slice.content.append(e.slice.content), this.slice.openStart, e.slice.openEnd);
			return new te(this.from, this.to + (e.to - e.from), t, this.structure);
		} else if (e.to == this.from && !this.slice.openStart && !e.slice.openEnd) {
			let t =
				this.slice.size + e.slice.size == 0 ? C.empty : new C(e.slice.content.append(this.slice.content), e.slice.openStart, this.slice.openEnd);
			return new te(e.from, this.to, t, this.structure);
		} else return null;
	}
	toJSON() {
		let e = { stepType: 'replace', from: this.from, to: this.to };
		return (this.slice.size && (e.slice = this.slice.toJSON()), this.structure && (e.structure = !0), e);
	}
	static fromJSON(e, t) {
		if (typeof t.from != 'number' || typeof t.to != 'number') throw new RangeError('Invalid input for ReplaceStep.fromJSON');
		return new te(t.from, t.to, C.fromJSON(e, t.slice), !!t.structure);
	}
}
me.jsonID('replace', te);
class re extends me {
	constructor(e, t, r, i, s, o, l = !1) {
		(super(), (this.from = e), (this.to = t), (this.gapFrom = r), (this.gapTo = i), (this.slice = s), (this.insert = o), (this.structure = l));
	}
	apply(e) {
		if (this.structure && (Is(e, this.from, this.gapFrom) || Is(e, this.gapTo, this.to)))
			return Y.fail('Structure gap-replace would overwrite content');
		let t = e.slice(this.gapFrom, this.gapTo);
		if (t.openStart || t.openEnd) return Y.fail('Gap is not a flat range');
		let r = this.slice.insertAt(this.insert, t.content);
		return r ? Y.fromReplace(e, this.from, this.to, r) : Y.fail('Content does not fit in gap');
	}
	getMap() {
		return new Me([this.from, this.gapFrom - this.from, this.insert, this.gapTo, this.to - this.gapTo, this.slice.size - this.insert]);
	}
	invert(e) {
		let t = this.gapTo - this.gapFrom;
		return new re(
			this.from,
			this.from + this.slice.size + t,
			this.from + this.insert,
			this.from + this.insert + t,
			e.slice(this.from, this.to).removeBetween(this.gapFrom - this.from, this.gapTo - this.from),
			this.gapFrom - this.from,
			this.structure
		);
	}
	map(e) {
		let t = e.mapResult(this.from, 1),
			r = e.mapResult(this.to, -1),
			i = this.from == this.gapFrom ? t.pos : e.map(this.gapFrom, -1),
			s = this.to == this.gapTo ? r.pos : e.map(this.gapTo, 1);
		return (t.deletedAcross && r.deletedAcross) || i < t.pos || s > r.pos
			? null
			: new re(t.pos, r.pos, i, s, this.slice, this.insert, this.structure);
	}
	toJSON() {
		let e = { stepType: 'replaceAround', from: this.from, to: this.to, gapFrom: this.gapFrom, gapTo: this.gapTo, insert: this.insert };
		return (this.slice.size && (e.slice = this.slice.toJSON()), this.structure && (e.structure = !0), e);
	}
	static fromJSON(e, t) {
		if (
			typeof t.from != 'number' ||
			typeof t.to != 'number' ||
			typeof t.gapFrom != 'number' ||
			typeof t.gapTo != 'number' ||
			typeof t.insert != 'number'
		)
			throw new RangeError('Invalid input for ReplaceAroundStep.fromJSON');
		return new re(t.from, t.to, t.gapFrom, t.gapTo, C.fromJSON(e, t.slice), t.insert, !!t.structure);
	}
}
me.jsonID('replaceAround', re);
function Is(n, e, t) {
	let r = n.resolve(e),
		i = t - e,
		s = r.depth;
	for (; i > 0 && s > 0 && r.indexAfter(s) == r.node(s).childCount; ) (s--, i--);
	if (i > 0) {
		let o = r.node(s).maybeChild(r.indexAfter(s));
		for (; i > 0; ) {
			if (!o || o.isLeaf) return !0;
			((o = o.firstChild), i--);
		}
	}
	return !1;
}
function _f(n, e, t, r) {
	let i = [],
		s = [],
		o,
		l;
	(n.doc.nodesBetween(e, t, (a, c, d) => {
		if (!a.isInline) return;
		let u = a.marks;
		if (!r.isInSet(u) && d.type.allowsMarkType(r.type)) {
			let f = Math.max(c, e),
				h = Math.min(c + a.nodeSize, t),
				p = r.addToSet(u);
			for (let m = 0; m < u.length; m++) u[m].isInSet(p) || (o && o.to == f && o.mark.eq(u[m]) ? (o.to = h) : i.push((o = new _e(f, h, u[m]))));
			l && l.to == f ? (l.to = h) : s.push((l = new wt(f, h, r)));
		}
	}),
		i.forEach((a) => n.step(a)),
		s.forEach((a) => n.step(a)));
}
function Vf(n, e, t, r) {
	let i = [],
		s = 0;
	(n.doc.nodesBetween(e, t, (o, l) => {
		if (!o.isInline) return;
		s++;
		let a = null;
		if (r instanceof Ii) {
			let c = o.marks,
				d;
			for (; (d = r.isInSet(c)); ) ((a || (a = [])).push(d), (c = d.removeFromSet(c)));
		} else r ? r.isInSet(o.marks) && (a = [r]) : (a = o.marks);
		if (a && a.length) {
			let c = Math.min(l + o.nodeSize, t);
			for (let d = 0; d < a.length; d++) {
				let u = a[d],
					f;
				for (let h = 0; h < i.length; h++) {
					let p = i[h];
					p.step == s - 1 && u.eq(i[h].style) && (f = p);
				}
				f ? ((f.to = c), (f.step = s)) : i.push({ style: u, from: Math.max(l, e), to: c, step: s });
			}
		}
	}),
		i.forEach((o) => n.step(new _e(o.from, o.to, o.style))));
}
function uo(n, e, t, r = t.contentMatch, i = !0) {
	let s = n.doc.nodeAt(e),
		o = [],
		l = e + 1;
	for (let a = 0; a < s.childCount; a++) {
		let c = s.child(a),
			d = l + c.nodeSize,
			u = r.matchType(c.type);
		if (!u) o.push(new te(l, d, C.empty));
		else {
			r = u;
			for (let f = 0; f < c.marks.length; f++) t.allowsMarkType(c.marks[f].type) || n.step(new _e(l, d, c.marks[f]));
			if (i && c.isText && t.whitespace != 'pre') {
				let f,
					h = /\r?\n|\r/g,
					p;
				for (; (f = h.exec(c.text)); )
					(p || (p = new C(k.from(t.schema.text(' ', t.allowedMarks(c.marks))), 0, 0)), o.push(new te(l + f.index, l + f.index + f[0].length, p)));
			}
		}
		l = d;
	}
	if (!r.validEnd) {
		let a = r.fillBefore(k.empty, !0);
		n.replace(l, l, new C(a, 0, 0));
	}
	for (let a = o.length - 1; a >= 0; a--) n.step(o[a]);
}
function Wf(n, e, t) {
	return (e == 0 || n.canReplace(e, n.childCount)) && (t == n.childCount || n.canReplace(0, t));
}
function On(n) {
	let t = n.parent.content.cutByIndex(n.startIndex, n.endIndex);
	for (let r = n.depth, i = 0, s = 0; ; --r) {
		let o = n.$from.node(r),
			l = n.$from.index(r) + i,
			a = n.$to.indexAfter(r) - s;
		if (r < n.depth && o.canReplace(l, a, t)) return r;
		if (r == 0 || o.type.spec.isolating || !Wf(o, l, a)) break;
		(l && (i = 1), a < o.childCount && (s = 1));
	}
	return null;
}
function jf(n, e, t) {
	let { $from: r, $to: i, depth: s } = e,
		o = r.before(s + 1),
		l = i.after(s + 1),
		a = o,
		c = l,
		d = k.empty,
		u = 0;
	for (let p = s, m = !1; p > t; p--) m || r.index(p) > 0 ? ((m = !0), (d = k.from(r.node(p).copy(d))), u++) : a--;
	let f = k.empty,
		h = 0;
	for (let p = s, m = !1; p > t; p--) m || i.after(p + 1) < i.end(p) ? ((m = !0), (f = k.from(i.node(p).copy(f))), h++) : c++;
	n.step(new re(a, c, o, l, new C(d.append(f), u, h), d.size - u, !0));
}
function fo(n, e, t = null, r = n) {
	let i = Kf(n, e),
		s = i && Uf(r, e);
	return s ? i.map(pl).concat({ type: e, attrs: t }).concat(s.map(pl)) : null;
}
function pl(n) {
	return { type: n, attrs: null };
}
function Kf(n, e) {
	let { parent: t, startIndex: r, endIndex: i } = n,
		s = t.contentMatchAt(r).findWrapping(e);
	if (!s) return null;
	let o = s.length ? s[0] : e;
	return t.canReplaceWith(r, i, o) ? s : null;
}
function Uf(n, e) {
	let { parent: t, startIndex: r, endIndex: i } = n,
		s = t.child(r),
		o = e.contentMatch.findWrapping(s.type);
	if (!o) return null;
	let a = (o.length ? o[o.length - 1] : e).contentMatch;
	for (let c = r; a && c < i; c++) a = a.matchType(t.child(c).type);
	return !a || !a.validEnd ? null : o;
}
function qf(n, e, t) {
	let r = k.empty;
	for (let o = t.length - 1; o >= 0; o--) {
		if (r.size) {
			let l = t[o].type.contentMatch.matchFragment(r);
			if (!l || !l.validEnd) throw new RangeError('Wrapper type given to Transform.wrap does not form valid content of its parent wrapper');
		}
		r = k.from(t[o].type.create(t[o].attrs, r));
	}
	let i = e.start,
		s = e.end;
	n.step(new re(i, s, i, s, new C(r, 0, 0), t.length, !0));
}
function Jf(n, e, t, r, i) {
	if (!r.isTextblock) throw new RangeError('Type given to setBlockType should be a textblock');
	let s = n.steps.length;
	n.doc.nodesBetween(e, t, (o, l) => {
		let a = typeof i == 'function' ? i(o) : i;
		if (o.isTextblock && !o.hasMarkup(r, a) && Gf(n.doc, n.mapping.slice(s).map(l), r)) {
			let c = null;
			if (r.schema.linebreakReplacement) {
				let h = r.whitespace == 'pre',
					p = !!r.contentMatch.matchType(r.schema.linebreakReplacement);
				h && !p ? (c = !1) : !h && p && (c = !0);
			}
			(c === !1 && fc(n, o, l, s), uo(n, n.mapping.slice(s).map(l, 1), r, void 0, c === null));
			let d = n.mapping.slice(s),
				u = d.map(l, 1),
				f = d.map(l + o.nodeSize, 1);
			return (n.step(new re(u, f, u + 1, f - 1, new C(k.from(r.create(a, null, o.marks)), 0, 0), 1, !0)), c === !0 && uc(n, o, l, s), !1);
		}
	});
}
function uc(n, e, t, r) {
	e.forEach((i, s) => {
		if (i.isText) {
			let o,
				l = /\r?\n|\r/g;
			for (; (o = l.exec(i.text)); ) {
				let a = n.mapping.slice(r).map(t + 1 + s + o.index);
				n.replaceWith(a, a + 1, e.type.schema.linebreakReplacement.create());
			}
		}
	});
}
function fc(n, e, t, r) {
	e.forEach((i, s) => {
		if (i.type == i.type.schema.linebreakReplacement) {
			let o = n.mapping.slice(r).map(t + 1 + s);
			n.replaceWith(
				o,
				o + 1,
				e.type.schema.text(`
`)
			);
		}
	});
}
function Gf(n, e, t) {
	let r = n.resolve(e),
		i = r.index();
	return r.parent.canReplaceWith(i, i + 1, t);
}
function Yf(n, e, t, r, i) {
	let s = n.doc.nodeAt(e);
	if (!s) throw new RangeError('No node at given position');
	t || (t = s.type);
	let o = t.create(r, null, i || s.marks);
	if (s.isLeaf) return n.replaceWith(e, e + s.nodeSize, o);
	if (!t.validContent(s.content)) throw new RangeError('Invalid content for node type ' + t.name);
	n.step(new re(e, e + s.nodeSize, e + 1, e + s.nodeSize - 1, new C(k.from(o), 0, 0), 1, !0));
}
function at(n, e, t = 1, r) {
	let i = n.resolve(e),
		s = i.depth - t,
		o = (r && r[r.length - 1]) || i.parent;
	if (
		s < 0 ||
		i.parent.type.spec.isolating ||
		!i.parent.canReplace(i.index(), i.parent.childCount) ||
		!o.type.validContent(i.parent.content.cutByIndex(i.index(), i.parent.childCount))
	)
		return !1;
	for (let c = i.depth - 1, d = t - 2; c > s; c--, d--) {
		let u = i.node(c),
			f = i.index(c);
		if (u.type.spec.isolating) return !1;
		let h = u.content.cutByIndex(f, u.childCount),
			p = r && r[d + 1];
		p && (h = h.replaceChild(0, p.type.create(p.attrs)));
		let m = (r && r[d]) || u;
		if (!u.canReplace(f + 1, u.childCount) || !m.type.validContent(h)) return !1;
	}
	let l = i.indexAfter(s),
		a = r && r[0];
	return i.node(s).canReplaceWith(l, l, a ? a.type : i.node(s + 1).type);
}
function Xf(n, e, t = 1, r) {
	let i = n.doc.resolve(e),
		s = k.empty,
		o = k.empty;
	for (let l = i.depth, a = i.depth - t, c = t - 1; l > a; l--, c--) {
		s = k.from(i.node(l).copy(s));
		let d = r && r[c];
		o = k.from(d ? d.type.create(d.attrs, o) : i.node(l).copy(o));
	}
	n.step(new te(e, e, new C(s.append(o), t, t), !0));
}
function Ot(n, e) {
	let t = n.resolve(e),
		r = t.index();
	return hc(t.nodeBefore, t.nodeAfter) && t.parent.canReplace(r, r + 1);
}
function Qf(n, e) {
	e.content.size || n.type.compatibleContent(e.type);
	let t = n.contentMatchAt(n.childCount),
		{ linebreakReplacement: r } = n.type.schema;
	for (let i = 0; i < e.childCount; i++) {
		let s = e.child(i),
			o = s.type == r ? n.type.schema.nodes.text : s.type;
		if (((t = t.matchType(o)), !t || !n.type.allowsMarks(s.marks))) return !1;
	}
	return t.validEnd;
}
function hc(n, e) {
	return !!(n && e && !n.isLeaf && Qf(n, e));
}
function Di(n, e, t = -1) {
	let r = n.resolve(e);
	for (let i = r.depth; ; i--) {
		let s,
			o,
			l = r.index(i);
		if (
			(i == r.depth
				? ((s = r.nodeBefore), (o = r.nodeAfter))
				: t > 0
					? ((s = r.node(i + 1)), l++, (o = r.node(i).maybeChild(l)))
					: ((s = r.node(i).maybeChild(l - 1)), (o = r.node(i + 1))),
			s && !s.isTextblock && hc(s, o) && r.node(i).canReplace(l, l + 1))
		)
			return e;
		if (i == 0) break;
		e = t < 0 ? r.before(i) : r.after(i);
	}
}
function Zf(n, e, t) {
	let r = null,
		{ linebreakReplacement: i } = n.doc.type.schema,
		s = n.doc.resolve(e - t),
		o = s.node().type;
	if (i && o.inlineContent) {
		let d = o.whitespace == 'pre',
			u = !!o.contentMatch.matchType(i);
		d && !u ? (r = !1) : !d && u && (r = !0);
	}
	let l = n.steps.length;
	if (r === !1) {
		let d = n.doc.resolve(e + t);
		fc(n, d.node(), d.before(), l);
	}
	o.inlineContent && uo(n, e + t - 1, o, s.node().contentMatchAt(s.index()), r == null);
	let a = n.mapping.slice(l),
		c = a.map(e - t);
	if ((n.step(new te(c, a.map(e + t, -1), C.empty, !0)), r === !0)) {
		let d = n.doc.resolve(c);
		uc(n, d.node(), d.before(), n.steps.length);
	}
	return n;
}
function eh(n, e, t) {
	let r = n.resolve(e);
	if (r.parent.canReplaceWith(r.index(), r.index(), t)) return e;
	if (r.parentOffset == 0)
		for (let i = r.depth - 1; i >= 0; i--) {
			let s = r.index(i);
			if (r.node(i).canReplaceWith(s, s, t)) return r.before(i + 1);
			if (s > 0) return null;
		}
	if (r.parentOffset == r.parent.content.size)
		for (let i = r.depth - 1; i >= 0; i--) {
			let s = r.indexAfter(i);
			if (r.node(i).canReplaceWith(s, s, t)) return r.after(i + 1);
			if (s < r.node(i).childCount) return null;
		}
	return null;
}
function pc(n, e, t) {
	let r = n.resolve(e);
	if (!t.content.size) return e;
	let i = t.content;
	for (let s = 0; s < t.openStart; s++) i = i.firstChild.content;
	for (let s = 1; s <= (t.openStart == 0 && t.size ? 2 : 1); s++)
		for (let o = r.depth; o >= 0; o--) {
			let l = o == r.depth ? 0 : r.pos <= (r.start(o + 1) + r.end(o + 1)) / 2 ? -1 : 1,
				a = r.index(o) + (l > 0 ? 1 : 0),
				c = r.node(o),
				d = !1;
			if (s == 1) d = c.canReplace(a, a, i);
			else {
				let u = c.contentMatchAt(a).findWrapping(i.firstChild.type);
				d = u && c.canReplaceWith(a, a, u[0]);
			}
			if (d) return l == 0 ? r.pos : l < 0 ? r.before(o + 1) : r.after(o + 1);
		}
	return null;
}
function Li(n, e, t = e, r = C.empty) {
	if (e == t && !r.size) return null;
	let i = n.resolve(e),
		s = n.resolve(t);
	return mc(i, s, r) ? new te(e, t, r) : new th(i, s, r).fit();
}
function mc(n, e, t) {
	return !t.openStart && !t.openEnd && n.start() == e.start() && n.parent.canReplace(n.index(), e.index(), t.content);
}
class th {
	constructor(e, t, r) {
		((this.$from = e), (this.$to = t), (this.unplaced = r), (this.frontier = []), (this.placed = k.empty));
		for (let i = 0; i <= e.depth; i++) {
			let s = e.node(i);
			this.frontier.push({ type: s.type, match: s.contentMatchAt(e.indexAfter(i)) });
		}
		for (let i = e.depth; i > 0; i--) this.placed = k.from(e.node(i).copy(this.placed));
	}
	get depth() {
		return this.frontier.length - 1;
	}
	fit() {
		for (; this.unplaced.size; ) {
			let c = this.findFittable();
			c ? this.placeNodes(c) : this.openMore() || this.dropNode();
		}
		let e = this.mustMoveInline(),
			t = this.placed.size - this.depth - this.$from.depth,
			r = this.$from,
			i = this.close(e < 0 ? this.$to : r.doc.resolve(e));
		if (!i) return null;
		let s = this.placed,
			o = r.depth,
			l = i.depth;
		for (; o && l && s.childCount == 1; ) ((s = s.firstChild.content), o--, l--);
		let a = new C(s, o, l);
		return e > -1 ? new re(r.pos, e, this.$to.pos, this.$to.end(), a, t) : a.size || r.pos != this.$to.pos ? new te(r.pos, i.pos, a) : null;
	}
	findFittable() {
		let e = this.unplaced.openStart;
		for (let t = this.unplaced.content, r = 0, i = this.unplaced.openEnd; r < e; r++) {
			let s = t.firstChild;
			if ((t.childCount > 1 && (i = 0), s.type.spec.isolating && i <= r)) {
				e = r;
				break;
			}
			t = s.content;
		}
		for (let t = 1; t <= 2; t++)
			for (let r = t == 1 ? e : this.unplaced.openStart; r >= 0; r--) {
				let i,
					s = null;
				r ? ((s = rs(this.unplaced.content, r - 1).firstChild), (i = s.content)) : (i = this.unplaced.content);
				let o = i.firstChild;
				for (let l = this.depth; l >= 0; l--) {
					let { type: a, match: c } = this.frontier[l],
						d,
						u = null;
					if (t == 1 && (o ? c.matchType(o.type) || (u = c.fillBefore(k.from(o), !1)) : s && a.compatibleContent(s.type)))
						return { sliceDepth: r, frontierDepth: l, parent: s, inject: u };
					if (t == 2 && o && (d = c.findWrapping(o.type))) return { sliceDepth: r, frontierDepth: l, parent: s, wrap: d };
					if (s && c.matchType(s.type)) break;
				}
			}
	}
	openMore() {
		let { content: e, openStart: t, openEnd: r } = this.unplaced,
			i = rs(e, t);
		return !i.childCount || i.firstChild.isLeaf ? !1 : ((this.unplaced = new C(e, t + 1, Math.max(r, i.size + t >= e.size - r ? t + 1 : 0))), !0);
	}
	dropNode() {
		let { content: e, openStart: t, openEnd: r } = this.unplaced,
			i = rs(e, t);
		if (i.childCount <= 1 && t > 0) {
			let s = e.size - t <= t + i.size;
			this.unplaced = new C(_n(e, t - 1, 1), t - 1, s ? t - 1 : r);
		} else this.unplaced = new C(_n(e, t, 1), t, r);
	}
	placeNodes({ sliceDepth: e, frontierDepth: t, parent: r, inject: i, wrap: s }) {
		for (; this.depth > t; ) this.closeFrontierNode();
		if (s) for (let m = 0; m < s.length; m++) this.openFrontierNode(s[m]);
		let o = this.unplaced,
			l = r ? r.content : o.content,
			a = o.openStart - e,
			c = 0,
			d = [],
			{ match: u, type: f } = this.frontier[t];
		if (i) {
			for (let m = 0; m < i.childCount; m++) d.push(i.child(m));
			u = u.matchFragment(i);
		}
		let h = l.size + e - (o.content.size - o.openEnd);
		for (; c < l.childCount; ) {
			let m = l.child(c),
				g = u.matchType(m.type);
			if (!g) break;
			(c++,
				(c > 1 || a == 0 || m.content.size) && ((u = g), d.push(gc(m.mark(f.allowedMarks(m.marks)), c == 1 ? a : 0, c == l.childCount ? h : -1))));
		}
		let p = c == l.childCount;
		(p || (h = -1),
			(this.placed = Vn(this.placed, t, k.from(d))),
			(this.frontier[t].match = u),
			p && h < 0 && r && r.type == this.frontier[this.depth].type && this.frontier.length > 1 && this.closeFrontierNode());
		for (let m = 0, g = l; m < h; m++) {
			let y = g.lastChild;
			(this.frontier.push({ type: y.type, match: y.contentMatchAt(y.childCount) }), (g = y.content));
		}
		this.unplaced = p
			? e == 0
				? C.empty
				: new C(_n(o.content, e - 1, 1), e - 1, h < 0 ? o.openEnd : e - 1)
			: new C(_n(o.content, e, c), o.openStart, o.openEnd);
	}
	mustMoveInline() {
		if (!this.$to.parent.isTextblock) return -1;
		let e = this.frontier[this.depth],
			t;
		if (
			!e.type.isTextblock ||
			!is(this.$to, this.$to.depth, e.type, e.match, !1) ||
			(this.$to.depth == this.depth && (t = this.findCloseLevel(this.$to)) && t.depth == this.depth)
		)
			return -1;
		let { depth: r } = this.$to,
			i = this.$to.after(r);
		for (; r > 1 && i == this.$to.end(--r); ) ++i;
		return i;
	}
	findCloseLevel(e) {
		e: for (let t = Math.min(this.depth, e.depth); t >= 0; t--) {
			let { match: r, type: i } = this.frontier[t],
				s = t < e.depth && e.end(t + 1) == e.pos + (e.depth - (t + 1)),
				o = is(e, t, i, r, s);
			if (o) {
				for (let l = t - 1; l >= 0; l--) {
					let { match: a, type: c } = this.frontier[l],
						d = is(e, l, c, a, !0);
					if (!d || d.childCount) continue e;
				}
				return { depth: t, fit: o, move: s ? e.doc.resolve(e.after(t + 1)) : e };
			}
		}
	}
	close(e) {
		let t = this.findCloseLevel(e);
		if (!t) return null;
		for (; this.depth > t.depth; ) this.closeFrontierNode();
		(t.fit.childCount && (this.placed = Vn(this.placed, t.depth, t.fit)), (e = t.move));
		for (let r = t.depth + 1; r <= e.depth; r++) {
			let i = e.node(r),
				s = i.type.contentMatch.fillBefore(i.content, !0, e.index(r));
			this.openFrontierNode(i.type, i.attrs, s);
		}
		return e;
	}
	openFrontierNode(e, t = null, r) {
		let i = this.frontier[this.depth];
		((i.match = i.match.matchType(e)),
			(this.placed = Vn(this.placed, this.depth, k.from(e.create(t, r)))),
			this.frontier.push({ type: e, match: e.contentMatch }));
	}
	closeFrontierNode() {
		let t = this.frontier.pop().match.fillBefore(k.empty, !0);
		t.childCount && (this.placed = Vn(this.placed, this.frontier.length, t));
	}
}
function _n(n, e, t) {
	return e == 0 ? n.cutByIndex(t, n.childCount) : n.replaceChild(0, n.firstChild.copy(_n(n.firstChild.content, e - 1, t)));
}
function Vn(n, e, t) {
	return e == 0 ? n.append(t) : n.replaceChild(n.childCount - 1, n.lastChild.copy(Vn(n.lastChild.content, e - 1, t)));
}
function rs(n, e) {
	for (let t = 0; t < e; t++) n = n.firstChild.content;
	return n;
}
function gc(n, e, t) {
	if (e <= 0) return n;
	let r = n.content;
	return (
		e > 1 && (r = r.replaceChild(0, gc(r.firstChild, e - 1, r.childCount == 1 ? t - 1 : 0))),
		e > 0 &&
			((r = n.type.contentMatch.fillBefore(r).append(r)), t <= 0 && (r = r.append(n.type.contentMatch.matchFragment(r).fillBefore(k.empty, !0)))),
		n.copy(r)
	);
}
function is(n, e, t, r, i) {
	let s = n.node(e),
		o = i ? n.indexAfter(e) : n.index(e);
	if (o == s.childCount && !t.compatibleContent(s.type)) return null;
	let l = r.fillBefore(s.content, !0, o);
	return l && !nh(t, s.content, o) ? l : null;
}
function nh(n, e, t) {
	for (let r = t; r < e.childCount; r++) if (!n.allowsMarks(e.child(r).marks)) return !0;
	return !1;
}
function rh(n) {
	return n.spec.defining || n.spec.definingForContent;
}
function ih(n, e, t, r) {
	if (!r.size) return n.deleteRange(e, t);
	let i = n.doc.resolve(e),
		s = n.doc.resolve(t);
	if (mc(i, s, r)) return n.step(new te(e, t, r));
	let o = bc(i, s);
	o[o.length - 1] == 0 && o.pop();
	let l = -(i.depth + 1);
	o.unshift(l);
	for (let f = i.depth, h = i.pos - 1; f > 0; f--, h--) {
		let p = i.node(f).type.spec;
		if (p.defining || p.definingAsContext || p.isolating) break;
		o.indexOf(f) > -1 ? (l = f) : i.before(f) == h && o.splice(1, 0, -f);
	}
	let a = o.indexOf(l),
		c = [],
		d = r.openStart;
	for (let f = r.content, h = 0; ; h++) {
		let p = f.firstChild;
		if ((c.push(p), h == r.openStart)) break;
		f = p.content;
	}
	for (let f = d - 1; f >= 0; f--) {
		let h = c[f],
			p = rh(h.type);
		if (p && !h.sameMarkup(i.node(Math.abs(l) - 1))) d = f;
		else if (p || !h.type.isTextblock) break;
	}
	for (let f = r.openStart; f >= 0; f--) {
		let h = (f + d + 1) % (r.openStart + 1),
			p = c[h];
		if (p)
			for (let m = 0; m < o.length; m++) {
				let g = o[(m + a) % o.length],
					y = !0;
				g < 0 && ((y = !1), (g = -g));
				let x = i.node(g - 1),
					M = i.index(g - 1);
				if (x.canReplaceWith(M, M, p.type, p.marks))
					return n.replace(i.before(g), y ? s.after(g) : t, new C(yc(r.content, 0, r.openStart, h), h, r.openEnd));
			}
	}
	let u = n.steps.length;
	for (let f = o.length - 1; f >= 0 && (n.replace(e, t, r), !(n.steps.length > u)); f--) {
		let h = o[f];
		h < 0 || ((e = i.before(h)), (t = s.after(h)));
	}
}
function yc(n, e, t, r, i) {
	if (e < t) {
		let s = n.firstChild;
		n = n.replaceChild(0, s.copy(yc(s.content, e + 1, t, r, s)));
	}
	if (e > r) {
		let s = i.contentMatchAt(0),
			o = s.fillBefore(n).append(n);
		n = o.append(s.matchFragment(o).fillBefore(k.empty, !0));
	}
	return n;
}
function sh(n, e, t, r) {
	if (!r.isInline && e == t && n.doc.resolve(e).parent.content.size) {
		let i = eh(n.doc, e, r.type);
		i != null && (e = t = i);
	}
	n.replaceRange(e, t, new C(k.from(r), 0, 0));
}
function oh(n, e, t) {
	let r = n.doc.resolve(e),
		i = n.doc.resolve(t),
		s = bc(r, i);
	for (let o = 0; o < s.length; o++) {
		let l = s[o],
			a = o == s.length - 1;
		if ((a && l == 0) || r.node(l).type.contentMatch.validEnd) return n.delete(r.start(l), i.end(l));
		if (l > 0 && (a || r.node(l - 1).canReplace(r.index(l - 1), i.indexAfter(l - 1)))) return n.delete(r.before(l), i.after(l));
	}
	for (let o = 1; o <= r.depth && o <= i.depth; o++)
		if (
			e - r.start(o) == r.depth - o &&
			t > r.end(o) &&
			i.end(o) - t != i.depth - o &&
			r.start(o - 1) == i.start(o - 1) &&
			r.node(o - 1).canReplace(r.index(o - 1), i.index(o - 1))
		)
			return n.delete(r.before(o), t);
	n.delete(e, t);
}
function bc(n, e) {
	let t = [],
		r = Math.min(n.depth, e.depth);
	for (let i = r; i >= 0; i--) {
		let s = n.start(i);
		if (s < n.pos - (n.depth - i) || e.end(i) > e.pos + (e.depth - i) || n.node(i).type.spec.isolating || e.node(i).type.spec.isolating) break;
		(s == e.start(i) || (i == n.depth && i == e.depth && n.parent.inlineContent && e.parent.inlineContent && i && e.start(i - 1) == s - 1)) &&
			t.push(i);
	}
	return t;
}
class wn extends me {
	constructor(e, t, r) {
		(super(), (this.pos = e), (this.attr = t), (this.value = r));
	}
	apply(e) {
		let t = e.nodeAt(this.pos);
		if (!t) return Y.fail("No node at attribute step's position");
		let r = Object.create(null);
		for (let s in t.attrs) r[s] = t.attrs[s];
		r[this.attr] = this.value;
		let i = t.type.create(r, null, t.marks);
		return Y.fromReplace(e, this.pos, this.pos + 1, new C(k.from(i), 0, t.isLeaf ? 0 : 1));
	}
	getMap() {
		return Me.empty;
	}
	invert(e) {
		return new wn(this.pos, this.attr, e.nodeAt(this.pos).attrs[this.attr]);
	}
	map(e) {
		let t = e.mapResult(this.pos, 1);
		return t.deletedAfter ? null : new wn(t.pos, this.attr, this.value);
	}
	toJSON() {
		return { stepType: 'attr', pos: this.pos, attr: this.attr, value: this.value };
	}
	static fromJSON(e, t) {
		if (typeof t.pos != 'number' || typeof t.attr != 'string') throw new RangeError('Invalid input for AttrStep.fromJSON');
		return new wn(t.pos, t.attr, t.value);
	}
}
me.jsonID('attr', wn);
class ir extends me {
	constructor(e, t) {
		(super(), (this.attr = e), (this.value = t));
	}
	apply(e) {
		let t = Object.create(null);
		for (let i in e.attrs) t[i] = e.attrs[i];
		t[this.attr] = this.value;
		let r = e.type.create(t, e.content, e.marks);
		return Y.ok(r);
	}
	getMap() {
		return Me.empty;
	}
	invert(e) {
		return new ir(this.attr, e.attrs[this.attr]);
	}
	map(e) {
		return this;
	}
	toJSON() {
		return { stepType: 'docAttr', attr: this.attr, value: this.value };
	}
	static fromJSON(e, t) {
		if (typeof t.attr != 'string') throw new RangeError('Invalid input for DocAttrStep.fromJSON');
		return new ir(t.attr, t.value);
	}
}
me.jsonID('docAttr', ir);
let vn = class extends Error {};
vn = function n(e) {
	let t = Error.call(this, e);
	return ((t.__proto__ = n.prototype), t);
};
vn.prototype = Object.create(Error.prototype);
vn.prototype.constructor = vn;
vn.prototype.name = 'TransformError';
class ho {
	constructor(e) {
		((this.doc = e), (this.steps = []), (this.docs = []), (this.mapping = new rr()));
	}
	get before() {
		return this.docs.length ? this.docs[0] : this.doc;
	}
	step(e) {
		let t = this.maybeStep(e);
		if (t.failed) throw new vn(t.failed);
		return this;
	}
	maybeStep(e) {
		let t = e.apply(this.doc);
		return (t.failed || this.addStep(e, t.doc), t);
	}
	get docChanged() {
		return this.steps.length > 0;
	}
	addStep(e, t) {
		(this.docs.push(this.doc), this.steps.push(e), this.mapping.appendMap(e.getMap()), (this.doc = t));
	}
	replace(e, t = e, r = C.empty) {
		let i = Li(this.doc, e, t, r);
		return (i && this.step(i), this);
	}
	replaceWith(e, t, r) {
		return this.replace(e, t, new C(k.from(r), 0, 0));
	}
	delete(e, t) {
		return this.replace(e, t, C.empty);
	}
	insert(e, t) {
		return this.replaceWith(e, e, t);
	}
	replaceRange(e, t, r) {
		return (ih(this, e, t, r), this);
	}
	replaceRangeWith(e, t, r) {
		return (sh(this, e, t, r), this);
	}
	deleteRange(e, t) {
		return (oh(this, e, t), this);
	}
	lift(e, t) {
		return (jf(this, e, t), this);
	}
	join(e, t = 1) {
		return (Zf(this, e, t), this);
	}
	wrap(e, t) {
		return (qf(this, e, t), this);
	}
	setBlockType(e, t = e, r, i = null) {
		return (Jf(this, e, t, r, i), this);
	}
	setNodeMarkup(e, t, r = null, i) {
		return (Yf(this, e, t, r, i), this);
	}
	setNodeAttribute(e, t, r) {
		return (this.step(new wn(e, t, r)), this);
	}
	setDocAttribute(e, t) {
		return (this.step(new ir(e, t)), this);
	}
	addNodeMark(e, t) {
		return (this.step(new St(e, t)), this);
	}
	removeNodeMark(e, t) {
		let r = this.doc.nodeAt(e);
		if (!r) throw new RangeError('No node at position ' + e);
		if (t instanceof F) t.isInSet(r.marks) && this.step(new Yt(e, t));
		else {
			let i = r.marks,
				s,
				o = [];
			for (; (s = t.isInSet(i)); ) (o.push(new Yt(e, s)), (i = s.removeFromSet(i)));
			for (let l = o.length - 1; l >= 0; l--) this.step(o[l]);
		}
		return this;
	}
	split(e, t = 1, r) {
		return (Xf(this, e, t, r), this);
	}
	addMark(e, t, r) {
		return (_f(this, e, t, r), this);
	}
	removeMark(e, t, r) {
		return (Vf(this, e, t, r), this);
	}
	clearIncompatible(e, t, r) {
		return (uo(this, e, t, r), this);
	}
}
const ss = Object.create(null);
class R {
	constructor(e, t, r) {
		((this.$anchor = e), (this.$head = t), (this.ranges = r || [new kc(e.min(t), e.max(t))]));
	}
	get anchor() {
		return this.$anchor.pos;
	}
	get head() {
		return this.$head.pos;
	}
	get from() {
		return this.$from.pos;
	}
	get to() {
		return this.$to.pos;
	}
	get $from() {
		return this.ranges[0].$from;
	}
	get $to() {
		return this.ranges[0].$to;
	}
	get empty() {
		let e = this.ranges;
		for (let t = 0; t < e.length; t++) if (e[t].$from.pos != e[t].$to.pos) return !1;
		return !0;
	}
	content() {
		return this.$from.doc.slice(this.from, this.to, !0);
	}
	replace(e, t = C.empty) {
		let r = t.content.lastChild,
			i = null;
		for (let l = 0; l < t.openEnd; l++) ((i = r), (r = r.lastChild));
		let s = e.steps.length,
			o = this.ranges;
		for (let l = 0; l < o.length; l++) {
			let { $from: a, $to: c } = o[l],
				d = e.mapping.slice(s);
			(e.replaceRange(d.map(a.pos), d.map(c.pos), l ? C.empty : t), l == 0 && yl(e, s, (r ? r.isInline : i && i.isTextblock) ? -1 : 1));
		}
	}
	replaceWith(e, t) {
		let r = e.steps.length,
			i = this.ranges;
		for (let s = 0; s < i.length; s++) {
			let { $from: o, $to: l } = i[s],
				a = e.mapping.slice(r),
				c = a.map(o.pos),
				d = a.map(l.pos);
			s ? e.deleteRange(c, d) : (e.replaceRangeWith(c, d, t), yl(e, r, t.isInline ? -1 : 1));
		}
	}
	static findFrom(e, t, r = !1) {
		let i = e.parent.inlineContent ? new O(e) : gn(e.node(0), e.parent, e.pos, e.index(), t, r);
		if (i) return i;
		for (let s = e.depth - 1; s >= 0; s--) {
			let o = t < 0 ? gn(e.node(0), e.node(s), e.before(s + 1), e.index(s), t, r) : gn(e.node(0), e.node(s), e.after(s + 1), e.index(s) + 1, t, r);
			if (o) return o;
		}
		return null;
	}
	static near(e, t = 1) {
		return this.findFrom(e, t) || this.findFrom(e, -t) || new Ae(e.node(0));
	}
	static atStart(e) {
		return gn(e, e, 0, 0, 1) || new Ae(e);
	}
	static atEnd(e) {
		return gn(e, e, e.content.size, e.childCount, -1) || new Ae(e);
	}
	static fromJSON(e, t) {
		if (!t || !t.type) throw new RangeError('Invalid input for Selection.fromJSON');
		let r = ss[t.type];
		if (!r) throw new RangeError(`No selection type ${t.type} defined`);
		return r.fromJSON(e, t);
	}
	static jsonID(e, t) {
		if (e in ss) throw new RangeError('Duplicate use of selection JSON ID ' + e);
		return ((ss[e] = t), (t.prototype.jsonID = e), t);
	}
	getBookmark() {
		return O.between(this.$anchor, this.$head).getBookmark();
	}
}
R.prototype.visible = !0;
class kc {
	constructor(e, t) {
		((this.$from = e), (this.$to = t));
	}
}
let ml = !1;
function gl(n) {
	!ml &&
		!n.parent.inlineContent &&
		((ml = !0), console.warn('TextSelection endpoint not pointing into a node with inline content (' + n.parent.type.name + ')'));
}
class O extends R {
	constructor(e, t = e) {
		(gl(e), gl(t), super(e, t));
	}
	get $cursor() {
		return this.$anchor.pos == this.$head.pos ? this.$head : null;
	}
	map(e, t) {
		let r = e.resolve(t.map(this.head));
		if (!r.parent.inlineContent) return R.near(r);
		let i = e.resolve(t.map(this.anchor));
		return new O(i.parent.inlineContent ? i : r, r);
	}
	replace(e, t = C.empty) {
		if ((super.replace(e, t), t == C.empty)) {
			let r = this.$from.marksAcross(this.$to);
			r && e.ensureMarks(r);
		}
	}
	eq(e) {
		return e instanceof O && e.anchor == this.anchor && e.head == this.head;
	}
	getBookmark() {
		return new Pi(this.anchor, this.head);
	}
	toJSON() {
		return { type: 'text', anchor: this.anchor, head: this.head };
	}
	static fromJSON(e, t) {
		if (typeof t.anchor != 'number' || typeof t.head != 'number') throw new RangeError('Invalid input for TextSelection.fromJSON');
		return new O(e.resolve(t.anchor), e.resolve(t.head));
	}
	static create(e, t, r = t) {
		let i = e.resolve(t);
		return new this(i, r == t ? i : e.resolve(r));
	}
	static between(e, t, r) {
		let i = e.pos - t.pos;
		if (((!r || i) && (r = i >= 0 ? 1 : -1), !t.parent.inlineContent)) {
			let s = R.findFrom(t, r, !0) || R.findFrom(t, -r, !0);
			if (s) t = s.$head;
			else return R.near(t, r);
		}
		return (
			e.parent.inlineContent ||
				(i == 0 ? (e = t) : ((e = (R.findFrom(e, -r, !0) || R.findFrom(e, r, !0)).$anchor), e.pos < t.pos != i < 0 && (e = t))),
			new O(e, t)
		);
	}
}
R.jsonID('text', O);
class Pi {
	constructor(e, t) {
		((this.anchor = e), (this.head = t));
	}
	map(e) {
		return new Pi(e.map(this.anchor), e.map(this.head));
	}
	resolve(e) {
		return O.between(e.resolve(this.anchor), e.resolve(this.head));
	}
}
class N extends R {
	constructor(e) {
		let t = e.nodeAfter,
			r = e.node(0).resolve(e.pos + t.nodeSize);
		(super(e, r), (this.node = t));
	}
	map(e, t) {
		let { deleted: r, pos: i } = t.mapResult(this.anchor),
			s = e.resolve(i);
		return r ? R.near(s) : new N(s);
	}
	content() {
		return new C(k.from(this.node), 0, 0);
	}
	eq(e) {
		return e instanceof N && e.anchor == this.anchor;
	}
	toJSON() {
		return { type: 'node', anchor: this.anchor };
	}
	getBookmark() {
		return new po(this.anchor);
	}
	static fromJSON(e, t) {
		if (typeof t.anchor != 'number') throw new RangeError('Invalid input for NodeSelection.fromJSON');
		return new N(e.resolve(t.anchor));
	}
	static create(e, t) {
		return new N(e.resolve(t));
	}
	static isSelectable(e) {
		return !e.isText && e.type.spec.selectable !== !1;
	}
}
N.prototype.visible = !1;
R.jsonID('node', N);
class po {
	constructor(e) {
		this.anchor = e;
	}
	map(e) {
		let { deleted: t, pos: r } = e.mapResult(this.anchor);
		return t ? new Pi(r, r) : new po(r);
	}
	resolve(e) {
		let t = e.resolve(this.anchor),
			r = t.nodeAfter;
		return r && N.isSelectable(r) ? new N(t) : R.near(t);
	}
}
class Ae extends R {
	constructor(e) {
		super(e.resolve(0), e.resolve(e.content.size));
	}
	replace(e, t = C.empty) {
		if (t == C.empty) {
			e.delete(0, e.doc.content.size);
			let r = R.atStart(e.doc);
			r.eq(e.selection) || e.setSelection(r);
		} else super.replace(e, t);
	}
	toJSON() {
		return { type: 'all' };
	}
	static fromJSON(e) {
		return new Ae(e);
	}
	map(e) {
		return new Ae(e);
	}
	eq(e) {
		return e instanceof Ae;
	}
	getBookmark() {
		return lh;
	}
}
R.jsonID('all', Ae);
const lh = {
	map() {
		return this;
	},
	resolve(n) {
		return new Ae(n);
	}
};
function gn(n, e, t, r, i, s = !1) {
	if (e.inlineContent) return O.create(n, t);
	for (let o = r - (i > 0 ? 0 : 1); i > 0 ? o < e.childCount : o >= 0; o += i) {
		let l = e.child(o);
		if (l.isAtom) {
			if (!s && N.isSelectable(l)) return N.create(n, t - (i < 0 ? l.nodeSize : 0));
		} else {
			let a = gn(n, l, t + i, i < 0 ? l.childCount : 0, i, s);
			if (a) return a;
		}
		t += l.nodeSize * i;
	}
	return null;
}
function yl(n, e, t) {
	let r = n.steps.length - 1;
	if (r < e) return;
	let i = n.steps[r];
	if (!(i instanceof te || i instanceof re)) return;
	let s = n.mapping.maps[r],
		o;
	(s.forEach((l, a, c, d) => {
		o == null && (o = d);
	}),
		n.setSelection(R.near(n.doc.resolve(o), t)));
}
const bl = 1,
	Sr = 2,
	kl = 4;
class ah extends ho {
	constructor(e) {
		(super(e.doc),
			(this.curSelectionFor = 0),
			(this.updated = 0),
			(this.meta = Object.create(null)),
			(this.time = Date.now()),
			(this.curSelection = e.selection),
			(this.storedMarks = e.storedMarks));
	}
	get selection() {
		return (
			this.curSelectionFor < this.steps.length &&
				((this.curSelection = this.curSelection.map(this.doc, this.mapping.slice(this.curSelectionFor))), (this.curSelectionFor = this.steps.length)),
			this.curSelection
		);
	}
	setSelection(e) {
		if (e.$from.doc != this.doc) throw new RangeError('Selection passed to setSelection must point at the current document');
		return (
			(this.curSelection = e),
			(this.curSelectionFor = this.steps.length),
			(this.updated = (this.updated | bl) & ~Sr),
			(this.storedMarks = null),
			this
		);
	}
	get selectionSet() {
		return (this.updated & bl) > 0;
	}
	setStoredMarks(e) {
		return ((this.storedMarks = e), (this.updated |= Sr), this);
	}
	ensureMarks(e) {
		return (F.sameSet(this.storedMarks || this.selection.$from.marks(), e) || this.setStoredMarks(e), this);
	}
	addStoredMark(e) {
		return this.ensureMarks(e.addToSet(this.storedMarks || this.selection.$head.marks()));
	}
	removeStoredMark(e) {
		return this.ensureMarks(e.removeFromSet(this.storedMarks || this.selection.$head.marks()));
	}
	get storedMarksSet() {
		return (this.updated & Sr) > 0;
	}
	addStep(e, t) {
		(super.addStep(e, t), (this.updated = this.updated & ~Sr), (this.storedMarks = null));
	}
	setTime(e) {
		return ((this.time = e), this);
	}
	replaceSelection(e) {
		return (this.selection.replace(this, e), this);
	}
	replaceSelectionWith(e, t = !0) {
		let r = this.selection;
		return (t && (e = e.mark(this.storedMarks || (r.empty ? r.$from.marks() : r.$from.marksAcross(r.$to) || F.none))), r.replaceWith(this, e), this);
	}
	deleteSelection() {
		return (this.selection.replace(this), this);
	}
	insertText(e, t, r) {
		let i = this.doc.type.schema;
		if (t == null) return e ? this.replaceSelectionWith(i.text(e), !0) : this.deleteSelection();
		{
			if ((r == null && (r = t), !e)) return this.deleteRange(t, r);
			let s = this.storedMarks;
			if (!s) {
				let o = this.doc.resolve(t);
				s = r == t ? o.marks() : o.marksAcross(this.doc.resolve(r));
			}
			return (
				this.replaceRangeWith(t, r, i.text(e, s)),
				!this.selection.empty && this.selection.to == t + e.length && this.setSelection(R.near(this.selection.$to)),
				this
			);
		}
	}
	setMeta(e, t) {
		return ((this.meta[typeof e == 'string' ? e : e.key] = t), this);
	}
	getMeta(e) {
		return this.meta[typeof e == 'string' ? e : e.key];
	}
	get isGeneric() {
		for (let e in this.meta) return !1;
		return !0;
	}
	scrollIntoView() {
		return ((this.updated |= kl), this);
	}
	get scrolledIntoView() {
		return (this.updated & kl) > 0;
	}
}
function xl(n, e) {
	return !e || !n ? n : n.bind(e);
}
class Wn {
	constructor(e, t, r) {
		((this.name = e), (this.init = xl(t.init, r)), (this.apply = xl(t.apply, r)));
	}
}
const ch = [
	new Wn('doc', {
		init(n) {
			return n.doc || n.schema.topNodeType.createAndFill();
		},
		apply(n) {
			return n.doc;
		}
	}),
	new Wn('selection', {
		init(n, e) {
			return n.selection || R.atStart(e.doc);
		},
		apply(n) {
			return n.selection;
		}
	}),
	new Wn('storedMarks', {
		init(n) {
			return n.storedMarks || null;
		},
		apply(n, e, t, r) {
			return r.selection.$cursor ? n.storedMarks : null;
		}
	}),
	new Wn('scrollToSelection', {
		init() {
			return 0;
		},
		apply(n, e) {
			return n.scrolledIntoView ? e + 1 : e;
		}
	})
];
class ls {
	constructor(e, t) {
		((this.schema = e),
			(this.plugins = []),
			(this.pluginsByKey = Object.create(null)),
			(this.fields = ch.slice()),
			t &&
				t.forEach((r) => {
					if (this.pluginsByKey[r.key]) throw new RangeError('Adding different instances of a keyed plugin (' + r.key + ')');
					(this.plugins.push(r), (this.pluginsByKey[r.key] = r), r.spec.state && this.fields.push(new Wn(r.key, r.spec.state, r)));
				}));
	}
}
class xn {
	constructor(e) {
		this.config = e;
	}
	get schema() {
		return this.config.schema;
	}
	get plugins() {
		return this.config.plugins;
	}
	apply(e) {
		return this.applyTransaction(e).state;
	}
	filterTransaction(e, t = -1) {
		for (let r = 0; r < this.config.plugins.length; r++)
			if (r != t) {
				let i = this.config.plugins[r];
				if (i.spec.filterTransaction && !i.spec.filterTransaction.call(i, e, this)) return !1;
			}
		return !0;
	}
	applyTransaction(e) {
		if (!this.filterTransaction(e)) return { state: this, transactions: [] };
		let t = [e],
			r = this.applyInner(e),
			i = null;
		for (;;) {
			let s = !1;
			for (let o = 0; o < this.config.plugins.length; o++) {
				let l = this.config.plugins[o];
				if (l.spec.appendTransaction) {
					let a = i ? i[o].n : 0,
						c = i ? i[o].state : this,
						d = a < t.length && l.spec.appendTransaction.call(l, a ? t.slice(a) : t, c, r);
					if (d && r.filterTransaction(d, o)) {
						if ((d.setMeta('appendedTransaction', e), !i)) {
							i = [];
							for (let u = 0; u < this.config.plugins.length; u++) i.push(u < o ? { state: r, n: t.length } : { state: this, n: 0 });
						}
						(t.push(d), (r = r.applyInner(d)), (s = !0));
					}
					i && (i[o] = { state: r, n: t.length });
				}
			}
			if (!s) return { state: r, transactions: t };
		}
	}
	applyInner(e) {
		if (!e.before.eq(this.doc)) throw new RangeError('Applying a mismatched transaction');
		let t = new xn(this.config),
			r = this.config.fields;
		for (let i = 0; i < r.length; i++) {
			let s = r[i];
			t[s.name] = s.apply(e, this[s.name], this, t);
		}
		return t;
	}
	get tr() {
		return new ah(this);
	}
	static create(e) {
		let t = new ls(e.doc ? e.doc.type.schema : e.schema, e.plugins),
			r = new xn(t);
		for (let i = 0; i < t.fields.length; i++) r[t.fields[i].name] = t.fields[i].init(e, r);
		return r;
	}
	reconfigure(e) {
		let t = new ls(this.schema, e.plugins),
			r = t.fields,
			i = new xn(t);
		for (let s = 0; s < r.length; s++) {
			let o = r[s].name;
			i[o] = this.hasOwnProperty(o) ? this[o] : r[s].init(e, i);
		}
		return i;
	}
	toJSON(e) {
		let t = { doc: this.doc.toJSON(), selection: this.selection.toJSON() };
		if ((this.storedMarks && (t.storedMarks = this.storedMarks.map((r) => r.toJSON())), e && typeof e == 'object'))
			for (let r in e) {
				if (r == 'doc' || r == 'selection') throw new RangeError('The JSON fields `doc` and `selection` are reserved');
				let i = e[r],
					s = i.spec.state;
				s && s.toJSON && (t[r] = s.toJSON.call(i, this[i.key]));
			}
		return t;
	}
	static fromJSON(e, t, r) {
		if (!t) throw new RangeError('Invalid input for EditorState.fromJSON');
		if (!e.schema) throw new RangeError("Required config field 'schema' missing");
		let i = new ls(e.schema, e.plugins),
			s = new xn(i);
		return (
			i.fields.forEach((o) => {
				if (o.name == 'doc') s.doc = Ve.fromJSON(e.schema, t.doc);
				else if (o.name == 'selection') s.selection = R.fromJSON(s.doc, t.selection);
				else if (o.name == 'storedMarks') t.storedMarks && (s.storedMarks = t.storedMarks.map(e.schema.markFromJSON));
				else {
					if (r)
						for (let l in r) {
							let a = r[l],
								c = a.spec.state;
							if (a.key == o.name && c && c.fromJSON && Object.prototype.hasOwnProperty.call(t, l)) {
								s[o.name] = c.fromJSON.call(a, e, t[l], s);
								return;
							}
						}
					s[o.name] = o.init(e, s);
				}
			}),
			s
		);
	}
}
function xc(n, e, t) {
	for (let r in n) {
		let i = n[r];
		(i instanceof Function ? (i = i.bind(e)) : r == 'handleDOMEvents' && (i = xc(i, e, {})), (t[r] = i));
	}
	return t;
}
class K {
	constructor(e) {
		((this.spec = e), (this.props = {}), e.props && xc(e.props, this, this.props), (this.key = e.key ? e.key.key : wc('plugin')));
	}
	getState(e) {
		return e[this.key];
	}
}
const as = Object.create(null);
function wc(n) {
	return n in as ? n + '$' + ++as[n] : ((as[n] = 0), n + '$');
}
class G {
	constructor(e = 'key') {
		this.key = wc(e);
	}
	get(e) {
		return e.config.pluginsByKey[this.key];
	}
	getState(e) {
		return e[this.key];
	}
}
const mo = (n, e) => (n.selection.empty ? !1 : (e && e(n.tr.deleteSelection().scrollIntoView()), !0));
function Sc(n, e) {
	let { $cursor: t } = n.selection;
	return !t || (e ? !e.endOfTextblock('backward', n) : t.parentOffset > 0) ? null : t;
}
const vc = (n, e, t) => {
		let r = Sc(n, t);
		if (!r) return !1;
		let i = go(r);
		if (!i) {
			let o = r.blockRange(),
				l = o && On(o);
			return l == null ? !1 : (e && e(n.tr.lift(o, l).scrollIntoView()), !0);
		}
		let s = i.nodeBefore;
		if (Ic(n, i, e, -1)) return !0;
		if (r.parent.content.size == 0 && (Cn(s, 'end') || N.isSelectable(s)))
			for (let o = r.depth; ; o--) {
				let l = Li(n.doc, r.before(o), r.after(o), C.empty);
				if (l && l.slice.size < l.to - l.from) {
					if (e) {
						let a = n.tr.step(l);
						(a.setSelection(Cn(s, 'end') ? R.findFrom(a.doc.resolve(a.mapping.map(i.pos, -1)), -1) : N.create(a.doc, i.pos - s.nodeSize)),
							e(a.scrollIntoView()));
					}
					return !0;
				}
				if (o == 1 || r.node(o - 1).childCount > 1) break;
			}
		return s.isAtom && i.depth == r.depth - 1 ? (e && e(n.tr.delete(i.pos - s.nodeSize, i.pos).scrollIntoView()), !0) : !1;
	},
	dh = (n, e, t) => {
		let r = Sc(n, t);
		if (!r) return !1;
		let i = go(r);
		return i ? Cc(n, i, e) : !1;
	},
	uh = (n, e, t) => {
		let r = Tc(n, t);
		if (!r) return !1;
		let i = yo(r);
		return i ? Cc(n, i, e) : !1;
	};
function Cc(n, e, t) {
	let r = e.nodeBefore,
		i = r,
		s = e.pos - 1;
	for (; !i.isTextblock; s--) {
		if (i.type.spec.isolating) return !1;
		let d = i.lastChild;
		if (!d) return !1;
		i = d;
	}
	let o = e.nodeAfter,
		l = o,
		a = e.pos + 1;
	for (; !l.isTextblock; a++) {
		if (l.type.spec.isolating) return !1;
		let d = l.firstChild;
		if (!d) return !1;
		l = d;
	}
	let c = Li(n.doc, s, a, C.empty);
	if (!c || c.from != s || (c instanceof te && c.slice.size >= a - s)) return !1;
	if (t) {
		let d = n.tr.step(c);
		(d.setSelection(O.create(d.doc, s)), t(d.scrollIntoView()));
	}
	return !0;
}
function Cn(n, e, t = !1) {
	for (let r = n; r; r = e == 'start' ? r.firstChild : r.lastChild) {
		if (r.isTextblock) return !0;
		if (t && r.childCount != 1) return !1;
	}
	return !1;
}
const Mc = (n, e, t) => {
	let { $head: r, empty: i } = n.selection,
		s = r;
	if (!i) return !1;
	if (r.parent.isTextblock) {
		if (t ? !t.endOfTextblock('backward', n) : r.parentOffset > 0) return !1;
		s = go(r);
	}
	let o = s && s.nodeBefore;
	return !o || !N.isSelectable(o) ? !1 : (e && e(n.tr.setSelection(N.create(n.doc, s.pos - o.nodeSize)).scrollIntoView()), !0);
};
function go(n) {
	if (!n.parent.type.spec.isolating)
		for (let e = n.depth - 1; e >= 0; e--) {
			if (n.index(e) > 0) return n.doc.resolve(n.before(e + 1));
			if (n.node(e).type.spec.isolating) break;
		}
	return null;
}
function Tc(n, e) {
	let { $cursor: t } = n.selection;
	return !t || (e ? !e.endOfTextblock('forward', n) : t.parentOffset < t.parent.content.size) ? null : t;
}
const Ac = (n, e, t) => {
		let r = Tc(n, t);
		if (!r) return !1;
		let i = yo(r);
		if (!i) return !1;
		let s = i.nodeAfter;
		if (Ic(n, i, e, 1)) return !0;
		if (r.parent.content.size == 0 && (Cn(s, 'start') || N.isSelectable(s))) {
			let o = Li(n.doc, r.before(), r.after(), C.empty);
			if (o && o.slice.size < o.to - o.from) {
				if (e) {
					let l = n.tr.step(o);
					(l.setSelection(Cn(s, 'start') ? R.findFrom(l.doc.resolve(l.mapping.map(i.pos)), 1) : N.create(l.doc, l.mapping.map(i.pos))),
						e(l.scrollIntoView()));
				}
				return !0;
			}
		}
		return s.isAtom && i.depth == r.depth - 1 ? (e && e(n.tr.delete(i.pos, i.pos + s.nodeSize).scrollIntoView()), !0) : !1;
	},
	Ec = (n, e, t) => {
		let { $head: r, empty: i } = n.selection,
			s = r;
		if (!i) return !1;
		if (r.parent.isTextblock) {
			if (t ? !t.endOfTextblock('forward', n) : r.parentOffset < r.parent.content.size) return !1;
			s = yo(r);
		}
		let o = s && s.nodeAfter;
		return !o || !N.isSelectable(o) ? !1 : (e && e(n.tr.setSelection(N.create(n.doc, s.pos)).scrollIntoView()), !0);
	};
function yo(n) {
	if (!n.parent.type.spec.isolating)
		for (let e = n.depth - 1; e >= 0; e--) {
			let t = n.node(e);
			if (n.index(e) + 1 < t.childCount) return n.doc.resolve(n.after(e + 1));
			if (t.type.spec.isolating) break;
		}
	return null;
}
const fh = (n, e) => {
		let t = n.selection,
			r = t instanceof N,
			i;
		if (r) {
			if (t.node.isTextblock || !Ot(n.doc, t.from)) return !1;
			i = t.from;
		} else if (((i = Di(n.doc, t.from, -1)), i == null)) return !1;
		if (e) {
			let s = n.tr.join(i);
			(r && s.setSelection(N.create(s.doc, i - n.doc.resolve(i).nodeBefore.nodeSize)), e(s.scrollIntoView()));
		}
		return !0;
	},
	hh = (n, e) => {
		let t = n.selection,
			r;
		if (t instanceof N) {
			if (t.node.isTextblock || !Ot(n.doc, t.to)) return !1;
			r = t.to;
		} else if (((r = Di(n.doc, t.to, 1)), r == null)) return !1;
		return (e && e(n.tr.join(r).scrollIntoView()), !0);
	},
	ph = (n, e) => {
		let { $from: t, $to: r } = n.selection,
			i = t.blockRange(r),
			s = i && On(i);
		return s == null ? !1 : (e && e(n.tr.lift(i, s).scrollIntoView()), !0);
	},
	Nc = (n, e) => {
		let { $head: t, $anchor: r } = n.selection;
		return !t.parent.type.spec.code || !t.sameParent(r)
			? !1
			: (e &&
					e(
						n.tr
							.insertText(
								`
`
							)
							.scrollIntoView()
					),
				!0);
	};
function bo(n) {
	for (let e = 0; e < n.edgeCount; e++) {
		let { type: t } = n.edge(e);
		if (t.isTextblock && !t.hasRequiredAttrs()) return t;
	}
	return null;
}
const mh = (n, e) => {
		let { $head: t, $anchor: r } = n.selection;
		if (!t.parent.type.spec.code || !t.sameParent(r)) return !1;
		let i = t.node(-1),
			s = t.indexAfter(-1),
			o = bo(i.contentMatchAt(s));
		if (!o || !i.canReplaceWith(s, s, o)) return !1;
		if (e) {
			let l = t.after(),
				a = n.tr.replaceWith(l, l, o.createAndFill());
			(a.setSelection(R.near(a.doc.resolve(l), 1)), e(a.scrollIntoView()));
		}
		return !0;
	},
	Oc = (n, e) => {
		let t = n.selection,
			{ $from: r, $to: i } = t;
		if (t instanceof Ae || r.parent.inlineContent || i.parent.inlineContent) return !1;
		let s = bo(i.parent.contentMatchAt(i.indexAfter()));
		if (!s || !s.isTextblock) return !1;
		if (e) {
			let o = (!r.parentOffset && i.index() < i.parent.childCount ? r : i).pos,
				l = n.tr.insert(o, s.createAndFill());
			(l.setSelection(O.create(l.doc, o + 1)), e(l.scrollIntoView()));
		}
		return !0;
	},
	Rc = (n, e) => {
		let { $cursor: t } = n.selection;
		if (!t || t.parent.content.size) return !1;
		if (t.depth > 1 && t.after() != t.end(-1)) {
			let s = t.before();
			if (at(n.doc, s)) return (e && e(n.tr.split(s).scrollIntoView()), !0);
		}
		let r = t.blockRange(),
			i = r && On(r);
		return i == null ? !1 : (e && e(n.tr.lift(r, i).scrollIntoView()), !0);
	};
function gh(n) {
	return (e, t) => {
		let { $from: r, $to: i } = e.selection;
		if (e.selection instanceof N && e.selection.node.isBlock)
			return !r.parentOffset || !at(e.doc, r.pos) ? !1 : (t && t(e.tr.split(r.pos).scrollIntoView()), !0);
		if (!r.depth) return !1;
		let s = [],
			o,
			l,
			a = !1,
			c = !1;
		for (let h = r.depth; ; h--)
			if (r.node(h).isBlock) {
				((a = r.end(h) == r.pos + (r.depth - h)),
					(c = r.start(h) == r.pos - (r.depth - h)),
					(l = bo(r.node(h - 1).contentMatchAt(r.indexAfter(h - 1)))),
					s.unshift(a && l ? { type: l } : null),
					(o = h));
				break;
			} else {
				if (h == 1) return !1;
				s.unshift(null);
			}
		let d = e.tr;
		(e.selection instanceof O || e.selection instanceof Ae) && d.deleteSelection();
		let u = d.mapping.map(r.pos),
			f = at(d.doc, u, s.length, s);
		if ((f || ((s[0] = l ? { type: l } : null), (f = at(d.doc, u, s.length, s))), !f)) return !1;
		if ((d.split(u, s.length, s), !a && c && r.node(o).type != l)) {
			let h = d.mapping.map(r.before(o)),
				p = d.doc.resolve(h);
			l && r.node(o - 1).canReplaceWith(p.index(), p.index() + 1, l) && d.setNodeMarkup(d.mapping.map(r.before(o)), l);
		}
		return (t && t(d.scrollIntoView()), !0);
	};
}
const yh = gh(),
	bh = (n, e) => {
		let { $from: t, to: r } = n.selection,
			i,
			s = t.sharedDepth(r);
		return s == 0 ? !1 : ((i = t.before(s)), e && e(n.tr.setSelection(N.create(n.doc, i))), !0);
	};
function kh(n, e, t) {
	let r = e.nodeBefore,
		i = e.nodeAfter,
		s = e.index();
	return !r || !i || !r.type.compatibleContent(i.type)
		? !1
		: !r.content.size && e.parent.canReplace(s - 1, s)
			? (t && t(n.tr.delete(e.pos - r.nodeSize, e.pos).scrollIntoView()), !0)
			: !e.parent.canReplace(s, s + 1) || !(i.isTextblock || Ot(n.doc, e.pos))
				? !1
				: (t && t(n.tr.join(e.pos).scrollIntoView()), !0);
}
function Ic(n, e, t, r) {
	let i = e.nodeBefore,
		s = e.nodeAfter,
		o,
		l,
		a = i.type.spec.isolating || s.type.spec.isolating;
	if (!a && kh(n, e, t)) return !0;
	let c = !a && e.parent.canReplace(e.index(), e.index() + 1);
	if (c && (o = (l = i.contentMatchAt(i.childCount)).findWrapping(s.type)) && l.matchType(o[0] || s.type).validEnd) {
		if (t) {
			let h = e.pos + s.nodeSize,
				p = k.empty;
			for (let y = o.length - 1; y >= 0; y--) p = k.from(o[y].create(null, p));
			p = k.from(i.copy(p));
			let m = n.tr.step(new re(e.pos - 1, h, e.pos, h, new C(p, 1, 0), o.length, !0)),
				g = m.doc.resolve(h + 2 * o.length);
			(g.nodeAfter && g.nodeAfter.type == i.type && Ot(m.doc, g.pos) && m.join(g.pos), t(m.scrollIntoView()));
		}
		return !0;
	}
	let d = s.type.spec.isolating || (r > 0 && a) ? null : R.findFrom(e, 1),
		u = d && d.$from.blockRange(d.$to),
		f = u && On(u);
	if (f != null && f >= e.depth) return (t && t(n.tr.lift(u, f).scrollIntoView()), !0);
	if (c && Cn(s, 'start', !0) && Cn(i, 'end')) {
		let h = i,
			p = [];
		for (; p.push(h), !h.isTextblock; ) h = h.lastChild;
		let m = s,
			g = 1;
		for (; !m.isTextblock; m = m.firstChild) g++;
		if (h.canReplace(h.childCount, h.childCount, m.content)) {
			if (t) {
				let y = k.empty;
				for (let M = p.length - 1; M >= 0; M--) y = k.from(p[M].copy(y));
				let x = n.tr.step(new re(e.pos - p.length, e.pos + s.nodeSize, e.pos + g, e.pos + s.nodeSize - g, new C(y, p.length, 0), 0, !0));
				t(x.scrollIntoView());
			}
			return !0;
		}
	}
	return !1;
}
function Dc(n) {
	return function (e, t) {
		let r = e.selection,
			i = n < 0 ? r.$from : r.$to,
			s = i.depth;
		for (; i.node(s).isInline; ) {
			if (!s) return !1;
			s--;
		}
		return i.node(s).isTextblock ? (t && t(e.tr.setSelection(O.create(e.doc, n < 0 ? i.start(s) : i.end(s)))), !0) : !1;
	};
}
const xh = Dc(-1),
	wh = Dc(1);
function Sh(n, e = null) {
	return function (t, r) {
		let { $from: i, $to: s } = t.selection,
			o = i.blockRange(s),
			l = o && fo(o, n, e);
		return l ? (r && r(t.tr.wrap(o, l).scrollIntoView()), !0) : !1;
	};
}
function wl(n, e = null) {
	return function (t, r) {
		let i = !1;
		for (let s = 0; s < t.selection.ranges.length && !i; s++) {
			let {
				$from: { pos: o },
				$to: { pos: l }
			} = t.selection.ranges[s];
			t.doc.nodesBetween(o, l, (a, c) => {
				if (i) return !1;
				if (!(!a.isTextblock || a.hasMarkup(n, e)))
					if (a.type == n) i = !0;
					else {
						let d = t.doc.resolve(c),
							u = d.index();
						i = d.parent.canReplaceWith(u, u + 1, n);
					}
			});
		}
		if (!i) return !1;
		if (r) {
			let s = t.tr;
			for (let o = 0; o < t.selection.ranges.length; o++) {
				let {
					$from: { pos: l },
					$to: { pos: a }
				} = t.selection.ranges[o];
				s.setBlockType(l, a, n, e);
			}
			r(s.scrollIntoView());
		}
		return !0;
	};
}
function ko(...n) {
	return function (e, t, r) {
		for (let i = 0; i < n.length; i++) if (n[i](e, t, r)) return !0;
		return !1;
	};
}
ko(mo, vc, Mc);
ko(mo, Ac, Ec);
ko(Nc, Oc, Rc, yh);
typeof navigator < 'u' ? /Mac|iP(hone|[oa]d)/.test(navigator.platform) : typeof os < 'u' && os.platform && os.platform() == 'darwin';
function vh(n, e = null) {
	return function (t, r) {
		let { $from: i, $to: s } = t.selection,
			o = i.blockRange(s);
		if (!o) return !1;
		let l = r ? t.tr : null;
		return Ch(l, o, n, e) ? (r && r(l.scrollIntoView()), !0) : !1;
	};
}
function Ch(n, e, t, r = null) {
	let i = !1,
		s = e,
		o = e.$from.doc;
	if (e.depth >= 2 && e.$from.node(e.depth - 1).type.compatibleContent(t) && e.startIndex == 0) {
		if (e.$from.index(e.depth - 1) == 0) return !1;
		let a = o.resolve(e.start - 2);
		((s = new Ur(a, a, e.depth)), e.endIndex < e.parent.childCount && (e = new Ur(e.$from, o.resolve(e.$to.end(e.depth)), e.depth)), (i = !0));
	}
	let l = fo(s, t, r, e);
	return l ? (n && Mh(n, e, l, i, t), !0) : !1;
}
function Mh(n, e, t, r, i) {
	let s = k.empty;
	for (let d = t.length - 1; d >= 0; d--) s = k.from(t[d].type.create(t[d].attrs, s));
	n.step(new re(e.start - (r ? 2 : 0), e.end, e.start, e.end, new C(s, 0, 0), t.length, !0));
	let o = 0;
	for (let d = 0; d < t.length; d++) t[d].type == i && (o = d + 1);
	let l = t.length - o,
		a = e.start + t.length - (r ? 2 : 0),
		c = e.parent;
	for (let d = e.startIndex, u = e.endIndex, f = !0; d < u; d++, f = !1)
		(!f && at(n.doc, a, l) && (n.split(a, l), (a += 2 * l)), (a += c.child(d).nodeSize));
	return n;
}
function Th(n) {
	return function (e, t) {
		let { $from: r, $to: i } = e.selection,
			s = r.blockRange(i, (o) => o.childCount > 0 && o.firstChild.type == n);
		return s ? (t ? (r.node(s.depth - 1).type == n ? Ah(e, t, n, s) : Eh(e, t, s)) : !0) : !1;
	};
}
function Ah(n, e, t, r) {
	let i = n.tr,
		s = r.end,
		o = r.$to.end(r.depth);
	s < o &&
		(i.step(new re(s - 1, o, s, o, new C(k.from(t.create(null, r.parent.copy())), 1, 0), 1, !0)),
		(r = new Ur(i.doc.resolve(r.$from.pos), i.doc.resolve(o), r.depth)));
	const l = On(r);
	if (l == null) return !1;
	i.lift(r, l);
	let a = i.doc.resolve(i.mapping.map(s, -1) - 1);
	return (Ot(i.doc, a.pos) && a.nodeBefore.type == a.nodeAfter.type && i.join(a.pos), e(i.scrollIntoView()), !0);
}
function Eh(n, e, t) {
	let r = n.tr,
		i = t.parent;
	for (let h = t.end, p = t.endIndex - 1, m = t.startIndex; p > m; p--) ((h -= i.child(p).nodeSize), r.delete(h - 1, h + 1));
	let s = r.doc.resolve(t.start),
		o = s.nodeAfter;
	if (r.mapping.map(t.end) != t.start + s.nodeAfter.nodeSize) return !1;
	let l = t.startIndex == 0,
		a = t.endIndex == i.childCount,
		c = s.node(-1),
		d = s.index(-1);
	if (!c.canReplace(d + (l ? 0 : 1), d + 1, o.content.append(a ? k.empty : k.from(i)))) return !1;
	let u = s.pos,
		f = u + o.nodeSize;
	return (
		r.step(
			new re(
				u - (l ? 1 : 0),
				f + (a ? 1 : 0),
				u + 1,
				f - 1,
				new C((l ? k.empty : k.from(i.copy(k.empty))).append(a ? k.empty : k.from(i.copy(k.empty))), l ? 0 : 1, a ? 0 : 1),
				l ? 0 : 1
			)
		),
		e(r.scrollIntoView()),
		!0
	);
}
function Nh(n) {
	return function (e, t) {
		let { $from: r, $to: i } = e.selection,
			s = r.blockRange(i, (c) => c.childCount > 0 && c.firstChild.type == n);
		if (!s) return !1;
		let o = s.startIndex;
		if (o == 0) return !1;
		let l = s.parent,
			a = l.child(o - 1);
		if (a.type != n) return !1;
		if (t) {
			let c = a.lastChild && a.lastChild.type == l.type,
				d = k.from(c ? n.create() : null),
				u = new C(k.from(n.create(null, k.from(l.type.create(null, d)))), c ? 3 : 1, 0),
				f = s.start,
				h = s.end;
			t(e.tr.step(new re(f - (c ? 3 : 1), h, f, h, u, 1, !0)).scrollIntoView());
		}
		return !0;
	};
}
const ae = function (n) {
		for (var e = 0; ; e++) if (((n = n.previousSibling), !n)) return e;
	},
	Mn = function (n) {
		let e = n.assignedSlot || n.parentNode;
		return e && e.nodeType == 11 ? e.host : e;
	};
let Ds = null;
const ot = function (n, e, t) {
		let r = Ds || (Ds = document.createRange());
		return (r.setEnd(n, t ?? n.nodeValue.length), r.setStart(n, e || 0), r);
	},
	Oh = function () {
		Ds = null;
	},
	Xt = function (n, e, t, r) {
		return t && (Sl(n, e, t, r, -1) || Sl(n, e, t, r, 1));
	},
	Rh = /^(img|br|input|textarea|hr)$/i;
function Sl(n, e, t, r, i) {
	for (var s; ; ) {
		if (n == t && e == r) return !0;
		if (e == (i < 0 ? 0 : Ie(n))) {
			let o = n.parentNode;
			if (!o || o.nodeType != 1 || hr(n) || Rh.test(n.nodeName) || n.contentEditable == 'false') return !1;
			((e = ae(n) + (i < 0 ? 0 : 1)), (n = o));
		} else if (n.nodeType == 1) {
			let o = n.childNodes[e + (i < 0 ? -1 : 0)];
			if (o.nodeType == 1 && o.contentEditable == 'false')
				if (!((s = o.pmViewDesc) === null || s === void 0) && s.ignoreForSelection) e += i;
				else return !1;
			else ((n = o), (e = i < 0 ? Ie(n) : 0));
		} else return !1;
	}
}
function Ie(n) {
	return n.nodeType == 3 ? n.nodeValue.length : n.childNodes.length;
}
function Ih(n, e) {
	for (;;) {
		if (n.nodeType == 3 && e) return n;
		if (n.nodeType == 1 && e > 0) {
			if (n.contentEditable == 'false') return null;
			((n = n.childNodes[e - 1]), (e = Ie(n)));
		} else if (n.parentNode && !hr(n)) ((e = ae(n)), (n = n.parentNode));
		else return null;
	}
}
function Dh(n, e) {
	for (;;) {
		if (n.nodeType == 3 && e < n.nodeValue.length) return n;
		if (n.nodeType == 1 && e < n.childNodes.length) {
			if (n.contentEditable == 'false') return null;
			((n = n.childNodes[e]), (e = 0));
		} else if (n.parentNode && !hr(n)) ((e = ae(n) + 1), (n = n.parentNode));
		else return null;
	}
}
function Lh(n, e, t) {
	for (let r = e == 0, i = e == Ie(n); r || i; ) {
		if (n == t) return !0;
		let s = ae(n);
		if (((n = n.parentNode), !n)) return !1;
		((r = r && s == 0), (i = i && s == Ie(n)));
	}
}
function hr(n) {
	let e;
	for (let t = n; t && !(e = t.pmViewDesc); t = t.parentNode);
	return e && e.node && e.node.isBlock && (e.dom == n || e.contentDOM == n);
}
const zi = function (n) {
	return n.focusNode && Xt(n.focusNode, n.focusOffset, n.anchorNode, n.anchorOffset);
};
function $t(n, e) {
	let t = document.createEvent('Event');
	return (t.initEvent('keydown', !0, !0), (t.keyCode = n), (t.key = t.code = e), t);
}
function Ph(n) {
	let e = n.activeElement;
	for (; e && e.shadowRoot; ) e = e.shadowRoot.activeElement;
	return e;
}
function zh(n, e, t) {
	if (n.caretPositionFromPoint)
		try {
			let r = n.caretPositionFromPoint(e, t);
			if (r) return { node: r.offsetNode, offset: Math.min(Ie(r.offsetNode), r.offset) };
		} catch {}
	if (n.caretRangeFromPoint) {
		let r = n.caretRangeFromPoint(e, t);
		if (r) return { node: r.startContainer, offset: Math.min(Ie(r.startContainer), r.startOffset) };
	}
}
const Ge = typeof navigator < 'u' ? navigator : null,
	vl = typeof document < 'u' ? document : null,
	Rt = (Ge && Ge.userAgent) || '',
	Ls = /Edge\/(\d+)/.exec(Rt),
	Lc = /MSIE \d/.exec(Rt),
	Ps = /Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(Rt),
	Se = !!(Lc || Ps || Ls),
	Mt = Lc ? document.documentMode : Ps ? +Ps[1] : Ls ? +Ls[1] : 0,
	De = !Se && /gecko\/(\d+)/i.test(Rt);
De && +(/Firefox\/(\d+)/.exec(Rt) || [0, 0])[1];
const zs = !Se && /Chrome\/(\d+)/.exec(Rt),
	he = !!zs,
	Pc = zs ? +zs[1] : 0,
	be = !Se && !!Ge && /Apple Computer/.test(Ge.vendor),
	Tn = be && (/Mobile\/\w+/.test(Rt) || (!!Ge && Ge.maxTouchPoints > 2)),
	Re = Tn || (Ge ? /Mac/.test(Ge.platform) : !1),
	Bh = Ge ? /Win/.test(Ge.platform) : !1,
	lt = /Android \d/.test(Rt),
	pr = !!vl && 'webkitFontSmoothing' in vl.documentElement.style,
	Hh = pr ? +(/\bAppleWebKit\/(\d+)/.exec(navigator.userAgent) || [0, 0])[1] : 0;
function $h(n) {
	let e = n.defaultView && n.defaultView.visualViewport;
	return e
		? { left: 0, right: e.width, top: 0, bottom: e.height }
		: { left: 0, right: n.documentElement.clientWidth, top: 0, bottom: n.documentElement.clientHeight };
}
function tt(n, e) {
	return typeof n == 'number' ? n : n[e];
}
function Fh(n) {
	let e = n.getBoundingClientRect(),
		t = e.width / n.offsetWidth || 1,
		r = e.height / n.offsetHeight || 1;
	return { left: e.left, right: e.left + n.clientWidth * t, top: e.top, bottom: e.top + n.clientHeight * r };
}
function Cl(n, e, t) {
	let r = n.someProp('scrollThreshold') || 0,
		i = n.someProp('scrollMargin') || 5,
		s = n.dom.ownerDocument;
	for (let o = t || n.dom; o; ) {
		if (o.nodeType != 1) {
			o = Mn(o);
			continue;
		}
		let l = o,
			a = l == s.body,
			c = a ? $h(s) : Fh(l),
			d = 0,
			u = 0;
		if (
			(e.top < c.top + tt(r, 'top')
				? (u = -(c.top - e.top + tt(i, 'top')))
				: e.bottom > c.bottom - tt(r, 'bottom') &&
					(u = e.bottom - e.top > c.bottom - c.top ? e.top + tt(i, 'top') - c.top : e.bottom - c.bottom + tt(i, 'bottom')),
			e.left < c.left + tt(r, 'left')
				? (d = -(c.left - e.left + tt(i, 'left')))
				: e.right > c.right - tt(r, 'right') && (d = e.right - c.right + tt(i, 'right')),
			d || u)
		)
			if (a) s.defaultView.scrollBy(d, u);
			else {
				let h = l.scrollLeft,
					p = l.scrollTop;
				(u && (l.scrollTop += u), d && (l.scrollLeft += d));
				let m = l.scrollLeft - h,
					g = l.scrollTop - p;
				e = { left: e.left - m, top: e.top - g, right: e.right - m, bottom: e.bottom - g };
			}
		let f = a ? 'fixed' : getComputedStyle(o).position;
		if (/^(fixed|sticky)$/.test(f)) break;
		o = f == 'absolute' ? o.offsetParent : Mn(o);
	}
}
function _h(n) {
	let e = n.dom.getBoundingClientRect(),
		t = Math.max(0, e.top),
		r,
		i;
	for (let s = (e.left + e.right) / 2, o = t + 1; o < Math.min(innerHeight, e.bottom); o += 5) {
		let l = n.root.elementFromPoint(s, o);
		if (!l || l == n.dom || !n.dom.contains(l)) continue;
		let a = l.getBoundingClientRect();
		if (a.top >= t - 20) {
			((r = l), (i = a.top));
			break;
		}
	}
	return { refDOM: r, refTop: i, stack: zc(n.dom) };
}
function zc(n) {
	let e = [],
		t = n.ownerDocument;
	for (let r = n; r && (e.push({ dom: r, top: r.scrollTop, left: r.scrollLeft }), n != t); r = Mn(r));
	return e;
}
function Vh({ refDOM: n, refTop: e, stack: t }) {
	let r = n ? n.getBoundingClientRect().top : 0;
	Bc(t, r == 0 ? 0 : r - e);
}
function Bc(n, e) {
	for (let t = 0; t < n.length; t++) {
		let { dom: r, top: i, left: s } = n[t];
		(r.scrollTop != i + e && (r.scrollTop = i + e), r.scrollLeft != s && (r.scrollLeft = s));
	}
}
let pn = null;
function Wh(n) {
	if (n.setActive) return n.setActive();
	if (pn) return n.focus(pn);
	let e = zc(n);
	(n.focus(
		pn == null
			? {
					get preventScroll() {
						return ((pn = { preventScroll: !0 }), !0);
					}
				}
			: void 0
	),
		pn || ((pn = !1), Bc(e, 0)));
}
function Hc(n, e) {
	let t,
		r = 2e8,
		i,
		s = 0,
		o = e.top,
		l = e.top,
		a,
		c;
	for (let d = n.firstChild, u = 0; d; d = d.nextSibling, u++) {
		let f;
		if (d.nodeType == 1) f = d.getClientRects();
		else if (d.nodeType == 3) f = ot(d).getClientRects();
		else continue;
		for (let h = 0; h < f.length; h++) {
			let p = f[h];
			if (p.top <= o && p.bottom >= l) {
				((o = Math.max(p.bottom, o)), (l = Math.min(p.top, l)));
				let m = p.left > e.left ? p.left - e.left : p.right < e.left ? e.left - p.right : 0;
				if (m < r) {
					((t = d),
						(r = m),
						(i = m && t.nodeType == 3 ? { left: p.right < e.left ? p.right : p.left, top: e.top } : e),
						d.nodeType == 1 && m && (s = u + (e.left >= (p.left + p.right) / 2 ? 1 : 0)));
					continue;
				}
			} else
				p.top > e.top &&
					!a &&
					p.left <= e.left &&
					p.right >= e.left &&
					((a = d), (c = { left: Math.max(p.left, Math.min(p.right, e.left)), top: p.top }));
			!t && ((e.left >= p.right && e.top >= p.top) || (e.left >= p.left && e.top >= p.bottom)) && (s = u + 1);
		}
	}
	return (!t && a && ((t = a), (i = c), (r = 0)), t && t.nodeType == 3 ? jh(t, i) : !t || (r && t.nodeType == 1) ? { node: n, offset: s } : Hc(t, i));
}
function jh(n, e) {
	let t = n.nodeValue.length,
		r = document.createRange();
	for (let i = 0; i < t; i++) {
		(r.setEnd(n, i + 1), r.setStart(n, i));
		let s = pt(r, 1);
		if (s.top != s.bottom && xo(e, s)) return { node: n, offset: i + (e.left >= (s.left + s.right) / 2 ? 1 : 0) };
	}
	return { node: n, offset: 0 };
}
function xo(n, e) {
	return n.left >= e.left - 1 && n.left <= e.right + 1 && n.top >= e.top - 1 && n.top <= e.bottom + 1;
}
function Kh(n, e) {
	let t = n.parentNode;
	return t && /^li$/i.test(t.nodeName) && e.left < n.getBoundingClientRect().left ? t : n;
}
function Uh(n, e, t) {
	let { node: r, offset: i } = Hc(e, t),
		s = -1;
	if (r.nodeType == 1 && !r.firstChild) {
		let o = r.getBoundingClientRect();
		s = o.left != o.right && t.left > (o.left + o.right) / 2 ? 1 : -1;
	}
	return n.docView.posFromDOM(r, i, s);
}
function qh(n, e, t, r) {
	let i = -1;
	for (let s = e, o = !1; s != n.dom; ) {
		let l = n.docView.nearestDesc(s, !0),
			a;
		if (!l) return null;
		if (
			l.dom.nodeType == 1 &&
			((l.node.isBlock && l.parent) || !l.contentDOM) &&
			((a = l.dom.getBoundingClientRect()).width || a.height) &&
			(l.node.isBlock &&
				l.parent &&
				!/^T(R|BODY|HEAD|FOOT)$/.test(l.dom.nodeName) &&
				((!o && a.left > r.left) || a.top > r.top ? (i = l.posBefore) : ((!o && a.right < r.left) || a.bottom < r.top) && (i = l.posAfter), (o = !0)),
			!l.contentDOM && i < 0 && !l.node.isText)
		)
			return (l.node.isBlock ? r.top < (a.top + a.bottom) / 2 : r.left < (a.left + a.right) / 2) ? l.posBefore : l.posAfter;
		s = l.dom.parentNode;
	}
	return i > -1 ? i : n.docView.posFromDOM(e, t, -1);
}
function $c(n, e, t) {
	let r = n.childNodes.length;
	if (r && t.top < t.bottom)
		for (let i = Math.max(0, Math.min(r - 1, Math.floor((r * (e.top - t.top)) / (t.bottom - t.top)) - 2)), s = i; ; ) {
			let o = n.childNodes[s];
			if (o.nodeType == 1) {
				let l = o.getClientRects();
				for (let a = 0; a < l.length; a++) {
					let c = l[a];
					if (xo(e, c)) return $c(o, e, c);
				}
			}
			if ((s = (s + 1) % r) == i) break;
		}
	return n;
}
function Jh(n, e) {
	let t = n.dom.ownerDocument,
		r,
		i = 0,
		s = zh(t, e.left, e.top);
	s && ({ node: r, offset: i } = s);
	let o = (n.root.elementFromPoint ? n.root : t).elementFromPoint(e.left, e.top),
		l;
	if (!o || !n.dom.contains(o.nodeType != 1 ? o.parentNode : o)) {
		let c = n.dom.getBoundingClientRect();
		if (!xo(e, c) || ((o = $c(n.dom, e, c)), !o)) return null;
	}
	if (be) for (let c = o; r && c; c = Mn(c)) c.draggable && (r = void 0);
	if (((o = Kh(o, e)), r)) {
		if (De && r.nodeType == 1 && ((i = Math.min(i, r.childNodes.length)), i < r.childNodes.length)) {
			let d = r.childNodes[i],
				u;
			d.nodeName == 'IMG' && (u = d.getBoundingClientRect()).right <= e.left && u.bottom > e.top && i++;
		}
		let c;
		(pr &&
			i &&
			r.nodeType == 1 &&
			(c = r.childNodes[i - 1]).nodeType == 1 &&
			c.contentEditable == 'false' &&
			c.getBoundingClientRect().top >= e.top &&
			i--,
			r == n.dom && i == r.childNodes.length - 1 && r.lastChild.nodeType == 1 && e.top > r.lastChild.getBoundingClientRect().bottom
				? (l = n.state.doc.content.size)
				: (i == 0 || r.nodeType != 1 || r.childNodes[i - 1].nodeName != 'BR') && (l = qh(n, r, i, e)));
	}
	l == null && (l = Uh(n, o, e));
	let a = n.docView.nearestDesc(o, !0);
	return { pos: l, inside: a ? a.posAtStart - a.border : -1 };
}
function Ml(n) {
	return n.top < n.bottom || n.left < n.right;
}
function pt(n, e) {
	let t = n.getClientRects();
	if (t.length) {
		let r = t[e < 0 ? 0 : t.length - 1];
		if (Ml(r)) return r;
	}
	return Array.prototype.find.call(t, Ml) || n.getBoundingClientRect();
}
const Gh = /[\u0590-\u05f4\u0600-\u06ff\u0700-\u08ac]/;
function Fc(n, e, t) {
	let { node: r, offset: i, atom: s } = n.docView.domFromPos(e, t < 0 ? -1 : 1),
		o = pr || De;
	if (r.nodeType == 3)
		if (o && (Gh.test(r.nodeValue) || (t < 0 ? !i : i == r.nodeValue.length))) {
			let a = pt(ot(r, i, i), t);
			if (De && i && /\s/.test(r.nodeValue[i - 1]) && i < r.nodeValue.length) {
				let c = pt(ot(r, i - 1, i - 1), -1);
				if (c.top == a.top) {
					let d = pt(ot(r, i, i + 1), -1);
					if (d.top != a.top) return $n(d, d.left < c.left);
				}
			}
			return a;
		} else {
			let a = i,
				c = i,
				d = t < 0 ? 1 : -1;
			return (t < 0 && !i ? (c++, (d = -1)) : t >= 0 && i == r.nodeValue.length ? (a--, (d = 1)) : t < 0 ? a-- : c++, $n(pt(ot(r, a, c), d), d < 0));
		}
	if (!n.state.doc.resolve(e - (s || 0)).parent.inlineContent) {
		if (s == null && i && (t < 0 || i == Ie(r))) {
			let a = r.childNodes[i - 1];
			if (a.nodeType == 1) return cs(a.getBoundingClientRect(), !1);
		}
		if (s == null && i < Ie(r)) {
			let a = r.childNodes[i];
			if (a.nodeType == 1) return cs(a.getBoundingClientRect(), !0);
		}
		return cs(r.getBoundingClientRect(), t >= 0);
	}
	if (s == null && i && (t < 0 || i == Ie(r))) {
		let a = r.childNodes[i - 1],
			c = a.nodeType == 3 ? ot(a, Ie(a) - (o ? 0 : 1)) : a.nodeType == 1 && (a.nodeName != 'BR' || !a.nextSibling) ? a : null;
		if (c) return $n(pt(c, 1), !1);
	}
	if (s == null && i < Ie(r)) {
		let a = r.childNodes[i];
		for (; a.pmViewDesc && a.pmViewDesc.ignoreForCoords; ) a = a.nextSibling;
		let c = a ? (a.nodeType == 3 ? ot(a, 0, o ? 0 : 1) : a.nodeType == 1 ? a : null) : null;
		if (c) return $n(pt(c, -1), !0);
	}
	return $n(pt(r.nodeType == 3 ? ot(r) : r, -t), t >= 0);
}
function $n(n, e) {
	if (n.width == 0) return n;
	let t = e ? n.left : n.right;
	return { top: n.top, bottom: n.bottom, left: t, right: t };
}
function cs(n, e) {
	if (n.height == 0) return n;
	let t = e ? n.top : n.bottom;
	return { top: t, bottom: t, left: n.left, right: n.right };
}
function _c(n, e, t) {
	let r = n.state,
		i = n.root.activeElement;
	(r != e && n.updateState(e), i != n.dom && n.focus());
	try {
		return t();
	} finally {
		(r != e && n.updateState(r), i != n.dom && i && i.focus());
	}
}
function Yh(n, e, t) {
	let r = e.selection,
		i = t == 'up' ? r.$from : r.$to;
	return _c(n, e, () => {
		let { node: s } = n.docView.domFromPos(i.pos, t == 'up' ? -1 : 1);
		for (;;) {
			let l = n.docView.nearestDesc(s, !0);
			if (!l) break;
			if (l.node.isBlock) {
				s = l.contentDOM || l.dom;
				break;
			}
			s = l.dom.parentNode;
		}
		let o = Fc(n, i.pos, 1);
		for (let l = s.firstChild; l; l = l.nextSibling) {
			let a;
			if (l.nodeType == 1) a = l.getClientRects();
			else if (l.nodeType == 3) a = ot(l, 0, l.nodeValue.length).getClientRects();
			else continue;
			for (let c = 0; c < a.length; c++) {
				let d = a[c];
				if (d.bottom > d.top + 1 && (t == 'up' ? o.top - d.top > (d.bottom - o.top) * 2 : d.bottom - o.bottom > (o.bottom - d.top) * 2)) return !1;
			}
		}
		return !0;
	});
}
const Xh = /[\u0590-\u08ac]/;
function Qh(n, e, t) {
	let { $head: r } = e.selection;
	if (!r.parent.isTextblock) return !1;
	let i = r.parentOffset,
		s = !i,
		o = i == r.parent.content.size,
		l = n.domSelection();
	return l
		? !Xh.test(r.parent.textContent) || !l.modify
			? t == 'left' || t == 'backward'
				? s
				: o
			: _c(n, e, () => {
					let { focusNode: a, focusOffset: c, anchorNode: d, anchorOffset: u } = n.domSelectionRange(),
						f = l.caretBidiLevel;
					l.modify('move', t, 'character');
					let h = r.depth ? n.docView.domAfterPos(r.before()) : n.dom,
						{ focusNode: p, focusOffset: m } = n.domSelectionRange(),
						g = (p && !h.contains(p.nodeType == 1 ? p : p.parentNode)) || (a == p && c == m);
					try {
						(l.collapse(d, u), a && (a != d || c != u) && l.extend && l.extend(a, c));
					} catch {}
					return (f != null && (l.caretBidiLevel = f), g);
				})
		: r.pos == r.start() || r.pos == r.end();
}
let Tl = null,
	Al = null,
	El = !1;
function Zh(n, e, t) {
	return Tl == e && Al == t ? El : ((Tl = e), (Al = t), (El = t == 'up' || t == 'down' ? Yh(n, e, t) : Qh(n, e, t)));
}
const Le = 0,
	Nl = 1,
	Ft = 2,
	Ye = 3;
class mr {
	constructor(e, t, r, i) {
		((this.parent = e), (this.children = t), (this.dom = r), (this.contentDOM = i), (this.dirty = Le), (r.pmViewDesc = this));
	}
	matchesWidget(e) {
		return !1;
	}
	matchesMark(e) {
		return !1;
	}
	matchesNode(e, t, r) {
		return !1;
	}
	matchesHack(e) {
		return !1;
	}
	parseRule() {
		return null;
	}
	stopEvent(e) {
		return !1;
	}
	get size() {
		let e = 0;
		for (let t = 0; t < this.children.length; t++) e += this.children[t].size;
		return e;
	}
	get border() {
		return 0;
	}
	destroy() {
		((this.parent = void 0), this.dom.pmViewDesc == this && (this.dom.pmViewDesc = void 0));
		for (let e = 0; e < this.children.length; e++) this.children[e].destroy();
	}
	posBeforeChild(e) {
		for (let t = 0, r = this.posAtStart; ; t++) {
			let i = this.children[t];
			if (i == e) return r;
			r += i.size;
		}
	}
	get posBefore() {
		return this.parent.posBeforeChild(this);
	}
	get posAtStart() {
		return this.parent ? this.parent.posBeforeChild(this) + this.border : 0;
	}
	get posAfter() {
		return this.posBefore + this.size;
	}
	get posAtEnd() {
		return this.posAtStart + this.size - 2 * this.border;
	}
	localPosFromDOM(e, t, r) {
		if (this.contentDOM && this.contentDOM.contains(e.nodeType == 1 ? e : e.parentNode))
			if (r < 0) {
				let s, o;
				if (e == this.contentDOM) s = e.childNodes[t - 1];
				else {
					for (; e.parentNode != this.contentDOM; ) e = e.parentNode;
					s = e.previousSibling;
				}
				for (; s && !((o = s.pmViewDesc) && o.parent == this); ) s = s.previousSibling;
				return s ? this.posBeforeChild(o) + o.size : this.posAtStart;
			} else {
				let s, o;
				if (e == this.contentDOM) s = e.childNodes[t];
				else {
					for (; e.parentNode != this.contentDOM; ) e = e.parentNode;
					s = e.nextSibling;
				}
				for (; s && !((o = s.pmViewDesc) && o.parent == this); ) s = s.nextSibling;
				return s ? this.posBeforeChild(o) : this.posAtEnd;
			}
		let i;
		if (e == this.dom && this.contentDOM) i = t > ae(this.contentDOM);
		else if (this.contentDOM && this.contentDOM != this.dom && this.dom.contains(this.contentDOM)) i = e.compareDocumentPosition(this.contentDOM) & 2;
		else if (this.dom.firstChild) {
			if (t == 0)
				for (let s = e; ; s = s.parentNode) {
					if (s == this.dom) {
						i = !1;
						break;
					}
					if (s.previousSibling) break;
				}
			if (i == null && t == e.childNodes.length)
				for (let s = e; ; s = s.parentNode) {
					if (s == this.dom) {
						i = !0;
						break;
					}
					if (s.nextSibling) break;
				}
		}
		return (i ?? r > 0) ? this.posAtEnd : this.posAtStart;
	}
	nearestDesc(e, t = !1) {
		for (let r = !0, i = e; i; i = i.parentNode) {
			let s = this.getDesc(i),
				o;
			if (s && (!t || s.node))
				if (r && (o = s.nodeDOM) && !(o.nodeType == 1 ? o.contains(e.nodeType == 1 ? e : e.parentNode) : o == e)) r = !1;
				else return s;
		}
	}
	getDesc(e) {
		let t = e.pmViewDesc;
		for (let r = t; r; r = r.parent) if (r == this) return t;
	}
	posFromDOM(e, t, r) {
		for (let i = e; i; i = i.parentNode) {
			let s = this.getDesc(i);
			if (s) return s.localPosFromDOM(e, t, r);
		}
		return -1;
	}
	descAt(e) {
		for (let t = 0, r = 0; t < this.children.length; t++) {
			let i = this.children[t],
				s = r + i.size;
			if (r == e && s != r) {
				for (; !i.border && i.children.length; )
					for (let o = 0; o < i.children.length; o++) {
						let l = i.children[o];
						if (l.size) {
							i = l;
							break;
						}
					}
				return i;
			}
			if (e < s) return i.descAt(e - r - i.border);
			r = s;
		}
	}
	domFromPos(e, t) {
		if (!this.contentDOM) return { node: this.dom, offset: 0, atom: e + 1 };
		let r = 0,
			i = 0;
		for (let s = 0; r < this.children.length; r++) {
			let o = this.children[r],
				l = s + o.size;
			if (l > e || o instanceof Wc) {
				i = e - s;
				break;
			}
			s = l;
		}
		if (i) return this.children[r].domFromPos(i - this.children[r].border, t);
		for (let s; r && !(s = this.children[r - 1]).size && s instanceof Vc && s.side >= 0; r--);
		if (t <= 0) {
			let s,
				o = !0;
			for (; (s = r ? this.children[r - 1] : null), !(!s || s.dom.parentNode == this.contentDOM); r--, o = !1);
			return s && t && o && !s.border && !s.domAtom ? s.domFromPos(s.size, t) : { node: this.contentDOM, offset: s ? ae(s.dom) + 1 : 0 };
		} else {
			let s,
				o = !0;
			for (; (s = r < this.children.length ? this.children[r] : null), !(!s || s.dom.parentNode == this.contentDOM); r++, o = !1);
			return s && o && !s.border && !s.domAtom
				? s.domFromPos(0, t)
				: { node: this.contentDOM, offset: s ? ae(s.dom) : this.contentDOM.childNodes.length };
		}
	}
	parseRange(e, t, r = 0) {
		if (this.children.length == 0) return { node: this.contentDOM, from: e, to: t, fromOffset: 0, toOffset: this.contentDOM.childNodes.length };
		let i = -1,
			s = -1;
		for (let o = r, l = 0; ; l++) {
			let a = this.children[l],
				c = o + a.size;
			if (i == -1 && e <= c) {
				let d = o + a.border;
				if (e >= d && t <= c - a.border && a.node && a.contentDOM && this.contentDOM.contains(a.contentDOM)) return a.parseRange(e, t, d);
				e = o;
				for (let u = l; u > 0; u--) {
					let f = this.children[u - 1];
					if (f.size && f.dom.parentNode == this.contentDOM && !f.emptyChildAt(1)) {
						i = ae(f.dom) + 1;
						break;
					}
					e -= f.size;
				}
				i == -1 && (i = 0);
			}
			if (i > -1 && (c > t || l == this.children.length - 1)) {
				t = c;
				for (let d = l + 1; d < this.children.length; d++) {
					let u = this.children[d];
					if (u.size && u.dom.parentNode == this.contentDOM && !u.emptyChildAt(-1)) {
						s = ae(u.dom);
						break;
					}
					t += u.size;
				}
				s == -1 && (s = this.contentDOM.childNodes.length);
				break;
			}
			o = c;
		}
		return { node: this.contentDOM, from: e, to: t, fromOffset: i, toOffset: s };
	}
	emptyChildAt(e) {
		if (this.border || !this.contentDOM || !this.children.length) return !1;
		let t = this.children[e < 0 ? 0 : this.children.length - 1];
		return t.size == 0 || t.emptyChildAt(e);
	}
	domAfterPos(e) {
		let { node: t, offset: r } = this.domFromPos(e, 0);
		if (t.nodeType != 1 || r == t.childNodes.length) throw new RangeError('No node after pos ' + e);
		return t.childNodes[r];
	}
	setSelection(e, t, r, i = !1) {
		let s = Math.min(e, t),
			o = Math.max(e, t);
		for (let h = 0, p = 0; h < this.children.length; h++) {
			let m = this.children[h],
				g = p + m.size;
			if (s > p && o < g) return m.setSelection(e - p - m.border, t - p - m.border, r, i);
			p = g;
		}
		let l = this.domFromPos(e, e ? -1 : 1),
			a = t == e ? l : this.domFromPos(t, t ? -1 : 1),
			c = r.root.getSelection(),
			d = r.domSelectionRange(),
			u = !1;
		if ((De || be) && e == t) {
			let { node: h, offset: p } = l;
			if (h.nodeType == 3) {
				if (
					((u = !!(
						p &&
						h.nodeValue[p - 1] ==
							`
`
					)),
					u && p == h.nodeValue.length)
				)
					for (let m = h, g; m; m = m.parentNode) {
						if ((g = m.nextSibling)) {
							g.nodeName == 'BR' && (l = a = { node: g.parentNode, offset: ae(g) + 1 });
							break;
						}
						let y = m.pmViewDesc;
						if (y && y.node && y.node.isBlock) break;
					}
			} else {
				let m = h.childNodes[p - 1];
				u = m && (m.nodeName == 'BR' || m.contentEditable == 'false');
			}
		}
		if (De && d.focusNode && d.focusNode != a.node && d.focusNode.nodeType == 1) {
			let h = d.focusNode.childNodes[d.focusOffset];
			h && h.contentEditable == 'false' && (i = !0);
		}
		if (!(i || (u && be)) && Xt(l.node, l.offset, d.anchorNode, d.anchorOffset) && Xt(a.node, a.offset, d.focusNode, d.focusOffset)) return;
		let f = !1;
		if ((c.extend || e == t) && !(u && De)) {
			c.collapse(l.node, l.offset);
			try {
				(e != t && c.extend(a.node, a.offset), (f = !0));
			} catch {}
		}
		if (!f) {
			if (e > t) {
				let p = l;
				((l = a), (a = p));
			}
			let h = document.createRange();
			(h.setEnd(a.node, a.offset), h.setStart(l.node, l.offset), c.removeAllRanges(), c.addRange(h));
		}
	}
	ignoreMutation(e) {
		return !this.contentDOM && e.type != 'selection';
	}
	get contentLost() {
		return this.contentDOM && this.contentDOM != this.dom && !this.dom.contains(this.contentDOM);
	}
	markDirty(e, t) {
		for (let r = 0, i = 0; i < this.children.length; i++) {
			let s = this.children[i],
				o = r + s.size;
			if (r == o ? e <= o && t >= r : e < o && t > r) {
				let l = r + s.border,
					a = o - s.border;
				if (e >= l && t <= a) {
					((this.dirty = e == r || t == o ? Ft : Nl),
						e == l && t == a && (s.contentLost || s.dom.parentNode != this.contentDOM) ? (s.dirty = Ye) : s.markDirty(e - l, t - l));
					return;
				} else s.dirty = s.dom == s.contentDOM && s.dom.parentNode == this.contentDOM && !s.children.length ? Ft : Ye;
			}
			r = o;
		}
		this.dirty = Ft;
	}
	markParentsDirty() {
		let e = 1;
		for (let t = this.parent; t; t = t.parent, e++) {
			let r = e == 1 ? Ft : Nl;
			t.dirty < r && (t.dirty = r);
		}
	}
	get domAtom() {
		return !1;
	}
	get ignoreForCoords() {
		return !1;
	}
	get ignoreForSelection() {
		return !1;
	}
	isText(e) {
		return !1;
	}
}
class Vc extends mr {
	constructor(e, t, r, i) {
		let s,
			o = t.type.toDOM;
		if (
			(typeof o == 'function' &&
				(o = o(r, () => {
					if (!s) return i;
					if (s.parent) return s.parent.posBeforeChild(s);
				})),
			!t.type.spec.raw)
		) {
			if (o.nodeType != 1) {
				let l = document.createElement('span');
				(l.appendChild(o), (o = l));
			}
			((o.contentEditable = 'false'), o.classList.add('ProseMirror-widget'));
		}
		(super(e, [], o, null), (this.widget = t), (this.widget = t), (s = this));
	}
	matchesWidget(e) {
		return this.dirty == Le && e.type.eq(this.widget.type);
	}
	parseRule() {
		return { ignore: !0 };
	}
	stopEvent(e) {
		let t = this.widget.spec.stopEvent;
		return t ? t(e) : !1;
	}
	ignoreMutation(e) {
		return e.type != 'selection' || this.widget.spec.ignoreSelection;
	}
	destroy() {
		(this.widget.type.destroy(this.dom), super.destroy());
	}
	get domAtom() {
		return !0;
	}
	get ignoreForSelection() {
		return !!this.widget.type.spec.relaxedSide;
	}
	get side() {
		return this.widget.type.side;
	}
}
class ep extends mr {
	constructor(e, t, r, i) {
		(super(e, [], t, null), (this.textDOM = r), (this.text = i));
	}
	get size() {
		return this.text.length;
	}
	localPosFromDOM(e, t) {
		return e != this.textDOM ? this.posAtStart + (t ? this.size : 0) : this.posAtStart + t;
	}
	domFromPos(e) {
		return { node: this.textDOM, offset: e };
	}
	ignoreMutation(e) {
		return e.type === 'characterData' && e.target.nodeValue == e.oldValue;
	}
}
class Qt extends mr {
	constructor(e, t, r, i, s) {
		(super(e, [], r, i), (this.mark = t), (this.spec = s));
	}
	static create(e, t, r, i) {
		let s = i.nodeViews[t.type.name],
			o = s && s(t, i, r);
		return ((!o || !o.dom) && (o = tn.renderSpec(document, t.type.spec.toDOM(t, r), null, t.attrs)), new Qt(e, t, o.dom, o.contentDOM || o.dom, o));
	}
	parseRule() {
		return this.dirty & Ye || this.mark.type.spec.reparseInView
			? null
			: { mark: this.mark.type.name, attrs: this.mark.attrs, contentElement: this.contentDOM };
	}
	matchesMark(e) {
		return this.dirty != Ye && this.mark.eq(e);
	}
	markDirty(e, t) {
		if ((super.markDirty(e, t), this.dirty != Le)) {
			let r = this.parent;
			for (; !r.node; ) r = r.parent;
			(r.dirty < this.dirty && (r.dirty = this.dirty), (this.dirty = Le));
		}
	}
	slice(e, t, r) {
		let i = Qt.create(this.parent, this.mark, !0, r),
			s = this.children,
			o = this.size;
		(t < o && (s = Hs(s, t, o, r)), e > 0 && (s = Hs(s, 0, e, r)));
		for (let l = 0; l < s.length; l++) s[l].parent = i;
		return ((i.children = s), i);
	}
	ignoreMutation(e) {
		return this.spec.ignoreMutation ? this.spec.ignoreMutation(e) : super.ignoreMutation(e);
	}
	destroy() {
		(this.spec.destroy && this.spec.destroy(), super.destroy());
	}
}
class Tt extends mr {
	constructor(e, t, r, i, s, o, l, a, c) {
		(super(e, [], s, o), (this.node = t), (this.outerDeco = r), (this.innerDeco = i), (this.nodeDOM = l));
	}
	static create(e, t, r, i, s, o) {
		let l = s.nodeViews[t.type.name],
			a,
			c =
				l &&
				l(
					t,
					s,
					() => {
						if (!a) return o;
						if (a.parent) return a.parent.posBeforeChild(a);
					},
					r,
					i
				),
			d = c && c.dom,
			u = c && c.contentDOM;
		if (t.isText) {
			if (!d) d = document.createTextNode(t.text);
			else if (d.nodeType != 3) throw new RangeError('Text must be rendered as a DOM text node');
		} else d || ({ dom: d, contentDOM: u } = tn.renderSpec(document, t.type.spec.toDOM(t), null, t.attrs));
		!u &&
			!t.isText &&
			d.nodeName != 'BR' &&
			(d.hasAttribute('contenteditable') || (d.contentEditable = 'false'), t.type.spec.draggable && (d.draggable = !0));
		let f = d;
		return (
			(d = Uc(d, r, t)),
			c
				? (a = new tp(e, t, r, i, d, u || null, f, c, s, o + 1))
				: t.isText
					? new Bi(e, t, r, i, d, f, s)
					: new Tt(e, t, r, i, d, u || null, f, s, o + 1)
		);
	}
	parseRule() {
		if (this.node.type.spec.reparseInView) return null;
		let e = { node: this.node.type.name, attrs: this.node.attrs };
		if ((this.node.type.whitespace == 'pre' && (e.preserveWhitespace = 'full'), !this.contentDOM)) e.getContent = () => this.node.content;
		else if (!this.contentLost) e.contentElement = this.contentDOM;
		else {
			for (let t = this.children.length - 1; t >= 0; t--) {
				let r = this.children[t];
				if (this.dom.contains(r.dom.parentNode)) {
					e.contentElement = r.dom.parentNode;
					break;
				}
			}
			e.contentElement || (e.getContent = () => k.empty);
		}
		return e;
	}
	matchesNode(e, t, r) {
		return this.dirty == Le && e.eq(this.node) && Jr(t, this.outerDeco) && r.eq(this.innerDeco);
	}
	get size() {
		return this.node.nodeSize;
	}
	get border() {
		return this.node.isLeaf ? 0 : 1;
	}
	updateChildren(e, t) {
		let r = this.node.inlineContent,
			i = t,
			s = e.composing ? this.localCompositionInfo(e, t) : null,
			o = s && s.pos > -1 ? s : null,
			l = s && s.pos < 0,
			a = new rp(this, o && o.node, e);
		(op(
			this.node,
			this.innerDeco,
			(c, d, u) => {
				(c.spec.marks
					? a.syncToMarks(c.spec.marks, r, e)
					: c.type.side >= 0 && !u && a.syncToMarks(d == this.node.childCount ? F.none : this.node.child(d).marks, r, e),
					a.placeWidget(c, e, i));
			},
			(c, d, u, f) => {
				a.syncToMarks(c.marks, r, e);
				let h;
				(a.findNodeMatch(c, d, u, f) ||
					(l &&
						e.state.selection.from > i &&
						e.state.selection.to < i + c.nodeSize &&
						(h = a.findIndexWithChild(s.node)) > -1 &&
						a.updateNodeAt(c, d, u, h, e)) ||
					a.updateNextNode(c, d, u, e, f, i) ||
					a.addNode(c, d, u, e, i),
					(i += c.nodeSize));
			}
		),
			a.syncToMarks([], r, e),
			this.node.isTextblock && a.addTextblockHacks(),
			a.destroyRest(),
			(a.changed || this.dirty == Ft) && (o && this.protectLocalComposition(e, o), jc(this.contentDOM, this.children, e), Tn && lp(this.dom)));
	}
	localCompositionInfo(e, t) {
		let { from: r, to: i } = e.state.selection;
		if (!(e.state.selection instanceof O) || r < t || i > t + this.node.content.size) return null;
		let s = e.input.compositionNode;
		if (!s || !this.dom.contains(s.parentNode)) return null;
		if (this.node.inlineContent) {
			let o = s.nodeValue,
				l = ap(this.node.content, o, r - t, i - t);
			return l < 0 ? null : { node: s, pos: l, text: o };
		} else return { node: s, pos: -1, text: '' };
	}
	protectLocalComposition(e, { node: t, pos: r, text: i }) {
		if (this.getDesc(t)) return;
		let s = t;
		for (; s.parentNode != this.contentDOM; s = s.parentNode) {
			for (; s.previousSibling; ) s.parentNode.removeChild(s.previousSibling);
			for (; s.nextSibling; ) s.parentNode.removeChild(s.nextSibling);
			s.pmViewDesc && (s.pmViewDesc = void 0);
		}
		let o = new ep(this, s, t, i);
		(e.input.compositionNodes.push(o), (this.children = Hs(this.children, r, r + i.length, e, o)));
	}
	update(e, t, r, i) {
		return this.dirty == Ye || !e.sameMarkup(this.node) ? !1 : (this.updateInner(e, t, r, i), !0);
	}
	updateInner(e, t, r, i) {
		(this.updateOuterDeco(t), (this.node = e), (this.innerDeco = r), this.contentDOM && this.updateChildren(i, this.posAtStart), (this.dirty = Le));
	}
	updateOuterDeco(e) {
		if (Jr(e, this.outerDeco)) return;
		let t = this.nodeDOM.nodeType != 1,
			r = this.dom;
		((this.dom = Kc(this.dom, this.nodeDOM, Bs(this.outerDeco, this.node, t), Bs(e, this.node, t))),
			this.dom != r && ((r.pmViewDesc = void 0), (this.dom.pmViewDesc = this)),
			(this.outerDeco = e));
	}
	selectNode() {
		this.nodeDOM.nodeType == 1 &&
			(this.nodeDOM.classList.add('ProseMirror-selectednode'), (this.contentDOM || !this.node.type.spec.draggable) && (this.nodeDOM.draggable = !0));
	}
	deselectNode() {
		this.nodeDOM.nodeType == 1 &&
			(this.nodeDOM.classList.remove('ProseMirror-selectednode'),
			(this.contentDOM || !this.node.type.spec.draggable) && this.nodeDOM.removeAttribute('draggable'));
	}
	get domAtom() {
		return this.node.isAtom;
	}
}
function Ol(n, e, t, r, i) {
	Uc(r, e, n);
	let s = new Tt(void 0, n, e, t, r, r, r, i, 0);
	return (s.contentDOM && s.updateChildren(i, 0), s);
}
class Bi extends Tt {
	constructor(e, t, r, i, s, o, l) {
		super(e, t, r, i, s, null, o, l, 0);
	}
	parseRule() {
		let e = this.nodeDOM.parentNode;
		for (; e && e != this.dom && !e.pmIsDeco; ) e = e.parentNode;
		return { skip: e || !0 };
	}
	update(e, t, r, i) {
		return this.dirty == Ye || (this.dirty != Le && !this.inParent()) || !e.sameMarkup(this.node)
			? !1
			: (this.updateOuterDeco(t),
				(this.dirty != Le || e.text != this.node.text) &&
					e.text != this.nodeDOM.nodeValue &&
					((this.nodeDOM.nodeValue = e.text), i.trackWrites == this.nodeDOM && (i.trackWrites = null)),
				(this.node = e),
				(this.dirty = Le),
				!0);
	}
	inParent() {
		let e = this.parent.contentDOM;
		for (let t = this.nodeDOM; t; t = t.parentNode) if (t == e) return !0;
		return !1;
	}
	domFromPos(e) {
		return { node: this.nodeDOM, offset: e };
	}
	localPosFromDOM(e, t, r) {
		return e == this.nodeDOM ? this.posAtStart + Math.min(t, this.node.text.length) : super.localPosFromDOM(e, t, r);
	}
	ignoreMutation(e) {
		return e.type != 'characterData' && e.type != 'selection';
	}
	slice(e, t, r) {
		let i = this.node.cut(e, t),
			s = document.createTextNode(i.text);
		return new Bi(this.parent, i, this.outerDeco, this.innerDeco, s, s, r);
	}
	markDirty(e, t) {
		(super.markDirty(e, t), this.dom != this.nodeDOM && (e == 0 || t == this.nodeDOM.nodeValue.length) && (this.dirty = Ye));
	}
	get domAtom() {
		return !1;
	}
	isText(e) {
		return this.node.text == e;
	}
}
class Wc extends mr {
	parseRule() {
		return { ignore: !0 };
	}
	matchesHack(e) {
		return this.dirty == Le && this.dom.nodeName == e;
	}
	get domAtom() {
		return !0;
	}
	get ignoreForCoords() {
		return this.dom.nodeName == 'IMG';
	}
}
class tp extends Tt {
	constructor(e, t, r, i, s, o, l, a, c, d) {
		(super(e, t, r, i, s, o, l, c, d), (this.spec = a));
	}
	update(e, t, r, i) {
		if (this.dirty == Ye) return !1;
		if (this.spec.update && (this.node.type == e.type || this.spec.multiType)) {
			let s = this.spec.update(e, t, r);
			return (s && this.updateInner(e, t, r, i), s);
		} else return !this.contentDOM && !e.isLeaf ? !1 : super.update(e, t, r, i);
	}
	selectNode() {
		this.spec.selectNode ? this.spec.selectNode() : super.selectNode();
	}
	deselectNode() {
		this.spec.deselectNode ? this.spec.deselectNode() : super.deselectNode();
	}
	setSelection(e, t, r, i) {
		this.spec.setSelection ? this.spec.setSelection(e, t, r.root) : super.setSelection(e, t, r, i);
	}
	destroy() {
		(this.spec.destroy && this.spec.destroy(), super.destroy());
	}
	stopEvent(e) {
		return this.spec.stopEvent ? this.spec.stopEvent(e) : !1;
	}
	ignoreMutation(e) {
		return this.spec.ignoreMutation ? this.spec.ignoreMutation(e) : super.ignoreMutation(e);
	}
}
function jc(n, e, t) {
	let r = n.firstChild,
		i = !1;
	for (let s = 0; s < e.length; s++) {
		let o = e[s],
			l = o.dom;
		if (l.parentNode == n) {
			for (; l != r; ) ((r = Rl(r)), (i = !0));
			r = r.nextSibling;
		} else ((i = !0), n.insertBefore(l, r));
		if (o instanceof Qt) {
			let a = r ? r.previousSibling : n.lastChild;
			(jc(o.contentDOM, o.children, t), (r = a ? a.nextSibling : n.firstChild));
		}
	}
	for (; r; ) ((r = Rl(r)), (i = !0));
	i && t.trackWrites == n && (t.trackWrites = null);
}
const qn = function (n) {
	n && (this.nodeName = n);
};
qn.prototype = Object.create(null);
const _t = [new qn()];
function Bs(n, e, t) {
	if (n.length == 0) return _t;
	let r = t ? _t[0] : new qn(),
		i = [r];
	for (let s = 0; s < n.length; s++) {
		let o = n[s].type.attrs;
		if (o) {
			o.nodeName && i.push((r = new qn(o.nodeName)));
			for (let l in o) {
				let a = o[l];
				a != null &&
					(t && i.length == 1 && i.push((r = new qn(e.isInline ? 'span' : 'div'))),
					l == 'class'
						? (r.class = (r.class ? r.class + ' ' : '') + a)
						: l == 'style'
							? (r.style = (r.style ? r.style + ';' : '') + a)
							: l != 'nodeName' && (r[l] = a));
			}
		}
	}
	return i;
}
function Kc(n, e, t, r) {
	if (t == _t && r == _t) return e;
	let i = e;
	for (let s = 0; s < r.length; s++) {
		let o = r[s],
			l = t[s];
		if (s) {
			let a;
			((l && l.nodeName == o.nodeName && i != n && (a = i.parentNode) && a.nodeName.toLowerCase() == o.nodeName) ||
				((a = document.createElement(o.nodeName)), (a.pmIsDeco = !0), a.appendChild(i), (l = _t[0])),
				(i = a));
		}
		np(i, l || _t[0], o);
	}
	return i;
}
function np(n, e, t) {
	for (let r in e) r != 'class' && r != 'style' && r != 'nodeName' && !(r in t) && n.removeAttribute(r);
	for (let r in t) r != 'class' && r != 'style' && r != 'nodeName' && t[r] != e[r] && n.setAttribute(r, t[r]);
	if (e.class != t.class) {
		let r = e.class ? e.class.split(' ').filter(Boolean) : [],
			i = t.class ? t.class.split(' ').filter(Boolean) : [];
		for (let s = 0; s < r.length; s++) i.indexOf(r[s]) == -1 && n.classList.remove(r[s]);
		for (let s = 0; s < i.length; s++) r.indexOf(i[s]) == -1 && n.classList.add(i[s]);
		n.classList.length == 0 && n.removeAttribute('class');
	}
	if (e.style != t.style) {
		if (e.style) {
			let r = /\s*([\w\-\xa1-\uffff]+)\s*:(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\(.*?\)|[^;])*/g,
				i;
			for (; (i = r.exec(e.style)); ) n.style.removeProperty(i[1]);
		}
		t.style && (n.style.cssText += t.style);
	}
}
function Uc(n, e, t) {
	return Kc(n, n, _t, Bs(e, t, n.nodeType != 1));
}
function Jr(n, e) {
	if (n.length != e.length) return !1;
	for (let t = 0; t < n.length; t++) if (!n[t].type.eq(e[t].type)) return !1;
	return !0;
}
function Rl(n) {
	let e = n.nextSibling;
	return (n.parentNode.removeChild(n), e);
}
class rp {
	constructor(e, t, r) {
		((this.lock = t),
			(this.view = r),
			(this.index = 0),
			(this.stack = []),
			(this.changed = !1),
			(this.top = e),
			(this.preMatch = ip(e.node.content, e)));
	}
	destroyBetween(e, t) {
		if (e != t) {
			for (let r = e; r < t; r++) this.top.children[r].destroy();
			(this.top.children.splice(e, t - e), (this.changed = !0));
		}
	}
	destroyRest() {
		this.destroyBetween(this.index, this.top.children.length);
	}
	syncToMarks(e, t, r) {
		let i = 0,
			s = this.stack.length >> 1,
			o = Math.min(s, e.length);
		for (; i < o && (i == s - 1 ? this.top : this.stack[(i + 1) << 1]).matchesMark(e[i]) && e[i].type.spec.spanning !== !1; ) i++;
		for (; i < s; ) (this.destroyRest(), (this.top.dirty = Le), (this.index = this.stack.pop()), (this.top = this.stack.pop()), s--);
		for (; s < e.length; ) {
			this.stack.push(this.top, this.index + 1);
			let l = -1;
			for (let a = this.index; a < Math.min(this.index + 3, this.top.children.length); a++) {
				let c = this.top.children[a];
				if (c.matchesMark(e[s]) && !this.isLocked(c.dom)) {
					l = a;
					break;
				}
			}
			if (l > -1) (l > this.index && ((this.changed = !0), this.destroyBetween(this.index, l)), (this.top = this.top.children[this.index]));
			else {
				let a = Qt.create(this.top, e[s], t, r);
				(this.top.children.splice(this.index, 0, a), (this.top = a), (this.changed = !0));
			}
			((this.index = 0), s++);
		}
	}
	findNodeMatch(e, t, r, i) {
		let s = -1,
			o;
		if (i >= this.preMatch.index && (o = this.preMatch.matches[i - this.preMatch.index]).parent == this.top && o.matchesNode(e, t, r))
			s = this.top.children.indexOf(o, this.index);
		else
			for (let l = this.index, a = Math.min(this.top.children.length, l + 5); l < a; l++) {
				let c = this.top.children[l];
				if (c.matchesNode(e, t, r) && !this.preMatch.matched.has(c)) {
					s = l;
					break;
				}
			}
		return s < 0 ? !1 : (this.destroyBetween(this.index, s), this.index++, !0);
	}
	updateNodeAt(e, t, r, i, s) {
		let o = this.top.children[i];
		return (
			o.dirty == Ye && o.dom == o.contentDOM && (o.dirty = Ft),
			o.update(e, t, r, s) ? (this.destroyBetween(this.index, i), this.index++, !0) : !1
		);
	}
	findIndexWithChild(e) {
		for (;;) {
			let t = e.parentNode;
			if (!t) return -1;
			if (t == this.top.contentDOM) {
				let r = e.pmViewDesc;
				if (r) {
					for (let i = this.index; i < this.top.children.length; i++) if (this.top.children[i] == r) return i;
				}
				return -1;
			}
			e = t;
		}
	}
	updateNextNode(e, t, r, i, s, o) {
		for (let l = this.index; l < this.top.children.length; l++) {
			let a = this.top.children[l];
			if (a instanceof Tt) {
				let c = this.preMatch.matched.get(a);
				if (c != null && c != s) return !1;
				let d = a.dom,
					u,
					f = this.isLocked(d) && !(e.isText && a.node && a.node.isText && a.nodeDOM.nodeValue == e.text && a.dirty != Ye && Jr(t, a.outerDeco));
				if (!f && a.update(e, t, r, i)) return (this.destroyBetween(this.index, l), a.dom != d && (this.changed = !0), this.index++, !0);
				if (!f && (u = this.recreateWrapper(a, e, t, r, i, o)))
					return (
						this.destroyBetween(this.index, l),
						(this.top.children[this.index] = u),
						u.contentDOM && ((u.dirty = Ft), u.updateChildren(i, o + 1), (u.dirty = Le)),
						(this.changed = !0),
						this.index++,
						!0
					);
				break;
			}
		}
		return !1;
	}
	recreateWrapper(e, t, r, i, s, o) {
		if (e.dirty || t.isAtom || !e.children.length || !e.node.content.eq(t.content) || !Jr(r, e.outerDeco) || !i.eq(e.innerDeco)) return null;
		let l = Tt.create(this.top, t, r, i, s, o);
		if (l.contentDOM) {
			((l.children = e.children), (e.children = []));
			for (let a of l.children) a.parent = l;
		}
		return (e.destroy(), l);
	}
	addNode(e, t, r, i, s) {
		let o = Tt.create(this.top, e, t, r, i, s);
		(o.contentDOM && o.updateChildren(i, s + 1), this.top.children.splice(this.index++, 0, o), (this.changed = !0));
	}
	placeWidget(e, t, r) {
		let i = this.index < this.top.children.length ? this.top.children[this.index] : null;
		if (i && i.matchesWidget(e) && (e == i.widget || !i.widget.type.toDOM.parentNode)) this.index++;
		else {
			let s = new Vc(this.top, e, t, r);
			(this.top.children.splice(this.index++, 0, s), (this.changed = !0));
		}
	}
	addTextblockHacks() {
		let e = this.top.children[this.index - 1],
			t = this.top;
		for (; e instanceof Qt; ) ((t = e), (e = t.children[t.children.length - 1]));
		(!e || !(e instanceof Bi) || /\n$/.test(e.node.text) || (this.view.requiresGeckoHackNode && /\s$/.test(e.node.text))) &&
			((be || he) && e && e.dom.contentEditable == 'false' && this.addHackNode('IMG', t), this.addHackNode('BR', this.top));
	}
	addHackNode(e, t) {
		if (t == this.top && this.index < t.children.length && t.children[this.index].matchesHack(e)) this.index++;
		else {
			let r = document.createElement(e);
			(e == 'IMG' && ((r.className = 'ProseMirror-separator'), (r.alt = '')), e == 'BR' && (r.className = 'ProseMirror-trailingBreak'));
			let i = new Wc(this.top, [], r, null);
			(t != this.top ? t.children.push(i) : t.children.splice(this.index++, 0, i), (this.changed = !0));
		}
	}
	isLocked(e) {
		return this.lock && (e == this.lock || (e.nodeType == 1 && e.contains(this.lock.parentNode)));
	}
}
function ip(n, e) {
	let t = e,
		r = t.children.length,
		i = n.childCount,
		s = new Map(),
		o = [];
	e: for (; i > 0; ) {
		let l;
		for (;;)
			if (r) {
				let c = t.children[r - 1];
				if (c instanceof Qt) ((t = c), (r = c.children.length));
				else {
					((l = c), r--);
					break;
				}
			} else {
				if (t == e) break e;
				((r = t.parent.children.indexOf(t)), (t = t.parent));
			}
		let a = l.node;
		if (a) {
			if (a != n.child(i - 1)) break;
			(--i, s.set(l, i), o.push(l));
		}
	}
	return { index: i, matched: s, matches: o.reverse() };
}
function sp(n, e) {
	return n.type.side - e.type.side;
}
function op(n, e, t, r) {
	let i = e.locals(n),
		s = 0;
	if (i.length == 0) {
		for (let c = 0; c < n.childCount; c++) {
			let d = n.child(c);
			(r(d, i, e.forChild(s, d), c), (s += d.nodeSize));
		}
		return;
	}
	let o = 0,
		l = [],
		a = null;
	for (let c = 0; ; ) {
		let d, u;
		for (; o < i.length && i[o].to == s; ) {
			let g = i[o++];
			g.widget && (d ? (u || (u = [d])).push(g) : (d = g));
		}
		if (d)
			if (u) {
				u.sort(sp);
				for (let g = 0; g < u.length; g++) t(u[g], c, !!a);
			} else t(d, c, !!a);
		let f, h;
		if (a) ((h = -1), (f = a), (a = null));
		else if (c < n.childCount) ((h = c), (f = n.child(c++)));
		else break;
		for (let g = 0; g < l.length; g++) l[g].to <= s && l.splice(g--, 1);
		for (; o < i.length && i[o].from <= s && i[o].to > s; ) l.push(i[o++]);
		let p = s + f.nodeSize;
		if (f.isText) {
			let g = p;
			o < i.length && i[o].from < g && (g = i[o].from);
			for (let y = 0; y < l.length; y++) l[y].to < g && (g = l[y].to);
			g < p && ((a = f.cut(g - s)), (f = f.cut(0, g - s)), (p = g), (h = -1));
		} else for (; o < i.length && i[o].to < p; ) o++;
		let m = f.isInline && !f.isLeaf ? l.filter((g) => !g.inline) : l.slice();
		(r(f, m, e.forChild(s, f), h), (s = p));
	}
}
function lp(n) {
	if (n.nodeName == 'UL' || n.nodeName == 'OL') {
		let e = n.style.cssText;
		((n.style.cssText = e + '; list-style: square !important'), window.getComputedStyle(n).listStyle, (n.style.cssText = e));
	}
}
function ap(n, e, t, r) {
	for (let i = 0, s = 0; i < n.childCount && s <= r; ) {
		let o = n.child(i++),
			l = s;
		if (((s += o.nodeSize), !o.isText)) continue;
		let a = o.text;
		for (; i < n.childCount; ) {
			let c = n.child(i++);
			if (((s += c.nodeSize), !c.isText)) break;
			a += c.text;
		}
		if (s >= t) {
			if (s >= r && a.slice(r - e.length - l, r - l) == e) return r - e.length;
			let c = l < r ? a.lastIndexOf(e, r - l - 1) : -1;
			if (c >= 0 && c + e.length + l >= t) return l + c;
			if (t == r && a.length >= r + e.length - l && a.slice(r - l, r - l + e.length) == e) return r;
		}
	}
	return -1;
}
function Hs(n, e, t, r, i) {
	let s = [];
	for (let o = 0, l = 0; o < n.length; o++) {
		let a = n[o],
			c = l,
			d = (l += a.size);
		c >= t || d <= e
			? s.push(a)
			: (c < e && s.push(a.slice(0, e - c, r)), i && (s.push(i), (i = void 0)), d > t && s.push(a.slice(t - c, a.size, r)));
	}
	return s;
}
function wo(n, e = null) {
	let t = n.domSelectionRange(),
		r = n.state.doc;
	if (!t.focusNode) return null;
	let i = n.docView.nearestDesc(t.focusNode),
		s = i && i.size == 0,
		o = n.docView.posFromDOM(t.focusNode, t.focusOffset, 1);
	if (o < 0) return null;
	let l = r.resolve(o),
		a,
		c;
	if (zi(t)) {
		for (a = o; i && !i.node; ) i = i.parent;
		let u = i.node;
		if (i && u.isAtom && N.isSelectable(u) && i.parent && !(u.isInline && Lh(t.focusNode, t.focusOffset, i.dom))) {
			let f = i.posBefore;
			c = new N(o == f ? l : r.resolve(f));
		}
	} else {
		if (t instanceof n.dom.ownerDocument.defaultView.Selection && t.rangeCount > 1) {
			let u = o,
				f = o;
			for (let h = 0; h < t.rangeCount; h++) {
				let p = t.getRangeAt(h);
				((u = Math.min(u, n.docView.posFromDOM(p.startContainer, p.startOffset, 1))),
					(f = Math.max(f, n.docView.posFromDOM(p.endContainer, p.endOffset, -1))));
			}
			if (u < 0) return null;
			(([a, o] = f == n.state.selection.anchor ? [f, u] : [u, f]), (l = r.resolve(o)));
		} else a = n.docView.posFromDOM(t.anchorNode, t.anchorOffset, 1);
		if (a < 0) return null;
	}
	let d = r.resolve(a);
	if (!c) {
		let u = e == 'pointer' || (n.state.selection.head < l.pos && !s) ? 1 : -1;
		c = So(n, d, l, u);
	}
	return c;
}
function qc(n) {
	return n.editable ? n.hasFocus() : Gc(n) && document.activeElement && document.activeElement.contains(n.dom);
}
function ct(n, e = !1) {
	let t = n.state.selection;
	if ((Jc(n, t), !!qc(n))) {
		if (!e && n.input.mouseDown && n.input.mouseDown.allowDefault && he) {
			let r = n.domSelectionRange(),
				i = n.domObserver.currentSelection;
			if (r.anchorNode && i.anchorNode && Xt(r.anchorNode, r.anchorOffset, i.anchorNode, i.anchorOffset)) {
				((n.input.mouseDown.delayedSelectionSync = !0), n.domObserver.setCurSelection());
				return;
			}
		}
		if ((n.domObserver.disconnectSelection(), n.cursorWrapper)) dp(n);
		else {
			let { anchor: r, head: i } = t,
				s,
				o;
			(Il &&
				!(t instanceof O) &&
				(t.$from.parent.inlineContent || (s = Dl(n, t.from)), !t.empty && !t.$from.parent.inlineContent && (o = Dl(n, t.to))),
				n.docView.setSelection(r, i, n, e),
				Il && (s && Ll(s), o && Ll(o)),
				t.visible
					? n.dom.classList.remove('ProseMirror-hideselection')
					: (n.dom.classList.add('ProseMirror-hideselection'), 'onselectionchange' in document && cp(n)));
		}
		(n.domObserver.setCurSelection(), n.domObserver.connectSelection());
	}
}
const Il = be || (he && Pc < 63);
function Dl(n, e) {
	let { node: t, offset: r } = n.docView.domFromPos(e, 0),
		i = r < t.childNodes.length ? t.childNodes[r] : null,
		s = r ? t.childNodes[r - 1] : null;
	if (be && i && i.contentEditable == 'false') return ds(i);
	if ((!i || i.contentEditable == 'false') && (!s || s.contentEditable == 'false')) {
		if (i) return ds(i);
		if (s) return ds(s);
	}
}
function ds(n) {
	return ((n.contentEditable = 'true'), be && n.draggable && ((n.draggable = !1), (n.wasDraggable = !0)), n);
}
function Ll(n) {
	((n.contentEditable = 'false'), n.wasDraggable && ((n.draggable = !0), (n.wasDraggable = null)));
}
function cp(n) {
	let e = n.dom.ownerDocument;
	e.removeEventListener('selectionchange', n.input.hideSelectionGuard);
	let t = n.domSelectionRange(),
		r = t.anchorNode,
		i = t.anchorOffset;
	e.addEventListener(
		'selectionchange',
		(n.input.hideSelectionGuard = () => {
			(t.anchorNode != r || t.anchorOffset != i) &&
				(e.removeEventListener('selectionchange', n.input.hideSelectionGuard),
				setTimeout(() => {
					(!qc(n) || n.state.selection.visible) && n.dom.classList.remove('ProseMirror-hideselection');
				}, 20));
		})
	);
}
function dp(n) {
	let e = n.domSelection();
	if (!e) return;
	let t = n.cursorWrapper.dom,
		r = t.nodeName == 'IMG';
	(r ? e.collapse(t.parentNode, ae(t) + 1) : e.collapse(t, 0),
		!r && !n.state.selection.visible && Se && Mt <= 11 && ((t.disabled = !0), (t.disabled = !1)));
}
function Jc(n, e) {
	if (e instanceof N) {
		let t = n.docView.descAt(e.from);
		t != n.lastSelectedViewDesc && (Pl(n), t && t.selectNode(), (n.lastSelectedViewDesc = t));
	} else Pl(n);
}
function Pl(n) {
	n.lastSelectedViewDesc && (n.lastSelectedViewDesc.parent && n.lastSelectedViewDesc.deselectNode(), (n.lastSelectedViewDesc = void 0));
}
function So(n, e, t, r) {
	return n.someProp('createSelectionBetween', (i) => i(n, e, t)) || O.between(e, t, r);
}
function zl(n) {
	return n.editable && !n.hasFocus() ? !1 : Gc(n);
}
function Gc(n) {
	let e = n.domSelectionRange();
	if (!e.anchorNode) return !1;
	try {
		return (
			n.dom.contains(e.anchorNode.nodeType == 3 ? e.anchorNode.parentNode : e.anchorNode) &&
			(n.editable || n.dom.contains(e.focusNode.nodeType == 3 ? e.focusNode.parentNode : e.focusNode))
		);
	} catch {
		return !1;
	}
}
function up(n) {
	let e = n.docView.domFromPos(n.state.selection.anchor, 0),
		t = n.domSelectionRange();
	return Xt(e.node, e.offset, t.anchorNode, t.anchorOffset);
}
function $s(n, e) {
	let { $anchor: t, $head: r } = n.selection,
		i = e > 0 ? t.max(r) : t.min(r),
		s = i.parent.inlineContent ? (i.depth ? n.doc.resolve(e > 0 ? i.after() : i.before()) : null) : i;
	return s && R.findFrom(s, e);
}
function mt(n, e) {
	return (n.dispatch(n.state.tr.setSelection(e).scrollIntoView()), !0);
}
function Bl(n, e, t) {
	let r = n.state.selection;
	if (r instanceof O)
		if (t.indexOf('s') > -1) {
			let { $head: i } = r,
				s = i.textOffset ? null : e < 0 ? i.nodeBefore : i.nodeAfter;
			if (!s || s.isText || !s.isLeaf) return !1;
			let o = n.state.doc.resolve(i.pos + s.nodeSize * (e < 0 ? -1 : 1));
			return mt(n, new O(r.$anchor, o));
		} else if (r.empty) {
			if (n.endOfTextblock(e > 0 ? 'forward' : 'backward')) {
				let i = $s(n.state, e);
				return i && i instanceof N ? mt(n, i) : !1;
			} else if (!(Re && t.indexOf('m') > -1)) {
				let i = r.$head,
					s = i.textOffset ? null : e < 0 ? i.nodeBefore : i.nodeAfter,
					o;
				if (!s || s.isText) return !1;
				let l = e < 0 ? i.pos - s.nodeSize : i.pos;
				return s.isAtom || ((o = n.docView.descAt(l)) && !o.contentDOM)
					? N.isSelectable(s)
						? mt(n, new N(e < 0 ? n.state.doc.resolve(i.pos - s.nodeSize) : i))
						: pr
							? mt(n, new O(n.state.doc.resolve(e < 0 ? l : l + s.nodeSize)))
							: !1
					: !1;
			}
		} else return !1;
	else {
		if (r instanceof N && r.node.isInline) return mt(n, new O(e > 0 ? r.$to : r.$from));
		{
			let i = $s(n.state, e);
			return i ? mt(n, i) : !1;
		}
	}
}
function Gr(n) {
	return n.nodeType == 3 ? n.nodeValue.length : n.childNodes.length;
}
function Jn(n, e) {
	let t = n.pmViewDesc;
	return t && t.size == 0 && (e < 0 || n.nextSibling || n.nodeName != 'BR');
}
function mn(n, e) {
	return e < 0 ? fp(n) : hp(n);
}
function fp(n) {
	let e = n.domSelectionRange(),
		t = e.focusNode,
		r = e.focusOffset;
	if (!t) return;
	let i,
		s,
		o = !1;
	for (De && t.nodeType == 1 && r < Gr(t) && Jn(t.childNodes[r], -1) && (o = !0); ; )
		if (r > 0) {
			if (t.nodeType != 1) break;
			{
				let l = t.childNodes[r - 1];
				if (Jn(l, -1)) ((i = t), (s = --r));
				else if (l.nodeType == 3) ((t = l), (r = t.nodeValue.length));
				else break;
			}
		} else {
			if (Yc(t)) break;
			{
				let l = t.previousSibling;
				for (; l && Jn(l, -1); ) ((i = t.parentNode), (s = ae(l)), (l = l.previousSibling));
				if (l) ((t = l), (r = Gr(t)));
				else {
					if (((t = t.parentNode), t == n.dom)) break;
					r = 0;
				}
			}
		}
	o ? Fs(n, t, r) : i && Fs(n, i, s);
}
function hp(n) {
	let e = n.domSelectionRange(),
		t = e.focusNode,
		r = e.focusOffset;
	if (!t) return;
	let i = Gr(t),
		s,
		o;
	for (;;)
		if (r < i) {
			if (t.nodeType != 1) break;
			let l = t.childNodes[r];
			if (Jn(l, 1)) ((s = t), (o = ++r));
			else break;
		} else {
			if (Yc(t)) break;
			{
				let l = t.nextSibling;
				for (; l && Jn(l, 1); ) ((s = l.parentNode), (o = ae(l) + 1), (l = l.nextSibling));
				if (l) ((t = l), (r = 0), (i = Gr(t)));
				else {
					if (((t = t.parentNode), t == n.dom)) break;
					r = i = 0;
				}
			}
		}
	s && Fs(n, s, o);
}
function Yc(n) {
	let e = n.pmViewDesc;
	return e && e.node && e.node.isBlock;
}
function pp(n, e) {
	for (; n && e == n.childNodes.length && !hr(n); ) ((e = ae(n) + 1), (n = n.parentNode));
	for (; n && e < n.childNodes.length; ) {
		let t = n.childNodes[e];
		if (t.nodeType == 3) return t;
		if (t.nodeType == 1 && t.contentEditable == 'false') break;
		((n = t), (e = 0));
	}
}
function mp(n, e) {
	for (; n && !e && !hr(n); ) ((e = ae(n)), (n = n.parentNode));
	for (; n && e; ) {
		let t = n.childNodes[e - 1];
		if (t.nodeType == 3) return t;
		if (t.nodeType == 1 && t.contentEditable == 'false') break;
		((n = t), (e = n.childNodes.length));
	}
}
function Fs(n, e, t) {
	if (e.nodeType != 3) {
		let s, o;
		(o = pp(e, t)) ? ((e = o), (t = 0)) : (s = mp(e, t)) && ((e = s), (t = s.nodeValue.length));
	}
	let r = n.domSelection();
	if (!r) return;
	if (zi(r)) {
		let s = document.createRange();
		(s.setEnd(e, t), s.setStart(e, t), r.removeAllRanges(), r.addRange(s));
	} else r.extend && r.extend(e, t);
	n.domObserver.setCurSelection();
	let { state: i } = n;
	setTimeout(() => {
		n.state == i && ct(n);
	}, 50);
}
function Hl(n, e) {
	let t = n.state.doc.resolve(e);
	if (!(he || Bh) && t.parent.inlineContent) {
		let i = n.coordsAtPos(e);
		if (e > t.start()) {
			let s = n.coordsAtPos(e - 1),
				o = (s.top + s.bottom) / 2;
			if (o > i.top && o < i.bottom && Math.abs(s.left - i.left) > 1) return s.left < i.left ? 'ltr' : 'rtl';
		}
		if (e < t.end()) {
			let s = n.coordsAtPos(e + 1),
				o = (s.top + s.bottom) / 2;
			if (o > i.top && o < i.bottom && Math.abs(s.left - i.left) > 1) return s.left > i.left ? 'ltr' : 'rtl';
		}
	}
	return getComputedStyle(n.dom).direction == 'rtl' ? 'rtl' : 'ltr';
}
function $l(n, e, t) {
	let r = n.state.selection;
	if ((r instanceof O && !r.empty) || t.indexOf('s') > -1 || (Re && t.indexOf('m') > -1)) return !1;
	let { $from: i, $to: s } = r;
	if (!i.parent.inlineContent || n.endOfTextblock(e < 0 ? 'up' : 'down')) {
		let o = $s(n.state, e);
		if (o && o instanceof N) return mt(n, o);
	}
	if (!i.parent.inlineContent) {
		let o = e < 0 ? i : s,
			l = r instanceof Ae ? R.near(o, e) : R.findFrom(o, e);
		return l ? mt(n, l) : !1;
	}
	return !1;
}
function Fl(n, e) {
	if (!(n.state.selection instanceof O)) return !0;
	let { $head: t, $anchor: r, empty: i } = n.state.selection;
	if (!t.sameParent(r)) return !0;
	if (!i) return !1;
	if (n.endOfTextblock(e > 0 ? 'forward' : 'backward')) return !0;
	let s = !t.textOffset && (e < 0 ? t.nodeBefore : t.nodeAfter);
	if (s && !s.isText) {
		let o = n.state.tr;
		return (e < 0 ? o.delete(t.pos - s.nodeSize, t.pos) : o.delete(t.pos, t.pos + s.nodeSize), n.dispatch(o), !0);
	}
	return !1;
}
function _l(n, e, t) {
	(n.domObserver.stop(), (e.contentEditable = t), n.domObserver.start());
}
function gp(n) {
	if (!be || n.state.selection.$head.parentOffset > 0) return !1;
	let { focusNode: e, focusOffset: t } = n.domSelectionRange();
	if (e && e.nodeType == 1 && t == 0 && e.firstChild && e.firstChild.contentEditable == 'false') {
		let r = e.firstChild;
		(_l(n, r, 'true'), setTimeout(() => _l(n, r, 'false'), 20));
	}
	return !1;
}
function yp(n) {
	let e = '';
	return (n.ctrlKey && (e += 'c'), n.metaKey && (e += 'm'), n.altKey && (e += 'a'), n.shiftKey && (e += 's'), e);
}
function bp(n, e) {
	let t = e.keyCode,
		r = yp(e);
	if (t == 8 || (Re && t == 72 && r == 'c')) return Fl(n, -1) || mn(n, -1);
	if ((t == 46 && !e.shiftKey) || (Re && t == 68 && r == 'c')) return Fl(n, 1) || mn(n, 1);
	if (t == 13 || t == 27) return !0;
	if (t == 37 || (Re && t == 66 && r == 'c')) {
		let i = t == 37 ? (Hl(n, n.state.selection.from) == 'ltr' ? -1 : 1) : -1;
		return Bl(n, i, r) || mn(n, i);
	} else if (t == 39 || (Re && t == 70 && r == 'c')) {
		let i = t == 39 ? (Hl(n, n.state.selection.from) == 'ltr' ? 1 : -1) : 1;
		return Bl(n, i, r) || mn(n, i);
	} else {
		if (t == 38 || (Re && t == 80 && r == 'c')) return $l(n, -1, r) || mn(n, -1);
		if (t == 40 || (Re && t == 78 && r == 'c')) return gp(n) || $l(n, 1, r) || mn(n, 1);
		if (r == (Re ? 'm' : 'c') && (t == 66 || t == 73 || t == 89 || t == 90)) return !0;
	}
	return !1;
}
function vo(n, e) {
	n.someProp('transformCopied', (h) => {
		e = h(e, n);
	});
	let t = [],
		{ content: r, openStart: i, openEnd: s } = e;
	for (; i > 1 && s > 1 && r.childCount == 1 && r.firstChild.childCount == 1; ) {
		(i--, s--);
		let h = r.firstChild;
		(t.push(h.type.name, h.attrs != h.type.defaultAttrs ? h.attrs : null), (r = h.content));
	}
	let o = n.someProp('clipboardSerializer') || tn.fromSchema(n.state.schema),
		l = nd(),
		a = l.createElement('div');
	a.appendChild(o.serializeFragment(r, { document: l }));
	let c = a.firstChild,
		d,
		u = 0;
	for (; c && c.nodeType == 1 && (d = td[c.nodeName.toLowerCase()]); ) {
		for (let h = d.length - 1; h >= 0; h--) {
			let p = l.createElement(d[h]);
			for (; a.firstChild; ) p.appendChild(a.firstChild);
			(a.appendChild(p), u++);
		}
		c = a.firstChild;
	}
	c && c.nodeType == 1 && c.setAttribute('data-pm-slice', `${i} ${s}${u ? ` -${u}` : ''} ${JSON.stringify(t)}`);
	let f =
		n.someProp('clipboardTextSerializer', (h) => h(e, n)) ||
		e.content.textBetween(
			0,
			e.content.size,
			`

`
		);
	return { dom: a, text: f, slice: e };
}
function Xc(n, e, t, r, i) {
	let s = i.parent.type.spec.code,
		o,
		l;
	if (!t && !e) return null;
	let a = !!e && (r || s || !t);
	if (a) {
		if (
			(n.someProp('transformPastedText', (f) => {
				e = f(e, s || r, n);
			}),
			s)
		)
			return (
				(l = new C(
					k.from(
						n.state.schema.text(
							e.replace(
								/\r\n?/g,
								`
`
							)
						)
					),
					0,
					0
				)),
				n.someProp('transformPasted', (f) => {
					l = f(l, n, !0);
				}),
				l
			);
		let u = n.someProp('clipboardTextParser', (f) => f(e, i, r, n));
		if (u) l = u;
		else {
			let f = i.marks(),
				{ schema: h } = n.state,
				p = tn.fromSchema(h);
			((o = document.createElement('div')),
				e.split(/(?:\r\n?|\n)+/).forEach((m) => {
					let g = o.appendChild(document.createElement('p'));
					m && g.appendChild(p.serializeNode(h.text(m, f)));
				}));
		}
	} else
		(n.someProp('transformPastedHTML', (u) => {
			t = u(t, n);
		}),
			(o = Sp(t)),
			pr && vp(o));
	let c = o && o.querySelector('[data-pm-slice]'),
		d = c && /^(\d+) (\d+)(?: -(\d+))? (.*)/.exec(c.getAttribute('data-pm-slice') || '');
	if (d && d[3])
		for (let u = +d[3]; u > 0; u--) {
			let f = o.firstChild;
			for (; f && f.nodeType != 1; ) f = f.nextSibling;
			if (!f) break;
			o = f;
		}
	if (
		(l ||
			(l = (n.someProp('clipboardParser') || n.someProp('domParser') || Ct.fromSchema(n.state.schema)).parseSlice(o, {
				preserveWhitespace: !!(a || d),
				context: i,
				ruleFromNode(f) {
					return f.nodeName == 'BR' && !f.nextSibling && f.parentNode && !kp.test(f.parentNode.nodeName) ? { ignore: !0 } : null;
				}
			})),
		d)
	)
		l = Cp(Vl(l, +d[1], +d[2]), d[4]);
	else if (((l = C.maxOpen(xp(l.content, i), !0)), l.openStart || l.openEnd)) {
		let u = 0,
			f = 0;
		for (let h = l.content.firstChild; u < l.openStart && !h.type.spec.isolating; u++, h = h.firstChild);
		for (let h = l.content.lastChild; f < l.openEnd && !h.type.spec.isolating; f++, h = h.lastChild);
		l = Vl(l, u, f);
	}
	return (
		n.someProp('transformPasted', (u) => {
			l = u(l, n, a);
		}),
		l
	);
}
const kp = /^(a|abbr|acronym|b|cite|code|del|em|i|ins|kbd|label|output|q|ruby|s|samp|span|strong|sub|sup|time|u|tt|var)$/i;
function xp(n, e) {
	if (n.childCount < 2) return n;
	for (let t = e.depth; t >= 0; t--) {
		let i = e.node(t).contentMatchAt(e.index(t)),
			s,
			o = [];
		if (
			(n.forEach((l) => {
				if (!o) return;
				let a = i.findWrapping(l.type),
					c;
				if (!a) return (o = null);
				if ((c = o.length && s.length && Zc(a, s, l, o[o.length - 1], 0))) o[o.length - 1] = c;
				else {
					o.length && (o[o.length - 1] = ed(o[o.length - 1], s.length));
					let d = Qc(l, a);
					(o.push(d), (i = i.matchType(d.type)), (s = a));
				}
			}),
			o)
		)
			return k.from(o);
	}
	return n;
}
function Qc(n, e, t = 0) {
	for (let r = e.length - 1; r >= t; r--) n = e[r].create(null, k.from(n));
	return n;
}
function Zc(n, e, t, r, i) {
	if (i < n.length && i < e.length && n[i] == e[i]) {
		let s = Zc(n, e, t, r.lastChild, i + 1);
		if (s) return r.copy(r.content.replaceChild(r.childCount - 1, s));
		if (r.contentMatchAt(r.childCount).matchType(i == n.length - 1 ? t.type : n[i + 1])) return r.copy(r.content.append(k.from(Qc(t, n, i + 1))));
	}
}
function ed(n, e) {
	if (e == 0) return n;
	let t = n.content.replaceChild(n.childCount - 1, ed(n.lastChild, e - 1)),
		r = n.contentMatchAt(n.childCount).fillBefore(k.empty, !0);
	return n.copy(t.append(r));
}
function _s(n, e, t, r, i, s) {
	let o = e < 0 ? n.firstChild : n.lastChild,
		l = o.content;
	return (
		n.childCount > 1 && (s = 0),
		i < r - 1 && (l = _s(l, e, t, r, i + 1, s)),
		i >= t &&
			(l =
				e < 0
					? o
							.contentMatchAt(0)
							.fillBefore(l, s <= i)
							.append(l)
					: l.append(o.contentMatchAt(o.childCount).fillBefore(k.empty, !0))),
		n.replaceChild(e < 0 ? 0 : n.childCount - 1, o.copy(l))
	);
}
function Vl(n, e, t) {
	return (
		e < n.openStart && (n = new C(_s(n.content, -1, e, n.openStart, 0, n.openEnd), e, n.openEnd)),
		t < n.openEnd && (n = new C(_s(n.content, 1, t, n.openEnd, 0, 0), n.openStart, t)),
		n
	);
}
const td = {
	thead: ['table'],
	tbody: ['table'],
	tfoot: ['table'],
	caption: ['table'],
	colgroup: ['table'],
	col: ['table', 'colgroup'],
	tr: ['table', 'tbody'],
	td: ['table', 'tbody', 'tr'],
	th: ['table', 'tbody', 'tr']
};
let Wl = null;
function nd() {
	return Wl || (Wl = document.implementation.createHTMLDocument('title'));
}
let us = null;
function wp(n) {
	let e = window.trustedTypes;
	return e ? (us || (us = e.defaultPolicy || e.createPolicy('ProseMirrorClipboard', { createHTML: (t) => t })), us.createHTML(n)) : n;
}
function Sp(n) {
	let e = /^(\s*<meta [^>]*>)*/.exec(n);
	e && (n = n.slice(e[0].length));
	let t = nd().createElement('div'),
		r = /<([a-z][^>\s]+)/i.exec(n),
		i;
	if (
		((i = r && td[r[1].toLowerCase()]) &&
			(n =
				i.map((s) => '<' + s + '>').join('') +
				n +
				i
					.map((s) => '</' + s + '>')
					.reverse()
					.join('')),
		(t.innerHTML = wp(n)),
		i)
	)
		for (let s = 0; s < i.length; s++) t = t.querySelector(i[s]) || t;
	return t;
}
function vp(n) {
	let e = n.querySelectorAll(he ? 'span:not([class]):not([style])' : 'span.Apple-converted-space');
	for (let t = 0; t < e.length; t++) {
		let r = e[t];
		r.childNodes.length == 1 && r.textContent == ' ' && r.parentNode && r.parentNode.replaceChild(n.ownerDocument.createTextNode(' '), r);
	}
}
function Cp(n, e) {
	if (!n.size) return n;
	let t = n.content.firstChild.type.schema,
		r;
	try {
		r = JSON.parse(e);
	} catch {
		return n;
	}
	let { content: i, openStart: s, openEnd: o } = n;
	for (let l = r.length - 2; l >= 0; l -= 2) {
		let a = t.nodes[r[l]];
		if (!a || a.hasRequiredAttrs()) break;
		((i = k.from(a.create(r[l + 1], i))), s++, o++);
	}
	return new C(i, s, o);
}
const ke = {},
	xe = {},
	Mp = { touchstart: !0, touchmove: !0 };
class Tp {
	constructor() {
		((this.shiftKey = !1),
			(this.mouseDown = null),
			(this.lastKeyCode = null),
			(this.lastKeyCodeTime = 0),
			(this.lastClick = { time: 0, x: 0, y: 0, type: '', button: 0 }),
			(this.lastSelectionOrigin = null),
			(this.lastSelectionTime = 0),
			(this.lastIOSEnter = 0),
			(this.lastIOSEnterFallbackTimeout = -1),
			(this.lastFocus = 0),
			(this.lastTouch = 0),
			(this.lastChromeDelete = 0),
			(this.composing = !1),
			(this.compositionNode = null),
			(this.composingTimeout = -1),
			(this.compositionNodes = []),
			(this.compositionEndedAt = -2e8),
			(this.compositionID = 1),
			(this.compositionPendingChanges = 0),
			(this.domChangeCount = 0),
			(this.eventHandlers = Object.create(null)),
			(this.hideSelectionGuard = null));
	}
}
function Ap(n) {
	for (let e in ke) {
		let t = ke[e];
		n.dom.addEventListener(
			e,
			(n.input.eventHandlers[e] = (r) => {
				Np(n, r) && !Co(n, r) && (n.editable || !(r.type in xe)) && t(n, r);
			}),
			Mp[e] ? { passive: !0 } : void 0
		);
	}
	(be && n.dom.addEventListener('input', () => null), Vs(n));
}
function vt(n, e) {
	((n.input.lastSelectionOrigin = e), (n.input.lastSelectionTime = Date.now()));
}
function Ep(n) {
	n.domObserver.stop();
	for (let e in n.input.eventHandlers) n.dom.removeEventListener(e, n.input.eventHandlers[e]);
	(clearTimeout(n.input.composingTimeout), clearTimeout(n.input.lastIOSEnterFallbackTimeout));
}
function Vs(n) {
	n.someProp('handleDOMEvents', (e) => {
		for (let t in e) n.input.eventHandlers[t] || n.dom.addEventListener(t, (n.input.eventHandlers[t] = (r) => Co(n, r)));
	});
}
function Co(n, e) {
	return n.someProp('handleDOMEvents', (t) => {
		let r = t[e.type];
		return r ? r(n, e) || e.defaultPrevented : !1;
	});
}
function Np(n, e) {
	if (!e.bubbles) return !0;
	if (e.defaultPrevented) return !1;
	for (let t = e.target; t != n.dom; t = t.parentNode) if (!t || t.nodeType == 11 || (t.pmViewDesc && t.pmViewDesc.stopEvent(e))) return !1;
	return !0;
}
function Op(n, e) {
	!Co(n, e) && ke[e.type] && (n.editable || !(e.type in xe)) && ke[e.type](n, e);
}
xe.keydown = (n, e) => {
	let t = e;
	if (
		((n.input.shiftKey = t.keyCode == 16 || t.shiftKey),
		!id(n, t) && ((n.input.lastKeyCode = t.keyCode), (n.input.lastKeyCodeTime = Date.now()), !(lt && he && t.keyCode == 13)))
	)
		if ((t.keyCode != 229 && n.domObserver.forceFlush(), Tn && t.keyCode == 13 && !t.ctrlKey && !t.altKey && !t.metaKey)) {
			let r = Date.now();
			((n.input.lastIOSEnter = r),
				(n.input.lastIOSEnterFallbackTimeout = setTimeout(() => {
					n.input.lastIOSEnter == r && (n.someProp('handleKeyDown', (i) => i(n, $t(13, 'Enter'))), (n.input.lastIOSEnter = 0));
				}, 200)));
		} else n.someProp('handleKeyDown', (r) => r(n, t)) || bp(n, t) ? t.preventDefault() : vt(n, 'key');
};
xe.keyup = (n, e) => {
	e.keyCode == 16 && (n.input.shiftKey = !1);
};
xe.keypress = (n, e) => {
	let t = e;
	if (id(n, t) || !t.charCode || (t.ctrlKey && !t.altKey) || (Re && t.metaKey)) return;
	if (n.someProp('handleKeyPress', (i) => i(n, t))) {
		t.preventDefault();
		return;
	}
	let r = n.state.selection;
	if (!(r instanceof O) || !r.$from.sameParent(r.$to)) {
		let i = String.fromCharCode(t.charCode),
			s = () => n.state.tr.insertText(i).scrollIntoView();
		(!/[\r\n]/.test(i) && !n.someProp('handleTextInput', (o) => o(n, r.$from.pos, r.$to.pos, i, s)) && n.dispatch(s()), t.preventDefault());
	}
};
function Hi(n) {
	return { left: n.clientX, top: n.clientY };
}
function Rp(n, e) {
	let t = e.x - n.clientX,
		r = e.y - n.clientY;
	return t * t + r * r < 100;
}
function Mo(n, e, t, r, i) {
	if (r == -1) return !1;
	let s = n.state.doc.resolve(r);
	for (let o = s.depth + 1; o > 0; o--)
		if (n.someProp(e, (l) => (o > s.depth ? l(n, t, s.nodeAfter, s.before(o), i, !0) : l(n, t, s.node(o), s.before(o), i, !1)))) return !0;
	return !1;
}
function Sn(n, e, t) {
	if ((n.focused || n.focus(), n.state.selection.eq(e))) return;
	let r = n.state.tr.setSelection(e);
	(r.setMeta('pointer', !0), n.dispatch(r));
}
function Ip(n, e) {
	if (e == -1) return !1;
	let t = n.state.doc.resolve(e),
		r = t.nodeAfter;
	return r && r.isAtom && N.isSelectable(r) ? (Sn(n, new N(t)), !0) : !1;
}
function Dp(n, e) {
	if (e == -1) return !1;
	let t = n.state.selection,
		r,
		i;
	t instanceof N && (r = t.node);
	let s = n.state.doc.resolve(e);
	for (let o = s.depth + 1; o > 0; o--) {
		let l = o > s.depth ? s.nodeAfter : s.node(o);
		if (N.isSelectable(l)) {
			r && t.$from.depth > 0 && o >= t.$from.depth && s.before(t.$from.depth + 1) == t.$from.pos ? (i = s.before(t.$from.depth)) : (i = s.before(o));
			break;
		}
	}
	return i != null ? (Sn(n, N.create(n.state.doc, i)), !0) : !1;
}
function Lp(n, e, t, r, i) {
	return Mo(n, 'handleClickOn', e, t, r) || n.someProp('handleClick', (s) => s(n, e, r)) || (i ? Dp(n, t) : Ip(n, t));
}
function Pp(n, e, t, r) {
	return Mo(n, 'handleDoubleClickOn', e, t, r) || n.someProp('handleDoubleClick', (i) => i(n, e, r));
}
function zp(n, e, t, r) {
	return Mo(n, 'handleTripleClickOn', e, t, r) || n.someProp('handleTripleClick', (i) => i(n, e, r)) || Bp(n, t, r);
}
function Bp(n, e, t) {
	if (t.button != 0) return !1;
	let r = n.state.doc;
	if (e == -1) return r.inlineContent ? (Sn(n, O.create(r, 0, r.content.size)), !0) : !1;
	let i = r.resolve(e);
	for (let s = i.depth + 1; s > 0; s--) {
		let o = s > i.depth ? i.nodeAfter : i.node(s),
			l = i.before(s);
		if (o.inlineContent) Sn(n, O.create(r, l + 1, l + 1 + o.content.size));
		else if (N.isSelectable(o)) Sn(n, N.create(r, l));
		else continue;
		return !0;
	}
}
function To(n) {
	return Yr(n);
}
const rd = Re ? 'metaKey' : 'ctrlKey';
ke.mousedown = (n, e) => {
	let t = e;
	n.input.shiftKey = t.shiftKey;
	let r = To(n),
		i = Date.now(),
		s = 'singleClick';
	(i - n.input.lastClick.time < 500 &&
		Rp(t, n.input.lastClick) &&
		!t[rd] &&
		n.input.lastClick.button == t.button &&
		(n.input.lastClick.type == 'singleClick' ? (s = 'doubleClick') : n.input.lastClick.type == 'doubleClick' && (s = 'tripleClick')),
		(n.input.lastClick = { time: i, x: t.clientX, y: t.clientY, type: s, button: t.button }));
	let o = n.posAtCoords(Hi(t));
	o &&
		(s == 'singleClick'
			? (n.input.mouseDown && n.input.mouseDown.done(), (n.input.mouseDown = new Hp(n, o, t, !!r)))
			: (s == 'doubleClick' ? Pp : zp)(n, o.pos, o.inside, t)
				? t.preventDefault()
				: vt(n, 'pointer'));
};
class Hp {
	constructor(e, t, r, i) {
		((this.view = e),
			(this.pos = t),
			(this.event = r),
			(this.flushed = i),
			(this.delayedSelectionSync = !1),
			(this.mightDrag = null),
			(this.startDoc = e.state.doc),
			(this.selectNode = !!r[rd]),
			(this.allowDefault = r.shiftKey));
		let s, o;
		if (t.inside > -1) ((s = e.state.doc.nodeAt(t.inside)), (o = t.inside));
		else {
			let d = e.state.doc.resolve(t.pos);
			((s = d.parent), (o = d.depth ? d.before() : 0));
		}
		const l = i ? null : r.target,
			a = l ? e.docView.nearestDesc(l, !0) : null;
		this.target = a && a.nodeDOM.nodeType == 1 ? a.nodeDOM : null;
		let { selection: c } = e.state;
		(((r.button == 0 && s.type.spec.draggable && s.type.spec.selectable !== !1) || (c instanceof N && c.from <= o && c.to > o)) &&
			(this.mightDrag = {
				node: s,
				pos: o,
				addAttr: !!(this.target && !this.target.draggable),
				setUneditable: !!(this.target && De && !this.target.hasAttribute('contentEditable'))
			}),
			this.target &&
				this.mightDrag &&
				(this.mightDrag.addAttr || this.mightDrag.setUneditable) &&
				(this.view.domObserver.stop(),
				this.mightDrag.addAttr && (this.target.draggable = !0),
				this.mightDrag.setUneditable &&
					setTimeout(() => {
						this.view.input.mouseDown == this && this.target.setAttribute('contentEditable', 'false');
					}, 20),
				this.view.domObserver.start()),
			e.root.addEventListener('mouseup', (this.up = this.up.bind(this))),
			e.root.addEventListener('mousemove', (this.move = this.move.bind(this))),
			vt(e, 'pointer'));
	}
	done() {
		(this.view.root.removeEventListener('mouseup', this.up),
			this.view.root.removeEventListener('mousemove', this.move),
			this.mightDrag &&
				this.target &&
				(this.view.domObserver.stop(),
				this.mightDrag.addAttr && this.target.removeAttribute('draggable'),
				this.mightDrag.setUneditable && this.target.removeAttribute('contentEditable'),
				this.view.domObserver.start()),
			this.delayedSelectionSync && setTimeout(() => ct(this.view)),
			(this.view.input.mouseDown = null));
	}
	up(e) {
		if ((this.done(), !this.view.dom.contains(e.target))) return;
		let t = this.pos;
		(this.view.state.doc != this.startDoc && (t = this.view.posAtCoords(Hi(e))),
			this.updateAllowDefault(e),
			this.allowDefault || !t
				? vt(this.view, 'pointer')
				: Lp(this.view, t.pos, t.inside, e, this.selectNode)
					? e.preventDefault()
					: e.button == 0 &&
						  (this.flushed ||
								(be && this.mightDrag && !this.mightDrag.node.isAtom) ||
								(he &&
									!this.view.state.selection.visible &&
									Math.min(Math.abs(t.pos - this.view.state.selection.from), Math.abs(t.pos - this.view.state.selection.to)) <= 2))
						? (Sn(this.view, R.near(this.view.state.doc.resolve(t.pos))), e.preventDefault())
						: vt(this.view, 'pointer'));
	}
	move(e) {
		(this.updateAllowDefault(e), vt(this.view, 'pointer'), e.buttons == 0 && this.done());
	}
	updateAllowDefault(e) {
		!this.allowDefault && (Math.abs(this.event.x - e.clientX) > 4 || Math.abs(this.event.y - e.clientY) > 4) && (this.allowDefault = !0);
	}
}
ke.touchstart = (n) => {
	((n.input.lastTouch = Date.now()), To(n), vt(n, 'pointer'));
};
ke.touchmove = (n) => {
	((n.input.lastTouch = Date.now()), vt(n, 'pointer'));
};
ke.contextmenu = (n) => To(n);
function id(n, e) {
	return n.composing ? !0 : be && Math.abs(e.timeStamp - n.input.compositionEndedAt) < 500 ? ((n.input.compositionEndedAt = -2e8), !0) : !1;
}
const $p = lt ? 5e3 : -1;
xe.compositionstart = xe.compositionupdate = (n) => {
	if (!n.composing) {
		n.domObserver.flush();
		let { state: e } = n,
			t = e.selection.$to;
		if (
			e.selection instanceof O &&
			(e.storedMarks || (!t.textOffset && t.parentOffset && t.nodeBefore.marks.some((r) => r.type.spec.inclusive === !1)))
		)
			((n.markCursor = n.state.storedMarks || t.marks()), Yr(n, !0), (n.markCursor = null));
		else if ((Yr(n, !e.selection.empty), De && e.selection.empty && t.parentOffset && !t.textOffset && t.nodeBefore.marks.length)) {
			let r = n.domSelectionRange();
			for (let i = r.focusNode, s = r.focusOffset; i && i.nodeType == 1 && s != 0; ) {
				let o = s < 0 ? i.lastChild : i.childNodes[s - 1];
				if (!o) break;
				if (o.nodeType == 3) {
					let l = n.domSelection();
					l && l.collapse(o, o.nodeValue.length);
					break;
				} else ((i = o), (s = -1));
			}
		}
		n.input.composing = !0;
	}
	sd(n, $p);
};
xe.compositionend = (n, e) => {
	n.composing &&
		((n.input.composing = !1),
		(n.input.compositionEndedAt = e.timeStamp),
		(n.input.compositionPendingChanges = n.domObserver.pendingRecords().length ? n.input.compositionID : 0),
		(n.input.compositionNode = null),
		n.input.compositionPendingChanges && Promise.resolve().then(() => n.domObserver.flush()),
		n.input.compositionID++,
		sd(n, 20));
};
function sd(n, e) {
	(clearTimeout(n.input.composingTimeout), e > -1 && (n.input.composingTimeout = setTimeout(() => Yr(n), e)));
}
function od(n) {
	for (n.composing && ((n.input.composing = !1), (n.input.compositionEndedAt = _p())); n.input.compositionNodes.length > 0; )
		n.input.compositionNodes.pop().markParentsDirty();
}
function Fp(n) {
	let e = n.domSelectionRange();
	if (!e.focusNode) return null;
	let t = Ih(e.focusNode, e.focusOffset),
		r = Dh(e.focusNode, e.focusOffset);
	if (t && r && t != r) {
		let i = r.pmViewDesc,
			s = n.domObserver.lastChangedTextNode;
		if (t == s || r == s) return s;
		if (!i || !i.isText(r.nodeValue)) return r;
		if (n.input.compositionNode == r) {
			let o = t.pmViewDesc;
			if (!(!o || !o.isText(t.nodeValue))) return r;
		}
	}
	return t || r;
}
function _p() {
	let n = document.createEvent('Event');
	return (n.initEvent('event', !0, !0), n.timeStamp);
}
function Yr(n, e = !1) {
	if (!(lt && n.domObserver.flushingSoon >= 0)) {
		if ((n.domObserver.forceFlush(), od(n), e || (n.docView && n.docView.dirty))) {
			let t = wo(n),
				r = n.state.selection;
			return (
				t && !t.eq(r)
					? n.dispatch(n.state.tr.setSelection(t))
					: (n.markCursor || e) && !r.$from.node(r.$from.sharedDepth(r.to)).inlineContent
						? n.dispatch(n.state.tr.deleteSelection())
						: n.updateState(n.state),
				!0
			);
		}
		return !1;
	}
}
function Vp(n, e) {
	if (!n.dom.parentNode) return;
	let t = n.dom.parentNode.appendChild(document.createElement('div'));
	(t.appendChild(e), (t.style.cssText = 'position: fixed; left: -10000px; top: 10px'));
	let r = getSelection(),
		i = document.createRange();
	(i.selectNodeContents(e),
		n.dom.blur(),
		r.removeAllRanges(),
		r.addRange(i),
		setTimeout(() => {
			(t.parentNode && t.parentNode.removeChild(t), n.focus());
		}, 50));
}
const sr = (Se && Mt < 15) || (Tn && Hh < 604);
ke.copy = xe.cut = (n, e) => {
	let t = e,
		r = n.state.selection,
		i = t.type == 'cut';
	if (r.empty) return;
	let s = sr ? null : t.clipboardData,
		o = r.content(),
		{ dom: l, text: a } = vo(n, o);
	(s ? (t.preventDefault(), s.clearData(), s.setData('text/html', l.innerHTML), s.setData('text/plain', a)) : Vp(n, l),
		i && n.dispatch(n.state.tr.deleteSelection().scrollIntoView().setMeta('uiEvent', 'cut')));
};
function Wp(n) {
	return n.openStart == 0 && n.openEnd == 0 && n.content.childCount == 1 ? n.content.firstChild : null;
}
function jp(n, e) {
	if (!n.dom.parentNode) return;
	let t = n.input.shiftKey || n.state.selection.$from.parent.type.spec.code,
		r = n.dom.parentNode.appendChild(document.createElement(t ? 'textarea' : 'div'));
	(t || (r.contentEditable = 'true'), (r.style.cssText = 'position: fixed; left: -10000px; top: 10px'), r.focus());
	let i = n.input.shiftKey && n.input.lastKeyCode != 45;
	setTimeout(() => {
		(n.focus(), r.parentNode && r.parentNode.removeChild(r), t ? or(n, r.value, null, i, e) : or(n, r.textContent, r.innerHTML, i, e));
	}, 50);
}
function or(n, e, t, r, i) {
	let s = Xc(n, e, t, r, n.state.selection.$from);
	if (n.someProp('handlePaste', (a) => a(n, i, s || C.empty))) return !0;
	if (!s) return !1;
	let o = Wp(s),
		l = o ? n.state.tr.replaceSelectionWith(o, r) : n.state.tr.replaceSelection(s);
	return (n.dispatch(l.scrollIntoView().setMeta('paste', !0).setMeta('uiEvent', 'paste')), !0);
}
function ld(n) {
	let e = n.getData('text/plain') || n.getData('Text');
	if (e) return e;
	let t = n.getData('text/uri-list');
	return t ? t.replace(/\r?\n/g, ' ') : '';
}
xe.paste = (n, e) => {
	let t = e;
	if (n.composing && !lt) return;
	let r = sr ? null : t.clipboardData,
		i = n.input.shiftKey && n.input.lastKeyCode != 45;
	r && or(n, ld(r), r.getData('text/html'), i, t) ? t.preventDefault() : jp(n, t);
};
class ad {
	constructor(e, t, r) {
		((this.slice = e), (this.move = t), (this.node = r));
	}
}
const Kp = Re ? 'altKey' : 'ctrlKey';
function cd(n, e) {
	let t = n.someProp('dragCopies', (r) => !r(e));
	return t ?? !e[Kp];
}
ke.dragstart = (n, e) => {
	let t = e,
		r = n.input.mouseDown;
	if ((r && r.done(), !t.dataTransfer)) return;
	let i = n.state.selection,
		s = i.empty ? null : n.posAtCoords(Hi(t)),
		o;
	if (!(s && s.pos >= i.from && s.pos <= (i instanceof N ? i.to - 1 : i.to))) {
		if (r && r.mightDrag) o = N.create(n.state.doc, r.mightDrag.pos);
		else if (t.target && t.target.nodeType == 1) {
			let u = n.docView.nearestDesc(t.target, !0);
			u && u.node.type.spec.draggable && u != n.docView && (o = N.create(n.state.doc, u.posBefore));
		}
	}
	let l = (o || n.state.selection).content(),
		{ dom: a, text: c, slice: d } = vo(n, l);
	((!t.dataTransfer.files.length || !he || Pc > 120) && t.dataTransfer.clearData(),
		t.dataTransfer.setData(sr ? 'Text' : 'text/html', a.innerHTML),
		(t.dataTransfer.effectAllowed = 'copyMove'),
		sr || t.dataTransfer.setData('text/plain', c),
		(n.dragging = new ad(d, cd(n, t), o)));
};
ke.dragend = (n) => {
	let e = n.dragging;
	window.setTimeout(() => {
		n.dragging == e && (n.dragging = null);
	}, 50);
};
xe.dragover = xe.dragenter = (n, e) => e.preventDefault();
xe.drop = (n, e) => {
	let t = e,
		r = n.dragging;
	if (((n.dragging = null), !t.dataTransfer)) return;
	let i = n.posAtCoords(Hi(t));
	if (!i) return;
	let s = n.state.doc.resolve(i.pos),
		o = r && r.slice;
	o
		? n.someProp('transformPasted', (p) => {
				o = p(o, n, !1);
			})
		: (o = Xc(n, ld(t.dataTransfer), sr ? null : t.dataTransfer.getData('text/html'), !1, s));
	let l = !!(r && cd(n, t));
	if (n.someProp('handleDrop', (p) => p(n, t, o || C.empty, l))) {
		t.preventDefault();
		return;
	}
	if (!o) return;
	t.preventDefault();
	let a = o ? pc(n.state.doc, s.pos, o) : s.pos;
	a == null && (a = s.pos);
	let c = n.state.tr;
	if (l) {
		let { node: p } = r;
		p ? p.replace(c) : c.deleteSelection();
	}
	let d = c.mapping.map(a),
		u = o.openStart == 0 && o.openEnd == 0 && o.content.childCount == 1,
		f = c.doc;
	if ((u ? c.replaceRangeWith(d, d, o.content.firstChild) : c.replaceRange(d, d, o), c.doc.eq(f))) return;
	let h = c.doc.resolve(d);
	if (u && N.isSelectable(o.content.firstChild) && h.nodeAfter && h.nodeAfter.sameMarkup(o.content.firstChild)) c.setSelection(new N(h));
	else {
		let p = c.mapping.map(a);
		(c.mapping.maps[c.mapping.maps.length - 1].forEach((m, g, y, x) => (p = x)), c.setSelection(So(n, h, c.doc.resolve(p))));
	}
	(n.focus(), n.dispatch(c.setMeta('uiEvent', 'drop')));
};
ke.focus = (n) => {
	((n.input.lastFocus = Date.now()),
		n.focused ||
			(n.domObserver.stop(),
			n.dom.classList.add('ProseMirror-focused'),
			n.domObserver.start(),
			(n.focused = !0),
			setTimeout(() => {
				n.docView && n.hasFocus() && !n.domObserver.currentSelection.eq(n.domSelectionRange()) && ct(n);
			}, 20)));
};
ke.blur = (n, e) => {
	let t = e;
	n.focused &&
		(n.domObserver.stop(),
		n.dom.classList.remove('ProseMirror-focused'),
		n.domObserver.start(),
		t.relatedTarget && n.dom.contains(t.relatedTarget) && n.domObserver.currentSelection.clear(),
		(n.focused = !1));
};
ke.beforeinput = (n, e) => {
	if (he && lt && e.inputType == 'deleteContentBackward') {
		n.domObserver.flushSoon();
		let { domChangeCount: r } = n.input;
		setTimeout(() => {
			if (n.input.domChangeCount != r || (n.dom.blur(), n.focus(), n.someProp('handleKeyDown', (s) => s(n, $t(8, 'Backspace'))))) return;
			let { $cursor: i } = n.state.selection;
			i && i.pos > 0 && n.dispatch(n.state.tr.delete(i.pos - 1, i.pos).scrollIntoView());
		}, 50);
	}
};
for (let n in xe) ke[n] = xe[n];
function lr(n, e) {
	if (n == e) return !0;
	for (let t in n) if (n[t] !== e[t]) return !1;
	for (let t in e) if (!(t in n)) return !1;
	return !0;
}
class Xr {
	constructor(e, t) {
		((this.toDOM = e), (this.spec = t || Ut), (this.side = this.spec.side || 0));
	}
	map(e, t, r, i) {
		let { pos: s, deleted: o } = e.mapResult(t.from + i, this.side < 0 ? -1 : 1);
		return o ? null : new ne(s - r, s - r, this);
	}
	valid() {
		return !0;
	}
	eq(e) {
		return this == e || (e instanceof Xr && ((this.spec.key && this.spec.key == e.spec.key) || (this.toDOM == e.toDOM && lr(this.spec, e.spec))));
	}
	destroy(e) {
		this.spec.destroy && this.spec.destroy(e);
	}
}
class At {
	constructor(e, t) {
		((this.attrs = e), (this.spec = t || Ut));
	}
	map(e, t, r, i) {
		let s = e.map(t.from + i, this.spec.inclusiveStart ? -1 : 1) - r,
			o = e.map(t.to + i, this.spec.inclusiveEnd ? 1 : -1) - r;
		return s >= o ? null : new ne(s, o, this);
	}
	valid(e, t) {
		return t.from < t.to;
	}
	eq(e) {
		return this == e || (e instanceof At && lr(this.attrs, e.attrs) && lr(this.spec, e.spec));
	}
	static is(e) {
		return e.type instanceof At;
	}
	destroy() {}
}
class Ao {
	constructor(e, t) {
		((this.attrs = e), (this.spec = t || Ut));
	}
	map(e, t, r, i) {
		let s = e.mapResult(t.from + i, 1);
		if (s.deleted) return null;
		let o = e.mapResult(t.to + i, -1);
		return o.deleted || o.pos <= s.pos ? null : new ne(s.pos - r, o.pos - r, this);
	}
	valid(e, t) {
		let { index: r, offset: i } = e.content.findIndex(t.from),
			s;
		return i == t.from && !(s = e.child(r)).isText && i + s.nodeSize == t.to;
	}
	eq(e) {
		return this == e || (e instanceof Ao && lr(this.attrs, e.attrs) && lr(this.spec, e.spec));
	}
	destroy() {}
}
class ne {
	constructor(e, t, r) {
		((this.from = e), (this.to = t), (this.type = r));
	}
	copy(e, t) {
		return new ne(e, t, this.type);
	}
	eq(e, t = 0) {
		return this.type.eq(e.type) && this.from + t == e.from && this.to + t == e.to;
	}
	map(e, t, r) {
		return this.type.map(e, this, t, r);
	}
	static widget(e, t, r) {
		return new ne(e, e, new Xr(t, r));
	}
	static inline(e, t, r, i) {
		return new ne(e, t, new At(r, i));
	}
	static node(e, t, r, i) {
		return new ne(e, t, new Ao(r, i));
	}
	get spec() {
		return this.type.spec;
	}
	get inline() {
		return this.type instanceof At;
	}
	get widget() {
		return this.type instanceof Xr;
	}
}
const yn = [],
	Ut = {};
class V {
	constructor(e, t) {
		((this.local = e.length ? e : yn), (this.children = t.length ? t : yn));
	}
	static create(e, t) {
		return t.length ? Qr(t, e, 0, Ut) : fe;
	}
	find(e, t, r) {
		let i = [];
		return (this.findInner(e ?? 0, t ?? 1e9, i, 0, r), i);
	}
	findInner(e, t, r, i, s) {
		for (let o = 0; o < this.local.length; o++) {
			let l = this.local[o];
			l.from <= t && l.to >= e && (!s || s(l.spec)) && r.push(l.copy(l.from + i, l.to + i));
		}
		for (let o = 0; o < this.children.length; o += 3)
			if (this.children[o] < t && this.children[o + 1] > e) {
				let l = this.children[o] + 1;
				this.children[o + 2].findInner(e - l, t - l, r, i + l, s);
			}
	}
	map(e, t, r) {
		return this == fe || e.maps.length == 0 ? this : this.mapInner(e, t, 0, 0, r || Ut);
	}
	mapInner(e, t, r, i, s) {
		let o;
		for (let l = 0; l < this.local.length; l++) {
			let a = this.local[l].map(e, r, i);
			a && a.type.valid(t, a) ? (o || (o = [])).push(a) : s.onRemove && s.onRemove(this.local[l].spec);
		}
		return this.children.length ? Up(this.children, o || [], e, t, r, i, s) : o ? new V(o.sort(qt), yn) : fe;
	}
	add(e, t) {
		return t.length ? (this == fe ? V.create(e, t) : this.addInner(e, t, 0)) : this;
	}
	addInner(e, t, r) {
		let i,
			s = 0;
		e.forEach((l, a) => {
			let c = a + r,
				d;
			if ((d = ud(t, l, c))) {
				for (i || (i = this.children.slice()); s < i.length && i[s] < a; ) s += 3;
				(i[s] == a ? (i[s + 2] = i[s + 2].addInner(l, d, c + 1)) : i.splice(s, 0, a, a + l.nodeSize, Qr(d, l, c + 1, Ut)), (s += 3));
			}
		});
		let o = dd(s ? fd(t) : t, -r);
		for (let l = 0; l < o.length; l++) o[l].type.valid(e, o[l]) || o.splice(l--, 1);
		return new V(o.length ? this.local.concat(o).sort(qt) : this.local, i || this.children);
	}
	remove(e) {
		return e.length == 0 || this == fe ? this : this.removeInner(e, 0);
	}
	removeInner(e, t) {
		let r = this.children,
			i = this.local;
		for (let s = 0; s < r.length; s += 3) {
			let o,
				l = r[s] + t,
				a = r[s + 1] + t;
			for (let d = 0, u; d < e.length; d++) (u = e[d]) && u.from > l && u.to < a && ((e[d] = null), (o || (o = [])).push(u));
			if (!o) continue;
			r == this.children && (r = this.children.slice());
			let c = r[s + 2].removeInner(o, l + 1);
			c != fe ? (r[s + 2] = c) : (r.splice(s, 3), (s -= 3));
		}
		if (i.length) {
			for (let s = 0, o; s < e.length; s++)
				if ((o = e[s])) for (let l = 0; l < i.length; l++) i[l].eq(o, t) && (i == this.local && (i = this.local.slice()), i.splice(l--, 1));
		}
		return r == this.children && i == this.local ? this : i.length || r.length ? new V(i, r) : fe;
	}
	forChild(e, t) {
		if (this == fe) return this;
		if (t.isLeaf) return V.empty;
		let r, i;
		for (let l = 0; l < this.children.length; l += 3)
			if (this.children[l] >= e) {
				this.children[l] == e && (r = this.children[l + 2]);
				break;
			}
		let s = e + 1,
			o = s + t.content.size;
		for (let l = 0; l < this.local.length; l++) {
			let a = this.local[l];
			if (a.from < o && a.to > s && a.type instanceof At) {
				let c = Math.max(s, a.from) - s,
					d = Math.min(o, a.to) - s;
				c < d && (i || (i = [])).push(a.copy(c, d));
			}
		}
		if (i) {
			let l = new V(i.sort(qt), yn);
			return r ? new bt([l, r]) : l;
		}
		return r || fe;
	}
	eq(e) {
		if (this == e) return !0;
		if (!(e instanceof V) || this.local.length != e.local.length || this.children.length != e.children.length) return !1;
		for (let t = 0; t < this.local.length; t++) if (!this.local[t].eq(e.local[t])) return !1;
		for (let t = 0; t < this.children.length; t += 3)
			if (this.children[t] != e.children[t] || this.children[t + 1] != e.children[t + 1] || !this.children[t + 2].eq(e.children[t + 2])) return !1;
		return !0;
	}
	locals(e) {
		return Eo(this.localsInner(e));
	}
	localsInner(e) {
		if (this == fe) return yn;
		if (e.inlineContent || !this.local.some(At.is)) return this.local;
		let t = [];
		for (let r = 0; r < this.local.length; r++) this.local[r].type instanceof At || t.push(this.local[r]);
		return t;
	}
	forEachSet(e) {
		e(this);
	}
}
V.empty = new V([], []);
V.removeOverlap = Eo;
const fe = V.empty;
class bt {
	constructor(e) {
		this.members = e;
	}
	map(e, t) {
		const r = this.members.map((i) => i.map(e, t, Ut));
		return bt.from(r);
	}
	forChild(e, t) {
		if (t.isLeaf) return V.empty;
		let r = [];
		for (let i = 0; i < this.members.length; i++) {
			let s = this.members[i].forChild(e, t);
			s != fe && (s instanceof bt ? (r = r.concat(s.members)) : r.push(s));
		}
		return bt.from(r);
	}
	eq(e) {
		if (!(e instanceof bt) || e.members.length != this.members.length) return !1;
		for (let t = 0; t < this.members.length; t++) if (!this.members[t].eq(e.members[t])) return !1;
		return !0;
	}
	locals(e) {
		let t,
			r = !0;
		for (let i = 0; i < this.members.length; i++) {
			let s = this.members[i].localsInner(e);
			if (s.length)
				if (!t) t = s;
				else {
					r && ((t = t.slice()), (r = !1));
					for (let o = 0; o < s.length; o++) t.push(s[o]);
				}
		}
		return t ? Eo(r ? t : t.sort(qt)) : yn;
	}
	static from(e) {
		switch (e.length) {
			case 0:
				return fe;
			case 1:
				return e[0];
			default:
				return new bt(e.every((t) => t instanceof V) ? e : e.reduce((t, r) => t.concat(r instanceof V ? r : r.members), []));
		}
	}
	forEachSet(e) {
		for (let t = 0; t < this.members.length; t++) this.members[t].forEachSet(e);
	}
}
function Up(n, e, t, r, i, s, o) {
	let l = n.slice();
	for (let c = 0, d = s; c < t.maps.length; c++) {
		let u = 0;
		(t.maps[c].forEach((f, h, p, m) => {
			let g = m - p - (h - f);
			for (let y = 0; y < l.length; y += 3) {
				let x = l[y + 1];
				if (x < 0 || f > x + d - u) continue;
				let M = l[y] + d - u;
				h >= M ? (l[y + 1] = f <= M ? -2 : -1) : f >= d && g && ((l[y] += g), (l[y + 1] += g));
			}
			u += g;
		}),
			(d = t.maps[c].map(d, -1)));
	}
	let a = !1;
	for (let c = 0; c < l.length; c += 3)
		if (l[c + 1] < 0) {
			if (l[c + 1] == -2) {
				((a = !0), (l[c + 1] = -1));
				continue;
			}
			let d = t.map(n[c] + s),
				u = d - i;
			if (u < 0 || u >= r.content.size) {
				a = !0;
				continue;
			}
			let f = t.map(n[c + 1] + s, -1),
				h = f - i,
				{ index: p, offset: m } = r.content.findIndex(u),
				g = r.maybeChild(p);
			if (g && m == u && m + g.nodeSize == h) {
				let y = l[c + 2].mapInner(t, g, d + 1, n[c] + s + 1, o);
				y != fe ? ((l[c] = u), (l[c + 1] = h), (l[c + 2] = y)) : ((l[c + 1] = -2), (a = !0));
			} else a = !0;
		}
	if (a) {
		let c = qp(l, n, e, t, i, s, o),
			d = Qr(c, r, 0, o);
		e = d.local;
		for (let u = 0; u < l.length; u += 3) l[u + 1] < 0 && (l.splice(u, 3), (u -= 3));
		for (let u = 0, f = 0; u < d.children.length; u += 3) {
			let h = d.children[u];
			for (; f < l.length && l[f] < h; ) f += 3;
			l.splice(f, 0, d.children[u], d.children[u + 1], d.children[u + 2]);
		}
	}
	return new V(e.sort(qt), l);
}
function dd(n, e) {
	if (!e || !n.length) return n;
	let t = [];
	for (let r = 0; r < n.length; r++) {
		let i = n[r];
		t.push(new ne(i.from + e, i.to + e, i.type));
	}
	return t;
}
function qp(n, e, t, r, i, s, o) {
	function l(a, c) {
		for (let d = 0; d < a.local.length; d++) {
			let u = a.local[d].map(r, i, c);
			u ? t.push(u) : o.onRemove && o.onRemove(a.local[d].spec);
		}
		for (let d = 0; d < a.children.length; d += 3) l(a.children[d + 2], a.children[d] + c + 1);
	}
	for (let a = 0; a < n.length; a += 3) n[a + 1] == -1 && l(n[a + 2], e[a] + s + 1);
	return t;
}
function ud(n, e, t) {
	if (e.isLeaf) return null;
	let r = t + e.nodeSize,
		i = null;
	for (let s = 0, o; s < n.length; s++) (o = n[s]) && o.from > t && o.to < r && ((i || (i = [])).push(o), (n[s] = null));
	return i;
}
function fd(n) {
	let e = [];
	for (let t = 0; t < n.length; t++) n[t] != null && e.push(n[t]);
	return e;
}
function Qr(n, e, t, r) {
	let i = [],
		s = !1;
	e.forEach((l, a) => {
		let c = ud(n, l, a + t);
		if (c) {
			s = !0;
			let d = Qr(c, l, t + a + 1, r);
			d != fe && i.push(a, a + l.nodeSize, d);
		}
	});
	let o = dd(s ? fd(n) : n, -t).sort(qt);
	for (let l = 0; l < o.length; l++) o[l].type.valid(e, o[l]) || (r.onRemove && r.onRemove(o[l].spec), o.splice(l--, 1));
	return o.length || i.length ? new V(o, i) : fe;
}
function qt(n, e) {
	return n.from - e.from || n.to - e.to;
}
function Eo(n) {
	let e = n;
	for (let t = 0; t < e.length - 1; t++) {
		let r = e[t];
		if (r.from != r.to)
			for (let i = t + 1; i < e.length; i++) {
				let s = e[i];
				if (s.from == r.from) {
					s.to != r.to && (e == n && (e = n.slice()), (e[i] = s.copy(s.from, r.to)), jl(e, i + 1, s.copy(r.to, s.to)));
					continue;
				} else {
					s.from < r.to && (e == n && (e = n.slice()), (e[t] = r.copy(r.from, s.from)), jl(e, i, r.copy(s.from, r.to)));
					break;
				}
			}
	}
	return e;
}
function jl(n, e, t) {
	for (; e < n.length && qt(t, n[e]) > 0; ) e++;
	n.splice(e, 0, t);
}
function fs(n) {
	let e = [];
	return (
		n.someProp('decorations', (t) => {
			let r = t(n.state);
			r && r != fe && e.push(r);
		}),
		n.cursorWrapper && e.push(V.create(n.state.doc, [n.cursorWrapper.deco])),
		bt.from(e)
	);
}
const Jp = { childList: !0, characterData: !0, characterDataOldValue: !0, attributes: !0, attributeOldValue: !0, subtree: !0 },
	Gp = Se && Mt <= 11;
class Yp {
	constructor() {
		((this.anchorNode = null), (this.anchorOffset = 0), (this.focusNode = null), (this.focusOffset = 0));
	}
	set(e) {
		((this.anchorNode = e.anchorNode), (this.anchorOffset = e.anchorOffset), (this.focusNode = e.focusNode), (this.focusOffset = e.focusOffset));
	}
	clear() {
		this.anchorNode = this.focusNode = null;
	}
	eq(e) {
		return (
			e.anchorNode == this.anchorNode && e.anchorOffset == this.anchorOffset && e.focusNode == this.focusNode && e.focusOffset == this.focusOffset
		);
	}
}
class Xp {
	constructor(e, t) {
		((this.view = e),
			(this.handleDOMChange = t),
			(this.queue = []),
			(this.flushingSoon = -1),
			(this.observer = null),
			(this.currentSelection = new Yp()),
			(this.onCharData = null),
			(this.suppressingSelectionUpdates = !1),
			(this.lastChangedTextNode = null),
			(this.observer =
				window.MutationObserver &&
				new window.MutationObserver((r) => {
					for (let i = 0; i < r.length; i++) this.queue.push(r[i]);
					Se &&
					Mt <= 11 &&
					r.some(
						(i) => (i.type == 'childList' && i.removedNodes.length) || (i.type == 'characterData' && i.oldValue.length > i.target.nodeValue.length)
					)
						? this.flushSoon()
						: this.flush();
				})),
			Gp &&
				(this.onCharData = (r) => {
					(this.queue.push({ target: r.target, type: 'characterData', oldValue: r.prevValue }), this.flushSoon());
				}),
			(this.onSelectionChange = this.onSelectionChange.bind(this)));
	}
	flushSoon() {
		this.flushingSoon < 0 &&
			(this.flushingSoon = window.setTimeout(() => {
				((this.flushingSoon = -1), this.flush());
			}, 20));
	}
	forceFlush() {
		this.flushingSoon > -1 && (window.clearTimeout(this.flushingSoon), (this.flushingSoon = -1), this.flush());
	}
	start() {
		(this.observer && (this.observer.takeRecords(), this.observer.observe(this.view.dom, Jp)),
			this.onCharData && this.view.dom.addEventListener('DOMCharacterDataModified', this.onCharData),
			this.connectSelection());
	}
	stop() {
		if (this.observer) {
			let e = this.observer.takeRecords();
			if (e.length) {
				for (let t = 0; t < e.length; t++) this.queue.push(e[t]);
				window.setTimeout(() => this.flush(), 20);
			}
			this.observer.disconnect();
		}
		(this.onCharData && this.view.dom.removeEventListener('DOMCharacterDataModified', this.onCharData), this.disconnectSelection());
	}
	connectSelection() {
		this.view.dom.ownerDocument.addEventListener('selectionchange', this.onSelectionChange);
	}
	disconnectSelection() {
		this.view.dom.ownerDocument.removeEventListener('selectionchange', this.onSelectionChange);
	}
	suppressSelectionUpdates() {
		((this.suppressingSelectionUpdates = !0), setTimeout(() => (this.suppressingSelectionUpdates = !1), 50));
	}
	onSelectionChange() {
		if (zl(this.view)) {
			if (this.suppressingSelectionUpdates) return ct(this.view);
			if (Se && Mt <= 11 && !this.view.state.selection.empty) {
				let e = this.view.domSelectionRange();
				if (e.focusNode && Xt(e.focusNode, e.focusOffset, e.anchorNode, e.anchorOffset)) return this.flushSoon();
			}
			this.flush();
		}
	}
	setCurSelection() {
		this.currentSelection.set(this.view.domSelectionRange());
	}
	ignoreSelectionChange(e) {
		if (!e.focusNode) return !0;
		let t = new Set(),
			r;
		for (let s = e.focusNode; s; s = Mn(s)) t.add(s);
		for (let s = e.anchorNode; s; s = Mn(s))
			if (t.has(s)) {
				r = s;
				break;
			}
		let i = r && this.view.docView.nearestDesc(r);
		if (i && i.ignoreMutation({ type: 'selection', target: r.nodeType == 3 ? r.parentNode : r })) return (this.setCurSelection(), !0);
	}
	pendingRecords() {
		if (this.observer) for (let e of this.observer.takeRecords()) this.queue.push(e);
		return this.queue;
	}
	flush() {
		let { view: e } = this;
		if (!e.docView || this.flushingSoon > -1) return;
		let t = this.pendingRecords();
		t.length && (this.queue = []);
		let r = e.domSelectionRange(),
			i = !this.suppressingSelectionUpdates && !this.currentSelection.eq(r) && zl(e) && !this.ignoreSelectionChange(r),
			s = -1,
			o = -1,
			l = !1,
			a = [];
		if (e.editable)
			for (let d = 0; d < t.length; d++) {
				let u = this.registerMutation(t[d], a);
				u && ((s = s < 0 ? u.from : Math.min(u.from, s)), (o = o < 0 ? u.to : Math.max(u.to, o)), u.typeOver && (l = !0));
			}
		if (De && a.length) {
			let d = a.filter((u) => u.nodeName == 'BR');
			if (d.length == 2) {
				let [u, f] = d;
				u.parentNode && u.parentNode.parentNode == f.parentNode ? f.remove() : u.remove();
			} else {
				let { focusNode: u } = this.currentSelection;
				for (let f of d) {
					let h = f.parentNode;
					h && h.nodeName == 'LI' && (!u || em(e, u) != h) && f.remove();
				}
			}
		}
		let c = null;
		s < 0 &&
		i &&
		e.input.lastFocus > Date.now() - 200 &&
		Math.max(e.input.lastTouch, e.input.lastClick.time) < Date.now() - 300 &&
		zi(r) &&
		(c = wo(e)) &&
		c.eq(R.near(e.state.doc.resolve(0), 1))
			? ((e.input.lastFocus = 0), ct(e), this.currentSelection.set(r), e.scrollToSelection())
			: (s > -1 || i) &&
				(s > -1 && (e.docView.markDirty(s, o), Qp(e)),
				this.handleDOMChange(s, o, l, a),
				e.docView && e.docView.dirty ? e.updateState(e.state) : this.currentSelection.eq(r) || ct(e),
				this.currentSelection.set(r));
	}
	registerMutation(e, t) {
		if (t.indexOf(e.target) > -1) return null;
		let r = this.view.docView.nearestDesc(e.target);
		if (
			(e.type == 'attributes' &&
				(r == this.view.docView ||
					e.attributeName == 'contenteditable' ||
					(e.attributeName == 'style' && !e.oldValue && !e.target.getAttribute('style')))) ||
			!r ||
			r.ignoreMutation(e)
		)
			return null;
		if (e.type == 'childList') {
			for (let d = 0; d < e.addedNodes.length; d++) {
				let u = e.addedNodes[d];
				(t.push(u), u.nodeType == 3 && (this.lastChangedTextNode = u));
			}
			if (r.contentDOM && r.contentDOM != r.dom && !r.contentDOM.contains(e.target)) return { from: r.posBefore, to: r.posAfter };
			let i = e.previousSibling,
				s = e.nextSibling;
			if (Se && Mt <= 11 && e.addedNodes.length)
				for (let d = 0; d < e.addedNodes.length; d++) {
					let { previousSibling: u, nextSibling: f } = e.addedNodes[d];
					((!u || Array.prototype.indexOf.call(e.addedNodes, u) < 0) && (i = u),
						(!f || Array.prototype.indexOf.call(e.addedNodes, f) < 0) && (s = f));
				}
			let o = i && i.parentNode == e.target ? ae(i) + 1 : 0,
				l = r.localPosFromDOM(e.target, o, -1),
				a = s && s.parentNode == e.target ? ae(s) : e.target.childNodes.length,
				c = r.localPosFromDOM(e.target, a, 1);
			return { from: l, to: c };
		} else
			return e.type == 'attributes'
				? { from: r.posAtStart - r.border, to: r.posAtEnd + r.border }
				: ((this.lastChangedTextNode = e.target), { from: r.posAtStart, to: r.posAtEnd, typeOver: e.target.nodeValue == e.oldValue });
	}
}
let Kl = new WeakMap(),
	Ul = !1;
function Qp(n) {
	if (!Kl.has(n) && (Kl.set(n, null), ['normal', 'nowrap', 'pre-line'].indexOf(getComputedStyle(n.dom).whiteSpace) !== -1)) {
		if (((n.requiresGeckoHackNode = De), Ul)) return;
		(console.warn(
			"ProseMirror expects the CSS white-space property to be set, preferably to 'pre-wrap'. It is recommended to load style/prosemirror.css from the prosemirror-view package."
		),
			(Ul = !0));
	}
}
function ql(n, e) {
	let t = e.startContainer,
		r = e.startOffset,
		i = e.endContainer,
		s = e.endOffset,
		o = n.domAtPos(n.state.selection.anchor);
	return (Xt(o.node, o.offset, i, s) && ([t, r, i, s] = [i, s, t, r]), { anchorNode: t, anchorOffset: r, focusNode: i, focusOffset: s });
}
function Zp(n, e) {
	if (e.getComposedRanges) {
		let i = e.getComposedRanges(n.root)[0];
		if (i) return ql(n, i);
	}
	let t;
	function r(i) {
		(i.preventDefault(), i.stopImmediatePropagation(), (t = i.getTargetRanges()[0]));
	}
	return (
		n.dom.addEventListener('beforeinput', r, !0),
		document.execCommand('indent'),
		n.dom.removeEventListener('beforeinput', r, !0),
		t ? ql(n, t) : null
	);
}
function em(n, e) {
	for (let t = e.parentNode; t && t != n.dom; t = t.parentNode) {
		let r = n.docView.nearestDesc(t, !0);
		if (r && r.node.isBlock) return t;
	}
	return null;
}
function tm(n, e, t) {
	let { node: r, fromOffset: i, toOffset: s, from: o, to: l } = n.docView.parseRange(e, t),
		a = n.domSelectionRange(),
		c,
		d = a.anchorNode;
	if (
		(d &&
			n.dom.contains(d.nodeType == 1 ? d : d.parentNode) &&
			((c = [{ node: d, offset: a.anchorOffset }]), zi(a) || c.push({ node: a.focusNode, offset: a.focusOffset })),
		he && n.input.lastKeyCode === 8)
	)
		for (let g = s; g > i; g--) {
			let y = r.childNodes[g - 1],
				x = y.pmViewDesc;
			if (y.nodeName == 'BR' && !x) {
				s = g;
				break;
			}
			if (!x || x.size) break;
		}
	let u = n.state.doc,
		f = n.someProp('domParser') || Ct.fromSchema(n.state.schema),
		h = u.resolve(o),
		p = null,
		m = f.parse(r, {
			topNode: h.parent,
			topMatch: h.parent.contentMatchAt(h.index()),
			topOpen: !0,
			from: i,
			to: s,
			preserveWhitespace: h.parent.type.whitespace == 'pre' ? 'full' : !0,
			findPositions: c,
			ruleFromNode: nm,
			context: h
		});
	if (c && c[0].pos != null) {
		let g = c[0].pos,
			y = c[1] && c[1].pos;
		(y == null && (y = g), (p = { anchor: g + o, head: y + o }));
	}
	return { doc: m, sel: p, from: o, to: l };
}
function nm(n) {
	let e = n.pmViewDesc;
	if (e) return e.parseRule();
	if (n.nodeName == 'BR' && n.parentNode) {
		if (be && /^(ul|ol)$/i.test(n.parentNode.nodeName)) {
			let t = document.createElement('div');
			return (t.appendChild(document.createElement('li')), { skip: t });
		} else if (n.parentNode.lastChild == n || (be && /^(tr|table)$/i.test(n.parentNode.nodeName))) return { ignore: !0 };
	} else if (n.nodeName == 'IMG' && n.getAttribute('mark-placeholder')) return { ignore: !0 };
	return null;
}
const rm =
	/^(a|abbr|acronym|b|bd[io]|big|br|button|cite|code|data(list)?|del|dfn|em|i|img|ins|kbd|label|map|mark|meter|output|q|ruby|s|samp|small|span|strong|su[bp]|time|u|tt|var)$/i;
function im(n, e, t, r, i) {
	let s = n.input.compositionPendingChanges || (n.composing ? n.input.compositionID : 0);
	if (((n.input.compositionPendingChanges = 0), e < 0)) {
		let v = n.input.lastSelectionTime > Date.now() - 50 ? n.input.lastSelectionOrigin : null,
			D = wo(n, v);
		if (D && !n.state.selection.eq(D)) {
			if (
				he &&
				lt &&
				n.input.lastKeyCode === 13 &&
				Date.now() - 100 < n.input.lastKeyCodeTime &&
				n.someProp('handleKeyDown', (de) => de(n, $t(13, 'Enter')))
			)
				return;
			let P = n.state.tr.setSelection(D);
			(v == 'pointer' ? P.setMeta('pointer', !0) : v == 'key' && P.scrollIntoView(), s && P.setMeta('composition', s), n.dispatch(P));
		}
		return;
	}
	let o = n.state.doc.resolve(e),
		l = o.sharedDepth(t);
	((e = o.before(l + 1)), (t = n.state.doc.resolve(t).after(l + 1)));
	let a = n.state.selection,
		c = tm(n, e, t),
		d = n.state.doc,
		u = d.slice(c.from, c.to),
		f,
		h;
	(n.input.lastKeyCode === 8 && Date.now() - 100 < n.input.lastKeyCodeTime
		? ((f = n.state.selection.to), (h = 'end'))
		: ((f = n.state.selection.from), (h = 'start')),
		(n.input.lastKeyCode = null));
	let p = lm(u.content, c.doc.content, c.from, f, h);
	if (
		(p && n.input.domChangeCount++,
		((Tn && n.input.lastIOSEnter > Date.now() - 225) || lt) &&
			i.some((v) => v.nodeType == 1 && !rm.test(v.nodeName)) &&
			(!p || p.endA >= p.endB) &&
			n.someProp('handleKeyDown', (v) => v(n, $t(13, 'Enter'))))
	) {
		n.input.lastIOSEnter = 0;
		return;
	}
	if (!p)
		if (r && a instanceof O && !a.empty && a.$head.sameParent(a.$anchor) && !n.composing && !(c.sel && c.sel.anchor != c.sel.head))
			p = { start: a.from, endA: a.to, endB: a.to };
		else {
			if (c.sel) {
				let v = Jl(n, n.state.doc, c.sel);
				if (v && !v.eq(n.state.selection)) {
					let D = n.state.tr.setSelection(v);
					(s && D.setMeta('composition', s), n.dispatch(D));
				}
			}
			return;
		}
	(n.state.selection.from < n.state.selection.to &&
		p.start == p.endB &&
		n.state.selection instanceof O &&
		(p.start > n.state.selection.from && p.start <= n.state.selection.from + 2 && n.state.selection.from >= c.from
			? (p.start = n.state.selection.from)
			: p.endA < n.state.selection.to &&
				p.endA >= n.state.selection.to - 2 &&
				n.state.selection.to <= c.to &&
				((p.endB += n.state.selection.to - p.endA), (p.endA = n.state.selection.to))),
		Se &&
			Mt <= 11 &&
			p.endB == p.start + 1 &&
			p.endA == p.start &&
			p.start > c.from &&
			c.doc.textBetween(p.start - c.from - 1, p.start - c.from + 1) == '  ' &&
			(p.start--, p.endA--, p.endB--));
	let m = c.doc.resolveNoCache(p.start - c.from),
		g = c.doc.resolveNoCache(p.endB - c.from),
		y = d.resolve(p.start),
		x = m.sameParent(g) && m.parent.inlineContent && y.end() >= p.endA;
	if (
		((Tn && n.input.lastIOSEnter > Date.now() - 225 && (!x || i.some((v) => v.nodeName == 'DIV' || v.nodeName == 'P'))) ||
			(!x &&
				m.pos < c.doc.content.size &&
				(!m.sameParent(g) || !m.parent.inlineContent) &&
				m.pos < g.pos &&
				!/\S/.test(c.doc.textBetween(m.pos, g.pos, '', '')))) &&
		n.someProp('handleKeyDown', (v) => v(n, $t(13, 'Enter')))
	) {
		n.input.lastIOSEnter = 0;
		return;
	}
	if (n.state.selection.anchor > p.start && om(d, p.start, p.endA, m, g) && n.someProp('handleKeyDown', (v) => v(n, $t(8, 'Backspace')))) {
		lt && he && n.domObserver.suppressSelectionUpdates();
		return;
	}
	(he && p.endB == p.start && (n.input.lastChromeDelete = Date.now()),
		lt &&
			!x &&
			m.start() != g.start() &&
			g.parentOffset == 0 &&
			m.depth == g.depth &&
			c.sel &&
			c.sel.anchor == c.sel.head &&
			c.sel.head == p.endA &&
			((p.endB -= 2),
			(g = c.doc.resolveNoCache(p.endB - c.from)),
			setTimeout(() => {
				n.someProp('handleKeyDown', function (v) {
					return v(n, $t(13, 'Enter'));
				});
			}, 20)));
	let M = p.start,
		T = p.endA,
		S = (v) => {
			let D = v || n.state.tr.replace(M, T, c.doc.slice(p.start - c.from, p.endB - c.from));
			if (c.sel) {
				let P = Jl(n, D.doc, c.sel);
				P &&
					!(
						(he &&
							n.composing &&
							P.empty &&
							(p.start != p.endB || n.input.lastChromeDelete < Date.now() - 100) &&
							(P.head == M || P.head == D.mapping.map(T) - 1)) ||
						(Se && P.empty && P.head == M)
					) &&
					D.setSelection(P);
			}
			return (s && D.setMeta('composition', s), D.scrollIntoView());
		},
		A;
	if (x)
		if (m.pos == g.pos) {
			Se && Mt <= 11 && m.parentOffset == 0 && (n.domObserver.suppressSelectionUpdates(), setTimeout(() => ct(n), 20));
			let v = S(n.state.tr.delete(M, T)),
				D = d.resolve(p.start).marksAcross(d.resolve(p.endA));
			(D && v.ensureMarks(D), n.dispatch(v));
		} else if (
			p.endA == p.endB &&
			(A = sm(m.parent.content.cut(m.parentOffset, g.parentOffset), y.parent.content.cut(y.parentOffset, p.endA - y.start())))
		) {
			let v = S(n.state.tr);
			(A.type == 'add' ? v.addMark(M, T, A.mark) : v.removeMark(M, T, A.mark), n.dispatch(v));
		} else if (m.parent.child(m.index()).isText && m.index() == g.index() - (g.textOffset ? 0 : 1)) {
			let v = m.parent.textBetween(m.parentOffset, g.parentOffset),
				D = () => S(n.state.tr.insertText(v, M, T));
			n.someProp('handleTextInput', (P) => P(n, M, T, v, D)) || n.dispatch(D());
		} else n.dispatch(S());
	else n.dispatch(S());
}
function Jl(n, e, t) {
	return Math.max(t.anchor, t.head) > e.content.size ? null : So(n, e.resolve(t.anchor), e.resolve(t.head));
}
function sm(n, e) {
	let t = n.firstChild.marks,
		r = e.firstChild.marks,
		i = t,
		s = r,
		o,
		l,
		a;
	for (let d = 0; d < r.length; d++) i = r[d].removeFromSet(i);
	for (let d = 0; d < t.length; d++) s = t[d].removeFromSet(s);
	if (i.length == 1 && s.length == 0) ((l = i[0]), (o = 'add'), (a = (d) => d.mark(l.addToSet(d.marks))));
	else if (i.length == 0 && s.length == 1) ((l = s[0]), (o = 'remove'), (a = (d) => d.mark(l.removeFromSet(d.marks))));
	else return null;
	let c = [];
	for (let d = 0; d < e.childCount; d++) c.push(a(e.child(d)));
	if (k.from(c).eq(n)) return { mark: l, type: o };
}
function om(n, e, t, r, i) {
	if (t - e <= i.pos - r.pos || hs(r, !0, !1) < i.pos) return !1;
	let s = n.resolve(e);
	if (!r.parent.isTextblock) {
		let l = s.nodeAfter;
		return l != null && t == e + l.nodeSize;
	}
	if (s.parentOffset < s.parent.content.size || !s.parent.isTextblock) return !1;
	let o = n.resolve(hs(s, !0, !0));
	return !o.parent.isTextblock || o.pos > t || hs(o, !0, !1) < t ? !1 : r.parent.content.cut(r.parentOffset).eq(o.parent.content);
}
function hs(n, e, t) {
	let r = n.depth,
		i = e ? n.end() : n.pos;
	for (; r > 0 && (e || n.indexAfter(r) == n.node(r).childCount); ) (r--, i++, (e = !1));
	if (t) {
		let s = n.node(r).maybeChild(n.indexAfter(r));
		for (; s && !s.isLeaf; ) ((s = s.firstChild), i++);
	}
	return i;
}
function lm(n, e, t, r, i) {
	let s = n.findDiffStart(e, t);
	if (s == null) return null;
	let { a: o, b: l } = n.findDiffEnd(e, t + n.size, t + e.size);
	if (i == 'end') {
		let a = Math.max(0, s - Math.min(o, l));
		r -= o + a - s;
	}
	if (o < s && n.size < e.size) {
		let a = r <= s && r >= o ? s - r : 0;
		((s -= a), s && s < e.size && Gl(e.textBetween(s - 1, s + 1)) && (s += a ? 1 : -1), (l = s + (l - o)), (o = s));
	} else if (l < s) {
		let a = r <= s && r >= l ? s - r : 0;
		((s -= a), s && s < n.size && Gl(n.textBetween(s - 1, s + 1)) && (s += a ? 1 : -1), (o = s + (o - l)), (l = s));
	}
	return { start: s, endA: o, endB: l };
}
function Gl(n) {
	if (n.length != 2) return !1;
	let e = n.charCodeAt(0),
		t = n.charCodeAt(1);
	return e >= 56320 && e <= 57343 && t >= 55296 && t <= 56319;
}
class hd {
	constructor(e, t) {
		((this._root = null),
			(this.focused = !1),
			(this.trackWrites = null),
			(this.mounted = !1),
			(this.markCursor = null),
			(this.cursorWrapper = null),
			(this.lastSelectedViewDesc = void 0),
			(this.input = new Tp()),
			(this.prevDirectPlugins = []),
			(this.pluginViews = []),
			(this.requiresGeckoHackNode = !1),
			(this.dragging = null),
			(this._props = t),
			(this.state = t.state),
			(this.directPlugins = t.plugins || []),
			this.directPlugins.forEach(ea),
			(this.dispatch = this.dispatch.bind(this)),
			(this.dom = (e && e.mount) || document.createElement('div')),
			e && (e.appendChild ? e.appendChild(this.dom) : typeof e == 'function' ? e(this.dom) : e.mount && (this.mounted = !0)),
			(this.editable = Ql(this)),
			Xl(this),
			(this.nodeViews = Zl(this)),
			(this.docView = Ol(this.state.doc, Yl(this), fs(this), this.dom, this)),
			(this.domObserver = new Xp(this, (r, i, s, o) => im(this, r, i, s, o))),
			this.domObserver.start(),
			Ap(this),
			this.updatePluginViews());
	}
	get composing() {
		return this.input.composing;
	}
	get props() {
		if (this._props.state != this.state) {
			let e = this._props;
			this._props = {};
			for (let t in e) this._props[t] = e[t];
			this._props.state = this.state;
		}
		return this._props;
	}
	update(e) {
		e.handleDOMEvents != this._props.handleDOMEvents && Vs(this);
		let t = this._props;
		((this._props = e), e.plugins && (e.plugins.forEach(ea), (this.directPlugins = e.plugins)), this.updateStateInner(e.state, t));
	}
	setProps(e) {
		let t = {};
		for (let r in this._props) t[r] = this._props[r];
		t.state = this.state;
		for (let r in e) t[r] = e[r];
		this.update(t);
	}
	updateState(e) {
		this.updateStateInner(e, this._props);
	}
	updateStateInner(e, t) {
		var r;
		let i = this.state,
			s = !1,
			o = !1;
		(e.storedMarks && this.composing && (od(this), (o = !0)), (this.state = e));
		let l = i.plugins != e.plugins || this._props.plugins != t.plugins;
		if (l || this._props.plugins != t.plugins || this._props.nodeViews != t.nodeViews) {
			let h = Zl(this);
			cm(h, this.nodeViews) && ((this.nodeViews = h), (s = !0));
		}
		((l || t.handleDOMEvents != this._props.handleDOMEvents) && Vs(this), (this.editable = Ql(this)), Xl(this));
		let a = fs(this),
			c = Yl(this),
			d = i.plugins != e.plugins && !i.doc.eq(e.doc) ? 'reset' : e.scrollToSelection > i.scrollToSelection ? 'to selection' : 'preserve',
			u = s || !this.docView.matchesNode(e.doc, c, a);
		(u || !e.selection.eq(i.selection)) && (o = !0);
		let f = d == 'preserve' && o && this.dom.style.overflowAnchor == null && _h(this);
		if (o) {
			this.domObserver.stop();
			let h = u && (Se || he) && !this.composing && !i.selection.empty && !e.selection.empty && am(i.selection, e.selection);
			if (u) {
				let p = he ? (this.trackWrites = this.domSelectionRange().focusNode) : null;
				(this.composing && (this.input.compositionNode = Fp(this)),
					(s || !this.docView.update(e.doc, c, a, this)) &&
						(this.docView.updateOuterDeco(c), this.docView.destroy(), (this.docView = Ol(e.doc, c, a, this.dom, this))),
					p && !this.trackWrites && (h = !0));
			}
			(h || !(this.input.mouseDown && this.domObserver.currentSelection.eq(this.domSelectionRange()) && up(this))
				? ct(this, h)
				: (Jc(this, e.selection), this.domObserver.setCurSelection()),
				this.domObserver.start());
		}
		(this.updatePluginViews(i),
			!((r = this.dragging) === null || r === void 0) && r.node && !i.doc.eq(e.doc) && this.updateDraggedNode(this.dragging, i),
			d == 'reset' ? (this.dom.scrollTop = 0) : d == 'to selection' ? this.scrollToSelection() : f && Vh(f));
	}
	scrollToSelection() {
		let e = this.domSelectionRange().focusNode;
		if (!(!e || !this.dom.contains(e.nodeType == 1 ? e : e.parentNode))) {
			if (!this.someProp('handleScrollToSelection', (t) => t(this)))
				if (this.state.selection instanceof N) {
					let t = this.docView.domAfterPos(this.state.selection.from);
					t.nodeType == 1 && Cl(this, t.getBoundingClientRect(), e);
				} else Cl(this, this.coordsAtPos(this.state.selection.head, 1), e);
		}
	}
	destroyPluginViews() {
		let e;
		for (; (e = this.pluginViews.pop()); ) e.destroy && e.destroy();
	}
	updatePluginViews(e) {
		if (!e || e.plugins != this.state.plugins || this.directPlugins != this.prevDirectPlugins) {
			((this.prevDirectPlugins = this.directPlugins), this.destroyPluginViews());
			for (let t = 0; t < this.directPlugins.length; t++) {
				let r = this.directPlugins[t];
				r.spec.view && this.pluginViews.push(r.spec.view(this));
			}
			for (let t = 0; t < this.state.plugins.length; t++) {
				let r = this.state.plugins[t];
				r.spec.view && this.pluginViews.push(r.spec.view(this));
			}
		} else
			for (let t = 0; t < this.pluginViews.length; t++) {
				let r = this.pluginViews[t];
				r.update && r.update(this, e);
			}
	}
	updateDraggedNode(e, t) {
		let r = e.node,
			i = -1;
		if (this.state.doc.nodeAt(r.from) == r.node) i = r.from;
		else {
			let s = r.from + (this.state.doc.content.size - t.doc.content.size);
			(s > 0 && this.state.doc.nodeAt(s)) == r.node && (i = s);
		}
		this.dragging = new ad(e.slice, e.move, i < 0 ? void 0 : N.create(this.state.doc, i));
	}
	someProp(e, t) {
		let r = this._props && this._props[e],
			i;
		if (r != null && (i = t ? t(r) : r)) return i;
		for (let o = 0; o < this.directPlugins.length; o++) {
			let l = this.directPlugins[o].props[e];
			if (l != null && (i = t ? t(l) : l)) return i;
		}
		let s = this.state.plugins;
		if (s)
			for (let o = 0; o < s.length; o++) {
				let l = s[o].props[e];
				if (l != null && (i = t ? t(l) : l)) return i;
			}
	}
	hasFocus() {
		if (Se) {
			let e = this.root.activeElement;
			if (e == this.dom) return !0;
			if (!e || !this.dom.contains(e)) return !1;
			for (; e && this.dom != e && this.dom.contains(e); ) {
				if (e.contentEditable == 'false') return !1;
				e = e.parentElement;
			}
			return !0;
		}
		return this.root.activeElement == this.dom;
	}
	focus() {
		(this.domObserver.stop(), this.editable && Wh(this.dom), ct(this), this.domObserver.start());
	}
	get root() {
		let e = this._root;
		if (e == null) {
			for (let t = this.dom.parentNode; t; t = t.parentNode)
				if (t.nodeType == 9 || (t.nodeType == 11 && t.host))
					return (t.getSelection || (Object.getPrototypeOf(t).getSelection = () => t.ownerDocument.getSelection()), (this._root = t));
		}
		return e || document;
	}
	updateRoot() {
		this._root = null;
	}
	posAtCoords(e) {
		return Jh(this, e);
	}
	coordsAtPos(e, t = 1) {
		return Fc(this, e, t);
	}
	domAtPos(e, t = 0) {
		return this.docView.domFromPos(e, t);
	}
	nodeDOM(e) {
		let t = this.docView.descAt(e);
		return t ? t.nodeDOM : null;
	}
	posAtDOM(e, t, r = -1) {
		let i = this.docView.posFromDOM(e, t, r);
		if (i == null) throw new RangeError('DOM position not inside the editor');
		return i;
	}
	endOfTextblock(e, t) {
		return Zh(this, t || this.state, e);
	}
	pasteHTML(e, t) {
		return or(this, '', e, !1, t || new ClipboardEvent('paste'));
	}
	pasteText(e, t) {
		return or(this, e, null, !0, t || new ClipboardEvent('paste'));
	}
	serializeForClipboard(e) {
		return vo(this, e);
	}
	destroy() {
		this.docView &&
			(Ep(this),
			this.destroyPluginViews(),
			this.mounted
				? (this.docView.update(this.state.doc, [], fs(this), this), (this.dom.textContent = ''))
				: this.dom.parentNode && this.dom.parentNode.removeChild(this.dom),
			this.docView.destroy(),
			(this.docView = null),
			Oh());
	}
	get isDestroyed() {
		return this.docView == null;
	}
	dispatchEvent(e) {
		return Op(this, e);
	}
	domSelectionRange() {
		let e = this.domSelection();
		return e
			? (be && this.root.nodeType === 11 && Ph(this.dom.ownerDocument) == this.dom && Zp(this, e)) || e
			: { focusNode: null, focusOffset: 0, anchorNode: null, anchorOffset: 0 };
	}
	domSelection() {
		return this.root.getSelection();
	}
}
hd.prototype.dispatch = function (n) {
	let e = this._props.dispatchTransaction;
	e ? e.call(this, n) : this.updateState(this.state.apply(n));
};
function Yl(n) {
	let e = Object.create(null);
	return (
		(e.class = 'ProseMirror'),
		(e.contenteditable = String(n.editable)),
		n.someProp('attributes', (t) => {
			if ((typeof t == 'function' && (t = t(n.state)), t))
				for (let r in t)
					r == 'class'
						? (e.class += ' ' + t[r])
						: r == 'style'
							? (e.style = (e.style ? e.style + ';' : '') + t[r])
							: !e[r] && r != 'contenteditable' && r != 'nodeName' && (e[r] = String(t[r]));
		}),
		e.translate || (e.translate = 'no'),
		[ne.node(0, n.state.doc.content.size, e)]
	);
}
function Xl(n) {
	if (n.markCursor) {
		let e = document.createElement('img');
		((e.className = 'ProseMirror-separator'),
			e.setAttribute('mark-placeholder', 'true'),
			e.setAttribute('alt', ''),
			(n.cursorWrapper = { dom: e, deco: ne.widget(n.state.selection.from, e, { raw: !0, marks: n.markCursor }) }));
	} else n.cursorWrapper = null;
}
function Ql(n) {
	return !n.someProp('editable', (e) => e(n.state) === !1);
}
function am(n, e) {
	let t = Math.min(n.$anchor.sharedDepth(n.head), e.$anchor.sharedDepth(e.head));
	return n.$anchor.start(t) != e.$anchor.start(t);
}
function Zl(n) {
	let e = Object.create(null);
	function t(r) {
		for (let i in r) Object.prototype.hasOwnProperty.call(e, i) || (e[i] = r[i]);
	}
	return (n.someProp('nodeViews', t), n.someProp('markViews', t), e);
}
function cm(n, e) {
	let t = 0,
		r = 0;
	for (let i in n) {
		if (n[i] != e[i]) return !0;
		t++;
	}
	for (let i in e) r++;
	return t != r;
}
function ea(n) {
	if (n.spec.state || n.spec.filterTransaction || n.spec.appendTransaction)
		throw new RangeError('Plugins passed directly to the view must not have a state component');
}
var Et = {
		8: 'Backspace',
		9: 'Tab',
		10: 'Enter',
		12: 'NumLock',
		13: 'Enter',
		16: 'Shift',
		17: 'Control',
		18: 'Alt',
		20: 'CapsLock',
		27: 'Escape',
		32: ' ',
		33: 'PageUp',
		34: 'PageDown',
		35: 'End',
		36: 'Home',
		37: 'ArrowLeft',
		38: 'ArrowUp',
		39: 'ArrowRight',
		40: 'ArrowDown',
		44: 'PrintScreen',
		45: 'Insert',
		46: 'Delete',
		59: ';',
		61: '=',
		91: 'Meta',
		92: 'Meta',
		106: '*',
		107: '+',
		108: ',',
		109: '-',
		110: '.',
		111: '/',
		144: 'NumLock',
		145: 'ScrollLock',
		160: 'Shift',
		161: 'Shift',
		162: 'Control',
		163: 'Control',
		164: 'Alt',
		165: 'Alt',
		173: '-',
		186: ';',
		187: '=',
		188: ',',
		189: '-',
		190: '.',
		191: '/',
		192: '`',
		219: '[',
		220: '\\',
		221: ']',
		222: "'"
	},
	Zr = {
		48: ')',
		49: '!',
		50: '@',
		51: '#',
		52: '$',
		53: '%',
		54: '^',
		55: '&',
		56: '*',
		57: '(',
		59: ':',
		61: '+',
		173: '_',
		186: ':',
		187: '+',
		188: '<',
		189: '_',
		190: '>',
		191: '?',
		192: '~',
		219: '{',
		220: '|',
		221: '}',
		222: '"'
	},
	dm = typeof navigator < 'u' && /Mac/.test(navigator.platform),
	um = typeof navigator < 'u' && /MSIE \d|Trident\/(?:[7-9]|\d{2,})\..*rv:(\d+)/.exec(navigator.userAgent);
for (var ce = 0; ce < 10; ce++) Et[48 + ce] = Et[96 + ce] = String(ce);
for (var ce = 1; ce <= 24; ce++) Et[ce + 111] = 'F' + ce;
for (var ce = 65; ce <= 90; ce++) ((Et[ce] = String.fromCharCode(ce + 32)), (Zr[ce] = String.fromCharCode(ce)));
for (var ps in Et) Zr.hasOwnProperty(ps) || (Zr[ps] = Et[ps]);
function fm(n) {
	var e = (dm && n.metaKey && n.shiftKey && !n.ctrlKey && !n.altKey) || (um && n.shiftKey && n.key && n.key.length == 1) || n.key == 'Unidentified',
		t = (!e && n.key) || (n.shiftKey ? Zr : Et)[n.keyCode] || n.key || 'Unidentified';
	return (
		t == 'Esc' && (t = 'Escape'),
		t == 'Del' && (t = 'Delete'),
		t == 'Left' && (t = 'ArrowLeft'),
		t == 'Up' && (t = 'ArrowUp'),
		t == 'Right' && (t = 'ArrowRight'),
		t == 'Down' && (t = 'ArrowDown'),
		t
	);
}
const hm = typeof navigator < 'u' && /Mac|iP(hone|[oa]d)/.test(navigator.platform),
	pm = typeof navigator < 'u' && /Win/.test(navigator.platform);
function mm(n) {
	let e = n.split(/-(?!$)/),
		t = e[e.length - 1];
	t == 'Space' && (t = ' ');
	let r, i, s, o;
	for (let l = 0; l < e.length - 1; l++) {
		let a = e[l];
		if (/^(cmd|meta|m)$/i.test(a)) o = !0;
		else if (/^a(lt)?$/i.test(a)) r = !0;
		else if (/^(c|ctrl|control)$/i.test(a)) i = !0;
		else if (/^s(hift)?$/i.test(a)) s = !0;
		else if (/^mod$/i.test(a)) hm ? (o = !0) : (i = !0);
		else throw new Error('Unrecognized modifier name: ' + a);
	}
	return (r && (t = 'Alt-' + t), i && (t = 'Ctrl-' + t), o && (t = 'Meta-' + t), s && (t = 'Shift-' + t), t);
}
function gm(n) {
	let e = Object.create(null);
	for (let t in n) e[mm(t)] = n[t];
	return e;
}
function ms(n, e, t = !0) {
	return (e.altKey && (n = 'Alt-' + n), e.ctrlKey && (n = 'Ctrl-' + n), e.metaKey && (n = 'Meta-' + n), t && e.shiftKey && (n = 'Shift-' + n), n);
}
function ym(n) {
	return new K({ props: { handleKeyDown: No(n) } });
}
function No(n) {
	let e = gm(n);
	return function (t, r) {
		let i = fm(r),
			s,
			o = e[ms(i, r)];
		if (o && o(t.state, t.dispatch, t)) return !0;
		if (i.length == 1 && i != ' ') {
			if (r.shiftKey) {
				let l = e[ms(i, r, !1)];
				if (l && l(t.state, t.dispatch, t)) return !0;
			}
			if ((r.altKey || r.metaKey || r.ctrlKey) && !(pm && r.ctrlKey && r.altKey) && (s = Et[r.keyCode]) && s != i) {
				let l = e[ms(s, r)];
				if (l && l(t.state, t.dispatch, t)) return !0;
			}
		}
		return !1;
	};
}
var bm = Object.defineProperty,
	Oo = (n, e) => {
		for (var t in e) bm(n, t, { get: e[t], enumerable: !0 });
	};
function $i(n) {
	const { state: e, transaction: t } = n;
	let { selection: r } = t,
		{ doc: i } = t,
		{ storedMarks: s } = t;
	return {
		...e,
		apply: e.apply.bind(e),
		applyTransaction: e.applyTransaction.bind(e),
		plugins: e.plugins,
		schema: e.schema,
		reconfigure: e.reconfigure.bind(e),
		toJSON: e.toJSON.bind(e),
		get storedMarks() {
			return s;
		},
		get selection() {
			return r;
		},
		get doc() {
			return i;
		},
		get tr() {
			return ((r = t.selection), (i = t.doc), (s = t.storedMarks), t);
		}
	};
}
var Fi = class {
		constructor(n) {
			((this.editor = n.editor), (this.rawCommands = this.editor.extensionManager.commands), (this.customState = n.state));
		}
		get hasCustomState() {
			return !!this.customState;
		}
		get state() {
			return this.customState || this.editor.state;
		}
		get commands() {
			const { rawCommands: n, editor: e, state: t } = this,
				{ view: r } = e,
				{ tr: i } = t,
				s = this.buildProps(i);
			return Object.fromEntries(
				Object.entries(n).map(([o, l]) => [
					o,
					(...c) => {
						const d = l(...c)(s);
						return (!i.getMeta('preventDispatch') && !this.hasCustomState && r.dispatch(i), d);
					}
				])
			);
		}
		get chain() {
			return () => this.createChain();
		}
		get can() {
			return () => this.createCan();
		}
		createChain(n, e = !0) {
			const { rawCommands: t, editor: r, state: i } = this,
				{ view: s } = r,
				o = [],
				l = !!n,
				a = n || i.tr,
				c = () => (!l && e && !a.getMeta('preventDispatch') && !this.hasCustomState && s.dispatch(a), o.every((u) => u === !0)),
				d = {
					...Object.fromEntries(
						Object.entries(t).map(([u, f]) => [
							u,
							(...p) => {
								const m = this.buildProps(a, e),
									g = f(...p)(m);
								return (o.push(g), d);
							}
						])
					),
					run: c
				};
			return d;
		}
		createCan(n) {
			const { rawCommands: e, state: t } = this,
				r = !1,
				i = n || t.tr,
				s = this.buildProps(i, r);
			return {
				...Object.fromEntries(Object.entries(e).map(([l, a]) => [l, (...c) => a(...c)({ ...s, dispatch: void 0 })])),
				chain: () => this.createChain(i, r)
			};
		}
		buildProps(n, e = !0) {
			const { rawCommands: t, editor: r, state: i } = this,
				{ view: s } = r,
				o = {
					tr: n,
					editor: r,
					view: s,
					state: $i({ state: i, transaction: n }),
					dispatch: e ? () => {} : void 0,
					chain: () => this.createChain(n, e),
					can: () => this.createCan(n),
					get commands() {
						return Object.fromEntries(Object.entries(t).map(([l, a]) => [l, (...c) => a(...c)(o)]));
					}
				};
			return o;
		}
	},
	pd = {};
Oo(pd, {
	blur: () => km,
	clearContent: () => xm,
	clearNodes: () => wm,
	command: () => Sm,
	createParagraphNear: () => vm,
	cut: () => Cm,
	deleteCurrentNode: () => Mm,
	deleteNode: () => Tm,
	deleteRange: () => Am,
	deleteSelection: () => Em,
	enter: () => Nm,
	exitCode: () => Om,
	extendMarkRange: () => Rm,
	first: () => Im,
	focus: () => Lm,
	forEach: () => Pm,
	insertContent: () => zm,
	insertContentAt: () => $m,
	joinBackward: () => Vm,
	joinDown: () => _m,
	joinForward: () => Wm,
	joinItemBackward: () => jm,
	joinItemForward: () => Km,
	joinTextblockBackward: () => Um,
	joinTextblockForward: () => qm,
	joinUp: () => Fm,
	keyboardShortcut: () => Gm,
	lift: () => Ym,
	liftEmptyBlock: () => Xm,
	liftListItem: () => Qm,
	newlineInCode: () => Zm,
	resetAttributes: () => eg,
	scrollIntoView: () => tg,
	selectAll: () => ng,
	selectNodeBackward: () => rg,
	selectNodeForward: () => ig,
	selectParentNode: () => sg,
	selectTextblockEnd: () => og,
	selectTextblockStart: () => lg,
	setContent: () => ag,
	setMark: () => Ag,
	setMeta: () => Eg,
	setNode: () => Ng,
	setNodeSelection: () => Og,
	setTextDirection: () => Rg,
	setTextSelection: () => Ig,
	sinkListItem: () => Dg,
	splitBlock: () => Lg,
	splitListItem: () => Pg,
	toggleList: () => zg,
	toggleMark: () => Bg,
	toggleNode: () => Hg,
	toggleWrap: () => $g,
	undoInputRule: () => Fg,
	unsetAllMarks: () => _g,
	unsetMark: () => Vg,
	unsetTextDirection: () => Wg,
	updateAttributes: () => jg,
	wrapIn: () => Kg,
	wrapInList: () => Ug
});
var km =
		() =>
		({ editor: n, view: e }) => (
			requestAnimationFrame(() => {
				var t;
				n.isDestroyed || (e.dom.blur(), (t = window?.getSelection()) == null || t.removeAllRanges());
			}),
			!0
		),
	xm =
		(n = !0) =>
		({ commands: e }) =>
			e.setContent('', { emitUpdate: n }),
	wm =
		() =>
		({ state: n, tr: e, dispatch: t }) => {
			const { selection: r } = e,
				{ ranges: i } = r;
			return (
				t &&
					i.forEach(({ $from: s, $to: o }) => {
						n.doc.nodesBetween(s.pos, o.pos, (l, a) => {
							if (l.type.isText) return;
							const { doc: c, mapping: d } = e,
								u = c.resolve(d.map(a)),
								f = c.resolve(d.map(a + l.nodeSize)),
								h = u.blockRange(f);
							if (!h) return;
							const p = On(h);
							if (l.type.isTextblock) {
								const { defaultType: m } = u.parent.contentMatchAt(u.index());
								e.setNodeMarkup(h.start, m);
							}
							(p || p === 0) && e.lift(h, p);
						});
					}),
				!0
			);
		},
	Sm = (n) => (e) => n(e),
	vm =
		() =>
		({ state: n, dispatch: e }) =>
			Oc(n, e),
	Cm =
		(n, e) =>
		({ editor: t, tr: r }) => {
			const { state: i } = t,
				s = i.doc.slice(n.from, n.to);
			r.deleteRange(n.from, n.to);
			const o = r.mapping.map(e);
			return (r.insert(o, s.content), r.setSelection(new O(r.doc.resolve(Math.max(o - 1, 0)))), !0);
		},
	Mm =
		() =>
		({ tr: n, dispatch: e }) => {
			const { selection: t } = n,
				r = t.$anchor.node();
			if (r.content.size > 0) return !1;
			const i = n.selection.$anchor;
			for (let s = i.depth; s > 0; s -= 1)
				if (i.node(s).type === r.type) {
					if (e) {
						const l = i.before(s),
							a = i.after(s);
						n.delete(l, a).scrollIntoView();
					}
					return !0;
				}
			return !1;
		};
function X(n, e) {
	if (typeof n == 'string') {
		if (!e.nodes[n]) throw Error(`There is no node type named '${n}'. Maybe you forgot to add the extension?`);
		return e.nodes[n];
	}
	return n;
}
var Tm =
		(n) =>
		({ tr: e, state: t, dispatch: r }) => {
			const i = X(n, t.schema),
				s = e.selection.$anchor;
			for (let o = s.depth; o > 0; o -= 1)
				if (s.node(o).type === i) {
					if (r) {
						const a = s.before(o),
							c = s.after(o);
						e.delete(a, c).scrollIntoView();
					}
					return !0;
				}
			return !1;
		},
	Am =
		(n) =>
		({ tr: e, dispatch: t }) => {
			const { from: r, to: i } = n;
			return (t && e.delete(r, i), !0);
		},
	Em =
		() =>
		({ state: n, dispatch: e }) =>
			mo(n, e),
	Nm =
		() =>
		({ commands: n }) =>
			n.keyboardShortcut('Enter'),
	Om =
		() =>
		({ state: n, dispatch: e }) =>
			mh(n, e);
function Ro(n) {
	return Object.prototype.toString.call(n) === '[object RegExp]';
}
function ei(n, e, t = { strict: !0 }) {
	const r = Object.keys(e);
	return r.length ? r.every((i) => (t.strict ? e[i] === n[i] : Ro(e[i]) ? e[i].test(n[i]) : e[i] === n[i])) : !0;
}
function md(n, e, t = {}) {
	return n.find((r) => r.type === e && ei(Object.fromEntries(Object.keys(t).map((i) => [i, r.attrs[i]])), t));
}
function ta(n, e, t = {}) {
	return !!md(n, e, t);
}
function Io(n, e, t) {
	var r;
	if (!n || !e) return;
	let i = n.parent.childAfter(n.parentOffset);
	if (
		((!i.node || !i.node.marks.some((d) => d.type === e)) && (i = n.parent.childBefore(n.parentOffset)),
		!i.node ||
			!i.node.marks.some((d) => d.type === e) ||
			((t = t || ((r = i.node.marks[0]) == null ? void 0 : r.attrs)), !md([...i.node.marks], e, t)))
	)
		return;
	let o = i.index,
		l = n.start() + i.offset,
		a = o + 1,
		c = l + i.node.nodeSize;
	for (; o > 0 && ta([...n.parent.child(o - 1).marks], e, t); ) ((o -= 1), (l -= n.parent.child(o).nodeSize));
	for (; a < n.parent.childCount && ta([...n.parent.child(a).marks], e, t); ) ((c += n.parent.child(a).nodeSize), (a += 1));
	return { from: l, to: c };
}
function dt(n, e) {
	if (typeof n == 'string') {
		if (!e.marks[n]) throw Error(`There is no mark type named '${n}'. Maybe you forgot to add the extension?`);
		return e.marks[n];
	}
	return n;
}
var Rm =
		(n, e = {}) =>
		({ tr: t, state: r, dispatch: i }) => {
			const s = dt(n, r.schema),
				{ doc: o, selection: l } = t,
				{ $from: a, from: c, to: d } = l;
			if (i) {
				const u = Io(a, s, e);
				if (u && u.from <= c && u.to >= d) {
					const f = O.create(o, u.from, u.to);
					t.setSelection(f);
				}
			}
			return !0;
		},
	Im = (n) => (e) => {
		const t = typeof n == 'function' ? n(e) : n;
		for (let r = 0; r < t.length; r += 1) if (t[r](e)) return !0;
		return !1;
	};
function gd(n) {
	return n instanceof O;
}
function Vt(n = 0, e = 0, t = 0) {
	return Math.min(Math.max(n, e), t);
}
function yd(n, e = null) {
	if (!e) return null;
	const t = R.atStart(n),
		r = R.atEnd(n);
	if (e === 'start' || e === !0) return t;
	if (e === 'end') return r;
	const i = t.from,
		s = r.to;
	return e === 'all' ? O.create(n, Vt(0, i, s), Vt(n.content.size, i, s)) : O.create(n, Vt(e, i, s), Vt(e, i, s));
}
function na() {
	return navigator.platform === 'Android' || /android/i.test(navigator.userAgent);
}
function ti() {
	return (
		['iPad Simulator', 'iPhone Simulator', 'iPod Simulator', 'iPad', 'iPhone', 'iPod'].includes(navigator.platform) ||
		(navigator.userAgent.includes('Mac') && 'ontouchend' in document)
	);
}
function Dm() {
	return typeof navigator < 'u' ? /^((?!chrome|android).)*safari/i.test(navigator.userAgent) : !1;
}
var Lm =
		(n = null, e = {}) =>
		({ editor: t, view: r, tr: i, dispatch: s }) => {
			e = { scrollIntoView: !0, ...e };
			const o = () => {
				((ti() || na()) && r.dom.focus(),
					Dm() && !ti() && !na() && r.dom.focus({ preventScroll: !0 }),
					requestAnimationFrame(() => {
						t.isDestroyed || (r.focus(), e?.scrollIntoView && t.commands.scrollIntoView());
					}));
			};
			if ((r.hasFocus() && n === null) || n === !1) return !0;
			if (s && n === null && !gd(t.state.selection)) return (o(), !0);
			const l = yd(i.doc, n) || t.state.selection,
				a = t.state.selection.eq(l);
			return (s && (a || i.setSelection(l), a && i.storedMarks && i.setStoredMarks(i.storedMarks), o()), !0);
		},
	Pm = (n, e) => (t) => n.every((r, i) => e(r, { ...t, index: i })),
	zm =
		(n, e) =>
		({ tr: t, commands: r }) =>
			r.insertContentAt({ from: t.selection.from, to: t.selection.to }, n, e),
	bd = (n) => {
		const e = n.childNodes;
		for (let t = e.length - 1; t >= 0; t -= 1) {
			const r = e[t];
			r.nodeType === 3 && r.nodeValue && /^(\n\s\s|\n)$/.test(r.nodeValue) ? n.removeChild(r) : r.nodeType === 1 && bd(r);
		}
		return n;
	};
function vr(n) {
	if (typeof window > 'u') throw new Error('[tiptap error]: there is no window object available, so this function cannot be used');
	const e = `<body>${n}</body>`,
		t = new window.DOMParser().parseFromString(e, 'text/html').body;
	return bd(t);
}
function ar(n, e, t) {
	if (n instanceof Ve || n instanceof k) return n;
	t = { slice: !0, parseOptions: {}, ...t };
	const r = typeof n == 'object' && n !== null,
		i = typeof n == 'string';
	if (r)
		try {
			if (Array.isArray(n) && n.length > 0) return k.fromArray(n.map((l) => e.nodeFromJSON(l)));
			const o = e.nodeFromJSON(n);
			return (t.errorOnInvalidContent && o.check(), o);
		} catch (s) {
			if (t.errorOnInvalidContent) throw new Error('[tiptap error]: Invalid JSON content', { cause: s });
			return (console.warn('[tiptap warn]: Invalid content.', 'Passed value:', n, 'Error:', s), ar('', e, t));
		}
	if (i) {
		if (t.errorOnInvalidContent) {
			let o = !1,
				l = '';
			const a = new rc({
				topNode: e.spec.topNode,
				marks: e.spec.marks,
				nodes: e.spec.nodes.append({
					__tiptap__private__unknown__catch__all__node: {
						content: 'inline*',
						group: 'block',
						parseDOM: [{ tag: '*', getAttrs: (c) => ((o = !0), (l = typeof c == 'string' ? c : c.outerHTML), null) }]
					}
				})
			});
			if (
				(t.slice ? Ct.fromSchema(a).parseSlice(vr(n), t.parseOptions) : Ct.fromSchema(a).parse(vr(n), t.parseOptions), t.errorOnInvalidContent && o)
			)
				throw new Error('[tiptap error]: Invalid HTML content', { cause: new Error(`Invalid element found: ${l}`) });
		}
		const s = Ct.fromSchema(e);
		return t.slice ? s.parseSlice(vr(n), t.parseOptions).content : s.parse(vr(n), t.parseOptions);
	}
	return ar('', e, t);
}
function Bm(n, e, t) {
	const r = n.steps.length - 1;
	if (r < e) return;
	const i = n.steps[r];
	if (!(i instanceof te || i instanceof re)) return;
	const s = n.mapping.maps[r];
	let o = 0;
	(s.forEach((l, a, c, d) => {
		o === 0 && (o = d);
	}),
		n.setSelection(R.near(n.doc.resolve(o), t)));
}
var Hm = (n) => !('type' in n),
	$m =
		(n, e, t) =>
		({ tr: r, dispatch: i, editor: s }) => {
			var o;
			if (i) {
				t = { parseOptions: s.options.parseOptions, updateSelection: !0, applyInputRules: !1, applyPasteRules: !1, ...t };
				let l;
				const a = (g) => {
						s.emit('contentError', {
							editor: s,
							error: g,
							disableCollaboration: () => {
								'collaboration' in s.storage &&
									typeof s.storage.collaboration == 'object' &&
									s.storage.collaboration &&
									(s.storage.collaboration.isDisabled = !0);
							}
						});
					},
					c = { preserveWhitespace: 'full', ...t.parseOptions };
				if (!t.errorOnInvalidContent && !s.options.enableContentCheck && s.options.emitContentError)
					try {
						ar(e, s.schema, { parseOptions: c, errorOnInvalidContent: !0 });
					} catch (g) {
						a(g);
					}
				try {
					l = ar(e, s.schema, { parseOptions: c, errorOnInvalidContent: (o = t.errorOnInvalidContent) != null ? o : s.options.enableContentCheck });
				} catch (g) {
					return (a(g), !1);
				}
				let { from: d, to: u } = typeof n == 'number' ? { from: n, to: n } : { from: n.from, to: n.to },
					f = !0,
					h = !0;
				if (
					((Hm(l) ? l : [l]).forEach((g) => {
						(g.check(), (f = f ? g.isText && g.marks.length === 0 : !1), (h = h ? g.isBlock : !1));
					}),
					d === u && h)
				) {
					const { parent: g } = r.doc.resolve(d);
					g.isTextblock && !g.type.spec.code && !g.childCount && ((d -= 1), (u += 1));
				}
				let m;
				if (f) {
					if (Array.isArray(e)) m = e.map((g) => g.text || '').join('');
					else if (e instanceof k) {
						let g = '';
						(e.forEach((y) => {
							y.text && (g += y.text);
						}),
							(m = g));
					} else typeof e == 'object' && e && e.text ? (m = e.text) : (m = e);
					r.insertText(m, d, u);
				} else {
					m = l;
					const g = r.doc.resolve(d),
						y = g.node(),
						x = g.parentOffset === 0,
						M = y.isText || y.isTextblock,
						T = y.content.size > 0;
					(x && M && T && (d = Math.max(0, d - 1)), r.replaceWith(d, u, m));
				}
				(t.updateSelection && Bm(r, r.steps.length - 1, -1),
					t.applyInputRules && r.setMeta('applyInputRules', { from: d, text: m }),
					t.applyPasteRules && r.setMeta('applyPasteRules', { from: d, text: m }));
			}
			return !0;
		},
	Fm =
		() =>
		({ state: n, dispatch: e }) =>
			fh(n, e),
	_m =
		() =>
		({ state: n, dispatch: e }) =>
			hh(n, e),
	Vm =
		() =>
		({ state: n, dispatch: e }) =>
			vc(n, e),
	Wm =
		() =>
		({ state: n, dispatch: e }) =>
			Ac(n, e),
	jm =
		() =>
		({ state: n, dispatch: e, tr: t }) => {
			try {
				const r = Di(n.doc, n.selection.$from.pos, -1);
				return r == null ? !1 : (t.join(r, 2), e && e(t), !0);
			} catch {
				return !1;
			}
		},
	Km =
		() =>
		({ state: n, dispatch: e, tr: t }) => {
			try {
				const r = Di(n.doc, n.selection.$from.pos, 1);
				return r == null ? !1 : (t.join(r, 2), e && e(t), !0);
			} catch {
				return !1;
			}
		},
	Um =
		() =>
		({ state: n, dispatch: e }) =>
			dh(n, e),
	qm =
		() =>
		({ state: n, dispatch: e }) =>
			uh(n, e);
function kd() {
	return typeof navigator < 'u' ? /Mac/.test(navigator.platform) : !1;
}
function Jm(n) {
	const e = n.split(/-(?!$)/);
	let t = e[e.length - 1];
	t === 'Space' && (t = ' ');
	let r, i, s, o;
	for (let l = 0; l < e.length - 1; l += 1) {
		const a = e[l];
		if (/^(cmd|meta|m)$/i.test(a)) o = !0;
		else if (/^a(lt)?$/i.test(a)) r = !0;
		else if (/^(c|ctrl|control)$/i.test(a)) i = !0;
		else if (/^s(hift)?$/i.test(a)) s = !0;
		else if (/^mod$/i.test(a)) ti() || kd() ? (o = !0) : (i = !0);
		else throw new Error(`Unrecognized modifier name: ${a}`);
	}
	return (r && (t = `Alt-${t}`), i && (t = `Ctrl-${t}`), o && (t = `Meta-${t}`), s && (t = `Shift-${t}`), t);
}
var Gm =
	(n) =>
	({ editor: e, view: t, tr: r, dispatch: i }) => {
		const s = Jm(n).split(/-(?!$)/),
			o = s.find((c) => !['Alt', 'Ctrl', 'Meta', 'Shift'].includes(c)),
			l = new KeyboardEvent('keydown', {
				key: o === 'Space' ? ' ' : o,
				altKey: s.includes('Alt'),
				ctrlKey: s.includes('Ctrl'),
				metaKey: s.includes('Meta'),
				shiftKey: s.includes('Shift'),
				bubbles: !0,
				cancelable: !0
			}),
			a = e.captureTransaction(() => {
				t.someProp('handleKeyDown', (c) => c(t, l));
			});
		return (
			a?.steps.forEach((c) => {
				const d = c.map(r.mapping);
				d && i && r.maybeStep(d);
			}),
			!0
		);
	};
function Nt(n, e, t = {}) {
	const { from: r, to: i, empty: s } = n.selection,
		o = e ? X(e, n.schema) : null,
		l = [];
	n.doc.nodesBetween(r, i, (u, f) => {
		if (u.isText) return;
		const h = Math.max(r, f),
			p = Math.min(i, f + u.nodeSize);
		l.push({ node: u, from: h, to: p });
	});
	const a = i - r,
		c = l.filter((u) => (o ? o.name === u.node.type.name : !0)).filter((u) => ei(u.node.attrs, t, { strict: !1 }));
	return s ? !!c.length : c.reduce((u, f) => u + f.to - f.from, 0) >= a;
}
var Ym =
		(n, e = {}) =>
		({ state: t, dispatch: r }) => {
			const i = X(n, t.schema);
			return Nt(t, i, e) ? ph(t, r) : !1;
		},
	Xm =
		() =>
		({ state: n, dispatch: e }) =>
			Rc(n, e),
	Qm =
		(n) =>
		({ state: e, dispatch: t }) => {
			const r = X(n, e.schema);
			return Th(r)(e, t);
		},
	Zm =
		() =>
		({ state: n, dispatch: e }) =>
			Nc(n, e);
function _i(n, e) {
	return e.nodes[n] ? 'node' : e.marks[n] ? 'mark' : null;
}
function ra(n, e) {
	const t = typeof e == 'string' ? [e] : e;
	return Object.keys(n).reduce((r, i) => (t.includes(i) || (r[i] = n[i]), r), {});
}
var eg =
		(n, e) =>
		({ tr: t, state: r, dispatch: i }) => {
			let s = null,
				o = null;
			const l = _i(typeof n == 'string' ? n : n.name, r.schema);
			if (!l) return !1;
			(l === 'node' && (s = X(n, r.schema)), l === 'mark' && (o = dt(n, r.schema)));
			let a = !1;
			return (
				t.selection.ranges.forEach((c) => {
					r.doc.nodesBetween(c.$from.pos, c.$to.pos, (d, u) => {
						(s && s === d.type && ((a = !0), i && t.setNodeMarkup(u, void 0, ra(d.attrs, e))),
							o &&
								d.marks.length &&
								d.marks.forEach((f) => {
									o === f.type && ((a = !0), i && t.addMark(u, u + d.nodeSize, o.create(ra(f.attrs, e))));
								}));
					});
				}),
				a
			);
		},
	tg =
		() =>
		({ tr: n, dispatch: e }) => (e && n.scrollIntoView(), !0),
	ng =
		() =>
		({ tr: n, dispatch: e }) => {
			if (e) {
				const t = new Ae(n.doc);
				n.setSelection(t);
			}
			return !0;
		},
	rg =
		() =>
		({ state: n, dispatch: e }) =>
			Mc(n, e),
	ig =
		() =>
		({ state: n, dispatch: e }) =>
			Ec(n, e),
	sg =
		() =>
		({ state: n, dispatch: e }) =>
			bh(n, e),
	og =
		() =>
		({ state: n, dispatch: e }) =>
			wh(n, e),
	lg =
		() =>
		({ state: n, dispatch: e }) =>
			xh(n, e);
function Ws(n, e, t = {}, r = {}) {
	return ar(n, e, { slice: !1, parseOptions: t, errorOnInvalidContent: r.errorOnInvalidContent });
}
var ag =
	(n, { errorOnInvalidContent: e, emitUpdate: t = !0, parseOptions: r = {} } = {}) =>
	({ editor: i, tr: s, dispatch: o, commands: l }) => {
		const { doc: a } = s;
		if (r.preserveWhitespace !== 'full') {
			const c = Ws(n, i.schema, r, { errorOnInvalidContent: e ?? i.options.enableContentCheck });
			return (o && s.replaceWith(0, a.content.size, c).setMeta('preventUpdate', !t), !0);
		}
		return (
			o && s.setMeta('preventUpdate', !t),
			l.insertContentAt({ from: 0, to: a.content.size }, n, { parseOptions: r, errorOnInvalidContent: e ?? i.options.enableContentCheck })
		);
	};
function xd(n, e) {
	const t = dt(e, n.schema),
		{ from: r, to: i, empty: s } = n.selection,
		o = [];
	s
		? (n.storedMarks && o.push(...n.storedMarks), o.push(...n.selection.$head.marks()))
		: n.doc.nodesBetween(r, i, (a) => {
				o.push(...a.marks);
			});
	const l = o.find((a) => a.type.name === t.name);
	return l ? { ...l.attrs } : {};
}
function wd(n, e) {
	const t = new ho(n);
	return (
		e.forEach((r) => {
			r.steps.forEach((i) => {
				t.step(i);
			});
		}),
		t
	);
}
function cg(n) {
	for (let e = 0; e < n.edgeCount; e += 1) {
		const { type: t } = n.edge(e);
		if (t.isTextblock && !t.hasRequiredAttrs()) return t;
	}
	return null;
}
function dg(n, e, t) {
	const r = [];
	return (
		n.nodesBetween(e.from, e.to, (i, s) => {
			t(i) && r.push({ node: i, pos: s });
		}),
		r
	);
}
function Sd(n, e) {
	for (let t = n.depth; t > 0; t -= 1) {
		const r = n.node(t);
		if (e(r)) return { pos: t > 0 ? n.before(t) : 0, start: n.start(t), depth: t, node: r };
	}
}
function Vi(n) {
	return (e) => Sd(e.$from, n);
}
function E(n, e, t) {
	return n.config[e] === void 0 && n.parent
		? E(n.parent, e, t)
		: typeof n.config[e] == 'function'
			? n.config[e].bind({ ...t, parent: n.parent ? E(n.parent, e, t) : null })
			: n.config[e];
}
function Do(n) {
	return n
		.map((e) => {
			const t = { name: e.name, options: e.options, storage: e.storage },
				r = E(e, 'addExtensions', t);
			return r ? [e, ...Do(r())] : e;
		})
		.flat(10);
}
function Lo(n, e) {
	const t = tn.fromSchema(e).serializeFragment(n),
		i = document.implementation.createHTMLDocument().createElement('div');
	return (i.appendChild(t), i.innerHTML);
}
function vd(n) {
	return typeof n == 'function';
}
function z(n, e = void 0, ...t) {
	return vd(n) ? (e ? n.bind(e)(...t) : n(...t)) : n;
}
function ug(n = {}) {
	return Object.keys(n).length === 0 && n.constructor === Object;
}
function An(n) {
	const e = n.filter((i) => i.type === 'extension'),
		t = n.filter((i) => i.type === 'node'),
		r = n.filter((i) => i.type === 'mark');
	return { baseExtensions: e, nodeExtensions: t, markExtensions: r };
}
function Cd(n) {
	const e = [],
		{ nodeExtensions: t, markExtensions: r } = An(n),
		i = [...t, ...r],
		s = { default: null, validate: void 0, rendered: !0, renderHTML: null, parseHTML: null, keepOnSplit: !0, isRequired: !1 };
	return (
		n.forEach((o) => {
			const l = { name: o.name, options: o.options, storage: o.storage, extensions: i },
				a = E(o, 'addGlobalAttributes', l);
			if (!a) return;
			a().forEach((d) => {
				d.types.forEach((u) => {
					Object.entries(d.attributes).forEach(([f, h]) => {
						e.push({ type: u, name: f, attribute: { ...s, ...h } });
					});
				});
			});
		}),
		i.forEach((o) => {
			const l = { name: o.name, options: o.options, storage: o.storage },
				a = E(o, 'addAttributes', l);
			if (!a) return;
			const c = a();
			Object.entries(c).forEach(([d, u]) => {
				const f = { ...s, ...u };
				(typeof f?.default == 'function' && (f.default = f.default()),
					f?.isRequired && f?.default === void 0 && delete f.default,
					e.push({ type: o.name, name: d, attribute: f }));
			});
		}),
		e
	);
}
function _(...n) {
	return n
		.filter((e) => !!e)
		.reduce((e, t) => {
			const r = { ...e };
			return (
				Object.entries(t).forEach(([i, s]) => {
					if (!r[i]) {
						r[i] = s;
						return;
					}
					if (i === 'class') {
						const l = s ? String(s).split(' ') : [],
							a = r[i] ? r[i].split(' ') : [],
							c = l.filter((d) => !a.includes(d));
						r[i] = [...a, ...c].join(' ');
					} else if (i === 'style') {
						const l = s
								? s
										.split(';')
										.map((d) => d.trim())
										.filter(Boolean)
								: [],
							a = r[i]
								? r[i]
										.split(';')
										.map((d) => d.trim())
										.filter(Boolean)
								: [],
							c = new Map();
						(a.forEach((d) => {
							const [u, f] = d.split(':').map((h) => h.trim());
							c.set(u, f);
						}),
							l.forEach((d) => {
								const [u, f] = d.split(':').map((h) => h.trim());
								c.set(u, f);
							}),
							(r[i] = Array.from(c.entries())
								.map(([d, u]) => `${d}: ${u}`)
								.join('; ')));
					} else r[i] = s;
				}),
				r
			);
		}, {});
}
function cr(n, e) {
	return e
		.filter((t) => t.type === n.type.name)
		.filter((t) => t.attribute.rendered)
		.map((t) => (t.attribute.renderHTML ? t.attribute.renderHTML(n.attrs) || {} : { [t.name]: n.attrs[t.name] }))
		.reduce((t, r) => _(t, r), {});
}
function fg(n) {
	return typeof n != 'string' ? n : n.match(/^[+-]?(?:\d*\.)?\d+$/) ? Number(n) : n === 'true' ? !0 : n === 'false' ? !1 : n;
}
function ia(n, e) {
	return 'style' in n
		? n
		: {
				...n,
				getAttrs: (t) => {
					const r = n.getAttrs ? n.getAttrs(t) : n.attrs;
					if (r === !1) return !1;
					const i = e.reduce((s, o) => {
						const l = o.attribute.parseHTML ? o.attribute.parseHTML(t) : fg(t.getAttribute(o.name));
						return l == null ? s : { ...s, [o.name]: l };
					}, {});
					return { ...r, ...i };
				}
			};
}
function sa(n) {
	return Object.fromEntries(Object.entries(n).filter(([e, t]) => (e === 'attrs' && ug(t) ? !1 : t != null)));
}
function oa(n) {
	var e, t;
	const r = {};
	return (
		!((e = n?.attribute) != null && e.isRequired) && 'default' in (n?.attribute || {}) && (r.default = n.attribute.default),
		((t = n?.attribute) == null ? void 0 : t.validate) !== void 0 && (r.validate = n.attribute.validate),
		[n.name, r]
	);
}
function hg(n, e) {
	var t;
	const r = Cd(n),
		{ nodeExtensions: i, markExtensions: s } = An(n),
		o = (t = i.find((c) => E(c, 'topNode'))) == null ? void 0 : t.name,
		l = Object.fromEntries(
			i.map((c) => {
				const d = r.filter((y) => y.type === c.name),
					u = { name: c.name, options: c.options, storage: c.storage, editor: e },
					f = n.reduce((y, x) => {
						const M = E(x, 'extendNodeSchema', u);
						return { ...y, ...(M ? M(c) : {}) };
					}, {}),
					h = sa({
						...f,
						content: z(E(c, 'content', u)),
						marks: z(E(c, 'marks', u)),
						group: z(E(c, 'group', u)),
						inline: z(E(c, 'inline', u)),
						atom: z(E(c, 'atom', u)),
						selectable: z(E(c, 'selectable', u)),
						draggable: z(E(c, 'draggable', u)),
						code: z(E(c, 'code', u)),
						whitespace: z(E(c, 'whitespace', u)),
						linebreakReplacement: z(E(c, 'linebreakReplacement', u)),
						defining: z(E(c, 'defining', u)),
						isolating: z(E(c, 'isolating', u)),
						attrs: Object.fromEntries(d.map(oa))
					}),
					p = z(E(c, 'parseHTML', u));
				p && (h.parseDOM = p.map((y) => ia(y, d)));
				const m = E(c, 'renderHTML', u);
				m && (h.toDOM = (y) => m({ node: y, HTMLAttributes: cr(y, d) }));
				const g = E(c, 'renderText', u);
				return (g && (h.toText = g), [c.name, h]);
			})
		),
		a = Object.fromEntries(
			s.map((c) => {
				const d = r.filter((g) => g.type === c.name),
					u = { name: c.name, options: c.options, storage: c.storage, editor: e },
					f = n.reduce((g, y) => {
						const x = E(y, 'extendMarkSchema', u);
						return { ...g, ...(x ? x(c) : {}) };
					}, {}),
					h = sa({
						...f,
						inclusive: z(E(c, 'inclusive', u)),
						excludes: z(E(c, 'excludes', u)),
						group: z(E(c, 'group', u)),
						spanning: z(E(c, 'spanning', u)),
						code: z(E(c, 'code', u)),
						attrs: Object.fromEntries(d.map(oa))
					}),
					p = z(E(c, 'parseHTML', u));
				p && (h.parseDOM = p.map((g) => ia(g, d)));
				const m = E(c, 'renderHTML', u);
				return (m && (h.toDOM = (g) => m({ mark: g, HTMLAttributes: cr(g, d) })), [c.name, h]);
			})
		);
	return new rc({ topNode: o, nodes: l, marks: a });
}
function pg(n) {
	const e = n.filter((t, r) => n.indexOf(t) !== r);
	return Array.from(new Set(e));
}
function ni(n) {
	return n.sort((t, r) => {
		const i = E(t, 'priority') || 100,
			s = E(r, 'priority') || 100;
		return i > s ? -1 : i < s ? 1 : 0;
	});
}
function Md(n) {
	const e = ni(Do(n)),
		t = pg(e.map((r) => r.name));
	return (
		t.length && console.warn(`[tiptap warn]: Duplicate extension names found: [${t.map((r) => `'${r}'`).join(', ')}]. This can lead to issues.`),
		e
	);
}
function Td(n, e, t) {
	const { from: r, to: i } = e,
		{
			blockSeparator: s = `

`,
			textSerializers: o = {}
		} = t || {};
	let l = '';
	return (
		n.nodesBetween(r, i, (a, c, d, u) => {
			var f;
			a.isBlock && c > r && (l += s);
			const h = o?.[a.type.name];
			if (h) return (d && (l += h({ node: a, pos: c, parent: d, index: u, range: e })), !1);
			a.isText && (l += (f = a?.text) == null ? void 0 : f.slice(Math.max(r, c) - c, i - c));
		}),
		l
	);
}
function mg(n, e) {
	const t = { from: 0, to: n.content.size };
	return Td(n, t, e);
}
function Ad(n) {
	return Object.fromEntries(
		Object.entries(n.nodes)
			.filter(([, e]) => e.spec.toText)
			.map(([e, t]) => [e, t.spec.toText])
	);
}
function gg(n, e) {
	const t = X(e, n.schema),
		{ from: r, to: i } = n.selection,
		s = [];
	n.doc.nodesBetween(r, i, (l) => {
		s.push(l);
	});
	const o = s.reverse().find((l) => l.type.name === t.name);
	return o ? { ...o.attrs } : {};
}
function Ed(n, e) {
	const t = _i(typeof e == 'string' ? e : e.name, n.schema);
	return t === 'node' ? gg(n, e) : t === 'mark' ? xd(n, e) : {};
}
function yg(n, e = JSON.stringify) {
	const t = {};
	return n.filter((r) => {
		const i = e(r);
		return Object.prototype.hasOwnProperty.call(t, i) ? !1 : (t[i] = !0);
	});
}
function bg(n) {
	const e = yg(n);
	return e.length === 1
		? e
		: e.filter(
				(t, r) =>
					!e
						.filter((s, o) => o !== r)
						.some(
							(s) =>
								t.oldRange.from >= s.oldRange.from &&
								t.oldRange.to <= s.oldRange.to &&
								t.newRange.from >= s.newRange.from &&
								t.newRange.to <= s.newRange.to
						)
			);
}
function Nd(n) {
	const { mapping: e, steps: t } = n,
		r = [];
	return (
		e.maps.forEach((i, s) => {
			const o = [];
			if (i.ranges.length)
				i.forEach((l, a) => {
					o.push({ from: l, to: a });
				});
			else {
				const { from: l, to: a } = t[s];
				if (l === void 0 || a === void 0) return;
				o.push({ from: l, to: a });
			}
			o.forEach(({ from: l, to: a }) => {
				const c = e.slice(s).map(l, -1),
					d = e.slice(s).map(a),
					u = e.invert().map(c, -1),
					f = e.invert().map(d);
				r.push({ oldRange: { from: u, to: f }, newRange: { from: c, to: d } });
			});
		}),
		bg(r)
	);
}
function Po(n, e, t) {
	const r = [];
	return (
		n === e
			? t
					.resolve(n)
					.marks()
					.forEach((i) => {
						const s = t.resolve(n),
							o = Io(s, i.type);
						o && r.push({ mark: i, ...o });
					})
			: t.nodesBetween(n, e, (i, s) => {
					!i || i?.nodeSize === void 0 || r.push(...i.marks.map((o) => ({ from: s, to: s + i.nodeSize, mark: o })));
				}),
		r
	);
}
var kg = (n, e, t, r = 20) => {
	const i = n.doc.resolve(t);
	let s = r,
		o = null;
	for (; s > 0 && o === null; ) {
		const l = i.node(s);
		l?.type.name === e ? (o = l) : (s -= 1);
	}
	return [o, s];
};
function Cr(n, e) {
	return e.nodes[n] || e.marks[n] || null;
}
function Hr(n, e, t) {
	return Object.fromEntries(
		Object.entries(t).filter(([r]) => {
			const i = n.find((s) => s.type === e && s.name === r);
			return i ? i.attribute.keepOnSplit : !1;
		})
	);
}
var xg = (n, e = 500) => {
	let t = '';
	const r = n.parentOffset;
	return (
		n.parent.nodesBetween(Math.max(0, r - e), r, (i, s, o, l) => {
			var a, c;
			const d = ((c = (a = i.type.spec).toText) == null ? void 0 : c.call(a, { node: i, pos: s, parent: o, index: l })) || i.textContent || '%leaf%';
			t += i.isAtom && !i.isText ? d : d.slice(0, Math.max(0, r - s));
		}),
		t
	);
};
function js(n, e, t = {}) {
	const { empty: r, ranges: i } = n.selection,
		s = e ? dt(e, n.schema) : null;
	if (r)
		return !!(n.storedMarks || n.selection.$from.marks())
			.filter((u) => (s ? s.name === u.type.name : !0))
			.find((u) => ei(u.attrs, t, { strict: !1 }));
	let o = 0;
	const l = [];
	if (
		(i.forEach(({ $from: u, $to: f }) => {
			const h = u.pos,
				p = f.pos;
			n.doc.nodesBetween(h, p, (m, g) => {
				if (!m.isText && !m.marks.length) return;
				const y = Math.max(h, g),
					x = Math.min(p, g + m.nodeSize),
					M = x - y;
				((o += M), l.push(...m.marks.map((T) => ({ mark: T, from: y, to: x }))));
			});
		}),
		o === 0)
	)
		return !1;
	const a = l
			.filter((u) => (s ? s.name === u.mark.type.name : !0))
			.filter((u) => ei(u.mark.attrs, t, { strict: !1 }))
			.reduce((u, f) => u + f.to - f.from, 0),
		c = l.filter((u) => (s ? u.mark.type !== s && u.mark.type.excludes(s) : !0)).reduce((u, f) => u + f.to - f.from, 0);
	return (a > 0 ? a + c : a) >= o;
}
function wg(n, e, t = {}) {
	if (!e) return Nt(n, null, t) || js(n, null, t);
	const r = _i(e, n.schema);
	return r === 'node' ? Nt(n, e, t) : r === 'mark' ? js(n, e, t) : !1;
}
var Sg = (n, e) => {
		const { $from: t, $to: r, $anchor: i } = n.selection;
		if (e) {
			const s = Vi((l) => l.type.name === e)(n.selection);
			if (!s) return !1;
			const o = n.doc.resolve(s.pos + 1);
			return i.pos + 1 === o.end();
		}
		return !(r.parentOffset < r.parent.nodeSize - 2 || t.pos !== r.pos);
	},
	vg = (n) => {
		const { $from: e, $to: t } = n.selection;
		return !(e.parentOffset > 0 || e.pos !== t.pos);
	};
function la(n, e) {
	return Array.isArray(e) ? e.some((t) => (typeof t == 'string' ? t : t.name) === n.name) : e;
}
function aa(n, e) {
	const { nodeExtensions: t } = An(e),
		r = t.find((o) => o.name === n);
	if (!r) return !1;
	const i = { name: r.name, options: r.options, storage: r.storage },
		s = z(E(r, 'group', i));
	return typeof s != 'string' ? !1 : s.split(' ').includes('list');
}
function Wi(n, { checkChildren: e = !0, ignoreWhitespace: t = !1 } = {}) {
	var r;
	if (t) {
		if (n.type.name === 'hardBreak') return !0;
		if (n.isText) return /^\s*$/m.test((r = n.text) != null ? r : '');
	}
	if (n.isText) return !n.text;
	if (n.isAtom || n.isLeaf) return !1;
	if (n.content.childCount === 0) return !0;
	if (e) {
		let i = !0;
		return (
			n.content.forEach((s) => {
				i !== !1 && (Wi(s, { ignoreWhitespace: t, checkChildren: e }) || (i = !1));
			}),
			i
		);
	}
	return !1;
}
function Od(n) {
	return n instanceof N;
}
var Rd = class Id {
	constructor(e) {
		this.position = e;
	}
	static fromJSON(e) {
		return new Id(e.position);
	}
	toJSON() {
		return { position: this.position };
	}
};
function Cg(n, e) {
	const t = e.mapping.mapResult(n.position);
	return { position: new Rd(t.pos), mapResult: t };
}
function Mg(n) {
	return new Rd(n);
}
function Tg(n, e, t) {
	var r;
	const { selection: i } = e;
	let s = null;
	if ((gd(i) && (s = i.$cursor), s)) {
		const l = (r = n.storedMarks) != null ? r : s.marks();
		return s.parent.type.allowsMarkType(t) && (!!t.isInSet(l) || !l.some((c) => c.type.excludes(t)));
	}
	const { ranges: o } = i;
	return o.some(({ $from: l, $to: a }) => {
		let c = l.depth === 0 ? n.doc.inlineContent && n.doc.type.allowsMarkType(t) : !1;
		return (
			n.doc.nodesBetween(l.pos, a.pos, (d, u, f) => {
				if (c) return !1;
				if (d.isInline) {
					const h = !f || f.type.allowsMarkType(t),
						p = !!t.isInSet(d.marks) || !d.marks.some((m) => m.type.excludes(t));
					c = h && p;
				}
				return !c;
			}),
			c
		);
	});
}
var Ag =
		(n, e = {}) =>
		({ tr: t, state: r, dispatch: i }) => {
			const { selection: s } = t,
				{ empty: o, ranges: l } = s,
				a = dt(n, r.schema);
			if (i)
				if (o) {
					const c = xd(r, a);
					t.addStoredMark(a.create({ ...c, ...e }));
				} else
					l.forEach((c) => {
						const d = c.$from.pos,
							u = c.$to.pos;
						r.doc.nodesBetween(d, u, (f, h) => {
							const p = Math.max(h, d),
								m = Math.min(h + f.nodeSize, u);
							f.marks.find((y) => y.type === a)
								? f.marks.forEach((y) => {
										a === y.type && t.addMark(p, m, a.create({ ...y.attrs, ...e }));
									})
								: t.addMark(p, m, a.create(e));
						});
					});
			return Tg(r, t, a);
		},
	Eg =
		(n, e) =>
		({ tr: t }) => (t.setMeta(n, e), !0),
	Ng =
		(n, e = {}) =>
		({ state: t, dispatch: r, chain: i }) => {
			const s = X(n, t.schema);
			let o;
			return (
				t.selection.$anchor.sameParent(t.selection.$head) && (o = t.selection.$anchor.parent.attrs),
				s.isTextblock
					? i()
							.command(({ commands: l }) => (wl(s, { ...o, ...e })(t) ? !0 : l.clearNodes()))
							.command(({ state: l }) => wl(s, { ...o, ...e })(l, r))
							.run()
					: (console.warn('[tiptap warn]: Currently "setNode()" only supports text block nodes.'), !1)
			);
		},
	Og =
		(n) =>
		({ tr: e, dispatch: t }) => {
			if (t) {
				const { doc: r } = e,
					i = Vt(n, 0, r.content.size),
					s = N.create(r, i);
				e.setSelection(s);
			}
			return !0;
		},
	Rg =
		(n, e) =>
		({ tr: t, state: r, dispatch: i }) => {
			const { selection: s } = r;
			let o, l;
			return (
				typeof e == 'number' ? ((o = e), (l = e)) : e && 'from' in e && 'to' in e ? ((o = e.from), (l = e.to)) : ((o = s.from), (l = s.to)),
				i &&
					t.doc.nodesBetween(o, l, (a, c) => {
						a.isText || t.setNodeMarkup(c, void 0, { ...a.attrs, dir: n });
					}),
				!0
			);
		},
	Ig =
		(n) =>
		({ tr: e, dispatch: t }) => {
			if (t) {
				const { doc: r } = e,
					{ from: i, to: s } = typeof n == 'number' ? { from: n, to: n } : n,
					o = O.atStart(r).from,
					l = O.atEnd(r).to,
					a = Vt(i, o, l),
					c = Vt(s, o, l),
					d = O.create(r, a, c);
				e.setSelection(d);
			}
			return !0;
		},
	Dg =
		(n) =>
		({ state: e, dispatch: t }) => {
			const r = X(n, e.schema);
			return Nh(r)(e, t);
		};
function ca(n, e) {
	const t = n.storedMarks || (n.selection.$to.parentOffset && n.selection.$from.marks());
	if (t) {
		const r = t.filter((i) => e?.includes(i.type.name));
		n.tr.ensureMarks(r);
	}
}
var Lg =
		({ keepMarks: n = !0 } = {}) =>
		({ tr: e, state: t, dispatch: r, editor: i }) => {
			const { selection: s, doc: o } = e,
				{ $from: l, $to: a } = s,
				c = i.extensionManager.attributes,
				d = Hr(c, l.node().type.name, l.node().attrs);
			if (s instanceof N && s.node.isBlock)
				return !l.parentOffset || !at(o, l.pos) ? !1 : (r && (n && ca(t, i.extensionManager.splittableMarks), e.split(l.pos).scrollIntoView()), !0);
			if (!l.parent.isBlock) return !1;
			const u = a.parentOffset === a.parent.content.size,
				f = l.depth === 0 ? void 0 : cg(l.node(-1).contentMatchAt(l.indexAfter(-1)));
			let h = u && f ? [{ type: f, attrs: d }] : void 0,
				p = at(e.doc, e.mapping.map(l.pos), 1, h);
			if ((!h && !p && at(e.doc, e.mapping.map(l.pos), 1, f ? [{ type: f }] : void 0) && ((p = !0), (h = f ? [{ type: f, attrs: d }] : void 0)), r)) {
				if (p && (s instanceof O && e.deleteSelection(), e.split(e.mapping.map(l.pos), 1, h), f && !u && !l.parentOffset && l.parent.type !== f)) {
					const m = e.mapping.map(l.before()),
						g = e.doc.resolve(m);
					l.node(-1).canReplaceWith(g.index(), g.index() + 1, f) && e.setNodeMarkup(e.mapping.map(l.before()), f);
				}
				(n && ca(t, i.extensionManager.splittableMarks), e.scrollIntoView());
			}
			return p;
		},
	Pg =
		(n, e = {}) =>
		({ tr: t, state: r, dispatch: i, editor: s }) => {
			var o;
			const l = X(n, r.schema),
				{ $from: a, $to: c } = r.selection,
				d = r.selection.node;
			if ((d && d.isBlock) || a.depth < 2 || !a.sameParent(c)) return !1;
			const u = a.node(-1);
			if (u.type !== l) return !1;
			const f = s.extensionManager.attributes;
			if (a.parent.content.size === 0 && a.node(-1).childCount === a.indexAfter(-1)) {
				if (a.depth === 2 || a.node(-3).type !== l || a.index(-2) !== a.node(-2).childCount - 1) return !1;
				if (i) {
					let y = k.empty;
					const x = a.index(-1) ? 1 : a.index(-2) ? 2 : 3;
					for (let D = a.depth - x; D >= a.depth - 3; D -= 1) y = k.from(a.node(D).copy(y));
					const M = a.indexAfter(-1) < a.node(-2).childCount ? 1 : a.indexAfter(-2) < a.node(-3).childCount ? 2 : 3,
						T = { ...Hr(f, a.node().type.name, a.node().attrs), ...e },
						S = ((o = l.contentMatch.defaultType) == null ? void 0 : o.createAndFill(T)) || void 0;
					y = y.append(k.from(l.createAndFill(null, S) || void 0));
					const A = a.before(a.depth - (x - 1));
					t.replace(A, a.after(-M), new C(y, 4 - x, 0));
					let v = -1;
					(t.doc.nodesBetween(A, t.doc.content.size, (D, P) => {
						if (v > -1) return !1;
						D.isTextblock && D.content.size === 0 && (v = P + 1);
					}),
						v > -1 && t.setSelection(O.near(t.doc.resolve(v))),
						t.scrollIntoView());
				}
				return !0;
			}
			const h = c.pos === a.end() ? u.contentMatchAt(0).defaultType : null,
				p = { ...Hr(f, u.type.name, u.attrs), ...e },
				m = { ...Hr(f, a.node().type.name, a.node().attrs), ...e };
			t.delete(a.pos, c.pos);
			const g = h
				? [
						{ type: l, attrs: p },
						{ type: h, attrs: m }
					]
				: [{ type: l, attrs: p }];
			if (!at(t.doc, a.pos, 2)) return !1;
			if (i) {
				const { selection: y, storedMarks: x } = r,
					{ splittableMarks: M } = s.extensionManager,
					T = x || (y.$to.parentOffset && y.$from.marks());
				if ((t.split(a.pos, 2, g).scrollIntoView(), !T || !i)) return !0;
				const S = T.filter((A) => M.includes(A.type.name));
				t.ensureMarks(S);
			}
			return !0;
		},
	gs = (n, e) => {
		const t = Vi((o) => o.type === e)(n.selection);
		if (!t) return !0;
		const r = n.doc.resolve(Math.max(0, t.pos - 1)).before(t.depth);
		if (r === void 0) return !0;
		const i = n.doc.nodeAt(r);
		return (t.node.type === i?.type && Ot(n.doc, t.pos) && n.join(t.pos), !0);
	},
	ys = (n, e) => {
		const t = Vi((o) => o.type === e)(n.selection);
		if (!t) return !0;
		const r = n.doc.resolve(t.start).after(t.depth);
		if (r === void 0) return !0;
		const i = n.doc.nodeAt(r);
		return (t.node.type === i?.type && Ot(n.doc, r) && n.join(r), !0);
	},
	zg =
		(n, e, t, r = {}) =>
		({ editor: i, tr: s, state: o, dispatch: l, chain: a, commands: c, can: d }) => {
			const { extensions: u, splittableMarks: f } = i.extensionManager,
				h = X(n, o.schema),
				p = X(e, o.schema),
				{ selection: m, storedMarks: g } = o,
				{ $from: y, $to: x } = m,
				M = y.blockRange(x),
				T = g || (m.$to.parentOffset && m.$from.marks());
			if (!M) return !1;
			const S = Vi((A) => aa(A.type.name, u))(m);
			if (M.depth >= 1 && S && M.depth - S.depth <= 1) {
				if (S.node.type === h) return c.liftListItem(p);
				if (aa(S.node.type.name, u) && h.validContent(S.node.content) && l)
					return a()
						.command(() => (s.setNodeMarkup(S.pos, h), !0))
						.command(() => gs(s, h))
						.command(() => ys(s, h))
						.run();
			}
			return !t || !T || !l
				? a()
						.command(() => (d().wrapInList(h, r) ? !0 : c.clearNodes()))
						.wrapInList(h, r)
						.command(() => gs(s, h))
						.command(() => ys(s, h))
						.run()
				: a()
						.command(() => {
							const A = d().wrapInList(h, r),
								v = T.filter((D) => f.includes(D.type.name));
							return (s.ensureMarks(v), A ? !0 : c.clearNodes());
						})
						.wrapInList(h, r)
						.command(() => gs(s, h))
						.command(() => ys(s, h))
						.run();
		},
	Bg =
		(n, e = {}, t = {}) =>
		({ state: r, commands: i }) => {
			const { extendEmptyMarkRange: s = !1 } = t,
				o = dt(n, r.schema);
			return js(r, o, e) ? i.unsetMark(o, { extendEmptyMarkRange: s }) : i.setMark(o, e);
		},
	Hg =
		(n, e, t = {}) =>
		({ state: r, commands: i }) => {
			const s = X(n, r.schema),
				o = X(e, r.schema),
				l = Nt(r, s, t);
			let a;
			return (
				r.selection.$anchor.sameParent(r.selection.$head) && (a = r.selection.$anchor.parent.attrs),
				l ? i.setNode(o, a) : i.setNode(s, { ...a, ...t })
			);
		},
	$g =
		(n, e = {}) =>
		({ state: t, commands: r }) => {
			const i = X(n, t.schema);
			return Nt(t, i, e) ? r.lift(i) : r.wrapIn(i, e);
		},
	Fg =
		() =>
		({ state: n, dispatch: e }) => {
			const t = n.plugins;
			for (let r = 0; r < t.length; r += 1) {
				const i = t[r];
				let s;
				if (i.spec.isInputRules && (s = i.getState(n))) {
					if (e) {
						const o = n.tr,
							l = s.transform;
						for (let a = l.steps.length - 1; a >= 0; a -= 1) o.step(l.steps[a].invert(l.docs[a]));
						if (s.text) {
							const a = o.doc.resolve(s.from).marks();
							o.replaceWith(s.from, s.to, n.schema.text(s.text, a));
						} else o.delete(s.from, s.to);
					}
					return !0;
				}
			}
			return !1;
		},
	_g =
		() =>
		({ tr: n, dispatch: e }) => {
			const { selection: t } = n,
				{ empty: r, ranges: i } = t;
			return (
				r ||
					(e &&
						i.forEach((s) => {
							n.removeMark(s.$from.pos, s.$to.pos);
						})),
				!0
			);
		},
	Vg =
		(n, e = {}) =>
		({ tr: t, state: r, dispatch: i }) => {
			var s;
			const { extendEmptyMarkRange: o = !1 } = e,
				{ selection: l } = t,
				a = dt(n, r.schema),
				{ $from: c, empty: d, ranges: u } = l;
			if (!i) return !0;
			if (d && o) {
				let { from: f, to: h } = l;
				const p = (s = c.marks().find((g) => g.type === a)) == null ? void 0 : s.attrs,
					m = Io(c, a, p);
				(m && ((f = m.from), (h = m.to)), t.removeMark(f, h, a));
			} else
				u.forEach((f) => {
					t.removeMark(f.$from.pos, f.$to.pos, a);
				});
			return (t.removeStoredMark(a), !0);
		},
	Wg =
		(n) =>
		({ tr: e, state: t, dispatch: r }) => {
			const { selection: i } = t;
			let s, o;
			return (
				typeof n == 'number' ? ((s = n), (o = n)) : n && 'from' in n && 'to' in n ? ((s = n.from), (o = n.to)) : ((s = i.from), (o = i.to)),
				r &&
					e.doc.nodesBetween(s, o, (l, a) => {
						if (l.isText) return;
						const c = { ...l.attrs };
						(delete c.dir, e.setNodeMarkup(a, void 0, c));
					}),
				!0
			);
		},
	jg =
		(n, e = {}) =>
		({ tr: t, state: r, dispatch: i }) => {
			let s = null,
				o = null;
			const l = _i(typeof n == 'string' ? n : n.name, r.schema);
			if (!l) return !1;
			(l === 'node' && (s = X(n, r.schema)), l === 'mark' && (o = dt(n, r.schema)));
			let a = !1;
			return (
				t.selection.ranges.forEach((c) => {
					const d = c.$from.pos,
						u = c.$to.pos;
					let f, h, p, m;
					(t.selection.empty
						? r.doc.nodesBetween(d, u, (g, y) => {
								s && s === g.type && ((a = !0), (p = Math.max(y, d)), (m = Math.min(y + g.nodeSize, u)), (f = y), (h = g));
							})
						: r.doc.nodesBetween(d, u, (g, y) => {
								(y < d && s && s === g.type && ((a = !0), (p = Math.max(y, d)), (m = Math.min(y + g.nodeSize, u)), (f = y), (h = g)),
									y >= d &&
										y <= u &&
										(s && s === g.type && ((a = !0), i && t.setNodeMarkup(y, void 0, { ...g.attrs, ...e })),
										o &&
											g.marks.length &&
											g.marks.forEach((x) => {
												if (o === x.type && ((a = !0), i)) {
													const M = Math.max(y, d),
														T = Math.min(y + g.nodeSize, u);
													t.addMark(M, T, o.create({ ...x.attrs, ...e }));
												}
											})));
							}),
						h &&
							(f !== void 0 && i && t.setNodeMarkup(f, void 0, { ...h.attrs, ...e }),
							o &&
								h.marks.length &&
								h.marks.forEach((g) => {
									o === g.type && i && t.addMark(p, m, o.create({ ...g.attrs, ...e }));
								})));
				}),
				a
			);
		},
	Kg =
		(n, e = {}) =>
		({ state: t, dispatch: r }) => {
			const i = X(n, t.schema);
			return Sh(i, e)(t, r);
		},
	Ug =
		(n, e = {}) =>
		({ state: t, dispatch: r }) => {
			const i = X(n, t.schema);
			return vh(i, e)(t, r);
		},
	qg = class {
		constructor() {
			this.callbacks = {};
		}
		on(n, e) {
			return (this.callbacks[n] || (this.callbacks[n] = []), this.callbacks[n].push(e), this);
		}
		emit(n, ...e) {
			const t = this.callbacks[n];
			return (t && t.forEach((r) => r.apply(this, e)), this);
		}
		off(n, e) {
			const t = this.callbacks[n];
			return (t && (e ? (this.callbacks[n] = t.filter((r) => r !== e)) : delete this.callbacks[n]), this);
		}
		once(n, e) {
			const t = (...r) => {
				(this.off(n, t), e.apply(this, r));
			};
			return this.on(n, t);
		}
		removeAllListeners() {
			this.callbacks = {};
		}
	},
	ji = class {
		constructor(n) {
			var e;
			((this.find = n.find), (this.handler = n.handler), (this.undoable = (e = n.undoable) != null ? e : !0));
		}
	},
	Jg = (n, e) => {
		if (Ro(e)) return e.exec(n);
		const t = e(n);
		if (!t) return null;
		const r = [t.text];
		return (
			(r.index = t.index),
			(r.input = n),
			(r.data = t.data),
			t.replaceWith &&
				(t.text.includes(t.replaceWith) || console.warn('[tiptap warn]: "inputRuleMatch.replaceWith" must be part of "inputRuleMatch.text".'),
				r.push(t.replaceWith)),
			r
		);
	};
function Mr(n) {
	var e;
	const { editor: t, from: r, to: i, text: s, rules: o, plugin: l } = n,
		{ view: a } = t;
	if (a.composing) return !1;
	const c = a.state.doc.resolve(r);
	if (c.parent.type.spec.code || ((e = c.nodeBefore || c.nodeAfter) != null && e.marks.find((f) => f.type.spec.code))) return !1;
	let d = !1;
	const u = xg(c) + s;
	return (
		o.forEach((f) => {
			if (d) return;
			const h = Jg(u, f.find);
			if (!h) return;
			const p = a.state.tr,
				m = $i({ state: a.state, transaction: p }),
				g = { from: r - (h[0].length - s.length), to: i },
				{ commands: y, chain: x, can: M } = new Fi({ editor: t, state: m });
			f.handler({ state: m, range: g, match: h, commands: y, chain: x, can: M }) === null ||
				!p.steps.length ||
				(f.undoable && p.setMeta(l, { transform: p, from: r, to: i, text: s }), a.dispatch(p), (d = !0));
		}),
		d
	);
}
function Gg(n) {
	const { editor: e, rules: t } = n,
		r = new K({
			state: {
				init() {
					return null;
				},
				apply(i, s, o) {
					const l = i.getMeta(r);
					if (l) return l;
					const a = i.getMeta('applyInputRules');
					return (
						a &&
							setTimeout(() => {
								let { text: d } = a;
								typeof d == 'string' ? (d = d) : (d = Lo(k.from(d), o.schema));
								const { from: u } = a,
									f = u + d.length;
								Mr({ editor: e, from: u, to: f, text: d, rules: t, plugin: r });
							}),
						i.selectionSet || i.docChanged ? null : s
					);
				}
			},
			props: {
				handleTextInput(i, s, o, l) {
					return Mr({ editor: e, from: s, to: o, text: l, rules: t, plugin: r });
				},
				handleDOMEvents: {
					compositionend: (i) => (
						setTimeout(() => {
							const { $cursor: s } = i.state.selection;
							s && Mr({ editor: e, from: s.pos, to: s.pos, text: '', rules: t, plugin: r });
						}),
						!1
					)
				},
				handleKeyDown(i, s) {
					if (s.key !== 'Enter') return !1;
					const { $cursor: o } = i.state.selection;
					return o
						? Mr({
								editor: e,
								from: o.pos,
								to: o.pos,
								text: `
`,
								rules: t,
								plugin: r
							})
						: !1;
				}
			},
			isInputRules: !0
		});
	return r;
}
function Yg(n) {
	return Object.prototype.toString.call(n).slice(8, -1);
}
function Tr(n) {
	return Yg(n) !== 'Object' ? !1 : n.constructor === Object && Object.getPrototypeOf(n) === Object.prototype;
}
function Dd(n, e) {
	const t = { ...n };
	return (
		Tr(n) &&
			Tr(e) &&
			Object.keys(e).forEach((r) => {
				Tr(e[r]) && Tr(n[r]) ? (t[r] = Dd(n[r], e[r])) : (t[r] = e[r]);
			}),
		t
	);
}
var zo = class {
		constructor(n = {}) {
			((this.type = 'extendable'),
				(this.parent = null),
				(this.child = null),
				(this.name = ''),
				(this.config = { name: this.name }),
				(this.config = { ...this.config, ...n }),
				(this.name = this.config.name));
		}
		get options() {
			return { ...(z(E(this, 'addOptions', { name: this.name })) || {}) };
		}
		get storage() {
			return { ...(z(E(this, 'addStorage', { name: this.name, options: this.options })) || {}) };
		}
		configure(n = {}) {
			const e = this.extend({ ...this.config, addOptions: () => Dd(this.options, n) });
			return ((e.name = this.name), (e.parent = this.parent), e);
		}
		extend(n = {}) {
			const e = new this.constructor({ ...this.config, ...n });
			return ((e.parent = this), (this.child = e), (e.name = 'name' in n ? n.name : e.parent.name), e);
		}
	},
	It = class Ld extends zo {
		constructor() {
			(super(...arguments), (this.type = 'mark'));
		}
		static create(e = {}) {
			const t = typeof e == 'function' ? e() : e;
			return new Ld(t);
		}
		static handleExit({ editor: e, mark: t }) {
			const { tr: r } = e.state,
				i = e.state.selection.$from;
			if (i.pos === i.end()) {
				const o = i.marks();
				if (!!!o.find((c) => c?.type.name === t.name)) return !1;
				const a = o.find((c) => c?.type.name === t.name);
				return (a && r.removeStoredMark(a), r.insertText(' ', i.pos), e.view.dispatch(r), !0);
			}
			return !1;
		}
		configure(e) {
			return super.configure(e);
		}
		extend(e) {
			const t = typeof e == 'function' ? e() : e;
			return super.extend(t);
		}
	};
function Xg(n) {
	return typeof n == 'number';
}
var Pd = class {
		constructor(n) {
			((this.find = n.find), (this.handler = n.handler));
		}
	},
	Qg = (n, e, t) => {
		if (Ro(e)) return [...n.matchAll(e)];
		const r = e(n, t);
		return r
			? r.map((i) => {
					const s = [i.text];
					return (
						(s.index = i.index),
						(s.input = n),
						(s.data = i.data),
						i.replaceWith &&
							(i.text.includes(i.replaceWith) || console.warn('[tiptap warn]: "pasteRuleMatch.replaceWith" must be part of "pasteRuleMatch.text".'),
							s.push(i.replaceWith)),
						s
					);
				})
			: [];
	};
function Zg(n) {
	const { editor: e, state: t, from: r, to: i, rule: s, pasteEvent: o, dropEvent: l } = n,
		{ commands: a, chain: c, can: d } = new Fi({ editor: e, state: t }),
		u = [];
	return (
		t.doc.nodesBetween(r, i, (h, p) => {
			var m, g, y, x, M;
			if (((g = (m = h.type) == null ? void 0 : m.spec) != null && g.code) || !(h.isText || h.isTextblock || h.isInline)) return;
			const T = (M = (x = (y = h.content) == null ? void 0 : y.size) != null ? x : h.nodeSize) != null ? M : 0,
				S = Math.max(r, p),
				A = Math.min(i, p + T);
			if (S >= A) return;
			const v = h.isText ? h.text || '' : h.textBetween(S - p, A - p, void 0, '￼');
			Qg(v, s.find, o).forEach((P) => {
				if (P.index === void 0) return;
				const de = S + P.index + 1,
					ut = de + P[0].length,
					Pe = { from: t.tr.mapping.map(de), to: t.tr.mapping.map(ut) },
					ft = s.handler({ state: t, range: Pe, match: P, commands: a, chain: c, can: d, pasteEvent: o, dropEvent: l });
				u.push(ft);
			});
		}),
		u.every((h) => h !== null)
	);
}
var Ar = null,
	ey = (n) => {
		var e;
		const t = new ClipboardEvent('paste', { clipboardData: new DataTransfer() });
		return ((e = t.clipboardData) == null || e.setData('text/html', n), t);
	};
function ty(n) {
	const { editor: e, rules: t } = n;
	let r = null,
		i = !1,
		s = !1,
		o = typeof ClipboardEvent < 'u' ? new ClipboardEvent('paste') : null,
		l;
	try {
		l = typeof DragEvent < 'u' ? new DragEvent('drop') : null;
	} catch {
		l = null;
	}
	const a = ({ state: d, from: u, to: f, rule: h, pasteEvt: p }) => {
		const m = d.tr,
			g = $i({ state: d, transaction: m });
		if (!(!Zg({ editor: e, state: g, from: Math.max(u - 1, 0), to: f.b - 1, rule: h, pasteEvent: p, dropEvent: l }) || !m.steps.length)) {
			try {
				l = typeof DragEvent < 'u' ? new DragEvent('drop') : null;
			} catch {
				l = null;
			}
			return ((o = typeof ClipboardEvent < 'u' ? new ClipboardEvent('paste') : null), m);
		}
	};
	return t.map(
		(d) =>
			new K({
				view(u) {
					const f = (p) => {
							var m;
							((r = (m = u.dom.parentElement) != null && m.contains(p.target) ? u.dom.parentElement : null), r && (Ar = e));
						},
						h = () => {
							Ar && (Ar = null);
						};
					return (
						window.addEventListener('dragstart', f),
						window.addEventListener('dragend', h),
						{
							destroy() {
								(window.removeEventListener('dragstart', f), window.removeEventListener('dragend', h));
							}
						}
					);
				},
				props: {
					handleDOMEvents: {
						drop: (u, f) => {
							if (((s = r === u.dom.parentElement), (l = f), !s)) {
								const h = Ar;
								h?.isEditable &&
									setTimeout(() => {
										const p = h.state.selection;
										p && h.commands.deleteRange({ from: p.from, to: p.to });
									}, 10);
							}
							return !1;
						},
						paste: (u, f) => {
							var h;
							const p = (h = f.clipboardData) == null ? void 0 : h.getData('text/html');
							return ((o = f), (i = !!p?.includes('data-pm-slice')), !1);
						}
					}
				},
				appendTransaction: (u, f, h) => {
					const p = u[0],
						m = p.getMeta('uiEvent') === 'paste' && !i,
						g = p.getMeta('uiEvent') === 'drop' && !s,
						y = p.getMeta('applyPasteRules'),
						x = !!y;
					if (!m && !g && !x) return;
					if (x) {
						let { text: S } = y;
						typeof S == 'string' ? (S = S) : (S = Lo(k.from(S), h.schema));
						const { from: A } = y,
							v = A + S.length,
							D = ey(S);
						return a({ rule: d, state: h, from: A, to: { b: v }, pasteEvt: D });
					}
					const M = f.doc.content.findDiffStart(h.doc.content),
						T = f.doc.content.findDiffEnd(h.doc.content);
					if (!(!Xg(M) || !T || M === T.b)) return a({ rule: d, state: h, from: M, to: T, pasteEvt: o });
				}
			})
	);
}
var Ki = class {
	constructor(n, e) {
		((this.splittableMarks = []),
			(this.editor = e),
			(this.baseExtensions = n),
			(this.extensions = Md(n)),
			(this.schema = hg(this.extensions, e)),
			this.setupExtensions());
	}
	get commands() {
		return this.extensions.reduce((n, e) => {
			const t = {
					name: e.name,
					options: e.options,
					storage: this.editor.extensionStorage[e.name],
					editor: this.editor,
					type: Cr(e.name, this.schema)
				},
				r = E(e, 'addCommands', t);
			return r ? { ...n, ...r() } : n;
		}, {});
	}
	get plugins() {
		const { editor: n } = this;
		return ni([...this.extensions].reverse()).flatMap((r) => {
			const i = { name: r.name, options: r.options, storage: this.editor.extensionStorage[r.name], editor: n, type: Cr(r.name, this.schema) },
				s = [],
				o = E(r, 'addKeyboardShortcuts', i);
			let l = {};
			if ((r.type === 'mark' && E(r, 'exitable', i) && (l.ArrowRight = () => It.handleExit({ editor: n, mark: r })), o)) {
				const f = Object.fromEntries(Object.entries(o()).map(([h, p]) => [h, () => p({ editor: n })]));
				l = { ...l, ...f };
			}
			const a = ym(l);
			s.push(a);
			const c = E(r, 'addInputRules', i);
			if (la(r, n.options.enableInputRules) && c) {
				const f = c();
				if (f && f.length) {
					const h = Gg({ editor: n, rules: f }),
						p = Array.isArray(h) ? h : [h];
					s.push(...p);
				}
			}
			const d = E(r, 'addPasteRules', i);
			if (la(r, n.options.enablePasteRules) && d) {
				const f = d();
				if (f && f.length) {
					const h = ty({ editor: n, rules: f });
					s.push(...h);
				}
			}
			const u = E(r, 'addProseMirrorPlugins', i);
			if (u) {
				const f = u();
				s.push(...f);
			}
			return s;
		});
	}
	get attributes() {
		return Cd(this.extensions);
	}
	get nodeViews() {
		const { editor: n } = this,
			{ nodeExtensions: e } = An(this.extensions);
		return Object.fromEntries(
			e
				.filter((t) => !!E(t, 'addNodeView'))
				.map((t) => {
					const r = this.attributes.filter((a) => a.type === t.name),
						i = { name: t.name, options: t.options, storage: this.editor.extensionStorage[t.name], editor: n, type: X(t.name, this.schema) },
						s = E(t, 'addNodeView', i);
					if (!s) return [];
					const o = s();
					if (!o) return [];
					const l = (a, c, d, u, f) => {
						const h = cr(a, r);
						return o({ node: a, view: c, getPos: d, decorations: u, innerDecorations: f, editor: n, extension: t, HTMLAttributes: h });
					};
					return [t.name, l];
				})
		);
	}
	dispatchTransaction(n) {
		const { editor: e } = this;
		return ni([...this.extensions].reverse()).reduceRight((r, i) => {
			const s = { name: i.name, options: i.options, storage: this.editor.extensionStorage[i.name], editor: e, type: Cr(i.name, this.schema) },
				o = E(i, 'dispatchTransaction', s);
			return o
				? (l) => {
						o.call(s, { transaction: l, next: r });
					}
				: r;
		}, n);
	}
	get markViews() {
		const { editor: n } = this,
			{ markExtensions: e } = An(this.extensions);
		return Object.fromEntries(
			e
				.filter((t) => !!E(t, 'addMarkView'))
				.map((t) => {
					const r = this.attributes.filter((l) => l.type === t.name),
						i = { name: t.name, options: t.options, storage: this.editor.extensionStorage[t.name], editor: n, type: dt(t.name, this.schema) },
						s = E(t, 'addMarkView', i);
					if (!s) return [];
					const o = (l, a, c) => {
						const d = cr(l, r);
						return s()({
							mark: l,
							view: a,
							inline: c,
							editor: n,
							extension: t,
							HTMLAttributes: d,
							updateAttributes: (u) => {
								my(l, n, u);
							}
						});
					};
					return [t.name, o];
				})
		);
	}
	setupExtensions() {
		const n = this.extensions;
		((this.editor.extensionStorage = Object.fromEntries(n.map((e) => [e.name, e.storage]))),
			n.forEach((e) => {
				var t;
				const r = {
					name: e.name,
					options: e.options,
					storage: this.editor.extensionStorage[e.name],
					editor: this.editor,
					type: Cr(e.name, this.schema)
				};
				e.type === 'mark' && ((t = z(E(e, 'keepOnSplit', r))) == null || t) && this.splittableMarks.push(e.name);
				const i = E(e, 'onBeforeCreate', r),
					s = E(e, 'onCreate', r),
					o = E(e, 'onUpdate', r),
					l = E(e, 'onSelectionUpdate', r),
					a = E(e, 'onTransaction', r),
					c = E(e, 'onFocus', r),
					d = E(e, 'onBlur', r),
					u = E(e, 'onDestroy', r);
				(i && this.editor.on('beforeCreate', i),
					s && this.editor.on('create', s),
					o && this.editor.on('update', o),
					l && this.editor.on('selectionUpdate', l),
					a && this.editor.on('transaction', a),
					c && this.editor.on('focus', c),
					d && this.editor.on('blur', d),
					u && this.editor.on('destroy', u));
			}));
	}
};
Ki.resolve = Md;
Ki.sort = ni;
Ki.flatten = Do;
var ny = {};
Oo(ny, {
	ClipboardTextSerializer: () => Bd,
	Commands: () => Hd,
	Delete: () => $d,
	Drop: () => Fd,
	Editable: () => _d,
	FocusEvents: () => Wd,
	Keymap: () => jd,
	Paste: () => Kd,
	Tabindex: () => Ud,
	TextDirection: () => qd,
	focusEventsPluginKey: () => Vd
});
var B = class zd extends zo {
		constructor() {
			(super(...arguments), (this.type = 'extension'));
		}
		static create(e = {}) {
			const t = typeof e == 'function' ? e() : e;
			return new zd(t);
		}
		configure(e) {
			return super.configure(e);
		}
		extend(e) {
			const t = typeof e == 'function' ? e() : e;
			return super.extend(t);
		}
	},
	Bd = B.create({
		name: 'clipboardTextSerializer',
		addOptions() {
			return { blockSeparator: void 0 };
		},
		addProseMirrorPlugins() {
			return [
				new K({
					key: new G('clipboardTextSerializer'),
					props: {
						clipboardTextSerializer: () => {
							const { editor: n } = this,
								{ state: e, schema: t } = n,
								{ doc: r, selection: i } = e,
								{ ranges: s } = i,
								o = Math.min(...s.map((d) => d.$from.pos)),
								l = Math.max(...s.map((d) => d.$to.pos)),
								a = Ad(t);
							return Td(
								r,
								{ from: o, to: l },
								{ ...(this.options.blockSeparator !== void 0 ? { blockSeparator: this.options.blockSeparator } : {}), textSerializers: a }
							);
						}
					}
				})
			];
		}
	}),
	Hd = B.create({
		name: 'commands',
		addCommands() {
			return { ...pd };
		}
	}),
	$d = B.create({
		name: 'delete',
		onUpdate({ transaction: n, appendedTransactions: e }) {
			var t, r, i;
			const s = () => {
				var o, l, a, c;
				if (
					(c =
						(a = (l = (o = this.editor.options.coreExtensionOptions) == null ? void 0 : o.delete) == null ? void 0 : l.filterTransaction) == null
							? void 0
							: a.call(l, n)) != null
						? c
						: n.getMeta('y-sync$')
				)
					return;
				const d = wd(n.before, [n, ...e]);
				Nd(d).forEach((h) => {
					d.mapping.mapResult(h.oldRange.from).deletedAfter &&
						d.mapping.mapResult(h.oldRange.to).deletedBefore &&
						d.before.nodesBetween(h.oldRange.from, h.oldRange.to, (p, m) => {
							const g = m + p.nodeSize - 2,
								y = h.oldRange.from <= m && g <= h.oldRange.to;
							this.editor.emit('delete', {
								type: 'node',
								node: p,
								from: m,
								to: g,
								newFrom: d.mapping.map(m),
								newTo: d.mapping.map(g),
								deletedRange: h.oldRange,
								newRange: h.newRange,
								partial: !y,
								editor: this.editor,
								transaction: n,
								combinedTransform: d
							});
						});
				});
				const f = d.mapping;
				d.steps.forEach((h, p) => {
					var m, g;
					if (h instanceof _e) {
						const y = f.slice(p).map(h.from, -1),
							x = f.slice(p).map(h.to),
							M = f.invert().map(y, -1),
							T = f.invert().map(x),
							S = (m = d.doc.nodeAt(y - 1)) == null ? void 0 : m.marks.some((v) => v.eq(h.mark)),
							A = (g = d.doc.nodeAt(x)) == null ? void 0 : g.marks.some((v) => v.eq(h.mark));
						this.editor.emit('delete', {
							type: 'mark',
							mark: h.mark,
							from: h.from,
							to: h.to,
							deletedRange: { from: M, to: T },
							newRange: { from: y, to: x },
							partial: !!(A || S),
							editor: this.editor,
							transaction: n,
							combinedTransform: d
						});
					}
				});
			};
			(i = (r = (t = this.editor.options.coreExtensionOptions) == null ? void 0 : t.delete) == null ? void 0 : r.async) == null || i
				? setTimeout(s, 0)
				: s();
		}
	}),
	Fd = B.create({
		name: 'drop',
		addProseMirrorPlugins() {
			return [
				new K({
					key: new G('tiptapDrop'),
					props: {
						handleDrop: (n, e, t, r) => {
							this.editor.emit('drop', { editor: this.editor, event: e, slice: t, moved: r });
						}
					}
				})
			];
		}
	}),
	_d = B.create({
		name: 'editable',
		addProseMirrorPlugins() {
			return [new K({ key: new G('editable'), props: { editable: () => this.editor.options.editable } })];
		}
	}),
	Vd = new G('focusEvents'),
	Wd = B.create({
		name: 'focusEvents',
		addProseMirrorPlugins() {
			const { editor: n } = this;
			return [
				new K({
					key: Vd,
					props: {
						handleDOMEvents: {
							focus: (e, t) => {
								n.isFocused = !0;
								const r = n.state.tr.setMeta('focus', { event: t }).setMeta('addToHistory', !1);
								return (e.dispatch(r), !1);
							},
							blur: (e, t) => {
								n.isFocused = !1;
								const r = n.state.tr.setMeta('blur', { event: t }).setMeta('addToHistory', !1);
								return (e.dispatch(r), !1);
							}
						}
					}
				})
			];
		}
	}),
	jd = B.create({
		name: 'keymap',
		addKeyboardShortcuts() {
			const n = () =>
					this.editor.commands.first(({ commands: o }) => [
						() => o.undoInputRule(),
						() =>
							o.command(({ tr: l }) => {
								const { selection: a, doc: c } = l,
									{ empty: d, $anchor: u } = a,
									{ pos: f, parent: h } = u,
									p = u.parent.isTextblock && f > 0 ? l.doc.resolve(f - 1) : u,
									m = p.parent.type.spec.isolating,
									g = u.pos - u.parentOffset,
									y = m && p.parent.childCount === 1 ? g === u.pos : R.atStart(c).from === f;
								return !d || !h.type.isTextblock || h.textContent.length || !y || (y && u.parent.type.name === 'paragraph') ? !1 : o.clearNodes();
							}),
						() => o.deleteSelection(),
						() => o.joinBackward(),
						() => o.selectNodeBackward()
					]),
				e = () =>
					this.editor.commands.first(({ commands: o }) => [
						() => o.deleteSelection(),
						() => o.deleteCurrentNode(),
						() => o.joinForward(),
						() => o.selectNodeForward()
					]),
				r = {
					Enter: () =>
						this.editor.commands.first(({ commands: o }) => [
							() => o.newlineInCode(),
							() => o.createParagraphNear(),
							() => o.liftEmptyBlock(),
							() => o.splitBlock()
						]),
					'Mod-Enter': () => this.editor.commands.exitCode(),
					Backspace: n,
					'Mod-Backspace': n,
					'Shift-Backspace': n,
					Delete: e,
					'Mod-Delete': e,
					'Mod-a': () => this.editor.commands.selectAll()
				},
				i = { ...r },
				s = {
					...r,
					'Ctrl-h': n,
					'Alt-Backspace': n,
					'Ctrl-d': e,
					'Ctrl-Alt-Backspace': e,
					'Alt-Delete': e,
					'Alt-d': e,
					'Ctrl-a': () => this.editor.commands.selectTextblockStart(),
					'Ctrl-e': () => this.editor.commands.selectTextblockEnd()
				};
			return ti() || kd() ? s : i;
		},
		addProseMirrorPlugins() {
			return [
				new K({
					key: new G('clearDocument'),
					appendTransaction: (n, e, t) => {
						if (n.some((m) => m.getMeta('composition'))) return;
						const r = n.some((m) => m.docChanged) && !e.doc.eq(t.doc),
							i = n.some((m) => m.getMeta('preventClearDocument'));
						if (!r || i) return;
						const { empty: s, from: o, to: l } = e.selection,
							a = R.atStart(e.doc).from,
							c = R.atEnd(e.doc).to;
						if (s || !(o === a && l === c) || !Wi(t.doc)) return;
						const f = t.tr,
							h = $i({ state: t, transaction: f }),
							{ commands: p } = new Fi({ editor: this.editor, state: h });
						if ((p.clearNodes(), !!f.steps.length)) return f;
					}
				})
			];
		}
	}),
	Kd = B.create({
		name: 'paste',
		addProseMirrorPlugins() {
			return [
				new K({
					key: new G('tiptapPaste'),
					props: {
						handlePaste: (n, e, t) => {
							this.editor.emit('paste', { editor: this.editor, event: e, slice: t });
						}
					}
				})
			];
		}
	}),
	Ud = B.create({
		name: 'tabindex',
		addProseMirrorPlugins() {
			return [new K({ key: new G('tabindex'), props: { attributes: () => (this.editor.isEditable ? { tabindex: '0' } : {}) } })];
		}
	}),
	qd = B.create({
		name: 'textDirection',
		addOptions() {
			return { direction: void 0 };
		},
		addGlobalAttributes() {
			if (!this.options.direction) return [];
			const { nodeExtensions: n } = An(this.extensions);
			return [
				{
					types: n.filter((e) => e.name !== 'text').map((e) => e.name),
					attributes: {
						dir: {
							default: this.options.direction,
							parseHTML: (e) => {
								const t = e.getAttribute('dir');
								return t && (t === 'ltr' || t === 'rtl' || t === 'auto') ? t : this.options.direction;
							},
							renderHTML: (e) => (e.dir ? { dir: e.dir } : {})
						}
					}
				}
			];
		},
		addProseMirrorPlugins() {
			return [
				new K({
					key: new G('textDirection'),
					props: {
						attributes: () => {
							const n = this.options.direction;
							return n ? { dir: n } : {};
						}
					}
				})
			];
		}
	}),
	ry = class bn {
		constructor(e, t, r = !1, i = null) {
			((this.currentNode = null), (this.actualDepth = null), (this.isBlock = r), (this.resolvedPos = e), (this.editor = t), (this.currentNode = i));
		}
		get name() {
			return this.node.type.name;
		}
		get node() {
			return this.currentNode || this.resolvedPos.node();
		}
		get element() {
			return this.editor.view.domAtPos(this.pos).node;
		}
		get depth() {
			var e;
			return (e = this.actualDepth) != null ? e : this.resolvedPos.depth;
		}
		get pos() {
			return this.resolvedPos.pos;
		}
		get content() {
			return this.node.content;
		}
		set content(e) {
			let t = this.from,
				r = this.to;
			if (this.isBlock) {
				if (this.content.size === 0) {
					console.error(`You can’t set content on a block node. Tried to set content on ${this.name} at ${this.pos}`);
					return;
				}
				((t = this.from + 1), (r = this.to - 1));
			}
			this.editor.commands.insertContentAt({ from: t, to: r }, e);
		}
		get attributes() {
			return this.node.attrs;
		}
		get textContent() {
			return this.node.textContent;
		}
		get size() {
			return this.node.nodeSize;
		}
		get from() {
			return this.isBlock ? this.pos : this.resolvedPos.start(this.resolvedPos.depth);
		}
		get range() {
			return { from: this.from, to: this.to };
		}
		get to() {
			return this.isBlock ? this.pos + this.size : this.resolvedPos.end(this.resolvedPos.depth) + (this.node.isText ? 0 : 1);
		}
		get parent() {
			if (this.depth === 0) return null;
			const e = this.resolvedPos.start(this.resolvedPos.depth - 1),
				t = this.resolvedPos.doc.resolve(e);
			return new bn(t, this.editor);
		}
		get before() {
			let e = this.resolvedPos.doc.resolve(this.from - (this.isBlock ? 1 : 2));
			return (e.depth !== this.depth && (e = this.resolvedPos.doc.resolve(this.from - 3)), new bn(e, this.editor));
		}
		get after() {
			let e = this.resolvedPos.doc.resolve(this.to + (this.isBlock ? 2 : 1));
			return (e.depth !== this.depth && (e = this.resolvedPos.doc.resolve(this.to + 3)), new bn(e, this.editor));
		}
		get children() {
			const e = [];
			return (
				this.node.content.forEach((t, r) => {
					const i = t.isBlock && !t.isTextblock,
						s = t.isAtom && !t.isText,
						o = this.pos + r + (s ? 0 : 1);
					if (o < 0 || o > this.resolvedPos.doc.nodeSize - 2) return;
					const l = this.resolvedPos.doc.resolve(o);
					if (!i && l.depth <= this.depth) return;
					const a = new bn(l, this.editor, i, i ? t : null);
					(i && (a.actualDepth = this.depth + 1), e.push(new bn(l, this.editor, i, i ? t : null)));
				}),
				e
			);
		}
		get firstChild() {
			return this.children[0] || null;
		}
		get lastChild() {
			const e = this.children;
			return e[e.length - 1] || null;
		}
		closest(e, t = {}) {
			let r = null,
				i = this.parent;
			for (; i && !r; ) {
				if (i.node.type.name === e)
					if (Object.keys(t).length > 0) {
						const s = i.node.attrs,
							o = Object.keys(t);
						for (let l = 0; l < o.length; l += 1) {
							const a = o[l];
							if (s[a] !== t[a]) break;
						}
					} else r = i;
				i = i.parent;
			}
			return r;
		}
		querySelector(e, t = {}) {
			return this.querySelectorAll(e, t, !0)[0] || null;
		}
		querySelectorAll(e, t = {}, r = !1) {
			let i = [];
			if (!this.children || this.children.length === 0) return i;
			const s = Object.keys(t);
			return (
				this.children.forEach((o) => {
					(r && i.length > 0) ||
						(o.node.type.name === e && s.every((a) => t[a] === o.node.attrs[a]) && i.push(o),
						!(r && i.length > 0) && (i = i.concat(o.querySelectorAll(e, t, r))));
				}),
				i
			);
		}
		setAttribute(e) {
			const { tr: t } = this.editor.state;
			(t.setNodeMarkup(this.from, void 0, { ...this.node.attrs, ...e }), this.editor.view.dispatch(t));
		}
	},
	iy = `.ProseMirror {
  position: relative;
}

.ProseMirror {
  word-wrap: break-word;
  white-space: pre-wrap;
  white-space: break-spaces;
  -webkit-font-variant-ligatures: none;
  font-variant-ligatures: none;
  font-feature-settings: "liga" 0; /* the above doesn't seem to work in Edge */
}

.ProseMirror [contenteditable="false"] {
  white-space: normal;
}

.ProseMirror [contenteditable="false"] [contenteditable="true"] {
  white-space: pre-wrap;
}

.ProseMirror pre {
  white-space: pre-wrap;
}

img.ProseMirror-separator {
  display: inline !important;
  border: none !important;
  margin: 0 !important;
  width: 0 !important;
  height: 0 !important;
}

.ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
  margin: 0;
}

.ProseMirror-gapcursor:after {
  content: "";
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid black;
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}

@keyframes ProseMirror-cursor-blink {
  to {
    visibility: hidden;
  }
}

.ProseMirror-hideselection *::selection {
  background: transparent;
}

.ProseMirror-hideselection *::-moz-selection {
  background: transparent;
}

.ProseMirror-hideselection * {
  caret-color: transparent;
}

.ProseMirror-focused .ProseMirror-gapcursor {
  display: block;
}`;
function sy(n, e, t) {
	const r = document.querySelector('style[data-tiptap-style]');
	if (r !== null) return r;
	const i = document.createElement('style');
	return (
		e && i.setAttribute('nonce', e),
		i.setAttribute('data-tiptap-style', ''),
		(i.innerHTML = n),
		document.getElementsByTagName('head')[0].appendChild(i),
		i
	);
}
var oy = class extends qg {
	constructor(n = {}) {
		(super(),
			(this.css = null),
			(this.className = 'tiptap'),
			(this.editorView = null),
			(this.isFocused = !1),
			(this.isInitialized = !1),
			(this.extensionStorage = {}),
			(this.instanceId = Math.random().toString(36).slice(2, 9)),
			(this.options = {
				element: typeof document < 'u' ? document.createElement('div') : null,
				content: '',
				injectCSS: !0,
				injectNonce: void 0,
				extensions: [],
				autofocus: !1,
				editable: !0,
				textDirection: void 0,
				editorProps: {},
				parseOptions: {},
				coreExtensionOptions: {},
				enableInputRules: !0,
				enablePasteRules: !0,
				enableCoreExtensions: !0,
				enableContentCheck: !1,
				emitContentError: !1,
				onBeforeCreate: () => null,
				onCreate: () => null,
				onMount: () => null,
				onUnmount: () => null,
				onUpdate: () => null,
				onSelectionUpdate: () => null,
				onTransaction: () => null,
				onFocus: () => null,
				onBlur: () => null,
				onDestroy: () => null,
				onContentError: ({ error: r }) => {
					throw r;
				},
				onPaste: () => null,
				onDrop: () => null,
				onDelete: () => null,
				enableExtensionDispatchTransaction: !0
			}),
			(this.isCapturingTransaction = !1),
			(this.capturedTransaction = null),
			(this.utils = { getUpdatedPosition: Cg, createMappablePosition: Mg }),
			this.setOptions(n),
			this.createExtensionManager(),
			this.createCommandManager(),
			this.createSchema(),
			this.on('beforeCreate', this.options.onBeforeCreate),
			this.emit('beforeCreate', { editor: this }),
			this.on('mount', this.options.onMount),
			this.on('unmount', this.options.onUnmount),
			this.on('contentError', this.options.onContentError),
			this.on('create', this.options.onCreate),
			this.on('update', this.options.onUpdate),
			this.on('selectionUpdate', this.options.onSelectionUpdate),
			this.on('transaction', this.options.onTransaction),
			this.on('focus', this.options.onFocus),
			this.on('blur', this.options.onBlur),
			this.on('destroy', this.options.onDestroy),
			this.on('drop', ({ event: r, slice: i, moved: s }) => this.options.onDrop(r, i, s)),
			this.on('paste', ({ event: r, slice: i }) => this.options.onPaste(r, i)),
			this.on('delete', this.options.onDelete));
		const e = this.createDoc(),
			t = yd(e, this.options.autofocus);
		((this.editorState = xn.create({ doc: e, schema: this.schema, selection: t || void 0 })),
			this.options.element && this.mount(this.options.element));
	}
	mount(n) {
		if (typeof document > 'u')
			throw new Error("[tiptap error]: The editor cannot be mounted because there is no 'document' defined in this environment.");
		(this.createView(n),
			this.emit('mount', { editor: this }),
			this.css && !document.head.contains(this.css) && document.head.appendChild(this.css),
			window.setTimeout(() => {
				this.isDestroyed ||
					(this.options.autofocus !== !1 && this.options.autofocus !== null && this.commands.focus(this.options.autofocus),
					this.emit('create', { editor: this }),
					(this.isInitialized = !0));
			}, 0));
	}
	unmount() {
		if (this.editorView) {
			const n = this.editorView.dom;
			(n?.editor && delete n.editor, this.editorView.destroy());
		}
		if (((this.editorView = null), (this.isInitialized = !1), this.css && !document.querySelectorAll(`.${this.className}`).length))
			try {
				typeof this.css.remove == 'function' ? this.css.remove() : this.css.parentNode && this.css.parentNode.removeChild(this.css);
			} catch (n) {
				console.warn('Failed to remove CSS element:', n);
			}
		((this.css = null), this.emit('unmount', { editor: this }));
	}
	get storage() {
		return this.extensionStorage;
	}
	get commands() {
		return this.commandManager.commands;
	}
	chain() {
		return this.commandManager.chain();
	}
	can() {
		return this.commandManager.can();
	}
	injectCSS() {
		this.options.injectCSS && typeof document < 'u' && (this.css = sy(iy, this.options.injectNonce));
	}
	setOptions(n = {}) {
		((this.options = { ...this.options, ...n }),
			!(!this.editorView || !this.state || this.isDestroyed) &&
				(this.options.editorProps && this.view.setProps(this.options.editorProps), this.view.updateState(this.state)));
	}
	setEditable(n, e = !0) {
		(this.setOptions({ editable: n }), e && this.emit('update', { editor: this, transaction: this.state.tr, appendedTransactions: [] }));
	}
	get isEditable() {
		return this.options.editable && this.view && this.view.editable;
	}
	get view() {
		return this.editorView
			? this.editorView
			: new Proxy(
					{
						state: this.editorState,
						updateState: (n) => {
							this.editorState = n;
						},
						dispatch: (n) => {
							this.dispatchTransaction(n);
						},
						composing: !1,
						dragging: null,
						editable: !0,
						isDestroyed: !1
					},
					{
						get: (n, e) => {
							if (this.editorView) return this.editorView[e];
							if (e === 'state') return this.editorState;
							if (e in n) return Reflect.get(n, e);
							throw new Error(`[tiptap error]: The editor view is not available. Cannot access view['${e}']. The editor may not be mounted yet.`);
						}
					}
				);
	}
	get state() {
		return (this.editorView && (this.editorState = this.view.state), this.editorState);
	}
	registerPlugin(n, e) {
		const t = vd(e) ? e(n, [...this.state.plugins]) : [...this.state.plugins, n],
			r = this.state.reconfigure({ plugins: t });
		return (this.view.updateState(r), r);
	}
	unregisterPlugin(n) {
		if (this.isDestroyed) return;
		const e = this.state.plugins;
		let t = e;
		if (
			([].concat(n).forEach((i) => {
				const s = typeof i == 'string' ? `${i}$` : i.key;
				t = t.filter((o) => !o.key.startsWith(s));
			}),
			e.length === t.length)
		)
			return;
		const r = this.state.reconfigure({ plugins: t });
		return (this.view.updateState(r), r);
	}
	createExtensionManager() {
		var n, e;
		const r = [
			...(this.options.enableCoreExtensions
				? [
						_d,
						Bd.configure({
							blockSeparator:
								(e = (n = this.options.coreExtensionOptions) == null ? void 0 : n.clipboardTextSerializer) == null ? void 0 : e.blockSeparator
						}),
						Hd,
						Wd,
						jd,
						Ud,
						Fd,
						Kd,
						$d,
						qd.configure({ direction: this.options.textDirection })
					].filter((i) => (typeof this.options.enableCoreExtensions == 'object' ? this.options.enableCoreExtensions[i.name] !== !1 : !0))
				: []),
			...this.options.extensions
		].filter((i) => ['extension', 'node', 'mark'].includes(i?.type));
		this.extensionManager = new Ki(r, this);
	}
	createCommandManager() {
		this.commandManager = new Fi({ editor: this });
	}
	createSchema() {
		this.schema = this.extensionManager.schema;
	}
	createDoc() {
		let n;
		try {
			n = Ws(this.options.content, this.schema, this.options.parseOptions, { errorOnInvalidContent: this.options.enableContentCheck });
		} catch (e) {
			if (!(e instanceof Error) || !['[tiptap error]: Invalid JSON content', '[tiptap error]: Invalid HTML content'].includes(e.message)) throw e;
			(this.emit('contentError', {
				editor: this,
				error: e,
				disableCollaboration: () => {
					('collaboration' in this.storage &&
						typeof this.storage.collaboration == 'object' &&
						this.storage.collaboration &&
						(this.storage.collaboration.isDisabled = !0),
						(this.options.extensions = this.options.extensions.filter((t) => t.name !== 'collaboration')),
						this.createExtensionManager());
				}
			}),
				(n = Ws(this.options.content, this.schema, this.options.parseOptions, { errorOnInvalidContent: !1 })));
		}
		return n;
	}
	createView(n) {
		const { editorProps: e, enableExtensionDispatchTransaction: t } = this.options,
			r = e.dispatchTransaction || this.dispatchTransaction.bind(this),
			i = t ? this.extensionManager.dispatchTransaction(r) : r;
		this.editorView = new hd(n, {
			...e,
			attributes: { role: 'textbox', ...e?.attributes },
			dispatchTransaction: i,
			state: this.editorState,
			markViews: this.extensionManager.markViews,
			nodeViews: this.extensionManager.nodeViews
		});
		const s = this.state.reconfigure({ plugins: this.extensionManager.plugins });
		(this.view.updateState(s), this.prependClass(), this.injectCSS());
		const o = this.view.dom;
		o.editor = this;
	}
	createNodeViews() {
		this.view.isDestroyed || this.view.setProps({ markViews: this.extensionManager.markViews, nodeViews: this.extensionManager.nodeViews });
	}
	prependClass() {
		this.view.dom.className = `${this.className} ${this.view.dom.className}`;
	}
	captureTransaction(n) {
		((this.isCapturingTransaction = !0), n(), (this.isCapturingTransaction = !1));
		const e = this.capturedTransaction;
		return ((this.capturedTransaction = null), e);
	}
	dispatchTransaction(n) {
		if (this.view.isDestroyed) return;
		if (this.isCapturingTransaction) {
			if (!this.capturedTransaction) {
				this.capturedTransaction = n;
				return;
			}
			n.steps.forEach((c) => {
				var d;
				return (d = this.capturedTransaction) == null ? void 0 : d.step(c);
			});
			return;
		}
		const { state: e, transactions: t } = this.state.applyTransaction(n),
			r = !this.state.selection.eq(e.selection),
			i = t.includes(n),
			s = this.state;
		if ((this.emit('beforeTransaction', { editor: this, transaction: n, nextState: e }), !i)) return;
		(this.view.updateState(e),
			this.emit('transaction', { editor: this, transaction: n, appendedTransactions: t.slice(1) }),
			r && this.emit('selectionUpdate', { editor: this, transaction: n }));
		const o = t.findLast((c) => c.getMeta('focus') || c.getMeta('blur')),
			l = o?.getMeta('focus'),
			a = o?.getMeta('blur');
		(l && this.emit('focus', { editor: this, event: l.event, transaction: o }),
			a && this.emit('blur', { editor: this, event: a.event, transaction: o }),
			!(n.getMeta('preventUpdate') || !t.some((c) => c.docChanged) || s.doc.eq(e.doc)) &&
				this.emit('update', { editor: this, transaction: n, appendedTransactions: t.slice(1) }));
	}
	getAttributes(n) {
		return Ed(this.state, n);
	}
	isActive(n, e) {
		const t = typeof n == 'string' ? n : null,
			r = typeof n == 'string' ? e : n;
		return wg(this.state, t, r);
	}
	getJSON() {
		return this.state.doc.toJSON();
	}
	getHTML() {
		return Lo(this.state.doc.content, this.schema);
	}
	getText(n) {
		const {
			blockSeparator: e = `

`,
			textSerializers: t = {}
		} = n || {};
		return mg(this.state.doc, { blockSeparator: e, textSerializers: { ...Ad(this.schema), ...t } });
	}
	get isEmpty() {
		return Wi(this.state.doc);
	}
	destroy() {
		(this.emit('destroy'), this.unmount(), this.removeAllListeners());
	}
	get isDestroyed() {
		var n, e;
		return (e = (n = this.editorView) == null ? void 0 : n.isDestroyed) != null ? e : !0;
	}
	$node(n, e) {
		var t;
		return ((t = this.$doc) == null ? void 0 : t.querySelector(n, e)) || null;
	}
	$nodes(n, e) {
		var t;
		return ((t = this.$doc) == null ? void 0 : t.querySelectorAll(n, e)) || null;
	}
	$pos(n) {
		const e = this.state.doc.resolve(n);
		return new ry(e, this);
	}
	get $doc() {
		return this.$pos(0);
	}
};
function En(n) {
	return new ji({
		find: n.find,
		handler: ({ state: e, range: t, match: r }) => {
			const i = z(n.getAttributes, void 0, r);
			if (i === !1 || i === null) return null;
			const { tr: s } = e,
				o = r[r.length - 1],
				l = r[0];
			if (o) {
				const a = l.search(/\S/),
					c = t.from + l.indexOf(o),
					d = c + o.length;
				if (
					Po(t.from, t.to, e.doc)
						.filter((h) => h.mark.type.excluded.find((m) => m === n.type && m !== h.mark.type))
						.filter((h) => h.to > c).length
				)
					return null;
				(d < t.to && s.delete(d, t.to), c > t.from && s.delete(t.from + a, c));
				const f = t.from + a + o.length;
				(s.addMark(t.from + a, f, n.type.create(i || {})), s.removeStoredMark(n.type));
			}
		},
		undoable: n.undoable
	});
}
function Jd(n) {
	return new ji({
		find: n.find,
		handler: ({ state: e, range: t, match: r }) => {
			const i = z(n.getAttributes, void 0, r) || {},
				{ tr: s } = e,
				o = t.from;
			let l = t.to;
			const a = n.type.create(i);
			if (r[1]) {
				const c = r[0].lastIndexOf(r[1]);
				let d = o + c;
				d > l ? (d = l) : (l = d + r[1].length);
				const u = r[0][r[0].length - 1];
				(s.insertText(u, o + r[0].length - 1), s.replaceWith(d, l, a));
			} else if (r[0]) {
				const c = n.type.isInline ? o : o - 1;
				s.insert(c, n.type.create(i)).delete(s.mapping.map(o), s.mapping.map(l));
			}
			s.scrollIntoView();
		},
		undoable: n.undoable
	});
}
function Ks(n) {
	return new ji({
		find: n.find,
		handler: ({ state: e, range: t, match: r }) => {
			const i = e.doc.resolve(t.from),
				s = z(n.getAttributes, void 0, r) || {};
			if (!i.node(-1).canReplaceWith(i.index(-1), i.indexAfter(-1), n.type)) return null;
			e.tr.delete(t.from, t.to).setBlockType(t.from, t.from, n.type, s);
		},
		undoable: n.undoable
	});
}
function Nn(n) {
	return new ji({
		find: n.find,
		handler: ({ state: e, range: t, match: r, chain: i }) => {
			const s = z(n.getAttributes, void 0, r) || {},
				o = e.tr.delete(t.from, t.to),
				a = o.doc.resolve(t.from).blockRange(),
				c = a && fo(a, n.type, s);
			if (!c) return null;
			if ((o.wrap(a, c), n.keepMarks && n.editor)) {
				const { selection: u, storedMarks: f } = e,
					{ splittableMarks: h } = n.editor.extensionManager,
					p = f || (u.$to.parentOffset && u.$from.marks());
				if (p) {
					const m = p.filter((g) => h.includes(g.type.name));
					o.ensureMarks(m);
				}
			}
			if (n.keepAttributes) {
				const u = n.type.name === 'bulletList' || n.type.name === 'orderedList' ? 'listItem' : 'taskList';
				i().updateAttributes(u, s).run();
			}
			const d = o.doc.resolve(t.from - 1).nodeBefore;
			d && d.type === n.type && Ot(o.doc, t.from - 1) && (!n.joinPredicate || n.joinPredicate(r, d)) && o.join(t.from - 1);
		},
		undoable: n.undoable
	});
}
var ly = (n) => 'touches' in n,
	ay = class {
		constructor(n) {
			((this.directions = ['bottom-left', 'bottom-right', 'top-left', 'top-right']),
				(this.minSize = { height: 8, width: 8 }),
				(this.preserveAspectRatio = !1),
				(this.classNames = { container: '', wrapper: '', handle: '', resizing: '' }),
				(this.initialWidth = 0),
				(this.initialHeight = 0),
				(this.aspectRatio = 1),
				(this.isResizing = !1),
				(this.activeHandle = null),
				(this.startX = 0),
				(this.startY = 0),
				(this.startWidth = 0),
				(this.startHeight = 0),
				(this.isShiftKeyPressed = !1),
				(this.lastEditableState = void 0),
				(this.handleMap = new Map()),
				(this.handleMouseMove = (l) => {
					if (!this.isResizing || !this.activeHandle) return;
					const a = l.clientX - this.startX,
						c = l.clientY - this.startY;
					this.handleResize(a, c);
				}),
				(this.handleTouchMove = (l) => {
					if (!this.isResizing || !this.activeHandle) return;
					const a = l.touches[0];
					if (!a) return;
					const c = a.clientX - this.startX,
						d = a.clientY - this.startY;
					this.handleResize(c, d);
				}),
				(this.handleMouseUp = () => {
					if (!this.isResizing) return;
					const l = this.element.offsetWidth,
						a = this.element.offsetHeight;
					(this.onCommit(l, a),
						(this.isResizing = !1),
						(this.activeHandle = null),
						(this.container.dataset.resizeState = 'false'),
						this.classNames.resizing && this.container.classList.remove(this.classNames.resizing),
						document.removeEventListener('mousemove', this.handleMouseMove),
						document.removeEventListener('mouseup', this.handleMouseUp),
						document.removeEventListener('keydown', this.handleKeyDown),
						document.removeEventListener('keyup', this.handleKeyUp));
				}),
				(this.handleKeyDown = (l) => {
					l.key === 'Shift' && (this.isShiftKeyPressed = !0);
				}),
				(this.handleKeyUp = (l) => {
					l.key === 'Shift' && (this.isShiftKeyPressed = !1);
				}));
			var e, t, r, i, s, o;
			((this.node = n.node),
				(this.editor = n.editor),
				(this.element = n.element),
				(this.contentElement = n.contentElement),
				(this.getPos = n.getPos),
				(this.onResize = n.onResize),
				(this.onCommit = n.onCommit),
				(this.onUpdate = n.onUpdate),
				(e = n.options) != null && e.min && (this.minSize = { ...this.minSize, ...n.options.min }),
				(t = n.options) != null && t.max && (this.maxSize = n.options.max),
				(r = n?.options) != null && r.directions && (this.directions = n.options.directions),
				(i = n.options) != null && i.preserveAspectRatio && (this.preserveAspectRatio = n.options.preserveAspectRatio),
				(s = n.options) != null &&
					s.className &&
					(this.classNames = {
						container: n.options.className.container || '',
						wrapper: n.options.className.wrapper || '',
						handle: n.options.className.handle || '',
						resizing: n.options.className.resizing || ''
					}),
				(o = n.options) != null && o.createCustomHandle && (this.createCustomHandle = n.options.createCustomHandle),
				(this.wrapper = this.createWrapper()),
				(this.container = this.createContainer()),
				this.applyInitialSize(),
				this.attachHandles(),
				this.editor.on('update', this.handleEditorUpdate.bind(this)));
		}
		get dom() {
			return this.container;
		}
		get contentDOM() {
			return this.contentElement;
		}
		handleEditorUpdate() {
			const n = this.editor.isEditable;
			n !== this.lastEditableState &&
				((this.lastEditableState = n), n ? n && this.handleMap.size === 0 && this.attachHandles() : this.removeHandles());
		}
		update(n, e, t) {
			return n.type !== this.node.type ? !1 : ((this.node = n), this.onUpdate ? this.onUpdate(n, e, t) : !0);
		}
		destroy() {
			(this.isResizing &&
				((this.container.dataset.resizeState = 'false'),
				this.classNames.resizing && this.container.classList.remove(this.classNames.resizing),
				document.removeEventListener('mousemove', this.handleMouseMove),
				document.removeEventListener('mouseup', this.handleMouseUp),
				document.removeEventListener('keydown', this.handleKeyDown),
				document.removeEventListener('keyup', this.handleKeyUp),
				(this.isResizing = !1),
				(this.activeHandle = null)),
				this.editor.off('update', this.handleEditorUpdate.bind(this)),
				this.container.remove());
		}
		createContainer() {
			const n = document.createElement('div');
			return (
				(n.dataset.resizeContainer = ''),
				(n.dataset.node = this.node.type.name),
				(n.style.display = 'flex'),
				this.classNames.container && (n.className = this.classNames.container),
				n.appendChild(this.wrapper),
				n
			);
		}
		createWrapper() {
			const n = document.createElement('div');
			return (
				(n.style.position = 'relative'),
				(n.style.display = 'block'),
				(n.dataset.resizeWrapper = ''),
				this.classNames.wrapper && (n.className = this.classNames.wrapper),
				n.appendChild(this.element),
				n
			);
		}
		createHandle(n) {
			const e = document.createElement('div');
			return ((e.dataset.resizeHandle = n), (e.style.position = 'absolute'), this.classNames.handle && (e.className = this.classNames.handle), e);
		}
		positionHandle(n, e) {
			const t = e.includes('top'),
				r = e.includes('bottom'),
				i = e.includes('left'),
				s = e.includes('right');
			(t && (n.style.top = '0'),
				r && (n.style.bottom = '0'),
				i && (n.style.left = '0'),
				s && (n.style.right = '0'),
				(e === 'top' || e === 'bottom') && ((n.style.left = '0'), (n.style.right = '0')),
				(e === 'left' || e === 'right') && ((n.style.top = '0'), (n.style.bottom = '0')));
		}
		attachHandles() {
			this.directions.forEach((n) => {
				let e;
				(this.createCustomHandle ? (e = this.createCustomHandle(n)) : (e = this.createHandle(n)),
					e instanceof HTMLElement ||
						(console.warn(`[ResizableNodeView] createCustomHandle("${n}") did not return an HTMLElement. Falling back to default handle.`),
						(e = this.createHandle(n))),
					this.createCustomHandle || this.positionHandle(e, n),
					e.addEventListener('mousedown', (t) => this.handleResizeStart(t, n)),
					e.addEventListener('touchstart', (t) => this.handleResizeStart(t, n)),
					this.handleMap.set(n, e),
					this.wrapper.appendChild(e));
			});
		}
		removeHandles() {
			(this.handleMap.forEach((n) => n.remove()), this.handleMap.clear());
		}
		applyInitialSize() {
			const n = this.node.attrs.width,
				e = this.node.attrs.height;
			(n ? ((this.element.style.width = `${n}px`), (this.initialWidth = n)) : (this.initialWidth = this.element.offsetWidth),
				e ? ((this.element.style.height = `${e}px`), (this.initialHeight = e)) : (this.initialHeight = this.element.offsetHeight),
				this.initialWidth > 0 && this.initialHeight > 0 && (this.aspectRatio = this.initialWidth / this.initialHeight));
		}
		handleResizeStart(n, e) {
			(n.preventDefault(),
				n.stopPropagation(),
				(this.isResizing = !0),
				(this.activeHandle = e),
				ly(n) ? ((this.startX = n.touches[0].clientX), (this.startY = n.touches[0].clientY)) : ((this.startX = n.clientX), (this.startY = n.clientY)),
				(this.startWidth = this.element.offsetWidth),
				(this.startHeight = this.element.offsetHeight),
				this.startWidth > 0 && this.startHeight > 0 && (this.aspectRatio = this.startWidth / this.startHeight),
				this.getPos(),
				(this.container.dataset.resizeState = 'true'),
				this.classNames.resizing && this.container.classList.add(this.classNames.resizing),
				document.addEventListener('mousemove', this.handleMouseMove),
				document.addEventListener('touchmove', this.handleTouchMove),
				document.addEventListener('mouseup', this.handleMouseUp),
				document.addEventListener('keydown', this.handleKeyDown),
				document.addEventListener('keyup', this.handleKeyUp));
		}
		handleResize(n, e) {
			if (!this.activeHandle) return;
			const t = this.preserveAspectRatio || this.isShiftKeyPressed,
				{ width: r, height: i } = this.calculateNewDimensions(this.activeHandle, n, e),
				s = this.applyConstraints(r, i, t);
			((this.element.style.width = `${s.width}px`), (this.element.style.height = `${s.height}px`), this.onResize && this.onResize(s.width, s.height));
		}
		calculateNewDimensions(n, e, t) {
			let r = this.startWidth,
				i = this.startHeight;
			const s = n.includes('right'),
				o = n.includes('left'),
				l = n.includes('bottom'),
				a = n.includes('top');
			return (
				s ? (r = this.startWidth + e) : o && (r = this.startWidth - e),
				l ? (i = this.startHeight + t) : a && (i = this.startHeight - t),
				(n === 'right' || n === 'left') && (r = this.startWidth + (s ? e : -e)),
				(n === 'top' || n === 'bottom') && (i = this.startHeight + (l ? t : -t)),
				this.preserveAspectRatio || this.isShiftKeyPressed ? this.applyAspectRatio(r, i, n) : { width: r, height: i }
			);
		}
		applyConstraints(n, e, t) {
			var r, i, s, o;
			if (!t) {
				let c = Math.max(this.minSize.width, n),
					d = Math.max(this.minSize.height, e);
				return (
					(r = this.maxSize) != null && r.width && (c = Math.min(this.maxSize.width, c)),
					(i = this.maxSize) != null && i.height && (d = Math.min(this.maxSize.height, d)),
					{ width: c, height: d }
				);
			}
			let l = n,
				a = e;
			return (
				l < this.minSize.width && ((l = this.minSize.width), (a = l / this.aspectRatio)),
				a < this.minSize.height && ((a = this.minSize.height), (l = a * this.aspectRatio)),
				(s = this.maxSize) != null && s.width && l > this.maxSize.width && ((l = this.maxSize.width), (a = l / this.aspectRatio)),
				(o = this.maxSize) != null && o.height && a > this.maxSize.height && ((a = this.maxSize.height), (l = a * this.aspectRatio)),
				{ width: l, height: a }
			);
		}
		applyAspectRatio(n, e, t) {
			const r = t === 'left' || t === 'right',
				i = t === 'top' || t === 'bottom';
			return r
				? { width: n, height: n / this.aspectRatio }
				: i
					? { width: e * this.aspectRatio, height: e }
					: { width: n, height: n / this.aspectRatio };
		}
	};
function cy(n, e) {
	const { selection: t } = n,
		{ $from: r } = t;
	if (t instanceof N) {
		const s = r.index();
		return r.parent.canReplaceWith(s, s + 1, e);
	}
	let i = r.depth;
	for (; i >= 0; ) {
		const s = r.index(i);
		if (r.node(i).contentMatchAt(s).matchType(e)) return !0;
		i -= 1;
	}
	return !1;
}
var dy = {};
Oo(dy, {
	createAtomBlockMarkdownSpec: () => Gd,
	createBlockMarkdownSpec: () => uy,
	createInlineMarkdownSpec: () => py,
	parseAttributes: () => Bo,
	parseIndentedBlocks: () => Us,
	renderNestedMarkdownContent: () => $o,
	serializeAttributes: () => Ho
});
function Bo(n) {
	if (!n?.trim()) return {};
	const e = {},
		t = [],
		r = n.replace(/["']([^"']*)["']/g, (c) => (t.push(c), `__QUOTED_${t.length - 1}__`)),
		i = r.match(/(?:^|\s)\.([a-zA-Z][\w-]*)/g);
	if (i) {
		const c = i.map((d) => d.trim().slice(1));
		e.class = c.join(' ');
	}
	const s = r.match(/(?:^|\s)#([a-zA-Z][\w-]*)/);
	s && (e.id = s[1]);
	const o = /([a-zA-Z][\w-]*)\s*=\s*(__QUOTED_\d+__)/g;
	Array.from(r.matchAll(o)).forEach(([, c, d]) => {
		var u;
		const f = parseInt(((u = d.match(/__QUOTED_(\d+)__/)) == null ? void 0 : u[1]) || '0', 10),
			h = t[f];
		h && (e[c] = h.slice(1, -1));
	});
	const a = r
		.replace(/(?:^|\s)\.([a-zA-Z][\w-]*)/g, '')
		.replace(/(?:^|\s)#([a-zA-Z][\w-]*)/g, '')
		.replace(/([a-zA-Z][\w-]*)\s*=\s*__QUOTED_\d+__/g, '')
		.trim();
	return (
		a &&
			a
				.split(/\s+/)
				.filter(Boolean)
				.forEach((d) => {
					d.match(/^[a-zA-Z][\w-]*$/) && (e[d] = !0);
				}),
		e
	);
}
function Ho(n) {
	if (!n || Object.keys(n).length === 0) return '';
	const e = [];
	return (
		n.class &&
			String(n.class)
				.split(/\s+/)
				.filter(Boolean)
				.forEach((r) => e.push(`.${r}`)),
		n.id && e.push(`#${n.id}`),
		Object.entries(n).forEach(([t, r]) => {
			t === 'class' || t === 'id' || (r === !0 ? e.push(t) : r !== !1 && r != null && e.push(`${t}="${String(r)}"`));
		}),
		e.join(' ')
	);
}
function Gd(n) {
	const {
			nodeName: e,
			name: t,
			parseAttributes: r = Bo,
			serializeAttributes: i = Ho,
			defaultAttributes: s = {},
			requiredAttributes: o = [],
			allowedAttributes: l
		} = n,
		a = t || e,
		c = (d) => {
			if (!l) return d;
			const u = {};
			return (
				l.forEach((f) => {
					f in d && (u[f] = d[f]);
				}),
				u
			);
		};
	return {
		parseMarkdown: (d, u) => {
			const f = { ...s, ...d.attributes };
			return u.createNode(e, f, []);
		},
		markdownTokenizer: {
			name: e,
			level: 'block',
			start(d) {
				var u;
				const f = new RegExp(`^:::${a}(?:\\s|$)`, 'm'),
					h = (u = d.match(f)) == null ? void 0 : u.index;
				return h !== void 0 ? h : -1;
			},
			tokenize(d, u, f) {
				const h = new RegExp(`^:::${a}(?:\\s+\\{([^}]*)\\})?\\s*:::(?:\\n|$)`),
					p = d.match(h);
				if (!p) return;
				const m = p[1] || '',
					g = r(m);
				if (!o.find((x) => !(x in g))) return { type: e, raw: p[0], attributes: g };
			}
		},
		renderMarkdown: (d) => {
			const u = c(d.attrs || {}),
				f = i(u),
				h = f ? ` {${f}}` : '';
			return `:::${a}${h} :::`;
		}
	};
}
function uy(n) {
	const {
			nodeName: e,
			name: t,
			getContent: r,
			parseAttributes: i = Bo,
			serializeAttributes: s = Ho,
			defaultAttributes: o = {},
			content: l = 'block',
			allowedAttributes: a
		} = n,
		c = t || e,
		d = (u) => {
			if (!a) return u;
			const f = {};
			return (
				a.forEach((h) => {
					h in u && (f[h] = u[h]);
				}),
				f
			);
		};
	return {
		parseMarkdown: (u, f) => {
			let h;
			if (r) {
				const m = r(u);
				h = typeof m == 'string' ? [{ type: 'text', text: m }] : m;
			} else l === 'block' ? (h = f.parseChildren(u.tokens || [])) : (h = f.parseInline(u.tokens || []));
			const p = { ...o, ...u.attributes };
			return f.createNode(e, p, h);
		},
		markdownTokenizer: {
			name: e,
			level: 'block',
			start(u) {
				var f;
				const h = new RegExp(`^:::${c}`, 'm'),
					p = (f = u.match(h)) == null ? void 0 : f.index;
				return p !== void 0 ? p : -1;
			},
			tokenize(u, f, h) {
				var p;
				const m = new RegExp(`^:::${c}(?:\\s+\\{([^}]*)\\})?\\s*\\n`),
					g = u.match(m);
				if (!g) return;
				const [y, x = ''] = g,
					M = i(x);
				let T = 1;
				const S = y.length;
				let A = '';
				const v = /^:::([\w-]*)(\s.*)?/gm,
					D = u.slice(S);
				for (v.lastIndex = 0; ; ) {
					const P = v.exec(D);
					if (P === null) break;
					const de = P.index,
						ut = P[1];
					if (!((p = P[2]) != null && p.endsWith(':::'))) {
						if (ut) T += 1;
						else if (((T -= 1), T === 0)) {
							const Pe = D.slice(0, de);
							A = Pe.trim();
							const ft = u.slice(0, S + de + P[0].length);
							let ge = [];
							if (A)
								if (l === 'block')
									for (
										ge = h.blockTokens(Pe),
											ge.forEach((ue) => {
												ue.text && (!ue.tokens || ue.tokens.length === 0) && (ue.tokens = h.inlineTokens(ue.text));
											});
										ge.length > 0;
									) {
										const ue = ge[ge.length - 1];
										if (ue.type === 'paragraph' && (!ue.text || ue.text.trim() === '')) ge.pop();
										else break;
									}
								else ge = h.inlineTokens(A);
							return { type: e, raw: ft, attributes: M, content: A, tokens: ge };
						}
					}
				}
			}
		},
		renderMarkdown: (u, f) => {
			const h = d(u.attrs || {}),
				p = s(h),
				m = p ? ` {${p}}` : '',
				g = f.renderChildren(
					u.content || [],
					`

`
				);
			return `:::${c}${m}

${g}

:::`;
		}
	};
}
function fy(n) {
	if (!n.trim()) return {};
	const e = {},
		t = /(\w+)=(?:"([^"]*)"|'([^']*)')/g;
	let r = t.exec(n);
	for (; r !== null; ) {
		const [, i, s, o] = r;
		((e[i] = s || o), (r = t.exec(n)));
	}
	return e;
}
function hy(n) {
	return Object.entries(n)
		.filter(([, e]) => e != null)
		.map(([e, t]) => `${e}="${t}"`)
		.join(' ');
}
function py(n) {
	const {
			nodeName: e,
			name: t,
			getContent: r,
			parseAttributes: i = fy,
			serializeAttributes: s = hy,
			defaultAttributes: o = {},
			selfClosing: l = !1,
			allowedAttributes: a
		} = n,
		c = t || e,
		d = (f) => {
			if (!a) return f;
			const h = {};
			return (
				a.forEach((p) => {
					const m = typeof p == 'string' ? p : p.name,
						g = typeof p == 'string' ? void 0 : p.skipIfDefault;
					if (m in f) {
						const y = f[m];
						if (g !== void 0 && y === g) return;
						h[m] = y;
					}
				}),
				h
			);
		},
		u = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return {
		parseMarkdown: (f, h) => {
			const p = { ...o, ...f.attributes };
			if (l) return h.createNode(e, p);
			const m = r ? r(f) : f.content || '';
			return m ? h.createNode(e, p, [h.createTextNode(m)]) : h.createNode(e, p, []);
		},
		markdownTokenizer: {
			name: e,
			level: 'inline',
			start(f) {
				const h = l ? new RegExp(`\\[${u}\\s*[^\\]]*\\]`) : new RegExp(`\\[${u}\\s*[^\\]]*\\][\\s\\S]*?\\[\\/${u}\\]`),
					p = f.match(h),
					m = p?.index;
				return m !== void 0 ? m : -1;
			},
			tokenize(f, h, p) {
				const m = l ? new RegExp(`^\\[${u}\\s*([^\\]]*)\\]`) : new RegExp(`^\\[${u}\\s*([^\\]]*)\\]([\\s\\S]*?)\\[\\/${u}\\]`),
					g = f.match(m);
				if (!g) return;
				let y = '',
					x = '';
				if (l) {
					const [, T] = g;
					x = T;
				} else {
					const [, T, S] = g;
					((x = T), (y = S || ''));
				}
				const M = i(x.trim());
				return { type: e, raw: g[0], content: y.trim(), attributes: M };
			}
		},
		renderMarkdown: (f) => {
			let h = '';
			r
				? (h = r(f))
				: f.content &&
					f.content.length > 0 &&
					(h = f.content
						.filter((y) => y.type === 'text')
						.map((y) => y.text)
						.join(''));
			const p = d(f.attrs || {}),
				m = s(p),
				g = m ? ` ${m}` : '';
			return l ? `[${c}${g}]` : `[${c}${g}]${h}[/${c}]`;
		}
	};
}
function Us(n, e, t) {
	var r, i, s, o;
	const l = n.split(`
`),
		a = [];
	let c = '',
		d = 0;
	const u = e.baseIndentSize || 2;
	for (; d < l.length; ) {
		const f = l[d],
			h = f.match(e.itemPattern);
		if (!h) {
			if (a.length > 0) break;
			if (f.trim() === '') {
				((d += 1),
					(c = `${c}${f}
`));
				continue;
			} else return;
		}
		const p = e.extractItemData(h),
			{ indentLevel: m, mainContent: g } = p;
		c = `${c}${f}
`;
		const y = [g];
		for (d += 1; d < l.length; ) {
			const S = l[d];
			if (S.trim() === '') {
				const v = l.slice(d + 1).findIndex((de) => de.trim() !== '');
				if (v === -1) break;
				if ((((i = (r = l[d + 1 + v].match(/^(\s*)/)) == null ? void 0 : r[1]) == null ? void 0 : i.length) || 0) > m) {
					(y.push(S),
						(c = `${c}${S}
`),
						(d += 1));
					continue;
				} else break;
			}
			if ((((o = (s = S.match(/^(\s*)/)) == null ? void 0 : s[1]) == null ? void 0 : o.length) || 0) > m)
				(y.push(S),
					(c = `${c}${S}
`),
					(d += 1));
			else break;
		}
		let x;
		const M = y.slice(1);
		if (M.length > 0) {
			const S = M.map((A) => A.slice(m + u)).join(`
`);
			S.trim() && (e.customNestedParser ? (x = e.customNestedParser(S)) : (x = t.blockTokens(S)));
		}
		const T = e.createToken(p, x);
		a.push(T);
	}
	if (a.length !== 0) return { items: a, raw: c };
}
function $o(n, e, t, r) {
	if (!n || !Array.isArray(n.content)) return '';
	const i = typeof t == 'function' ? t(r) : t,
		[s, ...o] = n.content,
		l = e.renderChildren([s]),
		a = [`${i}${l}`];
	return (
		o &&
			o.length > 0 &&
			o.forEach((c) => {
				const d = e.renderChildren([c]);
				if (d) {
					const u = d
						.split(
							`
`
						)
						.map((f) => (f ? e.indent(f) : '')).join(`
`);
					a.push(u);
				}
			}),
		a.join(`
`)
	);
}
function my(n, e, t = {}) {
	const { state: r } = e,
		{ doc: i, tr: s } = r,
		o = n;
	(i.descendants((l, a) => {
		const c = s.mapping.map(a),
			d = s.mapping.map(a) + l.nodeSize;
		let u = null;
		if (
			(l.marks.forEach((h) => {
				if (h !== o) return !1;
				u = h;
			}),
			!u)
		)
			return;
		let f = !1;
		if (
			(Object.keys(t).forEach((h) => {
				t[h] !== u.attrs[h] && (f = !0);
			}),
			f)
		) {
			const h = n.type.create({ ...n.attrs, ...t });
			(s.removeMark(c, d, n.type), s.addMark(c, d, h));
		}
	}),
		s.docChanged && e.view.dispatch(s));
}
var ee = class Yd extends zo {
	constructor() {
		(super(...arguments), (this.type = 'node'));
	}
	static create(e = {}) {
		const t = typeof e == 'function' ? e() : e;
		return new Yd(t);
	}
	configure(e) {
		return super.configure(e);
	}
	extend(e) {
		const t = typeof e == 'function' ? e() : e;
		return super.extend(t);
	}
};
function Zt(n) {
	return new Pd({
		find: n.find,
		handler: ({ state: e, range: t, match: r, pasteEvent: i }) => {
			const s = z(n.getAttributes, void 0, r, i);
			if (s === !1 || s === null) return null;
			const { tr: o } = e,
				l = r[r.length - 1],
				a = r[0];
			let c = t.to;
			if (l) {
				const d = a.search(/\S/),
					u = t.from + a.indexOf(l),
					f = u + l.length;
				if (
					Po(t.from, t.to, e.doc)
						.filter((p) => p.mark.type.excluded.find((g) => g === n.type && g !== p.mark.type))
						.filter((p) => p.to > u).length
				)
					return null;
				(f < t.to && o.delete(f, t.to),
					u > t.from && o.delete(t.from + d, u),
					(c = t.from + d + l.length),
					o.addMark(t.from + d, c, n.type.create(s || {})),
					o.removeStoredMark(n.type));
			}
		}
	});
}
function gy(n) {
	return new Pd({
		find: n.find,
		handler({ match: e, chain: t, range: r, pasteEvent: i }) {
			const s = z(n.getAttributes, void 0, e, i),
				o = z(n.getContent, void 0, s);
			if (s === !1 || s === null) return null;
			const l = { type: n.type.name, attrs: s };
			(o && (l.content = o), e.input && t().deleteRange(r).insertContentAt(r.from, l));
		}
	});
}
var ri = (n, e) => {
		if (n === 'slot') return 0;
		if (n instanceof Function) return n(e);
		const { children: t, ...r } = e ?? {};
		if (n === 'svg') throw new Error('SVG elements are not supported in the JSX syntax, use the array syntax instead');
		return [n, r, t];
	},
	yy = /^\s*>\s$/,
	by = ee.create({
		name: 'blockquote',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		content: 'block+',
		group: 'block',
		defining: !0,
		parseHTML() {
			return [{ tag: 'blockquote' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ri('blockquote', { ..._(this.options.HTMLAttributes, n), children: ri('slot', {}) });
		},
		parseMarkdown: (n, e) => e.createNode('blockquote', void 0, e.parseChildren(n.tokens || [])),
		renderMarkdown: (n, e) => {
			if (!n.content) return '';
			const t = '>',
				r = [];
			return (
				n.content.forEach((i) => {
					const l = e
						.renderChildren([i])
						.split(
							`
`
						)
						.map((a) => (a.trim() === '' ? t : `${t} ${a}`));
					r.push(
						l.join(`
`)
					);
				}),
				r.join(`
${t}
`)
			);
		},
		addCommands() {
			return {
				setBlockquote:
					() =>
					({ commands: n }) =>
						n.wrapIn(this.name),
				toggleBlockquote:
					() =>
					({ commands: n }) =>
						n.toggleWrap(this.name),
				unsetBlockquote:
					() =>
					({ commands: n }) =>
						n.lift(this.name)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-Shift-b': () => this.editor.commands.toggleBlockquote() };
		},
		addInputRules() {
			return [Nn({ find: yy, type: this.type })];
		}
	}),
	ky = /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))$/,
	xy = /(?:^|\s)(\*\*(?!\s+\*\*)((?:[^*]+))\*\*(?!\s+\*\*))/g,
	wy = /(?:^|\s)(__(?!\s+__)((?:[^_]+))__(?!\s+__))$/,
	Sy = /(?:^|\s)(__(?!\s+__)((?:[^_]+))__(?!\s+__))/g,
	vy = It.create({
		name: 'bold',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		parseHTML() {
			return [
				{ tag: 'strong' },
				{ tag: 'b', getAttrs: (n) => n.style.fontWeight !== 'normal' && null },
				{ style: 'font-weight=400', clearMark: (n) => n.type.name === this.name },
				{ style: 'font-weight', getAttrs: (n) => /^(bold(er)?|[5-9]\d{2,})$/.test(n) && null }
			];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ri('strong', { ..._(this.options.HTMLAttributes, n), children: ri('slot', {}) });
		},
		markdownTokenName: 'strong',
		parseMarkdown: (n, e) => e.applyMark('bold', e.parseInline(n.tokens || [])),
		renderMarkdown: (n, e) => `**${e.renderChildren(n)}**`,
		addCommands() {
			return {
				setBold:
					() =>
					({ commands: n }) =>
						n.setMark(this.name),
				toggleBold:
					() =>
					({ commands: n }) =>
						n.toggleMark(this.name),
				unsetBold:
					() =>
					({ commands: n }) =>
						n.unsetMark(this.name)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-b': () => this.editor.commands.toggleBold(), 'Mod-B': () => this.editor.commands.toggleBold() };
		},
		addInputRules() {
			return [En({ find: ky, type: this.type }), En({ find: wy, type: this.type })];
		},
		addPasteRules() {
			return [Zt({ find: xy, type: this.type }), Zt({ find: Sy, type: this.type })];
		}
	}),
	Cy = /(^|[^`])`([^`]+)`(?!`)$/,
	My = /(^|[^`])`([^`]+)`(?!`)/g,
	Ty = It.create({
		name: 'code',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		excludes: '_',
		code: !0,
		exitable: !0,
		parseHTML() {
			return [{ tag: 'code' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['code', _(this.options.HTMLAttributes, n), 0];
		},
		markdownTokenName: 'codespan',
		parseMarkdown: (n, e) => e.applyMark('code', [{ type: 'text', text: n.text || '' }]),
		renderMarkdown: (n, e) => (n.content ? `\`${e.renderChildren(n.content)}\`` : ''),
		addCommands() {
			return {
				setCode:
					() =>
					({ commands: n }) =>
						n.setMark(this.name),
				toggleCode:
					() =>
					({ commands: n }) =>
						n.toggleMark(this.name),
				unsetCode:
					() =>
					({ commands: n }) =>
						n.unsetMark(this.name)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-e': () => this.editor.commands.toggleCode() };
		},
		addInputRules() {
			return [En({ find: Cy, type: this.type })];
		},
		addPasteRules() {
			return [Zt({ find: My, type: this.type })];
		}
	}),
	bs = 4,
	Ay = /^```([a-z]+)?[\s\n]$/,
	Ey = /^~~~([a-z]+)?[\s\n]$/,
	Ny = ee.create({
		name: 'codeBlock',
		addOptions() {
			return {
				languageClassPrefix: 'language-',
				exitOnTripleEnter: !0,
				exitOnArrowDown: !0,
				defaultLanguage: null,
				enableTabIndentation: !1,
				tabSize: bs,
				HTMLAttributes: {}
			};
		},
		content: 'text*',
		marks: '',
		group: 'block',
		code: !0,
		defining: !0,
		addAttributes() {
			return {
				language: {
					default: this.options.defaultLanguage,
					parseHTML: (n) => {
						var e;
						const { languageClassPrefix: t } = this.options;
						if (!t) return null;
						const s = [...(((e = n.firstElementChild) == null ? void 0 : e.classList) || [])]
							.filter((o) => o.startsWith(t))
							.map((o) => o.replace(t, ''))[0];
						return s || null;
					},
					rendered: !1
				}
			};
		},
		parseHTML() {
			return [{ tag: 'pre', preserveWhitespace: 'full' }];
		},
		renderHTML({ node: n, HTMLAttributes: e }) {
			return [
				'pre',
				_(this.options.HTMLAttributes, e),
				['code', { class: n.attrs.language ? this.options.languageClassPrefix + n.attrs.language : null }, 0]
			];
		},
		markdownTokenName: 'code',
		parseMarkdown: (n, e) => {
			var t;
			return ((t = n.raw) == null ? void 0 : t.startsWith('```')) === !1 && n.codeBlockStyle !== 'indented'
				? []
				: e.createNode('codeBlock', { language: n.lang || null }, n.text ? [e.createTextNode(n.text)] : []);
		},
		renderMarkdown: (n, e) => {
			var t;
			let r = '';
			const i = ((t = n.attrs) == null ? void 0 : t.language) || '';
			return (
				n.content
					? (r = [`\`\`\`${i}`, e.renderChildren(n.content), '```'].join(`
`))
					: (r = `\`\`\`${i}

\`\`\``),
				r
			);
		},
		addCommands() {
			return {
				setCodeBlock:
					(n) =>
					({ commands: e }) =>
						e.setNode(this.name, n),
				toggleCodeBlock:
					(n) =>
					({ commands: e }) =>
						e.toggleNode(this.name, 'paragraph', n)
			};
		},
		addKeyboardShortcuts() {
			return {
				'Mod-Alt-c': () => this.editor.commands.toggleCodeBlock(),
				Backspace: () => {
					const { empty: n, $anchor: e } = this.editor.state.selection,
						t = e.pos === 1;
					return !n || e.parent.type.name !== this.name ? !1 : t || !e.parent.textContent.length ? this.editor.commands.clearNodes() : !1;
				},
				Tab: ({ editor: n }) => {
					var e;
					if (!this.options.enableTabIndentation) return !1;
					const t = (e = this.options.tabSize) != null ? e : bs,
						{ state: r } = n,
						{ selection: i } = r,
						{ $from: s, empty: o } = i;
					if (s.parent.type !== this.type) return !1;
					const l = ' '.repeat(t);
					return o
						? n.commands.insertContent(l)
						: n.commands.command(({ tr: a }) => {
								const { from: c, to: d } = i,
									h = r.doc
										.textBetween(
											c,
											d,
											`
`,
											`
`
										)
										.split(
											`
`
										)
										.map((p) => l + p).join(`
`);
								return (a.replaceWith(c, d, r.schema.text(h)), !0);
							});
				},
				'Shift-Tab': ({ editor: n }) => {
					var e;
					if (!this.options.enableTabIndentation) return !1;
					const t = (e = this.options.tabSize) != null ? e : bs,
						{ state: r } = n,
						{ selection: i } = r,
						{ $from: s, empty: o } = i;
					return s.parent.type !== this.type
						? !1
						: o
							? n.commands.command(({ tr: l }) => {
									var a;
									const { pos: c } = s,
										d = s.start(),
										u = s.end(),
										h = r.doc.textBetween(
											d,
											u,
											`
`,
											`
`
										).split(`
`);
									let p = 0,
										m = 0;
									const g = c - d;
									for (let A = 0; A < h.length; A += 1) {
										if (m + h[A].length >= g) {
											p = A;
											break;
										}
										m += h[A].length + 1;
									}
									const x = ((a = h[p].match(/^ */)) == null ? void 0 : a[0]) || '',
										M = Math.min(x.length, t);
									if (M === 0) return !0;
									let T = d;
									for (let A = 0; A < p; A += 1) T += h[A].length + 1;
									return (l.delete(T, T + M), c - T <= M && l.setSelection(O.create(l.doc, T)), !0);
								})
							: n.commands.command(({ tr: l }) => {
									const { from: a, to: c } = i,
										f = r.doc
											.textBetween(
												a,
												c,
												`
`,
												`
`
											)
											.split(
												`
`
											)
											.map((h) => {
												var p;
												const m = ((p = h.match(/^ */)) == null ? void 0 : p[0]) || '',
													g = Math.min(m.length, t);
												return h.slice(g);
											}).join(`
`);
									return (l.replaceWith(a, c, r.schema.text(f)), !0);
								});
				},
				Enter: ({ editor: n }) => {
					if (!this.options.exitOnTripleEnter) return !1;
					const { state: e } = n,
						{ selection: t } = e,
						{ $from: r, empty: i } = t;
					if (!i || r.parent.type !== this.type) return !1;
					const s = r.parentOffset === r.parent.nodeSize - 2,
						o = r.parent.textContent.endsWith(`

`);
					return !s || !o
						? !1
						: n
								.chain()
								.command(({ tr: l }) => (l.delete(r.pos - 2, r.pos), !0))
								.exitCode()
								.run();
				},
				ArrowDown: ({ editor: n }) => {
					if (!this.options.exitOnArrowDown) return !1;
					const { state: e } = n,
						{ selection: t, doc: r } = e,
						{ $from: i, empty: s } = t;
					if (!s || i.parent.type !== this.type || !(i.parentOffset === i.parent.nodeSize - 2)) return !1;
					const l = i.after();
					return l === void 0
						? !1
						: r.nodeAt(l)
							? n.commands.command(({ tr: c }) => (c.setSelection(R.near(r.resolve(l))), !0))
							: n.commands.exitCode();
				}
			};
		},
		addInputRules() {
			return [
				Ks({ find: Ay, type: this.type, getAttributes: (n) => ({ language: n[1] }) }),
				Ks({ find: Ey, type: this.type, getAttributes: (n) => ({ language: n[1] }) })
			];
		},
		addProseMirrorPlugins() {
			return [
				new K({
					key: new G('codeBlockVSCodeHandler'),
					props: {
						handlePaste: (n, e) => {
							if (!e.clipboardData || this.editor.isActive(this.type.name)) return !1;
							const t = e.clipboardData.getData('text/plain'),
								r = e.clipboardData.getData('vscode-editor-data'),
								i = r ? JSON.parse(r) : void 0,
								s = i?.mode;
							if (!t || !s) return !1;
							const { tr: o, schema: l } = n.state,
								a = l.text(
									t.replace(
										/\r\n?/g,
										`
`
									)
								);
							return (
								o.replaceSelectionWith(this.type.create({ language: s }, a)),
								o.selection.$from.parent.type !== this.type && o.setSelection(O.near(o.doc.resolve(Math.max(0, o.selection.from - 2)))),
								o.setMeta('paste', !0),
								n.dispatch(o),
								!0
							);
						}
					}
				})
			];
		}
	}),
	Oy = ee.create({
		name: 'doc',
		topNode: !0,
		content: 'block+',
		renderMarkdown: (n, e) =>
			n.content
				? e.renderChildren(
						n.content,
						`

`
					)
				: ''
	}),
	Ry = ee.create({
		name: 'hardBreak',
		markdownTokenName: 'br',
		addOptions() {
			return { keepMarks: !0, HTMLAttributes: {} };
		},
		inline: !0,
		group: 'inline',
		selectable: !1,
		linebreakReplacement: !0,
		parseHTML() {
			return [{ tag: 'br' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['br', _(this.options.HTMLAttributes, n)];
		},
		renderText() {
			return `
`;
		},
		renderMarkdown: () => `  
`,
		parseMarkdown: () => ({ type: 'hardBreak' }),
		addCommands() {
			return {
				setHardBreak:
					() =>
					({ commands: n, chain: e, state: t, editor: r }) =>
						n.first([
							() => n.exitCode(),
							() =>
								n.command(() => {
									const { selection: i, storedMarks: s } = t;
									if (i.$from.parent.type.spec.isolating) return !1;
									const { keepMarks: o } = this.options,
										{ splittableMarks: l } = r.extensionManager,
										a = s || (i.$to.parentOffset && i.$from.marks());
									return e()
										.insertContent({ type: this.name })
										.command(({ tr: c, dispatch: d }) => {
											if (d && a && o) {
												const u = a.filter((f) => l.includes(f.type.name));
												c.ensureMarks(u);
											}
											return !0;
										})
										.run();
								})
						])
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-Enter': () => this.editor.commands.setHardBreak(), 'Shift-Enter': () => this.editor.commands.setHardBreak() };
		}
	}),
	Iy = ee.create({
		name: 'heading',
		addOptions() {
			return { levels: [1, 2, 3, 4, 5, 6], HTMLAttributes: {} };
		},
		content: 'inline*',
		group: 'block',
		defining: !0,
		addAttributes() {
			return { level: { default: 1, rendered: !1 } };
		},
		parseHTML() {
			return this.options.levels.map((n) => ({ tag: `h${n}`, attrs: { level: n } }));
		},
		renderHTML({ node: n, HTMLAttributes: e }) {
			return [`h${this.options.levels.includes(n.attrs.level) ? n.attrs.level : this.options.levels[0]}`, _(this.options.HTMLAttributes, e), 0];
		},
		parseMarkdown: (n, e) => e.createNode('heading', { level: n.depth || 1 }, e.parseInline(n.tokens || [])),
		renderMarkdown: (n, e) => {
			var t;
			const r = (t = n.attrs) != null && t.level ? parseInt(n.attrs.level, 10) : 1,
				i = '#'.repeat(r);
			return n.content ? `${i} ${e.renderChildren(n.content)}` : '';
		},
		addCommands() {
			return {
				setHeading:
					(n) =>
					({ commands: e }) =>
						this.options.levels.includes(n.level) ? e.setNode(this.name, n) : !1,
				toggleHeading:
					(n) =>
					({ commands: e }) =>
						this.options.levels.includes(n.level) ? e.toggleNode(this.name, 'paragraph', n) : !1
			};
		},
		addKeyboardShortcuts() {
			return this.options.levels.reduce((n, e) => ({ ...n, [`Mod-Alt-${e}`]: () => this.editor.commands.toggleHeading({ level: e }) }), {});
		},
		addInputRules() {
			return this.options.levels.map((n) =>
				Ks({ find: new RegExp(`^(#{${Math.min(...this.options.levels)},${n}})\\s$`), type: this.type, getAttributes: { level: n } })
			);
		}
	}),
	Dy = ee.create({
		name: 'horizontalRule',
		addOptions() {
			return { HTMLAttributes: {}, nextNodeType: 'paragraph' };
		},
		group: 'block',
		parseHTML() {
			return [{ tag: 'hr' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['hr', _(this.options.HTMLAttributes, n)];
		},
		markdownTokenName: 'hr',
		parseMarkdown: (n, e) => e.createNode('horizontalRule'),
		renderMarkdown: () => '---',
		addCommands() {
			return {
				setHorizontalRule:
					() =>
					({ chain: n, state: e }) => {
						if (!cy(e, e.schema.nodes[this.name])) return !1;
						const { selection: t } = e,
							{ $to: r } = t,
							i = n();
						return (
							Od(t) ? i.insertContentAt(r.pos, { type: this.name }) : i.insertContent({ type: this.name }),
							i
								.command(({ state: s, tr: o, dispatch: l }) => {
									if (l) {
										const { $to: a } = o.selection,
											c = a.end();
										if (a.nodeAfter)
											a.nodeAfter.isTextblock
												? o.setSelection(O.create(o.doc, a.pos + 1))
												: a.nodeAfter.isBlock
													? o.setSelection(N.create(o.doc, a.pos))
													: o.setSelection(O.create(o.doc, a.pos));
										else {
											const d = s.schema.nodes[this.options.nextNodeType] || a.parent.type.contentMatch.defaultType,
												u = d?.create();
											u && (o.insert(c, u), o.setSelection(O.create(o.doc, c + 1)));
										}
										o.scrollIntoView();
									}
									return !0;
								})
								.run()
						);
					}
			};
		},
		addInputRules() {
			return [Jd({ find: /^(?:---|—-|___\s|\*\*\*\s)$/, type: this.type })];
		}
	}),
	Ly = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))$/,
	Py = /(?:^|\s)(\*(?!\s+\*)((?:[^*]+))\*(?!\s+\*))/g,
	zy = /(?:^|\s)(_(?!\s+_)((?:[^_]+))_(?!\s+_))$/,
	By = /(?:^|\s)(_(?!\s+_)((?:[^_]+))_(?!\s+_))/g,
	Hy = It.create({
		name: 'italic',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		parseHTML() {
			return [
				{ tag: 'em' },
				{ tag: 'i', getAttrs: (n) => n.style.fontStyle !== 'normal' && null },
				{ style: 'font-style=normal', clearMark: (n) => n.type.name === this.name },
				{ style: 'font-style=italic' }
			];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['em', _(this.options.HTMLAttributes, n), 0];
		},
		addCommands() {
			return {
				setItalic:
					() =>
					({ commands: n }) =>
						n.setMark(this.name),
				toggleItalic:
					() =>
					({ commands: n }) =>
						n.toggleMark(this.name),
				unsetItalic:
					() =>
					({ commands: n }) =>
						n.unsetMark(this.name)
			};
		},
		markdownTokenName: 'em',
		parseMarkdown: (n, e) => e.applyMark('italic', e.parseInline(n.tokens || [])),
		renderMarkdown: (n, e) => `*${e.renderChildren(n)}*`,
		addKeyboardShortcuts() {
			return { 'Mod-i': () => this.editor.commands.toggleItalic(), 'Mod-I': () => this.editor.commands.toggleItalic() };
		},
		addInputRules() {
			return [En({ find: Ly, type: this.type }), En({ find: zy, type: this.type })];
		},
		addPasteRules() {
			return [Zt({ find: Py, type: this.type }), Zt({ find: By, type: this.type })];
		}
	});
const $y =
		'aaa1rp3bb0ott3vie4c1le2ogado5udhabi7c0ademy5centure6ountant0s9o1tor4d0s1ult4e0g1ro2tna4f0l1rica5g0akhan5ency5i0g1rbus3force5tel5kdn3l0ibaba4pay4lfinanz6state5y2sace3tom5m0azon4ericanexpress7family11x2fam3ica3sterdam8nalytics7droid5quan4z2o0l2partments8p0le4q0uarelle8r0ab1mco4chi3my2pa2t0e3s0da2ia2sociates9t0hleta5torney7u0ction5di0ble3o3spost5thor3o0s4w0s2x0a2z0ure5ba0by2idu3namex4d1k2r0celona5laycard4s5efoot5gains6seball5ketball8uhaus5yern5b0c1t1va3cg1n2d1e0ats2uty4er2rlin4st0buy5t2f1g1h0arti5i0ble3d1ke2ng0o3o1z2j1lack0friday9ockbuster8g1omberg7ue3m0s1w2n0pparibas9o0ats3ehringer8fa2m1nd2o0k0ing5sch2tik2on4t1utique6x2r0adesco6idgestone9oadway5ker3ther5ussels7s1t1uild0ers6siness6y1zz3v1w1y1z0h3ca0b1fe2l0l1vinklein9m0era3p2non3petown5ital0one8r0avan4ds2e0er0s4s2sa1e1h1ino4t0ering5holic7ba1n1re3c1d1enter4o1rn3f0a1d2g1h0anel2nel4rity4se2t2eap3intai5ristmas6ome4urch5i0priani6rcle4sco3tadel4i0c2y3k1l0aims4eaning6ick2nic1que6othing5ud3ub0med6m1n1o0ach3des3ffee4llege4ogne5m0mbank4unity6pany2re3uter5sec4ndos3struction8ulting7tact3ractors9oking4l1p2rsica5untry4pon0s4rses6pa2r0edit0card4union9icket5own3s1uise0s6u0isinella9v1w1x1y0mru3ou3z2dad1nce3ta1e1ing3sun4y2clk3ds2e0al0er2s3gree4livery5l1oitte5ta3mocrat6ntal2ist5si0gn4v2hl2iamonds6et2gital5rect0ory7scount3ver5h2y2j1k1m1np2o0cs1tor4g1mains5t1wnload7rive4tv2ubai3nlop4pont4rban5vag2r2z2earth3t2c0o2deka3u0cation8e1g1mail3erck5nergy4gineer0ing9terprises10pson4quipment8r0icsson6ni3s0q1tate5t1u0rovision8s2vents5xchange6pert3osed4ress5traspace10fage2il1rwinds6th3mily4n0s2rm0ers5shion4t3edex3edback6rrari3ero6i0delity5o2lm2nal1nce1ial7re0stone6mdale6sh0ing5t0ness6j1k1lickr3ghts4r2orist4wers5y2m1o0o0d1tball6rd1ex2sale4um3undation8x2r0ee1senius7l1ogans4ntier7tr2ujitsu5n0d2rniture7tbol5yi3ga0l0lery3o1up4me0s3p1rden4y2b0iz3d0n2e0a1nt0ing5orge5f1g0ee3h1i0ft0s3ves2ing5l0ass3e1obal2o4m0ail3bh2o1x2n1odaddy5ld0point6f2o0dyear5g0le4p1t1v2p1q1r0ainger5phics5tis4een3ipe3ocery4up4s1t1u0cci3ge2ide2tars5ru3w1y2hair2mburg5ngout5us3bo2dfc0bank7ealth0care8lp1sinki6re1mes5iphop4samitsu7tachi5v2k0t2m1n1ockey4ldings5iday5medepot5goods5s0ense7nda3rse3spital5t0ing5t0els3mail5use3w2r1sbc3t1u0ghes5yatt3undai7ibm2cbc2e1u2d1e0ee3fm2kano4l1m0amat4db2mo0bilien9n0c1dustries8finiti5o2g1k1stitute6urance4e4t0ernational10uit4vestments10o1piranga7q1r0ish4s0maili5t0anbul7t0au2v3jaguar4va3cb2e0ep2tzt3welry6io2ll2m0p2nj2o0bs1urg4t1y2p0morgan6rs3uegos4niper7kaufen5ddi3e0rryhotels6properties14fh2g1h1i0a1ds2m1ndle4tchen5wi3m1n1oeln3matsu5sher5p0mg2n2r0d1ed3uokgroup8w1y0oto4z2la0caixa5mborghini8er3nd0rover6xess5salle5t0ino3robe5w0yer5b1c1ds2ease3clerc5frak4gal2o2xus4gbt3i0dl2fe0insurance9style7ghting6ke2lly3mited4o2ncoln4k2ve1ing5k1lc1p2oan0s3cker3us3l1ndon4tte1o3ve3pl0financial11r1s1t0d0a3u0ndbeck6xe1ury5v1y2ma0drid4if1son4keup4n0agement7go3p1rket0ing3s4riott5shalls7ttel5ba2c0kinsey7d1e0d0ia3et2lbourne7me1orial6n0u2rckmsd7g1h1iami3crosoft7l1ni1t2t0subishi9k1l0b1s2m0a2n1o0bi0le4da2e1i1m1nash3ey2ster5rmon3tgage6scow4to0rcycles9v0ie4p1q1r1s0d2t0n1r2u0seum3ic4v1w1x1y1z2na0b1goya4me2vy3ba2c1e0c1t0bank4flix4work5ustar5w0s2xt0direct7us4f0l2g0o2hk2i0co2ke1on3nja3ssan1y5l1o0kia3rton4w0ruz3tv4p1r0a1w2tt2u1yc2z2obi1server7ffice5kinawa6layan0group9lo3m0ega4ne1g1l0ine5oo2pen3racle3nge4g0anic5igins6saka4tsuka4t2vh3pa0ge2nasonic7ris2s1tners4s1y3y2ccw3e0t2f0izer5g1h0armacy6d1ilips5one2to0graphy6s4ysio5ics1tet2ures6d1n0g1k2oneer5zza4k1l0ace2y0station9umbing5s3m1n0c2ohl2ker3litie5rn2st3r0axi3ess3ime3o0d0uctions8f1gressive8mo2perties3y5tection8u0dential9s1t1ub2w0c2y2qa1pon3uebec3st5racing4dio4e0ad1lestate6tor2y4cipes5d0stone5umbrella9hab3ise0n3t2liance6n0t0als5pair3ort3ublican8st0aurant8view0s5xroth6ich0ardli6oh3l1o1p2o0cks3deo3gers4om3s0vp3u0gby3hr2n2w0e2yukyu6sa0arland6fe0ty4kura4le1on3msclub4ung5ndvik0coromant12ofi4p1rl2s1ve2xo3b0i1s2c0b1haeffler7midt4olarships8ol3ule3warz5ience5ot3d1e0arch3t2cure1ity6ek2lect4ner3rvices6ven3w1x0y3fr2g1h0angrila6rp3ell3ia1ksha5oes2p0ping5uji3w3i0lk2na1gles5te3j1k0i0n2y0pe4l0ing4m0art3ile4n0cf3o0ccer3ial4ftbank4ware6hu2lar2utions7ng1y2y2pa0ce3ort2t3r0l2s1t0ada2ples4r1tebank4farm7c0group6ockholm6rage3e3ream4udio2y3yle4u0cks3pplies3y2ort5rf1gery5zuki5v1watch4iss4x1y0dney4stems6z2tab1ipei4lk2obao4rget4tamotors6r2too4x0i3c0i2d0k2eam2ch0nology8l1masek5nnis4va3f1g1h0d1eater2re6iaa2ckets5enda4ps2res2ol4j0maxx4x2k0maxx5l1m0all4n1o0day3kyo3ols3p1ray3shiba5tal3urs3wn2yota3s3r0ade1ing4ining5vel0ers0insurance16ust3v2t1ube2i1nes3shu4v0s2w1z2ua1bank3s2g1k1nicom3versity8o2ol2ps2s1y1z2va0cations7na1guard7c1e0gas3ntures6risign5mögensberater2ung14sicherung10t2g1i0ajes4deo3g1king4llas4n1p1rgin4sa1ion4va1o3laanderen9n1odka3lvo3te1ing3o2yage5u2wales2mart4ter4ng0gou5tch0es6eather0channel12bcam3er2site5d0ding5ibo2r3f1hoswho6ien2ki2lliamhill9n0dows4e1ners6me2olterskluwer11odside6rk0s2ld3w2s1tc1f3xbox3erox4ihuan4n2xx2yz3yachts4hoo3maxun5ndex5e1odobashi7ga2kohama6u0tube6t1un3za0ppos4ra3ero3ip2m1one3uerich6w2',
	Fy =
		'ελ1υ2бг1ел3дети4ею2католик6ом3мкд2он1сква6онлайн5рг3рус2ф2сайт3рб3укр3қаз3հայ3ישראל5קום3ابوظبي5رامكو5لاردن4بحرين5جزائر5سعودية6عليان5مغرب5مارات5یران5بارت2زار4يتك3ھارت5تونس4سودان3رية5شبكة4عراق2ب2مان4فلسطين6قطر3كاثوليك6وم3مصر2ليسيا5وريتانيا7قع4همراه5پاکستان7ڀارت4कॉम3नेट3भारत0म्3ोत5संगठन5বাংলা5ভারত2ৰত4ਭਾਰਤ4ભારત4ଭାରତ4இந்தியா6லங்கை6சிங்கப்பூர்11భారత్5ಭಾರತ4ഭാരതം5ලංකා4คอม3ไทย3ລາວ3გე2みんな3アマゾン4クラウド4グーグル4コム2ストア3セール3ファッション6ポイント4世界2中信1国1國1文网3亚马逊3企业2佛山2信息2健康2八卦2公司1益2台湾1灣2商城1店1标2嘉里0大酒店5在线2大拿2天主教3娱乐2家電2广东2微博2慈善2我爱你3手机2招聘2政务1府2新加坡2闻2时尚2書籍2机构2淡马锡3游戏2澳門2点看2移动2组织机构4网址1店1站1络2联通2谷歌2购物2通販2集团2電訊盈科4飞利浦3食品2餐厅2香格里拉3港2닷넷1컴2삼성2한국2',
	qs = 'numeric',
	Js = 'ascii',
	Gs = 'alpha',
	Gn = 'asciinumeric',
	jn = 'alphanumeric',
	Ys = 'domain',
	Xd = 'emoji',
	_y = 'scheme',
	Vy = 'slashscheme',
	ks = 'whitespace';
function Wy(n, e) {
	return (n in e || (e[n] = []), e[n]);
}
function Wt(n, e, t) {
	(e[qs] && ((e[Gn] = !0), (e[jn] = !0)),
		e[Js] && ((e[Gn] = !0), (e[Gs] = !0)),
		e[Gn] && (e[jn] = !0),
		e[Gs] && (e[jn] = !0),
		e[jn] && (e[Ys] = !0),
		e[Xd] && (e[Ys] = !0));
	for (const r in e) {
		const i = Wy(r, t);
		i.indexOf(n) < 0 && i.push(n);
	}
}
function jy(n, e) {
	const t = {};
	for (const r in e) e[r].indexOf(n) >= 0 && (t[r] = !0);
	return t;
}
function we(n = null) {
	((this.j = {}), (this.jr = []), (this.jd = null), (this.t = n));
}
we.groups = {};
we.prototype = {
	accepts() {
		return !!this.t;
	},
	go(n) {
		const e = this,
			t = e.j[n];
		if (t) return t;
		for (let r = 0; r < e.jr.length; r++) {
			const i = e.jr[r][0],
				s = e.jr[r][1];
			if (s && i.test(n)) return s;
		}
		return e.jd;
	},
	has(n, e = !1) {
		return e ? n in this.j : !!this.go(n);
	},
	ta(n, e, t, r) {
		for (let i = 0; i < n.length; i++) this.tt(n[i], e, t, r);
	},
	tr(n, e, t, r) {
		r = r || we.groups;
		let i;
		return (e && e.j ? (i = e) : ((i = new we(e)), t && r && Wt(e, t, r)), this.jr.push([n, i]), i);
	},
	ts(n, e, t, r) {
		let i = this;
		const s = n.length;
		if (!s) return i;
		for (let o = 0; o < s - 1; o++) i = i.tt(n[o]);
		return i.tt(n[s - 1], e, t, r);
	},
	tt(n, e, t, r) {
		r = r || we.groups;
		const i = this;
		if (e && e.j) return ((i.j[n] = e), e);
		const s = e;
		let o,
			l = i.go(n);
		if ((l ? ((o = new we()), Object.assign(o.j, l.j), o.jr.push.apply(o.jr, l.jr), (o.jd = l.jd), (o.t = l.t)) : (o = new we()), s)) {
			if (r)
				if (o.t && typeof o.t == 'string') {
					const a = Object.assign(jy(o.t, r), t);
					Wt(s, a, r);
				} else t && Wt(s, t, r);
			o.t = s;
		}
		return ((i.j[n] = o), o);
	}
};
const L = (n, e, t, r, i) => n.ta(e, t, r, i),
	U = (n, e, t, r, i) => n.tr(e, t, r, i),
	da = (n, e, t, r, i) => n.ts(e, t, r, i),
	w = (n, e, t, r, i) => n.tt(e, t, r, i),
	it = 'WORD',
	Xs = 'UWORD',
	Qd = 'ASCIINUMERICAL',
	Zd = 'ALPHANUMERICAL',
	dr = 'LOCALHOST',
	Qs = 'TLD',
	Zs = 'UTLD',
	$r = 'SCHEME',
	kn = 'SLASH_SCHEME',
	Fo = 'NUM',
	eo = 'WS',
	_o = 'NL',
	Yn = 'OPENBRACE',
	Xn = 'CLOSEBRACE',
	ii = 'OPENBRACKET',
	si = 'CLOSEBRACKET',
	oi = 'OPENPAREN',
	li = 'CLOSEPAREN',
	ai = 'OPENANGLEBRACKET',
	ci = 'CLOSEANGLEBRACKET',
	di = 'FULLWIDTHLEFTPAREN',
	ui = 'FULLWIDTHRIGHTPAREN',
	fi = 'LEFTCORNERBRACKET',
	hi = 'RIGHTCORNERBRACKET',
	pi = 'LEFTWHITECORNERBRACKET',
	mi = 'RIGHTWHITECORNERBRACKET',
	gi = 'FULLWIDTHLESSTHAN',
	yi = 'FULLWIDTHGREATERTHAN',
	bi = 'AMPERSAND',
	ki = 'APOSTROPHE',
	xi = 'ASTERISK',
	gt = 'AT',
	wi = 'BACKSLASH',
	Si = 'BACKTICK',
	vi = 'CARET',
	kt = 'COLON',
	Vo = 'COMMA',
	Ci = 'DOLLAR',
	Ue = 'DOT',
	Mi = 'EQUALS',
	Wo = 'EXCLAMATION',
	Oe = 'HYPHEN',
	Qn = 'PERCENT',
	Ti = 'PIPE',
	Ai = 'PLUS',
	Ei = 'POUND',
	Zn = 'QUERY',
	jo = 'QUOTE',
	eu = 'FULLWIDTHMIDDLEDOT',
	Ko = 'SEMI',
	qe = 'SLASH',
	er = 'TILDE',
	Ni = 'UNDERSCORE',
	tu = 'EMOJI',
	Oi = 'SYM';
var nu = Object.freeze({
	__proto__: null,
	ALPHANUMERICAL: Zd,
	AMPERSAND: bi,
	APOSTROPHE: ki,
	ASCIINUMERICAL: Qd,
	ASTERISK: xi,
	AT: gt,
	BACKSLASH: wi,
	BACKTICK: Si,
	CARET: vi,
	CLOSEANGLEBRACKET: ci,
	CLOSEBRACE: Xn,
	CLOSEBRACKET: si,
	CLOSEPAREN: li,
	COLON: kt,
	COMMA: Vo,
	DOLLAR: Ci,
	DOT: Ue,
	EMOJI: tu,
	EQUALS: Mi,
	EXCLAMATION: Wo,
	FULLWIDTHGREATERTHAN: yi,
	FULLWIDTHLEFTPAREN: di,
	FULLWIDTHLESSTHAN: gi,
	FULLWIDTHMIDDLEDOT: eu,
	FULLWIDTHRIGHTPAREN: ui,
	HYPHEN: Oe,
	LEFTCORNERBRACKET: fi,
	LEFTWHITECORNERBRACKET: pi,
	LOCALHOST: dr,
	NL: _o,
	NUM: Fo,
	OPENANGLEBRACKET: ai,
	OPENBRACE: Yn,
	OPENBRACKET: ii,
	OPENPAREN: oi,
	PERCENT: Qn,
	PIPE: Ti,
	PLUS: Ai,
	POUND: Ei,
	QUERY: Zn,
	QUOTE: jo,
	RIGHTCORNERBRACKET: hi,
	RIGHTWHITECORNERBRACKET: mi,
	SCHEME: $r,
	SEMI: Ko,
	SLASH: qe,
	SLASH_SCHEME: kn,
	SYM: Oi,
	TILDE: er,
	TLD: Qs,
	UNDERSCORE: Ni,
	UTLD: Zs,
	UWORD: Xs,
	WORD: it,
	WS: eo
});
const nt = /[a-z]/,
	Fn = /\p{L}/u,
	xs = /\p{Emoji}/u,
	rt = /\d/,
	ws = /\s/,
	ua = '\r',
	Ss = `
`,
	Ky = '️',
	Uy = '‍',
	vs = '￼';
let Er = null,
	Nr = null;
function qy(n = []) {
	const e = {};
	we.groups = e;
	const t = new we();
	(Er == null && (Er = fa($y)),
		Nr == null && (Nr = fa(Fy)),
		w(t, "'", ki),
		w(t, '{', Yn),
		w(t, '}', Xn),
		w(t, '[', ii),
		w(t, ']', si),
		w(t, '(', oi),
		w(t, ')', li),
		w(t, '<', ai),
		w(t, '>', ci),
		w(t, '（', di),
		w(t, '）', ui),
		w(t, '「', fi),
		w(t, '」', hi),
		w(t, '『', pi),
		w(t, '』', mi),
		w(t, '＜', gi),
		w(t, '＞', yi),
		w(t, '&', bi),
		w(t, '*', xi),
		w(t, '@', gt),
		w(t, '`', Si),
		w(t, '^', vi),
		w(t, ':', kt),
		w(t, ',', Vo),
		w(t, '$', Ci),
		w(t, '.', Ue),
		w(t, '=', Mi),
		w(t, '!', Wo),
		w(t, '-', Oe),
		w(t, '%', Qn),
		w(t, '|', Ti),
		w(t, '+', Ai),
		w(t, '#', Ei),
		w(t, '?', Zn),
		w(t, '"', jo),
		w(t, '/', qe),
		w(t, ';', Ko),
		w(t, '~', er),
		w(t, '_', Ni),
		w(t, '\\', wi),
		w(t, '・', eu));
	const r = U(t, rt, Fo, { [qs]: !0 });
	U(r, rt, r);
	const i = U(r, nt, Qd, { [Gn]: !0 }),
		s = U(r, Fn, Zd, { [jn]: !0 }),
		o = U(t, nt, it, { [Js]: !0 });
	(U(o, rt, i), U(o, nt, o), U(i, rt, i), U(i, nt, i));
	const l = U(t, Fn, Xs, { [Gs]: !0 });
	(U(l, nt), U(l, rt, s), U(l, Fn, l), U(s, rt, s), U(s, nt), U(s, Fn, s));
	const a = w(t, Ss, _o, { [ks]: !0 }),
		c = w(t, ua, eo, { [ks]: !0 }),
		d = U(t, ws, eo, { [ks]: !0 });
	(w(t, vs, d), w(c, Ss, a), w(c, vs, d), U(c, ws, d), w(d, ua), w(d, Ss), U(d, ws, d), w(d, vs, d));
	const u = U(t, xs, tu, { [Xd]: !0 });
	(w(u, '#'), U(u, xs, u), w(u, Ky, u));
	const f = w(u, Uy);
	(w(f, '#'), U(f, xs, u));
	const h = [
			[nt, o],
			[rt, i]
		],
		p = [
			[nt, null],
			[Fn, l],
			[rt, s]
		];
	for (let m = 0; m < Er.length; m++) ht(t, Er[m], Qs, it, h);
	for (let m = 0; m < Nr.length; m++) ht(t, Nr[m], Zs, Xs, p);
	(Wt(Qs, { tld: !0, ascii: !0 }, e),
		Wt(Zs, { utld: !0, alpha: !0 }, e),
		ht(t, 'file', $r, it, h),
		ht(t, 'mailto', $r, it, h),
		ht(t, 'http', kn, it, h),
		ht(t, 'https', kn, it, h),
		ht(t, 'ftp', kn, it, h),
		ht(t, 'ftps', kn, it, h),
		Wt($r, { scheme: !0, ascii: !0 }, e),
		Wt(kn, { slashscheme: !0, ascii: !0 }, e),
		(n = n.sort((m, g) => (m[0] > g[0] ? 1 : -1))));
	for (let m = 0; m < n.length; m++) {
		const g = n[m][0],
			x = n[m][1] ? { [_y]: !0 } : { [Vy]: !0 };
		(g.indexOf('-') >= 0 ? (x[Ys] = !0) : nt.test(g) ? (rt.test(g) ? (x[Gn] = !0) : (x[Js] = !0)) : (x[qs] = !0), da(t, g, g, x));
	}
	return (da(t, 'localhost', dr, { ascii: !0 }), (t.jd = new we(Oi)), { start: t, tokens: Object.assign({ groups: e }, nu) });
}
function ru(n, e) {
	const t = Jy(e.replace(/[A-Z]/g, (l) => l.toLowerCase())),
		r = t.length,
		i = [];
	let s = 0,
		o = 0;
	for (; o < r; ) {
		let l = n,
			a = null,
			c = 0,
			d = null,
			u = -1,
			f = -1;
		for (; o < r && (a = l.go(t[o])); )
			((l = a), l.accepts() ? ((u = 0), (f = 0), (d = l)) : u >= 0 && ((u += t[o].length), f++), (c += t[o].length), (s += t[o].length), o++);
		((s -= u), (o -= f), (c -= u), i.push({ t: d.t, v: e.slice(s - c, s), s: s - c, e: s }));
	}
	return i;
}
function Jy(n) {
	const e = [],
		t = n.length;
	let r = 0;
	for (; r < t; ) {
		let i = n.charCodeAt(r),
			s,
			o = i < 55296 || i > 56319 || r + 1 === t || (s = n.charCodeAt(r + 1)) < 56320 || s > 57343 ? n[r] : n.slice(r, r + 2);
		(e.push(o), (r += o.length));
	}
	return e;
}
function ht(n, e, t, r, i) {
	let s;
	const o = e.length;
	for (let l = 0; l < o - 1; l++) {
		const a = e[l];
		(n.j[a] ? (s = n.j[a]) : ((s = new we(r)), (s.jr = i.slice()), (n.j[a] = s)), (n = s));
	}
	return ((s = new we(t)), (s.jr = i.slice()), (n.j[e[o - 1]] = s), s);
}
function fa(n) {
	const e = [],
		t = [];
	let r = 0,
		i = '0123456789';
	for (; r < n.length; ) {
		let s = 0;
		for (; i.indexOf(n[r + s]) >= 0; ) s++;
		if (s > 0) {
			e.push(t.join(''));
			for (let o = parseInt(n.substring(r, r + s), 10); o > 0; o--) t.pop();
			r += s;
		} else (t.push(n[r]), r++);
	}
	return e;
}
const ur = {
	defaultProtocol: 'http',
	events: null,
	format: ha,
	formatHref: ha,
	nl2br: !1,
	tagName: 'a',
	target: null,
	rel: null,
	validate: !0,
	truncate: 1 / 0,
	className: null,
	attributes: null,
	ignoreTags: [],
	render: null
};
function Uo(n, e = null) {
	let t = Object.assign({}, ur);
	n && (t = Object.assign(t, n instanceof Uo ? n.o : n));
	const r = t.ignoreTags,
		i = [];
	for (let s = 0; s < r.length; s++) i.push(r[s].toUpperCase());
	((this.o = t), e && (this.defaultRender = e), (this.ignoreTags = i));
}
Uo.prototype = {
	o: ur,
	ignoreTags: [],
	defaultRender(n) {
		return n;
	},
	check(n) {
		return this.get('validate', n.toString(), n);
	},
	get(n, e, t) {
		const r = e != null;
		let i = this.o[n];
		return (
			i &&
			(typeof i == 'object'
				? ((i = t.t in i ? i[t.t] : ur[n]), typeof i == 'function' && r && (i = i(e, t)))
				: typeof i == 'function' && r && (i = i(e, t.t, t)),
			i)
		);
	},
	getObj(n, e, t) {
		let r = this.o[n];
		return (typeof r == 'function' && e != null && (r = r(e, t.t, t)), r);
	},
	render(n) {
		const e = n.render(this);
		return (this.get('render', null, n) || this.defaultRender)(e, n.t, n);
	}
};
function ha(n) {
	return n;
}
function iu(n, e) {
	((this.t = 'token'), (this.v = n), (this.tk = e));
}
iu.prototype = {
	isLink: !1,
	toString() {
		return this.v;
	},
	toHref(n) {
		return this.toString();
	},
	toFormattedString(n) {
		const e = this.toString(),
			t = n.get('truncate', e, this),
			r = n.get('format', e, this);
		return t && r.length > t ? r.substring(0, t) + '…' : r;
	},
	toFormattedHref(n) {
		return n.get('formatHref', this.toHref(n.get('defaultProtocol')), this);
	},
	startIndex() {
		return this.tk[0].s;
	},
	endIndex() {
		return this.tk[this.tk.length - 1].e;
	},
	toObject(n = ur.defaultProtocol) {
		return { type: this.t, value: this.toString(), isLink: this.isLink, href: this.toHref(n), start: this.startIndex(), end: this.endIndex() };
	},
	toFormattedObject(n) {
		return {
			type: this.t,
			value: this.toFormattedString(n),
			isLink: this.isLink,
			href: this.toFormattedHref(n),
			start: this.startIndex(),
			end: this.endIndex()
		};
	},
	validate(n) {
		return n.get('validate', this.toString(), this);
	},
	render(n) {
		const e = this,
			t = this.toHref(n.get('defaultProtocol')),
			r = n.get('formatHref', t, this),
			i = n.get('tagName', t, e),
			s = this.toFormattedString(n),
			o = {},
			l = n.get('className', t, e),
			a = n.get('target', t, e),
			c = n.get('rel', t, e),
			d = n.getObj('attributes', t, e),
			u = n.getObj('events', t, e);
		return (
			(o.href = r),
			l && (o.class = l),
			a && (o.target = a),
			c && (o.rel = c),
			d && Object.assign(o, d),
			{ tagName: i, attributes: o, content: s, eventListeners: u }
		);
	}
};
function Ui(n, e) {
	class t extends iu {
		constructor(i, s) {
			(super(i, s), (this.t = n));
		}
	}
	for (const r in e) t.prototype[r] = e[r];
	return ((t.t = n), t);
}
const pa = Ui('email', {
		isLink: !0,
		toHref() {
			return 'mailto:' + this.toString();
		}
	}),
	ma = Ui('text'),
	Gy = Ui('nl'),
	Or = Ui('url', {
		isLink: !0,
		toHref(n = ur.defaultProtocol) {
			return this.hasProtocol() ? this.v : `${n}://${this.v}`;
		},
		hasProtocol() {
			const n = this.tk;
			return n.length >= 2 && n[0].t !== dr && n[1].t === kt;
		}
	}),
	Ne = (n) => new we(n);
function Yy({ groups: n }) {
	const e = n.domain.concat([bi, xi, gt, wi, Si, vi, Ci, Mi, Oe, Fo, Qn, Ti, Ai, Ei, qe, Oi, er, Ni]),
		t = [ki, kt, Vo, Ue, Wo, Qn, Zn, jo, Ko, ai, ci, Yn, Xn, si, ii, oi, li, di, ui, fi, hi, pi, mi, gi, yi],
		r = [bi, ki, xi, wi, Si, vi, Ci, Mi, Oe, Yn, Xn, Qn, Ti, Ai, Ei, Zn, qe, Oi, er, Ni],
		i = Ne(),
		s = w(i, er);
	(L(s, r, s), L(s, n.domain, s));
	const o = Ne(),
		l = Ne(),
		a = Ne();
	(L(i, n.domain, o), L(i, n.scheme, l), L(i, n.slashscheme, a), L(o, r, s), L(o, n.domain, o));
	const c = w(o, gt);
	(w(s, gt, c), w(l, gt, c), w(a, gt, c));
	const d = w(s, Ue);
	(L(d, r, s), L(d, n.domain, s));
	const u = Ne();
	(L(c, n.domain, u), L(u, n.domain, u));
	const f = w(u, Ue);
	L(f, n.domain, u);
	const h = Ne(pa);
	(L(f, n.tld, h), L(f, n.utld, h), w(c, dr, h));
	const p = w(u, Oe);
	(w(p, Oe, p), L(p, n.domain, u), L(h, n.domain, u), w(h, Ue, f), w(h, Oe, p));
	const m = w(h, kt);
	L(m, n.numeric, pa);
	const g = w(o, Oe),
		y = w(o, Ue);
	(w(g, Oe, g), L(g, n.domain, o), L(y, r, s), L(y, n.domain, o));
	const x = Ne(Or);
	(L(y, n.tld, x), L(y, n.utld, x), L(x, n.domain, o), L(x, r, s), w(x, Ue, y), w(x, Oe, g), w(x, gt, c));
	const M = w(x, kt),
		T = Ne(Or);
	L(M, n.numeric, T);
	const S = Ne(Or),
		A = Ne();
	(L(S, e, S), L(S, t, A), L(A, e, S), L(A, t, A), w(x, qe, S), w(T, qe, S));
	const v = w(l, kt),
		D = w(a, kt),
		P = w(D, qe),
		de = w(P, qe);
	(L(l, n.domain, o),
		w(l, Ue, y),
		w(l, Oe, g),
		L(a, n.domain, o),
		w(a, Ue, y),
		w(a, Oe, g),
		L(v, n.domain, S),
		w(v, qe, S),
		w(v, Zn, S),
		L(de, n.domain, S),
		L(de, e, S),
		w(de, qe, S));
	const ut = [
		[Yn, Xn],
		[ii, si],
		[oi, li],
		[ai, ci],
		[di, ui],
		[fi, hi],
		[pi, mi],
		[gi, yi]
	];
	for (let Pe = 0; Pe < ut.length; Pe++) {
		const [ft, ge] = ut[Pe],
			ue = w(S, ft);
		(w(A, ft, ue), w(ue, ge, S));
		const Qe = Ne(Or);
		L(ue, e, Qe);
		const I = Ne();
		(L(ue, t), L(Qe, e, Qe), L(Qe, t, I), L(I, e, Qe), L(I, t, I), w(Qe, ge, S), w(I, ge, S));
	}
	return (w(i, dr, x), w(i, _o, Gy), { start: i, tokens: nu });
}
function Xy(n, e, t) {
	let r = t.length,
		i = 0,
		s = [],
		o = [];
	for (; i < r; ) {
		let l = n,
			a = null,
			c = null,
			d = 0,
			u = null,
			f = -1;
		for (; i < r && !(a = l.go(t[i].t)); ) o.push(t[i++]);
		for (; i < r && (c = a || l.go(t[i].t)); ) ((a = null), (l = c), l.accepts() ? ((f = 0), (u = l)) : f >= 0 && f++, i++, d++);
		if (f < 0) ((i -= d), i < r && (o.push(t[i]), i++));
		else {
			(o.length > 0 && (s.push(Cs(ma, e, o)), (o = [])), (i -= f), (d -= f));
			const h = u.t,
				p = t.slice(i - d, i);
			s.push(Cs(h, e, p));
		}
	}
	return (o.length > 0 && s.push(Cs(ma, e, o)), s);
}
function Cs(n, e, t) {
	const r = t[0].s,
		i = t[t.length - 1].e,
		s = e.slice(r, i);
	return new n(s, t);
}
const Qy = (typeof console < 'u' && console && console.warn) || (() => {}),
	Zy = 'until manual call of linkify.init(). Register all schemes and plugins before invoking linkify the first time.',
	j = { scanner: null, parser: null, tokenQueue: [], pluginQueue: [], customSchemes: [], initialized: !1 };
function e0() {
	return (
		(we.groups = {}),
		(j.scanner = null),
		(j.parser = null),
		(j.tokenQueue = []),
		(j.pluginQueue = []),
		(j.customSchemes = []),
		(j.initialized = !1),
		j
	);
}
function ga(n, e = !1) {
	if ((j.initialized && Qy(`linkifyjs: already initialized - will not register custom scheme "${n}" ${Zy}`), !/^[0-9a-z]+(-[0-9a-z]+)*$/.test(n)))
		throw new Error(`linkifyjs: incorrect scheme format.
1. Must only contain digits, lowercase ASCII letters or "-"
2. Cannot start or end with "-"
3. "-" cannot repeat`);
	j.customSchemes.push([n, e]);
}
function t0() {
	j.scanner = qy(j.customSchemes);
	for (let n = 0; n < j.tokenQueue.length; n++) j.tokenQueue[n][1]({ scanner: j.scanner });
	j.parser = Yy(j.scanner.tokens);
	for (let n = 0; n < j.pluginQueue.length; n++) j.pluginQueue[n][1]({ scanner: j.scanner, parser: j.parser });
	return ((j.initialized = !0), j);
}
function qo(n) {
	return (j.initialized || t0(), Xy(j.parser.start, n, ru(j.scanner.start, n)));
}
qo.scan = ru;
function su(n, e = null, t = null) {
	if (e && typeof e == 'object') {
		if (t) throw Error(`linkifyjs: Invalid link type ${e}; must be a string`);
		((t = e), (e = null));
	}
	const r = new Uo(t),
		i = qo(n),
		s = [];
	for (let o = 0; o < i.length; o++) {
		const l = i[o];
		l.isLink && (!e || l.t === e) && r.check(l) && s.push(l.toFormattedObject(r));
	}
	return s;
}
var Jo = '[\0-   ᠎ -\u2029 　]',
	n0 = new RegExp(Jo),
	r0 = new RegExp(`${Jo}$`),
	i0 = new RegExp(Jo, 'g');
function s0(n) {
	return n.length === 1 ? n[0].isLink : n.length === 3 && n[1].isLink ? ['()', '[]'].includes(n[0].value + n[2].value) : !1;
}
function o0(n) {
	return new K({
		key: new G('autolink'),
		appendTransaction: (e, t, r) => {
			const i = e.some((c) => c.docChanged) && !t.doc.eq(r.doc),
				s = e.some((c) => c.getMeta('preventAutolink'));
			if (!i || s) return;
			const { tr: o } = r,
				l = wd(t.doc, [...e]);
			if (
				(Nd(l).forEach(({ newRange: c }) => {
					const d = dg(r.doc, c, (h) => h.isTextblock);
					let u, f;
					if (d.length > 1) ((u = d[0]), (f = r.doc.textBetween(u.pos, u.pos + u.node.nodeSize, void 0, ' ')));
					else if (d.length) {
						const h = r.doc.textBetween(c.from, c.to, ' ', ' ');
						if (!r0.test(h)) return;
						((u = d[0]), (f = r.doc.textBetween(u.pos, c.to, void 0, ' ')));
					}
					if (u && f) {
						const h = f.split(n0).filter(Boolean);
						if (h.length <= 0) return !1;
						const p = h[h.length - 1],
							m = u.pos + f.lastIndexOf(p);
						if (!p) return !1;
						const g = qo(p).map((y) => y.toObject(n.defaultProtocol));
						if (!s0(g)) return !1;
						g.filter((y) => y.isLink)
							.map((y) => ({ ...y, from: m + y.start + 1, to: m + y.end + 1 }))
							.filter((y) => (r.schema.marks.code ? !r.doc.rangeHasMark(y.from, y.to, r.schema.marks.code) : !0))
							.filter((y) => n.validate(y.value))
							.filter((y) => n.shouldAutoLink(y.value))
							.forEach((y) => {
								Po(y.from, y.to, r.doc).some((x) => x.mark.type === n.type) || o.addMark(y.from, y.to, n.type.create({ href: y.href }));
							});
					}
				}),
				!!o.steps.length)
			)
				return o;
		}
	});
}
function l0(n) {
	return new K({
		key: new G('handleClickLink'),
		props: {
			handleClick: (e, t, r) => {
				var i, s;
				if (r.button !== 0 || !e.editable) return !1;
				let o = !1;
				if ((n.enableClickSelection && (o = n.editor.commands.extendMarkRange(n.type.name)), n.openOnClick)) {
					let l = null;
					if (r.target instanceof HTMLAnchorElement) l = r.target;
					else {
						let u = r.target;
						const f = [];
						for (; u.nodeName !== 'DIV'; ) (f.push(u), (u = u.parentNode));
						l = f.find((h) => h.nodeName === 'A');
					}
					if (!l) return o;
					const a = Ed(e.state, n.type.name),
						c = (i = l?.href) != null ? i : a.href,
						d = (s = l?.target) != null ? s : a.target;
					l && c && (window.open(c, d), (o = !0));
				}
				return o;
			}
		}
	});
}
function a0(n) {
	return new K({
		key: new G('handlePasteLink'),
		props: {
			handlePaste: (e, t, r) => {
				const { shouldAutoLink: i } = n,
					{ state: s } = e,
					{ selection: o } = s,
					{ empty: l } = o;
				if (l) return !1;
				let a = '';
				r.content.forEach((d) => {
					a += d.textContent;
				});
				const c = su(a, { defaultProtocol: n.defaultProtocol }).find((d) => d.isLink && d.value === a);
				return !a || !c || (i !== void 0 && !i(c.value)) ? !1 : n.editor.commands.setMark(n.type, { href: c.href });
			}
		}
	});
}
function Ht(n, e) {
	const t = ['http', 'https', 'ftp', 'ftps', 'mailto', 'tel', 'callto', 'sms', 'cid', 'xmpp'];
	return (
		e &&
			e.forEach((r) => {
				const i = typeof r == 'string' ? r : r.scheme;
				i && t.push(i);
			}),
		!n || n.replace(i0, '').match(new RegExp(`^(?:(?:${t.join('|')}):|[^a-z]|[a-z0-9+.-]+(?:[^a-z+.-:]|$))`, 'i'))
	);
}
var ou = It.create({
		name: 'link',
		priority: 1e3,
		keepOnSplit: !1,
		exitable: !0,
		onCreate() {
			(this.options.validate &&
				!this.options.shouldAutoLink &&
				((this.options.shouldAutoLink = this.options.validate),
				console.warn('The `validate` option is deprecated. Rename to the `shouldAutoLink` option instead.')),
				this.options.protocols.forEach((n) => {
					if (typeof n == 'string') {
						ga(n);
						return;
					}
					ga(n.scheme, n.optionalSlashes);
				}));
		},
		onDestroy() {
			e0();
		},
		inclusive() {
			return this.options.autolink;
		},
		addOptions() {
			return {
				openOnClick: !0,
				enableClickSelection: !1,
				linkOnPaste: !0,
				autolink: !0,
				protocols: [],
				defaultProtocol: 'http',
				HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow', class: null },
				isAllowedUri: (n, e) => !!Ht(n, e.protocols),
				validate: (n) => !!n,
				shouldAutoLink: (n) => {
					const e = /^[a-z][a-z0-9+.-]*:\/\//i.test(n),
						t = /^[a-z][a-z0-9+.-]*:/i.test(n);
					if (e || (t && !n.includes('@'))) return !0;
					const i = (n.includes('@') ? n.split('@').pop() : n).split(/[/?#:]/)[0];
					return !(/^\d{1,3}(\.\d{1,3}){3}$/.test(i) || !/\./.test(i));
				}
			};
		},
		addAttributes() {
			return {
				href: {
					default: null,
					parseHTML(n) {
						return n.getAttribute('href');
					}
				},
				target: { default: this.options.HTMLAttributes.target },
				rel: { default: this.options.HTMLAttributes.rel },
				class: { default: this.options.HTMLAttributes.class }
			};
		},
		parseHTML() {
			return [
				{
					tag: 'a[href]',
					getAttrs: (n) => {
						const e = n.getAttribute('href');
						return !e ||
							!this.options.isAllowedUri(e, {
								defaultValidate: (t) => !!Ht(t, this.options.protocols),
								protocols: this.options.protocols,
								defaultProtocol: this.options.defaultProtocol
							})
							? !1
							: null;
					}
				}
			];
		},
		renderHTML({ HTMLAttributes: n }) {
			return this.options.isAllowedUri(n.href, {
				defaultValidate: (e) => !!Ht(e, this.options.protocols),
				protocols: this.options.protocols,
				defaultProtocol: this.options.defaultProtocol
			})
				? ['a', _(this.options.HTMLAttributes, n), 0]
				: ['a', _(this.options.HTMLAttributes, { ...n, href: '' }), 0];
		},
		markdownTokenName: 'link',
		parseMarkdown: (n, e) => e.applyMark('link', e.parseInline(n.tokens || []), { href: n.href, title: n.title || null }),
		renderMarkdown: (n, e) => {
			var t;
			const r = ((t = n.attrs) == null ? void 0 : t.href) || '';
			return `[${e.renderChildren(n)}](${r})`;
		},
		addCommands() {
			return {
				setLink:
					(n) =>
					({ chain: e }) => {
						const { href: t } = n;
						return this.options.isAllowedUri(t, {
							defaultValidate: (r) => !!Ht(r, this.options.protocols),
							protocols: this.options.protocols,
							defaultProtocol: this.options.defaultProtocol
						})
							? e().setMark(this.name, n).setMeta('preventAutolink', !0).run()
							: !1;
					},
				toggleLink:
					(n) =>
					({ chain: e }) => {
						const { href: t } = n || {};
						return t &&
							!this.options.isAllowedUri(t, {
								defaultValidate: (r) => !!Ht(r, this.options.protocols),
								protocols: this.options.protocols,
								defaultProtocol: this.options.defaultProtocol
							})
							? !1
							: e().toggleMark(this.name, n, { extendEmptyMarkRange: !0 }).setMeta('preventAutolink', !0).run();
					},
				unsetLink:
					() =>
					({ chain: n }) =>
						n().unsetMark(this.name, { extendEmptyMarkRange: !0 }).setMeta('preventAutolink', !0).run()
			};
		},
		addPasteRules() {
			return [
				Zt({
					find: (n) => {
						const e = [];
						if (n) {
							const { protocols: t, defaultProtocol: r } = this.options,
								i = su(n).filter(
									(s) => s.isLink && this.options.isAllowedUri(s.value, { defaultValidate: (o) => !!Ht(o, t), protocols: t, defaultProtocol: r })
								);
							i.length &&
								i.forEach((s) => {
									this.options.shouldAutoLink(s.value) && e.push({ text: s.value, data: { href: s.href }, index: s.start });
								});
						}
						return e;
					},
					type: this.type,
					getAttributes: (n) => {
						var e;
						return { href: (e = n.data) == null ? void 0 : e.href };
					}
				})
			];
		},
		addProseMirrorPlugins() {
			const n = [],
				{ protocols: e, defaultProtocol: t } = this.options;
			return (
				this.options.autolink &&
					n.push(
						o0({
							type: this.type,
							defaultProtocol: this.options.defaultProtocol,
							validate: (r) => this.options.isAllowedUri(r, { defaultValidate: (i) => !!Ht(i, e), protocols: e, defaultProtocol: t }),
							shouldAutoLink: this.options.shouldAutoLink
						})
					),
				n.push(
					l0({
						type: this.type,
						editor: this.editor,
						openOnClick: this.options.openOnClick === 'whenNotEditable' ? !0 : this.options.openOnClick,
						enableClickSelection: this.options.enableClickSelection
					})
				),
				this.options.linkOnPaste &&
					n.push(
						a0({ editor: this.editor, defaultProtocol: this.options.defaultProtocol, type: this.type, shouldAutoLink: this.options.shouldAutoLink })
					),
				n
			);
		}
	}),
	c0 = ou,
	d0 = Object.defineProperty,
	u0 = (n, e) => {
		for (var t in e) d0(n, t, { get: e[t], enumerable: !0 });
	},
	f0 = 'listItem',
	ya = 'textStyle',
	ba = /^\s*([-+*])\s$/,
	lu = ee.create({
		name: 'bulletList',
		addOptions() {
			return { itemTypeName: 'listItem', HTMLAttributes: {}, keepMarks: !1, keepAttributes: !1 };
		},
		group: 'block list',
		content() {
			return `${this.options.itemTypeName}+`;
		},
		parseHTML() {
			return [{ tag: 'ul' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['ul', _(this.options.HTMLAttributes, n), 0];
		},
		markdownTokenName: 'list',
		parseMarkdown: (n, e) => (n.type !== 'list' || n.ordered ? [] : { type: 'bulletList', content: n.items ? e.parseChildren(n.items) : [] }),
		renderMarkdown: (n, e) =>
			n.content
				? e.renderChildren(
						n.content,
						`
`
					)
				: '',
		markdownOptions: { indentsContent: !0 },
		addCommands() {
			return {
				toggleBulletList:
					() =>
					({ commands: n, chain: e }) =>
						this.options.keepAttributes
							? e().toggleList(this.name, this.options.itemTypeName, this.options.keepMarks).updateAttributes(f0, this.editor.getAttributes(ya)).run()
							: n.toggleList(this.name, this.options.itemTypeName, this.options.keepMarks)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-Shift-8': () => this.editor.commands.toggleBulletList() };
		},
		addInputRules() {
			let n = Nn({ find: ba, type: this.type });
			return (
				(this.options.keepMarks || this.options.keepAttributes) &&
					(n = Nn({
						find: ba,
						type: this.type,
						keepMarks: this.options.keepMarks,
						keepAttributes: this.options.keepAttributes,
						getAttributes: () => this.editor.getAttributes(ya),
						editor: this.editor
					})),
				[n]
			);
		}
	}),
	au = ee.create({
		name: 'listItem',
		addOptions() {
			return { HTMLAttributes: {}, bulletListTypeName: 'bulletList', orderedListTypeName: 'orderedList' };
		},
		content: 'paragraph block*',
		defining: !0,
		parseHTML() {
			return [{ tag: 'li' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['li', _(this.options.HTMLAttributes, n), 0];
		},
		markdownTokenName: 'list_item',
		parseMarkdown: (n, e) => {
			if (n.type !== 'list_item') return [];
			let t = [];
			if (n.tokens && n.tokens.length > 0)
				if (n.tokens.some((i) => i.type === 'paragraph')) t = e.parseChildren(n.tokens);
				else {
					const i = n.tokens[0];
					if (i && i.type === 'text' && i.tokens && i.tokens.length > 0) {
						if (((t = [{ type: 'paragraph', content: e.parseInline(i.tokens) }]), n.tokens.length > 1)) {
							const o = n.tokens.slice(1),
								l = e.parseChildren(o);
							t.push(...l);
						}
					} else t = e.parseChildren(n.tokens);
				}
			return (t.length === 0 && (t = [{ type: 'paragraph', content: [] }]), { type: 'listItem', content: t });
		},
		renderMarkdown: (n, e, t) =>
			$o(n, e, (r) => (r.parentType === 'bulletList' ? '- ' : r.parentType === 'orderedList' ? `${r.index + 1}. ` : '- '), t),
		addKeyboardShortcuts() {
			return {
				Enter: () => this.editor.commands.splitListItem(this.name),
				Tab: () => this.editor.commands.sinkListItem(this.name),
				'Shift-Tab': () => this.editor.commands.liftListItem(this.name)
			};
		}
	}),
	h0 = {};
u0(h0, {
	findListItemPos: () => gr,
	getNextListDepth: () => Go,
	handleBackspace: () => to,
	handleDelete: () => no,
	hasListBefore: () => cu,
	hasListItemAfter: () => p0,
	hasListItemBefore: () => du,
	listItemHasSubList: () => uu,
	nextListIsDeeper: () => fu,
	nextListIsHigher: () => hu
});
var gr = (n, e) => {
		const { $from: t } = e.selection,
			r = X(n, e.schema);
		let i = null,
			s = t.depth,
			o = t.pos,
			l = null;
		for (; s > 0 && l === null; ) ((i = t.node(s)), i.type === r ? (l = s) : ((s -= 1), (o -= 1)));
		return l === null ? null : { $pos: e.doc.resolve(o), depth: l };
	},
	Go = (n, e) => {
		const t = gr(n, e);
		if (!t) return !1;
		const [, r] = kg(e, n, t.$pos.pos + 4);
		return r;
	},
	cu = (n, e, t) => {
		const { $anchor: r } = n.selection,
			i = Math.max(0, r.pos - 2),
			s = n.doc.resolve(i).node();
		return !(!s || !t.includes(s.type.name));
	},
	du = (n, e) => {
		var t;
		const { $anchor: r } = e.selection,
			i = e.doc.resolve(r.pos - 2);
		return !(i.index() === 0 || ((t = i.nodeBefore) == null ? void 0 : t.type.name) !== n);
	},
	uu = (n, e, t) => {
		if (!t) return !1;
		const r = X(n, e.schema);
		let i = !1;
		return (
			t.descendants((s) => {
				s.type === r && (i = !0);
			}),
			i
		);
	},
	to = (n, e, t) => {
		if (n.commands.undoInputRule()) return !0;
		if (n.state.selection.from !== n.state.selection.to) return !1;
		if (!Nt(n.state, e) && cu(n.state, e, t)) {
			const { $anchor: l } = n.state.selection,
				a = n.state.doc.resolve(l.before() - 1),
				c = [];
			a.node().descendants((f, h) => {
				f.type.name === e && c.push({ node: f, pos: h });
			});
			const d = c.at(-1);
			if (!d) return !1;
			const u = n.state.doc.resolve(a.start() + d.pos + 1);
			return n
				.chain()
				.cut({ from: l.start() - 1, to: l.end() + 1 }, u.end())
				.joinForward()
				.run();
		}
		if (!Nt(n.state, e) || !vg(n.state)) return !1;
		const r = gr(e, n.state);
		if (!r) return !1;
		const s = n.state.doc.resolve(r.$pos.pos - 2).node(r.depth),
			o = uu(e, n.state, s);
		return du(e, n.state) && !o ? n.commands.joinItemBackward() : n.chain().liftListItem(e).run();
	},
	fu = (n, e) => {
		const t = Go(n, e),
			r = gr(n, e);
		return !r || !t ? !1 : t > r.depth;
	},
	hu = (n, e) => {
		const t = Go(n, e),
			r = gr(n, e);
		return !r || !t ? !1 : t < r.depth;
	},
	no = (n, e) => {
		if (!Nt(n.state, e) || !Sg(n.state, e)) return !1;
		const { selection: t } = n.state,
			{ $from: r, $to: i } = t;
		return !t.empty && r.sameParent(i)
			? !1
			: fu(e, n.state)
				? n
						.chain()
						.focus(n.state.selection.from + 4)
						.lift(e)
						.joinBackward()
						.run()
				: hu(e, n.state)
					? n.chain().joinForward().joinBackward().run()
					: n.commands.joinItemForward();
	},
	p0 = (n, e) => {
		var t;
		const { $anchor: r } = e.selection,
			i = e.doc.resolve(r.pos - r.parentOffset - 2);
		return !(i.index() === i.parent.childCount - 1 || ((t = i.nodeAfter) == null ? void 0 : t.type.name) !== n);
	},
	pu = B.create({
		name: 'listKeymap',
		addOptions() {
			return {
				listTypes: [
					{ itemName: 'listItem', wrapperNames: ['bulletList', 'orderedList'] },
					{ itemName: 'taskItem', wrapperNames: ['taskList'] }
				]
			};
		},
		addKeyboardShortcuts() {
			return {
				Delete: ({ editor: n }) => {
					let e = !1;
					return (
						this.options.listTypes.forEach(({ itemName: t }) => {
							n.state.schema.nodes[t] !== void 0 && no(n, t) && (e = !0);
						}),
						e
					);
				},
				'Mod-Delete': ({ editor: n }) => {
					let e = !1;
					return (
						this.options.listTypes.forEach(({ itemName: t }) => {
							n.state.schema.nodes[t] !== void 0 && no(n, t) && (e = !0);
						}),
						e
					);
				},
				Backspace: ({ editor: n }) => {
					let e = !1;
					return (
						this.options.listTypes.forEach(({ itemName: t, wrapperNames: r }) => {
							n.state.schema.nodes[t] !== void 0 && to(n, t, r) && (e = !0);
						}),
						e
					);
				},
				'Mod-Backspace': ({ editor: n }) => {
					let e = !1;
					return (
						this.options.listTypes.forEach(({ itemName: t, wrapperNames: r }) => {
							n.state.schema.nodes[t] !== void 0 && to(n, t, r) && (e = !0);
						}),
						e
					);
				}
			};
		}
	}),
	ka = /^(\s*)(\d+)\.\s+(.*)$/,
	m0 = /^\s/;
function g0(n) {
	const e = [];
	let t = 0,
		r = 0;
	for (; t < n.length; ) {
		const i = n[t],
			s = i.match(ka);
		if (!s) break;
		const [, o, l, a] = s,
			c = o.length;
		let d = a,
			u = t + 1;
		const f = [i];
		for (; u < n.length; ) {
			const h = n[u];
			if (h.match(ka)) break;
			if (h.trim() === '')
				(f.push(h),
					(d += `
`),
					(u += 1));
			else if (h.match(m0))
				(f.push(h),
					(d += `
${h.slice(c + 2)}`),
					(u += 1));
			else break;
		}
		(e.push({
			indent: c,
			number: parseInt(l, 10),
			content: d.trim(),
			raw: f.join(`
`)
		}),
			(r = u),
			(t = u));
	}
	return [e, r];
}
function mu(n, e, t) {
	var r;
	const i = [];
	let s = 0;
	for (; s < n.length; ) {
		const o = n[s];
		if (o.indent === e) {
			const l = o.content.split(`
`),
				a = ((r = l[0]) == null ? void 0 : r.trim()) || '',
				c = [];
			a && c.push({ type: 'paragraph', raw: a, tokens: t.inlineTokens(a) });
			const d = l
				.slice(1)
				.join(
					`
`
				)
				.trim();
			if (d) {
				const h = t.blockTokens(d);
				c.push(...h);
			}
			let u = s + 1;
			const f = [];
			for (; u < n.length && n[u].indent > e; ) (f.push(n[u]), (u += 1));
			if (f.length > 0) {
				const h = Math.min(...f.map((m) => m.indent)),
					p = mu(f, h, t);
				c.push({
					type: 'list',
					ordered: !0,
					start: f[0].number,
					items: p,
					raw: f.map((m) => m.raw).join(`
`)
				});
			}
			(i.push({ type: 'list_item', raw: o.raw, tokens: c }), (s = u));
		} else s += 1;
	}
	return i;
}
function y0(n, e) {
	return n.map((t) => {
		if (t.type !== 'list_item') return e.parseChildren([t])[0];
		const r = [];
		return (
			t.tokens &&
				t.tokens.length > 0 &&
				t.tokens.forEach((i) => {
					if (i.type === 'paragraph' || i.type === 'list' || i.type === 'blockquote' || i.type === 'code') r.push(...e.parseChildren([i]));
					else if (i.type === 'text' && i.tokens) {
						const s = e.parseChildren([i]);
						r.push({ type: 'paragraph', content: s });
					} else {
						const s = e.parseChildren([i]);
						s.length > 0 && r.push(...s);
					}
				}),
			{ type: 'listItem', content: r }
		);
	});
}
var b0 = 'listItem',
	xa = 'textStyle',
	wa = /^(\d+)\.\s$/,
	gu = ee.create({
		name: 'orderedList',
		addOptions() {
			return { itemTypeName: 'listItem', HTMLAttributes: {}, keepMarks: !1, keepAttributes: !1 };
		},
		group: 'block list',
		content() {
			return `${this.options.itemTypeName}+`;
		},
		addAttributes() {
			return {
				start: { default: 1, parseHTML: (n) => (n.hasAttribute('start') ? parseInt(n.getAttribute('start') || '', 10) : 1) },
				type: { default: null, parseHTML: (n) => n.getAttribute('type') }
			};
		},
		parseHTML() {
			return [{ tag: 'ol' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			const { start: e, ...t } = n;
			return e === 1 ? ['ol', _(this.options.HTMLAttributes, t), 0] : ['ol', _(this.options.HTMLAttributes, n), 0];
		},
		markdownTokenName: 'list',
		parseMarkdown: (n, e) => {
			if (n.type !== 'list' || !n.ordered) return [];
			const t = n.start || 1,
				r = n.items ? y0(n.items, e) : [];
			return t !== 1 ? { type: 'orderedList', attrs: { start: t }, content: r } : { type: 'orderedList', content: r };
		},
		renderMarkdown: (n, e) =>
			n.content
				? e.renderChildren(
						n.content,
						`
`
					)
				: '',
		markdownTokenizer: {
			name: 'orderedList',
			level: 'block',
			start: (n) => {
				const e = n.match(/^(\s*)(\d+)\.\s+/),
					t = e?.index;
				return t !== void 0 ? t : -1;
			},
			tokenize: (n, e, t) => {
				var r;
				const i = n.split(`
`),
					[s, o] = g0(i);
				if (s.length === 0) return;
				const l = mu(s, 0, t);
				return l.length === 0
					? void 0
					: {
							type: 'list',
							ordered: !0,
							start: ((r = s[0]) == null ? void 0 : r.number) || 1,
							items: l,
							raw: i.slice(0, o).join(`
`)
						};
			}
		},
		markdownOptions: { indentsContent: !0 },
		addCommands() {
			return {
				toggleOrderedList:
					() =>
					({ commands: n, chain: e }) =>
						this.options.keepAttributes
							? e().toggleList(this.name, this.options.itemTypeName, this.options.keepMarks).updateAttributes(b0, this.editor.getAttributes(xa)).run()
							: n.toggleList(this.name, this.options.itemTypeName, this.options.keepMarks)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-Shift-7': () => this.editor.commands.toggleOrderedList() };
		},
		addInputRules() {
			let n = Nn({
				find: wa,
				type: this.type,
				getAttributes: (e) => ({ start: +e[1] }),
				joinPredicate: (e, t) => t.childCount + t.attrs.start === +e[1]
			});
			return (
				(this.options.keepMarks || this.options.keepAttributes) &&
					(n = Nn({
						find: wa,
						type: this.type,
						keepMarks: this.options.keepMarks,
						keepAttributes: this.options.keepAttributes,
						getAttributes: (e) => ({ start: +e[1], ...this.editor.getAttributes(xa) }),
						joinPredicate: (e, t) => t.childCount + t.attrs.start === +e[1],
						editor: this.editor
					})),
				[n]
			);
		}
	}),
	k0 = /^\s*(\[([( |x])?\])\s$/,
	x0 = ee.create({
		name: 'taskItem',
		addOptions() {
			return { nested: !1, HTMLAttributes: {}, taskListTypeName: 'taskList', a11y: void 0 };
		},
		content() {
			return this.options.nested ? 'paragraph block*' : 'paragraph+';
		},
		defining: !0,
		addAttributes() {
			return {
				checked: {
					default: !1,
					keepOnSplit: !1,
					parseHTML: (n) => {
						const e = n.getAttribute('data-checked');
						return e === '' || e === 'true';
					},
					renderHTML: (n) => ({ 'data-checked': n.checked })
				}
			};
		},
		parseHTML() {
			return [{ tag: `li[data-type="${this.name}"]`, priority: 51 }];
		},
		renderHTML({ node: n, HTMLAttributes: e }) {
			return [
				'li',
				_(this.options.HTMLAttributes, e, { 'data-type': this.name }),
				['label', ['input', { type: 'checkbox', checked: n.attrs.checked ? 'checked' : null }], ['span']],
				['div', 0]
			];
		},
		parseMarkdown: (n, e) => {
			const t = [];
			if (
				(n.tokens && n.tokens.length > 0
					? t.push(e.createNode('paragraph', {}, e.parseInline(n.tokens)))
					: n.text
						? t.push(e.createNode('paragraph', {}, [e.createNode('text', { text: n.text })]))
						: t.push(e.createNode('paragraph', {}, [])),
				n.nestedTokens && n.nestedTokens.length > 0)
			) {
				const r = e.parseChildren(n.nestedTokens);
				t.push(...r);
			}
			return e.createNode('taskItem', { checked: n.checked || !1 }, t);
		},
		renderMarkdown: (n, e) => {
			var t;
			const i = `- [${(t = n.attrs) != null && t.checked ? 'x' : ' '}] `;
			return $o(n, e, i);
		},
		addKeyboardShortcuts() {
			const n = { Enter: () => this.editor.commands.splitListItem(this.name), 'Shift-Tab': () => this.editor.commands.liftListItem(this.name) };
			return this.options.nested ? { ...n, Tab: () => this.editor.commands.sinkListItem(this.name) } : n;
		},
		addNodeView() {
			return ({ node: n, HTMLAttributes: e, getPos: t, editor: r }) => {
				const i = document.createElement('li'),
					s = document.createElement('label'),
					o = document.createElement('span'),
					l = document.createElement('input'),
					a = document.createElement('div'),
					c = (u) => {
						var f, h;
						l.ariaLabel =
							((h = (f = this.options.a11y) == null ? void 0 : f.checkboxLabel) == null ? void 0 : h.call(f, u, l.checked)) ||
							`Task item checkbox for ${u.textContent || 'empty task item'}`;
					};
				(c(n),
					(s.contentEditable = 'false'),
					(l.type = 'checkbox'),
					l.addEventListener('mousedown', (u) => u.preventDefault()),
					l.addEventListener('change', (u) => {
						if (!r.isEditable && !this.options.onReadOnlyChecked) {
							l.checked = !l.checked;
							return;
						}
						const { checked: f } = u.target;
						(r.isEditable &&
							typeof t == 'function' &&
							r
								.chain()
								.focus(void 0, { scrollIntoView: !1 })
								.command(({ tr: h }) => {
									const p = t();
									if (typeof p != 'number') return !1;
									const m = h.doc.nodeAt(p);
									return (h.setNodeMarkup(p, void 0, { ...m?.attrs, checked: f }), !0);
								})
								.run(),
							!r.isEditable && this.options.onReadOnlyChecked && (this.options.onReadOnlyChecked(n, f) || (l.checked = !l.checked)));
					}),
					Object.entries(this.options.HTMLAttributes).forEach(([u, f]) => {
						i.setAttribute(u, f);
					}),
					(i.dataset.checked = n.attrs.checked),
					(l.checked = n.attrs.checked),
					s.append(l, o),
					i.append(s, a),
					Object.entries(e).forEach(([u, f]) => {
						i.setAttribute(u, f);
					}));
				let d = new Set(Object.keys(e));
				return {
					dom: i,
					contentDOM: a,
					update: (u) => {
						if (u.type !== this.type) return !1;
						((i.dataset.checked = u.attrs.checked), (l.checked = u.attrs.checked), c(u));
						const f = r.extensionManager.attributes,
							h = cr(u, f),
							p = new Set(Object.keys(h)),
							m = this.options.HTMLAttributes;
						return (
							d.forEach((g) => {
								p.has(g) || (g in m ? i.setAttribute(g, m[g]) : i.removeAttribute(g));
							}),
							Object.entries(h).forEach(([g, y]) => {
								y == null ? (g in m ? i.setAttribute(g, m[g]) : i.removeAttribute(g)) : i.setAttribute(g, y);
							}),
							(d = p),
							!0
						);
					}
				};
			};
		},
		addInputRules() {
			return [Nn({ find: k0, type: this.type, getAttributes: (n) => ({ checked: n[n.length - 1] === 'x' }) })];
		}
	}),
	w0 = ee.create({
		name: 'taskList',
		addOptions() {
			return { itemTypeName: 'taskItem', HTMLAttributes: {} };
		},
		group: 'block list',
		content() {
			return `${this.options.itemTypeName}+`;
		},
		parseHTML() {
			return [{ tag: `ul[data-type="${this.name}"]`, priority: 51 }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['ul', _(this.options.HTMLAttributes, n, { 'data-type': this.name }), 0];
		},
		parseMarkdown: (n, e) => e.createNode('taskList', {}, e.parseChildren(n.items || [])),
		renderMarkdown: (n, e) =>
			n.content
				? e.renderChildren(
						n.content,
						`
`
					)
				: '',
		markdownTokenizer: {
			name: 'taskList',
			level: 'block',
			start(n) {
				var e;
				const t = (e = n.match(/^\s*[-+*]\s+\[([ xX])\]\s+/)) == null ? void 0 : e.index;
				return t !== void 0 ? t : -1;
			},
			tokenize(n, e, t) {
				const r = (s) => {
						const o = Us(
							s,
							{
								itemPattern: /^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/,
								extractItemData: (l) => ({ indentLevel: l[1].length, mainContent: l[4], checked: l[3].toLowerCase() === 'x' }),
								createToken: (l, a) => ({
									type: 'taskItem',
									raw: '',
									mainContent: l.mainContent,
									indentLevel: l.indentLevel,
									checked: l.checked,
									text: l.mainContent,
									tokens: t.inlineTokens(l.mainContent),
									nestedTokens: a
								}),
								customNestedParser: r
							},
							t
						);
						return o ? [{ type: 'taskList', raw: o.raw, items: o.items }] : t.blockTokens(s);
					},
					i = Us(
						n,
						{
							itemPattern: /^(\s*)([-+*])\s+\[([ xX])\]\s+(.*)$/,
							extractItemData: (s) => ({ indentLevel: s[1].length, mainContent: s[4], checked: s[3].toLowerCase() === 'x' }),
							createToken: (s, o) => ({
								type: 'taskItem',
								raw: '',
								mainContent: s.mainContent,
								indentLevel: s.indentLevel,
								checked: s.checked,
								text: s.mainContent,
								tokens: t.inlineTokens(s.mainContent),
								nestedTokens: o
							}),
							customNestedParser: r
						},
						t
					);
				if (i) return { type: 'taskList', raw: i.raw, items: i.items };
			}
		},
		markdownOptions: { indentsContent: !0 },
		addCommands() {
			return {
				toggleTaskList:
					() =>
					({ commands: n }) =>
						n.toggleList(this.name, this.options.itemTypeName)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-Shift-9': () => this.editor.commands.toggleTaskList() };
		}
	});
B.create({
	name: 'listKit',
	addExtensions() {
		const n = [];
		return (
			this.options.bulletList !== !1 && n.push(lu.configure(this.options.bulletList)),
			this.options.listItem !== !1 && n.push(au.configure(this.options.listItem)),
			this.options.listKeymap !== !1 && n.push(pu.configure(this.options.listKeymap)),
			this.options.orderedList !== !1 && n.push(gu.configure(this.options.orderedList)),
			this.options.taskItem !== !1 && n.push(x0.configure(this.options.taskItem)),
			this.options.taskList !== !1 && n.push(w0.configure(this.options.taskList)),
			n
		);
	}
});
var S0 = ee.create({
		name: 'paragraph',
		priority: 1e3,
		addOptions() {
			return { HTMLAttributes: {} };
		},
		group: 'block',
		content: 'inline*',
		parseHTML() {
			return [{ tag: 'p' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['p', _(this.options.HTMLAttributes, n), 0];
		},
		parseMarkdown: (n, e) => {
			const t = n.tokens || [];
			return t.length === 1 && t[0].type === 'image' ? e.parseChildren([t[0]]) : e.createNode('paragraph', void 0, e.parseInline(t));
		},
		renderMarkdown: (n, e) => (!n || !Array.isArray(n.content) ? '' : e.renderChildren(n.content)),
		addCommands() {
			return {
				setParagraph:
					() =>
					({ commands: n }) =>
						n.setNode(this.name)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-Alt-0': () => this.editor.commands.setParagraph() };
		}
	}),
	v0 = /(?:^|\s)(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))$/,
	C0 = /(?:^|\s)(~~(?!\s+~~)((?:[^~]+))~~(?!\s+~~))/g,
	M0 = It.create({
		name: 'strike',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		parseHTML() {
			return [
				{ tag: 's' },
				{ tag: 'del' },
				{ tag: 'strike' },
				{ style: 'text-decoration', consuming: !1, getAttrs: (n) => (n.includes('line-through') ? {} : !1) }
			];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['s', _(this.options.HTMLAttributes, n), 0];
		},
		markdownTokenName: 'del',
		parseMarkdown: (n, e) => e.applyMark('strike', e.parseInline(n.tokens || [])),
		renderMarkdown: (n, e) => `~~${e.renderChildren(n)}~~`,
		addCommands() {
			return {
				setStrike:
					() =>
					({ commands: n }) =>
						n.setMark(this.name),
				toggleStrike:
					() =>
					({ commands: n }) =>
						n.toggleMark(this.name),
				unsetStrike:
					() =>
					({ commands: n }) =>
						n.unsetMark(this.name)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-Shift-s': () => this.editor.commands.toggleStrike() };
		},
		addInputRules() {
			return [En({ find: v0, type: this.type })];
		},
		addPasteRules() {
			return [Zt({ find: C0, type: this.type })];
		}
	}),
	T0 = ee.create({
		name: 'text',
		group: 'inline',
		parseMarkdown: (n) => ({ type: 'text', text: n.text || '' }),
		renderMarkdown: (n) => n.text || ''
	}),
	yu = It.create({
		name: 'underline',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		parseHTML() {
			return [{ tag: 'u' }, { style: 'text-decoration', consuming: !1, getAttrs: (n) => (n.includes('underline') ? {} : !1) }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['u', _(this.options.HTMLAttributes, n), 0];
		},
		parseMarkdown(n, e) {
			return e.applyMark(this.name || 'underline', e.parseInline(n.tokens || []));
		},
		renderMarkdown(n, e) {
			return `++${e.renderChildren(n)}++`;
		},
		markdownTokenizer: {
			name: 'underline',
			level: 'inline',
			start(n) {
				return n.indexOf('++');
			},
			tokenize(n, e, t) {
				const i = /^(\+\+)([\s\S]+?)(\+\+)/.exec(n);
				if (!i) return;
				const s = i[2].trim();
				return { type: 'underline', raw: i[0], text: s, tokens: t.inlineTokens(s) };
			}
		},
		addCommands() {
			return {
				setUnderline:
					() =>
					({ commands: n }) =>
						n.setMark(this.name),
				toggleUnderline:
					() =>
					({ commands: n }) =>
						n.toggleMark(this.name),
				unsetUnderline:
					() =>
					({ commands: n }) =>
						n.unsetMark(this.name)
			};
		},
		addKeyboardShortcuts() {
			return { 'Mod-u': () => this.editor.commands.toggleUnderline(), 'Mod-U': () => this.editor.commands.toggleUnderline() };
		}
	});
function A0(n = {}) {
	return new K({
		view(e) {
			return new E0(e, n);
		}
	});
}
class E0 {
	constructor(e, t) {
		var r;
		((this.editorView = e),
			(this.cursorPos = null),
			(this.element = null),
			(this.timeout = -1),
			(this.width = (r = t.width) !== null && r !== void 0 ? r : 1),
			(this.color = t.color === !1 ? void 0 : t.color || 'black'),
			(this.class = t.class),
			(this.handlers = ['dragover', 'dragend', 'drop', 'dragleave'].map((i) => {
				let s = (o) => {
					this[i](o);
				};
				return (e.dom.addEventListener(i, s), { name: i, handler: s });
			})));
	}
	destroy() {
		this.handlers.forEach(({ name: e, handler: t }) => this.editorView.dom.removeEventListener(e, t));
	}
	update(e, t) {
		this.cursorPos != null && t.doc != e.state.doc && (this.cursorPos > e.state.doc.content.size ? this.setCursor(null) : this.updateOverlay());
	}
	setCursor(e) {
		e != this.cursorPos &&
			((this.cursorPos = e), e == null ? (this.element.parentNode.removeChild(this.element), (this.element = null)) : this.updateOverlay());
	}
	updateOverlay() {
		let e = this.editorView.state.doc.resolve(this.cursorPos),
			t = !e.parent.inlineContent,
			r,
			i = this.editorView.dom,
			s = i.getBoundingClientRect(),
			o = s.width / i.offsetWidth,
			l = s.height / i.offsetHeight;
		if (t) {
			let u = e.nodeBefore,
				f = e.nodeAfter;
			if (u || f) {
				let h = this.editorView.nodeDOM(this.cursorPos - (u ? u.nodeSize : 0));
				if (h) {
					let p = h.getBoundingClientRect(),
						m = u ? p.bottom : p.top;
					u && f && (m = (m + this.editorView.nodeDOM(this.cursorPos).getBoundingClientRect().top) / 2);
					let g = (this.width / 2) * l;
					r = { left: p.left, right: p.right, top: m - g, bottom: m + g };
				}
			}
		}
		if (!r) {
			let u = this.editorView.coordsAtPos(this.cursorPos),
				f = (this.width / 2) * o;
			r = { left: u.left - f, right: u.left + f, top: u.top, bottom: u.bottom };
		}
		let a = this.editorView.dom.offsetParent;
		(this.element ||
			((this.element = a.appendChild(document.createElement('div'))),
			this.class && (this.element.className = this.class),
			(this.element.style.cssText = 'position: absolute; z-index: 50; pointer-events: none;'),
			this.color && (this.element.style.backgroundColor = this.color)),
			this.element.classList.toggle('prosemirror-dropcursor-block', t),
			this.element.classList.toggle('prosemirror-dropcursor-inline', !t));
		let c, d;
		if (!a || (a == document.body && getComputedStyle(a).position == 'static')) ((c = -pageXOffset), (d = -pageYOffset));
		else {
			let u = a.getBoundingClientRect(),
				f = u.width / a.offsetWidth,
				h = u.height / a.offsetHeight;
			((c = u.left - a.scrollLeft * f), (d = u.top - a.scrollTop * h));
		}
		((this.element.style.left = (r.left - c) / o + 'px'),
			(this.element.style.top = (r.top - d) / l + 'px'),
			(this.element.style.width = (r.right - r.left) / o + 'px'),
			(this.element.style.height = (r.bottom - r.top) / l + 'px'));
	}
	scheduleRemoval(e) {
		(clearTimeout(this.timeout), (this.timeout = setTimeout(() => this.setCursor(null), e)));
	}
	dragover(e) {
		if (!this.editorView.editable) return;
		let t = this.editorView.posAtCoords({ left: e.clientX, top: e.clientY }),
			r = t && t.inside >= 0 && this.editorView.state.doc.nodeAt(t.inside),
			i = r && r.type.spec.disableDropCursor,
			s = typeof i == 'function' ? i(this.editorView, t, e) : i;
		if (t && !s) {
			let o = t.pos;
			if (this.editorView.dragging && this.editorView.dragging.slice) {
				let l = pc(this.editorView.state.doc, o, this.editorView.dragging.slice);
				l != null && (o = l);
			}
			(this.setCursor(o), this.scheduleRemoval(5e3));
		}
	}
	dragend() {
		this.scheduleRemoval(20);
	}
	drop() {
		this.scheduleRemoval(20);
	}
	dragleave(e) {
		this.editorView.dom.contains(e.relatedTarget) || this.setCursor(null);
	}
}
class q extends R {
	constructor(e) {
		super(e, e);
	}
	map(e, t) {
		let r = e.resolve(t.map(this.head));
		return q.valid(r) ? new q(r) : R.near(r);
	}
	content() {
		return C.empty;
	}
	eq(e) {
		return e instanceof q && e.head == this.head;
	}
	toJSON() {
		return { type: 'gapcursor', pos: this.head };
	}
	static fromJSON(e, t) {
		if (typeof t.pos != 'number') throw new RangeError('Invalid input for GapCursor.fromJSON');
		return new q(e.resolve(t.pos));
	}
	getBookmark() {
		return new Yo(this.anchor);
	}
	static valid(e) {
		let t = e.parent;
		if (t.isTextblock || !N0(e) || !O0(e)) return !1;
		let r = t.type.spec.allowGapCursor;
		if (r != null) return r;
		let i = t.contentMatchAt(e.index()).defaultType;
		return i && i.isTextblock;
	}
	static findGapCursorFrom(e, t, r = !1) {
		e: for (;;) {
			if (!r && q.valid(e)) return e;
			let i = e.pos,
				s = null;
			for (let o = e.depth; ; o--) {
				let l = e.node(o);
				if (t > 0 ? e.indexAfter(o) < l.childCount : e.index(o) > 0) {
					s = l.child(t > 0 ? e.indexAfter(o) : e.index(o) - 1);
					break;
				} else if (o == 0) return null;
				i += t;
				let a = e.doc.resolve(i);
				if (q.valid(a)) return a;
			}
			for (;;) {
				let o = t > 0 ? s.firstChild : s.lastChild;
				if (!o) {
					if (s.isAtom && !s.isText && !N.isSelectable(s)) {
						((e = e.doc.resolve(i + s.nodeSize * t)), (r = !1));
						continue e;
					}
					break;
				}
				((s = o), (i += t));
				let l = e.doc.resolve(i);
				if (q.valid(l)) return l;
			}
			return null;
		}
	}
}
q.prototype.visible = !1;
q.findFrom = q.findGapCursorFrom;
R.jsonID('gapcursor', q);
class Yo {
	constructor(e) {
		this.pos = e;
	}
	map(e) {
		return new Yo(e.map(this.pos));
	}
	resolve(e) {
		let t = e.resolve(this.pos);
		return q.valid(t) ? new q(t) : R.near(t);
	}
}
function bu(n) {
	return n.isAtom || n.spec.isolating || n.spec.createGapCursor;
}
function N0(n) {
	for (let e = n.depth; e >= 0; e--) {
		let t = n.index(e),
			r = n.node(e);
		if (t == 0) {
			if (r.type.spec.isolating) return !0;
			continue;
		}
		for (let i = r.child(t - 1); ; i = i.lastChild) {
			if ((i.childCount == 0 && !i.inlineContent) || bu(i.type)) return !0;
			if (i.inlineContent) return !1;
		}
	}
	return !0;
}
function O0(n) {
	for (let e = n.depth; e >= 0; e--) {
		let t = n.indexAfter(e),
			r = n.node(e);
		if (t == r.childCount) {
			if (r.type.spec.isolating) return !0;
			continue;
		}
		for (let i = r.child(t); ; i = i.firstChild) {
			if ((i.childCount == 0 && !i.inlineContent) || bu(i.type)) return !0;
			if (i.inlineContent) return !1;
		}
	}
	return !0;
}
function R0() {
	return new K({
		props: {
			decorations: P0,
			createSelectionBetween(n, e, t) {
				return e.pos == t.pos && q.valid(t) ? new q(t) : null;
			},
			handleClick: D0,
			handleKeyDown: I0,
			handleDOMEvents: { beforeinput: L0 }
		}
	});
}
const I0 = No({ ArrowLeft: Rr('horiz', -1), ArrowRight: Rr('horiz', 1), ArrowUp: Rr('vert', -1), ArrowDown: Rr('vert', 1) });
function Rr(n, e) {
	const t = n == 'vert' ? (e > 0 ? 'down' : 'up') : e > 0 ? 'right' : 'left';
	return function (r, i, s) {
		let o = r.selection,
			l = e > 0 ? o.$to : o.$from,
			a = o.empty;
		if (o instanceof O) {
			if (!s.endOfTextblock(t) || l.depth == 0) return !1;
			((a = !1), (l = r.doc.resolve(e > 0 ? l.after() : l.before())));
		}
		let c = q.findGapCursorFrom(l, e, a);
		return c ? (i && i(r.tr.setSelection(new q(c))), !0) : !1;
	};
}
function D0(n, e, t) {
	if (!n || !n.editable) return !1;
	let r = n.state.doc.resolve(e);
	if (!q.valid(r)) return !1;
	let i = n.posAtCoords({ left: t.clientX, top: t.clientY });
	return i && i.inside > -1 && N.isSelectable(n.state.doc.nodeAt(i.inside)) ? !1 : (n.dispatch(n.state.tr.setSelection(new q(r))), !0);
}
function L0(n, e) {
	if (e.inputType != 'insertCompositionText' || !(n.state.selection instanceof q)) return !1;
	let { $from: t } = n.state.selection,
		r = t.parent.contentMatchAt(t.index()).findWrapping(n.state.schema.nodes.text);
	if (!r) return !1;
	let i = k.empty;
	for (let o = r.length - 1; o >= 0; o--) i = k.from(r[o].createAndFill(null, i));
	let s = n.state.tr.replace(t.pos, t.pos, new C(i, 0, 0));
	return (s.setSelection(O.near(s.doc.resolve(t.pos + 1))), n.dispatch(s), !1);
}
function P0(n) {
	if (!(n.selection instanceof q)) return null;
	let e = document.createElement('div');
	return ((e.className = 'ProseMirror-gapcursor'), V.create(n.doc, [ne.widget(n.selection.head, e, { key: 'gapcursor' })]));
}
var Ri = 200,
	ie = function () {};
ie.prototype.append = function (e) {
	return e.length
		? ((e = ie.from(e)),
			(!this.length && e) || (e.length < Ri && this.leafAppend(e)) || (this.length < Ri && e.leafPrepend(this)) || this.appendInner(e))
		: this;
};
ie.prototype.prepend = function (e) {
	return e.length ? ie.from(e).append(this) : this;
};
ie.prototype.appendInner = function (e) {
	return new z0(this, e);
};
ie.prototype.slice = function (e, t) {
	return (e === void 0 && (e = 0), t === void 0 && (t = this.length), e >= t ? ie.empty : this.sliceInner(Math.max(0, e), Math.min(this.length, t)));
};
ie.prototype.get = function (e) {
	if (!(e < 0 || e >= this.length)) return this.getInner(e);
};
ie.prototype.forEach = function (e, t, r) {
	(t === void 0 && (t = 0), r === void 0 && (r = this.length), t <= r ? this.forEachInner(e, t, r, 0) : this.forEachInvertedInner(e, t, r, 0));
};
ie.prototype.map = function (e, t, r) {
	(t === void 0 && (t = 0), r === void 0 && (r = this.length));
	var i = [];
	return (
		this.forEach(
			function (s, o) {
				return i.push(e(s, o));
			},
			t,
			r
		),
		i
	);
};
ie.from = function (e) {
	return e instanceof ie ? e : e && e.length ? new ku(e) : ie.empty;
};
var ku = (function (n) {
	function e(r) {
		(n.call(this), (this.values = r));
	}
	(n && (e.__proto__ = n), (e.prototype = Object.create(n && n.prototype)), (e.prototype.constructor = e));
	var t = { length: { configurable: !0 }, depth: { configurable: !0 } };
	return (
		(e.prototype.flatten = function () {
			return this.values;
		}),
		(e.prototype.sliceInner = function (i, s) {
			return i == 0 && s == this.length ? this : new e(this.values.slice(i, s));
		}),
		(e.prototype.getInner = function (i) {
			return this.values[i];
		}),
		(e.prototype.forEachInner = function (i, s, o, l) {
			for (var a = s; a < o; a++) if (i(this.values[a], l + a) === !1) return !1;
		}),
		(e.prototype.forEachInvertedInner = function (i, s, o, l) {
			for (var a = s - 1; a >= o; a--) if (i(this.values[a], l + a) === !1) return !1;
		}),
		(e.prototype.leafAppend = function (i) {
			if (this.length + i.length <= Ri) return new e(this.values.concat(i.flatten()));
		}),
		(e.prototype.leafPrepend = function (i) {
			if (this.length + i.length <= Ri) return new e(i.flatten().concat(this.values));
		}),
		(t.length.get = function () {
			return this.values.length;
		}),
		(t.depth.get = function () {
			return 0;
		}),
		Object.defineProperties(e.prototype, t),
		e
	);
})(ie);
ie.empty = new ku([]);
var z0 = (function (n) {
	function e(t, r) {
		(n.call(this), (this.left = t), (this.right = r), (this.length = t.length + r.length), (this.depth = Math.max(t.depth, r.depth) + 1));
	}
	return (
		n && (e.__proto__ = n),
		(e.prototype = Object.create(n && n.prototype)),
		(e.prototype.constructor = e),
		(e.prototype.flatten = function () {
			return this.left.flatten().concat(this.right.flatten());
		}),
		(e.prototype.getInner = function (r) {
			return r < this.left.length ? this.left.get(r) : this.right.get(r - this.left.length);
		}),
		(e.prototype.forEachInner = function (r, i, s, o) {
			var l = this.left.length;
			if (
				(i < l && this.left.forEachInner(r, i, Math.min(s, l), o) === !1) ||
				(s > l && this.right.forEachInner(r, Math.max(i - l, 0), Math.min(this.length, s) - l, o + l) === !1)
			)
				return !1;
		}),
		(e.prototype.forEachInvertedInner = function (r, i, s, o) {
			var l = this.left.length;
			if (
				(i > l && this.right.forEachInvertedInner(r, i - l, Math.max(s, l) - l, o + l) === !1) ||
				(s < l && this.left.forEachInvertedInner(r, Math.min(i, l), s, o) === !1)
			)
				return !1;
		}),
		(e.prototype.sliceInner = function (r, i) {
			if (r == 0 && i == this.length) return this;
			var s = this.left.length;
			return i <= s ? this.left.slice(r, i) : r >= s ? this.right.slice(r - s, i - s) : this.left.slice(r, s).append(this.right.slice(0, i - s));
		}),
		(e.prototype.leafAppend = function (r) {
			var i = this.right.leafAppend(r);
			if (i) return new e(this.left, i);
		}),
		(e.prototype.leafPrepend = function (r) {
			var i = this.left.leafPrepend(r);
			if (i) return new e(i, this.right);
		}),
		(e.prototype.appendInner = function (r) {
			return this.left.depth >= Math.max(this.right.depth, r.depth) + 1 ? new e(this.left, new e(this.right, r)) : new e(this, r);
		}),
		e
	);
})(ie);
const B0 = 500;
class Fe {
	constructor(e, t) {
		((this.items = e), (this.eventCount = t));
	}
	popEvent(e, t) {
		if (this.eventCount == 0) return null;
		let r = this.items.length;
		for (; ; r--)
			if (this.items.get(r - 1).selection) {
				--r;
				break;
			}
		let i, s;
		t && ((i = this.remapping(r, this.items.length)), (s = i.maps.length));
		let o = e.tr,
			l,
			a,
			c = [],
			d = [];
		return (
			this.items.forEach(
				(u, f) => {
					if (!u.step) {
						(i || ((i = this.remapping(r, f + 1)), (s = i.maps.length)), s--, d.push(u));
						return;
					}
					if (i) {
						d.push(new Je(u.map));
						let h = u.step.map(i.slice(s)),
							p;
						(h && o.maybeStep(h).doc && ((p = o.mapping.maps[o.mapping.maps.length - 1]), c.push(new Je(p, void 0, void 0, c.length + d.length))),
							s--,
							p && i.appendMap(p, s));
					} else o.maybeStep(u.step);
					if (u.selection)
						return (
							(l = i ? u.selection.map(i.slice(s)) : u.selection),
							(a = new Fe(this.items.slice(0, r).append(d.reverse().concat(c)), this.eventCount - 1)),
							!1
						);
				},
				this.items.length,
				0
			),
			{ remaining: a, transform: o, selection: l }
		);
	}
	addTransform(e, t, r, i) {
		let s = [],
			o = this.eventCount,
			l = this.items,
			a = !i && l.length ? l.get(l.length - 1) : null;
		for (let d = 0; d < e.steps.length; d++) {
			let u = e.steps[d].invert(e.docs[d]),
				f = new Je(e.mapping.maps[d], u, t),
				h;
			((h = a && a.merge(f)) && ((f = h), d ? s.pop() : (l = l.slice(0, l.length - 1))), s.push(f), t && (o++, (t = void 0)), i || (a = f));
		}
		let c = o - r.depth;
		return (c > $0 && ((l = H0(l, c)), (o -= c)), new Fe(l.append(s), o));
	}
	remapping(e, t) {
		let r = new rr();
		return (
			this.items.forEach(
				(i, s) => {
					let o = i.mirrorOffset != null && s - i.mirrorOffset >= e ? r.maps.length - i.mirrorOffset : void 0;
					r.appendMap(i.map, o);
				},
				e,
				t
			),
			r
		);
	}
	addMaps(e) {
		return this.eventCount == 0 ? this : new Fe(this.items.append(e.map((t) => new Je(t))), this.eventCount);
	}
	rebased(e, t) {
		if (!this.eventCount) return this;
		let r = [],
			i = Math.max(0, this.items.length - t),
			s = e.mapping,
			o = e.steps.length,
			l = this.eventCount;
		this.items.forEach((f) => {
			f.selection && l--;
		}, i);
		let a = t;
		this.items.forEach((f) => {
			let h = s.getMirror(--a);
			if (h == null) return;
			o = Math.min(o, h);
			let p = s.maps[h];
			if (f.step) {
				let m = e.steps[h].invert(e.docs[h]),
					g = f.selection && f.selection.map(s.slice(a + 1, h));
				(g && l++, r.push(new Je(p, m, g)));
			} else r.push(new Je(p));
		}, i);
		let c = [];
		for (let f = t; f < o; f++) c.push(new Je(s.maps[f]));
		let d = this.items.slice(0, i).append(c).append(r),
			u = new Fe(d, l);
		return (u.emptyItemCount() > B0 && (u = u.compress(this.items.length - r.length)), u);
	}
	emptyItemCount() {
		let e = 0;
		return (
			this.items.forEach((t) => {
				t.step || e++;
			}),
			e
		);
	}
	compress(e = this.items.length) {
		let t = this.remapping(0, e),
			r = t.maps.length,
			i = [],
			s = 0;
		return (
			this.items.forEach(
				(o, l) => {
					if (l >= e) (i.push(o), o.selection && s++);
					else if (o.step) {
						let a = o.step.map(t.slice(r)),
							c = a && a.getMap();
						if ((r--, c && t.appendMap(c, r), a)) {
							let d = o.selection && o.selection.map(t.slice(r));
							d && s++;
							let u = new Je(c.invert(), a, d),
								f,
								h = i.length - 1;
							(f = i.length && i[h].merge(u)) ? (i[h] = f) : i.push(u);
						}
					} else o.map && r--;
				},
				this.items.length,
				0
			),
			new Fe(ie.from(i.reverse()), s)
		);
	}
}
Fe.empty = new Fe(ie.empty, 0);
function H0(n, e) {
	let t;
	return (
		n.forEach((r, i) => {
			if (r.selection && e-- == 0) return ((t = i), !1);
		}),
		n.slice(t)
	);
}
class Je {
	constructor(e, t, r, i) {
		((this.map = e), (this.step = t), (this.selection = r), (this.mirrorOffset = i));
	}
	merge(e) {
		if (this.step && e.step && !e.selection) {
			let t = e.step.merge(this.step);
			if (t) return new Je(t.getMap().invert(), t, this.selection);
		}
	}
}
class yt {
	constructor(e, t, r, i, s) {
		((this.done = e), (this.undone = t), (this.prevRanges = r), (this.prevTime = i), (this.prevComposition = s));
	}
}
const $0 = 20;
function F0(n, e, t, r) {
	let i = t.getMeta(Jt),
		s;
	if (i) return i.historyState;
	t.getMeta(W0) && (n = new yt(n.done, n.undone, null, 0, -1));
	let o = t.getMeta('appendedTransaction');
	if (t.steps.length == 0) return n;
	if (o && o.getMeta(Jt))
		return o.getMeta(Jt).redo
			? new yt(n.done.addTransform(t, void 0, r, Fr(e)), n.undone, Sa(t.mapping.maps), n.prevTime, n.prevComposition)
			: new yt(n.done, n.undone.addTransform(t, void 0, r, Fr(e)), null, n.prevTime, n.prevComposition);
	if (t.getMeta('addToHistory') !== !1 && !(o && o.getMeta('addToHistory') === !1)) {
		let l = t.getMeta('composition'),
			a = n.prevTime == 0 || (!o && n.prevComposition != l && (n.prevTime < (t.time || 0) - r.newGroupDelay || !_0(t, n.prevRanges))),
			c = o ? Ms(n.prevRanges, t.mapping) : Sa(t.mapping.maps);
		return new yt(n.done.addTransform(t, a ? e.selection.getBookmark() : void 0, r, Fr(e)), Fe.empty, c, t.time, l ?? n.prevComposition);
	} else
		return (s = t.getMeta('rebased'))
			? new yt(n.done.rebased(t, s), n.undone.rebased(t, s), Ms(n.prevRanges, t.mapping), n.prevTime, n.prevComposition)
			: new yt(n.done.addMaps(t.mapping.maps), n.undone.addMaps(t.mapping.maps), Ms(n.prevRanges, t.mapping), n.prevTime, n.prevComposition);
}
function _0(n, e) {
	if (!e) return !1;
	if (!n.docChanged) return !0;
	let t = !1;
	return (
		n.mapping.maps[0].forEach((r, i) => {
			for (let s = 0; s < e.length; s += 2) r <= e[s + 1] && i >= e[s] && (t = !0);
		}),
		t
	);
}
function Sa(n) {
	let e = [];
	for (let t = n.length - 1; t >= 0 && e.length == 0; t--) n[t].forEach((r, i, s, o) => e.push(s, o));
	return e;
}
function Ms(n, e) {
	if (!n) return null;
	let t = [];
	for (let r = 0; r < n.length; r += 2) {
		let i = e.map(n[r], 1),
			s = e.map(n[r + 1], -1);
		i <= s && t.push(i, s);
	}
	return t;
}
function V0(n, e, t) {
	let r = Fr(e),
		i = Jt.get(e).spec.config,
		s = (t ? n.undone : n.done).popEvent(e, r);
	if (!s) return null;
	let o = s.selection.resolve(s.transform.doc),
		l = (t ? n.done : n.undone).addTransform(s.transform, e.selection.getBookmark(), i, r),
		a = new yt(t ? l : s.remaining, t ? s.remaining : l, null, 0, -1);
	return s.transform.setSelection(o).setMeta(Jt, { redo: t, historyState: a });
}
let Ts = !1,
	va = null;
function Fr(n) {
	let e = n.plugins;
	if (va != e) {
		((Ts = !1), (va = e));
		for (let t = 0; t < e.length; t++)
			if (e[t].spec.historyPreserveItems) {
				Ts = !0;
				break;
			}
	}
	return Ts;
}
const Jt = new G('history'),
	W0 = new G('closeHistory');
function j0(n = {}) {
	return (
		(n = { depth: n.depth || 100, newGroupDelay: n.newGroupDelay || 500 }),
		new K({
			key: Jt,
			state: {
				init() {
					return new yt(Fe.empty, Fe.empty, null, 0, -1);
				},
				apply(e, t, r) {
					return F0(t, r, e, n);
				}
			},
			config: n,
			props: {
				handleDOMEvents: {
					beforeinput(e, t) {
						let r = t.inputType,
							i = r == 'historyUndo' ? wu : r == 'historyRedo' ? Su : null;
						return !i || !e.editable ? !1 : (t.preventDefault(), i(e.state, e.dispatch));
					}
				}
			}
		})
	);
}
function xu(n, e) {
	return (t, r) => {
		let i = Jt.getState(t);
		if (!i || (n ? i.undone : i.done).eventCount == 0) return !1;
		if (r) {
			let s = V0(i, t, n);
			s && r(e ? s.scrollIntoView() : s);
		}
		return !0;
	};
}
const wu = xu(!1, !0),
	Su = xu(!0, !0);
var K0 = B.create({
		name: 'characterCount',
		addOptions() {
			return { limit: null, mode: 'textSize', textCounter: (n) => n.length, wordCounter: (n) => n.split(' ').filter((e) => e !== '').length };
		},
		addStorage() {
			return { characters: () => 0, words: () => 0 };
		},
		onBeforeCreate() {
			((this.storage.characters = (n) => {
				const e = n?.node || this.editor.state.doc;
				if ((n?.mode || this.options.mode) === 'textSize') {
					const r = e.textBetween(0, e.content.size, void 0, ' ');
					return this.options.textCounter(r);
				}
				return e.nodeSize;
			}),
				(this.storage.words = (n) => {
					const e = n?.node || this.editor.state.doc,
						t = e.textBetween(0, e.content.size, ' ', ' ');
					return this.options.wordCounter(t);
				}));
		},
		addProseMirrorPlugins() {
			let n = !1;
			return [
				new K({
					key: new G('characterCount'),
					appendTransaction: (e, t, r) => {
						if (n) return;
						const i = this.options.limit;
						if (i == null || i === 0) {
							n = !0;
							return;
						}
						const s = this.storage.characters({ node: r.doc });
						if (s > i) {
							const o = s - i,
								l = 0,
								a = o;
							console.warn(`[CharacterCount] Initial content exceeded limit of ${i} characters. Content was automatically trimmed.`);
							const c = r.tr.deleteRange(l, a);
							return ((n = !0), c);
						}
						n = !0;
					},
					filterTransaction: (e, t) => {
						const r = this.options.limit;
						if (!e.docChanged || r === 0 || r === null || r === void 0) return !0;
						const i = this.storage.characters({ node: t.doc }),
							s = this.storage.characters({ node: e.doc });
						if (s <= r || (i > r && s > r && s <= i)) return !0;
						if ((i > r && s > r && s > i) || !e.getMeta('paste')) return !1;
						const l = e.selection.$head.pos,
							a = s - r,
							c = l - a,
							d = l;
						return (e.deleteRange(c, d), !(this.storage.characters({ node: e.doc }) > r));
					}
				})
			];
		}
	}),
	U0 = B.create({
		name: 'dropCursor',
		addOptions() {
			return { color: 'currentColor', width: 1, class: void 0 };
		},
		addProseMirrorPlugins() {
			return [A0(this.options)];
		}
	});
B.create({
	name: 'focus',
	addOptions() {
		return { className: 'has-focus', mode: 'all' };
	},
	addProseMirrorPlugins() {
		return [
			new K({
				key: new G('focus'),
				props: {
					decorations: ({ doc: n, selection: e }) => {
						const { isEditable: t, isFocused: r } = this.editor,
							{ anchor: i } = e,
							s = [];
						if (!t || !r) return V.create(n, []);
						let o = 0;
						this.options.mode === 'deepest' &&
							n.descendants((a, c) => {
								if (a.isText) return;
								if (!(i >= c && i <= c + a.nodeSize - 1)) return !1;
								o += 1;
							});
						let l = 0;
						return (
							n.descendants((a, c) => {
								if (a.isText || !(i >= c && i <= c + a.nodeSize - 1)) return !1;
								if (((l += 1), (this.options.mode === 'deepest' && o - l > 0) || (this.options.mode === 'shallowest' && l > 1)))
									return this.options.mode === 'deepest';
								s.push(ne.node(c, c + a.nodeSize, { class: this.options.className }));
							}),
							V.create(n, s)
						);
					}
				}
			})
		];
	}
});
var q0 = B.create({
		name: 'gapCursor',
		addProseMirrorPlugins() {
			return [R0()];
		},
		extendNodeSchema(n) {
			var e;
			const t = { name: n.name, options: n.options, storage: n.storage };
			return { allowGapCursor: (e = z(E(n, 'allowGapCursor', t))) != null ? e : null };
		}
	}),
	J0 = B.create({
		name: 'placeholder',
		addOptions() {
			return {
				emptyEditorClass: 'is-editor-empty',
				emptyNodeClass: 'is-empty',
				placeholder: 'Write something …',
				showOnlyWhenEditable: !0,
				showOnlyCurrent: !0,
				includeChildren: !1
			};
		},
		addProseMirrorPlugins() {
			return [
				new K({
					key: new G('placeholder'),
					props: {
						decorations: ({ doc: n, selection: e }) => {
							const t = this.editor.isEditable || !this.options.showOnlyWhenEditable,
								{ anchor: r } = e,
								i = [];
							if (!t) return null;
							const s = this.editor.isEmpty;
							return (
								n.descendants((o, l) => {
									const a = r >= l && r <= l + o.nodeSize,
										c = !o.isLeaf && Wi(o);
									if ((a || !this.options.showOnlyCurrent) && c) {
										const d = [this.options.emptyNodeClass];
										s && d.push(this.options.emptyEditorClass);
										const u = ne.node(l, l + o.nodeSize, {
											class: d.join(' '),
											'data-placeholder':
												typeof this.options.placeholder == 'function'
													? this.options.placeholder({ editor: this.editor, node: o, pos: l, hasAnchor: a })
													: this.options.placeholder
										});
										i.push(u);
									}
									return this.options.includeChildren;
								}),
								V.create(n, i)
							);
						}
					}
				})
			];
		}
	});
B.create({
	name: 'selection',
	addOptions() {
		return { className: 'selection' };
	},
	addProseMirrorPlugins() {
		const { editor: n, options: e } = this;
		return [
			new K({
				key: new G('selection'),
				props: {
					decorations(t) {
						return t.selection.empty || n.isFocused || !n.isEditable || Od(t.selection) || n.view.dragging
							? null
							: V.create(t.doc, [ne.inline(t.selection.from, t.selection.to, { class: e.className })]);
					}
				}
			})
		];
	}
});
function Ca({ types: n, node: e }) {
	return (e && Array.isArray(n) && n.includes(e.type)) || e?.type === n;
}
var G0 = B.create({
		name: 'trailingNode',
		addOptions() {
			return { node: void 0, notAfter: [] };
		},
		addProseMirrorPlugins() {
			var n;
			const e = new G(this.name),
				t = this.options.node || ((n = this.editor.schema.topNodeType.contentMatch.defaultType) == null ? void 0 : n.name) || 'paragraph',
				r = Object.entries(this.editor.schema.nodes)
					.map(([, i]) => i)
					.filter((i) => (this.options.notAfter || []).concat(t).includes(i.name));
			return [
				new K({
					key: e,
					appendTransaction: (i, s, o) => {
						const { doc: l, tr: a, schema: c } = o,
							d = e.getState(o),
							u = l.content.size,
							f = c.nodes[t];
						if (d) return a.insert(u, f.create());
					},
					state: {
						init: (i, s) => {
							const o = s.tr.doc.lastChild;
							return !Ca({ node: o, types: r });
						},
						apply: (i, s) => {
							if (!i.docChanged || i.getMeta('__uniqueIDTransaction')) return s;
							const o = i.doc.lastChild;
							return !Ca({ node: o, types: r });
						}
					}
				})
			];
		}
	}),
	Y0 = B.create({
		name: 'undoRedo',
		addOptions() {
			return { depth: 100, newGroupDelay: 500 };
		},
		addCommands() {
			return {
				undo:
					() =>
					({ state: n, dispatch: e }) =>
						wu(n, e),
				redo:
					() =>
					({ state: n, dispatch: e }) =>
						Su(n, e)
			};
		},
		addProseMirrorPlugins() {
			return [j0(this.options)];
		},
		addKeyboardShortcuts() {
			return {
				'Mod-z': () => this.editor.commands.undo(),
				'Shift-Mod-z': () => this.editor.commands.redo(),
				'Mod-y': () => this.editor.commands.redo(),
				'Mod-я': () => this.editor.commands.undo(),
				'Shift-Mod-я': () => this.editor.commands.redo()
			};
		}
	}),
	X0 = B.create({
		name: 'starterKit',
		addExtensions() {
			var n, e, t, r;
			const i = [];
			return (
				this.options.bold !== !1 && i.push(vy.configure(this.options.bold)),
				this.options.blockquote !== !1 && i.push(by.configure(this.options.blockquote)),
				this.options.bulletList !== !1 && i.push(lu.configure(this.options.bulletList)),
				this.options.code !== !1 && i.push(Ty.configure(this.options.code)),
				this.options.codeBlock !== !1 && i.push(Ny.configure(this.options.codeBlock)),
				this.options.document !== !1 && i.push(Oy.configure(this.options.document)),
				this.options.dropcursor !== !1 && i.push(U0.configure(this.options.dropcursor)),
				this.options.gapcursor !== !1 && i.push(q0.configure(this.options.gapcursor)),
				this.options.hardBreak !== !1 && i.push(Ry.configure(this.options.hardBreak)),
				this.options.heading !== !1 && i.push(Iy.configure(this.options.heading)),
				this.options.undoRedo !== !1 && i.push(Y0.configure(this.options.undoRedo)),
				this.options.horizontalRule !== !1 && i.push(Dy.configure(this.options.horizontalRule)),
				this.options.italic !== !1 && i.push(Hy.configure(this.options.italic)),
				this.options.listItem !== !1 && i.push(au.configure(this.options.listItem)),
				this.options.listKeymap !== !1 && i.push(pu.configure((n = this.options) == null ? void 0 : n.listKeymap)),
				this.options.link !== !1 && i.push(ou.configure((e = this.options) == null ? void 0 : e.link)),
				this.options.orderedList !== !1 && i.push(gu.configure(this.options.orderedList)),
				this.options.paragraph !== !1 && i.push(S0.configure(this.options.paragraph)),
				this.options.strike !== !1 && i.push(M0.configure(this.options.strike)),
				this.options.text !== !1 && i.push(T0.configure(this.options.text)),
				this.options.underline !== !1 && i.push(yu.configure((t = this.options) == null ? void 0 : t.underline)),
				this.options.trailingNode !== !1 && i.push(G0.configure((r = this.options) == null ? void 0 : r.trailingNode)),
				i
			);
		}
	}),
	Q0 = X0,
	Z0 = J0,
	ro,
	io;
if (typeof WeakMap < 'u') {
	let n = new WeakMap();
	((ro = (e) => n.get(e)), (io = (e, t) => (n.set(e, t), t)));
} else {
	const n = [];
	let t = 0;
	((ro = (r) => {
		for (let i = 0; i < n.length; i += 2) if (n[i] == r) return n[i + 1];
	}),
		(io = (r, i) => (t == 10 && (t = 0), (n[t++] = r), (n[t++] = i))));
}
var J = class {
	constructor(n, e, t, r) {
		((this.width = n), (this.height = e), (this.map = t), (this.problems = r));
	}
	findCell(n) {
		for (let e = 0; e < this.map.length; e++) {
			const t = this.map[e];
			if (t != n) continue;
			const r = e % this.width,
				i = (e / this.width) | 0;
			let s = r + 1,
				o = i + 1;
			for (let l = 1; s < this.width && this.map[e + l] == t; l++) s++;
			for (let l = 1; o < this.height && this.map[e + this.width * l] == t; l++) o++;
			return { left: r, top: i, right: s, bottom: o };
		}
		throw new RangeError(`No cell with offset ${n} found`);
	}
	colCount(n) {
		for (let e = 0; e < this.map.length; e++) if (this.map[e] == n) return e % this.width;
		throw new RangeError(`No cell with offset ${n} found`);
	}
	nextCell(n, e, t) {
		const { left: r, right: i, top: s, bottom: o } = this.findCell(n);
		return e == 'horiz'
			? (t < 0 ? r == 0 : i == this.width)
				? null
				: this.map[s * this.width + (t < 0 ? r - 1 : i)]
			: (t < 0 ? s == 0 : o == this.height)
				? null
				: this.map[r + this.width * (t < 0 ? s - 1 : o)];
	}
	rectBetween(n, e) {
		const { left: t, right: r, top: i, bottom: s } = this.findCell(n),
			{ left: o, right: l, top: a, bottom: c } = this.findCell(e);
		return { left: Math.min(t, o), top: Math.min(i, a), right: Math.max(r, l), bottom: Math.max(s, c) };
	}
	cellsInRect(n) {
		const e = [],
			t = {};
		for (let r = n.top; r < n.bottom; r++)
			for (let i = n.left; i < n.right; i++) {
				const s = r * this.width + i,
					o = this.map[s];
				t[o] || ((t[o] = !0), !((i == n.left && i && this.map[s - 1] == o) || (r == n.top && r && this.map[s - this.width] == o)) && e.push(o));
			}
		return e;
	}
	positionAt(n, e, t) {
		for (let r = 0, i = 0; ; r++) {
			const s = i + t.child(r).nodeSize;
			if (r == n) {
				let o = e + n * this.width;
				const l = (n + 1) * this.width;
				for (; o < l && this.map[o] < i; ) o++;
				return o == l ? s - 1 : this.map[o];
			}
			i = s;
		}
	}
	static get(n) {
		return ro(n) || io(n, eb(n));
	}
};
function eb(n) {
	if (n.type.spec.tableRole != 'table') throw new RangeError('Not a table node: ' + n.type.name);
	const e = tb(n),
		t = n.childCount,
		r = [];
	let i = 0,
		s = null;
	const o = [];
	for (let c = 0, d = e * t; c < d; c++) r[c] = 0;
	for (let c = 0, d = 0; c < t; c++) {
		const u = n.child(c);
		d++;
		for (let p = 0; ; p++) {
			for (; i < r.length && r[i] != 0; ) i++;
			if (p == u.childCount) break;
			const m = u.child(p),
				{ colspan: g, rowspan: y, colwidth: x } = m.attrs;
			for (let M = 0; M < y; M++) {
				if (M + c >= t) {
					(s || (s = [])).push({ type: 'overlong_rowspan', pos: d, n: y - M });
					break;
				}
				const T = i + M * e;
				for (let S = 0; S < g; S++) {
					r[T + S] == 0 ? (r[T + S] = d) : (s || (s = [])).push({ type: 'collision', row: c, pos: d, n: g - S });
					const A = x && x[S];
					if (A) {
						const v = ((T + S) % e) * 2,
							D = o[v];
						D == null || (D != A && o[v + 1] == 1) ? ((o[v] = A), (o[v + 1] = 1)) : D == A && o[v + 1]++;
					}
				}
			}
			((i += g), (d += m.nodeSize));
		}
		const f = (c + 1) * e;
		let h = 0;
		for (; i < f; ) r[i++] == 0 && h++;
		(h && (s || (s = [])).push({ type: 'missing', row: c, n: h }), d++);
	}
	(e === 0 || t === 0) && (s || (s = [])).push({ type: 'zero_sized' });
	const l = new J(e, t, r, s);
	let a = !1;
	for (let c = 0; !a && c < o.length; c += 2) o[c] != null && o[c + 1] < t && (a = !0);
	return (a && nb(l, o, n), l);
}
function tb(n) {
	let e = -1,
		t = !1;
	for (let r = 0; r < n.childCount; r++) {
		const i = n.child(r);
		let s = 0;
		if (t)
			for (let o = 0; o < r; o++) {
				const l = n.child(o);
				for (let a = 0; a < l.childCount; a++) {
					const c = l.child(a);
					o + c.attrs.rowspan > r && (s += c.attrs.colspan);
				}
			}
		for (let o = 0; o < i.childCount; o++) {
			const l = i.child(o);
			((s += l.attrs.colspan), l.attrs.rowspan > 1 && (t = !0));
		}
		e == -1 ? (e = s) : e != s && (e = Math.max(e, s));
	}
	return e;
}
function nb(n, e, t) {
	n.problems || (n.problems = []);
	const r = {};
	for (let i = 0; i < n.map.length; i++) {
		const s = n.map[i];
		if (r[s]) continue;
		r[s] = !0;
		const o = t.nodeAt(s);
		if (!o) throw new RangeError(`No cell with offset ${s} found`);
		let l = null;
		const a = o.attrs;
		for (let c = 0; c < a.colspan; c++) {
			const d = (i + c) % n.width,
				u = e[d * 2];
			u != null && (!a.colwidth || a.colwidth[c] != u) && ((l || (l = rb(a)))[c] = u);
		}
		l && n.problems.unshift({ type: 'colwidth mismatch', pos: s, colwidth: l });
	}
}
function rb(n) {
	if (n.colwidth) return n.colwidth.slice();
	const e = [];
	for (let t = 0; t < n.colspan; t++) e.push(0);
	return e;
}
function pe(n) {
	let e = n.cached.tableNodeTypes;
	if (!e) {
		e = n.cached.tableNodeTypes = {};
		for (const t in n.nodes) {
			const r = n.nodes[t],
				i = r.spec.tableRole;
			i && (e[i] = r);
		}
	}
	return e;
}
var xt = new G('selectingCells');
function Rn(n) {
	for (let e = n.depth - 1; e > 0; e--) if (n.node(e).type.spec.tableRole == 'row') return n.node(0).resolve(n.before(e + 1));
	return null;
}
function ib(n) {
	for (let e = n.depth; e > 0; e--) {
		const t = n.node(e).type.spec.tableRole;
		if (t === 'cell' || t === 'header_cell') return n.node(e);
	}
	return null;
}
function We(n) {
	const e = n.selection.$head;
	for (let t = e.depth; t > 0; t--) if (e.node(t).type.spec.tableRole == 'row') return !0;
	return !1;
}
function qi(n) {
	const e = n.selection;
	if ('$anchorCell' in e && e.$anchorCell) return e.$anchorCell.pos > e.$headCell.pos ? e.$anchorCell : e.$headCell;
	if ('node' in e && e.node && e.node.type.spec.tableRole == 'cell') return e.$anchor;
	const t = Rn(e.$head) || sb(e.$head);
	if (t) return t;
	throw new RangeError(`No cell found around position ${e.head}`);
}
function sb(n) {
	for (let e = n.nodeAfter, t = n.pos; e; e = e.firstChild, t++) {
		const r = e.type.spec.tableRole;
		if (r == 'cell' || r == 'header_cell') return n.doc.resolve(t);
	}
	for (let e = n.nodeBefore, t = n.pos; e; e = e.lastChild, t--) {
		const r = e.type.spec.tableRole;
		if (r == 'cell' || r == 'header_cell') return n.doc.resolve(t - e.nodeSize);
	}
}
function so(n) {
	return n.parent.type.spec.tableRole == 'row' && !!n.nodeAfter;
}
function ob(n) {
	return n.node(0).resolve(n.pos + n.nodeAfter.nodeSize);
}
function Xo(n, e) {
	return n.depth == e.depth && n.pos >= e.start(-1) && n.pos <= e.end(-1);
}
function vu(n, e, t) {
	const r = n.node(-1),
		i = J.get(r),
		s = n.start(-1),
		o = i.nextCell(n.pos - s, e, t);
	return o == null ? null : n.node(0).resolve(s + o);
}
function en(n, e, t = 1) {
	const r = { ...n, colspan: n.colspan - t };
	return (r.colwidth && ((r.colwidth = r.colwidth.slice()), r.colwidth.splice(e, t), r.colwidth.some((i) => i > 0) || (r.colwidth = null)), r);
}
function Cu(n, e, t = 1) {
	const r = { ...n, colspan: n.colspan + t };
	if (r.colwidth) {
		r.colwidth = r.colwidth.slice();
		for (let i = 0; i < t; i++) r.colwidth.splice(e, 0, 0);
	}
	return r;
}
function lb(n, e, t) {
	const r = pe(e.type.schema).header_cell;
	for (let i = 0; i < n.height; i++) if (e.nodeAt(n.map[t + i * n.width]).type != r) return !1;
	return !0;
}
var W = class st extends R {
	constructor(e, t = e) {
		const r = e.node(-1),
			i = J.get(r),
			s = e.start(-1),
			o = i.rectBetween(e.pos - s, t.pos - s),
			l = e.node(0),
			a = i.cellsInRect(o).filter((d) => d != t.pos - s);
		a.unshift(t.pos - s);
		const c = a.map((d) => {
			const u = r.nodeAt(d);
			if (!u) throw RangeError(`No cell with offset ${d} found`);
			const f = s + d + 1;
			return new kc(l.resolve(f), l.resolve(f + u.content.size));
		});
		(super(c[0].$from, c[0].$to, c), (this.$anchorCell = e), (this.$headCell = t));
	}
	map(e, t) {
		const r = e.resolve(t.map(this.$anchorCell.pos)),
			i = e.resolve(t.map(this.$headCell.pos));
		if (so(r) && so(i) && Xo(r, i)) {
			const s = this.$anchorCell.node(-1) != r.node(-1);
			return s && this.isRowSelection() ? st.rowSelection(r, i) : s && this.isColSelection() ? st.colSelection(r, i) : new st(r, i);
		}
		return O.between(r, i);
	}
	content() {
		const e = this.$anchorCell.node(-1),
			t = J.get(e),
			r = this.$anchorCell.start(-1),
			i = t.rectBetween(this.$anchorCell.pos - r, this.$headCell.pos - r),
			s = {},
			o = [];
		for (let a = i.top; a < i.bottom; a++) {
			const c = [];
			for (let d = a * t.width + i.left, u = i.left; u < i.right; u++, d++) {
				const f = t.map[d];
				if (s[f]) continue;
				s[f] = !0;
				const h = t.findCell(f);
				let p = e.nodeAt(f);
				if (!p) throw RangeError(`No cell with offset ${f} found`);
				const m = i.left - h.left,
					g = h.right - i.right;
				if (m > 0 || g > 0) {
					let y = p.attrs;
					if ((m > 0 && (y = en(y, 0, m)), g > 0 && (y = en(y, y.colspan - g, g)), h.left < i.left)) {
						if (((p = p.type.createAndFill(y)), !p)) throw RangeError(`Could not create cell with attrs ${JSON.stringify(y)}`);
					} else p = p.type.create(y, p.content);
				}
				if (h.top < i.top || h.bottom > i.bottom) {
					const y = { ...p.attrs, rowspan: Math.min(h.bottom, i.bottom) - Math.max(h.top, i.top) };
					h.top < i.top ? (p = p.type.createAndFill(y)) : (p = p.type.create(y, p.content));
				}
				c.push(p);
			}
			o.push(e.child(a).copy(k.from(c)));
		}
		const l = this.isColSelection() && this.isRowSelection() ? e : o;
		return new C(k.from(l), 1, 1);
	}
	replace(e, t = C.empty) {
		const r = e.steps.length,
			i = this.ranges;
		for (let o = 0; o < i.length; o++) {
			const { $from: l, $to: a } = i[o],
				c = e.mapping.slice(r);
			e.replace(c.map(l.pos), c.map(a.pos), o ? C.empty : t);
		}
		const s = R.findFrom(e.doc.resolve(e.mapping.slice(r).map(this.to)), -1);
		s && e.setSelection(s);
	}
	replaceWith(e, t) {
		this.replace(e, new C(k.from(t), 0, 0));
	}
	forEachCell(e) {
		const t = this.$anchorCell.node(-1),
			r = J.get(t),
			i = this.$anchorCell.start(-1),
			s = r.cellsInRect(r.rectBetween(this.$anchorCell.pos - i, this.$headCell.pos - i));
		for (let o = 0; o < s.length; o++) e(t.nodeAt(s[o]), i + s[o]);
	}
	isColSelection() {
		const e = this.$anchorCell.index(-1),
			t = this.$headCell.index(-1);
		if (Math.min(e, t) > 0) return !1;
		const r = e + this.$anchorCell.nodeAfter.attrs.rowspan,
			i = t + this.$headCell.nodeAfter.attrs.rowspan;
		return Math.max(r, i) == this.$headCell.node(-1).childCount;
	}
	static colSelection(e, t = e) {
		const r = e.node(-1),
			i = J.get(r),
			s = e.start(-1),
			o = i.findCell(e.pos - s),
			l = i.findCell(t.pos - s),
			a = e.node(0);
		return (
			o.top <= l.top
				? (o.top > 0 && (e = a.resolve(s + i.map[o.left])), l.bottom < i.height && (t = a.resolve(s + i.map[i.width * (i.height - 1) + l.right - 1])))
				: (l.top > 0 && (t = a.resolve(s + i.map[l.left])),
					o.bottom < i.height && (e = a.resolve(s + i.map[i.width * (i.height - 1) + o.right - 1]))),
			new st(e, t)
		);
	}
	isRowSelection() {
		const e = this.$anchorCell.node(-1),
			t = J.get(e),
			r = this.$anchorCell.start(-1),
			i = t.colCount(this.$anchorCell.pos - r),
			s = t.colCount(this.$headCell.pos - r);
		if (Math.min(i, s) > 0) return !1;
		const o = i + this.$anchorCell.nodeAfter.attrs.colspan,
			l = s + this.$headCell.nodeAfter.attrs.colspan;
		return Math.max(o, l) == t.width;
	}
	eq(e) {
		return e instanceof st && e.$anchorCell.pos == this.$anchorCell.pos && e.$headCell.pos == this.$headCell.pos;
	}
	static rowSelection(e, t = e) {
		const r = e.node(-1),
			i = J.get(r),
			s = e.start(-1),
			o = i.findCell(e.pos - s),
			l = i.findCell(t.pos - s),
			a = e.node(0);
		return (
			o.left <= l.left
				? (o.left > 0 && (e = a.resolve(s + i.map[o.top * i.width])), l.right < i.width && (t = a.resolve(s + i.map[i.width * (l.top + 1) - 1])))
				: (l.left > 0 && (t = a.resolve(s + i.map[l.top * i.width])), o.right < i.width && (e = a.resolve(s + i.map[i.width * (o.top + 1) - 1]))),
			new st(e, t)
		);
	}
	toJSON() {
		return { type: 'cell', anchor: this.$anchorCell.pos, head: this.$headCell.pos };
	}
	static fromJSON(e, t) {
		return new st(e.resolve(t.anchor), e.resolve(t.head));
	}
	static create(e, t, r = t) {
		return new st(e.resolve(t), e.resolve(r));
	}
	getBookmark() {
		return new ab(this.$anchorCell.pos, this.$headCell.pos);
	}
};
W.prototype.visible = !1;
R.jsonID('cell', W);
var ab = class Mu {
	constructor(e, t) {
		((this.anchor = e), (this.head = t));
	}
	map(e) {
		return new Mu(e.map(this.anchor), e.map(this.head));
	}
	resolve(e) {
		const t = e.resolve(this.anchor),
			r = e.resolve(this.head);
		return t.parent.type.spec.tableRole == 'row' &&
			r.parent.type.spec.tableRole == 'row' &&
			t.index() < t.parent.childCount &&
			r.index() < r.parent.childCount &&
			Xo(t, r)
			? new W(t, r)
			: R.near(r, 1);
	}
};
function cb(n) {
	if (!(n.selection instanceof W)) return null;
	const e = [];
	return (
		n.selection.forEachCell((t, r) => {
			e.push(ne.node(r, r + t.nodeSize, { class: 'selectedCell' }));
		}),
		V.create(n.doc, e)
	);
}
function db({ $from: n, $to: e }) {
	if (n.pos == e.pos || n.pos < e.pos - 6) return !1;
	let t = n.pos,
		r = e.pos,
		i = n.depth;
	for (; i >= 0 && !(n.after(i + 1) < n.end(i)); i--, t++);
	for (let s = e.depth; s >= 0 && !(e.before(s + 1) > e.start(s)); s--, r--);
	return t == r && /row|table/.test(n.node(i).type.spec.tableRole);
}
function ub({ $from: n, $to: e }) {
	let t, r;
	for (let i = n.depth; i > 0; i--) {
		const s = n.node(i);
		if (s.type.spec.tableRole === 'cell' || s.type.spec.tableRole === 'header_cell') {
			t = s;
			break;
		}
	}
	for (let i = e.depth; i > 0; i--) {
		const s = e.node(i);
		if (s.type.spec.tableRole === 'cell' || s.type.spec.tableRole === 'header_cell') {
			r = s;
			break;
		}
	}
	return t !== r && e.parentOffset === 0;
}
function fb(n, e, t) {
	const r = (e || n).selection,
		i = (e || n).doc;
	let s, o;
	if (r instanceof N && (o = r.node.type.spec.tableRole)) {
		if (o == 'cell' || o == 'header_cell') s = W.create(i, r.from);
		else if (o == 'row') {
			const l = i.resolve(r.from + 1);
			s = W.rowSelection(l, l);
		} else if (!t) {
			const l = J.get(r.node),
				a = r.from + 1,
				c = a + l.map[l.width * l.height - 1];
			s = W.create(i, a + 1, c);
		}
	} else r instanceof O && db(r) ? (s = O.create(i, r.from)) : r instanceof O && ub(r) && (s = O.create(i, r.$from.start(), r.$from.end()));
	return (s && (e || (e = n.tr)).setSelection(s), e);
}
var hb = new G('fix-tables');
function Tu(n, e, t, r) {
	const i = n.childCount,
		s = e.childCount;
	e: for (let o = 0, l = 0; o < s; o++) {
		const a = e.child(o);
		for (let c = l, d = Math.min(i, o + 3); c < d; c++)
			if (n.child(c) == a) {
				((l = c + 1), (t += a.nodeSize));
				continue e;
			}
		(r(a, t), l < i && n.child(l).sameMarkup(a) ? Tu(n.child(l), a, t + 1, r) : a.nodesBetween(0, a.content.size, r, t + 1), (t += a.nodeSize));
	}
}
function Au(n, e) {
	let t;
	const r = (i, s) => {
		i.type.spec.tableRole == 'table' && (t = pb(n, i, s, t));
	};
	return (e ? e.doc != n.doc && Tu(e.doc, n.doc, 0, r) : n.doc.descendants(r), t);
}
function pb(n, e, t, r) {
	const i = J.get(e);
	if (!i.problems) return r;
	r || (r = n.tr);
	const s = [];
	for (let a = 0; a < i.height; a++) s.push(0);
	for (let a = 0; a < i.problems.length; a++) {
		const c = i.problems[a];
		if (c.type == 'collision') {
			const d = e.nodeAt(c.pos);
			if (!d) continue;
			const u = d.attrs;
			for (let f = 0; f < u.rowspan; f++) s[c.row + f] += c.n;
			r.setNodeMarkup(r.mapping.map(t + 1 + c.pos), null, en(u, u.colspan - c.n, c.n));
		} else if (c.type == 'missing') s[c.row] += c.n;
		else if (c.type == 'overlong_rowspan') {
			const d = e.nodeAt(c.pos);
			if (!d) continue;
			r.setNodeMarkup(r.mapping.map(t + 1 + c.pos), null, { ...d.attrs, rowspan: d.attrs.rowspan - c.n });
		} else if (c.type == 'colwidth mismatch') {
			const d = e.nodeAt(c.pos);
			if (!d) continue;
			r.setNodeMarkup(r.mapping.map(t + 1 + c.pos), null, { ...d.attrs, colwidth: c.colwidth });
		} else if (c.type == 'zero_sized') {
			const d = r.mapping.map(t);
			r.delete(d, d + e.nodeSize);
		}
	}
	let o, l;
	for (let a = 0; a < s.length; a++) s[a] && (o == null && (o = a), (l = a));
	for (let a = 0, c = t + 1; a < i.height; a++) {
		const d = e.child(a),
			u = c + d.nodeSize,
			f = s[a];
		if (f > 0) {
			let h = 'cell';
			d.firstChild && (h = d.firstChild.type.spec.tableRole);
			const p = [];
			for (let g = 0; g < f; g++) {
				const y = pe(n.schema)[h].createAndFill();
				y && p.push(y);
			}
			const m = (a == 0 || o == a - 1) && l == a ? c + 1 : u - 1;
			r.insert(r.mapping.map(m), p);
		}
		c = u;
	}
	return r.setMeta(hb, { fixTables: !0 });
}
function Xe(n) {
	const e = n.selection,
		t = qi(n),
		r = t.node(-1),
		i = t.start(-1),
		s = J.get(r);
	return { ...(e instanceof W ? s.rectBetween(e.$anchorCell.pos - i, e.$headCell.pos - i) : s.findCell(t.pos - i)), tableStart: i, map: s, table: r };
}
function Eu(n, { map: e, tableStart: t, table: r }, i) {
	let s = i > 0 ? -1 : 0;
	lb(e, r, i + s) && (s = i == 0 || i == e.width ? null : 0);
	for (let o = 0; o < e.height; o++) {
		const l = o * e.width + i;
		if (i > 0 && i < e.width && e.map[l - 1] == e.map[l]) {
			const a = e.map[l],
				c = r.nodeAt(a);
			(n.setNodeMarkup(n.mapping.map(t + a), null, Cu(c.attrs, i - e.colCount(a))), (o += c.attrs.rowspan - 1));
		} else {
			const a = s == null ? pe(r.type.schema).cell : r.nodeAt(e.map[l + s]).type,
				c = e.positionAt(o, i, r);
			n.insert(n.mapping.map(t + c), a.createAndFill());
		}
	}
	return n;
}
function mb(n, e) {
	if (!We(n)) return !1;
	if (e) {
		const t = Xe(n);
		e(Eu(n.tr, t, t.left));
	}
	return !0;
}
function gb(n, e) {
	if (!We(n)) return !1;
	if (e) {
		const t = Xe(n);
		e(Eu(n.tr, t, t.right));
	}
	return !0;
}
function yb(n, { map: e, table: t, tableStart: r }, i) {
	const s = n.mapping.maps.length;
	for (let o = 0; o < e.height; ) {
		const l = o * e.width + i,
			a = e.map[l],
			c = t.nodeAt(a),
			d = c.attrs;
		if ((i > 0 && e.map[l - 1] == a) || (i < e.width - 1 && e.map[l + 1] == a))
			n.setNodeMarkup(n.mapping.slice(s).map(r + a), null, en(d, i - e.colCount(a)));
		else {
			const u = n.mapping.slice(s).map(r + a);
			n.delete(u, u + c.nodeSize);
		}
		o += d.rowspan;
	}
}
function bb(n, e) {
	if (!We(n)) return !1;
	if (e) {
		const t = Xe(n),
			r = n.tr;
		if (t.left == 0 && t.right == t.map.width) return !1;
		for (let i = t.right - 1; yb(r, t, i), i != t.left; i--) {
			const s = t.tableStart ? r.doc.nodeAt(t.tableStart - 1) : r.doc;
			if (!s) throw RangeError('No table found');
			((t.table = s), (t.map = J.get(s)));
		}
		e(r);
	}
	return !0;
}
function kb(n, e, t) {
	var r;
	const i = pe(e.type.schema).header_cell;
	for (let s = 0; s < n.width; s++) if (((r = e.nodeAt(n.map[s + t * n.width])) == null ? void 0 : r.type) != i) return !1;
	return !0;
}
function Nu(n, { map: e, tableStart: t, table: r }, i) {
	var s;
	let o = t;
	for (let c = 0; c < i; c++) o += r.child(c).nodeSize;
	const l = [];
	let a = i > 0 ? -1 : 0;
	kb(e, r, i + a) && (a = i == 0 || i == e.height ? null : 0);
	for (let c = 0, d = e.width * i; c < e.width; c++, d++)
		if (i > 0 && i < e.height && e.map[d] == e.map[d - e.width]) {
			const u = e.map[d],
				f = r.nodeAt(u).attrs;
			(n.setNodeMarkup(t + u, null, { ...f, rowspan: f.rowspan + 1 }), (c += f.colspan - 1));
		} else {
			const u = a == null ? pe(r.type.schema).cell : (s = r.nodeAt(e.map[d + a * e.width])) == null ? void 0 : s.type,
				f = u?.createAndFill();
			f && l.push(f);
		}
	return (n.insert(o, pe(r.type.schema).row.create(null, l)), n);
}
function xb(n, e) {
	if (!We(n)) return !1;
	if (e) {
		const t = Xe(n);
		e(Nu(n.tr, t, t.top));
	}
	return !0;
}
function wb(n, e) {
	if (!We(n)) return !1;
	if (e) {
		const t = Xe(n);
		e(Nu(n.tr, t, t.bottom));
	}
	return !0;
}
function Sb(n, { map: e, table: t, tableStart: r }, i) {
	let s = 0;
	for (let c = 0; c < i; c++) s += t.child(c).nodeSize;
	const o = s + t.child(i).nodeSize,
		l = n.mapping.maps.length;
	n.delete(s + r, o + r);
	const a = new Set();
	for (let c = 0, d = i * e.width; c < e.width; c++, d++) {
		const u = e.map[d];
		if (!a.has(u)) {
			if ((a.add(u), i > 0 && u == e.map[d - e.width])) {
				const f = t.nodeAt(u).attrs;
				(n.setNodeMarkup(n.mapping.slice(l).map(u + r), null, { ...f, rowspan: f.rowspan - 1 }), (c += f.colspan - 1));
			} else if (i < e.height && u == e.map[d + e.width]) {
				const f = t.nodeAt(u),
					h = f.attrs,
					p = f.type.create({ ...h, rowspan: f.attrs.rowspan - 1 }, f.content),
					m = e.positionAt(i + 1, c, t);
				(n.insert(n.mapping.slice(l).map(r + m), p), (c += h.colspan - 1));
			}
		}
	}
}
function vb(n, e) {
	if (!We(n)) return !1;
	if (e) {
		const t = Xe(n),
			r = n.tr;
		if (t.top == 0 && t.bottom == t.map.height) return !1;
		for (let i = t.bottom - 1; Sb(r, t, i), i != t.top; i--) {
			const s = t.tableStart ? r.doc.nodeAt(t.tableStart - 1) : r.doc;
			if (!s) throw RangeError('No table found');
			((t.table = s), (t.map = J.get(t.table)));
		}
		e(r);
	}
	return !0;
}
function Ma(n) {
	const e = n.content;
	return e.childCount == 1 && e.child(0).isTextblock && e.child(0).childCount == 0;
}
function Cb({ width: n, height: e, map: t }, r) {
	let i = r.top * n + r.left,
		s = i,
		o = (r.bottom - 1) * n + r.left,
		l = i + (r.right - r.left - 1);
	for (let a = r.top; a < r.bottom; a++) {
		if ((r.left > 0 && t[s] == t[s - 1]) || (r.right < n && t[l] == t[l + 1])) return !0;
		((s += n), (l += n));
	}
	for (let a = r.left; a < r.right; a++) {
		if ((r.top > 0 && t[i] == t[i - n]) || (r.bottom < e && t[o] == t[o + n])) return !0;
		(i++, o++);
	}
	return !1;
}
function Ta(n, e) {
	const t = n.selection;
	if (!(t instanceof W) || t.$anchorCell.pos == t.$headCell.pos) return !1;
	const r = Xe(n),
		{ map: i } = r;
	if (Cb(i, r)) return !1;
	if (e) {
		const s = n.tr,
			o = {};
		let l = k.empty,
			a,
			c;
		for (let d = r.top; d < r.bottom; d++)
			for (let u = r.left; u < r.right; u++) {
				const f = i.map[d * i.width + u],
					h = r.table.nodeAt(f);
				if (!(o[f] || !h))
					if (((o[f] = !0), a == null)) ((a = f), (c = h));
					else {
						Ma(h) || (l = l.append(h.content));
						const p = s.mapping.map(f + r.tableStart);
						s.delete(p, p + h.nodeSize);
					}
			}
		if (a == null || c == null) return !0;
		if (
			(s.setNodeMarkup(a + r.tableStart, null, { ...Cu(c.attrs, c.attrs.colspan, r.right - r.left - c.attrs.colspan), rowspan: r.bottom - r.top }),
			l.size)
		) {
			const d = a + 1 + c.content.size,
				u = Ma(c) ? a + 1 : d;
			s.replaceWith(u + r.tableStart, d + r.tableStart, l);
		}
		(s.setSelection(new W(s.doc.resolve(a + r.tableStart))), e(s));
	}
	return !0;
}
function Aa(n, e) {
	const t = pe(n.schema);
	return Mb(({ node: r }) => t[r.type.spec.tableRole])(n, e);
}
function Mb(n) {
	return (e, t) => {
		var r;
		const i = e.selection;
		let s, o;
		if (i instanceof W) {
			if (i.$anchorCell.pos != i.$headCell.pos) return !1;
			((s = i.$anchorCell.nodeAfter), (o = i.$anchorCell.pos));
		} else {
			if (((s = ib(i.$from)), !s)) return !1;
			o = (r = Rn(i.$from)) == null ? void 0 : r.pos;
		}
		if (s == null || o == null || (s.attrs.colspan == 1 && s.attrs.rowspan == 1)) return !1;
		if (t) {
			let l = s.attrs;
			const a = [],
				c = l.colwidth;
			(l.rowspan > 1 && (l = { ...l, rowspan: 1 }), l.colspan > 1 && (l = { ...l, colspan: 1 }));
			const d = Xe(e),
				u = e.tr;
			for (let h = 0; h < d.right - d.left; h++) a.push(c ? { ...l, colwidth: c && c[h] ? [c[h]] : null } : l);
			let f;
			for (let h = d.top; h < d.bottom; h++) {
				let p = d.map.positionAt(h, d.left, d.table);
				h == d.top && (p += s.nodeSize);
				for (let m = d.left, g = 0; m < d.right; m++, g++)
					(m == d.left && h == d.top) || u.insert((f = u.mapping.map(p + d.tableStart, 1)), n({ node: s, row: h, col: m }).createAndFill(a[g]));
			}
			(u.setNodeMarkup(o, n({ node: s, row: d.top, col: d.left }), a[0]),
				i instanceof W && u.setSelection(new W(u.doc.resolve(i.$anchorCell.pos), f ? u.doc.resolve(f) : void 0)),
				t(u));
		}
		return !0;
	};
}
function Tb(n, e) {
	return function (t, r) {
		if (!We(t)) return !1;
		const i = qi(t);
		if (i.nodeAfter.attrs[n] === e) return !1;
		if (r) {
			const s = t.tr;
			(t.selection instanceof W
				? t.selection.forEachCell((o, l) => {
						o.attrs[n] !== e && s.setNodeMarkup(l, null, { ...o.attrs, [n]: e });
					})
				: s.setNodeMarkup(i.pos, null, { ...i.nodeAfter.attrs, [n]: e }),
				r(s));
		}
		return !0;
	};
}
function Ab(n) {
	return function (e, t) {
		if (!We(e)) return !1;
		if (t) {
			const r = pe(e.schema),
				i = Xe(e),
				s = e.tr,
				o = i.map.cellsInRect(
					n == 'column'
						? { left: i.left, top: 0, right: i.right, bottom: i.map.height }
						: n == 'row'
							? { left: 0, top: i.top, right: i.map.width, bottom: i.bottom }
							: i
				),
				l = o.map((a) => i.table.nodeAt(a));
			for (let a = 0; a < o.length; a++) l[a].type == r.header_cell && s.setNodeMarkup(i.tableStart + o[a], r.cell, l[a].attrs);
			if (s.steps.length == 0) for (let a = 0; a < o.length; a++) s.setNodeMarkup(i.tableStart + o[a], r.header_cell, l[a].attrs);
			t(s);
		}
		return !0;
	};
}
function Ea(n, e, t) {
	const r = e.map.cellsInRect({ left: 0, top: 0, right: n == 'row' ? e.map.width : 1, bottom: n == 'column' ? e.map.height : 1 });
	for (let i = 0; i < r.length; i++) {
		const s = e.table.nodeAt(r[i]);
		if (s && s.type !== t.header_cell) return !1;
	}
	return !0;
}
function fr(n, e) {
	return (
		(e = e || { useDeprecatedLogic: !1 }),
		e.useDeprecatedLogic
			? Ab(n)
			: function (t, r) {
					if (!We(t)) return !1;
					if (r) {
						const i = pe(t.schema),
							s = Xe(t),
							o = t.tr,
							l = Ea('row', s, i),
							a = Ea('column', s, i),
							d = (n === 'column' ? l : n === 'row' ? a : !1) ? 1 : 0,
							u =
								n == 'column'
									? { left: 0, top: d, right: 1, bottom: s.map.height }
									: n == 'row'
										? { left: d, top: 0, right: s.map.width, bottom: 1 }
										: s,
							f = n == 'column' ? (a ? i.cell : i.header_cell) : n == 'row' ? (l ? i.cell : i.header_cell) : i.cell;
						(s.map.cellsInRect(u).forEach((h) => {
							const p = h + s.tableStart,
								m = o.doc.nodeAt(p);
							m && o.setNodeMarkup(p, f, m.attrs);
						}),
							r(o));
					}
					return !0;
				}
	);
}
fr('row', { useDeprecatedLogic: !0 });
fr('column', { useDeprecatedLogic: !0 });
var Eb = fr('cell', { useDeprecatedLogic: !0 });
function Nb(n, e) {
	if (e < 0) {
		const t = n.nodeBefore;
		if (t) return n.pos - t.nodeSize;
		for (let r = n.index(-1) - 1, i = n.before(); r >= 0; r--) {
			const s = n.node(-1).child(r),
				o = s.lastChild;
			if (o) return i - 1 - o.nodeSize;
			i -= s.nodeSize;
		}
	} else {
		if (n.index() < n.parent.childCount - 1) return n.pos + n.nodeAfter.nodeSize;
		const t = n.node(-1);
		for (let r = n.indexAfter(-1), i = n.after(); r < t.childCount; r++) {
			const s = t.child(r);
			if (s.childCount) return i + 1;
			i += s.nodeSize;
		}
	}
	return null;
}
function Na(n) {
	return function (e, t) {
		if (!We(e)) return !1;
		const r = Nb(qi(e), n);
		if (r == null) return !1;
		if (t) {
			const i = e.doc.resolve(r);
			t(e.tr.setSelection(O.between(i, ob(i))).scrollIntoView());
		}
		return !0;
	};
}
function Ob(n, e) {
	const t = n.selection.$anchor;
	for (let r = t.depth; r > 0; r--)
		if (t.node(r).type.spec.tableRole == 'table') return (e && e(n.tr.delete(t.before(r), t.after(r)).scrollIntoView()), !0);
	return !1;
}
function Ir(n, e) {
	const t = n.selection;
	if (!(t instanceof W)) return !1;
	if (e) {
		const r = n.tr,
			i = pe(n.schema).cell.createAndFill().content;
		(t.forEachCell((s, o) => {
			s.content.eq(i) || r.replace(r.mapping.map(o + 1), r.mapping.map(o + s.nodeSize - 1), new C(i, 0, 0));
		}),
			r.docChanged && e(r));
	}
	return !0;
}
function Rb(n) {
	if (!n.size) return null;
	let { content: e, openStart: t, openEnd: r } = n;
	for (; e.childCount == 1 && ((t > 0 && r > 0) || e.child(0).type.spec.tableRole == 'table'); ) (t--, r--, (e = e.child(0).content));
	const i = e.child(0),
		s = i.type.spec.tableRole,
		o = i.type.schema,
		l = [];
	if (s == 'row')
		for (let a = 0; a < e.childCount; a++) {
			let c = e.child(a).content;
			const d = a ? 0 : Math.max(0, t - 1),
				u = a < e.childCount - 1 ? 0 : Math.max(0, r - 1);
			((d || u) && (c = oo(pe(o).row, new C(c, d, u)).content), l.push(c));
		}
	else if (s == 'cell' || s == 'header_cell') l.push(t || r ? oo(pe(o).row, new C(e, t, r)).content : e);
	else return null;
	return Ib(o, l);
}
function Ib(n, e) {
	const t = [];
	for (let i = 0; i < e.length; i++) {
		const s = e[i];
		for (let o = s.childCount - 1; o >= 0; o--) {
			const { rowspan: l, colspan: a } = s.child(o).attrs;
			for (let c = i; c < i + l; c++) t[c] = (t[c] || 0) + a;
		}
	}
	let r = 0;
	for (let i = 0; i < t.length; i++) r = Math.max(r, t[i]);
	for (let i = 0; i < t.length; i++)
		if ((i >= e.length && e.push(k.empty), t[i] < r)) {
			const s = pe(n).cell.createAndFill(),
				o = [];
			for (let l = t[i]; l < r; l++) o.push(s);
			e[i] = e[i].append(k.from(o));
		}
	return { height: e.length, width: r, rows: e };
}
function oo(n, e) {
	const t = n.createAndFill();
	return new ho(t).replace(0, t.content.size, e).doc;
}
function Db({ width: n, height: e, rows: t }, r, i) {
	if (n != r) {
		const s = [],
			o = [];
		for (let l = 0; l < t.length; l++) {
			const a = t[l],
				c = [];
			for (let d = s[l] || 0, u = 0; d < r; u++) {
				let f = a.child(u % a.childCount);
				(d + f.attrs.colspan > r && (f = f.type.createChecked(en(f.attrs, f.attrs.colspan, d + f.attrs.colspan - r), f.content)),
					c.push(f),
					(d += f.attrs.colspan));
				for (let h = 1; h < f.attrs.rowspan; h++) s[l + h] = (s[l + h] || 0) + f.attrs.colspan;
			}
			o.push(k.from(c));
		}
		((t = o), (n = r));
	}
	if (e != i) {
		const s = [];
		for (let o = 0, l = 0; o < i; o++, l++) {
			const a = [],
				c = t[l % e];
			for (let d = 0; d < c.childCount; d++) {
				let u = c.child(d);
				(o + u.attrs.rowspan > i && (u = u.type.create({ ...u.attrs, rowspan: Math.max(1, i - u.attrs.rowspan) }, u.content)), a.push(u));
			}
			s.push(k.from(a));
		}
		((t = s), (e = i));
	}
	return { width: n, height: e, rows: t };
}
function Lb(n, e, t, r, i, s, o) {
	const l = n.doc.type.schema,
		a = pe(l);
	let c, d;
	if (i > e.width)
		for (let u = 0, f = 0; u < e.height; u++) {
			const h = t.child(u);
			f += h.nodeSize;
			const p = [];
			let m;
			h.lastChild == null || h.lastChild.type == a.cell ? (m = c || (c = a.cell.createAndFill())) : (m = d || (d = a.header_cell.createAndFill()));
			for (let g = e.width; g < i; g++) p.push(m);
			n.insert(n.mapping.slice(o).map(f - 1 + r), p);
		}
	if (s > e.height) {
		const u = [];
		for (let p = 0, m = (e.height - 1) * e.width; p < Math.max(e.width, i); p++) {
			const g = p >= e.width ? !1 : t.nodeAt(e.map[m + p]).type == a.header_cell;
			u.push(g ? d || (d = a.header_cell.createAndFill()) : c || (c = a.cell.createAndFill()));
		}
		const f = a.row.create(null, k.from(u)),
			h = [];
		for (let p = e.height; p < s; p++) h.push(f);
		n.insert(n.mapping.slice(o).map(r + t.nodeSize - 2), h);
	}
	return !!(c || d);
}
function Oa(n, e, t, r, i, s, o, l) {
	if (o == 0 || o == e.height) return !1;
	let a = !1;
	for (let c = i; c < s; c++) {
		const d = o * e.width + c,
			u = e.map[d];
		if (e.map[d - e.width] == u) {
			a = !0;
			const f = t.nodeAt(u),
				{ top: h, left: p } = e.findCell(u);
			(n.setNodeMarkup(n.mapping.slice(l).map(u + r), null, { ...f.attrs, rowspan: o - h }),
				n.insert(n.mapping.slice(l).map(e.positionAt(o, p, t)), f.type.createAndFill({ ...f.attrs, rowspan: h + f.attrs.rowspan - o })),
				(c += f.attrs.colspan - 1));
		}
	}
	return a;
}
function Ra(n, e, t, r, i, s, o, l) {
	if (o == 0 || o == e.width) return !1;
	let a = !1;
	for (let c = i; c < s; c++) {
		const d = c * e.width + o,
			u = e.map[d];
		if (e.map[d - 1] == u) {
			a = !0;
			const f = t.nodeAt(u),
				h = e.colCount(u),
				p = n.mapping.slice(l).map(u + r);
			(n.setNodeMarkup(p, null, en(f.attrs, o - h, f.attrs.colspan - (o - h))),
				n.insert(p + f.nodeSize, f.type.createAndFill(en(f.attrs, 0, o - h))),
				(c += f.attrs.rowspan - 1));
		}
	}
	return a;
}
function Ia(n, e, t, r, i) {
	let s = t ? n.doc.nodeAt(t - 1) : n.doc;
	if (!s) throw new Error('No table found');
	let o = J.get(s);
	const { top: l, left: a } = r,
		c = a + i.width,
		d = l + i.height,
		u = n.tr;
	let f = 0;
	function h() {
		if (((s = t ? u.doc.nodeAt(t - 1) : u.doc), !s)) throw new Error('No table found');
		((o = J.get(s)), (f = u.mapping.maps.length));
	}
	(Lb(u, o, s, t, c, d, f) && h(),
		Oa(u, o, s, t, a, c, l, f) && h(),
		Oa(u, o, s, t, a, c, d, f) && h(),
		Ra(u, o, s, t, l, d, a, f) && h(),
		Ra(u, o, s, t, l, d, c, f) && h());
	for (let p = l; p < d; p++) {
		const m = o.positionAt(p, a, s),
			g = o.positionAt(p, c, s);
		u.replace(u.mapping.slice(f).map(m + t), u.mapping.slice(f).map(g + t), new C(i.rows[p - l], 0, 0));
	}
	(h(), u.setSelection(new W(u.doc.resolve(t + o.positionAt(l, a, s)), u.doc.resolve(t + o.positionAt(d - 1, c - 1, s)))), e(u));
}
var Pb = No({
	ArrowLeft: Dr('horiz', -1),
	ArrowRight: Dr('horiz', 1),
	ArrowUp: Dr('vert', -1),
	ArrowDown: Dr('vert', 1),
	'Shift-ArrowLeft': Lr('horiz', -1),
	'Shift-ArrowRight': Lr('horiz', 1),
	'Shift-ArrowUp': Lr('vert', -1),
	'Shift-ArrowDown': Lr('vert', 1),
	Backspace: Ir,
	'Mod-Backspace': Ir,
	Delete: Ir,
	'Mod-Delete': Ir
});
function _r(n, e, t) {
	return t.eq(n.selection) ? !1 : (e && e(n.tr.setSelection(t).scrollIntoView()), !0);
}
function Dr(n, e) {
	return (t, r, i) => {
		if (!i) return !1;
		const s = t.selection;
		if (s instanceof W) return _r(t, r, R.near(s.$headCell, e));
		if (n != 'horiz' && !s.empty) return !1;
		const o = Ou(i, n, e);
		if (o == null) return !1;
		if (n == 'horiz') return _r(t, r, R.near(t.doc.resolve(s.head + e), e));
		{
			const l = t.doc.resolve(o),
				a = vu(l, n, e);
			let c;
			return (
				a ? (c = R.near(a, 1)) : e < 0 ? (c = R.near(t.doc.resolve(l.before(-1)), -1)) : (c = R.near(t.doc.resolve(l.after(-1)), 1)),
				_r(t, r, c)
			);
		}
	};
}
function Lr(n, e) {
	return (t, r, i) => {
		if (!i) return !1;
		const s = t.selection;
		let o;
		if (s instanceof W) o = s;
		else {
			const a = Ou(i, n, e);
			if (a == null) return !1;
			o = new W(t.doc.resolve(a));
		}
		const l = vu(o.$headCell, n, e);
		return l ? _r(t, r, new W(o.$anchorCell, l)) : !1;
	};
}
function zb(n, e) {
	const t = n.state.doc,
		r = Rn(t.resolve(e));
	return r ? (n.dispatch(n.state.tr.setSelection(new W(r))), !0) : !1;
}
function Bb(n, e, t) {
	if (!We(n.state)) return !1;
	let r = Rb(t);
	const i = n.state.selection;
	if (i instanceof W) {
		r || (r = { width: 1, height: 1, rows: [k.from(oo(pe(n.state.schema).cell, t))] });
		const s = i.$anchorCell.node(-1),
			o = i.$anchorCell.start(-1),
			l = J.get(s).rectBetween(i.$anchorCell.pos - o, i.$headCell.pos - o);
		return ((r = Db(r, l.right - l.left, l.bottom - l.top)), Ia(n.state, n.dispatch, o, l, r), !0);
	} else if (r) {
		const s = qi(n.state),
			o = s.start(-1);
		return (Ia(n.state, n.dispatch, o, J.get(s.node(-1)).findCell(s.pos - o), r), !0);
	} else return !1;
}
function Hb(n, e) {
	var t;
	if (e.ctrlKey || e.metaKey) return;
	const r = Da(n, e.target);
	let i;
	if (e.shiftKey && n.state.selection instanceof W) (s(n.state.selection.$anchorCell, e), e.preventDefault());
	else if (e.shiftKey && r && (i = Rn(n.state.selection.$anchor)) != null && ((t = As(n, e)) == null ? void 0 : t.pos) != i.pos)
		(s(i, e), e.preventDefault());
	else if (!r) return;
	function s(a, c) {
		let d = As(n, c);
		const u = xt.getState(n.state) == null;
		if (!d || !Xo(a, d))
			if (u) d = a;
			else return;
		const f = new W(a, d);
		if (u || !n.state.selection.eq(f)) {
			const h = n.state.tr.setSelection(f);
			(u && h.setMeta(xt, a.pos), n.dispatch(h));
		}
	}
	function o() {
		(n.root.removeEventListener('mouseup', o),
			n.root.removeEventListener('dragstart', o),
			n.root.removeEventListener('mousemove', l),
			xt.getState(n.state) != null && n.dispatch(n.state.tr.setMeta(xt, -1)));
	}
	function l(a) {
		const c = a,
			d = xt.getState(n.state);
		let u;
		if (d != null) u = n.state.doc.resolve(d);
		else if (Da(n, c.target) != r && ((u = As(n, e)), !u)) return o();
		u && s(u, c);
	}
	(n.root.addEventListener('mouseup', o), n.root.addEventListener('dragstart', o), n.root.addEventListener('mousemove', l));
}
function Ou(n, e, t) {
	if (!(n.state.selection instanceof O)) return null;
	const { $head: r } = n.state.selection;
	for (let i = r.depth - 1; i >= 0; i--) {
		const s = r.node(i);
		if ((t < 0 ? r.index(i) : r.indexAfter(i)) != (t < 0 ? 0 : s.childCount)) return null;
		if (s.type.spec.tableRole == 'cell' || s.type.spec.tableRole == 'header_cell') {
			const l = r.before(i),
				a = e == 'vert' ? (t > 0 ? 'down' : 'up') : t > 0 ? 'right' : 'left';
			return n.endOfTextblock(a) ? l : null;
		}
	}
	return null;
}
function Da(n, e) {
	for (; e && e != n.dom; e = e.parentNode) if (e.nodeName == 'TD' || e.nodeName == 'TH') return e;
	return null;
}
function As(n, e) {
	const t = n.posAtCoords({ left: e.clientX, top: e.clientY });
	return t && t ? Rn(n.state.doc.resolve(t.pos)) : null;
}
var $b = class {
	constructor(e, t) {
		((this.node = e),
			(this.defaultCellMinWidth = t),
			(this.dom = document.createElement('div')),
			(this.dom.className = 'tableWrapper'),
			(this.table = this.dom.appendChild(document.createElement('table'))),
			this.table.style.setProperty('--default-cell-min-width', `${t}px`),
			(this.colgroup = this.table.appendChild(document.createElement('colgroup'))),
			lo(e, this.colgroup, this.table, t),
			(this.contentDOM = this.table.appendChild(document.createElement('tbody'))));
	}
	update(e) {
		return e.type != this.node.type ? !1 : ((this.node = e), lo(e, this.colgroup, this.table, this.defaultCellMinWidth), !0);
	}
	ignoreMutation(e) {
		return e.type == 'attributes' && (e.target == this.table || this.colgroup.contains(e.target));
	}
};
function lo(n, e, t, r, i, s) {
	var o;
	let l = 0,
		a = !0,
		c = e.firstChild;
	const d = n.firstChild;
	if (d) {
		for (let u = 0, f = 0; u < d.childCount; u++) {
			const { colspan: h, colwidth: p } = d.child(u).attrs;
			for (let m = 0; m < h; m++, f++) {
				const g = i == f ? s : p && p[m],
					y = g ? g + 'px' : '';
				if (((l += g || r), g || (a = !1), c)) (c.style.width != y && (c.style.width = y), (c = c.nextSibling));
				else {
					const x = document.createElement('col');
					((x.style.width = y), e.appendChild(x));
				}
			}
		}
		for (; c; ) {
			const u = c.nextSibling;
			((o = c.parentNode) == null || o.removeChild(c), (c = u));
		}
		a ? ((t.style.width = l + 'px'), (t.style.minWidth = '')) : ((t.style.width = ''), (t.style.minWidth = l + 'px'));
	}
}
var Te = new G('tableColumnResizing');
function Fb({ handleWidth: n = 5, cellMinWidth: e = 25, defaultCellMinWidth: t = 100, View: r = $b, lastColumnResizable: i = !0 } = {}) {
	const s = new K({
		key: Te,
		state: {
			init(o, l) {
				var a, c;
				const d = (c = (a = s.spec) == null ? void 0 : a.props) == null ? void 0 : c.nodeViews,
					u = pe(l.schema).table.name;
				return (r && d && (d[u] = (f, h) => new r(f, t, h)), new _b(-1, !1));
			},
			apply(o, l) {
				return l.apply(o);
			}
		},
		props: {
			attributes: (o) => {
				const l = Te.getState(o);
				return l && l.activeHandle > -1 ? { class: 'resize-cursor' } : {};
			},
			handleDOMEvents: {
				mousemove: (o, l) => {
					Vb(o, l, n, i);
				},
				mouseleave: (o) => {
					Wb(o);
				},
				mousedown: (o, l) => {
					jb(o, l, e, t);
				}
			},
			decorations: (o) => {
				const l = Te.getState(o);
				if (l && l.activeHandle > -1) return Gb(o, l.activeHandle);
			},
			nodeViews: {}
		}
	});
	return s;
}
var _b = class Vr {
	constructor(e, t) {
		((this.activeHandle = e), (this.dragging = t));
	}
	apply(e) {
		const t = this,
			r = e.getMeta(Te);
		if (r && r.setHandle != null) return new Vr(r.setHandle, !1);
		if (r && r.setDragging !== void 0) return new Vr(t.activeHandle, r.setDragging);
		if (t.activeHandle > -1 && e.docChanged) {
			let i = e.mapping.map(t.activeHandle, -1);
			return (so(e.doc.resolve(i)) || (i = -1), new Vr(i, t.dragging));
		}
		return t;
	}
};
function Vb(n, e, t, r) {
	if (!n.editable) return;
	const i = Te.getState(n.state);
	if (i && !i.dragging) {
		const s = Ub(e.target);
		let o = -1;
		if (s) {
			const { left: l, right: a } = s.getBoundingClientRect();
			e.clientX - l <= t ? (o = La(n, e, 'left', t)) : a - e.clientX <= t && (o = La(n, e, 'right', t));
		}
		if (o != i.activeHandle) {
			if (!r && o !== -1) {
				const l = n.state.doc.resolve(o),
					a = l.node(-1),
					c = J.get(a),
					d = l.start(-1);
				if (c.colCount(l.pos - d) + l.nodeAfter.attrs.colspan - 1 == c.width - 1) return;
			}
			Ru(n, o);
		}
	}
}
function Wb(n) {
	if (!n.editable) return;
	const e = Te.getState(n.state);
	e && e.activeHandle > -1 && !e.dragging && Ru(n, -1);
}
function jb(n, e, t, r) {
	var i;
	if (!n.editable) return !1;
	const s = (i = n.dom.ownerDocument.defaultView) != null ? i : window,
		o = Te.getState(n.state);
	if (!o || o.activeHandle == -1 || o.dragging) return !1;
	const l = n.state.doc.nodeAt(o.activeHandle),
		a = Kb(n, o.activeHandle, l.attrs);
	n.dispatch(n.state.tr.setMeta(Te, { setDragging: { startX: e.clientX, startWidth: a } }));
	function c(u) {
		(s.removeEventListener('mouseup', c), s.removeEventListener('mousemove', d));
		const f = Te.getState(n.state);
		f?.dragging && (qb(n, f.activeHandle, Pa(f.dragging, u, t)), n.dispatch(n.state.tr.setMeta(Te, { setDragging: null })));
	}
	function d(u) {
		if (!u.which) return c(u);
		const f = Te.getState(n.state);
		if (f && f.dragging) {
			const h = Pa(f.dragging, u, t);
			za(n, f.activeHandle, h, r);
		}
	}
	return (za(n, o.activeHandle, a, r), s.addEventListener('mouseup', c), s.addEventListener('mousemove', d), e.preventDefault(), !0);
}
function Kb(n, e, { colspan: t, colwidth: r }) {
	const i = r && r[r.length - 1];
	if (i) return i;
	const s = n.domAtPos(e);
	let l = s.node.childNodes[s.offset].offsetWidth,
		a = t;
	if (r) for (let c = 0; c < t; c++) r[c] && ((l -= r[c]), a--);
	return l / a;
}
function Ub(n) {
	for (; n && n.nodeName != 'TD' && n.nodeName != 'TH'; ) n = n.classList && n.classList.contains('ProseMirror') ? null : n.parentNode;
	return n;
}
function La(n, e, t, r) {
	const i = t == 'right' ? -r : r,
		s = n.posAtCoords({ left: e.clientX + i, top: e.clientY });
	if (!s) return -1;
	const { pos: o } = s,
		l = Rn(n.state.doc.resolve(o));
	if (!l) return -1;
	if (t == 'right') return l.pos;
	const a = J.get(l.node(-1)),
		c = l.start(-1),
		d = a.map.indexOf(l.pos - c);
	return d % a.width == 0 ? -1 : c + a.map[d - 1];
}
function Pa(n, e, t) {
	const r = e.clientX - n.startX;
	return Math.max(t, n.startWidth + r);
}
function Ru(n, e) {
	n.dispatch(n.state.tr.setMeta(Te, { setHandle: e }));
}
function qb(n, e, t) {
	const r = n.state.doc.resolve(e),
		i = r.node(-1),
		s = J.get(i),
		o = r.start(-1),
		l = s.colCount(r.pos - o) + r.nodeAfter.attrs.colspan - 1,
		a = n.state.tr;
	for (let c = 0; c < s.height; c++) {
		const d = c * s.width + l;
		if (c && s.map[d] == s.map[d - s.width]) continue;
		const u = s.map[d],
			f = i.nodeAt(u).attrs,
			h = f.colspan == 1 ? 0 : l - s.colCount(u);
		if (f.colwidth && f.colwidth[h] == t) continue;
		const p = f.colwidth ? f.colwidth.slice() : Jb(f.colspan);
		((p[h] = t), a.setNodeMarkup(o + u, null, { ...f, colwidth: p }));
	}
	a.docChanged && n.dispatch(a);
}
function za(n, e, t, r) {
	const i = n.state.doc.resolve(e),
		s = i.node(-1),
		o = i.start(-1),
		l = J.get(s).colCount(i.pos - o) + i.nodeAfter.attrs.colspan - 1;
	let a = n.domAtPos(i.start(-1)).node;
	for (; a && a.nodeName != 'TABLE'; ) a = a.parentNode;
	a && lo(s, a.firstChild, a, r, l, t);
}
function Jb(n) {
	return Array(n).fill(0);
}
function Gb(n, e) {
	var t;
	const r = [],
		i = n.doc.resolve(e),
		s = i.node(-1);
	if (!s) return V.empty;
	const o = J.get(s),
		l = i.start(-1),
		a = o.colCount(i.pos - l) + i.nodeAfter.attrs.colspan - 1;
	for (let c = 0; c < o.height; c++) {
		const d = a + c * o.width;
		if ((a == o.width - 1 || o.map[d] != o.map[d + 1]) && (c == 0 || o.map[d] != o.map[d - o.width])) {
			const u = o.map[d],
				f = l + u + s.nodeAt(u).nodeSize - 1,
				h = document.createElement('div');
			((h.className = 'column-resize-handle'),
				(t = Te.getState(n)) != null && t.dragging && r.push(ne.node(l + u, l + u + s.nodeAt(u).nodeSize, { class: 'column-resize-dragging' })),
				r.push(ne.widget(f, h)));
		}
	}
	return V.create(n.doc, r);
}
function Yb({ allowTableNodeSelection: n = !1 } = {}) {
	return new K({
		key: xt,
		state: {
			init() {
				return null;
			},
			apply(e, t) {
				const r = e.getMeta(xt);
				if (r != null) return r == -1 ? null : r;
				if (t == null || !e.docChanged) return t;
				const { deleted: i, pos: s } = e.mapping.mapResult(t);
				return i ? null : s;
			}
		},
		props: {
			decorations: cb,
			handleDOMEvents: { mousedown: Hb },
			createSelectionBetween(e) {
				return xt.getState(e.state) != null ? e.state.selection : null;
			},
			handleTripleClick: zb,
			handleKeyDown: Pb,
			handlePaste: Bb
		},
		appendTransaction(e, t, r) {
			return fb(r, Au(r, t), n);
		}
	});
}
var Iu = ee.create({
		name: 'tableCell',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		content: 'block+',
		addAttributes() {
			return {
				colspan: { default: 1 },
				rowspan: { default: 1 },
				colwidth: {
					default: null,
					parseHTML: (n) => {
						var e, t;
						const r = n.getAttribute('colwidth'),
							i = r ? r.split(',').map((s) => parseInt(s, 10)) : null;
						if (!i) {
							const s = (e = n.closest('table')) == null ? void 0 : e.querySelectorAll('colgroup > col'),
								o = Array.from(((t = n.parentElement) == null ? void 0 : t.children) || []).indexOf(n);
							if (o && o > -1 && s && s[o]) {
								const l = s[o].getAttribute('width');
								return l ? [parseInt(l, 10)] : null;
							}
						}
						return i;
					}
				}
			};
		},
		tableRole: 'cell',
		isolating: !0,
		parseHTML() {
			return [{ tag: 'td' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['td', _(this.options.HTMLAttributes, n), 0];
		}
	}),
	Du = ee.create({
		name: 'tableHeader',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		content: 'block+',
		addAttributes() {
			return {
				colspan: { default: 1 },
				rowspan: { default: 1 },
				colwidth: {
					default: null,
					parseHTML: (n) => {
						const e = n.getAttribute('colwidth');
						return e ? e.split(',').map((r) => parseInt(r, 10)) : null;
					}
				}
			};
		},
		tableRole: 'header_cell',
		isolating: !0,
		parseHTML() {
			return [{ tag: 'th' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['th', _(this.options.HTMLAttributes, n), 0];
		}
	}),
	Lu = ee.create({
		name: 'tableRow',
		addOptions() {
			return { HTMLAttributes: {} };
		},
		content: '(tableCell | tableHeader)*',
		tableRole: 'row',
		parseHTML() {
			return [{ tag: 'tr' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['tr', _(this.options.HTMLAttributes, n), 0];
		}
	});
function ao(n, e) {
	return e ? ['width', `${Math.max(e, n)}px`] : ['min-width', `${n}px`];
}
function Ba(n, e, t, r, i, s) {
	var o;
	let l = 0,
		a = !0,
		c = e.firstChild;
	const d = n.firstChild;
	if (d !== null)
		for (let f = 0, h = 0; f < d.childCount; f += 1) {
			const { colspan: p, colwidth: m } = d.child(f).attrs;
			for (let g = 0; g < p; g += 1, h += 1) {
				const y = i === h ? s : m && m[g],
					x = y ? `${y}px` : '';
				if (((l += y || r), y || (a = !1), c)) {
					if (c.style.width !== x) {
						const [M, T] = ao(r, y);
						c.style.setProperty(M, T);
					}
					c = c.nextSibling;
				} else {
					const M = document.createElement('col'),
						[T, S] = ao(r, y);
					(M.style.setProperty(T, S), e.appendChild(M));
				}
			}
		}
	for (; c; ) {
		const f = c.nextSibling;
		((o = c.parentNode) == null || o.removeChild(c), (c = f));
	}
	const u = n.attrs.style && typeof n.attrs.style == 'string' && /\bwidth\s*:/i.test(n.attrs.style);
	a && !u ? ((t.style.width = `${l}px`), (t.style.minWidth = '')) : ((t.style.width = ''), (t.style.minWidth = `${l}px`));
}
var Xb = class {
	constructor(n, e) {
		((this.node = n),
			(this.cellMinWidth = e),
			(this.dom = document.createElement('div')),
			(this.dom.className = 'tableWrapper'),
			(this.table = this.dom.appendChild(document.createElement('table'))),
			n.attrs.style && (this.table.style.cssText = n.attrs.style),
			(this.colgroup = this.table.appendChild(document.createElement('colgroup'))),
			Ba(n, this.colgroup, this.table, e),
			(this.contentDOM = this.table.appendChild(document.createElement('tbody'))));
	}
	update(n) {
		return n.type !== this.node.type ? !1 : ((this.node = n), Ba(n, this.colgroup, this.table, this.cellMinWidth), !0);
	}
	ignoreMutation(n) {
		const e = n.target,
			t = this.dom.contains(e),
			r = this.contentDOM.contains(e);
		return !!(t && !r && (n.type === 'attributes' || n.type === 'childList' || n.type === 'characterData'));
	}
};
function Qb(n, e, t, r) {
	let i = 0,
		s = !0;
	const o = [],
		l = n.firstChild;
	if (!l) return {};
	for (let u = 0, f = 0; u < l.childCount; u += 1) {
		const { colspan: h, colwidth: p } = l.child(u).attrs;
		for (let m = 0; m < h; m += 1, f += 1) {
			const g = t === f ? r : p && p[m];
			((i += g || e), g || (s = !1));
			const [y, x] = ao(e, g);
			o.push(['col', { style: `${y}: ${x}` }]);
		}
	}
	const a = s ? `${i}px` : '',
		c = s ? '' : `${i}px`;
	return { colgroup: ['colgroup', {}, ...o], tableWidth: a, tableMinWidth: c };
}
function Ha(n, e) {
	return n.createAndFill();
}
function Zb(n) {
	if (n.cached.tableNodeTypes) return n.cached.tableNodeTypes;
	const e = {};
	return (
		Object.keys(n.nodes).forEach((t) => {
			const r = n.nodes[t];
			r.spec.tableRole && (e[r.spec.tableRole] = r);
		}),
		(n.cached.tableNodeTypes = e),
		e
	);
}
function ek(n, e, t, r, i) {
	const s = Zb(n),
		o = [],
		l = [];
	for (let c = 0; c < t; c += 1) {
		const d = Ha(s.cell);
		if ((d && l.push(d), r)) {
			const u = Ha(s.header_cell);
			u && o.push(u);
		}
	}
	const a = [];
	for (let c = 0; c < e; c += 1) a.push(s.row.createChecked(null, r && c === 0 ? o : l));
	return s.table.createChecked(null, a);
}
function tk(n) {
	return n instanceof W;
}
var Pr = ({ editor: n }) => {
		const { selection: e } = n.state;
		if (!tk(e)) return !1;
		let t = 0;
		const r = Sd(e.ranges[0].$from, (s) => s.type.name === 'table');
		return (
			r?.node.descendants((s) => {
				if (s.type.name === 'table') return !1;
				['tableCell', 'tableHeader'].includes(s.type.name) && (t += 1);
			}),
			t === e.ranges.length ? (n.commands.deleteTable(), !0) : !1
		);
	},
	nk = '';
function rk(n) {
	return (n || '').replace(/\s+/g, ' ').trim();
}
function ik(n, e, t = {}) {
	var r;
	const i = (r = t.cellLineSeparator) != null ? r : nk;
	if (!n || !n.content || n.content.length === 0) return '';
	const s = [];
	n.content.forEach((p) => {
		const m = [];
		(p.content &&
			p.content.forEach((g) => {
				let y = '';
				g.content && Array.isArray(g.content) && g.content.length > 1
					? (y = g.content.map((S) => e.renderChildren(S)).join(i))
					: (y = g.content ? e.renderChildren(g.content) : '');
				const x = rk(y),
					M = g.type === 'tableHeader';
				m.push({ text: x, isHeader: M });
			}),
			s.push(m));
	});
	const o = s.reduce((p, m) => Math.max(p, m.length), 0);
	if (o === 0) return '';
	const l = new Array(o).fill(0);
	s.forEach((p) => {
		var m;
		for (let g = 0; g < o; g += 1) {
			const x = (((m = p[g]) == null ? void 0 : m.text) || '').length;
			(x > l[g] && (l[g] = x), l[g] < 3 && (l[g] = 3));
		}
	});
	const a = (p, m) => p + ' '.repeat(Math.max(0, m - p.length)),
		c = s[0],
		d = c.some((p) => p.isHeader);
	let u = `
`;
	const f = new Array(o).fill(0).map((p, m) => (d && c[m] && c[m].text) || '');
	return (
		(u += `| ${f.map((p, m) => a(p, l[m])).join(' | ')} |
`),
		(u += `| ${l.map((p) => '-'.repeat(Math.max(3, p))).join(' | ')} |
`),
		(d ? s.slice(1) : s).forEach((p) => {
			u += `| ${new Array(o)
				.fill(0)
				.map((m, g) => a((p[g] && p[g].text) || '', l[g]))
				.join(' | ')} |
`;
		}),
		u
	);
}
var sk = ik,
	Pu = ee.create({
		name: 'table',
		addOptions() {
			return {
				HTMLAttributes: {},
				resizable: !1,
				renderWrapper: !1,
				handleWidth: 5,
				cellMinWidth: 25,
				View: Xb,
				lastColumnResizable: !0,
				allowTableNodeSelection: !1
			};
		},
		content: 'tableRow+',
		tableRole: 'table',
		isolating: !0,
		group: 'block',
		parseHTML() {
			return [{ tag: 'table' }];
		},
		renderHTML({ node: n, HTMLAttributes: e }) {
			const { colgroup: t, tableWidth: r, tableMinWidth: i } = Qb(n, this.options.cellMinWidth),
				s = e.style;
			function o() {
				return s || (r ? `width: ${r}` : `min-width: ${i}`);
			}
			const l = ['table', _(this.options.HTMLAttributes, e, { style: o() }), t, ['tbody', 0]];
			return this.options.renderWrapper ? ['div', { class: 'tableWrapper' }, l] : l;
		},
		parseMarkdown: (n, e) => {
			const t = [];
			if (n.header) {
				const r = [];
				(n.header.forEach((i) => {
					r.push(e.createNode('tableHeader', {}, [{ type: 'paragraph', content: e.parseInline(i.tokens) }]));
				}),
					t.push(e.createNode('tableRow', {}, r)));
			}
			return (
				n.rows &&
					n.rows.forEach((r) => {
						const i = [];
						(r.forEach((s) => {
							i.push(e.createNode('tableCell', {}, [{ type: 'paragraph', content: e.parseInline(s.tokens) }]));
						}),
							t.push(e.createNode('tableRow', {}, i)));
					}),
				e.createNode('table', void 0, t)
			);
		},
		renderMarkdown: (n, e) => sk(n, e),
		addCommands() {
			return {
				insertTable:
					({ rows: n = 3, cols: e = 3, withHeaderRow: t = !0 } = {}) =>
					({ tr: r, dispatch: i, editor: s }) => {
						const o = ek(s.schema, n, e, t);
						if (i) {
							const l = r.selection.from + 1;
							r.replaceSelectionWith(o)
								.scrollIntoView()
								.setSelection(O.near(r.doc.resolve(l)));
						}
						return !0;
					},
				addColumnBefore:
					() =>
					({ state: n, dispatch: e }) =>
						mb(n, e),
				addColumnAfter:
					() =>
					({ state: n, dispatch: e }) =>
						gb(n, e),
				deleteColumn:
					() =>
					({ state: n, dispatch: e }) =>
						bb(n, e),
				addRowBefore:
					() =>
					({ state: n, dispatch: e }) =>
						xb(n, e),
				addRowAfter:
					() =>
					({ state: n, dispatch: e }) =>
						wb(n, e),
				deleteRow:
					() =>
					({ state: n, dispatch: e }) =>
						vb(n, e),
				deleteTable:
					() =>
					({ state: n, dispatch: e }) =>
						Ob(n, e),
				mergeCells:
					() =>
					({ state: n, dispatch: e }) =>
						Ta(n, e),
				splitCell:
					() =>
					({ state: n, dispatch: e }) =>
						Aa(n, e),
				toggleHeaderColumn:
					() =>
					({ state: n, dispatch: e }) =>
						fr('column')(n, e),
				toggleHeaderRow:
					() =>
					({ state: n, dispatch: e }) =>
						fr('row')(n, e),
				toggleHeaderCell:
					() =>
					({ state: n, dispatch: e }) =>
						Eb(n, e),
				mergeOrSplit:
					() =>
					({ state: n, dispatch: e }) =>
						Ta(n, e) ? !0 : Aa(n, e),
				setCellAttribute:
					(n, e) =>
					({ state: t, dispatch: r }) =>
						Tb(n, e)(t, r),
				goToNextCell:
					() =>
					({ state: n, dispatch: e }) =>
						Na(1)(n, e),
				goToPreviousCell:
					() =>
					({ state: n, dispatch: e }) =>
						Na(-1)(n, e),
				fixTables:
					() =>
					({ state: n, dispatch: e }) => (e && Au(n), !0),
				setCellSelection:
					(n) =>
					({ tr: e, dispatch: t }) => {
						if (t) {
							const r = W.create(e.doc, n.anchorCell, n.headCell);
							e.setSelection(r);
						}
						return !0;
					}
			};
		},
		addKeyboardShortcuts() {
			return {
				Tab: () =>
					this.editor.commands.goToNextCell() ? !0 : this.editor.can().addRowAfter() ? this.editor.chain().addRowAfter().goToNextCell().run() : !1,
				'Shift-Tab': () => this.editor.commands.goToPreviousCell(),
				Backspace: Pr,
				'Mod-Backspace': Pr,
				Delete: Pr,
				'Mod-Delete': Pr
			};
		},
		addProseMirrorPlugins() {
			return [
				...(this.options.resizable && this.editor.isEditable
					? [
							Fb({
								handleWidth: this.options.handleWidth,
								cellMinWidth: this.options.cellMinWidth,
								defaultCellMinWidth: this.options.cellMinWidth,
								View: this.options.View,
								lastColumnResizable: this.options.lastColumnResizable
							})
						]
					: []),
				Yb({ allowTableNodeSelection: this.options.allowTableNodeSelection })
			];
		},
		extendNodeSchema(n) {
			const e = { name: n.name, options: n.options, storage: n.storage };
			return { tableRole: z(E(n, 'tableRole', e)) };
		}
	});
B.create({
	name: 'tableKit',
	addExtensions() {
		const n = [];
		return (
			this.options.table !== !1 && n.push(Pu.configure(this.options.table)),
			this.options.tableCell !== !1 && n.push(Iu.configure(this.options.tableCell)),
			this.options.tableHeader !== !1 && n.push(Du.configure(this.options.tableHeader)),
			this.options.tableRow !== !1 && n.push(Lu.configure(this.options.tableRow)),
			n
		);
	}
});
var ok = B.create({
		name: 'textAlign',
		addOptions() {
			return { types: [], alignments: ['left', 'center', 'right', 'justify'], defaultAlignment: null };
		},
		addGlobalAttributes() {
			return [
				{
					types: this.options.types,
					attributes: {
						textAlign: {
							default: this.options.defaultAlignment,
							parseHTML: (n) => {
								const e = n.style.textAlign;
								return this.options.alignments.includes(e) ? e : this.options.defaultAlignment;
							},
							renderHTML: (n) => (n.textAlign ? { style: `text-align: ${n.textAlign}` } : {})
						}
					}
				}
			];
		},
		addCommands() {
			return {
				setTextAlign:
					(n) =>
					({ commands: e }) =>
						this.options.alignments.includes(n) ? this.options.types.map((t) => e.updateAttributes(t, { textAlign: n })).some((t) => t) : !1,
				unsetTextAlign:
					() =>
					({ commands: n }) =>
						this.options.types.map((e) => n.resetAttributes(e, 'textAlign')).some((e) => e),
				toggleTextAlign:
					(n) =>
					({ editor: e, commands: t }) =>
						this.options.alignments.includes(n) ? (e.isActive({ textAlign: n }) ? t.unsetTextAlign() : t.setTextAlign(n)) : !1
			};
		},
		addKeyboardShortcuts() {
			return {
				'Mod-Shift-l': () => this.editor.commands.setTextAlign('left'),
				'Mod-Shift-e': () => this.editor.commands.setTextAlign('center'),
				'Mod-Shift-r': () => this.editor.commands.setTextAlign('right'),
				'Mod-Shift-j': () => this.editor.commands.setTextAlign('justify')
			};
		}
	}),
	lk = /^((?:https?:)?\/\/)?((?:www|m|music)\.)?((?:youtube\.com|youtu\.be|youtube-nocookie\.com))(\/(?:[\w-]+\?v=|embed\/|v\/)?)([\w-]+)(\S+)?$/,
	ak = /^((?:https?:)?\/\/)?((?:www|m|music)\.)?((?:youtube\.com|youtu\.be|youtube-nocookie\.com))(\/(?:[\w-]+\?v=|embed\/|v\/)?)([\w-]+)(\S+)?$/g,
	zu = (n) => n.match(lk),
	$a = (n, e) =>
		e ? 'https://www.youtube-nocookie.com/embed/videoseries?list=' : n ? 'https://www.youtube-nocookie.com/embed/' : 'https://www.youtube.com/embed/',
	ck = (n) => {
		const {
			url: e,
			allowFullscreen: t,
			autoplay: r,
			ccLanguage: i,
			ccLoadPolicy: s,
			controls: o,
			disableKBcontrols: l,
			enableIFrameApi: a,
			endTime: c,
			interfaceLanguage: d,
			ivLoadPolicy: u,
			loop: f,
			modestBranding: h,
			nocookie: p,
			origin: m,
			playlist: g,
			progressBarColor: y,
			startAt: x,
			rel: M
		} = n;
		if (!zu(e)) return null;
		if (e.includes('/embed/')) return e;
		if (e.includes('youtu.be')) {
			const D = e.split('/').pop();
			return D ? `${$a(p)}${D}` : null;
		}
		const S = /(?:(v|list)=|shorts\/)([-\w]+)/gm.exec(e);
		if (!S || !S[2]) return null;
		let A = `${$a(p, S[1] === 'list')}${S[2]}`;
		const v = [];
		return (
			t === !1 && v.push('fs=0'),
			r && v.push('autoplay=1'),
			i && v.push(`cc_lang_pref=${i}`),
			s && v.push('cc_load_policy=1'),
			o || v.push('controls=0'),
			l && v.push('disablekb=1'),
			a && v.push('enablejsapi=1'),
			c && v.push(`end=${c}`),
			d && v.push(`hl=${d}`),
			u && v.push(`iv_load_policy=${u}`),
			f && v.push('loop=1'),
			h && v.push('modestbranding=1'),
			m && v.push(`origin=${m}`),
			g && v.push(`playlist=${g}`),
			x && v.push(`start=${x}`),
			y && v.push(`color=${y}`),
			M !== void 0 && v.push(`rel=${M}`),
			v.length && (A += `${S[1] === 'list' ? '&' : '?'}${v.join('&')}`),
			A
		);
	},
	dk = ee.create({
		name: 'youtube',
		addOptions() {
			return {
				addPasteHandler: !0,
				allowFullscreen: !0,
				autoplay: !1,
				ccLanguage: void 0,
				ccLoadPolicy: void 0,
				controls: !0,
				disableKBcontrols: !1,
				enableIFrameApi: !1,
				endTime: 0,
				height: 480,
				interfaceLanguage: void 0,
				ivLoadPolicy: 0,
				loop: !1,
				modestBranding: !1,
				HTMLAttributes: {},
				inline: !1,
				nocookie: !1,
				origin: '',
				playlist: '',
				progressBarColor: void 0,
				width: 640,
				rel: 1
			};
		},
		inline() {
			return this.options.inline;
		},
		group() {
			return this.options.inline ? 'inline' : 'block';
		},
		draggable: !0,
		addAttributes() {
			return { src: { default: null }, start: { default: 0 }, width: { default: this.options.width }, height: { default: this.options.height } };
		},
		parseHTML() {
			return [{ tag: 'div[data-youtube-video] iframe' }];
		},
		addCommands() {
			return {
				setYoutubeVideo:
					(n) =>
					({ commands: e }) =>
						zu(n.src) ? e.insertContent({ type: this.name, attrs: n }) : !1
			};
		},
		addPasteRules() {
			return this.options.addPasteHandler ? [gy({ find: ak, type: this.type, getAttributes: (n) => ({ src: n.input }) })] : [];
		},
		renderHTML({ HTMLAttributes: n }) {
			const e = ck({
				url: n.src,
				allowFullscreen: this.options.allowFullscreen,
				autoplay: this.options.autoplay,
				ccLanguage: this.options.ccLanguage,
				ccLoadPolicy: this.options.ccLoadPolicy,
				controls: this.options.controls,
				disableKBcontrols: this.options.disableKBcontrols,
				enableIFrameApi: this.options.enableIFrameApi,
				endTime: this.options.endTime,
				interfaceLanguage: this.options.interfaceLanguage,
				ivLoadPolicy: this.options.ivLoadPolicy,
				loop: this.options.loop,
				modestBranding: this.options.modestBranding,
				nocookie: this.options.nocookie,
				origin: this.options.origin,
				playlist: this.options.playlist,
				progressBarColor: this.options.progressBarColor,
				startAt: n.start || 0,
				rel: this.options.rel
			});
			return (
				(n.src = e),
				[
					'div',
					{ 'data-youtube-video': '' },
					[
						'iframe',
						_(
							this.options.HTMLAttributes,
							{
								width: this.options.width,
								height: this.options.height,
								allowfullscreen: this.options.allowFullscreen,
								autoplay: this.options.autoplay,
								ccLanguage: this.options.ccLanguage,
								ccLoadPolicy: this.options.ccLoadPolicy,
								disableKBcontrols: this.options.disableKBcontrols,
								enableIFrameApi: this.options.enableIFrameApi,
								endTime: this.options.endTime,
								interfaceLanguage: this.options.interfaceLanguage,
								ivLoadPolicy: this.options.ivLoadPolicy,
								loop: this.options.loop,
								modestBranding: this.options.modestBranding,
								origin: this.options.origin,
								playlist: this.options.playlist,
								progressBarColor: this.options.progressBarColor,
								rel: this.options.rel
							},
							n
						)
					]
				]
			);
		},
		...Gd({ nodeName: 'youtube', allowedAttributes: ['src', 'width', 'height', 'start'] })
	}),
	uk = 20,
	Bu = (n, e = 0) => {
		const t = [];
		return (
			!n.children.length ||
				e > uk ||
				Array.from(n.children).forEach((r) => {
					r.tagName === 'SPAN' ? t.push(r) : r.children.length && t.push(...Bu(r, e + 1));
				}),
			t
		);
	},
	fk = (n) => {
		if (!n.children.length) return;
		const e = Bu(n);
		e &&
			e.forEach((t) => {
				var r, i;
				const s = t.getAttribute('style'),
					o = (i = (r = t.parentElement) == null ? void 0 : r.closest('span')) == null ? void 0 : i.getAttribute('style');
				t.setAttribute('style', `${o};${s}`);
			});
	},
	Hu = It.create({
		name: 'textStyle',
		priority: 101,
		addOptions() {
			return { HTMLAttributes: {}, mergeNestedSpanStyles: !0 };
		},
		parseHTML() {
			return [{ tag: 'span', consuming: !1, getAttrs: (n) => (n.hasAttribute('style') ? (this.options.mergeNestedSpanStyles && fk(n), {}) : !1) }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['span', _(this.options.HTMLAttributes, n), 0];
		},
		addCommands() {
			return {
				toggleTextStyle:
					(n) =>
					({ commands: e }) =>
						e.toggleMark(this.name, n),
				removeEmptyTextStyle:
					() =>
					({ tr: n }) => {
						const { selection: e } = n;
						return (
							n.doc.nodesBetween(e.from, e.to, (t, r) => {
								if (t.isTextblock) return !0;
								t.marks.filter((i) => i.type === this.type).some((i) => Object.values(i.attrs).some((s) => !!s)) ||
									n.removeMark(r, r + t.nodeSize, this.type);
							}),
							!0
						);
					}
			};
		}
	}),
	hk = B.create({
		name: 'backgroundColor',
		addOptions() {
			return { types: ['textStyle'] };
		},
		addGlobalAttributes() {
			return [
				{
					types: this.options.types,
					attributes: {
						backgroundColor: {
							default: null,
							parseHTML: (n) => {
								var e;
								const t = n.getAttribute('style');
								if (t) {
									const r = t
										.split(';')
										.map((i) => i.trim())
										.filter(Boolean);
									for (let i = r.length - 1; i >= 0; i -= 1) {
										const s = r[i].split(':');
										if (s.length >= 2) {
											const o = s[0].trim().toLowerCase(),
												l = s.slice(1).join(':').trim();
											if (o === 'background-color') return l.replace(/['"]+/g, '');
										}
									}
								}
								return (e = n.style.backgroundColor) == null ? void 0 : e.replace(/['"]+/g, '');
							},
							renderHTML: (n) => (n.backgroundColor ? { style: `background-color: ${n.backgroundColor}` } : {})
						}
					}
				}
			];
		},
		addCommands() {
			return {
				setBackgroundColor:
					(n) =>
					({ chain: e }) =>
						e().setMark('textStyle', { backgroundColor: n }).run(),
				unsetBackgroundColor:
					() =>
					({ chain: n }) =>
						n().setMark('textStyle', { backgroundColor: null }).removeEmptyTextStyle().run()
			};
		}
	}),
	$u = B.create({
		name: 'color',
		addOptions() {
			return { types: ['textStyle'] };
		},
		addGlobalAttributes() {
			return [
				{
					types: this.options.types,
					attributes: {
						color: {
							default: null,
							parseHTML: (n) => {
								var e;
								const t = n.getAttribute('style');
								if (t) {
									const r = t
										.split(';')
										.map((i) => i.trim())
										.filter(Boolean);
									for (let i = r.length - 1; i >= 0; i -= 1) {
										const s = r[i].split(':');
										if (s.length >= 2) {
											const o = s[0].trim().toLowerCase(),
												l = s.slice(1).join(':').trim();
											if (o === 'color') return l.replace(/['"]+/g, '');
										}
									}
								}
								return (e = n.style.color) == null ? void 0 : e.replace(/['"]+/g, '');
							},
							renderHTML: (n) => (n.color ? { style: `color: ${n.color}` } : {})
						}
					}
				}
			];
		},
		addCommands() {
			return {
				setColor:
					(n) =>
					({ chain: e }) =>
						e().setMark('textStyle', { color: n }).run(),
				unsetColor:
					() =>
					({ chain: n }) =>
						n().setMark('textStyle', { color: null }).removeEmptyTextStyle().run()
			};
		}
	}),
	Fu = B.create({
		name: 'fontFamily',
		addOptions() {
			return { types: ['textStyle'] };
		},
		addGlobalAttributes() {
			return [
				{
					types: this.options.types,
					attributes: {
						fontFamily: {
							default: null,
							parseHTML: (n) => n.style.fontFamily,
							renderHTML: (n) => (n.fontFamily ? { style: `font-family: ${n.fontFamily}` } : {})
						}
					}
				}
			];
		},
		addCommands() {
			return {
				setFontFamily:
					(n) =>
					({ chain: e }) =>
						e().setMark('textStyle', { fontFamily: n }).run(),
				unsetFontFamily:
					() =>
					({ chain: n }) =>
						n().setMark('textStyle', { fontFamily: null }).removeEmptyTextStyle().run()
			};
		}
	}),
	pk = B.create({
		name: 'fontSize',
		addOptions() {
			return { types: ['textStyle'] };
		},
		addGlobalAttributes() {
			return [
				{
					types: this.options.types,
					attributes: {
						fontSize: {
							default: null,
							parseHTML: (n) => n.style.fontSize,
							renderHTML: (n) => (n.fontSize ? { style: `font-size: ${n.fontSize}` } : {})
						}
					}
				}
			];
		},
		addCommands() {
			return {
				setFontSize:
					(n) =>
					({ chain: e }) =>
						e().setMark('textStyle', { fontSize: n }).run(),
				unsetFontSize:
					() =>
					({ chain: n }) =>
						n().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run()
			};
		}
	}),
	mk = B.create({
		name: 'lineHeight',
		addOptions() {
			return { types: ['textStyle'] };
		},
		addGlobalAttributes() {
			return [
				{
					types: this.options.types,
					attributes: {
						lineHeight: {
							default: null,
							parseHTML: (n) => n.style.lineHeight,
							renderHTML: (n) => (n.lineHeight ? { style: `line-height: ${n.lineHeight}` } : {})
						}
					}
				}
			];
		},
		addCommands() {
			return {
				setLineHeight:
					(n) =>
					({ chain: e }) =>
						e().setMark('textStyle', { lineHeight: n }).run(),
				unsetLineHeight:
					() =>
					({ chain: n }) =>
						n().setMark('textStyle', { lineHeight: null }).removeEmptyTextStyle().run()
			};
		}
	});
B.create({
	name: 'textStyleKit',
	addExtensions() {
		const n = [];
		return (
			this.options.backgroundColor !== !1 && n.push(hk.configure(this.options.backgroundColor)),
			this.options.color !== !1 && n.push($u.configure(this.options.color)),
			this.options.fontFamily !== !1 && n.push(Fu.configure(this.options.fontFamily)),
			this.options.fontSize !== !1 && n.push(pk.configure(this.options.fontSize)),
			this.options.lineHeight !== !1 && n.push(mk.configure(this.options.lineHeight)),
			this.options.textStyle !== !1 && n.push(Hu.configure(this.options.textStyle)),
			n
		);
	}
});
var gk = /(?:^|\s)(!\[(.+|:?)]\((\S+)(?:(?:\s+)["'](\S+)["'])?\))$/,
	yk = ee.create({
		name: 'image',
		addOptions() {
			return { inline: !1, allowBase64: !1, HTMLAttributes: {}, resize: !1 };
		},
		inline() {
			return this.options.inline;
		},
		group() {
			return this.options.inline ? 'inline' : 'block';
		},
		draggable: !0,
		addAttributes() {
			return { src: { default: null }, alt: { default: null }, title: { default: null }, width: { default: null }, height: { default: null } };
		},
		parseHTML() {
			return [{ tag: this.options.allowBase64 ? 'img[src]' : 'img[src]:not([src^="data:"])' }];
		},
		renderHTML({ HTMLAttributes: n }) {
			return ['img', _(this.options.HTMLAttributes, n)];
		},
		parseMarkdown: (n, e) => e.createNode('image', { src: n.href, title: n.title, alt: n.text }),
		renderMarkdown: (n) => {
			var e, t, r, i, s, o;
			const l = (t = (e = n.attrs) == null ? void 0 : e.src) != null ? t : '',
				a = (i = (r = n.attrs) == null ? void 0 : r.alt) != null ? i : '',
				c = (o = (s = n.attrs) == null ? void 0 : s.title) != null ? o : '';
			return c ? `![${a}](${l} "${c}")` : `![${a}](${l})`;
		},
		addNodeView() {
			if (!this.options.resize || !this.options.resize.enabled || typeof document > 'u') return null;
			const { directions: n, minWidth: e, minHeight: t, alwaysPreserveAspectRatio: r } = this.options.resize;
			return ({ node: i, getPos: s, HTMLAttributes: o, editor: l }) => {
				const a = document.createElement('img');
				(Object.entries(o).forEach(([u, f]) => {
					if (f != null)
						switch (u) {
							case 'width':
							case 'height':
								break;
							default:
								a.setAttribute(u, f);
								break;
						}
				}),
					(a.src = o.src));
				const c = new ay({
						element: a,
						editor: l,
						node: i,
						getPos: s,
						onResize: (u, f) => {
							((a.style.width = `${u}px`), (a.style.height = `${f}px`));
						},
						onCommit: (u, f) => {
							const h = s();
							h !== void 0 && this.editor.chain().setNodeSelection(h).updateAttributes(this.name, { width: u, height: f }).run();
						},
						onUpdate: (u, f, h) => u.type === i.type,
						options: { directions: n, min: { width: e, height: t }, preserveAspectRatio: r === !0 }
					}),
					d = c.dom;
				return (
					(d.style.visibility = 'hidden'),
					(d.style.pointerEvents = 'none'),
					(a.onload = () => {
						((d.style.visibility = ''), (d.style.pointerEvents = ''));
					}),
					c
				);
			};
		},
		addCommands() {
			return {
				setImage:
					(n) =>
					({ commands: e }) =>
						e.insertContent({ type: this.name, attrs: n })
			};
		},
		addInputRules() {
			return [
				Jd({
					find: gk,
					type: this.type,
					getAttributes: (n) => {
						const [, , e, t, r] = n;
						return { src: t, alt: e, title: r };
					}
				})
			];
		}
	});
const Fa =
		'text-align: center;position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0, 0, 0, .5); color: #fff; padding: 5px; font-size: 16px;',
	bk = yk.extend({
		addOptions() {
			return {
				inline: !1,
				HTMLAttributes: {},
				resize: !1,
				...this.parent?.(),
				id: null,
				media_image: null,
				allowBase64: !0,
				sizes: ['25%', '50%', '75%', '100%']
			};
		},
		addCommands() {
			return {
				...this.parent?.(),
				setImageFloat:
					(n) =>
					({ commands: e }) =>
						e.updateAttributes(this.name, { float: n }),
				setImageDescription:
					(n) =>
					({ commands: e }) =>
						e.updateAttributes(this.name, { description: n })
			};
		},
		addAttributes() {
			return {
				id: { default: null },
				storage_image: { default: null, parseHTML: (n) => n.querySelector('img').getAttribute('storage_image') },
				src: { default: null, parseHTML: (n) => n.querySelector('img').getAttribute('src') },
				alt: { default: null, parseHTML: (n) => n.querySelector('img').getAttribute('alt') },
				float: { default: 'unset', parseHTML: (n) => n.style.float },
				w: { default: '200px', parseHTML: (n) => n.style.width },
				h: { default: null, parseHTML: (n) => n.style.height },
				margin: { default: 'unset', parseHTML: (n) => n.style.margin },
				textAlign: { default: 'unset', parseHTML: (n) => n.style.textAlign },
				default: { default: !1 },
				description: { default: '', parseHTML: (n) => n.querySelector('.description')?.innerText || '' },
				style: { default: null, parseHTML: (n) => n.style.cssText }
			};
		},
		renderHTML({ HTMLAttributes: n }) {
			const { float: e, w: t, h: r, margin: i, textAlign: s, description: o, ...l } = n;
			return [
				'div',
				{ style: `text-align: ${s};float: ${e};width: ${t};height: ${r}; margin: ${i}; position: relative;` },
				['img', this.options.HTMLAttributes, l],
				o ? ['div', { class: 'description', style: Fa }, o] : ''
			];
		},
		parseHTML() {
			return [
				{ tag: 'div[style*="float"]', getAttrs: (n) => (n.querySelector('img') ? {} : !1) },
				{ tag: 'img[src]', getAttrs: (n) => (n.closest('div[style*="float"]') ? !1 : {}) }
			];
		},
		addNodeView() {
			return ({ editor: n, node: e, getPos: t }) => {
				const r = e.attrs;
				r._ = null;
				const i = document.createElement('div');
				((i.style.position = 'relative'), (i.style.display = 'inline-block'));
				const s = ['left', 'right', 'unset', 'none'].includes(r.float) ? r.float : 'unset';
				((i.style.float = s), (i.style.lineHeight = '0'));
				const o = document.createElement('div');
				o.style.position = 'relative';
				const l = String(r.w || '200px').match(/^\d+(%|px)$/) ? String(r.w) : '200px',
					a = r.h && String(r.h).match(/^\d+(%|px)$/) ? String(r.h) : 'auto';
				((o.style.width = l), (o.style.height = a), (o.style.display = 'inline-block'));
				const c = document.createElement('img');
				if (
					(c.setAttribute('src', r.src),
					c.setAttribute('alt', r.alt),
					(c.style.width = '100%'),
					(c.style.height = '100%'),
					(c.style.cursor = 'pointer'),
					o.appendChild(c),
					i.appendChild(o),
					r.description)
				) {
					const m = document.createElement('div');
					((m.textContent = r.description), (m.style.cssText = Fa), i.appendChild(m));
				}
				const d = document.createElement('div'),
					u = document.createElement('div');
				((d.style.cssText = 'cursor: ew-resize;width: 15px; height: 100%;  position: absolute; top:0;left:0;transform:translateX(-50%)'),
					(u.style.cssText = 'cursor: ew-resize;width: 15px; height: 100%;  position: absolute; top:0;right:0;transform:translateX(50%)'),
					o.appendChild(d),
					o.appendChild(u),
					(d.onpointerdown = (m) => _a(m, d, 'left', o, r)),
					(u.onpointerdown = (m) => _a(m, u, 'right', o, r)));
				let f = !1;
				const h = (m) => {
						if (!f) return;
						const g = m.clientX - o.getBoundingClientRect().left;
						((o.style.width = `${g}px`), _u(o, r, `${g}px`, m.shiftKey));
					},
					p = () => {
						if (((f = !1), document.removeEventListener('mousemove', h), document.removeEventListener('mouseup', p), typeof t == 'function')) {
							const m = t();
							m !== void 0 && n.view.dispatch(n.view.state.tr.setNodeMarkup(m, void 0, { ...r, w: o.style.width, h: o.style.height }));
						}
					};
				return (
					(c.onmousedown = (m) => {
						(m.preventDefault(), (f = !0), document.addEventListener('mousemove', h), document.addEventListener('mouseup', p));
					}),
					{ dom: i }
				);
			};
		}
	});
function _u(n, e, t, r = !0) {
	if (!r) return;
	const i = n.querySelector('img');
	if (!i) return;
	const s = i.naturalWidth,
		o = i.naturalHeight;
	if (s && o) {
		const l = o / s,
			a = parseInt(t),
			c = Math.round(a * l);
		e.h = n.style.height = `${c}px`;
	}
}
function _a(n, e, t, r, i) {
	(n.preventDefault(), n.stopPropagation());
	const s = n.shiftKey;
	(e.setPointerCapture(n.pointerId),
		(e.onpointermove = (o) => {
			if (t == 'left' || t == 'right') {
				const l = parseInt(r.style.width, 10),
					a = t === 'left' ? o.movementX * -1 : o.movementX,
					c = l + a;
				((r.style.width = `${c}px`), (i.w = `${c}px`), _u(r, i, `${c}px`, s));
			} else {
				const l = parseInt(r.style.height, 10),
					a = t === 'top' ? o.movementY * -1 : o.movementY,
					c = l + a;
				((r.style.height = `${c}px`), (i.h = `${c}px`));
			}
		}),
		(e.onpointerup = () => {
			((e.onpointermove = null), (e.onpointerup = null));
		}));
}
const kk = Hu.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			fontSize: {
				default: null,
				parseHTML: (n) => {
					const e = n.style.fontSize;
					return e ? e.replace(/px$/, '') : null;
				},
				renderHTML: (n) => {
					if (!n.fontSize) return {};
					const e = n.fontSize;
					return { style: `font-size: ${/^\d+$/.test(String(e)) ? `${e}px` : e}` };
				}
			}
		};
	},
	addCommands() {
		return {
			...this.parent?.(),
			setFontSize:
				(n) =>
				({ chain: e }) => {
					const t = String(n),
						r = t.match(/^\d+(\.\d+)?(px|em|rem|%)$/) ? t : '16px';
					return e().focus().setMark(this.name, { fontSize: r }).run();
				},
			unsetFontSize:
				() =>
				({ chain: n }) =>
					n().focus().setMark(this.name, { fontSize: null }).removeEmptyTextStyle().run()
		};
	}
});
function xk(n, e, t, r = {}) {
	return new oy({
		element: n,
		extensions: [
			Q0.configure({ link: !1, underline: !1 }),
			kk,
			Fu,
			$u,
			bk,
			yu,
			c0.configure({ openOnClick: !1 }),
			Z0.configure({
				placeholder: ({ node: i }) => (i.type.name === 'heading' ? 'Write a heading…' : 'Start writing your awesome content…'),
				includeChildren: !0,
				emptyEditorClass: 'is-editor-empty'
			}),
			Pu.configure({ resizable: !0 }),
			Lu,
			Du,
			Iu,
			ok.configure({ types: ['heading', 'paragraph', 'image'] }),
			dk.configure({ modestBranding: !0, HTMLAttributes: { class: 'w-full aspect-video' } }),
			K0,
			B.create({
				name: 'Tab',
				addKeyboardShortcuts() {
					return { Tab: ({ editor: i }) => i.commands.insertContent('	') };
				}
			})
		],
		content: e,
		editorProps: { attributes: { class: 'prose dark:prose-invert max-w-none focus:outline-none', dir: ff(t) } }
	});
}
var wk = ve('<iconify-icon></iconify-icon>', 2),
	Sk = ve('<span> </span> <iconify-icon></iconify-icon>', 3),
	vk = ve('<button></button>'),
	Ck = ve(
		'<div class="p-2 w-48"><div class="mb-2 text-xs font-medium text-surface-500 dark:text-surface-50 text-center"> </div> <div class="grid grid-cols-5 gap-1" role="grid" tabindex="0"></div></div>'
	),
	Mk = ve('<button> </button>'),
	Tk = ve(
		'<div class="absolute top-full left-0 mt-1 min-w-[180px] rounded-lg border border-surface-200 bg-white p-1 shadow-lg dark:text-surface-50 dark:bg-surface-900 z-50 ring-1 ring-black/5"><!></div>'
	),
	Ak = ve('<div class="relative"><button><!> <!></button> <!></div>'),
	Ek = ve('<button><iconify-icon></iconify-icon></button>', 2),
	Nk = ve('<div class="flex items-center gap-1"><!> <div class="h-5 w-px bg-surface-300 dark:bg-surface-700 mx-1"></div></div>'),
	Ok = ve(
		'<textarea class="w-full min-h-96 p-4 font-mono text-sm bg-surface-50 dark:bg-surface-900 text-surface-900 dark:text-gray-200 border-none resize-y outline-none"></textarea>'
	),
	Rk = ve(
		'<div class="border-t border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20 px-8 py-4 text-sm text-red-700 dark:text-red-300"> </div>'
	),
	Ik = ve(
		'<button class="flex w-full items-center gap-4 rounded-xl px-5 py-4 hover:bg-surface-100 dark:hover:bg-surface-700 transition"><iconify-icon></iconify-icon> <div class="text-left"><div class="font-medium text-surface-900 dark:text-white">Ask AI</div> <div class="text-sm text-surface-500 dark:text-surface-50">Generate or rewrite with AI</div></div></button>',
		2
	),
	Dk = ve(
		'<div role="button" tabindex="0" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"><div class="w-full max-w-lg rounded-2xl border border-surface-300 dark:text-surface-50 bg-white dark:bg-surface-900 p-6 shadow-2xl"><h3 class="mb-5 text-xl font-semibold text-surface-900 dark:text-white">Command Menu</h3> <div class="space-y-2"><button class="flex w-full items-center gap-4 rounded-xl px-5 py-4 hover:bg-surface-100 dark:hover:bg-surface-700 transition"><iconify-icon></iconify-icon> <div class="text-left"><div class="font-medium text-surface-900 dark:text-white">Hard Break</div> <div class="text-sm text-surface-500 dark:text-surface-50">Insert line break</div></div></button> <!></div></div></div>',
		2
	),
	Lk =
		ve(`<div><div><div class="w-full flex max-w-none flex-wrap items-center gap-1"></div></div> <div></div>  <input type="text" class="sr-only" aria-hidden="true" tabindex="-1"/> <!> <style>:global(.ProseMirror) {
			outline: none;
		}
		:global(.ProseMirror p.is-editor-empty:first-child::before) {
			color: #adb5bd;
			content: attr(data-placeholder);
			float: left;
			height: 0;
			pointer-events: none;
		}
		:global(.ProseMirror table) {
			border-collapse: collapse;
			margin: 0;
			overflow: hidden;
			table-layout: fixed;
			width: 100%;
		}
		:global(.ProseMirror td),
		:global(.ProseMirror th) {
			border: 1px solid #ced4da;
			box-sizing: border-box;
			min-width: 1em;
			padding: 6px 8px;
			position: relative;
			vertical-align: top;
		}
		:global(.ProseMirror th) {
			background-color: #f1f3f5;
			font-weight: bold;
			text-align: left;
		}
		/* Dark mode table styles */
		:global(.dark .ProseMirror td),
		:global(.dark .ProseMirror th) {
			border-color: #3f3f46; /* surface-700 */
		}
		:global(.dark .ProseMirror th) {
			background-color: #27272a; /* surface-800 */
		}</style> <!> <!> <input type="color" class="hidden"/></div>`);
function Qk(n, e) {
	Zu(e, !0);
	let t = df(e, 'value', 15);
	const r = ef(() => (e.field.translated ? hf.contentLanguage : 'default'));
	Zo(() => {
		(t() || t({}), t()[b(r)] || t((t()[b(r)] = { title: '', content: '' }), !0));
	});
	let i = Bt(null),
		s,
		o = Bt(!1),
		l = Bt(!1),
		a = Bt(!1),
		c = Bt(null),
		d,
		u = Bt(0),
		f = Bt(0);
	function h(I, H) {
		(H.stopPropagation(), se(c, b(c) === I ? null : I, !0));
	}
	function p() {
		se(c, null);
	}
	function m(I) {
		const H = I.target.value;
		b(i)?.chain().focus().setColor(H).run();
	}
	function g() {
		pf({
			component: 'mediaLibraryModal',
			response: (I) => {
				if (I && I.length > 0) {
					const H = I[0];
					b(i)?.chain().focus().setImage({ src: H.url, alt: H.name }).run();
				}
			}
		});
	}
	async function y() {
		try {
			const I = await navigator.clipboard.readText();
			b(i)?.chain().focus().insertContent(I).run();
		} catch (I) {
			(console.error('Failed to read clipboard:', I), alert('Could not access clipboard. Please check permissions.'));
		}
	}
	function x() {
		const I = prompt('Enter YouTube URL');
		I && b(i)?.chain().focus().setYoutubeVideo({ src: I }).run();
	}
	const M = [
		{
			buttons: [
				{
					type: 'button',
					icon: 'arrow-u-left-top',
					label: 'Undo',
					shortcut: 'Ctrl+Z',
					cmd: () => b(i)?.chain().focus().undo().run(),
					active: () => !1
				},
				{
					type: 'button',
					icon: 'arrow-u-right-top',
					label: 'Redo',
					shortcut: 'Ctrl+Shift+Z',
					cmd: () => b(i)?.chain().focus().redo().run(),
					active: () => !1
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'format-bold',
					label: 'Bold',
					shortcut: 'Ctrl+B',
					cmd: () => b(i)?.chain().focus().toggleBold().run(),
					active: () => b(i)?.isActive('bold') ?? !1
				},
				{
					type: 'button',
					icon: 'format-italic',
					label: 'Italic',
					shortcut: 'Ctrl+I',
					cmd: () => b(i)?.chain().focus().toggleItalic().run(),
					active: () => b(i)?.isActive('italic') ?? !1
				},
				{
					type: 'button',
					icon: 'format-underlined',
					label: 'Underline',
					shortcut: 'Ctrl+U',
					cmd: () => b(i)?.chain().focus().toggleUnderline().run(),
					active: () => b(i)?.isActive('underline') ?? !1
				},
				{
					type: 'button',
					icon: 'format-strikethrough-variant',
					label: 'Strikethrough',
					cmd: () => b(i)?.chain().focus().toggleStrike().run(),
					active: () => b(i)?.isActive('strike') ?? !1
				},
				{ type: 'button', icon: 'format-clear', label: 'Clear Formatting', cmd: () => b(i)?.chain().focus().unsetAllMarks().run(), active: () => !1 }
			]
		},
		{
			buttons: [
				{
					type: 'dropdown',
					label: 'Color',
					icon: 'palette',
					items: [
						{ label: 'Default', cmd: () => b(i)?.chain().focus().unsetColor().run(), active: () => !b(i)?.getAttributes('textStyle').color },
						{ label: 'Custom...', cmd: () => d?.click(), active: () => b(i)?.isActive('textStyle', { color: /.*/ }) ?? !1 }
					]
				},
				{
					type: 'dropdown',
					label: 'Font',
					items: [
						{
							label: 'Default',
							cmd: () => b(i)?.chain().focus().unsetFontFamily().run(),
							active: () => !b(i)?.getAttributes('textStyle').fontFamily
						},
						{
							label: 'Inter',
							cmd: () => b(i)?.chain().focus().setFontFamily('Inter').run(),
							active: () => b(i)?.isActive('textStyle', { fontFamily: 'Inter' }) ?? !1
						},
						{
							label: 'Comic Sans',
							cmd: () => b(i)?.chain().focus().setFontFamily('Comic Sans MS, Comic Sans').run(),
							active: () => b(i)?.isActive('textStyle', { fontFamily: 'Comic Sans MS, Comic Sans' }) ?? !1
						},
						{
							label: 'Serif',
							cmd: () => b(i)?.chain().focus().setFontFamily('serif').run(),
							active: () => b(i)?.isActive('textStyle', { fontFamily: 'serif' }) ?? !1
						},
						{
							label: 'Monospace',
							cmd: () => b(i)?.chain().focus().setFontFamily('monospace').run(),
							active: () => b(i)?.isActive('textStyle', { fontFamily: 'monospace' }) ?? !1
						},
						{
							label: 'Cursive',
							cmd: () => b(i)?.chain().focus().setFontFamily('cursive').run(),
							active: () => b(i)?.isActive('textStyle', { fontFamily: 'cursive' }) ?? !1
						}
					]
				},
				{
					type: 'dropdown',
					label: 'Text',
					items: [
						{ label: 'Paragraph', cmd: () => b(i)?.chain().focus().setParagraph().run(), active: () => b(i)?.isActive('paragraph') ?? !1 },
						{
							label: 'Heading 1',
							cmd: () => b(i)?.chain().focus().toggleHeading({ level: 1 }).run(),
							active: () => b(i)?.isActive('heading', { level: 1 }) ?? !1
						},
						{
							label: 'Heading 2',
							cmd: () => b(i)?.chain().focus().toggleHeading({ level: 2 }).run(),
							active: () => b(i)?.isActive('heading', { level: 2 }) ?? !1
						},
						{
							label: 'Heading 3',
							cmd: () => b(i)?.chain().focus().toggleHeading({ level: 3 }).run(),
							active: () => b(i)?.isActive('heading', { level: 3 }) ?? !1
						}
					]
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'format-list-bulleted',
					label: 'Bullet List',
					cmd: () => b(i)?.chain().focus().toggleBulletList().run(),
					active: () => b(i)?.isActive('bulletList') ?? !1
				},
				{
					type: 'button',
					icon: 'format-list-numbered',
					label: 'Numbered List',
					cmd: () => b(i)?.chain().focus().toggleOrderedList().run(),
					active: () => b(i)?.isActive('orderedList') ?? !1
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'link',
					label: 'Link',
					cmd: () =>
						b(i)
							?.chain()
							.focus()
							.setLink({ href: prompt('Enter URL') || '' })
							.run()
				},
				{ type: 'button', icon: 'image', label: 'Image', cmd: g },
				{ type: 'button', icon: 'youtube', label: 'Video', cmd: x },
				{ type: 'dropdown', icon: 'table', label: 'Table' },
				{
					type: 'button',
					icon: 'code-tags',
					label: 'Code Block',
					cmd: () => b(i)?.chain().focus().toggleCodeBlock().run(),
					active: () => b(i)?.isActive('codeBlock') ?? !1
				}
			]
		},
		{
			buttons: [
				{
					type: 'button',
					icon: 'format-align-left',
					label: 'Align Left',
					cmd: () => b(i)?.chain().focus().setTextAlign('left').run(),
					active: () => b(i)?.isActive({ textAlign: 'left' }) ?? !1
				},
				{
					type: 'button',
					icon: 'format-align-center',
					label: 'Align Center',
					cmd: () => b(i)?.chain().focus().setTextAlign('center').run(),
					active: () => b(i)?.isActive({ textAlign: 'center' }) ?? !1
				},
				{
					type: 'button',
					icon: 'format-align-right',
					label: 'Align Right',
					cmd: () => b(i)?.chain().focus().setTextAlign('right').run(),
					active: () => b(i)?.isActive({ textAlign: 'right' }) ?? !1
				},
				{
					type: 'button',
					icon: 'format-quote-close',
					label: 'Blockquote',
					cmd: () => b(i)?.chain().focus().toggleBlockquote().run(),
					active: () => b(i)?.isActive('blockquote') ?? !1
				}
			]
		},
		{
			condition: () => !!e.field.aiEnabled,
			buttons: [
				{
					type: 'button',
					icon: 'sparkles',
					label: 'AI Command',
					shortcut: '/',
					cmd: () => {
						se(l, !0);
					}
				}
			]
		},
		{
			buttons: [
				{ type: 'button', icon: 'content-paste', label: 'Paste Plain Text', cmd: y },
				{ type: 'button', icon: 'xml', label: 'Source View', cmd: () => se(a, !b(a)), active: () => b(a) }
			]
		}
	];
	function T() {
		se(o, window.scrollY > 120);
	}
	(Xu(() => {
		const I = t()?.[b(r)]?.content || '';
		(se(i, xk(s, I, b(r), { aiEnabled: !!e.field.aiEnabled }), !0),
			b(i).on('update', () => {
				b(i) && t({ ...t(), [b(r)]: { title: t()?.[b(r)]?.title || '', content: b(i).isEmpty ? '' : b(i).getHTML() } });
			}),
			window.addEventListener('scroll', T),
			window.addEventListener('click', p));
	}),
		Qu(() => {
			(b(i)?.destroy(), window.removeEventListener('scroll', T), window.removeEventListener('click', p));
		}),
		Zo(() => {
			const I = t()?.[b(r)]?.content || '';
			b(i) && b(i).getHTML() !== I && b(i).commands.setContent(I, { emitUpdate: !1 });
		}));
	var S = Lk(),
		A = oe(S),
		v = oe(A);
	(zn(
		v,
		21,
		() => M,
		Bn,
		(I, H) => {
			var ze = Pn(),
				nn = hn(ze);
			{
				var rn = (Dt) => {
					var In = Nk(),
						Ji = oe(In);
					(zn(
						Ji,
						17,
						() => b(H).buttons,
						Bn,
						(ye, $) => {
							var sn = Pn(),
								Vu = hn(sn);
							{
								var Wu = (on) => {
										var Be = Ak(),
											Ze = oe(Be);
										Ze.__click = (Ce) => h(b($).label, Ce);
										var ln = oe(Ze);
										{
											var Ku = (Ce) => {
												var je = wk();
												($e(() => et(je, 'icon', `mdi:${b($).icon ?? ''}`)), et(je, 'width', '20'), Z(Ce, je));
											};
											He(ln, (Ce) => {
												b($).icon && Ce(Ku);
											});
										}
										var Uu = Ee(ln, 2);
										{
											var qu = (Ce) => {
												var je = Sk(),
													an = hn(je),
													Gi = oe(an, !0);
												Q(an);
												var Yi = Ee(an, 2);
												(et(Yi, 'icon', 'mdi:chevron-down'),
													$e(() => {
														(Ke(an, 1, af(b($).icon ? 'hidden sm:inline' : '')), kr(Gi, b($).label));
													}),
													Z(Ce, je));
											};
											He(Uu, (Ce) => {
												(!b($).icon || b($).label !== 'Table') && Ce(qu);
											});
										}
										Q(Ze);
										var Ju = Ee(Ze, 2);
										{
											var Gu = (Ce) => {
												var je = Tk(),
													an = oe(je);
												{
													var Gi = (cn) => {
															var dn = Ck(),
																Dn = oe(dn),
																Xi = oe(Dn);
															Q(Dn);
															var Lt = Ee(Dn, 2);
															(zn(
																Lt,
																20,
																() => Array(5),
																Bn,
																(yr, Qo, Pt) => {
																	var un = Pn(),
																		zt = hn(un);
																	(zn(
																		zt,
																		16,
																		() => Array(5),
																		Bn,
																		(Qi, br, Ln, Pk) => {
																			var fn = vk();
																			((fn.__mouseover = () => {
																				(se(u, Pt + 1), se(f, Ln + 1));
																			}),
																				(fn.__click = (Yu) => {
																					(Yu.stopPropagation(),
																						b(i)
																							?.chain()
																							.focus()
																							.insertTable({ rows: Pt + 1, cols: Ln + 1, withHeaderRow: !0 })
																							.run(),
																						p());
																				}),
																				Hn(fn, 'aria-label', `${Pt + 1} by ${Ln + 1} table`),
																				$e(() =>
																					Ke(
																						fn,
																						1,
																						`w-8 h-8 rounded-sm border transition-colors ${Pt < b(u) && Ln < b(f) ? 'bg-blue-100 border-blue-500 dark:bg-blue-500/30 dark:border-blue-400' : 'bg-surface-50 border-surface-200 dark:bg-surface-800 dark:text-surface-50'}`
																					)
																				),
																				el('focus', fn, () => {
																					(se(u, Pt + 1), se(f, Ln + 1));
																				}),
																				Z(Qi, fn));
																		}
																	),
																		Z(yr, un));
																}
															),
																Q(Lt),
																Q(dn),
																$e(() => kr(Xi, `${(b(u) || 1) ?? ''} x ${(b(f) || 1) ?? ''}`)),
																el('mouseleave', Lt, () => {
																	(se(u, 0), se(f, 0));
																}),
																Z(cn, dn));
														},
														Yi = (cn) => {
															var dn = Pn(),
																Dn = hn(dn);
															{
																var Xi = (Lt) => {
																	var yr = Pn(),
																		Qo = hn(yr);
																	(zn(
																		Qo,
																		17,
																		() => b($).items,
																		Bn,
																		(Pt, un) => {
																			var zt = Mk();
																			zt.__click = (br) => {
																				(br.stopPropagation(), b(un).cmd(), p());
																			};
																			var Qi = oe(zt, !0);
																			(Q(zt),
																				$e(
																					(br) => {
																						(Ke(
																							zt,
																							1,
																							`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-100 dark:hover:bg-white/20 ${br ?? ''}`
																						),
																							kr(Qi, b(un).label));
																					},
																					[
																						() =>
																							b(un).active()
																								? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
																								: 'text-surface-700 dark:text-surface-300'
																					]
																				),
																				Z(Pt, zt));
																		}
																	),
																		Z(Lt, yr));
																};
																He(
																	Dn,
																	(Lt) => {
																		b($).items && Lt(Xi);
																	},
																	!0
																);
															}
															Z(cn, dn);
														};
													He(an, (cn) => {
														b($).label === 'Table' ? cn(Gi) : cn(Yi, !1);
													});
												}
												(Q(je), Z(Ce, je));
											};
											He(Ju, (Ce) => {
												b(c) === b($).label && Ce(Gu);
											});
										}
										(Q(Be),
											$e(() => {
												(Ke(
													Ze,
													1,
													`flex items-center gap-1 rounded px-2 py-1.5 text-sm font-medium hover:bg-surface-200 dark:hover:bg-white/20 transition ${b(c) === b($).label ? 'bg-surface-200 dark:bg-white/20' : ''} text-surface-900 dark:text-white`
												),
													Hn(Ze, 'title', b($).label));
											}),
											Z(on, Be));
									},
									ju = (on) => {
										var Be = Ek();
										Be.__click = function (...ln) {
											b($).cmd?.apply(this, ln);
										};
										var Ze = oe(Be);
										($e(() => et(Ze, 'icon', `mdi:${b($).icon ?? ''}`)),
											et(Ze, 'width', '20'),
											Q(Be),
											$e(
												(ln) => {
													(Ke(Be, 1, `rounded-lg p-2 hover:bg-surface-100 dark:hover:bg-white/10 transition-all ${ln ?? ''}`),
														Hn(Be, 'aria-label', b($).label),
														Hn(Be, 'title', b($).shortcut ? `${b($).label} (${b($).shortcut})` : b($).label));
												},
												[() => (b($).active?.() ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500' : 'text-surface-900 dark:text-white')]
											),
											Z(on, Be));
									};
								He(Vu, (on) => {
									b($).type === 'dropdown' ? on(Wu) : on(ju, !1);
								});
							}
							Z(ye, sn);
						}
					),
						Zi(2),
						Q(In),
						Z(Dt, In));
				};
				He(nn, (Dt) => {
					(!b(H).condition || b(H).condition()) && Dt(rn);
				});
			}
			Z(I, ze);
		}
	),
		Q(v),
		Q(A));
	var D = Ee(A, 2);
	tl(
		D,
		(I) => (s = I),
		() => s
	);
	var P = Ee(D, 2);
	lf(
		P,
		(I, H) => mf?.(I, H),
		() => ({
			name: e.field.db_fieldName,
			label: e.field.label,
			collection: e.field.collection,
			onInsert: (I) => {
				b(i)?.chain().focus().insertContent(I).run();
			}
		})
	);
	var de = Ee(P, 2);
	{
		var ut = (I) => {
			var H = Ok();
			(nf(H),
				(H.__input = (ze) => {
					const nn = ze.target.value;
					b(i)?.commands.setContent(nn, { emitUpdate: !0 });
				}),
				$e((ze) => cf(H, ze), [() => b(i)?.getHTML() || '']),
				Z(I, H));
		};
		He(de, (I) => {
			b(a) && I(ut);
		});
	}
	var Pe = Ee(de, 4);
	{
		var ft = (I) => {
			var H = Rk(),
				ze = oe(H, !0);
			(Q(H), $e(() => kr(ze, e.error)), Z(I, H));
		};
		He(Pe, (I) => {
			e.error && I(ft);
		});
	}
	var ge = Ee(Pe, 2);
	{
		var ue = (I) => {
			var H = Dk();
			((H.__click = (ye) => {
				ye.target === ye.currentTarget && se(l, !1);
			}),
				(H.__keydown = (ye) => {
					(ye.key === 'Escape' && se(l, !1),
						(ye.key === 'Enter' || ye.key === ' ') && ye.target === ye.currentTarget && (ye.preventDefault(), se(l, !1)));
				}));
			var ze = oe(H),
				nn = Ee(oe(ze), 2),
				rn = oe(nn);
			rn.__click = () => {
				(b(i)?.chain().focus().setHardBreak().run(), se(l, !1));
			};
			var Dt = oe(rn);
			(et(Dt, 'icon', 'mdi:arrow-down-bold'), et(Dt, 'width', '22'), Ke(Dt, 1, 'text-surface-600 dark:text-surface-50'), Zi(2), Q(rn));
			var In = Ee(rn, 2);
			{
				var Ji = (ye) => {
					var $ = Ik();
					$.__click = () => {
						(b(i)?.chain().focus().insertContent('/ai '), se(l, !1));
					};
					var sn = oe($);
					(et(sn, 'icon', 'mdi:sparkles'), et(sn, 'width', '22'), Ke(sn, 1, 'text-purple-600'), Zi(2), Q($), Z(ye, $));
				};
				He(In, (ye) => {
					e.field.aiEnabled && ye(Ji);
				});
			}
			(Q(nn),
				Q(ze),
				Q(H),
				sf(
					3,
					H,
					() => of,
					() => ({ duration: 200, easing: uf })
				),
				Z(I, H));
		};
		He(ge, (I) => {
			b(l) && I(ue);
		});
	}
	var Qe = Ee(ge, 2);
	((Qe.__change = m),
		tl(
			Qe,
			(I) => (d = I),
			() => d
		),
		Q(S),
		$e(() => {
			(Ke(
				S,
				1,
				`my-2 relative overflow-hidden rounded border ${e.error ? 'border-red-500 ring-2 ring-red-500 ring-opacity-50' : 'border-surface-200 dark:text-surface-50'} bg-white dark:bg-surface-900 shadow-xl`
			),
				Ke(
					A,
					1,
					`border-b border-surface-200 dark:border-surface-800 bg-surface-50/95 dark:bg-surface-800/95 backdrop-blur-sm px-2 transition-all duration-300 ${b(o) ? 'fixed inset-x-0 top-0 z-50 shadow-lg' : ''}`
				),
				Ke(
					D,
					1,
					`prose dark:prose-invert max-w-none px-6 py-4 min-h-96 focus:outline-none leading-relaxed caret-blue-600 dark:caret-blue-400 ${b(a) ? 'hidden' : ''}`
				),
				Hn(P, 'id', e.field.db_fieldName));
		}),
		Z(n, S),
		tf());
}
rf(['click', 'mouseover', 'input', 'keydown', 'change']);
export { Qk as default };
//# sourceMappingURL=8Kz4lST9.js.map
