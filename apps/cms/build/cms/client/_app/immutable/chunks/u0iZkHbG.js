const __vite__mapDeps = (i, m = __vite__mapDeps, d = m.f || (m.f = ['./BHzjV73l.js', './DaWZu8wl.js'])) => i.map((i) => d[i]);
import { _ as hi } from './PPVm8Dsz.js';
import { m as br, J as fi } from './CDoBYYfw.js';
var w;
(function (e) {
	((e.Root = 'root'),
		(e.Text = 'text'),
		(e.Directive = 'directive'),
		(e.Comment = 'comment'),
		(e.Script = 'script'),
		(e.Style = 'style'),
		(e.Tag = 'tag'),
		(e.CDATA = 'cdata'),
		(e.Doctype = 'doctype'));
})(w || (w = {}));
function pi(e) {
	return e.type === w.Tag || e.type === w.Script || e.type === w.Style;
}
const mi = w.Root,
	gi = w.Text,
	bi = w.Directive,
	xi = w.Comment,
	_i = w.Script,
	Ei = w.Style,
	Si = w.Tag,
	vi = w.CDATA,
	ki = w.Doctype;
class xr {
	constructor() {
		((this.parent = null), (this.prev = null), (this.next = null), (this.startIndex = null), (this.endIndex = null));
	}
	get parentNode() {
		return this.parent;
	}
	set parentNode(t) {
		this.parent = t;
	}
	get previousSibling() {
		return this.prev;
	}
	set previousSibling(t) {
		this.prev = t;
	}
	get nextSibling() {
		return this.next;
	}
	set nextSibling(t) {
		this.next = t;
	}
	cloneNode(t = !1) {
		return kr(this, t);
	}
}
class Lu extends xr {
	constructor(t) {
		(super(), (this.data = t));
	}
	get nodeValue() {
		return this.data;
	}
	set nodeValue(t) {
		this.data = t;
	}
}
class du extends Lu {
	constructor() {
		(super(...arguments), (this.type = w.Text));
	}
	get nodeType() {
		return 3;
	}
}
class _r extends Lu {
	constructor() {
		(super(...arguments), (this.type = w.Comment));
	}
	get nodeType() {
		return 8;
	}
}
class Er extends Lu {
	constructor(t, u) {
		(super(u), (this.name = t), (this.type = w.Directive));
	}
	get nodeType() {
		return 1;
	}
}
class Du extends xr {
	constructor(t) {
		(super(), (this.children = t));
	}
	get firstChild() {
		var t;
		return (t = this.children[0]) !== null && t !== void 0 ? t : null;
	}
	get lastChild() {
		return this.children.length > 0 ? this.children[this.children.length - 1] : null;
	}
	get childNodes() {
		return this.children;
	}
	set childNodes(t) {
		this.children = t;
	}
}
class Sr extends Du {
	constructor() {
		(super(...arguments), (this.type = w.CDATA));
	}
	get nodeType() {
		return 4;
	}
}
class hu extends Du {
	constructor() {
		(super(...arguments), (this.type = w.Root));
	}
	get nodeType() {
		return 9;
	}
}
class vr extends Du {
	constructor(t, u, n = [], r = t === 'script' ? w.Script : t === 'style' ? w.Style : w.Tag) {
		(super(n), (this.name = t), (this.attribs = u), (this.type = r));
	}
	get nodeType() {
		return 1;
	}
	get tagName() {
		return this.name;
	}
	set tagName(t) {
		this.name = t;
	}
	get attributes() {
		return Object.keys(this.attribs).map((t) => {
			var u, n;
			return {
				name: t,
				value: this.attribs[t],
				namespace: (u = this['x-attribsNamespace']) === null || u === void 0 ? void 0 : u[t],
				prefix: (n = this['x-attribsPrefix']) === null || n === void 0 ? void 0 : n[t]
			};
		});
	}
}
function Bu(e) {
	return pi(e);
}
function Ci(e) {
	return e.type === w.CDATA;
}
function Ti(e) {
	return e.type === w.Text;
}
function Ai(e) {
	return e.type === w.Comment;
}
function wi(e) {
	return e.type === w.Directive;
}
function yi(e) {
	return e.type === w.Root;
}
function kr(e, t = !1) {
	let u;
	if (Ti(e)) u = new du(e.data);
	else if (Ai(e)) u = new _r(e.data);
	else if (Bu(e)) {
		const n = t ? eu(e.children) : [],
			r = new vr(e.name, { ...e.attribs }, n);
		(n.forEach((a) => (a.parent = r)),
			e.namespace != null && (r.namespace = e.namespace),
			e['x-attribsNamespace'] && (r['x-attribsNamespace'] = { ...e['x-attribsNamespace'] }),
			e['x-attribsPrefix'] && (r['x-attribsPrefix'] = { ...e['x-attribsPrefix'] }),
			(u = r));
	} else if (Ci(e)) {
		const n = t ? eu(e.children) : [],
			r = new Sr(n);
		(n.forEach((a) => (a.parent = r)), (u = r));
	} else if (yi(e)) {
		const n = t ? eu(e.children) : [],
			r = new hu(n);
		(n.forEach((a) => (a.parent = r)), e['x-mode'] && (r['x-mode'] = e['x-mode']), (u = r));
	} else if (wi(e)) {
		const n = new Er(e.name, e.data);
		(e['x-name'] != null && ((n['x-name'] = e['x-name']), (n['x-publicId'] = e['x-publicId']), (n['x-systemId'] = e['x-systemId'])), (u = n));
	} else throw new Error(`Not implemented yet: ${e.type}`);
	return ((u.startIndex = e.startIndex), (u.endIndex = e.endIndex), e.sourceCodeLocation != null && (u.sourceCodeLocation = e.sourceCodeLocation), u);
}
function eu(e) {
	const t = e.map((u) => kr(u, !0));
	for (let u = 1; u < t.length; u++) ((t[u].prev = t[u - 1]), (t[u - 1].next = t[u]));
	return t;
}
const ln = { withStartIndices: !1, withEndIndices: !1, xmlMode: !1 };
class Ni {
	constructor(t, u, n) {
		((this.dom = []),
			(this.root = new hu(this.dom)),
			(this.done = !1),
			(this.tagStack = [this.root]),
			(this.lastNode = null),
			(this.parser = null),
			typeof u == 'function' && ((n = u), (u = ln)),
			typeof t == 'object' && ((u = t), (t = void 0)),
			(this.callback = t ?? null),
			(this.options = u ?? ln),
			(this.elementCB = n ?? null));
	}
	onparserinit(t) {
		this.parser = t;
	}
	onreset() {
		((this.dom = []), (this.root = new hu(this.dom)), (this.done = !1), (this.tagStack = [this.root]), (this.lastNode = null), (this.parser = null));
	}
	onend() {
		this.done || ((this.done = !0), (this.parser = null), this.handleCallback(null));
	}
	onerror(t) {
		this.handleCallback(t);
	}
	onclosetag() {
		this.lastNode = null;
		const t = this.tagStack.pop();
		(this.options.withEndIndices && (t.endIndex = this.parser.endIndex), this.elementCB && this.elementCB(t));
	}
	onopentag(t, u) {
		const n = this.options.xmlMode ? w.Tag : void 0,
			r = new vr(t, u, void 0, n);
		(this.addNode(r), this.tagStack.push(r));
	}
	ontext(t) {
		const { lastNode: u } = this;
		if (u && u.type === w.Text) ((u.data += t), this.options.withEndIndices && (u.endIndex = this.parser.endIndex));
		else {
			const n = new du(t);
			(this.addNode(n), (this.lastNode = n));
		}
	}
	oncomment(t) {
		if (this.lastNode && this.lastNode.type === w.Comment) {
			this.lastNode.data += t;
			return;
		}
		const u = new _r(t);
		(this.addNode(u), (this.lastNode = u));
	}
	oncommentend() {
		this.lastNode = null;
	}
	oncdatastart() {
		const t = new du(''),
			u = new Sr([t]);
		(this.addNode(u), (t.parent = u), (this.lastNode = t));
	}
	oncdataend() {
		this.lastNode = null;
	}
	onprocessinginstruction(t, u) {
		const n = new Er(t, u);
		this.addNode(n);
	}
	handleCallback(t) {
		if (typeof this.callback == 'function') this.callback(t, this.dom);
		else if (t) throw t;
	}
	addNode(t) {
		const u = this.tagStack[this.tagStack.length - 1],
			n = u.children[u.children.length - 1];
		(this.options.withStartIndices && (t.startIndex = this.parser.startIndex),
			this.options.withEndIndices && (t.endIndex = this.parser.endIndex),
			u.children.push(t),
			n && ((t.prev = n), (n.next = t)),
			(t.parent = u),
			(this.lastNode = null));
	}
}
const Li = /\n/g;
function Di(e) {
	const t = [...e.matchAll(Li)].map((n) => n.index || 0);
	t.unshift(-1);
	const u = fu(t, 0, t.length);
	return (n) => Cr(u, n);
}
function fu(e, t, u) {
	if (u - t == 1) return { offset: e[t], index: t + 1 };
	const n = Math.ceil((t + u) / 2),
		r = fu(e, t, n),
		a = fu(e, n, u);
	return { offset: r.offset, low: r, high: a };
}
function Cr(e, t) {
	return (function (u) {
		return Object.prototype.hasOwnProperty.call(u, 'index');
	})(e)
		? { line: e.index, column: t - e.offset }
		: Cr(e.high.offset < t ? e.high : e.low, t);
}
function Tr(e, t = '', u = {}) {
	const n = typeof t != 'string' ? t : u,
		r = typeof t == 'string' ? t : '',
		a = e.map(Bi),
		i = !!n.lineNumbers;
	return function (s, o = 0) {
		const l = i ? Di(s) : () => ({ line: 0, column: 0 });
		let h = o;
		const x = [];
		e: for (; h < s.length; ) {
			let _ = !1;
			for (const m of a) {
				m.regex.lastIndex = h;
				const b = m.regex.exec(s);
				if (b && b[0].length > 0) {
					if (!m.discard) {
						const T = l(h),
							q = typeof m.replace == 'string' ? b[0].replace(new RegExp(m.regex.source, m.regex.flags), m.replace) : b[0];
						x.push({ state: r, name: m.name, text: q, offset: h, len: b[0].length, line: T.line, column: T.column });
					}
					if (((h = m.regex.lastIndex), (_ = !0), m.push)) {
						const T = m.push(s, h);
						(x.push(...T.tokens), (h = T.offset));
					}
					if (m.pop) break e;
					break;
				}
			}
			if (!_) break;
		}
		return { tokens: x, offset: h, complete: s.length <= h };
	};
}
function Bi(e, t) {
	return { ...e, regex: Ii(e, t) };
}
function Ii(e, t) {
	if (e.name.length === 0) throw new Error(`Rule #${t} has empty name, which is not allowed.`);
	if (
		(function (u) {
			return Object.prototype.hasOwnProperty.call(u, 'regex');
		})(e)
	)
		return (function (u) {
			if (u.global) throw new Error(`Regular expression /${u.source}/${u.flags} contains the global flag, which is not allowed.`);
			return u.sticky ? u : new RegExp(u.source, u.flags + 'y');
		})(e.regex);
	if (
		(function (u) {
			return Object.prototype.hasOwnProperty.call(u, 'str');
		})(e)
	) {
		if (e.str.length === 0) throw new Error(`Rule #${t} ("${e.name}") has empty "str" property, which is not allowed.`);
		return new RegExp(dn(e.str), 'y');
	}
	return new RegExp(dn(e.name), 'y');
}
function dn(e) {
	return e.replace(/[-[\]{}()*+!<=:?./\\^$|#\s,]/g, '\\$&');
}
function fe(e, t) {
	return (u, n) => {
		let r = n,
			a;
		return (
			n < u.tokens.length && ((a = e(u.tokens[n], u, n)), a !== void 0 && r++),
			a === void 0 ? { matched: !1 } : { matched: !0, position: r, value: a }
		);
	};
}
function Iu(e, t) {
	return e.matched ? { matched: !0, position: e.position, value: t(e.value, e.position) } : e;
}
function Ot(e, t) {
	return e.matched ? t(e) : e;
}
function G(e, t) {
	return (u, n) => Iu(e(u, n), (r, a) => t(r, u, n, a));
}
function Rt(e, t) {
	return (u, n) => {
		const r = e(u, n);
		return r.matched ? r : { matched: !0, position: n, value: t };
	};
}
function Ht(...e) {
	return (t, u) => {
		for (const n of e) {
			const r = n(t, u);
			if (r.matched) return r;
		}
		return { matched: !1 };
	};
}
function we(e, t) {
	return (u, n) => {
		const r = e(u, n);
		return r.matched ? r : t(u, n);
	};
}
function Pi(e, t) {
	return (u, n) => {
		const r = [];
		let a = !0;
		do {
			const i = e(u, n);
			i.matched && t(i.value, r.length + 1, u, n, i.position) ? (r.push(i.value), (n = i.position)) : (a = !1);
		} while (a);
		return { matched: !0, position: n, value: r };
	};
}
function Pu(e) {
	return Pi(e, () => !0);
}
function Oi(e) {
	return U(e, Pu(e), (t, u) => [t, ...u]);
}
function U(e, t, u) {
	return (n, r) => Ot(e(n, r), (a) => Iu(t(n, a.position), (i, s) => u(a.value, i, n, r, s)));
}
function Ri(e, t) {
	return U(e, t, (u) => u);
}
function hn(e, t) {
	return U(e, t, (u, n) => n);
}
function Ou(e, t, u, n) {
	return (r, a) => Ot(e(r, a), (i) => Ot(t(r, i.position), (s) => Iu(u(r, s.position), (o, l) => n(i.value, s.value, o, r, a, l))));
}
function Ar(e, t, u) {
	return Ou(e, t, u, (n, r) => r);
}
function qi(...e) {
	return (t, u) => {
		const n = [];
		let r = u;
		for (const a of e) {
			const i = a(t, r);
			if (i.matched) (n.push(i.value), (r = i.position));
			else return { matched: !1 };
		}
		return { matched: !0, position: r, value: n };
	};
}
function Fi(...e) {
	return Mi(qi(...e));
}
function Mi(e) {
	return G(e, (t) => t.flatMap((u) => u));
}
function Hi(e, t) {
	return (u, n) => {
		let r = !0,
			a = e,
			i = n;
		do {
			const s = t(a, u, i)(u, i);
			s.matched ? ((a = s.value), (i = s.position)) : (r = !1);
		} while (r);
		return { matched: !0, position: i, value: a };
	};
}
function Vi(e, t, u) {
	return Hi(e, (n) => G(t, (r, a, i, s) => u(n, r, a, i, s)));
}
function Wi(e, t, u) {
	return Ui(e, (n) =>
		Vi(
			n,
			U(t, u, (r, a) => [r, a]),
			(r, [a, i]) => a(r, i)
		)
	);
}
function Ui(e, t) {
	return (u, n) => Ot(e(u, n), (r) => t(r.value, u, n, r.position)(u, r.position));
}
const $i = '(?:[ \\t\\r\\n\\f]*)',
	wr = '(?:\\n|\\r\\n|\\r|\\f)',
	Vt = '[^\\x00-\\x7F]',
	lt = '(?:\\\\[0-9a-f]{1,6}(?:\\r\\n|[ \\n\\r\\t\\f])?)',
	dt = '(?:\\\\[^\\n\\r\\f0-9a-f])',
	ji = `(?:[_a-z]|${Vt}|${lt}|${dt})`,
	yr = `(?:[_a-z0-9-]|${Vt}|${lt}|${dt})`,
	zi = `(?:${yr}+)`,
	Gi = `(?:[-]?${ji}${yr}*)`,
	Xi = `'([^\\n\\r\\f\\\\']|\\\\${wr}|${Vt}|${lt}|${dt})*'`,
	Yi = `"([^\\n\\r\\f\\\\"]|\\\\${wr}|${Vt}|${lt}|${dt})*"`,
	Ki = Tr([
		{ name: 'ws', regex: new RegExp($i) },
		{ name: 'hash', regex: new RegExp(`#${zi}`, 'i') },
		{ name: 'ident', regex: new RegExp(Gi, 'i') },
		{ name: 'str1', regex: new RegExp(Xi, 'i') },
		{ name: 'str2', regex: new RegExp(Yi, 'i') },
		{ name: '*' },
		{ name: '.' },
		{ name: ',' },
		{ name: '[' },
		{ name: ']' },
		{ name: '=' },
		{ name: '>' },
		{ name: '|' },
		{ name: '+' },
		{ name: '~' },
		{ name: '^' },
		{ name: '$' }
	]),
	Qi = Tr([
		{ name: 'unicode', regex: new RegExp(lt, 'i') },
		{ name: 'escape', regex: new RegExp(dt, 'i') },
		{ name: 'any', regex: new RegExp('[\\s\\S]', 'i') }
	]);
function Nr([e, t, u], [n, r, a]) {
	return [e + n, t + r, u + a];
}
function Ji(e) {
	return e.reduce(Nr, [0, 0, 0]);
}
const Zi = fe((e) => (e.name === 'unicode' ? String.fromCodePoint(parseInt(e.text.slice(1), 16)) : void 0)),
	es = fe((e) => (e.name === 'escape' ? e.text.slice(1) : void 0)),
	ts = fe((e) => (e.name === 'any' ? e.text : void 0)),
	us = G(Pu(Ht(Zi, es, ts)), (e) => e.join(''));
function Ru(e) {
	const t = Qi(e);
	return us({ tokens: t.tokens, options: void 0 }, 0).value;
}
function I(e) {
	return fe((t) => (t.name === e ? !0 : void 0));
}
const qu = fe((e) => (e.name === 'ws' ? null : void 0)),
	pu = Rt(qu, null);
function rt(e) {
	return Ar(pu, e, pu);
}
const at = fe((e) => (e.name === 'ident' ? Ru(e.text) : void 0)),
	ns = fe((e) => (e.name === 'hash' ? Ru(e.text.slice(1)) : void 0)),
	rs = fe((e) => (e.name.startsWith('str') ? Ru(e.text.slice(1, -1)) : void 0)),
	Lr = Ri(Rt(at, ''), I('|')),
	Fu = we(
		U(Lr, at, (e, t) => ({ name: t, namespace: e })),
		G(at, (e) => ({ name: e, namespace: null }))
	),
	as = we(
		U(Lr, I('*'), (e) => ({ type: 'universal', namespace: e, specificity: [0, 0, 0] })),
		G(I('*'), () => ({ type: 'universal', namespace: null, specificity: [0, 0, 0] }))
	),
	is = G(Fu, ({ name: e, namespace: t }) => ({ type: 'tag', name: e, namespace: t, specificity: [0, 0, 1] })),
	ss = U(I('.'), at, (e, t) => ({ type: 'class', name: t, specificity: [0, 1, 0] })),
	os = G(ns, (e) => ({ type: 'id', name: e, specificity: [1, 0, 0] })),
	fn = fe((e) => {
		if (e.name === 'ident') {
			if (e.text === 'i' || e.text === 'I') return 'i';
			if (e.text === 's' || e.text === 'S') return 's';
		}
	}),
	cs = we(
		U(rs, Rt(hn(pu, fn), null), (e, t) => ({ value: e, modifier: t })),
		U(at, Rt(hn(qu, fn), null), (e, t) => ({ value: e, modifier: t }))
	),
	ls = Ht(
		G(I('='), () => '='),
		U(I('~'), I('='), () => '~='),
		U(I('|'), I('='), () => '|='),
		U(I('^'), I('='), () => '^='),
		U(I('$'), I('='), () => '$='),
		U(I('*'), I('='), () => '*=')
	),
	ds = Ou(I('['), rt(Fu), I(']'), (e, { name: t, namespace: u }) => ({ type: 'attrPresence', name: t, namespace: u, specificity: [0, 1, 0] })),
	hs = Ar(
		I('['),
		Ou(rt(Fu), ls, rt(cs), ({ name: e, namespace: t }, u, { value: n, modifier: r }) => ({
			type: 'attrValue',
			name: e,
			namespace: t,
			matcher: u,
			value: n,
			modifier: r,
			specificity: [0, 1, 0]
		})),
		I(']')
	),
	fs = we(ds, hs),
	ps = we(as, is),
	pn = Ht(os, ss, fs),
	mn = G(we(Fi(ps, Pu(pn)), Oi(pn)), (e) => ({ type: 'compound', list: e, specificity: Ji(e.map((t) => t.specificity)) })),
	ms = Ht(
		G(I('>'), () => '>'),
		G(I('+'), () => '+'),
		G(I('~'), () => '~'),
		U(I('|'), I('|'), () => '||')
	),
	gs = we(
		rt(ms),
		G(qu, () => ' ')
	),
	bs = Wi(
		mn,
		G(gs, (e) => (t, u) => ({
			type: 'compound',
			list: [...u.list, { type: 'combinator', combinator: e, left: t, specificity: t.specificity }],
			specificity: Nr(t.specificity, u.specificity)
		})),
		mn
	);
function xs(e, t) {
	if (!(typeof t == 'string' || t instanceof String)) throw new Error('Expected a selector string. Actual input is not a string!');
	const u = Ki(t);
	if (!u.complete)
		throw new Error(
			`The input "${t}" was only partially tokenized, stopped at offset ${u.offset}!
` + gn(t, u.offset)
		);
	const n = rt(e)({ tokens: u.tokens, options: void 0 }, 0);
	if (!n.matched) throw new Error(`No match for "${t}" input!`);
	if (n.position < u.tokens.length) {
		const r = u.tokens[n.position];
		throw new Error(
			`The input "${t}" was only partially parsed, stopped at offset ${r.offset}!
` + gn(t, r.offset, r.len)
		);
	}
	return n.value;
}
function gn(e, t, u = 1) {
	return `${e.replace(/(\t)|(\r)|(\n)/g, (n, r, a) => (r ? '␉' : a ? '␍' : '␊'))}
${''.padEnd(t)}${'^'.repeat(u)}`;
}
function _s(e) {
	return xs(bs, e);
}
function ae(e) {
	if (!e.type) throw new Error('This is not an AST node.');
	switch (e.type) {
		case 'universal':
			return vt(e.namespace) + '*';
		case 'tag':
			return vt(e.namespace) + Be(e.name);
		case 'class':
			return '.' + Be(e.name);
		case 'id':
			return '#' + Be(e.name);
		case 'attrPresence':
			return `[${vt(e.namespace)}${Be(e.name)}]`;
		case 'attrValue':
			return `[${vt(e.namespace)}${Be(e.name)}${e.matcher}"${Es(e.value)}"${e.modifier ? e.modifier : ''}]`;
		case 'combinator':
			return ae(e.left) + e.combinator;
		case 'compound':
			return e.list.reduce((t, u) => (u.type === 'combinator' ? ae(u) + t : t + ae(u)), '');
		case 'list':
			return e.list.map(ae).join(',');
	}
}
function vt(e) {
	return e || e === '' ? Be(e) + '|' : '';
}
function Lt(e) {
	return `\\${e.codePointAt(0).toString(16)} `;
}
function Be(e) {
	return e.replace(/(^[0-9])|(^-[0-9])|(^-$)|([-0-9a-zA-Z_]|[^\x00-\x7F])|(\x00)|([\x01-\x1f]|\x7f)|([\s\S])/g, (t, u, n, r, a, i, s, o) =>
		u ? Lt(u) : n ? '-' + Lt(n.slice(1)) : r ? '\\-' : a || (i ? '�' : s ? Lt(s) : '\\' + o)
	);
}
function Es(e) {
	return e.replace(/(")|(\\)|(\x00)|([\x01-\x1f]|\x7f)/g, (t, u, n, r, a) => (u ? '\\"' : n ? '\\\\' : r ? '�' : Lt(a)));
}
function Dt(e) {
	if (!e.type) throw new Error('This is not an AST node.');
	switch (e.type) {
		case 'compound': {
			(e.list.forEach(Dt), e.list.sort((t, u) => Br(bn(t), bn(u))));
			break;
		}
		case 'combinator': {
			Dt(e.left);
			break;
		}
		case 'list': {
			(e.list.forEach(Dt), e.list.sort((t, u) => (ae(t) < ae(u) ? -1 : 1)));
			break;
		}
	}
	return e;
}
function bn(e) {
	switch (e.type) {
		case 'universal':
			return [1];
		case 'tag':
			return [1];
		case 'id':
			return [2];
		case 'class':
			return [3, e.name];
		case 'attrPresence':
			return [4, ae(e)];
		case 'attrValue':
			return [5, ae(e)];
		case 'combinator':
			return [15, ae(e)];
	}
}
function Dr(e, t) {
	return Br(e, t);
}
function Br(e, t) {
	if (!Array.isArray(e) || !Array.isArray(t)) throw new Error('Arguments must be arrays.');
	const u = e.length < t.length ? e.length : t.length;
	for (let n = 0; n < u; n++) if (e[n] !== t[n]) return e[n] < t[n] ? -1 : 1;
	return e.length - t.length;
}
class xn {
	constructor(t) {
		this.branches = Re(Ss(t));
	}
	build(t) {
		return t(this.branches);
	}
}
function Ss(e) {
	const t = e.length,
		u = new Array(t);
	for (let n = 0; n < t; n++) {
		const [r, a] = e[n],
			i = vs(_s(r));
		u[n] = { ast: i, terminal: { type: 'terminal', valueContainer: { index: n, value: a, specificity: i.specificity } } };
	}
	return u;
}
function vs(e) {
	return (Ir(e), Dt(e), e);
}
function Ir(e) {
	const t = [];
	(e.list.forEach((u) => {
		switch (u.type) {
			case 'class':
				t.push({ matcher: '~=', modifier: null, name: 'class', namespace: null, specificity: u.specificity, type: 'attrValue', value: u.name });
				break;
			case 'id':
				t.push({ matcher: '=', modifier: null, name: 'id', namespace: null, specificity: u.specificity, type: 'attrValue', value: u.name });
				break;
			case 'combinator':
				(Ir(u.left), t.push(u));
				break;
			case 'universal':
				break;
			default:
				t.push(u);
				break;
		}
	}),
		(e.list = t));
}
function Re(e) {
	const t = [];
	for (; e.length; ) {
		const u = Rr(e, (i) => !0, Pr),
			{ matches: n, nonmatches: r, empty: a } = Cs(e, u);
		((e = r), n.length && t.push(Ts(u, n)), a.length && t.push(...ks(a)));
	}
	return t;
}
function ks(e) {
	const t = [];
	for (const u of e) {
		const n = u.terminal;
		if (n.type === 'terminal') t.push(n);
		else {
			const { matches: r, rest: a } = Ls(n.cont, (i) => i.type === 'terminal');
			(r.forEach((i) => t.push(i)), a.length && ((n.cont = a), t.push(n)));
		}
	}
	return t;
}
function Cs(e, t) {
	const u = [],
		n = [],
		r = [];
	for (const a of e) {
		const i = a.ast.list;
		i.length ? (i.some((o) => Pr(o) === t) ? u : n).push(a) : r.push(a);
	}
	return { matches: u, nonmatches: n, empty: r };
}
function Pr(e) {
	switch (e.type) {
		case 'attrPresence':
			return `attrPresence ${e.name}`;
		case 'attrValue':
			return `attrValue ${e.name}`;
		case 'combinator':
			return `combinator ${e.combinator}`;
		default:
			return e.type;
	}
}
function Ts(e, t) {
	if (e === 'tag') return As(t);
	if (e.startsWith('attrValue ')) return ys(e.substring(10), t);
	if (e.startsWith('attrPresence ')) return ws(e.substring(13), t);
	if (e === 'combinator >') return _n('>', t);
	if (e === 'combinator +') return _n('+', t);
	throw new Error(`Unsupported selector kind: ${e}`);
}
function As(e) {
	const t = Mu(
		e,
		(n) => n.type === 'tag',
		(n) => n.name
	);
	return { type: 'tagName', variants: Object.entries(t).map(([n, r]) => ({ type: 'variant', value: n, cont: Re(r.items) })) };
}
function ws(e, t) {
	for (const u of t) Or(u, (n) => n.type === 'attrPresence' && n.name === e);
	return { type: 'attrPresence', name: e, cont: Re(t) };
}
function ys(e, t) {
	const u = Mu(
			t,
			(r) => r.type === 'attrValue' && r.name === e,
			(r) => `${r.matcher} ${r.modifier || ''} ${r.value}`
		),
		n = [];
	for (const r of Object.values(u)) {
		const a = r.oneSimpleSelector,
			i = Ns(a),
			s = Re(r.items);
		n.push({ type: 'matcher', matcher: a.matcher, modifier: a.modifier, value: a.value, predicate: i, cont: s });
	}
	return { type: 'attrValue', name: e, matchers: n };
}
function Ns(e) {
	if (e.modifier === 'i') {
		const t = e.value.toLowerCase();
		switch (e.matcher) {
			case '=':
				return (u) => t === u.toLowerCase();
			case '~=':
				return (u) =>
					u
						.toLowerCase()
						.split(/[ \t]+/)
						.includes(t);
			case '^=':
				return (u) => u.toLowerCase().startsWith(t);
			case '$=':
				return (u) => u.toLowerCase().endsWith(t);
			case '*=':
				return (u) => u.toLowerCase().includes(t);
			case '|=':
				return (u) => {
					const n = u.toLowerCase();
					return t === n || (n.startsWith(t) && n[t.length] === '-');
				};
		}
	} else {
		const t = e.value;
		switch (e.matcher) {
			case '=':
				return (u) => t === u;
			case '~=':
				return (u) => u.split(/[ \t]+/).includes(t);
			case '^=':
				return (u) => u.startsWith(t);
			case '$=':
				return (u) => u.endsWith(t);
			case '*=':
				return (u) => u.includes(t);
			case '|=':
				return (u) => t === u || (u.startsWith(t) && u[t.length] === '-');
		}
	}
}
function _n(e, t) {
	const u = Mu(
			t,
			(r) => r.type === 'combinator' && r.combinator === e,
			(r) => ae(r.left)
		),
		n = [];
	for (const r of Object.values(u)) {
		const a = Re(r.items),
			i = r.oneSimpleSelector.left;
		n.push({ ast: i, terminal: { type: 'popElement', cont: a } });
	}
	return { type: 'pushElement', combinator: e, cont: Re(n) };
}
function Mu(e, t, u) {
	const n = {};
	for (; e.length; ) {
		const r = Rr(e, t, u),
			a = (h) => t(h) && u(h) === r,
			i = (h) => h.ast.list.some(a),
			{ matches: s, rest: o } = Ds(e, i);
		let l = null;
		for (const h of s) {
			const x = Or(h, a);
			l || (l = x);
		}
		if (l == null) throw new Error('No simple selector is found.');
		((n[r] = { oneSimpleSelector: l, items: s }), (e = o));
	}
	return n;
}
function Or(e, t) {
	const u = e.ast.list,
		n = new Array(u.length);
	let r = -1;
	for (let i = u.length; i-- > 0; ) t(u[i]) && ((n[i] = !0), (r = i));
	if (r == -1) throw new Error("Couldn't find the required simple selector.");
	const a = u[r];
	return ((e.ast.list = u.filter((i, s) => !n[s])), a);
}
function Rr(e, t, u) {
	const n = {};
	for (const i of e) {
		const s = {};
		for (const o of i.ast.list.filter(t)) s[u(o)] = !0;
		for (const o of Object.keys(s)) n[o] ? n[o]++ : (n[o] = 1);
	}
	let r = '',
		a = 0;
	for (const i of Object.entries(n)) i[1] > a && ((r = i[0]), (a = i[1]));
	return r;
}
function Ls(e, t) {
	const u = [],
		n = [];
	for (const r of e) t(r) ? u.push(r) : n.push(r);
	return { matches: u, rest: n };
}
function Ds(e, t) {
	const u = [],
		n = [];
	for (const r of e) t(r) ? u.push(r) : n.push(r);
	return { matches: u, rest: n };
}
class Bs {
	constructor(t) {
		this.f = t;
	}
	pickAll(t) {
		return this.f(t);
	}
	pick1(t, u = !1) {
		const n = this.f(t),
			r = n.length;
		if (r === 0) return null;
		if (r === 1) return n[0].value;
		const a = u ? Is : Ps;
		let i = n[0];
		for (let s = 1; s < r; s++) {
			const o = n[s];
			a(i, o) && (i = o);
		}
		return i.value;
	}
}
function Is(e, t) {
	const u = Dr(t.specificity, e.specificity);
	return u > 0 || (u === 0 && t.index < e.index);
}
function Ps(e, t) {
	const u = Dr(t.specificity, e.specificity);
	return u > 0 || (u === 0 && t.index > e.index);
}
function En(e) {
	return new Bs(Me(e));
}
function Me(e) {
	const t = e.map(Os);
	return (u, ...n) => t.flatMap((r) => r(u, ...n));
}
function Os(e) {
	switch (e.type) {
		case 'terminal': {
			const t = [e.valueContainer];
			return (u, ...n) => t;
		}
		case 'tagName':
			return Rs(e);
		case 'attrValue':
			return Fs(e);
		case 'attrPresence':
			return qs(e);
		case 'pushElement':
			return Ms(e);
		case 'popElement':
			return Vs(e);
	}
}
function Rs(e) {
	const t = {};
	for (const u of e.variants) t[u.value] = Me(u.cont);
	return (u, ...n) => {
		const r = t[u.name];
		return r ? r(u, ...n) : [];
	};
}
function qs(e) {
	const t = e.name,
		u = Me(e.cont);
	return (n, ...r) => (Object.prototype.hasOwnProperty.call(n.attribs, t) ? u(n, ...r) : []);
}
function Fs(e) {
	const t = [];
	for (const n of e.matchers) {
		const r = n.predicate,
			a = Me(n.cont);
		t.push((i, s, ...o) => (r(i) ? a(s, ...o) : []));
	}
	const u = e.name;
	return (n, ...r) => {
		const a = n.attribs[u];
		return a || a === '' ? t.flatMap((i) => i(a, n, ...r)) : [];
	};
}
function Ms(e) {
	const t = Me(e.cont),
		u = e.combinator === '+' ? qr : Hs;
	return (n, ...r) => {
		const a = u(n);
		return a === null ? [] : t(a, n, ...r);
	};
}
const qr = (e) => {
		const t = e.prev;
		return t === null ? null : Bu(t) ? t : qr(t);
	},
	Hs = (e) => {
		const t = e.parent;
		return t && Bu(t) ? t : null;
	};
function Vs(e) {
	const t = Me(e.cont);
	return (u, n, ...r) => t(n, ...r);
}
const Fr = new Uint16Array(
		'ᵁ<Õıʊҝջאٵ۞ޢߖࠏ੊ઑඡ๭༉༦჊ረዡᐕᒝᓃᓟᔥ\0\0\0\0\0\0ᕫᛍᦍᰒᷝ὾⁠↰⊍⏀⏻⑂⠤⤒ⴈ⹈⿎〖㊺㘹㞬㣾㨨㩱㫠㬮ࠀEMabcfglmnoprstu\\bfms¦³¹ÈÏlig耻Æ䃆P耻&䀦cute耻Á䃁reve;䄂Āiyx}rc耻Â䃂;䐐r;쀀𝔄rave耻À䃀pha;䎑acr;䄀d;橓Āgp¡on;䄄f;쀀𝔸plyFunction;恡ing耻Å䃅Ācs¾Ãr;쀀𝒜ign;扔ilde耻Ã䃃ml耻Ä䃄ЀaceforsuåûþėĜĢħĪĀcrêòkslash;或Ŷöø;櫧ed;挆y;䐑ƀcrtąċĔause;戵noullis;愬a;䎒r;쀀𝔅pf;쀀𝔹eve;䋘còēmpeq;扎܀HOacdefhilorsuōőŖƀƞƢƵƷƺǜȕɳɸɾcy;䐧PY耻©䂩ƀcpyŝŢźute;䄆Ā;iŧŨ拒talDifferentialD;慅leys;愭ȀaeioƉƎƔƘron;䄌dil耻Ç䃇rc;䄈nint;戰ot;䄊ĀdnƧƭilla;䂸terDot;䂷òſi;䎧rcleȀDMPTǇǋǑǖot;抙inus;抖lus;投imes;抗oĀcsǢǸkwiseContourIntegral;戲eCurlyĀDQȃȏoubleQuote;思uote;怙ȀlnpuȞȨɇɕonĀ;eȥȦ户;橴ƀgitȯȶȺruent;扡nt;戯ourIntegral;戮ĀfrɌɎ;愂oduct;成nterClockwiseContourIntegral;戳oss;樯cr;쀀𝒞pĀ;Cʄʅ拓ap;才րDJSZacefiosʠʬʰʴʸˋ˗ˡ˦̳ҍĀ;oŹʥtrahd;椑cy;䐂cy;䐅cy;䐏ƀgrsʿ˄ˇger;怡r;憡hv;櫤Āayː˕ron;䄎;䐔lĀ;t˝˞戇a;䎔r;쀀𝔇Āaf˫̧Ācm˰̢riticalȀADGT̖̜̀̆cute;䂴oŴ̋̍;䋙bleAcute;䋝rave;䁠ilde;䋜ond;拄ferentialD;慆Ѱ̽\0\0\0͔͂\0Ѕf;쀀𝔻ƀ;DE͈͉͍䂨ot;惜qual;扐blèCDLRUVͣͲ΂ϏϢϸontourIntegraìȹoɴ͹\0\0ͻ»͉nArrow;懓Āeo·ΤftƀARTΐΖΡrrow;懐ightArrow;懔eåˊngĀLRΫτeftĀARγιrrow;柸ightArrow;柺ightArrow;柹ightĀATϘϞrrow;懒ee;抨pɁϩ\0\0ϯrrow;懑ownArrow;懕erticalBar;戥ǹABLRTaВЪаўѿͼrrowƀ;BUНОТ憓ar;椓pArrow;懵reve;䌑eft˒к\0ц\0ѐightVector;楐eeVector;楞ectorĀ;Bљњ憽ar;楖ightǔѧ\0ѱeeVector;楟ectorĀ;BѺѻ懁ar;楗eeĀ;A҆҇护rrow;憧ĀctҒҗr;쀀𝒟rok;䄐ࠀNTacdfglmopqstuxҽӀӄӋӞӢӧӮӵԡԯԶՒ՝ՠեG;䅊H耻Ð䃐cute耻É䃉ƀaiyӒӗӜron;䄚rc耻Ê䃊;䐭ot;䄖r;쀀𝔈rave耻È䃈ement;戈ĀapӺӾcr;䄒tyɓԆ\0\0ԒmallSquare;旻erySmallSquare;斫ĀgpԦԪon;䄘f;쀀𝔼silon;䎕uĀaiԼՉlĀ;TՂՃ橵ilde;扂librium;懌Āci՗՚r;愰m;橳a;䎗ml耻Ë䃋Āipժկsts;戃onentialE;慇ʀcfiosօֈ֍ֲ׌y;䐤r;쀀𝔉lledɓ֗\0\0֣mallSquare;旼erySmallSquare;斪Ͱֺ\0ֿ\0\0ׄf;쀀𝔽All;戀riertrf;愱cò׋؀JTabcdfgorstר׬ׯ׺؀ؒؖ؛؝أ٬ٲcy;䐃耻>䀾mmaĀ;d׷׸䎓;䏜reve;䄞ƀeiy؇،ؐdil;䄢rc;䄜;䐓ot;䄠r;쀀𝔊;拙pf;쀀𝔾eater̀EFGLSTصلَٖٛ٦qualĀ;Lؾؿ扥ess;招ullEqual;执reater;檢ess;扷lantEqual;橾ilde;扳cr;쀀𝒢;扫ЀAacfiosuڅڋږڛڞڪھۊRDcy;䐪Āctڐڔek;䋇;䁞irc;䄤r;愌lbertSpace;愋ǰگ\0ڲf;愍izontalLine;攀Āctۃۅòکrok;䄦mpńېۘownHumðįqual;扏܀EJOacdfgmnostuۺ۾܃܇܎ܚܞܡܨ݄ݸދޏޕcy;䐕lig;䄲cy;䐁cute耻Í䃍Āiyܓܘrc耻Î䃎;䐘ot;䄰r;愑rave耻Ì䃌ƀ;apܠܯܿĀcgܴܷr;䄪inaryI;慈lieóϝǴ݉\0ݢĀ;eݍݎ戬Āgrݓݘral;戫section;拂isibleĀCTݬݲomma;恣imes;恢ƀgptݿރވon;䄮f;쀀𝕀a;䎙cr;愐ilde;䄨ǫޚ\0ޞcy;䐆l耻Ï䃏ʀcfosuެ޷޼߂ߐĀiyޱ޵rc;䄴;䐙r;쀀𝔍pf;쀀𝕁ǣ߇\0ߌr;쀀𝒥rcy;䐈kcy;䐄΀HJacfosߤߨ߽߬߱ࠂࠈcy;䐥cy;䐌ppa;䎚Āey߶߻dil;䄶;䐚r;쀀𝔎pf;쀀𝕂cr;쀀𝒦րJTaceflmostࠥࠩࠬࡐࡣ঳সে্਷ੇcy;䐉耻<䀼ʀcmnpr࠷࠼ࡁࡄࡍute;䄹bda;䎛g;柪lacetrf;愒r;憞ƀaeyࡗ࡜ࡡron;䄽dil;䄻;䐛Āfsࡨ॰tԀACDFRTUVarࡾࢩࢱࣦ࣠ࣼयज़ΐ४Ānrࢃ࢏gleBracket;柨rowƀ;BR࢙࢚࢞憐ar;懤ightArrow;懆eiling;挈oǵࢷ\0ࣃbleBracket;柦nǔࣈ\0࣒eeVector;楡ectorĀ;Bࣛࣜ懃ar;楙loor;挊ightĀAV࣯ࣵrrow;憔ector;楎Āerँगeƀ;AVउऊऐ抣rrow;憤ector;楚iangleƀ;BEतथऩ抲ar;槏qual;抴pƀDTVषूौownVector;楑eeVector;楠ectorĀ;Bॖॗ憿ar;楘ectorĀ;B॥०憼ar;楒ightáΜs̀EFGLSTॾঋকঝঢভqualGreater;拚ullEqual;扦reater;扶ess;檡lantEqual;橽ilde;扲r;쀀𝔏Ā;eঽা拘ftarrow;懚idot;䄿ƀnpw৔ਖਛgȀLRlr৞৷ਂਐeftĀAR০৬rrow;柵ightArrow;柷ightArrow;柶eftĀarγਊightáοightáϊf;쀀𝕃erĀLRਢਬeftArrow;憙ightArrow;憘ƀchtਾੀੂòࡌ;憰rok;䅁;扪Ѐacefiosuਗ਼੝੠੷੼અઋ઎p;椅y;䐜Ādl੥੯iumSpace;恟lintrf;愳r;쀀𝔐nusPlus;戓pf;쀀𝕄cò੶;䎜ҀJacefostuણધભીଔଙඑ඗ඞcy;䐊cute;䅃ƀaey઴હાron;䅇dil;䅅;䐝ƀgswે૰଎ativeƀMTV૓૟૨ediumSpace;怋hiĀcn૦૘ë૙eryThiî૙tedĀGL૸ଆreaterGreateòٳessLesóੈLine;䀊r;쀀𝔑ȀBnptଢନଷ଺reak;恠BreakingSpace;䂠f;愕ڀ;CDEGHLNPRSTV୕ୖ୪୼஡௫ఄ౞಄ದ೘ൡඅ櫬Āou୛୤ngruent;扢pCap;扭oubleVerticalBar;戦ƀlqxஃஊ஛ement;戉ualĀ;Tஒஓ扠ilde;쀀≂̸ists;戄reater΀;EFGLSTஶஷ஽௉௓௘௥扯qual;扱ullEqual;쀀≧̸reater;쀀≫̸ess;批lantEqual;쀀⩾̸ilde;扵umpń௲௽ownHump;쀀≎̸qual;쀀≏̸eĀfsఊధtTriangleƀ;BEచఛడ拪ar;쀀⧏̸qual;括s̀;EGLSTవశ఼ౄోౘ扮qual;扰reater;扸ess;쀀≪̸lantEqual;쀀⩽̸ilde;扴estedĀGL౨౹reaterGreater;쀀⪢̸essLess;쀀⪡̸recedesƀ;ESಒಓಛ技qual;쀀⪯̸lantEqual;拠ĀeiಫಹverseElement;戌ghtTriangleƀ;BEೋೌ೒拫ar;쀀⧐̸qual;拭ĀquೝഌuareSuĀbp೨೹setĀ;E೰ೳ쀀⊏̸qual;拢ersetĀ;Eഃആ쀀⊐̸qual;拣ƀbcpഓതൎsetĀ;Eഛഞ쀀⊂⃒qual;抈ceedsȀ;ESTലള഻െ抁qual;쀀⪰̸lantEqual;拡ilde;쀀≿̸ersetĀ;E൘൛쀀⊃⃒qual;抉ildeȀ;EFT൮൯൵ൿ扁qual;扄ullEqual;扇ilde;扉erticalBar;戤cr;쀀𝒩ilde耻Ñ䃑;䎝܀Eacdfgmoprstuvලෂ෉෕ෛ෠෧෼ขภยา฿ไlig;䅒cute耻Ó䃓Āiy෎ීrc耻Ô䃔;䐞blac;䅐r;쀀𝔒rave耻Ò䃒ƀaei෮ෲ෶cr;䅌ga;䎩cron;䎟pf;쀀𝕆enCurlyĀDQฎบoubleQuote;怜uote;怘;橔Āclวฬr;쀀𝒪ash耻Ø䃘iŬื฼de耻Õ䃕es;樷ml耻Ö䃖erĀBP๋๠Āar๐๓r;怾acĀek๚๜;揞et;掴arenthesis;揜Ҁacfhilors๿ງຊຏຒດຝະ໼rtialD;戂y;䐟r;쀀𝔓i;䎦;䎠usMinus;䂱Āipຢອncareplanåڝf;愙Ȁ;eio຺ູ໠໤檻cedesȀ;EST່້໏໚扺qual;檯lantEqual;扼ilde;找me;怳Ādp໩໮uct;戏ortionĀ;aȥ໹l;戝Āci༁༆r;쀀𝒫;䎨ȀUfos༑༖༛༟OT耻"䀢r;쀀𝔔pf;愚cr;쀀𝒬؀BEacefhiorsu༾གྷཇའཱིྦྷྪྭ႖ႩႴႾarr;椐G耻®䂮ƀcnrཎནབute;䅔g;柫rĀ;tཛྷཝ憠l;椖ƀaeyཧཬཱron;䅘dil;䅖;䐠Ā;vླྀཹ愜erseĀEUྂྙĀlq྇ྎement;戋uilibrium;懋pEquilibrium;楯r»ཹo;䎡ghtЀACDFTUVa࿁࿫࿳ဢဨၛႇϘĀnr࿆࿒gleBracket;柩rowƀ;BL࿜࿝࿡憒ar;懥eftArrow;懄eiling;按oǵ࿹\0စbleBracket;柧nǔည\0နeeVector;楝ectorĀ;Bဝသ懂ar;楕loor;挋Āerိ၃eƀ;AVဵံြ抢rrow;憦ector;楛iangleƀ;BEၐၑၕ抳ar;槐qual;抵pƀDTVၣၮၸownVector;楏eeVector;楜ectorĀ;Bႂႃ憾ar;楔ectorĀ;B႑႒懀ar;楓Āpuႛ႞f;愝ndImplies;楰ightarrow;懛ĀchႹႼr;愛;憱leDelayed;槴ڀHOacfhimoqstuფჱჷჽᄙᄞᅑᅖᅡᅧᆵᆻᆿĀCcჩხHcy;䐩y;䐨FTcy;䐬cute;䅚ʀ;aeiyᄈᄉᄎᄓᄗ檼ron;䅠dil;䅞rc;䅜;䐡r;쀀𝔖ortȀDLRUᄪᄴᄾᅉownArrow»ОeftArrow»࢚ightArrow»࿝pArrow;憑gma;䎣allCircle;战pf;쀀𝕊ɲᅭ\0\0ᅰt;戚areȀ;ISUᅻᅼᆉᆯ斡ntersection;抓uĀbpᆏᆞsetĀ;Eᆗᆘ抏qual;抑ersetĀ;Eᆨᆩ抐qual;抒nion;抔cr;쀀𝒮ar;拆ȀbcmpᇈᇛሉላĀ;sᇍᇎ拐etĀ;Eᇍᇕqual;抆ĀchᇠህeedsȀ;ESTᇭᇮᇴᇿ扻qual;檰lantEqual;扽ilde;承Tháྌ;我ƀ;esሒሓሣ拑rsetĀ;Eሜም抃qual;抇et»ሓրHRSacfhiorsሾቄ቉ቕ቞ቱቶኟዂወዑORN耻Þ䃞ADE;愢ĀHc቎ቒcy;䐋y;䐦Ābuቚቜ;䀉;䎤ƀaeyብቪቯron;䅤dil;䅢;䐢r;쀀𝔗Āeiቻ኉ǲኀ\0ኇefore;戴a;䎘Ācn኎ኘkSpace;쀀  Space;怉ldeȀ;EFTካኬኲኼ戼qual;扃ullEqual;扅ilde;扈pf;쀀𝕋ipleDot;惛Āctዖዛr;쀀𝒯rok;䅦ૡዷጎጚጦ\0ጬጱ\0\0\0\0\0ጸጽ፷ᎅ\0᏿ᐄᐊᐐĀcrዻጁute耻Ú䃚rĀ;oጇገ憟cir;楉rǣጓ\0጖y;䐎ve;䅬Āiyጞጣrc耻Û䃛;䐣blac;䅰r;쀀𝔘rave耻Ù䃙acr;䅪Ādiፁ፩erĀBPፈ፝Āarፍፐr;䁟acĀekፗፙ;揟et;掵arenthesis;揝onĀ;P፰፱拃lus;抎Āgp፻፿on;䅲f;쀀𝕌ЀADETadps᎕ᎮᎸᏄϨᏒᏗᏳrrowƀ;BDᅐᎠᎤar;椒ownArrow;懅ownArrow;憕quilibrium;楮eeĀ;AᏋᏌ报rrow;憥ownáϳerĀLRᏞᏨeftArrow;憖ightArrow;憗iĀ;lᏹᏺ䏒on;䎥ing;䅮cr;쀀𝒰ilde;䅨ml耻Ü䃜ҀDbcdefosvᐧᐬᐰᐳᐾᒅᒊᒐᒖash;披ar;櫫y;䐒ashĀ;lᐻᐼ抩;櫦Āerᑃᑅ;拁ƀbtyᑌᑐᑺar;怖Ā;iᑏᑕcalȀBLSTᑡᑥᑪᑴar;戣ine;䁼eparator;杘ilde;所ThinSpace;怊r;쀀𝔙pf;쀀𝕍cr;쀀𝒱dash;抪ʀcefosᒧᒬᒱᒶᒼirc;䅴dge;拀r;쀀𝔚pf;쀀𝕎cr;쀀𝒲Ȁfiosᓋᓐᓒᓘr;쀀𝔛;䎞pf;쀀𝕏cr;쀀𝒳ҀAIUacfosuᓱᓵᓹᓽᔄᔏᔔᔚᔠcy;䐯cy;䐇cy;䐮cute耻Ý䃝Āiyᔉᔍrc;䅶;䐫r;쀀𝔜pf;쀀𝕐cr;쀀𝒴ml;䅸ЀHacdefosᔵᔹᔿᕋᕏᕝᕠᕤcy;䐖cute;䅹Āayᕄᕉron;䅽;䐗ot;䅻ǲᕔ\0ᕛoWidtè૙a;䎖r;愨pf;愤cr;쀀𝒵௡ᖃᖊᖐ\0ᖰᖶᖿ\0\0\0\0ᗆᗛᗫᙟ᙭\0ᚕ᚛ᚲᚹ\0ᚾcute耻á䃡reve;䄃̀;Ediuyᖜᖝᖡᖣᖨᖭ戾;쀀∾̳;房rc耻â䃢te肻´̆;䐰lig耻æ䃦Ā;r²ᖺ;쀀𝔞rave耻à䃠ĀepᗊᗖĀfpᗏᗔsym;愵èᗓha;䎱ĀapᗟcĀclᗤᗧr;䄁g;樿ɤᗰ\0\0ᘊʀ;adsvᗺᗻᗿᘁᘇ戧nd;橕;橜lope;橘;橚΀;elmrszᘘᘙᘛᘞᘿᙏᙙ戠;榤e»ᘙsdĀ;aᘥᘦ戡ѡᘰᘲᘴᘶᘸᘺᘼᘾ;榨;榩;榪;榫;榬;榭;榮;榯tĀ;vᙅᙆ戟bĀ;dᙌᙍ抾;榝Āptᙔᙗh;戢»¹arr;捼Āgpᙣᙧon;䄅f;쀀𝕒΀;Eaeiop዁ᙻᙽᚂᚄᚇᚊ;橰cir;橯;扊d;手s;䀧roxĀ;e዁ᚒñᚃing耻å䃥ƀctyᚡᚦᚨr;쀀𝒶;䀪mpĀ;e዁ᚯñʈilde耻ã䃣ml耻ä䃤Āciᛂᛈoninôɲnt;樑ࠀNabcdefiklnoprsu᛭ᛱᜰ᜼ᝃᝈ᝸᝽០៦ᠹᡐᜍ᤽᥈ᥰot;櫭Ācrᛶ᜞kȀcepsᜀᜅᜍᜓong;扌psilon;䏶rime;怵imĀ;e᜚᜛戽q;拍Ŷᜢᜦee;抽edĀ;gᜬᜭ挅e»ᜭrkĀ;t፜᜷brk;掶Āoyᜁᝁ;䐱quo;怞ʀcmprtᝓ᝛ᝡᝤᝨausĀ;eĊĉptyv;榰séᜌnoõēƀahwᝯ᝱ᝳ;䎲;愶een;扬r;쀀𝔟g΀costuvwឍឝឳេ៕៛៞ƀaiuបពរðݠrc;旯p»፱ƀdptឤឨឭot;樀lus;樁imes;樂ɱឹ\0\0ើcup;樆ar;昅riangleĀdu៍្own;施p;斳plus;樄eåᑄåᒭarow;植ƀako៭ᠦᠵĀcn៲ᠣkƀlst៺֫᠂ozenge;槫riangleȀ;dlr᠒᠓᠘᠝斴own;斾eft;旂ight;斸k;搣Ʊᠫ\0ᠳƲᠯ\0ᠱ;斒;斑4;斓ck;斈ĀeoᠾᡍĀ;qᡃᡆ쀀=⃥uiv;쀀≡⃥t;挐Ȁptwxᡙᡞᡧᡬf;쀀𝕓Ā;tᏋᡣom»Ꮜtie;拈؀DHUVbdhmptuvᢅᢖᢪᢻᣗᣛᣬ᣿ᤅᤊᤐᤡȀLRlrᢎᢐᢒᢔ;敗;敔;敖;敓ʀ;DUduᢡᢢᢤᢦᢨ敐;敦;敩;敤;敧ȀLRlrᢳᢵᢷᢹ;敝;敚;敜;教΀;HLRhlrᣊᣋᣍᣏᣑᣓᣕ救;敬;散;敠;敫;敢;敟ox;槉ȀLRlrᣤᣦᣨᣪ;敕;敒;攐;攌ʀ;DUduڽ᣷᣹᣻᣽;敥;敨;攬;攴inus;抟lus;択imes;抠ȀLRlrᤙᤛᤝ᤟;敛;敘;攘;攔΀;HLRhlrᤰᤱᤳᤵᤷ᤻᤹攂;敪;敡;敞;攼;攤;攜Āevģ᥂bar耻¦䂦Ȁceioᥑᥖᥚᥠr;쀀𝒷mi;恏mĀ;e᜚᜜lƀ;bhᥨᥩᥫ䁜;槅sub;柈Ŭᥴ᥾lĀ;e᥹᥺怢t»᥺pƀ;Eeįᦅᦇ;檮Ā;qۜۛೡᦧ\0᧨ᨑᨕᨲ\0ᨷᩐ\0\0᪴\0\0᫁\0\0ᬡᬮ᭍᭒\0᯽\0ᰌƀcpr᦭ᦲ᧝ute;䄇̀;abcdsᦿᧀᧄ᧊᧕᧙戩nd;橄rcup;橉Āau᧏᧒p;橋p;橇ot;橀;쀀∩︀Āeo᧢᧥t;恁îړȀaeiu᧰᧻ᨁᨅǰ᧵\0᧸s;橍on;䄍dil耻ç䃧rc;䄉psĀ;sᨌᨍ橌m;橐ot;䄋ƀdmnᨛᨠᨦil肻¸ƭptyv;榲t脀¢;eᨭᨮ䂢räƲr;쀀𝔠ƀceiᨽᩀᩍy;䑇ckĀ;mᩇᩈ朓ark»ᩈ;䏇r΀;Ecefms᩟᩠ᩢᩫ᪤᪪᪮旋;槃ƀ;elᩩᩪᩭ䋆q;扗eɡᩴ\0\0᪈rrowĀlr᩼᪁eft;憺ight;憻ʀRSacd᪒᪔᪖᪚᪟»ཇ;擈st;抛irc;抚ash;抝nint;樐id;櫯cir;槂ubsĀ;u᪻᪼晣it»᪼ˬ᫇᫔᫺\0ᬊonĀ;eᫍᫎ䀺Ā;qÇÆɭ᫙\0\0᫢aĀ;t᫞᫟䀬;䁀ƀ;fl᫨᫩᫫戁îᅠeĀmx᫱᫶ent»᫩eóɍǧ᫾\0ᬇĀ;dኻᬂot;橭nôɆƀfryᬐᬔᬗ;쀀𝕔oäɔ脀©;sŕᬝr;愗Āaoᬥᬩrr;憵ss;朗Ācuᬲᬷr;쀀𝒸Ābpᬼ᭄Ā;eᭁᭂ櫏;櫑Ā;eᭉᭊ櫐;櫒dot;拯΀delprvw᭠᭬᭷ᮂᮬᯔ᯹arrĀlr᭨᭪;椸;椵ɰ᭲\0\0᭵r;拞c;拟arrĀ;p᭿ᮀ憶;椽̀;bcdosᮏᮐᮖᮡᮥᮨ截rcap;橈Āauᮛᮞp;橆p;橊ot;抍r;橅;쀀∪︀Ȁalrv᮵ᮿᯞᯣrrĀ;mᮼᮽ憷;椼yƀevwᯇᯔᯘqɰᯎ\0\0ᯒreã᭳uã᭵ee;拎edge;拏en耻¤䂤earrowĀlrᯮ᯳eft»ᮀight»ᮽeäᯝĀciᰁᰇoninôǷnt;戱lcty;挭ঀAHabcdefhijlorstuwz᰸᰻᰿ᱝᱩᱵᲊᲞᲬᲷ᳻᳿ᴍᵻᶑᶫᶻ᷆᷍rò΁ar;楥Ȁglrs᱈ᱍ᱒᱔ger;怠eth;愸òᄳhĀ;vᱚᱛ怐»ऊūᱡᱧarow;椏aã̕Āayᱮᱳron;䄏;䐴ƀ;ao̲ᱼᲄĀgrʿᲁr;懊tseq;橷ƀglmᲑᲔᲘ耻°䂰ta;䎴ptyv;榱ĀirᲣᲨsht;楿;쀀𝔡arĀlrᲳᲵ»ࣜ»သʀaegsv᳂͸᳖᳜᳠mƀ;oș᳊᳔ndĀ;ș᳑uit;晦amma;䏝in;拲ƀ;io᳧᳨᳸䃷de脀÷;o᳧ᳰntimes;拇nø᳷cy;䑒cɯᴆ\0\0ᴊrn;挞op;挍ʀlptuwᴘᴝᴢᵉᵕlar;䀤f;쀀𝕕ʀ;emps̋ᴭᴷᴽᵂqĀ;d͒ᴳot;扑inus;戸lus;戔quare;抡blebarwedgåúnƀadhᄮᵝᵧownarrowóᲃarpoonĀlrᵲᵶefôᲴighôᲶŢᵿᶅkaro÷གɯᶊ\0\0ᶎrn;挟op;挌ƀcotᶘᶣᶦĀryᶝᶡ;쀀𝒹;䑕l;槶rok;䄑Ādrᶰᶴot;拱iĀ;fᶺ᠖斿Āah᷀᷃ròЩaòྦangle;榦Āci᷒ᷕy;䑟grarr;柿ऀDacdefglmnopqrstuxḁḉḙḸոḼṉṡṾấắẽỡἪἷὄ὎὚ĀDoḆᴴoôᲉĀcsḎḔute耻é䃩ter;橮ȀaioyḢḧḱḶron;䄛rĀ;cḭḮ扖耻ê䃪lon;払;䑍ot;䄗ĀDrṁṅot;扒;쀀𝔢ƀ;rsṐṑṗ檚ave耻è䃨Ā;dṜṝ檖ot;檘Ȁ;ilsṪṫṲṴ檙nters;揧;愓Ā;dṹṺ檕ot;檗ƀapsẅẉẗcr;䄓tyƀ;svẒẓẕ戅et»ẓpĀ1;ẝẤĳạả;怄;怅怃ĀgsẪẬ;䅋p;怂ĀgpẴẸon;䄙f;쀀𝕖ƀalsỄỎỒrĀ;sỊị拕l;槣us;橱iƀ;lvỚớở䎵on»ớ;䏵ȀcsuvỪỳἋἣĀioữḱrc»Ḯɩỹ\0\0ỻíՈantĀglἂἆtr»ṝess»Ṻƀaeiἒ἖Ἒls;䀽st;扟vĀ;DȵἠD;橸parsl;槥ĀDaἯἳot;打rr;楱ƀcdiἾὁỸr;愯oô͒ĀahὉὋ;䎷耻ð䃰Āmrὓὗl耻ë䃫o;悬ƀcipὡὤὧl;䀡sôծĀeoὬὴctatioîՙnentialåչৡᾒ\0ᾞ\0ᾡᾧ\0\0ῆῌ\0ΐ\0ῦῪ \0 ⁚llingdotseñṄy;䑄male;晀ƀilrᾭᾳ῁lig;耀ﬃɩᾹ\0\0᾽g;耀ﬀig;耀ﬄ;쀀𝔣lig;耀ﬁlig;쀀fjƀaltῙ῜ῡt;晭ig;耀ﬂns;斱of;䆒ǰ΅\0ῳf;쀀𝕗ĀakֿῷĀ;vῼ´拔;櫙artint;樍Āao‌⁕Ācs‑⁒α‚‰‸⁅⁈\0⁐β•‥‧‪‬\0‮耻½䂽;慓耻¼䂼;慕;慙;慛Ƴ‴\0‶;慔;慖ʴ‾⁁\0\0⁃耻¾䂾;慗;慜5;慘ƶ⁌\0⁎;慚;慝8;慞l;恄wn;挢cr;쀀𝒻ࢀEabcdefgijlnorstv₂₉₟₥₰₴⃰⃵⃺⃿℃ℒℸ̗ℾ⅒↞Ā;lٍ₇;檌ƀcmpₐₕ₝ute;䇵maĀ;dₜ᳚䎳;檆reve;䄟Āiy₪₮rc;䄝;䐳ot;䄡Ȁ;lqsؾق₽⃉ƀ;qsؾٌ⃄lanô٥Ȁ;cdl٥⃒⃥⃕c;檩otĀ;o⃜⃝檀Ā;l⃢⃣檂;檄Ā;e⃪⃭쀀⋛︀s;檔r;쀀𝔤Ā;gٳ؛mel;愷cy;䑓Ȁ;Eajٚℌℎℐ;檒;檥;檤ȀEaesℛℝ℩ℴ;扩pĀ;p℣ℤ檊rox»ℤĀ;q℮ℯ檈Ā;q℮ℛim;拧pf;쀀𝕘Āci⅃ⅆr;愊mƀ;el٫ⅎ⅐;檎;檐茀>;cdlqr׮ⅠⅪⅮⅳⅹĀciⅥⅧ;檧r;橺ot;拗Par;榕uest;橼ʀadelsↄⅪ←ٖ↛ǰ↉\0↎proø₞r;楸qĀlqؿ↖lesó₈ií٫Āen↣↭rtneqq;쀀≩︀Å↪ԀAabcefkosy⇄⇇⇱⇵⇺∘∝∯≨≽ròΠȀilmr⇐⇔⇗⇛rsðᒄf»․ilôکĀdr⇠⇤cy;䑊ƀ;cwࣴ⇫⇯ir;楈;憭ar;意irc;䄥ƀalr∁∎∓rtsĀ;u∉∊晥it»∊lip;怦con;抹r;쀀𝔥sĀew∣∩arow;椥arow;椦ʀamopr∺∾≃≞≣rr;懿tht;戻kĀlr≉≓eftarrow;憩ightarrow;憪f;쀀𝕙bar;怕ƀclt≯≴≸r;쀀𝒽asè⇴rok;䄧Ābp⊂⊇ull;恃hen»ᱛૡ⊣\0⊪\0⊸⋅⋎\0⋕⋳\0\0⋸⌢⍧⍢⍿\0⎆⎪⎴cute耻í䃭ƀ;iyݱ⊰⊵rc耻î䃮;䐸Ācx⊼⊿y;䐵cl耻¡䂡ĀfrΟ⋉;쀀𝔦rave耻ì䃬Ȁ;inoܾ⋝⋩⋮Āin⋢⋦nt;樌t;戭fin;槜ta;愩lig;䄳ƀaop⋾⌚⌝ƀcgt⌅⌈⌗r;䄫ƀelpܟ⌏⌓inåގarôܠh;䄱f;抷ed;䆵ʀ;cfotӴ⌬⌱⌽⍁are;愅inĀ;t⌸⌹戞ie;槝doô⌙ʀ;celpݗ⍌⍐⍛⍡al;抺Āgr⍕⍙eróᕣã⍍arhk;樗rod;樼Ȁcgpt⍯⍲⍶⍻y;䑑on;䄯f;쀀𝕚a;䎹uest耻¿䂿Āci⎊⎏r;쀀𝒾nʀ;EdsvӴ⎛⎝⎡ӳ;拹ot;拵Ā;v⎦⎧拴;拳Ā;iݷ⎮lde;䄩ǫ⎸\0⎼cy;䑖l耻ï䃯̀cfmosu⏌⏗⏜⏡⏧⏵Āiy⏑⏕rc;䄵;䐹r;쀀𝔧ath;䈷pf;쀀𝕛ǣ⏬\0⏱r;쀀𝒿rcy;䑘kcy;䑔Ѐacfghjos␋␖␢␧␭␱␵␻ppaĀ;v␓␔䎺;䏰Āey␛␠dil;䄷;䐺r;쀀𝔨reen;䄸cy;䑅cy;䑜pf;쀀𝕜cr;쀀𝓀஀ABEHabcdefghjlmnoprstuv⑰⒁⒆⒍⒑┎┽╚▀♎♞♥♹♽⚚⚲⛘❝❨➋⟀⠁⠒ƀart⑷⑺⑼rò৆òΕail;椛arr;椎Ā;gঔ⒋;檋ar;楢ॣ⒥\0⒪\0⒱\0\0\0\0\0⒵Ⓔ\0ⓆⓈⓍ\0⓹ute;䄺mptyv;榴raîࡌbda;䎻gƀ;dlࢎⓁⓃ;榑åࢎ;檅uo耻«䂫rЀ;bfhlpst࢙ⓞⓦⓩ⓫⓮⓱⓵Ā;f࢝ⓣs;椟s;椝ë≒p;憫l;椹im;楳l;憢ƀ;ae⓿─┄檫il;椙Ā;s┉┊檭;쀀⪭︀ƀabr┕┙┝rr;椌rk;杲Āak┢┬cĀek┨┪;䁻;䁛Āes┱┳;榋lĀdu┹┻;榏;榍Ȁaeuy╆╋╖╘ron;䄾Ādi═╔il;䄼ìࢰâ┩;䐻Ȁcqrs╣╦╭╽a;椶uoĀ;rนᝆĀdu╲╷har;楧shar;楋h;憲ʀ;fgqs▋▌উ◳◿扤tʀahlrt▘▤▷◂◨rrowĀ;t࢙□aé⓶arpoonĀdu▯▴own»њp»०eftarrows;懇ightƀahs◍◖◞rrowĀ;sࣴࢧarpoonó྘quigarro÷⇰hreetimes;拋ƀ;qs▋ও◺lanôবʀ;cdgsব☊☍☝☨c;檨otĀ;o☔☕橿Ā;r☚☛檁;檃Ā;e☢☥쀀⋚︀s;檓ʀadegs☳☹☽♉♋pproøⓆot;拖qĀgq♃♅ôউgtò⒌ôছiíলƀilr♕࣡♚sht;楼;쀀𝔩Ā;Eজ♣;檑š♩♶rĀdu▲♮Ā;l॥♳;楪lk;斄cy;䑙ʀ;achtੈ⚈⚋⚑⚖rò◁orneòᴈard;楫ri;旺Āio⚟⚤dot;䅀ustĀ;a⚬⚭掰che»⚭ȀEaes⚻⚽⛉⛔;扨pĀ;p⛃⛄檉rox»⛄Ā;q⛎⛏檇Ā;q⛎⚻im;拦Ѐabnoptwz⛩⛴⛷✚✯❁❇❐Ānr⛮⛱g;柬r;懽rëࣁgƀlmr⛿✍✔eftĀar০✇ightá৲apsto;柼ightá৽parrowĀlr✥✩efô⓭ight;憬ƀafl✶✹✽r;榅;쀀𝕝us;樭imes;樴š❋❏st;戗áፎƀ;ef❗❘᠀旊nge»❘arĀ;l❤❥䀨t;榓ʀachmt❳❶❼➅➇ròࢨorneòᶌarĀ;d྘➃;業;怎ri;抿̀achiqt➘➝ੀ➢➮➻quo;怹r;쀀𝓁mƀ;egল➪➬;檍;檏Ābu┪➳oĀ;rฟ➹;怚rok;䅂萀<;cdhilqrࠫ⟒☹⟜⟠⟥⟪⟰Āci⟗⟙;檦r;橹reå◲mes;拉arr;楶uest;橻ĀPi⟵⟹ar;榖ƀ;ef⠀भ᠛旃rĀdu⠇⠍shar;楊har;楦Āen⠗⠡rtneqq;쀀≨︀Å⠞܀Dacdefhilnopsu⡀⡅⢂⢎⢓⢠⢥⢨⣚⣢⣤ઃ⣳⤂Dot;戺Ȁclpr⡎⡒⡣⡽r耻¯䂯Āet⡗⡙;時Ā;e⡞⡟朠se»⡟Ā;sျ⡨toȀ;dluျ⡳⡷⡻owîҌefôएðᏑker;斮Āoy⢇⢌mma;権;䐼ash;怔asuredangle»ᘦr;쀀𝔪o;愧ƀcdn⢯⢴⣉ro耻µ䂵Ȁ;acdᑤ⢽⣀⣄sôᚧir;櫰ot肻·Ƶusƀ;bd⣒ᤃ⣓戒Ā;uᴼ⣘;横ţ⣞⣡p;櫛ò−ðઁĀdp⣩⣮els;抧f;쀀𝕞Āct⣸⣽r;쀀𝓂pos»ᖝƀ;lm⤉⤊⤍䎼timap;抸ఀGLRVabcdefghijlmoprstuvw⥂⥓⥾⦉⦘⧚⧩⨕⨚⩘⩝⪃⪕⪤⪨⬄⬇⭄⭿⮮ⰴⱧⱼ⳩Āgt⥇⥋;쀀⋙̸Ā;v⥐௏쀀≫⃒ƀelt⥚⥲⥶ftĀar⥡⥧rrow;懍ightarrow;懎;쀀⋘̸Ā;v⥻ే쀀≪⃒ightarrow;懏ĀDd⦎⦓ash;抯ash;抮ʀbcnpt⦣⦧⦬⦱⧌la»˞ute;䅄g;쀀∠⃒ʀ;Eiop඄⦼⧀⧅⧈;쀀⩰̸d;쀀≋̸s;䅉roø඄urĀ;a⧓⧔普lĀ;s⧓ସǳ⧟\0⧣p肻 ଷmpĀ;e௹ఀʀaeouy⧴⧾⨃⨐⨓ǰ⧹\0⧻;橃on;䅈dil;䅆ngĀ;dൾ⨊ot;쀀⩭̸p;橂;䐽ash;怓΀;Aadqsxஒ⨩⨭⨻⩁⩅⩐rr;懗rĀhr⨳⨶k;椤Ā;oᏲᏰot;쀀≐̸uiöୣĀei⩊⩎ar;椨í஘istĀ;s஠டr;쀀𝔫ȀEest௅⩦⩹⩼ƀ;qs஼⩭௡ƀ;qs஼௅⩴lanô௢ií௪Ā;rஶ⪁»ஷƀAap⪊⪍⪑rò⥱rr;憮ar;櫲ƀ;svྍ⪜ྌĀ;d⪡⪢拼;拺cy;䑚΀AEadest⪷⪺⪾⫂⫅⫶⫹rò⥦;쀀≦̸rr;憚r;急Ȁ;fqs఻⫎⫣⫯tĀar⫔⫙rro÷⫁ightarro÷⪐ƀ;qs఻⪺⫪lanôౕĀ;sౕ⫴»శiíౝĀ;rవ⫾iĀ;eచథiäඐĀpt⬌⬑f;쀀𝕟膀¬;in⬙⬚⬶䂬nȀ;Edvஉ⬤⬨⬮;쀀⋹̸ot;쀀⋵̸ǡஉ⬳⬵;拷;拶iĀ;vಸ⬼ǡಸ⭁⭃;拾;拽ƀaor⭋⭣⭩rȀ;ast୻⭕⭚⭟lleì୻l;쀀⫽⃥;쀀∂̸lint;樔ƀ;ceಒ⭰⭳uåಥĀ;cಘ⭸Ā;eಒ⭽ñಘȀAait⮈⮋⮝⮧rò⦈rrƀ;cw⮔⮕⮙憛;쀀⤳̸;쀀↝̸ghtarrow»⮕riĀ;eೋೖ΀chimpqu⮽⯍⯙⬄୸⯤⯯Ȁ;cerല⯆ഷ⯉uå൅;쀀𝓃ortɭ⬅\0\0⯖ará⭖mĀ;e൮⯟Ā;q൴൳suĀbp⯫⯭å೸åഋƀbcp⯶ⰑⰙȀ;Ees⯿ⰀഢⰄ抄;쀀⫅̸etĀ;eഛⰋqĀ;qണⰀcĀ;eലⰗñസȀ;EesⰢⰣൟⰧ抅;쀀⫆̸etĀ;e൘ⰮqĀ;qൠⰣȀgilrⰽⰿⱅⱇìௗlde耻ñ䃱çృiangleĀlrⱒⱜeftĀ;eచⱚñదightĀ;eೋⱥñ೗Ā;mⱬⱭ䎽ƀ;esⱴⱵⱹ䀣ro;愖p;怇ҀDHadgilrsⲏⲔⲙⲞⲣⲰⲶⳓⳣash;抭arr;椄p;쀀≍⃒ash;抬ĀetⲨⲬ;쀀≥⃒;쀀>⃒nfin;槞ƀAetⲽⳁⳅrr;椂;쀀≤⃒Ā;rⳊⳍ쀀<⃒ie;쀀⊴⃒ĀAtⳘⳜrr;椃rie;쀀⊵⃒im;쀀∼⃒ƀAan⳰⳴ⴂrr;懖rĀhr⳺⳽k;椣Ā;oᏧᏥear;椧ቓ᪕\0\0\0\0\0\0\0\0\0\0\0\0\0ⴭ\0ⴸⵈⵠⵥ⵲ⶄᬇ\0\0ⶍⶫ\0ⷈⷎ\0ⷜ⸙⸫⸾⹃Ācsⴱ᪗ute耻ó䃳ĀiyⴼⵅrĀ;c᪞ⵂ耻ô䃴;䐾ʀabios᪠ⵒⵗǈⵚlac;䅑v;樸old;榼lig;䅓Ācr⵩⵭ir;榿;쀀𝔬ͯ⵹\0\0⵼\0ⶂn;䋛ave耻ò䃲;槁Ābmⶈ෴ar;榵Ȁacitⶕ⶘ⶥⶨrò᪀Āir⶝ⶠr;榾oss;榻nå๒;槀ƀaeiⶱⶵⶹcr;䅍ga;䏉ƀcdnⷀⷅǍron;䎿;榶pf;쀀𝕠ƀaelⷔ⷗ǒr;榷rp;榹΀;adiosvⷪⷫⷮ⸈⸍⸐⸖戨rò᪆Ȁ;efmⷷⷸ⸂⸅橝rĀ;oⷾⷿ愴f»ⷿ耻ª䂪耻º䂺gof;抶r;橖lope;橗;橛ƀclo⸟⸡⸧ò⸁ash耻ø䃸l;折iŬⸯ⸴de耻õ䃵esĀ;aǛ⸺s;樶ml耻ö䃶bar;挽ૡ⹞\0⹽\0⺀⺝\0⺢⺹\0\0⻋ຜ\0⼓\0\0⼫⾼\0⿈rȀ;astЃ⹧⹲຅脀¶;l⹭⹮䂶leìЃɩ⹸\0\0⹻m;櫳;櫽y;䐿rʀcimpt⺋⺏⺓ᡥ⺗nt;䀥od;䀮il;怰enk;怱r;쀀𝔭ƀimo⺨⺰⺴Ā;v⺭⺮䏆;䏕maô੶ne;明ƀ;tv⺿⻀⻈䏀chfork»´;䏖Āau⻏⻟nĀck⻕⻝kĀ;h⇴⻛;愎ö⇴sҀ;abcdemst⻳⻴ᤈ⻹⻽⼄⼆⼊⼎䀫cir;樣ir;樢Āouᵀ⼂;樥;橲n肻±ຝim;樦wo;樧ƀipu⼙⼠⼥ntint;樕f;쀀𝕡nd耻£䂣Ԁ;Eaceinosu່⼿⽁⽄⽇⾁⾉⾒⽾⾶;檳p;檷uå໙Ā;c໎⽌̀;acens່⽙⽟⽦⽨⽾pproø⽃urlyeñ໙ñ໎ƀaes⽯⽶⽺pprox;檹qq;檵im;拨iíໟmeĀ;s⾈ຮ怲ƀEas⽸⾐⽺ð⽵ƀdfp໬⾙⾯ƀals⾠⾥⾪lar;挮ine;挒urf;挓Ā;t໻⾴ï໻rel;抰Āci⿀⿅r;쀀𝓅;䏈ncsp;怈̀fiopsu⿚⋢⿟⿥⿫⿱r;쀀𝔮pf;쀀𝕢rime;恗cr;쀀𝓆ƀaeo⿸〉〓tĀei⿾々rnionóڰnt;樖stĀ;e【】䀿ñἙô༔઀ABHabcdefhilmnoprstux぀けさすムㄎㄫㅇㅢㅲㆎ㈆㈕㈤㈩㉘㉮㉲㊐㊰㊷ƀartぇおがròႳòϝail;検aròᱥar;楤΀cdenqrtとふへみわゔヌĀeuねぱ;쀀∽̱te;䅕iãᅮmptyv;榳gȀ;del࿑らるろ;榒;榥å࿑uo耻»䂻rր;abcfhlpstw࿜ガクシスゼゾダッデナp;極Ā;f࿠ゴs;椠;椳s;椞ë≝ð✮l;楅im;楴l;憣;憝Āaiパフil;椚oĀ;nホボ戶aló༞ƀabrョリヮrò៥rk;杳ĀakンヽcĀekヹ・;䁽;䁝Āes㄂㄄;榌lĀduㄊㄌ;榎;榐Ȁaeuyㄗㄜㄧㄩron;䅙Ādiㄡㄥil;䅗ì࿲âヺ;䑀Ȁclqsㄴㄷㄽㅄa;椷dhar;楩uoĀ;rȎȍh;憳ƀacgㅎㅟངlȀ;ipsླྀㅘㅛႜnåႻarôྩt;断ƀilrㅩဣㅮsht;楽;쀀𝔯ĀaoㅷㆆrĀduㅽㅿ»ѻĀ;l႑ㆄ;楬Ā;vㆋㆌ䏁;䏱ƀgns㆕ㇹㇼht̀ahlrstㆤㆰ㇂㇘㇤㇮rrowĀ;t࿜ㆭaéトarpoonĀduㆻㆿowîㅾp»႒eftĀah㇊㇐rrowó࿪arpoonóՑightarrows;應quigarro÷ニhreetimes;拌g;䋚ingdotseñἲƀahm㈍㈐㈓rò࿪aòՑ;怏oustĀ;a㈞㈟掱che»㈟mid;櫮Ȁabpt㈲㈽㉀㉒Ānr㈷㈺g;柭r;懾rëဃƀafl㉇㉊㉎r;榆;쀀𝕣us;樮imes;樵Āap㉝㉧rĀ;g㉣㉤䀩t;榔olint;樒arò㇣Ȁachq㉻㊀Ⴜ㊅quo;怺r;쀀𝓇Ābu・㊊oĀ;rȔȓƀhir㊗㊛㊠reåㇸmes;拊iȀ;efl㊪ၙᠡ㊫方tri;槎luhar;楨;愞ൡ㋕㋛㋟㌬㌸㍱\0㍺㎤\0\0㏬㏰\0㐨㑈㑚㒭㒱㓊㓱\0㘖\0\0㘳cute;䅛quï➺Ԁ;Eaceinpsyᇭ㋳㋵㋿㌂㌋㌏㌟㌦㌩;檴ǰ㋺\0㋼;檸on;䅡uåᇾĀ;dᇳ㌇il;䅟rc;䅝ƀEas㌖㌘㌛;檶p;檺im;择olint;樓iíሄ;䑁otƀ;be㌴ᵇ㌵担;橦΀Aacmstx㍆㍊㍗㍛㍞㍣㍭rr;懘rĀhr㍐㍒ë∨Ā;oਸ਼਴t耻§䂧i;䀻war;椩mĀin㍩ðnuóñt;朶rĀ;o㍶⁕쀀𝔰Ȁacoy㎂㎆㎑㎠rp;景Āhy㎋㎏cy;䑉;䑈rtɭ㎙\0\0㎜iäᑤaraì⹯耻­䂭Āgm㎨㎴maƀ;fv㎱㎲㎲䏃;䏂Ѐ;deglnprካ㏅㏉㏎㏖㏞㏡㏦ot;橪Ā;q኱ኰĀ;E㏓㏔檞;檠Ā;E㏛㏜檝;檟e;扆lus;樤arr;楲aròᄽȀaeit㏸㐈㐏㐗Āls㏽㐄lsetmé㍪hp;樳parsl;槤Ādlᑣ㐔e;挣Ā;e㐜㐝檪Ā;s㐢㐣檬;쀀⪬︀ƀflp㐮㐳㑂tcy;䑌Ā;b㐸㐹䀯Ā;a㐾㐿槄r;挿f;쀀𝕤aĀdr㑍ЂesĀ;u㑔㑕晠it»㑕ƀcsu㑠㑹㒟Āau㑥㑯pĀ;sᆈ㑫;쀀⊓︀pĀ;sᆴ㑵;쀀⊔︀uĀbp㑿㒏ƀ;esᆗᆜ㒆etĀ;eᆗ㒍ñᆝƀ;esᆨᆭ㒖etĀ;eᆨ㒝ñᆮƀ;afᅻ㒦ְrť㒫ֱ»ᅼaròᅈȀcemt㒹㒾㓂㓅r;쀀𝓈tmîñiì㐕aræᆾĀar㓎㓕rĀ;f㓔ឿ昆Āan㓚㓭ightĀep㓣㓪psiloîỠhé⺯s»⡒ʀbcmnp㓻㕞ሉ㖋㖎Ҁ;Edemnprs㔎㔏㔑㔕㔞㔣㔬㔱㔶抂;櫅ot;檽Ā;dᇚ㔚ot;櫃ult;櫁ĀEe㔨㔪;櫋;把lus;檿arr;楹ƀeiu㔽㕒㕕tƀ;en㔎㕅㕋qĀ;qᇚ㔏eqĀ;q㔫㔨m;櫇Ābp㕚㕜;櫕;櫓c̀;acensᇭ㕬㕲㕹㕻㌦pproø㋺urlyeñᇾñᇳƀaes㖂㖈㌛pproø㌚qñ㌗g;晪ڀ123;Edehlmnps㖩㖬㖯ሜ㖲㖴㗀㗉㗕㗚㗟㗨㗭耻¹䂹耻²䂲耻³䂳;櫆Āos㖹㖼t;檾ub;櫘Ā;dሢ㗅ot;櫄sĀou㗏㗒l;柉b;櫗arr;楻ult;櫂ĀEe㗤㗦;櫌;抋lus;櫀ƀeiu㗴㘉㘌tƀ;enሜ㗼㘂qĀ;qሢ㖲eqĀ;q㗧㗤m;櫈Ābp㘑㘓;櫔;櫖ƀAan㘜㘠㘭rr;懙rĀhr㘦㘨ë∮Ā;oਫ਩war;椪lig耻ß䃟௡㙑㙝㙠ዎ㙳㙹\0㙾㛂\0\0\0\0\0㛛㜃\0㜉㝬\0\0\0㞇ɲ㙖\0\0㙛get;挖;䏄rë๟ƀaey㙦㙫㙰ron;䅥dil;䅣;䑂lrec;挕r;쀀𝔱Ȁeiko㚆㚝㚵㚼ǲ㚋\0㚑eĀ4fኄኁaƀ;sv㚘㚙㚛䎸ym;䏑Ācn㚢㚲kĀas㚨㚮pproø዁im»ኬsðኞĀas㚺㚮ð዁rn耻þ䃾Ǭ̟㛆⋧es膀×;bd㛏㛐㛘䃗Ā;aᤏ㛕r;樱;樰ƀeps㛡㛣㜀á⩍Ȁ;bcf҆㛬㛰㛴ot;挶ir;櫱Ā;o㛹㛼쀀𝕥rk;櫚á㍢rime;怴ƀaip㜏㜒㝤dåቈ΀adempst㜡㝍㝀㝑㝗㝜㝟ngleʀ;dlqr㜰㜱㜶㝀㝂斵own»ᶻeftĀ;e⠀㜾ñम;扜ightĀ;e㊪㝋ñၚot;旬inus;樺lus;樹b;槍ime;樻ezium;揢ƀcht㝲㝽㞁Āry㝷㝻;쀀𝓉;䑆cy;䑛rok;䅧Āio㞋㞎xô᝷headĀlr㞗㞠eftarro÷ࡏightarrow»ཝऀAHabcdfghlmoprstuw㟐㟓㟗㟤㟰㟼㠎㠜㠣㠴㡑㡝㡫㢩㣌㣒㣪㣶ròϭar;楣Ācr㟜㟢ute耻ú䃺òᅐrǣ㟪\0㟭y;䑞ve;䅭Āiy㟵㟺rc耻û䃻;䑃ƀabh㠃㠆㠋ròᎭlac;䅱aòᏃĀir㠓㠘sht;楾;쀀𝔲rave耻ù䃹š㠧㠱rĀlr㠬㠮»ॗ»ႃlk;斀Āct㠹㡍ɯ㠿\0\0㡊rnĀ;e㡅㡆挜r»㡆op;挏ri;旸Āal㡖㡚cr;䅫肻¨͉Āgp㡢㡦on;䅳f;쀀𝕦̀adhlsuᅋ㡸㡽፲㢑㢠ownáᎳarpoonĀlr㢈㢌efô㠭ighô㠯iƀ;hl㢙㢚㢜䏅»ᏺon»㢚parrows;懈ƀcit㢰㣄㣈ɯ㢶\0\0㣁rnĀ;e㢼㢽挝r»㢽op;挎ng;䅯ri;旹cr;쀀𝓊ƀdir㣙㣝㣢ot;拰lde;䅩iĀ;f㜰㣨»᠓Āam㣯㣲rò㢨l耻ü䃼angle;榧ހABDacdeflnoprsz㤜㤟㤩㤭㦵㦸㦽㧟㧤㧨㧳㧹㧽㨁㨠ròϷarĀ;v㤦㤧櫨;櫩asèϡĀnr㤲㤷grt;榜΀eknprst㓣㥆㥋㥒㥝㥤㦖appá␕othinçẖƀhir㓫⻈㥙opô⾵Ā;hᎷ㥢ïㆍĀiu㥩㥭gmá㎳Ābp㥲㦄setneqĀ;q㥽㦀쀀⊊︀;쀀⫋︀setneqĀ;q㦏㦒쀀⊋︀;쀀⫌︀Āhr㦛㦟etá㚜iangleĀlr㦪㦯eft»थight»ၑy;䐲ash»ံƀelr㧄㧒㧗ƀ;beⷪ㧋㧏ar;抻q;扚lip;拮Ābt㧜ᑨaòᑩr;쀀𝔳tré㦮suĀbp㧯㧱»ജ»൙pf;쀀𝕧roð໻tré㦴Ācu㨆㨋r;쀀𝓋Ābp㨐㨘nĀEe㦀㨖»㥾nĀEe㦒㨞»㦐igzag;榚΀cefoprs㨶㨻㩖㩛㩔㩡㩪irc;䅵Ādi㩀㩑Ābg㩅㩉ar;機eĀ;qᗺ㩏;扙erp;愘r;쀀𝔴pf;쀀𝕨Ā;eᑹ㩦atèᑹcr;쀀𝓌ૣណ㪇\0㪋\0㪐㪛\0\0㪝㪨㪫㪯\0\0㫃㫎\0㫘ៜ៟tré៑r;쀀𝔵ĀAa㪔㪗ròσrò৶;䎾ĀAa㪡㪤ròθrò৫að✓is;拻ƀdptឤ㪵㪾Āfl㪺ឩ;쀀𝕩imåឲĀAa㫇㫊ròώròਁĀcq㫒ីr;쀀𝓍Āpt៖㫜ré។Ѐacefiosu㫰㫽㬈㬌㬑㬕㬛㬡cĀuy㫶㫻te耻ý䃽;䑏Āiy㬂㬆rc;䅷;䑋n耻¥䂥r;쀀𝔶cy;䑗pf;쀀𝕪cr;쀀𝓎Ācm㬦㬩y;䑎l耻ÿ䃿Ԁacdefhiosw㭂㭈㭔㭘㭤㭩㭭㭴㭺㮀cute;䅺Āay㭍㭒ron;䅾;䐷ot;䅼Āet㭝㭡træᕟa;䎶r;쀀𝔷cy;䐶grarr;懝pf;쀀𝕫cr;쀀𝓏Ājn㮅㮇;怍j;怌'
			.split('')
			.map((e) => e.charCodeAt(0))
	),
	Mr = new Uint16Array('Ȁaglq	\x1Bɭ\0\0p;䀦os;䀧t;䀾t;䀼uot;䀢'.split('').map((e) => e.charCodeAt(0)));
var tu;
const Ws = new Map([
		[0, 65533],
		[128, 8364],
		[130, 8218],
		[131, 402],
		[132, 8222],
		[133, 8230],
		[134, 8224],
		[135, 8225],
		[136, 710],
		[137, 8240],
		[138, 352],
		[139, 8249],
		[140, 338],
		[142, 381],
		[145, 8216],
		[146, 8217],
		[147, 8220],
		[148, 8221],
		[149, 8226],
		[150, 8211],
		[151, 8212],
		[152, 732],
		[153, 8482],
		[154, 353],
		[155, 8250],
		[156, 339],
		[158, 382],
		[159, 376]
	]),
	mu =
		(tu = String.fromCodePoint) !== null && tu !== void 0
			? tu
			: function (e) {
					let t = '';
					return (
						e > 65535 && ((e -= 65536), (t += String.fromCharCode(((e >>> 10) & 1023) | 55296)), (e = 56320 | (e & 1023))),
						(t += String.fromCharCode(e)),
						t
					);
				};
function Hr(e) {
	var t;
	return (e >= 55296 && e <= 57343) || e > 1114111 ? 65533 : (t = Ws.get(e)) !== null && t !== void 0 ? t : e;
}
var H;
(function (e) {
	((e[(e.NUM = 35)] = 'NUM'),
		(e[(e.SEMI = 59)] = 'SEMI'),
		(e[(e.EQUALS = 61)] = 'EQUALS'),
		(e[(e.ZERO = 48)] = 'ZERO'),
		(e[(e.NINE = 57)] = 'NINE'),
		(e[(e.LOWER_A = 97)] = 'LOWER_A'),
		(e[(e.LOWER_F = 102)] = 'LOWER_F'),
		(e[(e.LOWER_X = 120)] = 'LOWER_X'),
		(e[(e.LOWER_Z = 122)] = 'LOWER_Z'),
		(e[(e.UPPER_A = 65)] = 'UPPER_A'),
		(e[(e.UPPER_F = 70)] = 'UPPER_F'),
		(e[(e.UPPER_Z = 90)] = 'UPPER_Z'));
})(H || (H = {}));
const Us = 32;
var ee;
(function (e) {
	((e[(e.VALUE_LENGTH = 49152)] = 'VALUE_LENGTH'), (e[(e.BRANCH_LENGTH = 16256)] = 'BRANCH_LENGTH'), (e[(e.JUMP_TABLE = 127)] = 'JUMP_TABLE'));
})(ee || (ee = {}));
function gu(e) {
	return e >= H.ZERO && e <= H.NINE;
}
function $s(e) {
	return (e >= H.UPPER_A && e <= H.UPPER_F) || (e >= H.LOWER_A && e <= H.LOWER_F);
}
function js(e) {
	return (e >= H.UPPER_A && e <= H.UPPER_Z) || (e >= H.LOWER_A && e <= H.LOWER_Z) || gu(e);
}
function zs(e) {
	return e === H.EQUALS || js(e);
}
var M;
(function (e) {
	((e[(e.EntityStart = 0)] = 'EntityStart'),
		(e[(e.NumericStart = 1)] = 'NumericStart'),
		(e[(e.NumericDecimal = 2)] = 'NumericDecimal'),
		(e[(e.NumericHex = 3)] = 'NumericHex'),
		(e[(e.NamedEntity = 4)] = 'NamedEntity'));
})(M || (M = {}));
var Se;
(function (e) {
	((e[(e.Legacy = 0)] = 'Legacy'), (e[(e.Strict = 1)] = 'Strict'), (e[(e.Attribute = 2)] = 'Attribute'));
})(Se || (Se = {}));
class Gs {
	constructor(t, u, n) {
		((this.decodeTree = t),
			(this.emitCodePoint = u),
			(this.errors = n),
			(this.state = M.EntityStart),
			(this.consumed = 1),
			(this.result = 0),
			(this.treeIndex = 0),
			(this.excess = 1),
			(this.decodeMode = Se.Strict));
	}
	startEntity(t) {
		((this.decodeMode = t), (this.state = M.EntityStart), (this.result = 0), (this.treeIndex = 0), (this.excess = 1), (this.consumed = 1));
	}
	write(t, u) {
		switch (this.state) {
			case M.EntityStart:
				return t.charCodeAt(u) === H.NUM
					? ((this.state = M.NumericStart), (this.consumed += 1), this.stateNumericStart(t, u + 1))
					: ((this.state = M.NamedEntity), this.stateNamedEntity(t, u));
			case M.NumericStart:
				return this.stateNumericStart(t, u);
			case M.NumericDecimal:
				return this.stateNumericDecimal(t, u);
			case M.NumericHex:
				return this.stateNumericHex(t, u);
			case M.NamedEntity:
				return this.stateNamedEntity(t, u);
		}
	}
	stateNumericStart(t, u) {
		return u >= t.length
			? -1
			: (t.charCodeAt(u) | Us) === H.LOWER_X
				? ((this.state = M.NumericHex), (this.consumed += 1), this.stateNumericHex(t, u + 1))
				: ((this.state = M.NumericDecimal), this.stateNumericDecimal(t, u));
	}
	addToNumericResult(t, u, n, r) {
		if (u !== n) {
			const a = n - u;
			((this.result = this.result * Math.pow(r, a) + parseInt(t.substr(u, a), r)), (this.consumed += a));
		}
	}
	stateNumericHex(t, u) {
		const n = u;
		for (; u < t.length; ) {
			const r = t.charCodeAt(u);
			if (gu(r) || $s(r)) u += 1;
			else return (this.addToNumericResult(t, n, u, 16), this.emitNumericEntity(r, 3));
		}
		return (this.addToNumericResult(t, n, u, 16), -1);
	}
	stateNumericDecimal(t, u) {
		const n = u;
		for (; u < t.length; ) {
			const r = t.charCodeAt(u);
			if (gu(r)) u += 1;
			else return (this.addToNumericResult(t, n, u, 10), this.emitNumericEntity(r, 2));
		}
		return (this.addToNumericResult(t, n, u, 10), -1);
	}
	emitNumericEntity(t, u) {
		var n;
		if (this.consumed <= u) return ((n = this.errors) === null || n === void 0 || n.absenceOfDigitsInNumericCharacterReference(this.consumed), 0);
		if (t === H.SEMI) this.consumed += 1;
		else if (this.decodeMode === Se.Strict) return 0;
		return (
			this.emitCodePoint(Hr(this.result), this.consumed),
			this.errors &&
				(t !== H.SEMI && this.errors.missingSemicolonAfterCharacterReference(), this.errors.validateNumericCharacterReference(this.result)),
			this.consumed
		);
	}
	stateNamedEntity(t, u) {
		const { decodeTree: n } = this;
		let r = n[this.treeIndex],
			a = (r & ee.VALUE_LENGTH) >> 14;
		for (; u < t.length; u++, this.excess++) {
			const i = t.charCodeAt(u);
			if (((this.treeIndex = Wr(n, r, this.treeIndex + Math.max(1, a), i)), this.treeIndex < 0))
				return this.result === 0 || (this.decodeMode === Se.Attribute && (a === 0 || zs(i))) ? 0 : this.emitNotTerminatedNamedEntity();
			if (((r = n[this.treeIndex]), (a = (r & ee.VALUE_LENGTH) >> 14), a !== 0)) {
				if (i === H.SEMI) return this.emitNamedEntityData(this.treeIndex, a, this.consumed + this.excess);
				this.decodeMode !== Se.Strict && ((this.result = this.treeIndex), (this.consumed += this.excess), (this.excess = 0));
			}
		}
		return -1;
	}
	emitNotTerminatedNamedEntity() {
		var t;
		const { result: u, decodeTree: n } = this,
			r = (n[u] & ee.VALUE_LENGTH) >> 14;
		return (
			this.emitNamedEntityData(u, r, this.consumed),
			(t = this.errors) === null || t === void 0 || t.missingSemicolonAfterCharacterReference(),
			this.consumed
		);
	}
	emitNamedEntityData(t, u, n) {
		const { decodeTree: r } = this;
		return (this.emitCodePoint(u === 1 ? r[t] & ~ee.VALUE_LENGTH : r[t + 1], n), u === 3 && this.emitCodePoint(r[t + 2], n), n);
	}
	end() {
		var t;
		switch (this.state) {
			case M.NamedEntity:
				return this.result !== 0 && (this.decodeMode !== Se.Attribute || this.result === this.treeIndex) ? this.emitNotTerminatedNamedEntity() : 0;
			case M.NumericDecimal:
				return this.emitNumericEntity(0, 2);
			case M.NumericHex:
				return this.emitNumericEntity(0, 3);
			case M.NumericStart:
				return ((t = this.errors) === null || t === void 0 || t.absenceOfDigitsInNumericCharacterReference(this.consumed), 0);
			case M.EntityStart:
				return 0;
		}
	}
}
function Vr(e) {
	let t = '';
	const u = new Gs(e, (n) => (t += mu(n)));
	return function (r, a) {
		let i = 0,
			s = 0;
		for (; (s = r.indexOf('&', s)) >= 0; ) {
			((t += r.slice(i, s)), u.startEntity(a));
			const l = u.write(r, s + 1);
			if (l < 0) {
				i = s + u.end();
				break;
			}
			((i = s + l), (s = l === 0 ? i + 1 : i));
		}
		const o = t + r.slice(i);
		return ((t = ''), o);
	};
}
function Wr(e, t, u, n) {
	const r = (t & ee.BRANCH_LENGTH) >> 7,
		a = t & ee.JUMP_TABLE;
	if (r === 0) return a !== 0 && n === a ? u : -1;
	if (a) {
		const o = n - a;
		return o < 0 || o >= r ? -1 : e[u + o] - 1;
	}
	let i = u,
		s = i + r - 1;
	for (; i <= s; ) {
		const o = (i + s) >>> 1,
			l = e[o];
		if (l < n) i = o + 1;
		else if (l > n) s = o - 1;
		else return e[o + r];
	}
	return -1;
}
Vr(Fr);
Vr(Mr);
var g;
(function (e) {
	((e[(e.Tab = 9)] = 'Tab'),
		(e[(e.NewLine = 10)] = 'NewLine'),
		(e[(e.FormFeed = 12)] = 'FormFeed'),
		(e[(e.CarriageReturn = 13)] = 'CarriageReturn'),
		(e[(e.Space = 32)] = 'Space'),
		(e[(e.ExclamationMark = 33)] = 'ExclamationMark'),
		(e[(e.Number = 35)] = 'Number'),
		(e[(e.Amp = 38)] = 'Amp'),
		(e[(e.SingleQuote = 39)] = 'SingleQuote'),
		(e[(e.DoubleQuote = 34)] = 'DoubleQuote'),
		(e[(e.Dash = 45)] = 'Dash'),
		(e[(e.Slash = 47)] = 'Slash'),
		(e[(e.Zero = 48)] = 'Zero'),
		(e[(e.Nine = 57)] = 'Nine'),
		(e[(e.Semi = 59)] = 'Semi'),
		(e[(e.Lt = 60)] = 'Lt'),
		(e[(e.Eq = 61)] = 'Eq'),
		(e[(e.Gt = 62)] = 'Gt'),
		(e[(e.Questionmark = 63)] = 'Questionmark'),
		(e[(e.UpperA = 65)] = 'UpperA'),
		(e[(e.LowerA = 97)] = 'LowerA'),
		(e[(e.UpperF = 70)] = 'UpperF'),
		(e[(e.LowerF = 102)] = 'LowerF'),
		(e[(e.UpperZ = 90)] = 'UpperZ'),
		(e[(e.LowerZ = 122)] = 'LowerZ'),
		(e[(e.LowerX = 120)] = 'LowerX'),
		(e[(e.OpeningSquareBracket = 91)] = 'OpeningSquareBracket'));
})(g || (g = {}));
var f;
(function (e) {
	((e[(e.Text = 1)] = 'Text'),
		(e[(e.BeforeTagName = 2)] = 'BeforeTagName'),
		(e[(e.InTagName = 3)] = 'InTagName'),
		(e[(e.InSelfClosingTag = 4)] = 'InSelfClosingTag'),
		(e[(e.BeforeClosingTagName = 5)] = 'BeforeClosingTagName'),
		(e[(e.InClosingTagName = 6)] = 'InClosingTagName'),
		(e[(e.AfterClosingTagName = 7)] = 'AfterClosingTagName'),
		(e[(e.BeforeAttributeName = 8)] = 'BeforeAttributeName'),
		(e[(e.InAttributeName = 9)] = 'InAttributeName'),
		(e[(e.AfterAttributeName = 10)] = 'AfterAttributeName'),
		(e[(e.BeforeAttributeValue = 11)] = 'BeforeAttributeValue'),
		(e[(e.InAttributeValueDq = 12)] = 'InAttributeValueDq'),
		(e[(e.InAttributeValueSq = 13)] = 'InAttributeValueSq'),
		(e[(e.InAttributeValueNq = 14)] = 'InAttributeValueNq'),
		(e[(e.BeforeDeclaration = 15)] = 'BeforeDeclaration'),
		(e[(e.InDeclaration = 16)] = 'InDeclaration'),
		(e[(e.InProcessingInstruction = 17)] = 'InProcessingInstruction'),
		(e[(e.BeforeComment = 18)] = 'BeforeComment'),
		(e[(e.CDATASequence = 19)] = 'CDATASequence'),
		(e[(e.InSpecialComment = 20)] = 'InSpecialComment'),
		(e[(e.InCommentLike = 21)] = 'InCommentLike'),
		(e[(e.BeforeSpecialS = 22)] = 'BeforeSpecialS'),
		(e[(e.SpecialStartSequence = 23)] = 'SpecialStartSequence'),
		(e[(e.InSpecialTag = 24)] = 'InSpecialTag'),
		(e[(e.BeforeEntity = 25)] = 'BeforeEntity'),
		(e[(e.BeforeNumericEntity = 26)] = 'BeforeNumericEntity'),
		(e[(e.InNamedEntity = 27)] = 'InNamedEntity'),
		(e[(e.InNumericEntity = 28)] = 'InNumericEntity'),
		(e[(e.InHexEntity = 29)] = 'InHexEntity'));
})(f || (f = {}));
function le(e) {
	return e === g.Space || e === g.NewLine || e === g.Tab || e === g.FormFeed || e === g.CarriageReturn;
}
function kt(e) {
	return e === g.Slash || e === g.Gt || le(e);
}
function Sn(e) {
	return e >= g.Zero && e <= g.Nine;
}
function Xs(e) {
	return (e >= g.LowerA && e <= g.LowerZ) || (e >= g.UpperA && e <= g.UpperZ);
}
function Ys(e) {
	return (e >= g.UpperA && e <= g.UpperF) || (e >= g.LowerA && e <= g.LowerF);
}
var re;
(function (e) {
	((e[(e.NoValue = 0)] = 'NoValue'), (e[(e.Unquoted = 1)] = 'Unquoted'), (e[(e.Single = 2)] = 'Single'), (e[(e.Double = 3)] = 'Double'));
})(re || (re = {}));
const z = {
	Cdata: new Uint8Array([67, 68, 65, 84, 65, 91]),
	CdataEnd: new Uint8Array([93, 93, 62]),
	CommentEnd: new Uint8Array([45, 45, 62]),
	ScriptEnd: new Uint8Array([60, 47, 115, 99, 114, 105, 112, 116]),
	StyleEnd: new Uint8Array([60, 47, 115, 116, 121, 108, 101]),
	TitleEnd: new Uint8Array([60, 47, 116, 105, 116, 108, 101])
};
class Ks {
	constructor({ xmlMode: t = !1, decodeEntities: u = !0 }, n) {
		((this.cbs = n),
			(this.state = f.Text),
			(this.buffer = ''),
			(this.sectionStart = 0),
			(this.index = 0),
			(this.baseState = f.Text),
			(this.isSpecial = !1),
			(this.running = !0),
			(this.offset = 0),
			(this.currentSequence = void 0),
			(this.sequenceIndex = 0),
			(this.trieIndex = 0),
			(this.trieCurrent = 0),
			(this.entityResult = 0),
			(this.entityExcess = 0),
			(this.xmlMode = t),
			(this.decodeEntities = u),
			(this.entityTrie = t ? Mr : Fr));
	}
	reset() {
		((this.state = f.Text),
			(this.buffer = ''),
			(this.sectionStart = 0),
			(this.index = 0),
			(this.baseState = f.Text),
			(this.currentSequence = void 0),
			(this.running = !0),
			(this.offset = 0));
	}
	write(t) {
		((this.offset += this.buffer.length), (this.buffer = t), this.parse());
	}
	end() {
		this.running && this.finish();
	}
	pause() {
		this.running = !1;
	}
	resume() {
		((this.running = !0), this.index < this.buffer.length + this.offset && this.parse());
	}
	getIndex() {
		return this.index;
	}
	getSectionStart() {
		return this.sectionStart;
	}
	stateText(t) {
		t === g.Lt || (!this.decodeEntities && this.fastForwardTo(g.Lt))
			? (this.index > this.sectionStart && this.cbs.ontext(this.sectionStart, this.index),
				(this.state = f.BeforeTagName),
				(this.sectionStart = this.index))
			: this.decodeEntities && t === g.Amp && (this.state = f.BeforeEntity);
	}
	stateSpecialStartSequence(t) {
		const u = this.sequenceIndex === this.currentSequence.length;
		if (!(u ? kt(t) : (t | 32) === this.currentSequence[this.sequenceIndex])) this.isSpecial = !1;
		else if (!u) {
			this.sequenceIndex++;
			return;
		}
		((this.sequenceIndex = 0), (this.state = f.InTagName), this.stateInTagName(t));
	}
	stateInSpecialTag(t) {
		if (this.sequenceIndex === this.currentSequence.length) {
			if (t === g.Gt || le(t)) {
				const u = this.index - this.currentSequence.length;
				if (this.sectionStart < u) {
					const n = this.index;
					((this.index = u), this.cbs.ontext(this.sectionStart, u), (this.index = n));
				}
				((this.isSpecial = !1), (this.sectionStart = u + 2), this.stateInClosingTagName(t));
				return;
			}
			this.sequenceIndex = 0;
		}
		(t | 32) === this.currentSequence[this.sequenceIndex]
			? (this.sequenceIndex += 1)
			: this.sequenceIndex === 0
				? this.currentSequence === z.TitleEnd
					? this.decodeEntities && t === g.Amp && (this.state = f.BeforeEntity)
					: this.fastForwardTo(g.Lt) && (this.sequenceIndex = 1)
				: (this.sequenceIndex = +(t === g.Lt));
	}
	stateCDATASequence(t) {
		t === z.Cdata[this.sequenceIndex]
			? ++this.sequenceIndex === z.Cdata.length &&
				((this.state = f.InCommentLike), (this.currentSequence = z.CdataEnd), (this.sequenceIndex = 0), (this.sectionStart = this.index + 1))
			: ((this.sequenceIndex = 0), (this.state = f.InDeclaration), this.stateInDeclaration(t));
	}
	fastForwardTo(t) {
		for (; ++this.index < this.buffer.length + this.offset; ) if (this.buffer.charCodeAt(this.index - this.offset) === t) return !0;
		return ((this.index = this.buffer.length + this.offset - 1), !1);
	}
	stateInCommentLike(t) {
		t === this.currentSequence[this.sequenceIndex]
			? ++this.sequenceIndex === this.currentSequence.length &&
				(this.currentSequence === z.CdataEnd
					? this.cbs.oncdata(this.sectionStart, this.index, 2)
					: this.cbs.oncomment(this.sectionStart, this.index, 2),
				(this.sequenceIndex = 0),
				(this.sectionStart = this.index + 1),
				(this.state = f.Text))
			: this.sequenceIndex === 0
				? this.fastForwardTo(this.currentSequence[0]) && (this.sequenceIndex = 1)
				: t !== this.currentSequence[this.sequenceIndex - 1] && (this.sequenceIndex = 0);
	}
	isTagStartChar(t) {
		return this.xmlMode ? !kt(t) : Xs(t);
	}
	startSpecial(t, u) {
		((this.isSpecial = !0), (this.currentSequence = t), (this.sequenceIndex = u), (this.state = f.SpecialStartSequence));
	}
	stateBeforeTagName(t) {
		if (t === g.ExclamationMark) ((this.state = f.BeforeDeclaration), (this.sectionStart = this.index + 1));
		else if (t === g.Questionmark) ((this.state = f.InProcessingInstruction), (this.sectionStart = this.index + 1));
		else if (this.isTagStartChar(t)) {
			const u = t | 32;
			((this.sectionStart = this.index),
				!this.xmlMode && u === z.TitleEnd[2]
					? this.startSpecial(z.TitleEnd, 3)
					: (this.state = !this.xmlMode && u === z.ScriptEnd[2] ? f.BeforeSpecialS : f.InTagName));
		} else t === g.Slash ? (this.state = f.BeforeClosingTagName) : ((this.state = f.Text), this.stateText(t));
	}
	stateInTagName(t) {
		kt(t) &&
			(this.cbs.onopentagname(this.sectionStart, this.index),
			(this.sectionStart = -1),
			(this.state = f.BeforeAttributeName),
			this.stateBeforeAttributeName(t));
	}
	stateBeforeClosingTagName(t) {
		le(t) ||
			(t === g.Gt
				? (this.state = f.Text)
				: ((this.state = this.isTagStartChar(t) ? f.InClosingTagName : f.InSpecialComment), (this.sectionStart = this.index)));
	}
	stateInClosingTagName(t) {
		(t === g.Gt || le(t)) &&
			(this.cbs.onclosetag(this.sectionStart, this.index),
			(this.sectionStart = -1),
			(this.state = f.AfterClosingTagName),
			this.stateAfterClosingTagName(t));
	}
	stateAfterClosingTagName(t) {
		(t === g.Gt || this.fastForwardTo(g.Gt)) && ((this.state = f.Text), (this.baseState = f.Text), (this.sectionStart = this.index + 1));
	}
	stateBeforeAttributeName(t) {
		t === g.Gt
			? (this.cbs.onopentagend(this.index),
				this.isSpecial ? ((this.state = f.InSpecialTag), (this.sequenceIndex = 0)) : (this.state = f.Text),
				(this.baseState = this.state),
				(this.sectionStart = this.index + 1))
			: t === g.Slash
				? (this.state = f.InSelfClosingTag)
				: le(t) || ((this.state = f.InAttributeName), (this.sectionStart = this.index));
	}
	stateInSelfClosingTag(t) {
		t === g.Gt
			? (this.cbs.onselfclosingtag(this.index),
				(this.state = f.Text),
				(this.baseState = f.Text),
				(this.sectionStart = this.index + 1),
				(this.isSpecial = !1))
			: le(t) || ((this.state = f.BeforeAttributeName), this.stateBeforeAttributeName(t));
	}
	stateInAttributeName(t) {
		(t === g.Eq || kt(t)) &&
			(this.cbs.onattribname(this.sectionStart, this.index),
			(this.sectionStart = -1),
			(this.state = f.AfterAttributeName),
			this.stateAfterAttributeName(t));
	}
	stateAfterAttributeName(t) {
		t === g.Eq
			? (this.state = f.BeforeAttributeValue)
			: t === g.Slash || t === g.Gt
				? (this.cbs.onattribend(re.NoValue, this.index), (this.state = f.BeforeAttributeName), this.stateBeforeAttributeName(t))
				: le(t) || (this.cbs.onattribend(re.NoValue, this.index), (this.state = f.InAttributeName), (this.sectionStart = this.index));
	}
	stateBeforeAttributeValue(t) {
		t === g.DoubleQuote
			? ((this.state = f.InAttributeValueDq), (this.sectionStart = this.index + 1))
			: t === g.SingleQuote
				? ((this.state = f.InAttributeValueSq), (this.sectionStart = this.index + 1))
				: le(t) || ((this.sectionStart = this.index), (this.state = f.InAttributeValueNq), this.stateInAttributeValueNoQuotes(t));
	}
	handleInAttributeValue(t, u) {
		t === u || (!this.decodeEntities && this.fastForwardTo(u))
			? (this.cbs.onattribdata(this.sectionStart, this.index),
				(this.sectionStart = -1),
				this.cbs.onattribend(u === g.DoubleQuote ? re.Double : re.Single, this.index),
				(this.state = f.BeforeAttributeName))
			: this.decodeEntities && t === g.Amp && ((this.baseState = this.state), (this.state = f.BeforeEntity));
	}
	stateInAttributeValueDoubleQuotes(t) {
		this.handleInAttributeValue(t, g.DoubleQuote);
	}
	stateInAttributeValueSingleQuotes(t) {
		this.handleInAttributeValue(t, g.SingleQuote);
	}
	stateInAttributeValueNoQuotes(t) {
		le(t) || t === g.Gt
			? (this.cbs.onattribdata(this.sectionStart, this.index),
				(this.sectionStart = -1),
				this.cbs.onattribend(re.Unquoted, this.index),
				(this.state = f.BeforeAttributeName),
				this.stateBeforeAttributeName(t))
			: this.decodeEntities && t === g.Amp && ((this.baseState = this.state), (this.state = f.BeforeEntity));
	}
	stateBeforeDeclaration(t) {
		t === g.OpeningSquareBracket
			? ((this.state = f.CDATASequence), (this.sequenceIndex = 0))
			: (this.state = t === g.Dash ? f.BeforeComment : f.InDeclaration);
	}
	stateInDeclaration(t) {
		(t === g.Gt || this.fastForwardTo(g.Gt)) &&
			(this.cbs.ondeclaration(this.sectionStart, this.index), (this.state = f.Text), (this.sectionStart = this.index + 1));
	}
	stateInProcessingInstruction(t) {
		(t === g.Gt || this.fastForwardTo(g.Gt)) &&
			(this.cbs.onprocessinginstruction(this.sectionStart, this.index), (this.state = f.Text), (this.sectionStart = this.index + 1));
	}
	stateBeforeComment(t) {
		t === g.Dash
			? ((this.state = f.InCommentLike), (this.currentSequence = z.CommentEnd), (this.sequenceIndex = 2), (this.sectionStart = this.index + 1))
			: (this.state = f.InDeclaration);
	}
	stateInSpecialComment(t) {
		(t === g.Gt || this.fastForwardTo(g.Gt)) &&
			(this.cbs.oncomment(this.sectionStart, this.index, 0), (this.state = f.Text), (this.sectionStart = this.index + 1));
	}
	stateBeforeSpecialS(t) {
		const u = t | 32;
		u === z.ScriptEnd[3]
			? this.startSpecial(z.ScriptEnd, 4)
			: u === z.StyleEnd[3]
				? this.startSpecial(z.StyleEnd, 4)
				: ((this.state = f.InTagName), this.stateInTagName(t));
	}
	stateBeforeEntity(t) {
		((this.entityExcess = 1),
			(this.entityResult = 0),
			t === g.Number
				? (this.state = f.BeforeNumericEntity)
				: t === g.Amp || ((this.trieIndex = 0), (this.trieCurrent = this.entityTrie[0]), (this.state = f.InNamedEntity), this.stateInNamedEntity(t)));
	}
	stateInNamedEntity(t) {
		if (((this.entityExcess += 1), (this.trieIndex = Wr(this.entityTrie, this.trieCurrent, this.trieIndex + 1, t)), this.trieIndex < 0)) {
			(this.emitNamedEntity(), this.index--);
			return;
		}
		this.trieCurrent = this.entityTrie[this.trieIndex];
		const u = this.trieCurrent & ee.VALUE_LENGTH;
		if (u) {
			const n = (u >> 14) - 1;
			if (!this.allowLegacyEntity() && t !== g.Semi) this.trieIndex += n;
			else {
				const r = this.index - this.entityExcess + 1;
				(r > this.sectionStart && this.emitPartial(this.sectionStart, r),
					(this.entityResult = this.trieIndex),
					(this.trieIndex += n),
					(this.entityExcess = 0),
					(this.sectionStart = this.index + 1),
					n === 0 && this.emitNamedEntity());
			}
		}
	}
	emitNamedEntity() {
		if (((this.state = this.baseState), this.entityResult === 0)) return;
		switch ((this.entityTrie[this.entityResult] & ee.VALUE_LENGTH) >> 14) {
			case 1: {
				this.emitCodePoint(this.entityTrie[this.entityResult] & ~ee.VALUE_LENGTH);
				break;
			}
			case 2: {
				this.emitCodePoint(this.entityTrie[this.entityResult + 1]);
				break;
			}
			case 3:
				(this.emitCodePoint(this.entityTrie[this.entityResult + 1]), this.emitCodePoint(this.entityTrie[this.entityResult + 2]));
		}
	}
	stateBeforeNumericEntity(t) {
		(t | 32) === g.LowerX ? (this.entityExcess++, (this.state = f.InHexEntity)) : ((this.state = f.InNumericEntity), this.stateInNumericEntity(t));
	}
	emitNumericEntity(t) {
		const u = this.index - this.entityExcess - 1;
		(u + 2 + +(this.state === f.InHexEntity) !== this.index &&
			(u > this.sectionStart && this.emitPartial(this.sectionStart, u),
			(this.sectionStart = this.index + Number(t)),
			this.emitCodePoint(Hr(this.entityResult))),
			(this.state = this.baseState));
	}
	stateInNumericEntity(t) {
		t === g.Semi
			? this.emitNumericEntity(!0)
			: Sn(t)
				? ((this.entityResult = this.entityResult * 10 + (t - g.Zero)), this.entityExcess++)
				: (this.allowLegacyEntity() ? this.emitNumericEntity(!1) : (this.state = this.baseState), this.index--);
	}
	stateInHexEntity(t) {
		t === g.Semi
			? this.emitNumericEntity(!0)
			: Sn(t)
				? ((this.entityResult = this.entityResult * 16 + (t - g.Zero)), this.entityExcess++)
				: Ys(t)
					? ((this.entityResult = this.entityResult * 16 + ((t | 32) - g.LowerA + 10)), this.entityExcess++)
					: (this.allowLegacyEntity() ? this.emitNumericEntity(!1) : (this.state = this.baseState), this.index--);
	}
	allowLegacyEntity() {
		return !this.xmlMode && (this.baseState === f.Text || this.baseState === f.InSpecialTag);
	}
	cleanup() {
		this.running &&
			this.sectionStart !== this.index &&
			(this.state === f.Text || (this.state === f.InSpecialTag && this.sequenceIndex === 0)
				? (this.cbs.ontext(this.sectionStart, this.index), (this.sectionStart = this.index))
				: (this.state === f.InAttributeValueDq || this.state === f.InAttributeValueSq || this.state === f.InAttributeValueNq) &&
					(this.cbs.onattribdata(this.sectionStart, this.index), (this.sectionStart = this.index)));
	}
	shouldContinue() {
		return this.index < this.buffer.length + this.offset && this.running;
	}
	parse() {
		for (; this.shouldContinue(); ) {
			const t = this.buffer.charCodeAt(this.index - this.offset);
			switch (this.state) {
				case f.Text: {
					this.stateText(t);
					break;
				}
				case f.SpecialStartSequence: {
					this.stateSpecialStartSequence(t);
					break;
				}
				case f.InSpecialTag: {
					this.stateInSpecialTag(t);
					break;
				}
				case f.CDATASequence: {
					this.stateCDATASequence(t);
					break;
				}
				case f.InAttributeValueDq: {
					this.stateInAttributeValueDoubleQuotes(t);
					break;
				}
				case f.InAttributeName: {
					this.stateInAttributeName(t);
					break;
				}
				case f.InCommentLike: {
					this.stateInCommentLike(t);
					break;
				}
				case f.InSpecialComment: {
					this.stateInSpecialComment(t);
					break;
				}
				case f.BeforeAttributeName: {
					this.stateBeforeAttributeName(t);
					break;
				}
				case f.InTagName: {
					this.stateInTagName(t);
					break;
				}
				case f.InClosingTagName: {
					this.stateInClosingTagName(t);
					break;
				}
				case f.BeforeTagName: {
					this.stateBeforeTagName(t);
					break;
				}
				case f.AfterAttributeName: {
					this.stateAfterAttributeName(t);
					break;
				}
				case f.InAttributeValueSq: {
					this.stateInAttributeValueSingleQuotes(t);
					break;
				}
				case f.BeforeAttributeValue: {
					this.stateBeforeAttributeValue(t);
					break;
				}
				case f.BeforeClosingTagName: {
					this.stateBeforeClosingTagName(t);
					break;
				}
				case f.AfterClosingTagName: {
					this.stateAfterClosingTagName(t);
					break;
				}
				case f.BeforeSpecialS: {
					this.stateBeforeSpecialS(t);
					break;
				}
				case f.InAttributeValueNq: {
					this.stateInAttributeValueNoQuotes(t);
					break;
				}
				case f.InSelfClosingTag: {
					this.stateInSelfClosingTag(t);
					break;
				}
				case f.InDeclaration: {
					this.stateInDeclaration(t);
					break;
				}
				case f.BeforeDeclaration: {
					this.stateBeforeDeclaration(t);
					break;
				}
				case f.BeforeComment: {
					this.stateBeforeComment(t);
					break;
				}
				case f.InProcessingInstruction: {
					this.stateInProcessingInstruction(t);
					break;
				}
				case f.InNamedEntity: {
					this.stateInNamedEntity(t);
					break;
				}
				case f.BeforeEntity: {
					this.stateBeforeEntity(t);
					break;
				}
				case f.InHexEntity: {
					this.stateInHexEntity(t);
					break;
				}
				case f.InNumericEntity: {
					this.stateInNumericEntity(t);
					break;
				}
				default:
					this.stateBeforeNumericEntity(t);
			}
			this.index++;
		}
		this.cleanup();
	}
	finish() {
		(this.state === f.InNamedEntity && this.emitNamedEntity(), this.sectionStart < this.index && this.handleTrailingData(), this.cbs.onend());
	}
	handleTrailingData() {
		const t = this.buffer.length + this.offset;
		this.state === f.InCommentLike
			? this.currentSequence === z.CdataEnd
				? this.cbs.oncdata(this.sectionStart, t, 0)
				: this.cbs.oncomment(this.sectionStart, t, 0)
			: this.state === f.InNumericEntity && this.allowLegacyEntity()
				? this.emitNumericEntity(!1)
				: this.state === f.InHexEntity && this.allowLegacyEntity()
					? this.emitNumericEntity(!1)
					: this.state === f.InTagName ||
						this.state === f.BeforeAttributeName ||
						this.state === f.BeforeAttributeValue ||
						this.state === f.AfterAttributeName ||
						this.state === f.InAttributeName ||
						this.state === f.InAttributeValueSq ||
						this.state === f.InAttributeValueDq ||
						this.state === f.InAttributeValueNq ||
						this.state === f.InClosingTagName ||
						this.cbs.ontext(this.sectionStart, t);
	}
	emitPartial(t, u) {
		this.baseState !== f.Text && this.baseState !== f.InSpecialTag ? this.cbs.onattribdata(t, u) : this.cbs.ontext(t, u);
	}
	emitCodePoint(t) {
		this.baseState !== f.Text && this.baseState !== f.InSpecialTag ? this.cbs.onattribentity(t) : this.cbs.ontextentity(t);
	}
}
const Le = new Set(['input', 'option', 'optgroup', 'select', 'button', 'datalist', 'textarea']),
	L = new Set(['p']),
	vn = new Set(['thead', 'tbody']),
	kn = new Set(['dd', 'dt']),
	Cn = new Set(['rt', 'rp']),
	Qs = new Map([
		['tr', new Set(['tr', 'th', 'td'])],
		['th', new Set(['th'])],
		['td', new Set(['thead', 'th', 'td'])],
		['body', new Set(['head', 'link', 'script'])],
		['li', new Set(['li'])],
		['p', L],
		['h1', L],
		['h2', L],
		['h3', L],
		['h4', L],
		['h5', L],
		['h6', L],
		['select', Le],
		['input', Le],
		['output', Le],
		['button', Le],
		['datalist', Le],
		['textarea', Le],
		['option', new Set(['option'])],
		['optgroup', new Set(['optgroup', 'option'])],
		['dd', kn],
		['dt', kn],
		['address', L],
		['article', L],
		['aside', L],
		['blockquote', L],
		['details', L],
		['div', L],
		['dl', L],
		['fieldset', L],
		['figcaption', L],
		['figure', L],
		['footer', L],
		['form', L],
		['header', L],
		['hr', L],
		['main', L],
		['nav', L],
		['ol', L],
		['pre', L],
		['section', L],
		['table', L],
		['ul', L],
		['rt', Cn],
		['rp', Cn],
		['tbody', vn],
		['tfoot', vn]
	]),
	Js = new Set([
		'area',
		'base',
		'basefont',
		'br',
		'col',
		'command',
		'embed',
		'frame',
		'hr',
		'img',
		'input',
		'isindex',
		'keygen',
		'link',
		'meta',
		'param',
		'source',
		'track',
		'wbr'
	]),
	Tn = new Set(['math', 'svg']),
	An = new Set(['mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml', 'foreignobject', 'desc', 'title']),
	Zs = /\s|\//;
class eo {
	constructor(t, u = {}) {
		var n, r, a, i, s;
		((this.options = u),
			(this.startIndex = 0),
			(this.endIndex = 0),
			(this.openTagStart = 0),
			(this.tagname = ''),
			(this.attribname = ''),
			(this.attribvalue = ''),
			(this.attribs = null),
			(this.stack = []),
			(this.foreignContext = []),
			(this.buffers = []),
			(this.bufferOffset = 0),
			(this.writeIndex = 0),
			(this.ended = !1),
			(this.cbs = t ?? {}),
			(this.lowerCaseTagNames = (n = u.lowerCaseTags) !== null && n !== void 0 ? n : !u.xmlMode),
			(this.lowerCaseAttributeNames = (r = u.lowerCaseAttributeNames) !== null && r !== void 0 ? r : !u.xmlMode),
			(this.tokenizer = new ((a = u.Tokenizer) !== null && a !== void 0 ? a : Ks)(this.options, this)),
			(s = (i = this.cbs).onparserinit) === null || s === void 0 || s.call(i, this));
	}
	ontext(t, u) {
		var n, r;
		const a = this.getSlice(t, u);
		((this.endIndex = u - 1), (r = (n = this.cbs).ontext) === null || r === void 0 || r.call(n, a), (this.startIndex = u));
	}
	ontextentity(t) {
		var u, n;
		const r = this.tokenizer.getSectionStart();
		((this.endIndex = r - 1), (n = (u = this.cbs).ontext) === null || n === void 0 || n.call(u, mu(t)), (this.startIndex = r));
	}
	isVoidElement(t) {
		return !this.options.xmlMode && Js.has(t);
	}
	onopentagname(t, u) {
		this.endIndex = u;
		let n = this.getSlice(t, u);
		(this.lowerCaseTagNames && (n = n.toLowerCase()), this.emitOpenTag(n));
	}
	emitOpenTag(t) {
		var u, n, r, a;
		((this.openTagStart = this.startIndex), (this.tagname = t));
		const i = !this.options.xmlMode && Qs.get(t);
		if (i)
			for (; this.stack.length > 0 && i.has(this.stack[this.stack.length - 1]); ) {
				const s = this.stack.pop();
				(n = (u = this.cbs).onclosetag) === null || n === void 0 || n.call(u, s, !0);
			}
		(this.isVoidElement(t) || (this.stack.push(t), Tn.has(t) ? this.foreignContext.push(!0) : An.has(t) && this.foreignContext.push(!1)),
			(a = (r = this.cbs).onopentagname) === null || a === void 0 || a.call(r, t),
			this.cbs.onopentag && (this.attribs = {}));
	}
	endOpenTag(t) {
		var u, n;
		((this.startIndex = this.openTagStart),
			this.attribs && ((n = (u = this.cbs).onopentag) === null || n === void 0 || n.call(u, this.tagname, this.attribs, t), (this.attribs = null)),
			this.cbs.onclosetag && this.isVoidElement(this.tagname) && this.cbs.onclosetag(this.tagname, !0),
			(this.tagname = ''));
	}
	onopentagend(t) {
		((this.endIndex = t), this.endOpenTag(!1), (this.startIndex = t + 1));
	}
	onclosetag(t, u) {
		var n, r, a, i, s, o;
		this.endIndex = u;
		let l = this.getSlice(t, u);
		if ((this.lowerCaseTagNames && (l = l.toLowerCase()), (Tn.has(l) || An.has(l)) && this.foreignContext.pop(), this.isVoidElement(l)))
			!this.options.xmlMode &&
				l === 'br' &&
				((r = (n = this.cbs).onopentagname) === null || r === void 0 || r.call(n, 'br'),
				(i = (a = this.cbs).onopentag) === null || i === void 0 || i.call(a, 'br', {}, !0),
				(o = (s = this.cbs).onclosetag) === null || o === void 0 || o.call(s, 'br', !1));
		else {
			const h = this.stack.lastIndexOf(l);
			if (h !== -1)
				if (this.cbs.onclosetag) {
					let x = this.stack.length - h;
					for (; x--; ) this.cbs.onclosetag(this.stack.pop(), x !== 0);
				} else this.stack.length = h;
			else !this.options.xmlMode && l === 'p' && (this.emitOpenTag('p'), this.closeCurrentTag(!0));
		}
		this.startIndex = u + 1;
	}
	onselfclosingtag(t) {
		((this.endIndex = t),
			this.options.xmlMode || this.options.recognizeSelfClosing || this.foreignContext[this.foreignContext.length - 1]
				? (this.closeCurrentTag(!1), (this.startIndex = t + 1))
				: this.onopentagend(t));
	}
	closeCurrentTag(t) {
		var u, n;
		const r = this.tagname;
		(this.endOpenTag(t),
			this.stack[this.stack.length - 1] === r && ((n = (u = this.cbs).onclosetag) === null || n === void 0 || n.call(u, r, !t), this.stack.pop()));
	}
	onattribname(t, u) {
		this.startIndex = t;
		const n = this.getSlice(t, u);
		this.attribname = this.lowerCaseAttributeNames ? n.toLowerCase() : n;
	}
	onattribdata(t, u) {
		this.attribvalue += this.getSlice(t, u);
	}
	onattribentity(t) {
		this.attribvalue += mu(t);
	}
	onattribend(t, u) {
		var n, r;
		((this.endIndex = u),
			(r = (n = this.cbs).onattribute) === null ||
				r === void 0 ||
				r.call(n, this.attribname, this.attribvalue, t === re.Double ? '"' : t === re.Single ? "'" : t === re.NoValue ? void 0 : null),
			this.attribs && !Object.prototype.hasOwnProperty.call(this.attribs, this.attribname) && (this.attribs[this.attribname] = this.attribvalue),
			(this.attribvalue = ''));
	}
	getInstructionName(t) {
		const u = t.search(Zs);
		let n = u < 0 ? t : t.substr(0, u);
		return (this.lowerCaseTagNames && (n = n.toLowerCase()), n);
	}
	ondeclaration(t, u) {
		this.endIndex = u;
		const n = this.getSlice(t, u);
		if (this.cbs.onprocessinginstruction) {
			const r = this.getInstructionName(n);
			this.cbs.onprocessinginstruction(`!${r}`, `!${n}`);
		}
		this.startIndex = u + 1;
	}
	onprocessinginstruction(t, u) {
		this.endIndex = u;
		const n = this.getSlice(t, u);
		if (this.cbs.onprocessinginstruction) {
			const r = this.getInstructionName(n);
			this.cbs.onprocessinginstruction(`?${r}`, `?${n}`);
		}
		this.startIndex = u + 1;
	}
	oncomment(t, u, n) {
		var r, a, i, s;
		((this.endIndex = u),
			(a = (r = this.cbs).oncomment) === null || a === void 0 || a.call(r, this.getSlice(t, u - n)),
			(s = (i = this.cbs).oncommentend) === null || s === void 0 || s.call(i),
			(this.startIndex = u + 1));
	}
	oncdata(t, u, n) {
		var r, a, i, s, o, l, h, x, _, m;
		this.endIndex = u;
		const b = this.getSlice(t, u - n);
		(this.options.xmlMode || this.options.recognizeCDATA
			? ((a = (r = this.cbs).oncdatastart) === null || a === void 0 || a.call(r),
				(s = (i = this.cbs).ontext) === null || s === void 0 || s.call(i, b),
				(l = (o = this.cbs).oncdataend) === null || l === void 0 || l.call(o))
			: ((x = (h = this.cbs).oncomment) === null || x === void 0 || x.call(h, `[CDATA[${b}]]`),
				(m = (_ = this.cbs).oncommentend) === null || m === void 0 || m.call(_)),
			(this.startIndex = u + 1));
	}
	onend() {
		var t, u;
		if (this.cbs.onclosetag) {
			this.endIndex = this.startIndex;
			for (let n = this.stack.length; n > 0; this.cbs.onclosetag(this.stack[--n], !0));
		}
		(u = (t = this.cbs).onend) === null || u === void 0 || u.call(t);
	}
	reset() {
		var t, u, n, r;
		((u = (t = this.cbs).onreset) === null || u === void 0 || u.call(t),
			this.tokenizer.reset(),
			(this.tagname = ''),
			(this.attribname = ''),
			(this.attribs = null),
			(this.stack.length = 0),
			(this.startIndex = 0),
			(this.endIndex = 0),
			(r = (n = this.cbs).onparserinit) === null || r === void 0 || r.call(n, this),
			(this.buffers.length = 0),
			(this.bufferOffset = 0),
			(this.writeIndex = 0),
			(this.ended = !1));
	}
	parseComplete(t) {
		(this.reset(), this.end(t));
	}
	getSlice(t, u) {
		for (; t - this.bufferOffset >= this.buffers[0].length; ) this.shiftBuffer();
		let n = this.buffers[0].slice(t - this.bufferOffset, u - this.bufferOffset);
		for (; u - this.bufferOffset > this.buffers[0].length; ) (this.shiftBuffer(), (n += this.buffers[0].slice(0, u - this.bufferOffset)));
		return n;
	}
	shiftBuffer() {
		((this.bufferOffset += this.buffers[0].length), this.writeIndex--, this.buffers.shift());
	}
	write(t) {
		var u, n;
		if (this.ended) {
			(n = (u = this.cbs).onerror) === null || n === void 0 || n.call(u, new Error('.write() after done!'));
			return;
		}
		(this.buffers.push(t), this.tokenizer.running && (this.tokenizer.write(t), this.writeIndex++));
	}
	end(t) {
		var u, n;
		if (this.ended) {
			(n = (u = this.cbs).onerror) === null || n === void 0 || n.call(u, new Error('.end() after done!'));
			return;
		}
		(t && this.write(t), (this.ended = !0), this.tokenizer.end());
	}
	pause() {
		this.tokenizer.pause();
	}
	resume() {
		for (this.tokenizer.resume(); this.tokenizer.running && this.writeIndex < this.buffers.length; )
			this.tokenizer.write(this.buffers[this.writeIndex++]);
		this.ended && this.tokenizer.end();
	}
	parseChunk(t) {
		this.write(t);
	}
	done(t) {
		this.end(t);
	}
}
const wn = /["&'<>$\x80-\uFFFF]/g,
	to = new Map([
		[34, '&quot;'],
		[38, '&amp;'],
		[39, '&apos;'],
		[60, '&lt;'],
		[62, '&gt;']
	]),
	uo =
		String.prototype.codePointAt != null
			? (e, t) => e.codePointAt(t)
			: (e, t) => ((e.charCodeAt(t) & 64512) === 55296 ? (e.charCodeAt(t) - 55296) * 1024 + e.charCodeAt(t + 1) - 56320 + 65536 : e.charCodeAt(t));
function Ur(e) {
	let t = '',
		u = 0,
		n;
	for (; (n = wn.exec(e)) !== null; ) {
		const r = n.index,
			a = e.charCodeAt(r),
			i = to.get(a);
		i !== void 0
			? ((t += e.substring(u, r) + i), (u = r + 1))
			: ((t += `${e.substring(u, r)}&#x${uo(e, r).toString(16)};`), (u = wn.lastIndex += +((a & 64512) === 55296)));
	}
	return t + e.substr(u);
}
function $r(e, t) {
	return function (n) {
		let r,
			a = 0,
			i = '';
		for (; (r = e.exec(n)); ) (a !== r.index && (i += n.substring(a, r.index)), (i += t.get(r[0].charCodeAt(0))), (a = r.index + 1));
		return i + n.substring(a);
	};
}
const no = $r(
		/["&\u00A0]/g,
		new Map([
			[34, '&quot;'],
			[38, '&amp;'],
			[160, '&nbsp;']
		])
	),
	ro = $r(
		/[&<>\u00A0]/g,
		new Map([
			[38, '&amp;'],
			[60, '&lt;'],
			[62, '&gt;'],
			[160, '&nbsp;']
		])
	),
	ao = new Map(
		[
			'altGlyph',
			'altGlyphDef',
			'altGlyphItem',
			'animateColor',
			'animateMotion',
			'animateTransform',
			'clipPath',
			'feBlend',
			'feColorMatrix',
			'feComponentTransfer',
			'feComposite',
			'feConvolveMatrix',
			'feDiffuseLighting',
			'feDisplacementMap',
			'feDistantLight',
			'feDropShadow',
			'feFlood',
			'feFuncA',
			'feFuncB',
			'feFuncG',
			'feFuncR',
			'feGaussianBlur',
			'feImage',
			'feMerge',
			'feMergeNode',
			'feMorphology',
			'feOffset',
			'fePointLight',
			'feSpecularLighting',
			'feSpotLight',
			'feTile',
			'feTurbulence',
			'foreignObject',
			'glyphRef',
			'linearGradient',
			'radialGradient',
			'textPath'
		].map((e) => [e.toLowerCase(), e])
	),
	io = new Map(
		[
			'definitionURL',
			'attributeName',
			'attributeType',
			'baseFrequency',
			'baseProfile',
			'calcMode',
			'clipPathUnits',
			'diffuseConstant',
			'edgeMode',
			'filterUnits',
			'glyphRef',
			'gradientTransform',
			'gradientUnits',
			'kernelMatrix',
			'kernelUnitLength',
			'keyPoints',
			'keySplines',
			'keyTimes',
			'lengthAdjust',
			'limitingConeAngle',
			'markerHeight',
			'markerUnits',
			'markerWidth',
			'maskContentUnits',
			'maskUnits',
			'numOctaves',
			'pathLength',
			'patternContentUnits',
			'patternTransform',
			'patternUnits',
			'pointsAtX',
			'pointsAtY',
			'pointsAtZ',
			'preserveAlpha',
			'preserveAspectRatio',
			'primitiveUnits',
			'refX',
			'refY',
			'repeatCount',
			'repeatDur',
			'requiredExtensions',
			'requiredFeatures',
			'specularConstant',
			'specularExponent',
			'spreadMethod',
			'startOffset',
			'stdDeviation',
			'stitchTiles',
			'surfaceScale',
			'systemLanguage',
			'tableValues',
			'targetX',
			'targetY',
			'textLength',
			'viewBox',
			'viewTarget',
			'xChannelSelector',
			'yChannelSelector',
			'zoomAndPan'
		].map((e) => [e.toLowerCase(), e])
	),
	so = new Set(['style', 'script', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext', 'noscript']);
function oo(e) {
	return e.replace(/"/g, '&quot;');
}
function co(e, t) {
	var u;
	if (!e) return;
	const n = ((u = t.encodeEntities) !== null && u !== void 0 ? u : t.decodeEntities) === !1 ? oo : t.xmlMode || t.encodeEntities !== 'utf8' ? Ur : no;
	return Object.keys(e)
		.map((r) => {
			var a, i;
			const s = (a = e[r]) !== null && a !== void 0 ? a : '';
			return (
				t.xmlMode === 'foreign' && (r = (i = io.get(r)) !== null && i !== void 0 ? i : r),
				!t.emptyAttrs && !t.xmlMode && s === '' ? r : `${r}="${n(s)}"`
			);
		})
		.join(' ');
}
const yn = new Set([
	'area',
	'base',
	'basefont',
	'br',
	'col',
	'command',
	'embed',
	'frame',
	'hr',
	'img',
	'input',
	'isindex',
	'keygen',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr'
]);
function Wt(e, t = {}) {
	const u = 'length' in e ? e : [e];
	let n = '';
	for (let r = 0; r < u.length; r++) n += lo(u[r], t);
	return n;
}
function lo(e, t) {
	switch (e.type) {
		case mi:
			return Wt(e.children, t);
		case ki:
		case bi:
			return mo(e);
		case xi:
			return xo(e);
		case vi:
			return bo(e);
		case _i:
		case Ei:
		case Si:
			return po(e, t);
		case gi:
			return go(e, t);
	}
}
const ho = new Set(['mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml', 'foreignObject', 'desc', 'title']),
	fo = new Set(['svg', 'math']);
function po(e, t) {
	var u;
	(t.xmlMode === 'foreign' &&
		((e.name = (u = ao.get(e.name)) !== null && u !== void 0 ? u : e.name), e.parent && ho.has(e.parent.name) && (t = { ...t, xmlMode: !1 })),
		!t.xmlMode && fo.has(e.name) && (t = { ...t, xmlMode: 'foreign' }));
	let n = `<${e.name}`;
	const r = co(e.attribs, t);
	return (
		r && (n += ` ${r}`),
		e.children.length === 0 && (t.xmlMode ? t.selfClosingTags !== !1 : t.selfClosingTags && yn.has(e.name))
			? (t.xmlMode || (n += ' '), (n += '/>'))
			: ((n += '>'), e.children.length > 0 && (n += Wt(e.children, t)), (t.xmlMode || !yn.has(e.name)) && (n += `</${e.name}>`)),
		n
	);
}
function mo(e) {
	return `<${e.data}>`;
}
function go(e, t) {
	var u;
	let n = e.data || '';
	return (
		((u = t.encodeEntities) !== null && u !== void 0 ? u : t.decodeEntities) !== !1 &&
			!(!t.xmlMode && e.parent && so.has(e.parent.name)) &&
			(n = t.xmlMode || t.encodeEntities !== 'utf8' ? Ur(n) : ro(n)),
		n
	);
}
function bo(e) {
	return `<![CDATA[${e.children[0].data}]]>`;
}
function xo(e) {
	return `<!--${e.data}-->`;
}
function _o(e, t) {
	const u = new Ni(void 0, t);
	return (new eo(u, t).end(e), u.root);
}
function Hu(e, t, u = () => {}) {
	if (e === void 0) {
		const n = function (...r) {
			return t(n, ...r);
		};
		return n;
	}
	return e >= 0
		? function (...n) {
				return t(Hu(e - 1, t, u), ...n);
			}
		: u;
}
function jr(e, t) {
	let u = 0,
		n = e.length;
	for (; u < n && e[u] === t; ) ++u;
	for (; n > u && e[n - 1] === t; ) --n;
	return u > 0 || n < e.length ? e.substring(u, n) : e;
}
function Eo(e, t) {
	let u = e.length;
	for (; u > 0 && e[u - 1] === t; ) --u;
	return u < e.length ? e.substring(0, u) : e;
}
function So(e) {
	return e.replace(/[\s\S]/g, (t) => '\\u' + t.charCodeAt().toString(16).padStart(4, '0'));
}
function zr(e, t) {
	const u = new Map();
	for (let n = e.length; n-- > 0; ) {
		const r = e[n],
			a = t(r);
		u.set(a, u.has(a) ? br(r, u.get(a), { arrayMerge: vo }) : r);
	}
	return [...u.values()].reverse();
}
const vo = (e, t, u) => [...t];
function qe(e, t) {
	for (const u of t) {
		if (!e) return;
		e = e[u];
	}
	return e;
}
function Nn(e, t = 'a', u = 26) {
	const n = [];
	do ((e -= 1), n.push(e % u), (e = (e / u) >> 0));
	while (e > 0);
	const r = t.charCodeAt(0);
	return n
		.reverse()
		.map((a) => String.fromCharCode(r + a))
		.join('');
}
const uu = ['I', 'X', 'C', 'M'],
	Ln = ['V', 'L', 'D'];
function Dn(e) {
	return [...(e + '')]
		.map((t) => +t)
		.reverse()
		.map((t, u) => (t % 5 < 4 ? (t < 5 ? '' : Ln[u]) + uu[u].repeat(t % 5) : uu[u] + (t < 5 ? Ln[u] : uu[u + 1])))
		.reverse()
		.join('');
}
class Gr {
	constructor(t, u = void 0) {
		((this.lines = []),
			(this.nextLineWords = []),
			(this.maxLineLength = u || t.wordwrap || Number.MAX_VALUE),
			(this.nextLineAvailableChars = this.maxLineLength),
			(this.wrapCharacters = qe(t, ['longWordSplit', 'wrapCharacters']) || []),
			(this.forceWrapOnLimit = qe(t, ['longWordSplit', 'forceWrapOnLimit']) || !1),
			(this.stashedSpace = !1),
			(this.wordBreakOpportunity = !1));
	}
	pushWord(t, u = !1) {
		this.nextLineAvailableChars <= 0 && !u && this.startNewLine();
		const n = this.nextLineWords.length === 0,
			r = t.length + (n ? 0 : 1);
		if (r <= this.nextLineAvailableChars || u) (this.nextLineWords.push(t), (this.nextLineAvailableChars -= r));
		else {
			const [a, ...i] = this.splitLongWord(t);
			(n || this.startNewLine(), this.nextLineWords.push(a), (this.nextLineAvailableChars -= a.length));
			for (const s of i) (this.startNewLine(), this.nextLineWords.push(s), (this.nextLineAvailableChars -= s.length));
		}
	}
	popWord() {
		const t = this.nextLineWords.pop();
		if (t !== void 0) {
			const u = this.nextLineWords.length === 0,
				n = t.length + (u ? 0 : 1);
			this.nextLineAvailableChars += n;
		}
		return t;
	}
	concatWord(t, u = !1) {
		if (this.wordBreakOpportunity && t.length > this.nextLineAvailableChars) (this.pushWord(t, u), (this.wordBreakOpportunity = !1));
		else {
			const n = this.popWord();
			this.pushWord(n ? n.concat(t) : t, u);
		}
	}
	startNewLine(t = 1) {
		(this.lines.push(this.nextLineWords),
			t > 1 && this.lines.push(...Array.from({ length: t - 1 }, () => [])),
			(this.nextLineWords = []),
			(this.nextLineAvailableChars = this.maxLineLength));
	}
	isEmpty() {
		return this.lines.length === 0 && this.nextLineWords.length === 0;
	}
	clear() {
		((this.lines.length = 0), (this.nextLineWords.length = 0), (this.nextLineAvailableChars = this.maxLineLength));
	}
	toString() {
		return [...this.lines, this.nextLineWords].map((t) => t.join(' ')).join(`
`);
	}
	splitLongWord(t) {
		const u = [];
		let n = 0;
		for (; t.length > this.maxLineLength; ) {
			const r = t.substring(0, this.maxLineLength),
				a = t.substring(this.maxLineLength),
				i = r.lastIndexOf(this.wrapCharacters[n]);
			if (i > -1) ((t = r.substring(i + 1) + a), u.push(r.substring(0, i + 1)));
			else if ((n++, n < this.wrapCharacters.length)) t = r + a;
			else {
				if (this.forceWrapOnLimit) {
					if ((u.push(r), (t = a), t.length > this.maxLineLength)) continue;
				} else t = r + a;
				break;
			}
		}
		return (u.push(t), u);
	}
}
class ht {
	constructor(t = null) {
		this.next = t;
	}
	getRoot() {
		return this.next ? this.next : this;
	}
}
class ne extends ht {
	constructor(t, u = null, n = 1, r = void 0) {
		(super(u),
			(this.leadingLineBreaks = n),
			(this.inlineTextBuilder = new Gr(t, r)),
			(this.rawText = ''),
			(this.stashedLineBreaks = 0),
			(this.isPre = u && u.isPre),
			(this.isNoWrap = u && u.isNoWrap));
	}
}
class Bn extends ne {
	constructor(
		t,
		u = null,
		{ interRowLineBreaks: n = 1, leadingLineBreaks: r = 2, maxLineLength: a = void 0, maxPrefixLength: i = 0, prefixAlign: s = 'left' } = {}
	) {
		(super(t, u, r, a), (this.maxPrefixLength = i), (this.prefixAlign = s), (this.interRowLineBreaks = n));
	}
}
class ve extends ne {
	constructor(t, u = null, { leadingLineBreaks: n = 1, maxLineLength: r = void 0, prefix: a = '' } = {}) {
		(super(t, u, n, r), (this.prefix = a));
	}
}
class In extends ht {
	constructor(t = null) {
		(super(t), (this.rows = []), (this.isPre = t && t.isPre), (this.isNoWrap = t && t.isNoWrap));
	}
}
class Pn extends ht {
	constructor(t = null) {
		(super(t), (this.cells = []), (this.isPre = t && t.isPre), (this.isNoWrap = t && t.isNoWrap));
	}
}
class ke extends ht {
	constructor(t, u = null, n = void 0) {
		(super(u),
			(this.inlineTextBuilder = new Gr(t, n)),
			(this.rawText = ''),
			(this.stashedLineBreaks = 0),
			(this.isPre = u && u.isPre),
			(this.isNoWrap = u && u.isNoWrap));
	}
}
class ko extends ht {
	constructor(t = null, u) {
		(super(t), (this.transform = u));
	}
}
function Co(e) {
	return [...e].map((t) => '\\u' + t.charCodeAt(0).toString(16).padStart(4, '0')).join('');
}
class To {
	constructor(t) {
		this.whitespaceChars = t.preserveNewlines ? t.whitespaceCharacters.replace(/\n/g, '') : t.whitespaceCharacters;
		const u = Co(this.whitespaceChars);
		if (
			((this.leadingWhitespaceRe = new RegExp(`^[${u}]`)),
			(this.trailingWhitespaceRe = new RegExp(`[${u}]$`)),
			(this.allWhitespaceOrEmptyRe = new RegExp(`^[${u}]*$`)),
			(this.newlineOrNonWhitespaceRe = new RegExp(`(\\n|[^\\n${u}])`, 'g')),
			(this.newlineOrNonNewlineStringRe = new RegExp('(\\n|[^\\n]+)', 'g')),
			t.preserveNewlines)
		) {
			const n = new RegExp(`\\n|[^\\n${u}]+`, 'gm');
			this.shrinkWrapAdd = function (r, a, i = (o) => o, s = !1) {
				if (!r) return;
				const o = a.stashedSpace;
				let l = !1,
					h = n.exec(r);
				if (h)
					for (
						l = !0,
							h[0] ===
							`
`
								? a.startNewLine()
								: o || this.testLeadingWhitespace(r)
									? a.pushWord(i(h[0]), s)
									: a.concatWord(i(h[0]), s);
						(h = n.exec(r)) !== null;
					)
						h[0] ===
						`
`
							? a.startNewLine()
							: a.pushWord(i(h[0]), s);
				a.stashedSpace = (o && !l) || this.testTrailingWhitespace(r);
			};
		} else {
			const n = new RegExp(`[^${u}]+`, 'g');
			this.shrinkWrapAdd = function (r, a, i = (o) => o, s = !1) {
				if (!r) return;
				const o = a.stashedSpace;
				let l = !1,
					h = n.exec(r);
				if (h)
					for (l = !0, o || this.testLeadingWhitespace(r) ? a.pushWord(i(h[0]), s) : a.concatWord(i(h[0]), s); (h = n.exec(r)) !== null; )
						a.pushWord(i(h[0]), s);
				a.stashedSpace = (o && !l) || this.testTrailingWhitespace(r);
			};
		}
	}
	addLiteral(t, u, n = !0) {
		if (!t) return;
		const r = u.stashedSpace;
		let a = !1,
			i = this.newlineOrNonNewlineStringRe.exec(t);
		if (i)
			for (
				a = !0,
					i[0] ===
					`
`
						? u.startNewLine()
						: r
							? u.pushWord(i[0], n)
							: u.concatWord(i[0], n);
				(i = this.newlineOrNonNewlineStringRe.exec(t)) !== null;
			)
				i[0] ===
				`
`
					? u.startNewLine()
					: u.pushWord(i[0], n);
		u.stashedSpace = r && !a;
	}
	testLeadingWhitespace(t) {
		return this.leadingWhitespaceRe.test(t);
	}
	testTrailingWhitespace(t) {
		return this.trailingWhitespaceRe.test(t);
	}
	testContainsWords(t) {
		return !this.allWhitespaceOrEmptyRe.test(t);
	}
	countNewlinesNoWords(t) {
		this.newlineOrNonWhitespaceRe.lastIndex = 0;
		let u = 0,
			n;
		for (; (n = this.newlineOrNonWhitespaceRe.exec(t)) !== null; )
			if (
				n[0] ===
				`
`
			)
				u++;
			else return 0;
		return u;
	}
}
class Ao {
	constructor(t, u, n = void 0) {
		((this.options = t),
			(this.picker = u),
			(this.metadata = n),
			(this.whitespaceProcessor = new To(t)),
			(this._stackItem = new ne(t)),
			(this._wordTransformer = void 0));
	}
	pushWordTransform(t) {
		this._wordTransformer = new ko(this._wordTransformer, t);
	}
	popWordTransform() {
		if (!this._wordTransformer) return;
		const t = this._wordTransformer.transform;
		return ((this._wordTransformer = this._wordTransformer.next), t);
	}
	startNoWrap() {
		this._stackItem.isNoWrap = !0;
	}
	stopNoWrap() {
		this._stackItem.isNoWrap = !1;
	}
	_getCombinedWordTransformer() {
		const t = this._wordTransformer ? (n) => Xr(n, this._wordTransformer) : void 0,
			u = this.options.encodeCharacters;
		return t ? (u ? (n) => u(t(n)) : t) : u;
	}
	_popStackItem() {
		const t = this._stackItem;
		return ((this._stackItem = t.next), t);
	}
	addLineBreak() {
		(this._stackItem instanceof ne || this._stackItem instanceof ve || this._stackItem instanceof ke) &&
			(this._stackItem.isPre
				? (this._stackItem.rawText += `
`)
				: this._stackItem.inlineTextBuilder.startNewLine());
	}
	addWordBreakOpportunity() {
		(this._stackItem instanceof ne || this._stackItem instanceof ve || this._stackItem instanceof ke) &&
			(this._stackItem.inlineTextBuilder.wordBreakOpportunity = !0);
	}
	addInline(t, { noWordTransform: u = !1 } = {}) {
		if (this._stackItem instanceof ne || this._stackItem instanceof ve || this._stackItem instanceof ke) {
			if (this._stackItem.isPre) {
				this._stackItem.rawText += t;
				return;
			}
			if (!(t.length === 0 || (this._stackItem.stashedLineBreaks && !this.whitespaceProcessor.testContainsWords(t)))) {
				if (this.options.preserveNewlines) {
					const n = this.whitespaceProcessor.countNewlinesNoWords(t);
					if (n > 0) {
						this._stackItem.inlineTextBuilder.startNewLine(n);
						return;
					}
				}
				(this._stackItem.stashedLineBreaks && this._stackItem.inlineTextBuilder.startNewLine(this._stackItem.stashedLineBreaks),
					this.whitespaceProcessor.shrinkWrapAdd(
						t,
						this._stackItem.inlineTextBuilder,
						u ? void 0 : this._getCombinedWordTransformer(),
						this._stackItem.isNoWrap
					),
					(this._stackItem.stashedLineBreaks = 0));
			}
		}
	}
	addLiteral(t) {
		if ((this._stackItem instanceof ne || this._stackItem instanceof ve || this._stackItem instanceof ke) && t.length !== 0) {
			if (this._stackItem.isPre) {
				this._stackItem.rawText += t;
				return;
			}
			(this._stackItem.stashedLineBreaks && this._stackItem.inlineTextBuilder.startNewLine(this._stackItem.stashedLineBreaks),
				this.whitespaceProcessor.addLiteral(t, this._stackItem.inlineTextBuilder, this._stackItem.isNoWrap),
				(this._stackItem.stashedLineBreaks = 0));
		}
	}
	openBlock({ leadingLineBreaks: t = 1, reservedLineLength: u = 0, isPre: n = !1 } = {}) {
		const r = Math.max(20, this._stackItem.inlineTextBuilder.maxLineLength - u);
		((this._stackItem = new ne(this.options, this._stackItem, t, r)), n && (this._stackItem.isPre = !0));
	}
	closeBlock({ trailingLineBreaks: t = 1, blockTransform: u = void 0 } = {}) {
		const n = this._popStackItem(),
			r = u ? u(Ee(n)) : Ee(n);
		Ct(this._stackItem, r, n.leadingLineBreaks, Math.max(n.stashedLineBreaks, t));
	}
	openList({ maxPrefixLength: t = 0, prefixAlign: u = 'left', interRowLineBreaks: n = 1, leadingLineBreaks: r = 2 } = {}) {
		this._stackItem = new Bn(this.options, this._stackItem, {
			interRowLineBreaks: n,
			leadingLineBreaks: r,
			maxLineLength: this._stackItem.inlineTextBuilder.maxLineLength,
			maxPrefixLength: t,
			prefixAlign: u
		});
	}
	openListItem({ prefix: t = '' } = {}) {
		if (!(this._stackItem instanceof Bn)) throw new Error("Can't add a list item to something that is not a list! Check the formatter.");
		const u = this._stackItem,
			n = Math.max(t.length, u.maxPrefixLength),
			r = Math.max(20, u.inlineTextBuilder.maxLineLength - n);
		this._stackItem = new ve(this.options, u, { prefix: t, maxLineLength: r, leadingLineBreaks: u.interRowLineBreaks });
	}
	closeListItem() {
		const t = this._popStackItem(),
			u = t.next,
			n = Math.max(t.prefix.length, u.maxPrefixLength),
			r =
				`
` + ' '.repeat(n),
			i = (u.prefixAlign === 'right' ? t.prefix.padStart(n) : t.prefix.padEnd(n)) + Ee(t).replace(/\n/g, r);
		Ct(u, i, t.leadingLineBreaks, Math.max(t.stashedLineBreaks, u.interRowLineBreaks));
	}
	closeList({ trailingLineBreaks: t = 2 } = {}) {
		const u = this._popStackItem(),
			n = Ee(u);
		n && Ct(this._stackItem, n, u.leadingLineBreaks, t);
	}
	openTable() {
		this._stackItem = new In(this._stackItem);
	}
	openTableRow() {
		if (!(this._stackItem instanceof In)) throw new Error("Can't add a table row to something that is not a table! Check the formatter.");
		this._stackItem = new Pn(this._stackItem);
	}
	openTableCell({ maxColumnWidth: t = void 0 } = {}) {
		if (!(this._stackItem instanceof Pn)) throw new Error("Can't add a table cell to something that is not a table row! Check the formatter.");
		this._stackItem = new ke(this.options, this._stackItem, t);
	}
	closeTableCell({ colspan: t = 1, rowspan: u = 1 } = {}) {
		const n = this._popStackItem(),
			r = jr(
				Ee(n),
				`
`
			);
		n.next.cells.push({ colspan: t, rowspan: u, text: r });
	}
	closeTableRow() {
		const t = this._popStackItem();
		t.next.rows.push(t.cells);
	}
	closeTable({ tableToString: t, leadingLineBreaks: u = 2, trailingLineBreaks: n = 2 }) {
		const r = this._popStackItem(),
			a = t(r.rows);
		a && Ct(this._stackItem, a, u, n);
	}
	toString() {
		return Ee(this._stackItem.getRoot());
	}
}
function Ee(e) {
	if (!(e instanceof ne || e instanceof ve || e instanceof ke))
		throw new Error('Only blocks, list items and table cells can be requested for text contents.');
	return e.inlineTextBuilder.isEmpty() ? e.rawText : e.rawText + e.inlineTextBuilder.toString();
}
function Ct(e, t, u, n) {
	if (!(e instanceof ne || e instanceof ve || e instanceof ke)) throw new Error('Only blocks, list items and table cells can contain text.');
	const r = Ee(e),
		a = Math.max(e.stashedLineBreaks, u);
	(e.inlineTextBuilder.clear(),
		r
			? (e.rawText =
					r +
					`
`.repeat(a) +
					t)
			: ((e.rawText = t), (e.leadingLineBreaks = a)),
		(e.stashedLineBreaks = n));
}
function Xr(e, t) {
	return t ? Xr(t.transform(e), t.next) : e;
}
function wo(e = {}) {
	const t = e.selectors.filter((i) => !i.format);
	if (t.length) throw new Error('Following selectors have no specified format: ' + t.map((i) => `\`${i.selector}\``).join(', '));
	const u = new xn(e.selectors.map((i) => [i.selector, i])).build(En);
	typeof e.encodeCharacters != 'function' && (e.encodeCharacters = Do(e.encodeCharacters));
	const n = new xn(e.baseElements.selectors.map((i, s) => [i, s + 1])).build(En);
	function r(i) {
		return No(i, e, n);
	}
	const a = Hu(e.limits.maxDepth, Lo, function (i, s) {
		s.addInline(e.limits.ellipsis || '');
	});
	return function (i, s = void 0) {
		return yo(i, s, e, u, r, a);
	};
}
function yo(e, t, u, n, r, a) {
	const i = u.limits.maxInputLength;
	i &&
		e &&
		e.length > i &&
		(console.warn(`Input length ${e.length} is above allowed limit of ${i}. Truncating without ellipsis.`), (e = e.substring(0, i)));
	const s = _o(e, { decodeEntities: u.decodeEntities }),
		o = r(s.children),
		l = new Ao(u, n, t);
	return (a(o, l), l.toString());
}
function No(e, t, u) {
	const n = [];
	function r(i, s) {
		s = s.slice(0, t.limits.maxChildNodes);
		for (const o of s) {
			if (o.type !== 'tag') continue;
			const l = u.pick1(o);
			if ((l > 0 ? n.push({ selectorIndex: l, element: o }) : o.children && i(o.children), n.length >= t.limits.maxBaseElements)) return;
		}
	}
	return (
		Hu(t.limits.maxDepth, r)(e),
		t.baseElements.orderBy !== 'occurrence' && n.sort((i, s) => i.selectorIndex - s.selectorIndex),
		t.baseElements.returnDomByDefault && n.length === 0 ? e : n.map((i) => i.element)
	);
}
function Lo(e, t, u) {
	if (!t) return;
	const n = u.options;
	t.length > n.limits.maxChildNodes && ((t = t.slice(0, n.limits.maxChildNodes)), t.push({ data: n.limits.ellipsis, type: 'text' }));
	for (const a of t)
		switch (a.type) {
			case 'text': {
				u.addInline(a.data);
				break;
			}
			case 'tag': {
				const i = u.picker.pick1(a),
					s = n.formatters[i.format];
				s(a, e, u, i.options || {});
				break;
			}
		}
}
function Do(e) {
	if (!e || Object.keys(e).length === 0) return;
	const t = Object.entries(e).filter(([, a]) => a !== !1),
		u = new RegExp(t.map(([a]) => `(${So([...a][0])})`).join('|'), 'g'),
		n = t.map(([, a]) => a),
		r = (a, ...i) => n[i.findIndex((s) => s)];
	return (a) => a.replace(u, r);
}
function Bo(e, t, u, n) {}
function Io(e, t, u, n) {
	u.addLiteral(n.string || '');
}
function Po(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks || 2 }),
		u.addLiteral(n.string || ''),
		u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks || 2 }));
}
function Oo(e, t, u, n) {
	t(e.children, u);
}
function Ro(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks || 2 }), t(e.children, u), u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks || 2 }));
}
function Yr(e) {
	const t =
		e.attribs && e.attribs.length
			? ' ' +
				Object.entries(e.attribs)
					.map(([u, n]) => (n === '' ? u : `${u}=${n.replace(/"/g, '&quot;')}`))
					.join(' ')
			: '';
	return `<${e.name}${t}>`;
}
function Kr(e) {
	return `</${e.name}>`;
}
function qo(e, t, u, n) {
	(u.startNoWrap(), u.addLiteral(Yr(e)), u.stopNoWrap(), t(e.children, u), u.startNoWrap(), u.addLiteral(Kr(e)), u.stopNoWrap());
}
function Fo(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks || 2 }),
		u.startNoWrap(),
		u.addLiteral(Yr(e)),
		u.stopNoWrap(),
		t(e.children, u),
		u.startNoWrap(),
		u.addLiteral(Kr(e)),
		u.stopNoWrap(),
		u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks || 2 }));
}
function Mo(e, t, u, n) {
	(u.startNoWrap(), u.addLiteral(Wt(e, { decodeEntities: u.options.decodeEntities })), u.stopNoWrap());
}
function Ho(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks || 2 }),
		u.startNoWrap(),
		u.addLiteral(Wt(e, { decodeEntities: u.options.decodeEntities })),
		u.stopNoWrap(),
		u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks || 2 }));
}
function Vo(e, t, u, n) {
	(u.addLiteral(n.prefix || ''), t(e.children, u), u.addLiteral(n.suffix || ''));
}
var Wo = Object.freeze({
	__proto__: null,
	block: Ro,
	blockHtml: Ho,
	blockString: Po,
	blockTag: Fo,
	inline: Oo,
	inlineHtml: Mo,
	inlineString: Io,
	inlineSurround: Vo,
	inlineTag: qo,
	skip: Bo
});
function qt(e, t) {
	return (e[t] || (e[t] = []), e[t]);
}
function Uo(e, t = 0) {
	for (; e[t]; ) t++;
	return t;
}
function $o(e, t) {
	for (let u = 0; u < t; u++) {
		const n = qt(e, u);
		for (let r = 0; r < u; r++) {
			const a = qt(e, r);
			if (n[r] || a[u]) {
				const i = n[r];
				((n[r] = a[u]), (a[u] = i));
			}
		}
	}
}
function jo(e, t, u, n) {
	for (let r = 0; r < e.rowspan; r++) {
		const a = qt(t, u + r);
		for (let i = 0; i < e.colspan; i++) a[n + i] = e;
	}
}
function bu(e, t) {
	return (e[t] === void 0 && (e[t] = t === 0 ? 0 : 1 + bu(e, t - 1)), e[t]);
}
function On(e, t, u, n) {
	e[t + u] = Math.max(bu(e, t + u), bu(e, t) + n);
}
function zo(e, t, u) {
	const n = [];
	let r = 0;
	const a = e.length,
		i = [0];
	for (let l = 0; l < a; l++) {
		const h = qt(n, l),
			x = e[l];
		let _ = 0;
		for (let m = 0; m < x.length; m++) {
			const b = x[m];
			((_ = Uo(h, _)),
				jo(b, n, l, _),
				(_ += b.colspan),
				(b.lines = b.text.split(`
`)));
			const T = b.lines.length;
			On(i, l, b.rowspan, T + t);
		}
		r = h.length > r ? h.length : r;
	}
	$o(n, a > r ? a : r);
	const s = [],
		o = [0];
	for (let l = 0; l < r; l++) {
		let h = 0,
			x;
		const _ = Math.min(a, n[l].length);
		for (; h < _; )
			if (((x = n[l][h]), x)) {
				if (!x.rendered) {
					let m = 0;
					for (let b = 0; b < x.lines.length; b++) {
						const T = x.lines[b],
							q = i[h] + b;
						((s[q] = (s[q] || '').padEnd(o[l]) + T), (m = T.length > m ? T.length : m));
					}
					(On(o, l, x.colspan, m + u), (x.rendered = !0));
				}
				h += x.rowspan;
			} else {
				const m = i[h];
				((s[m] = s[m] || ''), h++);
			}
	}
	return s.join(`
`);
}
function Go(e, t, u, n) {
	u.addLineBreak();
}
function Xo(e, t, u, n) {
	u.addWordBreakOpportunity();
}
function Yo(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks || 2 }),
		u.addInline('-'.repeat(n.length || u.options.wordwrap || 40)),
		u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks || 2 }));
}
function Ko(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks || 2 }), t(e.children, u), u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks || 2 }));
}
function Qo(e, t, u, n) {
	(u.openBlock({ isPre: !0, leadingLineBreaks: n.leadingLineBreaks || 2 }),
		t(e.children, u),
		u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks || 2 }));
}
function Jo(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks || 2 }),
		n.uppercase !== !1 ? (u.pushWordTransform((r) => r.toUpperCase()), t(e.children, u), u.popWordTransform()) : t(e.children, u),
		u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks || 2 }));
}
function Zo(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks || 2, reservedLineLength: 2 }),
		t(e.children, u),
		u.closeBlock({
			trailingLineBreaks: n.trailingLineBreaks || 2,
			blockTransform: (r) =>
				(n.trimEmptyLines !== !1
					? jr(
							r,
							`
`
						)
					: r
				)
					.split(
						`
`
					)
					.map((a) => '> ' + a).join(`
`)
		}));
}
function xu(e, t) {
	if (!t) return e;
	const u = typeof t[0] == 'string' ? t[0] : '[',
		n = typeof t[1] == 'string' ? t[1] : ']';
	return u + e + n;
}
function Qr(e, t, u, n, r) {
	const a = typeof t == 'function' ? t(e, n, r) : e;
	return a[0] === '/' && u ? Eo(u, '/') + a : a;
}
function ec(e, t, u, n) {
	const r = e.attribs || {},
		a = r.alt ? r.alt : '',
		i = r.src ? Qr(r.src, n.pathRewrite, n.baseUrl, u.metadata, e) : '',
		s = i ? (a ? a + ' ' + xu(i, n.linkBrackets) : xu(i, n.linkBrackets)) : a;
	u.addInline(s, { noWordTransform: !0 });
}
function tc(e, t, u, n) {
	function r() {
		if (n.ignoreHref || !e.attribs || !e.attribs.href) return '';
		let i = e.attribs.href.replace(/^mailto:/, '');
		return n.noAnchorUrl && i[0] === '#' ? '' : ((i = Qr(i, n.pathRewrite, n.baseUrl, u.metadata, e)), i);
	}
	const a = r();
	if (!a) t(e.children, u);
	else {
		let i = '';
		(u.pushWordTransform((o) => (o && (i += o), o)),
			t(e.children, u),
			u.popWordTransform(),
			(n.hideLinkHrefIfSameAsText && a === i) || u.addInline(i ? ' ' + xu(a, n.linkBrackets) : a, { noWordTransform: !0 }));
	}
}
function Jr(e, t, u, n, r) {
	const a = qe(e, ['parent', 'name']) === 'li';
	let i = 0;
	const s = (e.children || [])
		.filter((o) => o.type !== 'text' || !/^\s*$/.test(o.data))
		.map(function (o) {
			if (o.name !== 'li') return { node: o, prefix: '' };
			const l = a ? r().trimStart() : r();
			return (l.length > i && (i = l.length), { node: o, prefix: l });
		});
	if (s.length) {
		u.openList({ interRowLineBreaks: 1, leadingLineBreaks: a ? 1 : n.leadingLineBreaks || 2, maxPrefixLength: i, prefixAlign: 'left' });
		for (const { node: o, prefix: l } of s) (u.openListItem({ prefix: l }), t([o], u), u.closeListItem());
		u.closeList({ trailingLineBreaks: a ? 1 : n.trailingLineBreaks || 2 });
	}
}
function uc(e, t, u, n) {
	const r = n.itemPrefix || ' * ';
	return Jr(e, t, u, n, () => r);
}
function nc(e, t, u, n) {
	let r = Number(e.attribs.start || '1');
	const a = rc(e.attribs.type);
	return Jr(e, t, u, n, () => ' ' + a(r++) + '. ');
}
function rc(e = '1') {
	switch (e) {
		case 'a':
			return (t) => Nn(t, 'a');
		case 'A':
			return (t) => Nn(t, 'A');
		case 'i':
			return (t) => Dn(t).toLowerCase();
		case 'I':
			return (t) => Dn(t);
		case '1':
		default:
			return (t) => t.toString();
	}
}
function ac(e) {
	const t = [],
		u = [];
	for (const n of e) n.startsWith('.') ? t.push(n.substring(1)) : n.startsWith('#') && u.push(n.substring(1));
	return { classes: t, ids: u };
}
function ic(e, t) {
	if (t === !0) return !0;
	if (!e) return !1;
	const { classes: u, ids: n } = ac(t),
		r = (e.class || '').split(' '),
		a = (e.id || '').split(' ');
	return r.some((i) => u.includes(i)) || a.some((i) => n.includes(i));
}
function sc(e, t, u, n) {
	return ic(e.attribs, u.options.tables) ? Zr(e, t, u, n) : oc(e, t, u, n);
}
function oc(e, t, u, n) {
	(u.openBlock({ leadingLineBreaks: n.leadingLineBreaks }), t(e.children, u), u.closeBlock({ trailingLineBreaks: n.trailingLineBreaks }));
}
function Zr(e, t, u, n) {
	(u.openTable(),
		e.children.forEach(a),
		u.closeTable({
			tableToString: (i) => zo(i, n.rowSpacing ?? 0, n.colSpacing ?? 3),
			leadingLineBreaks: n.leadingLineBreaks,
			trailingLineBreaks: n.trailingLineBreaks
		}));
	function r(i) {
		const s = +qe(i, ['attribs', 'colspan']) || 1,
			o = +qe(i, ['attribs', 'rowspan']) || 1;
		(u.openTableCell({ maxColumnWidth: n.maxColumnWidth }), t(i.children, u), u.closeTableCell({ colspan: s, rowspan: o }));
	}
	function a(i) {
		if (i.type !== 'tag') return;
		const s =
			n.uppercaseHeaderCells !== !1
				? (o) => {
						(u.pushWordTransform((l) => l.toUpperCase()), r(o), u.popWordTransform());
					}
				: r;
		switch (i.name) {
			case 'thead':
			case 'tbody':
			case 'tfoot':
			case 'center':
				i.children.forEach(a);
				return;
			case 'tr': {
				u.openTableRow();
				for (const o of i.children)
					if (o.type === 'tag')
						switch (o.name) {
							case 'th': {
								s(o);
								break;
							}
							case 'td': {
								r(o);
								break;
							}
						}
				u.closeTableRow();
				break;
			}
		}
	}
}
var cc = Object.freeze({
	__proto__: null,
	anchor: tc,
	blockquote: Zo,
	dataTable: Zr,
	heading: Jo,
	horizontalLine: Yo,
	image: ec,
	lineBreak: Go,
	orderedList: nc,
	paragraph: Ko,
	pre: Qo,
	table: sc,
	unorderedList: uc,
	wbr: Xo
});
const lc = {
		baseElements: { selectors: ['body'], orderBy: 'selectors', returnDomByDefault: !0 },
		decodeEntities: !0,
		encodeCharacters: {},
		formatters: {},
		limits: { ellipsis: '...', maxBaseElements: void 0, maxChildNodes: void 0, maxDepth: void 0, maxInputLength: 1 << 24 },
		longWordSplit: { forceWrapOnLimit: !1, wrapCharacters: [] },
		preserveNewlines: !1,
		selectors: [
			{ selector: '*', format: 'inline' },
			{
				selector: 'a',
				format: 'anchor',
				options: { baseUrl: null, hideLinkHrefIfSameAsText: !1, ignoreHref: !1, linkBrackets: ['[', ']'], noAnchorUrl: !0 }
			},
			{ selector: 'article', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{ selector: 'aside', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{ selector: 'blockquote', format: 'blockquote', options: { leadingLineBreaks: 2, trailingLineBreaks: 2, trimEmptyLines: !0 } },
			{ selector: 'br', format: 'lineBreak' },
			{ selector: 'div', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{ selector: 'footer', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{ selector: 'form', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{ selector: 'h1', format: 'heading', options: { leadingLineBreaks: 3, trailingLineBreaks: 2, uppercase: !0 } },
			{ selector: 'h2', format: 'heading', options: { leadingLineBreaks: 3, trailingLineBreaks: 2, uppercase: !0 } },
			{ selector: 'h3', format: 'heading', options: { leadingLineBreaks: 3, trailingLineBreaks: 2, uppercase: !0 } },
			{ selector: 'h4', format: 'heading', options: { leadingLineBreaks: 2, trailingLineBreaks: 2, uppercase: !0 } },
			{ selector: 'h5', format: 'heading', options: { leadingLineBreaks: 2, trailingLineBreaks: 2, uppercase: !0 } },
			{ selector: 'h6', format: 'heading', options: { leadingLineBreaks: 2, trailingLineBreaks: 2, uppercase: !0 } },
			{ selector: 'header', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{ selector: 'hr', format: 'horizontalLine', options: { leadingLineBreaks: 2, length: void 0, trailingLineBreaks: 2 } },
			{ selector: 'img', format: 'image', options: { baseUrl: null, linkBrackets: ['[', ']'] } },
			{ selector: 'main', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{ selector: 'nav', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{ selector: 'ol', format: 'orderedList', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
			{ selector: 'p', format: 'paragraph', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
			{ selector: 'pre', format: 'pre', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
			{ selector: 'section', format: 'block', options: { leadingLineBreaks: 1, trailingLineBreaks: 1 } },
			{
				selector: 'table',
				format: 'table',
				options: { colSpacing: 3, leadingLineBreaks: 2, maxColumnWidth: 60, rowSpacing: 0, trailingLineBreaks: 2, uppercaseHeaderCells: !0 }
			},
			{ selector: 'ul', format: 'unorderedList', options: { itemPrefix: ' * ', leadingLineBreaks: 2, trailingLineBreaks: 2 } },
			{ selector: 'wbr', format: 'wbr' }
		],
		tables: [],
		whitespaceCharacters: ` 	\r
\f​`,
		wordwrap: 80
	},
	dc = (e, t, u) => [...e, ...t],
	ea = (e, t, u) => [...t],
	hc = (e, t, u) => (e.some((n) => typeof n == 'object') ? dc(e, t) : ea(e, t));
function fc(e = {}) {
	return (
		(e = br(lc, e, { arrayMerge: ea, customMerge: (t) => (t === 'selectors' ? hc : void 0) })),
		(e.formatters = Object.assign({}, Wo, cc, e.formatters)),
		(e.selectors = zr(e.selectors, (t) => t.selector)),
		mc(e),
		wo(e)
	);
}
function pc(e, t = {}, u = void 0) {
	return fc(t)(e, u);
}
function mc(e) {
	if (e.tags) {
		const u = Object.entries(e.tags).map(([n, r]) => ({ ...r, selector: n || '*' }));
		(e.selectors.push(...u), (e.selectors = zr(e.selectors, (n) => n.selector)));
	}
	function t(u, n, r) {
		const a = n.pop();
		for (const i of n) {
			let s = u[i];
			(s || ((s = {}), (u[i] = s)), (u = s));
		}
		u[a] = r;
	}
	if (e.baseElement) {
		const u = e.baseElement;
		t(e, ['baseElements', 'selectors'], Array.isArray(u) ? u : [u]);
	}
	e.returnDomByDefault !== void 0 && t(e, ['baseElements', 'returnDomByDefault'], e.returnDomByDefault);
	for (const u of e.selectors) u.format === 'anchor' && qe(u, ['options', 'noLinkBrackets']) && t(u, ['options', 'linkBrackets'], !1);
}
var nu = { exports: {} },
	E = {};
var Rn;
function gc() {
	if (Rn) return E;
	Rn = 1;
	var e = Symbol.for('react.transitional.element'),
		t = Symbol.for('react.portal'),
		u = Symbol.for('react.fragment'),
		n = Symbol.for('react.strict_mode'),
		r = Symbol.for('react.profiler'),
		a = Symbol.for('react.consumer'),
		i = Symbol.for('react.context'),
		s = Symbol.for('react.forward_ref'),
		o = Symbol.for('react.suspense'),
		l = Symbol.for('react.memo'),
		h = Symbol.for('react.lazy'),
		x = Symbol.for('react.activity'),
		_ = Symbol.iterator;
	function m(c) {
		return c === null || typeof c != 'object' ? null : ((c = (_ && c[_]) || c['@@iterator']), typeof c == 'function' ? c : null);
	}
	var b = {
			isMounted: function () {
				return !1;
			},
			enqueueForceUpdate: function () {},
			enqueueReplaceState: function () {},
			enqueueSetState: function () {}
		},
		T = Object.assign,
		q = {};
	function V(c, p, k) {
		((this.props = c), (this.context = p), (this.refs = q), (this.updater = k || b));
	}
	((V.prototype.isReactComponent = {}),
		(V.prototype.setState = function (c, p) {
			if (typeof c != 'object' && typeof c != 'function' && c != null)
				throw Error('takes an object of state variables to update or a function which returns an object of state variables.');
			this.updater.enqueueSetState(this, c, p, 'setState');
		}),
		(V.prototype.forceUpdate = function (c) {
			this.updater.enqueueForceUpdate(this, c, 'forceUpdate');
		}));
	function te() {}
	te.prototype = V.prototype;
	function K(c, p, k) {
		((this.props = c), (this.context = p), (this.refs = q), (this.updater = k || b));
	}
	var pe = (K.prototype = new te());
	((pe.constructor = K), T(pe, V.prototype), (pe.isPureReactComponent = !0));
	var oe = Array.isArray;
	function ce() {}
	var y = { H: null, A: null, T: null, S: null },
		sn = Object.prototype.hasOwnProperty;
	function Qt(c, p, k) {
		var S = k.ref;
		return { $$typeof: e, type: c, key: p, ref: S !== void 0 ? S : null, props: k };
	}
	function ii(c, p) {
		return Qt(c.type, p, c.props);
	}
	function Jt(c) {
		return typeof c == 'object' && c !== null && c.$$typeof === e;
	}
	function si(c) {
		var p = { '=': '=0', ':': '=2' };
		return (
			'$' +
			c.replace(/[=:]/g, function (k) {
				return p[k];
			})
		);
	}
	var on = /\/+/g;
	function Zt(c, p) {
		return typeof c == 'object' && c !== null && c.key != null ? si('' + c.key) : p.toString(36);
	}
	function oi(c) {
		switch (c.status) {
			case 'fulfilled':
				return c.value;
			case 'rejected':
				throw c.reason;
			default:
				switch (
					(typeof c.status == 'string'
						? c.then(ce, ce)
						: ((c.status = 'pending'),
							c.then(
								function (p) {
									c.status === 'pending' && ((c.status = 'fulfilled'), (c.value = p));
								},
								function (p) {
									c.status === 'pending' && ((c.status = 'rejected'), (c.reason = p));
								}
							)),
					c.status)
				) {
					case 'fulfilled':
						return c.value;
					case 'rejected':
						throw c.reason;
				}
		}
		throw c;
	}
	function Ne(c, p, k, S, A) {
		var N = typeof c;
		(N === 'undefined' || N === 'boolean') && (c = null);
		var B = !1;
		if (c === null) B = !0;
		else
			switch (N) {
				case 'bigint':
				case 'string':
				case 'number':
					B = !0;
					break;
				case 'object':
					switch (c.$$typeof) {
						case e:
						case t:
							B = !0;
							break;
						case h:
							return ((B = c._init), Ne(B(c._payload), p, k, S, A));
					}
			}
		if (B)
			return (
				(A = A(c)),
				(B = S === '' ? '.' + Zt(c, 0) : S),
				oe(A)
					? ((k = ''),
						B != null && (k = B.replace(on, '$&/') + '/'),
						Ne(A, p, k, '', function (di) {
							return di;
						}))
					: A != null &&
						(Jt(A) && (A = ii(A, k + (A.key == null || (c && c.key === A.key) ? '' : ('' + A.key).replace(on, '$&/') + '/') + B)), p.push(A)),
				1
			);
		B = 0;
		var ue = S === '' ? '.' : S + ':';
		if (oe(c)) for (var j = 0; j < c.length; j++) ((S = c[j]), (N = ue + Zt(S, j)), (B += Ne(S, p, k, N, A)));
		else if (((j = m(c)), typeof j == 'function'))
			for (c = j.call(c), j = 0; !(S = c.next()).done; ) ((S = S.value), (N = ue + Zt(S, j++)), (B += Ne(S, p, k, N, A)));
		else if (N === 'object') {
			if (typeof c.then == 'function') return Ne(oi(c), p, k, S, A);
			throw (
				(p = String(c)),
				Error(
					'Objects are not valid as a React child (found: ' +
						(p === '[object Object]' ? 'object with keys {' + Object.keys(c).join(', ') + '}' : p) +
						'). If you meant to render a collection of children, use an array instead.'
				)
			);
		}
		return B;
	}
	function St(c, p, k) {
		if (c == null) return c;
		var S = [],
			A = 0;
		return (
			Ne(c, S, '', '', function (N) {
				return p.call(k, N, A++);
			}),
			S
		);
	}
	function ci(c) {
		if (c._status === -1) {
			var p = c._result;
			((p = p()),
				p.then(
					function (k) {
						(c._status === 0 || c._status === -1) && ((c._status = 1), (c._result = k));
					},
					function (k) {
						(c._status === 0 || c._status === -1) && ((c._status = 2), (c._result = k));
					}
				),
				c._status === -1 && ((c._status = 0), (c._result = p)));
		}
		if (c._status === 1) return c._result.default;
		throw c._result;
	}
	var cn =
			typeof reportError == 'function'
				? reportError
				: function (c) {
						if (typeof window == 'object' && typeof window.ErrorEvent == 'function') {
							var p = new window.ErrorEvent('error', {
								bubbles: !0,
								cancelable: !0,
								message: typeof c == 'object' && c !== null && typeof c.message == 'string' ? String(c.message) : String(c),
								error: c
							});
							if (!window.dispatchEvent(p)) return;
						} else if (typeof process == 'object' && typeof process.emit == 'function') {
							process.emit('uncaughtException', c);
							return;
						}
						console.error(c);
					},
		li = {
			map: St,
			forEach: function (c, p, k) {
				St(
					c,
					function () {
						p.apply(this, arguments);
					},
					k
				);
			},
			count: function (c) {
				var p = 0;
				return (
					St(c, function () {
						p++;
					}),
					p
				);
			},
			toArray: function (c) {
				return (
					St(c, function (p) {
						return p;
					}) || []
				);
			},
			only: function (c) {
				if (!Jt(c)) throw Error('React.Children.only expected to receive a single React element child.');
				return c;
			}
		};
	return (
		(E.Activity = x),
		(E.Children = li),
		(E.Component = V),
		(E.Fragment = u),
		(E.Profiler = r),
		(E.PureComponent = K),
		(E.StrictMode = n),
		(E.Suspense = o),
		(E.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = y),
		(E.__COMPILER_RUNTIME = {
			__proto__: null,
			c: function (c) {
				return y.H.useMemoCache(c);
			}
		}),
		(E.cache = function (c) {
			return function () {
				return c.apply(null, arguments);
			};
		}),
		(E.cacheSignal = function () {
			return null;
		}),
		(E.cloneElement = function (c, p, k) {
			if (c == null) throw Error('The argument must be a React element, but you passed ' + c + '.');
			var S = T({}, c.props),
				A = c.key;
			if (p != null)
				for (N in (p.key !== void 0 && (A = '' + p.key), p))
					!sn.call(p, N) || N === 'key' || N === '__self' || N === '__source' || (N === 'ref' && p.ref === void 0) || (S[N] = p[N]);
			var N = arguments.length - 2;
			if (N === 1) S.children = k;
			else if (1 < N) {
				for (var B = Array(N), ue = 0; ue < N; ue++) B[ue] = arguments[ue + 2];
				S.children = B;
			}
			return Qt(c.type, A, S);
		}),
		(E.createContext = function (c) {
			return (
				(c = { $$typeof: i, _currentValue: c, _currentValue2: c, _threadCount: 0, Provider: null, Consumer: null }),
				(c.Provider = c),
				(c.Consumer = { $$typeof: a, _context: c }),
				c
			);
		}),
		(E.createElement = function (c, p, k) {
			var S,
				A = {},
				N = null;
			if (p != null)
				for (S in (p.key !== void 0 && (N = '' + p.key), p)) sn.call(p, S) && S !== 'key' && S !== '__self' && S !== '__source' && (A[S] = p[S]);
			var B = arguments.length - 2;
			if (B === 1) A.children = k;
			else if (1 < B) {
				for (var ue = Array(B), j = 0; j < B; j++) ue[j] = arguments[j + 2];
				A.children = ue;
			}
			if (c && c.defaultProps) for (S in ((B = c.defaultProps), B)) A[S] === void 0 && (A[S] = B[S]);
			return Qt(c, N, A);
		}),
		(E.createRef = function () {
			return { current: null };
		}),
		(E.forwardRef = function (c) {
			return { $$typeof: s, render: c };
		}),
		(E.isValidElement = Jt),
		(E.lazy = function (c) {
			return { $$typeof: h, _payload: { _status: -1, _result: c }, _init: ci };
		}),
		(E.memo = function (c, p) {
			return { $$typeof: l, type: c, compare: p === void 0 ? null : p };
		}),
		(E.startTransition = function (c) {
			var p = y.T,
				k = {};
			y.T = k;
			try {
				var S = c(),
					A = y.S;
				(A !== null && A(k, S), typeof S == 'object' && S !== null && typeof S.then == 'function' && S.then(ce, cn));
			} catch (N) {
				cn(N);
			} finally {
				(p !== null && k.types !== null && (p.types = k.types), (y.T = p));
			}
		}),
		(E.unstable_useCacheRefresh = function () {
			return y.H.useCacheRefresh();
		}),
		(E.use = function (c) {
			return y.H.use(c);
		}),
		(E.useActionState = function (c, p, k) {
			return y.H.useActionState(c, p, k);
		}),
		(E.useCallback = function (c, p) {
			return y.H.useCallback(c, p);
		}),
		(E.useContext = function (c) {
			return y.H.useContext(c);
		}),
		(E.useDebugValue = function () {}),
		(E.useDeferredValue = function (c, p) {
			return y.H.useDeferredValue(c, p);
		}),
		(E.useEffect = function (c, p) {
			return y.H.useEffect(c, p);
		}),
		(E.useEffectEvent = function (c) {
			return y.H.useEffectEvent(c);
		}),
		(E.useId = function () {
			return y.H.useId();
		}),
		(E.useImperativeHandle = function (c, p, k) {
			return y.H.useImperativeHandle(c, p, k);
		}),
		(E.useInsertionEffect = function (c, p) {
			return y.H.useInsertionEffect(c, p);
		}),
		(E.useLayoutEffect = function (c, p) {
			return y.H.useLayoutEffect(c, p);
		}),
		(E.useMemo = function (c, p) {
			return y.H.useMemo(c, p);
		}),
		(E.useOptimistic = function (c, p) {
			return y.H.useOptimistic(c, p);
		}),
		(E.useReducer = function (c, p, k) {
			return y.H.useReducer(c, p, k);
		}),
		(E.useRef = function (c) {
			return y.H.useRef(c);
		}),
		(E.useState = function (c) {
			return y.H.useState(c);
		}),
		(E.useSyncExternalStore = function (c, p, k) {
			return y.H.useSyncExternalStore(c, p, k);
		}),
		(E.useTransition = function () {
			return y.H.useTransition();
		}),
		(E.version = '19.2.1'),
		E
	);
}
var qn;
function bc() {
	return (qn || ((qn = 1), (nu.exports = gc())), nu.exports);
}
var xc = bc(),
	ta = Object.defineProperty,
	ua = (e) => {
		throw TypeError(e);
	},
	_c = (e, t, u) => (t in e ? ta(e, t, { enumerable: !0, configurable: !0, writable: !0, value: u }) : (e[t] = u)),
	na = (e, t) => {
		for (var u in t) ta(e, u, { get: t[u], enumerable: !0 });
	},
	Fn = (e, t, u) => _c(e, typeof t != 'symbol' ? t + '' : t, u),
	Ec = (e, t, u) => t.has(e) || ua('Cannot ' + u),
	Tt = (e, t, u) => (Ec(e, t, 'read from private field'), u ? u.call(e) : t.get(e)),
	Sc = (e, t, u) => (t.has(e) ? ua('Cannot add the same private member more than once') : t instanceof WeakSet ? t.add(e) : t.set(e, u)),
	ra = {};
na(ra, { languages: () => Ya, options: () => Ka, parsers: () => rn, printers: () => ti });
var Vu =
		(e, t) =>
		(u, n, ...r) =>
			u | 1 && n == null ? void 0 : (t.call(n) ?? n[e]).apply(n, r),
	vc =
		String.prototype.replaceAll ??
		function (e, t) {
			return e.global ? this.replace(e, t) : this.split(e).join(t);
		},
	kc = Vu('replaceAll', function () {
		if (typeof this == 'string') return vc;
	}),
	$ = kc;
function Cc(e) {
	return this[e < 0 ? this.length + e : e];
}
var Tc = Vu('at', function () {
		if (Array.isArray(this) || typeof this == 'string') return Cc;
	}),
	He = Tc,
	Ac = () => {},
	wc = Ac,
	aa = 'string',
	ia = 'array',
	sa = 'cursor',
	Wu = 'indent',
	Uu = 'align',
	oa = 'trim',
	$u = 'group',
	ju = 'fill',
	zu = 'if-break',
	Gu = 'indent-if-break',
	ca = 'line-suffix',
	la = 'line-suffix-boundary',
	Ve = 'line',
	da = 'label',
	Xu = 'break-parent',
	ha = new Set([sa, Wu, Uu, oa, $u, ju, zu, Gu, ca, la, Ve, da, Xu]);
function yc(e) {
	if (typeof e == 'string') return aa;
	if (Array.isArray(e)) return ia;
	if (!e) return;
	let { type: t } = e;
	if (ha.has(t)) return t;
}
var fa = yc,
	Nc = (e) => new Intl.ListFormat('en-US', { type: 'disjunction' }).format(e);
function Lc(e) {
	let t = e === null ? 'null' : typeof e;
	if (t !== 'string' && t !== 'object')
		return `Unexpected doc '${t}', 
Expected it to be 'string' or 'object'.`;
	if (fa(e)) throw new Error('doc is valid.');
	let u = Object.prototype.toString.call(e);
	if (u !== '[object Object]') return `Unexpected doc '${u}'.`;
	let n = Nc([...ha].map((r) => `'${r}'`));
	return `Unexpected doc.type '${e.type}'.
Expected it to be ${n}.`;
}
var Dc = class extends Error {
		name = 'InvalidDocError';
		constructor(e) {
			(super(Lc(e)), (this.doc = e));
		}
	},
	Bc = Dc;
function pa(e, t) {
	if (typeof e == 'string') return t(e);
	let u = new Map();
	return n(e);
	function n(a) {
		if (u.has(a)) return u.get(a);
		let i = r(a);
		return (u.set(a, i), i);
	}
	function r(a) {
		switch (fa(a)) {
			case ia:
				return t(a.map(n));
			case ju:
				return t({ ...a, parts: a.parts.map(n) });
			case zu:
				return t({ ...a, breakContents: n(a.breakContents), flatContents: n(a.flatContents) });
			case $u: {
				let { expandedStates: i, contents: s } = a;
				return (i ? ((i = i.map(n)), (s = i[0])) : (s = n(s)), t({ ...a, contents: s, expandedStates: i }));
			}
			case Uu:
			case Wu:
			case Gu:
			case da:
			case ca:
				return t({ ...a, contents: n(a.contents) });
			case aa:
			case sa:
			case oa:
			case la:
			case Ve:
			case Xu:
				return t(a);
			default:
				throw new Bc(a);
		}
	}
}
function ie(e, t = Mc) {
	return pa(e, (u) =>
		typeof u == 'string'
			? We(
					t,
					u.split(`
`)
				)
			: u
	);
}
var Ic = wc;
function se(e) {
	return { type: Wu, contents: e };
}
function Pc(e, t) {
	return { type: Uu, contents: t, n: e };
}
function Oc(e) {
	return Pc(Number.NEGATIVE_INFINITY, e);
}
var ft = { type: Xu };
function ma(e) {
	return { type: ju, parts: e };
}
function R(e, t = {}) {
	return (Ic(t.expandedStates), { type: $u, id: t.id, contents: e, break: !!t.shouldBreak, expandedStates: t.expandedStates });
}
function it(e, t = '', u = {}) {
	return { type: zu, breakContents: e, flatContents: t, groupId: u.groupId };
}
function Rc(e, t) {
	return { type: Gu, contents: e, groupId: t.groupId, negate: t.negate };
}
function We(e, t) {
	let u = [];
	for (let n = 0; n < t.length; n++) (n !== 0 && u.push(e), u.push(t[n]));
	return u;
}
var O = { type: Ve },
	W = { type: Ve, soft: !0 },
	qc = { type: Ve, hard: !0 },
	P = [qc, ft],
	Fc = { type: Ve, hard: !0, literal: !0 },
	Mc = [Fc, ft],
	ga = Object.freeze({ character: "'", codePoint: 39 }),
	ba = Object.freeze({ character: '"', codePoint: 34 }),
	Hc = Object.freeze({ preferred: ga, alternate: ba }),
	Vc = Object.freeze({ preferred: ba, alternate: ga });
function Wc(e, t) {
	let { preferred: u, alternate: n } = t === !0 || t === "'" ? Hc : Vc,
		{ length: r } = e,
		a = 0,
		i = 0;
	for (let s = 0; s < r; s++) {
		let o = e.charCodeAt(s);
		o === u.codePoint ? a++ : o === n.codePoint && i++;
	}
	return (a > i ? n : u).character;
}
var Uc = Wc;
function $c(e) {
	if (typeof e != 'string') throw new TypeError('Expected a string');
	return e.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
}
var jc = class {
		#e;
		constructor(e) {
			this.#e = new Set(e);
		}
		getLeadingWhitespaceCount(e) {
			let t = this.#e,
				u = 0;
			for (let n = 0; n < e.length && t.has(e.charAt(n)); n++) u++;
			return u;
		}
		getTrailingWhitespaceCount(e) {
			let t = this.#e,
				u = 0;
			for (let n = e.length - 1; n >= 0 && t.has(e.charAt(n)); n--) u++;
			return u;
		}
		getLeadingWhitespace(e) {
			let t = this.getLeadingWhitespaceCount(e);
			return e.slice(0, t);
		}
		getTrailingWhitespace(e) {
			let t = this.getTrailingWhitespaceCount(e);
			return e.slice(e.length - t);
		}
		hasLeadingWhitespace(e) {
			return this.#e.has(e.charAt(0));
		}
		hasTrailingWhitespace(e) {
			return this.#e.has(He(0, e, -1));
		}
		trimStart(e) {
			let t = this.getLeadingWhitespaceCount(e);
			return e.slice(t);
		}
		trimEnd(e) {
			let t = this.getTrailingWhitespaceCount(e);
			return e.slice(0, e.length - t);
		}
		trim(e) {
			return this.trimEnd(this.trimStart(e));
		}
		split(e, t = !1) {
			let u = `[${$c([...this.#e].join(''))}]+`,
				n = new RegExp(t ? `(${u})` : u, 'u');
			return e.split(n);
		}
		hasWhitespaceCharacter(e) {
			let t = this.#e;
			return Array.prototype.some.call(e, (u) => t.has(u));
		}
		hasNonWhitespaceCharacter(e) {
			let t = this.#e;
			return Array.prototype.some.call(e, (u) => !t.has(u));
		}
		isWhitespaceOnly(e) {
			let t = this.#e;
			return Array.prototype.every.call(e, (u) => t.has(u));
		}
		#t(e) {
			let t = Number.POSITIVE_INFINITY;
			for (let u of e.split(`
`)) {
				if (u.length === 0) continue;
				let n = this.getLeadingWhitespaceCount(u);
				if (n === 0) return 0;
				u.length !== n && n < t && (t = n);
			}
			return t === Number.POSITIVE_INFINITY ? 0 : t;
		}
		dedentString(e) {
			let t = this.#t(e);
			return t === 0
				? e
				: e
						.split(
							`
`
						)
						.map((u) => u.slice(t)).join(`
`);
		}
	},
	zc = jc,
	Gc = [
		'	',
		`
`,
		'\f',
		'\r',
		' '
	],
	Xc = new zc(Gc),
	J = Xc,
	Yc = class extends Error {
		name = 'UnexpectedNodeError';
		constructor(e, t, u = 'type') {
			(super(`Unexpected ${t} node ${u}: ${JSON.stringify(e[u])}.`), (this.node = e));
		}
	},
	Kc = Yc,
	Qc = new Set([
		'sourceSpan',
		'startSourceSpan',
		'endSourceSpan',
		'nameSpan',
		'valueSpan',
		'keySpan',
		'tagDefinition',
		'tokens',
		'valueTokens',
		'switchValueSourceSpan',
		'expSourceSpan',
		'valueSourceSpan'
	]),
	Jc = new Set(['if', 'else if', 'for', 'switch', 'case']);
function xa(e, t, u) {
	if (e.kind === 'text' || e.kind === 'comment') return null;
	if ((e.kind === 'yaml' && delete t.value, e.kind === 'attribute')) {
		let { fullName: n, value: r } = e;
		n === 'style' ||
		n === 'class' ||
		(n === 'srcset' && (u.fullName === 'img' || u.fullName === 'source')) ||
		(n === 'allow' && u.fullName === 'iframe') ||
		n.startsWith('on') ||
		n.startsWith('@') ||
		n.startsWith(':') ||
		n.startsWith('.') ||
		n.startsWith('#') ||
		n.startsWith('v-') ||
		(n === 'vars' && u.fullName === 'style') ||
		((n === 'setup' || n === 'generic') && u.fullName === 'script') ||
		n === 'slot-scope' ||
		n.startsWith('(') ||
		n.startsWith('[') ||
		n.startsWith('*') ||
		n.startsWith('bind') ||
		n.startsWith('i18n') ||
		n.startsWith('on-') ||
		n.startsWith('ng-') ||
		r?.includes('{{')
			? delete t.value
			: r && (t.value = $(0, r, /'|&quot;|&apos;/gu, '"'));
	}
	if ((e.kind === 'docType' && (t.value = $(0, e.value.toLowerCase(), /\s+/gu, ' ')), e.kind === 'angularControlFlowBlock' && e.parameters?.children))
		for (let n of t.parameters.children) Jc.has(e.name) ? delete n.expression : (n.expression = n.expression.trim());
	(e.kind === 'angularIcuExpression' && (t.switchValue = e.switchValue.trim()),
		e.kind === 'angularLetDeclarationInitializer' && delete t.value,
		e.kind === 'element' && e.isVoid && !e.isSelfClosing && (t.isSelfClosing = !0));
}
xa.ignoredProperties = Qc;
var Zc = xa;
function pt(e, t = !0) {
	return [se([W, e]), t ? W : ''];
}
function Ue(e, t) {
	let u =
		e.type === 'NGRoot'
			? e.node.type === 'NGMicrosyntax' && e.node.body.length === 1 && e.node.body[0].type === 'NGMicrosyntaxExpression'
				? e.node.body[0].expression
				: e.node
			: e.type === 'JsExpressionRoot'
				? e.node
				: e;
	return (
		u &&
		(u.type === 'ObjectExpression' ||
			u.type === 'ArrayExpression' ||
			((t.parser === '__vue_expression' || t.parser === '__vue_ts_expression' || t.parser === '__ng_binding' || t.parser === '__ng_directive') &&
				(u.type === 'TemplateLiteral' || u.type === 'StringLiteral')))
	);
}
async function Z(e, t, u, n) {
	u = { __isInHtmlAttribute: !0, __embeddedInHtml: !0, ...u };
	let r = !0;
	n &&
		(u.__onHtmlBindingRoot = (i, s) => {
			r = n(i, s);
		});
	let a = await t(e, u, t);
	return r ? R(a) : pt(a);
}
function el(e, t, u, n) {
	let { node: r } = u,
		a = n.originalText.slice(r.sourceSpan.start.offset, r.sourceSpan.end.offset);
	return /^\s*$/u.test(a) ? '' : Z(a, e, { parser: '__ng_directive', __isInHtmlAttribute: !1 }, Ue);
}
var tl = el,
	ul =
		Array.prototype.toReversed ??
		function () {
			return [...this].reverse();
		},
	nl = Vu('toReversed', function () {
		if (Array.isArray(this)) return ul;
	}),
	rl = nl;
function al() {
	let e = globalThis,
		t = e.Deno?.build?.os;
	return typeof t == 'string' ? t === 'windows' : (e.navigator?.platform?.startsWith('Win') ?? e.process?.platform?.startsWith('win') ?? !1);
}
var il = al();
function _a(e) {
	if (((e = e instanceof URL ? e : new URL(e)), e.protocol !== 'file:')) throw new TypeError(`URL must be a file URL: received "${e.protocol}"`);
	return e;
}
function sl(e) {
	return ((e = _a(e)), decodeURIComponent(e.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')));
}
function ol(e) {
	e = _a(e);
	let t = decodeURIComponent(e.pathname.replace(/\//g, '\\').replace(/%(?![0-9A-Fa-f]{2})/g, '%25')).replace(/^\\*([A-Za-z]:)(\\|$)/, '$1\\');
	return (e.hostname !== '' && (t = `\\\\${e.hostname}${t}`), t);
}
function cl(e) {
	return il ? ol(e) : sl(e);
}
var ll = (e) => String(e).split(/[/\\]/u).pop(),
	dl = (e) => String(e).startsWith('file:');
function hl(e) {
	return Array.isArray(e) && e.length > 0;
}
var Yu = hl;
function Mn(e, t) {
	if (!t) return;
	let u = ll(t).toLowerCase();
	return e.find(({ filenames: n }) => n?.some((r) => r.toLowerCase() === u)) ?? e.find(({ extensions: n }) => n?.some((r) => u.endsWith(r)));
}
function fl(e, t) {
	if (t)
		return (
			e.find(({ name: u }) => u.toLowerCase() === t) ??
			e.find(({ aliases: u }) => u?.includes(t)) ??
			e.find(({ extensions: u }) => u?.includes(`.${t}`))
		);
}
var pl = void 0;
function Hn(e, t) {
	if (t) {
		if (dl(t))
			try {
				t = cl(t);
			} catch {
				return;
			}
		if (typeof t == 'string') return e.find(({ isSupported: u }) => u?.({ filepath: t }));
	}
}
function ml(e, t) {
	let u = rl(0, e.plugins).flatMap((n) => n.languages ?? []);
	return (fl(u, t.language) ?? Mn(u, t.physicalFile) ?? Mn(u, t.file) ?? Hn(u, t.physicalFile) ?? Hn(u, t.file) ?? pl?.(u, t.physicalFile))
		?.parsers[0];
}
var Ku = ml,
	Ea = Symbol.for('PRETTIER_IS_FRONT_MATTER');
function gl(e) {
	return !!e?.[Ea];
}
var Ut = gl,
	ze = 3;
function bl(e) {
	let t = e.slice(0, ze);
	if (t !== '---' && t !== '+++') return;
	let u = e.indexOf(
		`
`,
		ze
	);
	if (u === -1) return;
	let n = e.slice(ze, u).trim(),
		r = e.indexOf(
			`
${t}`,
			u
		),
		a = n;
	if (
		(a || (a = t === '+++' ? 'toml' : 'yaml'),
		r === -1 &&
			t === '---' &&
			a === 'yaml' &&
			(r = e.indexOf(
				`
...`,
				u
			)),
		r === -1)
	)
		return;
	let i = r + 1 + ze,
		s = e.charAt(i + 1);
	if (!/\s?/u.test(s)) return;
	let o = e.slice(0, i),
		l;
	return {
		language: a,
		explicitLanguage: n || null,
		value: e.slice(u + 1, r),
		startDelimiter: t,
		endDelimiter: o.slice(-ze),
		raw: o,
		start: { line: 1, column: 0, index: 0 },
		end: {
			index: o.length,
			get line() {
				return (
					l ??
						(l = o.split(`
`)),
					l.length
				);
			},
			get column() {
				return (
					l ??
						(l = o.split(`
`)),
					He(0, l, -1).length
				);
			}
		},
		[Ea]: !0
	};
}
function xl(e) {
	let t = bl(e);
	return t
		? {
				frontMatter: t,
				get content() {
					let { raw: u } = t;
					return $(0, u, /[^\n]/gu, ' ') + e.slice(u.length);
				}
			}
		: { content: e };
}
var _l = xl,
	El = 'inline',
	Vn = {
		area: 'none',
		base: 'none',
		basefont: 'none',
		datalist: 'none',
		head: 'none',
		link: 'none',
		meta: 'none',
		noembed: 'none',
		noframes: 'none',
		param: 'block',
		rp: 'none',
		script: 'block',
		style: 'none',
		template: 'inline',
		title: 'none',
		html: 'block',
		body: 'block',
		address: 'block',
		blockquote: 'block',
		center: 'block',
		dialog: 'block',
		div: 'block',
		figure: 'block',
		figcaption: 'block',
		footer: 'block',
		form: 'block',
		header: 'block',
		hr: 'block',
		legend: 'block',
		listing: 'block',
		main: 'block',
		p: 'block',
		plaintext: 'block',
		pre: 'block',
		search: 'block',
		xmp: 'block',
		slot: 'contents',
		ruby: 'ruby',
		rt: 'ruby-text',
		article: 'block',
		aside: 'block',
		h1: 'block',
		h2: 'block',
		h3: 'block',
		h4: 'block',
		h5: 'block',
		h6: 'block',
		hgroup: 'block',
		nav: 'block',
		section: 'block',
		dir: 'block',
		dd: 'block',
		dl: 'block',
		dt: 'block',
		menu: 'block',
		ol: 'block',
		ul: 'block',
		li: 'list-item',
		table: 'table',
		caption: 'table-caption',
		colgroup: 'table-column-group',
		col: 'table-column',
		thead: 'table-header-group',
		tbody: 'table-row-group',
		tfoot: 'table-footer-group',
		tr: 'table-row',
		td: 'table-cell',
		th: 'table-cell',
		input: 'inline-block',
		button: 'inline-block',
		fieldset: 'block',
		details: 'block',
		summary: 'block',
		marquee: 'inline-block',
		select: 'inline-block',
		source: 'block',
		track: 'block',
		meter: 'inline-block',
		progress: 'inline-block',
		object: 'inline-block',
		video: 'inline-block',
		audio: 'inline-block',
		option: 'block',
		optgroup: 'block'
	},
	Sl = 'normal',
	Wn = { listing: 'pre', plaintext: 'pre', pre: 'pre', xmp: 'pre', nobr: 'nowrap', table: 'initial', textarea: 'pre-wrap' };
function vl(e) {
	return e.kind === 'element' && !e.hasExplicitNamespace && !['html', 'svg'].includes(e.namespace);
}
var mt = vl,
	kl = (e) => $(0, e, /^[\t\f\r ]*\n/gu, ''),
	Sa = (e) => kl(J.trimEnd(e)),
	Cl = (e) => {
		let t = e,
			u = J.getLeadingWhitespace(t);
		u && (t = t.slice(u.length));
		let n = J.getTrailingWhitespace(t);
		return (n && (t = t.slice(0, -n.length)), { leadingWhitespace: u, trailingWhitespace: n, text: t });
	};
function va(e, t) {
	return !!(
		(e.kind === 'ieConditionalComment' && e.lastChild && !e.lastChild.isSelfClosing && !e.lastChild.endSourceSpan) ||
		(e.kind === 'ieConditionalComment' && !e.complete) ||
		(Fe(e) && e.children.some((u) => u.kind !== 'text' && u.kind !== 'interpolation')) ||
		(Ju(e, t) && !he(e, t) && e.kind !== 'interpolation')
	);
}
function $t(e) {
	return e.kind === 'attribute' || !e.parent || !e.prev ? !1 : Tl(e.prev);
}
function Tl(e) {
	return e.kind === 'comment' && e.value.trim() === 'prettier-ignore';
}
function Q(e) {
	return e.kind === 'text' || e.kind === 'comment';
}
function he(e, t) {
	return (
		e.kind === 'element' &&
		(e.fullName === 'script' ||
			e.fullName === 'style' ||
			e.fullName === 'svg:style' ||
			e.fullName === 'svg:script' ||
			(e.fullName === 'mj-style' && t.parser === 'mjml') ||
			(mt(e) && (e.name === 'script' || e.name === 'style')))
	);
}
function Al(e, t) {
	return e.children && !he(e, t);
}
function wl(e, t) {
	return he(e, t) || e.kind === 'interpolation' || ka(e);
}
function ka(e) {
	return La(e).startsWith('pre');
}
function yl(e, t) {
	let u = n();
	if (u && !e.prev && e.parent?.tagDefinition?.ignoreFirstLf) return e.kind === 'interpolation';
	return u;
	function n() {
		return Ut(e) || e.kind === 'angularControlFlowBlock'
			? !1
			: (e.kind === 'text' || e.kind === 'interpolation') && e.prev && (e.prev.kind === 'text' || e.prev.kind === 'interpolation')
				? !0
				: !e.parent || e.parent.cssDisplay === 'none'
					? !1
					: Fe(e.parent)
						? !0
						: !(
								(!e.prev && (e.parent.kind === 'root' || (Fe(e) && e.parent) || he(e.parent, t) || jt(e.parent, t) || !ql(e.parent.cssDisplay))) ||
								(e.prev && !Hl(e.prev.cssDisplay))
							);
	}
}
function Nl(e, t) {
	return Ut(e) || e.kind === 'angularControlFlowBlock'
		? !1
		: (e.kind === 'text' || e.kind === 'interpolation') && e.next && (e.next.kind === 'text' || e.next.kind === 'interpolation')
			? !0
			: !e.parent || e.parent.cssDisplay === 'none'
				? !1
				: Fe(e.parent)
					? !0
					: !(
							(!e.next && (e.parent.kind === 'root' || (Fe(e) && e.parent) || he(e.parent, t) || jt(e.parent, t) || !Fl(e.parent.cssDisplay))) ||
							(e.next && !Ml(e.next.cssDisplay))
						);
}
function Ll(e, t) {
	return Vl(e.cssDisplay) && !he(e, t);
}
function At(e) {
	return Ut(e) || (e.next && e.sourceSpan.end && e.sourceSpan.end.line + 1 < e.next.sourceSpan.start.line);
}
function Dl(e) {
	return (
		Ca(e) ||
		(e.kind === 'element' && e.children.length > 0 && (['body', 'script', 'style'].includes(e.name) || e.children.some((t) => Il(t)))) ||
		(e.firstChild &&
			e.firstChild === e.lastChild &&
			e.firstChild.kind !== 'text' &&
			Aa(e.firstChild) &&
			(!e.lastChild.isTrailingSpaceSensitive || wa(e.lastChild)))
	);
}
function Ca(e) {
	return (
		e.kind === 'element' &&
		e.children.length > 0 &&
		(['html', 'head', 'ul', 'ol', 'select'].includes(e.name) || (e.cssDisplay.startsWith('table') && e.cssDisplay !== 'table-cell'))
	);
}
function ru(e) {
	return ya(e) || (e.prev && Bl(e.prev)) || Ta(e);
}
function Bl(e) {
	return ya(e) || (e.kind === 'element' && e.fullName === 'br') || Ta(e);
}
function Ta(e) {
	return Aa(e) && wa(e);
}
function Aa(e) {
	return (
		e.hasLeadingSpaces &&
		(e.prev
			? e.prev.sourceSpan.end.line < e.sourceSpan.start.line
			: e.parent.kind === 'root' || e.parent.startSourceSpan.end.line < e.sourceSpan.start.line)
	);
}
function wa(e) {
	return (
		e.hasTrailingSpaces &&
		(e.next
			? e.next.sourceSpan.start.line > e.sourceSpan.end.line
			: e.parent.kind === 'root' || (e.parent.endSourceSpan && e.parent.endSourceSpan.start.line > e.sourceSpan.end.line))
	);
}
function ya(e) {
	switch (e.kind) {
		case 'ieConditionalComment':
		case 'comment':
		case 'directive':
			return !0;
		case 'element':
			return ['script', 'select'].includes(e.name);
	}
	return !1;
}
function Qu(e) {
	return e.lastChild ? Qu(e.lastChild) : e;
}
function Il(e) {
	return e.children?.some((t) => t.kind !== 'text');
}
function Na(e) {
	if (e)
		switch (e) {
			case 'module':
			case 'text/javascript':
			case 'text/babel':
			case 'text/jsx':
			case 'application/javascript':
				return 'babel';
			case 'application/x-typescript':
				return 'typescript';
			case 'text/markdown':
				return 'markdown';
			case 'text/html':
				return 'html';
			case 'text/x-handlebars-template':
				return 'glimmer';
			default:
				if (e.endsWith('json') || e.endsWith('importmap') || e === 'speculationrules') return 'json';
		}
}
function Pl(e, t) {
	let { name: u, attrMap: n } = e;
	if (u !== 'script' || Object.prototype.hasOwnProperty.call(n, 'src')) return;
	let { type: r, lang: a } = e.attrMap;
	return !a && !r ? 'babel' : (Ku(t, { language: a }) ?? Na(r));
}
function Ol(e, t) {
	if (!Ju(e, t)) return;
	let { attrMap: u } = e;
	if (Object.prototype.hasOwnProperty.call(u, 'src')) return;
	let { type: n, lang: r } = u;
	return Ku(t, { language: r }) ?? Na(n);
}
function Rl(e, t) {
	if (e.name === 'style') {
		let { lang: u } = e.attrMap;
		return u ? Ku(t, { language: u }) : 'css';
	}
	if (e.name === 'mj-style' && t.parser === 'mjml') return 'css';
}
function Un(e, t) {
	return Pl(e, t) ?? Rl(e, t) ?? Ol(e, t);
}
function gt(e) {
	return e === 'block' || e === 'list-item' || e.startsWith('table');
}
function ql(e) {
	return !gt(e) && e !== 'inline-block';
}
function Fl(e) {
	return !gt(e) && e !== 'inline-block';
}
function Ml(e) {
	return !gt(e);
}
function Hl(e) {
	return !gt(e);
}
function Vl(e) {
	return !gt(e) && e !== 'inline-block';
}
function Fe(e) {
	return La(e).startsWith('pre');
}
function Wl(e, t) {
	let u = e;
	for (; u; ) {
		if (t(u)) return !0;
		u = u.parent;
	}
	return !1;
}
function Ul(e, t) {
	if ($e(e, t)) return 'block';
	if (e.prev?.kind === 'comment') {
		let n = e.prev.value.match(/^\s*display:\s*([a-z]+)\s*$/u);
		if (n) return n[1];
	}
	let u = !1;
	if (e.kind === 'element' && e.namespace === 'svg')
		if (Wl(e, (n) => n.fullName === 'svg:foreignObject')) u = !0;
		else return e.name === 'svg' ? 'inline-block' : 'block';
	switch (t.htmlWhitespaceSensitivity) {
		case 'strict':
			return 'inline';
		case 'ignore':
			return 'block';
		default:
			if (e.kind === 'element' && (!e.namespace || u || mt(e)) && Object.prototype.hasOwnProperty.call(Vn, e.name)) return Vn[e.name];
	}
	return El;
}
function La(e) {
	return e.kind === 'element' && (!e.namespace || mt(e)) && Object.prototype.hasOwnProperty.call(Wn, e.name) ? Wn[e.name] : Sl;
}
function Da(e) {
	return $(0, $(0, e, '&apos;', "'"), '&quot;', '"');
}
function X(e) {
	return Da(e.value);
}
var $l = new Set(['template', 'style', 'script']);
function jt(e, t) {
	return $e(e, t) && !$l.has(e.fullName);
}
function $e(e, t) {
	return t.parser === 'vue' && e.kind === 'element' && e.parent.kind === 'root' && e.fullName.toLowerCase() !== 'html';
}
function Ju(e, t) {
	return $e(e, t) && (jt(e, t) || (e.attrMap.lang && e.attrMap.lang !== 'html'));
}
function jl(e) {
	let t = e.fullName;
	return t.charAt(0) === '#' || t === 'slot-scope' || t === 'v-slot' || t.startsWith('v-slot:');
}
function zl(e, t) {
	let u = e.parent;
	if (!$e(u, t)) return !1;
	let n = u.fullName,
		r = e.fullName;
	return (n === 'script' && r === 'setup') || (n === 'style' && r === 'vars');
}
function Ba(e, t = e.value) {
	return e.parent.isWhitespaceSensitive ? (e.parent.isIndentationSensitive ? ie(t) : ie(J.dedentString(Sa(t)), P)) : We(O, J.split(t));
}
function Ia(e, t) {
	return $e(e, t) && e.name === 'script';
}
function Gl(e) {
	let { valueSpan: t, value: u } = e;
	return t.end.offset - t.start.offset === u.length + 2;
}
function Pa(e, t) {
	if (Gl(e)) return !1;
	let { value: u } = e;
	return /^PRETTIER_HTML_PLACEHOLDER_\d+_\d+_IN_JS$/u.test(u) || (t.parser === 'lwc' && u.startsWith('{') && u.endsWith('}'));
}
var Oa = /\{\{(.+?)\}\}/su,
	Xl = ({ node: { value: e } }) => Oa.test(e);
async function Yl(e, t, u) {
	let n = X(u.node),
		r = [];
	for (let [a, i] of n.split(Oa).entries())
		if (a % 2 === 0) r.push(ie(i));
		else
			try {
				r.push(R(['{{', se([O, await Z(i, e, { parser: '__ng_interpolation', __isInHtmlInterpolation: !0 })]), O, '}}']));
			} catch {
				r.push('{{', ie(i), '}}');
			}
	return r;
}
var au = (e) => (t, u, n) => Z(X(n.node), t, { parser: e }, Ue),
	Kl = [
		{
			test(e) {
				let t = e.node.fullName;
				return (t.startsWith('(') && t.endsWith(')')) || t.startsWith('on-');
			},
			print: au('__ng_action')
		},
		{
			test(e) {
				let t = e.node.fullName;
				return (t.startsWith('[') && t.endsWith(']')) || /^bind(?:on)?-/u.test(t) || /^ng-(?:if|show|hide|class|style)$/u.test(t);
			},
			print: au('__ng_binding')
		},
		{ test: (e) => e.node.fullName.startsWith('*'), print: au('__ng_directive') },
		{ test: (e) => /^i18n(?:-.+)?$/u.test(e.node.fullName), print: Ql },
		{ test: Xl, print: Yl }
	].map(({ test: e, print: t }) => ({ test: (u, n) => n.parser === 'angular' && e(u), print: t }));
function Ql(e, t, { node: u }) {
	let n = X(u);
	return pt(ma(Ba(u, n.trim())), !n.includes('@@'));
}
var Jl = Kl,
	Zl = ({ node: e }, t) => !t.parentParser && e.fullName === 'class' && !e.value.includes('{{'),
	e0 = (e, t, u) => X(u.node).trim().split(/\s+/u).join(' '),
	t0 = [
		'onabort',
		'onafterprint',
		'onauxclick',
		'onbeforeinput',
		'onbeforematch',
		'onbeforeprint',
		'onbeforetoggle',
		'onbeforeunload',
		'onblur',
		'oncancel',
		'oncanplay',
		'oncanplaythrough',
		'onchange',
		'onclick',
		'onclose',
		'oncommand',
		'oncontextlost',
		'oncontextmenu',
		'oncontextrestored',
		'oncopy',
		'oncuechange',
		'oncut',
		'ondblclick',
		'ondrag',
		'ondragend',
		'ondragenter',
		'ondragleave',
		'ondragover',
		'ondragstart',
		'ondrop',
		'ondurationchange',
		'onemptied',
		'onended',
		'onerror',
		'onfocus',
		'onformdata',
		'onhashchange',
		'oninput',
		'oninvalid',
		'onkeydown',
		'onkeypress',
		'onkeyup',
		'onlanguagechange',
		'onload',
		'onloadeddata',
		'onloadedmetadata',
		'onloadstart',
		'onmessage',
		'onmessageerror',
		'onmousedown',
		'onmouseenter',
		'onmouseleave',
		'onmousemove',
		'onmouseout',
		'onmouseover',
		'onmouseup',
		'onoffline',
		'ononline',
		'onpagehide',
		'onpagereveal',
		'onpageshow',
		'onpageswap',
		'onpaste',
		'onpause',
		'onplay',
		'onplaying',
		'onpopstate',
		'onprogress',
		'onratechange',
		'onrejectionhandled',
		'onreset',
		'onresize',
		'onscroll',
		'onscrollend',
		'onsecuritypolicyviolation',
		'onseeked',
		'onseeking',
		'onselect',
		'onslotchange',
		'onstalled',
		'onstorage',
		'onsubmit',
		'onsuspend',
		'ontimeupdate',
		'ontoggle',
		'onunhandledrejection',
		'onunload',
		'onvolumechange',
		'onwaiting',
		'onwheel'
	],
	u0 = new Set(t0),
	n0 = ({ node: e }, t) => u0.has(e.fullName) && !t.parentParser && !e.value.includes('{{'),
	r0 = (e, t, u) => Z(X(u.node), e, { parser: 'babel', __isHtmlInlineEventHandler: !0 }, () => !1);
function a0(e) {
	let t = [];
	for (let u of e.split(';')) {
		if (((u = J.trim(u)), !u)) continue;
		let [n, ...r] = J.split(u);
		t.push({ name: n, value: r });
	}
	return t;
}
var i0 = a0,
	s0 = ({ node: e }, t) => e.fullName === 'allow' && !t.parentParser && e.parent.fullName === 'iframe' && !e.value.includes('{{');
function o0(e, t, u) {
	let { node: n } = u,
		r = i0(X(n));
	return r.length === 0 ? [''] : pt(r.map(({ name: a, value: i }, s) => [[a, ...i].join(' '), s === r.length - 1 ? it(';') : [';', O]]));
}
function $n(e) {
	return (
		e === '	' ||
		e ===
			`
` ||
		e === '\f' ||
		e === '\r' ||
		e === ' '
	);
}
var c0 = /^[ \t\n\r\u000c]+/,
	l0 = /^[, \t\n\r\u000c]+/,
	d0 = /^[^ \t\n\r\u000c]+/,
	h0 = /[,]+$/,
	jn = /^\d+$/,
	f0 = /^-?(?:[0-9]+|[0-9]*\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
function p0(e) {
	let t = e.length,
		u,
		n,
		r,
		a,
		i,
		s = 0,
		o;
	function l(m) {
		let b,
			T = m.exec(e.substring(s));
		if (T) return (([b] = T), (s += b.length), b);
	}
	let h = [];
	for (;;) {
		if ((l(l0), s >= t)) {
			if (h.length === 0) throw new Error('Must contain one or more image candidate strings.');
			return h;
		}
		((o = s), (u = l(d0)), (n = []), u.slice(-1) === ',' ? ((u = u.replace(h0, '')), _()) : x());
	}
	function x() {
		for (l(c0), r = '', a = 'in descriptor'; ; ) {
			if (((i = e.charAt(s)), a === 'in descriptor'))
				if ($n(i)) r && (n.push(r), (r = ''), (a = 'after descriptor'));
				else if (i === ',') {
					((s += 1), r && n.push(r), _());
					return;
				} else if (i === '(') ((r += i), (a = 'in parens'));
				else if (i === '') {
					(r && n.push(r), _());
					return;
				} else r += i;
			else if (a === 'in parens')
				if (i === ')') ((r += i), (a = 'in descriptor'));
				else if (i === '') {
					(n.push(r), _());
					return;
				} else r += i;
			else if (a === 'after descriptor' && !$n(i))
				if (i === '') {
					_();
					return;
				} else ((a = 'in descriptor'), (s -= 1));
			s += 1;
		}
	}
	function _() {
		let m = !1,
			b,
			T,
			q,
			V,
			te = {},
			K,
			pe,
			oe,
			ce,
			y;
		for (V = 0; V < n.length; V++)
			((K = n[V]),
				(pe = K[K.length - 1]),
				(oe = K.substring(0, K.length - 1)),
				(ce = parseInt(oe, 10)),
				(y = parseFloat(oe)),
				jn.test(oe) && pe === 'w'
					? ((b || T) && (m = !0), ce === 0 ? (m = !0) : (b = ce))
					: f0.test(oe) && pe === 'x'
						? ((b || T || q) && (m = !0), y < 0 ? (m = !0) : (T = y))
						: jn.test(oe) && pe === 'h'
							? ((q || T) && (m = !0), ce === 0 ? (m = !0) : (q = ce))
							: (m = !0));
		if (!m)
			((te.source = { value: u, startOffset: o }),
				b && (te.width = { value: b }),
				T && (te.density = { value: T }),
				q && (te.height = { value: q }),
				h.push(te));
		else throw new Error(`Invalid srcset descriptor found in "${e}" at "${K}".`);
	}
}
var m0 = p0,
	g0 = (e) => e.node.fullName === 'srcset' && (e.parent.fullName === 'img' || e.parent.fullName === 'source'),
	Ra = { width: 'w', height: 'h', density: 'x' },
	b0 = Object.keys(Ra);
function x0(e, t, u) {
	let n = X(u.node),
		r = m0(n),
		a = b0.filter((m) => r.some((b) => Object.prototype.hasOwnProperty.call(b, m)));
	if (a.length > 1) throw new Error('Mixed descriptor in srcset is not supported');
	let [i] = a,
		s = Ra[i],
		o = r.map((m) => m.source.value),
		l = Math.max(...o.map((m) => m.length)),
		h = r.map((m) => (m[i] ? String(m[i].value) : '')),
		x = h.map((m) => {
			let b = m.indexOf('.');
			return b === -1 ? m.length : b;
		}),
		_ = Math.max(...x);
	return pt(
		We(
			[',', O],
			o.map((m, b) => {
				let T = [m],
					q = h[b];
				if (q) {
					let V = l - m.length + 1,
						te = _ - x[b],
						K = ' '.repeat(V + te);
					T.push(it(K, ' '), q + s);
				}
				return T;
			})
		)
	);
}
var _0 = ({ node: e }, t) => e.fullName === 'style' && !t.parentParser && !e.value.includes('{{'),
	E0 = async (e, t, u) => pt(await e(X(u.node), { parser: 'css', __isHTMLStyleAttribute: !0 })),
	iu = new WeakMap();
function S0(e, t) {
	let { root: u } = e;
	return (
		iu.has(u) ||
			iu.set(
				u,
				u.children.some((n) => Ia(n, t) && ['ts', 'typescript'].includes(n.attrMap.lang))
			),
		iu.get(u)
	);
}
var je = S0;
function v0(e, t, u) {
	let n = X(u.node);
	return Z(`type T<${n}> = any`, e, { parser: 'babel-ts', __isEmbeddedTypescriptGenericParameters: !0 }, Ue);
}
function k0(e, t, u, n) {
	let r = X(u.node),
		a = je(u, n) ? 'babel-ts' : 'babel';
	return Z(`function _(${r}) {}`, e, { parser: a, __isVueBindings: !0 });
}
async function C0(e, t, u, n) {
	let r = X(u.node),
		{ left: a, operator: i, right: s } = T0(r),
		o = je(u, n);
	return [
		R(await Z(`function _(${a}) {}`, e, { parser: o ? 'babel-ts' : 'babel', __isVueForBindingLeft: !0 })),
		' ',
		i,
		' ',
		await Z(s, e, { parser: o ? '__ts_expression' : '__js_expression' })
	];
}
function T0(e) {
	let t = /(.*?)\s+(in|of)\s+(.*)/su,
		u = /,([^,\]}]*)(?:,([^,\]}]*))?$/u,
		n = /^\(|\)$/gu,
		r = e.match(t);
	if (!r) return;
	let a = { for: r[3].trim() };
	if (!a.for) return;
	let i = $(0, r[1].trim(), n, ''),
		s = i.match(u);
	s ? ((a.alias = i.replace(u, '')), (a.iterator1 = s[1].trim()), s[2] && (a.iterator2 = s[2].trim())) : (a.alias = i);
	let o = [a.alias, a.iterator1, a.iterator2];
	if (!o.some((l, h) => !l && (h === 0 || o.slice(h + 1).some(Boolean)))) return { left: o.filter(Boolean).join(','), operator: r[2], right: a.for };
}
var A0 = [
	{ test: (e) => e.node.fullName === 'v-for', print: C0 },
	{ test: (e, t) => e.node.fullName === 'generic' && Ia(e.parent, t), print: v0 },
	{ test: ({ node: e }, t) => jl(e) || zl(e, t), print: k0 },
	{
		test(e) {
			let t = e.node.fullName;
			return t.startsWith('@') || t.startsWith('v-on:');
		},
		print: w0
	},
	{
		test(e) {
			let t = e.node.fullName;
			return t.startsWith(':') || t.startsWith('.') || t.startsWith('v-bind:');
		},
		print: y0
	},
	{ test: (e) => e.node.fullName.startsWith('v-'), print: qa }
].map(({ test: e, print: t }) => ({ test: (u, n) => n.parser === 'vue' && e(u, n), print: t }));
async function w0(e, t, u, n) {
	try {
		return await qa(e, t, u, n);
	} catch (i) {
		if (i.cause?.code !== 'BABEL_PARSER_SYNTAX_ERROR') throw i;
	}
	let r = X(u.node),
		a = je(u, n) ? '__vue_ts_event_binding' : '__vue_event_binding';
	return Z(r, e, { parser: a }, Ue);
}
function y0(e, t, u, n) {
	let r = X(u.node),
		a = je(u, n) ? '__vue_ts_expression' : '__vue_expression';
	return Z(r, e, { parser: a }, Ue);
}
function qa(e, t, u, n) {
	let r = X(u.node),
		a = je(u, n) ? '__ts_expression' : '__js_expression';
	return Z(r, e, { parser: a }, Ue);
}
var N0 = A0,
	L0 = [
		{ test: g0, print: x0 },
		{ test: _0, print: E0 },
		{ test: n0, print: r0 },
		{ test: Zl, print: e0 },
		{ test: s0, print: o0 },
		...N0,
		...Jl
	].map(({ test: e, print: t }) => ({ test: e, print: B0(t) }));
function D0(e, t) {
	let { node: u } = e,
		{ value: n } = u;
	if (n) return Pa(u, t) ? [u.rawName, '=', n] : L0.find(({ test: r }) => r(e, t))?.print;
}
function B0(e) {
	return async (t, u, n, r) => {
		let a = await e(t, u, n, r);
		if (a) return ((a = pa(a, (i) => (typeof i == 'string' ? $(0, i, '"', '&quot;') : i))), [n.node.rawName, '="', R(a), '"']);
	};
}
var I0 = D0,
	bt = (e) => e.sourceSpan.start.offset,
	zt = (e) => e.sourceSpan.end.offset;
function _u(e, t) {
	return [e.isSelfClosing ? '' : P0(e, t), et(e, t)];
}
function P0(e, t) {
	return e.lastChild && st(e.lastChild) ? '' : [O0(e, t), Zu(e, t)];
}
function et(e, t) {
	return (e.next ? Te(e.next) : _t(e.parent)) ? '' : [xt(e, t), Ce(e, t)];
}
function O0(e, t) {
	return _t(e) ? xt(e.lastChild, t) : '';
}
function Ce(e, t) {
	return st(e) ? Zu(e.parent, t) : Gt(e) ? en(e.next, t) : '';
}
function Zu(e, t) {
	if (Fa(e, t)) return '';
	switch (e.kind) {
		case 'ieConditionalComment':
			return '<!';
		case 'element':
			if (e.hasHtmComponentClosingTag) return '<//';
		default:
			return `</${e.rawName}`;
	}
}
function xt(e, t) {
	if (Fa(e, t)) return '';
	switch (e.kind) {
		case 'ieConditionalComment':
		case 'ieConditionalEndComment':
			return '[endif]-->';
		case 'ieConditionalStartComment':
			return ']><!-->';
		case 'interpolation':
			return '}}';
		case 'angularIcuExpression':
			return '}';
		case 'element':
			if (e.isSelfClosing) return '/>';
		default:
			return '>';
	}
}
function Fa(e, t) {
	return !e.isSelfClosing && !e.endSourceSpan && ($t(e) || va(e.parent, t));
}
function Te(e) {
	return (
		e.prev && e.prev.kind !== 'docType' && e.kind !== 'angularControlFlowBlock' && !Q(e.prev) && e.isLeadingSpaceSensitive && !e.hasLeadingSpaces
	);
}
function _t(e) {
	return e.lastChild?.isTrailingSpaceSensitive && !e.lastChild.hasTrailingSpaces && !Q(Qu(e.lastChild)) && !Fe(e);
}
function st(e) {
	return !e.next && !e.hasTrailingSpaces && e.isTrailingSpaceSensitive && Q(Qu(e));
}
function Gt(e) {
	return e.next && !Q(e.next) && Q(e) && e.isTrailingSpaceSensitive && !e.hasTrailingSpaces;
}
function R0(e) {
	let t = e.trim().match(/^prettier-ignore-attribute(?:\s+(.+))?$/su);
	return t ? (t[1] ? t[1].split(/\s+/u) : !0) : !1;
}
function Xt(e) {
	return !e.prev && e.isLeadingSpaceSensitive && !e.hasLeadingSpaces;
}
function q0(e, t, u) {
	let { node: n } = e;
	if (!Yu(n.attrs)) return n.isSelfClosing ? ' ' : '';
	let r = n.prev?.kind === 'comment' && R0(n.prev.value),
		a = typeof r == 'boolean' ? () => r : Array.isArray(r) ? (h) => r.includes(h.rawName) : () => !1,
		i = e.map(({ node: h }) => (a(h) ? ie(t.originalText.slice(bt(h), zt(h))) : u()), 'attrs'),
		s = n.kind === 'element' && n.fullName === 'script' && n.attrs.length === 1 && n.attrs[0].fullName === 'src' && n.children.length === 0,
		o = t.singleAttributePerLine && n.attrs.length > 1 && !$e(n, t) ? P : O,
		l = [se([s ? ' ' : O, We(o, i)])];
	return (
		(n.firstChild && Xt(n.firstChild)) || (n.isSelfClosing && _t(n.parent)) || s
			? l.push(n.isSelfClosing ? ' ' : '')
			: l.push(t.bracketSameLine ? (n.isSelfClosing ? ' ' : '') : n.isSelfClosing ? O : W),
		l
	);
}
function F0(e) {
	return e.firstChild && Xt(e.firstChild) ? '' : tn(e);
}
function Eu(e, t, u) {
	let { node: n } = e;
	return [tt(n, t), q0(e, t, u), n.isSelfClosing ? '' : F0(n)];
}
function tt(e, t) {
	return e.prev && Gt(e.prev) ? '' : [Ae(e, t), en(e, t)];
}
function Ae(e, t) {
	return Xt(e) ? tn(e.parent) : Te(e) ? xt(e.prev, t) : '';
}
var zn = '<!doctype';
function en(e, t) {
	switch (e.kind) {
		case 'ieConditionalComment':
		case 'ieConditionalStartComment':
			return `<!--[if ${e.condition}`;
		case 'ieConditionalEndComment':
			return '<!--<!';
		case 'interpolation':
			return '{{';
		case 'docType': {
			if (e.value === 'html') {
				let { filepath: n } = t;
				if (n && /\.html?$/u.test(n)) return zn;
			}
			let u = bt(e);
			return t.originalText.slice(u, u + zn.length);
		}
		case 'angularIcuExpression':
			return '{';
		case 'element':
			if (e.condition) return `<!--[if ${e.condition}]><!--><${e.rawName}`;
		default:
			return `<${e.rawName}`;
	}
}
function tn(e) {
	switch (e.kind) {
		case 'ieConditionalComment':
			return ']>';
		case 'element':
			if (e.condition) return '><!--<![endif]-->';
		default:
			return '>';
	}
}
function M0(e, t) {
	if (!e.endSourceSpan) return '';
	let u = e.startSourceSpan.end.offset;
	e.firstChild && Xt(e.firstChild) && (u -= tn(e).length);
	let n = e.endSourceSpan.start.offset;
	return (e.lastChild && st(e.lastChild) ? (n += Zu(e, t).length) : _t(e) && (n -= xt(e.lastChild, t).length), t.originalText.slice(u, n));
}
var Ma = M0,
	H0 = new Set(['if', 'else if', 'for', 'switch', 'case']);
function V0(e, t) {
	let { node: u } = e;
	switch (u.kind) {
		case 'element':
			if (he(u, t) || u.kind === 'interpolation') return;
			if (!u.isSelfClosing && Ju(u, t)) {
				let n = Un(u, t);
				return n
					? async (r, a) => {
							let i = Ma(u, t),
								s = /^\s*$/u.test(i),
								o = '';
							return (
								s || ((o = await r(Sa(i), { parser: n, __embeddedInHtml: !0 })), (s = o === '')),
								[Ae(u, t), R(Eu(e, t, a)), s ? '' : P, o, s ? '' : P, _u(u, t), Ce(u, t)]
							);
						}
					: void 0;
			}
			break;
		case 'text':
			if (he(u.parent, t)) {
				let n = Un(u.parent, t);
				if (n)
					return async (r) => {
						let a = n === 'markdown' ? J.dedentString(u.value.replace(/^[^\S\n]*\n/u, '')) : u.value,
							i = { parser: n, __embeddedInHtml: !0 };
						if (t.parser === 'html' && n === 'babel') {
							let s = 'script',
								{ attrMap: o } = u.parent;
							(o && (o.type === 'module' || ((o.type === 'text/babel' || o.type === 'text/jsx') && o['data-type'] === 'module')) && (s = 'module'),
								(i.__babelSourceType = s));
						}
						return [ft, Ae(u, t), await r(a, i), Ce(u, t)];
					};
			} else if (u.parent.kind === 'interpolation')
				return async (n) => {
					let r = { __isInHtmlInterpolation: !0, __embeddedInHtml: !0 };
					return (
						t.parser === 'angular'
							? (r.parser = '__ng_interpolation')
							: t.parser === 'vue'
								? (r.parser = je(e, t) ? '__vue_ts_expression' : '__vue_expression')
								: (r.parser = '__js_expression'),
						[se([O, await n(u.value, r)]), u.parent.next && Te(u.parent.next) ? ' ' : O]
					);
				};
			break;
		case 'attribute':
			return I0(e, t);
		case 'angularControlFlowBlockParameters':
			return H0.has(e.parent.name) ? tl : void 0;
		case 'angularLetDeclarationInitializer':
			return (n) => Z(u.value, n, { parser: '__ng_binding', __isInHtmlAttribute: !1 });
	}
}
var W0 = V0,
	Ge = null;
function ut(e) {
	if (Ge !== null && typeof Ge.property) {
		let t = Ge;
		return ((Ge = ut.prototype = null), t);
	}
	return ((Ge = ut.prototype = e ?? Object.create(null)), new ut());
}
var U0 = 10;
for (let e = 0; e <= U0; e++) ut();
function $0(e) {
	return ut(e);
}
function j0(e, t = 'type') {
	$0(e);
	function u(n) {
		let r = n[t],
			a = e[r];
		if (!Array.isArray(a)) throw Object.assign(new Error(`Missing visitor keys for '${r}'.`), { node: n });
		return a;
	}
	return u;
}
var z0 = j0,
	Y = [['children'], []],
	G0 = {
		root: Y[0],
		element: ['attrs', 'children'],
		ieConditionalComment: Y[0],
		ieConditionalStartComment: Y[1],
		ieConditionalEndComment: Y[1],
		interpolation: Y[0],
		text: Y[0],
		docType: Y[1],
		comment: Y[1],
		attribute: Y[1],
		cdata: Y[1],
		angularControlFlowBlock: ['children', 'parameters'],
		angularControlFlowBlockParameters: Y[0],
		angularControlFlowBlockParameter: Y[1],
		angularLetDeclaration: ['init'],
		angularLetDeclarationInitializer: Y[1],
		angularIcuExpression: ['cases'],
		angularIcuCase: ['expression']
	},
	X0 = z0(G0, 'kind'),
	Y0 = X0,
	K0 = 'format',
	Q0 = /^\s*<!--\s*@(?:noformat|noprettier)\s*-->/u,
	J0 = /^\s*<!--\s*@(?:format|prettier)\s*-->/u,
	Z0 = (e) => J0.test(e),
	ed = (e) => Q0.test(e),
	td = (e) => `<!-- @${K0} -->

${e}`,
	ud = new Map([
		['if', new Set(['else if', 'else'])],
		['else if', new Set(['else if', 'else'])],
		['for', new Set(['empty'])],
		['defer', new Set(['placeholder', 'error', 'loading'])],
		['placeholder', new Set(['placeholder', 'error', 'loading'])],
		['error', new Set(['placeholder', 'error', 'loading'])],
		['loading', new Set(['placeholder', 'error', 'loading'])]
	]);
function Ha(e) {
	let t = zt(e);
	return e.kind === 'element' && !e.endSourceSpan && Yu(e.children) ? Math.max(t, Ha(He(0, e.children, -1))) : t;
}
function Xe(e, t, u) {
	let n = e.node;
	if ($t(n)) {
		let r = Ha(n);
		return [
			Ae(n, t),
			ie(J.trimEnd(t.originalText.slice(bt(n) + (n.prev && Gt(n.prev) ? en(n).length : 0), r - (n.next && Te(n.next) ? xt(n, t).length : 0)))),
			Ce(n, t)
		];
	}
	return u();
}
function wt(e, t) {
	return Q(e) && Q(t)
		? e.isTrailingSpaceSensitive
			? e.hasTrailingSpaces
				? ru(t)
					? P
					: O
				: ''
			: ru(t)
				? P
				: W
		: (Gt(e) && ($t(t) || t.firstChild || t.isSelfClosing || (t.kind === 'element' && t.attrs.length > 0))) ||
			  (e.kind === 'element' && e.isSelfClosing && Te(t))
			? ''
			: !t.isLeadingSpaceSensitive || ru(t) || (Te(t) && e.lastChild && st(e.lastChild) && e.lastChild.lastChild && st(e.lastChild.lastChild))
				? P
				: t.hasLeadingSpaces
					? O
					: W;
}
function un(e, t, u) {
	let { node: n } = e;
	if (Ca(n))
		return [
			ft,
			...e.map(() => {
				let a = e.node,
					i = a.prev ? wt(a.prev, a) : '';
				return [i ? [i, At(a.prev) ? P : ''] : '', Xe(e, t, u)];
			}, 'children')
		];
	let r = n.children.map(() => Symbol(''));
	return e.map(({ node: a, index: i }) => {
		if (Q(a)) {
			if (a.prev && Q(a.prev)) {
				let m = wt(a.prev, a);
				if (m) return At(a.prev) ? [P, P, Xe(e, t, u)] : [m, Xe(e, t, u)];
			}
			return Xe(e, t, u);
		}
		let s = [],
			o = [],
			l = [],
			h = [],
			x = a.prev ? wt(a.prev, a) : '',
			_ = a.next ? wt(a, a.next) : '';
		return (
			x && (At(a.prev) ? s.push(P, P) : x === P ? s.push(P) : Q(a.prev) ? o.push(x) : o.push(it('', W, { groupId: r[i - 1] }))),
			_ && (At(a) ? Q(a.next) && h.push(P, P) : _ === P ? Q(a.next) && h.push(P) : l.push(_)),
			[...s, R([...o, R([Xe(e, t, u), ...l], { id: r[i] })]), ...h]
		);
	}, 'children');
}
function nd(e, t, u) {
	let { node: n } = e,
		r = [];
	if ((id(e) && r.push('} '), r.push('@', n.name), n.parameters && r.push(' (', R(u('parameters')), ')'), !ad(n))) {
		r.push(' {');
		let a = Va(n);
		n.children.length > 0
			? ((n.firstChild.hasLeadingSpaces = !0), (n.lastChild.hasTrailingSpaces = !0), r.push(se([P, un(e, t, u)])), a && r.push(P, '}'))
			: a && r.push('}');
	}
	return R(r, { shouldBreak: !0 });
}
function Va(e) {
	return !(e.next?.kind === 'angularControlFlowBlock' && ud.get(e.name)?.has(e.next.name));
}
var rd = (e) => e?.kind === 'angularControlFlowBlock' && (e.name === 'case' || e.name === 'default');
function ad(e) {
	return rd(e) && e.endSourceSpan && e.endSourceSpan.start.offset === e.endSourceSpan.end.offset;
}
function id(e) {
	let { previous: t } = e;
	return t?.kind === 'angularControlFlowBlock' && !$t(t) && !Va(t);
}
function sd(e, t, u) {
	return [se([W, We([';', O], e.map(u, 'children'))]), W];
}
function od(e, t, u) {
	let { node: n } = e;
	return [tt(n, t), R([n.switchValue.trim(), ', ', n.type, n.cases.length > 0 ? [',', se([O, We(O, e.map(u, 'cases'))])] : '', W]), et(n, t)];
}
function cd(e, t, u) {
	let { node: n } = e;
	return [
		n.value,
		' {',
		R([
			se([
				W,
				e.map(({ node: r, isLast: a }) => {
					let i = [u()];
					return (r.kind === 'text' && (r.hasLeadingSpaces && i.unshift(O), r.hasTrailingSpaces && !a && i.push(O)), i);
				}, 'expression')
			]),
			W
		]),
		'}'
	];
}
function ld(e, t, u) {
	let { node: n } = e;
	if (va(n, t)) return [Ae(n, t), R(Eu(e, t, u)), ie(Ma(n, t)), ..._u(n, t), Ce(n, t)];
	let r =
			n.children.length === 1 &&
			(n.firstChild.kind === 'interpolation' || n.firstChild.kind === 'angularIcuExpression') &&
			n.firstChild.isLeadingSpaceSensitive &&
			!n.firstChild.hasLeadingSpaces &&
			n.lastChild.isTrailingSpaceSensitive &&
			!n.lastChild.hasTrailingSpaces,
		a = Symbol('element-attr-group-id'),
		i = (h) => R([R(Eu(e, t, u), { id: a }), h, _u(n, t)]),
		s = (h) =>
			r ? Rc(h, { groupId: a }) : (he(n, t) || jt(n, t)) && n.parent.kind === 'root' && t.parser === 'vue' && !t.vueIndentScriptAndStyle ? h : se(h),
		o = () =>
			r
				? it(W, '', { groupId: a })
				: n.firstChild.hasLeadingSpaces && n.firstChild.isLeadingSpaceSensitive
					? O
					: n.firstChild.kind === 'text' && n.isWhitespaceSensitive && n.isIndentationSensitive
						? Oc(W)
						: W,
		l = () =>
			(n.next ? Te(n.next) : _t(n.parent))
				? n.lastChild.hasTrailingSpaces && n.lastChild.isTrailingSpaceSensitive
					? ' '
					: ''
				: r
					? it(W, '', { groupId: a })
					: n.lastChild.hasTrailingSpaces && n.lastChild.isTrailingSpaceSensitive
						? O
						: (n.lastChild.kind === 'comment' || (n.lastChild.kind === 'text' && n.isWhitespaceSensitive && n.isIndentationSensitive)) &&
							  new RegExp(`\\n[\\t ]{${t.tabWidth * (e.ancestors.length - 1)}}$`, 'u').test(n.lastChild.value)
							? ''
							: W;
	return n.children.length === 0 ? i(n.hasDanglingSpaces && n.isDanglingSpaceSensitive ? O : '') : i([Dl(n) ? ft : '', s([o(), un(e, t, u)]), l()]);
}
var de = (function (e) {
	return (
		(e[(e.RAW_TEXT = 0)] = 'RAW_TEXT'),
		(e[(e.ESCAPABLE_RAW_TEXT = 1)] = 'ESCAPABLE_RAW_TEXT'),
		(e[(e.PARSABLE_DATA = 2)] = 'PARSABLE_DATA'),
		e
	);
})({});
function Yt(e, t = !0) {
	if (e[0] != ':') return [null, e];
	let u = e.indexOf(':', 1);
	if (u === -1) {
		if (t) throw new Error(`Unsupported format "${e}" expecting ":namespace:name"`);
		return [null, e];
	}
	return [e.slice(1, u), e.slice(u + 1)];
}
function Gn(e) {
	return Yt(e)[1] === 'ng-container';
}
function Xn(e) {
	return Yt(e)[1] === 'ng-content';
}
function Bt(e) {
	return e === null ? null : Yt(e)[0];
}
function nt(e, t) {
	return e ? `:${e}:${t}` : t;
}
var Yn = { name: 'custom-elements' },
	Kn = { name: 'no-errors-schema' },
	Ie = (function (e) {
		return (
			(e[(e.NONE = 0)] = 'NONE'),
			(e[(e.HTML = 1)] = 'HTML'),
			(e[(e.STYLE = 2)] = 'STYLE'),
			(e[(e.SCRIPT = 3)] = 'SCRIPT'),
			(e[(e.URL = 4)] = 'URL'),
			(e[(e.RESOURCE_URL = 5)] = 'RESOURCE_URL'),
			(e[(e.ATTRIBUTE_NO_BINDING = 6)] = 'ATTRIBUTE_NO_BINDING'),
			e
		);
	})({}),
	dd = /-+([a-z0-9])/g;
function hd(e) {
	return e.replace(dd, (...t) => t[1].toUpperCase());
}
var It;
function Qn() {
	return (
		It ||
			((It = {}),
			Ye(Ie.HTML, ['iframe|srcdoc', '*|innerHTML', '*|outerHTML']),
			Ye(Ie.STYLE, ['*|style']),
			Ye(Ie.URL, [
				'*|formAction',
				'area|href',
				'a|href',
				'a|xlink:href',
				'form|action',
				'annotation|href',
				'annotation|xlink:href',
				'annotation-xml|href',
				'annotation-xml|xlink:href',
				'maction|href',
				'maction|xlink:href',
				'malignmark|href',
				'malignmark|xlink:href',
				'math|href',
				'math|xlink:href',
				'mroot|href',
				'mroot|xlink:href',
				'msqrt|href',
				'msqrt|xlink:href',
				'merror|href',
				'merror|xlink:href',
				'mfrac|href',
				'mfrac|xlink:href',
				'mglyph|href',
				'mglyph|xlink:href',
				'msub|href',
				'msub|xlink:href',
				'msup|href',
				'msup|xlink:href',
				'msubsup|href',
				'msubsup|xlink:href',
				'mmultiscripts|href',
				'mmultiscripts|xlink:href',
				'mprescripts|href',
				'mprescripts|xlink:href',
				'mi|href',
				'mi|xlink:href',
				'mn|href',
				'mn|xlink:href',
				'mo|href',
				'mo|xlink:href',
				'mpadded|href',
				'mpadded|xlink:href',
				'mphantom|href',
				'mphantom|xlink:href',
				'mrow|href',
				'mrow|xlink:href',
				'ms|href',
				'ms|xlink:href',
				'mspace|href',
				'mspace|xlink:href',
				'mstyle|href',
				'mstyle|xlink:href',
				'mtable|href',
				'mtable|xlink:href',
				'mtd|href',
				'mtd|xlink:href',
				'mtr|href',
				'mtr|xlink:href',
				'mtext|href',
				'mtext|xlink:href',
				'mover|href',
				'mover|xlink:href',
				'munder|href',
				'munder|xlink:href',
				'munderover|href',
				'munderover|xlink:href',
				'semantics|href',
				'semantics|xlink:href',
				'none|href',
				'none|xlink:href',
				'img|src',
				'video|src'
			]),
			Ye(Ie.RESOURCE_URL, [
				'base|href',
				'embed|src',
				'frame|src',
				'iframe|src',
				'link|href',
				'object|codebase',
				'object|data',
				'script|src',
				'script|href',
				'script|xlink:href'
			]),
			Ye(Ie.ATTRIBUTE_NO_BINDING, [
				'animate|attributeName',
				'set|attributeName',
				'animateMotion|attributeName',
				'animateTransform|attributeName',
				'unknown|attributeName',
				'iframe|sandbox',
				'iframe|allow',
				'iframe|allowFullscreen',
				'iframe|referrerPolicy',
				'iframe|csp',
				'iframe|fetchPriority',
				'unknown|sandbox',
				'unknown|allow',
				'unknown|allowFullscreen',
				'unknown|referrerPolicy',
				'unknown|csp',
				'unknown|fetchPriority'
			])),
		It
	);
}
function Ye(e, t) {
	for (let u of t) It[u.toLowerCase()] = e;
}
var fd = class {},
	pd = 'boolean',
	md = 'number',
	gd = 'string',
	bd = 'object',
	xd = [
		'[Element]|textContent,%ariaActiveDescendantElement,%ariaAtomic,%ariaAutoComplete,%ariaBusy,%ariaChecked,%ariaColCount,%ariaColIndex,%ariaColIndexText,%ariaColSpan,%ariaControlsElements,%ariaCurrent,%ariaDescribedByElements,%ariaDescription,%ariaDetailsElements,%ariaDisabled,%ariaErrorMessageElements,%ariaExpanded,%ariaFlowToElements,%ariaHasPopup,%ariaHidden,%ariaInvalid,%ariaKeyShortcuts,%ariaLabel,%ariaLabelledByElements,%ariaLevel,%ariaLive,%ariaModal,%ariaMultiLine,%ariaMultiSelectable,%ariaOrientation,%ariaOwnsElements,%ariaPlaceholder,%ariaPosInSet,%ariaPressed,%ariaReadOnly,%ariaRelevant,%ariaRequired,%ariaRoleDescription,%ariaRowCount,%ariaRowIndex,%ariaRowIndexText,%ariaRowSpan,%ariaSelected,%ariaSetSize,%ariaSort,%ariaValueMax,%ariaValueMin,%ariaValueNow,%ariaValueText,%classList,className,elementTiming,id,innerHTML,*beforecopy,*beforecut,*beforepaste,*fullscreenchange,*fullscreenerror,*search,*webkitfullscreenchange,*webkitfullscreenerror,outerHTML,%part,#scrollLeft,#scrollTop,slot,*message,*mozfullscreenchange,*mozfullscreenerror,*mozpointerlockchange,*mozpointerlockerror,*webglcontextcreationerror,*webglcontextlost,*webglcontextrestored',
		'[HTMLElement]^[Element]|accessKey,autocapitalize,!autofocus,contentEditable,dir,!draggable,enterKeyHint,!hidden,!inert,innerText,inputMode,lang,nonce,*abort,*animationend,*animationiteration,*animationstart,*auxclick,*beforexrselect,*blur,*cancel,*canplay,*canplaythrough,*change,*click,*close,*contextmenu,*copy,*cuechange,*cut,*dblclick,*drag,*dragend,*dragenter,*dragleave,*dragover,*dragstart,*drop,*durationchange,*emptied,*ended,*error,*focus,*formdata,*gotpointercapture,*input,*invalid,*keydown,*keypress,*keyup,*load,*loadeddata,*loadedmetadata,*loadstart,*lostpointercapture,*mousedown,*mouseenter,*mouseleave,*mousemove,*mouseout,*mouseover,*mouseup,*mousewheel,*paste,*pause,*play,*playing,*pointercancel,*pointerdown,*pointerenter,*pointerleave,*pointermove,*pointerout,*pointerover,*pointerrawupdate,*pointerup,*progress,*ratechange,*reset,*resize,*scroll,*securitypolicyviolation,*seeked,*seeking,*select,*selectionchange,*selectstart,*slotchange,*stalled,*submit,*suspend,*timeupdate,*toggle,*transitioncancel,*transitionend,*transitionrun,*transitionstart,*volumechange,*waiting,*webkitanimationend,*webkitanimationiteration,*webkitanimationstart,*webkittransitionend,*wheel,outerText,!spellcheck,%style,#tabIndex,title,!translate,virtualKeyboardPolicy',
		'abbr,address,article,aside,b,bdi,bdo,cite,content,code,dd,dfn,dt,em,figcaption,figure,footer,header,hgroup,i,kbd,main,mark,nav,noscript,rb,rp,rt,rtc,ruby,s,samp,search,section,small,strong,sub,sup,u,var,wbr^[HTMLElement]|accessKey,autocapitalize,!autofocus,contentEditable,dir,!draggable,enterKeyHint,!hidden,innerText,inputMode,lang,nonce,*abort,*animationend,*animationiteration,*animationstart,*auxclick,*beforexrselect,*blur,*cancel,*canplay,*canplaythrough,*change,*click,*close,*contextmenu,*copy,*cuechange,*cut,*dblclick,*drag,*dragend,*dragenter,*dragleave,*dragover,*dragstart,*drop,*durationchange,*emptied,*ended,*error,*focus,*formdata,*gotpointercapture,*input,*invalid,*keydown,*keypress,*keyup,*load,*loadeddata,*loadedmetadata,*loadstart,*lostpointercapture,*mousedown,*mouseenter,*mouseleave,*mousemove,*mouseout,*mouseover,*mouseup,*mousewheel,*paste,*pause,*play,*playing,*pointercancel,*pointerdown,*pointerenter,*pointerleave,*pointermove,*pointerout,*pointerover,*pointerrawupdate,*pointerup,*progress,*ratechange,*reset,*resize,*scroll,*securitypolicyviolation,*seeked,*seeking,*select,*selectionchange,*selectstart,*slotchange,*stalled,*submit,*suspend,*timeupdate,*toggle,*transitioncancel,*transitionend,*transitionrun,*transitionstart,*volumechange,*waiting,*webkitanimationend,*webkitanimationiteration,*webkitanimationstart,*webkittransitionend,*wheel,outerText,!spellcheck,%style,#tabIndex,title,!translate,virtualKeyboardPolicy',
		'media^[HTMLElement]|!autoplay,!controls,%controlsList,%crossOrigin,#currentTime,!defaultMuted,#defaultPlaybackRate,!disableRemotePlayback,!loop,!muted,*encrypted,*waitingforkey,#playbackRate,preload,!preservesPitch,src,%srcObject,#volume',
		':svg:^[HTMLElement]|!autofocus,nonce,*abort,*animationend,*animationiteration,*animationstart,*auxclick,*beforexrselect,*blur,*cancel,*canplay,*canplaythrough,*change,*click,*close,*contextmenu,*copy,*cuechange,*cut,*dblclick,*drag,*dragend,*dragenter,*dragleave,*dragover,*dragstart,*drop,*durationchange,*emptied,*ended,*error,*focus,*formdata,*gotpointercapture,*input,*invalid,*keydown,*keypress,*keyup,*load,*loadeddata,*loadedmetadata,*loadstart,*lostpointercapture,*mousedown,*mouseenter,*mouseleave,*mousemove,*mouseout,*mouseover,*mouseup,*mousewheel,*paste,*pause,*play,*playing,*pointercancel,*pointerdown,*pointerenter,*pointerleave,*pointermove,*pointerout,*pointerover,*pointerrawupdate,*pointerup,*progress,*ratechange,*reset,*resize,*scroll,*securitypolicyviolation,*seeked,*seeking,*select,*selectionchange,*selectstart,*slotchange,*stalled,*submit,*suspend,*timeupdate,*toggle,*transitioncancel,*transitionend,*transitionrun,*transitionstart,*volumechange,*waiting,*webkitanimationend,*webkitanimationiteration,*webkitanimationstart,*webkittransitionend,*wheel,%style,#tabIndex',
		':svg:graphics^:svg:|',
		':svg:animation^:svg:|*begin,*end,*repeat',
		':svg:geometry^:svg:|',
		':svg:componentTransferFunction^:svg:|',
		':svg:gradient^:svg:|',
		':svg:textContent^:svg:graphics|',
		':svg:textPositioning^:svg:textContent|',
		'a^[HTMLElement]|charset,coords,download,hash,host,hostname,href,hreflang,name,password,pathname,ping,port,protocol,referrerPolicy,rel,%relList,rev,search,shape,target,text,type,username',
		'area^[HTMLElement]|alt,coords,download,hash,host,hostname,href,!noHref,password,pathname,ping,port,protocol,referrerPolicy,rel,%relList,search,shape,target,username',
		'audio^media|',
		'br^[HTMLElement]|clear',
		'base^[HTMLElement]|href,target',
		'body^[HTMLElement]|aLink,background,bgColor,link,*afterprint,*beforeprint,*beforeunload,*blur,*error,*focus,*hashchange,*languagechange,*load,*message,*messageerror,*offline,*online,*pagehide,*pageshow,*popstate,*rejectionhandled,*resize,*scroll,*storage,*unhandledrejection,*unload,text,vLink',
		'button^[HTMLElement]|!disabled,formAction,formEnctype,formMethod,!formNoValidate,formTarget,name,type,value',
		'canvas^[HTMLElement]|#height,#width',
		'content^[HTMLElement]|select',
		'dl^[HTMLElement]|!compact',
		'data^[HTMLElement]|value',
		'datalist^[HTMLElement]|',
		'details^[HTMLElement]|!open',
		'dialog^[HTMLElement]|!open,returnValue',
		'dir^[HTMLElement]|!compact',
		'div^[HTMLElement]|align',
		'embed^[HTMLElement]|align,height,name,src,type,width',
		'fieldset^[HTMLElement]|!disabled,name',
		'font^[HTMLElement]|color,face,size',
		'form^[HTMLElement]|acceptCharset,action,autocomplete,encoding,enctype,method,name,!noValidate,target',
		'frame^[HTMLElement]|frameBorder,longDesc,marginHeight,marginWidth,name,!noResize,scrolling,src',
		'frameset^[HTMLElement]|cols,*afterprint,*beforeprint,*beforeunload,*blur,*error,*focus,*hashchange,*languagechange,*load,*message,*messageerror,*offline,*online,*pagehide,*pageshow,*popstate,*rejectionhandled,*resize,*scroll,*storage,*unhandledrejection,*unload,rows',
		'hr^[HTMLElement]|align,color,!noShade,size,width',
		'head^[HTMLElement]|',
		'h1,h2,h3,h4,h5,h6^[HTMLElement]|align',
		'html^[HTMLElement]|version',
		'iframe^[HTMLElement]|align,allow,!allowFullscreen,!allowPaymentRequest,csp,frameBorder,height,loading,longDesc,marginHeight,marginWidth,name,referrerPolicy,%sandbox,scrolling,src,srcdoc,width',
		'img^[HTMLElement]|align,alt,border,%crossOrigin,decoding,#height,#hspace,!isMap,loading,longDesc,lowsrc,name,referrerPolicy,sizes,src,srcset,useMap,#vspace,#width',
		'input^[HTMLElement]|accept,align,alt,autocomplete,!checked,!defaultChecked,defaultValue,dirName,!disabled,%files,formAction,formEnctype,formMethod,!formNoValidate,formTarget,#height,!incremental,!indeterminate,max,#maxLength,min,#minLength,!multiple,name,pattern,placeholder,!readOnly,!required,selectionDirection,#selectionEnd,#selectionStart,#size,src,step,type,useMap,value,%valueAsDate,#valueAsNumber,#width',
		'li^[HTMLElement]|type,#value',
		'label^[HTMLElement]|htmlFor',
		'legend^[HTMLElement]|align',
		'link^[HTMLElement]|as,charset,%crossOrigin,!disabled,href,hreflang,imageSizes,imageSrcset,integrity,media,referrerPolicy,rel,%relList,rev,%sizes,target,type',
		'map^[HTMLElement]|name',
		'marquee^[HTMLElement]|behavior,bgColor,direction,height,#hspace,#loop,#scrollAmount,#scrollDelay,!trueSpeed,#vspace,width',
		'menu^[HTMLElement]|!compact',
		'meta^[HTMLElement]|content,httpEquiv,media,name,scheme',
		'meter^[HTMLElement]|#high,#low,#max,#min,#optimum,#value',
		'ins,del^[HTMLElement]|cite,dateTime',
		'ol^[HTMLElement]|!compact,!reversed,#start,type',
		'object^[HTMLElement]|align,archive,border,code,codeBase,codeType,data,!declare,height,#hspace,name,standby,type,useMap,#vspace,width',
		'optgroup^[HTMLElement]|!disabled,label',
		'option^[HTMLElement]|!defaultSelected,!disabled,label,!selected,text,value',
		'output^[HTMLElement]|defaultValue,%htmlFor,name,value',
		'p^[HTMLElement]|align',
		'param^[HTMLElement]|name,type,value,valueType',
		'picture^[HTMLElement]|',
		'pre^[HTMLElement]|#width',
		'progress^[HTMLElement]|#max,#value',
		'q,blockquote,cite^[HTMLElement]|',
		'script^[HTMLElement]|!async,charset,%crossOrigin,!defer,event,htmlFor,integrity,!noModule,%referrerPolicy,src,text,type',
		'select^[HTMLElement]|autocomplete,!disabled,#length,!multiple,name,!required,#selectedIndex,#size,value',
		'selectedcontent^[HTMLElement]|',
		'slot^[HTMLElement]|name',
		'source^[HTMLElement]|#height,media,sizes,src,srcset,type,#width',
		'span^[HTMLElement]|',
		'style^[HTMLElement]|!disabled,media,type',
		'search^[HTMLELement]|',
		'caption^[HTMLElement]|align',
		'th,td^[HTMLElement]|abbr,align,axis,bgColor,ch,chOff,#colSpan,headers,height,!noWrap,#rowSpan,scope,vAlign,width',
		'col,colgroup^[HTMLElement]|align,ch,chOff,#span,vAlign,width',
		'table^[HTMLElement]|align,bgColor,border,%caption,cellPadding,cellSpacing,frame,rules,summary,%tFoot,%tHead,width',
		'tr^[HTMLElement]|align,bgColor,ch,chOff,vAlign',
		'tfoot,thead,tbody^[HTMLElement]|align,ch,chOff,vAlign',
		'template^[HTMLElement]|',
		'textarea^[HTMLElement]|autocomplete,#cols,defaultValue,dirName,!disabled,#maxLength,#minLength,name,placeholder,!readOnly,!required,#rows,selectionDirection,#selectionEnd,#selectionStart,value,wrap',
		'time^[HTMLElement]|dateTime',
		'title^[HTMLElement]|text',
		'track^[HTMLElement]|!default,kind,label,src,srclang',
		'ul^[HTMLElement]|!compact,type',
		'unknown^[HTMLElement]|',
		'video^media|!disablePictureInPicture,#height,*enterpictureinpicture,*leavepictureinpicture,!playsInline,poster,#width',
		':svg:a^:svg:graphics|',
		':svg:animate^:svg:animation|',
		':svg:animateMotion^:svg:animation|',
		':svg:animateTransform^:svg:animation|',
		':svg:circle^:svg:geometry|',
		':svg:clipPath^:svg:graphics|',
		':svg:defs^:svg:graphics|',
		':svg:desc^:svg:|',
		':svg:discard^:svg:|',
		':svg:ellipse^:svg:geometry|',
		':svg:feBlend^:svg:|',
		':svg:feColorMatrix^:svg:|',
		':svg:feComponentTransfer^:svg:|',
		':svg:feComposite^:svg:|',
		':svg:feConvolveMatrix^:svg:|',
		':svg:feDiffuseLighting^:svg:|',
		':svg:feDisplacementMap^:svg:|',
		':svg:feDistantLight^:svg:|',
		':svg:feDropShadow^:svg:|',
		':svg:feFlood^:svg:|',
		':svg:feFuncA^:svg:componentTransferFunction|',
		':svg:feFuncB^:svg:componentTransferFunction|',
		':svg:feFuncG^:svg:componentTransferFunction|',
		':svg:feFuncR^:svg:componentTransferFunction|',
		':svg:feGaussianBlur^:svg:|',
		':svg:feImage^:svg:|',
		':svg:feMerge^:svg:|',
		':svg:feMergeNode^:svg:|',
		':svg:feMorphology^:svg:|',
		':svg:feOffset^:svg:|',
		':svg:fePointLight^:svg:|',
		':svg:feSpecularLighting^:svg:|',
		':svg:feSpotLight^:svg:|',
		':svg:feTile^:svg:|',
		':svg:feTurbulence^:svg:|',
		':svg:filter^:svg:|',
		':svg:foreignObject^:svg:graphics|',
		':svg:g^:svg:graphics|',
		':svg:image^:svg:graphics|decoding',
		':svg:line^:svg:geometry|',
		':svg:linearGradient^:svg:gradient|',
		':svg:mpath^:svg:|',
		':svg:marker^:svg:|',
		':svg:mask^:svg:|',
		':svg:metadata^:svg:|',
		':svg:path^:svg:geometry|',
		':svg:pattern^:svg:|',
		':svg:polygon^:svg:geometry|',
		':svg:polyline^:svg:geometry|',
		':svg:radialGradient^:svg:gradient|',
		':svg:rect^:svg:geometry|',
		':svg:svg^:svg:graphics|#currentScale,#zoomAndPan',
		':svg:script^:svg:|type',
		':svg:set^:svg:animation|',
		':svg:stop^:svg:|',
		':svg:style^:svg:|!disabled,media,title,type',
		':svg:switch^:svg:graphics|',
		':svg:symbol^:svg:|',
		':svg:tspan^:svg:textPositioning|',
		':svg:text^:svg:textPositioning|',
		':svg:textPath^:svg:textContent|',
		':svg:title^:svg:|',
		':svg:use^:svg:graphics|',
		':svg:view^:svg:|#zoomAndPan',
		'data^[HTMLElement]|value',
		'keygen^[HTMLElement]|!autofocus,challenge,!disabled,form,keytype,name',
		'menuitem^[HTMLElement]|type,label,icon,!disabled,!checked,radiogroup,!default',
		'summary^[HTMLElement]|',
		'time^[HTMLElement]|dateTime',
		':svg:cursor^:svg:|',
		':math:^[HTMLElement]|!autofocus,nonce,*abort,*animationend,*animationiteration,*animationstart,*auxclick,*beforeinput,*beforematch,*beforetoggle,*beforexrselect,*blur,*cancel,*canplay,*canplaythrough,*change,*click,*close,*contentvisibilityautostatechange,*contextlost,*contextmenu,*contextrestored,*copy,*cuechange,*cut,*dblclick,*drag,*dragend,*dragenter,*dragleave,*dragover,*dragstart,*drop,*durationchange,*emptied,*ended,*error,*focus,*formdata,*gotpointercapture,*input,*invalid,*keydown,*keypress,*keyup,*load,*loadeddata,*loadedmetadata,*loadstart,*lostpointercapture,*mousedown,*mouseenter,*mouseleave,*mousemove,*mouseout,*mouseover,*mouseup,*mousewheel,*paste,*pause,*play,*playing,*pointercancel,*pointerdown,*pointerenter,*pointerleave,*pointermove,*pointerout,*pointerover,*pointerrawupdate,*pointerup,*progress,*ratechange,*reset,*resize,*scroll,*scrollend,*securitypolicyviolation,*seeked,*seeking,*select,*selectionchange,*selectstart,*slotchange,*stalled,*submit,*suspend,*timeupdate,*toggle,*transitioncancel,*transitionend,*transitionrun,*transitionstart,*volumechange,*waiting,*webkitanimationend,*webkitanimationiteration,*webkitanimationstart,*webkittransitionend,*wheel,%style,#tabIndex',
		':math:math^:math:|',
		':math:maction^:math:|',
		':math:menclose^:math:|',
		':math:merror^:math:|',
		':math:mfenced^:math:|',
		':math:mfrac^:math:|',
		':math:mi^:math:|',
		':math:mmultiscripts^:math:|',
		':math:mn^:math:|',
		':math:mo^:math:|',
		':math:mover^:math:|',
		':math:mpadded^:math:|',
		':math:mphantom^:math:|',
		':math:mroot^:math:|',
		':math:mrow^:math:|',
		':math:ms^:math:|',
		':math:mspace^:math:|',
		':math:msqrt^:math:|',
		':math:mstyle^:math:|',
		':math:msub^:math:|',
		':math:msubsup^:math:|',
		':math:msup^:math:|',
		':math:mtable^:math:|',
		':math:mtd^:math:|',
		':math:mtext^:math:|',
		':math:mtr^:math:|',
		':math:munder^:math:|',
		':math:munderover^:math:|',
		':math:semantics^:math:|'
	],
	Wa = new Map(
		Object.entries({
			class: 'className',
			for: 'htmlFor',
			formaction: 'formAction',
			innerHtml: 'innerHTML',
			readonly: 'readOnly',
			tabindex: 'tabIndex',
			'aria-activedescendant': 'ariaActiveDescendantElement',
			'aria-atomic': 'ariaAtomic',
			'aria-autocomplete': 'ariaAutoComplete',
			'aria-busy': 'ariaBusy',
			'aria-checked': 'ariaChecked',
			'aria-colcount': 'ariaColCount',
			'aria-colindex': 'ariaColIndex',
			'aria-colindextext': 'ariaColIndexText',
			'aria-colspan': 'ariaColSpan',
			'aria-controls': 'ariaControlsElements',
			'aria-current': 'ariaCurrent',
			'aria-describedby': 'ariaDescribedByElements',
			'aria-description': 'ariaDescription',
			'aria-details': 'ariaDetailsElements',
			'aria-disabled': 'ariaDisabled',
			'aria-errormessage': 'ariaErrorMessageElements',
			'aria-expanded': 'ariaExpanded',
			'aria-flowto': 'ariaFlowToElements',
			'aria-haspopup': 'ariaHasPopup',
			'aria-hidden': 'ariaHidden',
			'aria-invalid': 'ariaInvalid',
			'aria-keyshortcuts': 'ariaKeyShortcuts',
			'aria-label': 'ariaLabel',
			'aria-labelledby': 'ariaLabelledByElements',
			'aria-level': 'ariaLevel',
			'aria-live': 'ariaLive',
			'aria-modal': 'ariaModal',
			'aria-multiline': 'ariaMultiLine',
			'aria-multiselectable': 'ariaMultiSelectable',
			'aria-orientation': 'ariaOrientation',
			'aria-owns': 'ariaOwnsElements',
			'aria-placeholder': 'ariaPlaceholder',
			'aria-posinset': 'ariaPosInSet',
			'aria-pressed': 'ariaPressed',
			'aria-readonly': 'ariaReadOnly',
			'aria-required': 'ariaRequired',
			'aria-roledescription': 'ariaRoleDescription',
			'aria-rowcount': 'ariaRowCount',
			'aria-rowindex': 'ariaRowIndex',
			'aria-rowindextext': 'ariaRowIndexText',
			'aria-rowspan': 'ariaRowSpan',
			'aria-selected': 'ariaSelected',
			'aria-setsize': 'ariaSetSize',
			'aria-sort': 'ariaSort',
			'aria-valuemax': 'ariaValueMax',
			'aria-valuemin': 'ariaValueMin',
			'aria-valuenow': 'ariaValueNow',
			'aria-valuetext': 'ariaValueText'
		})
	),
	_d = Array.from(Wa).reduce((e, [t, u]) => (e.set(t, u), e), new Map()),
	Ed = class extends fd {
		constructor() {
			(super(),
				(this._schema = new Map()),
				(this._eventSchema = new Map()),
				xd.forEach((e) => {
					let t = new Map(),
						u = new Set(),
						[n, r] = e.split('|'),
						a = r.split(','),
						[i, s] = n.split('^');
					i.split(',').forEach((l) => {
						(this._schema.set(l.toLowerCase(), t), this._eventSchema.set(l.toLowerCase(), u));
					});
					let o = s && this._schema.get(s.toLowerCase());
					if (o) {
						for (let [l, h] of o) t.set(l, h);
						for (let l of this._eventSchema.get(s.toLowerCase())) u.add(l);
					}
					a.forEach((l) => {
						if (l.length > 0)
							switch (l[0]) {
								case '*':
									u.add(l.substring(1));
									break;
								case '!':
									t.set(l.substring(1), pd);
									break;
								case '#':
									t.set(l.substring(1), md);
									break;
								case '%':
									t.set(l.substring(1), bd);
									break;
								default:
									t.set(l, gd);
							}
					});
				}));
		}
		hasProperty(e, t, u) {
			if (u.some((n) => n.name === Kn.name)) return !0;
			if (e.indexOf('-') > -1) {
				if (Gn(e) || Xn(e)) return !1;
				if (u.some((n) => n.name === Yn.name)) return !0;
			}
			return (this._schema.get(e.toLowerCase()) || this._schema.get('unknown')).has(t);
		}
		hasElement(e, t) {
			return t.some((u) => u.name === Kn.name) || (e.indexOf('-') > -1 && (Gn(e) || Xn(e) || t.some((u) => u.name === Yn.name)))
				? !0
				: this._schema.has(e.toLowerCase());
		}
		securityContext(e, t, u) {
			(u && (t = this.getMappedPropName(t)), (e = e.toLowerCase()), (t = t.toLowerCase()));
			let n = Qn()[e + '|' + t];
			return n || ((n = Qn()['*|' + t]), n || Ie.NONE);
		}
		getMappedPropName(e) {
			return Wa.get(e) ?? e;
		}
		getDefaultComponentElementName() {
			return 'ng-component';
		}
		validateProperty(e) {
			return e.toLowerCase().startsWith('on')
				? {
						error: !0,
						msg: `Binding to event property '${e}' is disallowed for security reasons, please use (${e.slice(2)})=...
If '${e}' is a directive input, make sure the directive is imported by the current module.`
					}
				: { error: !1 };
		}
		validateAttribute(e) {
			return e.toLowerCase().startsWith('on')
				? { error: !0, msg: `Binding to event attribute '${e}' is disallowed for security reasons, please use (${e.slice(2)})=...` }
				: { error: !1 };
		}
		allKnownElementNames() {
			return Array.from(this._schema.keys());
		}
		allKnownAttributesOfElement(e) {
			let t = this._schema.get(e.toLowerCase()) || this._schema.get('unknown');
			return Array.from(t.keys()).map((u) => _d.get(u) ?? u);
		}
		allKnownEventsOfElement(e) {
			return Array.from(this._eventSchema.get(e.toLowerCase()) ?? []);
		}
		normalizeAnimationStyleProperty(e) {
			return hd(e);
		}
		normalizeAnimationStyleValue(e, t, u) {
			let n = '',
				r = u.toString().trim(),
				a = null;
			if (Sd(e) && u !== 0 && u !== '0')
				if (typeof u == 'number') n = 'px';
				else {
					let i = u.match(/^[+-]?[\d\.]+([a-z]*)$/);
					i && i[1].length == 0 && (a = `Please provide a CSS unit value for ${t}:${u}`);
				}
			return { error: a, value: r + n };
		}
	};
function Sd(e) {
	switch (e) {
		case 'width':
		case 'height':
		case 'minWidth':
		case 'minHeight':
		case 'maxWidth':
		case 'maxHeight':
		case 'left':
		case 'top':
		case 'bottom':
		case 'right':
		case 'fontSize':
		case 'outlineWidth':
		case 'outlineOffset':
		case 'paddingTop':
		case 'paddingLeft':
		case 'paddingBottom':
		case 'paddingRight':
		case 'marginTop':
		case 'marginLeft':
		case 'marginBottom':
		case 'marginRight':
		case 'borderRadius':
		case 'borderWidth':
		case 'borderTopWidth':
		case 'borderLeftWidth':
		case 'borderRightWidth':
		case 'borderBottomWidth':
		case 'textIndent':
			return !0;
		default:
			return !1;
	}
}
var C = class {
		constructor({
			closedByChildren: e,
			implicitNamespacePrefix: t,
			contentType: u = de.PARSABLE_DATA,
			closedByParent: n = !1,
			isVoid: r = !1,
			ignoreFirstLf: a = !1,
			preventNamespaceInheritance: i = !1,
			canSelfClose: s = !1
		} = {}) {
			((this.closedByChildren = {}),
				(this.closedByParent = !1),
				e && e.length > 0 && e.forEach((o) => (this.closedByChildren[o] = !0)),
				(this.isVoid = r),
				(this.closedByParent = n || r),
				(this.implicitNamespacePrefix = t || null),
				(this.contentType = u),
				(this.ignoreFirstLf = a),
				(this.preventNamespaceInheritance = i),
				(this.canSelfClose = s ?? r));
		}
		isClosedByChild(e) {
			return this.isVoid || e.toLowerCase() in this.closedByChildren;
		}
		getContentType(e) {
			return typeof this.contentType == 'object' ? ((e === void 0 ? void 0 : this.contentType[e]) ?? this.contentType.default) : this.contentType;
		}
	},
	Jn,
	Ke;
function Su(e) {
	return (
		Ke ||
			((Jn = new C({ canSelfClose: !0 })),
			(Ke = Object.assign(Object.create(null), {
				base: new C({ isVoid: !0 }),
				meta: new C({ isVoid: !0 }),
				area: new C({ isVoid: !0 }),
				embed: new C({ isVoid: !0 }),
				link: new C({ isVoid: !0 }),
				img: new C({ isVoid: !0 }),
				input: new C({ isVoid: !0 }),
				param: new C({ isVoid: !0 }),
				hr: new C({ isVoid: !0 }),
				br: new C({ isVoid: !0 }),
				source: new C({ isVoid: !0 }),
				track: new C({ isVoid: !0 }),
				wbr: new C({ isVoid: !0 }),
				p: new C({
					closedByChildren: [
						'address',
						'article',
						'aside',
						'blockquote',
						'div',
						'dl',
						'fieldset',
						'footer',
						'form',
						'h1',
						'h2',
						'h3',
						'h4',
						'h5',
						'h6',
						'header',
						'hgroup',
						'hr',
						'main',
						'nav',
						'ol',
						'p',
						'pre',
						'section',
						'table',
						'ul'
					],
					closedByParent: !0
				}),
				thead: new C({ closedByChildren: ['tbody', 'tfoot'] }),
				tbody: new C({ closedByChildren: ['tbody', 'tfoot'], closedByParent: !0 }),
				tfoot: new C({ closedByChildren: ['tbody'], closedByParent: !0 }),
				tr: new C({ closedByChildren: ['tr'], closedByParent: !0 }),
				td: new C({ closedByChildren: ['td', 'th'], closedByParent: !0 }),
				th: new C({ closedByChildren: ['td', 'th'], closedByParent: !0 }),
				col: new C({ isVoid: !0 }),
				svg: new C({ implicitNamespacePrefix: 'svg' }),
				foreignObject: new C({ implicitNamespacePrefix: 'svg', preventNamespaceInheritance: !0 }),
				math: new C({ implicitNamespacePrefix: 'math' }),
				li: new C({ closedByChildren: ['li'], closedByParent: !0 }),
				dt: new C({ closedByChildren: ['dt', 'dd'] }),
				dd: new C({ closedByChildren: ['dt', 'dd'], closedByParent: !0 }),
				rb: new C({ closedByChildren: ['rb', 'rt', 'rtc', 'rp'], closedByParent: !0 }),
				rt: new C({ closedByChildren: ['rb', 'rt', 'rtc', 'rp'], closedByParent: !0 }),
				rtc: new C({ closedByChildren: ['rb', 'rtc', 'rp'], closedByParent: !0 }),
				rp: new C({ closedByChildren: ['rb', 'rt', 'rtc', 'rp'], closedByParent: !0 }),
				optgroup: new C({ closedByChildren: ['optgroup'], closedByParent: !0 }),
				option: new C({ closedByChildren: ['option', 'optgroup'], closedByParent: !0 }),
				pre: new C({ ignoreFirstLf: !0 }),
				listing: new C({ ignoreFirstLf: !0 }),
				style: new C({ contentType: de.RAW_TEXT }),
				script: new C({ contentType: de.RAW_TEXT }),
				title: new C({ contentType: { default: de.ESCAPABLE_RAW_TEXT, svg: de.PARSABLE_DATA } }),
				textarea: new C({ contentType: de.ESCAPABLE_RAW_TEXT, ignoreFirstLf: !0 })
			})),
			new Ed().allKnownElementNames().forEach((t) => {
				!Ke[t] && Bt(t) === null && (Ke[t] = new C({ canSelfClose: !1 }));
			})),
		Ke[e] ?? Jn
	);
}
function Ft(e) {
	return (e >= 9 && e <= 32) || e == 160;
}
function Kt(e) {
	return 48 <= e && e <= 57;
}
function ot(e) {
	return (e >= 97 && e <= 122) || (e >= 65 && e <= 90);
}
function vd(e) {
	return (e >= 97 && e <= 102) || (e >= 65 && e <= 70) || Kt(e);
}
function Mt(e) {
	return e === 10 || e === 13;
}
function Zn(e) {
	return 48 <= e && e <= 55;
}
function su(e) {
	return e === 39 || e === 34 || e === 96;
}
var vu = class Ua {
		constructor(t, u, n, r) {
			((this.file = t), (this.offset = u), (this.line = n), (this.col = r));
		}
		toString() {
			return this.offset != null ? `${this.file.url}@${this.line}:${this.col}` : this.file.url;
		}
		moveBy(t) {
			let u = this.file.content,
				n = u.length,
				r = this.offset,
				a = this.line,
				i = this.col;
			for (; r > 0 && t < 0; )
				if ((r--, t++, u.charCodeAt(r) == 10)) {
					a--;
					let s = u.substring(0, r - 1).lastIndexOf(`
`);
					i = s > 0 ? r - s : r;
				} else i--;
			for (; r < n && t > 0; ) {
				let s = u.charCodeAt(r);
				(r++, t--, s == 10 ? (a++, (i = 0)) : i++);
			}
			return new Ua(this.file, r, a, i);
		}
		getContext(t, u) {
			let n = this.file.content,
				r = this.offset;
			if (r != null) {
				r > n.length - 1 && (r = n.length - 1);
				let a = r,
					i = 0,
					s = 0;
				for (
					;
					i < t &&
					r > 0 &&
					(r--,
					i++,
					!(
						n[r] ==
							`
` && ++s == u
					));
				);
				for (
					i = 0, s = 0;
					i < t &&
					a < n.length - 1 &&
					(a++,
					i++,
					!(
						n[a] ==
							`
` && ++s == u
					));
				);
				return { before: n.substring(r, this.offset), after: n.substring(this.offset, a + 1) };
			}
			return null;
		}
	},
	$a = class {
		constructor(e, t) {
			((this.content = e), (this.url = t));
		}
	},
	v = class {
		constructor(e, t, u = e, n = null) {
			((this.start = e), (this.end = t), (this.fullStart = u), (this.details = n));
		}
		toString() {
			return this.start.file.content.substring(this.start.offset, this.end.offset);
		}
	},
	er = (function (e) {
		return ((e[(e.WARNING = 0)] = 'WARNING'), (e[(e.ERROR = 1)] = 'ERROR'), e);
	})({}),
	Pe = class extends Error {
		constructor(e, t, u = er.ERROR, n) {
			(super(t), (this.span = e), (this.msg = t), (this.level = u), (this.relatedError = n), Object.setPrototypeOf(this, new.target.prototype));
		}
		contextualMessage() {
			let e = this.span.start.getContext(100, 3);
			return e ? `${this.msg} ("${e.before}[${er[this.level]} ->]${e.after}")` : this.msg;
		}
		toString() {
			let e = this.span.details ? `, ${this.span.details}` : '';
			return `${this.contextualMessage()}: ${this.span.start}${e}`;
		}
	},
	ye = class {
		constructor(e, t) {
			((this.sourceSpan = e), (this.i18n = t));
		}
	},
	kd = class extends ye {
		constructor(e, t, u, n) {
			(super(t, n), (this.value = e), (this.tokens = u), (this.kind = 'text'));
		}
		visit(e, t) {
			return e.visitText(this, t);
		}
	},
	Cd = class extends ye {
		constructor(e, t, u, n) {
			(super(t, n), (this.value = e), (this.tokens = u), (this.kind = 'cdata'));
		}
		visit(e, t) {
			return e.visitCdata(this, t);
		}
	},
	Td = class extends ye {
		constructor(e, t, u, n, r, a) {
			(super(n, a), (this.switchValue = e), (this.type = t), (this.cases = u), (this.switchValueSourceSpan = r), (this.kind = 'expansion'));
		}
		visit(e, t) {
			return e.visitExpansion(this, t);
		}
	},
	Ad = class {
		constructor(e, t, u, n, r) {
			((this.value = e),
				(this.expression = t),
				(this.sourceSpan = u),
				(this.valueSourceSpan = n),
				(this.expSourceSpan = r),
				(this.kind = 'expansionCase'));
		}
		visit(e, t) {
			return e.visitExpansionCase(this, t);
		}
	},
	wd = class extends ye {
		constructor(e, t, u, n, r, a, i) {
			(super(u, i), (this.name = e), (this.value = t), (this.keySpan = n), (this.valueSpan = r), (this.valueTokens = a), (this.kind = 'attribute'));
		}
		visit(e, t) {
			return e.visitAttribute(this, t);
		}
		get nameSpan() {
			return this.keySpan;
		}
	},
	be = class extends ye {
		constructor(e, t, u, n, r, a, i, s = null, o = null, l, h) {
			(super(a, h),
				(this.name = e),
				(this.attrs = t),
				(this.directives = u),
				(this.children = n),
				(this.isSelfClosing = r),
				(this.startSourceSpan = i),
				(this.endSourceSpan = s),
				(this.nameSpan = o),
				(this.isVoid = l),
				(this.kind = 'element'));
		}
		visit(e, t) {
			return e.visitElement(this, t);
		}
	},
	yd = class {
		constructor(e, t) {
			((this.value = e), (this.sourceSpan = t), (this.kind = 'comment'));
		}
		visit(e, t) {
			return e.visitComment(this, t);
		}
	},
	Nd = class {
		constructor(e, t) {
			((this.value = e), (this.sourceSpan = t), (this.kind = 'docType'));
		}
		visit(e, t) {
			return e.visitDocType(this, t);
		}
	},
	De = class extends ye {
		constructor(e, t, u, n, r, a, i = null, s) {
			(super(n, s),
				(this.name = e),
				(this.parameters = t),
				(this.children = u),
				(this.nameSpan = r),
				(this.startSourceSpan = a),
				(this.endSourceSpan = i),
				(this.kind = 'block'));
		}
		visit(e, t) {
			return e.visitBlock(this, t);
		}
	},
	me = class extends ye {
		constructor(e, t, u, n, r, a, i, s, o, l = null, h) {
			(super(s, h),
				(this.componentName = e),
				(this.tagName = t),
				(this.fullName = u),
				(this.attrs = n),
				(this.directives = r),
				(this.children = a),
				(this.isSelfClosing = i),
				(this.startSourceSpan = o),
				(this.endSourceSpan = l),
				(this.kind = 'component'));
		}
		visit(e, t) {
			return e.visitComponent(this, t);
		}
	},
	Ld = class {
		constructor(e, t, u, n, r = null) {
			((this.name = e), (this.attrs = t), (this.sourceSpan = u), (this.startSourceSpan = n), (this.endSourceSpan = r), (this.kind = 'directive'));
		}
		visit(e, t) {
			return e.visitDirective(this, t);
		}
	},
	tr = class {
		constructor(e, t) {
			((this.expression = e), (this.sourceSpan = t), (this.kind = 'blockParameter'), (this.startSourceSpan = null), (this.endSourceSpan = null));
		}
		visit(e, t) {
			return e.visitBlockParameter(this, t);
		}
	},
	ur = class {
		constructor(e, t, u, n, r) {
			((this.name = e),
				(this.value = t),
				(this.sourceSpan = u),
				(this.nameSpan = n),
				(this.valueSpan = r),
				(this.kind = 'letDeclaration'),
				(this.startSourceSpan = null),
				(this.endSourceSpan = null));
		}
		visit(e, t) {
			return e.visitLetDeclaration(this, t);
		}
	};
function ja(e, t, u = null) {
	let n = [],
		r = e.visit ? (a) => e.visit(a, u) || a.visit(e, u) : (a) => a.visit(e, u);
	return (
		t.forEach((a) => {
			let i = r(a);
			i && n.push(i);
		}),
		n
	);
}
var Dd = class {
		constructor() {}
		visitElement(e, t) {
			this.visitChildren(t, (u) => {
				(u(e.attrs), u(e.directives), u(e.children));
			});
		}
		visitAttribute(e, t) {}
		visitText(e, t) {}
		visitCdata(e, t) {}
		visitComment(e, t) {}
		visitDocType(e, t) {}
		visitExpansion(e, t) {
			return this.visitChildren(t, (u) => {
				u(e.cases);
			});
		}
		visitExpansionCase(e, t) {}
		visitBlock(e, t) {
			this.visitChildren(t, (u) => {
				(u(e.parameters), u(e.children));
			});
		}
		visitBlockParameter(e, t) {}
		visitLetDeclaration(e, t) {}
		visitComponent(e, t) {
			this.visitChildren(t, (u) => {
				(u(e.attrs), u(e.children));
			});
		}
		visitDirective(e, t) {
			this.visitChildren(t, (u) => {
				u(e.attrs);
			});
		}
		visitChildren(e, t) {
			let u = [],
				n = this;
			function r(a) {
				a && u.push(ja(n, a, e));
			}
			return (t(r), Array.prototype.concat.apply([], u));
		}
	},
	ct = {
		AElig: 'Æ',
		AMP: '&',
		amp: '&',
		Aacute: 'Á',
		Abreve: 'Ă',
		Acirc: 'Â',
		Acy: 'А',
		Afr: '𝔄',
		Agrave: 'À',
		Alpha: 'Α',
		Amacr: 'Ā',
		And: '⩓',
		Aogon: 'Ą',
		Aopf: '𝔸',
		ApplyFunction: '⁡',
		af: '⁡',
		Aring: 'Å',
		angst: 'Å',
		Ascr: '𝒜',
		Assign: '≔',
		colone: '≔',
		coloneq: '≔',
		Atilde: 'Ã',
		Auml: 'Ä',
		Backslash: '∖',
		setminus: '∖',
		setmn: '∖',
		smallsetminus: '∖',
		ssetmn: '∖',
		Barv: '⫧',
		Barwed: '⌆',
		doublebarwedge: '⌆',
		Bcy: 'Б',
		Because: '∵',
		becaus: '∵',
		because: '∵',
		Bernoullis: 'ℬ',
		Bscr: 'ℬ',
		bernou: 'ℬ',
		Beta: 'Β',
		Bfr: '𝔅',
		Bopf: '𝔹',
		Breve: '˘',
		breve: '˘',
		Bumpeq: '≎',
		HumpDownHump: '≎',
		bump: '≎',
		CHcy: 'Ч',
		COPY: '©',
		copy: '©',
		Cacute: 'Ć',
		Cap: '⋒',
		CapitalDifferentialD: 'ⅅ',
		DD: 'ⅅ',
		Cayleys: 'ℭ',
		Cfr: 'ℭ',
		Ccaron: 'Č',
		Ccedil: 'Ç',
		Ccirc: 'Ĉ',
		Cconint: '∰',
		Cdot: 'Ċ',
		Cedilla: '¸',
		cedil: '¸',
		CenterDot: '·',
		centerdot: '·',
		middot: '·',
		Chi: 'Χ',
		CircleDot: '⊙',
		odot: '⊙',
		CircleMinus: '⊖',
		ominus: '⊖',
		CirclePlus: '⊕',
		oplus: '⊕',
		CircleTimes: '⊗',
		otimes: '⊗',
		ClockwiseContourIntegral: '∲',
		cwconint: '∲',
		CloseCurlyDoubleQuote: '”',
		rdquo: '”',
		rdquor: '”',
		CloseCurlyQuote: '’',
		rsquo: '’',
		rsquor: '’',
		Colon: '∷',
		Proportion: '∷',
		Colone: '⩴',
		Congruent: '≡',
		equiv: '≡',
		Conint: '∯',
		DoubleContourIntegral: '∯',
		ContourIntegral: '∮',
		conint: '∮',
		oint: '∮',
		Copf: 'ℂ',
		complexes: 'ℂ',
		Coproduct: '∐',
		coprod: '∐',
		CounterClockwiseContourIntegral: '∳',
		awconint: '∳',
		Cross: '⨯',
		Cscr: '𝒞',
		Cup: '⋓',
		CupCap: '≍',
		asympeq: '≍',
		DDotrahd: '⤑',
		DJcy: 'Ђ',
		DScy: 'Ѕ',
		DZcy: 'Џ',
		Dagger: '‡',
		ddagger: '‡',
		Darr: '↡',
		Dashv: '⫤',
		DoubleLeftTee: '⫤',
		Dcaron: 'Ď',
		Dcy: 'Д',
		Del: '∇',
		nabla: '∇',
		Delta: 'Δ',
		Dfr: '𝔇',
		DiacriticalAcute: '´',
		acute: '´',
		DiacriticalDot: '˙',
		dot: '˙',
		DiacriticalDoubleAcute: '˝',
		dblac: '˝',
		DiacriticalGrave: '`',
		grave: '`',
		DiacriticalTilde: '˜',
		tilde: '˜',
		Diamond: '⋄',
		diam: '⋄',
		diamond: '⋄',
		DifferentialD: 'ⅆ',
		dd: 'ⅆ',
		Dopf: '𝔻',
		Dot: '¨',
		DoubleDot: '¨',
		die: '¨',
		uml: '¨',
		DotDot: '⃜',
		DotEqual: '≐',
		doteq: '≐',
		esdot: '≐',
		DoubleDownArrow: '⇓',
		Downarrow: '⇓',
		dArr: '⇓',
		DoubleLeftArrow: '⇐',
		Leftarrow: '⇐',
		lArr: '⇐',
		DoubleLeftRightArrow: '⇔',
		Leftrightarrow: '⇔',
		hArr: '⇔',
		iff: '⇔',
		DoubleLongLeftArrow: '⟸',
		Longleftarrow: '⟸',
		xlArr: '⟸',
		DoubleLongLeftRightArrow: '⟺',
		Longleftrightarrow: '⟺',
		xhArr: '⟺',
		DoubleLongRightArrow: '⟹',
		Longrightarrow: '⟹',
		xrArr: '⟹',
		DoubleRightArrow: '⇒',
		Implies: '⇒',
		Rightarrow: '⇒',
		rArr: '⇒',
		DoubleRightTee: '⊨',
		vDash: '⊨',
		DoubleUpArrow: '⇑',
		Uparrow: '⇑',
		uArr: '⇑',
		DoubleUpDownArrow: '⇕',
		Updownarrow: '⇕',
		vArr: '⇕',
		DoubleVerticalBar: '∥',
		par: '∥',
		parallel: '∥',
		shortparallel: '∥',
		spar: '∥',
		DownArrow: '↓',
		ShortDownArrow: '↓',
		darr: '↓',
		downarrow: '↓',
		DownArrowBar: '⤓',
		DownArrowUpArrow: '⇵',
		duarr: '⇵',
		DownBreve: '̑',
		DownLeftRightVector: '⥐',
		DownLeftTeeVector: '⥞',
		DownLeftVector: '↽',
		leftharpoondown: '↽',
		lhard: '↽',
		DownLeftVectorBar: '⥖',
		DownRightTeeVector: '⥟',
		DownRightVector: '⇁',
		rhard: '⇁',
		rightharpoondown: '⇁',
		DownRightVectorBar: '⥗',
		DownTee: '⊤',
		top: '⊤',
		DownTeeArrow: '↧',
		mapstodown: '↧',
		Dscr: '𝒟',
		Dstrok: 'Đ',
		ENG: 'Ŋ',
		ETH: 'Ð',
		Eacute: 'É',
		Ecaron: 'Ě',
		Ecirc: 'Ê',
		Ecy: 'Э',
		Edot: 'Ė',
		Efr: '𝔈',
		Egrave: 'È',
		Element: '∈',
		in: '∈',
		isin: '∈',
		isinv: '∈',
		Emacr: 'Ē',
		EmptySmallSquare: '◻',
		EmptyVerySmallSquare: '▫',
		Eogon: 'Ę',
		Eopf: '𝔼',
		Epsilon: 'Ε',
		Equal: '⩵',
		EqualTilde: '≂',
		eqsim: '≂',
		esim: '≂',
		Equilibrium: '⇌',
		rightleftharpoons: '⇌',
		rlhar: '⇌',
		Escr: 'ℰ',
		expectation: 'ℰ',
		Esim: '⩳',
		Eta: 'Η',
		Euml: 'Ë',
		Exists: '∃',
		exist: '∃',
		ExponentialE: 'ⅇ',
		ee: 'ⅇ',
		exponentiale: 'ⅇ',
		Fcy: 'Ф',
		Ffr: '𝔉',
		FilledSmallSquare: '◼',
		FilledVerySmallSquare: '▪',
		blacksquare: '▪',
		squarf: '▪',
		squf: '▪',
		Fopf: '𝔽',
		ForAll: '∀',
		forall: '∀',
		Fouriertrf: 'ℱ',
		Fscr: 'ℱ',
		GJcy: 'Ѓ',
		GT: '>',
		gt: '>',
		Gamma: 'Γ',
		Gammad: 'Ϝ',
		Gbreve: 'Ğ',
		Gcedil: 'Ģ',
		Gcirc: 'Ĝ',
		Gcy: 'Г',
		Gdot: 'Ġ',
		Gfr: '𝔊',
		Gg: '⋙',
		ggg: '⋙',
		Gopf: '𝔾',
		GreaterEqual: '≥',
		ge: '≥',
		geq: '≥',
		GreaterEqualLess: '⋛',
		gel: '⋛',
		gtreqless: '⋛',
		GreaterFullEqual: '≧',
		gE: '≧',
		geqq: '≧',
		GreaterGreater: '⪢',
		GreaterLess: '≷',
		gl: '≷',
		gtrless: '≷',
		GreaterSlantEqual: '⩾',
		geqslant: '⩾',
		ges: '⩾',
		GreaterTilde: '≳',
		gsim: '≳',
		gtrsim: '≳',
		Gscr: '𝒢',
		Gt: '≫',
		NestedGreaterGreater: '≫',
		gg: '≫',
		HARDcy: 'Ъ',
		Hacek: 'ˇ',
		caron: 'ˇ',
		Hat: '^',
		Hcirc: 'Ĥ',
		Hfr: 'ℌ',
		Poincareplane: 'ℌ',
		HilbertSpace: 'ℋ',
		Hscr: 'ℋ',
		hamilt: 'ℋ',
		Hopf: 'ℍ',
		quaternions: 'ℍ',
		HorizontalLine: '─',
		boxh: '─',
		Hstrok: 'Ħ',
		HumpEqual: '≏',
		bumpe: '≏',
		bumpeq: '≏',
		IEcy: 'Е',
		IJlig: 'Ĳ',
		IOcy: 'Ё',
		Iacute: 'Í',
		Icirc: 'Î',
		Icy: 'И',
		Idot: 'İ',
		Ifr: 'ℑ',
		Im: 'ℑ',
		image: 'ℑ',
		imagpart: 'ℑ',
		Igrave: 'Ì',
		Imacr: 'Ī',
		ImaginaryI: 'ⅈ',
		ii: 'ⅈ',
		Int: '∬',
		Integral: '∫',
		int: '∫',
		Intersection: '⋂',
		bigcap: '⋂',
		xcap: '⋂',
		InvisibleComma: '⁣',
		ic: '⁣',
		InvisibleTimes: '⁢',
		it: '⁢',
		Iogon: 'Į',
		Iopf: '𝕀',
		Iota: 'Ι',
		Iscr: 'ℐ',
		imagline: 'ℐ',
		Itilde: 'Ĩ',
		Iukcy: 'І',
		Iuml: 'Ï',
		Jcirc: 'Ĵ',
		Jcy: 'Й',
		Jfr: '𝔍',
		Jopf: '𝕁',
		Jscr: '𝒥',
		Jsercy: 'Ј',
		Jukcy: 'Є',
		KHcy: 'Х',
		KJcy: 'Ќ',
		Kappa: 'Κ',
		Kcedil: 'Ķ',
		Kcy: 'К',
		Kfr: '𝔎',
		Kopf: '𝕂',
		Kscr: '𝒦',
		LJcy: 'Љ',
		LT: '<',
		lt: '<',
		Lacute: 'Ĺ',
		Lambda: 'Λ',
		Lang: '⟪',
		Laplacetrf: 'ℒ',
		Lscr: 'ℒ',
		lagran: 'ℒ',
		Larr: '↞',
		twoheadleftarrow: '↞',
		Lcaron: 'Ľ',
		Lcedil: 'Ļ',
		Lcy: 'Л',
		LeftAngleBracket: '⟨',
		lang: '⟨',
		langle: '⟨',
		LeftArrow: '←',
		ShortLeftArrow: '←',
		larr: '←',
		leftarrow: '←',
		slarr: '←',
		LeftArrowBar: '⇤',
		larrb: '⇤',
		LeftArrowRightArrow: '⇆',
		leftrightarrows: '⇆',
		lrarr: '⇆',
		LeftCeiling: '⌈',
		lceil: '⌈',
		LeftDoubleBracket: '⟦',
		lobrk: '⟦',
		LeftDownTeeVector: '⥡',
		LeftDownVector: '⇃',
		dharl: '⇃',
		downharpoonleft: '⇃',
		LeftDownVectorBar: '⥙',
		LeftFloor: '⌊',
		lfloor: '⌊',
		LeftRightArrow: '↔',
		harr: '↔',
		leftrightarrow: '↔',
		LeftRightVector: '⥎',
		LeftTee: '⊣',
		dashv: '⊣',
		LeftTeeArrow: '↤',
		mapstoleft: '↤',
		LeftTeeVector: '⥚',
		LeftTriangle: '⊲',
		vartriangleleft: '⊲',
		vltri: '⊲',
		LeftTriangleBar: '⧏',
		LeftTriangleEqual: '⊴',
		ltrie: '⊴',
		trianglelefteq: '⊴',
		LeftUpDownVector: '⥑',
		LeftUpTeeVector: '⥠',
		LeftUpVector: '↿',
		uharl: '↿',
		upharpoonleft: '↿',
		LeftUpVectorBar: '⥘',
		LeftVector: '↼',
		leftharpoonup: '↼',
		lharu: '↼',
		LeftVectorBar: '⥒',
		LessEqualGreater: '⋚',
		leg: '⋚',
		lesseqgtr: '⋚',
		LessFullEqual: '≦',
		lE: '≦',
		leqq: '≦',
		LessGreater: '≶',
		lessgtr: '≶',
		lg: '≶',
		LessLess: '⪡',
		LessSlantEqual: '⩽',
		leqslant: '⩽',
		les: '⩽',
		LessTilde: '≲',
		lesssim: '≲',
		lsim: '≲',
		Lfr: '𝔏',
		Ll: '⋘',
		Lleftarrow: '⇚',
		lAarr: '⇚',
		Lmidot: 'Ŀ',
		LongLeftArrow: '⟵',
		longleftarrow: '⟵',
		xlarr: '⟵',
		LongLeftRightArrow: '⟷',
		longleftrightarrow: '⟷',
		xharr: '⟷',
		LongRightArrow: '⟶',
		longrightarrow: '⟶',
		xrarr: '⟶',
		Lopf: '𝕃',
		LowerLeftArrow: '↙',
		swarr: '↙',
		swarrow: '↙',
		LowerRightArrow: '↘',
		searr: '↘',
		searrow: '↘',
		Lsh: '↰',
		lsh: '↰',
		Lstrok: 'Ł',
		Lt: '≪',
		NestedLessLess: '≪',
		ll: '≪',
		Map: '⤅',
		Mcy: 'М',
		MediumSpace: ' ',
		Mellintrf: 'ℳ',
		Mscr: 'ℳ',
		phmmat: 'ℳ',
		Mfr: '𝔐',
		MinusPlus: '∓',
		mnplus: '∓',
		mp: '∓',
		Mopf: '𝕄',
		Mu: 'Μ',
		NJcy: 'Њ',
		Nacute: 'Ń',
		Ncaron: 'Ň',
		Ncedil: 'Ņ',
		Ncy: 'Н',
		NegativeMediumSpace: '​',
		NegativeThickSpace: '​',
		NegativeThinSpace: '​',
		NegativeVeryThinSpace: '​',
		ZeroWidthSpace: '​',
		NewLine: `
`,
		Nfr: '𝔑',
		NoBreak: '⁠',
		NonBreakingSpace: ' ',
		nbsp: ' ',
		Nopf: 'ℕ',
		naturals: 'ℕ',
		Not: '⫬',
		NotCongruent: '≢',
		nequiv: '≢',
		NotCupCap: '≭',
		NotDoubleVerticalBar: '∦',
		npar: '∦',
		nparallel: '∦',
		nshortparallel: '∦',
		nspar: '∦',
		NotElement: '∉',
		notin: '∉',
		notinva: '∉',
		NotEqual: '≠',
		ne: '≠',
		NotEqualTilde: '≂̸',
		nesim: '≂̸',
		NotExists: '∄',
		nexist: '∄',
		nexists: '∄',
		NotGreater: '≯',
		ngt: '≯',
		ngtr: '≯',
		NotGreaterEqual: '≱',
		nge: '≱',
		ngeq: '≱',
		NotGreaterFullEqual: '≧̸',
		ngE: '≧̸',
		ngeqq: '≧̸',
		NotGreaterGreater: '≫̸',
		nGtv: '≫̸',
		NotGreaterLess: '≹',
		ntgl: '≹',
		NotGreaterSlantEqual: '⩾̸',
		ngeqslant: '⩾̸',
		nges: '⩾̸',
		NotGreaterTilde: '≵',
		ngsim: '≵',
		NotHumpDownHump: '≎̸',
		nbump: '≎̸',
		NotHumpEqual: '≏̸',
		nbumpe: '≏̸',
		NotLeftTriangle: '⋪',
		nltri: '⋪',
		ntriangleleft: '⋪',
		NotLeftTriangleBar: '⧏̸',
		NotLeftTriangleEqual: '⋬',
		nltrie: '⋬',
		ntrianglelefteq: '⋬',
		NotLess: '≮',
		nless: '≮',
		nlt: '≮',
		NotLessEqual: '≰',
		nle: '≰',
		nleq: '≰',
		NotLessGreater: '≸',
		ntlg: '≸',
		NotLessLess: '≪̸',
		nLtv: '≪̸',
		NotLessSlantEqual: '⩽̸',
		nleqslant: '⩽̸',
		nles: '⩽̸',
		NotLessTilde: '≴',
		nlsim: '≴',
		NotNestedGreaterGreater: '⪢̸',
		NotNestedLessLess: '⪡̸',
		NotPrecedes: '⊀',
		npr: '⊀',
		nprec: '⊀',
		NotPrecedesEqual: '⪯̸',
		npre: '⪯̸',
		npreceq: '⪯̸',
		NotPrecedesSlantEqual: '⋠',
		nprcue: '⋠',
		NotReverseElement: '∌',
		notni: '∌',
		notniva: '∌',
		NotRightTriangle: '⋫',
		nrtri: '⋫',
		ntriangleright: '⋫',
		NotRightTriangleBar: '⧐̸',
		NotRightTriangleEqual: '⋭',
		nrtrie: '⋭',
		ntrianglerighteq: '⋭',
		NotSquareSubset: '⊏̸',
		NotSquareSubsetEqual: '⋢',
		nsqsube: '⋢',
		NotSquareSuperset: '⊐̸',
		NotSquareSupersetEqual: '⋣',
		nsqsupe: '⋣',
		NotSubset: '⊂⃒',
		nsubset: '⊂⃒',
		vnsub: '⊂⃒',
		NotSubsetEqual: '⊈',
		nsube: '⊈',
		nsubseteq: '⊈',
		NotSucceeds: '⊁',
		nsc: '⊁',
		nsucc: '⊁',
		NotSucceedsEqual: '⪰̸',
		nsce: '⪰̸',
		nsucceq: '⪰̸',
		NotSucceedsSlantEqual: '⋡',
		nsccue: '⋡',
		NotSucceedsTilde: '≿̸',
		NotSuperset: '⊃⃒',
		nsupset: '⊃⃒',
		vnsup: '⊃⃒',
		NotSupersetEqual: '⊉',
		nsupe: '⊉',
		nsupseteq: '⊉',
		NotTilde: '≁',
		nsim: '≁',
		NotTildeEqual: '≄',
		nsime: '≄',
		nsimeq: '≄',
		NotTildeFullEqual: '≇',
		ncong: '≇',
		NotTildeTilde: '≉',
		nap: '≉',
		napprox: '≉',
		NotVerticalBar: '∤',
		nmid: '∤',
		nshortmid: '∤',
		nsmid: '∤',
		Nscr: '𝒩',
		Ntilde: 'Ñ',
		Nu: 'Ν',
		OElig: 'Œ',
		Oacute: 'Ó',
		Ocirc: 'Ô',
		Ocy: 'О',
		Odblac: 'Ő',
		Ofr: '𝔒',
		Ograve: 'Ò',
		Omacr: 'Ō',
		Omega: 'Ω',
		ohm: 'Ω',
		Omicron: 'Ο',
		Oopf: '𝕆',
		OpenCurlyDoubleQuote: '“',
		ldquo: '“',
		OpenCurlyQuote: '‘',
		lsquo: '‘',
		Or: '⩔',
		Oscr: '𝒪',
		Oslash: 'Ø',
		Otilde: 'Õ',
		Otimes: '⨷',
		Ouml: 'Ö',
		OverBar: '‾',
		oline: '‾',
		OverBrace: '⏞',
		OverBracket: '⎴',
		tbrk: '⎴',
		OverParenthesis: '⏜',
		PartialD: '∂',
		part: '∂',
		Pcy: 'П',
		Pfr: '𝔓',
		Phi: 'Φ',
		Pi: 'Π',
		PlusMinus: '±',
		plusmn: '±',
		pm: '±',
		Popf: 'ℙ',
		primes: 'ℙ',
		Pr: '⪻',
		Precedes: '≺',
		pr: '≺',
		prec: '≺',
		PrecedesEqual: '⪯',
		pre: '⪯',
		preceq: '⪯',
		PrecedesSlantEqual: '≼',
		prcue: '≼',
		preccurlyeq: '≼',
		PrecedesTilde: '≾',
		precsim: '≾',
		prsim: '≾',
		Prime: '″',
		Product: '∏',
		prod: '∏',
		Proportional: '∝',
		prop: '∝',
		propto: '∝',
		varpropto: '∝',
		vprop: '∝',
		Pscr: '𝒫',
		Psi: 'Ψ',
		QUOT: '"',
		quot: '"',
		Qfr: '𝔔',
		Qopf: 'ℚ',
		rationals: 'ℚ',
		Qscr: '𝒬',
		RBarr: '⤐',
		drbkarow: '⤐',
		REG: '®',
		circledR: '®',
		reg: '®',
		Racute: 'Ŕ',
		Rang: '⟫',
		Rarr: '↠',
		twoheadrightarrow: '↠',
		Rarrtl: '⤖',
		Rcaron: 'Ř',
		Rcedil: 'Ŗ',
		Rcy: 'Р',
		Re: 'ℜ',
		Rfr: 'ℜ',
		real: 'ℜ',
		realpart: 'ℜ',
		ReverseElement: '∋',
		SuchThat: '∋',
		ni: '∋',
		niv: '∋',
		ReverseEquilibrium: '⇋',
		leftrightharpoons: '⇋',
		lrhar: '⇋',
		ReverseUpEquilibrium: '⥯',
		duhar: '⥯',
		Rho: 'Ρ',
		RightAngleBracket: '⟩',
		rang: '⟩',
		rangle: '⟩',
		RightArrow: '→',
		ShortRightArrow: '→',
		rarr: '→',
		rightarrow: '→',
		srarr: '→',
		RightArrowBar: '⇥',
		rarrb: '⇥',
		RightArrowLeftArrow: '⇄',
		rightleftarrows: '⇄',
		rlarr: '⇄',
		RightCeiling: '⌉',
		rceil: '⌉',
		RightDoubleBracket: '⟧',
		robrk: '⟧',
		RightDownTeeVector: '⥝',
		RightDownVector: '⇂',
		dharr: '⇂',
		downharpoonright: '⇂',
		RightDownVectorBar: '⥕',
		RightFloor: '⌋',
		rfloor: '⌋',
		RightTee: '⊢',
		vdash: '⊢',
		RightTeeArrow: '↦',
		map: '↦',
		mapsto: '↦',
		RightTeeVector: '⥛',
		RightTriangle: '⊳',
		vartriangleright: '⊳',
		vrtri: '⊳',
		RightTriangleBar: '⧐',
		RightTriangleEqual: '⊵',
		rtrie: '⊵',
		trianglerighteq: '⊵',
		RightUpDownVector: '⥏',
		RightUpTeeVector: '⥜',
		RightUpVector: '↾',
		uharr: '↾',
		upharpoonright: '↾',
		RightUpVectorBar: '⥔',
		RightVector: '⇀',
		rharu: '⇀',
		rightharpoonup: '⇀',
		RightVectorBar: '⥓',
		Ropf: 'ℝ',
		reals: 'ℝ',
		RoundImplies: '⥰',
		Rrightarrow: '⇛',
		rAarr: '⇛',
		Rscr: 'ℛ',
		realine: 'ℛ',
		Rsh: '↱',
		rsh: '↱',
		RuleDelayed: '⧴',
		SHCHcy: 'Щ',
		SHcy: 'Ш',
		SOFTcy: 'Ь',
		Sacute: 'Ś',
		Sc: '⪼',
		Scaron: 'Š',
		Scedil: 'Ş',
		Scirc: 'Ŝ',
		Scy: 'С',
		Sfr: '𝔖',
		ShortUpArrow: '↑',
		UpArrow: '↑',
		uarr: '↑',
		uparrow: '↑',
		Sigma: 'Σ',
		SmallCircle: '∘',
		compfn: '∘',
		Sopf: '𝕊',
		Sqrt: '√',
		radic: '√',
		Square: '□',
		squ: '□',
		square: '□',
		SquareIntersection: '⊓',
		sqcap: '⊓',
		SquareSubset: '⊏',
		sqsub: '⊏',
		sqsubset: '⊏',
		SquareSubsetEqual: '⊑',
		sqsube: '⊑',
		sqsubseteq: '⊑',
		SquareSuperset: '⊐',
		sqsup: '⊐',
		sqsupset: '⊐',
		SquareSupersetEqual: '⊒',
		sqsupe: '⊒',
		sqsupseteq: '⊒',
		SquareUnion: '⊔',
		sqcup: '⊔',
		Sscr: '𝒮',
		Star: '⋆',
		sstarf: '⋆',
		Sub: '⋐',
		Subset: '⋐',
		SubsetEqual: '⊆',
		sube: '⊆',
		subseteq: '⊆',
		Succeeds: '≻',
		sc: '≻',
		succ: '≻',
		SucceedsEqual: '⪰',
		sce: '⪰',
		succeq: '⪰',
		SucceedsSlantEqual: '≽',
		sccue: '≽',
		succcurlyeq: '≽',
		SucceedsTilde: '≿',
		scsim: '≿',
		succsim: '≿',
		Sum: '∑',
		sum: '∑',
		Sup: '⋑',
		Supset: '⋑',
		Superset: '⊃',
		sup: '⊃',
		supset: '⊃',
		SupersetEqual: '⊇',
		supe: '⊇',
		supseteq: '⊇',
		THORN: 'Þ',
		TRADE: '™',
		trade: '™',
		TSHcy: 'Ћ',
		TScy: 'Ц',
		Tab: '	',
		Tau: 'Τ',
		Tcaron: 'Ť',
		Tcedil: 'Ţ',
		Tcy: 'Т',
		Tfr: '𝔗',
		Therefore: '∴',
		there4: '∴',
		therefore: '∴',
		Theta: 'Θ',
		ThickSpace: '  ',
		ThinSpace: ' ',
		thinsp: ' ',
		Tilde: '∼',
		sim: '∼',
		thicksim: '∼',
		thksim: '∼',
		TildeEqual: '≃',
		sime: '≃',
		simeq: '≃',
		TildeFullEqual: '≅',
		cong: '≅',
		TildeTilde: '≈',
		ap: '≈',
		approx: '≈',
		asymp: '≈',
		thickapprox: '≈',
		thkap: '≈',
		Topf: '𝕋',
		TripleDot: '⃛',
		tdot: '⃛',
		Tscr: '𝒯',
		Tstrok: 'Ŧ',
		Uacute: 'Ú',
		Uarr: '↟',
		Uarrocir: '⥉',
		Ubrcy: 'Ў',
		Ubreve: 'Ŭ',
		Ucirc: 'Û',
		Ucy: 'У',
		Udblac: 'Ű',
		Ufr: '𝔘',
		Ugrave: 'Ù',
		Umacr: 'Ū',
		UnderBar: '_',
		lowbar: '_',
		UnderBrace: '⏟',
		UnderBracket: '⎵',
		bbrk: '⎵',
		UnderParenthesis: '⏝',
		Union: '⋃',
		bigcup: '⋃',
		xcup: '⋃',
		UnionPlus: '⊎',
		uplus: '⊎',
		Uogon: 'Ų',
		Uopf: '𝕌',
		UpArrowBar: '⤒',
		UpArrowDownArrow: '⇅',
		udarr: '⇅',
		UpDownArrow: '↕',
		updownarrow: '↕',
		varr: '↕',
		UpEquilibrium: '⥮',
		udhar: '⥮',
		UpTee: '⊥',
		bot: '⊥',
		bottom: '⊥',
		perp: '⊥',
		UpTeeArrow: '↥',
		mapstoup: '↥',
		UpperLeftArrow: '↖',
		nwarr: '↖',
		nwarrow: '↖',
		UpperRightArrow: '↗',
		nearr: '↗',
		nearrow: '↗',
		Upsi: 'ϒ',
		upsih: 'ϒ',
		Upsilon: 'Υ',
		Uring: 'Ů',
		Uscr: '𝒰',
		Utilde: 'Ũ',
		Uuml: 'Ü',
		VDash: '⊫',
		Vbar: '⫫',
		Vcy: 'В',
		Vdash: '⊩',
		Vdashl: '⫦',
		Vee: '⋁',
		bigvee: '⋁',
		xvee: '⋁',
		Verbar: '‖',
		Vert: '‖',
		VerticalBar: '∣',
		mid: '∣',
		shortmid: '∣',
		smid: '∣',
		VerticalLine: '|',
		verbar: '|',
		vert: '|',
		VerticalSeparator: '❘',
		VerticalTilde: '≀',
		wr: '≀',
		wreath: '≀',
		VeryThinSpace: ' ',
		hairsp: ' ',
		Vfr: '𝔙',
		Vopf: '𝕍',
		Vscr: '𝒱',
		Vvdash: '⊪',
		Wcirc: 'Ŵ',
		Wedge: '⋀',
		bigwedge: '⋀',
		xwedge: '⋀',
		Wfr: '𝔚',
		Wopf: '𝕎',
		Wscr: '𝒲',
		Xfr: '𝔛',
		Xi: 'Ξ',
		Xopf: '𝕏',
		Xscr: '𝒳',
		YAcy: 'Я',
		YIcy: 'Ї',
		YUcy: 'Ю',
		Yacute: 'Ý',
		Ycirc: 'Ŷ',
		Ycy: 'Ы',
		Yfr: '𝔜',
		Yopf: '𝕐',
		Yscr: '𝒴',
		Yuml: 'Ÿ',
		ZHcy: 'Ж',
		Zacute: 'Ź',
		Zcaron: 'Ž',
		Zcy: 'З',
		Zdot: 'Ż',
		Zeta: 'Ζ',
		Zfr: 'ℨ',
		zeetrf: 'ℨ',
		Zopf: 'ℤ',
		integers: 'ℤ',
		Zscr: '𝒵',
		aacute: 'á',
		abreve: 'ă',
		ac: '∾',
		mstpos: '∾',
		acE: '∾̳',
		acd: '∿',
		acirc: 'â',
		acy: 'а',
		aelig: 'æ',
		afr: '𝔞',
		agrave: 'à',
		alefsym: 'ℵ',
		aleph: 'ℵ',
		alpha: 'α',
		amacr: 'ā',
		amalg: '⨿',
		and: '∧',
		wedge: '∧',
		andand: '⩕',
		andd: '⩜',
		andslope: '⩘',
		andv: '⩚',
		ang: '∠',
		angle: '∠',
		ange: '⦤',
		angmsd: '∡',
		measuredangle: '∡',
		angmsdaa: '⦨',
		angmsdab: '⦩',
		angmsdac: '⦪',
		angmsdad: '⦫',
		angmsdae: '⦬',
		angmsdaf: '⦭',
		angmsdag: '⦮',
		angmsdah: '⦯',
		angrt: '∟',
		angrtvb: '⊾',
		angrtvbd: '⦝',
		angsph: '∢',
		angzarr: '⍼',
		aogon: 'ą',
		aopf: '𝕒',
		apE: '⩰',
		apacir: '⩯',
		ape: '≊',
		approxeq: '≊',
		apid: '≋',
		apos: "'",
		aring: 'å',
		ascr: '𝒶',
		ast: '*',
		midast: '*',
		atilde: 'ã',
		auml: 'ä',
		awint: '⨑',
		bNot: '⫭',
		backcong: '≌',
		bcong: '≌',
		backepsilon: '϶',
		bepsi: '϶',
		backprime: '‵',
		bprime: '‵',
		backsim: '∽',
		bsim: '∽',
		backsimeq: '⋍',
		bsime: '⋍',
		barvee: '⊽',
		barwed: '⌅',
		barwedge: '⌅',
		bbrktbrk: '⎶',
		bcy: 'б',
		bdquo: '„',
		ldquor: '„',
		bemptyv: '⦰',
		beta: 'β',
		beth: 'ℶ',
		between: '≬',
		twixt: '≬',
		bfr: '𝔟',
		bigcirc: '◯',
		xcirc: '◯',
		bigodot: '⨀',
		xodot: '⨀',
		bigoplus: '⨁',
		xoplus: '⨁',
		bigotimes: '⨂',
		xotime: '⨂',
		bigsqcup: '⨆',
		xsqcup: '⨆',
		bigstar: '★',
		starf: '★',
		bigtriangledown: '▽',
		xdtri: '▽',
		bigtriangleup: '△',
		xutri: '△',
		biguplus: '⨄',
		xuplus: '⨄',
		bkarow: '⤍',
		rbarr: '⤍',
		blacklozenge: '⧫',
		lozf: '⧫',
		blacktriangle: '▴',
		utrif: '▴',
		blacktriangledown: '▾',
		dtrif: '▾',
		blacktriangleleft: '◂',
		ltrif: '◂',
		blacktriangleright: '▸',
		rtrif: '▸',
		blank: '␣',
		blk12: '▒',
		blk14: '░',
		blk34: '▓',
		block: '█',
		bne: '=⃥',
		bnequiv: '≡⃥',
		bnot: '⌐',
		bopf: '𝕓',
		bowtie: '⋈',
		boxDL: '╗',
		boxDR: '╔',
		boxDl: '╖',
		boxDr: '╓',
		boxH: '═',
		boxHD: '╦',
		boxHU: '╩',
		boxHd: '╤',
		boxHu: '╧',
		boxUL: '╝',
		boxUR: '╚',
		boxUl: '╜',
		boxUr: '╙',
		boxV: '║',
		boxVH: '╬',
		boxVL: '╣',
		boxVR: '╠',
		boxVh: '╫',
		boxVl: '╢',
		boxVr: '╟',
		boxbox: '⧉',
		boxdL: '╕',
		boxdR: '╒',
		boxdl: '┐',
		boxdr: '┌',
		boxhD: '╥',
		boxhU: '╨',
		boxhd: '┬',
		boxhu: '┴',
		boxminus: '⊟',
		minusb: '⊟',
		boxplus: '⊞',
		plusb: '⊞',
		boxtimes: '⊠',
		timesb: '⊠',
		boxuL: '╛',
		boxuR: '╘',
		boxul: '┘',
		boxur: '└',
		boxv: '│',
		boxvH: '╪',
		boxvL: '╡',
		boxvR: '╞',
		boxvh: '┼',
		boxvl: '┤',
		boxvr: '├',
		brvbar: '¦',
		bscr: '𝒷',
		bsemi: '⁏',
		bsol: '\\',
		bsolb: '⧅',
		bsolhsub: '⟈',
		bull: '•',
		bullet: '•',
		bumpE: '⪮',
		cacute: 'ć',
		cap: '∩',
		capand: '⩄',
		capbrcup: '⩉',
		capcap: '⩋',
		capcup: '⩇',
		capdot: '⩀',
		caps: '∩︀',
		caret: '⁁',
		ccaps: '⩍',
		ccaron: 'č',
		ccedil: 'ç',
		ccirc: 'ĉ',
		ccups: '⩌',
		ccupssm: '⩐',
		cdot: 'ċ',
		cemptyv: '⦲',
		cent: '¢',
		cfr: '𝔠',
		chcy: 'ч',
		check: '✓',
		checkmark: '✓',
		chi: 'χ',
		cir: '○',
		cirE: '⧃',
		circ: 'ˆ',
		circeq: '≗',
		cire: '≗',
		circlearrowleft: '↺',
		olarr: '↺',
		circlearrowright: '↻',
		orarr: '↻',
		circledS: 'Ⓢ',
		oS: 'Ⓢ',
		circledast: '⊛',
		oast: '⊛',
		circledcirc: '⊚',
		ocir: '⊚',
		circleddash: '⊝',
		odash: '⊝',
		cirfnint: '⨐',
		cirmid: '⫯',
		cirscir: '⧂',
		clubs: '♣',
		clubsuit: '♣',
		colon: ':',
		comma: ',',
		commat: '@',
		comp: '∁',
		complement: '∁',
		congdot: '⩭',
		copf: '𝕔',
		copysr: '℗',
		crarr: '↵',
		cross: '✗',
		cscr: '𝒸',
		csub: '⫏',
		csube: '⫑',
		csup: '⫐',
		csupe: '⫒',
		ctdot: '⋯',
		cudarrl: '⤸',
		cudarrr: '⤵',
		cuepr: '⋞',
		curlyeqprec: '⋞',
		cuesc: '⋟',
		curlyeqsucc: '⋟',
		cularr: '↶',
		curvearrowleft: '↶',
		cularrp: '⤽',
		cup: '∪',
		cupbrcap: '⩈',
		cupcap: '⩆',
		cupcup: '⩊',
		cupdot: '⊍',
		cupor: '⩅',
		cups: '∪︀',
		curarr: '↷',
		curvearrowright: '↷',
		curarrm: '⤼',
		curlyvee: '⋎',
		cuvee: '⋎',
		curlywedge: '⋏',
		cuwed: '⋏',
		curren: '¤',
		cwint: '∱',
		cylcty: '⌭',
		dHar: '⥥',
		dagger: '†',
		daleth: 'ℸ',
		dash: '‐',
		hyphen: '‐',
		dbkarow: '⤏',
		rBarr: '⤏',
		dcaron: 'ď',
		dcy: 'д',
		ddarr: '⇊',
		downdownarrows: '⇊',
		ddotseq: '⩷',
		eDDot: '⩷',
		deg: '°',
		delta: 'δ',
		demptyv: '⦱',
		dfisht: '⥿',
		dfr: '𝔡',
		diamondsuit: '♦',
		diams: '♦',
		digamma: 'ϝ',
		gammad: 'ϝ',
		disin: '⋲',
		div: '÷',
		divide: '÷',
		divideontimes: '⋇',
		divonx: '⋇',
		djcy: 'ђ',
		dlcorn: '⌞',
		llcorner: '⌞',
		dlcrop: '⌍',
		dollar: '$',
		dopf: '𝕕',
		doteqdot: '≑',
		eDot: '≑',
		dotminus: '∸',
		minusd: '∸',
		dotplus: '∔',
		plusdo: '∔',
		dotsquare: '⊡',
		sdotb: '⊡',
		drcorn: '⌟',
		lrcorner: '⌟',
		drcrop: '⌌',
		dscr: '𝒹',
		dscy: 'ѕ',
		dsol: '⧶',
		dstrok: 'đ',
		dtdot: '⋱',
		dtri: '▿',
		triangledown: '▿',
		dwangle: '⦦',
		dzcy: 'џ',
		dzigrarr: '⟿',
		eacute: 'é',
		easter: '⩮',
		ecaron: 'ě',
		ecir: '≖',
		eqcirc: '≖',
		ecirc: 'ê',
		ecolon: '≕',
		eqcolon: '≕',
		ecy: 'э',
		edot: 'ė',
		efDot: '≒',
		fallingdotseq: '≒',
		efr: '𝔢',
		eg: '⪚',
		egrave: 'è',
		egs: '⪖',
		eqslantgtr: '⪖',
		egsdot: '⪘',
		el: '⪙',
		elinters: '⏧',
		ell: 'ℓ',
		els: '⪕',
		eqslantless: '⪕',
		elsdot: '⪗',
		emacr: 'ē',
		empty: '∅',
		emptyset: '∅',
		emptyv: '∅',
		varnothing: '∅',
		emsp13: ' ',
		emsp14: ' ',
		emsp: ' ',
		eng: 'ŋ',
		ensp: ' ',
		eogon: 'ę',
		eopf: '𝕖',
		epar: '⋕',
		eparsl: '⧣',
		eplus: '⩱',
		epsi: 'ε',
		epsilon: 'ε',
		epsiv: 'ϵ',
		straightepsilon: 'ϵ',
		varepsilon: 'ϵ',
		equals: '=',
		equest: '≟',
		questeq: '≟',
		equivDD: '⩸',
		eqvparsl: '⧥',
		erDot: '≓',
		risingdotseq: '≓',
		erarr: '⥱',
		escr: 'ℯ',
		eta: 'η',
		eth: 'ð',
		euml: 'ë',
		euro: '€',
		excl: '!',
		fcy: 'ф',
		female: '♀',
		ffilig: 'ﬃ',
		fflig: 'ﬀ',
		ffllig: 'ﬄ',
		ffr: '𝔣',
		filig: 'ﬁ',
		fjlig: 'fj',
		flat: '♭',
		fllig: 'ﬂ',
		fltns: '▱',
		fnof: 'ƒ',
		fopf: '𝕗',
		fork: '⋔',
		pitchfork: '⋔',
		forkv: '⫙',
		fpartint: '⨍',
		frac12: '½',
		half: '½',
		frac13: '⅓',
		frac14: '¼',
		frac15: '⅕',
		frac16: '⅙',
		frac18: '⅛',
		frac23: '⅔',
		frac25: '⅖',
		frac34: '¾',
		frac35: '⅗',
		frac38: '⅜',
		frac45: '⅘',
		frac56: '⅚',
		frac58: '⅝',
		frac78: '⅞',
		frasl: '⁄',
		frown: '⌢',
		sfrown: '⌢',
		fscr: '𝒻',
		gEl: '⪌',
		gtreqqless: '⪌',
		gacute: 'ǵ',
		gamma: 'γ',
		gap: '⪆',
		gtrapprox: '⪆',
		gbreve: 'ğ',
		gcirc: 'ĝ',
		gcy: 'г',
		gdot: 'ġ',
		gescc: '⪩',
		gesdot: '⪀',
		gesdoto: '⪂',
		gesdotol: '⪄',
		gesl: '⋛︀',
		gesles: '⪔',
		gfr: '𝔤',
		gimel: 'ℷ',
		gjcy: 'ѓ',
		glE: '⪒',
		gla: '⪥',
		glj: '⪤',
		gnE: '≩',
		gneqq: '≩',
		gnap: '⪊',
		gnapprox: '⪊',
		gne: '⪈',
		gneq: '⪈',
		gnsim: '⋧',
		gopf: '𝕘',
		gscr: 'ℊ',
		gsime: '⪎',
		gsiml: '⪐',
		gtcc: '⪧',
		gtcir: '⩺',
		gtdot: '⋗',
		gtrdot: '⋗',
		gtlPar: '⦕',
		gtquest: '⩼',
		gtrarr: '⥸',
		gvertneqq: '≩︀',
		gvnE: '≩︀',
		hardcy: 'ъ',
		harrcir: '⥈',
		harrw: '↭',
		leftrightsquigarrow: '↭',
		hbar: 'ℏ',
		hslash: 'ℏ',
		planck: 'ℏ',
		plankv: 'ℏ',
		hcirc: 'ĥ',
		hearts: '♥',
		heartsuit: '♥',
		hellip: '…',
		mldr: '…',
		hercon: '⊹',
		hfr: '𝔥',
		hksearow: '⤥',
		searhk: '⤥',
		hkswarow: '⤦',
		swarhk: '⤦',
		hoarr: '⇿',
		homtht: '∻',
		hookleftarrow: '↩',
		larrhk: '↩',
		hookrightarrow: '↪',
		rarrhk: '↪',
		hopf: '𝕙',
		horbar: '―',
		hscr: '𝒽',
		hstrok: 'ħ',
		hybull: '⁃',
		iacute: 'í',
		icirc: 'î',
		icy: 'и',
		iecy: 'е',
		iexcl: '¡',
		ifr: '𝔦',
		igrave: 'ì',
		iiiint: '⨌',
		qint: '⨌',
		iiint: '∭',
		tint: '∭',
		iinfin: '⧜',
		iiota: '℩',
		ijlig: 'ĳ',
		imacr: 'ī',
		imath: 'ı',
		inodot: 'ı',
		imof: '⊷',
		imped: 'Ƶ',
		incare: '℅',
		infin: '∞',
		infintie: '⧝',
		intcal: '⊺',
		intercal: '⊺',
		intlarhk: '⨗',
		intprod: '⨼',
		iprod: '⨼',
		iocy: 'ё',
		iogon: 'į',
		iopf: '𝕚',
		iota: 'ι',
		iquest: '¿',
		iscr: '𝒾',
		isinE: '⋹',
		isindot: '⋵',
		isins: '⋴',
		isinsv: '⋳',
		itilde: 'ĩ',
		iukcy: 'і',
		iuml: 'ï',
		jcirc: 'ĵ',
		jcy: 'й',
		jfr: '𝔧',
		jmath: 'ȷ',
		jopf: '𝕛',
		jscr: '𝒿',
		jsercy: 'ј',
		jukcy: 'є',
		kappa: 'κ',
		kappav: 'ϰ',
		varkappa: 'ϰ',
		kcedil: 'ķ',
		kcy: 'к',
		kfr: '𝔨',
		kgreen: 'ĸ',
		khcy: 'х',
		kjcy: 'ќ',
		kopf: '𝕜',
		kscr: '𝓀',
		lAtail: '⤛',
		lBarr: '⤎',
		lEg: '⪋',
		lesseqqgtr: '⪋',
		lHar: '⥢',
		lacute: 'ĺ',
		laemptyv: '⦴',
		lambda: 'λ',
		langd: '⦑',
		lap: '⪅',
		lessapprox: '⪅',
		laquo: '«',
		larrbfs: '⤟',
		larrfs: '⤝',
		larrlp: '↫',
		looparrowleft: '↫',
		larrpl: '⤹',
		larrsim: '⥳',
		larrtl: '↢',
		leftarrowtail: '↢',
		lat: '⪫',
		latail: '⤙',
		late: '⪭',
		lates: '⪭︀',
		lbarr: '⤌',
		lbbrk: '❲',
		lbrace: '{',
		lcub: '{',
		lbrack: '[',
		lsqb: '[',
		lbrke: '⦋',
		lbrksld: '⦏',
		lbrkslu: '⦍',
		lcaron: 'ľ',
		lcedil: 'ļ',
		lcy: 'л',
		ldca: '⤶',
		ldrdhar: '⥧',
		ldrushar: '⥋',
		ldsh: '↲',
		le: '≤',
		leq: '≤',
		leftleftarrows: '⇇',
		llarr: '⇇',
		leftthreetimes: '⋋',
		lthree: '⋋',
		lescc: '⪨',
		lesdot: '⩿',
		lesdoto: '⪁',
		lesdotor: '⪃',
		lesg: '⋚︀',
		lesges: '⪓',
		lessdot: '⋖',
		ltdot: '⋖',
		lfisht: '⥼',
		lfr: '𝔩',
		lgE: '⪑',
		lharul: '⥪',
		lhblk: '▄',
		ljcy: 'љ',
		llhard: '⥫',
		lltri: '◺',
		lmidot: 'ŀ',
		lmoust: '⎰',
		lmoustache: '⎰',
		lnE: '≨',
		lneqq: '≨',
		lnap: '⪉',
		lnapprox: '⪉',
		lne: '⪇',
		lneq: '⪇',
		lnsim: '⋦',
		loang: '⟬',
		loarr: '⇽',
		longmapsto: '⟼',
		xmap: '⟼',
		looparrowright: '↬',
		rarrlp: '↬',
		lopar: '⦅',
		lopf: '𝕝',
		loplus: '⨭',
		lotimes: '⨴',
		lowast: '∗',
		loz: '◊',
		lozenge: '◊',
		lpar: '(',
		lparlt: '⦓',
		lrhard: '⥭',
		lrm: '‎',
		lrtri: '⊿',
		lsaquo: '‹',
		lscr: '𝓁',
		lsime: '⪍',
		lsimg: '⪏',
		lsquor: '‚',
		sbquo: '‚',
		lstrok: 'ł',
		ltcc: '⪦',
		ltcir: '⩹',
		ltimes: '⋉',
		ltlarr: '⥶',
		ltquest: '⩻',
		ltrPar: '⦖',
		ltri: '◃',
		triangleleft: '◃',
		lurdshar: '⥊',
		luruhar: '⥦',
		lvertneqq: '≨︀',
		lvnE: '≨︀',
		mDDot: '∺',
		macr: '¯',
		strns: '¯',
		male: '♂',
		malt: '✠',
		maltese: '✠',
		marker: '▮',
		mcomma: '⨩',
		mcy: 'м',
		mdash: '—',
		mfr: '𝔪',
		mho: '℧',
		micro: 'µ',
		midcir: '⫰',
		minus: '−',
		minusdu: '⨪',
		mlcp: '⫛',
		models: '⊧',
		mopf: '𝕞',
		mscr: '𝓂',
		mu: 'μ',
		multimap: '⊸',
		mumap: '⊸',
		nGg: '⋙̸',
		nGt: '≫⃒',
		nLeftarrow: '⇍',
		nlArr: '⇍',
		nLeftrightarrow: '⇎',
		nhArr: '⇎',
		nLl: '⋘̸',
		nLt: '≪⃒',
		nRightarrow: '⇏',
		nrArr: '⇏',
		nVDash: '⊯',
		nVdash: '⊮',
		nacute: 'ń',
		nang: '∠⃒',
		napE: '⩰̸',
		napid: '≋̸',
		napos: 'ŉ',
		natur: '♮',
		natural: '♮',
		ncap: '⩃',
		ncaron: 'ň',
		ncedil: 'ņ',
		ncongdot: '⩭̸',
		ncup: '⩂',
		ncy: 'н',
		ndash: '–',
		neArr: '⇗',
		nearhk: '⤤',
		nedot: '≐̸',
		nesear: '⤨',
		toea: '⤨',
		nfr: '𝔫',
		nharr: '↮',
		nleftrightarrow: '↮',
		nhpar: '⫲',
		nis: '⋼',
		nisd: '⋺',
		njcy: 'њ',
		nlE: '≦̸',
		nleqq: '≦̸',
		nlarr: '↚',
		nleftarrow: '↚',
		nldr: '‥',
		nopf: '𝕟',
		not: '¬',
		notinE: '⋹̸',
		notindot: '⋵̸',
		notinvb: '⋷',
		notinvc: '⋶',
		notnivb: '⋾',
		notnivc: '⋽',
		nparsl: '⫽⃥',
		npart: '∂̸',
		npolint: '⨔',
		nrarr: '↛',
		nrightarrow: '↛',
		nrarrc: '⤳̸',
		nrarrw: '↝̸',
		nscr: '𝓃',
		nsub: '⊄',
		nsubE: '⫅̸',
		nsubseteqq: '⫅̸',
		nsup: '⊅',
		nsupE: '⫆̸',
		nsupseteqq: '⫆̸',
		ntilde: 'ñ',
		nu: 'ν',
		num: '#',
		numero: '№',
		numsp: ' ',
		nvDash: '⊭',
		nvHarr: '⤄',
		nvap: '≍⃒',
		nvdash: '⊬',
		nvge: '≥⃒',
		nvgt: '>⃒',
		nvinfin: '⧞',
		nvlArr: '⤂',
		nvle: '≤⃒',
		nvlt: '<⃒',
		nvltrie: '⊴⃒',
		nvrArr: '⤃',
		nvrtrie: '⊵⃒',
		nvsim: '∼⃒',
		nwArr: '⇖',
		nwarhk: '⤣',
		nwnear: '⤧',
		oacute: 'ó',
		ocirc: 'ô',
		ocy: 'о',
		odblac: 'ő',
		odiv: '⨸',
		odsold: '⦼',
		oelig: 'œ',
		ofcir: '⦿',
		ofr: '𝔬',
		ogon: '˛',
		ograve: 'ò',
		ogt: '⧁',
		ohbar: '⦵',
		olcir: '⦾',
		olcross: '⦻',
		olt: '⧀',
		omacr: 'ō',
		omega: 'ω',
		omicron: 'ο',
		omid: '⦶',
		oopf: '𝕠',
		opar: '⦷',
		operp: '⦹',
		or: '∨',
		vee: '∨',
		ord: '⩝',
		order: 'ℴ',
		orderof: 'ℴ',
		oscr: 'ℴ',
		ordf: 'ª',
		ordm: 'º',
		origof: '⊶',
		oror: '⩖',
		orslope: '⩗',
		orv: '⩛',
		oslash: 'ø',
		osol: '⊘',
		otilde: 'õ',
		otimesas: '⨶',
		ouml: 'ö',
		ovbar: '⌽',
		para: '¶',
		parsim: '⫳',
		parsl: '⫽',
		pcy: 'п',
		percnt: '%',
		period: '.',
		permil: '‰',
		pertenk: '‱',
		pfr: '𝔭',
		phi: 'φ',
		phiv: 'ϕ',
		straightphi: 'ϕ',
		varphi: 'ϕ',
		phone: '☎',
		pi: 'π',
		piv: 'ϖ',
		varpi: 'ϖ',
		planckh: 'ℎ',
		plus: '+',
		plusacir: '⨣',
		pluscir: '⨢',
		plusdu: '⨥',
		pluse: '⩲',
		plussim: '⨦',
		plustwo: '⨧',
		pointint: '⨕',
		popf: '𝕡',
		pound: '£',
		prE: '⪳',
		prap: '⪷',
		precapprox: '⪷',
		precnapprox: '⪹',
		prnap: '⪹',
		precneqq: '⪵',
		prnE: '⪵',
		precnsim: '⋨',
		prnsim: '⋨',
		prime: '′',
		profalar: '⌮',
		profline: '⌒',
		profsurf: '⌓',
		prurel: '⊰',
		pscr: '𝓅',
		psi: 'ψ',
		puncsp: ' ',
		qfr: '𝔮',
		qopf: '𝕢',
		qprime: '⁗',
		qscr: '𝓆',
		quatint: '⨖',
		quest: '?',
		rAtail: '⤜',
		rHar: '⥤',
		race: '∽̱',
		racute: 'ŕ',
		raemptyv: '⦳',
		rangd: '⦒',
		range: '⦥',
		raquo: '»',
		rarrap: '⥵',
		rarrbfs: '⤠',
		rarrc: '⤳',
		rarrfs: '⤞',
		rarrpl: '⥅',
		rarrsim: '⥴',
		rarrtl: '↣',
		rightarrowtail: '↣',
		rarrw: '↝',
		rightsquigarrow: '↝',
		ratail: '⤚',
		ratio: '∶',
		rbbrk: '❳',
		rbrace: '}',
		rcub: '}',
		rbrack: ']',
		rsqb: ']',
		rbrke: '⦌',
		rbrksld: '⦎',
		rbrkslu: '⦐',
		rcaron: 'ř',
		rcedil: 'ŗ',
		rcy: 'р',
		rdca: '⤷',
		rdldhar: '⥩',
		rdsh: '↳',
		rect: '▭',
		rfisht: '⥽',
		rfr: '𝔯',
		rharul: '⥬',
		rho: 'ρ',
		rhov: 'ϱ',
		varrho: 'ϱ',
		rightrightarrows: '⇉',
		rrarr: '⇉',
		rightthreetimes: '⋌',
		rthree: '⋌',
		ring: '˚',
		rlm: '‏',
		rmoust: '⎱',
		rmoustache: '⎱',
		rnmid: '⫮',
		roang: '⟭',
		roarr: '⇾',
		ropar: '⦆',
		ropf: '𝕣',
		roplus: '⨮',
		rotimes: '⨵',
		rpar: ')',
		rpargt: '⦔',
		rppolint: '⨒',
		rsaquo: '›',
		rscr: '𝓇',
		rtimes: '⋊',
		rtri: '▹',
		triangleright: '▹',
		rtriltri: '⧎',
		ruluhar: '⥨',
		rx: '℞',
		sacute: 'ś',
		scE: '⪴',
		scap: '⪸',
		succapprox: '⪸',
		scaron: 'š',
		scedil: 'ş',
		scirc: 'ŝ',
		scnE: '⪶',
		succneqq: '⪶',
		scnap: '⪺',
		succnapprox: '⪺',
		scnsim: '⋩',
		succnsim: '⋩',
		scpolint: '⨓',
		scy: 'с',
		sdot: '⋅',
		sdote: '⩦',
		seArr: '⇘',
		sect: '§',
		semi: ';',
		seswar: '⤩',
		tosa: '⤩',
		sext: '✶',
		sfr: '𝔰',
		sharp: '♯',
		shchcy: 'щ',
		shcy: 'ш',
		shy: '­',
		sigma: 'σ',
		sigmaf: 'ς',
		sigmav: 'ς',
		varsigma: 'ς',
		simdot: '⩪',
		simg: '⪞',
		simgE: '⪠',
		siml: '⪝',
		simlE: '⪟',
		simne: '≆',
		simplus: '⨤',
		simrarr: '⥲',
		smashp: '⨳',
		smeparsl: '⧤',
		smile: '⌣',
		ssmile: '⌣',
		smt: '⪪',
		smte: '⪬',
		smtes: '⪬︀',
		softcy: 'ь',
		sol: '/',
		solb: '⧄',
		solbar: '⌿',
		sopf: '𝕤',
		spades: '♠',
		spadesuit: '♠',
		sqcaps: '⊓︀',
		sqcups: '⊔︀',
		sscr: '𝓈',
		star: '☆',
		sub: '⊂',
		subset: '⊂',
		subE: '⫅',
		subseteqq: '⫅',
		subdot: '⪽',
		subedot: '⫃',
		submult: '⫁',
		subnE: '⫋',
		subsetneqq: '⫋',
		subne: '⊊',
		subsetneq: '⊊',
		subplus: '⪿',
		subrarr: '⥹',
		subsim: '⫇',
		subsub: '⫕',
		subsup: '⫓',
		sung: '♪',
		sup1: '¹',
		sup2: '²',
		sup3: '³',
		supE: '⫆',
		supseteqq: '⫆',
		supdot: '⪾',
		supdsub: '⫘',
		supedot: '⫄',
		suphsol: '⟉',
		suphsub: '⫗',
		suplarr: '⥻',
		supmult: '⫂',
		supnE: '⫌',
		supsetneqq: '⫌',
		supne: '⊋',
		supsetneq: '⊋',
		supplus: '⫀',
		supsim: '⫈',
		supsub: '⫔',
		supsup: '⫖',
		swArr: '⇙',
		swnwar: '⤪',
		szlig: 'ß',
		target: '⌖',
		tau: 'τ',
		tcaron: 'ť',
		tcedil: 'ţ',
		tcy: 'т',
		telrec: '⌕',
		tfr: '𝔱',
		theta: 'θ',
		thetasym: 'ϑ',
		thetav: 'ϑ',
		vartheta: 'ϑ',
		thorn: 'þ',
		times: '×',
		timesbar: '⨱',
		timesd: '⨰',
		topbot: '⌶',
		topcir: '⫱',
		topf: '𝕥',
		topfork: '⫚',
		tprime: '‴',
		triangle: '▵',
		utri: '▵',
		triangleq: '≜',
		trie: '≜',
		tridot: '◬',
		triminus: '⨺',
		triplus: '⨹',
		trisb: '⧍',
		tritime: '⨻',
		trpezium: '⏢',
		tscr: '𝓉',
		tscy: 'ц',
		tshcy: 'ћ',
		tstrok: 'ŧ',
		uHar: '⥣',
		uacute: 'ú',
		ubrcy: 'ў',
		ubreve: 'ŭ',
		ucirc: 'û',
		ucy: 'у',
		udblac: 'ű',
		ufisht: '⥾',
		ufr: '𝔲',
		ugrave: 'ù',
		uhblk: '▀',
		ulcorn: '⌜',
		ulcorner: '⌜',
		ulcrop: '⌏',
		ultri: '◸',
		umacr: 'ū',
		uogon: 'ų',
		uopf: '𝕦',
		upsi: 'υ',
		upsilon: 'υ',
		upuparrows: '⇈',
		uuarr: '⇈',
		urcorn: '⌝',
		urcorner: '⌝',
		urcrop: '⌎',
		uring: 'ů',
		urtri: '◹',
		uscr: '𝓊',
		utdot: '⋰',
		utilde: 'ũ',
		uuml: 'ü',
		uwangle: '⦧',
		vBar: '⫨',
		vBarv: '⫩',
		vangrt: '⦜',
		varsubsetneq: '⊊︀',
		vsubne: '⊊︀',
		varsubsetneqq: '⫋︀',
		vsubnE: '⫋︀',
		varsupsetneq: '⊋︀',
		vsupne: '⊋︀',
		varsupsetneqq: '⫌︀',
		vsupnE: '⫌︀',
		vcy: 'в',
		veebar: '⊻',
		veeeq: '≚',
		vellip: '⋮',
		vfr: '𝔳',
		vopf: '𝕧',
		vscr: '𝓋',
		vzigzag: '⦚',
		wcirc: 'ŵ',
		wedbar: '⩟',
		wedgeq: '≙',
		weierp: '℘',
		wp: '℘',
		wfr: '𝔴',
		wopf: '𝕨',
		wscr: '𝓌',
		xfr: '𝔵',
		xi: 'ξ',
		xnis: '⋻',
		xopf: '𝕩',
		xscr: '𝓍',
		yacute: 'ý',
		yacy: 'я',
		ycirc: 'ŷ',
		ycy: 'ы',
		yen: '¥',
		yfr: '𝔶',
		yicy: 'ї',
		yopf: '𝕪',
		yscr: '𝓎',
		yucy: 'ю',
		yuml: 'ÿ',
		zacute: 'ź',
		zcaron: 'ž',
		zcy: 'з',
		zdot: 'ż',
		zeta: 'ζ',
		zfr: '𝔷',
		zhcy: 'ж',
		zigrarr: '⇝',
		zopf: '𝕫',
		zscr: '𝓏',
		zwj: '‍',
		zwnj: '‌'
	},
	Bd = '';
ct.ngsp = Bd;
var d = (function (e) {
		return (
			(e[(e.TAG_OPEN_START = 0)] = 'TAG_OPEN_START'),
			(e[(e.TAG_OPEN_END = 1)] = 'TAG_OPEN_END'),
			(e[(e.TAG_OPEN_END_VOID = 2)] = 'TAG_OPEN_END_VOID'),
			(e[(e.TAG_CLOSE = 3)] = 'TAG_CLOSE'),
			(e[(e.INCOMPLETE_TAG_OPEN = 4)] = 'INCOMPLETE_TAG_OPEN'),
			(e[(e.TEXT = 5)] = 'TEXT'),
			(e[(e.ESCAPABLE_RAW_TEXT = 6)] = 'ESCAPABLE_RAW_TEXT'),
			(e[(e.RAW_TEXT = 7)] = 'RAW_TEXT'),
			(e[(e.INTERPOLATION = 8)] = 'INTERPOLATION'),
			(e[(e.ENCODED_ENTITY = 9)] = 'ENCODED_ENTITY'),
			(e[(e.COMMENT_START = 10)] = 'COMMENT_START'),
			(e[(e.COMMENT_END = 11)] = 'COMMENT_END'),
			(e[(e.CDATA_START = 12)] = 'CDATA_START'),
			(e[(e.CDATA_END = 13)] = 'CDATA_END'),
			(e[(e.ATTR_NAME = 14)] = 'ATTR_NAME'),
			(e[(e.ATTR_QUOTE = 15)] = 'ATTR_QUOTE'),
			(e[(e.ATTR_VALUE_TEXT = 16)] = 'ATTR_VALUE_TEXT'),
			(e[(e.ATTR_VALUE_INTERPOLATION = 17)] = 'ATTR_VALUE_INTERPOLATION'),
			(e[(e.DOC_TYPE_START = 18)] = 'DOC_TYPE_START'),
			(e[(e.DOC_TYPE_END = 19)] = 'DOC_TYPE_END'),
			(e[(e.EXPANSION_FORM_START = 20)] = 'EXPANSION_FORM_START'),
			(e[(e.EXPANSION_CASE_VALUE = 21)] = 'EXPANSION_CASE_VALUE'),
			(e[(e.EXPANSION_CASE_EXP_START = 22)] = 'EXPANSION_CASE_EXP_START'),
			(e[(e.EXPANSION_CASE_EXP_END = 23)] = 'EXPANSION_CASE_EXP_END'),
			(e[(e.EXPANSION_FORM_END = 24)] = 'EXPANSION_FORM_END'),
			(e[(e.BLOCK_OPEN_START = 25)] = 'BLOCK_OPEN_START'),
			(e[(e.BLOCK_OPEN_END = 26)] = 'BLOCK_OPEN_END'),
			(e[(e.BLOCK_CLOSE = 27)] = 'BLOCK_CLOSE'),
			(e[(e.BLOCK_PARAMETER = 28)] = 'BLOCK_PARAMETER'),
			(e[(e.INCOMPLETE_BLOCK_OPEN = 29)] = 'INCOMPLETE_BLOCK_OPEN'),
			(e[(e.LET_START = 30)] = 'LET_START'),
			(e[(e.LET_VALUE = 31)] = 'LET_VALUE'),
			(e[(e.LET_END = 32)] = 'LET_END'),
			(e[(e.INCOMPLETE_LET = 33)] = 'INCOMPLETE_LET'),
			(e[(e.COMPONENT_OPEN_START = 34)] = 'COMPONENT_OPEN_START'),
			(e[(e.COMPONENT_OPEN_END = 35)] = 'COMPONENT_OPEN_END'),
			(e[(e.COMPONENT_OPEN_END_VOID = 36)] = 'COMPONENT_OPEN_END_VOID'),
			(e[(e.COMPONENT_CLOSE = 37)] = 'COMPONENT_CLOSE'),
			(e[(e.INCOMPLETE_COMPONENT_OPEN = 38)] = 'INCOMPLETE_COMPONENT_OPEN'),
			(e[(e.DIRECTIVE_NAME = 39)] = 'DIRECTIVE_NAME'),
			(e[(e.DIRECTIVE_OPEN = 40)] = 'DIRECTIVE_OPEN'),
			(e[(e.DIRECTIVE_CLOSE = 41)] = 'DIRECTIVE_CLOSE'),
			(e[(e.EOF = 42)] = 'EOF'),
			e
		);
	})({}),
	Id = class {
		constructor(e, t, u) {
			((this.tokens = e), (this.errors = t), (this.nonNormalizedIcuExpressions = u));
		}
	};
function Pd(e, t, u, n = {}) {
	let r = new Fd(new $a(e, t), u, n);
	return (r.tokenize(), new Id(jd(r.tokens), r.errors, r.nonNormalizedIcuExpressions));
}
var Od = /\r\n?/g;
function xe(e) {
	return `Unexpected character "${e === 0 ? 'EOF' : String.fromCharCode(e)}"`;
}
function nr(e) {
	return `Unknown entity "${e}" - use the "&#<decimal>;" or  "&#x<hex>;" syntax`;
}
function Rd(e, t) {
	return `Unable to parse entity "${t}" - ${e} character reference entities must end with ";"`;
}
var ku = (function (e) {
		return ((e.HEX = 'hexadecimal'), (e.DEC = 'decimal'), e);
	})(ku || {}),
	qd = ['@if', '@else', '@for', '@switch', '@case', '@default', '@empty', '@defer', '@placeholder', '@loading', '@error'],
	Qe = { start: '{{', end: '}}' },
	Fd = class {
		constructor(e, t, u) {
			((this._getTagContentType = t),
				(this._currentTokenStart = null),
				(this._currentTokenType = null),
				(this._expansionCaseStack = []),
				(this._openDirectiveCount = 0),
				(this._inInterpolation = !1),
				(this._fullNameStack = []),
				(this.tokens = []),
				(this.errors = []),
				(this.nonNormalizedIcuExpressions = []),
				(this._tokenizeIcu = u.tokenizeExpansionForms || !1),
				(this._leadingTriviaCodePoints = u.leadingTriviaChars && u.leadingTriviaChars.map((r) => r.codePointAt(0) || 0)),
				(this._canSelfClose = u.canSelfClose || !1),
				(this._allowHtmComponentClosingTags = u.allowHtmComponentClosingTags || !1));
			let n = u.range || { endPos: e.content.length, startPos: 0, startLine: 0, startCol: 0 };
			((this._cursor = u.escapedString ? new zd(e, n) : new za(e, n)),
				(this._preserveLineEndings = u.preserveLineEndings || !1),
				(this._i18nNormalizeLineEndingsInICUs = u.i18nNormalizeLineEndingsInICUs || !1),
				(this._tokenizeBlocks = u.tokenizeBlocks ?? !0),
				(this._tokenizeLet = u.tokenizeLet ?? !0),
				(this._selectorlessEnabled = u.selectorlessEnabled ?? !1));
			try {
				this._cursor.init();
			} catch (r) {
				this.handleError(r);
			}
		}
		_processCarriageReturns(e) {
			return this._preserveLineEndings
				? e
				: e.replace(
						Od,
						`
`
					);
		}
		tokenize() {
			for (; this._cursor.peek() !== 0; ) {
				let e = this._cursor.clone();
				try {
					if (this._attemptCharCode(60))
						if (this._attemptCharCode(33))
							this._attemptStr('[CDATA[')
								? this._consumeCdata(e)
								: this._attemptStr('--')
									? this._consumeComment(e)
									: this._attemptStrCaseInsensitive('doctype')
										? this._consumeDocType(e)
										: this._consumeBogusComment(e);
						else if (this._attemptCharCode(47)) this._consumeTagClose(e);
						else {
							let t = this._cursor.clone();
							this._attemptCharCode(63) ? ((this._cursor = t), this._consumeBogusComment(e)) : this._consumeTagOpen(e);
						}
					else
						this._tokenizeLet && this._cursor.peek() === 64 && !this._inInterpolation && this._isLetStart()
							? this._consumeLetDeclaration(e)
							: this._tokenizeBlocks && this._isBlockStart()
								? this._consumeBlockStart(e)
								: this._tokenizeBlocks &&
									  !this._inInterpolation &&
									  !this._isInExpansionCase() &&
									  !this._isInExpansionForm() &&
									  this._attemptCharCode(125)
									? this._consumeBlockEnd(e)
									: (this._tokenizeIcu && this._tokenizeExpansionForm()) ||
										this._consumeWithInterpolation(
											d.TEXT,
											d.INTERPOLATION,
											() => this._isTextEnd(),
											() => this._isTagStart()
										);
				} catch (t) {
					this.handleError(t);
				}
			}
			(this._beginToken(d.EOF), this._endToken([]));
		}
		_getBlockName() {
			let e = !1,
				t = this._cursor.clone();
			return (this._attemptCharCodeUntilFn((u) => (Ft(u) ? !e : $d(u) ? ((e = !0), !1) : !0)), this._cursor.getChars(t).trim());
		}
		_consumeBlockStart(e) {
			(this._requireCharCode(64), this._beginToken(d.BLOCK_OPEN_START, e));
			let t = this._endToken([this._getBlockName()]);
			if (this._cursor.peek() === 40)
				if ((this._cursor.advance(), this._consumeBlockParameters(), this._attemptCharCodeUntilFn(D), this._attemptCharCode(41)))
					this._attemptCharCodeUntilFn(D);
				else {
					t.type = d.INCOMPLETE_BLOCK_OPEN;
					return;
				}
			this._attemptCharCode(123)
				? (this._beginToken(d.BLOCK_OPEN_END), this._endToken([]))
				: this._isBlockStart() && (t.parts[0] === 'case' || t.parts[0] === 'default')
					? (this._beginToken(d.BLOCK_OPEN_END), this._endToken([]), this._beginToken(d.BLOCK_CLOSE), this._endToken([]))
					: (t.type = d.INCOMPLETE_BLOCK_OPEN);
		}
		_consumeBlockEnd(e) {
			(this._beginToken(d.BLOCK_CLOSE, e), this._endToken([]));
		}
		_consumeBlockParameters() {
			for (this._attemptCharCodeUntilFn(ar); this._cursor.peek() !== 41 && this._cursor.peek() !== 0; ) {
				this._beginToken(d.BLOCK_PARAMETER);
				let e = this._cursor.clone(),
					t = null,
					u = 0;
				for (; (this._cursor.peek() !== 59 && this._cursor.peek() !== 0) || t !== null; ) {
					let n = this._cursor.peek();
					if (n === 92) this._cursor.advance();
					else if (n === t) t = null;
					else if (t === null && su(n)) t = n;
					else if (n === 40 && t === null) u++;
					else if (n === 41 && t === null) {
						if (u === 0) break;
						u > 0 && u--;
					}
					this._cursor.advance();
				}
				(this._endToken([this._cursor.getChars(e)]), this._attemptCharCodeUntilFn(ar));
			}
		}
		_consumeLetDeclaration(e) {
			if ((this._requireStr('@let'), this._beginToken(d.LET_START, e), Ft(this._cursor.peek()))) this._attemptCharCodeUntilFn(D);
			else {
				let u = this._endToken([this._cursor.getChars(e)]);
				u.type = d.INCOMPLETE_LET;
				return;
			}
			let t = this._endToken([this._getLetDeclarationName()]);
			if ((this._attemptCharCodeUntilFn(D), !this._attemptCharCode(61))) {
				t.type = d.INCOMPLETE_LET;
				return;
			}
			(this._attemptCharCodeUntilFn((u) => D(u) && !Mt(u)),
				this._consumeLetDeclarationValue(),
				this._cursor.peek() === 59
					? (this._beginToken(d.LET_END), this._endToken([]), this._cursor.advance())
					: ((t.type = d.INCOMPLETE_LET), (t.sourceSpan = this._cursor.getSpan(e))));
		}
		_getLetDeclarationName() {
			let e = this._cursor.clone(),
				t = !1;
			return (
				this._attemptCharCodeUntilFn((u) => (ot(u) || u === 36 || u === 95 || (t && Kt(u)) ? ((t = !0), !1) : !0)),
				this._cursor.getChars(e).trim()
			);
		}
		_consumeLetDeclarationValue() {
			let e = this._cursor.clone();
			for (this._beginToken(d.LET_VALUE, e); this._cursor.peek() !== 0; ) {
				let t = this._cursor.peek();
				if (t === 59) break;
				(su(t) && (this._cursor.advance(), this._attemptCharCodeUntilFn((u) => (u === 92 ? (this._cursor.advance(), !1) : u === t))),
					this._cursor.advance());
			}
			this._endToken([this._cursor.getChars(e)]);
		}
		_tokenizeExpansionForm() {
			if (this.isExpansionFormStart()) return (this._consumeExpansionFormStart(), !0);
			if (Wd(this._cursor.peek()) && this._isInExpansionForm()) return (this._consumeExpansionCaseStart(), !0);
			if (this._cursor.peek() === 125) {
				if (this._isInExpansionCase()) return (this._consumeExpansionCaseEnd(), !0);
				if (this._isInExpansionForm()) return (this._consumeExpansionFormEnd(), !0);
			}
			return !1;
		}
		_beginToken(e, t = this._cursor.clone()) {
			((this._currentTokenStart = t), (this._currentTokenType = e));
		}
		_endToken(e, t) {
			if (this._currentTokenStart === null)
				throw new Pe(this._cursor.getSpan(t), 'Programming error - attempted to end a token when there was no start to the token');
			if (this._currentTokenType === null)
				throw new Pe(this._cursor.getSpan(this._currentTokenStart), 'Programming error - attempted to end a token which has no token type');
			let u = {
				type: this._currentTokenType,
				parts: e,
				sourceSpan: (t ?? this._cursor).getSpan(this._currentTokenStart, this._leadingTriviaCodePoints)
			};
			return (this.tokens.push(u), (this._currentTokenStart = null), (this._currentTokenType = null), u);
		}
		_createError(e, t) {
			this._isInExpansionForm() && (e += ` (Do you have an unescaped "{" in your template? Use "{{ '{' }}") to escape it.)`);
			let u = new Pe(t, e);
			return ((this._currentTokenStart = null), (this._currentTokenType = null), u);
		}
		handleError(e) {
			if ((e instanceof nn && (e = this._createError(e.msg, this._cursor.getSpan(e.cursor))), e instanceof Pe)) this.errors.push(e);
			else throw e;
		}
		_attemptCharCode(e) {
			return this._cursor.peek() === e ? (this._cursor.advance(), !0) : !1;
		}
		_attemptCharCodeCaseInsensitive(e) {
			return Ud(this._cursor.peek(), e) ? (this._cursor.advance(), !0) : !1;
		}
		_requireCharCode(e) {
			let t = this._cursor.clone();
			if (!this._attemptCharCode(e)) throw this._createError(xe(this._cursor.peek()), this._cursor.getSpan(t));
		}
		_attemptStr(e) {
			let t = e.length;
			if (this._cursor.charsLeft() < t) return !1;
			let u = this._cursor.clone();
			for (let n = 0; n < t; n++) if (!this._attemptCharCode(e.charCodeAt(n))) return ((this._cursor = u), !1);
			return !0;
		}
		_attemptStrCaseInsensitive(e) {
			for (let t = 0; t < e.length; t++) if (!this._attemptCharCodeCaseInsensitive(e.charCodeAt(t))) return !1;
			return !0;
		}
		_requireStr(e) {
			let t = this._cursor.clone();
			if (!this._attemptStr(e)) throw this._createError(xe(this._cursor.peek()), this._cursor.getSpan(t));
		}
		_requireStrCaseInsensitive(e) {
			let t = this._cursor.clone();
			if (!this._attemptStrCaseInsensitive(e)) throw this._createError(xe(this._cursor.peek()), this._cursor.getSpan(t));
		}
		_attemptCharCodeUntilFn(e) {
			for (; !e(this._cursor.peek()); ) this._cursor.advance();
		}
		_requireCharCodeUntilFn(e, t) {
			let u = this._cursor.clone();
			if ((this._attemptCharCodeUntilFn(e), this._cursor.diff(u) < t)) throw this._createError(xe(this._cursor.peek()), this._cursor.getSpan(u));
		}
		_attemptUntilChar(e) {
			for (; this._cursor.peek() !== e; ) this._cursor.advance();
		}
		_readChar() {
			let e = String.fromCodePoint(this._cursor.peek());
			return (this._cursor.advance(), e);
		}
		_peekStr(e) {
			let t = e.length;
			if (this._cursor.charsLeft() < t) return !1;
			let u = this._cursor.clone();
			for (let n = 0; n < t; n++) {
				if (u.peek() !== e.charCodeAt(n)) return !1;
				u.advance();
			}
			return !0;
		}
		_isBlockStart() {
			return this._cursor.peek() === 64 && qd.some((e) => this._peekStr(e));
		}
		_isLetStart() {
			return this._cursor.peek() === 64 && this._peekStr('@let');
		}
		_consumeEntity(e) {
			this._beginToken(d.ENCODED_ENTITY);
			let t = this._cursor.clone();
			if ((this._cursor.advance(), this._attemptCharCode(35))) {
				let u = this._attemptCharCode(120) || this._attemptCharCode(88),
					n = this._cursor.clone();
				if ((this._attemptCharCodeUntilFn(Hd), this._cursor.peek() != 59)) {
					this._cursor.advance();
					let a = u ? ku.HEX : ku.DEC;
					throw this._createError(Rd(a, this._cursor.getChars(t)), this._cursor.getSpan());
				}
				let r = this._cursor.getChars(n);
				this._cursor.advance();
				try {
					let a = parseInt(r, u ? 16 : 10);
					this._endToken([String.fromCodePoint(a), this._cursor.getChars(t)]);
				} catch {
					throw this._createError(nr(this._cursor.getChars(t)), this._cursor.getSpan());
				}
			} else {
				let u = this._cursor.clone();
				if ((this._attemptCharCodeUntilFn(Vd), this._cursor.peek() != 59)) (this._beginToken(e, t), (this._cursor = u), this._endToken(['&']));
				else {
					let n = this._cursor.getChars(u);
					this._cursor.advance();
					let r = ct.hasOwnProperty(n) && ct[n];
					if (!r) throw this._createError(nr(n), this._cursor.getSpan(t));
					this._endToken([r, `&${n};`]);
				}
			}
		}
		_consumeRawText(e, t) {
			this._beginToken(e ? d.ESCAPABLE_RAW_TEXT : d.RAW_TEXT);
			let u = [];
			for (;;) {
				let n = this._cursor.clone(),
					r = t();
				if (((this._cursor = n), r)) break;
				e && this._cursor.peek() === 38
					? (this._endToken([this._processCarriageReturns(u.join(''))]),
						(u.length = 0),
						this._consumeEntity(d.ESCAPABLE_RAW_TEXT),
						this._beginToken(d.ESCAPABLE_RAW_TEXT))
					: u.push(this._readChar());
			}
			this._endToken([this._processCarriageReturns(u.join(''))]);
		}
		_consumeComment(e) {
			(this._beginToken(d.COMMENT_START, e),
				this._endToken([]),
				this._consumeRawText(!1, () => this._attemptStr('-->')),
				this._beginToken(d.COMMENT_END),
				this._requireStr('-->'),
				this._endToken([]));
		}
		_consumeBogusComment(e) {
			(this._beginToken(d.COMMENT_START, e),
				this._endToken([]),
				this._consumeRawText(!1, () => this._cursor.peek() === 62),
				this._beginToken(d.COMMENT_END),
				this._cursor.advance(),
				this._endToken([]));
		}
		_consumeCdata(e) {
			(this._beginToken(d.CDATA_START, e),
				this._endToken([]),
				this._consumeRawText(!1, () => this._attemptStr(']]>')),
				this._beginToken(d.CDATA_END),
				this._requireStr(']]>'),
				this._endToken([]));
		}
		_consumeDocType(e) {
			(this._beginToken(d.DOC_TYPE_START, e),
				this._endToken([]),
				this._consumeRawText(!1, () => this._cursor.peek() === 62),
				this._beginToken(d.DOC_TYPE_END),
				this._cursor.advance(),
				this._endToken([]));
		}
		_consumePrefixAndName(e) {
			let t = this._cursor.clone(),
				u = '';
			for (; this._cursor.peek() !== 58 && !Md(this._cursor.peek()); ) this._cursor.advance();
			let n;
			(this._cursor.peek() === 58 ? ((u = this._cursor.getChars(t)), this._cursor.advance(), (n = this._cursor.clone())) : (n = t),
				this._requireCharCodeUntilFn(e, u === '' ? 0 : 1));
			let r = this._cursor.getChars(n);
			return [u, r];
		}
		_consumeTagOpen(e) {
			let t,
				u,
				n,
				r,
				a = [];
			try {
				if (this._selectorlessEnabled && yt(this._cursor.peek()))
					((r = this._consumeComponentOpenStart(e)),
						([n, u, t] = r.parts),
						u && (n += `:${u}`),
						t && (n += `:${t}`),
						this._attemptCharCodeUntilFn(D));
				else {
					if (!ot(this._cursor.peek())) throw this._createError(xe(this._cursor.peek()), this._cursor.getSpan(e));
					((r = this._consumeTagOpenStart(e)), (u = r.parts[0]), (t = n = r.parts[1]), this._attemptCharCodeUntilFn(D));
				}
				for (; !sr(this._cursor.peek()); )
					if (this._selectorlessEnabled && this._cursor.peek() === 64) {
						let s = this._cursor.clone(),
							o = s.clone();
						(o.advance(), yt(o.peek()) && this._consumeDirective(s, o));
					} else {
						let s = this._consumeAttribute();
						a.push(s);
					}
				r.type === d.COMPONENT_OPEN_START ? this._consumeComponentOpenEnd() : this._consumeTagOpenEnd();
			} catch (s) {
				if (s instanceof Pe) {
					r
						? (r.type = r.type === d.COMPONENT_OPEN_START ? d.INCOMPLETE_COMPONENT_OPEN : d.INCOMPLETE_TAG_OPEN)
						: (this._beginToken(d.TEXT, e), this._endToken(['<']));
					return;
				}
				throw s;
			}
			if (this._canSelfClose && this.tokens[this.tokens.length - 1].type === d.TAG_OPEN_END_VOID) return;
			let i = this._getTagContentType(t, u, this._fullNameStack.length > 0, a);
			(this._handleFullNameStackForTagOpen(u, t),
				i === de.RAW_TEXT
					? this._consumeRawTextWithTagClose(u, r, n, !1)
					: i === de.ESCAPABLE_RAW_TEXT && this._consumeRawTextWithTagClose(u, r, n, !0));
		}
		_consumeRawTextWithTagClose(e, t, u, n) {
			(this._consumeRawText(n, () =>
				!this._attemptCharCode(60) ||
				!this._attemptCharCode(47) ||
				(this._attemptCharCodeUntilFn(D), !this._attemptStrCaseInsensitive(e && t.type !== d.COMPONENT_OPEN_START ? `${e}:${u}` : u))
					? !1
					: (this._attemptCharCodeUntilFn(D), this._attemptCharCode(62))
			),
				this._beginToken(t.type === d.COMPONENT_OPEN_START ? d.COMPONENT_CLOSE : d.TAG_CLOSE),
				this._requireCharCodeUntilFn((r) => r === 62, 3),
				this._cursor.advance(),
				this._endToken(t.parts),
				this._handleFullNameStackForTagClose(e, u));
		}
		_consumeTagOpenStart(e) {
			this._beginToken(d.TAG_OPEN_START, e);
			let t = this._consumePrefixAndName(_e);
			return this._endToken(t);
		}
		_consumeComponentOpenStart(e) {
			this._beginToken(d.COMPONENT_OPEN_START, e);
			let t = this._consumeComponentName();
			return this._endToken(t);
		}
		_consumeComponentName() {
			let e = this._cursor.clone();
			for (; ir(this._cursor.peek()); ) this._cursor.advance();
			let t = this._cursor.getChars(e),
				u = '',
				n = '';
			return (this._cursor.peek() === 58 && (this._cursor.advance(), ([u, n] = this._consumePrefixAndName(_e))), [t, u, n]);
		}
		_consumeAttribute() {
			let [e, t] = this._consumeAttributeName(),
				u;
			return (
				this._attemptCharCodeUntilFn(D),
				this._attemptCharCode(61) && (this._attemptCharCodeUntilFn(D), (u = this._consumeAttributeValue())),
				this._attemptCharCodeUntilFn(D),
				{ prefix: e, name: t, value: u }
			);
		}
		_consumeAttributeName() {
			let e = this._cursor.peek();
			if (e === 39 || e === 34) throw this._createError(xe(e), this._cursor.getSpan());
			this._beginToken(d.ATTR_NAME);
			let t;
			if (this._openDirectiveCount > 0) {
				let n = 0;
				t = (r) => {
					if (this._openDirectiveCount > 0) {
						if (r === 40) n++;
						else if (r === 41) {
							if (n === 0) return !0;
							n--;
						}
					}
					return _e(r);
				};
			} else if (e === 91) {
				let n = 0;
				t = (r) => (r === 91 ? n++ : r === 93 && n--, n <= 0 ? _e(r) : Mt(r));
			} else t = _e;
			let u = this._consumePrefixAndName(t);
			return (this._endToken(u), u);
		}
		_consumeAttributeValue() {
			let e;
			if (this._cursor.peek() === 39 || this._cursor.peek() === 34) {
				let t = this._cursor.peek();
				this._consumeQuote(t);
				let u = () => this._cursor.peek() === t;
				((e = this._consumeWithInterpolation(d.ATTR_VALUE_TEXT, d.ATTR_VALUE_INTERPOLATION, u, u)), this._consumeQuote(t));
			} else {
				let t = () => _e(this._cursor.peek());
				e = this._consumeWithInterpolation(d.ATTR_VALUE_TEXT, d.ATTR_VALUE_INTERPOLATION, t, t);
			}
			return e;
		}
		_consumeQuote(e) {
			(this._beginToken(d.ATTR_QUOTE), this._requireCharCode(e), this._endToken([String.fromCodePoint(e)]));
		}
		_consumeTagOpenEnd() {
			let e = this._attemptCharCode(47) ? d.TAG_OPEN_END_VOID : d.TAG_OPEN_END;
			(this._beginToken(e), this._requireCharCode(62), this._endToken([]));
		}
		_consumeComponentOpenEnd() {
			let e = this._attemptCharCode(47) ? d.COMPONENT_OPEN_END_VOID : d.COMPONENT_OPEN_END;
			(this._beginToken(e), this._requireCharCode(62), this._endToken([]));
		}
		_consumeTagClose(e) {
			if (this._selectorlessEnabled) {
				let t = e.clone();
				for (; t.peek() !== 62 && !yt(t.peek()); ) t.advance();
				if (yt(t.peek())) {
					this._beginToken(d.COMPONENT_CLOSE, e);
					let u = this._consumeComponentName();
					(this._attemptCharCodeUntilFn(D), this._requireCharCode(62), this._endToken(u));
					return;
				}
			}
			if ((this._beginToken(d.TAG_CLOSE, e), this._attemptCharCodeUntilFn(D), this._allowHtmComponentClosingTags && this._attemptCharCode(47)))
				(this._attemptCharCodeUntilFn(D), this._requireCharCode(62), this._endToken([]));
			else {
				let [t, u] = this._consumePrefixAndName(_e);
				(this._attemptCharCodeUntilFn(D), this._requireCharCode(62), this._endToken([t, u]), this._handleFullNameStackForTagClose(t, u));
			}
		}
		_consumeExpansionFormStart() {
			(this._beginToken(d.EXPANSION_FORM_START),
				this._requireCharCode(123),
				this._endToken([]),
				this._expansionCaseStack.push(d.EXPANSION_FORM_START),
				this._beginToken(d.RAW_TEXT));
			let e = this._readUntil(44),
				t = this._processCarriageReturns(e);
			if (this._i18nNormalizeLineEndingsInICUs) this._endToken([t]);
			else {
				let n = this._endToken([e]);
				t !== e && this.nonNormalizedIcuExpressions.push(n);
			}
			(this._requireCharCode(44), this._attemptCharCodeUntilFn(D), this._beginToken(d.RAW_TEXT));
			let u = this._readUntil(44);
			(this._endToken([u]), this._requireCharCode(44), this._attemptCharCodeUntilFn(D));
		}
		_consumeExpansionCaseStart() {
			this._beginToken(d.EXPANSION_CASE_VALUE);
			let e = this._readUntil(123).trim();
			(this._endToken([e]),
				this._attemptCharCodeUntilFn(D),
				this._beginToken(d.EXPANSION_CASE_EXP_START),
				this._requireCharCode(123),
				this._endToken([]),
				this._attemptCharCodeUntilFn(D),
				this._expansionCaseStack.push(d.EXPANSION_CASE_EXP_START));
		}
		_consumeExpansionCaseEnd() {
			(this._beginToken(d.EXPANSION_CASE_EXP_END),
				this._requireCharCode(125),
				this._endToken([]),
				this._attemptCharCodeUntilFn(D),
				this._expansionCaseStack.pop());
		}
		_consumeExpansionFormEnd() {
			(this._beginToken(d.EXPANSION_FORM_END), this._requireCharCode(125), this._endToken([]), this._expansionCaseStack.pop());
		}
		_consumeWithInterpolation(e, t, u, n) {
			this._beginToken(e);
			let r = [];
			for (; !u(); ) {
				let i = this._cursor.clone();
				this._attemptStr(Qe.start)
					? (this._endToken([this._processCarriageReturns(r.join(''))], i), (r.length = 0), this._consumeInterpolation(t, i, n), this._beginToken(e))
					: this._cursor.peek() === 38
						? (this._endToken([this._processCarriageReturns(r.join(''))]), (r.length = 0), this._consumeEntity(e), this._beginToken(e))
						: r.push(this._readChar());
			}
			this._inInterpolation = !1;
			let a = this._processCarriageReturns(r.join(''));
			return (this._endToken([a]), a);
		}
		_consumeInterpolation(e, t, u) {
			let n = [];
			(this._beginToken(e, t), n.push(Qe.start));
			let r = this._cursor.clone(),
				a = null,
				i = !1;
			for (; this._cursor.peek() !== 0 && (u === null || !u()); ) {
				let s = this._cursor.clone();
				if (this._isTagStart()) {
					((this._cursor = s), n.push(this._getProcessedChars(r, s)), this._endToken(n));
					return;
				}
				if (a === null)
					if (this._attemptStr(Qe.end)) {
						(n.push(this._getProcessedChars(r, s)), n.push(Qe.end), this._endToken(n));
						return;
					} else this._attemptStr('//') && (i = !0);
				let o = this._cursor.peek();
				(this._cursor.advance(), o === 92 ? this._cursor.advance() : o === a ? (a = null) : !i && a === null && su(o) && (a = o));
			}
			(n.push(this._getProcessedChars(r, this._cursor)), this._endToken(n));
		}
		_consumeDirective(e, t) {
			for (this._requireCharCode(64), this._cursor.advance(); ir(this._cursor.peek()); ) this._cursor.advance();
			this._beginToken(d.DIRECTIVE_NAME, e);
			let u = this._cursor.getChars(t);
			if ((this._endToken([u]), this._attemptCharCodeUntilFn(D), this._cursor.peek() === 40)) {
				for (
					this._openDirectiveCount++, this._beginToken(d.DIRECTIVE_OPEN), this._cursor.advance(), this._endToken([]), this._attemptCharCodeUntilFn(D);
					!sr(this._cursor.peek()) && this._cursor.peek() !== 41;
				)
					this._consumeAttribute();
				if ((this._attemptCharCodeUntilFn(D), this._openDirectiveCount--, this._cursor.peek() !== 41)) {
					if (this._cursor.peek() === 62 || this._cursor.peek() === 47) return;
					throw this._createError(xe(this._cursor.peek()), this._cursor.getSpan(e));
				}
				(this._beginToken(d.DIRECTIVE_CLOSE), this._cursor.advance(), this._endToken([]), this._attemptCharCodeUntilFn(D));
			}
		}
		_getProcessedChars(e, t) {
			return this._processCarriageReturns(t.getChars(e));
		}
		_isTextEnd() {
			return !!(
				this._isTagStart() ||
				this._cursor.peek() === 0 ||
				(this._tokenizeIcu &&
					!this._inInterpolation &&
					(this.isExpansionFormStart() || (this._cursor.peek() === 125 && this._isInExpansionCase()))) ||
				(this._tokenizeBlocks &&
					!this._inInterpolation &&
					!this._isInExpansion() &&
					(this._isBlockStart() || this._isLetStart() || this._cursor.peek() === 125))
			);
		}
		_isTagStart() {
			if (this._cursor.peek() === 60) {
				let e = this._cursor.clone();
				e.advance();
				let t = e.peek();
				if ((97 <= t && t <= 122) || (65 <= t && t <= 90) || t === 47 || t === 33) return !0;
			}
			return !1;
		}
		_readUntil(e) {
			let t = this._cursor.clone();
			return (this._attemptUntilChar(e), this._cursor.getChars(t));
		}
		_isInExpansion() {
			return this._isInExpansionCase() || this._isInExpansionForm();
		}
		_isInExpansionCase() {
			return this._expansionCaseStack.length > 0 && this._expansionCaseStack[this._expansionCaseStack.length - 1] === d.EXPANSION_CASE_EXP_START;
		}
		_isInExpansionForm() {
			return this._expansionCaseStack.length > 0 && this._expansionCaseStack[this._expansionCaseStack.length - 1] === d.EXPANSION_FORM_START;
		}
		isExpansionFormStart() {
			if (this._cursor.peek() !== 123) return !1;
			let e = this._cursor.clone(),
				t = this._attemptStr(Qe.start);
			return ((this._cursor = e), !t);
		}
		_handleFullNameStackForTagOpen(e, t) {
			let u = nt(e, t);
			(this._fullNameStack.length === 0 || this._fullNameStack[this._fullNameStack.length - 1] === u) && this._fullNameStack.push(u);
		}
		_handleFullNameStackForTagClose(e, t) {
			let u = nt(e, t);
			this._fullNameStack.length !== 0 && this._fullNameStack[this._fullNameStack.length - 1] === u && this._fullNameStack.pop();
		}
	};
function D(e) {
	return !Ft(e) || e === 0;
}
function _e(e) {
	return Ft(e) || e === 62 || e === 60 || e === 47 || e === 39 || e === 34 || e === 61 || e === 0;
}
function Md(e) {
	return (e < 97 || 122 < e) && (e < 65 || 90 < e) && (e < 48 || e > 57);
}
function Hd(e) {
	return e === 59 || e === 0 || !vd(e);
}
function Vd(e) {
	return e === 59 || e === 0 || !ot(e);
}
function Wd(e) {
	return e !== 125;
}
function Ud(e, t) {
	return rr(e) === rr(t);
}
function rr(e) {
	return e >= 97 && e <= 122 ? e - 97 + 65 : e;
}
function $d(e) {
	return ot(e) || Kt(e) || e === 95;
}
function ar(e) {
	return e !== 59 && D(e);
}
function yt(e) {
	return e === 95 || (e >= 65 && e <= 90);
}
function ir(e) {
	return ot(e) || Kt(e) || e === 95;
}
function sr(e) {
	return e === 47 || e === 62 || e === 60 || e === 0;
}
function jd(e) {
	let t = [],
		u;
	for (let n = 0; n < e.length; n++) {
		let r = e[n];
		(u && u.type === d.TEXT && r.type === d.TEXT) || (u && u.type === d.ATTR_VALUE_TEXT && r.type === d.ATTR_VALUE_TEXT)
			? ((u.parts[0] += r.parts[0]), (u.sourceSpan.end = r.sourceSpan.end))
			: ((u = r), t.push(u));
	}
	return t;
}
var za = class Cu {
		constructor(t, u) {
			if (t instanceof Cu) {
				((this.file = t.file), (this.input = t.input), (this.end = t.end));
				let n = t.state;
				this.state = { peek: n.peek, offset: n.offset, line: n.line, column: n.column };
			} else {
				if (!u) throw new Error('Programming error: the range argument must be provided with a file argument.');
				((this.file = t),
					(this.input = t.content),
					(this.end = u.endPos),
					(this.state = { peek: -1, offset: u.startPos, line: u.startLine, column: u.startCol }));
			}
		}
		clone() {
			return new Cu(this);
		}
		peek() {
			return this.state.peek;
		}
		charsLeft() {
			return this.end - this.state.offset;
		}
		diff(t) {
			return this.state.offset - t.state.offset;
		}
		advance() {
			this.advanceState(this.state);
		}
		init() {
			this.updatePeek(this.state);
		}
		getSpan(t, u) {
			t = t || this;
			let n = t;
			if (u) for (; this.diff(t) > 0 && u.indexOf(t.peek()) !== -1; ) (n === t && (t = t.clone()), t.advance());
			let r = this.locationFromCursor(t);
			return new v(r, this.locationFromCursor(this), n !== t ? this.locationFromCursor(n) : r);
		}
		getChars(t) {
			return this.input.substring(t.state.offset, this.state.offset);
		}
		charAt(t) {
			return this.input.charCodeAt(t);
		}
		advanceState(t) {
			if (t.offset >= this.end) throw ((this.state = t), new nn('Unexpected character "EOF"', this));
			let u = this.charAt(t.offset);
			(u === 10 ? (t.line++, (t.column = 0)) : Mt(u) || t.column++, t.offset++, this.updatePeek(t));
		}
		updatePeek(t) {
			t.peek = t.offset >= this.end ? 0 : this.charAt(t.offset);
		}
		locationFromCursor(t) {
			return new vu(t.file, t.state.offset, t.state.line, t.state.column);
		}
	},
	zd = class Tu extends za {
		constructor(t, u) {
			t instanceof Tu ? (super(t), (this.internalState = { ...t.internalState })) : (super(t, u), (this.internalState = this.state));
		}
		advance() {
			((this.state = this.internalState), super.advance(), this.processEscapeSequence());
		}
		init() {
			(super.init(), this.processEscapeSequence());
		}
		clone() {
			return new Tu(this);
		}
		getChars(t) {
			let u = t.clone(),
				n = '';
			for (; u.internalState.offset < this.internalState.offset; ) ((n += String.fromCodePoint(u.peek())), u.advance());
			return n;
		}
		processEscapeSequence() {
			let t = () => this.internalState.peek;
			if (t() === 92)
				if (((this.internalState = { ...this.state }), this.advanceState(this.internalState), t() === 110)) this.state.peek = 10;
				else if (t() === 114) this.state.peek = 13;
				else if (t() === 118) this.state.peek = 11;
				else if (t() === 116) this.state.peek = 9;
				else if (t() === 98) this.state.peek = 8;
				else if (t() === 102) this.state.peek = 12;
				else if (t() === 117)
					if ((this.advanceState(this.internalState), t() === 123)) {
						this.advanceState(this.internalState);
						let u = this.clone(),
							n = 0;
						for (; t() !== 125; ) (this.advanceState(this.internalState), n++);
						this.state.peek = this.decodeHexDigits(u, n);
					} else {
						let u = this.clone();
						(this.advanceState(this.internalState),
							this.advanceState(this.internalState),
							this.advanceState(this.internalState),
							(this.state.peek = this.decodeHexDigits(u, 4)));
					}
				else if (t() === 120) {
					this.advanceState(this.internalState);
					let u = this.clone();
					(this.advanceState(this.internalState), (this.state.peek = this.decodeHexDigits(u, 2)));
				} else if (Zn(t())) {
					let u = '',
						n = 0,
						r = this.clone();
					for (; Zn(t()) && n < 3; ) ((r = this.clone()), (u += String.fromCodePoint(t())), this.advanceState(this.internalState), n++);
					((this.state.peek = parseInt(u, 8)), (this.internalState = r.internalState));
				} else
					Mt(this.internalState.peek)
						? (this.advanceState(this.internalState), (this.state = this.internalState))
						: (this.state.peek = this.internalState.peek);
		}
		decodeHexDigits(t, u) {
			let n = this.input.slice(t.internalState.offset, t.internalState.offset + u),
				r = parseInt(n, 16);
			if (isNaN(r)) throw ((t.state = t.internalState), new nn('Invalid hexadecimal escape sequence', t));
			return r;
		}
	},
	nn = class extends Error {
		constructor(e, t) {
			(super(e), (this.msg = e), (this.cursor = t), Object.setPrototypeOf(this, new.target.prototype));
		}
	},
	F = class Ga extends Pe {
		static create(t, u, n) {
			return new Ga(t, u, n);
		}
		constructor(t, u, n) {
			(super(u, n), (this.elementName = t));
		}
	},
	Gd = class {
		constructor(e, t) {
			((this.rootNodes = e), (this.errors = t));
		}
	},
	Xd = class {
		constructor(e) {
			this.getTagDefinition = e;
		}
		parse(e, t, u, n = !1, r) {
			let a =
					(m) =>
					(b, ...T) =>
						m(b.toLowerCase(), ...T),
				i = n ? this.getTagDefinition : a(this.getTagDefinition),
				s = (m) => i(m).getContentType(),
				o = n ? r : a(r),
				l = Pd(
					e,
					t,
					r
						? (m, b, T, q) => {
								let V = o(m, b, T, q);
								return V !== void 0 ? V : s(m);
							}
						: s,
					u
				),
				h = (u && u.canSelfClose) || !1,
				x = (u && u.allowHtmComponentClosingTags) || !1,
				_ = new Yd(l.tokens, i, h, x, n);
			return (_.build(), new Gd(_.rootNodes, [...l.errors, ..._.errors]));
		}
	},
	Yd = class Xa {
		constructor(t, u, n, r, a) {
			((this.tokens = t),
				(this.tagDefinitionResolver = u),
				(this.canSelfClose = n),
				(this.allowHtmComponentClosingTags = r),
				(this.isTagNameCaseSensitive = a),
				(this._index = -1),
				(this._containerStack = []),
				(this.rootNodes = []),
				(this.errors = []),
				this._advance());
		}
		build() {
			for (; this._peek.type !== d.EOF; )
				this._peek.type === d.TAG_OPEN_START || this._peek.type === d.INCOMPLETE_TAG_OPEN
					? this._consumeElementStartTag(this._advance())
					: this._peek.type === d.TAG_CLOSE
						? (this._closeVoidElement(), this._consumeElementEndTag(this._advance()))
						: this._peek.type === d.CDATA_START
							? (this._closeVoidElement(), this._consumeCdata(this._advance()))
							: this._peek.type === d.COMMENT_START
								? (this._closeVoidElement(), this._consumeComment(this._advance()))
								: this._peek.type === d.TEXT || this._peek.type === d.RAW_TEXT || this._peek.type === d.ESCAPABLE_RAW_TEXT
									? (this._closeVoidElement(), this._consumeText(this._advance()))
									: this._peek.type === d.EXPANSION_FORM_START
										? this._consumeExpansion(this._advance())
										: this._peek.type === d.BLOCK_OPEN_START
											? (this._closeVoidElement(), this._consumeBlockOpen(this._advance()))
											: this._peek.type === d.BLOCK_CLOSE
												? (this._closeVoidElement(), this._consumeBlockClose(this._advance()))
												: this._peek.type === d.INCOMPLETE_BLOCK_OPEN
													? (this._closeVoidElement(), this._consumeIncompleteBlock(this._advance()))
													: this._peek.type === d.LET_START
														? (this._closeVoidElement(), this._consumeLet(this._advance()))
														: this._peek.type === d.DOC_TYPE_START
															? this._consumeDocType(this._advance())
															: this._peek.type === d.INCOMPLETE_LET
																? (this._closeVoidElement(), this._consumeIncompleteLet(this._advance()))
																: this._peek.type === d.COMPONENT_OPEN_START || this._peek.type === d.INCOMPLETE_COMPONENT_OPEN
																	? this._consumeComponentStartTag(this._advance())
																	: this._peek.type === d.COMPONENT_CLOSE
																		? this._consumeComponentEndTag(this._advance())
																		: this._advance();
			for (let t of this._containerStack) t instanceof De && this.errors.push(F.create(t.name, t.sourceSpan, `Unclosed block "${t.name}"`));
		}
		_advance() {
			let t = this._peek;
			return (this._index < this.tokens.length - 1 && this._index++, (this._peek = this.tokens[this._index]), t);
		}
		_advanceIf(t) {
			return this._peek.type === t ? this._advance() : null;
		}
		_consumeCdata(t) {
			let u = this._advance(),
				n = this._getText(u),
				r = this._advanceIf(d.CDATA_END);
			this._addToParent(new Cd(n, new v(t.sourceSpan.start, (r || u).sourceSpan.end), [u]));
		}
		_consumeComment(t) {
			let u = this._advanceIf(d.RAW_TEXT),
				n = this._advanceIf(d.COMMENT_END),
				r = u != null ? u.parts[0].trim() : null,
				a = n == null ? t.sourceSpan : new v(t.sourceSpan.start, n.sourceSpan.end, t.sourceSpan.fullStart);
			this._addToParent(new yd(r, a));
		}
		_consumeDocType(t) {
			let u = this._advanceIf(d.RAW_TEXT),
				n = this._advanceIf(d.DOC_TYPE_END),
				r = u != null ? u.parts[0].trim() : null,
				a = new v(t.sourceSpan.start, (n || u || t).sourceSpan.end);
			this._addToParent(new Nd(r, a));
		}
		_consumeExpansion(t) {
			let u = this._advance(),
				n = this._advance(),
				r = [];
			for (; this._peek.type === d.EXPANSION_CASE_VALUE; ) {
				let i = this._parseExpansionCase();
				if (!i) return;
				r.push(i);
			}
			if (this._peek.type !== d.EXPANSION_FORM_END) {
				this.errors.push(F.create(null, this._peek.sourceSpan, "Invalid ICU message. Missing '}'."));
				return;
			}
			let a = new v(t.sourceSpan.start, this._peek.sourceSpan.end, t.sourceSpan.fullStart);
			(this._addToParent(new Td(u.parts[0], n.parts[0], r, a, u.sourceSpan)), this._advance());
		}
		_parseExpansionCase() {
			let t = this._advance();
			if (this._peek.type !== d.EXPANSION_CASE_EXP_START)
				return (this.errors.push(F.create(null, this._peek.sourceSpan, "Invalid ICU message. Missing '{'.")), null);
			let u = this._advance(),
				n = this._collectExpansionExpTokens(u);
			if (!n) return null;
			let r = this._advance();
			n.push({ type: d.EOF, parts: [], sourceSpan: r.sourceSpan });
			let a = new Xa(n, this.tagDefinitionResolver, this.canSelfClose, this.allowHtmComponentClosingTags, this.isTagNameCaseSensitive);
			if ((a.build(), a.errors.length > 0)) return ((this.errors = this.errors.concat(a.errors)), null);
			let i = new v(t.sourceSpan.start, r.sourceSpan.end, t.sourceSpan.fullStart),
				s = new v(u.sourceSpan.start, r.sourceSpan.end, u.sourceSpan.fullStart);
			return new Ad(t.parts[0], a.rootNodes, i, t.sourceSpan, s);
		}
		_collectExpansionExpTokens(t) {
			let u = [],
				n = [d.EXPANSION_CASE_EXP_START];
			for (;;) {
				if (
					((this._peek.type === d.EXPANSION_FORM_START || this._peek.type === d.EXPANSION_CASE_EXP_START) && n.push(this._peek.type),
					this._peek.type === d.EXPANSION_CASE_EXP_END)
				)
					if (or(n, d.EXPANSION_CASE_EXP_START)) {
						if ((n.pop(), n.length === 0)) return u;
					} else return (this.errors.push(F.create(null, t.sourceSpan, "Invalid ICU message. Missing '}'.")), null);
				if (this._peek.type === d.EXPANSION_FORM_END)
					if (or(n, d.EXPANSION_FORM_START)) n.pop();
					else return (this.errors.push(F.create(null, t.sourceSpan, "Invalid ICU message. Missing '}'.")), null);
				if (this._peek.type === d.EOF) return (this.errors.push(F.create(null, t.sourceSpan, "Invalid ICU message. Missing '}'.")), null);
				u.push(this._advance());
			}
		}
		_getText(t) {
			let u = t.parts[0];
			if (
				u.length > 0 &&
				u[0] ==
					`
`
			) {
				var n;
				let r = this._getClosestElementLikeParent();
				r != null && r.children.length == 0 && !((n = this._getTagDefinition(r)) === null || n === void 0) && n.ignoreFirstLf && (u = u.substring(1));
			}
			return u;
		}
		_consumeText(t) {
			let u = [t],
				n = t.sourceSpan,
				r = t.parts[0];
			if (
				r.length > 0 &&
				r[0] ===
					`
`
			) {
				var a;
				let i = this._getContainer();
				i != null &&
					i.children.length === 0 &&
					!((a = this._getTagDefinition(i)) === null || a === void 0) &&
					a.ignoreFirstLf &&
					((r = r.substring(1)), (u[0] = { type: t.type, sourceSpan: t.sourceSpan, parts: [r] }));
			}
			for (; this._peek.type === d.INTERPOLATION || this._peek.type === d.TEXT || this._peek.type === d.ENCODED_ENTITY; )
				((t = this._advance()),
					u.push(t),
					t.type === d.INTERPOLATION
						? (r += t.parts.join('').replace(/&([^;]+);/g, cr))
						: t.type === d.ENCODED_ENTITY
							? (r += t.parts[0])
							: (r += t.parts.join('')));
			if (r.length > 0) {
				let i = t.sourceSpan;
				this._addToParent(new kd(r, new v(n.start, i.end, n.fullStart, n.details), u));
			}
		}
		_closeVoidElement() {
			var t;
			let u = this._getContainer();
			u !== null && !((t = this._getTagDefinition(u)) === null || t === void 0) && t.isVoid && this._containerStack.pop();
		}
		_consumeElementStartTag(t) {
			var u;
			let n = [],
				r = [];
			this._consumeAttributesAndDirectives(n, r);
			let a = this._getElementFullName(t, this._getClosestElementLikeParent()),
				i = this._getTagDefinition(a),
				s = !1;
			if (this._peek.type === d.TAG_OPEN_END_VOID) {
				(this._advance(), (s = !0));
				let T = this._getTagDefinition(a);
				this.canSelfClose ||
					T?.canSelfClose ||
					Bt(a) !== null ||
					T?.isVoid ||
					this.errors.push(F.create(a, t.sourceSpan, `Only void, custom and foreign elements can be self closed "${t.parts[1]}"`));
			} else this._peek.type === d.TAG_OPEN_END && (this._advance(), (s = !1));
			let o = this._peek.sourceSpan.fullStart,
				l = new v(t.sourceSpan.start, o, t.sourceSpan.fullStart),
				h = new v(t.sourceSpan.start, o, t.sourceSpan.fullStart),
				x = new v(t.sourceSpan.start.moveBy(1), t.sourceSpan.end),
				_ = new be(a, n, r, [], s, l, h, void 0, x, i?.isVoid ?? !1),
				m = this._getContainer(),
				b = m !== null && !!(!((u = this._getTagDefinition(m)) === null || u === void 0) && u.isClosedByChild(_.name));
			(this._pushContainer(_, b),
				s
					? this._popContainer(a, be, l)
					: t.type === d.INCOMPLETE_TAG_OPEN &&
						(this._popContainer(a, be, null), this.errors.push(F.create(a, l, `Opening tag "${a}" not terminated.`))));
		}
		_consumeComponentStartTag(t) {
			var u;
			let n = t.parts[0],
				r = [],
				a = [];
			this._consumeAttributesAndDirectives(r, a);
			let i = this._getClosestElementLikeParent(),
				s = this._getComponentTagName(t, i),
				o = this._getComponentFullName(t, i),
				l = this._peek.type === d.COMPONENT_OPEN_END_VOID;
			this._advance();
			let h = this._peek.sourceSpan.fullStart,
				x = new v(t.sourceSpan.start, h, t.sourceSpan.fullStart),
				_ = new v(t.sourceSpan.start, h, t.sourceSpan.fullStart),
				m = new me(n, s, o, r, a, [], l, x, _, void 0),
				b = this._getContainer(),
				T = b !== null && m.tagName !== null && !!(!((u = this._getTagDefinition(b)) === null || u === void 0) && u.isClosedByChild(m.tagName));
			(this._pushContainer(m, T),
				l
					? this._popContainer(o, me, x)
					: t.type === d.INCOMPLETE_COMPONENT_OPEN &&
						(this._popContainer(o, me, null), this.errors.push(F.create(o, x, `Opening tag "${o}" not terminated.`))));
		}
		_consumeAttributesAndDirectives(t, u) {
			for (; this._peek.type === d.ATTR_NAME || this._peek.type === d.DIRECTIVE_NAME; )
				this._peek.type === d.DIRECTIVE_NAME ? u.push(this._consumeDirective(this._peek)) : t.push(this._consumeAttr(this._advance()));
		}
		_consumeComponentEndTag(t) {
			let u = this._getComponentFullName(t, this._getClosestElementLikeParent());
			if (!this._popContainer(u, me, t.sourceSpan)) {
				let n = this._containerStack[this._containerStack.length - 1],
					r;
				n instanceof me && n.componentName === t.parts[0]
					? (r = `, did you mean "${n.fullName}"?`)
					: (r = '. It may happen when the tag has already been closed by another tag.');
				let a = `Unexpected closing tag "${u}"${r}`;
				this.errors.push(F.create(u, t.sourceSpan, a));
			}
		}
		_getTagDefinition(t) {
			return typeof t == 'string'
				? this.tagDefinitionResolver(t)
				: t instanceof be
					? this.tagDefinitionResolver(t.name)
					: t instanceof me && t.tagName !== null
						? this.tagDefinitionResolver(t.tagName)
						: null;
		}
		_pushContainer(t, u) {
			(u && this._containerStack.pop(), this._addToParent(t), this._containerStack.push(t));
		}
		_consumeElementEndTag(t) {
			var u;
			let n = this.allowHtmComponentClosingTags && t.parts.length === 0 ? null : this._getElementFullName(t, this._getClosestElementLikeParent());
			if (n && !((u = this._getTagDefinition(n)) === null || u === void 0) && u.isVoid)
				this.errors.push(F.create(n, t.sourceSpan, `Void elements do not have end tags "${t.parts[1]}"`));
			else if (!this._popContainer(n, be, t.sourceSpan)) {
				let r = `Unexpected closing tag "${n}". It may happen when the tag has already been closed by another tag. For more info see https://www.w3.org/TR/html5/syntax.html#closing-elements-that-have-implied-end-tags`;
				this.errors.push(F.create(n, t.sourceSpan, r));
			}
		}
		_popContainer(t, u, n) {
			let r = !1;
			for (let i = this._containerStack.length - 1; i >= 0; i--) {
				var a;
				let s = this._containerStack[i],
					o = s instanceof me ? s.fullName : s.name;
				if (Bt(o) ? o === t : (o === t || t === null) && s instanceof u)
					return (
						(s.endSourceSpan = n),
						(s.sourceSpan.end = n !== null ? n.end : s.sourceSpan.end),
						this._containerStack.splice(i, this._containerStack.length - i),
						!r
					);
				(s instanceof De || !(!((a = this._getTagDefinition(s)) === null || a === void 0) && a.closedByParent)) && (r = !0);
			}
			return !1;
		}
		_consumeAttr(t) {
			let u = nt(t.parts[0], t.parts[1]),
				n = t.sourceSpan.end,
				r;
			this._peek.type === d.ATTR_QUOTE && (r = this._advance());
			let a = '',
				i = [],
				s,
				o;
			if (this._peek.type === d.ATTR_VALUE_TEXT)
				for (
					s = this._peek.sourceSpan, o = this._peek.sourceSpan.end;
					this._peek.type === d.ATTR_VALUE_TEXT || this._peek.type === d.ATTR_VALUE_INTERPOLATION || this._peek.type === d.ENCODED_ENTITY;
				) {
					let h = this._advance();
					(i.push(h),
						h.type === d.ATTR_VALUE_INTERPOLATION
							? (a += h.parts.join('').replace(/&([^;]+);/g, cr))
							: h.type === d.ENCODED_ENTITY
								? (a += h.parts[0])
								: (a += h.parts.join('')),
						(o = n = h.sourceSpan.end));
				}
			this._peek.type === d.ATTR_QUOTE && (o = n = this._advance().sourceSpan.end);
			let l = s && o && new v(r?.sourceSpan.start ?? s.start, o, r?.sourceSpan.fullStart ?? s.fullStart);
			return new wd(u, a, new v(t.sourceSpan.start, n, t.sourceSpan.fullStart), t.sourceSpan, l, i.length > 0 ? i : void 0, void 0);
		}
		_consumeDirective(t) {
			let u = [],
				n = t.sourceSpan.end,
				r = null;
			if ((this._advance(), this._peek.type === d.DIRECTIVE_OPEN)) {
				for (n = this._peek.sourceSpan.end, this._advance(); this._peek.type === d.ATTR_NAME; ) u.push(this._consumeAttr(this._advance()));
				this._peek.type === d.DIRECTIVE_CLOSE
					? ((r = this._peek.sourceSpan), this._advance())
					: this.errors.push(F.create(null, t.sourceSpan, 'Unterminated directive definition'));
			}
			let a = new v(t.sourceSpan.start, n, t.sourceSpan.fullStart),
				i = new v(a.start, r === null ? t.sourceSpan.end : r.end, a.fullStart);
			return new Ld(t.parts[0], u, i, a, r);
		}
		_consumeBlockOpen(t) {
			let u = [];
			for (; this._peek.type === d.BLOCK_PARAMETER; ) {
				let s = this._advance();
				u.push(new tr(s.parts[0], s.sourceSpan));
			}
			this._peek.type === d.BLOCK_OPEN_END && this._advance();
			let n = this._peek.sourceSpan.fullStart,
				r = new v(t.sourceSpan.start, n, t.sourceSpan.fullStart),
				a = new v(t.sourceSpan.start, n, t.sourceSpan.fullStart),
				i = new De(t.parts[0], u, [], r, t.sourceSpan, a);
			this._pushContainer(i, !1);
		}
		_consumeBlockClose(t) {
			this._popContainer(null, De, t.sourceSpan) ||
				this.errors.push(
					F.create(
						null,
						t.sourceSpan,
						'Unexpected closing block. The block may have been closed earlier. If you meant to write the } character, you should use the "&#125;" HTML entity instead.'
					)
				);
		}
		_consumeIncompleteBlock(t) {
			let u = [];
			for (; this._peek.type === d.BLOCK_PARAMETER; ) {
				let s = this._advance();
				u.push(new tr(s.parts[0], s.sourceSpan));
			}
			let n = this._peek.sourceSpan.fullStart,
				r = new v(t.sourceSpan.start, n, t.sourceSpan.fullStart),
				a = new v(t.sourceSpan.start, n, t.sourceSpan.fullStart),
				i = new De(t.parts[0], u, [], r, t.sourceSpan, a);
			(this._pushContainer(i, !1),
				this._popContainer(null, De, null),
				this.errors.push(
					F.create(
						t.parts[0],
						r,
						`Incomplete block "${t.parts[0]}". If you meant to write the @ character, you should use the "&#64;" HTML entity instead.`
					)
				));
		}
		_consumeLet(t) {
			let u = t.parts[0],
				n,
				r;
			if (this._peek.type !== d.LET_VALUE) {
				this.errors.push(F.create(t.parts[0], t.sourceSpan, `Invalid @let declaration "${u}". Declaration must have a value.`));
				return;
			} else n = this._advance();
			if (this._peek.type !== d.LET_END) {
				this.errors.push(
					F.create(t.parts[0], t.sourceSpan, `Unterminated @let declaration "${u}". Declaration must be terminated with a semicolon.`)
				);
				return;
			} else r = this._advance();
			let a = r.sourceSpan.fullStart,
				i = new v(t.sourceSpan.start, a, t.sourceSpan.fullStart),
				s = t.sourceSpan.toString().lastIndexOf(u),
				o = new v(t.sourceSpan.start.moveBy(s), t.sourceSpan.end),
				l = new ur(u, n.parts[0], i, o, n.sourceSpan);
			this._addToParent(l);
		}
		_consumeIncompleteLet(t) {
			let u = t.parts[0] ?? '',
				n = u ? ` "${u}"` : '';
			if (u.length > 0) {
				let r = t.sourceSpan.toString().lastIndexOf(u),
					a = new v(t.sourceSpan.start.moveBy(r), t.sourceSpan.end),
					i = new v(t.sourceSpan.start, t.sourceSpan.start.moveBy(0)),
					s = new ur(u, '', t.sourceSpan, a, i);
				this._addToParent(s);
			}
			this.errors.push(
				F.create(t.parts[0], t.sourceSpan, `Incomplete @let declaration${n}. @let declarations must be written as \`@let <name> = <value>;\``)
			);
		}
		_getContainer() {
			return this._containerStack.length > 0 ? this._containerStack[this._containerStack.length - 1] : null;
		}
		_getClosestElementLikeParent() {
			for (let t = this._containerStack.length - 1; t > -1; t--) {
				let u = this._containerStack[t];
				if (u instanceof be || u instanceof me) return u;
			}
			return null;
		}
		_addToParent(t) {
			let u = this._getContainer();
			u === null ? this.rootNodes.push(t) : u.children.push(t);
		}
		_getElementFullName(t, u) {
			return nt(this._getPrefix(t, u), t.parts[1]);
		}
		_getComponentFullName(t, u) {
			let n = t.parts[0],
				r = this._getComponentTagName(t, u);
			return r === null ? n : r.startsWith(':') ? n + r : `${n}:${r}`;
		}
		_getComponentTagName(t, u) {
			let n = this._getPrefix(t, u),
				r = t.parts[2];
			return !n && !r ? null : !n && r ? r : nt(n, r || 'ng-component');
		}
		_getPrefix(t, u) {
			var n;
			let r, a;
			if (
				(t.type === d.COMPONENT_OPEN_START || t.type === d.INCOMPLETE_COMPONENT_OPEN || t.type === d.COMPONENT_CLOSE
					? ((r = t.parts[1]), (a = t.parts[2]))
					: ((r = t.parts[0]), (a = t.parts[1])),
				(r = r || ((n = this._getTagDefinition(a)) === null || n === void 0 ? void 0 : n.implicitNamespacePrefix) || ''),
				!r && u)
			) {
				let i = u instanceof be ? u.name : u.tagName;
				if (i !== null) {
					let s = Yt(i)[1],
						o = this._getTagDefinition(s);
					o !== null && !o.preventNamespaceInheritance && (r = Bt(i));
				}
			}
			return r;
		}
	};
function or(e, t) {
	return e.length > 0 && e[e.length - 1] === t;
}
function cr(e, t) {
	return ct[t] !== void 0
		? ct[t] || e
		: /^#x[a-f0-9]+$/i.test(t)
			? String.fromCodePoint(parseInt(t.slice(2), 16))
			: /^#\d+$/.test(t)
				? String.fromCodePoint(parseInt(t.slice(1), 10))
				: e;
}
var Kd = class extends Xd {
		constructor() {
			super(Su);
		}
		parse(e, t, u, n = !1, r) {
			return super.parse(e, t, u, n, r);
		}
	},
	ou = null,
	Qd = () => (ou || (ou = new Kd()), ou);
function Au(e, t = {}) {
	let {
		canSelfClose: u = !1,
		allowHtmComponentClosingTags: n = !1,
		isTagNameCaseSensitive: r = !1,
		getTagContentType: a,
		tokenizeAngularBlocks: i = !1,
		tokenizeAngularLetDeclaration: s = !1,
		enableAngularSelectorlessSyntax: o = !1
	} = t;
	return Qd().parse(
		e,
		'angular-html-parser',
		{ tokenizeExpansionForms: i, canSelfClose: u, allowHtmComponentClosingTags: n, tokenizeBlocks: i, tokenizeLet: s, selectorlessEnabled: o },
		r,
		a
	);
}
var Jd = [e2, t2, n2, a2, i2, c2, s2, o2, l2, r2];
function Zd(e, t) {
	for (let u of Jd) u(e, t);
	return e;
}
function e2(e) {
	e.walk((t) => {
		if (
			t.kind === 'element' &&
			t.tagDefinition.ignoreFirstLf &&
			t.children.length > 0 &&
			t.children[0].kind === 'text' &&
			t.children[0].value[0] ===
				`
`
		) {
			let u = t.children[0];
			u.value.length === 1 ? t.removeChild(u) : (u.value = u.value.slice(1));
		}
	});
}
function t2(e) {
	let t = (u) =>
		u.kind === 'element' &&
		u.prev?.kind === 'ieConditionalStartComment' &&
		u.prev.sourceSpan.end.offset === u.startSourceSpan.start.offset &&
		u.firstChild?.kind === 'ieConditionalEndComment' &&
		u.firstChild.sourceSpan.start.offset === u.startSourceSpan.end.offset;
	e.walk((u) => {
		if (u.children)
			for (let n = 0; n < u.children.length; n++) {
				let r = u.children[n];
				if (!t(r)) continue;
				let a = r.prev,
					i = r.firstChild;
				(u.removeChild(a), n--);
				let s = new v(a.sourceSpan.start, i.sourceSpan.end),
					o = new v(s.start, r.sourceSpan.end);
				((r.condition = a.condition), (r.sourceSpan = o), (r.startSourceSpan = s), r.removeChild(i));
			}
	});
}
function u2(e, t, u) {
	e.walk((n) => {
		if (n.children)
			for (let r = 0; r < n.children.length; r++) {
				let a = n.children[r];
				if (a.kind !== 'text' && !t(a)) continue;
				a.kind !== 'text' && ((a.kind = 'text'), (a.value = u(a)));
				let i = a.prev;
				!i || i.kind !== 'text' || ((i.value += a.value), (i.sourceSpan = new v(i.sourceSpan.start, a.sourceSpan.end)), n.removeChild(a), r--);
			}
	});
}
function n2(e) {
	return u2(
		e,
		(t) => t.kind === 'cdata',
		(t) => `<![CDATA[${t.value}]]>`
	);
}
function r2(e) {
	let t = (u) =>
		u.kind === 'element' &&
		u.attrs.length === 0 &&
		u.children.length === 1 &&
		u.firstChild.kind === 'text' &&
		!J.hasWhitespaceCharacter(u.children[0].value) &&
		!u.firstChild.hasLeadingSpaces &&
		!u.firstChild.hasTrailingSpaces &&
		u.isLeadingSpaceSensitive &&
		!u.hasLeadingSpaces &&
		u.isTrailingSpaceSensitive &&
		!u.hasTrailingSpaces &&
		u.prev?.kind === 'text' &&
		u.next?.kind === 'text';
	e.walk((u) => {
		if (u.children)
			for (let n = 0; n < u.children.length; n++) {
				let r = u.children[n];
				if (!t(r)) continue;
				let a = r.prev,
					i = r.next;
				((a.value += `<${r.rawName}>` + r.firstChild.value + `</${r.rawName}>` + i.value),
					(a.sourceSpan = new v(a.sourceSpan.start, i.sourceSpan.end)),
					(a.isTrailingSpaceSensitive = i.isTrailingSpaceSensitive),
					(a.hasTrailingSpaces = i.hasTrailingSpaces),
					u.removeChild(r),
					n--,
					u.removeChild(i));
			}
	});
}
function a2(e, t) {
	if (t.parser === 'html') return;
	let u = /\{\{(.+?)\}\}/su;
	e.walk((n) => {
		if (Al(n, t))
			for (let r of n.children) {
				if (r.kind !== 'text') continue;
				let a = r.sourceSpan.start,
					i = null,
					s = r.value.split(u);
				for (let o = 0; o < s.length; o++, a = i) {
					let l = s[o];
					if (o % 2 === 0) {
						((i = a.moveBy(l.length)), l.length > 0 && n.insertChildBefore(r, { kind: 'text', value: l, sourceSpan: new v(a, i) }));
						continue;
					}
					((i = a.moveBy(l.length + 4)),
						n.insertChildBefore(r, {
							kind: 'interpolation',
							sourceSpan: new v(a, i),
							children: l.length === 0 ? [] : [{ kind: 'text', value: l, sourceSpan: new v(a.moveBy(2), i.moveBy(-2)) }]
						}));
				}
				n.removeChild(r);
			}
	});
}
function i2(e, t) {
	e.walk((u) => {
		let n = u.$children;
		if (!n) return;
		if (n.length === 0 || (n.length === 1 && n[0].kind === 'text' && J.trim(n[0].value).length === 0)) {
			((u.hasDanglingSpaces = n.length > 0), (u.$children = []));
			return;
		}
		let r = wl(u, t),
			a = ka(u);
		if (!r)
			for (let i = 0; i < n.length; i++) {
				let s = n[i];
				if (s.kind !== 'text') continue;
				let { leadingWhitespace: o, text: l, trailingWhitespace: h } = Cl(s.value),
					x = s.prev,
					_ = s.next;
				l
					? ((s.value = l),
						(s.sourceSpan = new v(s.sourceSpan.start.moveBy(o.length), s.sourceSpan.end.moveBy(-h.length))),
						o && (x && (x.hasTrailingSpaces = !0), (s.hasLeadingSpaces = !0)),
						h && ((s.hasTrailingSpaces = !0), _ && (_.hasLeadingSpaces = !0)))
					: (u.removeChild(s), i--, (o || h) && (x && (x.hasTrailingSpaces = !0), _ && (_.hasLeadingSpaces = !0)));
			}
		((u.isWhitespaceSensitive = r), (u.isIndentationSensitive = a));
	});
}
function s2(e) {
	e.walk((t) => {
		t.isSelfClosing =
			!t.children ||
			(t.kind === 'element' &&
				(t.tagDefinition.isVoid ||
					(t.endSourceSpan && t.startSourceSpan.start === t.endSourceSpan.start && t.startSourceSpan.end === t.endSourceSpan.end)));
	});
}
function o2(e, t) {
	e.walk((u) => {
		u.kind === 'element' &&
			(u.hasHtmComponentClosingTag =
				u.endSourceSpan && /^<\s*\/\s*\/\s*>$/u.test(t.originalText.slice(u.endSourceSpan.start.offset, u.endSourceSpan.end.offset)));
	});
}
function c2(e, t) {
	e.walk((u) => {
		u.cssDisplay = Ul(u, t);
	});
}
function l2(e, t) {
	e.walk((u) => {
		let { children: n } = u;
		if (n) {
			if (n.length === 0) {
				u.isDanglingSpaceSensitive = Ll(u, t);
				return;
			}
			for (let r of n) ((r.isLeadingSpaceSensitive = yl(r, t)), (r.isTrailingSpaceSensitive = Nl(r, t)));
			for (let r = 0; r < n.length; r++) {
				let a = n[r];
				((a.isLeadingSpaceSensitive = (r === 0 || a.prev.isTrailingSpaceSensitive) && a.isLeadingSpaceSensitive),
					(a.isTrailingSpaceSensitive = (r === n.length - 1 || a.next.isLeadingSpaceSensitive) && a.isTrailingSpaceSensitive));
			}
		}
	});
}
var d2 = Zd;
function h2(e, t, u) {
	let { node: n } = e;
	switch (n.kind) {
		case 'root':
			return (t.__onHtmlRoot && t.__onHtmlRoot(n), [R(un(e, t, u)), P]);
		case 'element':
		case 'ieConditionalComment':
			return ld(e, t, u);
		case 'angularControlFlowBlock':
			return nd(e, t, u);
		case 'angularControlFlowBlockParameters':
			return sd(e, t, u);
		case 'angularControlFlowBlockParameter':
			return J.trim(n.expression);
		case 'angularLetDeclaration':
			return R(['@let ', R([n.id, ' =', R(se([O, u('init')]))]), ';']);
		case 'angularLetDeclarationInitializer':
			return n.value;
		case 'angularIcuExpression':
			return od(e, t, u);
		case 'angularIcuCase':
			return cd(e, t, u);
		case 'ieConditionalStartComment':
		case 'ieConditionalEndComment':
			return [tt(n), et(n)];
		case 'interpolation':
			return [tt(n, t), ...e.map(u, 'children'), et(n, t)];
		case 'text': {
			if (n.parent.kind === 'interpolation') {
				let s = /\n[^\S\n]*$/u,
					o = s.test(n.value),
					l = o ? n.value.replace(s, '') : n.value;
				return [ie(l), o ? P : ''];
			}
			let r = Ae(n, t),
				a = Ba(n),
				i = Ce(n, t);
			return ((a[0] = [r, a[0]]), a.push([a.pop(), i]), ma(a));
		}
		case 'docType':
			return [R([tt(n, t), ' ', $(0, n.value.replace(/^html\b/iu, 'html'), /\s+/gu, ' ')]), et(n, t)];
		case 'comment':
			return [Ae(n, t), ie(t.originalText.slice(bt(n), zt(n))), Ce(n, t)];
		case 'attribute': {
			if (n.value === null) return n.rawName;
			let r = Da(n.value),
				a = Pa(n, t) ? '' : Uc(r, '"');
			return [n.rawName, '=', a, ie(a === '"' ? $(0, r, '"', '&quot;') : $(0, r, "'", '&apos;')), a];
		}
		case 'frontMatter':
		case 'cdata':
		default:
			throw new Kc(n, 'HTML');
	}
}
var f2 = {
		features: { experimental_frontMatterSupport: { massageAstNode: !0, embed: !0, print: !0 } },
		preprocess: d2,
		print: h2,
		insertPragma: td,
		massageAstNode: Zc,
		embed: W0,
		getVisitorKeys: Y0
	},
	p2 = f2,
	Ya = [
		{
			name: 'Angular',
			type: 'markup',
			aceMode: 'html',
			extensions: ['.component.html'],
			tmScope: 'text.html.basic',
			aliases: ['xhtml'],
			codemirrorMode: 'htmlmixed',
			codemirrorMimeType: 'text/html',
			parsers: ['angular'],
			vscodeLanguageIds: ['html'],
			filenames: [],
			linguistLanguageId: 146
		},
		{
			name: 'HTML',
			type: 'markup',
			aceMode: 'html',
			extensions: ['.html', '.hta', '.htm', '.html.hl', '.inc', '.xht', '.xhtml'],
			tmScope: 'text.html.basic',
			aliases: ['xhtml'],
			codemirrorMode: 'htmlmixed',
			codemirrorMimeType: 'text/html',
			parsers: ['html'],
			vscodeLanguageIds: ['html'],
			linguistLanguageId: 146
		},
		{
			name: 'Lightning Web Components',
			type: 'markup',
			aceMode: 'html',
			extensions: [],
			tmScope: 'text.html.basic',
			aliases: ['xhtml'],
			codemirrorMode: 'htmlmixed',
			codemirrorMimeType: 'text/html',
			parsers: ['lwc'],
			vscodeLanguageIds: ['html'],
			filenames: [],
			linguistLanguageId: 146
		},
		{
			name: 'MJML',
			type: 'markup',
			aceMode: 'html',
			extensions: ['.mjml'],
			tmScope: 'text.mjml.basic',
			aliases: ['MJML', 'mjml'],
			codemirrorMode: 'htmlmixed',
			codemirrorMimeType: 'text/html',
			parsers: ['mjml'],
			filenames: [],
			vscodeLanguageIds: ['mjml'],
			linguistLanguageId: 146
		},
		{
			name: 'Vue',
			type: 'markup',
			aceMode: 'vue',
			extensions: ['.vue'],
			tmScope: 'source.vue',
			codemirrorMode: 'vue',
			codemirrorMimeType: 'text/x-vue',
			parsers: ['vue'],
			vscodeLanguageIds: ['vue'],
			linguistLanguageId: 391
		}
	],
	lr = {
		bracketSameLine: {
			category: 'Common',
			type: 'boolean',
			default: !1,
			description: 'Put > of opening tags on the last line instead of on a new line.'
		},
		singleAttributePerLine: {
			category: 'Common',
			type: 'boolean',
			default: !1,
			description: 'Enforce single attribute per line in HTML, Vue and JSX.'
		}
	},
	dr = 'HTML',
	m2 = {
		bracketSameLine: lr.bracketSameLine,
		htmlWhitespaceSensitivity: {
			category: dr,
			type: 'choice',
			default: 'css',
			description: 'How to handle whitespaces in HTML.',
			choices: [
				{ value: 'css', description: 'Respect the default value of CSS display property.' },
				{ value: 'strict', description: 'Whitespaces are considered sensitive.' },
				{ value: 'ignore', description: 'Whitespaces are considered insensitive.' }
			]
		},
		singleAttributePerLine: lr.singleAttributePerLine,
		vueIndentScriptAndStyle: { category: dr, type: 'boolean', default: !1, description: 'Indent script and style tags in Vue files.' }
	},
	Ka = m2,
	rn = {};
na(rn, { angular: () => U2, html: () => H2, lwc: () => j2, mjml: () => W2, vue: () => $2 });
function g2(e, t) {
	let u = new SyntaxError(e + ' (' + t.loc.start.line + ':' + t.loc.start.column + ')');
	return Object.assign(u, t);
}
var b2 = g2,
	x2 = {
		canSelfClose: !0,
		normalizeTagName: !1,
		normalizeAttributeName: !1,
		allowHtmComponentClosingTags: !1,
		isTagNameCaseSensitive: !1,
		shouldParseFrontMatter: !0
	};
function Qa(e) {
	return { ...x2, ...e };
}
function Ja(e) {
	let {
		canSelfClose: t,
		allowHtmComponentClosingTags: u,
		isTagNameCaseSensitive: n,
		shouldParseAsRawText: r,
		tokenizeAngularBlocks: a,
		tokenizeAngularLetDeclaration: i
	} = e;
	return {
		canSelfClose: t,
		allowHtmComponentClosingTags: u,
		isTagNameCaseSensitive: n,
		getTagContentType: r ? (...s) => (r(...s) ? de.RAW_TEXT : void 0) : void 0,
		tokenizeAngularBlocks: a,
		tokenizeAngularLetDeclaration: i
	};
}
var cu = new Map([
		[
			'*',
			new Set([
				'accesskey',
				'autocapitalize',
				'autocorrect',
				'autofocus',
				'class',
				'contenteditable',
				'dir',
				'draggable',
				'enterkeyhint',
				'exportparts',
				'hidden',
				'id',
				'inert',
				'inputmode',
				'is',
				'itemid',
				'itemprop',
				'itemref',
				'itemscope',
				'itemtype',
				'lang',
				'nonce',
				'part',
				'popover',
				'slot',
				'spellcheck',
				'style',
				'tabindex',
				'title',
				'translate',
				'writingsuggestions'
			])
		],
		['a', new Set(['charset', 'coords', 'download', 'href', 'hreflang', 'name', 'ping', 'referrerpolicy', 'rel', 'rev', 'shape', 'target', 'type'])],
		['applet', new Set(['align', 'alt', 'archive', 'code', 'codebase', 'height', 'hspace', 'name', 'object', 'vspace', 'width'])],
		['area', new Set(['alt', 'coords', 'download', 'href', 'hreflang', 'nohref', 'ping', 'referrerpolicy', 'rel', 'shape', 'target', 'type'])],
		['audio', new Set(['autoplay', 'controls', 'crossorigin', 'loop', 'muted', 'preload', 'src'])],
		['base', new Set(['href', 'target'])],
		['basefont', new Set(['color', 'face', 'size'])],
		['blockquote', new Set(['cite'])],
		['body', new Set(['alink', 'background', 'bgcolor', 'link', 'text', 'vlink'])],
		['br', new Set(['clear'])],
		[
			'button',
			new Set([
				'command',
				'commandfor',
				'disabled',
				'form',
				'formaction',
				'formenctype',
				'formmethod',
				'formnovalidate',
				'formtarget',
				'name',
				'popovertarget',
				'popovertargetaction',
				'type',
				'value'
			])
		],
		['canvas', new Set(['height', 'width'])],
		['caption', new Set(['align'])],
		['col', new Set(['align', 'char', 'charoff', 'span', 'valign', 'width'])],
		['colgroup', new Set(['align', 'char', 'charoff', 'span', 'valign', 'width'])],
		['data', new Set(['value'])],
		['del', new Set(['cite', 'datetime'])],
		['details', new Set(['name', 'open'])],
		['dialog', new Set(['closedby', 'open'])],
		['dir', new Set(['compact'])],
		['div', new Set(['align'])],
		['dl', new Set(['compact'])],
		['embed', new Set(['height', 'src', 'type', 'width'])],
		['fieldset', new Set(['disabled', 'form', 'name'])],
		['font', new Set(['color', 'face', 'size'])],
		['form', new Set(['accept', 'accept-charset', 'action', 'autocomplete', 'enctype', 'method', 'name', 'novalidate', 'target'])],
		['frame', new Set(['frameborder', 'longdesc', 'marginheight', 'marginwidth', 'name', 'noresize', 'scrolling', 'src'])],
		['frameset', new Set(['cols', 'rows'])],
		['h1', new Set(['align'])],
		['h2', new Set(['align'])],
		['h3', new Set(['align'])],
		['h4', new Set(['align'])],
		['h5', new Set(['align'])],
		['h6', new Set(['align'])],
		['head', new Set(['profile'])],
		['hr', new Set(['align', 'noshade', 'size', 'width'])],
		['html', new Set(['manifest', 'version'])],
		[
			'iframe',
			new Set([
				'align',
				'allow',
				'allowfullscreen',
				'allowpaymentrequest',
				'allowusermedia',
				'frameborder',
				'height',
				'loading',
				'longdesc',
				'marginheight',
				'marginwidth',
				'name',
				'referrerpolicy',
				'sandbox',
				'scrolling',
				'src',
				'srcdoc',
				'width'
			])
		],
		[
			'img',
			new Set([
				'align',
				'alt',
				'border',
				'crossorigin',
				'decoding',
				'fetchpriority',
				'height',
				'hspace',
				'ismap',
				'loading',
				'longdesc',
				'name',
				'referrerpolicy',
				'sizes',
				'src',
				'srcset',
				'usemap',
				'vspace',
				'width'
			])
		],
		[
			'input',
			new Set([
				'accept',
				'align',
				'alpha',
				'alt',
				'autocomplete',
				'checked',
				'colorspace',
				'dirname',
				'disabled',
				'form',
				'formaction',
				'formenctype',
				'formmethod',
				'formnovalidate',
				'formtarget',
				'height',
				'ismap',
				'list',
				'max',
				'maxlength',
				'min',
				'minlength',
				'multiple',
				'name',
				'pattern',
				'placeholder',
				'popovertarget',
				'popovertargetaction',
				'readonly',
				'required',
				'size',
				'src',
				'step',
				'type',
				'usemap',
				'value',
				'width'
			])
		],
		['ins', new Set(['cite', 'datetime'])],
		['isindex', new Set(['prompt'])],
		['label', new Set(['for', 'form'])],
		['legend', new Set(['align'])],
		['li', new Set(['type', 'value'])],
		[
			'link',
			new Set([
				'as',
				'blocking',
				'charset',
				'color',
				'crossorigin',
				'disabled',
				'fetchpriority',
				'href',
				'hreflang',
				'imagesizes',
				'imagesrcset',
				'integrity',
				'media',
				'referrerpolicy',
				'rel',
				'rev',
				'sizes',
				'target',
				'type'
			])
		],
		['map', new Set(['name'])],
		['menu', new Set(['compact'])],
		['meta', new Set(['charset', 'content', 'http-equiv', 'media', 'name', 'scheme'])],
		['meter', new Set(['high', 'low', 'max', 'min', 'optimum', 'value'])],
		[
			'object',
			new Set([
				'align',
				'archive',
				'border',
				'classid',
				'codebase',
				'codetype',
				'data',
				'declare',
				'form',
				'height',
				'hspace',
				'name',
				'standby',
				'type',
				'typemustmatch',
				'usemap',
				'vspace',
				'width'
			])
		],
		['ol', new Set(['compact', 'reversed', 'start', 'type'])],
		['optgroup', new Set(['disabled', 'label'])],
		['option', new Set(['disabled', 'label', 'selected', 'value'])],
		['output', new Set(['for', 'form', 'name'])],
		['p', new Set(['align'])],
		['param', new Set(['name', 'type', 'value', 'valuetype'])],
		['pre', new Set(['width'])],
		['progress', new Set(['max', 'value'])],
		['q', new Set(['cite'])],
		[
			'script',
			new Set([
				'async',
				'blocking',
				'charset',
				'crossorigin',
				'defer',
				'fetchpriority',
				'integrity',
				'language',
				'nomodule',
				'referrerpolicy',
				'src',
				'type'
			])
		],
		['select', new Set(['autocomplete', 'disabled', 'form', 'multiple', 'name', 'required', 'size'])],
		['slot', new Set(['name'])],
		['source', new Set(['height', 'media', 'sizes', 'src', 'srcset', 'type', 'width'])],
		['style', new Set(['blocking', 'media', 'type'])],
		['table', new Set(['align', 'bgcolor', 'border', 'cellpadding', 'cellspacing', 'frame', 'rules', 'summary', 'width'])],
		['tbody', new Set(['align', 'char', 'charoff', 'valign'])],
		[
			'td',
			new Set([
				'abbr',
				'align',
				'axis',
				'bgcolor',
				'char',
				'charoff',
				'colspan',
				'headers',
				'height',
				'nowrap',
				'rowspan',
				'scope',
				'valign',
				'width'
			])
		],
		[
			'template',
			new Set(['shadowrootclonable', 'shadowrootcustomelementregistry', 'shadowrootdelegatesfocus', 'shadowrootmode', 'shadowrootserializable'])
		],
		[
			'textarea',
			new Set([
				'autocomplete',
				'cols',
				'dirname',
				'disabled',
				'form',
				'maxlength',
				'minlength',
				'name',
				'placeholder',
				'readonly',
				'required',
				'rows',
				'wrap'
			])
		],
		['tfoot', new Set(['align', 'char', 'charoff', 'valign'])],
		[
			'th',
			new Set([
				'abbr',
				'align',
				'axis',
				'bgcolor',
				'char',
				'charoff',
				'colspan',
				'headers',
				'height',
				'nowrap',
				'rowspan',
				'scope',
				'valign',
				'width'
			])
		],
		['thead', new Set(['align', 'char', 'charoff', 'valign'])],
		['time', new Set(['datetime'])],
		['tr', new Set(['align', 'bgcolor', 'char', 'charoff', 'valign'])],
		['track', new Set(['default', 'kind', 'label', 'src', 'srclang'])],
		['ul', new Set(['compact', 'type'])],
		['video', new Set(['autoplay', 'controls', 'crossorigin', 'height', 'loop', 'muted', 'playsinline', 'poster', 'preload', 'src', 'width'])]
	]),
	_2 = new Set([
		'a',
		'abbr',
		'acronym',
		'address',
		'applet',
		'area',
		'article',
		'aside',
		'audio',
		'b',
		'base',
		'basefont',
		'bdi',
		'bdo',
		'bgsound',
		'big',
		'blink',
		'blockquote',
		'body',
		'br',
		'button',
		'canvas',
		'caption',
		'center',
		'cite',
		'code',
		'col',
		'colgroup',
		'command',
		'content',
		'data',
		'datalist',
		'dd',
		'del',
		'details',
		'dfn',
		'dialog',
		'dir',
		'div',
		'dl',
		'dt',
		'em',
		'embed',
		'fencedframe',
		'fieldset',
		'figcaption',
		'figure',
		'font',
		'footer',
		'form',
		'frame',
		'frameset',
		'h1',
		'h2',
		'h3',
		'h4',
		'h5',
		'h6',
		'head',
		'header',
		'hgroup',
		'hr',
		'html',
		'i',
		'iframe',
		'image',
		'img',
		'input',
		'ins',
		'isindex',
		'kbd',
		'keygen',
		'label',
		'legend',
		'li',
		'link',
		'listing',
		'main',
		'map',
		'mark',
		'marquee',
		'math',
		'menu',
		'menuitem',
		'meta',
		'meter',
		'multicol',
		'nav',
		'nextid',
		'nobr',
		'noembed',
		'noframes',
		'noscript',
		'object',
		'ol',
		'optgroup',
		'option',
		'output',
		'p',
		'param',
		'picture',
		'plaintext',
		'pre',
		'progress',
		'q',
		'rb',
		'rbc',
		'rp',
		'rt',
		'rtc',
		'ruby',
		's',
		'samp',
		'script',
		'search',
		'section',
		'select',
		'selectedcontent',
		'shadow',
		'slot',
		'small',
		'source',
		'spacer',
		'span',
		'strike',
		'strong',
		'style',
		'sub',
		'summary',
		'sup',
		'svg',
		'table',
		'tbody',
		'td',
		'template',
		'textarea',
		'tfoot',
		'th',
		'thead',
		'time',
		'title',
		'tr',
		'track',
		'tt',
		'u',
		'ul',
		'var',
		'video',
		'wbr',
		'xmp'
	]),
	Nt = { attrs: !0, children: !0, cases: !0, expression: !0 },
	hr = new Set(['parent']),
	Oe,
	wu,
	yu,
	E2 = class Ze {
		constructor(t = {}) {
			(Sc(this, Oe), Fn(this, 'kind'), Fn(this, 'parent'));
			for (let u of new Set([...hr, ...Object.keys(t)])) this.setProperty(u, t[u]);
			if (Ut(t)) for (let u of Object.getOwnPropertySymbols(t)) this.setProperty(u, t[u]);
		}
		setProperty(t, u) {
			if (this[t] !== u) {
				if ((t in Nt && (u = u.map((n) => this.createChild(n))), !hr.has(t))) {
					this[t] = u;
					return;
				}
				Object.defineProperty(this, t, { value: u, enumerable: !1, configurable: !0 });
			}
		}
		map(t) {
			let u;
			for (let n in Nt) {
				let r = this[n];
				if (r) {
					let a = v2(r, (i) => i.map(t));
					u !== r && (u || (u = new Ze({ parent: this.parent })), u.setProperty(n, a));
				}
			}
			if (u) for (let n in this) n in Nt || (u[n] = this[n]);
			return t(u || this);
		}
		walk(t) {
			for (let u in Nt) {
				let n = this[u];
				if (n) for (let r = 0; r < n.length; r++) n[r].walk(t);
			}
			t(this);
		}
		createChild(t) {
			let u = t instanceof Ze ? t.clone() : new Ze(t);
			return (u.setProperty('parent', this), u);
		}
		insertChildBefore(t, u) {
			let n = this.$children;
			n.splice(n.indexOf(t), 0, this.createChild(u));
		}
		removeChild(t) {
			let u = this.$children;
			u.splice(u.indexOf(t), 1);
		}
		replaceChild(t, u) {
			let n = this.$children;
			n[n.indexOf(t)] = this.createChild(u);
		}
		clone() {
			return new Ze(this);
		}
		get $children() {
			return this[Tt(this, Oe, wu)];
		}
		set $children(t) {
			this[Tt(this, Oe, wu)] = t;
		}
		get firstChild() {
			return this.$children?.[0];
		}
		get lastChild() {
			return He(1, this.$children, -1);
		}
		get prev() {
			let t = Tt(this, Oe, yu);
			return t[t.indexOf(this) - 1];
		}
		get next() {
			let t = Tt(this, Oe, yu);
			return t[t.indexOf(this) + 1];
		}
		get rawName() {
			return this.hasExplicitNamespace ? this.fullName : this.name;
		}
		get fullName() {
			return this.namespace ? this.namespace + ':' + this.name : this.name;
		}
		get attrMap() {
			return Object.fromEntries(this.attrs.map((t) => [t.fullName, t.value]));
		}
	};
((Oe = new WeakSet()),
	(wu = function () {
		return this.kind === 'angularIcuCase' ? 'expression' : this.kind === 'angularIcuExpression' ? 'cases' : 'children';
	}),
	(yu = function () {
		return this.parent?.$children ?? [];
	}));
var S2 = E2;
function v2(e, t) {
	let u = e.map(t);
	return u.some((n, r) => n !== e[r]) ? u : e;
}
var k2 = [
	{ regex: /^(?<openingTagSuffix>\[if(?<condition>[^\]]*)\]>)(?<data>.*?)<!\s*\[endif\]$/su, parse: T2 },
	{ regex: /^\[if(?<condition>[^\]]*)\]><!$/u, parse: A2 },
	{ regex: /^<!\s*\[endif\]$/u, parse: w2 }
];
function C2(e, t) {
	if (e.value)
		for (let { regex: u, parse: n } of k2) {
			let r = e.value.match(u);
			if (r) return n(e, r, t);
		}
	return null;
}
function T2(e, t, u) {
	let { openingTagSuffix: n, condition: r, data: a } = t.groups,
		i = 4 + n.length,
		s = e.sourceSpan.start.moveBy(i),
		o = s.moveBy(a.length),
		[l, h] = (() => {
			try {
				return [!0, u(a, s).children];
			} catch {
				return [!1, [{ kind: 'text', value: a, sourceSpan: new v(s, o) }]];
			}
		})();
	return {
		kind: 'ieConditionalComment',
		complete: l,
		children: h,
		condition: $(0, r.trim(), /\s+/gu, ' '),
		sourceSpan: e.sourceSpan,
		startSourceSpan: new v(e.sourceSpan.start, s),
		endSourceSpan: new v(o, e.sourceSpan.end)
	};
}
function A2(e, t) {
	let { condition: u } = t.groups;
	return { kind: 'ieConditionalStartComment', condition: $(0, u.trim(), /\s+/gu, ' '), sourceSpan: e.sourceSpan };
}
function w2(e) {
	return { kind: 'ieConditionalEndComment', sourceSpan: e.sourceSpan };
}
var y2 = class extends Dd {
	visitExpansionCase(e, t) {
		t.parseOptions.name === 'angular' &&
			this.visitChildren(t, (u) => {
				u(e.expression);
			});
	}
	visit(e, { parseOptions: t }) {
		(I2(e), P2(e, t), R2(e, t), O2(e));
	}
};
function N2(e, t, u, n) {
	(ja(new y2(), e.children, { parseOptions: u }), t && e.children.unshift(t));
	let r = new S2(e);
	return (
		r.walk((a) => {
			if (a.kind === 'comment') {
				let i = C2(a, n);
				i && a.parent.replaceChild(a, i);
			}
			(L2(a), D2(a), B2(a));
		}),
		r
	);
}
function L2(e) {
	if (e.kind === 'block') {
		if (((e.name = $(0, e.name.toLowerCase(), /\s+/gu, ' ').trim()), (e.kind = 'angularControlFlowBlock'), !Yu(e.parameters))) {
			delete e.parameters;
			return;
		}
		for (let t of e.parameters) t.kind = 'angularControlFlowBlockParameter';
		e.parameters = {
			kind: 'angularControlFlowBlockParameters',
			children: e.parameters,
			sourceSpan: new v(e.parameters[0].sourceSpan.start, He(0, e.parameters, -1).sourceSpan.end)
		};
	}
}
function D2(e) {
	e.kind === 'letDeclaration' &&
		((e.kind = 'angularLetDeclaration'),
		(e.id = e.name),
		(e.init = { kind: 'angularLetDeclarationInitializer', sourceSpan: new v(e.valueSpan.start, e.valueSpan.end), value: e.value }),
		delete e.name,
		delete e.value);
}
function B2(e) {
	(e.kind === 'expansion' && (e.kind = 'angularIcuExpression'), e.kind === 'expansionCase' && (e.kind = 'angularIcuCase'));
}
function fr(e, t) {
	let u = e.toLowerCase();
	return t(u) ? u : e;
}
function pr(e) {
	let t = e.name.startsWith(':') ? e.name.slice(1).split(':')[0] : null,
		u = e.nameSpan.toString(),
		n = t !== null && u.startsWith(`${t}:`),
		r = n ? u.slice(t.length + 1) : u;
	((e.name = r), (e.namespace = t), (e.hasExplicitNamespace = n));
}
function I2(e) {
	switch (e.kind) {
		case 'element':
			pr(e);
			for (let t of e.attrs)
				(pr(t), t.valueSpan ? ((t.value = t.valueSpan.toString()), /["']/u.test(t.value[0]) && (t.value = t.value.slice(1, -1))) : (t.value = null));
			break;
		case 'comment':
			e.value = e.sourceSpan.toString().slice(4, -3);
			break;
		case 'text':
			e.value = e.sourceSpan.toString();
			break;
	}
}
function P2(e, t) {
	if (e.kind === 'element') {
		let u = Su(t.isTagNameCaseSensitive ? e.name : e.name.toLowerCase());
		!e.namespace || e.namespace === u.implicitNamespacePrefix || mt(e) ? (e.tagDefinition = u) : (e.tagDefinition = Su(''));
	}
}
function O2(e) {
	e.sourceSpan && e.endSourceSpan && (e.sourceSpan = new v(e.sourceSpan.start, e.endSourceSpan.end));
}
function R2(e, t) {
	if (
		e.kind === 'element' &&
		(t.normalizeTagName &&
			(!e.namespace || e.namespace === e.tagDefinition.implicitNamespacePrefix || mt(e)) &&
			(e.name = fr(e.name, (u) => _2.has(u))),
		t.normalizeAttributeName)
	)
		for (let u of e.attrs) u.namespace || (u.name = fr(u.name, (n) => cu.has(e.name) && (cu.get('*').has(n) || cu.get(e.name).has(n))));
}
function Za(e, t) {
	let { rootNodes: u, errors: n } = Au(e, Ja(t));
	return (n.length > 0 && Nu(n[0]), { parseOptions: t, rootNodes: u });
}
function q2(e, t) {
	let u = Ja(t),
		{ rootNodes: n, errors: r } = Au(e, u);
	if (n.some((o) => (o.kind === 'docType' && o.value === 'html') || (o.kind === 'element' && o.name.toLowerCase() === 'html'))) return Za(e, an);
	let a,
		i = () => a ?? (a = Au(e, { ...u, getTagContentType: void 0 })),
		s = (o) => {
			let { offset: l } = o.startSourceSpan.start;
			return i().rootNodes.find((h) => h.kind === 'element' && h.startSourceSpan.start.offset === l) ?? o;
		};
	for (let [o, l] of n.entries())
		if (l.kind === 'element') {
			if (l.isVoid) ((r = i().errors), (n[o] = s(l)));
			else if (F2(l)) {
				let { endSourceSpan: h, startSourceSpan: x } = l,
					_ = i().errors.find((m) => m.span.start.offset > x.start.offset && m.span.start.offset < h.end.offset);
				(_ && Nu(_), (n[o] = s(l)));
			}
		}
	return (r.length > 0 && Nu(r[0]), { parseOptions: t, rootNodes: n });
}
function F2(e) {
	if (e.kind !== 'element' || e.name !== 'template') return !1;
	let t = e.attrs.find((u) => u.name === 'lang')?.value;
	return !t || t === 'html';
}
function Nu(e) {
	let {
		msg: t,
		span: { start: u, end: n }
	} = e;
	throw b2(t, { loc: { start: { line: u.line + 1, column: u.col + 1 }, end: { line: n.line + 1, column: n.col + 1 } }, cause: e });
}
function M2(e, t, u, n, r, a) {
	let { offset: i } = n,
		s = $(0, t.slice(0, i), /[^\n]/gu, ' ') + u,
		o = ei(s, e, { ...r, shouldParseFrontMatter: !1 }, a);
	o.sourceSpan = new v(n, He(0, o.children, -1).sourceSpan.end);
	let l = o.children[0];
	return (
		l.length === i ? o.children.shift() : ((l.sourceSpan = new v(l.sourceSpan.start.moveBy(i), l.sourceSpan.end)), (l.value = l.value.slice(i))),
		o
	);
}
function ei(e, t, u, n = {}) {
	let { frontMatter: r, content: a } = u.shouldParseFrontMatter ? _l(e) : { content: e },
		i = new $a(e, n.filepath),
		s = new vu(i, 0, 0, 0),
		o = s.moveBy(e.length),
		{ parseOptions: l, rootNodes: h } = t(a, u),
		x = { kind: 'root', sourceSpan: new v(s, o), children: h },
		_;
	if (r) {
		let [m, b] = [r.start, r.end].map((T) => new vu(i, T.index, T.line - 1, T.column));
		_ = { ...r, kind: 'frontMatter', sourceSpan: new v(m, b) };
	}
	return N2(x, _, l, (m, b) => M2(t, e, m, b, l, n));
}
var an = Qa({ name: 'html', normalizeTagName: !0, normalizeAttributeName: !0, allowHtmComponentClosingTags: !0 });
function Et(e) {
	let t = Qa(e),
		u = t.name === 'vue' ? q2 : Za;
	return { parse: (n, r) => ei(n, u, t, r), hasPragma: Z0, hasIgnorePragma: ed, astFormat: 'html', locStart: bt, locEnd: zt };
}
var H2 = Et(an),
	V2 = new Set(['mj-style', 'mj-raw']),
	W2 = Et({ ...an, name: 'mjml', shouldParseAsRawText: (e) => V2.has(e) }),
	U2 = Et({ name: 'angular', tokenizeAngularBlocks: !0, tokenizeAngularLetDeclaration: !0 }),
	$2 = Et({
		name: 'vue',
		isTagNameCaseSensitive: !0,
		shouldParseAsRawText(e, t, u, n) {
			return (
				e.toLowerCase() !== 'html' &&
				!u &&
				(e !== 'template' || n.some(({ name: r, value: a }) => r === 'lang' && a !== 'html' && a !== '' && a !== void 0))
			);
		}
	}),
	j2 = Et({ name: 'lwc', canSelfClose: !1 }),
	ti = { html: p2 };
const z2 = Object.freeze(
	Object.defineProperty({ __proto__: null, default: ra, languages: Ya, options: Ka, parsers: rn, printers: ti }, Symbol.toStringTag, {
		value: 'Module'
	})
);
var lu = { exports: {} },
	Je = {};
var mr;
function G2() {
	if (mr) return Je;
	mr = 1;
	var e = Symbol.for('react.transitional.element'),
		t = Symbol.for('react.fragment');
	function u(n, r, a) {
		var i = null;
		if ((a !== void 0 && (i = '' + a), r.key !== void 0 && (i = '' + r.key), 'key' in r)) {
			a = {};
			for (var s in r) s !== 'key' && (a[s] = r[s]);
		} else a = r;
		return ((r = a.ref), { $$typeof: e, type: n, key: i, ref: r !== void 0 ? r : null, props: a });
	}
	return ((Je.Fragment = t), (Je.jsx = u), (Je.jsxs = u), Je);
}
var gr;
function X2() {
	return (gr || ((gr = 1), (lu.exports = G2())), lu.exports);
}
var Y2 = X2();
function ge(e, t) {
	if (Array.isArray(e)) return e.map((u) => ge(u, t));
	if (typeof e == 'object') {
		if (e.type === 'group') return { ...e, contents: ge(e.contents, t), expandedStates: ge(e.expandedStates, t) };
		if ('contents' in e) return { ...e, contents: ge(e.contents, t) };
		if ('parts' in e) return { ...e, parts: ge(e.parts, t) };
		if (e.type === 'if-break') return { ...e, breakContents: ge(e.breakContents, t), flatContents: ge(e.flatContents, t) };
	}
	return t(e);
}
const Pt = { ...z2 };
if (Pt.printers) {
	const e = Pt.printers.html.print;
	Pt.printers.html.print = (t, u, n, r) => {
		const a = t.getNode(),
			i = e(t, u, n, r);
		return a.type === 'ieConditionalComment' ? ge(i, (s) => (typeof s == 'object' && s.type === 'line' ? (s.soft ? '' : ' ') : s)) : i;
	};
}
const K2 = { endOfLine: 'lf', tabWidth: 2, plugins: [Pt], bracketSameLine: !0, parser: 'html' },
	ui = (e, t = {}) => fi(e.replaceAll('\0', ''), { ...K2, ...t }),
	ni = [
		{ selector: 'img', format: 'skip' },
		{ selector: '[data-skip-in-text=true]', format: 'skip' },
		{ selector: 'a', options: { linkBrackets: !1, hideLinkHrefIfSameAsText: !0 } }
	];
function ri(e, t) {
	return pc(e, { selectors: ni, wordwrap: !1, ...t });
}
const Q2 = new TextDecoder('utf-8'),
	J2 = async (e) => {
		const t = [],
			u = new WritableStream({
				write(i) {
					t.push(i);
				},
				abort(i) {
					throw new Error('Stream aborted', { cause: { reason: i } });
				}
			});
		await e.pipeTo(u);
		let n = 0;
		t.forEach((i) => {
			n += i.length;
		});
		const r = new Uint8Array(n);
		let a = 0;
		return (
			t.forEach((i) => {
				(r.set(i, a), (a += i.length));
			}),
			Q2.decode(r)
		);
	},
	ai = async (e, t) => {
		const u = Y2.jsx(xc.Suspense, { children: e }),
			n = await hi(() => import('./BHzjV73l.js').then((i) => i.s), __vite__mapDeps([0, 1]), import.meta.url).then((i) => i.default),
			r = await new Promise((i, s) => {
				n.renderToReadableStream(u, {
					onError(o) {
						s(o);
					},
					progressiveChunkSize: Number.POSITIVE_INFINITY
				})
					.then(J2)
					.then(i)
					.catch(s);
			});
		if (t?.plainText) return ri(r, t.htmlToTextOptions);
		const a = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">${r.replace(/<!DOCTYPE.*?>/, '')}`;
		return t?.pretty ? ui(a) : a;
	},
	Z2 = (e, t) => ai(e, t),
	uh = Object.freeze(
		Object.defineProperty({ __proto__: null, plainTextSelectors: ni, pretty: ui, render: ai, renderAsync: Z2, toPlainText: ri }, Symbol.toStringTag, {
			value: 'Module'
		})
	);
export { uh as i, bc as r };
//# sourceMappingURL=u0iZkHbG.js.map
