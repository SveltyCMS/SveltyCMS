let m;
function g(s) {
	return {
		lang: s?.lang ?? m?.lang,
		message: s?.message,
		abortEarly: s?.abortEarly ?? m?.abortEarly,
		abortPipeEarly: s?.abortPipeEarly ?? m?.abortPipeEarly
	};
}
let d;
function E(s) {
	return d?.get(s);
}
let j;
function _(s) {
	return j?.get(s);
}
let D;
function O(s, n) {
	return D?.get(s)?.get(n);
}
function h(s) {
	const n = typeof s;
	return n === 'string'
		? `"${s}"`
		: n === 'number' || n === 'bigint' || n === 'boolean'
			? `${s}`
			: n === 'object' || n === 'function'
				? ((s && Object.getPrototypeOf(s)?.constructor?.name) ?? 'null')
				: n;
}
function o(s, n, e, r, u) {
	const t = u && 'input' in u ? u.input : e.value,
		i = u?.expected ?? s.expects ?? null,
		f = u?.received ?? h(t),
		l = {
			kind: s.kind,
			type: s.type,
			input: t,
			expected: i,
			received: f,
			message: `Invalid ${n}: ${i ? `Expected ${i} but r` : 'R'}eceived ${f}`,
			requirement: s.requirement,
			path: u?.path,
			issues: u?.issues,
			lang: r.lang,
			abortEarly: r.abortEarly,
			abortPipeEarly: r.abortPipeEarly
		},
		a = s.kind === 'schema',
		c = u?.message ?? s.message ?? O(s.reference, l.lang) ?? (a ? _(l.lang) : null) ?? r.message ?? E(l.lang);
	(c !== void 0 && (l.message = typeof c == 'function' ? c(l) : c), a && (e.typed = !1), e.issues ? e.issues.push(l) : (e.issues = [l]));
}
function p(s) {
	return {
		version: 1,
		vendor: 'valibot',
		validate(n) {
			return s['~run']({ value: n }, g());
		}
	};
}
function I(s, n) {
	return Object.hasOwn(s, n) && n !== '__proto__' && n !== 'prototype' && n !== 'constructor';
}
function k(s, n) {
	const e = [...new Set(s)];
	return e.length > 1 ? `(${e.join(` ${n} `)})` : (e[0] ?? 'never');
}
function P(s) {
	if (s.path) {
		let n = '';
		for (const e of s.path)
			if (typeof e.key == 'string' || typeof e.key == 'number') n ? (n += `.${e.key}`) : (n += e.key);
			else return null;
		return n;
	}
	return null;
}
var S = class extends Error {
	constructor(s) {
		(super(s[0].message), (this.name = 'ValiError'), (this.issues = s));
	}
};
const w = /^[\w+-]+(?:\.[\w+-]+)*@[\da-z]+(?:[.-][\da-z]+)*\.[a-z]{2,}$/iu,
	q = /^\d{4}-(?:0[1-9]|1[0-2])-(?:[12]\d|0[1-9]|3[01])$/u;
function V(s, n) {
	return {
		kind: 'validation',
		type: 'check',
		reference: V,
		async: !1,
		expects: null,
		requirement: s,
		message: n,
		'~run'(e, r) {
			return (e.typed && !this.requirement(e.value) && o(this, 'input', e, r), e);
		}
	};
}
function A(s) {
	return {
		kind: 'validation',
		type: 'email',
		reference: A,
		expects: null,
		async: !1,
		requirement: w,
		message: s,
		'~run'(n, e) {
			return (n.typed && !this.requirement.test(n.value) && o(this, 'email', n, e), n);
		}
	};
}
function N(s) {
	return {
		kind: 'validation',
		type: 'iso_date',
		reference: N,
		async: !1,
		expects: null,
		requirement: q,
		message: s,
		'~run'(n, e) {
			return (n.typed && !this.requirement.test(n.value) && o(this, 'date', n, e), n);
		}
	};
}
function L(s, n) {
	return {
		kind: 'validation',
		type: 'max_length',
		reference: L,
		async: !1,
		expects: `<=${s}`,
		requirement: s,
		message: n,
		'~run'(e, r) {
			return (e.typed && e.value.length > this.requirement && o(this, 'length', e, r, { received: `${e.value.length}` }), e);
		}
	};
}
function M(s, n) {
	return {
		kind: 'validation',
		type: 'max_value',
		reference: M,
		async: !1,
		expects: `<=${s instanceof Date ? s.toJSON() : h(s)}`,
		requirement: s,
		message: n,
		'~run'(e, r) {
			return (
				e.typed && !(e.value <= this.requirement) && o(this, 'value', e, r, { received: e.value instanceof Date ? e.value.toJSON() : h(e.value) }),
				e
			);
		}
	};
}
function R(s, n) {
	return {
		kind: 'validation',
		type: 'min_length',
		reference: R,
		async: !1,
		expects: `>=${s}`,
		requirement: s,
		message: n,
		'~run'(e, r) {
			return (e.typed && e.value.length < this.requirement && o(this, 'length', e, r, { received: `${e.value.length}` }), e);
		}
	};
}
function z(s, n) {
	return {
		kind: 'validation',
		type: 'min_value',
		reference: z,
		async: !1,
		expects: `>=${s instanceof Date ? s.toJSON() : h(s)}`,
		requirement: s,
		message: n,
		'~run'(e, r) {
			return (
				e.typed && !(e.value >= this.requirement) && o(this, 'value', e, r, { received: e.value instanceof Date ? e.value.toJSON() : h(e.value) }),
				e
			);
		}
	};
}
function G(s, n) {
	if (s.issues)
		for (const e of n)
			for (const r of s.issues) {
				let u = !1;
				const t = Math.min(e.length, r.path?.length ?? 0);
				for (let i = 0; i < t; i++)
					if (e[i] !== r.path[i].key && (e[i] !== '$' || r.path[i].type !== 'array')) {
						u = !0;
						break;
					}
				if (!u) return !1;
			}
	return !0;
}
function J(s, n, e) {
	return {
		kind: 'validation',
		type: 'partial_check',
		reference: J,
		async: !1,
		expects: null,
		paths: s,
		requirement: n,
		message: e,
		'~run'(r, u) {
			return ((r.typed || G(r, s)) && !this.requirement(r.value) && o(this, 'input', r, u), r);
		}
	};
}
function C(s, n) {
	return {
		kind: 'validation',
		type: 'regex',
		reference: C,
		async: !1,
		expects: `${s}`,
		requirement: s,
		message: n,
		'~run'(e, r) {
			return (e.typed && !this.requirement.test(e.value) && o(this, 'format', e, r), e);
		}
	};
}
function K(s) {
	return {
		kind: 'transformation',
		type: 'transform',
		reference: K,
		async: !1,
		operation: s,
		'~run'(n) {
			return ((n.value = this.operation(n.value)), n);
		}
	};
}
function T() {
	return {
		kind: 'transformation',
		type: 'trim',
		reference: T,
		async: !1,
		'~run'(s) {
			return ((s.value = s.value.trim()), s);
		}
	};
}
function U(s) {
	return {
		kind: 'validation',
		type: 'url',
		reference: U,
		async: !1,
		expects: null,
		requirement(n) {
			try {
				return (new URL(n), !0);
			} catch {
				return !1;
			}
		},
		message: s,
		'~run'(n, e) {
			return (n.typed && !this.requirement(n.value) && o(this, 'URL', n, e), n);
		}
	};
}
function x(s, n, e) {
	return typeof s.fallback == 'function' ? s.fallback(n, e) : s.fallback;
}
function ie(s) {
	const n = {};
	for (const e of s)
		if (e.path) {
			const r = P(e);
			r
				? (n.nested || (n.nested = {}), n.nested[r] ? n.nested[r].push(e.message) : (n.nested[r] = [e.message]))
				: n.other
					? n.other.push(e.message)
					: (n.other = [e.message]);
		} else n.root ? n.root.push(e.message) : (n.root = [e.message]);
	return n;
}
function ue(s, n) {
	return {
		...s,
		'~run'(e, r) {
			const u = e.issues && [...e.issues];
			if (((e = s['~run'](e, r)), e.issues)) {
				for (const t of e.issues)
					if (!u?.includes(t)) {
						let i = e.value;
						for (const f of n) {
							const l = i[f],
								a = { type: 'unknown', origin: 'value', input: i, key: f, value: l };
							if ((t.path ? t.path.push(a) : (t.path = [a]), !l)) break;
							i = l;
						}
					}
			}
			return e;
		}
	};
}
function v(s, n, e) {
	return typeof s.default == 'function' ? s.default(n, e) : s.default;
}
function X(s, n) {
	return {
		kind: 'schema',
		type: 'array',
		reference: X,
		expects: 'Array',
		async: !1,
		item: s,
		message: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			const u = e.value;
			if (Array.isArray(u)) {
				((e.typed = !0), (e.value = []));
				for (let t = 0; t < u.length; t++) {
					const i = u[t],
						f = this.item['~run']({ value: i }, r);
					if (f.issues) {
						const l = { type: 'array', origin: 'value', input: u, key: t, value: i };
						for (const a of f.issues) (a.path ? a.path.unshift(l) : (a.path = [l]), e.issues?.push(a));
						if ((e.issues || (e.issues = f.issues), r.abortEarly)) {
							e.typed = !1;
							break;
						}
					}
					(f.typed || (e.typed = !1), e.value.push(f.value));
				}
			} else o(this, 'type', e, r);
			return e;
		}
	};
}
function B(s) {
	return {
		kind: 'schema',
		type: 'boolean',
		reference: B,
		expects: 'boolean',
		async: !1,
		message: s,
		get '~standard'() {
			return p(this);
		},
		'~run'(n, e) {
			return (typeof n.value == 'boolean' ? (n.typed = !0) : o(this, 'type', n, e), n);
		}
	};
}
function F(s, n) {
	return {
		kind: 'schema',
		type: 'custom',
		reference: F,
		expects: 'unknown',
		async: !1,
		check: s,
		message: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			return (this.check(e.value) ? (e.typed = !0) : o(this, 'type', e, r), e);
		}
	};
}
function $(s, n) {
	return {
		kind: 'schema',
		type: 'instance',
		reference: $,
		expects: s.name,
		async: !1,
		class: s,
		message: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			return (e.value instanceof this.class ? (e.typed = !0) : o(this, 'type', e, r), e);
		}
	};
}
function H(s, n) {
	return {
		kind: 'schema',
		type: 'literal',
		reference: H,
		expects: h(s),
		async: !1,
		literal: s,
		message: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			return (e.value === this.literal ? (e.typed = !0) : o(this, 'type', e, r), e);
		}
	};
}
function Q(s, n) {
	return {
		kind: 'schema',
		type: 'nullable',
		reference: Q,
		expects: `(${s.expects} | null)`,
		async: !1,
		wrapped: s,
		default: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			return e.value === null && (this.default !== void 0 && (e.value = v(this, e, r)), e.value === null)
				? ((e.typed = !0), e)
				: this.wrapped['~run'](e, r);
		}
	};
}
function W(s) {
	return {
		kind: 'schema',
		type: 'number',
		reference: W,
		expects: 'number',
		async: !1,
		message: s,
		get '~standard'() {
			return p(this);
		},
		'~run'(n, e) {
			return (typeof n.value == 'number' && !isNaN(n.value) ? (n.typed = !0) : o(this, 'type', n, e), n);
		}
	};
}
function Y(s, n) {
	return {
		kind: 'schema',
		type: 'object',
		reference: Y,
		expects: 'Object',
		async: !1,
		entries: s,
		message: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			const u = e.value;
			if (u && typeof u == 'object') {
				((e.typed = !0), (e.value = {}));
				for (const t in this.entries) {
					const i = this.entries[t];
					if (t in u || ((i.type === 'exact_optional' || i.type === 'optional' || i.type === 'nullish') && i.default !== void 0)) {
						const f = t in u ? u[t] : v(i),
							l = i['~run']({ value: f }, r);
						if (l.issues) {
							const a = { type: 'object', origin: 'value', input: u, key: t, value: f };
							for (const c of l.issues) (c.path ? c.path.unshift(a) : (c.path = [a]), e.issues?.push(c));
							if ((e.issues || (e.issues = l.issues), r.abortEarly)) {
								e.typed = !1;
								break;
							}
						}
						(l.typed || (e.typed = !1), (e.value[t] = l.value));
					} else if (i.fallback !== void 0) e.value[t] = x(i);
					else if (
						i.type !== 'exact_optional' &&
						i.type !== 'optional' &&
						i.type !== 'nullish' &&
						(o(this, 'key', e, r, { input: void 0, expected: `"${t}"`, path: [{ type: 'object', origin: 'key', input: u, key: t, value: u[t] }] }),
						r.abortEarly)
					)
						break;
				}
			} else o(this, 'type', e, r);
			return e;
		}
	};
}
function Z(s, n) {
	return {
		kind: 'schema',
		type: 'optional',
		reference: Z,
		expects: `(${s.expects} | undefined)`,
		async: !1,
		wrapped: s,
		default: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			return e.value === void 0 && (this.default !== void 0 && (e.value = v(this, e, r)), e.value === void 0)
				? ((e.typed = !0), e)
				: this.wrapped['~run'](e, r);
		}
	};
}
function ee(s, n) {
	return {
		kind: 'schema',
		type: 'picklist',
		reference: ee,
		expects: k(s.map(h), '|'),
		async: !1,
		options: s,
		message: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			return (this.options.includes(e.value) ? (e.typed = !0) : o(this, 'type', e, r), e);
		}
	};
}
function ne(s, n, e) {
	return {
		kind: 'schema',
		type: 'record',
		reference: ne,
		expects: 'Object',
		async: !1,
		key: s,
		value: n,
		message: e,
		get '~standard'() {
			return p(this);
		},
		'~run'(r, u) {
			const t = r.value;
			if (t && typeof t == 'object') {
				((r.typed = !0), (r.value = {}));
				for (const i in t)
					if (I(t, i)) {
						const f = t[i],
							l = this.key['~run']({ value: i }, u);
						if (l.issues) {
							const c = { type: 'object', origin: 'key', input: t, key: i, value: f };
							for (const y of l.issues) ((y.path = [c]), r.issues?.push(y));
							if ((r.issues || (r.issues = l.issues), u.abortEarly)) {
								r.typed = !1;
								break;
							}
						}
						const a = this.value['~run']({ value: f }, u);
						if (a.issues) {
							const c = { type: 'object', origin: 'value', input: t, key: i, value: f };
							for (const y of a.issues) (y.path ? y.path.unshift(c) : (y.path = [c]), r.issues?.push(y));
							if ((r.issues || (r.issues = a.issues), u.abortEarly)) {
								r.typed = !1;
								break;
							}
						}
						((!l.typed || !a.typed) && (r.typed = !1), l.typed && (r.value[l.value] = a.value));
					}
			} else o(this, 'type', r, u);
			return r;
		}
	};
}
function se(s, n) {
	return {
		kind: 'schema',
		type: 'strict_object',
		reference: se,
		expects: 'Object',
		async: !1,
		entries: s,
		message: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			const u = e.value;
			if (u && typeof u == 'object') {
				((e.typed = !0), (e.value = {}));
				for (const t in this.entries) {
					const i = this.entries[t];
					if (t in u || ((i.type === 'exact_optional' || i.type === 'optional' || i.type === 'nullish') && i.default !== void 0)) {
						const f = t in u ? u[t] : v(i),
							l = i['~run']({ value: f }, r);
						if (l.issues) {
							const a = { type: 'object', origin: 'value', input: u, key: t, value: f };
							for (const c of l.issues) (c.path ? c.path.unshift(a) : (c.path = [a]), e.issues?.push(c));
							if ((e.issues || (e.issues = l.issues), r.abortEarly)) {
								e.typed = !1;
								break;
							}
						}
						(l.typed || (e.typed = !1), (e.value[t] = l.value));
					} else if (i.fallback !== void 0) e.value[t] = x(i);
					else if (
						i.type !== 'exact_optional' &&
						i.type !== 'optional' &&
						i.type !== 'nullish' &&
						(o(this, 'key', e, r, { input: void 0, expected: `"${t}"`, path: [{ type: 'object', origin: 'key', input: u, key: t, value: u[t] }] }),
						r.abortEarly)
					)
						break;
				}
				if (!e.issues || !r.abortEarly) {
					for (const t in u)
						if (!(t in this.entries)) {
							o(this, 'key', e, r, { input: t, expected: 'never', path: [{ type: 'object', origin: 'key', input: u, key: t, value: u[t] }] });
							break;
						}
				}
			} else o(this, 'type', e, r);
			return e;
		}
	};
}
function re(s) {
	return {
		kind: 'schema',
		type: 'string',
		reference: re,
		expects: 'string',
		async: !1,
		message: s,
		get '~standard'() {
			return p(this);
		},
		'~run'(n, e) {
			return (typeof n.value == 'string' ? (n.typed = !0) : o(this, 'type', n, e), n);
		}
	};
}
function b(s) {
	let n;
	if (s) for (const e of s) n ? n.push(...e.issues) : (n = e.issues);
	return n;
}
function te(s, n) {
	return {
		kind: 'schema',
		type: 'union',
		reference: te,
		expects: k(
			s.map((e) => e.expects),
			'|'
		),
		async: !1,
		options: s,
		message: n,
		get '~standard'() {
			return p(this);
		},
		'~run'(e, r) {
			let u, t, i;
			for (const f of this.options) {
				const l = f['~run']({ value: e.value }, r);
				if (l.typed)
					if (l.issues) t ? t.push(l) : (t = [l]);
					else {
						u = l;
						break;
					}
				else i ? i.push(l) : (i = [l]);
			}
			if (u) return u;
			if (t) {
				if (t.length === 1) return t[0];
				(o(this, 'type', e, r, { issues: b(t) }), (e.typed = !0));
			} else {
				if (i?.length === 1) return i[0];
				o(this, 'type', e, r, { issues: b(i) });
			}
			return e;
		}
	};
}
function le(s, n, e) {
	const r = s['~run']({ value: n }, g(e));
	if (r.issues) throw new S(r.issues);
	return r.value;
}
function oe(...s) {
	return {
		...s[0],
		pipe: s,
		get '~standard'() {
			return p(this);
		},
		'~run'(n, e) {
			for (const r of s)
				if (r.kind !== 'metadata') {
					if (n.issues && (r.kind === 'schema' || r.kind === 'transformation')) {
						n.typed = !1;
						break;
					}
					(!n.issues || (!e.abortEarly && !e.abortPipeEarly)) && (n = r['~run'](n, e));
				}
			return n;
		}
	};
}
function fe(s, n, e) {
	const r = s['~run']({ value: n }, g(e));
	return { typed: r.typed, success: !r.issues, output: r.value, issues: r.issues };
}
export {
	H as A,
	te as B,
	F as C,
	U as D,
	$ as E,
	oe as a,
	z as b,
	M as c,
	fe as d,
	A as e,
	ie as f,
	se as g,
	Y as h,
	ue as i,
	V as j,
	Q as k,
	T as l,
	R as m,
	W as n,
	Z as o,
	le as p,
	L as q,
	C as r,
	re as s,
	K as t,
	ee as u,
	B as v,
	J as w,
	N as x,
	ne as y,
	X as z
};
//# sourceMappingURL=Bg__saH3.js.map
